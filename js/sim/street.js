// Outside life has its own random stream: passing traffic never changes store decisions.
import { buildAppearance, validateAppearance } from '../mind/genes.js';

export const STREET_CAP = 8;
export const STREET_ACTIVITY = { walk:'길을 지나가는 중', pair:'나란히 걷는 중', phone:'잠깐 휴대전화를 보는 중', shelter:'처마 아래서 비를 피하는 중', bicycle:'자전거로 지나가는 중' };
export const streetActivity = a => STREET_ACTIVITY[!a.paused&&['phone','shelter'].includes(a.kind)?'walk':a.kind];
const random = t => { t.rng=(t.rng+0x6D2B79F5)>>>0;let r=Math.imul(t.rng^(t.rng>>>15),1|t.rng);r^=r+Math.imul(r^(r>>>7),61|r);return ((r^(r>>>14))>>>0)/4294967296; };
const wet = s => ['rain','storm'].includes(s.weather.kind);
export function streetInterval(s, r=.5) {
  const hour=((s.clock%1440)+1440)%1440/60;
  const base=hour<5?22:hour<7?13:hour<10?5:hour<17?9:hour<22?5:12;
  return base*(.65+r*.7)*(s.weather.kind==='storm'?2:s.weather.kind==='snow'?1.6:wet(s)?1.35:1);
}
export function createStreet(seed, at=0) { return {rng:(seed^0x5f3759df)>>>0,nextId:1,nextAt:at+1,people:[],passed:0}; }
function spawn(s,t,initial=false) {
  const r=random(t), kind=r<.12?'bicycle':r<.32&&!wet(s)?'pair':r<.48?'phone':r<.65&&wet(s)?'shelter':'walk';
  const direction=random(t)<.5?1:-1, y=kind==='bicycle'?563:direction===1?528:547;
  const speed=kind==='bicycle'?82:24+random(t)*14;
  const count=kind==='pair'?2:1;
  if(t.people.length+count>STREET_CAP)return;
  const entry=initial?100+random(t)*550:direction===1?-30:798;
  const pauseX=kind==='shelter'?direction===1?255:454:100+random(t)*560;
  for(let i=0;i<count;i++) {
    const seed=Math.floor(random(t)*4294967296), appearance=buildAppearance(seed,{age:kind==='bicycle'?'adult':undefined});
    t.people.push({id:`street-${t.nextId++}`,appearance,kind,x:entry-i*direction*22,y:y+i*5,dir:direction===1?'right':'left',speed,walk:0,
      umbrella:wet(s)&&kind!=='bicycle'&&kind!=='shelter',pauseX,pauseLeft:kind==='phone'?2+random(t)*3:kind==='shelter'?5+random(t)*9:0,paused:false,stopped:false});
  }
}
export function seedStreet(s) { s.street=createStreet(s.seed,s.clock);spawn(s,s.street,true);spawn(s,s.street,true);return s.street; }
export function tickStreet(s,dt) {
  const t=s.street??seedStreet(s);
  if(s.clock>=t.nextAt){spawn(s,t);t.nextAt=s.clock+streetInterval(s,random(t));}
  for(const a of t.people){
    const sign=a.dir==='right'?1:-1;
    a.paused=false;
    if(a.kind==='shelter'&&!wet(s))a.pauseLeft=0;
    if(a.pauseLeft>0&&!a.stopped&&sign*(a.x-a.pauseX)>=0)a.stopped=true;
    if(a.stopped&&a.pauseLeft>0){a.pauseLeft=Math.max(0,a.pauseLeft-dt);a.paused=true;continue;}
    a.x+=sign*a.speed*dt;a.walk+=a.speed*dt/8;
  }
  const before=t.people.length;t.people=t.people.filter(a=>a.x>=-40&&a.x<=808);t.passed+=before-t.people.length;
}
export function validateStreet(t) {
  const num=v=>Number.isFinite(v), fail=()=>{throw new Error('거리 풍경 정보가 올바르지 않아요.');};
  if(!t||!Number.isInteger(t.rng)||t.rng<0||t.rng>4294967295||!Number.isInteger(t.nextId)||t.nextId<1||!num(t.nextAt)||!Number.isInteger(t.passed)||t.passed<0||!Array.isArray(t.people)||t.people.length>STREET_CAP)fail();
  const ids=new Set();
  for(const a of t.people){
    if(!a||typeof a.id!=='string'||!/^street-\d+$/.test(a.id)||ids.has(a.id)||!Object.hasOwn(STREET_ACTIVITY,a.kind)||!num(a.x)||a.x< -40||a.x>808||!num(a.y)||a.y<520||a.y>568||!num(a.speed)||a.speed<1||a.speed>100||!num(a.walk)||!num(a.pauseX)||!num(a.pauseLeft)||a.pauseLeft<0||a.pauseLeft>20||!['left','right'].includes(a.dir)||typeof a.umbrella!=='boolean'||typeof a.paused!=='boolean'||typeof a.stopped!=='boolean')fail();
    ids.add(a.id);
    const p=a.appearance;if(!p||validateAppearance(p).length||![p.skin,p.hair?.color,p.top?.color,p.bottom?.color].every(v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)))fail();
  }
}
