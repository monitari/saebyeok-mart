export const VERSION = 1;
export const TILE = 32;
export const PEOPLE = {
  yuna: { id:'yuna', name:'유나', age:25, role:'저녁 알바', desc:'말수는 적지만 손님이 늘 사는 물건은 기억해요. 오늘은 22시에 퇴근해요.', tags:['차분한','세심한','말수가 적은'], genome:{skin:'#e6bb97',hair:'#473a36',shirt:'#d9d2b7',pants:'#54645a',style:1,accessory:'apron',height:1}, patience:85, kindness:90 },
  jae: { id:'jae', name:'재현', age:29, role:'야간 알바', desc:'야간 근무가 익숙해요. 무뚝뚝해 보여도 빌려준 우산과 단골 취향을 챙겨요.', tags:['무뚝뚝한','책임감 있는','야행성'], genome:{skin:'#d8ad86',hair:'#353b37',shirt:'#8b9e82',pants:'#394b46',style:0,accessory:'apron',height:1.08}, patience:70, kindness:80 },
  doyun: { id:'doyun', name:'도윤', age:34, role:'배달 기사', desc:'잠깐 쉬러 들렀어요. 말은 급해도 빌린 물건은 꼭 돌려줘요.', tags:['성미가 급한','의리 있는','커피 단골'], genome:{skin:'#cfa47d',hair:'#3d3832',shirt:'#d58b54',pants:'#485465',style:0,accessory:'cap',height:1.06}, patience:20, kindness:55 },
  minseo: { id:'minseo', name:'민서', age:23, role:'동네 단골', desc:'하린과 늦은 저녁을 고르는 중이에요. 신중하고, 먼저 말을 걸지는 않아요.', tags:['조용한','신중한','도시락파'], genome:{skin:'#ebc5a5',hair:'#4c3a35',shirt:'#a6b4a7',pants:'#5b6571',style:2,accessory:'bag',height:.98}, patience:90, kindness:80 },
  harin: { id:'harin', name:'하린', age:22, role:'민서의 친구', desc:'새로 나온 간식은 그냥 지나치지 못해요. 친구 대신 질문하는 쪽이에요.', tags:['수다스러운','호기심 많은','솔직한'], genome:{skin:'#e7b995',hair:'#845643',shirt:'#c28c8a',pants:'#4e5f67',style:1,accessory:'bag',height:.95}, patience:45, kindness:75 },
  sunja: { id:'sunja', name:'순자', age:68, role:'동네 주민', desc:'산책을 마치고 우유를 사러 와요. 누가 피곤해 보이는지 금방 알아채요.', tags:['다정한','느긋한','꼼꼼한'], genome:{skin:'#d9b695',hair:'#abb0a1',shirt:'#9689a4',pants:'#5d605c',style:3,accessory:'glasses',height:.92}, patience:95, kindness:98 }
};
export const PRODUCTS = { coffee:{name:'캔커피',price:1800}, meal:{name:'도시락',price:4500}, snack:{name:'과자',price:1700}, milk:{name:'우유',price:2400} };
const CENTERS = { coffee:[18,5], meal:[13,7], snack:[8,7], milk:[16,4] };
const point=(x,y)=>({x:x*32+16,y:y*32+16});
export const floorCell=(x,y)=>{
  if ((x===11||x===12)&&y>=14&&y<=15) return true;
  if(x<3||x>20||y<4||y>13)return false;
  if(y>=6&&y<=8&&((x>=5&&x<=7)||(x>=10&&x<=12)||(x>=15&&x<=17)))return false;
  if(y>=11&&y<=12&&x>=4&&x<=7)return false;
  if(y>=10&&y<=12&&x>=19)return false;
  return true;
};
export function findPath(from,to){
  const start=[Math.floor(from.x/32),Math.floor(from.y/32)],goal=[Math.floor(to.x/32),Math.floor(to.y/32)];
  const key=p=>p.join(','); const queue=[start], prev=new Map([[key(start),null]]);
  for(let i=0;i<queue.length;i++){
    const p=queue[i]; if(key(p)===key(goal))break;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const n=[p[0]+dx,p[1]+dy];if(floorCell(...n)&&!prev.has(key(n))){prev.set(key(n),p);queue.push(n);}}
  }
  if(!prev.has(key(goal)))return [];
  const route=[];let cur=goal;while(key(cur)!==key(start)){route.unshift(point(...cur));cur=prev.get(key(cur));}return route;
}
export function timeLabel(s){const m=Math.floor(s.clock)%1440;return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;}
export function dayLabel(s){return Math.floor(s.clock/1440)+1;}
export function workerAt(clock){const h=Math.floor(clock/60)%24;return h>=22||h<8?'jae':'yuna';}
export function cleanLine(value){
  if(typeof value!=='string')return '';
  return value.replace(/[·•*]/g,'').replace(/\([^)]*\)/g,'').replace(/[\r\n]+/g,' ').trim().slice(0,60);
}
export function initialState(){
  const s={version:VERSION,elapsed:0,clock:1300,revenue:0,visitors:0,stock:{coffee:18,meal:12,snack:20,milk:12},actors:{},visits:[],events:[],memories:{},relations:{},logs:[],tasks:[],bubbles:[],nextId:1,nextVisit:18,rotation:0,umbrella:'store',worker:'yuna',selected:'doyun',seenVisits:{},savedAt:Date.now()};
  for(const p of Object.values(PEOPLE)){s.memories[p.id]=[];s.relations[p.id]={};}
  s.relations.minseo.harin=80;s.relations.harin.minseo=85;
  s.actors.yuna={id:'yuna',...point(6,10),path:[],state:'계산대를 지키는 중',direction:'down',walk:0};
  startVisit(s,['doyun']);startVisit(s,['minseo','harin']);
  return s;
}
function addEvent(s,type,title,detail,participants,important=true){
  const event={id:`e${s.nextId++}`,type,title,detail,participants,time:timeLabel(s),day:dayLabel(s),at:s.elapsed,important};
  s.events.push(event);if(s.events.length>160)s.events.shift();return event;
}
function remember(s,person,event,text,unresolved=false){
  if(!s.memories[person])return;
  s.memories[person].push({id:`m${s.nextId++}`,eventId:event.id,type:event.type,text,time:event.time,day:event.day,unresolved});
  if(s.memories[person].length>24){const idx=s.memories[person].findIndex(m=>!m.unresolved);if(idx>=0)s.memories[person].splice(idx,1);}
}
function relate(s,from,to,delta){s.relations[from][to]=Math.max(0,Math.min(100,(s.relations[from][to]??45)+delta));}
export function speak(s,speaker,text,target=null,visitId=null){
  const line=cleanLine(text);if(!line||!s.actors[speaker])return;
  const entry={id:`l${s.nextId++}`,speaker,text:line,target,visitId,time:timeLabel(s),at:s.elapsed};
  s.logs.push(entry);if(s.logs.length>120)s.logs.shift();
  s.bubbles=s.bubbles.filter(b=>b.speaker!==speaker);s.bubbles.push({...entry,until:s.elapsed+5.5});if(s.bubbles.length>2)s.bubbles.shift();
}
function schedule(s,delay,type,data){s.tasks.push({due:s.elapsed+delay,type,...data});}
function line(s,delay,speaker,text,target,visitId){schedule(s,delay,'line',{speaker,text,target,visitId});}
export function startVisit(s,ids){
  if(ids.some(id=>s.actors[id]))return false;
  const v={id:`v${s.nextId++}`,members:ids,stage:'shopping',at:s.elapsed,checkoutAt:null,worker:null};s.visits.push(v);
  ids.forEach((id,index)=>{
    const product=id==='doyun'?'coffee':id==='minseo'?'meal':id==='harin'?'snack':'milk';
    const a={id,...point(11+index%2,14),path:[],state:'들어오는 중',direction:'up',walk:0,visitId:v.id,product,bought:false};
    const destination=point(...CENTERS[product]);a.path=findPath(a,destination);s.actors[id]=a;s.seenVisits[id]=(s.seenVisits[id]??0)+1;
  });
  const names=ids.map(id=>PEOPLE[id].name).join(', ');
  addEvent(s,'arrival',ids.length>1?'함께 온 저녁':`${names}의 방문`,ids.length>1?`${names} · 친구 ${ids.length}명`:`${s.seenVisits[ids[0]]}번째 방문`,ids,false);
  if(ids.includes('minseo')){line(s,8,'harin','오늘도 도시락 먹을 거야?','minseo',v.id);line(s,13,'minseo',s.seenVisits.minseo>1?'응. 지난번 거 괜찮더라.':'응. 너는 뭐 먹게?','harin',v.id);line(s,19,'harin','난 새로 나온 과자. 반 나눠 줄게.','minseo',v.id);}
  if(ids.includes('sunja'))line(s,9,'sunja',s.seenVisits.sunja>1?'우유 사러 또 왔어요.':'우유는 저쪽이지요?',s.worker,v.id);
  return true;
}
function beginCheckout(s,v){
  v.stage='checkout';v.checkoutAt=s.elapsed;v.worker=s.worker;const w=s.worker,lead=v.members[0];
  const a=s.actors[lead];if(!a)return;
  if(lead==='doyun'){
    if(s.umbrella==='doyun'){
      speak(s,lead,'어제 빌린 우산이요. 잘 썼어요.',w,v.id);
      // Say "아까" when the same game day has not yet passed.
      const loan=s.memories.doyun.find(m=>m.type==='umbrella_loan'&&m.unresolved);
      if(loan&&loan.day===dayLabel(s)){s.logs.at(-1).text='아까 빌린 우산이요. 잘 썼어요.';s.bubbles.at(-1).text=s.logs.at(-1).text;}
      line(s,5,w,'챙겨 오셨네요. 여기 둘게요.',lead,v.id);schedule(s,6,'returnUmbrella',{worker:w,visitId:v.id});
    } else if(s.umbrella==='store'&&!s.events.some(e=>e.type==='umbrella_loan')){
      speak(s,lead,'비가 더 오네. 우산도 없는데.',w,v.id);
      line(s,5,w,'매장 우산 빌려 가세요.',lead,v.id);line(s,10,lead,'진짜요? 다음에 갖다 드릴게요.',w,v.id);schedule(s,11,'loanUmbrella',{worker:w,visitId:v.id});
    } else {speak(s,lead,'커피 하나요. 오늘도 정신없네요.',w,v.id);line(s,5,w,'잠깐 쉬었다 가세요.',lead,v.id);}
  } else if(lead==='minseo'){
    speak(s,'harin','같이 계산할게요. 봉투도 주세요.',w,v.id);
    line(s,5,w,'도시락은 데워 드릴까요?','minseo',v.id);
    line(s,10,'minseo','괜찮아요. 집이 바로 앞이라서요.',w,v.id);
    schedule(s,11,'friendMemory',{visitId:v.id});
  } else {
    speak(s,lead,'밤까지 일하느라 고생이네.',w,v.id);
    line(s,5,w,'감사해요. 바닥 조금 미끄러워요.',lead,v.id);
    schedule(s,7,'kindMemory',{worker:w,visitId:v.id});
  }
  schedule(s,15,'purchase',{visitId:v.id});
}
function runTask(s,t){
  const v=s.visits.find(v=>v.id===t.visitId);
  if(t.type==='line'){speak(s,t.speaker,t.text,t.target,t.visitId);return;}
  if(t.type==='removeWorker'){if(t.worker!==s.worker)delete s.actors[t.worker];return;}
  if(!v)return;
  if(t.type==='loanUmbrella'&&s.umbrella==='store'){
    s.umbrella='doyun';const e=addEvent(s,'umbrella_loan','비를 피할 작은 친절','도윤이 매장 우산을 빌렸어요.',['doyun',t.worker]);
    remember(s,'doyun',e,`${PEOPLE[t.worker].name}에게 우산을 빌렸다. 다음 방문 때 돌려주자.`,true);
    remember(s,t.worker,e,'도윤에게 매장 우산을 빌려줬다. 아직 돌려받지 못했다.',true);relate(s,'doyun',t.worker,18);
  } else if(t.type==='returnUmbrella'&&s.umbrella==='doyun'){
    s.umbrella='returned';for(const memories of Object.values(s.memories))for(const m of memories)if(m.type==='umbrella_loan'||m.pendingItem==='umbrella')m.unresolved=false;
    const e=addEvent(s,'umbrella_return','잊지 않고 돌아온 마음','도윤이 빌린 우산을 돌려줬어요.',['doyun',t.worker]);
    remember(s,'doyun',e,`${PEOPLE[t.worker].name}에게 우산을 돌려줬다.`);remember(s,t.worker,e,'도윤은 빌린 물건을 꼭 돌려주는 사람이다.');relate(s,t.worker,'doyun',20);
  } else if(t.type==='friendMemory'){
    if(s.memories.minseo.some(m=>m.type==='shared_snack'))return;
    const e=addEvent(s,'shared_snack','반으로 나눈 과자','하린이 민서에게 과자를 나눠주기로 했어요.',['minseo','harin']);
    remember(s,'minseo',e,'하린이 과자를 나눠주겠다고 했다.');remember(s,'harin',e,'민서는 늦은 저녁으로 도시락을 고른다.');relate(s,'minseo','harin',5);
  } else if(t.type==='kindMemory'){
    if(s.memories[t.worker].some(m=>m.type==='kind_words'))return;
    const e=addEvent(s,'kind_words','다정한 한마디','순자가 알바생에게 안부를 건넸어요.',['sunja',t.worker]);
    remember(s,t.worker,e,'순자 님이 늦게까지 고생한다며 안부를 물었다.');remember(s,'sunja',e,`${PEOPLE[t.worker].name}이 미끄러운 바닥을 조심하라고 했다.`);relate(s,t.worker,'sunja',12);
  } else if(t.type==='purchase'){
    let total=0;
    for(const id of v.members){const a=s.actors[id];if(a&&s.stock[a.product]>0){s.stock[a.product]--;total+=PRODUCTS[a.product].price;a.bought=true;}}
    s.revenue+=total;v.stage='leaving';s.visitors+=v.members.length;
    speak(s,v.worker,total?'조심히 들어가세요.':'죄송해요. 지금은 품절이에요.',v.members[0],v.id);
    for(const id of v.members){const a=s.actors[id];if(a){a.path=findPath(a,point(11,15));a.state='집으로 가는 중';}}
  }
}
function changeShift(s){
  const next=workerAt(s.clock);if(next===s.worker)return;
  // Finish the current purchase before handing over the till.
  if(s.visits.some(v=>v.stage==='checkout'))return;
  const old=s.worker;s.worker=next;
  s.actors[next]={id:next,...point(6,10),path:[],state:'계산대를 지키는 중',direction:'down',walk:0};
  if(s.actors[old]){s.actors[old].x-=32;s.actors[old].state='인수인계 중';}
  const e=addEvent(s,'shift','밤의 교대',`${PEOPLE[old].name}에서 ${PEOPLE[next].name}(으)로 근무가 바뀌었어요.`,[old,next]);
  if(s.umbrella==='doyun'){
    speak(s,old,'주황 옷 손님한테 우산 빌려줬어요.',next);
    remember(s,next,e,`${PEOPLE[old].name}의 인수인계: 도윤이 매장 우산을 빌려갔다.`,true);
    s.memories[next].at(-1).pendingItem='umbrella';
  }else speak(s,old,'입고 정리했어요. 먼저 갈게요.',next);
  schedule(s,5,'line',{speaker:next,text:'수고했어요. 조심히 가요.',target:old});schedule(s,9,'removeWorker',{worker:old});
}
export function step(s,dt){
  if(!Number.isFinite(dt)||dt<=0)return;
  s.elapsed+=dt;s.clock+=dt;s.bubbles=s.bubbles.filter(b=>b.until>s.elapsed);
  for(const a of Object.values(s.actors)){
    let budget=dt*(a.id==='sunja'?32:45);
    while(a.path.length&&budget>0){const p=a.path[0],dx=p.x-a.x,dy=p.y-a.y,d=Math.hypot(dx,dy);a.direction=Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up';a.walk+=budget/12;if(d<=budget){a.x=p.x;a.y=p.y;a.path.shift();budget-=d;}else{a.x+=dx/d*budget;a.y+=dy/d*budget;budget=0;}}
    if(!a.path.length&&a.state==='들어오는 중')a.state='물건을 고르는 중';
  }
  const ready=s.tasks.filter(t=>t.due<=s.elapsed);s.tasks=s.tasks.filter(t=>t.due>s.elapsed);ready.sort((a,b)=>a.due-b.due).forEach(t=>runTask(s,t));
  for(const v of [...s.visits]){
    if(v.stage==='shopping'&&s.elapsed-v.at>25&&v.members.every(id=>!s.actors[id]?.path.length)){
      v.stage='queue';v.queueAt=s.elapsed;v.members.forEach((id,i)=>{const a=s.actors[id];a.path=findPath(a,point(8+i,12));a.state='계산을 기다리는 중';});
    }
    if(v.stage==='queue'&&v.members.includes('doyun')&&!v.complained&&s.elapsed-v.queueAt>8&&s.visits.some(other=>other.stage==='checkout')){
      v.complained=true;speak(s,'doyun','커피 하나인데, 먼저 안 돼요?',s.worker,v.id);
      line(s,4,s.worker,'앞 손님 계산만 마칠게요.','doyun',v.id);
      const e=addEvent(s,'queue_complaint','조금 급한 마음','도윤이 계산을 기다리며 재촉했어요.',['doyun',s.worker]);
      remember(s,s.worker,e,'도윤은 기다리는 걸 답답해한다.');relate(s,s.worker,'doyun',-4);
    }
    if(v.stage==='queue'&&v.members.every(id=>!s.actors[id]?.path.length)&&!s.visits.some(other=>other.stage==='checkout'))beginCheckout(s,v);
    if(v.stage==='leaving'&&v.members.every(id=>!s.actors[id]?.path.length)){for(const id of v.members)delete s.actors[id];s.visits=s.visits.filter(other=>other!==v);}
  }
  changeShift(s);
  if(s.elapsed>=s.nextVisit){
    const choices=[['sunja'],['doyun'],['minseo','harin']];
    if(startVisit(s,choices[s.rotation%3])){s.rotation++;s.nextVisit=s.elapsed+38;}else s.nextVisit=s.elapsed+5;
  }
  // Restock at daybreak; stock is never fabricated by dialogue.
  const day=dayLabel(s);if(Math.floor(s.clock)%1440>=360&&s.lastRestockDay!==day&&s.elapsed>500){s.stock={coffee:18,meal:12,snack:20,milk:12};s.lastRestockDay=day;addEvent(s,'restock','아침 입고','새 상품이 도착했어요.',[],false);}
}
export function serialize(s){return JSON.stringify({...s,savedAt:Date.now()});}
export function restore(value){
  const s=typeof value==='string'?JSON.parse(value):structuredClone(value);
  if(!s||s.version!==VERSION||!Number.isFinite(s.clock)||s.clock<0||!Number.isFinite(s.elapsed)||s.elapsed<0||!Number.isFinite(s.revenue)||s.revenue<0||!Number.isInteger(s.nextId)||!Number.isFinite(s.nextVisit)||!Number.isInteger(s.rotation)||!PEOPLE[s.worker]||!PEOPLE[s.selected])throw new Error('지원하지 않는 세이브 파일이에요.');
  for(const k of ['visits','events','logs','tasks','bubbles'])if(!Array.isArray(s[k])||s[k].length>1000)throw new Error('세이브 구조가 올바르지 않아요.');
  for(const k of ['actors','stock','memories','relations','seenVisits'])if(!s[k]||typeof s[k]!=='object'||Array.isArray(s[k]))throw new Error('세이브 정보가 없어요.');
  if(!Number.isFinite(s.visitors)||s.visitors<0||!['store','doyun','returned'].includes(s.umbrella))throw new Error('진행 정보가 올바르지 않아요.');
  for(const key of Object.keys(PRODUCTS))if(!Number.isFinite(s.stock[key])||s.stock[key]<0)throw new Error('재고 정보가 올바르지 않아요.');
  for(const [id,a]of Object.entries(s.actors)){if(!PEOPLE[id]||a.id!==id||!Number.isFinite(a.x)||!Number.isFinite(a.y)||a.x<0||a.x>768||a.y<0||a.y>560||!Number.isFinite(a.walk)||!['up','down','left','right'].includes(a.direction)||!Array.isArray(a.path)||a.path.length>500||a.path.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||!floorCell(Math.floor(p.x/32),Math.floor(p.y/32)))||typeof a.state!=='string'||(!['yuna','jae'].includes(id)&&!PRODUCTS[a.product]))throw new Error('인물 정보가 올바르지 않아요.');}
  if(!s.actors[s.worker])throw new Error('근무 정보가 없어요.');
  for(const p of Object.keys(PEOPLE)){
    if(!Array.isArray(s.memories[p])||s.memories[p].length>1000||!s.relations[p]||typeof s.relations[p]!=='object')throw new Error('기억 정보가 올바르지 않아요.');
    if(s.memories[p].some(m=>typeof m.text!=='string'||typeof m.type!=='string'))throw new Error('기억 정보가 올바르지 않아요.');
    for(const [id,n]of Object.entries(s.relations[p]))if(!PEOPLE[id]||!Number.isFinite(n)||n<0||n>100)throw new Error('관계 정보가 올바르지 않아요.');
  }
  const seenMembers=new Set();
  for(const v of s.visits){
    if(typeof v.id!=='string'||!Number.isFinite(v.at)||!Array.isArray(v.members)||!v.members.length||v.members.some(id=>!s.actors[id]||s.actors[id].visitId!==v.id||seenMembers.has(id))||!['shopping','queue','checkout','leaving'].includes(v.stage)||(['checkout','leaving'].includes(v.stage)&&!['yuna','jae'].includes(v.worker)))throw new Error('방문 정보가 올바르지 않아요.');
    for(const id of v.members)seenMembers.add(id);
  }
  for(const l of [...s.logs,...s.bubbles])if(!PEOPLE[l.speaker]||typeof l.text!=='string'||l.text.length>60||(l.target&&!PEOPLE[l.target]))throw new Error('대화 정보가 올바르지 않아요.');
  for(const e of s.events)if(typeof e.title!=='string'||typeof e.detail!=='string')throw new Error('사건 정보가 올바르지 않아요.');
  for(const t of s.tasks)if(!Number.isFinite(t.due)||!['line','removeWorker','loanUmbrella','returnUmbrella','friendMemory','kindMemory','purchase'].includes(t.type)||(t.type==='line'&&(!PEOPLE[t.speaker]||typeof t.text!=='string'))||(t.worker&&!PEOPLE[t.worker]))throw new Error('예약 정보가 올바르지 않아요.');
  s.bubbles=[];return s;
}
