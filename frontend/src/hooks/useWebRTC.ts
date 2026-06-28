import { useCallback, useEffect, useRef, useState } from 'react'

import type { ServerMessage, SignalMessage } from '../types/signaling'

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

export type CallState = 'idle' | 'waiting_for_peer' | 'negotiating' | 'in_call' | 'ended'

interface Props {
  sendMessage: (msg: SignalMessage) => void
  lastMessage: ServerMessage | null
}

export function useWebRTC({ sendMessage, lastMessage }: Props) {
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const roleRef = useRef<'host' | 'guest' | null>(null)
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([])
  const mediaPromiseRef = useRef<Promise<MediaStream> | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)

  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [callState, setCallState] = useState<CallState>('idle')
  const [error, setError] = useState<string | null>(null)

  const startMedia = useCallback((): Promise<MediaStream> => {
    if (mediaPromiseRef.current) return mediaPromiseRef.current
    const p = navigator.mediaDevices
      .getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      })
      .then((stream) => {
        localStreamRef.current = stream
        setLocalStream(stream)
        return stream
      })
      .catch((err) => {
        setError('Please allow camera/microphone access')
        throw err
      })
    mediaPromiseRef.current = p
    return p
  }, [])

  const buildPC = useCallback(
    (stream: MediaStream): RTCPeerConnection => {
      pcRef.current?.close()
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) sendMessage({ type: 'ice', candidate: candidate.toJSON() })
      }

      pc.ontrack = (e) => setRemoteStream(e.streams[0])

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setCallState('in_call')
          setError(null) // clear any transient signaling errors
        } else if (pc.connectionState === 'failed') {
          setCallState('ended')
          setError('Connection failed — check your network')
        }
      }

      pcRef.current = pc
      return pc
    },
    [sendMessage],
  )

  const flushCandidates = useCallback(async (pc: RTCPeerConnection) => {
    for (const c of pendingCandidatesRef.current) await pc.addIceCandidate(c)
    pendingCandidatesRef.current = []
  }, [])

  useEffect(() => {
    if (!lastMessage) return

    ;(async () => {
      try {
        switch (lastMessage.type) {
          case 'joined': {
            roleRef.current = lastMessage.role
            setCallState('waiting_for_peer')
            setError(null)
            startMedia() // kick off permission prompt early; don't block on it
            break
          }

          case 'peer_joined': {
            if (roleRef.current !== 'host') break
            setCallState('negotiating')
            const stream = await startMedia()
            const pc = buildPC(stream)
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            sendMessage({ type: 'offer', sdp: offer.sdp! })
            break
          }

          case 'offer': {
            if (roleRef.current !== 'guest') break
            setCallState('negotiating')
            const stream = await startMedia()
            const pc = buildPC(stream)
            await pc.setRemoteDescription({ type: 'offer', sdp: lastMessage.sdp })
            await flushCandidates(pc)
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            sendMessage({ type: 'answer', sdp: answer.sdp! })
            break
          }

          case 'answer': {
            const pc = pcRef.current
            if (!pc) break
            await pc.setRemoteDescription({ type: 'answer', sdp: lastMessage.sdp })
            await flushCandidates(pc)
            break
          }

          case 'ice': {
            const pc = pcRef.current
            if (!pc || !pc.remoteDescription) {
              pendingCandidatesRef.current.push(lastMessage.candidate)
            } else {
              await pc.addIceCandidate(lastMessage.candidate)
            }
            break
          }

          case 'peer_left':
            setCallState('ended')
            setError('Peer left the call')
            break

          case 'room_full':
            setError('This room is already in use')
            break

          case 'room_expired':
            setError('This room has expired')
            break

          case 'room_not_found':
            setError('Room not found or expired')
            break
        }
      } catch (e) {
        console.error('WebRTC error:', e)
      }
    })()
  }, [lastMessage, startMedia, buildPC, flushCandidates, sendMessage])

  // Stop camera/mic and close peer connection when the page unmounts,
  // regardless of whether the user clicked Leave.
  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
      pcRef.current?.close()
      pcRef.current = null
      mediaPromiseRef.current = null
    }
  }, [])

  const toggleAudio = useCallback(() => {
    localStream?.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled
    })
  }, [localStream])

  const toggleVideo = useCallback(() => {
    localStream?.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled
    })
  }, [localStream])

  const leave = useCallback(() => {
    localStream?.getTracks().forEach((t) => t.stop())
    pcRef.current?.close()
    pcRef.current = null
    mediaPromiseRef.current = null
    setCallState('ended')
    setLocalStream(null)
    setRemoteStream(null)
  }, [localStream])

  return { localStream, remoteStream, callState, error, toggleAudio, toggleVideo, leave }
}
