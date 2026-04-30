/**
 * Aegis Daemon — TCP socket server that receives approval requests from Agents.
 *
 * Protocol: JSONL (one JSON object per line, newline-delimited).
 * Holds socket connections open while waiting for Monitor TUI decisions.
 *
 * Uses TCP socket for cross-platform support (macOS/Linux/Windows).
 */

import * as net from "net";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { execSync } from "child_process";
import { EventEmitter } from "events";
import {
  ApprovalRequest,
  Decision,
  SocketMessage,
} from "../types";
import { MatchResult } from "../types";
import { ApprovalQueue } from "../approval/queue";
import { matchCommand, EngineConfig } from "../rules/engine";
import { astEngine } from "../rules/ast-engine";
import { ResolvedRule } from "../types";

export interface DaemonOptions {
  port?: number;
  host?: string;
  engineConfig?: EngineConfig;
}

const DEFAULT_PORT = 9876;
const DEFAULT_HOST = "127.0.0.1";

/** Find the user's active TTY device for terminal output */
function findUserTTY(): string | null {
  try {
    const result = execSync("tty 2>/dev/null || echo ''", {
      timeout: 1000, encoding: "utf-8",
    }).trim();
    return result || null;
  } catch {
    return null;
  }
}

/** Send a terminal notification to alert the user about a pending approval request.
 *  When Monitor TUI is running, we skip terminal banner to avoid corrupting the UI.
 *  Uses multiple mechanisms for reliability across environments:
 *  1. Terminal bell (audible + visual in most terminals)
 *  2. ANSI banner to all active TTYs (only when no Monitor TUI)
 *  3. tmux notification if running in tmux
 *  4. macOS notification as last-resort fallback only
 */
function notifyUser(req: ApprovalRequest, hasMonitor: boolean = false): void {
  try {
    const severity = req.triggeredRule?.severity || "error";
    const severityLabel = severity === "block" ? "BLOCKED" : "NEEDS APPROVAL";
    const ruleDesc = req.triggeredRule?.description || "Unknown rule";
    const cmd = req.command.slice(0, 100);

    // 1. Terminal bell — 3 rings (always, even with Monitor)
    for (let i = 0; i < 3; i++) {
      try { process.stdout.write("\x07"); } catch {}
    }

    // 2. ANSI banner to TTYs — skip if Monitor TUI is active (it already shows the request)
    if (!hasMonitor) {
      const banner = [
        "",
        "\x1b[1;31m╔══════════════════════════════════════════════════╗\x1b[0m",
        `\x1b[1;31m║  🛡 AEGIS ${severityLabel.padEnd(42)}\x1b[0m`,
        `\x1b[1;33m║  ${ruleDesc.slice(0, 46).padEnd(46)}\x1b[0m`,
        `\x1b[1;37m║  ${cmd.slice(0, 46).padEnd(46)}\x1b[0m`,
        severity === "block"
          ? "\x1b[1;31m║  Auto-denied — hardline rule                  ║\x1b[0m"
          : "\x1b[1;33m║  Open Aegis Monitor to approve/deny           ║\x1b[0m",
        "\x1b[1;31m╚══════════════════════════════════════════════════╝\x1b[0m",
        "",
      ].join("\n");

      try {
        const user = process.env.USER || process.env.LOGNAME || "unknown";
        const ttys = execSync(
          `who | grep "^${user} " | awk '{print $2}' | sort -u`,
          { timeout: 2000, encoding: "utf-8" }
        ).trim().split("\n").filter(Boolean);

        for (const tty of ttys) {
          const ttyPath = tty.startsWith("/dev/") ? tty : `/dev/${tty}`;
          try {
            fs.writeFileSync(ttyPath, banner + "\n", { flag: "a" });
          } catch {}
        }

        const myTty = process.stdout.isTTY ? undefined : execSync("tty 2>/dev/null || echo ''", { timeout: 500, encoding: "utf-8" }).trim();
        if (myTty && !ttys.some(t => myTty.endsWith(t))) {
          try { fs.writeFileSync(myTty, banner + "\n", { flag: "a" }); } catch {}
        }
      } catch {}
    }

    // 3. tmux notification (if in tmux session)
    if (process.env.TMUX) {
      try {
        execSync(
          `tmux display-message -d 5000 "\x1b[1;31m🛡 AEGIS ${severityLabel}: ${ruleDesc} — ${cmd}\x1b[0m"`,
          { timeout: 1000 }
        );
      } catch {}
    }

    // 4. macOS notification — last resort
    try {
      const title = `Aegis ${severityLabel}: ${req.agentType.toUpperCase()}`;
      const body = `${ruleDesc}\n${cmd}`;
      execSync(
        `osascript -e 'display notification "${body.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}" sound name "Glass"'`,
        { timeout: 2000 },
      );
    } catch {
      // macOS notification is optional
    }
  } catch {
    // Notification is best-effort; silently ignore all failures
  }
}

export class AegisDaemon extends EventEmitter {
  private server: net.Server | null = null;
  private queue: ApprovalQueue;
  private rules: ResolvedRule[] = [];
  private engineConfig: EngineConfig;

  /** Map of request ID → waiting Agent socket */
  private waitingSockets: Map<string, net.Socket> = new Map();

  private port: number;
  private host: string;

  constructor(options: DaemonOptions = {}) {
    super();
    this.port = options.port || DEFAULT_PORT;
    this.host = options.host || DEFAULT_HOST;
    this.engineConfig = options.engineConfig || { defaultMode: "allow" };
    this.queue = new ApprovalQueue();

    this.queue.on("new-request", (req) => this.emit("new-request", req));
    this.queue.on("queue-updated", (count) => this.emit("queue-updated", count));
    this.queue.on("resolved", (res, req) => {
      // When monitor resolves, send response to the waiting Agent socket
      const sock = this.waitingSockets.get(res.id);
      if (sock) {
        this.sendResponse(sock, {
          type: "approval_resolution",
          payload: res,
        });
        this.waitingSockets.delete(res.id);
        // Close the socket — agent will reconnect for next request
        try { sock.end(); } catch {}
      }
      this.emit("resolved", res, req);
    });
  }

  setRules(rules: ResolvedRule[]): void { this.rules = rules; }
  getQueue(): ApprovalQueue { return this.queue; }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = net.createServer((socket) => this.handleConnection(socket));
      this.server.listen(this.port, this.host, () => {
        this.emit("started", `${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  stop(): void {
    // Close all waiting sockets
    this.waitingSockets.forEach((sock, id) => {
      try { sock.end(); } catch {}
    });
    this.waitingSockets.clear();

    if (this.server) { this.server.close(); this.server = null; }
    this.emit("stopped");
  }

  private handleConnection(socket: net.Socket): void {
    let buffer = "";

    socket.on("data", (data: Buffer) => {
      buffer += data.toString("utf-8");
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed) as SocketMessage;
          this.handleMessage(msg, socket);
        } catch {}
      }
    });

    socket.on("error", () => {});
  }

  private async handleMessage(msg: SocketMessage, socket: net.Socket): Promise<void> {
    if (msg.type === "approval_request") {
      await this.processApprovalRequest(msg.payload, socket);
    }
  }

  private async processApprovalRequest(
    payload: ApprovalRequest,
    socket: net.Socket,
  ): Promise<void> {
    const req: ApprovalRequest = {
      id: payload.id || crypto.randomUUID(),
      command: payload.command,
      argv: payload.argv,
      cwd: payload.cwd,
      agentType: payload.agentType || "hermes",
      sessionKey: payload.sessionKey,
      timestamp: payload.timestamp || Date.now(),
    };

    // Check session allowlist
    if (this.queue.isSessionAllowed(req.sessionKey, req.triggeredRule?.description)) {
      this.sendResponse(socket, {
        type: "approval_resolution",
        payload: { id: req.id, decision: "ALLOW", resolvedAt: Date.now() },
      });
      return;
    }

    // AST-based rule matching with enhanced context
    const match = await astEngine.matchCommand(
      req.command,
      req.cwd || process.cwd(),
      this.engineConfig
    );

    // Collect detailed risk report for enhanced context
    const detailedReport = await astEngine.getDetailedRiskReport(
      req.command,
      req.cwd || process.cwd()
    );

    if (match.matched && match.description) {
      req.triggeredRule = {
        severity: match.severity || "error",
        description: match.description,
        source: match.source,
      };

      // Add rich context information
      req.context = {
        commandStructure: detailedReport.ast,
        environment: detailedReport.context,
        riskAssessment: detailedReport.assessment,
        suggestions: match.metadata?.suggestions,
        detailedExplanation: this.buildDetailedExplanation(match, detailedReport)
      };
    }

    if (match.matched) {
      switch (match.severity) {
        case "block":
          this.sendResponse(socket, {
            type: "denied",
            payload: { id: req.id, reason: `BLOCKED: ${match.description}` },
          });
          this.emit("blocked", req);
          notifyUser(req);
          return;

        case "warn":
          this.queue.enqueue(req);
          this.queue.resolve(req.id, "ALLOW");
          this.sendResponse(socket, {
            type: "approval_resolution",
            payload: { id: req.id, decision: "ALLOW", resolvedAt: Date.now() },
          });
          return;

        case "error":
          // HOLD the socket — wait for Monitor TUI decision
          this.waitingSockets.set(req.id, socket);
          this.queue.enqueue(req);
          notifyUser(req, true); // hasMonitor = true, skip terminal banner
          return;
      }
    }

    // No match → allow
    this.sendResponse(socket, {
      type: "approval_resolution",
      payload: { id: req.id, decision: "ALLOW", resolvedAt: Date.now() },
    });
  }

  /** Called by Monitor TUI when user makes a decision */
  resolveRequest(id: string, decision: Decision): void {
    // Guard: if request already resolved (e.g. duplicate keypress), ignore
    const pending = this.queue.getPending();
    const req = pending.find((r) => r.id === id);
    if (!req) return;
    if ((req as any)._resolved) return;
    (req as any)._resolved = true;

    this.queue.resolve(id, decision);
    // The 'resolved' event handler above will send the response to the waiting socket
  }

  private sendResponse(socket: net.Socket, msg: SocketMessage): void {
    try { socket.write(JSON.stringify(msg) + "\n"); } catch {}
  }

  /**
   * 构建详细的风险解释，帮助用户理解拦截原因
   */
  private buildDetailedExplanation(match: any, detailedReport: any): string {
    const parts: string[] = [];

    // 命令结构分析
    if (detailedReport.ast) {
      const { binary, subcommand, flags = [], arguments: args = [] } = detailedReport.ast;
      parts.push(`🔍 命令结构分析:`);
      parts.push(`   主命令: ${binary}`);
      if (subcommand) parts.push(`   子命令: ${subcommand}`);
      if (flags.length > 0) {
        parts.push(`   危险选项: ${flags.map((f: any) => `--${f.name}${f.value ? `=${f.value}` : ''}`).join(', ')}`);
      }
      if (args.length > 0) {
        parts.push(`   目标参数: ${args.slice(0, 3).join(', ')}${args.length > 3 ? '...' : ''}`);
      }
      parts.push('');
    }

    // 环境上下文
    if (detailedReport.context) {
      parts.push(`🌍 环境上下文:`);

      const { git, project, system } = detailedReport.context;

      if (git?.isRepo) {
        parts.push(`   Git状态: ${git.currentBranch} 分支${git.isMainBranch ? ' (主分支 ⚠️)' : ''}`);
        if (git.hasUncommittedChanges) parts.push(`   ⚠️ 有未提交更改`);
        if (git.hasUnpushedCommits) parts.push(`   ⚠️ 有未推送提交`);
      }

      if (project?.type !== 'unknown') {
        parts.push(`   项目类型: ${project.type}${project.isProduction ? ' (生产环境 🔴)' : ''}`);
        if (project.hasDatabaseConfig) parts.push(`   ⚠️ 检测到数据库配置`);
      }

      if (system?.hasRoot) {
        parts.push(`   🔴 以管理员权限运行`);
      }

      parts.push('');
    }

    // 风险评估
    if (detailedReport.assessment) {
      const { level, score, reasoning, impact } = detailedReport.assessment;
      parts.push(`⚡ 风险评估:`);
      parts.push(`   风险级别: ${level} (${score}/100)`);

      if (reasoning.length > 0) {
        parts.push(`   风险原因:`);
        reasoning.forEach((reason: string) => {
          parts.push(`     • ${reason}`);
        });
      }

      // 影响分析
      const impacts: string[] = [];
      if (impact.dataLoss) impacts.push('数据丢失');
      if (impact.systemDamage) impacts.push('系统损害');
      if (impact.securityRisk) impacts.push('安全风险');
      if (!impact.reversible) impacts.push('不可逆转');

      if (impacts.length > 0) {
        parts.push(`   潜在影响: ${impacts.join(', ')}`);
      }

      parts.push('');
    }

    // 安全建议
    if (match.metadata?.suggestions) {
      const { alternatives, safetyChecks, mitigations } = match.metadata.suggestions;

      if (alternatives && alternatives.length > 0) {
        parts.push(`💡 推荐替代方案:`);
        alternatives.forEach((alt: string) => {
          parts.push(`   • ${alt}`);
        });
        parts.push('');
      }

      if (safetyChecks && safetyChecks.length > 0) {
        parts.push(`✅ 执行前检查:`);
        safetyChecks.forEach((check: string) => {
          parts.push(`   • ${check}`);
        });
        parts.push('');
      }

      if (mitigations && mitigations.length > 0) {
        parts.push(`🛡️ 风险缓解措施:`);
        mitigations.forEach((mit: string) => {
          parts.push(`   • ${mit}`);
        });
      }
    }

    return parts.join('\n');
  }
}

export async function createDaemon(options: DaemonOptions = {}): Promise<AegisDaemon> {
  const daemon = new AegisDaemon(options);
  await daemon.start();
  return daemon;
}
