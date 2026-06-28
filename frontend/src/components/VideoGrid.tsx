import { useEffect, useRef } from 'react'

interface TileProps {
  stream: MediaStream | null
  muted?: boolean
  label: string
}

function VideoTile({ stream, muted, label }: TileProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
  }, [stream])

  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        minHeight: 200,
        background: '#18181b',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          transform: 'scaleX(-1)',
        }}
      />
      {!stream && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#71717a',
            fontSize: 14,
          }}
        >
          {label}
        </div>
      )}
      <span
        style={{
          position: 'absolute',
          bottom: 8,
          left: 10,
          fontSize: 12,
          color: '#e4e4e7',
          background: 'rgba(0,0,0,0.4)',
          padding: '2px 6px',
          borderRadius: 4,
        }}
      >
        {label}
      </span>
    </div>
  )
}

interface Props {
  localStream: MediaStream | null
  remoteStream: MediaStream | null
}

export function VideoGrid({ localStream, remoteStream }: Props) {
  return (
    <div style={{ display: 'flex', gap: 8, flex: 1 }}>
      <VideoTile stream={remoteStream} label="Friend" />
      <VideoTile stream={localStream} muted label="You" />
    </div>
  )
}
