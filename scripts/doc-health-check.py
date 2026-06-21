#!/usr/bin/env python3
"""
Document Health Check — 文档健康检查脚本
自适应检测当前分支存在哪些版本文档。

用法:
  cd /opt/projects/session-master
  python3 scripts/doc-health-check.py [--fix]

选项:
  --fix    自动修复部分可修复的问题
"""

import os
import re
import sys

PROJECT = "/opt/projects/session-master"

# ==========================================================
# 版本感知：检测哪些版本目录存在
# ==========================================================
VERSION_DIRS = {}
for name in ["v1.x", "v2.0"]:
    d = os.path.join(PROJECT, "docs", name)
    if os.path.isdir(d):
        VERSION_DIRS[name] = d

has_version_docs = bool(VERSION_DIRS)
process_docs_dir = os.path.join(PROJECT, "docs/process")

# ==========================================================
# Agent 定义（仅在 v2.0+ 有效）
# ==========================================================
AGENTS = {
    "ME": {"reads": ["development-plan.md", "communication/coordination/"],
           "writes": ["methodology.md", "communication/coordination/"]},
    "PM": {"reads": ["development-plan.md", "feasibility-report.md", "src/"],
           "writes": ["communication/task-cards/", "communication/sign-offs/", "communication/coordination/"]},
    "PD": {"reads": ["PRD.md", "test-plan.md", "development-plan.md"],
           "writes": ["communication/design-reviews/", "PRD.md"]},
    "DE": {"reads": ["PRD.md", "development-plan.md", "feasibility-report.md", "test-plan.md",
                      "communication/test-reports/", "communication/defects/"],
           "writes": ["communication/impl-reports/", "src/"]},
    "QA": {"reads": ["test-plan.md", "PRD.md", "development-plan.md", "src/"],
           "writes": ["communication/test-reports/", "communication/defects/"]}
}

passed = 0
failed = 0
warnings = []
fix_mode = "--fix" in sys.argv


def check(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"  ✅ {name}")
    else:
        failed += 1
        print(f"  ❌ {name}  {detail}")


def warn(name, detail=""):
    warnings.append((name, detail))
    print(f"  ⚠️  {name}  {detail}")


def get_docs_list(version_dir):
    docs = []
    for f in sorted(os.listdir(version_dir)):
        fp = os.path.join(version_dir, f)
        if os.path.isfile(fp) and f.endswith(".md") and f != "INDEX.md":
            docs.append(f)
    return docs


def process_docs():
    docs = []
    if os.path.isdir(process_docs_dir):
        for f in sorted(os.listdir(process_docs_dir)):
            fp = os.path.join(process_docs_dir, f)
            if os.path.isfile(fp) and f.endswith(".md"):
                docs.append(f)
    return docs


print("=" * 60)
version_info = ", ".join(VERSION_DIRS.keys()) if VERSION_DIRS else "无版本文档目录（传统开发模式）"
print(f"📋 文档健康检查（版本: {version_info}）")
print("=" * 60)

# ==========================================================
# 按版本运行检查
# ==========================================================
for ver_name, ver_dir in sorted(VERSION_DIRS.items()):
    all_docs = get_docs_list(ver_dir)
    all_docs_paths = [os.path.join(ver_dir, d) for d in all_docs]

    print(f"\n{'=' * 50}")
    print(f"📁 [{ver_name}] 版本检查")
    print(f"{'=' * 50}")

    if not all_docs:
        print("  (该版本无文档文件，跳过)")
        continue

    # --- 1. Agent 输入文档完整性 ---
    print(f"\n[1/7] Agent 输入文档完整性 ({ver_name})")
    for agent, paths in AGENTS.items():
        for direction, doc_list in paths.items():
            label = "输入" if direction == "reads" else "产出"
            for doc_path in doc_list:
                if doc_path.startswith("src/"):
                    full = os.path.join(PROJECT, doc_path)
                elif doc_path.startswith("communication/"):
                    full = os.path.join(ver_dir, doc_path)
                else:
                    full = os.path.join(ver_dir, doc_path)
                exists = os.path.exists(full)
                if doc_path.startswith("communication/"):
                    if exists:
                        check(f"  {agent} {label}: {doc_path}", True)
                    else:
                        warn(f"  {agent} {label}: {doc_path} 尚未创建（开发启动后创建）")
                else:
                    check(f"  {agent} {label}: {doc_path}", exists)

    # --- 2. 文档间交叉引用 ---
    if len(all_docs) > 1:
        print(f"\n[2/7] 文档间交叉引用 ({ver_name})")
        for doc in all_docs:
            doc_path = os.path.join(ver_dir, doc)
            if not os.path.exists(doc_path):
                continue
            content = open(doc_path).read()
            refs = 0
            for other in all_docs:
                if doc == other:
                    continue
                if other in content:
                    refs += 1
            other_count = len(all_docs) - 1
            check(f"  {doc} 引用了 {refs}/{other_count} 份其他文档", refs >= max(3, other_count // 2),
                  f"(应 ≥{max(3, other_count // 2)}，实际 {refs})")
        print()
        for doc in all_docs:
            cited = 0
            for other in all_docs:
                if doc == other:
                    continue
                other_path = os.path.join(ver_dir, other)
                if os.path.exists(other_path):
                    content = open(other_path).read()
                    if doc in content:
                        cited += 1
            other_count = len(all_docs) - 1
            check(f"  {doc} 被 {cited}/{other_count} 份其他文档引用", cited >= max(3, other_count // 2),
                  f"(应 ≥{max(3, other_count // 2)}，实际 {cited})")
    else:
        print(f"\n[2/7] 文档间交叉引用 ({ver_name})")
        print("  (只有 1 份文档，无需检查交叉引用)")

    # --- 3. 签字链一致性 ---
    print(f"\n[3/7] 签字链一致性 ({ver_name})")
    dp_candidates = [d for d in all_docs if "development" in d.lower() or "dev" in d.lower() or "plan" in d.lower()]
    for dp_name in dp_candidates:
        dp_path = os.path.join(ver_dir, dp_name)
        if not os.path.exists(dp_path):
            continue
        content = open(dp_path).read()
        signatures = re.findall(r'\*\*签字确认\*\*（[^）]+）', content)
        for s in signatures:
            ok = "我终签" in s or "ME" in s
            check(f"  签字链含 ME 终签 ({dp_name}): {s[:40]}...", ok)
        final_sign = re.findall(r'最终签字确认[^）]*）', content)
        for s in final_sign:
            ok = "我终签" in s
            check(f"  最终签字链含 ME ({dp_name}): {s[:40]}...", ok)

    # --- 4. HEADER 一致性 ---
    print(f"\n[4/7] HEADER 元信息一致性 ({ver_name})")
    for doc in all_docs:
        doc_path = os.path.join(ver_dir, doc)
        content = open(doc_path).read()
        header = content.split('\n')[0] if content else ""
        check(f"  {doc} 有标题行", header.startswith("#"), f"({header[:50]})")

    # --- 5. 术语统一性 ---
    print(f"\n[5/7] 术语统一性 ({ver_name})")
    for doc in all_docs:
        doc_path = os.path.join(ver_dir, doc)
        if not os.path.exists(doc_path):
            continue
        content = open(doc_path).read()
        old_checkboxes = re.findall(r'□ [^\n]*□', content)
        for oc in old_checkboxes[:3]:
            warn(f"  {doc}: 旧式 □ 复选框残留: {oc[:60]}")
        content_lower = content.lower()
        if "4 代理" in content_lower or "4代理" in content_lower:
            check(f"  {doc}: 含'4 代理'需改为'5 角色'", False)

    # --- 6. 通用性检查 ---
    print(f"\n[6/7] 通用性检查 ({ver_name})")
    for doc in all_docs:
        doc_path = os.path.join(ver_dir, doc)
        if not os.path.exists(doc_path):
            continue
        doc_lower = doc.lower()
        content = open(doc_path).read()
        if "methodology" in doc_lower or "method" in doc_lower:
            project_terms = ["SessionMaster", "session-master", "v1.5", "src/core/", "background.js", "popup.js"]
            for term in project_terms:
                if term in content:
                    check(f"  方法论 {doc} 含项目特定术语 '{term}'", False, "(方法论应通用)")

    # --- 7. MD 内部链接可达性 ---
    print(f"\n[7/7] MD 内部链接可达性 ({ver_name})")
    for doc in all_docs:
        doc_path = os.path.join(ver_dir, doc)
        if not os.path.exists(doc_path):
            continue
        content = open(doc_path).read()
        links = re.findall(r'\[([^\]]+)\]\(([^)]+)\)', content)
        for text, link in links:
            if link.startswith('http') or link.startswith('#') or link.startswith('mailto:'):
                continue
            base = os.path.dirname(doc_path)
            target = os.path.normpath(os.path.join(base, link))
            if not os.path.exists(target):
                check(f"  {doc}: 死链接 [{text}]({link})", False)

# ==========================================================
# 过程文档检查（版本无关）
# ==========================================================
process_files = process_docs()
if process_files:
    print(f"\n{'=' * 50}")
    print(f"📁 [process/] 版本无关文档检查")
    print(f"{'=' * 50}")
    print(f"\n[+] 经验教训文档")
    ll_path = os.path.join(process_docs_dir, "lessons-learned.md")
    if os.path.exists(ll_path):
        content = open(ll_path).read()
        has_version_mgmt = "版本管理策略" in content
        check("  lessons-learned.md 包含版本管理章节", has_version_mgmt)
        has_branch_strategy = "分支策略" in content
        check("  lessons-learned.md 包含分支策略", has_branch_strategy)

# ==========================================================
# SUMMARY
# ==========================================================
print("\n" + "=" * 60)
total = passed + failed
pct = (passed / total * 100) if total > 0 else 0
print(f"📊 结果: {passed}/{total} 通过 ({pct:.0f}%)")
if warnings:
    print(f"\n⚠️  警告 ({len(warnings)} 条):")
    for name, detail in warnings:
        print(f"     {name}: {detail}")
if failed == 0:
    print("✅ 全部通过，可以提交")
else:
    print(f"❌ {failed} 项失败，请修复后重新检查")
    if fix_mode:
        print("⚠️  --fix 模式: 部分问题已自动修复，请重新检查")
    sys.exit(1)

if VERSION_DIRS:
    print(f"\n📌 已检查版本: {', '.join(sorted(VERSION_DIRS.keys()))}")
else:
    print("\n📌 当前分支无版本专用文档目录（传统开发模式，仅检查 process/）")
print("=" * 60)
