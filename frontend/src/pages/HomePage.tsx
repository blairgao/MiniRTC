import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { createRoom } from '../api/rooms'

export function HomePage() {
  const navigate = useNavigate()
  const [joinId, setJoinId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    setLoading(true)
    setError('')
    try {
      const room = await createRoom()
      navigate(`/room/${room.room_id}`)
    } catch {
      setError('Failed to create room — is the backend running?')
      setLoading(false)
    }
  }

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault()
    const id = joinId.trim()
    if (id) navigate(`/room/${id}`)
  }

  return (
    <div
      style={{
        maxWidth: 420,
        margin: '80px auto',
        padding: 32,
        fontFamily: 'system-ui, sans-serif',
        color: '#18181b',
      }}
    >
      <h1 style={{ margin: '0 0 4px' }}>Blair's MiniRTC</h1>
      <p style={{ margin: '0 0 8px', color: '#71717a' }}>Hello world. Let's chat.</p>
      <p style={{ margin: '0 0 32px', fontSize: 13, color: '#a1a1aa', lineHeight: 1.5 }}>
        First load after idle may take up to 60 seconds while Render cold-starts the backend.
      </p>

      {error && (
        <p style={{ color: '#dc2626', marginBottom: 16, fontSize: 14 }}>{error}</p>
      )}

      <button
        onClick={handleCreate}
        disabled={loading}
        style={{
          width: '100%',
          padding: '12px 0',
          background: '#18181b',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 15,
          fontWeight: 500,
          cursor: loading ? 'wait' : 'pointer',
          marginBottom: 28,
        }}
      >
        {loading ? 'Creating…' : 'Create Room'}
      </button>

      <div style={{ borderTop: '1px solid #e4e4e7', paddingTop: 24 }}>
        <p style={{ margin: '0 0 10px', fontSize: 14, color: '#71717a', textAlign: 'center' }}>
          or join with a room ID
        </p>
        <form onSubmit={handleJoin} style={{ display: 'flex', gap: 8 }}>
          <input
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            placeholder="Room ID"
            style={{
              flex: 1,
              padding: '10px 12px',
              border: '1px solid #d4d4d8',
              borderRadius: 8,
              fontSize: 14,
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={!joinId.trim()}
            style={{
              padding: '10px 16px',
              background: '#3f3f46',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              cursor: joinId.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Join
          </button>
        </form>
      </div>
    </div>
  )
}
