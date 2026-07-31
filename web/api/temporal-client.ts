import { Client, Connection } from '@temporalio/client'

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required.`)
  return value
}

export async function createTemporalClient() {
  const connection = await Connection.connect({
    address: required('TEMPORAL_ADDRESS'),
    tls: true,
    apiKey: required('TEMPORAL_API_KEY'),
  })
  return new Client({ connection, namespace: required('TEMPORAL_NAMESPACE') })
}

export function temporalTaskQueue() {
  return process.env.TEMPORAL_TASK_QUEUE ?? 'auto-receptionist'
}
