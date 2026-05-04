/**
 * 事件管理器 - 统计、存储、广播事件
 */

import { EventData, Stats, ActiveAgent, SessionData, AgentConfig, WebSocketMessage } from './types';
import { EventEmitter } from 'events';

export class EventManager extends EventEmitter {
  private stats: Stats = {
    total: 0,
    blocked: 0,
    allowed: 0,
    warning: 0,
    pending: 0
  };

  private events: EventData[] = [];
  private activeAgents = new Map<string, ActiveAgent>();
  private sessions = new Map<string, SessionData>();

  private readonly agentConfigs: Record<string, AgentConfig> = {
    'hermes': { name: 'Hermes', color: '#FF6B6B', icon: '🔥' },
    'openClaw': { name: 'OpenClaw', color: '#4ECDC4', icon: '🔧' },
    'claude-code': { name: 'Claude Code', color: '#45B7D1', icon: '🤖' },
    'codex': { name: 'GitHub Codex', color: '#96CEB4', icon: '💻' },
    'gpt4': { name: 'GPT-4', color: '#FFEAA7', icon: '🧠' }
  };

  /**
   * 添加拦截事件
   */
  addInterceptionEvent(eventData: Omit<EventData, 'id' | 'timestamp' | 'time'>): string {
    const event: EventData = {
      id: Date.now() + Math.random().toString(),
      timestamp: new Date().toISOString(),
      time: new Date().toLocaleTimeString('zh-CN'),
      ...eventData
    };

    // 添加到事件列表
    this.events.unshift(event);
    if (this.events.length > 100) {
      this.events = this.events.slice(0, 100);
    }

    // 更新统计
    this.updateStats(event.status);

    // 更新活跃代理
    this.updateActiveAgent(event.agent, event);

    // 发送事件
    this.emit('new_event', {
      type: 'new_event',
      event,
      stats: this.stats
    });

    console.log(`🛡️ [${event.time}] ${event.status.toUpperCase()}: ${event.command} (Agent: ${event.agent})`);

    return event.id!;
  }

  /**
   * 更新统计数据
   */
  private updateStats(status: string): void {
    this.stats.total++;
    switch (status) {
      case 'blocked': this.stats.blocked++; break;
      case 'allowed': this.stats.allowed++; break;
      case 'warning': this.stats.warning++; break;
      case 'pending': this.stats.pending++; break;
    }
  }

  /**
   * 更新活跃代理
   */
  private updateActiveAgent(agentName: string, eventData: EventData): void {
    const config = this.agentConfigs[agentName] || {
      name: agentName,
      color: '#888888',
      icon: '❓'
    };

    const agent: ActiveAgent = {
      name: config.name,
      color: config.color,
      icon: config.icon,
      lastActivity: new Date().toISOString(),
      lastCommand: eventData.command,
      sessionId: eventData.sessionId || 'unknown',
      userContext: eventData.userContext || {},
      intent: eventData.intent || 'unknown'
    };

    this.activeAgents.set(agentName, agent);

    this.emit('agent_update', {
      type: 'agent_update',
      activeAgents: Array.from(this.activeAgents.entries())
    });
  }

  /**
   * 更新会话信息
   */
  updateSession(sessionId: string, sessionData: Partial<SessionData>): void {
    const existingData = this.sessions.get(sessionId) || {};

    this.sessions.set(sessionId, {
      ...existingData,
      ...sessionData,
      lastUpdate: new Date().toISOString()
    });

    this.emit('session_update', {
      type: 'session_update',
      sessions: Array.from(this.sessions.entries())
    });
  }

  /**
   * 更新事件状态
   */
  updateEventStatus(sessionId: string, newStatus: string, reason?: string): void {
    // 查找并更新对应事件
    const eventIndex = this.events.findIndex(event => event.sessionId === sessionId);
    if (eventIndex !== -1) {
      this.events[eventIndex].status = newStatus as any;
      if (reason) {
        this.events[eventIndex].reason = reason;
      }
    }

    // 发送状态更新事件
    this.emit('approval_resolved', {
      type: 'approval_resolved',
      sessionId,
      status: newStatus,
      reason,
      timestamp: new Date().toISOString()
    });

    console.log(`🛡️ [${new Date().toLocaleTimeString()}] ${newStatus.toUpperCase()}: Event updated for session ${sessionId.substring(0, 8)}...`);
  }

  /**
   * 广播消息到所有监听器
   */
  broadcast(message: WebSocketMessage): void {
    this.emit('broadcast', message);
  }

  /**
   * 获取初始状态
   */
  getInitialState() {
    return {
      stats: this.stats,
      events: this.events.slice(0, 20),
      activeAgents: Array.from(this.activeAgents.entries()),
      sessions: Array.from(this.sessions.entries())
    };
  }

  /**
   * 获取统计数据
   */
  getStats(): Stats {
    return { ...this.stats };
  }

  /**
   * 获取事件列表
   */
  getEvents(): EventData[] {
    return [...this.events];
  }

  /**
   * 获取活跃代理
   */
  getActiveAgents(): Map<string, ActiveAgent> {
    return new Map(this.activeAgents);
  }

  /**
   * 获取会话数据
   */
  getSessions(): Map<string, SessionData> {
    return new Map(this.sessions);
  }
}