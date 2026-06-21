# SessionMaster v2.0 — 开发计划

> **版本**：v2.0-draft
> **关联文档**：`PRD.md` · `test-plan.md`
> **估算工时**：约 12-15 小时（分 4 个优先级批次）

---

## 1. 任务依赖关系

```
P0：基础设施（核心，必须做）
  T1 版本化迁移框架（schema_version + 链式迁移）
  T2 存储键命名 + 数据迁移逻辑
  T3 Alarm 按站点改造
  T4 P2P 连接按站点隔离
  │
P1：UI 重构（必须做）
  T5 background.js + popup.js 模块拆分
  T6 站点选择器 + 三 Tab（会话/同步/全局）
  T7 锁定规则适配新架构
  │
P2：架构优化（建议做）
  T8 消息路由注册表（替代 switch）
  T9 UI 渲染函数化
  │
P3：收尾
  T10 帮助文档 + README 更新
  T11 9 项自检
  T12 构建 + 浏览器测试
  T13 版本号 + 发布
```

## 2. 任务分解

### P0：基础设施（约 3.5 小时）

#### T1：版本化迁移框架 + 数据迁移

| 属性 | 值 |
|------|-----|
| 文件 | `src/background.js` |
| 类型 | 新增函数 |
| 估算 | 1 小时 |

**变更**：
- `onInstalled` 中检测 `schema_version`，按需执行迁移
- 新增 `core/migration.js`：链式迁移框架 `runMigrations()`
- 新增 `core/sites.js`：站点管理 + 全局设置 handler
- 迁移函数 `migrateV1toV2()`：读取旧键 → 写入 `v2_sites` + `v2_global` → 保留旧键
- `SCHEMA_VERSION_KEY = 'v2_schema_version'` 持久化数据版本

**验收**：MIG-1 ~ MIG-8 + RBK-1 ~ RBK-3 全部通过 | TC-CON-4 存储键一致

#### T2：Alarm 按站点改造

| 属性 | 值 |
|------|-----|
| 文件 | `src/core/heartbeat.js`, `src/core/sync-p2p.js`, `src/core/sync-server.js`（建议拆分）或 `src/background.js` |
| 类型 | 重构 |
| 估算 | 1 小时 |

**变更**：
- `sessionSync` → `serverSync_{domain}`
- `p2pSyncAlarm` → `p2pSync_{domain}`
- `onAlarm` 监听器解析域名定位站点
- `alarms.create/clear` 全部加 `{type}_{domain}` 后缀

**验收**：ALM-1 ~ ALM-7 全部通过

#### T3：P2P 连接按站点隔离

| 属性 | 值 |
|------|-----|
| 文件 | `src/core/sync-p2p.js` 或 `src/background.js` |
| 类型 | 重构 |
| 估算 | 1 小时 |

**变更**：
- `p2pConnections`：`{ peerId: {} }` → `{ siteDomain: {} }`
- `p2pCreateRoom` 增加 `siteDomain` 参数
- `p2pDisconnect(siteDomain?)` 支持按站点/全部断开
- 信令轮询 `startP2PPolling` 增加 `siteDomain` 参数

**验收**：P2P-1 ~ P2P-7 全部通过

#### T4：存储键 + 模块拆分准备

| 属性 | 值 |
|------|-----|
| 文件 | 多个 |
| 类型 | 架构 |
| 估算 | 30 分钟 |

**变更**：
- 创建 `src/core/` 目录
- 创建模块骨架文件：`cookies.js`、`heartbeat.js`、`sync-p2p.js`、`sync-server.js`、`blocker.js`、`sites.js`、`messaging.js`
- 从 background.js 复制函数到对应文件
- 建立导入引用

**验收**：构建脚本通过，功能不受影响

---

### P1：UI 重构（约 4.5 小时）

#### T5：站点选择器组件

| 属性 | 值 |
|------|-----|
| 文件 | `src/popup/popup.js`（新增独立文件）或 `src/popup/popup.html` |
| 类型 | 新增 |
| 估算 | 1 小时 |

**变更**：
- HTML：新增 `.site-selector` 下拉组件，位于 Tab 上方
- 推荐创建 `popup/site-selector.js`（独立渲染函数）
- JS：加载站点列表、切换事件、添加新站点弹窗
- 跨 Tab 共享选中状态（全局变量 `activeSite`）

**验收**：SEL-1 ~ SEL-6 通过

#### T6：会话管理 Tab + 同步管理 Tab + 全局设置 Tab

| 属性 | 值 |
|------|-----|
| 文件 | `src/popup/popup.html` + `src/popup/popup.js` + `src/popup/popup.css` |
| 类型 | 重写 |
| 估算 | 1.5 小时 |

**变更**：
- 从 v1.x 的 `#tab-session` 合并 `#tab-blocker` 内容
- Cookie 区域：导出/导入/清除（保活作为子区域展示）
- 保活区域：视觉上从属于 Cookie
- 拦截区域：主开关 + 推荐规则 + 规则库 + 自定义规则
- 所有数据按 `activeSite` 过滤

**验收**：SES-1 ~ SES-11 通过

#### T6：同步管理 Tab 重构

| 属性 | 值 |
|------|-----|
| 文件 | `src/popup/popup.html` + `src/popup/popup.js` |
| 类型 | 重写 |
| 估算 | 1 小时 |

**变更**：
- 主从设备开关 + 身份切换
- P2P / 服务器 radio 二选一
- P2P 配置区（创建/加入/断开/同步开关）
- 服务器配置区（配对码/注册/同步开关）
- 立即同步按钮
- 同步记录（按 activeSite 过滤）
- 本机网络地址（保持不变）

**验收**：SYN-1 ~ SYN-12 通过 | GLB-1 ~ GLB-7 通过

#### T7：锁定规则适配新架构

| 属性 | 值 |
|------|-----|
| 文件 | `src/popup/popup.js` |
| 类型 | 修改 |
| 估算 | 30 分钟 |

**变更**：
- `setDomainDependentState` 改为三态判定：`hasSites` + `isBlankTab` + `hasCurrentDomain`
- 无站点且空白页：会话管理+同步管理全部锁定，全局设置解锁
- 有站点且空白页：可查看编辑已有站点配置，不可导出 Cookie
- 正常页面：全部解锁

**验收**：LCK-1 ~ LCK-8 通过

---

### P2：架构优化（≈ 2 小时，建议做）

#### T8：消息路由注册表

| 属性 | 值 |
|------|-----|
| 文件 | `src/core/messaging.js`（新建）|
| 类型 | 重构 |
| 估算 | 1 小时 |

**变更**：
- 新增 `registerHandler(action, fn)` / `initMessaging()`
- 将 background.js 中 50+ case 的 switch 替换为注册表模式
- 每个模块文件在自己的文件末尾注册 handler

**验收**：所有 message handler 行为与修改前一致

#### T9：UI 渲染函数化

| 属性 | 值 |
|------|-----|
| 文件 | `src/popup/` 各组件文件 |
| 类型 | 重构 |
| 估算 | 1 小时 |

**变更**：
- 每个 UI 组件封装为独立渲染函数
- 站点选择器 → `renderSiteSelector()`
- 保活列表 → `renderHeartbeatList()`
- 同步配置 → `renderSyncConfig()`

**验收**：UI 渲染正确，组件可独立引用

---

### P3：收尾（≈ 2.5 小时）

#### T10：帮助文档 + README + Skill 更新

**变更**：
- 章节结构按 v2.0 新 UI 重组
- 原「四、踢人拦截」「五、会话保活」独立大章 → 归入「会话管理」章节
- 新增「全局设置」章节
- 新增站点选择器使用说明
- 同步章节按 主从→传输方式 重新组织
- 帮助页操作步骤与 v2.0 UI 保持一致

**验收**：HLP-1 ~ HLP-10 全部通过 | RDM-1 ~ RDM-6 通过 | SKL-1 ~ SKL-4 通过

#### T11：9 项强制自检

| 属性 | 值 |
|------|-----|
| 类型 | 检查 |
| 估算 | 30 分钟 |

**验收**：9 项全部通过

#### T12：构建 + 浏览器测试

| 属性 | 值 |
|------|-----|
| 类型 | 测试 |
| 估算 | 1 小时 |

**验收**：test-plan.md 全部用例通过（含一致性验证 CON-1~7）

#### T13：版本号 + 发布

| 属性 | 值 |
|------|-----|
| 类型 | 发布 |
| 估算 | 15 分钟 |

**变更**：
- CHANGELOG.md + changelog.json 新增 v2.0.0
- VERSION + 6 处版本号 → 2.0.0
- Git commit + tag + push + Release

**验收**：BLD-1 ~ BLD-8 全部通过

---

## 3. 变更文件汇总

| 文件 | 变更类型 | 估算 |
|------|:--------:|:----:|
| `src/background.js` | 改（+迁移逻辑 + alarm 按站点 + P2P 按站点隔离） | **3h** |
| `src/popup/popup.html` | 重写（三 Tab + 站点选择器 + 全局设置） | 2.5h |
| `src/popup/popup.js` | 重写（状态管理 + 事件绑定 + 锁定规则） | 3h |
| `src/popup/popup.css` | 改（新增样式） | 0.5h |
| `src/help/help.html` | 重写（章节结构按新架构重组） | 1h |
| `src/help/help.js` | 改（更新锚点/引用） | 15min |
| `README.md` | 改（版本号/架构图/功能表） | 15min |
| Skill 文档 | 改（项目结构更新） | 15min |
| `CHANGELOG.md` | 追加 | 5min |
| `src/changelog.json` | 追加 | 5min |
| 版本号文件 × 6 | 改 | 5min |

**核心变更**：7 个源文件 + 3 个文档文件，净新增约 800-1200 行代码。

---

## 4. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|:----:|:----:|:----:|------|
| 数据迁移 bug 导致用户配置丢失 | 低 | 🔴 高 | 旧键保留，`onInstalled` 可回滚 |
| popup.html 重构导致 div 嵌套错误 | 中 | 🟡 中 | 自检第3项强制检查 |
| 锁定规则遗漏/过度 | 中 | 🟡 中 | test-plan TC-LCK 全覆盖 |
| 浏览器兼容性（ES Module import） | 低 | 🟡 中 | 已有 Chrome/Edge 验证 |
| 迁移后保活定时器未恢复 | 低 | 🟡 中 | `onInstalled` 中恢复 alarm |
