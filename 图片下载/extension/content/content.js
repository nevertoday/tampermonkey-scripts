(function () {
  'use strict';

  const bridge = window.ImageDownloaderAdapters;
  const adapter = bridge?.currentAdapter();
  const allAdapters = bridge?.adapters || [];
  const DEFAULT_SETTINGS = {
    showMiniPanel: true,
    showHoverButtons: true,
    enableShortcuts: true,
    defaultDownloadMode: 'zip',
    sites: Object.fromEntries(allAdapters.map((site) => [site.id, { enabled: true, prefix: site.defaultPrefix }]))
  };

  if (!adapter) return;

  const state = {
    settings: DEFAULT_SETTINGS,
    selected: new Map(),
    enabled: true,
    busy: false,
    raf: 0,
    mouseX: -1,
    mouseY: -1,
    observer: null
  };

  init();

  async function init() {
    state.settings = await loadSettings();
    state.enabled = siteSettings().enabled !== false;
    await loadSelected();
    applyTheme();
    document.documentElement.classList.toggle('idx-hover-enabled', state.settings.showHoverButtons !== false);
    setupMessages();
    setupStorageListener();
    setupEvents();
    syncRuntime();
    if (state.enabled) enable();
  }

  function enable() {
    createMiniPanel();
    scheduleScan();
    setTimeout(scheduleScan, 800);
    setTimeout(scheduleScan, 2200);
    state.observer = new MutationObserver(scheduleScan);
    state.observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  function disable() {
    state.observer?.disconnect();
    state.observer = null;
    document.querySelectorAll('.idx-select-btn').forEach((button) => button.remove());
    document.querySelectorAll('.idx-image-host').forEach((host) => host.classList.remove('idx-image-host', 'idx-selected'));
    document.getElementById('idx-mini-panel')?.remove();
  }

  function setupEvents() {
    document.addEventListener('pointermove', (event) => {
      state.mouseX = event.clientX;
      state.mouseY = event.clientY;
    }, { passive: true, capture: true });

    document.addEventListener('keydown', (event) => {
      if (!state.enabled || state.settings.enableShortcuts === false) return;
      const target = event.target;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const key = String(event.key || '').toLowerCase();
      if (key === 's') {
        const img = imageAtPointer();
        if (img) {
          event.preventDefault();
          toggleImage(img);
        }
      } else if (key === 'a') {
        event.preventDefault();
        selectVisible();
      } else if (key === 'd') {
        event.preventDefault();
        downloadSelected();
      } else if (key === 'c') {
        event.preventDefault();
        clearSelected();
      }
    }, true);

    window.addEventListener('scroll', scheduleScan, { passive: true });
    window.addEventListener('resize', scheduleScan, { passive: true });
    window.addEventListener('popstate', () => setTimeout(scheduleScan, 250));
    window.setInterval(() => {
      scheduleScan();
      updateMiniPanel();
    }, 3000);
  }

  function setupMessages() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || message.target !== 'image-downloader-content') return false;
      handleCommand(message.type, message.payload || {})
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
      return true;
    });
  }

  async function handleCommand(type, payload) {
    if (type === 'status') return status();
    if (!state.enabled && type !== 'refresh-settings') throw new Error('此网站已停用。请在侧边栏开启。');
    if (type === 'select-visible') return selectVisible();
    if (type === 'clear') return clearSelected();
    if (type === 'links') return { links: selectedEntries().map((entry) => entry.url) };
    if (type === 'download') return downloadSelected(payload.mode);
    if (type === 'refresh-settings') {
      state.settings = await loadSettings();
      await applySettingsChange();
      return status();
    }
    throw new Error(`无法执行此操作：${type}`);
  }

  function setupStorageListener() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !changes.settings) return;
      state.settings = normalizeSettings(changes.settings.newValue);
      applySettingsChange();
    });
  }

  async function applySettingsChange() {
    const wasEnabled = state.enabled;
    state.enabled = siteSettings().enabled !== false;
    document.documentElement.classList.toggle('idx-hover-enabled', state.settings.showHoverButtons !== false);
    if (state.enabled && !wasEnabled) enable();
    if (!state.enabled && wasEnabled) disable();
    updateMiniPanel();
    scheduleScan();
  }

  function scheduleScan() {
    if (!state.enabled || state.raf) return;
    state.raf = requestAnimationFrame(() => {
      state.raf = 0;
      scan();
    });
  }

  function scan() {
    const images = adapter.images(document);
    for (const img of images) {
      const rect = img.getBoundingClientRect();
      if (rect.bottom < -600 || rect.top > window.innerHeight + 600) continue;
      setupImage(img);
    }
    refreshSelectionUI();
    updateMiniPanel();
  }

  function setupImage(img) {
    const info = imageInfo(img);
    if (!info) return;
    const host = adapter.hostFor(img) || img.parentElement;
    if (!host) return;
    host.classList.add('idx-image-host');
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const existing = Array.from(host.children).find((child) => child.classList?.contains('idx-select-btn') && child._idxImage === img);
    if (existing) return;
    if (host.querySelector(':scope > .idx-select-btn')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'idx-select-btn';
    button.title = '选择这张图片';
    button._idxImage = img;
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleImage(img);
    }, true);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
    }, true);
    host.appendChild(button);
    refreshImage(img, host, button);
  }

  function toggleImage(img) {
    const info = imageInfo(img);
    if (!info) return;
    if (isSelected(info)) {
      deleteSelected(info);
    } else {
      state.selected.set(info.id, info.url);
    }
    saveSelected();
    refreshSelectionUI();
    updateMiniPanel();
    pulseMiniCount();
    syncRuntime();
  }

  function selectVisible() {
    let added = 0;
    for (const img of adapter.images(document)) {
      const rect = img.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) continue;
      setupImage(img);
      const info = imageInfo(img);
      if (!info || isSelected(info)) continue;
      state.selected.set(info.id, info.url);
      added += 1;
    }
    saveSelected();
    refreshSelectionUI();
    updateMiniPanel();
    pulseMiniCount();
    syncRuntime();
    toast(`已选择 ${added} 张当前屏幕图片`);
    return status({ added });
  }

  function clearSelected() {
    const count = state.selected.size;
    state.selected.clear();
    saveSelected();
    refreshSelectionUI();
    updateMiniPanel();
    pulseMiniCount();
    syncRuntime();
    toast('已清空选择');
    return status({ cleared: count });
  }

  async function downloadSelected(mode = state.settings.defaultDownloadMode) {
    if (!state.selected.size) throw new Error('还没有选择图片。请先在页面上选择图片。');
    if (state.busy) throw new Error('正在下载，请稍后再试。');
    state.busy = true;
    updateMiniPanel();
    const response = await chrome.runtime.sendMessage({
      target: 'image-downloader-background',
      type: 'download',
      payload: {
        mode,
        prefix: siteSettings().prefix || adapter.defaultPrefix,
        entries: selectedEntries()
      }
    });
    state.busy = false;
    updateMiniPanel();
    if (!response?.ok) {
      toast(response?.error || '下载失败，请重试');
      throw new Error(response?.error || '下载失败，请重试');
    }
    const result = response.result || {};
    toast(result.failed ? `已下载 ${result.count} 张，${result.failed} 张失败` : '下载完成');
    if (result.count) await clearSelected();
    return status({ download: result });
  }

  function createMiniPanel() {
    if (document.getElementById('idx-mini-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'idx-mini-panel';
    panel.innerHTML = `
      <div class="idx-count">0</div>
      <button type="button" data-action="select">选择当前屏幕</button>
      <button type="button" data-action="clear">清空</button>
      <button type="button" class="idx-primary" data-action="download">下载</button>
    `;
    panel.querySelector('[data-action="select"]').addEventListener('click', selectVisible);
    panel.querySelector('[data-action="clear"]').addEventListener('click', clearSelected);
    panel.querySelector('[data-action="download"]').addEventListener('click', () => downloadSelected());
    document.body.appendChild(panel);
    updateMiniPanel();
  }

  function updateMiniPanel() {
    const panel = document.getElementById('idx-mini-panel');
    if (!panel) return;
    panel.hidden = state.settings.showMiniPanel === false || !state.enabled;
    panel.querySelector('.idx-count').textContent = String(state.selected.size);
    panel.querySelector('[data-action="clear"]').disabled = state.selected.size === 0 || state.busy;
    panel.querySelector('[data-action="download"]').disabled = state.selected.size === 0 || state.busy;
  }

  function pulseMiniCount() {
    const count = document.querySelector('#idx-mini-panel .idx-count');
    if (!count) return;
    count.classList.remove('idx-pulse');
    void count.offsetWidth;
    count.classList.add('idx-pulse');
    window.setTimeout(() => count.classList.remove('idx-pulse'), 180);
  }

  function refreshSelectionUI() {
    document.querySelectorAll('.idx-select-btn').forEach((button) => {
      const img = button._idxImage;
      if (!img) return;
      refreshImage(img, button.parentElement, button);
    });
  }

  function refreshImage(img, host, button) {
    const info = imageInfo(img);
    if (!info || !host || !button) return;
    const selected = isSelected(info);
    button.classList.toggle('idx-active', selected);
    host.classList.toggle('idx-selected', selected);
  }

  function imageInfo(img) {
    const url = adapter.url(img);
    if (!url) return null;
    return { id: adapter.key(img, url), url };
  }

  function isSelected(info) {
    if (state.selected.has(info.id)) return true;
    for (const url of state.selected.values()) {
      if (url === info.url) return true;
    }
    return false;
  }

  function deleteSelected(info) {
    if (state.selected.delete(info.id)) return;
    for (const [key, url] of state.selected.entries()) {
      if (url === info.url) {
        state.selected.delete(key);
        return;
      }
    }
  }

  function imageAtPointer() {
    if (state.mouseX < 0 || state.mouseY < 0) return null;
    for (const el of document.elementsFromPoint(state.mouseX, state.mouseY)) {
      if (el._idxImage) return el._idxImage;
      if (el.tagName === 'IMG' && adapter.images({ querySelectorAll: () => [el] }).includes(el)) return el;
      const host = el.closest?.('.idx-image-host');
      const img = host?.querySelector?.('img');
      if (img && imageInfo(img)) return img;
    }
    return null;
  }

  async function loadSettings() {
    const stored = await chrome.storage.sync.get('settings');
    return normalizeSettings(stored.settings);
  }

  function normalizeSettings(settings) {
    const merged = {
      ...DEFAULT_SETTINGS,
      ...(settings || {}),
      sites: {
        ...DEFAULT_SETTINGS.sites,
        ...((settings || {}).sites || {})
      }
    };
    for (const site of allAdapters) {
      merged.sites[site.id] = {
        enabled: true,
        prefix: site.defaultPrefix,
        ...(merged.sites[site.id] || {})
      };
    }
    return merged;
  }

  function siteSettings() {
    return state.settings.sites[adapter.id] || { enabled: true, prefix: adapter.defaultPrefix };
  }

  async function loadSelected() {
    const key = selectedKey();
    const stored = await chrome.storage.local.get(key);
    state.selected = new Map(Array.isArray(stored[key]) ? stored[key] : []);
  }

  function saveSelected() {
    chrome.storage.local.set({ [selectedKey()]: Array.from(state.selected.entries()) });
  }

  function selectedKey() {
    return `selected.${adapter.id}`;
  }

  function selectedEntries() {
    return Array.from(state.selected.entries()).map(([id, url]) => ({ id, url }));
  }

  function status(extra = {}) {
    return {
      supported: true,
      enabled: state.enabled,
      busy: state.busy,
      site: {
        id: adapter.id,
        name: adapter.name,
        prefix: siteSettings().prefix || adapter.defaultPrefix
      },
      selectedCount: state.selected.size,
      visibleCount: state.enabled ? adapter.images(document).length : 0,
      ...extra
    };
  }

  function syncRuntime() {
    chrome.runtime.sendMessage({
      target: 'image-downloader-sidepanel',
      type: 'content-status',
      payload: status()
    }).catch(() => {});
  }

  function applyTheme() {
    document.documentElement.style.setProperty('--idx-black', '#111111');
  }

  let toastTimer = 0;
  function toast(message) {
    let el = document.querySelector('.idx-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'idx-toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('idx-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('idx-show'), 2400);
  }
})();
