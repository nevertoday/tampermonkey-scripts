const SITES = [
  {
    id: 'xiaohongshu',
    name: '小红书',
    host: 'xiaohongshu.com',
    defaultPrefix: 'xiaohongshu',
    theme: { accent: '#ff2442', rgb: '255, 36, 66', dark: '#d81e38', badge: '小红书' }
  },
  {
    id: 'pinterest',
    name: 'Pinterest',
    host: 'pinterest.com',
    defaultPrefix: 'pinterest',
    theme: { accent: '#bd081c', rgb: '189, 8, 28', dark: '#8c0617', badge: 'Pinterest' }
  },
  {
    id: 'wechat',
    name: '微信公众号',
    host: 'mp.weixin.qq.com',
    defaultPrefix: 'wechat',
    theme: { accent: '#07c160', rgb: '7, 193, 96', dark: '#128c4a', badge: '微信' }
  },
  {
    id: '500px',
    name: '500px',
    host: '500px.com',
    defaultPrefix: '500px',
    theme: { accent: '#0099e5', rgb: '0, 153, 229', dark: '#087db8', badge: '500px' }
  },
  {
    id: 'duitang',
    name: '堆糖',
    host: 'duitang.com',
    defaultPrefix: 'duitang',
    theme: { accent: '#e86f8f', rgb: '232, 111, 143', dark: '#c65372', badge: '堆糖' }
  },
  {
    id: 'huaban',
    name: '花瓣',
    host: 'huaban.com',
    defaultPrefix: 'huaban',
    theme: { accent: '#c95f68', rgb: '201, 95, 104', dark: '#9e414d', badge: '花瓣' }
  }
];

const DEFAULT_SETTINGS = {
  showMiniPanel: true,
  miniPanelCollapsed: false,
  showHoverButtons: true,
  enableShortcuts: true,
  defaultDownloadMode: 'zip',
  shortcuts: {
    select: 'a',
    alternateSelect: 's',
    download: 'd',
    newBatch: 'n',
    clear: 'c',
    downloadLinks: '1',
    downloadDirect: '2',
    downloadZip: '3'
  },
  sites: Object.fromEntries(SITES.map((site) => [site.id, { enabled: true, prefix: site.defaultPrefix }]))
};
const HISTORY_KEY = 'downloadHistory';
const SHORTCUT_LABELS = {
  select: '选图',
  alternateSelect: '备用选图',
  download: '下载',
  newBatch: '新批次',
  clear: '清空',
  downloadLinks: '链接列表',
  downloadDirect: '逐张下载',
  downloadZip: 'ZIP 压缩包'
};
const DONATION_OPTIONS = {
  wechat: {
    label: '微信',
    detail: '用微信扫码支持作者。',
    src: '../assets/donate-wechat.png',
    missing: '未找到 donate-wechat.png'
  },
  alipay: {
    label: '支付宝',
    detail: '用支付宝扫码支持作者。',
    src: '../assets/donate-alipay.png',
    missing: '未找到 donate-alipay.png'
  },
  compute: {
    label: '银联赞赏',
    detail: '支持持续适配更多图片站点和下载场景。',
    src: '../assets/donate-compute.png',
    missing: '未找到 donate-compute.png'
  }
};

let settings = DEFAULT_SETTINGS;
let activeTab = null;
let currentStatus = null;
let lastSelectedCount = null;
let historyItems = [];
let historyFilter = 'all';
let activeModal = null;
const expandedSites = new Set();

document.addEventListener('DOMContentLoaded', init);

async function init() {
  settings = await loadSettings();
  activeTab = await getActiveTab();
  bindTabs();
  bindHistory();
  bindDonation();
  renderSettings();
  renderSites();
  await loadHistory();
  renderHistoryFilter();
  renderHistory();
  await refreshStatus();
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.target !== 'image-downloader-sidepanel' || message.type !== 'content-status') return;
    currentStatus = message.payload;
    updateHeader();
  });
  chrome.tabs.onActivated.addListener(() => {
    refreshStatus();
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (tabId === activeTab?.id && changeInfo.status === 'complete') {
      refreshStatus();
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) {
      settings = normalizeSettings(changes.settings.newValue);
      renderSettings();
      renderSites();
      refreshCurrentTabSettings();
    }
    if (area === 'local' && changes[HISTORY_KEY]) {
      historyItems = Array.isArray(changes[HISTORY_KEY].newValue) ? changes[HISTORY_KEY].newValue : [];
      renderHistoryFilter();
      renderHistory();
    }
  });
}

function bindDonation() {
  document.querySelectorAll('[data-donate]').forEach((button) => {
    button.addEventListener('click', () => showDonationModal(button.dataset.donate));
  });
}

function bindTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item === tab));
      document.querySelectorAll('.panel').forEach((panel) => panel.classList.remove('active'));
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });
}

function bindHistory() {
  document.getElementById('clear-history').addEventListener('click', async () => {
    historyItems = [];
    historyFilter = 'all';
    await chrome.storage.local.set({ [HISTORY_KEY]: [] }).catch(() => {});
    ImageCache?.clear?.().catch(() => {}); // free cached image bytes for cleared records
    renderHistoryFilter();
    renderHistory();
  });
}

function renderSettings() {
  bindCheckbox('show-mini-panel', 'showMiniPanel');
  bindCheckbox('mini-panel-collapsed', 'miniPanelCollapsed');
  bindCheckbox('show-hover-buttons', 'showHoverButtons');
  bindCheckbox('enable-shortcuts', 'enableShortcuts');
  renderShortcutSettings();
  const defaultMode = document.getElementById('default-download-mode');
  defaultMode.value = settings.defaultDownloadMode;
  defaultMode.onchange = () => saveSettings({ ...settings, defaultDownloadMode: defaultMode.value });
}

function bindCheckbox(id, key) {
  const input = document.getElementById(id);
  input.checked = settings[key] !== false;
  input.onchange = () => saveSettings({ ...settings, [key]: input.checked });
}

function renderShortcutSettings() {
  document.querySelectorAll('[data-shortcut-input]').forEach((input) => {
    const action = input.dataset.shortcutInput;
    input.value = shortcutLabel(action);
    input.onkeydown = (event) => {
      if (event.key === 'Tab' || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        saveShortcut(action, DEFAULT_SETTINGS.shortcuts[action]);
        return;
      }
      const key = normalizeShortcutKey(event.key);
      if (!key) return;
      event.preventDefault();
      saveShortcut(action, key);
    };
    input.oninput = () => saveShortcut(action, input.value);
    input.onblur = () => {
      input.value = shortcutLabel(action);
    };
  });
  const reset = document.getElementById('reset-shortcuts');
  if (reset) reset.onclick = resetShortcuts;
}

async function saveShortcut(action, value) {
  const key = normalizeShortcutKey(value);
  if (!key || !Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS.shortcuts, action)) {
    renderShortcutSettings();
    setStatus('快捷键只支持单个字母或数字');
    return;
  }
  const duplicate = Object.entries(settings.shortcuts || {}).find(([name, existing]) => {
    return name !== action && normalizeShortcutKey(existing) === key;
  });
  if (duplicate) {
    renderShortcutSettings();
    setStatus(`${formatShortcutKey(key)} 已用于${SHORTCUT_LABELS[duplicate[0]] || '其他操作'}`);
    return;
  }
  await saveSettings({
    ...settings,
    shortcuts: {
      ...settings.shortcuts,
      [action]: key
    }
  });
  renderShortcutSettings();
  setStatus(`快捷键已更新：${SHORTCUT_LABELS[action]} ${formatShortcutKey(key)}`);
}

async function resetShortcuts() {
  await saveSettings({
    ...settings,
    shortcuts: { ...DEFAULT_SETTINGS.shortcuts }
  });
  renderShortcutSettings();
  setStatus('快捷键已重置');
}

function shortcutLabel(action) {
  return formatShortcutKey(settings.shortcuts?.[action] || DEFAULT_SETTINGS.shortcuts[action]);
}

function formatShortcutKey(key) {
  return normalizeShortcutKey(key).toUpperCase();
}

function renderSites() {
  const list = document.getElementById('site-list');
  list.innerHTML = '';
  for (const site of SITES) {
    const siteSettings = settings.sites[site.id] || { enabled: true, prefix: site.defaultPrefix };
    const theme = siteTheme(site);
    const expanded = expandedSites.has(site.id);
    const settingsId = `site-settings-${site.id}`;
    const card = document.createElement('article');
    card.className = `site-card${expanded ? ' is-expanded' : ''}`;
    card.dataset.site = site.id;
    card.style.setProperty('--site-accent', theme.accent);
    card.style.setProperty('--site-rgb', theme.rgb);
    card.style.setProperty('--site-dark', theme.dark);
    card.innerHTML = `
      <div class="site-head">
        <button class="site-toggle" type="button" aria-expanded="${expanded ? 'true' : 'false'}" aria-controls="${escapeHtml(settingsId)}">
          <span>
            <span class="site-title"><span class="dot"></span>${escapeHtml(site.name)}<span class="site-badge">${escapeHtml(theme.badge)}</span></span>
            <small>${escapeHtml(site.host)}</small>
          </span>
          <span class="site-toggle-state">${expanded ? '收起设置' : '展开设置'}</span>
        </button>
        <label class="site-enable">
          <input type="checkbox" ${siteSettings.enabled !== false ? 'checked' : ''} aria-label="启用或停用 ${escapeHtml(site.name)}">
        </label>
      </div>
      <div class="site-settings" id="${escapeHtml(settingsId)}">
        <div class="site-settings-inner">
          <label class="prefix">
            <span>文件名前缀</span>
            <input type="text" value="${escapeHtml(siteSettings.prefix || site.defaultPrefix)}" aria-label="${escapeHtml(site.name)} 文件名前缀">
          </label>
        </div>
      </div>
    `;
    const toggle = card.querySelector('.site-toggle');
    const enabled = card.querySelector('input[type="checkbox"]');
    const prefix = card.querySelector('input[type="text"]');
    toggle.addEventListener('click', () => toggleSiteCard(card, site.id));
    enabled.addEventListener('change', () => updateSite(site.id, { enabled: enabled.checked }));
    prefix.addEventListener('change', () => updateSite(site.id, { prefix: prefix.value.trim() || site.defaultPrefix }));
    list.appendChild(card);
  }
}

function toggleSiteCard(card, siteId) {
  setSiteCardExpanded(card, siteId, !expandedSites.has(siteId));
}

function setSiteCardExpanded(card, siteId, expanded) {
  card.classList.toggle('is-expanded', expanded);
  if (expanded) {
    expandedSites.add(siteId);
  } else {
    expandedSites.delete(siteId);
  }
  const toggle = card.querySelector('.site-toggle');
  const label = card.querySelector('.site-toggle-state');
  if (toggle) toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  if (label) label.textContent = expanded ? '收起设置' : '展开设置';
}

function siteTheme(siteOrId) {
  const site = typeof siteOrId === 'string' ? SITES.find((item) => item.id === siteOrId) : siteOrId;
  return {
    accent: '#ff2442',
    rgb: '255, 36, 66',
    dark: '#d81e38',
    badge: site?.name || '站点',
    ...(site?.theme || {})
  };
}

async function updateSite(siteId, patch) {
  await saveSettings({
    ...settings,
    sites: {
      ...settings.sites,
      [siteId]: {
        ...settings.sites[siteId],
        ...patch
      }
    }
  });
}

async function refreshStatus() {
  activeTab = await getActiveTab();
  if (!activeTab?.id) {
    setUnsupported('未找到当前标签页。请先打开一个网页。');
    return;
  }

  const response = await sendToTab('status');
  if (!response?.ok) {
    setUnsupported('此页面不支持。请打开已启用的网站。');
    return;
  }
  currentStatus = response.result;
  updateHeader();
  setStatus(currentStatus.enabled ? '可以选择图片' : '此网站已停用。可在“站点”中开启。');
}

function updateHeader() {
  const current = document.getElementById('current-site');
  const count = document.getElementById('selected-count');
  if (!currentStatus?.supported) {
    applyCurrentTheme(null);
    if (current) current.textContent = '此页面不支持';
    if (count) {
      count.textContent = '0';
      count.hidden = true;
    }
    return;
  }
  applyCurrentTheme(currentStatus.site);
  if (current) current.textContent = currentStatus.enabled ? currentStatus.site.name : `${currentStatus.site.name} 已停用`;
  const nextCount = currentStatus.selectedCount || 0;
  if (count) {
    count.textContent = String(nextCount);
    count.hidden = nextCount === 0;
  }
  if (count && lastSelectedCount !== null && lastSelectedCount !== nextCount) {
    flash(count, 'is-pulsing');
  }
  lastSelectedCount = nextCount;
}

function applyCurrentTheme(siteInfo) {
  const theme = siteInfo?.theme || siteTheme(siteInfo?.id);
  document.documentElement.style.setProperty('--current-accent', theme.accent);
  document.documentElement.style.setProperty('--current-rgb', theme.rgb);
}

function setUnsupported(message) {
  currentStatus = null;
  const current = document.getElementById('current-site');
  if (current) current.textContent = message;
  const count = document.getElementById('selected-count');
  if (count) {
    count.textContent = '0';
    count.hidden = true;
  }
  setStatus(message);
}

async function loadHistory() {
  try {
    const stored = await chrome.storage.local.get(HISTORY_KEY);
    historyItems = Array.isArray(stored[HISTORY_KEY]) ? stored[HISTORY_KEY] : [];
  } catch (_) {
    historyItems = [];
  }
}

function renderHistoryFilter() {
  const filter = document.getElementById('history-filter');
  if (!filter) return;
  const counts = new Map();
  for (const item of historyItems) {
    const site = siteForHistory(item);
    if (!site) continue;
    counts.set(site.id, (counts.get(site.id) || 0) + 1);
  }
  const availableSites = SITES.filter((site) => counts.has(site.id));
  if (historyFilter !== 'all' && !counts.has(historyFilter)) historyFilter = 'all';
  const allCount = historyItems.length;
  filter.innerHTML = [
    historyFilterButton({ id: 'all', name: '全部', theme: { accent: '#2f2f2f', rgb: '47, 47, 47', dark: '#151515' } }, allCount),
    ...availableSites.map((site) => historyFilterButton(site, counts.get(site.id) || 0))
  ].join('');
  filter.querySelectorAll('[data-history-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      historyFilter = button.dataset.historyFilter;
      renderHistoryFilter();
      renderHistory();
    });
  });
}

function historyFilterButton(site, count) {
  const theme = siteTheme(site);
  const active = historyFilter === site.id;
  return `
    <button
      type="button"
      class="history-filter-chip${active ? ' active' : ''}"
      data-history-filter="${escapeHtml(site.id)}"
      style="--history-accent: ${escapeHtml(theme.accent)}; --history-rgb: ${escapeHtml(theme.rgb)}; --history-dark: ${escapeHtml(theme.dark)};"
    >
      <span>${escapeHtml(site.name)}</span>
      <em>${Number(count) || 0}</em>
    </button>
  `;
}

function filteredHistoryItems() {
  if (historyFilter === 'all') return historyItems;
  return historyItems.filter((item) => siteForHistory(item)?.id === historyFilter);
}

function renderHistory() {
  const list = document.getElementById('history-list');
  if (!list) return;
  const items = filteredHistoryItems();
  if (!items.length) {
    list.innerHTML = `<div class="empty-state">${historyItems.length ? '这个平台还没有历史记录' : '还没有历史记录'}</div>`;
    return;
  }
  list.innerHTML = items.map((item) => {
    const site = siteForHistory(item);
    const theme = siteTheme(site);
    return `
    <button type="button" class="history-item" data-history-id="${escapeHtml(item.id || '')}" style="--history-accent: ${escapeHtml(theme.accent)}; --history-rgb: ${escapeHtml(theme.rgb)}; --history-dark: ${escapeHtml(theme.dark)};">
      <div class="history-main">
        <span class="history-type">${escapeHtml(historyTypeLabel(item))}</span>
        <strong>${escapeHtml(item.siteName || '图片')}</strong>
        <small>${escapeHtml(formatHistoryMeta(item))}${historyEntries(item).length ? ` · ${historyEntries(item).length} 条链接` : ''}</small>
      </div>
      <div class="history-count">${Number(item.count) || 0}</div>
    </button>
  `;
  }).join('');
  list.querySelectorAll('[data-history-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = historyItems.find((historyItem) => String(historyItem.id || '') === button.dataset.historyId);
      if (item) showHistoryModal(item);
    });
  });
}

function showHistoryModal(item) {
  const site = siteForHistory(item);
  const theme = siteTheme(site);
  const entries = historyEntries(item);
  const modal = showPanelModal({
    eyebrow: site?.name || item.siteName || '历史记录',
    title: historyTypeLabel(item),
    description: `${Number(item.count) || entries.length || 0} 张 · ${formatHistoryMeta(item) || '刚刚'}`,
    body: `
      <div class="history-modal-shell" style="--history-accent: ${escapeHtml(theme.accent)}; --history-rgb: ${escapeHtml(theme.rgb)}; --history-dark: ${escapeHtml(theme.dark)};">
        <div class="history-modal-meta">
          <span>${escapeHtml(item.prefix || site?.defaultPrefix || 'images')}</span>
          <strong>${escapeHtml(item.siteName || site?.name || '图片')}</strong>
        </div>
        ${renderHistoryPreview(item)}
        <div class="history-download-actions">
          <button type="button" data-history-download="links" ${entries.length ? '' : 'disabled'}>链接文本</button>
          <button type="button" data-history-download="direct" ${entries.length ? '' : 'disabled'}>逐张下载</button>
          <button type="button" class="history-download-primary" data-history-download="zip" ${entries.length ? '' : 'disabled'}>重新打包</button>
        </div>
      </div>
    `
  });
  modal.querySelectorAll('[data-history-download]').forEach((button) => {
    button.addEventListener('click', () => downloadHistoryItem(item, button.dataset.historyDownload, button));
  });
  const grid = modal.querySelector('[data-history-grid]');
  if (grid) setupHistoryPreviewGrid(grid, entries);
}

function historyEntries(item) {
  const source = Array.isArray(item.entries)
    ? item.entries
    : Array.isArray(item.urls)
      ? item.urls.map((url, index) => ({ id: `url-${index}`, url }))
      : [];
  const seen = new Set();
  return source
    .map((entry, index) => ({
      id: String(entry?.id || `history-${index}`),
      url: String(entry?.url || entry || '').trim()
    }))
    .filter((entry) => {
      if (!/^https?:\/\//i.test(entry.url) || seen.has(entry.url)) return false;
      seen.add(entry.url);
      return true;
    });
}

function renderHistoryPreview(item) {
  const entries = historyEntries(item);
  if (!entries.length) {
    return '<div class="history-preview-empty">这条旧记录没有保存图片链接，无法预览或重新下载。</div>';
  }
  // Grid is filled progressively (see setupHistoryPreviewGrid) so large records
  // stay light: thumbnails load in batches as the user scrolls.
  return '<div class="history-preview" data-history-grid aria-label="历史图片预览"></div>';
}

function historyPreviewCard(entry, index) {
  // src is resolved later (resolveThumb): cached bytes first, network URL as fallback.
  return `
    <a class="history-preview-card" href="${escapeHtml(entry.url)}" target="_blank" rel="noreferrer" title="${escapeHtml(entry.url)}">
      <img data-url="${escapeHtml(entry.url)}" alt="历史图片 ${index + 1}" loading="lazy">
      <span>${String(index + 1).padStart(2, '0')}</span>
    </a>
  `;
}

async function resolveThumb(card, objectUrls) {
  const img = card.querySelector('img');
  if (!img) return;
  const url = img.dataset.url;
  let blob = null;
  try {
    blob = await ImageCache.getBlob(url);
  } catch (_) {
    blob = null;
  }
  if (blob) {
    const objectUrl = URL.createObjectURL(blob);
    objectUrls.push(objectUrl);
    img.src = objectUrl;
  } else {
    // No cached copy — fall back to the live link (DNR adds the Referer). May 404 if expired.
    img.src = url;
  }
}

function setupHistoryPreviewGrid(grid, entries) {
  const BATCH = 12;
  let rendered = 0;
  // Revoke object URLs when the modal closes to avoid leaking memory.
  const objectUrls = [];
  const modal = grid.closest('.panel-modal-backdrop');
  if (modal) modal._objectUrls = objectUrls;

  const appendBatch = () => {
    const slice = entries.slice(rendered, rendered + BATCH);
    const start = rendered;
    const wrap = document.createElement('div');
    wrap.innerHTML = slice.map((entry, offset) => historyPreviewCard(entry, start + offset)).join('');
    Array.from(wrap.children).forEach((card) => {
      const img = card.querySelector('img');
      if (img) {
        img.addEventListener('error', () => card.classList.add('is-broken'));
        img.addEventListener('load', () => card.classList.remove('is-broken'));
      }
      grid.appendChild(card);
      resolveThumb(card, objectUrls);
    });
    rendered += slice.length;
  };

  appendBatch();
  if (rendered >= entries.length) return;

  // A sentinel at the bottom of the scrollable grid pulls in the next batch.
  const sentinel = document.createElement('div');
  sentinel.className = 'history-preview-sentinel';
  grid.appendChild(sentinel);
  const observer = new IntersectionObserver((items) => {
    if (!items.some((entry) => entry.isIntersecting)) return;
    grid.removeChild(sentinel);
    appendBatch();
    if (rendered < entries.length) {
      grid.appendChild(sentinel);
    } else {
      observer.disconnect();
    }
  }, { root: grid, rootMargin: '150px' });
  observer.observe(sentinel);
}

async function downloadHistoryItem(item, mode, button) {
  const entries = historyEntries(item);
  if (!entries.length) {
    setStatus('这条历史没有可下载链接');
    return;
  }
  const site = siteForHistory(item);
  const label = button.textContent;
  button.disabled = true;
  button.textContent = '处理中';
  try {
    const response = await chrome.runtime.sendMessage({
      target: 'image-downloader-background',
      type: 'download',
      payload: {
        mode,
        prefix: item.prefix || site?.defaultPrefix || 'images',
        site: {
          id: site?.id || item.siteId || 'history',
          name: site?.name || item.siteName || '历史图片'
        },
        entries
      }
    });
    if (!response?.ok) throw new Error(response?.error || '下载失败');
    const result = response.result || {};
    setStatus(historyDownloadMessage(result));
  } catch (error) {
    setStatus(String(error?.message || error || '下载失败'));
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

function historyDownloadMessage(result) {
  const count = Number(result.count) || 0;
  const failed = Number(result.failed) || 0;
  if (result.mode === 'zip') return failed ? `历史 ZIP 已保存 ${count} 张，失败 ${failed} 张` : `历史 ZIP 已保存 ${count} 张`;
  if (result.mode === 'direct') return failed ? `历史图片已下载 ${count} 张，失败 ${failed} 张` : `历史图片已下载 ${count} 张`;
  return `历史链接已保存 ${count} 条`;
}

function siteForHistory(item) {
  return SITES.find((site) => (
    item.siteId === site.id ||
    item.site?.id === site.id ||
    item.siteName === site.name ||
    item.prefix === site.defaultPrefix
  )) || null;
}

function showDonationModal(type) {
  const option = DONATION_OPTIONS[type];
  if (!option) return;
  const modal = showPanelModal({
    eyebrow: '打赏作者',
    title: option.label,
    description: option.detail,
    body: `
      <figure class="panel-modal-qr">
        <div class="panel-modal-qr-frame">
          <img src="${escapeHtml(option.src)}" alt="${escapeHtml(option.label)}打赏二维码" width="260" height="260">
          <span class="panel-modal-qr-missing">${escapeHtml(option.missing)}</span>
        </div>
        <figcaption>请使用 ${escapeHtml(option.label)} 扫码</figcaption>
      </figure>
    `
  });
  const img = modal.querySelector('.panel-modal-qr img');
  img.addEventListener('error', () => img.classList.add('is-missing'));
  img.addEventListener('load', () => img.classList.remove('is-missing'));
}

function showPanelModal({ eyebrow = '', title, description = '', body = '' }) {
  closePanelModal();
  const modal = document.createElement('div');
  modal.className = 'panel-modal-backdrop';
  modal.innerHTML = `
    <section class="panel-modal" role="dialog" aria-modal="true" aria-labelledby="panel-modal-title">
      <button type="button" class="panel-modal-close" data-modal-close aria-label="关闭弹窗">×</button>
      <div class="panel-modal-copy">
        ${eyebrow ? `<span class="section-kicker panel-modal-kicker">${escapeHtml(eyebrow)}</span>` : ''}
        <h3 id="panel-modal-title">${escapeHtml(title)}</h3>
        ${description ? `<p>${escapeHtml(description)}</p>` : ''}
      </div>
      <div class="panel-modal-body">${body}</div>
      <div class="panel-modal-actions">
        <button type="button" class="panel-modal-secondary" data-modal-close>关闭</button>
      </div>
    </section>
  `;
  modal._restoreFocus = document.activeElement;
  document.body.appendChild(modal);
  activeModal = modal;

  const close = () => closePanelModal(modal);
  modal.querySelectorAll('[data-modal-close]').forEach((button) => button.addEventListener('click', close));
  modal.addEventListener('click', (event) => {
    if (event.target === modal) close();
  });
  const onKey = (event) => {
    if (event.key === 'Escape') close();
  };
  modal._onKey = onKey;
  document.addEventListener('keydown', onKey);
  window.setTimeout(() => {
    modal.classList.add('is-open');
    modal.querySelector('.panel-modal-close')?.focus();
  }, 0);
  return modal;
}

function closePanelModal(modal = activeModal) {
  if (!modal) return;
  if (modal._onKey) document.removeEventListener('keydown', modal._onKey);
  if (Array.isArray(modal._objectUrls)) {
    modal._objectUrls.forEach((url) => URL.revokeObjectURL(url));
    modal._objectUrls = [];
  }
  modal.classList.remove('is-open');
  if (activeModal === modal) activeModal = null;
  const restoreFocus = modal._restoreFocus;
  window.setTimeout(() => {
    modal.remove();
    if (restoreFocus && document.contains(restoreFocus)) {
      restoreFocus.focus?.();
    }
  }, 180);
}

function historyTypeLabel(item) {
  if (item.type === 'copy') return '复制';
  if (item.mode === 'zip') return 'ZIP';
  if (item.mode === 'direct') return '逐张';
  if (item.mode === 'links') return '链接';
  return '下载';
}

function formatHistoryMeta(item) {
  const failed = Number(item.failed) || 0;
  const time = item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }) : '';
  const suffix = failed ? `，失败 ${failed}` : '';
  return `${time}${suffix}`;
}

async function refreshCurrentTabSettings() {
  await sendToTab('refresh-settings');
  await refreshStatus();
}

async function sendToTab(type, payload = {}) {
  if (!activeTab?.id) return { ok: false, error: '未找到当前标签页。请先打开一个网页。' };
  try {
    return await chrome.tabs.sendMessage(activeTab.id, {
      target: 'image-downloader-content',
      type,
      payload
    });
  } catch (error) {
    const message = String(error?.message || error);
    if (/receiving end|Could not establish connection|No tab with id/i.test(message)) {
      return { ok: false, error: '此页面还不能使用。请刷新页面，或打开支持的网站。' };
    }
    return { ok: false, error: message || '操作失败，请重试。' };
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get('settings');
  return normalizeSettings(stored.settings);
}

async function saveSettings(next) {
  settings = normalizeSettings(next);
  await chrome.storage.sync.set({ settings });
  renderSites();
}

function normalizeSettings(value) {
  const source = value || {};
  const next = {
    ...DEFAULT_SETTINGS,
    ...source,
    shortcuts: normalizeShortcuts(source.shortcuts),
    sites: {
      ...DEFAULT_SETTINGS.sites,
      ...(source.sites || {})
    }
  };
  for (const site of SITES) {
    next.sites[site.id] = {
      enabled: true,
      prefix: site.defaultPrefix,
      ...(next.sites[site.id] || {})
    };
  }
  return next;
}

function normalizeShortcuts(value) {
  const shortcuts = { ...DEFAULT_SETTINGS.shortcuts };
  for (const action of Object.keys(shortcuts)) {
    const key = normalizeShortcutKey(value?.[action]);
    if (key) shortcuts[action] = key;
  }
  return shortcuts;
}

function normalizeShortcutKey(value) {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return '';
  return /^[a-z0-9]$/.test(key) ? key : '';
}

function setStatus(message) {
  const status = document.getElementById('status');
  status.textContent = message;
  flash(status, 'is-updated');
}

function flash(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  window.setTimeout(() => element.classList.remove(className), 180);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}
