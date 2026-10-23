import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, step, startVisit, stockAudit, START_MONEY, setFacility, setPromo, eligibleForTobacco } from '../web/js/sim/sim.js';
import { FIXTURES, SPOTS, floorCell, findPath, center } from '../web/js/sim/world.js';
import { PRODUCTS } from '../web/js/sim/data.js';
import { BASKETS, pickUnits, unitPrice, itemsTotal, expiringOnShelf, PARCEL_FEE } from '../web/js/sim/interior.js';
import { parseSave, exportText, snapshot } from '../web/js/storage/save.js';
import { momentView } from '../web/js/mind/moments.js';

const advance = (s, minutes, each) => { for (let i = 0; i < minutes * 10; i++) { step(s, .1); each?.(s); } };
const until = (s, pred, minutes) => { for (let i = 0; i < minutes * 10; i++) { step(s, .1); if (pred(s)) return true; } return false; };
const balance = s => START_MONEY + s.stats.totals.sale - s.stats.totals.order - (s.stats.totals.expense ?? 0);
// An empty store with one worker, so a single visit can be followed.
function quiet(seed) {
  const s = initialState(seed);
  s.actors = { yuna: s.actors.yuna }; s.visits = []; s.conversations = []; s.pending = []; s.queue = []; s.director.story = []; s.director.nextAt = 1e9;
  return s;
}
function visit(s, id, plan, opts = {}) {
  startVisit(s, [id], null, { inside: true, hasId: true, ...opts });
  const a = s.actors[id];
  a.plan = [...plan, { t: 'regroup' }, { t: 'leave' }];
  a.parcelToSend = opts.parcel ?? false;
  if (!a.parcelToSend && a.holding === 'parcel') a.holding = null;
  return a;
}
const basketsAccounted = s => s.interior.baskets.stack + s.interior.baskets.counter + Object.values(s.actors).filter(a => a.basket).length + Object.values(s.actors).reduce((n, a) => n + (a.job?.type === 'baskets' && a.job.phase === 1 ? a.job.n : 0), 0);

test('every product has a fixture, and every place to stand is reachable from the door or the till', () => {
  for (const [p, d] of Object.entries(PRODUCTS)) assert.ok(FIXTURES[d.fixture], `${p} has a fixture`);
  for (const facilities of [{}, { selfCheckout: true, extraTable: true }]) {
    for (const [id, f] of Object.entries(FIXTURES)) {
      if (f.facility && !facilities[f.facility]) continue;
      for (const [x, y] of f.access) {
        const staff = !!f.staff;
        assert.ok(floorCell(x, y, { staff, facilities }), `${id} access ${x},${y} is floor`);
        const from = staff ? center(...SPOTS.pos) : center(...SPOTS.doorIn);
        assert.ok(findPath(from, center(x, y), { staff, facilities }).length, `${id} access ${x},${y} reachable`);
      }
    }
  }
});

test('promotions hand over free units and stickers price units down, with honest totals', () => {
  const s = initialState();
  s.interior.promos.chips = '1+1'; s.interior.promos.soda = '2+1';
  const take = p => s.shelf[p] > 0 && s.shelf[p]--;
  const buyer = { id: 'harin', budget: 9000, selfCentered: 30, meticulous: 50, impulsivity: 100 };
  const chips = pickUnits(s, 'chips', buyer, take, () => 0);
  assert.equal(chips.length, 2); assert.equal(chips.filter(it => it.free).length, 1);
  const soda = pickUnits(s, 'soda', buyer, take, () => 0);
  assert.equal(soda.length, 3); assert.equal(soda.filter(it => it.free).length, 1);
  assert.equal(itemsTotal([...chips, ...soda]), PRODUCTS.chips.price + PRODUCTS.soda.price * 2);
  s.shelf.kimbap = 3; s.interior.stickers.kimbap = 3;
  const kimbap = pickUnits(s, 'kimbap', { ...buyer, budget: 3000 }, take, () => 0);
  assert.equal(kimbap[0].disc, true); assert.equal(unitPrice(kimbap[0]), Math.round(PRODUCTS.kimbap.price * .7 / 100) * 100);
  assert.equal(s.interior.stickers.kimbap, 2);
});

test('a week with every piece of equipment in use keeps stock, money and baskets consistent', () => {
  for (const seed of [20261022, 4242]) {
    const s = initialState(seed);
    assert.equal(setFacility(s, 'selfCheckout', true), true);
    setPromo(s, 'chips', '1+1'); setPromo(s, 'soda', '2+1');
    let lostBaskets = 0;
    advance(s, 1440 * 7, x => { if (basketsAccounted(x) !== BASKETS) lostBaskets++; });
    assert.equal(lostBaskets, 0, 'six baskets, always somewhere');
    for (const [p, v] of Object.entries(stockAudit(s))) assert.equal(v.actual, v.expected, `${seed} ${p}`);
    assert.equal(s.money, balance(s));
    assert.ok(s.ledger.some(t => t.by === 'kiosk'), 'the self checkout was used');
    assert.ok(Object.values(s.counts).reduce((n, c) => n + c.sold, 0) > 300);
    for (const [p, n] of Object.entries(s.interior.stickers)) assert.ok(n <= s.shelf[p]);
    assert.ok(s.interior.bins.general <= 1.3 && s.interior.bins.recycle <= 1.3);
    assert.doesNotThrow(() => parseSave(exportText(s)));
  }
});

test('alcohol is sold only to an adult whose ID the worker checked', () => {
  const run = (id, hasId) => {
    const s = quiet(); s.startBeer = s.shelf.beer;
    visit(s, id, [{ t: 'shop', p: 'beer' }, { t: 'checkout' }], { hasId });
    s.actors[id].budget = 20000;
    advance(s, 60);
    return s;
  };
  const adult = run('doyun', true);
  assert.equal(adult.counts.beer.sold, 1);
  const noId = run('doyun', false), minor = run('minjun', true);
  for (const s of [noId, minor]) {
    assert.equal(s.counts.beer.sold, 0); assert.equal(s.shelf.beer, s.startBeer, 'the can goes back on the shelf');
    assert.ok(s.events.some(e => e.type === 'alcohol_refused'));
    for (const v of Object.values(stockAudit(s))) assert.equal(v.actual, v.expected);
  }
  assert.equal(eligibleForTobacco(minor.people.minjun), false);
});

test('goods behind the till are asked for, and the coffee cup is filled at the machine', () => {
  const s = quiet();
  const a = visit(s, 'sujin', [{ t: 'shop', p: 'americano' }, { t: 'shop', p: 'sandwich' }, { t: 'checkout' }]);
  a.budget = 20000;
  const beans = s.interior.coffee.beans;
  let brewed = false;
  advance(s, 60, x => { if (x.actors.sujin?.cur?.t === 'brew' && x.actors.sujin.phase === 2) brewed = true; });
  assert.equal(s.counts.americano.sold, 1);
  assert.ok(brewed, 'she went to the machine');
  assert.ok(s.interior.coffee.beans < beans);
  assert.ok(s.log.some(l => l.speaker === 'sujin' && l.text.includes('아메리카노')));
});

test('workers empty full bins, put bags out at night, and the truck takes them before dawn', () => {
  const s = quiet();
  s.interior.bins.general = .9; s.interior.bins.recycle = .85;
  assert.ok(until(s, x => x.interior.bins.general < .1, 30), 'the bins were emptied');
  // 21:18 counts as night after 22:00; bags reach the curb or the back room.
  assert.ok(until(s, x => x.interior.curbBags > 0, 60 * 6), 'bags were put out');
  assert.ok(until(s, x => x.interior.curbBags === 0, 60 * 10), 'the garbage truck came');
  assert.ok(s.events.some(e => e.type === 'garbage_pickup'));
});

test('browsing leaves shelves untidy and an idle worker faces them up again', () => {
  const s = quiet();
  s.interior.tidy.snackShelf = .3;
  assert.ok(until(s, x => x.interior.tidy.snackShelf === 1, 30));
  const t = s.interior.tidy.drinkFridge;
  visit(s, 'doyun', [{ t: 'shop', p: 'coffee' }, { t: 'checkout' }]);
  advance(s, 8);
  assert.ok(s.interior.tidy.drinkFridge < t);
});

test('the self checkout sells without a worker; when it stalls a worker comes over', () => {
  const s = quiet();
  s.money += 100000; setFacility(s, 'selfCheckout', true);
  const fam = s.relations.harin?.yuna?.fam ?? 0;
  let tries = 0, stalled = false;
  // Visits until one reaches the kiosk; the first time it does, the machine stalls.
  while (tries++ < 40 && !s.events.some(e => e.type === 'kiosk_help')) {
    if (!s.actors.harin) { visit(s, 'harin', [{ t: 'shop', p: 'chips' }, { t: 'checkout' }]); s.actors.harin.budget = 9000; }
    advance(s, 20, x => { if (!stalled && x.actors.harin?.phase === 21) { x.interior.kiosk.error = true; stalled = true; } });
  }
  assert.ok(s.ledger.some(t => t.by === 'kiosk' && t.worker === null));
  assert.ok(s.events.some(e => e.type === 'kiosk_help'), 'a worker helped at the kiosk');
  const kioskOnly = s.ledger.filter(t => t.kind === 'sale' && t.customer === 'harin').every(t => t.by === 'kiosk');
  if (kioskOnly) assert.ok((s.relations.harin.yuna?.fam ?? 0) - fam <= 3 * s.events.filter(e => e.type === 'kiosk_help').length, 'no familiarity from kiosk sales alone');
  for (const v of Object.values(stockAudit(s))) assert.equal(v.actual, v.expected);
});

test('parcels: a fee for sending, the courier collects at four, and collecting one teaches the worker a name', () => {
  const s = quiet();
  const a = visit(s, 'mansik', [{ t: 'checkout' }], { parcel: true });
  a.budget = 20000;
  advance(s, 40);
  assert.ok(s.ledger.some(t => t.service === PARCEL_FEE));
  assert.equal(s.interior.parcels.filter(p => p.kind === 'send').length, 1);
  assert.ok(until(s, x => x.interior.lastCourierDay === 2, 60 * 20));
  assert.equal(s.interior.parcels.filter(p => p.kind === 'send').length, 0);
  // A parcel waiting for doyun, whom the worker on duty does not know by name yet.
  const w = s.onDuty;
  delete s.names[w].doyun;
  s.interior.parcels.push({ id: 'pc-test', kind: 'arrive', for: 'doyun', day: s.day });
  visit(s, 'doyun', [{ t: 'checkout' }]);
  advance(s, 40);
  assert.ok(!s.interior.parcels.some(p => p.id === 'pc-test'));
  assert.ok(s.events.some(e => e.type === 'parcel_pickup'));
  assert.ok(s.names[w].doyun, 'the worker learned his name when he said it');
});

test('the ATM changes only the customer’s cash, never the store’s money', () => {
  const s = quiet();
  const a = visit(s, 'doyun', [{ t: 'atm' }]);
  const before = a.budget;
  let after = null;
  advance(s, 15, x => { if (x.actors.doyun) after = x.actors.doyun.budget; });
  assert.equal(after, before + 20000);
  assert.equal(s.money, balance(s), 'the till and the ledger agree');
  assert.ok(!s.ledger.some(t => t.kind === 'sale' && t.customer === 'doyun'), 'no sale was recorded for the withdrawal');
});

test('stickers go on goods that expire by morning and come off with the waste check', () => {
  const s = quiet();
  s.clock = 20 * 60 + 1; s.day = 1;
  s.shelf.kimbap = 4; s.back.kimbap = 0; s.batches.kimbap = [{ day: 0, n: 4 }];
  s.counts.kimbap.start = 4 + s.counts.kimbap.delivered - 0;
  assert.equal(expiringOnShelf(s, 'kimbap'), 4);
  assert.ok(until(s, x => (x.interior.stickers.kimbap ?? 0) === 4, 60));
  assert.ok(until(s, x => x.orders.lastDeliveryDay === x.day && x.day === 2, 60 * 12));
  assert.equal(s.interior.stickers.kimbap ?? 0, 0);
});

test('older saves gain the new goods with no stock, and bad equipment data is refused', () => {
  const s = initialState();
  advance(s, 30);
  const old = snapshot(s);
  delete old.interior; delete old.facilities.selfCheckout;
  // These products did not exist in the old save, including in shoppers' baskets.
  for(const a of Object.values(old.actors))a.cart=a.cart.filter(it=>!['beer','bread','americano','hotbar'].includes(it.p));
  for (const p of ['beer', 'bread', 'americano', 'hotbar']) { delete old.counts[p]; delete old.shelf[p]; delete old.back[p]; delete old.orders.par[p]; delete old.batches[p]; }
  const loaded = parseSave(JSON.stringify({ format: 'saebyeok-mart-save', version: 2, state: old }));
  assert.equal(loaded.shelf.beer, 0); assert.equal(loaded.counts.beer.start, 0); assert.ok(loaded.orders.par.beer > 0);
  assert.equal(loaded.interior.baskets.stack + Object.values(loaded.actors).filter(a => a.basket).length, BASKETS); assert.equal(loaded.facilities.selfCheckout, false);
  advance(loaded, 60);
  for (const v of Object.values(stockAudit(loaded))) assert.equal(v.actual, v.expected);
  const bad = f => { const c = JSON.parse(exportText(s)); f(c.state); return JSON.stringify(c); };
  assert.throws(() => parseSave(bad(x => { x.interior.stickers.coffee = 999; })), /스티커/);
  assert.throws(() => parseSave(bad(x => { x.interior.baskets.stack = 99; })), /장바구니/);
  assert.throws(() => parseSave(bad(x => { x.interior.promos.coffee = '3+1'; })), /행사/);
});

test('replays keep compact frames that still show the equipment as it was', () => {
  const s = initialState();
  setPromo(s, 'chips', '1+1');
  advance(s, 80);
  const m = s.moments.find(m => m.frames.length > 2);
  assert.ok(m);
  const f = m.frames.at(-1);
  assert.ok(Array.isArray(f.stock) && f.inside);
  const view = momentView(s, m, m.frames.length - 1);
  assert.equal(view.shelf.coffee, f.stock[Object.keys(PRODUCTS).indexOf('coffee')]);
  assert.equal(view.interior.promos.chips, '1+1');
  assert.ok(JSON.stringify(f).length < 6000);
});
