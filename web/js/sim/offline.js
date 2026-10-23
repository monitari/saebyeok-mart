// Pure economic plan. Story time and NPC memories remain where the player left them.
import { PRODUCTS } from './data.js';
export const OFFLINE_CAP_MS=8*60*60*1000;
export function offlinePlan(s,now,from=s.savedAt){
  const start=Math.max(Number.isFinite(from)?from:now,s.offlineSettledAt??0);
  const duration=Math.max(0,Math.min(OFFLINE_CAP_MS,now-start));
  if(duration<60000)return {duration:0,items:[]};
  let count=Math.min(60,Math.floor(duration/60000/5));
  const keys=Object.keys(PRODUCTS).filter(p=>!PRODUCTS[p].staffOnly&&!PRODUCTS[p].counter&&!PRODUCTS[p].adult&&(!PRODUCTS[p].facility||s.facilities[PRODUCTS[p].facility]));
  const left={...s.shelf},items=[];
  for(let round=0;count>0&&round<500;round++){
    const p=keys[(s.seed+round)%keys.length];if(left[p]>0){left[p]--;count--;items.push(p);}
  }
  return {duration,items};
}
