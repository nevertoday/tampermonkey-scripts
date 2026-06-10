const SITES = [
  { id: 'xiaohongshu', name: '小红书', host: 'xiaohongshu.com', defaultPrefix: 'xiaohongshu' },
  { id: 'pinterest', name: 'Pinterest', host: 'pinterest.com', defaultPrefix: 'pinterest' },
  { id: 'wechat', name: '微信公众号', host: 'mp.weixin.qq.com', defaultPrefix: 'wechat' },
  { id: '500px', name: '500px', host: '500px.com', defaultPrefix: '500px' },
  { id: 'duitang', name: '堆糖', host: 'duitang.com', defaultPrefix: 'duitang' }
];

const DEFAULT_SETTINGS = {
  showMiniPanel: true,
  showHoverButtons: true,
  enableShortcuts: true,
  defaultDownloadMode: 'zip',
  sites: Object.fromEntries(SITES.map((site) => [site.id, { enabled: true, prefix: site.defaultPrefix }]))
};

let settings = DEFAULT_SETTINGS;
let activeTab = null;
let currentStatus = null;
let lastSelectedCount = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  settings = await loadSettings();
  activeTab = await getActiveTab();
  bindTabs();
  bindCommands();
  bindDonationImages();
  renderSettings();
  renderSites();
  await refreshStatus();
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.target !== 'image-downloader-sidepanel' || message.type !== 'content-status') return;
    currentStatus = message.payload;
    updateHeader();
    setCommandEnabled(Boolean(currentStatus?.enabled));
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
  });
}

function bindDonationImages() {
  document.querySelectorAll('.support-qr img').forEach((img) => {
    img.addEventListener('error', () => {
      img.classList.add('is-missing');
    });
    img.addEventListener('load', () => {
      img.classList.remove('is-missing');
    });
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

function bindCommands() {
  document.querySelector('[data-command="select-visible"]').addEventListener('click', () => runCommand('select-visible'));
  document.querySelector('[data-command="clear"]').addEventListener('click', () => runCommand('clear'));
  document.querySelector('[data-command="copy-links"]').addEventListener('click', copyLinks);
  document.querySelector('[data-command="download"]').addEventListener('click', () => {
    runCommand('download', { mode: document.getElementById('download-mode').value });
  });
}

function renderSettings() {
  bindCheckbox('show-mini-panel', 'showMiniPanel');
  bindCheckbox('show-hover-buttons', 'showHoverButtons');
  bindCheckbox('enable-shortcuts', 'enableShortcuts');
  const defaultMode = document.getElementById('default-download-mode');
  defaultMode.value = settings.defaultDownloadMode;
  defaultMode.onchange = () => saveSettings({ ...settings, defaultDownloadMode: defaultMode.value });
  document.getElementById('download-mode').value = settings.defaultDownloadMode;
}

function bindCheckbox(id, key) {
  const input = document.getElementById(id);
  input.checked = settings[key] !== false;
  input.onchange = () => saveSettings({ ...settings, [key]: input.checked });
}

function renderSites() {
  const list = document.getElementById('site-list');
  list.innerHTML = '';
  for (const site of SITES) {
    const siteSettings = settings.sites[site.id] || { enabled: true, prefix: site.defaultPrefix };
    const card = document.createElement('article');
    card.className = 'site-card';
    card.innerHTML = `
      <div class="site-head">
        <div>
          <div class="site-title"><span class="dot"></span>${escapeHtml(site.name)}</div>
          <small>${escapeHtml(site.host)}</small>
        </div>
        <input type="checkbox" ${siteSettings.enabled !== false ? 'checked' : ''} aria-label="启用或停用 ${escapeHtml(site.name)}">
      </div>
      <label class="prefix">
        <span>文件名前缀</span>
        <input type="text" value="${escapeHtml(siteSettings.prefix || site.defaultPrefix)}" aria-label="${escapeHtml(site.name)} 文件名前缀">
      </label>
    `;
    const enabled = card.querySelector('input[type="checkbox"]');
    const prefix = card.querySelector('input[type="text"]');
    enabled.addEventListener('change', () => updateSite(site.id, { enabled: enabled.checked }));
    prefix.addEventListener('change', () => updateSite(site.id, { prefix: prefix.value.trim() || site.defaultPrefix }));
    list.appendChild(card);
  }
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
  setCommandEnabled(currentStatus.enabled);
  setStatus(currentStatus.enabled ? '可以选择图片' : '此网站已停用。可在“站点”中开启。');
}

function updateHeader() {
  const current = document.getElementById('current-site');
  const count = document.getElementById('selected-count');
  if (!currentStatus?.supported) {
    current.textContent = '此页面不支持';
    count.textContent = '0';
    return;
  }
  current.textContent = currentStatus.enabled ? currentStatus.site.name : `${currentStatus.site.name} 已停用`;
  const nextCount = currentStatus.selectedCount || 0;
  count.textContent = String(nextCount);
  count.style.background = '#111111';
  if (lastSelectedCount !== null && lastSelectedCount !== nextCount) {
    flash(count, 'is-pulsing');
  }
  lastSelectedCount = nextCount;
}

function setUnsupported(message) {
  currentStatus = null;
  document.getElementById('current-site').textContent = message;
  document.getElementById('selected-count').textContent = '0';
  setCommandEnabled(false);
  setStatus(message);
}

function setCommandEnabled(enabled) {
  document.querySelectorAll('[data-command]').forEach((button) => {
    button.disabled = !enabled;
  });
}

async function runCommand(type, payload = {}) {
  setStatus('正在处理...');
  const response = await sendToTab(type, payload);
  if (!response?.ok) {
    setStatus(response?.error || '操作失败，请重试。');
    return;
  }
  currentStatus = response.result?.site ? response.result : currentStatus;
  await refreshStatus();
}

async function copyLinks() {
  const response = await sendToTab('links');
  if (!response?.ok) {
    setStatus(response?.error || '未能复制链接，请重试。');
    return;
  }
  const links = response.result.links || [];
  if (!links.length) {
    setStatus('还没有选择图片。请先在页面上选择图片。');
    return;
  }
  await navigator.clipboard.writeText(links.join('\n'));
  setStatus(`已复制 ${links.length} 个图片链接`);
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
  const next = {
    ...DEFAULT_SETTINGS,
    ...(value || {}),
    sites: {
      ...DEFAULT_SETTINGS.sites,
      ...((value || {}).sites || {})
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
