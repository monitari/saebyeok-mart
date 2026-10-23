// Operations policy and read-only forecasts. No model output may change these numbers.
import {PRODUCTS} from './data.js';
export const MODES={auto:'자동',approval:'승인 후 발주',manual:'수동'};
export const PRIORITIES={balanced:'균형',stock:'진열 우선',clean:'청결 우선'};
export const FACILITIES={
  extraTable:{name:'창가 자리 추가',price:20000,fixture:'table2',benefit:'취식 자리 4석 추가',tradeoff:'머무는 손님과 청소할 자리가 늘어요.'},
  umbrellaSale:{name:'비닐우산 판매',price:5000,fixture:'dailyShelf',benefit:'비 오는 날 우산 구매 가능',tradeoff:'상품은 별도로 발주해야 해요.'},
  tobaccoSales:{name:'담배 판매',price:10000,fixture:'tobaccoCabinet',benefit:'계산대에서 담배 판매',tradeoff:'신분 확인과 상품 전달은 알바생이 맡아요.'},
  welcomeMat:{name:'입구 매트',price:8000,benefit:'빗물 유입과 바닥 청소 부담 감소',tradeoff:'출입구에 설치해요.'},
  warmLight:{name:'따뜻한 조명',price:12000,benefit:'들어오는 손님의 기분 소폭 개선',tradeoff:'매장 전체에 적용돼요.'},
  selfCheckout:{name:'셀프 계산대',price:40000,fixture:'kiosk',benefit:'일부 손님의 계산을 분담',tradeoff:'오류 대응이 필요하며 알바생과의 접촉은 줄어요.'}
};
export const EFFECT_COUNTERS=['rainEntries','waterBlocked','mops','kioskSales','extraSeatUses','lightLift','umbrellaSold','tobaccoSold'];
const newFeedback=()=>({serial:0,changes:[],totals:Object.fromEntries(EFFECT_COUNTERS.map(k=>[k,0]))});
export const newDay=day=>({day,sold:{},missed:{},substituted:{},waste:{},hours:Array(24).fill(0),orderCost:0,expense:0,visits:{},outcomes:{}});
export function createManagement(s){return {mode:s.orders.auto===false?'manual':'auto',overrides:{},budget:60000,reserve:12000,spent:0,priority:'balanced',today:newDay(s.day),history:[],draft:null,requests:[],feedback:newFeedback(),favorites:[]};}
export function migrateManagement(s){
  if(s.management===undefined&&s.orders)s.management=createManagement(s);
  const m=s.management;if(!m||typeof m!=='object')return;
  if(m.feedback===undefined)m.feedback=newFeedback();
  if(m.favorites===undefined)m.favorites=[];
  for(const day of [m.today,...(Array.isArray(m.history)?m.history:[])])if(day&&typeof day==='object'){day.visits??={};day.outcomes??={};}
}
// These are player-facing observations, never memories or evidence supplied to NPCs.
export function recordDecision(s,kind,key,before,after){
  if(before===after)return;
  const f=s.management.feedback;
  const baseline=s.management.history.slice(-3).map(d=>({day:d.day,sold:{...d.sold},missed:{...d.missed},waste:{...d.waste}}));
  if(kind==='facility')for(const c of f.changes)if(c.kind===kind&&c.key===key&&c.endedAt===undefined){c.endedAt=s.clock;c.endTotals={...f.totals};}
  f.changes=f.changes.filter(c=>!(c.kind===kind&&c.key===key&&c.day===s.day));
  f.changes.push({id:++f.serial,kind,key,before,after,at:s.clock,day:s.day,baseline,following:[],totals:{...f.totals}});
  const perKind={};f.changes=f.changes.reverse().filter(c=>(perKind[c.kind]=(perKind[c.kind]??0)+1)<=4).reverse();
}
export function orderMode(s,p){const m=s.management;return m?.overrides[p]??(m?.mode==='auto'&&s.orders.auto===false?'manual':m?.mode??(s.orders.auto?'auto':'manual'));}
export function setOrderMode(s,mode,p=null){if(!Object.hasOwn(MODES,mode)&&!(p&&mode==='inherit'))return false;if(p){if(!PRODUCTS[p])return false;if(mode==='inherit')delete s.management.overrides[p];else s.management.overrides[p]=mode;}else{s.management.mode=mode;s.orders.auto=mode==='auto';}return true;}
export function setFavorite(s,p,on){
  if(!Object.hasOwn(PRODUCTS,p)||typeof on!=='boolean')return false;
  const favorites=s.management.favorites;
  if(on&&!favorites.includes(p)){if(favorites.length>=8)return false;favorites.push(p);}
  if(!on)s.management.favorites=favorites.filter(id=>id!==p);
  return true;
}
export function setTargetPar(s,p,n){if(!Object.hasOwn(PRODUCTS,p)||!Number.isInteger(n)||n<0||n>60)return false;recordDecision(s,'par',p,s.orders.par[p]??0,n);s.orders.par[p]=n;return true;}
export function nextDelivery(s){const day=Math.floor(s.clock/1440),today=day*1440+420;return s.clock<today&&s.orders.lastDeliveryDay!==s.day?today:today+1440;}
export function schedule(day){
  const week=Math.floor((day-1)/7),kind=week%3,start=week*7+4,end=start+2;
  return {start,end,kind,title:['동네 시험 기간','인근 회사 야근 주간','주말 골목 행사'][kind],description:['저녁에 학생 방문이 늘고 간식을 더 찾아요.','밤 시간에 직장인이 식사와 커피를 찾아요.','낮 시간 방문과 음료 구매가 늘어요.'][kind],products:[['chips','candy'],['coffee','lunchbox'],['water','soda']][kind]};
}
export function activeSchedule(s){const e=schedule(s.day);return s.day>=e.start&&s.day<=e.end?e:null;}
export function neighborhoodBias(s,p){const e=activeSchedule(s);if(!e)return 1;const hour=Math.floor(s.clock%1440/60),age=p.genes.appearance.age;
  return e.kind===0&&age==='teen'&&hour>=17?1.4:e.kind===1&&age==='adult'&&hour>=20?1.35:e.kind===2&&hour>=10&&hour<18?1.3:1;
}
export function productStatus(s,p){
  const d=PRODUCTS[p],held=s.holds.filter(h=>h.p===p).length,back=Math.max(0,s.back[p]-held);
  const boxes=s.boxes.filter(b=>b.p===p).reduce((n,b)=>n+b.n,0),carrying=Object.values(s.actors).reduce((n,a)=>n+(a.holding?.p===p?a.holding.n:0),0);
  const pending=s.orders.pending[p]??0,have=s.shelf[p]+back+boxes+carrying+pending;
  const history=s.management?.history??[],average=history.length?history.reduce((n,h)=>n+(h.sold[p]??0)+(h.missed[p]??0)-(h.substituted[p]??0),0)/history.length:null;
  const eta=nextDelivery(s),factor=activeSchedule(s)?.products.includes(p)?1.2:1;
  const recentWaste=history.reduce((n,h)=>n+(h.waste[p]??0),0),par=s.orders.par[p]??0,forecast=Math.ceil((average??0)*factor*1.25);
  const target=par===0?0:average===null?par:Math.min(60,d.expires&&recentWaste>0?Math.max(1,Math.min(par,forecast)):Math.max(par,forecast));
  const need=Math.max(0,Math.min(60,target-have)),until=average===null?null:Math.ceil(average*(eta-s.clock)/1440);
  const expired=(s.batches[p]??[]).filter(b=>b.day+(d.expires??999)<=s.day).reduce((n,b)=>n+b.n,0);
  const status=s.shelf[p]===0&&(back+boxes+carrying)>0?'refill':s.shelf[p]===0?'empty':until!==null&&until>s.shelf[p]+back+boxes+carrying?'low':expired>0?'expiry':'ok';
  return {p,back,held,boxes,carrying,pending,have,need,target,average,until,expired,status,eta,wasteAdjusted:!!(d.expires&&recentWaste>0)};
}
export function orderAllowance(s){return Math.max(0,Math.min(s.money-s.management.reserve,s.management.budget-s.management.spent));}
export function recommendations(s,mode=null){
  let available=orderAllowance(s);
  return Object.keys(PRODUCTS).filter(p=>!PRODUCTS[p].facility||s.facilities[PRODUCTS[p].facility]).map(p=>productStatus(s,p))
    .filter(r=>!mode||orderMode(s,r.p)===mode).sort((a,b)=>(s.management.today.missed[b.p]??0)-(s.management.today.missed[a.p]??0)||a.have-b.have||a.p.localeCompare(b.p))
    .map(r=>{const qty=Math.min(r.need,Math.floor(available/PRODUCTS[r.p].cost));available-=qty*PRODUCTS[r.p].cost;return {...r,qty};});
}
export function createDraft(s){const rows=recommendations(s).filter(r=>r.qty>0);s.management.draft={at:s.clock,items:Object.fromEntries(rows.map(r=>[r.p,r.qty])),pending:JSON.stringify(s.orders.pending)};return rows.length;}
export function draftCost(s){return Object.entries(s.management.draft?.items??{}).reduce((n,[p,q])=>n+PRODUCTS[p].cost*q,0);}
export function recordSale(s,items,by){const t=s.management.today,f=s.management.feedback.totals;for(const [p,n]of items){t.sold[p]=(t.sold[p]??0)+n;if(p==='umbrella')f.umbrellaSold+=n;if(PRODUCTS[p].staffOnly)f.tobaccoSold+=n;}t.hours[Math.floor(s.clock%1440/60)]++;if(by==='kiosk')f.kioskSales++;}
export function closeManagementDay(s){const m=s.management;m.history.push(structuredClone(m.today));m.history=m.history.slice(-7);
  for(const c of m.feedback.changes)if(c.kind!=='facility'&&m.today.day>c.day&&c.following.length<3)c.following.push({day:m.today.day,sold:{...m.today.sold},missed:{...m.today.missed},waste:{...m.today.waste}});
  m.today=newDay(Math.floor(s.clock/1440)+1);m.spent=0;
  for(const r of m.requests)if(r.status==='ordered'){
    const o=s.obligations.find(o=>o.id===r.obligationId);
    if(o?.status==='kept')r.status='fulfilled';
    else if(!o||o.status!=='open'||Math.floor(s.clock/1440)+1>o.dueDay+2){r.status='expired';if(o?.status==='open'){o.status='broken';o.resolvedAt=s.clock;}s.holds=s.holds.filter(h=>h.obligationId!==r.obligationId);}
  }
  m.requests=m.requests.filter(r=>r.status==='pending'||s.clock-r.at<10080).slice(-40);
  for(const r of m.requests)if(r.status==='pending'&&s.clock-r.at>4320)r.status='expired';
}
export function validateManagement(s){
  const m=s.management,bad=()=>{throw Error('운영 설정이나 발주 기록이 올바르지 않아요.');},obj=x=>x&&typeof x==='object'&&!Array.isArray(x),num=(x,max=1e10)=>Number.isFinite(x)&&x>=0&&x<=max;
  const counts=x=>obj(x)&&Object.entries(x).every(([p,n])=>Object.hasOwn(PRODUCTS,p)&&Number.isInteger(n)&&num(n));
  if(!obj(m)||!Object.hasOwn(MODES,m.mode)||!Object.hasOwn(PRIORITIES,m.priority)||!num(m.budget,1e7)||!num(m.reserve,1e7)||!num(m.spent)||!obj(m.overrides)||Object.entries(m.overrides).some(([p,v])=>!PRODUCTS[p]||!Object.hasOwn(MODES,v)))bad();
  if(!Array.isArray(m.history)||m.history.length>7)bad();
  for(const t of [m.today,...m.history])if(!obj(t)||!num(t.day,1e5)||!['sold','missed','substituted','waste'].every(k=>counts(t[k]))||!num(t.orderCost)||!num(t.expense)||!Array.isArray(t.hours)||t.hours.length!==24||t.hours.some(n=>!num(n)))bad();
  if(m.draft!==null&&(!obj(m.draft)||!num(m.draft.at)||typeof m.draft.pending!=='string'||m.draft.pending.length>10000||!counts(m.draft.items)||Object.values(m.draft.items).some(n=>n>60)))bad();
  if(!Array.isArray(m.requests)||m.requests.length>40||m.requests.some(r=>!obj(r)||typeof r.id!=='string'||!PRODUCTS[r.p]||!s.people[r.customer]||!s.people[r.worker]||!num(r.at)||!['pending','ordered','declined','expired','fulfilled'].includes(r.status)))bad();
  if(new Set(m.requests.map(r=>r.id)).size!==m.requests.length||m.requests.some(r=>r.status==='ordered'&&!s.obligations.some(o=>o.id===r.obligationId&&o.product===r.p&&o.creditor===r.customer)))bad();
  if(!obj(s.orders.pending)||!obj(s.orders.par)||!counts(s.orders.pending)||Object.values(s.orders.pending).some(n=>n>500)||!counts(s.orders.par)||Object.values(s.orders.par).some(n=>n>60))bad();
  if(!Array.isArray(m.favorites)||m.favorites.length>8||new Set(m.favorites).size!==m.favorites.length||m.favorites.some(p=>!Object.hasOwn(PRODUCTS,p)))bad();
  const f=m.feedback,counters=x=>obj(x)&&EFFECT_COUNTERS.every(k=>num(x[k]));
  if(!obj(f)||!Number.isInteger(f.serial)||!num(f.serial)||!counters(f.totals)||!Array.isArray(f.changes)||f.changes.length>12)bad();
  const samples=x=>Array.isArray(x)&&x.length<=3&&x.every(d=>obj(d)&&num(d.day,1e5)&&counts(d.sold)&&counts(d.missed)&&counts(d.waste));
  for(const c of f.changes)if(!obj(c)||!Number.isInteger(c.id)||!num(c.id,f.serial)||!num(c.at,s.clock)||!num(c.day,1e5)||!samples(c.baseline)||!samples(c.following)||!counters(c.totals)||c.endedAt!==undefined&&(!num(c.endedAt,s.clock)||c.endedAt<c.at||!counters(c.endTotals))||!(c.kind==='facility'&&Object.hasOwn(FACILITIES,c.key)&&typeof c.before==='boolean'&&typeof c.after==='boolean'||['par','order'].includes(c.kind)&&Object.hasOwn(PRODUCTS,c.key)&&Number.isInteger(c.before)&&num(c.before,500)&&Number.isInteger(c.after)&&num(c.after,500)))bad();
  if(new Set(f.changes.map(c=>c.id)).size!==f.changes.length)bad();
  for(const t of [m.today,...m.history])for(const [k,allowed]of [['visits',['shopping','atm','browse','shelter','wait','restroom']],['outcomes',['noPurchase','abandoned']]])if(!obj(t[k])||Object.entries(t[k]).some(([key,v])=>!allowed.includes(key)||!Number.isInteger(v)||!num(v)))bad();
}
