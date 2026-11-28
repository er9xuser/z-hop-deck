// Z-Hop Deck frontend - vanilla ES modules, no build step.
/* ============================================================ utils */
const APP_VERSION = document.querySelector('meta[name=app-version]')?.content || '?';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const h = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const store = {
  get: (k, d) => { try { const v = localStorage.getItem('ld.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('ld.' + k, JSON.stringify(v)); } catch { } },
};

const fmt = {
  bytes(b) { if (b == null) return '–'; const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; while (b >= 1024 && i < 4) { b /= 1024; i++; } return `${b.toFixed(i && b < 10 ? 1 : 0)} ${u[i]}`; },
  dur(s) { if (!s) return '–'; s = Math.round(s); const d = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); if (d) return `${d}d ${hh}h`; if (hh) return `${hh}h ${m}m`; return `${m || 1}m`; },
  g(g) { if (g == null) return '–'; return g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${g >= 100 ? Math.round(g) : (+g).toFixed(1)} g`; },
  mm(v) { return v == null ? '–' : (+v).toFixed(v >= 100 ? 0 : 1); },
  date(s) { if (!s) return '–'; const d = new Date(s.replace(' ', 'T') + (s.includes('Z') || s.includes('+') ? '' : 'Z')); return isNaN(d) ? s : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); },
  dt(s) { if (!s) return '–'; const d = new Date(s.replace(' ', 'T') + 'Z'); return isNaN(d) ? s : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); },
  money(v) { return `${(+v || 0).toFixed(2)} ${S.settings.currency || '€'}`; },
  num(v, d = 0) { return v == null ? '–' : (+v).toLocaleString(undefined, { maximumFractionDigits: d }); },
};

/* ============================================================ icons */
const I = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8Z"/></svg>',
  expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
  lib: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 3 7.5 12 12l9-4.5L12 3Z"/><path d="m3 12 9 4.5 9-4.5"/><path d="m3 16.5 9 4.5 9-4.5"/></svg>',
  coll: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  queue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M4 12h10M4 18h7"/><path d="m16 15 4 3-4 3z" fill="currentColor"/></svg>',
  log: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/></svg>',
  spool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6" opacity=".5"/></svg>',
  printer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 8h18"/><path d="M10 8v4l2 2 2-2V8"/><path d="M7 18h10"/></svg>',
  dupe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>',
  stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z"/></svg>',
  starO: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  cube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/></svg>',
  wire: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10M3 17l9-5 9 5M12 2v10" opacity=".6"/></svg>',
  rotate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
  bed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M2 16 12 21l10-5-10-5z"/><path d="M7 13.5 17 18.5M17 13.5 7 18.5" opacity=".5"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8Z"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  dice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="16" cy="16" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="16" cy="8" r="1.3" fill="currentColor"/><circle cx="8" cy="16" r="1.3" fill="currentColor"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
  sort: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M21 8l-4-4-4 4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  gcode: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 18h18M5 14h14M7 10h10M9 6h6"/></svg>',
  zip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M10 6h1M10 9h1M10 12h1M9 15h3v3H9z"/></svg>',
  cad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M3 21h18M5 21V9l7-6 7 6v12"/><path d="M9 21v-6h6v6"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8Z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></svg>',
  stack: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="8" width="13" height="13" rx="2"/><path d="M7 8V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-3"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  move: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M10 13h6M13 10l3 3-3 3" stroke-linecap="round"/></svg>',
};
const KIND_ICON = { mesh: I.cube, sliced: I.gcode, gcode: I.gcode, cad: I.cad, archive: I.zip, other: I.cube };
const STATUS = {
  none: { label: 'Unprinted', cls: 'st-none' }, want: { label: 'Want to print', cls: 'st-want' }, queued: { label: 'Queued', cls: 'st-queued' },
  printing: { label: 'Printing', cls: 'st-printing' }, printed: { label: 'Printed', cls: 'st-printed' }, failed: { label: 'Failed', cls: 'st-failed' },
};
const badgeCls = ext => ({ stl: 'stl', '3mf': 'mf', obj: 'obj', gcode: 'gcode', gco: 'gcode', g: 'gcode', bgcode: 'gcode', zip: 'zip' }[ext] || 'cad');

/* ============================================================ api */
async function api(path, { method = 'GET', body, form } = {}) {
  const opt = { method, credentials: 'same-origin', headers: {} };
  if (form) opt.body = form;
  else if (body !== undefined) { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
  const r = await fetch('/api' + path, opt);
  if (r.status === 401) { showLogin(); throw new Error('Login required'); }
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error((data && data.error) || r.statusText);
  return data;
}

/* ============================================================ ui primitives */
function toast(msg, type = '') {
  const t = h(`<div class="toast ${type}">${esc(msg)}</div>`);
  $('#toasts').append(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, type === 'err' ? 6000 : 3200);
}
const fail = e => toast(e.message || String(e), 'err');

function modal({ title, body = '', buttons = [], size = '', onClose } = {}) {
  const bg = h(`<div class="modal-bg"><div class="modal ${size}"><header><h2>${esc(title)}</h2><button class="icon-btn" data-x>${I.x}</button></header><div class="content"></div>${buttons.length ? '<footer></footer>' : ''}</div></div>`);
  const content = $('.content', bg);
  if (typeof body === 'string') content.innerHTML = body; else content.append(body);
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey, true); onClose?.(); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  bg.addEventListener('mousedown', e => { if (e.target === bg) close(); });
  $('[data-x]', bg).onclick = close;
  const foot = $('footer', bg);
  for (const b of buttons) {
    const btn = h(`<button class="btn ${b.cls || ''}">${b.label}</button>`);
    btn.onclick = async () => {
      if (!b.onClick) return close();
      btn.disabled = true;
      try { const r = await b.onClick({ el: content, close }); if (r !== false) close(); }
      catch (e) { fail(e); } finally { btn.disabled = false; }
    };
    foot.append(btn);
  }
  $('#overlay-root').append(bg);
  setTimeout(() => $('input:not([type=checkbox]):not([type=color]), textarea, select', content)?.focus(), 30);
  return { el: content, close, root: bg };
}
function confirmDlg(text, { ok = 'Confirm', danger = false } = {}) {
  return new Promise(res => {
    let done = false;
    modal({ title: 'Please confirm', body: `<p style="margin:0">${text}</p>`, onClose: () => !done && res(false),
      buttons: [{ label: 'Cancel', onClick: () => { done = true; res(false); } }, { label: ok, cls: danger ? 'primary danger' : 'primary', onClick: () => { done = true; res(true); } }] });
  });
}
function promptDlg(title, value = '', placeholder = '') {
  return new Promise(res => {
    let done = false;
    const m = modal({ title, body: `<input type="text" value="${esc(value)}" placeholder="${esc(placeholder)}">`, onClose: () => !done && res(null),
      buttons: [{ label: 'Cancel', onClick: () => { done = true; res(null); } }, { label: 'OK', cls: 'primary', onClick: ({ el }) => { done = true; res($('input', el).value.trim()); } }] });
    $('input', m.el).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('.btn.primary', m.root).click(); } });
  });
}
let openMenuEl = null;
function menu(x, y, items) {
  openMenuEl?.remove();
  const m = h('<div class="menu"></div>');
  for (const it of items) {
    if (it === '-') { m.append(h('<div class="ms"></div>')); continue; }
    if (it.header) { m.append(h(`<div class="mh">${esc(it.header)}</div>`)); continue; }
    const el = h(`<div class="mi ${it.danger ? 'danger' : ''}">${it.icon || ''}<span>${it.html || esc(it.label)}</span></div>`);
    el.onclick = e => { e.stopPropagation(); m.remove(); openMenuEl = null; it.onClick?.(); };
    m.append(el);
  }
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
  openMenuEl = m;
  setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off); } }), 0);
}
function menuAt(btn, items) { const r = btn.getBoundingClientRect(); menu(r.left, r.bottom + 6, items); }

function thumbHtml(f, cls = '') {
  if (f.thumb > 0) return `<img src="/api/files/${f.id}/thumb?v=${f.thumb_v}" loading="lazy" decoding="async" alt="" class="${f.thumb === 4 ? 'photo' : ''} ${cls}">`;
  return `<div class="ph">${KIND_ICON[f.kind] || I.cube}<span>${esc(f.ext)}</span></div>`;
}
function collChips(f, max = 2) {
  const cs = f.collections || [];
  if (!cs.length) return '';
  const ic = I.coll.replace('<svg', '<svg width="11" height="11"');
  return `<div class="colls-mini">${cs.slice(0, max).map(c => `<span class="coll-chip" data-coll-f="${c.id}" title="Collection: ${esc(c.name)}" style="--cc:${esc(c.color || 'var(--accent)')}">${ic}${esc(c.name)}</span>`).join('')}${cs.length > max ? `<span class="coll-chip more" title="${esc(cs.slice(max).map(c => c.name).join(', '))}">+${cs.length - max}</span>` : ''}</div>`;
}
function tagChip(t, extra = '') { return `<span class="tag" data-tag="${t.id}" ${extra}><i style="background:${esc(t.color)}"></i>${esc(t.name)}</span>`; }

/* ============================================================ state */
const S = {
  me: null, settings: {}, tags: [], collections: [], printers: [], spools: [], folders: [],
  f: Object.assign({ q: '', kind: '', status: '', tag: [], collection: '', favorite: false, root: '', folder: null, printer: '', untagged: false, dupes: false, tab: '', added_days: 0 },
    { sort: store.get('sort', 'added'), order: store.get('order', 'desc') }),
  view: store.get('view', 'grid'), cardW: store.get('cardW', 210), group: store.get('group', true), bundles: [],
  items: [], total: 0, page: 0, loading: false, done: false, gen: 0,
  selected: new Set(), lastIdx: null, route: '', openFolders: new Set(store.get('openFolders', [])),
  scan: {}, queueCount: 0,
};
/* own background image (Settings → Appearance), stored on the server as data/background.jpg */
const BG_VER = document.querySelector('meta[name=bg-version]')?.content || '';
function applyBg(ver = BG_VER) {
  const root = document.documentElement;
  if (ver) root.style.setProperty('--bg-photo', `url("/background?v=${ver}")`); else root.style.removeProperty('--bg-photo');
  let bg = store.get('bg', ver ? 'photo' : 'pattern');
  if (bg === 'photo' && !ver) bg = 'pattern';
  root.dataset.bg = bg;
  root.dataset.hasBg = ver ? '1' : '';
}
applyBg();
document.documentElement.dataset.theme = store.get('theme', matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
document.documentElement.style.setProperty('--card-w', S.cardW + 'px');

async function loadMeta() {
  const [tags, collections, printers, spools, settings, folders, queue, bundles] = await Promise.all([
    api('/tags'), api('/collections'), api('/printers'), api('/spools'), api('/settings'), api('/folders'), api('/queue'), api('/bundles')]);
  Object.assign(S, { tags, collections, printers, spools, settings, folders, bundles, queueCount: queue.reduce((a, q) => a + q.copies, 0) });
}
const refreshMeta = debounce(async () => { try { await loadMeta(); renderNav(); if (S.route === 'library') { renderSideLibrary(); renderLibHero(); } } catch { } }, 150);

/* ============================================================ login */
function showLogin() {
  if ($('.login')) return;
  const el = h(`<div class="login"><form><h1>${$('.brand svg').outerHTML}Z-Hop Deck</h1><p class="muted" style="margin:0">Enter the password to open your library.</p>
    <input type="password" placeholder="Password" autocomplete="current-password" required><button class="btn primary" type="submit">Unlock</button><div class="err small" style="color:var(--red)"></div></form></div>`);
  document.body.append(el);
  $('input', el).focus();
  $('form', el).onsubmit = async e => {
    e.preventDefault();
    try { await api('/login', { method: 'POST', body: { password: $('input', el).value } }); el.remove(); boot(); }
    catch (err) { $('.err', el).textContent = err.message; }
  };
}

/* link to Spoolman's web UI (may differ from the address the server uses, e.g. https via NPMplus) */
const spoolmanWeb = () => (S.settings.spoolman_web_url || S.settings.spoolman_url || '').trim().replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'http://');

/* ============================================================ user / logout */
async function logout() {
  const url = S.me?.logout_url;
  if (S.me?.session) { try { await api('/logout', { method: 'POST' }); } catch { } }
  if (S.me?.user && url) { location.href = url; return; }   // single sign-on: end the Authelia session
  if (S.me?.session) { location.reload(); return; }
  if (url) location.href = url;
}
function renderUserBox() {
  const box = $('#user-box'); if (!box) return;
  const me = S.me || {};
  const canLogout = me.session || (me.user && me.logout_url);
  if (!me.user && !canLogout && !me.trusted) { box.innerHTML = ''; return; }
  const name = me.user || (me.session ? 'Signed in' : me.trusted ? `Trusted network (${me.client_ip})` : '');
  box.innerHTML = `<div class="user-box"><span class="avatar">${esc((me.user || '•').slice(0, 1).toUpperCase())}</span>
    <span class="nm" title="${me.user ? 'Signed in through your login proxy' : 'Signed in with the app password'}">${esc(name)}</span>
    ${canLogout ? `<button class="btn ghost sm" id="logout-btn" title="Log out">Log out</button>` : ''}</div>`;
  $('#logout-btn')?.addEventListener('click', logout);
}

/* ============================================================ navigation */
const NAV = [
  ['home', 'Home', I.home], ['library', 'Library', I.lib], ['collections', 'Collections', I.coll], ['queue', 'Print queue', I.queue], ['prints', 'Print log', I.log],
  ['filament', 'Filament', I.spool], ['printers', 'Printers', I.printer], ['duplicates', 'Duplicates', I.dupe], ['stats', 'Statistics', I.stats], ['settings', 'Settings', I.gear],
];
function renderNav() {
  $('#nav').innerHTML = NAV.map(([k, l, ic]) => {
    const c = k === 'queue' && S.queueCount ? `<span class="count">${S.queueCount}</span>` : k === 'library' && S.libTotal != null ? `<span class="count">${fmt.num(S.libTotal)}</span>` : '';
    return `<a class="nav-item ${S.route === k ? 'active' : ''}" href="#/${k}">${ic}<span>${l}</span>${c}</a>`;
  }).join('');
}
$('#sidebar-close').onclick = () => $('#sidebar').classList.remove('open');

/* "Library" in the menu (or the logo) always goes to the start page: all models / files, no folder or filters */
function openCollection(cid) {
  S.folderStack = []; S.prevF = null; S.selected.clear();
  S.f = { ...S.f, collection: String(cid), root: '', folder: null, q: '', tag: [], kind: '', status: '', favorite: false, untagged: false, dupes: false };
  if ($('#q')) $('#q').value = '';
  if (S.route !== 'library') { location.hash = '#/library'; return; }
  renderLibraryTop(); applyFilters();
}
function openModelFolder(b) {
  S.folderStack = []; S.prevF = null; S.selected.clear();
  S.f = { ...S.f, q: '', kind: '', status: '', tag: [], collection: '', favorite: false, printer: '', untagged: false, dupes: false, tab: '', added_days: 0, root: b.root, folder: b.folder };
  const parts = b.folder.split('/');
  for (let i = 1; i <= parts.length; i++) S.openFolders.add(b.root + '|' + parts.slice(0, i).join('/'));
  if (S.route !== 'library') { location.hash = '#/library'; return; }
  renderLibraryTop(); applyFilters();
}
function goLibraryHome() {
  S.folderStack = [];
  S.f = { ...S.f, q: '', kind: '', status: '', tag: [], collection: '', favorite: false, root: '', folder: null, printer: '', untagged: false, dupes: false, tab: '', added_days: 0 };
  S.prevF = null;
  closePanel();
  S.selected.clear();
  $('#sidebar').classList.remove('open');
  if (S.route !== 'library') { location.hash = '#/library'; return; }  // route() renders the start page
  if (detailState || !/^#?\/?(library)?$/.test(location.hash)) location.hash = '#/library';
  renderLibraryTop();
  $('#view').scrollTop = 0;
  applyFilters();
}
$('#nav').addEventListener('click', e => {
  const a = e.target.closest('a[href="#/library"]');
  if (a) { e.preventDefault(); goLibraryHome(); }
});
$('.brand > span').style.cursor = 'pointer';
$('.brand > span').addEventListener('click', () => { $('#sidebar').classList.remove('open'); location.hash = '#/home'; });
$('#nav').addEventListener('click', () => $('#sidebar').classList.remove('open'));

function topbar(title, extra = '') {
  $('#topbar').innerHTML = `<button class="icon-btn" id="burger">${I.menu}</button><h1>${esc(title)}</h1>${extra}<span class="ver hide-m" title="Z-Hop Deck ${esc(APP_VERSION)}">v${esc(APP_VERSION)}</span>`;
  $('#burger').onclick = () => $('#sidebar').classList.add('open');
}

const PAGES = {};
let detailState = null;

async function route() {
  const hash = location.hash.replace(/^#\/?/, '') || 'home';
  const [name, arg] = hash.split('/');
  if (name === 'file' || name === 'model') {
    if (!S.route) { S.route = 'library'; renderNav(); await PAGES.library(); }
    name === 'file' ? openDetail(+arg) : openBundle(+arg);
    return;
  }
  closeDetail(true);
  const page = PAGES[name] ? name : 'home';
  if (page !== 'library') closePanel();
  if (page !== 'home') { clearTimeout(homePoll); disposeLive(); }  // live viewers only live on Home
  if (page === S.route && page === 'library' && $('#cards-host')) return; // returning from detail - keep scroll
  S.route = page;
  renderNav();
  $('#side-extra').innerHTML = '';
  $('#selection-bar').classList.add('hidden');
  $('#view').scrollTop = 0;
  $('#view').onclick = null;
  try { await PAGES[page](arg); } catch (e) { fail(e); }
}
window.addEventListener('hashchange', route);

/* ============================================================ library */
const bundleAt = (root, folder) => S.bundles.find(b => b.root === root && (folder === b.path || folder.startsWith(b.path + '/')));
const insideBundle = () => S.f.root && S.f.folder != null && !!bundleAt(S.f.root, S.f.folder);
const idsOf = it => it.type === 'bundle' ? it.part_ids : [it.id];
const isSel = it => idsOf(it).length > 0 && idsOf(it).every(id => S.selected.has(id));
const itemHash = it => (it.type === 'bundle' ? '#/model/' : '#/file/') + it.id;
function filterParams(extra = {}) {
  const f = S.f, p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.kind) p.set('kind', f.kind);
  if (f.status) p.set('status', f.status);
  if (f.tag.length) p.set('tag', f.tag.join(','));
  if (f.collection) p.set('collection', f.collection);
  if (f.favorite || f.tab === 'fav') p.set('favorite', '1');
  if (f.tab === 'printed' && !f.status) p.set('status', 'printed');
  if (f.tab === 'unprinted' && !f.status) p.set('status', 'none,want');
  if (f.tab === 'queue') p.set('in_queue', '1');
  if (f.added_days) p.set('added_days', f.added_days);
  if (f.untagged) p.set('untagged', '1');
  if (f.dupes) p.set('dupes', '1');
  if (f.printer) p.set('printer', f.printer);
  if (f.root && f.folder != null) { p.set('root', f.root); p.set('folder', f.folder); }
  p.set('sort', f.sort); p.set('order', f.order);
  if (S.group && !insideBundle()) p.set('group', '1');
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p;
}

PAGES.library = async () => {
  renderLibraryTop();
  $('#view').innerHTML = `<div id="lib-hero"></div><div id="model-head"></div><div id="folder-docs"></div><div class="filterbar" id="filterbar"></div><div class="result-line" id="result-line"></div><div id="cards-host"></div>`;
  renderSideLibrary();
  renderFilterbar();
  renderLibHero();
  renderModelHead();
  renderFolderDocs();
  await reloadList();
};

function libTitle() {
  if (S.f.collection) return S.collections.find(c => c.id == S.f.collection)?.name || 'Collection';
  if (S.f.folder != null && S.f.root) return S.f.folder ? S.f.folder.split('/').pop() : (S.folders.find(r => r.root === S.f.root)?.name || 'Library');
  if (S.f.favorite) return 'Favorites';
  return 'Library';
}

function renderLibraryTop() {
  const sorts = [['added', 'Date added'], ['modified', 'File date'], ['name', 'Name'], ['folder', 'Folder'], ['size', 'File size'], ['rating', 'Rating'], ['print_time', 'Print time'], ['height', 'Height'], ['volume', 'Volume'], ['random', 'Shuffle']];
  topbar(libTitle(), `
    <div class="search">${I.search}<input id="q" type="search" placeholder="Search name, folder, tags…  (tag:  ext:  status:  material:)" value="${esc(S.f.q)}" autocomplete="off"><kbd class="hide-m">/</kbd></div>
    <select class="compact hide-m" id="sort" title="Sort">${sorts.map(([k, l]) => `<option value="${k}" ${S.f.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <button class="icon-btn hide-m" id="order" title="Toggle order" style="transform:${S.f.order === 'asc' ? 'scaleY(-1)' : 'none'}">${I.sort}</button>
    <button class="icon-btn hide-m ${S.group ? 'on' : ''}" id="grp" title="Show model folders as one card">${I.stack}</button>
    <div class="seg hide-m"><button data-v="grid" class="${S.view === 'grid' ? 'on' : ''}" title="Grid">${I.grid}</button><button data-v="list" class="${S.view === 'list' ? 'on' : ''}" title="List">${I.list}</button></div>
    <input type="range" id="cardw" min="140" max="340" step="10" value="${S.cardW}" class="hide-m" title="Card size" style="width:90px">
    <button class="btn primary" id="upload-btn">${I.upload}<span class="hide-m">Upload</span></button>`);
  const q = $('#q');
  q.oninput = debounce(() => { S.f.q = q.value.trim(); reloadList(); }, 250);
  $('#sort').onchange = e => { S.f.sort = e.target.value; store.set('sort', S.f.sort); reloadList(); };
  $('#order').onclick = () => { S.f.order = S.f.order === 'asc' ? 'desc' : 'asc'; store.set('order', S.f.order); renderLibraryTop(); reloadList(); };
  $$('.seg button', $('#topbar')).forEach(b => b.onclick = () => { S.view = b.dataset.v; store.set('view', S.view); renderLibraryTop(); renderList(true); });
  $('#cardw').oninput = e => { S.cardW = +e.target.value; document.documentElement.style.setProperty('--card-w', S.cardW + 'px'); store.set('cardW', S.cardW); };
  $('#upload-btn').onclick = () => openUpload();
  $('#grp').onclick = () => { S.group = !S.group; store.set('group', S.group); renderLibraryTop(); reloadList(); toast(S.group ? 'Model folders shown as one card' : 'Showing every file separately'); };
}

function renderFilterbar() {
  const f = S.f;
  const kinds = [['', 'All'], ['mesh', 'Models'], ['sliced,gcode', 'Sliced'], ['cad', 'CAD'], ['archive', 'Archives']];
  let html = kinds.map(([k, l]) => `<span class="chip ${f.kind === k ? 'on' : ''}" data-kind="${k}">${l}</span>`).join('');
  html += '<span style="width:6px"></span>';
  if (f.favorite) html += `<span class="chip on" data-fav>${I.star.replace('<svg', '<svg width="13" height="13"')} Favorites <span class="x">✕</span></span>`;
  if (f.added_days) html += `<span class="chip on" data-rmnew>Added in the last ${f.added_days} days <span class="x">✕</span></span>`;
  const st = f.status ? STATUS[f.status] : null;
  html += `<span class="chip ${st ? 'on' : ''}" data-statusmenu>${st ? `<span class="stdot ${st.cls}"></span>${st.label}` : 'Status'} ▾</span>`;
  const pr = S.printers.find(p => p.id == f.printer);
  if (S.printers.length) html += `<span class="chip ${pr ? 'on' : ''}" data-printermenu>${pr ? 'Fits ' + esc(pr.name) : 'Fits printer'} ▾</span>`;
  html += `<span class="chip ${f.untagged ? 'on' : ''}" data-untagged>Untagged</span>`;
  if (f.dupes) html += `<span class="chip on" data-dupes>Duplicates <span class="x">✕</span></span>`;
  for (const tid of f.tag) { const t = S.tags.find(x => x.id == tid); if (t) html += `<span class="chip on" data-rmtag="${t.id}"><span class="dot" style="background:${esc(t.color)}"></span>${esc(t.name)} <span class="x">✕</span></span>`; }
  if (f.collection) html += `<span class="chip on" data-rmcoll>${I.coll.replace('<svg', '<svg width="13" height="13"')} ${esc(libTitle())} <span class="x">✕</span></span>`;
  if (f.folder != null && f.root) html += `<span class="chip on" data-rmfolder>${I.folder.replace('<svg', '<svg width="13" height="13"')} /${esc(f.folder)} <span class="x">✕</span></span>`;
  const bar = $('#filterbar');
  bar.innerHTML = html;
  bar.onclick = e => {
    const c = e.target.closest('.chip'); if (!c) return;
    if (c.dataset.kind !== undefined) f.kind = c.dataset.kind;
    else if (c.hasAttribute('data-fav')) f.favorite = !f.favorite;
    else if (c.hasAttribute('data-untagged')) f.untagged = !f.untagged;
    else if (c.hasAttribute('data-rmnew')) f.added_days = 0;
    else if (c.hasAttribute('data-dupes')) f.dupes = false;
    else if (c.dataset.rmtag) f.tag = f.tag.filter(t => t != c.dataset.rmtag);
    else if (c.hasAttribute('data-rmcoll')) f.collection = '';
    else if (c.hasAttribute('data-rmfolder')) { f.folder = null; f.root = ''; }
    else if (c.hasAttribute('data-statusmenu')) {
      return menuAt(c, [{ label: 'Any status', onClick: () => { f.status = ''; applyFilters(); } }, '-',
        ...Object.entries(STATUS).map(([k, s]) => ({ html: `<span class="stdot ${s.cls}"></span> ${s.label}`, onClick: () => { f.status = k; applyFilters(); } }))]);
    } else if (c.hasAttribute('data-printermenu')) {
      return menuAt(c, [{ label: 'Any printer', onClick: () => { f.printer = ''; applyFilters(); } }, '-',
        ...S.printers.map(p => ({ label: `${p.name}  (${p.bed_x}×${p.bed_y}×${p.bed_z})`, onClick: () => { f.printer = p.id; applyFilters(); } }))]);
    }
    applyFilters();
  };
}
function applyFilters() { renderFilterbar(); renderLibHero(); renderSideLibrary(); renderModelHead(); renderFolderDocs(); $('#topbar h1') && ($('#topbar h1').textContent = libTitle()); return reloadList(); }

/* ---------------- model folder: clicking a model card opens its folder as thumbnails */
function enterBundle(b) {
  S.folderStack = [];
  S.prevF = { f: { ...S.f, tag: [...S.f.tag] }, scroll: $('#view').scrollTop };
  S.f = { ...S.f, root: b.root, folder: b.folder, collection: '', q: '', tag: [], kind: '', status: '', favorite: false, untagged: false, dupes: false };
  const parts = b.folder.split('/');
  for (let i = 1; i <= parts.length; i++) S.openFolders.add(b.root + '|' + parts.slice(0, i).join('/'));
  $('#view').scrollTop = 0;
  if ($('#q')) $('#q').value = '';
  applyFilters();
}
async function leaveBundle() {
  if (S.folderStack?.length) {  // inside a subfolder (e.g. images/): go back up
    const up = S.folderStack.pop();
    S.f = { ...S.f, folder: up.folder };
    await applyFilters();
    requestAnimationFrame(() => { $('#view').scrollTop = up.scroll; });
    return;
  }
  const prev = S.prevF; S.prevF = null;
  S.f = prev ? prev.f : { ...S.f, root: '', folder: null };
  if ($('#q')) $('#q').value = S.f.q || '';
  await applyFilters();
  if (prev) requestAnimationFrame(() => { $('#view').scrollTop = prev.scroll; });
}
/* ---------------- images & documents of the open folder, shown as cards after the models */
async function renderFolderDocs() {
  S.folderAtt = []; S.folderSubs = [];
  const host = $('#folder-docs'); if (host) host.innerHTML = '';
  if (!S.f.root || S.f.folder == null) return;
  const key = S.f.root + '|' + S.f.folder;
  let res;
  try { res = await api(`/folders/attachments?root=${encodeURIComponent(S.f.root)}&folder=${encodeURIComponent(S.f.folder)}`); } catch { return; }
  if (key !== S.f.root + '|' + S.f.folder) return;
  S.folderAtt = res.files || []; S.folderSubs = res.folders || [];
  appendAttachmentCards();
}
const attUrl = (a, thumb) => `/api/folders/${thumb ? 'thumb' : 'file'}?root=${encodeURIComponent(S.f.root)}&folder=${encodeURIComponent(S.f.folder)}&name=${encodeURIComponent(a.name)}`;
const isImgExt = e => ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(e);
function appendAttachmentCards() {
  const c = $('#cards');
  if (!c || !S.done || !(S.folderAtt?.length || S.folderSubs?.length) || S.f.q || S.f.kind || S.f.status || S.f.tag.length || S.f.favorite || S.f.untagged) return;
  $$('.att-card, .att-row', c).forEach(x => x.remove());
  $('#empty-msg')?.remove();  // an empty "no models" message must not stay next to the cards
  const subHtml = (S.folderSubs || []).map((d, k) => {
    const info = [d.images ? `${d.images} image${d.images > 1 ? 's' : ''}` : '', d.docs ? `${d.docs} document${d.docs > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
    const cover = d.cover ? `/api/folders/thumb?root=${encodeURIComponent(S.f.root)}&folder=${encodeURIComponent(d.path)}&name=${encodeURIComponent(d.cover)}` : '';
    if (S.view === 'list') return `<tr class="clickable att-row" data-sub="${k}"><td style="width:52px"><div class="thumb-s" style="display:grid;place-items:center;color:var(--accent)">${I.folder.replace('<svg', '<svg width="22" height="22"')}</div></td><td><div style="font-weight:600">${esc(d.name)}</div><div class="muted small">${esc(info)}</div></td><td><span class="badge">folder</span></td><td class="hide-m"></td><td class="hide-m"></td><td class="num hide-m"></td><td class="num"></td><td class="num"></td><td class="num hide-m"></td><td class="num hide-m"></td></tr>`;
    return `<div class="card att-card folder-card" data-sub="${k}" title="${esc(d.path)}"><div class="th">${cover ? `<img class="photo" src="${cover}" loading="lazy" alt="">` : ''}
        <div class="folder-ico">${I.folder}</div><div class="tr"><span class="badge">folder</span></div></div>
      <div class="body"><div class="nm">${I.folder.replace('<svg', '<svg width="13" height="13" style="vertical-align:-2px;color:var(--accent);margin-right:4px"')}${esc(d.name)}</div><div class="sub"><span>${esc(info)}</span></div></div></div>`;
  }).join('');
  c.insertAdjacentHTML('beforeend', subHtml);
  const docIcon = '<svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></svg>';
  const html = S.folderAtt.map((a, k) => {
    const base = a.name.split('/').pop();
    const sub = a.name.includes('/') ? a.name.slice(0, a.name.lastIndexOf('/')) + '/' : '';
    if (S.view === 'list') return `<tr class="clickable att-row" data-att="${k}"><td style="width:52px">${isImgExt(a.ext) ? `<img class="thumb-s" src="${attUrl(a, true)}" loading="lazy" style="object-fit:cover">` : `<div class="thumb-s" style="display:grid;place-items:center"><span class="badge ${a.ext === 'pdf' ? 'zip' : 'cad'}">${esc(a.ext)}</span></div>`}</td>
      <td><div style="font-weight:600">${esc(base)}</div><div class="muted small mono">${esc(sub)}</div></td><td><span class="badge ${a.ext === 'pdf' ? 'zip' : 'cad'}">${esc(a.ext)}</span></td><td class="hide-m"></td><td class="hide-m"></td><td class="num hide-m">–</td><td class="num">–</td><td class="num">–</td><td class="num hide-m">${fmt.bytes(a.size)}</td><td class="num hide-m"></td></tr>`;
    return `<div class="card att-card" data-att="${k}" title="${esc(a.name)}">
      <div class="th">${isImgExt(a.ext) ? `<img class="photo" src="${attUrl(a, true)}" loading="lazy" decoding="async" alt="">`
        : `<div class="ph doc ${a.ext === 'pdf' ? 'pdf' : ''}">${docIcon}<span>${esc(a.ext)}</span></div>`}
        <div class="tr"><span class="badge ${a.ext === 'pdf' ? 'zip' : 'cad'}">${esc(a.ext)}</span></div></div>
      <div class="body"><div class="nm">${esc(base.replace(/\.[^.]+$/, ''))}</div><div class="sub"><span>${esc(sub || (isImgExt(a.ext) ? 'image' : 'document'))}</span><span>${fmt.bytes(a.size)}</span></div></div></div>`;
  }).join('');
  c.insertAdjacentHTML('beforeend', html);
  const rl = $('#result-line b');
  if (rl && !$('#result-line .att-count')) {
    const imgs = S.folderAtt.filter(a => isImgExt(a.ext)).length, docs = S.folderAtt.length - imgs;
    rl.parentElement.insertAdjacentHTML('beforeend', `<span class="att-count"> · ${imgs ? `${imgs} image${imgs > 1 ? 's' : ''}` : ''}${imgs && docs ? ' · ' : ''}${docs ? `${docs} document${docs > 1 ? 's' : ''}` : ''}</span>`);
  }
}
function enterSubfolder(path) {
  S.folderStack = [...(S.folderStack || []), { folder: S.f.folder, scroll: $('#view').scrollTop }];
  S.f = { ...S.f, folder: path };
  const parts = path.split('/');
  for (let i = 1; i <= parts.length; i++) S.openFolders.add(S.f.root + '|' + parts.slice(0, i).join('/'));
  $('#view').scrollTop = 0;
  applyFilters();
}
function mdToHtml(src) {
  const inline = t => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const out = []; let list = false, code = false;
  for (const line of src.split('\n')) {
    if (line.trim().startsWith('```')) { if (list) { out.push('</ul>'); list = false; } out.push(code ? '</pre>' : '<pre>'); code = !code; continue; }
    if (code) { out.push(esc(line)); continue; }
    const hm = /^(#{1,4})\s+(.*)$/.exec(line);
    const li = /^\s*[-*+]\s+(.*)$/.exec(line) || /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (li) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(li[1])}</li>`); continue; }
    if (list) { out.push('</ul>'); list = false; }
    if (hm) out.push(`<h${hm[1].length + 1}>${inline(hm[2])}</h${hm[1].length + 1}>`);
    else if (!line.trim()) continue;  // paragraphs already have spacing
    else out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push('</ul>'); if (code) out.push('</pre>');
  return out.join('\n');
}
async function openTextViewer(url, name, ext) {
  let text = '';
  try { const r = await fetch(url, { credentials: 'same-origin' }); if (!r.ok) throw new Error(r.statusText); text = await r.text(); }
  catch (e) { return fail(e); }
  if (text.length > 400000) text = text.slice(0, 400000) + '\n\n… (truncated)';
  const el = h(`<div class="lightbox text-lb"><div class="text-box"><div class="row" style="padding:12px 16px;border-bottom:1px solid var(--line)"><b style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(name)}</b>
      <a class="btn ghost sm" href="${url}" target="_blank" rel="noopener">Open in tab</a><button class="btn ghost sm" data-copy>Copy</button><button class="icon-btn" data-close title="Close (Esc)">${I.x}</button></div>
    <div class="text-body ${ext === 'md' ? 'md' : ''}">${ext === 'md' ? mdToHtml(text) : `<pre>${esc(text)}</pre>`}</div></div></div>`);
  const close = () => { el.remove(); document.removeEventListener('keydown', key, true); };
  const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-close]')) close(); });
  $('[data-copy]', el).onclick = () => navigator.clipboard?.writeText(text).then(() => toast('Copied'));
  document.addEventListener('keydown', key, true);
  document.body.append(el);
}
function openLightbox(start, list = S.folderAtt, urlOf = a => attUrl(a, false)) {
  const imgs = list.filter(a => isImgExt(a.ext));
  let i = Math.max(0, imgs.indexOf(start));
  const el = h(`<div class="lightbox"><button class="icon-btn lb-x" title="Close (Esc)">${I.x}</button>
    <button class="icon-btn lb-prev" title="Previous (←)">${I.left}</button><figure><img alt=""><figcaption></figcaption></figure>
    <button class="icon-btn lb-next" title="Next (→)">${I.right}</button></div>`);
  const show = () => {
    const a = imgs[i];
    $('img', el).src = urlOf(a);
    $('figcaption', el).innerHTML = `${esc(a.name)} <span class="muted">· ${i + 1} / ${imgs.length}</span> <a href="${urlOf(a)}" target="_blank" rel="noopener">open original</a>`;
    $('.lb-prev', el).style.visibility = imgs.length > 1 ? '' : 'hidden';
    $('.lb-next', el).style.visibility = imgs.length > 1 ? '' : 'hidden';
  };
  const close = () => { el.remove(); document.removeEventListener('keydown', key, true); };
  const step = d => { i = (i + d + imgs.length) % imgs.length; show(); };
  const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } else if (e.key === 'ArrowLeft') { e.stopPropagation(); step(-1); } else if (e.key === 'ArrowRight') { e.stopPropagation(); step(1); } };
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('.lb-x')) close(); });
  $('.lb-prev', el).onclick = e => { e.stopPropagation(); step(-1); };
  $('.lb-next', el).onclick = e => { e.stopPropagation(); step(1); };
  let tx = null;  // swipe on phones
  el.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', e => { if (tx == null) return; const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1); tx = null; });
  document.addEventListener('keydown', key, true);
  document.body.append(el);
  show();
}
function headColls() {
  const seen = {};
  S.items.forEach(f => (f.collections || []).forEach(c => { seen[c.id] = c; }));
  const cs = Object.values(seen).sort((a, b) => a.name.localeCompare(b.name));
  return cs.length ? collChips({ collections: cs }, 4).replace('class="colls-mini"', 'class="colls-mini mh"') : '';
}
function renderModelHead() {
  const host = $('#model-head'); if (!host) return;
  const b = insideBundle() ? bundleAt(S.f.root, S.f.folder) : null;
  if (!b) { host.innerHTML = ''; return; }
  const sub = S.f.folder !== b.path ? ` <span class="muted">/ ${esc(S.f.folder.slice(b.path.length + 1))}</span>` : '';
  const grams = S.done ? S.items.reduce((a, f) => a + (f.grams || 0), 0) : null;
  const time = S.done ? S.items.reduce((a, f) => a + (f.print_time_s || 0), 0) : null;
  host.innerHTML = `<div class="model-head">
    <button class="btn sm" id="mh-back" title="Back (Esc)">${I.back}<span class="hide-m">Back</span></button>
    <div class="mh-title">${I.stack.replace('<svg', '<svg width="18" height="18" style="color:var(--accent);flex:none"')}<b>${esc(b.name)}</b>${sub}
      <span class="muted small mono">${S.total || 0} files${grams ? ' · ~' + fmt.g(grams) : ''}${time ? ' · ' + fmt.dur(time) : ''}</span>${headColls()}</div>
    <span class="spacer"></span>
    <a class="btn sm" href="#/model/${b.id}" title="All parts together on the plate">${I.cube}<span class="hide-m">All parts in 3D</span></a>
    <button class="btn sm" id="mh-queue">${I.queue}<span class="hide-m">Queue all</span></button>
    <button class="btn sm" id="mh-zip">${I.download}<span class="hide-m">Zip</span></button>
    <button class="icon-btn" id="mh-more">${I.more}</button></div>`;
  $('#mh-back').onclick = leaveBundle;
  $$('[data-coll-f]', host).forEach(x => x.onclick = () => openCollection(x.dataset.collF));
  const allIds = () => api('/files/ids?' + filterParams());
  $('#mh-queue').onclick = async () => { const ids = await allIds(); await batch(ids, 'queue', null, { reload: false }); toast(`${ids.length} files added to queue`, 'ok'); refreshMeta(); };
  $('#mh-zip').onclick = async () => downloadZip(await allIds());
  $('#mh-more').onclick = e => menuAt(e.currentTarget, [
    { label: 'Model info, notes & history', icon: I.stack, onClick: () => location.hash = '#/model/' + b.id },
    { label: 'Rename model…', icon: I.tag, onClick: async () => { const n = await promptDlg('Model name', b.name); if (n) { await api('/bundles/' + b.id, { method: 'PATCH', body: { name: n } }); await loadMeta(); renderSideLibrary(); renderModelHead(); } } },
    { label: 'Tags for all files…', icon: I.tag, onClick: async () => batchTags(await allIds()) },
    { label: 'Add all files to collection…', icon: I.coll, onClick: async () => batchCollection(await allIds()) },
    { label: 'Remove all files from collection…', icon: I.x, onClick: async () => { const seen = {}; S.items.forEach(f => (f.collections || []).forEach(c => { seen[c.id] = c; })); batchUncollect(await allIds(), Object.values(seen)); } },
    { label: 'Show files separately (ungroup)', icon: I.x, onClick: async () => { await api('/bundles/' + b.id, { method: 'DELETE' }); await loadMeta(); S.prevF = null; S.f = { ...S.f, root: '', folder: null }; applyFilters(); } },
  ]);
}

async function reloadList() {
  S.gen++; S.items = []; S.page = 0; S.done = false; S.selected.clear(); S.lastIdx = null;
  updateSelectionBar();
  renderList(true);
  await loadMore();
}

async function loadMore() {
  if (S.loading || S.done) return;
  S.loading = true;
  const gen = S.gen;
  try {
    const per = S.view === 'list' ? 150 : 90;
    const res = await api('/files?' + filterParams({ page: S.page + 1, per }));
    if (gen !== S.gen) return;
    S.page++;
    S.total = res.total;
    const start = S.items.length;
    S.items.push(...res.items);
    S.done = S.items.length >= res.total || !res.items.length;
    const isAll = !S.f.q && !S.f.kind && !S.f.status && !S.f.tag.length && !S.f.collection && !S.f.favorite && S.f.folder == null && !S.f.printer && !S.f.untagged && !S.f.dupes;
    if (isAll && S.libTotal !== res.total) { S.libTotal = res.total; renderNav(); }
    appendItems(start);
  } catch (e) { fail(e); } finally { S.loading = false; }
  if (gen === S.gen) checkSentinel();
}

function bundleCardHtml(b, i) {
  const st = STATUS[b.status] || STATUS.none;
  const sub = [];
  if (b.print_time_s) sub.push(`<span title="Total print time">⏱ ${fmt.dur(b.print_time_s)}</span>`);
  if (b.grams) sub.push(`<span title="Total filament">${b.grams_estimated ? '~' : ''}${fmt.g(b.grams)}</span>`);
  sub.push(`<span>${b.exts.slice(0, 3).join(' · ')}</span>`);
  return `<div class="card bundle ${isSel(b) ? 'sel' : ''}" data-i="${i}" data-id="b${b.id}" draggable="true">
    <div class="th"><img src="/api/bundles/${b.id}/thumb?v=${b.thumb_v}" loading="lazy" decoding="async" alt="" onerror="this.style.visibility='hidden'">
      <div class="tl"><span class="cb">${I.check}</span></div>
      <div class="tr">${b.favorite ? `<span class="fav">${I.star.replace('<svg', '<svg width="17" height="17"')}</span>` : ''}<span class="badge model">${b.models === 1 ? 'model' : b.models + ' parts'}${b.docs ? ' + docs' : ''}</span></div>
      ${b.status !== 'none' ? `<div class="stbar ${st.cls}" title="${st.label}"></div>` : ''}
    </div>
    <div class="body"><div class="nm" title="${esc(b.folder)}">${I.stack.replace('<svg', '<svg width="13" height="13" style="vertical-align:-2px;color:var(--accent);margin-right:4px"')}${esc(b.name)}</div>${pillsHtml(b)}<div class="sub">${sub.join('')}</div>${collChips(b)}
    ${b.tags.length ? `<div class="tags-mini">${b.tags.slice(0, 4).map(t => tagChip(t)).join('')}</div>` : ''}</div></div>`;
}
const isNew = it => it.added_at && (Date.now() - new Date(it.added_at.replace(' ', 'T') + 'Z')) < 7 * 864e5;
function printingOf(it) {
  for (const id of idsOf(it)) { const x = S.printing?.[id]; if (x) return x; }
  return null;
}
function pillsHtml(it) {
  const p = [];
  const pr = printingOf(it);
  if (pr) p.push(`<span class="pill-s live" title="${esc(pr.printer)}${pr.remaining_s ? ' · ' + fmtLeft(pr.remaining_s) + ' left' : ''}"><i></i>${/paus/i.test(pr.state) ? 'Paused' : 'Printing'} ${Math.round(pr.progress * 100)}%</span>`);
  else if (it.status && it.status !== 'none') p.push(`<span class="pill-s ${STATUS[it.status]?.cls || ''}">${STATUS[it.status]?.label || it.status}</span>`);
  else if (it.kind === 'gcode' || it.kind === 'sliced') p.push('<span class="pill-s ready">Ready to print</span>');
  if (isNew(it)) p.push('<span class="pill-s new">New</span>');
  return p.length ? `<div class="pills">${p.join('')}</div>` : '';
}
function cardHtml(f, i) {
  if (f.type === 'bundle') return bundleCardHtml(f, i);
  const st = STATUS[f.status] || STATUS.none;
  const sub = [];
  if (f.print_time_s) sub.push(`<span title="Print time">⏱ ${fmt.dur(f.print_time_s)}</span>`);
  if (f.grams) sub.push(`<span title="${f.grams_estimated ? 'Estimated filament' : 'Filament'}">${f.grams_estimated ? '~' : ''}${fmt.g(f.grams)}</span>`);
  if (!f.print_time_s && f.dim_x != null) sub.push(`<span title="Size (mm)">${fmt.mm(f.dim_x)}×${fmt.mm(f.dim_y)}×${fmt.mm(f.dim_z)}</span>`);
  if (!sub.length) sub.push(`<span>${fmt.bytes(f.size)}</span>`);
  return `<div class="card ${isSel(f) ? 'sel' : ''}" data-i="${i}" data-id="${f.id}" draggable="true">
    <div class="th">${thumbHtml(f)}
      <div class="tl"><span class="cb">${I.check}</span></div>
      <div class="tr">${f.favorite ? `<span class="fav">${I.star.replace('<svg', '<svg width="17" height="17"')}</span>` : ''}<span class="badge ${badgeCls(f.ext)}">${esc(f.ext)}</span></div>
      ${f.status !== 'none' ? `<div class="stbar ${st.cls}" title="${st.label}"></div>` : ''}
    </div>
    <div class="body"><div class="nm" title="${esc(f.name)}">${f.model_name ? I.folder.replace('<svg', '<svg width="13" height="13" style="vertical-align:-2px;color:var(--accent);margin-right:4px"') : ''}${esc(f.display_name)}</div><div class="by">${f.designer ? esc(f.designer) : f.folder ? esc(f.folder.split('/').pop()) : '<span class="muted">library root</span>'}</div>${pillsHtml(f)}<div class="sub">${sub.join('')}</div>${collChips(f)}
    ${f.tags.length ? `<div class="tags-mini">${f.tags.slice(0, 4).map(t => tagChip(t)).join('')}</div>` : ''}</div></div>`;
}
function rowHtml(f, i) {
  const st = STATUS[f.status] || STATUS.none;
  if (f.type === 'bundle') return `<tr class="clickable ${isSel(f) ? 'sel' : ''}" data-i="${i}" data-id="b${f.id}" draggable="true">
    <td style="width:52px"><img class="thumb-s" src="/api/bundles/${f.id}/thumb?v=${f.thumb_v}" loading="lazy" onerror="this.style.visibility='hidden'"></td>
    <td><div style="font-weight:600">${I.stack.replace('<svg', '<svg width="13" height="13" style="vertical-align:-2px;color:var(--accent)"')} ${esc(f.name)}</div><div class="muted small mono">${esc(f.folder)} · ${f.models === 1 ? '1 part' : f.models + ' parts'}</div>${collChips(f, 3)}</td>
    <td><span class="badge model">model</span></td>
    <td class="hide-m"><span class="stdot ${st.cls}"></span> <span class="small">${st.label}</span></td>
    <td class="hide-m">${f.tags.slice(0, 3).map(t => tagChip(t)).join(' ')}</td>
    <td class="num hide-m">–</td><td class="num">${f.print_time_s ? fmt.dur(f.print_time_s) : '–'}</td>
    <td class="num">${f.grams ? (f.grams_estimated ? '~' : '') + fmt.g(f.grams) : '–'}</td>
    <td class="num hide-m">${fmt.bytes(f.size)}</td><td class="num hide-m">${fmt.date(f.added_at)}</td></tr>`;
  return `<tr class="clickable ${isSel(f) ? 'sel' : ''}" data-i="${i}" data-id="${f.id}" draggable="true">
    <td style="width:52px">${f.thumb > 0 ? `<img class="thumb-s" src="/api/files/${f.id}/thumb?v=${f.thumb_v}" loading="lazy">` : `<div class="thumb-s"></div>`}</td>
    <td><div style="font-weight:600">${f.favorite ? '<span style="color:var(--yellow)">★</span> ' : ''}${esc(f.display_name)}</div><div class="muted small mono">${esc(f.folder || '/')} </div>${collChips(f, 3)}</td>
    <td><span class="badge ${badgeCls(f.ext)}">${esc(f.ext)}</span></td>
    <td class="hide-m"><span class="stdot ${st.cls}"></span> <span class="small">${st.label}</span></td>
    <td class="hide-m">${f.tags.slice(0, 3).map(t => tagChip(t)).join(' ')}</td>
    <td class="num hide-m">${f.dim_x != null ? `${fmt.mm(f.dim_x)}×${fmt.mm(f.dim_y)}×${fmt.mm(f.dim_z)}` : '–'}</td>
    <td class="num">${f.print_time_s ? fmt.dur(f.print_time_s) : '–'}</td>
    <td class="num">${f.grams ? (f.grams_estimated ? '~' : '') + fmt.g(f.grams) : '–'}</td>
    <td class="num hide-m">${fmt.bytes(f.size)}</td>
    <td class="num hide-m">${fmt.date(f.added_at)}</td></tr>`;
}

function renderList(reset) {
  const host = $('#cards-host'); if (!host) return;
  if (reset) $('#empty-msg')?.remove();
  if (reset) {
    host.innerHTML = S.view === 'grid'
      ? `<div class="cards" id="cards"></div><div class="sentinel" id="sentinel"></div>`
      : `<div class="list-wrap"><table class="table"><thead><tr><th></th><th>Name</th><th>Type</th><th class="hide-m">Status</th><th class="hide-m">Tags</th><th class="num hide-m">Size mm</th><th class="num">Time</th><th class="num">Filament</th><th class="num hide-m">File</th><th class="num hide-m">Added</th></tr></thead><tbody id="cards"></tbody></table></div><div class="sentinel" id="sentinel"></div>`;
    bindListEvents($('#cards'));
    observeSentinel();
    if (S.items.length) appendItems(0);
  }
}
function appendItems(start) {
  const c = $('#cards'); if (!c) return;
  const html = S.items.slice(start).map((f, k) => (S.view === 'grid' ? cardHtml : rowHtml)(f, start + k)).join('');
  c.insertAdjacentHTML('beforeend', html);
  const rl = $('#result-line');
  if (rl) {
    rl.innerHTML = `<span><b>${fmt.num(S.total)}</b> ${S.total === 1 ? 'file' : 'files'}</span><span class="spacer"></span>
      <button class="btn ghost sm" id="roulette" title="Pick a random printable model">${I.dice} Print roulette</button>
      <button class="btn ghost sm" id="selall">Select all</button>`;
    $('#roulette').onclick = async () => { const r = await api('/random?' + filterParams()); r.id ? (location.hash = '#/file/' + r.id) : toast('Nothing to pick from'); };
    $('#selall').onclick = selectAll;
  }
  const sent = $('#sentinel');
  if (sent) sent.innerHTML = S.done ? '' : '<div class="spinner"></div>';
  if (insideBundle()) renderModelHead();
  appendAttachmentCards();
  if (!S.items.length && S.done && !$('#empty-msg') && !((S.folderAtt?.length || S.folderSubs?.length) && S.f.folder != null)) {
    c.insertAdjacentHTML('afterend', `<div class="empty" id="empty-msg">${I.lib}<h3>${S.f.q || S.f.tag.length || S.f.kind || S.f.status ? 'No matches' : 'Your library is empty'}</h3>
      <p>${S.f.q || S.f.tag.length ? 'Try a different search or clear filters.' : `Copy files into <span class="mono">${esc((S.settings._library_dirs || ['/library']).join(', '))}</span> on the server, or upload them here.`}</p>
      <button class="btn primary" onclick="document.getElementById('upload-btn').click()">${I.upload} Upload files</button></div>`);
  }
}
let sentinelObs;
function observeSentinel() {
  sentinelObs?.disconnect();
  const s = $('#sentinel'); if (!s) return;
  sentinelObs = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) loadMore(); }, { root: $('#view'), rootMargin: '800px' });
  sentinelObs.observe(s);
}
function checkSentinel() { const s = $('#sentinel'); if (s && !S.done && s.getBoundingClientRect().top < innerHeight + 800) loadMore(); }

function bindListEvents(c) {
  c.addEventListener('click', e => {
    const sub = e.target.closest('[data-sub]');
    if (sub) { enterSubfolder(S.folderSubs[+sub.dataset.sub].path); return; }
    const att = e.target.closest('[data-att]');
    if (att) {
      const a = S.folderAtt[+att.dataset.att];
      if (isImgExt(a.ext)) openLightbox(a);
      else if (['txt', 'md'].includes(a.ext)) openTextViewer(attUrl(a, false), a.name, a.ext);
      else window.open(attUrl(a, false), '_blank', 'noopener');
      return;
    }
    const el = e.target.closest('[data-i]'); if (!el) return;
    const cEl = e.target.closest('[data-coll-f]');
    if (cEl) { e.stopPropagation(); openCollection(cEl.dataset.collF); return; }
    const tagEl = e.target.closest('[data-tag]');
    if (tagEl && !e.target.closest('.cb')) { e.stopPropagation(); const id = +tagEl.dataset.tag; if (!S.f.tag.includes(id)) S.f.tag.push(id); applyFilters(); return; }
    const i = +el.dataset.i;
    if (e.shiftKey && S.lastIdx != null) {
      const [a, b] = [Math.min(S.lastIdx, i), Math.max(S.lastIdx, i)];
      for (let k = a; k <= b; k++) idsOf(S.items[k]).forEach(id => S.selected.add(id));
      syncSelection(); return;
    }
    if (e.target.closest('.cb') || e.ctrlKey || e.metaKey || (S.selected.size && S.view === 'grid')) {
      toggleItem(S.items[i]); S.lastIdx = i; return;
    }
    S.lastIdx = i;
    if (S.items[i].type === 'bundle') return enterBundle(S.items[i]);
    if (e.detail > 1) return;  // double click handled below
    openPanel(S.items[i].id);
  });
  c.addEventListener('dblclick', e => {
    const el = e.target.closest('[data-i]'); if (!el || e.target.closest('.cb')) return;
    const it = S.items[+el.dataset.i];
    if (it && it.type !== 'bundle') location.hash = itemHash(it);
  });
  c.addEventListener('contextmenu', e => {
    const el = e.target.closest('[data-i]'); if (!el) return;
    e.preventDefault();
    const f = S.items[+el.dataset.i];
    if (!isSel(f)) { S.selected.clear(); idsOf(f).forEach(id => S.selected.add(id)); syncSelection(); }
    if (S.selected.size > idsOf(f).length) return selectionMenu(e.clientX, e.clientY);
    f.type === 'bundle' ? bundleMenu(f, e.clientX, e.clientY) : fileMenu(f, e.clientX, e.clientY);
  });
  c.addEventListener('dragstart', e => {
    const el = e.target.closest('[data-i]'); if (!el) return;
    const f = S.items[+el.dataset.i];
    if (!isSel(f)) { S.selected.clear(); idsOf(f).forEach(id => S.selected.add(id)); syncSelection(); }
    e.dataTransfer.setData('application/x-zhopdeck', JSON.stringify([...S.selected]));
    e.dataTransfer.effectAllowed = 'copyMove';
  });
}
function toggleItem(it) { const on = !isSel(it); idsOf(it).forEach(id => on ? S.selected.add(id) : S.selected.delete(id)); syncSelection(); }
function syncSelection() {
  $$('#cards [data-i]').forEach(el => { const it = S.items[+el.dataset.i]; if (it) el.classList.toggle('sel', isSel(it)); });
  $('#cards')?.classList.toggle('selecting', S.selected.size > 0);
  updateSelectionBar();
}
async function selectAll() {
  const ids = await api('/files/ids?' + filterParams());
  ids.forEach(id => S.selected.add(id));
  syncSelection();
}

function fileMenu(f, x, y) {
  menu(x, y, [
    { label: 'Open', icon: I.cube, onClick: () => location.hash = '#/file/' + f.id },
    { label: 'Download', icon: I.download, onClick: () => location.href = `/api/files/${f.id}/download` },
    { label: f.favorite ? 'Remove from favorites' : 'Add to favorites', icon: I.star, onClick: () => batch([f.id], 'favorite', !f.favorite) },
    ...slicersFor(f).map(k => ({ label: `Open in ${SLICERS[k].name}`, icon: I.cube, onClick: () => openInSlicer(f, k) })),
    ...(canSend(f) ? [{ label: 'Send to printer…', icon: I.upload, onClick: () => sendDialog(f) }] : []),
    { label: 'Add to print queue', icon: I.queue, onClick: () => batch([f.id], 'queue') },
    '-', { header: 'Status' },
    ...Object.entries(STATUS).map(([k, s]) => ({ html: `<span class="stdot ${s.cls}"></span> ${s.label}${f.status === k ? ' ✓' : ''}`, onClick: () => batch([f.id], 'status', k) })),
    '-',
    { label: 'Tags…', icon: I.tag, onClick: () => batchTags([f.id]) },
    { label: 'Add to collection…', icon: I.coll, onClick: () => batchCollection([f.id]) },
    ...((f.collections || []).length ? [{ label: 'Remove from collection…', icon: I.x, onClick: () => batchUncollect([f.id], f.collections) }] : []),
    { label: 'Move to folder…', icon: I.move, onClick: () => batchMove([f.id]) },
    '-',
    { label: 'Delete file', icon: I.trash, danger: true, onClick: () => batchDelete([f.id]) },
  ]);
}

/* ---------------- selection bar & batch actions */
function updateSelectionBar() {
  const bar = $('#selection-bar');
  if (!S.selected.size || S.route !== 'library' || detailState) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  bar.innerHTML = `<span class="cnt"><b>${S.selected.size}</b> selected</span><span class="sep"></span>
    <button class="btn ghost sm" data-a="tags">${I.tag}<span class="hide-m">Tags</span></button>
    <button class="btn ghost sm" data-a="status"><span class="stdot st-printed"></span><span class="hide-m">Status</span></button>
    <button class="btn ghost sm" data-a="coll">${I.coll}<span class="hide-m">Collection</span></button>
    <button class="btn ghost sm" data-a="queue">${I.queue}<span class="hide-m">Queue</span></button>
    <button class="btn ghost sm" data-a="move">${I.move}<span class="hide-m">Move</span></button>
    <button class="btn ghost sm" data-a="dl">${I.download}<span class="hide-m">Zip</span></button>
    <button class="btn ghost sm" data-a="more">${I.more}</button>
    <span class="sep"></span><button class="icon-btn" data-a="clear" title="Clear selection (Esc)">${I.x}</button>`;
  bar.onclick = e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const ids = [...S.selected];
    ({
      tags: () => batchTags(ids),
      status: () => menuAt(b, Object.entries(STATUS).map(([k, s]) => ({ html: `<span class="stdot ${s.cls}"></span> ${s.label}`, onClick: () => batch(ids, 'status', k) }))),
      coll: () => batchCollection(ids),
      queue: () => batch(ids, 'queue').then(() => toast(`Added ${ids.length} to queue`, 'ok')),
      move: () => batchMove(ids),
      dl: () => downloadZip(ids),
      more: () => selectionMenu(b.getBoundingClientRect().left, b.getBoundingClientRect().top - 220),
      clear: () => { S.selected.clear(); syncSelection(); },
    })[b.dataset.a]?.();
  };
}
function selectionMenu(x, y) {
  const ids = [...S.selected];
  menu(x, y, [
    { label: 'Add to favorites', icon: I.star, onClick: () => batch(ids, 'favorite', true) },
    { label: 'Remove from favorites', icon: I.starO, onClick: () => batch(ids, 'favorite', false) },
    { label: 'Set designer…', icon: I.tag, onClick: async () => { const v = await promptDlg('Designer'); v != null && batch(ids, 'designer', v); } },
    { label: 'Set license…', icon: I.tag, onClick: async () => { const v = await promptDlg('License', '', 'e.g. CC-BY 4.0'); v != null && batch(ids, 'license', v); } },
    { label: 'Re-generate previews', icon: I.refresh, onClick: () => batch(ids, 'reanalyze').then(() => toast('Re-analysing in background')) },
    { label: 'Download as zip', icon: I.download, onClick: () => downloadZip(ids) },
    { label: 'Remove from collection…', icon: I.x, onClick: () => batchUncollect(ids) },
    '-',
    { label: `Delete ${ids.length} files`, icon: I.trash, danger: true, onClick: () => batchDelete(ids) },
  ]);
}
async function batch(ids, action, value, { reload = true } = {}) {
  try {
    const r = await api('/files/batch', { method: 'POST', body: { ids, action, value } });
    if (r.failed?.length) toast(`${r.failed.length} failed: ${r.failed[0].error}`, 'err');
    refreshMeta();
    if (reload && S.route === 'library') await refreshVisible(ids);
    return r;
  } catch (e) { fail(e); }
}
async function refreshVisible(ids) {
  // cheap refresh: re-query current pages and patch the DOM
  const per = Math.max(S.items.length, S.view === 'list' ? 150 : 90);
  const res = await api('/files?' + filterParams({ page: 1, per }));
  const keep = new Set(S.selected);
  S.items = res.items; S.total = res.total; S.page = Math.ceil(res.items.length / (S.view === 'list' ? 150 : 90)); S.done = S.items.length >= res.total;
  S.selected = new Set([...keep].filter(id => S.items.some(f => f.id === id)));
  renderList(true);
  syncSelection();
}
function downloadZip(ids) {
  const f = h(`<form method="post" action="/api/download" style="display:none"><input name="ids" value="${ids.join(',')}"></form>`);
  document.body.append(f); f.submit(); setTimeout(() => f.remove(), 1000);
  toast(`Preparing zip of ${ids.length} files…`);
}
async function batchDelete(ids) {
  if (!await confirmDlg(`Delete <b>${ids.length}</b> file${ids.length > 1 ? 's' : ''}? They are moved to the trash folder in the data volume and can be recovered until you empty it.`, { ok: 'Delete', danger: true })) return;
  await batch(ids, 'delete');
  S.selected.clear(); syncSelection();
  toast(`Deleted ${ids.length} file${ids.length > 1 ? 's' : ''}`, 'ok');
}
function batchTags(ids) {
  const box = h(`<div style="display:flex;flex-direction:column;gap:12px"><p class="muted" style="margin:0">Applies to ${ids.length} file${ids.length > 1 ? 's' : ''}.</p><div id="ti"></div>
    <div class="tag-cloud" style="padding:0">${S.tags.slice(0, 40).map(t => tagChip(t)).join('')}</div></div>`);
  const ti = tagInput([], () => { });
  $('#ti', box).append(ti.el);
  box.querySelector('.tag-cloud').onclick = e => { const t = e.target.closest('[data-tag]'); if (t) ti.add(S.tags.find(x => x.id == t.dataset.tag).name); };
  modal({ title: 'Tags', body: box, buttons: [
    { label: 'Remove these tags', cls: 'danger', onClick: () => batch(ids, 'remove_tags', ti.value()) },
    { label: 'Add tags', cls: 'primary', onClick: () => batch(ids, 'add_tags', ti.value()) }] });
}
async function batchCollection(ids) {
  const opts = S.collections.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  modal({ title: 'Add to collection', body: `<label class="fld"><span>Collection</span><select id="cs">${opts}<option value="new">+ New collection…</option></select></label><label class="fld" id="nw" style="display:${S.collections.length ? 'none' : 'flex'}"><span>New collection name</span><input id="cn" type="text"></label>`,
    buttons: [{ label: 'Cancel' }, { label: 'Add', cls: 'primary', onClick: async ({ el }) => {
      let cid = $('#cs', el).value;
      if (cid === 'new' || !cid) { const name = $('#cn', el).value.trim(); if (!name) throw new Error('Enter a name'); cid = (await api('/collections', { method: 'POST', body: { name } })).id; }
      await batch(ids, 'add_collection', +cid); toast('Added to collection', 'ok');
    } }] });
  const m = $$('.modal').pop();
  const sel = $('#cs', m); if (!S.collections.length) sel.value = 'new';
  sel.onchange = () => $('#nw', m).style.display = sel.value === 'new' ? 'flex' : 'none';
}
function collsOf(ids) {
  const set = new Set(ids), seen = {};
  for (const it of S.items) if (idsOf(it).some(id => set.has(id))) (it.collections || []).forEach(c => { seen[c.id] = c; });
  return Object.values(seen).sort((a, b) => a.name.localeCompare(b.name));
}
async function batchUncollect(ids, colls = collsOf(ids)) {
  if (!colls.length) return toast('Not in any collection');
  const n = `${ids.length} file${ids.length > 1 ? 's' : ''}`;
  const done = async cids => {
    for (const cid of cids) await batch(ids, 'remove_collection', +cid, { reload: false });
    toast('Removed from collection', 'ok'); await loadMeta(); renderSideLibrary();
    if (S.route === 'library') reloadList();
  };
  if (colls.length === 1) {
    if (await confirmDlg(`Remove ${n} from collection <b>${esc(colls[0].name)}</b>? The files stay in the library.`, { ok: 'Remove' })) await done([colls[0].id]);
    return;
  }
  modal({ title: 'Remove from collection', body: `<p class="muted small" style="margin-top:0">${n} – the files stay in the library.</p>
    <div style="display:flex;flex-direction:column;gap:8px">${colls.map(c => `<label class="check"><input type="checkbox" value="${c.id}" ${S.f.collection == c.id ? 'checked' : ''}> <span class="stdot" style="background:${esc(c.color)}"></span> ${esc(c.name)}</label>`).join('')}</div>`,
    buttons: [{ label: 'Cancel' }, { label: 'Remove', cls: 'danger', onClick: async ({ el }) => {
      const cids = $$('input:checked', el).map(x => x.value);
      if (!cids.length) throw new Error('Pick a collection');
      await done(cids);
    } }] });
}
function folderOptions(sel = '') {
  const out = [];
  for (const r of S.folders) {
    out.push(`<option value="${esc(r.root)}|" ${sel === r.root + '|' ? 'selected' : ''}>${esc(r.name)} /</option>`);
    for (const fo of r.folders) if (fo.path) out.push(`<option value="${esc(r.root)}|${esc(fo.path)}" ${sel === r.root + '|' + fo.path ? 'selected' : ''}>${esc(r.name)} / ${esc(fo.path)}</option>`);
  }
  return out.join('');
}
function batchMove(ids) {
  const collOpts = S.collections.map(c => `<option value="${c.id}" ${S.f.collection == c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const m = modal({ title: `Move ${ids.length} file${ids.length > 1 ? 's' : ''}`, body: `<label class="fld"><span>Destination folder</span><select id="mf"><option value="keep">— keep in current folder —</option>${folderOptions(S.f.root ? S.f.root + '|' + (S.f.folder || '') : '')}</select></label>
    <label class="fld" id="mn-w"><span>…or new subfolder (optional)</span><input type="text" id="mn" placeholder="e.g. Toys/Fidgets"></label>
    <label class="fld"><span>Add to collection (optional)</span><select id="mc"><option value="">—</option>${collOpts}<option value="new">+ New collection…</option></select></label>
    <label class="fld hidden" id="mcn-w"><span>New collection name</span><input type="text" id="mcn"></label>
    <p class="muted small" style="margin:0">Files are moved on disk. Tags, notes, collections and print history move with them.</p>`,
    buttons: [{ label: 'Cancel' }, { label: 'Move', cls: 'primary', onClick: async ({ el }) => {
      const fv = $('#mf', el).value, cv = $('#mc', el).value;
      const sub = $('#mn', el).value.trim().replace(/^\/+|\/+$/g, '');
      let cid = cv;
      if (cv === 'new') {
        const name = $('#mcn', el).value.trim(); if (!name) throw new Error('Enter a collection name');
        cid = (await api('/collections', { method: 'POST', body: { name } })).id;
      }
      const msg = [];
      if (fv !== 'keep') {
        const [, folder] = fv.split('|');
        await batch(ids, 'move', [folder, sub].filter(Boolean).join('/'), { reload: !cid }); msg.push('Moved');
      }
      if (cid) { await batch(ids, 'add_collection', +cid); msg.push('added to collection'); }
      refreshMeta(); toast(msg.length ? msg.join(', ').replace(/^a/, 'A') : 'Nothing changed', msg.length ? 'ok' : '');
    } }] });
  const el = m.el, sync = () => {
    $('#mn-w', el).classList.toggle('hidden', $('#mf', el).value === 'keep');
    $('#mcn-w', el).classList.toggle('hidden', $('#mc', el).value !== 'new');
    const pb = $('footer .btn.primary', m.root); if (pb) pb.textContent = $('#mf', el).value === 'keep' ? 'Save' : 'Move';
  };
  $('#mf', el).onchange = sync; $('#mc', el).onchange = sync;
}

/* ---------------- sidebar: folders / tags / collections */
function renderSideLibrary() {
  if (S.route !== 'library') return;
  const side = $('#side-extra');
  let html = '';
  for (const r of S.folders) {
    const tree = buildTree(r.folders);
    const total = r.folders.reduce((a, f) => a + f.count, 0);
    html += `<div class="side-h"><span>${esc(r.name)}${r.available ? '' : ' <span style="color:var(--red)">(offline)</span>'}</span><button data-newfolder="${esc(r.root)}" title="New folder">+</button></div><div class="tree">
      <div class="tree-row ${S.f.root === r.root && S.f.folder === '' ? 'active' : ''}" data-root="${esc(r.root)}" data-folder=""><span class="tw"></span><span class="nm">All in ${esc(r.name)}</span><span class="ct">${total}</span></div>
      ${renderTree(tree, r.root, 0)}</div>`;
  }
  if (S.collections.length) {
    html += `<div class="side-h"><span>Collections</span><button data-go="collections" title="Manage">›</button></div><div class="tree">` +
      S.collections.map(c => `<div class="tree-row ${S.f.collection == c.id ? 'active' : ''}" data-coll="${c.id}"><span class="tw"><span class="stdot" style="background:${esc(c.color)}"></span></span><span class="nm">${esc(c.name)}</span><span class="ct">${c.n}</span></div>`).join('') + '</div>';
  }
  const tags = S.tags.filter(t => t.n > 0);
  if (tags.length) {
    html += `<div class="side-h"><span>Tags</span><button data-managetags title="Manage tags">⋯</button></div><div class="tag-cloud">` +
      tags.slice(0, store.get('allTags', false) ? 999 : 30).map(t => `<span class="tag ${S.f.tag.includes(t.id) ? 'on' : ''}" data-tag="${t.id}"><i style="background:${esc(t.color)}"></i>${esc(t.name)} <span class="n">${t.n}</span></span>`).join('') +
      (tags.length > 30 ? `<span class="tag" data-alltags>${store.get('allTags', false) ? 'less' : `+${tags.length - 30} more`}</span>` : '') + '</div>';
  }
  side.innerHTML = html;
  side.onclick = async e => {
    const tw = e.target.closest('.tw[data-toggle]');
    if (tw) { const k = tw.dataset.toggle; S.openFolders.has(k) ? S.openFolders.delete(k) : S.openFolders.add(k); store.set('openFolders', [...S.openFolders]); return renderSideLibrary(); }
    const row = e.target.closest('.tree-row');
    if (row?.dataset.root !== undefined) {
      const same = S.f.root === row.dataset.root && S.f.folder === row.dataset.folder;
      S.f.root = same ? '' : row.dataset.root; S.f.folder = same ? null : row.dataset.folder; S.f.collection = '';
      if (row.dataset.folder) { const parts = row.dataset.folder.split('/'); for (let i = 1; i <= parts.length; i++) S.openFolders.add(row.dataset.root + '|' + parts.slice(0, i).join('/')); }
      $('#sidebar').classList.remove('open');
      return applyFilters();
    }
    if (row?.dataset.coll) { S.f.collection = S.f.collection == row.dataset.coll ? '' : row.dataset.coll; S.f.root = ''; S.f.folder = null; $('#sidebar').classList.remove('open'); return applyFilters(); }
    const tg = e.target.closest('[data-tag]');
    if (tg) { const id = +tg.dataset.tag; S.f.tag = S.f.tag.includes(id) ? S.f.tag.filter(x => x !== id) : [...S.f.tag, id]; return applyFilters(); }
    if (e.target.closest('[data-alltags]')) { store.set('allTags', !store.get('allTags', false)); return renderSideLibrary(); }
    if (e.target.closest('[data-managetags]')) return manageTags();
    if (e.target.closest('[data-go]')) return location.hash = '#/' + e.target.closest('[data-go]').dataset.go;
    const nf = e.target.closest('[data-newfolder]');
    if (nf) {
      const base = S.f.root === nf.dataset.newfolder && S.f.folder ? S.f.folder + '/' : '';
      const name = await promptDlg('New folder', base, 'Folder/Subfolder');
      if (name) { try { await api('/folders', { method: 'POST', body: { root: nf.dataset.newfolder, path: name } }); refreshMeta(); } catch (er) { fail(er); } }
    }
  };
  side.oncontextmenu = e => {
    const row = e.target.closest('.tree-row[data-root]');
    if (!row || !row.dataset.folder) return;
    e.preventDefault();
    const root = row.dataset.root, path = row.dataset.folder;
    const own = S.bundles.find(b => b.root === root && b.path === path);
    const parent = bundleAt(root, path);
    const after = async (msg) => { toast(msg, 'ok'); await loadMeta(); renderSideLibrary(); reloadList(); pollScan(true); };
    menu(e.clientX, e.clientY, [
      { header: path.split('/').pop() },
      own ? { label: 'Open model', icon: I.stack, onClick: () => location.hash = '#/model/' + own.id }
        : parent ? { label: `Part of model “${parent.name}”`, icon: I.stack, onClick: () => location.hash = '#/model/' + parent.id }
          : { label: 'Treat folder as one model', icon: I.stack, onClick: async () => { await api('/bundles', { method: 'POST', body: { root, path } }); after('Folder is now one model'); } },
      ...(parent ? [] : [{ label: 'Treat each subfolder as a model', icon: I.coll, onClick: async () => { const r = await api('/bundles', { method: 'POST', body: { root, path, subfolders: true } }); after(`${r.created} models created`); } }]),
      ...(own ? [{ label: 'Show files separately (ungroup)', icon: I.x, onClick: async () => { await api('/bundles/' + own.id, { method: 'DELETE' }); after('Ungrouped'); } }] : []),
      '-',
      { label: 'New subfolder…', icon: I.folder, onClick: async () => { const n = await promptDlg('New folder', path + '/'); if (n) { await api('/folders', { method: 'POST', body: { root, path: n } }); refreshMeta(); } } },
    ]);
  };
  // drop files (from cards) onto folders to move them
  $$('.tree-row[data-root]', side).forEach(row => {
    row.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('application/x-zhopdeck')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; row.classList.add('drop-target'); } });
    row.addEventListener('dragleave', () => row.classList.remove('drop-target'));
    row.addEventListener('drop', async e => {
      row.classList.remove('drop-target');
      const ids = JSON.parse(e.dataTransfer.getData('application/x-zhopdeck') || '[]');
      if (!ids.length) return;
      e.preventDefault(); e.stopPropagation();
      await batch(ids, 'move', row.dataset.folder); refreshMeta();
      toast(`Moved ${ids.length} file${ids.length > 1 ? 's' : ''} to /${row.dataset.folder}`, 'ok');
    });
  });  // drop cards onto a collection to add them to it (files stay where they are)
  $$('.tree-row[data-coll]', side).forEach(row => {
    row.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('application/x-zhopdeck')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; row.classList.add('drop-target'); } });
    row.addEventListener('dragleave', () => row.classList.remove('drop-target'));
    row.addEventListener('drop', async e => {
      row.classList.remove('drop-target');
      const ids = JSON.parse(e.dataTransfer.getData('application/x-zhopdeck') || '[]');
      if (!ids.length) return;
      e.preventDefault(); e.stopPropagation();
      const c = S.collections.find(x => x.id == row.dataset.coll);
      await batch(ids, 'add_collection', +row.dataset.coll); refreshMeta();
      toast(`Added to collection ${c ? c.name : ''}`, 'ok');
    });
  });
}
function buildTree(folders) {
  const root = { children: new Map(), count: 0, total: 0 };
  for (const f of folders) {
    if (!f.path) { root.count += f.count; continue; }
    let node = root; const parts = f.path.split('/'); let acc = '';
    for (const p of parts) {
      acc = acc ? acc + '/' + p : p;
      if (!node.children.has(p)) node.children.set(p, { name: p, path: acc, children: new Map(), count: 0, total: 0 });
      node = node.children.get(p);
    }
    node.count += f.count;
  }
  const sum = n => { n.total = n.count; for (const c of n.children.values()) n.total += sum(c); return n.total; };
  sum(root);
  return root;
}
function renderTree(node, root, depth) {
  let out = '';
  const kids = [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  for (const c of kids) {
    const key = root + '|' + c.path, open = S.openFolders.has(key), has = c.children.size > 0;
    out += `<div class="tree-row ${S.f.root === root && S.f.folder === c.path ? 'active' : ''}" data-root="${esc(root)}" data-folder="${esc(c.path)}" style="padding-left:${6 + depth * 14}px">
      <span class="tw ${open ? 'open' : ''}" ${has ? `data-toggle="${esc(key)}"` : ''}>${has ? '▶' : ''}</span><span class="nm">${S.bundles.some(b => b.root === root && b.path === c.path) ? I.stack.replace('<svg', '<svg width="12" height="12" style="vertical-align:-1px;color:var(--accent);margin-right:4px"') : ''}${esc(c.name)}</span><span class="ct">${c.total || ''}</span></div>`;
    if (has && open) out += renderTree(c, root, depth + 1);
  }
  return out;
}
function manageTags() {
  const render = () => S.tags.map(t => `<div class="row" data-t="${t.id}" style="gap:8px"><input type="color" value="${esc(t.color)}" data-color><input type="text" value="${esc(t.name)}" data-name><span class="muted mono small" style="width:40px;text-align:right">${t.n}</span><button class="icon-btn" data-del title="Delete">${I.trash}</button></div>`).join('') || '<p class="muted">No tags yet.</p>';
  const m = modal({ title: 'Manage tags', size: 'lg', body: `<p class="muted small" style="margin:0">Rename a tag to an existing name to merge them.</p><div id="tl" style="display:flex;flex-direction:column;gap:6px">${render()}</div>`, buttons: [{ label: 'Done', cls: 'primary' }], onClose: () => { refreshMeta(); if (S.route === 'library') reloadList(); } });
  const tl = $('#tl', m.el);
  tl.addEventListener('change', async e => {
    const row = e.target.closest('[data-t]'); const id = row.dataset.t;
    try {
      if (e.target.matches('[data-color]')) await api('/tags/' + id, { method: 'PATCH', body: { color: e.target.value } });
      if (e.target.matches('[data-name]')) { const r = await api('/tags/' + id, { method: 'PATCH', body: { name: e.target.value } }); if (r.merged_into) toast('Tags merged', 'ok'); }
      S.tags = await api('/tags'); tl.innerHTML = render();
    } catch (er) { fail(er); }
  });
  tl.addEventListener('click', async e => {
    if (!e.target.closest('[data-del]')) return;
    const id = e.target.closest('[data-t]').dataset.t;
    await api('/tags/' + id, { method: 'DELETE' }); S.tags = await api('/tags'); tl.innerHTML = render();
  });
}

/* ---------------- tag input widget */
function tagInput(initial, onChange) {
  let tags = [...initial];
  const el = h(`<div class="tag-input"><input type="text" placeholder="Add tag…"></div>`);
  const input = $('input', el);
  let sug = null, hi = 0;
  const draw = () => {
    $$('.tag', el).forEach(t => t.remove());
    for (const t of tags) {
      const known = S.tags.find(x => x.name.toLowerCase() === t.toLowerCase());
      input.before(h(`<span class="tag"><i style="background:${esc(known?.color || '#7c8aa5')}"></i>${esc(t)}<span class="rm" data-rm="${esc(t)}">✕</span></span>`));
    }
  };
  const add = name => { name = name.trim(); if (name && !tags.some(t => t.toLowerCase() === name.toLowerCase())) { tags.push(name); draw(); onChange(tags); } input.value = ''; closeSug(); };
  const closeSug = () => { sug?.remove(); sug = null; };
  const openSug = () => {
    closeSug();
    const v = input.value.trim().toLowerCase(); if (!v) return;
    const m = S.tags.filter(t => t.name.toLowerCase().includes(v) && !tags.includes(t.name)).slice(0, 8);
    if (!m.length) return;
    hi = 0;
    sug = h(`<div class="suggest">${m.map((t, i) => `<div class="${i === 0 ? 'hi' : ''}" data-n="${esc(t.name)}"><span class="stdot" style="background:${esc(t.color)}"></span>${esc(t.name)} <span class="muted small mono">${t.n}</span></div>`).join('')}</div>`);
    sug.onmousedown = e => { e.preventDefault(); const d = e.target.closest('[data-n]'); if (d) add(d.dataset.n); };
    el.append(sug);
  };
  input.addEventListener('input', openSug);
  input.addEventListener('keydown', e => {
    const items = sug ? $$('[data-n]', sug) : [];
    if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); hi = (hi + 1) % items.length; items.forEach((d, i) => d.classList.toggle('hi', i === hi)); }
    else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); hi = (hi - 1 + items.length) % items.length; items.forEach((d, i) => d.classList.toggle('hi', i === hi)); }
    else if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      if (input.value.trim() || (e.key === 'Enter' && items.length)) { e.preventDefault(); add(items.length && e.key !== ',' ? items[hi].dataset.n : input.value); }
    } else if (e.key === 'Backspace' && !input.value && tags.length) { tags.pop(); draw(); onChange(tags); }
    else if (e.key === 'Escape' && sug) { e.stopPropagation(); closeSug(); }
  });
  input.addEventListener('blur', () => { setTimeout(closeSug, 120); if (input.value.trim()) add(input.value); });
  el.addEventListener('click', e => { const r = e.target.closest('[data-rm]'); if (r) { tags = tags.filter(t => t !== r.dataset.rm); draw(); onChange(tags); } else input.focus(); });
  draw();
  return { el, value: () => { if (input.value.trim()) add(input.value); return tags; }, add };
}

/* ============================================================ detail */
let ViewerMod = null;
// cache key for previews: changes whenever the file content changes (never reuse a cached preview of another file)
// includes the analysed size, so a re-conversion (STEP / OpenSCAD) never shows a stale cached mesh
const contentVer = f => `${(f.sha256 || '').slice(0, 16) || `${f.mtime}-${f.size}`}-${f.dim_x ?? ''}-${f.dim_z ?? ''}-${f.thumb_v ?? ''}`;
function viewerBed() {
  const min = +S.settings.viewer_bed || 350;
  const p = S.printers[0];
  return [Math.max(min, p?.bed_x || 0), Math.max(min, p?.bed_y || 0)];
}
async function loadViewer() {
  if (ViewerMod) return ViewerMod;
  ViewerMod = await import('./viewer.js?v=' + (S.me?.version || ''));
  return ViewerMod;
}

async function openDetail(id) {
  let f;
  try { f = await api('/files/' + id); } catch (e) { fail(e); location.hash = '#/library'; return; }
  if (detailState && (detailState.kind === 'bundle' || detailState.id !== id)) disposeDetail();
  const tab = detailState?.tab || store.get('detailTab', 'overview');
  if (!detailState) {
    const el = h(`<div class="detail"><div class="stage" id="stage"></div><aside id="dside"></aside></div>`);
    $('#overlay-root').prepend(el);
    detailState = { el, id, tab, viewer: null, mode: null };
    document.body.style.overflow = 'hidden';
  }
  detailState.f = f; detailState.id = id; detailState.tab = tab;
  updateSelectionBar();
  renderStage();
  renderDetailSide();
}
function disposeDetail() {
  detailState?.viewer?.dispose();
  detailState?.el.remove();
  detailState = null;
}
function closeDetail(fromRoute) {
  if (!detailState) return;
  disposeDetail();
  updateSelectionBar();
  if (!fromRoute) {
    if (history.length > 1 && S.cameFromApp) history.back(); else location.hash = '#/' + (S.route || 'library');
  }
}
function detailNav(dir) {
  const isB = detailState?.kind === 'bundle';
  const i = S.items.findIndex(x => (x.type === 'bundle') === isB && x.id === detailState?.id);
  if (i < 0) return;
  const n = S.items[i + dir];
  if (n) location.replace(itemHash(n));
}

function stageModes(f) {
  const modes = [];
  if (S.viewerWarned) return f.thumb > 0 ? ['image'] : [];
  if (['stl', 'obj', '3mf'].includes(f.ext) || (['scad', 'step', 'stp'].includes(f.ext) && f.dim_x != null)) modes.push('model');
  if ((f.kind === 'gcode' && f.ext !== 'bgcode') || f.kind === 'sliced') modes.push('gcode');
  if (f.thumb > 0) modes.push('image');
  return modes;
}

async function renderStage() {
  const d = detailState, f = d.f, st = $('#stage', d.el);
  const modes = stageModes(f);
  if (!d.mode || !modes.includes(d.mode)) d.mode = modes[0] || 'none';
  const idx = S.items.findIndex(x => x.type !== 'bundle' && x.id === f.id);
  st.innerHTML = `
    <div class="stage-top">
      <button class="btn" id="d-back">${I.back}<span class="hide-m">Back</span></button>
      <button class="icon-btn" id="d-prev" ${idx > 0 ? '' : 'disabled style="opacity:.3"'} title="Previous (←)">${I.left}</button>
      <button class="icon-btn" id="d-next" ${idx >= 0 && idx < S.items.length - 1 ? '' : 'disabled style="opacity:.3"'} title="Next (→)">${I.right}</button>
      <span class="spacer"></span>
      ${modes.length > 1 ? `<div class="seg">${modes.map(m => `<button data-mode="${m}" class="${d.mode === m ? 'on' : ''}" style="padding:0 12px">${{ model: '3D model', gcode: 'Toolpath', image: 'Image' }[m]}</button>`).join('')}</div>` : ''}
    </div>
    <div class="stage-msg" id="stage-msg"></div>
    <div class="stage-info" id="stage-info"></div>`;
  $('#d-back', st).onclick = () => closeDetail();
  $('#d-prev', st).onclick = () => detailNav(-1);
  $('#d-next', st).onclick = () => detailNav(1);
  $$('[data-mode]', st).forEach(b => b.onclick = () => { d.mode = b.dataset.mode; d.viewer?.dispose(); d.viewer = null; renderStage(); });
  const msg = $('#stage-msg', st);
  const setMsg = html => msg.innerHTML = html;

  if (d.mode === 'image' || d.mode === 'none') {
    d.viewer?.dispose(); d.viewer = null;
    st.insertAdjacentHTML('afterbegin', f.thumb > 0 ? `<div class="static"><img src="/api/files/${f.id}/thumb?v=${f.thumb_v}"></div>`
      : `<div class="static"><div class="ph" style="display:grid;place-items:center;gap:10px;color:var(--muted)">${(KIND_ICON[f.kind] || I.cube).replace('<svg', '<svg width="90" height="90" style="opacity:.4"')}<span class="mono">${f.ext.toUpperCase()} – no preview available</span></div></div>`);
    return;
  }
  setMsg('<div class="spinner"></div>');
  let V;
  try { V = await loadViewer(); }
  catch (e) {
    console.warn('3D viewer unavailable', e);
    if (!S.viewerWarned) { S.viewerWarned = true; toast('3D viewer could not be loaded – showing preview images instead', 'err'); }
    d.mode = 'image';
    return renderStage();
  }
  if (detailState !== d) return;
  const v = d.viewer = new V.Viewer(st, { color: store.get('viewColor', S.settings.render_color || '#f29d38'), bed: viewerBed(), dark: document.documentElement.dataset.theme === 'dark' });
  st.prepend(v.renderer.domElement); // keep canvas under the overlays
  try {
    if (d.mode === 'model') {
      const r = await v.loadMesh(`/api/files/${f.id}/mesh?v=${contentVer(f)}${f.ext === '3mf' ? '&c=1&fmt=2' : ''}`, p => setMsg(`<div><div class="spinner" style="margin:auto"></div><div class="mono small" style="margin-top:8px">${Math.round(p * 100)}%</div></div>`), { firstMs: ['scad', 'step', 'stp'].includes(f.ext) ? 400000 : 60000 });
      $('#stage-info', st).innerHTML = `${fmt.mm(r.x)} × ${fmt.mm(r.y)} × ${fmt.mm(r.z)} mm<br>${fmt.num(r.triangles)} triangles`;
      if (r.palette) {
        const base = p => (p.name || '').replace(/^\d+ · /, '');  // "1 · Generic PLA" -> "Generic PLA"
        const dup = n => r.palette.filter(x => base(x) === n).length > 1;
        st.append(h(`<div class="gc-legend">${r.palette.map(p => `<div title="${esc(p.color.toUpperCase())}"><i style="background:${p.color}"></i>${esc(p.name ? (dup(base(p)) ? `${p.name} · ${p.color.toUpperCase()}` : p.name) : p.color.toUpperCase())}</div>`).join('')}</div>`));
        d.multicolor = true;
      }
    } else {
      if (f.size > 80 * 1024 * 1024 && f.kind === 'gcode' && !d.bigOk) {
        v.dispose(); d.viewer = null;
        setMsg(`<div style="pointer-events:auto">This G-code is ${fmt.bytes(f.size)} – previewing it may be slow.<br><br><button class="btn primary" id="bigok">Load toolpath anyway</button></div>`);
        $('#bigok', st).onclick = () => { d.bigOk = true; renderStage(); };
        return;
      }
      const r = await v.loadGcode(`/api/files/${f.id}/gcode?v=${contentVer(f)}`, p => setMsg(`<div><div class="spinner" style="margin:auto"></div><div class="mono small" style="margin-top:8px">${Math.round(p * 100)}%</div></div>`));
      $('#stage-info', st).innerHTML = `${fmt.mm(r.x)} × ${fmt.mm(r.y)} × ${fmt.mm(r.z)} mm<br>${fmt.num(r.layers)} layers · ${fmt.num(r.segments)} moves`;
      const legend = V.featureLegend(r.features);
      if (legend.length) {
        const lg = h(`<div class="gc-legend">${legend.map(([l, c]) => `<div><i style="background:${c}"></i>${esc(l)}</div>`).join('')}</div>`);
        st.append(lg);
      }
      const lc = h(`<div class="layer-ctl"><span id="lz">${fmt.mm(r.z)}</span><input type="range" min="0" max="${r.layers - 1}" value="${r.layers - 1}"><span>L</span></div>`);
      st.append(lc);
      $('input', lc).oninput = e => { const z = v.setLayer(+e.target.value); $('#lz', lc).textContent = `${(+e.target.value) + 1}`; $('#stage-info', st).innerHTML = `Layer ${(+e.target.value) + 1} / ${r.layers} · Z ${(+z).toFixed(2)} mm<br>${r.features.length ? r.features.slice(0, 6).join(' · ') : ''}`; };
    }
    setMsg('');
  } catch (e) { setMsg(`<div>Preview failed<br><span class="small">${esc(e.message)}</span></div>`); return; }
  addViewerTools(st, v, {
    mesh: d.mode === 'model', multicolor: !!v.multicolor,
    onSnap: async () => {
      const blob = await v.screenshot(640);
      const fd = new FormData(); fd.append('image', blob, 'thumb.png');
      try { await api(`/files/${f.id}/thumb`, { method: 'POST', form: fd }); toast('Thumbnail updated', 'ok'); f.thumb = 3; f.thumb_v = Date.now() % 1e9; patchItem(f.id, { thumb: 3, thumb_v: f.thumb_v }); } catch (er) { fail(er); }
    },
  });
}

function addViewerTools(st, v, { mesh = true, onSnap = null, multicolor = false } = {}) {
  const tools = h(`<div class="stage-tools">
    <button class="icon-btn" data-t="iso" title="Reset view">${I.cube}</button>
    <button class="btn ghost sm" data-t="front">Front</button><button class="btn ghost sm" data-t="top">Top</button><button class="btn ghost sm hide-m" data-t="side">Side</button>
    <span class="sep"></span>
    ${mesh ? `<button class="icon-btn" data-t="wire" title="Wireframe">${I.wire}</button>${multicolor ? '' : `<input type="color" value="${esc(v.color)}" data-t="color" title="Colour" style="width:34px;height:30px">`}` : ''}
    <button class="icon-btn" data-t="rot" title="Auto-rotate">${I.rotate}</button>
    <button class="icon-btn on" data-t="bed" title="Show bed">${I.bed}</button>
    <span class="sep"></span>
    ${onSnap ? `<button class="icon-btn" data-t="snap" title="Use current view as thumbnail">${I.camera}</button>` : ''}
    <button class="icon-btn hide-m" data-t="full" title="Fullscreen">${I.full}</button></div>`);
  st.append(tools);
  tools.addEventListener('click', async e => {
    const b = e.target.closest('[data-t]'); if (!b || b.type === 'color') return;
    const t = b.dataset.t;
    if (['iso', 'front', 'top', 'side'].includes(t)) v.view(t);
    else if (t === 'wire') { b.classList.toggle('on'); v.setWireframe(b.classList.contains('on')); }
    else if (t === 'rot') { b.classList.toggle('on'); v.setAutoRotate(b.classList.contains('on')); }
    else if (t === 'bed') { b.classList.toggle('on'); v.setBedVisible(b.classList.contains('on')); }
    else if (t === 'full') { document.fullscreenElement ? document.exitFullscreen() : st.requestFullscreen?.(); }
    else if (t === 'snap') onSnap?.();
  });
  const col = $('[data-t=color]', tools);
  if (col) col.oninput = e => { v.setColor(e.target.value); store.set('viewColor', e.target.value); };
}

function patchItem(id, patch) {
  const i = S.items.findIndex(x => x.type !== 'bundle' && x.id === id);
  if (i < 0) return;
  Object.assign(S.items[i], patch);
  const old = $(`#cards [data-id="${id}"]`);
  if (old) old.outerHTML = (S.view === 'grid' ? cardHtml : rowHtml)(S.items[i], i);
}

function renderDetailSide() {
  const d = detailState, f = d.f, side = $('#dside', d.el);
  const tabs = [['overview', 'Overview'], ...(f.ext === 'scad' ? [['code', 'Code']] : []), ['print', 'Print', f.prints.length], ['edit', 'Edit'], ['folder', 'Folder', f.siblings.length + f.attachments.length]];
  if (d.tab === 'code' && f.ext !== 'scad') d.tab = 'overview';
  side.innerHTML = `<div class="hd"><div class="row" style="align-items:flex-start"><div style="flex:1;min-width:0"><div class="t">${esc(f.display_name)}</div><div class="p">${esc((f.folder ? f.folder + '/' : '') + f.name)}</div></div>
      <button class="icon-btn ${f.favorite ? 'on' : ''}" id="d-fav" title="Favorite" style="color:${f.favorite ? 'var(--yellow)' : ''}">${f.favorite ? I.star : I.starO}</button>
      <a class="icon-btn" href="/api/files/${f.id}/download" title="Download">${I.download}</a>
      <button class="icon-btn" id="d-more">${I.more}</button></div>
      ${slicersFor(f).length || canSend(f) ? `<div class="row wrap" style="margin-top:12px;gap:6px">${slicersFor(f).map(k => `<button class="btn sm" data-slicer="${k}">${I.cube} Open in ${SLICERS[k].name}</button>`).join('')}${canSend(f) ? `<button class="btn sm primary" id="d-send">${I.upload} Send to printer</button>` : ''}</div>` : ''}</div>
    <div class="tabs">${tabs.map(([k, l, n]) => `<button data-tab="${k}" class="${d.tab === k ? 'on' : ''}">${l}${n ? `<span class="n">${n}</span>` : ''}</button>`).join('')}</div>
    <div class="pane" id="dpane"></div>`;
  $$('[data-tab]', side).forEach(b => b.onclick = () => { d.tab = b.dataset.tab; store.set('detailTab', d.tab); renderDetailSide(); });
  $('#d-fav', side).onclick = () => saveFile({ favorite: !f.favorite });
  $$('[data-slicer]', side).forEach(b => b.onclick = () => openInSlicer(f, b.dataset.slicer));
  $('#d-send', side)?.addEventListener('click', () => sendDialog(f, { onDone: () => openDetail(f.id) }));
  $('#d-more', side).onclick = e => menuAt(e.currentTarget, [
    { label: 'Add to print queue', icon: I.queue, onClick: () => quickQueue(f) },
    { label: 'Move / rename…', icon: I.move, onClick: () => { d.tab = 'edit'; renderDetailSide(); } },
    { label: 'Reset thumbnail', icon: I.refresh, onClick: async () => { await api(`/files/${f.id}/thumb`, { method: 'DELETE' }); toast('Thumbnail will be regenerated'); } },
    { label: 'Copy path', icon: I.folder, onClick: () => navigator.clipboard?.writeText(f.path).then(() => toast('Path copied')) },
    '-',
    { label: 'Delete file', icon: I.trash, danger: true, onClick: async () => { if (await confirmDlg(`Delete <b>${esc(f.name)}</b>? It will be moved to the trash.`, { ok: 'Delete', danger: true })) { await api('/files/' + f.id, { method: 'DELETE' }); toast('Deleted', 'ok'); S.items = S.items.filter(x => x.id !== f.id); $(`#cards [data-id="${f.id}"]`)?.remove(); closeDetail(); refreshMeta(); } } },
  ]);
  const pane = $('#dpane', side);
  ({ overview: paneOverview, code: paneCode, print: panePrint, edit: paneEdit, folder: paneFolder })[d.tab](pane, f);
}

async function saveFile(patch, { silent = false, rerender = true } = {}) {
  const d = detailState; if (!d) return;
  try {
    const f = await api('/files/' + d.f.id, { method: 'PATCH', body: patch });
    d.f = f;
    patchItem(f.id, f);
    if (rerender) renderDetailSide();
    if (!silent) toast('Saved', 'ok');
    if ('tags' in patch || 'collections' in patch || 'folder' in patch) refreshMeta();
  } catch (e) { fail(e); }
}

function paneOverview(p, f) {
  const m = f.meta || {};
  const stats = [];
  if (f.dim_x != null) stats.push(['Size', `${fmt.mm(f.dim_x)}<small>×</small>${fmt.mm(f.dim_y)}<small>×</small>${fmt.mm(f.dim_z)}`, 'mm']);
  if (f.grams) stats.push([f.grams_estimated ? 'Filament (est.)' : 'Filament', fmt.g(f.grams), '']);
  if (f.print_time_s) stats.push(['Print time', fmt.dur(f.print_time_s), '']);
  if (f.volume_cm3) stats.push(['Volume', fmt.num(f.volume_cm3, 1), 'cm³']);
  if (f.triangles) stats.push(['Triangles', fmt.num(f.triangles), '']);
  stats.push(['File', fmt.bytes(f.size), '']);
  const metaRows = [['Slicer', m.slicer], ['Printer', m.printer], ['Material', m.material], ['Layer height', m.layer_height && m.layer_height + ' mm'], ['First layer', m.first_layer_height && m.first_layer_height + ' mm'],
    ['Nozzle', m.nozzle && m.nozzle + ' mm'], ['Infill', m.infill], ['Perimeters', m.perimeters], ['Layers', m.layers], ['Nozzle temp', m.nozzle_temp && m.nozzle_temp + ' °C'], ['Bed temp', m.bed_temp && m.bed_temp + ' °C'],
    ['Supports', m.supports], ['Print profile', m.print_profile], ['Filament profile', m.filament_profile], ['Filament length', m.filament_m && m.filament_m + ' m'], ['Plates', m.plates]].filter(r => r[1] != null && r[1] !== '');
  p.innerHTML = `
    ${f.bundle && f.bundle.parts > 1 ? `<a class="box row" href="#/model/${f.bundle.id}" style="padding:10px 14px;text-decoration:none;color:var(--text)">${I.stack.replace('<svg', '<svg width="18" height="18" style="color:var(--accent)"')}<span style="flex:1">Part of model <b>${esc(f.bundle.name)}</b></span>${I.right.replace('<svg', '<svg width="16" height="16"')}</a>` : ''}
    <div class="stat-row">${stats.slice(0, 6).map(([l, v, u]) => `<div class="stat"><div class="l">${l}</div><div class="v">${v}${u ? ` <small>${u}</small>` : ''}</div></div>`).join('')}</div>
    ${canSend(f) ? `<div class="box" id="d-printers"><h4>Printers</h4>${connectedPrinters().map(pr => `<div class="pr-row" data-pr="${pr.id}" style="padding:6px 0;border-top:1px solid var(--line)">
        <div class="row" style="margin-bottom:4px"><b style="flex:1">${esc(pr.name)}</b>
          ${pr.web_link ? `<a class="btn sm primary" href="${esc(pr.web_link)}" target="_blank" rel="noopener">${pr.conn_type === 'moonraker' ? 'Open Mainsail' : 'Open printer'}</a>` : ''}
          <button class="btn sm" data-sendto="${pr.id}">${I.upload} Send</button></div>
        <div class="pr-st small muted">Checking…</div></div>`).join('')}</div>` : ''}
    ${f.error ? `<div class="box" style="border-color:var(--red)"><h4 style="color:var(--red)">Analysis problem</h4><div class="small mono">${esc(f.error)}</div></div>` : ''}
    ${!f.analyzed ? `<div class="box"><div class="row"><div class="spinner" style="width:18px;height:18px;border-width:2px"></div><span class="muted">Generating preview and metadata…</span></div></div>` : ''}
    <div class="box"><h4>Status</h4><div class="status-pick">${Object.entries(STATUS).map(([k, s]) => `<button data-st="${k}" class="${f.status === k ? 'on' : ''}"><span class="stdot ${s.cls}"></span>${s.label}</button>`).join('')}</div>
      <div class="row" style="margin-top:12px"><span class="muted small" style="width:60px">Rating</span><div class="stars">${[1, 2, 3, 4, 5].map(i => `<button data-r="${i}" class="${f.rating >= i ? 'on' : ''}">★</button>`).join('')}</div></div></div>
    <div class="box"><h4>Tags</h4><div id="d-tags"></div>
      <h4 style="margin-top:14px">Collections</h4><div class="tag-cloud" style="padding:0" id="d-colls">${S.collections.map(c => `<span class="tag ${f.collections.some(x => x.id === c.id) ? 'on' : ''}" data-c="${c.id}"><i style="background:${esc(c.color)}"></i>${esc(c.name)}</span>`).join('')}<span class="tag" data-newc>+ New</span></div></div>
    ${f.fits.length && f.dim_x != null ? `<div class="box"><h4>Fits on</h4><div class="tag-cloud" style="padding:0">${f.fits.map(x => `<span class="tag" style="cursor:default"><i style="background:${x.fits ? 'var(--teal)' : 'var(--red)'}"></i>${esc(x.name)} ${x.fits ? '✓' : '✕'}</span>`).join('')}</div></div>` : ''}
    ${metaRows.length ? `<div class="box"><h4>Slicer settings</h4><dl class="kv">${metaRows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>` : ''}
    ${f.kind === 'archive' ? archiveBox(f) : ''}
    ${f.ext === 'scad' ? scadBox(f) : ''}
    ${['step', 'stp'].includes(f.ext) ? stepBox(f) : ''}
    <div class="box"><h4>Info</h4><dl class="kv">
      ${f.designer ? `<dt>Designer</dt><dd>${esc(f.designer)}</dd>` : ''}${f.license ? `<dt>License</dt><dd>${esc(f.license)}</dd>` : ''}
      ${f.source_url ? `<dt>Source</dt><dd><a href="${esc(f.source_url)}" target="_blank" rel="noopener">${esc(f.source_url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40))}</a></dd>` : ''}
      ${m['3mf_title'] ? `<dt>3MF title</dt><dd>${esc(m['3mf_title'])}</dd>` : ''}
      <dt>Added</dt><dd>${fmt.dt(f.added_at)}</dd><dt>File date</dt><dd>${f.mtime ? new Date(f.mtime * 1000).toLocaleString() : '–'}</dd>
      <dt>Times printed</dt><dd>${f.prints.filter(x => x.result === 'success').reduce((a, x) => a + x.copies, 0)}</dd>
      <dt>SHA-256</dt><dd title="${esc(f.sha256)}">${esc((f.sha256 || '').slice(0, 16))}…</dd></dl>
      ${f.notes ? `<div style="margin-top:12px;white-space:pre-wrap;font-size:13px;border-top:1px solid var(--line);padding-top:10px">${esc(f.notes)}</div>` : ''}</div>
    ${f.duplicates.length ? `<div class="box" style="border-color:var(--yellow)"><h4 style="color:var(--yellow)">Identical copies (${f.duplicates.length})</h4>${f.duplicates.map(x => `<div class="small mono" style="padding:3px 0"><a href="#/file/${x.id}">${esc((x.folder ? x.folder + '/' : '') + x.name)}</a></div>`).join('')}</div>` : ''}`;
  const ti = tagInput(f.tags.map(t => t.name), tags => saveFile({ tags }, { silent: true, rerender: false }).then(() => { })) ;
  $('#d-tags', p).append(ti.el);
  $$('[data-st]', p).forEach(b => b.onclick = () => saveFile({ status: b.dataset.st }, { silent: true }));
  $$('[data-r]', p).forEach(b => b.onclick = () => saveFile({ rating: f.rating === +b.dataset.r ? 0 : +b.dataset.r }, { silent: true }));
  $('#d-colls', p).onclick = async e => {
    const c = e.target.closest('[data-c]');
    if (c) { const ids = f.collections.map(x => x.id); const id = +c.dataset.c; return saveFile({ collections: ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id] }, { silent: true }); }
    if (e.target.closest('[data-newc]')) { const name = await promptDlg('New collection'); if (name) { const c2 = await api('/collections', { method: 'POST', body: { name } }); S.collections.push({ ...c2, n: 0 }); saveFile({ collections: [...f.collections.map(x => x.id), c2.id] }, { silent: true }); } }
  };
  if ($('#d-printers', p)) {
    $$('[data-sendto]', p).forEach(b => b.onclick = () => { store.set('lastSendPrinter', +b.dataset.sendto); sendDialog(f, { onDone: () => openDetail(f.id) }); });
    const refresh = async () => {
      if (!document.body.contains(p) || detailState?.id !== f.id) return;
      await Promise.all($$('[data-pr]', p).map(async row => {
        try { $('.pr-st', row).innerHTML = printerStatusHtml(await api(`/printers/${row.dataset.pr}/status`)); } catch { }
      }));
      setTimeout(refresh, 5000);
    };
    refresh();
  }
  $('#step-reconvert', p)?.addEventListener('click', async () => {
    await api('/files/batch', { method: 'POST', body: { ids: [f.id], action: 'reanalyze' } });
    toast('Converting STEP…'); pollScan(true);
    setTimeout(() => detailState?.id === f.id && openDetail(f.id), 4000);
  });
  $('#scad-rerender', p)?.addEventListener('click', async () => {
    await api('/files/batch', { method: 'POST', body: { ids: [f.id], action: 'reanalyze' } });
    toast('Rendering with OpenSCAD…'); pollScan(true);
    setTimeout(() => detailState?.id === f.id && openDetail(f.id), 3000);
  });
  $('#d-extract', p)?.addEventListener('click', async () => {
    const del = $('#d-extract-del', p).checked;
    try { const r = await api(`/files/${f.id}/extract`, { method: 'POST', body: { delete_archive: del } }); toast(`Extracted ${r.extracted} model file${r.extracted === 1 ? '' : 's'}`, 'ok'); refreshMeta(); if (del) closeDetail(); else refreshVisible(); } catch (e) { fail(e); }
  });
}
function stepBox(f) {
  const m = f.meta || {};
  return `<div class="box"><h4>STEP (CAD)</h4>
    ${m.step_converted ? `<p class="small" style="margin:0 0 10px">Converted to a mesh in ${m.convert_s} s – used for the preview, 3D view, size and filament estimate. OrcaSlicer opens the original STEP.</p>`
      : `<p class="small" style="margin:0 0 10px;color:var(--red)">${esc(m.step_error || 'Not converted yet')}</p>`}
    <div class="row wrap">${m.step_converted ? `<a class="btn sm" href="/api/files/${f.id}/rendered.stl">${I.download} Download STL</a>` : ''}
      <a class="btn sm" href="/api/files/${f.id}/download">${I.download} Download .${esc(f.ext)}</a>
      <button class="btn sm" id="step-reconvert">${I.refresh} Convert again</button></div></div>`;
}
function scadBox(f) {
  const m = f.meta || {};
  return `<div class="box"><h4>OpenSCAD</h4>
    ${m.scad_rendered ? `<p class="small" style="margin:0 0 10px">Rendered to STL in ${m.render_s} s. The 3D view, size, filament estimate and "Open in slicer" use the rendered model.</p>`
      : `<p class="small" style="margin:0 0 10px;color:var(--red)">${esc(m.scad_error || 'Not rendered yet')}</p>`}
    <div class="row wrap">${m.scad_rendered ? `<a class="btn sm" href="/api/files/${f.id}/rendered.stl">${I.download} Download STL</a>` : ''}
      <a class="btn sm" href="/api/files/${f.id}/download">${I.download} Download .scad</a>
      <button class="btn sm" id="scad-rerender">${I.refresh} Render again</button></div>
    <p class="muted small" style="margin:10px 0 0">Tip: in Chrome, click the arrow next to a downloaded .scad → "Always open files of this type", and the Download button opens it straight in OpenSCAD.</p></div>`;
}
function highlightScad(src) {
  const kw = /\b(module|function|if|else|for|let|each|intersection_for|use|include|true|false|undef|assert|echo)\b/;
  const fn = /\b(cube|sphere|cylinder|polyhedron|polygon|circle|square|text|union|difference|intersection|hull|minkowski|translate|rotate|scale|mirror|multmatrix|color|offset|resize|linear_extrude|rotate_extrude|projection|import|surface|render|children)\b/;
  return src.split('\n').map(line => {
    let out = '', rest = line;
    const ci = rest.indexOf('//');
    let comment = '';
    if (ci >= 0) { comment = rest.slice(ci); rest = rest.slice(0, ci); }
    out = esc(rest)
      .replace(/(&quot;.*?&quot;|"[^"]*")/g, '<span class="hs">$1</span>')
      .replace(new RegExp(kw.source, 'g'), '<span class="hk">$1</span>')
      .replace(new RegExp(fn.source, 'g'), '<span class="hf">$1</span>')
      .replace(/\b(\d+\.?\d*)\b/g, '<span class="hn">$1</span>');
    return out + (comment ? `<span class="hc">${esc(comment)}</span>` : '');
  }).join('\n');
}
async function paneCode(p, f) {
  p.innerHTML = '<div class="spinner"></div>';
  try {
    const r = await fetch(`/api/files/${f.id}/source`, { credentials: 'same-origin' });
    if (!r.ok) throw new Error(r.statusText);
    const src = await r.text();
    p.innerHTML = `<div class="row"><span class="muted small" style="flex:1">${src.split('\n').length} lines</span><button class="btn sm" id="code-copy">Copy</button></div>
      <pre class="code">${highlightScad(src)}</pre>`;
    $('#code-copy', p).onclick = () => navigator.clipboard?.writeText(src).then(() => toast('Copied'));
  } catch (e) { p.innerHTML = `<p style="color:var(--red)">${esc(e.message)}</p>`; }
}
function archiveBox(f) {
  const l = f.meta.listing || [];
  return `<div class="box"><h4>Archive contents · ${f.meta.entries || 0} files</h4>
    <div style="max-height:220px;overflow:auto">${l.map(i => `<div class="row small" style="justify-content:space-between;padding:2px 0"><span class="mono" style="word-break:break-all">${esc(i.name)}</span><span class="muted mono">${fmt.bytes(i.size)}</span></div>`).join('')}</div>
    <div class="row" style="margin-top:12px"><button class="btn primary sm" id="d-extract">Extract into library</button><label class="check small"><input type="checkbox" id="d-extract-del"> delete zip afterwards</label></div></div>`;
}

function costCalc(f, { copies = 1, spool, printer, grams, hours }) {
  const st = S.settings;
  const pricePerG = spool ? (spool.price || 0) / (spool.weight_total || 1000) : (+st.default_spool_price || 20) / 1000;
  const watts = printer?.watts || +st.default_watts || 150;
  const mat = grams * copies * pricePerG;
  const energy = hours * watts / 1000 * (+st.kwh_price || 0);
  const labour = hours * (+st.hourly_rate || 0);
  return { mat, energy, labour, total: mat + energy + labour, per: (mat + energy + labour) / copies };
}

function panePrint(p, f) {
  const spools = S.spools.filter(s => !s.archived);
  const defSpool = store.get('lastSpool', spools[0]?.id), defPrinter = store.get('lastPrinter', S.printers[0]?.id);
  p.innerHTML = `
    <div class="box"><h4>Cost estimate</h4>
      <div class="grid2">
        <label class="fld"><span>Copies</span><input type="number" min="1" value="1" id="c-copies"></label>
        <label class="fld"><span>Filament per copy (g)</span><input type="number" min="0" step="0.1" value="${f.grams ?? ''}" id="c-grams"></label>
        <label class="fld"><span>Time per copy (h)</span><input type="number" min="0" step="0.05" value="${f.print_time_s ? (f.print_time_s / 3600).toFixed(2) : ''}" id="c-hours"></label>
        <label class="fld"><span>Spool</span><select id="c-spool"><option value="">Default price</option>${spools.map(s => `<option value="${s.id}" ${s.id == defSpool ? 'selected' : ''}>${esc(s.name)} (${esc(s.material)})</option>`).join('')}</select></label>
        <label class="fld" style="grid-column:1/-1"><span>Printer</span><select id="c-printer"><option value="">Default</option>${S.printers.map(x => `<option value="${x.id}" ${x.id == defPrinter ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      </div>
      <div class="stat-row" style="margin-top:12px" id="c-out"></div>
      ${f.grams_estimated && f.grams ? '<p class="muted small" style="margin:8px 0 0">Filament estimated from mesh volume – slice the model for exact values.</p>' : ''}
      <div class="row" style="margin-top:12px"><button class="btn sm" id="c-queue">${I.queue} Add to queue</button><span class="spacer"></span><button class="btn primary sm" id="c-log">${I.log} Log a print</button></div>
    </div>
    <div><h4 class="muted small" style="text-transform:uppercase;letter-spacing:.8px;margin:4px 0 10px">History</h4><div class="timeline">${f.prints.length ? f.prints.map(x => `
      <div class="tl-item"><div class="ic ${x.result}">${x.result === 'success' ? '✓' : '✕'}</div><div style="flex:1">
        <div><b>${x.copies > 1 ? x.copies + '× ' : ''}${x.result === 'success' ? 'Printed' : x.result === 'failed' ? 'Failed' : 'Cancelled'}</b> <span class="muted">· ${fmt.dt(x.started_at)}</span></div>
        <div class="muted small mono">${[x.printer_name, x.spool_name, x.grams ? fmt.g(x.grams * x.copies) : null, x.duration_s ? fmt.dur(x.duration_s) : null, x.cost ? fmt.money(x.cost) : null].filter(Boolean).map(esc).join(' · ')}</div>
        ${x.notes ? `<div class="small" style="margin-top:4px">${esc(x.notes)}</div>` : ''}</div>
        <button class="icon-btn" data-delprint="${x.id}" title="Delete entry">${I.trash}</button></div>`).join('') : '<p class="muted">Not printed yet.</p>'}</div></div>`;
  const calc = () => {
    const copies = Math.max(1, +$('#c-copies', p).value || 1);
    const spool = S.spools.find(s => s.id == $('#c-spool', p).value);
    const printer = S.printers.find(x => x.id == $('#c-printer', p).value);
    const grams = +$('#c-grams', p).value || 0, hours = (+$('#c-hours', p).value || 0) * copies;
    const c = costCalc(f, { copies, spool, printer, grams, hours });
    $('#c-out', p).innerHTML = `<div class="stat"><div class="l">Material</div><div class="v">${fmt.money(c.mat)}</div></div><div class="stat"><div class="l">Energy${+S.settings.hourly_rate ? ' + labour' : ''}</div><div class="v">${fmt.money(c.energy + c.labour)}</div></div><div class="stat" style="border-color:var(--accent)"><div class="l">Total${copies > 1 ? ` (${fmt.money(c.per)}/pc)` : ''}</div><div class="v" style="color:var(--accent)">${fmt.money(c.total)}</div></div>`;
    if (spool) store.set('lastSpool', spool.id);
    if (printer) store.set('lastPrinter', printer.id);
    return { copies, spool, printer, grams, hours };
  };
  $$('input,select', p).forEach(i => i.addEventListener('input', calc));
  calc();
  $('#c-queue', p).onclick = async () => {
    const c = calc();
    await api('/queue', { method: 'POST', body: { file_id: f.id, copies: c.copies, spool_id: c.spool?.id || null, printer_id: c.printer?.id || null } });
    toast('Added to queue', 'ok'); refreshMeta(); openDetail(f.id);
  };
  $('#c-log', p).onclick = () => { const c = calc(); logPrintDialog({ file: f, copies: c.copies, grams: c.grams, hours: c.hours / c.copies, spool_id: c.spool?.id, printer_id: c.printer?.id, onDone: () => openDetail(f.id) }); };
  p.addEventListener('click', async e => {
    const b = e.target.closest('[data-delprint]'); if (!b) return;
    const restore = await confirmDlg('Delete this print log entry? The filament it used will be returned to its spool.', { ok: 'Delete', danger: true });
    if (!restore) return;
    await api(`/prints/${b.dataset.delprint}?restore_filament=1`, { method: 'DELETE' }); refreshMeta(); openDetail(f.id);
  });
}
async function quickQueue(f) {
  await api('/queue', { method: 'POST', body: { file_id: f.id, copies: 1, spool_id: store.get('lastSpool', null), printer_id: store.get('lastPrinter', null) } });
  toast('Added to queue', 'ok'); refreshMeta();
  if (detailState?.id === f.id) openDetail(f.id);
}

function logPrintDialog({ file, copies = 1, grams, hours, spool_id, printer_id, queue_id, onDone }) {
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const spools = S.spools.filter(s => !s.archived);
  modal({ title: file ? `Log print · ${file.display_name || file.name}` : 'Log a print', body: `
    ${file ? '' : '<label class="fld"><span>What did you print?</span><input type="text" id="l-name" placeholder="Name"></label>'}
    <div class="grid2">
      <label class="fld"><span>Result</span><select id="l-res"><option value="success">Success ✓</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option></select></label>
      <label class="fld"><span>When</span><input type="datetime-local" id="l-at" value="${now.toISOString().slice(0, 16)}"></label>
      <label class="fld"><span>Copies</span><input type="number" min="1" id="l-copies" value="${copies}"></label>
      <label class="fld"><span>Filament per copy (g)</span><input type="number" step="0.1" min="0" id="l-grams" value="${grams ?? ''}"></label>
      <label class="fld"><span>Total print time (h)</span><input type="number" step="0.05" min="0" id="l-hours" value="${hours ? (hours * copies).toFixed(2) : ''}"></label>
      <label class="fld"><span>Spool</span><select id="l-spool"><option value="">—</option>${spools.map(s => `<option value="${s.id}" ${s.id == spool_id ? 'selected' : ''}>${esc(s.name)} · ${fmt.g(s.weight_total - s.weight_used)} left</option>`).join('')}</select></label>
      <label class="fld" style="grid-column:1/-1"><span>Printer</span><select id="l-printer"><option value="">—</option>${S.printers.map(x => `<option value="${x.id}" ${x.id == printer_id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    </div>
    <div class="muted small" id="l-hint"></div>
    <label class="fld"><span>Notes</span><textarea id="l-notes" placeholder="Settings tweaks, issues, who it was for…" style="min-height:70px"></textarea></label>`,
    buttons: [{ label: 'Cancel' }, { label: 'Save to log', cls: 'primary', onClick: async ({ el }) => {
      const at = $('#l-at', el).value;
      const r = await api('/prints', { method: 'POST', body: {
        file_id: file?.id, file_name: $('#l-name', el)?.value || undefined, result: $('#l-res', el).value,
        started_at: at ? new Date(at).toISOString().slice(0, 19).replace('T', ' ') : null,
        copies: +$('#l-copies', el).value || 1, grams: +$('#l-grams', el).value || 0, duration_s: Math.round((+$('#l-hours', el).value || 0) * 3600),
        spool_id: +$('#l-spool', el).value || null, printer_id: +$('#l-printer', el).value || null, notes: $('#l-notes', el).value, queue_id } });
      if (r?.warning) toast(r.warning, 'err'); else toast('Print logged', 'ok');
      refreshMeta(); onDone?.();
    } }] });
  const lm = $$('.modal').pop();
  const pickLoaded = async () => {
    const pid = $('#l-printer', lm).value; const pr = S.printers.find(x => x.id == pid);
    if (!pr || pr.conn_type !== 'moonraker') return;
    try {
      const st = await api(`/printers/${pid}/status`);
      if (st.active_spool && $('#l-spool', lm)) { $('#l-spool', lm).value = st.active_spool.id; $('#l-hint', lm).textContent = `Spool loaded in ${pr.name}: ${st.active_spool.name}`; }
    } catch { }
  };
  $('#l-printer', lm).addEventListener('change', pickLoaded);
  if (!spool_id) pickLoaded();
}

function paneEdit(p, f) {
  p.innerHTML = `
    <label class="fld"><span>Display title</span><input type="text" id="e-title" value="${esc(f.title || '')}" placeholder="${esc(f.name.replace(/\.[^.]+$/, ''))}"></label>
    <div class="grid2"><label class="fld"><span>Designer</span><input type="text" id="e-designer" value="${esc(f.designer)}"></label>
      <label class="fld"><span>License</span><input type="text" id="e-license" value="${esc(f.license)}" list="licenses"></label></div>
    <datalist id="licenses"><option>CC0</option><option>CC-BY 4.0</option><option>CC-BY-SA 4.0</option><option>CC-BY-NC 4.0</option><option>CC-BY-NC-SA 4.0</option><option>GPL-3.0</option><option>MIT</option><option>Standard Digital File License</option><option>Personal use only</option></datalist>
    <label class="fld"><span>Source URL</span><input type="url" id="e-url" value="${esc(f.source_url)}" placeholder="https://www.printables.com/model/…"></label>
    <label class="fld"><span>Notes</span><textarea id="e-notes" placeholder="Print settings, assembly hints, remixes…">${esc(f.notes)}</textarea></label>
    <button class="btn primary" id="e-save">Save details</button>
    <div class="box"><h4>File on disk</h4>
      <label class="fld"><span>File name</span><input type="text" id="e-name" value="${esc(f.name)}"></label>
      <label class="fld" style="margin-top:10px"><span>Folder</span><select id="e-folder">${folderOptions(f.root + '|' + f.folder)}</select></label>
      <button class="btn sm" id="e-move" style="margin-top:12px">${I.move} Rename / move</button></div>
    <div class="box"><h4>Maintenance</h4><div class="row wrap">
      <button class="btn sm" id="e-reanalyze">${I.refresh} Re-analyse & regenerate preview</button>
      <button class="btn sm danger" id="e-delete">${I.trash} Delete file</button></div></div>`;
  $('#e-save', p).onclick = () => saveFile({ title: $('#e-title', p).value, designer: $('#e-designer', p).value, license: $('#e-license', p).value, source_url: $('#e-url', p).value, notes: $('#e-notes', p).value });
  $('#e-move', p).onclick = () => { const [root, folder] = $('#e-folder', p).value.split('|'); if (root !== f.root) return toast('Moving between library roots is not supported', 'err'); saveFile({ name: $('#e-name', p).value, folder }).then(refreshMeta); };
  $('#e-reanalyze', p).onclick = async () => { await api('/files/batch', { method: 'POST', body: { ids: [f.id], action: 'reanalyze' } }); toast('Re-analysing…'); setTimeout(() => openDetail(f.id), 2500); };
  $('#e-delete', p).onclick = () => $('#d-more').click();
}

function paneFolder(p, f) {
  p.innerHTML = `
    ${f.attachments.length ? `<div><h4 class="muted small" style="text-transform:uppercase;letter-spacing:.8px;margin:0 0 8px">Images & documents</h4><div class="attach-grid">${f.attachments.map(a => {
      const url = `/api/files/${f.id}/attachment/${encodeURIComponent(a.name)}`;
      return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(a.ext) ? `<a href="${url}" target="_blank" title="${esc(a.name)}"><img src="${url}" loading="lazy"></a>` : `<a class="doc" href="${url}" target="_blank" title="${esc(a.name)}">${esc(a.ext)}</a>`;
    }).join('')}</div></div>` : ''}
    <div><h4 class="muted small" style="text-transform:uppercase;letter-spacing:.8px;margin:0 0 8px">Other files in /${esc(f.folder)}</h4>
    ${f.siblings.length ? `<div class="sib-grid">${f.siblings.map(s => `<div class="sib" data-id="${s.id}" title="${esc(s.name)}"><div class="th">${s.thumb > 0 ? `<img src="/api/files/${s.id}/thumb?v=${s.thumb_v}" loading="lazy">` : `<span class="badge ${badgeCls(s.ext)}">${esc(s.ext)}</span>`}</div><div class="n">${esc(s.display_name)}</div></div>`).join('')}</div>` : '<p class="muted">No other files in this folder.</p>'}</div>
    <button class="btn sm" id="f-show">${I.folder} Show folder in library</button>`;
  $$('.sib', p).forEach(s => s.onclick = () => location.replace('#/file/' + s.dataset.id));
  $('#f-show', p).onclick = () => { S.f = { ...S.f, root: f.root, folder: f.folder, collection: '', tag: [], q: '', kind: '', status: '' }; location.hash = '#/library'; setTimeout(() => { renderLibraryTop(); applyFilters(); }, 0); };
}

/* ============================================================ models (folder bundles) */
function bundleMenu(b, x, y) {
  const ids = b.part_ids;
  menu(x, y, [
    { label: 'Open folder', icon: I.folder, onClick: () => enterBundle(b) },
    { label: 'All parts in 3D', icon: I.cube, onClick: () => location.hash = '#/model/' + b.id },
    { label: 'Download all parts (zip)', icon: I.download, onClick: () => downloadZip(ids) },
    { label: 'Add all parts to queue', icon: I.queue, onClick: () => batch(ids, 'queue').then(() => toast('Added to queue', 'ok')) },
    { label: b.favorite ? 'Remove from favorites' : 'Add to favorites', icon: I.star, onClick: () => batch(ids, 'favorite', !b.favorite) },
    '-', { header: 'Status (all parts)' },
    ...Object.entries(STATUS).map(([k, s]) => ({ html: `<span class="stdot ${s.cls}"></span> ${s.label}${b.status === k ? ' ✓' : ''}`, onClick: () => batch(ids, 'status', k) })),
    '-',
    { label: 'Tags…', icon: I.tag, onClick: () => batchTags(ids) },
    { label: 'Add to collection…', icon: I.coll, onClick: () => batchCollection(ids) },
    ...((b.collections || []).length ? [{ label: 'Remove from collection…', icon: I.x, onClick: () => batchUncollect(ids, b.collections) }] : []),
    { label: 'Show files separately (ungroup)', icon: I.x, onClick: async () => { await api('/bundles/' + b.id, { method: 'DELETE' }); await loadMeta(); renderSideLibrary(); reloadList(); } },
    '-',
    { label: `Delete model (${ids.length} files)`, icon: I.trash, danger: true, onClick: () => batchDelete(ids) },
  ]);
}

async function openBundle(id) {
  let b;
  try { b = await api('/bundles/' + id); } catch (e) { fail(e); location.hash = '#/library'; return; }
  if (detailState) disposeDetail();
  const el = h(`<div class="detail"><div class="stage" id="stage"></div><aside id="dside"></aside></div>`);
  $('#overlay-root').prepend(el);
  detailState = { el, id, kind: 'bundle', b, tab: store.get('bundleTab', 'parts'), viewer: null, mode: null };
  updateSelectionBar();
  renderBundleStage();
  renderBundleSide();
}
async function reloadBundle() {
  const d = detailState; if (!d || d.kind !== 'bundle') return;
  try { d.b = await api('/bundles/' + d.id); renderBundleSide(); } catch (e) { fail(e); }
}

async function renderBundleStage() {
  const d = detailState, b = d.b, st = $('#stage', d.el);
  const idx = S.items.findIndex(x => x.type === 'bundle' && x.id === b.id);
  const modes = S.viewerWarned || !b.has_mesh ? ['image'] : ['model', 'image'];
  if (!d.mode || !modes.includes(d.mode)) d.mode = modes[0];
  st.innerHTML = `<div class="stage-top">
      <button class="btn" id="d-back">${I.back}<span class="hide-m">Back</span></button>
      <button class="icon-btn" id="d-prev" ${idx > 0 ? '' : 'disabled style="opacity:.3"'} title="Previous (←)">${I.left}</button>
      <button class="icon-btn" id="d-next" ${idx >= 0 && idx < S.items.length - 1 ? '' : 'disabled style="opacity:.3"'} title="Next (→)">${I.right}</button>
      <span class="spacer"></span>
      ${modes.length > 1 ? `<div class="seg">${modes.map(m => `<button data-mode="${m}" class="${d.mode === m ? 'on' : ''}" style="padding:0 12px">${{ model: 'All parts 3D', image: 'Preview' }[m]}</button>`).join('')}</div>` : ''}
    </div><div class="stage-msg" id="stage-msg"></div><div class="stage-info" id="stage-info"></div>`;
  $('#d-back', st).onclick = () => closeDetail();
  $('#d-prev', st).onclick = () => detailNav(-1);
  $('#d-next', st).onclick = () => detailNav(1);
  $$('[data-mode]', st).forEach(x => x.onclick = () => { d.mode = x.dataset.mode; d.viewer?.dispose(); d.viewer = null; renderBundleStage(); });
  const setMsg = html => $('#stage-msg', st).innerHTML = html;
  if (d.mode === 'image') {
    st.insertAdjacentHTML('afterbegin', `<div class="static"><img src="/api/bundles/${b.id}/thumb?v=${b.thumb_v}" onerror="this.remove()"></div>`);
    return;
  }
  setMsg('<div class="spinner"></div>');
  let V;
  try { V = await loadViewer(); } catch (e) {
    S.viewerWarned = true; toast('3D viewer could not be loaded – showing preview images instead', 'err');
    d.mode = 'image'; return renderBundleStage();
  }
  if (detailState !== d) return;
  const v = d.viewer = new V.Viewer(st, { color: store.get('viewColor', S.settings.render_color || '#f29d38'), bed: viewerBed(), dark: document.documentElement.dataset.theme === 'dark' });
  st.prepend(v.renderer.domElement);
  try {
    const r = await v.loadMesh(`/api/bundles/${b.id}/mesh?v=${b.thumb_v}`, p => setMsg(`<div><div class="spinner" style="margin:auto"></div><div class="mono small" style="margin-top:8px">${Math.round(p * 100)}%</div></div>`), { firstMs: b.exts.some(e => ['scad', 'step', 'stp'].includes(e)) ? 400000 : 90000 });
    $('#stage-info', st).innerHTML = `${b.models} parts laid out on the plate<br>${fmt.num(r.triangles)} triangles`;
    setMsg('');
  } catch (e) { setMsg(`<div>Preview failed<br><span class="small">${esc(e.message)}</span></div>`); return; }
  addViewerTools(st, v, { mesh: true });
}

function renderBundleSide() {
  const d = detailState, b = d.b, side = $('#dside', d.el);
  const tabs = [['parts', 'Parts', b.parts], ['info', 'Info'], ['history', 'Prints', b.prints.length]];
  side.innerHTML = `<div class="hd"><div class="row" style="align-items:flex-start"><div style="flex:1;min-width:0">
        <div class="t">${I.stack.replace('<svg', '<svg width="17" height="17" style="vertical-align:-2px;color:var(--accent);margin-right:6px"')}${esc(b.name)}</div><div class="p">${esc(b.folder)}/</div></div>
      <button class="icon-btn" id="b-dl" title="Download all parts">${I.download}</button>
      <button class="icon-btn" id="b-more">${I.more}</button></div>
      <div class="stat-row" style="margin-top:14px">
        <div class="stat"><div class="l">Parts</div><div class="v">${b.models}</div></div>
        <div class="stat"><div class="l">Filament${b.grams_estimated ? ' (est.)' : ''}</div><div class="v">${b.grams ? fmt.g(b.grams) : '–'}</div></div>
        <div class="stat"><div class="l">Print time</div><div class="v">${b.print_time_s ? fmt.dur(b.print_time_s) : '–'}</div></div></div>
      <div class="row wrap" style="margin-top:12px;gap:6px"><button class="btn sm primary" id="b-queue">${I.queue} Queue all parts</button>${b.in_queue ? `<span class="muted small">${b.in_queue} in queue</span>` : ''}</div></div>
    <div class="tabs">${tabs.map(([k, l, n]) => `<button data-tab="${k}" class="${d.tab === k ? 'on' : ''}">${l}${n ? `<span class="n">${n}</span>` : ''}</button>`).join('')}</div>
    <div class="pane" id="dpane"></div>`;
  $$('[data-tab]', side).forEach(x => x.onclick = () => { d.tab = x.dataset.tab; store.set('bundleTab', d.tab); renderBundleSide(); });
  $('#b-dl', side).onclick = () => downloadZip(b.part_ids);
  $('#b-queue', side).onclick = async () => { await batch(b.part_ids, 'queue', null, { reload: false }); toast(`${b.part_ids.length} parts added to queue`, 'ok'); reloadBundle(); };
  $('#b-more', side).onclick = e => menuAt(e.currentTarget, [
    { label: 'Rename model…', icon: I.tag, onClick: async () => { const n = await promptDlg('Model name', b.name); if (n) { await api('/bundles/' + b.id, { method: 'PATCH', body: { name: n } }); reloadBundle(); refreshMeta(); } } },
    { label: 'Show folder in library', icon: I.folder, onClick: () => { S.f = { ...S.f, root: b.root, folder: b.folder, collection: '', tag: [], q: '', kind: '', status: '' }; location.hash = '#/library'; setTimeout(() => { renderLibraryTop(); applyFilters(); }, 0); } },
    { label: 'Show files separately (ungroup)', icon: I.x, onClick: async () => { await api('/bundles/' + b.id, { method: 'DELETE' }); await loadMeta(); closeDetail(); setTimeout(reloadList, 50); } },
    '-',
    { label: `Delete model (${b.part_ids.length} files)`, icon: I.trash, danger: true, onClick: async () => { if (await confirmDlg(`Delete all ${b.part_ids.length} files of <b>${esc(b.name)}</b>? They are moved to the trash.`, { ok: 'Delete', danger: true })) { await batch(b.part_ids, 'delete', null, { reload: false }); toast('Model deleted', 'ok'); closeDetail(); setTimeout(reloadList, 50); refreshMeta(); } } },
  ]);
  const pane = $('#dpane', side);
  ({ parts: paneBundleParts, info: paneBundleInfo, history: paneBundleHistory })[d.tab](pane, b);
}

function paneBundleParts(p, b) {
  const parts = b.part_items;
  p.innerHTML = `
    <div class="box"><h4>Status – all parts</h4><div class="status-pick">${Object.entries(STATUS).map(([k, s]) => `<button data-st="${k}" class="${b.status === k ? 'on' : ''}"><span class="stdot ${s.cls}"></span>${s.label}</button>`).join('')}</div>
      <h4 style="margin-top:14px">Tags – all parts</h4><div id="b-tags"></div></div>
    <div style="display:flex;flex-direction:column;gap:6px">${parts.map(f => {
      const sl = slicersFor(f);
      return `<div class="tl-item" style="align-items:center;padding:8px">
        <div style="width:52px;height:52px;border-radius:7px;background:var(--bed);flex:none;display:grid;place-items:center;cursor:pointer" data-open="${f.id}">${f.thumb > 0 ? `<img src="/api/files/${f.id}/thumb?v=${f.thumb_v}" style="width:92%;height:92%;object-fit:contain" loading="lazy">` : `<span class="badge ${badgeCls(f.ext)}">${esc(f.ext)}</span>`}</div>
        <div style="flex:1;min-width:0"><div style="font-weight:600;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" data-open="${f.id}" title="${esc(f.name)}">${esc(f.display_name)} <span class="stdot ${(STATUS[f.status] || STATUS.none).cls}" title="${(STATUS[f.status] || STATUS.none).label}"></span></div>
          <div class="muted small mono">${[f.folder !== b.folder ? f.folder.slice(b.folder.length + 1) + '/' : '', f.dim_x != null ? `${fmt.mm(f.dim_x)}×${fmt.mm(f.dim_y)}×${fmt.mm(f.dim_z)}` : f.ext.toUpperCase(), f.grams ? (f.grams_estimated ? '~' : '') + fmt.g(f.grams) : '', f.print_time_s ? fmt.dur(f.print_time_s) : ''].filter(Boolean).join(' · ')}</div></div>
        <div class="row" style="gap:2px">${sl.map(k => `<button class="btn ghost sm" data-slicer="${k}" data-f="${f.id}" title="Open in ${SLICERS[k].name}">${SLICERS[k].name.replace('Slicer', '').replace(' Studio', '')}</button>`).join('')}
          ${canSend(f) ? `<button class="icon-btn" data-send="${f.id}" title="Send to printer">${I.upload}</button>` : ''}
          <button class="icon-btn" data-q="${f.id}" title="Add to queue">${I.queue}</button></div></div>`;
    }).join('')}</div>`;
  const tagNames = b.tags.map(t => t.name);
  const ti = tagInput(tagNames, async tags => {
    const add = tags.filter(t => !tagNames.includes(t)), rm = tagNames.filter(t => !tags.includes(t));
    if (add.length) await batch(b.part_ids, 'add_tags', add, { reload: false });
    if (rm.length) await batch(b.part_ids, 'remove_tags', rm, { reload: false });
    tagNames.splice(0, tagNames.length, ...tags);
    refreshMeta();
  });
  $('#b-tags', p).append(ti.el);
  $$('[data-st]', p).forEach(x => x.onclick = async () => { await batch(b.part_ids, 'status', x.dataset.st, { reload: false }); reloadBundle(); });
  const byId = id => parts.find(x => x.id === +id);
  p.addEventListener('click', async e => {
    const o = e.target.closest('[data-open]'); if (o) return location.hash = '#/file/' + o.dataset.open;
    const sl = e.target.closest('[data-slicer]'); if (sl) return openInSlicer(byId(sl.dataset.f), sl.dataset.slicer);
    const sd = e.target.closest('[data-send]'); if (sd) return sendDialog(byId(sd.dataset.send), { onDone: reloadBundle });
    const q = e.target.closest('[data-q]'); if (q) { await quickQueue(byId(q.dataset.q)); reloadBundle(); }
  });
}

function paneBundleInfo(p, b) {
  p.innerHTML = `
    <label class="fld"><span>Model name</span><input type="text" id="b-name" value="${esc(b.name)}"></label>
    <label class="fld"><span>Notes</span><textarea id="b-notes" placeholder="Assembly order, screws needed, print settings…">${esc(b.notes || '')}</textarea></label>
    <button class="btn primary" id="b-save">Save</button>
    ${b.fits.length ? `<div class="box"><h4>All parts fit on</h4><div class="tag-cloud" style="padding:0">${b.fits.map(x => `<span class="tag" style="cursor:default"><i style="background:${x.fits ? 'var(--teal)' : x.fits === false ? 'var(--red)' : 'var(--line2)'}"></i>${esc(x.name)} ${x.fits ? '✓' : x.fits === false ? '✕' : '?'}</span>`).join('')}</div></div>` : ''}
    ${b.attachments.length ? `<div class="box"><h4>Images & documents</h4><div class="attach-grid">${b.attachments.map(a => {
      const url = `/api/bundles/${b.id}/attachment/${a.name.split('/').map(encodeURIComponent).join('/')}`;
      return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(a.ext) ? `<a href="${url}" target="_blank" title="${esc(a.name)}"><img src="${url}" loading="lazy"></a>` : `<a class="doc" href="${url}" target="_blank" title="${esc(a.name)}">${esc(a.ext)}</a>`;
    }).join('')}</div></div>` : ''}
    <div class="box"><h4>Info</h4><dl class="kv"><dt>Folder</dt><dd>${esc(b.root)}/${esc(b.folder)}</dd><dt>Files</dt><dd>${b.parts}</dd><dt>Types</dt><dd>${esc(b.exts.join(', '))}</dd><dt>Total size</dt><dd>${fmt.bytes(b.size)}</dd><dt>Last added</dt><dd>${fmt.dt(b.added_at)}</dd></dl></div>`;
  $('#b-save', p).onclick = async () => {
    try { await api('/bundles/' + b.id, { method: 'PATCH', body: { name: $('#b-name', p).value, notes: $('#b-notes', p).value } }); toast('Saved', 'ok'); reloadBundle(); refreshMeta(); } catch (e) { fail(e); }
  };
}

function paneBundleHistory(p, b) {
  p.innerHTML = `<div class="timeline">${b.prints.length ? b.prints.map(x => `
    <div class="tl-item"><div class="ic ${x.result}">${x.result === 'success' ? '✓' : '✕'}</div><div style="flex:1">
      <div><b>${esc(x.file_name)}</b>${x.copies > 1 ? ` ×${x.copies}` : ''} <span class="muted">· ${fmt.dt(x.started_at)}</span></div>
      <div class="muted small mono">${[x.printer_name, x.grams ? fmt.g(x.grams * x.copies) : null, x.duration_s ? fmt.dur(x.duration_s) : null, x.cost ? fmt.money(x.cost) : null].filter(Boolean).map(esc).join(' · ')}</div></div></div>`).join('')
    : '<p class="muted">No part of this model has been printed yet. Log prints from a part (click it) or from the queue.</p>'}</div>`;
}

/* ============================================================ upload */
async function collectDropped(dt) {
  const out = [];
  const items = [...(dt.items || [])].map(i => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!items.length) return [...dt.files].map(f => ({ file: f, path: f.name }));
  const walk = async (entry, prefix) => {
    if (entry.isFile) { const file = await new Promise((res, rej) => entry.file(res, rej)); out.push({ file, path: prefix + file.name }); }
    else if (entry.isDirectory) {
      const reader = entry.createReader();
      for (;;) { const batch = await new Promise((res, rej) => reader.readEntries(res, rej)); if (!batch.length) break; for (const e of batch) await walk(e, prefix + entry.name + '/'); }
    }
  };
  for (const e of items) await walk(e, '');
  return out;
}

function uploadError(x, data) {
  if (data?.error) return data.error;
  if (data?.errors?.length) return data.errors[0];
  if (x.status === 413) return 'file too large for the reverse proxy – raise client_max_body_size in NPMplus (Advanced tab)';
  if (x.status === 401) return 'not logged in – reload the page';
  if (x.status === 0) return 'no response – connection interrupted';
  if ((x.responseURL || '').includes('authelia') || /authelia/i.test(x.responseText || '')) return 'Authelia login page returned instead of the app – session expired or the upload URL is not covered by the Authelia rule';
  if (x.status === 502 || x.status === 504) return `proxy error ${x.status} – the app did not answer in time (proxy_read_timeout?)`;
  return `HTTP ${x.status} ${x.statusText || ''}`.trim();
}
const OK_EXT = /\.(stl|3mf|obj|step|stp|iges|igs|f3d|scad|blend|fcstd|skp|dxf|dwg|gcode|gco|g|bgcode|zip|jpe?g|png|webp|gif|pdf|txt|md)$/i;
function openUpload(initial = []) {
  let files = [];
  // inside an open model folder a new upload goes NEXT to that model, not into it (it would become one of its parts)
  // folder and collection are only taken over from what is open in the Library - not from an old visit (Home)
  const inLib = S.route === 'library';
  const openModel = inLib && insideBundle() ? bundleAt(S.f.root, S.f.folder) : null;
  const curFolder = openModel ? openModel.root + '|' + openModel.path.split('/').slice(0, -1).join('/')
    : inLib && S.f.root && S.f.folder != null ? S.f.root + '|' + S.f.folder : (S.folders[0]?.root || '') + '|';
  const curColl = inLib ? S.f.collection : '';
  const m = modal({ title: 'Upload to library', size: 'lg', body: `
    <div class="dropzone" id="dz">${I.upload}<b>Drop files or folders here</b><span>or <a href="#" id="pick-files">choose files</a> · <a href="#" id="pick-dir">choose a folder</a></span>
      <span class="small" style="display:block;margin-top:6px;opacity:.75">Tip: drag a folder from Explorer – "choose a folder" makes the browser ask for confirmation.</span>
      <input type="file" multiple hidden id="in-files"><input type="file" webkitdirectory multiple hidden id="in-dir"></div>
    <div class="grid2">
      <label class="fld"><span>Destination folder</span><select id="u-folder">${folderOptions(curFolder)}</select></label>
      <label class="fld"><span>New subfolder (optional)</span><input type="text" id="u-sub" placeholder="e.g. Printables/Dragon"></label>
    </div>
    <div class="box small hidden" id="u-model-hint" style="padding:8px 12px;border-color:var(--yellow);color:var(--text2)"></div>
    ${openModel ? `<label class="check small" style="margin-top:-4px"><input type="checkbox" id="u-into"> Add the files to the open model <b>${esc(openModel.name)}</b> as new parts</label>` : ''}
    <div class="grid2"><label class="fld"><span>Tags for uploaded files</span><div id="u-tags"></div></label>
      <label class="fld"><span>Add to collection</span><select id="u-coll"><option value="">—</option>${S.collections.map(c => `<option value="${c.id}" ${curColl && curColl == c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label></div>
    <div class="row wrap" style="gap:18px"><label class="check"><input type="checkbox" id="u-bundle" ${store.get('bundleFolders', true) ? 'checked' : ''}> Each uploaded folder / ZIP is one model</label>
    <label class="check"><input type="checkbox" id="u-zip" ${store.get('extractZips', true) ? 'checked' : ''}> Extract ZIP archives automatically</label></div>
    <div class="box hidden small" id="u-err" style="border-color:var(--red);color:var(--red);display:flex;flex-direction:column;gap:4px"></div>
    <div class="up-list" id="u-list"></div>`,
    buttons: [{ label: 'Close' }, { label: 'Upload', cls: 'primary', onClick: async ({ el }) => { await run(el); return false; } }] });
  const el = m.el;
  const modelHint = () => {
    const [r, fo] = $('#u-folder', el).value.split('|');
    const sub = $('#u-sub', el).value.trim().replace(/^\/+|\/+$/g, '');
    const b = bundleAt(r, [fo, sub].filter(Boolean).join('/'));
    const hint = $('#u-model-hint', el);
    hint.classList.toggle('hidden', !b);
    if (b) hint.innerHTML = `This folder belongs to the model <b>${esc(b.name)}</b> – uploaded files become parts of it.`;
  };
  $('#u-folder', el).onchange = () => { if ($('#u-into', el)) $('#u-into', el).checked = false; modelHint(); };
  $('#u-sub', el).oninput = modelHint;
  $('#u-into', el)?.addEventListener('change', e => {
    $('#u-folder', el).value = e.target.checked ? openModel.root + '|' + openModel.path : curFolder;
    modelHint();
  });
  modelHint();
  const ti = tagInput([], () => { });
  $('#u-tags', el).append(ti.el);
  const add = list => {
    for (const it of list) { if (!OK_EXT.test(it.path)) continue; if (!files.some(f => f.path === it.path && f.file.size === it.file.size)) files.push({ ...it, progress: 0, state: '' }); }
    draw();
  };
  const draw = () => {
    const total = files.reduce((a, f) => a + f.file.size, 0);
    $('#u-list', el).innerHTML = files.length ? `<div class="muted small">${files.length} files · ${fmt.bytes(total)}</div>` + files.map(f => `<div class="up-item"><span class="nm mono" title="${esc(f.path)}">${esc(f.path)}</span><div class="meter"><i style="width:${f.progress * 100}%;background:${f.state === 'err' ? 'var(--red)' : f.state === 'done' ? 'var(--teal)' : 'var(--accent)'}"></i></div><span class="muted small mono" style="text-align:right;${f.state === 'err' ? 'color:var(--red)' : ''}" title="${esc(f.error || '')}">${f.state === 'err' ? 'error' : f.state === 'done' ? '✓' : fmt.bytes(f.file.size)}</span></div>`).join('') : '';
  };
  const dz = $('#dz', el);
  $('#pick-files', el).onclick = e => { e.preventDefault(); $('#in-files', el).click(); };
  $('#pick-dir', el).onclick = e => { e.preventDefault(); $('#in-dir', el).click(); };
  $('#in-files', el).onchange = e => add([...e.target.files].map(f => ({ file: f, path: f.name })));
  $('#in-dir', el).onchange = e => add([...e.target.files].map(f => ({ file: f, path: f.webkitRelativePath || f.name })));
  dz.onclick = e => { if (e.target === dz || e.target.closest('svg,b')) $('#in-files', el).click(); };
  dz.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', async e => { e.preventDefault(); e.stopPropagation(); dz.classList.remove('over'); add(await collectDropped(e.dataTransfer)); });
  add(initial);

  let running = false;
  async function run(el) {
    if (running) return;
    const todo = files.filter(f => f.state !== 'done');
    if (!todo.length) return toast('Add some files first');
    running = true;
    store.set('extractZips', $('#u-zip', el).checked);
    store.set('bundleFolders', $('#u-bundle', el).checked);
    const bundleF = $('#u-bundle', el).checked ? '1' : '0';
    const [root, folder] = $('#u-folder', el).value.split('|');
    const sub = $('#u-sub', el).value.trim().replace(/^\/+|\/+$/g, '');
    const dest = [folder, sub].filter(Boolean).join('/');
    const tags = ti.value().join(','), coll = $('#u-coll', el).value, zip = $('#u-zip', el).checked ? '1' : '0';
    let ok = 0, bad = 0;
    const errors = [];
    const one = f => new Promise(res => {
      const fd = new FormData();
      fd.append('root', root); fd.append('folder', dest); fd.append('tags', tags); fd.append('collection', coll); fd.append('extract_zips', zip); fd.append('bundle_folders', bundleF);
      fd.append('files', f.file, f.path);
      const x = new XMLHttpRequest();
      x.open('POST', '/api/upload');
      x.upload.onprogress = e => { if (e.lengthComputable) { f.progress = e.loaded / e.total; draw(); } };
      x.onload = () => {
        let data = null; try { data = JSON.parse(x.responseText); } catch { }
        f.progress = 1;
        if (x.status < 300 && data && !data.errors?.length) {
          if (!data.saved?.length && data.skipped?.length) { f.state = 'err'; f.error = 'file type not supported'; bad++; }
          else { f.state = 'done'; ok++; }
        } else {
          f.state = 'err'; bad++;
          f.error = uploadError(x, data);
          errors.push(f.error);
        }
        draw(); res();
      };
      x.onerror = () => { f.state = 'err'; bad++; f.error = 'network error – the connection to the server or proxy was interrupted (proxy timeout / upload limit?)'; errors.push(f.error); draw(); res(); };
      x.send(fd);
    });
    const queue = [...todo];
    await Promise.all([0, 1, 2].map(async () => { while (queue.length) await one(queue.shift()); }));
    running = false;
    toast(`Uploaded ${ok} file${ok === 1 ? '' : 's'}${bad ? `, ${bad} failed` : ''}${ok ? ' – previews are being generated' : ''}`, bad ? 'err' : 'ok');
    if (errors.length) {
      const uniq = [...new Set(errors.map(e => e.replace(/^[^:]*: /, '')))];
      $('#u-err', el).innerHTML = `<b>Upload problem</b>${uniq.slice(0, 4).map(e => `<div>${esc(e)}</div>`).join('')}`;
      $('#u-err', el).classList.remove('hidden');
    }
    await loadMeta(); renderNav();
    if (S.route === 'library') { renderSideLibrary(); reloadList(); }
    pollScan(true);
    if (!bad) m.close();
  }
}
// global drag & drop
let dragDepth = 0;
window.addEventListener('dragenter', e => { if (e.dataTransfer?.types.includes('Files') && !$('.modal')) { dragDepth++; $('#dropveil').classList.remove('hidden'); } });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#dropveil').classList.add('hidden'); } });
window.addEventListener('dragover', e => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
window.addEventListener('drop', async e => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  e.preventDefault(); dragDepth = 0; $('#dropveil').classList.add('hidden');
  if ($('.modal')) return;
  openUpload(await collectDropped(e.dataTransfer));
});

/* ============================================================ collections page */
PAGES.collections = async () => {
  topbar('Collections', `<span class="spacer"></span><button class="btn primary" id="newc">${I.plus} New collection</button>`);
  $('#newc').onclick = () => editCollection();
  S.collections = await api('/collections');
  $('#view').innerHTML = `<div class="page wide"><p class="lead">Group models across folders – a project, a gift list, a printer upgrade set.</p>
    ${S.collections.length ? `<div class="cards" style="padding:0">${S.collections.map(c => `<div class="card" data-c="${c.id}"><div class="th" style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;place-items:stretch">
      ${[0, 1, 2, 3].map(i => c.covers[i] ? `<img src="/api/files/${c.covers[i]}/thumb" style="width:100%;height:100%;object-fit:contain;padding:6px" loading="lazy">` : '<div></div>').join('')}
      <div class="tr"><button class="icon-btn" data-edit="${c.id}" style="background:rgba(10,12,16,.5);color:#fff">${I.more}</button></div><div class="stbar" style="background:${esc(c.color)}"></div></div>
      <div class="body"><div class="nm">${esc(c.name)}</div><div class="sub"><span>${c.n} files</span></div>${c.description ? `<div class="muted small" style="margin-top:4px">${esc(c.description)}</div>` : ''}</div></div>`).join('')}</div>`
      : `<div class="empty">${I.coll}<h3>No collections yet</h3><p>Create one, then add files from the library (select → Collection).</p></div>`}</div>`;
  $('#view').onclick = e => {
    const ed = e.target.closest('[data-edit]');
    if (ed) { e.stopPropagation(); return editCollection(S.collections.find(c => c.id == ed.dataset.edit)); }
    const c = e.target.closest('[data-c]');
    if (c) { S.f = { ...S.f, collection: c.dataset.c, root: '', folder: null, tag: [], q: '' }; location.hash = '#/library'; }
  };
};
function editCollection(c) {
  const isNew = !c;
  modal({ title: isNew ? 'New collection' : 'Edit collection', body: `<label class="fld"><span>Name</span><input type="text" id="cn" value="${esc(c?.name || '')}"></label>
    <label class="fld"><span>Description</span><textarea id="cd" style="min-height:60px">${esc(c?.description || '')}</textarea></label>
    <label class="fld"><span>Colour</span><input type="color" id="cc" value="${esc(c?.color || '#f29d38')}"></label>`,
    buttons: [...(isNew ? [] : [{ label: 'Delete', cls: 'danger', onClick: async () => { if (await confirmDlg('Delete this collection? Files stay in the library.', { ok: 'Delete', danger: true })) { await api('/collections/' + c.id, { method: 'DELETE' }); refreshMeta(); PAGES.collections(); } } }]),
      { label: 'Cancel' }, { label: 'Save', cls: 'primary', onClick: async ({ el }) => {
        const body = { name: $('#cn', el).value.trim(), description: $('#cd', el).value, color: $('#cc', el).value };
        if (!body.name) throw new Error('Name required');
        await api(isNew ? '/collections' : '/collections/' + c.id, { method: isNew ? 'POST' : 'PATCH', body });
        refreshMeta(); if (S.route === 'collections') PAGES.collections();
      } }] });
}

/* ============================================================ queue page */
PAGES.queue = async () => {
  topbar('Print queue');
  const q = await api('/queue');
  S.queueCount = q.reduce((a, x) => a + x.copies, 0); renderNav();
  let totG = 0, totS = 0, totC = 0;
  for (const x of q) {
    const g = (x.file?.grams || 0) * x.copies, s = (x.file?.print_time_s || 0) * x.copies;
    totG += g; totS += s;
    totC += costCalc(x.file, { copies: x.copies, spool: S.spools.find(sp => sp.id === x.spool_id), printer: S.printers.find(p => p.id === x.printer_id), grams: x.file?.grams || 0, hours: s / 3600 }).total;
  }
  $('#view').innerHTML = `<div class="page">
    <div class="tiles"><div class="tile"><div class="l">Jobs</div><div class="v">${q.length}<small>${S.queueCount} pcs</small></div></div>
      <div class="tile"><div class="l">Total print time</div><div class="v">${fmt.dur(totS)}</div></div>
      <div class="tile"><div class="l">Filament needed</div><div class="v">${fmt.g(totG)}</div></div>
      <div class="tile"><div class="l">Estimated cost</div><div class="v">${fmt.money(totC)}</div></div></div>
    ${q.length ? `<div class="queue-list" id="ql">${q.map(x => {
      const f = x.file || {};
      return `<div class="q-item" draggable="true" data-q="${x.id}"><span class="grip" title="Drag to reorder">⋮⋮</span>
      ${f.thumb > 0 ? `<img src="/api/files/${f.id}/thumb?v=${f.thumb_v}">` : '<div class="noimg"></div>'}
      <div style="min-width:0"><div class="nm" data-open="${f.id}">${esc(f.display_name || '(missing file)')}</div>
        <div class="meta"><span>${f.print_time_s ? '⏱ ' + fmt.dur(f.print_time_s * x.copies) : 'time ?'}</span><span>${f.grams ? (f.grams_estimated ? '~' : '') + fmt.g(f.grams * x.copies) : ''}</span>${f.material ? `<span>${esc(f.material)}</span>` : ''}${f.dim_x != null ? `<span>${fmt.mm(f.dim_x)}×${fmt.mm(f.dim_y)}×${fmt.mm(f.dim_z)}</span>` : ''}</div></div>
      <div class="acts">
        <input type="number" min="1" value="${x.copies}" data-copies title="Copies">
        <select class="compact" data-spool style="max-width:150px"><option value="">Spool…</option>${S.spools.filter(s => !s.archived).map(s => `<option value="${s.id}" ${s.id === x.spool_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
        ${f.id && canSend(f) ? `<button class="btn sm" data-send title="Send to printer">${I.upload}</button>` : ''}
        <button class="btn primary sm" data-done>${I.check} Printed</button>
        <button class="icon-btn" data-rm title="Remove">${I.x}</button></div></div>`;
    }).join('')}</div>` : `<div class="empty">${I.queue}<h3>The queue is empty</h3><p>Add models from the library – right-click → Add to print queue, or select several and press Queue.</p></div>`}</div>`;
  const ql = $('#ql'); if (!ql) return;
  ql.addEventListener('change', async e => {
    const it = e.target.closest('[data-q]'); const id = it.dataset.q;
    if (e.target.matches('[data-copies]')) await api('/queue/' + id, { method: 'PATCH', body: { copies: Math.max(1, +e.target.value || 1) } });
    if (e.target.matches('[data-spool]')) await api('/queue/' + id, { method: 'PATCH', body: { spool_id: +e.target.value || null } });
    PAGES.queue();
  });
  ql.addEventListener('click', async e => {
    const it = e.target.closest('[data-q]'); if (!it) return;
    const x = q.find(y => y.id == it.dataset.q);
    if (e.target.closest('[data-open]') && x.file) location.hash = '#/file/' + x.file.id;
    if (e.target.closest('[data-rm]')) { await api('/queue/' + x.id, { method: 'DELETE' }); refreshMeta(); PAGES.queue(); }
    if (e.target.closest('[data-send]')) sendDialog(x.file);
    if (e.target.closest('[data-done]')) logPrintDialog({ file: x.file, copies: x.copies, grams: x.file?.grams, hours: (x.file?.print_time_s || 0) / 3600, spool_id: x.spool_id, printer_id: x.printer_id, queue_id: x.id, onDone: () => PAGES.queue() });
  });
  let dragEl = null;
  ql.addEventListener('dragstart', e => { dragEl = e.target.closest('[data-q]'); dragEl?.classList.add('dragging'); });
  ql.addEventListener('dragend', async () => {
    dragEl?.classList.remove('dragging'); $$('.over', ql).forEach(x => x.classList.remove('over'));
    dragEl = null;
    await api('/queue/reorder', { method: 'POST', body: { ids: $$('[data-q]', ql).map(x => +x.dataset.q) } });
  });
  ql.addEventListener('dragover', e => {
    if (!dragEl) return; e.preventDefault();
    const over = e.target.closest('[data-q]'); if (!over || over === dragEl) return;
    const r = over.getBoundingClientRect();
    over.parentNode.insertBefore(dragEl, e.clientY < r.top + r.height / 2 ? over : over.nextSibling);
  });
};

/* ============================================================ print log */
PAGES.prints = async () => {
  topbar('Print log', `<span class="spacer"></span><button class="btn primary" id="lp">${I.plus} Log a print</button>`);
  $('#lp').onclick = () => logPrintDialog({ onDone: () => PAGES.prints() });
  const rows = await api('/prints');
  const ok = rows.filter(r => r.result === 'success').length;
  const tot = rows.reduce((a, r) => ({ g: a.g + r.grams * r.copies, s: a.s + r.duration_s, c: a.c + r.cost }), { g: 0, s: 0, c: 0 });
  $('#view').innerHTML = `<div class="page wide">
    <div class="tiles"><div class="tile"><div class="l">Prints</div><div class="v">${rows.length}</div><div class="s">${rows.length ? Math.round(ok / rows.length * 100) : 0}% success rate</div></div>
      <div class="tile"><div class="l">Machine time</div><div class="v">${fmt.dur(tot.s)}</div></div>
      <div class="tile"><div class="l">Filament used</div><div class="v">${fmt.g(tot.g)}</div></div>
      <div class="tile"><div class="l">Total cost</div><div class="v">${fmt.money(tot.c)}</div></div></div>
    ${rows.length ? `<table class="table"><thead><tr><th></th><th>Model</th><th>Result</th><th class="hide-m">Printer</th><th class="hide-m">Spool</th><th class="num">Qty</th><th class="num">Filament</th><th class="num">Time</th><th class="num">Cost</th><th class="num">Date</th><th></th></tr></thead><tbody>
    ${rows.map(r => `<tr class="${r.file_id && !r.file_missing ? 'clickable' : ''}" data-f="${r.file_id || ''}">
      <td style="width:52px">${r.file_thumb > 0 ? `<img class="thumb-s" src="/api/files/${r.file_id}/thumb" loading="lazy">` : '<div class="thumb-s"></div>'}</td>
      <td><b>${esc(r.file_name)}</b>${r.ext_id ? ' <span class="badge" style="color:var(--teal)" title="Logged automatically from Moonraker">auto</span>' : ''}${r.notes ? `<div class="muted small">${esc(r.notes.replace('Logged automatically from Moonraker · ', '').replace('Logged automatically from Moonraker', ''))}</div>` : ''}</td>
      <td><span class="stdot ${r.result === 'success' ? 'st-printed' : 'st-failed'}"></span> ${r.result}</td>
      <td class="hide-m">${esc(r.printer_name || '–')}</td><td class="hide-m">${r.spool_name ? `<span class="stdot" style="background:${esc(r.spool_color)}"></span> ${esc(r.spool_name)}` : '–'}</td>
      <td class="num">${r.copies}</td><td class="num">${fmt.g(r.grams * r.copies)}</td><td class="num">${fmt.dur(r.duration_s)}</td><td class="num">${fmt.money(r.cost)}</td><td class="num">${fmt.dt(r.started_at)}</td>
      <td><button class="icon-btn" data-del="${r.id}">${I.trash}</button></td></tr>`).join('')}</tbody></table>` : `<div class="empty">${I.log}<h3>No prints logged yet</h3><p>Log prints from a model's Print tab or from the queue. Filament is deducted from the spool automatically.</p></div>`}</div>`;
  $('#view').onclick = async e => {
    const d = e.target.closest('[data-del]');
    if (d) { e.stopPropagation(); if (await confirmDlg('Delete this entry and return its filament to the spool?', { ok: 'Delete', danger: true })) { await api(`/prints/${d.dataset.del}?restore_filament=1`, { method: 'DELETE' }); PAGES.prints(); refreshMeta(); } return; }
    const tr = e.target.closest('tr.clickable'); if (tr?.dataset.f) location.hash = '#/file/' + tr.dataset.f;
  };
};

/* ============================================================ filament */
function spoolRing(s) {
  const rem = Math.max(0, s.weight_total - s.weight_used), pct = s.weight_total ? rem / s.weight_total : 0;
  const r = 26, c = 2 * Math.PI * r;
  return `<svg class="spool-ring" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="var(--panel2)" stroke="var(--line2)"/><circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--line)" stroke-width="8"/>
    <circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--muted)" stroke-opacity=".55" stroke-width="10" stroke-dasharray="${c * pct} ${c}" transform="rotate(-90 32 32)" stroke-linecap="round"/>
    <circle cx="32" cy="32" r="${r}" fill="none" stroke="${esc(s.color)}" stroke-width="7" stroke-dasharray="${c * pct} ${c}" transform="rotate(-90 32 32)" stroke-linecap="round"/><circle cx="32" cy="32" r="9" fill="var(--panel)" stroke="var(--line2)"/></svg>`;
}
PAGES.filament = async () => {
  const smOn = !!S.settings.spoolman_url;
  topbar('Filament', `<span class="spacer"></span><label class="check small hide-m"><input type="checkbox" id="sharch" ${store.get('showArchived', false) ? 'checked' : ''}> show empty / archived</label>
    ${smOn ? `<button class="btn" id="smsync" title="Sync from Spoolman">${I.refresh}<span class="hide-m">Spoolman</span></button><a class="btn primary" href="${esc(spoolmanWeb())}" target="_blank" rel="noopener">${I.spool}<span class="hide-m">Open Spoolman</span></a>`
      : `<button class="btn primary" id="ns">${I.plus} Add spool</button>`}`);
  $('#ns')?.addEventListener('click', () => editSpool());
  if (smOn) {
    const doSync = async (quiet) => { try { await api('/spoolman/sync', { method: 'POST' }); if (!quiet) toast('Synced from Spoolman', 'ok'); } catch (e) { if (!quiet) fail(e); } };
    $('#smsync').onclick = async () => { await doSync(false); PAGES.filament(); };
    if (!S._smSynced || Date.now() - S._smSynced > 60000) { S._smSynced = Date.now(); doSync(true).then(() => S.route === 'filament' && PAGES.filament()); }
  }
  $('#sharch').onchange = e => { store.set('showArchived', e.target.checked); PAGES.filament(); };
  S.spools = await api('/spools');
  const list = S.spools.filter(s => store.get('showArchived', false) || !s.archived);
  const remain = S.spools.filter(s => !s.archived).reduce((a, s) => a + Math.max(0, s.weight_total - s.weight_used), 0);
  const value = S.spools.filter(s => !s.archived).reduce((a, s) => a + Math.max(0, s.weight_total - s.weight_used) / (s.weight_total || 1000) * (s.price || 0), 0);
  $('#view').innerHTML = `<div class="page wide">
    <div class="tiles"><div class="tile"><div class="l">Active spools</div><div class="v">${S.spools.filter(s => !s.archived).length}</div></div>
      <div class="tile"><div class="l">Filament on hand</div><div class="v">${fmt.g(remain)}</div></div>
      <div class="tile"><div class="l">Stock value</div><div class="v">${fmt.money(value)}</div></div>
      <div class="tile"><div class="l">Running low</div><div class="v">${S.spools.filter(s => !s.archived && s.weight_total - s.weight_used < 150).length}</div><div class="s">under 150 g left</div></div></div>
    ${list.length ? `<div class="spools">${list.map(s => {
      const rem = Math.max(0, s.weight_total - s.weight_used), pct = s.weight_total ? rem / s.weight_total : 0;
      return `<div class="spool ${s.archived ? 'archived' : ''}" data-s="${s.id}">${spoolRing(s)}<div class="info"><div class="nm">${esc(s.name)}${s.spoolman_id ? ` <span class="badge" style="color:var(--teal)" title="Synced from Spoolman">#${s.spoolman_id}</span>` : ''}</div>
        <div class="meta">${esc([s.brand, s.material, s.diameter + ' mm', s.spoolman_id ? 'Spoolman #' + s.spoolman_id : (S.settings.spoolman_url ? 'not in Spoolman' : '')].filter(Boolean).join(' · '))}</div>
        <div class="rem">${fmt.g(rem)} <span class="muted small">/ ${fmt.g(s.weight_total)}</span></div>
        <div class="meter"><i style="width:${pct * 100}%;background:${pct < 0.15 ? 'var(--red)' : esc(s.color)}"></i></div>
        <div class="muted small" style="margin-top:6px">${fmt.money((s.price || 0) / (s.weight_total || 1000) * 1000)}/kg</div></div></div>`;
    }).join('')}</div>` : `<div class="empty">${I.spool}<h3>No spools yet</h3><p>Add your filament spools to track what's left and calculate exact print costs.</p></div>`}</div>`;
  $('#view').onclick = e => { const s = e.target.closest('[data-s]'); if (s) editSpool(S.spools.find(x => x.id == s.dataset.s)); };
};
function editSpool(s) {
  if (s?.spoolman_id) {
    const url = spoolmanWeb();
    const rem = Math.max(0, s.weight_total - s.weight_used);
    return modal({ title: s.name, body: `<div class="row" style="gap:14px">${spoolRing(s)}<div><div class="muted small">${esc([s.brand, s.material, s.diameter + ' mm', s.spoolman_id ? 'Spoolman #' + s.spoolman_id : (S.settings.spoolman_url ? 'not in Spoolman' : '')].filter(Boolean).join(' · '))}</div>
        <div class="mono" style="font-size:18px;margin-top:4px">${fmt.g(rem)} <span class="muted small">/ ${fmt.g(s.weight_total)}</span></div>
        <div class="muted small">${fmt.money((s.price || 0) / (s.weight_total || 1000) * 1000)}/kg · density ${s.density}</div></div></div>
      <p class="muted small" style="margin:0">This spool is managed in Spoolman (#${s.spoolman_id}). Edit it there – changes appear here after the next sync.</p>`,
      buttons: [{ label: 'Close' }, { label: 'Open in Spoolman', cls: 'primary', onClick: () => { window.open(`${url}/spool/show/${s.spoolman_id}`, '_blank', 'noopener'); } }] });
  }
  const isNew = !s;
  s = s || { name: '', brand: '', material: 'PLA', color: '#f29d38', diameter: 1.75, weight_total: 1000, weight_used: 0, price: +S.settings.default_spool_price || 20, density: 1.24, notes: '', archived: 0 };
  const densities = { PLA: 1.24, PETG: 1.27, ABS: 1.04, ASA: 1.07, TPU: 1.21, PA: 1.14, PC: 1.2, 'PLA-CF': 1.3, 'PETG-CF': 1.3, PVA: 1.23, HIPS: 1.04 };
  modal({ title: isNew ? 'Add spool' : 'Edit spool', body: `
    <div class="grid2"><label class="fld"><span>Name</span><input type="text" id="s-name" value="${esc(s.name)}" placeholder="Galaxy Black"></label>
      <label class="fld"><span>Brand</span><input type="text" id="s-brand" value="${esc(s.brand)}" placeholder="Prusament"></label>
      <label class="fld"><span>Material</span><input type="text" id="s-mat" value="${esc(s.material)}" list="mats"></label>
      <label class="fld"><span>Colour</span><div class="row"><input type="color" id="s-color" value="${esc(s.color)}"><input type="text" id="s-colort" value="${esc(s.color)}" class="mono"></div></label>
      <label class="fld"><span>Spool weight (g filament)</span><input type="number" id="s-total" value="${s.weight_total}"></label>
      <label class="fld"><span>Remaining (g)</span><input type="number" id="s-rem" value="${Math.max(0, s.weight_total - s.weight_used).toFixed(0)}"></label>
      <label class="fld"><span>Price (${esc(S.settings.currency || '€')})</span><input type="number" step="0.01" id="s-price" value="${s.price}"></label>
      <label class="fld"><span>Diameter (mm)</span><select id="s-dia"><option ${s.diameter == 1.75 ? 'selected' : ''}>1.75</option><option ${s.diameter == 2.85 ? 'selected' : ''}>2.85</option></select></label>
      <label class="fld"><span>Density (g/cm³)</span><input type="number" step="0.01" id="s-dens" value="${s.density}"></label>
      <label class="fld" style="justify-content:flex-end"><label class="check"><input type="checkbox" id="s-arch" ${s.archived ? 'checked' : ''}> Empty / archived</label></label></div>
    <datalist id="mats">${Object.keys(densities).map(m => `<option>${m}</option>`).join('')}</datalist>
    <label class="fld"><span>Notes</span><textarea id="s-notes" style="min-height:60px" placeholder="Temps, dryness, where it's stored…">${esc(s.notes)}</textarea></label>`,
    buttons: [...(isNew ? [] : [{ label: 'Delete', cls: 'danger', onClick: async () => { if (await confirmDlg('Delete this spool? Print history keeps its numbers.', { ok: 'Delete', danger: true })) { await api('/spools/' + s.id, { method: 'DELETE' }); refreshMeta(); PAGES.filament(); } } }]),
      { label: 'Cancel' }, { label: 'Save', cls: 'primary', onClick: async ({ el }) => {
        const total = +$('#s-total', el).value || 1000;
        const body = { name: $('#s-name', el).value.trim(), brand: $('#s-brand', el).value.trim(), material: $('#s-mat', el).value.trim(), color: $('#s-color', el).value,
          weight_total: total, weight_used: Math.max(0, total - (+$('#s-rem', el).value || 0)), price: +$('#s-price', el).value || 0, diameter: +$('#s-dia', el).value,
          density: +$('#s-dens', el).value || 1.24, archived: $('#s-arch', el).checked ? 1 : 0, notes: $('#s-notes', el).value };
        if (!body.name) body.name = [body.brand, body.material].filter(Boolean).join(' ') || 'Spool';
        await api(isNew ? '/spools' : '/spools/' + s.id, { method: isNew ? 'POST' : 'PATCH', body });
        refreshMeta(); if (S.route === 'filament') PAGES.filament();
      } }] });
  const m = $$('.modal').pop();
  $('#s-color', m).oninput = e => $('#s-colort', m).value = e.target.value;
  $('#s-colort', m).oninput = e => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) $('#s-color', m).value = e.target.value; };
  $('#s-mat', m).onchange = e => { const d = densities[e.target.value.toUpperCase()]; if (d) $('#s-dens', m).value = d; };
}

/* ============================================================ printers */
const PRINTER_PRESETS = { 'Prusa MK4S': [250, 210, 220, 120], 'Prusa Core One': [250, 220, 270, 150], 'Prusa MINI+': [180, 180, 180, 80], 'Bambu Lab X1C / P1S': [256, 256, 256, 150], 'Bambu Lab A1': [256, 256, 256, 110], 'Bambu Lab A1 mini': [180, 180, 180, 80], 'Bambu Lab H2D': [350, 320, 325, 220], 'Voron 2.4 350': [350, 350, 340, 300], 'Voron 2.4 300': [300, 300, 280, 250], 'Creality K1': [220, 220, 250, 150], 'Creality Ender-3 V3': [220, 220, 250, 120], 'Elegoo Neptune 4 Pro': [225, 225, 265, 150] };
const CONN_TYPES = { '': 'None (offline)', moonraker: 'Klipper / Moonraker (Mainsail, Fluidd)', octoprint: 'OctoPrint', prusalink: 'PrusaLink (MK4, MK3.9, Core One, XL, MINI)' };
const STATE_COLOR = { printing: 'var(--yellow)', paused: 'var(--violet)', complete: 'var(--teal)', finished: 'var(--teal)', idle: 'var(--teal)', ready: 'var(--teal)', standby: 'var(--teal)', operational: 'var(--teal)', error: 'var(--red)', offline: 'var(--red)', cancelled: 'var(--muted)' };
let printerPoll = null;
PAGES.printers = async () => {
  topbar('Printers', `<span class="spacer"></span><button class="btn primary" id="np">${I.plus} Add printer</button>`);
  $('#np').onclick = () => editPrinter();
  S.printers = await api('/printers');
  $('#view').innerHTML = `<div class="page wide"><p class="lead">Printers are used for the "fits on" check, the build plate in the 3D viewer and energy costs. Connect them over the network to send G-code and see live status.</p>
    ${S.printers.length ? `<div class="spools">${S.printers.map(p => `<div class="spool" data-p="${p.id}" style="flex-direction:column;gap:10px">
      <div class="row"><div style="flex:1;min-width:0"><div class="nm">${esc(p.name)}</div><div class="meta">${esc(p.model || '')} · ${p.bed_x}×${p.bed_y}×${p.bed_z} mm · ${p.watts} W</div></div>
        ${p.web_link ? `<a class="btn ghost sm" href="${esc(p.web_link)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Open</a>` : ''}${I.right.replace('<svg', '<svg width="16" height="16" style="color:var(--muted)"')}</div>
      <div class="pstat" data-ps="${p.id}">${p.conn_type ? '<span class="muted small">Connecting…</span>' : `<span class="muted small">Not connected – click to add the printer's network address.</span>`}</div></div>`).join('')}</div>`
      : `<div class="empty">${I.printer}<h3>No printers yet</h3><p>Add your printers to filter models by what fits on each bed and to send G-code to them.</p></div>`}</div>`;
  $('#view').onclick = e => { const r = e.target.closest('[data-p]'); if (r) editPrinter(S.printers.find(p => p.id == r.dataset.p)); };
  const poll = async () => {
    if (S.route !== 'printers') return;
    await Promise.all(S.printers.filter(p => p.conn_type).map(async p => {
      const el = $(`[data-ps="${p.id}"]`); if (!el) return;
      try { el.innerHTML = printerStatusHtml(await api(`/printers/${p.id}/status`)); } catch { }
    }));
    clearTimeout(printerPoll); printerPoll = setTimeout(poll, 5000);
  };
  poll();
};
function printerStatusHtml(st) {
  if (!st.connected) return `<div class="row small"><span class="stdot" style="background:var(--red)"></span><b>Offline</b><span class="muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(st.error || '')}</span></div>`;
  const c = STATE_COLOR[st.state] || 'var(--muted)';
  const t = (v, lbl) => v && v[0] != null ? `<span>${lbl} ${Math.round(v[0])}°${v[1] ? `<span class="muted">/${Math.round(v[1])}°</span>` : ''}</span>` : '';
  const busy = ['printing', 'paused'].includes(st.state);
  const sp = st.active_spool ? `<div class="row small" style="gap:6px;margin-top:6px"><span class="stdot" style="background:${esc(st.active_spool.color)};box-shadow:0 0 0 1px var(--line2)"></span><span>Loaded: <b>${esc(st.active_spool.name)}</b></span><span class="muted mono">${fmt.g(Math.max(0, st.active_spool.weight_total - st.active_spool.weight_used))} left</span></div>`
    : st.spoolman_spool_id ? `<div class="muted small" style="margin-top:6px">Loaded: Spoolman spool #${st.spoolman_spool_id}</div>` : '';
  return `${sp ? '' : ''}<div class="row small" style="gap:8px"><span class="stdot" style="background:${c}"></span><b style="text-transform:capitalize">${esc(st.state)}</b>
      <span class="spacer"></span><span class="mono muted" style="display:flex;gap:10px">${t(st.nozzle, 'Nozzle')}${t(st.bed, 'Bed')}</span></div>
    ${busy ? `<div class="meter" style="height:8px"><i style="width:${(st.progress * 100).toFixed(1)}%;background:${c}"></i></div>
      <div class="row small mono muted"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(st.file || '')}</span><span>${(st.progress * 100).toFixed(0)}%${st.remaining_s ? ' · ' + fmt.dur(st.remaining_s) + ' left' : ''}</span></div>` : ''}${sp}`;
}
function editPrinter(p) {
  const isNew = !p;
  p = p || { name: '', model: '', bed_x: 250, bed_y: 210, bed_z: 220, watts: 120, notes: '', conn_type: '', conn_url: '', conn_key_set: false };
  modal({ title: isNew ? 'Add printer' : 'Edit printer', size: 'lg', body: `
    ${isNew ? `<label class="fld"><span>Preset</span><select id="p-preset"><option value="">Custom…</option>${Object.keys(PRINTER_PRESETS).map(k => `<option>${k}</option>`).join('')}</select></label>` : ''}
    <div class="grid2"><label class="fld"><span>Name</span><input type="text" id="p-name" value="${esc(p.name)}" placeholder="Workshop MK4S"></label><label class="fld"><span>Model</span><input type="text" id="p-model" value="${esc(p.model)}"></label></div>
    <div class="grid3"><label class="fld"><span>Bed X</span><input type="number" id="p-x" value="${p.bed_x}"></label><label class="fld"><span>Bed Y</span><input type="number" id="p-y" value="${p.bed_y}"></label><label class="fld"><span>Max Z</span><input type="number" id="p-z" value="${p.bed_z}"></label></div>
    <label class="fld"><span>Average power draw while printing (W)</span><input type="number" id="p-w" value="${p.watts}"></label>
    <div class="box" style="display:flex;flex-direction:column;gap:12px"><h4 style="margin:0">Network connection</h4>
      <label class="fld"><span>Type</span><select id="p-ct">${Object.entries(CONN_TYPES).map(([k, l]) => `<option value="${k}" ${p.conn_type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div id="p-conn" style="display:flex;flex-direction:column;gap:12px">
        <label class="fld"><span>Address</span><input type="text" id="p-url" value="${esc(p.conn_url)}" placeholder="http://192.168.1.50"></label>
        <label class="fld"><span id="p-key-lbl">API key</span><input type="password" id="p-key" autocomplete="new-password" placeholder="${p.conn_key_set ? '•••••••• (saved – leave empty to keep)' : ''}"></label>
        <label class="fld"><span>Web address for the browser (optional)</span><input type="text" id="p-web" value="${esc(p.web_url || '')}" placeholder="https://voron.example.lan"></label>
        <p class="muted small" id="p-hint" style="margin:0"></p>
        <div class="row"><button class="btn sm" id="p-test" type="button">Test connection</button><span class="small" id="p-res"></span></div>
      </div></div>
    <label class="fld"><span>Notes</span><textarea id="p-notes" style="min-height:60px">${esc(p.notes)}</textarea></label>`,
    buttons: [...(isNew ? [] : [{ label: 'Delete', cls: 'danger', onClick: async () => { if (await confirmDlg('Delete this printer?', { ok: 'Delete', danger: true })) { await api('/printers/' + p.id, { method: 'DELETE' }); refreshMeta(); PAGES.printers(); } } }]),
      { label: 'Cancel' }, { label: 'Save', cls: 'primary', onClick: async ({ el }) => {
        const body = { name: $('#p-name', el).value.trim(), model: $('#p-model', el).value.trim(), bed_x: +$('#p-x', el).value, bed_y: +$('#p-y', el).value, bed_z: +$('#p-z', el).value, watts: +$('#p-w', el).value, notes: $('#p-notes', el).value,
          conn_type: $('#p-ct', el).value, conn_url: $('#p-url', el).value.trim(), web_url: $('#p-web', el).value.trim() };
        const key = $('#p-key', el).value.trim();
        if (key) body.conn_key = key;
        if (!body.conn_type) body.conn_key = '';
        if (!body.name) body.name = body.model || 'Printer';
        await api(isNew ? '/printers' : '/printers/' + p.id, { method: isNew ? 'POST' : 'PATCH', body });
        await loadMeta(); if (S.route === 'printers') PAGES.printers();
      } }] });
  const m = $$('.modal').pop();
  const HINTS = {
    moonraker: 'Address: the printer\'s IP, e.g. http://192.168.0.30 (behind Authelia/NPMplus Z-Hop Deck may get a login page instead of data). Web address: what your browser should open, e.g. https://voron.example.lan. An API key is only needed if Moonraker has authorization enabled.',
    octoprint: 'OctoPrint address, e.g. http://octopi.local. Create an API key in OctoPrint → Settings → Application Keys.',
    prusalink: 'Printer IP address. The API key is shown on the printer under Settings → Network → PrusaLink. Files are sent to the USB drive.',
  };
  const sync = () => { const t = $('#p-ct', m).value; $('#p-conn', m).style.display = t ? 'flex' : 'none'; $('#p-hint', m).textContent = HINTS[t] || ''; $('#p-key-lbl', m).textContent = t === 'moonraker' ? 'API key (optional)' : 'API key'; };
  $('#p-ct', m).onchange = sync; sync();
  $('#p-test', m).onclick = async () => {
    const res = $('#p-res', m); res.innerHTML = '<span class="muted">Testing…</span>';
    try {
      const r = await api('/printers/test', { method: 'POST', body: { id: p.id, conn_type: $('#p-ct', m).value, conn_url: $('#p-url', m).value, conn_key: $('#p-key', m).value } });
      res.innerHTML = `<span style="color:var(--teal)">✓ Connected – ${esc(r.state)}${r.nozzle?.[0] != null ? `, nozzle ${Math.round(r.nozzle[0])}°` : ''}</span>`;
    } catch (e) { res.innerHTML = `<span style="color:var(--red)">✕ ${esc(e.message)}</span>`; }
  };
  $('#p-preset', m)?.addEventListener('change', e => {
    const v = PRINTER_PRESETS[e.target.value]; if (!v) return;
    [$('#p-x', m).value, $('#p-y', m).value, $('#p-z', m).value, $('#p-w', m).value] = v;
    $('#p-model', m).value = e.target.value; if (!$('#p-name', m).value) $('#p-name', m).value = e.target.value;
    if (/voron/i.test(e.target.value)) { $('#p-ct', m).value = 'moonraker'; sync(); }
    if (/prusa (mk4|core|mini)/i.test(e.target.value)) { $('#p-ct', m).value = 'prusalink'; sync(); }
  });
}

/* ============================================================ slicers & sending */
const SLICERS = {
  orcaslicer: { name: 'OrcaSlicer', url: 'orcaslicer://open?file=', exts: ['stl', '3mf', 'obj', 'step', 'stp', 'scad'] },
  cura: { name: 'Cura', url: 'cura://open?file=', exts: ['stl', '3mf', 'obj', 'scad', 'step', 'stp'], asStl: ['step', 'stp'] }, // Cura can't import STEP: it gets the converted STL
  prusaslicer: { name: 'PrusaSlicer', url: 'prusaslicer://open?file=', exts: ['stl', '3mf', 'obj', 'step', 'stp', 'scad'] },
  bambustudio: { name: 'Bambu Studio', url: 'bambustudio://open?file=', exts: ['stl', '3mf', 'obj', 'step', 'stp', 'scad'] },
};
function slicersFor(f) {
  const on = (S.settings.slicers || '').split(',').filter(Boolean);
  if (f.ext === 'scad' && f.dim_x == null) return []; // OpenSCAD file that couldn't be rendered
  const converted = f.dim_x != null; // STEP that Z-Hop Deck could turn into a mesh
  return on.filter(k => SLICERS[k] && SLICERS[k].exts.includes(f.ext) && (converted || !(SLICERS[k].asStl || []).includes(f.ext)));
}
async function openInSlicer(f, key) {
  const sl = SLICERS[key];
  try {
    const asStl = (sl.asStl || []).includes(f.ext);
    const { url } = await api(`/files/${f.id}/link${asStl ? '?stl=1' : ''}`, { method: 'POST' });
    window.location.href = sl.url + encodeURIComponent(url);
    toast(f.ext === 'scad' || asStl ? `Converted STL opening in ${sl.name}…` : `Opening in ${sl.name}…`);
  } catch (e) { fail(e); }
}
const connectedPrinters = () => S.printers.filter(p => p.conn_type);
const canSend = f => ['gcode', 'gco', 'g', 'bgcode'].includes(f.ext) && connectedPrinters().length > 0;
function sendDialog(f, { onDone } = {}) {
  const ps = connectedPrinters();
  const last = store.get('lastSendPrinter', ps[0]?.id);
  const m = modal({ title: `Send to printer · ${f.display_name || f.name}`, body: `
    <label class="fld"><span>Printer</span><select id="sp">${ps.map(p => `<option value="${p.id}" ${p.id == last ? 'selected' : ''}>${esc(p.name)} – ${esc(CONN_TYPES[p.conn_type].split(' (')[0])}</option>`).join('')}</select></label>
    <div id="sp-st" class="box" style="padding:10px 12px"><span class="muted small">Checking printer…</span></div>
    <label class="check"><input type="checkbox" id="sp-start" ${store.get('sendStart', true) ? 'checked' : ''}> Start printing immediately</label>
    ${f.material || f.meta?.printer ? `<p class="muted small" style="margin:0">Sliced for: ${esc([f.meta?.printer, f.material, f.layer_height && f.layer_height + ' mm'].filter(Boolean).join(' · '))}</p>` : ''}`,
    buttons: [{ label: 'Cancel' }, { label: `${I.upload} Send`, cls: 'primary', onClick: async ({ el }) => {
      const pid = +$('#sp', el).value, start = $('#sp-start', el).checked;
      store.set('lastSendPrinter', pid); store.set('sendStart', start);
      toast('Uploading to printer…');
      const r = await api(`/files/${f.id}/send`, { method: 'POST', body: { printer_id: pid, start } });
      toast(r.started ? 'Sent – print started' : 'Sent to printer', 'ok');
      onDone?.();
    } }] });
  const check = async () => {
    const box = $('#sp-st', m.el); box.innerHTML = '<span class="muted small">Checking printer…</span>';
    try {
      const st = await api(`/printers/${$('#sp', m.el).value}/status`);
      box.innerHTML = printerStatusHtml(st);
      if (['printing', 'paused'].includes(st.state)) box.insertAdjacentHTML('beforeend', '<div class="small" style="color:var(--yellow);margin-top:6px">The printer is busy – the file will be uploaded, but it can\'t start now.</div>');
    } catch (e) { box.innerHTML = `<span class="small" style="color:var(--red)">${esc(e.message)}</span>`; }
  };
  $('#sp', m.el).onchange = check; check();
}

/* ============================================================ duplicates */
PAGES.duplicates = async () => {
  topbar('Duplicates');
  $('#view').innerHTML = '<div class="page"><div class="spinner"></div></div>';
  const groups = await api('/duplicates');
  const wasted = groups.reduce((a, g) => a + g.wasted, 0);
  $('#view').innerHTML = `<div class="page wide"><p class="lead">Files with byte-identical content (SHA-256). ${groups.length ? `<b>${groups.length}</b> groups · <b>${fmt.bytes(wasted)}</b> could be freed.` : ''}</p>
    ${groups.length ? groups.map(g => `<div class="dupe-group" data-sha="${g.sha256}"><div class="hd"><b>${g.files.length} copies</b><span class="muted">${fmt.bytes(g.size)} each</span><span class="spacer"></span>
      <button class="btn sm" data-keep>Keep oldest, delete others</button></div>
      <div class="dupe-files">${g.files.map((f, i) => `<div class="dupe-file">${f.thumb > 0 ? `<img src="/api/files/${f.id}/thumb?v=${f.thumb_v}" loading="lazy">` : '<div></div>'}
        <div style="min-width:0"><a href="#/file/${f.id}"><b>${esc(f.display_name)}</b></a>${i === 0 ? ' <span class="badge" style="color:var(--teal)">oldest</span>' : ''}<div class="p">${esc(f.root)}/${esc(f.folder ? f.folder + '/' : '')}${esc(f.name)}</div>
        <div class="muted small">${f.tags.length ? f.tags.map(t => esc(t.name)).join(', ') + ' · ' : ''}added ${fmt.date(f.added_at)}</div></div>
        <button class="icon-btn" data-del="${f.id}" title="Delete this copy">${I.trash}</button></div>`).join('')}</div></div>`).join('')
      : `<div class="empty">${I.dupe}<h3>No duplicates</h3><p>Every file in your library is unique.</p></div>`}</div>`;
  $('#view').onclick = async e => {
    const d = e.target.closest('[data-del]');
    if (d) { if (await confirmDlg('Delete this copy (moves it to trash)?', { ok: 'Delete', danger: true })) { await api('/files/' + d.dataset.del, { method: 'DELETE' }); PAGES.duplicates(); refreshMeta(); } return; }
    const k = e.target.closest('[data-keep]');
    if (k) {
      const g = groups.find(x => x.sha256 === k.closest('[data-sha]').dataset.sha);
      const others = g.files.slice(1).map(f => f.id);
      if (await confirmDlg(`Delete ${others.length} copies and keep <b>${esc(g.files[0].name)}</b>? Tags from the deleted copies are merged into the kept file.`, { ok: 'Delete copies', danger: true })) {
        const allTags = [...new Set(g.files.flatMap(f => f.tags.map(t => t.name)))];
        if (allTags.length) await api('/files/batch', { method: 'POST', body: { ids: [g.files[0].id], action: 'add_tags', value: allTags } });
        await api('/files/batch', { method: 'POST', body: { ids: others, action: 'delete' } });
        toast('Duplicates removed', 'ok'); PAGES.duplicates(); refreshMeta();
      }
    }
  };
};

/* ============================================================ stats */
PAGES.stats = async () => {
  topbar('Statistics');
  const s = await api('/stats');
  const months = [];
  const d0 = new Date(); d0.setDate(1);
  for (let i = 11; i >= 0; i--) { const d = new Date(d0.getFullYear(), d0.getMonth() - i, 1); months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
  const pm = Object.fromEntries(s.prints_by_month.map(x => [x.month, x])), am = Object.fromEntries(s.added_by_month.map(x => [x.month, x]));
  const cols = (get, f = v => v) => { const vals = months.map(get); const max = Math.max(1, ...vals); return `<div class="cols">${months.map((m, i) => `<div class="c" title="${m}: ${f(vals[i])}"><i style="height:${vals[i] / max * 100}%"></i><span>${m.slice(5)}</span></div>`).join('')}</div>`; };
  const bars = (items, label, val, f = v => v, color) => { const max = Math.max(1, ...items.map(val)); return `<div class="bars">${items.map(x => `<div class="b"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label(x)}</span><div class="tr"><i style="width:${val(x) / max * 100}%;${color ? 'background:' + color(x) : ''}"></i></div><span class="num">${f(val(x))}</span></div>`).join('') || '<span class="muted">No data yet</span>'}</div>`; };
  const statusColor = { none: 'var(--line2)', want: 'var(--blue)', queued: 'var(--violet)', printing: 'var(--yellow)', printed: 'var(--teal)', failed: 'var(--red)' };
  $('#view').innerHTML = `<div class="page wide">
    <div class="tiles">
      <div class="tile"><div class="l">Files</div><div class="v">${fmt.num(s.files.n)}</div><div class="s">${fmt.bytes(s.files.size)} on disk</div></div>
      <div class="tile"><div class="l">Prints</div><div class="v">${fmt.num(s.prints.copies)}<small>pcs</small></div><div class="s">${s.prints.n ? Math.round(s.prints.ok / s.prints.n * 100) : 0}% success</div></div>
      <div class="tile"><div class="l">Machine time</div><div class="v">${fmt.dur(s.prints.seconds)}</div></div>
      <div class="tile"><div class="l">Filament printed</div><div class="v">${fmt.g(s.prints.grams)}</div></div>
      <div class="tile"><div class="l">Total spent</div><div class="v">${fmt.money(s.prints.cost)}</div></div>
      <div class="tile"><div class="l">Duplicates</div><div class="v">${s.dupes.groups}</div><div class="s">${fmt.bytes(s.dupes.wasted)} reclaimable</div></div>
    </div>
    <div class="panels">
      <div class="box"><h4>Prints per month</h4>${cols(m => pm[m]?.n || 0)}</div>
      <div class="box"><h4>Filament per month</h4>${cols(m => Math.round(pm[m]?.grams || 0), v => v + ' g')}</div>
      <div class="box"><h4>Files added per month</h4>${cols(m => am[m]?.n || 0)}</div>
      <div class="box"><h4>Library by status</h4>${bars(s.by_status.sort((a, b) => b.n - a.n), x => `<span class="stdot" style="background:${statusColor[x.status]}"></span> ${STATUS[x.status]?.label || x.status}`, x => x.n, v => v, x => statusColor[x.status])}</div>
      <div class="box"><h4>File types</h4>${bars(s.by_ext, x => `<span class="badge ${badgeCls(x.ext)}">${esc(x.ext)}</span>`, x => x.n)}</div>
      <div class="box"><h4>Top tags</h4>${bars(s.top_tags, x => `<span class="stdot" style="background:${esc(x.color)}"></span> ${esc(x.name)}`, x => x.n, v => v, x => x.color)}</div>
      <div class="box"><h4>Material used</h4>${bars(s.material_use, x => esc(x.material), x => x.grams, fmt.g)}</div>
      <div class="box"><h4>Most printed</h4>${s.most_printed.length ? s.most_printed.map(x => `<div class="row" style="padding:4px 0">${x.thumb > 0 ? `<img src="/api/files/${x.file_id}/thumb" style="width:34px;height:34px;object-fit:contain;background:var(--bed);border-radius:6px">` : ''}<a href="${x.file_id ? '#/file/' + x.file_id : '#/prints'}" style="flex:1">${esc(x.file_name)}</a><span class="mono">${x.n}×</span></div>`).join('') : '<span class="muted">No prints yet</span>'}</div>
      <div class="box"><h4>Spools – lowest first</h4>${bars(s.spools.slice(0, 8), x => `<span class="stdot" style="background:${esc(x.color)}"></span> ${esc(x.name)}`, x => Math.max(0, x.weight_total - x.weight_used), fmt.g, x => x.color)}</div>
    </div></div>`;
};

/* ============================================================ settings */
PAGES.settings = async () => {
  topbar('Settings');
  const st = S.settings = await api('/settings');
  const scan = await api('/scan/status');
  $('#view').innerHTML = `<div class="page"><div class="settings-grid">
    <div class="box"><h4>Library</h4>
      <dl class="kv" style="margin-bottom:12px"><dt>Library folders</dt><dd>${st._library_dirs.map(esc).join('<br>')}</dd><dt>Last scan</dt><dd>${esc(scan.last_scan || 'never')}</dd>
        ${scan.last_result ? `<dt>Result</dt><dd>${scan.last_result.found} files · ${scan.last_result.new} new · ${scan.last_result.missing} missing</dd>` : ''}<dt>Version</dt><dd>${esc(st._version)}</dd></dl>
      <label class="fld"><span>Rescan every (minutes, 0 = off)</span><input type="number" min="0" data-k="scan_interval" value="${esc(st.scan_interval)}"></label>
      <div class="row wrap" style="margin-top:12px"><button class="btn primary sm" id="s-scan">${I.refresh} Scan now</button><button class="btn sm" id="s-rethumb">Regenerate all previews</button>
        <button class="btn sm" id="s-missing">Show missing files</button></div>
      <p class="muted small" style="margin:10px 0 0">Copy files into the mounted folder with any tool (SMB, SFTP, rsync…) – they appear after the next scan. Moved or renamed files keep their tags and history.</p></div>
    <div class="box"><h4>Appearance</h4>
      <label class="fld"><span>Preview colour for rendered thumbnails</span><div class="row"><input type="color" data-k="render_color" value="${esc(st.render_color)}"><span class="muted small">Applies to new previews; use "Regenerate all previews" to update existing ones.</span></div></label>
      <label class="fld" style="margin-top:14px"><span>3D view grid – minimum size (mm)</span><input type="number" min="100" max="1000" step="10" data-k="viewer_bed" value="${esc(st.viewer_bed || 350)}"></label>
      <p class="muted small" style="margin:4px 0 0">The grid also grows automatically when a model is bigger.</p>
      <div class="row" style="margin-top:14px"><span class="muted small" style="flex:1">Theme</span><div class="seg"><button data-theme="dark" class="${document.documentElement.dataset.theme === 'dark' ? 'on' : ''}">${I.moon}</button><button data-theme="light" class="${document.documentElement.dataset.theme === 'light' ? 'on' : ''}">${I.sun}</button></div></div>
      <div class="row" style="margin-top:10px"><span class="muted small" style="flex:1">Background (dark theme)</span><div class="seg">${[['photo', 'My image'], ['pattern', 'Carbon'], ['plain', 'Plain']].map(([k, l]) => `<button data-bgsel="${k}" class="${document.documentElement.dataset.bg === k ? 'on' : ''}" style="padding:0 10px" ${k === 'photo' && !document.documentElement.dataset.hasBg ? 'disabled title="Upload an image first"' : ''}>${l}</button>`).join('')}</div></div>
      <div class="row" style="margin-top:8px;justify-content:flex-end;gap:6px"><button class="btn sm" id="bg-up">${I.upload} ${document.documentElement.dataset.hasBg ? 'Replace image…' : 'Upload background image…'}</button>${document.documentElement.dataset.hasBg ? '<button class="btn sm ghost" id="bg-rm">Remove</button>' : ''}<input type="file" id="bg-file" accept="image/*" hidden></div></div>
    <div class="box"><h4>OrcaSlicer upload</h4>
      <p class="muted small" style="margin-top:0">Upload G-code straight from OrcaSlicer: Z-Hop Deck stores it next to the model it was sliced from and passes it on to the printer.
        In Orca: <b>printer → Connection (Wi-Fi icon) → Host type <span class="mono">Octo/Klipper</span></b>, then enter:</p>
      ${connectedPrinters().length ? `<div style="display:flex;flex-direction:column;gap:8px">${connectedPrinters().map(p => `
        <label class="fld"><span>Hostname, IP or URL – ${esc(p.name)}</span><div class="row"><input type="text" readonly class="mono" id="octo-url-${p.id}" value="${esc((st.PUBLIC_URL_EFFECTIVE || '') + '/p/' + p.id)}"><button class="btn sm" data-copy="octo-url-${p.id}" type="button">Copy</button></div></label>`).join('')}</div>
        <p class="muted small" style="margin:6px 0 0">Use each printer's own URL in its Orca printer profile – uploads then go to exactly that printer.</p>`
      : `<label class="fld"><span>Hostname, IP or URL</span><div class="row"><input type="text" readonly class="mono" id="octo-url" value="${esc(st.PUBLIC_URL_EFFECTIVE || '')}"><button class="btn sm" data-copy="octo-url" type="button">Copy</button></div></label>`}
      <label class="fld" style="margin:10px 0 12px"><span>API Key</span><div class="row"><input type="text" readonly class="mono" id="octo-key" value="${esc(st.octo_api_key || '')}"><button class="btn sm" data-copy="octo-key" type="button">Copy</button></div></label>
      <div class="grid2">
        <label class="fld"><span>Printer for the plain URL (without /p/…)</span><select data-k="orca_printer"><option value="">${connectedPrinters().length ? 'First connected printer' : '— no connected printer —'}</option>${connectedPrinters().map(p => `<option value="${p.id}" ${String(st.orca_printer) === String(p.id) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        <label class="fld"><span>"Upload and Print" in Orca</span><select data-k="orca_start"><option value="never" ${st.orca_start !== 'follow' ? 'selected' : ''}>Only upload – I start in Mainsail (AFC lanes)</option><option value="follow" ${st.orca_start === 'follow' ? 'selected' : ''}>Start printing right away</option></select></label>
        <label class="fld" style="grid-column:1/-1"><span>Folder for G-code without a matching model</span><input type="text" data-k="orca_folder" value="${esc(st.orca_folder || 'Orca')}"></label>
      </div>
      <div class="row" style="margin-top:10px"><button class="btn sm" id="octo-regen">New API key</button><span class="muted small">The old key stops working – update it in Orca.</span></div>
      <h4 style="margin-top:18px">Automatic print log</h4>
      <label class="check" style="align-items:flex-start"><input type="checkbox" id="autolog" ${st.auto_print_log !== '0' ? 'checked' : ''} style="margin-top:2px"><span>Log every finished print on Klipper printers automatically<br><span class="muted small">Reads Moonraker's job history every minute: duration, filament actually used, spools from Spoolman (all AFC lanes), cost. Works however the print was started. Only prints after this was switched on are imported.</span></span></label>
      <div class="row" style="margin-top:10px"><button class="btn sm" id="autolog-now">${I.refresh} Check now</button><span class="small" id="autolog-res"></span></div></div>
    <div class="box"><h4>Spoolman</h4>
      <p class="muted small" style="margin-top:0">Pull your spools from <a href="https://github.com/Donkie/Spoolman" target="_blank" rel="noopener">Spoolman</a>. Spoolman stays the source of truth – spools are synced every 5 minutes and whenever you open Filament.</p>
      <label class="fld"><span>Spoolman address</span><div class="row"><input type="text" id="sm-url" value="${esc(st.spoolman_url || '')}" placeholder="http://voron.local:7912"><button class="btn sm" id="sm-test" type="button">Test &amp; sync</button></div></label>
      <div class="small" id="sm-res" style="margin-top:6px"></div>
      <label class="fld" style="margin-top:12px"><span>Address for the browser (optional)</span><input type="text" data-k="spoolman_web_url" value="${esc(st.spoolman_web_url || '')}" placeholder="https://spoolman.example.lan"></label>
      <p class="muted small" style="margin:4px 0 0">Used by the "Open Spoolman" buttons. Leave empty to use the address above.</p>
      <label class="check" style="margin-top:12px;align-items:flex-start"><input type="checkbox" id="sm-deduct" ${st.spoolman_deduct === '1' ? 'checked' : ''} style="margin-top:2px"><span>Deduct filament in Spoolman when I log a print here<br><span class="muted small">Leave this <b>off</b> if Moonraker has a <span class="mono">[spoolman]</span> section – Klipper already reports usage while printing, and Spoolman would count it twice.</span></span></label></div>
    <div class="box"><h4>Slicers</h4>
      <p class="muted small" style="margin-top:0">Show "Open in …" buttons for these slicers. The slicer must be installed on the computer you're browsing from; it downloads the file straight from Z-Hop Deck via a link that is valid for 1 hour.</p>
      <div style="display:flex;flex-direction:column;gap:8px" id="s-slicers">${Object.entries(SLICERS).map(([k, sl]) => `<label class="check"><input type="checkbox" value="${k}" ${(st.slicers || '').split(',').includes(k) ? 'checked' : ''}> ${sl.name}</label>`).join('')}</div></div>
    <div class="box"><h4>Costs</h4><div class="grid2">
      <label class="fld"><span>Currency</span><input type="text" data-k="currency" value="${esc(st.currency)}"></label>
      <label class="fld"><span>Electricity per kWh</span><input type="number" step="0.01" data-k="kwh_price" value="${esc(st.kwh_price)}"></label>
      <label class="fld"><span>Default spool price (1 kg)</span><input type="number" step="0.5" data-k="default_spool_price" value="${esc(st.default_spool_price)}"></label>
      <label class="fld"><span>Default printer power (W)</span><input type="number" data-k="default_watts" value="${esc(st.default_watts)}"></label>
      <label class="fld"><span>Labour / machine rate per hour</span><input type="number" step="0.1" data-k="hourly_rate" value="${esc(st.hourly_rate)}"></label>
      <label class="fld"><span>Default density (g/cm³)</span><input type="number" step="0.01" data-k="default_density" value="${esc(st.default_density)}"></label>
      <label class="fld" style="grid-column:1/-1"><span>Mesh fill factor (estimates grams from volume – 0.45 ≈ 15–20 % infill, 3 walls)</span><input type="number" step="0.05" min="0.05" max="1" data-k="mesh_fill_factor" value="${esc(st.mesh_fill_factor)}"></label></div></div>
    <div class="box"><h4>Backup & export</h4>
      <p class="muted small" style="margin-top:0">The backup holds tags, collections, notes, ratings, print log, spools and printers. Your model files are not included – back up the library folder separately.</p>
      <div class="row wrap"><a class="btn sm" href="/api/backup">${I.download} Download backup</a><button class="btn sm" id="s-restore">${I.upload} Restore backup…</button><a class="btn sm" href="/api/export.csv">${I.download} Export library CSV</a></div>
      <input type="file" id="s-restore-file" accept=".db" hidden>
      <h4 style="margin-top:18px">Trash</h4><div class="row"><span class="muted small" style="flex:1">Deleted files: ${fmt.bytes(st._trash_bytes)} in the data volume</span><button class="btn sm danger" id="s-trash" ${st._trash_bytes ? '' : 'disabled'}>Empty trash</button></div>
      <h4 style="margin-top:18px">Session</h4>
      <p class="small" style="margin:0 0 8px">${S.me?.user ? `Signed in as <b>${esc(S.me.user)}</b> via your login proxy.` : S.me?.session ? 'Signed in with the app password.' : S.me?.trusted ? `No login needed – your address <span class="mono">${esc(S.me.client_ip)}</span> is in TRUSTED_NETWORKS.` : 'No login required.'}</p>
      <label class="fld"><span>Logout URL of your login proxy (optional)</span><input type="url" data-k="logout_url" value="${esc(st.logout_url || '')}" placeholder="https://auth.example.lan/logout"></label>
      <p class="muted small" style="margin:4px 0 8px">With Authelia, the Log out button sends you here to end the single sign-on session.</p>
      ${S.me?.session || st.logout_url ? '<button class="btn sm" id="s-logout">Log out</button>' : ''}</div>
    <div class="box"><h4>Keyboard shortcuts</h4><dl class="kv"><dt><kbd>/</kbd></dt><dd>Search</dd><dt><kbd>U</kbd></dt><dd>Upload</dd><dt><kbd>Ctrl</kbd>+<kbd>A</kbd></dt><dd>Select all</dd><dt><kbd>Shift</kbd>+click</dt><dd>Select range</dd><dt><kbd>Del</kbd></dt><dd>Delete selected</dd><dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>Previous / next model</dd><dt><kbd>Esc</kbd></dt><dd>Close / clear selection</dd></dl>
      <h4 style="margin-top:16px">Search syntax</h4><dl class="kv"><dt class="mono">tag:benchy</dt><dd>has tag</dd><dt class="mono">ext:3mf</dt><dd>file type</dd><dt class="mono">status:printed</dt><dd>print status</dd><dt class="mono">material:petg</dt><dd>sliced material</dd><dt class="mono">designer:name</dt><dd>designer</dd><dt class="mono">-word</dt><dd>exclude</dd></dl></div>
  </div></div>`;
  // every changed setting is saved (collected per key, so quick successive changes are never lost)
  const pending = {};
  const flush = debounce(async () => {
    const body = { ...pending }; Object.keys(pending).forEach(k => delete pending[k]);
    try {
      S.settings = await api('/settings', { method: 'PUT', body }); toast('Settings saved', 'ok');
      if ('logout_url' in body) { S.me = await api('/me'); renderUserBox(); }
    } catch (e) { fail(e); }
  }, 300);
  const save = (k, v) => { pending[k] = v; flush(); };
  $$('[data-k]').forEach(i => i.addEventListener('change', () => save(i.dataset.k, i.value)));
  $$('[data-copy]').forEach(b => b.onclick = () => { const i = $('#' + b.dataset.copy); i.select(); (navigator.clipboard ? navigator.clipboard.writeText(i.value) : Promise.resolve(document.execCommand('copy'))).then(() => toast('Copied')); });
  $('#octo-regen').onclick = async () => { if (await confirmDlg('Create a new API key? Orca has to be updated with it.')) { S.settings = await api('/settings/octo-key', { method: 'POST' }); PAGES.settings(); } };
  $('#autolog').onchange = e => save('auto_print_log', e.target.checked ? '1' : '0');
  $('#autolog-now').onclick = async () => { $('#autolog-res').textContent = 'Checking…'; try { const r = await api('/autolog/sync', { method: 'POST' }); $('#autolog-res').textContent = r.imported ? `${r.imported} new print(s) logged` : 'Nothing new'; } catch (e) { $('#autolog-res').textContent = e.message; } };
  $('#sm-deduct').onchange = e => save('spoolman_deduct', e.target.checked ? '1' : '0');
  $('#sm-test').onclick = async () => {
    const url = $('#sm-url').value.trim(), res = $('#sm-res');
    res.innerHTML = '<span class="muted">Connecting…</span>';
    try {
      const t = await api('/spoolman/test', { method: 'POST', body: { url } });
      S.settings = await api('/settings', { method: 'PUT', body: { spoolman_url: url } });
      const r = await api('/spoolman/sync', { method: 'POST' });
      res.innerHTML = `<span style="color:var(--teal)">✓ Spoolman ${esc(t.version || '')} – ${r.synced} spools synced</span>`;
      refreshMeta();
    } catch (e) { res.innerHTML = `<span style="color:var(--red)">✕ ${esc(e.message)}</span>`; }
  };
  api('/spoolman').then(x => { if (x.configured && x.at) $('#sm-res').innerHTML = x.error ? `<span style="color:var(--red)">Last sync ${esc(x.at)}: ${esc(x.error)}</span>` : `<span class="muted">Last sync ${esc(x.at)} · ${x.count} spools</span>`; }).catch(() => { });
  $('#s-slicers').addEventListener('change', () => save('slicers', $$('#s-slicers input:checked').map(i => i.value).join(',')));
  $$('[data-theme]', $('#view')).forEach(b => b.onclick = () => setTheme(b.dataset.theme));
  $$('[data-bgsel]', $('#view')).forEach(b => b.onclick = () => { if (b.disabled) return; document.documentElement.dataset.bg = b.dataset.bgsel; store.set('bg', b.dataset.bgsel); $$('[data-bgsel]', $('#view')).forEach(x => x.classList.toggle('on', x === b)); });
  $('#bg-up').onclick = () => $('#bg-file').click();
  $('#bg-file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const fd = new FormData(); fd.append('image', f);
    try { const r = await api('/background', { method: 'POST', form: fd }); store.set('bg', 'photo'); applyBg(String(r.v)); toast('Background updated', 'ok'); PAGES.settings(); } catch (er) { fail(er); }
  };
  $('#bg-rm')?.addEventListener('click', async () => { await api('/background', { method: 'DELETE' }); store.set('bg', 'pattern'); applyBg(''); toast('Background removed'); PAGES.settings(); });
  $('#s-scan').onclick = async () => { await api('/scan', { method: 'POST' }); toast('Scan started'); pollScan(true); };
  $('#s-rethumb').onclick = async () => { if (await confirmDlg('Regenerate all rendered previews? Embedded slicer thumbnails and custom thumbnails are kept.')) { await api('/rethumb', { method: 'POST' }); toast('Regenerating previews in background'); pollScan(true); } };
  $('#s-missing').onclick = async () => {
    const r = await api('/files?missing=1&per=500');
    modal({ title: `Missing files (${r.total})`, size: 'lg', body: r.items.length ? `<p class="muted small" style="margin:0">These files were indexed before but can't be found anymore. If they reappear (e.g. a network share comes back, or the file is moved back) they are re-linked automatically.</p><div style="display:flex;flex-direction:column;gap:4px">${r.items.map(f => `<div class="mono small">${esc(f.root)}/${esc(f.folder ? f.folder + '/' : '')}${esc(f.name)}</div>`).join('')}</div>` : '<p class="muted">No missing files.</p>',
      buttons: r.items.length ? [{ label: 'Close' }, { label: 'Forget all missing files', cls: 'danger', onClick: async () => { if (await confirmDlg('Remove all missing entries from the database (including their tags and notes)?', { ok: 'Forget', danger: true })) { await api('/files/batch', { method: 'POST', body: { ids: r.items.map(f => f.id), action: 'forget' } }); toast('Forgotten', 'ok'); } } }] : [{ label: 'Close' }] });
  };
  $('#s-restore').onclick = () => $('#s-restore-file').click();
  $('#s-restore-file').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    if (!await confirmDlg(`Restore <b>${esc(file.name)}</b>? This replaces all current tags, notes, print log, spools and printers.`, { ok: 'Restore', danger: true })) return;
    const fd = new FormData(); fd.append('file', file);
    try { await api('/restore', { method: 'POST', form: fd }); toast('Backup restored', 'ok'); await loadMeta(); renderNav(); } catch (er) { fail(er); }
  };
  $('#s-trash').onclick = async () => { if (await confirmDlg('Permanently delete everything in the trash?', { ok: 'Empty trash', danger: true })) { await api('/trash/empty', { method: 'POST' }); PAGES.settings(); } };
  $('#s-logout')?.addEventListener('click', logout);
};
function setTheme(t) {
  document.documentElement.dataset.theme = t; store.set('theme', t);
  $$('[data-theme]', $('#view')).forEach(b => b.classList.toggle('on', b.dataset.theme === t));
  $('meta[name=theme-color]').content = t === 'dark' ? '#0f1115' : '#f3f4f7';
}

/* ============================================================ scan status */
let scanTimer = null, lastScanState = 'idle';
async function pollScan(force) {
  clearTimeout(scanTimer);
  let st;
  try { st = await api('/scan/status'); } catch { scanTimer = setTimeout(pollScan, 15000); return; }
  const busy = st.state !== 'idle' || st.pending_analysis > 0;
  const ind = $('#scan-indicator');
  if (busy) {
    const pct = st.total ? Math.round(st.done / st.total * 100) : 0;
    ind.innerHTML = `<div class="row" style="gap:8px"><div class="spinner" style="width:14px;height:14px;border-width:2px"></div><span>${esc(st.phase || 'Processing')}${st.total ? ` · ${st.done}/${st.total}` : ''}</span></div>
      <div class="bar"><i style="width:${pct}%"></i></div><div class="small mono" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(st.current || '')}</div>`;
  } else {
    ind.innerHTML = `<div class="row" style="justify-content:space-between"><span>${st.last_scan ? 'Scanned ' + esc(st.last_scan.slice(11, 16)) : 'Ready'}</span><button class="btn ghost sm" id="scan-now" title="Scan library folders now">${I.refresh}</button></div>`;
    $('#scan-now').onclick = async () => { await api('/scan', { method: 'POST' }); pollScan(true); };
  }
  const changed = S._libSig != null && st.lib_sig && st.lib_sig !== S._libSig;
  if (FOLLOW && (changed || S._followAt == null)) followOrca();
  if (st.lib_sig) S._libSig = st.lib_sig;
  if (lastScanState === 'busy' && !busy) {
    await loadMeta(); renderNav();
    if (S.route === 'library' && !detailState) { renderSideLibrary(); refreshVisible(); }
    else if (S.route === 'home') liveRefresh();
    if (detailState?.f && !detailState.f.analyzed) openDetail(detailState.id);
  } else if (changed) {
    liveRefresh(busy); // new upload / new previews (also when the work was too short to be seen as "busy")
  }
  if (S.route === 'library' && S.printers?.some(p => p.conn_type) && Date.now() - (S._prAt || 0) > 14000) { S._prAt = Date.now(); pollPrinting(); }
  lastScanState = busy ? 'busy' : 'idle';
  // polling is one tiny request; while the tab is hidden it stops completely
  if (!document.hidden) scanTimer = setTimeout(pollScan, busy ? 2000 : 8000);
}
S._tick = 0;
async function pollPrinting() {
  let list;
  try { list = await api('/printing'); } catch { return; }
  const m = {};
  for (const x of list) if (x.file_id) m[x.file_id] = x;
  const key = o => JSON.stringify(Object.entries(o).map(([k, v]) => [k, Math.round(v.progress * 100), v.state]));
  const changed = key(m) !== key(S.printing || {});
  S.printing = m;
  if (changed && S.route === 'library' && !detailState && $('#cards-host')) renderList(true);
}
// opened from OrcaSlicer's Device tab (/p/<printer>): show each new upload from Orca without a manual reload
const FOLLOW = new URLSearchParams(location.search).get('follow');
async function followOrca() {
  let r;
  try { r = await api(`/printers/${FOLLOW}/orca-last`); } catch { return; }
  if (!r.file_id) return;
  const first = S._followAt == null;
  if (!first && r.at > S._followAt) {
    if (location.hash === '#/file/' + r.file_id) openDetail(r.file_id);  // same name uploaded again: reload it
    else location.hash = '#/file/' + r.file_id;
    toast('New upload from OrcaSlicer', 'ok');
  }
  S._followAt = r.at;
}
let liveBusy = false;
async function liveRefresh(busy) {
  // never pull the page away under the user: not while a dialog is open, text is typed or cards are selected
  if (liveBusy || $('.modal-bg') || S.selected?.size) return;
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT')) return;
  liveBusy = true;
  try {
    if (S.route === 'library' && !detailState && $('#cards-host')) {
      if (busy && ++S._tick % 2) return; // during a long analysis: every 2nd change is plenty
      await refreshVisible();
      if (!busy) { await loadMeta(); renderNav(); renderSideLibrary(); }
    } else if (S.route === 'home') {
      const y = $('#view').scrollTop;
      await PAGES.home(undefined, true);
      $('#view').scrollTop = y;
    }
  } catch { } finally { liveBusy = false; }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { pollScan(); if (S.route === 'home') homePrinters(); } });

/* ============================================================ library: collections row, banners, tabs */
const LIB_TABS = [['', 'All models', I.grid], ['printed', 'Printed', I.check], ['unprinted', 'Unprinted', I.cube], ['queue', 'Queue', I.queue], ['fav', 'Favorites', I.heart]];
const cubeIco = color => `<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2.5 21 7.5v9L12 21.5 3 16.5v-9Z" fill="${esc(color)}"/><path d="M12 12 21 7.5M12 12 3 7.5M12 12v9.5" stroke="rgba(0,0,0,.28)" stroke-width="1.2" fill="none"/><path d="M12 2.5 21 7.5 12 12 3 7.5Z" fill="rgba(255,255,255,.22)"/></svg>`;
let heroCounts = null, heroAt = 0;
async function renderLibHero() {
  const host = $('#lib-hero'); if (!host) return;
  if (insideBundle() || (S.f.folder != null && S.f.root)) { host.innerHTML = ''; return; }
  const f = S.f;
  const home = !f.collection && !f.q && !f.kind && !f.status && !f.tag.length && !f.tab && !f.added_days && !f.favorite && !f.untagged && !f.dupes && !f.printer;
  const tiles = [`<button class="cat ${!f.collection ? 'on' : ''}" data-cat=""><span class="ci all">${cubeIco('var(--text2)')}</span><span>All</span></button>`,
    ...S.collections.map(c => `<button class="cat ${f.collection == c.id ? 'on' : ''}" data-cat="${c.id}" title="${esc(c.name)} · ${c.n} files"><span class="ci">${cubeIco(c.color || '#f29d38')}</span><span>${esc(c.name)}</span></button>`),
    `<button class="cat add" data-newcat title="New collection"><span class="ci">${I.plus}</span><span>New</span></button>`];
  host.innerHTML = `<div class="cat-row">${tiles.join('')}</div>
    ${home ? `<div class="hero-row" id="hero-row"></div>` : ''}
    <div class="lib-tabs">${LIB_TABS.map(([k, l, ic]) => `<button data-tab="${k}" class="${f.tab === k ? 'on' : ''}">${ic}<span>${l}</span></button>`).join('')}</div>`;
  host.onclick = e => {
    const c = e.target.closest('[data-cat]');
    if (c) { f.collection = c.dataset.cat; S.selected.clear(); return applyFilters(); }
    if (e.target.closest('[data-newcat]')) return editCollection(null);
    const t = e.target.closest('[data-tab]');
    if (t) { f.tab = t.dataset.tab; return applyFilters(); }
    const hb = e.target.closest('[data-hero]');
    if (hb?.dataset.hero === 'ready') { f.kind = 'sliced,gcode'; f.tab = 'unprinted'; return applyFilters(); }
    if (hb?.dataset.hero === 'new') { f.added_days = 7; return applyFilters(); }
    if (hb?.dataset.hero === 'unprinted') { f.tab = 'unprinted'; return applyFilters(); }
  };
  if (!home) return;
  if (!heroCounts || Date.now() - heroAt > 60000) {
    try {
      const [r, n, u] = await Promise.all([api('/files?group=1&per=1&kind=sliced,gcode&status=none,want'), api('/files?group=1&per=1&added_days=7'), api('/files?group=1&per=1&status=none,want')]);
      heroCounts = { ready: r.total, fresh: n.total, unprinted: u.total }; heroAt = Date.now();
    } catch { return; }
  }
  const hr = $('#hero-row'); if (!hr) return;
  const hc = heroCounts;
  hr.innerHTML = `<button class="hero dark" data-hero="${hc.ready ? 'ready' : 'unprinted'}"><div><span class="pill">${hc.ready ? 'Ready to print' : 'Still to print'}</span>
      ${hc.ready ? `<h3>${hc.ready} sliced ${hc.ready === 1 ? 'file is' : 'files are'} waiting</h3><p>G-code and sliced 3MF not printed yet – show only those</p>`
        : `<h3>${hc.unprinted} ${hc.unprinted === 1 ? 'model has' : 'models have'} not been printed yet</h3><p>Show only those</p>`}</div>
      <div class="hero-art">${cubeIco('#5aa7ff')}${cubeIco('#f29d38')}</div></button>
    <button class="hero accent" data-hero="new"><div><span class="pill">New this week</span><div class="big">${heroCounts.fresh}</div><p>${heroCounts.fresh === 1 ? 'model' : 'models'} added in the last 7 days</p></div></button>`;
}

/* ============================================================ library: side panel */
let panelState = null;
function closePanel() {
  if (!panelState) return;
  panelState = null;
  $('#lib-panel')?.classList.add('hidden');
  $('#workarea')?.classList.remove('with-panel');
  $$('#cards .card.peek, #cards tr.peek').forEach(x => x.classList.remove('peek'));
}
async function openPanel(id) {
  const host = $('#lib-panel'); if (!host) { location.hash = '#/file/' + id; return; }
  panelState = { id };
  $$('#cards .peek').forEach(x => x.classList.remove('peek'));
  $(`#cards [data-id="${id}"]`)?.classList.add('peek');
  host.classList.remove('hidden'); $('#workarea').classList.add('with-panel');
  if (!host.innerHTML.trim()) host.innerHTML = '<div class="lp-load"><div class="spinner"></div></div>';
  let f;
  try { f = await api('/files/' + id); } catch (e) { fail(e); return closePanel(); }
  if (panelState?.id !== id) return;
  panelState.f = f;
  renderPanel();
}
async function savePanel(patch) {
  const f0 = panelState?.f; if (!f0) return;
  try {
    const f = await api('/files/' + f0.id, { method: 'PATCH', body: patch });
    if (panelState?.id !== f0.id) return;
    panelState.f = { ...f0, ...f };
    patchItem(f.id, f);
    $(`#cards [data-id="${f.id}"]`)?.classList.add('peek');
    renderPanel();
    if ('status' in patch || 'favorite' in patch) refreshMeta();
  } catch (e) { fail(e); }
}
function renderPanel() {
  const host = $('#lib-panel'), f = panelState.f;
  const imgs = (f.attachments || []).filter(a => isImgExt(a.ext));
  const docs = (f.attachments || []).filter(a => ['pdf', 'txt', 'md'].includes(a.ext));
  const aUrl = a => `/api/files/${f.id}/attachment/${encodeURIComponent(a.name)}`;
  const sl = slicersFor(f);
  const last = (f.prints || [])[0];
  const by = f.designer ? `by ${esc(f.designer)}` : `<span class="mono">/${esc(f.folder || '')}</span>`;
  const can3d = stageModes(f).some(m => m !== 'image');
  const rows = [
    ['File', esc(f.name)],
    ['Format', `<span class="badge ${badgeCls(f.ext)}">${esc(f.ext)}</span>`],
    ['Size', fmt.bytes(f.size)],
    f.dim_x != null ? ['Dimensions', `${fmt.mm(f.dim_x)} × ${fmt.mm(f.dim_y)} × ${fmt.mm(f.dim_z)} mm`] : null,
    f.print_time_s ? ['Print time', fmt.dur(f.print_time_s)] : null,
    f.grams ? ['Filament', (f.grams_estimated ? '~' : '') + fmt.g(f.grams) + (f.material ? ` · ${esc(f.material)}` : '')] : null,
    ['Print status', `<select id="lp-status" class="compact">${Object.entries(STATUS).map(([k, s]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
      ${last ? `<div class="muted small" style="margin-top:4px">Last printed ${fmt.dt(last.started_at)}${last.printer_name ? ' · ' + esc(last.printer_name) : ''}</div>` : ''}`],
    ['Rating', `<span class="stars" id="lp-stars">${[1, 2, 3, 4, 5].map(n => `<button data-r="${n}" class="${(f.rating || 0) >= n ? 'on' : ''}">★</button>`).join('')}</span>`],
    ['Designer', f.designer ? esc(f.designer) : '<span class="muted">–</span>'],
    ['Source', f.source_url ? `<a href="${esc(f.source_url)}" target="_blank" rel="noopener">${esc(f.source_url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40))}</a>` : '<span class="muted">–</span>'],
    ['Folder', `<a href="#" id="lp-folder" class="mono">/${esc(f.folder || '')}</a>`],
    f.tags?.length ? ['Tags', `<div class="tags-mini wrap">${f.tags.map(t => tagChip(t)).join('')}</div>`] : null,
    f.collections?.length ? ['Collections', collChips(f, 9).replace('colls-mini', 'colls-mini wrap')] : null,
  ].filter(Boolean);
  host.innerHTML = `<div class="lp-hd"><div style="min-width:0"><h2 title="${esc(f.display_name)}">${esc(f.display_name)}</h2><div class="lp-by">${by}</div></div>
      <button class="icon-btn" id="lp-x" title="Close (Esc)">${I.x}</button></div>
    <div class="lp-img">${f.thumb > 0 ? `<img src="/api/files/${f.id}/thumb?v=${f.thumb_v}" alt="" class="${f.thumb === 4 ? 'photo' : ''}">` : `<div class="ph">${(KIND_ICON[f.kind] || I.cube).replace('<svg', '<svg width="64" height="64"')}<span>${esc(f.ext)}</span></div>`}
      <button class="icon-btn lp-exp" data-full title="Open full view">${I.expand}</button>
      ${can3d ? `<button class="btn sm lp-3d" data-full>${I.cube} ${f.kind === 'gcode' || f.kind === 'sliced' ? 'Toolpath' : '3D'}</button>` : ''}</div>
    ${docs.length ? `<div class="lp-docs">${docs.slice(0, 8).map((a, k) => `<button class="btn sm" data-doc="${k}" title="${esc(a.name)}"><span class="badge">${esc(a.ext)}</span>${esc(a.name.replace(/\.[^.]+$/, ''))}</button>`).join('')}</div>` : ''}
    ${imgs.length ? `<div class="lp-gal">${imgs.slice(0, 8).map((a, k) => `<button data-img="${k}"><img src="${aUrl(a)}" loading="lazy" alt=""></button>`).join('')}</div>` : ''}
    <div class="lp-box">
      <h4>Model details</h4>
      <div class="lp-actions">
        ${sl.length ? `<div class="split"><button class="btn primary" data-slicer="${sl[0]}">Open in ${SLICERS[sl[0]].name}</button>${sl.length > 1 ? `<button class="btn primary" id="lp-sl-more" title="Other slicers">▾</button>` : ''}</div>` : ''}
        ${canSend(f) ? `<button class="btn ${sl.length ? '' : 'primary'}" id="lp-send">${I.upload} Send to printer</button>` : ''}
      </div>
      <div class="lp-actions">
        <button class="btn sm" id="lp-queue">${I.queue} Queue</button>
        <button class="btn sm" id="lp-log">${I.log} Log print</button>
        <button class="btn sm" data-full>${I.expand} Open</button>
        <span class="spacer"></span>
        <button class="icon-btn ${f.favorite ? 'on fav' : ''}" id="lp-fav" title="Favorite">${f.favorite ? I.star : I.starO}</button>
        <a class="icon-btn" href="/api/files/${f.id}/download" title="Download">${I.download}</a>
        <button class="icon-btn" id="lp-more" title="More">${I.more}</button>
      </div>
      <dl class="lp-dl">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      ${f.notes ? `<div class="lp-notes">${esc(f.notes)}</div>` : ''}
    </div>`;
  $('#lp-x', host).onclick = closePanel;
  $$('[data-full]', host).forEach(b => b.onclick = () => { location.hash = '#/file/' + f.id; });
  $$('[data-slicer]', host).forEach(b => b.onclick = () => openInSlicer(f, b.dataset.slicer));
  $('#lp-sl-more', host)?.addEventListener('click', e => menuAt(e.currentTarget, sl.map(k => ({ label: 'Open in ' + SLICERS[k].name, icon: I.cube, onClick: () => openInSlicer(f, k) }))));
  $('#lp-send', host)?.addEventListener('click', () => sendDialog(f, { onDone: () => openPanel(f.id) }));
  $('#lp-queue', host).onclick = () => quickQueue(f);
  $('#lp-log', host).onclick = () => logPrintDialog({ file: f, grams: f.grams, hours: f.print_time_s ? f.print_time_s / 3600 : undefined, onDone: () => { openPanel(f.id); refreshMeta(); } });
  $('#lp-fav', host).onclick = () => savePanel({ favorite: !f.favorite });
  $('#lp-status', host).onchange = e => savePanel({ status: e.target.value });
  $$('#lp-stars [data-r]', host).forEach(b => b.onclick = () => savePanel({ rating: f.rating == b.dataset.r ? 0 : +b.dataset.r }));
  $('#lp-folder', host).onclick = e => { e.preventDefault(); closePanel(); S.f = { ...S.f, root: f.root, folder: f.folder, collection: '', tag: [], q: '', kind: '', status: '', tab: '', added_days: 0 }; renderLibraryTop(); applyFilters(); };
  $$('[data-img]', host).forEach(b => b.onclick = () => openLightbox(imgs[+b.dataset.img], imgs, aUrl));
  $$('[data-doc]', host).forEach(b => b.onclick = () => {
    const a = docs[+b.dataset.doc];
    if (a.ext === 'pdf') window.open(aUrl(a), '_blank', 'noopener'); else openTextViewer(aUrl(a), a.name, a.ext);
  });
  $('#lp-more', host).onclick = e => { const it = S.items.find(x => x.type !== 'bundle' && x.id === f.id) || { ...f, collections: f.collections || [] }; fileMenu(it, e.clientX, e.clientY); };
  host.onclick = e => {
    const c = e.target.closest('[data-coll-f]'); if (c) { closePanel(); openCollection(c.dataset.collF); return; }
    const t = e.target.closest('[data-tag]'); if (t) { const id = +t.dataset.tag; if (!S.f.tag.includes(id)) S.f.tag.push(id); applyFilters(); }
  };
}

/* ============================================================ home */
PAGES.home = async (_arg, quiet) => {
  topbar('Home', `<span class="spacer"></span><button class="btn" id="h-lib">${I.lib}<span class="hide-m">Library</span></button><button class="btn primary" id="upload-btn">${I.upload}<span class="hide-m">Upload</span></button>`);
  $('#h-lib').onclick = goLibraryHome;
  $('#upload-btn').onclick = () => openUpload();
  if (!quiet) $('#view').innerHTML = `<div class="page home"><div class="spinner" style="margin:60px auto"></div></div>`;
  let d;
  try { d = await api('/home'); } catch (e) { if (!quiet) fail(e); return; }
  if (S.route !== 'home') return;
  const qn = d.queue_copies;
  const thumbOf = it => it.type === 'bundle' ? `<img src="/api/bundles/${it.id}/thumb?v=${it.thumb_v}" alt="" loading="lazy">` : thumbHtml(it);
  const hero = d.new[0];
  S._homeNewest = hero;
  const ring = sp => { const pc = Math.max(0, Math.min(100, Math.round(100 * sp.remaining / (sp.weight_total || 1000)))); return `<span class="ring" style="--p:${pc}%"><i style="background:${esc(sp.color || '#888')}"></i></span>`; };
  const maxW = Math.max(1, ...d.weeks);
  $('#view').innerHTML = `<div class="page home">
    <div class="hello"><h1 class="hello-brand">${$('.brand svg').outerHTML.replace(/width="28" height="28"/, 'width="44" height="44"')}<span>Z-Hop Deck</span></h1><p class="muted">${qn ? `${qn} ${qn === 1 ? 'print is' : 'prints are'} waiting in the queue.` : 'The print queue is empty.'}</p></div>
    <div class="hgrid">
      <section class="hc lib-card">
        <h5>Your library</h5>
        <div class="lib-body">
          <div class="kpis">
            <a class="kpi" href="#/library" data-golib><span class="ki k1">${I.lib}</span><b>${fmt.num(d.models)}</b><span>Models</span></a>
            <a class="kpi" href="#/library" data-tab="printed"><span class="ki k2">${I.check}</span><b>${fmt.num(d.printed)}</b><span>Printed</span></a>
            <a class="kpi" href="#/queue"><span class="ki k3">${I.queue}</span><b>${fmt.num(qn)}</b><span>In queue</span></a>
            <a class="kpi" href="#/printers"><span class="ki k4">${I.printer}</span><b>${d.printers.length}</b><span>Printers</span></a>
          </div>
          ${hero ? heroHtml(hero, 'Newest') : ''}
        </div>
      </section>
      <div class="hstatus">
        ${!d.needs.length && !d.runs_out.length ? `<section class="hc allgood"><h5>All good <span class="ok">✓</span></h5>
          <p>Every queued print has the filament it needs, and no spool runs out in the next 90 days.</p></section>` : ''}
        ${d.needs.length ? `<section class="hc needs"><h5>Needs you <span class="nbadge">${d.needs.length}</span></h5>
          ${d.needs.map(n => `<a class="need" href="#/queue"><b>${esc(n.name)}</b> needs ${esc(n.needs)}</a>`).join('')}</section>` : ''}
        ${d.runs_out.length ? `<section class="hc soon"><h5>Runs out soon</h5>
          ${d.runs_out.map(r => `<div class="sp-row"><span class="dot" style="background:${esc(r.color || '#888')}"></span><span class="nm">${esc(r.name)}</span><b class="mono">${r.days} ${r.days === 1 ? 'day' : 'days'}</b></div>`).join('')}
          <p class="muted small" style="margin-bottom:0">At the rate your logged prints used them over the last 30 days.</p></section>` : ''}
      </div>
      <section class="hc spools">
        <h5>Spools <a href="#/filament">All ${d.spool_count}</a></h5>
        <div class="big">${d.spool_total_g >= 1000 ? (d.spool_total_g / 1000).toFixed(1) + '<small> kg</small>' : d.spool_total_g + '<small> g</small>'}</div>
        <p class="muted small" style="margin:0 0 10px">${d.spool_low ? `${d.spool_low} running low` : 'none running low'}</p>
        ${d.spools.map(sp => `<div class="sp-row" title="${esc([sp.brand, sp.material, sp.spoolman_id ? 'Spoolman #' + sp.spoolman_id : 'local spool'].filter(Boolean).join(' · '))}">${ring(sp)}<span class="nm">${esc(sp.name)}</span><b class="mono">${fmt.g(sp.remaining)}</b></div>`).join('') || '<p class="muted small">No spools yet.</p>'}
      </section>
      <section class="hc upnext">
        <h5>Up next <a href="#/queue">Queue</a></h5>
        ${d.up_next ? `<a class="un" href="#/file/${d.up_next.file.id}"><div class="th">${thumbHtml(d.up_next.file)}</div><div><b title="${esc(d.up_next.file.display_name)}">${esc(d.up_next.file.display_name)}</b>${d.up_next.copies > 1 ? ` <span class="muted">× ${d.up_next.copies}</span>` : ''}
          <p class="muted small">${d.up_next.more ? `then ${d.up_next.more} more` : 'last one in the queue'}</p></div></a>`
          : d.suggest ? `<p class="muted small" style="margin-top:0">The queue is empty. How about:</p>
            <a class="un" href="#/file/${d.suggest.id}"><div class="th">${thumbHtml(d.suggest)}</div><div><b title="${esc(d.suggest.display_name)}">${esc(d.suggest.display_name)}</b>
            <p class="muted small">${d.suggest.status === 'want' ? 'on your want-to-print list' : 'not printed yet'}</p></div></a>
            <button class="btn sm" id="h-sugq" style="margin-top:10px">${I.queue} Add to queue</button>`
          : `<p class="muted small">The queue is empty.</p><button class="btn sm" data-golib>${I.lib} Open the library</button>`}
      </section>
      <section class="hc month">
        <h5>This month</h5>
        ${d.month.prints ? `<div class="mnums"><div><b>${d.month.prints}</b><span>prints</span></div><div><b>${d.month.ok_pct == null ? '–' : d.month.ok_pct + '%'}</b><span>worked</span></div><div><b>${d.month.grams >= 1000 ? (d.month.grams / 1000).toFixed(1) + ' kg' : d.month.grams + ' g'}</b><span>filament</span></div></div>
        <div class="wbars">${d.weeks.map((n, k) => `<div title="${k === 3 ? 'This week' : `${3 - k} week${3 - k > 1 ? 's' : ''} ago`}: ${n} prints"><i class="${k === 3 ? 'now' : ''}" style="height:${Math.max(6, Math.round(100 * n / maxW))}%"></i></div>`).join('')}</div>`
          : `<p class="muted small" style="margin:0">No prints logged this month yet.</p>
             <p class="muted small">Finished prints appear here automatically with the <a href="#/settings">automatic print log</a>, or log one from a model's panel.</p>`}
      </section>
      <section class="hc printers">
        <h5>Printers <a href="#/printers">Manage</a></h5>
        ${d.printers.map(p => `<div class="pr" data-hp="${p.id}"><div><b>${esc(p.name)}</b><span class="muted small st">${p.conn_type ? 'checking…' : esc(p.model || 'not connected')}</span></div><span class="dot ${p.conn_type ? '' : 'none'}" title="${p.conn_type ? 'checking…' : 'no network connection set up'}"></span></div>`).join('') || '<p class="muted small">No printers yet.</p>'}
      </section>
      <section class="hc fresh">
        <h5>New in your library <span class="muted small" style="text-transform:none;letter-spacing:0">${d.new_week} this week</span></h5>
        <div class="fresh-row">${d.new.map(it => `<a href="${itemHash(it)}" ${it.type === 'bundle' ? `data-hb="${it.id}"` : ''}><div class="th">${thumbOf(it)}</div><span>${esc(it.display_name || it.name)}</span></a>`).join('') || '<p class="muted small">Nothing yet – upload your first model.</p>'}</div>
      </section>
    </div></div>`;
  const v = $('#view');
  $('#h-sugq', v)?.addEventListener('click', async () => { await quickQueue(d.suggest); PAGES.home(); });
  const bundles = Object.fromEntries([...d.new, d.last_print?.file].filter(x => x?.type === 'bundle').map(b => [b.id, b]));
  v.onclick = e => {
    const hb = e.target.closest('[data-hb]');
    if (hb && bundles[hb.dataset.hb]) { e.preventDefault(); return openModelFolder(bundles[hb.dataset.hb]); }
    const a = e.target.closest('[data-golib]'); if (a) { e.preventDefault(); return goLibraryHome(); }
    const t = e.target.closest('.kpi[data-tab]');
    if (t) { e.preventDefault(); goLibraryHome(); S.f.tab = t.dataset.tab; if (S.route === 'library' && $('#filterbar')) applyFilters(); }
  };
  S._homePrinters = d.printers;
  homePrinters();
};

function homeThumbOf(it) { return it.type === 'bundle' ? `<img src="/api/bundles/${it.id}/thumb?v=${it.thumb_v}" alt="" loading="lazy">` : thumbHtml(it); }
function heroHtml(it, label) {
  return `<a class="lib-show" href="${itemHash(it)}" ${it.type === 'bundle' ? `data-hb="${it.id}"` : ''}><div class="th">${homeThumbOf(it)}</div><span class="cap">${label}: <b>${esc(it.display_name || it.name)}</b></span></a>`;
}
// "Your library" picture: the model being printed right now, otherwise the newest one
async function homeHero() {
  const card = $('.lib-card .lib-body'); if (!card) return;
  let pr = null;
  try { pr = (await api('/printing?items=1')).find(x => x.item); } catch { }
  if (S.route !== 'home') return;
  const cur = $('.lib-show', card);
  const want = pr ? `p${pr.item.id}:${Math.round(pr.progress * 100)}` : `n${S._homeNewest?.id || ''}`;
  if (cur && cur.dataset.key === want) return;
  const it = pr ? pr.item : S._homeNewest;
  if (!it) { cur?.remove(); return; }
  const el = h(heroHtml(it, pr ? `${/paus/i.test(pr.state) ? 'Paused' : 'Now printing'} ${Math.round(pr.progress * 100)}%` : 'Newest'));
  el.dataset.key = want;
  if (pr) el.classList.add('printing');
  cur ? cur.replaceWith(el) : card.append(el);
}

/* ---- Home → Printers: status every few seconds, live toolpath of the running print ---- */
const LIVE = new Map();  // printer id -> { file, el, viewer, ready, failed }
let homePoll = null;
function disposeLive(pid) {
  for (const [k, L] of LIVE) {
    if (pid != null && k !== pid) continue;
    try { L.viewer?.dispose(); } catch { }
    L.el.remove(); LIVE.delete(k);
  }
}
async function homePrinters() {
  clearTimeout(homePoll);
  const list = (S._homePrinters || []).filter(x => x.conn_type);
  if (S.route !== 'home' || !list.length) return;
  let printing = false;
  await Promise.all(list.map(async p => {
    let st;
    try { st = await api(`/printers/${p.id}/status`); } catch { return; }
    if (S.route !== 'home') return;
    const row = $(`[data-hp="${p.id}"]`); if (!row) return;
    const sp = st.active_spool;
    const busy = st.connected && /print|paus/i.test(st.state || '');
    printing = printing || busy;
    $('.st', row).textContent = st.connected ? `${st.state}${st.progress != null && busy ? ' · ' + Math.round(st.progress * 100) + '%' : ''}${busy && st.remaining_s ? ' · ' + fmtLeft(st.remaining_s) + ' left' : ''}${sp ? ' · ' + sp.name : ''}` : (st.state || 'offline');
    const dot = $('.dot', row);
    dot.classList.remove('off', 'busy', 'on');
    dot.classList.add(!st.connected ? 'off' : busy ? 'busy' : 'on');
    dot.title = !st.connected ? 'not reachable' : busy ? 'printing' : 'online';
    if (sp) $('.st', row).insertAdjacentHTML('afterbegin', `<i class="spc" style="background:${esc(sp.color || '#888')}"></i>`);
    liveView(p, st, row, busy);
  }));
  for (const k of [...LIVE.keys()]) if (!list.some(p => p.id === k)) disposeLive(k);
  if (printing || $('.lib-show.printing')) homeHero();  // also switches back to "Newest" when the print ends
  if (S.route === 'home' && !document.hidden) homePoll = setTimeout(homePrinters, printing ? 5000 : 30000);
}
function fmtLeft(s) { return s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${Math.max(1, Math.round(s / 60))} min`; }
function liveView(p, st, row, busy) {
  let L = LIVE.get(p.id);
  if (!busy || !st.file || st.live === false) { if (L) disposeLive(p.id); return; }
  if (L && L.file !== st.file) { disposeLive(p.id); L = null; }
  if (!L) {
    L = { file: st.file, el: h(`<div class="hlive" title="Drag to turn, scroll to zoom"><div class="lvmsg muted small"></div><div class="lvinfo mono small"></div></div>`) };
    LIVE.set(p.id, L);
    const big = (st.file_size || 0) > 60 * 1024 * 1024;
    if (big) {
      $('.lvmsg', L.el).innerHTML = `<button class="btn sm">${I.cube} Show live toolpath (${fmt.bytes(st.file_size)})</button>`;
      $('.lvmsg button', L.el).onclick = () => startLive(p, L);
    } else startLive(p, L);
  }
  if (row.nextElementSibling !== L.el) row.after(L.el);  // (re)attach after a Home refresh
  L.last = st;
  if (L.ready) livePos(L, st);
}
async function startLive(p, L) {
  const msg = $('.lvmsg', L.el);
  msg.textContent = 'Loading toolpath…';
  try {
    const V = await loadViewer();
    if (!LIVE.has(p.id) || LIVE.get(p.id) !== L) return;
    L.viewer = new V.Viewer(L.el, { bed: viewerBed(), dark: document.documentElement.dataset.theme === 'dark' });
    L.el.prepend(L.viewer.renderer.domElement);
    await L.viewer.loadGcode(`/api/printers/${p.id}/job.gcode?file=${encodeURIComponent(L.file)}`, pr => { msg.textContent = `Loading toolpath… ${Math.round(pr * 100)}%`; });
    if (LIVE.get(p.id) !== L) return;
    L.viewer.showGhost();
    L.viewer.setBedVisible(false);
    L.viewer.frame();
    L.viewer.setAutoRotate(true);
    msg.textContent = '';
    L.ready = true;
    if (L.last) livePos(L, L.last);
  } catch (e) {
    try { L.viewer?.dispose(); } catch { }
    L.viewer = null; L.failed = true;
    msg.textContent = 'Live view not available: ' + e.message;
  }
}
function livePos(L, st) {
  const v = L.viewer; if (!v?.gcode) return;
  let r;
  if (st.file_pos != null) r = v.setFilePos(st.file_pos);          // exact: where the printer is in the file
  else if (st.layer) r = v.setProgressLayer(st.layer);              // slicer reports layers (SET_PRINT_STATS_INFO)
  else if (st.z != null) r = v.setZ(st.z);
  else r = v.setFilePos((st.progress || 0) * v.gcode.length);
  if (r) $('.lvinfo', L.el).textContent = `Layer ${r.layer} / ${r.layers} · Z ${(+r.z || 0).toFixed(2)} mm`;
}

/* ============================================================ keyboard */
document.addEventListener('keydown', e => {
  const typing = e.target.closest('input, textarea, select, [contenteditable]');
  if ($('.modal')) return;
  if (detailState) {
    if (e.key === 'Escape') { closeDetail(); return; }
    if (!typing && e.key === 'ArrowLeft') detailNav(-1);
    if (!typing && e.key === 'ArrowRight') detailNav(1);
    return;
  }
  if (typing) { if (e.key === 'Escape') e.target.blur(); return; }
  if (e.key === '/' && S.route === 'library') { e.preventDefault(); $('#q')?.focus(); }
  else if ((e.key === 'u' || e.key === 'U') && !e.ctrlKey && !e.metaKey) openUpload();
  else if (e.key === 'Escape' && S.selected.size) { S.selected.clear(); syncSelection(); }
  else if (e.key === 'Escape' && panelState) closePanel();
  else if (e.key === 'Escape' && S.route === 'library' && insideBundle()) leaveBundle();
  else if ((e.ctrlKey || e.metaKey) && e.key === 'a' && S.route === 'library') { e.preventDefault(); selectAll(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && S.selected.size) batchDelete([...S.selected]);
});
window.addEventListener('hashchange', e => { S.cameFromApp = true; });

/* ============================================================ boot */
async function boot() {
  try {
    S.me = await api('/me');
    if (S.me.auth_required && !S.me.authenticated) return showLogin();
    await loadMeta();
  } catch (e) { if (!$('.login')) fail(e); return; }
  renderNav();
  renderUserBox();
  await route();
  pollScan();
}
boot();
