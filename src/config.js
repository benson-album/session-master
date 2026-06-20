// ============================================================
// SessionMaster · 统一配置
// 所有可配置的默认值和常量集中在此文件
// 通过 ES Module export 供给 background.js 使用
// popup / help 通过 sendMessage({action:'getAppConfig'}) 获取
// ============================================================

export const APP_CONFIG = {

  // ===== 版本 =====
  VERSION: '1.5.4',

  // ===== 默认端口 =====
  DEFAULT_PORT: 5789,

  // ===== 存储键 =====
  STORAGE_KEYS: {
    SYNC_CONFIG: 'cloud_sync_config',
    SERVER_SYNC_CONFIG: 'cloud_sync_config',
    UPDATE_CONFIG: 'update_config',
    BLOCKING_RULES: 'blockingRules',
    BLOCKING_RULES_DB: 'blockingRulesDB',
    HEARTBEATS: 'heartbeats',
    SYNC_HISTORY: 'syncHistory'
  },

  // ===== 升级检测 =====
  UPDATE: {
    DEFAULT_URL: 'https://raw.githubusercontent.com/BenSongLab/session-master/main/VERSION',
    ENABLED: true
  },

  // ===== GitHub 地址（安装脚本、文件清单中的下载链接） =====
  GITHUB: {
    RAW_BASE: 'https://raw.githubusercontent.com/BenSongLab/session-master/main',
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
    signalUrl: 'http://你的信令服务器地址:{port}',
    p2pRoomId: '',
    p2pPairKey: '',
    p2pDeviceName: '',
    p2pConnected: false,
    p2pConnectedAt: null,
    p2pConnectedPeerName: '',
    masterMode: false,
    isMaster: true,
    // 服务器模式
    serverUrl: 'http://你的服务器:{port}',
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
    serverUrl: 'http://你的服务器:{port}',
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
