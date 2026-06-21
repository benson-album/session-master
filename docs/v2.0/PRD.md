# SessionMaster v2.0 — 架构重构 PRD

> **版本**：v2.0-rc1
> **作者**：产品
> **状态**：需求确认中
> **发布日期**：待定（继承 v1.5.14）

---

## 目录

1. [产品概述](#1-产品概述)
2. [问题陈述](#2-问题陈述)
3. [三层架构模型](#3-三层架构模型)
4. [功能需求详述](#4-功能需求详述)
5. [锁定规则详细定义](#5-锁定规则详细定义)
6. [可行性分析](#6-可行性分析)
7. [边界条件与异常处理](#7-边界条件与异常处理)
8. [UI 与交互规范](#8-ui-与交互规范)
9. [数据存储模型](#9-数据存储模型)
10. [迁移路径与兼容性](#10-迁移路径与兼容性)
11. [非功能性需求](#11-非功能性需求)
12. [附录：元素锁定矩阵全表](#12-附录元素锁定矩阵全表)

---

## 1. 产品概述

### 1.1 产品定位

SessionMaster（会话大师）是一款突破网站单设备登录限制的浏览器扩展，支持跨浏览器 Cookie 同步（P2P/服务器模式）+ 踢人拦截 + 会话保活。

### 1.2 v2.0 目标

在**不改变任何功能逻辑**的前提下，重新定义 UI 锁定规则，建立清晰的三层数据抽象模型，提升空白页下的用户体验。

### 1.3 范围

| 包含 | 不包含 |
|------|--------|
| ✅ 锁定规则重新分层 | ❌ 新增同步功能（如 WebSocket） |
| ✅ 空白页用户体验优化 | ❌ UI 布局重组（如 Tab 顺序调整） |
| ✅ 少数元素补全验证 | ❌ 后台数据模型重构 |
| ✅ 存储键分层梳理 | ❌ 服务器端变更 |

---

## 2. 问题陈述

### 2.1 当前锁定规则

v1.x 的 `setDomainDependentState()` 混用两级判定：

```
isBlank → 全锁（不管功能是否依赖域名）
有域名 → 全解锁
```

**问题**：第一层（全局配置）和第二层（同步连接）的功能并不依赖当前页面的域名，强行锁定导致：

- 用户不能在空白页输入服务器地址
- 用户不能在空白页输入设备名称
- 用户不能在空白页生成配对码
- 用户不能在空白页创建/加入 P2P 配对
- 用户必须在导航到目标网站后才能做所有事情

### 2.2 用户反馈

> 用户说"当前逻辑有些混乱"——用户在空白页下能更改主从模式（与域名无关），但不能改服务器地址（同样与域名无关）。

---

## 3. 三层架构模型

### 3.1 层级总览

```
层         依赖             空白页状态      典型功能
─────────────────────────────────────────────────────────
第一层     无                ✅ 解锁         服务器地址、设备名称、主从模式、拦截模块
第二层     同步域名配置       ✅ 解锁         P2P 配对、同步开关、立即同步、配对码
第三层     currentDomain     🔒 锁定         Cookie CRUD、保活、填入当前域名
```

### 3.2 第一层：全局设备配置

**定义**：一次配置，所有站点通用的设备级设置。

| ID | 功能 | 元素 | 当前状态 | v2.0 |
|----|------|------|:--------:|:----:|
| F1.1 | 信令服务器地址 | `p2pSignalUrl` | 🔒 | 🟢 |
| F1.2 | 服务器地址 | `syncServerUrl` | 🔒 | 🟢 |
| F1.3 | 配对码 | `syncPairKey` | 🔒 | 🟢 |
| F1.4 | 设备名称(P2P) | `p2pDeviceName` | 🔒 | 🟢 |
| F1.5 | 设备名称(服务器) | `syncDeviceName` | 🔒 | 🟢 |
| F1.6 | 生成配对码 | `btnGenerateKey` | 🔒 | 🟢 |
| F1.7 | 同步间隔 | `syncInterval` | 🔒 | 🟢 |
| F1.8 | 保存配置(P2P) | `btnP2pSaveConfig` | 🔒 | 🟢 |
| F1.9 | 保存配置(服务器) | `btnSaveSync` | 🔒 | 🟢 |
| F1.10 | 主从模式开关(服务器) | `masterModeToggle` | 🟢 | 🟢 维持 |
| F1.11 | 主/从身份(服务器) | `isMasterToggle` | 🟢 | 🟢 维持 |
| F1.12 | 主从模式开关(P2P) | `p2pMasterModeToggle` | 🟢 | 🟢 维持 |
| F1.13 | 主/从身份(P2P) | `p2pIsMasterToggle` | 🟢 | 🟢 维持 |
| F1.14 | 拦截主开关 | `blockerMasterToggle` | 🟢 | 🟢 维持 |
| F1.15 | 自定义规则输入 | `customRuleInput` | 🟢 | 🟢 维持 |
| F1.16 | 添加自定义规则 | `btnAddRule` | 🟢 | 🟢 维持 |
| F1.17 | 规则库导出 | `btnExportRules` | 🟢 | 🟢 维持 |
| F1.18 | 规则库导入 | `btnImportRules` | 🟢 | 🟢 维持 |
| F1.19 | 规则库远程更新 | `btnUpdateRules` | 🟢 | 🟢 维持 |

### 3.3 第二层：同步连接

**定义**：建立设备间通信通道，可指定同步哪个域名。**不依赖当前页面 URL**。

| ID | 功能 | 元素 | 当前状态 | v2.0 |
|----|------|------|:--------:|:----:|
| F2.1 | 创建 P2P 配对 | `btnP2PCreate` | 🔒 | 🟢 |
| F2.2 | 加入 P2P 配对 | `btnP2PJoin` | 🔒 | 🟢 |
| F2.3 | 确认加入配对 | `btnP2PDoJoin` | 🔒 | 🟢 |
| F2.4 | 断开 P2P 连接 | `btnP2PDisconnect` | 🔒 | 🟢 |
| F2.5 | 取消 P2P 配对 | `btnP2PCancel` | 🔒 | 🟢 |
| F2.6 | 配对码输入 | `p2pRoomCode` | 🔒 | 🟢 |
| F2.7 | P2P 同步开关 | `p2pSyncToggle` | 🔒 | 🟢 |
| F2.8 | P2P 同步域名输入 | `p2pSyncDomain` | 🔒 | 🟢 |
| F2.9 | P2P 立即同步 | `btnP2PSyncNow` | 🔒 | 🟢 |
| F2.10 | 服务器同步开关 | `syncToggle` | 🔒 | 🟢 |
| F2.11 | 服务器同步域名输入 | `syncDomain` | 🔒 | 🟢 |
| F2.12 | 服务器立即同步 | `btnSyncNow` | 🔒 | 🟢 |

### 3.4 第三层：站点操作

**定义**：所有需要知道「当前在哪个站点」才能操作的功能。

| ID | 功能 | 元素 | 当前状态 | v2.0 |
|----|------|------|:--------:|:----:|
| F3.1 | 导出当前站点 Cookie | `btnExport` | 🔒 | 🔒 维持 |
| F3.2 | 导入 Cookie | `btnImport` | 🔒 | 🔒 维持 |
| F3.3 | 清除当前站点 Cookie | `btnClear` | 🔒 | 🔒 维持 |
| F3.4 | 保活 URL 输入框 | `heartbeatUrl` | 🔒 | 🔒 维持 |
| F3.5 | 填入当前 URL | `btnFillUrl` | 🔒 | 🔒 维持 |
| F3.6 | 添加保活 | `btnAddHeartbeat` | 🔒 | 🔒 维持 |
| F3.7 | 保活间隔选择器 | `heartbeatInterval` | 🔒 | 🔒 维持 |
| F3.8 | 获取当前站点 Cookie 列表 | `btnLoadCookies` | 🔒 | 🔒 维持 |
| F3.9 | 填入当前域名(P2P) | `btnP2pFillDomain` | 🔒 | 🔒 维持 |
| F3.10 | 填入当前域名(服务器) | `btnFillSyncDomain` | 🔒 | 🔒 维持 |

> **关于 F3.7 `heartbeatInterval` 的说明**：虽然间隔选择器本身不依赖域名（属于全局偏好），但它与 F3.4/F3.5/F3.6 在 UI 上排列在同一行。为了锁定状态的一致性，维持锁定。用户不会在空白页设置保活间隔——因为没有保活需要配置。

---

## 4. 功能需求详述

### 4.1 F1.8 btnP2pSaveConfig 验证补全（新增需求）

当前代码只验证了 `signalUrl`（空）：

```javascript
const signalUrl = document.getElementById('p2pSignalUrl').value.trim();
if (!signalUrl) return showToast('⚠️ 请输入信令服务器地址');
```

**需求**：增加对 `p2pDeviceName` 的空值校验：

```javascript
const p2pDeviceName = document.getElementById('p2pDeviceName').value.trim();
if (!p2pDeviceName) return showToast('⚠️ 请输入设备名称');
```

**背景**：在 v1.x 中 `p2pDeviceName` 输入框被锁定，用户无法修改，所以 save 时不需要校验。v2.0 解锁后，用户可能保留空值保存，导致后台 `Object.assign` 用空字符串覆盖已有配置。

### 4.2 空白页横幅优化（新增需求）

**现状**：当前横幅只显示一行「请导航到目标网站」。

**v2.0 目标**：分两段展示，让用户知道空白页下也能做不少事。

**文案**：

```
📄 当前为空白/新标签页

🟢 你可以在此页面配置：
   服务器地址、设备名称、配对码、主从模式
   P2P 配对连接、同步开关、拦截规则

➡️ 导航到目标网站后可进行：
   Cookie 导出/导入/清除、添加保活
```

**实现方式**：纯文案修改，无需 JS 逻辑变更。

---

## 5. 锁定规则详细定义

### 5.1 代码逻辑

```javascript
function setDomainDependentState(hasDomain, tabInfo) {
    var isBlank = isBlankTab(tabInfo);
    // ... 横幅显示逻辑同现有 ...
    
    // 第一层 + 第二层：无论空白还是正常页面，全部解锁
    // 这两层的功能不依赖 currentDomain
    
    // 第三层：只有有域名时才解锁
    var locked = !hasDomain;
    
    // 锁定第三层元素
    var lockedEls = [
        'btnExport', 'btnImport', 'btnClear',       // Cookie
        'btnAddHeartbeat',                           // 保活
        'btnLoadCookies',                            // Cookie 列表
        'btnP2pFillDomain', 'btnFillSyncDomain',     // 填入域名
    ];
    
    var inputIds = [
        'heartbeatUrl',                              // 保活 URL
    ];
    
    // 额外
    ['btnFillUrl', 'heartbeatInterval'].forEach(...);
    
    // 所有第一层 + 第二层元素不再在 lockedEls/inputIds 中
}
```

### 5.2 正反例对照

| 场景 | 用户行为 | v1.x | v2.0 |
|------|---------|:----:|:----:|
| 空白页 | 输入信令服务器地址 | 🔒 不可 | 🟢 可 |
| 空白页 | 生成配对码 | 🔒 不可 | 🟢 可 |
| 空白页 | 创建 P2P 配对 | 🔒 不可 | 🟢 可（会报错） |
| 空白页 | 开启服务器同步 | 🔒 不可 | 🟢 可（域名空不运行） |
| 空白页 | 导出 Cookie | 🔒 不可 | 🔒 不可 |
| 空白页 | 添加保活 | 🔒 不可 | 🔒 不可 |
| OA 页面 | 导出 Cookie | 🟢 可 | 🟢 可 |
| OA 页面 | 创建 P2P | 🟢 可 | 🟢 可（不变） |

> **关于「创建 P2P 配对会报错」**：在空白页下，如果用户没配信令地址，点击创建会走 `p2pCreateRoom` → `fetch(`${signalUrl}/api/signal/room`)` → `signalUrl` 为空/占位符 → fetch 向 `http://你的服务器:5789/api/signal/room` 请求 → 连接拒绝 → try/catch → 前台 toast `⚠️ 创建配对失败`。这是正常错误提示，不会崩溃。

---

## 6. 可行性分析

### 6.1 分析范围

对每一层中**从锁定变为解锁**的元素，逐条验证：

1. 操作是否依赖 `currentDomain`
2. 操作失败是否有错误处理
3. 空值/默认值输入是否会导致数据损坏
4. 是否存在竞态条件

### 6.2 第一层解锁元素验证

| 元素 | 可行性验证 | 结论 |
|------|-----------|:----:|
| `p2pSignalUrl` | 纯输入框，无 side effect；后台 `saveSyncConfig` 用 `Object.assign` 合并 | ✅ |
| `syncServerUrl` | 纯输入框，后台同样合并存储 | ✅ |
| `syncPairKey` | 纯输入框（初始 `readonly`，生成后可编辑） | ✅ |
| `p2pDeviceName` | 纯输入框 | ✅ |
| `syncDeviceName` | 纯输入框 | ✅ |
| `btnGenerateKey` | 仅修改 `syncPairKey` 输入框的 value，无后台调用 | ✅ |
| `syncInterval` | 纯 `select`，无 side effect | ✅ |
| `btnP2pSaveConfig` | ⚠️ **缺少 deviceName 验证**（需补） | ⚠️ 见 6.4 |
| `btnSaveSync` | 已有完整 4 字段验证（serverUrl/pairKey/deviceName/syncedDomains）| ✅ |

### 6.3 第二层解锁元素验证

| 元素 | 可行性验证 | 结论 |
|------|-----------|:----:|
| `btnP2PCreate` | 需 `deviceName` + `signalUrl` → popup.js 已有校验 → background 有 try/catch | ✅ |
| `btnP2PJoin` | 展开 `p2pJoinInput` block，不执行后台调用 | ✅ |
| `btnP2PDoJoin` | 需 `roomId` + `deviceName` + `signalUrl` → popup.js 已有校验 | ✅ |
| `btnP2PDisconnect` | 断开 WebRTC 连接，清除轮询，不依赖域名 | ✅ |
| `btnP2PCancel` | 同 `btnP2PDisconnect` | ✅ |
| `p2pRoomCode` | 纯输入框 | ✅ |
| `p2pSyncToggle` | Popup 校验域名 → `p2pToggleSync` 后台写入配置 + alarm | ✅ |
| `p2pSyncDomain` | 纯输入框 | ✅ |
| `btnP2PSyncNow` | `p2pManualSync` → 遍历已连接对端 → 无对端时不执行 | ✅ |
| `syncToggle` | Popup 校验 serverUrl/pairKey → `serverToggleSync` 后台注册设备+alarm | ✅ |
| `syncDomain` | 纯输入框 | ✅ |
| `btnSyncNow` | `serverManualSync` → 域名空时跳过上传，只下载 | ✅ |

### 6.4 阻礙项：btnP2pSaveConfig 缺少 deviceName 校验

**当前代码**（popup.js L915-926）：

```javascript
const signalUrl = document.getElementById('p2pSignalUrl').value.trim();
if (!signalUrl) return showToast('⚠️ 请输入信令服务器地址');  // ✅ signalUrl 有校验
const syncDomain = document.getElementById('p2pSyncDomain').value.trim();
const p2pDeviceName = document.getElementById('p2pDeviceName').value.trim();  // ❌ 未校验空值
// ... 直接保存
await chrome.runtime.sendMessage({ action: 'saveSyncConfig', config: { 
    signalUrl, p2pDeviceName, syncedDomains: syncDomain ? [syncDomain] : [], masterMode, isMaster 
}});
```

**影响**：用户清空设备名称后保存 → `Object.assign` 用 `p2pDeviceName: ''` 覆盖已有值 → 后续 P2P 配对此字段为空。

**优化方案**：增加一行校验：

```javascript
if (!p2pDeviceName) return showToast('⚠️ 请输入设备名称');
```

**风险等级**：低（一行代码修复）

### 6.5 可行性结论

| 维度 | 状态 | 说明 |
|------|:----:|------|
| 运行风险 | 🟢 无 | 所有操作有 try/catch 或校验保护 |
| 数据安全 | 🟢 安全 | 已确认所有写入操作有校验或 null-safety |
| UI 一致性 | 🟢 良好 | 第三层元素统一锁定，第一/二层统一解锁 |
| 阻礙项 | 🟡 1 处 | `btnP2pSaveConfig` 缺 deviceName 校验，一行代码修复 |
| 回滚方案 | 🟢 简单 | 只需改回 `lockedEls` 和 `inputIds` 数组 |

**结论：可行性评估通过，1 处阻礙项已确定优化方案，无架构层面障碍。**

---

## 7. 边界条件与异常处理

### 7.1 同步域名未配置时

| 操作 | 行为 | 用户感知 |
|------|------|---------|
| 开启 P2P 自动同步 | 后台 `p2pToggleSync` 保存 `enabled: true`，创建 alarm。alarm 触发 `p2pSync` → `if (!domain) return` 静默跳过 | 同步状态显示"已启用"，但实际不会执行任何操作 |
| 点击「立即同步」P2P | `p2pManualSync` → 遍历 P2P 连接 → `p2pSync(peerId)` → 同上跳过 | Toast "🔄 同步已触发"，但实际无数据发送 |
| 开启服务器同步 | `serverToggleSync` 先 `serverRegisterDevice`（需 serverUrl/pairKey，有校验）→ 创建 alarm → alarm 触发 `serverPerformSync` → 域名空时跳过 upload，执行 download | 同步状态显示"已启用" |
| 点击「立即同步」服务器 | 同上 | 显示"同步完成 \| 无更新" |

**结论**：域名未配置时不会产生错误，只是静默跳过。用户可在同步状态中查看到"尚未同步"或"最后同步: —"的提示。

### 7.2 P2P 信令地址未配置时

| 操作 | 行为 |
|------|------|
| 点击「创建配对」 | Popup 校验 `signalUrl` → 空 → Toast "⚠️ 请输入信令服务器地址" |
| 点击「确认加入」 | 校验设备名称 → 校验 signalUrl → 空 → 同上 |
| 点击「断开连接」 | `p2pDisconnect` → `getSignalUrl()` 返回空 → fetch 失败 → catch 静默 → 继续清理内存中的连接对象 |

**结论**：所有创建/加入操作有前段校验，断开操作有 try/catch 兜底。

### 7.3 空白页 `currentDomain` 为空

`setDomainDependentState` 中的 `hasDomain = !!currentDomain` → 空白页下为 `false` → `locked = true`。第三层元素正常禁用。✅

### 7.4 首次安装 + 空白页

用户安装后第一次打开插件，所有第一/二层输入框显示默认占位符（如 `http://你的服务器:5789`），按钮可用但点击会因校验提示错误。

这是理想行为——用户看到输入框和按钮都是可用的，知道需要配置什么，而不是看到一个灰色不可交互的界面。

---

## 8. UI 与交互规范

### 8.1 锁定视觉状态

第三层被锁定的元素已有 CSS 样式（`button:disabled` 灰色 + `input:disabled` 灰色），无需额外修改。

### 8.2 空白页横幅文案

**当前**：

```
📄 当前为空白/新标签页
请导航到目标网站后重新打开插件，或在已打开的网页上使用此插件。
```

**v2.0**：

```
📄 当前为空白/新标签页

▸ 你可以在此页面配置：
  服务器地址、设备名称、配对码、主从模式
  P2P 配对连接、同步开关、拦截规则

▸ 导航到目标网站后进行：
  Cookie 导出/导入/清除、添加保活
```

**实现方式**：修改 `popup.html` 中 `<div id="blankPageBanner">` 内的文案。

### 8.3 保活间隔选择器锁定说明

`heartbeatInterval` 虽然本身不依赖域名，但与保活输入框在同一行 UI 上：

```
[保活 URL 输入框 🔒] [📌 🔒] [↓ 间隔选择器 🔒]
```

不同锁状态会导致用户困惑。因此保持第三层锁定。

---

## 9. 数据存储模型

### 9.1 按层划分

| 存储键 | 归属层 | 说明 |
|--------|:------:|------|
| `device_identity` | 第一层 | 设备 ID、创建时间 |
| `blocker_config` | 第一层 | 拦截主开关/站点开关/关键词覆盖 |
| `blocking_rules_db` | 第一层 | 规则库数据 |
| `app_logs` | 第一层 | 操作日志 |
| `user_blocking_rules` | 第一层 | 自定义 URL 拦截规则 |
| `sync_config.*` (signalUrl/p2pDeviceName) | 第一层 | 全局配置字段 |
| `server_sync_config.*` (serverUrl/deviceName/pairKey/interval) | 第一层 | 全局配置字段 |
| `sync_config.*` (enabled/mode/p2pConnected/syncedDomains) | 第二层 | 连接配置字段 |
| `server_sync_config.*` (enabled/deviceId/syncedDomains) | 第二层 | 连接配置字段 |
| `sync_history` | 第二层 | 同步历史记录 |
| `cloud_sync_config` (masterMode/isMaster) | 第一/二层 | 主从配置（跨层） |
| `heartbeat_configs` | 第三层 | 保活规则 |
| `sync_cookie_meta` | 第三层 | Cookie 来源追踪 |

### 9.2 存储变更

**本次重构不涉及任何存储结构变更**。存储键的归属分层仅用于文档分类，实际代码中的读写逻辑不变。

---

## 10. 迁移路径与兼容性

### 10.1 向前兼容

v2.0 锁定规则的变更方向是**解锁更多元素**（从锁定变为可用）。

- 已保存的配置值不受影响
- 旧用户升级后，之前保存的信令地址、设备名称等仍然存在
- 只在空白页下行为改变——有域名时行为与 v1.x 完全一致

### 10.2 向后兼容

不支持降级。如果用户从 v2.0 回退到 v1.x，锁定规则回到旧逻辑，不影响功能。

### 10.3 版本号

- v1.5.14 → **v2.0.0**
- 符合语义化版本规范：底层锁定规则架构重构，属于 BREAKING CHANGE（虽然只是行为变更，不影响数据）

---

## 11. 非功能性需求

| 类型 | 需求 |
|------|------|
| 性能 | 锁定函数 `setDomainDependentState` 执行时间 < 1ms |
| 兼容性 | Chrome 84+ / Edge 84+ |
| 可维护性 | 锁定元素列表按层分组 + 注释说明归属层 |
| 可测试性 | 每个层级的锁定行为可通过模拟 `isBlankTab` 测试 |

---

## 12. 附录：元素锁定矩阵全表

> ✅ = 解锁（可操作） 🔒 = 锁定（禁用） — = 不适用

| 元素 ID | 类型 | 当前 | v2.0 | 归属层 |
|---------|------|:----:|:----:|:------:|
| `btnExport` | 按钮 | 🔒 | 🔒 | 第三层 |
| `btnImport` | 按钮 | 🔒 | 🔒 | 第三层 |
| `btnClear` | 按钮 | 🔒 | 🔒 | 第三层 |
| `btnAddHeartbeat` | 按钮 | 🔒 | 🔒 | 第三层 |
| `btnFillUrl` | 按钮 | 🔒 | 🔒 | 第三层 |
| `btnLoadCookies` | 按钮 | 🔒 | 🔒 | 第三层 |
| `btnP2pFillDomain` | 按钮 | 🔒 | 🔒 | 第三层 |
| `btnFillSyncDomain` | 按钮 | 🔒 | 🔒 | 第三层 |
| `heartbeatUrl` | 输入 | 🔒 | 🔒 | 第三层 |
| `heartbeatInterval` | 选择器 | 🔒 | 🔒 | 第三层 |
| `btnP2PCreate` | 按钮 | 🔒 | ✅ | 第二层 |
| `btnP2PJoin` | 按钮 | 🔒 | ✅ | 第二层 |
| `btnP2PDoJoin` | 按钮 | 🔒 | ✅ | 第二层 |
| `btnP2PDisconnect` | 按钮 | 🔒 | ✅ | 第二层 |
| `btnP2PCancel` | 按钮 | 🔒 | ✅ | 第二层 |
| `btnP2PSyncNow` | 按钮 | 🔒 | ✅ | 第二层 |
| `btnSyncNow` | 按钮 | 🔒 | ✅ | 第二层 |
| `p2pSyncToggle` | 开关 | 🔒 | ✅ | 第二层 |
| `syncToggle` | 开关 | 🔒 | ✅ | 第二层 |
| `p2pRoomCode` | 输入 | 🔒 | ✅ | 第二层 |
| `p2pSyncDomain` | 输入 | 🔒 | ✅ | 第二层 |
| `syncDomain` | 输入 | 🔒 | ✅ | 第二层 |
| `p2pSignalUrl` | 输入 | 🔒 | ✅ | 第一层 |
| `syncServerUrl` | 输入 | 🔒 | ✅ | 第一层 |
| `syncPairKey` | 输入 | 🔒 | ✅ | 第一层 |
| `p2pDeviceName` | 输入 | 🔒 | ✅ | 第一层 |
| `syncDeviceName` | 输入 | 🔒 | ✅ | 第一层 |
| `syncInterval` | 选择器 | 🔒 | ✅ | 第一层 |
| `btnGenerateKey` | 按钮 | 🔒 | ✅ | 第一层 |
| `btnP2pSaveConfig` | 按钮 | 🔒 | ✅ | 第一层 |
| `btnSaveSync` | 按钮 | 🔒 | ✅ | 第一层 |
| `masterModeToggle` | 开关 | ✅ | ✅ | 第一层 |
| `isMasterToggle` | 开关 | ✅ | ✅ | 第一层 |
| `p2pMasterModeToggle` | 开关 | ✅ | ✅ | 第一层 |
| `p2pIsMasterToggle` | 开关 | ✅ | ✅ | 第一层 |
| `blockerMasterToggle` | 开关 | ✅ | ✅ | 第一层 |
| `customRuleInput` | 输入 | ✅ | ✅ | 第一层 |
| `btnAddRule` | 按钮 | ✅ | ✅ | 第一层 |
| `btnExportRules` | 按钮 | ✅ | ✅ | 第一层 |
| `btnImportRules` | 按钮 | ✅ | ✅ | 第一层 |
| `btnUpdateRules` | 按钮 | ✅ | ✅ | 第一层 |
| `btnGetNetInfo` | 按钮 | ✅ | ✅ | 第一层 |
| `btnHelp` | 按钮 | ✅ | ✅ | 第一层 |
| `btnExportLog` | 按钮 | ✅ | ✅ | 第一层 |
| `btnDeviceInfo` | 按钮 | ✅ | ✅ | 第一层 |

**总计**：22 个元素从 🔒 变为 ✅，属于纯解锁操作。
