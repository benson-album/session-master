#!/bin/bash
# SessionMaster 同步服务器 - NAS Docker 部署脚本
# 使用方法: bash deploy.sh
# 自定义端口: PORT=5790 bash deploy.sh

set -e

# ========== 配置（按需修改）==========
NAS_USER="your-username"
NAS_HOST="192.168.3.x"        # 改为你的 NAS 实际 IP
NAS_PATH="/path/to/sessionmaster-sync"  # 改为你的实际路径
PORT="${PORT:-5789}"          # 同步服务器端口（默认 5789，可通过环境变量修改）
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==========================================="
echo " SessionMaster 同步服务器 - Docker 部署"
echo "==========================================="
echo "  端口: ${PORT}"
echo ""

# 1. 复制文件到 NAS
echo "[1/4] 复制文件到 NAS..."
ssh "${NAS_USER}@${NAS_HOST}" "mkdir -p ${NAS_PATH}/data"
scp "${LOCAL_DIR}/Dockerfile" "${NAS_USER}@${NAS_HOST}:${NAS_PATH}/"
scp "${LOCAL_DIR}/server.js" "${NAS_USER}@${NAS_HOST}:${NAS_PATH}/"
scp "${LOCAL_DIR}/docker-compose.yaml" "${NAS_USER}@${NAS_HOST}:${NAS_PATH}/"
echo "  ✅ 文件已复制"

# 2. 在 NAS 上构建和启动
echo "[2/4] 构建 Docker 镜像..."
ssh "${NAS_USER}@${NAS_HOST}" "cd ${NAS_PATH} && PORT=${PORT} docker compose build"
echo "  ✅ 镜像构建完成"

# 3. 启动容器
echo "[3/4] 启动容器..."
ssh "${NAS_USER}@${NAS_HOST}" "cd ${NAS_PATH} && PORT=${PORT} docker compose up -d"
echo "  ✅ 容器已启动"

# 4. 验证
echo "[4/4] 验证运行状态..."
sleep 3
RESULT=$(ssh "${NAS_USER}@${NAS_HOST}" "curl -s http://localhost:${PORT}/api/health")
echo "  响应: ${RESULT}"

if echo "${RESULT}" | grep -q '"ok"'; then
  echo ""
  echo "==========================================="
  echo " ✅ 部署成功！"
  echo "==========================================="
  echo " 服务地址: http://${NAS_HOST}:${PORT}"
  echo " 状态页面: http://${NAS_HOST}:${PORT}/"
  echo ""
  echo " 在插件中配置:"
  echo "   服务器地址: http://${NAS_HOST}:${PORT}"
  echo "   (如果浏览器在外部网络，需用DDNS/端口转发)"
  echo "==========================================="
else
  echo " ❌ 验证失败，请检查日志: docker logs sessionmaster-sync"
fi
