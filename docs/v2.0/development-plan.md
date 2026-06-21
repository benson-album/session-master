# SessionMaster v2.0 — 可执行开发计划

> **版本**：v2.0-exec
> **粒度**：逐文件、逐函数、逐行操作
> **工时**：12-15h（P0 3.5h / P1 4.5h / P2 2h / P3 2.5h）
> **说明**：每个子任务完成后立即执行对应测试用例验证

---

## 目录

- [P0：基础设施（3.5h）](#p0基础设施35h)
- [P1：UI 重构（4.5h）](#p1ui-重构45h)
- [P2：架构优化（2h）](#p2架构优化2h)
- [P3：收尾（2.5h）](#p3收尾25h)

---

# P0：基础设施（3.5h）

---

## T1 — 版本化迁移框架 + 数据迁移（1h）

### 涉及文件

| 操作 | 文件 |
|:----:|:----:|
| 新建 | `src/core/migration.js` |
| 新建 | `src/core/sites.js` |
| 修改 | `src/background.js`（`onInstalled` + 导入）|

### T1-S1：创建 src/core/ 目录骨架

```bash
cd src && mkdir -p core && cd core
touch migration.js sites.js cookies.js heartbeat.js \
      sync-p2p.js sync-server.js blocker.js messaging.js
```

### T1-S2：实现 migration.js

**文件**：`src/core/migration.js`

**代码骨架**：

```javascript
const SCHEMA_VERSION_KEY = 'v2_schema_version';
const LATEST_SCHEMA = 2;

// 通用存储辅助（后续各模块复用）
async function getStorage(key, def) {
  const r = await chrome.storage.local.get(key);
  return r[key] !== undefined ? r[key] : def;
}
async function setStorage(key, val) {
  await chrome.storage.local.set({ [key]: val });
}

export async function runMigrations() {
  const version = await getStorage(SCHEMA_VERSION_KEY, 1);
  if (version >= LATEST_SCHEMA) return;
  if (version < 2) await migrateV1toV2();
  // 未来：if (version < 3) await migrateV2toV3();
  await setStorage(SCHEMA_VERSION_KEY, LATEST_SCHEMA);
}

async function migrateV1toV2() {
  // 1. 读取 v1.x 所有旧键
  const beats = await getStorage('heartbeat_configs', []);
  const p2p = await getStorage('sync_config', {});
  const server = await getStorage('server_sync_config', {});
  const identity = await getStorage('device_identity', {});

  // 2. 收集所有站点域名（去重）
  const domains = new Set();
  beats.forEach(b => { if (b.domain) domains.add(b.domain); });
  if (p2p.syncedDomains?.[0]) domains.add(p2p.syncedDomains[0]);
  if (server.syncedDomains?.[0]) domains.add(server.syncedDomains[0]);
  // 回退：如果 beats 中有的心跳无 domain，从 URL 提取
  beats.forEach(b => {
    if (!b.domain && b.url) {
      try { domains.add(new URL(b.url.startsWith('http') ? b.url : 'https://' + b.url).hostname); } catch {}
    }
  });

  // 3. 构建 v2_sites
  const sites = Array.from(domains).map(domain => ({
    domain,
    createdAt: new Date().toISOString(),
    heartbeats: beats.filter(b => {
      if (b.domain === domain) return true;
      // 域名匹配：回退通过 URL hostname 匹配
      if (!b.domain && b.url) {
        try {
          const h = new URL(b.url.startsWith('http') ? b.url : 'https://' + b.url).hostname;
          return h === domain;
        } catch { return false; }
      }
      return false;
    }),
    sync: {
      masterMode: p2p.masterMode ?? server.masterMode ?? false,
      isMaster: p2p.isMaster ?? true,
      p2p: {
        enabled: !!(p2p.enabled && p2p.mode === 'p2p' && p2p.syncedDomains?.[0] === domain),
        roomId: p2p.p2pRoomId || null,
        connected: false,
      },
      server: {
        enabled: !!(server.enabled && server.syncedDomains?.[0] === domain),
        deviceId: server.deviceId || null,
        pairKey: server.pairKey || null,
      },
    },
  }));

  // 4. 构建 v2_global
  const global = {
    signalUrl: p2p.signalUrl || '',
    serverUrl: server.serverUrl || '',
    p2pDeviceName: p2p.p2pDeviceName || '',
    serverDeviceName: server.deviceName || '',
    syncInterval: p2p.intervalMinutes || server.intervalMinutes || 5,
    deviceIdentity: identity,
  };

  // 5. 写入新键（旧键不动）
  await setStorage('v2_sites', sites);
  await setStorage('v2_global', global);
}
```

### T1-S3：实现 sites.js（站点 + 全局设置 handler）

**文件**：`src/core/sites.js`

```javascript
export async function getSites() {
  return await getStorage('v2_sites', []);
}
export async function saveSites(sites) {
  await setStorage('v2_sites', sites);
}
export async function getGlobalConfig() {
  return await getStorage('v2_global', {});
}
export async function saveGlobalConfig(config) {
  const existing = await getGlobalConfig();
  Object.assign(existing, config);
  await setStorage('v2_global', existing);
}
export async function addSite(domain) {
  const sites = await getSites();
  if (sites.some(s => s.domain === domain)) return { success: false, error: '该站点已存在' };
  sites.push({ domain, createdAt: new Date().toISOString(), heartbeats: [], sync: { masterMode: false, isMaster: true, p2p: { enabled: false, roomId: null, connected: false }, server: { enabled: false, deviceId: null, pairKey: null } } });
  await saveSites(sites);
  return { success: true };
}
export async function removeSite(domain) {
  const sites = await getSites();
  // 清理该站点的 alarm
  const site = sites.find(s => s.domain === domain);
  if (!site) return { success: false, error: '站点不存在' };
  chrome.alarms.clear('p2pSync_' + domain).catch(() => {});
  chrome.alarms.clear('serverSync_' + domain).catch(() => {});
  site.heartbeats.forEach(b => chrome.alarms.clear('heartbeat_' + b.id).catch(() => {}));
  await saveSites(sites.filter(s => s.domain !== domain));
  return { success: true };
}
export async function updateSite(domain, updates) {
  const sites = await getSites();
  const idx = sites.findIndex(s => s.domain === domain);
  if (idx === -1) return { success: false, error: '站点不存在' };
  Object.assign(sites[idx], updates);
  await saveSites(sites);
  return { success: true };
}
```

### T1-S4：修改 background.js

**文件**：`src/background.js`

**操作**（按顺序）：

1. 在文件顶部 import 后增加：

```javascript
import { runMigrations } from './core/migration.js';
```

2. 在 `onInstalled` 监听器开头增加：

```javascript
// v2.0 数据迁移
await runMigrations();
```

3. 在 `onInstalled` 末尾增加 Alarm 恢复（迁移后的站点）：

```javascript
// 恢复所有站点的 alarm（v2.0 用 v2_sites）
const v2sites = await getSites();  // 注意：此时 getSites 还不存在，需用 getStorage('v2_sites')
const allSites = await getStorage('v2_sites', []);
for (const site of allSites) {
  // 保活 alarm
  for (const beat of site.heartbeats) {
    if (beat.enabled && beat.url) {
      chrome.alarms.create('heartbeat_' + beat.id, { periodInMinutes: beat.intervalMinutes || 10 });
    }
  }
  // 同步 alarm
  if (site.sync.p2p.enabled) {
    chrome.alarms.create('p2pSync_' + site.domain, { periodInMinutes: site.sync.p2p.interval || 5 });
  }
  if (site.sync.server.enabled) {
    chrome.alarms.create('serverSync_' + site.domain, { periodInMinutes: site.sync.server.interval || 5 });
  }
}
```

4. 新增 message handler（在 switch 中添加）：

```javascript
// ---- v2.0 站点管理 ----
case 'getSites': sendResponse({ sites: await getSites() }); break;
case 'addSite': sendResponse(await addSite(request.domain)); break;
case 'removeSite': sendResponse(await removeSite(request.domain)); break;
case 'updateSite': sendResponse(await updateSite(request.domain, request.updates)); break;
case 'getGlobalConfig': sendResponse(await getGlobalConfig()); break;
case 'saveGlobalConfig': sendResponse(await saveGlobalConfig(request.config)); break;
```

### T1-V：验证步骤

| # | 方式 | 步骤 | 预期 |
|:-:|:----:|:----|:----:|
| 1 | 自动 | `bash scripts/build.sh` | 构建通过 |
| 2 | 手动 | 加载扩展 → 打开 DevTools → Application → Storage → Local | `v2_sites` 存在，包含原 `heartbeat_configs` 中的站点域名 |
| 3 | 手动 | 检查 `v2_global` | 包含 signalUrl、serverUrl、设备名称等 |
| 4 | 手动 | 检查旧键 | `heartbeat_configs`、`sync_config` 等旧键未被删除 |
| 5 | 手动 | 右键扩展 → 重载 → 再次检查 storage | `v2_schema_version = 2`，不再重复写入 `v2_sites` |
| 6 | 手动 | 控制台过滤 `SessionMaster` | 无报错 |

---

## T2 — Alarm 按站点改造（1h）

### 涉及文件

| 操作 | 文件 |
|:----:|:----:|
| 修改 | `src/background.js`（`onAlarm` 监听器 + 同步开关函数）|

### T2-S1：重构 onAlarm 监听器

**操作**：找到 `chrome.alarms.onAlarm.addListener`（当前 L1082），替换为：

```javascript
chrome.alarms.onAlarm.addListener(async (alarm) => {
  // ——— P2P 同步（按站点）———
  if (alarm.name.startsWith('p2pSync_')) {
    const domain = alarm.name.replace('p2pSync_', '');
    const sites = await getSites();
    const site = sites.find(s => s.domain === domain);
    if (!site || !site.sync.p2p.enabled) return;
    // 对 site 执行 P2P 同步（只同步该站点的域名）
    const config = await getSyncConfig();
    config.syncedDomains = [domain];
    // ... 复用现有 p2pSync 逻辑，传入 domain ...
    return;
  }

  // ——— 服务器同步（按站点）———
  if (alarm.name.startsWith('serverSync_')) {
    const domain = alarm.name.replace('serverSync_', '');
    const sites = await getSites();
    const site = sites.find(s => s.domain === domain);
    if (!site || !site.sync.server.enabled) return;
    // 对 site 执行服务器同步
    const srvConfig = await serverGetSyncConfig();
    srvConfig.syncedDomains = [domain];
    // ... 复用现有 serverPerformSync ...
    return;
  }

  // ——— 保活（不变）———
  if (alarm.name.startsWith('heartbeat_')) {
    const id = alarm.name.replace('heartbeat_', '');
    const beats = await getHeartbeats();  // v1 兼容，后期改为从 v2_sites 查
    const beat = beats.find(b => b.id === id);
    if (beat && beat.enabled) {
      const result = await performHeartbeat(beat);
      beat.lastHeartbeatTime = new Date().toISOString();
      beat.lastStatus = result.success ? 'ok' : 'fail';
      beat.lastStatusDetail = result.success ? ('HTTP ' + result.status) : result.error;
      await saveHeartbeats(beats);
    }
  }
});
```

### T2-S2：修改同步开关函数

**serverToggleSync**：`chrome.alarms.create('sessionSync', ...)` → `chrome.alarms.create('serverSync_' + domain, ...)`
**p2pToggleSync handler**：`chrome.alarms.create('p2pSyncAlarm', ...)` → `chrome.alarms.create('p2pSync_' + domain, ...)`

**具体操作**：

```javascript
// 在 serverToggleSync 中（L1049）
chrome.alarms.create('sessionSync', { periodInMinutes: intervalMinutes });
// → 改为
chrome.alarms.create('serverSync_' + domain, { periodInMinutes: intervalMinutes });

// 在 serverToggleSync 禁用时（L1054）
chrome.alarms.clear('sessionSync');
// → 改为
chrome.alarms.clear('serverSync_' + domain);

// 在 p2pToggleSync handler 中（L1437）
chrome.alarms.create('p2pSyncAlarm', { periodInMinutes: ... });
// → 改为
chrome.alarms.create('p2pSync_' + domain, { periodInMinutes: ... });

// 禁用时
chrome.alarms.clear('p2pSyncAlarm');
// → 改为
chrome.alarms.clear('p2pSync_' + domain);
```

> **注意**：`domain` 从 `config.syncedDomains[0]` 获取。在 T4（模块拆分）之前，需要将 domain 从调用方传入或从配置读取。

### T2-S3：修改 alarm 恢复逻辑

在 `onInstalled` 中：

```javascript
// 旧代码
if (config.enabled) {
  if (config.mode === 'p2p' && config.p2pRoomId) {
    chrome.alarms.create('p2pSyncAlarm', ...);
  } else if (config.mode === 'server' && config.pairKey) {
    chrome.alarms.create('sessionSync', ...);
  }
}
// 改为：已迁移到 T1-S4 中从 v2_sites 恢复
// 保留旧代码作为 fallback（未迁移回退）
```

### T2-V：验证步骤

| # | 方式 | 步骤 | 预期 |
|:-:|:----:|:----|:----:|
| 1 | 手动 | 启用服务器同步 → DevTools → Application → Alarms | `serverSync_{domain}` 存在 |
| 2 | 手动 | 启用 P2P 同步 → 检查 Alarms | `p2pSync_{domain}` 存在 |
| 3 | 手动 | 同时启用站点A+站点B | 两个 alarm 共存，域名不同 |
| 4 | 手动 | 关闭站点A同步 | 仅站点A的 alarm 消失 |
| 5 | 手动 | 保活开启 + 同步开启 | `heartbeat_hb_xxx` 和 `p2pSync_{domain}` 同时存在 |
| 6 | 自动 | `bash scripts/build.sh` | 构建通过 |

---

## T3 — P2P 连接按站点隔离（1h）

### 涉及文件

`src/background.js`

### T3-S1：重构 p2pConnections 数据结构

```javascript
// 旧：let p2pConnections = {};  // { peerId: { connection, channel, ... } }
// 新：let p2pConnections = {};  // { siteDomain: { roomId, peerId, connection, channel, ... } }
```

### T3-S2：修改 p2pCreateRoom 签名

```javascript
// 旧
async function p2pCreateRoom(deviceName, signalUrl) {
// 新
async function p2pCreateRoom(deviceName, signalUrl, siteDomain) {
  const peerId = generateP2PPeerId();
  if (!signalUrl) signalUrl = await getSignalUrl();
  try {
    const resp = await fetch(`${signalUrl}/api/signal/room`, { ... });
    const data = await resp.json();
    if (!data.roomId) throw new Error('创建配对失败');
    
    // 改为 siteDomain 索引
    p2pConnections[siteDomain] = {
      roomId: data.roomId,
      peerId,
      connection: null,
      channel: null,
      signalUrl,
      deviceName
    };
    
    currentP2PRoomId = data.roomId;     // 保留兼容
    currentP2PPeerId = peerId;
    
    await saveSyncConfig({ p2pRoomId: data.roomId, p2pConnected: false });
    startP2PPolling(signalUrl, data.roomId, peerId, siteDomain);
    return { success: true, roomId: data.roomId, peerId };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
```

### T3-S3：修改 p2pDisconnect

```javascript
// 旧
async function p2pDisconnect() {
// 新：siteDomain 可选，不传则全部断开
async function p2pDisconnect(siteDomain) {
  stopP2PPolling();
  const signalUrl = await getSignalUrl();
  
  if (siteDomain) {
    const conn = p2pConnections[siteDomain];
    if (conn && currentP2PRoomId && currentP2PPeerId) {
      try {
        await fetch(`${signalUrl}/api/signal/room?room=${conn.roomId}&peer=${conn.peerId}`, { method: 'DELETE' });
      } catch (e) {}
      deleteP2PConnection(conn.peerId);
      delete p2pConnections[siteDomain];
    }
  } else {
    // 断开全部
    if (currentP2PRoomId && currentP2PPeerId) {
      try {
        await fetch(`${signalUrl}/api/signal/room?room=${currentP2PRoomId}&peer=${currentP2PPeerId}`, { method: 'DELETE' });
      } catch (e) {}
    }
    for (const pid of Object.keys(p2pConnections)) deleteP2PConnection(p2pConnections[pid].peerId);
    p2pConnections = {};
  }
  
  currentP2PRoomId = '';
  currentP2PPeerId = '';
  await saveSyncConfig({ p2pConnected: false, p2pConnectedAt: null, p2pConnectedPeerName: '' });
  notifyUser('SessionMaster', siteDomain ? 'P2P 已断开: ' + siteDomain : 'P2P 全部连接已断开');
}
```

### T3-S4：修改 popup.js 中发送的 siteDomain

找到 `btnP2PCreate` 和 `btnP2PDoJoin` 的 click handler，在 `sendMessage` 参数中增加 `siteDomain: activeSite`：

```javascript
// btnP2PCreate handler
const result = await chrome.runtime.sendMessage({
  action: 'p2pCreateRoom',
  deviceName,
  signalUrl,
  siteDomain: activeSite  // 新增
});

// btnP2PDisconnect handler
await chrome.runtime.sendMessage({
  action: 'p2pDisconnect',
  siteDomain: activeSite  // 新增
});
```

### T3 验收

执行：P2P-1 ~ P2P-7

---

## T4 — 模块拆分准备（0.5h）

### 涉及文件

| 操作 | 文件 |
|:----:|:----:|
| 创建 | `src/core/` 全部 7 个模块文件骨架 |
| 复制 | 从 `background.js` 复制函数到对应模块 |

### T4-S1：按模块分配函数

| 模块文件 | 从 background.js 复制的函数 |
|:---------|:---------------------------|
| `core/cookies.js` | `getCookies`、`exportCookies`、`importCookies`、`clearCookies`、`importCookiesSmart`、`exportCookiesSmart`、`importCookiesUnconditional`、`getCookieMeta`、`saveCookieMeta`、`cookieApiUrl` |
| `core/heartbeat.js` | `getHeartbeats`、`saveHeartbeats`、`addHeartbeat`、`removeHeartbeat`、`toggleHeartbeat`、`performHeartbeat`、`pauseAllHeartbeats` |
| `core/sync-p2p.js` | `generateP2PPeerId`、`p2pCreateRoom`、`p2pJoinRoom`、`initiateP2PConnection`、`handleSignalMessage`、`sendSignal`、`startP2PPolling`、`stopP2PPolling`、`deleteP2PConnection`、`p2pDisconnect`、`p2pSync`、`handleP2PMessage` |
| `core/sync-server.js` | `serverGetSyncConfig`、`serverSaveSyncConfig`、`serverRegisterDevice`、`serverPerformSync`、`serverToggleSync` |
| `core/blocker.js` | `getUserBlockingRules`、`addUserBlockingRule`、`removeUserBlockingRule`、`updateDynamicRules`、`getRulesDB`、`saveRulesDB`、`matchSitesByDomain`、`getRecommendedRules`、`updateRulesDBFromServer`、`exportRulesDB`、`importRulesDB`、`getBlockerConfig`、`saveBlockerConfig`、`isBlockingEnabledForDomain`、`getEffectiveKeywords` |
| `core/sites.js` | 已包含（T1 已创建）|
| `core/messaging.js` | —（P2 实现）|

### T4-S2：background.js 导入模块

```javascript
// background.js 顶部
import './core/cookies.js';
import './core/heartbeat.js';
import './core/sync-p2p.js';
import './core/sync-server.js';
import './core/blocker.js';
import './core/sites.js';
```

> **说明**：ES Module 的 import 会执行被导入文件的所有顶层代码。需要将每个模块文件的函数定义 `export` 导出，并且每个模块在文件末尾自动注册其对 `globalThis` 的引用，或者通过直接引入的方式——最简单方案是暂时保留 background.js 中的函数，通过 import 确保模块文件被解析。

**简化方案**：T4 阶段只创建文件骨架和注释，不实际移动代码。真正的代码迁移在 P2 的消息路由注册表阶段完成。T4 的目标是验证构建系统支持 `src/core/` 目录。

### T4 验收

`bash scripts/build.sh` 通过

---

### 🏁 里程碑 M-P0：基础设施完成

**触发条件**：T1 ~ T4 全部验证通过

**交付物清单**：

| # | 交付物 | 说明 | 验收方式 |
|:-:|:-------|:----|:--------|
| M0-1 | `src/core/migration.js` | 链式迁移框架（`schema_version` + `runMigrations`）| T1-V 步骤 1~6 |
| M0-2 | `src/core/sites.js` | 站点 CRUD + 全局设置 handler | 通过 popup 发消息测试 getSites/addSite |
| M0-3 | `src/core/` 目录 7 模块骨架 | 所有模块文件存在且可 import | 构建通过 |
| M0-4 | `v2_sites` + `v2_global` 存储数据 | 从 v1.x 迁移完成 | 旧键保留，新键正确 |
| M0-5 | Alarm 按站点隔离 | alarm 名称含域名后缀 | T2-V 步骤 1~6 |
| M0-6 | P2P 连接按站点隔离 | `p2pConnections` 键为 siteDomain | T3 步骤 |

**回滚条件**：M0-4 迁移失败 → 删除 `v2_sites`/`v2_global`，保留旧键，扩展回退 v1.x 行为。

**签字确认**：□ 功能测试通过 □ 数据迁移正确 □ 可进入 P1

---

# P1：UI 重构（4.5h）

---

## T5 — 站点选择器组件（1h）

### 涉及文件

| 操作 | 文件 |
|:----:|:----:|
| 修改 | `src/popup/popup.html`（添加站点选择器 DOM）|
| 新建 | `src/popup/site-selector.js`（独立渲染函数）|
| 修改 | `src/popup/popup.js`（导入 + 初始化）|

### T5-S1：popup.html 添加站点选择器 DOM

在 `<div class="header">` 之后、Tab 切换之前插入：

```html
<div class="site-selector-bar" style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:#f8f9fa;border-bottom:1px solid #e0e0e0">
  <label style="font-size:12px;color:#555;white-space:nowrap">📍 当前站点</label>
  <select id="siteSelector" class="site-dropdown" style="flex:1;padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:13px">
    <option value="">— 请选择站点 —</option>
  </select>
  <button id="btnAddSite" class="btn-small" title="添加新站点" style="padding:4px 8px">➕</button>
</div>
```

添加 CSS（`popup.css`）：

```css
.site-dropdown { ... }
```

### T5-S2：实现 site-selector.js

```javascript
// src/popup/site-selector.js
let activeSite = null;
let siteList = [];

export async function loadSites() {
  const result = await chrome.runtime.sendMessage({ action: 'getSites' });
  siteList = result.sites || [];
  return siteList;
}

export function renderSiteSelector(sites, onSwitch) {
  const sel = document.getElementById('siteSelector');
  if (!sel) return;
  sel.innerHTML = sites.map(s => 
    `<option value="${s.domain}" ${s.domain === activeSite ? 'selected' : ''}>${s.domain}</option>`
  ).join('') + '<option value="__add__">+ 添加新站点</option>';
  
  sel.onchange = async (e) => {
    if (e.target.value === '__add__') {
      // 弹出添加新站点对话框
      const domain = prompt('请输入站点域名：');
      if (domain && domain.trim()) {
        const result = await chrome.runtime.sendMessage({ action: 'addSite', domain: domain.trim() });
        if (result.success) {
          activeSite = domain.trim();
          onSwitch(activeSite);
        } else {
          showToast('⚠️ ' + result.error);
        }
      }
      loadSites().then(sites => renderSiteSelector(sites, onSwitch));
    } else {
      activeSite = e.target.value;
      onSwitch(activeSite);
    }
  };
}

export function getActiveSite() { return activeSite; }
export function setActiveSite(domain) { activeSite = domain; }
```

### T5-S3：popup.js 入口集成

在 popup 初始化函数中：

```javascript
import { loadSites, renderSiteSelector, getActiveSite, setActiveSite } from './site-selector.js';

async function initPopup() {
  const sites = await loadSites();
  renderSiteSelector(sites, (domain) => {
    // 站点切换回调：重新渲染所有 Tab 内容
    loadSessionTab(domain);
    loadSyncTab(domain);
    loadGlobalTab();
  });
  
  // 如果当前页面 URL 的域名不在站点列表中，自动提示添加
  if (currentDomain && !sites.some(s => s.domain === currentDomain)) {
    // 触发 "添加当前站点" 的推荐
    showAddSiteSuggestion(currentDomain);
  }
}
```

### T5 验收

SEL-1 ~ SEL-6

---

## T6 — 三 Tab 内容重构（1.5h）

### 涉及文件

| 操作 | 文件 |
|:----:|:----:|
| 修改 | `src/popup/popup.html`（三 Tab 内容区重写）|
| 新建 | `src/popup/session-tab.js`（会话管理 Tab）|
| 新建 | `src/popup/sync-tab.js`（同步管理 Tab）|
| 新建 | `src/popup/global-tab.js`（全局设置 Tab）|

### T6-S1：HTML 结构

```html
<div class="tabs">
  <button class="tab-btn active" data-tab="session">🌐 会话管理</button>
  <button class="tab-btn" data-tab="sync">🔄 同步管理</button>
  <button class="tab-btn" data-tab="global">⚙️ 全局设置</button>
</div>

<div id="tab-session" class="tab-content active">
  <!-- Cookie（含保活） -->
  <div class="section">
    <div class="section-title"><span>🍪 Cookie（含保活）</span></div>
    <!-- 导出/导入/清除：复制自 v1.x 的 session Tab -->
    <!-- 保活：复制自 v1.x 的保活区域，视觉上缩进从属于 Cookie -->
  </div>
  <!-- 拦截 -->
  <div class="section">
    <div class="section-title"><span>🛡️ 拦截</span></div>
    <!-- 来自 v1.x 的 blocker Tab -->
  </div>
</div>

<div id="tab-sync" class="tab-content">
  <!-- 主从设备模式 -->
  <div class="section">
    <div class="section-title"><span>📡 主从设备模式</span></div>
    <!-- 开关 + 身份切换：来自 v1.x 的 sync Tab -->
  </div>
  <!-- 传输方式（radio） -->
  <div class="section">
    <div class="section-title"><span>🔗 P2P 直连</span></div>
    <!-- 来自 v1.x 的 P2P 配置 -->
  </div>
  <div class="section">
    <div class="section-title"><span>☁️ 服务器模式</span></div>
    <!-- 来自 v1.x 的服务器配置 -->
  </div>
  <!-- 同步记录 + 网络地址 -->
</div>

<div id="tab-global" class="tab-content">
  <!-- 信令地址 / 服务器地址 / 设备名称 / 同步间隔 -->
  <!-- 设备身份 -->
  <!-- 使用说明 + 导出日志 -->
</div>
```

### T6-S2：Tab 切换 JS

Tab 按钮已有事件绑定（`querySelectorAll('.tab-btn')`），切换时调用 Tab 渲染函数：

```javascript
// 切换站点时
function onSiteSwitch(domain) {
  renderSessionTab(domain);
  renderSyncTab(domain);
}
// renderGlobalTab() 不依赖站点
```

### T6 验收

SES-1 ~ SES-15, SYN-1 ~ SYN-18, GLB-1 ~ GLB-10

---

## T7 — 锁定规则适配（0.5h）

### 涉及文件

`src/popup/popup.js`（`setDomainDependentState`）

### T7-S1：重写锁定函数

```javascript
function setDomainDependentState(hasDomain, tabInfo) {
  var isBlank = isBlankTab(tabInfo);
  var hasSites = (window.siteList && window.siteList.length > 0);
  
  // 第三层（站点操作）：必须同时有 activeSite + 有当前域名
  var cookieLocked = !hasDomain || !getActiveSite();
  
  // - Cookie 操作（导出/导入/清除）
  // - 保活（输入框/添加/填入URL）
  // - 获取当前站点 Cookie 列表
  // - 填入当前域名按钮
  // 以上仅在 cookieLocked = false 时解锁
  
  // 第一层 + 第二层（全局 + 同步连接）：只要有站点就解锁
  var syncLocked = !hasSites;
  
  // 同步相关操作在 syncLocked = false 时解锁
  
  // 全局设置：永远解锁
}
```

### T7-V：验证步骤

| # | 方式 | 步骤 | 预期 |
|:-:|:----:|:----|:----:|
| 1 | 手动 | 打开空白页 → 打开扩展 | 会话管理 Tab 全部锁定，全局设置 Tab 可用 |
| 2 | 手动 | 在空白页添加一个站点 → 切回扩展 | 该站点出现在下拉列表，同步管理 Tab 解锁 |
| 3 | 手动 | 打开已有站点正常页面 | 全部解锁 |
| 4 | 自动 | `bash scripts/build.sh` | 构建通过 |

### 🏁 里程碑 M-P1：UI 重构完成

**触发条件**：T5 ~ T7 全部验证通过

**交付物清单**：

| # | 交付物 | 说明 | 验收方式 |
|:-:|:-------|:----|:--------|
| M1-1 | 站点选择器 | 下拉切换、添加/删除站点、跨 Tab 共享 | SEL-1 ~ SEL-6 |
| M1-2 | 三 Tab 界面 | 会话管理(Cookie+拦截) / 同步管理(主从→P2P/服务器) / 全局设置 | SES/SYN/GLB 测试组 |
| M1-3 | 锁定规则 | 三态判定（无站点/有站点/正常页）| LCK-1 ~ LCK-8 |
| M1-4 | `src/popup/site-selector.js` + 各 Tab 组件文件 | 模块化 UI 文件 | 文件存在，import 正确 |

**签字确认**：□ UI 布局正确 □ 锁定规则完整 □ 可进入 P2

---

# P2：架构优化（2h，建议做）

---

## T8 — 消息路由注册表（1h）

### 涉及文件

| 操作 | 文件 |
|:----:|:----:|
| 新建 | `src/core/messaging.js` |
| 修改 | 各 `core/*.js` 模块（末尾注册 handler）|
| 修改 | `src/background.js`（移除 switch，调用 `initMessaging`）|

### T8-S1：实现 messaging.js

```javascript
// src/core/messaging.js
const handlers = {};

export function registerHandler(action, handler) {
  handlers[action] = handler;
}

export function initMessaging() {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
      const handler = handlers[request.action];
      if (!handler) {
        sendResponse({ error: '未知操作: ' + request.action });
        return;
      }
      try {
        const result = await handler(request, sender);
        sendResponse(result);
      } catch (e) {
        console.error('[SessionMaster] handler error:', request.action, e);
        sendResponse({ error: e.message });
      }
    })();
    return true;
  });
}
```

### T8-S2：逐个模块注册 handler

**示例 - cookies.js 末尾**：

```javascript
import { registerHandler } from './messaging.js';

registerHandler('getCookies', async (req) => await exportCookies(req.domain));
registerHandler('exportCookies', async (req) => await exportCookies(req.domain));
registerHandler('importCookies', async (req) => await importCookiesUnconditional(req.data));
registerHandler('importWithCookieClear', async (req) => await importWithCookieClear(req.domain, req.data));
registerHandler('clearCookies', async (req) => await clearCookies(req.domain));
```

**background.js 入口**：

```javascript
import { initMessaging } from './core/messaging.js';
import './core/cookies.js';   // 自注册 handler
import './core/heartbeat.js';
import './core/sync-p2p.js';
import './core/sync-server.js';
import './core/blocker.js';
import './core/sites.js';

// 启动消息路由
initMessaging();
// 删除旧的 switch 语句块
```

### T8 验收

所有 message handler 行为与修改前一致

---

## T9 — UI 渲染函数化（1h）

### 涉及文件

| 操作 | 文件 |
|:----:|:----:|
| 新建 | `src/popup/session-tab.js` |
| 新建 | `src/popup/sync-tab.js` |
| 新建 | `src/popup/global-tab.js` |

每个文件导出渲染函数，不再直接操作 `document.getElementById`，而是接受 `container` 参数：

```javascript
// session-tab.js
export function renderSessionTab(container, site) { 
  container.innerHTML = `...`;
  // 事件绑定
  container.querySelector('#btnExport').onclick = ...;
}
```

### T9-V：验证步骤

| # | 方式 | 步骤 | 预期 |
|:-:|:----:|:----|:----:|
| 1 | 自动 | 检查 `registerHandler` 是否覆盖所有 v1.x action | 新旧行为一致 |
| 2 | 自动 | 检查渲染函数可独立调用 | 无运行时错误 |

### 🏁 里程碑 M-P2：架构优化完成（可选）

**触发条件**：T8 ~ T9 验证通过（如跳过此阶段，M-P2 标记为「延后至 v2.1」）

**交付物清单**：

| # | 交付物 | 说明 |
|:-:|:-------|:----|
| M2-1 | `src/core/messaging.js` | 消息路由注册表，替代 50+ case switch |
| M2-2 | 各模块 handler 注册 | 每个 `core/*.js` 末尾自注册 handler |
| M2-3 | 渲染函数组件 | `renderSiteSelector()`、`renderHeartbeatList()` 等独立函数 |

**签字确认**：□ 行为一致 □ 可进入 P3

---

# P3：收尾（2.5h）

---

## T10 — 文档更新（1h）

| 文件 | 操作 |
|:----|:-----|
| `src/help/help.html` | 章节结构按新架构重组 |
| `src/help/help.js` | 更新锚点引用 |
| `README.md` | 版本号 v2.0.0 + 架构图 + 功能表 |
| Skill 文档 | 项目结构更新 + 锁定规则章节 |

验收：HLP-1~10, RDM-1~6, SKL-1~4

## T11 — 9 项自检（0.5h）

1. `node --check src/core/*.js src/popup/*.js`
2. CSS 花括号平衡
3. HTML `<div>` 标签平衡
4. manifest 权限 + 引用文件
5. 版本号 6 处一致
6. `getCookies` 域解析 9 用例
7. CHANGELOG.md + changelog.json 同步
8. 选择器一致性
9. 元素类型一致性

## T12 — 构建 + 测试（0.5h）

- `bash scripts/build.sh`
- 加载到浏览器
- 执行 test-plan.md 全部用例

## T13 — 版本号 + 发布（0.5h）

**变更**：

| 文件 | 当前值 | 改为 |
|:----|:------:|:----:|
| `VERSION` | 1.5.14 | **2.0.0** |
| `src/manifest.json` | "1.5.14" | **"2.0.0"** |
| `src/config.js` | '1.5.14' | **'2.0.0'** |
| `src/popup/popup.html` | v1.5.14 | **v2.0.0** |
| `src/help/help.html` hero | v1.5.14 | **v2.0.0** |
| `src/help/help.html` footer | v1.5.14 | **v2.0.0** |
| `CHANGELOG.md` | — | 追加 v2.0.0 条目 |
| `src/changelog.json` | — | 追加 v2.0.0 条目 |

**发布流程**：
```bash
git add -A && git commit -m "v2.0.0: 站点中心架构重构"
git tag -a v2.0.0 -m "v2.0.0"
git push origin master --tags
# 创建 GitHub Release → 上传 zip → 标记 Latest
```

### T13-V：验证步骤

| # | 方式 | 步骤 | 预期 |
|:-:|:----:|:----|:----:|
| 1 | 自动 | `bash scripts/build.sh` | 版本一致性检查通过，输出 `session-master-v2.0.0.zip` |
| 2 | 手动 | 加载 zip 到浏览器 | 弹出头部显示 v2.0.0 |
| 3 | 手动 | 检查帮助页 | hero + footer 显示 v2.0.0 |
| 4 | 手动 | 检查 GitHub Release | v2.0.0 存在且为 Latest |
| 5 | 手动 | 下载 Release 附件 | zip 文件名 = `session-master-v2.0.0.zip` |

### 🏁 里程碑 M-P3：v2.0.0 发布

**触发条件**：T10 ~ T13 全部验证通过

**最终交付物清单**：

| # | 交付物 | 说明 |
|:-:|:-------|:------|
| M3-1 | **v2.0.0 Release** | GitHub Release + zip 附件 + Latest 标记 |
| M3-2 | **站点中心架构** | 三 Tab（会话/同步/全局）+ 站点选择器 |
| M3-3 | **链式迁移框架** | `schema_version` + `runMigrations()`，v3.0 可直接用 |
| M3-4 | **Alarm/P2P 按站点隔离** | alarm 名称含域名，P2P 连接按站点索引 |
| M3-5 | **帮助文档同步** | help.html + README 按新架构重组 |
| M3-6 | **v1.x 数据迁移** | 旧键保留，新键 `v2_sites` + `v2_global` 正确 |
| M3-7 | **模块化代码** | `src/core/` 7 模块 + `src/popup/` Tab 组件 |
| M3-8 | **回滚方案** | 旧键保留，删除 `v2_` 键即可降级 |

**最终签字确认**：

□ P0 基础设施完成且可回滚
□ P1 UI 重构完成，站点选择器+三 Tab 正常工作
□ P2 架构优化 □ 已完成 □ 延后至 v2.1
□ P3 发布完成，v2.0.0 可下载
□ 项目文档全部同步至 GitHub

---

# 附录：逐行变更清单

| 任务 | 文件 | 操作 | 估算 |
|:----:|:----|:----|:----:|
| T1 | `src/core/migration.js` | 新建 80 行 | 20min |
| T1 | `src/core/sites.js` | 新建 60 行 | 15min |
| T1 | `src/background.js` | 改 +8 行（import + onInstalled） | 10min |
| T1 | `src/background.js` | 改 +12 行（5 个 handler case） | 15min |
| T2 | `src/background.js` | 改 onAlarm 监听器 | 30min |
| T2 | `src/background.js` | 改 4 处 alarm.create/clear 名称 | 10min |
| T2 | `src/background.js` | 改 onInstalled 恢复逻辑 | 20min |
| T3 | `src/background.js` | 改 p2pConnections 结构 | 15min |
| T3 | `src/background.js` | 改 p2pCreateRoom 签名 | 15min |
| T3 | `src/background.js` | 改 p2pDisconnect | 15min |
| T3 | `src/popup/popup.js` | 改 2-3 处发送 siteDomain | 15min |
| T4 | `src/core/` | 创建 7 个模块文件骨架 | 30min |
| T5 | `src/popup/popup.html` | 新增站点选择器 DOM | 15min |
| T5 | `src/popup/site-selector.js` | 新建 60 行 | 30min |
| T5 | `src/popup/popup.js` | 改入口集成 | 15min |
| T6 | `src/popup/popup.html` | 三 Tab 内容重写 | 45min |
| T6 | `src/popup/session-tab.js` | 新建 | 30min |
| T6 | `src/popup/sync-tab.js` | 新建 | 30min |
| T6 | `src/popup/global-tab.js` | 新建 | 15min |
| T7 | `src/popup/popup.js` | 改锁定规则 | 30min |
| T8 | `src/core/messaging.js` | 新建 40 行 | 30min |
| T8 | 各 core/*.js | 改末尾注册 handler | 30min |
| T9 | `src/popup/*-tab.js` | 改渲染函数化 | 1h |
| T10 | `src/help/help.html` | 章结构重写 | 45min |
| T11 | — | 9 项自检 | 30min |
| T12 | — | 构建 + 测试 | 30min |
| T13 | 6 处版本号 | 改 | 15min |
