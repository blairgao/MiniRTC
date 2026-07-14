import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import type { RoomStatus } from '../api/rooms'
import { WS_BASE } from '../config'

function minutesLeft(expiresAt: string): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000))
}

export function RoomsPage() {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState<RoomStatus[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let unmounted = false
    let retries = 0
    let ws: WebSocket | null = null
    let timer: number | undefined

    const connect = () => {
      ws = new WebSocket(`${WS_BASE}/ws/lobby`)

      ws.onopen = () => {
        retries = 0
        setError('')
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'rooms') setRooms(msg.rooms)
        } catch { /* ignore malformed frames */ }
      }

      ws.onclose = () => {
        if (unmounted) return
        if (retries < 3) {
          retries++
          timer = window.setTimeout(connect, Math.pow(2, retries) * 500)
        } else {
          setError('Lost connection to the lobby — is the backend running?')
        }
      }

      ws.onerror = () => ws?.close()
    }

    connect()
    return () => {
      unmounted = true
      window.clearTimeout(timer)
      ws?.close()
    }
  }, [])

  return (
    <div
      style={{
        maxWidth: 480,
        margin: '80px auto',
        padding: 32,
        fontFamily: 'system-ui, sans-serif',
        color: '#18181b',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 4,
        }}
      >
        <h1 style={{ margin: 0 }}>Open Rooms</h1>
        <Link to="/" style={{ fontSize: 14, color: '#71717a' }}>
          ← Home
        </Link>
      </div>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: '#a1a1aa' }}>
        Updates live. Only rooms with an open seat are shown; rooms expire 1 hour
        after creation.
      </p>

      {error && (
        <p style={{ color: '#dc2626', marginBottom: 16, fontSize: 14 }}>{error}</p>
      )}

      {rooms === null && !error && (
        <p style={{ color: '#71717a', fontSize: 14 }}>Loading…</p>
      )}

      {rooms !== null && rooms.length === 0 && (
        <p style={{ color: '#71717a', fontSize: 14 }}>
          No joinable rooms. <Link to="/" style={{ color: '#18181b' }}>Create one</Link>.
        </p>
      )}

      {rooms !== null &&
        rooms.map((room) => (
          <div
            key={room.room_id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '12px 16px',
              border: '1px solid #e4e4e7',
              borderRadius: 8,
              marginBottom: 10,
            }}
          >
            <div>
              <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 15 }}>
                {room.room_id}
              </div>
              <div style={{ fontSize: 13, color: '#71717a', marginTop: 2 }}>
                {room.participant_count} / 2 users · expires in {minutesLeft(room.expires_at)} min
              </div>
            </div>
            <button
              onClick={() => navigate(`/room/${room.room_id}`)}
              style={{
                padding: '8px 16px',
                background: '#18181b',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Join
            </button>
          </div>
        ))}
    </div>
  )
}
