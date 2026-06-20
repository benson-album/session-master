// ============================================
// SessionMaster · 会话大师 - Content Script
// © 2026 BenSon.Album (chinasir@qq.com)
// 仅供学习研究，请遵守相关服务条款
// ============================================

(function() {
  'use strict';
  
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
    // 保存原始 setInterval
    const origSetInterval = window.setInterval;
    const origSetTimeout = window.setTimeout;
    
    // 重写 setInterval - 检查是否包含踢人相关回调
    window.setInterval = function(fn, delay, ...args) {
      // 如果是常见的踢人检测间隔（如每秒检查），阻止它
      if (delay <= 2000) {
        const fnStr = fn.toString().toLowerCase();
        for (const keyword of KICK_KEYWORDS) {
          if (fnStr.includes(keyword.toLowerCase())) {
            console.log('[SessionMaster] 🛑 已拦截踢人检测定时器:', keyword);
            return 0; // 返回非负整数模拟正常 setInterval 行为
          }
        }
        // 检查参数中是否包含关键词
        for (const arg of args) {
          if (typeof arg === 'string') {
            for (const keyword of KICK_KEYWORDS) {
              if (arg.toLowerCase().includes(keyword.toLowerCase())) {
                console.log('[SessionMaster] 🛑 已拦截踢人检测（参数匹配）:', keyword);
                return 0;
              }
            }
          }
        }
      }
      return origSetInterval.call(window, fn, delay, ...args);
    };
    
    // 重写 setTimeout - 同理
    window.setTimeout = function(fn, delay, ...args) {
      if (delay <= 2000) {
        const fnStr = fn.toString().toLowerCase();
        for (const keyword of KICK_KEYWORDS) {
          if (fnStr.includes(keyword.toLowerCase())) {
            console.log('[SessionMaster] 🛑 已拦截踢人检测 setTimeout:', keyword);
            return 0;
          }
        }
      }
      return origSetTimeout.call(window, fn, delay, ...args);
    };
    
    // 拦截 addEventListener 注册的 
    const origAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (type === 'message' || type === 'storage' || type === 'beforeunload') {
        const fnStr = (listener && listener.toString) ? listener.toString().toLowerCase() : '';
        for (const keyword of KICK_KEYWORDS) {
          if (fnStr.includes(keyword.toLowerCase())) {
            console.log('[SessionMaster] 🛑 已拦截踢人事件监听:', keyword, 'type:', type);
            return; // 不注册该监听器
          }
        }
      }
      return origAddEventListener.call(this, type, listener, options);
    };
    
    // 拦截 XMLHttpRequest 中的踢人检测响应
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this._sessionMasterUrl = url.toString().toLowerCase();
      return origOpen.apply(this, [method, url, ...rest]);
    };
    
    console.log('[SessionMaster] ✅ 踢人拦截已部署');
  }
  
  // ========== 注入已保存的 Cookie ==========
  
  /**
   * 在页面加载后尝试注入用户保存的 Cookie
   */
  async function injectSavedCookies() {
    try {
      const savedCookiesJson = sessionStorage.getItem('sessionMaster_inject');
      if (savedCookiesJson) {
        const saved = JSON.parse(savedCookiesJson);
        const currentDomain = window.location.hostname;
        
        // 检查域名是否匹配
        if (currentDomain.includes(saved.domain.replace(/^\./, '')) || 
            saved.domain.includes(currentDomain)) {
          console.log('[SessionMaster] ✅ 注入已保存的会话 Cookie');
          // Cookie 会由 background.js 注入
          sessionStorage.removeItem('sessionMaster_inject');
        }
      }
    } catch (e) {
      // 忽略
    }
  }
  
  // ========== 页面加载时执行 ==========
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      interceptKickFunctions();
      injectSavedCookies();
    });
  } else {
    interceptKickFunctions();
    injectSavedCookies();
  }
  
  // 暴露状态给 background
  window.__sessionMasterActive = true;
  
})();
