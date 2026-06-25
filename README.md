# 🔐 SessionMaster · 会话大师

**一款通用浏览器扩展，轻松突破网站「单设备登录」限制。支持 Cookie 同步、会话保活、踢人拦截、退出保护，以及 localStorage 跨设备迁移。**

> 适用于采用**前端踢人机制**的企业系统和各类网站——大部分系统的限制是纯前端实现的，服务端其实允许多会话共存。
> **经验证：致远 OA V9.0SP1、泛微、蓝凌等标准 OA 产品的踢人机制均可拦截。**

> 当前版本：**v1.6.9**

---

## 📋 项目结构

```
session-master/
├── VERSION                           # 版本号（单数据源：src/manifest.json）
├── README.md                         # 本文件
├── CHANGELOG.md                      # 更新日志（Markdown 格式）
├── scripts/
│   ├── build.sh                      # 构建脚本（含20项自检）
│   ├── release.sh                    # 一键发版（构建+Release+附件）
│   ├── update-blocking-rules.py      # 规则库维护脚本
│   ├── validate-rules.py             # 规则库校验脚本
│   └── validate-rules.sh             # 规则库校验快捷包装
└── src/                              # 插件源代码
    ├── manifest.json                 # 插件清单（Manifest V3）— 版本数据源
    ├── background.js                 # Service Worker — Cookie管理、P2P引擎、云同步、
    │                                 #   加密(AES-256-GCM)、保活、规则库管理、
    │                                 #   拦截模块配置、退出保护、设备身份
    ├── content.js                    # 页面注入 — 踢人拦截、退出保护（四层拦截）、
    │                                 #   代码指纹检测、localStorage读写接口
    ├── config.js                     # 统一配置中心（版本/端口/存储键/升级配置）
    ├── blocking_rules.json           # DNR 拦截规则（动态加载，跟随主开关）
    ├── blocking_rules_db.json        # 拦截规则库（9站点，GitHub 自动同步）
    ├── storage_presets.json          # 站点存储预设库（15站点，可扩展）
    ├── help_content.json             # 帮助文档数据源（GitHub 自动同步）
    ├── changelog.json                # 结构化更新日志（Release body 数据源）
    ├── icons/
    │   └── icon128.svg
    ├── popup/
    │   ├── popup.html                # 弹窗 UI
    │   ├── popup.css                 # 弹窗样式
    │   └── popup.js                  # 弹窗逻辑
    ├── help/
    │   ├── help.html                 # 帮助页（外壳，内容由 help_content.json 驱动）
    │   └── help.js                   # 帮助页逻辑
    ├── server/
    │   └── server.js                 # 同步+P2P信令服务器（零依赖 Node.js）
    ├── scripts/
    │   ├── sessionmaster-install.sh  # Linux/macOS 一键安装脚本
    │   └── sessionmaster-install.ps1 # Windows 一键安装脚本
    ├── deploy/                       # Docker 部署
    │   ├── Dockerfile
    │   ├── docker-compose.yaml
    │   ├── deploy.sh
    │   └── server.js
    └── deploy_debug/
        └── server.js                 # 调试版信令服务器
```

---

## 🚀 核心功能

| 功能 | 说明 | 实现方式 |
|------|------|----------|
| 🍪 **Cookie 手动同步** | 导出 → 复制 → 导入（含域名标识行） | `chrome.cookies` API |
| 🔗 **P2P 直连同步** | 浏览器直连，无需服务器 | WebRTC + 信令服务器 |
| ☁️ **云端自动同步** | 通过中继服务器双向同步 | AES-256-GCM 加密 |
| 🛡️ **踢人拦截** | 阻止前端踢人检测 + [LOGOUT] 响应拦截 | DNR 动态规则 + JS 注入 |
| 🔍 **代码指纹检测** | 不依赖域名，自动识别 OA 产品 | 运行时 JS 特征匹配 |
| 🚪 **退出保护** | 拦截退出请求，三选项确认弹窗 | 四层拦截（DOM/SDK/XHR/href） |
| 💓 **会话保活** | 定时心跳请求 | `chrome.alarms` API |
| 📦 **localStorage 迁移** | 同步 localStorage 中的认证凭据 | Content Script + 后台路由 |
| 🗂️ **站点预设库** | 内置 15 站点 localStorage Key/Cookie 前缀配置 | `storage_presets.json` |
| ⬆️ **自动升级检测** | 自动检测 GitHub 新版本，角标+通知+横幅提示 | 版本对比 + 三层检测 |
| 🔐 **登录状态指示** | 当前站点卡片右侧显示登录状态 | Cookie 分析 + httpOnly 判断 |

---

## 🧠 架构设计

### 同步模式

```
┌─────────────────────────────────────────────────────┐
│                    P2P 直连模式 (默认)                  │
│                                                      │
│  浏览器 A ◄───────── WebRTC 直连 ─────────► 浏览器 B   │
│       │                                              │
│       └──── 信令服务器 (HTTP 长轮询, 仅几十ms) ────┘   │
│                                                      │
├─────────────────────────────────────────────────────┤
│                   服务器模式 (备选)                      │
│                                                      │
│  浏览器 A ◄──── HTTPS 加密上传/下载 ────► 同步服务器   │
│  浏览器 B ◄──── HTTPS 加密上传/下载 ────► 同步服务器   │
│                                                      │
│             数据全程 AES-256-GCM 加密                  │
│             服务器只存密文，无法解密                    │
└─────────────────────────────────────────────────────┘
```

### 数据流程（v1.6+）

```
用户操作 → PopUp
  ├── Cookie 导出/导入 → background.js → chrome.cookies API
  │     └── 域名增强发现（两轮查询 + 父级域自动探测）
  ├── localStorage 同步 → background.js → content.js → window.localStorage
  ├── 保活管理 → background.js → chrome.alarms API
  ├── 拦截管理 → background.js → DNR 动态规则 + content.js JS 注入
  │     ├── 主开关 + 站点开关 + 关键词开关（三层控制）
  │     └── 代码指纹检测（不依赖域名规则库）
  ├── 退出保护 → content.js → 四层拦截（DOM/SDK/XHR/href）
  │     └── 三选项弹窗（仅断开/换账号/完全退出需密码验证）
  ├── 同步管理 → background.js → P2P/服务器/手动三种模式
  │     └── 主从设备模式 + 来源追踪防循环
  └── 存储管理面板 → PopUp 展示 → 预设库 storage_presets.json
```

### 四功能协同防御体系

| 功能组合 | 协同效应 | 防御机制 |
|----------|----------|----------|
| 保活 + Cookie 同步 | 同步来 Cookie 直接可用，保活防止过期 | 来源标签可视化 |
| 拦截 + 保活 | 拦客户端踢人+发心跳防过期，完美互补 | — |
| 保活 + 同步 + 主从 | 主设备保活+同步，从设备只接收 | 主从联动自动暂停保活 |

---

## 💡 站点存储分析

为持续扩展站点兼容性，项目内置了完整的存储体系分析方法论（抽象为可复用技能）。

### 分析工具

| 工具 | 用途 |
|:-----|:------|
| `whatweb` | 快速识别 Web 技术栈 |
| `curl -v` / `curl -sIL` | HTTP 头分析、重定向链追踪 |
| 浏览器 DevTools → Application | 登录态 Cookie/localStorage 采集 |
| Kali Linux + vendor bundle 反编译 | API 签名、设备指纹、反爬机制分析 |

### 分析流程

1. **结构测绘** — 端点发现、重定向链、安全头部
2. **Cookie 体系** — 采集、分类（核心认证/CSRF/设备标识）、HttpOnly 判断
3. **localStorage** — 全量 Key 采集、三级分级（⭐⭐⭐/⭐⭐/⭐）、JSON 嵌套检测
4. **认证体系** — SSO 归属识别、签名机制（Wbi/Mtop/ApiTicket）、设备指纹
5. **文档产出** — 结构化分析报告
6. **预设产出** — 生成 `storage_presets.json` 条目并验证

### 已分析站点

| 站点 | SSO 体系 | 分析报告 | 预设状态 |
|:-----|:---------|:---------|:---------|
| 腾讯视频 v.qq.com | 微信/QQ | ✅ | ✅ `storage_presets.json` |
| 哔哩哔哩 bilibili.com | 自有 SSO | ✅ | ✅ |
| 爱奇艺 iqiyi.com | 百度账号 | ✅ | ✅ |
| 优酷 youku.com | 阿里系 (淘宝) | ✅ | ✅ |
| 飞书 feishu.cn | 自有 SSO | — | ✅ |
| 钉钉 dingtalk.com | 阿里系 | — | ✅ |
| 百度 baidu.com | 百度账号 | ✅ | ✅ |
| Notion | Google/邮箱 | — | ✅ |
| 微博 weibo.com | 自有 SSO | — | ✅ |
| 百度网盘 pan.baidu.com | 百度账号 | ✅ | ✅ |
| 阿里云盘 aliyundrive.com | 阿里系 | ✅ | ✅ |
| 夸克网盘 | 阿里系 | ✅ | ✅ |
| 腾讯微云 | 微信/QQ | ✅ | ✅ |
| 天翼云盘 | 手机号 | ✅ | ✅ |
| 迅雷云盘 | 迅雷账号 | ✅ | ✅ |
| 123云盘 | 手机号/微信 | ✅ | ✅ |
| 奶牛快传 | 邮箱/微信 | ✅ | ✅ |
| 致远OA | — | ✅（踢人检测分析） | ✅ 规则库 |

---

## 🔧 开发指南

### 构建发布包

```bash
cd session-master/
bash scripts/build.sh          # 构建（含20项自检 + 版本一致性 + 规则库校验）
bash scripts/release.sh        # 构建 + 创建 Release + 上传附件
```

构建产物：`session-master-v*.zip`（位于项目根目录）

### 插件加载

1. 打开浏览器 → `chrome://extensions`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」→ 选择 `src/` 目录
4. 如加载 `.zip`：直接拖入 `chrome://extensions` 页面

### 扩展新站点预设

1. 浏览器登录目标站点 → DevTools → Application 采集 Cookie 和 localStorage
2. 按 `docs/analysis/` 下报告模板编写分析文档
3. 编辑 `src/storage_presets.json` 添加条目
4. 运行 `bash scripts/build.sh` 验证 JSON 格式

---

### 关键技术决策

- **Manifest V3**：使用 Service Worker 替代 Background Page
- **P2P 默认**：普通用户无 NAS/域名，P2P 直连零门槛
- **网络信息获取**：WebRTC ICE candidate（`chrome.system.network` 仅限 Chrome App）
- **配对码字符集**：`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`（排除易混淆字符）
- **零依赖服务器**：纯 Node.js 内置模块（http、crypto、fs），无需 npm install
- **本地 JSON + 远程同步**：规则库/帮助文档采用本地数据 + GitHub 自动同步
- **存储预设**：标准化站点配置体系，统一 Cookie / localStorage / 关联域信息
- **退出保护**：默认内置开启，不设 UI 开关，密码规则不在界面公开

### 自定义端口

```bash
# 启动服务器
PORT=5790 node src/server/server.js

# Docker 部署
PORT=5790 docker compose -f src/deploy/docker-compose.yaml up -d
```

---

## 🐳 Docker 部署（NAS/服务器）

详细步骤见帮助文档 `src/help/help.html` 3.1-3.2 节。

```bash
# 快速部署
docker compose -f src/deploy/docker-compose.yaml up -d

# 验证
curl http://localhost:5789/api/health
```

环境变量：
- `PORT`：自定义端口（默认 5789）
- `HOST_PORT`：主机映射端口（默认同 PORT）

---

## 🛠️ 技术栈

- **插件**：Chrome Extension Manifest V3
- **P2P**：WebRTC (RTCPeerConnection + RTCDataChannel)
- **信令**：HTTP 长轮询（集成在 server.js 中）
- **加密**：AES-256-GCM + PBKDF2
- **服务器**：Node.js 零依赖（http / crypto / fs）
- **部署**：Docker (node:22-alpine)
- **拦截**：declarativeNetRequest + JS 注入（含四层退出保护）
- **数据源**：JSON 配置文件 + GitHub Raw 远程同步

---

## 📄 许可

© 2026 BenSon.Album (chinasir@qq.com)

仅供学习研究，请遵守相关服务条款。
