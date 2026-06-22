#!/usr/bin/env bash
# 规则库校验快捷脚本
# 用法: bash scripts/validate-rules.sh [路径]
cd "$(dirname "$0")/.."
python3 scripts/validate-rules.py "${1:-src/blocking_rules_db.json}"
