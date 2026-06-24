// ============================================
// SessionMaster · 会话大师 - Content Script
// © 2026 BenSon.Album (chinasir@qq.com)
// 仅供学习研究，请遵守相关服务条款
// ============================================

(function() {
  'use strict';
  
  // ========== 拦截开关状态 ==========
  // 默认关闭（先查询后台再按需开启），避免阻塞非 OA 站点的正常事件监听
  let blockingEnabled = false;
  
  // 获取当前站点域名
  function getDomain() {
    try { return window.location.hostname; } catch { return ''; }
  }
  
  // 异步查询拦截状态（返回 Promise）
  function checkBlockingState() {
    return new Promise((resolve) => {
      const domain = getDomain();
      if (!domain) { resolve(false); return; }
      try {
        chrome.runtime.sendMessage(
          { action: 'isBlockingEnabled', domain: domain },
          function(response) {
            const enabled = response && response.enabled === true;
            if (enabled) {
              console.log('[SessionMaster] 🛡️ 拦截已激活（域名匹配） -', domain);
            }
            resolve(enabled);
          }
        );
      } catch(e) {
        console.log('[SessionMaster] ⚠️ 查询拦截状态失败:', e.message);
        resolve(false);
      }
    });
  }

  // ========== 运行时代码指纹检测 ==========
  // 不依赖域名规则库，通过检测页面 JS 特征自动识别 OA 产品版本
  // 适用于致远 OA 等标准化产品——同一版本在成千上万客户实例上使用相同代码

  const OA_FINGERPRINTS = [
    // 致远 OA V9 (Seeyon): [LOGOUT] 响应前缀 + getXMLHttpRequestData 函数
    { id: 'seeyon_v9', name: '致远OA V9',
      scripts: ['all-min.js', 'getAjaxDataServlet', 'ajaxShortCutManager'],
      html: ['[LOGOUT]', 'getXMLHttpRequestData', 'exitCurrentSystem'] },
    // 可扩展其他 OA 产品指纹...
  ];

  function detectOAFingerprint() {
    const pageHtml = document.documentElement.innerHTML.toLowerCase();
    const pageUrl = window.location.href.toLowerCase();
    const scripts = document.querySelectorAll('script[src]');
    const scriptUrls = Array.from(scripts).map(s => (s.src || '').toLowerCase());

    for (const oa of OA_FINGERPRINTS) {
      // 检查 script URL 特征（如 all-min.js 是致远 OA 唯一的 JS 入口）
      let scriptsMatch = 0;
      for (const pat of oa.scripts) {
        if (scriptUrls.some(u => u.includes(pat))) scriptsMatch++;
        // 也检查页面 URL 中是否含该模式（如 ajax.do 是 URL 参数而非 script src）
        else if (pageUrl.includes(pat)) scriptsMatch++;
      }
      // 检查 HTML 特征
      let htmlMatch = 0;
      for (const pat of oa.html) {
        if (pageHtml.includes(pat.toLowerCase())) htmlMatch++;
      }
      // 命中半数以上的特征即视为匹配
      const totalChecks = oa.scripts.length + oa.html.length;
      const hits = scriptsMatch + htmlMatch;
      if (hits >= Math.ceil(totalChecks / 2)) {
        console.log(`[SessionMaster] 🔍 代码指纹匹配: ${oa.name} (${hits}/${totalChecks})`);
        return oa.id;
      }
    }
    return null;
  }
  
  // ========== 拦截前端踢人脚本 ==========
  
  // 关键词列表 - 匹配可能触发踢人的函数/变量/事件
  // 注意：部分 OA（如致远 V9）通过 [LOGOUT] 响应前缀踢人，由 XHR 响应拦截处理
  const KICK_KEYWORDS = [
    'secondLogin', 'checkSession', 'sessionTimeout', 'forcedOffline',
    'kickOut', 'singleLogin', 'duplicateLogin', 'conflictLogin',
    '登录冲突', '被踢', '挤下线', '重复登录', 'singleLoginCheck'
  ];
  
  // 安全地获取函数字符串（防止原生函数 toString 抛异常）
  function safeFnStr(fn) {
    if (typeof fn !== 'function') return '';
    try {
      const s = fn.toString();
      if (s.length > 5000) return '';
      return s.toLowerCase();
    } catch { return ''; }
  }

  // 精确关键词匹配：函数体或参数中包含精确关键词才拦截
  function matchKickKeywords(text) {
    if (!text) return null;
    const lower = text.toLowerCase();
    for (const keyword of KICK_KEYWORDS) {
      const pattern = new RegExp('[^a-z]' + keyword.toLowerCase() + '[^a-z]');
      if (pattern.test(' ' + lower + ' ')) return keyword;
    }
    return null;
  }

  // 检查函数体或字符串参数是否含踢人关键词
  function hasKickKeyword(fn, args) {
    if (!blockingEnabled) return false;
    const fnStr = safeFnStr(fn);
    if (fnStr && matchKickKeywords(fnStr)) return true;
    for (const arg of args) {
      if (typeof arg === 'string' && matchKickKeywords(arg)) return true;
    }
    return false;
  }

  /**
   * 拦截并阻止踢人相关的函数调用
   * 通过重写 setTimeout/setInterval 阻止定时踢人检测
   */
  function interceptKickFunctions() {
    const origSetInterval = window.setInterval;
    const origSetTimeout = window.setTimeout;
    const origAddEventListener = EventTarget.prototype.addEventListener;

    // 重写 setInterval
    window.setInterval = function(fn, delay, ...args) {
      if (!blockingEnabled)
        return origSetInterval.call(window, fn, delay, ...args);
      if (delay >= 800 && delay <= 3000 && hasKickKeyword(fn, args)) {
        console.log('[SessionMaster] 🛑 已拦截踢人检测定时器');
        return 0;
      }
      return origSetInterval.call(window, fn, delay, ...args);
    };

    // 重写 setTimeout
    window.setTimeout = function(fn, delay, ...args) {
      if (!blockingEnabled)
        return origSetTimeout.call(window, fn, delay, ...args);
      if (delay >= 800 && delay <= 3000 && hasKickKeyword(fn, args)) {
        console.log('[SessionMaster] 🛑 已拦截踢人检测 setTimeout');
        return 0;
      }
      return origSetTimeout.call(window, fn, delay, ...args);
    };

    // 拦截 addEventListener（message / storage / beforeunload）
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (blockingEnabled && (type === 'message' || type === 'storage' || type === 'beforeunload')) {
        const fnStr = safeFnStr(listener);
        if (fnStr && matchKickKeywords(fnStr)) {
          console.log('[SessionMaster] 🛑 已拦截踢人事件监听:', type);
          return;
        }
      }
      return origAddEventListener.call(this, type, listener, options);
    };

    // ========== XHR 响应拦截（[LOGOUT] 前缀检测）==========
    // 部分 OA（如致远 V9.0SP1）通过在所有 AJAX 响应的开头插入 [LOGOUT] 来触发客户端踢人
    // 现有 setTimeout/Interval 拦截无法处理此模式，需在 XHR 响应层面拦截
    const LOGOUT_PREFIX = '[LOGOUT]';

    // 重写 onreadystatechange setter，注入响应拦截
    function interceptXhrReadyStateChange(xhr, origSetter) {
      Object.defineProperty(xhr, 'onreadystatechange', {
        get: function() { return origSetter; },
        set: function(newHandler) {
          if (typeof newHandler !== 'function') {
            origSetter = newHandler;
            return;
          }
          origSetter = function() {
            if (xhr.readyState === 4 && blockingEnabled) {
              const respText = xhr.responseText || '';
              if (typeof respText === 'string' && respText.startsWith(LOGOUT_PREFIX)) {
                console.log('[SessionMaster] 🛑 已拦截 [LOGOUT] 踢人响应');
                return;  // 不调用原始 handler，阻止踢人
              }
            }
            return newHandler.apply(this, arguments);
          };
        },
        configurable: true
      });
    }

    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this._sessionMasterUrl = url.toString().toLowerCase();
      interceptXhrReadyStateChange(this, null);
      return origOpen.apply(this, [method, url, ...rest]);
    };
    
    // 同时也拦截 addEventListener('readystatechange') 模式
    function interceptXhrAddEventListener(xhr) {
      const origAddXhrListener = xhr.addEventListener;
      if (origAddXhrListener) {
        xhr.addEventListener = function(type, listener, options) {
          if (type === 'readystatechange' && blockingEnabled && typeof listener === 'function') {
            const wrapped = function() {
              if (xhr.readyState === 4) {
                const respText = xhr.responseText || '';
                if (typeof respText === 'string' && respText.startsWith(LOGOUT_PREFIX)) {
                  console.log('[SessionMaster] 🛑 已拦截 [LOGOUT] 踢人响应 (addEventListener)');
                  return;
                }
              }
              return listener.apply(this, arguments);
            };
            return origAddXhrListener.call(this, type, wrapped, options);
          }
          return origAddXhrListener.call(this, type, listener, options);
        };
      }
    }

    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(...args) {
      interceptXhrAddEventListener(this);
      return origSend.apply(this, args);
    };

    console.log('[SessionMaster] ✅ 踢人拦截已部署');
  }
  
  // ========== localStorage 读写接口（支持多站点存储同步） ==========
  
  // 读取 localStorage 数据
  function readLocalStorage(keys) {
    const result = {};
    const targetKeys = keys && keys.length > 0 ? keys : [];
    for (const key of targetKeys) {
      try {
        const val = localStorage.getItem(key);
        if (val !== null) result[key] = val;
      } catch(e) {
        console.log('[SessionMaster] ⚠️ 读取 localStorage 失败:', key, e.message);
      }
    }
    return result;
  }
  
  // 写入 localStorage 数据
  function writeLocalStorage(data) {
    let count = 0;
    for (const [key, value] of Object.entries(data)) {
      try {
        localStorage.setItem(key, value);
        count++;
      } catch(e) {
        console.log('[SessionMaster] ⚠️ 写入 localStorage 失败:', key, e.message);
      }
    }
    return count;
  }
  
  // 监听来自 background/popup 的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'readLocalStorage') {
      const data = readLocalStorage(message.keys);
      sendResponse({ success: true, data, domain: window.location.hostname });
      return true;
    }
    if (message.action === 'writeLocalStorage') {
      const count = writeLocalStorage(message.data || {});
      sendResponse({ success: true, count, domain: window.location.hostname });
      return true;
    }
  });
  
  // ========== 页面加载时执行 ==========
  // 先查询后台确认是否需要拦截，再决定是否部署拦截器
  // 避免在未匹配站点上因默认值 true 引发竞态条件
  
  async function init() {
    blockingEnabled = await checkBlockingState();
    if (blockingEnabled) {
      interceptKickFunctions();
    } else {
      // 域名未匹配 → 尝试运行时代码指纹检测（覆盖致远 OA 等标准化产品）
      const fp = detectOAFingerprint();
      if (fp) {
        blockingEnabled = true;
        console.log('[SessionMaster] 🛡️ 代码指纹匹配成功，拦截已激活 -', getDomain());
        interceptKickFunctions();
      } else {
        console.log('[SessionMaster] ✅ 内容脚本已加载（拦截未激活）');
      }
    }
    window.__sessionMasterActive = true;
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { init(); });
  } else {
    init();
  }
  
})();
