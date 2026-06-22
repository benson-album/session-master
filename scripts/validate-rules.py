#!/usr/bin/env python3
"""验证 blocking_rules_db.json 的完整性和一致性"""
import json, sys

def validate(path):
    errors = []
    warnings = []

    with open(path) as f:
        db = json.load(f)

    # 顶层字段
    for field in ['version', 'updateUrl', 'keywordLabels', 'sites', 'generic']:
        if field not in db:
            errors.append("缺少顶层字段: " + field)
    if 'keywordLabels' in db and not isinstance(db['keywordLabels'], dict):
        errors.append("keywordLabels 应为对象")
    if 'sites' in db and not isinstance(db['sites'], list):
        errors.append("sites 应为数组")
    if 'generic' in db and not isinstance(db['generic'], list):
        errors.append("generic 应为数组")
    if errors:
        return errors, warnings

    version = db.get('version', 0)
    if not isinstance(version, int) or version < 1:
        errors.append("version 应为正整数，当前: " + str(version))

    update_url = db.get('updateUrl', '')
    if not update_url:
        warnings.append("updateUrl 为空 → 远程同步功能不可用")
    elif not update_url.startswith('http'):
        warnings.append("updateUrl 格式异常（非 http 开头）: " + update_url)

    # 收集全部引用关键词
    all_keywords = set(db.get('generic', []))
    sites = db.get('sites', [])
    for site in sites:
        for kw in site.get('keywords', []):
            all_keywords.add(kw)

    label_keys = set(db.get('keywordLabels', {}).keys())
    unlabeled = sorted([kw for kw in all_keywords if kw not in label_keys])
    if unlabeled:
        errors.append("以下关键词在 keywordLabels 中缺少中文标签: " + ", ".join(unlabeled))

    unused = sorted([k for k in label_keys if k not in all_keywords])
    if unused:
        warnings.append("以下 keywordLabels 条目未被任何站点引用: " + ", ".join(unused))

    # 站点校验
    if len(sites) == 0:
        warnings.append("sites 数组为空，无任何站点规则")

    seen_ids = {}
    for i, site in enumerate(sites):
        prefix = "sites[" + str(i) + "]"
        name = site.get('name', '?')

        for field in ['id', 'name', 'domains']:
            if field not in site:
                errors.append(prefix + " [" + name + "] 缺少必需字段: " + field)

        sid = site.get('id', '')
        if not sid:
            errors.append(prefix + " [" + name + "] id 为空")
        elif sid in seen_ids:
            errors.append(prefix + " id 重复: '" + sid + "'（与 sites[" + str(seen_ids[sid]) + "] 重复）")
        else:
            seen_ids[sid] = i

        domains = site.get('domains', [])
        if not domains:
            errors.append(prefix + " [" + name + "] domains 为空")
        for d in domains:
            if not d:
                errors.append(prefix + " [" + name + "] 域名不能为空")
            elif not d.startswith('*.') and '.' not in d.replace('*', ''):
                warnings.append(prefix + " [" + name + "] 域名 '" + d + "' 建议以 *. 开头")

        for kw in site.get('keywords', []):
            if kw not in label_keys:
                errors.append(prefix + " [" + name + "] 引用未定义关键词: '" + kw + "'")

    # generic 校验
    for kw in db.get('generic', []):
        if kw not in label_keys:
            errors.append("generic 引用未定义关键词: '" + kw + "'")

    return errors, warnings


def print_result(errors, warnings, path):
    import os
    PASS = 0; FAIL = 0; WARN = 0

    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    RED = '\033[0;31m'
    NC = '\033[0m'

    print()
    print("═══════════════════════════════════════════")
    print("  规则库文件校验")
    print("  文件: " + path)
    print("═══════════════════════════════════════════")
    print()

    if os.path.exists(path):
        print("  ✅ 文件存在")
        PASS += 1
    else:
        print("  ❌ 文件不存在: " + path)
        FAIL += 1
        return PASS, FAIL, WARN

    try:
        with open(path) as f:
            db = json.load(f)
        print("  ✅ JSON 格式")
        PASS += 1
    except json.JSONDecodeError as e:
        print("  ❌ JSON 格式: " + str(e))
        FAIL += 1
        return PASS, FAIL, WARN

    for e in errors:
        print(f"  {RED}✗{NC} {e}")
        FAIL += 1
    for w in warnings:
        print(f"  {YELLOW}⚠{NC} {w}")
        WARN += 1

    # 统计
    db = json.load(open(path))
    version = db.get('version', '?')
    n_sites = len(db.get('sites', []))
    all_kws = set(db.get('generic', []))
    for s in db.get('sites', []):
        for kw in s.get('keywords', []):
            all_kws.add(kw)
    print()
    print(f"  📊 版本 v{version} · {n_sites} 站点 · {len(all_kws)} 关键词 · {len(db.get('generic', []))} 通用规则")
    print()
    print("─────────────────────────────────────────")
    if FAIL > 0:
        print(f"  结果: {RED}{FAIL} 失败 {WARN} 警告 {PASS} 通过{NC}")
    elif WARN > 0:
        print(f"  结果: {YELLOW}{WARN} 警告 {PASS} 通过{NC}")
    else:
        print(f"  结果: {GREEN}全部通过{NC}（{PASS} 项）")
    print("─────────────────────────────────────────")
    return PASS, FAIL, WARN


if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else 'src/blocking_rules_db.json'
    errors, warnings = validate(path)
    PASS, FAIL, WARN = print_result(errors, warnings, path)
    sys.exit(1 if FAIL > 0 else 0)
