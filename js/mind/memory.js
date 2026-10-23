// Events (what actually happened), memories (what each person took from it), relations and obligations.
// An event record is never edited by interpretation; memories point at it by id.
import { lookLabel } from './genes.js';
import { PRODUCTS } from '../sim/data.js';
import { eventMoment } from './moments.js';
import { combineEvidence, evidenceOf, consolidateList } from './consolidation.js';

export const MEMORY_CAP = 40, EVENT_CAP = 500, HEARING = 5.5 * 32;
const clamp = v => Math.max(0, Math.min(100, Math.round(v)));

export const nextId = (s, prefix) => `${prefix}${s.nextId++}`;

export function knowsName(s, viewer, target) { return viewer === target || !!s.names[viewer]?.[target]; }
// How `viewer` refers to `target` in their own memory text.
export function nameFor(s, viewer, target) {
  const p = s.people[target];
  if (!p) return '누군가';
  if (knowsName(s, viewer, target)) return p.name;
  return p.label ?? lookLabel(p.genes.appearance);
}
export function learnName(s, viewer, target) {
  if (!s.people[viewer] || !s.people[target] || viewer === target) return false;
  s.names[viewer] ??= {};
  if (s.names[viewer][target]) return false;
  s.names[viewer][target] = true;
  return true;
}

export function rel(s, from, to) {
  s.relations[from] ??= {};
  return (s.relations[from][to] ??= { fam: 0, trust: 30, grat: 0, griev: 0, bond:0 });
}
export function adjust(s, from, to, d) {
  if (from === to || !s.people[from] || !s.people[to]) return;
  const r = rel(s, from, to);
  for (const k of ['fam', 'trust', 'grat', 'griev','bond']) if (d[k]) r[k] = clamp((r[k]??0) + d[k]);
  if(Object.values(d).some(Boolean))r.lastAt=s.clock;
}
// Encounters are counted once per visit, independently of purchases and social rewards.
export function noteContact(s,from,to,visitId) {
  const r=rel(s,from,to);if(r.lastVisit===visitId)return;
  r.firstAt??=s.clock;r.lastAt=s.clock;r.lastVisit=visitId;r.encounters=(r.encounters??0)+1;
}
export function attitude(s, from, to) {
  const r = s.relations[from]?.[to];
  if (!r) return 0;
  return r.fam * .35 + r.trust * .25 + r.grat * .4 - r.griev * .8;
}
export function relationLabel(r) {
  if (!r) return '모르는 사이';
  if (r.griev >= 40) return '서운한 사이';
  if (r.griev >= 20 && r.fam < 50) return '껄끄러운 사이';
  if (r.fam >= 10 && r.trust < 20) return '믿음이 상한 사이';
  if (r.fam >= 45 && (r.bond??0) >= 12 && r.trust >= 40 && r.griev < 20) return '가까운 사이';
  if (r.grat >= 30) return '고마운 사이';
  if (r.fam >= 25) return '익숙한 사이';
  if (r.fam >= 15) return '얼굴만 아는 사이';
  return '처음 본 사이';
}

// People who could perceive something at a point: inside the store and within hearing range.
export function witnessesAt(s, point, participants = [], radius = HEARING) {
  const set = new Set(participants.filter(id => s.actors[id]&&!s.actors[id].privateRoom));
  for (const a of Object.values(s.actors)) {
    if (a.privateRoom || point.privateRoom || a.y >= 15 * 32 || point.y >= 15 * 32 !== a.y >= 15 * 32) continue;
    if (Math.hypot(a.x - point.x, a.y - point.y) <= radius) set.add(a.id);
  }
  return [...set];
}

export function addEvent(s, type, { actors = [], at = null, data = {}, importance = .5, place = null, radius } = {}) {
  const point = place ?? s.actors[actors[0]] ?? { x: 0, y: 0 };
  const witnesses = witnessesAt(s, point, actors, radius);
  const e = { id: nextId(s, 'e'), type, convId:s.eventConversationId??null, at: at ?? s.clock, day: s.day, actors: [...actors], witnesses, place: { x: Math.round(point.x), y: Math.round(point.y) }, data: { ...data }, importance };
  s.stats.eventCounts??={};s.stats.eventCounts[type]=(s.stats.eventCounts[type]??0)+1;
  s.events.push(e);
  eventMoment(s, e);
  if (s.events.length > EVENT_CAP) pruneEvents(s);
  return e;
}

function pruneEvents(s) {
  const referenced = new Set();
  for (const list of Object.values(s.memories)) for (const m of list) {
    if (m.eventId) referenced.add(m.eventId);
    for(const id of m.evidence?.eventIds??[])referenced.add(id);
  }
  for (const o of s.obligations) { referenced.add(o.eventId); if (o.resolvedEventId) referenced.add(o.resolvedEventId); }
  const removable = s.events.map((e, i) => ({ e, i })).filter(({ e }) => !referenced.has(e.id)).sort((a, b) => a.e.importance - b.e.importance || a.e.at - b.e.at);
  const drop = new Set(removable.slice(0, s.events.length - EVENT_CAP + 50).map(x => x.e.id));
  s.events = s.events.filter(e => !drop.has(e.id));
  if (s.events.length > EVENT_CAP) s.events = s.events.slice(-EVENT_CAP);
}

// A keyed observation updates its meaning while retaining repeated experience and provenance.
export function remember(s, who, m) {
  if (!s.memories[who]) return null;
  const list = s.memories[who];
  const e=m.eventId?s.events.find(e=>e.id===m.eventId):null;
  const context=e?{topic:e.type,perspective:Object.keys(e.data).filter(k=>e.data[k]===who).sort().join(':')||'witness',outcome:e.data.allowed??null,...(e.data.product?{data:{product:e.data.product}}:{})}:{};
  const mem = { id: nextId(s, 'm'), kind: 'episode', eventId: null, about: [], text: '', at: s.clock, importance: .4, source: 'witnessed', sourceId: null, resolved: true, tone: 'neutral', ...context,...m };
  if (mem.key) {
    const i = list.findIndex(x => x.key === mem.key);
    if (i >= 0) {
      const old=list[i];
      const compatible=old.topic===mem.topic&&old.outcome===mem.outcome&&old.tone===mem.tone&&old.source===mem.source&&old.sourceId===mem.sourceId&&old.data?.product===mem.data?.product;
      if(compatible){mem.evidence=combineEvidence(old,mem);mem.consolidated=mem.evidence.count>1;mem.firstAt=mem.evidence.firstAt;}
      else if(old.topic&&mem.topic&&old.resolved&&old.kind!=='habit'){
        const archived={...old};delete archived.key;delete archived.share;list.push(archived);
      }
      mem.id=compatible?old.id:mem.id;list[i]=mem;
      if(list.length>MEMORY_CAP)pruneMemories(s,who);
      return mem;
    }
  }
  list.push(mem);
  if (list.length > MEMORY_CAP) pruneMemories(s, who);
  return mem;
}
export function pruneMemories(s, who) {
  const list = s.memories[who];
  consolidateList(list,s.clock,id=>nameFor(s,who,id),true);
  while (list.length > MEMORY_CAP) {
    let worst = -1, worstScore = Infinity;
    list.forEach((m, i) => {
      if (!m.resolved || m.core===true || m.kind === 'conflict'&&!m.reconciled) return;
      const ageDays = (s.clock - m.at) / 1440;
      const score = m.importance * (m.kind === 'habit'||m.consolidated ? 2 : 1) - ageDays * .08;
      if (score < worstScore) { worstScore = score; worst = i; }
    });
    if (worst < 0) break; // only open items left; keep them
    list.splice(worst, 1);
  }
}
export function consolidateMemories(s,who) {
  return consolidateList(s.memories[who]??[],s.clock,id=>nameFor(s,who,id));
}
// Old records can gain a topic only when their original event still exists. Never guess from prose.
export function migrateMemoryMetadata(s) {
  const events=new Map((s.events??[]).map(e=>[e.id,e]));
  for(const [who,list]of Object.entries(s.memories??{})){
    if(!Array.isArray(list))continue;
    for(const m of list){
      if(!m||m.topic!==undefined)continue;
      const e=events.get(m.eventId);if(!e?.data)continue;
      m.topic=e.type;m.perspective=Object.keys(e.data).filter(k=>e.data[k]===who).sort().join(':')||'witness';m.outcome=e.data.allowed??null;
      if(e.data.product&&!m.data)m.data={product:e.data.product};
    }
  }
}
export const memoriesAbout = (s, who, target) => (s.memories[who] ?? []).filter(m => m.about.includes(target));
export const findMemory = (s, who, pred) => (s.memories[who] ?? []).find(pred);

// Obligations: things that stay open until resolved (borrowed items, promises).
export function openObligation(s, type, { debtor, creditor, item, eventId, product = null }) {
  const o = { id: nextId(s, 'o'), type, debtor, creditor, item, product, eventId, status: 'open', openedAt: s.clock, resolvedAt: null, resolvedEventId: null };
  s.obligations.push(o);
  return o;
}
export function resolveObligation(s, o, eventId, status = 'resolved') {
  o.status = status; o.resolvedAt = s.clock; o.resolvedEventId = eventId;
}
// Mark a person's own memories about an obligation resolved, only if they learn of it.
export function learnResolved(s, who, obligationId, text, knowledge={source:'witnessed',sourceId:null}) {
  let changed = false;
  const o=s.obligations.find(o=>o.id===obligationId);
  for (const m of s.memories[who] ?? []) if (m.obligationId === obligationId && !m.resolved) {
    m.resolved=true;m.closedAt=s.clock;m.originalText=m.text;
    m.resolution={...knowledge,at:s.clock,eventId:o?.resolvedEventId??null};
    const result=o?.type==='umbrella_loan'?'빌렸던 매장 우산은 반납되었다.':o?.type==='restock_promise'?(o.status==='broken'?'상품을 준비하기로 한 약속은 지켜지지 못했다.':'약속했던 상품이 들어온 것을 확인했다.'):o?.type==='favor'?'도움을 받은 일에 인사를 전했다.':'이 일은 마무리된 것으로 알고 있다.';
    m.text=text??result;delete m.handoverText;
    changed=true;
  }
  if (text&&!changed) remember(s, who, { kind: 'fact', text, about: [], obligationId, importance: .5,...knowledge });
  return changed;
}
export const openFor = (s, who) => s.obligations.filter(o => o.status === 'open' && (o.debtor === who || o.creditor === who));

// Purchases are summarised into habits instead of being stored one by one.
export function recordPurchase(s, buyer, worker, items) {
  const h = (s.habits[buyer] ??= { buys: {}, visits: 0 });
  for (const p of items) h.buys[p] = (h.buys[p] ?? 0) + 1;
  h.last = [...items];
  const [top, count] = Object.entries(h.buys).sort((a, b) => b[1] - a[1])[0] ?? [];
  if (top && count >= 3) remember(s, buyer, { kind: 'habit', key: 'habit:buy', text: `여기서는 주로 ${PRODUCTS[top].name}${hasB(PRODUCTS[top].name) ? '을' : '를'} 산다.`, importance: .3, data: { product: top } });
  if (worker && s.people[worker]) {
    const w = (s.habits[worker] ??= { buys: {}, visits: 0 });
    w.served ??= {};
    const served = (w.served[buyer] ??= {});
    for (const p of items) served[p] = (served[p] ?? 0) + 1;
    const [wp, wc] = Object.entries(served).sort((a, b) => b[1] - a[1])[0] ?? [];
    if (wp && wc >= 2) remember(s, worker, { kind: 'habit', key: `habit:${buyer}`, about: [buyer], text: `${nameFor(s, worker, buyer)}${hasB(nameFor(s, worker, buyer)) ? '은' : '는'} 주로 ${PRODUCTS[wp].name}${hasB(PRODUCTS[wp].name) ? '을' : '를'} 산다.`, importance: .35, data: { product: wp } });
  }
}
const hasB = w => { const c = w.charCodeAt(w.length - 1) - 0xAC00; return c >= 0 && c <= 11171 && c % 28 !== 0; };
export const particle = { eun: w => w + (hasB(w) ? '은' : '는'), eul: w => w + (hasB(w) ? '을' : '를'), i: w => w + (hasB(w) ? '이' : '가'), wa: w => w + (hasB(w) ? '과' : '와') };

// Memories handed to a dialogue request: few, relevant, and always including open items.
export function relevantMemories(s, who, others = [], topic = null, limit = 3) {
  const list = s.memories[who] ?? [];
  return list.map(m => {
    let score = m.importance;
    if (m.about.some(id => others.includes(id))) score += .6;
    if (!m.resolved) score += 1.5;
    if(m.consolidated)score+=Math.min(.25,Math.log2(evidenceOf(m).count)*.05);
    if (topic && m.data?.product === topic) score += .4;
    score -= Math.min(.6, (s.clock - m.at) / 1440 * .1);
    return { m, score };
  }).sort((a, b) => b.score - a.score).slice(0, limit).map(({ m }) => ({ text: m.text, source: m.source, resolved: m.resolved, kind: m.kind, ...(m.consolidated?{experiences:evidenceOf(m).count}:{}), ...(m.sourceId?{from:nameFor(s,who,m.sourceId)}:{}) }));
}

// Daily: grievances soften, so one bad night does not fix a relationship forever.
export function dailyDecay(s) {
  for (const from of Object.values(s.relations)) for (const r of Object.values(from)) {
    r.griev = clamp(r.griev * .82 - 1);
    r.grat = clamp(r.grat * .95);
    // Anger subsides without automatically repairing trust or erasing acquaintance.
    if(r.lastAt!==undefined&&s.clock-r.lastAt>7*1440&&r.fam>15)r.fam--;
    if(r.lastAt!==undefined&&s.clock-r.lastAt>14*1440&&s.day%7===0)r.bond=Math.max(0,(r.bond??0)-1);
  }
  for(const who of Object.keys(s.memories)){consolidateMemories(s,who);if(s.memories[who].length>MEMORY_CAP)pruneMemories(s,who);}
}
