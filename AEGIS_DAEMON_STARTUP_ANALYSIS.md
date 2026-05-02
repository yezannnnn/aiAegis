# Aegis Daemon 启动机制分析

> **分析时间**: 2026-05-02
> **版本**: Aegis v2.0.0
> **目的**: 完整分析Aegis daemon的启动机制和架构

## 🚀 启动方式总览

### 📊 **多种启动方式对比**

| 启动方式 | 命令 | 端口 | 功能 | 文件 |
|----------|------|------|------|------|
| **NPM标准启动** | `npm start` | 9876 + 3001 | 完整服务 | `scripts/start.js` |
| **开发直接启动** | `node real-time-monitor.js` | 3001 + 3002 + 9876 | 增强监控 | `real-time-monitor.js` |
| **监控界面启动** | `npm run monitor` | - | 打开浏览器 | `scripts/monitor.js` |

---

## 🔧 NPM标准启动 (scripts/start.js)

### 🔄 **启动流程**
```
npm start
    ↓
prestart: node scripts/check-setup.js
    ↓
scripts/start.js 执行
    ↓
1. checkSetup() - 验证配置
2. startBackendService() - 启动Hook后端 (9876)
3. startWebInterface() - 启动Web界面 (3001)
4. registerShutdownHandlers() - 注册关闭处理
    ↓
Aegis daemon 运行中
```

### 🏗️ **服务架构**
```javascript
class AegisNpmStart {
  async startBackendService() {
    // 创建HTTP服务器监听9876端口
    const server = http.createServer((req, res) => {
      if (req.url === '/hook-event' && req.method === 'POST') {
        this.handleHookEvent(req, res);  // 处理Hook事件
      } else if (req.url === '/status' && req.method === 'GET') {
        this.handleStatus(req, res);     // 返回状态信息
      }
    });

    server.listen(9876, '127.0.0.1');
  }

  async startWebInterface() {
    // 启动Web监控界面 (端口3001)
    // 提供静态HTML监控页面
  }
}
```

### 📡 **Hook后端服务** (端口9876)
- **路由**: `/hook-event` (POST) - 接收Agent CLI的hook请求
- **路由**: `/status` (GET) - 提供daemon状态信息
- **功能**: 处理命令拦截、风险评估、日志记录

### 🌐 **Web监控界面** (端口3001)
- **功能**: 提供Web界面显示实时监控数据
- **技术**: 静态HTML + JavaScript

---

## 🔧 开发直接启动 (real-time-monitor.js)

### 🔄 **启动流程**
```
node real-time-monitor.js
    ↓
实例化服务器
    ↓
1. HTTP服务器 (3001) - Web界面
2. WebSocket服务器 (3002) - 实时通信
3. Hook Daemon (9876) - Hook处理
    ↓
多服务并行运行
```

### 🏗️ **增强架构**
```javascript
// HTTP服务器 (3001端口)
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    // 提供monitor-ui.html (Dark Minimal UI)
  } else if (req.url === '/api/intercept') {
    // 处理拦截事件API
  }
});

// WebSocket服务器 (3002端口)
const wss = new WebSocket.Server({ port: 3002 });
wss.on('connection', (ws) => {
  // 实时推送监控数据
});

// Hook Daemon (9876端口)
const hookServer = http.createServer((req, res) => {
  if (req.url === '/hook-event') {
    handleHookEvent(req, res);
  } else if (req.url === '/status') {
    handleHookStatus(req, res);
  }
});
```

### ✨ **增强功能**
- ✅ **实时WebSocket通信** - 监控数据实时推送
- ✅ **Dark Minimal UI** - 高级监控界面
- ✅ **多语言支持** - 中英文切换
- ✅ **真实Session追踪** - Claude Code Session集成
- ✅ **智能Intent识别** - 命令意图分析

---

## 📊 启动方式选择指南

### 🎯 **使用场景对比**

| 场景 | 推荐启动方式 | 原因 |
|------|-------------|------|
| **生产环境** | `npm start` | 稳定、标准化 |
| **开发调试** | `node real-time-monitor.js` | 功能完整、实时监控 |
| **仅查看界面** | `npm run monitor` | 快速访问 |
| **CI/CD部署** | `npm start` | 标准化流程 |

### ⚡ **性能对比**

| 指标 | NPM启动 | 直接启动 |
|------|---------|----------|
| **内存占用** | 较低 | 较高 (多服务) |
| **启动速度** | 快 | 中等 |
| **功能完整性** | 基础 | 完整 |
| **调试便利性** | 一般 | 优秀 |

---

## 🔧 配置和进程管理

### 📁 **配置文件位置**
```
~/.aegis/
├── config.json          # Aegis主配置
├── claude-hook.js       # Claude Code Hook脚本
├── server.pid          # 进程ID文件
└── logs/               # 日志目录
```

### 🔄 **进程管理**
```bash
# 启动服务
npm start                    # 标准启动
node real-time-monitor.js    # 直接启动

# 停止服务
npm stop                     # 标准停止
pkill -f real-time-monitor   # 强制停止

# 查看状态
npm run status               # 服务状态
curl localhost:9876/status   # Hook daemon状态
```

### 🛡️ **安全配置**
- **监听地址**: `127.0.0.1` (仅本地访问)
- **端口隔离**: Hook(9876) + Web(3001) + WebSocket(3002)
- **权限检查**: Hook脚本权限验证

---

## 🚀 自动启动配置

### 🔧 **系统服务配置** (推荐生产环境)

```bash
# 创建systemd服务 (Linux)
sudo tee /etc/systemd/system/aegis-daemon.service > /dev/null <<EOF
[Unit]
Description=Aegis Security Monitor Daemon
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/path/to/aegis
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# 启用服务
sudo systemctl enable aegis-daemon
sudo systemctl start aegis-daemon
```

### 🍎 **macOS LaunchAgent配置**

```xml
<!-- ~/.Library/LaunchAgents/com.aegis.daemon.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.aegis.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/npm</string>
        <string>start</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/path/to/aegis</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

---

## 🐛 故障排除

### ❌ **常见启动问题**

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 端口被占用 | 9876/3001端口冲突 | `lsof -i :9876` 查看占用进程 |
| 配置文件损坏 | setup未完成 | 重新运行 `npm run setup` |
| 权限不足 | Hook脚本无执行权限 | `chmod +x ~/.aegis/claude-hook.js` |
| 依赖缺失 | npm包未安装 | `npm install` |

### 🔍 **调试命令**
```bash
# 检查端口占用
lsof -i :9876
lsof -i :3001

# 查看进程
ps aux | grep aegis

# 测试连通性
curl http://localhost:9876/status
curl http://localhost:3001

# 查看日志
tail -f /tmp/aegis.log
```

---

*分析完成时间: 2026-05-02*
*当前推荐: 开发使用 `node real-time-monitor.js`，生产使用 `npm start`*