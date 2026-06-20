// ============================================
// SessionMaster · 会话大师 - Background Worker
// © 2026 BenSon.Album (chinasir@qq.com)
// 仅供学习研究，请遵守相关服务条款
// ============================================

// ========== 存储函数 ==========

async function getStorage(key, defaultVal = null) {
  const result = await chrome.storage.local.get(key);
  return result[key] !== undefined ? result[key] : defaultVal;
}

async function setStorage(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

// ========== Cookie 管理 ==========

async function getCookies(domain) {
  let results = [];
  const formats = [];
  if (domain.startsWith('.')) { formats.push(domain); formats.push(domain.substring(1)); }
  else { formats.push(domain); formats.push('.' + domain); }
  for (const d of formats) {
    try { results = results.concat(await chrome.cookies.getAll({ domain: d })); } catch (e) {}
  }
  const seen = new Set();
  return results.filter(c => { const key = `${c.name}:${c.domain}:${c.path}`; if (seen.has(key)) return false; seen.add(key); return true; });
}

async function exportCookies(domain) {
  const cookies = await getCookies(domain);
  if (cookies.length === 0) return { success: false, message: '未找到该域名的 Cookie', data: null };
  const data = { domain, exportTime: new Date().toISOString(), cookies: cookies.map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path, secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite, hostOnly: c.hostOnly })), quick: cookies.map(c => `${c.name}=${c.value}`).join('; ') };
  return { success: true, message: `已导出 ${cookies.length} 个 Cookie`, data };
}

async function importCookies(cookieData) {
  const results = { success: 0, failed: 0, errors: [] };
  for (const c of cookieData.cookies) {
    try {
      const details = { url: `${c.secure ? 'https' : 'http'}://${c.domain}${c.path}`, name: c.name, value: c.value, path: c.path || '/', secure: c.secure !== false, httpOnly: c.httpOnly === true, sameSite: c.sameSite || 'lax' };
      if (!c.hostOnly) details.domain = c.domain;
      await chrome.cookies.set(details);
      results.success++;
    } catch (e) { results.failed++; results.errors.push(`${c.name}: ${e.message}`); }
  }
  return results;
}

async function clearCookies(domain) {
  const cookies = await getCookies(domain);
  let count = 0;
  for (const c of cookies) {
    try { const url = `${c.secure ? 'https' : 'http'}://${c.domain}${c.path}`; await chrome.cookies.remove({ url, name: c.name }); count++; } catch (e) {}
  }
  return { removed: count };
}

// ========== 加密工具 ==========

async function encryptData(plaintext, password) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext));
  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0); combined.set(iv, salt.length); combined.set(new Uint8Array(encrypted), salt.length + iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decryptData(ciphertext, password) {
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const salt = combined.slice(0, 16); const iv = combined.slice(16, 28); const data = combined.slice(28);
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

// ========== 同步配置 ==========

const SYNC_CONFIG_KEY = 'cloud_sync_config';

const DEFAULT_SYNC_CONFIG = {
  mode: 'p2p',                // 'p2p' | 'server'
  enabled: false,
  // P2P 模式
  signalUrl: 'http://你的信令服务器地址:5789',
  p2pRoomId: '',
  p2pPairKey: '',
  p2pDeviceName: '',
  p2pConnected: false,
  // 服务器模式
  serverUrl: 'http://你的服务器:5789',
  pairKey: '',
  deviceId: '',
  deviceName: '',
  intervalMinutes: 5,
  syncedDomains: [],
  lastSyncTime: null,
  lastError: null
};

async function getSyncConfig() {
  return await getStorage(SYNC_CONFIG_KEY, { ...DEFAULT_SYNC_CONFIG });
}

async function saveSyncConfig(updates) {
  const config = await getSyncConfig();
  Object.assign(config, updates);
  await setStorage(SYNC_CONFIG_KEY, config);
  return config;
}

// ========== P2P 连接管理 ==========

let p2pConnections = {};  // { peerId: { connection: RTCPeerConnection, channel: RTCDataChannel, signalInterval } }
let p2pPollTimer = null;
let currentP2PRoomId = '';
let currentP2PPeerId = '';

async function getSignalUrl() {
  const config = await getSyncConfig();
  return config.signalUrl || DEFAULT_SYNC_CONFIG.signalUrl;
}

function generateP2PPeerId() {
  return 'p2p-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
}

// 创建 P2P 配对房间
async function p2pCreateRoom(deviceName) {
  const peerId = generateP2PPeerId();
  const signalUrl = await getSignalUrl();

  try {
    const resp = await fetch(`${signalUrl}/api/signal/room`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', peerId, deviceName: deviceName || peerId })
    });
    const data = await resp.json();
    if (!data.roomId) throw new Error('创建房间失败');

    currentP2PRoomId = data.roomId;
    currentP2PPeerId = peerId;
    await saveSyncConfig({ p2pRoomId: data.roomId, p2pConnected: false });

    // 开始轮询信令消息
    startP2PPolling(signalUrl, data.roomId, peerId);

    return { success: true, roomId: data.roomId, peerId };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 加入已有 P2P 配对房间
async function p2pJoinRoom(roomId, deviceName) {
  const peerId = generateP2PPeerId();
  const signalUrl = await getSignalUrl();

  try {
    const resp = await fetch(`${signalUrl}/api/signal/room`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'join', roomId, peerId, deviceName: deviceName || peerId })
    });
    const data = await resp.json();
    if (!data.roomId) throw new Error('加入房间失败');

    currentP2PRoomId = data.roomId;
    currentP2PPeerId = peerId;
    await saveSyncConfig({ p2pRoomId: data.roomId, p2pConnected: false });

    // 如果有已存在的对端，发起 WebRTC 连接
    if (data.peers && data.peers.length > 0) {
      for (const peer of data.peers) {
        initiateP2PConnection(signalUrl, data.roomId, peerId, peer.peerId, deviceName);
      }
    }

    // 开始轮询
    startP2PPolling(signalUrl, data.roomId, peerId);

    return { success: true, roomId: data.roomId, peers: data.peers || [] };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 发起 WebRTC 连接
async function initiateP2PConnection(signalUrl, roomId, fromPeer, toPeer, deviceName) {
  const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  const pc = new RTCPeerConnection(config);
  const channel = pc.createDataChannel('sessionmaster-sync', { ordered: true });

  p2pConnections[toPeer] = { connection: pc, channel, signalUrl, roomId, fromPeer, toPeer };

  channel.onopen = () => {
    console.log('[SessionMaster P2P] 数据通道已打开:', toPeer);
    channel.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        await handleP2PMessage(msg, toPeer);
      } catch (e) { console.warn('[P2P] 消息解析失败:', e); }
    };
    p2pSync(toPeer);
    chrome.runtime.sendMessage({ action: 'p2pStatusUpdate', connected: true, peerId: toPeer });
  };

  channel.onclose = () => {
    console.log('[SessionMaster P2P] 数据通道关闭:', toPeer);
    chrome.runtime.sendMessage({ action: 'p2pStatusUpdate', connected: false, peerId: toPeer });
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignal(signalUrl, roomId, fromPeer, toPeer, 'ice', event.candidate.toJSON());
    }
  };

  pc.ondatachannel = (event) => {
    const rc = event.channel;
    p2pConnections[toPeer].channel = rc;
    rc.onopen = () => {
      console.log('[SessionMaster P2P] 接收数据通道已打开:', toPeer);
      rc.onmessage = async (ev) => {
        try { await handleP2PMessage(JSON.parse(ev.data), toPeer); } catch (e) {}
      };
      p2pSync(toPeer);
      chrome.runtime.sendMessage({ action: 'p2pStatusUpdate', connected: true, peerId: toPeer });
    };
    rc.onclose = () => chrome.runtime.sendMessage({ action: 'p2pStatusUpdate', connected: false, peerId: toPeer });
  };

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal(signalUrl, roomId, fromPeer, toPeer, 'offer', { sdp: offer.sdp, type: offer.type });
  } catch (e) {
    console.error('[P2P] 创建 offer 失败:', e);
  }
}

// 处理信令消息
async function handleSignalMessage(msg) {
  const conn = p2pConnections[msg.from];
  if (!conn) return;

  const pc = conn.connection;
  if (!pc) return;

  try {
    if (msg.type === 'offer' && msg.data) {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.data));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal(conn.signalUrl, conn.roomId, conn.fromPeer, conn.toPeer, 'answer', { sdp: answer.sdp, type: answer.type });
    } else if (msg.type === 'answer' && msg.data) {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.data));
    } else if (msg.type === 'ice' && msg.data) {
      await pc.addIceCandidate(new RTCIceCandidate(msg.data));
    }
  } catch (e) {
    console.warn('[P2P] 信令处理失败:', e.message);
  }
}

// 通过信令服务器发送消息
async function sendSignal(signalUrl, roomId, from, to, type, data) {
  try {
    await fetch(`${signalUrl}/api/signal/message`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, from, to, type, data })
    });
  } catch (e) {
    console.warn('[P2P] 发送信令失败:', e.message);
  }
}

// 轮询信令消息
function startP2PPolling(signalUrl, roomId, peerId) {
  if (p2pPollTimer) return;

  const poll = async () => {
    try {
      const resp = await fetch(`${signalUrl}/api/signal/poll?room=${roomId}&peer=${peerId}&timeout=25`);
      const data = await resp.json();
      if (data.messages && data.messages.length > 0) {
        for (const msg of data.messages) {
          if (msg.type === 'peer_joined') {
            // 新设备加入，发起连接
            chrome.runtime.sendMessage({ action: 'p2pPeerJoined', peerDeviceName: msg.data.deviceName });
            initiateP2PConnection(signalUrl, roomId, peerId, msg.from, msg.data.deviceName);
          } else if (msg.type === 'peer_left') {
            chrome.runtime.sendMessage({ action: 'p2pPeerLeft', peerId: msg.from });
            deleteP2PConnection(msg.from);
          } else {
            // 信令消息（offer/answer/ice）
            handleSignalMessage(msg);
          }
        }
      }
    } catch (e) {
      if (!e.message.includes('fetch')) console.warn('[P2P] 轮询错误:', e.message);
    }
    // 继续轮询
    p2pPollTimer = setTimeout(poll, 100);
  };

  poll();
}

function stopP2PPolling() {
  if (p2pPollTimer) { clearTimeout(p2pPollTimer); p2pPollTimer = null; }
}

function deleteP2PConnection(peerId) {
  const conn = p2pConnections[peerId];
  if (conn) {
    try { conn.channel.close(); } catch (e) {}
    try { conn.connection.close(); } catch (e) {}
    delete p2pConnections[peerId];
  }
}

// 断开所有 P2P 连接
async function p2pDisconnect() {
  stopP2PPolling();
  const signalUrl = await getSignalUrl();
  if (currentP2PRoomId && currentP2PPeerId) {
    try {
      await fetch(`${signalUrl}/api/signal/room?room=${currentP2PRoomId}&peer=${currentP2PPeerId}`, { method: 'DELETE' });
    } catch (e) {}
  }
  for (const pid of Object.keys(p2pConnections)) deleteP2PConnection(pid);
  currentP2PRoomId = '';
  currentP2PPeerId = '';
  await saveSyncConfig({ p2pConnected: false });
}

// P2P 同步：发送 Cookie 给对端
async function p2pSync(targetPeer) {
  const config = await getSyncConfig();
  const domain = config.syncedDomains?.[0];
  if (!domain) return;

  const exportResult = await exportCookies(domain);
  if (!exportResult.success) return;

  const channel = p2pConnections[targetPeer]?.channel;
  if (!channel || channel.readyState !== 'open') return;

  try {
    // 用配对码加密
    const pairKey = config.p2pPairKey || 'default';
    const encrypted = await encryptData(JSON.stringify(exportResult.data), pairKey);
    channel.send(JSON.stringify({ action: 'sync', domain, data: encrypted, timestamp: new Date().toISOString() }));
  } catch (e) {
    console.warn('[P2P] 发送同步数据失败:', e);
  }
}

// 处理收到的 P2P 消息
async function handleP2PMessage(msg, fromPeer) {
  if (msg.action === 'sync' && msg.data) {
    const config = await getSyncConfig();
    const pairKey = config.p2pPairKey || 'default';
    try {
      const decryptedStr = await decryptData(msg.data, pairKey);
      const cookieData = JSON.parse(decryptedStr);
      const importResult = await importCookies(cookieData);
      if (importResult.success > 0) {
        await saveSyncConfig({ lastSyncTime: new Date().toISOString() });
        chrome.runtime.sendMessage({ action: 'p2pSyncComplete', imported: importResult.success, fromPeer });
      }
    } catch (e) {
      console.warn('[P2P] 解密/导入失败:', e.message);
    }
  }
}

// ========== 云端同步核心逻辑（服务器模式）==========

const SERVER_SYNC_CONFIG_KEY = 'cloud_sync_config';

async function serverGetSyncConfig() {
  return await getStorage(SERVER_SYNC_CONFIG_KEY, {
    enabled: false, serverUrl: 'http://你的服务器:5789', pairKey: '',
    deviceId: '', deviceName: '', intervalMinutes: 5,
    syncedDomains: [], lastSyncTime: null, lastError: null
  });
}

async function serverSaveSyncConfig(updates) {
  const config = await serverGetSyncConfig();
  Object.assign(config, updates);
  await setStorage(SERVER_SYNC_CONFIG_KEY, config);
  return config;
}

async function serverRegisterDevice() {
  const config = await serverGetSyncConfig();
  if (!config.serverUrl || !config.pairKey) return { success: false, error: '请先配置服务器地址和配对码' };
  try {
    const resp = await fetch(`${config.serverUrl}/api/pair`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: config.pairKey, deviceId: config.deviceId || undefined, deviceName: config.deviceName || `Browser-${Date.now().toString(36)}` })
    });
    const data = await resp.json();
    await serverSaveSyncConfig({ deviceId: data.deviceId, pairKey: data.key });
    return { success: true, data };
  } catch (e) { return { success: false, error: e.message }; }
}

async function serverPerformSync() {
  const config = await serverGetSyncConfig();
  if (!config.enabled || !config.serverUrl || !config.pairKey || !config.deviceId) return { success: false, error: '同步未启用或配置不完整' };

  const results = { upload: null, download: null, imported: false };
  const syncDomain = config.syncedDomains.length > 0 ? config.syncedDomains[0] : '';

  if (syncDomain) {
    const exportResult = await exportCookies(syncDomain);
    if (exportResult.success) {
      try {
        const encrypted = await encryptData(JSON.stringify(exportResult.data), config.pairKey);
        const resp = await fetch(`${config.serverUrl}/api/sync/upload`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: config.pairKey, deviceId: config.deviceId, domain: syncDomain, data: encrypted, timestamp: new Date().toISOString() })
        });
        results.upload = await resp.json();
      } catch (e) { results.upload = { error: e.message }; }
    }
  }

  try {
    const resp = await fetch(`${config.serverUrl}/api/sync/download?key=${config.pairKey}&deviceId=${config.deviceId}`);
    const downloadData = await resp.json();
    results.download = downloadData;
    if (downloadData.success && downloadData.data) {
      for (const [deviceId, cookieEntry] of Object.entries(downloadData.data)) {
        if (cookieEntry.data && cookieEntry.data.length > 0) {
          try {
            const decryptedStr = await decryptData(cookieEntry.data, config.pairKey);
            const cookieData = JSON.parse(decryptedStr);
            const importResult = await importCookies(cookieData);
            if (importResult.success > 0) { results.imported = true; console.log(`[SessionMaster] 从 ${deviceId} 同步了 ${importResult.success} 个 Cookie`); }
          } catch (e) { console.warn('[SessionMaster] 解密失败:', e.message); }
        }
      }
    }
  } catch (e) { results.download = { error: e.message }; }

  await serverSaveSyncConfig({ lastSyncTime: new Date().toISOString() });
  return results;
}

async function serverToggleSync(enabled) {
  if (enabled) {
    const config = await serverGetSyncConfig();
    const reg = await serverRegisterDevice();
    if (!reg.success) return reg;
    serverPerformSync().catch(e => console.warn('[SessionMaster] 首次同步失败:', e));
    const intervalMinutes = config.intervalMinutes || 5;
    chrome.alarms.create('sessionSync', { periodInMinutes: intervalMinutes });
    await serverSaveSyncConfig({ enabled: true });
    return { success: true, message: `已启用同步（每 ${intervalMinutes} 分钟）` };
  } else {
    chrome.alarms.clear('sessionSync');
    await serverSaveSyncConfig({ enabled: false });
    return { success: true, message: '已禁用同步' };
  }
}

// ========== Alarm 监听 ==========

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'sessionSync') {
    const config = await serverGetSyncConfig();
    if (config.enabled) {
      const result = await serverPerformSync();
      if (result.imported) console.log('[SessionMaster] ✅ 自动同步完成，已导入新 Cookie');
    }
  }
  if (alarm.name === 'p2pSyncAlarm') {
    // P2P 模式下定时同步给所有已连接的对端
    for (const peerId of Object.keys(p2pConnections)) {
      const conn = p2pConnections[peerId];
      if (conn.channel && conn.channel.readyState === 'open') {
        p2pSync(peerId);
      }
    }
  }
  // 保活定时器
  if (alarm.name.startsWith('heartbeat_')) {
    const id = alarm.name.replace('heartbeat_', '');
    const beats = await getHeartbeats();
    const beat = beats.find(b => b.id === id);
    if (beat && beat.enabled) performHeartbeat(beat);
  }
});

// ========== 保活管理 ==========

const HEARTBEAT_KEY = 'heartbeat_configs';

// 保活配置结构: { id, url, domain, intervalMinutes, enabled }

async function getHeartbeats() { return await getStorage(HEARTBEAT_KEY, []); }

async function saveHeartbeats(beats) {
  await setStorage(HEARTBEAT_KEY, beats);
  // 同步更新 alarms
  const allAlarms = await chrome.alarms.getAll();
  const existing = allAlarms.filter(a => a.name.startsWith('heartbeat_'));
  for (const a of existing) chrome.alarms.clear(a.name);
  for (const beat of beats) {
    if (beat.enabled && beat.url) {
      chrome.alarms.create('heartbeat_' + beat.id, { periodInMinutes: beat.intervalMinutes || 10 });
    }
  }
}

async function addHeartbeat(url, interval, domain) {
  const beats = await getHeartbeats();
  const id = 'hb_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 4);
  beats.push({ id, url: url.trim(), domain: domain || '', intervalMinutes: interval || 10, enabled: true, createdAt: new Date().toISOString() });
  await saveHeartbeats(beats);
  return { success: true, heartbeats: beats };
}

async function removeHeartbeat(id) {
  let beats = await getHeartbeats();
  beats = beats.filter(b => b.id !== id);
  await saveHeartbeats(beats);
  chrome.alarms.clear('heartbeat_' + id);
  return { success: true, heartbeats: beats };
}

async function toggleHeartbeat(id, enabled) {
  const beats = await getHeartbeats();
  const beat = beats.find(b => b.id === id);
  if (!beat) return { success: false, error: '未找到该保活配置' };
  beat.enabled = enabled;
  await saveHeartbeats(beats);
  return { success: true, heartbeats: beats };
}

async function performHeartbeat(beat) {
  if (!beat.url) return;
  try {
    const url = beat.domain
      ? (beat.url.startsWith('http') ? beat.url : 'https://' + beat.domain + (beat.url.startsWith('/') ? '' : '/') + beat.url)
      : beat.url;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(url, { method: 'GET', signal: controller.signal, mode: 'no-cors' });
    clearTimeout(timer);
    console.log('[SessionMaster 保活] ✅', url, resp.status);
  } catch (e) {
    console.log('[SessionMaster 保活] ⏸️', beat.url, e.message);
  }
}

// ========== 动态规则管理 ==========

const USER_RULES_KEY = 'user_blocking_rules';

async function getUserBlockingRules() { return await getStorage(USER_RULES_KEY, []); }

async function addUserBlockingRule(urlPattern) {
  const rules = await getUserBlockingRules();
  if (rules.includes(urlPattern)) return { success: false, message: '该规则已存在' };
  rules.push(urlPattern);
  await setStorage(USER_RULES_KEY, rules);
  await updateDynamicRules(rules);
  return { success: true, message: '规则已添加', rules };
}

async function removeUserBlockingRule(urlPattern) {
  let rules = await getUserBlockingRules();
  rules = rules.filter(r => r !== urlPattern);
  await setStorage(USER_RULES_KEY, rules);
  await updateDynamicRules(rules);
  return { success: true, message: '规则已删除', rules };
}

async function updateDynamicRules(rules) {
  const newRules = rules.map((pattern, index) => ({ id: 1000 + index, priority: 1, action: { type: 'block' }, condition: { urlFilter: pattern, resourceTypes: ['xmlhttprequest', 'script', 'other', 'sub_frame'] } }));
  const currentRules = await chrome.declarativeNetRequest.getDynamicRules();
  const currentIds = currentRules.map(r => r.id);
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: currentIds, addRules: newRules });
}

// ========== API 消息处理 ==========

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    switch (request.action) {
      // ---- Cookie 管理 ----
      case 'getCookies': sendResponse(await exportCookies(request.domain)); break;
      case 'importCookies': sendResponse(await importCookies(request.data)); break;
      case 'clearCookies': sendResponse(await clearCookies(request.domain)); break;
      case 'getDomainFromUrl': try { sendResponse({ domain: new URL(request.url).hostname }); } catch { sendResponse({ domain: '' }); } break;

      // ---- 拦截规则 ----
      case 'getBlockingRules': sendResponse({ rules: await getUserBlockingRules() }); break;
      case 'addBlockingRule': sendResponse(await addUserBlockingRule(request.urlPattern)); break;
      case 'removeBlockingRule': sendResponse(await removeUserBlockingRule(request.urlPattern)); break;

      // ---- 同步配置 ----
      case 'getSyncConfig': sendResponse(await getSyncConfig()); break;
      case 'saveSyncConfig': sendResponse(await saveSyncConfig(request.config)); break;

      // ---- P2P 模式 ----
      case 'p2pCreateRoom':
        sendResponse(await p2pCreateRoom(request.deviceName));
        break;
      case 'p2pJoinRoom':
        sendResponse(await p2pJoinRoom(request.roomId, request.deviceName));
        break;
      case 'p2pDisconnect':
        await p2pDisconnect();
        sendResponse({ success: true });
        break;
      case 'p2pManualSync':
        for (const peerId of Object.keys(p2pConnections)) {
          if (p2pConnections[peerId].channel?.readyState === 'open') p2pSync(peerId);
        }
        sendResponse({ success: true });
        break;
      case 'p2pToggleSync':
        if (request.enabled) {
          await saveSyncConfig({ enabled: true });
          chrome.alarms.create('p2pSyncAlarm', { periodInMinutes: request.intervalMinutes || 5 });
          sendResponse({ success: true, message: `已启用 P2P 同步（每 ${request.intervalMinutes || 5} 分钟）` });
        } else {
          chrome.alarms.clear('p2pSyncAlarm');
          await saveSyncConfig({ enabled: false });
          sendResponse({ success: true, message: '已禁用 P2P 同步' });
        }
        break;

      // ---- 服务器模式 ----
      case 'serverGetSyncConfig': sendResponse(await serverGetSyncConfig()); break;
      case 'serverSaveSyncConfig': sendResponse(await serverSaveSyncConfig(request.config)); break;
      case 'serverToggleSync': sendResponse(await serverToggleSync(request.enabled)); break;
      case 'serverManualSync': sendResponse(await serverPerformSync()); break;
      case 'serverRegisterDevice': sendResponse(await serverRegisterDevice()); break;

      // ---- 保活 ----
      case 'getHeartbeats': sendResponse({ heartbeats: await getHeartbeats() }); break;
      case 'addHeartbeat':
        sendResponse(await addHeartbeat(request.url, request.interval, request.domain));
        break;
      case 'removeHeartbeat':
        sendResponse(await removeHeartbeat(request.id));
        break;
      case 'toggleHeartbeat':
        sendResponse(await toggleHeartbeat(request.id, request.enabled));
        break;

      // ---- 网络信息 ----
      case 'getNetworkInfo':
        try {
          if (chrome.system && chrome.system.network && typeof chrome.system.network.getNetworkInterfaces === 'function') {
            const ifaces = await chrome.system.network.getNetworkInterfaces();
            const ipv4 = (ifaces || []).filter(i => i && i.address && i.address.includes('.')).map(i => ({ name: i.name || '', address: i.address }));
            const ipv6 = (ifaces || []).filter(i => i && i.address && i.address.includes(':')).map(i => ({ name: i.name || '', address: i.address }));
            sendResponse({ success: true, ipv4, ipv6 });
          } else {
            sendResponse({ success: false, error: 'API 不可用' });
          }
        } catch (e) { sendResponse({ success: false, error: e.message }); }
        break;

      default: sendResponse({ success: false, message: '未知操作' });
    }
  })();
  return true;
});

// ========== 安装时初始化 ==========

chrome.runtime.onInstalled.addListener(async () => {
  const rules = await getUserBlockingRules();
  if (rules.length > 0) await updateDynamicRules(rules);

  // 恢复之前的同步状态
  const config = await getSyncConfig();
  if (config.enabled) {
    if (config.mode === 'p2p' && config.p2pRoomId) {
      chrome.alarms.create('p2pSyncAlarm', { periodInMinutes: config.intervalMinutes || 5 });
      console.log('[SessionMaster] 已恢复 P2P 同步定时器');
    } else if (config.mode === 'server' && config.pairKey) {
      chrome.alarms.create('sessionSync', { periodInMinutes: config.intervalMinutes || 5 });
      console.log('[SessionMaster] 已恢复服务器同步定时器');
    }
  }

  console.log('[SessionMaster] 插件已安装');

  // 恢复保活定时器
  getHeartbeats().then(beats => {
    for (const beat of beats) {
      if (beat.enabled && beat.url) {
        chrome.alarms.create('heartbeat_' + beat.id, { periodInMinutes: beat.intervalMinutes || 10 });
      }
    }
  });
});
