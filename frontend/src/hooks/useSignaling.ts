import { useCallback, useEffect, useRef, useState } from 'react'

import { WS_BASE } from '../config'
import type { ServerMessage, SignalMessage } from '../types/signaling'

export type SignalingState = 'connecting' | 'connected' | 'disconnected' | 'error'

export function useSignaling(roomId: string) {
  const wsRef = useRef<WebSocket | null>(null)
  const retriesRef = useRef(0)
  const unmountedRef = useRef(false)

  const [lastMessage, setLastMessage] = useState<ServerMessage | null>(null)
  const [signalingState, setSignalingState] = useState<SignalingState>('connecting')

  const connect = useCallback(() => {
    if (unmountedRef.current) return

    const ws = new WebSocket(`${WS_BASE}/ws/${roomId}`)
    wsRef.current = ws

    ws.onopen = () => {
      setSignalingState('connected')
      retriesRef.current = 0
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage
        setLastMessage(msg)
      } catch { /* ignore malformed frames */ }
    }

    ws.onclose = () => {
      if (unmountedRef.current) return
      setSignalingState('disconnected')
      if (retriesRef.current < 3) {
        retriesRef.current++
        setTimeout(connect, Math.pow(2, retriesRef.current) * 500)
      } else {
        setSignalingState('error')
      }
    }

    ws.onerror = () => ws.close()
  }, [roomId])

  useEffect(() => {
    unmountedRef.current = false
    connect()
    return () => {
      unmountedRef.current = true
      wsRef.current?.close()
    }
  }, [connect])

  const sendMessage = useCallback((msg: SignalMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  const disconnect = useCallback(() => {
    unmountedRef.current = true
    wsRef.current?.close()
  }, [])

  return { sendMessage, lastMessage, signalingState, disconnect }
}
