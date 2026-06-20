// ============================================
// SessionMaster · 会话大师 - Content Script
// © 2026 BenSon.Album (chinasir@qq.com)
// 仅供学习研究，请遵守相关服务条款
// ============================================

(function() {
  'use strict';
  
  // ========== 拦截开关状态 ==========
  // 默认开启（向后兼容），background 会异步更新此值
  let blockingEnabled = true;
  
  // 获取当前站点域名
  function getDomain() {
    try { return window.location.hostname; } catch { return ''; }
  }
  
  // 异步查询拦截状态
  function checkBlockingState() {
    const domain = getDomain();
    if (!domain) return;
    try {
      chrome.runtime.sendMessage(
        { action: 'isBlockingEnabled', domain: domain },
        function(response) {
          if (response && response.enabled === false) {
            blockingEnabled = false;
            console.log('[SessionMaster] 🛡️ 当前站点未匹配拦截规则，拦截已暂停');
          } else {
            blockingEnabled = true;
            console.log('[SessionMaster] 🛡️ 拦截已激活 -', domain);
          }
        }
      );
    } catch(e) {
      // 发送消息失败时保持默认开启
      console.log('[SessionMaster] ⚠️ 查询拦截状态失败:', e.message);
    }
  }
  
  // ========== 拦截前端踢人脚本 ==========
  
  // 关键词列表 - 匹配可能触发踢人的函数/变量/事件
  const KICK_KEYWORDS = [
    'secondLogin', 'checkSession', 'sessionTimeout', 'forcedOffline',
    'kickOut', 'singleLogin', 'duplicateLogin', 'conflictLogin',
    '登录冲突', '被踢', '挤下线', '重复登录', 'singleLoginCheck'
  ];
  
  /**
   * 拦截并阻止踢人相关的函数调用
   * 通过重写 setTimeout/setInterval 阻止定时踢人检测
   */
  function interceptKickFunctions() {
    const origSetInterval = window.setInterval;
    const origSetTimeout = window.setTimeout;
    const origAddEventListener = EventTarget.prototype.addEventListener;

    // 安全地获取函数字符串（防止原生函数 toString 抛异常）
    function safeFnStr(fn) {
      if (typeof fn !== 'function') return '';
      try {
        const s = fn.toString();
        // 避免匹配过长的函数体（压缩代码可能误匹配关键词）
        if (s.length > 5000) return '';
        return s.toLowerCase();
      } catch { return ''; }
    }

    // 精确关键词匹配：函数体或参数中包含精确关键词才拦截
    function matchKickKeywords(text) {
      if (!text) return null;
      const lower = text.toLowerCase();
      for (const keyword of KICK_KEYWORDS) {
        // 使用正则：整词匹配，避免部分匹配（如 "secondLoginCheck" 不会匹配 "secondLogin"）
        const pattern = new RegExp('[^a-z]' + keyword.toLowerCase() + '[^a-z]');
        if (pattern.test(' ' + lower + ' ')) return keyword;
      }
      return null;
    }

    // 检查函数体或字符串参数是否含踢人关键词
    function hasKickKeyword(fn, args) {
      if (!blockingEnabled) return false;      // ← 新增：拦截开关检查
      const fnStr = safeFnStr(fn);
      if (fnStr && matchKickKeywords(fnStr)) return true;
      for (const arg of args) {
        if (typeof arg === 'string' && matchKickKeywords(arg)) return true;
      }
      return false;
    }

    // 重写 setInterval
    window.setInterval = function(fn, delay, ...args) {
      if (!blockingEnabled)                    // ← 新增：拦截开关检查
        return origSetInterval.call(window, fn, delay, ...args);
      // 只检查常见 OA 踢人检测间隔（1-3秒），且必须含关键词
      if (delay >= 800 && delay <= 3000 && hasKickKeyword(fn, args)) {
        console.log('[SessionMaster] 🛑 已拦截踢人检测定时器');
        return 0;
      }
      return origSetInterval.call(window, fn, delay, ...args);
    };

    // 重写 setTimeout
    window.setTimeout = function(fn, delay, ...args) {
      if (!blockingEnabled)                    // ← 新增：拦截开关检查
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

    // 标记 XMLHttpRequest URL
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this._sessionMasterUrl = url.toString().toLowerCase();
      return origOpen.apply(this, [method, url, ...rest]);
    };

    console.log('[SessionMaster] ✅ 踢人拦截已部署');
    // 查询后台拦截状态
    checkBlockingState();
  }
  
  // ========== 页面加载时执行 ==========
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      interceptKickFunctions();
    });
  } else {
    interceptKickFunctions();
  }
  
  // 暴露状态给 background
  window.__sessionMasterActive = true;
  
})();
