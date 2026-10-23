// Deterministic memory consolidation. Interpretation never invents events or upgrades hearsay.
export const EVIDENCE_CAP = 12;
export function evidenceOf(m) { return m.evidence??{count:1,firstAt:m.at,lastAt:m.at,eventIds:m.eventId?[m.eventId]:[]}; }
export function combineEvidence(a,b) {
  const x=evidenceOf(a),y=evidenceOf(b), duplicate=b.eventId&&x.eventIds.includes(b.eventId);
  return {count:x.count+(duplicate?0:y.count),firstAt:Math.min(x.firstAt,y.firstAt),lastAt:Math.max(x.lastAt,y.lastAt),eventIds:[...new Set([...x.eventIds,...y.eventIds])].slice(-EVIDENCE_CAP)};
}
const protectedMemory=m=>!m.resolved||m.kind==='conflict'&&!m.reconciled||m.obligationId||m.key||m.kind==='habit'||!m.topic||m.importance>=.7;
function signature(m) {
  return JSON.stringify([m.about.slice().sort(),m.source,m.sourceId??null,m.topic,m.perspective??'',m.tone,m.data?.product??null,m.outcome??null]);
}
// Labels are deliberately modest: a repeated act is no proof of an immutable personality.
const LABELS={kind_words:'다정한 말',meet:'매장에서 마주친 일',friend_share:'먹을 것을 나눈 일',queue_urge:'계산을 재촉한 일',umbrella_return:'우산을 돌려준 일',left_trash:'쓰레기를 남긴 일',discount_refused:'할인 부탁이 거절된 일',favor_thanks:'지난 일에 인사한 일',seat_yield:'길을 양보한 일',slipped:'입구에서 미끄러진 일',paid_for:'돈을 대신 낸 일',umbrella_loan:'우산을 빌린 일',promise_kept:'상품 약속이 지켜진 일',promise_missed:'상품 약속이 늦어진 일'};
export function consolidatedText(m, name) {
  const n=evidenceOf(m).count, people=m.about.map(name).join(', '), label=LABELS[m.topic]??'비슷한 일';
  const prefix=m.source==='told'||m.source==='handover'?'전해 들은 이야기로는, ':'';
  return `${prefix}${people?people+'에 관해 ':''}${label}이 ${n}번 기억에 남아 있다.`;
}
export function consolidateList(list,clock,name,pressure=false) {
  const groups=new Map();let merged=0;
  for(const m of [...list]){
    if(protectedMemory(m)||clock-m.at<(pressure?120:1440))continue;
    const key=signature(m),prev=groups.get(key);
    if(!prev){groups.set(key,m);continue;}
    prev.evidence=combineEvidence(prev,m);prev.firstAt=prev.evidence.firstAt;
    prev.at=prev.evidence.lastAt;prev.consolidated=true;prev.kind='impression';
    prev.importance=Math.max(prev.importance,m.importance);
    // Retain the latest trace for existing event-specific rules. Detailed provenance is bounded.
    if(m.at>=prev.at)prev.eventId=m.eventId;
    prev.text=consolidatedText(prev,name);delete prev.share;delete prev.shared;
    list.splice(list.indexOf(m),1);merged++;
  }
  return merged;
}
