#!/usr/bin/env node
/**
 * Aegis Simple Monitor - 命令行版本，避免TUI布局问题
 */

import { createDaemon } from "./socket/server";
import { loadRules } from "./rules/loader";
import * as path from "path";
import * as os from "os";

interface MonitorOptions {
  daemon?: any;
  config?: string;
}

export async function startSimpleMonitor(options: MonitorOptions = {}): Promise<void> {
  const configPath = options.config || path.join(os.homedir(), ".aegis", "rules.yaml");

  console.log("🛡️  Aegis Monitor (Simple Mode)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // 如果传入了现有的daemon，直接使用
  let daemon = options.daemon;

  if (!daemon) {
    console.log(`📋 Config: ${configPath}`);

    // Load rules
    console.log("📖 Loading rules...");
    const result = await loadRules(configPath);

    if (result.errors.length > 0) {
      console.log("⚠️  Rule loading errors:");
      result.errors.forEach((e) => console.log(`   - ${e}`));
    }

    console.log(`✅ Rules loaded: ${result.rules.length} active (from ${result.sources.length} sources)`);
    console.log(`📦 Sources: ${result.sources.join(", ")}`);

    // Start daemon
    console.log("\n🚀 Starting daemon...");
    daemon = await createDaemon({ port: 9876, host: "127.0.0.1" });
    daemon.setRules(result.rules);
  } else {
    console.log("📦 Using existing daemon...");
  }

  console.log(`✅ Daemon ready on 127.0.0.1:9876`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  // Event handlers
  daemon.on("new-request", (req) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`\n⏰ [${timestamp}] New Request:`);
    console.log(`   🎯 Agent: ${req.agentType}`);
    console.log(`   📝 Command: ${req.command.substring(0, 80)}${req.command.length > 80 ? '...' : ''}`);
    console.log(`   📁 CWD: ${req.cwd}`);

    if (req.triggeredRule) {
      console.log(`   ⚡ Rule: ${req.triggeredRule.severity.toUpperCase()} - ${req.triggeredRule.description}`);
    }
  });

  daemon.on("resolved", (res, req) => {
    const timestamp = new Date().toLocaleTimeString();
    const decision = res.decision;
    const icon = decision === 'ALLOW' ? '✅' : decision === 'DENY' ? '🚫' : '⚠️';

    console.log(`\n⏰ [${timestamp}] Request Resolved:`);
    console.log(`   ${icon} Decision: ${decision}`);
    console.log(`   📝 Command: ${req?.command?.substring(0, 80)}${(req?.command?.length || 0) > 80 ? '...' : ''}`);
    if (res.reason) {
      console.log(`   💭 Reason: ${res.reason}`);
    }
    console.log(`   ─────────────────────────────────────────────`);
  });

  daemon.on("blocked", (req) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`\n🛡️  [${timestamp}] COMMAND BLOCKED:`);
    console.log(`   🎯 Agent: ${req.agentType}`);
    console.log(`   📝 Command: ${req.command.substring(0, 80)}${req.command.length > 80 ? '...' : ''}`);
    console.log(`   ⚡ Reason: ${req.triggeredRule?.description || 'Security rule triggered'}`);
    console.log(`   ⚠️  Risk Level: ${req.triggeredRule?.severity?.toUpperCase() || 'HIGH'}`);
    console.log(`   ─────────────────────────────────────────────`);
  });

  // Queue status updates
  daemon.on("queue-updated", (count) => {
    if (count > 0) {
      console.log(`\n📊 Queue Status: ${count} pending request${count > 1 ? 's' : ''}`);
    }
  });

  console.log("🎯 Monitor is running...");
  console.log("💡 Press Ctrl+C to stop");
  console.log("📝 Logs will appear here when commands are intercepted");
  console.log("");

  // Keep alive
  process.on('SIGINT', () => {
    console.log('\n👋 Aegis Monitor stopping...');
    daemon.stop();
    process.exit(0);
  });
}

// CLI entry
if (require.main === module) {
  startSimpleMonitor().catch((e) => {
    console.error("Monitor failed:", e);
    process.exit(1);
  });
}