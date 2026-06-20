# 🔐 SessionMaster · 会话大师

**一款通用浏览器扩展，轻松突破网站「单设备登录」限制。**

> 适用于 Matrix 致远 OA V9.0SP1 及其他使用前端踢人机制的企业系统。
> 经验证：大部分 OA 系统的限制是纯前端实现的——服务端其实允许多会话共存。

---

## 📋 项目结构

```
session-master/
├── VERSION               # 当前版本号
├── README.md             # 本文件
├── CHANGELOG.md          # 更新日志
├── src/                  # 插件源代码
│   ├── manifest.json     # 插件清单（Manifest V3）
│   ├── background.js     # Service Worker — Cookie管理、P2P引擎、云同步
│   ├── content.js        # 页面注入脚本 — 拦截JS踢人检测
│   ├── blocking_rules.json  # declarativeNetRequest 内置拦截规则
│   ├── icons/            # 图标
│   │   └── icon128.svg
│   ├── popup/            # 弹出窗口
│   │   ├── popup.html
│   │   ├── popup.js
│   │   └── popup.css
│   ├── help/             # 帮助文档
│   │   └── help.html
│   ├── server/           # 同步服务器（零依赖）
│   │   └── server.js
│   └── deploy/           # Docker 部署文件
│       ├── Dockerfile
│       ├── docker-compose.yaml
│       ├── deploy.sh
│       └── server.js
└── session-master.zip    # 最新发布包（每次构建生成）
```

---

## 🚀 核心功能

| 功能 | 说明 | 实现方式 |
|------|------|----------|
| 🍪 **Cookie 手动同步** | 导出 → 复制 → 导入 | `chrome.cookies` API |
| 🔗 **P2P 直连同步** | 浏览器直连，无需服务器 | WebRTC + 信令服务器 |
| ☁️ **云端自动同步** | 通过中继服务器双向同步 | AES-256-GCM 加密 |
| 🛡️ **踢人拦截** | 阻止前端踢人检测 | declarativeNetRequest + JS 注入 |
| 💓 **会话保活** | 定时心跳请求 | chrome.alarms API |

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

### 文件职责

| 文件 | 行数 | 职责 |
|------|------|------|
| `background.js` | ~626 | Service Worker — Cookie CRUD、P2P 引擎（WebRTC）、服务器模式同步、消息路由 |
| `content.js` | ~133 | 页面注入 — 拦截 `setTimeout`/`setInterval`/`addEventListener` 中的踢人检测 |
| `popup/popup.js` | ~616 | 弹出窗口逻辑 — 双模式切换、P2P 配对 UI、网络地址检测 |
| `popup/popup.html` | ~300 | 弹出窗口 UI — 4 个 Tab（Cookie/同步/拦截/保活） |
| `popup/popup.css` | ~356 | 弹出窗口样式 |
| `server/server.js` | ~382 | 同步服务器 + P2P 信令端点（零依赖 Node.js） |
| `help/help.html` | ~700 | 帮助文档（含下载区、版权声明） |

---

## 🔧 开发指南

### 构建发布包

```bash
cd /opt/projects/session-master
bash scripts/build.sh
```

构建产物：`session-master.zip`（位于项目根目录）

### 插件加载

1. 打开浏览器 → `chrome://extensions`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」→ 选择 `src/` 目录
4. 如加载 `.zip`：直接拖入 `chrome://extensions` 页面

### 关键技术决策

- **Manifest V3**：使用 Service Worker 替代 Background Page
- **P2P 默认**：普通用户无 NAS/域名，P2P 直连零门槛
- **双保险网络地址**：优先 `chrome.system.network`，备用 WebRTC ICE
- **配对码字符集**：`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`（排除 0/O、1/I/L 等易混淆字符）
- **零依赖服务器**：纯 Node.js 内置模块（http、crypto、fs），无需 npm install

### 自定义端口

```bash
# 启动服务器
PORT=5790 node server/server.js

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
- **拦截**：declarativeNetRequest + JS 注入

---

## 📄 许可

© 2026 BenSon.Album (chinasir@qq.com)

仅供学习研究，请遵守相关服务条款。
