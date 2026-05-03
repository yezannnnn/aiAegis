import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { CreateEventDto, EventStatsDto, EventStatus } from './dto';

export interface SecurityEvent extends CreateEventDto {
  id: string;
  timestamp: string;
}

@Injectable()
export class EventManagerService extends EventEmitter {
  private events: Map<string, SecurityEvent> = new Map();
  private sessions: Map<string, any> = new Map();
  private agents: Map<string, any> = new Map();

  addEvent(eventData: CreateEventDto): string {
    const id = uuidv4();
    const event: SecurityEvent = {
      ...eventData,
      id,
      timestamp: new Date().toISOString(),
    };

    this.events.set(id, event);
    this.updateSession(event.sessionId, event);
    this.updateAgent(event.agent);

    // 发出事件通知
    this.emit('new_event', event);

    return id;
  }

  getEvent(id: string): SecurityEvent | undefined {
    return this.events.get(id);
  }

  updateEventStatus(id: string, status: EventStatus): boolean {
    const event = this.events.get(id);
    if (event) {
      event.status = status;
      this.events.set(id, event);
      this.emit('new_event', event);
      return true;
    }
    return false;
  }

  getEvents(): SecurityEvent[] {
    return Array.from(this.events.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  getStats(): EventStatsDto {
    const events = Array.from(this.events.values());

    return {
      total: events.length,
      blocked: events.filter(e => e.status === EventStatus.BLOCKED).length,
      allowed: events.filter(e => e.status === EventStatus.APPROVED).length,
      warning: events.filter(e => e.risk === 'MEDIUM').length,
      pending: events.filter(e => e.status === EventStatus.PENDING).length,
    };
  }

  updateSession(sessionId: string, eventData: any): void {
    const session = this.sessions.get(sessionId) || {
      id: sessionId,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      eventCount: 0,
    };

    session.lastActivity = new Date().toISOString();
    session.eventCount += 1;
    session.lastCommand = eventData.command;
    session.agent = eventData.agent;

    this.sessions.set(sessionId, session);
    this.emit('session_update', session);
  }

  getSessions(): any[] {
    return Array.from(this.sessions.values())
      .filter(session => {
        // 过滤掉30分钟前的会话
        const lastActivity = new Date(session.lastActivity).getTime();
        const now = Date.now();
        return (now - lastActivity) < 30 * 60 * 1000;
      });
  }

  updateAgent(agentType: string): void {
    const agent = this.agents.get(agentType) || {
      type: agentType,
      firstSeen: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      sessionCount: 0,
    };

    agent.lastActivity = new Date().toISOString();
    const activeSessions = this.getSessions().filter(s => s.agent === agentType);
    agent.sessionCount = activeSessions.length;

    this.agents.set(agentType, agent);
    this.emit('agent_update', agent);
  }

  getAgents(): any[] {
    return Array.from(this.agents.values());
  }

  clearOldData(): void {
    // 清理30天前的事件
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    for (const [id, event] of this.events) {
      if (new Date(event.timestamp).getTime() < thirtyDaysAgo) {
        this.events.delete(id);
      }
    }

    // 清理非活跃会话
    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;

    for (const [id, session] of this.sessions) {
      if (new Date(session.lastActivity).getTime() < thirtyMinutesAgo) {
        this.sessions.delete(id);
      }
    }
  }
}