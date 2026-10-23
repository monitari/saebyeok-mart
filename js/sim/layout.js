import { PRODUCTS } from './data.js';
import { FIXTURES, fixturesFor, LAYOUT_VERSION, SPOTS, center, cellOf, floorCell, nearestFloor, findPath } from './world.js';
const same=(a,b)=>a&&b&&a[0]===b[0]&&a[1]===b[1];
function fixtureOf(a,old){
  if(a.cur?.t==='checkout'&&a.phase>=20)return 'kiosk';
  if(a.cur?.t==='shop'||a.cur?.t==='putBack')return PRODUCTS[a.cur.p]?.fixture;
  if(['eat','hog','doze'].includes(a.cur?.t))return ['table','table2'].find(id=>old[id].access.some(c=>same(c,a.spot)));
  if(a.cur?.t==='heat')return a.cur.via;
  if(a.cur?.t==='brew')return 'coffeeMachine';
  if(a.cur?.t==='atm')return 'atm';
  if(a.cur?.t==='dump')return 'trash';
  if(a.cur?.t==='trash')return !a.cur.kind||a.cur.kind==='general'?'trash':'recycle';
  const j=a.job;if(!j)return null;
  if(j.type==='helpKiosk')return 'kiosk';
  if(j.type==='restock')return j.phase<=1?'storage':PRODUCTS[j.p]?.fixture;
  if(j.type==='box')return j.phase<=1?'boxes':PRODUCTS[a.holding?.p]?.fixture;
  if(j.type==='beans')return j.phase<=1?'storage':'coffeeMachine';
  if(j.type==='curb')return j.phase<=1?'storage':null;
  if(j.type==='emptyBins')return j.phase<=2?'recycle':j.phase===4?'storage':null;
  if(j.type==='stickers')return PRODUCTS[j.list?.[0]]?.fixture;
  return j.fixture;
}
function freePosition(a,opts,used){
  const [x,y]=cellOf(a);
  for(let r=0;r<8;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
    const key=`${x+dx},${y+dy}`;
    if(!used.has(key)&&floorCell(x+dx,y+dy,opts))return center(x+dx,y+dy);
  }
  return nearestFloor(a,opts);
}
export function migrateLayout(s){
  if(s.layoutVersion!==undefined&&![1,2,3,4].includes(s.layoutVersion))return;
  if(!s.actors||!s.facilities)return;
  const oldFixtures=fixturesFor({layoutVersion:s.layoutVersion??1});
  const changed=Object.keys(FIXTURES).filter(id=>JSON.stringify(oldFixtures[id])!==JSON.stringify(FIXTURES[id]));
  const used=new Set();
  for(const a of Object.values(s.actors)){
    if(!a||!Number.isFinite(a.x)||!Number.isFinite(a.y)||!Array.isArray(a.path)||a.path.length>400)continue;
    const opts={staff:a.role==='worker',facilities:s.facilities},id=fixtureOf(a,oldFixtures);
    let target=a.goal;
    if(a.job?.type==='helpKiosk'){
      target=center(...SPOTS.kioskHelp);
      if(a.job.phase>=2){Object.assign(a,target);a.dir=SPOTS.kioskHelp[2];}
    }
    const previous=a.spot??(target&&Number.isFinite(target.x)&&Number.isFinite(target.y)?cellOf(target):null);
    if(changed.includes(id)&&previous){
      const old=oldFixtures[id]?.access.findIndex(c=>same(c,previous))??-1;
      if(old>=0){
        const options=FIXTURES[id].access,preferred=options[old%options.length];
        const seat=!used.has(preferred.slice(0,2).join(','))?preferred:options.find(c=>!used.has(c.slice(0,2).join(',')));
        const reserved=s.reserved?.[`cell:${previous[0]},${previous[1]}`]===a.id;
        if(reserved)delete s.reserved[`cell:${previous[0]},${previous[1]}`];
        const overflow=!seat&&['eat','hog','doze'].includes(a.cur?.t);
        const safe=overflow?freePosition(a,opts,used):null;
        const next=overflow?[...cellOf(safe),a.dir]:seat??options[old%options.length];
        used.add(next.slice(0,2).join(','));
        if(a.spot)a.spot=[...next];if(reserved)s.reserved[`cell:${next[0]},${next[1]}`]=a.id;
        target=center(...next);
        const performing=a.role==='worker'?['restock','clean'].includes(a.anim):a.phase>=2;
        if(performing){a.x=target.x;a.y=target.y;a.dir=next[2]??a.dir;}
        if(overflow){a.t=0;a.dozing=false;if(a.phase<2)a.phase=0;a.anim='idle';}
      }
    }
    if(a.spot&&!floorCell(...a.spot.slice(0,2),opts)){
      const oldSpot=a.spot,oldKey=`cell:${oldSpot[0]},${oldSpot[1]}`,reserved=s.reserved?.[oldKey]===a.id;
      const p=freePosition(center(...oldSpot),opts,used),next=cellOf(p);
      used.add(next.join(','));a.spot=[...next,oldSpot[2]??a.dir];
      if(reserved){delete s.reserved[oldKey];s.reserved[`cell:${next.join(',')}`]=a.id;}
      if(!target||same(cellOf(target),oldSpot))target=p;
    }
    if(!floorCell(...cellOf(a),opts)){const p=nearestFloor(a,opts);a.x=p.x;a.y=p.y;}
    if(target&&Number.isFinite(target.x)&&Number.isFinite(target.y)){
      if(!floorCell(...cellOf(target),opts))target=nearestFloor(target,opts);
      a.goal={...target};a.path=findPath(a,target,opts);
    }else if(a.path.some(p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&!floorCell(...cellOf(p),opts)))a.path=[];
  }
  for(const t of s.trash??[]){
    const id=['table','table2'].find(id=>oldFixtures[id].access.some(c=>same(c,t.cell)));
    if(id){const i=oldFixtures[id].access.findIndex(c=>same(c,t.cell));t.cell=[...FIXTURES[id].access[i%FIXTURES[id].access.length]];}
  }
  for(const l of s.nuisance?.litter??[])if(!floorCell(...l.cell,{staff:true,facilities:s.facilities}))l.cell=cellOf(nearestFloor(center(...l.cell),{staff:true,facilities:s.facilities}));
  for(const key of Object.keys(s.reserved??{}))if(key.startsWith('cell:')){
    const [x,y]=key.slice(5).split(',').map(Number);
    if(!floorCell(x,y,{staff:true,facilities:s.facilities}))delete s.reserved[key];
  }
  s.momentBuffer=[];s.layoutVersion=LAYOUT_VERSION;
}
