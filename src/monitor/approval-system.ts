/**
 * 审批系统 - 处理命令审批逻辑
 */

import { ApprovalRequest, ApprovalResult, PendingApproval } from './types';
import { EventEmitter } from 'events';

export class ApprovalSystem extends EventEmitter {
  private pendingApprovals = new Map<string, PendingApproval>();
  private readonly defaultTimeoutMs = 100000; // 100秒，与Claude Code的120秒匹配

  /**
   * 创建审批请求
   */
  async createApprovalRequest(approvalData: ApprovalRequest): Promise<ApprovalResult> {
    const sessionId = approvalData.sessionId;
    console.log(`🔒 [${new Date().toLocaleTimeString()}] 创建审批请求: ${sessionId.substring(0, 8)}... - ${approvalData.command}`);

    // 检查是否已存在相同的审批请求
    if (this.pendingApprovals.has(sessionId)) {
      throw new Error(`Session ${sessionId} already has a pending approval`);
    }

    // 发出审批请求事件
    this.emit('approval_request_created', {
      ...approvalData,
      timestamp: new Date().toISOString()
    });

    // 创建Promise等待审批决定
    const approvalPromise = new Promise<ApprovalResult>((resolve, reject) => {
      // 存储审批回调
      this.pendingApprovals.set(sessionId, {
        resolve,
        reject,
        timestamp: Date.now()
      });

      // 超时保护
      setTimeout(() => {
        const pending = this.pendingApprovals.get(sessionId);
        if (pending) {
          this.pendingApprovals.delete(sessionId);
          pending.reject(new Error('Approval timeout'));
        }
      }, this.defaultTimeoutMs);
    });

    try {
      const result = await approvalPromise;
      console.log(`✅ [${new Date().toLocaleTimeString()}] 审批完成: ${sessionId.substring(0, 8)}... - ${result.approved ? 'APPROVED' : 'DENIED'}`);
      return result;
    } catch (error) {
      console.log(`❌ [${new Date().toLocaleTimeString()}] 审批失败: ${sessionId.substring(0, 8)}... - ${(error as Error).message}`);
      return {
        approved: false,
        reason: (error as Error).message || 'Approval timeout or error',
        timestamp: new Date().toISOString(),
        source: 'system'
      };
    }
  }

  /**
   * 解决审批请求 (用户做出决定)
   */
  resolveApproval(sessionId: string, approved: boolean, reason: string, source: string = 'web'): boolean {
    const pendingApproval = this.pendingApprovals.get(sessionId);

    if (!pendingApproval) {
      console.log(`⚠️ [${new Date().toLocaleTimeString()}] 审批不存在或已过期: ${sessionId.substring(0, 8)}...`);
      return false;
    }

    // 移除待审批
    this.pendingApprovals.delete(sessionId);

    // 解决Promise
    const result: ApprovalResult = {
      approved,
      reason,
      timestamp: new Date().toISOString(),
      source
    };

    pendingApproval.resolve(result);

    // 发出审批解决事件
    this.emit('approval_resolved', {
      sessionId,
      approved,
      reason,
      source,
      timestamp: result.timestamp
    });

    console.log(`🔄 [${new Date().toLocaleTimeString()}] 审批已解决: ${sessionId.substring(0, 8)}... - ${approved ? 'APPROVED' : 'DENIED'} by ${source}`);

    return true;
  }

  /**
   * 取消审批请求
   */
  cancelApproval(sessionId: string, reason: string = 'Cancelled'): boolean {
    const pendingApproval = this.pendingApprovals.get(sessionId);

    if (!pendingApproval) {
      return false;
    }

    this.pendingApprovals.delete(sessionId);
    pendingApproval.reject(new Error(reason));

    console.log(`❌ [${new Date().toLocaleTimeString()}] 审批已取消: ${sessionId.substring(0, 8)}... - ${reason}`);

    return true;
  }

  /**
   * 获取待审批列表
   */
  getPendingApprovals(): string[] {
    return Array.from(this.pendingApprovals.keys());
  }

  /**
   * 检查是否有待审批的请求
   */
  hasPendingApproval(sessionId: string): boolean {
    return this.pendingApprovals.has(sessionId);
  }

  /**
   * 获取待审批数量
   */
  getPendingCount(): number {
    return this.pendingApprovals.size;
  }

  /**
   * 清理过期的审批请求
   */
  cleanupExpiredApprovals(): number {
    const now = Date.now();
    const expiredThreshold = this.defaultTimeoutMs;
    let cleanedCount = 0;

    for (const [sessionId, approval] of this.pendingApprovals.entries()) {
      if (now - approval.timestamp > expiredThreshold) {
        this.cancelApproval(sessionId, 'Expired');
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 [${new Date().toLocaleTimeString()}] 清理了 ${cleanedCount} 个过期审批请求`);
    }

    return cleanedCount;
  }

  /**
   * 定期清理过期审批
   */
  startPeriodicCleanup(intervalMs: number = 60000): NodeJS.Timeout {
    return setInterval(() => {
      this.cleanupExpiredApprovals();
    }, intervalMs);
  }

  /**
   * 停止审批系统
   */
  stop(): void {
    console.log('🔒 正在停止审批系统...');

    // 取消所有待审批
    const sessionIds = Array.from(this.pendingApprovals.keys());
    sessionIds.forEach(sessionId => {
      this.cancelApproval(sessionId, 'System shutdown');
    });

    console.log('🔒 审批系统已停止');
  }

  /**
   * 获取审批统计信息
   */
  getStats() {
    return {
      pendingCount: this.pendingApprovals.size,
      pendingSessions: this.getPendingApprovals()
    };
  }
}