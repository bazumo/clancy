import { useEffect, useState, useRef } from 'react'

export interface WebSocketMessage {
  type: 'init' | 'flow' | 'event'
  [key: string]: unknown
}

interface UseWebSocketOptions {
  onMessage: (data: WebSocketMessage) => void
}

export function useWebSocket({ onMessage }: UseWebSocketOptions) {
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = import.meta.env.DEV ? 'localhost:9090' : window.location.host
    const ws = new WebSocket(`${protocol}//${host}`)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)

    ws.onmessage = (msgEvent) => {
      const data = JSON.parse(msgEvent.data)
      onMessage(data)
    }

    return () => ws.close()
  }, [onMessage])

  return { connected, wsRef }
}

