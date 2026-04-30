#!/usr/bin/env node
/**
 * Aegis Claude集成测试脚本
 *
 * 测试Claude hook与Aegis daemon的通信
 */

import * as net from "net";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const AEGIS_HOST = "127.0.0.1";
const AEGIS_PORT = 9876;
const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const AEGIS_DIR = path.join(os.homedir(), ".aegis");

interface TestCase {
  name: string;
  command: string;
  expectedBlocked: boolean;
}

const TEST_CASES: TestCase[] = [
  {
    name: "安全命令 - ls",
    command: "ls -la",
    expectedBlocked: false
  },
  {
    name: "危险命令 - 强制推送",
    command: "git push --force origin main",
    expectedBlocked: true
  },
  {
    name: "危险命令 - 删除重要文件",
    command: "rm -rf node_modules package.json",
    expectedBlocked: true
  },
  {
    name: "普通命令 - npm install",
    command: "npm install lodash",
    expectedBlocked: false
  },
  {
    name: "危险命令 - sudo删除",
    command: "sudo rm -rf /etc/hosts",
    expectedBlocked: true
  }
];

class ClaudeIntegrationTester {
  private daemonRunning = false;

  async run(): Promise<void> {
    console.log("🧪 Aegis Claude集成测试\n");

    // 检查环境
    await this.checkEnvironment();

    // 检查daemon状态
    await this.checkDaemonStatus();

    // 运行测试用例
    await this.runTestCases();

    console.log("\n📋 测试总结:");
    console.log("  - 所有测试用例已完成");
    console.log("  - 检查上述结果确保集成正常工作");
  }

  private async checkEnvironment(): Promise<void> {
    console.log("🔍 检查环境配置...");

    // 检查Claude配置目录
    if (fs.existsSync(CLAUDE_DIR)) {
      console.log("  ✓ Claude配置目录存在:", CLAUDE_DIR);

      const settingsPath = path.join(CLAUDE_DIR, "settings.json");
      if (fs.existsSync(settingsPath)) {
        try {
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
          const hasAegisHook = settings.hooks?.PreToolUse?.some((h: any) =>
            h.description?.includes("Aegis")
          );

          if (hasAegisHook) {
            console.log("  ✓ Aegis hook已配置在Claude settings中");
          } else {
            console.log("  ⚠ Aegis hook未在Claude settings中找到");
          }
        } catch {
          console.log("  ⚠ 无法解析Claude settings.json");
        }
      }
    } else {
      console.log("  ✗ Claude配置目录不存在:", CLAUDE_DIR);
    }

    // 检查Aegis hook文件
    const hookPath = path.join(AEGIS_DIR, "claude-hook.js");
    if (fs.existsSync(hookPath)) {
      console.log("  ✓ Aegis hook脚本存在:", hookPath);
    } else {
      console.log("  ✗ Aegis hook脚本不存在:", hookPath);
    }

    console.log("");
  }

  private async checkDaemonStatus(): Promise<void> {
    console.log("🔗 检查Aegis daemon状态...");

    this.daemonRunning = await this.isDaemonRunning();

    if (this.daemonRunning) {
      console.log("  ✓ Aegis daemon正在运行");
    } else {
      console.log("  ⚠ Aegis daemon未运行，测试将使用fallback模式");
      console.log("  💡 启动daemon: aegis monitor");
    }

    console.log("");
  }

  private async isDaemonRunning(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(2000);

      socket.connect(AEGIS_PORT, AEGIS_HOST, () => {
        socket.end();
        resolve(true);
      });

      socket.on("error", () => resolve(false));
      socket.on("timeout", () => {
        socket.destroy();
        resolve(false);
      });
    });
  }

  private async runTestCases(): Promise<void> {
    console.log("🧪 运行测试用例...");

    for (const testCase of TEST_CASES) {
      console.log(`\n  📋 ${testCase.name}`);
      console.log(`     命令: ${testCase.command}`);

      if (this.daemonRunning) {
        await this.testWithDaemon(testCase);
      } else {
        await this.testFallbackMode(testCase);
      }
    }
  }

  private async testWithDaemon(testCase: TestCase): Promise<void> {
    try {
      const result = await this.sendToDaemon(testCase.command);
      const isBlocked = result.decision === "DENY";

      if (isBlocked === testCase.expectedBlocked) {
        console.log(`     结果: ✓ ${isBlocked ? "已阻止" : "已允许"} (符合预期)`);
      } else {
        console.log(`     结果: ✗ ${isBlocked ? "已阻止" : "已允许"} (不符合预期: 应该${testCase.expectedBlocked ? "阻止" : "允许"})`);
      }

      if (result.reason) {
        console.log(`     原因: ${result.reason}`);
      }
    } catch (error) {
      console.log(`     结果: ✗ 测试失败: ${error}`);
    }
  }

  private async testFallbackMode(testCase: TestCase): Promise<void> {
    // 模拟fallback模式的基本规则检查
    const dangerousPatterns = [
      /rm\s+(-rf|--recursive.*--force)\s+\//,
      /git\s+push\s+(-f|--force)/,
      /sudo\s+rm/,
      /dd\s+.*of=\/dev\//,
      /chmod\s+777/
    ];

    const isBlocked = dangerousPatterns.some(pattern => pattern.test(testCase.command));

    if (isBlocked === testCase.expectedBlocked) {
      console.log(`     结果: ✓ ${isBlocked ? "已阻止" : "已允许"} (fallback模式, 符合预期)`);
    } else {
      console.log(`     结果: ⚠ ${isBlocked ? "已阻止" : "已允许"} (fallback模式, 可能需要调整规则)`);
    }
  }

  private async sendToDaemon(command: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      socket.setTimeout(5000);

      const request = {
        type: "approval_request",
        payload: {
          id: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          command: command,
          cwd: process.cwd(),
          agentType: "claude-code",
          timestamp: Date.now()
        }
      };

      let response = "";

      socket.connect(AEGIS_PORT, AEGIS_HOST, () => {
        socket.write(JSON.stringify(request) + "\n");
      });

      socket.on("data", (data) => {
        response += data.toString();

        const lines = response.split("\n");
        for (const line of lines) {
          if (line.trim()) {
            try {
              const result = JSON.parse(line);
              if (result.type === "approval_resolution") {
                socket.end();
                resolve({
                  decision: result.payload.decision,
                  reason: result.payload.reason
                });
                return;
              } else if (result.type === "denied") {
                socket.end();
                resolve({
                  decision: "DENY",
                  reason: result.payload.reason
                });
                return;
              }
            } catch {}
          }
        }
      });

      socket.on("timeout", () => {
        socket.destroy();
        reject(new Error("请求超时"));
      });

      socket.on("error", (err) => {
        reject(err);
      });
    });
  }
}

// 运行测试
if (require.main === module) {
  const tester = new ClaudeIntegrationTester();
  tester.run().catch((error) => {
    console.error("测试失败:", error);
    process.exit(1);
  });
}

export { ClaudeIntegrationTester };