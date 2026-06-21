# SessionMaster v2.0 — 可行性分析报告

> **版本**：v2.0-draft
> **评估基准**：`docs/v2.0/PRD.md`
> **评估日期**：2026-06-21
> **关联文档**：[`agent-roles.md`](agent-roles.md) · [`agent-document-matrix.md`](agent-document-matrix.md) · [`development-plan.md`](development-plan.md) · [`test-plan.md`](test-plan.md) · [`methodology.md`](methodology.md) · [`maintainability-analysis.md`](maintainability-analysis.md)
> **状态**：有条件通过（2 项设计调整）

---

## 1. 评估方法

逐项对照 PRD 中的架构变更点，按以下维度分析：

| 维度 | 说明 |
|------|------|
| 🟢 可行 | 现有代码架构支持，只需增量修改 |
| 🟡 需调整 | 现有架构需小幅改造，有明确方案 |
| 🔴 阻塞 | 现有架构不支持，需重大设计变更 |

---

## 2. 逐项分析

### 2.1 🟢 数据迁移（migrateV1toV2）

**现状**：所有 v1.x 数据以 `chrome.storage.local` 键值对存储。

**分析路径**：

```javascript
// v1.x 存储键
heartbeat_configs  →  [{ id, url, domain, intervalMinutes, enabled, ... }]
sync_config        →  { signalUrl, p2pDeviceName, p2pRoomId, enabled, mode, syncedDomains, ... }
server_sync_config →  { serverUrl, deviceName, pairKey, enabled, deviceId, syncedDomains, ... }
device_identity    →  { id, createdAt }
blocker_config     →  { masterEnabled, siteEnabled, keywordOverrides }
sync_cookie_meta   →  { "domain:name": { lastValue, origin, exportTime } }
```

**迁移逻辑验证**：

```
读取 v1 键 → 按 domain 归并为 sites[] → 写入 v2_sites + v2_global → 保留旧键
```

| 步骤 | 可行性 | 说明 |
|:----:|:------:|------|
| 读取旧键 | 🟢 | `chrome.storage.local.get()`，已有 `getStorage()` 工具函数 |
| 提取域名 | 🟢 | 从 `heartbeat_configs[].domain` + `syncedDomains[]` 提取 |
| 归并站点 | 🟢 | 用 Set 去重，JavaScript 数组操作 |
| 保活归属 | 🟢 | 按 `beat.domain === site.domain` 过滤 |
| 同步配置 | 🟢 | P2P 和服务器配置按 `syncedDomains[0]` 归属到站点 |
| 写入新键 | 🟢 | `chrome.storage.local.set()`，sites 数组大小可控 |
| 保留旧键 | 🟢 | 不调用 `remove()`，写新键即可 |
| 防重复 | 🟢 | 写入 `v2_migrated: true` 标记 |

**结论**：🟢 **可行**，纯存储操作，无网络/异步依赖，无竞态条件。

---

### 2.2 🔴 Alarm 名称需改为按站点（设计调整 1）

**现状**：

| Alarm 名称 | 用途 | 问题 |
|:----------:|:----:|:----:|
| `sessionSync` | 服务器模式自动同步 | 单 alarm 无法支持多站点独立同步 |
| `p2pSyncAlarm` | P2P 自动同步 | 同上 |
| `heartbeat_{id}` | 保活心跳 | ✅ 已经按 ID 独立，但需映射到站点 |

**v2.0 需求**：每个站点可独立启用/禁用同步，各自有独立的 alarm。

**分析**：

```
当前：
  sessionSync  → 全局唯一，每 N 分钟触发一次
  p2pSyncAlarm → 全局唯一，每 N 分钟触发一次

v2.0 需要：
  sessionSync_oa.company.com    → 每 5 分钟
  sessionSync_music.163.com     → 每 10 分钟（间隔可不同）
  p2pSync_oa.company.com        → 每 5 分钟
  serverSync_oa.company.com     → 每 5 分钟
```

**影响范围**：

| 位置 | 当前代码 | v2.0 需要的变更 |
|------|---------|----------------|
| L1068 `alarms.create('sessionSync', ...)` | 硬编码 alarm 名 | 改为 `'serverSync_' + domain` |
| L1073 `alarms.clear('sessionSync')` | 硬编码 | 改为 `'serverSync_' + domain` |
| L1082-1098 `onAlarm` listener | switch on alarm.name | 改为解析 domain 后按站点执行 |
| L1457 `alarms.create('p2pSyncAlarm', ...)` | 硬编码 | 改为 `'p2pSync_' + domain` |

**解决方案**：

```javascript
// alarm 命名约定
const ALARM_PREFIX = { P2P: 'p2pSync_', SERVER: 'serverSync_' };

// 创建时
chrome.alarms.create(ALARM_PREFIX.P2P + domain, { periodInMinutes });

// 监听时
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith(ALARM_PREFIX.P2P)) {
    const domain = alarm.name.replace(ALARM_PREFIX.P2P, '');
    await performP2PSync(domain);
  } else if (alarm.name.startsWith(ALARM_PREFIX.SERVER)) {
    const domain = alarm.name.replace(ALARM_PREFIX.SERVER, '');
    await performServerSync(domain);
  } else if (alarm.name.startsWith('heartbeat_')) {
    // 保活逻辑不变：按 ID 查找，域名通过 beat.domain 获取
    const id = alarm.name.replace('heartbeat_', '');
    // 从 v2_sites 查找该保活
  }
});
```

**风险等级**：🟡 中 — 代码量不大但影响 alarm 整个模块。

**结论**：🔴 **需要调整 PRD**，补充 alarm 按站点隔离的设计。

---

### 2.3 🔴 P2P 连接需改为按站点隔离（设计调整 2）

**现状**：

```javascript
let p2pConnections = {};  // { peerId: { connection, channel, ... } }
let currentP2PRoomId = '';
let currentP2PPeerId = '';
```

P2P 连接是**全局单例**——一次只能连接一个配对，一个房间，一个对端。

**v2.0 需求**：每个站点可以独立建立 P2P 连接（站点A连 P2P 主设备、站点B连服务器）。

**分析**：

```
当前结构：                v2.0 需要：
p2pConnections = {       p2pConnections = {
  "peer_xxx": {...}         "oa.company.com": {
}                             roomId: "...",
                              peerId: "...",
                              connection: {...},
                              connected: true
                            },
                            "music.163.com": {
                              roomId: "...",
                              peerId: "...",
                              connection: {...},
                              connected: true
                            }
                         }
```

**影响范围**：

| 函数 | 当前签名 | v2.0 需要的签名 |
|------|---------|----------------|
| `p2pCreateRoom` | `(deviceName, signalUrl)` | `(deviceName, signalUrl, siteDomain)` |
| `p2pJoinRoom` | `(roomId, deviceName, signalUrl)` | `(roomId, deviceName, signalUrl, siteDomain)` |
| `p2pDisconnect` | `()` | `(siteDomain?)` (不传则断开全部) |
| `p2pSync` | `(targetPeer)` | `(targetPeer, siteDomain?)` |
| `initiateP2PConnection` | `(signalUrl, roomId, fromPeer, toPeer, deviceName)` | `(signalUrl, roomId, fromPeer, toPeer, deviceName, siteDomain)` |

**解决方案**：

```javascript
// 新结构：按站点索引
let p2pConnections = {};  // { siteDomain: { roomId, peerId, connection, channel, ... } }

async function p2pCreateRoom(deviceName, signalUrl, siteDomain) {
  const peerId = generateP2PPeerId();
  // ... fetch ...
  p2pConnections[siteDomain] = { roomId: data.roomId, peerId, connection: null, channel: null };
  // ... 后续信令轮询和 WebRTC 使用 p2pConnections[siteDomain]
}
```

**风险等级**：🟡 中 — P2P 引擎内部逻辑不变，仅外层 index 从 peerId 改为 siteDomain。

**结论**：🔴 **需要调整 PRD**，补充 P2P 连接按站点隔离的设计。

---

### 2.4 🟢 站点选择器 UI

**技术路径**：
- HTML `<select>` 或自定义下拉组件
- 全局变量 `activeSite` 跨 Tab 共享
- `addSite`/`removeSite` 通过 message 写入存储

**风险**：无，纯 UI 组件。

**结论**：🟢 **可行**。

---

### 2.5 🟢 三 Tab 重排

**变更内容**：
- 保留 `#tab-session`，内容扩充（加入拦截模块）
- 保留 `#tab-sync`，内容重组（主从+P2P/服务器 radio+按站点）
- 新建 `#tab-global`
- 移除 `#tab-blocker`（合并入 `#tab-session`）

**分析**：

```html
<!-- 当前 -->
<div id="tab-session"> ... </div>
<div id="tab-sync"> ... </div>
<div id="tab-blocker"> ... </div>

<!-- v2.0 -->
<div id="tab-session"> ... Cookie+保活+拦截 ... </div>
<div id="tab-sync"> ... 主从+P2P/服务器(按站点) ... </div>
<div id="tab-global"> ... 信令地址/设备名称/设备身份 ... </div>
```

所有功能逻辑（`exportCookies`、`addHeartbeat`、`saveBlockerConfig` 等）不变，只是 UI 重新排列。

**风险**：
- HTML div 嵌套错误风险：中等。需自检第 3 项（标签平衡）确保。
- 事件绑定遗漏风险：低。JS 通过 `getElementById` 绑定，与 HTML 对齐即可。

**结论**：🟢 **可行**。

---

### 2.6 🟡 锁定规则

**现状**：
```javascript
var locked = !hasDomain;
// 然后锁定 lockedEls 和 inputIds
```

**v2.0 需求**：
```javascript
if (!hasSites && isBlank) {
    // 会话管理锁定、同步管理锁定、全局设置解锁
} else if (hasSites && isBlank) {
    // 可切换站点、查看/编辑已有配置、不可导出 Cookie
} else {
    // 全部解锁
}
```

**分析**：纯 JS 逻辑，无外部依赖。`hasSites` 从 `v2_sites` 数组长度判定。

**结论**：🟢 **可行**。

---

### 2.7 🟢 帮助文档 + README + Skill 更新

纯 Markdown/HTML 文档变更，无技术风险。

**结论**：🟢 **可行**。

---

### 2.8 🟡 存储量评估

**v2_sites 存储大小估算**：

```
每个站点 ≈ 200-500 字节
  保活记录 × N（通常 1-3 条，每条 ≈ 150 字节）
  同步配置 ≈ 200 字节

10 个站点 ≈ 3-5 KB
50 个站点 ≈ 15-25 KB
```

`chrome.storage.local` 默认 ≈ 5MB（`unlimitedStorage` 权限下无限制）。所以**完全没有存储压力**。

**结论**：🟢 **可行**。

---

## 3. 设计调整汇总

### 3.1 调整 1：Alarm 名称改为按站点

**PRD 需更新**：
- 数据模型章节：`sites[].sync` 需要增加 alarm 状态字段
- alarm 命名约定需文档化

**影响文件**：
- `docs/v2.0/PRD.md` — 数据模型 + alarm 章节
- `docs/v2.0/test-plan.md` — 新增 TC-ALM 测试块
- `docs/v2.0/development-plan.md` — T1 增加 alarm 改造工时

### 3.2 调整 2：P2P 连接改为按站点隔离

**PRD 需更新**：
- P2P 连接存储结构从 `{ peerId: {} }` 改为 `{ siteDomain: {} }`
- `p2pCreateRoom`/`p2pJoinRoom`/`p2pDisconnect` 增加 `siteDomain` 参数

**影响文件**：
- `docs/v2.0/PRD.md` — P2P 引擎章节
- `docs/v2.0/test-plan.md` — 新增 TC-P2P-SITE 测试块
- `docs/v2.0/development-plan.md` — T1 增加 P2P 改造工时

---

## 4. 最终结论

| 分类 | 数量 | 状态 |
|:----:|:----:|:----:|
| 🟢 可行 | 6/8 | 数据迁移、站点选择器、Tab重排、锁定规则、文档更新、存储量 |
| 🟡 需小幅调整 | 1/8 | 存储键命名 |
| 🔴 需设计调整 | 2/8 | Alarm 命名、P2P 连接隔离 |
| **总体** | **8/8** | **✅ 有条件通过** |

**2 项设计调整已明确方案**，接下来更新 PRD、测试文档、开发计划。
