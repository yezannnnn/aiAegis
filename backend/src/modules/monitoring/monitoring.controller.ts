import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { MonitoringService } from './monitoring.service';
import { CreateEventDto, RiskLevel, EventStatus } from './dto';
import { WebSocketGateway } from '../websocket/websocket.gateway';
import { ApprovalService } from '../approval/approval.service';

@ApiTags('monitoring')
@Controller('api/monitoring')
export class MonitoringController {
  constructor(
    private readonly monitoringService: MonitoringService,
    private readonly webSocketGateway: WebSocketGateway,
    private readonly approvalService: ApprovalService
  ) {}

  @Get('stats')
  @ApiOperation({ summary: '获取监控统计信息' })
  getStats() {
    return this.monitoringService.getStats();
  }

  @Get('events')
  @ApiOperation({ summary: '获取所有安全事件' })
  getEvents(
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    const o = offset !== undefined ? parseInt(offset, 10) : 0;
    const l = limit !== undefined ? parseInt(limit, 10) : undefined;
    return this.monitoringService.getEvents(o, l);
  }

  @Get('events/:id')
  @ApiOperation({ summary: '获取特定事件详情' })
  getEvent(@Param('id') id: string) {
    return this.monitoringService.getEvent(id);
  }

  @Post('events')
  @ApiOperation({ summary: '创建新的安全事件' })
  createEvent(@Body() createEventDto: CreateEventDto) {
    return this.monitoringService.createEvent(createEventDto);
  }

  @Get('sessions')
  @ApiOperation({ summary: '获取活跃会话' })
  getSessions() {
    return this.monitoringService.getSessions();
  }

  @Get('agents')
  @ApiOperation({ summary: '获取活跃代理' })
  getAgents() {
    return this.monitoringService.getAgents();
  }

  @Get('health')
  @ApiOperation({ summary: '健康检查' })
  healthCheck() {
    return this.monitoringService.healthCheck();
  }

  // ───────────────────────────────────────────────
  // 审批相关接口 —— 全部走 ApprovalService（SQLite）
  // ───────────────────────────────────────────────

  /** Hook创建审批请求 */
  @Post('approval-request')
  @ApiOperation({ summary: '处理Hook审批请求' })
  async handleApprovalRequest(@Body() approvalData: any) {
    console.log('🔔 收到Hook审批请求:', approvalData.command);

    const approvalId = `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 创建监控事件
    const event = await this.monitoringService.createEvent({
      command: approvalData.command,
      agent: approvalData.agentType || 'Claude Code',
      sessionId: approvalData.sessionId,
      risk: RiskLevel.MEDIUM,
      status: EventStatus.PENDING,
      description: approvalData.context?.ruleEngine?.reason || '待审批命令'
    });

    // 入库到 approvals 表
    await this.approvalService.createApproval({
      id: approvalId,
      eventId: event.data.id,
      sessionId: approvalData.sessionId,
      command: approvalData.command,
      agent: approvalData.agentType || 'Claude Code',
      risk: approvalData.context?.ruleEngine?.action === 'review' ? 'MEDIUM' : 'HIGH',
      reason: approvalData.context?.ruleEngine?.reason || '需要审批的命令',
    });

    // WebSocket 广播到前端
    this.webSocketGateway.broadcastApprovalRequest({
      approvalId,
      sessionId: approvalData.sessionId,
      command: approvalData.command,
      agent: approvalData.agentType || 'Claude Code',
      risk: approvalData.context?.ruleEngine?.action === 'review' ? 'MEDIUM' : 'HIGH',
      reason: approvalData.context?.ruleEngine?.reason || '需要审批的命令',
      timestamp: approvalData.timestamp
    });

    return {
      success: true,
      message: '审批请求已创建，等待用户决定',
      approvalId,
      eventId: event.data.id
    };
  }

  /** 查询审批状态 */
  @Get('approval-status/:approvalId')
  @ApiOperation({ summary: '查询审批状态' })
  async getApprovalStatus(@Param('approvalId') approvalId: string) {
    const approval = await this.approvalService.getApproval(approvalId);

    if (!approval) {
      return { success: false, message: '审批请求不存在', status: 'not_found' };
    }

    return {
      success: true,
      approvalId,
      status: approval.status,
      command: approval.command,
      reason: approval.reason,
      timestamp: approval.createdAt
    };
  }

  /** 阻塞等待审批决定（Hook用） */
  @Get('approval-wait/:approvalId')
  @ApiOperation({ summary: '阻塞等待审批决定' })
  async waitForDecision(
    @Param('approvalId') approvalId: string,
    @Query('timeout') timeout?: string
  ) {
    const timeoutMs = Math.min(parseInt(timeout || '60000', 10), 120000);
    const result = await this.approvalService.waitForDecision(approvalId, timeoutMs);

    if (!result) {
      return { success: false, status: 'timeout_or_not_found', message: '超时或审批不存在' };
    }

    return {
      success: true,
      approvalId: result.id,
      status: result.status,
      command: result.command,
      reason: result.reason,
      decidedAt: result.decidedAt
    };
  }

  /** Hook超时标记 */
  @Post('approval-timeout/:approvalId')
  @ApiOperation({ summary: '标记审批超时（Hook轮询超时调用）' })
  async handleApprovalTimeout(@Param('approvalId') approvalId: string) {
    console.log(`⏰ 审批超时: ${approvalId}`);

    const approval = await this.approvalService.getApproval(approvalId);
    if (!approval) {
      return { success: false, message: '审批请求不存在' };
    }
    if (approval.status !== 'pending') {
      return { success: false, message: '审批已处理，无法标记超时', currentStatus: approval.status };
    }

    await this.approvalService.markAsTimedOut(approvalId);

    // 同步更新事件状态
    this.monitoringService.updateEventStatus(approval.eventId, EventStatus.TIMED_OUT);

    // WebSocket 广播
    this.webSocketGateway.server.emit('approval_decision', {
      approvalId,
      status: 'timed_out',
      command: approval.command,
      reason: '审批超时',
      source: 'hook_timeout'
    });

    return {
      success: true,
      approvalId,
      status: 'timed_out',
      message: '审批已标记为超时'
    };
  }

  /** 3001界面做决策 */
  @Post('approval-decision/:approvalId')
  @ApiOperation({ summary: '处理审批决定' })
  async handleApprovalDecision(
    @Param('approvalId') approvalId: string,
    @Body() body: { decision?: 'approved' | 'denied', action?: 'approve' | 'deny', reason?: string }
  ) {
    // 兼容两种字段格式：decision: 'approved'/'denied' 或 action: 'approve'/'deny'
    const isApproved =
      body.decision === 'approved' ||
      body.action === 'approve';

    console.log(`🔔 收到审批决定: ${approvalId} -> ${isApproved ? 'approved' : 'denied'}`);

    const approval = await this.approvalService.getApproval(approvalId);
    if (!approval) {
      return { success: false, message: '审批请求不存在' };
    }
    if (approval.status !== 'pending') {
      return { success: false, message: '审批已处理，无法重复操作', currentStatus: approval.status };
    }

    // 更新数据库
    await this.approvalService.makeDecision(
      approvalId,
      isApproved ? 'approve' : 'deny',
      body.reason
    );

    // 同步更新事件状态
    const newStatus = isApproved ? EventStatus.APPROVED : EventStatus.BLOCKED;
    this.monitoringService.updateEventStatus(approval.eventId, newStatus);

    // WebSocket 广播
    this.webSocketGateway.server.emit('approval_decision', {
      approvalId,
      status: isApproved ? 'approved' : 'denied',
      command: approval.command,
      reason: body.reason,
      source: 'aegis_ui'
    });

    return {
      success: true,
      approvalId,
      status: isApproved ? 'approved' : 'denied',
      message: `命令已${isApproved ? '批准' : '拒绝'}`
    };
  }

  /** 根据命令查找审批ID */
  @Post('find-approval-by-command')
  @ApiOperation({ summary: '根据命令查找审批ID（PostToolUse同步用）' })
  async findApprovalByCommand(@Body() data: { command: string }) {
    // 从数据库查最近5分钟内的匹配记录
    const all = await this.approvalService.getAllApprovals();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const match = all.find(a =>
      a.command === data.command &&
      a.createdAt > fiveMinutesAgo &&
      a.status === 'pending'
    );

    if (match) {
      return { success: true, approvalId: match.id, status: match.status };
    }
    return { success: false, approvalId: null };
  }

  /** 同步Claude Code决策到3001 */
  @Post('sync-claude-decision')
  @ApiOperation({ summary: '同步Claude Code决策到3001（PostToolUse Hook用）' })
  async syncClaudeDecision(@Body() data: {
    approvalId: string;
    decision: 'approved' | 'denied';
    reason: string;
    source: string;
    sessionId: string;
    timestamp: string;
  }) {
    console.log(`🔄 同步Claude Code决策: ${data.approvalId} -> ${data.decision}`);

    const approval = await this.approvalService.getApproval(data.approvalId);
    if (!approval) {
      return { success: false, message: '审批记录不存在' };
    }

    // 如果3001还未决策，则同步Claude的决策
    if (approval.status === 'pending') {
      await this.approvalService.makeDecision(
        data.approvalId,
        data.decision === 'approved' ? 'approve' : 'deny',
        data.reason
      );

      const newStatus = data.decision === 'approved' ? EventStatus.APPROVED : EventStatus.BLOCKED;
      this.monitoringService.updateEventStatus(approval.eventId, newStatus);

      // WebSocket 广播
      this.webSocketGateway.server.emit('claude_decision_sync', {
        approvalId: data.approvalId,
        decision: data.decision,
        reason: data.reason,
        source: 'claude_code',
        command: approval.command,
        timestamp: data.timestamp
      });

      return { success: true, message: 'Claude Code决策已同步', currentStatus: data.decision };
    }

    return { success: true, message: '审批已处理，跳过同步', currentStatus: approval.status };
  }
}
