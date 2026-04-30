/**
 * Aegis Monitor TUI — blessed-based terminal UI.
 *
 * Layout:
 *   ┌──────────────────────────────────────────┐
 *   │  Aegis Monitor              [H]elp [Q]uit │
 *   │  🔴 Pending: 2                            │
 *   │──────────────────────────────────────────│
 *   │  ┌────────────────────────────────────┐  │
 *   │  │ #1 ⚠ [HERMES] 14:35:22             │  │
 *   │  │   rm -rf ./node_modules            │  │
 *   │  │   Rule: recursive delete           │  │
 *   │  │   [A]llow [D]eny [S]ession [W]ays │  │
 *   │  ├────────────────────────────────────┤  │
 *   │  │ #2 ⚠ [OCLAW] 14:35:25             │  │
 *   │  │   git push --force origin main     │  │
 *   │  │   Rule: git force push             │  │
 *   │  └────────────────────────────────────┘  │
 *   │──────────────────────────────────────────│
 *   │  History                                 │
 *   │  14:32  DENY   [HERMES] rm -rf /tmp/*   │
 *   └──────────────────────────────────────────┘
 */

import * as blessed from "blessed";
import { ApprovalRequest, ApprovalResolution, Decision } from "./types";
import { AegisDaemon } from "./socket/server";

export interface MonitorOptions {
  daemon: AegisDaemon;
}

/** Map decisions to display symbols */
const DECISION_SYMBOLS: Record<string, string> = {
  ALLOW: "✓",
  DENY: "✗",
  ALLOW_SESSION: "✓s",
  ALLOW_ALWAYS: "✓a",
};

/** Map decisions to colors */
const DECISION_COLORS: Record<string, string> = {
  ALLOW: "green",
  DENY: "red",
  ALLOW_SESSION: "yellow",
  ALLOW_ALWAYS: "cyan",
};

export function startMonitor(options: MonitorOptions): blessed.Widgets.Screen {
  const { daemon } = options;
  const queue = daemon.getQueue();

  // Create screen
  const screen = blessed.screen({
    smartCSR: true,
    title: "Aegis Monitor",
    dockBorders: true,
  });

  // ---- Header ----
  const header = blessed.box({
    top: 0,
    left: 0,
    width: "100%",
    height: 3,
    content: "{center}{bold}🛡 Aegis Monitor{/bold}{/center}",
    tags: true,
    style: {
      fg: "white",
      bg: "black",
      bold: true,
    },
  });

  // ---- Pending count ----
  const pendingLabel = blessed.text({
    top: 3,
    left: 0,
    width: "100%",
    height: 1,
    content: "No pending requests",
    tags: true,
    style: { fg: "gray" },
  });

  // ---- Pending requests list ----
  const pendingList = blessed.box({
    top: 4,
    left: 0,
    width: "100%",
    height: "60%",
    content: "",
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    vi: true,
    mouse: true,
    style: {
      fg: "white",
      bg: "black",
      focus: { bg: "blue" },
    },
    border: { type: "line" },
    label: " Pending ",
    tags: true,
  });

  // ---- History list ----
  const historyList = blessed.log({
    top: "60%+1",
    left: 0,
    width: "100%",
    height: "40%-2",
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    style: {
      fg: "gray",
      bg: "black",
    },
    border: { type: "line" },
    label: " History ",
    tags: true,
  });

  // ---- Help bar ----
  const helpBar = blessed.text({
    bottom: 0,
    left: 0,
    width: "100%",
    height: 1,
    content: " [A]llow  [D]eny  [S]ession  [W]ays  [I]nfo  [Q]uit  [H]elp ",
    style: { fg: "gray", bg: "black" },
  });

  // Append all elements
  screen.append(header);
  screen.append(pendingLabel);
  screen.append(pendingList);
  screen.append(historyList);
  screen.append(helpBar);

  // ---- State ----
  let blinkState = false;

  // ---- Render pending list ----
  function renderPending(): void {
    const pending = queue.getPending();
    const count = pending.length;

    if (count === 0) {
      pendingLabel.setContent("No pending requests");
      pendingLabel.style.fg = "gray";
      header.style.bg = "black";
      pendingList.setContent("");
    } else {
      // Blink effect
      const blinkColor = blinkState ? "red" : "black";
      pendingLabel.setContent(`{bold}{red-fg}⏳ Pending: ${count}{/red-fg}{/bold}`);
      pendingLabel.style.fg = "red";
      header.style.bg = blinkColor;

      // Render each pending request with enhanced context
      const lines: string[] = [];
      pending.forEach((req: ApprovalRequest, i: number) => {
        const num = i + 1;
        const agent = req.agentType.toUpperCase();
        const rule = req.triggeredRule?.description || "unknown";
        const time = new Date(req.timestamp).toLocaleTimeString();
        const severity = req.triggeredRule?.severity || 'error';
        const severityIcon = severity === 'block' ? '🔴' : severity === 'error' ? '⚠️' : '🟡';

        // Header line with severity and risk
        lines.push(`{bold}#${num} ${severityIcon} [{cyan-fg}${agent}{/cyan-fg}] ${time}{/bold}`);

        // Command line
        lines.push(`  {yellow-fg}${truncate(req.command, 70)}{/yellow-fg}`);

        // Basic rule info
        lines.push(`  {red-fg}Rule:{/red-fg} ${rule}`);

        // Enhanced context information
        if (req.context) {
          const ctx = req.context;

          // Command structure
          if (ctx.commandStructure) {
            const { flags = [] } = ctx.commandStructure;
            const dangerousFlags = flags.filter(f => ['force', 'f', 'hard', 'rf'].includes(f.name));
            if (dangerousFlags.length > 0) {
              lines.push(`  {red-fg}⚠ 危险选项:{/red-fg} ${dangerousFlags.map(f => `--${f.name}`).join(', ')}`);
            }
          }

          // Environment warnings
          const warnings: string[] = [];
          if (ctx.environment?.git?.isMainBranch) warnings.push('主分支');
          if (ctx.environment?.git?.hasUncommittedChanges) warnings.push('未提交更改');
          if (ctx.environment?.project?.isProduction) warnings.push('生产环境');
          if (ctx.environment?.system?.hasRoot) warnings.push('管理员权限');

          if (warnings.length > 0) {
            lines.push(`  {red-fg}🚨 环境警告:{/red-fg} ${warnings.join(', ')}`);
          }

          // Risk assessment
          if (ctx.riskAssessment) {
            const { level, score, impact } = ctx.riskAssessment;
            const riskColor = score >= 90 ? 'red-fg' : score >= 70 ? 'yellow-fg' : 'blue-fg';
            lines.push(`  {${riskColor}}📊 风险评级:{/${riskColor}} ${level} (${score}/100)`);

            // Impact summary
            const impacts: string[] = [];
            if (impact.dataLoss) impacts.push('数据丢失');
            if (impact.systemDamage) impacts.push('系统损害');
            if (impact.securityRisk) impacts.push('安全风险');
            if (!impact.reversible) impacts.push('不可逆');

            if (impacts.length > 0) {
              lines.push(`  {red-fg}💥 潜在影响:{/red-fg} ${impacts.join(', ')}`);
            }
          }

          // Quick suggestions (first alternative only to save space)
          if (ctx.suggestions?.alternatives && ctx.suggestions.alternatives.length > 0) {
            const firstAlt = ctx.suggestions.alternatives[0];
            lines.push(`  {green-fg}💡 建议:{/green-fg} ${truncate(firstAlt, 50)}`);
          }

          // Show if detailed explanation is available
          if (ctx.detailedExplanation) {
            lines.push(`  {gray-fg}详细分析可用，批准后显示{/gray-fg}`);
          }
        }

        // Action buttons
        lines.push(`  {green-fg}[A]{/green-fg}llow  {red-fg}[D]{/red-fg}eny  {yellow-fg}[S]{/yellow-fg}ession  {cyan-fg}[W]{/cyan-fg}ays  {blue-fg}[I]{/blue-fg}nfo`);
        lines.push("─".repeat(70)); // Separator line
      });

      pendingList.setContent(lines.join("\n"));
    }

    screen.render();
  }

  // ---- Render history ----
  function renderHistory(): void {
    const history = queue.getHistory(20);
    historyList.setContent(""); // clear

    history.forEach((res: ApprovalResolution) => {
      const symbol = DECISION_SYMBOLS[res.decision] || "?";
      const color = DECISION_COLORS[res.decision] || "white";
      const time = new Date(res.resolvedAt).toLocaleTimeString();
      historyList.log(`{${color}-fg}${symbol} {bold}${res.decision}{/bold} ${time}  #${res.id.slice(0, 8)}{/${color}-fg}`);
    });

    screen.render();
  }

  // ---- Handle key presses ----
  screen.key(["a", "d", "s", "w"], (ch, key) => {
    const pending = queue.getPending();
    if (pending.length === 0) return;

    // Always resolve the first pending request
    const req = pending[0];
    const decisionMap: Record<string, Decision> = {
      a: "ALLOW",
      d: "DENY",
      s: "ALLOW_SESSION",
      w: "ALLOW_ALWAYS",
    };

    const decision = decisionMap[ch];
    if (decision) {
      daemon.resolveRequest(req.id, decision);
      renderPending();
      renderHistory();
    }
  });

  // Show detailed information
  screen.key(["i"], () => {
    const pending = queue.getPending();
    if (pending.length === 0) return;

    const req = pending[0];
    let content = `详细风险分析 - ${req.command}\n\n`;

    if (req.context?.detailedExplanation) {
      content += req.context.detailedExplanation;
    } else {
      content += "暂无详细分析信息";
    }

    const detailDialog = blessed.message({
      border: { type: "line" },
      height: "80%",
      width: "80%",
      top: "center",
      left: "center",
      label: " 🔍 详细风险分析 ",
      content: content,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      tags: true,
      style: {
        fg: "white",
        bg: "black",
      }
    });

    screen.append(detailDialog);
    detailDialog.focus();

    detailDialog.key(["escape", "q", "i", "enter"], () => {
      screen.remove(detailDialog);
      screen.render();
    });
  });

  // Help
  screen.key(["h"], () => {
    const help = blessed.message({
      border: { type: "line" },
      height: "shrink",
      width: "half",
      top: "center",
      left: "center",
      label: " Help ",
      content: `
Aegis Monitor — Keyboard Shortcuts

  [A]  ALLOW         Allow this command once
  [D]  DENY          Deny this command
  [S]  ALLOW_SESSION Allow this command for the entire session
  [W]  ALLOW_ALWAYS  Permanently allow this command

  [I]  INFO          Show detailed risk analysis
  [Q]  Quit          Exit the monitor
  [H]  Help          Show this help

Monitor shows pending approval requests from your AI agents.
Press the corresponding key to make a decision.
      `,
    });
    screen.append(help);
    help.focus();

    help.key(["escape", "h", "q", "enter"], () => {
      screen.remove(help);
      screen.render();
    });
  });

  // Quit
  screen.key(["q", "escape", "C-c"], () => {
    screen.destroy();
    process.exit(0);
  });

  // ---- Blink timer ----
  const blinkTimer = setInterval(() => {
    blinkState = !blinkState;
    if (queue.pendingCount() > 0) {
      renderPending();
    }
  }, 500);

  // ---- Event listeners ----
  queue.on("queue-updated", () => {
    renderPending();
  });

  queue.on("resolved", () => {
    renderHistory();
  });

  screen.on("destroy", () => {
    clearInterval(blinkTimer);
  });

  // ---- Initial render ----
  renderPending();
  renderHistory();
  screen.render();

  return screen;
}

/** Truncate a string to maxLen characters */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}
