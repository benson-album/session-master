# SessionMaster v2.0 — 架构债务与可升级性分析

> **关联文档**：`feasibility-report.md` · `PRD.md`
> **评估内容**：现有架构遗留债务 + v3.0+ 可升级性设计

---

## 1. 问题：现有工程是否能承载 v2.0

### 1.1 background.js：2000 行单体函数

**现状**：所有逻辑写在一个文件，按 `// === 模块标题 ===` 注释分段：

```javascript
// ========== Cookie 管理 ==========    (L407)
// ========== P2P 连接管理 ==========   (L682)
// ========== 云端同步核心逻辑 ======== (L963)
// ========== 保活管理 ==========       (L1095)
// ========== 拦截模块配置 ==========   (L1315)
// ========== API 消息处理 ==========   (L1395) — 50+ 个 case 的 switch
```

**v2.0 将新增**：
- 数据迁移逻辑（~60 行）
- 站点管理 handler（~30 行）
- 全局设置 handler（~20 行）
- Alarm 按站点重构（~40 行修改）
- P2P 连接隔离重构（~80 行修改）

**问题**：v2.0 改动后 background.js 将接近 1900+ 行，且逻辑更耦合（迁移、站点、全局、旧 alarm 混在一起）。

**方案**：**模块拆分**——不晚于 v2.0

| 文件 | 职责 |
|:----|:------|
| `core/cookies.js` | Cookie CRUD、智能导出/导入、来源追踪 |
| `core/sync-p2p.js` | P2P 引擎、WebRTC、信令轮询 |
| `core/sync-server.js` | 服务器同步、设备注册 |
| `core/heartbeat.js` | 保活管理、alarm 生命周期 |
| `core/blocker.js` | 拦截配置、规则库管理 |
| `core/sites.js` | **v2.0 新增**：站点管理、迁移、全局设置 |
| `core/messaging.js` | **v2.0 新增**：消息路由注册（替代 switch）|
| `background.js` | 入口文件，仅 import 各模块 + onInstalled + onAlarm |

> **⚠️ 注意**：模块拆分是代码组织优化，不影响功能逻辑。需确保 ES Module import 路径正确，manifest.json 的 `service_worker` 配置不变。

### 1.2 popup.js：2000+ 行单体函数

**现状**：所有 UI 逻辑在一个文件，按 `// ==========` 注释分段。

**v2.0 将新增**：
- 站点选择器逻辑（~80 行）
- 全局设置 Tab 逻辑（~100 行）
- 锁定规则重写（~30 行修改）
- 会话管理 Tab 新增拦截内容（~50 行移动）

**方案**：按 Tab 拆分

| 文件 | 职责 |
|:----|:------|
| `popup/popup.js` | 入口：header、站点选择器、Tab 切换、共享状态 |
| `popup/session.js` | 会话管理 Tab：Cookie + 保活 + 拦截 |
| `popup/sync.js` | 同步管理 Tab：主从 + P2P + 服务器 |
| `popup/global.js` | **v2.0 新增**：全局设置 Tab |

### 1.3 消息路由：50+ case 的 switch 语句

**现状**：

```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    switch (request.action) {
      case 'getCookies': ...
      case 'importCookies': ...
      case 'clearCookies': ...
      // ... 50+ cases
      default: sendResponse({ error: '未知操作' });
    }
  })();
  return true;
});
```

**v2.0 新增 5-8 个 case**（站点 CRUD、全局设置等）。未来每加功能都往 switch 里塞。

**方案**：**v2.0 引入消息注册表**

```javascript
// messaging.js
const handlers = {};

export function registerHandler(action, handler) {
  handlers[action] = handler;
}

export function initMessaging() {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
      const handler = handlers[request.action];
      if (!handler) { sendResponse({ error: '未知操作' }); return; }
      sendResponse(await handler(request, sender));
    })();
    return true;
  });
}

// background.js
import { initMessaging, registerHandler } from './core/messaging.js';
import { handleGetCookies, handleClearCookies } from './core/cookies.js';
import { handleP2PCreateRoom, handleP2PJoinRoom } from './core/sync-p2p.js';

registerHandler('getCookies', handleGetCookies);
registerHandler('clearCookies', handleClearCookies);
registerHandler('p2pCreateRoom', handleP2PCreateRoom);
// ...

initMessaging();
```

---

## 2. 问题：v3.0 怎么避免从零开始

### 2.1 版本化迁移框架

**当前计划**：v1.x → v2.0 一次性迁移脚本，写在 `onInstalled` 中。

**问题**：下次 v2.x → v3.0 时，又要写一个一次性脚本。而且如果用户从 v1.x 直接升级到 v3.0（跳过 v2.0），数据会乱。

**方案**：**链式迁移**（v2.0 必须做）

```javascript
// core/migration.js
const SCHEMA_VERSION_KEY = 'schema_version';

const migrations = {
  1: migrateV1toV2,   // v2.0 实现的
  2: migrateV2toV3,   // v3.0 添加的
  // 3: migrateV3toV4, // v4.0 添加的
};

export async function runMigrations() {
  const currentVersion = await getStorage(SCHEMA_VERSION_KEY, 1);
  if (currentVersion >= LATEST_SCHEMA) return;

  for (let v = currentVersion; v < LATEST_SCHEMA; v++) {
    console.log(`[SessionMaster] 运行数据迁移: v${v} → v${v + 1}`);
    await migrations[v]();
    await setStorage(SCHEMA_VERSION_KEY, v + 1);
  }
}
```

**关键设计**：
- `schema_version` 作为独立存储键，标记当前数据版本
- 每个迁移函数只处理 `v→v+1` 的增量变化
- 用户从任何旧版本升级，自动执行所有缺失的迁移步骤
- 迁移函数必须是**幂等的**（重复执行不报错）

### 2.2 存储键命名规范

**当前问题**：存储键 `heartbeat_configs`、`sync_config`、`server_sync_config` 命名风格不统一。

**方案**：v2.0 新键统一前缀 + 版本号

```
v2_global            ← 全局设置
v2_sites             ← 站点数据数组
v2_schema_version    ← 数据架构版本号
v2_migrated          ← （v2 临时标记）
sync_cookie_meta     ← Cookie 来源追踪（保留原名，已有用户数据）
blocker_config       ← 拦截配置（保留原名）
blocking_rules_db    ← 规则库（保留原名）
app_logs             ← 日志（保留原名）
device_identity      ← 设备身份（保留原名）
```

**后续版本**：
```
v3_sites             ← v3.0 新数据
v3_global            ← v3.0 新全局设置
```

### 2.3 Alarm 命名规范（永久约定）

**当前**：`sessionSync`、`p2pSyncAlarm`、`heartbeat_{id}`

**v2.0 改为**：`p2pSync_{domain}`、`serverSync_{domain}`、`heartbeat_{id}`

**永久约定**：

```
{模块}_{域名/ID}     ← 所有 alarm 使用此格式
```

**好处**：v3.0 新增功能（如通知提醒 alarm）直接复用此约定，不需要改 alarm 基础设施。

### 2.4 函数签名规范

**当前**：函数参数列表随意，有些接受 `(url, interval, domain, siteName)`，有些接受 `(targetPeer)`。

**v2.0 新增函数应统一**：

```javascript
// 接受 site 对象而非分散参数
async function addHeartbeatToSite(site, { url, interval }) { ... }
async function p2pCreateRoom(site, { deviceName, signalUrl }) { ... }
async function performServerSync(site) { ... }
```

**好处**：v3.0 的 `site` 对象可能新增字段（如 `tags: string[]`），已存在的函数不需要改签名。

### 2.5 UI 组件化模式

**当前**：所有 UI 通过 `document.getElementById()` + `.innerHTML` 拼接。

**问题**：v3.0 如果要改站点选择器样式或功能，得从一大段 JS 中找到相关代码。

**v2.0 推荐**：每个 UI 组件使用独立渲染函数

```javascript
// popup/site-selector.js
export function renderSiteSelector(container, sites, activeSite, onSwitch) {
  container.innerHTML = `
    <select id="siteDropdown" class="site-selector">
      ${sites.map(s => `
        <option value="${s.domain}" ${s.domain === activeSite ? 'selected' : ''}>
          ${s.domain}
        </option>
      `).join('')}
      <option value="__add__">+ 添加新站点</option>
    </select>
  `;
  container.querySelector('#siteDropdown').onchange = (e) => {
    if (e.target.value === '__add__') showAddSiteDialog();
    else onSwitch(e.target.value);
  };
}
```

**好处**：v3.0 如需改为搜索式下拉、多选等，只需改这一个函数，不影响其他模块。

---

## 3. v2.0 必须做 + 建议做的清单

| 事项 | 必须/建议 | 原因 |
|:----|:---------:|------|
| 版本化迁移框架（`schema_version` + 链式迁移） | **必须** | 否则 v3.0 升级需从零写迁移 |
| 存储键统一前缀（`v2_`） | **必须** | 明确新旧数据边界 |
| Alarm 命名永久约定 | **必须** | 已确定方案（3.4节）|
| P2P 连接隔离命名约定 | **必须** | 已确定方案（3.5节）|
| background.js 模块拆分 | **建议** | 2000 行单体已到极限 |
| popup.js 按 Tab 拆分 | **建议** | 降低维护成本 |
| 消息路由注册表 | **建议** | switch 维护性差 |
| UI 渲染函数化 | **建议** | 为未来 UI 重构打底 |

---

## 4. 实施建议

### v2.0 分批建议（调整后）

| 批次 | 内容 | 工时 | 说明 |
|:----:|------|:----:|------|
| **P0** 基础设施 | `schema_version` + 链式迁移 + 存储键命名 + Alarm/P2P 改造 | 3.5h | 必须做 |
| **P1** UI 重构 | Tab 拆分 + 站点选择器 + 三 Tab 内容 | 4h | 建议模块化 |
| **P2** 架构优化 | background 模块拆分 + 消息路由注册表 | 2h | 建议但不强求 |
| **P3** 收尾 | 文档 + 测试 + 发布 | 2.5h | — |

**先做 P0+P1（核心功能），再做 P2（架构优化）**。

如果 P2 时间不够可以延迟到 v2.1。
