// Difficult customers. Every behaviour comes from temperament or state (drink, phone, habits),
// is rate-limited per person and per day, and leaves events and memories like any other moment.
// Workers who went through one remember the customer and act more firmly next time, and pass it on at handover.
import { PRODUCTS, CAST, GROUPS } from './data.js';
import { TILE } from './world.js';
import { makeGenes, uniqueLabels } from '../mind/genes.js';
import { witnessesAt } from '../mind/memory.js';

export const TROUBLE = {
  card_toss:      { label: '카드를 던짐', cooldown: 2880, importance: .4 },
  phone_checkout: { label: '계산 중 통화', cooldown: 1440, importance: .3 },
  refund_demand:  { label: '환불 요구', cooldown: 4320, importance: .55 },
  opened_package: { label: '뜯어 놓은 상품', cooldown: 2880, importance: .4 },
  eat_before_pay: { label: '계산 전에 먹음', cooldown: 2880, importance: .3 },
  walkout:        { label: '계산 없이 나감', cooldown: 4320, importance: .6 },
  drunk:          { label: '취한 손님', cooldown: 1440, importance: .55 },
  seat_hog:       { label: '자리를 오래 차지함', cooldown: 2880, importance: .35 },
  trash_dump:     { label: '집 쓰레기를 버림', cooldown: 4320, importance: .45 },
  underage:       { label: '미성년자 주류 구매 시도', cooldown: 4320, importance: .5 },
  umbrella_lost:  { label: '빌린 우산을 잃어버림', cooldown: 7200, importance: .55 },
  noisy:          { label: '시끄러운 일행', cooldown: 1440, importance: .3 },
  lecture:        { label: '알바생 훈계', cooldown: 2880, importance: .3 }
};
export const DAILY_CAP = 5;
export const NUISANCE_PRODUCTS = ['hangover'];

export function createNuisance() { return { day: 0, count: 0, last: {}, litter: [], nextLitter: 1, cardUntil: 0, charging: null }; }

// One gate for every behaviour: per-person cooldown, a daily cap for the store, then chance.
export function allow(s, who, type, chance, k) {
  const n = s.nuisance;
  if (n.day !== s.day) { n.day = s.day; n.count = 0; }
  // Being drunk is a state, not an incident; it does not use up the day's quota.
  if ((type !== 'drunk' && n.count >= DAILY_CAP) || chance <= 0) return false;
  if (s.clock - (n.last[who]?.[type] ?? -1e9) < TROUBLE[type].cooldown) return false;
  if (k.rand(s) >= chance) return false;
  (n.last[who] ??= {})[type] = Math.round(s.clock);
  if (type !== 'drunk') n.count++;
  return true;
}
const pickLine = (s, k, list) => list[Math.floor(k.rand(s) * list.length)];
const T = (k, s, id) => k.P(s, id).genes.temperament;
// A worker who has dealt with this customer recently is wary of them.
export const wary = (s, w, c) => (s.memories[w] ?? []).some(m => m.key === `trouble:${c}` && s.clock - m.at < 1440 * 10);
const firm = (s, k, w, c) => wary(s, w, c) || k.P(s, w).genes.expression.directness >= 65 || T(k, s, w).conflictAvoid < 45;

// The confirmed record: an event, then each person's own memory of it.
const TEXT = {
  card_toss: { c: '계산대에 카드를 던지듯 내밀었다.', w: '{c}이(가) 카드를 계산대에 던졌다.', o: '{c}이(가) 알바생에게 카드를 던지듯 냈다.' },
  phone_checkout: { c: '통화하면서 계산했다.', w: '{c}이(가) 계산하는 내내 통화만 했다.', o: '{c}이(가) 계산대에서 통화하느라 줄이 늦어졌다.' },
  refund_demand: { c: { refunded: '산 물건을 환불받았다.', denied: '환불을 해 달라고 했지만 거절당했다.' }, w: { refunded: '{c}에게 기록을 확인하고 환불해 줬다.', denied: '{c}이(가) 구매 기록도 없이 환불을 요구했다.' }, o: { refunded: '{c}이(가) 물건을 환불받았다.', denied: '{c}이(가) 계산대에서 환불 문제로 따졌다.' } },
  opened_package: { c: { caught: '맛만 보려고 뜯었다가 결국 계산했다.', missed: '상품을 뜯어 보고 그냥 두고 왔다.' }, w: { caught: '{c}이(가) 상품을 뜯어 놓아서 계산하게 했다.', missed: '누가 상품을 뜯어 놓고 갔다.' }, o: { caught: '{c}이(가) 진열된 상품을 뜯었다.', missed: '{c}이(가) 상품을 뜯어 보고 그냥 두는 걸 봤다.' } },
  eat_before_pay: { c: '배가 고파서 계산하기 전에 먹기 시작했다.', o: '{c}이(가) 계산도 안 하고 먹으면서 돌아다녔다.' },
  walkout: { c: { caught: '계산을 안 하고 나가다가 불려서 계산했다.', missed: '계산을 안 하고 그냥 나왔다.' }, w: { caught: '{c}이(가) 먹은 걸 계산 안 하고 나가려 했다.', missed: '{c}이(가) 계산하지 않고 나갔다고 들었다.' }, o: { caught: '{c}이(가) 계산 안 하고 나가다 불려 왔다.', missed: '{c}이(가) 계산 안 하고 나가는 걸 봤다.' } },
  drunk: { c: '술에 취해 편의점에서 잠이 들었다.', w: '{c}이(가) 취해서 취식대에서 잠들었다. 깨워서 보냈다.', o: '취한 손님이 취식대에서 잠들었다.' },
  seat_hog: { c: '취식대에 오래 앉아 있다가 비켜 달라는 말을 들었다.', w: '{c}이(가) 산 것도 별로 없이 자리를 오래 차지했다.', o: '{c}이(가) 취식대 자리를 오래 차지했다.' },
  trash_dump: { c: '집 쓰레기를 가게 쓰레기통에 버렸다.', w: '{c}이(가) 집 쓰레기를 가게 쓰레기통에 버렸다.', o: '{c}이(가) 집에서 가져온 쓰레기를 버렸다.' },
  underage: { c: '맥주를 사려다 신분증이 없어서 못 샀다.', w: '{c}이(가) 미성년자인데 맥주를 사려 했다.', o: '중학생이 맥주를 사려다 거절당했다.' },
  umbrella_lost: { c: '빌린 우산을 잃어버렸다고 말했다.', w: '{c}이(가) 빌려 간 매장 우산을 잃어버렸다고 했다.', o: '{c}이(가) 가게 우산을 잃어버렸다고 했다.' },
  noisy: { c: '친구들이랑 편의점에서 떠들었다.', w: '{c}네 일행이 매장에서 시끄럽게 떠들었다.', o: '학생들이 매장에서 시끄럽게 떠들었다.' },
  lecture: { c: '젊은 알바생에게 한마디 해 줬다.', w: '{c}에게 일하는 태도로 한소리를 들었다.', o: '{c}이(가) 알바생에게 훈계를 했다.' }
};
const fillText = (t, outcome, name) => (typeof t === 'object' ? t[outcome] ?? Object.values(t)[0] : t).replace('{c}', name);
// The worker's lines for handing this over at the next shift change.
const HANDOVER = {
  card_toss: '{n}이 카드를 던지더라고요.', phone_checkout: '{n}은 계산할 때도 통화만 해요.', refund_demand: '{n}이 영수증 없이 환불해 달라고 했어요.',
  opened_package: '{n}이 상품을 뜯어 놓았어요.', walkout: '{n}이 계산 안 하고 나가려 했어요.', drunk: '{n}이 취해서 취식대에서 잠들었었어요.',
  seat_hog: '{n}이 자리를 오래 차지해요.', trash_dump: '{n}이 집 쓰레기를 버리고 갔어요.', underage: '{n}이 맥주를 사려고 했어요.',
  umbrella_lost: '{n}이 매장 우산을 잃어버렸대요.', noisy: '{n}네 일행이 좀 시끄러웠어요.', lecture: '{n}께 한소리 들었어요.'
};
export function recordTrouble(s, type, { customer, worker = null, outcome = null, product = null, place = null }, k) {
  const spec = TROUBLE[type], tx = TEXT[type];
  const e = k.addEvent(s, `trouble_${type}`, { actors: [customer, worker].filter(id => id && s.actors[id]), importance: outcome === 'refunded' ? .3 : spec.importance, place: place ?? s.actors[customer] ?? null, data: { customer, worker, outcome, product, trouble: type } });
  for (const v of e.witnesses) {
    const p = k.P(s, v);
    if (!p) continue;
    const cname = k.nameFor(s, v, customer);
    if (v === customer) { k.remember(s, v, { eventId: e.id, about: worker ? [worker] : [], text: fillText(tx.c, outcome, cname), importance: spec.importance * .8, tone: outcome === 'denied' ? 'annoyed' : 'neutral', data: { trouble: type } }); continue; }
    if (p.kind === 'worker' && tx.w && outcome !== 'refunded') {
      // One running impression per customer. It is handed over like other conflicts.
      const line = HANDOVER[type];
      k.remember(s, v, { eventId: e.id, key: `trouble:${customer}`, kind: 'conflict', about: [customer], text: fillText(tx.w, outcome, cname), importance: spec.importance, tone: 'tired', data: { trouble: type, handoverLine: line } });
      p.status.mood = Math.max(0, p.status.mood - 8);
      k.adjust(s, v, customer, { griev: Math.round(spec.importance * 18), trust: -Math.round(spec.importance * 10) });
      continue;
    }
    if (tx.o && p.kind === 'customer') {
      // Bystanders: the more particular they are, the more it bothers them. Kind ones feel for the worker.
      const t = p.genes.temperament;
      if (t.meticulous + t.suspicion < 90 && t.kindness < 70) continue;
      k.remember(s, v, { eventId: e.id, about: [customer], text: fillText(tx.o, outcome, cname), importance: spec.importance * .6, tone: t.kindness >= 70 ? 'sympathetic' : 'annoyed', share: type === 'walkout' && outcome === 'missed' ? 'walkout' : undefined, data: { trouble: type, culprit: customer } });
      p.status.mood = Math.max(0, p.status.mood - 3);
      k.adjust(s, v, customer, { griev: 3, trust: -3 });
      if (worker && t.kindness >= 70) k.adjust(s, v, worker, { trust: 2 });
      s.reputation[v] = Math.max(0, (s.reputation[v] ?? 50) - 1);
    }
  }
  return e;
}

// ---------- arrival ----------
// Decides tonight's state and errands for a customer who just appeared.
export function onSpawn(s, a, k) {
  const p = k.P(s, a.id), t = p.genes.temperament, life = p.genes.life, age = p.genes.appearance.age, m = ((Math.floor(s.clock) % 1440) + 1440) % 1440;
  if (age === 'child') return;
  if (life.drinker && (m >= 22 * 60 || m < 3 * 60) && allow(s, a.id, 'drunk', .6, k)) a.drunk = true;
  if ((life.phoneHeavy || (t.sociability >= 60 && t.selfCentered >= 70)) && k.rand(s) < (life.phoneHeavy ? .45 : .15)) a.onPhone = true;
  // A refund errand needs a real purchase in the last three days; whether it is honoured is decided at the till.
  if ((life.refunder || (t.selfCentered >= 80 && t.suspicion >= 70)) && age !== 'teen') {
    const sale = [...s.ledger].reverse().find(x => x.kind === 'sale' && x.customer === a.id && x.items?.length && s.clock - x.at < 4320);
    const product = sale ? sale.items[0][0] : life.favorites?.find(f => PRODUCTS[f] && !PRODUCTS[f].counter);
    if (product && allow(s, a.id, 'refund_demand', life.refunder ? .3 : .08, k)) (a.errands ??= []).push({ type: 'refund', p: product, saleId: sale?.id ?? null, at: sale?.at ?? null });
  }
  if (t.kindness < 45 && t.meticulous < 50 && t.selfCentered >= 60 && age === 'adult' && allow(s, a.id, 'trash_dump', .12, k)) { a.dumpTrash = true; a.holding = a.holding ?? 'trashbag'; }
}
// Changes to the shopping plan: what a drunk wants, a teen's dare, the trash bag first.
export function adjustPlan(s, a, plan, k) {
  const p = k.P(s, a.id), t = p.genes.temperament;
  if (a.drunk) { for (const x of ['hangover', 'water']) if (!plan.some(st => st.p === x)) plan.splice(1, 0, { t: 'shop', p: x }); }
  if (p.genes.appearance.age === 'teen' && t.impulsivity >= 70 && allow(s, a.id, 'underage', .2, k)) { plan.splice(1, 0, { t: 'shop', p: 'beer' }); a.dare = true; }
  if (a.dumpTrash) plan.splice(1, 0, { t: 'dump' });
}
// Umbrella borrowers who are careless or self-centred may not bring it back.
export function keepsUmbrella(s, a, k) {
  const t = T(k, s, a.id);
  if (t.meticulous >= 35 && t.selfCentered < 70) return true;
  return k.rand(s) < .5;
}

// ---------- on the shop floor ----------
// Called after a unit was taken from the shelf into the cart.
export function onPick(s, a, p, k) {
  const pp = k.P(s, a.id), t = pp.genes.temperament, age = pp.genes.appearance.age, d = PRODUCTS[p];
  const snack = ['chips', 'choco', 'candy', 'bread', 'castella', 'gum'].includes(p);
  // Opening a pack to taste it.
  if (snack && t.impulsivity >= 70 && t.meticulous < 40 && (age === 'teen' || t.selfCentered >= 70) && allow(s, a.id, 'opened_package', .2, k)) {
    const w = s.onDuty, sees = w && s.actors[w] && (witnessesAt(s, a, [a.id]).includes(w) || wary(s, w, a.id));
    const it = a.cart.findLast(x => x.p === p && !x.free);
    if (sees && it) {
      it.opened = true;
      k.startConversation(s, 'trouble_opened', [
        { sp: w, to: a.id, k: 'trouble', literal: '뜯은 건 계산해 주셔야 해요.', noAi: true, delay: .2 },
        { sp: a.id, to: w, k: 'trouble', literal: age === 'teen' ? pickLine(s, k, ['맛만 본 건데요.', '아, 네. 살게요.']) : '아, 네. 살게요.', noAi: true }
      ], { members: [w, a.id] });
      recordTrouble(s, 'opened_package', { customer: a.id, worker: w, outcome: 'caught', product: p }, k);
    } else if (it) {
      // The opened pack stays behind as a loss; the worker only finds a torn wrapper later.
      a.cart.splice(a.cart.indexOf(it), 1);
      k.writeOff(s, p, 'opened');
      addLitter(s, a, 'wrapper');
      recordTrouble(s, 'opened_package', { customer: a.id, worker: null, outcome: 'missed', product: p }, k);
    }
    return;
  }
  // Eating before paying, and for a few, walking out with it.
  if ((d.eat || snack) && !d.heat && pp.status.hunger > 65 && t.meticulous < 45 && allow(s, a.id, 'eat_before_pay', .3, k)) {
    const it = a.cart.findLast(x => x.p === p);
    if (!it) return;
    it.eaten = true; a.munching = true;
    recordTrouble(s, 'eat_before_pay', { customer: a.id, product: p }, k);
    if (t.selfCentered >= 75 && t.kindness < 45 && allow(s, a.id, 'walkout', .5, k)) {
      a.skipPay = true;
      a.plan = a.plan.filter(st => st.t !== 'checkout');
    }
  }
  if (a.drunk && k.rand(s) < .25) addLitter(s, a, 'can');
}
function addLitter(s, a, kind) {
  const n = s.nuisance;
  if (n.litter.length >= 8) return;
  n.litter.push({ id: 'lt' + n.nextLitter++, cell: [Math.floor(a.x / TILE), Math.floor(a.y / TILE)], kind });
}

// ---------- the till ----------
// Adds lines to a checkout conversation. `say(sp, k, extra)` appends with the right listener.
export function checkoutTrouble(s, a, co, say, lines, k) {
  const w = co.worker, p = k.P(s, a.id), t = p.genes.temperament, age = p.genes.appearance.age, wp = k.P(s, w);
  const isFirm = firm(s, k, w, a.id);
  // Asking for money back. The POS record decides; words cannot.
  const refund = (a.errands ?? []).find(e => e.type === 'refund');
  if (refund) {
    a.errands = a.errands.filter(e => e !== refund);
    say(a.id, 'trouble', { literal: pickLine(s, k, p.genes.expression.politeness === 'elder' ? ['이거 어제 샀는데 맛이 이상해요.', '이거 환불 좀 해 줘요.'] : ['이거 환불해 주세요.', '이거 산 건데 이상해요.']), noAi: true, delay: .3 });
    say(w, 'trouble', { literal: '구매 기록 확인해 볼게요.', noAi: true, effect: ['reach', w], must: true });
    const legit = refund.saleId && s.ledger.some(x => x.id === refund.saleId) && s.clock - refund.at <= 1440;
    if (legit) {
      say(w, 'trouble', { literal: '확인됐어요. 환불해 드릴게요.', noAi: true, effect: ['refund', a.id, w, refund.p, refund.saleId], must: true });
      say(a.id, 'confirm');
    } else {
      say(w, 'trouble', { literal: isFirm ? '기록이 없어서 환불은 어려워요.' : '죄송해요. 영수증이 있어야 해요.', noAi: true });
      if (t.patience < 50 || t.selfCentered >= 80) {
        say(a.id, 'trouble', { literal: pickLine(s, k, ['여기서 산 거라니까요.', '내가 거짓말하는 거예요?']), noAi: true });
        say(w, 'trouble', { literal: '기록이 안 나와서요. 죄송해요.', noAi: true });
        say(a.id, 'trouble', { literal: '알았어요, 됐어요.', noAi: true, effect: ['troubleDone', 'refund_demand', a.id, w, 'denied', refund.p], must: true });
      } else say(a.id, 'trouble', { literal: '그래요? 알았어요.', noAi: true, effect: ['troubleDone', 'refund_demand', a.id, w, 'denied', refund.p], must: true });
    }
  }
  // A borrowed umbrella that did not come back, raised only by a worker who knows about it.
  const loan = s.obligations.find(o => o.type === 'umbrella_loan' && o.status === 'open' && o.debtor === a.id);
  if (loan && a.holding !== 'rental' && s.clock - loan.openedAt > 1440 && (s.memories[w] ?? []).some(m => m.obligationId === loan.id && !m.resolved) && !a.flags.askedUmbrella) {
    a.flags.askedUmbrella = true;
    say(w, 'trouble', { literal: '지난번에 빌려 가신 우산은요?', noAi: true, delay: .3 });
    if (t.selfCentered >= 70 && t.kindness < 45) {
      say(a.id, 'trouble', { literal: '그거 잃어버렸는데요.', noAi: true });
      say(w, 'trouble', { literal: '아, 그러셨어요.', noAi: true, effect: ['umbrellaLost', a.id, w, loan.id], must: true });
    } else {
      say(a.id, 'trouble', { literal: '아, 깜빡했어요. 다음엔 꼭 가져올게요.', noAi: true, effect: ['umbrellaForgot', a.id, w], must: true });
    }
  }
  // An older customer lecturing a young worker.
  if (age === 'elder' && t.selfCentered >= 65 && t.suspicion >= 55 && (wp.genes.life.ageYears ?? 40) < 30 && allow(s, a.id, 'lecture', .35, k)) {
    say(a.id, 'trouble', { literal: pickLine(s, k, ['젊은 사람이 인사를 크게 해야지.', '요즘 젊은 사람들은 표정이 없어.']), noAi: true, delay: .3 });
    say(w, 'trouble', { literal: pickLine(s, k, ['네, 신경 쓸게요.', '네.']), noAi: true, effect: ['troubleDone', 'lecture', a.id, w, null, null], must: true });
  }
  // Talking on the phone the whole time: the worker's questions go unanswered and the till slows down.
  if (a.onPhone && allow(s, a.id, 'phone_checkout', .8, k)) {
    co.scanEnd += 1.5;
    say(a.id, 'trouble', { literal: pickLine(s, k, ['어, 나 편의점.', '응응, 금방 가.', '잠깐만, 계산 좀 하고.']), noAi: true, to: null, delay: .2 });
    say(w, 'trouble', { literal: '봉투 필요하세요?', noAi: true });
    say(w, 'trouble', { literal: '손님, 봉투요?', noAi: true, delay: 1.2 });
    say(a.id, 'trouble', { literal: '아니 그게 아니라.', noAi: true, to: null, effect: ['troubleDone', 'phone_checkout', a.id, w, null, null], must: true });
  }
  // Tossing the card onto the counter.
  if ((t.selfCentered >= 70 && t.kindness < 45 || a.drunk) && allow(s, a.id, 'card_toss', a.drunk ? .5 : .3, k)) {
    say(a.id, 'trouble', { literal: pickLine(s, k, ['여기.', '카드.']), noAi: true, effect: ['cardToss'], must: true });
    if (isFirm) {
      say(w, 'trouble', { literal: '카드는 손으로 주시면 좋겠어요.', noAi: true });
      say(a.id, 'trouble', { literal: t.conflictAvoid >= 50 ? '아, 네.' : pickLine(s, k, ['아 빨리 좀 해 줘요.', '그게 뭐 어때서요.']), noAi: true, effect: ['troubleDone', 'card_toss', a.id, w, 'told', null], must: true });
    } else say(w, 'trouble', { literal: '네, 잠시만요.', noAi: true, effect: ['troubleDone', 'card_toss', a.id, w, 'quiet', null], must: true });
  }
  if (a.drunk) { co.scanEnd += 1; say(a.id, 'trouble', { literal: pickLine(s, k, ['어 잠깐만, 카드가 어디 갔지.', '계산이요, 계산.']), noAi: true }); }
  // A customer who saw someone walk out may tell the worker; the worker then knows second-hand.
  const seen = (s.memories[a.id] ?? []).find(m => m.share === 'walkout' && !m.toldWorker && s.clock - m.at < 720);
  if (seen && t.kindness >= 60 && !(s.memories[w] ?? []).some(m => m.key === `trouble:${seen.data.culprit}`)) {
    seen.toldWorker = true;
    say(a.id, 'trouble', { literal: '아까 그분 계산 안 하고 나갔어요.', noAi: true });
    say(w, 'trouble', { literal: '아, 알려 주셔서 감사해요.', noAi: true, effect: ['toldWalkout', a.id, w, seen.data.culprit], must: true });
  }
  // Wanting to charge a phone at the till, by someone who will sit for a while.
  if (a.onPhone && t.selfCentered >= 70 && allow(s, a.id, 'seat_hog', .5, k)) {
    a.hog = true;
    say(a.id, 'trouble', { literal: '여기 충전 좀 할 수 있어요?', noAi: true });
    say(w, 'trouble', { literal: isFirm ? '충전은 안 돼요.' : '잠깐은 괜찮아요.', noAi: true, effect: isFirm ? null : ['charge', a.id], must: !isFirm });
  }
}
// Extra lines before an alcohol refusal for a teen on a dare.
export function underageLines(s, a, say, w, k) {
  if (!a.dare) return;
  say(a.id, 'trouble', { literal: pickLine(s, k, ['형 심부름이에요.', '엄마가 사 오래요.']), noAi: true });
  say(w, 'trouble', { literal: '본인 신분증이 있어야 해요.', noAi: true, effect: ['troubleDone', 'underage', a.id, w, null, 'beer'], must: true });
}

// ---------- leaving without paying ----------
// Returns true if the customer was stopped and must go back to the till.
export function onLeaving(s, a, k) {
  if (!a.skipPay || !a.cart.length || a.flags.walkChecked) return false;
  a.flags.walkChecked = true;
  const w = s.onDuty, wa = s.actors[w];
  const chance = wa ? .4 + T(k, s, w).meticulous / 250 + (wary(s, w, a.id) ? .3 : 0) - (s.checkout ? .25 : 0) : 0;
  if (wa && k.rand(s) < chance) {
    const honest = T(k, s, a.id).kindness >= 30 && k.rand(s) < .6;
    k.startConversation(s, 'trouble_walkout', [
      { sp: w, to: a.id, k: 'trouble', literal: '손님, 그거 계산 안 하셨어요.', noAi: true, delay: .1 },
      ...(honest ? [{ sp: a.id, to: w, k: 'trouble', literal: '아, 깜빡했네요.', noAi: true }]
        : [{ sp: a.id, to: w, k: 'trouble', literal: '다 먹은 건데요.', noAi: true }, { sp: w, to: a.id, k: 'trouble', literal: '그래도 계산은 해 주셔야 해요.', noAi: true }, { sp: a.id, to: w, k: 'trouble', literal: '알았어요.', noAi: true }])
    ], { members: [w, a.id] });
    recordTrouble(s, 'walkout', { customer: a.id, worker: w, outcome: 'caught' }, k);
    a.skipPay = false;
    a.plan.unshift({ t: 'checkout' }, { t: 'leave' });
    return true;
  }
  // Nobody noticed: the goods are a loss, seen only by any customers nearby.
  for (const it of a.cart.splice(0)) k.writeOff(s, it.p, 'walkout');
  a.munching = false;
  recordTrouble(s, 'walkout', { customer: a.id, worker: null, outcome: 'missed' }, k);
  return false;
}

// ---------- worker chores caused by customers ----------
export function chooseTroubleJob(s, w, k) {
  const sleeper = Object.values(s.actors).find(a => a.anim === 'sleep' && s.elapsed - (a.sleptAt ?? s.elapsed) > 4);
  if (sleeper) return { type: 'wake', id: sleeper.id, phase: 0 };
  const hog = Object.values(s.actors).find(a => a.hogging && s.elapsed - a.hogSince > 18 && (s.nuisance.seatWanted > s.elapsed - 10 || firm(s, k, w.id, a.id)));
  if (hog) return { type: 'askSeat', id: hog.id, phase: 0 };
  if (s.nuisance.litter.length) return { type: 'litter', id: s.nuisance.litter[0].id, phase: 0 };
  return null;
}
export const TROUBLE_JOBS = {
  wake(s, w, job, k) {
    const a = s.actors[job.id];
    if (!a || a.anim !== 'sleep') { w.job = null; return; }
    if (job.phase === 0) { k.goTo(s, w, standNear(a)); job.phase = 1; w.state = '잠든 손님을 깨우러 가는 중'; }
    if (job.phase === 1 && k.arrived(w)) {
      job.phase = 2; job.busy = true;
      const kind = T(k, s, w.id).kindness >= 70;
      k.startConversation(s, 'trouble_drunk', [
        { sp: w.id, to: a.id, k: 'trouble', literal: pickLine(s, k, ['손님, 여기서 주무시면 안 돼요.', '손님, 일어나셔야 해요.']), noAi: true, delay: .1 },
        ...(kind ? [{ sp: w.id, to: a.id, k: 'trouble', literal: '물 한 잔 드릴까요?', noAi: true }] : []),
        { sp: a.id, to: w.id, k: 'trouble', literal: pickLine(s, k, ['어어, 갈게요 갈게요.', '아, 내가 잠들었네.']), noAi: true, effect: ['wakeUp', a.id, w.id], must: true }
      ], { members: [w.id, a.id] });
    }
    if (job.phase === 2 && a.anim !== 'sleep') w.job = null;
  },
  askSeat(s, w, job, k) {
    const a = s.actors[job.id];
    if (!a || !a.hogging) { w.job = null; return; }
    if (job.phase === 0) { k.goTo(s, w, standNear(a)); job.phase = 1; w.state = '자리를 비켜 달라고 말하러 가는 중'; }
    if (job.phase === 1 && k.arrived(w)) {
      job.phase = 2; job.busy = true;
      k.startConversation(s, 'trouble_seat', [
        { sp: w.id, to: a.id, k: 'trouble', literal: '다른 손님도 앉으셔야 해서요.', noAi: true, delay: .1 },
        { sp: a.id, to: w.id, k: 'trouble', literal: T(k, s, a.id).conflictAvoid >= 40 ? '아, 네.' : '좀만 더 있다 갈게요.', noAi: true, effect: ['stopHog', a.id, w.id], must: true }
      ], { members: [w.id, a.id] });
    }
    if (job.phase === 2 && !a.hogging) w.job = null;
  },
  litter(s, w, job, k) {
    const n = s.nuisance, l = n.litter.find(x => x.id === job.id);
    if (!l) { w.job = null; return; }
    if (job.phase === 0) { k.goTo(s, w, k.nearestStand(s, l.cell)); job.phase = 1; w.state = '바닥에 떨어진 걸 치우는 중'; }
    if (job.phase === 1 && k.arrived(w)) { w.anim = 'clean'; job.phase = 2; job.t = .6; job.busy = true; }
    if (job.phase === 2) {
      job.t -= k.SIM_DT;
      if (job.t > 0) return;
      n.litter = n.litter.filter(x => x !== l); s.interior.bins.general = Math.min(1.3, s.interior.bins.general + .02);
      // Finding a torn wrapper tells the worker something happened, not who did it.
      if (l.kind === 'wrapper') k.remember(s, w.id, { key: 'trouble:unknown', kind: 'fact', text: '누가 상품을 뜯어 놓고 갔다. 누군지는 모른다.', importance: .3 });
      w.anim = 'idle'; w.job = null;
    }
  }
};
const standNear = a => { const c = [Math.floor(a.x / TILE), Math.floor(a.y / TILE)]; return [c[0], c[1] - 1 >= 4 ? c[1] - 1 : c[1] + 1]; };

// Noisy groups: a few loud lines among friends; a worker may ask them to keep it down.
export function noisyGroup(s, v, here, k) {
  if (here.length < 2 || !here.every(id => k.P(s, id).genes.appearance.age === 'teen') || v.flags.quieted) return null;
  if (!allow(s, here[0], 'noisy', .35, k)) return null;
  const [a, b] = here, w = s.onDuty;
  const lines = [
    { sp: a, to: b, k: 'trouble', literal: pickLine(s, k, ['야 이거 봐, 진짜 웃기다.', '야, 너 이거 먹어 봤냐?']), noAi: true },
    { sp: b, to: a, k: 'trouble', literal: pickLine(s, k, ['아 진짜 대박.', '헐, 미쳤다.']), noAi: true, effect: ['troubleDone', 'noisy', a, w, null, null], must: true }
  ];
  if (s.actors[w] && (k.P(s, w).genes.expression.directness >= 60 || T(k, s, w).conflictAvoid < 50 || wary(s, w, a))) {
    lines.push({ sp: w, to: a, k: 'trouble', literal: '조금만 조용히 해 줄래요?', noAi: true, delay: 1.2 });
    lines.push({ sp: a, to: w, k: 'trouble', literal: pickLine(s, k, ['네에.', '죄송해요.']), noAi: true, effect: ['quieted', v.id], must: true });
  }
  return lines;
}

// ---------- save support ----------
// Older saves meet the newer neighbours as strangers: no invented history, only names within their own group.
export function migrateNuisance(s) {
  s.nuisance ??= createNuisance();
  for (const [key, v] of Object.entries(createNuisance())) s.nuisance[key] ??= v;
  if (!s.people) return;
  let added = false;
  for (const def of CAST) {
    if (s.people[def.id]) continue;
    s.people[def.id] = { id: def.id, name: def.name, kind: def.kind, generated: false, genes: makeGenes(def), skills: def.skills ? { ...def.skills } : null, status: { fatigue: 20, hunger: 30, hurry: 20, mood: 60, action: '집에 있음' }, visits: 0, lastVisitAt: -99999, groups: [], introducedDay: s.day };
    s.memories[def.id] ??= []; s.relations[def.id] ??= {}; s.names[def.id] ??= {}; s.reputation[def.id] ??= 50;
    added = true;
  }
  s.groups ??= [];
  for (const g of GROUPS) {
    if (s.groups.some(x => x.id === g.id) || !g.members.every(id => s.people[id])) continue;
    s.groups.push(structuredClone(g));
    for (const a of g.members) {
      if (!s.people[a].groups.includes(g.id)) s.people[a].groups.push(g.id);
      for (const b of g.members) if (a !== b) { s.names[a][b] = true; s.relations[a][b] ??= { fam: 60, trust: 55, grat: 0, griev: 0, bond: 30 }; }
    }
  }
  if (added) { const labels = uniqueLabels(Object.values(s.people)); for (const p of Object.values(s.people)) p.label = labels[p.id]; }
}
export function validateNuisance(s) {
  const n = s.nuisance, fail = m => { throw new Error(m); };
  if (!n || typeof n !== 'object' || !Number.isInteger(n.count) || n.count < 0 || n.count > 100 || typeof n.last !== 'object' || !Array.isArray(n.litter) || n.litter.length > 20) fail('손님 문제 기록이 올바르지 않아요.');
  for (const l of n.litter) if (!Array.isArray(l.cell) || l.cell.length !== 2 || !l.cell.every(Number.isFinite) || !['wrapper', 'can'].includes(l.kind)) fail('바닥 쓰레기 정보가 올바르지 않아요.');
  for (const [who, list] of Object.entries(n.last)) if (!s.people[who] || Object.keys(list).some(t => !TROUBLE[t])) fail('손님 문제 기록이 올바르지 않아요.');
  return s;
}
// What the workers remember about difficult customers: only what they actually know.
export function wariness(s) {
  const out = [];
  for (const w of Object.values(s.people).filter(p => p.kind === 'worker')) for (const m of s.memories[w.id] ?? []) {
    if (!m.key?.startsWith('trouble:') || m.key === 'trouble:unknown') continue;
    out.push({ worker: w.id, customer: m.key.slice(8), text: m.text, at: m.at, type: m.data?.trouble, source: m.source });
  }
  return out.sort((a, b) => b.at - a.at);
}
