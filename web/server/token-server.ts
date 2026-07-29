import { RoomAgentDispatch, RoomConfiguration } from '@livekit/protocol'
import { AccessToken } from 'livekit-server-sdk'
import dotenv from 'dotenv'
import express from 'express'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'

// In local development, reuse the private LiveKit credentials from the sibling
// agent project. A deployed token service must receive these as its own secrets.
const agentEnvPath = process.env.TOKEN_SERVICE_ENV_FILE ?? path.resolve(process.cwd(), '../../graham-auto-receptionist-agent/.env.local')
if (existsSync(agentEnvPath)) dotenv.config({ path: agentEnvPath })
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true })

const port = Number(process.env.TOKEN_API_PORT ?? 3001)
const livekitUrl = process.env.LIVEKIT_URL
const apiKey = process.env.LIVEKIT_API_KEY
const apiSecret = process.env.LIVEKIT_API_SECRET
const agentName = process.env.LIVEKIT_AGENT_NAME ?? 'graham-auto-receptionist-agent'

if (!livekitUrl || !apiKey || !apiSecret) {
  throw new Error('LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET are required to issue room tokens.')
}

type TokenRequest = {
  customerName?: string
  roomName?: string
  role: 'customer' | 'staff'
}

function cleanName(value: string | undefined, fallback: string) {
  const name = (value ?? fallback).replace(/[^a-zA-Z0-9 _-]/g, '').trim()
  return name.slice(0, 60) || fallback
}

function createRoomName() {
  return `call-${randomUUID()}`
}

async function issueToken({ role, roomName, customerName }: TokenRequest) {
  const room = role === 'staff' && roomName ? cleanName(roomName, '') : createRoomName()
  if (!room) throw new Error('A room name is required for staff access.')

  const identityPrefix = role === 'staff' ? 'staff' : 'customer'
  const identity = `${identityPrefix}-${randomUUID()}`
  const participantName = cleanName(customerName, role === 'staff' ? 'Graham Auto staff' : 'Customer')
  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    name: participantName,
    ttl: '1h',
  })

  token.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  })

  if (role === 'customer') {
    token.roomConfig = new RoomConfiguration({
      agents: [new RoomAgentDispatch({ agentName })],
    })
  }

  return { url: livekitUrl, token: await token.toJwt(), roomName: room }
}

const app = express()
app.use(express.json())
app.use((_request, response, next) => {
  response.header('Access-Control-Allow-Origin', process.env.DASHBOARD_ORIGIN ?? 'http://127.0.0.1:5173')
  response.header('Access-Control-Allow-Headers', 'Content-Type')
  response.header('Access-Control-Allow-Methods', 'POST, OPTIONS')
  next()
})

app.options('/api/token', (_request, response) => response.sendStatus(204))
app.get('/health', (_request, response) => response.json({ status: 'ok' }))

app.post('/api/token', async (request, response) => {
  const body = request.body as Partial<TokenRequest>
  if (body.role !== 'customer' && body.role !== 'staff') {
    response.status(400).json({ error: 'role must be customer or staff' })
    return
  }

  try {
    response.json(await issueToken(body as TokenRequest))
  } catch (error) {
    console.error('Token issuance failed', error)
    response.status(400).json({ error: error instanceof Error ? error.message : 'Unable to issue room token' })
  }
})

app.listen(port, '127.0.0.1', () => {
  console.info(`Graham Auto token API listening on http://127.0.0.1:${port}`)
})
