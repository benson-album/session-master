# Phase 3 — 多站点兼容性扩展规划

> **项目**：SessionMaster · 会话大师  
> **版本**：v1.5.24 → v1.6.0  
> **日期**：2026-06-22  
> **当前状态**：规划阶段

---

## 一、目标

将 SessionMaster 从一个「通用 Cookie 同步工具」升级为「**完整会话迁移引擎**」，覆盖主流视频网站和 SaaS 平台的 Cookie + localStorage + IndexedDB 三层认证数据同步。

---

## 二、已覆盖 vs 待覆盖

### 已确认能工作的（Phase 1+2）

| 站点 | Cookie | localStorage | 备注 |
|:-----|:------:|:------------:|:-----|
| 腾讯视频 v.qq.com | ✅ | ✅ `ams_cookies` | Chrome/Edge 正常模式 |
| 一般网站 (通用) | ✅ | ⚠️ 需预设 | 通用同步 |

### 待研究覆盖

#### 🎬 主流视频平台

| 站点 | 认证方式推测 | 研究优先级 | 备注 |
|:-----|:------------|:----------:|:-----|
| **Bilibili** bilibili.com | Cookie + localStorage + 指纹？ | ⭐⭐⭐ | 国内第二大视频站 |
| **爱奇艺** iqiyi.com | 百度账号体系 | ⭐⭐⭐ | 百度统一登录 |
| **优酷** youku.com | 阿里账号体系 | ⭐⭐⭐ | 淘宝/支付宝登录 |
| **芒果TV** mgtv.com | Cookie + 微信登录 | ⭐⭐ | |
| **Netflix** netflix.com | Cookie + DRM 绑定 | ⭐⭐ | DRM 限制，难度大 |
| **YouTube** youtube.com | Google OAuth + Cookie | ⭐⭐ | Google 强安全策略 |
| **Disney+** disneyplus.com | Cookie + 设备绑定 | ⭐ | DRM + 地理限制 |

#### 📋 SaaS / 办公平台

| 站点 | 认证方式推测 | 研究优先级 | 备注 |
|:-----|:------------|:----------:|:-----|
| **飞书** feishu.cn | Cookie + localStorage Token | ⭐⭐⭐ | 用户在用 |
| **钉钉** dingtalk.com | Cookie + localStorage | ⭐⭐ | |
| **Notion** notion.so | Cookie + localStorage | ⭐⭐ | |
| **语雀** yuque.com | Cookie | ⭐⭐ | 阿里系 |

---

## 三、迭代计划（3 个子阶段）

### Phase 3a — 多站点预设 & 通用 localStorage 框架

**目标**：让插件自动检测并迁移常见站点的 localStorage 认证数据

**改动范围**：
- `content.js`: localStorage 自动发现（不依赖硬编码列表）
- `background.js`: 站点预设配置管理
- `popup.js`: 可视化 localStorage key 管理界面
- 预设规则库：JSON 格式的站点预设（类似 `blocking_rules_db.json`）

**存储结构**：

```json
{
  "site_presets": {
    "v.qq.com": {
      "localStorage": ["ams_cookies", "qimei", "qimei36", "q36cookiekey", "qmuuk"],
      "sessionStorage": [],
      "cookies_domain": [".v.qq.com", ".video.qq.com", ".qq.com", ".film.qq.com"]
    },
    "bilibili.com": {
      "localStorage": ["bili_jct", "DedeUserID", "DedeUserID__ckMd5", "sessdata", "buvid3"],
      "cookies_domain": [".bilibili.com"]
    }
  }
}
```

**UI 改动**：
- 导出结果区域显示检测到的 localStorage keys
- 新增「管理站点预设」设置页
- 用户可以添加自定义 localStorage key 到预设

### Phase 3b — IndexedDB 同步（技术验证）

**目标**：探索 IndexedDB 内认证数据的读取与写入

**技术难点**：
1. Content script 不能直接访问页面 IndexedDB？（实际上可以，同源策略允许）
2. Chrome 扩展的 `chrome.storage` 与页面 IndexedDB 独立
3. IndexedDB 数据量大，需要增量同步策略
4. 序列化复杂（Blob、ArrayBuffer、Date 等类型）

**验证步骤**：
1. 先对 Bilibili 做逆向分析，确认是否使用 IndexedDB 存储认证数据
2. 在 content.js 中添加 IndexedDB 读取能力
3. 建立 IndexedDB 数据的导出/导入格式规范

### Phase 3c — 兼容性迭代计划文档

**目标**：建立可持续的站点兼容性迭代流程

**文档结构**：
- 每个目标站点的认证机制分析（类似本次腾讯视频的报告）
- 兼容性路线图（按优先级排期）
- 测试方法（chrome.cookies、document.cookie、localStorage、IndexedDB）
- 回归测试清单

---

## 四、技术方案对比

| 方案 | 复杂度 | 维护成本 | 效果 | 推荐 |
|:-----|:------:|:--------:|:----:|:----:|
| 硬编码 localStorage key 列表 | ⭐ | 高（需持续更新） | 好 | ❌ |
| 自动发现所有 localStorage keys | ⭐⭐ | 低 | 可能包含噪音 | ✅ |
| 站点预设 JSON 规则库 | ⭐⭐⭐ | 中 | 精准可控 | ✅ |
| IndexedDB 全量导出 | ⭐⭐⭐⭐⭐ | 高 | 不确定 | ⏳ 待验证 |
| 用户自定义 key 管理 UI | ⭐⭐⭐ | 中 | 灵活 | ✅ 可选 |

---

## 五、建议执行顺序

```
 Phase 3a ─→ 自动发现 localStorage keys
     │
     ▼
 站点预设 JSON 规则库 ─→ 批量覆盖主流视频站
     │
     ▼
 用户自定义 Key 管理 UI ─→ 灵活扩展
     │
     ▼
 Phase 3b ─→ IndexedDB 验证 ─→ 决定是否纳入
     │
     ▼
 Phase 3c ─→ 兼容性迭代计划文档
```

---

## 六、待决策事项

| # | 问题 | 选择 |
|:-:|:-----|:-----|
| 1 | localStorage 自动发现：导出时检测页面上**所有** localStorage keys？还是只检测预设列表？ | 推荐：两阶段——先自动扫描全部，再按预设白名单过滤 |
| 2 | 站点预设规则库：单独 JSON 文件还是内嵌在 content.js？ | 推荐：单独 JSON 文件，类似 blocking_rules_db.json 模式 |
| 3 | IndexedDB 同步：先做 Bilibili 验证还是先做通用框架？ | 推荐：先验证 Bilibili，确认有价值后再做通用框架 |
| 4 | 用户自定义 key UI：放在 popup 还是 options page？ | 推荐：options page（chrome.runtime.openOptionsPage） |
