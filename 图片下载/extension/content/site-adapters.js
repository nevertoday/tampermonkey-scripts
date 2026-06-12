(function () {
  'use strict';

  const adapters = [
    {
      id: 'xiaohongshu',
      name: '小红书',
      defaultPrefix: 'xiaohongshu',
      theme: {
        accent: '#ff2442',
        rgb: '255, 36, 66',
        dark: '#d81e38',
        badge: '小红书'
      },
      hosts: ['xiaohongshu.com'],
      matches: () => /(^|\.)xiaohongshu\.com$/i.test(location.hostname),
      images(root = document) {
        return Array.from(root.querySelectorAll('img')).filter((img) => {
          const cls = `${img.className || ''} ${img.alt || ''}`.toLowerCase();
          if (/avatar|author|user|emoji|icon|logo|badge|comment|qrcode|qr-code|captcha|verify/.test(cls)) return false;
          let el = img;
          for (let level = 0; level < 5; level += 1) {
            el = el?.parentElement;
            if (!el) break;
            const mark = `${el.id || ''} ${el.className || ''}`.toLowerCase();
            if (/avatar|author|comment|interaction|engage|qrcode|qr-code|captcha|verify/.test(mark)) return false;
          }
          return hasReasonableSize(img, 80, 6000) && Boolean(this.url(img));
        });
      },
      hostFor(img) {
        return img.closest('.swiper-slide, [class*="swiper-slide"]') || img.parentElement;
      },
      url(img) {
        const srcset = parseSrcset(img.getAttribute('srcset'));
        const raw = srcset || img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-original') || '';
        return absoluteUrl(raw);
      },
      key(img, url) {
        const container = img.closest('.note-item, section.note-item, .note-card, [data-note-id], [class*="note-item"], [class*="NoteItem"]') || this.hostFor(img);
        const noteId = container?.dataset?.noteId || container?.getAttribute?.('data-note-id') || noteIdFromLinks(container) || noteIdFromLocation();
        return `${noteId || 'xhs'}-${hash(url).slice(0, 8)}`;
      }
    },
    {
      id: 'pinterest',
      name: 'Pinterest',
      defaultPrefix: 'pinterest',
      theme: {
        accent: '#bd081c',
        rgb: '189, 8, 28',
        dark: '#8c0617',
        badge: 'Pinterest'
      },
      hosts: ['pinterest.com'],
      matches: () => /(^|\.)pinterest\.com$/i.test(location.hostname),
      images(root = document) {
        return Array.from(root.querySelectorAll('img')).filter((img) => /pinimg\.com/i.test(img.currentSrc || img.src || '') && hasReasonableSize(img, 50, 3000));
      },
      hostFor(img) {
        return img.closest('[data-grid-item], [data-test-id="closeup-visual-container"], a[href*="/pin/"]') || img.parentElement;
      },
      usesFloatingControls(img) {
        return /pinimg\.com/i.test(img.currentSrc || img.src || '');
      },
      floatingControlOffset(img, rect) {
        return img.closest('[data-test-id="closeup-visual-container"]') || rect.height > 140
          ? { x: 10, y: 14 }
          : { x: 8, y: 8 };
      },
      url(img) {
        const srcset = img.getAttribute('srcset');
        if (srcset) {
          const parts = srcset.split(',').map((item) => item.trim().split(/\s+/)).filter((item) => item[0]);
          const original = parts.find((item) => item[0].includes('/originals/'));
          if (original) return normalizePinterest(original[0]);
          parts.sort((a, b) => (parseFloat(b[1]) || 0) - (parseFloat(a[1]) || 0));
          if (parts[0]) return normalizePinterest(parts[0][0]);
        }
        return normalizePinterest(img.currentSrc || img.src || '');
      },
      key(img, url) {
        const host = this.hostFor(img);
        const pinEl = host?.querySelector?.('[data-test-pin-id]');
        const fromAttr = pinEl?.getAttribute('data-test-pin-id');
        const fromLink = host?.querySelector?.('a[href*="/pin/"]')?.href?.match(/\/pin\/(\d+)/)?.[1];
        const fromLocation = location.href.match(/\/pin\/(\d+)/)?.[1];
        return fromAttr || fromLink || fromLocation || `pin-${hash(url).slice(0, 10)}`;
      }
    },
    {
      id: 'wechat',
      name: '微信公众号',
      defaultPrefix: 'wechat',
      theme: {
        accent: '#07c160',
        rgb: '7, 193, 96',
        dark: '#128c4a',
        badge: '微信'
      },
      hosts: ['mp.weixin.qq.com'],
      matches: () => location.hostname === 'mp.weixin.qq.com',
      images(root = document) {
        const content = root.querySelector?.('#js_content') || document.querySelector('#js_content');
        if (!content) return [];
        return Array.from(content.querySelectorAll('img')).filter((img) => {
          const cls = `${img.className || ''} ${img.alt || ''}`.toLowerCase();
          if (/emoji|icon|logo|qrcode/.test(cls)) return false;
          return hasReasonableSize(img, 60, 4000, sizeFromWechatData(img)) && Boolean(this.url(img));
        });
      },
      hostFor(img) {
        return img.parentElement;
      },
      url(img) {
        let url = img.getAttribute('data-src') || img.currentSrc || img.src || '';
        url = url.replace(/[&?]tp=webp[^&]*/g, '').replace(/\?&/, '?').replace(/[?&]$/, '');
        const normalized = absoluteUrl(url);
        if (!normalized) return '';
        try {
          const parsed = new URL(normalized);
          ['from', 'wxfrom', 'wx_lazy', 'wx_co', 'token', 'tp', 'scene'].forEach((key) => parsed.searchParams.delete(key));
          return parsed.href;
        } catch (_) {
          return normalized;
        }
      },
      key(_img, url) {
        return `wx-${hash(url).slice(0, 8)}`;
      }
    },
    {
      id: '500px',
      name: '500px',
      defaultPrefix: '500px',
      theme: {
        accent: '#0099e5',
        rgb: '0, 153, 229',
        dark: '#087db8',
        badge: '500px'
      },
      hosts: ['500px.com'],
      matches: () => /(^|\.)500px\.com$/i.test(location.hostname),
      images(root = document) {
        return Array.from(root.querySelectorAll('img')).filter((img) => {
          const url = img.currentSrc || img.src || '';
          if (!/drscdn\.500px\.org\/photo\//i.test(url)) return false;
          if (/user_avatar/i.test(url)) return false;
          if (/avatar|icon|logo/i.test(img.className || '')) return false;
          return hasReasonableSize(img, 60, 3000);
        });
      },
      hostFor(img) {
        return img.closest('a[href*="/photo/"]') || img.parentElement;
      },
      url(img) {
        return absoluteUrl(img.currentSrc || img.src || '');
      },
      key(img, url) {
        const fromUrl = (img.src || '').match(/\/photo\/(\d+)\//)?.[1];
        const fromLink = img.closest('a[href*="/photo/"]')?.href?.match(/\/photo\/(\d+)/)?.[1];
        const fromLocation = location.href.match(/\/photo\/(\d+)/)?.[1];
        return fromUrl || fromLink || fromLocation ? `px5-${fromUrl || fromLink || fromLocation}` : `px5-${hash(url).slice(0, 8)}`;
      }
    },
    {
      id: 'duitang',
      name: '堆糖',
      defaultPrefix: 'duitang',
      theme: {
        accent: '#e86f8f',
        rgb: '232, 111, 143',
        dark: '#c65372',
        badge: '堆糖'
      },
      hosts: ['duitang.com'],
      matches: () => /(^|\.)duitang\.com$/i.test(location.hostname),
      images(root = document) {
        return Array.from(root.querySelectorAll('img')).filter((img) => {
          const url = img.src || img.getAttribute('data-src') || '';
          if (!/dtstatic\.com/i.test(url)) return false;
          if (/avatar/i.test(url)) return false;
          if (/avatar|icon|logo/i.test(`${img.className || ''} ${img.id || ''}`)) return false;
          return hasReasonableSize(img, 60, 3000) && Boolean(this.url(img));
        });
      },
      hostFor(img) {
        return img.closest('.woo-pcont, .mbpho, .de-img, [class*="pcont"], a[href*="/blog/"]') || img.parentElement;
      },
      url(img) {
        const linked = img.closest('.img-out')?.href;
        const raw = linked || img.getAttribute('data-src') || img.currentSrc || img.src || '';
        return absoluteUrl(raw.replace(/\.thumb\.\d+_\d+(_c)?/, '').replace(/_webp$/, ''));
      },
      key(img, url) {
        const blogId = img.closest('a[href*="/blog/"]')?.href?.match(/[?&]id=(\d+)/)?.[1] || location.href.match(/\/blog\/\?id=(\d+)/)?.[1];
        return blogId ? `dt-${blogId}-${hash(url).slice(0, 8)}` : `dt-${hash(url).slice(0, 8)}`;
      }
    },
    {
      id: 'huaban',
      name: '花瓣',
      defaultPrefix: 'huaban',
      theme: {
        accent: '#c95f68',
        rgb: '201, 95, 104',
        dark: '#9e414d',
        badge: '花瓣'
      },
      hosts: ['huaban.com'],
      matches: () => /(^|\.)huaban\.com$/i.test(location.hostname),
      images(root = document) {
        return Array.from(root.querySelectorAll('img')).filter((img) => {
          const url = this.url(img);
          if (!/gd-hbimg-(?:edge|other)\.huaban\.com/i.test(url)) return false;
          if (!huabanPinLink(img) && !huabanPinIdFromLocation()) return false;
          const mark = `${img.className || ''} ${img.id || ''} ${img.alt || ''}`.toLowerCase();
          if (/avatar|user|icon|logo|emoji|qrcode|qr-code|captcha|vip|subscribe/.test(mark)) return false;
          if (/(?:_sq\d+|_fw86)(?:webp)?(?:[?#]|$)/i.test(img.currentSrc || img.src || '')) return false;
          return hasReasonableSize(img, 80, 6000) && Boolean(url);
        });
      },
      hostFor(img) {
        return img.closest('a[href*="/pins/"], [data-pin-id], [data-id]') || img.parentElement;
      },
      usesFloatingControls(img) {
        return Boolean(huabanPinLink(img));
      },
      floatingControlOffset() {
        return { x: 8, y: 8 };
      },
      url(img) {
        const raw = parseSrcset(img.getAttribute('srcset')) || img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-original') || '';
        return normalizeHuaban(raw);
      },
      key(img, url) {
        const pinId = huabanPinIdFromImage(img) || huabanPinIdFromLocation();
        return pinId ? `hb-${pinId}-${hash(url).slice(0, 8)}` : `hb-${hash(url).slice(0, 8)}`;
      }
    }
  ];

  function currentAdapter() {
    return adapters.find((adapter) => adapter.matches());
  }

  function parseSrcset(srcset) {
    if (!srcset) return '';
    const parts = srcset.split(',').map((item) => item.trim().split(/\s+/)).filter((item) => item[0]);
    parts.sort((a, b) => (parseFloat(b[1]) || 0) - (parseFloat(a[1]) || 0));
    return parts[0]?.[0] || '';
  }

  function absoluteUrl(url) {
    if (!url || /^blob:/i.test(url)) return '';
    let value = String(url).trim();
    if (value.startsWith('//')) value = `${location.protocol}${value}`;
    try {
      value = new URL(value, location.href).href;
    } catch (_) {
      return '';
    }
    return /^https?:|^data:image\//i.test(value) ? value : '';
  }

  function normalizePinterest(url) {
    const absolute = absoluteUrl(url);
    return absolute ? absolute.split('#')[0].split('?')[0].replace(/\/(236x|474x|564x|736x|originals)\//, '/originals/') : '';
  }

  function hasReasonableSize(img, minSide, minArea, fallback = {}) {
    const rect = img.getBoundingClientRect();
    const width = img.naturalWidth || rect.width || fallback.width || Number(img.getAttribute('width')) || 0;
    const height = img.naturalHeight || rect.height || fallback.height || Number(img.getAttribute('height')) || 0;
    if (width && width < minSide) return false;
    if (height && height < minSide) return false;
    if (rect.width && rect.height && rect.width * rect.height < minArea) return false;
    return true;
  }

  function sizeFromWechatData(img) {
    const width = Number(img.getAttribute('data-w')) || 0;
    const ratio = Number(img.getAttribute('data-ratio')) || 0;
    return { width, height: width && ratio ? Math.round(width * ratio) : 0 };
  }

  function noteIdFromLinks(container) {
    const link = container?.matches?.('a[href]') ? container : container?.querySelector?.('a[href*="/explore/"], a[href*="/discovery/item/"]');
    return link?.href?.match(/\/(?:explore|discovery\/item)\/([^/?#]+)/)?.[1] || null;
  }

  function noteIdFromLocation() {
    return location.href.match(/\/(?:explore|discovery\/item)\/([^/?#]+)/)?.[1] || null;
  }

  function huabanPinLink(img) {
    const link = img.closest?.('a[href*="/pins/"]');
    if (!link?.href) return null;
    try {
      const url = new URL(link.href, location.href);
      return /(^|\.)huaban\.com$/i.test(url.hostname) && /\/pins\/\d+/i.test(url.pathname) ? link : null;
    } catch (_) {
      return null;
    }
  }

  function huabanPinIdFromImage(img) {
    return huabanPinLink(img)?.href?.match(/\/pins\/(\d+)/)?.[1] || img.closest?.('[data-pin-id]')?.getAttribute?.('data-pin-id') || null;
  }

  function huabanPinIdFromLocation() {
    return location.href.match(/\/pins\/(\d+)/)?.[1] || null;
  }

  function normalizeHuaban(url) {
    const absolute = absoluteUrl(url);
    if (!absolute) return '';
    try {
      const parsed = new URL(absolute);
      if (/gd-hbimg-(?:edge|other)\.huaban\.com$/i.test(parsed.hostname)) {
        parsed.pathname = parsed.pathname.replace('/small/', '/').replace(/_(?:fw|sq)\d+(?:webp)?$/i, '');
      }
      parsed.hash = '';
      return parsed.href;
    } catch (_) {
      return absolute;
    }
  }

  function hash(input) {
    let value = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
      value ^= input.charCodeAt(index);
      value = Math.imul(value, 0x01000193);
    }
    return (value >>> 0).toString(16).padStart(8, '0');
  }

  window.ImageDownloaderAdapters = { adapters, currentAdapter };
})();
