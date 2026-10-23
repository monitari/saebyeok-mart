// Player-facing recordings. These never teach NPCs anything or re-run game effects.
import { PRODUCTS } from './data.js';
import { SCENES, EFFECT_TYPES, KIND_TYPES } from './catalog.js';
import { validateAppearance } from './genes.js';
import { validateStreet } from './street.js';
import { DIRECTIONS } from './directions.js';

export const MOMENT_CAP = 12, PIN_CAP = 4, RECENT_CAP=8, FRAME_CAP = 40, FRAME_INTERVAL = .5;
export const RECENT_SIZE_CAP=450_000;
const footprints=new WeakMap();
function footprint(m){
  const key=`${m.frames.length}:${m.lines.length}:${m.complete}`,cached=footprints.get(m);
  if(cached?.key===key)return cached.size;
  const size=JSON.stringify(m).length;footprints.set(m,{key,size});return size;
}
const copy = v => structuredClone(v);
const r1 = v => Math.round(v * 10) / 10;
// Stock is stored as an array in this product order. New products are only ever appended to PRODUCTS,
// so older frames simply have shorter arrays.
const STOCK_ORDER = Object.keys(PRODUCTS);
// A compact picture of the equipment for replays; values not stored here fall back to the current store.
function insideOf(s) {
  const x = s.interior;
  if (!x) return null;
  return { bins: [r1(x.bins.general), r1(x.bins.recycle)], tidy: Object.values(x.tidy).map(r1), baskets: [x.baskets.stack, x.baskets.counter], wet: x.wetSign ? 1 : 0,
    truck: x.truck?.kind ?? null, busy: [x.coffee.by, x.atm.by, x.kiosk.by, x.kiosk.error ? 1 : 0], curb: x.curbBags, parcels: x.parcels.length,
    ...(Object.keys(x.stickers).length ? { stickers: { ...x.stickers } } : {}), ...(Object.keys(x.promos).length ? { promos: { ...x.promos } } : {}) };
}
function expandInside(cur, f) {
  const c = f.inside;
  if (!cur || !c) return cur;
  const tidyKeys = Object.keys(cur.tidy);
  return { ...cur, bins: { general: c.bins[0], recycle: c.bins[1] }, tidy: Object.fromEntries(tidyKeys.map((k, i) => [k, c.tidy[i] ?? 1])), baskets: { stack: c.baskets[0], counter: c.baskets[1] },
    restroom:{by:Object.values(f.actors).find(a=>a.privateRoom)?.id??null,uses:0},
    wetSign: !!c.wet, truck: c.truck ? { kind: c.truck, until: Infinity } : null, coffee: { ...cur.coffee, by: c.busy[0] }, atm: { ...cur.atm, by: c.busy[1] }, kiosk: { by: c.busy[2], error: !!c.busy[3] },
    curbBags: c.curb, parcels: Array.from({ length: c.parcels }, (_, i) => ({ id: 'replay' + i, kind: 'send', day: 1 })), stickers: c.stickers ?? {}, promos: c.promos ?? {} };
}
export const momentTitle = m => m.confirmed ? SCENES[m.type]?.title??'매장의 작은 순간' : m.complete?'말을 나눈 순간':SCENES[m.type]?.preview??'이야기를 나누는 중';
function init(s) { return s.moments ??= []; }
function trim(s){
  const normal=s.moments.filter(m=>!m.pinned),remove=new Set(normal.slice(0,Math.max(0,normal.length-RECENT_CAP)).map(m=>m.id));
  let size=normal.filter(m=>!remove.has(m.id)).reduce((n,m)=>n+footprint(m),0);
  for(const m of normal)if(size>RECENT_SIZE_CAP&&!remove.has(m.id)&&m.complete&&normal.length-remove.size>1){remove.add(m.id);size-=footprint(m);}
  s.moments=s.moments.filter(m=>!remove.has(m.id));
}
export function pinMoment(s,id){const m=init(s).find(m=>m.id===id);if(!m)return false;if(!m.pinned&&s.moments.filter(m=>m.pinned).length>=PIN_CAP)return false;m.pinned=!m.pinned;trim(s);return true;}
function frame(s) {
  const actors = {};
  for (const a of Object.values(s.actors)) actors[a.id] = {
    id:a.id, x:r1(a.x), y:r1(a.y), dir:a.dir, walk:r1(a.walk ?? 0), anim:a.anim ?? 'idle', role:a.role,
    state:a.state ?? '', path:a.path.length ? [0] : [], talkUntil:Math.round((a.talkUntil ?? 0) * 100) / 100,
    ...(a.basket ? { basket: true } : {}),...(a.privateRoom?{privateRoom:true}:{}),
    holding:copy(a.holding ?? null), bag:a.bag?.length ? [0] : [], cart:copy(a.cart ?? []),
    hasUmbrella:!!a.hasUmbrella, ownUmbrella:!!a.ownUmbrella
  };
  return { at:s.clock, elapsed:s.elapsed, layoutVersion:s.layoutVersion??1, actors, moods:Object.fromEntries(Object.values(s.people).map(p=>[p.id,Math.round(p.status.mood)])), stock:STOCK_ORDER.map(p=>s.shelf[p]??0), inside:insideOf(s), wetness:r1(s.wetness),
    weather:{...s.weather}, facilities:{...s.facilities}, rental:{...s.rental},
    appliances:copy(s.appliances), trash:copy(s.trash), boxes:copy(s.boxes), street:s.street?copy(s.street):null,
    checkout:s.checkout ? {items:copy(s.checkout.items),customer:s.checkout.customer,payment:s.checkout.payment??'card'} : null };
}
function create(s,type,members,convId=null,eventId=null) {
  const moments=init(s), actors=[...new Set(members)].filter(id=>s.people[id]);
  const key=`${type}:${actors.join(':')}`,last=(s.momentNotices??={})[key]??-1e9;
  const quiet=['seat_yield','tobacco_check','shift_change','kind_words','kid_candy'].includes(type);
  const notify=s.clock-last>=(SCENES[type]?.cooldown??1440)&&(!quiet||s.clock-(s.momentNotices[`quiet:${type}`]??-1e9)>=1440);
  if(notify){s.momentNotices[key]=s.clock;if(quiet)s.momentNotices[`quiet:${type}`]=s.clock;}
  const m={id:`moment-${s.nextId++}`,type,at:s.clock,day:s.day,actors,convIds:convId?[convId]:[],eventIds:eventId?[eventId]:[],confirmed:!!eventId,notify,pinned:false,
    place:copy(s.actors[actors[0]] ? {x:s.actors[actors[0]].x,y:s.actors[actors[0]].y} : {x:384,y:320}),
    labels:Object.fromEntries(Object.values(s.people).map(p=>[p.id,s.playerNames[p.id]?p.name:p.label??'손님'])),
    // Only people in the shop are kept; anyone else falls back to their current look in the replay.
    looks:Object.fromEntries(Object.entries(s.people).filter(([id])=>s.actors[id]).map(([id,p])=>[id,JSON.parse(JSON.stringify(p.genes))])),
    frames:[...(s.momentBuffer??[]).filter(f=>s.clock-f.at<=2),frame(s)],lines:[],until:s.clock+16,complete:false,seen:false};
  moments.push(m);trim(s);
  return m;
}
export function beginMoment(s,conv) {
  // Only announce exchanges selected by the rules, never every ordinary checkout.
  const effect=conv.lines.find(l=>EFFECT_TYPES[l.effect?.[0]])?.effect?.[0];
  const type=KIND_TYPES[conv.kind]??EFFECT_TYPES[effect];
  if(!type)return;
  create(s,type,conv.members,conv.id);
}
export function eventMoment(s,e) {
  if(!SCENES[e.type])return;
  // Match the actual conversation first, not an unrelated nearby exchange.
  const conv=e.convId?s.conversations.find(c=>c.id===e.convId):null;
  let m=[...init(s)].reverse().find(m=>!m.complete&&(conv?m.convIds.includes(conv.id):m.type===e.type&&e.actors.every(id=>m.actors.includes(id))));
  if(!m){
    m=create(s,e.type,e.actors,conv?.id,e.id);
    if(conv)m.lines=copy(s.log.filter(l=>l.convId===conv.id).slice(-20));
  }else if(!m.eventIds.includes(e.id))m.eventIds.push(e.id);
  m.type=e.type;m.confirmed=true;
}
export function recordMomentLine(s,line) {
  for(const m of init(s))if(!m.complete&&line.convId&&m.convIds.includes(line.convId)&&m.lines.length<24)m.lines.push(copy(line));
}
export function tickMoments(s) {
  s.momentBuffer??=[];
  if(!s.momentBuffer.length||s.clock-s.momentBuffer.at(-1).at>=FRAME_INTERVAL-1e-6){s.momentBuffer.push(frame(s));if(s.momentBuffer.length>5)s.momentBuffer.shift();}
  let grew=false;
  for(const m of init(s)){
    if(m.complete)continue;
    const waiting=s.conversations.some(c=>m.convIds.includes(c.id)&&c.waiting&&s.pending.some(p=>p.id===c.waiting&&p.dispatched));
    if(waiting){m.until+=s.clock-(m.lastTickAt??s.clock);m.lastTalkAt=s.clock;m.lastTickAt=s.clock;continue;}
    m.lastTickAt=s.clock;
    if(s.clock-m.frames.at(-1).at>=FRAME_INTERVAL-1e-6){
      m.frames.push(frame(s));
      grew=true;
      const talking=s.conversations.some(c=>m.convIds.includes(c.id));
      if(talking)m.lastTalkAt=s.clock;
      if(m.frames.length>=FRAME_CAP||s.clock>=m.until||(!talking&&s.clock-(m.lastTalkAt??m.at)>=1.5))m.complete=true;
    }
  }
  if(grew)trim(s);
}
export function momentView(s,m,index) {
  const f=m.frames[Math.max(0,Math.min(m.frames.length-1,index))];
  // Rendering a historical frame reads only these snapshots. It never calls step().
  const people=Object.fromEntries(Object.entries(s.people).map(([id,p])=>[id,{...p,genes:m.looks?.[id]??p.genes,status:{...p.status,mood:f.moods?.[id]??p.status.mood}}]));
  const shelf=f.shelf??Object.fromEntries(STOCK_ORDER.map((p,i)=>[p,f.stock?.[i]??0]));
  return {...s,...f,layoutVersion:f.layoutVersion??1,shelf,interior:expandInside(s.interior,f),street:f.street??null,clock:f.at,log:m.lines,people};
}
export function validateMoments(s,checkBuffer=true) {
  s.moments ??= [];
  const fail=()=>{throw new Error('장면 기록이 올바르지 않아요.');};
  if(!Array.isArray(s.moments)||s.moments.length>MOMENT_CAP)fail();
  const num=v=>Number.isFinite(v), obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
  const products=items=>Array.isArray(items)&&items.length<=100&&items.every(it=>obj(it)&&PRODUCTS[it.p]);
  for(const m of s.moments){
    if(!obj(m)||typeof m.id!=='string'||!SCENES[m.type]||!num(m.at)||!num(m.until)||!num(m.day)||!obj(m.place)||!num(m.place.x)||!num(m.place.y)||!Array.isArray(m.actors)||m.actors.some(id=>!s.people[id])||!obj(m.labels)||!Array.isArray(m.convIds)||!Array.isArray(m.eventIds)||!Array.isArray(m.frames)||!m.frames.length||m.frames.length>FRAME_CAP||!Array.isArray(m.lines)||m.lines.length>24||typeof m.complete!=='boolean'||typeof m.seen!=='boolean')fail();
    m.confirmed??=!!m.eventIds.length;m.pinned??=false;m.notify??=true;
    if(m.looks){if(!obj(m.looks))fail();for(const [id,g]of Object.entries(m.looks))if(!s.people[id]||!g?.appearance||validateAppearance(g.appearance).length)fail();}
    if(Object.values(m.labels).some(v=>typeof v!=='string'||v.length>100))fail();
    for(const l of m.lines)if(!obj(l)||!s.people[l.speaker]||(l.to&&!s.people[l.to])||typeof l.text!=='string'||l.text.length>60||!num(l.at))fail();
    let last=-Infinity;
    for(const f of m.frames){
      if(!obj(f)||!num(f.at)||f.at<last||!num(f.elapsed)||!obj(f.actors)||!(obj(f.shelf)||(Array.isArray(f.stock)&&f.stock.length<=STOCK_ORDER.length&&f.stock.every(n=>num(n)&&n>=0)))||(f.inside!==undefined&&f.inside!==null&&(!obj(f.inside)||!Array.isArray(f.inside.bins)||!Array.isArray(f.inside.tidy)||!Array.isArray(f.inside.baskets)||!Array.isArray(f.inside.busy)))||!num(f.wetness)||!obj(f.weather)||!['rain','storm','clear','cloudy','snow'].includes(f.weather.kind)||!obj(f.facilities)||!obj(f.rental)||!num(f.rental.inStand)||!num(f.rental.total)||!obj(f.appliances)||!obj(f.appliances.microwave)||!obj(f.appliances.hotWater)||!Array.isArray(f.trash)||f.trash.length>40||!Array.isArray(f.boxes)||f.boxes.length>200||(f.checkout!==null&&(!obj(f.checkout)||!products(f.checkout.items))))fail();
      last=f.at;
      if(f.layoutVersion!==undefined&&![1,2,3,4,5].includes(f.layoutVersion))fail();
      if(f.street)validateStreet(f.street);
      if(!obj(f.moods)||Object.entries(f.moods).some(([id,n])=>!s.people[id]||!num(n)||n<0||n>100))fail();
      for(const [p,n]of Object.entries(f.shelf??{}))if(!PRODUCTS[p]||!num(n)||n<0)fail();
      for(const t of f.trash)if(!obj(t)||!Array.isArray(t.cell)||t.cell.length<2||t.cell.length>3||!t.cell.slice(0,2).every(num))fail();
      if(!f.boxes.every(b=>obj(b)&&PRODUCTS[b.p]&&num(b.n)))fail();
      for(const appliance of Object.values(f.appliances))if(!obj(appliance)||!num(appliance.until))fail();
      for(const [id,a]of Object.entries(f.actors))if(!s.people[id]||!obj(a)||a.id!==id||!num(a.x)||!num(a.y)||a.x< -40||a.x>808||a.y<0||a.y>576||!num(a.walk)||!num(a.talkUntil)||!DIRECTIONS.includes(a.dir)||!Array.isArray(a.path)||!products(a.cart)||!Array.isArray(a.bag)||(a.holding!==null&&typeof a.holding!=='string'&&(!obj(a.holding)||!PRODUCTS[a.holding.p])))fail();
    }
  }
  if(s.moments.filter(m=>m.pinned).length>PIN_CAP)fail();
  if(checkBuffer){
    s.momentBuffer??=[];if(!Array.isArray(s.momentBuffer)||s.momentBuffer.length>5)fail();
    if(s.momentBuffer.length)validateMoments({...s,moments:[{id:'buffer',type:'shift_change',at:s.clock,until:s.clock+1,day:s.day,actors:[],place:{x:0,y:0},labels:{},convIds:[],eventIds:[],frames:s.momentBuffer,lines:[],complete:true,seen:true}]},false);
  }
  return s;
}
