# 🚀 Aegis v2.0 快速开始

## 📦 项目结构

```
aegis-v2/
├── bin/                    # CLI命令脚本
│   ├── aegis.js           # 主CLI入口
│   ├── setup-utils.js     # 安装工具类
│   └── post-install.js    # 安装后脚本
├── backend/               # NestJS后端
│   ├── src/               # 源码
│   └── package.json       # 后端依赖
├── frontend/              # Vue3前端
│   ├── src/               # 源码
│   └── package.json       # 前端依赖
├── universal-hook.js      # Hook拦截脚本
├── rule-engine.js         # 规则引擎
├── aegis-rules.yaml       # 安全规则配置
└── README.md              # 完整文档
```

## 🧪 本地测试

### 1. 安装CLI依赖
```bash
cd bin
npm install commander chalk ora inquirer fs-extra cross-spawn
cd ..
```

### 2. 测试基础功能
```bash
# 测试CLI命令
node bin/aegis.js --help

# 测试Hook功能
echo '{"tool_name":"Bash","tool_input":{"command":"ls -la"}}' | node universal-hook.js
```

### 3. 快速setup测试
```bash
# 跳过依赖安装的快速测试
node bin/aegis.js setup --skip-deps --skip-hook

# 检查配置
node bin/aegis.js config --list
```

### 4. 完整功能测试
```bash
# 完整安装（需要时间）
node bin/aegis.js setup

# 启动服务
node bin/aegis.js start
```

## 🌐 服务地址

启动成功后访问：
- **前端界面**: http://localhost:5173
- **后端API**: http://localhost:3001
- **API文档**: http://localhost:3001/api

## 🔧 常用命令

```bash
# 基础命令
node bin/aegis.js --help           # 帮助
node bin/aegis.js --version        # 版本

# 管理命令
node bin/aegis.js setup            # 初始化
node bin/aegis.js start            # 启动服务
node bin/aegis.js status           # 检查状态
node bin/aegis.js config --list    # 查看配置

# 重置
node bin/aegis.js config --reset   # 重置配置
```

## 📋 检查清单

### ✅ 文件验证
- [ ] `bin/aegis.js` 可执行
- [ ] `universal-hook.js` 存在
- [ ] `rule-engine.js` 存在
- [ ] `aegis-rules.yaml` 存在

### ✅ 功能测试
- [ ] CLI命令响应
- [ ] Hook拦截功能
- [ ] 规则引擎判断
- [ ] 前后端启动

## 🐛 问题排查

### 常见错误

1. **npm依赖缺失**
   ```bash
   cd bin && npm install
   ```

2. **权限问题**
   ```bash
   chmod +x bin/aegis.js
   ```

3. **端口占用**
   ```bash
   lsof -i :3001
   lsof -i :5173
   ```

### 日志查看
```bash
# 检查系统日志
cat ~/.aegis/logs/*.log

# 检查配置
cat ~/.aegis/config.json
```

## 📞 支持

- 🐛 问题反馈: [GitHub Issues](https://github.com/yezannnnn/aegis-v2/issues)
- 📚 完整文档: [README.md](./README.md)