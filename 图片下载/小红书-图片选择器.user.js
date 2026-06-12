// ==UserScript==
// @name         小红书图片选择器 (v2.0)
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  小红书图片选择与批量下载。轮播图每张独立可选，S 选中鼠标下图片，已选红框持久显示，支持 ZIP 打包。
// @author       You & Claude
// @match        https://xiaohongshu.com/*
// @match        https://www.xiaohongshu.com/*
// @match        https://*.xiaohongshu.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @connect      xhscdn.com
// @connect      *.xhscdn.com
// @connect      xiaohongshu.com
// @connect      *.xiaohongshu.com
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // === 配置 ===
    const FEED_SEL = [
        '.note-item', 'section.note-item', '.note-card',
        'a[href*="/explore/"]', 'a[href*="/discovery/item/"]',
        '[data-note-id]', '[class*="note-item"]', '[class*="NoteItem"]'
    ].join(', ');
    const DETAIL_SEL = [
        '.note-detail-mask', '.note-detail', '.note-container',
        '[class*="note-detail"]', '[class*="NoteDetail"]'
    ].join(', ');
    const MEDIA_SEL = [
        '.media-container', '.swiper', '.swiper-wrapper', '.carousel', '.slider',
        '[class*="swiper"]', '[class*="carousel"]', '[class*="slider"]', '[class*="media-container"]'
    ].join(', ');
    const ALL_SEL = `${FEED_SEL}, ${DETAIL_SEL}`;
    const SK = { sel: 'xhs_selected_v2', prefix: 'xhs_prefix', dock: 'xhs_dock_collapsed' };

    // === 状态 ===
    let selected = new Map();
    let prefix = load(SK.prefix, 'xiaohongshu');
    let collapsed = false;
    let mx = -1, my = -1;
    let busy = false;
    let progress = null;
    let raf = null;
    // 不再用 WeakSet 跟踪 img，改为通过 host 是否已有按钮来去重

    // === 存储 ===
    function load(k, fb) {
        try { const v = GM_getValue(k, undefined); if (v !== undefined && !(v && v.then)) return v; } catch (_) {}
        try { const s = localStorage.getItem(k); if (s !== null) return JSON.parse(s); } catch (_) {}
        return fb;
    }
    function save(k, v) {
        try { GM_setValue(k, v); } catch (_) {}
        try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {}
    }
    function loadSel() {
        const d = load(SK.sel, []);
        selected.clear();
        if (Array.isArray(d)) d.forEach(([k, v]) => { if (k && v) selected.set(k, v); });
    }
    function saveSel() { save(SK.sel, [...selected.entries()]); }

    // === 图片工具 ===
    function norm(url) {
        if (!url || url.startsWith('blob:')) return '';
        let u = String(url).trim();
        if (u.startsWith('//')) u = location.protocol + u;
        try { u = new URL(u, location.href).href; } catch (_) { return ''; }
        if (!/^https?:|^data:image\//.test(u)) return '';
        return u;
    }
    function bestUrl(img) {
        if (img.srcset) {
            const ps = img.srcset.split(',').map(s => s.trim().split(/\s+/)).filter(p => p[0]);
            ps.sort((a, b) => (parseFloat(b[1]) || 0) - (parseFloat(a[1]) || 0));
            if (ps[0]?.[0]) return ps[0][0];
        }
        return img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-original') || '';
    }
    function isContent(img) {
        const cls = `${img.className || ''} ${img.alt || ''}`.toLowerCase();
        if (/avatar|author|user|emoji|icon|logo|badge|comment/.test(cls)) return false;
        let el = img;
        for (let i = 0; i < 5; i++) {
            el = el?.parentElement;
            if (!el) break;
            const s = `${el.id || ''} ${el.className || ''}`.toLowerCase();
            if (/avatar|author|comment|interaction|engage/.test(s)) return false;
        }
        const r = img.getBoundingClientRect();
        const w = img.naturalWidth || r.width || +img.getAttribute('width') || 0;
        const h = img.naturalHeight || r.height || +img.getAttribute('height') || 0;
        if (w && h && (w < 80 || h < 80)) return false;
        if (r.width && r.height && r.width * r.height < 6000) return false;
        return true;
    }
    function scanRoot(c) {
        if (c.matches?.(DETAIL_SEL)) return c.querySelector(MEDIA_SEL) || c;
        return c;
    }
    function contentImgs(c) {
        return Array.from(scanRoot(c).querySelectorAll('img')).filter(isContent);
    }
    function noteId(c) {
        const ex = c.dataset?.noteId || c.getAttribute?.('data-note-id');
        if (ex) return ex;
        const link = c.matches?.('a[href]') ? c : c.querySelector?.('a[href*="/explore/"], a[href*="/discovery/item/"]');
        const href = link?.href || location.href;
        const m = href.match(/\/(?:explore|discovery\/item)\/([^/?#]+)/);
        if (m?.[1]) return m[1];
        return null;
    }

    // === 选中逻辑 ===
    function imgKey(img, c) {
        const url = norm(bestUrl(img));
        if (!url) return null;
        const nid = noteId(c);
        const h = hash(url).slice(0, 8);
        const id = `${nid || 'xhs'}-${h}`;
        return { id, url };
    }
    function getImgKey(img, c) {
        const info = imgKey(img, c);
        if (!info) return null;
        if (selected.has(info.id)) return { ...info, sel: true };
        for (const [k, v] of selected) { if (norm(v) === info.url) return { id: k, url: info.url, sel: true }; }
        return { ...info, sel: false };
    }
    function toggleImg(img, c) {
        const info = getImgKey(img, c);
        if (!info) return;
        info.sel ? selected.delete(info.id) : selected.set(info.id, info.url);
        saveSel(); refreshAll(); updateDock();
    }

    // === DOM（每张图片独立选中按钮）===
    function setup(c) {
        c.classList.add('ps-pin');
        if (getComputedStyle(c).position === 'static') c.style.position = 'relative';
        const imgs = contentImgs(c);
        for (const img of imgs) {
            // 按钮放在 swiper-slide 或图片父级上
            const host = img.closest('.swiper-slide') || img.parentElement;
            if (!host) continue;
            if (host.querySelector(':scope > .ps-sel-btn')) continue; // 该宿主已有按钮
            if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

            const btn = document.createElement('div');
            btn.className = 'ps-sel-btn';
            btn._psImg = img; // 按钮关联具体图片
            btn.addEventListener('pointerdown', e => {
                e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
                toggleImg(img, c);
            }, true);
            btn.addEventListener('click', e => {
                e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            }, true);
            host.appendChild(btn);
            if (!img.complete) {
                img.addEventListener('load', () => refreshBtn(btn, img, c), { once: true });
            }
            refreshBtn(btn, img, c);
        }
    }
    function refreshBtn(btn, img, c) {
        const info = getImgKey(img, c);
        if (!info) return; // 图片未就绪时保留现有视觉状态
        btn.classList.toggle('ps-active', info.sel);
        const host = btn.parentElement;
        if (host && host !== c) host.classList.toggle('ps-img-on', info.sel);
    }
    function refreshAll() {
        document.querySelectorAll('.ps-sel-btn').forEach(btn => {
            const img = btn._psImg;
            if (!img) return;
            const c = btn.closest('.ps-pin') || img.closest(ALL_SEL);
            if (!c) return;
            refreshBtn(btn, img, c);
        });
    }
    function scan() {
        document.querySelectorAll(ALL_SEL).forEach(c => {
            const r = c.getBoundingClientRect();
            if (r.bottom < -500 || r.top > innerHeight + 500) return;
            setup(c); // 内部通过 seenImgs 跳过已处理图片，新图片会被识别
        });
        refreshAll();
    }
    function sched() { if (!raf) raf = requestAnimationFrame(() => { raf = null; scan(); }); }

    // === 样式 ===
    function injectCSS() {
        if (document.getElementById('ps-css')) return;
        const s = document.createElement('style');
        s.id = 'ps-css';
        s.textContent = CSS_TEXT;
        try { (document.head || document.documentElement).appendChild(s); } catch (_) { document.documentElement.appendChild(s); }
    }

    const CSS_TEXT = `
/* 选择按钮 — 默认隐藏 */
.ps-sel-btn {
    position: absolute !important;
    top: 8px !important; left: 8px !important;
    width: 34px !important; height: 34px !important;
    border-radius: 50% !important;
    background: rgba(255,255,255,0.95) !important;
    border: 1.5px solid rgba(0,0,0,0.1) !important;
    box-shadow: 0 1px 5px rgba(0,0,0,0.12) !important;
    z-index: 999990 !important;
    cursor: pointer !important;
    display: none !important;
    align-items: center !important; justify-content: center !important;
    box-sizing: border-box !important;
    -webkit-tap-highlight-color: transparent !important;
    user-select: none !important;
    transition: transform 0.15s, background 0.15s, box-shadow 0.15s !important;
}
.ps-sel-btn::after {
    content: '+' !important;
    font: 300 22px/1 -apple-system, sans-serif !important;
    color: #555 !important;
}
.ps-pin:hover .ps-sel-btn {
    display: flex !important;
}
.ps-sel-btn:hover {
    transform: scale(1.1) !important;
    box-shadow: 0 2px 10px rgba(0,0,0,0.18) !important;
}
.ps-sel-btn.ps-active {
    display: flex !important;
    background: #ff2442 !important;
    border-color: #fff !important;
    box-shadow: 0 0 0 2px rgba(255,255,255,0.8), 0 2px 10px rgba(255,36,66,0.3) !important;
}
.ps-sel-btn.ps-active::after {
    content: '\\2713' !important;
    font: 600 16px/1 -apple-system, sans-serif !important;
    color: #fff !important;
}
/* 选中的图片宿主描边（每张图片独立） */
.ps-img-on {
    outline: 3px solid #ff2442 !important;
    outline-offset: -2px !important;
    border-radius: 12px !important;
}

/* ========== Dock ========== */
#ps-dock {
    position: fixed !important; bottom: 16px !important; right: 16px !important;
    z-index: 2147483646 !important;
    font: 13px/1.3 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif !important;
    color: #1a1a1a !important;
    pointer-events: auto !important;
}

/* 展开态 */
#ps-dock .ps-expanded {
    display: flex !important;
    align-items: center !important;
    gap: 5px !important;
    padding: 5px 6px 5px 5px !important;
    border-radius: 26px !important;
    background: rgba(255,255,255,0.92) !important;
    border: 1px solid rgba(0,0,0,0.06) !important;
    box-shadow: 0 4px 24px rgba(0,0,0,0.08), 0 12px 48px rgba(0,0,0,0.04) !important;
    backdrop-filter: blur(20px) saturate(1.4) !important;
    -webkit-backdrop-filter: blur(20px) saturate(1.4) !important;
}
#ps-dock .ps-badge {
    display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important;
    min-width: 40px !important; height: 40px !important; border-radius: 50% !important;
    background: rgba(255,36,66,0.06) !important; flex-shrink: 0 !important;
    transition: transform 0.15s, box-shadow 0.15s, background 0.15s !important;
}
#ps-dock .ps-num {
    font-size: 17px !important; font-weight: 800 !important; color: #ff2442 !important; line-height: 1 !important;
}
#ps-dock .ps-stage { display: none !important; margin-top: 2px !important; font-size: 8px !important; font-weight: 650 !important; color: #d81e38 !important; opacity: 0.72 !important; }
#ps-dock .ps-badge.ps-busy { background: conic-gradient(#ff2442 var(--ps-progress, 0deg), rgba(255,36,66,0.08) 0deg) !important; box-shadow: inset 0 0 0 5px rgba(255,255,255,0.9), 0 2px 10px rgba(255,36,66,0.12) !important; }
#ps-dock .ps-badge.ps-busy .ps-num { font-size: 15px !important; }
#ps-dock .ps-badge.ps-busy .ps-stage { display: block !important; }
#ps-dock .ps-expanded button {
    all: unset !important;
    display: inline-flex !important; align-items: center !important; justify-content: center !important;
    height: 32px !important; padding: 0 11px !important; border-radius: 16px !important;
    font-size: 12px !important; font-weight: 600 !important;
    cursor: pointer !important; white-space: nowrap !important;
    user-select: none !important; transition: transform 0.12s, background 0.12s !important;
}
#ps-dock .ps-expanded button:hover:not(:disabled) { transform: translateY(-1px) !important; }
#ps-dock .ps-expanded button:active:not(:disabled) { transform: scale(0.96) !important; }
#ps-dock .ps-expanded button:disabled { opacity: 0.3 !important; cursor: default !important; }
#ps-dock .ps-expanded button kbd {
    display: inline-flex !important; align-items: center !important; justify-content: center !important;
    min-width: 14px !important; height: 14px !important; padding: 0 3px !important; margin-left: 4px !important;
    border-radius: 3px !important; font: 9px/1 ui-monospace, monospace !important; opacity: 0.5 !important;
}
.ps-g { background: rgba(0,0,0,0.04) !important; color: #555 !important; }
.ps-g:hover:not(:disabled) { background: rgba(0,0,0,0.09) !important; }
.ps-g kbd { background: rgba(0,0,0,0.06) !important; color: #888 !important; }
.ps-r { background: #ff2442 !important; color: #fff !important; box-shadow: 0 2px 8px rgba(255,36,66,0.2) !important; }
.ps-r:hover:not(:disabled) { background: #e6002e !important; }
.ps-r kbd { background: rgba(255,255,255,0.25) !important; color: inherit !important; }
.ps-d { background: #1a1a1a !important; color: #fff !important; }
.ps-d:hover:not(:disabled) { background: #000 !important; }
.ps-d kbd { background: rgba(255,255,255,0.18) !important; color: inherit !important; }
#ps-dock .ps-fold-btn {
    width: 26px !important; height: 26px !important; padding: 0 !important;
    border-radius: 50% !important; background: transparent !important;
    color: #ccc !important; font-size: 15px !important; flex-shrink: 0 !important; margin-left: 1px !important;
}
#ps-dock .ps-fold-btn:hover:not(:disabled) { color: #888 !important; transform: none !important; background: rgba(0,0,0,0.04) !important; }

/* 折叠态 */
#ps-dock .ps-pill {
    width: 52px !important; height: 52px !important; border-radius: 50% !important;
    background: #fff !important; border: 2px solid #ff2442 !important;
    box-shadow: 0 2px 12px rgba(255,36,66,0.18), 0 4px 20px rgba(0,0,0,0.08) !important;
    display: flex !important; flex-direction: column !important;
    align-items: center !important; justify-content: center !important;
    cursor: pointer !important; transition: transform 0.15s, box-shadow 0.15s !important;
}
#ps-dock .ps-pill:hover { transform: scale(1.08) !important; box-shadow: 0 4px 18px rgba(255,36,66,0.25), 0 6px 28px rgba(0,0,0,0.1) !important; }
#ps-dock .ps-pill:active { transform: scale(0.94) !important; }
#ps-dock .ps-pill-n { font-size: 17px !important; font-weight: 800 !important; color: #ff2442 !important; line-height: 1 !important; }
#ps-dock .ps-pill-l { font-size: 8px !important; color: #ff2442 !important; opacity: 0.6 !important; margin-top: 2px !important; }
#ps-dock .ps-pill.ps-busy { animation: ps-pulse 1.2s ease-in-out infinite !important; border-color: #ff6b00 !important; background: conic-gradient(#ff2442 var(--ps-progress, 0deg), rgba(255,36,66,0.08) 0deg) !important; box-shadow: inset 0 0 0 5px rgba(255,255,255,0.9), 0 2px 12px rgba(255,36,66,0.16) !important; }
#ps-dock .ps-pill.ps-busy .ps-pill-n { font-size: 13px !important; color: #ff6b00 !important; }
#ps-dock .ps-pill.ps-busy .ps-pill-l { color: #ff6b00 !important; }
@keyframes ps-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(255,107,0,0.3), 0 2px 12px rgba(255,107,0,0.15); }
    50% { box-shadow: 0 0 0 6px rgba(255,107,0,0), 0 2px 12px rgba(255,107,0,0.25); }
}

/* Toast */
.ps-toast {
    position: fixed !important; bottom: 80px !important; right: 16px !important;
    z-index: 2147483647 !important; padding: 10px 16px !important; border-radius: 12px !important;
    background: rgba(20,20,20,0.92) !important; color: #fff !important;
    font: 13px/1.4 -apple-system, sans-serif !important;
    box-shadow: 0 6px 20px rgba(0,0,0,0.18) !important; backdrop-filter: blur(10px) !important;
    transform: translateY(6px) !important; opacity: 0 !important;
    transition: opacity 0.15s, transform 0.15s !important; pointer-events: none !important;
}
.ps-toast.ps-show { opacity: 1 !important; transform: none !important; }

/* Modal */
.ps-modal-bg {
    position: fixed !important; inset: 0 !important; z-index: 2147483647 !important;
    background: rgba(0,0,0,0.4) !important; backdrop-filter: blur(4px) !important;
    display: flex !important; align-items: center !important; justify-content: center !important;
    opacity: 0 !important; transition: opacity 0.15s !important;
    font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif !important;
}
.ps-modal-bg.ps-show { opacity: 1 !important; }
.ps-modal-card {
    width: min(460px, calc(100vw - 32px)) !important; max-height: calc(100vh - 48px) !important;
    overflow-y: auto !important; padding: 24px !important; border-radius: 16px !important;
    background: #fff !important; box-shadow: 0 24px 64px rgba(0,0,0,0.2) !important;
    transform: translateY(8px) scale(0.97) !important; transition: transform 0.18s cubic-bezier(.4,0,.2,1) !important;
}
.ps-modal-bg.ps-show .ps-modal-card { transform: none !important; }
.ps-modal-card h3 { margin: 0 0 8px !important; font-size: 17px !important; font-weight: 700 !important; color: #111 !important; }
.ps-modal-card p { margin: 0 0 14px !important; font-size: 13px !important; color: #777 !important; }
.ps-modal-card input {
    width: 100% !important; box-sizing: border-box !important; height: 40px !important;
    padding: 0 12px !important; border: 1px solid #ddd !important; border-radius: 10px !important;
    font-size: 14px !important; outline: none !important; margin-bottom: 14px !important;
}
.ps-modal-card input:focus { border-color: #ff2442 !important; box-shadow: 0 0 0 2px rgba(255,36,66,0.12) !important; }
.ps-modal-card textarea {
    width: 100% !important; box-sizing: border-box !important; min-height: 140px !important;
    padding: 10px 12px !important; border: 1px solid #ddd !important; border-radius: 10px !important;
    font: 12px/1.5 ui-monospace, monospace !important; outline: none !important; resize: vertical !important;
}
.ps-modal-card textarea:focus { border-color: #ff2442 !important; }
.ps-modal-foot { display: flex !important; justify-content: flex-end !important; gap: 8px !important; margin-top: 14px !important; }
.ps-modal-foot button {
    all: unset !important; display: inline-flex !important; align-items: center !important;
    height: 36px !important; padding: 0 14px !important; border-radius: 18px !important;
    font-size: 13px !important; font-weight: 650 !important; cursor: pointer !important;
}
.ps-m-cancel { background: #f0f0f0 !important; color: #555 !important; }
.ps-m-ok { background: #ff2442 !important; color: #fff !important; }
.ps-dl-list { display: flex !important; flex-direction: column !important; gap: 6px !important; }
.ps-dl-item {
    all: unset !important; display: flex !important; flex-direction: column !important;
    padding: 10px 14px !important; border-radius: 10px !important; cursor: pointer !important;
    background: #f8f8f8 !important; border: 1px solid rgba(0,0,0,0.05) !important;
    font-size: 13px !important; font-weight: 600 !important; color: #222 !important;
}
.ps-dl-item:hover { background: #fff !important; border-color: rgba(255,36,66,0.25) !important; }
.ps-dl-item small { font-size: 11px !important; font-weight: 400 !important; color: #999 !important; margin-top: 2px !important; }
`;

    // === Dock ===
    function createDock() {
        if (document.getElementById('ps-dock')) return;
        const d = document.createElement('div');
        d.id = 'ps-dock';
        d.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483646;font:13px/1.3 -apple-system,sans-serif;color:#1a1a1a;pointer-events:auto;';
        document.body.appendChild(d);
        renderDock();
    }

    function renderDock() {
        const d = document.getElementById('ps-dock');
        if (!d) return;
        const n = selected.size;
        const value = dockValue();
        const label = dockLabel();
        d.style.setProperty('--ps-progress', `${progressDegrees()}deg`);

        if (collapsed) {
            d.innerHTML = '';
            const pill = document.createElement('div');
            pill.className = 'ps-pill';
            pill.style.cssText = 'width:52px;height:52px;border-radius:50%;background:#fff;border:2px solid #ff2442;box-shadow:0 2px 12px rgba(255,36,66,0.18);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;';
            pill.innerHTML = `<span class="ps-pill-n" style="font-size:17px;font-weight:800;color:#ff2442;line-height:1">${value}</span><span class="ps-pill-l" style="font-size:8px;color:#ff2442;opacity:0.6;margin-top:2px">${label}</span>`;
            if (busy) pill.classList.add('ps-busy');
            pill.onclick = () => { collapsed = false; save(SK.dock, false); renderDock(); };
            d.appendChild(pill);
        } else {
            d.innerHTML = '';
            const bar = document.createElement('div');
            bar.className = 'ps-expanded';
            bar.style.cssText = 'display:flex;align-items:center;gap:5px;padding:5px 6px 5px 5px;border-radius:26px;background:rgba(255,255,255,0.92);border:1px solid rgba(0,0,0,0.06);box-shadow:0 4px 24px rgba(0,0,0,0.08);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);';
            bar.innerHTML = `
                <div class="ps-badge ${busy ? 'ps-busy' : ''}" style="display:flex;align-items:center;justify-content:center;min-width:40px;height:40px;border-radius:50%;background:rgba(255,36,66,0.06)"><span class="ps-num" style="font-size:17px;font-weight:800;color:#ff2442">${value}</span><span class="ps-stage">${label}</span></div>
                <button class="ps-g" data-a="all">全选<kbd>A</kbd></button>
                <button class="ps-g" data-a="clear">清空</button>
                <button class="ps-g" data-a="links">链接</button>
                <button class="ps-g" data-a="prefix">前缀</button>
                <button class="ps-r" data-a="dl" ${n === 0 || busy ? 'disabled' : ''}>下载<kbd>D</kbd></button>
                <button class="ps-d" data-a="dl-new" ${n === 0 || busy ? 'disabled' : ''}>新批次<kbd>N</kbd></button>
                <button class="ps-fold-btn" data-a="fold" title="收起面板">&#x203A;</button>`;
            d.appendChild(bar);
            d.querySelectorAll('[data-a]').forEach(btn => {
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    const a = btn.dataset.a;
                    if (a === 'fold') { collapsed = true; save(SK.dock, true); renderDock(); }
                    else if (a === 'all') selAll();
                    else if (a === 'clear') clearSel();
                    else if (a === 'links') linksModal();
                    else if (a === 'prefix') prefixModal();
                    else if (a === 'dl') startDl(false);
                    else if (a === 'dl-new') startDl(true);
                });
            });
        }
    }

    function updateDock() {
        const d = document.getElementById('ps-dock');
        if (!d) return;
        const n = selected.size;
        d.style.setProperty('--ps-progress', `${progressDegrees()}deg`);
        const num = d.querySelector('.ps-num') || d.querySelector('.ps-pill-n');
        if (num) num.textContent = dockValue();
        const stage = d.querySelector('.ps-stage') || d.querySelector('.ps-pill-l');
        if (stage) stage.textContent = dockLabel();
        d.querySelector('.ps-badge')?.classList.toggle('ps-busy', busy);
        d.querySelector('.ps-pill')?.classList.toggle('ps-busy', busy);
        const dlBtn = d.querySelector('[data-a="dl"]');
        const dlNewBtn = d.querySelector('[data-a="dl-new"]');
        if (dlBtn) dlBtn.disabled = n === 0 || busy;
        if (dlNewBtn) dlNewBtn.disabled = n === 0 || busy;
    }

    function dockValue() {
        return progress ? progress.done : selected.size;
    }

    function dockLabel() {
        if (!progress) return busy ? '下载中' : '已选';
        if (progress.phase === 'fetching') return '抓取';
        if (progress.phase === 'packing') return '打包';
        if (progress.phase === 'saving') return '保存';
        return '下载';
    }

    function progressDegrees() {
        if (!progress || !progress.total) return 0;
        return Math.round((progress.done / progress.total) * 360);
    }

    // === 事件 ===
    function setupEvents() {
        document.addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; }, { passive: true, capture: true });

        document.addEventListener('keydown', e => {
            const t = e.target.tagName;
            if (t === 'INPUT' || t === 'TEXTAREA' || e.target.isContentEditable) return;
            if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
            const k = (e.key || '').toLowerCase();
            if ((k === 's' || k === 'a') && mx >= 0) {
                const c = containerAt(mx, my);
                if (c) {
                    e.preventDefault(); e.stopPropagation(); setup(c);
                    const img = imgAt(mx, my, c);
                    if (img) toggleImg(img, c);
                }
            } else if (k === 'd' && !busy && selected.size > 0) {
                e.preventDefault(); startDl(false);
            } else if (k === 'n' && !busy && selected.size > 0) {
                e.preventDefault(); startDl(true);
            }
        }, true);

        window.addEventListener('scroll', sched, { passive: true });
        window.addEventListener('resize', sched, { passive: true });
        window.addEventListener('popstate', () => setTimeout(sched, 200));
        const oPush = history.pushState;
        history.pushState = function (...a) { oPush.apply(this, a); setTimeout(sched, 200); };
        const oRepl = history.replaceState;
        history.replaceState = function (...a) { oRepl.apply(this, a); setTimeout(sched, 200); };
        new MutationObserver(sched).observe(document.body, { childList: true, subtree: true });
    }

    function containerAt(x, y) {
        for (const el of document.elementsFromPoint(x, y)) {
            const c = el.closest(ALL_SEL);
            if (c) return c;
        }
        return null;
    }
    function imgAt(x, y, c) {
        // 优先找光标下的图片
        for (const el of document.elementsFromPoint(x, y)) {
            if (el.tagName === 'IMG' && isContent(el)) return el;
        }
        // 回退：swiper 当前活动的幻灯片
        const active = c.querySelector('.swiper-slide-active img');
        if (active && isContent(active)) return active;
        // 回退：容器内第一张内容图片
        return contentImgs(c)[0] || null;
    }

    // === 选择操作 ===
    function selAll() {
        let n = 0;
        document.querySelectorAll(ALL_SEL).forEach(c => {
            const r = c.getBoundingClientRect();
            if (r.bottom <= 0 || r.top >= innerHeight) return;
            setup(c);
            for (const img of contentImgs(c)) {
                const info = getImgKey(img, c);
                if (!info || info.sel) continue;
                selected.set(info.id, info.url); n++;
            }
        });
        if (n > 0) { saveSel(); refreshAll(); updateDock(); }
        toast(`已选 ${n} 张`);
    }

    function clearSel() {
        selected.clear(); saveSel(); refreshAll(); updateDock();
        toast('已清空');
    }

    // === 下载 ===
    function startDl(isNew) {
        if (selected.size === 0 || busy) return;
        if (isNew) prefixModal(() => dlModal(true));
        else dlModal(false);
    }

    function dlModal(isNew) {
        const modal = showModal(`
            <h3>下载方式</h3><p>共 ${selected.size} 张图片</p>
            <div class="ps-dl-list">
                <button class="ps-dl-item" data-k="1" data-m="list">链接列表<kbd>1</kbd><small>保存全部原图 URL 到 .txt</small></button>
                <button class="ps-dl-item" data-k="2" data-m="direct">逐张下载<kbd>2</kbd><small>直接保存到本地</small></button>
                <button class="ps-dl-item" data-k="3" data-m="zip">ZIP 压缩包<kbd>3</kbd><small>抓取图片打包下载</small></button>
            </div>`);
        modal._psKeydown = (e) => {
            const mode = downloadModeForKey(e.key);
            if (!mode) return false;
            e.preventDefault();
            closeModal(modal);
            execDl(mode, isNew);
            return true;
        };
        modal.querySelectorAll('[data-m]').forEach(b => {
            b.onclick = () => { closeModal(modal); execDl(b.dataset.m, isNew); };
        });
    }

    function downloadModeForKey(key) {
        return ({ 1: 'list', 2: 'direct', 3: 'zip' })[String(key || '').trim()] || '';
    }

    async function execDl(mode, isNew) {
        const entries = [...selected.entries()];
        const h = hash(entries.map(e => e[1]).join('\n')).slice(0, 8);
        const name = `小红书-${prefix}-${h}`;

        if (mode === 'list') {
            dlBlob(new Blob([entries.map(e => e[1]).join('\n')], { type: 'text/plain' }), `${name}.txt`);
            clearSel(); toast('链接已下载');
        } else if (mode === 'direct') {
            busy = true; progress = { phase: 'active', done: 0, total: entries.length }; renderDock();
            let ok = 0, fail = 0;
            for (let i = 0; i < entries.length; i++) {
                const url = entries[i][1];
                const fn = `${name}-${String(i + 1).padStart(3, '0')}.${ext(url)}`;
                try {
                    await dlSingle(url, fn);
                    ok++;
                } catch (e) {
                    fail++;
                    console.warn('[XHS] 下载失败:', fn, e);
                }
                setProgress(isNew, 'active', i + 1, entries.length);
                if (i < entries.length - 1) await delay(600);
            }
            busy = false; progress = null; clearSel(); renderDock();
            toast(fail ? `完成 ${ok} 张，失败 ${fail} 张` : '下载完成');
        } else if (mode === 'zip') {
            busy = true; progress = { phase: 'fetching', done: 0, total: entries.length }; renderDock();
            let done = 0;
            const files = [];
            await parallel(entries, 6, async ([id, url], i) => {
                try {
                    const b = await fetchImg(url);
                    files.push({ name: `${name}/${String(i + 1).padStart(3, '0')}-${id}.${ext(url, b.type)}`, blob: b });
                } catch (_) {}
                setProgress(isNew, 'fetching', ++done, entries.length);
            });
            if (files.length) {
                setProgress(isNew, 'packing', 0, files.length);
                const zip = await makeZip(files, async (packed) => {
                    setProgress(isNew, 'packing', packed, files.length);
                });
                setProgress(isNew, 'saving', files.length, files.length);
                dlBlob(zip, `${name}.zip`);
                busy = false; progress = null; clearSel(); renderDock(); toast('ZIP 已下载');
            } else {
                busy = false; progress = null; renderDock(); toast('无可用图片');
            }
        }
    }

    function setProgress(isNew, phase, done, total) {
        const d = document.getElementById('ps-dock');
        progress = {
            phase,
            done: Math.min(Number(total) || 0, Math.max(0, Number(done) || 0)),
            total: Math.max(0, Number(total) || 0)
        };
        if (!d) return;
        d.style.setProperty('--ps-progress', `${progressDegrees()}deg`);
        const b = d.querySelector(`[data-a="${isNew ? 'dl-new' : 'dl'}"]`);
        if (b) b.textContent = `${dockLabel()} ${progress.done}/${progress.total}`;
        const badge = d.querySelector('.ps-badge');
        const num = d.querySelector('.ps-num');
        const stage = d.querySelector('.ps-stage');
        if (badge) badge.classList.add('ps-busy');
        if (num) num.textContent = progress.done;
        if (stage) stage.textContent = dockLabel();
        const pill = d.querySelector('.ps-pill');
        const pillN = d.querySelector('.ps-pill-n');
        const pillL = d.querySelector('.ps-pill-l');
        if (pill) pill.classList.add('ps-busy');
        if (pillN) pillN.textContent = progress.done;
        if (pillL) pillL.textContent = dockLabel();
    }

    // === 网络 ===
    function fetchImg(url) {
        return new Promise((ok, no) => {
            if (typeof GM_xmlhttpRequest !== 'function') {
                fetch(url, { credentials: 'omit' }).then(r => r.ok ? r.blob() : Promise.reject()).then(ok, no);
                return;
            }
            const t = setTimeout(() => no(new Error('timeout')), 20000);
            GM_xmlhttpRequest({
                method: 'GET', url, responseType: 'blob', timeout: 18000,
                onload(r) { clearTimeout(t); r.status < 300 && r.response ? ok(r.response) : no(); },
                onerror() { clearTimeout(t); no(); },
                ontimeout() { clearTimeout(t); no(); }
            });
        });
    }
    // === ZIP ===
    async function makeZip(files, onProgress) {
        const enc = new TextEncoder();
        const locals = [], centrals = [];
        let off = 0;
        let packed = 0;
        for (const f of files) {
            const nb = enc.encode(f.name);
            const data = new Uint8Array(await f.blob.arrayBuffer());
            const crc = crc32(data);
            const lh = new Uint8Array(30 + nb.length);
            const lv = new DataView(lh.buffer);
            lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true);
            lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true);
            lv.setUint16(26, nb.length, true); lh.set(nb, 30);
            const ch = new Uint8Array(46 + nb.length);
            const cv = new DataView(ch.buffer);
            cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
            cv.setUint16(8, 0x0800, true); cv.setUint32(16, crc, true);
            cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
            cv.setUint16(28, nb.length, true); cv.setUint32(42, off, true); ch.set(nb, 46);
            locals.push(lh, data); centrals.push(ch);
            off += lh.length + data.length;
            packed += 1;
            if (onProgress) await onProgress(packed);
        }
        const cs = centrals.reduce((s, c) => s + c.length, 0);
        const end = new Uint8Array(22);
        const ev = new DataView(end.buffer);
        ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true);
        ev.setUint16(10, files.length, true); ev.setUint32(12, cs, true); ev.setUint32(16, off, true);
        return new Blob([...locals, ...centrals, end], { type: 'application/zip' });
    }
    const CRC_T = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; } return t; })();
    function crc32(buf) { let c = ~0; for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (~c) >>> 0; }

    // === UI ===
    function showModal(html) {
        const bg = document.createElement('div');
        bg.className = 'ps-modal-bg';
        bg.innerHTML = `<div class="ps-modal-card">${html}<div class="ps-modal-foot"><button class="ps-m-cancel">取消</button></div></div>`;
        document.body.appendChild(bg);
        bg.querySelector('.ps-m-cancel').onclick = () => closeModal(bg);
        bg.addEventListener('click', e => { if (e.target === bg) closeModal(bg); });
        const onK = e => {
            if (bg._psKeydown?.(e)) return;
            if (e.key === 'Escape') closeModal(bg);
        };
        document.addEventListener('keydown', onK);
        bg._k = onK;
        requestAnimationFrame(() => bg.classList.add('ps-show'));
        return bg;
    }
    function closeModal(bg) {
        if (bg._k) document.removeEventListener('keydown', bg._k);
        bg.classList.remove('ps-show');
        setTimeout(() => bg.remove(), 200);
    }
    function prefixModal(cb) {
        const m = showModal(`<h3>下载前缀</h3><p>文件名使用此前缀区分不同批次</p><input id="ps-pf" value="${esc(prefix)}">`);
        const inp = m.querySelector('#ps-pf');
        const ok = document.createElement('button');
        ok.className = 'ps-m-ok'; ok.textContent = '确认';
        ok.onclick = () => { const v = inp.value.trim(); if (v) { prefix = v; save(SK.prefix, v); } closeModal(m); if (cb) cb(); };
        m.querySelector('.ps-modal-foot').appendChild(ok);
        inp.focus(); inp.select();
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok.click(); });
    }
    function linksModal() {
        const m = showModal(`<h3>链接打包</h3><p>粘贴图片链接，一行一个</p><textarea placeholder="https://..."></textarea>`);
        const ta = m.querySelector('textarea');
        const ok = document.createElement('button');
        ok.className = 'ps-m-ok'; ok.textContent = '打包下载';
        ok.onclick = async () => {
            const urls = [...new Set((ta.value.match(/https?:\/\/[^\s,]+/gi) || []).map(u => norm(u)).filter(Boolean))];
            if (!urls.length) { toast('未找到链接'); return; }
            ok.disabled = true; ok.textContent = '处理中...';
            const files = []; let done = 0;
            await parallel(urls.map((u, i) => [i, u]), 6, async ([i, url]) => {
                try { const b = await fetchImg(url); files.push({ name: `links/${String(i + 1).padStart(3, '0')}.${ext(url, b.type)}`, blob: b }); } catch (_) {}
                ok.textContent = `${++done}/${urls.length}`;
            });
            if (files.length) { dlBlob(await makeZip(files), `链接打包-${prefix}.zip`); toast('ZIP 已下载'); closeModal(m); }
            else { ok.textContent = '打包下载'; ok.disabled = false; toast('抓取失败'); }
        };
        m.querySelector('.ps-modal-foot').appendChild(ok);
        ta.focus();
    }

    let toastT;
    function toast(msg) {
        let el = document.querySelector('.ps-toast');
        if (!el) { el = document.createElement('div'); el.className = 'ps-toast'; document.body.appendChild(el); }
        el.textContent = msg; el.classList.add('ps-show');
        clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('ps-show'), 3000);
    }

    // === 通用 ===
    function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
    function dlSingle(url, filename) {
        return new Promise((ok, no) => {
            if (typeof GM_download === 'function') {
                GM_download({
                    url, name: filename, saveAs: false,
                    onload: ok,
                    onerror(e) {
                        console.warn('[XHS] GM_download 失败, 回退 fetch:', e);
                        fetchImg(url).then(b => { dlBlob(b, filename); ok(); }).catch(no);
                    },
                    ontimeout() {
                        console.warn('[XHS] GM_download 超时, 回退 fetch');
                        fetchImg(url).then(b => { dlBlob(b, filename); ok(); }).catch(no);
                    }
                });
            } else {
                fetchImg(url).then(b => { dlBlob(b, filename); ok(); }).catch(no);
            }
        });
    }
    function dlBlob(b, n) { const u = URL.createObjectURL(b); dlUrl(u, n); setTimeout(() => URL.revokeObjectURL(u), 60000); }
    function dlUrl(u, n) { const a = document.createElement('a'); a.href = u; a.download = n; a.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 200); }
    function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
    function ext(url, mime) { if (mime) { const m = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[mime]; if (m) return m; } const x = url.split('?')[0].match(/\.(\w{3,5})$/); return x ? x[1].toLowerCase() : 'jpg'; }
    function hash(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); }
    async function parallel(items, lim, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(lim, items.length) }, async () => { while (i < items.length) { const c = i++; await fn(items[c], c); } })); }

    // === 启动 ===
    function init() {
        loadSel();
        injectCSS();
        createDock();
        setupEvents();
        scan();
        setTimeout(scan, 1000);
        setTimeout(scan, 3000);
        setInterval(() => { scan(); updateDock(); }, 4000);
        save(SK.dock, false);
        console.log(`[XHS Selector] v2.1 ready, ${selected.size} saved`);
    }

    init();
})();
