(async function () {
  'use strict';

  const TRANSIENT_DOWNLOAD_PREFIX = 'idx-transient-download:';
  const params = new URLSearchParams(location.search);
  const token = params.get('token') || '';
  const filename = sanitizeFilename(params.get('filename') || 'images');
  const key = `${TRANSIENT_DOWNLOAD_PREFIX}${token}`;

  try {
    if (!token) throw new Error('Missing download token');
    const blob = await ImageCache.getBlob(key);
    if (!blob) throw new Error('Download payload expired');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    window.setTimeout(async () => {
      URL.revokeObjectURL(url);
      await ImageCache.remove(key);
      closeTab();
    }, 1000);
  } catch (error) {
    document.body.textContent = String(error?.message || error || 'Download failed');
    window.setTimeout(closeTab, 3000);
  }

  function closeTab() {
    try {
      chrome.tabs.getCurrent((tab) => {
        if (!tab?.id) {
          window.close();
          return;
        }
        const result = chrome.tabs.remove(tab.id);
        if (result?.catch) result.catch(() => window.close());
      });
    } catch (_) {
      window.close();
    }
  }

  function sanitizeFilename(value) {
    return String(value).trim().replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || 'images';
  }
})();
