# Changelog

## v1.6.9 (2026-06-24)
- 🐛 **退出保护一直不生效的根因修复**：interceptKickFunctions() 中 Object.defineProperty(location.href) 外层有 try 无 catch，Chrome 内容脚本中修改 location 抛异常后函数崩溃，SDK 注入和 DOM 拦截代码均未执行到
- 🐛 DOM 点击拦截改为独立部署在 init() 中，与 interceptKickFunctions() 解耦
- 🐛 代码质量审计修复 6 项（DOM 点击去重、DEFAULT_SYNC_CONFIG 引用修复、force 路径补充、tabs.sendMessage catch、CSS class 补充、backupCookies 端口处理）

## v1.6.8 (2026-06-24)
- 🐛 退出保护 SDK 拦截改用 Object.defineProperty，兼容 writable:false 的防篡改属性
- 🐛 新增 DOM 点击拦截兜底：document.addEventListener 在捕获阶段拦截「退出账号」按钮点击，不依赖 SDK 函数名

## v1.6.7 (2026-06-24)
- 🐛 SDK 退出拦截恢复原始函数时捕获并传入原始参数，适配各 SDK 不同签名（腾讯视频 `{showConfirmDialog}`、B站 `(callback, url)` 等）

## v1.6.6 (2026-06-24)
- 🐛 退出保护 SDK 拦截因 isolated world 隔离不生效：改为注入 `<script>` 标签到页面 DOM 实现
- 🐛 exitCurrentSystem 拦截同有 isolated world 问题，改为 `<script>` 注入
- 🐛 修复后生效站点：腾讯视频 (txv.login.logout)、B站 (Ke.logout)、致远OA (exitCurrentSystem)

## v1.6.5 (2026-06-24)
- 🚪 **退出保护增强**：新增页面跳转退出拦截（window.location.href 赋值）
- 🚪 新增 SDK 退出函数拦截：运行时重写 txv.login.logout（腾讯视频）、Ke.logout（B站）
- 🚪 补充退出模式：passport://logout、action=logout、/sso/logout、accounts/logout、login/logout

## v1.6.4 (2026-06-24)
- 🚪 **退出保护功能首发**：拦截 XHR 退出请求，三选项确认弹窗
- 🔍 **运行时代码指纹检测**：detectOAFingerprint() 不依赖域名规则库，自动识别致远 OA V9
- 🛡️ 双路径拦截激活：域名规则库匹配（快路径）+ 代码指纹检测（兜底）

## v1.6.3 (2026-06-24)
- 🔍 **运行时代码指纹检测**：新增 detectOAFingerprint()，自动识别致远 OA V9 等标准化产品
- 🚪 退出保护：退出URL拦截 + exitCurrentSystem函数重写
- 🖥️ 拦截Tab新增退出保护独立开关

## v1.6.2 (2026-06-24)
- 🛡️ **XHR 响应拦截（[LOGOUT] 前缀检测）**：解决致远 OA V9.0SP1 等使用 AJAX 响应投毒方式踢入的 OA 系统
- 🛡️ **竞态条件修复**：content.js blockingEnabled 默认 false，先查后台再部署，消除误拦截窗口
- 🛡️ **DNR 规则动态管理**：从静态规则集改为跟随 masterEnabled 开关联动
- 🏗️ **manifest.json 移除 declarative_net_request 静态规则集声明**
- 🏗️ **background.js 新增 updateBuiltinDNRRules()**
- 🔧 **blocking_rules_db.json v2→v3**，标注 [LOGOUT] XHR 响应前缀模式
- 📘 **新增 致远OA 踢人检测深度分析报告**
- 📘 **升级 5 份站点分析报告至腾讯视频方法论深度**

## v1.6.1 (2026-06-22)
- 💄 **localStorage 管理面板 UI 修复**：长值溢出截断（text-overflow: ellipsis），管理按钮支持展开/收起切换，关闭面板自动重置
- 📋 **预设列表完整展示**：所有本地存储 Key 和 Cookie 前缀不再被截断隐藏

## v1.5.14 (2026-06-21)
- 🎨 **导入 Cookie 不再移除保活记录**：粘贴导入和文件导入改为复合操作 `importWithCookieClear`，清除旧 Cookie 后导入新 Cookie 时保活记录保留不变（ID/状态/alarm 全保留），普通「清除」按钮行为不变

## v1.5.13 (2026-06-20)
- 🏷️ **术语统一：创建/加入「房间」改为「配对」**：UI 文字、API 错误提示全部统一为配对码，内部代码变量名不变
- ✂️ **移除保活卡片上方无用分割线**：卡片间已有间距+阴影，多余线条已删除
- 🐳 **重建 Docker 容器**：同步 deploy/server.js 最新代码
- 🐛 **修复默认地址残留 `{port}` 模板变量**：config.js 三处 `{port}` 从未被替换，导致默认显示字面量，现已改为 `5789`

## v1.5.12 (2026-06-20)
- 🎨 **保活记录按钮对齐修复**：3 个操作按钮（🍪/▶️/✕）固定在每行最右侧，不再随倒计时文字长度变化而左右移动

## v1.5.11 (2026-06-20)
- 🍪 **保活记录新增 Cookie 查看**：每条保活记录增加 🍪 按钮，点击弹窗显示该站点的所有 Cookie 名称/值/属性
- 🏠 **帮助页头部布局调整**：Logo+版本号移至左侧，「📖 使用说明」移至右侧，高度自适应内容
- 📐 **帮助页间距/高度自适应**：顶部间距从 120px 缩小至 70px，侧边栏 stretch 填满浏览器窗口高度
- 📋 **帮助页更新日志同步**：补全 v1.5.8/v1.5.9/v1.5.10/v1.5.11 的变更记录

## v1.5.10 (2026-06-20)
- 🏠 **头部样式优化**：logo 左对齐，「📖 使用说明」移入头部右侧
- 📜 **底部简化**：移除使用说明按钮，改为"本插件仅供学习研究使用"声明文字

## v1.5.9 (2026-06-20)
- 🎨 **帮助页布局优化**：footer 移入内容区域、侧边栏高度自适应浏览器底部、底部间距统一 18px

## v1.5.8 (2026-06-20)
- 🔍 **全面审计修复**：`#netInfoBadge` 缺失元素导致 TypeError、CSS 重复定义、缺失 class 补全（`.hint` `.muted` `.sidebar-link` `.copy-code-btn`）
- 🛡️ **安全加固**：添加 manifest `content_security_policy`、添加 `DEBUG` 开关控制生产日志
- 📋 **帮助页更新日志更新**：补全 v1.5.2~v1.5.7 的日志条目，最新版本更新至 v1.5.7/v1.5.8

## v1.5.7 (2026-06-20)
- 🎨 **帮助页顶部遮挡修复**：导航栏 `top`、`.page-wrapper padding-top`、`scroll-padding-top` 统一增大至 120~150px，确保固定头部下方有充足留白
- 🟦 **「查看更多版本」按钮边框修复**：添加 `border: none`，去掉浏览器默认 `<button>` 黑底大边框
- 🌐 **网卡信息 Promise 封装**：`collectNetworkInfo()` 改用显式 Promise 包裹 `chrome.system.network.getNetworkInterfaces()`，修复部分 Chrome 版本下回调式 API 返回空的问题
- ✅ **强制自检流程建立**：每次构建前自动执行 6 项检查（JS 语法/CSS 花括号/HTML div 平衡/manifest 权限/版本一致性/getCookies 域名清洗）

## v1.5.6 (2026-06-20)
- 🏷️ **导出 Cookie 添加域名标识**：复制/粘贴格式加入 `# Domain: music.163.com` 行，粘贴到另一台设备导入时自动识别目标域名
- 📥 **导入解析器增强**：支持 `# Domain: xxx` 域名标识行识别，同时兼容旧版 `domain=xxx` 格式
- 🎨 **导出结果展示优化**：域名与数量分开展示，文本区顶部域名一目了然
- 🔧 内部重构：提取 `exportCookiesSmart` 的 quickPrefix 变量复用

## v1.5.5 (2026-06-20)
- 🐛 **修复 Cookie 导入/清除 URL 构造 Bug**：当 cookie.domain 以 `.` 开头（如 `.163.com`）时，`${protocol}://${domain}${path}` 生成 `https://.163.com/` 这种**无效 URL**，导致所有导入和清除 API 调用静默失败
- 🐛 **修复 getCookies 域名清洗顺序**：先清洗（去前导点、转小写、剥端口）再添加查询格式，确保所有边界输入正确处理
- 🖥️ **硬件信息全面增强**：新增 CPU 型号（`chrome.system.cpu.getInfo()`）、内存总量（`chrome.system.memory.getInfo()`）、CPU 特性集
- 🌐 **网卡信息重构**：接口按类型分组（有线/无线/VPN/虚拟/回环），显示子网掩码、前缀长度、接口总数
- 🏷️ **智能接口分类**：自动识别 enp（有线）、wlp（无线）、tun/tap（VPN）、docker/br-/veth（虚拟）等接口名
- 🔌 新增 `system.cpu`、`system.memory` 权限
- 📋 日志导出时系统信息、网络信息更丰富清晰
- 🖥️ popup 🖥️ 按钮展示 CPU 型号、内存、网卡分组详情

## v1.5.4 (2026-06-20)
- 🎨 **拦截规则库重构**：站点开关从左侧移到右侧，信息区域更完整
- 🗑️ **移除模式选择**：删除"自动检测/手动管理"模式切换，拦截开关直接控制，操作更直观
- 📋 **日志导出更易发现**：footer 按钮从 📋 改为"📋 导出日志"文字+图标，蓝色高亮
- 🔧 后端简化：移除 `mode` 字段及相关逻辑，拦截判断仅依赖 `masterEnabled` + 站点开关

## v1.5.3 (2026-06-20)
- 🐛 修复同步模块 Bug：`exportCookiesSmart` 中 Cookie 名称被写为值（`name: c.value` → `name: c.name`）
- 📋 **日志信息全面升级**：导出日志时分节展示设备信息、系统信息、浏览器信息、网络信息
- 🖥️ 设备信息增强：CPU 核心、内存、语言、浏览器版本自动收集
- 🌍 新增网络信息收集：通过 `chrome.system.network` API 获取本机非回环 IP 及接口名
- 🆔 设备身份重构：持久存储唯一 ID，动态信息（OS/浏览器/网络）实时收集保持最新
- 📱 popup 🖥️ 按钮显示完整设备详情卡片

## v1.5.1 (2026-06-20)
- 🔧 修复 CSS 文件中 `.btn-link` 缺少闭合 `}` 导致 251 行后所有样式被浏览器丢弃
- 🎨 同步模块布局重构：`sync-group` 改为完整白底卡片，内部 `card-collapsible` 平铺无卡中卡
- 🐛 修复 Kali Chromium 无头浏览器截图测试环境（SSH + Selenium）已验证通过

## v1.5.0 (2026-06-20)
- 🚀 新增在线升级功能（`background.js` + 配置文件控制）
- ⚙️ 统一配置中心（`config.js`），集中管理版本/端口/存储键/升级配置
- 📦 一键安装脚本（`sessionmaster-install.sh` / `.ps1`）：自动安装 Node.js + 注册自启动
- 🎯 帮助页重构：双栏布局（左导航右内容）、更新日志折叠、头部固定
- 🛡️ 推荐规则显示中文标签（蓝色胶囊 + hover 显示原始关键词）
- 🔗 同步模块布局优化：去掉多层嵌套白卡，统一分割线
- 📋 空白标签页检测：锁定 Cookie/保活/P2P/同步操作，显示引导横幅
- 💾 P2P 配置新增保存按钮，与服务器模式对称
- 📌 拦截模块修复：本机网络地址卡片位置还原

## v1.4.0 (2026-06-18)
- 🎨 整体 UI 改版：深蓝色主题、圆角卡片、统一色系统
- ➕ 新增拦截功能 Tab（推荐规则、规则库、自定义规则）
- 🔗 新增同步功能 Tab（P2P 直连 / 服务器模式）
- 🔄 保活功能增强：批量开关、一键删除
- ❤️ 心跳状态实时显示
- 📄 结果框可编辑、复制
- 📱 响应式优化
- ⚠️ 错误提示优化

## v1.3.0
- 新增 Cookie 导入导出功能
- 基础 UI 框架搭建
