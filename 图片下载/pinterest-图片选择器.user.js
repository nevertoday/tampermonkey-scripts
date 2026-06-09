// ==UserScript==
// @name         Pinterest 图片选择器 (v10.1)
// @namespace    http://tampermonkey.net/
// @version      10.1
// @description  Pinterest 图片批量选择下载。S 选中鼠标下图片，已选红框持久显示，支持 ZIP 打包。
// @author       You & Claude
// @match        https://pinterest.com/*
// @match        https://www.pinterest.com/*
// @match        https://*.pinterest.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @connect      i.pinimg.com
// @connect      *.pinimg.com
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // === 配置 ===
    const CONTAINER_SEL = '[data-grid-item]';
    const CLOSEUP_SEL = '[data-test-id="closeup-visual-container"]';
    const ALL_SEL = `${CONTAINER_SEL}, ${CLOSEUP_SEL}`;
    const PIN_ID_ATTR = 'data-test-pin-id';
    const SIZE_RE = /\/(236x|474x|564x|736x|originals)\//;
    const SK = { sel: 'ps_selected_v2', prefix: 'ps_prefix', dock: 'ps_dock_collapsed' };

    // === 状态 ===
    let selected = new Map();
    let prefix = load(SK.prefix, 'pinterest');
    let collapsed = false; // 默认展开，让用户第一眼看到操作栏
    let mx = -1, my = -1;
    let busy = false;
    let raf = null;
    const seen = new WeakSet();

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
        if (!url) return '';
        return String(url).trim().split('#')[0].split('?')[0].replace(SIZE_RE, '/originals/');
    }
    function origUrl(img) {
        if (!img) return '';
        const ss = img.getAttribute('srcset');
        if (ss) {
            const ps = ss.split(',').map(s => s.trim().split(/\s+/)).filter(p => p[0]);
            const o = ps.find(p => p[0].includes('/originals/'));
            if (o) return norm(o[0]);
            ps.sort((a, b) => (parseFloat(b[1]) || 0) - (parseFloat(a[1]) || 0));
            if (ps[0]) return norm(ps[0][0]);
        }
        return norm(img.currentSrc || img.src || '');
    }
    function mainImg(c) {
        const imgs = [...c.querySelectorAll('img')].filter(i => {
            if (!/pinimg\.com/i.test(i.currentSrc || i.src || '')) return false;
            const w = i.naturalWidth || i.width || +i.getAttribute('width') || 0;
            const h = i.naturalHeight || i.height || +i.getAttribute('height') || 0;
            return w >= 50 && h >= 50;
        });
        if (!imgs.length) return null;
        return imgs.reduce((b, i) => {
            const a = (i.naturalWidth || i.width || 100) * (i.naturalHeight || i.height || 100);
            const ba = (b.naturalWidth || b.width || 100) * (b.naturalHeight || b.height || 100);
            return a > ba ? i : b;
        });
    }
    function pinId(c) {
        const el = c.querySelector(`[${PIN_ID_ATTR}]`);
        if (el) return el.getAttribute(PIN_ID_ATTR);
        const a = c.querySelector('a[href*="/pin/"]');
        if (a) { const m = a.href.match(/\/pin\/(\d+)/); if (m) return m[1]; }
        if (c.matches && c.matches(CLOSEUP_SEL)) {
            const m = location.href.match(/\/pin\/(\d+)/);
            if (m) return m[1];
        }
        return null;
    }

    // === 选中逻辑 ===
    function getKey(c) {
        const img = mainImg(c);
        if (!img) return null;
        const url = origUrl(img);
        if (!url) return null;
        const pid = pinId(c);
        const ik = 'img:' + url;
        if (pid && selected.has(pid)) return { key: pid, url, sel: true };
        if (selected.has(ik)) return { key: ik, url, sel: true };
        for (const [k, v] of selected) { if (norm(v) === url) return { key: k, url, sel: true }; }
        return { key: pid || ik, url, sel: false };
    }
    function toggle(c) {
        const info = getKey(c);
        if (!info) return;
        info.sel ? selected.delete(info.key) : selected.set(info.key, info.url);
        saveSel(); refreshAll(); updateDock();
    }

    // === DOM ===
    function setup(c) {
        if (seen.has(c)) return;
        if (!mainImg(c)) return;
        seen.add(c);
        c.classList.add('ps-pin');
        if (getComputedStyle(c).position === 'static') c.style.position = 'relative';

        const btn = document.createElement('div');
        btn.className = 'ps-sel-btn';
        btn.addEventListener('pointerdown', e => {
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            toggle(c);
        }, true);
        btn.addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        }, true);
        c.insertBefore(btn, c.firstChild);
        // 图片加载完成后重新刷新选中状态
        const img = mainImg(c);
        if (img && !img.complete) {
            img.addEventListener('load', () => refreshOne(c), { once: true });
        }
        refreshOne(c);
    }
    function refreshOne(c) {
        const info = getKey(c);
        if (!info) return; // 图片未就绪时保留现有视觉状态
        c.classList.toggle('ps-on', info.sel);
        const btn = c.querySelector(':scope > .ps-sel-btn');
        if (btn) btn.classList.toggle('ps-active', info.sel);
    }
    function refreshAll() { document.querySelectorAll('.ps-pin').forEach(refreshOne); }
    function scan() {
        document.querySelectorAll(ALL_SEL).forEach(c => {
            if (seen.has(c)) return;
            const r = c.getBoundingClientRect();
            if (r.bottom < -500 || r.top > innerHeight + 500) return;
            setup(c);
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
        // 优先插入 head，如果失败则插入 documentElement
        try { (document.head || document.documentElement).appendChild(s); } catch (_) { document.documentElement.appendChild(s); }
        console.log('[PS] CSS injected, rules:', s.sheet ? s.sheet.cssRules.length : 'N/A');
    }

    const CSS_TEXT = `
/* 选择按钮 — 默认完全隐藏 */
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
/* 容器 hover 时显示 */
.ps-pin:hover > .ps-sel-btn {
    display: flex !important;
}
.ps-sel-btn:hover {
    transform: scale(1.1) !important;
    box-shadow: 0 2px 10px rgba(0,0,0,0.18) !important;
}
/* 选中态 — 始终显示 */
.ps-sel-btn.ps-active {
    display: flex !important;
    background: #e60023 !important;
    border-color: #fff !important;
    box-shadow: 0 0 0 2px rgba(255,255,255,0.8), 0 2px 10px rgba(230,0,35,0.3) !important;
}
.ps-sel-btn.ps-active::after {
    content: '\\2713' !important;
    font: 600 16px/1 -apple-system, sans-serif !important;
    color: #fff !important;
}
/* 选中容器描边 */
.ps-pin.ps-on {
    outline: 3px solid #e60023 !important;
    outline-offset: -2px !important;
    border-radius: 16px !important;
}

/* ========== Dock 操作栏 ========== */
#ps-dock {
    position: fixed !important; bottom: 16px !important; right: 16px !important;
    z-index: 2147483646 !important;
    font: 13px/1.3 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif !important;
    color: #1a1a1a !important;
    pointer-events: auto !important;
}

/* --- 展开态 --- */
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

/* 计数区 */
#ps-dock .ps-badge {
    display: flex !important;
    align-items: center !important; justify-content: center !important;
    min-width: 40px !important; height: 40px !important;
    border-radius: 50% !important;
    background: rgba(230,0,35,0.06) !important;
    flex-shrink: 0 !important;
}
#ps-dock .ps-num {
    font-size: 17px !important; font-weight: 800 !important;
    color: #e60023 !important; line-height: 1 !important;
}

/* 按钮 */
#ps-dock .ps-expanded button {
    all: unset !important;
    display: inline-flex !important; align-items: center !important; justify-content: center !important;
    height: 32px !important; padding: 0 11px !important; border-radius: 16px !important;
    font-size: 12px !important; font-weight: 600 !important;
    cursor: pointer !important; white-space: nowrap !important;
    user-select: none !important;
    transition: transform 0.12s, background 0.12s !important;
}
#ps-dock .ps-expanded button:hover:not(:disabled) { transform: translateY(-1px) !important; }
#ps-dock .ps-expanded button:active:not(:disabled) { transform: scale(0.96) !important; }
#ps-dock .ps-expanded button:disabled { opacity: 0.3 !important; cursor: default !important; }
#ps-dock .ps-expanded button kbd {
    display: inline-flex !important; align-items: center !important; justify-content: center !important;
    min-width: 14px !important; height: 14px !important;
    padding: 0 3px !important; margin-left: 4px !important;
    border-radius: 3px !important;
    font: 9px/1 ui-monospace, monospace !important;
    opacity: 0.5 !important;
}
.ps-g { background: rgba(0,0,0,0.04) !important; color: #555 !important; }
.ps-g:hover:not(:disabled) { background: rgba(0,0,0,0.09) !important; }
.ps-g kbd { background: rgba(0,0,0,0.06) !important; color: #888 !important; }
.ps-r { background: #e60023 !important; color: #fff !important; box-shadow: 0 2px 8px rgba(230,0,35,0.2) !important; }
.ps-r:hover:not(:disabled) { background: #cc001f !important; }
.ps-r kbd { background: rgba(255,255,255,0.25) !important; color: inherit !important; }
.ps-d { background: #1a1a1a !important; color: #fff !important; }
.ps-d:hover:not(:disabled) { background: #000 !important; }
.ps-d kbd { background: rgba(255,255,255,0.18) !important; color: inherit !important; }

/* 折叠按钮 */
#ps-dock .ps-fold-btn {
    width: 26px !important; height: 26px !important; padding: 0 !important;
    border-radius: 50% !important; background: transparent !important;
    color: #ccc !important; font-size: 15px !important;
    margin-left: 1px !important;
}
#ps-dock .ps-fold-btn:hover:not(:disabled) { color: #888 !important; transform: none !important; background: rgba(0,0,0,0.04) !important; }

/* --- 折叠态 --- */
#ps-dock .ps-pill {
    width: 52px !important; height: 52px !important;
    border-radius: 50% !important;
    background: #fff !important;
    border: 2px solid #e60023 !important;
    box-shadow: 0 2px 12px rgba(230,0,35,0.18), 0 4px 20px rgba(0,0,0,0.08) !important;
    display: flex !important; flex-direction: column !important;
    align-items: center !important; justify-content: center !important;
    cursor: pointer !important;
    transition: transform 0.15s, box-shadow 0.15s !important;
}
#ps-dock .ps-pill:hover { transform: scale(1.08) !important; box-shadow: 0 4px 18px rgba(230,0,35,0.25), 0 6px 28px rgba(0,0,0,0.1) !important; }
#ps-dock .ps-pill:active { transform: scale(0.94) !important; }
#ps-dock .ps-pill-n {
    font-size: 17px !important; font-weight: 800 !important; color: #e60023 !important; line-height: 1 !important;
}
#ps-dock .ps-pill-l {
    font-size: 8px !important; color: #e60023 !important; opacity: 0.6 !important; margin-top: 2px !important;
}
/* 下载中：圆球脉冲动画 */
#ps-dock .ps-pill.ps-busy {
    animation: ps-pulse 1.2s ease-in-out infinite !important;
    border-color: #ff6b00 !important;
}
#ps-dock .ps-pill.ps-busy .ps-pill-n {
    font-size: 13px !important; color: #ff6b00 !important;
}
#ps-dock .ps-pill.ps-busy .ps-pill-l {
    color: #ff6b00 !important;
}
@keyframes ps-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(255,107,0,0.3), 0 2px 12px rgba(255,107,0,0.15); }
    50% { box-shadow: 0 0 0 6px rgba(255,107,0,0), 0 2px 12px rgba(255,107,0,0.25); }
}

/* ========== Toast ========== */
.ps-toast {
    position: fixed !important; bottom: 80px !important; right: 16px !important;
    z-index: 2147483647 !important;
    padding: 10px 16px !important; border-radius: 12px !important;
    background: rgba(20,20,20,0.92) !important; color: #fff !important;
    font: 13px/1.4 -apple-system, sans-serif !important;
    box-shadow: 0 6px 20px rgba(0,0,0,0.18) !important;
    backdrop-filter: blur(10px) !important;
    transform: translateY(6px) !important; opacity: 0 !important;
    transition: opacity 0.15s, transform 0.15s !important;
    pointer-events: none !important;
}
.ps-toast.ps-show { opacity: 1 !important; transform: none !important; }

/* ========== Modal ========== */
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
    transform: translateY(8px) scale(0.97) !important;
    transition: transform 0.18s cubic-bezier(.4,0,.2,1) !important;
}
.ps-modal-bg.ps-show .ps-modal-card { transform: none !important; }
.ps-modal-card h3 { margin: 0 0 8px !important; font-size: 17px !important; font-weight: 700 !important; color: #111 !important; }
.ps-modal-card p { margin: 0 0 14px !important; font-size: 13px !important; color: #777 !important; }
.ps-modal-card input {
    width: 100% !important; box-sizing: border-box !important; height: 40px !important;
    padding: 0 12px !important; border: 1px solid #ddd !important; border-radius: 10px !important;
    font-size: 14px !important; outline: none !important; margin-bottom: 14px !important;
}
.ps-modal-card input:focus { border-color: #0073ff !important; box-shadow: 0 0 0 2px rgba(0,115,255,0.12) !important; }
.ps-modal-card textarea {
    width: 100% !important; box-sizing: border-box !important; min-height: 140px !important;
    padding: 10px 12px !important; border: 1px solid #ddd !important; border-radius: 10px !important;
    font: 12px/1.5 ui-monospace, monospace !important; outline: none !important; resize: vertical !important;
}
.ps-modal-card textarea:focus { border-color: #0073ff !important; }
.ps-modal-foot { display: flex !important; justify-content: flex-end !important; gap: 8px !important; margin-top: 14px !important; }
.ps-modal-foot button {
    all: unset !important; display: inline-flex !important; align-items: center !important;
    height: 36px !important; padding: 0 14px !important; border-radius: 18px !important;
    font-size: 13px !important; font-weight: 650 !important; cursor: pointer !important;
}
.ps-m-cancel { background: #f0f0f0 !important; color: #555 !important; }
.ps-m-ok { background: #e60023 !important; color: #fff !important; }
.ps-dl-list { display: flex !important; flex-direction: column !important; gap: 6px !important; }
.ps-dl-item {
    all: unset !important; display: flex !important; flex-direction: column !important;
    padding: 10px 14px !important; border-radius: 10px !important; cursor: pointer !important;
    background: #f8f8f8 !important; border: 1px solid rgba(0,0,0,0.05) !important;
    font-size: 13px !important; font-weight: 600 !important; color: #222 !important;
}
.ps-dl-item:hover { background: #fff !important; border-color: rgba(230,0,35,0.25) !important; }
.ps-dl-item small { font-size: 11px !important; font-weight: 400 !important; color: #999 !important; margin-top: 2px !important; }
`;

    // === Dock ===
    function createDock() {
        if (document.getElementById('ps-dock')) return;
        const d = document.createElement('div');
        d.id = 'ps-dock';
        // 关键内联样式作为兜底，确保即使 CSS 注入失败也能看到 dock
        d.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483646;font:13px/1.3 -apple-system,sans-serif;color:#1a1a1a;pointer-events:auto;';
        document.body.appendChild(d);
        console.log('[PS] Dock created');
        renderDock();
    }

    function renderDock() {
        const d = document.getElementById('ps-dock');
        if (!d) return;
        const n = selected.size;

        if (collapsed) {
            d.innerHTML = '';
            const pill = document.createElement('div');
            pill.className = 'ps-pill';
            pill.style.cssText = 'width:52px;height:52px;border-radius:50%;background:#fff;border:2px solid #e60023;box-shadow:0 2px 12px rgba(230,0,35,0.18);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;';
            pill.innerHTML = `<span class="ps-pill-n" style="font-size:17px;font-weight:800;color:#e60023;line-height:1">${n}</span><span class="ps-pill-l" style="font-size:8px;color:#e60023;opacity:0.6;margin-top:2px">${busy ? '下载中' : '已选'}</span>`;
            if (busy) pill.classList.add('ps-busy');
            pill.onclick = () => { collapsed = false; save(SK.dock, false); renderDock(); };
            d.appendChild(pill);
        } else {
            d.innerHTML = '';
            const bar = document.createElement('div');
            bar.className = 'ps-expanded';
            bar.style.cssText = 'display:flex;align-items:center;gap:5px;padding:5px 6px 5px 5px;border-radius:26px;background:rgba(255,255,255,0.92);border:1px solid rgba(0,0,0,0.06);box-shadow:0 4px 24px rgba(0,0,0,0.08);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);';
            bar.innerHTML = `
                    <div class="ps-badge" style="display:flex;align-items:center;justify-content:center;min-width:40px;height:40px;border-radius:50%;background:rgba(230,0,35,0.06)"><span class="ps-num" style="font-size:17px;font-weight:800;color:#e60023">${n}</span></div>
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
        // 快速更新数字和按钮状态，不重建 DOM
        const num = d.querySelector('.ps-num') || d.querySelector('.ps-pill-n');
        if (num) num.textContent = n;
        const dlBtn = d.querySelector('[data-a="dl"]');
        const dlNewBtn = d.querySelector('[data-a="dl-new"]');
        if (dlBtn) dlBtn.disabled = n === 0 || busy;
        if (dlNewBtn) dlNewBtn.disabled = n === 0 || busy;
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
                if (c) { e.preventDefault(); e.stopPropagation(); setup(c); toggle(c); }
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

    // === 选择操作 ===
    function selAll() {
        let n = 0;
        document.querySelectorAll(ALL_SEL).forEach(c => {
            const r = c.getBoundingClientRect();
            if (r.bottom <= 0 || r.top >= innerHeight) return;
            setup(c);
            const info = getKey(c);
            if (!info || info.sel) return;
            selected.set(info.key, info.url); n++;
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
                <button class="ps-dl-item" data-m="list">链接列表<small>保存全部原图 URL 到 .txt</small></button>
                <button class="ps-dl-item" data-m="direct">逐张下载<small>直接保存到本地</small></button>
                <button class="ps-dl-item" data-m="zip">ZIP 压缩包<small>抓取图片打包下载</small></button>
            </div>`);
        modal.querySelectorAll('[data-m]').forEach(b => {
            b.onclick = () => { closeModal(modal); execDl(b.dataset.m, isNew); };
        });
    }

    async function execDl(mode, isNew) {
        const entries = [...selected.entries()];
        const h = hash(entries.map(e => e[1]).join('\n')).slice(0, 8);
        const name = `${prefix}-${h}`;

        if (mode === 'list') {
            dlBlob(new Blob([entries.map(e => e[1]).join('\n')], { type: 'text/plain' }), `${name}.txt`);
            clearSel(); toast('链接已下载');
        } else if (mode === 'direct') {
            busy = true; renderDock();
            let ok = 0, fail = 0;
            for (let i = 0; i < entries.length; i++) {
                const url = entries[i][1];
                const fn = `${name}-${String(i + 1).padStart(3, '0')}.${ext(url)}`;
                try {
                    await dlSingle(url, fn);
                    ok++;
                } catch (e) {
                    fail++;
                    console.warn('[PS] 下载失败:', fn, e);
                }
                setProgress(isNew, `${i + 1}/${entries.length}`);
                if (i < entries.length - 1) await delay(600);
            }
            busy = false; clearSel(); renderDock();
            toast(fail ? `完成 ${ok} 张，失败 ${fail} 张` : '下载完成');
        } else if (mode === 'zip') {
            busy = true; renderDock();
            let done = 0;
            const files = [];
            await parallel(entries, 4, async ([, url], i) => {
                try {
                    const b = await fetchImg(url);
                    files.push({ name: `${name}/${String(i + 1).padStart(3, '0')}.${ext(url, b.type)}`, blob: b });
                } catch (_) {}
                setProgress(isNew, `${++done}/${entries.length}`);
            });
            if (files.length) {
                setProgress(isNew, '打包中');
                dlBlob(await makeZip(files), `${name}.zip`);
                busy = false; clearSel(); renderDock(); toast('ZIP 已下载');
            } else {
                busy = false; renderDock(); toast('无可用图片');
            }
        }
    }

    function setProgress(isNew, txt) {
        const d = document.getElementById('ps-dock');
        if (!d) return;
        // 展开态：更新按钮文字
        const b = d.querySelector(`[data-a="${isNew ? 'dl-new' : 'dl'}"]`);
        if (b) b.textContent = txt;
        // 折叠态：更新圆球显示进度 + 脉冲动画
        const pill = d.querySelector('.ps-pill');
        const pillN = d.querySelector('.ps-pill-n');
        const pillL = d.querySelector('.ps-pill-l');
        if (pill) pill.classList.add('ps-busy');
        if (pillN) pillN.textContent = txt;
        if (pillL) pillL.textContent = '下载中';
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
    async function makeZip(files) {
        const enc = new TextEncoder();
        const locals = [], centrals = [];
        let off = 0;
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

    // === UI 工具 ===
    function showModal(html) {
        const bg = document.createElement('div');
        bg.className = 'ps-modal-bg';
        bg.innerHTML = `<div class="ps-modal-card">${html}<div class="ps-modal-foot"><button class="ps-m-cancel">取消</button></div></div>`;
        document.body.appendChild(bg);
        bg.querySelector('.ps-m-cancel').onclick = () => closeModal(bg);
        bg.addEventListener('click', e => { if (e.target === bg) closeModal(bg); });
        const onK = e => { if (e.key === 'Escape') closeModal(bg); };
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
        const m = showModal(`<h3>链接打包</h3><p>粘贴图片链接，一行一个</p><textarea placeholder="https://i.pinimg.com/..."></textarea>`);
        const ta = m.querySelector('textarea');
        const ok = document.createElement('button');
        ok.className = 'ps-m-ok'; ok.textContent = '打包下载';
        ok.onclick = async () => {
            const urls = [...new Set((ta.value.match(/https?:\/\/[^\s,]+/gi) || []).map(u => norm(u)).filter(Boolean))];
            if (!urls.length) { toast('未找到链接'); return; }
            ok.disabled = true; ok.textContent = '处理中...';
            const files = []; let done = 0;
            await parallel(urls.map((u, i) => [i, u]), 4, async ([i, url]) => {
                try { const b = await fetchImg(url); files.push({ name: `links/${String(i + 1).padStart(3, '0')}.${ext(url, b.type)}`, blob: b }); } catch (_) {}
                ok.textContent = `${++done}/${urls.length}`;
            });
            if (files.length) { dlBlob(await makeZip(files), `links-${prefix}.zip`); toast('ZIP 已下载'); closeModal(m); }
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
            // 方法1: GM_download（Tampermonkey 原生跨域下载）
            if (typeof GM_download === 'function') {
                GM_download({
                    url, name: filename, saveAs: false,
                    onload: ok,
                    onerror(e) {
                        console.warn('[PS] GM_download 失败, 回退 fetch:', e);
                        // 方法2: 回退到 fetch + blob
                        fetchImg(url).then(b => { dlBlob(b, filename); ok(); }).catch(no);
                    },
                    ontimeout() {
                        console.warn('[PS] GM_download 超时, 回退 fetch');
                        fetchImg(url).then(b => { dlBlob(b, filename); ok(); }).catch(no);
                    }
                });
            } else {
                // 无 GM_download: 直接 fetch + blob
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

        // 清除旧版本遗留的折叠状态，确保新安装后默认展开
        save(SK.dock, false);

        console.log(`[Pinterest Selector] v10.1 ready, ${selected.size} saved, dock visible`);
    }

    init();
})();
