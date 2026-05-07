import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { CreateEventDto, EventStatsDto, EventStatus } from './dto';
import { SqliteStorageService } from '../storage/sqlite-storage.service';

export interface SecurityEvent extends CreateEventDto {
  id: string;
  timestamp: string;
}

@Injectable()
export class EventManagerService extends EventEmitter implements OnApplicationBootstrap {
  private readonly logger = new Logger(EventManagerService.name);
  private events: Map<string, SecurityEvent> = new Map();
  private sessions: Map<string, any> = new Map();
  private agents: Map<string, any> = new Map();

  private storage: SqliteStorageService | null = null;

  constructor(storage: SqliteStorageService) {
    super();
    this.storage = storage;
  }

  async onApplicationBootstrap() {
    await this.loadFromStorage();
  }

  async loadFromStorage() {
    if (!this.storage) {
      this.logger.warn('Storage 未初始化');
      return;
    }

    // onApplicationBootstrap 在 onModuleInit 之后执行，DB 应该已就绪
    if (!this.storage.isReady()) {
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!this.storage.isReady()) {
      this.logger.warn('Storage 未就绪，跳过加载历史数据');
      return;
    }

    try {
      const events = await this.storage.getEvents(1000);
      for (const event of events) {
        this.events.set(event.id, event);
      }
      // 同时恢复 sessions
      const sessions: any[] = await this.storage.getSessions();
      for (const s of sessions) {
        this.sessions.set(s.id, s);
      }
      this.logger.log(`从 SQLite 加载了 ${events.length} 个事件, ${sessions.length} 个会话`);
    } catch (e: any) {
      this.logger.warn(`SQLite 加载失败: ${e.message}`);
    }
  }

  addEvent(eventData: CreateEventDto): string {
    const id = uuidv4();
    const event: SecurityEvent = {
      ...eventData,
      id,
      timestamp: new Date().toISOString(),
    };

    this.events.set(id, event);
    this.updateSession(event.sessionId, event);
    this.updateAgent(event.agent, event);

    // 持久化到 SQLite
    try {
      this.storage?.saveEvent(event);
    } catch (e) {
      console.error('❌ 事件持久化失败:', e.message);
    }

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
      // 同步更新 SQLite
      try {
        this.storage?.updateEventStatus(id, status);
      } catch (e) {
        console.error('❌ 状态更新持久化失败:', e.message);
      }
      this.emit('new_event', event);
      return true;
    }
    return false;
  }

  getEvents(): SecurityEvent[] {
    return Array.from(this.events.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  getEventsPaged(offset: number, limit: number): { events: SecurityEvent[]; total: number } {
    const sorted = this.getEvents();
    return { events: sorted.slice(offset, offset + limit), total: sorted.length };
  }

  getStats(): EventStatsDto {
    const events = Array.from(this.events.values());

    return {
      total: events.length,
      blocked: events.filter(e => e.status === EventStatus.BLOCKED).length,
      allowed: events.filter(e => e.status === EventStatus.ALLOWED || e.status === EventStatus.APPROVED).length,
      warning: events.filter(e => e.risk === 'MEDIUM').length,
      pending: events.filter(e => e.status === EventStatus.PENDING).length,
      timed_out: events.filter(e => e.status === EventStatus.TIMED_OUT).length,
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

    // 持久化会话
    try {
      this.storage?.saveSession(session);
    } catch (e) {
      console.error('❌ 会话持久化失败:', e.message);
    }
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

  updateAgent(agentType: string, event?: any): void {
    const sessionId = event?.sessionId || 'unknown';
    const key = `${agentType}::${sessionId}`;

    const agent = this.agents.get(key) || {
      type: agentType,
      sessionId,
      firstSeen: new Date().toISOString(),
      commandCount: 0,
      blockedCount: 0,
      cwd: null,
      lastCommand: null,
      model: null,
      persona: null,
    };

    agent.commandCount = (agent.commandCount || 0) + 1;
    if (event?.status === 'blocked' || event?.status === 'denied') {
      agent.blockedCount = (agent.blockedCount || 0) + 1;
    }
    if (event?.cwd) agent.cwd = event.cwd;
    if (event?.command) agent.lastCommand = event.command;
    if (event?.model) agent.model = event.model;
    if (event?.persona) agent.persona = event.persona;

    this.agents.set(key, agent);
    this.emit('agent_update', agent);
  }

  getAgents(): any[] {
    return Array.from(this.agents.values());
  }

  clearOldData(): void {
    // 清理30天前的事件
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    for (const [id, event] of Array.from(this.events.entries())) {
      if (new Date(event.timestamp).getTime() < thirtyDaysAgo) {
        this.events.delete(id);
      }
    }

    // 清理非活跃会话
    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;

    for (const [id, session] of Array.from(this.sessions.entries())) {
      if (new Date(session.lastActivity).getTime() < thirtyMinutesAgo) {
        this.sessions.delete(id);
      }
    }
  }
}