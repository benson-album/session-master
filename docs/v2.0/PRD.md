# SessionMaster v2.0 — 全面架构重构 PRD

> **版本**：v2.0-draft
> **状态**：需求确认中
> **范围**：全量重构（业务模型 / UI 布局 / 数据模型 / 锁定规则）

---

## 1. 核心设计理念

### 1.1 以站点为中心

v1.x 是按**功能组织**的架构：

```
🍪 Cookie  |  💓 保活  |  🔗 同步  |  🛡️ 拦截
  独立Tab      独立Tab       独立Tab      独立Tab
```

v2.0 改为按**站点组织**的架构：

```
🌐 业务架构抽象
│
├── 会话管理 (每个站点独立)
│   ├── 站点1 → { 🍪 Cookie · 💓 保活 · 🛡️ 拦截 }
│   ├── 站点2 → { 🍪 Cookie · 💓 保活 · 🛡️ 拦截 }
│   └── 站点n → ...
│
└── 同步管理 (每个站点独立)
    ├── 站点1 → { 📡 主从设备 → [🔗 P2P | ☁️ 服务器] }
    ├── 站点2 → { 📡 主从设备 → [🔗 P2P | ☁️ 服务器] }
    └── 站点n → ...
```

**核心理念转换**：

| 旧理念 | 新理念 |
|--------|--------|
| 用户来操作"功能" | 用户来操作"站点" |
| 同步是全局开关 | 同步是每个站点独立配置 |
| 主从设备和传输方式分立 | 先定角色→再选传输方式(P2P/服务器) |
| 全局配置散落在功能卡片中 | 全局配置统一入口 |
| 拦截是独立模块 | 拦截是站点会话管理一部分 |

### 1.2 三个概念层次

```
第一层：全局设备          ⚙️ 全局设置 Tab（一次配置，所有站点共享）
  ├── 信令服务器地址
  ├── 服务器地址
  ├── 设备名称
  ├── 同步间隔
  ├── 设备身份
  └── 导出日志

第二层：站点配置          🌐 会话管理 + 🔄 同步管理（每个站点独立存储）
  ├── 会话管理
  │   ├── Cookie 导出/导入/清除
  │   ├── 会话保活
  │   └── 踢人拦截（当前站点推荐规则）
  └── 同步管理
      ├── 主从设备模式（主/从）
      ├── 传输方式选择（P2P / 服务器）
      └── 配对/同步控制

第三层：运行时操作        操作时根据上下文动态判定
  ├── 空白页锁定规则
  └── 填写当前 URL 等
```

---

## 2. Tab 结构定义

### 2.1 三 Tab 布局

```
┌─────────────────────────────────────────────────────┐
│ 🔐 SessionMaster 会话大师                   v2.0.0 │
│─────────────────────────────────────────────────────│
│  📍 当前站点：oa.company.com  [▼ 下拉切换]         │
│─────────────────────────────────────────────────────│
│ [🌐 会话管理]  [🔄 同步管理]  [⚙️ 全局设置]       │
│─────────────────────────────────────────────────────│
│                                                     │
│  (当前 Tab 内容)                                    │
│                                                     │
├─────────────────────────────────────────────────────┤
│ 📖 使用说明  📋 导出日志               本插件仅供.. │
└─────────────────────────────────────────────────────┘
```

### 2.2 Tab 1：🌐 会话管理

**站点选择器**：
- 位于 Tab 顶部或站点信息区域
- 下拉列表展示所有已配置站点（含域名字段显示）
- 底部选项「添加新站点」
- 首次打开时自动识别当前浏览器 URL 的域名

**功能分区**（按当前选中站点）：

```
🌐 会话管理 — [oa.company.com ▼]
─────────────────────────────────
🍪 Cookie 管理
  [📤 导出] [📥 导入] [🗑️ 清除]
  结果面板 ── 复制 / 下载文件
  导入面板 ── 粘贴 / 从文件导入

💓 会话保活
  [保活 URL 输入框] [📌] [间隔选择器]
  [💓 添加保活]
  保活列表（启用/暂停/删除/🍪查看Cookie）

🛡️ 踢人拦截
  [主开关 ON/OFF]
  已激活规则（当前站点）
  规则库（站点列表+开关）
  自定义规则（输入/添加/删除）
  规则库管理（导出/导入/远程更新）
```

### 2.3 Tab 2：🔄 同步管理

```
🔄 同步管理 — [oa.company.com ▼]
─────────────────────────────────
📡 主从设备模式
  [主从开关 ON/OFF]
  当前身份：[主设备 / 从设备]
  状态提示：从设备时自动暂停保活

🔗 P2P 直连
  配对状态：未连接 / 已连接至 xxx
  创建配对 / 加入配对 / 断开
  自动同步 [ON/OFF]
  [🔄 立即同步]

☁️ 服务器模式
  服务器状态：未注册 / 已注册
  配对码：[生成 / 输入]
  自动同步 [ON/OFF]
  [🔄 立即同步]

─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─

📋 同步记录（最近 50 条）
  ─ 09:32 P2P 同步了 5 个 Cookie
  ─ 09:27 服务器同步完成，无更新
  ─ ...

🌐 本机网络地址
  [🔄 获取本机网络地址]
  网络地址列表
```

### 2.4 Tab 3：⚙️ 全局设置

```
⚙️ 全局设置
─────────────────────────────────
🔗 同步服务器
  信令服务器地址：[http://______:5789]
  服务器地址：    [http://______:5789]
  设备名称(P2P)： [办公室电脑]
  设备名称(服务器): [办公室电脑]
  同步间隔：      [每 5 分钟 ▼]

🖥️ 设备身份
  设备 ID: dev-xxxx-xxxx
  创建时间：2026-06-20
  [🖥️ 查看完整设备详情]

📋 可用工具
  [📖 使用说明] [📋 导出日志]
  版本更新检查
```

---

## 3. 站点数据模型

### 3.1 存储结构

```json
{
  "sites": [
    {
      "domain": "oa.company.com",
      "createdAt": "2026-06-21T00:00:00Z",

      "heartbeats": [
        {
          "id": "hb_xxx",
          "url": "/main.do?method=keepAlive",
          "intervalMinutes": 10,
          "enabled": true,
          "createdAt": "...",
          "lastHeartbeatTime": "...",
          "lastStatus": "ok"
        }
      ],

      "sync": {
        "masterMode": true,
        "isMaster": true,
        "p2p": {
          "enabled": false,
          "roomId": null,
          "connected": false,
          "connectedPeerName": null
        },
        "server": {
          "enabled": true,
          "deviceId": "dev_xxx",
          "pairKey": "X3K8PQ"
        }
      }
    }
  ],

  "global": {
    "signalUrl": "http://192.168.3.8:5789",
    "serverUrl": "http://192.168.3.8:5789",
    "p2pDeviceName": "办公室电脑",
    "serverDeviceName": "办公室电脑",
    "syncInterval": 5,
    "deviceIdentity": {
      "id": "dev-xxx",
      "createdAt": "2026-06-20T..."
    }
  },

  "blockerConfig": {
    "masterEnabled": true,
    "siteEnabled": {},
    "keywordOverrides": {}
  },

  "blockingRulesDB": {
    "version": 1,
    "sites": [],
    "generic": []
  }
}
```

### 3.2 与 v1.x 的对应关系

| v1.x | v2.0 | 说明 |
|------|------|------|
| `sync_config.signalUrl` | `global.signalUrl` | 全局第一层 |
| `sync_config.p2pDeviceName` | `global.p2pDeviceName` | 全局第一层 |
| `sync_config.p2pRoomId, enabled, p2pConnected` | `sites[].sync.p2p.*` | 按站点存储 |
| `server_sync_config.serverUrl` | `global.serverUrl` | 全局第一层 |
| `server_sync_config.deviceName` | `global.serverDeviceName` | 全局第一层 |
| `server_sync_config.enabled, deviceId, pairKey` | `sites[].sync.server.*` | 按站点存储 |
| `heartbeat_configs[]` | `sites[].heartbeats[]` | 按站点归并 |
| `blocker_config` | `blockerConfig` | 不变 |
| `blocking_rules_db` | `blockingRulesDB` | 不变 |
| `device_identity` | `global.deviceIdentity` | 不变 |

### 3.3 迁移方案

v2.0 首次启动时自动执行：

1. 读取 v1.x 的所有存储键
2. 从 `heartbeat_configs` 提取所有站点域名，建立 `sites` 数组
3. 将每个保活记录归入对应站点
4. 将 `sync_config` 和 `server_sync_config` 拆分为 `global` + 按站点
5. 将 `device_identity` 移入 `global`
6. 写入新的存储结构
7. **保留 v1.x 的旧键做回滚备份**

```javascript
async function migrateV1toV2() {
  const v1data = {
    beats: await getStorage('heartbeat_configs', []),
    p2p: await getStorage('sync_config', {}),
    server: await getStorage('server_sync_config', {}),
    identity: await getStorage('device_identity', {}),
    blocker: await getStorage('blocker_config', {}),
  };
  
  // 合并站点
  const sites = [];
  const domains = new Set();
  
  v1data.beats.forEach(b => domains.add(b.domain));
  if (v1data.p2p.syncedDomains) domains.add(v1data.p2p.syncedDomains[0]);
  
  domains.forEach(domain => {
    sites.push({
      domain,
      heartbeats: v1data.beats.filter(b => b.domain === domain),
      sync: {
        masterMode: v1data.p2p.masterMode || v1data.server.masterMode || false,
        isMaster: v1data.p2p.isMaster !== false,
        p2p: {
          enabled: v1data.p2p.enabled && v1data.p2p.mode === 'p2p',
          roomId: v1data.p2p.p2pRoomId || null,
          connected: false,
        },
        server: {
          enabled: v1data.server.enabled || false,
          deviceId: v1data.server.deviceId || null,
          pairKey: v1data.server.pairKey || null,
        },
      },
    });
  });
  
  // 保存新结构
  await setStorage('v2_sites', sites);
  await setStorage('v2_global', {
    signalUrl: v1data.p2p.signalUrl || '',
    serverUrl: v1data.server.serverUrl || '',
    p2pDeviceName: v1data.p2p.p2pDeviceName || '',
    serverDeviceName: v1data.server.deviceName || '',
    syncInterval: v1data.p2p.intervalMinutes || v1data.server.intervalMinutes || 5,
    deviceIdentity: v1data.identity,
  });
}
```

---

## 4. UI 规范

### 4.1 站点选择器

```
📍 当前站点：oa.company.com              [▼]
            ├─ oa.company.com
            ├─ music.163.com
            ├─ work.weixin.qq.com
            └─ + 添加新站点
```

- 置于 Tab 上方，跨 Tab 共享选中状态
- 下拉列出所有已配置站点
- 底部「+ 添加新站点」入口
- 自动识别当前浏览器 URL：当前域名不在列表中时，下拉显示「📄 当前页面 (example.com)」临时选项

### 4.2 锁定规则（空白页）

基于站点架构重新定义锁定：

| 场景 | 操作 | 状态 |
|:----:|------|:----:|
| 无站点且空白页 | 站点选择器 | 🟢 可用（可新建站点） |
| 无站点且空白页 | Cookie/保活/拦截 | 🔒 锁定 |
| 无站点且空白页 | 同步管理（需先有站点） | 🔒 锁定 |
| 无站点且空白页 | 全局设置 | 🟢 全部可用 |
| 有站点但空白页 | 切换站点 | 🟢 可用 |
| 有站点但空白页 | 查看/编辑已有站点的保活/同步 | 🟢 可用 |
| 有站点但空白页 | 导出/导入/清除 Cookie | 🔒 锁定（需当前站点与选中站点一致） |
| 正常页面 | 所有 | 🟢 可用 |

切换到选中站点后，即使空白页，也能查看和修改该站点的同步/保活配置（因为数据已存储）。

### 4.3 主从 → P2P/服务器 的 UI 关系

```
📡 主从设备模式                  ← 先定角色
  [🔛 主从开关]  当前身份：[主设备 ▼]
  主设备：上传+下载 Cookie
  从设备：仅接收（暂停保活）

传输方式                        ← 再选方式
  ○ P2P 直连（推荐）            ← radio button 二选一
    [创建配对 / 加入配对]
    自动同步 [ON/OFF]
    [🔄 立即同步]

  ○ 服务器模式
    配对码：[X3K8PQ] [生成]
    自动同步 [ON/OFF]
    [🔄 立即同步]
```

### 4.4 同步按站点隔离

同一台设备上，不同站点的同步是独立的：

| 站点 | 主从模式 | 传输方式 | 同步状态 |
|:----:|:--------:|:--------:|:--------:|
| oa.company.com | 🟢 主设备 | 🔗 P2P | ✅ 已连接 |
| music.163.com | 🔵 从设备 | ☁️ 服务器 | ✅ 已启用 |
| work.weixin.qq.com | 🔵 未配置 | — | ⏸️ 未启用 |

---

## 5. 数据迁移

### 5.1 迁移时机

- `chrome.runtime.onInstalled` 中检测旧版存储
- 检测条件：`storage` 中存在 `heartbeat_configs` 或 `sync_config` 但不存在 `v2_sites`
- 迁移后写入标志 `v2_migrated: true` 防止重复迁移

### 5.2 回滚保障

- 迁移是**只读+写入新键**，不删除旧键
- 旧版存储键保留，作为紧急回滚备份
- 用户可手动调用 `chrome.storage.local.clear()` 回退

### 5.3 版本标记

- 迁移完成后，popup 顶部版本号显示 v2.0.0
- 首次迁移 toast："🔄 已升级到 v2.0，您的数据已安全迁移"

---

## 6. 功能变更汇总

### 6.1 新增

| 功能 | 说明 |
|------|------|
| 站点选择器 | 跨 Tab 共享的下拉切换，支持多站点 |
| 全局设置 Tab | 统一管理所有设备级配置 |
| 按站点同步配置 | 每个站点独立配置主从+传输方式 |
| 自动数据迁移 | v1.x → v2.0 存储结构升级 |
| 同步记录按站过滤 | 在同步管理 Tab 中按当前站点筛选 |

### 6.2 移除

| 功能 | 说明 |
|------|------|
| 原⚙️P2P 配置折叠卡 | 一分为二：全局地址→全局设置，同步配置→同步管理 |
| 原⚙️服务器配置折叠卡 | 同上 |
| 原🛡️拦截 Tab | 合并入会话管理 Tab，作为当前站点的一个功能块 |
| 同步模式切换按钮 | 改为站点内 radio 二选一 |

### 6.3 保留不变（逻辑层）

- Cookie CRUD 逻辑
- WebRTC P2P 引擎
- 加密（PBKDF2 + AES-256-GCM）
- 保活执行逻辑
- 拦截 content.js
- 规则库管理
- 信令服务器
- 同步服务器 API
- 主从冲突检测

---

## 7. 可行性预评估

| 维度 | 评估 | 风险 |
|:----:|------|:----:|
| **数据迁移** | 纯 `chrome.storage` 操作，无网络依赖，可离线执行 | 🟡 需充分测试边界：全空状态、部分配置状态、完整配置状态 |
| **存储键变更** | 旧键保留，新增 `v2_sites` + `v2_global`，无破坏性变更 | 🟢 低风险 |
| **UI 重构** | popup.html + popup.js 重写，但所有逻辑函数保持 | 🟡 工作量大（约 200 行 popup.js 重写 + HTML 重排） |
| **锁定规则** | 从 `setDomainDependentState` 改为 `hasSite` + `isCurrentTab` 双重判定 | 🟢 代码量小 |
| **后向兼容** | 旧存储键保留 | 🟢 可回滚 |
| **用户迁移** | 自动迁移无感知 | 🟢 已在 onInstalled 中处理 |

---

## 8. 迭代建议

| 版本 | 范围 | 优先级 |
|:----:|------|:------:|
| v2.0 | 完整的 Tab 重构 + 数据迁移 + 站点选择器 + 锁定规则 | P0 |
| v2.1 | 站点选择器新增"从当前页面添加"快捷按钮 | P1 |
| v2.2 | 全局设置 Tab 中新增同步记录全局视图 | P2 |
| v2.3 | 同步记录按站点过滤 + 统计分析 | P3 |
