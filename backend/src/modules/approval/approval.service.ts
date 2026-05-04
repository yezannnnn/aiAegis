import { Injectable } from '@nestjs/common';

@Injectable()
export class ApprovalService {
  private pendingApprovals = new Map();

  getPendingApprovals() {
    return Array.from(this.pendingApprovals.values());
  }

  getApproval(sessionId: string) {
    return this.pendingApprovals.get(sessionId);
  }

  makeDecision(sessionId: string, decision: { action: 'allow' | 'deny', reason?: string }) {
    const approval = this.pendingApprovals.get(sessionId);
    if (approval) {
      approval.status = decision.action;
      approval.reason = decision.reason;
      approval.decidedAt = new Date().toISOString();
      this.pendingApprovals.set(sessionId, approval);
    }
    return {
      success: true,
      sessionId,
      decision: decision.action,
      timestamp: new Date().toISOString()
    };
  }

  addPendingApproval(sessionId: string, command: string, risk: string) {
    const approval = {
      sessionId,
      command,
      risk,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    this.pendingApprovals.set(sessionId, approval);
    return approval;
  }
}