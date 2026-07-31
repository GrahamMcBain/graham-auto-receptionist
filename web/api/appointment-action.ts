import { requireAgentSecret } from './temporal-auth'
import { createTemporalClient } from './temporal-client'

const signals = { confirm: 'confirmAppointment', cancel: 'cancelAppointment' } as const

type Response = {
  setHeader: (name: string, value: string) => void
  status: (statusCode: number) => Response
  json: (body: unknown) => void
}

export default async function handler(
  request: {
    method?: string
    headers?: Record<string, string | string[] | undefined>
    body?: { workflowId?: unknown; action?: unknown }
  },
  response: Response,
) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }
  if (!requireAgentSecret(request, response)) return

  const { workflowId, action } = request.body ?? {}
  if (typeof workflowId !== 'string' || (action !== 'confirm' && action !== 'cancel')) {
    response.status(400).json({ error: 'workflowId and a valid action are required.' })
    return
  }

  try {
    const client = await createTemporalClient()
    await client.workflow.getHandle(workflowId).signal(signals[action])
    response.status(202).json({ workflowId, action })
  } catch (error) {
    console.error('Unable to signal appointment workflow', error)
    response.status(500).json({ error: 'Unable to update booking.' })
  }
}
