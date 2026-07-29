/**
 * Browser-side contract for a production LiveKit connection.
 *
 * The reception dashboard deliberately asks its own API for a short-lived token;
 * API keys and service secrets must never be included in the web bundle.
 */
export type RoomCredentials = {
  url: string
  token: string
  roomName: string
}

export async function createReceptionCall(customerName: string): Promise<RoomCredentials> {
  const response = await fetch('/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerName, role: 'customer' }),
  })

  if (!response.ok) throw new Error('Unable to create a secure call room')
  return response.json() as Promise<RoomCredentials>
}

export async function joinAsStaff(roomName: string): Promise<RoomCredentials> {
  const response = await fetch('/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomName, role: 'staff' }),
  })

  if (!response.ok) throw new Error('Unable to join the live call')
  return response.json() as Promise<RoomCredentials>
}
