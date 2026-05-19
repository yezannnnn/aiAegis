import { Controller, Get, Post, Body, Param, Query, Inject, forwardRef } from '@nestjs/common';
import { ApprovalService } from './approval.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { EventStatus } from '../monitoring/dto';

@Controller('api/v1/approvals')
export class ApprovalController {
  constructor(
    private readonly approvalService: ApprovalService,
    @Inject(forwardRef(() => MonitoringService))
    private readonly monitoringService: MonitoringService,
  ) {}

  @Get('pending')
  async getPendingApprovals() {
    const approvals = await this.approvalService.getPendingApprovals();
    return {
      success: true,
      count: approvals.length,
      approvals: approvals.map(a => this.sanitizeApproval(a)),
    };
  }

  @Get('all')
  async getAllApprovals(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const approvals = await this.approvalService.getAllApprovals();
    const total = approvals.length;
    const start = parseInt(offset || '0', 10);
    const end = start + parseInt(limit || '50', 10);
    const page = approvals.slice(start, end);

    return {
      success: true,
      total,
      count: page.length,
      approvals: page.map(a => this.sanitizeApproval(a)),
    };
  }

  @Get(':approvalId')
  async getApproval(@Param('approvalId') approvalId: string) {
    const approval = await this.approvalService.getApproval(approvalId);
    if (!approval) {
      return { success: false, message: '审批不存在' };
    }
    return { success: true, approval: this.sanitizeApproval(approval) };
  }

  @Post(':approvalId/decision')
  async makeDecision(
    @Param('approvalId') approvalId: string,
    @Body() decision: { action: 'approve' | 'deny', reason?: string }
  ) {
    const result = await this.approvalService.makeDecision(approvalId, decision.action, decision.reason);
    if (!result) {
      return { success: false, message: '审批不存在或已处理' };
    }
    // 同步更新监控事件状态并通过 WebSocket 广播
    if (result.eventId) {
      const newStatus = decision.action === 'approve' ? EventStatus.ALLOWED : EventStatus.BLOCKED;
      this.monitoringService.updateEventStatus(result.eventId, newStatus);
    }
    return { success: true, approval: this.sanitizeApproval(result) };
  }

  @Get('wait/:approvalId')
  async waitForDecision(@Param('approvalId') approvalId: string) {
    const approval = await this.approvalService.getApproval(approvalId);
    if (!approval) {
      return { success: false, message: '审批不存在' };
    }

    if (approval.status !== 'pending') {
      return { success: true, approval: this.sanitizeApproval(approval) };
    }

    const result = await this.approvalService.waitForDecision(approvalId, 60000);
    if (!result) {
      return { success: false, message: '等待超时' };
    }
    return { success: true, approval: this.sanitizeApproval(result) };
  }

  private sanitizeApproval(a: any) {
    return {
      id: a.id,
      eventId: a.eventId,
      sessionId: a.sessionId,
      command: a.command,
      agent: a.agent,
      risk: a.risk,
      status: a.status,
      reason: a.reason,
      createdAt: a.createdAt,
      decidedAt: a.decidedAt,
      source: a.source,
      evaluation: a.evaluation,
      ast: a.ast,
      context: a.context ? {
        cwd: a.context.cwd,
        git: a.context.git ? {
          isRepo: a.context.git.isRepo,
          currentBranch: a.context.git.currentBranch,
          isMainBranch: a.context.git.isMainBranch,
          hasUncommittedChanges: a.context.git.hasUncommittedChanges,
        } : undefined,
      } : undefined,
    };
  }
}