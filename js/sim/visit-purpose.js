// Visit intent changes an actor's plan. It does not infer or share anyone else's memories.
export const VISIT_PURPOSES={shopping:'물건 사러 들름',atm:'ATM만 이용',browse:'가격 둘러보기',shelter:'비 피하기',wait:'친구 기다리기',restroom:'화장실 이용'};
export function chooseVisitPurpose(s,p,v,opts,random){
  if(Object.hasOwn(VISIT_PURPOSES,opts.purpose))return opts.purpose;
  if(!opts.casual||v.members.length>1||p.genes.appearance.age==='child')return 'shopping';
  const rainy=['rain','storm'].includes(s.weather.kind);
  if(random<.04)return p.genes.appearance.age==='teen'?'browse':'atm';
  if(random<.09)return 'browse';
  if(random<.13&&rainy)return 'shelter';
  if(random>=.13&&random<.16&&s.groups.some(g=>g.kind==='friends'&&g.members.includes(p.id)&&g.members.some(id=>id!==p.id)))return 'wait';
  if(random>=.16&&random<.19)return 'restroom';
  return 'shopping';
}
