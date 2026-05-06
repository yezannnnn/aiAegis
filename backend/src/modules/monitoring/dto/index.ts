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
  TIMED_OUT = 'timed_out'
}

export class CreateEventDto {
  command: string;
  agent: string;
  risk: RiskLevel;
  status: EventStatus;
  sessionId: string;
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
