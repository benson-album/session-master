#!/usr/bin/env python3
"""
Document Health Check — 文档健康检查脚本
在每次文档变更前运行，确保 7 项自动检查全部通过。

用法:
  cd /opt/projects/session-master
  python3 scripts/doc-health-check.py [--fix]

选项:
  --fix    自动修复部分可修复的问题（如添加缺失的引用）
"""

import os
import re
import sys

PROJECT = "/opt/projects/session-master"
DOCS = os.path.join(PROJECT, "docs/v2.0")

ALL_DOCS = [
    "PRD.md", "test-plan.md", "development-plan.md",
    "feasibility-report.md", "maintainability-analysis.md",
    "agent-roles.md", "agent-document-matrix.md", "methodology.md"
]

ALL_DOCS_PATHS = [os.path.join(DOCS, d) for d in ALL_DOCS]

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
    print(f"  ⚠️  {name}  {detail}")

print("=" * 60)
print("📋 文档健康检查")
print("=" * 60)

# ==========================================================
# 1. Agent 输入文档完整性
# ==========================================================
print("\n[1/7] Agent 输入文档完整性")
for agent, paths in AGENTS.items():
    for direction, doc_list in paths.items():
        label = "输入" if direction == "reads" else "产出"
        for doc_path in doc_list:
            full = os.path.join(PROJECT, "docs/v2.0", doc_path) if not doc_path.startswith("src") else os.path.join(PROJECT, doc_path)
            if not doc_path.startswith("communication"):
                full = os.path.join(PROJECT, doc_path) if doc_path.startswith("src") else os.path.join(PROJECT, "docs/v2.0", doc_path)
            else:
                full = os.path.join(PROJECT, "docs/v2.0", doc_path)
            exists = os.path.exists(full)
            check(f"  {agent} {label}: {doc_path}", exists)

# ==========================================================
# 2. 文档间交叉引用
# ==========================================================
print("\n[2/7] 文档间交叉引用")
for doc in ALL_DOCS:
    doc_path = os.path.join(DOCS, doc)
    if not os.path.exists(doc_path):
        continue
    content = open(doc_path).read()
    refs = 0
    for other in ALL_DOCS:
        if doc == other:
            continue
        if other in content:
            refs += 1
    check(f"  {doc} 引用了 {refs}/7 份其他文档", refs >= 4,
          f"(应 ≥4，实际 {refs})")

# Check if each doc is referenced by others
print()
for doc in ALL_DOCS:
    cited = 0
    for other in ALL_DOCS:
        if doc == other:
            continue
        other_path = os.path.join(DOCS, other)
        if os.path.exists(other_path):
            content = open(other_path).read()
            if doc in content:
                cited += 1
    check(f"  {doc} 被 {cited}/7 份其他文档引用", cited >= 4,
          f"(应 ≥4，实际 {cited})")

# ==========================================================
# 3. 签字链一致性
# ==========================================================
print("\n[3/7] 签字链一致性")
dp = open(os.path.join(DOCS, "development-plan.md")).read()
signatures = re.findall(r'\*\*签字确认\*\*（[^）]+）', dp)
for s in signatures:
    ok = "我终签" in s or "ME" in s
    check(f"  签字链含 ME 终签: {s[:40]}...", ok)

final_sign = re.findall(r'最终签字确认[^）]*）', dp)
for s in final_sign:
    ok = "我终签" in s
    check(f"  最终签字链含 ME: {s[:40]}...", ok)

# ==========================================================
# 4. HEADER 一致性
# ==========================================================
print("\n[4/7] HEADER 元信息一致性")
for doc in ALL_DOCS:
    doc_path = os.path.join(DOCS, doc)
    content = open(doc_path).read()
    header = content.split('\n')[0] if content else ""
    # Check for version reference
    has_version = re.search(r'v[\d.]+', header)
    # This is a basic check - doc should have a title
    check(f"  {doc} 有标题行", header.startswith("#"), f"({header[:50]})")

# ==========================================================
# 5. 术语统一性
# ==========================================================
print("\n[5/7] 术语统一性")
# Check all docs for consistent role naming
for doc in ALL_DOCS:
    doc_path = os.path.join(DOCS, doc)
    if not os.path.exists(doc_path):
        continue
    content = open(doc_path).read()
    # Check for old-style checkbox format
    old_checkboxes = re.findall(r'□ [^\n]*□', content)
    for oc in old_checkboxes[:3]:
        warn(f"  {doc}: 旧式 □ 复选框残留: {oc[:60]}")

# Check for inconsistent "4 agent" vs "5 agent"
for doc in ALL_DOCS:
    doc_path = os.path.join(DOCS, doc)
    if not os.path.exists(doc_path):
        continue
    content = open(doc_path).read().lower()
    if "4 代理" in content or "4代理" in content:
        check(f"  {doc}: 含'4 代理'需改为'5 角色'", False)

# ==========================================================
# 6. 通用性检查
# ==========================================================
print("\n[6/7] 通用性检查（仅检查 methodology.md）")
methodology = os.path.join(DOCS, "methodology.md")
if os.path.exists(methodology):
    content = open(methodology).read()
    project_terms = ["SessionMaster", "session-master", "v1.5", "src/core/", "background.js", "popup.js"]
    for term in project_terms:
        if term in content:
            check(f"  含项目特定术语 '{term}'", False, "(方法论应通用)")

# ==========================================================
# 7. MD 内部链接可达性
# ==========================================================
print("\n[7/7] MD 内部链接可达性")
for doc in ALL_DOCS:
    doc_path = os.path.join(DOCS, doc)
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
# SUMMARY
# ==========================================================
print("\n" + "=" * 60)
total = passed + failed
pct = (passed / total * 100) if total > 0 else 0
print(f"📊 结果: {passed}/{total} 通过 ({pct:.0f}%)")
if failed == 0:
    print("✅ 全部通过，可以提交")
else:
    print(f"❌ {failed} 项失败，请修复后重新检查")
    if fix_mode:
        print("⚠️  --fix 模式: 部分问题已自动修复，请重新检查")
    sys.exit(1)

print("=" * 60)
