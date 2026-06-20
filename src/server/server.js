/**
 * SessionMaster Sync Server
 * 轻量云端同步中继 —— 数据全程加密，服务端不可见
 *
 * © 2026 BenSon.Album (chinasir@qq.com)
 * 仅供学习研究，请遵守相关服务条款
 *
 * 用法: node server.js [端口号]
 * 默认监听 5789 端口
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || process.argv[2] || '5789');
const DATA_DIR = path.join(__dirname, 'data');

// ========== 持久化存储（云同步模式）==========

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function getPairPath(pairKey) {
  const safe = pairKey.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(DATA_DIR, `${safe}.json`);
}

function readPair(pairKey) {
  const p = getPairPath(pairKey);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

function writePair(pairKey, data) {
  fs.writeFileSync(getPairPath(pairKey), JSON.stringify(data, null, 2));
}

function generatePairKey() {
  return crypto.randomBytes(4).toString('base64url'); // 6字符
}

function generateDeviceId() {
  return crypto.randomBytes(8).toString('hex');
}

// ========== P2P 信令存储（内存，无需持久化）==========

const signalRooms = new Map(); // roomId -> { peers: Map<peerId, {name,joinedAt}>, queues: Map<peerId, Array<msg>> }
const ROOM_EXPIRE_MS = 10 * 60 * 1000; // 10分钟无操作自动清理

// 定期清理过期房间
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of signalRooms) {
    // 检查所有对端是否都已超时
    let allExpired = true;
    for (const [pid, info] of room.peers) {
      if (now - info.joinedAt < ROOM_EXPIRE_MS) { allExpired = false; break; }
    }
    if (allExpired) signalRooms.delete(roomId);
  }
}, 60000);

function generateRoomCode() {
  // 6位字母数字（排除易混淆字符）
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  } while (signalRooms.has(code));
  return code;
}

// ========== HTTP 请求处理 ==========

function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error('无效 JSON')); }
    });
    req.on('error', reject);
  });
}

const routes = {

  // ========== 健康检查 ==========

  health(req, res) {
    sendJSON(res, 200, { status: 'ok', time: new Date().toISOString() });
  },

  // ========== 云同步模式（现有逻辑）==========

  async pair(req, res) {
    const body = await parseBody(req);
    const key = body.key || generatePairKey();
    const deviceId = body.deviceId || generateDeviceId();

    let pair = readPair(key);
    if (!pair) {
      pair = { key, createdAt: new Date().toISOString(), devices: {}, cookies: {} };
    }

    pair.devices[deviceId] = {
      lastSeen: new Date().toISOString(),
      name: body.deviceName || deviceId,
      isMaster: body.isMaster === undefined ? true : body.isMaster
    };

    writePair(key, pair);
    sendJSON(res, 200, { key, deviceId, deviceCount: Object.keys(pair.devices).length });
  },

  async upload(req, res) {
    const body = await parseBody(req);
    const { key, deviceId, domain, data, timestamp } = body;

    if (!key || !deviceId || !domain)
      return sendJSON(res, 400, { error: '缺少必要字段: key, deviceId, domain' });

    const pair = readPair(key);
    if (!pair) return sendJSON(res, 404, { error: '配对码不存在' });
    if (!pair.devices[deviceId]) return sendJSON(res, 403, { error: '设备未注册' });

    pair.devices[deviceId].lastSeen = new Date().toISOString();
    pair.cookies[deviceId] = { domain, data: data || '', timestamp: timestamp || new Date().toISOString(), updatedAt: new Date().toISOString() };

    writePair(key, pair);
    sendJSON(res, 200, { success: true });
  },

  download(req, res) {
    const params = url.parse(req.url, true).query;
    const { key, deviceId } = params;

    if (!key || !deviceId) return sendJSON(res, 400, { error: '缺少参数: key, deviceId' });

    const pair = readPair(key);
    if (!pair) return sendJSON(res, 404, { error: '配对码不存在' });

    const others = {};
    for (const [did, cookie] of Object.entries(pair.cookies)) {
      if (did !== deviceId) others[did] = cookie;
    }

    // 主从冲突检测
    let masterCount = 0, slaveCount = 0;
    for (const [did, info] of Object.entries(pair.devices)) {
      const isM = info.isMaster !== false;
      if (isM) masterCount++; else slaveCount++;
    }
    const warning = [];
    if (masterCount > 1) warning.push('检测到 ' + masterCount + ' 台主设备，建议只保留 1 台主设备');
    if (slaveCount > 0 && masterCount === 0) warning.push('没有主设备，Cookie 将不会上传同步');

    sendJSON(res, 200, {
      success: true,
      deviceCount: Object.keys(pair.devices).length,
      data: others,
      serverTime: new Date().toISOString(),
      devices: Object.entries(pair.devices).map(([id, info]) => ({
        id: id.substring(0, 8) + '...',
        name: info.name,
        isMaster: info.isMaster !== false,
        lastSeen: info.lastSeen
      })),
      masterCount,
      slaveCount,
      warnings: warning
    });
  },

  status(req, res) {
    const params = url.parse(req.url, true).query;
    const pair = readPair(params.key);
    if (!pair) return sendJSON(res, 404, { error: '配对码不存在' });

    sendJSON(res, 200, {
      key: pair.key, createdAt: pair.createdAt,
      deviceCount: Object.keys(pair.devices).length,
      devices: Object.entries(pair.devices).map(([id, info]) => ({ id: id.substring(0, 8) + '...', name: info.name, lastSeen: info.lastSeen })),
      cookieCount: Object.keys(pair.cookies).length
    });
  },

  // ========== P2P 信令 ==========

  // POST /api/signal/room
  // 创建或加入 P2P 配对房间
  async signalCreateRoom(req, res) {
    const body = await parseBody(req);
    const { action, roomId, peerId, deviceName } = body;
    if (!action || !peerId) return sendJSON(res, 400, { error: '缺少必要字段' });

    if (action === 'create') {
      // 创建新房间
      const code = generateRoomCode();
      const room = { createdAt: Date.now(), peers: new Map(), queues: new Map() };
      room.peers.set(peerId, { name: deviceName || '未知设备', joinedAt: Date.now() });
      room.queues.set(peerId, []);
      signalRooms.set(code, room);
      sendJSON(res, 200, { roomId: code, peerId, peerCount: 1 });
    } else if (action === 'join') {
      if (!roomId) return sendJSON(res, 400, { error: '缺少配对码' });
      const room = signalRooms.get(roomId);
      if (!room) return sendJSON(res, 404, { error: '配对码无效或已过期' });

      room.peers.set(peerId, { name: deviceName || '未知设备', joinedAt: Date.now() });
      room.queues.set(peerId, []);

      // 通知房间内其他对端：新设备加入
      const allPeers = [];
      for (const [pid, info] of room.peers) {
        if (pid !== peerId) {
          allPeers.push({ peerId: pid, deviceName: info.name });
          // 把新设备加入消息放入其他对端的队列
          const q = room.queues.get(pid);
          if (q) q.push({ type: 'peer_joined', from: peerId, data: { deviceName }, timestamp: new Date().toISOString() });
        }
      }

      sendJSON(res, 200, { roomId, peerId, peers: allPeers, peerCount: room.peers.size });
    } else {
      sendJSON(res, 400, { error: '无效操作，请用 create 或 join' });
    }
  },

  // POST /api/signal/message
  // 发送信令消息给房间内指定对端
  async signalSend(req, res) {
    const body = await parseBody(req);
    const { roomId, from, to, type, data } = body;
    if (!roomId || !from || !to || !type) return sendJSON(res, 400, { error: '缺少必要字段' });

    const room = signalRooms.get(roomId);
    if (!room) return sendJSON(res, 404, { error: '配对已失效' });

    const q = room.queues.get(to);
    if (!q) return sendJSON(res, 404, { error: '对端不在线' });

    q.push({ type, from, data, timestamp: new Date().toISOString() });

    // 更新发送方在线时间
    const senderInfo = room.peers.get(from);
    if (senderInfo) senderInfo.joinedAt = Date.now();

    sendJSON(res, 200, { success: true });
  },

  // GET /api/signal/poll?room=X&peer=Y&timeout=25
  // 长轮询：等待消息到达，最多等 timeout 秒
  async signalPoll(req, res) {
    const params = url.parse(req.url, true).query;
    const { room: roomId, peer: peerId, timeout } = params;
    if (!roomId || !peerId) return sendJSON(res, 400, { error: '缺少参数: room, peer' });

    const room = signalRooms.get(roomId);
    if (!room) return sendJSON(res, 404, { error: '配对已失效' });

    const maxWait = Math.min(parseInt(timeout) || 25, 30) * 1000;
    const startTime = Date.now();

    // 轮询等待消息
    const waitForMessages = () => {
      return new Promise((resolve) => {
        const check = () => {
          const q = room.queues.get(peerId);
          if (q && q.length > 0) {
            const messages = q.splice(0);
            // 更新在线时间
            const peerInfo = room.peers.get(peerId);
            if (peerInfo) peerInfo.joinedAt = Date.now();
            resolve({ messages });
          } else if (Date.now() - startTime >= maxWait) {
            resolve({ messages: [] });
          } else {
            setTimeout(check, 200);
          }
        };
        check();
      });
    };

    const result = await waitForMessages();
    sendJSON(res, 200, result);
  },

  // GET /api/signal/room?room=X&peer=Y
  // 离开房间
  signalLeave(req, res) {
    const params = url.parse(req.url, true).query;
    const { room: roomId, peer: peerId } = params;

    if (roomId && peerId) {
      const room = signalRooms.get(roomId);
      if (room) {
        room.peers.delete(peerId);
        room.queues.delete(peerId);
        // 通知其他对端
        for (const [pid, q] of room.queues) {
          q.push({ type: 'peer_left', from: peerId, timestamp: new Date().toISOString() });
        }
        if (room.peers.size === 0) signalRooms.delete(roomId);
      }
    }
    sendJSON(res, 200, { success: true });
  },

  // ========== 获取本地配置 ==========

  config(req, res) {
    try {
      const configPath = path.join(DATA_DIR, 'config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        sendJSON(res, 200, { success: true, config });
      } else {
        sendJSON(res, 200, { success: true, config: null, message: '未安装本地配置（远程访问正常）' });
      }
    } catch (e) {
      sendJSON(res, 200, { success: false, error: e.message });
    }
  },
};

// ========== 路由分发 ==========

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  try {
    // 健康检查
    if (pathname === '/api/health' && req.method === 'GET') {
      routes.health(req, res);
    }
    // 云同步
    else if (pathname === '/api/pair' && req.method === 'POST') {
      await routes.pair(req, res);
    } else if (pathname === '/api/sync/upload' && req.method === 'POST') {
      await routes.upload(req, res);
    } else if (pathname === '/api/sync/download' && req.method === 'GET') {
      routes.download(req, res);
    } else if (pathname === '/api/pair/status' && req.method === 'GET') {
      routes.status(req, res);
    }
    // P2P 信令
    else if (pathname === '/api/signal/room' && req.method === 'POST') {
      await routes.signalCreateRoom(req, res);
    } else if (pathname === '/api/signal/message' && req.method === 'POST') {
      await routes.signalSend(req, res);
    } else if (pathname === '/api/signal/poll' && req.method === 'GET') {
      await routes.signalPoll(req, res);
    } else if (pathname === '/api/signal/room' && req.method === 'DELETE') {
      routes.signalLeave(req, res);
    }
    // 本地配置
    else if (pathname === '/api/config' && req.method === 'GET') {
      routes.config(req, res);
    }
    // 主页
    else {
      if (req.method === 'GET') {
        const pairCount = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).length;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>SessionMaster Sync</title>
<style>body{font-family:sans-serif;max-width:600px;margin:50px auto;padding:20px}
h1{color:#1a73e8}.status{background:#e8f0fe;padding:12px;border-radius:8px}</style>
</head><body>
<h1>🔐 SessionMaster Sync Server</h1>
<div class="status">
  <p>✅ 服务器运行中</p>
  <p>⏰ ${new Date().toLocaleString()}</p>
  <p>📊 ${pairCount} 个云同步配对 | P2P 信令服务运行中</p>
</div>
<p style="color:#888;margin-top:20px;font-size:14px">
API: /api/pair | /api/sync/upload | /api/sync/download | /api/signal/room | /api/signal/message | /api/signal/poll | /api/health
</p>
</body></html>`);
      } else {
        sendJSON(res, 404, { error: 'Not Found' });
      }
    }
  } catch (e) {
    console.error('[ERROR]', e.message);
    sendJSON(res, 500, { error: e.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`========================================`);
  console.log(`  SessionMaster Sync Server`);
  console.log(`========================================`);
  console.log(`  监听端口: ${PORT}`);
  console.log(`  数据目录: ${DATA_DIR}`);
  console.log(`  API 地址: http://0.0.0.0:${PORT}/api`);
  console.log(`  状态页面: http://0.0.0.0:${PORT}/`);
  console.log(`========================================`);
});
