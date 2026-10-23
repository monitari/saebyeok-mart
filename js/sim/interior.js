// Store equipment and housekeeping: bins, tidiness, baskets, coffee machine, parcels, promotions,
// discount stickers, ATM, self checkout and the street-side service visits.
// Simulation helpers arrive as `k` so this module does not import sim.js (which imports it).
import { PRODUCTS } from './data.js';
import { FIXTURES, SPOTS } from './world.js';
import {workerStyle} from './worker-style.js';
import {OPENING_TIME} from './opening.js';

export const BASKETS = 6, PARCEL_FEE = 4000, STICKER_RATE = .7, PARCEL_KEEP_DAYS = 7;
export const PROMO_KINDS = { '1+1': 1, '2+1': 2 };   // paid units needed for one free unit
export const TIDY_FIXTURES = ['snackShelf', 'ramenShelf', 'dailyShelf', 'breadRack', 'iceFreezer', 'drinkFridge', 'milkFridge', 'alcoholFridge', 'mealCooler', 'newsRack', 'counterRack','dessertCooler'];
// Goods added with the interior expansion. Older saves receive them with no stock.
export const INTERIOR_PRODUCTS = ['mask', 'salad', 'beer', 'soju', 'bread', 'castella', 'iceCream', 'iceCup', 'newspaper', 'gum', 'americano', 'hotbar', 'hangover','peachTea','yogurt','tunaRoll','cheeseRamen','crackers','saltBread','pudding','creamCake','wetWipes'];

export function createInterior() {
  return {
    bins: { general: .1, recycle: .05 }, bagsInBack: 0, curbBags: 0,
    tidy: Object.fromEntries(TIDY_FIXTURES.map(f => [f, 1])),
    coffee: { beans: 1, by: null, until: 0 }, baskets: { stack: BASKETS, counter: 0 },
    parcels: [], nextParcel: 1, promos: {}, stickers: {}, wetSign: false,
    atm: { by: null, until: 0 }, kiosk: { by: null, error: false }, restroom:{by:null,uses:0},
    truck: null, lastStickerDay: 0, lastCourierDay: 0, lastGarbageDay: 0
  };
}

export function unitPrice(it) {
  const price = PRODUCTS[it.p].price;
  if (it.free) return 0;
  return it.disc ? Math.round(price * STICKER_RATE / 100) * 100 : price;
}
export const itemsTotal = items => items.reduce((n, it) => n + unitPrice(it), 0);
export const isAdultItem = p => !!PRODUCTS[p]?.adult;

// Picking one unit can bring along free units under a promotion, or a cheaper stickered unit.
// Returns the cart items to add; stock moves happen in the caller through `take`.
export function pickUnits(s, p, buyer, take, r) {
  const x = s.interior, out = [];
  const sticky = x.stickers[p] ?? 0, fresh = s.shelf[p] - sticky;
  const wantsDeal = buyer.budget < 7000 || buyer.selfCentered >= 70 || buyer.meticulous < 40;
  const disc = sticky > 0 && (fresh <= 0 || (wantsDeal && buyer.meticulous < 85));
  if (!take(p)) return out;
  if (disc) x.stickers[p] = sticky - 1;
  out.push({ p, by: buyer.id, ...(disc ? { disc: true } : {}) });
  const promo = PROMO_KINDS[x.promos[p]];
  if (promo && !disc) {
    // 2+1 asks for a second paid unit first; most people take a deal that is right in front of them.
    let paid = 1;
    if (promo === 2 && r() < .45 + buyer.impulsivity / 200 && take(p)) { out.push({ p, by: buyer.id }); paid = 2; }
    if (paid >= promo && take(p)) out.push({ p, by: buyer.id, free: true });
  }
  return out;
}
// A unit going back to the shelf keeps its sticker.
export function putBackUnit(s, it) {
  if (it?.disc) s.interior.stickers[it.p] = (s.interior.stickers[it.p] ?? 0) + 1;
}

export function messUp(s, fixture, meticulous) {
  if (!(fixture in s.interior.tidy)) return;
  s.interior.tidy[fixture] = Math.max(0, s.interior.tidy[fixture] - .05 * (1.25 - meticulous / 100));
}

export function binDrop(s, kind) {
  const b = s.interior.bins;
  if (kind === 'soup') { b.recycle = Math.min(1.3, b.recycle + .06); b.general = Math.min(1.3, b.general + .03); }
  else if (kind === 'cup' || kind === 'can' || kind === 'bottle') b.recycle = Math.min(1.3, b.recycle + .05);
  else b.general = Math.min(1.3, b.general + .05);
}
export const trashKind = p => PRODUCTS[p]?.heat === 'hotWater' ? 'soup' : ['cup', 'can', 'bottle', 'bigcup'].includes(PRODUCTS[p]?.shape) ? 'cup' : 'general';

// Units on the shelf that belong to batches thrown away at the next morning's check.
export function expiringOnShelf(s, p) {
  const list = s.batches[p], life = PRODUCTS[p].expires;
  if (!list || !life || PRODUCTS[p].counter || PRODUCTS[p].shape === 'paper') return 0;
  const n = list.filter(b => b.day + life < s.day + 1).reduce((t, b) => t + b.n, 0);
  return Math.min(n, s.shelf[p]);
}

const minute = s => ((Math.floor(s.clock) % 1440) + 1440) % 1440;
const night = s => { const m = minute(s); return m >= 22 * 60 || m < 5 * 60; };

// ---------- worker jobs ----------
export function chooseInteriorJob(s, w, k) {
  const x = s.interior, m = minute(s);
  if (x.kiosk.error && x.kiosk.by && s.actors[x.kiosk.by]) return { type: 'helpKiosk', phase: 0 };
  if (s.wetness > .3 && !x.wetSign) return { type: 'wetSign', phase: 0 };
  if (x.bins.general >= .8 || x.bins.recycle >= .8) return { type: 'emptyBins', phase: 0 };
  if (x.coffee.beans < .2) return { type: 'beans', phase: 0 };
  if (m >= 20 * 60 && x.lastStickerDay !== s.day && Object.keys(PRODUCTS).some(p => expiringOnShelf(s, p) > (x.stickers[p] ?? 0))) return { type: 'stickers', phase: 0 };
  if (x.baskets.counter >= 3) return { type: 'baskets', phase: 0 };
  if (x.bagsInBack > 0 && night(s)) return { type: 'curb', phase: 0 };
  const tidyAt=s.clock>=OPENING_TIME+90?workerStyle(k.P(s,w.id)).tidyAt:.55;
  const messy = TIDY_FIXTURES.filter(f => x.tidy[f] < tidyAt).sort((a, b) => x.tidy[a] - x.tidy[b])[0];
  if (messy) return { type: 'faceUp', fixture: messy, phase: 0 };
  if (x.baskets.counter > 0 && k.rand(s) < .02) return { type: 'baskets', phase: 0 };
  return null;
}
const skill = (k, s, w, key) => 1.6 - k.P(s, w.id).skills[key] / 100;
export const INTERIOR_JOBS = {
  helpKiosk(s, w, job, k) {
    const x = s.interior, a = s.actors[x.kiosk.by];
    if (!a || !x.kiosk.error) { w.job = null; return; }
    if (job.phase === 0) { k.goTo(s, w, SPOTS.kioskHelp); job.phase = 1; w.state = '셀프 계산대를 도우러 가는 중'; }
    if (job.phase === 1 && k.arrived(w)) {
      w.dir = SPOTS.kioskHelp[2]; w.anim = 'restock'; job.phase = 2; job.t = .8 * skill(k, s, w, 'service'); job.busy = true;
      k.startConversation(s, 'kiosk', [{ sp: w.id, to: a.id, k: 'kiosk_help', literal: '제가 해 드릴게요.', noAi: true, delay: .1 }, { sp: a.id, to: w.id, k: 'thanks' }], { members: [w.id, a.id] });
    }
    if (job.phase === 2) {
      job.t -= k.SIM_DT;
      if (job.t > 0) return;
      x.kiosk.error = false; w.anim = 'idle'; w.job = null;
      const e = k.addEvent(s, 'kiosk_help', { actors: [a.id, w.id], importance: .3, data: { customer: a.id, worker: w.id } });
      k.adjust(s, a.id, w.id, { fam: 3, grat: 4 });
      k.remember(s, a.id, { eventId: e.id, about: [w.id], text: `셀프 계산대가 멈췄을 때 ${k.nameFor(s, a.id, w.id)}가 와서 도와줬다.`, importance: .3, tone: 'grateful' });
    }
  },
  wetSign(s, w, job, k) {
    if (job.phase === 0) { k.goTo(s, w, [12, 13]); job.phase = 1; w.state = '미끄럼 주의 표지판을 세우는 중'; }
    if (job.phase === 1 && k.arrived(w)) { w.anim = 'restock'; w.dir = 'down'; job.phase = 2; job.t = .4; }
    if (job.phase === 2) { job.t -= k.SIM_DT; if (job.t <= 0) { s.interior.wetSign = true; w.anim = 'idle'; w.job = null; } }
  },
  emptyBins(s, w, job, k) {
    const b = s.interior.bins;
    if (job.phase === 0) { k.goTo(s, w, FIXTURES.recycle.access[0]); job.phase = 1; w.state = '쓰레기통을 비우는 중'; }
    if (job.phase === 1 && k.arrived(w)) { w.anim = 'restock'; w.dir = 'up'; job.phase = 2; job.t = 1.2 * skill(k, s, w, 'cleaning'); job.busy = true; }
    if (job.phase === 2) {
      job.t -= k.SIM_DT;
      if (job.t > 0) return;
      const bags = (b.general >= .4 ? 1 : 0) + (b.recycle >= .4 ? 1 : 0) || 1;
      b.general = .03; b.recycle = .03; w.holding = 'trashbag';
      // At night the bags go straight out to the curb; during the day they wait in the back room.
      if (night(s)) { k.goTo(s, w, [11, 16]); job.phase = 3; job.bags = bags; w.state = '쓰레기봉투를 내놓는 중'; }
      else { k.goTo(s, w, FIXTURES.storage.access[0]); job.phase = 4; job.bags = bags; w.state = '쓰레기봉투를 창고에 두는 중'; }
    }
    if (job.phase === 3 && k.arrived(w)) { s.interior.curbBags += job.bags; w.holding = null; w.job = null; }
    if (job.phase === 4 && k.arrived(w)) { s.interior.bagsInBack += job.bags; w.holding = null; w.job = null; }
  },
  curb(s, w, job, k) {
    if (job.phase === 0) { k.goTo(s, w, FIXTURES.storage.access[0]); job.phase = 1; w.state = '쓰레기봉투를 가지러 가는 중'; }
    if (job.phase === 1 && k.arrived(w)) { job.bags = s.interior.bagsInBack; s.interior.bagsInBack = 0; w.holding = 'trashbag'; job.busy = true; k.goTo(s, w, [11, 16]); job.phase = 2; w.state = '쓰레기봉투를 내놓는 중'; }
    if (job.phase === 2 && k.arrived(w)) { s.interior.curbBags += job.bags; w.holding = null; w.job = null; }
  },
  beans(s, w, job, k) {
    if (job.phase === 0) { k.goTo(s, w, FIXTURES.storage.access[0]); job.phase = 1; w.state = '원두를 가지러 가는 중'; }
    if (job.phase === 1 && k.arrived(w)) { w.holding = 'beans'; job.busy = true; k.goTo(s, w, FIXTURES.coffeeMachine.access[1]); job.phase = 2; w.state = '커피 머신에 원두를 채우는 중'; }
    if (job.phase === 2 && k.arrived(w)) { w.anim = 'restock'; w.dir = 'up'; job.phase = 3; job.t = 1 * skill(k, s, w, 'stocking'); }
    if (job.phase === 3) { job.t -= k.SIM_DT; if (job.t <= 0) { s.interior.coffee.beans = 1; w.holding = null; w.anim = 'idle'; w.job = null; } }
  },
  stickers(s, w, job, k) {
    const x = s.interior;
    if (job.phase === 0) {
      job.list = Object.keys(PRODUCTS).filter(p => expiringOnShelf(s, p) > (x.stickers[p] ?? 0));
      if (!job.list.length) { x.lastStickerDay = s.day; w.job = null; return; }
      job.phase = 1;
    }
    if (job.phase === 1) {
      const p = job.list[0];
      if (!p) { x.lastStickerDay = s.day; w.job = null; return; }
      k.goTo(s, w, k.nearestStand(s, FIXTURES[PRODUCTS[p].fixture].access[0])); job.phase = 2; w.state = '유통기한 임박 상품에 할인 스티커를 붙이는 중';
    }
    if (job.phase === 2 && k.arrived(w)) { w.anim = 'restock'; w.dir = FIXTURES[PRODUCTS[job.list[0]].fixture].access[0][2]; job.phase = 3; job.t = .6; job.busy = true; }
    if (job.phase === 3) {
      job.t -= k.SIM_DT;
      if (job.t > 0) return;
      const p = job.list.shift();
      x.stickers[p] = Math.max(x.stickers[p] ?? 0, expiringOnShelf(s, p));
      w.anim = 'idle'; job.phase = 1;
    }
  },
  baskets(s, w, job, k) {
    const x = s.interior.baskets;
    if (job.phase === 0) { job.n = x.counter; x.counter = 0; w.holding = job.n ? 'baskets' : null; job.busy = true; if (!job.n) { w.job = null; return; } k.goTo(s, w, FIXTURES.basketStack.access[0]); job.phase = 1; w.state = '장바구니를 제자리에 두는 중'; }
    if (job.phase === 1 && k.arrived(w)) { x.stack += job.n; w.holding = null; w.job = null; }
  },
  faceUp(s, w, job, k) {
    if (job.phase === 0) { k.goTo(s, w, k.nearestStand(s, FIXTURES[job.fixture].access[0])); job.phase = 1; w.state = `${FIXTURES[job.fixture].name}을 정리하는 중`; }
    if (job.phase === 1 && k.arrived(w)) { w.anim = 'restock'; w.dir = FIXTURES[job.fixture].access[0][2] ?? 'up'; job.phase = 2; job.t = .9 * skill(k, s, w, 'stocking'); }
    if (job.phase === 2) { job.t -= k.SIM_DT; if (job.t <= 0) { s.interior.tidy[job.fixture] = 1; w.anim = 'idle'; w.job = null; } }
  }
};
// Jobs that leave the worker holding something they must put down if interrupted.
export function dropInteriorHolding(s, w, job) {
  if (!job) return;
  if (job.type === 'baskets' && job.n) s.interior.baskets.counter += job.n;
  if ((job.type === 'emptyBins' || job.type === 'curb') && job.bags) s.interior.bagsInBack += job.bags;
  if (['trashbag', 'baskets', 'beans'].includes(w.holding)) w.holding = null;
}

// ---------- once-a-day visits and continuous upkeep ----------
export function tickInterior(s, k) {
  const x = s.interior, m = minute(s);
  if (x.wetSign && s.wetness < .08) x.wetSign = false;
  // Stock can leave the shelf by other routes (waste, the till); stickers never outnumber units.
  for (const [p, v] of Object.entries(x.stickers)) { const n = Math.min(v, s.shelf[p]); if (n > 0) x.stickers[p] = n; else delete x.stickers[p]; }
  if (x.truck && s.clock >= x.truck.until) x.truck = null;
  if (x.coffee.by && s.elapsed >= x.coffee.until) x.coffee.by = null;
  // Garbage truck before dawn.
  if (m >= 5 * 60 && m < 6 * 60 && x.lastGarbageDay !== s.day) {
    x.lastGarbageDay = s.day;
    if (x.curbBags > 0) { x.truck = { kind: 'garbage', until: s.clock + 8 }; k.addEvent(s, 'garbage_pickup', { importance: .1, data: { bags: x.curbBags } }); x.curbBags = 0; }
  }
  // The courier collects parcels to send and may drop off parcels for regulars.
  if (m >= 16 * 60 && x.lastCourierDay !== s.day) {
    x.lastCourierDay = s.day;
    x.truck = { kind: 'parcel', until: s.clock + 12 };
    const sent = x.parcels.filter(p => p.kind === 'send').length;
    x.parcels = x.parcels.filter(p => p.kind !== 'send' && s.day - p.day <= PARCEL_KEEP_DAYS);
    const candidates = Object.values(s.people).filter(p => p.kind === 'customer' && p.visits > 0 && !['child', 'teen'].includes(p.genes.appearance.age) && !x.parcels.some(q => q.for === p.id));
    const arrivals = [];
    for (const p of candidates) if (k.rand(s) < .06 && x.parcels.length < 12) { x.parcels.push({ id: 'pc' + x.nextParcel++, kind: 'arrive', for: p.id, day: s.day }); arrivals.push(p.id); }
    k.addEvent(s, 'parcel_courier', { importance: .1, data: { sent, arrivals } });
  }
}
export function startDeliveryTruck(s) { s.interior.truck = { kind: 'delivery', until: s.clock + 15 }; }

// ---------- save support ----------
export function migrateInterior(s) {
  if (!s.interior) {
    s.interior = createInterior();
    // Baskets already in shoppers' hands are not also on the rack.
    s.interior.baskets.stack = Math.max(0, BASKETS - Object.values(s.actors ?? {}).filter(a => a.basket).length);
  }
  const base = createInterior();
  for (const [key, v] of Object.entries(base)) s.interior[key] ??= v;
  for (const f of TIDY_FIXTURES) s.interior.tidy[f] ??= 1;
  s.facilities.selfCheckout ??= false;
  // New goods start empty in older saves; the next automatic order brings them in.
  for (const p of INTERIOR_PRODUCTS) if (s.counts && !(p in s.counts)) {
    s.counts[p] = { start: 0, delivered: 0, sold: 0, wasted: 0 }; s.shelf[p] = 0; s.back[p] = 0;
    s.orders.par[p] = defaultPar(p);
    if (PRODUCTS[p].expires) s.batches[p] = [];
  }
}
export const defaultPar = p => { const d = PRODUCTS[p]; return d.facility ? 0 : d.par ?? (p === 'lunchbox' ? 2 : d.shelfMax + Math.ceil(d.shelfMax * .4)); };

export function validateInterior(s) {
  const x = s.interior, n = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
  const fail = m => { throw new Error(m); };
  if (!x || typeof x !== 'object') fail('매장 설비 정보가 없어요.');
  if(!x.restroom||!Number.isInteger(x.restroom.uses)||x.restroom.uses<0||x.restroom.by!==null&&(!s.actors[x.restroom.by]||s.actors[x.restroom.by].cur?.t!=='restroom'||s.actors[x.restroom.by].phase!==2))fail('화장실 이용 정보가 올바르지 않아요.');
  if (!n(x.bins?.general, 0, 1.5) || !n(x.bins?.recycle, 0, 1.5) || !n(x.bagsInBack, 0, 40) || !n(x.curbBags, 0, 40)) fail('쓰레기통 정보가 올바르지 않아요.');
  for (const f of TIDY_FIXTURES) if (!n(x.tidy?.[f], 0, 1)) fail('진열 정리 정보가 올바르지 않아요.');
  if (!n(x.coffee?.beans, 0, 1)) fail('커피 머신 정보가 올바르지 않아요.');
  const carried = Object.values(s.actors).filter(a => a.basket).length;
  if (!Number.isInteger(x.baskets?.stack) || !Number.isInteger(x.baskets?.counter) || x.baskets.stack < 0 || x.baskets.counter < 0 || x.baskets.stack + x.baskets.counter + carried > BASKETS) fail('장바구니 정보가 올바르지 않아요.');
  if (!Array.isArray(x.parcels) || x.parcels.length > 30 || x.parcels.some(p => !['send', 'arrive'].includes(p.kind) || !n(p.day, 1, 1e5) || (p.kind === 'arrive' && !s.people[p.for]) || (p.kind === 'send' && !s.people[p.from]))) fail('택배 정보가 올바르지 않아요.');
  for (const [p, kind] of Object.entries(x.promos ?? {})) if (!PRODUCTS[p] || !PROMO_KINDS[kind]) fail('행사 정보가 올바르지 않아요.');
  for (const [p, v] of Object.entries(x.stickers ?? {})) if (!PRODUCTS[p] || !Number.isInteger(v) || v < 0 || v > s.shelf[p]) fail('할인 스티커 정보가 올바르지 않아요.');
  return s;
}
