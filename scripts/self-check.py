#!/usr/bin/env python3
"""SessionMaster 全局自查（静态 + 数据一致性）。

用法：python3 scripts/self-check.py
退出码：0 = 无严重/中等问题；1 = 存在问题
"""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
issues = []
notes = []


def add(level, area, msg):
    issues.append((level, area, msg))


# ---------- 1. 语法 ----------
for f in ["background.js", "content.js", "config.js", "popup/popup.js", "help/help.js", "server/server.js"]:
    p = SRC / f
    if not p.exists():
        add("🔴", "代码", f"文件缺失: src/{f}")
        continue
    r = subprocess.run(["node", "--check", str(p)], capture_output=True, text=True)
    if r.returncode != 0:
        add("🔴", "代码", f"语法错误 src/{f}: {r.stderr.strip()[:120]}")

for p in sorted(SRC.rglob("*.json")):
    try:
        json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        add("🔴", "数据", f"JSON 非法 {p.relative_to(ROOT)}: {e}")

# ---------- 2. 消息 action 一致性 ----------
bg = (SRC / "background.js").read_text(encoding="utf-8")
popup = (SRC / "popup/popup.js").read_text(encoding="utf-8")
content = (SRC / "content.js").read_text(encoding="utf-8")

handled = set(re.findall(r"case '([A-Za-z0-9_]+)':", bg))
sent = set(re.findall(r"action:\s*'([A-Za-z0-9_]+)'", popup + content))
missing = sorted(a for a in sent if a not in handled)
if missing:
    for a in missing:
        add("🟡", "代码", f"popup/content 发送了 background 未处理的 action: {a}")
else:
    notes.append("消息 action：popup/content 发送的动作全部有 background 处理分支")

# content script 处理的 action
content_handled = set(re.findall(r"message\.action === '([A-Za-z0-9_]+)'", content))
bg_to_content = set(re.findall(r"tabs?\.sendMessage\([^,]+,\s*\{\s*action:\s*'([A-Za-z0-9_]+)'", bg))
for a in sorted(bg_to_content - content_handled):
    add("🔴", "代码", f"background 发给 content 的 action 无人处理: {a}")

# ---------- 3. web_accessible_resources 与实际 fetch ----------
manifest = json.loads((SRC / "manifest.json").read_text(encoding="utf-8"))
war = set()
for block in manifest.get("web_accessible_resources", []):
    war.update(block.get("resources", []))
fetched = set()
for f in ["background.js", "popup/popup.js", "help/help.js", "content.js"]:
    t = (SRC / f).read_text(encoding="utf-8")
    for u in re.findall(r"getURL\('([^']+)'\)", t):
        fetched.add(u.split("#")[0])
for f in sorted(fetched):
    if not any(f == r or (r.endswith("*") and f.startswith(r[:-1])) for r in war):
        add("🟡", "打包", f"fetch(getURL('{f}')) 但未列入 web_accessible_resources（SW 内可用，但一致性存疑）")
    if not (SRC / f).exists():
        add("🔴", "打包", f"fetch 的资源不存在: {f}")

# ---------- 4. 遗留假设 / 文案 ----------
for pat, desc in [
    (r"请先登录", "「请先登录」类文案"),
    (r"未找到该域名的 Cookie", "「未找到 Cookie」类文案"),
]:
    for m in re.finditer(pat, popup + bg):
        pass
hits = [(f, t.count("请先登录")) for f, t in (("popup.js", popup), ("background.js", bg)) if "请先登录" in t]
if hits:
    add("🟡", "界面", f"仍有「请先登录」文案: {hits}（确认是否都合理）")
else:
    notes.append("文案：不再有「请先登录」式误导（无 Cookie ≠ 未登录）")

# ---------- 5. 调试残留 ----------
log_count = {f: t.count("console.log") for f, t in
             (("background.js", bg), ("content.js", content), ("popup.js", popup))}
todo = {}
for f in ["background.js", "content.js", "popup/popup.js"]:
    t = (SRC / f).read_text(encoding="utf-8")
    todo[f] = len(re.findall(r"\b(TODO|FIXME|XXX)\b", t))
if any(todo.values()):
    add("🟢", "代码", f"遗留 TODO/FIXME: {todo}")
notes.append(f"console.log 数量: {log_count}")

# ---------- 6. 帮助文档结构 ----------
helpj = json.loads((SRC / "help/help_content.json").read_text(encoding="utf-8"))
ids_arr = [s["id"] for s in helpj["sections"]]
if helpj["sectionIds"] != ids_arr:
    notes.append(f"help sectionIds 顺序与 sections 数组不同（sectionIds 为侧栏顺序，属正常）: {helpj['sectionIds']}")
nums = []
for s in helpj["sections"]:
    m = re.search(r"<h2>([一二三四五六七八九十]+)、", s["html"])
    nums.append((s["id"], m.group(1) if m else "无编号"))
if not all(n != "无编号" for _, n in nums):
    add("🟡", "文档", f"帮助章节缺编号: {nums}")
cn = "一二三四五六七八九十"
order = [cn.index(n) for _, n in nums if n in cn]
by_sidebar = {sid: cn.index(n) for sid, n in nums if n in cn}
seq = [by_sidebar[sid] for sid in helpj["sectionIds"] if sid in by_sidebar]
if seq != sorted(seq):
    add("🟡", "文档", f"侧栏顺序与章节编号不一致: {list(zip(helpj['sectionIds'], seq))}")
else:
    notes.append("帮助文档：侧栏顺序与章节编号一致")

# ---------- 7. 文档与实现一致性 ----------
detect = json.loads((SRC / "login_detect.json").read_text(encoding="utf-8"))
if detect["probe"]["enabled"] is not False:
    add("🟡", "业务规则", "login_detect.json 的 probe.enabled 非 false，与文档「默认关闭」不符")
else:
    notes.append("业务规则：probe 默认关闭，与文档一致")

design = (ROOT / "docs/design/login-status-detection.md").read_text(encoding="utf-8")
for kw in ["login_detect.json", "exportAuthStorage", "loginPage", "probe"]:
    if kw not in design:
        add("🟡", "文档", f"设计文档未提及 {kw}")

# ---------- 8. 帮助 FAQ 与实现一致 ----------
faq = [s for s in helpj["sections"] if s["id"] == "faq"][0]["html"]
for kw in ["已登录 · 存储", "已登录 · 接口", "待确认"]:
    if kw not in faq:
        add("🟡", "文档", f"FAQ 未覆盖徽标文案「{kw}」")

# popup 实际文案
for kw in ["✓ 已登录 · 存储", "✓ 已登录 · 接口", "? 待确认"]:
    if kw not in popup:
        add("🟡", "界面", f"popup 实际文案与帮助不一致，缺少「{kw}」")

# ---------- 9. README 结构声明 vs 实际 ----------
readme = (ROOT / "README.md").read_text(encoding="utf-8")
declared = re.findall(r"[├└]── ([\w./-]+\.(?:json|js|sh|py|md))", readme)
for d in declared:
    base = Path(d).name
    cand = [SRC / d, ROOT / d, ROOT / "scripts" / d]
    if not any(c.exists() for c in cand) and not list(SRC.rglob(base)):
        add("🟡", "文档", f"README 结构图声明但文件不存在: {d}")

# ---------- 10. 版本四统一 ----------
ver_manifest = manifest["version"]
ver_file = (ROOT / "VERSION").read_text().strip()
cl = json.loads((SRC / "changelog.json").read_text(encoding="utf-8"))
ok = (ver_manifest == ver_file == cl[0]["version"])
if not ok:
    add("🔴", "数据", f"版本不一致 manifest={ver_manifest} VERSION={ver_file} changelog={cl[0]['version']}")
else:
    notes.append(f"版本：manifest / VERSION / changelog 均为 {ver_manifest}")

# ---------- 11. 预设与规则库 ----------
presets = json.loads((SRC / "storage_presets.json").read_text(encoding="utf-8"))
rulesdb = json.loads((SRC / "blocking_rules_db.json").read_text(encoding="utf-8"))
psites = [p.get("domain") for p in presets] if isinstance(presets, list) else list(presets.keys())
rdomains = set()
for s in rulesdb.get("sites", []):
    for d in (s.get("domains") or []):
        rdomains.add(d)
notes.append(f"数据：存储预设 {len(psites)} 条、规则库 {len(rulesdb.get('sites', []))} 站点 / {len(rdomains)} 域名")

# ---------- 输出 ----------
print("=" * 60)
print(" SessionMaster 全局自查报告")
print("=" * 60)
levels = {"🔴": "严重", "🟡": "中等", "🟢": "提示"}
for lv in ["🔴", "🟡", "🟢"]:
    items = [i for i in issues if i[0] == lv]
    if not items:
        continue
    print(f"\n【{levels[lv]}】{len(items)} 项")
    for _, area, msg in items:
        print(f"  - [{area}] {msg}")
print("\n【通过项 / 说明】")
for n in notes:
    print("  ✅", n)
print(f"\n问题合计: 严重 {sum(1 for i in issues if i[0]=='🔴')} / 中等 {sum(1 for i in issues if i[0]=='🟡')} / 提示 {sum(1 for i in issues if i[0]=='🟢')}")

sys.exit(1 if any(i[0] in ("🔴", "🟡") for i in issues) else 0)
