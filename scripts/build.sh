#!/bin/bash
# SessionMaster 构建脚本
# 使用: bash scripts/build.sh
# 功能: 验证源文件 → 构建 zip → 复制到项目根目录
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
SRC_DIR="$PROJECT_ROOT/src"
OUTPUT_ZIP="$PROJECT_ROOT/session-master.zip"

echo "============================================"
echo " SessionMaster 构建脚本"
echo "============================================"
echo "源目录: $SRC_DIR"
echo "输出:   $OUTPUT_ZIP"
echo ""

# 1. 验证关键文件
echo "[1/3] 验证源文件..."
REQUIRED_FILES=(
  "$SRC_DIR/manifest.json"
  "$SRC_DIR/background.js"
  "$SRC_DIR/content.js"
  "$SRC_DIR/blocking_rules.json"
  "$SRC_DIR/blocking_rules_db.json"
  "$SRC_DIR/icons/icon128.svg"
  "$SRC_DIR/popup/popup.html"
  "$SRC_DIR/popup/popup.js"
  "$SRC_DIR/popup/popup.css"
  "$SRC_DIR/help/help.html"
  "$SRC_DIR/server/server.js"
  "$SRC_DIR/deploy/Dockerfile"
  "$SRC_DIR/deploy/docker-compose.yaml"
  "$SRC_DIR/deploy/deploy.sh"
  "$SRC_DIR/deploy/server.js"
)

for f in "${REQUIRED_FILES[@]}"; do
  if [ -f "$f" ]; then
    echo "  ✅  $(basename "$f")"
  else
    echo "  ❌  MISSING: $f"
    exit 1
  fi
done

# 2. 检查 manifest version
echo ""
echo "[2/3] 检查版本号..."
MANIFEST_VER=$(grep '"version"' "$SRC_DIR/manifest.json" | sed 's/.*"version": *"\(.*\)".*/\1/')
VERSION_FILE=$(cat "$PROJECT_ROOT/VERSION" 2>/dev/null || echo "unknown")
echo "  manifest.json: v$MANIFEST_VER"
echo "  VERSION 文件:  $VERSION_FILE"
if [ "$MANIFEST_VER" != "$VERSION_FILE" ]; then
  echo "  ⚠️  版本号不一致，请同步两份文件"
fi

# 3. 构建 zip
echo ""
echo "[3/3] 构建 $OUTPUT_ZIP ..."
cd "$SRC_DIR"
zip -r "$OUTPUT_ZIP" . \
  -x ".*" -x "*/.*" \
  -x "node_modules/*" \
  > /dev/null

# 检查
ZIP_SIZE=$(stat -c%s "$OUTPUT_ZIP" 2>/dev/null || stat -f%z "$OUTPUT_ZIP" 2>/dev/null)
echo ""
echo "============================================"
echo " ✅ 构建完成！"
echo "============================================"
echo "  输出: $OUTPUT_ZIP"
echo "  大小: $(numfmt --to=iec $ZIP_SIZE 2>/dev/null || echo "$ZIP_SIZE bytes")"
echo "  版本: v$MANIFEST_VER"
echo ""
echo "  在浏览器中加载:"
echo "  1. 打开 chrome://extensions"
echo "  2. 开启开发者模式"
echo "  3. 拖入 session-master.zip 或加载 src/ 目录"
echo "============================================"
