import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, step, stockAudit, START_MONEY, findPath, floorCell, cleanLine, resolvePending, restockOption, placeOrder, WORKERS } from '../web/js/sim/sim.js';
import { exportText, parseSave, splitParts, joinParts, snapshot } from '../web/js/storage/save.js';
import { lintLine } from '../web/js/dialogue/lint.js';
import { allTemplateSamples } from '../web/js/dialogue/dialogue.js';
import { witnessesAt } from '../web/js/mind/memory.js';
import { cellOf, center, FIXTURES } from '../web/js/sim/world.js';
import { workerAt } from '../web/js/sim/roster.js';
import { makeGenes, buildAppearance, validateAppearance, generatePerson, uniqueLabels } from '../web/js/mind/genes.js';
import { CAST } from '../web/js/sim/data.js';
import { DialogueService, parseResult } from '../web/js/dialogue/ai.js';
// The v0.1 prototype's simulation, kept verbatim so migration is tested against a real old save.
import * as legacy from './fixtures/prototype-v0.1-sim.js';

const advance = (s, minutes, each) => { for (let i = 0; i < minutes * 10; i++) { step(s, .1); each?.(s); } };
const until = (s, pred, maxMinutes, each) => { for (let i = 0; i < maxMinutes * 10; i++) { step(s, .1); each?.(s); if (pred(s)) return true; } return false; };
const canonical = s => JSON.stringify(Object.fromEntries(Object.entries({ ...s, savedAt: 0 }).sort(([a], [b]) => (a < b ? -1 : 1))));

test('opening night: an impatient customer urges, the worker answers briefly, and an umbrella loan stays open', () => {
  const s = initialState();
  assert.ok(until(s, x => x.obligations.some(o => o.type === 'umbrella_loan' && o.debtor === 'doyun'), 90));
  const urge = s.log.findIndex(l => l.speaker === 'doyun' && ['urge', 'urge_one'].includes(l.kind));
  assert.ok(urge >= 0, 'doyun urged in the queue');
  const reply = s.log.slice(urge + 1).find(l => WORKERS.includes(l.speaker) && l.to === 'doyun');
  assert.ok(reply && reply.text.length <= 20, 'the worker replied with a short line');
  assert.ok(s.events.some(e => e.type === 'queue_urge'));
  const loan = s.obligations.find(o => o.type === 'umbrella_loan' && o.debtor === 'doyun');
  assert.equal(loan.status, 'open');
  assert.ok(s.memories.doyun.some(m => m.obligationId === loan.id && !m.resolved), 'borrower remembers an open promise');
  assert.ok(s.memories[loan.lender].some(m => m.obligationId === loan.id && !m.resolved), 'lender remembers it too');
  assert.equal(s.rental.inStand, s.rental.total - s.obligations.filter(o => o.type === 'umbrella_loan' && o.status === 'open').length);
});

test('the borrower comes back with the umbrella; relations update; people who were not there do not learn of it', () => {
  const s = initialState();
  assert.ok(until(s, x => x.obligations.some(o => o.type === 'umbrella_loan' && o.debtor === 'doyun'), 90));
  const loan = s.obligations.find(o => o.type === 'umbrella_loan' && o.debtor === 'doyun');
  let before = null, ret = null, lenderOpenAtReturn = null;
  const ok = until(s, x => {
    if (!before && x.actors.doyun?.flags.returning) before = JSON.parse(JSON.stringify(x.relations));
    ret = x.events.find(e => e.type === 'umbrella_return' && e.data.borrower === 'doyun');
    if (ret && lenderOpenAtReturn === null) lenderOpenAtReturn = x.memories[loan.lender].some(m => m.obligationId === loan.id && !m.resolved);
    return !!ret;
  }, 1440 * 4);
  assert.ok(ok, 'doyun returned the umbrella within four days');
  assert.notEqual(loan.status, 'open');
  assert.equal(loan.resolvedEventId, ret.id);
  assert.ok(s.memories.doyun.filter(m => m.obligationId === loan.id).every(m => m.resolved), 'borrower memory is resolved');
  const receiver = ret.data.receiver;
  assert.ok(s.relations[receiver].doyun.trust > (before?.[receiver]?.doyun?.trust ?? 30), 'the receiving worker trusts doyun more');
  for (const id of Object.keys(s.people)) {
    if (ret.witnesses.includes(id)) continue;
    assert.ok(!s.memories[id].some(m => m.eventId === ret.id), `${id} was absent and has no memory of the return`);
  }
  if (loan.lender !== receiver && !ret.witnesses.includes(loan.lender)) assert.equal(lenderOpenAtReturn, true, 'an absent lender still thinks the umbrella is out');
});

test('handover passes on chosen items only, and customer-facing lines come from the worker on duty', () => {
  const s = initialState();
  let seen = 0, wrongSpeaker = [];
  const handoverKinds = /^(handover_|colleague_)/;
  until(s, x => x.events.filter(e => e.type === 'shift_change').length >= 3, 1440 * 2, x => {
    for (; seen < x.log.length; seen++) {
      const l = x.log[seen];
      if (WORKERS.includes(l.speaker) && !handoverKinds.test(l.kind ?? '') && l.speaker !== x.onDuty) wrongSpeaker.push(`${l.speaker}:${l.text}`);
    }
    if (x.log.length >= 300) seen = Math.min(seen, x.log.length);
  });
  assert.deepEqual(wrongSpeaker, []);
  const loan = s.obligations.find(o => o.type === 'umbrella_loan' && o.debtor === 'doyun');
  assert.ok(loan);
  assert.ok(s.memories.jae.some(m => m.source === 'handover' && m.obligationId === loan.id), 'jae heard about the loan at handover');
  for (const w of WORKERS) for (const m of s.memories[w]) if (m.source === 'handover') assert.ok(WORKERS.includes(m.sourceId) && m.sourceId !== w);
});

test('solo and group visitors shop, pay and leave; money, stock and the ledger reconcile', () => {
  const s = initialState(4242);
  let maxDwell = 0, groupVisits = 0, seenVisits = new Set();
  advance(s, 1440 * 3, x => {
    for (const v of x.visits) if (!seenVisits.has(v.id)) { seenVisits.add(v.id); if (v.members.length > 1) groupVisits++; }
    for (const a of Object.values(x.actors)) if (a.role === 'customer') maxDwell = Math.max(maxDwell, x.clock - a.enteredAt);
  });
  assert.ok(s.stats.visitors > 40);
  assert.ok(groupVisits >= 3, 'several group visits happened');
  assert.ok(maxDwell < 175, 'nobody stays forever');
  for (const [p, v] of Object.entries(stockAudit(s))) assert.equal(v.actual, v.expected, `stock of ${p}`);
  assert.equal(s.money, START_MONEY + s.stats.totals.sale - s.stats.totals.order - (s.stats.totals.expense??0));
  for (const p of Object.keys(s.shelf)) assert.ok(s.shelf[p] >= 0 && s.back[p] >= 0);
});

test('paths avoid fixtures and people never stand inside them or freeze while walking', () => {
  for (const [from, to] of [[[11, 16], [3, 4]], [[0, 16], [21, 7]], [[3, 10], FIXTURES.boxes.access[0]], [[11, 14], [12, 11]], [[23, 17], [16, 9]]]) {
    const path = findPath(center(...from), center(...to));
    assert.ok(path.length, `route ${from}→${to}`);
    assert.ok(path.every(p => floorCell(...cellOf(p), { staff: true })));
  }
  assert.equal(findPath(center(11, 14), center(3, 10)).length, 0, 'customers cannot enter behind the counter');
  const s = initialState(777), frozen = {};
  advance(s, 1440, x => {
    for (const a of Object.values(x.actors)) {
      assert.ok(floorCell(...cellOf(a), { staff: a.role === 'worker', facilities: x.facilities }) || a.y >= 15 * 32, `${a.id} inside a fixture at ${cellOf(a)}`);
      const k = `${Math.round(a.x)},${Math.round(a.y)}`;
      if (a.path.length && frozen[a.id]?.k === k) frozen[a.id].n++; else frozen[a.id] = { k, n: 0 };
      assert.ok(frozen[a.id].n < 50, `${a.id} stuck while walking`);
    }
  });
});

test('memories come only from witnessing, being told, or a handover', () => {
  const s = initialState(777);
  advance(s, 1440 * 3);
  const events = new Map(s.events.map(e => [e.id, e]));
  let checked = 0;
  for (const [id, list] of Object.entries(s.memories)) for (const m of list) {
    if (!m.eventId || !events.has(m.eventId)) continue;
    const e = events.get(m.eventId);
    if (m.source === 'witnessed') { assert.ok(e.witnesses.includes(id), `${id} remembers ${e.type} without being there`); checked++; }
    if (m.source === 'told') assert.ok(m.sourceId && m.sourceId !== id);
    if (m.source === 'handover') assert.ok(WORKERS.includes(id) && WORKERS.includes(m.sourceId));
  }
  assert.ok(checked > 10);
});

test('names are learned only by those who hear them', () => {
  const s = initialState();
  let hearers = null;
  const before = JSON.parse(JSON.stringify(s.names));
  let seenLog = s.log.length;
  // Every line added this tick is checked, not just the last one.
  until(s, x => { const fresh = x.log.slice(Math.min(seenLog, x.log.length)); seenLog = x.log.length; if (fresh.some(l => l.kind === 'name_answer' && l.speaker === 'doyun')) { hearers = witnessesAt(x, x.actors.doyun, ['doyun']); return true; } return false; }, 90);
  assert.ok(hearers, 'doyun said his name');
  for (const id of Object.keys(s.people)) if (s.names[id].doyun && !before[id].doyun) assert.ok(hearers.includes(id), `${id} learned the name without hearing it`);
  assert.ok(s.names.yuna.doyun);
});

test('saving mid-checkout and restoring continues identically without double payment', () => {
  const s = initialState();
  assert.ok(until(s, x => x.checkout && x.conversations.length, 60));
  const fromFile = parseSave(exportText(s)), fromParts = parseSave(joinParts(splitParts(snapshot(s))));
  const txBefore = s.sales.tx;
  advance(s, 1500); advance(fromFile, 1500); advance(fromParts, 1500);
  assert.equal(canonical(fromFile), canonical(s));
  assert.equal(canonical(fromParts), canonical(s));
  const sales = s.ledger.filter(t => t.kind === 'sale').map(t => t.checkout);
  assert.equal(new Set(sales).size, sales.length, 'each checkout is charged once');
  assert.ok(s.sales.tx >= txBefore);
});

test('dialogue stays within length and markup rules', () => {
  for (const t of allTemplateSamples()) assert.deepEqual(lintLine(t.text), [], `${t.kind}/${t.reg}: ${t.text}`);
  const s = initialState(4242);
  advance(s, 1440 * 2);
  for (const l of s.log) { assert.ok(l.text.length <= 60); assert.deepEqual(lintLine(l.text), [], l.text); }
  for (const bad of ['안녕·하세요.', '(웃으며) 네.', '*고개를 끄덕인다*', '인생이란 원래 그런 거죠.', '네. 그래요. 알겠어요.', '가'.repeat(61), '음…… 글쎄…… 모르겠어요.', '그는 조용히 미소 지었다.', '네!!'])
    assert.ok(lintLine(bad).length > 0, bad);
  assert.equal(cleanLine('안녕·하세요. (고개를 끄덕인다)\n*감사해요*'), '안녕하세요.  감사해요');
  assert.ok(lintLine('그 도시락이요?', { recent: ['그 도시락이요?'] }).includes('repeat'));
  assert.ok(lintLine('9,900원입니다.', { numbers: ['4900'] }).includes('unknown_number'));
});

test('promises to restock are only offered when an order can really be placed', () => {
  const s = initialState();
  s.shelf.lunchbox = 0; s.orders.pending = {};
  assert.equal(restockOption(s, 'lunchbox'), 'promise');
  s.money = 1000;
  assert.equal(restockOption(s, 'lunchbox'), 'none');
  assert.equal(placeOrder(s, 'lunchbox', 2), false);
  s.money = 100000; placeOrder(s, 'lunchbox', 2);
  assert.equal(restockOption(s, 'lunchbox'), 'soon');
  s.shelf.lunchbox = 1;
  assert.equal(restockOption(s, 'lunchbox'), 'yes');
});

test('model replies that are late, stale, malformed or missing never stall the game', () => {
  const s = initialState();
  s.aiMode = 'ollama';
  advance(s, 40);
  assert.ok(s.log.some(l => l.source === 'fallback'), 'unanswered lines fall back to rules');
  assert.ok(s.stats.visitors >= 1 || Object.keys(s.actors).length > 2, 'the store kept running');
  assert.ok(s.pending.length <= 12);
  // A valid reply is used; a reply that breaks the rules is replaced; an action not offered is ignored.
  let applied = 0, rejected = 0;
  for (let i = 0; i < 2400 && (applied < 2 || rejected < 2); i++) {
    step(s, .1);
    for (const p of [...s.pending]) {
      if (applied < 2) { assert.equal(resolvePending(s, p, { say: ['네, 알겠어요.', '그럼 그렇게 해요.'][applied], action: 'not-offered' }), 'ai'); applied++; }
      else if (rejected < 2) { const r = resolvePending(s, p, { say: '(웃으며) 감사합니다. 정말요. 진짜로요.', action: 'say' }); assert.ok(['fallback', 'speaker_left'].includes(r)); rejected++; }
    }
  }
  assert.ok(applied >= 2 && rejected >= 2);
  // A reply arriving after its line already moved on is dropped.
  advance(s, 2);
  const p = s.pending[0] ?? { id: 'gone' };
  if (s.pending[0]) { advance(s, 3); assert.equal(resolvePending(s, p, { say: '늦은 대사.', action: 'say' }), 'stale'); }
  assert.ok(!s.log.some(l => l.text === '늦은 대사.'));
  // Lines are never spoken by someone who has left.
  for (const l of s.log) assert.ok(s.people[l.speaker]);
});

test('dialogue service retries once on bad format and times out without blocking', async () => {
  let calls = 0;
  const svc = new DialogueService({ timeoutMs: 200, fetchImpl: async (url, opts) => {
    calls++;
    if (JSON.parse(opts.body).messages.at(-1).content.includes('지연')) await new Promise((r, j) => { const t = setTimeout(r, 1000); opts.signal.addEventListener('abort', () => { clearTimeout(t); j(new Error('aborted')); }); });
    const content = calls === 1 ? '*웃으며* 안녕하세요' : JSON.stringify({ say: '네, 잠시만요.', action: 'say' });
    return { ok: true, json: async () => ({ message: { content } }) };
  } });
  svc.configure({ mode: 'ollama', url: 'http://127.0.0.1:11434', model: 'test' });
  const results = [];
  const req = { request: { actions: ['say'], recent: [] } };
  await new Promise(done => svc.pump([{ id: 'a', dispatched: false, ...req }], (id, r) => { results.push(r); done(); }));
  assert.equal(results[0].say, '네, 잠시만요.');
  assert.equal(svc.stats.retried, 1);
  await new Promise(done => svc.pump([{ id: 'b', dispatched: false, request: { actions: ['say'], recent: [], note: '지연' } }], (id, r) => { results.push(r); done(); }));
  assert.equal(results[1], null);
  assert.throws(() => parseResult('{"say":"그는 미소 지었다.","action":"say"}', { actions: ['say'] }));
});

test('long runs stay bounded', () => {
  const s = initialState(20261022);
  let maxPending = 0, maxConv = 0;
  advance(s, 1440 * 7, x => { maxPending = Math.max(maxPending, x.pending.length); maxConv = Math.max(maxConv, x.conversations.length); });
  assert.ok(s.log.length <= 300);
  assert.ok(s.events.length <= 500);
  assert.ok(s.ledger.length <= 200);
  assert.ok(s.obligations.length < 80);
  assert.ok(maxConv <= 10);
  for (const list of Object.values(s.memories)) assert.ok(list.length <= 40);
  assert.ok(JSON.stringify(s).length < 1_000_000);
});

test('imports are validated and prototype saves migrate', () => {
  assert.throws(() => parseSave('{}'));
  assert.throws(() => parseSave('not json'));
  const s = initialState(); advance(s, 30);
  const tamper = f => { const copy = JSON.parse(exportText(s)); f(copy.state); return JSON.stringify(copy); };
  assert.throws(() => parseSave(tamper(x => { x.shelf.coffee = -3; })), /재고/);
  assert.throws(() => parseSave(tamper(x => { const a = Object.values(x.actors)[0]; a.path = [{ x: 5 * 32 + 16, y: 6 * 32 + 16 }]; })), /벽/);
  assert.throws(() => parseSave(tamper(x => { x.memories.doyun.push({ text: '?', about: ['nobody'], at: 0, importance: .5 }); })));
  assert.throws(() => parseSave(tamper(x => { x.version = 99; })));
  assert.doesNotThrow(() => parseSave(exportText(s)));
  // A real save from the archived prototype, with the umbrella still out.
  const old = legacy.initialState();
  for (let i = 0; i < 900; i++) legacy.step(old, .1);
  assert.equal(old.umbrella, 'doyun');
  const migrated = parseSave(legacy.serialize(old));
  assert.equal(migrated.version, 2);
  assert.equal(migrated.migratedFrom, 1);
  assert.ok(migrated.obligations.some(o => o.type === 'umbrella_loan' && o.debtor === 'doyun' && o.status === 'open'));
  assert.ok(migrated.memories.doyun.some(m => !m.resolved));
  advance(migrated, 120);
});

test('the roster resolves substitutes, lateness and leave', () => {
  const s = initialState();
  assert.equal(workerAt(s.roster, 1440 * 1 + 23 * 60).worker, 'taeo', 'day 2 night: substitute');
  assert.equal(workerAt(s.roster, 1440 * 2 + 8 * 60 + 10).worker, 'taeo', 'day 3: the night worker stays while the morning worker is late');
  assert.equal(workerAt(s.roster, 1440 * 2 + 8 * 60 + 30).worker, 'yuna');
  s.roster.exceptions.push({ id: 't', day: 4, shift: 'pm', type: 'leave' });
  assert.equal(workerAt(s.roster, 1440 * 3 + 16 * 60).worker, workerAt(s.roster, 1440 * 3 + 13 * 60).worker, 'leave without cover extends the previous shift');
});

test('genes are reproducible, parts stay compatible, looks do not decide temperament', () => {
  for (const def of CAST) {
    const a = makeGenes(def), b = makeGenes(def);
    assert.deepEqual(a, b);
    assert.deepEqual(validateAppearance(a.appearance), []);
    assert.equal(a.version, 1);
  }
  const kid = buildAppearance(5, { age: 'child', top: { type: 'coat' }, accessories: ['cane', 'cap'], hair: { style: 'twin' } });
  assert.notEqual(kid.top.type, 'coat');
  assert.ok(kid.fixes.length >= 2);
  assert.deepEqual(validateAppearance(kid), []);
  const people = Array.from({ length: 40 }, (_, i) => generatePerson(1000 + i, 'g' + i));
  for (const d of people) assert.deepEqual(validateAppearance(buildAppearance(d.seed, d.look)), []);
  // Same build, very different kindness: appearance and temperament vary independently.
  const broad = people.filter(d => buildAppearance(d.seed, d.look).build === 'broad').map(d => d.temperament.kindness);
  assert.ok(Math.max(...broad) - Math.min(...broad) > 30);
  const s = initialState();
  const labels = Object.values(s.people).map(p => p.label);
  assert.equal(new Set(labels).size, labels.length, 'visible labels tell people apart');
  assert.deepEqual(uniqueLabels(Object.values(s.people)), Object.fromEntries(Object.values(s.people).map(p => [p.id, p.label])));
});

// ---------- context-aware rule dialogue ----------
import { phrase, CONTEXT } from '../web/js/dialogue/dialogue.js';
import { factsFor, stageOf } from '../web/js/sim/sim.js';

test('the most specific line that fits the moment wins, and blocked or incomplete lines are skipped', () => {
  const r = () => 0;
  assert.equal(phrase('welcome_familiar', { register: 'worker', rand: r, facts: { away: 'long' } }), '오랜만이에요.');
  assert.equal(phrase('welcome_familiar', { register: 'worker', rand: r, facts: { who: 'taeo', away: 'long' } }), '오, 또 오셨네요.', 'naming the speaker is more specific');
  assert.ok(['오셨어요.', '또 오셨네요.'].includes(phrase('welcome_familiar', { register: 'worker', rand: r, facts: {} })), 'plain lines when nothing fits');
  assert.notEqual(phrase('welcome_familiar', { register: 'worker', rand: r, facts: { away: 'long' }, avoid: t => t === '오랜만이에요.' }), '오랜만이에요.');
  assert.equal(phrase('small_worker', { register: 'worker', rand: r, facts: { boughtWish: true } }), null, 'a line missing its slot is not said');
  assert.equal(phrase('small_reply', { register: 'formal', rand: r, facts: { topic: 'commute', who: 'doyun' } }), '아니요, 이제 시작이에요.');
  assert.equal(phrase('small_reply', { register: 'formal', rand: r, facts: {} }), null, 'no reply without a topic');
});

test('workers talk only about visits they saw themselves', () => {
  const s = initialState();
  Object.assign(s.people.doyun, { visits: 3, lastVisitAt: s.clock - 120 });
  s.habits.doyun = { buys: { coffee: 3 }, visits: 3, last: ['coffee'], lastWeather: 'rain' };
  s.habits.yuna = { buys: {}, visits: 0, seen: { doyun: { at: s.clock - 120, weather: 'rain', group: false } } };
  assert.equal(factsFor(s, 'yuna', 'doyun').away, 'today');
  assert.equal(factsFor(s, 'yuna', 'doyun').rainedLast, true);
  assert.equal(factsFor(s, 'jae', 'doyun').away, 'first', 'jae never saw that visit');
  assert.equal(factsFor(s, 'jae', 'doyun').rainedLast, undefined);
  assert.ok(!factsFor(s, 'jae', 'doyun').last, 'jae has not noticed what he usually buys');
  assert.equal(factsFor(s, 'doyun', 'jae').away, 'today', 'a customer knows his own visits');
});

test('over a week regulars become familiar and hear remarks that fit the day, without repeated remarks to the same person', () => {
  const s = initialState();
  const lines = [];
  let seen = null;
  advance(s, 1440 * 7, x => { const l = x.log.at(-1); if (l && l.id !== seen) { seen = l.id; lines.push(l); } });
  const literal = new Set(Object.values(CONTEXT).flat().map(e => e.t).filter(t => !t.includes('{')));
  assert.ok(lines.filter(l => literal.has(l.text)).length >= 60, 'many lines depend on the moment');
  assert.ok(lines.filter(l => l.kind === 'small_worker').length >= 3);
  assert.ok(lines.filter(l => l.kind === 'small_reply').length >= 3);
  let familiar = 0;
  for (const c of Object.values(s.people)) if (c.kind === 'customer') for (const w of WORKERS) if (['regular', 'close'].includes(stageOf(s, w, c.id))) familiar++;
  assert.ok(familiar >= 8, 'several customer and worker pairs got to know each other');
  const watched = new Set(['greet_familiar', 'welcome_familiar', 'small_worker', 'small_reply', 'small_customer', 'friend_food_q', 'friend_food_a', 'coworker_overtime', 'meet_greet', 'habit_guess']);
  const remarks = lines.filter(l => watched.has(l.kind) && l.to && l.text.replace(/[\s.,?!]/g, '').length > 3);
  for (let i = 0; i < remarks.length; i++) for (let j = i + 1; j < remarks.length && remarks[j].at - remarks[i].at < 2880; j++)
    assert.ok(!(remarks[i].speaker === remarks[j].speaker && remarks[i].to === remarks[j].to && remarks[i].text === remarks[j].text), `${remarks[i].speaker} repeated "${remarks[i].text}"`);
  const doyunSays = new Set(lines.filter(l => l.speaker === 'doyun' && ['greet_familiar', 'pay_hand', 'confirm', 'small_reply'].includes(l.kind)).map(l => l.text));
  assert.ok(doyunSays.size >= 4, 'a regular does not open the same way every time');
  for (const l of lines) assert.deepEqual(lintLine(l.text), [], l.text);
});
