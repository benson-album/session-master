// ============================================
// SessionMaster · 会话大师 - Popup Logic
// © 2026 BenSon.Album (chinasir@qq.com)
// 仅供学习研究，请遵守相关服务条款
// ============================================

(function() {
  'use strict';
  
  let currentDomain = '';

  function showToast(message, duration = 2000) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  }

  async function getCurrentTabDomain() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) return '';
    const url = tabs[0].url;
    if (!url || url.startsWith('chrome://') || url.startsWith('about:')) return '';
    try { return new URL(url).hostname; } catch { return ''; }
  }

  async function getCurrentTabInfo() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) return { domain: '', title: '', url: '' };
    const tab = tabs[0];
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:') || tab.url.startsWith('edge://')) return { domain: '', title: '', url: '' };
    try {
      const url = new URL(tab.url);
      return { domain: url.hostname, title: tab.title || '', url: tab.url };
    } catch { return { domain: '', title: '', url: '' }; }
  }

  function getSiteName(title, domain) {
    if (!title) return domain;
    // 取标题中第一个有意义的片段
    let name = title.replace(/[-_|–—]/g, ' ').trim().split(/\s+/)[0] || '';
    // 如果取到的名字像域名，改用域名
    if (name.length < 2 || name.includes('.')) name = domain;
    return name;
  }

  async function getCurrentTabUrl() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) return '';
    const url = tabs[0].url;
    if (!url || url.startsWith('chrome://') || url.startsWith('about:') || url.startsWith('edge://')) return '';
    return url;
  }

  // ========== Tab 切换 ==========
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  // ========== Cookie 管理 ==========
  document.getElementById('btnExport').addEventListener('click', async () => {
    if (!currentDomain) return showToast('⚠️ 无法获取当前站点域名');
    const result = await chrome.runtime.sendMessage({ action: 'getCookies', domain: currentDomain });
    if (!result.success) return showToast('⚠️ ' + result.message);
    document.getElementById('resultTitle').textContent = `🍪 ${currentDomain} - ${result.data.cookies.length} 个 Cookie`;
    document.getElementById('resultContent').value = result.data.quick;
    document.getElementById('resultHint').textContent = `✅ 导出成功！导出时间: ${new Date(result.data.exportTime).toLocaleString()}`;
    document.getElementById('cookieResult').style.display = 'block';
    document.getElementById('importBox').style.display = 'none';
    showToast(`✅ 已导出 ${result.data.cookies.length} 个 Cookie`);
  });

  document.getElementById('btnCopy').addEventListener('click', () => {
    const textarea = document.getElementById('resultContent');
    textarea.select();
    navigator.clipboard.writeText(textarea.value)
      .then(() => showToast('✅ 已复制到剪贴板'))
      .catch(() => { document.execCommand('copy'); showToast('✅ 已复制'); });
  });

  document.getElementById('btnImport').addEventListener('click', () => {
    document.getElementById('importBox').style.display = 'block';
    document.getElementById('cookieResult').style.display = 'none';
  });

  document.getElementById('btnDoImport').addEventListener('click', async () => {
    if (!currentDomain) return showToast('⚠️ 无法获取当前站点域名');
    const rawText = document.getElementById('importTextarea').value.trim();
    if (!rawText) return showToast('⚠️ 请粘贴要导入的 Cookie 内容');
    
    let importData;
    try {
      const parsed = JSON.parse(rawText);
      if (parsed.cookies && Array.isArray(parsed.cookies)) importData = parsed;
      else return showToast('⚠️ JSON 格式不正确');
    } catch {
      const pairs = rawText.split(';').map(s => s.trim()).filter(Boolean);
      const cookies = pairs.map(pair => {
        const eqIdx = pair.indexOf('=');
        if (eqIdx === -1) return null;
        return { name: pair.substring(0, eqIdx).trim(), value: pair.substring(eqIdx + 1).trim(), domain: currentDomain, path: '/', secure: true, httpOnly: true, hostOnly: true };
      }).filter(Boolean);
      if (cookies.length === 0) return showToast('⚠️ 无法解析 Cookie 内容');
      let domain = currentDomain;
      const domainMatch = rawText.match(/domain[:=]\s*"?([^";\s,]+)"?/i);
      if (domainMatch) domain = domainMatch[1];
      importData = { domain, cookies };
    }

    await chrome.runtime.sendMessage({ action: 'clearCookies', domain: currentDomain });
    const result = await chrome.runtime.sendMessage({ action: 'importCookies', data: importData });
    document.getElementById('importTextarea').value = '';
    document.getElementById('importBox').style.display = 'none';
    if (result.success > 0) showToast(`✅ 成功导入 ${result.success} 个 Cookie！刷新页面生效`);
    if (result.failed > 0) console.warn('导入失败:', result.errors);
  });

  document.getElementById('btnClear').addEventListener('click', async () => {
    if (!currentDomain) return showToast('⚠️ 无法获取当前站点域名');
    if (!confirm(`确定清除 ${currentDomain} 的所有 Cookie？`)) return;
    const result = await chrome.runtime.sendMessage({ action: 'clearCookies', domain: currentDomain });
    showToast(`✅ 已清除 ${result.removed} 个 Cookie`);
  });

  // ========== 自定义拦截规则 ==========
  async function loadUserRules() {
    const result = await chrome.runtime.sendMessage({ action: 'getBlockingRules' });
    const container = document.getElementById('userRules');
    if (result.rules.length === 0) {
      container.innerHTML = '<p class="hint">暂无自定义规则</p>';
      return;
    }
    container.innerHTML = result.rules.map(pattern => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #f0f0f0;">
        <span style="font-family:monospace;font-size:12px;color:#333;">${pattern}</span>
        <button class="btn-small delete-rule" data-pattern="${pattern}">✕</button>
      </div>
    `).join('');
    document.querySelectorAll('.delete-rule').forEach(btn => {
      btn.addEventListener('click', async () => {
        await chrome.runtime.sendMessage({ action: 'removeBlockingRule', urlPattern: btn.dataset.pattern });
        showToast('✅ 已删除规则');
        loadUserRules();
      });
    });
  }

  document.getElementById('btnAddRule').addEventListener('click', async () => {
    const input = document.getElementById('customRuleInput');
    const pattern = input.value.trim();
    if (!pattern) return showToast('⚠️ 请输入关键词');
    const result = await chrome.runtime.sendMessage({ action: 'addBlockingRule', urlPattern: pattern });
    if (result.success) { showToast(`✅ 已添加`); input.value = ''; loadUserRules(); }
    else showToast('⚠️ ' + result.message);
  });
  // 自定义规则回车
  document.getElementById('customRuleInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btnAddRule').click();
  });

  // ========== 规则库管理（按网站归类）==========

  async function loadRulesDB() {
    const db = await chrome.runtime.sendMessage({ action: 'getRulesDB' });
    const countEl = document.getElementById('ruleDBCount');
    const listEl = document.getElementById('ruleDBList');
    if (!db || !db.sites) {
      countEl.textContent = '0 站点';
      listEl.innerHTML = '<p class="hint">规则库为空</p>';
      return;
    }
    countEl.textContent = db.sites.length + ' 站点';
    listEl.innerHTML = db.sites.map(site => {
      const kwCount = (site.keywords || []).length;
      return '<div style="padding:6px 0;border-bottom:1px solid #f0f0f0">' +
        '<div style="font-weight:600;font-size:13px;color:#333">' + site.name + '</div>' +
        '<div style="font-size:11px;color:#888;margin:2px 0">域名: ' + (site.domains || []).join(', ') + '</div>' +
        '<div style="font-size:11px;color:#666">' +
          '<span class="badge badge-green">' + kwCount + ' 条规则</span> ' +
          (kwCount > 0 ? '<code style="font-size:10px">' + site.keywords.join(', ') + '</code>' : '') +
        '</div>' +
        (site.description ? '<div style="font-size:10px;color:#999;margin-top:2px">' + site.description + '</div>' : '') +
      '</div>';
    }).join('');
    if (db.sites.length === 0) listEl.innerHTML = '<p class="hint">规则库为空，可导入或从服务器更新</p>';
  }

  async function loadRecommendedRules() {
    const section = document.getElementById('recommendedSection');
    const container = document.getElementById('recommendedRules');
    if (!currentDomain) { section.style.display = 'none'; return; }
    const result = await chrome.runtime.sendMessage({ action: 'getRecommendedRules', domain: currentDomain });
    const matched = result.sites || [];
    const keywords = result.keywords || [];
    if (keywords.length === 0) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    if (matched.length > 0) {
      container.innerHTML = '<div style="margin-bottom:4px">🔍 匹配到 <strong>' + matched.length + '</strong> 个网站：' +
        matched.map(s => ' <span class="badge badge-green">' + s.name + '</span>').join('') + '</div>' +
        '<div style="font-size:11px;color:#555;word-break:break-all;overflow-wrap:break-word">' +
          keywords.map(k => '<code style="margin:2px 4px 2px 0;display:inline-block">' + k + '</code>').join('') +
        '</div>' +
        '<p class="hint" style="margin-top:4px">以上规则已自动生效</p>';
    } else {
      container.innerHTML = '<p class="hint">当前站点暂无可自动匹配的专用规则，通用规则已生效</p>' +
        '<div style="font-size:11px;color:#555;margin-top:4px;word-break:break-all;overflow-wrap:break-word">' +
          keywords.map(k => '<code style="margin:2px">' + k + '</code>').join('') +
        '</div>';
    }
  }

  // 导出规则库
  document.getElementById('btnExportRules').addEventListener('click', async () => {
    const result = await chrome.runtime.sendMessage({ action: 'exportRulesDB' });
    if (!result.data) return showToast('⚠️ 导出失败');
    const blob = new Blob([result.data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sessionmaster-blocking-rules.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('📤 已导出规则库');
  });

  // 导入规则库
  document.getElementById('btnImportRules').addEventListener('click', () => {
    document.getElementById('importRulesFile').click();
  });
  document.getElementById('importRulesFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = await chrome.runtime.sendMessage({ action: 'importRulesDB', data: text });
      if (result.success) {
        showToast('✅ ' + result.message);
        await loadRulesDB();
        await loadRecommendedRules();
      } else {
        showToast('⚠️ ' + (result.error || '导入失败'));
      }
    } catch (err) {
      showToast('⚠️ 文件读取失败');
    }
    e.target.value = '';
  });

  // 从服务器更新规则
  document.getElementById('btnUpdateRules').addEventListener('click', async () => {
    const btn = document.getElementById('btnUpdateRules');
    const statusEl = document.getElementById('rulesUpdateStatus');
    btn.disabled = true;
    btn.textContent = '⏳ 更新中...';
    const result = await chrome.runtime.sendMessage({ action: 'updateRulesDBFromServer' });
    btn.disabled = false;
    btn.textContent = '🔄 从服务器更新规则';
    statusEl.style.display = 'block';
    if (result.success) {
      statusEl.textContent = '✅ ' + result.message;
      statusEl.style.color = '#137333';
      await loadRulesDB();
      await loadRecommendedRules();
    } else {
      statusEl.textContent = '⚠️ ' + (result.error || '更新失败');
      statusEl.style.color = '#c5221f';
    }
    setTimeout(() => { statusEl.style.display = 'none'; }, 5000);
  });

  // ========== 当前站点 Cookie 列表 ==========

  let currentCookies = [];

  document.getElementById('btnLoadCookies').addEventListener('click', async () => {
    if (!currentDomain) return showToast('⚠️ 无法获取当前站点');
    const result = await chrome.runtime.sendMessage({ action: 'getCookies', domain: currentDomain });
    const area = document.getElementById('cookieListArea');
    const container = document.getElementById('cookieItems');
    const labelEl = document.getElementById('cookieSiteLabel');
    labelEl.textContent = currentDomain;
    if (!result.success || !result.data || !result.data.cookies) {
      area.style.display = 'block';
      container.innerHTML = '<p class="hint" style="padding:8px">未找到该站点的 Cookie</p>';
      return;
    }
    currentCookies = result.data.cookies;
    area.style.display = 'block';
    container.innerHTML = currentCookies.map((c, i) => {
      const displayValue = c.value.length > 28 ? c.value.substring(0, 25) + '...' : c.value;
      return '<label style="display:flex;align-items:center;gap:6px;padding:4px 6px;cursor:pointer;border-bottom:1px solid #f5f5f5;font-size:12px">' +
        '<input type="checkbox" class="cookie-check" data-index="' + i + '" style="flex-shrink:0">' +
        '<div style="flex:1;min-width:0;line-height:1.4">' +
          '<span style="font-weight:600;color:#333">' + c.name + '</span> ' +
          '<span style="color:#888;font-family:monospace;font-size:10px">' + displayValue + '</span>' +
          '<br><span style="font-size:10px;color:#aaa">' + c.domain + c.path + (c.secure ? ' 🔒' : '') + '</span>' +
        '</div>' +
      '</label>';
    }).join('');
    document.getElementById('cookieSelectHint').textContent = '共 ' + currentCookies.length + ' 个 Cookie，勾选后点击加入自定义规则';
  });

  // 全选/清除
  document.getElementById('btnSelectAllCookies').addEventListener('click', () => {
    document.querySelectorAll('.cookie-check').forEach(cb => cb.checked = true);
  });
  document.getElementById('btnUnselectAllCookies').addEventListener('click', () => {
    document.querySelectorAll('.cookie-check').forEach(cb => cb.checked = false);
  });

  // 加入自定义规则
  document.getElementById('btnAddSelectedCookies').addEventListener('click', async () => {
    const checked = document.querySelectorAll('.cookie-check:checked');
    if (checked.length === 0) return showToast('⚠️ 请先勾选要加入的 Cookie');
    let added = 0;
    for (const cb of checked) {
      const cookie = currentCookies[parseInt(cb.dataset.index)];
      if (!cookie || !cookie.name) continue;
      const result = await chrome.runtime.sendMessage({ action: 'addBlockingRule', urlPattern: cookie.name });
      if (result.success) added++;
    }
    if (added > 0) {
      showToast('✅ 已将 ' + added + ' 个 Cookie 名称加入自定义规则');
      loadUserRules();
      // 清除勾选
      document.querySelectorAll('.cookie-check:checked').forEach(cb => cb.checked = false);
    } else {
      showToast('⚠️ 所选 Cookie 可能已是自定义规则');
    }
  });

  // ========== 同步历史记录 ==========

  let p2pConnectionTimer = null;
  let serverConnectionTimer = null;

  function startP2PConnectionTimer(connectedAt) {
    stopP2PConnectionTimer();
    const el = document.getElementById('p2pConnectionTime');
    if (!el || !connectedAt) return;
    el.style.display = 'block';
    function update() {
      const elapsed = Date.now() - new Date(connectedAt).getTime();
      if (elapsed < 0) { el.textContent = '⏱ 刚刚连接'; return; }
      const totalSec = Math.floor(elapsed / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      if (min >= 60) {
        const hours = Math.floor(min / 60);
        el.textContent = `⏱ 已连接 ${hours}时${min % 60}分${sec}秒`;
      } else {
        el.textContent = `⏱ 已连接 ${min}分${sec}秒`;
      }
    }
    update();
    p2pConnectionTimer = setInterval(update, 1000);
  }

  function stopP2PConnectionTimer() {
    if (p2pConnectionTimer) {
      clearInterval(p2pConnectionTimer);
      p2pConnectionTimer = null;
    }
    const el = document.getElementById('p2pConnectionTime');
    if (el) el.style.display = 'none';
  }

  function startServerConnectionTimer(lastSyncTime) {
    stopServerConnectionTimer();
    const el = document.getElementById('serverConnectionTime');
    if (!el || !lastSyncTime) return;
    el.style.display = 'block';
    function update() {
      const elapsed = Date.now() - new Date(lastSyncTime).getTime();
      if (elapsed < 0) { el.textContent = '刚刚同步'; return; }
      const totalSec = Math.floor(elapsed / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      if (min >= 60) {
        const hours = Math.floor(min / 60);
        if (hours >= 24) { el.textContent = `🕐 上次同步: ${Math.floor(hours / 24)}天前`; return; }
        el.textContent = `🕐 上次同步: ${hours}时${min % 60}分前`;
      } else {
        el.textContent = `🕐 上次同步: ${min}分${sec}秒前`;
      }
    }
    update();
    serverConnectionTimer = setInterval(update, 1000);
  }

  function stopServerConnectionTimer() {
    if (serverConnectionTimer) {
      clearInterval(serverConnectionTimer);
      serverConnectionTimer = null;
    }
    const el = document.getElementById('serverConnectionTime');
    if (el) el.style.display = 'none';
  }

  async function loadSyncHistory_(mode) {
    const result = await chrome.runtime.sendMessage({ action: 'getSyncHistory' });
    const entries = (result.history || []).filter(e => {
      if (mode === 'p2p') return e.type.startsWith('p2p_');
      if (mode === 'server') return e.type.startsWith('server_');
      return true;
    });
    const containerId = mode === 'p2p' ? 'p2pLogContent' : 'syncLogContent';
    const sectionId = mode === 'p2p' ? 'p2pLogSection' : 'syncLogSection';
    const container = document.getElementById(containerId);
    const section = document.getElementById(sectionId);
    if (!container || !section) return;
    if (entries.length === 0) {
      section.style.display = 'none';
      return;
    }
    section.style.display = 'block';
    container.innerHTML = entries.map(e => {
      const time = new Date(e.time).toLocaleTimeString();
      let icon = '🔄';
      if (e.type.includes('connect')) icon = '🔗';
      else if (e.type.includes('disconnect')) icon = '🔌';
      else if (e.type.includes('enable')) icon = '✅';
      else if (e.type.includes('disable')) icon = '⏸️';
      else if (e.type.includes('sync')) icon = '🔄';
      return '<div class="sync-log-item ' + (e.type.includes('disconnect') || e.type.includes('disable') ? '' : 'success') + '">' +
        icon + ' ' + time + ' — ' + e.detail + '</div>';
    }).join('');
  }

  // ========== 模式切换 ==========
  let currentMode = 'p2p'; // 'p2p' | 'server'

  function switchMode(mode) {
    currentMode = mode;
    document.getElementById('modeP2P').className = 'sync-mode-btn' + (mode === 'p2p' ? ' active' : '');
    document.getElementById('modeServer').className = 'sync-mode-btn' + (mode === 'server' ? ' active' : '');
    document.getElementById('p2pSection').style.display = mode === 'p2p' ? 'block' : 'none';
    document.getElementById('serverSection').style.display = mode === 'server' ? 'block' : 'none';
  }

  document.getElementById('modeP2P').addEventListener('click', () => switchMode('p2p'));
  document.getElementById('modeServer').addEventListener('click', () => switchMode('server'));

  // ========== P2P 配对 ==========

  let p2pState = 'idle'; // idle | created | joined | connected

  // 加载 P2P 配置
  async function loadP2PConfig() {
    const config = await chrome.runtime.sendMessage({ action: 'getSyncConfig' });
    document.getElementById('p2pDeviceName').value = config.p2pDeviceName || '';
    document.getElementById('p2pSignalUrl').value = config.signalUrl || 'http://你的信令服务器地址:5789';
    document.getElementById('p2pSyncDomain').value = config.syncedDomains?.[0] || '';
    document.getElementById('p2pSyncToggle').checked = config.enabled && config.mode === 'p2p';
    
    if (p2pState === 'connected') {
      updateP2PStatus('connected');
    }
  }

  function updateP2PStatus(state, peerName, connectedAt) {
    const statusEl = document.getElementById('p2pStatus');
    const notConnected = document.getElementById('p2pNotConnected');
    const connectedDiv = document.getElementById('p2pConnected');
    
    p2pState = state;
    
    if (state === 'connected') {
      statusEl.textContent = '✅ 已连接';
      statusEl.style.background = '#e6f4ea';
      statusEl.style.color = '#137333';
      notConnected.style.display = 'none';
      connectedDiv.style.display = 'block';
      document.getElementById('p2pPeerName').textContent = peerName || '对端设备';
      document.getElementById('p2pLogSection').style.display = 'block';
      // 启动连接时间倒计时
      if (connectedAt) startP2PConnectionTimer(connectedAt);
    } else if (state === 'waiting') {
      statusEl.textContent = '⏳ 等待对方加入...';
      statusEl.style.background = '#fff3e0';
      statusEl.style.color = '#e65100';
    } else {
      statusEl.textContent = '⏸️ 未连接';
      statusEl.style.background = '#f1f3f4';
      statusEl.style.color = '#888';
      notConnected.style.display = 'block';
      connectedDiv.style.display = 'none';
      document.getElementById('p2pRoomDisplay').style.display = 'none';
      document.getElementById('p2pJoinInput').style.display = 'none';
      document.getElementById('p2pLogSection').style.display = 'none';
      stopP2PConnectionTimer();
    }
    // 不管连接状态，有历史就显示历史
    loadSyncHistory_('p2p');
  }

  // 创建配对
  document.getElementById('btnP2PCreate').addEventListener('click', async () => {
    const deviceName = document.getElementById('p2pDeviceName').value.trim() || '我的电脑';
    
    const result = await chrome.runtime.sendMessage({ action: 'p2pCreateRoom', deviceName });
    if (!result.success) return showToast('⚠️ ' + result.error);
    
    // 保存信令地址
    const signalUrl = document.getElementById('p2pSignalUrl').value.trim();
    await chrome.runtime.sendMessage({ action: 'saveSyncConfig', config: { signalUrl, p2pDeviceName: deviceName } });
    
    document.getElementById('p2pRoomCodeDisplay').textContent = result.roomId;
    document.getElementById('p2pRoomDisplay').style.display = 'block';
    document.getElementById('p2pNotConnected').style.display = 'none';
    updateP2PStatus('waiting');
    showToast(`✅ 配对已创建，配对码: ${result.roomId}`);
  });

  // 显示加入输入框
  document.getElementById('btnP2PJoin').addEventListener('click', () => {
    document.getElementById('p2pJoinInput').style.display = 'block';
    document.getElementById('p2pRoomCode').value = '';
    document.getElementById('p2pRoomCode').focus();
  });

  // 确认加入
  document.getElementById('btnP2PDoJoin').addEventListener('click', async () => {
    const roomId = document.getElementById('p2pRoomCode').value.trim().toUpperCase();
    if (!roomId || roomId.length < 4) return showToast('⚠️ 请输入有效的配对码');
    
    const deviceName = document.getElementById('p2pDeviceName').value.trim() || '我的电脑';
    
    const result = await chrome.runtime.sendMessage({ action: 'p2pJoinRoom', roomId, deviceName });
    if (!result.success) return showToast('⚠️ ' + result.error);
    
    const signalUrl = document.getElementById('p2pSignalUrl').value.trim();
    await chrome.runtime.sendMessage({ action: 'saveSyncConfig', config: { signalUrl, p2pDeviceName: deviceName, p2pRoomId: roomId } });
    
    document.getElementById('p2pJoinInput').style.display = 'none';
    showToast('✅ 已加入配对，正在连接...');
  });

  // 断开连接
  document.getElementById('btnP2PDisconnect').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'p2pDisconnect' });
    await chrome.runtime.sendMessage({ action: 'saveSyncConfig', config: { p2pConnected: false, p2pRoomId: '' } });
    updateP2PStatus('idle');
    showToast('🔌 已断开连接');
  });

  // 取消配对
  document.getElementById('btnP2PCancel').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'p2pDisconnect' });
    updateP2PStatus('idle');
    showToast('已取消配对');
  });

  // P2P 同步开关
  document.getElementById('p2pSyncToggle').addEventListener('change', async function() {
    const config = await chrome.runtime.sendMessage({ action: 'getSyncConfig' });
    const domain = document.getElementById('p2pSyncDomain').value.trim() || currentDomain || '';
    
    if (this.checked) {
      if (!domain) { showToast('⚠️ 请填写同步域名或打开目标站点'); this.checked = false; return; }
      
      // 保存配置并启用
      await chrome.runtime.sendMessage({ action: 'saveSyncConfig', config: { 
        enabled: true, mode: 'p2p', syncedDomains: domain ? [domain] : [], intervalMinutes: 5 
      }});
      const result = await chrome.runtime.sendMessage({ action: 'p2pToggleSync', enabled: true, intervalMinutes: 5 });
      if (result.success) showToast('✅ ' + result.message);
      else { showToast('⚠️ ' + (result.error || '启用失败')); this.checked = false; }
    } else {
      await chrome.runtime.sendMessage({ action: 'p2pToggleSync', enabled: false });
      showToast('⏸️ P2P 同步已禁用');
    }
    loadP2PSyncStatus();
  });

  // 立即 P2P 同步
  document.getElementById('btnP2PSyncNow').addEventListener('click', async () => {
    const result = await chrome.runtime.sendMessage({ action: 'p2pManualSync' });
    showToast('🔄 同步已触发');
    loadP2PSyncStatus();
  });

  // P2P 同步状态
  async function loadP2PSyncStatus() {
    const config = await chrome.runtime.sendMessage({ action: 'getSyncConfig' });
    const statusEl = document.getElementById('p2pSyncStatus');
    if (config.enabled && config.mode === 'p2p') {
      const lastSync = config.lastSyncTime 
        ? `最后同步: ${new Date(config.lastSyncTime).toLocaleTimeString()}`
        : '尚未同步';
      statusEl.textContent = `✅ 已启用 | ${lastSync}`;
      statusEl.style.background = '#e6f4ea';
      statusEl.style.color = '#137333';
    } else {
      statusEl.textContent = '⏸️ 未启用';
      statusEl.style.background = '#f1f3f4';
      statusEl.style.color = '#888';
    }
  }

  // P2P 状态更新监听（来自 background）
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'p2pStatusUpdate') {
      if (request.connected) {
        updateP2PStatus('connected', request.peerId, request.connectedAt);
      } else {
        updateP2PStatus('idle');
        stopP2PConnectionTimer();
      }
      loadP2PSyncStatus();
    }
    if (request.action === 'p2pPeerJoined') {
      showToast(`📡 新设备加入: ${request.peerDeviceName || '未知设备'}`);
    }
    if (request.action === 'p2pPeerLeft') {
      showToast('🔌 对端已断开');
      updateP2PStatus('idle');
      stopP2PConnectionTimer();
    }
    if (request.action === 'p2pSyncComplete') {
      showToast(`✅ 从对端同步了 ${request.imported} 个 Cookie`);
      loadSyncHistory_('p2p');
      loadP2PSyncStatus();
    }
    return false;
  });

  // ========== 云同步（服务器模式）===========

  // 生成配对码
  document.getElementById('btnGenerateKey').addEventListener('click', () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let key = '';
    for (let i = 0; i < 8; i++) key += chars.charAt(Math.floor(Math.random() * chars.length));
    document.getElementById('syncPairKey').value = key;
    document.getElementById('syncPairKey').readOnly = false;
    showToast('✅ 新配对码已生成');
  });

  async function loadServerConfig() {
    const config = await chrome.runtime.sendMessage({ action: 'serverGetSyncConfig' });
    document.getElementById('syncToggle').checked = config.enabled;
    document.getElementById('syncServerUrl').value = config.serverUrl || 'http://你的服务器:5789';
    document.getElementById('syncPairKey').value = config.pairKey || '';
    document.getElementById('syncDeviceName').value = config.deviceName || '';
    document.getElementById('syncDomain').value = config.syncedDomains?.[0] || '';
    document.getElementById('syncInterval').value = config.intervalMinutes || 5;
    updateServerStatus(config);
  }

  function updateServerStatus(config) {
    const statusEl = document.getElementById('syncStatus');
    if (config.enabled) {
      const lastSync = config.lastSyncTime ? `最后同步: ${new Date(config.lastSyncTime).toLocaleTimeString()}` : '尚未同步';
      statusEl.textContent = `✅ 已启用 | ${lastSync} | 间隔: ${config.intervalMinutes} 分钟`;
      statusEl.style.background = '#e6f4ea'; statusEl.style.color = '#137333';
      if (config.lastSyncTime) startServerConnectionTimer(config.lastSyncTime);
      else stopServerConnectionTimer();
    } else {
      statusEl.textContent = '⏸️ 未启用'; statusEl.style.background = '#f1f3f4'; statusEl.style.color = '#888';
      stopServerConnectionTimer();
    }
  }

  document.getElementById('btnSaveSync').addEventListener('click', async () => {
    const config = {
      serverUrl: document.getElementById('syncServerUrl').value.trim(),
      pairKey: document.getElementById('syncPairKey').value.trim(),
      deviceName: document.getElementById('syncDeviceName').value.trim(),
      syncedDomains: document.getElementById('syncDomain').value.trim() ? [document.getElementById('syncDomain').value.trim()] : (currentDomain ? [currentDomain] : []),
      intervalMinutes: parseInt(document.getElementById('syncInterval').value)
    };
    if (!config.serverUrl) return showToast('⚠️ 请输入服务器地址');
    if (!config.pairKey) return showToast('⚠️ 请输入配对码');
    await chrome.runtime.sendMessage({ action: 'serverSaveSyncConfig', config });
    showToast('✅ 配置已保存');
    loadServerConfig();
  });

  document.getElementById('syncToggle').addEventListener('change', async function() {
    if (this.checked) {
      const config = await chrome.runtime.sendMessage({ action: 'serverGetSyncConfig' });
      const serverUrl = document.getElementById('syncServerUrl').value.trim() || config.serverUrl;
      const pairKey = document.getElementById('syncPairKey').value.trim() || config.pairKey;
      if (!serverUrl) { showToast('⚠️ 请先配置服务器地址'); this.checked = false; return; }
      if (!pairKey) { showToast('⚠️ 请先生成或输入配对码'); this.checked = false; return; }
      
      const domain = document.getElementById('syncDomain').value.trim() || currentDomain || '';
      await chrome.runtime.sendMessage({ action: 'serverSaveSyncConfig', config: { enabled: true, serverUrl, pairKey, deviceName: document.getElementById('syncDeviceName').value.trim(), syncedDomains: domain ? [domain] : [], intervalMinutes: parseInt(document.getElementById('syncInterval').value) } });
      const result = await chrome.runtime.sendMessage({ action: 'serverToggleSync', enabled: true });
      if (result.success) showToast('✅ ' + result.message);
      else { showToast('⚠️ ' + (result.error || '启用失败')); this.checked = false; }
    } else {
      await chrome.runtime.sendMessage({ action: 'serverToggleSync', enabled: false });
      showToast('⏸️ 同步已禁用');
    }
    const config = await chrome.runtime.sendMessage({ action: 'serverGetSyncConfig' });
    updateServerStatus(config);
    loadSyncHistory_('server');
  });

  document.getElementById('btnSyncNow').addEventListener('click', async () => {
    const result = await chrome.runtime.sendMessage({ action: 'serverManualSync' });
    if (result.success !== false) {
      const imported = result.imported ? '已导入新 Cookie ✅' : '无更新';
      showToast(`🔄 同步完成 | ${imported}`);
    } else showToast('⚠️ 同步失败: ' + (result.error || '未知错误'));
    loadSyncHistory_('server');
    const config = await chrome.runtime.sendMessage({ action: 'serverGetSyncConfig' });
    updateServerStatus(config);
  });

  // ========== 保活管理 ==========

  async function loadHeartbeats() {
    // 停止旧倒计时，重新加载
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    const result = await chrome.runtime.sendMessage({ action: 'getHeartbeats' });
    const beats = result.heartbeats || [];
    renderHeartbeats(beats);
  }

  function renderHeartbeats(beats) {
    const container = document.getElementById('heartbeatItems');
    const listDiv = document.getElementById('heartbeatList');
    const emptyEl = document.getElementById('heartbeatEmpty');
    const statusEl = document.getElementById('heartbeatLastStatus');

    if (beats.length === 0) {
      listDiv.style.display = 'none';
      emptyEl.style.display = 'block';
      statusEl.style.display = 'none';
      return;
    }

    listDiv.style.display = 'block';
    emptyEl.style.display = 'none';
    statusEl.style.display = 'block';

    const total = beats.length;
    const active = beats.filter(b => b.enabled).length;
    statusEl.textContent = `📊 共 ${total} 条，${active} 条活跃`;
    statusEl.style.background = active > 0 ? '#e6f4ea' : '#f1f3f4';
    statusEl.style.color = active > 0 ? '#137333' : '#888';

    container.innerHTML = beats.map(beat => {
      const intervalText = beat.intervalMinutes + ' 分钟';
      const displayUrl = beat.url.length > 35 ? beat.url.substring(0, 32) + '...' : beat.url;
      // 从URL提取可读的站点名
      let siteDomain = beat.domain || '';
      if (!siteDomain) {
        try { siteDomain = new URL(beat.url.startsWith('http') ? beat.url : 'https://' + beat.url).hostname; } catch {}
      }
      const siteLabel = siteDomain ? siteDomain.replace(/^www\./, '') : '';
      const lastTime = beat.lastHeartbeatTime ? new Date(beat.lastHeartbeatTime).toLocaleTimeString() : '尚未保活';
      const lastStatus = beat.lastHeartbeatTime
        ? (beat.lastStatus === 'ok' ? '✅' : '❌') + ' ' + (beat.lastStatusDetail || '')
        : '⏳ 等待首次';
      const nextRun = beat.lastHeartbeatTime
        ? new Date(beat.lastHeartbeatTime).getTime() + beat.intervalMinutes * 60000
        : Date.now();
      const nextRunTime = Math.max(0, nextRun - Date.now());
      const countdownText = beat.enabled
        ? formatCountdown(nextRunTime)
        : '⏸️ 已暂停';
      return '<div class="hb-item" data-id="' + beat.id + '" data-nextrun="' + nextRun + '" data-interval="' + (beat.intervalMinutes * 60000) + '" data-enabled="' + beat.enabled + '">' +
        '<div class="hb-item-main" style="display:flex;align-items:flex-start">' +
          '<div style="flex:1;min-width:0">' +
            '<span class="heartbeat-url">' + displayUrl + '</span>' +
            '<br><span style="font-size:10px;color:#999">每' + intervalText + '</span>' +
            '<span style="font-size:10px;color:#1a73e8;margin-left:4px">' + (siteLabel ? '📍 ' + siteLabel : '') + '</span>' +
            '<div class="hb-countdown" style="font-size:11px;margin-top:3px">' +
              '<span class="hb-timer" data-id="' + beat.id + '">⏱ ' + countdownText + '</span>' +
              '<span style="color:#888;margin-left:8px;font-size:10px">上次: ' + lastStatus + ' ' + lastTime + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="heartbeat-actions" style="margin-left:6px">' +
            '<button class="' + (beat.enabled ? 'heartbeat-toggle-on' : 'heartbeat-toggle-off') + '" ' +
              'data-action="toggle" data-id="' + beat.id + '" data-enabled="' + beat.enabled + '">' +
              (beat.enabled ? '✅' : '⏸️') +
            '</button>' +
            '<button class="heartbeat-delete" data-action="delete" data-id="' + beat.id + '">✕</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    // 绑定事件
    container.querySelectorAll('[data-action="toggle"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const enabled = btn.dataset.enabled === 'true' ? false : true;
        await chrome.runtime.sendMessage({ action: 'toggleHeartbeat', id, enabled });
        showToast(enabled ? '✅ 保活已启用' : '⏸️ 保活已暂停');
        loadHeartbeats();
      });
    });
    container.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!confirm('确定删除此保活规则？')) return;
        await chrome.runtime.sendMessage({ action: 'removeHeartbeat', id });
        showToast('🗑️ 已删除');
        loadHeartbeats();
      });
    });

    // 启动倒计时
    if (active > 0) startCountdownTimer();
  }

  let countdownTimer = null;
  function startCountdownTimer() {
    if (countdownTimer) return;
    countdownTimer = setInterval(() => {
      const timers = document.querySelectorAll('.hb-timer');
      if (timers.length === 0) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        return;
      }
      const now = Date.now();
      timers.forEach(el => {
        const item = el.closest('.hb-item');
        if (!item) return;
        if (item.dataset.enabled !== 'true') { el.textContent = '⏸️ 已暂停'; return; }
        const nextRun = parseInt(item.dataset.nextrun);
        const remaining = Math.max(0, nextRun - now);
        el.textContent = '⏱ ' + formatCountdown(remaining);
      });
    }, 1000);
  }

  function formatCountdown(ms) {
    if (ms <= 0) return '即将保活...';
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    if (min >= 60) return Math.floor(min / 60) + '时' + (min % 60) + '分';
    if (min > 0) return min + '分' + sec + '秒';
    return sec + '秒';
  }

  // 添加保活
  document.getElementById('btnAddHeartbeat').addEventListener('click', async () => {
    const input = document.getElementById('heartbeatUrl');
    const select = document.getElementById('heartbeatInterval');
    let url = input.value.trim();
    if (!url) return showToast('⚠️ 请输入保活 URL');
    const interval = parseInt(select.value);
    const result = await chrome.runtime.sendMessage({ action: 'addHeartbeat', url, interval, domain: currentDomain });
    if (result.success) {
      showToast(`✅ 已添加保活（每 ${interval} 分钟）`);
      input.value = '';
      loadHeartbeats();
    } else {
      showToast('⚠️ ' + (result.error || '添加失败'));
    }
  });

  // 回车添加
  document.getElementById('heartbeatUrl').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btnAddHeartbeat').click();
  });

  // 填入当前页面地址
  document.getElementById('btnFillUrl').addEventListener('click', async () => {
    const url = await getCurrentTabUrl();
    if (!url) return showToast('⚠️ 无法获取当前页面地址');
    document.getElementById('heartbeatUrl').value = url;
    showToast('📌 已填入当前页面地址');
  });

  // ========== 帮助文档 ==========
  document.getElementById('btnHelp').addEventListener('click', () => {
    const helpUrl = chrome.runtime.getURL('help/help.html');
    chrome.tabs.create({ url: helpUrl });
  });

  // 信令服务器帮助图标
  const signalIcon = document.getElementById('signalHelpIcon');
  if (signalIcon) {
    signalIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      const helpUrl = chrome.runtime.getURL('help/help.html#signaling-server');
      chrome.tabs.create({ url: helpUrl });
    });
  }

  // 服务器部署帮助图标
  const serverIcon = document.getElementById('serverHelpIcon');
  if (serverIcon) {
    serverIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      const helpUrl = chrome.runtime.getURL('help/help.html#server-install');
      chrome.tabs.create({ url: helpUrl });
    });
  }

  // ========== 本机网络地址（WebRTC 在弹出页中可用）==========

  function getLocalIPs() {
    return new Promise((resolve) => {
      const ips = { ipv4: [], ipv6: [] };
      const seen = new Set();
      let timer = setTimeout(() => resolve(ips), 3000);

      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        pc.createDataChannel('');
        pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => {});

        pc.onicecandidate = (event) => {
          if (!event.candidate) {
            clearTimeout(timer);
            timer = setTimeout(() => { pc.close(); resolve(ips); }, 100);
            return;
          }
          // 从 candidate 对象提取 IP（最可靠的方式）
          const addr = (event.candidate.address || event.candidate.ip || '')
            .replace(/^\[|\]$/g, '');  // 去除 IPv6 可能带的中括号
          if (addr && !seen.has(addr) && !addr.startsWith('127.')) {
            seen.add(addr);
            if (addr.includes(':')) ips.ipv6.push(addr);
            else ips.ipv4.push(addr);
          }
          // 备胎：从 candidate 字符串解析（处理 address 为空的情况）
          const c = event.candidate.candidate || '';
          // IPv4
          const ipv4m = c.match(/(\d+\.\d+\.\d+\.\d+)/);
          if (ipv4m && !seen.has(ipv4m[1]) && !ipv4m[1].startsWith('127.')) {
            seen.add(ipv4m[1]);
            ips.ipv4.push(ipv4m[1]);
          }
          // IPv6：分割空格，过滤出合法的 IPv6 地址（至少 2 个冒号）
          for (const token of c.split(/\s+/)) {
            if (!token.includes(':')) continue;
            if (token.length < 3 || token.length > 50) continue;
            // 只包含十六进制字符和冒号
            if (!/^[0-9a-f:]+$/i.test(token)) continue;
            if ((token.match(/:/g) || []).length < 2) continue;
            if (!seen.has(token) && token !== '::1') {
              seen.add(token);
              ips.ipv6.push(token);
            }
          }
        };

        pc.oniceconnectionstatechange = () => {
          if (['failed', 'disconnected'].includes(pc.iceConnectionState)) {
            clearTimeout(timer);
            resolve(ips);
          }
        };
      } catch (e) {
        clearTimeout(timer);
        resolve(ips);
      }
    });
  }

  document.getElementById('btnGetNetInfo').addEventListener('click', async function() {
    const resultDiv = document.getElementById('netInfoResult');
    const loadingDiv = document.getElementById('netInfoLoading');
    const listDiv = document.getElementById('netInfoList');
    
    resultDiv.style.display = 'block';
    loadingDiv.style.display = 'block';
    listDiv.style.display = 'none';
    this.textContent = '🔄 获取中...';
    this.disabled = true;
    
    // 策略一：优先尝试 chrome.system.network API
    let ips = null;
    try {
      const result = await chrome.runtime.sendMessage({ action: 'getNetworkInfo' });
      if (result && result.success && result.ipv4.length + result.ipv6.length > 0) {
        ips = { ipv4: result.ipv4, ipv6: result.ipv6 };
      }
    } catch (e) {}
    
    // 策略二：WebRTC 在弹出页直接检测（备胎）
    if (!ips) {
      ips = await getLocalIPs();
    }
    
    const ipv4 = ips.ipv4 || [];
    const ipv6 = ips.ipv6 || [];
    
    this.textContent = '🔄 重新获取';
    this.disabled = false;
    
    // 去重
    const unique = (arr) => [...new Set(arr.map(i => typeof i === 'string' ? i : i.address).filter(Boolean))];
    const v4addrs = unique(ipv4);
    const v6addrs = unique(ipv6);
    
    loadingDiv.style.display = 'none';
    listDiv.style.display = 'block';
    document.getElementById('netInfoBadge').textContent = `（${v4addrs.length + v6addrs.length} 个地址）`;
    
    let html = '';
    
    if (v4addrs.length > 0) {
      html += '<div style="margin-bottom:6px"><strong>IPv4：</strong></div>';
      for (const ip of v4addrs) {
        html += `<div data-ip="${ip}" style="display:flex;align-items:center;padding:3px 6px;background:#f5f5f5;border-radius:4px;margin-bottom:3px;font-family:monospace;font-size:12px;cursor:pointer" title="点击复制 ${ip}">
          <span style="color:#666;margin-right:8px">🌐</span>
          <span>${ip}</span>
        </div>`;
      }
    }
    
    if (v6addrs.length > 0) {
      html += '<div style="margin:8px 0 6px"><strong>IPv6：</strong></div>';
      for (const ip of v6addrs) {
        html += `<div data-ip="${ip}" style="display:flex;align-items:center;padding:3px 6px;background:#f5f5f5;border-radius:4px;margin-bottom:3px;font-family:monospace;font-size:11px;word-break:break-all;cursor:pointer" title="点击复制 ${ip}">
          <span style="color:#666;margin-right:8px">🌐</span>
          <span>${ip}</span>
        </div>`;
      }
    }
    
    if (!html) html = '<p style="color:#888;padding:6px">未检测到非回环地址</p>';
    
    html += '<p style="color:#888;font-size:11px;margin-top:6px;border-top:1px solid #e0e0e0;padding-top:6px">💡 点击地址可复制，方便填入「服务器地址」</p>';
    
    listDiv.innerHTML = html;
    
    // 点击复制（用 data-ip 属性定位）
    listDiv.querySelectorAll('[data-ip]').forEach(el => {
      el.addEventListener('click', () => {
        const ip = el.dataset.ip;
        navigator.clipboard.writeText(ip)
          .then(() => showToast(`✅ 已复制：${ip}`))
          .catch(() => showToast('❌ 复制失败'));
      });
    });
  });

  // ========== 初始化 ==========
  (async () => {
    const tabInfo = await getCurrentTabInfo();
    currentDomain = tabInfo.domain;
    const displayEl = document.getElementById('currentDomain');
    if (currentDomain) {
      const siteName = getSiteName(tabInfo.title, currentDomain);
      displayEl.textContent = siteName;
      displayEl.title = siteName + ' (' + currentDomain + ')';
      displayEl.className = 'domain-display domain-display-ellipsis';
    } else {
      displayEl.textContent = '⚠️ 无法访问';
      displayEl.style.color = '#ea4335';
    }
    
    // 加载配置
    const syncConfig = await chrome.runtime.sendMessage({ action: 'getSyncConfig' });
    
    // 恢复之前的模式
    if (syncConfig.mode === 'server') switchMode('server');
    else switchMode('p2p');
    
    await loadUserRules();
    await loadP2PConfig();
    await loadServerConfig();
    await loadHeartbeats();
    await loadRulesDB();
    await loadRecommendedRules();
    await loadSyncHistory_('p2p');
    await loadSyncHistory_('server');

    // 每 30 秒刷新保活状态（后台可能已执行保活）
    setInterval(async () => {
      const result = await chrome.runtime.sendMessage({ action: 'getHeartbeats' });
      const beats = result.heartbeats || [];
      renderHeartbeats(beats);
    }, 30000);

    // 默认填入当前页面地址（如果保活 URL 为空）
    const currentUrl = await getCurrentTabUrl();
    if (currentUrl && !document.getElementById('heartbeatUrl').value) {
      document.getElementById('heartbeatUrl').value = currentUrl;
    }
    
    // 如果之前是 P2P 已连接状态
    if (syncConfig.p2pRoomId && syncConfig.p2pConnected) {
      updateP2PStatus('connected', syncConfig.p2pConnectedPeerName || syncConfig.p2pDeviceName, syncConfig.p2pConnectedAt);
      loadP2PSyncStatus();
    }
    // 服务器模式恢复同步时间显示
    const serverConfig = await chrome.runtime.sendMessage({ action: 'serverGetSyncConfig' });
    if (serverConfig.enabled && serverConfig.lastSyncTime) {
      startServerConnectionTimer(serverConfig.lastSyncTime);
    }
  })();

})();
