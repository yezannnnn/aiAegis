import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { AstParserService } from './ast-parser.service';
import { AstContextService } from './ast-context.service';
import { RuleMatcherService } from './rule-matcher.service';
import { CommandNode, RuleEvaluation, RuleSeverity } from './types';
import { ApprovalService } from '../approval/approval.service';
import { WebSocketGateway } from '../websocket/websocket.gateway';
import { MonitoringService } from '../monitoring/monitoring.service';
import { RiskLevel, EventStatus } from '../monitoring/dto';

interface EvaluateRequest {
  command: string;
  cwd?: string;
  requestId?: string;
  sessionId?: string;
  agentType?: string;
  model?: string;
  persona?: string;
  taskId?: string;
  userPrompt?: string;
  userInput?: string;
  assistPrompt?: string;
  lang?: string;
}

interface EvaluateResponse {
  requestId: string;
  command: string;
  ast: CommandNode;
  evaluation: RuleEvaluation;
  requiresApproval: boolean;
  approvalRequestId?: string;
}

@Controller('api/v1/rules')
export class RulesController {
  constructor(
    private readonly astParser: AstParserService,
    private readonly astContext: AstContextService,
    private readonly ruleMatcher: RuleMatcherService,
    private readonly approvalService: ApprovalService,
    private readonly webSocketGateway: WebSocketGateway,
    private readonly monitoringService: MonitoringService,
  ) {}

  /**
   * POST /api/v1/rules/evaluate
   * 核心评估接口：解析命令 → AST → 规则匹配 → 审批决策 → 广播3001
   */
  @Post('evaluate')
  async evaluate(@Body() body: EvaluateRequest): Promise<EvaluateResponse> {
    const requestId = body.requestId || `req_${Date.now()}`;

    // 1. 拆分 && / || / ; 链，对每个子命令独立评估，取最严格结果
    // 例：cd /tmp && git reset --hard HEAD → 分别评估 "cd /tmp" 和 "git reset --hard HEAD"
    const subCommands = this.splitCompoundCommand(body.command);

    // 2. 收集上下文（git分支、项目类型等）
    const context = await this.astContext.collectContext(body.cwd);

    // 3. 对每个子命令分别解析 + 规则匹配，取最严格结果
    const ACTION_SEVERITY = { block: 4, review: 3, warn: 2, allow: 1 };
    let ast = this.astParser.parse(subCommands[0]);
    let evaluation = this.ruleMatcher.evaluate(ast, context, body.cwd, body.lang);
    for (let i = 1; i < subCommands.length; i++) {
      const subAst = this.astParser.parse(subCommands[i]);
      const result = this.ruleMatcher.evaluate(subAst, context, body.cwd, body.lang);
      if ((ACTION_SEVERITY[result.action] ?? 0) > (ACTION_SEVERITY[evaluation.action] ?? 0)) {
        evaluation = result;
        ast = subAst; // 记录触发规则的那个子命令 AST
      }
    }

    // 所有命令都记录到事件列表
    // block   = 直接拒绝，不创建审批弹窗
    // review  = 需要人工审批，创建审批记录并广播弹窗
    // allow   = 放行，记录 ALLOWED
    // warn    = 放行，记录 WARNED
    const requiresApproval = evaluation.action === 'review';

    const actionToStatus: Record<string, EventStatus> = {
      allow:  EventStatus.ALLOWED,
      warn:   EventStatus.WARNED,
      block:  EventStatus.BLOCKED,
      review: EventStatus.PENDING,
    };

    let approvalRequestId: string | undefined;
    {
      // 创建监控事件（供3001事件列表显示）
      const eventStatus = actionToStatus[evaluation.action] ?? EventStatus.ALLOWED;
      const eventResult = await this.monitoringService.createEvent({
        command: body.command,
        agent: body.agentType || 'Claude Code',
        sessionId: body.sessionId || 'unknown',
        risk: this.severityToRisk(evaluation.severity),
        status: eventStatus,
        description: evaluation.reason,
        cwd: body.cwd,
        model: body.model,
        persona: body.persona,
        taskId: body.taskId,
        userPrompt: body.userPrompt,
        userInput: body.userInput,
        assistPrompt: body.assistPrompt,
        matchedRules: evaluation.matchedRules || [],
        approvalId: requiresApproval ? requestId : undefined,
      });

      if (requiresApproval) {
        const eventId = eventResult.data.id;

        // 创建审批记录（SQLite，供轮询查询）
        await this.approvalService.createRequest({
          requestId,
          eventId,
          command: body.command,
          ast,
          context,
          evaluation,
          source: 'rule-engine',
          agent: body.agentType || 'Claude Code',
        });

        approvalRequestId = requestId;

        // WebSocket 广播给前端（触发审批弹窗）
        this.webSocketGateway.broadcastApprovalRequest({
          approvalId: requestId,
          sessionId: body.sessionId || 'unknown',
          command: body.command,
          cwd: body.cwd,
          agent: body.agentType || 'Claude Code',
          risk: this.severityToRisk(evaluation.severity),
          reason: evaluation.reason,
          matchedRules: evaluation.matchedRules || [],
          userInput: body.userInput,
          assistPrompt: body.assistPrompt,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return {
      requestId,
      command: body.command,
      ast,
      evaluation,
      requiresApproval,
      approvalRequestId,
    };
  }

  private severityToRisk(severity: RuleSeverity): RiskLevel {
    const map: Record<string, RiskLevel> = {
      off: RiskLevel.LOW,
      warn: RiskLevel.MEDIUM,
      error: RiskLevel.HIGH,
      block: RiskLevel.CRITICAL,
    };
    return map[severity] || RiskLevel.MEDIUM;
  }

  /**
   * GET /api/v1/rules
   * 查看所有规则
   */
  @Get()
  getAllRules() {
    return {
      rules: this.ruleMatcher.getAllRules(),
      count: this.ruleMatcher.getAllRules().length,
    };
  }

  /**
   * GET /api/v1/rules/sets
   * 查看规则集列表
   */
  @Get('sets')
  getRuleSets() {
    return {
      sets: ['git', 'docker', 'database', 'filesystem', 'network', 'development'],
    };
  }

  /**
   * GET /api/v1/rules/info
   * 规则来源统计（内置/用户/项目）
   */
  @Get('info')
  getRulesInfo() {
    return this.ruleMatcher.getRulesSummary();
  }

  /**
   * POST /api/v1/rules/reload
   * 热更新规则（含用户规则）
   */
  @Post('reload')
  reloadRules() {
    this.ruleMatcher.reloadRules();
    const summary = this.ruleMatcher.getRulesSummary();
    return { success: true, message: 'Rules reloaded', summary };
  }

  /**
   * Split a compound shell command on && / || / ; into individual sub-commands.
   * Respects single/double quotes so quoted ; or && are not treated as separators.
   */
  private splitCompoundCommand(raw: string): string[] {
    const results: string[] = [];
    let current = '';
    let inSingle = false;
    let inDouble = false;

    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (ch === "'" && !inDouble) { inSingle = !inSingle; current += ch; continue; }
      if (ch === '"' && !inSingle) { inDouble = !inDouble; current += ch; continue; }
      if (!inSingle && !inDouble) {
        if ((ch === '&' && raw[i + 1] === '&') || (ch === '|' && raw[i + 1] === '|')) {
          if (current.trim()) results.push(current.trim());
          current = ''; i++; continue;
        }
        if (ch === ';') {
          if (current.trim()) results.push(current.trim());
          current = ''; continue;
        }
      }
      current += ch;
    }
    if (current.trim()) results.push(current.trim());
    return results.length > 0 ? results : [raw];
  }
}
