import { Injectable } from '@nestjs/common';
import { SqliteStorageService } from '../storage/sqlite-storage.service';

export interface ApprovalRequest {
  id: string;
  eventId: string;
  sessionId: string;
  command: string;
  agent: string;
  risk: string;
  status: 'pending' | 'approved' | 'denied' | 'timed_out';
  reason?: string;
  createdAt: string;
  decidedAt?: string;
  /** 规则引擎评估结果快照 */
  evaluation?: any;
  /** AST 结构快照 */
  ast?: any;
  /** 命令上下文快照 */
  context?: any;
  /** 触发来源 */
  source?: string;
}

export interface ApprovalDecision {
  approvalId: string;
  eventId: string;
  status: string;
  command: string;
  reason?: string;
}

@Injectable()
export class ApprovalService {
  constructor(private readonly storage: SqliteStorageService) {}

  /** 创建审批请求（兼容旧接口）→ 入库 */
  async createApproval(data: {
    id: string;
    eventId: string;
    sessionId: string;
    command: string;
    agent: string;
    risk: string;
    reason?: string;
  }): Promise<ApprovalRequest> {
    const approval: ApprovalRequest = {
      ...data,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    await this.storage.saveApproval({
      id: approval.id,
      eventId: approval.eventId,
      sessionId: approval.sessionId,
      command: approval.command,
      status: approval.status,
      reason: approval.reason,
      timestamp: approval.createdAt,
    });
    return approval;
  }

  /** 创建审批请求（新接口：支持规则引擎上下文） */
  async createRequest(data: {
    requestId: string;
    eventId?: string; // 可选的真正 event ID
    command: string;
    ast: any;
    context: any;
    evaluation: any;
    source: string;
    agent?: string;
  }): Promise<ApprovalRequest> {
    const approval: ApprovalRequest = {
      id: data.requestId,
      eventId: data.eventId || data.requestId, // 优先使用真正的 eventId
      sessionId: 'rule-engine',
      command: data.command,
      agent: data.agent || 'Aegis',
      risk: data.evaluation.severity || 'MEDIUM',
      status: 'pending',
      reason: data.evaluation.reason,
      createdAt: new Date().toISOString(),
      evaluation: data.evaluation,
      ast: data.ast,
      context: data.context,
      source: data.source,
    };

    await this.storage.saveApproval({
      id: approval.id,
      eventId: approval.eventId,
      sessionId: approval.sessionId,
      command: approval.command,
      status: approval.status,
      reason: approval.reason,
      timestamp: approval.createdAt,
      decidedAt: approval.decidedAt,
    });

    return approval;
  }

  /** 查单条 → 读数据库 */
  async getApproval(id: string): Promise<ApprovalRequest | undefined> {
    const row = await this.storage.getApproval(id);
    return row ? this.rowToApproval(row) : undefined;
  }

  /** 查pending列表 → 读数据库 */
  async getPendingApprovals(): Promise<ApprovalRequest[]> {
    const rows = await this.storage.getPendingApprovals() as any[];
    return (rows || []).map((r: any) => this.rowToApproval(r));
  }

  /** 查全部 → 读数据库 */
  async getAllApprovals(): Promise<ApprovalRequest[]> {
    const db = (this.storage as any).db;
    if (!db) return [];
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM approvals ORDER BY timestamp DESC LIMIT 200`,
        (err: any, rows: any[]) => {
          if (err) return reject(err);
          resolve((rows || []).map((r: any) => this.rowToApproval(r)));
        }
      );
    });
  }

  /** 做决策 → 更新数据库 */
  async makeDecision(id: string, action: 'approve' | 'deny', reason?: string): Promise<ApprovalRequest | null> {
    const approval = await this.getApproval(id);
    if (!approval || approval.status !== 'pending') {
      return null;
    }

    const decidedAt = new Date().toISOString();
    const newStatus = action === 'approve' ? 'approved' : 'denied';

    await this.storage.saveApproval({
      id: approval.id,
      eventId: approval.eventId,
      sessionId: approval.sessionId,
      command: approval.command,
      status: newStatus,
      reason: reason || approval.reason,
      timestamp: approval.createdAt,
      decidedAt,
    });

    // 返回更新后的记录
    return this.getApproval(id);
  }

  /** 标记为超时 */
  async markAsTimedOut(id: string): Promise<ApprovalRequest | null> {
    const approval = await this.getApproval(id);
    if (!approval || approval.status !== 'pending') {
      return null;
    }

    const decidedAt = new Date().toISOString();

    await this.storage.saveApproval({
      id: approval.id,
      eventId: approval.eventId,
      sessionId: approval.sessionId,
      command: approval.command,
      status: 'timed_out',
      reason: '审批超时',
      timestamp: approval.createdAt,
      decidedAt,
    });

    return this.getApproval(id);
  }

  /** 阻塞等待审批决定 —— 数据库轮询 */
  async waitForDecision(id: string, timeoutMs: number = 60000): Promise<ApprovalRequest | null> {
    const start = Date.now();
    const pollInterval = 500; // 每500ms查一次数据库

    while (Date.now() - start < timeoutMs) {
      const approval = await this.getApproval(id);

      // 不存在
      if (!approval) return null;

      // 已决定，立即返回
      if (approval.status !== 'pending') {
        return approval;
      }

      // 还没决定，等一会再查
      await this.sleep(pollInterval);
    }

    // 超时
    return null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private rowToApproval(row: any): ApprovalRequest {
    return {
      id: row.id,
      eventId: row.event_id || row.eventId,
      sessionId: row.session_id || row.sessionId,
      command: row.command,
      agent: row.agent || '',
      risk: row.risk || 'MEDIUM',
      status: row.status,
      reason: row.reason || undefined,
      createdAt: row.timestamp || row.created_at,
      decidedAt: row.decided_at || row.decidedAt || undefined,
      // 新字段：从 JSON 列解析（如果存储支持）
      evaluation: row.evaluation ? JSON.parse(row.evaluation) : undefined,
      ast: row.ast ? JSON.parse(row.ast) : undefined,
      context: row.context ? JSON.parse(row.context) : undefined,
      source: row.source || undefined,
    };
  }
}
