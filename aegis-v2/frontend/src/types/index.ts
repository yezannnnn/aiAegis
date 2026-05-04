export interface EventStats {
  total: number
  blocked: number
  allowed: number
  warning: number
  pending: number
}

export interface SecurityEvent {
  id: string
  command: string
  agent: string
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  status: 'pending' | 'approved' | 'denied' | 'blocked'
  sessionId: string
  timestamp: string
  userContext?: any
  intent?: string
  description?: string
}

export interface Session {
  id: string
  createdAt: string
  lastActivity: string
  eventCount: number
  lastCommand?: string
  agent?: string
}

export interface Agent {
  type: string
  firstSeen: string
  lastActivity: string
  sessionCount: number
}