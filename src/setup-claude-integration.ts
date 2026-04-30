#!/usr/bin/env node
/**
 * Aegis Claude Code集成安装脚本
 *
 * 检测Claude Code安装，配置PreToolUse hook，更新用户settings.json
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const AEGIS_DIR = path.join(os.homedir(), ".aegis");

interface ClaudeSettings {
  permissions?: {
    allow?: string[];
  };
  enabledPlugins?: Record<string, boolean>;
  hooks?: {
    PreToolUse?: Array<{
      matcher: string;
      hooks: Array<{
        type: string;
        command: string;
        timeout?: number;
      }>;
      description: string;
    }>;
  };
}

/** 检查Claude Code是否安装 */
function checkClaudeInstalled(): boolean {
  try {
    execSync("claude --version", { stdio: "ignore" });
    return fs.existsSync(CLAUDE_DIR);
  } catch {
    return false;
  }
}

/** 安装Aegis Claude Hook */
function installAegisHook(): void {
  const hookSource = path.join(process.cwd(), "src", "integrations", "claude-hook.js");
  const hookTarget = path.join(AEGIS_DIR, "claude-hook.js");

  if (!fs.existsSync(hookSource)) {
    throw new Error(`Hook source not found: ${hookSource}`);
  }

  // 确保 .aegis 目录存在
  if (!fs.existsSync(AEGIS_DIR)) {
    fs.mkdirSync(AEGIS_DIR, { recursive: true });
  }

  // 复制hook脚本
  fs.copyFileSync(hookSource, hookTarget);
  fs.chmodSync(hookTarget, "755");

  console.log(`    ✓ Hook installed: ${hookTarget}`);
}

/** 更新Claude settings.json */
function updateClaudeSettings(): void {
  const settingsPath = path.join(CLAUDE_DIR, "settings.json");
  let settings: ClaudeSettings = {};

  // 读取现有配置
  if (fs.existsSync(settingsPath)) {
    try {
      const content = fs.readFileSync(settingsPath, "utf8");
      settings = JSON.parse(content);
    } catch (error) {
      console.log(`    ⚠ 无法解析现有settings.json: ${error}`);
      settings = {};
    }
  }

  // 添加Aegis hook配置
  if (!settings.hooks) {
    settings.hooks = {};
  }

  if (!settings.hooks.PreToolUse) {
    settings.hooks.PreToolUse = [];
  }

  // 检查是否已经配置了Aegis hook
  const existingAegisHook = settings.hooks.PreToolUse.find(
    h => h.description?.includes("Aegis")
  );

  if (!existingAegisHook) {
    settings.hooks.PreToolUse.push({
      matcher: "Bash",
      hooks: [
        {
          type: "command",
          command: "node ~/.aegis/claude-hook.js",
          timeout: 5
        }
      ],
      description: "Aegis safety check for dangerous Bash commands"
    });

    // 写入更新的配置
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    console.log(`    ✓ Updated Claude settings: ${settingsPath}`);
  } else {
    console.log(`    ✓ Aegis hook already configured in Claude settings`);
  }
}

/** 测试集成 */
function testIntegration(): boolean {
  try {
    const hookPath = path.join(AEGIS_DIR, "claude-hook.js");
    if (!fs.existsSync(hookPath)) {
      console.log(`    ✗ Hook file missing: ${hookPath}`);
      return false;
    }

    // 测试hook脚本语法
    try {
      execSync(`node -c "${hookPath}"`, { stdio: "ignore" });
      console.log(`    ✓ Hook syntax validation passed`);
    } catch {
      console.log(`    ✗ Hook syntax validation failed`);
      return false;
    }

    return true;
  } catch (error) {
    console.log(`    ✗ Integration test failed: ${error}`);
    return false;
  }
}

/** 显示使用说明 */
function showUsageInstructions(): void {
  console.log(`
📋 Claude Code集成完成！

🔧 使用方式:
   1. 启动Aegis监控: aegis monitor
   2. 在Claude Code中执行命令，危险操作会被自动拦截
   3. 在Aegis Monitor中审批或拒绝操作

⚠️ 注意事项:
   • 如果Aegis daemon未运行，会使用基本规则检查
   • 高级风险评估需要启动 'aegis monitor'
   • hook响应时间限制为5秒，超时自动允许执行

🧪 测试拦截:
   在Claude Code中尝试执行: git push --force origin main
   应该会被Aegis拦截并显示风险提示

💡 如需禁用:
   编辑 ~/.claude/settings.json，移除hooks.PreToolUse中的Aegis配置
`);
}

/** 主函数 */
export async function runClaudeIntegration(): Promise<void> {
  console.log("\n🔗 配置Claude Code集成...");

  // 检查Claude安装
  if (!checkClaudeInstalled()) {
    console.log("    ✗ Claude Code未安装或未找到配置目录");
    console.log("    💡 请先安装Claude Code: https://claude.ai/code");
    return;
  }
  console.log("    ✓ 检测到Claude Code");

  try {
    // 安装hook脚本
    installAegisHook();

    // 更新Claude配置
    updateClaudeSettings();

    // 测试集成
    const testPassed = testIntegration();

    if (testPassed) {
      console.log("    ✓ Claude Code集成测试通过");
      showUsageInstructions();
    } else {
      console.log("    ⚠ Claude Code集成测试失败，请检查配置");
    }

  } catch (error) {
    console.log(`    ✗ Claude集成配置失败: ${error}`);
    console.log(`    💡 请检查权限或手动配置`);
  }
}

// CLI入口
if (require.main === module) {
  runClaudeIntegration().catch((e) => {
    console.error("Claude integration failed:", e);
    process.exit(1);
  });
}