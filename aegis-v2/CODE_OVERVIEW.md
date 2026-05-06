# Aegis v2 项目代码概览

## 项目结构

```
aegis-v2/
├── package.json              # 根包定义，bin: aegis
├── bin/
│   ├── aegis.js              # CLI主入口 (init/start/rules/status/config)
│   ├── post-install.js       # npm install后自动初始化 ~/.aegis/
│   └── setup-utils.js        # 旧版setup辅助类
├── backend/
│   ├── src/
│   │   ├── main.ts           # NestJS入口，端口3001
│   │   ├── app.module.ts     # 模块：Config + Monitoring + WebSocket
│   │   └── modules/
│   │       ├── monitoring/   # 监控API (stats/events/sessions/agents/health)
│   │       └── websocket/    # Socket.IO实时推送
│   └── dist/                 # 编译产物 (已生成)
├── frontend/
│   ├── src/
│   │   ├── App.vue           # ElementPlus + WebSocket初始化
│   │   ├── views/Dashboard.vue  # 监控面板 (统计/代理/会话/事件)
│   │   ├── stores/websocket.ts  # Pinia状态管理，审批弹窗(ElMessageBox)
│   │   └── router/index.ts   # 单路由Dashboard
│   └── dist/                 # 编译产物 (已生成)
├── default-rules/
│   └── aegis-rules.yaml      # 内置默认规则
├── universal-hook.js         # Claude Code stdin/stdout Hook
├── rule-engine.js            # YAML规则引擎 (allow/deny/review)
└── aegis-rules.yaml          # 根目录规则文件
```

## 核心代码

### 1. 根包 package.json
- `name: aegis-security-monitor`
- `bin: { "aegis": "./bin/aegis.js" }`
- `files` 只包含编译产物和脚本
- `postinstall` 自动执行初始化

### 2. CLI 入口 bin/aegis.js
命令：
- `aegis init` → 创建 `~/.aegis/` (rules/data/config.json)
- `aegis start` → 启动后端(node dist/main.js) + 前端(serve dist/)
- `aegis rules list/add/remove` → 管理 `~/.aegis/rules/`
- `aegis status` → 检查端口健康
- `aegis config` → 查看配置

环境变量注入后端：
```javascript
AEGIS_RULES_DIR: ~/.aegis/rules/
AEGIS_DATA_DIR: ~/.aegis/data/
AEGIS_CONFIG: ~/.aegis/config.json
```

### 3. 后端 NestJS
- **main.ts**: 端口3001，CORS，Swagger API文档
- **app.module.ts**: ConfigModule + MonitoringModule + WebSocketGatewayModule
- **monitoring.controller.ts**: `/api/monitoring/*` (stats/events/sessions/agents/health)
- **monitoring.service.ts**: 内存存储 (Map)，事件统计
- **websocket.gateway.ts**: Socket.IO `/monitor` 命名空间，广播事件/审批请求

### 4. 前端 Vue3
- **App.vue**: ElementPlus中文 + WebSocket连接
- **Dashboard.vue**: 统计卡片 + 代理列表 + 会话列表 + 事件流
- **stores/websocket.ts**: Pinia状态管理，审批弹窗(ElMessageBox)
- **vite.config.ts**: `base: './'` 相对路径，proxy `/api` → localhost:3001

### 5. Hook 系统
- **universal-hook.js**: Claude Code stdin/stdout Hook
  - 解析JSON输入，提取Bash命令
  - 调用rule-engine.js检查命令
  - allow→直接放行，deny→替换为echo阻止，review→HTTP发送到AEGIS_PORT:9876等待审批

- **rule-engine.js**: YAML规则引擎
  - 解析aegis-rules.yaml
  - 模式匹配(glob转正则)
  - 返回 {action: allow|deny|review, reason, category, pattern}

- **aegis-rules.yaml**: 规则配置
  - development: git/npm/node → allow
  - dangerous: rm -rf / → deny, rm -rf * → review
  - network: curl | bash → review
  - packages: npm install → review
  - system: docker run → review
  - default: allow

## 关键问题

| 问题 | 状态 |
|------|------|
| 后端缺少 SecurityModule/ApprovalModule | ❌ 已移除引用，但模块文件不存在 |
| WebSocket审批请求→谁处理？ | ❌ gateway.ts广播approval_request，但无消费者处理HTTP |
| Hook发送审批到端口9876 | ❌ 无服务监听9876，backend在3001 |
| 前端Dashboard样式 | ⚠️ 依赖全局CSS，无scoped样式 |
| 规则引擎路径硬编码 | ⚠️ 需从环境变量读取AEGIS_RULES_DIR |

## 待修复

1. **审批流程闭环**：Hook→后端API→WebSocket弹窗→用户点击→后端处理→Hook返回结果
2. **规则目录环境变量适配**
3. **端口统一**（9876 vs 3001）
