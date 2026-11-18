'use strict';
/* Animación: fotogramas, reproducción, GIF y video */
const ANIM = {
  addBlank() { structOp(() => { const cur = FR(); const f = { layers: cur.layers.map(l => { const n = newLayer(l.name); Object.assign(n, { opacity: l.opacity, blend: l.blend, visible: l.visible, clip: l.clip, tone: l.tone }); return n; }), active: cur.active }; doc.frames.splice(doc.frame + 1, 0, f); doc.frame++; }); },
  duplicate() { structOp(() => { const cur = FR(); const f = { layers: cur.layers.map(l => { const n = newLayer(l.name); Object.assign(n, layerProps(l)); n.ctx.drawImage(l.canvas, 0, 0); return n; }), active: cur.active, hold: cur.hold || 1 }; doc.frames.splice(doc.frame + 1, 0, f); doc.frame++; }); },
  remove() { if (doc.frames.length < 2) { UI.toast('La animación necesita al menos un fotograma'); return; } structOp(() => { doc.frames.splice(doc.frame, 1); doc.frame = Math.min(doc.frame, doc.frames.length - 1); }); },
  moveFrame(d) { const i = doc.frame, j = i + d; if (j < 0 || j >= doc.frames.length) return; structOp(() => { const t = doc.frames[i]; doc.frames[i] = doc.frames[j]; doc.frames[j] = t; doc.frame = j; }); },
  go(i) { if (S.textObj) TXT.commit(); cancelOp(); doc.frame = clamp(i, 0, doc.frames.length - 1); changed(true); },
  /* secuencia de reproducción según el modo (bucle, ida y vuelta, una vez) */
  sequence() { const N = doc.frames.length, seq = []; for (let i = 0; i < N; i++) seq.push(i); if (doc.playMode === 'pingpong' && N > 2) for (let i = N - 2; i > 0; i--) seq.push(i); return seq; },
  holdOf(i) { return Math.max(1, (doc.frames[i] && doc.frames[i].hold) || 1); },
  play(onFrame) {
    if (S.playing) return this.stop(); if (S.textObj) TXT.commit(); cancelOp(); S.playing = true; const seq = this.sequence(); let pos = Math.max(0, seq.indexOf(doc.frame)); S.playFrame = seq[pos]; let last = performance.now();
    const step = t => { if (!S.playing) return; if (t - last >= 1000 / doc.fps * this.holdOf(S.playFrame)) { last = t; pos++; if (pos >= seq.length) { if (doc.playMode === 'once') { this.stop(); return; } pos = 0; } S.playFrame = seq[pos]; requestRender(); UI.markPlayFrame && UI.markPlayFrame(S.playFrame); onFrame && onFrame(S.playFrame); } requestAnimationFrame(step); };
    requestAnimationFrame(step); UI.onPlay && UI.onPlay();
  },
  stop() { S.playing = false; requestRender(); UI.onPlay && UI.onPlay(); UI.markPlayFrame && UI.markPlayFrame(-1); },
};

/* ---------- GIF ---------- */
const GIF = {
  encode(frames, w, h, delayCs, transparent, onProg) {
    // paleta por popularidad (colores de 5 bits)
    const counts = new Map();
    for (const f of frames) { const d = f.data; for (let i = 0; i < d.length; i += 4 * (frames.length > 20 ? 3 : 1)) { if (transparent && d[i + 3] < 128) continue; const k = (d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | (d[i + 2] >> 3); counts.set(k, (counts.get(k) || 0) + 1); } }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, transparent ? 255 : 256).map(e => e[0]);
    const pal = top.map(k => [((k >> 10) & 31) * 8 + 4, ((k >> 5) & 31) * 8 + 4, (k & 31) * 8 + 4]); while (pal.length < 256) pal.push([0, 0, 0]);
    const TI = transparent ? 255 : -1; const lut = new Int16Array(32768).fill(-1);
    const nearest = k => { let v = lut[k]; if (v >= 0) return v; const r = ((k >> 10) & 31) * 8 + 4, g = ((k >> 5) & 31) * 8 + 4, b = (k & 31) * 8 + 4; let best = 0, bd = 1e9; const n = transparent ? 255 : 256; for (let i = 0; i < Math.min(n, top.length || 1); i++) { const p = pal[i], e = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2; if (e < bd) { bd = e; best = i; if (!e) break; } } lut[k] = best; return best; };
    const out = []; const w8 = b => out.push(b & 255), w16 = v => { out.push(v & 255, (v >> 8) & 255); }, ws = s => { for (const ch of s) out.push(ch.charCodeAt(0)); };
    ws('GIF89a'); w16(w); w16(h); w8(0xF7); w8(0); w8(0); for (const p of pal) out.push(p[0], p[1], p[2]);
    if (!this.once) { out.push(0x21, 0xFF, 11); ws('NETSCAPE2.0'); out.push(3, 1, 0, 0, 0); }
    frames.forEach((f, fi) => {
      const d = f.data, idx = new Uint8Array(w * h);
      for (let i = 0, j = 0; j < idx.length; i += 4, j++) { if (transparent && d[i + 3] < 128) idx[j] = TI; else idx[j] = nearest((d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | (d[i + 2] >> 3)); }
      out.push(0x21, 0xF9, 4, (2 << 2) | (transparent ? 1 : 0)); w16(Array.isArray(delayCs) ? delayCs[fi] : delayCs); out.push(transparent ? TI : 0, 0);
      out.push(0x2C); w16(0); w16(0); w16(w); w16(h); out.push(0); out.push(8);
      const bytes = this.lzw(idx, 8); for (let i = 0; i < bytes.length; i += 255) { const n = Math.min(255, bytes.length - i); out.push(n); for (let k = 0; k < n; k++) out.push(bytes[i + k]); } out.push(0);
      onProg && onProg((fi + 1) / frames.length);
    });
    out.push(0x3B); return new Uint8Array(out);
  },
  lzw(ix, min) {
    const clear = 1 << min, eoi = clear + 1; let size = min + 1, next = eoi + 1; let dict = new Map(); const out = []; let cur = 0, bits = 0;
    const put = c => { cur |= c << bits; bits += size; while (bits >= 8) { out.push(cur & 255); cur >>>= 8; bits -= 8; } };
    put(clear); let pre = ix[0];
    for (let i = 1; i < ix.length; i++) { const k = ix[i], key = pre * 256 + k, v = dict.get(key); if (v !== undefined) { pre = v; continue; } put(pre); if (next < 4096) { dict.set(key, next++); if (next > (1 << size) && size < 12) size++; } else { put(clear); dict = new Map(); size = min + 1; next = eoi + 1; } pre = k; }
    put(pre); put(eoi); if (bits > 0) out.push(cur & 255); return out;
  },
};

/* ---------- video (time-lapse y animación) ---------- */
function videoMime() { const c = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']; for (const m of c) if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) return m; return null; }
async function recordVideo(drawFrame, count, fps, w, h, onProg) {
  const mime = videoMime(); if (!mime) throw new Error('Este navegador no puede grabar video');
  const c = mkCanvas(w, h), x = c.getContext('2d'); drawFrame(x, 0);
  const stream = c.captureStream(0); const track = stream.getVideoTracks()[0]; const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6e6 }); const chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const done = new Promise(r => rec.onstop = r); rec.start();
  for (let i = 0; i < count; i++) { drawFrame(x, i); if (track.requestFrame) track.requestFrame(); onProg && onProg((i + 1) / count); await new Promise(r => setTimeout(r, 1000 / fps)); }
  await new Promise(r => setTimeout(r, 200)); rec.stop(); await done;
  return new Blob(chunks, { type: mime.split(';')[0] });
}
