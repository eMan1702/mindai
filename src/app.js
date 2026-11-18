/* MindAI — editor di mappe mentali nel browser con IA per nodo.
 * Formato nativo: .smmx (archivio zip con document/mindmap.xml), compatibile con le mappe SimpleMind.
 * I dati aggiuntivi (stili personalizzati, icone emoji, conversazioni IA) sono salvati in
 * document/mindai.json dentro lo stesso archivio, così il file resta leggibile da SimpleMind.
 */
(() => {
'use strict';

// ======================================================================
// Costanti
// ======================================================================
const SIDECAR_PATH = 'document/mindai.json';
const DEFAULT_XML_PATH = 'document/mindmap.xml';
const LS_SETTINGS = 'mindai.settings.v1';
const LS_CURRENT = 'mindai.current.v1';

const SHEETS = {
  classic: { name: 'Classico', bg: '#ffffff', mode: 'light',
    root: { fill: '#2f3b52', stroke: '#2f3b52', text: '#ffffff' },
    palette: ['#e8590c', '#2f9e44', '#1c7ed6', '#ae3ec9', '#f08c00', '#0c8599', '#d6336c', '#4263eb'] },
  soft: { name: 'Colori tenui', bg: '#fbfaf6', mode: 'light',
    root: { fill: '#fff3bf', stroke: '#d9a400', text: '#3b3000' },
    palette: ['#f4a261', '#8ac926', '#4cc9f0', '#b8a1e3', '#f6bd60', '#84dcc6', '#f28482', '#90a8ff'] },
  solid: { name: 'Pieno', bg: '#f3f5fa', mode: 'solid',
    root: { fill: '#111827', stroke: '#111827', text: '#ffffff' },
    palette: ['#ef4444', '#16a34a', '#2563eb', '#9333ea', '#ea580c', '#0891b2', '#db2777', '#4f46e5'] },
  outline: { name: 'Contorno', bg: '#ffffff', mode: 'outline',
    root: { fill: '#ffffff', stroke: '#1f2937', text: '#1f2937' },
    palette: ['#e8590c', '#2f9e44', '#1c7ed6', '#ae3ec9', '#f08c00', '#0c8599', '#d6336c', '#4263eb'] },
  night: { name: 'Notte', bg: '#171b22', mode: 'dark',
    root: { fill: '#f8f9fa', stroke: '#f8f9fa', text: '#111' },
    palette: ['#ff922b', '#69db7c', '#4dabf7', '#da77f2', '#ffd43b', '#3bc9db', '#f783ac', '#748ffc'] },
  mono: { name: 'Monocromo', bg: '#ffffff', mode: 'outline',
    root: { fill: '#222222', stroke: '#222222', text: '#ffffff' },
    palette: ['#444444', '#666666', '#555555', '#777777'] },
};

const ICONS = ['⭐','✅','❌','❗','❓','💡','🔥','📌','📎','📅','⏰','💰','📈','📉','🎯','🚀',
  '🔒','🔑','⚠️','❤️','👍','👎','😀','😟','🧠','📝','📚','🔍','🛠️','⚙️','🌍','🏠',
  '💼','🎓','🛒','☎️','✉️','👤','👥','🏁','🧩','🗂️','📊','🧪','🎨','🎵','🍀','⚡',
  '1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔴','🟠','🟡','🟢','🔵','🟣','⚪'];

const PROVIDERS = {
  claude: { label: 'Claude (Anthropic)', models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-2'] },
  openai: { label: 'OpenAI', models: ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4o'] },
  ollama: { label: 'Ollama (locale)', models: ['llama3.1', 'qwen2.5', 'mistral', 'gemma2'] },
  compat: { label: 'Compatibile OpenAI (LM Studio, ecc.)', models: [] },
};

const DEFAULT_SETTINGS = {
  defaultProvider: 'claude',
  claude: { key: '', model: 'claude-opus-5-5' },
  openai: { key: '', model: 'gpt-5', base: 'https://api.openai.com/v1' },
  ollama: { base: 'http://localhost:11434', model: 'llama3.1' },
  compat: { base: 'http://localhost:1234/v1', key: '', model: '' },
  maxNodes: 7,
  depth: 2,
  includeOther: true,
  expand: true,
  theme: 'auto',
};

// ======================================================================
// Utilità
// ======================================================================
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
const smGuid = () => uid().replace(/-/g, '').toUpperCase();
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
function toast(msg, ms = 2600) {
  const t = h('div', { class: 'toast' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  let s = m[1]; if (s.length === 3) s = s.split('').map(c => c + c).join('');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
function mix(hex, withHex, t) {
  const a = hexToRgb(hex), b = hexToRgb(withHex); if (!a || !b) return hex;
  const c = a.map((v, i) => Math.round(v * (1 - t) + b[i] * t));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}
function isDark(hex) { const c = hexToRgb(hex); if (!c) return false; return (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000 < 140; }
function download(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function safeName(s) { return (s || 'mappa').replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 80) || 'mappa'; }

// ======================================================================
// Impostazioni (salvate solo in questo browser)
// ======================================================================
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}');
    const out = structuredClone(DEFAULT_SETTINGS);
    for (const k of Object.keys(out)) {
      if (s[k] == null) continue;
      if (typeof out[k] === 'object') Object.assign(out[k], s[k]); else out[k] = s[k];
    }
    return out;
  } catch { return structuredClone(DEFAULT_SETTINGS); }
}
let settings = loadSettings();
function saveSettings() { try { localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); } catch {} applyTheme(); }
function applyTheme() {
  if (settings.theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', settings.theme);
}

// ======================================================================
// IndexedDB: libreria delle mappe nel browser
// ======================================================================
const idb = (() => {
  let dbp;
  function open() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open('mindai', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('maps', { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(mode, fn) {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction('maps', mode); const st = t.objectStore('maps');
      const r = fn(st); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error);
    });
  }
  return {
    put: (rec) => tx('readwrite', st => st.put(rec)),
    get: (id) => tx('readonly', st => st.get(id)),
    del: (id) => tx('readwrite', st => st.delete(id)),
    all: () => tx('readonly', st => st.getAll()),
  };
})();

// ======================================================================
// Modello del documento
// ======================================================================
/* node = { id, parent ('-1' per i temi centrali), x, y, text, note, palette, guid,
 *          style:{shape,fill,stroke,color,size,bold,italic}, icon, collapsed, aiGen,
 *          ai:{provider, model, messages:[{role, content, ts, provider, model, created:[ids]}]} } */
let doc = null;          // { id, title, sheet, nodes:{}, order:[] }
let session = null;      // { zip, xml, xmlPath, elMap: Map, noteUsesN, fileName, handle }
let selectedId = null;
let undoStack = [], redoStack = [];
let childCache = null;

function newNode(props) {
  return Object.assign({ id: '0', parent: '-1', x: 0, y: 0, text: '', note: '', palette: null, guid: smGuid(),
    style: {}, icon: '', collapsed: false, aiGen: false, ai: null }, props);
}
function N(id) { return doc.nodes[id]; }
function invalidate() { childCache = null; }
function children(id) {
  if (!childCache) {
    childCache = new Map();
    for (const nid of doc.order) {
      const p = doc.nodes[nid].parent;
      if (!childCache.has(p)) childCache.set(p, []);
      childCache.get(p).push(nid);
    }
  }
  return childCache.get(id) || [];
}
function roots() { return children('-1'); }
function ancestors(id) { const out = []; let n = N(id); while (n && n.parent !== '-1' && N(n.parent)) { n = N(n.parent); out.unshift(n.id); } return out; }
function rootOf(id) { const a = ancestors(id); return a.length ? a[0] : id; }
function depthOf(id) { return ancestors(id).length; }
function descendants(id, out = []) { for (const c of children(id)) { out.push(c); descendants(c, out); } return out; }
function isDescendant(id, of) { return ancestors(id).includes(of); }
function nextId() { let m = -1; for (const k of doc.order) { const v = parseInt(k, 10); if (!isNaN(v) && v > m) m = v; } return String(m + 1); }
function sideOf(id) { // +1 destra, -1 sinistra rispetto al tema centrale
  const n = N(id); if (n.parent === '-1') return 1;
  const r = N(rootOf(id)); return n.x >= r.x ? 1 : -1;
}
function effectivePalette(id) {
  let n = N(id);
  while (n) { if (n.palette != null && n.palette !== '') return parseInt(n.palette, 10); if (n.parent === '-1') break; n = N(n.parent); }
  return null;
}
function branchColor(id) {
  const sheet = SHEETS[doc.sheet] || SHEETS.classic;
  const p = effectivePalette(id);
  if (p != null && !isNaN(p)) return sheet.palette[(Math.max(1, p) - 1) % sheet.palette.length];
  const a = ancestors(id); const first = a.length >= 1 ? (a[1] || id) : id;
  const idx = Math.max(0, children(rootOf(id)).indexOf(first));
  return sheet.palette[idx % sheet.palette.length];
}

function blankDoc(title = 'Nuova mappa') {
  const d = { id: uid(), title, sheet: 'classic', nodes: {}, order: [] };
  d.nodes['0'] = newNode({ id: '0', parent: '-1', x: 0, y: 0, text: title });
  d.order.push('0');
  return d;
}

// ---------- undo / redo ----------
function snapshot() { return JSON.stringify({ title: doc.title, sheet: doc.sheet, nodes: doc.nodes, order: doc.order }); }
function restore(s) { const o = JSON.parse(s); doc.title = o.title; doc.sheet = o.sheet; doc.nodes = o.nodes; doc.order = o.order; invalidate(); if (selectedId && !doc.nodes[selectedId]) selectedId = null; }
function pushUndo() { undoStack.push(snapshot()); if (undoStack.length > 80) undoStack.shift(); redoStack = []; }
function mutate(fn, { history = true, layout = false } = {}) {
  if (history) pushUndo();
  fn(); invalidate();
  render(); if (layout) { measure(); }
  refreshPanel(); scheduleSave();
}
function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); render(); refreshPanel(); scheduleSave(); }
function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); render(); refreshPanel(); scheduleSave(); }

// ======================================================================
// Formato .smmx (lettura / scrittura)
// ======================================================================
const decodeText = (s) => (s || '').replace(/\\N/g, '\n');
const encodeText = (s) => (s || '').replace(/\r?\n/g, '\\N');

async function parseSmmx(buf, fileName = '') {
  const zip = await JSZip.loadAsync(buf);
  let xmlPath = zip.file(DEFAULT_XML_PATH) ? DEFAULT_XML_PATH : null;
  if (!xmlPath) {
    for (const p of Object.keys(zip.files)) {
      if (!p.toLowerCase().endsWith('.xml') || zip.files[p].dir) continue;
      const t = await zip.file(p).async('string');
      if (t.includes('<simplemind-mindmaps')) { xmlPath = p; break; }
    }
  }
  if (!xmlPath) throw new Error('Il file non contiene una mappa SimpleMind (.smmx) valida.');
  const xmlText = await zip.file(xmlPath).async('string');
  const hasBom = xmlText.charCodeAt(0) === 0xFEFF;
  const crlf = /\r\n/.test(xmlText.slice(0, 400));
  const declM = /^\uFEFF?(<\?xml[^>]*\?>)/.exec(xmlText); const decl = declM ? declM[1] : null;
  const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (xml.getElementsByTagName('parsererror').length) throw new Error('XML della mappa non leggibile.');
  const mm = xml.getElementsByTagName('mindmap')[0];
  if (!mm) throw new Error('Nessuna mappa trovata nel file.');

  let sidecar = null;
  if (zip.file(SIDECAR_PATH)) { try { sidecar = JSON.parse(await zip.file(SIDECAR_PATH).async('string')); } catch {} }

  const meta = childEl(mm, 'meta');
  const titleEl = meta && childEl(meta, 'title');
  const guidEl = meta && childEl(meta, 'guid');
  const styleEl = meta && childEl(meta, 'style');
  const d = { id: (guidEl && guidEl.getAttribute('guid')) || uid(), title: '', sheet: 'classic', nodes: {}, order: [] };
  const elMap = new Map();
  let noteUsesN = false;
  const topicsEl = childEl(mm, 'topics');
  const topicEls = topicsEl ? Array.from(topicsEl.children).filter(e => e.tagName === 'topic') : [];
  for (const el of topicEls) {
    const id = el.getAttribute('id'); if (id == null) continue;
    const noteEl = childEl(el, 'note');
    const rawNote = noteEl ? noteEl.textContent : '';
    if (rawNote.includes('\\N')) noteUsesN = true;
    const n = newNode({
      id, parent: el.getAttribute('parent') ?? '-1',
      x: parseFloat(el.getAttribute('x')) || 0, y: parseFloat(el.getAttribute('y')) || 0,
      text: decodeText(el.getAttribute('text')), note: trimNote(decodeText(rawNote)),
      palette: el.getAttribute('palette'), guid: el.getAttribute('guid') || smGuid(),
      hasImage: !!childEl(el, 'image'), hasLink: !!childEl(el, 'link'),
    });
    d.nodes[id] = n; d.order.push(id); elMap.set(id, el);
  }
  // parent mancanti -> diventano temi centrali
  for (const id of d.order) { const n = d.nodes[id]; if (n.parent !== '-1' && !d.nodes[n.parent]) n.parent = '-1'; }
  if (!d.order.length) { const r = newNode({ id: '0', text: 'Tema centrale' }); d.nodes['0'] = r; d.order.push('0'); }

  const rootText = d.nodes[d.order.find(i => d.nodes[i].parent === '-1')]?.text || '';
  d.title = (titleEl && decodeText(titleEl.getAttribute('text'))) || rootText.split('\n')[0] || fileName.replace(/\.smmx$/i, '') || 'Mappa';
  const smStyle = styleEl ? (styleEl.getAttribute('key') || '') : '';
  if (/soft|pastel/i.test(smStyle)) d.sheet = 'soft';
  else if (/dark|night|black/i.test(smStyle)) d.sheet = 'night';

  if (sidecar) applySidecar(d, sidecar);
  const relations = readRelations(mm);
  return { doc: d, session: { zip, xml, xmlPath, elMap, noteUsesN, fileName, handle: null, relations, hasBom, crlf, decl } };
}
function trimNote(s) { return (s || '').replace(/^\r?\n/, '').replace(/\r?\n$/, ''); }
function childEl(parent, tag) { if (!parent) return null; for (const c of parent.children) if (c.tagName === tag) return c; return null; }
function readRelations(mm) {
  const rel = childEl(mm, 'relations'); if (!rel) return [];
  return Array.from(rel.children).filter(e => e.tagName === 'relation').map(e => ({
    source: e.getAttribute('source') ?? e.getAttribute('from'),
    target: e.getAttribute('target') ?? e.getAttribute('to'),
    text: decodeText(e.getAttribute('text') || ''),
  }));
}
function applySidecar(d, sc) {
  if (sc.sheet && SHEETS[sc.sheet]) d.sheet = sc.sheet;
  if (sc.docId) d.id = sc.docId;
  const byGuid = new Map(Object.values(d.nodes).map(n => [n.guid, n]));
  for (const [key, extra] of Object.entries(sc.nodes || {})) {
    const n = byGuid.get(key) || d.nodes[key]; if (!n) continue;
    if (extra.style) n.style = extra.style;
    if (extra.icon) n.icon = extra.icon;
    if (extra.collapsed) n.collapsed = true;
    if (extra.aiGen) n.aiGen = true;
    if (extra.ai) n.ai = extra.ai;
  }
}
function buildSidecar() {
  const nodes = {};
  for (const id of doc.order) {
    const n = doc.nodes[id]; const e = {};
    if (n.style && Object.keys(n.style).length) e.style = n.style;
    if (n.icon) e.icon = n.icon;
    if (n.collapsed) e.collapsed = true;
    if (n.aiGen) e.aiGen = true;
    if (n.ai && (n.ai.messages?.length || n.ai.provider || n.ai.model)) e.ai = n.ai;
    if (Object.keys(e).length) nodes[n.guid] = e;
  }
  return { app: 'MindAI', version: 1, docId: doc.id, sheet: doc.sheet, nodes };
}

const NEW_XML = (title, guid) => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE simplemind-mindmaps>
<simplemind-mindmaps generator="MindAI" gen-version="1.0.0" doc-version="3">
<mindmap>
<meta>
<guid guid="${guid}"/>
<title text="${esc(title)}"/>
<style key="system.soft-colors"/>
<auto-numbering style="disabled"/>
<scrollstate zoom="100" x="0" y="0"/>
</meta>
<topics/>
<relations/>
</mindmap>
</simplemind-mindmaps>`;

async function buildSmmx() {
  if (!session || !session.xml) {
    const guid = smGuid();
    session = Object.assign(session || {}, {
      zip: new JSZip(), xmlPath: DEFAULT_XML_PATH, elMap: new Map(), noteUsesN: false, relations: [],
      xml: new DOMParser().parseFromString(NEW_XML(doc.title, guid), 'application/xml'),
    });
  }
  const xml = session.xml;
  const mm = xml.getElementsByTagName('mindmap')[0];
  let meta = childEl(mm, 'meta'); if (!meta) { meta = xml.createElement('meta'); mm.insertBefore(meta, mm.firstChild); }
  let titleEl = childEl(meta, 'title'); if (!titleEl) { titleEl = xml.createElement('title'); meta.append(titleEl); }
  titleEl.setAttribute('text', encodeText(doc.title));

  let topicsEl = childEl(mm, 'topics'); if (!topicsEl) { topicsEl = xml.createElement('topics'); mm.append(topicsEl); }
  for (const c of Array.from(topicsEl.childNodes)) if ((c.nodeType === 1 && c.tagName === 'topic') || (c.nodeType === 3 && !c.textContent.trim())) c.remove();
  topicsEl.append(xml.createTextNode('\n'));
  // ordine: i genitori prima dei figli (ordinamento stabile)
  const done = new Set(), out = [];
  const visit = (id) => { if (done.has(id)) return; const n = doc.nodes[id]; if (n.parent !== '-1' && doc.nodes[n.parent]) visit(n.parent); done.add(id); out.push(id); };
  doc.order.forEach(visit);
  for (const id of out) {
    const n = doc.nodes[id];
    let el = session.elMap.get(id);
    const isNew = !el;
    if (isNew) { el = xml.createElement('topic'); session.elMap.set(id, el); }
    el.setAttribute('id', n.id);
    el.setAttribute('parent', n.parent);
    el.setAttribute('guid', n.guid);
    el.setAttribute('x', n.x.toFixed(2));
    el.setAttribute('y', n.y.toFixed(2));
    if (n.palette != null && n.palette !== '') {
      el.setAttribute('palette', String(n.palette));
      if (isNew || !el.hasAttribute('colorinfo')) el.setAttribute('colorinfo', String(n.palette));
    } else if (isNew) { el.removeAttribute('palette'); }
    el.setAttribute('text', encodeText(n.text));
    let noteEl = childEl(el, 'note');
    if (n.note) {
      const same = noteEl && trimNote(decodeText(noteEl.textContent)) === n.note;
      if (!same) {
        if (!noteEl) { noteEl = xml.createElement('note'); el.insertBefore(noteEl, el.firstChild); }
        noteEl.textContent = '\n' + (session.noteUsesN ? encodeText(n.note) : n.note) + '\n';
      }
    } else if (noteEl) noteEl.remove();
    topicsEl.append(el, xml.createTextNode('\n'));
  }
  const rel = childEl(mm, 'relations');
  if (rel) for (const r of Array.from(rel.children)) {
    const s = r.getAttribute('source') ?? r.getAttribute('from'), t = r.getAttribute('target') ?? r.getAttribute('to');
    if ((s != null && !doc.nodes[s]) || (t != null && !doc.nodes[t])) r.remove();
  }
  let str = new XMLSerializer().serializeToString(xml);
  str = str.replace(/^(<\?xml[^>]*\?>)?\s*(<!DOCTYPE[^>]*>)?\s*/, (m, decl, dt) => (session.decl || '<?xml version="1.0" encoding="utf-8"?>') + '\n' + (dt ? dt + '\n' : ''));
  if (session.crlf) str = str.replace(/\r?\n/g, '\r\n');
  if (session.hasBom) str = '\uFEFF' + str;
  session.zip.file(session.xmlPath, str, { createFolders: false });
  session.zip.file(SIDECAR_PATH, JSON.stringify(buildSidecar()), { createFolders: false });
  return session.zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/octet-stream' });
}

// ======================================================================
// Salvataggio automatico + apertura
// ======================================================================
let saving = false, saveAgain = false, dirtyFile = false;
const setSaveState = (t) => { const el = $('#save-state'); if (el) el.textContent = t; };
const scheduleSave = (() => { const d = debounce(autosave, 900); return () => { dirtyFile = true; setSaveState('Modifiche…'); d(); }; })();
async function autosave() {
  if (saving) { saveAgain = true; return; }
  saving = true;
  try {
    const blob = await buildSmmx();
    await idb.put({ id: doc.id, title: doc.title, updated: Date.now(), blob, fileName: session?.fileName || '' });
    try { localStorage.setItem(LS_CURRENT, doc.id); } catch {}
    setSaveState(session?.handle && dirtyFile ? 'Salvata nel browser · file da salvare' : 'Salvata nel browser');
  } catch (e) { console.error(e); setSaveState('Errore salvataggio'); }
  saving = false;
  if (saveAgain) { saveAgain = false; autosave(); }
}
async function loadBuffer(buf, fileName, handle = null) {
  const r = await parseSmmx(buf, fileName);
  doc = r.doc; session = r.session; session.handle = handle;
  undoStack = []; redoStack = []; invalidate();
  selectedId = roots()[0] || null;
  render(); fitView(); refreshPanel(); autosave();
  $('#doc-title').value = doc.title;
}
function newDocument() {
  doc = blankDoc(); session = null; undoStack = []; redoStack = []; invalidate();
  selectedId = '0'; $('#doc-title').value = doc.title;
  render(); centerOn('0', 1); refreshPanel(); autosave();
}
async function openFilePicker() {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({ types: [{ description: 'Mappe mentali', accept: { 'application/octet-stream': ['.smmx'] } }] });
      const f = await handle.getFile();
      await loadBuffer(await f.arrayBuffer(), f.name, handle);
      dirtyFile = false; setSaveState('Aperta: ' + f.name);
      return;
    } catch (e) { if (e.name === 'AbortError') return; if (e.name !== 'SecurityError' && e.name !== 'TypeError') { toast('Errore: ' + e.message); return; } }
  }
  $('#file-input').click();
}
async function saveFile(asNew = false) {
  try {
    const blob = await buildSmmx();
    if (!asNew && session?.handle) {
      const w = await session.handle.createWritable(); await w.write(blob); await w.close();
      dirtyFile = false; setSaveState('Salvata su file'); toast('Salvata: ' + session.handle.name); return;
    }
    const name = safeName(doc.title) + '.smmx';
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Mappa mentale', accept: { 'application/octet-stream': ['.smmx'] } }] });
        const w = await handle.createWritable(); await w.write(blob); await w.close();
        session.handle = handle; session.fileName = handle.name; dirtyFile = false;
        setSaveState('Salvata su file'); toast('Salvata: ' + handle.name); return;
      } catch (e) { if (e.name === 'AbortError') return; }
    }
    download(blob, name); dirtyFile = false; toast('File scaricato: ' + name);
  } catch (e) { console.error(e); toast('Errore nel salvataggio: ' + e.message); }
}
function exportMarkdown() {
  const lines = [];
  const walk = (id, d) => {
    const n = N(id);
    lines.push(d === 0 ? `# ${n.text.replace(/\n/g, ' ')}` : `${'  '.repeat(d - 1)}- ${(n.icon ? n.icon + ' ' : '')}${n.text.replace(/\n/g, ' ')}`);
    if (n.note) lines.push(...n.note.split('\n').map(l => `${'  '.repeat(Math.max(0, d))}> ${l}`));
    children(id).forEach(c => walk(c, d + 1));
  };
  roots().forEach(r => { walk(r, 0); lines.push(''); });
  download(new Blob([lines.join('\n')], { type: 'text/markdown' }), safeName(doc.title) + '.md');
}

// ======================================================================
// Vista: camera, rendering
// ======================================================================
const cam = { x: 0, y: 0, z: 1 };
const sizes = new Map();
let stage, world, edgesSvg;
let presentation = null;

function applyCam() { world.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`; }
function screenToWorld(sx, sy) { const r = stage.getBoundingClientRect(); return { x: (sx - r.left - cam.x) / cam.z, y: (sy - r.top - cam.y) / cam.z }; }
function size(id) { return sizes.get(id) || { w: 110, h: 34 }; }

function visibleIds() {
  const out = [];
  const walk = (id) => { out.push(id); if (!N(id).collapsed) children(id).forEach(walk); };
  roots().forEach(walk);
  return out;
}
function nodeColors(id) {
  const n = N(id); const sheet = SHEETS[doc.sheet] || SHEETS.classic; const st = n.style || {};
  let fill, stroke, color;
  if (n.parent === '-1') ({ fill, stroke, text: color } = sheet.root);
  else {
    const c = branchColor(id);
    switch (sheet.mode) {
      case 'solid': fill = c; stroke = c; color = isDark(c) ? '#fff' : '#111'; break;
      case 'outline': fill = sheet.bg; stroke = c; color = '#1f2937'; break;
      case 'dark': fill = mix(c, '#171b22', 0.75); stroke = c; color = '#f1f3f5'; break;
      default: fill = mix(c, '#ffffff', 0.84); stroke = c; color = '#1d2330';
    }
  }
  if (st.fill) { fill = st.fill; if (!st.color) color = isDark(st.fill) ? '#fff' : '#1d2330'; }
  if (st.stroke) stroke = st.stroke;
  if (st.color) color = st.color;
  return { fill, stroke, color };
}

function render() {
  if (!doc) return;
  const sheet = SHEETS[doc.sheet] || SHEETS.classic;
  stage.style.background = sheet.bg;
  for (const el of Array.from(world.querySelectorAll('.node'))) el.remove();
  const vis = visibleIds();
  const frag = document.createDocumentFragment();
  for (const id of vis) frag.append(renderNode(id));
  world.append(frag);
  measure();
  renderEdges();
  if (presentation) applyPresentationDim();
}
function renderNode(id) {
  const n = N(id); const st = n.style || {}; const { fill, stroke, color } = nodeColors(id);
  const isRoot = n.parent === '-1';
  const el = h('div', { class: 'node' + (isRoot ? ' root' : '') + (st.shape ? ' shape-' + st.shape : '') + (id === selectedId ? ' selected' : ''), 'data-id': id });
  el.style.left = n.x + 'px'; el.style.top = n.y + 'px';
  el.style.background = fill; el.style.borderColor = stroke; el.style.color = color;
  if (st.size) el.style.fontSize = st.size + 'px';
  if (st.bold) el.style.fontWeight = '700';
  if (st.italic) el.style.fontStyle = 'italic';
  if (n.icon) el.append(h('span', { class: 'icon' }, n.icon));
  el.append(h('span', { class: 'txt' }, n.text || (isRoot ? 'Tema centrale' : '')));
  const badges = h('div', { class: 'badges' });
  if (n.note) badges.append(h('span', { class: 'badge', title: 'Ha una nota' }, '📝'));
  if (n.ai?.messages?.length) badges.append(h('span', { class: 'badge ai', title: 'Conversazione IA su questo nodo' }, '✨' + Math.ceil(n.ai.messages.length / 2)));
  if (n.hasImage) badges.append(h('span', { class: 'badge', title: 'Immagine (visibile in SimpleMind)' }, '🖼'));
  if (badges.children.length) el.append(badges);
  const kids = children(id);
  if (kids.length && !isRoot) {
    const side = sideOf(id);
    el.append(h('div', { class: 'collapse ' + (side > 0 ? 'right' : 'left'), 'data-collapse': id, title: n.collapsed ? 'Espandi' : 'Comprimi' }, n.collapsed ? String(descendants(id).length) : '−'));
  }
  return el;
}
function measure() {
  for (const el of world.querySelectorAll('.node')) sizes.set(el.dataset.id, { w: el.offsetWidth, h: el.offsetHeight });
}
function edgePath(pid, cid) {
  const p = N(pid), c = N(cid), ps = size(pid), cs = size(cid);
  const dir = c.x >= p.x ? 1 : -1;
  const isRoot = p.parent === '-1';
  const x1 = isRoot ? p.x + dir * Math.min(ps.w / 2 - 10, 30) : p.x + dir * ps.w / 2;
  const y1 = p.y;
  const x2 = c.x - dir * cs.w / 2, y2 = c.y;
  const mx = (x1 + x2) / 2;
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
}
function renderEdges() {
  const parts = [];
  const sheet = SHEETS[doc.sheet] || SHEETS.classic;
  const vis = new Set(visibleIds());
  for (const id of vis) {
    const n = N(id); if (n.parent === '-1' || !vis.has(n.parent)) continue;
    const st = n.style || {}; const col = st.stroke || branchColor(id);
    const d = depthOf(id);
    const w = Math.max(1.5, 5 - d);
    const dim = presentation && !presentation.focus.has(id) ? ' opacity="0.2"' : '';
    parts.push(`<path d="${edgePath(n.parent, id)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round"${dim}/>`);
  }
  for (const r of (session?.relations || [])) {
    if (!vis.has(r.source) || !vis.has(r.target)) continue;
    const a = N(r.source), b = N(r.target);
    const mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - 60;
    parts.push(`<path d="M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}" fill="none" stroke="${sheet.mode === 'dark' ? '#aaa' : '#888'}" stroke-width="1.5" stroke-dasharray="6 5"/>`);
    if (r.text) parts.push(`<text x="${mx}" y="${(a.y + b.y) / 2 - 34}" text-anchor="middle" class="relation-label">${esc(r.text)}</text>`);
  }
  edgesSvg.innerHTML = parts.join('');
}
function selectNode(id, { center = false } = {}) {
  selectedId = id;
  for (const el of world.querySelectorAll('.node.selected')) el.classList.remove('selected');
  if (id) { const el = nodeEl(id); if (el) el.classList.add('selected'); }
  if (center && id) ensureVisible(id);
  refreshPanel();
}
const nodeEl = (id) => world.querySelector(`.node[data-id="${CSS.escape(id)}"]`);
function centerOn(id, z = cam.z) {
  const n = N(id); const r = stage.getBoundingClientRect();
  cam.z = z; cam.x = r.width / 2 - n.x * z; cam.y = r.height / 2 - n.y * z; applyCam();
}
function ensureVisible(id) {
  const n = N(id); const r = stage.getBoundingClientRect(); const s = size(id);
  const sx = n.x * cam.z + cam.x, sy = n.y * cam.z + cam.y;
  const pad = 40;
  if (sx - s.w * cam.z / 2 < pad || sx + s.w * cam.z / 2 > r.width - pad || sy < pad || sy > r.height - pad) centerOn(id);
}
function bbox(ids) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const id of ids) { const n = N(id), s = size(id); x1 = Math.min(x1, n.x - s.w / 2); x2 = Math.max(x2, n.x + s.w / 2); y1 = Math.min(y1, n.y - s.h / 2); y2 = Math.max(y2, n.y + s.h / 2); }
  return { x1, y1, x2, y2 };
}
function fitIds(ids, maxZ = 1.4, pad = 60) {
  if (!ids.length) return;
  const b = bbox(ids); const r = stage.getBoundingClientRect();
  const z = clamp(Math.min((r.width - pad * 2) / Math.max(1, b.x2 - b.x1), (r.height - pad * 2) / Math.max(1, b.y2 - b.y1)), 0.15, maxZ);
  cam.z = z; cam.x = r.width / 2 - ((b.x1 + b.x2) / 2) * z; cam.y = r.height / 2 - ((b.y1 + b.y2) / 2) * z; applyCam();
}
function fitView() { fitIds(visibleIds(), 1.1); }
function zoomAt(factor, sx, sy) {
  const r = stage.getBoundingClientRect();
  if (sx == null) { sx = r.left + r.width / 2; sy = r.top + r.height / 2; }
  const w = screenToWorld(sx, sy);
  cam.z = clamp(cam.z * factor, 0.1, 4);
  cam.x = sx - r.left - w.x * cam.z; cam.y = sy - r.top - w.y * cam.z; applyCam();
}

// ======================================================================
// Disposizione dei nodi
// ======================================================================
const HGAP = 56, VGAP = 14;
function placeNewChild(pid, est = { w: 90, h: 32 }) {
  const p = N(pid); const ps = size(pid);
  let dir;
  if (p.parent === '-1') {
    const kids = children(pid); let r = 0, l = 0;
    kids.forEach(k => (N(k).x >= p.x ? r++ : l++));
    dir = r <= l ? 1 : -1;
  } else dir = sideOf(pid);
  const sibs = children(pid).filter(k => (N(k).x >= p.x ? 1 : -1) === dir);
  const x = p.x + dir * (ps.w / 2 + HGAP + est.w / 2);
  let y = p.y;
  if (sibs.length) { const last = sibs.reduce((a, b) => (N(a).y > N(b).y ? a : b)); y = N(last).y + size(last).h / 2 + VGAP + est.h / 2; }
  return { x, y, dir };
}
function subtreeHeight(id, memo) {
  if (memo.has(id)) return memo.get(id);
  const n = N(id); const kids = n.collapsed ? [] : children(id);
  let hsum = 0; kids.forEach((k, i) => { hsum += subtreeHeight(k, memo) + (i ? VGAP : 0); });
  const v = Math.max(size(id).h, hsum); memo.set(id, v); return v;
}
function moveSubtree(id, dx, dy) { for (const k of [id, ...descendants(id)]) { const n = N(k); n.x += dx; n.y += dy; } }
function layoutChildren(id, kids, dir, memo) {
  const n = N(id);
  const total = kids.reduce((s, k, i) => s + subtreeHeight(k, memo) + (i ? VGAP : 0), 0);
  let cursor = n.y - total / 2;
  for (const k of kids) {
    const hgt = subtreeHeight(k, memo); const c = N(k);
    const nx = n.x + dir * (size(id).w / 2 + HGAP + size(k).w / 2), ny = cursor + hgt / 2;
    moveSubtree(k, nx - c.x, ny - c.y);
    cursor += hgt + VGAP;
    if (!c.collapsed) layoutChildren(k, children(k), dir, memo);
  }
}
function layoutSubtree(id) {
  const memo = new Map(); const n = N(id);
  if (n.parent === '-1') {
    const kids = children(id);
    const right = kids.filter(k => N(k).x >= n.x), left = kids.filter(k => N(k).x < n.x);
    layoutChildren(id, right, 1, memo); layoutChildren(id, left, -1, memo);
  } else layoutChildren(id, children(id), sideOf(id), memo);
}
function balanceRoot(id) { // distribuisce i figli del tema centrale a destra e sinistra
  const n = N(id); const kids = children(id); const half = Math.ceil(kids.length / 2);
  kids.forEach((k, i) => { const c = N(k); const dir = i < half ? 1 : -1; if ((c.x >= n.x ? 1 : -1) !== dir) moveSubtree(k, 2 * (n.x - c.x), 0); });
}
function pushSiblingsApart(id) {
  // dopo un'espansione, sposta in basso/alto i fratelli che si sovrappongono al ramo
  const n = N(id); if (n.parent === '-1') return;
  const pid = n.parent; const dir = sideOf(id);
  const sibs = children(pid).filter(k => k !== id && sideOf(k) === dir);
  const box = (k) => bbox([k, ...(N(k).collapsed ? [] : descendants(k))]);
  const below = sibs.filter(k => N(k).y > n.y).sort((a, b) => N(a).y - N(b).y);
  let prev = box(id);
  for (const k of below) { const b = box(k); const need = prev.y2 + VGAP - b.y1; if (need > 0) moveSubtree(k, 0, need); prev = box(k); }
  const above = sibs.filter(k => N(k).y <= n.y).sort((a, b) => N(b).y - N(a).y);
  prev = box(id);
  for (const k of above) { const b = box(k); const need = b.y2 + VGAP - prev.y1; if (need > 0) moveSubtree(k, 0, -need); prev = box(k); }
  if (N(pid).parent !== '-1') pushSiblingsApart(pid);
}

// ======================================================================
// Operazioni sui nodi
// ======================================================================
function addChild(pid, text = '', extra = {}) {
  const p = N(pid);
  if (p.collapsed) p.collapsed = false;
  const pos = placeNewChild(pid);
  const id = nextId();
  let palette = null;
  if (p.parent === '-1') { const used = children(pid).length; palette = String((used % 8) + 1); }
  else { const ep = effectivePalette(pid); palette = ep != null && !isNaN(ep) ? String(ep) : null; }
  doc.nodes[id] = newNode(Object.assign({ id, parent: pid, x: pos.x, y: pos.y, text, palette }, extra));
  doc.order.push(id); invalidate();
  return id;
}
function addChildCmd(pid = selectedId) {
  if (!pid) return;
  let id; mutate(() => { id = addChild(pid); });
  selectNode(id, { center: true }); startEdit(id, '');
}
function addSiblingCmd() {
  if (!selectedId) return;
  const n = N(selectedId);
  if (n.parent === '-1') return addChildCmd(selectedId);
  let id;
  mutate(() => {
    id = addChild(n.parent);
    const c = N(id); const s = sideOf(selectedId);
    // posiziona subito sotto al fratello selezionato
    c.x = N(selectedId).x - s * (size(selectedId).w / 2) + s * 45; c.y = n.y + size(selectedId).h / 2 + VGAP + 16;
    // riordina: il nuovo nodo segue il selezionato
    doc.order.splice(doc.order.indexOf(id), 1); doc.order.splice(doc.order.indexOf(selectedId) + 1 + descendants(selectedId).length, 0, id);
    invalidate();
    pushSiblingsApart(id);
  });
  selectNode(id, { center: true }); startEdit(id, '');
}
function addFloatingTopic(wx, wy) {
  let id; mutate(() => { id = nextId(); doc.nodes[id] = newNode({ id, parent: '-1', x: wx, y: wy, text: '' }); doc.order.push(id); });
  selectNode(id); startEdit(id, '');
}
function deleteCmd(id = selectedId) {
  if (!id) return;
  const n = N(id);
  if (n.parent === '-1' && roots().length === 1) { toast('Non puoi eliminare l\'unico tema centrale.'); return; }
  const next = n.parent !== '-1' ? n.parent : roots().find(r => r !== id);
  mutate(() => {
    const kill = new Set([id, ...descendants(id)]);
    for (const k of kill) delete doc.nodes[k];
    doc.order = doc.order.filter(k => !kill.has(k));
  });
  selectNode(next || null);
}
function toggleCollapse(id) { mutate(() => { N(id).collapsed = !N(id).collapsed; }); }
function setAllCollapsed(v) { mutate(() => { for (const id of doc.order) if (children(id).length && N(id).parent !== '-1') N(id).collapsed = v; }); fitView(); }
function reparent(id, newParent) {
  if (id === newParent || isDescendant(newParent, id)) return;
  mutate(() => {
    const n = N(id); n.parent = newParent; invalidate();
    const pos = placeNewChild(newParent, size(id));
    // calcola il posizionamento escludendo il nodo stesso
    moveSubtree(id, pos.x - n.x, pos.y - n.y);
    measure(); layoutSubtree(id);
  });
}
function autoLayoutAll() {
  mutate(() => { for (const r of roots()) { balanceRoot(r); layoutSubtree(r); } });
  fitView();
}

// ---------- modifica testo in linea ----------
let editing = null;
function startEdit(id, initial = null) {
  if (!id) return; stopEditing(true);
  const el = nodeEl(id); if (!el) return;
  const txt = el.querySelector('.txt');
  const before = N(id).text;
  editing = { id, before, w0: el.offsetWidth };
  el.classList.add('editing');
  if (initial != null) txt.textContent = initial;
  txt.contentEditable = 'true';
  txt.focus();
  const range = document.createRange(); range.selectNodeContents(txt);
  if (initial != null) range.collapse(false);
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
  txt.addEventListener('keydown', onEditKey);
  txt.addEventListener('blur', () => stopEditing(true), { once: true });
  txt.addEventListener('input', () => { measure(); renderEdges(); });
}
function onEditKey(e) {
  e.stopPropagation();
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const id = editing?.id; stopEditing(true); if (e.ctrlKey || e.metaKey) { selectNode(id); addChildCmd(); } }
  else if (e.key === 'Escape') { e.preventDefault(); stopEditing(false); }
  else if (e.key === 'Tab') { e.preventDefault(); const id = editing?.id; stopEditing(true); selectNode(id); addChildCmd(id); }
}
function stopEditing(commit) {
  if (!editing) return;
  const { id, before, w0 } = editing; editing = null;
  const el = nodeEl(id); if (!el || !N(id)) { render(); return; }
  const txt = el.querySelector('.txt');
  txt.removeEventListener('keydown', onEditKey);
  const value = txt.innerText.replace(/\n$/, '').replace(/ /g, ' ');
  txt.contentEditable = 'false'; el.classList.remove('editing');
  if (commit && value !== before) {
    // il nuovo nodo vuoto è già nella cronologia: non serve un nuovo passo di annullamento
    mutate(() => {
      const n = N(id); n.text = value;
      const w1 = el.offsetWidth; if (n.parent !== '-1') { const s = sideOf(id); n.x += s * (w1 - w0) / 2; }
      if (n.parent === '-1' && doc.order.filter(k => N(k).parent === '-1')[0] === id && (doc.title === before || !doc.title || doc.title === 'Nuova mappa')) { doc.title = value.split('\n')[0]; $('#doc-title').value = doc.title; }
    }, { history: before !== '' });
  } else if (!commit || value === before) {
    if (before === '' && value === '' && N(id).parent !== '-1') { // nodo nuovo lasciato vuoto: lo rimuovo
      undoStack.pop(); delete doc.nodes[id]; doc.order = doc.order.filter(k => k !== id); invalidate();
      selectedId = N(selectedId) ? selectedId : null; render(); refreshPanel(); scheduleSave();
    } else render();
  }
  stage.focus({ preventScroll: true });
}

// ======================================================================
// Interazione (mouse, tocco, tastiera)
// ======================================================================
const pointers = new Map();
let drag = null, pinch = null, lastTap = { t: 0, id: null }, longPress = null;

function onPointerDown(e) {
  if (editing && e.target.closest('.node.editing')) return;
  if (e.target.closest('[data-collapse]')) { e.stopPropagation(); toggleCollapse(e.target.closest('[data-collapse]').dataset.collapse); return; }
  stage.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, camx: cam.x, camy: cam.y };
    drag = null; clearTimeout(longPress); return;
  }
  if (editing) stopEditing(true);
  const nEl = e.target.closest('.node');
  if (presentation) { drag = { type: 'pan', sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false, presenting: true }; return; }
  if (nEl) {
    const id = nEl.dataset.id;
    if (selectedId !== id) selectNode(id);
    drag = { type: 'node', id, sx: e.clientX, sy: e.clientY, moved: false, ids: [id, ...(N(id).collapsed ? descendants(id) : descendants(id))], orig: null };
    if (e.pointerType !== 'mouse') longPress = setTimeout(() => { if (drag && !drag.moved) { drag = null; openContextMenu(e.clientX, e.clientY, id); } }, 550);
  } else {
    drag = { type: 'pan', sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
  }
}
function onPointerMove(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y); const r = stage.getBoundingClientRect();
    const z = clamp(pinch.z * d / pinch.d, 0.1, 4);
    const wx = (pinch.cx - r.left - pinch.camx) / pinch.z, wy = (pinch.cy - r.top - pinch.camy) / pinch.z;
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    cam.z = z; cam.x = cx - r.left - wx * z; cam.y = cy - r.top - wy * z; applyCam(); return;
  }
  if (!drag) return;
  const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
  if (!drag.moved && Math.hypot(dx, dy) < 5) return;
  if (!drag.moved) { drag.moved = true; clearTimeout(longPress); if (drag.type === 'node') { pushUndo(); drag.orig = drag.ids.map(k => [k, N(k).x, N(k).y]); } }
  if (drag.type === 'pan') { cam.x = drag.cx + dx; cam.y = drag.cy + dy; applyCam(); }
  else if (drag.type === 'node') {
    for (const [k, ox, oy] of drag.orig) { const n = N(k); n.x = ox + dx / cam.z; n.y = oy + dy / cam.z; const el = nodeEl(k); if (el) { el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; } }
    renderEdges();
    // evidenzia un possibile nuovo genitore
    const under = document.elementsFromPoint(e.clientX, e.clientY).map(el => el.closest && el.closest('.node')).find(el => el && !drag.ids.includes(el.dataset.id));
    for (const el of world.querySelectorAll('.node.multi')) el.classList.remove('multi');
    drag.target = under ? under.dataset.id : null;
    if (under) under.classList.add('multi');
  }
}
function onPointerUp(e) {
  pointers.delete(e.pointerId); clearTimeout(longPress);
  if (pinch) { if (pointers.size < 2) pinch = null; drag = null; return; }
  const d = drag; drag = null; if (!d) return;
  if (d.presenting) { if (!d.moved) presentStep(e.clientX > window.innerWidth / 3 ? 1 : -1); return; }
  if (d.type === 'node') {
    for (const el of world.querySelectorAll('.node.multi')) el.classList.remove('multi');
    if (d.moved) {
      if (d.target && N(d.target) && !isDescendant(d.target, d.id)) { undoStack.pop(); reparent(d.id, d.target); }
      else { invalidate(); render(); scheduleSave(); }
      return;
    }
    // doppio tocco = modifica
    const now = Date.now();
    if (lastTap.id === d.id && now - lastTap.t < 380) { lastTap = { t: 0, id: null }; startEdit(d.id); return; }
    lastTap = { t: now, id: d.id };
  } else if (d.type === 'pan' && !d.moved) {
    const now = Date.now();
    if (lastTap.id === '__bg' && now - lastTap.t < 380) { lastTap = { t: 0, id: null }; const w = screenToWorld(e.clientX, e.clientY); addFloatingTopic(w.x, w.y); return; }
    lastTap = { t: now, id: '__bg' };
    selectNode(null);
  }
}
function onWheel(e) {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
  else { cam.x -= e.deltaX; cam.y -= e.deltaY; applyCam(); }
}
function navigate(key) {
  if (!selectedId) { selectNode(roots()[0]); return; }
  const n = N(selectedId); const side = sideOf(selectedId); const isRoot = n.parent === '-1';
  const kidsOn = (dir) => children(selectedId).filter(k => isRoot ? (N(k).x >= n.x ? 1 : -1) === dir : true);
  let target = null;
  const toChild = (dir) => { if (n.collapsed) return null; const ks = kidsOn(dir); return ks.length ? ks.reduce((a, b) => Math.abs(N(a).y - n.y) < Math.abs(N(b).y - n.y) ? a : b) : null; };
  if (key === 'ArrowRight') target = isRoot ? toChild(1) : (side > 0 ? toChild(1) : n.parent);
  if (key === 'ArrowLeft') target = isRoot ? toChild(-1) : (side < 0 ? toChild(-1) : n.parent);
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const pool = isRoot ? roots() : children(n.parent).filter(k => sideOf(k) === side);
    const sorted = pool.slice().sort((a, b) => N(a).y - N(b).y); const i = sorted.indexOf(selectedId);
    target = sorted[i + (key === 'ArrowUp' ? -1 : 1)] || null;
  }
  if (target) selectNode(target, { center: true });
}
function onKey(e) {
  if (editing) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
  if (presentation) {
    if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter'].includes(e.key)) { e.preventDefault(); presentStep(1); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); presentStep(-1); }
    else if (e.key === 'Escape') stopPresentation();
    return;
  }
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveFile(e.shiftKey); return; }
  if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); openFilePicker(); return; }
  if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); openPanel('ai'); setTimeout(() => $('#ai-prompt')?.focus(), 30); return; }
  if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomAt(1.2); return; }
  if (mod && e.key === '-') { e.preventDefault(); zoomAt(1 / 1.2); return; }
  if (mod && e.key === '0') { e.preventDefault(); fitView(); return; }
  if (mod) return;
  switch (e.key) {
    case 'Tab': e.preventDefault(); addChildCmd(); return;
    case 'Enter': e.preventDefault(); addSiblingCmd(); return;
    case 'Delete': case 'Backspace': e.preventDefault(); deleteCmd(); return;
    case 'F2': e.preventDefault(); startEdit(selectedId); return;
    case 'Escape': selectNode(null); closeMenus(); return;
    case ' ': if (selectedId && children(selectedId).length) { e.preventDefault(); toggleCollapse(selectedId); } return;
    case 'ArrowRight': case 'ArrowLeft': case 'ArrowUp': case 'ArrowDown': e.preventDefault(); navigate(e.key); return;
  }
  if (selectedId && e.key.length === 1 && !e.altKey) { e.preventDefault(); startEdit(selectedId, e.key); }
}

// ---------- menu contestuale ----------
function closeMenus() { document.querySelectorAll('.menu').forEach(m => m.remove()); }
function showMenu(x, y, items) {
  closeMenus();
  const m = h('div', { class: 'menu' });
  for (const it of items) {
    if (it === '-') { m.append(h('hr')); continue; }
    m.append(h('button', { onclick: () => { closeMenus(); it.run(); } }, h('span', {}, it.icon || ''), it.label));
  }
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = clamp(x, 8, window.innerWidth - r.width - 8) + 'px';
  m.style.top = clamp(y, 8, window.innerHeight - r.height - 8) + 'px';
  setTimeout(() => document.addEventListener('pointerdown', (ev) => { if (!m.contains(ev.target)) closeMenus(); }, { once: true }), 0);
}
function openContextMenu(x, y, id) {
  selectNode(id);
  const n = N(id);
  showMenu(x, y, [
    { icon: '➕', label: 'Aggiungi figlio (Tab)', run: () => addChildCmd(id) },
    { icon: '↧', label: 'Aggiungi fratello (Invio)', run: () => addSiblingCmd() },
    { icon: '✏️', label: 'Modifica testo (F2)', run: () => startEdit(id) },
    { icon: '✨', label: 'Chiedi all\'IA su questo nodo', run: () => { openPanel('ai'); setTimeout(() => $('#ai-prompt')?.focus(), 30); } },
    '-',
    children(id).length && n.parent !== '-1' ? { icon: n.collapsed ? '▸' : '▾', label: n.collapsed ? 'Espandi ramo' : 'Comprimi ramo', run: () => toggleCollapse(id) } : null,
    children(id).length ? { icon: '⇶', label: 'Riordina questo ramo', run: () => mutate(() => { layoutSubtree(id); pushSiblingsApart(id); }) } : null,
    { icon: '📝', label: 'Nota', run: () => openPanel('note') },
    { icon: '🎨', label: 'Stile', run: () => openPanel('style') },
    '-',
    { icon: '🗑️', label: 'Elimina (Canc)', run: () => deleteCmd(id) },
  ].filter(Boolean));
}
function openMainMenu(btn) {
  const r = btn.getBoundingClientRect();
  showMenu(r.left, r.bottom + 4, [
    { icon: '📄', label: 'Nuova mappa', run: () => newDocument() },
    { icon: '📂', label: 'Apri file .smmx… (Ctrl+O)', run: () => openFilePicker() },
    { icon: '🗂️', label: 'Mappe salvate nel browser…', run: () => openLibrary() },
    '-',
    { icon: '💾', label: 'Salva (Ctrl+S)', run: () => saveFile(false) },
    { icon: '💾', label: 'Salva con nome… (Ctrl+Maiusc+S)', run: () => saveFile(true) },
    { icon: '⬇️', label: 'Esporta come Markdown', run: () => exportMarkdown() },
    '-',
    { icon: '⇶', label: 'Disposizione automatica', run: () => autoLayoutAll() },
    { icon: '▸', label: 'Comprimi tutti i rami', run: () => setAllCollapsed(true) },
    { icon: '▾', label: 'Espandi tutti i rami', run: () => setAllCollapsed(false) },
    '-',
    { icon: '🔑', label: 'Impostazioni IA (chiavi e modelli)…', run: () => openSettings() },
    { icon: '🌓', label: 'Tema app: ' + ({ auto: 'automatico', light: 'chiaro', dark: 'scuro' }[settings.theme]), run: () => { settings.theme = { auto: 'light', light: 'dark', dark: 'auto' }[settings.theme]; saveSettings(); } },
    { icon: '⌨️', label: 'Scorciatoie da tastiera', run: () => showHelp() },
  ]);
}

// ======================================================================
// Pannelli: Outline, Nota, Icona, Foglio di stile, Stile, Presentazione, IA
// ======================================================================
let activePanel = null;
const PANEL_TITLES = { outline: 'Outline', note: 'Nota', icon: 'Icona', sheet: 'Foglio di stile', style: 'Stile', present: 'Presentazione', ai: 'IA — Intelligenza Artificiale' };
function openPanel(name) {
  if (activePanel === name) { closePanel(); return; }
  activePanel = name;
  document.querySelectorAll('[data-panel]').forEach(b => b.classList.toggle('active', b.dataset.panel === name));
  $('#panel').classList.add('open'); $('#stage').classList.add('panel-open'); document.body.classList.add('panel-open');
  refreshPanel(true);
  if (selectedId && N(selectedId)) setTimeout(() => ensureVisible(selectedId), 0);
}
function closePanel() {
  activePanel = null;
  document.querySelectorAll('[data-panel]').forEach(b => b.classList.remove('active'));
  $('#panel').classList.remove('open'); $('#stage').classList.remove('panel-open'); document.body.classList.remove('panel-open');
}
let lastPanelKey = '';
function refreshPanel(force = false) {
  if (!activePanel || !doc) return;
  const key = activePanel + '|' + selectedId;
  // evita di ridisegnare la chat/nota mentre l'utente sta scrivendo nello stesso nodo
  const focused = document.activeElement && $('#panel').contains(document.activeElement) && /TEXTAREA|INPUT|SELECT/.test(document.activeElement.tagName);
  if (!force && key === lastPanelKey && focused && activePanel !== 'outline') return;
  lastPanelKey = key;
  $('#panel-title').textContent = PANEL_TITLES[activePanel];
  const body = $('#panel-body'); const compose = $('#panel-compose');
  body.innerHTML = ''; compose.innerHTML = ''; compose.style.display = 'none';
  ({ outline: panelOutline, note: panelNote, icon: panelIcon, sheet: panelSheet, style: panelStyle, present: panelPresent, ai: panelAI }[activePanel])(body, compose);
}
const needNode = (body) => { body.append(h('p', { class: 'muted' }, 'Seleziona un nodo sulla mappa.')); };

function panelOutline(body) {
  body.append(h('div', { class: 'row', style: { marginBottom: '10px' } },
    h('button', { class: 'btn', onclick: () => setAllCollapsed(false) }, 'Espandi tutto'),
    h('button', { class: 'btn', onclick: () => setAllCollapsed(true) }, 'Comprimi tutto'),
    h('button', { class: 'btn', onclick: () => { navigator.clipboard?.writeText(outlineText()); toast('Outline copiato'); } }, 'Copia')));
  const build = (ids, top) => {
    const ul = h('ul', { class: 'outline' + (top ? ' top' : '') });
    for (const id of ids) {
      const n = N(id); const kids = children(id);
      const row = h('div', { class: id === selectedId ? 'sel' : '', onclick: () => { selectNode(id, { center: true }); }, ondblclick: () => startEdit(id) },
        h('span', { class: 'tw', onclick: (e) => { if (kids.length) { e.stopPropagation(); toggleCollapse(id); } } }, kids.length ? (n.collapsed ? '▸' : '▾') : '·'),
        h('span', {}, (n.icon ? n.icon + ' ' : '') + (n.text || '(vuoto)').replace(/\n/g, ' ') + (n.ai?.messages?.length ? ' ✨' : '') + (n.note ? ' 📝' : '')));
      const li = h('li', {}, row);
      if (kids.length && !n.collapsed) li.append(build(kids, false));
      ul.append(li);
    }
    return ul;
  };
  body.append(build(roots(), true));
}
function outlineText() {
  const lines = []; const walk = (id, d) => { lines.push('  '.repeat(d) + N(id).text.replace(/\n/g, ' ')); children(id).forEach(c => walk(c, d + 1)); };
  roots().forEach(r => walk(r, 0)); return lines.join('\n');
}
function panelNote(body) {
  if (!selectedId) return needNode(body);
  const n = N(selectedId);
  body.append(h('div', { class: 'muted small', style: { marginBottom: '6px' } }, 'Nota di: ', h('b', {}, n.text || '(vuoto)')));
  let pushed = false;
  const ta = h('textarea', { class: 'full', style: { minHeight: '50vh' }, placeholder: 'Scrivi qui la nota del nodo…' });
  ta.value = n.note || '';
  ta.addEventListener('input', () => {
    if (!pushed) { pushUndo(); pushed = true; }
    n.note = ta.value; scheduleSave();
    const el = nodeEl(n.id); if (el) { const fresh = renderNode(n.id); el.replaceWith(fresh); }
  });
  body.append(ta);
  body.append(h('p', { class: 'muted small' }, 'La nota viene salvata nel file .smmx ed è leggibile anche da SimpleMind.'));
}
function panelIcon(body) {
  if (!selectedId) return needNode(body);
  const n = N(selectedId);
  const grid = h('div', { class: 'icon-grid' });
  for (const ic of ICONS) grid.append(h('button', { class: n.icon === ic ? 'sel' : '', onclick: () => mutate(() => { n.icon = n.icon === ic ? '' : ic; }) }, ic));
  body.append(grid);
  body.append(h('div', { style: { marginTop: '12px' } }, h('button', { class: 'btn', onclick: () => mutate(() => { n.icon = ''; }) }, 'Rimuovi icona')));
}
function panelSheet(body) {
  body.append(h('p', { class: 'muted small' }, 'Il foglio di stile cambia l\'aspetto di tutta la mappa.'));
  for (const [k, s] of Object.entries(SHEETS)) {
    body.append(h('div', { class: 'sheet-card' + (doc.sheet === k ? ' sel' : ''), onclick: () => mutate(() => { doc.sheet = k; }) },
      h('div', { class: 'dots' }, h('i', { style: { background: s.root.fill, border: '1px solid #8884' } }), ...s.palette.slice(0, 6).map(c => h('i', { style: { background: c } }))),
      h('div', {}, h('b', {}, s.name), h('div', { class: 'muted small' }, { light: 'tinte chiare', solid: 'colori pieni', outline: 'solo contorno', dark: 'sfondo scuro' }[s.mode]))));
  }
}
function panelStyle(body) {
  if (!selectedId) return needNode(body);
  const n = N(selectedId); const st = n.style || (n.style = {});
  const cur = nodeColors(selectedId);
  const set = (k, v) => mutate(() => { if (v === '' || v == null || v === false) delete st[k]; else st[k] = v; });
  const sheet = SHEETS[doc.sheet] || SHEETS.classic;
  body.append(h('div', { class: 'field' }, h('label', {}, 'Colore del ramo (compatibile SimpleMind)'),
    h('div', { class: 'swatches' }, ...sheet.palette.slice(0, 8).map((c, i) =>
      h('div', { class: 'swatch' + (String(n.palette) === String(i + 1) ? ' sel' : ''), style: { background: c }, title: 'Colore ' + (i + 1), onclick: () => mutate(() => { n.palette = String(i + 1); }) })))));
  body.append(h('div', { class: 'field' }, h('label', {}, 'Forma'),
    (() => { const s = h('select', { onchange: (e) => set('shape', e.target.value) });
      [['', 'Arrotondata'], ['rect', 'Rettangolo'], ['pill', 'Capsula'], ['cloud', 'Nuvola'], ['line', 'Solo linea']].forEach(([v, l]) => s.append(h('option', { value: v, selected: (st.shape || '') === v }, l)));
      return s; })()));
  const colorRow = (label, key, val) => h('div', { class: 'field' }, h('label', {}, label),
    h('div', { class: 'row' }, h('input', { type: 'color', value: /^#/.test(val) ? val : '#ffffff', onchange: (e) => set(key, e.target.value), style: { flex: '0 0 48px', height: '32px', padding: 0, border: 0, background: 'none' } }),
      h('button', { class: 'btn', onclick: () => set(key, '') }, st[key] ? 'Automatico' : 'Automatico ✓')));
  body.append(colorRow('Riempimento', 'fill', cur.fill), colorRow('Bordo e collegamento', 'stroke', cur.stroke), colorRow('Testo', 'color', cur.color));
  body.append(h('div', { class: 'field' }, h('label', {}, 'Dimensione testo'),
    (() => { const s = h('select', { onchange: (e) => set('size', e.target.value ? parseInt(e.target.value, 10) : '') });
      [['', 'Normale'], ['12', 'Piccolo'], ['16', 'Medio'], ['20', 'Grande'], ['26', 'Molto grande']].forEach(([v, l]) => s.append(h('option', { value: v, selected: String(st.size || '') === v }, l)));
      return s; })()));
  body.append(h('div', { class: 'row' },
    h('button', { class: 'btn' + (st.bold ? ' primary' : ''), onclick: () => set('bold', !st.bold) }, h('b', {}, 'G'), ' Grassetto'),
    h('button', { class: 'btn' + (st.italic ? ' primary' : ''), onclick: () => set('italic', !st.italic) }, h('i', {}, 'C'), ' Corsivo')));
  body.append(h('div', { class: 'row', style: { marginTop: '14px' } },
    h('button', { class: 'btn', onclick: () => mutate(() => { const copy = { ...st }; for (const d of descendants(n.id)) N(d).style = { ...copy }; }) }, 'Applica ai sotto-nodi'),
    h('button', { class: 'btn danger', onclick: () => mutate(() => { n.style = {}; }) }, 'Reimposta')));
}
function panelPresent(body) {
  body.append(h('p', {}, 'La presentazione mostra la mappa un ramo alla volta, partendo dal tema centrale.'));
  body.append(h('p', { class: 'muted small' }, 'Avanti: freccia destra, spazio o tocco a destra. Indietro: freccia sinistra o tocco a sinistra. Esci: Esc.'));
  body.append(h('div', { class: 'row' },
    h('button', { class: 'btn primary', onclick: () => startPresentation(roots()[0]) }, '▶ Dall\'inizio'),
    h('button', { class: 'btn', disabled: !selectedId, onclick: () => startPresentation(selectedId) }, '▶ Dal nodo selezionato')));
}

// ---------- Presentazione ----------
function presentationOrder(start) {
  const out = []; const walk = (id) => { if (children(id).length || out.length === 0 || true) out.push(id); children(id).forEach(walk); };
  const r = rootOf(start); walk(r);
  return out;
}
function startPresentation(fromId) {
  if (!fromId) return;
  closePanel();
  const order = presentationOrder(fromId);
  presentation = { order, i: Math.max(0, order.indexOf(fromId)), saved: { ...cam }, collapsed: doc.order.filter(k => N(k).collapsed) };
  for (const k of presentation.collapsed) N(k).collapsed = false;
  document.body.classList.add('presenting');
  document.documentElement.requestFullscreen?.().catch(() => {});
  render(); presentShow();
}
function presentShow() {
  const id = presentation.order[presentation.i];
  const focus = new Set([id, ...ancestors(id), ...children(id)]);
  presentation.focus = focus;
  applyPresentationDim(); renderEdges();
  fitIds([id, ...children(id)], 1.8, 90);
  $('#present-pos').textContent = `${presentation.i + 1} / ${presentation.order.length}`;
}
function applyPresentationDim() {
  for (const el of world.querySelectorAll('.node')) el.classList.toggle('dim', !!presentation.focus && !presentation.focus.has(el.dataset.id));
  for (const el of world.querySelectorAll('.node.selected')) el.classList.remove('selected');
}
function presentStep(d) { if (!presentation) return; presentation.i = clamp(presentation.i + d, 0, presentation.order.length - 1); presentShow(); }
function stopPresentation() {
  if (!presentation) return;
  for (const k of presentation.collapsed) if (N(k)) N(k).collapsed = true;
  Object.assign(cam, presentation.saved); presentation = null;
  document.body.classList.remove('presenting');
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  applyCam(); render();
}

// ======================================================================
// IA per nodo
// ======================================================================
let aiBusy = null; // { id, controller }

function effectiveAI(id) {
  let provider = '', model = '';
  for (const k of [id, ...ancestors(id).reverse()]) {
    const a = N(k).ai; if (!a) continue;
    if (!provider && a.provider) { provider = a.provider; if (!model && a.model) model = a.model; }
  }
  provider = provider || settings.defaultProvider;
  model = model || settings[provider]?.model || '';
  return { provider, model };
}
function nodeLabel(id) { const n = N(id); return (n.text || '(vuoto)').replace(/\n/g, ' ').slice(0, 80); }
function pathText(id) { return [...ancestors(id), id].map(nodeLabel).join(' › '); }
function clip(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; }

function convoText(id, maxEach = 700) {
  const msgs = N(id).ai?.messages || [];
  return msgs.map(m => (m.role === 'user' ? 'Utente: ' : 'IA: ') + clip(m.content, maxEach)).join('\n');
}
function buildContext(id) {
  const n = N(id);
  const parts = [];
  parts.push(`Mappa: «${doc.title}»`);
  parts.push(`Percorso del ramo: ${pathText(id)}  (nodo selezionato: «${nodeLabel(id)}»)`);
  if (n.note) parts.push(`Nota del nodo selezionato:\n${clip(n.note, 2000)}`);
  // ramo sotto al nodo
  const sub = [];
  const walk = (k, d) => { if (sub.length > 150) return; const c = N(k); sub.push('  '.repeat(d) + '- ' + nodeLabel(k) + (c.note ? ` — nota: ${clip(c.note.replace(/\n/g, ' '), 160)}` : '')); children(k).forEach(x => walk(x, d + 1)); };
  children(id).forEach(k => walk(k, 0));
  parts.push(sub.length ? `Struttura attuale del ramo sotto il nodo selezionato:\n${sub.join('\n')}` : 'Il nodo selezionato non ha ancora sotto-nodi.');
  // conversazioni degli antenati (stesso ramo)
  const anc = ancestors(id).filter(a => N(a).ai?.messages?.length);
  if (anc.length) parts.push('Conversazioni precedenti in questo ramo (nodi superiori):\n' + anc.map(a => `[«${nodeLabel(a)}»]\n${convoText(a)}`).join('\n\n'));
  // conversazioni nei sotto-nodi
  const desc = descendants(id).filter(d => N(d).ai?.messages?.length);
  if (desc.length) parts.push('Conversazioni nei sotto-nodi di questo ramo:\n' + desc.map(d => `[«${pathText(d)}»]\n${convoText(d, 400)}`).join('\n\n'));
  // altri rami
  if (settings.includeOther) {
    const inBranch = new Set([id, ...ancestors(id), ...descendants(id)]);
    const others = doc.order.filter(k => !inBranch.has(k) && N(k).ai?.messages?.length);
    if (others.length) {
      let txt = ''; for (const k of others) { const piece = `[«${pathText(k)}»]\n${convoText(k, 300)}\n\n`; if (txt.length + piece.length > 7000) { txt += '…(altre conversazioni omesse)'; break; } txt += piece; }
      parts.push('Conversazioni negli ALTRI rami della mappa (solo come contesto, per collegare le idee):\n' + txt.trim());
    }
    const overview = [];
    for (const r of roots()) { overview.push('- ' + nodeLabel(r)); for (const c of children(r)) { overview.push('  - ' + nodeLabel(c)); for (const g of children(c).slice(0, 8)) overview.push('    - ' + nodeLabel(g)); } }
    parts.push('Panoramica della mappa:\n' + overview.slice(0, 160).join('\n'));
  }
  return parts.join('\n\n');
}
function systemPrompt(id, expand) {
  const rules = expand
    ? `Formato di risposta OBBLIGATORIO: un solo oggetto JSON valido, senza testo prima o dopo e senza blocchi di codice:
{"answer": "risposta discorsiva breve (al massimo circa 120 parole)", "nodes": [{"title": "titolo breve (max 8 parole)", "note": "approfondimento facoltativo, testo semplice", "children": [ ...stessa struttura... ]}]}
Regole per i nodi: al massimo ${settings.maxNodes} nodi al primo livello e profondità massima ${settings.depth}. Titoli concisi e informativi, senza numerazione iniziale. Metti i dettagli nella "note". Non ripetere nodi già presenti nel ramo. Se la richiesta è solo una domanda di chiarimento che non richiede nuovi nodi, usa "nodes": [].`
    : `Formato di risposta OBBLIGATORIO: un solo oggetto JSON valido, senza testo prima o dopo: {"answer": "la tua risposta completa", "nodes": []}`;
  return `Sei l'assistente di intelligenza artificiale integrato in un'app di mappe mentali.
L'utente ti interroga su un nodo specifico: resta nel tema del ramo di quel nodo. Le conversazioni degli altri rami sono solo contesto: usale per collegare e integrare le idee con il tema centrale, senza ripeterle.
Rispondi nella lingua dell'utente (di norma italiano).
${rules}

=== CONTESTO DELLA MAPPA ===
${buildContext(id)}`;
}
function historyMessages(id) {
  const msgs = N(id).ai?.messages || [];
  return msgs.filter(m => !m.error).map(m => ({ role: m.role, content: m.role === 'assistant' ? m.content + (m.titles?.length ? `\n(Nodi creati: ${m.titles.join('; ')})` : '') : m.content }));
}

async function callProvider(provider, model, system, messages, signal) {
  const s = settings;
  if (!model) throw new Error('Nessun modello indicato. Scegline uno nel pannello IA o nelle impostazioni.');
  if (provider === 'claude') {
    if (!s.claude.key) throw new Error('Manca la chiave API di Claude. Aprila da ☰ › Impostazioni IA.');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', 'x-api-key': s.claude.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model, max_tokens: 16000, system, messages }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Claude: ${data.error?.message || r.status + ' ' + r.statusText}`);
    if (data.stop_reason === 'refusal') throw new Error('Claude ha rifiutato questa richiesta. Prova a riformularla.');
    return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  }
  if (provider === 'openai' || provider === 'compat') {
    const cfg = s[provider];
    if (provider === 'openai' && !cfg.key) throw new Error('Manca la chiave API di OpenAI. Aprila da ☰ › Impostazioni IA.');
    const body = { model, messages: [{ role: 'system', content: system }, ...messages] };
    if (provider === 'openai') body.response_format = { type: 'json_object' };
    const headers = { 'content-type': 'application/json' };
    if (cfg.key) headers.authorization = 'Bearer ' + cfg.key;
    const r = await fetch(cfg.base.replace(/\/$/, '') + '/chat/completions', { method: 'POST', signal, headers, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${PROVIDERS[provider].label}: ${data.error?.message || r.status + ' ' + r.statusText}`);
    return data.choices?.[0]?.message?.content || '';
  }
  if (provider === 'ollama') {
    const r = await fetch(s.ollama.base.replace(/\/$/, '') + '/api/chat', {
      method: 'POST', signal, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, stream: false, format: 'json', messages: [{ role: 'system', content: system }, ...messages] }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Ollama: ${data.error || r.status + ' ' + r.statusText}`);
    return data.message?.content || '';
  }
  throw new Error('Provider sconosciuto: ' + provider);
}
async function listModels(provider) {
  const s = settings;
  if (provider === 'claude') {
    const r = await fetch('https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': s.claude.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } });
    const d = await r.json(); if (!r.ok) throw new Error(d.error?.message || r.status); return d.data.map(m => m.id);
  }
  if (provider === 'openai' || provider === 'compat') {
    const cfg = s[provider]; const headers = {}; if (cfg.key) headers.authorization = 'Bearer ' + cfg.key;
    const r = await fetch(cfg.base.replace(/\/$/, '') + '/models', { headers }); const d = await r.json(); if (!r.ok) throw new Error(d.error?.message || r.status);
    return d.data.map(m => m.id).sort();
  }
  if (provider === 'ollama') {
    const r = await fetch(s.ollama.base.replace(/\/$/, '') + '/api/tags'); const d = await r.json(); if (!r.ok) throw new Error(r.status);
    return (d.models || []).map(m => m.name);
  }
  return [];
}
function parseAIResponse(text) {
  let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try {
      const o = JSON.parse(t.slice(a, b + 1));
      const norm = (arr) => (Array.isArray(arr) ? arr : []).map(x => typeof x === 'string' ? { title: x } : x)
        .filter(x => x && (x.title || x.titolo || x.text)).map(x => ({ title: String(x.title || x.titolo || x.text).trim(), note: String(x.note || x.nota || '').trim(), children: norm(x.children || x.figli || x.nodes) }));
      return { answer: String(o.answer ?? o.risposta ?? '').trim(), nodes: norm(o.nodes || o.nodi) };
    } catch {}
  }
  // ripiego: elenco puntato -> nodi
  const nodes = []; const rest = [];
  for (const line of t.split('\n')) {
    const m = /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/.exec(line);
    if (m) nodes.push({ title: m[1].replace(/\*\*/g, '').slice(0, 120), note: '', children: [] }); else if (line.trim()) rest.push(line);
  }
  return { answer: rest.join('\n').trim() || t, nodes };
}
function createAINodes(pid, list, depth = 1, created = []) {
  for (const item of list.slice(0, depth === 1 ? settings.maxNodes : 12)) {
    const id = addChild(pid, item.title.slice(0, 200), { note: item.note || '', aiGen: true });
    created.push(id);
    if (item.children?.length && depth < settings.depth + 1) createAINodes(id, item.children, depth + 1, created);
  }
  return created;
}
async function askAI(id, prompt) {
  if (!prompt.trim() || aiBusy) return;
  const n = N(id);
  const { provider, model } = effectiveAI(id);
  const expand = settings.expand;
  const system = systemPrompt(id, expand);
  const messages = [...historyMessages(id), { role: 'user', content: prompt }];
  pushUndo();
  n.ai = n.ai || { provider: '', model: '', messages: [] };
  n.ai.messages.push({ role: 'user', content: prompt, ts: Date.now() });
  const controller = new AbortController();
  aiBusy = { id, controller };
  render(); refreshPanel(true); scheduleSave();
  try {
    const raw = await callProvider(provider, model, system, messages, controller.signal);
    const res = parseAIResponse(raw);
    let created = [];
    if (!N(id)) throw new Error('Il nodo è stato eliminato.');
    if (expand && res.nodes.length) { created = createAINodes(id, res.nodes); invalidate(); }
    N(id).ai.messages.push({ role: 'assistant', content: res.answer || (created.length ? 'Ho aggiunto nuovi nodi al ramo.' : '(nessuna risposta)'), ts: Date.now(), provider, model, created, titles: res.nodes.map(x => x.title) });
    aiBusy = null;
    render();
    if (created.length) { N(id).collapsed = false; layoutSubtree(id); pushSiblingsApart(id); render(); fitIds([id, ...descendants(id)], 1.1); }
    selectNode(id); refreshPanel(true); scheduleSave();
  } catch (e) {
    aiBusy = null;
    if (N(id)) N(id).ai.messages.push({ role: 'assistant', content: e.name === 'AbortError' ? 'Richiesta annullata.' : explainError(e, provider), ts: Date.now(), error: true, provider, model });
    render(); refreshPanel(true); scheduleSave();
  }
}
function explainError(e, provider) {
  const msg = e.message || String(e);
  if (e instanceof TypeError && /fetch|network|Failed/i.test(msg)) {
    if (provider === 'ollama') return `Non riesco a raggiungere Ollama su ${settings.ollama.base}. Verifica che sia avviato e che consenta le richieste dal browser (variabile OLLAMA_ORIGINS, vedi Impostazioni IA).`;
    if (provider === 'compat') return `Non riesco a raggiungere il server su ${settings.compat.base}. Verifica che sia avviato e che abbia CORS abilitato.`;
    return 'Errore di rete: controlla la connessione e la chiave API.';
  }
  return 'Errore: ' + msg;
}

function panelAI(body, compose) {
  if (!selectedId) return needNode(body);
  const id = selectedId; const n = N(id);
  const eff = effectiveAI(id);
  const own = n.ai || {};
  // intestazione: ramo e scelta del provider per questo nodo
  const provSel = h('select', { onchange: (e) => { mutate(() => { n.ai = n.ai || { messages: [] }; n.ai.provider = e.target.value; n.ai.model = ''; }); } });
  provSel.append(h('option', { value: '', selected: !own.provider }, `Eredita: ${PROVIDERS[effectiveAI(n.parent !== '-1' ? n.parent : id).provider]?.label || '—'}`));
  for (const [k, p] of Object.entries(PROVIDERS)) provSel.append(h('option', { value: k, selected: own.provider === k }, p.label));
  const dl = h('datalist', { id: 'ai-models' }, ...(PROVIDERS[eff.provider]?.models || []).map(m => h('option', { value: m })));
  const modelIn = h('input', { type: 'text', list: 'ai-models', value: own.model || '', placeholder: eff.model || 'modello', onchange: (e) => mutate(() => { n.ai = n.ai || { messages: [] }; n.ai.model = e.target.value.trim(); if (!n.ai.provider) n.ai.provider = eff.provider; }) });
  body.append(h('div', { class: 'ai-head' },
    h('div', { class: 'ai-path' }, 'Ramo: ' + pathText(id)),
    h('div', { class: 'row', style: { marginTop: '6px' } }, h('div', { class: 'field', style: { margin: 0 } }, h('label', {}, 'IA per questo nodo'), provSel)),
    h('div', { class: 'row', style: { marginTop: '6px' } }, h('div', { class: 'field', style: { margin: 0 } }, h('label', {}, 'Modello'), modelIn, dl)),
    h('div', { class: 'small muted', style: { marginTop: '6px' } }, `In uso: ${PROVIDERS[eff.provider]?.label} · ${eff.model || '—'} · `, h('a', { href: '#', onclick: (e) => { e.preventDefault(); openSettings(); } }, 'chiavi e impostazioni'))));

  // contesto del ramo (conversazioni degli antenati)
  const anc = ancestors(id).filter(a => N(a).ai?.messages?.length);
  if (anc.length) {
    const det = h('details', { class: 'ctxbox' }, h('summary', {}, `Contesto del ramo: ${anc.length} conversazion${anc.length === 1 ? 'e' : 'i'} nei nodi superiori`));
    for (const a of anc) {
      det.append(h('div', { class: 'small', style: { margin: '6px 0 2px', fontWeight: 600 } }, nodeLabel(a)));
      for (const m of N(a).ai.messages) det.append(h('div', { class: 'msg ctx ' + m.role }, clip(m.content, 400)));
    }
    body.append(det);
  }
  const chat = h('div', { class: 'chat' });
  const msgs = n.ai?.messages || [];
  if (!msgs.length) chat.append(h('div', { class: 'muted small' }, 'Scrivi una richiesta: la risposta verrà espansa in nuovi nodi sotto «' + nodeLabel(id) + '». Le domande successive fatte su questo nodo o sui suoi sotto-nodi restano in questo ramo, e l\'IA vede anche le conversazioni degli altri rami come contesto.'));
  for (const m of msgs) {
    const meta = m.role === 'user' ? 'Tu' : `IA · ${PROVIDERS[m.provider]?.label || m.provider || ''}${m.model ? ' · ' + m.model : ''}`;
    const el = h('div', { class: 'msg ' + m.role + (m.error ? ' error' : '') }, h('div', { class: 'meta' }, meta), m.content);
    if (m.created?.length) {
      const alive = m.created.filter(k => N(k));
      el.append(h('div', { class: 'small muted', style: { marginTop: '4px' } }, `→ ${alive.length} nuovi nodi`, ' · ',
        h('a', { href: '#', onclick: (e) => { e.preventDefault(); if (alive.length) fitIds([id, ...alive]); } }, 'mostra')));
    }
    if (m.role === 'assistant' && !m.error) el.append(h('div', { class: 'small', style: { marginTop: '4px' } },
      h('a', { href: '#', onclick: (e) => { e.preventDefault(); mutate(() => { n.note = (n.note ? n.note + '\n\n' : '') + m.content; }); toast('Aggiunta alla nota'); } }, 'Aggiungi alla nota')));
    chat.append(el);
  }
  if (aiBusy && aiBusy.id === id) chat.append(h('div', { class: 'msg assistant' }, h('span', { class: 'spinner' }), ' Sto pensando…'));
  body.append(chat);
  if (msgs.length) body.append(h('button', { class: 'btn small', onclick: () => { if (confirm('Cancellare la conversazione IA di questo nodo? I nodi creati restano.')) mutate(() => { n.ai.messages = []; }); } }, 'Cancella conversazione'));
  setTimeout(() => { body.scrollTop = body.scrollHeight; }, 0);

  // composizione
  compose.style.display = 'block';
  const ta = h('textarea', { id: 'ai-prompt', placeholder: `Chiedi qualcosa su «${nodeLabel(id)}»…  (Ctrl+Invio per inviare)` });
  ta.value = aiDrafts[id] || '';
  ta.addEventListener('input', () => { aiDrafts[id] = ta.value; });
  const send = () => { const p = ta.value; if (!p.trim()) return; aiDrafts[id] = ''; askAI(id, p); };
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });
  const chk = (key, label) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: settings[key], onchange: (e) => { settings[key] = e.target.checked; saveSettings(); } }), label);
  compose.append(ta,
    chk('expand', 'Espandi la risposta in nuovi nodi'),
    chk('includeOther', 'Usa come contesto le conversazioni degli altri rami'),
    h('div', { class: 'row', style: { marginTop: '6px' } },
      aiBusy ? h('button', { class: 'btn danger', onclick: () => aiBusy?.controller.abort() }, 'Annulla') : null,
      h('button', { class: 'btn primary', disabled: !!aiBusy, onclick: send }, aiBusy ? 'In corso…' : 'Invia ✨')));
}
const aiDrafts = {};

// ---------- Dialoghi ----------
function dialog(build) {
  const back = h('div', { class: 'dialog-back' });
  const box = h('div', { class: 'dialog' });
  back.append(box);
  const close = () => back.remove();
  back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
  build(box, close);
  document.body.append(back);
  return close;
}
function openSettings() {
  dialog((box, close) => {
    const s = settings;
    const inp = (obj, key, type = 'text', ph = '') => { const i = h('input', { type, value: obj[key] || '', placeholder: ph }); i.addEventListener('change', () => { obj[key] = i.value.trim(); saveSettings(); }); return i; };
    const modelsBtn = (prov, input) => h('button', { class: 'btn', onclick: async (e) => {
      const b = e.target; b.disabled = true; b.textContent = '…';
      try { const list = await listModels(prov); PROVIDERS[prov].models = list; toast(`${list.length} modelli trovati`); const dlId = 'dl-' + prov; let dl = document.getElementById(dlId); dl.innerHTML = ''; list.forEach(m => dl.append(h('option', { value: m }))); input.focus(); }
      catch (err) { toast('Impossibile leggere i modelli: ' + (err.message || err)); }
      b.disabled = false; b.textContent = 'Elenca modelli';
    } }, 'Elenca modelli');
    const modelField = (prov) => { const i = inp(s[prov], 'model', 'text'); i.setAttribute('list', 'dl-' + prov); return h('div', { class: 'field' }, h('label', {}, 'Modello predefinito'), h('div', { class: 'row' }, i, modelsBtn(prov, i)), h('datalist', { id: 'dl-' + prov }, ...PROVIDERS[prov].models.map(m => h('option', { value: m })))); };
    const def = h('select', { onchange: (e) => { s.defaultProvider = e.target.value; saveSettings(); } }, ...Object.entries(PROVIDERS).map(([k, p]) => h('option', { value: k, selected: s.defaultProvider === k }, p.label)));
    box.append(h('h2', {}, 'Impostazioni IA'),
      h('p', { class: 'muted small' }, 'Le chiavi restano salvate solo in questo browser, su questo dispositivo. Le richieste partono direttamente dal browser verso il servizio scelto.'),
      h('div', { class: 'field' }, h('label', {}, 'IA predefinita (ogni nodo può sceglierne un\'altra)'), def),
      h('div', { class: 'row' },
        h('div', { class: 'field' }, h('label', {}, 'Nodi max per risposta'), (() => { const i = h('input', { type: 'number', min: 1, max: 20, value: s.maxNodes }); i.onchange = () => { s.maxNodes = clamp(parseInt(i.value, 10) || 7, 1, 20); saveSettings(); }; return i; })()),
        h('div', { class: 'field' }, h('label', {}, 'Livelli di sotto-nodi'), (() => { const i = h('input', { type: 'number', min: 1, max: 4, value: s.depth }); i.onchange = () => { s.depth = clamp(parseInt(i.value, 10) || 2, 1, 4); saveSettings(); }; return i; })())),
      h('h3', {}, 'Claude (Anthropic)'),
      h('div', { class: 'field' }, h('label', {}, 'Chiave API (console.anthropic.com)'), inp(s.claude, 'key', 'password', 'sk-ant-…')),
      modelField('claude'),
      h('h3', {}, 'OpenAI'),
      h('div', { class: 'field' }, h('label', {}, 'Chiave API (platform.openai.com)'), inp(s.openai, 'key', 'password', 'sk-…')),
      modelField('openai'),
      h('h3', {}, 'Ollama (locale)'),
      h('div', { class: 'field' }, h('label', {}, 'Indirizzo'), inp(s.ollama, 'base', 'url', 'http://localhost:11434')),
      modelField('ollama'),
      h('p', { class: 'muted small' }, 'Perché il browser possa usare Ollama, avvialo con la variabile OLLAMA_ORIGINS="*" (Windows: Impostazioni › Variabili d\'ambiente; Ubuntu: sudo systemctl edit ollama e aggiungi Environment="OLLAMA_ORIGINS=*"). Da tablet o telefono usa l\'indirizzo del computer, es. http://192.168.1.10:11434, con OLLAMA_HOST=0.0.0.0.'),
      h('h3', {}, 'Compatibile OpenAI (LM Studio, vLLM, OpenRouter…)'),
      h('div', { class: 'field' }, h('label', {}, 'Indirizzo base'), inp(s.compat, 'base', 'url', 'http://localhost:1234/v1')),
      h('div', { class: 'field' }, h('label', {}, 'Chiave (se richiesta)'), inp(s.compat, 'key', 'password')),
      modelField('compat'),
      h('div', { class: 'row', style: { marginTop: '10px' } }, h('span'), h('button', { class: 'btn primary', style: { flex: '0 0 auto' }, onclick: close }, 'Fatto')));
  });
}
async function openLibrary() {
  const list = (await idb.all()).sort((a, b) => b.updated - a.updated);
  dialog((box, close) => {
    box.append(h('h2', {}, 'Mappe salvate in questo browser'));
    if (!list.length) box.append(h('p', { class: 'muted' }, 'Nessuna mappa salvata.'));
    for (const rec of list) {
      box.append(h('div', { class: 'sheet-card' + (rec.id === doc.id ? ' sel' : '') },
        h('div', { style: { flex: 1 }, onclick: async () => { close(); await loadBuffer(await rec.blob.arrayBuffer(), rec.fileName || rec.title + '.smmx'); } },
          h('b', {}, rec.title || '(senza titolo)'), h('div', { class: 'muted small' }, new Date(rec.updated).toLocaleString())),
        h('button', { class: 'btn', title: 'Scarica .smmx', onclick: () => download(rec.blob, safeName(rec.title) + '.smmx') }, '⬇'),
        h('button', { class: 'btn danger', title: 'Elimina dal browser', onclick: async (e) => { if (!confirm('Eliminare «' + rec.title + '» da questo browser?')) return; await idb.del(rec.id); e.target.closest('.sheet-card').remove(); } }, '🗑')));
    }
    box.append(h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn', onclick: () => { close(); newDocument(); } }, 'Nuova mappa'), h('button', { class: 'btn primary', onclick: close }, 'Chiudi')));
  });
}
function showHelp() {
  dialog((box, close) => {
    const rows = [['Tab', 'Nuovo nodo figlio'], ['Invio', 'Nuovo nodo fratello'], ['F2 / doppio clic / scrivi', 'Modifica il testo'], ['Maiusc+Invio', 'A capo nel testo'], ['Canc', 'Elimina il nodo e il suo ramo'], ['Spazio', 'Comprimi / espandi il ramo'], ['Frecce', 'Spostati tra i nodi'], ['Ctrl+I', 'Chiedi all\'IA sul nodo selezionato'], ['Ctrl+Z / Ctrl+Y', 'Annulla / ripeti'], ['Ctrl+S', 'Salva il file .smmx'], ['Ctrl+O', 'Apri un file'], ['Rotella', 'Scorri la mappa'], ['Ctrl+rotella / pizzico', 'Zoom'], ['Doppio clic sullo sfondo', 'Nuovo tema centrale'], ['Trascina un nodo su un altro', 'Sposta il ramo sotto quel nodo'], ['Tieni premuto (touch) / tasto destro', 'Menu del nodo']];
    box.append(h('h2', {}, 'Scorciatoie'), h('table', { style: { width: '100%', borderCollapse: 'collapse' } }, ...rows.map(([k, v]) => h('tr', {}, h('td', { style: { padding: '4px 8px 4px 0', fontWeight: 600, whiteSpace: 'nowrap' } }, k), h('td', { style: { padding: '4px 0' } }, v)))),
      h('div', { class: 'row', style: { marginTop: '12px' } }, h('span'), h('button', { class: 'btn primary', style: { flex: '0 0 auto' }, onclick: close }, 'Chiudi')));
  });
}

// ======================================================================
// Avvio
// ======================================================================
async function init() {
  applyTheme();
  stage = $('#stage'); world = $('#world'); edgesSvg = $('#edges');
  stage.tabIndex = 0;
  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', onPointerUp);
  stage.addEventListener('wheel', onWheel, { passive: false });
  stage.addEventListener('dblclick', (e) => { const nEl = e.target.closest('.node'); if (nEl && !editing && !presentation) { e.preventDefault(); startEdit(nEl.dataset.id); } });
  stage.addEventListener('contextmenu', (e) => { e.preventDefault(); const nEl = e.target.closest('.node'); if (nEl) openContextMenu(e.clientX, e.clientY, nEl.dataset.id); });
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', debounce(() => { if (presentation) presentShow(); else if (selectedId && N(selectedId)) ensureVisible(selectedId); }, 150));
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && presentation) stopPresentation(); });

  document.querySelectorAll('[data-panel]').forEach(b => b.addEventListener('click', () => openPanel(b.dataset.panel)));
  $('#panel-close').addEventListener('click', closePanel);
  $('#menu-btn').addEventListener('click', (e) => openMainMenu(e.currentTarget));
  $('#undo-btn').addEventListener('click', undo);
  $('#redo-btn').addEventListener('click', redo);
  $('#save-btn').addEventListener('click', () => saveFile(false));
  $('#doc-title').addEventListener('change', (e) => mutate(() => { doc.title = e.target.value.trim() || 'Mappa'; }));
  $('#file-input').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { await loadBuffer(await f.arrayBuffer(), f.name); toast('Aperta: ' + f.name); } catch (err) { toast('Impossibile aprire il file: ' + err.message, 5000); }
  });
  $('#fab-child').addEventListener('click', () => addChildCmd());
  $('#fab-sib').addEventListener('click', () => addSiblingCmd());
  $('#fab-edit').addEventListener('click', () => startEdit(selectedId));
  $('#fab-ai').addEventListener('click', () => { if (activePanel !== 'ai') openPanel('ai'); });
  $('#fab-del').addEventListener('click', () => deleteCmd());
  $('#zoom-in').addEventListener('click', () => zoomAt(1.2));
  $('#zoom-out').addEventListener('click', () => zoomAt(1 / 1.2));
  $('#zoom-fit').addEventListener('click', () => fitView());
  $('#present-prev').addEventListener('click', () => presentStep(-1));
  $('#present-next').addEventListener('click', () => presentStep(1));
  $('#present-exit').addEventListener('click', () => stopPresentation());
  // trascina un file .smmx nella finestra per aprirlo
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault(); const f = e.dataTransfer.files[0]; if (!f) return;
    try { await loadBuffer(await f.arrayBuffer(), f.name); toast('Aperta: ' + f.name); } catch (err) { toast('Impossibile aprire il file: ' + err.message, 5000); }
  });
  window.addEventListener('beforeunload', () => { if (saving) autosave(); });

  // riapre l'ultima mappa usata in questo browser
  let opened = false;
  try {
    const cur = localStorage.getItem(LS_CURRENT);
    if (cur) { const rec = await idb.get(cur); if (rec) { await loadBuffer(await rec.blob.arrayBuffer(), rec.fileName || ''); opened = true; } }
  } catch (e) { console.warn(e); }
  if (!opened) newDocument();
  window.MindAI = { get doc() { return doc; }, buildSmmx, parseSmmx, loadBuffer, askAI, settings, layoutSubtree, render };
}
document.addEventListener('DOMContentLoaded', init);
})();
