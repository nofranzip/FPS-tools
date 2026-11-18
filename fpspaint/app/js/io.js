'use strict';
/* Guardado (IndexedDB), PSD, pinceles importados (ABR / PNG / FPSpaint), paletas, time-lapse y quitar fondo */
const DB = {
  db: null, ok: false, mem: { meta: new Map(), data: new Map(), kv: new Map() },
  async open() {
    try { this.db = await new Promise((res, rej) => { const r = indexedDB.open('fpspaint', 1); r.onupgradeneeded = () => { const d = r.result; for (const s of ['meta', 'data', 'kv']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); this.ok = true; } catch (e) { console.warn('IndexedDB no disponible', e); this.ok = false; }
  },
  req(store, mode, fn) { return new Promise((res, rej) => { try { const t = this.db.transaction(store, mode), r = fn(t.objectStore(store)); t.oncomplete = () => res(r ? r.result : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); } catch (e) { rej(e); } }); },
  async put(s, k, v) { if (!this.ok) { this.mem[s].set(k, v); return; } return this.req(s, 'readwrite', st => st.put(v, k)); },
  async get(s, k) { if (!this.ok) return this.mem[s].get(k); return this.req(s, 'readonly', st => st.get(k)); },
  async del(s, k) { if (!this.ok) { this.mem[s].delete(k); return; } return this.req(s, 'readwrite', st => st.delete(k)); },
  async all(s) { if (!this.ok) return [...this.mem[s].values()]; return this.req(s, 'readonly', st => st.getAll()); },
};
const toBlob = (c, type = 'image/png', q) => new Promise(r => c.toBlob(b => r(b), type, q));
async function blobToCanvas(b, w, h) { const c = mkCanvas(w, h); if (!b) return c; try { const bm = await createImageBitmap(b); c.getContext('2d').drawImage(bm, 0, 0); bm.close && bm.close(); } catch { const url = URL.createObjectURL(b); const im = new Image(); await new Promise(r => { im.onload = r; im.onerror = r; im.src = url; }); c.getContext('2d').drawImage(im, 0, 0); URL.revokeObjectURL(url); } return c; }
function thumbOf(fi = 0, max = 360) { const k = Math.min(1, max / Math.max(doc.w, doc.h)); return compositeFrame(fi, true, k); }

async function saveDoc(silent) {
  if (!doc) return; if (S.textObj) TXT.commit();
  const frames = [];
  for (const f of doc.frames) { const layers = []; for (const l of f.layers) { if (!l._blob || l._blobVer !== l.ver) { const v = l.ver; l._blob = await toBlob(l.canvas); l._blobVer = v; } layers.push({ p: layerProps(l), blob: l._blob }); } frames.push({ active: f.active, layers, hold: f.hold || 1 }); }
  const th = thumbOf(0, 360).toDataURL('image/png');
  await DB.put('data', doc.id, { id: doc.id, bg: doc.bg, fps: doc.fps, pixel: doc.pixel, anim: doc.anim, frame: doc.frame, w: doc.w, h: doc.h, name: doc.name, created: doc.created, frames, tl: TL.frames, playMode: doc.playMode, onion: doc.onion, ai: doc.ai, folders: doc.folders || {} });
  await DB.put('meta', doc.id, { id: doc.id, name: doc.name, w: doc.w, h: doc.h, anim: doc.anim, nframes: doc.frames.length, updated: doc.updated, created: doc.created, thumb: th, pixel: doc.pixel });
  S.dirty = false; if (!silent) UI.savedBlip && UI.savedBlip();
}
async function loadDoc(id) {
  const d = await DB.get('data', id); if (!d) return false;
  doc = { id: d.id, name: d.name, w: d.w, h: d.h, bg: d.bg, anim: d.anim, fps: d.fps || 8, pixel: d.pixel, frames: [], frame: 0, created: d.created, updated: Date.now(), playMode: d.playMode || 'loop', onion: d.onion, ai: d.ai, folders: d.folders || {} };
  for (const f of d.frames) { const layers = []; for (const ld of f.layers) { const l = newLayer(ld.p.name); Object.assign(l, ld.p); l.canvas = await blobToCanvas(ld.blob, d.w, d.h); l.ctx = l.canvas.getContext('2d'); l._blob = ld.blob; l._blobVer = l.ver; layers.push(l); } doc.frames.push({ layers, active: Math.min(f.active, layers.length - 1), hold: f.hold || 1 }); }
  doc.frame = Math.min(d.frame || 0, doc.frames.length - 1); TL.frames = d.tl || []; return true;
}

/* ---------- time-lapse ---------- */
const TL = {
  frames: [], busy: false, last: 0,
  snap() { if (this.busy || !doc || S.playing) return; const now = performance.now(); if (now - this.last < 4000) { clearTimeout(this.tm); this.tm = setTimeout(() => this.snap(), 4100); return; } this.last = now; this.busy = true;
    const k = Math.min(1, 540 / Math.max(doc.w, doc.h)); const c = compositeFrame(doc.frame, true, k);
    toBlob(c, 'image/jpeg', .82).then(b => { this.busy = false; if (!b) return; this.frames.push(b); if (this.frames.length > 1600) this.frames = this.frames.filter((_, i) => i % 2 === 0); }); },
};

/* ---------- PSD (con capas) ---------- */
const PSD_BLEND = { 'source-over': 'norm', darken: 'dark', multiply: 'mul ', 'color-burn': 'idiv', lighten: 'lite', screen: 'scrn', 'color-dodge': 'div ', lighter: 'lddg', overlay: 'over', 'soft-light': 'sLit', 'hard-light': 'hLit', difference: 'diff', exclusion: 'smud', hue: 'hue ', saturation: 'sat ', color: 'colr', luminosity: 'lum ' };
function exportPSD() {
  const W = doc.w, H = doc.h, layers = L(); const parts = []; let size = 0;
  const B = n => { const a = new Uint8Array(n); parts.push(a); size += n; return new DataView(a.buffer); };
  const str = s => { const v = B(s.length); for (let i = 0; i < s.length; i++) v.setUint8(i, s.charCodeAt(i)); };
  let v = B(26); [56, 66, 80, 83].forEach((c, i) => v.setUint8(i, c)); v.setUint16(4, 1); v.setUint16(12, 4); v.setUint32(14, H); v.setUint32(18, W); v.setUint16(22, 8); v.setUint16(24, 3);
  B(4); B(4); // modo de color y recursos vacíos
  const recs = [], chans = [];
  for (const l of layers) {
    const src = l.tone ? layerSource(l) : l.canvas, d = src.getContext('2d').getImageData(0, 0, W, H).data, n = W * H; const ch = [new Uint8Array(n), new Uint8Array(n), new Uint8Array(n), new Uint8Array(n)];
    for (let i = 0, j = 0; j < n; i += 4, j++) { ch[0][j] = d[i]; ch[1][j] = d[i + 1]; ch[2][j] = d[i + 2]; ch[3][j] = d[i + 3]; }
    recs.push(l); chans.push(ch);
  }
  // tamaño de la info de capas
  const nameBytes = l => { const nm = unescape(encodeURIComponent(l.name)).slice(0, 255); let len = 1 + nm.length; while (len % 4) len++; return { nm, len }; };
  let info = 2; for (const l of recs) { info += 16 + 2 + 4 * 6 + 4 + 4 + 4 + 4 + 4 + 4 + nameBytes(l).len; } info += recs.length * 4 * (2 + W * H); if (info % 2) info++;
  v = B(4); v.setUint32(0, info + 4 + 4);
  v = B(4); v.setUint32(0, info);
  v = B(2); v.setInt16(0, recs.length);
  for (const l of recs) {
    v = B(16); v.setInt32(0, 0); v.setInt32(4, 0); v.setInt32(8, H); v.setInt32(12, W);
    v = B(2); v.setUint16(0, 4); for (const id of [-1, 0, 1, 2]) { v = B(6); v.setInt16(0, id); v.setUint32(2, 2 + W * H); }
    str('8BIM'); str(PSD_BLEND[l.blend] || 'norm');
    v = B(4); v.setUint8(0, Math.round(l.opacity * 255)); v.setUint8(1, l.clip ? 1 : 0); v.setUint8(2, (l.visible ? 0 : 2) | 8); v.setUint8(3, 0);
    const nb = nameBytes(l); v = B(4); v.setUint32(0, 4 + 4 + nb.len); v = B(4); v.setUint32(0, 0); v = B(4); v.setUint32(0, 0);
    v = B(nb.len); v.setUint8(0, nb.nm.length); for (let i = 0; i < nb.nm.length; i++) v.setUint8(1 + i, nb.nm.charCodeAt(i));
  }
  chans.forEach(ch => { for (const id of [3, 0, 1, 2]) { B(2); const a = B(W * H); new Uint8Array(a.buffer).set(ch[id]); } });
  let used = 2; for (const l of recs) used += 16 + 2 + 4 * 6 + 4 + 4 + 4 + 4 + 4 + 4 + nameBytes(l).len; used += recs.length * 4 * (2 + W * H); if (used % 2) B(1);
  v = B(4); v.setUint32(0, 0); // máscara global
  // imagen combinada
  const comp = compositeFrame(doc.frame, false).getContext('2d').getImageData(0, 0, W, H).data; B(2);
  for (const c of [0, 1, 2, 3]) { const a = new Uint8Array(W * H); for (let i = 0, j = 0; j < a.length; i += 4, j++) a[j] = comp[i + c]; parts.push(a); size += a.length; }
  return new Blob(parts, { type: 'image/vnd.adobe.photoshop' });
}

/* ---------- pinceles personalizados ---------- */
const CBR = {
  list: [],
  async load() { const arr = await DB.get('kv', 'brushes') || []; for (const b of arr) await this.add(b, true); },
  async persist() { await DB.put('kv', 'brushes', this.list.map(b => ({ ...b, tip: undefined, tipUrl: b.tipUrl }))); },
  async add(o, quiet) {
    const b = Object.assign({ id: 'c-' + uid(), name: 'Pincel', cat: 'Importados', size: 40, hard: 1, spacing: .15, psize: .5, popac: .3, flow: 1 }, o);
    if (b.tipUrl && !b.tip) b.tip = await urlToCanvas(b.tipUrl); if (b.tip && !b.tipUrl) b.tipUrl = b.tip.toDataURL('image/png');
    if (BR[b.id]) return; BRUSHES.push(b); BR[b.id] = b; this.list.push(b); 
    if (!quiet) await this.persist(); return b;
  },
  async remove(id) { const i = BRUSHES.findIndex(b => b.id === id); if (i >= 0) BRUSHES.splice(i, 1); delete BR[id]; this.list = this.list.filter(b => b.id !== id); await this.persist(); },
  exportFile(ids) { const arr = (ids ? BRUSHES.filter(b => ids.includes(b.id)) : this.list.concat(BRUSHES.filter(b => !b.tip && b.id.startsWith('c-')))).map(b => { const o = { ...b }; delete o.tip; if (b.tip) o.tipUrl = b.tipUrl; return o; }); return new Blob([JSON.stringify({ fpspaint: 1, brushes: arr }, null, 1)], { type: 'application/json' }); },
  tipFromImage(img, mode) { const max = 256, k = Math.min(1, max / Math.max(img.width, img.height)), w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k)); const c = mkCanvas(w, h), x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h); const id = x.getImageData(0, 0, w, h), d = id.data; let hasA = false; for (let i = 3; i < d.length; i += 4) if (d[i] < 250) { hasA = true; break; } for (let i = 0; i < d.length; i += 4) { const a = hasA && mode !== 'luma' ? d[i + 3] : 255 - FXU.lum(d[i], d[i + 1], d[i + 2]); d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = hasA && mode !== 'luma' ? a : a * d[i + 3] / 255; } x.putImageData(id, 0, 0); return c; },
  async importFiles(files) {
    let n = 0;
    for (const f of files) {
      const name = f.name.replace(/\.[^.]+$/, '');
      try {
        if (/\.abr$/i.test(f.name)) { const tips = ABR.parse(new Uint8Array(await f.arrayBuffer())); tips.forEach((t, i) => { this.add({ name: (t.name || name) + (tips.length > 1 && !t.name ? ' ' + (i + 1) : ''), tip: t.canvas, size: Math.min(200, Math.max(t.canvas.width, t.canvas.height)), spacing: clamp((t.spacing || 25) / 100, .02, 2), cat: 'Importados' }, true); n++; }); }
        else if (/\.(json|fpsbrush)$/i.test(f.name)) { const j = JSON.parse(await f.text()); for (const b of (j.brushes || [])) { delete b.id; await this.add(b, true); n++; } }
        else if (/^image\//.test(f.type) || /\.(png|jpe?g|webp|gif)$/i.test(f.name)) { const im = await fileToImage(f); const ib = await IBIS.read(im).catch(e => { console.warn(e); return null; }); const b = await UI.brushEditor(im, ib, name); if (b) { await this.add(b, true); n++; } }
        else UI.toast('Formato no compatible: ' + f.name);
      } catch (e) { console.error(e); UI.toast('No se pudo leer ' + f.name); }
    }
    await this.persist(); return n;
  },
};
async function urlToCanvas(u) { const im = new Image(); await new Promise(r => { im.onload = r; im.onerror = r; im.src = u; }); const c = mkCanvas(im.width || 1, im.height || 1); c.getContext('2d').drawImage(im, 0, 0); return c; }
async function fileToImage(f) { const url = URL.createObjectURL(f); const im = new Image(); await new Promise((r, j) => { im.onload = r; im.onerror = j; im.src = url; }); return im; }

/* pinceles compartidos de ibisPaint (imagen con código QR "IPBZ") */
const IBIS = {
  async read(im) {
    if (typeof jsQR !== 'function') return null;
    const k = Math.min(1, 1600 / Math.max(im.width, im.height)); const W = Math.round(im.width * k), H = Math.round(im.height * k);
    const c = mkCanvas(W, H), x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.drawImage(im, 0, 0, W, H);
    const id = x.getImageData(0, 0, W, H); const q = jsQR(id.data, W, H, { inversionAttempts: 'attemptBoth' }); if (!q || !q.binaryData) return null;
    const bytes = Uint8Array.from(q.binaryData); if (String.fromCharCode(...bytes.slice(0, 4)) !== 'IPBZ') return null;
    let raw = null; try { if (window.DecompressionStream) { const ds = new DecompressionStream('deflate-raw'); raw = new Uint8Array(await new Response(new Blob([bytes.slice(8)]).stream().pipeThrough(ds)).arrayBuffer()); } } catch (e) { console.warn('inflate', e); }
    const out = { size: 60, spacing: .1, flow: .6, name: '' };
    if (raw) {
      const dv = new DataView(raw.buffer); const f = o => o + 4 <= raw.length ? dv.getFloat32(o) : 0;
      const th = f(20); if (th > 1 && th < 5000) out.size = clamp(th, 2, 600);
      for (let o = 150; o < raw.length - 3; o++) { const L = dv.getUint16(o); if (L < 1 || L > 60 || o + 2 + L > raw.length) continue; const chunk = raw.slice(o + 2, o + 2 + L); if ([...chunk].some(b => b < 32 && b !== 9)) continue; try { const t = new TextDecoder('utf-8', { fatal: true }).decode(chunk); if (/\p{L}|\d/u.test(t)) { out.name = t; break; } } catch { } }
    }
    const L0 = q.location; const xs = [L0.topLeftCorner.x, L0.bottomLeftCorner.x, L0.topRightCorner.x, L0.bottomRightCorner.x], ys = [L0.topLeftCorner.y, L0.bottomLeftCorner.y, L0.topRightCorner.y, L0.bottomRightCorner.y];
    out.qr = { x0: Math.min(...xs) / k, y0: Math.min(...ys) / k, x1: Math.max(...xs) / k, y1: Math.max(...ys) / k };
    return out;
  },
};

/* detección de la forma del pincel dentro de una imagen */
const TIPX = {
  bgColor(d, w, h) { const m = new Map(); const add = (x, y) => { const i = (y * w + x) * 4; if (d[i + 3] < 30) return; const k = (d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | (d[i + 2] >> 3); m.set(k, (m.get(k) || 0) + 1); }; for (let x = 0; x < w; x += 2) { add(x, 0); add(x, h - 1); } for (let y = 0; y < h; y += 2) { add(0, y); add(w - 1, y); } if (!m.size) return null; const k = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]; return [((k >> 10) & 31) * 8 + 4, ((k >> 5) & 31) * 8 + 4, (k & 31) * 8 + 4]; },
  // devuelve un canvas con alfa: mode 'auto' (quita el color de fondo), 'white' (quita blanco), 'luma' (oscuro = tinta), 'alpha' (usa la transparencia)
  extract(src, rect, o) {
    const w = Math.max(1, Math.round(rect.w)), h = Math.max(1, Math.round(rect.h)); const c = mkCanvas(w, h), x = c.getContext('2d'); x.drawImage(src, rect.x, rect.y, rect.w, rect.h, 0, 0, w, h);
    const id = x.getImageData(0, 0, w, h), d = id.data; const bg = o.mode === 'auto' ? (o.bg || this.bgColor(d, w, h) || [255, 255, 255]) : [255, 255, 255]; const tol = o.tol, soft = 26;
    for (let i = 0; i < d.length; i += 4) {
      let a;
      if (o.mode === 'alpha') a = d[i + 3] / 255;
      else if (o.mode === 'luma') a = (255 - (.299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2])) / 255 * d[i + 3] / 255;
      else { const dist = Math.max(Math.abs(d[i] - bg[0]), Math.abs(d[i + 1] - bg[1]), Math.abs(d[i + 2] - bg[2])); a = clamp((dist - tol) / soft, 0, 1) * d[i + 3] / 255; }
      if (o.mask && o.mask(i / 4 % w + rect.x, Math.floor(i / 4 / w) + rect.y)) a = 0;
      d[i + 3] = Math.round(a * 255); if (!o.keepColor) { d[i] = d[i + 1] = d[i + 2] = 0; }
    }
    x.putImageData(id, 0, 0);
    // recortar al contenido
    let x0 = w, y0 = h, x1 = -1, y1 = -1; for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) if (d[(y * w + xx) * 4 + 3] > 16) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < x0) return null; const tw = x1 - x0 + 1, th = y1 - y0 + 1, k = Math.min(1, 512 / Math.max(tw, th)); const t = mkCanvas(Math.max(1, Math.round(tw * k)), Math.max(1, Math.round(th * k))); t.getContext('2d').drawImage(c, x0, y0, tw, th, 0, 0, t.width, t.height); return t;
  },
  // formas sueltas (componentes conectados) para elegir con un toque
  blobs(src, qr) {
    const W = src.width, H = src.height, k = Math.min(1, 260 / Math.max(W, H)), w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k)); const c = mkCanvas(w, h), x = c.getContext('2d'); x.drawImage(src, 0, 0, w, h); const d = x.getImageData(0, 0, w, h).data; const bg = this.bgColor(d, w, h) || [255, 255, 255];
    const m = new Uint8Array(w * h); const qw = qr ? qr.x1 - qr.x0 : 0;
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) { const i = py * w + px, j = i * 4; if (d[j + 3] < 30) continue; const dist = Math.max(Math.abs(d[j] - bg[0]), Math.abs(d[j + 1] - bg[1]), Math.abs(d[j + 2] - bg[2])); if (dist < 40) continue; if (qr) { const X = px / k, Y = py / k; if (X >= qr.x0 - qw * .4 && X <= qr.x1 + qw * .4 && Y >= qr.y0 - qw * .6 && Y <= qr.y1 + qw * .6) continue; } m[i] = 1; }
    const lab = new Int32Array(w * h), out = []; let id = 0;
    for (let i = 0; i < m.length; i++) { if (!m[i] || lab[i]) continue; id++; let x0 = w, y0 = h, x1 = 0, y1 = 0, n = 0; const st = [i]; lab[i] = id; while (st.length) { const q = st.pop(), qx = q % w, qy = (q / w) | 0; n++; if (qx < x0) x0 = qx; if (qx > x1) x1 = qx; if (qy < y0) y0 = qy; if (qy > y1) y1 = qy; for (const nb of [q - 1, q + 1, q - w, q + w]) { if (nb < 0 || nb >= m.length || lab[nb] || !m[nb]) continue; if ((nb === q - 1 && qx === 0) || (nb === q + 1 && qx === w - 1)) continue; lab[nb] = id; st.push(nb); } } if (n > w * h * .002) out.push({ x: Math.max(0, x0 / k - 3), y: Math.max(0, y0 / k - 3), w: Math.min(W, (x1 - x0 + 1) / k + 6), h: Math.min(H, (y1 - y0 + 1) / k + 6), n }); }
    return out.sort((a, b) => b.n - a.n).slice(0, 10);
  },
  // rectángulo automático: el contenido que no es fondo, fuera de la zona del QR
  autoRect(src, qr) {
    const W = src.width, H = src.height, k = Math.min(1, 500 / Math.max(W, H)), w = Math.round(W * k), h = Math.round(H * k); const c = mkCanvas(w, h), x = c.getContext('2d'); x.drawImage(src, 0, 0, w, h); const d = x.getImageData(0, 0, w, h).data; const bg = this.bgColor(d, w, h) || [255, 255, 255];
    const inQ = (px, py) => { if (!qr) return false; const qw = qr.x1 - qr.x0, X = px / k, Y = py / k; return X >= qr.x0 - qw * .35 && Y >= qr.y0 - qw * .5 && Y <= qr.y1 + qw * .5 || (X >= qr.x0 - qw * .35 && Y < qr.y0 && Y > qr.y0 - qw * .5); };
    let x0 = w, y0 = h, x1 = -1, y1 = -1; for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) { const i = (py * w + px) * 4; if (d[i + 3] < 30) continue; const dist = Math.max(Math.abs(d[i] - bg[0]), Math.abs(d[i + 1] - bg[1]), Math.abs(d[i + 2] - bg[2])); if (dist < 40 || inQ(px, py) || (px > w * .72 && py > h * .86)) continue; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
    if (x1 < x0) return { x: 0, y: 0, w: W, h: H, bg }; return { x: x0 / k, y: y0 / k, w: (x1 - x0 + 1) / k, h: (y1 - y0 + 1) / k, bg };
  },
};

/* lector de pinceles de Photoshop (.abr v1, v2, v6+) — solo pinceles de muestra (imagen) */
const ABR = {
  parse(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); let p = 0; const u16 = () => { const v = dv.getUint16(p); p += 2; return v; }, u32 = () => { const v = dv.getUint32(p); p += 4; return v; }, i32 = () => { const v = dv.getInt32(p); p += 4; return v; }, u8r = () => u8[p++];
    const ver = u16(), out = [];
    const readImg = (w, h, depth, comp) => {
      const bpp = depth === 16 ? 2 : 1, n = w * h, pix = new Uint8Array(n);
      if (!comp) { for (let i = 0; i < n; i++) { pix[i] = u8[p]; p += bpp; } }
      else { const rows = []; for (let y = 0; y < h; y++) rows.push(u16()); let o = 0; for (let y = 0; y < h; y++) { const end = p + rows[y]; let x = 0; while (p < end && x < w * bpp) { let c = u8[p++]; if (c > 127) c -= 256; if (c >= 0) { for (let k = 0; k <= c; k++) { const v = u8[p++]; if (bpp === 1 || x % 2 === 0) { if (o < n) pix[o++] = v; } x++; } } else if (c > -128) { const v = u8[p++]; for (let k = 0; k < 1 - c; k++) { if (bpp === 1 || x % 2 === 0) { if (o < n) pix[o++] = v; } x++; } } } p = end; } }
      return pix;
    };
    const toCanvas = (pix, w, h) => { const k = Math.min(1, 256 / Math.max(w, h)); const c = mkCanvas(w, h), x = c.getContext('2d'), id = x.createImageData(w, h); for (let i = 0; i < pix.length; i++) id.data[i * 4 + 3] = pix[i]; x.putImageData(id, 0, 0); if (k < 1) { const c2 = mkCanvas(Math.round(w * k), Math.round(h * k)); c2.getContext('2d').drawImage(c, 0, 0, c2.width, c2.height); return c2; } return c; };
    if (ver === 1 || ver === 2) {
      const count = u16();
      for (let b = 0; b < count && p < u8.length; b++) {
        const type = u16(), size = u32(), next = p + size;
        if (type === 2) { u32(); const spacing = u16(); let name = ''; if (ver === 2) { const len = u32(); for (let i = 0; i < len; i++) { const c = u16(); if (c) name += String.fromCharCode(c); } } u8r(); p += 8; const top = i32(), left = i32(), bottom = i32(), right = i32(), depth = u16(), comp = u8r(); const w = right - left, h = bottom - top; if (w > 0 && h > 0 && w < 6000 && h < 6000) out.push({ canvas: toCanvas(readImg(w, h, depth, comp), w, h), spacing, name }); }
        p = next;
      }
    } else if (ver >= 6) {
      const sub = u16(); // buscar sección 8BIMsamp
      let found = -1; for (let i = p; i < u8.length - 8; i++) if (u8[i] === 56 && u8[i + 1] === 66 && u8[i + 2] === 73 && u8[i + 3] === 77 && u8[i + 4] === 115 && u8[i + 5] === 97 && u8[i + 6] === 109 && u8[i + 7] === 112) { found = i; break; }
      if (found < 0) throw new Error('sin pinceles de muestra');
      p = found + 8; const secLen = u32(), secEnd = p + secLen;
      while (p < secEnd - 4) {
        const bsize = u32(); let bend = bsize; while (bend % 4) bend++; const next = p + bend;
        p += sub === 1 ? 47 : 301; const top = i32(), left = i32(), bottom = i32(), right = i32(), depth = u16(), comp = u8r(); const w = right - left, h = bottom - top;
        if (w > 0 && h > 0 && w < 8000 && h < 8000) { try { out.push({ canvas: toCanvas(readImg(w, h, depth, comp), w, h) }); } catch { } }
        p = next;
      }
    } else throw new Error('versión ABR no compatible: ' + ver);
    if (!out.length) throw new Error('el archivo no tiene pinceles de imagen');
    return out;
  },
};

/* ---------- paletas ---------- */
const PAL = {
  def: () => [{ name: 'Básica', colors: ['#000000', '#ffffff', '#ff1f1f', '#ff5a00', '#ffa500', '#ffe600', '#a6ff00', '#43ff00', '#00ff4c', '#00ffae', '#00e5ff', '#00a6ff', '#0050ff', '#2a00ff', '#7a00ff', '#c800ff', '#ff00cc', '#ff006a', '#fff4e3', '#fde7c3', '#f8d5a8', '#f2bd8b', '#c58c64', '#8a5a3c', '#5a3826', '#3a3a3f', '#6b6e75', '#a3a7ae'] }, { name: 'Piel', colors: ['#ffe7d6', '#fdd8bf', '#f5c3a1', '#e8a57e', '#d08b63', '#b06f4b', '#8c5236', '#653824', '#ffd1dc', '#f7a8b8'] }, { name: 'Pixel retro', colors: ['#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179', '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57'] }],
  list: null, cur: 0,
  async load() { this.list = await DB.get('kv', 'palettes') || this.def(); this.cur = store.get('palCur', 0) % this.list.length; },
  save() { DB.put('kv', 'palettes', this.list); store.set('palCur', this.cur); },
};

/* ---------- quitar fondo ---------- */
const BGX = {
  enter() {
    if (S.bgx) return; if (S.fx) FX.cancel(); if (S.textObj) TXT.commit(); const l = AL(); if (!canEdit()) return;
    S.bgx = { mode: 'manual', size: 40, hard: .85, offset: 90, tol: 30, bgi: 0, orig: cloneCanvas(l.canvas), undoStart: S.undo.length, cursor: null };
    UI.openBgx();
  },
  done() { const b = S.bgx; if (!b) return; const l = AL(); const changedAny = S.undo.length > b.undoStart; S.undo.length = b.undoStart; S.redo.length = 0; if (changedAny) pushUndo(pxEntry(l, 0, 0, doc.w, doc.h, b.orig)); S.bgx = null; UI.closeBgx(); changed(); },
  cancel() { const b = S.bgx; if (!b) return; const l = AL(); l.ctx.clearRect(0, 0, doc.w, doc.h); l.ctx.drawImage(b.orig, 0, 0); l.ver++; S.undo.length = b.undoStart; S.redo.length = 0; S.bgx = null; UI.closeBgx(); changed(); },
  eraseMask(mask, soft = 1) {
    const l = AL(), e = capPx(l); const w = doc.w, h = doc.h; let mi = new ImageData(w, h); for (let i = 0; i < mask.length; i++) mi.data[i * 4 + 3] = mask[i] ? 255 : 0;
    if (soft) mi = FXU.blur(mi, soft); const id = l.ctx.getImageData(0, 0, w, h), d = id.data, m = mi.data; for (let i = 3; i < d.length; i += 4) { const k = m[i] / 255; d[i] = d[i] * (1 - k); }
    l.ctx.putImageData(id, 0, 0); l.ver++; pushUndo(e); changed();
  },
  tap(p) {
    const b = S.bgx, x = Math.floor(p.x), y = Math.floor(p.y); if (x < 0 || y < 0 || x >= doc.w || y >= doc.h) return;
    const data = AL().ctx.getImageData(0, 0, doc.w, doc.h).data;
    if (b.mode === 'magic') this.eraseMask(floodMask(data, doc.w, doc.h, x, y, b.tol));
    else if (b.mode === 'color') { const i0 = (y * doc.w + x) * 4, r0 = data[i0], g0 = data[i0 + 1], b0 = data[i0 + 2]; const m = new Uint8Array(doc.w * doc.h); for (let i = 0, j = 0; j < m.length; i += 4, j++) if (data[i + 3] && Math.max(Math.abs(data[i] - r0), Math.abs(data[i + 1] - g0), Math.abs(data[i + 2] - b0)) <= b.tol) m[j] = 1; this.eraseMask(m); }
  },
  auto() {
    const w = doc.w, h = doc.h, data = AL().ctx.getImageData(0, 0, w, h).data; const counts = new Map(); const border = [];
    for (let x = 0; x < w; x += 2) border.push([x, 0], [x, h - 1]); for (let y = 0; y < h; y += 2) border.push([0, y], [w - 1, y]);
    for (const [x, y] of border) { const i = (y * w + x) * 4; if (data[i + 3] < 20) continue; const k = (data[i] >> 4) << 8 | (data[i + 1] >> 4) << 4 | (data[i + 2] >> 4); counts.set(k, (counts.get(k) || 0) + 1); }
    if (!counts.size) { UI.toast('El borde ya es transparente'); return; }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]; const total = new Uint8Array(w * h);
    for (const [x, y] of border) { const j = y * w + x, i = j * 4; if (total[j] || data[i + 3] < 20) continue; const k = (data[i] >> 4) << 8 | (data[i + 1] >> 4) << 4 | (data[i + 2] >> 4); if (Math.abs((k >> 8) - (best >> 8)) > 2 || Math.abs(((k >> 4) & 15) - ((best >> 4) & 15)) > 2 || Math.abs((k & 15) - (best & 15)) > 2) continue; const m = floodMask(data, w, h, x, y, S.bgx.tol); for (let q = 0; q < m.length; q++) if (m[q]) total[q] = 1; }
    this.eraseMask(total, 1.5); UI.toast('Fondo detectado y borrado. Usa Reparar si se borró de más');
  },
};
