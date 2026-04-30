#!/usr/bin/env node
/**
 * Aegis CLI — AI Agent real-time dangerous operation interceptor.
 *
 * Usage:
 *   aegis monitor              Start the monitor TUI
 *   aegis run -- <agent-cmd>    Start monitor + run agent (auto two-terminal)
 *   aegis rules                 Show loaded rule summary
 */

import { Command } from "commander";
import * as path from "path";
import * as os from "os";
import { createDaemon } from "./socket/server";
import { startMonitor } from "./monitor";
import { loadRules } from "./rules/loader";
import { resolveRules } from "./rules/engine";
import { runSetup } from "./setup";

const program = new Command();

program
  .name("aegis")
  .description("AI Agent real-time dangerous operation interceptor — Zeus's shield")
  .version("0.1.0");

// ====================
// aegis setup
// ====================
program
  .command("setup")
  .description("One-time setup: generate config and detect agents")
  .option("--shell-only", "只配置Shell集成拦截")
  .option("--claude-only", "只配置Claude Code集成")
  .action(async (options) => {
    if (options.shellOnly) {
      console.log("🔧 配置Shell集成...");
      const { runShellIntegration } = await import('./setup-shell-integration');
      await runShellIntegration();
    } else if (options.claudeOnly) {
      console.log("🔗 配置Claude Code集成...");
      const { runClaudeIntegration } = await import('./setup-claude-integration');
      await runClaudeIntegration();
    } else {
      await runSetup();
    }
  });

// ====================
// aegis monitor
// ====================
program
  .command("monitor")
  .description("Start the Aegis Monitor TUI")
  .option("-c, --config <path>", "Path to aegis rules.yaml")
  .option("-s, --simple", "Use simple command-line mode (no TUI)")
  .action(async (options) => {
    const configPath = options.config || path.join(os.homedir(), ".aegis", "rules.yaml");

    console.log("Aegis Monitor starting...");
    console.log(`  Config: ${configPath}`);

    // Load rules
    console.log("  Loading rules...");
    const result = await loadRules(configPath);

    if (result.errors.length > 0) {
      console.log("  ⚠ Rule loading errors:");
      result.errors.forEach((e) => console.log(`    - ${e}`));
    }

    console.log(`  Rules loaded: ${result.rules.length} active (from ${result.sources.length} sources)`);
    console.log(`  Sources: ${result.sources.join(", ")}`);

    // Start daemon
    const daemon = await createDaemon({ port: 9876, host: "127.0.0.1" });
    daemon.setRules(result.rules);

    daemon.on("blocked", () => {
      // Already logged by daemon
    });

    console.log(`  Daemon ready on 127.0.0.1:9876`);
    console.log("");

    // Choose monitor mode
    if (options.simple) {
      const { startSimpleMonitor } = await import('./monitor-simple');
      await startSimpleMonitor({ daemon, config: configPath });
    } else {
      // Start monitor TUI
      startMonitor({ daemon });
    }
  });

// ====================
// aegis run
// ====================
program
  .command("run")
  .description("Run an Agent with Aegis protection")
  .option("-s, --socket <path>", "Unix socket path", "/tmp/aegis.sock")
  .argument("<agent>", "Agent to run (hermes, openclaw, etc.)")
  .argument("[args...]", "Arguments to pass to the agent")
  .action(async (agent, args, options) => {
    console.log(`Aegis: starting ${agent} ${(args || []).join(" ")}`);

    // Ensure daemon socket exists
    const net = await import("net");
    const sockReady = await new Promise<boolean>((resolve) => {
      const sock = new net.Socket();
      sock.connect(options.socket, () => {
        sock.destroy();
        resolve(true);
      });
      sock.on("error", () => resolve(false));
    });

    if (!sockReady) {
      console.log("Aegis daemon not running. Start it first: aegis monitor");
      console.log("Or run: aegis monitor &  (in another terminal)");
      process.exit(1);
    }

    // TODO: Set up Agent-specific integration (Hermes Plugin Hook, OpenClaw config)
    // For now, just inform the user
    console.log(`Aegis connected. Run your agent with protection configured.`);
    console.log("");
    console.log(`For Hermes: ensure aegis plugin is installed in hermes plugins/`);
    console.log(`For OpenClaw: set socket.path in exec-approvals.yaml to ${options.socket}`);
  });

// ====================
// aegis rules
// ====================
program
  .command("rules")
  .description("Show loaded rules")
  .option("-c, --config <path>", "Path to rules.yaml")
  .action(async (options) => {
    const configPath = options.config || path.join(os.homedir(), ".aegis", "rules.yaml");

    console.log(`Loading rules from: ${configPath}`);
    const result = await loadRules(configPath);

    if (result.errors.length > 0) {
      console.log("\n⚠ Errors:");
      result.errors.forEach((e) => console.log(`  - ${e}`));
    }

    console.log(`\nSources: ${result.sources.join(" → ")}`);
    console.log(`Active rules: ${result.rules.length}`);

    const bySeverity: Record<string, number> = {};
    result.rules.forEach((r) => {
      bySeverity[r.severity] = (bySeverity[r.severity] || 0) + 1;
    });

    console.log("\nBy severity:");
    if (bySeverity.block) console.log(`  🔴 block: ${bySeverity.block}`);
    if (bySeverity.error) console.log(`  🟡 error: ${bySeverity.error}`);
    if (bySeverity.warn) console.log(`  🔵 warn:  ${bySeverity.warn}`);

    if (Object.keys(result.overrides).length > 0) {
      console.log(`\nUser overrides: ${Object.keys(result.overrides).length}`);
      for (const [rule, severity] of Object.entries(result.overrides)) {
        console.log(`  "${rule}" → ${severity}`);
      }
    }
  });

program.parse();
