import { randomUUID } from 'node:crypto'
import { requireAgentSecret } from './temporal-auth'
import { createTemporalClient, temporalTaskQueue } from './temporal-client'

type AppointmentRequest = {
  customerName: string
  email: string
  service: 'oil_change' | 'tire_rotation' | 'brake_inspection' | 'diagnostic'
  date: string
  requestedTime: string
}

type Response = {
  setHeader: (name: string, value: string) => void
  status: (statusCode: number) => Response
  json: (body: unknown) => void
}

function validBooking(value: unknown): value is AppointmentRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Record<string, unknown>
  return (
    typeof request.customerName === 'string' &&
    typeof request.email === 'string' &&
    typeof request.date === 'string' &&
    typeof request.requestedTime === 'string' &&
    ['oil_change', 'tire_rotation', 'brake_inspection', 'diagnostic'].includes(String(request.service))
  )
}

export default async function handler(
  request: { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown },
  response: Response,
) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }
  if (!requireAgentSecret(request, response)) return
  if (!validBooking(request.body)) {
    response.status(400).json({ error: 'Valid appointment details are required.' })
    return
  }

  try {
    const client = await createTemporalClient()
    const workflowId = `appointment-${randomUUID()}`
    await client.workflow.start('appointmentWorkflow', {
      taskQueue: temporalTaskQueue(),
      workflowId,
      args: [request.body],
    })
    response.status(202).json({ workflowId, status: 'pending' })
  } catch (error) {
    console.error('Unable to start appointment workflow', error)
    response.status(500).json({ error: 'Unable to start booking.' })
  }
}
