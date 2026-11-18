#!/usr/bin/env python3
"""版本一致性校验 / 自动同步（项目无关，纯标准库，可在任何仓库里直接用）。

校验三处是否与"版本唯一源"一致：
  1. README 里带版本含义的行（含「版本 / version」字样的行）中的 vX.Y.Z
  2. CHANGELOG.md 顶条 `## vX.Y.Z`（或 `# vX.Y.Z` / `### vX.Y.Z`）
  3. 可选的 changelog.json 顶条（浏览器扩展常见）

版本唯一源的探测顺序（第一个存在的胜出）：
  src/manifest.json → manifest.json → package.json → VERSION

用法：
  python3 check-version-consistency.py              # 只校验，不一致则退出码 1
  python3 check-version-consistency.py --fix        # 自动修正 README，并按 changelog.json 补 CHANGELOG.md 顶条
  python3 check-version-consistency.py --json       # 机器可读输出（给 CI / 其它 AI 用）
  python3 check-version-consistency.py --root DIR   # 指定项目根（默认：本脚本上一级目录）

退出码：0 = 一致（或已修正）  1 = 不一致  2 = 找不到版本源
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

VERSION_SOURCES = ("src/manifest.json", "manifest.json", "package.json", "VERSION")
CHANGELOG_JSON_CANDIDATES = ("src/changelog.json", "changelog.json")
CHANGELOG_MD_CANDIDATES = ("CHANGELOG.md", "CHANGELOG.MD", "Changelog.md")
README_CANDIDATES = ("README.md", "readme.md", "Readme.md")

SEMVER = r"\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.\-]+)?"
# README 里"带版本含义"的行：出现这些词才算，避免误改 "Node v20.0.0" 之类的环境要求
VERSION_WORD = re.compile(r"版本|version|Version|VERSION")
# 形如 v1.2.3 或 **v1.2.3**，保留其前后修饰
TOKEN = re.compile(rf"(\*\*)?[vV]({SEMVER})(\*\*)?")


def find_first(root: Path, names) -> Path | None:
    for name in names:
        p = root / name
        if p.is_file():
            return p
    return None


def read_version(root: Path) -> tuple[str, Path]:
    for rel in VERSION_SOURCES:
        p = root / rel
        if not p.is_file():
            continue
        if p.name == "VERSION":
            v = p.read_text(encoding="utf-8").strip()
        elif p.suffix == ".json":
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
            except (ValueError, OSError):
                continue
            v = str(data.get("version") or "").strip()
        else:
            continue
        if re.fullmatch(SEMVER, v or ""):
            return v, p
    raise SystemExit(f"找不到可用的版本唯一源（试过 {', '.join(VERSION_SOURCES)}）")


def first_changelog_heading(text: str) -> tuple[str, int, int] | None:
    """返回 (版本号, 起始偏移, 该行结束偏移)，只看前 60 行，跳过标题行。"""
    offset = 0
    for i, line in enumerate(text.splitlines(keepends=True)):
        if i > 60:
            break
        m = re.match(rf"^#{{1,4}}\s*[vV]?({SEMVER})\b", line.rstrip("\n"))
        if m:
            return m.group(1), offset, offset + len(line)
        offset += len(line)
    return None


def readme_sync(path: Path, version: str, *, fix: bool) -> tuple[bool, list[str]]:
    text = path.read_text(encoding="utf-8")
    stale: list[str] = []

    def repl(m: re.Match) -> str:
        bold_l, found, bold_r = m.group(1) or "", m.group(2), m.group(3) or ""
        if found == version:
            return m.group(0)
        stale.append(found)
        return f"{bold_l}v{version}{bold_r}"

    out_lines = []
    for line in text.splitlines(keepends=True):
        if VERSION_WORD.search(line):
            out_lines.append(TOKEN.sub(repl, line))
        else:
            out_lines.append(line)
    new_text = "".join(out_lines)
    if not stale:
        return True, []
    if fix and new_text != text:
        path.write_text(new_text, encoding="utf-8")
    return False, sorted(set(stale))


def changelog_md_sync(path: Path, version: str, entry: dict | None, *, fix: bool) -> tuple[bool, str]:
    text = path.read_text(encoding="utf-8")
    found = first_changelog_heading(text)
    if found and found[0] == version:
        return True, found[0]
    current = found[0] if found else "(无)"
    if fix and entry:
        block = render_entry(entry)
        if found:
            text = text[: found[1]] + block + text[found[1] :]
        else:
            text = text.rstrip("\n") + "\n\n" + block
        path.write_text(text, encoding="utf-8")
    return False, current


def render_entry(entry: dict) -> str:
    ver = str(entry.get("version"))
    date = str(entry.get("date") or "").strip()
    head = f"## v{ver}" + (f" ({date})" if date else "")
    lines = [head]
    items = entry.get("items") or {}
    if isinstance(items, dict):
        for cat, vals in items.items():
            for item in vals or []:
                lines.append(f"- {cat}：{item}")
    elif isinstance(items, list):
        for item in items:
            lines.append(f"- {item}")
    return "\n".join(lines) + "\n\n"


def main() -> int:
    ap = argparse.ArgumentParser(description="版本一致性校验 / 自动同步")
    ap.add_argument("--root", default=None, help="项目根目录（默认：当前工作目录，找不到版本源再退回脚本所在项目）")
    ap.add_argument("--check", action="store_true", help="只校验，不改文件（默认行为）")
    ap.add_argument("--fix", action="store_true", help="自动修正 README，并按 changelog.json 补 CHANGELOG.md 顶条")
    ap.add_argument("--changelog-json", default=None, help="changelog.json 路径（默认自动探测）")
    ap.add_argument("--json", action="store_true", dest="as_json", help="输出 JSON")
    args = ap.parse_args()

    if args.root:
        root = Path(args.root).resolve()
    else:
        root = Path.cwd().resolve()
        try:
            read_version(root)
        except SystemExit:
            root = Path(__file__).resolve().parent.parent
    version, source = read_version(root)

    changelog_json = Path(args.changelog_json) if args.changelog_json else find_first(root, CHANGELOG_JSON_CANDIDATES)
    json_entry, json_top = None, None
    if changelog_json and changelog_json.is_file():
        try:
            data = json.loads(changelog_json.read_text(encoding="utf-8"))
            if isinstance(data, list) and data:
                json_entry = data[0]
                json_top = str(json_entry.get("version") or "")
            elif isinstance(data, dict) and isinstance(data.get("versions"), list) and data["versions"]:
                json_entry = data["versions"][0]
                json_top = str(json_entry.get("version") or "")
        except (ValueError, OSError):
            json_entry, json_top = None, None

    problems: list[str] = []
    pending: list[str] = []  # --fix 修不了的（需要人工补内容）
    report = {"version": version, "source": str(source.relative_to(root)), "problems": problems}

    readme = find_first(root, README_CANDIDATES)
    if readme:
        ok, stale = readme_sync(readme, version, fix=args.fix)
        report["readme"] = {"path": readme.name, "ok": ok, "stale": stale}
        if not ok:
            problems.append(
                f"{readme.name} 里的版本号是 {', '.join('v' + s for s in stale)}，应为 v{version}"
                + ("（已自动修正）" if args.fix else "")
            )
    else:
        report["readme"] = {"path": None, "ok": True, "stale": []}

    changelog_md = find_first(root, CHANGELOG_MD_CANDIDATES)
    if changelog_md:
        ok, current = changelog_md_sync(changelog_md, version, json_entry, fix=args.fix)
        report["changelog_md"] = {"path": changelog_md.name, "ok": ok, "top": current}
        if not ok:
            problems.append(
                f"{changelog_md.name} 顶条是 v{current}，应为 v{version}"
                + ("（已按 changelog.json 自动补写）" if args.fix and json_entry else "")
            )
            if not (args.fix and json_entry):
                pending.append(f"{changelog_md.name} 需要人工补 v{version} 段落")
    else:
        report["changelog_md"] = {"path": None, "ok": True, "top": None}

    if json_top is not None and changelog_json is not None:
        ok = json_top == version
        report["changelog_json"] = {"path": changelog_json.name, "ok": ok, "top": json_top}
        if not ok:
            problems.append(f"{changelog_json} 顶条是 v{json_top}，应为 v{version}（需人工补条目）")
            pending.append(f"{changelog_json} 缺少 v{version} 条目")

    report["ok"] = not problems
    report["pending"] = pending

    if args.as_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"版本唯一源：{source.relative_to(root)} → v{version}")
        for key, label in (("readme", "README"), ("changelog_md", "CHANGELOG.md"), ("changelog_json", "changelog.json")):
            item = report.get(key)
            if not item or not item.get("path"):
                continue
            print(f"  {'✅' if item['ok'] else '❌'} {label}")
        for p in problems:
            print(f"  - {p}")
        if args.fix and problems:
            print("已执行 --fix；CHANGELOG.md 若被改写，请复查内容后提交。")

    if report["ok"]:
        return 0
    if args.fix and not pending:
        return 0  # 已全部修好
    return 1


if __name__ == "__main__":
    sys.exit(main())
