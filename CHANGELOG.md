## [0.3.2](https://github.com/yezannnnn/aiAegis/compare/25d43760c5006fa45bb24082fe0ff4ff0ec90b4c...v0.3.2) (2026-05-11)


### Bug Fixes

* 多项 bug 修复 — 拦截数统计、Hermes 双触发、stats 查数据库、i18n ([fd47340](https://github.com/yezannnnn/aiAegis/commit/fd47340cf2e825eed9150867ce2e5d3261596872))
* 提交最新代码 ([21a3d05](https://github.com/yezannnnn/aiAegis/commit/21a3d05aa40e8455cc6b486d4eb9167c62d1ec09))
* 提交最新代码 ([3bb8d6a](https://github.com/yezannnnn/aiAegis/commit/3bb8d6a3ff90a62ef19557780f0d668768eca137))
* 提交最新代码新增样式 ([6295dbf](https://github.com/yezannnnn/aiAegis/commit/6295dbf7c6608d30f5cb333f80a96b763c1b12e8))
* 提交最新代码新增样式 ([e6362e8](https://github.com/yezannnnn/aiAegis/commit/e6362e8dc8be2ac4e93cda0ada0d4b3a24e6edbc))
* 修复 SQL 规则 (?i) 无效导致所有规则静默失效，新增 SQLite 规则集 ([dfb7c10](https://github.com/yezannnnn/aiAegis/commit/dfb7c107b2e20c76532e6e748d9bf364f59f01c9))
* 修复 SQL 规则 (?i) 无效导致所有规则静默失效，新增 SQLite 规则集 ([aa2f2ac](https://github.com/yezannnnn/aiAegis/commit/aa2f2accdd894f70c2e3e0f39f3b29698e238cf9))
* 修复前端3001端口页面监控面板 ([25d4376](https://github.com/yezannnnn/aiAegis/commit/25d43760c5006fa45bb24082fe0ff4ff0ec90b4c))
* 修复统一hook入库新web修改 ([df9a636](https://github.com/yezannnnn/aiAegis/commit/df9a636b91a84034110552d29fc228252b13d5d9))
* 增加rules示例模板 ([0cd3398](https://github.com/yezannnnn/aiAegis/commit/0cd3398b351ddc75ed69c721ed97d53f2330f09d))
* accept HTTP 201 status from backend evaluate API ([3ee69b5](https://github.com/yezannnnn/aiAegis/commit/3ee69b5066973e3e5d56468dc1477e05b7446a35))
* add hooks/hermes files to npm package.json files field ([2b901dd](https://github.com/yezannnnn/aiAegis/commit/2b901dd19e2f82d560568f686bfaeb0727400ed1))
* agent_update dedup by type+sessionId in App.vue (not just type) ([128eec4](https://github.com/yezannnnn/aiAegis/commit/128eec4f74126c65c5b4106c395a358e382b1c6a))
* all hook console output strings in English ([5341b10](https://github.com/yezannnnn/aiAegis/commit/5341b1051fc4f77290c40e6c6cc4b544b21c3e00))
* all runtime output in English (backend logs, hook messages, browser notifications) ([852330d](https://github.com/yezannnnn/aiAegis/commit/852330dcd974436817266a9bd68538645e587864))
* approval reason strings from frontend now in English ([f0ba457](https://github.com/yezannnnn/aiAegis/commit/f0ba4570e13a85270d7a00f8ce46d2861993535b))
* approvalId bug fix, README rewrite, screenshots, configurable timeout ([4c3555f](https://github.com/yezannnnn/aiAegis/commit/4c3555fe4a3a54ad323587cb2bd191d230cf2c0b))
* browser notifications follow UI language, hook debug output in English ([137f08e](https://github.com/yezannnnn/aiAegis/commit/137f08eac527bcdfa9d67729c010958603549d9e))
* CLI all output in English, fix [object Object] in rules list ([087ae61](https://github.com/yezannnnn/aiAegis/commit/087ae61eb1b0014e49b08973dd74d0a28d5d6620))
* frontend listens for new_event not event_update for real-time push ([12ce0f0](https://github.com/yezannnnn/aiAegis/commit/12ce0f0a0af323fd57a231f68929e9d2a56d963c))
* multi-session agent tracking, block/allow recording, WebSocket CORS ([117e84f](https://github.com/yezannnnn/aiAegis/commit/117e84f4158160ebc0285592adb50eef2e11384a))
* publish version update 0.3.0 ([812fc4f](https://github.com/yezannnnn/aiAegis/commit/812fc4fdf8d0777c78c41a82bf9cbe23a3a4dfd6))
* remove remaining Chinese strings from approval reason and event labels ([19c305a](https://github.com/yezannnnn/aiAegis/commit/19c305a75ca1f6293a9dfcaf37b6bcc84c36b57f))
* resolve port configuration issues and enhance notification UX ([a2951d6](https://github.com/yezannnnn/aiAegis/commit/a2951d68ffc0bfb04b74a7b8a9dc44e3061cf6f5))


### Features

* 规则 reason 国际化 + Hermes 安装流程改进 ([a9d7c91](https://github.com/yezannnnn/aiAegis/commit/a9d7c91b9ae562ba35a05eb5606df0f0fe7ceae3))
* 新增prdmd ([188ebac](https://github.com/yezannnnn/aiAegis/commit/188ebacec45e5d5a38b2eb628d5d09e6d41062bb))
* 增加英文版本README ([1de9699](https://github.com/yezannnnn/aiAegis/commit/1de9699cc13a3d9801f68698892e01bb656f303b))
* add Hermes Plugin Hook core script (plugin.py) ([0ef6560](https://github.com/yezannnnn/aiAegis/commit/0ef656080e1ae94346b675069f5d46ef16274a6a))
* add Hermes Plugin Hook option to setup command (aegis.js) ([1aed6a3](https://github.com/yezannnnn/aiAegis/commit/1aed6a3676450b9555637efaabd6386aaa8d3038))
* add Hermes Plugin Hook setup support (setup-utils.js) ([f22b984](https://github.com/yezannnnn/aiAegis/commit/f22b984cf3d523e3bda01e9c556755a18e9deffa))
* add time filter (1H / 24H / TODAY / ALL TIME) to event list ([1581582](https://github.com/yezannnnn/aiAegis/commit/1581582ec7b72ab6fe05ce365ec1a886b2adada3))
* capture model name from session transcript in agent card ([93ff42d](https://github.com/yezannnnn/aiAegis/commit/93ff42d9597afd72257e249bb31becc7548391df))
* copy post-tool-use-handler.js during aegis setup ([e4797e8](https://github.com/yezannnnn/aiAegis/commit/e4797e8d75d46e67a5b62ca3a8bb911bc06c61bb))
* detect agent persona from PERSONA.md or cwd dirname ([1062bce](https://github.com/yezannnnn/aiAegis/commit/1062bcea517767b6b2e6b848c303e0c71d71e1fb))
* npm单包发布架构 - 编译后产物直接运行 ([cf6c12f](https://github.com/yezannnnn/aiAegis/commit/cf6c12fae96c90dd5e760800e3967da435cc479f))
* PostToolUse user input indexing — capture and display user context in security events ([7289046](https://github.com/yezannnnn/aiAegis/commit/7289046519a232d9ed837d62cc471dcb8a8b77b3))
* register PostToolUse hook during aegis setup ([fb17017](https://github.com/yezannnnn/aiAegis/commit/fb1701777f7fd9ebcd068a0ef025d0c184bc5a05))
* **rules:** implement selector DSL v2 with BashAstService and full test suite ([d28644a](https://github.com/yezannnnn/aiAegis/commit/d28644ae9bd2c00b2dc691b4a68a318a5f50f425))
* task ID tracking in event list (taskId from parentUuid chain) ([b945ad1](https://github.com/yezannnnn/aiAegis/commit/b945ad118adb38c26d301bb4f025aecf09b391ce))



