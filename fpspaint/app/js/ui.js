'use strict';
/* Interfaz de FPSpaint: galería, editor, paneles y hojas */
const TOOLS = [
  ['brush', 'Pincel', 'brush', 'B'], ['eraser', 'Borrador', 'eraser', 'E'], ['smudge', 'Difuminar', 'smudge', 'S'], ['blur', 'Desenfocar', 'blur', 'R'],
  ['fill', 'Relleno', 'fill', 'G'], ['picker', 'Gotero', 'picker', 'I'], ['shape', 'Figuras', 'shape', 'U'], ['text', 'Texto', 'text', 'T'],
  ['select', 'Selección', 'select', 'M'], ['move', 'Mover capa', 'move', 'V'], ['hand', 'Mano', 'hand', 'H'], ['frame', 'Marcos', 'frame', 'K']];
const SHAPES = [['line', 'Línea'], ['rect', 'Rectángulo'], ['ellipse', 'Elipse'], ['poly', 'Hexágono'], ['star', 'Estrella'], ['bubble', 'Globo de diálogo']];
const isFrame = () => window.self !== window.top;

/* ---------- utilidades de interfaz ---------- */
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function Slider(o) {
  const e = el(`<div class="sl ${o.vertical ? 'v' : ''} ${o.cls || ''}"><div class="tr"><div class="fl"></div></div><div class="kn"></div></div>`);
  const tr = e.querySelector('.tr'), fl = e.querySelector('.fl'), kn = e.querySelector('.kn');
  const toT = o.toT || (v => (v - o.min) / (o.max - o.min)), fromT = o.fromT || (t => o.min + t * (o.max - o.min));
  let val = o.value;
  const paint = () => { const t = clamp(toT(val), 0, 1); if (o.vertical) { kn.style.top = `calc(12px + (100% - 24px) * ${1 - t})`; fl.style.height = t * 100 + '%'; } else { kn.style.left = `calc(12px + (100% - 24px) * ${t})`; fl.style.width = t * 100 + '%'; } };
  const fromEv = ev => { const r = e.getBoundingClientRect(); let t = o.vertical ? 1 - (ev.clientY - r.top - 12) / (r.height - 24) : (ev.clientX - r.left - 12) / (r.width - 24); t = clamp(t, 0, 1); let v = fromT(t); if (o.step) v = Math.round(v / o.step) * o.step; return clamp(v, o.min, o.max); };
  e.addEventListener('pointerdown', ev => { ev.preventDefault(); e.setPointerCapture(ev.pointerId); val = fromEv(ev); paint(); o.onInput && o.onInput(val); const mv = ev2 => { val = fromEv(ev2); paint(); o.onInput && o.onInput(val); }; const up = () => { e.removeEventListener('pointermove', mv); e.removeEventListener('pointerup', up); e.removeEventListener('pointercancel', up); o.onEnd && o.onEnd(val); }; e.addEventListener('pointermove', mv); e.addEventListener('pointerup', up); e.addEventListener('pointercancel', up); });
  const api = { el: e, set(v) { val = v; paint(); }, get: () => val, track: tr }; requestAnimationFrame(paint); paint(); return api;
}
function SRow(label, o) {
  const fmt = o.fmt || (v => Math.round(v) + (o.unit || '')); const w = el(`<div class="sblock"><div class="hd"><span>${esc(label)}</span><span class="v"></span></div><div class="srow"><button class="pm m">${ic('minus')}</button><div class="slw" style="flex:1;display:flex"></div><button class="pm p">${ic('plus')}</button></div></div>`);
  const vEl = w.querySelector('.v'); const s = Slider({ ...o, onInput: v => { vEl.textContent = fmt(v); o.onInput && o.onInput(v); } }); w.querySelector('.slw').appendChild(s.el); vEl.textContent = fmt(o.value);
  const bump = d => { let v = s.get(); const st = o.bump ? o.bump(v, d) : v + d * (o.step || 1); v = clamp(st, o.min, o.max); s.set(v); vEl.textContent = fmt(v); o.onInput && o.onInput(v); o.onEnd && o.onEnd(v); };
  w.querySelector('.m').onclick = () => bump(-1); w.querySelector('.p').onclick = () => bump(1);
  return { el: w, set(v) { s.set(v); vEl.textContent = fmt(v); }, slider: s };
}
function Toggle(on, onChange) { const t = el(`<button class="tog ${on ? 'on' : ''}"></button>`); t.onclick = () => { t.classList.toggle('on'); onChange(t.classList.contains('on')); }; return t; }
function Seg(opts, cur, onPick) { const s = el('<div class="seg"></div>'); for (const [v, label] of opts) { const b = el(`<button class="${v === cur ? 'on' : ''}">${label}</button>`); b.onclick = () => { $$('button', s).forEach(x => x.classList.remove('on')); b.classList.add('on'); onPick(v); }; s.appendChild(b); } return s; }
const sizeFmt = v => v < 10 ? v.toFixed(1) : Math.round(v) + '';
const SIZE_T = { toT: v => Math.pow((v - .5) / 999.5, 1 / 2.6), fromT: t => .5 + 999.5 * Math.pow(t, 2.6) };

/* ---------- objeto UI ---------- */
const UI = {
  sheetStack: [],
  toast(msg, ms = 2200) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('show'), ms); },
  isWide() { return document.body.classList.contains('wide'); },

  /* hojas */
  sheet(id, title, build, opts = {}) {
    let s = $('#sh-' + id);
    if (!s) { s = el(`<div class="sheet ${opts.dock ? 'dockb' : ''}" id="sh-${id}"><div class="grab"></div><div class="sh-head"><h3></h3><span class="extra"></span><button class="ib x">${ic(opts.okIcon || 'close')}</button></div><div class="sh-body"></div></div>`); $('#sheets').appendChild(s); s.querySelector('.x').onclick = () => opts.onOk ? opts.onOk() : this.closeSheet(id); }
    s.style.zIndex = 50 + this.sheetStack.length * 2; s.querySelector('h3').textContent = title; const body = s.querySelector('.sh-body'); body.innerHTML = ''; build(body, s);
    this.sheetStack = this.sheetStack.filter(x => x.id !== id); this.sheetStack.push({ id, opts });
    const sc = $('#scrim'); sc.classList.toggle('clear', !!opts.dock); sc.style.zIndex = 49 + (this.sheetStack.length - 1) * 2; sc.classList.add('show');
    requestAnimationFrame(() => { if (this.sheetStack.some(x => x.id === id)) s.classList.add('open'); }); return s;
  },
  closeSheet(id) {
    const top = id ? this.sheetStack.find(x => x.id === id) : this.sheetStack[this.sheetStack.length - 1]; if (!top) return;
    const s = $('#sh-' + top.id); s && s.classList.remove('open'); this.sheetStack = this.sheetStack.filter(x => x !== top);
    const sc = $('#scrim'); if (!this.sheetStack.length) sc.classList.remove('show'); else { sc.style.zIndex = 49 + (this.sheetStack.length - 1) * 2; sc.classList.toggle('clear', !!this.sheetStack[this.sheetStack.length - 1].opts.dock); }
    top.opts.onClose && top.opts.onClose();
  },
  closeAll() { while (this.sheetStack.length) this.closeSheet(); this.closePanel(); },
  dialog(title, html, buttons) { return new Promise(res => { const m = el(`<div class="modal"><div class="dlg"><h3>${esc(title)}</h3><div class="dbody">${html}</div><div class="acts"></div></div></div>`); const a = m.querySelector('.acts'); for (const [label, val, cls] of buttons) { const b = el(`<button class="btn ${cls || ''}">${label}</button>`); b.onclick = () => { m.remove(); res(typeof val === 'function' ? val(m) : val); }; a.appendChild(b); } m.addEventListener('pointerdown', e => { if (e.target === m) { m.remove(); res(null); } }); document.body.appendChild(m); const inp = m.querySelector('input'); if (inp) setTimeout(() => { inp.focus(); inp.select && inp.select(); }, 50); }); },
  confirm(title, msg, ok = 'Aceptar', dng) { return this.dialog(title, `<p>${esc(msg)}</p>`, [['Cancelar', false], [ok, true, dng ? 'dng' : 'pri']]); },
  prompt(title, val, ph = '') { return this.dialog(title, `<input class="inp" style="width:100%" value="${esc(val)}" placeholder="${esc(ph)}">`, [['Cancelar', null], ['Aceptar', m => m.querySelector('input').value, 'pri']]); },
  pickFile(accept, multiple) { return new Promise(res => { const f = $('#fileIn'); f.value = ''; f.accept = accept; f.multiple = !!multiple; f.onchange = () => res([...f.files]); f.click(); }); },
  async download(blob, name) {
    if (window.FPSAndroid) { const b64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); }); const where = FPSAndroid.save(b64, name, blob.type || 'application/octet-stream'); if (where) this.toast('Guardado en ' + where.replace('Pictures', 'Imágenes').replace('Movies', 'Películas').replace('Download', 'Descargas') + ' / ' + name, 3200); return; }
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    if (isFrame()) {
      const isImg = /^image\/(png|jpeg|gif|webp)/.test(blob.type), isVid = /^video/.test(blob.type);
      const u2 = URL.createObjectURL(blob);
      this.dialog('Guardar ' + name, (isImg ? `<img class="exp-img" src="${u2}">` : isVid ? `<video class="exp-img" src="${u2}" controls autoplay loop playsinline></video>` : '') + `<p style="margin-top:12px">Si la descarga no empezó sola, ${isImg ? '<b>mantén presionada la imagen</b> (o clic derecho) y elige “Guardar imagen”.' : 'abre FPSpaint como app (APK o programa de PC) para guardar este tipo de archivo.'}</p>`, [['Cerrar', null, 'pri']]);
    } else this.toast('Guardado: ' + name);
  },

  /* ---------- inicio ---------- */
  async init() {
    view = $('#view'); try { vctx = view.getContext('2d', { alpha: false, desynchronized: true }); } catch { } if (!vctx) vctx = view.getContext('2d');
    $('#gLogo').innerHTML = LOGO; $('#gNew').innerHTML = ic('plus'); $('#gImport').innerHTML = ic('upload') + '<span>Importar</span>'; $('#gPixel').innerHTML = ic('pixel') + '<span>Pixel art</span>'; $('#gPixel').onclick = () => this.openPixelNew();
    $('#pscrim').onclick = () => this.closePanel();
    $('#scrim').onclick = () => { const t = this.sheetStack[this.sheetStack.length - 1]; if (t && t.opts.modalLock) return; if (t) t.opts.onOk && t.opts.dock ? t.opts.onOk() : this.closeSheet(); else this.closePanel(); };
    const onResize = () => { const w = innerWidth >= 900; document.body.classList.toggle('wide', w); if (doc && !$('#editor').classList.contains('hidden')) { resizeView(); } };
    addEventListener('resize', onResize); onResize();
    initInput(); this.buildEditorChrome(); this.keys();
    await DB.open(); await PAL.load(); await CBR.load();
    $('#gNew').onclick = () => this.openNew();
    $('#gSel').onclick = () => this.toggleSelect();
    $('#gImport').onclick = () => this.importToNew();
    document.addEventListener('visibilitychange', () => { if (document.hidden && doc && S.dirty && !$('#editor').classList.contains('hidden')) saveDoc(true); });
    setInterval(() => { if (doc && S.dirty && !op && !$('#editor').classList.contains('hidden')) saveDoc(true); }, 30000);
    if (!DB.ok) $('#gBanner').innerHTML = '<div class="banner">Este navegador no permite guardar: tus dibujos se perderán al cerrar. Exporta lo que hagas.</div>';
    this.renderGallery();
  },

  /* ---------- galería ---------- */
  sel: null,
  async renderGallery() {
    const metas = (await DB.all('meta')).sort((a, b) => b.updated - a.updated); this.metas = metas;
    $('#gCount').textContent = metas.length ? `Mis dibujos · ${metas.length}` : 'Mis dibujos';
    const g = $('#gGrid'); g.innerHTML = '';
    if (!metas.length) g.innerHTML = `<div class="empty">${LOGO.replace(/26/g, '64')}<div class="big">Tu galería está vacía</div>Toca <b>+</b> para empezar un dibujo, una animación o una página de manga.</div>`;
    for (const m of metas) {
      const c = el(`<div class="card" data-id="${m.id}"><div class="th"><img src="${m.thumb}" alt=""></div><div class="meta"><div class="nm">${esc(m.name)}</div><div class="sz">${m.w}×${m.h}${m.anim ? ` <span class="tag">ANIM · ${m.nframes}</span>` : ''}${m.pixel ? ' <span class="tag">PIXEL</span>' : ''}</div></div><div class="chk"></div></div>`);
      c.onclick = () => { if (this.sel) { this.sel.has(m.id) ? this.sel.delete(m.id) : this.sel.add(m.id); c.classList.toggle('picked'); this.updBar(); } else this.openDoc(m.id); };
      c.oncontextmenu = e => { e.preventDefault(); if (!this.sel) this.toggleSelect(); this.sel.add(m.id); c.classList.add('picked'); this.updBar(); };
      g.appendChild(c);
    }
  },
  toggleSelect() {
    this.sel = this.sel ? null : new Set(); $('#gallery').classList.toggle('sel', !!this.sel); $('#gSel').textContent = this.sel ? 'Listo' : 'Elegir'; $('#gSel').classList.toggle('on', !!this.sel);
    $('#gNew').classList.toggle('hidden', !!this.sel); $('#gBar').classList.toggle('hidden', !this.sel); $$('.card').forEach(c => c.classList.remove('picked'));
    const b = $('#gBar'); b.innerHTML = `<button data-a="exp">${ic('share')}Exportar</button><button data-a="dup">${ic('copy')}Duplicar</button><button data-a="ren">${ic('pencil')}Renombrar</button><button data-a="del" class="del">${ic('trash')}Eliminar</button>`;
    b.onclick = e => { const a = e.target.closest('button'); if (a) this.galleryAct(a.dataset.a); }; this.updBar();
  },
  updBar() { const n = this.sel ? this.sel.size : 0; $$('#gBar button').forEach(b => b.disabled = !n || ((b.dataset.a === 'ren' || b.dataset.a === 'exp') && n !== 1)); },
  async galleryAct(a) {
    const ids = [...this.sel];
    if (a === 'del') { if (!await this.confirm('Eliminar', `¿Eliminar ${ids.length} dibujo(s)? No se puede deshacer.`, 'Eliminar', true)) return; for (const id of ids) { await DB.del('meta', id); await DB.del('data', id); } }
    if (a === 'dup') { for (const id of ids) { const d = await DB.get('data', id), m = await DB.get('meta', id); const nid = uid(); await DB.put('data', nid, { ...d, id: nid, name: d.name + ' (copia)' }); await DB.put('meta', nid, { ...m, id: nid, name: m.name + ' (copia)', updated: Date.now() }); } }
    if (a === 'ren') { const m = this.metas.find(x => x.id === ids[0]); const n = await this.prompt('Cambiar nombre', m.name); if (!n) return; const d = await DB.get('data', m.id); d.name = n; m.name = n; await DB.put('data', m.id, d); await DB.put('meta', m.id, m); }
    if (a === 'exp') { await loadDoc(ids[0]); this.openExport(); return; }
    this.toggleSelect(); this.renderGallery();
  },
  async importToNew() {
    const files = await this.pickFile('image/*', false); if (!files.length) return; const im = await fileToImage(files[0]).catch(() => null); if (!im) { this.toast('No se pudo abrir la imagen'); return; }
    let w = im.naturalWidth, h = im.naturalHeight; const k = Math.min(1, 4096 / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k);
    createDoc({ name: files[0].name.replace(/\.[^.]+$/, ''), w, h, bg: 'transparent' }); L()[0].name = 'Foto'; L()[0].ctx.drawImage(im, 0, 0, w, h); L().push(newLayer('Capa 2')); FR().active = 1; this.enterEditor(); S.dirty = true;
    return true;
  },

  /* ---------- nuevo ---------- */
  openNew() {
    const scr = [Math.round(Math.min(2400, screen.width * (devicePixelRatio || 1))), Math.round(Math.min(2400, screen.height * (devicePixelRatio || 1)))];
    const sections = [
      ['Pantalla y redes', [['Personalizado', null, null, { custom: true }], ['Pantalla de tu dispositivo', scr[0], scr[1]], ['Cuadrado 1:1 (2K)', 2048, 2048], ['Vertical 3:4 (2K)', 1536, 2048], ['Historia 9:16', 1080, 1920], ['Miniatura de YouTube', 1280, 720], ['Banner de YouTube', 2560, 1440], ['Foto de perfil', 800, 800], ['Fondo de PC 16:9', 1920, 1080]]],
      ['Minecraft y pixel art', [['Skin de Minecraft', 64, 64, { pixel: true, bg: 'transparent' }], ['Textura 16×16', 16, 16, { pixel: true, bg: 'transparent' }], ['Textura 32×32', 32, 32, { pixel: true, bg: 'transparent' }], ['Pixel art 128×128', 128, 128, { pixel: true }], ['Pixel art 256×256', 256, 256, { pixel: true }]]],
      ['Manga y para imprimir', [['Página de manga (B5)', 1039, 1476, { manga: true }], ['A4 · 150 dpi', 1240, 1754], ['A5 · 150 dpi', 874, 1240], ['Carta · 150 dpi', 1275, 1650], ['A4 · 300 dpi', 2480, 3508]]],
      ['Animación', [['Animación 1:1', 640, 640, { anim: true }], ['Animación 4:3', 640, 480, { anim: true }], ['Animación 16:9', 1280, 720, { anim: true }], ['Animación pixel 64×64', 64, 64, { anim: true, pixel: true, bg: 'transparent' }], ['Animación personalizada', null, null, { anim: true, custom: true }]]],
    ];
    this.sheet('new', 'Nuevo', body => {
      const top = el(`<div class="box" style="padding:4px"></div>`);
      const imp = el(`<div class="nd-row"><div class="nd-ic">${ic('image')}</div><div class="grow">Importar foto</div></div>`); imp.onclick = async () => { this.closeSheet('new'); await this.importToNew(); };
      const rb = el(`<div class="nd-row"><div class="nd-ic">${ic('bgx')}</div><div class="grow">Importar foto y quitar fondo</div></div>`); rb.onclick = async () => { this.closeSheet('new'); if (await this.importToNew()) setTimeout(() => { FR().active = 0; BGX.enter(); }, 300); };
      top.append(imp, rb); body.appendChild(top);
      for (const [title, items] of sections) {
        body.appendChild(el(`<div class="sec-t">${title}</div>`)); const box = el('<div class="box" style="padding:4px"></div>');
        for (const [name, w, h, o = {}] of items) {
          const ar = w && h ? w / h : 1, iw = ar >= 1 ? 30 : Math.max(8, 30 * ar), ih = ar >= 1 ? Math.max(8, 30 / ar) : 30;
          const r = el(`<div class="nd-row"><div class="nd-ic"><i class="${o.anim ? 'an' : ''}" style="width:${iw}px;height:${ih}px"></i></div><div class="grow">${esc(name)}</div>${o.custom ? `<div class="nd-custom"><input class="inp cw" inputmode="numeric" value="${o.anim ? 1000 : 1500}"><span>×</span><input class="inp ch" inputmode="numeric" value="${o.anim ? 1000 : 1500}"></div>` : `<div class="dim">${w} × ${h}</div>`}</div>`);
          if (o.custom) r.querySelectorAll('input').forEach(i => i.onclick = e => e.stopPropagation());
          r.onclick = () => { let W = w, H = h; if (o.custom) { W = clamp(parseInt(r.querySelector('.cw').value) || 1000, 1, 8192); H = clamp(parseInt(r.querySelector('.ch').value) || 1000, 1, 8192); } if (W * H > 40e6) { this.toast('Demasiado grande'); return; } this.closeSheet('new'); this.newDoc(W, H, o, name); };
          box.appendChild(r);
        }
        body.appendChild(box);
      }
    });
  },
  openPixelNew() {
    this.sheet('pxnew', 'Nuevo pixel art', body => {
      let bg = 'transparent', anim = false;
      body.appendChild(el('<p style="color:var(--tx2);font-size:12.5px;margin:0 4px 8px">Lienzo pequeño con pinceles de píxel, sin suavizado. Al exportar eliges tamaño real o estirado sin borroso.</p>'));
      const g = el('<div class="grid-tools" style="grid-template-columns:repeat(3,1fr)"></div>');
      for (const [n, w, h] of [['16×16', 16, 16], ['32×32', 32, 32], ['48×48', 48, 48], ['64×64', 64, 64], ['Skin Minecraft', 64, 64], ['96×96', 96, 96], ['128×128', 128, 128], ['160×144', 160, 144], ['256×256', 256, 256], ['320×180', 320, 180], ['64×32 (skin antigua)', 64, 32], ['512×512', 512, 512]]) { const b = el(`<button class="tbtn"><div style="width:${Math.max(10, 34 * Math.min(1, w / h))}px;height:${Math.max(10, 34 * Math.min(1, h / w))}px;background:repeating-conic-gradient(#58d3b0 0 25%,#2b7f6a 0 50%) 0 0/8px 8px;border-radius:3px"></div>${n}</button>`); b.onclick = () => { this.closeSheet('pxnew'); this.newDoc(w, h, { pixel: true, bg, anim }, n); }; g.appendChild(b); }
      body.appendChild(g);
      const c = el('<div class="box" style="margin-top:10px"><div class="nd-custom" style="justify-content:space-between"><span>Personalizado</span><span style="display:flex;align-items:center;gap:4px;white-space:nowrap"><input class="inp cw" inputmode="numeric" value="48" style="width:58px"> × <input class="inp ch" inputmode="numeric" value="48" style="width:58px"></span><button class="btn pri" style="height:38px">Crear</button></div></div>');
      c.querySelector('.btn').onclick = () => { const w = clamp(parseInt(c.querySelector('.cw').value) || 32, 1, 1024), h = clamp(parseInt(c.querySelector('.ch').value) || 32, 1, 1024); this.closeSheet('pxnew'); this.newDoc(w, h, { pixel: true, bg, anim }, 'Pixel'); }; body.appendChild(c);
      const o = el('<div class="box" style="margin-top:10px"></div>');
      o.appendChild(el('<div style="font-size:13.5px;margin:0 2px 6px">Fondo</div>')); o.appendChild(Seg([['transparent', 'Transparente'], ['white', 'Blanco'], ['black', 'Negro']], bg, v => bg = v));
      const r = el('<div class="row" style="margin-top:6px"><span class="lbl">Es una animación</span></div>'); r.appendChild(Toggle(false, v => anim = v)); o.appendChild(r); body.appendChild(o);
    });
  },
  newDoc(w, h, o, preset) {
    const n = (this.metas ? this.metas.length : 0) + 1;
    createDoc({ name: (o.anim ? 'Animación ' : o.manga ? 'Manga ' : o.pixel ? 'Pixel art ' : 'Dibujo ') + n, w, h, anim: o.anim, pixel: o.pixel, bg: o.bg || 'white' });
    if (o.pixel) { S.cfg.brush.id = 'pixel'; S.cfg.eraser.id = 'pixel-2'; S.smoothZoom = false; S.stab = 0; S.fillGrow = 0; S.fillTol = 0; } else { if (BR[S.cfg.brush.id] && BR[S.cfg.brush.id].pixel) S.cfg.brush.id = 'pluma'; if (BR[S.cfg.eraser.id] && BR[S.cfg.eraser.id].pixel) S.cfg.eraser.id = 'rotulador'; S.smoothZoom = true; S.stab = store.get('stab', 2); S.fillGrow = 1; S.fillTol = 32; }
    TL.frames = []; this.enterEditor(); S.dirty = true; if (o.manga) setTimeout(() => this.openFrameAdd(), 350); if (o.anim) { doc.fps = 12; doc.playMode = 'loop'; setTimeout(() => this.animSettings(), 350); }
  },
  async openDoc(id) { if (this.saving) await this.saving; if (!await loadDoc(id)) { this.toast('No se pudo abrir'); return; } S.smoothZoom = !doc.pixel; this.enterEditor(); },
  enterEditor() {
    S.undo = []; S.redo = []; S.sel = null; S.textObj = null; S.dirty = false; S.fx = null; S.bgx = null; op = null; tmp = null;
    $('#gallery').classList.add('hidden'); $('#editor').classList.remove('hidden'); if (this.sel) this.toggleSelect();
    resizeView(); fitView(); this.refreshAll(); if (this.isWide()) this.openPanel(this.panelTab || 'brush'); else this.closePanel();
    if (!doc.anim) $('#timeline').classList.add('hidden'); this.renderRef();
  },
  async exitEditor() {
    if (S.playing) ANIM.stop(); if (S.textObj) TXT.commit(); if (S.fx) FX.cancel(); if (S.bgx) BGX.done(); this.closeAll();
    if (S.imgObj) IMGF.commit(); if (S.balloon) BAL.commit(); const dirty = S.dirty, d0 = doc; S.fx = null; S.bgx = null; S.textObj = null; op = null; this.closeFx(); this.closeBgx(); $$('.modal').forEach(x => x.remove()); $$('.sheet.open').forEach(x => x.classList.remove('open')); this.sheetStack = []; $('#scrim').classList.remove('show'); $('#pscrim').classList.remove('show'); $('#panel').classList.remove('open');
    $('#editor').classList.add('hidden'); $('#gallery').classList.remove('hidden'); $('#refWin') && $('#refWin').remove();
    if (dirty) { this.toast('Guardando…', 1500); await new Promise(r => setTimeout(r, 30)); this.saving = saveDoc(true).catch(e => { console.error(e); this.toast('No se pudo guardar'); }); await this.saving; this.saving = null; }
    if (doc === d0) doc = null; this.renderGallery();
  },

  /* ---------- cromo del editor ---------- */
  buildEditorChrome() {
    // barra superior
    $('#tbLeft').innerHTML = `<button class="ib" id="bUndo" title="Deshacer (Ctrl+Z)">${ic('undo')}</button><button class="ib" id="bRedo" title="Rehacer (Ctrl+Shift+Z)">${ic('redo')}</button>`;
    $('#tbRight').innerHTML = `<button class="ib" id="bStab" title="Trazo: estabilizador y atenuación">${ic('stab')}</button><button class="ib" id="bRuler" title="Regla y simetría">${ic('ruler')}</button><button class="ib" id="bSelect" title="Selección">${ic('select')}</button><button class="ib" id="bView" title="Vista y ventana de referencia">${ic('view')}</button><button class="ib hidden" id="bRotReset" title="Enderezar el lienzo">${ic('rotate')}</button><button class="ib" id="zoomLbl" title="Ajustar a pantalla (0)">100%</button><button class="ib" id="bMenu" title="Menú">${ic('dots')}</button>`;
    $('#bUndo').onclick = () => undo(); $('#bRedo').onclick = () => redo();
    $('#bStab').onclick = () => this.openStab(); $('#bRuler').onclick = () => this.openRuler(); $('#bSelect').onclick = () => this.openSelect(); $('#bView').onclick = () => this.openViewOpts(); $('#bMenu').onclick = () => this.openMenu(); $('#zoomLbl').onclick = () => fitView(); $('#bRotReset').onclick = () => rotateView(0);
    // deslizadores verticales
    const sl = $('#sliders'); sl.innerHTML = '';
    this.vSize = Slider({ vertical: true, min: .5, max: 1000, value: 10, ...SIZE_T, onInput: v => { setToolSize(this.isPixelBrush() ? Math.round(v) : v); this.updSizeLbl(); this.updDock(); this.syncPanelSliders(); hover.on = true; const r = stageRect(); if (!hover.x) { hover.x = r.width / 2; hover.y = r.height / 2; } requestRender(); }, onEnd: () => { if (!matchMedia('(hover:hover)').matches) { hover.on = false; requestRender(); } } });
    this.vOp = Slider({ vertical: true, min: 0, max: 1, value: 1, cls: 'chk', onInput: v => { const c = S.cfg[S.tool]; if (c) c.op = Math.max(.01, v); this.updSizeLbl(); this.syncPanelSliders(); } });
    this.vSize.el.style.height = '140px'; this.vOp.el.style.height = '110px';
    sl.append(el('<div class="vs-lbl" id="vsSize">10</div>'), this.vSize.el, el('<div class="vsep"></div>'), this.vOp.el, el('<div class="vs-lbl" id="vsOp">100%</div>'));
    const pk = el(`<button class="ib" title="Gotero (mantén presionado el lienzo)" style="width:40px;height:40px">${ic('picker')}</button>`); pk.onclick = () => this.setTool('picker'); sl.append(el('<div class="vsep"></div>'), pk);
    // dock (teléfono)
    $('#dock').innerHTML = `<button class="ib" id="dTool" title="Herramientas"></button><button class="ib" id="dSize" title="Pinceles"><div class="sizeb"><i></i><span>10</span></div></button><button class="ib" id="dColor" title="Color"><div class="swatch"></div></button><button class="ib lyrb" id="dLayers" title="Capas">${ic('layers')}<b>1</b></button><button class="ib" id="dFx" title="Filtros">${ic('fx')}</button><button class="ib" id="dBack" title="Galería">${ic('grid')}</button>`;
    $('#dTool').onclick = () => this.openTools(); $('#dSize').onclick = () => this.togglePanel('brush'); $('#dColor').onclick = () => this.togglePanel('color'); $('#dLayers').onclick = () => this.togglePanel('layers'); $('#dFx').onclick = () => FX.open(); $('#dBack').onclick = () => this.exitEditor();
    // riel (PC)
    const rail = $('#rail'); rail.innerHTML = `<div class="logo-mark" title="Volver a la galería" style="cursor:pointer">${LOGO}</div>`; rail.firstChild.onclick = () => this.exitEditor();
    for (const [id, name, icn, key] of TOOLS) { const b = el(`<button class="ib" data-tool="${id}" title="${name} (${key})">${ic(icn)}</button>`); b.onclick = () => id === 'frame' ? this.openFrameMenu() : this.setTool(id); rail.appendChild(b); }
    rail.appendChild(el('<div class="sep"></div>'));
    const rf = el(`<button class="ib" title="Filtros">${ic('fx')}</button>`); rf.onclick = () => FX.open(); rail.appendChild(rf);
    const rb = el(`<button class="ib" title="Quitar fondo">${ic('bgx')}</button>`); rb.onclick = () => BGX.enter(); rail.appendChild(rb);
    const rbal = el(`<button class="ib" title="Globos de texto">${ic('bubble')}</button>`); rbal.onclick = () => this.openBalloons(); rail.appendChild(rbal);
    const ra = el(`<button class="ib" title="Asistente IA">${ic('ai')}</button>`); ra.onclick = () => this.openAI(); rail.appendChild(ra);
    const rt = el(`<button class="ib" title="Opciones de la herramienta">${ic('sliders')}</button>`); rt.onclick = () => this.openTools(); rail.appendChild(rt);
    // panel lateral / inferior
    const p = $('#panel'); p.innerHTML = `<div class="grab"></div><div class="tabs seg"><button data-t="brush">Pincel</button><button data-t="color">Color</button><button data-t="layers">Capas</button></div><div class="sh-head"><h3 id="pTitle">Pincel</h3><span id="pExtra"></span><button class="ib pclose">${ic('close')}</button></div><div class="sh-body"><div class="psec" data-s="brush"></div><div class="psec" data-s="color"></div><div class="psec" data-s="layers"></div></div>`;
    p.querySelector('.pclose').onclick = () => this.closePanel(); $$('.tabs button', p).forEach(b => b.onclick = () => this.openPanel(b.dataset.t));
    this.buildBrushSec(); this.buildColorSec(); this.buildLayerSec();
  },
  updRot() { const deg = Math.round(V.r * 180 / Math.PI); if (this._rotRow) this._rotRow.set(deg); const z = $('#bRotReset'); if (z) z.classList.toggle('hidden', !deg); },
  updZoom() { const z = $('#zoomLbl'); if (z) z.textContent = Math.round(V.s * 100) + '%'; },
  refreshUndo() { $('#bUndo').disabled = !S.undo.length || (S.bgx && S.undo.length <= S.bgx.undoStart); $('#bRedo').disabled = !S.redo.length; $('#bxUndo') && ($('#bxUndo').disabled = $('#bUndo').disabled, $('#bxRedo').disabled = $('#bRedo').disabled); },
  refreshAll() { this.updTool(); this.updDock(); this.onColor(); this.refreshLayers(); this.refreshUndo(); this.renderTimeline(); this.updZoom(); $('#docTitle').textContent = doc.name + ' · ' + doc.w + '×' + doc.h; this.refreshBrushList(); },
  onChanged(struct) { this.refreshUndo(); clearTimeout(this._lt); const panelOn = this.isWide() || $('#panel').classList.contains('open'); this._layersStale = true; this._lt = setTimeout(() => { if (this.isWide() || $('#panel').classList.contains('open')) { if (this.panelTab === 'layers' || this.isWide()) { this.refreshLayers(); this._layersStale = false; } } else $('#dLayers b').textContent = L().length; if (doc && doc.anim) this.renderTimeline(); }, struct ? 0 : 700); if (!struct) { const run = () => TL.snap(); window.requestIdleCallback ? requestIdleCallback(run, { timeout: 6000 }) : setTimeout(run, 1500); } },
  isPixelBrush() { return (S.tool === 'brush' || S.tool === 'eraser') && BR[S.cfg[S.tool].id] && BR[S.cfg[S.tool].id].pixel; },
  updSizeLbl() { $('#vsSize').textContent = sizeFmt(toolSize()); $('#vsOp').textContent = Math.round(toolOp() * 100) + '%'; },
  updDock() {
    const t = TOOLS.find(x => x[0] === S.tool); $('#dTool').innerHTML = ic(t ? t[2] : 'brush'); const sz = toolSize(); const sb = $('#dSize .sizeb'); sb.querySelector('span').textContent = sizeFmt(sz); const d = clamp(Math.sqrt(sz) * 3, 4, 36); const i = sb.querySelector('i'); i.style.width = i.style.height = d + 'px';
    $('#dLayers b').textContent = L().length; this.vSize.set(toolSize()); this.vOp.set(toolOp()); this.updSizeLbl();
    $('#sliders').classList.toggle('hidden', !S.cfg[S.tool] || ['fill', 'select'].includes(S.tool) && false);
  },
  setTool(t) {
    if (S.textObj && t !== 'text') TXT.commit(); if (S.frameTool) this.setFrameTool(false);
    if (t !== S.tool) S.prevTool = S.tool; S.tool = t; this.updTool(); this.updDock(); this.refreshBrushList(); this.syncPanelSliders(); requestRender();
    if (this.sheetStack.some(s => s.id === 'tools')) this.openTools();
  },
  updTool() { $$('#rail [data-tool]').forEach(b => b.classList.toggle('on', S.frameTool ? b.dataset.tool === 'frame' : b.dataset.tool === S.tool)); const hand = S.tool === 'hand'; view.style.cursor = hand ? 'grab' : S.tool === 'move' ? 'move' : S.tool === 'text' ? 'text' : (['brush', 'eraser', 'smudge', 'blur'].includes(S.tool) ? 'none' : 'crosshair'); },
  setFrameTool(on) { S.frameTool = on; this.updTool(); if (on) this.toast('Marcos: arrastra una línea para dividir · toca una viñeta para seleccionarla'); },

  /* ---------- panel: pincel / color / capas ---------- */
  togglePanel(t) { const p = $('#panel'); if (!this.isWide() && p.classList.contains('open') && this.panelTab === t) this.closePanel(); else this.openPanel(t); },
  openPanel(t) {
    this.panelTab = t; const p = $('#panel'); $$('.psec', p).forEach(s => s.classList.toggle('on', s.dataset.s === t)); $$('.tabs button', p).forEach(b => b.classList.toggle('on', b.dataset.t === t));
    $('#pTitle').textContent = { brush: this.brushTitle(), color: 'Color', layers: 'Capas' }[t]; $('#pExtra').innerHTML = '';
    if (t === 'brush') { const m = el(`<button class="ib" title="Importar / exportar pinceles">${ic('dots')}</button>`); m.onclick = () => this.brushMenu(); $('#pExtra').appendChild(m); this.refreshBrushList(); this.syncPanelSliders(); }
    if (t === 'layers') { this._layersStale = false; const m = el(`<button class="ib" title="Más opciones de capa">${ic('dots')}</button>`); m.onclick = () => this.layerMenu(); $('#pExtra').appendChild(m); this.refreshLayers(); }
    if (t === 'color') this.onColor();
    p.classList.add('open'); if (!this.isWide()) $('#pscrim').classList.add('show');
  },
  closePanel() { const p = $('#panel'); $('#pscrim').classList.remove('show'); if (this.isWide()) return; p.classList.remove('open'); },
  brushTitle() { return S.tool === 'eraser' ? 'Borrador' : S.tool === 'smudge' ? 'Difuminar' : S.tool === 'blur' ? 'Desenfocar' : S.tool === 'shape' ? 'Figuras' : 'Pincel'; },
  buildBrushSec() {
    const s = $('.psec[data-s="brush"]'); s.innerHTML = `<div class="bprev"><canvas></canvas><div class="nm"></div></div><div class="bwrap"><div class="bcats"></div><div class="blist"></div></div><div class="bsl"></div>`;
    this.bSize = SRow('Grosor', { min: .5, max: 1000, value: 10, ...SIZE_T, fmt: v => sizeFmt(v) + 'px', bump: (v, d) => v + d * (v < 10 ? .5 : v < 50 ? 1 : 5), onInput: v => { setToolSize(this.isPixelBrush() ? Math.round(v) : v); this.updDock(); this.drawBrushPreview(); } });
    this.bOp = SRow('Opacidad', { min: 0, max: 1, value: 1, step: .01, cls: 'chk', fmt: v => Math.round(v * 100) + '%', onInput: v => { const c = S.cfg[S.tool]; if (c) c.op = Math.max(.01, v); this.updSizeLbl(); this.vOp.set(v); } });
    this.bStab = SRow('Estabilizador', { min: 0, max: 10, value: S.stab, step: 1, fmt: v => v ? Math.round(v) + '' : 'No', onInput: v => { S.stab = v; store.set('stab2', v); } });
    $('.bsl', s).append(this.bSize.el, this.bOp.el, this.bStab.el);
    this.bcat = 'all';
  },
  syncPanelSliders() { if (!this.bSize) return; this.bSize.set(toolSize()); this.bOp.set(toolOp()); this.bStab.set(S.stab); this.bOp.el.querySelector('.hd span').textContent = ['smudge', 'blur'].includes(S.tool) ? 'Fuerza' : 'Opacidad'; $('#pTitle') && this.panelTab === 'brush' && ($('#pTitle').textContent = this.brushTitle()); this.drawBrushPreview(); },
  refreshBrushList() {
    const s = $('.psec[data-s="brush"]'); if (!s || !doc) return; const hasList = S.tool === 'brush' || S.tool === 'eraser';
    $('.bwrap', s).style.display = hasList ? '' : 'none';
    const cats = $('.bcats', s); cats.innerHTML = '';
    for (const c of BCATS) { const b = el(`<button class="bcat ${this.bcat === c.id ? 'on' : ''}">${ic(c.ic)}${c.name}</button>`); b.onclick = () => { this.bcat = c.id; this.refreshBrushList(); }; cats.appendChild(b); }
    const list = $('.blist', s); list.innerHTML = ''; const cur = S.cfg[S.tool] && S.cfg[S.tool].id;
    for (const b of BRUSHES.filter(b => this.bcat === 'all' || b.cat === this.bcat)) {
      const it = el(`<div class="bitem ${b.id === cur ? 'on' : ''}"><canvas width="300" height="88"></canvas><div class="bn">${esc(b.name)}<small>${sizeFmt(S.cfg[S.tool] && S.cfg[S.tool].sizes ? (S.cfg[S.tool].sizes[b.id] ?? b.size) : b.size)}px</small></div></div>`);
      it.onclick = () => { S.cfg[S.tool].id = b.id; this.refreshBrushList(); this.updDock(); this.syncPanelSliders(); }; if (b.tip) { const del = async () => { if (await this.confirm('Eliminar pincel', `¿Eliminar "${b.name}"?`, 'Eliminar', true)) { await CBR.remove(b.id); this.refreshBrushList(); } }; it.oncontextmenu = e => { e.preventDefault(); del(); }; let lt; it.addEventListener('pointerdown', () => { lt = setTimeout(del, 650); }); it.addEventListener('pointerup', () => clearTimeout(lt)); it.addEventListener('pointerleave', () => clearTimeout(lt)); it.addEventListener('pointermove', () => clearTimeout(lt)); }
      list.appendChild(it); this.strokePreview(it.querySelector('canvas'), b, '#eceef1');
    }
    if (hasList && this.bcat === 'Importados' && !CBR.list.length) list.appendChild(el('<div style="color:var(--tx2);padding:12px;font-size:13px">Aún no importas pinceles. Usa ⋮ arriba para traer .abr de Photoshop, la imagen con QR de un pincel de ibisPaint o una imagen PNG.</div>'));
    this.drawBrushPreview();
  },
  strokePreview(cv, b, col, size) {
    const x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height); const W = cv.width, H = cv.height; size = size || clamp(b.size, 2, H * .42);
    if (b.pixel) size = Math.max(2, Math.round(size / 2)) * 2;
    const saveOp = op; op = { b, size, dist: 0, kind: 'stroke' }; let last = null;
    for (let i = 0; i <= 120; i++) { const t = i / 120, px = W * .07 + t * W * .86, py = H / 2 + Math.sin(t * Math.PI * 2) * H * .22, pr = Math.sin(t * Math.PI) * .85 + .15; let ang = 0; if (last) { op.dist += Math.hypot(px - last[0], py - last[1]); ang = Math.atan2(py - last[1], px - last[0]); } if (b.rot === 'random') ang = Math.random() * 6.283; last = [px, py];
      if (i % Math.max(1, Math.round((b.spacing || .08) * size / (W * .86 / 120))) === 0 || b.pixel) { let r = size / 2 * (1 - (b.psize || 0) + (b.psize || 0) * pr) * taperStart(op.dist); dabRaw(x, px, py, Math.max(.4, r), (b.flow ?? 1) * (1 - (b.popac || 0) + (b.popac || 0) * pr), b, col, ang); } }
    op = saveOp; x.globalAlpha = 1;
  },
  drawBrushPreview() {
    const s = $('.psec[data-s="brush"]'); if (!s || !doc) return; const cv = $('.bprev canvas', s); const r = cv.getBoundingClientRect(); cv.width = Math.max(200, r.width * 2 || 600); cv.height = 156;
    const b = brushFor(S.tool); const nm = $('.bprev .nm', s);
    if (S.tool === 'brush' || S.tool === 'eraser') { this.strokePreview(cv, b, S.tool === 'eraser' ? '#ffffff' : colStr(), clamp(toolSize(), 1, 64) * (b.pixel ? 4 : 1)); nm.textContent = b.name; }
    else { cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); nm.textContent = this.brushTitle() + ' · ' + sizeFmt(toolSize()) + 'px'; }
  },
  /* editor para importar un pincel desde una imagen: elegir la zona, quitar fondo, rotación y espaciado */
  brushEditor(im, ib, fname) {
    return new Promise(resolve => {
      const src = mkCanvas(im.naturalWidth || im.width, im.naturalHeight || im.height); src.getContext('2d').drawImage(im, 0, 0);
      const auto = TIPX.autoRect(src, ib && ib.qr); const o = { name: (ib && ib.name) || fname, mode: 'auto', tol: 28, keepColor: false, rot: ib ? 'follow' : 'fixed', spacing: ib ? ib.spacing : .15, size: ib ? ib.size : 80, rect: { x: auto.x, y: auto.y, w: auto.w, h: auto.h }, bg: auto.bg };
      let done = false; const finish = v => { if (done) return; done = true; resolve(v); };
      this.sheet('bedit', 'Importar pincel' + (ib ? ' de ibisPaint' : ''), body => {
        body.appendChild(el(`<p style="color:var(--tx2);font-size:12.5px;margin:0 2px 8px">${ib ? 'Leí el código QR. ' : ''}Ajusta el recuadro verde sobre la forma del pincel (arrastra las esquinas o el centro).</p>`));
        const wrap = el('<div style="position:relative;touch-action:none;border-radius:10px;overflow:hidden;background:repeating-conic-gradient(#3a3d42 0 25%,#2d3034 0 50%) 0 0/14px 14px"><canvas style="width:100%;display:block"></canvas></div>'); const cv = wrap.querySelector('canvas');
        const K = Math.min(1, 900 / Math.max(src.width, src.height)); cv.width = Math.round(src.width * K); cv.height = Math.round(src.height * K); const cx = cv.getContext('2d');
        const draw = () => { cx.clearRect(0, 0, cv.width, cv.height); cx.drawImage(src, 0, 0, cv.width, cv.height); const r = o.rect; cx.fillStyle = 'rgba(0,0,0,.45)'; cx.fillRect(0, 0, cv.width, r.y * K); cx.fillRect(0, (r.y + r.h) * K, cv.width, cv.height); cx.fillRect(0, r.y * K, r.x * K, r.h * K); cx.fillRect((r.x + r.w) * K, r.y * K, cv.width, r.h * K); cx.strokeStyle = '#58d3b0'; cx.lineWidth = 3; cx.strokeRect(r.x * K, r.y * K, r.w * K, r.h * K); cx.fillStyle = '#58d3b0'; for (const [a, b2] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { cx.beginPath(); cx.arc((r.x + r.w * a) * K, (r.y + r.h * b2) * K, 9, 0, 7); cx.fill(); } };
        let drag = null;
        wrap.addEventListener('pointerdown', e => { e.preventDefault(); wrap.setPointerCapture(e.pointerId); const rr = cv.getBoundingClientRect(), sc = cv.width / rr.width / K, px = (e.clientX - rr.left) * sc, py = (e.clientY - rr.top) * sc, r = o.rect, tolp = 28 * sc; let hit = null; for (const [a, b2] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (Math.hypot(px - (r.x + r.w * a), py - (r.y + r.h * b2)) < tolp) hit = [a, b2]; drag = { hit, px, py, r: { ...r }, sc, rr }; });
        wrap.addEventListener('pointermove', e => { if (!drag) return; const px = (e.clientX - drag.rr.left) * drag.sc, py = (e.clientY - drag.rr.top) * drag.sc, dx = px - drag.px, dy = py - drag.py, r0 = drag.r, r = o.rect; if (drag.hit) { const [a, b2] = drag.hit; let x0 = r0.x, y0 = r0.y, x1 = r0.x + r0.w, y1 = r0.y + r0.h; if (a) x1 += dx; else x0 += dx; if (b2) y1 += dy; else y0 += dy; r.x = clamp(Math.min(x0, x1), 0, src.width); r.y = clamp(Math.min(y0, y1), 0, src.height); r.w = Math.max(4, Math.min(src.width - r.x, Math.abs(x1 - x0))); r.h = Math.max(4, Math.min(src.height - r.y, Math.abs(y1 - y0))); } else { r.x = clamp(r0.x + dx, 0, src.width - r.w); r.y = clamp(r0.y + dy, 0, src.height - r.h); } draw(); });
        const up = () => { if (drag) { drag = null; preview(); } }; wrap.addEventListener('pointerup', up); wrap.addEventListener('pointercancel', up);
        body.appendChild(wrap); draw();
        const blobs = TIPX.blobs(src, ib && ib.qr);
        if (blobs.length > 1) {
          body.appendChild(el('<div style="font-size:13px;color:var(--tx2);margin:10px 2px 6px">Formas encontradas: toca la que quieres usar</div>'));
          const strip = el('<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none"></div>');
          const all = el(`<button class="tbtn" style="flex:none;width:84px">${ic('fit')}Todo</button>`); all.onclick = () => { o.rect = { x: auto.x, y: auto.y, w: auto.w, h: auto.h }; draw(); preview(); }; strip.appendChild(all);
          for (const bl of blobs) { const t = mkCanvas(72, 52), tx = t.getContext('2d'), kk = Math.min(72 / bl.w, 52 / bl.h); tx.drawImage(src, bl.x, bl.y, bl.w, bl.h, (72 - bl.w * kk) / 2, (52 - bl.h * kk) / 2, bl.w * kk, bl.h * kk); const bt = el('<button class="tbtn" style="flex:none;width:84px;padding:6px"></button>'); bt.appendChild(t); bt.onclick = () => { o.rect = { x: bl.x, y: bl.y, w: bl.w, h: bl.h }; draw(); preview(); }; strip.appendChild(bt); }
          body.appendChild(strip);
        }
        const pv = el('<div class="bprev" style="margin-top:10px"><canvas></canvas><div class="nm">Vista previa</div></div>'); body.appendChild(pv);
        let tip = null;
        const build = () => { tip = TIPX.extract(src, o.rect, { mode: o.mode, tol: o.tol, keepColor: o.keepColor, bg: o.bg }); return tip; };
        const preview = () => { build(); const c = pv.querySelector('canvas'); c.width = Math.max(300, pv.clientWidth * 2 || 600); c.height = 156; const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height); if (!tip) { x.fillStyle = '#ffb3b3'; x.font = '24px system-ui'; x.fillText('No quedó nada: baja la tolerancia o cambia el modo', 16, 80); return; } stampCache.clear(); this.strokePreview(c, { id: 'prev-' + Date.now(), tip, hard: 1, spacing: o.spacing, flow: 1, psize: .3, rot: o.rot, keepColor: o.keepColor }, o.keepColor ? '#ffffff' : '#eceef1', 60); };
        const opts = el('<div class="box" style="margin-top:10px;display:flex;flex-direction:column;gap:6px"></div>');
        opts.append(el('<label style="font-size:13px;color:var(--tx2)">Nombre</label>'), Object.assign(el(`<input class="inp" value="${esc(o.name)}">`), { oninput: e => o.name = e.target.value }));
        opts.append(el('<div style="font-size:13px;color:var(--tx2);margin-top:4px">Fondo de la imagen</div>'), Seg([['auto', 'Quitar fondo'], ['white', 'Quitar blanco'], ['luma', 'Oscuro = tinta'], ['alpha', 'Transparencia']], o.mode, v => { o.mode = v; preview(); }));
        opts.appendChild(SRow('Tolerancia del fondo', { min: 0, max: 120, value: o.tol, step: 1, onInput: v => o.tol = v, onEnd: () => preview() }).el);
        const kc = el('<div class="row"><span class="lbl">Conservar los colores de la imagen</span></div>'); kc.appendChild(Toggle(o.keepColor, v => { o.keepColor = v; preview(); })); opts.appendChild(kc);
        opts.append(el('<div style="font-size:13px;color:var(--tx2);margin-top:4px">Rotación</div>'), Seg([['fixed', 'Fija'], ['follow', 'Sigue el trazo'], ['random', 'Aleatoria']], o.rot, v => { o.rot = v; preview(); }));
        opts.appendChild(SRow('Espaciado', { min: .02, max: 2, value: o.spacing, step: .01, fmt: v => Math.round(v * 100) + '%', onInput: v => o.spacing = v, onEnd: () => preview() }).el);
        opts.appendChild(SRow('Tamaño inicial', { min: 2, max: 600, value: o.size, step: 1, unit: 'px', onInput: v => o.size = v }).el);
        body.appendChild(opts);
        const row = el('<div class="row" style="margin-top:12px;gap:8px"><button class="btn" style="flex:1">Cancelar</button><button class="btn pri" style="flex:2">Guardar pincel</button></div>');
        row.children[0].onclick = () => { this.closeSheet('bedit'); finish(null); };
        row.children[1].onclick = () => { if (!build()) { this.toast('Ajusta el recuadro o la tolerancia'); return; } const res = { name: o.name || 'Pincel', tip, size: o.size, spacing: o.spacing, rot: o.rot, keepColor: o.keepColor, hard: 1, flow: 1, psize: .35, popac: o.keepColor ? 0 : .2, cat: 'Importados', from: ib ? 'ibisPaint' : 'imagen' }; finish(res); this.closeSheet('bedit'); };
        body.appendChild(row);
        setTimeout(preview, 60);
      }, { onClose: () => finish(null) });
    });
  },
  async brushMenu() {
    this.sheet('bmenu', 'Pinceles', body => {
      const rows = [['upload', 'Importar pinceles', 'Photoshop (.abr), imagen con QR de ibisPaint, PNG/JPG o .fpsbrush', async () => { this.closeSheet('bmenu'); const f = await this.pickFile('.abr,.png,.jpg,.jpeg,.webp,.json,.fpsbrush', true); if (!f.length) return; const n = await CBR.importFiles(f); if (n) { this.bcat = 'Importados'; this.refreshBrushList(); this.toast(`${n} pincel(es) importado(s)`); } }],
        ['download', 'Exportar mis pinceles', 'Archivo .fpsbrush para pasarlos a otro equipo', async () => { if (!CBR.list.length) { this.toast('No tienes pinceles importados'); return; } this.download(CBR.exportFile(), 'mis-pinceles.fpsbrush'); }],
        ['info', 'Pinceles de ibisPaint', 'Importa la imagen que comparten (forma + código QR): leo el nombre y el grosor del QR y tomo la forma de la imagen', () => { }]];
      const box = el('<div class="box" style="padding:4px"></div>'); for (const [icn, t, sub, fn] of rows) { const r = el(`<div class="list-row">${ic(icn)}<div class="grow">${t}<div class="sub">${sub}</div></div></div>`); r.onclick = fn; box.appendChild(r); } body.appendChild(box);
      body.appendChild(el('<p style="color:var(--tx2);font-size:12.5px;margin:12px 4px">Mantén presionado (o clic derecho) un pincel importado para eliminarlo.</p>'));
    });
  },

  /* color */
  buildColorSec() {
    const s = $('.psec[data-s="color"]');
    s.innerHTML = `<div class="cwrap"><div class="ctop"><div class="cprev" title="Toca el color anterior para volver a él"><div class="cp-prev"></div><div class="cp-cur"></div></div><input class="inp" id="hexIn" style="flex:1;font-variant-numeric:tabular-nums" maxlength="7"><button class="ib" id="cAdd" title="Guardar en la paleta">${ic('plus')}</button></div><div class="seg ctabs"><button data-c="wheel" class="on">Selector</button><button data-c="pal">Paleta</button><button data-c="rgb">RGB</button></div><div class="cpane" data-c="wheel"><div id="svBox"><canvas width="320" height="206"></canvas><div class="cur"></div></div><div class="hue-w"></div></div><div class="cpane hidden" data-c="pal"></div><div class="cpane hidden" data-c="rgb"></div><div><div class="sec-t" style="margin-top:6px">Recientes</div><div class="pal" id="recentPal"></div></div></div>`;
    $$('.ctabs button', s).forEach(b => b.onclick = () => { $$('.ctabs button', s).forEach(x => x.classList.toggle('on', x === b)); $$('.cpane', s).forEach(p => p.classList.toggle('hidden', p.dataset.c !== b.dataset.c)); if (b.dataset.c === 'pal') this.renderPalette(); });
    this.hue = Slider({ min: 0, max: 360, value: 0, cls: 'hue', onInput: v => { S.hsv[0] = v; this.fromHsv(); } }); $('.hue-w', s).appendChild(this.hue.el);
    const sv = $('#svBox', s); const pick = e => { const r = sv.getBoundingClientRect(); S.hsv[1] = clamp((e.clientX - r.left) / r.width, 0, 1); S.hsv[2] = clamp(1 - (e.clientY - r.top) / r.height, 0, 1); this.fromHsv(); };
    sv.addEventListener('pointerdown', e => { sv.setPointerCapture(e.pointerId); pick(e); const mv = ev => pick(ev), up = () => { sv.removeEventListener('pointermove', mv); sv.removeEventListener('pointerup', up); }; sv.addEventListener('pointermove', mv); sv.addEventListener('pointerup', up); });
    const rgb = $('.cpane[data-c="rgb"]', s); this.rgbS = ['R', 'G', 'B'].map((n, i) => { const r = SRow(n, { min: 0, max: 255, value: 0, step: 1, cls: 'rgb', onInput: v => { const c = S.color.slice(); c[i] = Math.round(v); setColor(c); } }); rgb.appendChild(r.el); return r; });
    const hsb = ['Tono', 'Saturación', 'Brillo']; this.hsbS = hsb.map((n, i) => { const r = SRow(n, { min: 0, max: i ? 100 : 360, value: 0, step: 1, onInput: v => { S.hsv[i] = i ? v / 100 : v; this.fromHsv(); } }); rgb.appendChild(r.el); return r; });
    $('#hexIn').onchange = e => { const c = parseHex(e.target.value); if (c) setColor(c); else this.onColor(); };
    $('.cp-prev', s).onclick = () => setColor(S.prevColor);
    $('#cAdd').onclick = () => { const p = PAL.list[PAL.cur]; const hx = hex(...S.color); if (!p.colors.includes(hx)) p.colors.push(hx); PAL.save(); this.renderPalette(); this.toast('Guardado en la paleta “' + p.name + '”'); };
  },
  fromHsv() { S.color = hsv2rgb(...S.hsv); this.onColor(true); },
  onColor(fromHsv) {
    const s = $('.psec[data-s="color"]'); if (!s) return; const hx = hex(...S.color);
    $('.swatch', $('#dock')).style.background = hx; $('.cp-cur', s).style.background = hx; $('.cp-prev', s).style.background = hex(...S.prevColor);
    if (document.activeElement !== $('#hexIn')) $('#hexIn').value = hx.toUpperCase();
    const cv = $('#svBox canvas', s), x = cv.getContext('2d'); const W = cv.width, H = cv.height; x.fillStyle = `hsl(${S.hsv[0]},100%,50%)`; x.fillRect(0, 0, W, H); let g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H); g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    const cur = $('#svBox .cur', s); cur.style.left = S.hsv[1] * 100 + '%'; cur.style.top = (1 - S.hsv[2]) * 100 + '%'; cur.style.background = hx;
    this.hue.set(S.hsv[0]);
    this.rgbS.forEach((r, i) => { r.set(S.color[i]); const a = S.color.slice(), b = S.color.slice(); a[i] = 0; b[i] = 255; r.slider.track.style.background = `linear-gradient(90deg,${hex(...a)},${hex(...b)})`; });
    this.hsbS.forEach((r, i) => r.set(i ? S.hsv[i] * 100 : S.hsv[0]));
    this.renderRecent(); if (this.panelTab === 'brush') this.drawBrushPreview();
    if (S.textObj && !this._noTextColor) { }
  },
  addRecent(c) { const hx = hex(...c); S.prevColor = c.slice(); S.recent = [hx, ...S.recent.filter(x => x !== hx)].slice(0, 16); store.set('recent', S.recent); this.renderRecent(); },
  renderRecent() { const r = $('#recentPal'); if (!r) return; r.innerHTML = ''; for (const c of S.recent) { const b = el(`<button style="background:${c}" title="${c}"></button>`); b.onclick = () => setColor(parseHex(c)); r.appendChild(b); } },
  renderPalette() {
    const pane = $('.cpane[data-c="pal"]'); if (!pane) return; pane.innerHTML = ''; const p = PAL.list[PAL.cur];
    const head = el(`<div class="row" style="gap:6px"><button class="fontbtn" style="flex:1;height:40px"><span>${esc(p.name)} (${p.colors.length})</span>${ic('down')}</button><button class="ib" title="Opciones de paleta">${ic('dots')}</button></div>`);
    head.querySelector('.fontbtn').onclick = () => this.sheet('palpick', 'Paletas', body => { const box = el('<div class="box" style="padding:4px"></div>'); PAL.list.forEach((pl, i) => { const r = el(`<div class="list-row" style="${i === PAL.cur ? 'background:var(--acc-t)' : ''}"><div class="grow">${esc(pl.name)}<div style="display:flex;gap:3px;margin-top:5px">${pl.colors.slice(0, 14).map(c => `<i style="width:14px;height:14px;border-radius:3px;background:${c}"></i>`).join('')}</div></div></div>`); r.onclick = () => { PAL.cur = i; PAL.save(); this.closeSheet('palpick'); this.renderPalette(); }; box.appendChild(r); }); body.appendChild(box); });
    head.querySelector('.ib').onclick = () => this.paletteMenu(); pane.appendChild(head);
    const grid = el('<div class="pal" style="margin-top:8px"></div>');
    p.colors.forEach((c, i) => { const b = el(`<button style="background:${c}" title="${c} · mantén presionado para quitar"></button>`); b.onclick = () => setColor(parseHex(c)); let t; b.onpointerdown = () => { t = setTimeout(async () => { if (await this.confirm('Quitar color', `¿Quitar ${c} de la paleta?`, 'Quitar', true)) { p.colors.splice(i, 1); PAL.save(); this.renderPalette(); } }, 600); }; b.onpointerup = b.onpointerleave = () => clearTimeout(t); b.oncontextmenu = e => e.preventDefault(); grid.appendChild(b); });
    const add = el(`<button style="display:grid;place-items:center;background:var(--g1)" title="Añadir color actual">${ic('plus')}</button>`); add.onclick = () => $('#cAdd').click(); grid.appendChild(add); pane.appendChild(grid);
  },
  paletteMenu() {
    this.sheet('palm', 'Paletas', body => {
      const box = el('<div class="box" style="padding:4px"></div>');
      const add = (icn, t, fn, dng) => { const r = el(`<div class="list-row ${dng ? 'danger' : ''}">${ic(icn)}<div class="grow">${t}</div></div>`); r.onclick = async () => { this.closeSheet('palm'); await fn(); PAL.save(); this.renderPalette(); }; box.appendChild(r); };
      add('plus', 'Nueva paleta', async () => { const n = await this.prompt('Nueva paleta', 'Mi paleta ' + (PAL.list.length + 1)); if (n) { PAL.list.push({ name: n, colors: [] }); PAL.cur = PAL.list.length - 1; } });
      add('image', 'Paleta desde el dibujo', async () => { const c = compositeFrame(doc.frame, false, Math.min(1, 200 / Math.max(doc.w, doc.h))); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const m = new Map(); for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { const k = hex(d[i] & 0xf0, d[i + 1] & 0xf0, d[i + 2] & 0xf0); m.set(k, (m.get(k) || 0) + 1); } const cols = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24).map(e => e[0]); if (!cols.length) { this.toast('El dibujo está vacío'); return; } PAL.list.push({ name: doc.name, colors: cols }); PAL.cur = PAL.list.length - 1; });
      add('pencil', 'Renombrar paleta', async () => { const n = await this.prompt('Nombre', PAL.list[PAL.cur].name); if (n) PAL.list[PAL.cur].name = n; });
      add('download', 'Exportar paleta (.gpl)', async () => { const p = PAL.list[PAL.cur]; const txt = 'GIMP Palette\nName: ' + p.name + '\n#\n' + p.colors.map(c => { const [r, g, b] = parseHex(c); return `${r} ${g} ${b}\t${c}`; }).join('\n'); this.download(new Blob([txt], { type: 'text/plain' }), p.name + '.gpl'); });
      add('upload', 'Importar paleta (.gpl / .txt)', async () => { const f = await this.pickFile('.gpl,.txt,.hex', false); if (!f.length) return; const t = await f[0].text(); const cols = []; for (const ln of t.split(/\r?\n/)) { const m = ln.match(/^\s*(\d+)\s+(\d+)\s+(\d+)/); if (m) cols.push(hex(+m[1], +m[2], +m[3])); else { const h = ln.match(/#?([0-9a-f]{6})/i); if (h) cols.push('#' + h[1].toLowerCase()); } } if (cols.length) { PAL.list.push({ name: f[0].name.replace(/\.[^.]+$/, ''), colors: cols }); PAL.cur = PAL.list.length - 1; } else this.toast('No encontré colores'); });
      add('trash', 'Eliminar paleta', async () => { if (PAL.list.length < 2) { this.toast('Debe quedar al menos una paleta'); return; } if (await this.confirm('Eliminar paleta', '¿Eliminar “' + PAL.list[PAL.cur].name + '”?', 'Eliminar', true)) { PAL.list.splice(PAL.cur, 1); PAL.cur = 0; } }, true);
      body.appendChild(box);
    });
  },

  /* capas */
  buildLayerSec() {
    const s = $('.psec[data-s="layers"]');
    s.innerHTML = `<div class="llist"></div><div class="lact"><button class="ib" data-l="add" title="Nueva capa">${ic('plus')}</button><button class="ib" data-l="img" title="Importar imagen como capa">${ic('image')}</button><button class="ib" data-l="folder" title="Nueva carpeta">${ic('folder')}</button><button class="ib" data-l="dup" title="Duplicar">${ic('copy')}</button><button class="ib" data-l="merge" title="Combinar hacia abajo">${ic('merge')}</button><button class="ib" data-l="up" title="Subir">${ic('up')}</button><button class="ib" data-l="down" title="Bajar">${ic('down')}</button><button class="ib" data-l="clear" title="Limpiar capa">${ic('clear')}</button><button class="ib" data-l="del" title="Eliminar">${ic('trash')}</button></div><div class="lopts"><div class="row"><button class="ib" id="lClip" title="Máscara de recorte (pintar solo sobre la capa de abajo)">${ic('clip')}</button><button class="ib" id="lAlpha" title="Bloquear transparencia">${ic('alock')}</button><button class="ib" id="lLock" title="Bloquear capa">${ic('lock')}</button><button class="fontbtn" id="lBlend" style="flex:1;min-width:0;height:40px"><span></span>${ic('down')}</button></div><div class="row"><button class="fontbtn" id="lTone" style="flex:1;height:40px" title="Trama de manga"><span></span>${ic('down')}</button></div><div class="lop"></div><div class="row"><span class="lbl">Fondo</span><div class="bgsel"><button data-bg="white" style="background:#fff" title="Blanco"></button><button data-bg="transparent" style="background:repeating-conic-gradient(#888 0 25%,#ddd 0 50%) 0 0/10px 10px" title="Transparente"></button><button data-bg="black" style="background:#000" title="Negro"></button><button data-bg="custom" title="Color actual" class="bgc"></button></div></div></div>`;
    $$('.lact .ib', s).forEach(b => b.onclick = () => this.layerAct(b.dataset.l));
    $('#lBlend', s).onclick = () => this.pickBlend(); $('#lTone', s).onclick = () => this.pickTone();
    this.lOp = SRow('Opacidad de la capa', { min: 0, max: 1, value: 1, step: .01, cls: 'chk', fmt: v => Math.round(v * 100) + '%', onInput: v => { if (!this._opB) this._opB = capStruct(); AL().opacity = v; requestRender(); }, onEnd: () => { const b = this._opB; this._opB = null; if (b) { pushUndo({ type: 'st', before: b, after: capStruct() }); this.refreshLayers(); } } });
    $('.lop', s).appendChild(this.lOp.el);
    $('#lClip', s).onclick = () => { if (FR().active === 0) { this.toast('La capa del fondo no puede recortarse'); return; } structOp(() => { AL().clip = !AL().clip; }); };
    $('#lAlpha', s).onclick = () => structOp(() => { AL().alphaLock = !AL().alphaLock; });
    $('#lLock', s).onclick = () => structOp(() => { AL().locked = !AL().locked; });
    $$('.bgsel button', s).forEach(b => b.onclick = () => structOp(() => { doc.bg = b.dataset.bg === 'custom' ? hex(...S.color) : b.dataset.bg; }));
  },
  refreshLayers() {
    if (!doc) return; const s = $('.psec[data-s="layers"]'); const list = $('.llist', s); const f = FR(); list.innerHTML = '';
    let lastF = undefined;
    for (let i = f.layers.length - 1; i >= 0; i--) {
      const l = f.layers[i]; const fo = fold(l);
      if ((l.folder || null) !== lastF) { lastF = l.folder || null; if (fo) { const fid = l.folder, n = f.layers.filter(x => x.folder === fid).length; const h = el(`<div class="lrow" style="padding:8px 6px;background:var(--g3)"><button class="ib fx2">${ic(fo.open === false ? 'back' : 'down')}</button>${ic('folder')}<div class="li"><b>${esc(fo.name)}</b><small>${n} capa(s) · ${Math.round((fo.opacity ?? 1) * 100)}%</small></div><button class="ib eye">${ic(fo.visible === false ? 'eyeoff' : 'eye')}</button><div class="dh" title="Arrastra para mover">${ic('drag')}</div></div>`); h.dataset.kind = 'folder'; h.dataset.fid = fid; if (fo.open === false) h.querySelector('.fx2 svg').style.transform = 'rotate(180deg)'; h.querySelector('.fx2').onclick = e => { e.stopPropagation(); fo.open = fo.open === false; S.dirty = true; this.refreshLayers(); }; h.querySelector('.eye').onclick = e => { e.stopPropagation(); structOp(() => { fo.visible = fo.visible === false; }); }; h.onclick = e => { if (this._dragJust || e.target.closest('.dh')) return; this.folderMenu(fid); }; list.appendChild(h); } }
      if (fo && fo.open === false) continue;
      const r = el(`<div class="lrow ${i === f.active ? 'on' : ''} ${l.visible ? '' : 'hid'}" style="margin-left:${(fo ? 16 : 0) + (l.clip ? 18 : 0)}px"><div class="lth"></div><div class="li"><b>${l.clip ? '↳ ' : ''}${esc(l.name)}</b><small>${Math.round(l.opacity * 100)}% · ${BLEND_NAME[l.blend] || l.blend}${l.locked ? ' · 🔒' : ''}${l.alphaLock ? ' · α' : ''}${l.tone ? ' · trama' : ''}${l.frames ? ' · marcos' : ''}</small></div><button class="ib eye">${ic(l.visible ? 'eye' : 'eyeoff')}</button><div class="dh" title="Arrastra para mover">${ic('drag')}</div></div>`); r.dataset.kind = 'layer'; r.dataset.i = i;
      const th = mkCanvas(108, 108), tx = th.getContext('2d'), k = Math.min(108 / doc.w, 108 / doc.h); th.width = Math.max(1, Math.round(doc.w * k)); th.height = Math.max(1, Math.round(doc.h * k)); th.getContext('2d').drawImage(layerSource(l), 0, 0, th.width, th.height); r.querySelector('.lth').appendChild(th);
      r.onclick = e => { if (e.target.closest('.eye') || e.target.closest('.dh') || this._dragJust) return; if (S.textObj) TXT.commit(); if (f.active === i) { this.layerMenu(); return; } f.active = i; this.refreshLayers(); requestRender(); };
      r.querySelector('.eye').onclick = () => structOp(() => { l.visible = !l.visible; });
      list.appendChild(r);
    }
    this.bindLayerDrag(list);
    const a = AL(); $('#lBlend span').textContent = 'Modo: ' + (BLEND_NAME[a.blend] || a.blend); $('#lTone span').textContent = a.tone ? 'Trama: ' + (TONES.find(t => t[0] === a.tone) || ['', a.tone])[1] : 'Sin trama'; this.lOp.set(a.opacity);
    $('#lClip').classList.toggle('on', a.clip); $('#lAlpha').classList.toggle('on', a.alphaLock); $('#lLock').classList.toggle('on', a.locked);
    $$('.bgsel button', s).forEach(b => b.classList.toggle('on', b.dataset.bg === doc.bg || (b.dataset.bg === 'custom' && !['white', 'black', 'transparent'].includes(doc.bg))));
    $('.bgc', s).style.background = !['white', 'black', 'transparent'].includes(doc.bg) ? doc.bg : 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)';
    $('#dLayers b').textContent = f.layers.length;
  },
  /* arrastrar capas y carpetas para reordenarlas */
  bindLayerDrag(list) {
    const rows = [...list.children].filter(r => r.dataset.kind);
    const begin = (row, ev) => {
      if (S.textObj) TXT.commit();
      const f = FR(), rects = rows.map(r => r.getBoundingClientRect()), lr = list.getBoundingClientRect(); const ind = el('<div style="position:absolute;left:6px;right:6px;height:3px;border-radius:2px;background:var(--acc);pointer-events:none;z-index:3"></div>');
      list.style.position = 'relative'; list.appendChild(ind); row.style.zIndex = 4; row.style.position = 'relative'; row.style.boxShadow = '0 8px 22px rgba(0,0,0,.45)'; row.style.opacity = '.92';
      const y0 = ev.clientY, st0 = list.scrollTop; let slot = rows.indexOf(row), raf = 0, lastY = y0;
      const calc = y => { let k = rows.length; for (let j = 0; j < rows.length; j++) { const rc = rects[j], mid = rc.top + rc.height / 2 - (list.scrollTop - st0); if (y < mid) { k = j; break; } } return k; };
      const paint = () => { const dy = lastY - y0 + (list.scrollTop - st0); row.style.transform = `translateY(${dy}px)`; slot = calc(lastY); const ref = rows[slot] ? rects[slot].top : rects[rects.length - 1].bottom + 4; ind.style.top = (ref - lr.top + st0 - 3) + 'px'; };
      const scroll = () => { const r = list.getBoundingClientRect(); if (lastY < r.top + 40) list.scrollTop -= 8; else if (lastY > r.bottom - 40) list.scrollTop += 8; paint(); raf = requestAnimationFrame(scroll); };
      const mv = e => { e.preventDefault(); lastY = e.clientY; paint(); };
      const end = () => { cancelAnimationFrame(raf); removeEventListener('pointermove', mv); removeEventListener('pointerup', end); removeEventListener('pointercancel', end); ind.remove(); this._dragJust = true; setTimeout(() => this._dragJust = false, 60); this.dropLayer(row, rows, slot); };
      addEventListener('pointermove', mv, { passive: false }); addEventListener('pointerup', end); addEventListener('pointercancel', end); raf = requestAnimationFrame(scroll); paint();
    };
    for (const row of rows) {
      const h = row.querySelector('.dh'); if (h) h.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); begin(row, e); });
      let lt = 0, sx = 0, sy = 0; row.addEventListener('pointerdown', e => { if (e.target.closest('.dh') || e.target.closest('.eye') || e.target.closest('.fx2')) return; sx = e.clientX; sy = e.clientY; lt = setTimeout(() => { lt = 0; navigator.vibrate && navigator.vibrate(15); begin(row, e); }, 420); });
      const cl = e => { if (lt && (e.type !== 'pointermove' || Math.hypot(e.clientX - sx, e.clientY - sy) > 8)) { clearTimeout(lt); lt = 0; } };
      row.addEventListener('pointermove', cl); row.addEventListener('pointerup', cl); row.addEventListener('pointercancel', cl);
    }
  },
  dropLayer(row, rows, slot) {
    const f = FR(), act = AL(), src = rows.indexOf(row); if (slot === src || slot === src + 1) { this.refreshLayers(); return; }
    const above = rows[slot - 1], below = rows[slot];
    const L0 = f.layers, layerOf = r => L0[+r.dataset.i], topOfFolder = fid => { let t = null; L0.forEach(x => { if (x.folder === fid) t = x; }); return t; };
    structOp(() => {
      let block, newFolder;
      if (row.dataset.kind === 'layer') { const l = layerOf(row); block = [l];
        if (above && above.dataset.kind === 'folder') newFolder = above.dataset.fid;
        else if (above && below && above.dataset.kind === 'layer' && below.dataset.kind === 'layer' && layerOf(above).folder && layerOf(above).folder === layerOf(below).folder) newFolder = layerOf(above).folder;
        else newFolder = (above && above.dataset.kind === 'layer' && layerOf(above).folder && below && below.dataset.kind === 'layer' && layerOf(below).folder === layerOf(above).folder) ? layerOf(above).folder : null;
        if (newFolder && below && below.dataset.kind === 'layer' && layerOf(below).folder !== newFolder && above.dataset.kind !== 'folder') newFolder = null;
        l.folder = newFolder;
      } else { const fid = row.dataset.fid; block = L0.filter(x => x.folder === fid); }
      let anchor = null;
      if (below) { anchor = below.dataset.kind === 'layer' ? layerOf(below) : topOfFolder(below.dataset.fid); }
      if (row.dataset.kind === 'folder' && anchor && anchor.folder && anchor.folder !== row.dataset.fid) anchor = topOfFolder(anchor.folder);
      if (anchor && block.includes(anchor)) { const lowest = L0.indexOf(block[0]); anchor = lowest > 0 ? L0[lowest - 1] : null; }
      f.layers = L0.filter(x => !block.includes(x)); const at = anchor ? f.layers.indexOf(anchor) + 1 : 0; f.layers.splice(at, 0, ...block);
      if (f.layers[0]) f.layers[0].clip = false; f.active = f.layers.indexOf(act);
    });
  },
  pickBlend() {
    this.sheet('blend', 'Modo de combinación', body => {
      for (const [g, items] of BLENDS) { if (g !== 'Normal') body.appendChild(el(`<div class="sec-t">${g}</div>`)); const box = el('<div class="box" style="padding:4px"></div>'); for (const [v, n] of items) { const r = el(`<div class="list-row" style="${AL().blend === v ? 'background:var(--acc-t)' : ''}"><div class="grow">${n}</div>${AL().blend === v ? ic('check') : ''}</div>`); r.onclick = () => { structOp(() => { AL().blend = v; }); this.closeSheet('blend'); }; box.appendChild(r); } body.appendChild(box); }
    });
  },
  pickTone() {
    this.sheet('tone', 'Trama', body => {
      body.appendChild(el('<p style="color:var(--tx2);font-size:12.5px;margin:0 4px 8px">La capa se muestra con el patrón. Pinta en gris o negro y verás la trama.</p>'));
      const g = el('<div class="grid-tools" style="grid-template-columns:repeat(3,1fr)"></div>');
      for (const [v, n] of TONES) { const b = el(`<button class="tbtn ${(AL().tone || '') === v ? 'on' : ''}"><canvas width="64" height="40" style="width:64px;height:40px;border-radius:6px;background:#fff"></canvas>${n}</button>`); if (v) { const c = b.querySelector('canvas').getContext('2d'); c.fillStyle = c.createPattern(tonePattern(v), 'repeat'); c.fillRect(0, 0, 64, 40); } b.onclick = () => { structOp(() => { AL().tone = v; }); this.closeSheet('tone'); }; g.appendChild(b); }
      body.appendChild(g);
    });
  },
  layerAct(a) {
    if (S.textObj) TXT.commit(); const f = FR(), i = f.active, l = AL();
    if (a === 'add') structOp(() => { const n = newLayer('Capa ' + (f.layers.length + 1)); n.folder = l.folder || null; f.layers.splice(i + 1, 0, n); f.active = i + 1; });
    if (a === 'img') { this.importLayer(); return; }
    if (a === 'folder') structOp(() => { doc.folders = doc.folders || {}; const id = uid(), k = Object.keys(doc.folders).length + 1; doc.folders[id] = { name: 'Carpeta ' + k, visible: true, opacity: 1, open: true }; l.folder = id; });
    if (a === 'dup') structOp(() => { const n = newLayer(l.name + ' copia'); Object.assign(n, layerProps(l)); n.folder = l.folder || null; n.name = l.name + ' copia'; n.ctx.drawImage(l.canvas, 0, 0); f.layers.splice(i + 1, 0, n); f.active = i + 1; });
    if (a === 'up' && i < f.layers.length - 1) structOp(() => { [f.layers[i], f.layers[i + 1]] = [f.layers[i + 1], f.layers[i]]; f.active = i + 1; });
    if (a === 'down' && i > 0) structOp(() => { [f.layers[i], f.layers[i - 1]] = [f.layers[i - 1], f.layers[i]]; f.active = i - 1; });
    if (a === 'del') { if (f.layers.length < 2) { this.toast('Debe quedar al menos una capa'); return; } structOp(() => { f.layers.splice(i, 1); f.active = Math.max(0, i - 1); if (f.layers[0]) f.layers[0].clip = false; }); }
    if (a === 'clear') { if (l.locked) { this.toast('Capa bloqueada'); return; } const e = capPx(l); if (l.frames) { e.metaBefore = JSON.stringify(l.frames); l.frames = null; e.metaAfter = 'null'; } l.ctx.clearRect(0, 0, doc.w, doc.h); pushUndo(e); changed(true); }
    if (a === 'merge') {
      if (i === 0) { this.toast('No hay capa debajo'); return; } const below = f.layers[i - 1]; if (below.locked) { this.toast('La capa de abajo está bloqueada'); return; }
      const pe = capPx(below), before = capStruct(); const tmpG = { gcanvas: null };
      const c = mkCanvas(doc.w, doc.h), x = c.getContext('2d'); drawLayers(x, [Object.assign({}, below, { blend: 'source-over', opacity: 1, clip: false }), l], tmpG);
      below.ctx.clearRect(0, 0, doc.w, doc.h); below.ctx.drawImage(c, 0, 0); below.opacity = below.opacity; below.tone = ''; if (below.frames) below.frames = null; below.ver++;
      f.layers.splice(i, 1); f.active = i - 1; pushUndo({ type: 'multi', list: [pe, { type: 'st', before, after: capStruct() }] }); changed(true);
    }
  },
  folderMenu(fid) {
    const fo = doc.folders[fid]; if (!fo) return; const f = FR();
    this.sheet('fmenu', 'Carpeta: ' + fo.name, body => {
      const b = el('<div class="box"></div>'); let before = null;
      b.appendChild(SRow('Opacidad de la carpeta', { min: 0, max: 1, value: fo.opacity ?? 1, step: .01, cls: 'chk', fmt: v => Math.round(v * 100) + '%', onInput: v => { if (!before) before = capStruct(); fo.opacity = v; requestRender(); }, onEnd: () => { if (before) { pushUndo({ type: 'st', before, after: capStruct() }); before = null; this.refreshLayers(); } } }).el); body.appendChild(b);
      const box = el('<div class="box" style="padding:4px;margin-top:10px"></div>');
      const add = (icn, t, fn, dng) => { const r = el(`<div class="list-row ${dng ? 'danger' : ''}">${ic(icn)}<div class="grow">${t}</div></div>`); r.onclick = async () => { this.closeSheet('fmenu'); await fn(); }; box.appendChild(r); };
      add('pencil', 'Renombrar carpeta', async () => { const n = await this.prompt('Nombre de la carpeta', fo.name); if (n) structOp(() => { fo.name = n; }); });
      add('plus', 'Nueva capa dentro', () => structOp(() => { let top = -1; f.layers.forEach((x, i) => { if (x.folder === fid) top = i; }); const n = newLayer('Capa ' + (f.layers.length + 1)); n.folder = fid; f.layers.splice(top + 1, 0, n); f.active = top + 1; }));
      add('merge', 'Combinar la carpeta en una capa', () => { const idx = f.layers.map((x, i) => x.folder === fid ? i : -1).filter(i => i >= 0); if (!idx.length) return; structOp(() => { const n = newLayer(fo.name); const tmpF = { ...fo, visible: true }; const save = doc.folders[fid]; doc.folders[fid] = tmpF; drawLayers(n.ctx, idx.map(i => f.layers[i]), {}); doc.folders[fid] = save; const at = idx[0]; f.layers = f.layers.filter(x => x.folder !== fid); f.layers.splice(at, 0, n); f.active = at; delete doc.folders[fid]; }); });
      add('layers', 'Sacar las capas de la carpeta', () => structOp(() => { f.layers.forEach(x => { if (x.folder === fid) x.folder = null; }); delete doc.folders[fid]; }));
      add('trash', 'Eliminar carpeta y sus capas', async () => { if (f.layers.every(x => x.folder === fid)) { this.toast('Debe quedar al menos una capa fuera'); return; } if (await this.confirm('Eliminar carpeta', '¿Eliminar “' + fo.name + '” con todas sus capas?', 'Eliminar', true)) structOp(() => { f.layers = f.layers.filter(x => x.folder !== fid); f.active = Math.min(f.active, f.layers.length - 1); delete doc.folders[fid]; }); }, true);
      body.appendChild(box);
    });
  },
  moveToFolder() {
    const l = AL(); const fs = Object.entries(doc.folders || {});
    this.sheet('tofold', 'Mover a carpeta', body => {
      const box = el('<div class="box" style="padding:4px"></div>');
      const add = (t, fid) => { const r = el(`<div class="list-row" style="${(l.folder || null) === fid ? 'background:var(--acc-t)' : ''}">${ic(fid ? 'folder' : 'layers')}<div class="grow">${esc(t)}</div></div>`); r.onclick = () => { this.closeSheet('tofold'); structOp(() => { const f = FR(); f.layers.splice(f.active, 1); l.folder = fid; let at = f.layers.length; if (fid) { let top = -1; f.layers.forEach((x, i) => { if (x.folder === fid) top = i; }); if (top >= 0) at = top + 1; } f.layers.splice(at, 0, l); f.active = at; }); }; box.appendChild(r); };
      add('Sin carpeta', null); for (const [id, fo] of fs) add(fo.name, id);
      const nw = el(`<div class="list-row">${ic('plus')}<div class="grow">Nueva carpeta</div></div>`); nw.onclick = () => { this.closeSheet('tofold'); this.layerAct('folder'); }; box.appendChild(nw);
      body.appendChild(box);
    });
  },
  layerMenu() {
    const l = AL();
    this.sheet('lmenu', 'Capa: ' + l.name, body => {
      const box = el('<div class="box" style="padding:4px"></div>');
      const add = (icn, t, fn, sub) => { const r = el(`<div class="list-row">${ic(icn)}<div class="grow">${t}${sub ? `<div class="sub">${sub}</div>` : ''}</div></div>`); r.onclick = async () => { this.closeSheet('lmenu'); await fn(); }; box.appendChild(r); };
      add('pencil', 'Renombrar capa', async () => { const n = await this.prompt('Nombre de la capa', l.name); if (n) structOp(() => { l.name = n; }); });
      add('copy', 'Clonar capa', () => this.layerAct('dup'));
      add('folder', 'Añadir carpeta', () => this.layerAct('folder'), 'Mete esta capa en una carpeta nueva');
      add('folder', 'Mover a carpeta…', () => this.moveToFolder(), l.folder && doc.folders[l.folder] ? 'Ahora en “' + doc.folders[l.folder].name + '”' : 'Ahora sin carpeta');
      add('layers', 'Añadir capa desde el lienzo', () => structOp(() => { const n = newLayer('Lienzo combinado'); drawLayers(n.ctx, FR().layers, {}); FR().layers.splice(FR().active + 1, 0, n); FR().active++; }), 'Copia de todo lo visible en una capa nueva');
      add('alpha', 'Seleccionar opacidad', () => SEL.fromAlpha(l), 'Selecciona lo dibujado en esta capa');
      add('image', 'Importar imagen como capa', () => this.importLayer());
      add('flip', 'Voltear capa horizontal', () => this.flipLayer(true)); add('flipv', 'Voltear capa vertical', () => this.flipLayer(false));
      add(l.locked ? 'unlock' : 'lock', l.locked ? 'Desbloquear capa' : 'Bloquear capa', () => structOp(() => { l.locked = !l.locked; }));
      if (l.frames) add('frame', 'Rasterizar marcos', () => FRAMES.rasterize(l), 'Convierte los marcos en una capa normal');
      add('fx', 'Filtros…', () => FX.open()); add('bgx', 'Quitar fondo…', () => BGX.enter());
      add('download', 'Guardar como PNG transparente', async () => { this.download(await toBlob(layerSource(l)), (doc.name + ' - ' + l.name).replace(/[\\/:*?"<>|]/g, '') + '.png'); });
      body.appendChild(box);
    });
  },
  flipLayer(hz) { const l = AL(); if (!canEdit()) return; const e = capPx(l), c = cloneCanvas(l.canvas); l.ctx.clearRect(0, 0, doc.w, doc.h); l.ctx.save(); if (hz) { l.ctx.translate(doc.w, 0); l.ctx.scale(-1, 1); } else { l.ctx.translate(0, doc.h); l.ctx.scale(1, -1); } l.ctx.drawImage(c, 0, 0); l.ctx.restore(); pushUndo(e); changed(); },
  async importLayer() { const f = await this.pickFile('image/*', false); if (!f.length) return; const im = await fileToImage(f[0]).catch(() => null); if (!im) { this.toast('No se pudo abrir la imagen'); return; } this.closePanel(); IMGF.start(im, f[0].name.replace(/\.[^.]+$/, '')); },
  openBalloons() {
    this.sheet('balpick', 'Globos de texto', body => {
      const g = el('<div class="grid-tools" style="grid-template-columns:repeat(3,1fr)"></div>');
      for (const [k, n] of BALLOONS) { const b = el(`<button class="tbtn" style="padding:8px 4px"></button>`); const c = BAL.preview(k); c.style.cssText = 'width:96px;height:72px;background:#d9dbe0;border-radius:8px'; b.appendChild(c); b.appendChild(document.createTextNode(n)); b.onclick = () => { this.closeSheet('balpick'); this.closePanel(); BAL.start(k); }; g.appendChild(b); }
      body.appendChild(g);
    });
  },
  openBalloonSheet() {
    this.sheet('bal', 'Globo: ' + (BALLOONS.find(b => b[0] === S.balloon.type) || [0, ''])[1], body => {
      const o = S.balloon, up = () => requestRender();
      body.appendChild(el('<p style="color:var(--tx2);font-size:12.5px;margin:0 4px 8px">Arrastra el globo para moverlo · esquinas para el tamaño · punto naranja para la cola.</p>'));
      const ta = el('<textarea class="inp" style="width:100%" rows="2" placeholder="Texto del globo (opcional)"></textarea>'); ta.value = o.text; ta.oninput = () => { o.text = ta.value; up(); }; body.appendChild(ta);
      const fr = el('<div style="display:flex;gap:6px;overflow-x:auto;margin:8px 0;scrollbar-width:none"></div>');
      for (const f of ['Comic Neue', 'Bangers', 'Permanent Marker', 'Luckiest Guy', 'Kalam', 'Noto Sans JP', 'Press Start 2P', 'system-ui']) { const b = el(`<button class="pill-btn ${o.font === f ? 'on' : ''}" style="flex:none;font-family:'${f}',system-ui">${f === 'system-ui' ? 'Sistema' : f}</button>`); b.onclick = () => { o.font = f; $$('.pill-btn', fr).forEach(x => x.classList.toggle('on', x === b)); up(); }; fr.appendChild(b); }
      body.appendChild(fr);
      const box = el('<div class="box"></div>');
      box.appendChild(SRow('Tamaño de letra', { min: 6, max: 300, value: o.size, step: 1, unit: 'px', onInput: v => { o.size = v; up(); } }).el);
      box.appendChild(SRow('Grosor del borde', { min: 0, max: 30, value: o.lw, step: .5, unit: 'px', onInput: v => { o.lw = v; up(); } }).el);
      const tg = (lbl, key) => { const r = el(`<div class="row"><span class="lbl">${lbl}</span></div>`); r.appendChild(Toggle(o[key], v => { o[key] = v; up(); })); box.appendChild(r); };
      tg('Con cola', 'hasTail'); tg('Negrita', 'bold'); tg('Texto vertical (manga)', 'vertical');
      for (const [lbl, key] of [['Relleno', 'fill'], ['Borde', 'stroke'], ['Color del texto', 'tcol']]) { const r = el(`<div class="row"><span class="lbl">${lbl}</span></div>`); r.appendChild(this.colorBtn(o[key], c => { o[key] = c; up(); })); box.appendChild(r); }
      const sh = el(`<button class="btn" style="margin-top:6px">${ic('rotate')}Otra forma al azar</button>`); sh.onclick = () => { o.seed = (Math.random() * 1e6) | 0; up(); }; box.appendChild(sh);
      body.appendChild(box);
      const row = el('<div class="row" style="margin-top:10px;gap:8px"><button class="btn" style="flex:1">Cancelar</button><button class="btn pri" style="flex:2">Colocar</button></div>'); row.children[0].onclick = () => BAL.cancel(); row.children[1].onclick = () => BAL.commit(); body.appendChild(row);
    }, { dock: true, okIcon: 'check', onOk: () => BAL.commit() });
    $('#scrim').classList.remove('show');
  },
  openImgSheet() {
    this.sheet('imgf', 'Colocar imagen', body => {
      const o = S.imgObj; body.appendChild(el('<p style="color:var(--tx2);font-size:12.5px;margin:0 4px 8px">Arrastra la imagen para moverla · esquinas para el tamaño · ↻ para rotar.</p>'));
      body.appendChild(SRow('Opacidad', { min: 0, max: 1, value: o.op, step: .01, fmt: v => Math.round(v * 100) + '%', onInput: v => { o.op = v; requestRender(); } }).el);
      const g = el('<div class="grid-tools" style="grid-template-columns:repeat(4,1fr);margin-top:8px"></div>');
      const b = (icn, t, fn) => { const x = el(`<button class="tbtn">${ic(icn)}${t}</button>`); x.onclick = fn; g.appendChild(x); };
      b('flip', 'Voltear', () => { o.fx *= -1; requestRender(); });
      b('rotate', 'Girar 90°', () => { o.rot += Math.PI / 2; requestRender(); });
      b('fit', 'Ajustar', () => { o.sc = Math.min(doc.w / o.img.width, doc.h / o.img.height); o.x = doc.w / 2; o.y = doc.h / 2; o.rot = 0; requestRender(); });
      b('grid', 'Llenar', () => { o.sc = Math.max(doc.w / o.img.width, doc.h / o.img.height); o.x = doc.w / 2; o.y = doc.h / 2; o.rot = 0; requestRender(); });
      body.appendChild(g);
      const row = el('<div class="row" style="margin-top:10px;gap:8px"><button class="btn" style="flex:1">Cancelar</button><button class="btn pri" style="flex:2">Colocar</button></div>'); row.children[0].onclick = () => IMGF.cancel(); row.children[1].onclick = () => IMGF.commit(); body.appendChild(row);
    }, { dock: true, okIcon: 'check', onOk: () => IMGF.commit() });
    $('#scrim').classList.remove('show');
  },

  /* ---------- herramientas (teléfono) y opciones ---------- */
  openTools() {
    this.sheet('tools', 'Herramientas', body => {
      const g = el('<div class="grid-tools"></div>');
      for (const [id, name, icn] of TOOLS) { const b = el(`<button class="tbtn ${(S.frameTool ? id === 'frame' : id === S.tool) ? 'on' : ''}">${ic(icn)}${name}</button>`); b.onclick = () => { if (id === 'frame') { this.closeSheet('tools'); this.openFrameMenu(); return; } this.setTool(id); if (!['fill', 'shape', 'select', 'text'].includes(id)) this.closeSheet('tools'); }; g.appendChild(b); }
      const fxb = el(`<button class="tbtn">${ic('fx')}Filtros</button>`); fxb.onclick = () => { this.closeSheet('tools'); FX.open(); }; g.appendChild(fxb);
      const bg = el(`<button class="tbtn">${ic('bgx')}Quitar fondo</button>`); bg.onclick = () => { this.closeSheet('tools'); BGX.enter(); }; g.appendChild(bg);
      const bal = el(`<button class="tbtn">${ic('bubble')}Globos</button>`); bal.onclick = () => { this.closeSheet('tools'); this.openBalloons(); }; g.appendChild(bal);
      const aib = el(`<button class="tbtn">${ic('ai')}Asistente IA</button>`); aib.onclick = () => { this.closeSheet('tools'); this.openAI(); }; g.appendChild(aib);
      body.appendChild(g); this.toolOpts(body);
    });
  },
  toolOpts(body) {
    const t = S.tool; const box = el('<div class="box" style="margin-top:12px"></div>');
    if (t === 'fill' || (t === 'select' && S.selMode === 'wand')) {
      box.appendChild(SRow('Tolerancia', { min: 0, max: 255, value: S.fillTol, step: 1, onInput: v => S.fillTol = v }).el);
      const r = el('<div class="row"><span class="lbl">Referencia: todas las capas</span></div>'); r.appendChild(Toggle(S.fillAll, v => S.fillAll = v)); box.appendChild(r);
      if (t === 'fill') box.appendChild(SRow('Expandir', { min: 0, max: 4, value: S.fillGrow, step: 1, unit: 'px', onInput: v => S.fillGrow = v }).el);
    }
    if (t === 'select') { box.prepend(Seg([['rect', ic('select') + 'Rectángulo'], ['lasso', ic('lasso') + 'Lazo'], ['wand', ic('wand') + 'Varita']], S.selMode, v => { S.selMode = v; this.openTools(); })); box.appendChild(el('<p style="color:var(--tx2);font-size:12.5px;margin:8px 2px 0">Con Mayús (PC) se suma a la selección. Más opciones en el botón de selección de arriba.</p>')); }
    if (t === 'shape') { const g = el('<div class="grid-tools" style="grid-template-columns:repeat(3,1fr)"></div>'); for (const [v, n] of SHAPES) { const b = el(`<button class="tbtn ${S.shape === v ? 'on' : ''}">${n}</button>`); b.onclick = () => { S.shape = v; this.openTools(); }; g.appendChild(b); } box.appendChild(g); const r = el('<div class="row" style="margin-top:6px"><span class="lbl">Relleno</span></div>'); r.appendChild(Toggle(S.shapeFill, v => S.shapeFill = v)); box.appendChild(r); box.appendChild(el('<p style="color:var(--tx2);font-size:12.5px;margin:4px 2px 0">Usa el grosor y la opacidad de la barra lateral. Mayús = proporción exacta.</p>')); }
    if (t === 'text') box.appendChild(el('<p style="color:var(--tx2);margin:0">Toca el lienzo donde quieras poner el texto.</p>'));
    if (box.children.length) body.appendChild(box);
  },

  /* ---------- trazo ---------- */
  openStab() {
    this.sheet('stab', 'Trazo', body => {
      const b1 = el('<div class="box"></div>'); b1.appendChild(SRow('Estabilizador', { min: 0, max: 10, value: S.stab, step: 1, fmt: v => v ? v + '' : 'No', onInput: v => { S.stab = v; store.set('stab2', v); this.bStab.set(v); } }).el);
      b1.appendChild(el('<p style="color:var(--tx2);font-size:12.5px;margin:6px 2px 0">Más alto = líneas más suaves pero con más retraso.</p>')); body.appendChild(b1);
      body.appendChild(el('<div class="sec-t">Atenuación</div>')); const b2 = el('<div class="box"></div>');
      const r = el('<div class="row"><span class="lbl">Forzar atenuación (puntas finas)</span></div>'); r.appendChild(Toggle(S.taper.on, v => { S.taper.on = v; store.set('taper', S.taper); })); b2.appendChild(r);
      b2.appendChild(SRow('Longitud del principio', { min: 0, max: 1, value: S.taper.start, step: .01, fmt: v => Math.round(v * 100) + '%', onInput: v => { S.taper.start = v; store.set('taper', S.taper); } }).el);
      b2.appendChild(SRow('Longitud del final', { min: 0, max: 1, value: S.taper.end, step: .01, fmt: v => Math.round(v * 100) + '%', onInput: v => { S.taper.end = v; store.set('taper', S.taper); } }).el);
      body.appendChild(b2);
      body.appendChild(el('<div class="sec-t">Herramienta de forma</div>')); const g = el('<div class="grid-tools" style="grid-template-columns:repeat(3,1fr)"></div>');
      const off = el(`<button class="tbtn ${S.tool !== 'shape' ? 'on' : ''}">Libre</button>`); off.onclick = () => { if (S.tool === 'shape') this.setTool('brush'); this.openStab(); }; g.appendChild(off);
      for (const [v, n] of SHAPES) { const b = el(`<button class="tbtn ${S.tool === 'shape' && S.shape === v ? 'on' : ''}">${n}</button>`); b.onclick = () => { S.shape = v; this.setTool('shape'); this.openStab(); }; g.appendChild(b); }
      body.appendChild(g);
    });
  },
  /* ---------- regla y simetría ---------- */
  openRuler() {
    this.sheet('ruler', 'Regla y simetría', body => {
      body.appendChild(el('<div class="sec-t">Regla</div>'));
      body.appendChild(Seg([['off', 'No'], ['line', 'Recta'], ['circle', 'Círculos'], ['radial', 'Fuga']], S.ruler.mode, v => { S.ruler.mode = v; RULER.ensure(); requestRender(); $('#bRuler').classList.toggle('on', v !== 'off' || S.sym.mode !== 'off'); }));
      body.appendChild(el('<p style="color:var(--tx2);font-size:12.5px;margin:8px 4px">Arrastra los puntos verdes en el lienzo para mover la regla.</p>'));
      body.appendChild(el('<div class="sec-t">Simetría</div>'));
      body.appendChild(Seg([['off', 'No'], ['v', 'Espejo'], ['h', 'Vertical'], ['quad', 'Cuádruple'], ['radial', 'Radial']], S.sym.mode, v => { S.sym.mode = v; requestRender(); $('#bRuler').classList.toggle('on', v !== 'off' || S.ruler.mode !== 'off'); }));
      const b = el('<div class="box" style="margin-top:10px"></div>'); b.appendChild(SRow('Divisiones (radial)', { min: 3, max: 16, value: S.sym.n, step: 1, onInput: v => { S.sym.n = v; requestRender(); } }).el); body.appendChild(b);
    });
  },
  /* ---------- selección ---------- */
  openSelect() {
    this.sheet('sel', 'Selección', body => {
      body.appendChild(Seg([['rect', ic('select') + 'Rect.'], ['lasso', ic('lasso') + 'Lazo'], ['wand', ic('wand') + 'Varita']], S.tool === 'select' ? S.selMode : '', v => { S.selMode = v; this.setTool('select'); this.closeSheet('sel'); }));
      const g = el('<div class="grid-tools" style="grid-template-columns:repeat(3,1fr);margin-top:12px"></div>');
      const acts = [['deselect', 'Quitar selección', () => SEL.none()], ['invert', 'Invertir selección', () => SEL.invert()], ['select', 'Seleccionar todo', () => SEL.all()], ['alpha', 'Seleccionar opacidad', () => SEL.fromAlpha()], ['plus', 'Ampliar 4px', () => SEL.grow(4)], ['minus', 'Contraer 4px', () => SEL.grow(-4)], ['clear', 'Borrar contenido', () => SEL.clearContent()], ['fill', 'Rellenar', () => SEL.fillContent()], ['cut', 'Cortar', () => SEL.copy(true)], ['copy', 'Copiar', () => SEL.copy(false)], ['paste', 'Pegar', () => SEL.paste()], ['move', 'Mover contenido', () => { if (S.sel) { SEL.copy(true); SEL.paste(); } else this.setTool('move'); }]];
      for (const [icn, n, fn] of acts) { const b = el(`<button class="tbtn">${ic(icn)}${n}</button>`); b.onclick = () => { fn(); this.closeSheet('sel'); }; g.appendChild(b); }
      body.appendChild(g);
    });
  },
  onSel() { $('#bSelect').classList.toggle('on', !!S.sel); },
  /* ---------- vista ---------- */
  openViewOpts() {
    this.sheet('view', 'Vista', body => {
      const b = el('<div class="box"></div>');
      const r1 = el('<div class="row"><span class="lbl">Ventana de referencia</span></div>'); r1.appendChild(Toggle(!!$('#refWin'), v => { REF.on = v; this.renderRef(); })); b.appendChild(r1);
      const r2 = el('<div class="row"><span class="lbl">Cuadrícula</span></div>'); r2.appendChild(Toggle(S.grid.on, v => { S.grid.on = v; requestRender(); })); b.appendChild(r2);
      b.appendChild(SRow('Tamaño de cuadrícula', { min: 2, max: 256, value: S.grid.size, step: 1, unit: 'px', onInput: v => { S.grid.size = v; requestRender(); } }).el);
      b.appendChild(el('<div style="font-size:13.5px;margin:8px 0 2px">Rotar el lienzo</div>'));
      const rr = SRow('Rotación', { min: -180, max: 180, value: Math.round(V.r * 180 / Math.PI), step: 1, unit: '°', onInput: v => rotateView(v * Math.PI / 180) }); b.appendChild(rr.el); this._rotRow = rr;
      const rb = el('<div class="row" style="gap:6px"></div>'); for (const [t, f] of [['−15°', () => V.r - Math.PI / 12], ['+15°', () => V.r + Math.PI / 12], ['90°', () => V.r + Math.PI / 2], ['Enderezar', () => 0]]) { const x = el(`<button class="btn" style="flex:1;height:36px;padding:0 6px">${t}</button>`); x.onclick = () => rotateView(Math.atan2(Math.sin(f()), Math.cos(f()))); rb.appendChild(x); } b.appendChild(rb);
      const rg = el('<div class="row"><span class="lbl">Rotar con dos dedos</span></div>'); rg.appendChild(Toggle(S.rotGesture !== false, v => { S.rotGesture = v; store.set('rotGesture', v); })); b.appendChild(rg);
      const r3 = el('<div class="row"><span class="lbl">Voltear la vista (espejo)</span></div>'); r3.appendChild(Toggle(V.flip, v => { const c = toDoc(V.w / 2, V.h / 2); V.flip = v; const q = toScr(c.x, c.y); V.x += V.w / 2 - q.x; requestRender(); })); b.appendChild(r3);
      body.appendChild(b); body.appendChild(el('<div class="sec-t">Mostrar al hacer zoom</div>'));
      body.appendChild(Seg([['1', 'Suave'], ['0', 'Pixelado']], S.smoothZoom ? '1' : '0', v => { S.smoothZoom = v === '1'; requestRender(); }));
      body.appendChild(el('<div class="sec-t">Gestos</div>'));
      body.appendChild(el('<div class="box" style="font-size:13.5px;color:var(--tx2);line-height:1.6">Dos dedos: mover, zoom y girar · Toque con dos dedos: deshacer · Con tres dedos: rehacer · Mantén presionado con el pincel: gotero</div>'));
    });
  },
  /* ---------- menú ---------- */
  openMenu() {
    this.sheet('menu', doc.name, body => {
      const box = el('<div class="box" style="padding:4px"></div>');
      const add = (icn, t, fn, sub) => { const r = el(`<div class="list-row">${ic(icn)}<div class="grow">${t}${sub ? `<div class="sub">${sub}</div>` : ''}</div></div>`); r.onclick = async () => { this.closeSheet('menu'); await fn(); }; box.appendChild(r); };
      add('save', 'Guardar', () => saveDoc()); add('share', 'Exportar…', () => this.openExport(), 'PNG, JPEG, PSD con capas, GIF, video, time-lapse');
      add('image', 'Importar imagen como capa', () => this.importLayer()); add('fx', 'Filtros', () => FX.open()); add('bgx', 'Quitar fondo', () => BGX.enter());
      add('frame', 'Marcos de manga', () => this.openFrameMenu()); add('bubble', 'Globos de texto', () => this.openBalloons()); add('ai', 'Asistente IA', () => this.openAI(), 'Tu IA favorita te ayuda con tu dibujo');
      if (!doc.anim) add('film', 'Convertir en animación', () => structOp(() => { doc.anim = true; this.renderTimeline(); fitView(); }));
      add('fit', 'Ajustar a pantalla', () => fitView()); add('pencil', 'Cambiar nombre', async () => { const n = await this.prompt('Nombre', doc.name); if (n) { doc.name = n; S.dirty = true; $('#docTitle').textContent = n + ' · ' + doc.w + '×' + doc.h; } });
      add('keyboard', 'Atajos de teclado', () => this.shortcuts()); add('grid', 'Volver a la galería', () => this.exitEditor());
      body.appendChild(box);
    });
  },
  shortcuts() { const k = [['B / E / S / R', 'Pincel, borrador, difuminar, desenfocar'], ['G / I / U / T', 'Relleno, gotero, figuras, texto'], ['M / V / H / K', 'Selección, mover, mano, marcos'], ['[ y ]', 'Achicar / agrandar el pincel'], ['Ctrl+Z / Ctrl+Mayús+Z', 'Deshacer / rehacer'], ['Ctrl+S', 'Guardar'], ['Ctrl+A / Ctrl+D', 'Seleccionar todo / quitar selección'], ['Ctrl+C / X / V', 'Copiar, cortar, pegar'], ['Supr', 'Borrar contenido seleccionado'], ['Ctrl+Mayús+N', 'Nueva capa'], ['Espacio + arrastrar', 'Mover el lienzo'], ['Rueda / Ctrl+rueda', 'Zoom'], ['0', 'Ajustar a pantalla'], ['Alt + rueda', 'Rotar el lienzo'], ['X', 'Volver al color anterior'], [', y .', 'Fotograma anterior / siguiente'], ['Enter', 'Reproducir animación'], ['Esc', 'Cancelar / cerrar']]; this.dialog('Atajos de teclado', `<div class="kbd">${k.map(([a, b]) => `<kbd>${a}</kbd><span>${b}</span>`).join('')}</div>`, [['Cerrar', null, 'pri']]); },

  /* ---------- exportar ---------- */
  openExport() {
    const fromGallery = $('#editor').classList.contains('hidden');
    this.sheet('export', 'Exportar · ' + doc.name, body => {
      let scale = 1; const box = el('<div class="box" style="padding:4px"></div>');
      const add = (icn, t, sub, fn) => { const r = el(`<div class="list-row">${ic(icn)}<div class="grow">${t}<div class="sub">${sub}</div></div></div>`); r.onclick = async () => { this.closeSheet('export'); try { await fn(); } catch (e) { console.error(e); this.toast('Error al exportar: ' + e.message); } }; box.appendChild(r); };
      const base = doc.name.replace(/[\\/:*?"<>|]/g, '');
      add('image', 'PNG', 'Con transparencia si el fondo es transparente', async () => this.download(await toBlob(compositeFrame(doc.frame, true, scale)), base + '.png'));
      add('image', 'JPEG', 'Más liviano, fondo blanco', async () => { const c = compositeFrame(doc.frame, true, scale); const j = mkCanvas(c.width, c.height), x = j.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, j.width, j.height); x.drawImage(c, 0, 0); this.download(await toBlob(j, 'image/jpeg', .92), base + '.jpg'); });
      add('layers', 'PSD (con capas)', 'Se abre en Photoshop, Krita, GIMP, PhotoCraft…', async () => this.download(exportPSD(), base + '.psd'));
      if (doc.anim) {
        add('film', 'GIF animado', `${doc.frames.length} fotogramas · ${doc.fps} fps`, async () => this.exportGif(scale, base));
        add('video', 'Video de la animación', 'MP4 o WebM según tu dispositivo', async () => this.exportAnimVideo(scale, base));
        add('grid', 'Hoja de fotogramas (PNG)', 'Todos los fotogramas en una imagen', async () => { const n = doc.frames.length, cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols), w = Math.round(doc.w * scale), h = Math.round(doc.h * scale); const c = mkCanvas(w * cols, h * rows), x = c.getContext('2d'); for (let i = 0; i < n; i++) x.drawImage(compositeFrame(i, true, scale), (i % cols) * w, Math.floor(i / cols) * h); this.download(await toBlob(c), base + '-fotogramas.png'); });
      }
      add('video', 'Time-lapse', TL.frames.length ? `${TL.frames.length} pasos grabados` : 'Se graba mientras dibujas', async () => this.exportTimelapse(base));
      if (doc.pixel) {
        const pe = store.get('pixExp', { mode: 'stretch', k: 8 }); const top = el('<div class="box" style="margin-bottom:10px"></div>');
        top.appendChild(el('<div style="font-size:13.5px;margin:0 2px 6px;font-weight:650">Cómo exportar el pixel art</div>'));
        const dims = el('<p style="color:var(--tx2);font-size:12.5px;margin:8px 2px 0"></p>'); const kRow = el('<div style="margin-top:8px"></div>');
        const upd = () => { scale = pe.mode === 'stretch' ? pe.k : 1; dims.textContent = pe.mode === 'stretch' ? `Se exporta a ${doc.w * pe.k}×${doc.h * pe.k}: cada píxel se vuelve un cuadro de ${pe.k}×${pe.k}, sin verse borroso.` : `Se exporta a ${doc.w}×${doc.h}: un píxel por píxel, ideal para texturas y skins de Minecraft.`; kRow.style.display = pe.mode === 'stretch' ? '' : 'none'; store.set('pixExp', pe); };
        top.appendChild(Seg([['real', 'Pixel a la medida'], ['stretch', 'Estirado sin borroso']], pe.mode, v => { pe.mode = v; upd(); }));
        kRow.appendChild(Seg([2, 4, 8, 16, 32].map(k => [String(k), '×' + k]), String(pe.k), v => { pe.k = +v; upd(); })); top.appendChild(kRow); top.appendChild(dims);
        body.appendChild(top); upd();
      }
      body.appendChild(box);
      if (!doc.pixel) { body.appendChild(el('<div class="sec-t">Tamaño</div>')); body.appendChild(Seg([['1', '100%'], ['2', '200%'], ['4', '400%'], ['0.5', '50%']], '1', v => scale = +v)); }
    });
  },
  progress(title) { const m = el(`<div class="modal"><div class="dlg"><h3>${esc(title)}</h3><div class="prog"><i></i></div><p class="pt">Preparando…</p></div></div>`); document.body.appendChild(m); return { set(f, t) { m.querySelector('i').style.width = Math.round(f * 100) + '%'; if (t) m.querySelector('.pt').textContent = t; }, close() { m.remove(); } }; },
  async exportGif(scale, base) {
    const pr = this.progress('Creando GIF'); await new Promise(r => setTimeout(r, 30));
    const seq = ANIM.sequence(); const cache = {}; const frames = seq.map(i => { if (!cache[i]) { const c = compositeFrame(i, true, scale); cache[i] = c.getContext('2d').getImageData(0, 0, c.width, c.height); } return cache[i]; });
    const delays = seq.map(i => Math.max(2, Math.round(100 / doc.fps * ANIM.holdOf(i)))); GIF.once = doc.playMode === 'once';
    const w = frames[0].width, h = frames[0].height; const bytes = GIF.encode(frames, w, h, delays, doc.bg === 'transparent', f => pr.set(f, Math.round(f * 100) + '%')); GIF.once = false;
    pr.close(); this.download(new Blob([bytes], { type: 'image/gif' }), base + '.gif');
  },
  async exportAnimVideo(scale, base) {
    const pr = this.progress('Grabando video'); const k = Math.min(scale, 1920 / Math.max(doc.w, doc.h)); let w = Math.round(doc.w * k / 2) * 2, h = Math.round(doc.h * k / 2) * 2; const comp = doc.frames.map((_, i) => compositeFrame(i, true, k));
    const one = []; for (const i of ANIM.sequence()) for (let r = 0; r < ANIM.holdOf(i); r++) one.push(i); const loops = doc.playMode === 'once' ? 1 : Math.max(1, Math.ceil(3 * doc.fps / one.length)); const order = []; for (let l = 0; l < loops; l++) order.push(...one);
    try { const blob = await recordVideo((x, i) => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.imageSmoothingEnabled = !doc.pixel; x.drawImage(comp[order[i]], 0, 0, w, h); }, order.length, doc.fps, w, h, f => pr.set(f)); pr.close(); this.download(blob, base + (blob.type.includes('mp4') ? '.mp4' : '.webm')); } catch (e) { pr.close(); this.toast(e.message); }
  },
  async exportTimelapse(base) {
    if (TL.frames.length < 2) { this.toast('Todavía no hay suficientes pasos grabados: sigue dibujando'); return; }
    const pr = this.progress('Creando time-lapse'); const imgs = []; for (let i = 0; i < TL.frames.length; i++) { imgs.push(await blobToCanvas(TL.frames[i], ...(await (async () => { const bm = await createImageBitmap(TL.frames[i]); const r = [bm.width, bm.height]; bm.close && bm.close(); return r; })()))); pr.set(i / TL.frames.length * .3, 'Leyendo pasos…'); }
    const last = compositeFrame(doc.frame, true, Math.min(1, 720 / Math.max(doc.w, doc.h))); for (let i = 0; i < 24; i++) imgs.push(last);
    let w = imgs[imgs.length - 1].width, h = imgs[imgs.length - 1].height; w = Math.round(w / 2) * 2; h = Math.round(h / 2) * 2;
    const fps = clamp(Math.round(imgs.length / 15), 8, 30);
    try { const blob = await recordVideo((x, i) => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(imgs[i], 0, 0, w, h); }, imgs.length, fps, w, h, f => pr.set(.3 + f * .7, 'Grabando video…')); pr.close(); this.download(blob, base + '-timelapse' + (blob.type.includes('mp4') ? '.mp4' : '.webm')); } catch (e) { pr.close(); this.toast(e.message); }
  },

  /* ---------- texto ---------- */
  openTextSheet() { this.txTab = 'text'; this.renderTextSheet(); },
  renderTextSheet() {
    const o = S.textObj; if (!o) return;
    this.sheet('text', 'Texto', body => {
      const tabs = el('<div class="tx-tabs"></div>'); const T = [['text', 'text', 'Texto'], ['size', 'sliders', 'Tamaño'], ['style', 'pencil', 'Estilo'], ['bg', 'image', 'Fondo'], ['space', 'flip', 'Espaciado'], ['del', 'trash', 'Eliminar']];
      for (const [k, icn, n] of T) { const b = el(`<button class="${this.txTab === k ? 'on' : ''}">${ic(icn)}${n}</button>`); b.onclick = () => { if (k === 'del') { TXT.cancel(); return; } this.txTab = k; this.renderTextSheet(); }; tabs.appendChild(b); }
      const pane = el('<div class="tx-pane"></div>'); const upd = () => TXT.invalidate();
      if (this.txTab === 'text') {
        const ta = el(`<textarea class="inp" style="width:100%" rows="3" placeholder="Escribe tu texto…">${esc(o.text)}</textarea>`); ta.oninput = () => { o.text = ta.value; upd(); }; pane.appendChild(ta); setTimeout(() => { if (!this.isWide() || true) ta.focus(); }, 280);
        const r = el('<div class="row" style="gap:6px;margin-top:8px"></div>'); const fb = el(`<button class="fontbtn"><span style="font-family:'${o.font}';font-size:18px;overflow:hidden;text-overflow:ellipsis">${esc((FONTS.find(f => f[0] === o.font) || [0, o.font])[1])}</span>${ic('down')}</button>`); fb.onclick = () => this.openFonts(); r.appendChild(fb); pane.appendChild(r);
        pane.appendChild(el('<div style="height:8px"></div>')); pane.appendChild(Seg([['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']], o.align, v => { o.align = v; upd(); }));
        pane.appendChild(el('<div style="height:8px"></div>')); pane.appendChild(Seg([['h', 'Horizontal'], ['v', 'Vertical']], o.vertical ? 'v' : 'h', v => { o.vertical = v === 'v'; upd(); }));
        const r2 = el('<div class="row"><span class="lbl">Negrita</span></div>'); r2.appendChild(Toggle(o.bold, v => { o.bold = v; upd(); })); const r3 = el('<div class="row"><span class="lbl">Cursiva</span></div>'); r3.appendChild(Toggle(o.italic, v => { o.italic = v; upd(); })); const r4 = el('<div class="row"><span class="lbl">Poner en capa nueva</span></div>'); r4.appendChild(Toggle(o.toNewLayer, v => o.toNewLayer = v)); pane.append(r2, r3, r4);
      }
      if (this.txTab === 'size') pane.appendChild(SRow('Tamaño', { min: 4, max: 600, value: o.size, step: 1, unit: 'px', toT: v => Math.sqrt((v - 4) / 596), fromT: t => 4 + 596 * t * t, onInput: v => { o.size = v; upd(); } }).el);
      if (this.txTab === 'style') {
        const cr = el('<div class="row"><span class="lbl">Color del texto</span></div>'); cr.appendChild(this.colorBtn(o.color, c => { o.color = c; upd(); })); pane.appendChild(cr);
        const sr = el('<div class="row"><span class="lbl">Borde</span></div>'); sr.appendChild(Toggle(o.stroke.on, v => { o.stroke.on = v; upd(); })); pane.appendChild(sr);
        pane.appendChild(SRow('Grosor del borde', { min: 1, max: 60, value: o.stroke.w, step: 1, unit: 'px', onInput: v => { o.stroke.w = v; o.stroke.on = true; upd(); } }).el);
        const sc = el('<div class="row"><span class="lbl">Color del borde</span></div>'); sc.appendChild(this.colorBtn(o.stroke.color, c => { o.stroke.color = c; o.stroke.on = true; upd(); })); pane.appendChild(sc);
      }
      if (this.txTab === 'bg') {
        const br = el('<div class="row"><span class="lbl">Fondo</span></div>'); br.appendChild(Toggle(o.bg.on, v => { o.bg.on = v; upd(); })); pane.appendChild(br);
        const bc = el('<div class="row"><span class="lbl">Color de fondo</span></div>'); bc.appendChild(this.colorBtn(o.bg.color, c => { o.bg.color = c; o.bg.on = true; upd(); })); pane.appendChild(bc);
        pane.appendChild(SRow('Margen horizontal', { min: 0, max: 200, value: o.bg.px, step: 1, unit: 'px', onInput: v => { o.bg.px = v; upd(); } }).el);
        pane.appendChild(SRow('Margen vertical', { min: 0, max: 200, value: o.bg.py, step: 1, unit: 'px', onInput: v => { o.bg.py = v; upd(); } }).el);
      }
      if (this.txTab === 'space') {
        pane.appendChild(SRow('Espacio entre letras', { min: -.3, max: 1, value: o.ls, step: .01, fmt: v => Math.round(v * 100) + '%', onInput: v => { o.ls = v; upd(); } }).el);
        pane.appendChild(SRow('Interlineado', { min: .6, max: 3, value: o.lh, step: .01, fmt: v => Math.round(v * 100) + '%', onInput: v => { o.lh = v; upd(); } }).el);
      }
      body.append(tabs, pane);
      body.appendChild(el('<p style="color:var(--tx2);font-size:12.5px;margin:6px 4px 0">Arrastra el texto para moverlo · ↻ para rotarlo · ⤡ para cambiar el tamaño. Toca fuera para fijarlo.</p>'));
    }, { dock: true, okIcon: 'check', onOk: () => TXT.commit(), modalLock: false });
    $('#scrim').classList.remove('show');
  },
  refreshTextSheet() { },
  closeTextSheet() { this.closeSheet('text'); },
  colorBtn(cur, onPick) {
    const b = el(`<button class="colbtn" style="background:${cur}"></button>`);
    b.onclick = () => this.sheet('cpick', 'Elegir color', body => {
      const g = el('<div class="pal"></div>'); const cols = [...new Set([hex(...S.color), ...S.recent, ...PAL.list[PAL.cur].colors])];
      for (const c of cols) { const x = el(`<button style="background:${c}"></button>`); x.onclick = () => { b.style.background = c; onPick(c); this.closeSheet('cpick'); }; g.appendChild(x); }
      const inp = el(`<div class="row" style="margin-top:10px"><input class="inp" style="flex:1" value="${cur}"><input type="color" value="${cur}" style="width:48px;height:40px;border:0;background:none"><button class="btn pri">OK</button></div>`);
      inp.querySelector('input[type=color]').oninput = e => inp.querySelector('.inp').value = e.target.value;
      inp.querySelector('.btn').onclick = () => { const c = parseHex(inp.querySelector('.inp').value); if (c) { const h2 = hex(...c); b.style.background = h2; onPick(h2); } this.closeSheet('cpick'); };
      body.append(el('<div class="sec-t" style="margin-top:4px">Color actual, recientes y paleta</div>'), g, inp);
    });
    return b;
  },
  openFonts() {
    loadWebFonts(); const o = S.textObj; let tab = 'all';
    const render = body => {
      body.innerHTML = ''; const fav = store.get('fontFav', []), rec = store.get('fontRec', []);
      body.appendChild(Seg([['all', 'Todas'], ['fav', 'Favoritas'], ['rec', 'Recientes']], tab, v => { tab = v; render(body); }));
      const imp = el(`<div class="list-row">${ic('upload')}<div class="grow">Importar fuente<div class="sub">.ttf, .otf o .woff desde tu dispositivo</div></div></div>`); imp.onclick = async () => { const f = await this.pickFile('.ttf,.otf,.woff,.woff2', true); for (const file of f) { try { const name = file.name.replace(/\.[^.]+$/, ''); const buf = await file.arrayBuffer(); const ff = new FontFace(name, buf); await ff.load(); document.fonts.add(ff); FONTS.push([name, name, 'Mis fuentes']); const mine = await DB.get('kv', 'fonts') || []; mine.push({ name, buf }); await DB.put('kv', 'fonts', mine); this.toast('Fuente “' + name + '” añadida'); } catch (e) { this.toast('No se pudo leer ' + file.name); } } render(body); }; body.appendChild(imp);
      let list = FONTS; if (tab === 'fav') list = FONTS.filter(f => fav.includes(f[0])); if (tab === 'rec') list = rec.map(r => FONTS.find(f => f[0] === r)).filter(Boolean);
      let lastCat = '';
      for (const [fam, name, cat] of list) {
        if (tab === 'all' && cat !== lastCat) { body.appendChild(el(`<div class="sec-t">${cat}</div>`)); lastCat = cat; }
        const r = el(`<div class="frow ${o && o.font === fam ? 'on' : ''}"><button class="ib star ${fav.includes(fam) ? 'on' : ''}">${ic(fav.includes(fam) ? 'starf' : 'star')}</button><div class="fn" style="font-family:'${fam}',system-ui">${esc(name)}</div></div>`);
        r.querySelector('.star').onclick = e => { e.stopPropagation(); const f2 = store.get('fontFav', []); const i = f2.indexOf(fam); i >= 0 ? f2.splice(i, 1) : f2.unshift(fam); store.set('fontFav', f2); render(body); };
        r.onclick = () => { if (o) { o.font = fam; TXT.invalidate(); } store.set('fontRec', [fam, ...store.get('fontRec', []).filter(x => x !== fam)].slice(0, 10)); this.closeSheet('fonts'); this.renderTextSheet(); };
        body.appendChild(r);
      }
      if (!list.length) body.appendChild(el('<p style="color:var(--tx2);padding:16px">Nada por aquí todavía. Marca fuentes con la estrella.</p>'));
    };
    this.sheet('fonts', 'Fuentes (' + FONTS.length + ')', render);
  },
  onFonts() { const s = $('#sh-fonts .sh-body'); if (s && this.sheetStack.some(x => x.id === 'fonts')) { /* las vistas previas se actualizan solas */ } },

  /* ---------- marcos de manga ---------- */
  openFrameMenu() {
    const has = L().some(l => l.frames);
    this.sheet('frames', 'Marcos de manga', body => {
      const box = el('<div class="box" style="padding:4px"></div>');
      const add = (icn, t, sub, fn) => { const r = el(`<div class="list-row">${ic(icn)}<div class="grow">${t}<div class="sub">${sub}</div></div></div>`); r.onclick = () => { this.closeSheet('frames'); fn(); }; box.appendChild(r); };
      add('plus', 'Añadir marco', 'Crea una capa de marcos con márgenes', () => this.openFrameAdd());
      if (has) add('frame', 'Dividir viñetas', 'Arrastra una línea de lado a lado · toca una viñeta para seleccionarla', () => { S.tool = 'brush'; this.setFrameTool(true); this.updTool(); });
      if (S.frameTool) add('close', 'Terminar de dividir', 'Vuelve al pincel', () => this.setFrameTool(false));
      body.appendChild(box);
    });
  },
  openFrameAdd() {
    const o = store.get('frameDef', { mx: 64, my: 64, gapH: 30, gapV: 40, width: 6, color: '#000000', fillOut: true });
    this.sheet('fradd', 'Añadir marco', body => {
      const b = el('<div class="box"></div>');
      b.appendChild(SRow('Margen horizontal', { min: 0, max: Math.round(doc.w / 3), value: o.mx, step: 1, unit: 'px', onInput: v => o.mx = v }).el);
      b.appendChild(SRow('Margen vertical', { min: 0, max: Math.round(doc.h / 3), value: o.my, step: 1, unit: 'px', onInput: v => o.my = v }).el);
      b.appendChild(SRow('Espacio entre viñetas (horizontal)', { min: 0, max: 200, value: o.gapH, step: 1, unit: 'px', onInput: v => o.gapH = v }).el);
      b.appendChild(SRow('Espacio entre viñetas (vertical)', { min: 0, max: 200, value: o.gapV, step: 1, unit: 'px', onInput: v => o.gapV = v }).el);
      b.appendChild(SRow('Grosor del marco', { min: 1, max: 40, value: o.width, step: 1, unit: 'px', onInput: v => o.width = v }).el);
      const c = el('<div class="row"><span class="lbl">Color del borde</span></div>'); c.appendChild(this.colorBtn(o.color, v => o.color = v)); b.appendChild(c);
      const f = el('<div class="row"><span class="lbl">Rellenar fuera de las viñetas (blanco)</span></div>'); f.appendChild(Toggle(o.fillOut, v => o.fillOut = v)); b.appendChild(f);
      body.appendChild(b); const ok = el('<button class="btn pri full" style="margin-top:12px">Añadir marco</button>'); ok.onclick = () => { store.set('frameDef', o); this.closeSheet('fradd'); FRAMES.add(o); }; body.appendChild(ok);
    });
  },

  /* ---------- filtros ---------- */
  openFx() {
    const bar = el(`<div id="fxBar"><div id="fxParams"></div><div id="fxStrip"></div><div id="fxCats"></div></div>`); document.body.appendChild(bar);
    $('#dock').classList.add('hidden'); $('#sliders').classList.add('hidden'); this.closePanel();
    const base = (() => { const l = S.fx.layer; const k = Math.min(1, 140 / Math.max(doc.w, doc.h)); let c = mkCanvas(Math.max(1, Math.round(doc.w * k)), Math.max(1, Math.round(doc.h * k))); const x = c.getContext('2d'); x.drawImage(l.canvas, 0, 0, c.width, c.height); const d = x.getImageData(0, 0, c.width, c.height).data; let empty = true; for (let i = 3; i < d.length; i += 16) if (d[i]) { empty = false; break; } if (empty) { const g = x.createLinearGradient(0, 0, c.width, c.height); g.addColorStop(0, '#ff7ab6'); g.addColorStop(.5, '#ffd36e'); g.addColorStop(1, '#5ad1ff'); x.fillStyle = g; x.beginPath(); x.arc(c.width / 2, c.height / 2, Math.min(c.width, c.height) * .4, 0, 7); x.fill(); } return { c, d: x.getImageData(0, 0, c.width, c.height), k }; })();
    this.fxBase = base; this.renderFxCats(); this.renderFxStrip(); this.renderFxParams();
  },
  renderFxCats() { const c = $('#fxCats'); c.innerHTML = ''; for (const cat of FXCATS) { const n = cat === 'Todos' ? FILTERS.length : cat === 'Recientes' ? store.get('fxRecent', []).length : FILTERS.filter(f => f.cat === cat).length; const b = el(`<button class="${S.fx.cat === cat ? 'on' : ''}">${cat}${cat === 'Todos' ? ' (' + n + ')' : ''}</button>`); b.onclick = () => { S.fx.cat = cat; store.set('fxCat', cat); this.renderFxCats(); this.renderFxStrip(); }; c.appendChild(b); } },
  renderFxStrip() {
    const s = $('#fxStrip'); s.innerHTML = ''; const cat = S.fx.cat; const rec = store.get('fxRecent', []);
    let list = cat === 'Todos' ? FILTERS : cat === 'Recientes' ? rec.map(id => FILTERS.find(f => f.id === id)).filter(Boolean) : FILTERS.filter(f => f.cat === cat);
    const orig = el(`<div class="fxi ${!S.fx.filter ? 'on' : ''}"><div class="ft"></div><span>Original</span></div>`); orig.querySelector('.ft').appendChild(cloneCanvas(this.fxBase.c)); orig.onclick = () => { S.fx.filter = null; S.fx.preview = null; S.fx.wantPoint = false; requestRender(); this.renderFxStrip(); this.renderFxParams(); }; s.appendChild(orig);
    for (const f of list) { const it = el(`<div class="fxi ${S.fx.filter === f ? 'on' : ''}"><div class="ft"></div><span>${esc(f.name)}</span></div>`); s.appendChild(it); it.onclick = () => { FX.pick(f); this.renderFxStrip(); }; requestAnimationFrame(() => { if (!S.fx) return; it.querySelector('.ft').appendChild(FX.thumb(f, this.fxBase)); }); }
    if (!list.length) s.appendChild(el('<div style="color:var(--tx2);padding:20px;font-size:13px">Aún no usas filtros.</div>'));
  },
  renderFxParams() {
    const p = $('#fxParams'); if (!p) return; p.innerHTML = ''; const st = S.fx, f = st.filter;
    const head = el(`<div class="ph"><h4>${f ? esc(f.name) : 'Filtros'}</h4><button class="ib" title="Cancelar">${ic('close')}</button><button class="ib" style="color:var(--acc)" title="Aplicar">${ic('check')}</button></div>`);
    head.children[1].onclick = () => FX.cancel(); head.children[2].onclick = () => FX.apply(); p.appendChild(head);
    this.hideHint && this.hideHint();
    if (!f) { p.appendChild(el(`<div style="color:var(--tx2);font-size:13px;padding:0 2px 6px">Elige un filtro. Se aplica a la capa “${esc(st.layer.name)}”${S.sel ? ' dentro de la selección' : ''}.</div>`)); return; }
    for (const q of f.p) {
      if (q.t === 'range') p.appendChild(SRow(q.label, { min: q.min, max: q.max, value: st.params[q.k], step: q.step, unit: q.unit, onInput: v => { st.params[q.k] = v; FX.run(); } }).el);
      else if (q.t === 'toggle') { const r = el(`<div class="row"><span class="lbl">${q.label}</span></div>`); r.appendChild(Toggle(st.params[q.k], v => { st.params[q.k] = v; FX.run(); })); p.appendChild(r); }
      else if (q.t === 'color') { const r = el(`<div class="row"><span class="lbl">${q.label}</span></div>`); r.appendChild(this.colorBtn(st.params[q.k], c => { st.params[q.k] = c; FX.run(); })); p.appendChild(r); }
      else if (q.t === 'select') p.appendChild(Seg(q.opts, st.params[q.k], v => { st.params[q.k] = v; FX.run(); }));
      else if (q.t === 'point') { const h = el(`<div class="hint">${q.label === 'Centro' || q.label === 'Origen' ? 'Toca el lienzo para elegir el ' + q.label.toLowerCase() : q.label}</div>`); document.body.appendChild(h); this.hideHint = () => { h.remove(); this.hideHint = null; }; setTimeout(() => this.hideHint && this.hideHint(), 3500); }
    }
    const rs = el(`<button class="btn" style="align-self:flex-start;margin-top:4px">${ic('rotate')}Restablecer</button>`); rs.onclick = () => FX.pick(f); p.appendChild(rs);
  },
  closeFx() { $$('#fxBar').forEach(x => x.remove()); $$('.hint').forEach(x => x.remove()); this.hideHint && this.hideHint(); $('#dock').classList.remove('hidden'); $('#sliders').classList.remove('hidden'); if (this.isWide()) this.openPanel(this.panelTab || 'brush'); },

  /* ---------- quitar fondo ---------- */
  openBgx() {
    const b = S.bgx; this.closeAll(); $('#panel').style.display = 'none'; $('#dock').classList.add('hidden'); $('#sliders').classList.add('hidden'); $('#topbar').classList.add('hidden'); $('#rail').style.visibility = 'hidden';
    const w = el(`<div id="bgx"><div class="bgx-top"><button class="ib" id="bxCancel" title="Cancelar">${ic('back')}</button><h3>Quitar fondo</h3><div style="flex:1;min-width:60px" id="bxOff"></div><button class="ib" id="bxUndo">${ic('undo')}</button><button class="ib" id="bxRedo">${ic('redo')}</button><button class="ib" id="bxDone" style="color:var(--acc)" title="Listo">${ic('check')}</button></div><div class="bgx-bot"><div class="row" style="gap:8px"><button class="ib" id="bxBg" title="Fondo de vista previa">${ic('view')}</button><div id="bxSize" style="flex:1"></div></div><div class="bgx-modes"></div></div></div>`);
    document.body.appendChild(w);
    const off = Slider({ min: 0, max: 200, value: b.offset, onInput: v => b.offset = v }); $('#bxOff').append(el('<div style="font-size:11px;color:var(--tx2);text-align:center">Desplazar cursor</div>'), off.el);
    $('#bxCancel').onclick = () => BGX.cancel(); $('#bxDone').onclick = () => BGX.done(); $('#bxUndo').onclick = () => undo(); $('#bxRedo').onclick = () => redo();
    $('#bxBg').onclick = () => { b.bgi = (b.bgi + 1) % BGX_BG.length; requestRender(); };
    const modes = [['auto', 'auto', 'Auto'], ['color', 'colorpick', 'Color'], ['magic', 'wand', 'Mágico'], ['manual', 'eraser', 'Manual'], ['repair', 'repair', 'Reparar'], ['zoom', 'zoom', 'Mover']];
    const renderModes = () => { const m = $('.bgx-modes'); m.innerHTML = ''; for (const [k, icn, n] of modes) { const x = el(`<button class="${b.mode === k ? 'on' : ''}">${ic(icn)}${n}</button>`); x.onclick = () => { if (k === 'auto') { BGX.auto(); return; } b.mode = k; renderModes(); renderSize(); }; m.appendChild(x); } };
    const renderSize = () => { const s = $('#bxSize'); s.innerHTML = ''; if (b.mode === 'manual' || b.mode === 'repair') s.appendChild(SRow('Tamaño', { min: 2, max: 300, value: b.size, step: 1, unit: 'px', onInput: v => b.size = v }).el); else s.appendChild(SRow('Tolerancia', { min: 0, max: 120, value: b.tol, step: 1, onInput: v => b.tol = v }).el); };
    renderModes(); renderSize(); this.refreshUndo(); requestRender();
    this.toast('Manual borra con el cursor sobre el dedo · Auto detecta el fondo desde los bordes', 3500);
  },
  closeBgx() { $$('#bgx').forEach(x => x.remove()); $('#panel').style.display = ''; $('#dock').classList.remove('hidden'); $('#sliders').classList.remove('hidden'); $('#topbar').classList.remove('hidden'); $('#rail').style.visibility = ''; if (this.isWide()) this.openPanel(this.panelTab || 'brush'); requestRender(); },

  /* ---------- línea de tiempo ---------- */
  renderTimeline() {
    const t = $('#timeline'); if (!doc || !doc.anim) { t.classList.add('hidden'); return; } t.classList.remove('hidden');
    if (!t.dataset.built) {
      t.dataset.built = 1;
      t.innerHTML = `<div class="tl-btns"><button class="ib" id="tlPlay" title="Reproducir (Enter)">${ic('play')}</button></div><div id="tlFrames"></div><div class="tl-btns"><button class="ib" id="tlAdd" title="Fotograma en blanco">${ic('frameadd')}</button><button class="ib" id="tlDup" title="Duplicar fotograma">${ic('copy')}</button><button class="ib" id="tlDel" title="Eliminar fotograma">${ic('trash')}</button><button class="ib" id="tlOnion" title="Piel de cebolla">${ic('onion')}</button><button class="ib" id="tlMenu" title="Opciones de animación">${ic('dotsv')}</button></div>`;
      $('#tlPlay').onclick = () => ANIM.play(); $('#tlAdd').onclick = () => ANIM.addBlank(); $('#tlDup').onclick = () => ANIM.duplicate(); $('#tlDel').onclick = () => ANIM.remove();
      $('#tlOnion').onclick = () => { S.onion = !S.onion; $('#tlOnion').classList.toggle('on', S.onion); requestRender(); };
      $('#tlMenu').onclick = () => this.animMenu();
    }
    $('#tlOnion').classList.toggle('on', S.onion);
    const fr = $('#tlFrames'); fr.innerHTML = '';
    doc.frames.forEach((f, i) => { const d = el(`<div class="fr ${i === doc.frame ? 'on' : ''}" data-i="${i}"><span>${i + 1}${(f.hold || 1) > 1 ? ' ×' + f.hold : ''}</span></div>`); const k = Math.min(1, 104 / Math.max(doc.w, doc.h)); const c = compositeFrame(i, false, k); d.prepend(c); d.onclick = () => ANIM.go(i); fr.appendChild(d); });
    const on = fr.children[doc.frame]; on && on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  },
  animMenu() {
    this.sheet('amenu', 'Fotograma ' + (doc.frame + 1) + ' de ' + doc.frames.length, body => {
      const box = el('<div class="box" style="padding:4px"></div>');
      const add = (icn, t, fn, dis) => { const r = el(`<div class="list-row" style="${dis ? 'opacity:.4;pointer-events:none' : ''}">${ic(icn)}<div class="grow">${t}</div></div>`); r.onclick = () => { this.closeSheet('amenu'); fn(); }; box.appendChild(r); };
      add('sliders', 'Configuración de animación', () => this.animSettings());
      add('film', 'Configuración del fotograma', () => this.frameSettings());
      add('copy', 'Duplicar fotograma', () => ANIM.duplicate());
      add('frameadd', 'Fotograma en blanco', () => ANIM.addBlank());
      add('back', 'Mover a la izquierda', () => ANIM.moveFrame(-1), doc.frame === 0);
      add('back', 'Mover a la derecha', () => ANIM.moveFrame(1), doc.frame >= doc.frames.length - 1);
      add('trash', 'Eliminar fotograma', () => ANIM.remove(), doc.frames.length < 2);
      body.appendChild(box); box.children[5].querySelector('svg').style.transform = 'scaleX(-1)';
    });
  },
  animSettings() {
    const o = onionCfg(); let prevStop = null;
    this.sheet('aset', 'Animación', body => {
      const pv = el('<div class="box" style="display:grid;place-items:center;padding:8px"><canvas style="max-width:100%;max-height:34vh;background:#fff;border-radius:6px"></canvas></div>'); body.appendChild(pv);
      const cv = pv.querySelector('canvas'), k = Math.min(1, 520 / Math.max(doc.w, doc.h)); cv.width = Math.round(doc.w * k); cv.height = Math.round(doc.h * k); const cx = cv.getContext('2d');
      const comps = doc.frames.map((_, i) => compositeFrame(i, true, k)); let seq = ANIM.sequence(), pos = 0, last = 0, alive = true;
      const tick = t => { if (!alive) return; if (t - last >= 1000 / doc.fps * ANIM.holdOf(seq[pos])) { last = t; cx.clearRect(0, 0, cv.width, cv.height); cx.drawImage(comps[seq[pos]], 0, 0); pos++; if (pos >= seq.length) pos = doc.playMode === 'once' ? seq.length - 1 : 0; } requestAnimationFrame(tick); }; requestAnimationFrame(tick); prevStop = () => alive = false;
      const b1 = el('<div class="box" style="margin-top:10px"></div>');
      b1.appendChild(SRow('Fotogramas por segundo', { min: 1, max: 60, value: doc.fps, step: 1, onInput: v => { doc.fps = v; S.dirty = true; } }).el);
      b1.appendChild(el('<div style="font-size:13.5px;margin:8px 4px 6px">Opciones de reproducción</div>'));
      b1.appendChild(Seg([['loop', ic('rotate') + 'Bucle'], ['pingpong', ic('flip') + 'Ida y vuelta'], ['once', ic('play') + 'Una vez']], doc.playMode || 'loop', v => { doc.playMode = v; seq = ANIM.sequence(); pos = 0; S.dirty = true; }));
      body.appendChild(b1);
      body.appendChild(el('<div class="sec-t">Piel de cebolla</div>')); const b2 = el('<div class="box"></div>');
      b2.appendChild(el('<div style="font-size:13.5px;margin:2px 4px 6px">Modo de visualización</div>'));
      b2.appendChild(Seg([['none', 'Ninguno'], ['both', 'Ambos'], ['past', 'Pasado'], ['future', 'Futuro']], o.mode, v => { o.mode = v; S.onion = v !== 'none'; this.renderTimeline(); requestRender(); }));
      b2.appendChild(SRow('Número de pieles de cebolla', { min: 1, max: 5, value: o.n, step: 1, onInput: v => { o.n = v; requestRender(); } }).el);
      b2.appendChild(SRow('Primera opacidad', { min: 0, max: 1, value: o.a1, step: .01, fmt: v => Math.round(v * 100) + '%', onInput: v => { o.a1 = v; requestRender(); } }).el);
      b2.appendChild(SRow('Última opacidad', { min: 0, max: 1, value: o.a2, step: .01, fmt: v => Math.round(v * 100) + '%', onInput: v => { o.a2 = v; requestRender(); } }).el);
      const tr = el('<div class="row"><span class="lbl">Teñir con color</span></div>'); tr.appendChild(Toggle(o.tint, v => { o.tint = v; requestRender(); })); b2.appendChild(tr);
      const pc = el('<div class="row"><span class="lbl">Color pasado</span></div>'); pc.appendChild(this.colorBtn(o.past, c => { o.past = c; requestRender(); })); b2.appendChild(pc);
      const fc = el('<div class="row"><span class="lbl">Color futuro</span></div>'); fc.appendChild(this.colorBtn(o.fut, c => { o.fut = c; requestRender(); })); b2.appendChild(fc);
      body.appendChild(b2);
    }, { onClose: () => { prevStop && prevStop(); S.dirty = true; } });
  },
  frameSettings() {
    const f = FR();
    this.sheet('fset', 'Fotograma ' + (doc.frame + 1), body => {
      const b = el('<div class="box"></div>');
      b.appendChild(SRow('Duración (repeticiones)', { min: 1, max: 12, value: f.hold || 1, step: 1, fmt: v => '×' + v + ' · ' + Math.round(1000 / doc.fps * v) + ' ms', onInput: v => { f.hold = v; S.dirty = true; }, onEnd: () => this.renderTimeline() }).el);
      b.appendChild(el('<p style="color:var(--tx2);font-size:12.5px;margin:6px 2px 0">Sirve para pausas: un fotograma ×3 se queda en pantalla el triple de tiempo sin dibujarlo de nuevo.</p>'));
      body.appendChild(b);
    });
  },
  onPlay() { $('#tlPlay') && ($('#tlPlay').innerHTML = ic(S.playing ? 'pause' : 'play')); },
  markPlayFrame(i) { $$('#tlFrames .fr').forEach((d, j) => d.classList.toggle('on', i < 0 ? j === doc.frame : j === i)); },

  /* ---------- ventana de referencia ---------- */
  renderRef() { REF.render(); },
  savedBlip() { const d = $('#saveDot'); d.classList.add('show'); setTimeout(() => d.classList.remove('show'), 1200); },

  /* ---------- teclado ---------- */
  keys() {
    addEventListener('keydown', e => {
      if (!doc || $('#editor').classList.contains('hidden')) return; const tg = e.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT')) return;
      const k = e.key, ctrl = e.ctrlKey || e.metaKey;
      if (k === ' ') { spaceDown = true; view.style.cursor = 'grab'; e.preventDefault(); return; }
      if (ctrl && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (ctrl && k.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (ctrl && k.toLowerCase() === 's') { e.preventDefault(); saveDoc(); return; }
      if (ctrl && k.toLowerCase() === 'a') { e.preventDefault(); SEL.all(); return; }
      if (ctrl && k.toLowerCase() === 'd') { e.preventDefault(); SEL.none(); return; }
      if (ctrl && k.toLowerCase() === 'c') { e.preventDefault(); SEL.copy(false); return; }
      if (ctrl && k.toLowerCase() === 'x') { e.preventDefault(); SEL.copy(true); return; }
      if (ctrl && k.toLowerCase() === 'v') { e.preventDefault(); SEL.paste(); return; }
      if (ctrl && e.shiftKey && k.toLowerCase() === 'n') { e.preventDefault(); this.layerAct('add'); return; }
      if (ctrl) return;
      if (k === 'Escape') { if (S.fx) FX.cancel(); else if (S.textObj) TXT.cancel(); else if (this.sheetStack.length) this.closeSheet(); else if (S.sel) SEL.none(); return; }
      if (k === 'Delete' || k === 'Backspace') { if (S.sel) SEL.clearContent(); return; }
      if (k === '[' || k === ']') { const s = toolSize(); setToolSize(k === ']' ? s * 1.15 + .5 : s / 1.15 - .2); this.updDock(); this.syncPanelSliders(); requestRender(); return; }
      if (k === '0') { fitView(); return; } if (k === '+' || k === '=') { zoomAt(1.25, V.w / 2, V.h / 2); return; } if (k === '-') { zoomAt(.8, V.w / 2, V.h / 2); return; }
      if (k === 'x' || k === 'X') { const p = S.prevColor.slice(); S.prevColor = S.color.slice(); setColor(p); return; }
      if (doc.anim && (k === ',' || k === '.')) { ANIM.go(doc.frame + (k === '.' ? 1 : -1)); return; }
      if (doc.anim && k === 'Enter') { ANIM.play(); return; }
      const t = TOOLS.find(x => x[3].toLowerCase() === k.toLowerCase()); if (t) { t[0] === 'frame' ? this.openFrameMenu() : this.setTool(t[0]); }
    });
    addEventListener('keyup', e => { if (e.key === ' ') { spaceDown = false; this.updTool(); } });
    addEventListener('beforeunload', e => { if (doc && S.dirty) { saveDoc(true); } });
  },
};

/* botón atrás de Android y pausa */
window.fpsBack = function () {
  if ($$('.modal').length) { $$('.modal').pop().remove(); return true; }
  if (UI.sheetStack.length) { const t = UI.sheetStack[UI.sheetStack.length - 1]; if (t.id === 'text') TXT.commit(); else if (t.id === 'imgf') IMGF.cancel(); else if (t.id === 'bal') BAL.cancel(); else UI.closeSheet(); return true; }
  if (S.balloon) { BAL.cancel(); return true; } if (S.imgObj) { IMGF.cancel(); return true; } if (S.fx) { FX.cancel(); return true; } if (S.bgx) { BGX.cancel(); return true; } if (S.textObj) { TXT.commit(); return true; }
  if ($('#panel').classList.contains('open') && !UI.isWide()) { UI.closePanel(); return true; }
  if (S.playing) { ANIM.stop(); return true; }
  if (!$('#editor').classList.contains('hidden')) { UI.exitEditor(); return true; }
  if (UI.sel) { UI.toggleSelect(); return true; }
  return false;
};
window.fpsPause = function () { if (doc && S.dirty && !$('#editor').classList.contains('hidden')) saveDoc(true); };

/* ---------- ventana de referencia ---------- */
const REF = {
  on: false, imgs: [], i: -1, live: true, pos: store.get('refPos', { x: null, y: 120, w: 220 }),
  async loadImgs() { if (this.loaded) return; this.loaded = true; const arr = await DB.get('kv', 'refs') || []; for (const b of arr) { this.imgs.push({ blob: b, url: URL.createObjectURL(b) }); } },
  async render() {
    let w = $('#refWin'); if (!this.on || !doc) { w && w.remove(); return; } await this.loadImgs();
    if (!w) { w = el(`<div id="refWin"><div class="rh"><span class="t" style="flex:1">Referencia</span><button class="ib" data-a="add" title="Añadir imagen">${ic('image')}</button><button class="ib" data-a="live" title="Ver mi dibujo">${ic('view')}</button><button class="ib" data-a="prev">${ic('back')}</button><button class="ib" data-a="next" style="transform:scaleX(-1)">${ic('back')}</button><button class="ib" data-a="del" title="Quitar imagen">${ic('trash')}</button><button class="ib" data-a="x">${ic('close')}</button></div><div class="rb"><img alt=""><canvas class="hidden" style="width:100%;display:block"></canvas><div class="rs"></div></div></div>`); document.body.appendChild(w); this.bind(w); }
    const p = this.pos; w.style.width = p.w + 'px'; if (p.x != null) { w.style.left = clamp(p.x, 0, innerWidth - 80) + 'px'; w.style.right = 'auto'; w.style.top = clamp(p.y, 0, innerHeight - 60) + 'px'; }
    const img = w.querySelector('img'), cv = w.querySelector('canvas'), live = this.live || !this.imgs.length;
    w.querySelector('.t').textContent = live ? 'Mi dibujo' : `Imagen ${this.i + 1}/${this.imgs.length}`;
    img.classList.toggle('hidden', live); cv.classList.toggle('hidden', !live);
    $$('[data-a="prev"],[data-a="next"],[data-a="del"]', w).forEach(b => b.classList.toggle('hidden', live || this.imgs.length < (b.dataset.a === 'del' ? 1 : 2)));
    if (!live) img.src = this.imgs[this.i].url; else this.drawLive();
  },
  drawLive() { const w = $('#refWin'); if (!w || !(this.live || !this.imgs.length) || !doc) return; const cv = w.querySelector('canvas'); const k = Math.min(1, (this.pos.w * 2) / doc.w); const c = compositeFrame(doc.frame, true, k); cv.width = c.width; cv.height = c.height; cv.getContext('2d').drawImage(c, 0, 0); },
  bind(w) {
    w.querySelector('.rh').onclick = async e => { const b = e.target.closest('.ib'); if (!b) return; const a = b.dataset.a;
      if (a === 'x') { this.on = false; this.render(); }
      if (a === 'add') { const f = await UI.pickFile('image/*', true); for (const file of f) { this.imgs.push({ blob: file, url: URL.createObjectURL(file) }); } if (f.length) { this.i = this.imgs.length - 1; this.live = false; this.persist(); this.render(); } }
      if (a === 'live') { this.live = !this.live || !this.imgs.length; if (!this.live && this.i < 0) this.i = 0; this.render(); }
      if (a === 'prev' || a === 'next') { this.i = (this.i + (a === 'next' ? 1 : -1) + this.imgs.length) % this.imgs.length; this.render(); }
      if (a === 'del') { this.imgs.splice(this.i, 1); this.i = Math.min(this.i, this.imgs.length - 1); if (!this.imgs.length) this.live = true; this.persist(); this.render(); } };
    const drag = (handle, fn) => handle.addEventListener('pointerdown', e => { if (e.target.closest('.ib')) return; e.preventDefault(); handle.setPointerCapture(e.pointerId); const st = { x: e.clientX, y: e.clientY, r: w.getBoundingClientRect() }; const mv = ev => fn(ev, st); const up = () => { handle.removeEventListener('pointermove', mv); handle.removeEventListener('pointerup', up); store.set('refPos', this.pos); this.drawLive(); }; handle.addEventListener('pointermove', mv); handle.addEventListener('pointerup', up); });
    drag(w.querySelector('.rh'), (e, st) => { this.pos.x = st.r.left + e.clientX - st.x; this.pos.y = st.r.top + e.clientY - st.y; w.style.left = this.pos.x + 'px'; w.style.top = this.pos.y + 'px'; w.style.right = 'auto'; });
    drag(w.querySelector('.rs'), (e, st) => { this.pos.w = clamp(st.r.width + e.clientX - st.x, 140, innerWidth * .8); w.style.width = this.pos.w + 'px'; });
    // gotero sobre la referencia
    const pickFrom = (e, src) => { const r = src.getBoundingClientRect(); const c = mkCanvas(1, 1), x = c.getContext('2d'); const nw = src.naturalWidth || src.width, nh = src.naturalHeight || src.height; x.drawImage(src, (e.clientX - r.left) / r.width * nw, (e.clientY - r.top) / r.height * nh, 1, 1, 0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; if (d[3] > 10) { setColor([d[0], d[1], d[2]]); UI.addRecent([d[0], d[1], d[2]]); UI.toast('Color tomado de la referencia'); } };
    w.querySelector('img').addEventListener('click', e => pickFrom(e, e.target)); w.querySelector('canvas').addEventListener('click', e => pickFrom(e, e.target));
  },
  persist() { DB.put('kv', 'refs', this.imgs.map(i => i.blob)); },
};
// mantener la vista en vivo actualizada
const _origChanged = UI.onChanged; UI.onChanged = function (s) { _origChanged.call(this, s); clearTimeout(REF._t); if ($('#refWin')) REF._t = setTimeout(() => REF.drawLive(), 600); };

/* fuentes importadas guardadas */
(async () => { })();
addEventListener('load', async () => {
  await UI.init();
  try { const mine = await DB.get('kv', 'fonts') || []; for (const f of mine) { try { const ff = new FontFace(f.name, f.buf); await ff.load(); document.fonts.add(ff); FONTS.push([f.name, f.name, 'Mis fuentes']); } catch { } } } catch { }
});
