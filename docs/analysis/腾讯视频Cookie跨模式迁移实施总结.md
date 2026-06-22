# SessionMaster · 腾讯视频 Cookie 跨模式迁移 · 实施总结

> **Commit**: `dd1bb2f` (master) / `af61b52` (develop)  
> **日期**: 2026-06-22  
> **提交信息**: `fix: 修复incognito→normal模式Cookie导入失效（Phase1+2）`

---

## 一、修改文件总览

```
src/
├── background.js   │ 31 insertions, 2 deletions   ← Phase 1 + 消息路由
├── content.js      │ 58 insertions                ← Phase 2 (新增功能)
└── popup/
    └── popup.js    │ 38 insertions                ← Phase 2 (UI集成)
─────────────────────────────────────────────────
Total: 125 insertions, 2 deletions (3 files)
```

---

## 二、Phase 1：Cookie `expirationDate` 补全

### 2.1 导出端（background.js）

**`exportCookies` (line 463)**

```diff
- cookies: cookies.map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path, secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite, hostOnly: c.hostOnly, _exportTime: exportTime }))
+ cookies: cookies.map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path, secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite, hostOnly: c.hostOnly, expirationDate: c.expirationDate, _exportTime: exportTime }))
```

**`exportCookiesSmart` (lines 632-637)**

```diff
- hostOnly: c.hostOnly, _exportTime: exportTime
+ hostOnly: c.hostOnly, expirationDate: c.expirationDate, _exportTime: exportTime
```

### 2.2 导入端（background.js）

**`importCookies` (line 473)** — 粘贴/手动导入

```diff
  const details = { url: ..., name: c.name, value: c.value, ... };
+ if (c.expirationDate != null) details.expirationDate = c.expirationDate;
```

**`importCookiesSmart` (line 586)** — 自动同步导入

```diff
+ if (c.expirationDate != null) details.expirationDate = c.expirationDate;
```

**`importCookiesUnconditional` (line 655)** — 无条件导入

```diff
+ if (c.expirationDate != null) details.expirationDate = c.expirationDate;
```

### 2.3 效果

| 场景 | 修改前 | 修改后 |
|:-----|:-------|:-------|
| 导入 Cookie | 变成 Session Cookie（无过期时间） | 恢复原始过期时间（如 1年后） |
| 浏览器重启 | Cookie 丢失 | Cookie 保留 |
| 隐身→普通 | 重启后失效 | 重启后仍有效 |

---

## 三、Phase 2：localStorage 同步

### 3.1 架构图

```
┌───────────────────────────────────────────────────┐
│                    Popup (popup.js)                │
│  ╔═══════════════════════════════════════════════╗ │
│  ║  btnExport  → getCookies + readLocalStorage  ║ │
│  ║  btnDoImport → importWithCookieClear +       ║ │
│  ║                 writeLocalStorage             ║ │
│  ║  btnImportFromFile → 同上 + localStorage     ║ │
│  ╚═══════════════╦═══════════════════════════════╝ │
└──────────────────║────────────────────────────────┘
                   │ chrome.runtime.sendMessage
                   ▼
┌───────────────────────────────────────────────────┐
│          Background (background.js)                │
│  ╔═══════════════════════════════════════════════╗ │
│  ║  readLocalStorage: chrome.tabs.sendMessage   ║ │
│  ║    → content script                          ║ │
│  ║  writeLocalStorage: chrome.tabs.sendMessage  ║ │
│  ║    → content script                          ║ │
│  ╚═══════════════╦═══════════════════════════════╝ │
└──────────────────║────────────────────────────────┘
                   │ chrome.tabs.sendMessage
                   ▼
┌───────────────────────────────────────────────────┐
│          Content Script (content.js)               │
│  ╔═══════════════════════════════════════════════╗ │
│  ║  readLocalStorage():                          ║ │
│  ║    localStorage.getItem(key) for each key     ║ │
│  ║    → 返回 { ams_cookies: '...', qimei: '...' }║ │
│  ║                                               ║ │
│  ║  writeLocalStorage(data):                     ║ │
│  ║    localStorage.setItem(key, value)           ║ │
│  ║    → 返回写入数量                             ║ │
│  ╚═══════════════════════════════════════════════╝ │
└───────────────────────────────────────────────────┘
```

### 3.2 Content Script 新增代码（content.js）

**预置 localStorage Key 列表**（可扩展）：

```javascript
const LOCALSTORAGE_KEYS = [
    'ams_cookies',           // 腾讯视频：API 认证头
    'qimei',                 // Tencent 设备标识
    'qimei36',               // Tencent 36位随机设备标识
    'q36cookiekey',          // 36位cookie key
    'qmuuk',                 // UUID
    'g_utdata',              // 用户数据
    'vqq_user_info',         // 腾讯视频用户信息
    'vqq_access_token',      // 腾讯视频访问令牌
    'vqq_refresh_token'      // 腾讯视频刷新令牌
];
```

**消息监听**：

```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'readLocalStorage') {
        const data = readLocalStorage(message.keys);
        sendResponse({ success: true, data, domain: window.location.hostname });
        return true;
    }
    if (message.action === 'writeLocalStorage') {
        const count = writeLocalStorage(message.data || {});
        sendResponse({ success: true, count, domain: window.location.hostname });
        return true;
    }
});
```

### 3.3 Background 消息路由（background.js）

```javascript
case 'readLocalStorage':
    chrome.tabs.sendMessage(tabs[0].id, { action: 'readLocalStorage', keys: request.keys }, (resp) => {
        sendResponse(resp || { success: false });
    });
    return true;  // 异步响应

case 'writeLocalStorage':
    chrome.tabs.sendMessage(tabs2[0].id, { action: 'writeLocalStorage', data: request.data }, (resp) => {
        sendResponse(resp || { success: false });
    });
    return true;  // 异步响应
```

### 3.4 Popup UI 改动（popup.js）

**导出按钮** —— 导出 Cookie 后自动检测 localStorage：

```javascript
// 导出 Cookie 后
const lsResult = await chrome.runtime.sendMessage({ action: 'readLocalStorage' });
if (lsResult && lsResult.success && Object.keys(lsResult.data).length > 0) {
    lastExportData.localStorage = lsResult.data;
    document.getElementById('resultCount').textContent = 
        `${result.data.cookies.length} 个 Cookie + ${keys.length} 项本地存储`;
}
```

**导出文件** —— 包含 localStorage 到 JSON：

```javascript
if (lastExportData.localStorage) {
    fileData.localStorage = lastExportData.localStorage;
}
```

**粘贴导入 + 文件导入** —— 导入 Cookie 后自动写回 localStorage：

```javascript
if (importData.localStorage && Object.keys(importData.localStorage).length > 0) {
    await chrome.runtime.sendMessage({ action: 'writeLocalStorage', data: importData.localStorage });
}
```

---

## 四、数据流示例

### 导出（隐身模式）

```json
{
    "domain": "v.qq.com",
    "exportTime": "2026-06-22T12:00:00.000Z",
    "cookies": [
        { "name": "uin", "value": "o1234567890", "domain": ".qq.com", "path": "/",
          "secure": true, "httpOnly": true, "sameSite": "lax", "hostOnly": false,
          "expirationDate": 1792742400 },
        ...
    ],
    "localStorage": {
        "ams_cookies": "{\"uin\":\"o1234567890\",\"skey\":\"@abc123...\"}",
        "qimei": "b8a9c7d6e5f4a3b2c1d0",
        "qimei36": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8",
        "qmuuk": "12345678-aaaa-bbbb-cccc-ddddeeee"
    }
}
```

### 导入（普通模式）

1. 粘贴 JSON 到导入文本框
2. 点击「导入」
3. ⚙️ `background.js` → 清除旧 Cookie → 写入新 Cookie（含 expirationDate）
4. ⚙️ `content.js` → 检测到 `localStorage` 字段 → 写入 `localStorage`
5. 🔄 刷新页面 → Cookie + localStorage 均已恢复 → 登录状态生效

---

## 五、验证清单

| # | 验证项 | 预期结果 | 状态 |
|:-:|:-------|:---------|:----:|
| 1 | 导出 JSON 是否包含 `expirationDate` | 每个 cookie 对象有 `expirationDate: <number>` | ✅ |
| 2 | 导出 JSON 是否包含 `localStorage` | 腾讯视频导出时有 `localStorage` 字段 | ✅ |
| 3 | 无 localStorage 的站点导出 | 仅 Cookie 字段，无 `localStorage` | ✅ |
| 4 | 粘贴导入后 Cookie 是否保留过期时间 | `chrome.cookies.get()` 返回原 `expirationDate` | ✅ |
| 5 | 文件导入后 localStorage 是否写回 | `localStorage.getItem('ams_cookies')` 返回原值 | ✅ |
| 6 | 浏览器重启后 Cookie 是否保留 | 未关闭 Session，重启后仍有效 | ✅ |
| 7 | 无 content script 页面导入 | 跳过 localStorage，不影响 Cookie 导入 | ✅ |
| 8 | 向后兼容旧版导出文件 | 旧文件无 `localStorage`/`expirationDate` 时不报错 | ✅ |
