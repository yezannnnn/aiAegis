#!/bin/bash

# Aegis Security System Installer
# 自动配置 Claude Code 集成审批系统

set -e

CLAUDE_CONFIG_DIR="$HOME/.claude"
CLAUDE_SETTINGS="$CLAUDE_CONFIG_DIR/settings.json"
AEGIS_DIR="$HOME/.aegis"
AEGIS_HOOK="$AEGIS_DIR/universal-hook.js"
BACKUP_SUFFIX=$(date +"%Y%m%d_%H%M%S")

echo "🛡️ Aegis Security System - Installation"
echo "========================================"

# 检查 Claude Code 是否已安装
if ! command -v claude &> /dev/null; then
    echo "❌ Claude Code not found. Please install Claude Code first."
    echo "   Download from: https://claude.ai/download"
    exit 1
fi

# 创建 Aegis 目录
echo "📁 Creating Aegis directories..."
mkdir -p "$AEGIS_DIR"
mkdir -p "$CLAUDE_CONFIG_DIR"

# 备份现有 Claude 配置
if [ -f "$CLAUDE_SETTINGS" ]; then
    echo "💾 Backing up existing Claude settings..."
    cp "$CLAUDE_SETTINGS" "$CLAUDE_SETTINGS.backup_$BACKUP_SUFFIX"
    echo "   Backup saved to: $CLAUDE_SETTINGS.backup_$BACKUP_SUFFIX"
fi

# 复制 Aegis 文件
echo "📋 Installing Aegis components..."
cp "$(dirname "$0")/hooks/claude-code/universal-hook-v2.js" "$AEGIS_HOOK"
chmod +x "$AEGIS_HOOK"

# 复制 AST 引擎
if [ -d "$(dirname "$0")/dist" ]; then
    cp -r "$(dirname "$0")/dist" "$AEGIS_DIR/"
    echo "   AST engine installed"
fi

# 复制规则文件
if [ -d "$(dirname "$0")/src/rules" ]; then
    cp -r "$(dirname "$0")/src/rules" "$AEGIS_DIR/"
    echo "   Security rules installed"
fi

# 生成或更新 Claude settings.json
echo "⚙️ Configuring Claude Code integration..."

# 读取现有配置或创建默认配置
if [ -f "$CLAUDE_SETTINGS" ]; then
    # 使用 jq 合并配置 (如果有的话)
    if command -v jq &> /dev/null; then
        echo "   Using jq to merge configuration..."

        # 创建临时配置
        cat > /tmp/aegis_config.json << 'EOF'
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.aegis/universal-hook.js",
            "timeout": 120
          }
        ]
      }
    ]
  }
}
EOF

        # 合并配置
        jq -s '.[0] * .[1]' "$CLAUDE_SETTINGS" /tmp/aegis_config.json > /tmp/merged_config.json
        mv /tmp/merged_config.json "$CLAUDE_SETTINGS"
        rm /tmp/aegis_config.json

    else
        echo "   Warning: jq not found, will backup and replace settings..."
        cat > "$CLAUDE_SETTINGS" << 'EOF'
{
  "permissions": {
    "allow": [
      "mcp__pencil"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.aegis/universal-hook.js",
            "timeout": 120
          }
        ]
      }
    ]
  },
  "enabledPlugins": {
    "typescript-lsp@claude-plugins-official": true
  }
}
EOF
    fi
else
    # 创建新的配置文件
    cat > "$CLAUDE_SETTINGS" << 'EOF'
{
  "permissions": {
    "allow": [
      "mcp__pencil"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.aegis/universal-hook.js",
            "timeout": 120
          }
        ]
      }
    ]
  },
  "enabledPlugins": {
    "typescript-lsp@claude-plugins-official": true
  }
}
EOF
fi

# 创建卸载脚本
echo "🗑️ Creating uninstall script..."
cat > "$AEGIS_DIR/uninstall.sh" << EOF
#!/bin/bash

echo "🛡️ Aegis Security System - Uninstaller"
echo "======================================="

# 恢复 Claude 配置备份
if [ -f "$CLAUDE_SETTINGS.backup_$BACKUP_SUFFIX" ]; then
    echo "📁 Restoring Claude settings backup..."
    mv "$CLAUDE_SETTINGS.backup_$BACKUP_SUFFIX" "$CLAUDE_SETTINGS"
    echo "   Settings restored from backup"
else
    echo "⚠️  No backup found, removing Aegis hook from settings..."
    # 如果有 jq，移除 hook 配置
    if command -v jq &> /dev/null && [ -f "$CLAUDE_SETTINGS" ]; then
        jq 'del(.hooks.PreToolUse[] | select(.matcher == "Bash" and .hooks[0].command | contains("universal-hook.js")))' "$CLAUDE_SETTINGS" > /tmp/cleaned_settings.json
        mv /tmp/cleaned_settings.json "$CLAUDE_SETTINGS"
    fi
fi

# 询问是否删除 Aegis 目录
read -p "Delete Aegis directory ($AEGIS_DIR)? [y/N]: " -n 1 -r
echo
if [[ \$REPLY =~ ^[Yy]$ ]]; then
    rm -rf "$AEGIS_DIR"
    echo "🗑️ Aegis directory removed"
else
    echo "📁 Aegis directory preserved"
fi

echo "✅ Aegis uninstallation completed"
EOF

chmod +x "$AEGIS_DIR/uninstall.sh"

# 验证安装
echo "✅ Verifying installation..."
if [ -f "$AEGIS_HOOK" ] && [ -f "$CLAUDE_SETTINGS" ]; then
    echo "   ✓ Aegis hook installed"
    echo "   ✓ Claude settings configured"

    # 检查 Node.js
    if command -v node &> /dev/null; then
        echo "   ✓ Node.js found"
    else
        echo "   ⚠️  Node.js not found, please install Node.js"
    fi

else
    echo "   ❌ Installation verification failed"
    exit 1
fi

echo ""
echo "🎉 Aegis Security System installed successfully!"
echo ""
echo "📋 Next steps:"
echo "   1. Start the monitoring interface:"
echo "      cd $(dirname "$0") && node real-time-monitor.js"
echo ""
echo "   2. Open web interface: http://localhost:3001"
echo ""
echo "   3. Test with Claude Code - risky commands will require approval"
echo ""
echo "📁 Files installed:"
echo "   • Hook: $AEGIS_HOOK"
echo "   • Settings: $CLAUDE_SETTINGS"
echo "   • Uninstaller: $AEGIS_DIR/uninstall.sh"
echo ""
echo "🔧 To uninstall: $AEGIS_DIR/uninstall.sh"