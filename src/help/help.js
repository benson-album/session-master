// SessionMaster 帮助页 · 文件清单 + 版本号 + 侧边栏高亮 + 查看更多版本

(function() {
  'use strict';

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

    // 最新版（始终展开）
    var latest = versions[0];
    root.innerHTML = buildChangelogEntry(latest, true);

    // 旧版本列表（初始折叠）
    var oldHtml = '';
    for (var i = 1; i < versions.length; i++) {
      oldHtml += buildChangelogEntry(versions[i], false);
    }
    container.innerHTML = oldHtml;

    var total = versions.length - 1; // 除最新版外的旧版本数

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

    // 事件代理：点击旧版本标题切换展开/收起
    container.addEventListener('click', function(e) {
      var summary = e.target.closest('.changelog-summary');
      if (!summary) return;
      var entry = summary.parentNode;
      entry.classList.toggle('open');
      summary.classList.toggle('open');
    });
  }

  function buildChangelogEntry(ver, isLatest) {
    var title = ver.title || 'v' + ver.version;
    var label = title;
    if (ver.date) label += ' (' + ver.date + ')';
    if (isLatest) label += ' <span class="tag-latest">🔵 最新</span>';

    var bodyHtml = '';
    var categories = ver.items;

    if (typeof categories === 'object' && !Array.isArray(categories)) {
      // 新版：分类分组结构 { "🐛 修复": [...], "🎨 优化": [...] }
      var catKeys = Object.keys(categories);
      for (var ci = 0; ci < catKeys.length; ci++) {
      var catName = catKeys[ci];
      var catItems = categories[catName];

      bodyHtml += '<div class="category-heading">' + escapeHtml2(catName) + '</div>';
      if (catItems && catItems.length > 0) {
        bodyHtml += '<ul>';
        for (var ji = 0; ji < catItems.length; ji++) {
          bodyHtml += '<li>' + catItems[ji] + '</li>';
        }
        bodyHtml += '</ul>';
      }
      }
    } else if (Array.isArray(categories)) {
      // 旧版兼容：平铺数组
      var inList = false;
      for (var i = 0; i < categories.length; i++) {
        var item = categories[i];
        if (item.match(/^[✨🎨🐛]\s*(新增|优化|修复|首版发布)/)) {
          if (inList) { bodyHtml += '</ul>'; inList = false; }
          var oldTagClass = 'tag-new';
          if (item.indexOf('🎨') !== -1) oldTagClass = 'tag-update';
          else if (item.indexOf('🐛') !== -1 || item.indexOf('🔧') !== -1) oldTagClass = 'tag-fix';
          bodyHtml += '<p><span class="tag ' + oldTagClass + '">' + escapeHtml2(item) + '</span></p>';
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

  function escapeHtml2(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
    } catch(e) {
      // 非扩展环境，保留硬编码值
    }
  }
  updateVersion();

  // ===== 版本更新检查 =====
  function checkHelpUpdate() {
    // 从后台获取升级检测配置
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
    var links = document.querySelectorAll('.sidebar-link');
    var sections = [];
    var sidebarInner = document.querySelector('.sidebar-inner');
    if (!sidebarInner) return;

    // 收集所有导航链接对应的 section
    links.forEach(function(link) {
      var href = link.getAttribute('href');
      if (!href || !href.startsWith('#')) return;
      var target = document.getElementById(href.substring(1));
      if (target) {
        sections.push({ el: target, link: link, id: href.substring(1) });
      }
    });

    if (sections.length === 0) return;

    // 创建 IntersectionObserver——高亮当前可见章节
    var currentActive = null;

    function updateActive(visibleIds) {
      // 优先取第一个在视口中的
      var activeId = null;
      for (var i = 0; i < sections.length; i++) {
        if (visibleIds.indexOf(sections[i].id) !== -1) {
          activeId = sections[i].id;
          break;
        }
      }
      // 如果都不在视口，取最后离开的那个
      if (!activeId) return;

      if (currentActive === activeId) return;
      currentActive = activeId;

      links.forEach(function(l) { l.classList.remove('active'); });
      sections.forEach(function(s) {
        if (s.id === activeId) {
          s.link.classList.add('active');
        }
      });
    }

    // 延迟检查：等 IntersectionObserver 稳定后再首次标记
    var visibleSet = {};

    // 兜底：手动检查哪个 section 最靠近顶部
    function getClosestSection() {
      var scrollY = window.scrollY + 80; // 加偏移（固定头部高度）
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

    // 同时使用 IntersectionObserver 和 scroll 事件
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        visibleSet[entry.target.id] = entry.isIntersecting;
      });
      var visible = [];
      for (var id in visibleSet) {
        if (visibleSet[id]) visible.push(id);
      }
      if (visible.length > 0) {
        updateActive(visible);
      }
    }, { rootMargin: '-60px 0px -60% 0px', threshold: 0 });

    sections.forEach(function(s) { observer.observe(s.el); });

    // scroll 兜底：以防 observer 不够灵敏
    var scrollTimer = null;
    window.addEventListener('scroll', function() {
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
          if (closest) {
            if (currentActive !== closest) {
              currentActive = closest;
              links.forEach(function(l) { l.classList.remove('active'); });
              sections.forEach(function(s) {
                if (s.id === closest) s.link.classList.add('active');
              });
            }
          }
        }
      }, 100);
    }, { passive: true });

    // 初始标记
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

  var container = document.getElementById('fileList');
  if (container) {
    // 获取文件在扩展中的 URL
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
      container.innerHTML = html;

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
              updateItem(idx, f.name, f.desc, blobUrl);
            } else {
              updateItem(idx, f.name, f.desc, null);
              hasError = true;
            }
            checkDone();
          };

          xhr.onerror = function() {
            updateItem(idx, f.name, f.desc, null);
            hasError = true;
            checkDone();
          };

          xhr.ontimeout = function() {
            updateItem(idx, f.name, f.desc, null);
            hasError = true;
            checkDone();
          };

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
          container.parentNode.appendChild(note);
        }
      }
    }

    function updateItem(idx, name, desc, blobUrl) {
      var items = container.querySelectorAll('div[style*="border-bottom"]');
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

      item.innerHTML =
        '<div style="flex:1;min-width:0">' + linkHtml +
          '<br><span style="font-size:11px;color:var(--text-muted)">' + safeDesc + '</span>' +
        '</div>' + btnHtml;
    }

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;');
    }

    loadAllFiles();
  }

  // 侧边栏初始化（需 DOM 加载后执行）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      initSidebar();
      initChangelogPagination();
      checkHelpUpdate();
    });
  } else {
    initSidebar();
    initChangelogPagination();
    checkHelpUpdate();
  }
})();
