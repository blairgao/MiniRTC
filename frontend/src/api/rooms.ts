import { API_BASE } from '../config'

export interface RoomCreateResponse {
  room_id: string
  url: string
  expires_at: string
}

export async function createRoom(): Promise<RoomCreateResponse> {
  const res = await fetch(`${API_BASE}/api/rooms`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to create room')
  return res.json()
}
