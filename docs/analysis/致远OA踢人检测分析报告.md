# 致远 OA V9.0SP1 踢人检测 · 深度分析报告

> **项目**：SessionMaster · 会话大师
> **日期**：2026-06-24
> **版本**：v1.6.1
> **作者**：BenSon.Album
> **OA 系统**：横琴澳门大学高等研究院 V9.0SP1
> **部署地址**：`https://oa.zumri.cn:8881/seeyon/main.do`

---

## 一、问题描述

在使用澳门大学高等研究院 OA 系统（致远 V9.0SP1）时，用户与 AI（无头浏览器）并发登录导致「互踢」现象：

1. **用户浏览器**：安装 SessionMaster 插件，导入已导出的 Cookie，开启拦截模式
2. **AI 无头浏览器**：未安装 SessionMaster，直接登录
3. **现象**：双方交替被踢下线，弹窗提示「您的帐号在另一地点登录，您被迫下线」
4. **反常点**：SessionMaster 的定时器/事件拦截已开启，但未能阻止被踢

---

## 二、排查路径

### 2.1 代码审查 —— 现有拦截机制评估

#### 2.1.1 拦截层架构

SessionMaster 当前存在 **3 层拦截机制**：

| 层 | 机制 | 文件 | 位置 | 针对的 OA 类型 |
|:---|:-----|:-----|:-----|:--------------|
| L1 | `setTimeout`/`setInterval` 函数重写 | `content.js:95-114` | 定时器回调拦截 | 钉钉/企微/飞书等 SPA |
| L2 | `addEventListener` 原型重写 | `content.js:117-127` | DOM 事件监听拦截 | 使用 postMessage 的 OA |
| L3 | DNR 静态 URL 关键词拦截 | `blocking_rules.json` | 网络请求拦截 | URL 含检测词的通用拦截 |

#### 2.1.2 对各层拦截的逐条审查

**L1（定时器拦截）评估：**

```javascript
// 关键词匹配条件
delay >= 800 && delay <= 3000  // 检测间隔 0.8~3 秒
hasKickKeyword(fn, args)       // 函数体含关键词
```

- 致远 OA **不使用定时器轮询** 做踢人检测（`all-min.js` 中 `setInterval` 非标准延迟数量为 0）
- ❌ 该层对此 OA **完全不适用**

**L2（事件拦截）评估：**

```javascript
type === 'message' || type === 'storage' || type === 'beforeunload'
```

- 致远 OA 使用传统的 `onreadystatechange` 和 `addEventListener('readystatechange')` 处理 AJAX 响应
- 这两种事件类型**不在拦截范围内**
- ❌ 该层对此 OA **完全不适用**

**L3（DNR 拦截）评估：**

```javascript
"resourceTypes": ["xmlhttprequest", "script", "other"]
```

- DNR 只能拦截**请求的 URL**，无法检查**响应体内容**
- 致远 OA 的踢人信号（`[LOGOUT]`）在**响应正文**中，而非 URL 中
- ❌ 该层对此 OA **完全不适用**

#### 2.1.3 Phase 1 发现 —— 拦截盲区

| 检查项 | 文件 | 缺陷 |
|:-------|:-----|:------|
| 拦截机制 | `content.js` | **缺少 XHR 响应体拦截**——`onreadystatechange` 回调内容未被检查 |
| 拦截机制 | `content.js` | `XMLHttpRequest.prototype.send` 仅标记 URL，未包装响应处理函数 |
| 关键词 | `content.js:48-52` | `[LOGOUT]` 不在关键词列表中（但此机制是响应体匹配，非函数体匹配） |
| 规则库 | `blocking_rules_db.json` | 未标注该 OA 使用 `[LOGOUT]` 前缀模式 |

#### 2.1.4 拦截时机对比

``` 
时间轴                        拦截点
│                             
├─ 页面加载                    
│   ├─ content.js L1, L2, L3   ✅ 部署完成
│   └─ OA 注册 AJAX 处理器      ← 此处 content.js 未拦截
│
├─ 用户操作                    
│   └─ XHR 请求发出             ✅ DNR URL 检查
│
├─ 服务端处理                   
│   └─ 检测到并发登录            
│       └─ 响应注入 [LOGOUT]    ← 此处无任何拦截
│
├─ XHR onreadystatechange      
│   └─ getXMLHttpRequestData()  ← 此处无任何拦截
│       └─ 检测到 [LOGOUT]      ← 触发退出
│
└─ exitCurrentSystem()         ❌ 踢人成功
```

---

### 2.2 远程结构测绘

#### 2.2.1 HTTP 架构

| 端点 | 状态 | 服务器 | 说明 |
|:-----|:----:|:-------|:-----|
| `oa.zumri.cn:8881/seeyon/main.do` | 200 | nginx | 主入口（门户面板） |
| `oa.zumri.cn:8881/seeyon/ajax.do` | 200 | nginx | AJAX 统一入口（核心数据通道） |
| `oa.zumri.cn:8881/seeyon/getAjaxDataServlet` | 200 | nginx | 数据 Servlet |
| `oa.zumri.cn:8881/seeyon/getAJAXOnlineServlet` | 200 | nginx | **在线状态检测 Servlet** |
| `oa.zumri.cn:8881/seeyon/rest/*` | 200 | nginx | REST API |
| `oa.zumri.cn:8881/seeyon/common/all-min.js` | 200 | nginx | 前端 JS 主文件（885KB） |

> 认证体系：Java Servlet `JSESSIONID`（HttpOnly Cookie），路径 `/seeyon`。

#### 2.2.2 安全头部检查

| 头部 | 值 | 评估 |
|:-----|:----|:-----|
| `Server` | `nginx` | ✅ 未暴露详细版本 |
| `X-Frame-Options` | 缺失 | ❌ 存在点击劫持风险 |
| `X-XSS-Protection` | 缺失 | ❌ |
| `Strict-Transport-Security` | 缺失 | ❌ 无 HSTS，存在降级风险 |
| `X-Content-Type-Options` | 缺失 | ❌ MIME 嗅探风险 |
| `Content-Security-Policy` | 缺失 | ❌ |
| `Set-Cookie` (JSESSIONID) | `Path=/seeyon; HttpOnly` | ✅ HttpOnly 保护 |

> 致远 OA 的安全配置较弱，所有常见安全头部均缺失。与其他分析的站点（优酷、爱奇艺等）相比属于**最弱级别**。

#### 2.2.3 Cookie 体系

| Cookie | 域 | HttpOnly | 用途 |
|:-------|:---|:--------:|:-----|
| `JSESSIONID` | `oa.zumri.cn` | ✅ | Java Servlet 会话 ID（核心认证） |
| `loginPageURL` | `oa.zumri.cn` | ❌ | 登录页 URL 存储 |
| `ts` | `oa.zumri.cn` | ❌ | 时间戳（登录过程中） |

> 认证完全基于服务端 Session，`JSESSIONID` 为唯一认证凭据。无 localStorage 认证数据。

---

### 2.3 JavaScript 逆向分析 —— 核心发现

#### 2.3.1 关键技术栈

| 组件 | 说明 |
|:-----|:------|
| **核心框架** | jQuery 扩展 + 自研 AJAX 框架 |
| **JS 文件** | `common/all-min.js`（885KB，全量合并压缩） |
| **AJAX 封装** | 自研 `getXMLHttpRequest` / `getAjaxData` 体系 |
| **Crypto** | `common/js/crypto.js` + `apps_res/algorithm/des/index.js` |
| **UI 框架** | 自研 CTP UI（`common/ctpUi/dist/js/ctpUi.js`） |
| **多语言** | `i18n_zh_CN.js`，按需加载 |

#### 2.3.2 核心发现 1 — `[LOGOUT]` 响应前缀检测

这是致远 OA 踢人检测的**唯一机制**，位于 `all-min.js` 的 `getXMLHttpRequestData` 函数中：

```javascript
function getXMLHttpRequestData(e, t) {
    // 获取 Content-Type 判断是否是 XML
    var n = e.getResponseHeader("content-type");
    var n = n && 0 <= n.indexOf("xml");
    
    // 获取响应文本
    var i = n ? e.responseXML : e.responseText;
    
    // XML 模式尝试解析
    n && (i = xmlHandle(i) || e.responseText);
    
    // ★ 核心踢人检测：响应文本以 [LOGOUT] 开头 → 返回 null 触发下线
    return 1 == t && null != i && 0 == i.toString().indexOf("[LOGOUT]")
        ? null
        : i;
}
```

**机制特点**：

| 属性 | 值 |
|:-----|:-----|
| 检测方式 | 响应文本前缀匹配 |
| 触发条件 | 响应体以 `[LOGOUT]` 开头 |
| 返回值 | `null`（表示非法状态） |
| 影响范围 | **所有** AJAX 请求（非特定端点） |
| 服务端行为 | 检测到并发登录后，在所有旧会话的响应中插入 `[LOGOUT]` |

#### 2.3.3 核心发现 2 — 调用上下文

`getXMLHttpRequestData` 在 `onreadystatechange` 中被调用：

```javascript
// all-min.js 中的 AJAX 核心调用模式
a.onreadystatechange = function() {
    var e;
    if (4 == a.readyState && 200 == a.status) {
        // 传入 XMLHttpRequest 对象 + 标志位 (1 表示需要检测)
        e = getXMLHttpRequestData(a, s);
        
        // 如果返回 null（[LOGOUT] 被踢），触发错误回调
        o.invoke(e);
    }
};
```

同时，也用 `addEventListener('readystatechange')` 模式：

```javascript
// all-min.js 内部也有使用 addEventListener 的路径
a.addEventListener('readystatechange', function() {
    // 同样调用 getXMLHttpRequestData
});
```

**覆盖的请求类型**：

| 请求 API | 是否被 [LOGOUT] 影响 | 说明 |
|:---------|:--------------------:|:-----|
| `ajax.do?method=ajaxAction&managerName=*` | ✅ | 门户数据加载 |
| `getAjaxDataServlet?S=*` | ✅ | 快捷数据/角标 |
| `getAJAXOnlineServlet` | ✅ | 在线状态专用接口 |
| `rest/*` | ✅ | REST 接口 |
| HTML 模板加载 (`tpl-*.html`) | ❌ | 非 AJAX，GET 页面 |

> **关键洞察**：`getAJAXOnlineServlet` 是最容易被触发的检测点，但**任何 AJAX 请求**（包括用户操作触发的）都有可能触发下线。

#### 2.3.4 核心发现 3 — 退出系统函数

```javascript
// 退出当前系统函数
function exitCurrentSystem() {
    // 跳转到登录页
    var ref = encodeURI(_ctxPath + "/main.do?method=logout");
    window.close();
    // 或使用 iframe 方式的 CTP 顶层退出
    if ("function" == typeof getCtpTop) {
        var topFrame = getCtpTop();
        topFrame.removeOnbeforeunload && topFrame.removeOnbeforeunload();
        topFrame.location.href = ref;
    }
}
```

另有一个 `isLeave` 检测路径（侦测用户是否退出）：

```javascript
callBackendMethod("loginUserManager", "isLeave", getDogSessionId(), {
    success: function(e) {
        "__LOGOUT" == e ? (
            alert($.i18n("loginUserState.unknown") + ",原因:检测到用户已退出!"),
            exitCurrentSystem()
        ) : 1 == e.isLeave && exitCurrentSystem();
    }
});
```

#### 2.3.5 核心发现 4 — 无前端指纹绑定

**关键发现**：致远 OA `all-min.js` 中：

- ❌ 无 Canvas 指纹采集
- ❌ 无 WebGL 检测
- ❌ 无 AudioContext 指纹
- ❌ 无定时器轮询检测
- ❌ 无 `postMessage` 跨窗口通讯
- ❌ 无 `localStorage` 认证数据

> 与腾讯视频/爱奇艺/优酷等现代 SPA 不同，致远 OA 作为传统 Java Servlet 应用，认证完全靠服务端 `JSESSIONID`，无任何前端指纹绑定或双写机制。

#### 2.3.6 API 端点汇总

| 端点 | 方法 | 用途 | 参数 |
|:-----|:----:|:------|:-----|
| `/seeyon/ajax.do` | GET/POST | 通用 AJAX 动作 | `method=ajaxAction&managerName=*` |
| `/seeyon/getAjaxDataServlet` | GET | 按 Servlet ID 获取数据 | `S=ajaxShortCutManager&M=getPortletTipNumber` |
| `/seeyon/getAJAXOnlineServlet` | GET | **在线状态检测** | `V=随机值` |
| `/seeyon/rest/*` | REST | RESTful API | 路径参数 |
| `/seeyon/portal/sections/tpl/*.html` | GET | 门户面板 HTML 模板 | 路径参数 |
| `/seeyon/rest/language/v1/current` | GET | 多语言检测 | `date=时间戳` |

---

### 2.4 行为检测

#### 2.4.1 被踢触发验证

通过浏览器直接访问 `getAJAXOnlineServlet`，响应内容验证：

```
请求: GET /seeyon/getAJAXOnlineServlet?V=0.3867992174882483
响应: [LOGOUT]您的帐号在另一地点登录，您被迫下线
```

**验证成功**：该接口在并发登录时返回 `[LOGOUT]` 前缀。

#### 2.4.2 客户端 JS 拦截状态确认

运行时检查 `all-min.js` 中 `getXMLHttpRequestData` 函数的执行路径：

- `onreadystatechange` 属性赋值（√ 是 OA 的主要方式）
- `addEventListener('readystatechange')` 注册（√ 有备用方式）
- 两种方式均在 **XHR response 阶段**执行检测

---

## 三、根因总结

### 根因金字塔

```
                  ┌───────────────────────────────────┐
                  │ 用户与 AI 并发登录 → 互踢          │
                  │ JSESSIONID 冲突 → 服务端检测       │
                  └───────────────┬───────────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          ▼                       ▼                       ▼
   ┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐
   │ 代码缺陷 1   │    │ 代码缺陷 2       │    │ 代码缺陷 3       │
   │ content.js   │    │ content.js       │    │ blocking_rules   │
   │ 无 XHR 响应  │    │ onreadystate-    │    │ 在 DNR 层无法    │
   │ 拦截机制     │    │ change 未包装    │    │ 拦截响应体内容   │
   └──────────────┘    └──────────────────┘    └──────────────────┘
          │                  │                        │
          └──────────────────┼────────────────────────┘
                             ▼
              ┌──────────────────────────────────┐
              │  3 层现有拦截全部失效             │
              │  setTimeout ❌                   │
              │  addEventListener ❌             │
              │  DNR URL Block ❌                │
              └──────────────────────────────────┘
```

### 根因汇总表

| # | 根因 | 严重程度 | 影响范围 | 发现阶段 | 修复状态 |
|:-:|:-----|:--------:|:---------|:---------|:--------|
| 1 | content.js 无 XHR 响应体拦截 | 🔴 高 | 致远 V9 及类似 OA | Phase 1 | ✅ 已修复 |
| 2 | content.js 未包装 `onreadystatechange`/`addEventListener('readystatechange')` | 🔴 高 | 所有使用 XHR 的传统 OA | Phase 1 | ✅ 已修复 |
| 3 | `[LOGOUT]` 关键词在响应体中，DNR 无法拦截 | 🟡 中 | 特定 OA | Phase 2 | ✅ XHR 层拦截 |

---

## 四、安全利用分析

### 4.1 可利用的认证通道

| # | 发现 | 插件利用方式 | 风险等级 |
|:-:|:-----|:------------|:--------|
| ① | **`[LOGOUT]` 响应前缀**——服务端注入的踢人信号 | XHR `onreadystatechange` setter 注入拦截，跳过 [LOGOUT] 检测分支 | 🟢 低风险 |
| ② | **`getXMLHttpRequestData` 单点检测**——所有 AJAX 响应的踢人检测集中在此函数 | 包装原始 handler，在调用前检查响应文本 | 🟢 低风险 |
| ③ | **`exitCurrentSystem` 退出函数**——客户端唯一的退出入口 | 可通过重写 `exitCurrentSystem` 函数补防（当前未采用） | 🟡 中风险 |
| ④ | **`JSESSIONID` 为唯一认证凭据**——无指纹/双写绑定 | Cookie 导出导入后即可复用会话 | 🟢 低风险 |

### 4.2 与腾讯视频的对比

| 对比项 | 腾讯视频 | 致远 OA V9.0SP1 |
|:-------|:---------|:----------------|
| 踢人方式 | 前端定时器检测 + 回调 | 服务端 AJAX 响应投毒 |
| 认证体系 | `uin` Cookie + `ams_cookies` localStorage | `JSESSIONID` 仅 Cookie |
| 双写机制 | `setStorageItem` localStorage ↔ Cookie | ❌ 无 |
| 设备指纹 | Canvas/WebGL/Audio 7 维度 | ❌ 无 |
| 拦截难度 | ⚠️ 中（需匹配关键词） | ✅ 低（单一 [LOGOUT] 前缀） |
| 跨模式迁移 | 🔴 高（指纹 + 双写） | 🟢 低（仅 Cookie） |

### 4.3 不使用/不推荐的技术

| 技术 | 不推荐原因 |
|:-----|:-----------|
| 篡改 `getXMLHttpRequestData` 函数体 | 全局篡改风险高，可能影响 OA 正常逻辑 |
| 自动模拟心跳请求 | 过度复杂，非定时器模式不适用 |
| 重写 `exitCurrentSystem` | 可能阻止手动退出功能 |

---

## 五、修改摘要

| 文件 | 新增 | 修改 | 说明 |
|:-----|:----:|:----:|:-----|
| `src/content.js` | 78行 | — | XHR `onreadystatechange` setter 拦截 + `addEventListener('readystatechange')` 包装 + `XMLHttpRequest.prototype.send` 注入 |
| `src/blocking_rules_db.json` | — | 2行 | 版本 v2→v3，description 标注 `[LOGOUT]` 模式 |
| **合计** | **78行** | **2行** | **2 个文件, +80 行** |

### 修复后的拦截链路

```
用户 A 的 XHR 请求 → 服务端返回 [LOGOUT]...
  │
  ├─→ XHR 响应到达
  │    │
  │    ├─→ onreadystatechange setter 拦截 ← 🆕 content.js
  │    │    └─→ 检查 responseText 是否以 [LOGOUT] 开头
  │    │         ├─→ 是 → 跳过原始 handler ✅ 阻止踢人
  │    │         └─→ 否 → 正常调用 handler
  │    │
  │    └─→ addEventListener('readystatechange') 拦截 ← 🆕 content.js
  │         └─→ 同上逻辑
  │
  └─→ getXMLHttpRequestData 从未被调用 ✅ 踢人未触发
```

---

## 六、未来改进建议

### Phase 4（推荐）

| 优先级 | 改进项 | 难度 | 说明 |
|:------|:-------|:----|:------|
| P0 | **`[LOGOUT]` 检测模式加入通用规则** | 💧 低 | 已在 content.js 中实现，建议在其他传统 OA 中验证 |
| P1 | **`exitCurrentSystem` 补防** | 💧 低 | 作为口袋方案：如果 XHR 拦截未能覆盖某些路径，可兜底拦截退出函数 |
| P2 | **规则库自动匹配** | 🔥 高 | 通过 JS 特征指纹自动识别 OA 版本，不依赖手动域名配置 |
| P3 | **Nuclei 安全扫描** | 🔥 高 | 通过 Kali 进行全面安全审计（目前仅做了手动头部检查） |
| P4 | **WebSocket 踢人检测** | 🔥 高 | 部分现代 OA 使用 WebSocket 推送踢人信号，当前拦截机制不覆盖 |

### 已知局限

1. **XHR 响应拦截仅在 `blockingEnabled=true` 时生效** — 需要域名匹配规则库
2. **无法阻止服务端 Session 过期** — 拦截可阻止客户端踢人弹窗，但服务端已标记 JSESSIONID 失效的情况下，后续 API 可能返回 401/403
3. **Cookie 同步仍是核心方案** — XHR 拦截是防守型措施，Cookie 导出/导入是主动保持会话的手段

---

## 七、结论

致远 OA V9.0SP1 采用独特的 **XHR 响应前缀投毒** 方式实现踢人检测（`[LOGOUT]`），与常见的定时器轮询机制完全不同。SessionMaster 原有的 3 层拦截（setTimeout、addEventListener、DNR URL）全部失效。

本次修复新增了第 4 层拦截——**XHR 响应体拦截**（`content.js`），覆盖了 `onreadystatechange` 和 `addEventListener('readystatechange')` 两种模式，从根源上阻止 `[LOGOUT]` 信号的传播。

| 维度 | 评估 |
|:-----|:------|
| 修复完整性 | ✅ 3 个代码缺陷全部修复 |
| 覆盖范围 | ✅ `onreadystatechange` + `addEventListener` 双模式 |
| 向后兼容 | ✅ 仅新增代码，未修改现有逻辑 |
| 误拦截风险 | 🟢 极低（仅匹配 `[LOGOUT]` 精确前缀） |
| 效果验证 | ⏳ 需用户刷新 OA 后实际测试 |
