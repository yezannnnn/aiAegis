#!/usr/bin/env node
/**
 * Aegis Setup — One-time initialization for cross-platform Agent integration.
 *
 * Generates ~/.aegis/config.yaml and configures environment variables.
 * Detects installed Agent CLIs and auto-enables them.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as child_process from "child_process";

const AEGIS_DIR = path.join(os.homedir(), ".aegis");
const CONFIG_PATH = path.join(AEGIS_DIR, "config.json");

interface AgentConfig {
  name: string;
  command: string;
  enabled: "auto" | boolean;
}

const AGENTS: AgentConfig[] = [
  { name: "hermes", command: "hermes", enabled: "auto" },
  { name: "openclaw", command: "openclaw", enabled: "auto" },
  { name: "codex", command: "codex", enabled: "auto" },
  { name: "cursor", command: "cursor", enabled: "auto" },
  { name: "claude-code", command: "claude", enabled: "auto" },
];

/** Check if a command exists in PATH */
function commandExists(cmd: string): boolean {
  try {
    const check = os.platform() === "win32" ? `where ${cmd}` : `which ${cmd}`;
    child_process.execSync(check, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Detect which agents are installed */
function detectAgents(): Record<string, boolean> {
  const detected: Record<string, boolean> = {};
  for (const agent of AGENTS) {
    detected[agent.name] = commandExists(agent.command);
  }
  return detected;
}

/** Generate default config */
function generateConfig(detected: Record<string, boolean>): string {
  const agents: Record<string, { enabled: boolean }> = {};
  for (const agent of AGENTS) {
    const isInstalled = detected[agent.name];
    agents[agent.name] = {
      enabled: agent.enabled === "auto" ? isInstalled : agent.enabled,
    };
  }

  const config = {
    version: "1.0",
    daemon: {
      host: "127.0.0.1",
      port: 9876,
    },
    agents,
  };

  return JSON.stringify(config, null, 2);
}

/** Write environment variables to shell profile */
function setupShellEnv(): void {
  const platform = os.platform();
  const exports = [
    `export AEGIS_HOST=127.0.0.1`,
    `export AEGIS_PORT=9876`,
    `export AEGIS_ENABLED=1`,
  ];

  if (platform === "win32") {
    // Windows: write to PowerShell profile and CMD batch file
    const psProfile = path.join(os.homedir(), "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1");
    const psExports = exports.map((e) => `$env:${e.replace("export ", "").replace("=", " = ")}`);

    if (fs.existsSync(path.dirname(psProfile))) {
      fs.appendFileSync(psProfile, "\n# Aegis Environment\n" + psExports.join("\n") + "\n");
      console.log("  ✓ PowerShell profile updated");
    }

    // CMD fallback
    const cmdEnv = path.join(AEGIS_DIR, "env.bat");
    fs.writeFileSync(cmdEnv, "@echo off\n" + exports.map((e) => `set ${e.replace("export ", "")}`).join("\n") + "\n");
    console.log(`  ✓ CMD env file: ${cmdEnv}`);
    console.log("    Run 'call ~/.aegis/env.bat' in CMD to load");
  } else {
    // macOS/Linux
    const shell = process.env.SHELL || "/bin/bash";
    const isZsh = shell.includes("zsh");
    const profile = isZsh ? path.join(os.homedir(), ".zshrc") : path.join(os.homedir(), ".bashrc");

    const marker = "# Aegis Environment";
    const content = fs.readFileSync(profile, "utf8");

    if (content.includes(marker)) {
      console.log(`  ⚠ Aegis env already in ${profile}`);
      return;
    }

    fs.appendFileSync(profile, "\n" + marker + "\n" + exports.join("\n") + "\n");
    console.log(`  ✓ Shell profile updated: ${profile}`);
    console.log("    Run 'source " + profile + "' or restart terminal");
  }
}

/** Install Hermes plugin to ~/.hermes/plugins/aegis/ */
function installHermesPlugin(): void {
  const hermesPluginsDir = path.join(os.homedir(), ".hermes", "plugins", "aegis");
  // ESM compatible path resolution
  const pluginSource = path.join(process.cwd(), "src", "plugins", "hermes.py");
  const pluginYamlSource = path.join(process.cwd(), "src", "plugins", "plugin.yaml");

  if (!fs.existsSync(hermesPluginsDir)) {
    fs.mkdirSync(hermesPluginsDir, { recursive: true });
  }

  // Copy __init__.py (hermes.py)
  if (fs.existsSync(pluginSource)) {
    fs.copyFileSync(pluginSource, path.join(hermesPluginsDir, "__init__.py"));
    console.log(`    ✓ Plugin installed: ${hermesPluginsDir}/__init__.py`);
  } else {
    console.log(`    ⚠ Plugin source not found: ${pluginSource}`);
    console.log(`      Please manually copy src/plugins/hermes.py to ${hermesPluginsDir}/__init__.py`);
  }

  // Copy plugin.yaml
  if (fs.existsSync(pluginYamlSource)) {
    fs.copyFileSync(pluginYamlSource, path.join(hermesPluginsDir, "plugin.yaml"));
    console.log(`    ✓ Plugin manifest: ${hermesPluginsDir}/plugin.yaml`);
  }
}

/** Main setup */
export async function runSetup(): Promise<void> {
  console.log("\n🛡 Aegis Setup\n");

  // Create .aegis directory
  if (!fs.existsSync(AEGIS_DIR)) {
    fs.mkdirSync(AEGIS_DIR, { recursive: true });
    console.log("  ✓ Created ~/.aegis/");
  }

  // Detect agents
  console.log("\n  Detecting Agent CLIs...");
  const detected = detectAgents();
  for (const [name, found] of Object.entries(detected)) {
    console.log(`    ${found ? "✓" : "✗"} ${name}`);
  }

  // Generate config
  const config = generateConfig(detected);
  fs.writeFileSync(CONFIG_PATH, config);
  console.log(`\n  ✓ Config written: ${CONFIG_PATH}`);

  // Setup shell environment
  console.log("\n  Configuring shell environment...");
  setupShellEnv();

  // Setup Shell integration (command interception)
  console.log("\n  🔧 配置Shell命令拦截...");
  try {
    const { runShellIntegration } = await import('./setup-shell-integration');
    await runShellIntegration();
    console.log("    ✓ Shell拦截配置完成");
  } catch (error) {
    console.log("    ⚠ Shell拦截配置失败:", error);
    console.log("    💡 可稍后运行: aegis setup --shell-only");
  }

  // Setup Claude Code integration
  console.log("\n  🔗 配置Claude Code集成...");
  try {
    const { runClaudeIntegration } = await import('./setup-claude-integration');
    await runClaudeIntegration();
  } catch (error) {
    console.log("    ⚠ Claude集成配置失败:", error);
    console.log("    💡 可稍后运行: aegis setup --claude-only");
  }

  // Install Hermes plugin
  if (detected.hermes) {
    console.log("\n  Installing Hermes plugin...");
    installHermesPlugin();
  }

  // Summary
  const enabledAgents = Object.entries(detected)
    .filter(([_, v]) => v)
    .map(([k]) => k);

  console.log("\n📋 Summary:");
  console.log(`  Daemon: 127.0.0.1:9876`);
  console.log(`  Agents enabled: ${enabledAgents.join(", ") || "none"}`);
  console.log(`  Shell拦截: 已配置到 ~/.aegis/shell/`);
  console.log(`\n  📋 Next steps:`);
  console.log(`    1. 重启终端或运行: source ~/.bashrc`);
  console.log(`    2. 启动监控: aegis monitor`);
  console.log(`    3. 测试拦截: ~/.aegis/test-protection.sh`);
  console.log(`\n  💡 Claude Code已自动保护 (通过Shell拦截)`);
  console.log("");
}

// CLI entry
if (require.main === module) {
  runSetup().catch((e) => {
    console.error("Setup failed:", e);
    process.exit(1);
  });
}
