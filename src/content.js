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
  let logoutProtectionEnabled = false;
  
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

  const OA_FINGERPRINTS = [
    { id: 'seeyon_v9', name: '致远OA V9',
      scripts: ['all-min.js', 'getAjaxDataServlet', 'ajaxShortCutManager'],
      html: ['[LOGOUT]', 'getXMLHttpRequestData', 'exitCurrentSystem'] },
  ];

  function detectOAFingerprint() {
    const pageHtml = document.documentElement.innerHTML.toLowerCase();
    const pageUrl = window.location.href.toLowerCase();
    const scripts = document.querySelectorAll('script[src]');
    const scriptUrls = Array.from(scripts).map(s => (s.src || '').toLowerCase());

    for (const oa of OA_FINGERPRINTS) {
      let scriptsMatch = 0;
      for (const pat of oa.scripts) {
        if (scriptUrls.some(u => u.includes(pat))) scriptsMatch++;
        else if (pageUrl.includes(pat)) scriptsMatch++;
      }
      let htmlMatch = 0;
      for (const pat of oa.html) {
        if (pageHtml.includes(pat.toLowerCase())) htmlMatch++;
      }
      const totalChecks = oa.scripts.length + oa.html.length;
      const hits = scriptsMatch + htmlMatch;
      if (hits >= Math.ceil(totalChecks / 2)) {
        console.log(`[SessionMaster] 🔍 代码指纹匹配: ${oa.name} (${hits}/${totalChecks})`);
        return oa.id;
      }
    }
    return null;
  }
  
  // ========== 退出保护 ==========
  // 检测并拦截用户触发的退出请求，弹窗让用户选择操作方式
  // 独立于 OA 踢人拦截，对所有站点通用

  const LOGOUT_PATTERNS = [
    'method=logout',
    'method=loginout',
    '/logout',
    '/loginout',
    'signout',
    'exitSystem',
    'exitCurrentSystem',
    'doLogout',
    'passport://logout',
    'action=logout',
    'login/logout',
    '/sso/logout',
    'accounts/logout'
  ];

  // SDK 退出函数列表 - 这些函数存在时，拦截其调用
  const LOGOUT_SDK_FUNCTIONS = [
    { obj: 'txv', key: 'login', method: 'logout', name: '腾讯视频' },
    { obj: 'Ke', method: 'logout', name: 'B站' }
  ];

  // 异步查询退出保护状态
  function checkLogoutProtectionState() {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { action: 'isLogoutProtectionEnabled' },
          function(response) {
            resolve(response && response.enabled === true);
          }
        );
      } catch(e) {
        resolve(false);
      }
    });
  }

  // 检测 URL 是否匹配退出模式
  function isLogoutUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const lower = url.toLowerCase();
    return LOGOUT_PATTERNS.some(p => lower.includes(p));
  }

  // 注入退出确认弹窗到页面（含密码验证）
  function showLogoutConfirmDialog(callback) {
    if (document.getElementById('__sm_logout_modal')) return;

    // 生成今日日期作为密码
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const todayPwd = `${y}${m}${d}`;

    const overlay = document.createElement('div');
    overlay.id = '__sm_logout_modal';
    overlay.style.cssText =
      'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);' +
      'z-index:2147483647;display:flex;align-items:center;justify-content:center;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';

    const modal = document.createElement('div');
    modal.style.cssText =
      'background:#fff;border-radius:12px;padding:24px;max-width:420px;' +
      'width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.2);' +
      'animation:__sm_fadeIn 0.2s ease-out;';

    // 主弹窗内容
    modal.innerHTML =
      '<style>@keyframes __sm_fadeIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}</style>' +
      '<div style="font-size:18px;font-weight:700;margin-bottom:8px;color:#1a1a1a">🚪 退出确认</div>' +
      '<div style="font-size:13px;color:#666;margin-bottom:16px;line-height:1.5">' +
      '会话大师检测到退出操作。当前此设备可能与其他设备共享登录会话：</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px">' +
      '<button id="__sm_logout_disconnect" style="padding:10px 16px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;cursor:pointer;text-align:left;font-size:13px">' +
      '<span style="font-weight:600">🔒 仅断开此设备</span><br><span style="color:#888;font-size:12px">本地清除 Cookie，不影响其他设备的共享会话</span></button>' +
      '<button id="__sm_logout_switch" style="padding:10px 16px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;cursor:pointer;text-align:left;font-size:13px">' +
      '<span style="font-weight:600">🔄 更换账号</span><br><span style="color:#888;font-size:12px">保存当前 Cookie 后退出，可重新登录其他账号</span></button>' +
      '<button id="__sm_logout_force" style="padding:10px 16px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;cursor:pointer;text-align:left;font-size:13px">' +
      '<span style="font-weight:600;color:#d32f2f">🚪 完全退出</span><br><span style="color:#888;font-size:12px">正常退出登录，所有共享此会话的设备将断开</span></button>' +
      '</div>' +
      '<button id="__sm_logout_cancel" style="width:100%;margin-top:12px;padding:10px;border:1px solid #ddd;border-radius:8px;background:#f5f5f5;cursor:pointer;font-size:13px;color:#666">取消</button>';

    // 完全退出密码弹窗
    const pwdModal = document.createElement('div');
    pwdModal.style.cssText = 'display:none';
    pwdModal.innerHTML =
      '<div style="font-size:16px;font-weight:600;margin-bottom:12px;color:#d32f2f">🔐 完全退出需要验证</div>' +
      '<div style="font-size:13px;color:#666;margin-bottom:12px;line-height:1.5">' +
      '此操作将导致所有共享此会话的设备集体下线，继续操作需要验证解锁密码</div>' +
      '<input id="__sm_logout_pwd" type="password" placeholder="" ' +
      'style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;outline:none">' +
      '<div id="__sm_logout_pwd_error" style="color:#d32f2f;font-size:12px;margin-top:6px;display:none">❌ 密码错误，请重试</div>' +
      '<div style="display:flex;gap:8px;margin-top:12px">' +
      '<button id="__sm_logout_pwd_confirm" style="flex:1;padding:10px;border:none;border-radius:8px;background:#d32f2f;color:#fff;cursor:pointer;font-size:13px;font-weight:600">确认退出</button>' +
      '<button id="__sm_logout_pwd_back" style="padding:10px 16px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;color:#666">返回</button>' +
      '</div>';

    modal.appendChild(pwdModal);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // 按钮 hover
    modal.querySelectorAll('button').forEach(b => {
      b.addEventListener('mouseenter', () => { b.style.background = '#f8f8f8'; });
      b.addEventListener('mouseleave', () => {
        if (b.id === '__sm_logout_cancel') b.style.background = '#f5f5f5';
        else if (b.id === '__sm_logout_pwd_confirm') b.style.background = '#d32f2f';
        else if (b.id === '__sm_logout_pwd_back') b.style.background = '#fff';
        else b.style.background = '#fff';
      });
    });

    function close(result) {
      overlay.remove();
      callback(result);
    }

    // 主选项
    document.getElementById('__sm_logout_disconnect').onclick = () => close('disconnect');
    document.getElementById('__sm_logout_switch').onclick = () => close('switch');

    // 完全退出 → 切换密码弹窗
    document.getElementById('__sm_logout_force').onclick = function() {
      modal.querySelector('div:first-child').style.display = 'none';  // 隐藏主选项
      pwdModal.style.display = 'block';
      document.getElementById('__sm_logout_pwd').focus();
    };

    // 密码确认
    function verifyPassword() {
      const pwd = document.getElementById('__sm_logout_pwd').value.trim();
      if (pwd === todayPwd) {
        close('force');
      } else {
        document.getElementById('__sm_logout_pwd_error').style.display = 'block';
        document.getElementById('__sm_logout_pwd').focus();
        document.getElementById('__sm_logout_pwd').select();
      }
    }

    document.getElementById('__sm_logout_pwd_confirm').onclick = verifyPassword;
    document.getElementById('__sm_logout_pwd').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') verifyPassword();
    });

    // 返回主选项
    document.getElementById('__sm_logout_pwd_back').onclick = function() {
      pwdModal.style.display = 'none';
      modal.querySelector('div:first-child').style.display = 'block';
      document.getElementById('__sm_logout_pwd_error').style.display = 'none';
      document.getElementById('__sm_logout_pwd').value = '';
    };

    document.getElementById('__sm_logout_cancel').onclick = () => close('cancel');
    overlay.onclick = (e) => { if (e.target === overlay) close('cancel'); };
  }

  // ========== 拦截前端踢人脚本 ==========
  
  const KICK_KEYWORDS = [
    'secondLogin', 'checkSession', 'sessionTimeout', 'forcedOffline',
    'kickOut', 'singleLogin', 'duplicateLogin', 'conflictLogin',
    '登录冲突', '被踢', '挤下线', '重复登录', 'singleLoginCheck'
  ];
  
  function safeFnStr(fn) {
    if (typeof fn !== 'function') return '';
    try {
      const s = fn.toString();
      if (s.length > 5000) return '';
      return s.toLowerCase();
    } catch { return ''; }
  }

  function matchKickKeywords(text) {
    if (!text) return null;
    const lower = text.toLowerCase();
    for (const keyword of KICK_KEYWORDS) {
      const pattern = new RegExp('[^a-z]' + keyword.toLowerCase() + '[^a-z]');
      if (pattern.test(' ' + lower + ' ')) return keyword;
    }
    return null;
  }

  function hasKickKeyword(fn, args) {
    if (!blockingEnabled) return false;
    const fnStr = safeFnStr(fn);
    if (fnStr && matchKickKeywords(fnStr)) return true;
    for (const arg of args) {
      if (typeof arg === 'string' && matchKickKeywords(arg)) return true;
    }
    return false;
  }

  // 拦截并阻止踢人相关的函数调用 + 退出保护
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

    // 拦截 addEventListener
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
    const LOGOUT_PREFIX = '[LOGOUT]';

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
                return;
              }
            }
            return newHandler.apply(this, arguments);
          };
        },
        configurable: true
      });
    }

    // ========== 退出请求拦截（URL 模式匹配）==========
    // 在 XMLHttpRequest.prototype.open 中同时注入退出检测
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      const urlStr = (url || '').toString().toLowerCase();
      this._sessionMasterUrl = urlStr;
      interceptXhrReadyStateChange(this, null);

      // 退出保护：检测 URL 是否匹配退出模式
      if (logoutProtectionEnabled && isLogoutUrl(urlStr)) {
        console.log('[SessionMaster] 🚪 检测到退出请求:', urlStr);
        // 标记此请求为退出，在 send 时处理
        this._isLogoutRequest = true;
      }

      return origOpen.apply(this, [method, url, ...rest]);
    };
    
    // addEventListener('readystatechange') 拦截
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

    // ========== XHR send 拦截：注入退出确认弹窗 ==========
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(...args) {
      interceptXhrAddEventListener(this);
      
      if (this._isLogoutRequest && logoutProtectionEnabled) {
        console.log('[SessionMaster] 🚪 退出请求已被拦截，等待用户确认');
        this._isLogoutRequest = false;
        
        const xhr = this;
        showLogoutConfirmDialog(function(choice) {
          if (choice === 'cancel') return;
          if (choice === 'disconnect') {
            document.cookie.split(';').forEach(c => {
              document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/');
            });
            window.location.reload();
            return;
          }
          if (choice === 'switch') {
            chrome.runtime.sendMessage({ action: 'backupCookiesForDomain', domain: getDomain() }).catch(() => {});
            origSend.apply(xhr, args);
            return;
          }
          origSend.apply(xhr, args);
        });
        return;
      }
      
      return origSend.apply(this, args);
    };

    // ========== 拦截 window.location.href 赋值（覆盖页面跳转退出）==========
    if (logoutProtectionEnabled) {
      let _href = window.location.href;
      let _settingHref = false;  // 防止递归
      Object.defineProperty(window.location, 'href', {
        get: function() { return _href; },
        set: function(newVal) {
          if (_settingHref || typeof newVal !== 'string') {
            _href = newVal;
            return;
          }
          if (isLogoutUrl(newVal)) {
            console.log('[SessionMaster] 🚪 拦截页面跳转退出:', newVal);
            showLogoutConfirmDialog(function(choice) {
              if (choice === 'cancel') return;
              if (choice === 'disconnect') {
                document.cookie.split(';').forEach(c => {
                  document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/');
                });
                window.location.reload();
                return;
              }
              if (choice === 'switch') {
                chrome.runtime.sendMessage({ action: 'backupCookiesForDomain', domain: getDomain() }).catch(() => {});
              }
              // force: 放行跳转
              _settingHref = true;
              window.location.href = newVal;
            });
            return;
          }
          _href = newVal;
          try {
            // 使用 location.assign 模拟原生 setter 行为
            window.location.assign(newVal);
          } catch(e) {}
        },
        configurable: true
      });
    }

    // ========== 拦截 SDK 退出函数调用（注入 <script> 到主 world）==========
    // content script 的 isolated world 无法覆盖页面 JS 变量，
    // 必须通过注入 <script> 标签在页面主 world 中执行
    if (logoutProtectionEnabled) {
      var sdkScript = document.createElement('script');
      sdkScript.id = '__sm_logout_sdk_hook';
      // 生成 SDK 拦截脚本内容（主 world 中执行）
      // 注意：原始函数保存在父对象上（而非 window），以保留 this 上下文
      var hookCode = LOGOUT_SDK_FUNCTIONS.map(function(sdk) {
        var parentPath = sdk.key ? sdk.obj + '.' + sdk.key : sdk.obj;
        var fullPath = parentPath + '.' + sdk.method;

        return '(function(){try{' +
          'var _fn=' + fullPath + ';' +
          'if(typeof _fn==="function"){' +
            parentPath + '.__sm_orig=' + parentPath + '.__sm_orig||{};' +
            parentPath + '.__sm_orig.' + sdk.method + '=_fn;' +
            fullPath + '=function(){' +
              'window.postMessage({sm_logout_trigger:true,' +
                'name:' + JSON.stringify(sdk.name) + ',' +
                'parentPath:' + JSON.stringify(parentPath) + ',' +
                'method:' + JSON.stringify(sdk.method) +
              '},"*");' +
            '};' +
          '}' +
        '}catch(e){}})();';
      }).join('');

      sdkScript.textContent = hookCode +
        // 定时重试（最多 10 秒），SDK 动态加载后覆盖
        '(function(){var _r=0;var _t=setInterval(function(){' +
        hookCode +
        ';_r++;if(_r>20)clearInterval(_t);},500)})();';

      (document.head || document.documentElement).appendChild(sdkScript);

      // content script 监听 postMessage，收到后显示确认弹窗
      window.addEventListener('message', function(event) {
        if (event.data && event.data.sm_logout_trigger === true) {
          console.log('[SessionMaster] 收到退出触发信号:', event.data.name);
          showLogoutConfirmDialog(function(choice) {
            if (choice === 'cancel') return;
            if (choice === 'disconnect') {
              document.cookie.split(';').forEach(function(c) {
                document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/');
              });
              window.location.reload();
              return;
            }
            if (choice === 'switch') {
              chrome.runtime.sendMessage({ action: 'backupCookiesForDomain', domain: getDomain() }).catch(function(){});
            }
            // force / switch: 恢复原始函数并调用（保留 this 上下文）
            var execScript = document.createElement('script');
            // 构造恢复代码：在父对象上恢复原始函数并调用
            if (event.data.parentPath) {
              // SDK 函数：恢复并调用
              execScript.textContent =
                '(function(){' +
                'var p=' + event.data.parentPath + ';' +
                'var m="' + event.data.method + '";' +
                'if(p.__sm_orig&&p.__sm_orig[m]){' +
                  'p[m]=p.__sm_orig[m];' +
                  'p[m]({showConfirmDialog:false});' +
                '}' +
                '})();';
            } else {
              // 非 SD 函数（如 exitCurrentSystem）
              execScript.textContent = 'window.' + event.data.obj + '();';
            }
            document.body.appendChild(execScript);
            execScript.remove();
          });
        }
      });
    }

    // ========== 拦截 window.exitCurrentSystem（致远 OA 专用，注入 <script>） ==========
    // 部分 OA 使用直接函数调用退出（而非 XHR），需额外拦截
    // 注意：必须在主 world 中重写函数，content script isolated world 无效
    if (logoutProtectionEnabled) {
      var exitScript = document.createElement('script');
      exitScript.textContent =
        '(function(){try{' +
        'var _origExit=window.exitCurrentSystem;' +
        'if(typeof _origExit==="function"){' +
          'window.__sm_orig_exitCurrentSystem=_origExit;' +
          'window.exitCurrentSystem=function(){' +
            'window.postMessage({sm_logout_trigger:true,obj:"__sm_orig_exitCurrentSystem",method:""},"*");' +
          '};' +
        '}' +
        '}catch(e){}})();';
      (document.head || document.documentElement).appendChild(exitScript);
    }

    console.log('[SessionMaster] ✅ 踢人拦截 + 退出保护已部署');
  }
  
  // ========== localStorage 读写接口 ==========
  
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
  
  async function init() {
    // 并行查询 OA 拦截状态和退出保护状态
    const [kickEnabled, logoutEnabled] = await Promise.all([
      checkBlockingState(),
      checkLogoutProtectionState()
    ]);
    
    logoutProtectionEnabled = logoutEnabled;
    if (logoutEnabled) {
      console.log('[SessionMaster] 🚪 退出保护已开启');
    }

    if (kickEnabled) {
      blockingEnabled = true;
      interceptKickFunctions();
    } else {
      const fp = detectOAFingerprint();
      if (fp) {
        blockingEnabled = true;
        console.log('[SessionMaster] 🛡️ 代码指纹匹配成功，拦截已激活 -', getDomain());
        interceptKickFunctions();
      } else if (logoutEnabled) {
        // 只有退出保护开启时也部署拦截（包含退出拦截代码）
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
