'use strict';
/* FPSpaint — núcleo: estado, documento, deshacer, render, motor de pinceles y entrada */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; };
const cloneCanvas = c => { const n = mkCanvas(c.width, c.height); n.getContext('2d').drawImage(c, 0, 0); return n; };
const hex = (r, g, b) => '#' + [r, g, b].map(v => clamp(v | 0, 0, 255).toString(16).padStart(2, '0')).join('');
function parseHex(h) { h = String(h).replace('#', '').trim(); if (h.length === 3) h = h.split('').map(c => c + c).join(''); if (!/^[0-9a-f]{6}$/i.test(h)) return null; const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function rgb2hsv(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return [h, mx ? d / mx : 0, mx]; }
function hsv2rgb(h, s, v) { h = ((h % 360) + 360) % 360; const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c; let r, g, b; if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x]; return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]; }
const store = { get(k, d) { try { const v = localStorage.getItem('fps.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('fps.' + k, JSON.stringify(v)); } catch { } } };

/* ---------- pinceles ---------- */
const BCATS = [
  { id: 'all', name: 'Todos', ic: 'grid' }, { id: 'Tinta', name: 'Tinta', ic: 'pen' }, { id: 'Lápiz', name: 'Lápiz', ic: 'pencil' },
  { id: 'Marcador', name: 'Marcador', ic: 'marker' }, { id: 'Aerógrafo', name: 'Aerógrafo', ic: 'air' }, { id: 'Acuarela', name: 'Acuarela', ic: 'drop' },
  { id: 'Textura', name: 'Textura', ic: 'texture' }, { id: 'Pixel', name: 'Pixel', ic: 'pixel' }, { id: 'Importados', name: 'Importados', ic: 'custom' }];
const BRUSHES = [
  { id: 'pluma', name: 'Pluma', cat: 'Tinta', size: 6, hard: 1, spacing: .06, psize: 1, popac: 0, flow: 1 },
  { id: 'pluma-suave', name: 'Pluma suave', cat: 'Tinta', size: 8, hard: .55, spacing: .06, psize: 1, popac: .25, flow: 1 },
  { id: 'entintador', name: 'Entintador G', cat: 'Tinta', size: 10, hard: 1, spacing: .04, psize: 1.2, popac: 0, flow: 1, taper: true },
  { id: 'caligrafia', name: 'Caligrafía', cat: 'Tinta', size: 14, hard: 1, spacing: .03, psize: .6, popac: 0, flow: 1, flat: .28, angle: -40 },
  { id: 'lapiz', name: 'Lápiz HB', cat: 'Lápiz', size: 4, hard: .9, spacing: .12, psize: .5, popac: .8, flow: .55, grain: .55 },
  { id: 'lapiz-boceto', name: 'Lápiz de boceto', cat: 'Lápiz', size: 10, hard: .45, spacing: .1, psize: .6, popac: .8, flow: .32, grain: .7 },
  { id: 'lapiz-digital', name: 'Lápiz digital', cat: 'Lápiz', size: 5, hard: .95, spacing: .08, psize: .4, popac: .5, flow: .9 },
  { id: 'carboncillo', name: 'Carboncillo', cat: 'Lápiz', size: 26, hard: .7, spacing: .07, psize: .4, popac: .6, flow: .45, grain: 1, scatter: .08 },
  { id: 'rotulador', name: 'Rotulador', cat: 'Marcador', size: 20, hard: .97, spacing: .05, psize: 0, popac: 0, flow: 1 },
  { id: 'rotulador-suave', name: 'Rotulador suave', cat: 'Marcador', size: 24, hard: .6, spacing: .05, psize: 0, popac: 0, flow: 1 },
  { id: 'resaltador', name: 'Resaltador', cat: 'Marcador', size: 28, hard: 1, spacing: .04, psize: 0, popac: 0, flow: 1, flat: .4, angle: 90 },
  { id: 'aero', name: 'Aerógrafo', cat: 'Aerógrafo', size: 70, hard: 0, spacing: .06, psize: .3, popac: .7, flow: .07 },
  { id: 'aero-firme', name: 'Aerógrafo firme', cat: 'Aerógrafo', size: 40, hard: .5, spacing: .06, psize: .3, popac: .7, flow: .14 },
  { id: 'spray', name: 'Spray', cat: 'Aerógrafo', size: 50, hard: 1, spacing: .25, particles: true, flow: .9 },
  { id: 'acuarela', name: 'Acuarela', cat: 'Acuarela', size: 44, hard: .25, spacing: .07, psize: .5, popac: .5, flow: .12, grain: .35 },
  { id: 'acuarela-humeda', name: 'Acuarela húmeda', cat: 'Acuarela', size: 60, hard: 0, spacing: .05, psize: .4, popac: .6, flow: .06, grain: .2 },
  { id: 'pincel-seco', name: 'Pincel seco', cat: 'Textura', size: 30, hard: .85, spacing: .06, psize: .5, popac: .3, flow: .7, grain: 1, scatter: .04 },
  { id: 'tiza', name: 'Tiza', cat: 'Textura', size: 22, hard: .8, spacing: .08, psize: .3, popac: .4, flow: .8, grain: .95 },
  { id: 'estrellas', name: 'Estrellas', cat: 'Textura', size: 30, hard: 1, spacing: 1.2, star: true, scatter: .6, flow: 1, jitterSize: .6 },
  { id: 'pixel', name: 'Pixel 1px', cat: 'Pixel', size: 1, pixel: true, spacing: .3 },
  { id: 'pixel-2', name: 'Pixel cuadrado', cat: 'Pixel', size: 3, pixel: true, spacing: .3 },
  { id: 'pixel-dither', name: 'Pixel tramado', cat: 'Pixel', size: 4, pixel: true, dither: true, spacing: .3 },

  { id: 'pluma-fina', name: 'Pluma fina', cat: 'Tinta', size: 3, hard: 1, spacing: .05, psize: 1, flow: 1 },
  { id: 'pluma-g', name: 'Pluma G', cat: 'Tinta', size: 12, hard: 1, spacing: .04, psize: 1, flow: 1, taper: true },
  { id: 'comic', name: 'Marcador de cómic', cat: 'Tinta', size: 16, hard: 1, spacing: .04, psize: .6, flow: 1 },
  { id: 'tinta-seca', name: 'Tinta seca', cat: 'Tinta', size: 14, hard: .95, spacing: .06, psize: .7, flow: .9, grain: .4 },
  { id: 'mapa', name: 'Pluma de mapa', cat: 'Tinta', size: 2, hard: 1, spacing: .06, psize: .8, flow: 1 },
  { id: 'boligrafo', name: 'Bolígrafo', cat: 'Tinta', size: 3, hard: .95, spacing: .06, psize: .2, popac: .3, flow: .95 },
  { id: 'pincel-tinta', name: 'Pincel de tinta', cat: 'Tinta', size: 22, hard: .98, spacing: .03, psize: 1.2, flow: 1, taper: true },
  { id: 'tinta-difusa', name: 'Tinta difusa', cat: 'Tinta', size: 12, hard: .35, spacing: .05, psize: .8, flow: 1 },
  { id: 'lapiz-2b', name: 'Lápiz 2B', cat: 'Lápiz', size: 6, hard: .9, spacing: .1, psize: .5, popac: .8, flow: .45, grain: .6 },
  { id: 'lapiz-4b', name: 'Lápiz 4B', cat: 'Lápiz', size: 9, hard: .85, spacing: .1, psize: .5, popac: .8, flow: .5, grain: .75 },
  { id: 'lapiz-6h', name: 'Lápiz 6H', cat: 'Lápiz', size: 3, hard: .9, spacing: .12, psize: .4, popac: .7, flow: .35, grain: .5 },
  { id: 'lapiz-color', name: 'Lápiz de color', cat: 'Lápiz', size: 8, hard: .8, spacing: .1, psize: .4, popac: .6, flow: .6, grain: .8 },
  { id: 'grafito', name: 'Grafito', cat: 'Lápiz', size: 16, hard: .6, spacing: .08, psize: .4, popac: .7, flow: .3, grain: .9 },
  { id: 'portaminas', name: 'Portaminas', cat: 'Lápiz', size: 2, hard: .95, spacing: .1, psize: .3, popac: .5, flow: .75 },
  { id: 'marcador-fuerte', name: 'Marcador fuerte', cat: 'Marcador', size: 30, hard: 1, spacing: .04, psize: 0, flow: 1 },
  { id: 'marcador-acuoso', name: 'Marcador acuoso', cat: 'Marcador', size: 30, hard: .7, spacing: .05, psize: .2, flow: .35 },
  { id: 'marcador-plano', name: 'Marcador plano', cat: 'Marcador', size: 26, hard: 1, spacing: .03, flow: 1, flat: .25, angle: 0 },
  { id: 'rotulador-cuadrado', name: 'Rotulador cuadrado', cat: 'Marcador', size: 18, shape: 'square', rot: 'fixed', spacing: .05, flow: 1 },
  { id: 'marcador-pincel', name: 'Marcador de pincel', cat: 'Marcador', size: 18, hard: .85, spacing: .04, psize: .8, flow: 1 },
  { id: 'aero-grande', name: 'Aerógrafo grande', cat: 'Aerógrafo', size: 160, hard: 0, spacing: .06, psize: .3, popac: .6, flow: .04 },
  { id: 'aero-trapecio', name: 'Aerógrafo trapecio', cat: 'Aerógrafo', size: 90, hard: .25, spacing: .06, psize: .3, popac: .6, flow: .08 },
  { id: 'spray-fino', name: 'Spray fino', cat: 'Aerógrafo', size: 25, hard: 1, spacing: .25, particles: true, flow: .9 },
  { id: 'spray-grueso', name: 'Spray grueso', cat: 'Aerógrafo', size: 100, hard: 1, spacing: .2, particles: true, flow: .8 },
  { id: 'difumino', name: 'Difumino', cat: 'Aerógrafo', size: 60, hard: 0, spacing: .05, psize: .5, popac: .5, flow: .03 },
  { id: 'acuarela-seca', name: 'Acuarela seca', cat: 'Acuarela', size: 36, hard: .4, spacing: .07, psize: .5, popac: .5, flow: .2, grain: .55 },
  { id: 'acuarela-borde', name: 'Acuarela con borde', cat: 'Acuarela', size: 50, hard: .65, spacing: .06, psize: .4, popac: .5, flow: .1, grain: .3 },
  { id: 'gouache', name: 'Gouache', cat: 'Acuarela', size: 30, hard: .85, spacing: .06, psize: .4, popac: .3, flow: .5, grain: .2 },
  { id: 'oleo', name: 'Óleo', cat: 'Acuarela', size: 28, hard: .9, spacing: .05, psize: .3, popac: .2, flow: .75, grain: .5 },
  { id: 'pastel', name: 'Pastel', cat: 'Acuarela', size: 24, hard: .6, spacing: .07, psize: .3, popac: .4, flow: .5, grain: 1 },
  { id: 'hierba', name: 'Hierba', cat: 'Textura', size: 50, shape: 'blade', scatter: .25, jitterSize: .5, spacing: .35, flow: 1 },
  { id: 'pelo', name: 'Pelo', cat: 'Textura', size: 30, shape: 'strands', rot: 'follow', spacing: .05, flow: .35, psize: .6 },
  { id: 'hojas', name: 'Hojas', cat: 'Textura', size: 40, shape: 'leaf', scatter: .5, jitterSize: .5, spacing: .8, flow: 1 },
  { id: 'corazones', name: 'Corazones', cat: 'Textura', size: 36, shape: 'heart', rot: 'fixed', scatter: .5, jitterSize: .5, spacing: 1.2, flow: 1 },
  { id: 'brillos', name: 'Brillos', cat: 'Textura', size: 40, shape: 'sparkle', scatter: .7, jitterSize: .7, spacing: 1.4, flow: 1 },
  { id: 'puntos', name: 'Puntos', cat: 'Textura', size: 40, shape: 'dot', scatter: .6, jitterSize: .7, spacing: .9, flow: 1 },
  { id: 'nubes', name: 'Nubes', cat: 'Textura', size: 90, shape: 'cloud', jitterSize: .4, scatter: .15, spacing: .3, flow: .5 },
  { id: 'arena', name: 'Arena', cat: 'Textura', size: 40, hard: 1, spacing: .3, particles: true, flow: .5 },
  { id: 'lluvia', name: 'Lluvia', cat: 'Textura', size: 40, shape: 'line', rot: 'fixed', angle: 20, scatter: .8, jitterSize: .5, spacing: 1, flow: .8 },
  { id: 'confeti', name: 'Confeti', cat: 'Textura', size: 24, shape: 'square', scatter: .7, jitterSize: .5, spacing: 1, flow: 1 },
  { id: 'triangulos', name: 'Triángulos', cat: 'Textura', size: 30, shape: 'triangle', scatter: .6, jitterSize: .5, spacing: 1, flow: 1 },
  { id: 'burbujas', name: 'Burbujas', cat: 'Textura', size: 40, shape: 'ring', rot: 'fixed', scatter: .7, jitterSize: .7, spacing: 1.3, flow: .9 },
  { id: 'pixel-2px', name: 'Pixel 2px', cat: 'Pixel', size: 2, pixel: true, spacing: .3 },
  { id: 'pixel-4px', name: 'Pixel 4px', cat: 'Pixel', size: 4, pixel: true, spacing: .3 },
  { id: 'pixel-8px', name: 'Pixel 8px', cat: 'Pixel', size: 8, pixel: true, spacing: .3 },
  { id: 'pixel-dither-2', name: 'Pixel tramado grande', cat: 'Pixel', size: 8, pixel: true, dither: true, spacing: .3 },
];
const BR = Object.fromEntries(BRUSHES.map(b => [b.id, b]));
/* carpetas de capas */
function fold(l) { return l.folder && doc.folders ? doc.folders[l.folder] : null; }
function lvis(l) { const f = fold(l); return l.visible && (!f || f.visible !== false); }
function lfo(l) { const f = fold(l); return f ? (f.opacity ?? 1) : 1; }
const BLENDS = [
  ['Normal', [['source-over', 'Normal']]],
  ['Oscurecer', [['darken', 'Oscurecer'], ['multiply', 'Multiplicar'], ['color-burn', 'Subexposición de color']]],
  ['Aclarar', [['lighten', 'Aclarar'], ['screen', 'Pantalla'], ['color-dodge', 'Sobreexposición de color'], ['lighter', 'Añadir']]],
  ['Contraste', [['overlay', 'Superposición'], ['soft-light', 'Luz suave'], ['hard-light', 'Luz intensa']]],
  ['Diferencia', [['difference', 'Diferencia'], ['exclusion', 'Exclusión']]],
  ['Color', [['hue', 'Tono'], ['saturation', 'Saturación'], ['color', 'Color'], ['luminosity', 'Luminosidad']]]];
const BLEND_NAME = Object.fromEntries(BLENDS.flatMap(g => g[1]));
const TONES = (() => { const out = [['', 'Sin trama']]; const kinds = [['dot', 'Punto'], ['sq', 'Cuadrado'], ['h', 'Horizontal'], ['v', 'Vertical'], ['dd', 'Diagonal-D'], ['di', 'Diagonal-I'], ['cross', 'Cruzado'], ['crossx', 'Cruzado-X']]; for (const [k, n] of kinds) for (const s of [4, 6, 8, 12, 16]) out.push([k + ':' + s, n + ' L' + s]); out.push(['noise:4', 'Ruido']); return out; })();

/* ---------- estado ---------- */
const S = {
  tool: 'brush', prevTool: 'brush',
  cfg: { brush: { id: 'pluma', sizes: {}, op: 1 }, eraser: { id: 'rotulador', sizes: {}, op: 1 }, smudge: { size: 40, op: .6 }, blur: { size: 50, op: .6 }, shape: { size: 6, op: 1 }, select: { size: 1, op: 1 }, fill: { size: 1, op: 1 } },
  color: [24, 26, 32], hsv: [228, .25, .12], prevColor: [24, 26, 32], recent: store.get('recent', []),
  stab: store.get('stab2', 1), rotGesture: store.get('rotGesture', true), taper: store.get('taper', { on: false, start: .4, end: .4 }),
  shape: 'line', shapeFill: false, fillTol: 32, fillAll: true, fillGrow: 1,
  sym: { mode: 'off', n: 6 }, ruler: { mode: 'off', a: null, b: null, c: null },
  grid: { on: false, size: 64 }, smoothZoom: true, selMode: 'rect',
  onion: true, playing: false, dirty: false, undo: [], redo: [], sel: null, clip: null, textObj: null,
  frameTool: false, bgx: null, fx: null,
};
let doc = null;
const L = () => doc.frames[doc.frame].layers;
const FR = () => doc.frames[doc.frame];
const AL = () => L()[FR().active];

function newLayer(name, w = doc.w, h = doc.h) { const c = mkCanvas(w, h); return { id: uid(), name, canvas: c, ctx: c.getContext('2d'), visible: true, opacity: 1, blend: 'source-over', alphaLock: false, clip: false, locked: false, tone: '', frames: null, folder: null, ver: 0 }; }
function createDoc(o) {
  doc = { id: uid(), name: o.name || 'Dibujo', w: o.w, h: o.h, bg: o.bg || 'white', anim: !!o.anim, fps: o.fps || 8, pixel: !!o.pixel, frames: [], frame: 0, created: Date.now(), updated: Date.now() };
  doc.frames.push({ layers: [newLayer('Capa 1')], active: 0 });
  return doc;
}
function layerProps(l) { return { folder: l.folder || null, name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, alphaLock: l.alphaLock, clip: l.clip, locked: l.locked, tone: l.tone, frames: l.frames ? JSON.parse(JSON.stringify(l.frames)) : null }; }

/* ---------- deshacer ---------- */
function capStruct() { return { folders: JSON.stringify(doc.folders || {}), frames: doc.frames.map(f => ({ layers: f.layers.slice(), props: f.layers.map(layerProps), active: f.active, hold: f.hold || 1 })), frame: doc.frame, bg: doc.bg }; }
function applyStruct(s) { if (s.folders) doc.folders = JSON.parse(s.folders); doc.frames = s.frames.map(f => { f.layers.forEach((l, i) => { Object.assign(l, JSON.parse(JSON.stringify(f.props[i]))); l.ver++; }); return { layers: f.layers.slice(), active: f.active, hold: f.hold || 1 }; }); doc.frame = Math.min(s.frame, doc.frames.length - 1); doc.bg = s.bg; }
function structOp(fn) { const before = capStruct(); fn(); pushUndo({ type: 'st', before, after: capStruct() }); changed(true); }
function pxEntry(layer, x, y, w, h, before) { return { type: 'px', layer, x, y, w, h, before }; }
function capPx(layer, x = 0, y = 0, w = layer.canvas.width, h = layer.canvas.height) {
  x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y)); w = Math.min(layer.canvas.width - x, Math.ceil(w)); h = Math.min(layer.canvas.height - y, Math.ceil(h));
  if (w <= 0 || h <= 0) return null; return pxEntry(layer, x, y, w, h, cropCanvas(layer.canvas, x, y, w, h));
}
/* copias en canvas (no getImageData): evita que el navegador pase las capas a la CPU y todo se ponga lento */
function cropCanvas(src, x, y, w, h) { const c = mkCanvas(w, h); c.getContext('2d').drawImage(src, x, y, w, h, 0, 0, w, h); return c; }
function putSnap(ctx, snap, x, y) { if (snap instanceof ImageData) ctx.putImageData(snap, x, y); else { ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(x, y, snap.width, snap.height); ctx.drawImage(snap, x, y); ctx.restore(); } }
function entryBytes(e) { if (e.type === 'px') return e.w * e.h * 4 * (e.after ? 2 : 1); if (e.type === 'multi') return e.list.reduce((a, b) => a + entryBytes(b), 0); return 1000; }
function pushUndo(e) {
  if (!e) return; S.undo.push(e); S.redo.length = 0;
  if (!S.bgx) { let tot = S.undo.reduce((a, b) => a + entryBytes(b), 0); while (S.undo.length > 1 && (tot > 380e6 || S.undo.length > 80)) tot -= entryBytes(S.undo.shift()); }
  S.dirty = true; UI.refreshUndo && UI.refreshUndo();
}
function applyEntry(e, dir) {
  if (e.type === 'px') {
    if (dir < 0) { if (!e.after) e.after = cropCanvas(e.layer.canvas, e.x, e.y, e.w, e.h); putSnap(e.layer.ctx, e.before, e.x, e.y); if (e.metaBefore !== undefined) e.layer.frames = JSON.parse(e.metaBefore); }
    else { putSnap(e.layer.ctx, e.after, e.x, e.y); if (e.metaAfter !== undefined) e.layer.frames = JSON.parse(e.metaAfter); }
    e.layer.ver++;
  } else if (e.type === 'st') applyStruct(dir < 0 ? e.before : e.after);
  else if (e.type === 'multi') { const l = dir < 0 ? e.list.slice().reverse() : e.list; l.forEach(x => applyEntry(x, dir)); }
}
function undo() { if (S.textObj || !S.undo.length || (S.bgx && S.undo.length <= S.bgx.undoStart)) return; cancelOp(); const e = S.undo.pop(); applyEntry(e, -1); S.redo.push(e); changed(true); }
function redo() { if (S.textObj || !S.redo.length) return; const e = S.redo.pop(); applyEntry(e, 1); S.undo.push(e); changed(true); }
function changed(struct) { S.dirty = true; doc.updated = Date.now(); if (struct) { for (const l of L()) l.ver++; } else if (AL()) AL().ver++; requestRender(); if (UI.onChanged) UI.onChanged(struct); }

/* ---------- vista ---------- */
const V = { s: 1, x: 0, y: 0, r: 0, flip: false, dpr: 1, w: 0, h: 0 };
let view, vctx, sCanvas, sctx, tmp, tctx, tmp2, t2ctx;
const hover = { x: 0, y: 0, on: false, type: 'mouse' };
/* matriz de la vista: escala, rotación, espejo y traslación */
function vm() { const cs = Math.cos(V.r) * V.s, sn = Math.sin(V.r) * V.s; let a = cs, b = sn, c = -sn, d = cs, e = V.x, f = V.y; if (V.flip) { e += a * doc.w; f += b * doc.w; a = -a; b = -b; } return [a, b, c, d, e, f]; }
function toScr(x, y) { const [a, b, c, d, e, f] = vm(); return { x: a * x + c * y + e, y: b * x + d * y + f }; }
function toDoc(px, py) { const [a, b, c, d, e, f] = vm(), det = a * d - b * c, dx = px - e, dy = py - f; return { x: (d * dx - c * dy) / det, y: (-b * dx + a * dy) / det }; }
function setViewMatrix(ctx, k) { const [a, b, c, d, e, f] = vm(); ctx.setTransform(a * k, b * k, c * k, d * k, e * k, f * k); }
function rotateView(r, cx = V.w / 2, cy = V.h / 2) { const p = toDoc(cx, cy); V.r = r; const q = toScr(p.x, p.y); V.x += cx - q.x; V.y += cy - q.y; requestRender(); UI.updRot && UI.updRot(); }
function stageRect() { return $('#stage').getBoundingClientRect(); }
function fitView() {
  const r = stageRect(), wide = document.body.classList.contains('wide');
  const padT = wide ? 70 : 74, padB = wide ? (doc.anim ? 100 : 30) : (doc.anim ? 160 : 92), padX = wide ? 40 : 62;
  const aw = Math.max(50, r.width - padX * 2), ah = Math.max(50, r.height - padT - padB);
  let s = Math.min(aw / doc.w, ah / doc.h); if (doc.pixel) s = Math.max(1, Math.floor(s)); s = Math.min(s, doc.pixel ? 64 : 8);
  V.r = 0; V.s = s; V.x = (r.width - doc.w * s) / 2; V.y = padT + (ah - doc.h * s) / 2; requestRender(); UI.updRot && UI.updRot(); UI.updZoom && UI.updZoom();
}
function zoomAt(f, cx, cy) { const p = toDoc(cx, cy); V.s = clamp(V.s * f, .05, 64); const q = toScr(p.x, p.y); V.x += cx - q.x; V.y += cy - q.y; requestRender(); UI.updZoom && UI.updZoom(); }
function resizeView() {
  _vr = null; const r = stageRect(); V.dpr = Math.min(window.devicePixelRatio || 1, window.FPSAndroid || matchMedia('(pointer:coarse)').matches ? 2 : 2.5); V.w = r.width; V.h = r.height;
  view.width = Math.round(r.width * V.dpr); view.height = Math.round(r.height * V.dpr); requestRender();
}
let rafId = 0;
function requestRender() { if (!rafId) rafId = requestAnimationFrame(render); }
let checkerPat = null;
function checker(ctx) { if (!checkerPat) { const c = mkCanvas(16, 16), x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 16, 16); x.fillStyle = '#d9dbe0'; x.fillRect(0, 0, 8, 8); x.fillRect(8, 8, 8, 8); checkerPat = c; } return ctx.createPattern(checkerPat, 'repeat'); }
const _cache = {};
function cached(n) { let c = _cache[n]; if (!c || c.width !== doc.w || c.height !== doc.h) c = _cache[n] = mkCanvas(doc.w, doc.h); return c; }
function ensureTmp() {
  if (!tmp || tmp.width !== doc.w || tmp.height !== doc.h) { tmp = mkCanvas(doc.w, doc.h); tctx = tmp.getContext('2d'); tmp2 = mkCanvas(doc.w, doc.h); t2ctx = tmp2.getContext('2d'); sCanvas = mkCanvas(doc.w, doc.h); sctx = sCanvas.getContext('2d'); }
}

/* tramas */
const toneCache = new Map();
function tonePattern(spec) {
  if (toneCache.has(spec)) return toneCache.get(spec);
  const [k, s0] = spec.split(':'), s = +s0; const c = mkCanvas(k === 'noise' ? 64 : s, k === 'noise' ? 64 : s), x = c.getContext('2d'); x.fillStyle = '#000'; x.strokeStyle = '#000';
  const lw = Math.max(1, s * .28);
  if (k === 'dot') { x.beginPath(); x.arc(s / 2, s / 2, s * .26, 0, 7); x.fill(); }
  else if (k === 'sq') { const q = s * .45; x.fillRect((s - q) / 2, (s - q) / 2, q, q); }
  else if (k === 'h') x.fillRect(0, (s - lw) / 2, s, lw);
  else if (k === 'v') x.fillRect((s - lw) / 2, 0, lw, s);
  else if (k === 'cross') { x.fillRect(0, (s - lw) / 2, s, lw); x.fillRect((s - lw) / 2, 0, lw, s); }
  else if (k === 'dd' || k === 'di' || k === 'crossx') { x.lineWidth = lw * .9; const d = (a, b, cc, e) => { x.beginPath(); x.moveTo(a, b); x.lineTo(cc, e); x.stroke(); };
    if (k !== 'di') { d(-1, s + 1, s + 1, -1); d(-1 - s, s + 1, 1, -1); d(s - 1, s + 1, 2 * s + 1, -1); }
    if (k !== 'dd') { d(-1, -1, s + 1, s + 1); d(-1 - s, -1, 1, s + 1); d(s - 1, -1, 2 * s + 1, s + 1); } }
  else if (k === 'noise') { const id = x.createImageData(64, 64); for (let i = 0; i < id.data.length; i += 4) { id.data[i + 3] = Math.random() < .45 ? 255 : 0; } x.putImageData(id, 0, 0); }
  toneCache.set(spec, c); return c;
}
function layerSource(l) {
  if (!l.tone) return l.canvas;
  if (l._toneVer === l.ver && l._toneC) return l._toneC;
  const c = l._toneC && l._toneC.width === l.canvas.width ? l._toneC : mkCanvas(l.canvas.width, l.canvas.height), x = c.getContext('2d');
  x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, c.width, c.height); x.drawImage(l.canvas, 0, 0);
  x.globalCompositeOperation = 'destination-in'; x.fillStyle = x.createPattern(tonePattern(l.tone), 'repeat'); x.fillRect(0, 0, c.width, c.height); x.globalCompositeOperation = 'source-over';
  l._toneC = c; l._toneVer = l.ver; return c;
}

/* dibuja las capas de un fotograma en ctx (coords de documento). live = trazo en curso */
function drawLayers(ctx, layers, opts = {}) {
  const act = opts.active, alpha = opts.alpha ?? 1;
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i]; if (!lvis(l)) continue;
    if (l.clip) continue; // dibujadas con su base
    // grupo de recorte: capas siguientes con clip
    let j = i + 1; const clips = []; while (j < layers.length && layers[j].clip) { if (lvis(layers[j])) clips.push(layers[j]); j++; }
    let src = liveSource(l, act, opts);
    if (clips.length) {
      const g = opts.gcanvas || (opts.gcanvas = cached('g' + (opts.depth || 0))); const gx = g.getContext('2d');
      gx.globalCompositeOperation = 'source-over'; gx.globalAlpha = 1; gx.clearRect(0, 0, g.width, g.height); gx.drawImage(src, 0, 0);
      for (const c of clips) { gx.globalAlpha = c.opacity; gx.globalCompositeOperation = 'source-atop'; gx.drawImage(liveSource(c, act, opts, true), 0, 0); }
      gx.globalAlpha = 1; gx.globalCompositeOperation = 'source-over'; src = g;
    }
    ctx.globalAlpha = l.opacity * lfo(l) * alpha; ctx.globalCompositeOperation = l.blend; ctx.drawImage(src, 0, 0);
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
function liveSource(l, act, opts, second) {
  if (l !== act) return layerSource(l);
  if (S.fx && S.fx.preview) return S.fx.preview;
  if (!op || !op.live) return layerSource(l);
  const c = second ? tmp2 : tmp, x = second ? t2ctx : tctx;
  x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, doc.w, doc.h); x.drawImage(l.canvas, 0, 0);
  if (op.kind === 'repair') { x.save(); x.globalCompositeOperation = 'source-over'; const t = cached('rep'); const tx = t.getContext('2d'); tx.globalCompositeOperation = 'source-over'; tx.clearRect(0, 0, doc.w, doc.h); tx.drawImage(S.bgx.orig, 0, 0); tx.globalCompositeOperation = 'destination-in'; tx.drawImage(sCanvas, 0, 0); tx.globalCompositeOperation = 'source-over'; x.drawImage(t, 0, 0); x.restore(); }
  else {
    x.globalAlpha = op.opacity; x.globalCompositeOperation = op.erase ? 'destination-out' : (l.alphaLock ? 'source-atop' : 'source-over');
    if (S.sel && !op.noClip) { const m = cached('selc'); const mx = m.getContext('2d'); mx.globalCompositeOperation = 'source-over'; mx.clearRect(0, 0, doc.w, doc.h); mx.drawImage(sCanvas, 0, 0); mx.globalCompositeOperation = 'destination-in'; mx.drawImage(S.sel.mask, 0, 0); x.drawImage(m, 0, 0); }
    else x.drawImage(sCanvas, 0, 0);
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  }
  if (l.tone) { x.globalCompositeOperation = 'destination-in'; x.fillStyle = x.createPattern(tonePattern(l.tone), 'repeat'); x.fillRect(0, 0, doc.w, doc.h); x.globalCompositeOperation = 'source-over'; }
  return c;
}
function compositeFrame(fi, withBg, scale = 1, out) {
  const w = Math.max(1, Math.round(doc.w * scale)), h = Math.max(1, Math.round(doc.h * scale));
  const c = out && out.width === w && out.height === h ? out : mkCanvas(w, h), x = c.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, w, h);
  if (withBg && doc.bg !== 'transparent') { x.fillStyle = doc.bg === 'black' ? '#000' : doc.bg === 'white' ? '#fff' : doc.bg; x.fillRect(0, 0, w, h); }
  x.setTransform(scale, 0, 0, scale, 0, 0); x.imageSmoothingEnabled = !doc.pixel; drawLayers(x, doc.frames[fi].layers, {}); x.setTransform(1, 0, 0, 1, 0, 0); return c;
}

/* piel de cebolla */
function onionCfg() { return doc.onion || (doc.onion = { mode: 'both', n: 1, a1: .5, a2: .2, past: '#ff3b3b', fut: '#22c55e', tint: true }); }
const onionCache = new Map();
function onionImg(i, col) {
  const f = doc.frames[i], key = f.layers.map(l => l.id + ':' + l.ver + ':' + l.visible + ':' + l.opacity).join('|') + col;
  const ent = onionCache.get(f); if (ent && ent.key === key && ent.c.width === doc.w && ent.c.height === doc.h) return ent.c;
  const c = ent && ent.c.width === doc.w && ent.c.height === doc.h ? ent.c : mkCanvas(doc.w, doc.h), x = c.getContext('2d');
  x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, doc.w, doc.h); drawLayers(x, f.layers, {});
  if (col) { x.globalCompositeOperation = 'source-atop'; x.globalAlpha = .65; x.fillStyle = col; x.fillRect(0, 0, doc.w, doc.h); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; }
  onionCache.set(f, { key, c }); return c;
}
function drawOnion(c) {
  const o = onionCfg(); if (o.mode === 'none') return; const n = Math.max(1, o.n | 0), N = doc.frames.length;
  const loop = doc.playMode !== 'once' && N > 2;
  const one = (dir, col) => { for (let k = n; k >= 1; k--) { let i = doc.frame + dir * k; if (loop) i = (i + N) % N; if (i < 0 || i >= N || i === doc.frame) continue; const a = n === 1 ? o.a1 : o.a1 + (o.a2 - o.a1) * (k - 1) / (n - 1); c.globalAlpha = a; c.drawImage(onionImg(i, o.tint ? col : null), 0, 0); } c.globalAlpha = 1; };
  if (o.mode === 'both' || o.mode === 'past') one(-1, o.past);
  if (o.mode === 'both' || o.mode === 'future') one(1, o.fut);
}
/* caché de composición: evita redibujar todas las capas en cada cuadro (mover, hacer zoom, pintar) */
const RC = { sig: null, below: null, above: null, bsig: null, asig: null };
const lsig = ls => JSON.stringify(doc.folders || {}) + ls.map(l => l.id + ':' + l.ver + ':' + (lvis(l) ? 1 : 0) + ':' + l.opacity * lfo(l) + ':' + l.blend + ':' + (l.clip ? 1 : 0) + ':' + l.tone).join('|');
function drawCached(c) {
  const ls = L(), act = AL(), ai = FR().active;
  const live = (op && (op.live || op.kind === 'smudge' || op.kind === 'blur' || op.kind === 'move')) || (S.fx && S.fx.preview);
  if (!live) { const sg = lsig(ls) + doc.w + 'x' + doc.h; if (RC.sig !== sg) { const cc = cached('rcAll'), x = cc.getContext('2d'); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, doc.w, doc.h); drawLayers(x, ls, {}); RC.sig = sg; } c.drawImage(cached('rcAll'), 0, 0); return; }
  RC.sig = null;
  const below = ls.slice(0, ai), above = ls.slice(ai + 1);
  if (act.clip || (above[0] && above[0].clip) || above.some(l => l.visible && (l.blend !== 'source-over' || l.clip))) { drawLayers(c, ls, { active: act }); return; }
  const bs = lsig(below), as = lsig(above);
  if (RC.bsig !== bs) { const cc = cached('rcBelow'), x = cc.getContext('2d'); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, doc.w, doc.h); drawLayers(x, below, {}); RC.bsig = bs; }
  if (RC.asig !== as) { const cc = cached('rcAbove'), x = cc.getContext('2d'); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, doc.w, doc.h); drawLayers(x, above, {}); RC.asig = as; }
  const fast0 = lvis(act) && op && op.live && op.kind === 'stroke' && !op.erase && !act.alphaLock && !S.sel && !act.tone && act.blend === 'source-over' && !(S.fx && S.fx.preview);
  if (below.length && !fast0) c.drawImage(cached('rcBelow'), 0, 0);
  if (lvis(act)) {
    const fast = op && op.live && op.kind === 'stroke' && !op.erase && !act.alphaLock && !S.sel && !act.tone && act.blend === 'source-over' && !(S.fx && S.fx.preview);
    if (fast) { const key = RC.bsig + '|' + act.id + ':' + act.ver + ':' + act.opacity * lfo(act); if (RC.bksig !== key) { const cc = cached('rcBA'), x = cc.getContext('2d'); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, doc.w, doc.h); if (below.length) x.drawImage(cached('rcBelow'), 0, 0); x.globalAlpha = act.opacity * lfo(act); x.drawImage(act.canvas, 0, 0); RC.bksig = key; } c.globalAlpha = 1; c.drawImage(cached('rcBA'), 0, 0); c.globalAlpha = act.opacity * lfo(act) * op.opacity; c.drawImage(sCanvas, 0, 0); c.globalAlpha = 1; if (above.length) c.drawImage(cached('rcAbove'), 0, 0); return; }
    else { c.globalAlpha = act.opacity * lfo(act); c.globalCompositeOperation = act.blend; c.drawImage(liveSource(act, act, {}), 0, 0); }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }
  if (above.length) c.drawImage(cached('rcAbove'), 0, 0);
}
const BGX_BG = ['checker', '#ffffff', '#000000', '#22c55e', '#ef4444'];
function render() {
  rafId = 0; if (!doc || !view) return;
  const c = vctx, d = V.dpr; c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  c.fillStyle = S.bgx ? '#2a2c30' : '#56595f'; c.fillRect(0, 0, view.width, view.height);
  setViewMatrix(c, d);
  { const o = 3 / V.s; c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(-o, -o, doc.w + o * 2, doc.h + o * 3); c.fillRect(-o * 2, -o, doc.w + o * 4, doc.h + o * 5); }
  // fondo
  const bg = S.bgx ? BGX_BG[S.bgx.bgi] : doc.bg;
  if (bg === 'transparent' || bg === 'checker') { c.save(); c.setTransform(d, 0, 0, d, 0, 0); c.beginPath(); for (const [qx, qy] of [[0, 0], [doc.w, 0], [doc.w, doc.h], [0, doc.h]]) { const q = toScr(qx, qy); c.lineTo(q.x, q.y); } c.closePath(); c.clip(); c.fillStyle = checker(c); c.fillRect(0, 0, view.width, view.height); c.restore(); }
  else { c.fillStyle = bg === 'white' ? '#fff' : bg === 'black' ? '#000' : bg; c.fillRect(0, 0, doc.w, doc.h); }
  c.imageSmoothingEnabled = doc.pixel ? false : (S.smoothZoom || V.s < 1.5); c.imageSmoothingQuality = (op || gest) ? 'low' : 'high';
  ensureTmp();
  if (S.playing) { drawLayers(c, doc.frames[S.playFrame].layers, {}); }
  else if (S.bgx) { const l = AL(); const src = liveSource(l, l, {}); c.drawImage(src, 0, 0); }
  else {
    if (doc.anim && S.onion) drawOnion(c);
    drawCached(c);
  }
  // texto flotante
  if (S.textObj) TXT.drawObj(c);
  if (S.imgObj) IMGF.draw(c);
  if (S.balloon) BAL.draw(c);
  c.setTransform(d, 0, 0, d, 0, 0); c.imageSmoothingEnabled = true;
  drawOverlays(c);
  ANTS.draw();
}
function drawOverlays(c) {
  const lw = 1;
  // cuadrícula
  if (S.grid.on && !S.playing) {
    const g = S.grid.size; c.strokeStyle = 'rgba(80,140,255,.35)'; c.lineWidth = lw; c.beginPath();
    const L2 = (x0, y0, x1, y1) => { const a = toScr(x0, y0), b = toScr(x1, y1); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); };
    if (g * V.s >= 4) { for (let x = g; x < doc.w; x += g) L2(x, 0, x, doc.h); for (let y = g; y < doc.h; y += g) L2(0, y, doc.w, y); }
    c.stroke();
  }
  // selección
  if (S.sel && !S.playing) {
    if (!S.sel.ov || S.sel.ovVer !== S.sel.ver) { const o = S.sel.ov && S.sel.ov.width === doc.w ? S.sel.ov : mkCanvas(doc.w, doc.h), ox = o.getContext('2d'); ox.globalCompositeOperation = 'source-over'; ox.clearRect(0, 0, doc.w, doc.h); ox.fillStyle = 'rgba(20,24,30,.42)'; ox.fillRect(0, 0, doc.w, doc.h); ox.globalCompositeOperation = 'destination-out'; ox.drawImage(S.sel.mask, 0, 0); S.sel.ov = o; S.sel.ovVer = S.sel.ver; }
    c.save(); setViewMatrix(c, V.dpr); c.drawImage(S.sel.ov, 0, 0);
    c.restore();
  }
  // operación de selección en curso
  if (op && op.kind === 'selpath' && op.pts.length > 1) { c.save(); c.lineWidth = 1.5; c.setLineDash([5, 4]); c.strokeStyle = '#fff'; c.beginPath(); op.pts.forEach((p, i) => { const q = toScr(p.x, p.y); i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y); }); if (op.mode === 'rect') c.closePath(); c.stroke(); c.restore(); }
  if (op && op.kind === 'framecut') { const a = toScr(op.a.x, op.a.y), b = toScr(op.b.x, op.b.y); c.save(); c.strokeStyle = '#58d3b0'; c.lineWidth = 2; c.setLineDash([8, 5]); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); c.restore(); }
  // simetría
  if (S.sym.mode !== 'off' && !S.playing) {
    const cc = toScr(doc.w / 2, doc.h / 2), p0 = toScr(0, 0), p1 = toScr(doc.w, doc.h); c.save(); c.strokeStyle = 'rgba(88,211,176,.75)'; c.lineWidth = 1; c.setLineDash([6, 5]); c.beginPath();
    const SL = (x0, y0, x1, y1) => { const a = toScr(x0, y0), b = toScr(x1, y1); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); };
    if (S.sym.mode === 'v' || S.sym.mode === 'quad') SL(doc.w / 2, 0, doc.w / 2, doc.h);
    if (S.sym.mode === 'h' || S.sym.mode === 'quad') SL(0, doc.h / 2, doc.w, doc.h / 2);
    if (S.sym.mode === 'radial') { const R = Math.max(doc.w, doc.h) * V.s; for (let k = 0; k < S.sym.n; k++) { const t = k * Math.PI * 2 / S.sym.n - Math.PI / 2; c.moveTo(cc.x, cc.y); c.lineTo(cc.x + Math.cos(t) * R, cc.y + Math.sin(t) * R); } }
    c.stroke(); c.restore();
  }
  // reglas
  if (S.ruler.mode !== 'off' && !S.playing) RULER.draw(c);
  if (S.textObj) TXT.overlay(c);
  if (S.imgObj) IMGF.overlay(c);
  if (S.balloon) BAL.overlay(c);
  // cursor del pincel
  const t = S.tool;
  if (S.bgx && S.bgx.cursor) { const k = S.bgx.cursor; c.save(); c.strokeStyle = '#ff5a5a'; c.lineWidth = 2; c.beginPath(); c.arc(k.x, k.y, Math.max(3, S.bgx.size / 2 * V.s), 0, 7); c.stroke(); if (k.fx !== undefined) { c.fillStyle = 'rgba(255,90,90,.85)'; c.beginPath(); c.arc(k.fx, k.fy, 9, 0, 7); c.fill(); } c.restore(); }
  else if (hover.on && !S.playing && ['brush', 'eraser', 'smudge', 'blur'].includes(t) && !S.textObj) {
    const r = Math.max(1, toolSize() / 2 * V.s); c.save(); c.lineWidth = 1; c.strokeStyle = 'rgba(0,0,0,.6)'; c.beginPath(); c.arc(hover.x, hover.y, r, 0, 7); c.stroke(); c.strokeStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.arc(hover.x, hover.y, r + 1, 0, 7); c.stroke(); c.restore();
  }
  // lupa del gotero
  if (op && op.kind === 'pick' && op.col) { const p = op.scr; c.save(); c.lineWidth = 10; c.strokeStyle = hex(...op.col); c.beginPath(); c.arc(p.x, p.y - 70, 34, 0, 7); c.stroke(); c.lineWidth = 2; c.strokeStyle = '#fff'; c.beginPath(); c.arc(p.x, p.y - 70, 40, 0, 7); c.stroke(); c.restore(); }
}

/* ---------- líneas movedizas de la selección (en un lienzo aparte, liviano) ---------- */
const ANTS = {
  off: 0, tm: 0, ver: -1, path: null,
  outline() {
    const sel = S.sel; if (!sel) return null; if (this.ver === sel.ver && this.path) return this.path; this.ver = sel.ver;
    if (sel.path) return this.path = sel.path;
    const k = Math.min(1, 640 / Math.max(doc.w, doc.h)), w = Math.max(1, Math.round(doc.w * k)), h = Math.max(1, Math.round(doc.h * k));
    const c = mkCanvas(w, h), x = c.getContext('2d'); x.drawImage(sel.mask, 0, 0, w, h); const d = x.getImageData(0, 0, w, h).data, on = (i, j) => i >= 0 && j >= 0 && i < w && j < h && d[(j * w + i) * 4 + 3] > 127;
    const W1 = w + 1, adj = new Map(), add = (p1, p2) => { (adj.get(p1) || adj.set(p1, []).get(p1)).push(p2); (adj.get(p2) || adj.set(p2, []).get(p2)).push(p1); };
    for (let j = 0; j <= h; j++) for (let i = 0; i < w; i++) if (on(i, j) !== on(i, j - 1)) add(j * W1 + i, j * W1 + i + 1);
    for (let i = 0; i <= w; i++) for (let j = 0; j < h; j++) if (on(i, j) !== on(i - 1, j)) add(j * W1 + i, (j + 1) * W1 + i);
    const p = new Path2D(), sx = doc.w / w, sy = doc.h / h, pt = q => [(q % W1) * sx, ((q / W1) | 0) * sy];
    for (const [start] of adj) { let nb = adj.get(start); if (!nb.length) continue; let prev = start, cur = nb.pop(); adj.get(cur).splice(adj.get(cur).indexOf(prev), 1); p.moveTo(...pt(start)); let n = 0;
      while (cur !== undefined && n++ < 2e6) { p.lineTo(...pt(cur)); const l = adj.get(cur); if (!l.length) break; const nx = l.pop(); const ln = adj.get(nx); ln.splice(ln.indexOf(cur), 1); prev = cur; cur = nx; } }
    return this.path = p;
  },
  draw() {
    const cv = document.getElementById('ants'); if (!cv) return; const dpr = V.dpr;
    if (cv.width !== view.width || cv.height !== view.height) { cv.width = view.width; cv.height = view.height; }
    const x = cv.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, cv.width, cv.height);
    if (!S.sel || !doc || S.playing) { this.stop(); return; }
    const p = this.outline(); if (!p) return;
    setViewMatrix(x, dpr); const u = 1 / V.s; x.lineWidth = 1.4 * u; x.setLineDash([5 * u, 5 * u]);
    x.lineDashOffset = -this.off * u; x.strokeStyle = '#fff'; x.stroke(p); x.lineDashOffset = -(this.off + 5) * u; x.strokeStyle = '#111'; x.stroke(p);
    if (!this.tm) this.tm = setInterval(() => { if (!S.sel || document.hidden) { this.stop(); return; } this.off = (this.off + 1) % 10; this.draw(); }, 90);
  },
  stop() { clearInterval(this.tm); this.tm = 0; },
};

/* ---------- motor de pinceles ---------- */
const stampCache = new Map();
function colStr() { return hex(...S.color); }
function getStamp(col, b, v = 0) {
  const key = b.id + '|' + col + '|' + v; let st = stampCache.get(key); if (st) return st;
  const N = b.tip ? Math.max(96, b.tip.width, b.tip.height) : 128, c = mkCanvas(N, N), x = c.getContext('2d'); x.fillStyle = col;
  if (b.tip) { const t = b.tip, k = N / Math.max(t.width, t.height), w = t.width * k, h = t.height * k; x.drawImage(t, (N - w) / 2, (N - h) / 2, w, h); if (!b.keepColor || col === '#000') { x.globalCompositeOperation = 'source-in'; x.fillRect(0, 0, N, N); x.globalCompositeOperation = 'source-over'; } }
  else if (b.shape) { const h = N / 2; x.save(); x.translate(h, h); x.beginPath();
    switch (b.shape) {
      case 'square': x.rect(-h * .8, -h * .8, h * 1.6, h * 1.6); break;
      case 'triangle': x.moveTo(0, -h * .9); x.lineTo(h * .85, h * .7); x.lineTo(-h * .85, h * .7); x.closePath(); break;
      case 'heart': x.moveTo(0, h * .8); x.bezierCurveTo(-h * 1.1, -h * .1, -h * .55, -h * .95, 0, -h * .35); x.bezierCurveTo(h * .55, -h * .95, h * 1.1, -h * .1, 0, h * .8); break;
      case 'leaf': x.moveTo(0, -h * .95); x.quadraticCurveTo(h * .7, 0, 0, h * .95); x.quadraticCurveTo(-h * .7, 0, 0, -h * .95); break;
      case 'blade': x.moveTo(-h * .12, h * .95); x.quadraticCurveTo(h * .05, 0, h * .03, -h * .95); x.quadraticCurveTo(h * .2, 0, h * .12, h * .95); x.closePath(); break;
      case 'sparkle': for (let i = 0; i < 8; i++) { const r = i % 2 ? h * .14 : h * .95, a = i * Math.PI / 4 - Math.PI / 2; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); break;
      case 'line': x.rect(-h * .06, -h * .95, h * .12, h * 1.9); break;
      case 'dot': x.arc(0, 0, h * .35, 0, 7); break;
      case 'ring': x.arc(0, 0, h * .9, 0, 7); x.arc(0, 0, h * .65, 0, 7, true); break;
      case 'cloud': for (const [cx, cy, r] of [[-.4, .1, .45], [0, -.2, .55], [.42, .08, .45], [0, .3, .45]]) { x.moveTo(cx * h + r * h, cy * h); x.arc(cx * h, cy * h, r * h, 0, 7); } break;
      case 'strands': for (let i = -4; i <= 4; i++) { x.rect(i * h * .2 - h * .025, -h * .9 + Math.abs(i) * h * .06, h * .05, h * 1.8 - Math.abs(i) * h * .12); } break;
    }
    x.fill('evenodd'); x.restore(); }
  else if (b.star) { x.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? N * .2 : N * .48, a = i * Math.PI / 5 - Math.PI / 2; x.lineTo(N / 2 + Math.cos(a) * r, N / 2 + Math.sin(a) * r); } x.closePath(); x.fill(); }
  else if ((b.hard ?? 1) >= .97) { x.beginPath(); x.arc(N / 2, N / 2, N / 2 - .5, 0, 7); x.fill(); }
  else { const [r, g, bb] = parseHex(col); const gr = x.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2); gr.addColorStop(0, col); gr.addColorStop(Math.max(.01, b.hard || 0), col); gr.addColorStop(1, `rgba(${r},${g},${bb},0)`); x.fillStyle = gr; x.fillRect(0, 0, N, N); }
  if (b.grain) { const id = x.getImageData(0, 0, N, N), dd = id.data; for (let i = 3; i < dd.length; i += 4) if (Math.random() < b.grain * .6) dd[i] = dd[i] * Math.random() * .35; x.putImageData(id, 0, 0); }
  if (stampCache.size > 300) stampCache.clear(); stampCache.set(key, st = c); return st;
}
function symPoints(x, y) {
  const m = S.sym.mode; if (m === 'off' || S.bgx) return [[x, y, 0]];
  const cx = doc.w / 2, cy = doc.h / 2, out = [[x, y, 0]];
  if (m === 'v') out.push([2 * cx - x, y, 1]);
  else if (m === 'h') out.push([x, 2 * cy - y, 1]);
  else if (m === 'quad') out.push([2 * cx - x, y, 1], [x, 2 * cy - y, 1], [2 * cx - x, 2 * cy - y, 0]);
  else if (m === 'radial') { const n = S.sym.n; for (let k = 1; k < n; k++) { const t = k * Math.PI * 2 / n, dx = x - cx, dy = y - cy; out.push([cx + dx * Math.cos(t) - dy * Math.sin(t), cy + dx * Math.sin(t) + dy * Math.cos(t), 0]); } }
  return out;
}
function dabRaw(ctx, x, y, r, a, b, col, ang = 0) {
  if (b.pixel) {
    const s = Math.max(1, Math.round(r * 2)); ctx.globalAlpha = 1; ctx.fillStyle = col; const x0 = Math.round(x - s / 2 + .001), y0 = Math.round(y - s / 2 + .001);
    if (b.dither) { for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) if (((x0 + i) + (y0 + j)) % 2 === 0) ctx.fillRect(x0 + i, y0 + j, 1, 1); } else ctx.fillRect(x0, y0, s, s); return;
  }
  if (b.particles) { ctx.fillStyle = col; ctx.globalAlpha = a; const n = Math.max(4, r * .7 | 0); for (let i = 0; i < n; i++) { const t = Math.random() * 6.283, rr = r * Math.sqrt(Math.random()), z = Math.random() * 1.6 + .6; ctx.fillRect(x + Math.cos(t) * rr, y + Math.sin(t) * rr, z, z); } return; }
  const st = getStamp(col, b, b.grain ? (Math.random() * 3 | 0) : 0); ctx.globalAlpha = a;
  const rmode = b.rot || (b.rotRand || b.star ? 'random' : null) || (b.shape ? 'random' : null);
  if (b.flat || rmode) { ctx.save(); ctx.translate(x, y); ctx.rotate(rmode === 'random' || rmode === 'follow' ? ang : rmode === 'fixed' ? (b.angle || 0) * Math.PI / 180 : (b.angle || 0) * Math.PI / 180); if (b.flat) ctx.scale(1, b.flat); ctx.drawImage(st, -r, -r, r * 2, r * 2); ctx.restore(); }
  else ctx.drawImage(st, x - r, y - r, r * 2, r * 2);
}
function brushFor(tool) { const c = S.cfg[tool]; if (tool === 'brush' || tool === 'eraser') return BR[c.id] || BRUSHES[0]; if (tool === 'shape') return { id: 'shape', hard: 1 }; return { id: tool, hard: .3 }; }
function toolSize(tool = S.tool) { const c = S.cfg[tool]; if (!c) return 10; if (tool === 'brush' || tool === 'eraser') { const b = BR[c.id]; return c.sizes[c.id] ?? b.size; } return c.size; }
function setToolSize(v, tool = S.tool) { const c = S.cfg[tool]; if (!c) return; const b = (tool === 'brush' || tool === 'eraser') && BR[c.id]; v = b && b.pixel ? Math.round(clamp(v, 1, 64)) : clamp(v, .5, 1000); if (b) c.sizes[c.id] = v; else c.size = v; }
function toolOp(tool = S.tool) { const c = S.cfg[tool]; return c ? c.op : 1; }

/* ---------- operaciones ---------- */
let op = null;
function bboxAdd(bb, x, y, r) { if (x - r < bb[0]) bb[0] = x - r; if (y - r < bb[1]) bb[1] = y - r; if (x + r > bb[2]) bb[2] = x + r; if (y + r > bb[3]) bb[3] = y + r; }
function canEdit() { const l = AL(); if (fold(l) && fold(l).visible === false) { UI.toast('La carpeta está oculta'); return false; } if (l.locked) { UI.toast('La capa está bloqueada'); return false; } if (l.frames) { UI.toast('Es una capa de marcos: rasterízala o crea otra capa para dibujar'); return false; } if (!l.visible) { UI.toast('La capa está oculta'); return false; } return true; }

function startStroke(p, tool, extra = {}) {
  ensureTmp(); const b = extra.brush || brushFor(tool), size = extra.size ?? toolSize(tool);
  op = { kind: extra.kind || 'stroke', live: true, tool, b, size, opacity: extra.opacity ?? toolOp(tool), erase: tool === 'eraser' || extra.erase, col: extra.col || (tool === 'eraser' || extra.erase || extra.kind === 'repair' ? '#000' : colStr()),
    sm: { x: p.x, y: p.y, pr: p.pr }, last: null, since: 0, dist: 0, bb: [1e9, 1e9, -1e9, -1e9], dabs: [], start: { x: p.x, y: p.y }, noClip: !!extra.noClip };
  sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.globalAlpha = 1; sctx.globalCompositeOperation = 'source-over'; sctx.clearRect(0, 0, doc.w, doc.h);
  addStroke(p);
}
function rulerProject(p) { return RULER.project(p, op.start); }
function addStroke(p) {
  if (S.ruler.mode !== 'off' && !S.bgx) p = { ...rulerProject(p), pr: p.pr };
  const k = S.ruler.mode !== 'off' ? 1 : 1 - clamp(S.stab, 0, 10) * .075;
  const sm = op.sm; sm.x += (p.x - sm.x) * k; sm.y += (p.y - sm.y) * k; sm.pr += (p.pr - sm.pr) * Math.min(1, k + .2);
  const cur = { x: sm.x, y: sm.y, pr: sm.pr };
  if (!op.last) { dabAt(cur); op.last = cur; op.pts = [cur]; op.m = cur; requestRender(); return; }
  const pl = op.pts[op.pts.length - 1]; if (Math.hypot(cur.x - pl.x, cur.y - pl.y) < .3) return;
  op.pts.push(cur); if (op.pts.length > 3) op.pts.shift();
  if (op.pts.length < 2 || S.ruler.mode !== 'off' || op.b.pixel) { walkLine(op.last, cur); return; }
  // curva suave: cuadrática desde el punto medio anterior hasta el nuevo punto medio, con el punto intermedio como control
  const c = op.pts[op.pts.length - 2], m1 = { x: (c.x + cur.x) / 2, y: (c.y + cur.y) / 2, pr: (c.pr + cur.pr) / 2 }, m0 = op.m;
  const len = Math.hypot(c.x - m0.x, c.y - m0.y) + Math.hypot(m1.x - c.x, m1.y - c.y), n = Math.max(2, Math.ceil(len / 1.5));
  let prev = m0; for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; const q = { x: u * u * m0.x + 2 * u * t * c.x + t * t * m1.x, y: u * u * m0.y + 2 * u * t * c.y + t * t * m1.y, pr: u * u * m0.pr + 2 * u * t * c.pr + t * t * m1.pr }; walkLine(prev, q, true); prev = q; }
  op.m = m1; requestRender();
}
/* coloca toques a lo largo de un segmento respetando el espaciado */
function walkLine(a, cur, quiet) {
  const dx = cur.x - a.x, dy = cur.y - a.y, d = Math.hypot(dx, dy); if (d < .001) return;
  const b = op.b; let rem = d, t = 0;
  const spacing = () => Math.max(b.pixel ? .5 : .4, op.size * (b.spacing || .08) * (b.pixel ? 1 : Math.max(.25, radiusF(cur.pr))));
  let next = spacing() - op.since;
  while (next <= rem) { t += next; rem -= next; const f = t / d; const q = { x: a.x + dx * f, y: a.y + dy * f, pr: a.pr + (cur.pr - a.pr) * f }; op.dist += next; dabAt(q); op.since = 0; next = spacing(); }
  op.since += rem; op.dist += rem; op.last = cur; if (!quiet) requestRender();
}
function finishCurve() { if (op && op.pts && op.pts.length >= 2 && op.m && !op.b.pixel && S.ruler.mode === 'off') { const e = op.pts[op.pts.length - 1]; walkLine(op.m, e); } }
function radiusF(pr) { const b = op.b; return 1 - (b.psize || 0) + (b.psize || 0) * pr; }
function taperStart(dist) { let f = 1; if (op.b.taper) f = Math.min(f, .15 + dist / (op.size * 3)); if (S.taper.on && !op.b.pixel && op.kind === 'stroke') f = Math.min(f, .08 + dist / Math.max(1, S.taper.start * op.size * 12)); return Math.min(1, f); }
function dabAt(q) {
  const b = op.b; let r = op.size / 2 * radiusF(q.pr); const base = r; r *= taperStart(op.dist);
  if (b.jitterSize) r *= 1 - Math.random() * b.jitterSize;
  let a = (b.flow ?? 1) * (1 - (b.popac || 0) + (b.popac || 0) * q.pr);
  let x = q.x, y = q.y; if (b.scatter) { const t = Math.random() * 6.28, s = Math.random() * b.scatter * op.size * 2; x += Math.cos(t) * s; y += Math.sin(t) * s; }
  let ang = op.ang || 0; if (op.pq) { const dx = q.x - op.pq.x, dy = q.y - op.pq.y; if (dx * dx + dy * dy > .01) ang = op.ang = Math.atan2(dy, dx); } op.pq = { x: q.x, y: q.y };
  if (b.rot === 'random' || b.rotRand || b.star || (b.shape && !b.rot)) ang = Math.random() * 6.283;
  op.dabs.push([x, y, base, a, op.dist, ang]);
  if (op.kind === 'smudge' || op.kind === 'blur') { directDab(x, y, Math.max(1, r)); bboxAdd(op.bb, x, y, r * 1.5 + 2); return; }
  for (const [sx, sy] of symPoints(x, y)) { dabRaw(sctx, sx, sy, Math.max(b.pixel ? .5 : .3, r), a, b, op.col, ang); bboxAdd(op.bb, sx, sy, r * 1.5 + 3); }
}
function redrawWithTaper() {
  const total = op.dist, endLen = Math.max(1, S.taper.end * op.size * 12);
  sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.globalAlpha = 1; sctx.clearRect(0, 0, doc.w, doc.h);
  for (const [x, y, base, a, dist, ang] of op.dabs) { let r = base * taperStart(dist); r *= Math.min(1, .08 + (total - dist) / endLen); for (const [sx, sy] of symPoints(x, y)) dabRaw(sctx, sx, sy, Math.max(.3, r), a, op.b, op.col, ang); }
}
/* difuminar / desenfocar directamente sobre la capa */
let smBuf, smDab;
function directDab(x, y, r) {
  const l = AL(), d = Math.max(2, Math.ceil(r * 2)), x0 = x - d / 2, y0 = y - d / 2;
  if (!smBuf || smBuf.width < d) { smBuf = mkCanvas(d, d); smDab = mkCanvas(d, d); }
  const bx = smBuf.getContext('2d'), dx = smDab.getContext('2d');
  const mask = getStamp('#ffffff', { id: 'softmask', hard: .3 });
  if (op.kind === 'smudge') {
    if (!op.carry) { bx.clearRect(0, 0, smBuf.width, smBuf.height); bx.globalAlpha = 1; bx.drawImage(l.canvas, x0, y0, d, d, 0, 0, d, d); op.carry = true; return; }
    dx.globalCompositeOperation = 'source-over'; dx.globalAlpha = 1; dx.clearRect(0, 0, smDab.width, smDab.height); dx.drawImage(smBuf, 0, 0, d, d, 0, 0, d, d);
    dx.globalCompositeOperation = 'destination-in'; dx.drawImage(mask, 0, 0, d, d); dx.globalCompositeOperation = 'source-over';
    l.ctx.globalAlpha = op.opacity; l.ctx.globalCompositeOperation = l.alphaLock ? 'source-atop' : 'source-over'; l.ctx.drawImage(smDab, 0, 0, d, d, x0, y0, d, d); l.ctx.globalAlpha = 1; l.ctx.globalCompositeOperation = 'source-over';
    bx.globalAlpha = .28; bx.drawImage(l.canvas, x0, y0, d, d, 0, 0, d, d); bx.globalAlpha = 1;
  } else {
    const sm = Math.max(1, Math.round(d / 6)); dx.globalCompositeOperation = 'source-over'; dx.globalAlpha = 1; dx.clearRect(0, 0, smDab.width, smDab.height);
    bx.clearRect(0, 0, smBuf.width, smBuf.height); bx.imageSmoothingEnabled = true; bx.drawImage(l.canvas, x0 - d / 2, y0 - d / 2, d * 2, d * 2, 0, 0, sm * 2, sm * 2);
    dx.imageSmoothingEnabled = true; dx.drawImage(smBuf, 0, 0, sm * 2, sm * 2, -d / 2, -d / 2, d * 2, d * 2);
    dx.globalCompositeOperation = 'destination-in'; dx.drawImage(mask, 0, 0, d, d); dx.globalCompositeOperation = 'source-over';
    l.ctx.globalAlpha = op.opacity * .5; l.ctx.drawImage(smDab, 0, 0, d, d, x0, y0, d, d); l.ctx.globalAlpha = 1;
  }
  l.ver++;
}
function commitStroke() {
  const l = AL(); if (op.kind === 'stroke' && S.taper.on && !op.b.pixel && op.dabs.length > 2) redrawWithTaper();
  const bb = op.bb; if (bb[0] > bb[2]) { op = null; return; }
  const e = capPx(l, bb[0], bb[1], bb[2] - bb[0], bb[3] - bb[1]);
  if (op.kind === 'repair') { const t = tmp2, x = t2ctx; x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, doc.w, doc.h); x.drawImage(S.bgx.orig, 0, 0); x.globalCompositeOperation = 'destination-in'; x.drawImage(sCanvas, 0, 0); x.globalCompositeOperation = 'source-over'; l.ctx.drawImage(t, 0, 0); }
  else {
    let src = sCanvas; if (S.sel && !op.noClip) { sctx.globalCompositeOperation = 'destination-in'; sctx.globalAlpha = 1; sctx.drawImage(S.sel.mask, 0, 0); sctx.globalCompositeOperation = 'source-over'; }
    l.ctx.globalAlpha = op.opacity; l.ctx.globalCompositeOperation = op.erase ? 'destination-out' : (l.alphaLock ? 'source-atop' : 'source-over'); l.ctx.drawImage(src, 0, 0); l.ctx.globalAlpha = 1; l.ctx.globalCompositeOperation = 'source-over';
  }
  pushUndo(e); if (op.tool === 'brush') UI.addRecent && UI.addRecent(S.color);
  op = null; l.ver++; changed();
}
function commitDirect() { const l = AL(), bb = op.bb; if (bb[0] <= bb[2]) { const x = Math.max(0, Math.floor(bb[0])), y = Math.max(0, Math.floor(bb[1])), w = Math.min(doc.w - x, Math.ceil(bb[2] - x)), h = Math.min(doc.h - y, Math.ceil(bb[3] - y)); if (w > 0 && h > 0) pushUndo(pxEntry(l, x, y, w, h, cropCanvas(op.backup, x, y, w, h))); } op = null; changed(); }
function cancelOp() {
  if (!op) return;
  if ((op.kind === 'smudge' || op.kind === 'blur' || op.kind === 'move') && op.backup) { const l = op.layer || AL(); l.ctx.clearRect(0, 0, doc.w, doc.h); l.ctx.drawImage(op.backup, 0, 0); l.ver++; }
  op = null; requestRender();
}

/* figuras */
function shapeDraw(a, b2, shift) {
  sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.clearRect(0, 0, doc.w, doc.h); sctx.globalAlpha = 1;
  sctx.strokeStyle = sctx.fillStyle = op.col; sctx.lineWidth = op.size; sctx.lineCap = 'round'; sctx.lineJoin = 'round';
  let x0 = a.x, y0 = a.y, x1 = b2.x, y1 = b2.y;
  if (shift && S.shape !== 'line') { const s = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); x1 = x0 + Math.sign(x1 - x0 || 1) * s; y1 = y0 + Math.sign(y1 - y0 || 1) * s; }
  if (shift && S.shape === 'line') { const ang = Math.round(Math.atan2(y1 - y0, x1 - x0) / (Math.PI / 4)) * Math.PI / 4, len = Math.hypot(x1 - x0, y1 - y0); x1 = x0 + Math.cos(ang) * len; y1 = y0 + Math.sin(ang) * len; }
  const paths = [];
  for (const [sx0, sy0] of symPoints(x0, y0)) paths.push(sx0); // no-op para mantener simetría simple abajo
  const draw = (X0, Y0, X1, Y1) => {
    sctx.beginPath();
    if (S.shape === 'line') { sctx.moveTo(X0, Y0); sctx.lineTo(X1, Y1); sctx.stroke(); return; }
    if (S.shape === 'rect') sctx.rect(Math.min(X0, X1), Math.min(Y0, Y1), Math.abs(X1 - X0), Math.abs(Y1 - Y0));
    else if (S.shape === 'ellipse') sctx.ellipse((X0 + X1) / 2, (Y0 + Y1) / 2, Math.abs(X1 - X0) / 2, Math.abs(Y1 - Y0) / 2, 0, 0, 7);
    else if (S.shape === 'poly') { const cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2, rx = Math.abs(X1 - X0) / 2, ry = Math.abs(Y1 - Y0) / 2; for (let i = 0; i < 6; i++) { const t = i * Math.PI / 3 - Math.PI / 2; sctx.lineTo(cx + Math.cos(t) * rx, cy + Math.sin(t) * ry); } sctx.closePath(); }
    else if (S.shape === 'star') { const cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2, rx = Math.abs(X1 - X0) / 2, ry = Math.abs(Y1 - Y0) / 2; for (let i = 0; i < 10; i++) { const k = i % 2 ? .45 : 1, t = i * Math.PI / 5 - Math.PI / 2; sctx.lineTo(cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k); } sctx.closePath(); }
    else if (S.shape === 'bubble') { const cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2, rx = Math.abs(X1 - X0) / 2, ry = Math.abs(Y1 - Y0) / 2; sctx.ellipse(cx, cy, rx, ry * .82, 0, .35 * Math.PI, .25 * Math.PI + 2 * Math.PI); sctx.lineTo(cx - rx * .55, cy + ry); sctx.closePath(); }
    if (S.shapeFill) sctx.fill(); else sctx.stroke();
  };
  const m = S.sym.mode;
  if (m === 'off') draw(x0, y0, x1, y1);
  else { const p0 = symPoints(x0, y0), p1 = symPoints(x1, y1); p0.forEach((p, i) => draw(p[0], p[1], p1[i][0], p1[i][1])); }
  op.bb = [0, 0, doc.w, doc.h];
}

/* relleno */
function floodMask(data, w, h, sx, sy, tol) {
  const i0 = (sy * w + sx) * 4, r0 = data[i0], g0 = data[i0 + 1], b0 = data[i0 + 2], a0 = data[i0 + 3];
  const mask = new Uint8Array(w * h);
  const match = i => { const j = i * 4, a = data[j + 3]; if (a0 < 10 && a < 10) return true; return Math.abs(data[j] - r0) <= tol && Math.abs(data[j + 1] - g0) <= tol && Math.abs(data[j + 2] - b0) <= tol && Math.abs(a - a0) <= tol; };
  const st = [sx, sy];
  while (st.length) {
    const y = st.pop(); let x = st.pop(); let i = y * w + x;
    while (x >= 0 && !mask[i] && match(i)) { x--; i--; } x++; i++;
    let up = false, dn = false;
    while (x < w && !mask[i] && match(i)) {
      mask[i] = 1;
      if (y > 0) { const k = i - w; if (!mask[k] && match(k)) { if (!up) { st.push(x, y - 1); up = true; } } else up = false; }
      if (y < h - 1) { const k = i + w; if (!mask[k] && match(k)) { if (!dn) { st.push(x, y + 1); dn = true; } } else dn = false; }
      x++; i++;
    }
  }
  return mask;
}
function growMask(m, w, h, n) { for (let k = 0; k < n; k++) { const o = m.slice(); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (m[i]) continue; if ((x > 0 && m[i - 1]) || (x < w - 1 && m[i + 1]) || (y > 0 && m[i - w]) || (y < h - 1 && m[i + w])) o[i] = 1; } m.set(o); } return m; }
function refData(all) { const c = cached('refd'), x = c.getContext('2d'); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, doc.w, doc.h); if (all) drawLayers(x, L(), {}); else x.drawImage(AL().canvas, 0, 0); return x.getImageData(0, 0, doc.w, doc.h).data; }
function maskToCanvas(mask, col, out) { const c = out || mkCanvas(doc.w, doc.h), x = c.getContext('2d'), id = x.createImageData(doc.w, doc.h), d = id.data; const [r, g, b] = col; for (let i = 0; i < mask.length; i++) if (mask[i]) { const j = i * 4; d[j] = r; d[j + 1] = g; d[j + 2] = b; d[j + 3] = mask[i] === 1 ? 255 : mask[i]; } x.putImageData(id, 0, 0); return c; }
function doFill(p) {
  const x = Math.floor(p.x), y = Math.floor(p.y); if (x < 0 || y < 0 || x >= doc.w || y >= doc.h) return; if (!canEdit()) return;
  const data = refData(S.fillAll), mask = floodMask(data, doc.w, doc.h, x, y, S.fillTol); if (S.fillGrow) growMask(mask, doc.w, doc.h, S.fillGrow);
  const l = AL(), e = capPx(l); const c = maskToCanvas(mask, S.color);
  if (S.sel) { const cx = c.getContext('2d'); cx.globalCompositeOperation = 'destination-in'; cx.drawImage(S.sel.mask, 0, 0); }
  l.ctx.globalAlpha = toolOp('fill'); l.ctx.globalCompositeOperation = l.alphaLock ? 'source-atop' : 'source-over'; l.ctx.drawImage(c, 0, 0); l.ctx.globalAlpha = 1; l.ctx.globalCompositeOperation = 'source-over';
  pushUndo(e); l.ver++; UI.addRecent && UI.addRecent(S.color); changed();
}
function sampleAt(p, all = true) {
  const x = Math.floor(p.x), y = Math.floor(p.y); if (x < 0 || y < 0 || x >= doc.w || y >= doc.h) return null;
  const c = mkCanvas(1, 1), cx = c.getContext('2d');
  if (doc.bg !== 'transparent') { cx.fillStyle = doc.bg === 'black' ? '#000' : '#fff'; cx.fillRect(0, 0, 1, 1); }
  cx.translate(-x, -y); if (all) drawLayers(cx, L(), {}); else cx.drawImage(AL().canvas, 0, 0);
  const d = cx.getImageData(0, 0, 1, 1).data; if (d[3] < 5) return null; return [d[0], d[1], d[2]];
}
function setColor(rgb, keepHue) { S.color = rgb.slice(0, 3); const h = rgb2hsv(...S.color); if (keepHue && (h[1] === 0 || h[2] === 0)) h[0] = S.hsv[0]; if (h[2] === 0) h[1] = S.hsv[1]; S.hsv = h; UI.onColor && UI.onColor(); }

/* ---------- entrada ---------- */
const ptrs = new Map(); let gest = null, penSeen = false, lpTimer = 0, spaceDown = false;
let _vr = null; function viewRect() { return _vr || (_vr = view.getBoundingClientRect()); } addEventListener('resize', () => _vr = null); addEventListener('scroll', () => _vr = null, true);
function evPt(e) { const r = viewRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top }; }
function pressure(e) { if (e.pointerType === 'pen') return clamp(e.pressure || .5, .02, 1); return 1; }
function bgxOffset(e, s) { if (S.bgx && e.pointerType === 'touch' && ['manual', 'repair'].includes(S.bgx.mode)) return { sx: s.sx, sy: s.sy - S.bgx.offset }; return s; }
function onDown(e) {
  if (e.button === 2) return;
  if (e.pointerType === 'pen') penSeen = true;
  try { view.setPointerCapture(e.pointerId); } catch { }
  const s = evPt(e); ptrs.set(e.pointerId, { ...s, x0: s.sx, y0: s.sy, type: e.pointerType, t0: performance.now() });
  hover.on = true; hover.x = s.sx; hover.y = s.sy; hover.type = e.pointerType;
  if (S.playing) return;
  const touches = [...ptrs.values()].filter(p => p.type === 'touch');
  if (e.pointerType === 'touch' && (touches.length > 1 || (penSeen && !S.bgx))) {
    if (op && op.pid !== undefined) { clearTimeout(lpTimer); if (op.kind === 'text') { TXT.up(); op = null; } else if (op.kind === 'ruler' || op.kind === 'pan' || op.kind === 'tap') op = null; else cancelOp(); }
    startGesture(); return;
  }
  if (gest) return;
  if (e.button === 1 || spaceDown || S.tool === 'hand' || (S.bgx && S.bgx.mode === 'zoom')) { op = { kind: 'pan', pid: e.pointerId, sx: s.sx, sy: s.sy, vx: V.x, vy: V.y, t0: performance.now() }; return; }
  const p0 = bgxOffset(e, s); const p = toDoc(p0.sx, p0.sy); p.pr = pressure(e);
  // asas de regla / texto
  if (S.balloon) { if (BAL.down(p, s)) op = { kind: 'bal', pid: e.pointerId, t0: performance.now() }; return; }
  if (S.imgObj) { if (IMGF.down(p, s)) op = { kind: 'imgf', pid: e.pointerId, t0: performance.now() }; return; }
  if (S.textObj && TXT.down(p, s, e)) { op = { kind: 'text', pid: e.pointerId, t0: performance.now() }; return; }
  if (S.textObj) { TXT.commit(); return; }
  if (S.ruler.mode !== 'off' && RULER.hit(s)) { op = { kind: 'ruler', pid: e.pointerId, t0: performance.now() }; return; }
  if (S.fx) { if (S.fx.wantPoint) FX.setPoint(p); return; }
  startToolOp(e, p, s);
}
function startToolOp(e, p, s) {
  const t = S.bgx ? 'bgx' : S.tool, base = { pid: e.pointerId, t0: performance.now(), sx0: s.sx, sy0: s.sy };
  if (t === 'bgx') {
    const m = S.bgx.mode;
    if (m === 'manual') { startStroke(p, 'eraser', { brush: { id: 'bgx', hard: S.bgx.hard }, size: S.bgx.size, opacity: 1, erase: true, noClip: true }); Object.assign(op, base); }
    else if (m === 'repair') { startStroke(p, 'eraser', { brush: { id: 'bgx', hard: .6 }, size: S.bgx.size, opacity: 1, kind: 'repair', noClip: true }); Object.assign(op, base); }
    else op = { kind: 'tap', ...base, p, fn: () => BGX.tap(p) };
    S.bgx.cursor = { x: s.sx, y: s.sy - (e.pointerType === 'touch' && (m === 'manual' || m === 'repair') ? S.bgx.offset : 0), fx: e.pointerType === 'touch' ? s.sx : undefined, fy: s.sy };
    return;
  }
  if (S.frameTool) { op = { kind: 'framecut', ...base, a: p, b: p }; return; }
  if (t === 'brush' || t === 'eraser') {
    if (!canEdit()) return; startStroke(p, t); Object.assign(op, base);
    clearTimeout(lpTimer); if (t === 'brush') lpTimer = setTimeout(() => { if (op && op.kind === 'stroke' && op.pid === base.pid && Math.hypot(op.lsx - op.sx0, op.lsy - op.sy0) < 8) { op = { kind: 'pick', ...base, scr: { x: op.lsx, y: op.lsy } }; pickMove(op.scr); requestRender(); } }, 520);
    op.lsx = s.sx; op.lsy = s.sy; return;
  }
  if (t === 'smudge' || t === 'blur') { if (!canEdit()) return; ensureTmp(); const l = AL(); op = { kind: t, live: false, ...base, layer: l, backup: cloneCanvas(l.canvas), b: { id: t, spacing: .12 }, size: toolSize(t), opacity: toolOp(t), sm: { x: p.x, y: p.y, pr: p.pr }, last: null, since: 0, dist: 0, bb: [1e9, 1e9, -1e9, -1e9], dabs: [], start: p }; addStroke(p); return; }
  if (t === 'shape') { if (!canEdit()) return; ensureTmp(); op = { kind: 'shape', live: true, ...base, a: p, opacity: toolOp('shape'), size: toolSize('shape'), col: colStr(), bb: [0, 0, 0, 0] }; shapeDraw(p, p, e.shiftKey); requestRender(); return; }
  if (t === 'move') { const l = AL(); if (l.locked) { UI.toast('La capa está bloqueada'); return; } op = { kind: 'move', ...base, layer: l, backup: cloneCanvas(l.canvas), a: p }; return; }
  if (t === 'picker') { op = { kind: 'pick', ...base, scr: { x: s.sx, y: s.sy } }; pickMove(op.scr); return; }
  if (t === 'fill') { op = { kind: 'tap', ...base, fn: () => doFill(p) }; return; }
  if (t === 'text') { op = { kind: 'tap', ...base, fn: () => TXT.create(p) }; return; }
  if (t === 'select') {
    if (S.selMode === 'wand') { op = { kind: 'tap', ...base, fn: () => SEL.wand(p, e.shiftKey) }; return; }
    op = { kind: 'selpath', ...base, mode: S.selMode, pts: [p], a: p, add: e.shiftKey }; return;
  }
}
function pickMove(scr) { const p = toDoc(scr.x, scr.y); const c = sampleAt(p); if (c) { op.col = c; } op.scr = scr; requestRender(); }
function onMove(e) {
  const s = evPt(e); const pp = ptrs.get(e.pointerId);
  if (pp) { pp.sx = s.sx; pp.sy = s.sy; }
  if (e.pointerType !== 'touch' || pp) { hover.on = true; hover.x = s.sx; hover.y = s.sy; hover.type = e.pointerType; if (!op) requestRender(); }
  if (S.bgx && pp) { const m = S.bgx.mode; S.bgx.cursor = { x: s.sx, y: s.sy - (e.pointerType === 'touch' && (m === 'manual' || m === 'repair') ? S.bgx.offset : 0), fx: e.pointerType === 'touch' ? s.sx : undefined, fy: s.sy }; requestRender(); }
  if (gest) { moveGesture(); return; }
  if (!op || op.pid !== e.pointerId) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; const list = evs.length ? evs : [e];
  if (op.kind === 'pan') { V.x = op.vx + s.sx - op.sx; V.y = op.vy + s.sy - op.sy; requestRender(); return; }
  if (op.kind === 'pick') { pickMove({ x: s.sx, y: s.sy }); return; }
  if (op.kind === 'text') { TXT.move(toDoc(s.sx, s.sy), s); return; }
  if (op.kind === 'imgf') { IMGF.move(toDoc(s.sx, s.sy)); return; }
  if (op.kind === 'bal') { BAL.move(toDoc(s.sx, s.sy)); return; }
  if (op.kind === 'ruler') { RULER.drag(toDoc(s.sx, s.sy)); return; }
  if (op.kind === 'tap') { if (Math.hypot(s.sx - op.sx0, s.sy - op.sy0) > 12) op.moved = true; return; }
  if (op.kind === 'framecut') { op.b = toDoc(s.sx, s.sy); requestRender(); return; }
  if (op.kind === 'selpath') { const p = toDoc(s.sx, s.sy); if (op.mode === 'rect') { op.pts = [op.a, { x: p.x, y: op.a.y }, p, { x: op.a.x, y: p.y }]; } else op.pts.push(p); requestRender(); return; }
  if (op.kind === 'shape') { shapeDraw(op.a, toDoc(s.sx, s.sy), e.shiftKey); requestRender(); return; }
  if (op.kind === 'move') { const p = toDoc(s.sx, s.sy), l = op.layer; let dx = p.x - op.a.x, dy = p.y - op.a.y; if (!doc.pixel) { dx = Math.round(dx); dy = Math.round(dy); } else { dx = Math.round(dx); dy = Math.round(dy); } l.ctx.clearRect(0, 0, doc.w, doc.h); l.ctx.drawImage(op.backup, dx, dy); l.ver++; requestRender(); return; }
  if (op.kind === 'stroke' || op.kind === 'repair' || op.kind === 'smudge' || op.kind === 'blur') {
    op.lsx = s.sx; op.lsy = s.sy;
    for (const ce of list) { const cs = bgxOffset(e, evPt(ce)); const p = toDoc(cs.sx, cs.sy); p.pr = pressure(ce); addStroke(p); }
  }
}
function onUp(e) {
  const pp = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); if (e.pointerType === 'touch') { hover.on = false; requestRender(); }
  if (S.bgx) { S.bgx.cursor = null; requestRender(); }
  if (gest) { if (![...ptrs.values()].some(p => p.type === 'touch')) endGesture(); return; }
  if (!op || op.pid !== e.pointerId) return; clearTimeout(lpTimer);
  const k = op.kind;
  if (e.type === 'pointercancel' && k !== 'pan') { cancelOp(); return; }
  if (k === 'pan') op = null;
  else if (k === 'stroke' || k === 'repair') { finishCurve(); commitStroke(); }
  else if (k === 'smudge' || k === 'blur') { finishCurve(); commitDirect(); }
  else if (k === 'shape') { op.bb = [0, 0, doc.w, doc.h]; op.b = { pixel: false }; op.dabs = []; op.tool = 'shape'; commitStroke(); }
  else if (k === 'move') { const l = op.layer; pushUndo(pxEntry(l, 0, 0, doc.w, doc.h, op.backup)); op = null; changed(); }
  else if (k === 'pick') { if (op.col) { setColor(op.col); UI.addRecent && UI.addRecent(op.col); } op = null; if (S.tool === 'picker' && S.prevTool && S.prevTool !== 'picker') UI.setTool(S.prevTool); requestRender(); }
  else if (k === 'tap') { const f = op.fn, mv = op.moved; op = null; if (!mv) f(); }
  else if (k === 'text') { TXT.up(); op = null; }
  else if (k === 'imgf' || k === 'bal') { op = null; }
  else if (k === 'ruler') { op = null; }
  else if (k === 'selpath') { const o = op; op = null; SEL.fromPts(o); }
  else if (k === 'framecut') { const o = op; op = null; FRAMES.cut(o.a, o.b, Math.hypot(o.b.x - o.a.x, o.b.y - o.a.y) * V.s < 10); }
  requestRender();
}
function touchList() { return [...ptrs.values()].filter(p => p.type === 'touch'); }
function startGesture() { gest = { max: touchList().length, t0: performance.now(), moved: 0, n: 0 }; moveGesture(); }
function tAngle(t) { return t.length > 1 ? Math.atan2(t[1].sy - t[0].sy, t[1].sx - t[0].sx) : 0; }
function centroid(t) { let x = 0, y = 0; t.forEach(p => { x += p.sx; y += p.sy; }); return { x: x / t.length, y: y / t.length }; }
function spread(t) { if (t.length < 2) return 0; const c = centroid(t); return t.reduce((a, p) => a + Math.hypot(p.sx - c.x, p.sy - c.y), 0) / t.length; }
function moveGesture() {
  const t = touchList(); if (!t.length) return; gest.max = Math.max(gest.max, t.length);
  if (t.length !== gest.n) { gest.n = t.length; const c = centroid(t); gest.c0 = c; gest.d0 = Math.max(spread(t), 1); gest.s0 = V.s; gest.r0 = V.r; gest.a0 = tAngle(t); gest.rotOn = false; gest.p = toDoc(c.x, c.y); }
  const c = centroid(t), d = spread(t);
  let s = t.length > 1 ? clamp(gest.s0 * d / gest.d0, .05, 64) : gest.s0, r = gest.r0;
  if (t.length > 1 && S.rotGesture !== false) { let da = tAngle(t) - gest.a0; da = Math.atan2(Math.sin(da), Math.cos(da)); if (!gest.rotOn && Math.abs(da) > .12) { gest.rotOn = true; gest.a0 += da; da = 0; } if (gest.rotOn) { r = gest.r0 + da; const q = Math.PI / 2, m = Math.round(r / q) * q; if (Math.abs(r - m) < .06) r = m; } }
  gest.moved = Math.max(gest.moved, Math.hypot(c.x - gest.c0.x, c.y - gest.c0.y), Math.abs(d - gest.d0), gest.rotOn ? 99 : 0);
  V.s = s; V.r = r; const q = toScr(gest.p.x, gest.p.y); V.x += c.x - q.x; V.y += c.y - q.y; requestRender(); UI.updZoom && UI.updZoom(); UI.updRot && UI.updRot();
}
function endGesture() {
  const g = gest; gest = null; if (!g) return;
  if (performance.now() - g.t0 < 320 && g.moved < 14) { if (g.max === 2) undo(); else if (g.max >= 3) redo(); }
}
function onWheel(e) {
  e.preventDefault(); const s = evPt(e);
  const mouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
  if (e.altKey) { rotateView(V.r + Math.sign(e.deltaY) * Math.PI / 24, s.sx, s.sy); return; }
  if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * .01), s.sx, s.sy);
  else if (e.shiftKey) { V.x -= e.deltaY || e.deltaX; requestRender(); }
  else if (mouseWheel) zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? .05 : .0015)), s.sx, s.sy);
  else { V.x -= e.deltaX; V.y -= e.deltaY; requestRender(); }
}
function initInput() {
  view.addEventListener('pointerdown', onDown);
  view.addEventListener('pointermove', onMove);
  view.addEventListener('pointerup', onUp); view.addEventListener('pointercancel', onUp);
  view.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch' && !ptrs.size) { hover.on = false; requestRender(); } });
  view.addEventListener('wheel', onWheel, { passive: false });
  view.addEventListener('contextmenu', e => e.preventDefault());
}
