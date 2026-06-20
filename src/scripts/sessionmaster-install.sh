#!/bin/bash
# ============================================================
# SessionMaster 同步服务器 - 一键安装脚本
# 支持 Linux / macOS / WSL，自动守护后台运行
# 用法:
#   curl -fsSL https://你的地址/sessionmaster-install.sh | bash
#   PORT=5790 bash sessionmaster-install.sh   # 自定义端口
# ============================================================
set -e

# ========== 颜色 ==========
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
step()  { echo -e "\n${BLUE}━━━ $1 ━━━${NC}"; }

# ========== 配置 ==========
INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/sessionmaster"
PORT="${PORT:-5789}"
SERVER_JS_URL="${SERVER_JS_URL:-}"
BIN_DIR="${HOME}/.local/bin"
VERSION="1.5.1"

# ========== Banner ==========
echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║   🔐 SessionMaster Sync Server      ║"
echo "  ║   一键安装脚本 v${VERSION}              ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# ========== 步骤1: 检测系统 ==========
step "1/5 检测系统环境"

OS="$(uname -s)"
ARCH="$(uname -m)"
case "$OS" in
  Linux)  OS_NAME="linux" ;;
  Darwin) OS_NAME="darwin" ;;
  *)
    error "不支持的操作系统: $OS（仅支持 Linux / macOS）"
    error "Windows 用户请使用 install.ps1"
    exit 1
    ;;
esac
info "系统: $OS ($ARCH)"

# 获取本机局域网 IP
detect_local_ip() {
  local ip=""
  case "$OS_NAME" in
    linux)
      # 优先取非 docker 网卡的 IP
      ip=$(ip -4 addr show scope global 2>/dev/null | grep -oP 'inet \K[\d.]+' | grep -v '^172\.1[6-9]\.\|^172\.2[0-9]\.\|^172\.3[0-1]\.\|^10\.' | head -1)
      [ -z "$ip" ] && ip=$(ip -4 addr show scope global 2>/dev/null | grep -oP 'inet \K[\d.]+' | head -1)
      [ -z "$ip" ] && ip=$(hostname -I 2>/dev/null | awk '{print $1}')
      ;;
    darwin)
      ip=$(ifconfig 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | head -1)
      ;;
  esac
  [ -z "$ip" ] && ip="127.0.0.1"
  echo "$ip"
}
LOCAL_IP=$(detect_local_ip)
info "本机 IP: $LOCAL_IP"

# ========== 步骤2: 检查/安装 Node.js ==========
step "2/5 检查 Node.js"

install_node() {
  warn "Node.js 未安装，正在自动安装..."

  if command -v curl &>/dev/null; then
    DOWNLOADER="curl -fsSL"
  elif command -v wget &>/dev/null; then
    DOWNLOADER="wget -qO-"
  else
    error "需要 curl 或 wget 来下载"
    exit 1
  fi

  case "$OS_NAME" in
    linux)
      # 使用 NodeSource 官方安装脚本
      $DOWNLOADER https://deb.nodesource.com/setup_22.x | bash - 2>/dev/null || {
        # 如果上面失败，直接下载二进制
        info "使用二进制方式安装..."
        NODE_VERSION="22.14.0"
        case "$ARCH" in
          x86_64)  NODE_ARCH="linux-x64" ;;
          aarch64|arm64) NODE_ARCH="linux-arm64" ;;
          armv7l)  NODE_ARCH="linux-armv7l" ;;
          *)       error "不支持的架构: $ARCH"; exit 1 ;;
        esac
        NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${NODE_ARCH}.tar.xz"
        mkdir -p "$INSTALL_DIR/node"
        $DOWNLOADER "$NODE_URL" | tar -xJ -C "$INSTALL_DIR/node" --strip-components=1
        export PATH="$INSTALL_DIR/node/bin:$PATH"
        mkdir -p "$BIN_DIR"
        ln -sf "$INSTALL_DIR/node/bin/node" "$BIN_DIR/node"
        ln -sf "$INSTALL_DIR/node/bin/npm" "$BIN_DIR/npm"
        info "Node.js 已安装到 $INSTALL_DIR/node"
        return 0
      }
      # apt/yum 安装（通过 nodesource 脚本）
      if command -v apt &>/dev/null; then
        apt-get install -y nodejs
      elif command -v yum &>/dev/null; then
        yum install -y nodejs
      elif command -v dnf &>/dev/null; then
        dnf install -y nodejs
      elif command -v apk &>/dev/null; then
        apk add nodejs
      elif command -v pacman &>/dev/null; then
        pacman -S --noconfirm nodejs
      else
        error "无法安装 Node.js，请手动安装后重试"
        exit 1
      fi
      ;;
    darwin)
      if command -v brew &>/dev/null; then
        brew install node
      else
        info "Homebrew 未安装，通过二进制包安装..."
        NODE_VERSION="22.14.0"
        NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-x64.tar.gz"
        mkdir -p "$INSTALL_DIR/node"
        $DOWNLOADER "$NODE_URL" | tar -xz -C "$INSTALL_DIR/node" --strip-components=1
        export PATH="$INSTALL_DIR/node/bin:$PATH"
        mkdir -p "$BIN_DIR"
        ln -sf "$INSTALL_DIR/node/bin/node" "$BIN_DIR/node"
        ln -sf "$INSTALL_DIR/node/bin/npm" "$BIN_DIR/npm"
        info "Node.js 已安装到 $INSTALL_DIR/node"
      fi
      ;;
  esac
}

if command -v node &>/dev/null; then
  NODE_VER=$(node -v)
  info "Node.js 已安装: $NODE_VER"
else
  # 检查安装目录下是否有 node
  if [ -f "$INSTALL_DIR/node/bin/node" ]; then
    export PATH="$INSTALL_DIR/node/bin:$PATH"
    info "使用本地 Node.js: $(node -v)"
  else
    install_node
  fi
fi

# 确保 $BIN_DIR 在 PATH 中
if [ -d "$BIN_DIR" ] && ! echo "$PATH" | grep -q "$BIN_DIR"; then
  export PATH="$BIN_DIR:$PATH"
fi

# ========== 步骤3: 安装 server.js ==========
step "3/5 下载 SessionMaster 同步服务器"

mkdir -p "$INSTALL_DIR/data"

# 尝试从几个源下载 server.js
SERVER_JS=""
if [ -n "$SERVER_JS_URL" ]; then
  info "从自定义源下载..."
  SERVER_JS=$(curl -fsSL "$SERVER_JS_URL" 2>/dev/null || wget -qO- "$SERVER_JS_URL" 2>/dev/null)
fi

if [ -z "$SERVER_JS" ] && command -v curl &>/dev/null; then
  # 尝试 raw.githubusercontent.com
  info "从 GitHub 下载..."
  SERVER_JS=$(curl -fsSL "https://raw.githubusercontent.com/benson-album/session-master/master/src/server/server.js" 2>/dev/null) || true
fi

if [ -z "$SERVER_JS" ]; then
  # 如果网络不通，提示用户手动放置
  warn "无法自动下载 server.js，请手动操作："
  warn "1. 将 server.js 放入 $INSTALL_DIR/"
  warn "2. 然后运行: node $INSTALL_DIR/server.js $PORT"
  info "或者从 GitHub 下载:"
  info "  curl -fsSL https://raw.githubusercontent.com/benson-album/session-master/master/src/server/server.js -o $INSTALL_DIR/server.js"
  exit 1
fi

echo "$SERVER_JS" > "$INSTALL_DIR/server.js"
info "server.js 已安装到 $INSTALL_DIR/server.js"

# ========== 步骤4: 配置自启动 ==========
step "4/5 配置后台守护"

SERVER_CMD="$(which node) $INSTALL_DIR/server.js $PORT"
SERVICE_NAME="sessionmaster-sync"

case "$OS_NAME" in
  linux)
    # 优先使用 systemd user service
    if command -v systemctl &>/dev/null && systemctl --user list-units &>/dev/null 2>&1; then
      info "配置 systemd 用户服务..."
      mkdir -p "${HOME}/.config/systemd/user"
      cat > "${HOME}/.config/systemd/user/${SERVICE_NAME}.service" <<SERVICEEOF
[Unit]
Description=SessionMaster Sync Server
After=network.target

[Service]
Type=simple
ExecStart=${SERVER_CMD}
Restart=on-failure
RestartSec=5
Environment=PORT=${PORT}
WorkingDirectory=${INSTALL_DIR}

[Install]
WantedBy=default.target
SERVICEEOF
      systemctl --user daemon-reload
      systemctl --user enable --now "${SERVICE_NAME}" 2>/dev/null || {
        warn "systemctl --user enable 失败（可能无 linger），直接启动..."
        systemctl --user start "${SERVICE_NAME}" 2>/dev/null || true
      }
      # 启用 linger 使服务在用户退出登录后继续运行
      loginctl enable-linger "$(whoami)" 2>/dev/null || true
      info "systemd 用户服务已配置"
      DAEMON_TYPE="systemd"
    else
      info "使用 nohup 后台运行..."
      nohup node "$INSTALL_DIR/server.js" "$PORT" > "$INSTALL_DIR/data/server.log" 2>&1 &
      echo $! > "$INSTALL_DIR/server.pid"
      info "PID: $(cat $INSTALL_DIR/server.pid)"
      DAEMON_TYPE="nohup"
    fi
    ;;
  darwin)
    info "配置 launchd 服务..."
    PLIST_PATH="${HOME}/Library/LaunchAgents/com.sessionmaster.sync.plist"
    cat > "$PLIST_PATH" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.sessionmaster.sync</string>
    <key>ProgramArguments</key>
    <array>
        <string>$(which node)</string>
        <string>${INSTALL_DIR}/server.js</string>
        <string>${PORT}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${INSTALL_DIR}</string>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${INSTALL_DIR}/data/server.log</string>
    <key>StandardErrorPath</key>
    <string>${INSTALL_DIR}/data/server.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PORT</key>
        <string>${PORT}</string>
    </dict>
</dict>
</plist>
PLISTEOF
    launchctl load "$PLIST_PATH" 2>/dev/null || launchctl bootstrap gui/$(id -u) "$PLIST_PATH" 2>/dev/null || {
      warn "launchd 加载失败，使用 nohup 后备..."
      nohup node "$INSTALL_DIR/server.js" "$PORT" > "$INSTALL_DIR/data/server.log" 2>&1 &
      echo $! > "$INSTALL_DIR/server.pid"
      DAEMON_TYPE="nohup"
    }
    DAEMON_TYPE="launchd"
    ;;
esac

# 等待服务器启动
info "等待服务器启动..."
for i in $(seq 1 10); do
  if curl -sf "http://localhost:${PORT}/api/health" >/dev/null 2>&1 || \
     wget -qO- "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
    SERVER_OK=true
    break
  fi
  sleep 1
done

# ========== 步骤5: 写入本地配置 ==========
step "5/5 写入本地配置"

if [ "$SERVER_OK" = true ]; then
  # 写入 config.json（供 server.js 读取）
  cat > "$INSTALL_DIR/data/config.json" <<CONFIGEOF
{
  "serverUrl": "http://${LOCAL_IP}:${PORT}",
  "port": ${PORT},
  "localIP": "${LOCAL_IP}",
  "installTime": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "version": "${VERSION}",
  "daemonType": "${DAEMON_TYPE}"
}
CONFIGEOF
  info "配置已写入 $INSTALL_DIR/data/config.json"
else
  warn "服务器启动超时，请检查日志: $INSTALL_DIR/data/server.log"
  warn "手动启动: node $INSTALL_DIR/server.js"
fi

# ========== 完成 ==========
echo ""
echo "  ╔══════════════════════════════════════╗"
if [ "$SERVER_OK" = true ]; then
echo "  ║   ✅ 安装成功！                      ║"
else
echo "  ║   ⚠️  安装完成（服务未响应）          ║"
fi
echo "  ╚══════════════════════════════════════╝"
echo ""
echo "  📍 服务器地址: http://${LOCAL_IP}:${PORT}"
echo "  📂 安装目录:   $INSTALL_DIR"
echo "  📋 日志文件:   $INSTALL_DIR/data/server.log"
echo ""
echo "  🔧 管理命令:"
case "$DAEMON_TYPE" in
  systemd)
    echo "     查看状态: systemctl --user status ${SERVICE_NAME}"
    echo "     查看日志: journalctl --user -u ${SERVICE_NAME} -f"
    echo "     停止:     systemctl --user stop ${SERVICE_NAME}"
    echo "     重启:     systemctl --user restart ${SERVICE_NAME}"
    echo "     卸载:     systemctl --user disable --now ${SERVICE_NAME}"
    ;;
  launchd)
    echo "     查看状态: launchctl list | grep sessionmaster"
    echo "     停止:     launchctl bootout gui/$(id -u) ${PLIST_PATH}"
    echo "     日志:     tail -f ${INSTALL_DIR}/data/server.log"
    ;;
  nohup)
    echo "     查看状态: ps aux | grep server.js"
    echo "     停止:     kill \$(cat ${INSTALL_DIR}/server.pid)"
    echo "     日志:     tail -f ${INSTALL_DIR}/data/server.log"
    ;;
esac
echo ""
echo "  🌐 在插件中填入: http://${LOCAL_IP}:${PORT}"
echo "  💡 插件会自动检测本机服务器，无需手动填写！"
echo ""
