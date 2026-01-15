import http from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import type { Flow, SSEEvent } from '../shared/types.js'

// In-memory storage
const flows = new Map<string, Flow>()
const events = new Map<string, SSEEvent[]>()
const rawHttp = new Map<string, { request: string; response: string }>()

// WebSocket clients
const clients = new Set<WebSocket>()
let wss: WebSocketServer | null = null

/**
 * Initialize the WebSocket server and attach to HTTP server
 */
export function initWebSocket(server: http.Server): void {
  wss = new WebSocketServer({ server })

  wss.on('connection', (ws) => {
    clients.add(ws)
    
    // Send existing data to new client
    const existingFlows = Array.from(flows.values()).slice(-100)
    const existingEvents: Record<string, SSEEvent[]> = {}
    for (const [flowId, flowEvents] of events.entries()) {
      existingEvents[flowId] = flowEvents
    }
    ws.send(JSON.stringify({ type: 'init', flows: existingFlows, events: existingEvents }))
    
    ws.on('close', () => clients.delete(ws))
  })
}

/**
 * Broadcast a message to all connected clients
 */
function broadcast(message: string): void {
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  })
}

// ============ Flow Management ============

/**
 * Add or update a flow and broadcast to all clients
 */
export function saveFlow(flow: Flow): void {
  flows.set(flow.id, flow)
  broadcast(JSON.stringify({ type: 'flow', flow }))
}

/**
 * Get a flow by ID
 */
export function getFlow(id: string): Flow | undefined {
  return flows.get(id)
}

// ============ Event Management ============

/**
 * Initialize event storage for a flow (call when starting SSE stream)
 */
export function initFlowEvents(flowId: string): void {
  events.set(flowId, [])
}

/**
 * Add an SSE event and broadcast to all clients
 */
export function addEvent(flowId: string, event: SSEEvent): void {
  const flowEvents = events.get(flowId) || []
  flowEvents.push(event)
  events.set(flowId, flowEvents)
  broadcast(JSON.stringify({ type: 'event', flowId, event }))
}

/**
 * Get all events for a flow
 */
export function getEvents(flowId: string): SSEEvent[] {
  return events.get(flowId) || []
}

// ============ Raw HTTP Management ============

/**
 * Initialize raw HTTP storage for a flow
 */
export function initRawHttp(flowId: string, request: string): void {
  rawHttp.set(flowId, { request, response: '' })
}

/**
 * Update the raw HTTP response for a flow
 */
export function setRawHttpResponse(flowId: string, response: string): void {
  const entry = rawHttp.get(flowId)
  if (entry) {
    entry.response = response
  }
}

/**
 * Get raw HTTP data for a flow
 */
export function getRawHttp(flowId: string): { request: string; response: string } | undefined {
  return rawHttp.get(flowId)
}

/**
 * Delete raw HTTP data for a flow (e.g., for streaming responses)
 */
export function deleteRawHttp(flowId: string): void {
  rawHttp.delete(flowId)
}

/**
 * Get all flow IDs that have raw HTTP data (for debugging)
 */
export function getRawHttpFlowIds(): string[] {
  return Array.from(rawHttp.keys())
}

// ============ Stats ============

/**
 * Get the number of connected WebSocket clients
 */
export function getClientCount(): number {
  return clients.size
}

