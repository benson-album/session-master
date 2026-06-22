#!/usr/bin/env python3
"""
内置拦截规则库维护脚本（解耦设计）
===============================
单一数据源 → 自动生成 blocking_rules_db.json + blocking_rules.json

用法:
  # 验证规则库完整性
  python3 scripts/update-blocking-rules.py --validate

  # 重新生成 blocking_rules_db.json（从本脚本内置数据）
  python3 scripts/update-blocking-rules.py --generate

  # 更新规则后写入 blocking_rules.json（declarativeNetRequest）
  python3 scripts/update-blocking-rules.py --generate --sync-declarative

  # 添加新站点（交互式）
  python3 scripts/update-blocking-rules.py --add-site

  # 完整流程
  python3 scripts/update-blocking-rules.py --validate --generate --sync-declarative

数据源 = 本脚本底部的 SITES / KEYWORD_LABELS / GENERIC 常量
数据文件 = blocking_rules_db.json（供插件运行时使用）
规则文件 = blocking_rules.json（供 manifest declarativeNetRequest 使用）
"""

import json
import os
import re
import sys
import argparse
from typing import Any

# ========== 路径 ==========
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(PROJECT_ROOT, "src", "blocking_rules_db.json")
DECLARATIVE_PATH = os.path.join(PROJECT_ROOT, "src", "blocking_rules.json")


# ========== 单一数据源 ==========

KEYWORD_LABELS: dict[str, str] = {
    "loginCheck": "登录检测",
    "sessionTimeout": "会话超时",
    "singleLogin": "单点登录冲突",
    "duplicateLogin": "重复登录检测",
    "conflictLogin": "登录冲突",
    "forcedOffline": "强制下线",
    "kickOut": "踢出会话",
    "checkSession": "会话检查",
    "secondLogin": "二次登录提醒",
    "heartbeat": "心跳保活",
    "keepAlive": "保活请求",
}

SITES: list[dict[str, Any]] = [
    {
        "id": "seeyon",
        "name": "致远OA",
        "domains": [
            "*.seeyon.com",
            "*.zumri.cn",
            "*.zumri.com",
        ],
        "keywords": [
            "checkSession",
            "secondLogin",
            "singleLogin",
            "duplicateLogin",
            "conflictLogin",
            "forcedOffline",
            "kickOut",
            "loginCheck",
            "sessionTimeout",
        ],
        "description": "致远OA V9.0+ 踢人检测关键词",
    },
    {
        "id": "dingtalk",
        "name": "钉钉",
        "domains": [
            "*.dingtalk.com",
            "*.dtwork.com",
        ],
        "keywords": [
            "loginCheck",
            "checkSession",
            "singleLogin",
            "kickOut",
        ],
        "description": "钉钉网页版 - 登录检测/会话检查/单点登录/踢出会话",
    },
    {
        "id": "wecom",
        "name": "企业微信",
        "domains": [
            "*.work.weixin.qq.com",
            "*.open.work.weixin.qq.com",
            "*.qyapi.weixin.qq.com",
        ],
        "keywords": [
            "loginCheck",
            "checkSession",
            "singleLogin",
            "forcedOffline",
        ],
        "description": "企业微信管理后台 - 登录检测/会话检查/单点登录/强制下线",
    },
    {
        "id": "feishu",
        "name": "飞书",
        "domains": [
            "*.feishu.cn",
            "*.larksuite.com",
            "*.feishu.net",
        ],
        "keywords": [
            "loginCheck",
            "checkSession",
            "singleLogin",
            "sessionTimeout",
            "forcedOffline",
        ],
        "description": "飞书管理后台 - 登录检测/会话检查/单点登录/超时/强制下线",
    },
    {
        "id": "yuque",
        "name": "语雀",
        "domains": [
            "*.yuque.com",
        ],
        "keywords": [
            "loginCheck",
            "checkSession",
            "singleLogin",
            "sessionTimeout",
        ],
        "description": "语雀知识库 - 登录检测/会话检查/单点登录/会话超时",
    },
    {
        "id": "weaver",
        "name": "泛微OA",
        "domains": [
            "*.weaver.com.cn",
            "*.weaver.cn",
            "*.ecology.com.cn",
            "*.wework.com",
        ],
        "keywords": [
            "checkSession",
            "singleLogin",
            "duplicateLogin",
            "forcedOffline",
            "kickOut",
            "loginCheck",
            "sessionTimeout",
        ],
        "description": "泛微OA/e-cology - 单点登录/强制下线/踢出会话",
    },
    {
        "id": "landray",
        "name": "蓝凌OA",
        "domains": [
            "*.landray.com.cn",
            "*.km.landray.com.cn",
            "*.landray.com",
        ],
        "keywords": [
            "checkSession",
            "singleLogin",
            "duplicateLogin",
            "forcedOffline",
            "loginCheck",
            "sessionTimeout",
        ],
        "description": "蓝凌OA/知识管理系统 - 会话检查/单点登录/强制下线",
    },
    {
        "id": "showdoc",
        "name": "ShowDoc",
        "domains": [
            "*.showdoc.com.cn",
            "*.showdoc.cc",
        ],
        "keywords": [
            "loginCheck",
            "checkSession",
            "sessionTimeout",
        ],
        "description": "ShowDoc 文档系统 - 登录检测/会话检查",
    },
    {
        "id": "wiki",
        "name": "通用知识库",
        "domains": [
            "*.wiki.com",
            "*.wiki",
            "*.wiki.cn",
            "*.confluence.com",
            "*.confluence.cn",
            "*.atlassian.net",
            "*.bookstack.com",
            "*.bookstack.cn",
            "*.dokuwiki.com",
            "*.dokuwiki.cn",
        ],
        "keywords": [],
        "description": "通用知识库系统 - 域名匹配后使用通用关键词",
    },
]

# ⚠️ 添加新站点注意事项：
# 1. id 必须唯一（小写英文，连字符）
# 2. domains 使用 *.example.com 格式（通配子域名）
# 3. keywords 从 KEYWORD_LABELS 中选择，或先在 KEYWORD_LABELS 中添加
# 4. 如果关键词为空（通用站点），需在 GENERIC 中已有对应关键词

GENERIC: list[str] = [
    "loginCheck",
    "sessionTimeout",
    "singleLogin",
    "duplicateLogin",
    "kickOut",
    "forcedOffline",
]


# ========== 校验逻辑 ==========

def validate_sites(sites: list[dict]) -> list[str]:
    """验证站点数据完整性，返回错误列表"""
    errors: list[str] = []
    seen_ids: set[str] = set()

    valid_keywords = set(KEYWORD_LABELS.keys())

    for i, site in enumerate(sites):
        # 必要字段
        for field in ("id", "name", "domains", "keywords"):
            if field not in site:
                errors.append(f"[{i}] 缺少必要字段: {field}")
                continue

        # id 唯一性
        sid = site["id"]
        if sid in seen_ids:
            errors.append(f"[{i}] 重复 id: {sid}")
        seen_ids.add(sid)

        # id 格式
        if not re.match(r"^[a-z][a-z0-9\-_]*$", sid):
            errors.append(f"[{i}] id 格式非法: {sid}（需小写字母开头，仅含 a-z0-9-_）")

        # 域名
        if not site.get("domains"):
            errors.append(f"[{i}] {sid}: domains 为空")
        for d in site.get("domains", []):
            if not d.startswith("*.") and "." not in d:
                errors.append(f"[{i}] {sid}: 域名格式异常: {d}（建议使用 *.example.com）")

        # 关键词
        for kw in site.get("keywords", []):
            if kw not in valid_keywords:
                errors.append(f"[{i}] {sid}: 未知关键词 '{kw}'，请先在 KEYWORD_LABELS 中定义")

    return errors


def validate_decoupling(sites: list[dict], generic: list[str]) -> list[str]:
    """检查数据一致性（解耦约束）"""
    warnings: list[str] = []
    all_keywords = set()
    for site in sites:
        all_keywords.update(site.get("keywords", []))
    all_keywords.update(generic)

    # 检查 KEYWORD_LABELS 中是否有未使用的关键词
    used = set()
    for site in sites:
        used.update(site.get("keywords", []))
    used.update(generic)
    unused = set(KEYWORD_LABELS.keys()) - used
    if unused:
        warnings.append(f"关键词标签中存在未使用的定义: {', '.join(sorted(unused))}")

    # 检查所有域名是否有交集（防止重复匹配）
    domain_counts: dict[str, list[str]] = {}
    for site in sites:
        for d in site.get("domains", []):
            # 提取根域名（*.xxx.xxx → xxx.xxx）
            parts = d.replace("*.", "").split(".")
            if len(parts) >= 2:
                root = ".".join(parts[-2:])
                domain_counts.setdefault(root, []).append(site["id"])

    dupes = {k: v for k, v in domain_counts.items() if len(v) > 1}
    if dupes:
        warnings.append(f"域名根重叠（可能冲突）: {json.dumps(dupes, ensure_ascii=False)}")

    return warnings


# ========== 生成逻辑 ==========

def build_db(sites: list[dict], keywords: dict, generic: list[str], version: int = 1) -> dict:
    """构建完整的规则库 JSON"""
    return {
        "version": version,
        "lastUpdated": "auto",  # 由脚本自动填写当前日期
        "updateUrl": "",
        "keywordLabels": keywords,
        "sites": sites,
        "generic": generic,
    }


def build_declarative_rules(sites: list[dict], generic: list[str]) -> list[dict]:
    """
    从站点关键词生成 declarativeNetRequest 规则。
    规则去重：按 urlFilter 合并，相同的 filter 只保留一个。
    """
    seen_filters: set[str] = set()
    rules: list[dict] = []
    rule_id = 1

    # 收集所有关键词的 urlFilter
    all_keywords: set[str] = set(generic)
    for site in sites:
        all_keywords.update(site.get("keywords", []))

    for kw in sorted(all_keywords):
        # 关键词转 urlFilter：直接使用关键词作为 URL 子串匹配
        url_filter = kw
        if url_filter in seen_filters:
            continue
        seen_filters.add(url_filter)
        rules.append({
            "id": rule_id,
            "priority": 1,
            "action": {"type": "block"},
            "condition": {
                "urlFilter": url_filter,
                "resourceTypes": ["xmlhttprequest", "script", "other"],
            },
        })
        rule_id += 1

    return rules


# ========== CLI ==========

def cmd_generate(version: int, sync_declarative: bool, output_path: str | None = None):
    """生成 blocking_rules_db.json"""
    db = build_db(SITES, KEYWORD_LABELS, GENERIC, version)

    # 更新日期
    from datetime import date
    db["lastUpdated"] = date.today().isoformat()

    target = output_path or DB_PATH
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(target, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"✅ 已生成: {target}")
    print(f"   • {len(db['sites'])} 个站点")
    print(f"   • {len(db.get('generic', []))} 个通用关键词")
    print(f"   • {len(db.get('keywordLabels', {}))} 个关键词标签")

    if sync_declarative:
        rules = build_declarative_rules(SITES, GENERIC)
        with open(DECLARATIVE_PATH, "w", encoding="utf-8") as f:
            json.dump(rules, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"✅ 已同步 declarativeNetRequest: {DECLARATIVE_PATH}")
        print(f"   • {len(rules)} 条规则")


def cmd_validate():
    """校验数据完整性"""
    errors = validate_sites(SITES)
    warnings = validate_decoupling(SITES, GENERIC)

    if errors:
        print("❌ 校验失败:")
        for e in errors:
            print(f"   🔴 {e}")
        sys.exit(1)

    if warnings:
        print("⚠️  警告:")
        for w in warnings:
            print(f"   🟡 {w}")
    else:
        print("✅ 校验通过: 数据完整性、一致性和解耦约束均正确")

    # 统计信息
    total_keywords = sum(len(s.get("keywords", [])) for s in SITES)
    print(f"\n📊 统计:")
    print(f"   • 站点总数: {len(SITES)}")
    print(f"   • 关键词总数: {len(KEYWORD_LABELS)}")
    print(f"   • 已关联关键词: {total_keywords}")
    print(f"   • 通用关键词: {len(GENERIC)}")


def cmd_add_site():
    """交互式添加站点"""
    print("=== 添加新站点 ===\n")
    sid = input("站点 ID（小写英文，如 'wps'）: ").strip()
    if not re.match(r"^[a-z][a-z0-9\-_]*$", sid):
        print("❌ ID 格式非法")
        sys.exit(1)
    if any(s["id"] == sid for s in SITES):
        print(f"❌ ID '{sid}' 已存在")
        sys.exit(1)

    name = input("站点显示名（如 'WPS 稻壳'）: ").strip()
    if not name:
        print("❌ 名称不能为空")
        sys.exit(1)

    print("域名（每行一个，空行结束，格式 *.example.com）:")
    domains = []
    while True:
        d = input("  > ").strip()
        if not d:
            break
        if not d.startswith("*."):
            d = f"*.{d}"
            print(f"    → 已自动补全为 {d}")
        domains.append(d)

    if not domains:
        print("❌ 至少需要一个域名")
        sys.exit(1)

    print(f"\n可用关键词: {', '.join(KEYWORD_LABELS.keys())}")
    print("关键词（逗号分隔，如 'loginCheck,checkSession'）:")
    kw_input = input("  > ").strip()
    keywords = [k.strip() for k in kw_input.split(",") if k.strip()] if kw_input else []

    description = input("描述说明: ").strip() or f"{name} - 待补充"

    # 确认
    print(f"\n📋 预览:")
    print(f"   ID: {sid}")
    print(f"   名称: {name}")
    print(f"   域名: {', '.join(domains)}")
    print(f"   关键词: {', '.join(keywords) or '（无）'}")
    print(f"   描述: {description}")

    confirm = input("\n确认添加？(Y/n): ").strip().lower()
    if confirm and confirm not in ("y", "yes", ""):
        print("已取消")
        sys.exit(0)

    # 添加
    SITES.append({
        "id": sid,
        "name": name,
        "domains": domains,
        "keywords": keywords,
        "description": description,
    })

    # 重新生成
    cmd_generate(version=1, sync_declarative=False)

    # 更新 manifest
    print(f"\n📝 提示: blocking_rules.json 中的规则 ID 已变更，记得重新打包。")
    print(f"   运行 python3 scripts/update-blocking-rules.py --sync-declarative 同步声明式规则。")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="内置拦截规则库维护脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python3 scripts/update-blocking-rules.py --validate
  python3 scripts/update-blocking-rules.py --generate
  python3 scripts/update-blocking-rules.py --generate --sync-declarative
  python3 scripts/update-blocking-rules.py --add-site
        """,
    )
    parser.add_argument("--validate", action="store_true", help="校验数据完整性")
    parser.add_argument("--generate", action="store_true", help="生成 blocking_rules_db.json")
    parser.add_argument("--sync-declarative", action="store_true", help="同时生成 blocking_rules.json")
    parser.add_argument("--add-site", action="store_true", help="交互式添加新站点")
    parser.add_argument("--version", type=int, default=1, help="规则库版本号（默认 1）")
    parser.add_argument("--output", type=str, help="输出路径（默认 src/blocking_rules_db.json）")

    args = parser.parse_args()

    if not any([args.validate, args.generate, args.add_site]):
        parser.print_help()
        sys.exit(1)

    if args.validate:
        cmd_validate()

    if args.generate:
        cmd_generate(args.version, args.sync_declarative, args.output)

    if args.add_site:
        cmd_add_site()
