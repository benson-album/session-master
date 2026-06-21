# SessionMaster v2.0 — 开发计划

> **版本**：v2.0-rc1
> **关联文档**：`PRD.md` · `test-plan.md` · `standard-development-process.md`
> **估算工时**：约 60 分钟（含验证和发布）

---

## 1. 任务依赖关系图

```
T1 阻礙项修复（btnP2pSaveConfig 校验）
 │
 T2 锁定规则重写（lockedEls + inputIds）
 │
 ├──→ T3 空白页横幅文案优化
 │
 T4 自检（9 项强制）
 │
 T5 构建 + 安装到浏览器测试
 │
 T6 文档更新（CHANGELOG + changelog.json）
 │
 T7 版本号更新 + 推送发布
```

---

## 2. 任务分解

### T1：修复 btnP2pSaveConfig 校验缺失（阻礙项）

| 属性 | 值 |
|------|-----|
| 文件 | `src/popup/popup.js` |
| 位置 | 第 915-926 行 |
| 类型 | 新增代码 |
| 估算 | 5 分钟 |
| 依赖 | 无 |

**变更**：在 `signalUrl` 校验之后增加 `p2pDeviceName` 校验：

```javascript
const p2pDeviceName = document.getElementById('p2pDeviceName').value.trim();
if (!p2pDeviceName) return showToast('⚠️ 请输入设备名称');
```

**验收标准**：
- `btnP2pSaveConfig` 在 `p2pDeviceName` 为空时阻止保存并 toast 提示
- 设备名称有值时正常保存

---

### T2：锁定规则重写

| 属性 | 值 |
|------|-----|
| 文件 | `src/popup/popup.js` |
| 位置 | 第 1828-1875 行（`setDomainDependentState` 函数） |
| 类型 | 删除 + 注释更新 |
| 估算 | 10 分钟 |
| 依赖 | 无 |

**变更**：

```
lockedEls 从 18 项 → 8 项（删除第一层+第二层，仅保留第三层）
inputIds 从 9 项 → 1 项（仅保留 heartbeatUrl）
```

**lockedEls 保留项**：
```javascript
var lockedEls = [
    // 第三层：站点操作（依赖 currentDomain）
    'btnExport', 'btnImport', 'btnClear',
    'btnAddHeartbeat',
    'btnLoadCookies',
    'btnP2pFillDomain', 'btnFillSyncDomain',
];
```

**inputIds 保留项**：
```javascript
var inputIds = [
    'heartbeatUrl',
];
```

**额外保留锁定**：
```javascript
// btnFillUrl — 填入当前 URL（需 URL）
// heartbeatInterval — 随保活同行锁定
```

**验收标准**：
- 空白页下：第一/二层全部解锁，第三层全部锁定
- 正常页面下：全部解锁（与 v1.x 一致）
- 元素矩阵全表对照无遗漏（PRD 附录 12）

---

### T3：空白页横幅文案优化

| 属性 | 值 |
|------|-----|
| 文件 | `src/popup/popup.html` |
| 位置 | 第 25-31 行（`blankPageBanner`） |
| 类型 | 文案修改 |
| 估算 | 5 分钟 |
| 依赖 | T2（确认锁定分层后再定文案措辞） |

**变更**：将现有单行文案改为两段式。

**验收标准**：
- 空白页下显示分两段的引导文案
- 正常页面下横幅隐藏（不受影响）

---

### T4：自检（9 项强制）

| 属性 | 值 |
|------|-----|
| 类型 | 检查 |
| 估算 | 10 分钟 |
| 依赖 | T1 + T2 + T3 完成 |

**检查项**：
1. `node --check src/popup/popup.js`
2. CSS 花括号平衡（如涉及 CSS 修改）
3. HTML 标签平衡
4. manifest 权限+引用文件检查
5. 版本一致性
6. `getCookies` 域解析 9 用例
7. 更新日志同步
8. 选择器一致性（CSS rename 同步 JS 引用）— **特别注意 lockedEls/inputIds 的 id 与 HTML 一致**
9. 元素类型一致性

**验收标准**：9 项全部通过。

---

### T5：构建 + 浏览器测试

| 属性 | 值 |
|------|-----|
| 类型 | 测试 |
| 估算 | 15 分钟 |
| 依赖 | T4 通过 |

**操作步骤**：
1. `bash scripts/build.sh`
2. 加载 `src/` 目录到浏览器（Chrome/Edge）
3. 执行 test-plan.md 中的：
   - 所有 TC-L1 ~ TC-L3（空白页锁定测试）
   - 所有 TC-N（回归测试）
   - TC-S（阻礙項修复验证）
4. 记录测试结果

**验收标准**：
- 构建脚本返回 0
- 测试通过率 100%

---

### T6：文档更新

| 属性 | 值 |
|------|-----|
| 文件 | `CHANGELOG.md` + `src/changelog.json` |
| 类型 | 追加 |
| 估算 | 5 分钟 |
| 依赖 | T5 验证通过 |

**CHANGELOG.md 新增**：
```markdown
## v2.0.0 (2026-06-21)
- 🏗️ **架构重构：三层锁定模型** — 将锁定规则分为全局设备层、同步连接层、站点操作层
- 🟢 **空白页体验大幅提升**：服务器地址、设备名称、配对码、P2P配对、同步开关等 22 个元素不再锁定
- 🔒 **新增 btnP2pSaveConfig 设备名称校验**：防止空白页下空值覆盖已有配置
- 📄 **空白页横幅增强**：分两段展示可配置项和需导航后操作项
```

**验收标准**：构建后 help 页更新日志正确渲染 v2.0.0 条目。

---

### T7：版本号更新 + 发布

| 属性 | 值 |
|------|-----|
| 类型 | 发布 |
| 估算 | 10 分钟 |
| 依赖 | T6 完成 |

**版本号变更**：v1.5.14 → **v2.0.0**

**更新文件**（6 处）：
```
VERSION                  → 2.0.0
src/manifest.json        → "version": "2.0.0"
src/config.js            → VERSION: '2.0.0'
src/popup/popup.html     → v2.0.0
src/help/help.html ×2    → hero + footer 版本号
```

**发布流程**：
1. Git add + commit — `"v2.0.0: 架构重构——三层锁定模型"`
2. Git tag — `v2.0.0`
3. Push to GitHub
4. Create Release + 上传 zip
5. 标记为 Latest

**验收标准**：GitHub Release v2.0.0 可下载，构建 zip 版本显示 2.0.0。

---

## 3. 变更文件汇总

| 文件 | 变更类型 | 任务 |
|------|:--------:|:----:|
| `src/popup/popup.js` | 改（+3行） | T1：btnP2pSaveConfig 校验 |
| `src/popup/popup.js` | 改（-15行） | T2：锁定列表重写 |
| `src/popup/popup.html` | 改（文案） | T3：空白页横幅 |
| `CHANGELOG.md` | 追加 | T6：更新日志 |
| `src/changelog.json` | 追加 | T6：更新日志数据 |
| `VERSION` | 改 | T7：版本号 |
| `src/manifest.json` | 改 | T7：版本号 |
| `src/config.js` | 改 | T7：版本号 |
| `src/popup/popup.html` | 改 | T7：版本号 |
| `src/help/help.html` | 改×2 | T7：版本号 |

**净变更**：6 个文件（含版本号），核心逻辑变更仅 3 个文件。

---

## 4. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|:----:|:----:|:----:|---------|
| 锁定列表有遗漏/多余元素 | 中 | 中 | test-plan.md L1/L2/L3 测试全覆盖 + 对照 PRD 附录矩阵逐条检查 |
| 空白页下 P2P 创建导致误报错 | 低 | 低 | 已有 try/catch + 前端校验，不影响功能 |
| 版本号更新漏文件 | 低 | 低 | 构建脚本自带版本一致性检查，不一致会报错 |
| 用户习惯变化不适应 | 中 | 低 | 功能完全不变，只是解锁更多元素；更新日志说明清楚 |
