# SessionMaster v2.0 专家级技术审计报告

> **审计范围**：`/opt/projects/session-master`（develop 分支）
> **审计日期**：2026-06-22
> **当前版本**：v2.0.0-dev（VERSION 文件）
> **审计者**：Hermes Agent

---

## 1. 执行摘要

本审计对 Session Master v2.0 项目进行了实际代码（develop 分支）与规划文档（PRD/开发计划/可行性报告/测试计划）的全面比对。核心发现：

| 维度 | 评分 |
|------|:----:|
| 规划完备性 | 🟡 高（文档体系完善，但存在少量自相矛盾） |
| 代码与规划一致性 | 🔴 低（当前代码仍为 v1.x 结构，未实施任何 v2.0 规划） |
| 技术风险水平 | 🟡 中高（1 个临界 Bug + 多个中风险项） |
| 测试覆盖 | 🟢 好（40+ 用例设计合理） |
| 工时估算准确性 | 🔴 显著偏估（popup.js 重写估算 200 行，实际 2098 行） |

---

## A. 代码结构审计（实际代码 vs 规划）

### A.1 background.js

| 指标 | 实际值 | 规划声称值 | 偏差 |
|:-----|:------:|:----------:|:----:|
| 总行数 | **1,734 行** | 约 2,000 行（PRD §7） | ✅ 接近 |
| message handler 数量 | **37 个 case** | 50+ 个（maintainability-analysis） | ❌ 50+ 不准确 |
| switch case 分布 | L1461-L1670（209 行） | — | — |
| ES Module | ✅ 已用（`import { APP_CONFIG }`） | — | — |

**37 个 action 分布**：
- Cookie 管理：5（getCookies, importCookies, importWithCookieClear, clearCookies, getDomainFromUrl）
- 拦截规则：3（getBlockingRules, addBlockingRule, removeBlockingRule）
- 规则库：5（getRulesDB, getRecommendedRules, updateRulesDBFromServer, exportRulesDB, importRulesDB）
- 拦截配置：4（getBlockerConfig, saveBlockerConfig, isBlockingEnabled, getEffectiveKeywords）
- 同步配置：3（getSyncConfig, saveSyncConfig, saveMasterMode）
- P2P 模式：5（p2pCreateRoom, p2pJoinRoom, p2pDisconnect, p2pManualSync, p2pToggleSync）
- 服务器模式：5（serverGetSyncConfig, serverSaveSyncConfig, serverToggleSync, serverManualSync, serverRegisterDevice, serverGetPairStatus）
- 升级检测：3（getUpdateConfig, setUpdateConfig, checkUpdate）+ getAppConfig
- 保活：5（getHeartbeats, addHeartbeat, removeHeartbeat, toggleHeartbeat, pauseAllHeartbeats, getCookieMetaForDomain）
- 同步历史：2（getSyncHistory, clearSyncHistory）
- 日志：3（getLogs, exportLogs, clearLogs）
- 设备身份：2（getDeviceIdentity, resetDeviceIdentity）+ addSyncHistoryEntry + getNetworkInfo

**规划模块文件（均不存在）**：`src/core/migration.js` ✅ 规划新建 | `src/core/sites.js` ✅ 规划新建 | `src/core/messaging.js` ✅ 规划新建

### A.2 popup.js

| 指标 | 实际值 | 规划声称值 | 偏差 |
|:-----|:------:|:----------:|:----:|
| 总行数 | **2,098 行** | "约 200 行"（PRD §7） | 🔴 **严重低估 10x** |
| Tab 切换 | 3 个 tab：session / sync / **blocker**（v1.x 结构） | 三 Tab：session / sync / **global**（v2.0 设计） | 🔴 **仍为 v1.x 结构** |
| UI 渲染方式 | **innerHTML** 拼接 | 规划为渲染函数化（T9） | ✅ 规划已认知需重构 |

**关键发现**：popup.js 的 HTML（popup.html）目前仍然是 v1.x 的三 Tab 结构（会话/同步/拦截），**完全没有实现 v2.0 的三 Tab 布局**（会话/同步/全局）。站点选择器、全局设置 Tab 等均不存在。

### A.3 当前 Storage 键

| 实际键名 | 用途 | 定义位置 | v2.0 规划映射 |
|:--------|:-----|:--------:|:-------------:|
| `heartbeat_configs` | 保活记录 | background.js L1181（硬编码） | → `sites[].heartbeats[]` |
| `cloud_sync_config` | P2P + 服务器同步配置 **共用同一键** | config.js L21,L22 | → `global.*` + `sites[].sync.*` |
| `device_identity` | 设备身份 | background.js L182（硬编码） | → `global.deviceIdentity` |
| `blocker_config` | 拦截配置 | background.js L1401（硬编码） | → `blockerConfig`（不变）|
| `blocking_rules_db` | 规则库 | config.js L24（key）+ background.js L1276（硬编码） | → `blockingRulesDB`（不变）|
| `sync_history` | 同步记录 | config.js L27 | 按站点过滤 |
| `user_blocking_rules` | 自定义规则 | background.js L1275（硬编码） | 不变 |
| `app_logs` | 操作日志 | background.js L28（硬编码） | 不变 |
| `sync_cookie_meta` | Cookie 来源追踪 | background.js L532（硬编码） | 不变 |

**⚠️ 临界 Bug**：`config.js` 中 `STORAGE_KEYS.SYNC_CONFIG` 和 `STORAGE_KEYS.SERVER_SYNC_CONFIG` **都是** `'cloud_sync_config'`。这意味着 P2P 同步和服务器同步的配置**互相覆盖**。SER v1.x 就有此 Bug，v2.0 需在数据迁移时修复。

### A.4 P2P 连接管理

| 维度 | 当前实现（v1.x） | v2.0 规划 |
|:-----|:----------------:|:---------:|
| 数据结构 | `p2pConnections = { [peerId]: {...} }` | `p2pConnections = { [siteDomain]: {...} }` |
| 索引方式 | 按 peerId（对等端 ID） | 按 siteDomain（站点域名） |
| 单例状态 | `currentP2PRoomId` + `currentP2PPeerId` 全局变量 | 每个站点独立 |
| 轮询 | `p2pPollTimer` **单例**（只支持一个轮询循环） | 每个站点独立轮询 |
| 连接池管理 | `deleteP2PConnection(peerId)` | `p2pDisconnect(siteDomain?)` |

**风险**：当前 `startP2PPolling()` 用 `if (p2pPollTimer) return;` 阻止重复轮询，无法支持多站点并发。v2.0 需改为按域名索引的轮询 Map。

### A.5 Alarm 命名方式

| 当前 alarm 名 | 用途 | 问题 |
|:-------------|:----:|:----:|
| `'sessionSync'` | 服务器自动同步 | 无域名标识，单 alarm 无法支持多站点 |
| `'p2pSyncAlarm'` | P2P 自动同步 | 同上 |
| `'heartbeat_' + id` | 保活心跳 | ✅ 已按 ID 独立，但需映射到站点 |
| `'versionCheck'` | 版本检查 | 全局，无影响 |

**v2.0 规划**：`serverSync_{domain}` / `p2pSync_{domain}` / `heartbeat_{id}` — 当前**完全未实施**。

### A.6 模块依赖关系

```
背景（当前 v1.x）：
  background.js (1734行) ← config.js
       ↑ 单体文件，无内部模块拆分
  popup.js (2098行) ← popup.html
       ↑ IFFE 自执行，无 import/export

规划（v2.0）：
  background.js (入口100行)
    ├─ core/cookies.js
    ├─ core/sync-p2p.js
    ├─ core/sync-server.js
    ├─ core/heartbeat.js
    ├─ core/blocker.js
    ├─ core/sites.js (新建)
    ├─ core/migration.js (新建)
    └─ core/messaging.js (新建)
  
  popup/popup.js
    ├─ popup/site-selector.js (新建)
    ├─ popup/session-tab.js (新建)
    ├─ popup/sync-tab.js (新建)
    └─ popup/global-tab.js (新建)
```

**状态**：❌ **全未实施。** `src/core/` 目录不存在，src/popup/ 下仅有 popup.js/popup.css/popup.html。

---

## B. 规划文档评审

### B.1 PRD.md

| 检查项 | 结果 | 说明 |
|:-------|:----:|:------|
| 需求定义清晰可测试 | 🟡 | 大部分 OK，但数据模型以伪代码给出而非正式 schema |
| 模糊/矛盾需求 | 🔴 | §2.2 标题「Tab 1：🌐 会话管理」出现两次 |
| 数据模型完整 | 🟡 | 字段类型隐含在 JSON 示例中，但缺少：默认值定义、边界条件（空 sites 数组、heartbeats 数组上限、sync URL 长度限制） |
| 迁移方案完整 | 🟡 | §3.3 迁移代码是伪代码，不完整：未迁移 blockerConfig，未处理 p2pConnectedPeerName 字段 |
| PRD §7 UI 估算 | 🔴 | "约 200 行 popup.js 重写" — 实际 2,098 行，偏估 10 倍 |

**具体问题**：

1. **§2.2 标题重复**：「Tab 1：🌐 会话管理」出现了两次（L95 和 L103），第二个块实际是 Wireframe 内容，应改为子节。

2. **§3.3 迁移代码不完整**：迁移伪代码中未处理 `blocker_config` → `blockerConfig` 的映射；新数据结构中 `sync.p2p` 缺少 `connectedPeerName` 字段；未设置 `v2_migrated` 标记。

3. **§5 迁移策略缺少异常处理**：当 `chrome.storage` 读取旧键失败时无回退策略。

4. **§7 可行性评估中 popup 重写行数偏差】：「约 200 行 popup.js 重写」（L518）与实际 2,098 行偏差巨大。

5. **存储键命名不统一**：PRD 使用 `v2_sites` / `v2_global`，但 config.js 中现有键均为无前缀名（如 `cloud_sync_config`）。迁移后的键名应正式确定。

### B.2 development-plan.md

| 检查项 | 结果 | 说明 |
|:-------|:----:|:------|
| 13 个任务覆盖 | 🟢 | P0(3个): T1-T3; P1(4个): T4-T7; P2(2个): T8-T9; P3(4个): T10-T13 |
| 任务依赖合理 | 🟢 | P0→P1→P2→P3 顺序合理 |
| 工时估算 | 🟡 | 总 12-15h，但 **T6「三 Tab 内容重构 2.5h」严重偏低**（popup.js 2,098 行 JS + 539 行 HTML 需全面改写） |
| 遗漏场景 | 🔴 | **首次安装启动 v2.0**（全新用户无 v1 数据）：onInstalled 逻辑未单独定义；**降级回退**：未描述用户从 v2.0 回到 v1.x 的操作步骤；**数据损坏恢复**：迁移中途失败、数据不完整时的恢复策略；**Service Worker 重启**：SW 被浏览器终止后恢复 P2P/Alarm 的逻辑 |

**具体问题**：

1. **T6 工时严重低估**：「2.5h」要重构 2,098 行 popup.js + 539 行 popup.html，几乎不可能。合理估算 6-8h。

2. **T8「消息路由注册表 1h」**：37 个 case 逐个提取为注册模式，加测试，1h 严重不足。合理估算 2-3h。

3. **T9「UI 渲染函数化 1h」**：将 2,098 行的 innerHTML 渲染拆为独立函数组件，1h 远不够。

4. **附录逐行变更清单**（L1927-1955）：乐观到不现实。例如「T6：popup.html 三 Tab 内容重写 45min」— 内容重写且要保证所有 id 与 JS 对齐，至少 2-3h。

5. **未提及测试套件**：40+ 测试用例需要编写和自动化，无对应工时。

### B.3 feasibility-report.md

| 检查项 | 结果 | 说明 |
|:-------|:----:|:------|
| 2 项设计调整已闭环 | 🟡 | Alarm 命名（调整1）和 P2P 隔离（调整2）已在 PRD §3.4-3.5 中体现，但 **PRD 中仍缺失「需更新 PRD」的正式标记** |
| 可行性结论的假设条件 | 🟡 | 假设「所有逻辑函数保持」（L517），但 **popup.js 中大量 inline innerHTML + 直接 DOM 操作需要完全重写**，并非「保持」 |

**具体问题**：

1. 可行性报告 L517-518：「约 200 行 popup.js 重写 + HTML 重排」— 严重低估。

2. 储存键评估（L272-285）：v2_sites 估算 3-5KB/10 站点。但未考虑历史同步记录增长、日志大小（上限 10MB）。

3. 报告 L322「8/8 有条件通过」的结论合理，但**假设条件需补充**：模块拆分后 ES Module 在 Service Worker 中的兼容性需验证。

### B.4 test-plan.md

| 检查项 | 结果 | 说明 |
|:-------|:----:|:------|
| 40+ 用例支持自动化 | 🔴 | **全部为手动测试**，无自动化框架。40+ 用例 + 回归测试需大量人工 |
| 手动测试工作量估算 | ❌ | 无估算。40+ 用例 × 平均 2min = 约 1.5h，但需重复执行 |
| 回归测试策略 | 🟡 | §0 QA 指引中提到回归测试，但无具体回归用例列表 |
| 跨文件一致性测试 | 🟢 | CON-1~7 自动化检查项设计良好 |
| 缺失用例 | 🟡 | **Service Worker 生命周期测试**：SW 休眠后重新激活时 alarm/P2P 恢复；**并发 P2P 连接测试**：多站点同时 P2P+服务器；**存储配额测试**：大量站点+日志超限 |

---

## C. 技术风险识别

### C.1 🔴 数据迁移风险（严重）

| 风险 | 等级 | 说明 |
|:-----|:----:|:------|
| 迁移失败恢复 | 🔴 高 | PRD 方案「保留旧键」做回滚备份是正确设计，但 **无自动回滚机制**。迁移失败后用户需手动删除 v2_ 键 |
| 数据不一致 | 🟡 中 | migration.js 伪代码未处理 `blocker_config`，未清洗域名格式（大小写、端口号） |
| 重复迁移检测 | 🟡 中 | `v2_migrated` 标记保护，但若旧键被 Chrome 同步覆盖则可能重跑 |
| **临界 Bug** | 🔴 **严重** | `config.js` 中 `SYNC_CONFIG` 和 `SERVER_SYNC_CONFIG` 共用 `'cloud_sync_config'` 键名。若 v1.x 用户同时启用了 P2P 和服务器同步，数据会互相覆盖 |

**建议**：
- 迁移代码中加入**事务性提交**：写入 v2 键前先校验旧键完整性，失败时回滚
- 临界 Bug 应在迁移中修复：将重叠的 `cloud_sync_config` 拆分为独立键
- 迁移后增加**数据完整性校验**：v2_sites 中每条必须有 domain、+ 必填字段

### C.2 🟡 P2P 多连接风险（中）

| 风险 | 等级 | 说明 |
|:-----|:----:|:------|
| WebRTC 并发 | 🟡 中 | 当前 `p2pPollTimer` 是全局单例，不支持多站点。每个站点需独立轮询 |
| 连接状态管理 | 🟡 中 | SW 重启后所有 RTCPeerConnection 丢失，需自动重建 |
| 端口/连接数限制 | 🟢 低 | Chrome 对 RTCPeerConnection 数量有软限制（约 50 个），多站点场景可控 |

**当前代码限制**（background.js L876-L906）：
```javascript
function startP2PPolling(signalUrl, roomId, peerId) {
  if (p2pPollTimer) return;  // ← 单例锁定，不支持多站点
}
```

### C.3 🟡 模块拆分风险（中）

| 风险 | 等级 | 说明 |
|:-----|:----:|:------|
| ES Module 兼容性 | 🟡 中 | Manifest V3 SW 支持 `import`，但动态 import 可能有问题；拆分后需确保无循环依赖 |
| 37 个 handler 迁移 | 🟡 中 | 每个 handler 调用多个函数，拆分后需确保所有依赖正确导入 |
| popup.js 2,098 行拆分 | 🔴 高 | 大量函数相互调用共享变量（`currentDomain`、`blockerConfig`），拆分时需提取为共享状态 |

### C.4 🟡 升级兼容性风险（中）

| 风险 | 等级 | 说明 |
|:-----|:----:|:------|
| v1.x 用户升级到 v2.0 | 🟡 中 | 当前代码无迁移代码，`onInstalled`（L1686-1734）未执行任何迁移。用户升级后数据保持不变（旧结构），v2.0 代码读不到新键 |
| 视觉体验 | 🟢 低 | 弹窗仍为 v1.x 三 Tab，v2.0 三 Tab 未实现 |

### C.5 🟡 Chrome Extension 特有风险（中）

| 风险 | 等级 | 说明 |
|:-----|:----:|:------|
| Service Worker 生命周期 | 🟡 中 | SW 约 30 秒无事件后休眠，alarm 唤醒后可能丢失 P2P 连接状态。当前 onInstalled（L1713-1718）已有重置逻辑，但 v2.0 需扩展 |
| Alarm 上限 | 🟢 低 | Chrome 允许 500+ alarms，多站点场景可控 |
| Storage 配额 | 🟢 低 | `unlimitedStorage` 权限已声明，无限制 |

---

## D. 架构评估

### D.1 「站点选择器」组件设计

**评分**：🟢 设计合理

- 跨 Tab 共享状态：`activeSite` 模块级变量
- 数据流清晰：popup.js 初始化 → loadSites() → renderSiteSelector() → onSwitch 回调 → 各 Tab 重新渲染
- 自动识别当前 URL 域名逻辑已有（getCurrentTabInfo）
- 全局设置 Tab 独立于站点选择器

**建议**：站点切换时需级联更新 Tab 内容，映射关系应在一处集中管理而非散布在各渲染函数中。

### D.2 三 Tab 结构责任划分

**评分**：🟢 清晰

| Tab | 责任 | 数据源 | 状态依赖 |
|:----|:-----|:------:|:--------:|
| 🌐 会话管理 | Cookie CRUD + 保活 + 拦截 | `sites[domain]` | 需要 activeSite |
| 🔄 同步管理 | 主从 + P2P/服务器 | `sites[domain].sync` + `global` | 需要 activeSite |
| ⚙️ 全局设置 | 信令地址/服务器地址/设备身份 | `global` | 无需站点 |

**当前状态**：HTML 仍为 v1.x 三 Tab（session/sync/blocker），v2.0 三 Tab **未实现**。

### D.3 消息路由注册表方案

**评分**：🟢 设计良好

方案（development-plan.md T8）将 37 个 case 的 switch 替换为注册表模式：
```javascript
// messaging.js
const handlers = {};
export function registerHandler(action, handler) { handlers[action] = handler; }
export function initMessaging() {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const handler = handlers[request.action];
    if (!handler) { sendResponse({ error: '未知操作' }); return; }
    handler(request, sender).then(sendResponse);
    return true;
  });
}
```

**注意**：实现时需处理每个 handler 的 `async` 特性，确保 `sendResponse` 在 async 完成后调用。

### D.4 数据模型 vs UI 组件一致性

**评分**：🟡 基本一致

| v2.0 数据模型 | UI 对应 | 一致性 |
|:--------------|:-------|:------:|
| `sites[].domain` | 站点选择器下拉 + 站点名显示 | ✅ |
| `sites[].heartbeats[]` | 保活列表（按站点筛选） | ✅ |
| `sites[].sync.p2p.*` | P2P 配对 + 同步开关 | ✅ |
| `sites[].sync.server.*` | 服务器注册 + 同步开关 | ✅ |
| `global.signalUrl` | 全局设置 → 信令地址 | ✅ |
| `global.serverUrl` | 全局设置 → 服务器地址 | ✅ |
| `blockerConfig` | 拦截配置（主开关/站点开关） | ✅ |
| `blockingRulesDB` | 规则库管理 | ✅ |

---

## E. 综合发现汇总

### 🔴 严重问题（须在开发前修复）

| # | 问题 | 文件 | 建议 |
|:-:|:-----|:----|:-----|
| 1 | `SYNC_CONFIG` 和 `SERVER_SYNC_CONFIG` 共用一个存储键 `'cloud_sync_config'` | `src/config.js:21-22` | ✅ **已修复** — `SERVER_SYNC_CONFIG` 改为 `'cloud_server_sync_config'` |
| 2 | 当前代码全为 v1.x 结构，无任何 v2.0 实现 | 全部 src/ 文件 | ⏳ 待开发阶段执行，工时已上调 |

### 🟡 中等问题

| # | 问题 | 涉及文档/文件 | 建议 | 状态 |
|:-:|:-----|:-------------|:------|:----:|
| 3 | PRD §2.2 标题重复（L95 和 L103） | PRD.md | 删除重复标题 | ✅ **已修复** |
| 4 | popup.js 重写估算偏 10 倍（200→2,098 行） | PRD.md §7, feasibility-report.md §2.5 | 更新为「约 2,100 行 popup.js 全面重写」，工时调整 | ✅ **已修复** |
| 5 | 迁移伪代码不完整（未处理 blockerConfig 等） | PRD.md §3.3 | 补充完整字段映射 | ✅ **已修复** |
| 6 | Service Worker 重启后 alarm/P2P 恢复逻辑不完善 | background.js L1686-1734 | 添加站点级 alarm 恢复（按 v2_sites 扫描） | ⏳ 待 T2 实施 |
| 7 | T6/T8/T9 工时严重低估 | development-plan.md | T6 2.5h → 7h；T8 1h → 2.5h；T9 1h → 3.5h | ✅ **已修复** |
| 8 | 无首次安装 v2.0 场景、降级回退、数据损坏恢复 | development-plan.md | 新增 T0「全新安装初始化」、附录「降级操作指南」 | ✅ **已修复** |
| 9 | 40+ 测试用例无自动化，无 UX 功能测试 | test-plan.md | 新增 GLB-11~15 和 TC-UPD 测试组 | ✅ **已修复** |
| 10 | PRD 未反映 v1.5.x 8 项 UX 特性 | PRD.md | 补充 §2.5 UX 交互描述 | ✅ **已修复** |

### 🟢 良好实践

| # | 实践 | 说明 |
|:-:|:-----|:------|
| 9 | 规划文档体系完整 | PRD/开发计划/可行报告/测试计划/可维护性分析相互引用 |
| 10 | P2P 隔离设计正确 | 从 peerId 索引改为 siteDomain 索引，方案合理 |
| 11 | Alarm 命名约定设计正确 | 按域名隔离，onAlarm 解析域名后按站点执行 |
| 12 | 回滚方案设计正确 | 「保留旧键」策略是正确做法 |
| 13 | 测试覆盖全面 | 40+ 测试用例覆盖站点选择、会话管理、同步、锁定规则、迁移、回滚 |
| 14 | 消息路由注册表方案 | 将 37 case switch 改为注册表，架构优雅 |

---

## F. 修正后开发计划建议

| 任务 | 当前估算 | 建议调整 | 理由 |
|:----|:--------:|:--------:|:-----|
| T0（新增）全新安装初始化 | — | 1h | 无 v1 数据的首次安装场景 |
| T1 迁移框架 | 1h | 1.5h | 需修复 config.js 键名 Bug |
| T2 Alarm 改造 | 1h | 1.5h | 含 SW 重启恢复逻辑 |
| T3 P2P 隔离改造 | 1h | 1.5h | 轮询 Timer 改为 Map |
| T4 模块拆分 | 0.5h | 1h | 7 个文件骨架 + import 链路 |
| **T5 站点选择器** | **1h** | **2h** | 含站点 CRUD + 自动识别 |
| **T6 三 Tab 重构** | **2.5h** | **6-8h** | 核心工作量，2,098 行 JS 全面改写 |
| T7 锁定规则 | 0.5h | 1h | 三态判定（无站点/有站点/正常页）|
| **T8 消息路由** | **1h** | **2-3h** | 37 个 handler 逐个提取 |
| **T9 渲染函数化** | **1h** | **3-4h** | 全量 innerHTML 拆为组件 |
| T10 文档更新 | 1h | 2h | help.html + README + Skill |
| T11 自检 | 0.5h | 0.5h | 合理 |
| T12 构建+测试 | 0.5h | 2h | 40+ 用例首次执行 |
| T13 版本发布 | 0.5h | 0.5h | 合理 |
| **合计** | **12-15h** | **24-30h** | **合理估算** |

---

## G. 结论

**总体评价**：规划质量高但工时严重低估。代码目前处于 v1.x 阶段，v2.0 改造尚未开始。

**关键行动项**：
1. ✅ ~~修复 config.js 键名 Bug（临界）~~ **已修复**
2. ✅ ~~更新 PRD 工时估算~~ **已修复**
3. ✅ ~~补充迁移代码遗漏字段~~ **已修复**
4. ✅ ~~增加全新安装/降级回退/数据恢复场景~~ **已修复**
5. ✅ ~~全局工时从 12-15h 上调至 24-30h~~ **已修复**
6. ✅ ~~补充 test-plan UX 用例~~ **已修复**
7. ✅ ~~建立文档归口管理规范~~ **已创建**
8. ⏳ Service Worker 重启恢复逻辑 — 待 T2 开发时实施
