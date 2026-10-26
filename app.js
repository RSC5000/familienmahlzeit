// Familienmahlzeit – Familienversion (Stufe 2)
// Daten liegen in Firebase Firestore, jedes Gerät meldet sich anonym an und tritt per Einladungscode einer Familie bei.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, onSnapshot, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, deleteField, FieldPath, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

// App-Name an einer Stelle, damit eine spätere Umbenennung einfach bleibt
const APP_NAME = 'Familienmahlzeit';

/* ---------- Firebase ---------- */
const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
let db;
try { db = initializeFirestore(fbApp, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
catch (e) { db = getFirestore(fbApp); }

/* ---------- Gerätespeicher ---------- */
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} };
const lsJson = (k, d) => { try { return JSON.parse(lsGet(k) || '') ?? d; } catch (e) { return d; } };

/* ---------- Datum ---------- */
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const wd = s => (parse(s).getDay() + 6) % 7;
const mondayOf = s => addDays(s, -wd(s));
const kw = s => { const d = parse(s); d.setDate(d.getDate() + 3 - wd(s)); const w1 = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - w1) / 864e5 - 3 + (w1.getDay() + 6) % 7) / 7); };
const TODAY = iso(new Date());
const DOW = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const DOWS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const fmtShort = s => { const d = parse(s); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`; };
const fmtFull = s => fmtShort(s) + parse(s).getFullYear();
const fmtAuto = s => s.slice(0, 4) === TODAY.slice(0, 4) ? fmtShort(s) : fmtFull(s);
const fmtLong = s => { const d = parse(s); return `${DOW[wd(s)]}, ${d.getDate()}. ${MON[d.getMonth()]}`; };

/* ---------- Helfer ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid6 = () => Math.random().toString(36).slice(2, 9);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const round1 = v => Math.round(v * 10) / 10;
const num1 = v => v.toFixed(1).replace('.', ',');
const byOrd = (a, b) => (a.ord ?? 0) - (b.ord ?? 0);
const clean = o => JSON.parse(JSON.stringify(o));
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
// Stabile Darstellung mit sortierten Schlüsseln, damit gleiche Daten immer gleich verglichen werden
const stable = v => Array.isArray(v) ? '[' + v.map(stable).join(',') + ']' : isObj(v) ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}' : JSON.stringify(v);

const ICONS = {
  home: 'M3 11l9-7 9 7M5 10v10h14V10',
  out: 'M7 3v7M5 3v4a2 2 0 004 0V3M7 10v11M17 3c-2.2 1.8-2.2 6.2 0 8M17 3v18',
  pot: 'M4 10h16v5a5 5 0 01-5 5H9a5 5 0 01-5-5zM2 10h20M9 7c0-1.2 1-1.5 1-3M14 7c0-1.2 1-1.5 1-3',
  gift: 'M3 9h18v4H3zM5 13v8h14v-8M12 9v12M12 9C9 9 7 8 7 6.5S9.5 4 12 9c2.5-5 5-4 5-2.5S15 9 12 9',
  box: 'M4 9h16v10H4zM3 5h18v4H3zM10 13h4',
  bread: 'M6 11.5A4 4 0 015.5 4C7.5 3 9.5 3 12 3s4.5 0 6.5 1a4 4 0 01-.5 7.5V20H6z',
  self: 'M12 12a4 4 0 100-8 4 4 0 000 8zM5 21a7 7 0 0114 0',
  week: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4',
  cart: 'M3 4h2l2.4 11h10.2L20 7H6.3M9 20.5a1 1 0 100-2 1 1 0 000 2zM17 20.5a1 1 0 100-2 1 1 0 000 2z',
  book: 'M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h11',
  menu: 'M4 7h16M4 12h16M4 17h16',
  left: 'M15 5l-7 7 7 7', right: 'M9 5l7 7-7 7',
  plus: 'M12 5v14M5 12h14', x: 'M6 6l12 12M18 6L6 18', check: 'M5 12.5l4.5 4.5L19 7.5',
  cal: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4M10 15h4M12 13v4',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4.2-4.2',
  photo: 'M4 6h16v13H4zM8 15l3-3 5 5M15.5 10h.01',
  users: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21a7 7 0 0114 0M16 3.5a4 4 0 010 7.5M18 14a7 7 0 014 7',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 7.5h.01',
  history: 'M3 12a9 9 0 103-6.7M3 4v5h5M12 8v4l3 2',
  plan: 'M4 5h16v15H4zM4 10h16M8 14h3M8 17h6',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  reset: 'M4 12a8 8 0 102.3-5.7M4 4v5h5',
  share: 'M12 3v12M7 8l5-5 5 5M5 13v7h14v-7',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  cake: 'M4 21h16M5 21v-7h14v7M5 17.5c2 1 3-1 4.7 0s3 1 4.6 0 3-1 4.7 0M12 14v-3M12 8a1.5 1.5 0 01-1.5-1.5C10.5 5.5 12 4 12 4s1.5 1.5 1.5 2.5A1.5 1.5 0 0112 8z',
};
const ic = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[n]}"/></svg>`;
const LOGO = `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="13" cy="12" r="7"/><circle cx="13" cy="12" r="3.5"/><path d="M3 4v6M3 10v10"/></svg>`;

const COLORS = [['Salbei', '#B8D8BA'], ['Himmelblau', '#A9CBEA'], ['Flieder', '#CDB8E6'], ['Rosé', '#F2B8C6'], ['Pfirsich', '#F7C9A3'], ['Zitrone', '#F3E3A0'], ['Minze', '#A8DED3'], ['Sand', '#DCCBB5'], ['Koralle', '#F4A6A0'], ['Lavendelgrau', '#C3C7DA']];
const KINDS = [
  { k: 'cook', l: 'Gekocht', i: 'pot', cook: true },
  { k: 'leftovers', l: 'Reste', i: 'box', cook: true },
  { k: 'surprise', l: 'Surprise', i: 'gift', cook: true },
  { k: 'bread', l: 'Brotzeit', i: 'bread', cook: false },
  { k: 'self', l: 'Jeder für sich', i: 'self', cook: false },
];
const KIND = Object.fromEntries(KINDS.map(x => [x.k, x]));
const HOW = { bring: 'bringe ich mit', way: 'besorge ich auf dem Heimweg' };
const PART = { yes: 'dabei', no: 'nicht dabei', open: 'offen' };
const DEFAULT_CATS = [
  { id: 'c1', name: 'Hauptzutat', values: ['Veggie', 'Fleisch', 'Fisch'] },
  { id: 'c2', name: 'Beilage', values: ['Pasta', 'Reis', 'Kartoffel'] },
  { id: 'c3', name: 'Frisch', values: ['Gemüse', 'Salat'] },
  { id: 'c4', name: 'Küche', values: ['Japan', 'Thai', 'Deutsch', 'Italien', 'China', 'TexMex'] },
];

/* ---------- Zustand ---------- */
const state = { family: null, persons: [], categories: [], dishes: [], days: {}, devices: [] };
const synced = new Map();            // zuletzt bekannter Serverstand je Dokument, z. B. 'days/2026-10-26'
let fid = lsGet('fm-fid');           // Familie dieses Geräts
let uid = null;                      // anonyme Geräte-Kennung
let unsubs = [];
let commitTimer = null;
const ui = {
  phase: 'loading',                  // loading · onboard · sync · ready
  me: lsGet('fm-me'), theme: lsGet('fm-theme') || 'light',
  tab: 'week', week: mondayOf(TODAY),
  dlist: { type: 'main', q: '', sort: 'alpha', filter: {} },
  ob: { step: 'choose', code: (location.hash.match(/^#(KOCH-[A-Z0-9-]+)$/i) || [])[1] || '' },
  online: navigator.onLine,
};
if (ui.ob.code) ui.ob.step = 'join';
let sheets = [];
let calSync = lsJson('fm-cal', {});

const person = id => state.persons.find(p => p.id === id);
const pn = id => (person(id) || {}).name || '';
const activePersons = () => state.persons.filter(p => !p.archived && p.name);
const dish = id => state.dishes.find(d => d.id === id);
const dn = id => (dish(id) || {}).name || '';
const blankDay = () => ({ place: 'home', kind: 'cook', cook: null, time: (state.family && state.family.defaultTime) || '19:00', dish: null, dessert: null, surpriseHidden: false, notes: '', guests: 0, part: {}, shop: {}, snap: {} });
const getDay = (dt, create) => { if (!state.days[dt] && create) state.days[dt] = blankDay(); return state.days[dt]; };
const hasPlan = d => !!d && (d.cook || d.dish || d.dessert || d.kind !== 'cook' || d.place !== 'home');
const isHidden = (dt, d) => d.kind === 'surprise' && d.surpriseHidden && dt >= TODAY && d.cook !== ui.me;
const myStatus = dt => state.days[dt]?.part?.[ui.me]?.s || 'open';
const gcls = a => a <= 2 ? 'good' : a <= 3.5 ? 'mid' : 'low';
const top = () => sheets[sheets.length - 1];
const avgOf = d => { const v = Object.values(d.ratings || {}).filter(Boolean); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const shopArr = d => Object.entries((d && d.shop) || {}).map(([id, s]) => ({ id, ...s })).sort(byOrd);
const openShop = dt => shopArr(state.days[dt]).filter(s => !s.done).length;
const meIsAdmin = () => !!person(ui.me)?.admin;

function stats() {
  const m = {};
  for (const [dt, d] of Object.entries(state.days)) {
    if (dt > TODAY || d.kind === 'self') continue;
    for (const k of ['dish', 'dessert']) { const id = d[k]; if (!id) continue; const s = m[id] || (m[id] = { n: 0, last: null }); s.n++; if (!s.last || dt > s.last) s.last = dt; }
  }
  return m;
}
function snapDay(dt) {
  const d = state.days[dt]; if (!d || dt > TODAY) return;
  d.snap = d.snap || {};
  ['dish', 'dessert'].forEach(k => { const x = dish(d[k]); const a = x && avgOf(x); if (a != null) d.snap[k] = round1(a); else delete d.snap[k]; });
}
function ensureSnaps() { for (const [dt, d] of Object.entries(state.days)) if (dt <= TODAY && ((d.dish && d.snap?.dish == null) || (d.dessert && d.snap?.dessert == null))) snapDay(dt); }
function catLine(d) { return state.categories.map(c => d.cat?.[c.id]).filter(Boolean).join(' · '); }
function tint(d) {
  if (d.type === 'dessert') return '#F3D6E6';
  const main = state.categories[0] && d.cat?.[state.categories[0].id];
  return { Veggie: '#CFE6C8', Fleisch: '#F5CFCB', Fisch: '#CDE0F2' }[main] || '#EEDFCB';
}
function thumb(d, size = '') {
  if (!d) return '';
  if (d.photo) return `<span class="th ${size}"><img src="${d.photo}" alt=""></span>`;
  // Desserts tragen keinen Buchstaben, der Name steht ohnehin daneben
  const letter = d.type === 'dessert' ? '' : esc((d.name || '?').trim().charAt(0).toUpperCase() || '?');
  return `<span class="th ${size}" style="--t:${tint(d)}">${letter}</span>`;
}
// Personenfigur mit Anfangsbuchstaben auf der Brust.
// Frau: langes Haar um den Kopf, Kleid mit schmaler Taille. Mann: kurzes Haar, breite Schultern, Hosenbeine. Neutral: schlicht.
const FIG = {
  f: { hair: '<path class="hr" d="M7 14.5V8a7 7 0 0114 0v6.5z"/>', head: '<circle class="h" cx="14" cy="7.6" r="4.6"/>', body: 'M10.6 14.5h6.8l-1.6 6.3L25.5 35h-23l9.7-14.2z', ty: 30.5 },
  m: { head: '<circle class="h" cx="14" cy="7" r="5.5"/>', hair: '<path class="hr" d="M8.5 6.2a5.5 5.5 0 0111 0C17.9 4.9 16 4.3 14 4.3s-3.9.6-5.5 1.9z"/>', body: 'M2.5 27v-6.5A6.5 6.5 0 019 14h10a6.5 6.5 0 016.5 6.5V27h-4v8H15v-7h-2v7H6.5v-8z', ty: 24.6 },
  n: { head: '<circle class="h" cx="14" cy="6.5" r="5.5"/>', body: 'M3 35v-9a11 11 0 0122 0v9z', ty: 29.5 },
};
function figSvg(p) {
  const f = FIG[(p && p.fig) || 'n'] || FIG.n;
  const parts = p && p.fig === 'f' ? f.hair + f.head : f.head + (f.hair || '');
  return `<svg class="fig" viewBox="0 0 28 36" aria-hidden="true">${parts}<path class="b" d="${f.body}"/>${p ? `<text x="14" y="${f.ty}">${esc((p.name || '').charAt(0).toUpperCase())}</text>` : ''}</svg>`;
}
function dot(p, cls = '') {
  if (!p) return `<span class="dot ghost ${cls}">${figSvg(null)}</span>`;
  return `<span class="dot ${cls}" style="--c:${p.color}" aria-hidden="true">${figSvg(p)}</span>`;
}
function dayWhat(dt, d) {
  if (d.kind === 'self') return 'Jeder für sich';
  if (isHidden(dt, d)) return 'Surprise';
  if (d.dish) return dn(d.dish);
  if (d.kind === 'surprise') return 'Surprise (noch offen)';
  if (d.kind !== 'cook') return KIND[d.kind].l;
  return 'Gericht offen';
}

/* ---------- Abgleich mit Firestore ---------- */
const famRef = () => doc(db, 'families', fid);
const familyFields = f => ({ name: f.name, code: f.code, pinHash: f.pinHash, defaultTime: f.defaultTime });
const strip = o => { const { id, ...rest } = o; return rest; };

// Geänderte Felder ermitteln: bis zur zweiten Ebene feldgenau (z. B. shop.<id>, part.<person>), damit gleichzeitige Änderungen verschiedener Geräte nicht kollidieren
function diffFields(a, b, path = [], out = []) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) {
    const av = a?.[k], bv = b?.[k];
    if (stable(av) === stable(bv)) continue;
    if (bv === undefined) out.push([[...path, k], deleteField()]);
    else if (isObj(av) && isObj(bv) && path.length < 1) diffFields(av, bv, [...path, k], out);
    else out.push([[...path, k], bv]);
  }
  return out;
}

function scheduleCommit() { clearTimeout(commitTimer); commitTimer = setTimeout(commit, 500); }
function flush() { if (commitTimer) commit(); }

// Vergleicht den lokalen Stand mit dem Serverstand und schreibt nur die Unterschiede
function commit() {
  clearTimeout(commitTimer); commitTimer = null;
  if (ui.phase !== 'ready' || !fid) return;
  const ops = [];
  const fam = clean(familyFields(state.family)), fj = stable(fam), fprev = synced.get('family');
  if (fprev && fj !== fprev) { ops.push({ t: 'update', ref: famRef(), fields: diffFields(JSON.parse(fprev), fam) }); synced.set('family', fj); }
  const cols = {
    persons: Object.fromEntries(state.persons.filter(p => p.name.trim()).map(p => [p.id, strip(p)])),
    categories: Object.fromEntries(state.categories.map(c => [c.id, strip(c)])),
    dishes: Object.fromEntries(state.dishes.filter(d => d.name.trim()).map(d => [d.id, strip(d)])),
    days: state.days,
  };
  for (const [col, cur] of Object.entries(cols)) {
    for (const [id, raw] of Object.entries(cur)) {
      const data = clean(raw), key = col + '/' + id, j = stable(data), prev = synced.get(key);
      if (prev === j) continue;
      const ref = doc(famRef(), col, id);
      if (prev === undefined) ops.push({ t: 'set', ref, data });
      else { const fields = diffFields(JSON.parse(prev), data); if (fields.length) ops.push({ t: 'update', ref, fields }); }
      synced.set(key, j);
    }
    for (const key of [...synced.keys()]) {
      if (!key.startsWith(col + '/')) continue;
      const id = key.slice(col.length + 1);
      if (!(id in cur)) { ops.push({ t: 'delete', ref: doc(famRef(), col, id) }); synced.delete(key); }
    }
  }
  if (!ops.length) return;
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(db);
    ops.slice(i, i + 400).forEach(o => {
      if (o.t === 'set') b.set(o.ref, o.data);
      else if (o.t === 'delete') b.delete(o.ref);
      else { const args = o.fields.flatMap(([p, v]) => [new FieldPath(...p), v]); b.update(o.ref, ...args); }
    });
    b.commit().catch(e => { console.error(e); toast('Speichern hat nicht geklappt. Bitte Verbindung prüfen.'); });
  }
}

function connect() {
  unsubs.forEach(u => u()); unsubs = [];
  synced.clear();
  ui.phase = 'sync'; render();
  const waiting = new Set(['family', 'persons', 'categories', 'dishes', 'days', 'devices']);
  const arrived = k => { if (waiting.delete(k) && !waiting.size) afterReady(); else requestRender(); };
  const fail = e => { console.error(e); if (e.code === 'permission-denied') lostAccess(); else toast('Verbindung zur Datenbank gestört: ' + e.code); };
  unsubs.push(onSnapshot(famRef(), s => {
    flush();
    if (!s.exists()) { lostAccess(); return; }
    state.family = s.data();
    synced.set('family', stable(clean(familyFields(state.family))));
    arrived('family');
  }, fail));
  for (const col of ['persons', 'categories', 'dishes', 'devices', 'days']) {
    unsubs.push(onSnapshot(collection(famRef(), col), s => {
      flush();
      if (col !== 'devices') for (const key of [...synced.keys()]) if (key.startsWith(col + '/')) synced.delete(key);
      if (col === 'days') {
        state.days = {};
        s.docs.forEach(d => { const data = d.data(); state.days[d.id] = Object.assign(blankDay(), data); synced.set('days/' + d.id, stable(clean(data))); });
      } else {
        state[col] = s.docs.map(d => ({ id: d.id, ...d.data() })).sort(byOrd);
        if (col !== 'devices') s.docs.forEach(d => synced.set(col + '/' + d.id, stable(clean(d.data()))));
      }
      arrived(col);
    }, fail));
  }
}

function afterReady() {
  ui.phase = 'ready';
  // Tage aus Firestore auf vollständige Form bringen; der Unterschied zu synced wird nicht geschrieben, solange nichts geändert wird
  ensureSnaps();
  commit();
  const mine = state.devices.find(d => d.id === uid);
  if (mine && mine.last !== TODAY) updateDoc(doc(famRef(), 'devices', uid), { last: TODAY }).catch(() => {});
  if (!ui.me && mine?.pid) { ui.me = mine.pid; lsSet('fm-me', ui.me); }
  if (!person(ui.me) || person(ui.me).archived) { ui.me = null; if (!sheets.some(s => s.type === 'welcome')) sheets.push({ type: 'welcome', a: {} }); }
  render();
}

function lostAccess() {
  unsubs.forEach(u => u()); unsubs = [];
  fid = null; lsSet('fm-fid', null); lsSet('fm-me', null); ui.me = null;
  sheets = []; ui.phase = 'onboard'; ui.ob = { step: 'choose', code: '', err: 'Dieses Gerät gehört nicht mehr zu einer Familie. Tritt mit dem aktuellen Einladungscode wieder bei.' };
  render();
}

/* ---------- Gründen und Beitreten ---------- */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => `KOCH-${[...Array(4)].map(() => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')}-${Math.floor(Math.random() * 90) + 10}`;
function normCode(s) {
  let c = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!c.startsWith('KOCH')) c = 'KOCH' + c;
  return c.length === 10 ? `KOCH-${c.slice(4, 8)}-${c.slice(8)}` : c;
}
function deviceKind() {
  const ua = navigator.userAgent;
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  return 'Browser';
}
const deviceName = name => deviceKind() + (name ? ' von ' + name : '');
async function pinHash(pin, f = fid) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(f + ':' + pin));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

async function createFamily() {
  const o = ui.ob;
  o.err = '';
  if (!o.fam?.trim()) o.err = 'Bitte einen Familiennamen eingeben.';
  else if (!o.name?.trim()) o.err = 'Bitte deinen Namen eingeben.';
  else if (!/^\d{4,8}$/.test(o.pin || '')) o.err = 'Die Admin-PIN braucht 4 bis 8 Ziffern.';
  else if (o.pin !== o.pin2) o.err = 'Die beiden PINs stimmen nicht überein.';
  if (o.err) { render(); return; }
  o.busy = true; render();
  try {
    const ref = doc(collection(db, 'families'));
    const f = ref.id, code = newCode(), pid = uid6();
    const b = writeBatch(db);
    b.set(ref, { name: o.fam.trim(), code, pinHash: await pinHash(o.pin, f), defaultTime: '19:00', ownerUid: uid, createdAt: serverTimestamp() });
    b.set(doc(ref, 'devices', uid), { code, pid, name: deviceName(o.name.trim()), last: TODAY });
    b.set(doc(db, 'invites', code), { fid: f });
    b.set(doc(ref, 'persons', pid), { name: o.name.trim(), fig: o.fig || 'n', color: o.color || COLORS[3][1], admin: true, archived: false, ord: Date.now() });
    DEFAULT_CATS.forEach((c, i) => b.set(doc(ref, 'categories', c.id), { name: c.name, values: c.values, ord: i }));
    await b.commit();
    fid = f; lsSet('fm-fid', fid); ui.me = pid; lsSet('fm-me', pid);
    history.replaceState(null, '', location.pathname);
    connect();
    toast(`Familie gegründet. Einladungscode: ${code}`);
  } catch (e) {
    console.error(e); o.busy = false;
    o.err = e.code === 'permission-denied' ? 'Firebase hat das Anlegen abgelehnt. Sind die Sicherheitsregeln veröffentlicht?' : 'Das hat nicht geklappt (' + (e.code || e.message) + '). Bitte Verbindung prüfen und erneut versuchen.';
    render();
  }
}

async function joinFamily() {
  const o = ui.ob, code = normCode(o.code);
  o.err = ''; o.busy = true; render();
  try {
    const inv = await getDoc(doc(db, 'invites', code));
    if (!inv.exists()) throw Object.assign(new Error(), { code: 'unknown-code' });
    const f = inv.data().fid;
    await setDoc(doc(db, 'families', f, 'devices', uid), { code, pid: null, name: deviceName(''), last: TODAY });
    fid = f; lsSet('fm-fid', fid); ui.me = null; lsSet('fm-me', null);
    history.replaceState(null, '', location.pathname);
    connect();
  } catch (e) {
    console.error(e); o.busy = false;
    o.err = e.code === 'unknown-code' ? `Den Code ${esc(code)} gibt es nicht. Bitte prüfen, ob er stimmt oder inzwischen erneuert wurde.`
      : e.code === 'permission-denied' ? 'Der Code passt nicht mehr zur Familie. Bitte den aktuellen Code geben lassen.'
      : 'Das hat nicht geklappt (' + (e.code || e.message) + '). Bitte Verbindung prüfen.';
    render();
  }
}

/* ---------- Dateien ---------- */
function download(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}
function backupObject() {
  return { v: 2, app: APP_NAME, created: new Date().toISOString(), family: { name: state.family.name, defaultTime: state.family.defaultTime }, persons: state.persons, categories: state.categories, dishes: state.dishes, days: state.days };
}
function downloadBackup() {
  download(`familienmahlzeit-${TODAY}.json`, JSON.stringify(backupObject(), null, 1), 'application/json');
  lsSet('fm-lastBackup', TODAY);
  toast('Sicherung gespeichert');
}

/* Kalender */
function calSig(dt) { const d = state.days[dt]; if (!d) return ''; const my = d.part[ui.me]; return [d.time, (my && my.t) || '', d.dish || '', d.cook || '', d.kind, d.place].join('|'); }
function calStale(dt) { const k = ui.me + '|' + dt; return calSync[k] != null && calSync[k] !== calSig(dt); }
function calRelevant(dt) { const d = state.days[dt]; return !!d && dt >= TODAY && d.kind !== 'self' && (d.cook === ui.me || d.part[ui.me]?.s === 'yes'); }
function evInfo(dt) {
  const d = state.days[dt], my = d.part[ui.me], t = (my && my.t) || d.time;
  const who = d.cook ? ` (${d.place === 'out' ? 'organisiert von' : 'Koch'}: ${pn(d.cook)})` : '';
  return { title: `${APP_NAME}: ${dayWhat(dt, d)}${who}`, when: `${DOW[wd(dt)]}, ${fmtFull(dt)}, ${t} Uhr`, t, place: d.place === 'out' ? 'auswärts' : 'zu Hause' };
}
function ics(dts) {
  const icsEsc = s => String(s).replace(/[\\;,]/g, m => '\\' + m);
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${APP_NAME}//DE`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  dts.forEach(dt => {
    const e = evInfo(dt), stamp = dt.replace(/-/g, '') + 'T' + e.t.replace(':', '') + '00';
    L.push('BEGIN:VEVENT', `UID:${dt}-${ui.me}@familienmahlzeit`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, `DTSTART;TZID=Europe/Berlin:${stamp}`, 'DURATION:PT1H', `SUMMARY:${icsEsc(e.title)}`, `LOCATION:${icsEsc(e.place)}`);
    [90, 60].forEach(m => L.push('BEGIN:VALARM', `TRIGGER:-PT${m}M`, 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(e.title)}`, 'END:VALARM'));
    L.push('END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.join('\r\n');
}

/* ---------- Ansichten ---------- */
function header() {
  const me = person(ui.me);
  let nav = '';
  if (ui.phase === 'ready' && ui.tab === 'week') {
    const ws = ui.week, we = addDays(ws, 6);
    nav = `<div class="weeknav gutter">
      <button class="icon-btn" data-act="wk" data-d="-7" aria-label="Vorige Woche">${ic('left')}</button>
      <div class="wk"><span class="kw">KW ${kw(ws)}</span><span class="range">${fmtShort(ws)} – ${fmtFull(we)}</span></div>
      ${ws !== mondayOf(TODAY) ? `<button class="pill" data-act="today">Heute</button>` : ''}
      <button class="icon-btn" data-act="wk" data-d="7" aria-label="Nächste Woche">${ic('right')}</button>
    </div>`;
  }
  return `<header class="top"><div class="top-in gutter">
    <div class="brand"><span class="logo">${LOGO}</span><span>${APP_NAME}</span>${!ui.online ? '<span class="offline">offline</span>' : ''}</div>
    ${ui.phase === 'ready' ? `<button class="me" data-act="switchMe" aria-label="Person wechseln">${dot(me)} ${esc(me ? me.name : 'Wer bin ich?')}</button>` : ''}
  </div>${nav}</header>`;
}

function tabbar() {
  const need = [...Array(7)].reduce((n, _, i) => n + openShop(addDays(TODAY, i)), 0);
  const t = [['week', 'week', 'Woche'], ['need', 'cart', 'Bedarf'], ['dishes', 'book', 'Gerichte'], ['menu', 'menu', 'Menü']];
  return `<nav class="tabs" aria-label="Bereiche">${t.map(([k, i, l]) => `<button data-act="tab" data-v="${k}" ${ui.tab === k ? 'aria-current="page"' : ''}><span class="tic">${ic(i)}</span>${l}${k === 'need' && need ? `<span class="cnt">${need}</span>` : ''}</button>`).join('')}</nav>`;
}

function hints() {
  if (ui.week !== mondayOf(TODAY) || !ui.me) return '';
  const out = [], d = state.days[TODAY];
  if (d && d.cook === ui.me && KIND[d.kind].cook) out.push(`Du kochst heute um ${d.time} Uhr${d.dish ? ': ' + esc(dn(d.dish)) : ''}.`);
  const n = openShop(addDays(TODAY, 1)); if (n) out.push(`${n} ${n === 1 ? 'Einkauf' : 'Einkäufe'} für morgen offen.`);
  const open = [0, 1, 2].map(i => addDays(TODAY, i)).filter(x => (state.days[x]?.kind !== 'self') && myStatus(x) === 'open');
  if (open.length) out.push(`Sag noch zu oder ab: ${open.map(x => DOWS[wd(x)]).join(', ')}.`);
  const stale = [...Array(7)].map((_, i) => addDays(TODAY, i)).filter(calStale);
  if (stale.length) out.push(`Kalender veraltet für ${stale.map(x => DOWS[wd(x)]).join(', ')}.`);
  const lb = lsGet('fm-lastBackup');
  if (meIsAdmin() && (!lb || (parse(TODAY) - parse(lb)) / 864e5 > 30)) out.push(`Letzte Sicherung ${lb ? 'am ' + fmtFull(lb) : 'auf diesem Gerät noch nie'}. <button class="linkbtn" data-act="backupNow">Jetzt sichern</button>`);
  return out.length ? `<div class="hints">${out.map(t => `<p>${t}</p>`).join('')}</div>` : '';
}

function stepper(dt, g) {
  return `<span class="stepper"><button data-act="g" data-date="${dt}" data-d="-1" aria-label="Ein Gast weniger" ${g <= 0 ? 'disabled' : ''}>−</button><b>${g}</b><button data-act="g" data-date="${dt}" data-d="1" aria-label="Ein Gast mehr" ${g >= 9 ? 'disabled' : ''}>+</button></span>`;
}

function dayCard(dt) {
  const d = state.days[dt], past = dt < TODAY, today = dt === TODAY;
  const planned = hasPlan(d);
  const kind = d ? d.kind : 'cook';
  // Feste Plätze in fester Reihenfolge: Auf dem iPad stehen sie in allen Spalten auf gleicher Höhe, leere Plätze bleiben frei
  const slot = (cls, html = '') => `<div class="slot ${cls}">${html}</div>`;
  const out = planned && d.place === 'out', k = KIND[kind], open = !planned && !past;
  const s = [];
  s.push(slot('meta', planned
    ? `<span class="tag ${out ? 'out' : ''}">${ic(out ? 'out' : 'home')}${out ? 'auswärts' : '@home'}</span><span class="time">${ic('clock')}${d.time}</span>`
    : `<span class="empty-note">${past ? 'Nichts eingetragen' : 'Noch nicht geplant'}</span>`));
  if ((planned && k.cook) || open) {
    const p = planned ? person(d.cook) : null;
    s.push(slot('cook', `${dot(p)}<span>${p ? esc(p.name) : '<span class="muted">Koch offen</span>'}</span>${out && p ? '<small>organisiert</small>' : ''}`));
  } else s.push(slot('cook', planned ? `${dot(null)}<span class="muted">ohne Koch</span>` : ''));
  s.push(slot(`kind k-${kind}`, planned ? `${ic(k.i)}${k.l}` : ''));
  let dishHtml = '';
  if (planned && kind !== 'self') {
    if (isHidden(dt, d)) dishHtml = `<span class="th sm surprise-plate">${ic('gift')}</span><div class="dish-t"><b class="surprise">Surprise</b></div>`;
    else if (d.dish && dish(d.dish)) { const x = dish(d.dish), a = past ? d.snap?.dish : avgOf(x); dishHtml = `${thumb(x, 'sm')}<div class="dish-t"><b>${esc(x.name)}</b>${a != null ? `<span class="grade ${gcls(a)}">⌀ ${num1(a)}</span>` : ''}</div>`; }
    else dishHtml = `<span class="th sm plate-empty"></span><span class="muted">${kind === 'surprise' ? 'Gericht folgt' : kind === 'cook' ? 'Gericht offen' : 'kein Gericht'}</span>`;
  } else if (open) dishHtml = `<span class="th sm plate-empty"></span><span class="muted">Gericht offen</span>`;
  s.push(slot('dish', dishHtml));
  s.push(slot('dessert', planned && d.dessert && dish(d.dessert) ? `${thumb(dish(d.dessert), 'xs')}${esc(dn(d.dessert))}` : ''));
  if (kind !== 'self' && (planned || !past)) {
    const part = (d && d.part) || {}, timed = activePersons().some(p => part[p.id]?.t && part[p.id]?.s === 'yes');
    const cnt = st => activePersons().filter(p => (part[p.id]?.s || 'open') === st).length;
    s.push(slot('psum', `<b>${cnt('yes')} dabei</b>${cnt('open') ? ` · ${cnt('open')} offen` : ''}${cnt('no') ? ` · ${cnt('no')} nicht dabei` : ''}`));
    s.push(`<div class="slot part ${timed ? 'timed' : ''}">${activePersons().map(p => {
      const v = part[p.id] || { s: 'open' }, mine = p.id === ui.me && !past, t = v.s === 'yes' && v.t ? `<i>${v.t}</i>` : '';
      const lbl = `${p.name}: ${PART[v.s]}${v.t && v.s === 'yes' ? ' ab ' + v.t : ''}`;
      return mine
        ? `<button class="pdot s-${v.s} mine" style="--c:${p.color}" data-act="togglePart" data-lp="myPart" data-date="${dt}" aria-label="${esc(lbl)}. Antippen zum Ändern, lange drücken für Uhrzeit" title="${esc(lbl)}">${figSvg(p)}${t}</button>`
        : `<span class="pdot s-${v.s}" style="--c:${p.color}" title="${esc(lbl)}" aria-label="${esc(lbl)}">${figSvg(p)}${t}</span>`;
    }).join('')}</div>`);
    const g = d ? d.guests : 0, yes = activePersons().filter(p => part[p.id]?.s === 'yes').length;
    const n = openShop(dt), stale = !past && ui.me && calStale(dt);
    s.push(slot('foot', `${n ? `<span class="badge">${ic('cart')}${n} offen</span>` : ''}${stale ? `<span class="badge warn">Kalender veraltet</span>` : ''}`));
    s.push(slot('foot guests', `<span class="lbl">Gäste</span>${past ? `<b>${g}</b>` : stepper(dt, g)}<span class="muted">= ${yes + g} ${yes + g === 1 ? 'Person' : 'Personen'}</span>`));
  } else s.push(slot('psum'), slot('part'), slot('foot'), slot('foot guests'));
  return `<article class="day ${past ? 'past' : ''} ${today ? 'today' : ''}" data-act="openDay" data-date="${dt}" role="button" tabindex="0" aria-label="${fmtLong(dt)} öffnen">
    <div class="day-date"><span class="dow">${DOWS[wd(dt)]}</span><span class="dnum">${parse(dt).getDate()}</span>${today ? '<span class="today-flag">heute</span>' : ''}</div>
    <div class="day-main">${s.join('')}</div></article>`;
}

function weekView() {
  const days = [...Array(7)].map((_, i) => addDays(ui.week, i));
  return `${hints()}<div class="week">${days.map(dayCard).join('')}</div>
  <div class="week-foot">
    <button class="btn ghost" data-act="calWeek">${ic('cal')} Meine Woche in den Kalender</button>
    <p class="tip">Deine eigene Figur antippen: zusagen, absagen oder offen lassen. Lange drücken: eigene Uhrzeit angeben, z. B. „dabei ab 20:00“.</p>
  </div>`;
}

function shopList(dt, mode) {
  const d = state.days[dt];
  let items = shopArr(d).sort((a, b) => a.done - b.done);
  if (mode === 'need') items = items.filter(s => !s.done);
  const ro = mode === 'ro';
  const li = items.map(it => {
    const p = person(it.by);
    const claim = p ? `<button class="claim" ${ro ? 'disabled' : `data-act="claim" data-date="${dt}" data-id="${it.id}"`}>${dot(p)} ${esc(p.name)}: ${HOW[it.how] || 'übernimmt'}</button>`
      : (!it.done && !ro ? `<button class="claim open" data-act="claim" data-date="${dt}" data-id="${it.id}">Übernehme ich</button>` : '');
    return `<li class="${it.done ? 'done' : ''}">
      <button class="check" ${ro ? 'disabled' : `data-act="shopToggle" data-date="${dt}" data-id="${it.id}"`} role="checkbox" aria-checked="${!!it.done}" aria-label="${esc(it.text)} abhaken">${it.done ? ic('check') : ''}</button>
      <span class="stxt">${esc(it.text)}</span>${claim}
      ${mode === 'edit' ? `<button class="icon-btn sm" data-act="shopDel" data-date="${dt}" data-id="${it.id}" aria-label="${esc(it.text)} entfernen">${ic('x')}</button>` : ''}
    </li>`;
  }).join('');
  let h = items.length ? `<ul class="shop">${li}</ul>` : (mode === 'edit' ? '<p class="help">Noch nichts auf der Liste.</p>' : '');
  if (mode === 'edit') h += `<div class="addrow"><input class="inp" id="shop-new" placeholder="Was wird gebraucht? z. B. 2 Zucchini" data-enter="shopAdd" data-date="${dt}" autocomplete="off"><button class="btn" data-act="shopAdd" data-date="${dt}">Hinzufügen</button></div>`;
  return h;
}

function needView() {
  const ds = [...Array(7)].map((_, i) => addDays(TODAY, i));
  const blocks = ds.filter(dt => openShop(dt)).map(dt => {
    const d = state.days[dt];
    return `<section class="need-day"><h3>${dt === TODAY ? 'Heute' : DOW[wd(dt)]}, ${fmtShort(dt)} <small>${esc(dayWhat(dt, d))}${d.cook ? ' · ' + esc(pn(d.cook)) : ''}</small></h3>${shopList(dt, 'need')}</section>`;
  });
  const done = ds.reduce((n, dt) => n + shopArr(state.days[dt]).filter(s => s.done).length, 0);
  return `<div class="narrow">
    <div class="toolbar"><h1 class="page-title">Bedarf</h1><span class="muted">${fmtShort(TODAY)} – ${fmtShort(addDays(TODAY, 6))}</span></div>
    <p class="help">Alles, was in den nächsten 7 Tagen noch fehlt. Abhaken oder übernehmen geht direkt hier, auch ohne Netz.</p>
    ${blocks.length ? blocks.join('') : `<div class="empty"><b>Alles besorgt</b><span class="muted">Für die nächsten 7 Tage ist nichts mehr offen.</span></div>`}
    ${done ? `<p class="help">${done} ${done === 1 ? 'Eintrag' : 'Einträge'} bereits erledigt.</p>` : ''}
  </div>`;
}

function dishList(cfg, scope) {
  const st = stats(), act = scope === 'pick' ? 'pickSel' : 'openDish';
  let ds = state.dishes.filter(d => d.type === cfg.type && !d.archived && d.name);
  const q = cfg.q.trim().toLowerCase();
  if (q) ds = ds.filter(d => d.name.toLowerCase().includes(q) || (d.desc || '').toLowerCase().includes(q));
  for (const [c, v] of Object.entries(cfg.filter)) ds = ds.filter(d => d.cat?.[c] === v);
  const byName = (a, b) => a.name.localeCompare(b.name, 'de');
  if (cfg.sort === 'alpha') ds.sort(byName);
  if (cfg.sort === 'freq') ds.sort((a, b) => ((st[b.id]?.n || 0) - (st[a.id]?.n || 0)) || byName(a, b));
  if (cfg.sort === 'grade') ds.sort((a, b) => ((avgOf(a) ?? 9) - (avgOf(b) ?? 9)) || byName(a, b));
  let h = '';
  if (scope === 'pick' && q && !state.dishes.some(d => d.type === cfg.type && !d.archived && d.name.toLowerCase() === q))
    h += `<button class="drow newrow" data-act="pickNew">${ic('plus')}<div class="dmain"><b>„${esc(cfg.q.trim())}“ neu anlegen</b><small>als ${cfg.type === 'main' ? 'Gericht' : 'Dessert'}, Details danach ergänzen</small></div></button>`;
  const none = !state.dishes.some(d => d.type === cfg.type && !d.archived && d.name);
  if (!ds.length && !h) h = none
    ? `<p class="help">Noch ${cfg.type === 'main' ? 'keine Gerichte' : 'keine Desserts'} angelegt. ${scope === 'pick' ? 'Tippe oben einen Namen ein, um das erste anzulegen.' : 'Lege mit „Neu“ das erste an.'}</p>`
    : `<p class="help">Keine Treffer.${Object.keys(cfg.filter).length ? ' Tippe einen aktiven Filter erneut an, um ihn aufzuheben.' : ''}</p>`;
  h += ds.map(d => {
    const a = avgOf(d), s = st[d.id];
    return `<button class="drow" data-act="${act}" data-id="${d.id}">${thumb(d)}<div class="dmain"><b>${esc(d.name)}</b>${d.type === 'main' ? `<small>${esc(catLine(d) || 'ohne Kategorie')}</small>` : ''}
      <small>${a != null ? `<span class="grade ${gcls(a)}">⌀ ${num1(a)}</span>` : 'ohne Note'} · ${s ? `${s.n}× · zuletzt ${fmtAuto(s.last)}` : (d.type === 'dessert' ? 'noch nie serviert' : 'noch nie gekocht')}</small></div></button>`;
  }).join('');
  return h;
}
function listControls(cfg, scope) {
  return `<div class="search">${ic('search')}<input id="${scope}-q" type="search" placeholder="${scope === 'pick' ? 'Suchen oder neu anlegen' : 'Suchen'}" value="${esc(cfg.q)}" data-in="listQ" data-scope="${scope}" autocomplete="off" aria-label="Gerichte durchsuchen"></div>
  <div class="toolbar"><div class="seg sm" role="group" aria-label="Sortierung">${[['alpha', 'A–Z'], ['freq', 'Häufigkeit'], ['grade', 'Note']].map(([v, l]) => `<button class="${cfg.sort === v ? 'on' : ''}" data-act="sort" data-scope="${scope}" data-v="${v}">${l}</button>`).join('')}</div></div>
  ${cfg.type === 'main' ? `<div class="filters">${state.categories.map(c => `<div class="frow"><span>${esc(c.name)}</span>${(c.values || []).map(v => `<button class="chip ${cfg.filter[c.id] === v ? 'on' : ''}" data-act="filt" data-scope="${scope}" data-c="${c.id}" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div>`).join('')}</div>` : ''}
  <div class="list" id="${scope}-list">${dishList(cfg, scope)}</div>`;
}

function dishesView() {
  const c = ui.dlist;
  return `<div class="narrow">
    <div class="toolbar"><h1 class="page-title">${c.type === 'main' ? 'Gerichte' : 'Desserts'}</h1><button class="btn" data-act="newDish">${ic('plus')} Neu</button></div>
    <div class="seg"><button class="${c.type === 'main' ? 'on' : ''}" data-act="dtype" data-v="main">Gerichte</button><button class="${c.type === 'dessert' ? 'on' : ''}" data-act="dtype" data-v="dessert">Desserts</button></div>
    ${listControls(c, 'tab')}
  </div>`;
}

const MENU = [
  ['persons', 'users', 'Personen', 'Namen, Figuren, Farben'],
  ['dishesTab', 'book', 'Gerichte und Desserts', 'Ansehen, anlegen, bewerten'],
  ['categories', 'tag', 'Kategorien', 'Ausprägungen erweitern'],
  ['review', 'history', 'Rückblick', 'Wer hat wann was gekocht, korrigieren'],
  ['plan', 'plan', 'Planung', 'Kommende Wochen'],
  ['settings', 'gear', 'Einstellungen', 'Ich bin, Darstellung, Einladung'],
  ['export', 'download', 'CSV-Export', 'Tabellen für Excel oder Numbers'],
  ['backup', 'save', 'Sicherung', 'Alle Daten als Datei'],
  ['admin', 'shield', 'Verwaltung', 'Löschen, Wiederherstellen, Rollen, Geräte'],
];
function menuView() {
  return `<div class="toolbar" style="margin-bottom:12px"><h1 class="page-title">Menü</h1><span class="muted">${esc(state.family.name)}</span></div>
  <div class="mlist">${MENU.map(([k, i, l, s]) => `<button class="mitem" data-act="menu" data-v="${k}"><span class="mi">${ic(i)}</span><span><b>${l}</b><small>${s}</small></span></button>`).join('')}</div>
  <div class="week-foot"><button class="btn ghost sm" data-act="leave">${ic('logout')} Dieses Gerät abmelden</button>
  <p class="proto">Alle Änderungen gelten sofort für alle Geräte der Familie. Ohne Netz merkt sich die App Änderungen und überträgt sie später.</p></div>`;
}

/* Gründen und Beitreten */
function onboardView() {
  const o = ui.ob;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iPhone|iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const installHint = ios && !standalone ? `<p class="note">Tipp für iPhone und iPad: Installiere die App zuerst über <b>Teilen → Zum Home-Bildschirm</b> und öffne sie dann dort. Safari und die Home-Bildschirm-App merken sich die Familie getrennt.</p>` : '';
  const err = o.err ? `<p class="err">${o.err}</p>` : '';
  if (o.step === 'create') {
    const color = o.color || COLORS[3][1], fig = o.fig || 'n', me = { name: o.name || '?', fig, color };
    return `<div class="ob"><h1>Familie gründen</h1>${err}
      <div class="field"><label for="ob-fam">Familienname</label><input class="inp" id="ob-fam" value="${esc(o.fam || '')}" data-in="ob" data-k="fam" placeholder="z. B. Familie Müller" autocomplete="off"></div>
      <div class="field"><label for="ob-name">Dein Name</label><input class="inp" id="ob-name" value="${esc(o.name || '')}" data-in="ob" data-k="name" placeholder="Vorname" autocomplete="off"></div>
      <div class="field"><span class="flabel">Figur</span><div class="figs">${[['f', 'Frau'], ['m', 'Mann'], ['n', 'neutral']].map(([v, l]) => `<button class="sw ${fig === v ? 'on' : ''}" data-act="obSet" data-k="fig" data-v="${v}" aria-pressed="${fig === v}"><span class="dot lg" style="--c:${color}">${figSvg(Object.assign({}, me, { fig: v }))}</span>${l}</button>`).join('')}</div></div>
      <div class="field"><span class="flabel">Farbe</span><div class="swatches">${COLORS.map(([n, c]) => `<button class="sw ${color === c ? 'on' : ''}" data-act="obSet" data-k="color" data-v="${c}" style="--c:${c}" aria-pressed="${color === c}"><span class="c"></span>${n}</button>`).join('')}</div></div>
      <div class="field"><label for="ob-pin">Admin-PIN (4 bis 8 Ziffern)</label><input class="inp" id="ob-pin" type="password" inputmode="numeric" maxlength="8" data-in="ob" data-k="pin" autocomplete="new-password" style="max-width:200px"></div>
      <div class="field"><label for="ob-pin2">Admin-PIN wiederholen</label><input class="inp" id="ob-pin2" type="password" inputmode="numeric" maxlength="8" data-in="ob" data-k="pin2" autocomplete="new-password" style="max-width:200px"><p class="help">Die PIN schützt Löschen, Wiederherstellen und Rollen. Gut merken, sie lässt sich später in der Verwaltung ändern.</p></div>
      <div class="row"><button class="btn" data-act="obCreate" ${o.busy ? 'disabled' : ''}>${o.busy ? 'Wird angelegt …' : 'Familie gründen'}</button><button class="btn ghost" data-act="obSet" data-k="step" data-v="choose">Zurück</button></div></div>`;
  }
  if (o.step === 'join') {
    return `<div class="ob"><h1>Familie beitreten</h1>${installHint}${err}
      <div class="field"><label for="ob-code">Einladungscode</label><input class="inp code" id="ob-code" value="${esc(o.code || '')}" data-in="ob" data-k="code" data-enter="obJoin" placeholder="KOCH-XXXX-00" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>
      <div class="row"><button class="btn" data-act="obJoin" ${o.busy ? 'disabled' : ''}>${o.busy ? 'Wird geprüft …' : 'Beitreten'}</button><button class="btn ghost" data-act="obSet" data-k="step" data-v="choose">Zurück</button></div>
      <p class="help">Den Code findet jemand aus der Familie im Menü unter Einstellungen → Einladung.</p></div>`;
  }
  return `<div class="ob"><h1>Willkommen bei ${APP_NAME}</h1>
    <p class="lead">Der gemeinsame Essensplan für die Familie: wer kocht, was es gibt, wer mitisst und was noch eingekauft werden muss.</p>
    ${installHint}${err}
    <div class="choice">
      <button class="drow" data-act="obSet" data-k="step" data-v="join">${ic('users')}<div class="dmain"><b>Mit Einladungscode beitreten</b><small>Die Familie nutzt die App schon</small></div>${ic('right')}</button>
      <button class="drow" data-act="obSet" data-k="step" data-v="create">${ic('plus')}<div class="dmain"><b>Neue Familie gründen</b><small>Du richtest die App als Erste oder Erster ein</small></div>${ic('right')}</button>
    </div></div>`;
}

/* ---------- Sheets ---------- */
function seg(act, dt, cur, opts) { return opts.map(([v, l]) => `<button class="${cur === v ? 'on' : ''}" data-act="${act}" data-date="${dt}" data-v="${v}">${l}</button>`).join(''); }
function pickBtn(dt, slot, id) {
  const x = dish(id), a = x && avgOf(x);
  return `<button class="pickbtn" data-act="pick" data-date="${dt}" data-slot="${slot}">${x ? thumb(x, 'sm') : `<span class="th sm">${ic(slot === 'dish' ? 'pot' : 'cake')}</span>`}
    <div class="dmain"><b>${x ? esc(x.name) : (slot === 'dish' ? 'Gericht wählen' : 'Dessert wählen (optional)')}</b><small>${x ? (a != null ? '⌀ ' + num1(a) : 'noch ohne Note') + (catLine(x) ? ' · ' + esc(catLine(x)) : '') : 'Aus der Liste wählen oder neu anlegen'}</small></div>${ic('right')}</button>`;
}

function sheetDay(a) {
  const dt = a.date, ro = dt < TODAY && !a.edit, d = state.days[dt] || blankDay();
  const title = fmtLong(dt) + (dt === TODAY ? ' · heute' : '');
  if (ro) return { title, body: dayReadonly(dt, d) };
  const k = KIND[d.kind];
  let b = '';
  if (dt < TODAY) b += `<p class="note">Rückwirkende Korrektur. Änderungen gelten sofort für alle.</p>`;
  b += `<div class="field"><span class="flabel">Ort</span><div class="seg">${seg('place', dt, d.place, [['home', '@home'], ['out', 'auswärts']])}</div></div>`;
  b += `<div class="field"><span class="flabel">Art</span><div class="chips">${KINDS.map(x => `<button class="chip ${d.kind === x.k ? 'on' : ''}" data-act="kind" data-date="${dt}" data-v="${x.k}">${ic(x.i)} ${x.l}</button>`).join('')}</div>
    ${!k.cook ? `<p class="help">${d.kind === 'bread' ? 'Brotzeit: alle zu Hause, ohne Koch.' : 'Jeder für sich: kein gemeinsames Essen, kein Koch.'}</p>` : ''}</div>`;
  if (k.cook) b += `<div class="field"><span class="flabel">${d.place === 'out' ? 'Organisiert von' : 'Koch'}</span><div class="chips">${activePersons().map(p => `<button class="chip ${d.cook === p.id ? 'on' : ''}" data-act="cook" data-date="${dt}" data-pid="${p.id}">${dot(p)} ${esc(p.name)}</button>`).join('')}<button class="chip add" data-act="newPerson">${ic('plus')} Person</button></div></div>`;
  b += `<div class="field"><label for="day-time">Uhrzeit</label><input class="inp" type="time" id="day-time" value="${d.time}" data-in="dayTime" data-date="${dt}"></div>`;
  if (d.kind !== 'self') {
    const hidden = isHidden(dt, d);
    b += `<div class="field"><span class="flabel">Gericht</span>${hidden
      ? `<div class="pickbtn"><span class="th sm surprise-plate">${ic('gift')}</span><div class="dmain"><b>Surprise</b><small>${esc(pn(d.cook))} verrät es noch nicht. Ab morgen ist es für alle sichtbar.</small></div></div>`
      : pickBtn(dt, 'dish', d.dish)}
      ${d.kind === 'surprise' && d.cook && d.cook === ui.me ? `<button class="switch ${d.surpriseHidden ? 'on' : ''}" data-act="toggleHide" data-date="${dt}" role="switch" aria-checked="${!!d.surpriseHidden}"><span></span>Gericht für die anderen verbergen</button>` : ''}
      ${d.kind === 'surprise' && !d.dish && !hidden ? '<p class="help">Ohne Gericht ist Surprise ein Platzhalter. Das Gericht kann später nachgetragen werden.</p>' : ''}</div>`;
    b += `<div class="field"><span class="flabel">Dessert</span>${pickBtn(dt, 'dessert', d.dessert)}</div>`;
  }
  b += `<div class="field"><label for="day-notes">Hinweise</label><textarea class="inp" id="day-notes" rows="2" data-in="dayNotes" data-date="${dt}" placeholder="z. B. Bitte Tisch decken">${esc(d.notes)}</textarea></div>`;
  if (d.kind !== 'self') {
    const yes = activePersons().filter(p => d.part[p.id]?.s === 'yes').length;
    b += `<div class="field"><span class="flabel">Teilnahme</span><div class="card plist">${activePersons().map(p => {
      const v = d.part[p.id] || { s: 'open' };
      return `<div class="prow">${dot(p)}<span class="pname">${esc(p.name)}${p.id === ui.me ? ' <span class="muted">(du)</span>' : ''}</span>
        <div class="seg sm">${[['yes', 'Dabei'], ['no', 'Nein'], ['open', 'Offen']].map(([s, l]) => `<button class="${v.s === s ? 'on' : ''}" data-act="partSet" data-date="${dt}" data-pid="${p.id}" data-s="${s}">${l}</button>`).join('')}</div>
        ${v.s === 'yes' ? `<label class="ptime">ab <input class="inp sm" type="time" value="${v.t || ''}" data-in="partTime" data-date="${dt}" data-pid="${p.id}" aria-label="Abweichende Uhrzeit für ${esc(p.name)}"></label>` : ''}</div>`;
    }).join('')}<div class="prow"><span class="pname">Gäste</span>${stepper(dt, d.guests)}</div></div>
    <p class="help">${yes} ${yes === 1 ? 'Zusage' : 'Zusagen'} + ${d.guests} ${d.guests === 1 ? 'Gast' : 'Gäste'} = <b>${yes + d.guests} Personen</b>. Die Uhrzeit „ab“ nur ausfüllen, wenn sie abweicht.</p></div>`;
  }
  b += `<div class="field"><span class="flabel">Einkauf für diesen Tag</span>${shopList(dt, 'edit')}</div>`;
  if (dt >= TODAY && ui.me && calRelevant(dt)) b += `<div class="field"><span class="flabel">Kalender</span><button class="btn ghost" data-act="cal" data-date="${dt}">${ic('cal')} ${calStale(dt) ? 'Kalender aktualisieren' : 'In Kalender übernehmen'}</button><p class="help">Termin mit Erinnerung 90 und 60 Minuten vorher.</p></div>`;
  return { title, body: b };
}

function dayReadonly(dt, d) {
  const x = dish(d.dish), y = dish(d.dessert);
  const yes = Object.entries(d.part).filter(([, v]) => v.s === 'yes').map(([k, v]) => pn(k) + (v.t ? ` (ab ${v.t})` : ''));
  let b = `<dl class="kv">
    <dt>Ort</dt><dd>${d.place === 'out' ? 'auswärts' : '@home'}</dd>
    <dt>Art</dt><dd>${KIND[d.kind].l}</dd>
    ${KIND[d.kind].cook ? `<dt>${d.place === 'out' ? 'Organisiert von' : 'Koch'}</dt><dd>${esc(pn(d.cook) || '–')}</dd>` : ''}
    <dt>Uhrzeit</dt><dd>${d.time}</dd>
    ${d.kind !== 'self' ? `<dt>Gericht</dt><dd>${x ? esc(x.name) + (d.snap?.dish != null ? ` <span class="grade ${gcls(d.snap.dish)}">⌀ ${num1(d.snap.dish)} am Kochtag</span>` : '') : '–'}</dd>` : ''}
    ${y ? `<dt>Dessert</dt><dd>${esc(y.name)}</dd>` : ''}
    ${d.kind !== 'self' ? `<dt>Dabei</dt><dd>${yes.length ? esc(yes.join(', ')) : '–'}${d.guests ? ` + ${d.guests} ${d.guests === 1 ? 'Gast' : 'Gäste'}` : ''}</dd>` : ''}
    ${d.notes ? `<dt>Hinweise</dt><dd>${esc(d.notes)}</dd>` : ''}
  </dl>`;
  if (x || y) b += `<div class="row">${x ? `<button class="btn" data-act="openDish" data-id="${x.id}">${ic('book')} ${esc(x.name)} bewerten</button>` : ''}${y ? `<button class="btn ghost" data-act="openDish" data-id="${y.id}">${ic('cake')} ${esc(y.name)} bewerten</button>` : ''}</div>`;
  if (shopArr(d).length) b += `<div class="field"><span class="flabel">Einkauf</span>${shopList(dt, 'ro')}</div>`;
  b += `<p class="help">Vergangene Tage sind in der Wochenansicht nur lesbar. Korrigieren kannst du sie über Menü → Rückblick.</p>`;
  return b;
}

function sheetMyPart(a) {
  const dt = a.date, d = state.days[dt] || blankDay(), v = d.part[ui.me] || { s: 'open' };
  return { title: `${DOW[wd(dt)]}, ${fmtShort(dt)}: deine Teilnahme`, body: `
    <div class="seg">${[['yes', 'Dabei'], ['no', 'Nicht dabei'], ['open', 'Offen']].map(([s, l]) => `<button class="${v.s === s ? 'on' : ''}" data-act="partSet" data-date="${dt}" data-pid="${ui.me}" data-s="${s}">${l}</button>`).join('')}</div>
    ${v.s === 'yes' ? `<div class="field"><label for="my-time">Abweichende Uhrzeit (Essen um ${d.time})</label><div class="row"><input class="inp" type="time" id="my-time" value="${v.t || ''}" data-in="partTime" data-date="${dt}" data-pid="${ui.me}">${v.t ? `<button class="btn ghost sm" data-act="partTimeClear" data-date="${dt}">Zurücksetzen</button>` : ''}</div><p class="help">Alle sehen die Uhrzeit unter deiner Figur.</p></div>` : ''}
    <button class="btn wide" data-act="close">Fertig</button>` };
}

function sheetPick(a) {
  return { title: a.slot === 'dish' ? 'Gericht wählen' : 'Dessert wählen', body: `
    ${state.days[a.date]?.[a.slot] ? `<button class="btn ghost sm" data-act="pickNone">${ic('x')} ${a.slot === 'dish' ? 'Kein Gericht' : 'Kein Dessert'}</button>` : ''}
    ${listControls(a, 'pick')}` };
}

function spark(id, key) {
  const pts = Object.entries(state.days).filter(([dt, d]) => d[key] === id && d.snap?.[key] != null && dt <= TODAY).sort(([a], [b]) => a < b ? -1 : 1).map(([dt, d]) => ({ dt, v: d.snap[key] }));
  if (pts.length < 2) return '<p class="help">Der Verlauf erscheint, sobald das Gericht mindestens zweimal gekocht wurde.</p>';
  const W = 320, H = 96, x0 = 22, x1 = W - 8, y0 = 10, y1 = H - 22;
  const X = i => x0 + i * (x1 - x0) / (pts.length - 1), Y = v => y0 + (v - 1) / 5 * (y1 - y0);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.v).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return `<div class="spark"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Verlauf der Durchschnittsnote von ${num1(pts[0].v)} auf ${num1(last.v)}">
    ${[1, 3.5, 6].map(v => `<line x1="${x0}" x2="${x1}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${x0 - 6}" y="${Y(v) + 4}" font-size="10" text-anchor="end" fill="var(--muted)">${String(v).replace('.', ',')}</text>`).join('')}
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p.v)}" r="${i === pts.length - 1 ? 4 : 2.5}" fill="${i === pts.length - 1 ? 'var(--accent)' : 'var(--card)'}" stroke="var(--accent)" stroke-width="1.5"/>`).join('')}
    <text x="${x0}" y="${H - 6}" font-size="10" fill="var(--muted)">${fmtAuto(pts[0].dt)}</text>
    <text x="${x1}" y="${H - 6}" font-size="10" text-anchor="end" fill="var(--muted)">${fmtAuto(last.dt)} · ⌀ ${num1(last.v)}</text>
  </svg></div><p class="help">Durchschnittsnote, wie sie an jedem Kochtag gespeichert wurde. Oben ist besser (1 = sehr gut).</p>`;
}

function sheetDish(a) {
  const d = dish(a.id); if (!d) return { title: 'Gericht', body: '<p class="help">Nicht gefunden.</p>' };
  const av = avgOf(d), st = stats()[d.id], n = Object.values(d.ratings || {}).filter(Boolean).length, key = d.type === 'main' ? 'dish' : 'dessert';
  let b = `<div class="dish-head">${thumb(d, 'lg')}<div class="photo-acts">
      <label class="btn ghost sm">${ic('photo')} ${d.photo ? 'Foto ändern' : 'Foto hinzufügen'}<input type="file" accept="image/*" data-ch="photo" data-id="${d.id}" hidden></label>
      ${d.photo ? `<button class="btn ghost sm" data-act="photoDel" data-id="${d.id}">Foto entfernen</button>` : ''}
      <span class="help">Wird automatisch verkleinert.</span></div></div>
    <div class="field"><label for="dish-name">Name</label><input class="inp" id="dish-name" value="${esc(d.name)}" data-in="dishName" data-id="${d.id}" placeholder="z. B. Gemüselasagne" autocomplete="off"></div>
    <div class="field"><label for="dish-desc">Beschreibung und Hinweise</label><textarea class="inp" id="dish-desc" rows="3" data-in="dishDesc" data-id="${d.id}" placeholder="Zubereitung, Tipps, Varianten">${esc(d.desc)}</textarea></div>`;
  if (d.type === 'main') b += state.categories.map(c => `<div class="field"><span class="flabel">${esc(c.name)}</span><div class="chips">${(c.values || []).map(v => `<button class="chip ${d.cat?.[c.id] === v ? 'on' : ''}" data-act="dishCat" data-id="${d.id}" data-c="${c.id}" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div></div>`).join('');
  b += `<div class="field"><span class="flabel">Noten</span><div class="avgbig">${av != null ? '⌀ ' + num1(av) : '–'}<small>${n ? `aus ${n} ${n === 1 ? 'Note' : 'Noten'}` : 'noch keine Noten'}</small></div>
    <div class="card plist">${activePersons().map(p => { const r = d.ratings?.[p.id], mine = p.id === ui.me;
      return `<div class="rrow">${dot(p)}<span class="pname">${esc(p.name)}${mine ? ' <span class="muted">(du)</span>' : ''}</span><div class="grades" role="group" aria-label="Note von ${esc(p.name)}" style="--c:${p.color}">${[1, 2, 3, 4, 5, 6].map(g => `<button class="gbtn ${r === g ? 'on' : ''}" ${mine ? `data-act="rate" data-id="${d.id}" data-n="${g}"` : 'disabled'} aria-pressed="${r === g}">${g}</button>`).join('')}</div></div>`; }).join('')}</div>
    <p class="help">1 = sehr gut, 6 = ungenügend. Du vergibst nur deine eigene Note und kannst sie jederzeit ändern. Nochmal antippen entfernt sie.</p></div>`;
  b += `<div class="field"><span class="flabel">Statistik</span><div class="stats"><span><b>${st ? st.n : 0}×</b>${d.type === 'main' ? 'gekocht' : 'serviert'}</span><span><b>${st ? fmtAuto(st.last) : '–'}</b>zuletzt</span></div></div>
    <div class="field"><span class="flabel">Entwicklung der Note</span>${spark(d.id, key)}</div>`;
  b += d.archived ? `<button class="btn ghost" data-act="dishRestore" data-id="${d.id}">Wiederherstellen</button>` : (d.name ? `<button class="btn ghost sm" data-act="dishArchive" data-id="${d.id}">Archivieren</button><p class="help">Archivierte Gerichte erscheinen nicht mehr in der Auswahl, bleiben aber im Rückblick erhalten.</p>` : '');
  return { title: d.name || (d.type === 'main' ? 'Neues Gericht' : 'Neues Dessert'), body: b };
}

function sheetClaim(a) {
  const it = state.days[a.date]?.shop?.[a.id]; if (!it) return { title: 'Einkauf', body: '' };
  const me = person(ui.me);
  return { title: `„${it.text}“`, body: `
    ${it.by ? `<p class="help">Aktuell: ${esc(pn(it.by))}, ${HOW[it.how] || 'übernimmt'}.</p>` : '<p class="help">Wer besorgt das? Alle sehen deinen Namen am Eintrag.</p>'}
    <div class="list">
      <button class="drow" data-act="claimSet" data-how="bring">${dot(me)}<div class="dmain"><b>Bringe ich mit</b><small>z. B. aus dem Vorrat oder vom Markt</small></div></button>
      <button class="drow" data-act="claimSet" data-how="way">${dot(me)}<div class="dmain"><b>Besorge ich auf dem Heimweg</b><small>Erscheint mit deiner Farbe in der Liste</small></div></button>
      ${it.by ? `<button class="drow" data-act="claimClear">${ic('x')}<div class="dmain"><b>Übernahme aufheben</b></div></button>` : ''}
    </div>` };
}

function sheetWelcome(a) {
  return { title: a.switch ? 'Wer bist du?' : `Willkommen in der ${state.family?.name || 'Familie'}`, closable: !!ui.me, body: `
    <div class="field"><span class="flabel">Wer bist du auf diesem Gerät?</span><div class="list">
      ${activePersons().map(p => `<button class="drow" data-act="setMe" data-pid="${p.id}">${dot(p, 'lg')}<div class="dmain"><b>${esc(p.name)}</b><small>${p.admin ? 'Initiator' : 'Mitglied'}</small></div>${ui.me === p.id ? ic('check') : ''}</button>`).join('')}
      <button class="drow" data-act="newPerson">${ic('plus')}<div class="dmain"><b>Ich bin noch nicht dabei</b><small>Neue Person mit Name, Figur und Farbe anlegen</small></div></button>
    </div></div>
    <p class="help">Das Gerät merkt sich die Auswahl. Wechseln kannst du jederzeit oben rechts.</p>` };
}

function sheetPersons() {
  const arch = state.persons.filter(p => p.archived);
  return { title: 'Personen', body: `<div class="list">${activePersons().map(p => `<button class="drow" data-act="personEdit" data-id="${p.id}">${dot(p, 'lg')}<div class="dmain"><b>${esc(p.name)}</b><small>${p.admin ? 'Initiator' : 'Mitglied'}</small></div>${ic('right')}</button>`).join('')}
    <button class="drow newrow" data-act="newPerson">${ic('plus')}<div class="dmain"><b>Neue Person</b></div></button></div>
    ${arch.length ? `<div class="field"><span class="flabel">Archiviert</span><div class="list">${arch.map(p => `<div class="drow">${dot(p)}<div class="dmain"><b>${esc(p.name)}</b></div><button class="btn ghost sm" data-act="personRestore" data-id="${p.id}">Wiederherstellen</button></div>`).join('')}</div></div>` : ''}
    <p class="help">Personen sind Köche und Teilnehmer zugleich. Archivierte Personen bleiben im Rückblick sichtbar.</p>` };
}
function sheetPerson(a) {
  const p = person(a.id); if (!p) return { title: 'Person', body: '' };
  return { title: p.name || 'Neue Person', body: `
    <div class="field"><label for="person-name">Name</label><input class="inp" id="person-name" value="${esc(p.name)}" data-in="personName" data-id="${p.id}" placeholder="Vorname" autocomplete="off"></div>
    <div class="field"><span class="flabel">Figur</span><div class="figs">${[['f', 'Frau'], ['m', 'Mann'], ['n', 'neutral']].map(([v, l]) => `<button class="sw ${(p.fig || 'n') === v ? 'on' : ''}" data-act="figure" data-id="${p.id}" data-v="${v}" aria-pressed="${(p.fig || 'n') === v}"><span class="dot lg" style="--c:${p.color}">${figSvg(Object.assign({}, p, { fig: v }))}</span>${l}</button>`).join('')}</div></div>
    <div class="field"><span class="flabel">Farbe</span><div class="swatches">${COLORS.map(([n, c]) => { const used = activePersons().find(q => q.id !== p.id && q.color === c);
      return `<button class="sw ${p.color === c ? 'on' : ''}" data-act="color" data-id="${p.id}" data-c="${c}" style="--c:${c}" aria-pressed="${p.color === c}"><span class="c"></span>${n}${used ? `<small>auch ${esc(used.name)}</small>` : ''}</button>`; }).join('')}</div></div>
    <div class="field"><span class="flabel">Rolle</span><p class="help"><b>${p.admin ? 'Initiator' : 'Mitglied'}</b>. Rollen vergibt ein Initiator unter Menü → Verwaltung.</p></div>
    ${p.id !== ui.me && p.name ? `<button class="btn ghost sm" data-act="personArchive" data-id="${p.id}">Archivieren</button>` : ''}
    <button class="btn wide" data-act="close">Fertig</button>` };
}

function sheetCategories() {
  return { title: 'Kategorien', body: `${state.categories.map(c => `<div class="card plist">
      <input class="inp" value="${esc(c.name)}" data-in="catName" data-c="${c.id}" aria-label="Name der Kategorie" style="font-weight:700">
      <div class="chips">${(c.values || []).map(v => `<span class="chip">${esc(v)}<button class="xbtn" data-act="catDelVal" data-c="${c.id}" data-v="${esc(v)}" aria-label="${esc(v)} entfernen">${ic('x')}</button></span>`).join('')}</div>
      <div class="addrow"><input class="inp" id="cat-new-${c.id}" placeholder="Neue Ausprägung" data-enter="catAddVal" data-c="${c.id}" autocomplete="off"><button class="btn ghost" data-act="catAddVal" data-c="${c.id}">Hinzufügen</button></div>
    </div>`).join('')}
    <button class="btn ghost" data-act="catAdd">${ic('plus')} Kategorie hinzufügen</button>
    <p class="help">Ein Gericht hat je Kategorie genau eine Ausprägung. Desserts haben keine Kategorien.</p>` };
}

function sheetReview() {
  const past = Object.keys(state.days).filter(dt => dt < TODAY && hasPlan(state.days[dt])).sort().reverse();
  const weeks = []; past.forEach(dt => { const w = mondayOf(dt); let g = weeks.find(x => x.w === w); if (!g) weeks.push(g = { w, days: [] }); g.days.push(dt); });
  return { title: 'Rückblick', body: `<p class="help">Antippen öffnet den Tag zur Korrektur.</p>
    ${weeks.map(g => `<div class="field"><span class="flabel">KW ${kw(g.w)} · ${fmtShort(g.w)} – ${fmtFull(addDays(g.w, 6))}</span><div class="list">${g.days.sort().map(dt => { const d = state.days[dt];
      return `<button class="drow" data-act="reviewDay" data-date="${dt}"><span class="rvd">${DOWS[wd(dt)]} ${fmtShort(dt)}</span>${KIND[d.kind].cook ? dot(person(d.cook)) : dot(null)}<div class="dmain"><b>${esc(dayWhat(dt, d))}</b><small>${KIND[d.kind].cook ? esc(pn(d.cook) || 'ohne Koch') : KIND[d.kind].l}${d.place === 'out' ? ' · auswärts' : ''}</small></div>${d.snap?.dish != null ? `<span class="grade ${gcls(d.snap.dish)}">⌀ ${num1(d.snap.dish)}</span>` : ''}</button>`; }).join('')}</div></div>`).join('') || '<p class="help">Noch keine vergangenen Einträge.</p>'}` };
}

function sheetPlan() {
  const ws = [...Array(8)].map((_, i) => addDays(mondayOf(TODAY), i * 7));
  return { title: 'Planung', body: `<div class="list">${ws.map(w => { const n = [...Array(7)].filter((_, i) => hasPlan(state.days[addDays(w, i)])).length;
    return `<button class="drow" data-act="planGo" data-w="${w}"><div class="dmain"><b>KW ${kw(w)}${w === mondayOf(TODAY) ? ' · diese Woche' : ''}</b><small>${fmtShort(w)} – ${fmtFull(addDays(w, 6))}</small></div><span class="muted">${n} von 7 geplant</span>${ic('right')}</button>`; }).join('')}</div>
    <p class="help">Öffnet die Woche im Kalender. Dort lassen sich alle Tage direkt bearbeiten.</p>` };
}

const inviteLink = () => `${location.origin}${location.pathname}#${state.family.code}`;
function sheetSettings() {
  setTimeout(drawQr, 0);
  return { title: 'Einstellungen', body: `
    <div class="field"><span class="flabel">Ich bin</span><div class="chips">${activePersons().map(p => `<button class="chip ${ui.me === p.id ? 'on' : ''}" data-act="setMe" data-pid="${p.id}">${dot(p)} ${esc(p.name)}</button>`).join('')}</div></div>
    <div class="field"><span class="flabel">Darstellung</span><div class="seg">${[['light', 'Hell'], ['dark', 'Dunkel'], ['auto', 'Automatisch']].map(([v, l]) => `<button class="${ui.theme === v ? 'on' : ''}" data-act="theme" data-v="${v}">${l}</button>`).join('')}</div></div>
    <div class="field"><label for="def-time">Standard-Uhrzeit für neue Tage</label><input class="inp" type="time" id="def-time" value="${state.family.defaultTime}" data-in="defTime"></div>
    <div class="field"><label for="fam-name">Familienname</label><input class="inp" id="fam-name" value="${esc(state.family.name)}" data-in="famName"></div>
    <div class="field"><span class="flabel">Einladung</span><div class="card plist"><span class="code" id="inv-code">${esc(state.family.code)}</span>
      <div class="qr" id="qr" aria-label="QR-Code mit dem Einladungslink"></div>
      <input class="inp" id="inv-link" readonly value="${esc(inviteLink())}" aria-label="Einladungslink">
      <div class="row">${navigator.share ? `<button class="btn" data-act="shareInvite">${ic('share')} Einladung teilen</button>` : ''}<button class="btn ghost sm" data-act="copy" data-t="inv-link">Link kopieren</button><button class="btn ghost sm" data-act="copy" data-t="inv-code">Code kopieren</button></div>
      <p class="help">Neue Geräte öffnen den Link oder scannen den QR-Code mit der Kamera. Alternativ den Code in der App unter „Mit Einladungscode beitreten“ eingeben.</p></div></div>` };
}
function drawQr() {
  const el = document.getElementById('qr'); if (!el || el.dataset.done) return;
  const go = () => { el.innerHTML = ''; new window.QRCode(el, { text: inviteLink(), width: 180, height: 180, correctLevel: window.QRCode.CorrectLevel.M }); el.dataset.done = '1'; };
  if (window.QRCode) return go();
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  s.onload = () => { if (document.getElementById('qr') === el) go(); };
  s.onerror = () => { el.innerHTML = '<p class="help">QR-Code ist ohne Netz nicht verfügbar.</p>'; };
  document.head.appendChild(s);
}

function exportText(a) {
  const ds = Object.keys(state.days).filter(dt => dt >= a.from && dt <= a.to).sort();
  const csv = rows => rows.map(r => r.map(v => { v = v == null ? '' : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(';')).join('\r\n');
  const st = stats();
  if (a.file === 'tage') return csv([['Datum', 'Wochentag', 'Ort', 'Art', 'Koch', 'Uhrzeit', 'Gericht', 'Dessert', 'Teilnehmer', 'Gäste', 'Hinweise'],
    ...ds.map(dt => { const d = state.days[dt]; return [fmtFull(dt), DOW[wd(dt)], d.place === 'out' ? 'auswärts' : '@home', KIND[d.kind].l, pn(d.cook), d.time, dn(d.dish), dn(d.dessert), Object.entries(d.part).filter(([, v]) => v.s === 'yes').map(([k, v]) => pn(k) + (v.t ? ` (${v.t})` : '')).join(', '), d.guests, d.notes]; })]);
  if (a.file === 'gerichte') return csv([['Name', 'Typ', ...state.categories.map(c => c.name), 'Durchschnittsnote', 'Anzahl Noten', 'Häufigkeit', 'Zuletzt'],
    ...state.dishes.filter(d => d.name).map(d => { const av = avgOf(d); return [d.name, d.type === 'main' ? 'Gericht' : 'Dessert', ...state.categories.map(c => d.cat?.[c.id] || ''), av != null ? num1(av) : '', Object.keys(d.ratings || {}).length, st[d.id]?.n || 0, st[d.id] ? fmtFull(st[d.id].last) : '']; })]);
  if (a.file === 'noten') return csv([['Gericht', 'Person', 'Note'], ...state.dishes.flatMap(d => Object.entries(d.ratings || {}).map(([p, n]) => [d.name, pn(p), n]))]);
  if (a.file === 'einkauf') return csv([['Datum', 'Eintrag', 'Erledigt', 'Übernommen von', 'Art'], ...ds.flatMap(dt => shopArr(state.days[dt]).map(s => [fmtFull(dt), s.text, s.done ? 'ja' : 'nein', pn(s.by), s.how ? HOW[s.how] : '']))]);
  return csv([['Name', 'Figur', 'Farbe', 'Rolle', 'Archiviert'], ...state.persons.map(p => [p.name, { f: 'Frau', m: 'Mann', n: 'neutral' }[p.fig || 'n'], (COLORS.find(c => c[1] === p.color) || [p.color])[0], p.admin ? 'Initiator' : 'Mitglied', p.archived ? 'ja' : 'nein'])]);
}
function sheetExport(a) {
  const files = [['tage', 'Tage'], ['gerichte', 'Gerichte'], ['noten', 'Noten'], ['einkauf', 'Einkauf'], ['personen', 'Personen']];
  return { title: 'CSV-Export', body: `
    <div class="row"><div class="field"><label for="ex-from">Von</label><input class="inp" type="date" id="ex-from" value="${a.from}" data-in="exFrom"></div><div class="field"><label for="ex-to">Bis</label><input class="inp" type="date" id="ex-to" value="${a.to}" data-in="exTo"></div></div>
    <div class="seg sm">${files.map(([v, l]) => `<button class="${a.file === v ? 'on' : ''}" data-act="exportFile" data-v="${v}">${l}</button>`).join('')}</div>
    <div class="row"><button class="btn" data-act="exportDl">${ic('download')} ${a.file}.csv speichern</button><button class="btn ghost sm" data-act="copy" data-t="csv-out">Inhalt kopieren</button></div>
    <details><summary>Vorschau</summary><textarea class="inp mono" id="csv-out" readonly style="margin-top:8px">${esc(exportText(a))}</textarea></details>
    <p class="help">Trennzeichen ist das Semikolon, damit die Datei im deutschen Excel sauber aufgeht. Der Zeitraum gilt für Tage und Einkauf.</p>` };
}
function sheetBackup() {
  const lb = lsGet('fm-lastBackup');
  return { title: 'Sicherung', body: `
    <dl class="kv"><dt>Tage</dt><dd>${Object.keys(state.days).length}</dd><dt>Gerichte und Desserts</dt><dd>${state.dishes.length}</dd><dt>Personen</dt><dd>${state.persons.length}</dd><dt>Letzte Sicherung auf diesem Gerät</dt><dd>${lb ? fmtFull(lb) : 'noch nie'}</dd></dl>
    <button class="btn" data-act="backupNow">${ic('save')} Sicherung herunterladen</button>
    <p class="help">Speichert alle Daten der Familie als Datei familienmahlzeit-${TODAY}.json, z. B. in iCloud Drive. Wiederherstellen kann ein Initiator unter Menü → Verwaltung.</p>` };
}

function sheetAdmin(a) {
  const me = person(ui.me);
  if (!me || !me.admin) return { title: 'Verwaltung', body: `<p>Die Verwaltung ist Initiatoren vorbehalten. Du bist als <b>${esc(me ? me.name : '–')}</b> angemeldet.</p>
    <p class="help">Initiator: ${esc(state.persons.filter(p => p.admin).map(p => p.name).join(', '))}.</p>` };
  if (!a.unlocked) return { title: 'Verwaltung', body: `<div class="field"><label for="pin">Admin-PIN</label><input class="inp" id="pin" type="password" inputmode="numeric" maxlength="8" autocomplete="off" data-enter="adminUnlock" style="max-width:180px"></div>
    <button class="btn" data-act="adminUnlock">Entsperren</button>` };
  return { title: 'Verwaltung', body: `
    <div class="list">
      <button class="drow" data-act="menu" data-v="delete">${ic('x')}<div class="dmain"><b>Daten nach Zeitraum löschen</b><small>Ein Jahr oder alles vor einem Datum</small></div>${ic('right')}</button>
      <button class="drow" data-act="menu" data-v="restore">${ic('reset')}<div class="dmain"><b>Sicherung wiederherstellen</b><small>Ersetzt alle Daten durch eine Sicherung</small></div>${ic('right')}</button>
      <button class="drow" data-act="newCode">${ic('reset')}<div class="dmain"><b>Einladungscode erneuern</b><small>Aktuell ${esc(state.family.code)}. Beigetretene Geräte bleiben drin.</small></div></button>
    </div>
    <div class="field"><span class="flabel">Initiatoren</span><div class="card plist">${activePersons().map(p => `<div class="prow">${dot(p)}<span class="pname">${esc(p.name)}</span><button class="switch ${p.admin ? 'on' : ''}" data-act="toggleAdmin" data-pid="${p.id}" role="switch" aria-checked="${!!p.admin}" aria-label="${esc(p.name)} ist Initiator"><span></span></button></div>`).join('')}</div>
      <p class="help">Es muss immer mindestens einen Initiator geben.</p></div>
    <div class="field"><span class="flabel">Geräte</span><div class="list">${state.devices.map(dv => `<div class="drow">${dot(person(dv.pid))}<div class="dmain"><b>${esc(dv.name || 'Gerät')}${dv.id === uid ? ' (dieses Gerät)' : ''}</b><small>${dv.last === TODAY ? 'heute aktiv' : dv.last ? 'zuletzt ' + fmtAuto(dv.last) : ''}</small></div>${dv.id !== uid ? `<button class="btn ghost sm" data-act="deviceDel" data-id="${dv.id}">Entfernen</button>` : ''}</div>`).join('')}</div></div>
    <div class="field"><label for="new-pin">Admin-PIN ändern</label><div class="row"><input class="inp" id="new-pin" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password" style="max-width:180px"><button class="btn ghost" data-act="pinChange">Speichern</button></div></div>` };
}
function delTargets(a) { return Object.keys(state.days).filter(dt => a.m === 'year' ? dt.startsWith(a.year + '-') : (a.before && dt < a.before)).sort(); }
function sheetDelete(a) {
  const years = [...new Set(Object.keys(state.days).map(d => d.slice(0, 4)))].sort();
  if (!a.year || !years.includes(a.year)) a.year = years[0];
  const t = delTargets(a);
  return { title: 'Daten nach Zeitraum löschen', body: `
    <div class="seg"><button class="${a.m === 'year' ? 'on' : ''}" data-act="delMode" data-v="year">Ein Jahr</button><button class="${a.m === 'before' ? 'on' : ''}" data-act="delMode" data-v="before">Alles vor Datum</button></div>
    ${a.m === 'year' ? (years.length ? `<div class="field"><label for="del-year">Jahr</label><select class="inp" id="del-year" data-ch="delYear" style="max-width:180px">${years.map(y => `<option ${y === a.year ? 'selected' : ''}>${y}</option>`).join('')}</select></div>` : '')
      : `<div class="field"><label for="del-before">Alles vor dem</label><input class="inp" type="date" id="del-before" value="${a.before || ''}" data-ch="delBefore"></div>`}
    <div class="note">${t.length ? `Betroffen: <b>${t.length} Tage</b> vom ${fmtFull(t[0])} bis ${fmtFull(t[t.length - 1])} mit Teilnahmen, Einkäufen und gespeicherten Noten.` : 'In diesem Zeitraum gibt es keine Einträge.'} Gerichte, Desserts, Personen und Noten bleiben erhalten.</div>
    <button class="btn ghost sm" data-act="backupNow">${ic('save')} Vorher Sicherung herunterladen</button>
    <div class="field"><label for="del-typed">Zum Bestätigen LÖSCHEN eintippen</label><input class="inp" id="del-typed" data-in="delTyped" autocomplete="off" autocapitalize="characters" style="max-width:220px" value="${esc(a.typed || '')}"></div>
    <button class="btn danger" id="del-go" data-act="delGo" ${t.length && a.typed === 'LÖSCHEN' ? '' : 'disabled'}>${t.length} Tage endgültig löschen</button>` };
}
function sheetRestore(a) {
  return { title: 'Sicherung wiederherstellen', body: `
    <div class="field"><label for="rs-file">Sicherungsdatei wählen</label><input id="rs-file" type="file" accept=".json,application/json" data-ch="restoreFile"></div>
    ${a.info ? `<div class="note">${a.info}</div>${a.ok ? `<button class="btn danger" data-act="restoreDo">Alle Daten ersetzen</button>` : ''}` : '<p class="help">Wähle eine Datei familienmahlzeit-JJJJ-MM-TT.json. Vor dem Ersetzen siehst du, was darin steckt.</p>'}` };
}
function sheetCal(a) {
  const dts = a.dates;
  return { title: dts.length > 1 ? 'Meine Woche in den Kalender' : 'In Kalender übernehmen', body: `
    <div class="list">${dts.map(dt => { const e = evInfo(dt); return `<div class="drow">${ic('cal')}<div class="dmain"><b>${esc(e.title)}</b><small>${e.when} · ${e.place} · Erinnerung 90 und 60 Min. vorher</small></div></div>`; }).join('')}</div>
    <button class="btn wide" data-act="calDo">${dts.length > 1 ? `${dts.length} Termine übernehmen` : 'Termin übernehmen'}</button>
    <p class="help">Es wird eine Kalenderdatei geöffnet. Auf iPhone und iPad bietet der Kalender dann „Hinzufügen“ an. Ändert sich danach etwas, zeigt die App „Kalender veraltet“.</p>` };
}
function sheetConfirm(a) {
  return { title: a.title || 'Bist du sicher?', body: `<p style="margin:0">${a.text}</p><div class="row"><button class="btn ${a.danger ? 'danger' : ''}" data-act="confirmOk">${a.ok || 'OK'}</button><button class="btn ghost" data-act="close">Abbrechen</button></div>` };
}

const SHEETS = { day: sheetDay, mypart: sheetMyPart, pick: sheetPick, dish: sheetDish, claim: sheetClaim, welcome: sheetWelcome, persons: sheetPersons, person: sheetPerson, categories: sheetCategories, review: sheetReview, plan: sheetPlan, settings: sheetSettings, export: sheetExport, backup: sheetBackup, admin: sheetAdmin, delete: sheetDelete, restore: sheetRestore, cal: sheetCal, confirm: sheetConfirm };

/* ---------- Rendern ---------- */
const appEl = document.getElementById('app'), sheetsEl = document.getElementById('sheets'), toastEl = document.getElementById('toast');
function applyTheme() {
  const r = document.documentElement;
  if (ui.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', ui.theme);
}
let renderPending = false;
// Änderungen von anderen Geräten nicht mitten ins Tippen zeichnen: warten, bis das Eingabefeld verlassen wird
function requestRender() {
  const a = document.activeElement;
  if (a && a.matches && a.matches('input:not([type=file]), textarea, select') && (appEl.contains(a) || sheetsEl.contains(a))) { renderPending = true; return; }
  render();
}
document.addEventListener('focusout', () => setTimeout(() => { if (renderPending) { renderPending = false; requestRender(); } }, 0));

function render() {
  applyTheme();
  if (ui.phase !== 'ready') {
    sheetsEl.innerHTML = '';
    const body = ui.phase === 'onboard' ? onboardView() : `<div class="center"><p>${ui.phase === 'loading' ? 'Verbinde …' : 'Lade die Daten der Familie …'}</p></div>`;
    appEl.innerHTML = header() + `<main class="gutter">${body}</main>`;
    document.body.classList.remove('locked');
    return;
  }
  const scroll = [...sheetsEl.querySelectorAll('.sheet-body')].map(e => e.scrollTop);
  const view = { week: weekView, need: needView, dishes: dishesView, menu: menuView }[ui.tab]();
  appEl.innerHTML = header() + `<main class="gutter">${view}</main>` + tabbar();
  sheetsEl.innerHTML = sheets.map((s, i) => {
    const c = SHEETS[s.type](s.a), closable = c.closable !== false;
    return `<div class="sheet-wrap" style="z-index:${100 + i}"><div class="backdrop" ${closable ? 'data-act="close"' : ''}></div>
      <section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(c.title)}"><header class="sheet-head"><h2>${esc(c.title)}</h2>${closable ? `<button class="icon-btn" data-act="close" aria-label="Schließen">${ic('x')}</button>` : ''}</header>
      <div class="sheet-body">${c.body}</div></section></div>`;
  }).join('');
  sheetsEl.querySelectorAll('.sheet-body').forEach((e, i) => { if (scroll[i] != null) e.scrollTop = scroll[i]; });
  document.body.classList.toggle('locked', sheets.length > 0);
}
function apply() { commit(); render(); }
function openSheet(type, a = {}) { sheets.push({ type, a }); render(); }
function closeSheet() {
  const s = sheets.pop(); if (!s) return;
  if (s.type === 'person') { const p = person(s.a.id); if (p && !p.name.trim()) state.persons = state.persons.filter(x => x !== p); }
  if (s.type === 'dish') { const d = dish(s.a.id); if (d && !d.name.trim()) { state.dishes = state.dishes.filter(x => x !== d); Object.values(state.days).forEach(day => { if (day.dish === d.id) day.dish = null; if (day.dessert === d.id) day.dessert = null; }); } }
  apply();
}
let toastT;
function toast(t) { toastEl.textContent = t; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 2600); }
function confirmSheet(o) { openSheet('confirm', o); }
const cfgOf = scope => scope === 'tab' ? ui.dlist : top().a;
function setPart(date, pid, s) {
  const d = getDay(date, true);
  if (s === 'open') delete d.part[pid];
  else { d.part[pid] = Object.assign({}, d.part[pid], { s }); if (s !== 'yes') delete d.part[pid].t; }
}

/* ---------- Aktionen ---------- */
const acts = {
  close() { if (top()?.type === 'welcome' && !ui.me) return; closeSheet(); },
  tab({ v }) { ui.tab = v; sheets = sheets.filter(s => s.type === 'welcome'); render(); window.scrollTo(0, 0); },
  wk({ d }) { ui.week = addDays(ui.week, +d); render(); },
  today() { ui.week = mondayOf(TODAY); render(); },
  switchMe() { openSheet('welcome', { switch: true }); },
  setMe({ pid }) {
    ui.me = pid; lsSet('fm-me', pid);
    updateDoc(doc(famRef(), 'devices', uid), { pid, name: deviceName(pn(pid)) }).catch(() => {});
    if (top()?.type === 'welcome') sheets.pop();
    render(); toast(`Hallo ${pn(pid)}`);
  },
  openDay({ date }) { openSheet('day', { date }); },
  togglePart({ date }) {
    if (!ui.me) return;
    const next = { open: 'yes', yes: 'no', no: 'open' }[myStatus(date)];
    setPart(date, ui.me, next); apply(); toast(`${DOWS[wd(date)]} ${fmtShort(date)}: ${PART[next]}`);
  },
  myPart({ date }) { if (ui.me) openSheet('mypart', { date }); },
  partSet({ date, pid, s }) { setPart(date, pid, s); apply(); },
  partTimeClear({ date }) { const v = state.days[date]?.part[ui.me]; if (v) delete v.t; apply(); },
  g({ date, d }) { if (date < TODAY && !top()?.a.edit) return; const day = getDay(date, true); day.guests = clamp(day.guests + +d, 0, 9); apply(); },
  place({ date, v }) { getDay(date, true).place = v; apply(); },
  kind({ date, v }) {
    const d = getDay(date, true); d.kind = v;
    if (!KIND[v].cook) d.cook = null;
    if (v === 'self') { d.dish = null; d.dessert = null; }
    if (v !== 'surprise') d.surpriseHidden = false;
    apply();
  },
  cook({ date, pid }) {
    const d = getDay(date, true); d.cook = d.cook === pid ? null : pid;
    if (d.cook && (!d.part[pid] || d.part[pid].s === 'open')) d.part[pid] = { s: 'yes' };
    apply();
  },
  toggleHide({ date }) { const d = getDay(date, true); d.surpriseHidden = !d.surpriseHidden; apply(); },
  pick({ date, slot }) { openSheet('pick', { date, slot, type: slot === 'dish' ? 'main' : 'dessert', q: '', sort: 'alpha', filter: {} }); },
  pickSel({ id }) { const a = top().a; getDay(a.date, true)[a.slot] = id; snapDay(a.date); sheets.pop(); apply(); },
  pickNone() { const a = top().a; getDay(a.date, true)[a.slot] = null; snapDay(a.date); sheets.pop(); apply(); },
  pickNew() {
    const a = top().a, d = { id: uid6(), type: a.type, name: a.q.trim(), desc: '', photo: null, cat: {}, ratings: {}, archived: false, ord: Date.now() };
    state.dishes.push(d); getDay(a.date, true)[a.slot] = d.id; sheets.pop(); commit(); openSheet('dish', { id: d.id });
  },
  sort({ scope, v }) { cfgOf(scope).sort = v; render(); },
  filt({ scope, c, v }) { const f = cfgOf(scope).filter; if (f[c] === v) delete f[c]; else f[c] = v; render(); },
  dtype({ v }) { ui.dlist.type = v; ui.dlist.filter = {}; render(); },
  openDish({ id }) { openSheet('dish', { id }); },
  newDish() { const d = { id: uid6(), type: ui.dlist.type, name: '', desc: '', photo: null, cat: {}, ratings: {}, archived: false, ord: Date.now() }; state.dishes.push(d); openSheet('dish', { id: d.id }); const el = document.getElementById('dish-name'); if (el) el.focus(); },
  rate({ id, n }) {
    if (!ui.me) return;
    const d = dish(id); n = +n; d.ratings = d.ratings || {};
    if (d.ratings[ui.me] === n) delete d.ratings[ui.me]; else d.ratings[ui.me] = n;
    const k = d.type === 'main' ? 'dish' : 'dessert';
    if (state.days[TODAY]?.[k] === id) snapDay(TODAY);
    apply();
  },
  dishCat({ id, c, v }) { const d = dish(id); d.cat = d.cat || {}; if (d.cat[c] === v) delete d.cat[c]; else d.cat[c] = v; apply(); },
  photoDel({ id }) { dish(id).photo = null; apply(); },
  dishArchive({ id }) { confirmSheet({ title: 'Archivieren?', text: `„${esc(dn(id))}“ erscheint dann nicht mehr in der Auswahl. Der Rückblick bleibt vollständig.`, ok: 'Archivieren', fn: () => { dish(id).archived = true; sheets = sheets.filter(s => !(s.type === 'dish' && s.a.id === id)); toast('Archiviert'); } }); },
  dishRestore({ id }) { dish(id).archived = false; apply(); },
  shopToggle({ date, id }) { const it = getDay(date, true).shop[id]; if (it) { it.done = !it.done; apply(); } },
  shopDel({ date, id }) { delete getDay(date, true).shop[id]; apply(); },
  shopAdd({ date }) {
    const el = document.getElementById('shop-new'), t = el && el.value.trim(); if (!t) return;
    getDay(date, true).shop[uid6()] = { text: t, done: false, by: null, how: null, ord: Date.now() }; apply();
    const n = document.getElementById('shop-new'); if (n) n.focus();
  },
  claim({ date, id }) { if (ui.me) openSheet('claim', { date, id }); },
  claimSet({ how }) { const a = top().a, it = state.days[a.date]?.shop?.[a.id]; if (it) { it.by = ui.me; it.how = how; } sheets.pop(); apply(); toast('Übernommen'); },
  claimClear() { const a = top().a, it = state.days[a.date]?.shop?.[a.id]; if (it) { it.by = null; it.how = null; } sheets.pop(); apply(); },
  cal({ date }) { openSheet('cal', { dates: [date] }); },
  calWeek() {
    const dts = [...Array(7)].map((_, i) => addDays(ui.week, i)).filter(calRelevant);
    if (!dts.length) { toast('Keine Kochtage oder Zusagen ab heute in dieser Woche'); return; }
    openSheet('cal', { dates: dts });
  },
  calDo() {
    const dts = top().a.dates;
    download(dts.length > 1 ? `familienmahlzeit-kw${kw(dts[0])}.ics` : `familienmahlzeit-${dts[0]}.ics`, ics(dts), 'text/calendar');
    dts.forEach(dt => { calSync[ui.me + '|' + dt] = calSig(dt); });
    lsSet('fm-cal', JSON.stringify(calSync));
    sheets.pop(); render();
  },
  menu({ v }) {
    if (v === 'dishesTab') { ui.tab = 'dishes'; sheets = []; render(); return; }
    const a = v === 'export' ? { from: Object.keys(state.days).sort()[0] || TODAY, to: TODAY, file: 'tage' } : v === 'delete' ? { m: 'year', typed: '' } : {};
    openSheet(v, a);
  },
  newPerson() {
    const used = new Set(activePersons().map(p => p.color)), c = (COLORS.find(x => !used.has(x[1])) || COLORS[0])[1];
    const p = { id: uid6(), name: '', fig: 'n', color: c, admin: false, archived: false, ord: Date.now() }; state.persons.push(p); openSheet('person', { id: p.id });
    const el = document.getElementById('person-name'); if (el) el.focus();
  },
  personEdit({ id }) { openSheet('person', { id }); },
  color({ id, c }) { person(id).color = c; apply(); },
  figure({ id, v }) { person(id).fig = v; apply(); },
  personArchive({ id }) { confirmSheet({ title: 'Archivieren?', text: `${esc(pn(id))} erscheint nicht mehr in Auswahl und Teilnahme. Der Rückblick bleibt erhalten.`, ok: 'Archivieren', fn: () => { person(id).archived = true; sheets = sheets.filter(s => !(s.type === 'person' && s.a.id === id)); } }); },
  personRestore({ id }) { person(id).archived = false; apply(); },
  catAddVal({ c }) {
    const el = document.getElementById('cat-new-' + c), v = el && el.value.trim(); if (!v) return;
    const cat = state.categories.find(x => x.id === c); cat.values = cat.values || []; if (!cat.values.includes(v)) cat.values.push(v); apply();
    const n = document.getElementById('cat-new-' + c); if (n) n.focus();
  },
  catDelVal({ c, v }) {
    const cat = state.categories.find(x => x.id === c), n = state.dishes.filter(d => d.cat?.[c] === v).length;
    confirmSheet({ title: 'Ausprägung entfernen?', text: `„${esc(v)}“ wird entfernt.${n ? ` ${n} ${n === 1 ? 'Gericht verliert' : 'Gerichte verlieren'} diese Zuordnung.` : ''}`, ok: 'Entfernen', fn: () => { cat.values = cat.values.filter(x => x !== v); state.dishes.forEach(d => { if (d.cat?.[c] === v) delete d.cat[c]; }); } });
  },
  catAdd() { state.categories.push({ id: 'c' + uid6(), name: 'Neue Kategorie', values: [], ord: Date.now() }); apply(); },
  reviewDay({ date }) { openSheet('day', { date, edit: true }); },
  planGo({ w }) { ui.week = w; ui.tab = 'week'; sheets = []; render(); window.scrollTo(0, 0); },
  theme({ v }) { ui.theme = v; lsSet('fm-theme', v); render(); },
  copy({ t }) {
    const el = document.getElementById(t); if (!el) return;
    const text = el.value != null ? el.value : el.textContent;
    const fallback = () => { if (el.select) { el.focus(); el.select(); } toast('Text markiert, bitte manuell kopieren'); };
    try { navigator.clipboard.writeText(text).then(() => toast('Kopiert'), fallback); } catch (e) { fallback(); }
  },
  shareInvite() { navigator.share({ title: `${APP_NAME}: ${state.family.name}`, text: `Tritt unserer Familie in ${APP_NAME} bei. Code: ${state.family.code}`, url: inviteLink() }).catch(() => {}); },
  exportFile({ v }) { top().a.file = v; render(); },
  exportDl() { const a = top().a; download(`${a.file}.csv`, '﻿' + exportText(a), 'text/csv;charset=utf-8'); },
  backupNow() { downloadBackup(); render(); },
  async adminUnlock() {
    const el = document.getElementById('pin'); if (!el) return;
    if (await pinHash(el.value) === state.family.pinHash) { top().a.unlocked = true; render(); } else toast('PIN stimmt nicht');
  },
  async pinChange() {
    const el = document.getElementById('new-pin'), v = el && el.value.trim();
    if (!/^\d{4,8}$/.test(v || '')) { toast('Bitte 4 bis 8 Ziffern eingeben'); return; }
    state.family.pinHash = await pinHash(v); apply(); toast('Admin-PIN geändert');
  },
  newCode() {
    confirmSheet({ title: 'Code erneuern?', text: 'Der alte Code und alte Einladungslinks funktionieren danach nicht mehr. Bereits beigetretene Geräte bleiben drin.', ok: 'Erneuern', fn: () => {
      const old = state.family.code, code = newCode();
      const b = writeBatch(db);
      b.update(famRef(), { code });
      b.set(doc(db, 'invites', code), { fid });
      b.delete(doc(db, 'invites', old));
      b.commit().then(() => toast('Neuer Code: ' + code)).catch(e => { console.error(e); toast('Code konnte nicht erneuert werden'); });
    } });
  },
  toggleAdmin({ pid }) {
    const p = person(pid);
    if (p.admin && state.persons.filter(x => x.admin && !x.archived).length === 1) { toast('Mindestens ein Initiator ist nötig'); return; }
    p.admin = !p.admin; apply();
  },
  deviceDel({ id }) {
    const dv = state.devices.find(x => x.id === id);
    confirmSheet({ title: 'Gerät entfernen?', text: `„${esc(dv.name || 'Gerät')}“ muss danach erneut mit dem Einladungscode beitreten.`, ok: 'Entfernen', danger: true, fn: () => { deleteDoc(doc(famRef(), 'devices', id)).then(() => toast('Gerät entfernt')).catch(() => toast('Entfernen hat nicht geklappt')); } });
  },
  delMode({ v }) { top().a.m = v; render(); },
  delGo() {
    const a = top().a, t = delTargets(a); if (a.typed !== 'LÖSCHEN' || !t.length) return;
    t.forEach(dt => delete state.days[dt]); sheets.pop(); apply(); toast(`${t.length} Tage gelöscht`);
  },
  restoreDo() {
    const o = top().a.parsed;
    confirmSheet({ title: 'Wirklich ersetzen?', text: 'Alle aktuellen Daten der Familie werden durch die Sicherung ersetzt. Einladungscode und Admin-PIN bleiben.', ok: 'Ersetzen', danger: true, fn: () => {
      state.family.name = o.family?.name || state.family.name;
      state.family.defaultTime = o.family?.defaultTime || state.family.defaultTime;
      state.persons = o.persons; state.categories = o.categories; state.dishes = o.dishes; state.days = o.days;
      if (!person(ui.me)) { ui.me = null; lsSet('fm-me', null); }
      sheets = []; if (!ui.me) sheets.push({ type: 'welcome', a: {} });
      toast('Sicherung wiederhergestellt');
    } });
  },
  confirmOk() { const s = sheets.pop(); s.a.fn(); apply(); },
  leave() {
    confirmSheet({ title: 'Gerät abmelden?', text: `Dieses Gerät verlässt die ${esc(state.family.name)}. Die Daten der Familie bleiben erhalten. Zum Wiedereinstieg brauchst du den Einladungscode.`, ok: 'Abmelden', danger: true, fn: () => {
      deleteDoc(doc(famRef(), 'devices', uid)).catch(() => {});
      lostAccess(); ui.ob.err = '';
    } });
  },
  // Gründen und Beitreten
  obSet({ k, v }) { ui.ob[k] = v; if (k === 'step') ui.ob.err = ''; render(); },
  obCreate() { createFamily(); },
  obJoin() { joinFamily(); },
};

/* Eingaben ohne Neuaufbau, damit Fokus und Tastatur bleiben */
const inputs = {
  ob(v, { k }) { ui.ob[k] = v; },
  dayTime(v, { date }) { getDay(date, true).time = v || state.family.defaultTime; scheduleCommit(); },
  dayNotes(v, { date }) { getDay(date, true).notes = v; scheduleCommit(); },
  partTime(v, { date, pid }) { const p = getDay(date, true).part[pid]; if (p) { if (v) p.t = v; else delete p.t; scheduleCommit(); } },
  listQ(v, { scope }) { const c = cfgOf(scope); c.q = v; const el = document.getElementById(scope + '-list'); if (el) el.innerHTML = dishList(c, scope); },
  dishName(v, { id }) { dish(id).name = v; scheduleCommit(); },
  dishDesc(v, { id }) { dish(id).desc = v; scheduleCommit(); },
  personName(v, { id }) { person(id).name = v; scheduleCommit(); },
  catName(v, { c }) { state.categories.find(x => x.id === c).name = v; scheduleCommit(); },
  defTime(v) { if (v) { state.family.defaultTime = v; scheduleCommit(); } },
  famName(v) { if (v.trim()) { state.family.name = v; scheduleCommit(); } },
  exFrom(v) { const a = top().a; a.from = v; const el = document.getElementById('csv-out'); if (el) el.value = exportText(a); },
  exTo(v) { const a = top().a; a.to = v; const el = document.getElementById('csv-out'); if (el) el.value = exportText(a); },
  delTyped(v) { const a = top().a; a.typed = v.trim().toUpperCase(); const b = document.getElementById('del-go'); if (b) b.disabled = !(a.typed === 'LÖSCHEN' && delTargets(a).length); },
};
function parseBackup(text) {
  const o = JSON.parse(text);
  if (!o || !Array.isArray(o.persons) || !Array.isArray(o.dishes) || typeof o.days !== 'object') throw new Error('format');
  // Sicherungen aus dem Prototyp (Einkauf als Liste) in die Familienversion übernehmen
  for (const d of Object.values(o.days)) {
    if (Array.isArray(d.shop)) d.shop = Object.fromEntries(d.shop.map((s, i) => [s.id || uid6(), { text: s.text, done: !!s.done, by: s.by || null, how: s.how || null, ord: i }]));
    d.shop = d.shop || {}; d.part = d.part || {}; d.snap = d.snap || {};
  }
  o.persons.forEach((p, i) => { p.ord = p.ord ?? i; p.fig = p.fig || 'n'; });
  o.dishes.forEach((d, i) => { d.ord = d.ord ?? i; });
  o.categories = (o.categories || DEFAULT_CATS).map((c, i) => ({ ...c, ord: c.ord ?? i }));
  return o;
}
const changes = {
  photo(el, { id }) {
    const f = el.files && el.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { const img = new Image(); img.onload = () => {
      const s = Math.min(1, 480 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      dish(id).photo = c.toDataURL('image/jpeg', .72); apply(); toast(`Foto gespeichert (${Math.round(dish(id).photo.length * .75 / 1024)} KB)`);
    }; img.onerror = () => toast('Dieses Bild lässt sich nicht lesen'); img.src = r.result; };
    r.readAsDataURL(f);
  },
  delYear(el) { top().a.year = el.value; render(); },
  delBefore(el) { top().a.before = el.value; render(); },
  restoreFile(el) {
    const f = el.files && el.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const a = top().a;
      try { const o = parseBackup(String(r.result)); a.parsed = o; a.ok = true; a.info = `Gültige Sicherung${o.created ? ' vom ' + fmtFull(iso(new Date(o.created))) : ''}: ${Object.keys(o.days).length} Tage, ${o.dishes.length} Gerichte und Desserts, ${o.persons.length} Personen. Beim Wiederherstellen werden alle aktuellen Daten ersetzt.`; }
      catch (e) { a.ok = false; a.info = 'Das ist keine gültige Sicherungsdatei.'; }
      render();
    };
    r.readAsText(f);
  },
};

/* Ereignisse */
let lpTimer = null, lpFired = false;
document.addEventListener('pointerdown', e => {
  const el = e.target.closest('[data-lp]'); if (!el) return;
  lpFired = false; clearTimeout(lpTimer);
  lpTimer = setTimeout(() => { lpFired = true; acts[el.dataset.lp](el.dataset, el); }, 480);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(t => document.addEventListener(t, () => clearTimeout(lpTimer), true));
document.addEventListener('contextmenu', e => { if (e.target.closest('[data-lp]')) e.preventDefault(); });
document.addEventListener('click', e => {
  if (lpFired) { lpFired = false; e.preventDefault(); return; }
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  const fn = acts[el.dataset.act]; if (!fn) return;
  e.preventDefault(); fn(el.dataset, el);
});
document.addEventListener('input', e => { const el = e.target.closest('[data-in]'); if (el && inputs[el.dataset.in]) inputs[el.dataset.in](el.value, el.dataset, el); });
document.addEventListener('change', e => { const el = e.target.closest('[data-ch]'); if (el && changes[el.dataset.ch]) changes[el.dataset.ch](el, el.dataset); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && sheets.length) { acts.close(); return; }
  if (e.key === 'Enter') {
    const el = e.target.closest('[data-enter]'); if (el) { e.preventDefault(); acts[el.dataset.enter](el.dataset, el); return; }
    const card = e.target.closest('[role="button"][data-act]'); if (card && e.target === card) { e.preventDefault(); acts[card.dataset.act](card.dataset, card); }
  }
});
// Einladungslink, während die App schon offen ist: Code übernehmen
window.addEventListener('hashchange', () => {
  const m = location.hash.match(/^#(KOCH-[A-Z0-9-]+)$/i);
  if (m && ui.phase === 'onboard') { ui.ob = { step: 'join', code: m[1] }; render(); }
});
window.addEventListener('online', () => { ui.online = true; requestRender(); });
window.addEventListener('offline', () => { ui.online = false; requestRender(); });
window.addEventListener('pagehide', () => flush());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

/* Start */
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
onAuthStateChanged(auth, user => {
  if (!user) { signInAnonymously(auth).catch(e => { console.error(e); appEl.innerHTML = header() + `<main class="gutter"><div class="ob"><p class="err">Anmeldung bei Firebase fehlgeschlagen (${esc(e.code || e.message)}). Ist die anonyme Anmeldung aktiviert und diese Adresse als autorisierte Domain eingetragen?</p></div></main>`; }); return; }
  uid = user.uid;
  if (fid) connect(); else { ui.phase = 'onboard'; render(); }
});
