/**
 * Aegis Monitor TypeScript 类型定义
 */

export interface PortConfig {
  web: number;
  websocket: number;
  hook: number;
}

export interface Stats {
  total: number;
  blocked: number;
  allowed: number;
  warning: number;
  pending: number;
}

export interface EventData {
  id?: string;
  command: string;
  agent: string;
  risk: 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'blocked' | 'allowed' | 'warning' | 'pending';
  sessionId: string;
  userContext?: {
    user?: string;
    project?: string;
    cwd?: string;
  };
  intent?: string;
  timestamp?: string;
  time?: string;
  description?: string;
  reason?: string;
}

export interface AgentConfig {
  name: string;
  color: string;
  icon: string;
}

export interface ActiveAgent {
  name: string;
  color: string;
  icon: string;
  lastActivity: string;
  lastCommand: string;
  sessionId: string;
  userContext: Record<string, any>;
  intent: string;
}

export interface SessionData {
  user?: string;
  project?: string;
  lastUpdate: string;
  cwd?: string;
  agent?: string;
  [key: string]: any;
}

export interface ApprovalRequest {
  sessionId: string;
  command: string;
  description: string;
  risk: 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  agentType: string;
  context: {
    cwd: string;
    user: string;
    project: string;
    astSeverity?: string;
    astDescription?: string;
  };
}

export interface ApprovalResult {
  approved: boolean;
  reason: string;
  timestamp?: string;
  source?: string;
}

export interface PendingApproval {
  resolve: (result: ApprovalResult) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

export interface DualApprovalState {
  sessionId: string;
  command: string;
  description: string;
  status: 'pending' | 'approved' | 'denied';
  source: 'claude-native' | 'web' | null;
  timestamp: string;
  claudeNative: 'waiting' | 'pending' | 'approved' | 'denied';
  webInterface: 'waiting' | 'pending' | 'approved' | 'denied';
  reason?: string;
}

export interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

export interface HookEvent {
  type?: string;
  command?: string;
  sessionId?: string;
  intent?: string;
  agentType?: string;
  decision?: string;
  action?: string;
  risk?: string;
  cwd?: string;
  context?: {
    user?: string;
    project?: string;
    astResult?: {
      severity?: string;
      description?: string;
    };
  };
  payload?: {
    command?: string;
    sessionId?: string;
    agentType?: string;
    context?: any;
    cwd?: string;
  };
}