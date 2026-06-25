// ============================================
// SessionMaster · 会话大师 - Background Service Worker
// © 2026 BenSon.Album (chinasir@qq.com)
// 仅供学习研究，请遵守相关服务条款
// ============================================

import { APP_CONFIG } from './config.js';
const { DEFAULT_PORT, STORAGE_KEYS, UPDATE, SYNC_DEFAULTS, SERVER_SYNC_DEFAULTS, HEARTBEAT_DEFAULTS, GITHUB, LOCAL_DISCOVERY, TIMEOUT } = APP_CONFIG;

// === 开发调试开关（生产环境关闭） ===
const DEBUG = false;

// ========== 存储函数 ==========

async function getStorage(key, defaultVal = null) {
  const result = await chrome.storage.local.get(key);
  return result[key] !== undefined ? result[key] : defaultVal;
}

async function setStorage(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

// ========== 日志系统 ==========
// 以文件形式记录关键操作，支持导出为文本
// 自动清理规则：文件总大小超限后删除最旧记录

const LOG_KEY = 'app_logs';
const LOG_SIZE_KEY = 'app_logs_size';
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 日志上限 10MB（需 unlimitedStorage 权限）

async function getLogs() {
  const logs = await getStorage(LOG_KEY, []);
  return Array.isArray(logs) ? logs : [];
}

async function addLog(level, module, message, data) {
  let logs = await getLogs();
  const entry = { time: new Date().toISOString(), level, module, message, data: data || null };
  
  // 估算单条体积（JSON 序列化长度 + 存储开销）
  const entrySize = JSON.stringify(entry).length + 50;
  let totalSize = (await getStorage(LOG_SIZE_KEY, 0)) + entrySize;
  
  logs.push(entry);
  
  // 超出上限时删除最旧的记录，直到低于阈值（留 20% 余量）
  while (totalSize > MAX_LOG_SIZE * 0.8 && logs.length > 1) {
    const removed = logs.shift();
    totalSize -= JSON.stringify(removed).length + 50;
    if (totalSize < 0) totalSize = 0;
  }
  
  await setStorage(LOG_KEY, logs);
  await setStorage(LOG_SIZE_KEY, Math.round(totalSize));
  
  // 同时输出到控制台方便调试
  if (DEBUG) console.log(`[SessionMaster] [${level}] [${module}] ${message}`, data || '');
}

async function clearLogs() {
  await setStorage(LOG_KEY, []);
  await setStorage(LOG_SIZE_KEY, 0);
  console.log('[SessionMaster] [INFO] [general] 日志已清空');
}

async function exportLogs() {
  const logs = await getLogs();
  const size = await getStorage(LOG_SIZE_KEY, 0);
  const sizeStr = size > 1024 * 1024 ? (size / 1024 / 1024).toFixed(1) + ' MB' :
                  size > 1024 ? Math.round(size / 1024) + ' KB' : size + ' B';

  // 收集所有信息
  const identity = await getDeviceIdentity();
  const deviceName = await getDeviceDisplayName();
  const details = await collectDeviceDetails();
  const netIfaces = await collectNetworkInfo();

  const now = new Date().toLocaleString();
  const sepBar = '============================\n';
  const sepDash = '----------------------------\n';

  let sections = [];

  // === 标题 ===
  sections.push(
    'SessionMaster 会话大师 - 操作日志\n' +
    '生成时间: ' + now + '\n' +
    sepBar
  );

  // === 📱 设备信息 ===
  let devBlock = '📱 设备信息\n' + sepDash;
  if (deviceName) devBlock += '设备名称: ' + deviceName + '\n';
  devBlock += '设备 ID: ' + identity.id + '\n';
  if (identity.createdAt) devBlock += '身份创建: ' + new Date(identity.createdAt).toLocaleString() + '\n';
  devBlock += '\n';
  sections.push(devBlock);

  // === 💻 系统信息 + CPU ===
  let sysBlock = '💻 系统信息\n' + sepDash;
  sysBlock += '操作系统: ' + details.os + (details.arch ? ' (' + details.arch + ')' : '') + '\n';
  if (details.platform) sysBlock += '平台: ' + details.platform + '\n';
  if (details.language) sysBlock += '语言: ' + details.language + '\n';
  if (details.cpuModel) sysBlock += 'CPU型号: ' + details.cpuModel + '\n';
  if (details.cpuCores) sysBlock += 'CPU核心: ' + details.cpuCores + '\n';
  if (details.cpuFeatures && details.cpuFeatures.length > 0) {
    sysBlock += 'CPU特性: ' + details.cpuFeatures.slice(0, 6).join(', ') + '\n';
  }
  if (details.totalMemory) sysBlock += '内存总量: ' + details.totalMemory + ' GB\n';
  else if (details.deviceMemory) sysBlock += '内存总量: ' + details.deviceMemory + ' GB\n';
  sysBlock += '\n';
  sections.push(sysBlock);

  // === 🌐 浏览器信息 ===
  let browserBlock = '🌐 浏览器信息\n' + sepDash;
  browserBlock += '浏览器: ' + details.browser + (details.browserVer ? ' ' + details.browserVer : '') + '\n';
  if (details.uaShort) browserBlock += 'User-Agent: ' + details.uaShort + '\n';
  browserBlock += '\n';
  sections.push(browserBlock);

  // === 🌍 网络信息 ===
  let netBlock = '🌍 网络信息\n' + sepDash;
  if (netIfaces.length > 0) {
    // 按类型分组显示
    const typeOrder = ['有线', '无线', 'VPN/隧道', '虚拟', '虚拟机', '其他', '回环'];
    const grouped = {};
    for (const iface of netIfaces) {
      const t = iface.type || '其他';
      if (!grouped[t]) grouped[t] = [];
      grouped[t].push(iface);
    }
    for (const t of typeOrder) {
      if (!grouped[t]) continue;
      netBlock += `  【${t}】\n`;
      for (const iface of grouped[t]) {
        const addrPart = iface.isIPv6 ? iface.address : iface.address + (iface.mask ? ' / ' + iface.mask : '');
        const prefixPart = iface.prefix !== '' ? ' (' + iface.prefix + ')' : '';
        netBlock += '    ' + iface.name + ': ' + addrPart + prefixPart + '\n';
      }
    }
    netBlock += '  接口总数: ' + netIfaces.length + '（含 ' + netIfaces.filter(i => i.isLoopback).length + ' 个回环）\n';
  } else {
    netBlock += '  无法获取网络接口信息\n';
  }
  netBlock += '\n';
  sections.push(netBlock);

  // === 📊 日志统计 ===
  let statBlock = '📊 日志统计\n' + sepDash;
  statBlock += '共 ' + logs.length + ' 条记录, 约 ' + sizeStr + '\n';
  statBlock += '日志上限: ' + (MAX_LOG_SIZE / 1024 / 1024) + ' MB\n';
  statBlock += '\n';
  sections.push(statBlock);

  // === 日志内容 ===
  sections.push(sepBar + '\n');
  sections.push(logs.map(function(l) {
    return '[' + new Date(l.time).toLocaleString() + '] [' + l.level + '] [' + l.module + '] ' + l.message;
  }).join('\n'));

  sections.push('\n\n' + sepBar);
  sections.push('--- 日志结束 ---');

  return sections.join('');
}

const logger = {
  info: function(m, msg, d) { return addLog('INFO', m, msg, d); },
  warn: function(m, msg, d) { return addLog('WARN', m, msg, d); },
  error: function(m, msg, d) { return addLog('ERROR', m, msg, d); },
  debug: function(m, msg, d) { return addLog('DEBUG', m, msg, d); },
  clear: clearLogs,
  export: exportLogs,
  getAll: getLogs
};

// ========== 设备身份标识 ==========
// 固定存储：唯一设备 ID（仅生成一次）
// 动态信息（浏览器/系统/网络等）在导出日志时实时收集

const DEVICE_IDENTITY_KEY = 'device_identity';

async function getDeviceIdentity() {
  let identity = await getStorage(DEVICE_IDENTITY_KEY, null);
  if (!identity) {
    const id = 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 8);
    identity = { id, createdAt: new Date().toISOString() };
    await setStorage(DEVICE_IDENTITY_KEY, identity);
    console.log('[SessionMaster] [INFO] [general] 设备身份已创建: ' + id);
  }
  return identity;
}

// 重置设备 ID（手动操作）
async function resetDeviceIdentity() {
  const old = await getStorage(DEVICE_IDENTITY_KEY, null);
  const newId = 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 8);
  const identity = { id: newId, createdAt: new Date().toISOString(), previousId: old ? old.id : null };
  await setStorage(DEVICE_IDENTITY_KEY, identity);
  return identity;
}

// 获取用户自定义设备名（从同步配置）
async function getDeviceDisplayName() {
  const p2pCfg = await getSyncConfig();
  const srvCfg = await serverGetSyncConfig();
  return p2pCfg.p2pDeviceName || srvCfg.deviceName || '';
}

// 实时收集当前设备详情（OS、浏览器、CPU、内存等）
async function collectDeviceDetails() {
  const platform = await new Promise(resolve => {
    try { chrome.runtime.getPlatformInfo(info => resolve(info || null)); } catch { resolve(null); }
  });
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const ua = nav ? nav.userAgent || '' : '';

  // 解析浏览器名称/版本
  let browserName = '未知';
  let browserVer = '';
  if (ua.includes('Chrome/') && !ua.includes('Edg/')) {
    const m = ua.match(/Chrome\/([\d.]+)/);
    browserName = 'Chrome'; browserVer = m ? m[1] : '';
  } else if (ua.includes('Edg/')) {
    const m = ua.match(/Edg\/([\d.]+)/);
    browserName = 'Edge'; browserVer = m ? m[1] : '';
  } else if (ua.includes('Firefox/')) {
    const m = ua.match(/Firefox\/([\d.]+)/);
    browserName = 'Firefox'; browserVer = m ? m[1] : '';
  } else if (ua.includes('Safari/') && !ua.includes('Chrome/')) {
    const m = ua.match(/Version\/([\d.]+)/);
    browserName = 'Safari'; browserVer = m ? m[1] : '';
  }

  // CPU 详情（型号、核心数、特性）
  let cpuModel = '';
  let cpuCores = nav ? nav.hardwareConcurrency || '' : '';
  let cpuFeatures = [];
  try {
    const cpuInfo = await chrome.system.cpu.getInfo();
    if (cpuInfo) {
      cpuModel = cpuInfo.modelName || '';
      if (!cpuCores) cpuCores = String(cpuInfo.numOfProcessors || '');
      cpuFeatures = (cpuInfo.features || []).slice(0, 10); // 只取前10个特性
    }
  } catch (e) {}

  // 内存详情（总容量 GB）
  let totalMemory = '';
  try {
    const memInfo = await chrome.system.memory.getInfo();
    if (memInfo && memInfo.capacity) {
      totalMemory = (memInfo.capacity / 1024 / 1024 / 1024).toFixed(1);
    }
  } catch (e) {}

  const osMap = { mac: 'macOS', win: 'Windows', android: 'Android', cros: 'ChromeOS', linux: 'Linux', openbsd: 'OpenBSD' };
  return {
    os: platform ? (osMap[platform.os] || platform.os) : '未知',
    arch: platform ? platform.arch : '',
    browser: browserName,
    browserVer: browserVer,
    language: nav ? nav.language || '' : '',
    platform: nav ? nav.platform || '' : '',
    cpuModel: cpuModel,
    cpuCores: cpuCores,
    cpuFeatures: cpuFeatures,
    deviceMemory: nav ? nav.deviceMemory || '' : '',
    totalMemory: totalMemory,
    uaShort: ua.substring(0, 150)
  };
}

// 推测接口类型
function guessInterfaceType(name) {
  const n = (name || '').toLowerCase();
  if (n.startsWith('eth') || n.startsWith('enp') || n.startsWith('eno') || n.startsWith('ens') || n === '以太网') return '有线';
  if (n.startsWith('wlan') || n.startsWith('wlp') || n.startsWith('wlx') || n.startsWith('wifi') || n.startsWith('wi-fi') || n.includes('wireless')) return '无线';
  if (n.startsWith('docker') || n.startsWith('br-') || n.startsWith('veth') || n === 'docker0') return '虚拟';
  if (n.startsWith('tun') || n.startsWith('tap') || n.startsWith('ppp') || n.startsWith('wg') || n.startsWith('utun')) return 'VPN/隧道';
  if (n.startsWith('lo')) return '回环';
  if (n.startsWith('vmnet') || n.startsWith('vnic')) return '虚拟机';
  return '其他';
}

// 子网掩码（由 prefixLength 计算）
function prefixToMask(prefix) {
  if (!prefix && prefix !== 0) return '';
  const mask = [];
  for (let i = 0; i < 4; i++) {
    const bits = Math.min(prefix - i * 8, 8);
    mask.push(bits > 0 ? 256 - Math.pow(2, 8 - bits) : 0);
  }
  return mask.join('.');
}

// 实时收集网络接口信息（含类型、子网掩码）
async function collectNetworkInfo() {
  try {
    // 使用 WebRTC ICE 候选地址获取本机 IP（替代仅限 App 的 system.network API）
    const ips = [];
    const seen = new Set();

    const pc = new RTCPeerConnection({ iceServers: [] });
    pc.createDataChannel('');
    await pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => {});

    await new Promise((resolve) => {
      const timer = setTimeout(() => { pc.close(); resolve(); }, 2000);
      pc.onicecandidate = (ice) => {
        if (!ice || !ice.candidate || !ice.candidate.candidate) {
          clearTimeout(timer);
          pc.close();
          resolve();
          return;
        }
        const matches = ice.candidate.candidate.match(/([0-9]{1,3}\.){3}[0-9]{1,3}/g);
        if (matches) {
          matches.forEach(addr => {
            if (!seen.has(addr)) {
              seen.add(addr);
              const isLoopback = addr.startsWith('127.');
              ips.push({
                name: isLoopback ? '回环' : guessIPType(addr),
                address: addr,
                prefix: '',
                mask: '',
                type: isLoopback ? '回环' : guessIPType(addr),
                isLoopback,
                isIPv6: false
              });
            }
          });
        }
      };
    });

    return ips;
  } catch (e) {
    console.log('[SessionMaster] [WARN] 收集网络信息失败: ' + (e.message || e));
    return [];
  }
}

function guessIPType(ip) {
  if (ip.startsWith('192.168.')) return '有线/无线';
  if (ip.startsWith('10.')) return '有线/无线';
  if (ip.startsWith('172.')) {
    const n = parseInt(ip.split('.')[1], 10);
    if (n >= 16 && n <= 31) return '有线/无线';
  }
  if (ip.startsWith('127.')) return '回环';
  if (ip.startsWith('169.254.')) return '链路本地';
  return '其他';
}

// ========== 图标状态角标（动态动画）==========
// 空闲: 无角标
// 保活中: ♡♥ 跳动（绿色 #34a853）
// 同步中: ◴◷◶◵ 旋转（蓝色 #1a73e8）
// 两者  : ◴◷◶◵ 旋转（紫色 #7b1fa2）

let iconAnimTimer = null;

function stopIconAnimation() {
  if (iconAnimTimer) {
    clearInterval(iconAnimTimer);
    iconAnimTimer = null;
  }
}

function startIconAnimation(frames, intervalMs, bgColor) {
  stopIconAnimation();
  let i = 0;
  chrome.action.setBadgeBackgroundColor({ color: bgColor }).catch(() => {});
  chrome.action.setBadgeText({ text: frames[0] }).catch(() => {});
  iconAnimTimer = setInterval(() => {
    i = (i + 1) % frames.length;
    chrome.action.setBadgeText({ text: frames[i] }).catch(() => {});
  }, intervalMs);
}

async function updateIconState() {
  stopIconAnimation();
  const beats = await getHeartbeats();
  const config = await getSyncConfig();
  const serverConfig = await serverGetSyncConfig();
  const hasHeartbeat = beats.some(b => b.enabled);
  const hasSync = (config.enabled && config.mode === 'p2p') || serverConfig.enabled;

  if (hasHeartbeat && hasSync) {
    // 紫色旋转 — 两者都在运行
    startIconAnimation(['◴', '◷', '◶', '◵'], 250, '#7b1fa2');
  } else if (hasHeartbeat) {
    // 绿色心跳 — 保活中
    startIconAnimation(['♥', '♡', '♥', '♡', '♥', '♡', '♥', '♡', '♥', '♡'], 400, '#34a853');
  } else if (hasSync) {
    // 蓝色旋转 — 同步中
    startIconAnimation(['◴', '◷', '◶', '◵'], 250, '#1a73e8');
  } else {
    // 空闲: 无角标
    await chrome.action.setBadgeText({ text: '' });
  }
}

// ========== Cookie 管理 ==========

// 从 Cookie domain 构造有效的 API URL（去除前导点号）
function cookieApiUrl(domain, secure, path) {
  const host = domain.startsWith('.') ? domain.substring(1) : domain;
  return `${secure ? 'https' : 'http'}://${host}${path || '/'}`;
}

async function getCookies(domain) {
  let results = [];
  const formats = [];
  
  function addFormat(d) {
    if (!d || d.length < 2 || d.includes(' ')) return;
    if (!formats.includes(d)) formats.push(d);
    if (!d.startsWith('.')) {
      const dotted = '.' + d;
      if (!formats.includes(dotted)) formats.push(dotted);
    }
  }

  // 0. 清洗域名：去前导点、转小写、去端口
  const cleanDomain = (domain || '').replace(/^\./, '').toLowerCase().split(':')[0];
  if (!cleanDomain) return [];

  // 1. 总是先查原始域名（如 localhost、IP、裸域）
  addFormat(cleanDomain);

  // 2. 对多段域名，逐级向上查父级域
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cleanDomain)) {
    const parts = cleanDomain.split('.');
    if (parts.length >= 2) {
      for (let i = parts.length - 1; i >= 2; i--) {
        addFormat(parts.slice(parts.length - i).join('.'));
      }
    }
  }
  
  // 第一轮查询
  for (const d of formats) {
    try { results = results.concat(await chrome.cookies.getAll({ domain: d })); } catch (e) {}
  }
  
  // 3. 第二轮：从已找到的 Cookie 中提取额外域名再查一次（增强域名发现）
  const extraDomains = new Set();
  for (const c of results) {
    const d = c.domain.startsWith('.') ? c.domain.substring(1) : c.domain;
    if (!formats.includes(d) && !formats.includes('.' + d)) extraDomains.add(d);
  }
  for (const d of extraDomains) {
    try { results = results.concat(await chrome.cookies.getAll({ domain: d })); } catch (e) {}
    try { results = results.concat(await chrome.cookies.getAll({ domain: '.' + d })); } catch (e) {}
  }
  
  // 去重
  const seen = new Set();
  const deduped = results.filter(c => { 
    const key = `${c.name}:${c.domain}:${c.path}`; 
    if (seen.has(key)) return false; 
    seen.add(key); 
    return true; 
  });
  
  if (extraDomains.size > 0) {
    logger.debug('cookie', `增强域名发现: 额外查到 ${extraDomains.size} 个域, 总计 ${deduped.length} 个 Cookie`);
  }
  return deduped;
}

async function exportCookies(domain) {
  const cookies = await getCookies(domain);
  if (cookies.length === 0) {
    logger.warn('cookie', '导出 Cookie 为空: ' + domain);
    return { success: false, message: '未找到该域名的 Cookie，请先登录目标站点', data: null };
  }
  const exportTime = new Date().toISOString();
  const quickPrefix = '# Domain: ' + domain + '\n';
  // 提取所有关联域名用于统计
  const domains = [...new Set(cookies.map(c => c.domain))];
  const data = { 
    domain, exportTime, 
    _version: '2.0', 
    _storageTypes: ['cookies'],
    _stats: { totalDomains: domains.length, domains },
    cookies: cookies.map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path, secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite, hostOnly: c.hostOnly, expirationDate: c.expirationDate, _exportTime: exportTime })), 
    quick: quickPrefix + cookies.map(c => `${c.name}=${c.value}`).join('; ') 
  };
  logger.info('cookie', '导出 Cookie: ' + domain + ', ' + cookies.length + ' 个, ' + domains.length + ' 个关联域');
  return { success: true, message: `已导出 ${cookies.length} 个 Cookie（${domains.length} 个域）`, data };
}

async function importCookies(cookieData) {
  const results = { success: 0, failed: 0, errors: [] };
  for (const c of cookieData.cookies) {
    try {
      const details = { url: cookieApiUrl(c.domain, c.secure, c.path), name: c.name, value: c.value, path: c.path || '/', secure: c.secure !== false, httpOnly: c.httpOnly === true, sameSite: c.sameSite || 'lax' };
      if (c.expirationDate != null) details.expirationDate = c.expirationDate;
      if (!c.hostOnly) details.domain = c.domain;
      await chrome.cookies.set(details);
      results.success++;
    } catch (e) { results.failed++; results.errors.push(`${c.name}: ${e.message}`); }
  }
  logger.info('cookie', '导入 Cookie: 成功 ' + results.success + ' 个, 失败 ' + results.failed + ' 个');
  return results;
}

async function clearCookies(domain, skipHeartbeatRemoval = false) {
  const cookies = await getCookies(domain);
  let count = 0;
  for (const c of cookies) {
    try { const url = cookieApiUrl(c.domain, c.secure, c.path); await chrome.cookies.remove({ url, name: c.name }); count++; } catch (e) {}
  }
  let heartbeatRemoved = 0;
  // skipHeartbeatRemoval=true 时跳过保活处理（用于导入复合操作，导入后 Cookie 回来了）
  if (!skipHeartbeatRemoval) {
    // 同步移除该域名下的保活记录（Cookie 没了，保活无意义）
    let beats = await getHeartbeats();
    const idsToRemove = [];
    for (const b of beats) {
      if (b.domain && b.domain === domain) {
        idsToRemove.push(b.id);
        heartbeatRemoved++;
      }
    }
    if (heartbeatRemoved > 0) {
      beats = beats.filter(b => !idsToRemove.includes(b.id));
      await saveHeartbeats(beats);
      // 清理已移除保活对应的 alarm
      for (const id of idsToRemove) {
        chrome.alarms.clear('heartbeat_' + id).catch(() => {});
      }
      updateIconState().catch(() => {});
    }
  }
  logger.info('cookie', '清除 Cookie: ' + domain + ', 已清除 ' + count + ' 个' + (heartbeatRemoved > 0 ? ', 移除保活 ' + heartbeatRemoved + ' 条' : ''));
  return { removed: count, heartbeatRemoved };
}

// 复合操作：清除 Cookie（跳过保活移除）+ 导入 Cookie
// 用于粘贴/文件导入场景：清除旧 Cookie 后导入新 Cookie，保活记录不受影响
async function importWithCookieClear(domain, importData) {
  const clearResult = await clearCookies(domain, true);
  const importResult = await importCookiesUnconditional(importData);
  const imported = importResult.success || 0;
  const failed = importResult.failed || 0;
  
  // 按域名分组统计
  const byDomain = {};
  if (importData.cookies) {
    for (const c of importData.cookies) {
      const d = c.domain || domain;
      if (!byDomain[d]) byDomain[d] = { total: 0, ok: 0, fail: 0 };
      byDomain[d].total++;
    }
    // 从导入结果中匹配
    if (importResult.domainResults) {
      for (const [d, r] of Object.entries(importResult.domainResults)) {
        if (byDomain[d]) {
          byDomain[d].ok = r.success;
          byDomain[d].fail = r.failed;
        }
      }
    }
  }
  
  logger.info('cookie', '导入 Cookie（复合操作）: ' + domain + ', 已清除 ' + clearResult.removed + ' 个, 已导入 ' + imported + ' 个, 失败 ' + failed + ' 个, 保活记录未受影响');
  return {
    cleared: clearResult.removed,
    imported: imported,
    failed: failed,
    errors: importResult.errors || [],
    byDomain
  };
}

// ========== Cookie 版本控制 & 来源追踪 ==========

const SYNC_COOKIE_META_KEY = 'sync_cookie_meta';
// 元数据结构：{ "domain:name": { lastValue, origin: "local"|"remote", exportTime: "ISO" } }

async function getCookieMeta() {
  return await getStorage(SYNC_COOKIE_META_KEY, {});
}

async function saveCookieMeta(meta) {
  await setStorage(SYNC_COOKIE_META_KEY, meta);
}

// 智能导入：带版本控制 + 来源追踪
// 用于自动同步（P2P 和服务器模式），防止同步循环覆盖
async function importCookiesSmart(cookieData, fromDeviceId) {
  const results = { success: 0, failed: 0, skipped: 0, errors: [] };
  const meta = await getCookieMeta();
  const dataExportTime = cookieData.exportTime || new Date().toISOString();
  let changed = false;

  for (const c of cookieData.cookies) {
    const metaKey = `${c.domain}:${c.name}`;
    const incomingTime = c._exportTime || dataExportTime;

    // 策略1：值相同 → 跳过（防无效写入）
    try {
      const existing = await chrome.cookies.get({
        url: cookieApiUrl(c.domain, c.secure, c.path),
        name: c.name
      });
      if (existing && existing.value === c.value) {
        results.skipped++;
        continue;
      }
    } catch (e) {}

    // 策略2：检查来源时间戳 → 只导入更新的
    const stored = meta[metaKey];
    if (stored && stored.origin === 'local') {
      // 此 Cookie 是本机生成的，只接受更新时间比本地更新的
      if (incomingTime <= stored.exportTime) {
        results.skipped++;
        continue;
      }
    }

    // 执行导入
    try {
      const details = {
        url: cookieApiUrl(c.domain, c.secure, c.path),
        name: c.name, value: c.value,
        path: c.path || '/', secure: c.secure !== false,
        httpOnly: c.httpOnly === true, sameSite: c.sameSite || 'lax'
      };
      if (c.expirationDate != null) details.expirationDate = c.expirationDate;
      if (!c.hostOnly) details.domain = c.domain;
      await chrome.cookies.set(details);
      results.success++;

      // 标记为远程来源（导入的不会再次被导出）
      meta[metaKey] = { lastValue: c.value, origin: 'remote', exportTime: incomingTime };
      changed = true;
    } catch (e) {
      results.failed++;
      results.errors.push(`${c.name}: ${e.message}`);
    }
  }

  if (changed) await saveCookieMeta(meta);
  return results;
}

// 智能导出：只导出来源为 "local" 的 Cookie（防循环）
async function exportCookiesSmart(domain) {
  const cookies = await getCookies(domain);
  if (cookies.length === 0) return { success: false, message: '未找到该域名的 Cookie', data: null };
  
  const meta = await getCookieMeta();
  const exportTime = new Date().toISOString();
  
  // 只导出被标记为 "local" 或没有标记的 Cookie
  const syncCookies = cookies.filter(c => {
    const metaKey = `${c.domain}:${c.name}`;
    const stored = meta[metaKey];
    if (!stored) return true; // 无记录 = 本地生成
    if (stored.origin === 'local') return true;
    // 远程导入的 Cookie，检查值是否被 OA 动态更新
    if (c.value !== stored.lastValue) {
      // 值变了（页面动态更新），转为 local
      meta[metaKey] = { ...stored, origin: 'local', lastValue: c.value, exportTime };
      return true;
    }
    return false; // 远程导入的且值没变 → 不导出
  });
  
  await saveCookieMeta(meta);
  
  if (syncCookies.length === 0) return { success: false, message: '无可同步的 Cookie（从设备模式或来源追踪过滤）', data: null };
  
  const quickPrefix = '# Domain: ' + domain + '\n';
  const data = {
    domain, exportTime,
    cookies: syncCookies.map(c => ({
      name: c.name, value: c.value, domain: c.domain, path: c.path,
      secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite,
      hostOnly: c.hostOnly, expirationDate: c.expirationDate, _exportTime: exportTime
    })),
    quick: (quickPrefix + syncCookies.map(c => `${c.name}=${c.value}`).join('; '))
  };
  return { success: true, message: `已导出 ${syncCookies.length} 个 Cookie`, data };
}

// 无条件导入（用于手动导入，用户主动操作）
async function importCookiesUnconditional(cookieData) {
  const results = { success: 0, failed: 0, errors: [], domainResults: {} };
  for (const c of cookieData.cookies) {
    try {
      const details = {
        url: cookieApiUrl(c.domain, c.secure, c.path),
        name: c.name, value: c.value,
        path: c.path || '/', secure: c.secure !== false,
        httpOnly: c.httpOnly === true, sameSite: c.sameSite || 'lax'
      };
      if (c.expirationDate != null) details.expirationDate = c.expirationDate;
      if (!c.hostOnly) details.domain = c.domain;
      await chrome.cookies.set(details);
      results.success++;
      // 按域名统计
      const d = c.domain || 'unknown';
      if (!results.domainResults[d]) results.domainResults[d] = { success: 0, failed: 0 };
      results.domainResults[d].success++;
    } catch (e) {
      results.failed++;
      results.errors.push(`${c.name}: ${e.message}`);
      const d = c.domain || 'unknown';
      if (!results.domainResults[d]) results.domainResults[d] = { success: 0, failed: 0 };
      results.domainResults[d].failed++;
    }
  }
  return results;
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

async function getSyncConfig() {
  return await getStorage(STORAGE_KEYS.SYNC_CONFIG, { ...SYNC_DEFAULTS });
}

async function saveSyncConfig(config) {
  const existing = await getSyncConfig();
  Object.assign(existing, config);
  await setStorage(STORAGE_KEYS.SYNC_CONFIG, existing);
  return existing;
}

// ========== P2P 连接管理 ==========

let p2pConnections = {};  // { peerId: { connection: RTCPeerConnection, channel: RTCDataChannel, signalInterval } }
let p2pPollTimer = null;
let currentP2PRoomId = '';
let currentP2PPeerId = '';

async function getSignalUrl() {
  const config = await getSyncConfig();
  return config.signalUrl || SYNC_DEFAULTS.signalUrl;
}

function generateP2PPeerId() {
  return 'p2p-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
}

// 创建 P2P 配对房间
async function p2pCreateRoom(deviceName, signalUrl) {
  const peerId = generateP2PPeerId();
  if (!signalUrl) signalUrl = await getSignalUrl();

  try {
    const resp = await fetch(`${signalUrl}/api/signal/room`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', peerId, deviceName: deviceName || peerId })
    });
    const data = await resp.json();
    if (!data.roomId) throw new Error('创建配对失败');

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
async function p2pJoinRoom(roomId, deviceName, signalUrl) {
  const peerId = generateP2PPeerId();
  if (!signalUrl) signalUrl = await getSignalUrl();

  try {
    const resp = await fetch(`${signalUrl}/api/signal/room`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'join', roomId, peerId, deviceName: deviceName || peerId })
    });
    const data = await resp.json();
    if (!data.roomId) throw new Error('加入配对失败');

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
    const connectedAt = new Date().toISOString();
    addSyncHistoryEntry('p2p_connect', '已连接到 ' + (deviceName || toPeer));
    saveSyncConfig({ p2pConnectedAt: connectedAt, p2pConnectedPeerName: deviceName || toPeer });
    channel.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        await handleP2PMessage(msg, toPeer);
      } catch (e) { console.warn('[P2P] 消息解析失败:', e); }
    };
    p2pSync(toPeer);
    chrome.runtime.sendMessage({ action: 'p2pStatusUpdate', connected: true, peerId: toPeer, connectedAt, peerName: deviceName || '' }).catch(() => {});
  };

  channel.onclose = () => {
    console.log('[SessionMaster P2P] 数据通道关闭:', toPeer);
    notifyUser('SessionMaster', 'P2P 对端已断开连接');
    chrome.runtime.sendMessage({ action: 'p2pStatusUpdate', connected: false, peerId: toPeer }).catch(() => {});
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
      const connectedAt = new Date().toISOString();
      saveSyncConfig({ p2pConnectedAt: connectedAt, p2pConnectedPeerName: '' });
      rc.onmessage = async (ev) => {
        try { await handleP2PMessage(JSON.parse(ev.data), toPeer); } catch (e) {}
      };
      p2pSync(toPeer);
      chrome.runtime.sendMessage({ action: 'p2pStatusUpdate', connected: true, peerId: toPeer, connectedAt }).catch(() => {});
    };
    rc.onclose = () => { 
      notifyUser('SessionMaster', 'P2P 接收通道已关闭');
      chrome.runtime.sendMessage({ action: 'p2pStatusUpdate', connected: false, peerId: toPeer }).catch(() => {}); 
    };
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
            chrome.runtime.sendMessage({ action: 'p2pPeerJoined', peerDeviceName: msg.data.deviceName }).catch(() => {});
            initiateP2PConnection(signalUrl, roomId, peerId, msg.from, msg.data.deviceName);
          } else if (msg.type === 'peer_left') {
            chrome.runtime.sendMessage({ action: 'p2pPeerLeft', peerId: msg.from }).catch(() => {});
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
  await saveSyncConfig({ p2pConnected: false, p2pConnectedAt: null, p2pConnectedPeerName: '' });
  notifyUser('SessionMaster', 'P2P 连接已断开');
}

// P2P 同步：发送 Cookie 给对端
async function p2pSync(targetPeer) {
  const config = await getSyncConfig();
  const domain = config.syncedDomains?.[0];
  if (!domain) return;

  // 主从检查：从设备不发送 Cookie
  if (config.masterMode && !config.isMaster) return;

  const exportResult = await exportCookiesSmart(domain);
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
      const importResult = await importCookiesSmart(cookieData, fromPeer);
      if (importResult.success > 0) {
        await saveSyncConfig({ lastSyncTime: new Date().toISOString() });
        addSyncHistoryEntry('p2p_sync', '从对端同步了 ' + importResult.success + ' 个 Cookie' + (importResult.skipped > 0 ? '（跳过 ' + importResult.skipped + ' 个未变更）' : ''));
        chrome.runtime.sendMessage({ action: 'p2pSyncComplete', imported: importResult.success, fromPeer }).catch(() => {});
      }
    } catch (e) {
      console.warn('[P2P] 解密/导入失败:', e.message);
    }
  }
}

// ========== 云端同步核心逻辑（服务器模式）==========

async function serverGetSyncConfig() {
  return await getStorage(STORAGE_KEYS.SERVER_SYNC_CONFIG, { ...SERVER_SYNC_DEFAULTS });
}

async function serverSaveSyncConfig(updates) {
  const config = await serverGetSyncConfig();
  Object.assign(config, updates);
  await setStorage(STORAGE_KEYS.SERVER_SYNC_CONFIG, config);
  return config;
}

async function serverRegisterDevice() {
  const config = await serverGetSyncConfig();
  if (!config.serverUrl || !config.pairKey) return { success: false, error: '请先配置服务器地址和配对码' };
  try {
    const resp = await fetch(`${config.serverUrl}/api/pair`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: config.pairKey, deviceId: config.deviceId || undefined, deviceName: config.deviceName || `Browser-${Date.now().toString(36)}`, isMaster: config.isMaster !== false })
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
    // 主从检查：从设备不上传
    if (!config.masterMode || config.isMaster) {
      const exportResult = await exportCookiesSmart(syncDomain);
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
    } else {
      results.upload = { skipped: true, message: '从设备模式，跳过上传' };
    }
  }

  try {
    const resp = await fetch(`${config.serverUrl}/api/sync/download?key=${config.pairKey}&deviceId=${config.deviceId}`);
    const downloadData = await resp.json();
    results.download = downloadData;
    // 保存设备状态和冲突警告到配置中
    if (downloadData.warnings) {
      await serverSaveSyncConfig({ masterWarnings: downloadData.warnings, masterDevices: downloadData.devices || [] });
    }
    if (downloadData.success && downloadData.data) {
      for (const [deviceId, cookieEntry] of Object.entries(downloadData.data)) {
        if (cookieEntry.data && cookieEntry.data.length > 0) {
          try {
            const decryptedStr = await decryptData(cookieEntry.data, config.pairKey);
            const cookieData = JSON.parse(decryptedStr);
            const importResult = await importCookiesSmart(cookieData, deviceId);
            if (importResult.success > 0) { results.imported = true; addSyncHistoryEntry('server_sync', '从 ' + deviceId + ' 同步了 ' + importResult.success + ' 个 Cookie' + (importResult.skipped > 0 ? '（跳过 ' + importResult.skipped + ' 个）' : '')); console.log('[SessionMaster] 从 ' + deviceId + ' 同步了 ' + importResult.success + ' 个 Cookie'); }
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
    updateIconState().catch(() => {});
    return { success: true, message: `已启用同步（每 ${intervalMinutes} 分钟）` };
  } else {
    chrome.alarms.clear('sessionSync');
    await serverSaveSyncConfig({ enabled: false });
    updateIconState().catch(() => {});
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
    if (beat && beat.enabled) {
      const result = await performHeartbeat(beat);
      beat.lastHeartbeatTime = new Date().toISOString();
      beat.lastStatus = result.success ? 'ok' : 'fail';
      beat.lastStatusDetail = result.success ? ('HTTP ' + result.status) : result.error;
      await saveHeartbeats(beats);
    }
  }
  if (alarm.name === 'versionCheck') {
    checkForUpdate();
  }
  if (alarm.name === 'rulesDBSync') {
    checkRulesDBAutoSync();
  }
});

// ========== 升级检测 ==========

/** 语义版本比较：a > b 返回 1，a < b 返回 -1，相等返回 0 */
function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

/** 从 GitHub 检查新版本 */
async function checkForUpdate() {
  const updateConfig = await getStorage(STORAGE_KEYS.UPDATE_CONFIG, { url: UPDATE.DEFAULT_URL, enabled: UPDATE.ENABLED });
  if (!updateConfig.enabled) return;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT.VERSION_CHECK_MS);
    const resp = await fetch(updateConfig.url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const remoteVersion = (await resp.text()).trim();

    const currentVersion = chrome.runtime.getManifest().version;
    const updateAvailable = compareVersions(remoteVersion, currentVersion) > 0;

    // 通过 devel 后缀检测是否需要切换更新源
    const devBuild = currentVersion.includes('-dev') || currentVersion.includes('-beta');

    const result = {
      remoteVersion,
      currentVersion,
      devBuild,
      updateAvailable,
      checkedAt: Date.now(),
      message: updateAvailable
        ? `新版本 ${remoteVersion} 可用（当前 ${currentVersion}）`
        : `已是最新版本 ${currentVersion}`
    };

    await setStorage('update_last_check', result);
    logger.info('update', result.message);

    if (updateAvailable) {
      chrome.action.setBadgeText({ text: 'NEW' });
      chrome.action.setBadgeBackgroundColor({ color: '#e74c3c' });
      notifyUser('SessionMaster 有更新', `版本 ${remoteVersion} 已发布，当前 ${currentVersion}，请前往 GitHub 获取`);
    } else {
      // 清除角标
      chrome.action.setBadgeText({ text: '' });
    }
  } catch (e) {
    console.warn('[SessionMaster] 版本检查失败:', e.message);
  }
}

// ========== 保活管理 ==========

const HEARTBEAT_KEY = 'heartbeat_configs';

// 保活配置结构: { id, url, domain, intervalMinutes, enabled }

async function getHeartbeats() { return await getStorage(HEARTBEAT_KEY, []); }

async function saveHeartbeats(beats) {
  await setStorage(HEARTBEAT_KEY, beats);
  // 先清除所有旧 alarm，再重新创建
  const allAlarms = await chrome.alarms.getAll();
  const existing = allAlarms.filter(a => a.name.startsWith('heartbeat_'));
  await Promise.all(existing.map(a => chrome.alarms.clear(a.name)));
  for (const beat of beats) {
    if (beat.enabled && beat.url) {
      chrome.alarms.create('heartbeat_' + beat.id, { periodInMinutes: beat.intervalMinutes || 10 });
    }
  }
}

async function addHeartbeat(url, interval, domain, siteName) {
  const beats = await getHeartbeats();
  // 检查是否已存在相同 URL
  const trimmedUrl = url.trim();
  const existing = beats.find(b => b.url === trimmedUrl);
  if (existing) {
    return { success: false, error: '该 URL 已添加保活，请勿重复添加' };
  }
  const id = 'hb_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 4);
  // 如果未传 domain，从 URL 自动提取
  let siteDomain = domain || '';
  if (!siteDomain) {
    try { siteDomain = new URL(url.trim().startsWith('http') ? url.trim() : 'https://' + url.trim()).hostname; } catch {}
  }
  beats.push({ id, url: url.trim(), domain: siteDomain || '', siteName: siteName || '', intervalMinutes: interval || 10, enabled: true, createdAt: new Date().toISOString() });
  await saveHeartbeats(beats);
  updateIconState().catch(() => {});
  return { success: true, heartbeats: beats };
}

async function removeHeartbeat(id) {
  let beats = await getHeartbeats();
  beats = beats.filter(b => b.id !== id);
  await saveHeartbeats(beats);
  chrome.alarms.clear('heartbeat_' + id);
  updateIconState().catch(() => {});
  return { success: true, heartbeats: beats };
}

async function toggleHeartbeat(id, enabled) {
  const beats = await getHeartbeats();
  const beat = beats.find(b => b.id === id);
  if (!beat) return { success: false, error: '未找到该保活配置' };
  beat.enabled = enabled;
  await saveHeartbeats(beats);
  updateIconState().catch(() => {});
  return { success: true, heartbeats: beats };
}

async function performHeartbeat(beat) {
  if (!beat.url) return { success: false, error: 'URL 为空' };
  try {
    const url = beat.domain
      ? (beat.url.startsWith('http') ? beat.url : 'https://' + beat.domain + (beat.url.startsWith('/') ? '' : '/') + beat.url)
      : beat.url;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(url, { method: 'GET', signal: controller.signal, mode: 'no-cors' });
    clearTimeout(timer);
    console.log('[SessionMaster 保活] ✅', url, resp.status);
    return { success: true, status: resp.status };
  } catch (e) {
    console.log('[SessionMaster 保活] ⏸️', beat.url, e.message);
    return { success: false, error: e.message };
  }
}

// ========== 同步历史记录 ==========

const SYNC_HISTORY_KEY = 'sync_history';
const MAX_HISTORY = 50;

async function getSyncHistory() {
  return await getStorage(SYNC_HISTORY_KEY, []);
}

async function addSyncHistoryEntry(type, detail) {
  let history = await getSyncHistory();
  history.unshift({ time: new Date().toISOString(), type, detail });
  if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
  await setStorage(SYNC_HISTORY_KEY, history);
  return history;
}

async function clearSyncHistory() {
  await setStorage(SYNC_HISTORY_KEY, []);
  return [];
}

// ========== 内置 DNR 规则管理 ==========
// 从 blocking_rules.json 加载并动态注册 DNR 规则
// 替换原 manifest.json 中的 static ruleset，使规则可被 masterEnabled 控制

const BUILTIN_DNR_RULES_ID_OFFSET = 100;
const BUILTIN_DNR_RULES_SOURCE = 'blocking_rules.json';

async function loadBuiltinDNRRules() {
  try {
    const resp = await fetch(chrome.runtime.getURL(BUILTIN_DNR_RULES_SOURCE));
    const rules = await resp.json();
    return rules || [];
  } catch (e) {
    logger.info('blocker', '读取内置 DNR 规则失败: ' + e.message);
    return [];
  }
}

async function updateBuiltinDNRRules(enabled) {
  const currentRules = await chrome.declarativeNetRequest.getDynamicRules();
  // 只管理内置规则（ID 范围 100-199）
  const currentBuiltinIds = currentRules
    .filter(r => r.id >= BUILTIN_DNR_RULES_ID_OFFSET && r.id < BUILTIN_DNR_RULES_ID_OFFSET + 100)
    .map(r => r.id);
  
  if (enabled) {
    const builtinRules = await loadBuiltinDNRRules();
    const dnrRules = builtinRules.map((rule, index) => ({
      id: BUILTIN_DNR_RULES_ID_OFFSET + index,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: rule.condition.urlFilter,
        resourceTypes: rule.condition.resourceTypes || ['xmlhttprequest', 'script', 'other']
      }
    }));
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [...currentBuiltinIds],
      addRules: dnrRules
    });
    logger.info('blocker', '内置 DNR 规则已加载: ' + dnrRules.length + ' 条');
  } else {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: currentBuiltinIds,
      addRules: []
    });
    logger.info('blocker', '内置 DNR 规则已卸载');
  }
}

// 重写 getBlockerConfig 的 setter 调用，使其在 masterEnabled 变化时联动 DNR 规则
// 在 getBlockerConfig 的写入逻辑中会调用此函数

const USER_RULES_KEY = 'user_blocking_rules';
const RULES_DB_KEY = 'blocking_rules_db';
const RULES_DB_SYNC_KEY = 'rules_db_last_sync_check';

async function getUserBlockingRules() { return await getStorage(USER_RULES_KEY, []); }

async function addUserBlockingRule(urlPattern) {
  const rules = await getUserBlockingRules();
  if (rules.includes(urlPattern)) return { success: false, message: '该规则已存在' };
  rules.push(urlPattern);
  await setStorage(USER_RULES_KEY, rules);
  await updateDynamicRules(rules);
  logger.info('blocker', '添加自定义规则: ' + urlPattern);
  return { success: true, message: '规则已添加', rules };
}

async function removeUserBlockingRule(urlPattern) {
  let rules = await getUserBlockingRules();
  rules = rules.filter(r => r !== urlPattern);
  await setStorage(USER_RULES_KEY, rules);
  await updateDynamicRules(rules);
  logger.info('blocker', '删除自定义规则: ' + urlPattern);
  return { success: true, message: '规则已删除', rules };
}

async function updateDynamicRules(rules) {
  const newRules = rules.map((pattern, index) => ({ id: 1000 + index, priority: 1, action: { type: 'block' }, condition: { urlFilter: pattern, resourceTypes: ['xmlhttprequest', 'script', 'other', 'sub_frame'] } }));
  const currentRules = await chrome.declarativeNetRequest.getDynamicRules();
  const currentIds = currentRules.map(r => r.id);
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: currentIds, addRules: newRules });
}

// 规则库管理
async function getRulesDB() {
  let db = await getStorage(RULES_DB_KEY, null);
  // 首次加载或本地版本落后于内置版本时，从内置文件重新加载
  if (!db || !db.version || db.version < 2) {
    try {
      const resp = await fetch(chrome.runtime.getURL('blocking_rules_db.json'));
      const bundled = await resp.json();
      if (!db) {
        // 全新安装：直接用内置数据
        db = bundled;
        await setStorage(RULES_DB_KEY, db);
      } else if (bundled.version > (db.version || 0)) {
        // 升级：保留用户的自定义规则（sites），但用内置的 updateUrl/版本号
        db.version = bundled.version;
        db.updateUrl = bundled.updateUrl;
        db.lastUpdated = bundled.lastUpdated;
        await setStorage(RULES_DB_KEY, db);
        logger.info('blocker', '规则库已从内置文件升级到 v' + bundled.version);
      }
    } catch (e) {
      if (!db) db = { version: 1, lastUpdated: '', updateUrl: '', sites: [], generic: [] };
    }
  }
  return db;
}

async function saveRulesDB(db) {
  await setStorage(RULES_DB_KEY, db);
  return db;
}

function matchSitesByDomain(db, domain) {
  if (!db || !db.sites || !domain) return [];
  // 去掉端口号（如 oa.zumri.cn:8881 → oa.zumri.cn）
  const cleanDomain = domain.split(':')[0].toLowerCase();
  const matched = [];
  for (const site of db.sites) {
    for (const d of site.domains) {
      const pattern = d.replace(/^(\*\.)?/, '').toLowerCase();
      // 精确匹配: domain === pattern 或 endsWith .pattern
      if (cleanDomain === pattern || cleanDomain.endsWith('.' + pattern)) {
        matched.push(site);
        console.log('[SessionMaster 规则匹配] ✅', site.name, '←', cleanDomain, '(模式:', d + ')');
        break;
      }
      // 通配: 如果 pattern 是 IP 或短域名，尝试用 startsWith
      if (pattern.indexOf('.') < 0 && cleanDomain.startsWith(pattern + '.')) {
        matched.push(site);
        console.log('[SessionMaster 规则匹配] ✅', site.name, '←', cleanDomain, '(通配:', d + ')');
        break;
      }
    }
  }
  if (matched.length === 0) console.log('[SessionMaster 规则匹配] ⏸️', cleanDomain, '未匹配规则');
  return matched;
}

// 获取当前站点的推荐规则（匹配的内置 + 通用规则）
async function getRecommendedRules(domain) {
  const db = await getRulesDB();
  const matched = matchSitesByDomain(db, domain);
  const keywords = [...(db.generic || [])];
  for (const site of matched) {
    for (const kw of (site.keywords || [])) {
      if (!keywords.includes(kw)) keywords.push(kw);
    }
  }
  return { sites: matched, keywords, generic: db.generic || [], keywordLabels: db.keywordLabels || {} };
}

// 远程更新规则库（带版本检查：仅远程版本>本地时才更新）
async function updateRulesDBFromServer() {
  const db = await getRulesDB();
  if (!db.updateUrl) return { success: false, error: '未配置更新地址' };
  try {
    const resp = await fetch(db.updateUrl, { signal: AbortSignal.timeout(15000) });
    const remote = await resp.json();
    if (!remote.sites || !Array.isArray(remote.sites)) return { success: false, error: '远程数据格式无效' };
    // 版本检查：远程版本号 ≤ 本地时跳过
    const localVer = db.version || 0;
    const remoteVer = remote.version || 0;
    if (remoteVer <= localVer) {
      return { success: true, message: '规则库已是最新', skipped: true, localVersion: localVer };
    }
    await saveRulesDB(remote);
    logger.info('blocker', '规则库已远程更新: v' + localVer + ' → v' + remoteVer + '（' + remote.sites.length + ' 个站点）');
    return { success: true, message: '已更新到 v' + remoteVer + '，共 ' + remote.sites.length + ' 个站点', localVersion: localVer, remoteVersion: remoteVer };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 启动时自动同步规则库（24 小时内不重复检查）
async function checkRulesDBAutoSync() {
  const db = await getRulesDB();
  if (!db.updateUrl) return;
  const lastCheck = await getStorage(RULES_DB_SYNC_KEY, 0);
  const now = Date.now();
  if (now - lastCheck < 24 * 60 * 60 * 1000) return;
  await setStorage(RULES_DB_SYNC_KEY, now);
  const result = await updateRulesDBFromServer();
  if (result.success) {
    logger.info('blocker', '规则库自动同步: ' + result.message);
  } else {
    logger.warn('blocker', '规则库自动同步失败: ' + (result.error || '未知错误'));
  }
}

// 获取规则库同步状态信息（供弹窗展示）
async function getRulesDBSyncInfo() {
  const db = await getRulesDB();
  const lastCheck = await getStorage(RULES_DB_SYNC_KEY, 0);
  return {
    version: db.version || 1,
    lastUpdated: db.lastUpdated || '',
    updateUrl: db.updateUrl || '',
    lastCheckTime: lastCheck ? new Date(lastCheck).toLocaleString('zh-CN') : '从未检查',
    siteCount: (db.sites || []).length
  };
}

// 导出规则库为 JSON 字符串
async function exportRulesDB() {
  const db = await getRulesDB();
  return JSON.stringify(db, null, 2);
}

// 导入规则库
async function importRulesDB(jsonStr) {
  try {
    const db = JSON.parse(jsonStr);
    if (!db.sites || !Array.isArray(db.sites)) return { success: false, error: '格式无效：缺少 sites 数组' };
    await saveRulesDB(db);
    return { success: true, message: `已导入 ${db.sites.length} 个站点规则`, sites: db.sites.length };
  } catch (e) {
    return { success: false, error: 'JSON 解析失败: ' + e.message };
  }
}

// ========== 拦截模块配置（主开关 + 自动/手动模式）==========

const BLOCKER_CONFIG_KEY = 'blocker_config';
const DEFAULT_BLOCKER_CONFIG = {
  masterEnabled: false,
  siteEnabled: {},        // { siteId: true/false }
  keywordOverrides: {}    // { keyword: true/false }
};

async function getBlockerConfig() {
  return await getStorage(BLOCKER_CONFIG_KEY, DEFAULT_BLOCKER_CONFIG);
}

async function saveBlockerConfig(config) {
  // 合并默认值（保证新加的字段不会丢失）
  const merged = { ...DEFAULT_BLOCKER_CONFIG, ...config };
  // 清理旧的 siteEnabled 条目（规则库中已不存在的站点）
  if (merged.siteEnabled) {
    const db = await getRulesDB();
    const validIds = new Set((db.sites || []).map(s => s.id));
    for (const id of Object.keys(merged.siteEnabled)) {
      if (!validIds.has(id)) delete merged.siteEnabled[id];
    }
  }
  await setStorage(BLOCKER_CONFIG_KEY, merged);
  const changes = [];
  if (config && config.masterEnabled !== undefined) changes.push('主开关=' + config.masterEnabled);
  if (config && config.mode !== undefined) changes.push('模式=' + config.mode);
  if (changes.length > 0) logger.info('blocker', '拦截配置变更: ' + changes.join(', '));
  // masterEnabled 变化时联动 DNR 动态规则（静默执行，不阻塞保存流程）
  if (config && config.masterEnabled !== undefined) {
    updateBuiltinDNRRules(config.masterEnabled).catch(() => {});
  }
  return merged;
}

// ========== 退出保护配置 ==========
// 默认内置开启，可在配置文件中修改

const LOGOUT_PROTECTION_KEY = 'logout_protection_config';

async function getLogoutProtectionConfig() {
  return await getStorage(LOGOUT_PROTECTION_KEY, { enabled: true });
}

async function saveLogoutProtectionConfig(config) {
  const merged = { enabled: config.enabled === true };
  await setStorage(LOGOUT_PROTECTION_KEY, merged);
  logger.info('blocker', '退出保护: ' + (merged.enabled ? '开启' : '关闭'));
  return merged;
}

// ========== 拦截模块业务逻辑 ==========

async function isBlockingEnabledForDomain(domain) {
  const config = await getBlockerConfig();
  if (!config.masterEnabled) return false;
  if (!domain) return true;
  const db = await getRulesDB();
  const matched = matchSitesByDomain(db, domain);
  if (matched.length === 0) return false;
  // 只要有匹配的站点且该站点未被关闭，拦截即生效
  for (const site of matched) {
    if (config.siteEnabled[site.id] !== false) return true;
  }
  return false;
}

// 获取当前站点已经启用的有效关键词列表（排除被覆盖关闭的）
async function getEffectiveKeywords(domain) {
  const config = await getBlockerConfig();
  if (!config.masterEnabled) return [];
  const result = await getRecommendedRules(domain);
  if (!result.keywords || result.keywords.length === 0) return [];
  // 检查站点是否开启（默认开启）
  const matched = result.sites || [];
  const enabledSites = matched.filter(s => config.siteEnabled[s.id] !== false);
  if (enabledSites.length === 0) return [];
  // 过滤被用户手动关闭的关键词
  return result.keywords.filter(kw => config.keywordOverrides[kw] !== false);
}

// ========== API 消息处理 ==========

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    switch (request.action) {
      // ---- Cookie 管理 ----
      case 'getCookies': sendResponse(await exportCookies(request.domain)); break;
      case 'importCookies': sendResponse(await importCookiesUnconditional(request.data)); break;
      case 'importWithCookieClear': sendResponse(await importWithCookieClear(request.domain, request.data)); break;
      case 'clearCookies': sendResponse(await clearCookies(request.domain)); break;
      case 'getDomainFromUrl': try { sendResponse({ domain: new URL(request.url).hostname }); } catch { sendResponse({ domain: '' }); } break;

      // ---- localStorage 同步（腾讯视频等双存储站点） ----
      case 'readLocalStorage':
        try {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tabs.length === 0) { sendResponse({ success: false, message: '未找到活动标签页' }); break; }
          chrome.tabs.sendMessage(tabs[0].id, { action: 'readLocalStorage', keys: request.keys }, (resp) => {
            sendResponse(resp || { success: false, message: 'content script 未响应' });
          }).catch(() => sendResponse({ success: false, message: 'content script 未响应' }));
        } catch (e) {
          sendResponse({ success: false, message: e.message });
        }
        return true; // 异步响应
      case 'writeLocalStorage':
        try {
          const tabs2 = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tabs2.length === 0) { sendResponse({ success: false, message: '未找到活动标签页' }); break; }
          chrome.tabs.sendMessage(tabs2[0].id, { action: 'writeLocalStorage', data: request.data }, (resp) => {
            sendResponse(resp || { success: false, message: 'content script 未响应' });
          }).catch(() => sendResponse({ success: false, message: 'content script 未响应' }));
        } catch (e) {
          sendResponse({ success: false, message: e.message });
        }
        return true; // 异步响应

      // ---- 拦截规则 ----
      case 'getBlockingRules': sendResponse({ rules: await getUserBlockingRules() }); break;
      case 'addBlockingRule': sendResponse(await addUserBlockingRule(request.urlPattern)); break;
      case 'removeBlockingRule': sendResponse(await removeUserBlockingRule(request.urlPattern)); break;

      // ---- 规则库（按站归类）----
      case 'getRulesDB': sendResponse(await getRulesDB()); break;
      case 'getRulesDBSyncInfo': sendResponse(await getRulesDBSyncInfo()); break;
      case 'getRecommendedRules': sendResponse(await getRecommendedRules(request.domain)); break;
      case 'updateRulesDBFromServer': sendResponse(await updateRulesDBFromServer()); break;
      case 'exportRulesDB': sendResponse({ data: await exportRulesDB() }); break;
      case 'importRulesDB': sendResponse(await importRulesDB(request.data)); break;

      // ---- 拦截模块配置（主开关 + 自动/手动） ----
      case 'getBlockerConfig': sendResponse(await getBlockerConfig()); break;
      case 'saveBlockerConfig': sendResponse(await saveBlockerConfig(request.config)); break;
      case 'isBlockingEnabled': sendResponse({ enabled: await isBlockingEnabledForDomain(request.domain) }); break;
      case 'getEffectiveKeywords': sendResponse({ keywords: await getEffectiveKeywords(request.domain), keywordLabels: (await getRulesDB()).keywordLabels || {} }); break;

      // ---- 退出保护 ----
      case 'isLogoutProtectionEnabled': sendResponse({ enabled: (await getLogoutProtectionConfig()).enabled }); break;
      case 'saveLogoutProtectionConfig':
        sendResponse(await saveLogoutProtectionConfig(request.config));
        break;
      case 'backupCookiesForDomain':
        // 备份当前域名的 Cookie 到 storage，用于"更换账号"场景
        if (request.domain) {
          // 去端口、去前导点，chrome.cookies.getAll 期望纯域名
          const cleanDomain = request.domain.replace(/^\\./, '').toLowerCase().split(':')[0];
          const cookies = await chrome.cookies.getAll({ domain: cleanDomain });
          await setStorage('backup_cookies_' + cleanDomain, { cookies, time: Date.now() });
          sendResponse({ success: true, count: cookies.length });
        } else {
          sendResponse({ success: false, error: 'no domain' });
        }
        break;

      // ---- 同步配置 ----
      case 'getSyncConfig': sendResponse(await getSyncConfig()); break;
      case 'saveSyncConfig': sendResponse(await saveSyncConfig(request.config)); break;
      case 'saveMasterMode':
        await saveSyncConfig({ masterMode: request.masterMode, isMaster: request.isMaster });
        await serverSaveSyncConfig({ masterMode: request.masterMode, isMaster: request.isMaster });
        updateIconState().catch(() => {});
        sendResponse({ success: true });
        break;

      // ---- P2P 模式 ----
      case 'p2pCreateRoom':
        sendResponse(await p2pCreateRoom(request.deviceName, request.signalUrl));
        break;
      case 'p2pJoinRoom':
        sendResponse(await p2pJoinRoom(request.roomId, request.deviceName, request.signalUrl));
        break;
      case 'p2pDisconnect':
        await p2pDisconnect();
        addSyncHistoryEntry('p2p_disconnect', '已断开 P2P 连接');
        sendResponse({ success: true });
        break;
      case 'p2pManualSync':
        for (const peerId of Object.keys(p2pConnections)) {
          if (p2pConnections[peerId].channel?.readyState === 'open') p2pSync(peerId);
        }
        addSyncHistoryEntry('p2p_sync', '已手动触发 P2P 同步');
        sendResponse({ success: true });
        break;
      case 'p2pToggleSync':
        if (request.enabled) {
          await saveSyncConfig({ enabled: true });
          chrome.alarms.create('p2pSyncAlarm', { periodInMinutes: request.intervalMinutes || 5 });
          addSyncHistoryEntry('p2p_enable', '已启用 P2P 自动同步（每 ' + (request.intervalMinutes || 5) + ' 分钟）');
          updateIconState().catch(() => {});
          sendResponse({ success: true, message: '已启用 P2P 同步' });
        } else {
          chrome.alarms.clear('p2pSyncAlarm');
          await saveSyncConfig({ enabled: false });
          addSyncHistoryEntry('p2p_disable', '已禁用 P2P 自动同步');
          updateIconState().catch(() => {});
          sendResponse({ success: true, message: '已禁用 P2P 同步' });
        }
        break;

      // ---- 服务器模式 ----
      case 'serverGetSyncConfig': sendResponse(await serverGetSyncConfig()); break;
      case 'serverSaveSyncConfig': sendResponse(await serverSaveSyncConfig(request.config)); break;
      case 'serverToggleSync': sendResponse(await serverToggleSync(request.enabled)); break;
      case 'serverManualSync':
        sendResponse(await serverPerformSync());
        addSyncHistoryEntry('server_sync', '已手动触发服务器同步');
        break;
      case 'serverRegisterDevice': sendResponse(await serverRegisterDevice()); break;
      case 'serverGetPairStatus':
        const sConfig = await serverGetSyncConfig();
        if (!sConfig.serverUrl || !sConfig.pairKey) { sendResponse({ success: false, error: '未配置' }); break; }
        try {
          const resp = await fetch(`${sConfig.serverUrl}/api/pair/status?key=${sConfig.pairKey}`);
          sendResponse(await resp.json());
        } catch (e) { sendResponse({ success: false, error: e.message }); }
        break;

      // ---- 获取/保存升级检测配置 ----
      case 'getUpdateConfig':
        sendResponse(await getStorage(STORAGE_KEYS.UPDATE_CONFIG, { url: UPDATE.DEFAULT_URL, enabled: UPDATE.ENABLED }));
        break;
      case 'setUpdateConfig':
        await setStorage(STORAGE_KEYS.UPDATE_CONFIG, request.config);
        sendResponse({ success: true });
        break;
      case 'checkUpdate':
        try {
          const lastCheck = await getStorage('update_last_check', null);
          const stale = !lastCheck || (Date.now() - lastCheck.checkedAt) > (UPDATE.CHECK_INTERVAL_MINUTES * 60 * 1000 / 2);
          if (stale || request.force) {
            await checkForUpdate();
            sendResponse({ ...(await getStorage('update_last_check', null)), rechecked: true });
          } else {
            sendResponse({ ...lastCheck, rechecked: false });
          }
        } catch (e) {
          sendResponse({ error: e.message });
        }
        break;
      case 'getAppConfig':
        sendResponse(APP_CONFIG);
        break;

      // ---- 保活 ----
      case 'getHeartbeats': sendResponse({ heartbeats: await getHeartbeats() }); break;
      case 'addHeartbeat':
        sendResponse(await addHeartbeat(request.url, request.interval, request.domain, request.siteName));
        break;
      case 'removeHeartbeat':
        sendResponse(await removeHeartbeat(request.id));
        break;
      case 'toggleHeartbeat':
        sendResponse(await toggleHeartbeat(request.id, request.enabled));
        break;
      case 'pauseAllHeartbeats':
        let allBeats = await getHeartbeats();
        let paused = 0;
        for (const b of allBeats) {
          if (b.enabled) { b.enabled = false; paused++; }
        }
        await saveHeartbeats(allBeats);
        updateIconState().catch(() => {});
        sendResponse({ success: true, paused });
        break;
      case 'getCookieMetaForDomain':
        const allMeta = await getCookieMeta();
        const filtered = {};
        for (const [key, val] of Object.entries(allMeta)) {
          const domainPart = key.split(':')[0];
          if (domainPart.includes(request.domain) || request.domain.includes(domainPart)) {
            filtered[key] = val;
          }
        }
        sendResponse({ meta: filtered });
        break;

      // ---- 同步历史 ----
      case 'getSyncHistory': sendResponse({ history: await getSyncHistory() }); break;
      case 'clearSyncHistory': sendResponse({ history: await clearSyncHistory() }); break;

      // ---- 日志 ---- 
      case 'getLogs': sendResponse({ logs: await getLogs() }); break;
      case 'exportLogs': sendResponse({ text: await exportLogs() }); break;
      case 'clearLogs': await clearLogs(); sendResponse({ success: true }); break;

      // ---- 设备身份 ----
      case 'getDeviceIdentity':
        const devIdent = await getDeviceIdentity();
        const devName = await getDeviceDisplayName();
        const devDetails = await collectDeviceDetails();
        const netInfo = await collectNetworkInfo();
        sendResponse({
          id: devIdent.id,
          createdAt: devIdent.createdAt,
          deviceName: devName,
          os: devDetails.os,
          arch: devDetails.arch,
          browser: devDetails.browser,
          browserVer: devDetails.browserVer,
          language: devDetails.language,
          platform: devDetails.platform,
          cpuModel: devDetails.cpuModel,
          cpuCores: devDetails.cpuCores,
          cpuFeatures: devDetails.cpuFeatures,
          deviceMemory: devDetails.deviceMemory,
          totalMemory: devDetails.totalMemory,
          uaShort: devDetails.uaShort,
          network: netInfo
        });
        break;
      case 'resetDeviceIdentity': sendResponse(await resetDeviceIdentity()); break;
      case 'addSyncHistoryEntry':
        sendResponse({ history: await addSyncHistoryEntry(request.type, request.detail) });
        break;

      // ---- 网络信息 ----
      case 'getNetworkInfo':
        try {
          const netIfaces = await collectNetworkInfo();
          if (netIfaces && netIfaces.length > 0) {
            const ipv4 = netIfaces.filter(i => i && i.address && !i.isIPv6).map(i => ({ name: i.name || '', address: i.address }));
            const ipv6 = netIfaces.filter(i => i && i.address && i.isIPv6).map(i => ({ name: i.name || '', address: i.address }));
            sendResponse({ success: true, ipv4, ipv6 });
          } else {
            sendResponse({ success: false, error: '未发现网络接口' });
          }
        } catch (e) { sendResponse({ success: false, error: e.message }); }
        break;

      default:
        sendResponse({ error: '未知操作' });
    }
  })();
  return true;
});

function notifyUser(title, message) {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.svg',
      title: title,
      message: message,
      priority: 1
    });
  } catch (e) {}
}

// ========== 安装时初始化 ==========

chrome.runtime.onInstalled.addListener(async () => {
  // 首次安装时创建设备身份
  const identity = await getDeviceIdentity();
  const deviceName = await getDeviceDisplayName();
  const nameTag = deviceName ? ' (' + deviceName + ')' : '';
  logger.info('general', '插件已安装 — 设备: ' + identity.id + nameTag);

  const rules = await getUserBlockingRules();
  if (rules.length > 0) await updateDynamicRules(rules);

  // 初始化内置 DNR 规则（跟随 masterEnabled 状态）
  const blockerConfig = await getBlockerConfig();
  await updateBuiltinDNRRules(blockerConfig.masterEnabled);

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

  // 刷新图标角标
  updateIconState().catch(() => {});

  // SW 重启后重置 P2P 连接状态（WebRTC 连接只存在内存中，重启后丢失）
  getSyncConfig().then(cfg => {
    if (cfg.p2pConnected) {
      saveSyncConfig({ p2pConnected: false, p2pConnectedAt: null, p2pConnectedPeerName: '' });
    }
  });

  // 恢复保活定时器
  getHeartbeats().then(beats => {
    for (const beat of beats) {
      if (beat.enabled && beat.url) {
        chrome.alarms.create('heartbeat_' + beat.id, { periodInMinutes: beat.intervalMinutes || 10 });
      }
    }
  });

  // ===== 升级检测初始化 =====
  // 每 6 小时检查一次新版本
  chrome.alarms.create('versionCheck', { periodInMinutes: UPDATE.CHECK_INTERVAL_MINUTES });
  // 首次启动立即检查（延迟 10 秒，避免启动时网络拥塞）
  setTimeout(checkForUpdate, 10000);

  // ===== 规则库自动同步（延迟 15 秒，24h 节流）=====
  setTimeout(checkRulesDBAutoSync, 15000);

  // 创建每日规则库同步定时器（每 24 小时检查一次）
  chrome.alarms.create('rulesDBSync', { periodInMinutes: 1440 });
});
