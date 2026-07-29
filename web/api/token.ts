import { RoomAgentDispatch, RoomConfiguration } from '@livekit/protocol'
import { AccessToken } from 'livekit-server-sdk'
import { randomUUID } from 'node:crypto'

type TokenRequest = {
  customerName?: string
  roomName?: string
  role: 'customer' | 'staff'
}

type VercelResponse = {
  setHeader: (name: string, value: string) => void
  status: (statusCode: number) => VercelResponse
  json: (body: unknown) => void
}

function cleanName(value: string | undefined, fallback: string) {
  const name = (value ?? fallback).replace(/[^a-zA-Z0-9 _-]/g, '').trim()
  return name.slice(0, 60) || fallback
}

function configuredEnvironment() {
  const url = process.env.LIVEKIT_URL
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  if (!url || !apiKey || !apiSecret) {
    throw new Error('The LiveKit environment variables are not configured.')
  }
  return { url, apiKey, apiSecret }
}

export default async function handler(
  request: { method?: string; body?: Partial<TokenRequest> },
  response: VercelResponse,
) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { role, roomName, customerName } = request.body ?? {}
  if (role !== 'customer' && role !== 'staff') {
    response.status(400).json({ error: 'role must be customer or staff' })
    return
  }

  try {
    const { url, apiKey, apiSecret } = configuredEnvironment()
    const room = role === 'staff' && roomName ? cleanName(roomName, '') : `call-${randomUUID()}`
    if (!room) throw new Error('A room name is required for staff access.')

    const token = new AccessToken(apiKey, apiSecret, {
      identity: `${role}-${randomUUID()}`,
      name: cleanName(customerName, role === 'staff' ? 'Graham Auto staff' : 'Customer'),
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
        agents: [
          new RoomAgentDispatch({
            agentName: process.env.LIVEKIT_AGENT_NAME ?? 'graham-auto-receptionist-agent',
          }),
        ],
      })
    }

    response.status(200).json({ url, token: await token.toJwt(), roomName: room })
  } catch (error) {
    console.error('Token issuance failed', error)
    response.status(500).json({ error: 'Unable to start a reception call.' })
  }
}
