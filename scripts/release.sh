#!/bin/bash
# =================================================
# SessionMaster 一键发版脚本
# 用法: bash scripts/release.sh
# 功能: 构建 ZIP → 创建 GitHub Release → 上传附件
# 前置条件: GITHUB_TOKEN 或 ~/.github-token
# =================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
SRC_DIR="$PROJECT_ROOT/src"

# 读取 Token
TOKEN=""
if [ -n "$GITHUB_TOKEN" ]; then
  TOKEN="$GITHUB_TOKEN"
fi
if [ -z "$TOKEN" ] && [ -f "$HOME/.github-token" ]; then
  TOKEN=$(cat "$HOME/.github-token")
fi
if [ -z "$TOKEN" ] && [ -f /opt/data/.github-token ]; then
  TOKEN=$(cat /opt/data/.github-token)
fi
if [ -z "$TOKEN" ]; then
  echo "❌ 未找到 GITHUB_TOKEN 环境变量或 ~/.github-token 文件"
  exit 1
fi

REPO="benson-album/session-master"
API="https://api.github.com/repos/$REPO"
UPLOADS="https://uploads.github.com/repos/$REPO"

echo "============================================"
echo " SessionMaster 一键发版脚本"
echo "============================================"

# 1. 读取版本号
MANIFEST_VER=$(grep '"version"' "$SRC_DIR/manifest.json" | sed 's/.*"version": *"\(.*\)".*/\1/')
echo "[1/7] 版本号: v$MANIFEST_VER"

if [ ! -f "$PROJECT_ROOT/VERSION" ] || [ "$(cat "$PROJECT_ROOT/VERSION")" != "$MANIFEST_VER" ]; then
  echo "  ⚠️ VERSION 不同步，自动修正..."
  printf '%s' "$MANIFEST_VER" > "$PROJECT_ROOT/VERSION"
  echo "  ✅ VERSION → $MANIFEST_VER"
fi

# 2. 验证 changelog
echo "[2/7] 验证 changelog..."
CHANGELOG_VER=$(python3 -c "
import json
with open('$SRC_DIR/changelog.json') as f:
    data = json.load(f)
print(data[0]['version'])")
if [ "$CHANGELOG_VER" != "$MANIFEST_VER" ]; then
  echo "  ❌ changelog.json 最新版本 ($CHANGELOG_VER) != manifest ($MANIFEST_VER)"
  echo "  请先在 changelog.json 添加 v$MANIFEST_VER 条目"
  exit 1
fi
echo "  ✅ changelog.json 最新版本 v$CHANGELOG_VER"

# 3. 检查 tag
echo "[3/7] 检查 tag..."
TAG_EXISTS=false
if git rev-parse "v$MANIFEST_VER" >/dev/null 2>&1; then
  TAG_EXISTS=true
  echo "  ⚠️ tag v$MANIFEST_VER 已存在，跳过创建"
else
  echo "  ✅ tag v$MANIFEST_VER 未创建，后续会创建"
fi

# 4. 检查工作区
echo "[4/7] 检查工作区..."
if [ -n "$(git status --porcelain)" ]; then
  echo "  ❌ 工作区有未提交的变更:"
  git status --short
  exit 1
fi
echo "  ✅ 工作区干净"

# 5. 构建 ZIP
echo "[5/7] 构建 ZIP..."
bash "$SCRIPT_DIR/scripts/build.sh"

ZIP_FILE="$PROJECT_ROOT/session-master-v$MANIFEST_VER.zip"
if [ ! -f "$ZIP_FILE" ]; then
  echo "  ❌ ZIP 构建失败: $ZIP_FILE 不存在"
  exit 1
fi
echo "  ✅ ZIP 构建完成"

# 6. 生成 Release body
echo "[6/7] 生成 Release body..."
RELEASE_BODY_FILE=$(mktemp)
python3 << 'PYEOF' > "$RELEASE_BODY_FILE"
import json
with open('src/changelog.json') as f:
    data = json.load(f)
v = data[0]
ver = v['version']
title = v.get('title', 'v' + ver)
lines = [title, '']
items = v.get('items', {})
if isinstance(items, dict):
    for cat, item_list in items.items():
        lines.append(cat)
        for item in item_list:
            lines.append('- ' + item)
        lines.append('')
lines.append('---')
lines.append('完整更新日志: https://github.com/benson-album/session-master/blob/master/src/changelog.json')
print('\n'.join(lines))
PYEOF

echo ""
echo "===== Release body 预览 ====="
cat "$RELEASE_BODY_FILE"
echo ""
echo "============================"

# 7. 发布
echo ""
echo "[7/7] 发布到 GitHub..."

# 创建 tag
if [ "$TAG_EXISTS" = false ]; then
  git tag "v$MANIFEST_VER"
  echo "  ✅ tag v$MANIFEST_VER 已创建"
fi
git push origin "v$MANIFEST_VER" 2>&1 | tail -1
echo "  ✅ tag 已推送"

# 检查已有 Release
EXISTING_ID=$(curl -sf -H "Authorization: token $TOKEN" \
  "$API/releases/tags/v$MANIFEST_VER" | \
  python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || echo "")

if [ -n "$EXISTING_ID" ]; then
  echo "  ⚠️ 发现同名 Release (id=$EXISTING_ID)，删除重发..."
  curl -sf -X DELETE -H "Authorization: token $TOKEN" \
    "$API/releases/$EXISTING_ID" > /dev/null
  echo "  ✅ 旧 Release 已删除"
fi

# 创建 Release
BODY_JSON=$(python3 -c "
import json
with open('$RELEASE_BODY_FILE') as f:
    body = f.read()
print(json.dumps({
    'tag_name': 'v$MANIFEST_VER',
    'name': 'v$MANIFEST_VER',
    'body': body,
    'draft': False,
    'prerelease': False
}))
")

RESP=$(curl -sf -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$BODY_JSON" \
  "$API/releases")

RELEASE_ID=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id','ERROR'))" 2>/dev/null)
if [ "$RELEASE_ID" = "ERROR" ]; then
  echo "  ❌ 创建 Release 失败:"
  echo "$RESP" | python3 -m json.tool 2>/dev/null || echo "$RESP"
  rm -f "$RELEASE_BODY_FILE"
  exit 1
fi
echo "  ✅ Release 创建成功 (id=$RELEASE_ID)"

# 上传 ZIP
echo "  📤 上传附件..."
UPLOAD_RESP=$(curl -sf -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Content-Type: application/zip" \
  --data-binary @"$ZIP_FILE" \
  "$UPLOADS/releases/$RELEASE_ID/assets?name=session-master-v$MANIFEST_VER.zip")

ASSET_NAME=$(echo "$UPLOAD_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('name','ERROR'))" 2>/dev/null)
if [ "$ASSET_NAME" = "ERROR" ]; then
  echo "  ❌ 上传附件失败"
  echo "$UPLOAD_RESP" | python3 -m json.tool 2>/dev/null || echo "$UPLOAD_RESP"
  rm -f "$RELEASE_BODY_FILE"
  exit 1
fi
echo "  ✅ 附件 $ASSET_NAME 已上传 ($(stat -c%s "$ZIP_FILE") bytes)"

# 清理
rm -f "$ZIP_FILE" "$RELEASE_BODY_FILE"
echo "  ✅ 临时文件已清理"

echo ""
echo "============================================"
echo " ✅ v$MANIFEST_VER 发布完成！"
echo "============================================"
echo "  📎 https://github.com/$REPO/releases/tag/v$MANIFEST_VER"
echo ""

# 提示同步 develop
CUR_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CUR_BRANCH" = "master" ]; then
  echo "💡 提示：当前在 master 分支，建议同步 develop："
  echo "    git checkout develop && git merge master --no-edit && git push origin develop"
fi
echo "============================================"
