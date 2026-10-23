// How each person takes in an event. Same event, different memories depending on role and temperament.
import { PRODUCTS } from './data.js';
import { nameFor, particle as J, remember, adjust } from './memory.js';

const T = (s, id) => s.people[id].genes.temperament;
const pn = p => PRODUCTS[p]?.name ?? '상품';

// Writes memories for every witness of `e`. Returns nothing; the event record itself is untouched.
export function perceive(s, e) {
  const d = e.data;
  for (const v of e.witnesses) {
    if (!s.people[v]) continue;
    const m = RULES[e.type]?.(s, e, v, d);
    if (m) remember(s, v, { eventId: e.id, at: e.at, topic:e.type,
      perspective:Object.keys(d).filter(k=>d[k]===v).sort().join(':')||'witness',
      outcome:d.allowed??null,...m });
  }
}

const RULES = {
  umbrella_loan(s, e, v, d) {
    const b = nameFor(s, v, d.borrower), l = nameFor(s, v, d.lender);
    if (v === d.borrower) return { kind: 'promise', about: [d.lender], text: `${l}에게서 매장 우산을 빌렸다. 다음에 돌려줘야 한다.`, importance: .8, resolved: false, obligationId: d.obligationId, tone: 'grateful', share: 'umbrella' };
    if (v === d.lender) return { kind: 'promise', about: [d.borrower], text: `${b}에게 매장 우산을 빌려줬다. 아직 돌려받지 못했다.`, importance: .75, resolved: false, obligationId: d.obligationId, tone: 'neutral' };
    const t = T(s, v);
    if (t.suspicion >= 70) { adjust(s, v, d.borrower, { trust: -3 }); return { about: [d.borrower], text: `${J.i(b)} 매장 우산을 빌려 갔다. 돌려줄지는 모르겠다.`, importance: .3, tone: 'doubtful', share: 'umbrella' }; }
    return { about: [d.borrower, d.lender], text: `알바생이 ${b}에게 우산을 빌려주는 걸 봤다.`, importance: .3, tone: t.kindness >= 70 ? 'warm' : 'neutral', share: 'umbrella' };
  },
  umbrella_return(s, e, v, d) {
    const b = nameFor(s, v, d.borrower);
    if (v === d.borrower) return { about: [d.receiver], text: '빌린 우산을 돌려줬다.', importance: .5, tone: 'relieved' };
    if (v === d.receiver) return d.receiverKnew
      ? { about: [d.borrower], text: `${J.i(b)} 빌려 간 우산을 돌려받았다.`, importance: .55, obligationId: d.obligationId }
      : { about: [d.borrower], text: `${J.i(b)} 매장 우산을 가져왔다. 누가 빌려준 건지는 모른다.`, importance: .5, obligationId: d.obligationId };
    return { about: [d.borrower], text: `${J.i(b)} 빌린 우산을 돌려주는 걸 봤다.`, importance: .25 };
  },
  queue_urge(s, e, v, d) {
    const u = nameFor(s, v, d.urger), t = T(s, v);
    if (v === d.urger) return { about: [d.worker], text: '줄이 길어서 재촉했다.', importance: .25 };
    if (v === d.worker) {
      adjust(s, v, d.urger, { griev: t.patience >= 60 ? 2 : 6 });
      return { about: [d.urger], key: `urge:${d.urger}`, text: t.patience >= 60 ? `${J.eun(u)} 줄에서 재촉한다. 급한 일이 많은 사람 같다.` : `${J.eun(u)} 줄에서 재촉한다. 계산할 때 신경이 쓰인다.`, importance: .4, tone: t.patience >= 60 ? 'neutral' : 'annoyed' };
    }
    if (t.kindness >= 75) return { about: [d.urger], text: `${J.i(u)} 많이 급해 보였다.`, importance: .2, tone: 'sympathetic' };
    if (t.suspicion >= 60 || t.selfCentered >= 60) { adjust(s, v, d.urger, { griev: 4 }); return { about: [d.urger], text: `${J.i(u)} 줄에서 재촉해서 불편했다.`, importance: .25, tone: 'annoyed' }; }
    return null;
  },
  restock_promise(s, e, v, d) {
    const w = nameFor(s, v, d.worker), c = nameFor(s, v, d.customer), p = pn(d.product);
    if (v === d.customer) return { kind: 'promise', about: [d.worker], text: `${J.i(w)} ${J.eul(p)} 더 시켜 두겠다고 했다.`, importance: .6, resolved: false, obligationId: d.obligationId, data: { product: d.product } };
    if (v === d.worker) return { kind: 'promise', about: [d.customer], text: `${c}에게 ${J.eul(p)} 더 시켜 두겠다고 했다.`, importance: .6, resolved: false, obligationId: d.obligationId, data: { product: d.product } };
    return null;
  },
  promise_kept(s, e, v, d) {
    if (v === d.customer) return { about: [d.worker], text: `말한 대로 ${J.i(pn(d.product))} 들어와 있었다.`, importance: .5, tone: 'grateful' };
    if (v === d.worker) return { about: [d.customer], text: `${nameFor(s, v, d.customer)}에게 약속한 ${J.i(pn(d.product))} 제때 들어왔다.`, importance: .4 };
    return null;
  },
  promise_missed(s, e, v, d) {
    if (v === d.customer) return { about: [d.worker], text: `시켜 둔다던 ${J.i(pn(d.product))} 아직 없었다.`, importance: .5, tone: 'disappointed' };
    if (v === d.worker) return { about: [d.customer], text: `${nameFor(s, v, d.customer)}에게 약속한 ${J.eul(pn(d.product))} 못 지켰다.`, importance: .5 };
    return null;
  },
  line_cut(s, e, v, d) {
    const c = nameFor(s, v, d.cutter);
    if (v === d.cutter) return { about: [d.worker], text: d.allowed ? '바빠서 먼저 계산했다.' : '먼저 계산하려다 줄 서라는 말을 들었다.', importance: .3 };
    if (v === d.victim) { adjust(s, v, d.cutter, { griev: 22, trust: -8 }); if (d.allowed) adjust(s, v, d.worker, { griev: 6 }); return { kind: 'conflict', resolved:false, about: [d.cutter], text: d.allowed ? `${J.i(c)} 내 앞으로 새치기했다.` : `${J.i(c)} 새치기하려다 알바생에게 제지당했다.`, importance: .55, tone: 'annoyed' }; }
    if (v === d.worker) return { about: [d.cutter], key: `asks:${d.cutter}`, text: d.allowed ? `${c} 손님 먼저 계산해 줬다. 줄 선 손님이 불편해했다.` : `${c} 손님에게 줄을 서 달라고 했다.`, importance: .4 };
    return { about: [d.cutter], text: `${J.i(c)} 줄을 무시하고 계산대로 갔다.`, importance: .2, tone: 'annoyed' };
  },
  argument(s, e, v, d) {
    const c = nameFor(s, v, d.customer), w = nameFor(s, v, d.worker), p = pn(d.product), why = d.product ? `${p} 품절` : '계산 대기';
    if (v === d.customer) return { kind: 'conflict', resolved:false, about: [d.worker], text: d.product ? `${J.i(p)} 없어서 ${w}에게 언성을 높였다.` : `계산이 늦어서 ${w}에게 언성을 높였다.`, importance: .6, tone: 'angry' };
    if (v === d.worker) return { kind: 'conflict', resolved:false, about: [d.customer], text: `${J.i(c)} ${why} 때문에 화를 냈다.`, importance: .6, tone: 'hurt' };
    const t = T(s, v);
    adjust(s, v, d.customer, { griev: t.kindness >= 70 ? 6 : 3 });
    return { about: [d.customer, d.worker], text: t.kindness >= 70 ? `${J.i(c)} 알바생에게 화를 냈다. 알바생이 안쓰러웠다.` : `${J.i(c)} 계산대에서 크게 화를 냈다.`, importance: .35 };
  },
  reconcile(s, e, v, d) {
    const participant=v===d.a||v===d.b;
    let knew=false;
    for(const m of s.memories[v]){
      if(!(m.kind==='conflict'||['argument','line_cut'].includes(m.topic)))continue;
      const relevant=participant?m.about.includes(v===d.a?d.b:d.a):m.about.includes(d.a)&&m.about.includes(d.b);
      if(!relevant)continue;
      m.resolved=true;m.reconciled=true;m.closedAt=s.clock;
      m.resolution={source:'witnessed',sourceId:null,eventId:e.id,at:s.clock};knew=true;
    }
    if(!participant)return knew?{about:[d.a,d.b],text:'두 사람이 지난 일을 풀고 대화하는 모습을 봤다.',importance:.3,tone:'relieved'}:null;
    const other = v === d.a ? d.b : d.a;
    return { about: [other], text: `${nameFor(s, v, other)}와 지난번 일을 넘겼다.`, importance: .45, tone: 'relieved' };
  },
  kind_words(s, e, v, d) {
    if (v === d.to) return { about: [d.from], text: `${J.i(nameFor(s, v, d.from))} 늦게까지 고생한다고 말해 줬다.`, importance: .4, tone: 'warm' };
    if (v === d.from) return { about: [d.to], text: `${nameFor(s, v, d.to)}에게 안부를 건넸다.`, importance: .2 };
    return null;
  },
  paid_for(s, e, v, d) {
    const payer = nameFor(s, v, d.payer), payee = nameFor(s, v, d.payee);
    if (v === d.payee) return { kind: 'promise', about: [d.payer], text: `${J.i(payer)} 모자란 돈을 대신 내 줬다. 다음에 보면 인사해야 한다.`, importance: .75, resolved: false, obligationId: d.obligationId, tone: 'grateful', share: 'paidfor' };
    if (v === d.payer) return { about: [d.payee], text: `${payee}의 모자란 돈을 대신 냈다.`, importance: .35 };
    return { about: [d.payer, d.payee], text: `${J.i(payer)} ${payee} 대신 돈을 내 주는 걸 봤다.`, importance: .3, tone: 'warm' };
  },
  favor_thanks(s, e, v, d) {
    if (v === d.payee) return { about: [d.payer], text: `${nameFor(s, v, d.payer)}에게 지난번 일을 인사했다.`, importance: .35 };
    if (v === d.payer) return { about: [d.payee], text: `${J.i(nameFor(s, v, d.payee))} 지난번 일로 인사를 했다.`, importance: .3, tone: 'warm' };
    return null;
  },
  kid_candy(s, e, v, d) {
    if (v === d.child) return { key: 'candy:last', about: [d.parent], text: d.allowed ? '아빠가 사탕을 사 줬다.' : '사탕을 사 달라고 했는데 안 된다고 했다.', importance: .3, tone: d.allowed ? 'happy' : 'sulky' };
    if (v === d.parent) return { key: 'candy:last', about: [d.child], text: d.allowed ? `${d.childName}에게 사탕을 하나 사 줬다.` : `${d.childName}에게 오늘은 사탕을 안 사 줬다.`, importance: .25, data: { allowed: d.allowed } };
    return null;
  },
  left_trash(s, e, v, d) {
    if (v === d.who || s.people[v].kind !== 'worker') return null;
    return { about: [d.who], key: `messy:${d.who}`, text: `${J.i(nameFor(s, v, d.who))} 먹고 난 쓰레기를 두고 갔다.`, importance: .25 };
  },
  slipped(s, e, v, d) {
    if (v === d.who) return { text: '입구 바닥이 미끄러워 넘어질 뻔했다.', importance: .35, tone: 'startled' };
    if (s.people[v].kind === 'worker') return { key: 'mop:eager', text: '비 오는 날에는 입구 바닥을 더 자주 닦아야겠다.', importance: .45, data: { mopEager: true } };
    return null;
  },
  discount_refused(s, e, v, d) {
    if (v === d.customer) { adjust(s, v, d.worker, { griev: 4 }); return { about: [d.worker], text: '할인을 부탁했지만 안 된다고 했다.', importance: .25 }; }
    if (v === d.worker) return { about: [d.customer], key: `asks:${d.customer}`, text: `${J.eun(nameFor(s, v, d.customer))} 상냥하게 말하지만 부탁이 많다.`, importance: .35 };
    return null;
  },
  friend_share(s, e, v, d) {
    if (v === d.giver) return { about: [d.receiver], text: `${nameFor(s, v, d.receiver)}에게 ${J.eul(pn(d.product))} 나눠 주기로 했다.`, importance: .3 };
    if (v === d.receiver) return { about: [d.giver], text: `${J.i(nameFor(s, v, d.giver))} ${J.eul(pn(d.product))} 나눠 주겠다고 했다.`, importance: .35, tone: 'warm' };
    return null;
  },
  meet(s, e, v, d) {
    if (v !== d.a && v !== d.b) return null;
    const other = v === d.a ? d.b : d.a;
    return { about: [other], key: `met:${other}`, text: `${J.eul(nameFor(s, v, other))} 매장에서 마주쳤다.`, importance: .2 };
  },
  heard_name() { return null; }
};

export const SOURCE_LABEL = { witnessed: '직접 봄', self: '직접 겪음', told: '전해 들음', handover: '인수인계', habit: '반복 경험' };
