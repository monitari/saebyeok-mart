// Spatial preferences use only this person's relations and people currently nearby.
import {center,isInside} from './world.js';

export function socialPull(s,from,to){
  const r=s.relations[from]?.[to];if(!r)return 0;
  if(r.griev>=20)return -Math.min(8,r.griev/8);
  if(r.fam>=10&&r.trust<20)return -3;
  if((r.bond??0)>=12&&r.trust>=40)return Math.min(6,1+r.bond/15+r.grat/40);
  if(r.grat>=30&&r.trust>=35)return 2;
  return 0;
}
export function rankSeats(s,a,cells){
  const others=Object.values(s.actors).filter(b=>b.id!==a.id&&b.role==='customer'&&isInside(b)&&b.cur?.t==='eat'&&b.phase===2&&Math.hypot(a.x-b.x,a.y-b.y)<=224);
  return cells.map((cell,index)=>{
    const point=center(cell[0],cell[1]);let score=-index*.0001,reason=null,weight=0;
    for(const b of others){
      const pull=socialPull(s,a.id,b.id),distance=Math.hypot(point.x-b.x,point.y-b.y),effect=pull*Math.max(0,1-distance/160);
      score+=effect;
      if(Math.abs(effect)>weight){weight=Math.abs(effect);reason={kind:pull>0?'near':'away',person:b.id};}
    }
    // Describe avoidance even when the chosen seat is beyond the uncomfortable person's influence.
    if(!reason){const avoid=others.find(b=>socialPull(s,a.id,b.id)<0);if(avoid)reason={kind:'away',person:avoid.id};}
    return {cell,score,reason,index};
  }).sort((a,b)=>b.score-a.score||a.index-b.index);
}
export function groupWaitLimit(s,a,others){
  const p=s.people[a.id],base=8+p.genes.temperament.patience/8;
  const pulls=others.map(id=>socialPull(s,a.id,id)),close=pulls.some(v=>v>=2),uneasy=pulls.some(v=>v<0);
  const hurry=p.status.hurry>70?.7:1;
  return Math.max(6,Math.min(35,base*(uneasy?.65:close?1.5:1)*hurry));
}
