import { useState } from 'react'

interface Props {
  onToggleAudio: () => void
  onToggleVideo: () => void
  onLeave: () => void
}

const btn: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 500,
}

export function CallControls({ onToggleAudio, onToggleVideo, onLeave }: Props) {
  const [audioOn, setAudioOn] = useState(true)
  const [videoOn, setVideoOn] = useState(true)

  const handleAudio = () => {
    setAudioOn((v) => !v)
    onToggleAudio()
  }

  const handleVideo = () => {
    setVideoOn((v) => !v)
    onToggleVideo()
  }

  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', padding: '14px 0' }}>
      <button onClick={handleAudio} style={{ ...btn, background: audioOn ? '#3f3f46' : '#ef4444', color: '#fff' }}>
        {audioOn ? 'Mute' : 'Unmute'}
      </button>
      <button onClick={handleVideo} style={{ ...btn, background: videoOn ? '#3f3f46' : '#ef4444', color: '#fff' }}>
        {videoOn ? 'Cam Off' : 'Cam On'}
      </button>
      <button onClick={onLeave} style={{ ...btn, background: '#dc2626', color: '#fff' }}>
        Leave
      </button>
    </div>
  )
}
