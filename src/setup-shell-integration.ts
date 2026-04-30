/**
 * Aegis Shell Integration Setup
 * 自动配置Shell函数拦截，支持bash/zsh/fish等
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as child_process from 'child_process';

const AEGIS_DIR = path.join(os.homedir(), '.aegis');
const SHELL_INTEGRATION_DIR = path.join(AEGIS_DIR, 'shell');

interface ShellConfig {
    name: string;
    configFile: string;
    setupLine: string;
    testCommand: string;
}

const SUPPORTED_SHELLS: ShellConfig[] = [
    {
        name: 'bash',
        configFile: '.bashrc',
        setupLine: 'source ~/.aegis/shell/aegis-functions.sh',
        testCommand: 'echo $BASH_VERSION'
    },
    {
        name: 'zsh',
        configFile: '.zshrc',
        setupLine: 'source ~/.aegis/shell/aegis-functions.sh',
        testCommand: 'echo $ZSH_VERSION'
    },
    {
        name: 'fish',
        configFile: '.config/fish/config.fish',
        setupLine: 'source ~/.aegis/shell/aegis-functions.fish',
        testCommand: 'echo $FISH_VERSION'
    }
];

export class ShellIntegrationSetup {
    private homeDir: string;
    private currentShell: string;

    constructor() {
        this.homeDir = os.homedir();
        this.currentShell = this.detectCurrentShell();
    }

    /**
     * 检测当前使用的Shell
     */
    private detectCurrentShell(): string {
        const shellEnv = process.env.SHELL || '';
        const shellName = path.basename(shellEnv);

        console.log(`🔍 检测到当前Shell: ${shellName}`);
        return shellName;
    }

    /**
     * 检查Shell是否支持
     */
    private isSupportedShell(shellName: string): boolean {
        return SUPPORTED_SHELLS.some(shell => shell.name === shellName);
    }

    /**
     * 创建Aegis目录结构
     */
    private ensureDirectories(): void {
        const dirs = [AEGIS_DIR, SHELL_INTEGRATION_DIR];

        for (const dir of dirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`✅ 创建目录: ${dir}`);
            }
        }
    }

    /**
     * 生成跨平台的拦截函数脚本
     */
    private generateInterceptionScript(): void {
        const scriptPath = path.join(SHELL_INTEGRATION_DIR, 'aegis-functions.sh');

        const script = `#!/bin/bash
# Aegis Shell Integration - 自动生成的拦截函数
# 生成时间: ${new Date().toISOString()}

# 检查Aegis是否启用
if [ "\$AEGIS_ENABLED" = "1" ]; then
    # 拦截检查函数
    aegis_check_command() {
        local command="\$1"
        local temp_file="/tmp/aegis-check-\$\$.json"
        local response_file="/tmp/aegis-response-\$\$.json"
        local request_id="\$(date +%s)-\$\$"

        # 构造请求
        cat > "\$temp_file" <<EOF
{
  "type": "approval_request",
  "payload": {
    "id": "\$request_id",
    "command": "\$command",
    "cwd": "\$(pwd)",
    "agentType": "shell-integration",
    "sessionKey": "shell-session-\$(date +%s)",
    "timestamp": \$(date +%s000)
  }
}
EOF

        # 发送请求到Aegis Daemon
        if command -v nc >/dev/null 2>&1; then
            timeout 5 sh -c "cat '\$temp_file' | nc localhost 9876" > "\$response_file" 2>/dev/null
        else
            echo "⚠️ Aegis: nc命令不可用，默认允许执行"
            rm -f "\$temp_file" "\$response_file"
            return 0
        fi

        # 检查响应
        if [ ! -s "\$response_file" ]; then
            echo "⚠️ Aegis: 无法连接到Daemon，默认允许执行"
            rm -f "\$temp_file" "\$response_file"
            return 0
        fi

        # 解析响应
        local decision=\$(cat "\$response_file" | grep -o '"decision":"[^"]*"' | cut -d'"' -f4 2>/dev/null)

        rm -f "\$temp_file" "\$response_file"

        case "\$decision" in
            "ALLOW")
                return 0 ;;
            "DENY")
                echo ""
                echo "🛡️ Aegis: 命令被阻止 - \$command"
                echo "💡 在Aegis Monitor中查看详细信息"
                echo ""
                return 1 ;;
            *)
                return 0 ;;
        esac
    }

    # 重写危险命令
    git() {
        if aegis_check_command "git \$*"; then
            command git "\$@"
        fi
    }

    rm() {
        if aegis_check_command "rm \$*"; then
            command rm "\$@"
        fi
    }

    mysql() {
        if aegis_check_command "mysql \$*"; then
            command mysql "\$@"
        fi
    }

    psql() {
        if aegis_check_command "psql \$*"; then
            command psql "\$@"
        fi
    }

    docker() {
        if aegis_check_command "docker \$*"; then
            command docker "\$@"
        fi
    }

    sudo() {
        if aegis_check_command "sudo \$*"; then
            command sudo "\$@"
        fi
    }

    chmod() {
        if aegis_check_command "chmod \$*"; then
            command chmod "\$@"
        fi
    }

    # 导出函数
    export -f aegis_check_command git rm mysql psql docker sudo chmod

    # 显示状态（仅在首次加载时）
    if [ "\$AEGIS_SHELL_LOADED" != "1" ]; then
        export AEGIS_SHELL_LOADED=1
        echo "🛡️ Aegis Shell保护已启用"
    fi
fi
`;

        fs.writeFileSync(scriptPath, script, { mode: 0o755 });
        console.log(`✅ 生成拦截脚本: ${scriptPath}`);
    }

    /**
     * 生成Fish Shell专用脚本
     */
    private generateFishScript(): void {
        const scriptPath = path.join(SHELL_INTEGRATION_DIR, 'aegis-functions.fish');

        const script = `# Aegis Fish Shell Integration
# 生成时间: ${new Date().toISOString()}

if set -q AEGIS_ENABLED
    # Fish函数定义
    function git
        if aegis_check_command "git $argv"
            command git $argv
        end
    end

    function rm
        if aegis_check_command "rm $argv"
            command rm $argv
        end
    end

    # 检查函数 (简化版)
    function aegis_check_command
        set command $argv
        echo "🛡️ Aegis检查: $command"
        # 这里可以调用外部脚本进行检查
        return 0
    end

    if not set -q AEGIS_FISH_LOADED
        set -g AEGIS_FISH_LOADED 1
        echo "🛡️ Aegis Fish保护已启用"
    end
end
`;

        fs.writeFileSync(scriptPath, script, { mode: 0o755 });
        console.log(`✅ 生成Fish脚本: ${scriptPath}`);
    }

    /**
     * 修改Shell配置文件，添加Aegis集成
     */
    private updateShellConfig(shellConfig: ShellConfig): void {
        const configPath = shellConfig.configFile.startsWith('/')
            ? shellConfig.configFile
            : path.join(this.homeDir, shellConfig.configFile);

        // 确保配置文件目录存在
        const configDir = path.dirname(configPath);
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }

        // 读取现有配置
        let configContent = '';
        if (fs.existsSync(configPath)) {
            configContent = fs.readFileSync(configPath, 'utf8');
        }

        // 检查是否已经配置
        const aegisMarker = '# Aegis Shell Integration';
        if (configContent.includes(aegisMarker)) {
            console.log(`✅ ${shellConfig.name} 配置已存在，跳过`);
            return;
        }

        // 添加Aegis配置
        const aegisConfig = `
${aegisMarker}
# 自动生成于 ${new Date().toISOString()}
export AEGIS_ENABLED=1
${shellConfig.setupLine}

# 启用Aegis的别名
alias claude-safe='AEGIS_ENABLED=1 claude'
alias aegis-enable='export AEGIS_ENABLED=1'
alias aegis-disable='export AEGIS_ENABLED=0'
`;

        configContent += aegisConfig;
        fs.writeFileSync(configPath, configContent);
        console.log(`✅ 更新 ${shellConfig.name} 配置: ${configPath}`);
    }

    /**
     * 测试Shell集成是否工作
     */
    private testIntegration(): boolean {
        try {
            // 测试环境变量设置
            const testScript = `
export AEGIS_ENABLED=1
source ${path.join(SHELL_INTEGRATION_DIR, 'aegis-functions.sh')}
type git | grep -q "function"
`;

            child_process.execSync(testScript, {
                shell: '/bin/bash',
                stdio: 'pipe'
            });

            console.log('✅ Shell集成测试通过');
            return true;
        } catch (error) {
            console.log('❌ Shell集成测试失败:', error);
            return false;
        }
    }

    /**
     * 生成便捷脚本
     */
    private generateHelperScripts(): void {
        // 生成启用脚本
        const enableScript = path.join(AEGIS_DIR, 'enable-protection.sh');
        fs.writeFileSync(enableScript, `#!/bin/bash
export AEGIS_ENABLED=1
echo "🛡️ Aegis保护已启用"
echo "💡 在新的shell会话中生效"
`, { mode: 0o755 });

        // 生成测试脚本
        const testScript = path.join(AEGIS_DIR, 'test-protection.sh');
        fs.writeFileSync(testScript, `#!/bin/bash
echo "🧪 测试Aegis保护..."

export AEGIS_ENABLED=1
source ~/.aegis/shell/aegis-functions.sh

echo "测试命令拦截 (应该显示函数):"
type git
echo ""

echo "测试环境变量:"
echo "AEGIS_ENABLED=$AEGIS_ENABLED"
`, { mode: 0o755 });

        console.log(`✅ 生成帮助脚本: ${enableScript}, ${testScript}`);
    }

    /**
     * 主安装方法
     */
    async setupShellIntegration(): Promise<void> {
        console.log('🚀 开始配置Aegis Shell集成...\n');

        try {
            // 1. 创建目录
            this.ensureDirectories();

            // 2. 检查Shell支持
            if (!this.isSupportedShell(this.currentShell)) {
                console.log(`⚠️ 当前Shell (${this.currentShell}) 暂不支持自动配置`);
                console.log('🔧 请手动配置或切换到 bash/zsh');
                return;
            }

            // 3. 生成拦截脚本
            this.generateInterceptionScript();

            if (this.currentShell === 'fish') {
                this.generateFishScript();
            }

            // 4. 更新Shell配置
            const shellConfig = SUPPORTED_SHELLS.find(s => s.name === this.currentShell);
            if (shellConfig) {
                this.updateShellConfig(shellConfig);
            }

            // 5. 生成帮助脚本
            this.generateHelperScripts();

            // 6. 测试集成
            const testPassed = this.testIntegration();

            console.log('\n' + '='.repeat(60));
            console.log('🎉 Aegis Shell集成配置完成!');
            console.log('');
            console.log('📋 下一步操作:');
            console.log('   1. 重新启动终端或运行: source ~/.bashrc');
            console.log('   2. 启动Aegis监控: aegis monitor');
            console.log('   3. 测试保护: ~/.aegis/test-protection.sh');
            console.log('');
            console.log('💡 使用方式:');
            console.log('   • 正常使用命令，危险操作会被拦截');
            console.log('   • 临时禁用: export AEGIS_ENABLED=0');
            console.log('   • 重新启用: source ~/.aegis/enable-protection.sh');

            if (!testPassed) {
                console.log('\n⚠️ 集成测试失败，可能需要手动调试');
            }

        } catch (error) {
            console.error('❌ Shell集成配置失败:', error);
            throw error;
        }
    }
}

/**
 * 导出给setup.ts使用的函数
 */
export async function runShellIntegration(): Promise<void> {
    const setup = new ShellIntegrationSetup();
    await setup.setupShellIntegration();
}