export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum EventStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  DENIED = 'denied',
  BLOCKED = 'blocked',
  ALLOWED = 'allowed',
  WARNED = 'warned',
  TIMED_OUT = 'timed_out'
}

export class CreateEventDto {
  command: string;
  agent: string;
  risk: RiskLevel;
  status: EventStatus;
  sessionId: string;
  cwd?: string;
  model?: string;
  persona?: string;
  taskId?: string;
  userPrompt?: string;
  userInput?: string;
  assistPrompt?: string;
  matchedRules?: string[];
  approvalId?: string;
  userContext?: any;
  intent?: string;
  description?: string;
}

export class EventStatsDto {
  total: number;
  blocked: number;
  allowed: number;
  warning: number;
  pending: number;
  timed_out: number;
}
