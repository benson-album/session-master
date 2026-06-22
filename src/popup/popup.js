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
    // 策略：用分隔符（· | – —）拆分标题，取最后一段
    // 因为大多网站标题格式是 "页面名 · 站点名" 或 "页面名 | 站点名"
    // 注意：不包含普通连字符 -，它在域名/项目名中太常见（如 session-master）
    var segments = title.split(/[·|–—]/).map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
    if (segments.length > 1) {
      // 取最后一段作为站点名
      var name = segments[segments.length - 1];
      if (name.length >= 2 && !name.includes('.')) return name;
    }
    // 无分隔符时取第一个词
    var name = title.replace(/[-_]/g, ' ').trim().split(/\s+/)[0] || '';
    // 如果结果太短或像域名，改用域名
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
  let lastExportData = null;

  document.getElementById('btnExport').addEventListener('click', async () => {
    if (!currentDomain) return showToast('⚠️ 无法获取当前站点域名');
    const result = await chrome.runtime.sendMessage({ action: 'getCookies', domain: currentDomain });
    if (!result.success) return showToast('⚠️ ' + result.message);
    document.getElementById('resultTitle').textContent = `🍪 ${currentDomain}`;
    document.getElementById('resultCount').textContent = `${result.data.cookies.length} 个 Cookie`;
    document.getElementById('resultContent').value = result.data.quick;
    document.getElementById('resultHint').textContent = `✅ 导出成功！导出时间: ${new Date(result.data.exportTime).toLocaleString()}`;
    document.getElementById('cookieResult').style.display = 'block';
    document.getElementById('importBox').style.display = 'none';
    lastExportData = result.data;
    showToast(`✅ 已导出 ${result.data.cookies.length} 个 Cookie`);
  });

  document.getElementById('btnCopy').addEventListener('click', () => {
    const textarea = document.getElementById('resultContent');
    textarea.select();
    navigator.clipboard.writeText(textarea.value)
      .then(() => showToast('✅ 已复制到剪贴板'))
      .catch(() => { document.execCommand('copy'); showToast('✅ 已复制'); });
  });

  document.getElementById('btnExportFile').addEventListener('click', () => {
    if (!lastExportData) return showToast('⚠️ 请先导出 Cookie');
    const fileData = {
      domain: lastExportData.domain,
      exportTime: lastExportData.exportTime,
      cookies: lastExportData.cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite,
        hostOnly: c.hostOnly
      }))
    };
    const blob = new Blob([JSON.stringify(fileData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cookies-${lastExportData.domain}-${new Date(lastExportData.exportTime).toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('📥 已下载 Cookie 文件');
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
      // 文本模式解析：先提取域名标识行
      let importDomain = currentDomain;
      let cleanText = rawText;
      const domainMarker = rawText.match(/^#\s*Domain:\s*["']?([^"';\n\r]+)["']?\s*$/im);
      if (domainMarker) {
        importDomain = domainMarker[1].trim();
        cleanText = rawText.replace(/^#\s*Domain:.*$/im, '').trim();
      } else {
        // 兼容旧格式：domain=xxx 或 domain: xxx
        const legacyMatch = rawText.match(/domain[:=]\s*["']?([^"';\s,]+)["']?/i);
        if (legacyMatch) importDomain = legacyMatch[1];
      }
      const pairs = cleanText.split(';').map(s => s.trim()).filter(Boolean);
      const cookies = pairs.map(pair => {
        const eqIdx = pair.indexOf('=');
        if (eqIdx === -1) return null;
        return { name: pair.substring(0, eqIdx).trim(), value: pair.substring(eqIdx + 1).trim(), domain: importDomain, path: '/', secure: true, httpOnly: true, hostOnly: true };
      }).filter(Boolean);
      if (cookies.length === 0) return showToast('⚠️ 无法解析 Cookie 内容');
      importData = { domain: importDomain, cookies };
    }

    const compositeResult = await chrome.runtime.sendMessage({ action: 'importWithCookieClear', domain: currentDomain, data: importData });
    document.getElementById('importTextarea').value = '';
    document.getElementById('importBox').style.display = 'none';
    if (compositeResult.imported > 0) showToast(`✅ 成功导入 ${compositeResult.imported} 个 Cookie！刷新页面生效`);
    if (compositeResult.failed > 0) console.warn('导入失败:', compositeResult.errors);
  });

  // 从 JSON 文件导入 Cookie
  document.getElementById('btnImportFromFile').addEventListener('click', () => {
    document.getElementById('importCookieFile').click();
  });
  document.getElementById('importCookieFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed.cookies || !Array.isArray(parsed.cookies))
        return showToast('⚠️ 文件格式不正确，缺少 cookies 数组');
      const importData = {
        domain: parsed.domain || currentDomain,
        exportTime: parsed.exportTime || new Date().toISOString(),
        cookies: parsed.cookies
      };
      const compositeResult = await chrome.runtime.sendMessage({ action: 'importWithCookieClear', domain: currentDomain, data: importData });
      document.getElementById('importBox').style.display = 'none';
      if (compositeResult.imported > 0) showToast(`✅ 从文件成功导入 ${compositeResult.imported} 个 Cookie！刷新页面生效`);
      if (compositeResult.failed > 0) console.warn('导入失败:', compositeResult.errors);
    } catch (err) {
      showToast('⚠️ 文件读取或解析失败: ' + err.message);
    }
    e.target.value = '';
  });

  // 关闭导出/导入面板
  document.getElementById('btnCloseResult').addEventListener('click', () => {
    document.getElementById('cookieResult').style.display = 'none';
  });
  document.getElementById('btnCloseImport').addEventListener('click', () => {
    document.getElementById('importBox').style.display = 'none';
  });

  document.getElementById('btnClear').addEventListener('click', async () => {
    if (!currentDomain) return showToast('⚠️ 无法获取当前站点域名');
    if (!confirm(`确定清除 ${currentDomain} 的所有 Cookie？`)) return;
    const result = await chrome.runtime.sendMessage({ action: 'clearCookies', domain: currentDomain });
    let msg = `✅ 已清除 ${result.removed} 个 Cookie`;
    if (result.heartbeatRemoved > 0) {
      msg += `，同时移除了 ${result.heartbeatRemoved} 条相关保活`;
    }
    showToast(msg);
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

  // ========== 拦截模块配置 ==========

  let blockerConfig = null;  // 缓存运行时配置

  // 加载拦截模块状态
  async function loadBlockerState() {
    const config = await chrome.runtime.sendMessage({ action: 'getBlockerConfig' });
    blockerConfig = config;

    // 主开关
    document.getElementById('blockerMasterToggle').checked = config.masterEnabled;

    // 渲染当前站点激活规则 / 未匹配提示
    await renderActiveRules(config);

    // 渲染规则库（带站点开关）
    await renderSiteRules(config);

    return config;
  }

  // 保存拦截配置
  async function saveBlockerConfig(updates) {
    const current = blockerConfig || await chrome.runtime.sendMessage({ action: 'getBlockerConfig' });
    const merged = { ...current, ...updates };
    const result = await chrome.runtime.sendMessage({ action: 'saveBlockerConfig', config: merged });
    blockerConfig = result;
    return result;
  }

  // 渲染当前站点激活规则
  async function renderActiveRules(config) {
    const section = document.getElementById('activeRulesSection');
    const noMatch = document.getElementById('noMatchSection');
    const container = document.getElementById('activeRulesContainer');
    const domainLabel = document.getElementById('activeRulesDomain');

    if (!currentDomain) {
      section.style.display = 'none';
      noMatch.style.display = 'none';
      return;
    }

    domainLabel.textContent = '(' + currentDomain + ')';

    if (!config.masterEnabled) {
      section.style.display = 'none';
      noMatch.style.display = 'none';
      return;
    }

    // 获取生效关键词
    const kwResult = await chrome.runtime.sendMessage({ action: 'getEffectiveKeywords', domain: currentDomain });
    const keywords = kwResult.keywords || [];
    const keywordLabels = kwResult.keywordLabels || {};

    if (keywords.length === 0) {
      section.style.display = 'none';
      noMatch.style.display = 'block';
      return;
    }

    section.style.display = 'block';
    noMatch.style.display = 'none';

    // 渲染可点击的关键词标签
    const overrides = config.keywordOverrides || {};
    container.innerHTML = keywords.map(function(kw) {
      var label = keywordLabels[kw] || kw;
      var enabled = overrides[kw] !== false;  // 默认启用
      return '<span class="rule-tag kw-toggle" data-keyword="' + kw + '" style="cursor:pointer;' +
        (!enabled ? 'opacity:0.4;text-decoration:line-through;' : '') +
        '" title="点击' + (enabled ? '关闭' : '开启') + '「' + label + '」">' +
        (enabled ? '✅ ' : '⬜ ') + label + '</span>';
    }).join('');
  }

  // 渲染规则库（带站点级开关）
  async function renderSiteRules(config) {
    const listEl = document.getElementById('ruleDBList');
    const countEl = document.getElementById('ruleDBCount');
    const db = await chrome.runtime.sendMessage({ action: 'getRulesDB' });
    if (!db || !db.sites || db.sites.length === 0) {
      countEl.textContent = '0 站点';
      listEl.innerHTML = '<p class="hint">规则库为空</p>';
      return;
    }
    countEl.textContent = db.sites.length + ' 站点';
    const siteEnabled = config.siteEnabled || {};
    const keywordLabels = db.keywordLabels || {};

    listEl.innerHTML = db.sites.map(function(site) {
      var enabled = siteEnabled[site.id] !== false;  // 默认启用
      var kwCount = (site.keywords || []).length;
      var kwHtml = kwCount > 0 ? site.keywords.map(function(kw) {
        var label = keywordLabels[kw] || kw;
        return '<code style="font-size:10px;color:#666;margin-right:4px">' + label + '</code>';
      }).join('') : '<span style="font-size:10px;color:#999">（暂无关键词）</span>';

      return '<div class="site-rule-row" style="padding:6px 0;border-bottom:1px solid #f0f0f0;display:flex;align-items:flex-start;gap:8px">' +
        // 站点信息（左侧）
        '<div style="flex:1;min-width:0">' +
          '<div style="font-weight:600;font-size:13px;color:' + (enabled ? '#333' : '#aaa') + '">' +
            site.name +
            (kwCount > 0 ? ' <span class="badge badge-green" style="font-size:10px">' + kwCount + ' 条</span>' : '') +
          '</div>' +
          '<div style="font-size:10px;color:#999;margin:2px 0">' + (site.domains || []).join(', ') + '</div>' +
          '<div style="font-size:10px;color:#666;line-height:1.6;margin-top:2px">' + kwHtml + '</div>' +
          (site.description ? '<div style="font-size:9px;color:#bbb;margin-top:1px">' + site.description + '</div>' : '') +
        '</div>' +
        // 站点开关（右侧）
        '<label class="switch" style="width:30px;height:17px;flex-shrink:0;margin-top:2px" title="' + (enabled ? '关闭' : '开启') + site.name + '">' +
          '<input type="checkbox" class="site-toggle" data-site-id="' + site.id + '"' + (enabled ? ' checked' : '') + '>' +
          '<span class="slider" style="height:17px"></span>' +
        '</label>' +
      '</div>';
    }).join('');

    if (db.sites.length === 0) listEl.innerHTML = '<p class="hint">规则库为空，可导入或从服务器更新</p>';

    // 给每个站点开关绑定事件
    listEl.querySelectorAll('.site-toggle').forEach(function(toggle) {
      toggle.addEventListener('change', async function() {
        var siteId = this.dataset.siteId;
        var newVal = this.checked;
        var overrides = Object.assign({}, (blockerConfig || {}).siteEnabled || {});
        overrides[siteId] = newVal;
        await saveBlockerConfig({ siteEnabled: overrides });
        // 刷新当前站点激活规则
        await renderActiveRules(blockerConfig);
        // 刷新本列表（更新文字颜色）
        await renderSiteRules(blockerConfig);
      });
    });
  }

  // ========== 事件绑定 ==========

  // 主开关
  document.getElementById('blockerMasterToggle').addEventListener('change', async function() {
    await saveBlockerConfig({ masterEnabled: this.checked });
    await loadBlockerState();
  });

  // 规则库折叠/展开
  document.getElementById('ruleDBToggle').addEventListener('click', function() {
    const list = document.getElementById('ruleDBList');
    const arrow = document.getElementById('ruleDBArrow');
    const isHidden = list.style.display === 'none';
    list.style.display = isHidden ? 'block' : 'none';
    arrow.textContent = isHidden ? '▼' : '▶';
  });

  // 关键词标签点击切换（事件委托）
  document.getElementById('activeRulesContainer').addEventListener('click', async function(e) {
    var tag = e.target.closest('.kw-toggle');
    if (!tag) return;
    var kw = tag.dataset.keyword;
    if (!kw) return;
    var overrides = Object.assign({}, (blockerConfig || {}).keywordOverrides || {});
    // 切换：若当前已明确关闭（false），则恢复默认启用（删除条目）
    if (overrides[kw] === false) {
      delete overrides[kw];
    } else {
      overrides[kw] = false;
    }
    await saveBlockerConfig({ keywordOverrides: overrides });
    await renderActiveRules(blockerConfig);
  });

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
        await loadBlockerState();
      } else {
        showToast('⚠️ ' + (result.error || '导入失败'));
      }
    } catch (err) {
      showToast('⚠️ 文件读取失败');
    }
    e.target.value = '';
  });

  // 获取并展示规则库同步信息（页面加载时调用）
  async function loadRulesDBSyncInfo() {
    try {
      const info = await chrome.runtime.sendMessage({ action: 'getRulesDBSyncInfo' });
      if (!info) return;
      document.getElementById('syncInfoVersion').textContent = 'v' + info.version;
      const updatedEl = document.getElementById('syncInfoUpdated');
      if (info.lastCheckTime && info.lastCheckTime !== '从未检查') {
        updatedEl.textContent = '上次同步: ' + info.lastCheckTime;
        document.getElementById('ruleDBSyncInfo').textContent = 'v' + info.version;
        document.getElementById('ruleDBSyncInfo').style.display = 'inline';
      } else {
        updatedEl.textContent = '内置 v' + info.version;
      }
    } catch (e) {
      console.warn('规则库同步信息加载失败:', e);
    }
  }
  loadRulesDBSyncInfo();

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
      if (result.skipped) {
        statusEl.textContent = '✅ 规则库已是最新（v' + result.localVersion + '）';
      } else {
        statusEl.textContent = '✅ ' + result.message;
      }
      statusEl.style.color = '#137333';
      await loadBlockerState();
      await loadRulesDBSyncInfo();  // 刷新同步信息
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

  // ========== 主从设备模式 ==========

  async function loadMasterMode() {
    const config = await chrome.runtime.sendMessage({ action: 'serverGetSyncConfig' });
    const masterMode = config.masterMode || false;
    const isMaster = config.isMaster !== false; // 默认 true
    
    document.getElementById('masterModeToggle').checked = masterMode;
    document.getElementById('isMasterToggle').checked = isMaster;
    updateMasterUI(masterMode, isMaster);
    
    await loadDeviceStatus(config);
  }

  async function loadDeviceStatus(localConfig) {
    const config = localConfig || await chrome.runtime.sendMessage({ action: 'serverGetSyncConfig' });
    const warningsEl = document.getElementById('masterWarnings');
    const deviceListEl = document.getElementById('masterDeviceList');
    const deviceItemsEl = document.getElementById('masterDeviceItems');
    
    try {
      const status = await chrome.runtime.sendMessage({ action: 'serverGetPairStatus' });
      if (status && status.success !== false && status.devices) {
        // 显示设备列表
        deviceListEl.style.display = 'block';
        deviceItemsEl.innerHTML = status.devices.map(d => 
          '<div style="display:flex;align-items:center;gap:4px;padding:3px 0;border-bottom:1px solid #f0f0f0">' +
            '<span>' + (d.isMaster ? '📡' : '📥') + '</span>' +
            '<span style="flex:1;font-size:11px">' + (d.name || d.id) + '</span>' +
            '<span style="font-size:10px;color:' + (d.isMaster ? '#137333' : '#e65100') + ';font-weight:600">' +
              (d.isMaster ? '主' : '从') + '</span>' +
          '</div>'
        ).join('');
        
        // 显示冲突警告
        if (status.warnings && status.warnings.length > 0) {
          warningsEl.style.display = 'block';
          warningsEl.innerHTML = status.warnings.map(w =>
            '<div style="padding:6px 10px;background:#fce4ec;border-radius:6px;font-size:11px;color:#c5221f;margin-bottom:4px">⚠️ ' + w + '</div>'
          ).join('');
        } else if (status.masterCount === 1 && status.slaveCount > 0) {
          // 正常的主从模式状态
          warningsEl.style.display = 'none';
        }
      }
    } catch (e) {
      deviceListEl.style.display = 'none';
    }
  }

  function setMasterConfigLocked(locked) {
    const toggle = document.getElementById('isMasterToggle');
    if (toggle) toggle.disabled = locked;
  }

  function updateMasterUI(masterMode, isMaster) {
    const statusEl = document.getElementById('masterStatus');
    const deviceRow = document.getElementById('masterDeviceRow');
    const modeLabel = document.getElementById('masterModeLabel');
    
    if (masterMode) {
      statusEl.textContent = '📡 已开启 — ' + (isMaster ? '此设备为【主设备】，将上传 Cookie 给其他设备' : '此设备为【从设备】，仅接收不下发');
      statusEl.style.background = isMaster ? '#e6f4ea' : '#fff3e0';
      statusEl.style.color = isMaster ? '#137333' : '#e65100';
      deviceRow.style.display = 'block';
      setMasterConfigLocked(true);
      if (modeLabel) { modeLabel.textContent = '主从模式'; modeLabel.style.color = '#e65100'; }
    } else {
      statusEl.textContent = '⏸️ 已关闭（多设备平等模式，自动版本控制）';
      statusEl.style.background = '#f1f3f4';
      statusEl.style.color = '#888';
      deviceRow.style.display = 'none';
      if (modeLabel) { modeLabel.textContent = '平等模式'; modeLabel.style.color = '#137333'; }
    }
  }

  // 主从开关切换
  document.getElementById('masterModeToggle').addEventListener('change', async function() {
    const masterMode = this.checked;
    const isMaster = masterMode ? document.getElementById('isMasterToggle').checked : true;
    await chrome.runtime.sendMessage({ action: 'saveMasterMode', masterMode, isMaster });
    updateMasterUI(masterMode, isMaster);
    showToast(masterMode ? '📡 主从模式已开启' : '📡 主从模式已关闭，切换为平等模式');
    if (currentMode === 'server') loadDeviceStatus();
  });

  // 主/从身份切换
  document.getElementById('isMasterToggle').addEventListener('change', async function() {
    const isMaster = this.checked;
    const masterMode = document.getElementById('masterModeToggle').checked;
    await chrome.runtime.sendMessage({ action: 'saveMasterMode', masterMode, isMaster });
    const statusEl = document.getElementById('masterStatus');
    if (isMaster) {
      statusEl.textContent = '📡 已开启 — 此设备为【主设备】，将上传 Cookie 给其他设备';
      statusEl.style.background = '#e6f4ea'; statusEl.style.color = '#137333';
      showToast('✅ 已设为主设备');
    } else {
      statusEl.textContent = '📡 已开启 — 此设备为【从设备】，仅接收不下发';
      statusEl.style.background = '#fff3e0'; statusEl.style.color = '#e65100';
      // 从设备模式 → 自动暂停所有保活
      const pauseResult = await chrome.runtime.sendMessage({ action: 'pauseAllHeartbeats' });
      if (pauseResult && pauseResult.paused > 0) {
        showToast('⏸️ 已切换为从设备，自动暂停 ' + pauseResult.paused + ' 条保活（保活应由主设备负责）');
      } else {
        showToast('⏸️ 已设为从设备，不再上传 Cookie');
      }
      loadHeartbeats();
    }
    if (currentMode === 'server') loadDeviceStatus();
  });

  // ========== P2P 主从设备模式 ==========

  function updateP2PMasterUI(masterMode, isMaster) {
    const statusEl = document.getElementById('p2pMasterStatus');
    const deviceRow = document.getElementById('p2pMasterDeviceRow');
    const isToggle = document.getElementById('p2pIsMasterToggle');
    const modeLabel = document.getElementById('p2pMasterModeLabel');
    if (masterMode) {
      statusEl.textContent = '📡 已开启 — ' + (isMaster ? '主设备（上传 Cookie）' : '从设备（仅接收）');
      statusEl.style.background = isMaster ? '#e6f4ea' : '#fff3e0';
      statusEl.style.color = isMaster ? '#137333' : '#e65100';
      deviceRow.style.display = 'block';
      if (isToggle) isToggle.disabled = true;
      if (modeLabel) { modeLabel.textContent = '主从模式'; modeLabel.style.color = '#e65100'; }
    } else {
      statusEl.textContent = '⏸️ 已关闭（平等模式）';
      statusEl.style.background = '#f1f3f4';
      statusEl.style.color = '#888';
      deviceRow.style.display = 'none';
      if (modeLabel) { modeLabel.textContent = '平等模式'; modeLabel.style.color = '#137333'; }
    }
  }

  document.getElementById('p2pMasterModeToggle').addEventListener('change', async function() {
    const masterMode = this.checked;
    const isMaster = masterMode ? document.getElementById('p2pIsMasterToggle').checked : true;
    await chrome.runtime.sendMessage({ action: 'saveSyncConfig', config: { masterMode, isMaster } });
    updateP2PMasterUI(masterMode, isMaster);
    showToast(masterMode ? '📡 P2P 主从模式已开启' : '📡 P2P 主从模式已关闭');
  });

  document.getElementById('p2pIsMasterToggle').addEventListener('change', async function() {
    const isMaster = this.checked;
    const masterMode = document.getElementById('p2pMasterModeToggle').checked;
    await chrome.runtime.sendMessage({ action: 'saveSyncConfig', config: { masterMode, isMaster } });
    const statusEl = document.getElementById('p2pMasterStatus');
    if (isMaster) {
      statusEl.textContent = '📡 已开启 — 主设备（上传 Cookie）';
      statusEl.style.background = '#e6f4ea'; statusEl.style.color = '#137333';
      showToast('✅ 已设为主设备');
    } else {
      statusEl.textContent = '📡 已开启 — 从设备（仅接收）';
      statusEl.style.background = '#fff3e0'; statusEl.style.color = '#e65100';
      // 从设备模式 → 自动暂停所有保活
      const pauseResult = await chrome.runtime.sendMessage({ action: 'pauseAllHeartbeats' });
      if (pauseResult && pauseResult.paused > 0) {
        showToast('⏸️ 已切换为从设备，自动暂停 ' + pauseResult.paused + ' 条保活（保活应由主设备负责）');
      } else {
        showToast('⏸️ 已设为从设备');
      }
      loadHeartbeats();
    }
  });

  // ========== P2P 配对 ==========

  let p2pState = 'idle'; // idle | created | joined | connected

  // 加载 P2P 配置
  async function loadP2PConfig() {
    const config = await chrome.runtime.sendMessage({ action: 'getSyncConfig' });
    document.getElementById('p2pDeviceName').value = config.p2pDeviceName || '';
    document.getElementById('p2pSignalUrl').value = config.signalUrl || 'http://你的信令服务器地址:5789';
    document.getElementById('p2pSyncDomain').value = config.syncedDomains?.[0] || '';
    document.getElementById('p2pSyncToggle').checked = config.enabled && config.mode === 'p2p';
    // P2P 主从
    const p2pMasterMode = config.masterMode || false;
    const p2pIsMaster = config.isMaster !== false;
    document.getElementById('p2pMasterModeToggle').checked = p2pMasterMode;
    document.getElementById('p2pIsMasterToggle').checked = p2pIsMaster;
    updateP2PMasterUI(p2pMasterMode, p2pIsMaster);
    
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
      // 9分钟后房间过期，给出提示
      setTimeout(() => {
        if (p2pState === 'waiting') {
          statusEl.textContent = '⏳ 等待超时！请重新创建配对';
          statusEl.style.background = '#fce4ec';
          statusEl.style.color = '#c5221f';
        }
      }, 9 * 60 * 1000);
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
    const deviceName = document.getElementById('p2pDeviceName').value.trim();
    if (!deviceName) return showToast('⚠️ 请输入设备名称');
    const signalUrl = document.getElementById('p2pSignalUrl').value.trim();
    if (!signalUrl) return showToast('⚠️ 请输入信令服务器地址');
    
    const result = await chrome.runtime.sendMessage({ action: 'p2pCreateRoom', deviceName, signalUrl });
    if (!result.success) return showToast('⚠️ ' + result.error);
    
    // 保存信令地址（上面已获取 signalUrl）
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
    
    let deviceName = document.getElementById('p2pDeviceName').value.trim();
    if (!deviceName) {
      // 尝试从已保存配置读取设备名
      const syncConfig = await chrome.runtime.sendMessage({ action: 'getSyncConfig' });
      deviceName = (syncConfig && syncConfig.p2pDeviceName) || '';
      if (!deviceName) return showToast('⚠️ 请输入设备名称');
      // 回填输入框
      document.getElementById('p2pDeviceName').value = deviceName;
    }
    
    const result = await chrome.runtime.sendMessage({ action: 'p2pJoinRoom', roomId, deviceName, signalUrl: document.getElementById('p2pSignalUrl').value.trim() });
    if (!result.success) return showToast('⚠️ ' + result.error);
    
    const signalUrl = document.getElementById('p2pSignalUrl').value.trim();
    await chrome.runtime.sendMessage({ action: 'saveSyncConfig', config: { signalUrl, p2pDeviceName: deviceName, p2pRoomId: roomId } });
    
    document.getElementById('p2pJoinInput').style.display = 'none';
    showToast('✅ 已加入配对，正在连接...');
  });

  // P2P 保存配置
  document.getElementById('btnP2pSaveConfig').addEventListener('click', async () => {
    const signalUrl = document.getElementById('p2pSignalUrl').value.trim();
    if (!signalUrl) return showToast('⚠️ 请输入信令服务器地址');
    const syncDomain = document.getElementById('p2pSyncDomain').value.trim();
    const p2pDeviceName = document.getElementById('p2pDeviceName').value.trim();
    const masterMode = document.getElementById('p2pMasterModeToggle').checked;
    const isMaster = document.getElementById('p2pIsMasterToggle').checked;
    await chrome.runtime.sendMessage({ action: 'saveSyncConfig', config: { 
      signalUrl, p2pDeviceName, syncedDomains: syncDomain ? [syncDomain] : [], masterMode, isMaster 
    }});
    showToast('✅ P2P 配置已保存');
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
    // 检查服务器同步是否已启用 — 两者互斥
    const serverCfg = await chrome.runtime.sendMessage({ action: 'serverGetSyncConfig' });
    if (this.checked && serverCfg.enabled) {
      showToast('⚠️ 请先关闭服务器同步，再启用 P2P 同步');
      this.checked = false;
      return;
    }

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

  function setServerConfigLocked(locked) {
    const els = [
      document.getElementById('syncServerUrl'),
      document.getElementById('syncPairKey'),
      document.getElementById('syncDeviceName'),
      document.getElementById('syncDomain'),
      document.getElementById('syncInterval'),
      document.getElementById('btnSaveSync'),
      document.getElementById('btnGenerateKey'),
      document.getElementById('btnFillSyncDomain')
    ];
    els.forEach(el => { if (el) el.disabled = locked; });
    // 视觉提示：锁定后配置区域半透明
    const section = document.getElementById('syncConfigSection');
    if (section) section.style.opacity = locked ? '0.5' : '1';
  }

  function updateServerStatus(config) {
    const statusEl = document.getElementById('syncStatus');
    const syncNowBtn = document.getElementById('btnSyncNow');
    if (config.enabled) {
      const lastSync = config.lastSyncTime ? `最后同步: ${new Date(config.lastSyncTime).toLocaleTimeString()}` : '尚未同步';
      statusEl.textContent = `✅ 已启用 | ${lastSync} | 间隔: ${config.intervalMinutes} 分钟`;
      statusEl.style.background = '#e6f4ea'; statusEl.style.color = '#137333';
      if (config.lastSyncTime) startServerConnectionTimer(config.lastSyncTime);
      else stopServerConnectionTimer();
      setServerConfigLocked(true);
      if (syncNowBtn) syncNowBtn.style.display = '';
    } else {
      statusEl.textContent = '⏸️ 未启用'; statusEl.style.background = '#f1f3f4'; statusEl.style.color = '#888';
      stopServerConnectionTimer();
      setServerConfigLocked(false);
      if (syncNowBtn) syncNowBtn.style.display = 'none';
    }
  }

  document.getElementById('btnSaveSync').addEventListener('click', async () => {
    const config = {
      serverUrl: document.getElementById('syncServerUrl').value.trim(),
      pairKey: document.getElementById('syncPairKey').value.trim(),
      deviceName: document.getElementById('syncDeviceName').value.trim(),
      syncedDomains: (function() {
        var val = document.getElementById('syncDomain').value.trim();
        if (val) return [val];
        if (currentDomain) return [currentDomain];
        return [];
      })(),
      intervalMinutes: parseInt(document.getElementById('syncInterval').value)
    };
    if (!config.serverUrl) return showToast('⚠️ 请输入服务器地址');
    if (!config.pairKey) return showToast('⚠️ 请输入配对码');
    if (!config.deviceName) return showToast('⚠️ 请输入设备名称');
    if (!config.syncedDomains || config.syncedDomains.length === 0) return showToast('⚠️ 请输入要同步的站点域名');
    await chrome.runtime.sendMessage({ action: 'serverSaveSyncConfig', config });
    showToast('✅ 配置已保存');
    // 询问用户是否立即开始同步
    if (confirm('配置已保存，是否立即开始同步？')) {
      // 开启开关 + 执行同步
      document.getElementById('syncToggle').checked = true;
      await chrome.runtime.sendMessage({ action: 'serverSaveSyncConfig', config: { enabled: true, ...config } });
      const result = await chrome.runtime.sendMessage({ action: 'serverToggleSync', enabled: true });
      if (result.success) showToast('✅ ' + result.message);
      else { showToast('⚠️ ' + (result.error || '启用同步失败')); document.getElementById('syncToggle').checked = false; }
    }
    loadServerConfig();
  });

  document.getElementById('syncToggle').addEventListener('change', async function() {
    if (this.checked) {
      // 检查 P2P 同步是否已启用 — 两者互斥
      const p2pCfg = await chrome.runtime.sendMessage({ action: 'getSyncConfig' });
      if (p2pCfg.enabled && p2pCfg.mode === 'p2p') {
        showToast('⚠️ 请先关闭 P2P 同步，再启用服务器同步');
        this.checked = false;
        return;
      }

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
    // 获取所有心跳对应域名的 Cookie 来源元数据
    const domains = [...new Set(beats.map(b => (b.domain || '').replace(/^www\./, '')).filter(Boolean))];
    const cookieMetaByDomain = {};
    for (const domain of domains) {
      const metaResult = await chrome.runtime.sendMessage({ action: 'getCookieMetaForDomain', domain });
      if (metaResult && metaResult.meta) {
        const hasRemote = Object.values(metaResult.meta).some(m => m.origin === 'remote');
        const hasLocal = Object.values(metaResult.meta).some(m => m.origin === 'local');
        cookieMetaByDomain[domain] = { hasRemote, hasLocal };
      }
    }
    renderHeartbeats(beats, cookieMetaByDomain);
  }

  function renderHeartbeats(beats, cookieMetaByDomain) {
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
      let siteLabel = beat.siteName || '';
      let cleanDomain = '';
      if (!siteLabel) {
        let siteDomain = beat.domain || '';
        if (!siteDomain) {
          try { siteDomain = new URL(beat.url.startsWith('http') ? beat.url : 'https://' + beat.url).hostname; } catch {}
        }
        cleanDomain = siteDomain ? siteDomain.replace(/^www\./, '') : '';
        siteLabel = cleanDomain;
      } else {
        cleanDomain = (beat.domain || '').replace(/^www\./, '');
      }

      // 来源检测
      const domainMeta = cookieMetaByDomain && cookieMetaByDomain[cleanDomain];
      let sourceBadge = '';
      let conflictWarning = '';
      if (domainMeta) {
        if (domainMeta.hasRemote && domainMeta.hasLocal) {
          sourceBadge = '<span style="font-size:9px;margin-left:4px;color:#888;background:#f5f5f5;padding:0 4px;border-radius:3px">🌐本地+📡远程</span>';
          if (beat.enabled) {
            conflictWarning = '<div style="font-size:10px;color:#e65100;margin-top:2px">⚠️ 该站点 Cookie 来自多设备同步，保活可能导致 IP 冲突</div>';
          }
        } else if (domainMeta.hasRemote) {
          sourceBadge = '<span style="font-size:9px;margin-left:4px;color:#e65100;background:#fff3e0;padding:0 4px;border-radius:3px">📡 远程同步</span>';
          if (beat.enabled) {
            conflictWarning = '<div style="font-size:10px;color:#e65100;margin-top:2px">⚠️ Cookie 来自远程同步，保活可能导致来源冲突，建议关闭保活</div>';
          }
        } else if (domainMeta.hasLocal) {
          sourceBadge = '<span style="font-size:9px;margin-left:4px;color:#137333;background:#e6f4ea;padding:0 4px;border-radius:3px">🌐 本机 Cookie</span>';
        }
      }

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
        '<div class="hb-item-main" style="display:flex;align-items:flex-start;justify-content:space-between">' +
          '<div style="flex:1;min-width:0">' +
            '<span class="heartbeat-url">' + displayUrl + '</span>' +
            '<br><span style="font-size:10px;color:#999">每' + intervalText + '</span>' +
            '<span style="font-size:10px;color:#bbb;margin-left:4px">📍 ' + siteLabel + '</span>' +
            sourceBadge +
            '<div class="hb-countdown" style="font-size:11px;margin-top:3px">' +
              '<span class="hb-timer" data-id="' + beat.id + '">⏱ ' + countdownText + '</span>' +
              '<span style="color:#888;margin-left:8px;font-size:10px">上次: ' + lastStatus + ' ' + lastTime + '</span>' +
            '</div>' +
            conflictWarning +
          '</div>' +
          '<div class="heartbeat-actions">' +
            '<button class="heartbeat-cookie" data-action="cookie" data-id="' + beat.id + '" title="查看此站点 Cookie">🍪</button>' +
            '<button class="' + (beat.enabled ? 'heartbeat-toggle-on' : 'heartbeat-toggle-off') + '" ' +
              'title="' + (beat.enabled ? '暂停此保活' : '启用此保活') + '" ' +
              'data-action="toggle" data-id="' + beat.id + '" data-enabled="' + beat.enabled + '">' +
              (beat.enabled ? '▶️' : '⏸️') +
            '</button>' +
            '<button class="heartbeat-delete" data-action="delete" data-id="' + beat.id + '" title="删除此保活">✕</button>' +
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
    container.querySelectorAll('[data-action="cookie"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const beat = beats.find(b => b.id === id);
        if (!beat) return;
        showCookieDetail(beat);
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
    // 获取当前页面标题，计算可读站点名
    let siteName = '';
    const tabInfo = await getCurrentTabInfo();
    if (tabInfo.title) {
      siteName = getSiteName(tabInfo.title, tabInfo.domain);
    }
    const result = await chrome.runtime.sendMessage({ action: 'addHeartbeat', url, interval, domain: currentDomain, siteName });
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

  // P2P 同步域名填入当前页面域名
  document.getElementById('btnP2pFillDomain').addEventListener('click', async () => {
    const { domain } = await getCurrentTabInfo();
    if (!domain) return showToast('⚠️ 无法获取当前页面域名');
    document.getElementById('p2pSyncDomain').value = domain;
    showToast('📌 已填入: ' + domain);
  });

  // 服务器模式同步域名填入当前页面域名
  document.getElementById('btnFillSyncDomain').addEventListener('click', async () => {
    const { domain } = await getCurrentTabInfo();
    if (!domain) return showToast('⚠️ 无法获取当前页面域名');
    document.getElementById('syncDomain').value = domain;
    showToast('📌 已填入: ' + domain);
  });

  // ========== 帮助文档 ==========
  document.getElementById('btnHelp').addEventListener('click', () => {
    const helpUrl = chrome.runtime.getURL('help/help.html');
    chrome.tabs.create({ url: helpUrl });
  });

  // 导出日志
  document.getElementById('btnExportLog').addEventListener('click', async () => {
    const result = await chrome.runtime.sendMessage({ action: 'exportLogs' });
    if (!result.text) return showToast('⚠️ 暂无日志记录');
    const blob = new Blob([result.text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sessionmaster-logs-' + new Date().toISOString().slice(0, 10) + '.txt';
    a.click();
    URL.revokeObjectURL(url);
    showToast('📋 日志已导出');
  });

  // 查看设备身份
  document.getElementById('btnDeviceInfo').addEventListener('click', async () => {
    const result = await chrome.runtime.sendMessage({ action: 'getDeviceIdentity' });
    const memLine = result.totalMemory ? '  内存: ' + result.totalMemory + ' GB' : (result.deviceMemory ? '  内存: ' + result.deviceMemory + ' GB' : '');
    const cpuLine = result.cpuModel ? '  CPU: ' + result.cpuModel + (result.cpuCores ? ' (' + result.cpuCores + '核)' : '') : (result.cpuCores ? '  CPU: ' + result.cpuCores + ' 核' : '');
    const langLine = result.language ? '  语言: ' + result.language : '';
    const platLine = result.platform ? '  平台: ' + result.platform : '';
    const archLine = result.arch ? ' (' + result.arch + ')' : '';
    const nameLine = result.deviceName
          ? '<div class="device-card-name">' + htmlesc(result.deviceName) + '</div>'
          : '<div class="device-card-name-hint">（未设置设备名，请前往「同步」标签页设置）</div>';

        let netHtml = '';
        if (result.network && result.network.length > 0) {
          const typeOrder = ['有线', '无线', 'VPN/隧道', '虚拟', '虚拟机', '其他', '回环'];
          const grouped = {};
          for (const n of result.network) {
            const t = n.type || '其他';
            if (!grouped[t]) grouped[t] = [];
            grouped[t].push(n);
          }
          netHtml = '<div class="device-card-network-group">';
          for (const t of typeOrder) {
            if (!grouped[t]) continue;
            netHtml += '<div class="device-card-network-type">【' + t + '】</div>';
            for (const n of grouped[t]) {
              if (n.isLoopback) continue;
              const addrPart = n.isIPv6 ? n.address : n.address + (n.mask ? ' / ' + n.mask : '');
              netHtml += '<div class="device-card-network-iface">' + htmlesc(n.name) + ' <code>' + htmlesc(addrPart) + '</code></div>';
            }
          }
          netHtml += '<div class="device-card-network-total">接口总数: ' + result.network.length + '</div>';
          netHtml += '</div>';
        }

        const html = '' +
          '<div class="device-card">' +
            nameLine +
          '</div>' +
          '<div class="device-card">' +
            '<div class="device-card-header"><span class="emoji">💻</span>系统</div>' +
            '<div class="device-card-row"><span class="device-card-label">操作系统</span><span class="device-card-value">' + htmlesc(result.os) + archLine + '</span></div>' +
            (result.platform ? '<div class="device-card-row"><span class="device-card-label">平台</span><span class="device-card-value">' + htmlesc(result.platform) + '</span></div>' : '') +
            (result.language ? '<div class="device-card-row"><span class="device-card-label">语言</span><span class="device-card-value">' + htmlesc(result.language) + '</span></div>' : '') +
            (cpuLine ? '<div class="device-card-row"><span class="device-card-label">CPU</span><span class="device-card-value">' + cpuLine.replace('  CPU: ', '') + '</span></div>' : '') +
            (memLine ? '<div class="device-card-row"><span class="device-card-label">内存</span><span class="device-card-value">' + memLine.replace('  内存: ', '') + '</span></div>' : '') +
          '</div>' +
          '<div class="device-card">' +
            '<div class="device-card-header"><span class="emoji">🌐</span>浏览器</div>' +
            '<div class="device-card-row"><span class="device-card-label">浏览器</span><span class="device-card-value">' + htmlesc(result.browser) + ' ' + htmlesc(result.browserVer || '') + '</span></div>' +
          '</div>' +
          (netHtml ? '<div class="device-card">' +
            '<div class="device-card-header"><span class="emoji">🌍</span>网络</div>' +
            netHtml +
          '</div>' : '') +
          '<div class="device-card">' +
            '<div class="device-card-header"><span class="emoji">🆔</span>设备 ID</div>' +
            '<div class="device-card-id">' + htmlesc(result.id) + '</div>' +
            '<div class="device-card-date">📅 ' + new Date(result.createdAt).toLocaleString() + '</div>' +
          '</div>';

    document.getElementById('deviceModalBody').innerHTML = html;
    document.getElementById('deviceModalOverlay').style.display = 'flex';
  });

  // 设备弹窗关闭
  document.getElementById('deviceModalClose').addEventListener('click', function() {
    document.getElementById('deviceModalOverlay').style.display = 'none';
  });
  document.getElementById('deviceModalOverlay').addEventListener('click', function(e) {
    if (e.target === e.currentTarget) {
      this.style.display = 'none';
    }
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
    const badge = document.getElementById('netInfoBadge');
    if (badge) badge.textContent = `（${v4addrs.length + v6addrs.length} 个地址）`;
    
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

  // 检测是否为空白/新标签页
  function isBlankTab(tabInfo) {
    if (!tabInfo || !tabInfo.url) return true;
    var url = tabInfo.url;
    // 新标签页、空白页、浏览器内部页面
    if (url === 'about:blank' || url === 'about:newtab' || url === 'about:new-tab-page') return true;
    if (url.startsWith('chrome://newtab')) return true;
    if (url.startsWith('chrome://')) return true;
    if (url.startsWith('about:')) return true;
    if (url.startsWith('edge://')) return true;
    if (!/^https?:/.test(url)) return true;
    return false;
  }

  // ========== 本地服务器自动检测 ==========

  var appConfig = null;
  var localServerFound = false;

  async function checkLocalServer() {
    // 获取配置（如果还没加载）
    if (!appConfig) {
      try { appConfig = await chrome.runtime.sendMessage({ action: 'getAppConfig' }); } catch(e) {}
      if (!appConfig || !appConfig.DEFAULT_PORT) return;
    }
    var port = appConfig.DEFAULT_PORT;
    var hosts = (appConfig.LOCAL_DISCOVERY && appConfig.LOCAL_DISCOVERY.HOSTS) || ['localhost', '127.0.0.1'];
    var timeout = (appConfig.LOCAL_DISCOVERY && appConfig.LOCAL_DISCOVERY.TIMEOUT_MS) || 3000;
    
    // 生成检测 URL 列表
    var urls = hosts.map(function(h) { return 'http://' + h + ':' + port + '/api/config'; });
    for (const url of urls) {
      try {
        const resp = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(timeout) });
        if (resp.ok) {
          const data = await resp.json();
          if (data && data.success !== false && data.config && data.config.serverUrl) {
            localServerFound = true;
            onLocalServerFound(data.config);
            return;
          }
          // config 为 null 但服务器在线（手动启动的、没有 config.json）
          if (data && data.success !== false) {
            localServerFound = true;
            onLocalServerFound({ serverUrl: url.replace('/api/config', ''), port: LOCAL_PORT, localIP: '127.0.0.1' });
            return;
          }
        }
      } catch (e) {
        // 超时或连接拒绝，正常，继续尝试下一个
      }
    }
    localServerFound = false;
    onLocalServerNotFound();
  }

  function onLocalServerFound(config) {
    var serverUrl = config.serverUrl;
    if (!serverUrl) serverUrl = 'http://' + (config.localIP || '127.0.0.1') + ':' + (config.port || String(appConfig && appConfig.DEFAULT_PORT || 5789));
    
    // 显示状态指示器
    var statusEl = document.getElementById('localServerStatus');
    var urlDisplay = document.getElementById('localServerUrlDisplay');
    if (statusEl && urlDisplay) {
      urlDisplay.textContent = serverUrl;
      statusEl.style.display = 'block';
    }
    
    // 隐藏引导卡片
    var guideEl = document.getElementById('localServerGuide');
    if (guideEl) guideEl.style.display = 'none';
    
    // 自动填入 P2P 信令地址和服务器地址（仅在输入框为空或占位符时）
    var signalInput = document.getElementById('p2pSignalUrl');
    if (signalInput && (!signalInput.value || signalInput.value.indexOf('你的') !== -1)) {
      signalInput.value = serverUrl;
    }
    var serverInput = document.getElementById('syncServerUrl');
    if (serverInput && (!serverInput.value || serverInput.value.indexOf('你的') !== -1)) {
      serverInput.value = serverUrl;
    }
  }

  function onLocalServerNotFound() {
    // 隐藏状态指示器
    var statusEl = document.getElementById('localServerStatus');
    if (statusEl) statusEl.style.display = 'none';
    
    // 如果用户从未配置过任何同步，显示引导卡片
    chrome.runtime.sendMessage({ action: 'getSyncConfig' }).then(function(config) {
      chrome.runtime.sendMessage({ action: 'serverGetSyncConfig' }).then(function(srvCfg) {
        var neverConfigured = !config.signalUrl || config.signalUrl.indexOf('你的') !== -1;
        var neverDismissed = !localStorage.getItem('guide_dismissed');
        var guideEl = document.getElementById('localServerGuide');
        if (guideEl && neverConfigured && neverDismissed) {
          guideEl.style.display = 'block';
        }
      });
    });
  }

  // ========== 版本更新检查 ==========

  function compareVersions(a, b) {
    var pa = a.split('.').map(Number);
    var pb = b.split('.').map(Number);
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
      var na = pa[i] || 0;
      var nb = pb[i] || 0;
      if (na > nb) return 1;
      if (na < nb) return -1;
    }
    return 0;
  }

  async function checkUpdate() {
    try {
      // 从后台获取升级检测配置（URL 可从配置文件自定义）
      var ucfg = await chrome.runtime.sendMessage({ action: 'getUpdateConfig' });
      if (!ucfg || !ucfg.url || ucfg.enabled === false) return;
      var updateUrl = ucfg.url;
      
      var resp = await fetch(updateUrl, { method: 'GET', signal: AbortSignal.timeout(5000) });
      if (!resp.ok) return;
      var latest = (await resp.text()).trim();
      var current = chrome.runtime.getManifest().version;
      if (compareVersions(latest, current) > 0) {
        showUpdateAvailable(latest, current);
      } else {
        showUpToDate();
      }
    } catch (e) {
      // 网络不可达时静默
    }
  }

  function showUpdateAvailable(latest, current) {
    var banner = document.getElementById('updateBanner');
    var textEl = document.getElementById('updateBannerText');
    var verEl = document.getElementById('popupVersion');
    var status = document.getElementById('deviceStatus');
    if (!banner || !textEl) return;
    textEl.textContent = '🆕 v' + latest + ' 可用（当前 v' + current + '）';
    banner.style.display = 'flex';
    bindUpdateBannerEvents(latest);
    // 版本号 title 保持 "点击查看更新日志"
    if (verEl) verEl.title = '点击查看更新日志';
    // 🖥️ 旁边显示 ⬆ 有新版本（可点击跳转下载）
    if (status) {
      status.textContent = '⬆ ' + latest;
      status.className = 'device-status status-update';
      status.style.display = 'inline-flex';
      status.title = '新版本 v' + latest + ' 可用，点击下载';
      status.onclick = function() {
        chrome.tabs.create({ url: 'https://github.com/benson-album/session-master/releases/latest' });
      };
    }
  }

  function showUpToDate() {
    var verEl = document.getElementById('popupVersion');
    var status = document.getElementById('deviceStatus');
    // 版本号 hover 提示：已是最新版本
    if (verEl) verEl.title = 'v' + chrome.runtime.getManifest().version + ' · 已是最新版本';
    // 隐藏 🖥️ 旁边的状态指示器
    if (status) {
      status.style.display = 'none';
      status.onclick = null;
    }
  }

  // 版本更新横幅事件绑定
  function bindUpdateBannerEvents(latest) {
    var downloadBtn = document.getElementById('updateBannerDownload');
    var changelogBtn = document.getElementById('updateBannerChangelog');
    var dismissBtn = document.getElementById('updateBannerDismiss');
    var banner = document.getElementById('updateBanner');
    if (!banner) return;
    // 下载更新 → 跳转 GitHub Releases 最新版
    if (downloadBtn) {
      downloadBtn.addEventListener('click', function() {
        chrome.tabs.create({ url: 'https://github.com/benson-album/session-master/releases/latest' });
      });
    }
    // 查看更新日志 → 帮助页 changelog
    if (changelogBtn) {
      changelogBtn.addEventListener('click', function() {
        chrome.tabs.create({ url: chrome.runtime.getURL('help/help.html#changelog') });
      });
    }
    // 关闭横幅（本 popup 生命周期内不再显示）
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function() {
        banner.style.display = 'none';
      });
    }
  }

  // 锁定/解锁站点相关操作（含 P2P、服务器同步、网络地址保持可用）
  function setDomainDependentState(hasDomain, tabInfo) {
    var isBlank = isBlankTab(tabInfo);
    var banner = document.getElementById('blankPageBanner');
    var hintEl = document.getElementById('domainHint');
    var domainEl = document.getElementById('currentDomain');
    
    if (isBlank) {
      // 空白标签页：显示引导横幅
      if (banner) banner.style.display = 'flex';
      if (hintEl) hintEl.style.display = 'none';
      if (domainEl) {
        var tabUrl = (tabInfo && tabInfo.url) || '';
        if (!tabUrl || tabUrl === 'about:blank') {
          domainEl.textContent = '📄 空白标签页';
        } else {
          domainEl.textContent = '⚠️ 浏览器内部页面';
        }
        domainEl.style.color = '#e65100';
        domainEl.className = 'domain-display';
        domainEl.title = tabUrl || '未知';
      }
    } else if (!hasDomain) {
      // 有 URL 但获取不到域名（极少见情况）
      if (banner) banner.style.display = 'none';
      if (hintEl) hintEl.style.display = 'block';
      if (domainEl) {
        domainEl.textContent = '⚠️ 无法访问';
        domainEl.style.color = '#ea4335';
        domainEl.className = 'domain-display';
      }
    } else {
      // 正常站点：隐藏横幅和提示
      if (banner) banner.style.display = 'none';
      if (hintEl) hintEl.style.display = 'none';
    }
    
    // 需要锁定的操作按钮（有站点才可用）
    var lockedEls = [
      // Cookie 管理
      'btnExport', 'btnImport', 'btnClear',
      // 保活
      'btnAddHeartbeat',
      // Cookie 列表
      'btnLoadCookies',
      // P2P 配对
      'btnP2PCreate', 'btnP2PJoin', 'btnP2PDoJoin', 'btnP2PSyncNow', 'btnP2PDisconnect', 'btnP2PCancel',
      // P2P 同步开关
      'p2pSyncToggle',
      // P2P 保存配置
      'btnP2pSaveConfig',
      // P2P 填入域名
      'btnP2pFillDomain',
      // 服务器同步开关
      'syncToggle',
      // 服务器同步
      'btnSaveSync', 'btnSyncNow',
      // 服务器填入域名
      'btnFillSyncDomain',
      // 生成配对码（服务器模式）
      'btnGenerateKey'
    ];
    var locked = !hasDomain;
    lockedEls.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.disabled = locked;
    });
    
    // 锁定输入框
    var inputIds = [
      'heartbeatUrl',
      'p2pDeviceName', 'p2pRoomCode', 'p2pSyncDomain', 'p2pSignalUrl',
      'syncServerUrl', 'syncPairKey', 'syncDeviceName', 'syncDomain', 'syncInterval'
    ];
    inputIds.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.disabled = locked;
    });
    
    // 填入当前页面地址按钮
    var fillUrlBtn = document.getElementById('btnFillUrl');
    if (fillUrlBtn) fillUrlBtn.disabled = locked;
    
    // 保活按钮保持锁定控制（单项控制因为类型为 select）
    var heartbeatSelect = document.getElementById('heartbeatInterval');
    if (heartbeatSelect) heartbeatSelect.disabled = locked;
    
    // 以下功能保持可用：
    // - 获取本机网络地址 (btnGetNetInfo)
    // - 使用说明 (btnHelp)
    // - 同步模式切换 (modeP2P, modeServer)
    // - P2P/服务器 主从设备开关 (masterModeToggle, p2pMasterModeToggle)
    // - 自定义规则 (customRuleInput, btnAddRule)
    // - 规则管理 (btnExportRules, btnImportRules, btnUpdateRules)
    // - 信令帮助图标 (signalHelpIcon, serverHelpIcon)
    // - 帮助页链接
    // 以上按钮不在此函数中禁用，保持始终可用
  }

  // ========== Cookie 详情弹窗 ==========

  function showCookieDetail(beat) {
    const overlay = document.getElementById('cookieDetailOverlay');
    const titleEl = document.getElementById('cookieDetailTitle');
    const bodyEl = document.getElementById('cookieDetailBody');
    let domain = beat.domain || '';
    if (!domain) {
      try { domain = new URL(beat.url.startsWith('http') ? beat.url : 'https://' + beat.url).hostname; } catch {}
    }
    titleEl.textContent = '🍪 Cookie 详情 - ' + (domain || '未知');
    bodyEl.innerHTML = '<div class="cookie-detail-loading">⏳ 正在获取 Cookie...</div>';
    overlay.style.display = 'flex';
    (async () => {
      try {
        const result = await chrome.runtime.sendMessage({ action: 'getCookies', domain: domain });
        if (!result.success || !result.data || !result.data.cookies || result.data.cookies.length === 0) {
          bodyEl.innerHTML = '<div class="cookie-detail-empty">🍪 该站点暂无 Cookie</div>';
          return;
        }
        bodyEl.innerHTML = result.data.cookies.map(function(c) {
          var val = String(c.value);
          return '<div class="cookie-detail-item">' +
            '<div class="cookie-detail-name">' + htmlesc(c.name) + '</div>' +
            '<div class="cookie-detail-value">' + htmlesc(val.substring(0, 80)) + (val.length > 80 ? '...' : '') + '</div>' +
            '<div class="cookie-detail-extra">' +
              'path=' + htmlesc(c.path || '/') +
              ' | domain=' + htmlesc(c.domain || '') +
              (c.secure ? ' | secure' : '') +
              (c.httpOnly ? ' | httpOnly' : '') +
              (c.sameSite ? ' | SameSite=' + c.sameSite : '') +
              (c.expirationDate ? ' | expires=' + new Date(c.expirationDate * 1000).toLocaleDateString() : '') +
            '</div></div>';
        }).join('');
      } catch(e) {
        bodyEl.innerHTML = '<div class="cookie-detail-empty">' + e.message + '</div>';
      }
    })();
  }

  function htmlesc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

  document.getElementById('cookieDetailClose').addEventListener('click', function() {
    document.getElementById('cookieDetailOverlay').style.display = 'none';
  });
  document.getElementById('cookieDetailOverlay').addEventListener('click', function(e) {
    if (e.target === this) this.style.display = 'none';
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
      displayEl.style.color = '#1a73e8';
    }

    // ===== 版本号：动态显示 + 点击跳转到更新日志 =====
    var verEl = document.getElementById('popupVersion');
    if (verEl) {
      var ver = 'v' + chrome.runtime.getManifest().version;
      verEl.textContent = ver;
      verEl.title = '点击查看更新日志';
      verEl.style.cursor = 'pointer';
      verEl.addEventListener('click', function() {
        chrome.tabs.create({ url: chrome.runtime.getURL('help/help.html#changelog') });
      });
    }

    setDomainDependentState(!!currentDomain, tabInfo);
    
    // 自动检测本地服务器（先于配置加载）
    checkLocalServer();
    
    // 引导卡片关闭按钮
    document.getElementById('btnDismissGuide').addEventListener('click', function() {
      document.getElementById('localServerGuide').style.display = 'none';
      try { localStorage.setItem('guide_dismissed', 'true'); } catch(e) {}
    });
    
    // 复制代码按钮
    document.querySelectorAll('.copy-code-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var targetId = btn.dataset.target;
        var codeEl = document.getElementById(targetId);
        if (codeEl) {
          navigator.clipboard.writeText(codeEl.textContent).then(function() {
            showToast('✅ 已复制安装命令');
          }).catch(function() {
            showToast('❌ 复制失败');
          });
        }
      });
    });
    
    // 自动检查版本更新
    checkUpdate();
    
    // 加载配置
    const syncConfig = await chrome.runtime.sendMessage({ action: 'getSyncConfig' });
    
    // 恢复之前的模式
    if (syncConfig.mode === 'server') switchMode('server');
    else switchMode('p2p');
    
    await loadUserRules();
    await loadP2PConfig();
    await loadServerConfig();
    await loadHeartbeats();
    await loadBlockerState();
    await loadMasterMode();
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
