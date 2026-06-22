// ============================================================
// SessionMaster · 统一配置
// 所有可配置的默认值和常量集中在此文件
// 通过 ES Module export 供给 background.js 使用
// popup / help 通过 sendMessage({action:'getAppConfig'}) 获取
// ============================================================

export const APP_CONFIG = {

  // ===== 版本 =====
  // 单一数据源：manifest.json，运行时通过 chrome.runtime.getManifest().version 读取
  VERSION: (() => {
    try { return chrome.runtime.getManifest().version; } catch(e) { return 'unknown'; }
  })(),

  // ===== 默认端口 =====
  DEFAULT_PORT: 5789,

  // ===== 存储键 =====
  STORAGE_KEYS: {
    SYNC_CONFIG: 'cloud_sync_config',
    SERVER_SYNC_CONFIG: 'cloud_server_sync_config',
    UPDATE_CONFIG: 'update_config',
    BLOCKING_RULES: 'blockingRules',
    BLOCKING_RULES_DB: 'blockingRulesDB',
    HEARTBEATS: 'heartbeats',
    SYNC_HISTORY: 'syncHistory'
  },

  // ===== 升级检测 =====
  UPDATE: {
    DEFAULT_URL: 'https://raw.githubusercontent.com/benson-album/session-master/develop/VERSION',
    BETA_URL: 'https://raw.githubusercontent.com/benson-album/session-master/develop/VERSION',
    ENABLED: true,
    CHECK_INTERVAL_MINUTES: 360  // 每 6 小时检查一次
  },

  // ===== GitHub 地址（安装脚本、文件清单中的下载链接） =====
  GITHUB: {
    RAW_BASE: 'https://raw.githubusercontent.com/benson-album/session-master/master',
    SCRIPTS_DIR: 'src/scripts'
  },

  // ===== 本地服务器自动发现 =====
  LOCAL_DISCOVERY: {
    HOSTS: ['localhost', '127.0.0.1'],
    TIMEOUT_MS: 3000
  },

  // ===== 同步默认配置 =====
  SYNC_DEFAULTS: {
    mode: 'p2p',
    enabled: false,
    // P2P 模式
    signalUrl: 'http://你的信令服务器地址:5789',
    p2pRoomId: '',
    p2pPairKey: '',
    p2pDeviceName: '',
    p2pConnected: false,
    p2pConnectedAt: null,
    p2pConnectedPeerName: '',
    masterMode: false,
    isMaster: true,
    // 服务器模式
    serverUrl: 'http://你的服务器:5789',
    pairKey: '',
    deviceId: '',
    deviceName: '',
    intervalMinutes: 5,
    syncedDomains: [],
    lastSyncTime: null,
    lastError: null
  },

  // ===== 服务器同步默认配置（含主从状态） =====
  SERVER_SYNC_DEFAULTS: {
    enabled: false,
    serverUrl: 'http://你的服务器:5789',
    pairKey: '',
    deviceId: '',
    deviceName: '',
    intervalMinutes: 5,
    syncedDomains: [],
    lastSyncTime: null,
    lastError: null,
    masterMode: false,
    isMaster: true,
    masterWarnings: [],
    masterDevices: []
  },

  // ===== 保活默认值 =====
  HEARTBEAT_DEFAULTS: {
    intervalMinutes: 10,
    maxBeats: 50
  },

  // ===== 请求超时 =====
  TIMEOUT: {
    VERSION_CHECK_MS: 5000
  }
};
