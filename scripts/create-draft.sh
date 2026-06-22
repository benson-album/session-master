#!/bin/bash
set -e

# Read token (same method as release.sh)
TOKEN=""
if [ -f /opt/data/.github-token ]; then
  TOKEN=$(head -1 /opt/data/.github-token)
fi
if [ -z "$TOKEN" ] && [ -f "$HOME/.github-token" ]; then
  TOKEN=$(head -1 "$HOME/.github-token")
fi
if [ -z "$TOKEN" ]; then
  echo "No token found"
  exit 1
fi

API="https://api.github.com/repos/benson-album/session-master/releases"
UPLOADS="https://uploads.github.com/repos/benson-album/session-master/releases"

echo "[1/2] Creating Draft Release..."
BODY_JSON='{"tag_name":"v1.6.0-draft","name":"v1.6.0-draft · 预发布测试版","body":"🚧 预发布版本（Draft）- 含站点预设补充\n\n📦 包含 v1.6.0 全部功能 + 新增优酷/爱奇艺/哔哩哔哩站点预设\n🔗 帮助页版本更新链接改为跳转 Releases 下载页\n\n测试通过后可升为正式版。","draft":true,"prerelease":true}'

RESP=$(curl -s -X POST -H "Authorization: token $TOKEN" -H "Content-Type: application/json" -d "$BODY_JSON" "$API")
RELEASE_ID=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id','ERROR'))" 2>/dev/null)

if [ "$RELEASE_ID" = "ERROR" ] || [ -z "$RELEASE_ID" ]; then
  echo "Error:"
  echo "$RESP" | python3 -m json.tool
  exit 1
fi
echo "OK id=$RELEASE_ID"

echo "[2/2] Uploading ZIP..."
UPLOAD_RESP=$(curl -s -X POST -H "Authorization: token $TOKEN" -H "Content-Type: application/zip" \
  --data-binary @/opt/projects/session-master/session-master-v1.6.0.zip \
  "$UPLOADS/$RELEASE_ID/assets?name=session-master-v1.6.0-draft.zip")
echo "$UPLOAD_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'OK {d.get(\"name\")} ({d.get(\"size\")} bytes)')"
echo ""
echo "📎 https://github.com/benson-album/session-master/releases/tag/v1.6.0-draft"
