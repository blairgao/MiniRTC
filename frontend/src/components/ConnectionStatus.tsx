import type { SignalingState } from '../hooks/useSignaling'
import type { CallState } from '../hooks/useWebRTC'

interface Props {
  signalingState: SignalingState
  callState: CallState
}

export function ConnectionStatus({ signalingState, callState }: Props) {
  const { label, color } = (() => {
    if (signalingState === 'error') return { label: 'Connection error', color: '#ef4444' }
    if (signalingState !== 'connected') return { label: 'Connecting…', color: '#f59e0b' }
    if (callState === 'waiting_for_peer') return { label: 'Waiting for peer…', color: '#f59e0b' }
    if (callState === 'negotiating') return { label: 'Starting call…', color: '#f59e0b' }
    if (callState === 'in_call') return { label: 'In Call', color: '#22c55e' }
    if (callState === 'ended') return { label: 'Call ended', color: '#ef4444' }
    return { label: 'Connecting…', color: '#f59e0b' }
  })()

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
      <span style={{ fontSize: 14, color }}>{label}</span>
    </div>
  )
}
