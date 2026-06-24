# 腾讯视频 Cookie 跨模式迁移 · 深度分析报告

> **项目**：SessionMaster · 会话大师  
> **日期**：2026-06-22  
> **版本**：v1.5.23  
> **作者**：BenSon.Album

---

## 一、问题描述

在 Chrome 浏览器中，从**隐身模式**登录腾讯视频（v.qq.com），通过 SessionMaster 导出 Cookie，再在**普通模式**下导入这些 Cookie 后，腾讯视频仍显示「未登录」状态。

## 二、排查路径

### 2.1 代码审查 —— Phase 1 发现

| 检查项 | 文件 | 行号 | 发现 |
|:-------|:-----|:----:|:-----|
| Cookie 导出字段 | `background.js` | 463 | **缺失 `expirationDate`** |
| Cookie 导入参数 | `background.js` | 472, 583, 652 | 未传递过期时间 |
| Cookie 智能导出 | `background.js` | 632-636 | 同样缺失 |

**影响**：导入后的 Cookie 全部变为 Session Cookie（无过期时间），浏览器关闭后失效。

### 2.2 Kali Linux 远程分析 —— 结构测绘

通过 Kali 机器（`192.168.3.17`）对腾讯视频进行多维度分析：

```bash
# 使用工具
curl / whatweb / nuclei / nmap
# JS 反编译分析
900KB 主包 + 1.2MB 公共组件包
```

#### 2.2.1 HTTP 架构

| 端点 | 状态 | 用途 |
|:-----|:----:|:-----|
| `v.qq.com` | 200 | 主站（Express + Lego Server） |
| `pbaccess.video.qq.com` | 200 | **核心 API 入口（TRPC 协议）** |
| `ptlogin2.qq.com` | 403 | QQ 登录服务（Tencent Login Server/2.0） |
| `ui.ptlogin2.qq.com` | 404 | 已废弃 |
| `xui.ptlogin2.qq.com` | 404 | 已废弃 |
| `api.video.qq.com` | 503 | 旧版 API，已禁用 |

#### 2.2.2 安全头部检查

| 头部 | v.qq.com | 评估 |
|:-----|:---------|:-----|
| `X-Frame-Options` | `sameorigin` | ✅ 防止点击劫持 |
| `Content-Security-Policy` | `frame-ancestors https://*.qq.com` | ⚠️ 仅限制 iframe，无完整 CSP |
| `X-Content-Type-Options` | 缺失 | ❌ 可能被 MIME 类型混淆攻击 |
| `Strict-Transport-Security` | 缺失 | ❌ 无 HSTS，存在降级风险 |
| `Referrer-Policy` | `no-referrer-when-downgrade` | ✅ |
| `Set-Cookie` (主页) | 无 | ✅ 首页不主动写 Cookie |

### 2.3 JavaScript 逆向分析 —— 核心发现

#### 2.3.1 关键技术栈

- **框架**：Vue 3（Vite 构建）
- **后端**：Express + TRPC（pbaccess.video.qq.com）
- **登录**：QQ 统一登录（ptlogin2.qq.com）
- **渲染**：SSR（服务端渲染）+ CSR（客户端渲染）混合

#### 2.3.2 认证机制全链路

```
用户访问 v.qq.com
    │
    ├─→ 内联脚本执行
    │    ├─→ document.cookie 读取 qq_domain_video_guid_verify / video_guid
    │    ├─→ localStorage.getItem("ams_cookies")      ← ★ 关键发现
    │    └─→ 发起 fetch 到 pbaccess.video.qq.com 带 credentials: "include"
    │
    ├─→ Vue 应用加载
    │    ├─→ vendor-common.js → setStorageItem() 函数
    │    └─→ → 同时写入 localStorage + document.cookie
    │
    └─→ API 响应 → 渲染页面
```

### 2.4 核心发现 1 — `setStorageItem` 双写机制

在 `vendor-common.js`（1.2MB 公共组件包）中发现关键认证函数：

```javascript
setStorageItem: function(key, value) {
    // ① 写入 localStorage
    localStorage.setItem(key, value != null ? value : "");
    
    // ② 同步写入 document.cookie（含过期时间、域、路径）
    var domain = computeDomain();  // 自动计算顶级域
    var expires = new Date();
    expires.setTime(expires.getTime() + 24 * 365 * 60 * 60 * 1000);  // 1年
    document.cookie = key + "=" + value + 
        ";expires=" + expires.toUTCString() + 
        ";path=/;" + (domain ? "domain=" + domain : "");
}
```

**含义**：`localStorage` 和 `document.cookie` 互为冗余备份。仅导出 Cookie 会丢失 localStorage 中的认证状态。

### 2.5 核心发现 2 — `localStorage.ams_cookies` 认证头

页面内联脚本中直接读取 localStorage 并作为 API 请求头发送：

```javascript
try {
    var c = localStorage.getItem("ams_cookies");  // ← localStorage 读认证数据
    if (c) {
        var o = JSON.parse(c);
        s = Object.keys(o).map(function(e){
            return e + "=" + (o[e] || "")
        }).join("; ");
    }
} catch(e) {}

// 发送到后端
fetch("https://pbaccess.video.qq.com/trpc.vector_layout...", {
    method: "POST",
    credentials: "include",                        // ← 携带 HttpOnly Cookie
    body: JSON.stringify({ ... ams_cookies: s, ... })  // ← 同时携带 localStorage 数据
})
```

### 2.6 核心发现 3 — 浏览器指纹绑定

`vendor-common.js` 中包含完整的浏览器指纹采集系统（用于会话合法性校验）：

| 模块 | 指纹项 | 区别（隐身 vs 普通） |
|:-----|:-------|:---------------------|
| `getCanvas` | Canvas 32位哈希 + WebGL 渲染 + 几何图形 | **可能不同**（Canvas 噪声） |
| `getWebgl` | WebGL 供应商 + 渲染器字符串 | **可能不同**（部分驱动行为） |
| `getScreen` | 分辨率 × DPI × 颜色深度 | 相同 |
| `getFonts` | 系统字体列表 + 宽度哈希 | 相同（同一系统） |
| `getOfflineAudioContext` | AudioContext 波形特征 | **可能不同** |
| `getClientHints` | 架构/平台/位数 | 相同 |
| `getIndexedDB` | IndexedDB 可用性 | 相同 |

推断：腾讯系登录系统可能会将会话绑定到浏览器指纹，隐身/普通模式下 Canvas + WebGL + Audio 特征变化会触发重新登录。

### 2.7 Kali Nuclei 安全扫描

| 风险级别 | 发现 | 可利用性 |
|:---------|:-----|:---------|
| ⚠️ 中 | **无 HSTS** —— 存在 TLS 降级攻击面 | 中间人可劫持首次连接 |
| ⚠️ 中 | **无 X-Content-Type-Options** —— MIME 嗅探 | 已加载资源的 MIME 类型可被篡改 |
| ⚠️ 中 | **Cookie 域 `.qq.com` 跨子域共享** | 任何一个子域被攻破可窃取所有 `.qq.com` Cookie |
| ✅ 低 | X-Frame-Options: sameorigin | 防护正常 |
| ✅ 低 | CSP: frame-ancestors *.qq.com | 防护基本正常 |

---

## 三、根因总结

### 根因金字塔

```
                 ┌─────────────────────────┐
                 │  用户看到"未登录"       │
                 │  即使 Cookie 已写入      │
                 └───────────┬─────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
   │ expirationDate│  │ localStorage │  │ 浏览器指纹   │
   │ 未导出(Cookie │  │ ams_cookies  │  │ 绑定可能改变 │
   │ 变Session型)  │  │ 未迁移(丢失) │  │ (Canvas等)   │
   └──────────────┘  └──────────────┘  └──────────────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             ▼
              ┌──────────────────────────┐
              │  后端验证全部不通过       │
              │ Cookie ✓ + localStorage ✗│
              │ + 指纹变化 → 拒绝会话    │
              └──────────────────────────┘
```

### 根因汇总表

| # | 根因 | 严重程度 | 影响范围 | 修复状态 |
|:-:|:-----|:--------:|:---------|:--------:|
| 1 | `expirationDate` 缺失（代码 Bug） | 🔴 高 | 所有网站 | ✅ Phase 1 |
| 2 | `localStorage.ams_cookies` 未迁移（架构限制） | 🔴 高 | 腾讯系站点 | ✅ Phase 2 |
| 3 | `setStorageItem` 双写机制（架构设计） | 🟡 中 | 腾讯系站点 | ✅ Phase 2 |
| 4 | 浏览器指纹绑定（安全设计） | 🟡 中 | 登录检测严格站点 | ⏳ Phase 3 |

---

## 四、安全利用分析

### 4.1 可利用的认证通道

| # | 发现 | 插件利用方式 | 风险等级 |
|:-:|:-----|:------------|:--------:|
| ① | **`setStorageItem` 双写机制** —— localStorage ↔ cookie 自动同步 | content script 读取 localStorage 后在导入侧重新写入，触发双写恢复 cookie | 🟢 低风险 |
| ② | **`localStorage.ams_cookies` 作为 API 认证头** | 通过 `localStorage.setItem("ams_cookies", data)` 直接恢复认证数据通道 | 🟢 低风险 |
| ③ | **`getCookie` 函数读取 `document.cookie`** —— 非 HttpOnly Cookie 通过页面 JS 可读 | 无需额外权限 | 🟢 低风险 |
| ④ | **`qimei`/`q36cookiekey`/`qmuuk` 设备标识持久化在 localStorage** | 同步设备标识避免被判定为新设备导致踢下线 | 🟢 低风险 |

### 4.2 不使用/不推荐的技术

| 技术 | 不推荐原因 |
|:-----|:-----------|
| 劫持/XSS 注入 | ❌ 涉及安全问题，不符合插件定位 |
| 绕过 HSTS 降级 | ❌ 破坏用户安全 |
| 逆向 API 签名算法 | ❌ 违法风险，难以维护 |
| Cookie 硬编码 | ❌ 无法适应动态 Token |
| Session Replay / CSRF | ❌ 涉及安全问题 |

---

## 五、修改摘要

| 文件 | 新增 | 修改 | 说明 |
|:-----|:----:|:----:|:-----|
| `src/background.js` | — | 31行 | 5处 expirationDate + localStorage 路由 |
| `src/content.js` | 58行 | — | 读写接口 + 预置 Key 列表 |
| `src/popup/popup.js` | — | 38行 | 导出自动检测 + 导入自动回写 |
| **合计** | **58行** | **67行** | **3个文件, +125行, -2行** |

---

## 七、未来改进建议

### Phase 3（推荐）

- 通用 localStorage/sessionStorage/IndexedDB 同步框架
- 允许用户自定义需要同步的 localStorage Key
- 支持站点预设（notion.so, 飞书, 钉钉等双写站点）

### Phase 4（可选项）

- IndexedDB 读取/写入（更复杂的认证数据）
- Service Worker Cache 同步
- 会话状态完整性校验


## 六、退出机制分析

### 6.1 退出链路

腾讯视频为 Vue 3 SPA，退出操作不通过标准 HTTP URL 跳转，而是通过前端 SDK 函数调用触发：

```
用户点击「退出登录」
  │
  ├─→ txv.login SDK 调用（nav-login-panel-sdk.js）
  │    └─→ txv.login.logout()
  │         ├─→ addLogoutCallback 注册的回调依次执行
  │         │    ① 清除前端状态（Vuex store、localStorage ams_cookies）
  │         │    ② 调用 TRPC 接口通知服务端销毁 Session
  │         └─→ 页面跳转到登录页
  │
  ├─→ TRPC 请求（pbaccess.video.qq.com）
  │    ├─→ URL: /trpc.vector_layout.xxx
  │    ├─→ 方法: POST
  │    └─→ 请求体: 携带 uin + 登出标记
  │
  └─→ Cookie 清除（前端）
       ├─→ 删除 uin、skey 等 HttpOnly Cookie
       └─→ 清除 localStorage 中的 qimei、ams_cookies 等
```

### 6.2 SDK 函数签名

| 属性 | 值 |
|:-----|:----|
| **SDK 文件** | `nav-login-panel-sdk.js`（`vfiles.gtimg.cn/tvideo/nav-login-panel/dist/sdk/`） |
| **退出函数** | `window.txv.login.logout()`（无参数） |
| **回调注册** | `window.txv.login.addLogoutCallback(fn)` |
| **登录状态检查** | `window.txv.login.isLogin()` |
| **底层协议** | TRPC over HTTP/2（`pbaccess.video.qq.com`） |
| **XHR URL 特征** | `POST /trpc.vector_layout.xxx` — **不含** `logout`/`signout` 等关键词 |

### 6.3 对插件退出保护的影响

| 维度 | 评估 |
|:-----|:------|
| URL 模式拦截 | ❌ **不命中**。TRPC URL 不包含 `logout`、`method=logout` 等关键词 |
| SDK 函数拦截 | ✅ **已覆盖**。运行时重写 `txv.login.logout`，调用时弹退出确认窗 |
| 弹窗选择后 | 断开→本地清 Cookie+刷新；换账号→备份后放行；完全退出→放行原始 SDK 调用 |

### 6.4 边界情况

| 场景 | 表现 |
|:-----|:------|
| SDK 延迟加载 | `txv.login.logout` 可能在页面加载完成后才可用。拦截器在 `interceptKickFunctions()` 部署时检查并重写 |
| 多 Tab 登录 | 退出仅影响当前 Tab，其他 Tab 需各自退出或等 Session 过期 |
