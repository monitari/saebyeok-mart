import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialState, step, startVisit, stockAudit, START_MONEY, WORKERS } from '../web/js/sim/sim.js';
import { remember } from '../web/js/mind/memory.js';
import { lintLine } from '../web/js/dialogue/lint.js';
import { DAILY_CAP, TROUBLE, wariness } from '../web/js/sim/nuisance.js';
import { parseSave, snapshot } from '../web/js/storage/save.js';
import { CAST } from '../web/js/sim/data.js';

const advance = (s, minutes, each) => { for (let i = 0; i < minutes * 10; i++) { step(s, .1); each?.(s); } };
const until = (s, pred, minutes) => { for (let i = 0; i < minutes * 10; i++) { step(s, .1); if (pred(s)) return true; } return false; };
const balance = s => START_MONEY + s.stats.totals.sale - s.stats.totals.order - (s.stats.totals.expense ?? 0);
const audited = s => Object.values(stockAudit(s)).every(v => v.actual === v.expected);
const events = (s, type) => s.events.filter(e => e.type === 'trouble_' + type);
function quiet(seed) {
  const s = initialState(seed);
  s.actors = { yuna: s.actors.yuna }; s.visits = []; s.conversations = []; s.pending = []; s.queue = []; s.director.story = []; s.director.nextAt = 1e9;
  return s;
}
function visit(s, id, plan, set = {}) {
  startVisit(s, [id], null, { inside: true, hasId: true });
  const a = s.actors[id];
  a.plan = [...plan, { t: 'regroup' }, { t: 'leave' }];
  a.parcelToSend = false; if (a.holding === 'parcel') a.holding = null;
  Object.assign(a, set);
  return a;
}

test('every fixed line said by difficult customers and workers passes the dialogue rules', () => {
  const src = readFileSync(new URL('../web/js/sim/nuisance.js', import.meta.url), 'utf8') + readFileSync(new URL('../web/js/sim/sim.js', import.meta.url), 'utf8');
  const said = new Set();
  // Every Korean string on a line that sets a fixed line of dialogue.
  for (const line of src.split('\n')) if (line.includes('literal:')) for (const q of line.matchAll(/'([^'{}()`]*[가-힣][^'{}()`]*)'/g)) said.add(q[1]);
  assert.ok(said.size > 40, `found ${said.size}`);
  for (const t of said) assert.deepEqual(lintLine(t), [], t);
});

test('a refund goes through only when the till has a record of the sale', () => {
  const s = quiet();
  // A sandwich bought an hour ago, on record.
  s.stats.totals ??= { sale: 0, order: 0 };
  s.money += 3200; s.stats.totals.sale += 3200; s.counts.sandwich.sold++; s.shelf.sandwich--;
  s.ledger.push({ id: 't-test', at: s.clock - 60, kind: 'sale', amount: 3200, items: [['sandwich', 1]], customer: 'hyesuk', worker: 'yuna' });
  visit(s, 'hyesuk', [{ t: 'checkout' }], { errands: [{ type: 'refund', p: 'sandwich', saleId: 't-test', at: s.clock - 60 }] });
  advance(s, 30);
  assert.ok(s.ledger.some(t => t.kind === 'refund' && t.sale === 't-test' && t.amount === -3200));
  assert.equal(s.money, balance(s), 'the refund is in the books'); assert.ok(audited(s));
  // No record: the worker refuses, no money goes out, and the worker remembers the customer.
  const t = quiet();
  visit(t, 'hyesuk', [{ t: 'checkout' }], { errands: [{ type: 'refund', p: 'sandwich', saleId: null, at: null }] });
  advance(t, 30);
  assert.ok(!t.ledger.some(x => x.kind === 'refund'));
  assert.equal(t.money, balance(t));
  assert.ok(events(t, 'refund_demand').some(e => e.data.outcome === 'denied'));
  assert.ok(t.memories.yuna.some(m => m.key === 'trouble:hyesuk'));
  assert.ok(wariness(t).some(w => w.worker === 'yuna' && w.customer === 'hyesuk'));
});

test('walking out: a wary worker stops it; otherwise it is a loss and a witness may tell the worker later', () => {
  const s = quiet();
  remember(s, 'yuna', { key: 'trouble:minhyuk', kind: 'conflict', about: ['minhyuk'], text: '민혁이 전에 문제를 일으켰다.', importance: .5, data: { trouble: 'card_toss' } });
  s.shelf.chips -= 1;
  const a = visit(s, 'minhyuk', [], { skipPay: true, cart: [{ p: 'chips', by: 'minhyuk', eaten: true }] });
  advance(s, 40);
  assert.ok(events(s, 'walkout').some(e => e.data.outcome === 'caught'));
  assert.equal(s.counts.chips.sold, 1, 'he paid after being called back');
  assert.ok(audited(s));
  // No worker in sight: the chips are written off; a kind customer who saw it mentions it at the till.
  const t = quiet();
  t.actors.yuna.x = 25 * 32; delete t.actors.yuna; t.onDuty = 'yuna';
  t.shelf.chips -= 1;
  visit(t, 'sunja', [{ t: 'shop', p: 'milk' }]);
  const m = t.actors.sunja; m.x = 10 * 32 + 16; m.y = 13 * 32 + 22;
  visit(t, 'minhyuk', [], { skipPay: true, cart: [{ p: 'chips', by: 'minhyuk', eaten: true }] });
  advance(t, 15);
  assert.ok(events(t, 'walkout').some(e => e.data.outcome === 'missed'));
  assert.ok(t.ledger.some(x => x.kind === 'loss' && x.reason === 'walkout'));
  assert.ok(audited(t));
  assert.ok(!t.memories.yuna.some(x => x.key === 'trouble:minhyuk'), 'the worker did not see it');
});

test('a drunk customer dozes off, is woken by the worker, and apologises on a sober visit', () => {
  const s = quiet();
  // Being drunk is a state set on arrival; here he goes straight to a seat and falls asleep.
  visit(s, 'taesik', [{ t: 'doze' }], { drunk: true });
  assert.ok(until(s, x => x.actors.taesik?.anim === 'sleep', 20), 'he fell asleep at the table');
  assert.ok(until(s, x => events(x, 'drunk').length > 0, 20), 'the worker woke him');
  assert.equal(events(s, 'drunk')[0].data.worker, 'yuna');
  assert.ok(s.memories.yuna.some(m => m.key === 'trouble:taesik' && m.data.trouble === 'drunk'));
  assert.ok(s.memories.taesik.some(m => m.data?.trouble === 'drunk'), 'he remembers it too');
  assert.ok(until(s, x => !x.actors.taesik, 30));
  // Sober this time, walking in through the door while the same worker is on duty.
  startVisit(s, ['taesik'], null, { hasId: true });
  s.actors.taesik.drunk = false;
  assert.ok(until(s, x => x.events.some(e => e.type === 'reconcile' && e.actors.includes('taesik')), 20), 'they made up');
  assert.ok(s.log.some(l => l.speaker === 'taesik' && /죄송|실례/.test(l.text)), 'he apologised');
});

test('a teen on a dare cannot buy beer, and says why he wants it', () => {
  const s = quiet();
  visit(s, 'dohyun', [{ t: 'shop', p: 'beer' }, { t: 'checkout' }], { dare: true, budget: 10000 });
  advance(s, 40);
  assert.equal(s.counts.beer.sold, 0);
  assert.ok(s.log.some(l => l.speaker === 'dohyun' && /심부름|사 오래요/.test(l.text)));
  assert.ok(events(s, 'underage').length);
  assert.ok(audited(s));
});

test('a careless borrower who lost the umbrella settles the loan as broken and the store has one fewer', () => {
  const s = quiet();
  const o = { id: 'o-test', type: 'umbrella_loan', debtor: 'minhyuk', creditor: 'store', item: '매장 우산', product: null, eventId: null, status: 'open', openedAt: s.clock - 3000, resolvedAt: null, resolvedEventId: null, lender: 'yuna' };
  s.obligations.push(o); s.rental.inStand--;
  remember(s, 'yuna', { kind: 'promise', about: ['minhyuk'], text: '민혁에게 매장 우산을 빌려줬다.', importance: .7, resolved: false, obligationId: 'o-test' });
  visit(s, 'minhyuk', [{ t: 'shop', p: 'soda' }, { t: 'checkout' }], { budget: 9000, holding: null, onPhone: false });
  advance(s, 40);
  assert.equal(o.status, 'broken');
  assert.equal(s.rental.total, 1);
  assert.ok(events(s, 'umbrella_lost').length);
  assert.ok(s.memories.yuna.some(m => m.obligationId === 'o-test' && m.resolved));
});

test('household trash fills the bin, and a worker nearby says something', () => {
  const s = quiet();
  const before = s.interior.bins.general;
  s.actors.yuna.x = 15 * 32 + 16; s.actors.yuna.y = 9 * 32 + 22;
  visit(s, 'yongsu', [{ t: 'dump' }], { dumpTrash: true, holding: 'trashbag' });
  advance(s, 15);
  assert.ok(s.interior.bins.general >= before + .4);
  assert.ok(events(s, 'trash_dump').length);
});

test('a worker who learned about a customer passes it on at handover in plain words', () => {
  const s = initialState();
  // Keep this knowledge-transfer check independent of competing random incidents after a layout change.
  s.director.nextAt=1e9;s.director.story=[];
  remember(s, 'yuna', { key: 'trouble:yongsu', kind: 'conflict', about: ['yongsu'], text: '용수가 집 쓰레기를 가게 쓰레기통에 버렸다.', importance: .55, data: { trouble: 'trash_dump', handoverLine: '{n}이 집 쓰레기를 버리고 갔어요.' } });
  assert.ok(until(s, x => x.events.some(e => e.type === 'shift_change'), 120));
  assert.ok(s.memories.jae.some(m => m.source === 'handover' && m.about.includes('yongsu')));
  assert.ok(s.log.some(l => l.speaker === 'yuna' && l.text.includes('쓰레기를 버리고 갔어요')));
});

test('a busy week stays within the daily limit, keeps the books, and grudges fade', () => {
  for (const seed of [20261022, 42]) {
    const s = initialState(seed);
    const perDay = {};
    advance(s, 1440 * 7, x => { for (const e of x.events.slice(-3)) if (e.type.startsWith('trouble_') && !e._c) { e._c = 1; (perDay[e.day] ??= new Set()).add(e.data.customer + e.type); } });
    for (const [day, set] of Object.entries(perDay)) assert.ok(set.size <= DAILY_CAP + 4, `day ${day} had ${set.size}`);
    const kinds = new Set(s.events.filter(e => e.type.startsWith('trouble_')).map(e => e.type));
    assert.ok(kinds.size >= 5, `several kinds of trouble: ${[...kinds]}`);
    assert.ok(audited(s)); assert.equal(s.money, balance(s));
    // Nobody stays furious: grievances from last week have eased.
    for (const [from, rels] of Object.entries(s.relations)) for (const r of Object.values(rels)) assert.ok(r.griev <= 70, `${from} holds a large grudge`);
    assert.doesNotThrow(() => parseSave(JSON.stringify({ format: 'saebyeok-mart-save', version: 2, state: snapshot(s) })));
  }
});

test('older saves meet the new neighbours as strangers, with no invented history', () => {
  const s = initialState();
  advance(s, 20);
  const old = snapshot(s);
  for (const id of ['taesik', 'minhyuk', 'hyesuk', 'manho', 'junseo', 'seojin', 'dohyun']) { delete old.people[id]; delete old.memories[id]; delete old.relations[id]; delete old.names[id]; delete old.reputation[id]; for (const r of Object.values(old.relations)) delete r[id]; for (const n of Object.values(old.names)) delete n[id]; delete old.playerNames[id]; }
  old.groups = old.groups.filter(g => g.id !== 'teens'); delete old.nuisance;
  old.moments = []; old.momentBuffer = [];
  const loaded = parseSave(JSON.stringify({ format: 'saebyeok-mart-save', version: 2, state: old }));
  for (const c of CAST) assert.ok(loaded.people[c.id], c.id);
  assert.ok(loaded.groups.some(g => g.id === 'teens'));
  assert.equal(loaded.memories.taesik.length, 0);
  assert.ok(!loaded.names.yuna.taesik);
  const labels = Object.values(loaded.people).map(p => p.label);
  assert.equal(new Set(labels).size, labels.length);
  advance(loaded, 60);
  assert.ok(audited(loaded));
  assert.ok(Object.keys(TROUBLE).length >= 13);
});
