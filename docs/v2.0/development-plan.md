# SessionMaster v2.0 — 开发计划

> **版本**：v2.0-draft
> **关联文档**：`PRD.md` · `test-plan.md`
> **估算工时**：约 9-12 小时（分 3 个开发批次）

---

## 1. 任务依赖关系

```
批次1：基础设施
  T1 数据迁移逻辑（background.js）
  T2 全局设置存储（v2_global）
  T3 站点管理存储（v2_sites）
  │
批次2：UI 重构
  T4 站点选择器（popup.html + popup.js）
  T5 会话管理 Tab 重构
  T6 同步管理 Tab 重构
  T7 全局设置 Tab（新建）
  │
批次3：收尾
  T8 锁定规则适配新架构
  T9 自检（9 项）
  T10 构建 + 浏览器测试
  T11 文档更新 + 版本发布
```

---

## 2. 任务分解

### 批次1：基础设施（约 3 小时）

#### T1：background.js — 数据迁移逻辑

| 属性 | 值 |
|------|-----|
| 文件 | `src/background.js` |
| 类型 | 新增函数 |
| 估算 | 1 小时 |

**变更**：
- `onInstalled` 中检测旧版存储键
- 新增 `migrateV1toV2()` 函数
- 读取 `heartbeat_configs`、`sync_config`、`server_sync_config`、`device_identity`
- 合并为 `v2_sites` 数组 + `v2_global` 对象
- 写入 `v2_migrated` 标记防重复
- **不删除旧键**

**验收**：MIG-1 ~ MIG-8 全部通过

#### T2：background.js — 全局设置读写

| 属性 | 值 |
|------|-----|
| 文件 | `src/background.js` |
| 类型 | 新增/改造 message handler |
| 估算 | 30 分钟 |

**变更**：
- 新增 `getGlobalConfig` / `saveGlobalConfig` handler
- 存储键 `v2_global`
- 内容：signalUrl, serverUrl, p2pDeviceName, serverDeviceName, syncInterval, deviceIdentity

**验收**：GLB-2 ~ GLB-3 通过

#### T3：background.js — 站点管理

| 属性 | 值 |
|------|-----|
| 文件 | `src/background.js` |
| 类型 | 新增 message handler |
| 估算 | 30 分钟 |

**变更**：
- 新增 `getSites` / `addSite` / `removeSite` / `updateSite` handler
- 存储键 `v2_sites`
- 每个站点独立存储 heartbeats 和 sync 配置

**验收**：SEL-1 ~ SEL-5 通过

---

### 批次2：UI 重构（约 4 小时）

#### T4：站点选择器组件

| 属性 | 值 |
|------|-----|
| 文件 | `src/popup/popup.html` + `src/popup/popup.js` |
| 类型 | 新增 |
| 估算 | 1 小时 |

**变更**：
- HTML：新增 `.site-selector` 下拉组件，位于 Tab 上方
- JS：加载站点列表、切换事件、添加新站点弹窗
- 跨 Tab 共享选中状态（全局变量 `activeSite`）

**验收**：SEL-1 ~ SEL-6 通过

#### T5：会话管理 Tab 重构

| 属性 | 值 |
|------|-----|
| 文件 | `src/popup/popup.html` + `src/popup/popup.js` + `src/popup/popup.css` |
| 类型 | 重写 |
| 估算 | 1.5 小时 |

**变更**：
- 从 v1.x 的 `#tab-session` 合并 `#tab-blocker` 内容
- Cookie 区域：导出/导入/清除（保活作为子区域展示）
- 保活区域：视觉上从属于 Cookie
- 拦截区域：主开关 + 推荐规则 + 规则库 + 自定义规则
- 所有数据按 `activeSite` 过滤

**验收**：SES-1 ~ SES-11 通过

#### T6：同步管理 Tab 重构

| 属性 | 值 |
|------|-----|
| 文件 | `src/popup/popup.html` + `src/popup/popup.js` |
| 类型 | 重写 |
| 估算 | 1 小时 |

**变更**：
- 主从设备开关 + 身份切换
- P2P / 服务器 radio 二选一
- P2P 配置区（创建/加入/断开/同步开关）
- 服务器配置区（配对码/注册/同步开关）
- 立即同步按钮
- 同步记录（按 activeSite 过滤）
- 本机网络地址（保持不变）

**验收**：SYN-1 ~ SYN-12 通过

#### T7：全局设置 Tab（新建）

| 属性 | 值 |
|------|-----|
| 文件 | `src/popup/popup.html` + `src/popup/popup.js` |
| 类型 | 新建 |
| 估算 | 30 分钟 |

**变更**：
- HTML 新增 `#tab-global` 内容区
- 同步服务器配置（信令地址/服务器地址/设备名称/同步间隔）
- 设备身份展示
- 使用说明 + 导出日志 + 更新检查（从 footer 移入或保留）

**验收**：GLB-1 ~ GLB-7 通过

---

### 批次3：收尾（约 3.5 小时）

#### T8：锁定规则适配新架构

| 属性 | 值 |
|------|-----|
| 文件 | `src/popup/popup.js` |
| 类型 | 修改 `setDomainDependentState` |
| 估算 | 30 分钟 |

**验收**：LCK-1 ~ LCK-8 通过

#### T9：帮助文档重写（help.html + help.js）

| 属性 | 值 |
|------|-----|
| 文件 | `src/help/help.html` + `src/help/help.js` |
| 类型 | 重写 |
| 估算 | 1 小时 |

**变更**：
- 章节结构按 v2.0 新 UI 重组
- 原「四、踢人拦截」「五、会话保活」独立大章 → 归入「会话管理」章节
- 新增「全局设置」章节
- 新增站点选择器使用说明
- 同步章节按 主从→传输方式 重新组织
- 帮助页操作步骤与 v2.0 UI 保持一致

**验收**：HLP-1 ~ HLP-10 全部通过

#### T10：README + Skill 文档更新

| 属性 | 值 |
|------|-----|
| 文件 | `README.md` + 技能文档 |
| 类型 | 修改 |
| 估算 | 30 分钟 |

**验收**：RDM-1 ~ RDM-6 + SKL-1 ~ SKL-4 通过

#### T11：9 项强制自检

| 属性 | 值 |
|------|-----|
| 类型 | 检查 |
| 估算 | 30 分钟 |

**验收**：9 项全部通过

#### T12：构建 + 浏览器测试

| 属性 | 值 |
|------|-----|
| 类型 | 测试 |
| 估算 | 1 小时 |

**验收**：test-plan.md 全部用例通过（含一致性验证 CON-1~7）

#### T13：版本号 + 发布

| 属性 | 值 |
|------|-----|
| 类型 | 发布 |
| 估算 | 15 分钟 |

**变更**：
- CHANGELOG.md + changelog.json 新增 v2.0.0
- VERSION + 6 处版本号 → 2.0.0
- Git commit + tag + push + Release

**验收**：BLD-1 ~ BLD-8 全部通过

---

## 3. 变更文件汇总

| 文件 | 变更类型 | 估算 |
|------|:--------:|:----:|
| `src/background.js` | 改（+迁移逻辑 + alarm 按站点 + P2P 按站点隔离） | **3h** |
| `src/popup/popup.html` | 重写（三 Tab + 站点选择器 + 全局设置） | 2.5h |
| `src/popup/popup.js` | 重写（状态管理 + 事件绑定 + 锁定规则） | 3h |
| `src/popup/popup.css` | 改（新增样式） | 0.5h |
| `src/help/help.html` | 重写（章节结构按新架构重组） | 1h |
| `src/help/help.js` | 改（更新锚点/引用） | 15min |
| `README.md` | 改（版本号/架构图/功能表） | 15min |
| Skill 文档 | 改（项目结构更新） | 15min |
| `CHANGELOG.md` | 追加 | 5min |
| `src/changelog.json` | 追加 | 5min |
| 版本号文件 × 6 | 改 | 5min |

**核心变更**：7 个源文件 + 3 个文档文件，净新增约 800-1200 行代码。

---

## 4. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|:----:|:----:|:----:|------|
| 数据迁移 bug 导致用户配置丢失 | 低 | 🔴 高 | 旧键保留，`onInstalled` 可回滚 |
| popup.html 重构导致 div 嵌套错误 | 中 | 🟡 中 | 自检第3项强制检查 |
| 锁定规则遗漏/过度 | 中 | 🟡 中 | test-plan TC-LCK 全覆盖 |
| 浏览器兼容性（ES Module import） | 低 | 🟡 中 | 已有 Chrome/Edge 验证 |
| 迁移后保活定时器未恢复 | 低 | 🟡 中 | `onInstalled` 中恢复 alarm |
