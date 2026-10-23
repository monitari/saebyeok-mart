// The first night is an existing neighbourhood, not a fabricated history of transactions.
import { PRODUCTS } from './data.js';
import { remember, nameFor } from '../mind/memory.js';

export const OPENING_TIME = 21*60+18;
export function createOpening() {
  return {version:1,started:false,guide:{person:false,moment:false,memory:false,dismissed:false}};
}
export function seedBackground(s) {
  for(const p of Object.values(s.people)){
    const favorite=p.genes.life.favorites?.[0];
    if(p.kind==='customer'&&PRODUCTS[favorite])remember(s,p.id,{kind:'fact',key:'background:preference',source:'self',origin:'background',text:`평소 ${PRODUCTS[favorite].name} 쪽을 좋아한다.`,importance:.25,data:{product:favorite}});
    if(p.kind==='worker')for(const other of Object.keys(s.names[p.id]??{})){
      if(s.people[other]?.kind==='worker')remember(s,p.id,{kind:'fact',key:`background:colleague:${other}`,source:'self',origin:'background',about:[other],text:`${nameFor(s,p.id,other)}와 같은 매장에서 교대 근무한다.`,importance:.35});
      else if((s.relations[p.id]?.[other]?.fam??0)>=25)remember(s,p.id,{kind:'fact',key:`background:known:${other}`,source:'self',origin:'background',about:[other],text:`${nameFor(s,p.id,other)}와 얼굴과 이름을 알고 지낸다.`,importance:.35});
    }
  }
  for(const g of s.groups)for(const who of g.members)for(const other of g.members){
    if(who===other)continue;
    const name=nameFor(s,who,other);
    const text=g.kind==='family'?(s.people[who].genes.appearance.age==='child'?`${name}는 우리 아빠다.`:`${name}는 내 딸이다.`):g.id==='friends'?`${name}와 대학 동창이다.`:g.kind==='coworkers'?`${name}와 같은 직장에서 일한다.`:`${name}와 동네에서 알고 지내는 이웃이다.`;
    remember(s,who,{kind:'fact',key:`background:companion:${other}`,source:'self',origin:'background',core:g.kind==='family',about:[other],text,importance:g.kind==='family'?.65:.4});
  }
}
export function startOpening(s,skip=false) {
  if(!s.opening)return false;
  s.opening.started=true;s.opening.guide.dismissed=skip;return true;
}
export function restartGuide(s) { s.opening=createOpening();s.opening.started=true; }
const significant = s => {
  const candidates=(s.moments??[]).filter(m=>m.confirmed&&m.eventIds.length);
  return candidates.find(m=>m.type==='umbrella_loan')??candidates.at(-1);
};
export function guideView(s) {
  const g=s.opening?.guide;
  if(!s.opening?.started||!g||g.dismissed)return null;
  if(!g.person)return {step:1,title:'먼저, 이 밤의 알바생',text:`${s.people[s.onDuty].name}의 이야기를 살펴보세요. 이미 아는 사람과 마음에 남은 일을 읽을 수 있어요.`,action:'person',label:'알바생 살펴보기',target:s.onDuty};
  const moment=significant(s);
  if(!g.moment)return moment?{step:2,title:'방금 있었던 일을 다시 보기',text:'실제로 일어난 행동과 대사가 짧은 장면으로 남았어요.',action:'moment',label:'장면 살펴보기',target:moment.id}:{step:2,title:'잠깐, 오가는 사람들을 지켜봐요',text:'입구로 오는 손님과 매장 앞을 지나가는 사람은 달라요. 일이 생기면 여기서 장면을 볼 수 있어요.',action:'overview',label:'매장 전체 보기'};
  if(!g.memory){
    const eventIds=new Set(moment?.eventIds??[]);
    const target=moment?.actors.find(id=>(s.memories[id]??[]).some(m=>eventIds.has(m.eventId)))??Object.keys(s.people).find(id=>(s.memories[id]??[]).some(m=>m.eventId));
    return target?{step:3,title:'같은 일이 다른 기억으로',text:'방금 일을 겪은 사람을 살펴보세요. 약속은 이어지고, 같은 경험이 쌓이면 인상이 돼요.',action:'memory',label:'남은 기억 읽기',target}:{step:3,title:'기억이 생기는 순간을 기다려요',text:'실제 일을 겪거나 전해 들으면 인물에게 기억이 남아요.',action:'overview',label:'매장 전체 보기'};
  }
  return {step:3,complete:true,title:'이제, 이 가게의 시간을 지켜봐요',text:'다녀간 손님은 다시 찾아와요. 중요한 장면은 기록에 남고, 발주와 근무표는 필요할 때 손볼 수 있어요.',action:'dismiss',label:'계속 지켜보기'};
}
export function noteOpening(s,kind,target) {
  const g=s.opening?.guide;if(!s.opening?.started||!g||g.dismissed)return false;
  const before=JSON.stringify(g);
  if(kind==='person'&&s.people[target]?.kind==='worker')g.person=true;
  if(kind==='moment'&&s.moments?.some(m=>m.id===target&&m.confirmed))g.moment=true;
  if(kind==='memory'&&(s.memories[target]??[]).some(m=>m.eventId))g.memory=true;
  if(kind==='dismiss')g.dismissed=true;
  return before!==JSON.stringify(g);
}
export function validateOpening(o) {
  if(o===undefined)return;
  if(!o||o.version!==1||typeof o.started!=='boolean'||!o.guide||!['person','moment','memory','dismissed'].every(k=>typeof o.guide[k]==='boolean'))throw new Error('첫 관찰 안내 정보가 올바르지 않아요.');
}
