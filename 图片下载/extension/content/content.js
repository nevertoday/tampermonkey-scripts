(function () {
  'use strict';

  const bridge = window.ImageDownloaderAdapters;
  const adapter = bridge?.currentAdapter();
  const allAdapters = bridge?.adapters || [];
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
    sites: Object.fromEntries(allAdapters.map((site) => [site.id, { enabled: true, prefix: site.defaultPrefix }]))
  };
  const HISTORY_KEY = 'downloadHistory';
  const HISTORY_LIMIT = 50;
  const DOWNLOAD_MODES = [
    { mode: 'links', shortcut: 'downloadLinks', title: '链接列表', detail: '保存全部原图 URL 到 .txt' },
    { mode: 'direct', shortcut: 'downloadDirect', title: '逐张下载', detail: '直接保存到本地' },
    { mode: 'zip', shortcut: 'downloadZip', title: 'ZIP 压缩包', detail: '抓取图片打包下载' }
  ];

  if (!adapter) return;

  const state = {
    settings: DEFAULT_SETTINGS,
    selected: new Map(),
    enabled: true,
    busy: false,
    downloadProgress: null,
    raf: 0,
    mouseX: -1,
    mouseY: -1,
    observer: null,
    heartbeat: 0,
    floatingRaf: 0,
    dead: false
  };

  function extensionAlive() {
    try {
      return Boolean(chrome.runtime?.id);
    } catch (_) {
      return false;
    }
  }

  function teardown() {
    if (state.dead) return;
    state.dead = true;
    if (state.heartbeat) {
      clearInterval(state.heartbeat);
      state.heartbeat = 0;
    }
    if (state.raf) {
      cancelAnimationFrame(state.raf);
      clearTimeout(state.raf);
      state.raf = 0;
    }
    if (state.floatingRaf) {
      cancelAnimationFrame(state.floatingRaf);
      state.floatingRaf = 0;
    }
    state.observer?.disconnect();
    state.observer = null;
    document.querySelectorAll('.idx-select-btn').forEach((button) => button.remove());
    document.getElementById('idx-mini-panel')?.remove();
  }

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
      scheduleFloatingHover();
    }, { passive: true, capture: true });

    document.addEventListener('keydown', (event) => {
      if (!state.enabled || state.settings.enableShortcuts === false) return;
      const target = event.target;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (document.querySelector('.idx-modal-bg')) return;
      const key = normalizeShortcutKey(event.key);
      if (!key) return;
      if (event.repeat && shortcutValues().includes(key)) return;
      if (shortcutMatches('select', key)) {
        event.preventDefault();
        selectPointedImage();
      } else if (shortcutMatches('alternateSelect', key)) {
        event.preventDefault();
        selectPointedImage();
      } else if (shortcutMatches('download', key)) {
        event.preventDefault();
        showDownloadModal(false);
      } else if (shortcutMatches('newBatch', key)) {
        event.preventDefault();
        showPrefixModal(() => showDownloadModal(true));
      } else if (shortcutMatches('clear', key)) {
        event.preventDefault();
        clearSelected();
      }
    }, true);

    window.addEventListener('scroll', scheduleScan, { passive: true });
    window.addEventListener('resize', scheduleScan, { passive: true });
    window.addEventListener('popstate', () => setTimeout(scheduleScan, 250));
    state.heartbeat = window.setInterval(() => {
      if (!extensionAlive()) {
        teardown();
        return;
      }
      scheduleScan();
      updateMiniPanel();
    }, 3000);
  }

  function setupMessages() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || message.target !== 'image-downloader-content') return false;
      if (message.type === 'download-progress') {
        applyDownloadProgress(message.payload || {});
        sendResponse({ ok: true, result: status() });
        return false;
      }
      handleCommand(message.type, message.payload || {})
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
      return true;
    });
  }

  async function handleCommand(type, payload) {
    if (type === 'status') return status();
    if (!state.enabled && type !== 'refresh-settings') throw new Error('此网站已停用。请在侧边栏开启。');
    if (type === 'select-visible') return selectPointedImage();
    if (type === 'clear') return clearSelected();
    if (type === 'links') return { links: selectedEntries().map((entry) => entry.url) };
    if (type === 'download') return downloadSelected(payload.mode);
    if (type === 'refresh-settings') {
      state.settings = await loadSettings();
      await applySettingsChange();
      return status();
    }
    if (type === 'toggle-mini-panel') {
      await setMiniPanelCollapsed(Boolean(payload.collapsed));
      return status();
    }
    throw new Error(`无法执行此操作：${type}`);
  }

  function setupStorageListener() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.settings) {
        state.settings = normalizeSettings(changes.settings.newValue);
        applySettingsChange();
        return;
      }
      if (area === 'local' && changes[selectedKey()]) {
        applyExternalSelection(changes[selectedKey()].newValue);
      }
    });
  }

  // Selection is shared per site (key `selected.<siteId>`), so every tab on the
  // same site must reflect the same set. When another tab edits the selection,
  // re-sync this tab's in-memory map and UI instead of keeping a stale, diverging count.
  function applyExternalSelection(entries) {
    const incoming = new Map(Array.isArray(entries) ? entries : []);
    if (sameSelection(incoming, state.selected)) return;
    state.selected = incoming;
    refreshSelectionUI();
    updateMiniPanel();
    pulseMiniCount();
    syncRuntime();
  }

  function sameSelection(a, b) {
    if (a.size !== b.size) return false;
    for (const [key, url] of a) {
      if (b.get(key) !== url) return false;
    }
    return true;
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
    if (state.dead || !state.enabled || state.raf) return;
    const run = () => {
      state.raf = 0;
      scan();
    };
    state.raf = document.hidden ? setTimeout(run, 80) : requestAnimationFrame(run);
  }

  function scan() {
    const images = adapter.images(document);
    for (const img of images) {
      const rect = img.getBoundingClientRect();
      if (rect.bottom < -600 || rect.top > window.innerHeight + 600) continue;
      setupImage(img);
    }
    cleanupFloatingButtons(images);
    refreshSelectionUI();
    refreshFloatingHover();
    updateMiniPanel();
  }

  function setupImage(img) {
    const info = imageInfo(img);
    if (!info) return false;
    if (adapter.usesFloatingControls?.(img)) return setupFloatingImage(img);
    const host = adapter.hostFor(img) || img.parentElement;
    if (!host) return false;
    host.classList.add('idx-image-host');
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const existing = Array.from(host.children).find((child) => child.classList?.contains('idx-select-btn') && child._idxImage === img);
    if (existing) return true;
    if (host.querySelector(':scope > .idx-select-btn')) return false;

    const button = createSelectButton(img);
    host.appendChild(button);
    refreshImage(img, host, button);
    return true;
  }

  function setupFloatingImage(img) {
    let button = Array.from(document.querySelectorAll('.idx-floating-select-btn')).find((item) => item._idxImage === img);
    if (!button) {
      button = createSelectButton(img);
      button.classList.add('idx-floating-select-btn');
      document.body.appendChild(button);
    }
    positionFloatingButton(button, img);
    refreshImage(img, null, button);
    return true;
  }

  function createSelectButton(img) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'idx-select-btn';
    button.title = '选择这张图片';
    button._idxImage = img;
    const blockHostEvent = (event) => {
      event.stopPropagation();
    };
    button.addEventListener('pointerdown', blockHostEvent, true);
    button.addEventListener('mousedown', blockHostEvent, true);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleImage(img);
    }, true);
    return button;
  }

  function positionFloatingButton(button, img) {
    const rect = img.getBoundingClientRect();
    const hidden = rect.width < 4 || rect.height < 4 || rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth;
    button.classList.toggle('idx-floating-hidden', hidden);
    if (hidden) {
      button.classList.remove('idx-floating-visible');
      return;
    }
    const offset = adapter.floatingControlOffset?.(img, rect) || { x: 8, y: rect.height > 96 ? 56 : 8 };
    button.style.setProperty('left', `${Math.max(8, Math.round(rect.left + offset.x))}px`, 'important');
    button.style.setProperty('top', `${Math.max(8, Math.round(rect.top + offset.y))}px`, 'important');
  }

  function scheduleFloatingHover() {
    if (state.dead || state.floatingRaf) return;
    state.floatingRaf = requestAnimationFrame(() => {
      state.floatingRaf = 0;
      refreshFloatingHover();
    });
  }

  // Show the "+" for ONLY the image actually under the cursor (topmost), not every
  // image whose rect happens to contain the pointer — otherwise overlapping pins on
  // the feed make hovering one image light up another. Selected buttons stay visible
  // via the .idx-active CSS rule regardless of hover.
  function refreshFloatingHover() {
    const buttons = document.querySelectorAll('.idx-floating-select-btn');
    if (!buttons.length) return;
    const target = state.settings.showHoverButtons === false ? null : floatingButtonAtPointer();
    buttons.forEach((button) => {
      button.classList.toggle('idx-floating-visible', button === target && !button.classList.contains('idx-floating-hidden'));
    });
  }

  function floatingButtonAtPointer() {
    if (state.mouseX < 0 || state.mouseY < 0) return null;
    const els = document.elementsFromPoint(state.mouseX, state.mouseY);
    for (const el of els) {
      if (el.classList?.contains('idx-floating-select-btn')) return el;
      if (el.tagName === 'IMG') {
        const button = floatingButtonForImage(el);
        if (button) return button;
      }
    }
    return null;
  }

  function floatingButtonForImage(img) {
    for (const button of document.querySelectorAll('.idx-floating-select-btn')) {
      if (button._idxImage === img) return button;
    }
    return null;
  }

  function cleanupFloatingButtons(images) {
    const live = new Set(images);
    document.querySelectorAll('.idx-floating-select-btn').forEach((button) => {
      if (!button._idxImage || !live.has(button._idxImage) || !document.contains(button._idxImage)) button.remove();
    });
  }

  function toggleImage(img) {
    const info = imageInfo(img);
    if (!info) return null;
    const wasSelected = isSelected(info);
    if (wasSelected) {
      deleteSelected(info);
    } else {
      state.selected.set(info.id, info.url);
    }
    saveSelected();
    refreshSelectionUI();
    updateMiniPanel();
    pulseMiniCount();
    syncRuntime();
    return wasSelected ? 'removed' : 'added';
  }

  function selectPointedImage() {
    const img = imageAtPointer();
    if (!img) {
      toast('请把鼠标移到图片上');
      return status({ added: 0 });
    }
    if (!setupImage(img)) {
      toast('当前图片不可选择');
      return status({ added: 0 });
    }
    const result = toggleImage(img);
    if (result === 'added') {
      toast('已选择 1 张图片');
      return status({ added: 1 });
    }
    if (result === 'removed') {
      toast('已取消选择');
      return status({ removed: 1 });
    }
    toast('当前图片不可选择');
    return status({ added: 0 });
  }

  function clearSelected(options = {}) {
    const count = state.selected.size;
    state.selected.clear();
    saveSelected();
    refreshSelectionUI();
    updateMiniPanel();
    pulseMiniCount();
    syncRuntime();
    if (!options.silent) toast('已清空选择');
    return status({ cleared: count });
  }

  async function downloadSelected(mode = state.settings.defaultDownloadMode) {
    if (!state.selected.size) throw new Error('还没有选择图片。请先在页面上选择图片。');
    if (state.busy) throw new Error('正在下载，请稍后再试。');
    state.busy = true;
    state.downloadProgress = {
      mode,
      phase: mode === 'zip' ? 'fetching' : 'active',
      done: 0,
      total: state.selected.size
    };
    announceDownloadPhase(state.downloadProgress.phase, mode);
    updateMiniPanel();
    let response;
    try {
      response = await chrome.runtime.sendMessage({
        target: 'image-downloader-background',
        type: 'download',
        payload: {
          mode,
          prefix: siteSettings().prefix || adapter.defaultPrefix,
          site: { id: adapter.id, name: adapter.name },
          entries: selectedEntries()
        }
      });
    } finally {
      state.busy = false;
      state.downloadProgress = null;
      updateMiniPanel();
    }
    if (!response?.ok) {
      toast(response?.error || '下载失败，请重试');
      throw new Error(response?.error || '下载失败，请重试');
    }
    const result = response.result || {};
    if (result.count) await clearSelected({ silent: true });
    toast(downloadResultMessage(result));
    return status({ download: result });
  }

  function applyDownloadProgress(payload) {
    const total = Math.max(0, Number(payload.total) || 0);
    const done = Math.min(total, Math.max(0, Number(payload.done) || 0));
    const prevPhase = state.downloadProgress?.phase;
    const mode = payload.mode || state.downloadProgress?.mode || state.settings.defaultDownloadMode;
    const phase = normalizeDownloadPhase(payload.phase);
    state.downloadProgress = { mode, phase, done, total };
    if (phase !== prevPhase) announceDownloadPhase(phase, mode);
    updateMiniPanel();
    pulseMiniCount();
  }

  function announceDownloadPhase(phase, mode) {
    const message = downloadPhaseMessage(phase, mode);
    if (message) toast(message);
  }

  function downloadPhaseMessage(phase, mode) {
    if (mode === 'zip') {
      if (phase === 'fetching') return '正在抓取图片，请稍候…';
      if (phase === 'packing') return '图片抓取完成，正在打包 ZIP…';
      if (phase === 'saving') return '打包完成，正在保存到下载…';
    }
    if (mode === 'direct' && phase === 'active') return '正在逐张下载，请稍候…';
    return '';
  }

  function normalizeDownloadPhase(phase) {
    return ['fetching', 'packing', 'saving', 'done', 'active'].includes(phase) ? phase : 'active';
  }

  function downloadResultMessage(result) {
    const count = Number(result.count) || 0;
    const failed = Number(result.failed) || 0;
    if (result.mode === 'zip') {
      return failed ? `ZIP 已保存 ${count} 张，失败 ${failed} 张` : `ZIP 已保存 ${count} 张`;
    }
    if (result.mode === 'direct') {
      return failed ? `已下载 ${count} 张，失败 ${failed} 张` : `已下载 ${count} 张`;
    }
    if (result.mode === 'links') return `链接已保存 ${count} 条`;
    return failed ? `已处理 ${count} 张，失败 ${failed} 张` : `已处理 ${count} 张`;
  }

  function createMiniPanel() {
    if (document.getElementById('idx-mini-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'idx-mini-panel';
    panel.dataset.site = adapter.id;
    panel.innerHTML = `
      <div class="idx-site-pill">${escapeHtml(siteTheme().badge || adapter.name)}</div>
      <div class="idx-count">0</div>
      <div class="idx-status" role="status" aria-live="polite"></div>
      <div class="idx-actions">
        <button type="button" class="idx-secondary" data-action="select">选图<kbd data-shortcut="select">A</kbd></button>
        <button type="button" data-action="clear">清空</button>
        <button type="button" data-action="links">链接</button>
        <button type="button" data-action="prefix">前缀</button>
        <button type="button" class="idx-primary" data-action="download">下载<kbd data-shortcut="download">D</kbd></button>
        <button type="button" class="idx-dark" data-action="new-batch">新批次<kbd data-shortcut="newBatch">N</kbd></button>
      </div>
      <button type="button" class="idx-fold" data-action="fold" aria-label="收起网页快捷栏" aria-expanded="true" title="收起">
        <span class="idx-fold-icon">›</span>
        <span class="idx-fold-label">收起</span>
      </button>
    `;
    panel.addEventListener('click', (event) => {
      if (state.settings.miniPanelCollapsed !== true || event.target.closest('button')) return;
      toggleMiniPanelCollapsed();
    });
    panel.addEventListener('keydown', (event) => {
      if (state.settings.miniPanelCollapsed !== true || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      toggleMiniPanelCollapsed();
    });
    panel.querySelector('[data-action="select"]').addEventListener('click', selectPointedImage);
    panel.querySelector('[data-action="clear"]').addEventListener('click', clearSelected);
    panel.querySelector('[data-action="links"]').addEventListener('click', copySelectedLinks);
    panel.querySelector('[data-action="prefix"]').addEventListener('click', () => showPrefixModal());
    panel.querySelector('[data-action="download"]').addEventListener('click', () => showDownloadModal(false));
    panel.querySelector('[data-action="new-batch"]').addEventListener('click', () => showPrefixModal(() => showDownloadModal(true)));
    panel.querySelector('[data-action="fold"]').addEventListener('click', toggleMiniPanelCollapsed);
    document.body.appendChild(panel);
    updateShortcutHints();
    updateMiniPanel();
  }

  function updateMiniPanel() {
    const panel = document.getElementById('idx-mini-panel');
    if (!panel) {
      if (state.settings.showMiniPanel !== false && state.enabled && document.body) createMiniPanel();
      return;
    }
    panel.hidden = state.settings.showMiniPanel === false || !state.enabled;
    const collapsed = state.settings.miniPanelCollapsed === true;
    panel.classList.toggle('idx-collapsed', collapsed);
    panel.classList.toggle('idx-busy', state.busy);
    panel.dataset.site = adapter.id;
    panel.setAttribute('role', collapsed ? 'button' : 'toolbar');
    panel.setAttribute('aria-label', collapsed ? `已选择 ${state.selected.size} 张图片，点击展开网页快捷栏` : '网页图片选择快捷栏');
    panel.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    panel.tabIndex = collapsed ? 0 : -1;
    panel.querySelector('.idx-site-pill').textContent = siteTheme().badge || adapter.name;
    const count = panel.querySelector('.idx-count');
    count.textContent = miniPanelCountText();
    count.dataset.progressLabel = miniPanelProgressLabel();
    count.title = miniPanelProgressTitle();
    const status = panel.querySelector('.idx-status');
    if (status) status.textContent = miniPanelStatusText();
    panel.dataset.progressPhase = state.busy && state.downloadProgress ? state.downloadProgress.phase : '';
    panel.style.setProperty('--idx-progress', `${miniPanelProgressDegrees()}deg`);
    updateShortcutHints();
    panel.querySelector('[data-action="clear"]').disabled = state.selected.size === 0 || state.busy;
    panel.querySelector('[data-action="download"]').disabled = state.selected.size === 0 || state.busy;
    panel.querySelector('[data-action="new-batch"]').disabled = state.selected.size === 0 || state.busy;
    const fold = panel.querySelector('[data-action="fold"]');
    if (fold) {
      fold.title = collapsed ? '展开' : '收起';
      fold.setAttribute('aria-label', collapsed ? '展开网页快捷栏' : '收起网页快捷栏');
      fold.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      const label = fold.querySelector('.idx-fold-label');
      if (label) label.textContent = collapsed ? '展开' : '收起';
    }
  }

  function miniPanelCountText() {
    if (!state.busy || !state.downloadProgress) return String(state.selected.size);
    // Show one monotonic overall percentage instead of a per-phase count that resets.
    return `${Math.round(overallProgressFraction() * 100)}%`;
  }

  function miniPanelProgressLabel() {
    if (!state.busy || !state.downloadProgress) return '';
    if (state.downloadProgress.phase === 'fetching') return '抓取';
    if (state.downloadProgress.phase === 'packing') return '打包';
    if (state.downloadProgress.phase === 'saving') return '保存';
    if (state.downloadProgress.mode === 'direct') return '下载';
    return '处理';
  }

  // Human-readable line shown next to the ring while downloading, so users know
  // which step is running instead of watching an unlabeled ring loop.
  function miniPanelStatusText() {
    if (!state.busy || !state.downloadProgress) return '';
    const p = state.downloadProgress;
    if (p.phase === 'fetching') return `正在抓取图片 ${p.done}/${p.total}`;
    if (p.phase === 'packing') return '正在打包 ZIP…';
    if (p.phase === 'saving') return '正在保存文件…';
    if (p.phase === 'done') return '即将完成…';
    if (p.mode === 'direct') return `正在逐张下载 ${p.done}/${p.total}`;
    return '正在处理…';
  }

  function miniPanelProgressTitle() {
    if (!state.busy || !state.downloadProgress) return `${state.selected.size} 张已选图片`;
    return miniPanelStatusText();
  }

  // Map the multi-phase ZIP flow onto a single 0→100% sweep so the ring fills once
  // (fetch 0-70%, pack 70-90%, save 90-100%) instead of looping per phase.
  function overallProgressFraction() {
    const p = state.downloadProgress;
    if (!p) return 0;
    const ratio = p.total ? Math.min(1, p.done / p.total) : 0;
    if (p.phase === 'done') return 1;
    if (p.mode === 'zip') {
      if (p.phase === 'packing') return 0.7 + ratio * 0.2;
      if (p.phase === 'saving') return 0.9 + ratio * 0.1;
      return ratio * 0.7; // fetching
    }
    return ratio;
  }

  function miniPanelProgressDegrees() {
    if (!state.busy || !state.downloadProgress) return 0;
    return Math.round(overallProgressFraction() * 360);
  }

  async function toggleMiniPanelCollapsed() {
    await setMiniPanelCollapsed(state.settings.miniPanelCollapsed !== true);
  }

  async function setMiniPanelCollapsed(collapsed) {
    state.settings = {
      ...state.settings,
      miniPanelCollapsed: collapsed
    };
    await chrome.storage.sync.set({ settings: state.settings });
    updateMiniPanel();
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
      if (button.classList.contains('idx-floating-select-btn')) {
        positionFloatingButton(button, img);
        refreshImage(img, null, button);
      } else {
        refreshImage(img, button.parentElement, button);
      }
    });
  }

  function refreshImage(img, host, button) {
    const info = imageInfo(img);
    if (!info || !button) return;
    const selected = isSelected(info);
    button.classList.toggle('idx-active', selected);
    if (host) host.classList.toggle('idx-selected', selected);
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
    return imageContainingPoint(state.mouseX, state.mouseY);
  }

  function showDownloadModal(isNewBatch) {
    if (!state.selected.size || state.busy) return;
    const modal = showModal(`
      <h3>下载方式</h3>
      <p>共 ${state.selected.size} 张图片</p>
      <div class="idx-dl-list">
        ${DOWNLOAD_MODES.map((item) => downloadModeButton(item)).join('')}
      </div>
    `);
    updateShortcutHints(modal);
    const runDownloadMode = (mode) => {
      closeModal(modal);
      downloadSelected(mode, isNewBatch);
    };
    modal._idxKeydown = (event) => {
      const mode = downloadModeForShortcut(event.key);
      if (!mode) return false;
      event.preventDefault();
      runDownloadMode(mode);
      return true;
    };
    modal.querySelectorAll('[data-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        runDownloadMode(button.dataset.mode);
      });
    });
  }

  function downloadModeButton(item) {
    return `
      <button type="button" class="idx-dl-item" data-mode="${escapeHtml(item.mode)}">
        <span class="idx-dl-title">
          <span>${escapeHtml(item.title)}</span>
          <kbd data-shortcut="${escapeHtml(item.shortcut)}">${escapeHtml(shortcutLabel(item.shortcut))}</kbd>
        </span>
        <small>${escapeHtml(item.detail)}</small>
      </button>
    `;
  }

  function downloadModeForShortcut(key) {
    const shortcut = normalizeShortcutKey(key);
    const item = DOWNLOAD_MODES.find((mode) => shortcutMatches(mode.shortcut, shortcut));
    return item?.mode || '';
  }

  function showPrefixModal(callback) {
    const currentPrefix = siteSettings().prefix || adapter.defaultPrefix;
    const modal = showModal(`
      <h3>下载前缀</h3>
      <p>文件名使用此前缀区分不同站点和批次</p>
      <input id="idx-prefix-input" value="${escapeHtml(currentPrefix)}">
    `);
    const input = modal.querySelector('#idx-prefix-input');
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'idx-modal-ok';
    ok.textContent = '确认';
    ok.addEventListener('click', async () => {
      const nextPrefix = input.value.trim() || adapter.defaultPrefix;
      await saveSitePrefix(nextPrefix);
      closeModal(modal);
      toast('前缀已更新');
      if (callback) callback();
    });
    modal.querySelector('.idx-modal-foot').appendChild(ok);
    input.focus();
    input.select();
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') ok.click();
    });
  }

  async function saveSitePrefix(prefix) {
    state.settings = normalizeSettings({
      ...state.settings,
      sites: {
        ...state.settings.sites,
        [adapter.id]: {
          ...siteSettings(),
          prefix
        }
      }
    });
    await chrome.storage.sync.set({ settings: state.settings });
    syncRuntime();
  }

  async function copySelectedLinks() {
    const links = selectedEntries().map((entry) => entry.url);
    if (!links.length) {
      toast('还没有选择图片');
      return;
    }
    const body = links.join('\n');
    try {
      await navigator.clipboard.writeText(body);
      const entries = selectedEntries();
      await addHistory({
        type: 'copy',
        siteId: adapter.id,
        siteName: adapter.name,
        prefix: siteSettings().prefix || adapter.defaultPrefix,
        mode: 'links',
        count: links.length,
        failed: 0,
        entries
      });
      requestCacheEntries(entries); // silently keep bytes so copied links survive expiry
      toast(`已复制 ${links.length} 个链接`);
    } catch (_) {
      showLinksModal(body);
    }
  }

  function showLinksModal(body) {
    const modal = showModal(`
      <h3>图片链接</h3>
      <p>复制下面的链接，或保存为链接文本</p>
      <textarea readonly>${escapeHtml(body)}</textarea>
    `);
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'idx-modal-ok';
    copy.textContent = '复制';
    copy.addEventListener('click', async () => {
      await navigator.clipboard.writeText(body).catch(() => {});
      closeModal(modal);
      toast('链接已复制');
    });
    modal.querySelector('.idx-modal-foot').appendChild(copy);
    const textarea = modal.querySelector('textarea');
    textarea.focus();
    textarea.select();
  }

  function showModal(html) {
    const modal = document.createElement('div');
    modal.className = 'idx-modal-bg';
    modal.innerHTML = `
      <div class="idx-modal-card">
        ${html}
        <div class="idx-modal-foot">
          <button type="button" class="idx-modal-cancel">取消</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const close = () => closeModal(modal);
    modal.querySelector('.idx-modal-cancel').addEventListener('click', close);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) close();
    });
    const onKey = (event) => {
      if (modal._idxKeydown?.(event)) return;
      if (event.key === 'Escape') close();
    };
    modal._idxOnKey = onKey;
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => modal.classList.add('idx-show'));
    return modal;
  }

  function closeModal(modal) {
    if (!modal) return;
    if (modal._idxOnKey) document.removeEventListener('keydown', modal._idxOnKey);
    modal.classList.remove('idx-show');
    window.setTimeout(() => modal.remove(), 180);
  }

  async function addHistory(item) {
    try {
      const stored = await chrome.storage.local.get(HISTORY_KEY);
      const history = Array.isArray(stored[HISTORY_KEY]) ? stored[HISTORY_KEY] : [];
      history.unshift({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        createdAt: Date.now(),
        ...item
      });
      await chrome.storage.local.set({ [HISTORY_KEY]: history.slice(0, HISTORY_LIMIT) });
    } catch (_) {}
  }

  function requestCacheEntries(entries) {
    if (!entries?.length || !extensionAlive()) return;
    try {
      chrome.runtime.sendMessage({
        target: 'image-downloader-background',
        type: 'cache-entries',
        payload: { entries }
      }).catch(() => {});
    } catch (_) {
      // best-effort
    }
  }

  function imageContainingPoint(x, y) {
    for (const img of adapter.images(document)) {
      const rect = img.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return img;
      }
    }
    return null;
  }

  function shortcutKey(action) {
    return normalizeShortcutKey(state.settings.shortcuts?.[action] || DEFAULT_SETTINGS.shortcuts[action]);
  }

  function shortcutValues() {
    return Object.keys(DEFAULT_SETTINGS.shortcuts)
      .map((action) => shortcutKey(action))
      .filter(Boolean);
  }

  function shortcutMatches(action, key) {
    return normalizeShortcutKey(key) === shortcutKey(action);
  }

  function updateShortcutHints(root = document.getElementById('idx-mini-panel')) {
    if (!root) return;
    root.querySelectorAll('[data-shortcut]').forEach((hint) => {
      hint.textContent = shortcutLabel(hint.dataset.shortcut);
    });
  }

  function shortcutLabel(action) {
    const key = shortcutKey(action);
    return key ? key.toUpperCase() : '';
  }

  async function loadSettings() {
    const stored = await chrome.storage.sync.get('settings');
    return normalizeSettings(stored.settings);
  }

  function normalizeSettings(settings) {
    const source = settings || {};
    const merged = {
      ...DEFAULT_SETTINGS,
      ...source,
      shortcuts: normalizeShortcuts(source.shortcuts),
      sites: {
        ...DEFAULT_SETTINGS.sites,
        ...(source.sites || {})
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

  function siteSettings() {
    return state.settings.sites[adapter.id] || { enabled: true, prefix: adapter.defaultPrefix };
  }

  async function loadSelected() {
    const key = selectedKey();
    const stored = await chrome.storage.local.get(key);
    state.selected = new Map(Array.isArray(stored[key]) ? stored[key] : []);
  }

  function saveSelected() {
    if (!extensionAlive()) {
      teardown();
      return;
    }
    try {
      chrome.storage.local.set({ [selectedKey()]: Array.from(state.selected.entries()) });
    } catch (_) {
      teardown();
    }
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
        prefix: siteSettings().prefix || adapter.defaultPrefix,
        theme: siteTheme()
      },
      selectedCount: state.selected.size,
      visibleCount: state.enabled ? adapter.images(document).length : 0,
      miniPanelCollapsed: state.settings.miniPanelCollapsed === true,
      ...extra
    };
  }

  function syncRuntime() {
    if (!extensionAlive()) {
      teardown();
      return;
    }
    try {
      chrome.runtime.sendMessage({
        target: 'image-downloader-sidepanel',
        type: 'content-status',
        payload: status()
      }).catch(() => {});
    } catch (_) {
      teardown();
    }
  }

  function applyTheme() {
    const theme = siteTheme();
    document.documentElement.dataset.idxSite = adapter.id;
    document.documentElement.style.setProperty('--idx-accent', theme.accent);
    document.documentElement.style.setProperty('--idx-accent-rgb', theme.rgb);
    document.documentElement.style.setProperty('--idx-accent-dark', theme.dark);
  }

  function siteTheme() {
    return {
      accent: '#ff2442',
      rgb: '255, 36, 66',
      dark: '#d81e38',
      badge: adapter.name,
      ...(adapter.theme || {})
    };
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

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
  }
})();
