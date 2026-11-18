'use strict';
/* Asistente IA: el usuario elige el proveedor que prefiera y usa su propia clave */
const AI_PROVIDERS = {
  openai: { name: 'ChatGPT (OpenAI)', model: 'gpt-4o-mini', key: true, url: 'https://api.openai.com/v1/chat/completions', fmt: 'openai', help: 'Clave en platform.openai.com → API keys' },
  anthropic: { name: 'Claude (Anthropic)', model: 'claude-sonnet-5-5', key: true, url: 'https://api.anthropic.com/v1/messages', fmt: 'anthropic', help: 'Clave en console.anthropic.com → API keys' },
  gemini: { name: 'Gemini (Google)', model: 'gemini-2.5-flash', key: true, url: 'https://generativelanguage.googleapis.com/v1beta/models/', fmt: 'gemini', help: 'Clave gratis en aistudio.google.com → Get API key' },
  openrouter: { name: 'OpenRouter (muchos modelos)', model: 'openai/gpt-4o-mini', key: true, url: 'https://openrouter.ai/api/v1/chat/completions', fmt: 'openai', help: 'Clave en openrouter.ai/keys' },
  ollama: { name: 'Ollama (en tu PC, sin clave)', model: 'llava', key: false, url: 'http://localhost:11434/api/chat', fmt: 'ollama', help: 'Instala Ollama y ejecuta: ollama pull llava' },
  custom: { name: 'Otro compatible con OpenAI', model: '', key: true, url: 'http://localhost:1234/v1/chat/completions', fmt: 'openai', help: 'LM Studio, Groq, Mistral… cualquier API con formato OpenAI' },
};
const AI_STYLES = [
  ['profe', 'Profe de dibujo', 'Eres un profesor de dibujo amable y paciente. Explicas paso a paso, con ejemplos concretos.'],
  ['critico', 'Crítico honesto', 'Eres un crítico de arte directo: señalas con claridad lo que no funciona y cómo arreglarlo, sin rodeos.'],
  ['manga', 'Experto en manga y anime', 'Eres un mangaka con experiencia: hablas de viñetas, expresiones, entintado, tramas y narrativa visual.'],
  ['pixel', 'Experto en pixel art', 'Eres experto en pixel art y texturas de Minecraft: paletas limitadas, sombreado por niveles, legibilidad a poca resolución.'],
  ['color', 'Colorista', 'Eres especialista en color y luz: paletas, armonías, temperatura, contraste y ambientación.'],
  ['custom', 'Personalizado', ''],
];
const AI = {
  cfg() { return Object.assign({ provider: 'gemini', model: '', key: '', url: '', style: 'profe', custom: '', name: 'Asistente', sendImg: true }, store.get('ai', {})); },
  save(c) { store.set('ai', c); },
  history: [],
  system(c) {
    const st = AI_STYLES.find(s => s[0] === c.style) || AI_STYLES[0];
    const persona = c.style === 'custom' ? (c.custom || 'Eres un asistente de dibujo.') : st[2] + (c.custom ? ' ' + c.custom : '');
    return `${persona} Te llamas ${c.name || 'Asistente'} y ayudas dentro de FPSpaint, un programa de dibujo, animación y manga. Responde siempre en español, de forma breve y práctica. Cuando propongas colores, escríbelos como códigos hexadecimales (#RRGGBB). Si ves una imagen, es el dibujo actual del usuario${doc ? ` (${doc.w}×${doc.h}px${doc.anim ? ', animación de ' + doc.frames.length + ' fotogramas' : ''}${doc.pixel ? ', pixel art' : ''})` : ''}.`;
  },
  snapshot() { if (!doc) return null; const k = Math.min(1, 1024 / Math.max(doc.w, doc.h)); const c = compositeFrame(doc.frame, true, k); const j = mkCanvas(c.width, c.height), x = j.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, j.width, j.height); x.drawImage(c, 0, 0); return j.toDataURL('image/jpeg', .85).split(',')[1]; },
  async ask(text, withImg) {
    const c = this.cfg(), P = AI_PROVIDERS[c.provider]; if (!P) throw new Error('Elige un proveedor');
    if (P.key && !c.key) throw new Error('Falta tu clave de API. Ábrela en Configurar.');
    const model = c.model || P.model; if (!model) throw new Error('Escribe el nombre del modelo en Configurar.');
    const img = withImg ? this.snapshot() : null; const sys = this.system(c);
    const hist = this.history.slice(-10);
    let url = c.provider === 'custom' && c.url ? c.url : P.url, opts, pick;
    if (P.fmt === 'openai') {
      const msgs = [{ role: 'system', content: sys }, ...hist.map(m => ({ role: m.role, content: m.text }))];
      msgs.push({ role: 'user', content: img ? [{ type: 'text', text }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + img } }] : text });
      const h = { 'Content-Type': 'application/json' }; if (c.key) h.Authorization = 'Bearer ' + c.key; if (c.provider === 'openrouter') { h['HTTP-Referer'] = 'https://fpspaint.app'; h['X-Title'] = 'FPSpaint'; }
      opts = { method: 'POST', headers: h, body: JSON.stringify({ model, messages: msgs, max_tokens: 900 }) }; pick = j => j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    } else if (P.fmt === 'anthropic') {
      const msgs = hist.map(m => ({ role: m.role, content: m.text })); msgs.push({ role: 'user', content: img ? [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img } }, { type: 'text', text }] : text });
      opts = { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model, system: sys, max_tokens: 900, messages: msgs }) };
      pick = j => (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    } else if (P.fmt === 'gemini') {
      url = P.url + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(c.key);
      const contents = hist.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] }));
      const parts = [{ text }]; if (img) parts.push({ inline_data: { mime_type: 'image/jpeg', data: img } }); contents.push({ role: 'user', parts });
      opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system_instruction: { parts: [{ text: sys }] }, contents }) };
      pick = j => j.candidates && j.candidates[0] && j.candidates[0].content && (j.candidates[0].content.parts || []).map(p => p.text || '').join('');
    } else if (P.fmt === 'ollama') {
      const msgs = [{ role: 'system', content: sys }, ...hist.map(m => ({ role: m.role, content: m.text }))]; const um = { role: 'user', content: text }; if (img) um.images = [img]; msgs.push(um);
      opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages: msgs, stream: false }) }; pick = j => j.message && j.message.content;
    }
    let res; try { res = await fetch(url, opts); } catch (e) { throw new Error(isFrame() ? 'La versión web de prueba no puede conectarse a otros sitios. Usa el asistente en el programa de PC o en el APK.' : c.provider === 'ollama' ? 'No pude conectar con Ollama. ¿Está abierto en tu PC?' : 'No hay conexión con el proveedor (revisa internet o la dirección).'); }
    let j = null; try { j = await res.json(); } catch { }
    if (!res.ok) { const m = j && (j.error && (j.error.message || j.error) || j.message) || res.statusText; throw new Error((res.status === 401 || res.status === 403 ? 'La clave no es válida o no tiene permiso. ' : res.status === 429 ? 'Llegaste al límite de uso de tu cuenta. ' : res.status === 404 ? 'No existe ese modelo. ' : '') + (typeof m === 'string' ? m : JSON.stringify(m)).slice(0, 300)); }
    const out = (pick(j) || '').trim(); if (!out) throw new Error('La IA no devolvió texto.');
    this.history.push({ role: 'user', text }, { role: 'assistant', text: out }); return out;
  },
  md(t) {
    const e = esc(t); return e.replace(/```([\s\S]*?)```/g, '<pre style="white-space:pre-wrap;background:var(--g0);padding:8px;border-radius:8px">$1</pre>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\n)#{1,4} (.+)/g, '$1<b>$2</b>').replace(/(^|\n)\s*[-*] /g, '$1• ').replace(/#([0-9a-fA-F]{6})\b/g, '<span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#$1;vertical-align:-1px;margin-right:3px;box-shadow:0 0 0 1px rgba(255,255,255,.3)"></span>#$1').replace(/\n/g, '<br>');
  },
};

UI.openAI = function () {
  const c = AI.cfg(); const P = AI_PROVIDERS[c.provider];
  this.sheet('ai', (c.name || 'Asistente') + ' · ' + P.name.split(' (')[0], body => {
    body.style.display = 'flex'; body.style.flexDirection = 'column'; body.style.minHeight = '50vh';
    const log = el('<div style="flex:1;overflow:auto;display:flex;flex-direction:column;gap:8px;padding:4px 0 8px;min-height:120px"></div>');
    const bubble = (role, html) => { const b = el(`<div style="align-self:${role === 'user' ? 'flex-end' : 'flex-start'};max-width:88%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.45;background:${role === 'user' ? 'var(--acc-d)' : 'var(--g1)'};-webkit-user-select:text;user-select:text">${html}</div>`); log.appendChild(b); log.scrollTop = 1e9; return b; };
    if (!AI.history.length) bubble('assistant', `Hola, soy ${esc(c.name || 'tu asistente')}. Puedo ver tu dibujo y darte consejos, ideas o paletas de colores. ¿En qué te ayudo?`);
    for (const m of AI.history) { const b = bubble(m.role, m.role === 'user' ? esc(m.text) : AI.md(m.text)); if (m.role === 'assistant') addColors(b, m.text); }
    function addColors(b, text) { const cols = [...new Set((text.match(/#[0-9a-fA-F]{6}\b/g) || []).map(x => x.toLowerCase()))]; if (cols.length < 2) return; const row = el('<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;align-items:center"></div>'); for (const h of cols) { const s = el(`<button title="${h}" style="width:26px;height:26px;border-radius:7px;background:${h};box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)"></button>`); s.onclick = () => setColor(parseHex(h)); row.appendChild(s); } const sv = el(`<button class="btn" style="height:30px;font-size:12.5px">${ic('palette')}Guardar como paleta</button>`); sv.onclick = () => { PAL.list.push({ name: 'Paleta IA ' + (PAL.list.length + 1), colors: cols }); PAL.cur = PAL.list.length - 1; PAL.save(); UI.renderPalette(); UI.toast('Paleta guardada'); }; row.appendChild(sv); b.appendChild(row); }
    const chips = el('<div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:6px;scrollbar-width:none;flex:none"></div>');
    for (const q of ['¿Cómo mejoro este dibujo?', 'Dame una paleta de colores para esto', 'Ideas para el fondo', 'Revisa la anatomía y proporciones', '¿Qué técnica de sombreado me recomiendas?', 'Ideas para la siguiente viñeta']) { const b = el(`<button class="pill-btn" style="flex:none;height:32px;font-size:12.5px;font-weight:500">${q}</button>`); b.onclick = () => send(q); chips.appendChild(b); }
    const bar = el(`<div class="row" style="gap:6px;flex:none"><button class="ib" title="Configurar">${ic('sliders')}</button><input class="inp" style="flex:1" placeholder="Pregúntale algo sobre tu dibujo…"><button class="ib" style="color:var(--acc)" title="Enviar">${ic('upload')}</button></div>`);
    const imgRow = el('<div class="row" style="min-height:30px;flex:none"><span class="lbl" style="font-size:12.5px;color:var(--tx2)">Enviar mi dibujo con la pregunta</span></div>'); imgRow.appendChild(Toggle(c.sendImg, v => { const k = AI.cfg(); k.sendImg = v; AI.save(k); }));
    const inp = bar.querySelector('input');
    async function send(text) { text = (text || inp.value).trim(); if (!text) return; inp.value = ''; bubble('user', esc(text)); const wait = bubble('assistant', '<span style="color:var(--tx2)">Pensando…</span>'); try { const out = await AI.ask(text, AI.cfg().sendImg); wait.innerHTML = AI.md(out); addColors(wait, out); } catch (e) { wait.innerHTML = `<span style="color:#ffb3b3">${esc(e.message)}</span>`; AI.history.length && AI.history[AI.history.length - 1].role === 'user' && AI.history.pop(); } log.scrollTop = 1e9; }
    inp.onkeydown = e => { if (e.key === 'Enter') send(); }; bar.children[2].onclick = () => send(); bar.children[0].onclick = () => this.aiSettings();
    body.append(log, chips, imgRow, bar);
    if (!c.key && P.key) setTimeout(() => this.aiSettings(), 200);
  });
};
UI.aiSettings = function () {
  const c = AI.cfg();
  this.sheet('aicfg', 'Configurar asistente IA', body => {
    body.appendChild(el('<div class="sec-t" style="margin-top:4px">Elige tu IA</div>'));
    const box = el('<div class="box" style="padding:4px"></div>');
    const render = () => { box.innerHTML = ''; for (const [k, P] of Object.entries(AI_PROVIDERS)) { const r = el(`<div class="list-row ${c.provider === k ? '' : ''}" style="${c.provider === k ? 'background:var(--acc-t)' : ''}"><div class="grow">${P.name}<div class="sub">${P.help}</div></div>${c.provider === k ? ic('check') : ''}</div>`); r.onclick = () => { c.provider = k; c.model = ''; render(); fields(); }; box.appendChild(r); } };
    render(); body.appendChild(box);
    const f = el('<div class="box" style="margin-top:10px;display:flex;flex-direction:column;gap:8px"></div>'); body.appendChild(f);
    function fields() {
      const P = AI_PROVIDERS[c.provider]; f.innerHTML = '';
      if (P.key) f.append(el('<label style="font-size:13px;color:var(--tx2)">Clave de API (se guarda solo en este dispositivo)</label>'), Object.assign(el(`<input class="inp" type="password" autocomplete="off" value="${esc(c.key)}" placeholder="pega tu clave aquí">`), { oninput: e => c.key = e.target.value.trim() }));
      f.append(el('<label style="font-size:13px;color:var(--tx2)">Modelo</label>'), Object.assign(el(`<input class="inp" value="${esc(c.model)}" placeholder="${esc(P.model || 'nombre del modelo')}">`), { oninput: e => c.model = e.target.value.trim() }));
      if (c.provider === 'custom') f.append(el('<label style="font-size:13px;color:var(--tx2)">Dirección de la API</label>'), Object.assign(el(`<input class="inp" value="${esc(c.url || P.url)}">`), { oninput: e => c.url = e.target.value.trim() }));
    }
    fields();
    body.appendChild(el('<div class="sec-t">Personalidad</div>'));
    const p = el('<div class="box" style="display:flex;flex-direction:column;gap:8px"></div>');
    p.append(el('<label style="font-size:13px;color:var(--tx2)">Nombre del asistente</label>'), Object.assign(el(`<input class="inp" value="${esc(c.name)}">`), { oninput: e => c.name = e.target.value }));
    const g = el('<div class="grid-tools" style="grid-template-columns:repeat(3,1fr)"></div>'); for (const [k, n] of AI_STYLES) { const b = el(`<button class="tbtn ${c.style === k ? 'on' : ''}">${n}</button>`); b.onclick = () => { c.style = k; $$('.tbtn', g).forEach(x => x.classList.toggle('on', x === b)); }; g.appendChild(b); } p.appendChild(g);
    p.append(el('<label style="font-size:13px;color:var(--tx2)">Instrucciones extra (tus gustos, tu estilo, lo que estás aprendiendo)</label>'), Object.assign(el(`<textarea class="inp" rows="3" placeholder="Ej: dibujo personajes de anime y quiero mejorar las manos">${esc(c.custom)}</textarea>`), { oninput: e => c.custom = e.target.value }));
    body.appendChild(p);
    const ok = el('<button class="btn pri full" style="margin-top:12px">Guardar</button>'); ok.onclick = () => { AI.save(c); this.closeSheet('aicfg'); this.closeSheet('ai'); this.openAI(); }; body.appendChild(ok);
    const clr = el('<button class="btn full" style="margin-top:8px">Borrar la conversación</button>'); clr.onclick = () => { AI.history = []; this.toast('Conversación borrada'); }; body.appendChild(clr);
  });
};
