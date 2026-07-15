import { API_BASE } from '../config'

export interface RoomCreateResponse {
  room_id: string
  url: string
  expires_at: string
}

export interface RoomStatus {
  room_id: string
  status: 'waiting' | 'active'
  participant_count: number
  expires_at: string
}

export interface RoomListResponse {
  rooms: RoomStatus[]
}

export async function createRoom(name?: string): Promise<RoomCreateResponse> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/rooms`, {
      method: 'POST',
      ...(name
        ? {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          }
        : {}),
    })
  } catch {
    throw new Error('Failed to create room — is the backend running?')
  }
  if (!res.ok) {
    let detail = 'Failed to create room'
    try {
      const data = await res.json()
      // FastAPI: string for our HTTPExceptions, array for validation errors.
      if (typeof data.detail === 'string') detail = data.detail
      else if (Array.isArray(data.detail)) detail = 'Invalid room name'
    } catch { /* keep default message */ }
    throw new Error(detail)
  }
  return res.json()
}

export async function listRooms(): Promise<RoomListResponse> {
  const res = await fetch(`${API_BASE}/api/rooms`)
  if (!res.ok) throw new Error('Failed to list rooms')
  return res.json()
}
