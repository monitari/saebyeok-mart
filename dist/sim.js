// Simulation and game rules. Owns time, money, stock, movement, purchases and event confirmation.
// Dialogue text comes from dialogue.js (rules) or a model via pending requests; neither can change state directly.
import { CAST, GROUPS, PRODUCTS, BASE_ROSTER, INITIAL_EXCEPTIONS, INITIAL_RELATIONS, INITIAL_NAME_KNOWLEDGE, WEEKDAYS } from './data.js';
import { makeGenes, lookLabel, generatePerson, uniqueLabels } from './genes.js';
import { FIXTURES, SPOTS, TILE, center, findPath, nearestFloor, floorCell, isInside, cellOf, LAYOUT_VERSION } from './world.js';
import { directionFromVector } from './directions.js';
import {createManagement,orderMode,orderAllowance,recommendations,recordSale,closeManagementDay,activeSchedule,neighborhoodBias,FACILITIES,draftCost,recordDecision,setTargetPar} from './management.js';
import {chooseVisitPurpose,VISIT_PURPOSES} from './visit-purpose.js';
import {paymentMethod,paymentReceipt,PAYMENT_LABELS} from './payments.js';
import {weatherChoices} from './environment.js';
import {rankSeats,groupWaitLimit} from './social-space.js';
import {workerStyle} from './worker-style.js';
import { workerAt, timeline, weekdayOf } from './roster.js';
import { phrase } from './dialogue.js';
import { lintLine, cleanLine } from './lint.js';
import { addEvent, remember, rel, adjust, noteContact, nameFor, learnName, openObligation, resolveObligation, learnResolved, recordPurchase, relevantMemories, dailyDecay, witnessesAt, nextId, particle as J, knowsName } from './memory.js';
import { perceive } from './perceive.js';
import { beginMoment, recordMomentLine, tickMoments } from './moments.js';
import { effectiveLife, weeklyLife, tellLifeNews, finishDay, LIFE_CHANGES } from './life.js';
import { offlinePlan } from './offline.js';
import { seedStreet, tickStreet } from './street.js';
import { OPENING_TIME, createOpening, seedBackground } from './opening.js';
import { createNuisance, onSpawn as troubleOnSpawn, adjustPlan as troublePlan, keepsUmbrella, onPick as troubleOnPick, checkoutTrouble, underageLines, onLeaving as troubleOnLeaving, chooseTroubleJob, TROUBLE_JOBS, noisyGroup, recordTrouble, wary } from './nuisance.js';
import { createInterior, unitPrice, itemsTotal, isAdultItem, pickUnits, putBackUnit, messUp, binDrop, trashKind, chooseInteriorJob, INTERIOR_JOBS, dropInteriorHolding, tickInterior, startDeliveryTruck, PARCEL_FEE, BASKETS } from './interior.js';

export { findPath, floorCell, cleanLine };
export const NEIGHBORS = 6, SAVE_VERSION = 2, SIM_DT = .1, MINUTES_PER_SECOND = .5, LOG_CAP = 300, MAX_VISITS = 5, MAX_PENDING = 6, START_MONEY = 300000;
export const PEOPLE_IDS = CAST.map(c => c.id);
export const WORKERS = CAST.filter(c => c.kind === 'worker').map(c => c.id);

// ---------- random, time ----------
export function rand(s) {
  s.rng = (s.rng + 0x6D2B79F5) >>> 0;
  let r = Math.imul(s.rng ^ (s.rng >>> 15), 1 | s.rng);
  r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
}
const pick = (s, list) => list[Math.floor(rand(s) * list.length)];
function weighted(s, entries) {
  const total = entries.reduce((n, [, w]) => n + w, 0);
  let r = rand(s) * total;
  for (const [v, w] of entries) { r -= w; if (r <= 0) return v; }
  return entries.at(-1)?.[0];
}
export const minuteOfDay = s => ((Math.floor(s.clock) % 1440) + 1440) % 1440;
export const timeLabel = s => { const m = minuteOfDay(s); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
export const clockLabel = c => { const m = ((Math.floor(c) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
export const dayLabel = s => s.day;
export const weekdayLabel = day => WEEKDAYS[weekdayOf(day)];
const P = (s, id) => s.people[id];
const temper = (s, id) => s.people[id].genes.temperament;
const pname = p => PRODUCTS[p].name;

// ---------- initial state ----------
export function initialState(seed = 20261022) {
  const start = OPENING_TIME;
  const s = {
    version: SAVE_VERSION, layoutVersion:LAYOUT_VERSION, seed, rng: seed >>> 0, elapsed: 0, clock: start, day: 1, opening:createOpening(),
    weather: { kind: 'rain', intensity: 2, nextAt: start + 260 }, wetness: .25,
    money: START_MONEY, sales: { day: 1, revenue: 0, customers: 0, tx: 0 }, history: [], ledger: [],
    shelf: {}, back: {}, batches: {}, counts: {}, boxes: [], orders: { pending: {}, auto: true, par: {}, lastAutoDay: 1, lastDeliveryDay: 1 },
    facilities: { extraTable: false, umbrellaSale: false, tobaccoSales:false, welcomeMat:false, warmLight:false, selfCheckout: false }, rental: { total: 2, inStand: 2 }, interior: createInterior(), nuisance: createNuisance(),
    people: {}, actors: {}, visits: [], queue: [], checkout: null, conversations: [], pending: [],
    events: [], moments: [], momentBuffer:[], journal:[], lifeHistory:[], facilityOwned:{}, memories: {}, relations: {}, obligations: [], habits: {}, reputation: {}, names: {}, playerNames: {},
    roster: { base: structuredClone(BASE_ROSTER), exceptions: structuredClone(INITIAL_EXCEPTIONS) }, onDuty: 'yuna', shift: { incoming: null, outgoing: null, handover: null, startedAt: start - 400 },
    trash: [], holds: [], reserved: {}, appliances: { microwave: { until: 0, by: null, item: null }, hotWater: { until: 0, by: null, item: null } },
    log: [], said: {}, nextId: 1, director: { nextAt: start + 12, cooldown: {}, lastWelcome: -99, meetings: {} }, stats: { visitors: 0, served: 0,totals:{sale:0,order:0,expense:0} },
    aiMode: 'rule', lastDailyAt: Math.floor(start / 1440)
  };
  s.management=createManagement(s);
  for (const [p, def] of Object.entries(PRODUCTS)) {
    const shelf = def.facility ? 0 : p === 'lunchbox' ? 0 : Math.ceil(def.shelfMax * .7);
    const back = def.facility ? 0 : p === 'lunchbox' ? 0 : Math.ceil(def.shelfMax * .4);
    s.shelf[p] = shelf; s.back[p] = back;
    s.counts[p] = { start: shelf + back, delivered: 0, sold: 0, wasted: 0 };
    s.orders.par[p] = def.facility ? 0 : def.par ?? (p === 'lunchbox' ? 2 : def.shelfMax + Math.ceil(def.shelfMax * .4));
    if (def.expires) s.batches[p] = shelf + back ? [{ day: 1, n: shelf + back }] : [];
  }
  // Authored cast plus a few neighbours generated from the save's seed.
  const defs = [...CAST], used = new Set(CAST.map(c => c.name));
  for (let i = 0; i < NEIGHBORS; i++) { const d = generatePerson((seed * 31 + i * 7919) >>> 0, 'n' + (i + 1), used); used.add(d.name); defs.push(d); }
  s.groups = structuredClone(GROUPS);
  s.groups.push({ id: 'pair', name: '자주 같이 오는 이웃', kind: 'friends', members: ['n1', 'n2'], purpose: '산책 끝에 들르기', subsets: [[['n1', 'n2'], 4], [['n1'], 2], [['n2'], 2]], leaveTogether: true, payMode: 'separate', frequency: .8 });
  for (const def of defs) {
    s.people[def.id] = { id: def.id, name: def.name, kind: def.kind, generated: !!def.generated, genes: makeGenes(def), skills: def.skills ? { ...def.skills } : null, status: { fatigue: 20, hunger: 30, hurry: 20, mood: 60, action: def.kind === 'worker' ? '쉬는 중' : '집에 있음' }, visits: 0, lastVisitAt: -99999, groups: s.groups.filter(g => g.members.includes(def.id)).map(g => g.id) };
    s.memories[def.id] = []; s.relations[def.id] = {}; s.names[def.id] = {}; s.reputation[def.id] = 50;
  }
  Object.assign(rel(s, 'n1', 'n2'), { fam: 60, trust: 55,bond:25 }); Object.assign(rel(s, 'n2', 'n1'), { fam: 55, trust: 55,bond:25 });
  const labels = uniqueLabels(Object.values(s.people));
  for (const p of Object.values(s.people)) p.label = labels[p.id];
  for (const [a, b, fam, trust] of INITIAL_RELATIONS) Object.assign(rel(s, a, b), { fam, trust, bond:fam>=45?Math.round(fam*.5):0 });
  for (const g of s.groups) for (const a of g.members) for (const b of g.members) if (a !== b) learnName(s, a, b);
  for (const [a, list] of Object.entries(INITIAL_NAME_KNOWLEDGE)) for (const b of list) learnName(s, a, b);
  for (const w of WORKERS) s.playerNames[w] = true; // name tags
  s.people.doyun.genes.life.tobacco='cigaretteBlue';
  if(s.people.yeonggil)s.people.yeonggil.genes.life.tobacco='cigaretteBrown';
  seedBackground(s);
  spawnWorker(s, 'yuna', true);
  s.shift.startedAt = workerAt(s.roster,start)?.start??start;
  s.people.yuna.status.fatigue=15+Math.round((start-s.shift.startedAt)/60*5);
  // Opening scene: two friends already shopping, a delivery rider about to come in out of the rain.
  startVisit(s, ['minseo', 'harin'], 'friends', { inside: true });
  s.director.story = [{ at: start + 1.5, members: ['doyun'], opts: { noUmbrella: true } }];
  // The game opens after this evening's courier visit; the next one is tomorrow afternoon.
  s.interior.lastCourierDay = s.day;
  seedStreet(s);
  return s;
}

// ---------- logging and speech ----------
function pushLog(s, entry) {
  s.log.push(entry);
  s.stats.dialogueSources??={};s.stats.dialogueSources[entry.source]=(s.stats.dialogueSources[entry.source]??0)+1;
  recordMomentLine(s, entry);
  if (s.log.length > LOG_CAP) s.log.splice(0, s.log.length - LOG_CAP);
}
export function registerFor(s, speaker, listener) {
  const p = P(s, speaker), e = p.genes.expression, lp = listener ? P(s, listener) : null;
  if (p.kind === 'worker') return 'worker';
  if (e.politeness === 'child') return 'child';
  const group=listener&&s.groups.find(g=>g.members.includes(speaker)&&g.members.includes(listener));
  if(group?.kind==='friends'||group?.kind==='family')return 'casual';
  if (e.politeness === 'elder') return lp?.genes.appearance.age === 'child' ? 'elder' : 'elder';
  const fam = listener ? (s.relations[speaker]?.[listener]?.fam ?? 0) : 0;
  if (e.politeness === 'rude') return lp?.kind === 'worker' || !lp ? 'rude' : fam >= 40 ? 'casual' : 'formal';
  if (lp?.kind === 'worker') return 'formal';
  if (e.politeness === 'casual') return fam >= 40 ? 'casual' : 'formal';
  if (e.politeness === 'mixed') return fam >= 55 ? 'casual' : 'formal';
  return fam >= 70 ? 'casual' : 'formal';
}
// Records a spoken line. Everyone in earshot hears it; name mentions teach names to those listeners only.
export function speak(s, speaker, to, text, meta = {}) {
  const a = s.actors[speaker];
  if (!a || !text) return null;
  const heard = witnessesAt(s, a, [speaker, ...(to ? [to] : [])]);
  const entry = { id: nextId(s, 'l'), at: s.clock, speaker, to: to ?? null, text, visitId: a.visitId ?? null, convId: meta.convId ?? null, source: meta.source ?? 'rule', kind: meta.kind ?? null };
  pushLog(s, entry);
  rememberSaid(s, speaker, to, text);
  a.talkUntil = s.elapsed + 1.2;
  if (meta.reveals) for (const h of heard) { learnName(s, h, meta.reveals); s.playerNames[meta.reveals] = true; }
  return { entry, heard };
}

// ---------- conversations ----------
// A conversation is a short scripted exchange whose structure comes from game rules.
// Each line names a kind of utterance; phrasing is filled by rules or (optionally) a model.
export function startConversation(s, kind, lines, { members, onEnd = null, visitIds = [] } = {}) {
  if (s.conversations.length >= 10) return null;
  const conv = { id: nextId(s, 'c'), kind, members: members ?? [...new Set(lines.map(l => l.sp))], lines: lines.slice(0, 10), i: 0, nextAt: s.elapsed + (lines[0]?.delay ?? .4), waiting: null, startedAt: s.elapsed, onEnd, visitIds, said: [] };
  s.conversations.push(conv);
  beginMoment(s, conv);
  return conv;
}
const inConversation = (s, id) => s.conversations.some(c => c.members.includes(id));

function runConversations(s) {
  for (const conv of [...s.conversations]) {
    if (s.elapsed - conv.startedAt > 12 && !conv.waiting) { endConversation(s, conv); continue; }
    if (conv.waiting) {
      const pend = s.pending.find(p => p.id === conv.waiting);
      if (!pend) conv.waiting = null;
      else if (!pend.dispatched && s.elapsed >= pend.deadline) resolvePending(s, pend, null);
      continue;
    }
    if (s.elapsed < conv.nextAt) continue;
    const line = conv.lines[conv.i];
    if (!line) { endConversation(s, conv); continue; }
    // Customer-facing lines belong to whoever is on duty now; an off-duty worker stays quiet.
    const offDuty = P(s, line.sp)?.kind === 'worker' && conv.kind !== 'handover' && line.sp !== s.onDuty;
    // An answer to a line that was never said is skipped too.
    const orphan = line.ifPrev && conv.lastSpoke === false;
    if (!s.actors[line.sp] || offDuty || orphan || (line.to && !s.actors[line.to] && !line.toOptional)) {
      if (line.must) runEffect(s, conv, line.effect, null);
      conv.i++; conv.nextAt = s.elapsed + .2; continue;
    }
    const choice = line.choices ? decide(s, conv, line) : null;
    const kind = choice?.k ?? line.k;
    const fallback = choice?.literal ?? line.literal ?? (kind ? phrase(kind, phraseOpts(s, line, conv)) : null);
    // Lines that teach a name stay rule-based so the name is really said.
    const phrasingOnly = ['welcome','welcome_familiar','greet_familiar','small_worker','small_customer','small_reply','small_worker_reply','friend_food_q','friend_food_a','coworker_overtime','coworker_reply','colleague_hi','colleague_bye','confirm','thank_bye','bye'].includes(kind);
    const factual = line.reveals || !phrasingOnly;
    if (s.aiMode !== 'rule' && kind && !line.noAi && !choice?.noAi && !factual && s.pending.length < MAX_PENDING) {
      const pend = makePending(s, conv, line, choice, fallback);
      conv.waiting = pend.id;
      continue;
    }
    finishLine(s, conv, line, choice, fallback, 'rule');
  }
}
function phraseOpts(s, line, conv) {
  const p = P(s, line.sp), register = line.reg ?? registerFor(s, line.sp, line.to);
  const facts = factsFor(s, line.sp, line.to, register);
  if (line.followTopic) facts.topic = conv.lastTopic ?? null;
  conv.pick = {};
  return { register, slots: line.slots ?? {}, rand: () => rand(s), recent: conv.said.slice(-4), sociability: p.genes.temperament.sociability, verbosity: p.genes.expression.verbosity, facts, avoid: (text, score) => saidRecently(s, line.sp, line.to, text, score), pick: conv.pick };
}

// ---------- what a speaker can see and remember right now ----------
// Facts feed the conditional lines in dialogue.js. They only use what the speaker plausibly knows.
export function stageOf(s, a, b) {
  const r=s.relations[a]?.[b],fam=r?.fam??0;
  return fam>=45&&(r.bond??0)>=12&&r.trust>=40&&r.griev<20?'close':fam>=25?'regular':fam>=10?'face':'stranger';
}
const CATEGORY = { coffee: 'coffee', cupRamen: 'ramen', bigRamen: 'ramen', lunchbox: 'lunchbox', kimbap: 'lunchbox', sandwich: 'lunchbox', chips: 'snack', choco: 'snack', candy: 'snack', milk: 'milk', banana: 'milk' };
const isRaining = s => s.weather.kind === 'rain' || s.weather.kind === 'storm';
export function factsFor(s, sp, to, register = 'formal') {
  const ps = P(s, sp), pt = to ? P(s, to) : null, m = minuteOfDay(s);
  const f = { who: sp, to: to ?? null, slots: {}, weather: s.weather.kind, rainy: isRaining(s), weekend: [0, 6].includes(weekdayOf(s.day)),
    tod: m < 300 ? 'dawn' : m < 660 ? 'morning' : m < 1020 ? 'day' : m < 1260 ? 'evening' : 'night' };
  if (to) f.stage = stageOf(s, sp, to);
  const worker = ps.kind === 'worker' ? sp : pt?.kind === 'worker' ? to : null;
  const cust = ps.kind === 'customer' ? sp : pt?.kind === 'customer' ? to : null;
  if (cust && worker) {
    const cp = P(s, cust), h = s.habits[cust], a = s.actors[cust];
    // A worker judges "how long has it been" only from visits they saw themselves.
    const seen = sp === worker ? s.habits[worker]?.seen?.[cust] : null;
    const lastAt = sp === worker ? seen?.at : cp.visits ? cp.lastVisitAt : null, since = lastAt == null ? null : s.clock - lastAt;
    f.away = since == null ? 'first' : since < 600 ? 'today' : since < 2200 ? 'yesterday' : since < 1440 * 6 ? 'days' : 'long';
    const lastWeather = sp === worker ? seen?.weather : h?.lastWeather;
    if (lastWeather) f.rainedLast = ['rain', 'storm'].includes(lastWeather);
    const v = a && s.visits.find(x => x.id === a.visitId);
    f.soloRegular = !!(v && v.members.length === 1 && (sp === worker ? seen?.group : cp.groups.length));
    f.withChild = !!v?.members.some(id => id !== cust && P(s, id).genes.appearance.age === 'child');
    const items = [...(a?.cart ?? []).map(i => i.p), ...(s.checkout?.customer === cust ? s.checkout.items.map(i => i.p) : [])];
    f.buying = CATEGORY[items[0]] ?? null;
    f.single = items.length === 1;
    // The worker refers to past purchases only if they noticed the habit; the customer knows their own.
    const lastP = sp === worker ? s.memories[worker].find(x => x.key === 'habit:' + cust)?.data?.product : h?.last?.[0];
    if (lastP) { f.last = true; f.slots.last = PRODUCTS[lastP].name; }
    f.sameAsLast = !!(h?.last && items.some(p => h.last.includes(p)));
    f.newItem = !!h && items.some(p => !h.buys?.[p]);
    const wish = s.memories[cust].find(x => x.key?.startsWith('soldout:') && x.resolved && s.clock - x.at < 1440 * 3 && items.includes(x.data?.product));
    if (wish && (sp === cust || s.memories[worker].some(x => x.about.includes(cust) && x.data?.product === wish.data.product) || stageOf(s, worker, cust) === 'close')) { f.boughtWish = true; f.slots.wish = PRODUCTS[wish.data.product].name; }
    f.loanBack = s.memories[worker].some(x => x.about.includes(cust) && s.clock - x.at < 2880 && s.events.find(e => e.id === x.eventId)?.type === 'umbrella_return');
    if (sp === cust) {
      const knowsOther = WORKERS.some(w => w !== worker && ['regular', 'close'].includes(stageOf(s, cust, w)));
      f.unfamiliarWorker = knowsOther && ['stranger', 'face'].includes(stageOf(s, cust, worker));
    }
  }
  if (worker) {
    f.quietShift = (s.shift.served ?? 0) < 4; f.busyShift = (s.shift.served ?? 0) >= 12; f.wetFloor = s.wetness > .4;
    const seg = workerAt(s.roster, s.clock);
    if (seg && seg.worker === worker) { f.end = true; f.slots.end = Math.floor((seg.end % 1440) / 60) + '시'; }
  }
  if (ps.kind === 'worker' && pt?.kind === 'worker') { const seg = workerAt(s.roster, s.clock); f.incomingLate = !!(seg?.lateBy && seg.worker === to); }
  // A personal verbal habit, used most of the time but not always.
  const ack = ps.genes.expression.ack;
  if (ack && register !== 'casual' && rand(s) < .6) { f.ack = true; f.slots.ack = ack; }
  return f;
}
// The same remark to the same person within two days, or a situational remark to anyone within two hours, is avoided.
const normLine = t => t.replace(/[\s.,?!]/g, '');
// Kept per speaker: the last few lines to anyone, and the last few lines to each listener.
function saidRecently(s, sp, to, text, score) {
  const x = normLine(text), mem = s.said[sp];
  if (x.length <= 3 || !mem) return false;
  if (to && (mem.to[to] ?? []).some(e => e.x === x && s.clock - e.at < 2880)) return true;
  return score > 0 && mem.recent.some(e => e.x === x && s.clock - e.at < 120);
}
function rememberSaid(s, sp, to, text) {
  const mem = (s.said[sp] ??= { recent: [], to: {} }), e = { x: normLine(text), at: s.clock };
  mem.recent.push(e);
  if (mem.recent.length > 24) mem.recent.splice(0, mem.recent.length - 24);
  if (!to) return;
  const list = mem.to[to]=(mem.to[to]??[]).filter(old=>s.clock-old.at<2880&&old.x!==e.x);
  list.push(e);
  if (list.length > 128) list.splice(0, list.length - 128);
}
function finishLine(s, conv, line, choice, text, source) {
  if (text) {
    conv.said.push(text);
    speak(s, line.sp, line.to, text, { convId: conv.id, source, kind: choice?.k ?? line.k, reveals: line.reveals });
  }
  conv.lastTopic = text ? conv.pick?.topic ?? null : null;
  conv.lastSpoke = !!text;
  if (!text && conv.i === 0 && ['chat', 'meet'].includes(conv.kind)) { runEffect(s, conv, choice?.effect ?? line.effect, choice); conv.i = conv.lines.length; endConversation(s, conv); return; }
  runEffect(s, conv, choice?.effect ?? line.effect, choice);
  if (choice?.then) conv.lines.splice(conv.i + 1, 0, ...choice.then);
  conv.i++;
  conv.nextAt = s.elapsed + (conv.lines[conv.i]?.delay ?? .8);
  if (conv.i >= conv.lines.length) endConversation(s, conv);
}
function endConversation(s, conv) {
  const i = s.conversations.indexOf(conv);
  if (i < 0) return;
  s.conversations.splice(i, 1);
  s.pending = s.pending.filter(p => p.convId !== conv.id);
  for (let k = conv.i; k < conv.lines.length; k++) if (conv.lines[k].must) runEffect(s, conv, conv.lines[k].effect, null);
  if (conv.onEnd) runEffect(s, conv, conv.onEnd, null);
}

// ---------- model requests (optional) ----------
// The model gets a small, explicit context and a closed list of actions. The game re-validates on return.
function makePending(s, conv, line, choice, fallback) {
  const sp = P(s, line.sp), t = sp.genes.temperament, e = sp.genes.expression, a = s.actors[line.sp];
  const others = [line.to].filter(Boolean);
  const request = {
    speaker: { id: sp.id, name: sp.name, role: sp.kind === 'worker' ? '알바생' : '손님', age: sp.genes.life.ageGroup, register: line.reg ?? registerFor(s, line.sp, line.to),
      traits: { kindness: t.kindness, patience: t.patience, directness: e.directness, verbosity: e.verbosity }, state: { mood: Math.round(sp.status.mood), hurry: Math.round(sp.status.hurry), action: a?.state ?? '' } },
    listener: line.to ? { id: line.to, label: nameFor(s, line.sp, line.to), role: P(s, line.to).kind === 'worker' ? '알바생' : '손님' } : null,
    situation: { place: '편의점', time: timeLabel(s), weather: WEATHER_LABEL[s.weather.kind], scene: conv.kind },
    intent: choice?.k ?? line.k, slots: line.slots ?? {},
    recent: s.log.filter(l => l.convId === conv.id).slice(-4).map(l => ({ who: nameFor(s,line.sp,l.speaker), text: l.text })),
    memories: relevantMemories(s, line.sp, others, line.slots?.productId, 3),
    promises: s.obligations.filter(o => o.status === 'open' && (o.debtor === line.sp || o.creditor === line.sp)).slice(0, 2).map(o => ({ type: o.type, item: o.item })),
    actions: [choice?.id??'say'],
    example: fallback
  };
  const pend = { id: nextId(s, 'q'), convId: conv.id, lineIndex: conv.i, speaker: line.sp, visitId: a?.visitId ?? null, createdAt: s.elapsed, deadline: s.elapsed + 1.6, dispatched: false, request, ruleChoice: choice?.id ?? null, fallback };
  s.pending.push(pend);
  return pend;
}
// Applies a model result if it still fits the moment; otherwise uses the rule line.
// result: { say: string|null, action: string, to?: string } or null on failure/timeout.
export function resolvePending(s, pend, result) {
  const idx = s.pending.indexOf(pend);
  if (idx < 0) return 'stale';
  s.pending.splice(idx, 1);
  const conv = s.conversations.find(c => c.id === pend.convId);
  if (!conv || conv.i !== pend.lineIndex || conv.waiting !== pend.id) return 'stale';
  conv.waiting = null;
  const line = conv.lines[conv.i];
  if (!s.actors[pend.speaker] || (pend.visitId && s.actors[pend.speaker].visitId !== pend.visitId)) {
    if (line.must) runEffect(s, conv, line.effect, null);
    conv.i++; conv.nextAt = s.elapsed + .2;
    return 'speaker_left';
  }
  let choice = line.choices ? line.choices.find(c => c.id === pend.ruleChoice) : null;
  let text = pend.fallback, source = result ? 'fallback' : 'fallback';
  if (result && typeof result === 'object') {
    if (line.choices && typeof result.action === 'string') {
      const c = line.choices.find(x => x.id === result.action && x.allowed !== false);
      if (c) choice = c;
    }
    const said = result.say === null ? null : cleanLine(result.say);
    const numbers = Object.values(line.slots ?? {}).map(v => String(v).replace(/,/g, '')).filter(v => /^\d+$/.test(v));
    const productNames = Object.values(line.slots ?? {}).filter(v => typeof v === 'string');
    const problems = said === null ? [] : lintLine(said, { recent: conv.said.slice(-4), numbers, productNames, allProductNames: Object.values(PRODUCTS).map(p => p.name) });
    if(said&&Object.values(s.people).some(p=>p.id!==pend.speaker&&!knowsName(s,pend.speaker,p.id)&&said.includes(p.name)&&line.slots?.n!==p.name))problems.push('unknown_name');
    // A test stand-in is never labelled as a model.
    const modelSource = s.aiMode === 'mock' ? 'mock' : 'ai';
    if (said === null) { text = null; source = modelSource; }
    else if (!problems.length) { text = said; source = modelSource; }
    else s.stats.aiRejected = (s.stats.aiRejected ?? 0) + 1;
  }
  if (choice && line.choices && choice.id !== pend.ruleChoice && text === pend.fallback) text = phrase(choice.k, phraseOpts(s, line, conv));
  finishLine(s, conv, line, choice, text, source);
  return source;
}
export const pendingToDispatch = s => s.pending.filter(p => !p.dispatched);
export function advanceDialogueTime(s, seconds) {
  for(const p of [...s.pending])if(p.dispatched){p.realWait=(p.realWait??0)+seconds;if(p.realWait>=8.5)resolvePending(s,p,null);}
}

// ---------- deciders and effects (referenced by name so conversations stay serialisable) ----------
function decide(s, conv, line) {
  const id = DECIDERS[line.decider?.[0]]?.(s, conv, ...(line.decider.slice(1))) ?? line.choices[0].id;
  if(line.decider?.[0]==='restockAnswer')for(const c of line.choices)c.allowed=c.id===id;
  return line.choices.find(c => c.id === id) ?? line.choices[0];
}
const DECIDERS = {
  workerReplyUrge: (s, conv, w) => P(s, w).genes.expression.directness >= 65 ? 'direct' : 'soft',
  acceptUmbrella: (s, conv, c) => s.weather.intensity < 2 && P(s, c).status.hurry > 85 && rand(s) < .3 ? 'no' : 'yes',
  restockAnswer: (s, conv, w, p) => restockOption(s, p),
  cutAnswer: (s, conv, w) => P(s, w).genes.expression.directness >= 60 || temper(s, w).meticulous >= 80 ? 'refuse' : 'allow',
  parentAnswer: (s, conv, parent, child) => {
    const last = s.memories[parent].find(m => m.key === 'candy:last');
    const recent = last && s.clock - last.at < 1440 * 1.5 && last.data?.allowed;
    const t = temper(s, parent);
    return !recent && rand(s) < .35 + t.kindness / 200 ? 'yes' : 'no';
  },
  soldoutReply: (s, conv, w) => temper(s, w).kindness >= 70 || temper(s, w).conflictAvoid >= 65 ? 'soft' : 'direct',
  argueReply: (s, conv, w) => temper(s, w).conflictAvoid >= 60 ? 'soft' : 'firm'
};
export function restockOption(s, p) {
  if (s.shelf[p] > 0) return 'yes';
  if ((s.orders.pending[p] ?? 0) > 0) return 'soon';
  if(orderMode(s,p)!=='auto')return 'request';
  return canWorkerOrder(s,p,2) ? 'promise' : 'none';
}
function runEffect(s, conv, effect, choice) {
  if (!effect) return;
  const [name, ...args] = effect;
  const old=s.eventConversationId;s.eventConversationId=conv?.id??null;
  try{EFFECTS[name]?.(s, conv, ...args);}finally{if(old===undefined)delete s.eventConversationId;else s.eventConversationId=old;}
}
const EFFECTS = {
  lifeNews(s,conv,customer,worker){const c=P(s,customer)?.lifeChange;if(c&&conv.said.includes(LIFE_CHANGES[c.kindIndex].news))tellLifeNews(s,customer,worker);},
  tobaccoGive(s,conv,customer,worker,product){
    const a=s.actors[customer],w=s.actors[worker];if(!a||!w||!s.checkout?.items.some(it=>it.p===product))return;
    w.reachUntil=s.elapsed+1;
    const e=addEvent(s,'tobacco_check',{actors:[customer,worker],importance:.3,data:{product}});
    remember(s,worker,{eventId:e.id,about:[customer],text:`신분을 확인하고 ${pname(product)}을 꺼내 줬다.`,importance:.3});
  },
  loanUmbrella(s, conv, customer, worker) {
    const a = s.actors[customer];
    if (!a || s.rental.inStand <= 0 || openUmbrellaLoan(s, customer)) return;
    s.rental.inStand--; a.holding = 'rental'; a.hasUmbrella = true;
    const o = openObligation(s, 'umbrella_loan', { debtor: customer, creditor: 'store', item: '매장 우산', eventId: null });
    o.lender = worker;
    const e = addEvent(s, 'umbrella_loan', { actors: [customer, worker], importance: .8, data: { borrower: customer, lender: worker, obligationId: o.id } });
    o.eventId = e.id;
    perceive(s, e);
    adjust(s, customer, worker, { grat: 25, trust: 10, fam: 8 }); adjust(s, worker, customer, { fam: 6 });
    s.reputation[customer] = Math.min(100, s.reputation[customer] + 6);
  },
  returnUmbrella(s, conv, customer, worker) {
    const a = s.actors[customer], o = openUmbrellaLoan(s, customer);
    if (!a || !o) return;
    s.rental.inStand++; a.holding = null;
    const knew = (s.memories[worker] ?? []).some(m => m.obligationId === o.id);
    const e = addEvent(s, 'umbrella_return', { actors: [customer, worker], importance: .7, data: { borrower: customer, receiver: worker, lender: o.lender, receiverKnew: knew, obligationId: o.id, loanEvent: o.eventId } });
    resolveObligation(s, o, e.id);
    // Only those present learn that the loan is settled.
    for (const v of e.witnesses) learnResolved(s, v, o.id);
    perceive(s, e);
    adjust(s, worker, customer, { trust: knew ? 18 : 10, fam: 6 });
    adjust(s, customer, worker, { fam: 5 });
    s.reputation[customer] = Math.min(100, s.reputation[customer] + 2);
  },
  restockPromise(s, conv, worker, customer, p) {
    if (!canWorkerOrder(s, p, 2)) return;
    placeOrder(s, p, 2, worker);
    const o = openObligation(s, 'restock_promise', { debtor: worker, creditor: customer, item: pname(p), product: p, eventId: null });
    o.dueDay = s.day + (minuteOfDay(s) < 7 * 60 ? 0 : 1);
    const e = addEvent(s, 'restock_promise', { actors: [worker, customer], importance: .6, data: { worker, customer, product: p, obligationId: o.id } });
    o.eventId = e.id;
    perceive(s, e);
    adjust(s, customer, worker, { trust: 4 });
  },
  requestRestock(s,conv,worker,customer,p){requestRestock(s,worker,customer,p);},
  queueUrge(s, conv, urger, worker) {
    const e = addEvent(s, 'queue_urge', { actors: [urger, worker], importance: .4, data: { urger, worker } });
    perceive(s, e);
  },
  lineCut(s, conv, cutter, victim, worker, allowed) {
    const e = addEvent(s, 'line_cut', { actors: [cutter, victim, worker].filter(Boolean), importance: .5, data: { cutter, victim, worker, allowed } });
    perceive(s, e);
    const a = s.actors[cutter];
    if (!a) return;
    s.queue = s.queue.filter(id => id !== cutter);
    if (allowed) s.queue.splice(s.checkout ? 1 : 0, 0, cutter); else { s.queue.push(cutter); adjust(s, cutter, worker, { griev: 6 }); }
    a.cutting = false; a.qslot = -1;
  },
  argument(s, conv, customer, worker, p) {
    const e = addEvent(s, 'argument', { actors: [customer, worker], importance: .6, data: { customer, worker, product: p } });
    perceive(s, e);
    adjust(s, customer, worker, { griev: 25, trust: -8 }); adjust(s, worker, customer, { griev: 20, trust: -6 });
    s.reputation[customer] = Math.max(0, s.reputation[customer] - 5);
  },
  reconcile(s, conv, a, b) {
    const e = addEvent(s, 'reconcile', { actors: [a, b], importance: .5, data: { a, b } });
    perceive(s, e);
    adjust(s, a, b, { griev: -25, fam: 4,trust:3,bond:3 }); adjust(s, b, a, { griev: -25, fam: 4,trust:3,bond:3 });
  },
  kindWords(s, conv, from, to) {
    if (s.memories[to].some(m => m.eventId && s.events.find(e => e.id === m.eventId)?.type === 'kind_words' && s.clock - m.at < 720)) return;
    const e = addEvent(s, 'kind_words', { actors: [from, to], importance: .4, data: { from, to } });
    perceive(s, e);
    adjust(s, to, from, { grat: 12, fam: 6,bond:4,trust:2 }); adjust(s, from, to, { fam: 4,bond:2 });
    P(s, to).status.mood = Math.min(100, P(s, to).status.mood + 10);
  },
  paidFor(s, conv, payer, payee) {
    const co = s.checkout;
    if (!co || co.customer !== payee || !s.actors[payer]) return;
    const short = co.total - co.budget;
    co.paidBy = { id: payer, amount: short };
    const o = openObligation(s, 'favor', { debtor: payee, creditor: payer, item: '대신 내 준 돈', eventId: null });
    const e = addEvent(s, 'paid_for', { actors: [payer, payee], importance: .7, data: { payer, payee, amount: short, obligationId: o.id } });
    o.eventId = e.id;
    perceive(s, e);
    adjust(s, payee, payer, { grat: 35, fam: 10, trust: 10,bond:6 }); adjust(s, payer, payee, { fam: 8,bond:3 });
  },
  removeItem(s, conv, customer) {
    const co = s.checkout;
    if (!co || co.customer !== customer) return;
    const byPrice = [...co.items].sort((a, b) => unitPrice(b) - unitPrice(a));
    while (co.items.length > 1 && co.total > co.budget) {
      const it = byPrice.shift();
      co.items.splice(co.items.indexOf(it), 1);
      returnToShelf(s, it.p, it);
      co.total -= unitPrice(it);
    }
  },
  favorThanks(s, conv, payee, payer) {
    const o = s.obligations.find(x => x.type === 'favor' && x.status === 'open' && x.debtor === payee && x.creditor === payer);
    if (!o) return;
    const e = addEvent(s, 'favor_thanks', { actors: [payee, payer], importance: .4, data: { payee, payer } });
    resolveObligation(s, o, e.id);
    for (const v of e.witnesses) learnResolved(s, v, o.id);
    perceive(s, e);
    adjust(s, payer, payee, { fam: 8, trust: 6 });
  },
  kidCandy(s, conv, child, parent, allowed) {
    const c = s.actors[child], p = s.actors[parent];
    const e = addEvent(s, 'kid_candy', { actors: [child, parent], importance: .3, data: { child, parent, allowed, childName: P(s, child).name } });
    perceive(s, e);
    if (!c || !c.cart.length) return;
    const item = c.cart[0];
    // If the parent is already paying, the item goes back rather than slipping out unpaid.
    if (allowed && p && !p.flags.paid && s.checkout?.customer !== parent) { p.cart.push(c.cart.shift()); P(s, child).status.mood = Math.min(100, P(s, child).status.mood + 15); }
    else { c.plan.unshift({ t: 'putBack', p: item.p }); P(s, child).status.mood -= 10; }
  },
  friendShare(s, conv, giver, receiver, p) {
    if (s.memories[receiver].some(m => m.key === `share:${giver}` && s.clock - m.at < 1440)) return;
    const e = addEvent(s, 'friend_share', { actors: [giver, receiver], importance: .3, data: { giver, receiver, product: p } });
    perceive(s, e);
    remember(s, receiver, { key: `share:${giver}`, kind: 'fact', about: [giver], text: `${P(s, giver).name}는 새 간식을 나눠 먹는 걸 좋아한다.`, importance: .3 });
    adjust(s, receiver, giver, { fam: 3, grat: 4,bond:2 });
  },
  hearsay(s, conv, teller, listener, memId) {
    const m = s.memories[teller].find(x => x.id === memId);
    if (!m || !s.actors[teller]) return;
    // Only listeners in earshot of the teller receive it.
    for (const h of witnessesAt(s, s.actors[teller], [teller, listener])) {
      if (h === teller || s.memories[h].some(x => x.eventId && x.eventId === m.eventId)) continue;
      remember(s, h, { kind: 'hearsay', eventId: m.eventId, about: m.about, text: `${nameFor(s, h, teller)}에게 들었다. ${hearsayText(s, m)}`, importance: Math.max(.2, m.importance - .25), source: 'told', sourceId: teller, data: m.data });
    }
    m.shared = (m.shared ?? 0) + 1;
  },
  meet(s, conv, a, b) {
    const e = addEvent(s, 'meet', { actors: [a, b], importance: .2, data: { a, b } });
    perceive(s, e);
    adjust(s, a, b, { fam: 3 }); adjust(s, b, a, { fam: 3 });
  },
  slipped(s, conv, who) {
    const e = addEvent(s, 'slipped', { actors: [who], importance: .35, data: { who } });
    perceive(s, e);
    s.reputation[who] = Math.max(0, s.reputation[who] - 2);
  },
  discountRefused(s, conv, customer, worker) {
    const e = addEvent(s, 'discount_refused', { actors: [customer, worker], importance: .3, data: { customer, worker } });
    perceive(s, e);
  },
  bagFlag(s, conv, customer, wants) { if (s.checkout?.customer === customer) s.checkout.bag = wants; },
  heatChoice(s, conv, customer, yes) { const a = s.actors[customer]; if (a) a.workerHeats = yes; },
  handoverItem(s, conv, from, to, memId) {
    const m = s.memories[from].find(x => x.id === memId);
    if (!m) return;
    for (const id of m.about) if (knowsName(s, from, id)) learnName(s, to, id);
    remember(s, to, { kind: m.kind === 'promise' ? 'promise' : 'fact', eventId: m.eventId, topic:m.topic, perspective:'handover', about: m.about, text: `${P(s, from).name}의 인수인계. ${m.handoverText ?? m.text}`, importance: m.importance, source: 'handover', sourceId: from, resolved: m.resolved, obligationId: m.obligationId, data: m.data });
    m.handedTo = [...(m.handedTo ?? []), to];
  },
  handoverResolved(s, conv, from, to, obligationId) {
    learnResolved(s, to, obligationId, `${P(s, from).name}의 인수인계. 빌려준 우산은 돌아왔다.`,{source:'handover',sourceId:from});
  },
  troubleDone(s, conv, type, customer, w, outcome, product) { recordTrouble(s, type, { customer, worker: w, outcome, product }, KIT); },
  refund(s, conv, customer, w, p, saleId) {
    const sale = s.ledger.find(x => x.id === saleId), price = PRODUCTS[p].price;
    if (!sale || sale.refunded || !s.actors[customer]) return;
    // The returned item cannot be resold: it moves from sold to wasted, and the money goes back.
    sale.refunded = true; s.money -= price; s.sales.revenue -= price;
    s.counts[p].sold--; s.counts[p].wasted++;
    pushLedger(s, { kind: 'refund', amount: -price, items: [[p, 1]], customer, worker: w, sale: saleId });
    recordTrouble(s, 'refund_demand', { customer, worker: w, outcome: 'refunded', product: p }, KIT);
  },
  umbrellaLost(s, conv, customer, w, loanId) {
    const o = s.obligations.find(x => x.id === loanId && x.status === 'open');
    if (!o) return;
    const e = recordTrouble(s, 'umbrella_lost', { customer, worker: w }, KIT);
    resolveObligation(s, o, e.id, 'broken');
    for (const v of e.witnesses) learnResolved(s, v, o.id);
    s.rental.total = Math.max(0, s.rental.total - 1);
  },
  umbrellaForgot(s, conv, customer, w) { adjust(s, w, customer, { trust: -4 }); },
  cardToss(s) { s.nuisance.cardUntil = s.elapsed + 1.5; },
  toldWalkout(s, conv, teller, w, culprit) {
    if (!s.people[culprit]) return;
    remember(s, w, { key: 'trouble:' + culprit, kind: 'conflict', about: [culprit], text: nameFor(s, w, culprit) + '이(가) 계산 안 하고 나갔다고 손님에게 들었다.', importance: .5, source: 'told', sourceId: teller, data: { trouble: 'walkout', handoverLine: '{n}이 계산 안 하고 나갔대요.' } });
    adjust(s, w, culprit, { trust: -8 }); adjust(s, w, teller, { trust: 4, fam: 2 });
  },
  charge(s, conv, customer) { s.nuisance.charging = customer; },
  wakeUp(s, conv, customer, w) {
    const a = s.actors[customer];
    if (!a) return;
    a.anim = 'idle'; a.dozing = false;
    recordTrouble(s, 'drunk', { customer, worker: w }, KIT);
  },
  stopHog(s, conv, customer, w) {
    const a = s.actors[customer];
    if (!a) return;
    a.hogging = false;
    if (s.nuisance.charging === customer) s.nuisance.charging = null;
    recordTrouble(s, 'seat_hog', { customer, worker: w }, KIT);
    adjust(s, customer, w, { griev: 5 });
  },
  quieted(s, conv, visitId) { const v = s.visits.find(x => x.id === visitId); if (v) v.flags.quieted = true; },
  reach(s, conv, w) { const x = s.actors[w]; if (x) x.reachUntil = s.elapsed + .6; },
  parcelIn(s, conv, customer, w) {
    const a = s.actors[customer];
    if (!a?.parcelToSend) return;
    a.parcelToSend = false; s.interior.parcels.push({ id: 'pc' + s.interior.nextParcel++, kind: 'send', from: customer, day: s.day });
    const x = s.actors[w]; if (x) x.reachUntil = s.elapsed + .6;
  },
  parcelOut(s, conv, customer, w, id) {
    const i = s.interior.parcels.findIndex(x => x.id === id && x.for === customer);
    if (i < 0 || !s.actors[customer]) return;
    s.interior.parcels.splice(i, 1);
    s.actors[customer].holding = s.actors[customer].holding ?? 'parcel';
    const e = addEvent(s, 'parcel_pickup', { actors: [customer, w], importance: .3, data: { customer, worker: w } });
    remember(s, customer, { eventId: e.id, about: [w], text: '기다리던 택배를 찾아갔다.', importance: .25 });
  },
  finishHandover(s, conv, from, to) { completeHandover(s, from, to); },
  keepPromise(s, conv, obligationId, customer) { const o = s.obligations.find(x => x.id === obligationId && x.status === 'open'); if (o) keepPromise(s, o, customer); },
  chat(s, conv, a, b) { if (conv.lastTopic) { adjust(s, a, b, { fam: 3,bond:2,trust:1 }); adjust(s, b, a, { fam: 3,bond:2,trust:1 }); } },
  checkoutTalkDone(s, conv) { if (s.checkout && s.checkout.convId === conv.id) s.checkout.talkDone = true; }
};
function hearsayText(s, m) {
  if (m.share === 'umbrella') return '여기서 매장 우산을 빌려준다.';
  if (m.share === 'soldout') return `여기 ${J.i(pname(m.data.product))} 자주 떨어진다.`;
  if (m.share === 'paidfor') return '여기서 누가 학생 라면값을 대신 내 줬다.';
  return m.text;
}

// ---------- stock and money ----------
export function canOrder(s, p, qty) { const d = Object.hasOwn(PRODUCTS,p)?PRODUCTS[p]:null; return !!d && Number.isInteger(qty)&&qty>0&&qty<=60&&(s.orders.pending[p]??0)+qty<=500&&(!d.facility || s.facilities[d.facility]) && s.money >= d.cost * qty; }
export function canWorkerOrder(s,p,qty){return orderMode(s,p)==='auto'&&canOrder(s,p,qty)&&orderAllowance(s)>=PRODUCTS[p].cost*qty;}
export function placeOrder(s, p, qty, by = 'player') {
  if (!(qty > 0) || qty > 60 || !canOrder(s, p, qty)||by!=='player'&&by!=='approval'&&!canWorkerOrder(s,p,qty)) return false;
  const cost = PRODUCTS[p].cost * qty;
  s.money -= cost;
  s.orders.pending[p] = (s.orders.pending[p] ?? 0) + qty;
  s.management.spent+=cost;s.management.today.orderCost+=cost;
  pushLedger(s, { kind: 'order', amount: -cost, items: [[p, qty]], by });
  if(by==='player'||by==='approval')recordDecision(s,'order',p,0,qty);
  return true;
}
function pushLedger(s, entry) {
  if(entry.kind==='sale')recordSale(s,entry.items??[],entry.by);
  if(entry.kind==='expense')s.management.today.expense+=-entry.amount;
  if(entry.kind==='waste')for(const [p,n]of entry.items??[])s.management.today.waste[p]=(s.management.today.waste[p]??0)+n;
  s.ledger.push({ id: nextId(s, 't'), at: s.clock, ...entry });
  if (s.ledger.length > 200) s.ledger.splice(0, s.ledger.length - 200);
  s.stats.totals ??= { sale: 0, order: 0 };
  if (entry.kind === 'sale' || entry.kind === 'refund') s.stats.totals.sale += entry.amount;
  if (entry.kind === 'order') s.stats.totals.order += -entry.amount;
  if (entry.kind === 'expense') s.stats.totals.expense=(s.stats.totals.expense??0)-entry.amount;
}
const heldCount = (s, p) => s.holds.filter(h => h.p === p).length;
export const availableBack = (s, p) => Math.max(0, s.back[p] - heldCount(s, p));
function takeFromShelf(s, p) {
  if (s.shelf[p] <= 0) return false;
  s.shelf[p]--;
  return true;
}
function returnToShelf(s, p, it = null) { s.shelf[p]++; putBackUnit(s, it); }
function consumeBatch(s, p, n = 1) {
  const b = s.batches[p];
  if (!b) return;
  while (n > 0 && b.length) { const take = Math.min(n, b[0].n); b[0].n -= take; n -= take; if (!b[0].n) b.shift(); }
}
function deliver(s) {
  const boxes = [];
  for (const [p, qty] of Object.entries(s.orders.pending)) {
    if (!qty) continue;
    s.counts[p].delivered += qty;
    if (s.batches[p]) s.batches[p].push({ day: s.day, n: qty });
    for (let left = qty; left > 0; left -= 6) boxes.push({ id: nextId(s, 'b'), p, n: Math.min(6, left) });
  }
  s.orders.pending = {};
  // One unit per due promise is set aside in the back room for that customer.
  for (const o of s.obligations) {
    if (o.type !== 'restock_promise' || o.status !== 'open' || o.dueDay > s.day || s.holds.some(h => h.obligationId === o.id)) continue;
    const box = boxes.find(b => b.p === o.product && b.n > 0);
    if (!box) continue;
    box.n--; s.back[o.product]++;
    s.holds.push({ id: nextId(s, 'h'), p: o.product, for: o.creditor, obligationId: o.id, day: s.day });
  }
  s.boxes.push(...boxes.filter(b => b.n > 0));
  if (boxes.length) addEvent(s, 'delivery', { actors: [], importance: .15, data: { boxes: boxes.length } });
}
function wasteExpired(s) {
  for (const [p, list] of Object.entries(s.batches)) {
    const life = PRODUCTS[p].expires;
    let wasted = 0;
    while (list.length && list[0].day + life < s.day) wasted += list.shift().n;
    if (!wasted) continue;
    // Take expired units from the back room first, then the shelf. Units in carts are already counted out.
    let left = wasted;
    const fromBack = Math.min(left, availableBack(s, p)); s.back[p] -= fromBack; left -= fromBack;
    const fromShelf = Math.min(left, s.shelf[p]); s.shelf[p] -= fromShelf; left -= fromShelf;
    const actual = wasted - left;
    s.counts[p].wasted += actual;
    if (actual) { pushLedger(s, { kind: 'waste', amount: 0, items: [[p, actual]], value: actual * PRODUCTS[p].cost }); addEvent(s, 'waste', { importance: .15, data: { product: p, n: actual } }); }
  }
}
function autoOrder(s) {
  for(const r of recommendations(s,'auto'))if(r.qty>0)placeOrder(s,r.p,r.qty,s.onDuty);
  if(!s.management.draft){const rows=recommendations(s,'approval').filter(r=>r.qty>0);if(rows.length)s.management.draft={at:s.clock,items:Object.fromEntries(rows.map(r=>[r.p,r.qty])),pending:JSON.stringify(s.orders.pending)};}
}
// Stock that has left the shelf but is not yet paid: in carts of people in the store.
export function inCarts(s, p) {
  let n = 0;
  for (const a of Object.values(s.actors)) for (const it of a.cart ?? []) if (it.p === p) n++;
  if (s.checkout) for (const it of s.checkout.items) if (it.p === p) n++;
  return n;
}
export function stockAudit(s) {
  const out = {};
  for (const p of Object.keys(PRODUCTS)) {
    const c = s.counts[p], inBoxes = s.boxes.filter(b => b.p === p).reduce((n, b) => n + b.n, 0);
    const carried = Object.values(s.actors).reduce((n, a) => n + (a.holding?.p === p ? a.holding.n : 0), 0);
    const expected = c.start + c.delivered - c.sold - c.wasted;
    const actual = s.shelf[p] + s.back[p] + inBoxes + carried + inCarts(s, p);
    out[p] = { expected, actual };
  }
  return out;
}

// ---------- spawning ----------
function windowMatch(s, life) {
  const m = minuteOfDay(s);
  let best = 0;
  for (const [a, b] of life.windows ?? []) for (const t of [m, m + 1440]) {
    if (t >= a && t <= b) best = 1; else if (t >= a - 40 && t <= b + 40) best = Math.max(best, .25);
  }
  return best;
}
function recency(s, id) { const since = s.clock - P(s, id).lastVisitAt; return since < 300 ? 0 : Math.min(1.2, .3 + (since - 300) / 900); }
function visitBias(s, id) {
  let w = neighborhoodBias(s,P(s,id));
  if (openUmbrellaLoan(s, id)) w *= 3;
  if (s.obligations.some(o => o.status === 'open' && o.creditor === id && o.type === 'restock_promise')) w *= 1.5;
  if (s.weather.kind === 'rain' || s.weather.kind === 'storm') w *= .75;
  return w;
}
function director(s) {
  for (const st of [...(s.director.story ?? [])]) if (s.clock >= st.at) { s.director.story.splice(s.director.story.indexOf(st), 1); startVisit(s, st.members, null, st.opts); }
  if (s.clock < s.director.nextAt) return;
  s.director.nextAt = s.clock + 2;
  const present = Object.values(s.actors).filter(a => a.role === 'customer').length;
  if (s.visits.length >= MAX_VISITS || present >= 10) return;
  const busy = new Set(Object.keys(s.actors));
  const options = [];
  for (const g of s.groups) {
    if (g.members.some(m => busy.has(m))) continue;
    const subset = weighted(s, g.subsets.map(([ids, w]) => [ids, w]));
    const w = Math.min(...subset.map(id => windowMatch(s, effectiveLife(s,P(s, id))) * recency(s, id))) * g.frequency * Math.max(...subset.map(id => visitBias(s, id)));
    if (w > 0) options.push([{ members: subset, groupId: g.id }, w]);
  }
  for (const def of Object.values(s.people)) {
    if (def.kind !== 'customer' || busy.has(def.id)) continue;
    const life = effectiveLife(s,def);
    if (!life.frequency) continue;
    // Members of groups mostly come with them; solo visits for them are covered by group subsets.
    if (def.groups.length) continue;
    const w = windowMatch(s, life) * recency(s, def.id) * life.frequency * visitBias(s, def.id);
    if (w > 0) options.push([{ members: [def.id], groupId: null }, w]);
  }
  const total = options.reduce((n, [, w]) => n + w, 0);
  if (!total) return;
  const busyFactor = present >= 6 ? .4 : 1;
  if (rand(s) > Math.min(.55, total * .09) * busyFactor) return;
  const choice = weighted(s, options);
  startVisit(s, choice.members, choice.groupId,{casual:true});
}

export function startVisit(s, members, groupId = null, opts = {}) {
  if (members.some(id => s.actors[id]) || !members.length) return null;
  const g = s.groups.find(x => x.id === groupId);
  const v = { id: nextId(s, 'v'), members: [...members], groupId: g?.id ?? null, purpose: g?.purpose ?? P(s, members[0]).genes.life.purposes?.[0] ?? '', payMode: g && members.length > 1 ? g.payMode : 'separate', payer: null, leaveTogether: !!(g?.leaveTogether && members.length > 1), at: s.clock, absent: g ? g.members.filter(m => !members.includes(m)) : [], flags: {} };
  if (v.payMode === 'together') v.payer = g.payer && members.includes(g.payer) ? g.payer : members[0];
  s.visits.push(v);
  const side = pick(s, [0, 1]);
  for(const id of members)P(s,id).firstVisitDay??=s.day;
  members.forEach((id, i) => spawnCustomer(s, id, v, { ...opts, side, index: i }));
  addEvent(s, 'arrival', { actors: members, importance: .1, data: { visit: v.id, group: v.groupId }, place: center(...SPOTS.doorIn) });
  return v;
}

function baseActor(s, id, role, x, y) {
  return { id, role, x, y, path: [], goal: null, dir: 'down', walk: 0, anim: 'idle', animT: 0, plan: [], cur: null, phase: 0, t: 0, cart: [], bag: [], holding: null, spot: null, stuck: 0, lastX: x, lastY: y, state: '', enteredAt: s.clock, qslot: -1, flags: {}, talkUntil: 0 };
}
function spawnCustomer(s, id, v, opts) {
  const p = P(s, id), life = effectiveLife(s,p), t = p.genes.temperament;
  const edge = SPOTS.street[opts.side + (opts.index % 2) * 2];
  const start = opts.inside ? center(10 + (opts.index % 2), 13 - opts.index) : center(...edge);
  const a = baseActor(s, id, 'customer', start.x - (opts.inside ? 0 : opts.index * 14), start.y);
  a.visitId = v.id;
  const raining = s.weather.kind === 'rain' || s.weather.kind === 'storm';
  a.hasUmbrella = opts.noUmbrella ? false : !raining || rand(s) * 100 < life.umbrellaHabit;
  if (raining && a.hasUmbrella) a.ownUmbrella = true;
  if (openUmbrellaLoan(s, id)) { if (keepsUmbrella(s, a, KIT)) { a.holding = 'rental'; a.hasUmbrella = true; a.flags.returning = true; } else a.flags.forgotUmbrella = true; }
  const m = minuteOfDay(s);
  p.status.hunger = Math.min(100, 30 + (m > 1080 || m < 120 ? 35 : 10) + rand(s) * 25);
  p.status.hurry = Math.min(100, (life.background.includes('배달') ? 70 : 20) + (100 - t.patience) * .3 + rand(s) * 15);
  p.status.mood = Math.max(10, Math.min(95, 55 + (raining && !a.hasUmbrella ? -10 : 0) + (rand(s) - .5) * 20 + (t.kindness - 50) * .2));
  p.status.fatigue = Math.min(100, 30 + (m < 360 ? 40 : m > 1260 ? 25 : 0) + rand(s) * 15);
  a.budget = life.budget;
  a.payment=paymentMethod(p,s.day);
  a.hasId=opts.hasId??((s.seed+id.length+s.day)%10!==0);
  a.requestedProduct=opts.requestTobacco??(s.facilities.tobaccoSales?life.tobacco:null);
  const change=p.lifeChange&&s.day<p.lifeChange.end?LIFE_CHANGES[p.lifeChange.kindIndex]:null;
  if(change){p.status.hurry=Math.max(0,Math.min(100,p.status.hurry+change.hurry));p.status.fatigue=Math.max(0,Math.min(100,p.status.fatigue+change.fatigue));}
  if(s.facilities.warmLight){const lift=Math.min(4,100-p.status.mood);p.status.mood+=lift;s.management.feedback.totals.lightLift+=lift;}
  // A stable weekly outfit makes a return visually different without changing identity.
  const week=Math.floor((s.day-1)/7);
  p.baseTopColor??=p.genes.appearance.top.color;
  const wardrobe=['#738f89','#b88d73','#9c8aa4','#8c9f65','#bd977c','#6c86a0'];
  p.genes.appearance.top.color=week%2?wardrobe[(p.genes.seed+week)%wardrobe.length]:p.baseTopColor;
  a.parcelToSend = p.genes.appearance.age !== 'child' && p.genes.appearance.age !== 'teen' && rand(s) < .035;
  if (a.parcelToSend) a.holding = a.holding ?? 'parcel';
  const hasBusiness=s.obligations.some(o=>o.status==='open'&&(o.debtor===id||o.creditor===id))||a.parcelToSend||a.requestedProduct||s.interior.parcels.some(x=>x.for===id&&x.kind==='arrive');
  // Let the authored opening finish before introducing incidental, non-purchase visits.
  const casual=opts.casual&&!hasBusiness&&s.clock>=OPENING_TIME+90;
  a.visitPurpose=chooseVisitPurpose(s,p,v,{...opts,casual},casual?rand(s):1);
  if(a.visitPurpose!=='shopping'&&v.members.length===1)v.purpose=VISIT_PURPOSES[a.visitPurpose];
  if(a.visitPurpose==='wait')a.waitFor=s.groups.find(g=>g.kind==='friends'&&g.members.includes(id))?.members.find(other=>other!==id)??null;
  if (!opts.inside&&a.visitPurpose==='shopping') troubleOnSpawn(s, a, KIT);
  a.plan = buildPlan(s, a, v);
  if (!opts.inside&&a.visitPurpose==='shopping') troublePlan(s, a, a.plan, KIT);
  if (opts.inside) { a.plan = a.plan.filter(st => st.t !== 'enter' && (st.t !== 'atm'||a.visitPurpose==='atm')); a.flags.entered = true; a.flags.visitCounted=true;s.management.today.visits[a.visitPurpose]=(s.management.today.visits[a.visitPurpose]??0)+1; }
  s.actors[id] = a;
  p.status.action = '들어오는 중';
}
function buildPlan(s, a, v) {
  const p = P(s, a.id), life = effectiveLife(s,p), t = p.genes.temperament, plan = [{ t: 'enter' }];
  const isChild = p.genes.appearance.age === 'child';
  if(a.visitPurpose!=='shopping'){
    if(a.visitPurpose==='atm')plan.push({t:'atm'});
    else if(a.visitPurpose==='restroom')plan.push({t:'restroom'});
    else plan.push({t:'linger',reason:a.visitPurpose,p:life.favorites.find(p=>!PRODUCTS[p].facility&&!PRODUCTS[p].counter&&!PRODUCTS[p].staffOnly)??'water'});
    plan.push({t:'leave'});return plan;
  }
  const wants = [];
  if (isChild) { const r = rand(s); wants.push(r < .5 ? 'candy' : r < .8 ? 'iceCream' : 'banana'); }
  else {
    const favs = life.favorites.filter(f => !PRODUCTS[f].facility || s.facilities[PRODUCTS[f].facility]);
    if (favs.length) wants.push(favs[0]);
    if (favs[1] && rand(s) < .45) wants.push(favs[1]);
    const neighborhood=activeSchedule(s);
    if(neighborhood&&neighborhoodBias(s,p)>1){const extra=neighborhood.products[(s.day+p.genes.seed)%neighborhood.products.length];if(!wants.includes(extra))wants.push(extra);}
    if (rand(s) * 100 < t.impulsivity * .5) {
      const pool = Object.keys(PRODUCTS).filter(k => !PRODUCTS[k].facility && !PRODUCTS[k].staffOnly && k !== 'candy' && PRODUCTS[k].fixture !== 'counterRack' && (!PRODUCTS[k].adult || eligibleForTobacco(p)));
      const home = FIXTURES[PRODUCTS[wants[0]]?.fixture], close = home ? pool.filter(k => { const f = FIXTURES[PRODUCTS[k].fixture]; return Math.abs(f.x - home.x) + Math.abs(f.y - home.y) <= 7; }) : pool;
      const extra = pick(s, close.length ? close : pool);
      if (!wants.includes(extra)) wants.push(extra);
    }
    const promos = Object.keys(s.interior.promos).filter(k => PRODUCTS[k].fixture !== 'counterRack' && (!PRODUCTS[k].facility || s.facilities[PRODUCTS[k].facility]) && (!PRODUCTS[k].adult || eligibleForTobacco(p)));
    if (promos.length && rand(s) < .25 + t.impulsivity / 300) { const x = pick(s, promos); if (!wants.includes(x)) wants.push(x); }
    const raining = s.weather.kind === 'rain' || s.weather.kind === 'storm';
    if (raining && !a.hasUmbrella && s.facilities.umbrellaSale && life.budget >= PRODUCTS.umbrella.price + 1000 && rand(s) < .6) wants.push('umbrella');
  }
  // Keep within budget, cheapest priorities first after the main want.
  const reserveTobacco=a.requestedProduct&&eligibleForTobacco(p)&&a.hasId?PRODUCTS[a.requestedProduct].price:0;
  let sum = reserveTobacco;
  const affordable = [];
  for (const w of wants) { if (isChild || sum + PRODUCTS[w].price <= life.budget * (reserveTobacco?1:1.15) || (!affordable.length&&!reserveTobacco)) { affordable.push(w); sum += PRODUCTS[w].price; } }
  if (!isChild && p.genes.appearance.age !== 'teen' && rand(s) < (life.budget < 5000 ? .25 : .05)) plan.push({ t: 'atm' });
  for (const w of affordable) plan.push({ t: 'shop', p: w });
  if (isChild) { plan.push({ t: 'askParent' }); plan.push({ t: 'follow' }); }
  else if (v.payMode === 'together' && v.payer !== a.id) plan.push({ t: 'give' });
  else plan.push({ t: 'checkout' });
  plan.push({ t: 'regroup' }, { t: 'leave' });
  return plan;
}
export function spawnWorker(s, id, atPos = false) {
  const start = atPos ? center(...SPOTS.pos) : center(...SPOTS.street[rand(s) < .5 ? 0 : 1]);
  const a = baseActor(s, id, 'worker', start.x, start.y);
  a.state = atPos ? '계산대를 지키는 중' : '출근하는 중';
  a.job = null;
  if (atPos) a.dir = 'down';
  s.actors[id] = a;
  P(s, id).status.action = a.state;
  P(s, id).status.fatigue = 15;
  return a;
}

// ---------- movement ----------
function goTo(s, a, cell) {
  const target = center(cell[0], cell[1]);
  a.goal = target;
  a.path = findPath(a, target, { staff: a.role === 'worker', facilities: s.facilities });
  if (!a.path.length && Math.hypot(a.x - target.x, a.y - target.y) > 2) {
    const rescue = nearestFloor(a, { staff: a.role === 'worker', facilities: s.facilities });
    a.x = rescue.x; a.y = rescue.y;
    a.path = findPath(a, target, { staff: a.role === 'worker', facilities: s.facilities });
  }
  return a.path.length > 0 || Math.hypot(a.x - target.x, a.y - target.y) <= 2;
}
const arrived = a => !a.path.length && a.goal && Math.hypot(a.x - a.goal.x, a.y - a.goal.y) < 2;
const near = (a, b, r = 40) => a && b && !a.privateRoom && !b.privateRoom && Math.hypot(a.x - b.x, a.y - b.y) <= r;
function speedOf(s, a) {
  const p = P(s, a.id), app = p.genes.appearance;
  let v = (a.drunk ? 63 : 90) * (p.genes.life.walkSpeed ?? (app.age === 'elder' ? .7 : app.age === 'child' ? .95 : 1));
  if (p.status.hurry > 60) v *= 1.15;
  if (a.holding?.p) v *= .85;
  return v;
}
function moveActors(s, dt) {
  for (const a of Object.values(s.actors)) {
    if(a.role==='customer'&&a.path.length&&s.elapsed<(a.yieldUntil??0)){a.anim='idle';continue;}
    if(a.role==='customer'&&a.path.length&&temper(s,a.id).kindness>=80&&s.clock-(a.lastYieldAt??-1e9)>720){
      const other=Object.values(s.actors).find(b=>b.id!==a.id&&b.role==='customer'&&b.path.length&&s.elapsed>=(b.yieldUntil??0)&&near(a,b,25));
      if(other&&!inConversation(s,a.id)){
        a.yieldUntil=s.elapsed+.5;a.lastYieldAt=s.clock;a.anim='idle';
        const e=addEvent(s,'seat_yield',{actors:[a.id,other.id],importance:.25});
        remember(s,other.id,{eventId:e.id,about:[a.id],text:'매장 통로에서 먼저 지나가도록 기다려줬다.',importance:.25,tone:'warm'});
        adjust(s,other.id,a.id,{trust:2});
        startConversation(s,'yield',[{sp:a.id,to:other.id,k:'yield',literal:'먼저 지나가세요.',noAi:true,delay:.1}],{members:[a.id,other.id]});continue;
      }
    }
    let budget = dt * speedOf(s, a);
    const moving = a.path.length > 0;
    while (a.path.length && budget > 0) {
      const p = a.path[0], dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy);
      if (d > .01) a.dir = directionFromVector(dx,dy,a.dir);
      if (d <= budget) { a.x = p.x; a.y = p.y; a.path.shift(); budget -= d; }
      else { a.x += dx / d * budget; a.y += dy / d * budget; budget = 0; }
    }
    if (moving) { a.walk += dt * 9; a.anim = 'walk'; }
    else if (a.anim === 'walk') a.anim = 'idle';
    // Stuck watchdog: re-plan if a walking person makes no progress.
    if (a.path.length && Math.hypot(a.x - a.lastX, a.y - a.lastY) < .5) {
      a.stuck += dt;
      if (a.stuck > 2 && a.goal) { const g = a.goal; goTo(s, a, cellOf(g)); a.stuck = 0; }
    } else a.stuck = 0;
    a.lastX = a.x; a.lastY = a.y;
  }
}
function reserve(s, key, id) { if (s.reserved[key] && s.reserved[key] !== id && s.actors[s.reserved[key]]) return false; s.reserved[key] = id; return true; }
function release(s, a) { for (const [k, v] of Object.entries(s.reserved)) if (v === a.id) delete s.reserved[k]; a.spot = null; }
function freeAccess(s, fixtureId, a) {
  const f = FIXTURES[fixtureId];
  const cells = f.access.filter(([x, y]) => floorCell(x, y, { facilities: s.facilities }));
  const sorted = cells.map(c => ({ c, d: Math.hypot(center(c[0], c[1]).x - a.x, center(c[0], c[1]).y - a.y) })).sort((x, y) => x.d - y.d);
  for (const { c } of sorted) if (reserve(s, `cell:${c[0]},${c[1]}`, a.id)) return c;
  return null;
}
function freeSeat(s, a) {
  const cells=[];
  for (const id of ['table', 'table2']) {
    const f = FIXTURES[id];
    if (f.facility && !s.facilities[f.facility]) continue;
    for (const c of f.access) if (!s.trash.some(t => t.cell[0] === c[0] && t.cell[1] === c[1]))cells.push(c);
  }
  for(const choice of rankSeats(s,a,cells))if(reserve(s,`cell:${choice.cell[0]},${choice.cell[1]}`,a.id)){
    a.socialChoice=choice.reason;
    if(choice.reason?.kind==='away'){const other=s.actors[choice.reason.person],point=center(choice.cell[0],choice.cell[1]);if(!other||near(point,other,63))a.socialChoice=null;}
    return choice.cell;
  }
  return null;
}
const seatCount = s => FIXTURES.table.access.length + (s.facilities.extraTable ? FIXTURES.table2.access.length : 0);
function freeWaitSpot(s, a, list) {
  for (const c of list) if (reserve(s, `cell:${c[0]},${c[1]}`, a.id)) return c;
  return list[0];
}

// ---------- customer steps ----------
const STEPS = {
  restroom(s,a){
    const room=s.interior.restroom;
    if(a.phase===0){
      if(room.by){a.t+=SIM_DT;a.state='화장실이 비기를 기다리는 중';if(a.t>6)return true;return false;}
      const cell=freeAccess(s,'restroom',a);if(!cell){a.t+=SIM_DT;return a.t>6;}
      a.spot=cell;goTo(s,a,cell);a.phase=1;a.state='화장실로 가는 중';
    }
    if(a.phase===1&&arrived(a)){
      if(room.by&&room.by!==a.id){release(s,a);a.phase=0;a.t=0;return false;}
      if(inConversation(s,a.id))return false;
      room.by=a.id;a.privateRoom=true;a.phase=2;a.t=2+(P(s,a.id).genes.seed%4)*.5;a.state='화장실 이용 중';a.anim='idle';
    }
    if(a.phase===2){
      a.t-=SIM_DT;if(a.t>0)return false;
      room.by=null;room.uses++;a.privateRoom=false;a.flags.purposeCompleted=true;release(s,a);a.state='손을 씻고 나오는 중';return true;
    }return false;
  },
  enter(s, a, st) {
    if (a.phase === 0) { goTo(s, a, SPOTS.doorIn); a.state = '들어오는 중'; a.phase = 1; }
    if (a.phase === 1 && arrived(a)) {
      a.flags.entered = true;
      if(!a.flags.visitCounted){a.flags.visitCounted=true;const purpose=a.visitPurpose??'shopping';s.management.today.visits[purpose]=(s.management.today.visits[purpose]??0)+1;}
      const shopping = a.plan.filter(x => x.t === 'shop').length;
      if (s.interior.baskets.stack > 0 && P(s, a.id).genes.appearance.age !== 'child' && (shopping >= 3 || (shopping === 2 && rand(s) < .35))) { s.interior.baskets.stack--; a.basket = true; }
      const raining = s.weather.kind === 'rain' || s.weather.kind === 'storm';
      if (raining) {const water=s.weather.intensity>=2?.07:.04,f=s.management.feedback.totals;f.rainEntries++;if(s.facilities.welcomeMat)f.waterBlocked+=Math.min(1,s.wetness+water)-Math.min(1,s.wetness+water*.3);s.wetness = Math.min(1, s.wetness + water*(s.facilities.welcomeMat?.3:1));}
      onEnter(s, a);
      return true;
    }
    return false;
  },
  linger(s,a,st){
    if(a.phase===0){
      const cell=st.reason==='browse'?freeAccess(s,PRODUCTS[st.p].fixture,a):SPOTS.waitInside.find(c=>reserve(s,`cell:${c[0]},${c[1]}`,a.id));
      if(!cell){a.t+=SIM_DT;return a.t>4;}
      a.spot=cell;goTo(s,a,cell);a.phase=1;a.state=st.reason==='browse'?'가격을 보러 가는 중':st.reason==='shelter'?'입구 안에서 비를 피하는 중':'친구를 기다릴 곳을 찾는 중';
    }
    if(a.phase===1&&arrived(a)){a.dir=a.spot?.[2]??'down';a.anim=st.reason==='browse'?'browse':'idle';a.phase=2;a.t=st.reason==='browse'?3:st.reason==='shelter'?12:15;a.state=st.reason==='browse'?`${pname(st.p)} 가격을 살펴보는 중`:st.reason==='shelter'?'잠시 비를 피하는 중':'친구를 기다리는 중';}
    if(a.phase===2){
      a.t-=SIM_DT;const friend=a.waitFor&&s.actors[a.waitFor];
      const met=st.reason==='wait'&&friend&&isInside(friend)&&Math.hypot(friend.x-a.x,friend.y-a.y)<90;
      if(a.t>0&&!met&&!(st.reason==='shelter'&&!['rain','storm'].includes(s.weather.kind)))return false;
      a.flags.purposeCompleted=true;release(s,a);a.anim='idle';return true;
    }return false;
  },
  shop(s, a, st) {
    const def = PRODUCTS[st.p];
    if(def.staffOnly){a.requestedProduct=st.p;return true;}
    if (def.counter) { (a.counterAsk ??= []).push(st.p); return true; }
    if (a.phase === 0) {
      const cell = freeAccess(s, def.fixture, a);
      if (!cell) { a.t += SIM_DT; a.state = '자리가 나기를 기다리는 중'; if (a.t > 3) return true; return false; }
      a.spot = cell; goTo(s, a, cell); a.phase = 1; a.t = 0; a.state = `${FIXTURES[def.fixture].name} 쪽으로 가는 중`;
    }
    if (a.phase === 1 && arrived(a)) {
      const f = FIXTURES[def.fixture], acc = f.access.find(c => c[0] === a.spot[0] && c[1] === a.spot[1]);
      a.dir = acc?.[2] ?? 'up'; a.anim = 'browse'; a.phase = 2; a.state = '물건을 둘러보는 중';
      const t = temper(s, a.id);
      a.t = .8 + t.meticulous / 45 - t.impulsivity / 140 + rand(s) * 1.2;
    }
    if (a.phase === 2) {
      a.t -= SIM_DT;
      if (a.t > 0) return false;
      a.anim = 'pick'; a.animT = .5; a.phase = 3; a.t = .5;
      pickProduct(s, a, st.p);
    }
    if (a.phase === 3) { a.t -= SIM_DT; if (a.t > 0) return false; release(s, a); a.anim = 'idle'; return true; }
    return false;
  },
  putBack(s, a, st) {
    const def = PRODUCTS[st.p];
    if (a.phase === 0) { const cell = FIXTURES[def.fixture].access[0]; goTo(s, a, cell); a.phase = 1; a.state = '물건을 제자리에 두는 중'; }
    if (a.phase === 1 && arrived(a)) {
      const i = a.cart.findIndex(it => it.p === st.p);
      if (i >= 0) { const [it] = a.cart.splice(i, 1); returnToShelf(s, st.p, it); messUp(s, def.fixture, 60); }
      a.anim = 'pick'; a.dir = FIXTURES[def.fixture].access[0][2];
      return true;
    }
    return false;
  },
  askParent(s, a, st) {
    const v = visitOf(s, a), parent = v?.members.find(id => id !== a.id && s.actors[id]);
    if (!parent || !a.cart.length) return true;
    const pa = s.actors[parent];
    if (a.phase === 0) { a.phase = 1; a.t = 0; }
    if (a.phase === 1) {
      a.t += SIM_DT;
      if (a.t % 1 < SIM_DT) goTo(s, a, cellOf(pa));
      a.state = '아빠한테 가는 중';
      if (near(a, pa, 44) || a.t > 6) {
        a.path = []; a.phase = 2;
        startConversation(s, 'kid_candy', [
          { sp: a.id, to: parent, k: 'kid_want', reveals: null, delay: .2 },
          { sp: parent, to: a.id, choices: [{ id: 'yes', k: 'parent_yes', effect: ['kidCandy', a.id, parent, true], then: [{ sp: a.id, to: parent, k: 'kid_ok' }] }, { id: 'no', k: 'parent_no', effect: ['kidCandy', a.id, parent, false], then: [{ sp: a.id, to: parent, k: 'kid_sulk' }] }], decider: ['parentAnswer', parent, a.id], must: true, effectFallback: true }
        ], { members: [a.id, parent], visitIds: [v.id] });
      }
    }
    if (a.phase === 2) return !inConversation(s, a.id);
    return false;
  },
  follow(s, a, st) {
    const v = visitOf(s, a), parent = v?.members.find(id => id !== a.id && s.actors[id]);
    if (!parent) return true;
    const pa = s.actors[parent];
    a.state = '아빠 옆에 있는 중';
    if (['regroup', 'leave'].includes(pa.cur?.t) || pa.flags.left) return true;
    a.t += SIM_DT;
    if (!near(a, pa, 50) && !a.path.length && a.t > 1) { a.t = 0; const c = cellOf(pa); goTo(s, a, [c[0] + (rand(s) < .5 ? 1 : -1), c[1]]) || goTo(s, a, c); }
    if (!a.path.length && near(a, pa, 50)) a.anim = rand(s) < .02 ? 'browse' : a.anim;
    return false;
  },
  give(s, a, st) {
    const v = visitOf(s, a), payer = s.actors[v?.payer];
    if (!a.cart.length) return true;
    if (!payer || payer.flags.paid || payer.flags.left) { a.plan.unshift({ t: 'checkout' }); return true; }
    a.t += SIM_DT; a.state = '일행에게 물건을 건네는 중';
    if (a.t % 1.2 < SIM_DT) goTo(s, a, cellOf(payer));
    if (near(a, payer, 44)) { payer.cart.push(...a.cart.splice(0)); a.path = []; return true; }
    if (a.t > 10) { a.plan.unshift({ t: 'checkout' }); return true; }
    return false;
  },
  checkout(s, a, st) {
    const v = visitOf(s, a);
    if (a.phase === 0) {
      const needCounter = a.cart.length || a.flags.returning || a.errands?.length || a.requestedProduct || a.counterAsk?.length || a.parcelToSend || s.interior.parcels.some(x => x.kind === 'arrive' && x.for === a.id);
      if (!needCounter) return true;
      // Together-payers wait for companions to bring their items.
      if (v?.payMode === 'together' && v.payer === a.id) {
        const pendingMembers = v.members.filter(id => id !== a.id && s.actors[id] && (['give', 'askParent', 'putBack'].includes(s.actors[id].cur?.t) || s.actors[id].plan.some(x => ['give', 'askParent'].includes(x.t))));
        a.t += SIM_DT;
        if (pendingMembers.length && a.t < 8) { a.state = '일행을 기다리는 중'; if (!a.spot) { a.spot = freeWaitSpot(s, a, SPOTS.waitInside); goTo(s, a, a.spot); } return false; }
      }
      release(s, a);
      const t = temper(s, a.id);
      if (t.selfCentered >= 75 && s.queue.length >= 2 && !a.flags.cutTried && rand(s) < .55) {
        a.flags.cutTried = true; a.cutting = true; goTo(s, a, [2, 12]); a.phase = 5; a.state = '계산대 옆으로 가는 중';
        return false;
      }
      if (kioskFits(s, a)) { s.interior.kiosk.by = a.id; goTo(s, a, FIXTURES.kiosk.access[0]); a.phase = 20; a.state = '셀프 계산대로 가는 중'; return false; }
      s.queue.push(a.id); a.qslot = -1; a.phase = 1; a.t = 0; a.queueAt = s.clock; a.state = '줄을 서는 중';
    }
    if (a.phase === 20) {
      if (!arrived(a)) return false;
      a.dir = 'left'; a.anim = 'pay'; a.phase = 21; a.t = .6 + .3 * a.cart.length; a.state = '셀프 계산대에서 계산하는 중';
      const elder = P(s, a.id).genes.appearance.age === 'elder';
      if (rand(s) < (elder ? .35 : .1)) { s.interior.kiosk.error = true; a.state = '셀프 계산대가 멈춰 기다리는 중'; }
      return false;
    }
    if (a.phase === 21) {
      if (s.interior.kiosk.error) { a.t += SIM_DT * 0; return false; }
      a.t -= SIM_DT;
      if (a.t > 0) return false;
      kioskPurchase(s, a);
      s.interior.kiosk.by = null; a.anim = 'idle';
      afterCheckout(s, a);
      return true;
    }
    if (a.phase === 5) {
      if (!arrived(a)) return false;
      const w = s.onDuty, victim = s.queue[s.checkout ? 1 : 0] ?? s.queue[0];
      a.phase = 6;
      startConversation(s, 'line_cut', [
        { sp: a.id, to: w, k: 'cut_line', delay: .2 },
        { sp: w, to: a.id, choices: [
          { id: 'refuse', k: 'cut_refuse', effect: ['lineCut', a.id, victim, w, false], then: [{ sp: a.id, to: w, k: 'cut_back' }] },
          { id: 'allow', k: 'cut_allow', effect: ['lineCut', a.id, victim, w, true], then: victim && (temper(s, victim).patience < 55 || P(s, victim).genes.expression.directness >= 60) ? [{ sp: victim, to: a.id, k: 'cut_protest' }, { sp: a.id, to: victim, k: 'cut_back' }] : [] }
        ], decider: ['cutAnswer', w], must: true }
      ], { members: [a.id, w, victim].filter(Boolean) });
      return false;
    }
    if (a.phase === 6) {
      if (a.cutting && !inConversation(s, a.id)) { a.cutting = false; if (!s.queue.includes(a.id)) s.queue.push(a.id); }
      if (!a.cutting) { a.phase = 1; a.queueAt = s.clock; a.state = '줄을 서는 중'; }
      return false;
    }
    if (a.phase === 1) {
      if (!s.queue.includes(a.id)) s.queue.push(a.id);
      const idx = s.queue.indexOf(a.id), waited = s.clock - a.queueAt, t = temper(s, a.id);
      const atPay = idx === 0 && arrived(a) && near(a, center(...SPOTS.pay), 4);
      a.state = idx === 0 ? '계산 차례를 기다리는 중' : `줄 ${idx + 1}번째`;
      a.anim = 'idle';
      if (atPay) a.dir = 'up';
      // Impatient people urge once if someone ahead is being served.
      if (idx > 0 && !a.flags.urged && t.patience < 35 && waited > 1.2 + t.patience / 12 && s.checkout && !inConversation(s, a.id) && !inConversation(s, s.onDuty)) {
        a.flags.urged = true;
        const w = s.onDuty, rude = t.kindness < 35 && P(s, a.id).status.mood < 60;
        startConversation(s, 'queue_urge', [
          { sp: a.id, to: w, k: a.cart.length === 1 && rand(s) < .5 ? 'urge_one' : 'urge', delay: .1, slots: {} },
          { sp: w, to: a.id, choices: [{ id: 'soft', k: 'urge_reply', effect: ['queueUrge', a.id, w] }, { id: 'direct', k: 'urge_reply_direct', effect: ['queueUrge', a.id, w], then: rude ? [
            { sp: a.id, to: w, k: 'argue_wait' },
            { sp: w, to: a.id, choices: [{ id: 'firm', k: 'argue_wait_reply' }, { id: 'soft', k: 'argue_wait_soft' }], decider: ['argueReply', w], effect: ['argument', a.id, w, null], must: true }
          ] : [] }], decider: ['workerReplyUrge', w], must: true, effect: ['queueUrge', a.id, w], delay: 1.4 }
        ], { members: [a.id, w] });
        P(s, a.id).status.mood -= 6;
      }
      // A pack of gum from the rack at the till, picked while waiting.
      if (idx <= 1 && !a.flags.gum && arrived(a) && s.shelf.gum > 0 && P(s, a.id).genes.appearance.age !== 'child') {
        a.flags.gum = true;
        const spare = a.budget - itemsTotal(a.cart) - (a.requestedProduct ? PRODUCTS[a.requestedProduct].price : 0) - (a.counterAsk ?? []).reduce((n, x) => n + PRODUCTS[x].price, 0);
        if (spare >= PRODUCTS.gum.price + 500 && rand(s) * 400 < t.impulsivity && takeFromShelf(s, 'gum')) { a.cart.push({ p: 'gum', by: a.id }); a.anim = 'pick'; messUp(s, 'counterRack', t.meticulous); }
      }
      const worker = s.actors[s.onDuty];
      const workerReady = worker && !s.shift.handover && near(worker, center(...SPOTS.pos), 6) && !worker.job?.busy;
      if (atPay && !workerReady && !a.flags.called && waited > 1.5 && !inConversation(s, a.id)) {
        a.flags.called = true;
        startConversation(s, 'call', [{ sp: a.id, to: s.onDuty, k: 'call_worker', toOptional: true }], { members: [a.id] });
      }
      if (atPay && workerReady && !s.checkout && !inConversation(s, s.onDuty) && !inConversation(s, a.id)) { startCheckout(s, a); a.phase = 2; }
      if (waited > 25 + t.patience / 3) { leaveQueueAbandon(s, a); return true; }
      return false;
    }
    if (a.phase === 2) {
      a.state = '계산하는 중'; a.anim = 'pay'; a.dir = 'up';
      if (a.flags.paid) { s.queue = s.queue.filter(id => id !== a.id); a.anim = 'idle'; afterCheckout(s, a); return true; }
      if (!s.checkout || s.checkout.customer !== a.id) { a.phase = 1; return false; }
      return false;
    }
    return false;
  },
  heat(s, a, st) {
    const app = s.appliances[st.via];
    if (a.phase === 0) {
      if (!reserve(s, `app:${st.via}`, a.id)) { a.state = '전자레인지 차례를 기다리는 중'; a.t += SIM_DT; if (a.t > 8) return true; return false; }
      goTo(s, a, FIXTURES[st.via].access[0]); a.phase = 1; a.state = st.via === 'microwave' ? `${pname(st.p)} 데우러 가는 중` : '온수 받으러 가는 중';
    }
    if (a.phase === 1 && arrived(a)) { a.dir = 'up'; a.anim = 'use'; app.until = s.elapsed + (st.via === 'microwave' ? 2 : 1); app.by = a.id; app.item = st.p; a.phase = 2; a.state = st.via === 'microwave' ? `${pname(st.p)} 데우는 중` : '컵라면에 물 붓는 중'; }
    if (a.phase === 2 && s.elapsed >= app.until) { app.by = null; app.item = null; release(s, a); a.anim = 'idle'; return true; }
    return false;
  },
  eat(s, a, st) {
    if (a.phase === 0) {
      const seat = freeSeat(s, a);
      if (!seat) { s.nuisance.seatWanted = s.elapsed; a.state = '자리가 없어 들고 나가는 중'; return true; }
      a.spot = seat; goTo(s, a, seat); a.phase = 1; a.state = a.socialChoice?.kind==='near'?'아는 사람 곁에 자리 잡는 중':a.socialChoice?.kind==='away'?'조금 떨어진 자리를 고르는 중':'자리 잡는 중';
    }
    if (a.phase === 1 && arrived(a)) {
      const choice=a.socialChoice,other=choice&&s.actors[choice.person];
      if(other&&other.cur?.t==='eat'&&other.phase===2&&near(a,other,choice.kind==='near'?70:224)&&(choice.kind==='near'||!near(a,other,63))){
        remember(s,a.id,{key:`seat:${choice.kind}:${other.id}`,topic:'social_space',source:'self',about:[other.id],text:choice.kind==='near'?`${nameFor(s,a.id,other.id)} 곁에 앉아 먹었다.`:`불편한 마음이 있어 ${nameFor(s,a.id,other.id)}와 조금 떨어져 앉았다.`,importance:.2});
      }
      if(s.facilities.extraTable&&FIXTURES.table2.access.some(c=>c[0]===a.spot?.[0]&&c[1]===a.spot?.[1]))s.management.feedback.totals.extraSeatUses++;
      a.dir = a.spot?.[2]??'down'; a.anim = 'eat'; a.phase = 2; a.t = 5 + rand(s) * 7 + (st.p === 'bigRamen' ? 3 : 0); a.state = `${pname(st.p)} 먹는 중`; a.eating = st.p;
      if (PRODUCTS[st.p].heat && rand(s) < .5) startConversation(s, 'self', [{ sp: a.id, k: 'hot_food', delay: 1.5, noAi: true }], { members: [a.id] });
    }
    if (a.phase === 2) {
      a.t -= SIM_DT;
      P(s, a.id).status.hunger = Math.max(0, P(s, a.id).status.hunger - SIM_DT * 5);
      if (a.t > 0) return false;
      const i = a.bag.indexOf(st.p);
      if (i >= 0) a.bag.splice(i, 1);
      a.eating = null; a.anim = 'idle';
      const t = temper(s, a.id);
      if (rand(s) * 100 < t.meticulous + 15) { const kind = trashKind(st.p); a.plan.unshift(...(kind === 'soup' ? [{ t: 'trash', kind: 'soup' }, { t: 'trash', kind: 'general' }] : [{ t: 'trash', kind }])); }
      else {
        s.trash.push({ id: nextId(s, 'r'), cell: [...a.spot], by: a.id, at: s.clock, kind: PRODUCTS[st.p].shape });
        const e = addEvent(s, 'left_trash', { actors: [a.id], importance: .2, data: { who: a.id } });
        perceive(s, e);
      }
      release(s, a);
      return true;
    }
    return false;
  },
  trash(s, a, st) {
    const kind = st.kind ?? 'general', bin = kind === 'general' ? 'trash' : 'recycle';
    if (a.phase === 0) { goTo(s, a, FIXTURES[bin].access[0]); a.phase = 1; a.state = kind === 'soup' ? '국물을 버리는 중' : '쓰레기 버리는 중'; }
    if (a.phase === 1 && arrived(a)) { a.dir = 'up'; a.anim = 'pick'; a.phase = 2; a.t = kind === 'soup' ? .8 : .5; }
    if (a.phase === 2) {
      a.t -= SIM_DT;
      if (a.t > 0) return false;
      binDrop(s, kind);
      return true;
    }
    return false;
  },
  // Household trash into the store's bin; a worker nearby may say something.
  dump(s, a) {
    if (a.phase === 0) { goTo(s, a, FIXTURES.trash.access[0]); a.phase = 1; a.state = '쓰레기통 쪽으로 가는 중'; }
    if (a.phase === 1 && arrived(a)) { a.dir = 'up'; a.anim = 'pick'; a.phase = 2; a.t = .6; }
    if (a.phase === 2) {
      a.t -= SIM_DT;
      if (a.t > 0) return false;
      s.interior.bins.general = Math.min(1.3, s.interior.bins.general + .45);
      if (a.holding === 'trashbag') a.holding = null;
      a.dumpTrash = false;
      const w = s.onDuty, sees = s.actors[w] && (witnessesAt(s, a, [a.id]).includes(w) || temper(s, w).meticulous >= 70);
      if (sees && !inConversation(s, w)) {
        const polite = temper(s, a.id).conflictAvoid >= 40 || temper(s, a.id).kindness >= 50;
        startConversation(s, 'trouble', [{ sp: w, to: a.id, k: 'trouble', literal: '가게 쓰레기통에 집 쓰레기는 안 돼요.', noAi: true, delay: .2 }, { sp: a.id, to: w, k: 'trouble', literal: polite ? '아, 죄송해요.' : '이 정도는 괜찮잖아요.', noAi: true, effect: ['troubleDone', 'trash_dump', a.id, w, polite ? 'sorry' : 'argued', null], must: true }], { members: [w, a.id] });
      }
      a.anim = 'idle';
      return true;
    }
    return false;
  },
  hog(s, a) {
    if (a.phase === 0) {
      const seat = freeSeat(s, a);
      if (!seat) { a.hog = false; return true; }
      a.spot = seat; goTo(s, a, seat); a.phase = 1; a.state = '취식대로 가는 중';
    }
    if (a.phase === 1 && arrived(a)) { a.dir = a.spot?.[2]??'down'; a.anim = 'sit'; a.hogging = true; a.hogSince = s.elapsed; a.phase = 2; a.t = 22 + rand(s) * 14; a.state = '휴대전화를 보며 앉아 있는 중'; }
    if (a.phase === 2) {
      a.t -= SIM_DT;
      if (a.hogging && a.t > 0) return false;
      if (a.hogging && s.nuisance.charging === a.id) s.nuisance.charging = null;
      a.hogging = false; a.anim = 'idle'; release(s, a);
      return true;
    }
    return false;
  },
  doze(s, a) {
    if (a.phase === 0) {
      const seat = freeSeat(s, a);
      if (!seat) return true;
      a.spot = seat; goTo(s, a, seat); a.phase = 1; a.state = '취식대로 가는 중';
    }
    if (a.phase === 1 && arrived(a)) { a.dir = a.spot?.[2]??'down'; a.anim = 'sleep'; a.dozing = true; a.sleptAt = s.elapsed; a.phase = 2; a.state = '취식대에 엎드려 자는 중'; }
    if (a.phase === 2) {
      // Without a worker to wake him, he wakes on his own after a while.
      if (a.dozing && s.elapsed - a.sleptAt < 40) return false;
      a.dozing = false; a.anim = 'idle'; release(s, a);
      return true;
    }
    return false;
  },
  // Cash from the ATM before shopping. Only the customer's own budget changes.
  atm(s, a) {
    const m = s.interior.atm;
    if (a.phase === 0) {
      if (m.by && s.actors[m.by] && m.by !== a.id) { a.t += SIM_DT; a.state = 'ATM 차례를 기다리는 중'; return a.t > 2; }
      m.by = a.id; goTo(s, a, FIXTURES.atm.access[0]); a.phase = 1; a.state = 'ATM으로 가는 중';
    }
    if (a.phase === 1 && arrived(a)) { a.dir = FIXTURES.atm.access[0][2]; a.anim = 'use'; a.phase = 2; a.t = 1.2 + rand(s); m.until = s.elapsed + a.t; a.state = 'ATM에서 돈을 찾는 중'; }
    if (a.phase === 2) { a.t -= SIM_DT; if (a.t > 0) return false; a.budget += 20000; if(a.visitPurpose==='atm')a.flags.purposeCompleted=true;m.by = null; a.anim = 'idle'; return true; }
    return false;
  },
  // A cup bought at the till is filled at the self-service machine.
  brew(s, a) {
    const c = s.interior.coffee;
    if (a.phase === 0) {
      if (c.by && s.actors[c.by] && c.by !== a.id) { a.t += SIM_DT; a.state = '커피 머신 차례를 기다리는 중'; return a.t > 4; }
      c.by = a.id; goTo(s, a, FIXTURES.coffeeMachine.access[0]); a.phase = 1; a.state = '커피 머신으로 가는 중';
    }
    if (a.phase === 1 && arrived(a)) { a.dir = 'up'; a.anim = 'use'; a.phase = 2; a.t = 1.2; c.until = s.elapsed + 1.2; a.state = '원두 커피를 내리는 중'; }
    if (a.phase === 2) { a.t -= SIM_DT; if (a.t > 0) return false; c.beans = Math.max(0, c.beans - .04); c.by = null; a.anim = 'idle'; a.holding = a.holding ?? 'coffee'; return true; }
    return false;
  },
  regroup(s, a) {
    const v = visitOf(s, a);
    if (!v?.leaveTogether) return true;
    const others = v.members.filter(id => id !== a.id && s.actors[id] && !s.actors[id].flags.left);
    const ready = id => ['regroup', 'leave'].includes(s.actors[id].cur?.t) || (s.actors[id].cur?.t === 'follow');
    if (others.every(ready)) {
      // The parent calls the child by name on the way out.
      if (v.groupId === 'family' && v.payer === a.id && !v.flags.called) {
        const child = others.find(id => P(s, id).genes.appearance.age === 'child');
        if (child) { v.flags.called = true; startConversation(s, 'call', [{ sp: a.id, to: child, k: 'parent_call', slots: { n: P(s, child).name }, reveals: child }], { members: [a.id, child] }); }
      }
      return true;
    }
    if (a.phase === 0) {
      const outside = temper(s, a.id).patience < 45 || P(s, a.id).status.hurry > 70;
      a.spot = freeWaitSpot(s, a, outside ? SPOTS.waitOutside : SPOTS.waitInside);
      goTo(s, a, a.spot); a.phase = 1; a.t = 0;
      a.state = outside ? '밖에서 일행을 기다리는 중' : '일행을 기다리는 중';
    }
    a.t += SIM_DT;
    if (arrived(a)) { a.anim = 'idle'; a.dir = 'down'; }
    const limit=groupWaitLimit(s,a,others);
    if(a.t>8+temper(s,a.id).patience/8&&limit>8+temper(s,a.id).patience/8)a.state='일행을 조금 더 기다리는 중';
    if (a.t > limit) return true;
    return false;
  },
  leave(s, a) {
    if (a.phase === 0) {
      release(s, a);
      if ((!a.visitPurpose||a.visitPurpose==='shopping')&&troubleOnLeaving(s, a, KIT)) return true;
      if (isInside(a)) { goTo(s, a, SPOTS.doorOut); a.phase = 1; } else a.phase = 2;
      a.state = '나가는 중';
      const raining = s.weather.kind === 'rain' || s.weather.kind === 'storm';
      if (raining && !a.hasUmbrella && !a.flags.umbrellaAsked) P(s, a.id).status.mood -= 5;
    }
    if (a.phase === 1 && arrived(a)) { const edge = SPOTS.street[rand(s) < .5 ? 0 : 1]; goTo(s, a, edge); a.phase = 2; }
    if (a.phase === 2 && !a.path.length) { a.phase = 3; goTo(s, a, SPOTS.street[a.x < 384 ? 0 : 1]); }
    if (a.phase === 3 && arrived(a)) { despawn(s, a); return true; }
    return false;
  }
};
function visitOf(s, a) { return s.visits.find(v => v.id === a.visitId); }
function leaveQueueAbandon(s, a) {
  s.management.today.outcomes.abandoned=(s.management.today.outcomes.abandoned??0)+1;
  s.queue = s.queue.filter(id => id !== a.id);
  for (const it of a.cart.splice(0)) returnToShelf(s, it.p, it);
  P(s, a.id).status.mood -= 15;
  s.reputation[a.id] = Math.max(0, s.reputation[a.id] - 4);
  remember(s, a.id, { text: '계산 줄이 너무 길어서 그냥 나왔다.', importance: .35, tone: 'annoyed' });
}

function pickProduct(s, a, p) {
  if(PRODUCTS[p].staffOnly)return false;
  const wish = s.memories[a.id].find(m => m.key === `soldout:${p}`);
  const t0 = temper(s, a.id);
  const units = pickUnits(s, p, { id: a.id, budget: a.budget, selfCentered: t0.selfCentered, meticulous: t0.meticulous, impulsivity: t0.impulsivity }, x => takeFromShelf(s, x), () => rand(s));
  if (units.length) {
    a.cart.push(...units);
    messUp(s, PRODUCTS[p].fixture, t0.meticulous);
    troubleOnPick(s, a, p, KIT);
    if (wish && !wish.resolved) {
      wish.resolved = true;
      const v = visitOf(s, a), friend = v?.members.find(id => id !== a.id && s.actors[id] && near(s.actors[id], a, 120));
      if (friend) startConversation(s, 'found', [{ sp: a.id, to: friend, k: 'friend_found' }], { members: [a.id, friend] });
    }
    const promise = s.obligations.find(o => o.status === 'open' && o.type === 'restock_promise' && o.creditor === a.id && o.product === p);
    if (promise) keepPromise(s, promise, a.id);
    return true;
  }
  // Sold out.
  if(s.shelf[p]>0)return false; // Budget/eligibility failure is not a stock shortage.
  const t = temper(s, a.id), p0 = P(s, a.id);
  a.errands ??= [];
  if (s.holds.some(h => h.for === a.id && h.p === p)) { a.errands.push({ type: 'pickupHold', p }); return false; }
  s.management.today.missed[p]=(s.management.today.missed[p]??0)+1;
  p0.status.mood -= 8;
  s.reputation[a.id] = Math.max(0, s.reputation[a.id] - 2);
  const isFav = p0.genes.life.favorites.includes(p);
  const promise = s.obligations.find(o => o.status === 'open' && o.type === 'restock_promise' && o.creditor === a.id && o.product === p);
  if (promise && s.day > promise.dueDay - 0 && s.orders.lastDeliveryDay >= promise.dueDay) {
    resolveObligation(s, promise, null, 'broken');
    const reservation=s.management.requests.find(r=>r.obligationId===promise.id);
    if(reservation)reservation.status='expired';
    if(!promise.reservation){
    const e = addEvent(s, 'promise_missed', { actors: [a.id, promise.debtor].filter(id => s.actors[id]), importance: .5, data: { customer: a.id, worker: promise.debtor, product: p } });
    promise.resolvedEventId = e.id;
    learnResolved(s, a.id, promise.id);
    perceive(s, e);
    adjust(s, a.id, promise.debtor, { griev: 10, trust: -10 });
    }
  }
  if (wish) { wish.count = (wish.count ?? 1) + 1; wish.at = s.clock; wish.resolved = false; a.errands.push({ type: 'soldoutAgain', p }); }
  else if (isFav) remember(s, a.id, { kind: 'wish', key: `soldout:${p}`, text: `찾던 ${J.i(pname(p))} 품절이었다.`, importance: .45, resolved: false, data: { product: p }, share: 'soldout', count: 1 });
  if (t.selfCentered >= 70 && t.kindness < 40) a.errands.push({ type: 'complain', p });
  if (t.impulsivity >= 40 || p0.status.hunger > 60) {
    const alt = Object.keys(PRODUCTS).filter(k => k !== p && PRODUCTS[k].fixture === PRODUCTS[p].fixture && s.shelf[k] > 0 && !PRODUCTS[k].facility&&!isAdultItem(k)&&!PRODUCTS[k].staffOnly&&itemsTotal(a.cart)+PRODUCTS[k].price<=a.budget);
    if (alt.length) { const x = pick(s, alt); if (takeFromShelf(s, x)) {
      a.cart.push({ p: x, by: a.id });s.management.today.substituted[p]=(s.management.today.substituted[p]??0)+1;
      remember(s,a.id,{key:`substitute:${p}`,kind:'fact',about:[],text:`${pname(p)} 대신 ${pname(x)}을 골랐다.`,source:'self',importance:.25,data:{product:p,replacement:x}});
      if(!inConversation(s,a.id))startConversation(s,'self',[{sp:a.id,k:'confirm',literal:'오늘은 이걸로 해야겠다.',noAi:true}],{members:[a.id]});
    } }
  }
}

function keepPromise(s, promise, customer) {
  const request=s.management.requests.find(r=>r.obligationId===promise.id);if(request)request.status='fulfilled';
  const e = addEvent(s, 'promise_kept', { actors: [customer, promise.debtor].filter(id => s.actors[id]), importance: .45, data: { customer, worker: promise.debtor, product: promise.product } });
  resolveObligation(s, promise, e.id, 'kept');
  for (const v of e.witnesses) learnResolved(s, v, promise.id);
  learnResolved(s, customer, promise.id);
  perceive(s, e);
  adjust(s, customer, promise.debtor, { grat: 15, trust: 12 });
  s.reputation[customer] = Math.min(100, s.reputation[customer] + 4);
  s.holds = s.holds.filter(h => h.obligationId !== promise.id);
}
function onEnter(s, a) {
  const w = s.onDuty, p = P(s, a.id), t = p.genes.temperament, r = s.relations[a.id]?.[w];
  if (a.drunk && s.actors[w] && !inConversation(s, w)) {
    startConversation(s, 'trouble', [{ sp: a.id, to: w, k: 'trouble', literal: ['여기 아직 하죠?', '어이구, 비 오네.', '안녕하세요오.'][Math.floor(rand(s) * 3)], noAi: true, delay: .2 }, { sp: w, to: a.id, k: 'trouble', literal: wary(s, w, a.id) ? '네.' : '네, 어서 오세요.', noAi: true }], { members: [a.id, w] });
    return;
  }
  const drunkNight = !a.drunk && (s.memories[a.id] ?? []).find(m => m.data?.trouble === 'drunk' && !m.apologized && s.clock - m.at < 1440 * 4);
  if (drunkNight && s.actors[w] && (s.memories[w] ?? []).some(m => m.key === 'trouble:' + a.id && m.data?.trouble === 'drunk') && !inConversation(s, w)) {
    drunkNight.apologized = true;
    startConversation(s, 'reconcile', [{ sp: a.id, to: w, k: 'trouble', literal: ['어젯밤엔 죄송했어요.', '지난번엔 실례가 많았어요.'][Math.floor(rand(s) * 2)], noAi: true, delay: .3 }, { sp: w, to: a.id, k: 'trouble', literal: temper(s, w).kindness >= 65 ? '괜찮아요. 잘 들어가셨어요?' : '괜찮아요.', noAi: true, effect: ['reconcile', a.id, w], must: true }], { members: [a.id, w] });
    return;
  }
  if(p.lifeChange&&s.day<p.lifeChange.end&&!p.lifeChange.toldTo.includes(w)&&s.actors[w]&&!inConversation(s,w)&&p.visits>0){
    startConversation(s,'life_news',[{sp:a.id,to:w,k:'life_news',literal:LIFE_CHANGES[p.lifeChange.kindIndex].news,noAi:true},{sp:w,to:a.id,k:'confirm',effect:['lifeNews',a.id,w],must:true}],{members:[a.id,w]});return;
  }
  // A slip on a wet floor, more likely for older people and a long-unmopped entrance.
  if (s.wetness > .55 && (p.genes.appearance.age === 'elder' ? .35 : .08) * (s.interior.wetSign ? .25 : 1) > rand(s)) {
    startConversation(s, 'slip', [{ sp: a.id, k: 'slipped', delay: .1, effect: ['slipped', a.id] }, { sp: w, to: a.id, k: 'slippery_warn', toOptional: true }], { members: [a.id, w] });
    return;
  }
  // Reconciling after a past conflict with the worker on duty.
  if (r && r.griev >= 18 && !inConversation(s, w)) {
    const wr = s.relations[w]?.[a.id];
    if (t.kindness + rand(s) * 60 > 55) {
      startConversation(s, 'reconcile', [{ sp: a.id, to: w, k: 'apology', delay: .6 }, { sp: w, to: a.id, k: 'apology_accept', effect: ['reconcile', a.id, w], must: true }], { members: [a.id, w] });
      return;
    }
    if (wr && temper(s, w).kindness >= 65 && rand(s) < .5) {
      startConversation(s, 'reconcile', [{ sp: w, to: a.id, k: 'welcome_familiar', delay: .4, effect: ['reconcile', w, a.id], must: true }, { sp: a.id, to: w, k: 'confirm' }], { members: [a.id, w] });
      return;
    }
  }
  // How people greet depends on how well they know each other.
  const stage = stageOf(s, w, a.id), cstage = stageOf(s, a.id, w);
  const greetChance = { stranger: 0, face: .15, regular: .5, close: .8 }[cstage === 'stranger' && r?.grat >= 25 ? 'regular' : cstage] + t.sociability / 400;
  if (s.actors[w] && !inConversation(s, w) && rand(s) < greetChance) {
    const workerFirst = stage === 'close' && temper(s, w).sociability >= 50;
    const lines = workerFirst ? [{ sp: w, to: a.id, k: 'welcome_familiar', delay: .3 }, { sp: a.id, to: w, k: 'greet_familiar' }] : [{ sp: a.id, to: w, k: 'greet_familiar', delay: .3 }, { sp: w, to: a.id, k: stage === 'stranger' ? 'welcome' : 'welcome_familiar' }];
    startConversation(s, 'greet', lines, { members: [a.id, w] });
  } else if (s.elapsed - s.director.lastWelcome > 6 && s.actors[w] && !inConversation(s, w) && rand(s) < .5) {
    s.director.lastWelcome = s.elapsed;
    startConversation(s, 'welcome', [{ sp: w, to: a.id, k: 'welcome', delay: .2 }], { members: [w] });
  }
}

// ---------- checkout ----------
function startCheckout(s, a) {
  const w = s.onDuty, wp = P(s, w), p = P(s, a.id), t = p.genes.temperament;
  const items = a.cart.splice(0);
  let total = itemsTotal(items);
  const co = { id: nextId(s, 'k'), customer: a.id, worker: w, items, total, budget: a.budget, startedAt: s.elapsed, scanEnd: s.elapsed + (.5 + items.length * .25) * (1.6 - wp.skills.checkout / 100), convId: null, talkDone: false, paidBy: null, bag: null };
  s.checkout = co;
  co.payment=a.payment??paymentMethod(p,s.day);
  const lines = [], reg = registerFor(s, a.id, w);
  const say = (sp, k, extra = {}) => lines.push({ sp, to: sp === w ? a.id : w, k, ...extra });
  if(a.requestedProduct&&s.facilities.tobaccoSales){
    const product=a.requestedProduct;const verified=eligibleForTobacco(p)&&a.hasId;
    say(a.id,'tobacco_request',{literal:`${pname(product)} 한 갑 주세요.`,noAi:true,delay:.3});
    say(w,'id_check',{literal:'신분증 확인할게요.',noAi:true});
    if(verified&&s.shelf[product]>0&&co.budget>=co.total+PRODUCTS[product].price){
      s.shelf[product]--;items.push({p:product,by:a.id});co.total+=PRODUCTS[product].price;total=co.total;
      say(w,'tobacco_ok',{literal:'확인됐어요. 꺼내 드릴게요.',noAi:true,effect:['tobaccoGive',a.id,w,product],must:true});
    }else{
      const reason=!verified?'신분 확인이 안 돼서 판매할 수 없어요.':s.shelf[product]<=0?'지금은 그 상품이 없어요.':'금액이 부족해서 이건 빼둘게요.';
      say(w,'tobacco_refuse',{literal:reason,noAi:true});
      if(!verified)addEvent(s,'tobacco_refused',{actors:[a.id,w],importance:.3});
    }
    a.requestedProduct=null;
  }
  if (a.basket) { a.basket = false; s.interior.baskets.counter++; }
  const spare = a.budget - co.total;
  if (!(a.counterAsk ?? []).length && p.genes.appearance.age !== 'child') {
    if (p.status.hunger > 60 && spare >= PRODUCTS.hotbar.price && s.shelf.hotbar > 0 && rand(s) < .18) (a.counterAsk ??= []).push('hotbar');
    else if (p.status.fatigue > 60 && spare >= PRODUCTS.americano.price && rand(s) < .12) (a.counterAsk ??= []).push('americano');
  }
  // Goods kept at the till are asked for by name.
  for (const p of a.counterAsk ?? []) {
    const coffeeDown = PRODUCTS[p].brew && s.interior.coffee.beans < .05;
    say(a.id, 'counter_ask', { literal: PRODUCTS[p].brew ? '아메리카노 한 잔이요.' : `${pname(p)} 하나 주세요.`, noAi: true, delay: .3 });
    if (!coffeeDown && s.shelf[p] > 0) {
      s.shelf[p]--; items.push({ p, by: a.id }); co.total += PRODUCTS[p].price; total = co.total;
      say(w, 'counter_give', { literal: PRODUCTS[p].brew ? '컵 드릴게요. 머신에서 내리시면 돼요.' : '네, 꺼내 드릴게요.', noAi: true, effect: ['reach', w], must: true });
    } else say(w, 'counter_none', { literal: coffeeDown ? '지금 원두를 채우는 중이라 커피가 안 돼요.' : '지금은 다 나갔어요.', noAi: true });
  }
  a.counterAsk = [];
  checkoutTrouble(s, a, co, say, lines, KIT);
  // Alcohol needs proof of age, checked by the worker; nothing adult leaves without it.
  if (items.some(it => isAdultItem(it.p))) {
    const ok = eligibleForTobacco(p) && a.hasId, young = (p.genes.life.ageYears ?? 40) < 30 || !a.hasId;
    if (young || !ok) { say(w, 'id_check', { literal: '신분증 확인할게요.', noAi: true }); }
    if (!ok) {
      for (const it of items.filter(it => isAdultItem(it.p))) { items.splice(items.indexOf(it), 1); returnToShelf(s, it.p, it); }
      co.total = itemsTotal(items); total = co.total;
      underageLines(s, a, say, w, KIT);
      say(w, 'alcohol_refuse', { literal: '확인이 안 돼서 주류는 빼 드릴게요.', noAi: true });
      addEvent(s, 'alcohol_refused', { actors: [a.id, w], importance: .3, data: { customer: a.id, worker: w } });
    }
  }
  // Parcels: dropping one off, or collecting one that arrived for this customer.
  if (a.parcelToSend) {
    say(a.id, 'parcel_send', { literal: '택배 보내려고요.', noAi: true, delay: .3 });
    say(w, 'parcel_ok', { literal: `무게 재 볼게요. ${PARCEL_FEE.toLocaleString('ko-KR')}원이에요.`, noAi: true, effect: ['parcelIn', a.id, w], must: true });
    co.serviceFee = (co.serviceFee ?? 0) + PARCEL_FEE; co.total += PARCEL_FEE; total = co.total;
  }
  const waiting = s.interior.parcels.find(x => x.kind === 'arrive' && x.for === a.id);
  if (waiting) {
    say(a.id, 'parcel_pickup', { literal: '택배 찾으러 왔어요.', noAi: true, delay: .3 });
    if (knowsName(s, w, a.id)) say(w, 'parcel_found', { literal: `${P(s, a.id).name} 님 거 여기 있어요.`, noAi: true, effect: ['parcelOut', a.id, w, waiting.id], must: true });
    else { say(w, 'parcel_name_q', { literal: '성함이 어떻게 되세요?', noAi: true }); lines.push({ sp: a.id, to: w, k: 'name_answer', slots: { n: P(s, a.id).name }, reveals: a.id, effect: ['parcelOut', a.id, w, waiting.id], must: true }); }
  }
  const errands = a.errands ?? [];
  // Topic order: unresolved business first, then the purchase.
  const loan = openUmbrellaLoan(s, a.id);
  if (loan && a.holding === 'rental') {
    const days = s.day - (s.events.find(e => e.id === loan.eventId)?.day ?? s.day);
    say(a.id, 'return_umbrella', { slots: { when: days <= 0 ? '아까' : days === 1 ? '어제' : '지난번에' }, delay: .3 });
    const knew = s.memories[w].some(m => m.obligationId === loan.id);
    say(w, knew ? 'umbrella_ack_known' : 'umbrella_ack_unknown', { effect: ['returnUmbrella', a.id, w], must: true });
  }
  const favor = s.obligations.find(o => o.type === 'favor' && o.status === 'open' && o.debtor === a.id && s.actors[o.creditor] && near(s.actors[o.creditor], a, 200));
  if (favor) { lines.push({ sp: a.id, to: favor.creditor, k: 'thanks_again' }, { sp: favor.creditor, to: a.id, k: 'thanks_again_reply', effect: ['favorThanks', a.id, favor.creditor], must: true }); }
  // A unit set aside for this customer: handed over only if the worker on duty knows about it.
  const pickup = errands.find(e => e.type === 'pickupHold');
  if (pickup) {
    const hold = s.holds.find(h => h.for === a.id && h.p === pickup.p), pn = pname(pickup.p);
    const request=hold&&s.management.requests.find(r=>r.obligationId===hold.obligationId&&r.status==='ordered');
    const knows = hold && (request||s.memories[w].some(m => m.obligationId === hold.obligationId && !m.resolved));
    say(a.id, 'ask_restock', { slots: { p: pn }, delay: .3 });
    if (knows) {
      s.back[pickup.p]--; items.push({ p: pickup.p, by: a.id }); co.total += PRODUCTS[pickup.p].price;
      const promise = s.obligations.find(o => o.id === hold.obligationId);
      s.holds = s.holds.filter(h => h !== hold);
      if(request){request.status='fulfilled';remember(s,w,{about:[a.id],text:`예약 장부를 확인하고 ${pname(pickup.p)}을 꺼냈다.`,source:'self',importance:.35});}
      say(w, 'promise_kept', { slots: { p: pn }, effect: ['keepPromise', promise.id, a.id], must: true });
    } else say(w, 'restock_none');
  }
  const again = pickup ? null : errands.find(e => e.type === 'soldoutAgain');
  const complain = errands.find(e => e.type === 'complain');
  if (complain && !again) {
    const pn = pname(complain.p);
    say(a.id, 'complain_soldout', { slots: { p: pn } });
    const angry = p.status.mood < 50 || temper(s, a.id).patience < 25;
    lines.push({ sp: w, to: a.id, choices: [{ id: 'soft', k: 'soldout_reply_soft' }, { id: 'direct', k: 'soldout_reply', then: angry ? [{ sp: a.id, to: w, k: 'argue' }, { sp: w, to: a.id, choices: [{ id: 'firm', k: 'argue_reply' }, { id: 'soft', k: 'argue_reply_soft' }], decider: ['argueReply', w], effect: ['argument', a.id, w, complain.p], must: true }] : [] }], decider: ['soldoutReply', w] });
  } else if (again) {
    // The example exchange: short, no commentary, and a promise only if an order can really be placed.
    const pn = pname(again.p), opt = restockOption(s, again.p);
    say(a.id, 'soldout_again', { delay: .3 });
    say(w, 'soldout_clarify', { slots: { p: pn } });
    say(a.id, 'confirm');
    lines.push({ sp: w, to: a.id, choices: [
      { id: 'yes', k: 'restock_yes', allowed: opt === 'yes' }, { id: 'soon', k: 'restock_soon', allowed: opt === 'soon' },
      { id: 'promise', k: 'restock_promise', allowed: opt === 'promise', effect: ['restockPromise', w, a.id, again.p] }, { id: 'none', k: 'restock_none', allowed: opt === 'none' }
      ,{id:'request',k:'restock_none',literal:'발주 요청을 남겨둘게요.',noAi:true,allowed:opt==='request',effect:['requestRestock',w,a.id,again.p]}
    ], decider: ['restockAnswer', w, again.p], slots: { p: pn } });
  } else if (!loan || a.holding !== 'rental') {
    const habit = s.memories[w].find(m => m.key === `habit:${a.id}`);
    if (habit && items.some(it => it.p === habit.data?.product) && rand(s) < .45) {
      say(w, 'habit_guess', { slots: { p: pname(habit.data.product) }, delay: .4 });
      say(a.id, 'confirm', { ifPrev: true });
    } else if (items.length && rand(s) < .6) say(a.id, 'pay_hand', { delay: .3 });
  }
  if (P(s, a.id).id === 'yeonggil' || (t.suspicion >= 80 && t.meticulous >= 85)) {
    if (rand(s) < .5) { say(a.id, 'expiry_q'); say(w, 'expiry_a'); }
  }
  if (t.selfCentered >= 80 && t.patience < 60 && items.length && rand(s) < .6) {
    if (items.some(it => PRODUCTS[it.p].expires) && rand(s) < .6) { say(a.id, 'discount_ask'); say(w, 'discount_refuse', { effect: ['discountRefused', a.id, w], must: true }); say(a.id, 'discount_after'); }
    else { say(a.id, 'extra_ask'); say(w, 'extra_ok'); }
  }
  if (items.length) {
    total = co.total;
    say(w, 'total', { slots: { price: total.toLocaleString('ko-KR') }, noAi: true });
    say(a.id,co.payment==='cash'?'pay_cash':'pay_card',{noAi:true});
    if (total > co.budget) {
      say(a.id, 'short_money');
      const helper = Object.values(s.actors).find(o => o.role === 'customer' && o.id !== a.id && temper(s, o.id).kindness >= 80 && o.budget >= 3000 && near(o, a, 6 * TILE) && P(s, o.id).genes.appearance.age !== 'child');
      if (helper) {
        lines.push({ sp: w, to: a.id, k: 'short_money_reply' });
        lines.push({ sp: helper.id, to: a.id, k: 'offer_pay', effect: ['paidFor', helper.id, a.id], must: true });
        lines.push({ sp: a.id, to: helper.id, k: 'thanks_big' });
        lines.push({ sp: helper.id, to: a.id, k: 'wave_off' });
      } else {
        say(w, 'short_money_reply');
        say(a.id, 'remove_item', { effect: ['removeItem', a.id], must: true });
      }
    }
    // Rain and no umbrella: the worker may offer the store's rental umbrella.
    const raining = s.weather.kind === 'rain' || s.weather.kind === 'storm';
    if (raining && !a.hasUmbrella && s.rental.inStand > 0 && !openUmbrellaLoan(s, a.id) && !items.some(it => it.p === 'umbrella') && !s.memories[a.id].some(m=>m.kind==='promise'&&s.clock-m.at<2880&&m.share==='umbrella')) {
      const asks = P(s, a.id).genes.expression.initiative >= 45;
      const offers = temper(s, w).kindness >= 55 || asks;
      if (offers) {
        a.flags.umbrellaAsked = true;
        if (asks) say(a.id, 'need_umbrella');
        lines.push({ sp: w, to: a.id, k: 'offer_umbrella' });
        const nameThen = knowsName(s, w, a.id) ? [] : [{ sp: w, to: a.id, k: 'loan_name_q' }, { sp: a.id, to: w, k: 'name_answer', slots: { n: P(s, a.id).name }, reveals: a.id }];
        lines.push({ sp: a.id, to: w, choices: [
          { id: 'yes', k: 'accept_umbrella', then: [...nameThen, { sp: w, to: a.id, k: 'loan_ok', effect: ['loanUmbrella', a.id, w], must: true }] },
          { id: 'no', k: 'decline_umbrella' }
        ], decider: ['acceptUmbrella', a.id] });
      }
    }
    if (t.kindness >= 90 && wp.status.fatigue > 30 && rand(s) < .7) { say(a.id, 'kind_words'); say(w, 'kind_reply', { effect: ['kindWords', a.id, w], must: true }); }
    const heatable = items.find(it => PRODUCTS[it.p].heat === 'microwave');
    if (heatable && wp.skills.service >= 60) {
      lines.push({ sp: w, to: a.id, k: 'heat_q' });
      lines.push({ sp: a.id, to: w, choices: [{ id: 'yes', k: 'heat_yes', effect: ['heatChoice', a.id, true] }, { id: 'no', k: 'heat_no', effect: ['heatChoice', a.id, false] }], decider: ['acceptHeat', a.id] });
    } else if (items.length >= 2 && rand(s) < .3) {
      say(w, 'bag_q');
      say(a.id, rand(s) < .5 ? 'bag_no' : 'bag_yes');
    }
    if (items.some(it => PRODUCTS[it.p].heat === 'hotWater') && rand(s) < .3) say(w, 'ramen_water');
  }
  // Regulars sometimes get a few words about something that fits the moment.
  const cstage = stageOf(s, a.id, w), wstage = stageOf(s, w, a.id);
  if (['regular', 'close'].includes(wstage) && s.queue.length<=1 && lines.length < 9) {
    const chance = (wstage === 'close' ? .6 : .35) * (.5 + temper(s, w).sociability / 100);
    if (rand(s) < chance) { lines.push({ sp: w, to: a.id, k: 'small_worker' }); lines.push({ sp: a.id, to: w, k: 'small_reply', followTopic: true, ifPrev: true, effect: ['chat', a.id, w] }); }
    else if (['regular', 'close'].includes(cstage) && rand(s) < t.sociability / 200) { lines.push({ sp: a.id, to: w, k: 'small_customer' }); lines.push({ sp: w, to: a.id, k: 'small_worker_reply', followTopic: true, ifPrev: true, effect: ['chat', a.id, w] }); }
  }
  if (lines.length < 3 || rand(s) < .5) say(w, 'thank_bye');
  if (rand(s) < .3) say(a.id, 'bye');
  lines.forEach(l => { l.delay ??= .8; });
  const conv = startConversation(s, 'checkout', lines, { members: [a.id, w], onEnd: ['checkoutTalkDone'] });
  co.convId = conv?.id ?? null;
  if (!conv) co.talkDone = true;
  a.errands = [];
}
DECIDERS.acceptHeat = (s, conv, c) => P(s, c).genes.life.staysToEat || rand(s) < .4 ? 'yes' : 'no';

function updateCheckout(s) {
  const co = s.checkout;
  if (!co) return;
  const a = s.actors[co.customer];
  const worker = s.actors[co.worker];
  if (worker) { worker.anim = s.elapsed<(worker.reachUntil??0)?'pick':s.elapsed < co.scanEnd ? 'scan' : 'idle'; worker.dir = 'down'; }
  if(a&&s.elapsed>=co.scanEnd)a.state=`${PAYMENT_LABELS[co.payment??'card']} 결제 중`;
  if (!a) { for (const it of co.items) returnToShelf(s, it.p, it); s.checkout = null; return; }
  const timedOut = s.elapsed - co.startedAt > 14 && !s.conversations.some(c=>c.id===co.convId&&c.waiting&&s.pending.some(p=>p.id===c.waiting&&p.dispatched));
  if ((co.talkDone || timedOut) && s.elapsed >= co.scanEnd) completePurchase(s, co);
}
// Money, stock counts, the ledger and the customer's bag change together in one step.
function completePurchase(s, co) {
  const a = s.actors[co.customer];
  const total = itemsTotal(co.items) + (co.serviceFee ?? 0);
  if (co.items.length || co.serviceFee) {
    s.money += total;
    s.sales.revenue += total; s.sales.tx++;
    for (const it of co.items) { s.counts[it.p].sold++; consumeBatch(s, it.p); }
    const receipt=paymentReceipt(co.payment??a.payment??'card',total,co.paidBy?.amount??0,a.budget);
    a.receipt=receipt;
    pushLedger(s, { kind: 'sale', amount: total, payment:receipt, items: co.items.map(it => [it.p, 1]), customer: co.customer, worker: co.worker, paidBy: co.paidBy?.id ?? null, checkout: co.id, ...(co.serviceFee ? { service: co.serviceFee } : {}), ...(co.items.some(it => it.free || it.disc) ? { deals: co.items.filter(it => it.free || it.disc).length } : {}) });
    const byOwner = {};
    for (const it of co.items) (byOwner[it.by] ??= []).push(it.p);
    for (const [owner, list] of Object.entries(byOwner)) {recordPurchase(s, owner, co.worker, list);if(s.actors[owner])s.actors[owner].flags.madePurchase=true;}
    a.bag.push(...co.items.map(it => it.p));
    s.stats.served++;
  }
  a.flags.paid = true;
  a.budget -= Math.max(0, total - (co.paidBy?.amount ?? 0));
  // Plain repeat visits build familiarity slowly; events add more on top.
  for (const [x, y] of [[a.id, co.worker], [co.worker, a.id]]) {
    noteContact(s,x,y,a.visitId);
    const r=rel(s,x,y);if(r.fam<70)adjust(s,x,y,{fam:Math.min(6,70-r.fam)});
  }
  const wh = (s.habits[co.worker] ??= { buys: {}, visits: 0 });
  wh.seen ??= {};
  // Kept for the next visit; written after this checkout's lines were chosen.
  wh.seenNext ??= {};
  wh.seenNext[a.id] = { at: Math.round(s.clock), weather: s.weather.kind, group: (visitOf(s, a)?.members.length ?? 1) > 1 };
  s.shift.served = (s.shift.served ?? 0) + 1;
  if (s.checkout === co) s.checkout = null;
  s.queue = s.queue.filter(id => id !== a.id);
  if (!s.conversations.some(c => c.id === co.convId)) return;
  const conv = s.conversations.find(c => c.id === co.convId);
  conv.onEnd = null;
}
function afterCheckout(s, a) {
  const p = P(s, a.id), life = p.genes.life;
  if (a.bag.includes('umbrella')) { a.hasUmbrella = true; a.holding = 'umbrella'; }
  if (a.bag.includes('americano')) a.plan.unshift({ t: 'brew' });
  if (a.drunk && rand(s) < .6) { a.plan.unshift({ t: 'doze' }); return; }
  if (a.hog) { a.plan.unshift({ t: 'hog' }); return; }
  const food = a.bag.find(x => PRODUCTS[x].eat);
  if (!food || p.genes.appearance.age === 'child') return;
  const seats = seatCount(s), staying = life.staysToEat ? .9 : .12 + seats * .03 + (p.status.hunger > 60 ? .15 : 0);
  if (rand(s) > staying) return;
  const steps = [];
  const heat = PRODUCTS[food].heat;
  if (heat === 'hotWater' || (heat === 'microwave' && a.workerHeats !== false)) steps.push({ t: 'heat', p: food, via: heat });
  steps.push({ t: 'eat', p: food });
  a.plan.unshift(...steps);
}

// ---------- worker behaviour ----------
function runWorker(s, w) {
  if (w.id !== s.onDuty) return runOffDutyWorker(s, w);
  const p = P(s, w.id);
  p.status.fatigue = Math.min(100, p.status.fatigue + SIM_DT * .12);
  const posCell = SPOTS.pos, atPos = near(w, center(...posCell), 6);
  const needPos = s.queue.length > 0 || s.checkout;
  if (s.shift.handover) return;
  if (needPos && w.job && w.job.type !== 'pos' && !w.job.busy) { if (w.holding?.box) { s.boxes.unshift(w.holding.box); w.holding = null; } dropInteriorHolding(s, w, w.job); w.job = null; }
  if (!w.job) w.job = chooseJob(s, w, needPos);
  const job = w.job;
  if (job.type === 'pos') {
    if (!atPos && !w.path.length) goTo(s, w, posCell);
    if (atPos) { w.dir = 'down'; w.state = s.checkout ? '계산하는 중' : '계산대를 지키는 중'; if (!needPos) w.job = null; }
    return;
  }
  if (JOBS[job.type]) JOBS[job.type](s, w, job);
  else if (TROUBLE_JOBS[job.type]) TROUBLE_JOBS[job.type](s, w, job, KIT);
  else INTERIOR_JOBS[job.type]?.(s, w, job, KIT);
}
function chooseJob(s, w, needPos) {
  if (needPos) return { type: 'pos' };
  if(s.wetness>.55)return {type:'mop',phase:0};
  if(s.interior.kiosk.error&&s.interior.kiosk.by&&s.actors[s.interior.kiosk.by])return {type:'helpKiosk',phase:0};
  // Queue service and a dangerously wet entrance always take precedence.
  if(s.management.priority==='stock'&&s.wetness<.55){const low=Object.keys(PRODUCTS).find(k=>s.shelf[k]<PRODUCTS[k].shelfMax*.35&&availableBack(s,k)>0);if(low)return {type:'restock',p:low,phase:0};}
  if(s.management.priority==='clean'){const chore=chooseInteriorJob(s,w,KIT);if(chore?.type==='emptyBins')return chore;}
  const p = P(s, w.id), mopEager = s.memories[w.id].some(m => m.key === 'mop:eager');
  if (s.trash.length) return { type: 'clean', id: s.trash[0].id, phase: 0 };
  if (s.wetness > (mopEager ? .35 : s.clock>=OPENING_TIME+90?workerStyle(p).mopAt:.55)) return { type: 'mop', phase: 0 };
  const trouble = chooseTroubleJob(s, w, KIT);
  if (trouble) return trouble;
  const chore = chooseInteriorJob(s, w, KIT);
  if (chore && ['helpKiosk', 'wetSign', 'emptyBins'].includes(chore.type)) return chore;
  if (s.boxes.length) return { type: 'box', phase: 0 };
  const threshold=s.clock>=OPENING_TIME+90?workerStyle(p).restockAt:.35;
  const low = Object.keys(PRODUCTS).find(k => s.shelf[k] < PRODUCTS[k].shelfMax * threshold && availableBack(s, k) > 0);
  if (low) return { type: 'restock', p: low, phase: 0 };
  if (chore) return chore;
  if (rand(s) < .002 && p.skills.cleaning > 50) return { type: 'sweep', phase: 0 };
  return { type: 'pos' };
}
const JOBS = {
  clean(s, w, job) {
    const tr = s.trash.find(t => t.id === job.id);
    if (!tr) { w.job = null; return; }
    if (job.phase === 0) { goTo(s, w, nearestStand(s, tr.cell)); job.phase = 1; w.state = '취식대를 치우는 중'; }
    if (job.phase === 1 && arrived(w)) { w.anim = 'clean'; job.phase = 2; job.t = 1.2 * (1.6 - P(s, w.id).skills.cleaning / 100); job.busy = true; }
    if (job.phase === 2) { job.t -= SIM_DT; if (job.t <= 0) { s.trash = s.trash.filter(t => t !== tr); binDrop(s, 'general'); w.anim = 'idle'; w.job = null; } }
  },
  mop(s, w, job) {
    if (job.phase === 0) { goTo(s, w, SPOTS.wetZone[0]); job.phase = 1; w.state = '입구 바닥을 닦는 중'; }
    if (job.phase === 1 && arrived(w)) { s.interior.wetSign = true; w.anim = 'mop'; w.holding = 'mop'; job.phase = 2; job.t = 2.5 * (1.6 - P(s, w.id).skills.cleaning / 100); job.busy = true; }
    if (job.phase === 2) { job.t -= SIM_DT; s.wetness = Math.max(.03, s.wetness - SIM_DT * .2); if (job.t <= 0) { s.management.feedback.totals.mops++;s.wetness = .03; w.anim = 'idle'; w.holding = null; w.job = null; } }
  },
  sweep(s, w, job) {
    if (job.phase === 0) { goTo(s, w, [14, 9]); job.phase = 1; w.state = '매장을 둘러보는 중'; }
    if (job.phase === 1 && arrived(w)) { w.anim = 'mop'; w.holding = 'broom'; job.phase = 2; job.t = 1.5; }
    if (job.phase === 2) { job.t -= SIM_DT; if (job.t <= 0) { w.anim = 'idle'; w.holding = null; w.job = null; } }
  },
  box(s, w, job) {
    if (job.phase === 0) { if (!s.boxes.length) { w.job = null; return; } goTo(s, w, FIXTURES.boxes.access[0]); job.phase = 1; w.state = '입고 박스를 가지러 가는 중'; }
    if (job.phase === 1 && arrived(w)) {
      const box = s.boxes.shift();
      if (!box) { w.job = null; return; }
      w.holding = { p: box.p, n: box.n, box }; job.busy = true;
      goTo(s, w, nearestStand(s, FIXTURES[PRODUCTS[box.p].fixture].access[0])); job.phase = 2; w.state = `${pname(box.p)} 박스를 옮기는 중`;
    }
    if (job.phase === 2 && arrived(w)) { w.anim = 'restock'; w.dir = FIXTURES[PRODUCTS[w.holding.p].fixture].access[0][2]; job.phase = 3; job.t = 1.2 * (1.6 - P(s, w.id).skills.stocking / 100); }
    if (job.phase === 3) {
      job.t -= SIM_DT;
      if (job.t > 0) return;
      const { p, n } = w.holding, room = Math.max(0, PRODUCTS[p].shelfMax - s.shelf[p]), put = Math.min(room, n);
      s.shelf[p] += put; s.back[p] += n - put; w.holding = null; w.anim = 'idle'; w.job = null;
    }
  },
  restock(s, w, job) {
    if (job.phase === 0) { goTo(s, w, FIXTURES.storage.access[0]); job.phase = 1; w.state = '창고에서 물건을 꺼내는 중'; }
    if (job.phase === 1 && arrived(w)) {
      const p = job.p, n = Math.min(availableBack(s, p), PRODUCTS[p].shelfMax - s.shelf[p]);
      if (n <= 0) { w.job = null; return; }
      s.back[p] -= n; w.holding = { p, n }; job.busy = true;
      goTo(s, w, nearestStand(s, FIXTURES[PRODUCTS[p].fixture].access[0])); job.phase = 2; w.state = `${pname(p)} 채우는 중`;
    }
    if (job.phase === 2 && arrived(w)) { w.anim = 'restock'; w.dir = FIXTURES[PRODUCTS[job.p].fixture].access[0][2]; job.phase = 3; job.t = 1 * (1.6 - P(s, w.id).skills.stocking / 100); }
    if (job.phase === 3) { job.t -= SIM_DT; if (job.t > 0) return; s.shelf[w.holding.p] += w.holding.n; w.holding = null; w.anim = 'idle'; w.job = null; }
  }
};
function nearestStand(s, cell) {
  if (floorCell(cell[0], cell[1], { staff: true, facilities: s.facilities })) return cell;
  const c = cellOf(nearestFloor(center(cell[0], cell[1]), { staff: true, facilities: s.facilities }));
  return c;
}
function runOffDutyWorker(s, w) {
  if (w.id === s.shift.incoming) {
    if (w.phase === 0) { goTo(s, w, [7, 10]); w.phase = 1; w.state = '출근하는 중'; }
    if (w.phase === 1 && arrived(w)) { w.phase = 2; w.dir = 'left'; w.state = '교대를 기다리는 중'; }
    return;
  }
  if (w.id === s.shift.outgoing) {
    if (w.phase === 0) { goTo(s, w, SPOTS.doorOut); w.phase = 1; w.state = '퇴근하는 중'; P(s, w.id).status.action = '퇴근하는 중'; }
    if (w.phase === 1 && arrived(w)) { goTo(s, w, SPOTS.street[rand(s) < .5 ? 0 : 1]); w.phase = 2; }
    if (w.phase === 2 && arrived(w)) despawn(s, w);
    return;
  }
  despawn(s, w);
}

// ---------- shifts ----------
function updateShift(s) {
  const seg = workerAt(s.roster, s.clock + 3);
  const target = seg?.worker;
  if (!target || !s.people[target]) return;
  if (target !== s.onDuty && !s.shift.incoming && !s.shift.handover) {
    if (!s.actors[target]) spawnWorker(s, target);
    s.shift.incoming = target;
    s.actors[target].phase = 0;
  }
  const inc = s.actors[s.shift.incoming];
  if (inc && inc.phase === 2 && !s.shift.handover && !s.checkout && s.clock >= seg.start - 3 && !inConversation(s, s.onDuty)) beginHandover(s, s.onDuty, inc.id);
}
// The outgoing worker passes on only a few items, chosen by importance and their own thoroughness.
function beginHandover(s, from, to) {
  const out = s.actors[from];
  if (!out) { completeHandover(s, from, to); return; }
  s.shift.handover = { from, to, at: s.clock };
  dropInteriorHolding(s, out, out.job);
  out.job = null;
  if (out.holding?.box) { s.boxes.unshift(out.holding.box); out.holding = null; }
  else if (out.holding?.p) { s.back[out.holding.p] += out.holding.n; out.holding = null; }
  goTo(s, out, [5, 10]);
  out.state = '인수인계 중'; s.actors[to].state = '인수인계 받는 중';
  const t = temper(s, from), limit = t.meticulous >= 70 ? 3 : t.meticulous >= 40 ? 2 : 1;
  const since = s.shift.startedAt;
  const candidates = [];
  for (const m of s.memories[from]) {
    if (m.handedTo?.includes(to)) continue;
    if (m.obligationId) {
      const o = s.obligations.find(x => x.id === m.obligationId);
      if (!o) continue;
      if (o.status === 'open' && !m.resolved) candidates.push({ m, score: m.importance + .4, kind: o.type });
      else if (o.status !== 'open' && m.resolved && o.resolvedAt >= since && s.memories[to].some(x => x.obligationId === o.id && !x.resolved)) candidates.push({ m, score: .7, kind: 'resolved', o });
    } else if (m.kind === 'conflict' && m.at >= since) candidates.push({ m, score: m.importance, kind: 'conflict' });
  }
  for (const [p, n] of Object.entries(s.shelf)) if (n === 0 && !PRODUCTS[p].facility && s.back[p] === 0) candidates.push({ p, score: .35, kind: 'soldout' });
  candidates.sort((a, b) => b.score - a.score);
  const lines = [{ sp: from, to, k: 'colleague_hi', delay: .3 }];
  for (const c of candidates.slice(0, limit)) {
    const subject = c.m?.about?.find(id => P(s, id)?.kind === 'customer');
    const label = subject ? (knowsName(s, from, subject) ? P(s, subject).name + ' 손님' : nameFor(s, from, subject)) : '손님';
    if (c.kind === 'umbrella_loan') { c.m.handoverText = `${subject ? (knowsName(s, from, subject) ? P(s, subject).name : nameFor(s, from, subject)) : '손님'}에게 매장 우산을 빌려줬다.`; lines.push({ sp: from, to, k: 'handover_umbrella', slots: { n: label }, effect: ['handoverItem', from, to, c.m.id], must: true }); }
    else if (c.kind === 'restock_promise') { lines.push({ sp: from, to, k: 'handover_promise', slots: { n: label, p: pname(c.m.data?.product ?? 'lunchbox') }, effect: ['handoverItem', from, to, c.m.id], must: true }); }
    else if (c.kind === 'resolved') { lines.push({ sp: from, to, k: 'handover_returned', effect: ['handoverResolved', from, to, c.o.id], must: true }); c.m.handedTo = [...(c.m.handedTo ?? []), to]; }
    else if (c.kind === 'conflict') { lines.push({ sp: from, to, k: 'handover_conflict', slots: { n: label }, ...(c.m.data?.handoverLine ? { literal: c.m.data.handoverLine.replace('{n}', label), noAi: true } : {}), effect: ['handoverItem', from, to, c.m.id], must: true }); }
    else if (c.kind === 'soldout') { lines.push({ sp: from, to, k: 'handover_soldout', slots: { p: pname(c.p) } }); }
    else if (c.kind === 'favor') continue;
  }
  if (lines.length === 1) lines.push({ sp: from, to, k: 'handover_none' });
  lines.push({ sp: to, to: from, k: 'handover_ack' });
  lines.push({ sp: to, to: from, k: 'colleague_bye', effect: ['finishHandover', from, to], must: true });
  startConversation(s, 'handover', lines, { members: [from, to] });
}
function completeHandover(s, from, to) {
  const e = addEvent(s, 'shift_change', { actors: [from, to].filter(id => s.actors[id]), importance: .2, data: { from, to } });
  s.onDuty = to; s.shift.handover = null; s.shift.incoming = null; s.shift.outgoing = from; s.shift.startedAt = s.clock; s.shift.served = 0;
  const inc = s.actors[to];
  if (inc) { inc.job = null; inc.phase = 0; goTo(s, inc, SPOTS.pos); inc.state = '계산대로 가는 중'; }
  const out = s.actors[from];
  if (out) { out.phase = 0; out.job = null; }
  P(s, to).status.fatigue = 15;
  return e;
}

// ---------- ambient conversations ----------
function ambient(s) {
  if (s.clock < (s.director.ambientAt ?? 0)) return;
  s.director.ambientAt = s.clock + 1;
  for (const v of s.visits) {
    const here = v.members.filter(id => s.actors[id] && s.actors[id].flags.entered && isInside(s.actors[id]) && !inConversation(s, id) && s.actors[id].cur?.t !== 'checkout');
    if (here.length < 2) continue;
    const [a, b] = here, A = s.actors[a], B = s.actors[b];
    if (!near(A, B, 150)) continue;
    const soc = Math.max(temper(s, a).sociability, temper(s, b).sociability);
    if (rand(s) > soc / 200) continue;
    const talker = temper(s, a).sociability >= temper(s, b).sociability ? a : b, other = talker === a ? b : a;
    const noisy = noisyGroup(s, v, here, KIT);
    if (noisy) { startConversation(s, 'trouble_noisy', noisy, { members: here, visitIds: [v.id] }); continue; }
    const topics = [];
    if (v.groupId === 'friends') {
      if (!v.flags.food) topics.push(['food', () => { v.flags.food = true; const pa = s.actors[other]?.cart[0]?.p ?? P(s, other).genes.life.favorites[0]; return [{ sp: talker, to: other, k: 'friend_food_q', slots: { p: pname(pa) } }, { sp: other, to: talker, k: 'friend_food_a',followTopic:true,ifPrev:true }]; }]);
      const snack = s.actors[talker]?.cart.find(it => ['chips', 'choco'].includes(it.p));
      if (snack && !v.flags.share) topics.push(['share', () => { v.flags.share = true; return [{ sp: talker, to: other, k: 'friend_share', slots: { p: pname(snack.p) }, effect: ['friendShare', talker, other, snack.p], must: true }]; }]);
      if (v.absent.length && !v.flags.missing) topics.push(['missing', () => { v.flags.missing = true; const ab = v.absent[0]; return [{ sp: talker, to: other, k: 'friend_missing', slots: { n: P(s, ab).name }, reveals: ab }, { sp: other, to: talker, k: 'coworker_reply' }]; }]);
      if (!v.flags.call && !s.playerNames[other]) topics.push(['call', () => { v.flags.call = true; return [{ sp: talker, to: other, k: 'friend_call', slots: { n: P(s, other).name }, reveals: other }, { sp: other, to: talker, k: 'confirm' }]; }]);
    }
    if (v.groupId === 'coworkers' && !v.flags.work) topics.push(['work', () => { v.flags.work = true; return [{ sp: talker, to: other, k: 'coworker_overtime' }, { sp: other, to: talker, k: 'coworker_reply' }]; }]);
    // Passing on something one of them knows and the other does not.
    for (const [t1, t2] of [[a, b], [b, a]]) {
      const m = s.memories[t1].find(x => x.share && !(x.shared >= 2) && x.at < v.at && !s.memories[t2].some(y => y.eventId && y.eventId === x.eventId) && s.clock - x.at < 1440 * 3);
      if (m && !v.flags['tell' + m.id]) topics.push(['tell', () => { v.flags['tell' + m.id] = true; const k = m.share === 'umbrella' ? 'hearsay_umbrella' : m.share === 'soldout' ? 'hearsay_soldout' : 'hearsay_paidfor'; const when = Math.floor(m.at / 1440) + 1 === s.day ? '아까' : Math.floor(m.at / 1440) + 2 === s.day ? '어제' : '지난번에'; return [{ sp: t1, to: t2, k, slots: { p: pname(m.data?.product ?? 'lunchbox'), when }, effect: ['hearsay', t1, t2, m.id], must: true }, { sp: t2, to: t1, k: 'coworker_reply' }]; }]);
    }
    if (!topics.length) continue;
    const [, make] = pick(s, topics);
    startConversation(s, 'chat', make(), { members: here, visitIds: [v.id] });
  }
  // Chance meetings between people from different visits who already know each other.
  const inside = Object.values(s.actors).filter(x => x.role === 'customer' && x.flags.entered && isInside(x) && !inConversation(s, x.id) && x.cur?.t !== 'checkout');
  for (let i = 0; i < inside.length; i++) for (let j = i + 1; j < inside.length; j++) {
    const A = inside[i], B = inside[j];
    if (A.visitId === B.visitId || !near(A, B, 110)) continue;
    const key = [A.id, B.id].sort().join(':');
    if ((s.director.meetings[key] ?? -1e9) > s.clock - 600) continue;
    const ra = s.relations[A.id]?.[B.id], fav = s.obligations.find(o => o.type === 'favor' && o.status === 'open' && ((o.debtor === A.id && o.creditor === B.id) || (o.debtor === B.id && o.creditor === A.id)));
    if (fav) {
      s.director.meetings[key] = s.clock;
      startConversation(s, 'meet', [{ sp: fav.debtor, to: fav.creditor, k: 'thanks_again' }, { sp: fav.creditor, to: fav.debtor, k: 'thanks_again_reply', effect: ['favorThanks', fav.debtor, fav.creditor], must: true }], { members: [A.id, B.id] });
      return;
    }
    const childA = P(s, A.id).genes.appearance.age === 'child', childB = P(s, B.id).genes.appearance.age === 'child';
    const elder = [A, B].find(x => P(s, x.id).genes.appearance.age === 'elder' && temper(s, x.id).kindness >= 85), kid = [A, B].find(x => P(s, x.id).genes.appearance.age === 'child');
    if (elder && kid && rand(s) < .5) {
      s.director.meetings[key] = s.clock;
      startConversation(s, 'meet', [{ sp: elder.id, to: kid.id, k: 'elder_to_kid' }, { sp: kid.id, to: elder.id, k: 'kid_to_elder', effect: ['meet', elder.id, kid.id], must: true }], { members: [A.id, B.id] });
      return;
    }
    if (!ra || ra.fam < 35 || childA || childB) continue;
    s.director.meetings[key] = s.clock;
    const first = temper(s, A.id).sociability >= temper(s, B.id).sociability ? A.id : B.id, second = first === A.id ? B.id : A.id;
    startConversation(s, 'meet', [{ sp: first, to: second, k: 'meet_greet' }, { sp: second, to: first, k: 'meet_reply', effect: ['meet', first, second], must: true }], { members: [A.id, B.id] });
    return;
  }
}

// ---------- weather and day cycle ----------
export const WEATHER_LABEL = { clear: '맑음', cloudy: '흐림', rain: '비', storm: '거센 비', snow: '눈' };
function updateWeather(s) {
  if (s.clock < s.weather.nextAt) return;
  const next = weighted(s, weatherChoices(s));
  s.weather = { kind: next, intensity: next === 'storm' ? 3 : next === 'rain' || next === 'snow' ? 1 + (rand(s) < .4 ? 1 : 0) : 0, nextAt: s.clock + 90 + rand(s) * 180 };
}
function dailyRules(s) {
  const dayNow = Math.floor(s.clock / 1440) + 1;
  if (dayNow !== s.day) {
    finishDay(s);
    const expense=Math.min(s.money,12000);s.money-=expense;pushLedger(s,{kind:'expense',amount:-expense,reason:'하루 운영비'});
    closeManagementDay(s);
    s.history.push({ ...s.sales });
    if (s.history.length > 14) s.history.shift();
    s.day = dayNow;
    weeklyLife(s);
    s.sales = { day: dayNow, revenue: 0, customers: 0, tx: 0 };
    dailyDecay(s);
    s.holds = s.holds.filter(h => s.day - h.day <= 2 && s.obligations.some(o => o.id === h.obligationId && o.status === 'open'));
    s.obligations = s.obligations.filter(o => o.status === 'open' || s.clock - o.resolvedAt < 1440 * 7);
    for (const [k, at] of Object.entries(s.director.meetings)) if (s.clock - at > 1440) delete s.director.meetings[k];
  }
  const m = minuteOfDay(s);
  if (m >= 3 * 60 && s.orders.lastAutoDay !== s.day) { s.orders.lastAutoDay = s.day; autoOrder(s); }
  if (m >= 7 * 60 && s.orders.lastDeliveryDay !== s.day) { s.orders.lastDeliveryDay = s.day; wasteExpired(s); s.interior.stickers = {}; deliver(s); startDeliveryTruck(s); }
}

// ---------- despawn ----------
function despawn(s, a) {
  if(s.interior.restroom.by===a.id)s.interior.restroom.by=null;
  release(s, a);
  for (const it of a.cart) returnToShelf(s, it.p, it);
  a.cart = [];
  // A basket carried out of the store is left at the door rack.
  if (a.basket) { s.interior.baskets.stack++; a.basket = false; }
  if (a.holding?.box) s.boxes.unshift(a.holding.box);
  else if (a.holding?.p) s.back[a.holding.p] += a.holding.n;
  a.flags.left = true;
  delete s.actors[a.id];
  s.queue = s.queue.filter(id => id !== a.id);
  for (const c of [...s.conversations]) if (c.members.includes(a.id) && c.lines.slice(c.i).some(l => l.sp === a.id)) {
    // Keep lines from others but drop this person's, so nobody talks after leaving.
    c.lines = c.lines.filter((l, i) => i < c.i || l.sp !== a.id || l.must);
  }
  s.pending = s.pending.filter(p => p.speaker !== a.id);
  const p = P(s, a.id);
  if (a.role === 'customer') {
    if(a.flags.entered&&!a.flags.madePurchase)s.management.today.outcomes.noPurchase=(s.management.today.outcomes.noPurchase??0)+1;
    if(a.flags.purposeCompleted&&a.visitPurpose!=='shopping'){
      const text={atm:'편의점 ATM에서 돈만 찾고 나왔다.',browse:'가격만 둘러보고 물건은 사지 않았다.',shelter:'편의점 안에서 잠깐 비를 피했다.',wait:'편의점에서 친구를 기다렸다.',restroom:'편의점 화장실을 이용하고 나왔다.'}[a.visitPurpose];
      if(text)remember(s,a.id,{key:`visit:${a.visitPurpose}`,topic:'visit_purpose',source:'self',text,about:[],importance:.18});
    }
    p.lastVisitAt = s.clock; p.visits++; p.status.action = '집에 있음';
    s.stats.visitors++; s.sales.customers++;
    const h = (s.habits[a.id] ??= { buys: {}, visits: 0 }); h.visits++; h.lastWeather = s.weather.kind;
    for (const w of WORKERS) { const wh = s.habits[w]; if (wh?.seenNext?.[a.id]) { (wh.seen ??= {})[a.id] = wh.seenNext[a.id]; delete wh.seenNext[a.id]; } }
    const v = s.visits.find(x => x.id === a.visitId);
    if (v && !v.members.some(id => s.actors[id])) s.visits = s.visits.filter(x => x !== v);
  } else {
    p.status.action = '쉬는 중';
    if (s.shift.outgoing === a.id) s.shift.outgoing = null;
  }
}

export const openUmbrellaLoan = (s, id) => s.obligations.find(o => o.type === 'umbrella_loan' && o.status === 'open' && o.debtor === id);

// ---------- main step ----------
export function step(s, dt = SIM_DT) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  s.elapsed += dt; s.clock += dt;
  for(const p of s.pending)if(p.dispatched){const c=s.conversations.find(c=>c.id===p.convId);if(c)c.startedAt+=dt;if(s.checkout?.convId===p.convId)s.checkout.startedAt+=dt;}
  dailyRules(s);
  updateWeather(s);
  if (s.weather.kind === 'clear') s.wetness = Math.max(0, s.wetness - dt * .004);
  updateShift(s);
  director(s);
  moveActors(s, dt);
  for (const a of Object.values(s.actors)) {
    if (!s.actors[a.id]) continue;
    if (a.role === 'worker') { runWorker(s, a); continue; }
    if (s.clock - a.enteredAt > 150 && a.cur?.t !== 'leave') forceLeave(s, a);
    if (!a.cur) { a.cur = a.plan.shift() ?? { t: 'leave' }; a.phase = 0; a.t = 0; }
    const done = STEPS[a.cur.t]?.(s, a, a.cur) ?? true;
    if (done && s.actors[a.id]) { a.cur = null; a.phase = 0; a.t = 0; }
    if (s.actors[a.id]) P(s, a.id).status.action = a.state;
  }
  for (const a of Object.values(s.actors)) if (a.role === 'worker') P(s, a.id).status.action = a.state;
  updateQueue(s);
  updateCheckout(s);
  runConversations(s);
  ambient(s);
  tickStreet(s,dt);
  tickInterior(s, KIT);
  for (const p of Object.values(s.people)) p.status.mood = Math.max(0, Math.min(100, p.status.mood));
  if (s.pending.length > MAX_PENDING * 2) s.pending.splice(0, s.pending.length - MAX_PENDING);
  tickMoments(s);
}
function forceLeave(s, a) {
  if(s.interior.restroom.by===a.id)s.interior.restroom.by=null;a.privateRoom=false;
  release(s, a);
  s.queue = s.queue.filter(id => id !== a.id);
  if (s.checkout?.customer === a.id) return;
  if (s.interior.kiosk.by === a.id) { s.interior.kiosk.by = null; s.interior.kiosk.error = false; }
  for (const it of a.cart.splice(0)) returnToShelf(s, it.p, it);
  a.plan = []; a.cur = { t: 'leave' }; a.phase = 0;
}
function updateQueue(s) {
  s.queue = s.queue.filter(id => s.actors[id] && s.actors[id].cur?.t === 'checkout' && !s.actors[id].cutting);
  s.queue = [...new Set(s.queue)];
  s.queue.forEach((id, i) => {
    const a = s.actors[id], slot = SPOTS.queue[Math.min(i, SPOTS.queue.length - 1)];
    if (a.qslot !== i) { a.qslot = i; goTo(s, a, slot); }
  });
}

// ---------- operations exposed to the UI ----------
export function approveDraft(s){
  const draft=s.management.draft;if(!draft)return {ok:false,message:'먼저 주문서를 만들어 주세요.'};
  if(draft.pending!==JSON.stringify(s.orders.pending))return {ok:false,message:'입고 예정량이 바뀌었어요. 주문서를 다시 계산해 주세요.'};
  const rows=Object.entries(draft.items).filter(([,n])=>n>0),cost=draftCost(s);
  if(!rows.length||rows.some(([p,n])=>!canOrder(s,p,n))||cost>orderAllowance(s))return {ok:false,message:'수량, 하루 예산, 남겨둘 잔액을 확인해 주세요.'};
  for(const [p,n]of rows)placeOrder(s,p,n,'approval');s.management.draft=null;
  return {ok:true,message:'주문서를 확정했어요. 다음 07시 입고분에 포함돼요.'};
}
export function requestRestock(s,worker,customer,p){
  if(!PRODUCTS[p]||!s.people[worker]||!s.people[customer])return null;
  const list=s.management.requests,existing=list.find(r=>r.customer===customer&&r.p===p&&['pending','ordered'].includes(r.status));if(existing)return existing;
  if(list.length>=40){const i=list.findIndex(r=>!['pending','ordered'].includes(r.status));if(i<0)return null;list.splice(i,1);}
  const request={id:nextId(s,'request'),worker,customer,p,at:s.clock,status:'pending'};list.push(request);
  remember(s,worker,{about:[customer],text:`${pname(p)} 재입고 요청을 장부에 남겼다.`,source:'self',importance:.35,data:{product:p}});
  return request;
}
export function decideRequest(s,id,accept){
  const r=s.management.requests.find(r=>r.id===id);if(!r||r.status!=='pending')return false;
  if(!accept){r.status='declined';return true;}
  if(!placeOrder(s,r.p,1,'player'))return false;
  const o=openObligation(s,'restock_promise',{debtor:r.worker,creditor:r.customer,item:pname(r.p),product:r.p,eventId:null});
  o.dueDay=s.day+(minuteOfDay(s)<420&&s.orders.lastDeliveryDay!==s.day?0:1);o.reservation=true;
  r.status='ordered';r.obligationId=o.id;
  // The approval is a store record. No absent customer/worker acquires a memory of it.
  return true;
}
export function setFacility(s, key, on) {
  const prices=Object.fromEntries(Object.entries(FACILITIES).map(([id,f])=>[id,f.price]));
  if (key === 'selfCheckout' && !on && s.interior.kiosk.by) return false;
  if (!(key in prices)) return false;
  if (key === 'extraTable' && !on && Object.values(s.actors).some(a => FIXTURES.table2.access.some(c => a.spot && a.spot[0] === c[0] && a.spot[1] === c[1]))) return false;
  if (key === 'extraTable' && on && Object.values(s.actors).some(a => { const [x, y] = cellOf(a); return y === 11 && x >= 17 && x <= 21; })) return false;
  if(on&&!s.facilities[key]&&!s.facilityOwned?.[key]){if(s.money<prices[key])return false;s.money-=prices[key];pushLedger(s,{kind:'expense',amount:-prices[key],reason:key});(s.facilityOwned??={})[key]=true;}
  recordDecision(s,'facility',key,!!s.facilities[key],!!on);
  s.facilities[key] = !!on;
  if(key==='tobaccoSales')for(const p of ['cigaretteBlue','cigaretteBrown'])s.orders.par[p]=on?8:0;
  if (key === 'umbrellaSale' && on && !s.orders.par.umbrella) s.orders.par.umbrella = 4;
  if (key === 'umbrellaSale' && !on) s.orders.par.umbrella = 0;
  // The walkable grid changed; re-plan routes that might cross the new table.
  for (const a of Object.values(s.actors)) if (a.path.length && a.goal) goTo(s, a, cellOf(a.goal));
  return true;
}
// Promotions are set by the player; the till and the shelves read them directly.
export function setPromo(s, p, kind) {
  const d = PRODUCTS[p];
  if (!d || d.counter || d.staffOnly || d.fixture === 'counterRack') return false;
  if (!kind) { delete s.interior.promos[p]; return true; }
  if (!['1+1', '2+1'].includes(kind)) return false;
  s.interior.promos[p] = kind;
  return true;
}
export function setPar(s,p,n){return setTargetPar(s,p,n);}
export function addException(s, x) { s.roster.exceptions.push({ ...x, id: nextId(s, 'x') }); }
export function removeException(s, id) { s.roster.exceptions = s.roster.exceptions.filter(x => x.id !== id); }
export function currentShift(s) { return workerAt(s.roster, s.clock); }
export function eligibleForTobacco(p){return !['child','teen'].includes(p.genes.appearance.age)&&(p.genes.life.ageYears??parseInt(p.genes.life.ageGroup,10))>=19;}
export function settleOffline(s,now,from=s.savedAt){
  const plan=offlinePlan(s,now,from);let revenue=0;
  for(const p of plan.items){if(!takeFromShelf(s,p))continue;s.counts[p].sold++;consumeBatch(s,p);revenue+=PRODUCTS[p].price;}
  if(revenue){s.money+=revenue;s.sales.revenue+=revenue;pushLedger(s,{kind:'sale',amount:revenue,items:plan.items.map(p=>[p,1]),by:'offline'});}
  s.offlineSettledAt=now;s.offlineReport={at:now,duration:plan.duration,items:plan.items.length,revenue};return s.offlineReport;
}
export function rosterTimeline(s, day) { return timeline(s.roster, day); }

// ---------- self checkout ----------
// Simple baskets only: nothing age-restricted, nothing kept behind the till, no errands.
function kioskFits(s, a) {
  if(a.payment==='cash')return false;
  if (!s.facilities.selfCheckout || !a.cart.length) return false;
  const k = s.interior.kiosk, p = P(s, a.id), age = p.genes.appearance.age;
  if ((k.by && s.actors[k.by]) || age === 'child') return false;
  if (a.counterAsk?.length || a.requestedProduct || a.errands?.length || a.flags.returning || a.parcelToSend || a.cart.some(it => isAdultItem(it.p))) return false;
  if (s.interior.parcels.some(x => x.kind === 'arrive' && x.for === a.id)) return false;
  const likes = age === 'elder' ? .1 : age === 'teen' ? .75 : .45;
  return rand(s) < likes + (s.queue.length >= 1 ? .3 : 0);
}
// Same bookkeeping as the till, without a worker: no familiarity is built.
function kioskPurchase(s, a) {
  const items = a.cart.splice(0), total = itemsTotal(items);
  s.money += total; s.sales.revenue += total; s.sales.tx++;
  for (const it of items) { s.counts[it.p].sold++; consumeBatch(s, it.p); }
  a.receipt=paymentReceipt('card',total);
  pushLedger(s, { kind: 'sale', amount: total, payment:a.receipt, items: items.map(it => [it.p, 1]), customer: a.id, worker: null, by: 'kiosk', ...(items.some(it => it.free || it.disc) ? { deals: items.filter(it => it.free || it.disc).length } : {}) });
  const byOwner = {};
  for (const it of items) (byOwner[it.by] ??= []).push(it.p);
  for (const [owner, list] of Object.entries(byOwner)) {recordPurchase(s, owner, null, list);if(s.actors[owner])s.actors[owner].flags.madePurchase=true;}
  a.bag.push(...items.map(it => it.p));
  if (a.basket) { a.basket = false; s.interior.baskets.counter++; }
  a.budget -= total; a.flags.paid = true; s.stats.served++;
}
// Units that left the shelf and will never be sold: counted as waste, with a zero-value ledger line.
function writeOff(s, p, reason) {
  s.counts[p].wasted++;
  pushLedger(s, { kind: 'loss', amount: 0, items: [[p, 1]], value: PRODUCTS[p].cost, reason });
}
const KIT = { goTo, arrived, near, nearestStand, P, rand, addEvent, adjust, remember, nameFor, startConversation, SIM_DT, writeOff };

// Display name for the viewer of the game: names only once the player has heard them.
export function displayName(s, id) {
  const p = s.people[id];
  if (!p) return '';
  return s.playerNames[id] ? p.name : p.label ?? lookLabel(p.genes.appearance);
}
