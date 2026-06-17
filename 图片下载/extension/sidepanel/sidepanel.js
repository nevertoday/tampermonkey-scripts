const SITES = [
  {
    id: 'xiaohongshu',
    name: '小红书',
    host: 'xiaohongshu.com',
    defaultPrefix: 'xiaohongshu',
    pagePatterns: ['https://*.xiaohongshu.com/*', 'https://xiaohongshu.com/*'],
    permissionPatterns: ['https://*.xiaohongshu.com/*', 'https://xiaohongshu.com/*', 'https://*.xhscdn.com/*'],
    theme: { accent: '#ff2442', rgb: '255, 36, 66', dark: '#d81e38', badge: '小红书' }
  },
  {
    id: 'pinterest',
    name: 'Pinterest',
    host: 'pinterest.com',
    defaultPrefix: 'pinterest',
    pagePatterns: ['https://*.pinterest.com/*', 'https://pinterest.com/*'],
    permissionPatterns: ['https://*.pinterest.com/*', 'https://pinterest.com/*', 'https://*.pinimg.com/*'],
    theme: { accent: '#bd081c', rgb: '189, 8, 28', dark: '#8c0617', badge: 'Pinterest' }
  },
  {
    id: 'x',
    name: 'X',
    host: 'x.com',
    defaultPrefix: 'x',
    pagePatterns: ['https://*.x.com/*', 'https://x.com/*', 'https://*.twitter.com/*', 'https://twitter.com/*'],
    permissionPatterns: ['https://*.x.com/*', 'https://x.com/*', 'https://*.twitter.com/*', 'https://twitter.com/*', 'https://pbs.twimg.com/*'],
    theme: { accent: '#1d9bf0', rgb: '29, 155, 240', dark: '#0f6fad', badge: 'X' }
  },
  {
    id: 'wechat',
    name: '微信公众号',
    host: 'mp.weixin.qq.com',
    defaultPrefix: 'wechat',
    pagePatterns: ['https://mp.weixin.qq.com/*'],
    permissionPatterns: ['https://mp.weixin.qq.com/*', 'https://mmbiz.qpic.cn/*', 'https://mmbiz.qlogo.cn/*'],
    theme: { accent: '#07c160', rgb: '7, 193, 96', dark: '#128c4a', badge: '微信' }
  },
  {
    id: '500px',
    name: '500px',
    host: '500px.com',
    defaultPrefix: '500px',
    pagePatterns: ['https://*.500px.com/*', 'https://500px.com/*'],
    permissionPatterns: ['https://*.500px.com/*', 'https://500px.com/*', 'https://*.500px.org/*'],
    theme: { accent: '#0099e5', rgb: '0, 153, 229', dark: '#087db8', badge: '500px' }
  },
  {
    id: 'duitang',
    name: '堆糖',
    host: 'duitang.com',
    defaultPrefix: 'duitang',
    pagePatterns: ['https://*.duitang.com/*', 'https://duitang.com/*'],
    permissionPatterns: ['https://*.duitang.com/*', 'https://duitang.com/*', 'https://*.dtstatic.com/*'],
    theme: { accent: '#e86f8f', rgb: '232, 111, 143', dark: '#c65372', badge: '堆糖' }
  },
  {
    id: 'huaban',
    name: '花瓣',
    host: 'huaban.com',
    defaultPrefix: 'huaban',
    pagePatterns: ['https://*.huaban.com/*', 'https://huaban.com/*'],
    permissionPatterns: ['https://*.huaban.com/*', 'https://huaban.com/*'],
    theme: { accent: '#c95f68', rgb: '201, 95, 104', dark: '#9e414d', badge: '花瓣' }
  },
  {
    id: 'dribbble',
    name: 'Dribbble',
    host: 'dribbble.com',
    defaultPrefix: 'dribbble',
    pagePatterns: ['https://*.dribbble.com/*', 'https://dribbble.com/*'],
    permissionPatterns: ['https://*.dribbble.com/*', 'https://dribbble.com/*'],
    theme: { accent: '#ea4c89', rgb: '234, 76, 137', dark: '#c32361', badge: 'Dribbble' }
  },
  {
    id: 'instagram',
    name: 'Instagram',
    host: 'instagram.com',
    defaultPrefix: 'instagram',
    pagePatterns: ['https://*.instagram.com/*', 'https://instagram.com/*'],
    permissionPatterns: ['https://*.instagram.com/*', 'https://instagram.com/*', 'https://*.cdninstagram.com/*', 'https://*.fbcdn.net/*'],
    theme: {
      accent: '#d62976',
      rgb: '214, 41, 118',
      dark: '#a01e6b',
      badge: 'Instagram',
      gradient: 'linear-gradient(135deg, #feda75, #fa7e1e 28%, #d62976 56%, #962fbf 78%, #4f5bd5)'
    }
  },
  {
    id: 'behance',
    name: 'Behance',
    host: 'behance.net',
    defaultPrefix: 'behance',
    pagePatterns: ['https://*.behance.net/*', 'https://behance.net/*'],
    permissionPatterns: ['https://*.behance.net/*', 'https://behance.net/*'],
    theme: { accent: '#0057ff', rgb: '0, 87, 255', dark: '#0044cc', badge: 'Behance' }
  }
];

const DEFAULT_SETTINGS = {
  showMiniPanel: true,
  miniPanelCollapsed: false,
  showHoverButtons: true,
  enableShortcuts: true,
  language: 'zh',
  dockPosition: 'right',
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
const I18n = window.ImageDownloaderI18n;
const t = (key, vars) => I18n.t(key, vars);
// Maps each shortcut action to its i18n key so labels/messages localize.
const SHORTCUT_KEYS = {
  select: 'sc_select',
  alternateSelect: 'sc_alt',
  download: 'sc_download',
  newBatch: 'sc_newbatch',
  clear: 'sc_clear',
  downloadLinks: 'sc_links',
  downloadDirect: 'sc_direct',
  downloadZip: 'sc_zip'
};
const shortcutActionLabel = (action) => t(SHORTCUT_KEYS[action] || action);
const DONATION_OPTIONS = {
  wechat: { key: 'donate_wechat', src: '../assets/donate-wechat.png', missing: '未找到 donate-wechat.png' },
  alipay: { key: 'donate_alipay', src: '../assets/donate-alipay.png', missing: '未找到 donate-alipay.png' },
  compute: { key: 'donate_compute', src: '../assets/donate-compute.png', missing: '未找到 donate-compute.png' }
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
  I18n.setLang(settings.language);
  applyI18n();
  activeTab = await getActiveTab();
  bindTabs();
  bindHistory();
  bindDonation();
  bindLinkDownload();
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
      I18n.setLang(settings.language);
      applyI18n();
      renderSettings();
      renderSites();
      renderHistoryFilter();
      renderHistory();
      refreshCurrentTabSettings();
    }
    if (area === 'local' && changes[HISTORY_KEY]) {
      historyItems = Array.isArray(changes[HISTORY_KEY].newValue) ? changes[HISTORY_KEY].newValue : [];
      renderHistoryFilter();
      renderHistory();
    }
  });
}

// Walk the static markup and localize every tagged node. Re-run on language
// change; dynamic content (sites/history) is re-rendered separately.
function applyI18n() {
  document.documentElement.lang = I18n.lang === 'en' ? 'en' : 'zh-CN';
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    el.setAttribute('placeholder', t(el.dataset.i18nPh));
  });
}

// Localized display name/badge for a site by id, falling back to its stored
// (Chinese or brand) label when there's no translation.
function siteDisplayName(site) {
  return site ? I18n.siteName(site.id, site.name) : t('images_word');
}

function siteDisplayBadge(site, theme) {
  return I18n.siteBadge(site.id, theme?.badge || site?.name);
}

function bindDonation() {
  document.querySelectorAll('[data-donate]').forEach((button) => {
    button.addEventListener('click', () => showDonationModal(button.dataset.donate));
  });
}

function bindLinkDownload() {
  const input = document.getElementById('link-dl-input');
  const prefixInput = document.getElementById('link-dl-prefix');
  const countEl = document.getElementById('link-dl-count');
  if (!input || !prefixInput || !countEl) return;
  const actionButtons = document.querySelectorAll('[data-link-mode]');
  const refresh = () => {
    const count = parseLinks(input.value).length;
    countEl.textContent = t('link_count', { n: count });
    actionButtons.forEach((button) => { button.disabled = count === 0; });
  };
  input.addEventListener('input', refresh);
  actionButtons.forEach((button) => {
    button.addEventListener('click', () => {
      runLinkDownload(parseLinks(input.value), prefixInput.value.trim() || 'links', button.dataset.linkMode, button);
    });
  });
  refresh();
}

function parseLinks(text) {
  const seen = new Set();
  return String(text || '')
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter((item) => /^https?:\/\//i.test(item))
    .map((url) => url.split('#')[0])
    .filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .map((url, index) => ({ id: `link-${index}`, url }));
}

async function runLinkDownload(entries, prefix, mode, button) {
  if (!entries.length) {
    setStatus(t('no_valid_links'));
    return;
  }
  const label = button.textContent;
  button.disabled = true;
  button.textContent = t('processing');
  try {
    const response = await chrome.runtime.sendMessage({
      target: 'image-downloader-background',
      type: 'download',
      payload: {
        mode,
        prefix: prefix || 'links',
        site: { id: 'links', name: t('link_download') },
        entries
      }
    });
    if (!response?.ok) throw new Error(response?.error || t('download_failed'));
    setStatus(historyDownloadMessage(response.result || {}));
  } catch (error) {
    setStatus(String(error?.message || error || t('download_failed')));
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

function bindTabs() {
  const nav = document.querySelector('.tabs');
  const tabs = Array.from(document.querySelectorAll('.tab'));
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      const prev = tabs.findIndex((item) => item.classList.contains('active'));
      if (prev === index) return;
      tabs.forEach((item) => item.classList.toggle('active', item === tab));
      // Move the sliding pill to this tab and give the new panel a directional
      // slide-in: from the right when moving forward, from the left when back.
      nav.style.setProperty('--tab-index', String(index));
      const direction = index > prev ? 1 : -1;
      document.querySelectorAll('.panel').forEach((panel) => panel.classList.remove('active'));
      const panel = document.getElementById(`tab-${tab.dataset.tab}`);
      panel.style.setProperty('--enter-x', `${direction * 16}px`);
      panel.classList.add('active');
      onTabShown(tab.dataset.tab);
    });
  });
}

// The footer is a shared status/feedback line. Each tab carries its own resting
// hint so a stale page-status message (e.g. "此页面不支持") never lingers on a
// tab where it doesn't apply. Download results still overwrite it via setStatus.
function onTabShown(name) {
  if (name === 'sites') {
    refreshStatus();
    return;
  }
  if (name === 'links') {
    const input = document.getElementById('link-dl-input');
    const count = parseLinks(input?.value || '').length;
    setStatus(count ? t('link_count_pending', { n: count }) : t('links_empty_hint'));
    window.setTimeout(() => input?.focus(), 60);
    return;
  }
  if (name === 'history') {
    setStatus(historyItems.length ? t('history_hint') : t('history_empty'));
    return;
  }
  if (name === 'settings') {
    setStatus(t('status_settings'));
    refreshCacheUsage();
  }
}

function bindHistory() {
  document.getElementById('clear-history').addEventListener('click', async () => {
    historyItems = [];
    historyFilter = 'all';
    await chrome.storage.local.set({ [HISTORY_KEY]: [] }).catch(() => {});
    await ImageCache?.clear?.().catch(() => {}); // free cached image bytes for cleared records
    refreshCacheUsage();
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
  const language = document.getElementById('language-select');
  if (language) {
    language.value = I18n.lang;
    language.onchange = () => saveSettings({ ...settings, language: language.value });
  }
  const defaultMode = document.getElementById('default-download-mode');
  defaultMode.value = settings.defaultDownloadMode;
  defaultMode.onchange = () => saveSettings({ ...settings, defaultDownloadMode: defaultMode.value });
  const dockPosition = document.getElementById('dock-position');
  if (dockPosition) {
    dockPosition.value = settings.dockPosition || 'right';
    dockPosition.onchange = () => saveSettings({ ...settings, dockPosition: dockPosition.value });
  }
  bindCacheControls();
}

function bindCacheControls() {
  const clear = document.getElementById('clear-cache');
  if (clear && !clear.dataset.bound) {
    clear.dataset.bound = '1';
    clear.addEventListener('click', async () => {
      clear.disabled = true;
      await ImageCache?.clear?.().catch(() => {});
      await refreshCacheUsage();
      setStatus(t('cache_cleared'));
      clear.disabled = false;
    });
  }
  refreshCacheUsage();
}

async function refreshCacheUsage() {
  const el = document.getElementById('cache-usage');
  if (!el) return;
  let stats = { count: 0, bytes: 0 };
  try {
    stats = (await ImageCache?.stats?.()) || stats;
  } catch (_) { /* keep zero */ }
  el.textContent = stats.count
    ? t('cache_usage', { count: stats.count, size: formatBytes(stats.bytes) })
    : t('cache_empty');
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
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
    setStatus(t('sc_only_alnum'));
    return;
  }
  const duplicate = Object.entries(settings.shortcuts || {}).find(([name, existing]) => {
    return name !== action && normalizeShortcutKey(existing) === key;
  });
  if (duplicate) {
    renderShortcutSettings();
    setStatus(t('sc_in_use', { key: formatShortcutKey(key), action: shortcutActionLabel(duplicate[0]) || t('sc_other') }));
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
  setStatus(t('sc_updated', { action: shortcutActionLabel(action), key: formatShortcutKey(key) }));
}

async function resetShortcuts() {
  await saveSettings({
    ...settings,
    shortcuts: { ...DEFAULT_SETTINGS.shortcuts }
  });
  renderShortcutSettings();
  setStatus(t('sc_reset'));
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
    const isOff = siteSettings.enabled === false;
    const settingsId = `site-settings-${site.id}`;
    const card = document.createElement('article');
    card.className = `site-card${expanded ? ' is-expanded' : ''}${isOff ? ' is-off' : ''}`;
    card.dataset.site = site.id;
    card.style.setProperty('--site-accent', theme.accent);
    card.style.setProperty('--site-rgb', theme.rgb);
    card.style.setProperty('--site-dark', theme.dark);
    if (theme.gradient) card.style.setProperty('--site-gradient', theme.gradient);
    card.innerHTML = `
      <div class="site-head">
        <button class="site-toggle" type="button" aria-expanded="${expanded ? 'true' : 'false'}" aria-controls="${escapeHtml(settingsId)}">
          <span>
            <span class="site-title"><span class="dot"></span>${escapeHtml(siteDisplayName(site))}<span class="site-badge">${escapeHtml(siteDisplayBadge(site, theme))}</span></span>
            <small>${escapeHtml(site.host)}</small>
          </span>
          <span class="site-toggle-state">${expanded ? t('collapse_settings') : t('expand_settings')}</span>
        </button>
        <label class="site-enable">
          <input type="checkbox" ${siteSettings.enabled !== false ? 'checked' : ''} aria-label="${escapeHtml(siteDisplayName(site))}">
        </label>
      </div>
      <div class="site-settings" id="${escapeHtml(settingsId)}">
        <div class="site-settings-inner">
          <div class="site-permission-row">
            <span class="site-permission-state" data-site-permission-state>${t('permission_site_status_off')}</span>
            <button type="button" data-site-authorize="${escapeHtml(site.id)}">${t('permission_site_button')}</button>
          </div>
          <label class="prefix">
            <span>${t('filename_prefix')}</span>
            <input type="text" value="${escapeHtml(siteSettings.prefix || site.defaultPrefix)}" placeholder="${escapeHtml(site.defaultPrefix)}" aria-label="${escapeHtml(siteDisplayName(site))}">
          </label>
        </div>
      </div>
    `;
    const toggle = card.querySelector('.site-toggle');
    const enabled = card.querySelector('input[type="checkbox"]');
    const prefix = card.querySelector('input[type="text"]');
    const authorize = card.querySelector('[data-site-authorize]');
    toggle.addEventListener('click', () => toggleSiteCard(card, site.id));
    enabled.addEventListener('change', () => {
      card.classList.toggle('is-off', !enabled.checked);
      updateSite(site.id, { enabled: enabled.checked });
    });
    prefix.addEventListener('change', () => updateSite(site.id, { prefix: prefix.value.trim() || site.defaultPrefix }));
    authorize.addEventListener('click', () => grantSiteAccess(site, authorize));
    list.appendChild(card);
  }
  refreshSitePermissionBadges();
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
  if (label) label.textContent = expanded ? t('collapse_settings') : t('expand_settings');
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

async function refreshSitePermissionBadges() {
  await Promise.all(SITES.map(async (site) => {
    const card = document.querySelector(`[data-site="${cssEscape(site.id)}"]`);
    if (!card) return;
    const granted = await hasSiteAccess(site);
    card.classList.toggle('has-permission', granted);
    const state = card.querySelector('[data-site-permission-state]');
    const button = card.querySelector('[data-site-authorize]');
    if (state) state.textContent = granted ? t('permission_site_status_on') : t('permission_site_status_off');
    if (button) button.hidden = granted;
  }));
}

async function refreshStatus() {
  activeTab = await getActiveTab();
  if (!activeTab?.id) {
    setUnsupported(t('no_tab'));
    return;
  }

  const response = await sendToTab('status');
  if (!response?.ok) {
    const site = siteForUrl(activeTab.url || activeTab.pendingUrl || '');
    if (site) {
      const granted = await hasSiteAccess(site);
      if (granted && await injectCurrentTab(site)) {
        await refreshStatus();
        return;
      }
      setPermissionPrompt(site);
      setStatus(granted ? t('tab_not_ready') : '');
      return;
    }
    setUnsupported(t('unsupported_page'));
    return;
  }
  clearPermissionPrompt();
  currentStatus = response.result;
  updateHeader();
  setStatus(currentStatus.enabled ? t('status_can_select') : t('status_site_disabled'));
}

function siteForUrl(rawUrl) {
  if (!rawUrl) return null;
  let url;
  try {
    url = new URL(rawUrl);
  } catch (_) {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  return SITES.find((site) => siteMatchesHost(site, url.hostname)) || null;
}

function siteMatchesHost(site, hostname) {
  return (site.pagePatterns || []).some((pattern) => {
    const host = pattern.match(/^https:\/\/([^/]+)\//)?.[1] || '';
    if (host.startsWith('*.')) {
      const base = host.slice(2);
      return hostname === base || hostname.endsWith(`.${base}`);
    }
    return hostname === host;
  });
}

async function hasSiteAccess(site) {
  try {
    return await chrome.permissions.contains({ origins: site.permissionPatterns || [] });
  } catch (_) {
    return false;
  }
}

async function grantSiteAccess(site, button) {
  const label = button?.textContent || '';
  if (button) {
    button.disabled = true;
    button.textContent = t('processing');
  }
  try {
    const granted = await chrome.permissions.request({ origins: site.permissionPatterns || [] });
    if (!granted) {
      setStatus(t('permission_retry'));
      return false;
    }
    await injectCurrentTab(site);
    await refreshSitePermissionBadges();
    setStatus(t('permission_granted', { name: siteDisplayName(site) }));
    await refreshStatus();
    return true;
  } catch (_) {
    setStatus(t('permission_grant_failed'));
    return false;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = label || t('permission_site_button');
    }
  }
}

async function injectCurrentTab(site) {
  if (!activeTab?.id) return false;
  const tabSite = siteForUrl(activeTab.url || activeTab.pendingUrl || '');
  const currentSite = site || tabSite;
  if (site && tabSite?.id !== site.id) return false;
  if (!currentSite || !await hasSiteAccess(currentSite)) return false;
  try {
    await chrome.scripting.insertCSS({
      target: { tabId: activeTab.id },
      files: ['content/content.css']
    });
    await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ['lib/i18n.js', 'content/site-adapters.js', 'content/content.js']
    });
    return true;
  } catch (_) {
    return false;
  }
}

function setPermissionPrompt(site) {
  currentStatus = null;
  updateHeader();
  applyCurrentTheme(site);
  const prompt = document.getElementById('permission-prompt');
  if (!prompt) return;
  const theme = siteTheme(site);
  prompt.hidden = false;
  prompt.style.setProperty('--site-accent', theme.accent);
  prompt.style.setProperty('--site-rgb', theme.rgb);
  prompt.innerHTML = `
    <div>
      <strong>${escapeHtml(t('permission_needed_title'))}</strong>
      <p>${escapeHtml(t('permission_needed_desc', { name: siteDisplayName(site) }))}</p>
    </div>
    <button type="button" class="primary">${t('permission_button')}</button>
  `;
  prompt.querySelector('button').addEventListener('click', (event) => grantSiteAccess(site, event.currentTarget));
}

function clearPermissionPrompt() {
  const prompt = document.getElementById('permission-prompt');
  if (prompt) {
    prompt.hidden = true;
    prompt.innerHTML = '';
  }
}

function updateHeader() {
  const current = document.getElementById('current-site');
  const count = document.getElementById('selected-count');
  if (!currentStatus?.supported) {
    applyCurrentTheme(null);
    if (current) current.textContent = t('unsupported_short');
    if (count) {
      count.textContent = '0';
      count.hidden = true;
    }
    return;
  }
  applyCurrentTheme(currentStatus.site);
  if (current) current.textContent = currentStatus.enabled ? currentStatus.site.name : t('site_disabled_suffix', { name: currentStatus.site.name });
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
  // The site list already makes the next step obvious, so an "unsupported page"
  // footer is redundant — clear it (the footer hides itself when empty).
  setStatus('');
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
    historyFilterButton({ id: 'all', name: t('filter_all'), theme: { accent: '#2f2f2f', rgb: '47, 47, 47', dark: '#151515' } }, allCount),
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
  const label = site.id === 'all' ? site.name : siteDisplayName(site);
  return `
    <button
      type="button"
      class="history-filter-chip${active ? ' active' : ''}"
      data-history-filter="${escapeHtml(site.id)}"
      style="--history-accent: ${escapeHtml(theme.accent)}; --history-rgb: ${escapeHtml(theme.rgb)}; --history-dark: ${escapeHtml(theme.dark)};"
    >
      <span>${escapeHtml(label)}</span>
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
    list.innerHTML = `<div class="empty-state">${historyItems.length ? t('history_empty_filtered') : t('history_empty')}</div>`;
    return;
  }
  list.innerHTML = items.map((item) => {
    const site = siteForHistory(item);
    const theme = siteTheme(site);
    const entryCount = historyEntries(item).length;
    return `
    <button type="button" class="history-item" data-history-id="${escapeHtml(item.id || '')}" style="--history-accent: ${escapeHtml(theme.accent)}; --history-rgb: ${escapeHtml(theme.rgb)}; --history-dark: ${escapeHtml(theme.dark)};">
      <div class="history-main">
        <span class="history-type">${escapeHtml(historyTypeLabel(item))}</span>
        <strong>${escapeHtml(site ? siteDisplayName(site) : (item.siteName || t('images_word')))}</strong>
        <small>${escapeHtml(formatHistoryMeta(item))}${entryCount ? ` · ${t('n_links', { n: entryCount })}` : ''}</small>
      </div>
      <div class="history-count">${entryCount || Number(item.count) || 0}</div>
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
    eyebrow: site ? siteDisplayName(site) : (item.siteName || t('history_record')),
    title: historyTypeLabel(item),
    description: `${t('n_images', { n: entries.length || Number(item.count) || 0 })} · ${formatHistoryMeta(item) || t('just_now')}`,
    body: `
      <div class="history-modal-shell" style="--history-accent: ${escapeHtml(theme.accent)}; --history-rgb: ${escapeHtml(theme.rgb)}; --history-dark: ${escapeHtml(theme.dark)};">
        <div class="history-modal-meta">
          <span>${escapeHtml(item.prefix || site?.defaultPrefix || 'images')}</span>
          <strong>${escapeHtml(site ? siteDisplayName(site) : (item.siteName || t('images_word')))}</strong>
        </div>
        ${renderHistoryPreview(item)}
        <div class="history-download-actions">
          <button type="button" data-history-download="links" ${entries.length ? '' : 'disabled'}>${t('btn_links_text')}</button>
          <button type="button" data-history-download="direct" ${entries.length ? '' : 'disabled'}>${t('btn_direct')}</button>
          <button type="button" class="history-download-primary" data-history-download="zip" ${entries.length ? '' : 'disabled'}>${t('btn_repack')}</button>
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
    return `<div class="history-preview-empty">${escapeHtml(t('history_preview_empty'))}</div>`;
  }
  // Grid is filled progressively (see setupHistoryPreviewGrid) so large records
  // stay light: thumbnails load in batches as the user scrolls.
  return `<div class="history-preview" data-history-grid aria-label="${escapeHtml(t('preview_grid_label'))}"></div>`;
}

function historyPreviewCard(entry, index) {
  // src is resolved later (resolveThumb): cached bytes first, network URL as fallback.
  return `
    <a class="history-preview-card" href="${escapeHtml(entry.url)}" target="_blank" rel="noreferrer" title="${escapeHtml(entry.url)}">
      <img data-url="${escapeHtml(entry.url)}" alt="${escapeHtml(t('history_image'))} ${index + 1}" loading="lazy">
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
        img.addEventListener('load', () => {
          card.classList.remove('is-broken');
          card.classList.add('is-loaded');
        });
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
    setStatus(t('history_no_links'));
    return;
  }
  const site = siteForHistory(item);
  const label = button.textContent;
  button.disabled = true;
  button.textContent = t('processing');
  try {
    const response = await chrome.runtime.sendMessage({
      target: 'image-downloader-background',
      type: 'download',
      payload: {
        mode,
        prefix: item.prefix || site?.defaultPrefix || 'images',
        site: {
          id: site?.id || item.siteId || 'history',
          name: site ? siteDisplayName(site) : (item.siteName || t('history_image'))
        },
        entries
      }
    });
    if (!response?.ok) throw new Error(response?.error || t('download_failed'));
    const result = response.result || {};
    setStatus(historyDownloadMessage(result));
  } catch (error) {
    setStatus(String(error?.message || error || t('download_failed')));
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

function historyDownloadMessage(result) {
  const count = Number(result.count) || 0;
  const failed = Number(result.failed) || 0;
  if (result.mode === 'zip') return failed ? t('res_zip_failed', { count, failed }) : t('res_zip', { count });
  if (result.mode === 'direct') return failed ? t('res_direct_failed', { count, failed }) : t('res_direct', { count });
  return t('res_links', { count });
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
  const label = t(option.key);
  const modal = showPanelModal({
    eyebrow: t('support_title'),
    title: label,
    description: t('donate_detail', { label }),
    body: `
      <figure class="panel-modal-qr">
        <div class="panel-modal-qr-frame">
          <img src="${escapeHtml(option.src)}" alt="${escapeHtml(label)}" width="260" height="260">
          <span class="panel-modal-qr-missing">${escapeHtml(option.missing)}</span>
        </div>
        <figcaption>${escapeHtml(t('qr_caption', { label }))}</figcaption>
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
      <button type="button" class="panel-modal-close" data-modal-close aria-label="${escapeHtml(t('close_dialog'))}">×</button>
      <div class="panel-modal-copy">
        ${eyebrow ? `<span class="section-kicker panel-modal-kicker">${escapeHtml(eyebrow)}</span>` : ''}
        <h3 id="panel-modal-title">${escapeHtml(title)}</h3>
        ${description ? `<p>${escapeHtml(description)}</p>` : ''}
      </div>
      <div class="panel-modal-body">${body}</div>
      <div class="panel-modal-actions">
        <button type="button" class="panel-modal-secondary" data-modal-close>${escapeHtml(t('close'))}</button>
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
  if (item.type === 'copy') return t('type_copy');
  if (item.mode === 'zip') return t('type_zip');
  if (item.mode === 'direct') return t('type_direct');
  if (item.mode === 'links') return t('type_links');
  return t('type_download');
}

function formatHistoryMeta(item) {
  const failed = Number(item.failed) || 0;
  const time = item.createdAt ? new Date(item.createdAt).toLocaleString(I18n.lang === 'en' ? 'en-US' : 'zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }) : '';
  const suffix = failed ? t('failed_suffix', { failed }) : '';
  return `${time}${suffix}`;
}

async function refreshCurrentTabSettings() {
  await sendToTab('refresh-settings');
  await refreshStatus();
}

async function sendToTab(type, payload = {}) {
  if (!activeTab?.id) return { ok: false, error: t('no_tab') };
  try {
    return await chrome.tabs.sendMessage(activeTab.id, {
      target: 'image-downloader-content',
      type,
      payload
    });
  } catch (error) {
    const message = String(error?.message || error);
    if (/receiving end|Could not establish connection|No tab with id/i.test(message)) {
      return { ok: false, error: t('tab_not_ready') };
    }
    return { ok: false, error: message || t('op_failed') };
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
    language: source.language === 'en' ? 'en' : 'zh',
    dockPosition: source.dockPosition === 'left' ? 'left' : 'right',
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
  if (!status) return;
  status.textContent = message || '';
  status.hidden = !message;
  if (message) flash(status, 'is-updated');
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

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
