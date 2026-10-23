// Save format, validation, migration and IndexedDB storage.
// Saves are whole snapshots written in one transaction, so money, stock and the ledger always match.
import { SAVE_VERSION, initialState, spawnWorker, currentShift, WORKERS } from '../sim/sim.js';
import { PRODUCTS } from '../sim/data.js';
import { floorCell, WIDTH, HEIGHT, LAYOUT_VERSION } from '../sim/world.js';
import { DIRECTIONS } from '../sim/directions.js';
import { remember, openObligation, learnName, migrateMemoryMetadata } from '../mind/memory.js';
import { cleanLine } from '../dialogue/lint.js';
import { validateMoments } from '../mind/moments.js';
import {validateAppearance} from '../mind/genes.js';
import { seedStreet, validateStreet } from '../sim/street.js';
import { validateOpening } from '../sim/opening.js';
import { migrateLayout } from '../sim/layout.js';
import { migrateInterior, validateInterior } from '../sim/interior.js';
import { migrateNuisance, validateNuisance } from '../sim/nuisance.js';
import {migrateManagement,validateManagement} from '../sim/management.js';
import {VISIT_PURPOSES} from '../sim/visit-purpose.js';
import {validReceipt} from '../sim/payments.js';

export const SAVE_FORMAT = 'saebyeok-mart-save';
export const MAX_IMPORT_BYTES = 6_000_000;
const PARTS = ['meta', 'world', 'people', 'social', 'memory', 'log'];
const OBLIGATION_STATUS = ['open', 'resolved', 'kept', 'broken'];
const STEP_TYPES = ['enter', 'shop', 'putBack', 'askParent', 'follow', 'give', 'checkout', 'heat', 'eat', 'trash', 'regroup', 'leave', 'atm', 'brew', 'dump', 'hog', 'doze', 'linger','restroom'];

// Pending model requests are never saved: after loading, those lines use rule text.
export function snapshot(s) {
  const copy = JSON.parse(JSON.stringify(s));
  copy.pending = [];
  for (const c of copy.conversations) c.waiting = null;
  copy.savedAt = Date.now();
  return copy;
}
export function exportText(s) {
  return JSON.stringify({ format: SAVE_FORMAT, version: SAVE_VERSION, exportedAt: new Date().toISOString(), state: snapshot(s) });
}
export function splitParts(s) {
  const { people, relations, names, playerNames, reputation, habits, groups, memories, events, obligations, log, ...rest } = s;
  const { shelf, back, batches, counts, boxes, orders, facilities, rental, trash, holds, appliances, roster, ...meta } = rest;
  return {
    meta, world: { shelf, back, batches, counts, boxes, orders, facilities, rental, trash, holds, appliances, roster },
    people: { people, groups }, social: { relations, names, playerNames, reputation, habits, obligations }, memory: { memories, events }, log: { log }
  };
}
export const joinParts = parts => Object.assign({}, ...PARTS.map(p => parts[p]));

const bad = msg => { throw new Error(msg); };
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const num = (v, min = -Infinity, max = Infinity) => Number.isFinite(v) && v >= min && v <= max;

// Throws a readable message on the first problem found.
export function validateState(s) {
  if (!isObj(s)) bad('세이브 내용이 비어 있어요.');
  validateOpening(s.opening);
  if(s.layoutVersion!==LAYOUT_VERSION)bad('매장 배치 버전을 읽을 수 없어요.');
  validateStreet(s.street);
  if(!s.weather||!['clear','cloudy','rain','storm','snow'].includes(s.weather.kind))bad('날씨 정보가 올바르지 않아요.');
  if (s.version !== SAVE_VERSION) bad('지원하지 않는 세이브 버전이에요.');
  for (const [k, lo, hi] of [['clock', 0, 1e8], ['elapsed', 0, 1e8], ['day', 1, 1e5], ['money', -1e9, 1e10], ['nextId', 1, 1e12], ['rng', 0, 4294967295]]) if (!num(s[k], lo, hi)) bad(`진행 정보(${k})가 올바르지 않아요.`);
  for (const k of ['people', 'actors', 'shelf', 'back', 'counts', 'memories', 'relations', 'names', 'playerNames', 'reputation', 'habits', 'facilities', 'orders', 'roster', 'appliances', 'reserved', 'director', 'weather', 'rental', 'shift', 'stats', 'batches'])
    if (!isObj(s[k])) bad(`세이브에 ${k} 정보가 없어요.`);
  for (const [k, cap] of [['visits', 20], ['queue', 40], ['conversations', 30], ['events', 800], ['obligations', 400], ['log', 600], ['ledger', 400], ['boxes', 200], ['trash', 40], ['history', 60], ['groups', 30], ['holds', 50]])
    if (!Array.isArray(s[k]) || s[k].length > cap) bad(`${k} 기록 형식이 올바르지 않아요.`);
  const ids = new Set(Object.keys(s.people));
  if (!ids.size || ids.size > 80) bad('인물 정보가 올바르지 않아요.');
  for (const [id, p] of Object.entries(s.people)) {
    if (p.id !== id || typeof p.name !== 'string' || !['worker', 'customer'].includes(p.kind)) bad('인물 정보가 올바르지 않아요.');
    const g = p.genes;
    if (!isObj(g) || !Number.isInteger(g.version) || !Number.isFinite(g.seed) || !isObj(g.appearance) || !isObj(g.temperament) || !isObj(g.expression) || !isObj(g.life)) bad(`${p.name}의 유전자 정보가 올바르지 않아요.`);
    if(validateAppearance(g.appearance).length||![g.appearance.skin,g.appearance.hair?.color,g.appearance.top?.color,g.appearance.bottom?.color].every(v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)))bad('외형 정보가 올바르지 않아요.');
    for (const v of Object.values(g.temperament)) if (!num(v, 0, 100)) bad(`${p.name}의 성향 값이 범위를 벗어났어요.`);
    for (const v of ['fatigue', 'hunger', 'hurry', 'mood']) if (!num(p.status?.[v], 0, 100)) bad(`${p.name}의 상태 값이 올바르지 않아요.`);
    if (!Array.isArray(s.memories[id]) || s.memories[id].length > 80) bad(`${p.name}의 기억 형식이 올바르지 않아요.`);
    if(!Array.isArray(g.life.favorites)||g.life.favorites.some(k=>!Object.hasOwn(PRODUCTS,k))||!Array.isArray(g.life.windows)||g.life.windows.some(w=>!Array.isArray(w)||w.length!==2||!w.every(Number.isFinite)))bad('생활 정보가 올바르지 않아요.');
    for (const m of s.memories[id]) if (typeof m.text !== 'string' || m.text.length > 200 || !Array.isArray(m.about) || m.about.some(x => !ids.has(x)) || !num(m.at, -1e9, 1e9) || !num(m.importance, 0, 2)) bad(`${p.name}의 기억 내용이 올바르지 않아요.`);
    for(const m of s.memories[id]){
      const e=m.evidence;
      if(e&&(!isObj(e)||!Number.isInteger(e.count)||e.count<1||e.count>1e9||!num(e.firstAt,-1e9,s.clock)||!num(e.lastAt,e.firstAt,s.clock)||!Array.isArray(e.eventIds)||e.eventIds.length>12||new Set(e.eventIds).size!==e.eventIds.length||e.eventIds.some(x=>typeof x!=='string'||x.length>80)))bad('융합된 기억의 근거가 올바르지 않아요.');
      if(m.sourceId&&!ids.has(m.sourceId))bad('기억을 전해 준 인물이 없어요.');
      if(m.resolution&&(!isObj(m.resolution)||!num(m.resolution.at,0,s.clock)||!['witnessed','self','told','handover'].includes(m.resolution.source)||(m.resolution.sourceId&&!ids.has(m.resolution.sourceId))))bad('기억의 마무리 기록이 올바르지 않아요.');
    }
    if (!isObj(s.relations[id])) bad('관계 정보가 없어요.');
    for (const [to, r] of Object.entries(s.relations[id])) if (!ids.has(to) || !['fam', 'trust', 'grat', 'griev'].every(k => num(r[k], 0, 100))) bad('관계 수치가 올바르지 않아요.');
    for(const r of Object.values(s.relations[id]))if(r.bond!==undefined&&!num(r.bond,0,100)||r.lastAt!==undefined&&!num(r.lastAt,0,s.clock)||r.encounters!==undefined&&(!Number.isInteger(r.encounters)||r.encounters<0))bad('관계의 만남 기록이 올바르지 않아요.');
  }
  if (!WORKERS.includes(s.onDuty) || !s.actors[s.onDuty]) bad('근무 중인 알바생 정보가 없어요.');
  for (const p of Object.keys(PRODUCTS)) {
    for (const k of ['shelf', 'back']) if (!Number.isInteger(s[k][p]) || s[k][p] < 0 || s[k][p] > 500) bad('재고 정보가 올바르지 않아요.');
    const c = s.counts[p];
    if (!isObj(c) || !['start', 'delivered', 'sold', 'wasted'].every(k => Number.isInteger(c[k]) && c[k] >= 0)) bad('재고 집계가 올바르지 않아요.');
  }
  for (const b of s.boxes) if (!PRODUCTS[b.p] || !Number.isInteger(b.n) || b.n <= 0) bad('입고 박스 정보가 올바르지 않아요.');
  for (const [id, a] of Object.entries(s.actors)) {
    if(a.requestedProduct&&!Object.hasOwn(PRODUCTS,a.requestedProduct))bad('요청한 상품이 올바르지 않아요.');
    if(a.payment!==undefined&&!['cash','card'].includes(a.payment))bad('결제 수단이 올바르지 않아요.');
    if(a.receipt!==undefined&&!validReceipt(a.receipt))bad('영수증 금액이 올바르지 않아요.');
    if(a.privateRoom!==undefined&&typeof a.privateRoom!=='boolean'||a.privateRoom&&(a.cur?.t!=='restroom'||a.phase!==2||s.interior.restroom.by!==id))bad('화장실 이용자가 맞지 않아요.');
    if (!ids.has(id) || a.id !== id || !num(a.x, -40, WIDTH + 40) || !num(a.y, 0, HEIGHT) || !DIRECTIONS.includes(a.dir) || !Array.isArray(a.path) || a.path.length > 400 || !Array.isArray(a.cart) || !Array.isArray(a.plan))
      bad('매장 안 인물 정보가 올바르지 않아요.');
    for (const pt of a.path) if (!num(pt.x) || !num(pt.y) || !floorCell(Math.floor(pt.x / 32), Math.floor(pt.y / 32), { staff: a.role === 'worker', facilities: s.facilities })) bad('이동 경로가 벽을 지나요.');
    for (const it of a.cart) if (!PRODUCTS[it.p] || !ids.has(it.by)) bad('장바구니 정보가 올바르지 않아요.');
    for (const st of [...a.plan, ...(a.cur ? [a.cur] : [])]) if (!STEP_TYPES.includes(st.t)||st.t==='linger'&&(!['browse','shelter','wait'].includes(st.reason)||!Object.hasOwn(PRODUCTS,st.p))) bad('예정된 행동이 올바르지 않아요.');
    if(a.visitPurpose!==undefined&&!Object.hasOwn(VISIT_PURPOSES,a.visitPurpose)||a.waitFor&&!ids.has(a.waitFor))bad('방문 목적이 올바르지 않아요.');
    if(a.socialChoice!==undefined&&a.socialChoice!==null&&(!isObj(a.socialChoice)||!['near','away'].includes(a.socialChoice.kind)||!ids.has(a.socialChoice.person)))bad('자리 선택 정보가 올바르지 않아요.');
    if (a.role === 'customer' && !s.visits.some(v => v.id === a.visitId && v.members.includes(id))) bad('방문 정보와 인물이 맞지 않아요.');
  }
  for (const v of s.visits) if (typeof v.id !== 'string' || !Array.isArray(v.members) || !v.members.length || v.members.some(m => !ids.has(m))) bad('방문 정보가 올바르지 않아요.');
  for (const id of s.queue) if (!s.actors[id]) bad('계산 줄 정보가 올바르지 않아요.');
  if (s.checkout && (!s.actors[s.checkout.customer] || !Array.isArray(s.checkout.items) || s.checkout.items.some(it => !PRODUCTS[it.p]))) bad('진행 중인 계산 정보가 올바르지 않아요.');
  if(s.checkout?.payment!==undefined&&!['cash','card'].includes(s.checkout.payment))bad('진행 중인 결제 수단이 올바르지 않아요.');
  for(const entry of s.ledger)if(entry.payment!==undefined&&(!validReceipt(entry.payment)||entry.payment.total!==entry.amount))bad('장부의 결제 금액이 올바르지 않아요.');
  for (const o of s.obligations) if (!OBLIGATION_STATUS.includes(o.status) || !ids.has(o.debtor) || (o.creditor !== 'store' && !ids.has(o.creditor))) bad('미해결 일 정보가 올바르지 않아요.');
  for (const e of s.events) if (typeof e.id !== 'string' || typeof e.type !== 'string' || !Array.isArray(e.witnesses) || e.witnesses.some(w => !ids.has(w))) bad('사건 기록이 올바르지 않아요.');
  for (const l of s.log) if (!ids.has(l.speaker) || typeof l.text !== 'string' || l.text.length > 60 || (l.to && !ids.has(l.to))) bad('대화 기록이 올바르지 않아요.');
  for (const c of s.conversations) if (!Array.isArray(c.lines) || c.lines.length > 20 || c.lines.some(l => !ids.has(l.sp))) bad('진행 중인 대화 정보가 올바르지 않아요.');
  if (!isObj(s.roster.base) || !Array.isArray(s.roster.exceptions) || s.roster.exceptions.length > 500) bad('근무표 정보가 올바르지 않아요.');
  for (const day of Object.values(s.roster.base)) if (!Array.isArray(day) || day.some(sh => !WORKERS.includes(sh.worker) || !num(sh.start, 0, 2880) || !num(sh.end, 0, 2880))) bad('근무표 내용이 올바르지 않아요.');
  for (const x of s.roster.exceptions) if (!Number.isInteger(x.day) || !['am', 'pm', 'night'].includes(x.shift) || (x.worker && !WORKERS.includes(x.worker))) bad('근무 예외 정보가 올바르지 않아요.');
  validateInterior(s);
  validateNuisance(s);
  validateManagement(s);
  return validateMoments(s);
}

// Prototype (version 1) saves: keep time, sales, memories, relations and the umbrella loan.
function migrateV1(old) {
  if (!num(old.clock, 0, 1e8) || !isObj(old.memories)) bad('구버전 세이브를 읽을 수 없어요.');
  const s = initialState((Math.floor(old.clock) * 2654435761) >>> 0);
  delete s.opening;
  for (const id of Object.keys(s.actors)) delete s.actors[id];
  s.visits = []; s.queue = []; s.conversations = []; s.director.story = [];
  s.clock = Math.floor(old.clock); s.day = Math.floor(s.clock / 1440) + 1;
  s.orders.lastAutoDay = s.day; s.orders.lastDeliveryDay = s.day;
  s.weather.nextAt = s.clock + 120; s.director.nextAt = s.clock + 1; s.shift.startedAt = s.clock;
  const revenue = num(old.revenue, 0, 1e9) ? old.revenue : 0;
  s.money += revenue; s.stats.totals = { sale: revenue, order: 0 }; s.stats.visitors = num(old.visitors, 0, 1e7) ? old.visitors : 0;
  const shift = currentShift(s);
  s.onDuty = shift?.worker ?? 'yuna';
  spawnWorker(s, s.onDuty, true);
  for (const [id, list] of Object.entries(old.memories)) {
    if (!s.people[id] || !Array.isArray(list)) continue;
    for (const m of list.slice(-30)) if (typeof m?.text === 'string') remember(s, id, { text: cleanLine(m.text).slice(0, 120) || '이전 기록', importance: .4, resolved: !m.unresolved, data: { legacyType: String(m.type ?? '') } });
  }
  for (const [from, rels] of Object.entries(old.relations ?? {})) for (const [to, n] of Object.entries(rels ?? {})) if (s.people[from] && s.people[to] && num(n, 0, 100)) s.relations[from][to] = { fam: Math.round(n), trust: 40, grat: 0, griev: 0 };
  if (old.umbrella === 'doyun') {
    const lender = ['yuna', 'jae'].includes(old.worker) ? old.worker : 'yuna';
    const o = openObligation(s, 'umbrella_loan', { debtor: 'doyun', creditor: 'store', item: '매장 우산', eventId: null });
    o.lender = lender; s.rental.inStand--;
    for (const id of ['doyun', lender, 'jae']) for (const m of s.memories[id]) if (m.data?.legacyType === 'umbrella_loan' || m.pendingItem === 'umbrella') { m.obligationId = o.id; m.resolved = false; m.kind = 'promise'; }
    learnName(s, lender, 'doyun');
  }
  if (Array.isArray(old.logs)) for (const l of old.logs.slice(-60)) if (s.people[l.speaker] && typeof l.text === 'string') s.log.push({ id: 'old' + s.nextId++, at: s.clock, speaker: l.speaker, to: s.people[l.target] ? l.target : null, text: cleanLine(l.text), visitId: null, convId: null, source: 'rule', kind: 'legacy' });
  s.migratedFrom = 1;
  return s;
}

export function migrate(data) {
  let s = data?.format === SAVE_FORMAT ? data.state : data;
  if (!isObj(s)) bad('세이브 파일 형식이 아니에요.');
  if (s.version === 1) s = migrateV1(s);
  if (s.version !== SAVE_VERSION) bad('지원하지 않는 세이브 버전이에요.');
  // Additive version-2 migration: introduced goods start empty, never silently create stock.
  for(const p of ['cigaretteBlue','cigaretteBrown'])if(s.counts&&!(p in s.counts)){
    s.counts[p]={start:0,delivered:0,sold:0,wasted:0};s.shelf[p]=0;s.back[p]=0;s.orders.par[p]=0;
  }
  if(s.facilities){for(const key of ['tobaccoSales','welcomeMat','warmLight'])s.facilities[key]??=false;}
  if(s.facilities&&s.counts)migrateInterior(s);
  migrateLayout(s);
  if(s.counts)migrateNuisance(s);
  migrateManagement(s);
  if(s.people?.doyun)s.people.doyun.genes.life.tobacco??='cigaretteBlue';
  if(s.people?.yeonggil)s.people.yeonggil.genes.life.tobacco??='cigaretteBrown';
  s.facilityOwned??=Object.fromEntries(Object.entries(s.facilities??{}).filter(([,on])=>on).map(([key])=>[key,true]));
  s.journal??=[];s.lifeHistory??=[];
  migrateMemoryMetadata(s);
  if(s.street===undefined)seedStreet(s);
  for(const [from,relations]of Object.entries(s.relations??{}))for(const [to,r]of Object.entries(relations)){
    // Legacy familiarity alone does not prove friendship. Existing companions remain close.
    r.bond??=Math.min(100,(s.groups??[]).some(g=>g.members.includes(from)&&g.members.includes(to))?Math.round(r.fam*.5):Math.round(r.grat*.3));
  }
  if(!isObj(s.facilityOwned)||Object.values(s.facilityOwned).some(v=>typeof v!=='boolean'))bad('시설 구입 정보가 올바르지 않아요.');
  if(s.offlineSettledAt!==undefined&&!num(s.offlineSettledAt,0,1e15))bad('부재중 정산 정보가 올바르지 않아요.');
  if(s.momentNotices&&(!isObj(s.momentNotices)||Object.values(s.momentNotices).some(v=>!num(v,0,1e8))))bad('장면 알림 정보가 올바르지 않아요.');
  if(!Array.isArray(s.journal)||s.journal.length>14||s.journal.some(e=>!num(e.day,1)||!num(e.revenue,0)||!num(e.customers,0)||!Array.isArray(e.highlights)))bad('영업일지 형식이 올바르지 않아요.');
  if(!Array.isArray(s.lifeHistory)||s.lifeHistory.length>20)bad('생활 변화 기록이 올바르지 않아요.');
  for(const p of Object.values(s.people??{}))if(p.lifeChange&&(!num(p.lifeChange.kindIndex,0,3)||!Number.isInteger(p.lifeChange.kindIndex)||!num(p.lifeChange.start,1)||!num(p.lifeChange.end,p.lifeChange.start)||!Array.isArray(p.lifeChange.toldTo)))bad('생활 변화 정보가 올바르지 않아요.');
  return s;
}
// Parses, migrates and validates. The returned state is a fresh object safe to run.
export function parseSave(input) {
  if (typeof input === 'string' && input.length > MAX_IMPORT_BYTES) bad('세이브 파일이 너무 커요.');
  let data;
  try { data = typeof input === 'string' ? JSON.parse(input) : structuredClone(input); } catch { bad('JSON 형식이 아니에요.'); }
  const s = validateState(migrate(data));
  s.said ??= {};
  for (const [k, v] of Object.entries(s.said)) if (!v || Array.isArray(v) || !Array.isArray(v.recent) || typeof v.to !== 'object') s.said[k] = { recent: [], to: {} };
  for (const h of Object.values(s.habits)) { h.seen ??= {}; h.seenNext ??= {}; }
  s.pending = [];
  for (const c of s.conversations) c.waiting = null;
  return s;
}

// ---------- IndexedDB ----------
const DB_NAME = 'saebyeok-mart', DB_VERSION = 2;
export function openDB(idb = globalThis.indexedDB) {
  return new Promise((resolve, reject) => {
    if (!idb) { reject(new Error('IndexedDB를 쓸 수 없어요.')); return; }
    const req = idb.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('saves')) db.createObjectStore('saves');      // v1 prototype store, kept for migration
      if (!db.objectStoreNames.contains('slots')) db.createObjectStore('slots');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('저장소를 열 수 없어요.'));
    req.onblocked = () => reject(new Error('다른 탭이 저장소를 쓰고 있어요.'));
  });
}
// All parts plus a header with a revision number in one readwrite transaction.
export function writeSlot(db, slot, s) {
  const snap = snapshot(s), parts = splitParts(snap), rev = Date.now();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('slots', 'readwrite'), store = tx.objectStore('slots');
    for (const name of PARTS) store.put({ rev, data: parts[name] }, `${slot}:${name}`);
    store.put({ rev, version: SAVE_VERSION, day: snap.day, clock: snap.clock, savedAt: snap.savedAt }, `${slot}:header`);
    tx.oncomplete = () => resolve(rev);
    tx.onerror = () => reject(tx.error ?? new Error('저장 실패'));
    tx.onabort = () => reject(tx.error ?? new Error('저장이 중단됐어요.'));
  });
}
export function readSlot(db, slot) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('slots', 'readonly'), store = tx.objectStore('slots'), out = {};
    const keys = ['header', ...PARTS];
    for (const k of keys) { const r = store.get(`${slot}:${k}`); r.onsuccess = () => { out[k] = r.result; }; }
    tx.oncomplete = () => {
      if (!out.header) { resolve(null); return; }
      if (PARTS.some(p => out[p]?.rev !== out.header.rev)) { reject(new Error('저장 조각이 서로 맞지 않아요.')); return; }
      resolve(joinParts(Object.fromEntries(PARTS.map(p => [p, out[p].data]))));
    };
    tx.onerror = () => reject(tx.error ?? new Error('불러오기 실패'));
  });
}
export function readLegacy(db) {
  return new Promise(resolve => {
    try {
      const r = db.transaction('saves', 'readonly').objectStore('saves').get('current');
      r.onsuccess = () => resolve(r.result ?? null); r.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
