// SessionMaster 帮助页 · 动态内容加载 + 云端同步 + 侧边栏高亮 + 更新日志

(function() {
  'use strict';

  var _sidebarObserver = null; // 侧边栏 IntersectionObserver 实例，供重入时 disconnect
  var _sidebarScrollHandler = null; // 侧边栏 scroll 事件处理函数，供重入时移除

  // ===== 帮助内容加载与渲染 =====
  var HELP_CONTENT_KEY = 'help_cached_content';
  var HELP_VERSION_KEY = 'help_content_version';

  function initHelpContent() {
    var container = document.getElementById('helpContent');
    if (!container) return;

    // 尝试从缓存读取（chrome.storage）
    tryLoadFromStorage(container);
  }

  function tryLoadFromStorage(container) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([HELP_CONTENT_KEY, HELP_VERSION_KEY], function(items) {
        if (items[HELP_CONTENT_KEY]) {
          renderSections(container, items[HELP_CONTENT_KEY].sections || []);
          initSidebar(); // 内容已渲染，初始化侧边栏高亮
          updateSyncStatus(items[HELP_VERSION_KEY] || null);
        } else {
          loadFromBundled(container);
        }
        // 无论缓存命中与否，都在后台检查更新
        checkContentUpdate(container);
      });
    } else {
      loadFromBundled(container);
    }
  }

  function loadFromBundled(container) {
    var jsonUrl;
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      jsonUrl = chrome.runtime.getURL('help/help_content.json');
    } else {
      var base = window.location.href.replace(/\/[^/]*$/, '/');
      jsonUrl = base + 'help_content.json';
    }

    fetch(jsonUrl)
      .then(function(resp) { return resp.json(); })
      .then(function(data) {
        renderSections(container, data.sections || []);
        initSidebar(); // 内容已渲染，初始化侧边栏高亮
        // 缓存到 storage
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({
            HELP_CONTENT_KEY: 'help_cached_content',
            HELP_VERSION_KEY: 'help_content_version',
            // Store separately to avoid confusion
            help_cache: { sections: data.sections },
            help_version: data.version || 1
          });
        }
      })
      .catch(function() {
        fallbackContent(container);
      });
  }

  function renderSections(container, sections) {
    if (!container || !sections || sections.length === 0) {
      fallbackContent(container);
      initSidebar(); // 即便回退，也重新初始化（保持 clean state）
      return;
    }
    var html = '';
    for (var i = 0; i < sections.length; i++) {
      var s = sections[i];
      html += '<div class="card" id="' + s.id + '">' + s.html + '</div>';
    }
    container.innerHTML = html;
  }

  function fallbackContent(container) {
    if (!container) return;
    container.innerHTML = '<div class="card" style="text-align:center;padding:40px">' +
      '<p style="color:#999">⚠️ 帮助内容加载失败</p>' +
      '<p style="font-size:12px;color:#bbb;margin-top:8px">请检查网络连接或重新打开页面</p>' +
      '</div>';
  }

  function updateSyncStatus(version) {
    var el = document.getElementById('helpSyncStatus');
    if (!el) return;
    if (version) {
      el.textContent = '帮助内容 v' + version + ' · 来自云端';
      el.style.color = '#888';
    } else {
      el.textContent = '';
    }
  }

  // ===== 云端同步检查 =====
  var REMOTE_JSON_URL = 'https://raw.githubusercontent.com/benson-album/session-master/master/src/help/help_content.json';
  var SYNC_CHECK_KEY = 'help_sync_last_check';

  function checkContentUpdate(container) {
    // 读取本地版本号（从 meta 标签）
    var meta = document.querySelector('meta[name="help-content-version"]');
    var localVer = meta ? parseInt(meta.getAttribute('content'), 10) : 1;

    // 24h 节流
    var lastCheck = 0;
    try {
      if (typeof localStorage !== 'undefined') {
        lastCheck = parseInt(localStorage.getItem(SYNC_CHECK_KEY) || '0', 10);
      }
    } catch(e) {}
    var now = Date.now();
    if (now - lastCheck < 24 * 60 * 60 * 1000) return;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SYNC_CHECK_KEY, String(now));
      }
    } catch(e) {}

    // 获取远程版本
    fetch(REMOTE_JSON_URL, { method: 'GET', signal: AbortSignal.timeout(10000) })
      .then(function(resp) { return resp.json(); })
      .then(function(remote) {
        var remoteVer = remote.version || 0;
        if (remoteVer > localVer && remote.sections) {
          // 有更新版本
          renderSections(container, remote.sections);
          initSidebar(); // 内容已更新，重新初始化侧边栏高亮
          updateSyncStatus(remoteVer);
          // 缓存到 storage
          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({
              help_cache: { sections: remote.sections },
              help_version: remoteVer
            });
          }
        }
      })
      .catch(function() {
        // 静默失败，不影响页面显示
      });
  }

  // ===== 更新日志：从 changelog.json 动态加载 =====
  function initChangelogPagination() {
    var root = document.getElementById('changelogDynamic');
    var container = document.getElementById('changelogContainer');
    var btnLoadMore = document.getElementById('btnLoadMore');
    if (!root || !container || !btnLoadMore) return;

    var jsonUrl;
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      jsonUrl = chrome.runtime.getURL('changelog.json');
    } else {
      var base = window.location.href.replace(/\/[^/]*$/, '/');
      jsonUrl = base + '../changelog.json';
    }

    fetch(jsonUrl)
      .then(function(resp) { return resp.json(); })
      .then(function(versions) {
        if (!versions || versions.length === 0) return;
        renderChangelog(root, container, btnLoadMore, versions);
      })
      .catch(function() {
        root.innerHTML = '<p class="hint" style="padding:8px">⚠️ 更新日志加载失败</p>';
      });
  }

  function renderChangelog(root, container, btnLoadMore, versions) {
    var PAGE_SIZE = 20;
    var latest = versions[0];
    root.innerHTML = buildChangelogEntry(latest, true);

    var oldHtml = '';
    for (var i = 1; i < versions.length; i++) {
      oldHtml += buildChangelogEntry(versions[i], false);
    }
    container.innerHTML = oldHtml;

    var total = versions.length - 1;
    if (total > 0) {
      var firstBatch = Math.min(PAGE_SIZE, total);
      btnLoadMore.style.display = 'block';
      btnLoadMore.textContent = '📋 更多版本（' + firstBatch + '）';
    }

    btnLoadMore.addEventListener('click', function() {
      var isCollapsed = container.classList.contains('collapsed');
      if (isCollapsed) {
        container.classList.remove('collapsed');
        btnLoadMore.textContent = '📋 收起旧版本';
      } else {
        container.classList.add('collapsed');
        var firstBatch = Math.min(PAGE_SIZE, total);
        btnLoadMore.textContent = '📋 更多版本（' + firstBatch + '）';
      }
    });

    container.addEventListener('click', function(e) {
      var summary = e.target.closest('.changelog-summary');
      if (!summary) return;
      var entry = summary.parentNode;
      entry.classList.toggle('open');
      summary.classList.toggle('open');
    });
  }

  function buildChangelogEntry(ver, isLatest) {
    var label = 'v' + ver.version;
    if (ver.date) label += ' (' + ver.date + ')';
    if (isLatest) label += ' <span class="tag-latest">🔵 最新</span>';

    var bodyHtml = '';
    var categories = ver.items;

    if (typeof categories === 'object' && !Array.isArray(categories)) {
      var catKeys = Object.keys(categories);
      for (var ci = 0; ci < catKeys.length; ci++) {
        var catName = catKeys[ci];
        var catItems = categories[catName];
        bodyHtml += '<div class="category-heading">' + escapeHtml2(catName) + '</div>';
        bodyHtml += '<div class="category-divider"></div>';
        if (catItems && catItems.length > 0) {
          bodyHtml += '<ul>';
          for (var ji = 0; ji < catItems.length; ji++) {
            bodyHtml += '<li>' + catItems[ji] + '</li>';
          }
          bodyHtml += '</ul>';
        }
      }
    } else if (Array.isArray(categories)) {
      var inList = false;
      for (var i = 0; i < categories.length; i++) {
        var item = categories[i];
        if (item.match(/^[✨🎨🐛]\s*(新增|优化|修复|首版发布)/)) {
          if (inList) { bodyHtml += '</ul>'; inList = false; }
          bodyHtml += '<p><span class="tag ' + getOldTagClass(item) + '">' + escapeHtml2(item) + '</span></p>';
          continue;
        }
        if (!inList) { bodyHtml += '<ul>'; inList = true; }
        bodyHtml += '<li>' + item + '</li>';
      }
      if (inList) bodyHtml += '</ul>';
    }

    return '<div class="changelog-entry' + (isLatest ? ' open' : '') + '">' +
      '<div class="changelog-summary' + (isLatest ? ' open' : '') + '">' + label + '</div>' +
      '<div class="version-body">' + bodyHtml + '</div></div>';
  }

  function getOldTagClass(item) {
    if (item.indexOf('🎨') !== -1) return 'tag-update';
    if (item.indexOf('🐛') !== -1 || item.indexOf('🔧') !== -1) return 'tag-fix';
    return 'tag-new';
  }

  function escapeHtml2(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ===== 动态版本号 =====
  function updateVersion() {
    try {
      var ver = 'v' + chrome.runtime.getManifest().version;
      var heroEl = document.getElementById('appVersion');
      var footerEl = document.getElementById('footerVersion');
      if (heroEl) heroEl.textContent = ver;
      if (footerEl) footerEl.textContent = ver;
      document.title = 'SessionMaster ' + ver + ' · 使用说明';
    } catch(e) {}
  }
  updateVersion();

  // ===== 版本更新检查 =====
  function checkHelpUpdate() {
    chrome.runtime.sendMessage({ action: 'getUpdateConfig' }, function(ucfg) {
      if (!ucfg || !ucfg.url || ucfg.enabled === false) return;
      var updateUrl = ucfg.url;
      var params = new URLSearchParams(window.location.search);
      var highlightVersion = params.get('update') || '';

      fetch(updateUrl, { method: 'GET', signal: AbortSignal.timeout(5000) })
        .then(function(resp) {
          if (!resp.ok) return;
          return resp.text();
        })
        .then(function(latest) {
          if (!latest) return;
          latest = latest.trim();
          var current = chrome.runtime.getManifest().version;

          function cmp(a, b) {
            var pa = a.split('.').map(Number);
            var pb = b.split('.').map(Number);
            for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
              var na = pa[i] || 0, nb = pb[i] || 0;
              if (na > nb) return 1;
              if (na < nb) return -1;
            }
            return 0;
          }

          var heroEl = document.querySelector('.hero');
          if (!heroEl) return;

          if (cmp(latest, current) > 0) {
            var banner = document.createElement('div');
            banner.style.cssText = 'margin-top:12px;padding:8px 16px;background:rgba(255,255,255,0.2);border-radius:8px;font-size:13px';
            if (highlightVersion && highlightVersion === 'v' + latest) {
              banner.style.animation = 'updatePulse 1.5s ease-in-out 3';
            }
            banner.innerHTML = '⬆️ 新版本 <strong>v' + latest + '</strong> 可用（当前 v' + current + '）&nbsp;&nbsp;' +
              '<a href="' + updateUrl + '" target="_blank" style="color:#fff;text-decoration:underline">查看最新版本号</a>';
            heroEl.appendChild(banner);
          }
        })
        .catch(function() {});
    });
  }

  // ===== 侧边栏当前章节高亮 =====
  function initSidebar() {
    // 重入时先清理旧 observer
    if (_sidebarObserver) {
      _sidebarObserver.disconnect();
      _sidebarObserver = null;
    }

    var links = document.querySelectorAll('.sidebar-link');
    var sections = [];
    var sidebarInner = document.querySelector('.sidebar-inner');
    if (!sidebarInner) return;

    links.forEach(function(link) {
      var href = link.getAttribute('href');
      if (!href || !href.startsWith('#')) return;
      var target = document.getElementById(href.substring(1));
      if (target) {
        sections.push({ el: target, link: link, id: href.substring(1) });
      }
    });

    if (sections.length === 0) return;

    var currentActive = null;

    function updateActive(visibleIds) {
      var activeId = null;
      var HEADER_OFFSET = 70;
      var bestDist = Infinity;
      for (var i = 0; i < sections.length; i++) {
        if (visibleIds.indexOf(sections[i].id) !== -1) {
          // 取 top 最接近视口顶部锚点(70px)的章节
          var top = sections[i].el.getBoundingClientRect().top;
          var dist = Math.abs(top - HEADER_OFFSET);
          if (dist < bestDist) {
            bestDist = dist;
            activeId = sections[i].id;
          }
        }
      }
      if (!activeId) return;
      if (currentActive === activeId) return;
      currentActive = activeId;

      links.forEach(function(l) { l.classList.remove('active'); });
      sections.forEach(function(s) {
        if (s.id === activeId) s.link.classList.add('active');
      });
    }

    var visibleSet = {};

    function getClosestSection() {
      var scrollY = window.scrollY + 70;
      var best = null;
      var bestDist = Infinity;
      for (var i = 0; i < sections.length; i++) {
        var rect = sections[i].el.getBoundingClientRect();
        var top = rect.top + window.scrollY;
        var dist = Math.abs(scrollY - top);
        if (dist < bestDist) {
          bestDist = dist;
          best = sections[i].id;
        }
      }
      return best;
    }

    _sidebarObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        visibleSet[entry.target.id] = entry.isIntersecting;
      });
      var visible = [];
      for (var id in visibleSet) {
        if (visibleSet[id]) visible.push(id);
      }
      if (visible.length > 0) updateActive(visible);
    }, { rootMargin: '-60px 0px -60% 0px', threshold: 0 });

    sections.forEach(function(s) { _sidebarObserver.observe(s.el); });

    // 移除上一次的 scroll 处理器（重入时避免重复绑定）
    if (_sidebarScrollHandler) {
      window.removeEventListener('scroll', _sidebarScrollHandler, { passive: true });
      _sidebarScrollHandler = null;
    }

    var scrollTimer = null;
    _sidebarScrollHandler = function() {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function() {
        var visible = [];
        for (var id in visibleSet) {
          if (visibleSet[id]) visible.push(id);
        }
        if (visible.length > 0) {
          updateActive(visible);
        } else {
          var closest = getClosestSection();
          if (closest && currentActive !== closest) {
            currentActive = closest;
            links.forEach(function(l) { l.classList.remove('active'); });
            sections.forEach(function(s) {
              if (s.id === closest) s.link.classList.add('active');
            });
          }
        }
      }, 100);
    };
    window.addEventListener('scroll', _sidebarScrollHandler, { passive: true });

    setTimeout(function() {
      var first = getClosestSection();
      if (first) {
        currentActive = first;
        sections.forEach(function(s) {
          if (s.id === first) s.link.classList.add('active');
        });
      }
    }, 200);
  }

  // ===== 文件清单 =====
  var files = [
    { name: 'server.js', subdir: 'server', desc: '同步服务器（核心程序，零依赖，支持信令/P2P/云同步）' },
    { name: 'server.js', subdir: 'deploy', desc: 'Docker 版同步服务器（与 server.js 同步更新）' },
    { name: 'docker-compose.yaml', subdir: 'deploy', desc: 'Docker Compose 编排配置' },
    { name: 'Dockerfile', subdir: 'deploy', desc: 'Docker 镜像构建文件（node:22-alpine）' },
    { name: 'deploy.sh', subdir: 'deploy', desc: '一键部署脚本（SCP + Docker）' }
  ];

  var fileContainer = document.getElementById('fileList');
  if (fileContainer) {
    function getFilePath(f) {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        return chrome.runtime.getURL(f.subdir + '/' + f.name);
      }
      var base = window.location.href.replace(/\/[^/]*$/, '/');
      if (base.indexOf('help/') !== -1) base = base.replace(/help\/.*$/, '');
      return base + f.subdir + '/' + f.name;
    }

    function loadAllFiles() {
      var html = '';
      for (var i = 0; i < files.length; i++) {
        html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee">' +
          '<div style="flex:1;min-width:0">' +
            '<span style="font-family:monospace;font-size:13px;color:var(--text-muted)">📄 ' + escapeHtml(files[i].name) + '</span>' +
            '<br><span style="font-size:11px;color:var(--text-muted)">' + escapeHtml(files[i].desc) + '</span>' +
          '</div>' +
          '<span style="padding:4px 10px;background:#f1f3f4;color:#999;border-radius:4px;font-size:12px">⏳</span>' +
        '</div>';
      }
      fileContainer.innerHTML = html;

      var loaded = 0;
      var hasError = false;
      for (var i = 0; i < files.length; i++) {
        (function(idx) {
          var f = files[idx];
          var url = getFilePath(f);
          var xhr = new XMLHttpRequest();
          xhr.open('GET', url, true);
          xhr.onload = function() {
            if (xhr.status >= 200 && xhr.status < 300) {
              var content = xhr.responseText;
              var blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
              var blobUrl = URL.createObjectURL(blob);
              updateFileItem(idx, f.name, f.desc, blobUrl);
            } else {
              updateFileItem(idx, f.name, f.desc, null);
              hasError = true;
            }
            checkDone();
          };
          xhr.onerror = function() { updateFileItem(idx, f.name, f.desc, null); hasError = true; checkDone(); };
          xhr.ontimeout = function() { updateFileItem(idx, f.name, f.desc, null); hasError = true; checkDone(); };
          xhr.timeout = 10000;
          xhr.send();
        })(i);
      }

      function checkDone() {
        loaded++;
        if (loaded === files.length && hasError) {
          var note = document.createElement('p');
          note.style.cssText = 'font-size:11px;color:#c5221f;margin-top:6px';
          note.textContent = '⚠️ 部分文件加载失败，请直接从源码目录获取';
          fileContainer.parentNode.appendChild(note);
        }
      }
    }

    function updateFileItem(idx, name, desc, blobUrl) {
      var items = fileContainer.querySelectorAll('div[style*="border-bottom"]');
      if (idx >= items.length) return;
      var item = items[idx];
      var safeName = escapeHtml(name);
      var safeDesc = escapeHtml(desc);
      var linkHtml = blobUrl
        ? '<a href="' + blobUrl + '" download="' + safeName + '" style="font-family:monospace;font-size:13px;color:#1a73e8;text-decoration:none">📄 ' + safeName + '</a>'
        : '<span style="font-family:monospace;font-size:13px;color:#555">📄 ' + safeName + '</span>';
      var btnHtml = blobUrl
        ? '<a href="' + blobUrl + '" download="' + safeName + '" style="padding:4px 10px;background:#1a73e8;color:white;border-radius:4px;font-size:12px;text-decoration:none;white-space:nowrap">⬇ 下载</a>'
        : '<span style="color:#888;font-size:11px">🔗 请从源码目录获取</span>';
      item.innerHTML = '<div style="flex:1;min-width:0">' + linkHtml +
        '<br><span style="font-size:11px;color:var(--text-muted)">' + safeDesc + '</span></div>' + btnHtml;
    }

    function escapeHtml(str) {
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    loadAllFiles();
  }

  // ===== 初始化入口 =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      initHelpContent();
      initSidebar();
      initChangelogPagination();
      checkHelpUpdate();
    });
  } else {
    initHelpContent();
    initSidebar();
    initChangelogPagination();
    checkHelpUpdate();
  }
})();
