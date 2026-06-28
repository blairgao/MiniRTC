import { useCallback, useEffect, useRef, useState } from 'react'

import { WS_BASE } from '../config'
import type { ServerMessage, SignalMessage } from '../types/signaling'

export type SignalingState = 'connecting' | 'connected' | 'disconnected' | 'error'

export function useSignaling(roomId: string) {
  const wsRef = useRef<WebSocket | null>(null)
  const retriesRef = useRef(0)
  const unmountedRef = useRef(false)

  const messagesRef = useRef<ServerMessage[]>([])
  const [queueVersion, setQueueVersion] = useState(0)
  const [sessionId, setSessionId] = useState(0)
  const [lastMessage, setLastMessage] = useState<ServerMessage | null>(null)
  const [signalingState, setSignalingState] = useState<SignalingState>('connecting')

  const connect = useCallback(() => {
    if (unmountedRef.current) return

    const ws = new WebSocket(`${WS_BASE}/ws/${roomId}`)
    wsRef.current = ws

    // Terminal messages — server closes the connection after sending these.
    // Retrying would just get the same response, so we stop here.
    const TERMINAL = new Set(['room_full', 'room_not_found', 'room_expired'])
    let terminal = false

    ws.onopen = () => {
      messagesRef.current = []
      setSessionId((s) => s + 1)
      setSignalingState('connected')
      retriesRef.current = 0
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage
        if (TERMINAL.has(msg.type)) terminal = true
        messagesRef.current.push(msg)
        setQueueVersion((v) => v + 1)
        setLastMessage(msg)
      } catch { /* ignore malformed frames */ }
    }

    ws.onclose = () => {
      if (unmountedRef.current || terminal) return
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

  return { sendMessage, messagesRef, queueVersion, sessionId, lastMessage, signalingState, disconnect }
}
