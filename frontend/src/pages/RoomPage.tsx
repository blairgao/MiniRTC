import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { CallControls } from '../components/CallControls'
import { ConnectionStatus } from '../components/ConnectionStatus'
import { ErrorBanner } from '../components/ErrorBanner'
import { VideoGrid } from '../components/VideoGrid'
import { useSignaling } from '../hooks/useSignaling'
import { useWebRTC } from '../hooks/useWebRTC'

export function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()

  const { sendMessage, lastMessage, signalingState, disconnect } = useSignaling(roomId!)
  const { localStream, remoteStream, callState, error, toggleAudio, toggleVideo, leave } =
    useWebRTC({ sendMessage, lastMessage })

  useEffect(() => {
    if (
      lastMessage?.type === 'room_not_found' ||
      lastMessage?.type === 'room_expired' ||
      lastMessage?.type === 'peer_left'
    ) {
      setTimeout(() => navigate('/'), 2500)
    }
  }, [lastMessage, navigate])

  const handleLeave = () => {
    sendMessage({ type: 'leave' })
    leave()
    disconnect()
    navigate('/')
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        padding: 12,
        boxSizing: 'border-box',
        fontFamily: 'system-ui, sans-serif',
        background: '#09090b',
        color: '#f4f4f5',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 13, color: '#71717a' }}>Room: {roomId}</span>
        <ConnectionStatus signalingState={signalingState} callState={callState} />
      </div>

      {error && <ErrorBanner message={error} />}

      <VideoGrid localStream={localStream} remoteStream={remoteStream} />

      <CallControls
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        onLeave={handleLeave}
      />
    </div>
  )
}
