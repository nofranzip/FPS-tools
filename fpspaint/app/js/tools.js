'use strict';
/* Selección, reglas, marcos de manga y texto */

/* ---------- selección ---------- */
const SEL = {
  set(mask, path) { S.sel = { mask, path: path || null, ver: (S.sel ? S.sel.ver : 0) + 1 }; requestRender(); UI.onSel && UI.onSel(); },
  none() { S.sel = null; ANTS.stop(); requestRender(); UI.onSel && UI.onSel(); },
  fromPts(o) {
    if (o.pts.length < 3 || (o.mode === 'rect' && Math.abs(o.pts[2].x - o.a.x) < 2 && Math.abs(o.pts[2].y - o.a.y) < 2)) { this.none(); return; }
    const path = new Path2D(); o.pts.forEach((p, i) => i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)); path.closePath();
    const m = (o.add && S.sel) ? S.sel.mask : mkCanvas(doc.w, doc.h), x = m.getContext('2d'); x.fillStyle = '#fff'; x.fill(path);
    let p2 = path; if (o.add && S.sel && S.sel.path) { p2 = new Path2D(S.sel.path); p2.addPath(path); } else if (o.add && S.sel) p2 = null;
    this.set(m, p2);
  },
  wand(p, add) {
    const x = Math.floor(p.x), y = Math.floor(p.y); if (x < 0 || y < 0 || x >= doc.w || y >= doc.h) return;
    const mask = floodMask(refData(S.fillAll), doc.w, doc.h, x, y, S.fillTol); const c = maskToCanvas(mask, [255, 255, 255]);
    if (add && S.sel) { S.sel.mask.getContext('2d').drawImage(c, 0, 0); this.set(S.sel.mask, null); } else this.set(c, null);
  },
  all() { const m = mkCanvas(doc.w, doc.h), x = m.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, doc.w, doc.h); const p = new Path2D(); p.rect(0, 0, doc.w, doc.h); this.set(m, p); },
  invert() { if (!S.sel) return this.all(); const m = mkCanvas(doc.w, doc.h), x = m.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, doc.w, doc.h); x.globalCompositeOperation = 'destination-out'; x.drawImage(S.sel.mask, 0, 0); this.set(m, null); },
  fromAlpha(l = AL()) { const m = mkCanvas(doc.w, doc.h), x = m.getContext('2d'); x.drawImage(l.canvas, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, doc.w, doc.h); this.set(m, null); },
  grow(n) { if (!S.sel) return; const m = mkCanvas(doc.w, doc.h), x = m.getContext('2d'); if (n > 0) { for (let a = 0; a < 16; a++) { const t = a / 16 * Math.PI * 2; x.drawImage(S.sel.mask, Math.cos(t) * n, Math.sin(t) * n); } } else { x.fillStyle = '#fff'; x.fillRect(0, 0, doc.w, doc.h); x.globalCompositeOperation = 'destination-out'; const inv = mkCanvas(doc.w, doc.h), ix = inv.getContext('2d'); ix.fillStyle = '#fff'; ix.fillRect(0, 0, doc.w, doc.h); ix.globalCompositeOperation = 'destination-out'; ix.drawImage(S.sel.mask, 0, 0); for (let a = 0; a < 16; a++) { const t = a / 16 * Math.PI * 2; x.drawImage(inv, Math.cos(t) * -n, Math.sin(t) * -n); } } this.set(m, null); },
  clearContent() { const l = AL(); if (!S.sel || !canEdit()) return; const e = capPx(l); l.ctx.globalCompositeOperation = 'destination-out'; l.ctx.drawImage(S.sel.mask, 0, 0); l.ctx.globalCompositeOperation = 'source-over'; pushUndo(e); changed(); },
  fillContent() { const l = AL(); if (!S.sel || !canEdit()) return; const e = capPx(l); const c = mkCanvas(doc.w, doc.h), x = c.getContext('2d'); x.drawImage(S.sel.mask, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = colStr(); x.fillRect(0, 0, doc.w, doc.h); l.ctx.globalCompositeOperation = l.alphaLock ? 'source-atop' : 'source-over'; l.ctx.drawImage(c, 0, 0); l.ctx.globalCompositeOperation = 'source-over'; pushUndo(e); changed(); },
  copy(cut) { const l = AL(); const c = cloneCanvas(l.canvas); if (S.sel) { const x = c.getContext('2d'); x.globalCompositeOperation = 'destination-in'; x.drawImage(S.sel.mask, 0, 0); } S.clip = c; if (cut) { if (S.sel) this.clearContent(); else if (canEdit()) { const e = capPx(l); l.ctx.clearRect(0, 0, doc.w, doc.h); pushUndo(e); changed(); } } UI.toast(cut ? 'Cortado' : 'Copiado'); },
  paste() { if (!S.clip) { UI.toast('No hay nada copiado'); return; } structOp(() => { const n = newLayer('Pegado'); n.ctx.drawImage(S.clip, 0, 0); FR().layers.splice(FR().active + 1, 0, n); FR().active++; }); UI.setTool('move'); UI.toast('Pegado en una capa nueva: muévelo'); },
};

/* ---------- reglas ---------- */
const RULER = {
  ensure() { const r = S.ruler; if (!r.a) { r.a = { x: doc.w * .25, y: doc.h * .5 }; r.b = { x: doc.w * .75, y: doc.h * .5 }; } if (!r.c) r.c = { x: doc.w / 2, y: doc.h / 2 }; },
  handles() { this.ensure(); const r = S.ruler; return r.mode === 'line' ? [['a', r.a], ['b', r.b]] : [['c', r.c]]; },
  hit(s) { for (const [k, p] of this.handles()) { const q = toScr(p.x, p.y); if (Math.hypot(q.x - s.sx, q.y - s.sy) < 24) { this.drag_k = k; return true; } } return false; },
  drag(p) { S.ruler[this.drag_k] = { x: p.x, y: p.y }; requestRender(); },
  project(p, st) {
    const r = S.ruler; this.ensure();
    if (r.mode === 'line') { const dx = r.b.x - r.a.x, dy = r.b.y - r.a.y, L2 = dx * dx + dy * dy || 1; const t = ((p.x - st.x) * dx + (p.y - st.y) * dy) / L2; return { x: st.x + dx * t, y: st.y + dy * t }; }
    if (r.mode === 'circle') { const R = Math.hypot(st.x - r.c.x, st.y - r.c.y) || 1, a = Math.atan2(p.y - r.c.y, p.x - r.c.x); return { x: r.c.x + Math.cos(a) * R, y: r.c.y + Math.sin(a) * R }; }
    if (r.mode === 'radial') { const dx = st.x - r.c.x, dy = st.y - r.c.y, L2 = dx * dx + dy * dy; if (L2 < 1) return p; const t = ((p.x - r.c.x) * dx + (p.y - r.c.y) * dy) / L2; return { x: r.c.x + dx * t, y: r.c.y + dy * t }; }
    return p;
  },
  draw(c) {
    this.ensure(); const r = S.ruler; c.save(); c.strokeStyle = 'rgba(88,211,176,.9)'; c.lineWidth = 1.5;
    if (r.mode === 'line') { const a = toScr(r.a.x, r.a.y), b = toScr(r.b.x, r.b.y), dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, F = 4000; c.setLineDash([10, 6]); c.beginPath(); c.moveTo(a.x - ux * F, a.y - uy * F); c.lineTo(b.x + ux * F, b.y + uy * F); c.stroke(); }
    else { const cc = toScr(r.c.x, r.c.y); c.setLineDash([4, 6]); c.beginPath(); if (r.mode === 'circle') { for (const R of [40, 90, 160]) { c.moveTo(cc.x + R, cc.y); c.arc(cc.x, cc.y, R, 0, 7); } } else { for (let k = 0; k < 24; k++) { const t = k * Math.PI / 12; c.moveTo(cc.x, cc.y); c.lineTo(cc.x + Math.cos(t) * 3000, cc.y + Math.sin(t) * 3000); } } c.globalAlpha = .55; c.stroke(); c.globalAlpha = 1; }
    c.setLineDash([]); for (const [, p] of this.handles()) { const q = toScr(p.x, p.y); c.fillStyle = '#58d3b0'; c.strokeStyle = '#0d1a16'; c.lineWidth = 2; c.beginPath(); c.arc(q.x, q.y, 11, 0, 7); c.fill(); c.stroke(); }
    c.restore();
  },
};

/* ---------- marcos de manga ---------- */
const FRAMES = {
  render(l) {
    const f = l.frames, x = l.ctx; x.clearRect(0, 0, doc.w, doc.h);
    if (f.fillOut) { x.fillStyle = '#fff'; x.fillRect(0, 0, doc.w, doc.h); x.globalCompositeOperation = 'destination-out'; for (const p of f.panels) { x.beginPath(); p.forEach((q, i) => i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1])); x.closePath(); x.fill(); } x.globalCompositeOperation = 'source-over'; }
    x.strokeStyle = f.color; x.lineWidth = f.width; x.lineJoin = 'miter';
    for (const p of f.panels) { x.beginPath(); p.forEach((q, i) => i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1])); x.closePath(); x.stroke(); }
    l.ver++;
  },
  add(o) {
    structOp(() => { const l = newLayer('Marcos'); const mx = o.mx, my = o.my; l.frames = { panels: [[[mx, my], [doc.w - mx, my], [doc.w - mx, doc.h - my], [mx, doc.h - my]]], gapH: o.gapH, gapV: o.gapV, width: o.width, color: o.color, fillOut: o.fillOut }; this.render(l); FR().layers.push(l); FR().active = FR().layers.length - 1; });
    UI.setFrameTool(true);
  },
  clipPoly(poly, nx, ny, c) { const out = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; const da = a[0] * nx + a[1] * ny - c, db = b[0] * nx + b[1] * ny - c; if (da >= 0) out.push(a); if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } } return out; },
  inside(poly, p) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if (((a[1] > p.y) !== (b[1] > p.y)) && (p.x < (b[0] - a[0]) * (p.y - a[1]) / (b[1] - a[1]) + a[0])) c = !c; } return c; },
  layer() { const l = AL(); if (l.frames) return l; return L().find(x => x.frames); },
  cut(a, b, tap) {
    const l = this.layer(); if (!l) { UI.toast('Primero añade un marco'); return; }
    const f = l.frames;
    if (tap) { const p = f.panels.find(pp => this.inside(pp, a)); if (!p) return; const path = new Path2D(); p.forEach((q, i) => i ? path.lineTo(q[0], q[1]) : path.moveTo(q[0], q[1])); path.closePath(); const m = mkCanvas(doc.w, doc.h), x = m.getContext('2d'); x.fillStyle = '#fff'; x.fill(path); SEL.set(m, path); UI.toast('Viñeta seleccionada: pinta en otra capa'); return; }
    const dx = b.x - a.x, dy = b.y - a.y, L0 = Math.hypot(dx, dy); if (L0 < 3) return; let nx = -dy / L0, ny = dx / L0; const c = a.x * nx + a.y * ny;
    const gap = (Math.abs(dx) > Math.abs(dy) ? f.gapV : f.gapH) / 2;
    const before = JSON.stringify(f), e = capPx(l); let any = false; const res = [];
    for (const p of f.panels) {
      const ds = p.map(q => q[0] * nx + q[1] * ny - c); if (!(Math.min(...ds) < 0 && Math.max(...ds) > 0)) { res.push(p); continue; }
      const segIntersects = (() => { for (let i = 0; i < p.length; i++) { const q1 = p[i], q2 = p[(i + 1) % p.length]; const d1 = q1[0] * nx + q1[1] * ny - c, d2 = q2[0] * nx + q2[1] * ny - c; if ((d1 >= 0) !== (d2 >= 0)) { const t = d1 / (d1 - d2), ix = q1[0] + (q2[0] - q1[0]) * t, iy = q1[1] + (q2[1] - q1[1]) * t; const u = ((ix - a.x) * dx + (iy - a.y) * dy) / (L0 * L0); if (u > -0.05 && u < 1.05) return true; } } return false; })();
      if (!segIntersects) { res.push(p); continue; }
      const p1 = this.clipPoly(p, nx, ny, c + gap), p2 = this.clipPoly(p, -nx, -ny, -c + gap); if (p1.length > 2) res.push(p1); if (p2.length > 2) res.push(p2); any = true;
    }
    if (!any) { UI.toast('Arrastra la línea de lado a lado de una viñeta'); return; }
    f.panels = res; this.render(l); e.metaBefore = before; e.metaAfter = JSON.stringify(f); pushUndo(e); changed();
  },
  rasterize(l) { if (!l.frames) return; structOp(() => { l.frames = null; l.name = l.name + ' (raster)'; }); },
};

/* ---------- texto ---------- */
const FONTS = [
  ['system-ui', 'Sistema', 'Básica'], ['Roboto', 'Roboto', 'Básica'], ['Montserrat', 'Montserrat', 'Básica'], ['Oswald', 'Oswald', 'Básica'], ['Anton', 'Anton', 'Títulos'], ['Bebas Neue', 'Bebas Neue', 'Títulos'], ['Black Ops One', 'Black Ops One', 'Títulos'], ['Russo One', 'Russo One', 'Títulos'],
  ['Bangers', 'Bangers', 'Cómic'], ['Luckiest Guy', 'Luckiest Guy', 'Cómic'], ['Comic Neue', 'Comic Neue', 'Cómic'], ['Permanent Marker', 'Permanent Marker', 'Cómic'], ['Rubik Mono One', 'Rubik Mono One', 'Cómic'], ['Creepster', 'Creepster', 'Cómic'],
  ['Press Start 2P', 'Press Start 2P', 'Pixel'], ['Silkscreen', 'Silkscreen', 'Pixel'], ['VT323', 'VT323', 'Pixel'], ['Pixelify Sans', 'Pixelify Sans', 'Pixel'], ['Jersey 10', 'Jersey 10', 'Pixel'],
  ['Pacifico', 'Pacifico', 'Manuscrita'], ['Dancing Script', 'Dancing Script', 'Manuscrita'], ['Lobster', 'Lobster', 'Manuscrita'], ['Caveat', 'Caveat', 'Manuscrita'], ['Kalam', 'Kalam', 'Manuscrita'],
  ['Noto Sans JP', 'Noto Sans JP (日本語)', 'Básica'], ['serif', 'Serif', 'Básica'], ['monospace', 'Monoespaciada', 'Básica']];
let fontsLoaded = false;
function loadWebFonts() {
  if (fontsLoaded) return; fontsLoaded = true;
  const fams = FONTS.filter(f => !['system-ui', 'serif', 'monospace'].includes(f[0])).map(f => 'family=' + f[0].replace(/ /g, '+') + (f[0] === 'Noto Sans JP' || f[0] === 'Roboto' || f[0] === 'Montserrat' ? ':wght@400;700' : '')).join('&');
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?' + fams + '&display=swap'; document.head.appendChild(l);
  l.onload = () => { document.fonts && document.fonts.ready.then(() => { UI.onFonts && UI.onFonts(); if (S.textObj) TXT.invalidate(); }); };
}
const TXT = {
  defaults() { const d = store.get('textDef', null); return Object.assign({ text: '', font: 'Bangers', size: 64, color: hex(...S.color), bold: false, italic: false, align: 'center', vertical: false, ls: 0, lh: 1.15, stroke: { on: false, w: 6, color: '#ffffff' }, bg: { on: false, color: '#ffffff', px: 12, py: 8 }, toNewLayer: true }, d || {}, { color: hex(...S.color), text: '' }); },
  create(p) { loadWebFonts(); S.textObj = Object.assign(this.defaults(), { x: p.x, y: p.y, rot: 0 }); this.invalidate(); UI.openTextSheet(); },
  invalidate() { if (S.textObj) S.textObj._c = null; requestRender(); },
  fontStr(o, size) { return `${o.italic ? 'italic ' : ''}${o.bold ? '700 ' : ''}${size}px "${o.font}"${['system-ui', 'serif', 'monospace'].includes(o.font) ? '' : ', system-ui'}`.replace('"system-ui"', 'system-ui').replace('"serif"', 'serif').replace('"monospace"', 'monospace'); },
  layout(o) {
    const c = mkCanvas(4, 4), x = c.getContext('2d'); x.font = this.fontStr(o, o.size);
    const lines = (o.text || ' ').split('\n'), ls = o.ls * o.size, lh = o.lh * o.size;
    const measure = s => { let w = 0; for (const ch of s) w += x.measureText(ch).width + ls; return Math.max(0, w - ls); };
    if (!o.vertical) { const widths = lines.map(measure), W = Math.max(...widths, 1), H = lh * lines.length; return { lines, widths, W, H, lh, ls }; }
    const colW = lh, W = colW * lines.length, H = Math.max(...lines.map(l => [...l].length), 1) * (o.size + ls); return { lines, W, H, lh, ls, colW };
  },
  build(o) {
    if (o._c) return o._c; const lay = this.layout(o), sw = o.stroke.on ? o.stroke.w : 0, bx = o.bg.on ? o.bg.px : 0, by = o.bg.on ? o.bg.py : 0;
    const pad = Math.ceil(sw + 4), W = Math.ceil(lay.W + bx * 2 + pad * 2), H = Math.ceil(lay.H + by * 2 + pad * 2);
    const c = mkCanvas(W, H), x = c.getContext('2d'); x.font = this.fontStr(o, o.size); x.textBaseline = 'middle'; x.lineJoin = 'round';
    if (o.bg.on) { x.fillStyle = o.bg.color; x.fillRect(pad, pad, W - pad * 2, H - pad * 2); }
    const drawChars = (pass) => {
      if (!o.vertical) lay.lines.forEach((ln, i) => { let cx = pad + bx + (o.align === 'left' ? 0 : o.align === 'right' ? lay.W - lay.widths[i] : (lay.W - lay.widths[i]) / 2); const cy = pad + by + lay.lh * (i + .5); for (const ch of ln) { const w = x.measureText(ch).width; if (pass === 's') x.strokeText(ch, cx, cy); else x.fillText(ch, cx, cy); cx += w + lay.ls; } });
      else lay.lines.forEach((ln, i) => { const cx = pad + bx + lay.W - lay.colW * (i + .5); let cy = pad + by + o.size / 2; x.textAlign = 'center'; for (const ch of ln) { if (pass === 's') x.strokeText(ch, cx, cy); else x.fillText(ch, cx, cy); cy += o.size + lay.ls; } x.textAlign = 'start'; });
    };
    if (o.stroke.on && sw > 0) { x.strokeStyle = o.stroke.color; x.lineWidth = sw * 2; drawChars('s'); }
    x.fillStyle = o.color; drawChars('f');
    o._c = c; return c;
  },
  geom(o) { const c = this.build(o); return { c, w: c.width, h: c.height }; },
  drawObj(ctx) { const o = S.textObj; if (!o) return; const g = this.geom(o); ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.rot); ctx.drawImage(g.c, -g.w / 2, -g.h / 2); ctx.restore(); this.drawUi = true; },
  corners(o) { const g = this.geom(o), cs = Math.cos(o.rot), sn = Math.sin(o.rot); const pt = (dx, dy) => toScr(o.x + dx * cs - dy * sn, o.y + dx * sn + dy * cs); return { tl: pt(-g.w / 2, -g.h / 2), tr: pt(g.w / 2, -g.h / 2), br: pt(g.w / 2, g.h / 2), bl: pt(-g.w / 2, g.h / 2), rot: pt(0, -g.h / 2 - 34 / V.s), g }; },
  overlay(c) {
    const o = S.textObj; if (!o) return; const k = this.corners(o); c.save(); c.setLineDash([6, 4]); c.lineWidth = 1.5; c.strokeStyle = '#58d3b0'; c.beginPath(); c.moveTo(k.tl.x, k.tl.y); c.lineTo(k.tr.x, k.tr.y); c.lineTo(k.br.x, k.br.y); c.lineTo(k.bl.x, k.bl.y); c.closePath(); c.stroke(); c.setLineDash([]);
    const top = { x: (k.tl.x + k.tr.x) / 2, y: (k.tl.y + k.tr.y) / 2 }; c.beginPath(); c.moveTo(top.x, top.y); c.lineTo(k.rot.x, k.rot.y); c.stroke();
    const dot = (p, label) => { c.fillStyle = '#1d1f22'; c.beginPath(); c.arc(p.x, p.y, 14, 0, 7); c.fill(); c.strokeStyle = '#58d3b0'; c.lineWidth = 2; c.stroke(); c.fillStyle = '#58d3b0'; c.font = '600 13px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, p.x, p.y + .5); };
    dot(k.rot, '↻'); dot(k.br, '⤡'); c.restore();
  },
  down(p, s) { const o = S.textObj, k = this.corners(o); this.mode = null; this.st = { p, x: o.x, y: o.y, rot: o.rot, size: o.size, s };
    if (Math.hypot(s.sx - k.rot.x, s.sy - k.rot.y) < 22) this.mode = 'rot'; else if (Math.hypot(s.sx - k.br.x, s.sy - k.br.y) < 22) this.mode = 'scale';
    else { const cs = Math.cos(-o.rot), sn = Math.sin(-o.rot), dx = p.x - o.x, dy = p.y - o.y, lx = dx * cs - dy * sn, ly = dx * sn + dy * cs; if (Math.abs(lx) <= k.g.w / 2 + 10 / V.s && Math.abs(ly) <= k.g.h / 2 + 10 / V.s) this.mode = 'move'; }
    return !!this.mode; },
  move(p, s) { const o = S.textObj, st = this.st; if (!o) return;
    if (this.mode === 'move') { o.x = st.x + p.x - st.p.x; o.y = st.y + p.y - st.p.y; }
    else if (this.mode === 'rot') { const a0 = Math.atan2(st.p.y - st.y, st.p.x - st.x), a1 = Math.atan2(p.y - st.y, p.x - st.x); o.rot = st.rot + a1 - a0; if (Math.abs(((o.rot % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2)) < .05) o.rot = Math.round(o.rot / (Math.PI / 2)) * Math.PI / 2; }
    else if (this.mode === 'scale') { const d0 = Math.hypot(st.p.x - st.x, st.p.y - st.y) || 1, d1 = Math.hypot(p.x - st.x, p.y - st.y); o.size = clamp(Math.round(st.size * d1 / d0), 4, 2000); o._c = null; UI.refreshTextSheet && UI.refreshTextSheet(); }
    requestRender(); },
  up() { },
  commit() {
    const o = S.textObj; if (!o) return; S.textObj = null; UI.closeTextSheet && UI.closeTextSheet();
    if (!o.text.trim()) { requestRender(); return; }
    const sv = { ...o }; delete sv._c; delete sv.text; delete sv.x; delete sv.y; delete sv.rot; store.set('textDef', sv);
    const g = this.geom(o), draw = l => { l.ctx.save(); l.ctx.translate(o.x, o.y); l.ctx.rotate(o.rot); l.ctx.drawImage(g.c, -g.w / 2, -g.h / 2); l.ctx.restore(); l.ver++; };
    if (o.toNewLayer || AL().frames || AL().locked) { structOp(() => { const l = newLayer('Texto: ' + o.text.split('\n')[0].slice(0, 16)); draw(l); FR().layers.splice(FR().active + 1, 0, l); FR().active++; }); }
    else { const l = AL(), e = capPx(l); draw(l); pushUndo(e); changed(); }
  },
  cancel() { S.textObj = null; UI.closeTextSheet && UI.closeTextSheet(); requestRender(); },
};

/* ---------- imagen flotante: mover, escalar y rotar antes de fijarla en una capa ---------- */
const IMGF = {
  start(img, name) {
    if (S.textObj) TXT.commit(); const k = Math.min(1, doc.w * .8 / img.width, doc.h * .8 / img.height);
    S.imgObj = { img, name, x: doc.w / 2, y: doc.h / 2, sc: k, rot: 0, fx: 1, ax: 1, ay: 1, op: 1 }; requestRender(); UI.openImgSheet();
  },
  // transformar la capa actual (o la selección): mover, cambiar tamaño, estirar y rotar
  startLayer() {
    if (S.imgObj) return; if (S.textObj) TXT.commit(); const l = AL(); if (!l || !canEdit()) return false;
    const W = doc.w, H = doc.h; let src = l.canvas;
    if (S.sel) { src = mkCanvas(W, H); const x = src.getContext('2d'); x.drawImage(l.canvas, 0, 0); x.globalCompositeOperation = 'destination-in'; x.drawImage(S.sel.mask, 0, 0); }
    const d = src.getContext('2d').getImageData(0, 0, W, H).data; let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) { const r = y * W * 4; for (let x = 0; x < W; x++) if (d[r + x * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; } }
    if (x1 < 0) { UI.toast(S.sel ? 'No hay nada dibujado en la selección' : 'La capa está vacía'); return false; }
    const w = x1 - x0 + 1, h = y1 - y0 + 1, img = mkCanvas(w, h); img.getContext('2d').drawImage(src, x0, y0, w, h, 0, 0, w, h);
    const backup = cloneCanvas(l.canvas), c = l.ctx;
    if (S.sel) { c.save(); c.globalCompositeOperation = 'destination-out'; c.drawImage(S.sel.mask, 0, 0); c.restore(); SEL.none(); } else c.clearRect(x0, y0, w, h);
    l.ver++; S.imgObj = { img, name: l.name, x: x0 + w / 2, y: y0 + h / 2, sc: 1, rot: 0, fx: 1, ax: 1, ay: 1, op: 1, layer: l, backup, _x0: x0 + w / 2, _y0: y0 + h / 2 };
    requestRender(); UI.openImgSheet(); return true;
  },
  corners() { const o = S.imgObj, w = o.img.width * o.sc * (o.ax || 1), h = o.img.height * o.sc * (o.ay || 1), cs = Math.cos(o.rot), sn = Math.sin(o.rot); const pt = (dx, dy) => toScr(o.x + dx * cs - dy * sn, o.y + dx * sn + dy * cs); return { tl: pt(-w / 2, -h / 2), tr: pt(w / 2, -h / 2), br: pt(w / 2, h / 2), bl: pt(-w / 2, h / 2), rot: pt(0, -h / 2 - 40 / V.s), mr: pt(w / 2, 0), mb: pt(0, h / 2), w, h }; },
  draw(c) { const o = S.imgObj; c.save(); c.globalAlpha = o.op; c.translate(o.x, o.y); c.rotate(o.rot); c.scale(o.sc * o.fx * (o.ax || 1), o.sc * (o.ay || 1)); c.imageSmoothingEnabled = !doc.pixel; c.drawImage(o.img, -o.img.width / 2, -o.img.height / 2); c.restore(); },
  overlay(c) { const k = this.corners(); c.save(); c.setLineDash([6, 4]); c.lineWidth = 1.5; c.strokeStyle = '#58d3b0'; c.beginPath(); c.moveTo(k.tl.x, k.tl.y); c.lineTo(k.tr.x, k.tr.y); c.lineTo(k.br.x, k.br.y); c.lineTo(k.bl.x, k.bl.y); c.closePath(); c.stroke(); c.setLineDash([]);
    const top = { x: (k.tl.x + k.tr.x) / 2, y: (k.tl.y + k.tr.y) / 2 }; c.beginPath(); c.moveTo(top.x, top.y); c.lineTo(k.rot.x, k.rot.y); c.stroke();
    const dot = (p, t) => { c.fillStyle = '#1d1f22'; c.beginPath(); c.arc(p.x, p.y, 16, 0, 7); c.fill(); c.strokeStyle = '#58d3b0'; c.lineWidth = 2; c.stroke(); c.fillStyle = '#58d3b0'; c.font = '600 14px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, p.x, p.y + .5); };
    dot(k.rot, '↻'); dot(k.br, '⤡'); dot(k.tl, '⤡'); dot(k.tr, '⤢'); dot(k.bl, '⤢'); dot(k.mr, '↔'); dot(k.mb, '↕'); c.restore(); },
  down(p, s) { const o = S.imgObj, k = this.corners(); this.st = { p, x: o.x, y: o.y, rot: o.rot, sc: o.sc }; this.mode = 'move';
    if (Math.hypot(s.sx - k.rot.x, s.sy - k.rot.y) < 26) this.mode = 'rot'; else if (Math.hypot(s.sx - k.mr.x, s.sy - k.mr.y) < 24) this.mode = 'sx'; else if (Math.hypot(s.sx - k.mb.x, s.sy - k.mb.y) < 24) this.mode = 'sy'; else if (['tl', 'tr', 'br', 'bl'].some(n => Math.hypot(s.sx - k[n].x, s.sy - k[n].y) < 26)) this.mode = 'scale'; return true; },
  move(p) { const o = S.imgObj, st = this.st; if (!o) return;
    if (this.mode === 'move') { o.x = st.x + p.x - st.p.x; o.y = st.y + p.y - st.p.y; }
    else if (this.mode === 'rot') { o.rot = st.rot + Math.atan2(p.y - st.y, p.x - st.x) - Math.atan2(st.p.y - st.y, st.p.x - st.x); const q = Math.PI / 2, r = ((o.rot % q) + q) % q; if (r < .05 || q - r < .05) o.rot = Math.round(o.rot / q) * q; }
    else if (this.mode === 'sx' || this.mode === 'sy') { const cs = Math.cos(-o.rot), sn = Math.sin(-o.rot), dx = p.x - o.x, dy = p.y - o.y, lx = dx * cs - dy * sn, ly = dx * sn + dy * cs;
      if (this.mode === 'sx') o.ax = clamp(Math.abs(lx) * 2 / (o.img.width * o.sc), .01, 40); else o.ay = clamp(Math.abs(ly) * 2 / (o.img.height * o.sc), .01, 40); }
    else { const d0 = Math.hypot(st.p.x - st.x, st.p.y - st.y) || 1; o.sc = clamp(st.sc * Math.hypot(p.x - st.x, p.y - st.y) / d0, .01, 40); }
    requestRender(); },
  commit() { const o = S.imgObj; if (!o) return; S.imgObj = null; UI.closeSheet('imgf');
    if (o.layer) { const l = o.layer, x = l.ctx; x.save(); x.globalAlpha = o.op; x.translate(o.x, o.y); x.rotate(o.rot); x.scale(o.sc * o.fx * o.ax, o.sc * o.ay); x.imageSmoothingEnabled = !doc.pixel; x.imageSmoothingQuality = 'high'; x.drawImage(o.img, -o.img.width / 2, -o.img.height / 2); x.restore(); l.ver++; pushUndo(pxEntry(l, 0, 0, doc.w, doc.h, o.backup)); changed(); if (S.tool === 'move') UI.setTool(S.prevTool && S.prevTool !== 'move' ? S.prevTool : 'brush'); return; }
    structOp(() => { const n = newLayer((o.name || 'Imagen').slice(0, 24)); n.folder = AL() ? AL().folder || null : null; const x = n.ctx; x.save(); x.globalAlpha = o.op; x.translate(o.x, o.y); x.rotate(o.rot); x.scale(o.sc * o.fx * (o.ax || 1), o.sc * (o.ay || 1)); x.imageSmoothingEnabled = !doc.pixel; x.imageSmoothingQuality = 'high'; x.drawImage(o.img, -o.img.width / 2, -o.img.height / 2); x.restore(); FR().layers.splice(FR().active + 1, 0, n); FR().active++; });
    UI.toast('Imagen añadida en una capa nueva'); },
  cancel() { const o = S.imgObj; S.imgObj = null; UI.closeSheet('imgf'); if (o && o.layer) { const l = o.layer; l.ctx.clearRect(0, 0, doc.w, doc.h); l.ctx.drawImage(o.backup, 0, 0); l.ver++; if (S.tool === 'move') UI.setTool(S.prevTool && S.prevTool !== 'move' ? S.prevTool : 'brush'); } requestRender(); },
};

/* ---------- globos de texto ---------- */
if (!Path2D.prototype.roundRect) Path2D.prototype.roundRect = function (x, y, w, h, r) { r = Math.min(r || 0, w / 2, h / 2); this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath(); };
const BALLOONS = [
  ['oval', 'Normal'], ['rect', 'Redondeado'], ['box', 'Narración'], ['thought', 'Pensamiento'], ['cloud', 'Nube'], ['shout', 'Grito'],
  ['flash', 'Impacto'], ['whisper', 'Susurro'], ['electric', 'Electrónico'], ['scared', 'Temblor'], ['heart', 'Amor'], ['rough', 'Monstruo']];
const BAL = {
  rng(seed) { let s = (seed % 2147483646) + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; },
  // devuelve { paths:[Path2D], dash, extra(ctx) } en coordenadas de documento
  build(o) {
    const cx = o.x, cy = o.y, rx = o.w / 2, ry = o.h / 2, tx = o.tail.x, ty = o.tail.y, t = o.type, R = this.rng(o.seed || 7), out = { paths: [], dash: null, lines: null };
    const ang = Math.atan2((ty - cy) / ry, (tx - cx) / rx), ex = (a, k = 1) => [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
    const tail = (wid = .22, k = .9) => { if (!o.hasTail) return; const p = new Path2D(), a1 = ex(ang - wid, k), a2 = ex(ang + wid, k); p.moveTo(...a1); p.quadraticCurveTo(...ex(ang - wid * .3, 1.05), tx, ty); p.quadraticCurveTo(...ex(ang + wid * .1, 1.05), ...a2); p.closePath(); out.paths.push(p); };
    const ellipse = (kx = 1, ky = 1) => { const p = new Path2D(); p.ellipse(cx, cy, rx * kx, ry * ky, 0, 0, 7); return p; };
    const poly = (n, f) => { const p = new Path2D(); for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, k = f(i, a); const [x, y] = ex(a, k); i ? p.lineTo(x, y) : p.moveTo(x, y); } p.closePath(); return p; };
    if (t === 'oval' || t === 'whisper') { out.paths.push(ellipse()); tail(); if (t === 'whisper') out.dash = [o.lw * 2.5, o.lw * 2]; }
    else if (t === 'rect' || t === 'box') { const p = new Path2D(), r = t === 'box' ? 0 : Math.min(rx, ry) * .45; p.roundRect(cx - rx, cy - ry, rx * 2, ry * 2, r); out.paths.push(p); if (t === 'rect') tail(.16, .85); }
    else if (t === 'cloud' || t === 'thought') { const p = new Path2D(), n = 11; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, [x, y] = ex(a, .86), r = Math.min(rx, ry) * (.34 + R() * .12); p.moveTo(x + r, y); p.arc(x, y, r, 0, 7); } p.addPath(ellipse(.86, .86)); out.paths.push(p);
      if (o.hasTail) { if (t === 'thought') { const [sx, sy] = ex(ang, 1.05); for (let i = 0; i < 3; i++) { const f = (i + 1) / 3.6, q = new Path2D(), r = Math.min(rx, ry) * (.18 - i * .05); q.arc(sx + (tx - sx) * f, sy + (ty - sy) * f, Math.max(2, r), 0, 7); out.paths.push(q); } } else tail(.2, .85); } }
    else if (t === 'shout' || t === 'flash') { const n = t === 'shout' ? 22 : 40; out.paths.push(poly(n * 2, i => i % 2 ? .82 + R() * .05 : 1.08 + R() * .22)); if (t === 'shout' && o.hasTail) { const p = new Path2D(), a1 = ex(ang - .14, .9), a2 = ex(ang + .14, .9), m = ex(ang, 1.3); p.moveTo(...a1); p.lineTo(m[0] + (tx - m[0]) * .3 + 12, m[1] + (ty - m[1]) * .3); p.lineTo(tx, ty); p.lineTo(m[0] + (tx - m[0]) * .5 - 12, m[1] + (ty - m[1]) * .5); p.lineTo(...a2); p.closePath(); out.paths.push(p); }
      if (t === 'flash') { out.lines = []; for (let i = 0; i < 70; i++) { const a = i / 70 * Math.PI * 2 + R() * .05, k0 = 1.3 + R() * .25, k1 = 1.9 + R() * .6; out.lines.push([...ex(a, k0), ...ex(a, k1)]); } } }
    else if (t === 'electric') { const p = new Path2D(); p.roundRect(cx - rx, cy - ry, rx * 2, ry * 2, Math.min(rx, ry) * .15); out.paths.push(p); if (o.hasTail) { const q = new Path2D(), [sx, sy] = ex(ang, .85), nx = -(ty - sy), ny = tx - sx, L = Math.hypot(nx, ny) || 1, w = Math.min(rx, ry) * .18; q.moveTo(sx + nx / L * w, sy + ny / L * w); for (let i = 1; i <= 4; i++) { const f = i / 5, s2 = i % 2 ? 1 : -1; q.lineTo(sx + (tx - sx) * f + nx / L * w * s2 * (1 - f), sy + (ty - sy) * f + ny / L * w * s2 * (1 - f)); } q.lineTo(tx, ty); for (let i = 4; i >= 1; i--) { const f = i / 5, s2 = i % 2 ? -1 : 1; q.lineTo(sx + (tx - sx) * f + nx / L * w * s2 * (1 - f) * .3, sy + (ty - sy) * f + ny / L * w * s2 * (1 - f) * .3); } q.lineTo(sx - nx / L * w, sy - ny / L * w); q.closePath(); out.paths.push(q); } }
    else if (t === 'scared') { out.paths.push(poly(160, (i, a) => 1 + Math.sin(a * 24) * .035)); tail(.2); }
    else if (t === 'rough') { out.paths.push(poly(60, () => .94 + R() * .1)); tail(.24); }
    else if (t === 'heart') { const p = new Path2D(), w = rx, h = ry; p.moveTo(cx, cy + h); p.bezierCurveTo(cx - w * 1.25, cy + h * .05, cx - w * .95, cy - h * 1.15, cx, cy - h * .45); p.bezierCurveTo(cx + w * .95, cy - h * 1.15, cx + w * 1.25, cy + h * .05, cx, cy + h); out.paths.push(p); }
    return out;
  },
  render(x, o) {
    const b = this.build(o); x.save(); x.lineJoin = 'round'; x.lineCap = 'round';
    if (b.lines) { x.strokeStyle = o.stroke; x.lineWidth = Math.max(1, o.lw * .7); x.beginPath(); for (const [a, c, d, e] of b.lines) { x.moveTo(a, c); x.lineTo(d, e); } x.stroke(); }
    x.strokeStyle = o.stroke; x.lineWidth = o.lw * 2; if (b.dash) x.setLineDash(b.dash.map(v => v * 2)); if (o.lw > 0) for (const p of b.paths) x.stroke(p); x.setLineDash([]);
    x.fillStyle = o.fill; for (const p of b.paths) x.fill(p);
    if (o.text) { x.fillStyle = o.tcol; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `${o.bold ? '700 ' : ''}${o.size}px "${o.font}", system-ui`; const lines = o.text.split('\n');
      if (o.vertical) { const cols = lines.length, cw = o.size * 1.15; lines.forEach((ln, i) => { const chars = [...ln], X = o.x + (cols - 1) * cw / 2 - i * cw; chars.forEach((ch, j) => x.fillText(ch, X, o.y - (chars.length - 1) * o.size * .55 + j * o.size * 1.1)); }); }
      else { const lh = o.size * 1.18; lines.forEach((ln, i) => x.fillText(ln, o.x, o.y + (i - (lines.length - 1) / 2) * lh)); } }
    x.restore();
  },
  start(type) {
    if (S.textObj) TXT.commit(); if (S.imgObj) IMGF.commit(); loadWebFonts(); const d = store.get('balDef', {}), m = Math.min(doc.w, doc.h);
    S.balloon = Object.assign({ type, x: doc.w / 2, y: doc.h * .4, w: m * .5, h: m * .32, hasTail: !['box', 'flash'].includes(type), fill: '#ffffff', stroke: '#111111', lw: Math.max(2, m / 260), text: '', font: 'Comic Neue', size: Math.round(m / 22), tcol: '#111111', bold: true, vertical: false, seed: (Math.random() * 1e6) | 0 }, d, { type, text: '', seed: (Math.random() * 1e6) | 0 });
    S.balloon.tail = { x: S.balloon.x - S.balloon.w * .2, y: S.balloon.y + S.balloon.h * .95 }; S.balloon.hasTail = !['box', 'flash', 'heart'].includes(type) && (d.hasTail ?? true);
    requestRender(); UI.openBalloonSheet();
  },
  draw(c) { this.render(c, S.balloon); },
  handles() { const o = S.balloon, pts = { tl: [o.x - o.w / 2, o.y - o.h / 2], tr: [o.x + o.w / 2, o.y - o.h / 2], bl: [o.x - o.w / 2, o.y + o.h / 2], br: [o.x + o.w / 2, o.y + o.h / 2] }; if (o.hasTail) pts.tail = [o.tail.x, o.tail.y]; return Object.fromEntries(Object.entries(pts).map(([k, v]) => [k, toScr(...v)])); },
  overlay(c) { const o = S.balloon, h = this.handles(); c.save(); c.setLineDash([6, 4]); c.strokeStyle = '#58d3b0'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(h.tl.x, h.tl.y); c.lineTo(h.tr.x, h.tr.y); c.lineTo(h.br.x, h.br.y); c.lineTo(h.bl.x, h.bl.y); c.closePath(); c.stroke(); c.setLineDash([]);
    for (const [k, p] of Object.entries(h)) { c.fillStyle = k === 'tail' ? '#ffb020' : '#1d1f22'; c.beginPath(); c.arc(p.x, p.y, k === 'tail' ? 13 : 12, 0, 7); c.fill(); c.strokeStyle = k === 'tail' ? '#1d1f22' : '#58d3b0'; c.lineWidth = 2; c.stroke(); } c.restore(); },
  down(p, s) { const o = S.balloon, h = this.handles(); this.st = { p, o: JSON.parse(JSON.stringify(o)) }; this.mode = 'move'; for (const [k, q] of Object.entries(h)) if (Math.hypot(s.sx - q.x, s.sy - q.y) < 26) { this.mode = k; break; } return true; },
  move(p) { const o = S.balloon, st = this.st, dx = p.x - st.p.x, dy = p.y - st.p.y; if (!o) return;
    if (this.mode === 'move') { o.x = st.o.x + dx; o.y = st.o.y + dy; o.tail.x = st.o.tail.x + dx; o.tail.y = st.o.tail.y + dy; }
    else if (this.mode === 'tail') { o.tail.x = st.o.tail.x + dx; o.tail.y = st.o.tail.y + dy; }
    else { const sx = this.mode.includes('r') ? 1 : -1, sy = this.mode.includes('b') ? 1 : -1; o.w = Math.max(20, st.o.w + dx * sx); o.h = Math.max(16, st.o.h + dy * sy); o.x = st.o.x + (o.w - st.o.w) / 2 * sx; o.y = st.o.y + (o.h - st.o.h) / 2 * sy; }
    requestRender(); },
  commit() { const o = S.balloon; if (!o) return; S.balloon = null; UI.closeSheet('bal'); const sv = { ...o }; delete sv.text; delete sv.x; delete sv.y; delete sv.w; delete sv.h; delete sv.tail; delete sv.type; delete sv.seed; store.set('balDef', sv);
    structOp(() => { const n = newLayer('Globo' + (o.text ? ': ' + o.text.split('\n')[0].slice(0, 14) : '')); n.folder = AL() ? AL().folder || null : null; this.render(n.ctx, o); FR().layers.splice(FR().active + 1, 0, n); FR().active++; }); },
  cancel() { S.balloon = null; UI.closeSheet('bal'); requestRender(); },
  preview(type, w = 96, h = 72) { const c = mkCanvas(w * 2, h * 2), x = c.getContext('2d'); this.render(x, { type, x: w, y: h * .82, w: w * 1.2, h: h * .95, tail: { x: w * .6, y: h * 1.85 }, hasTail: !['box', 'flash', 'heart'].includes(type), fill: '#fff', stroke: '#111', lw: 3, text: '', seed: 11 }); return c; },
};
