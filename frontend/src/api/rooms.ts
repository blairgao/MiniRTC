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

export async function createRoom(): Promise<RoomCreateResponse> {
  const res = await fetch(`${API_BASE}/api/rooms`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to create room')
  return res.json()
}

export async function listRooms(): Promise<RoomListResponse> {
  const res = await fetch(`${API_BASE}/api/rooms`)
  if (!res.ok) throw new Error('Failed to list rooms')
  return res.json()
}
