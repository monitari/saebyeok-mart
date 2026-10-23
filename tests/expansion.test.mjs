import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState,step,startVisit,stockAudit,settleOffline,setFacility,eligibleForTobacco,advanceDialogueTime,resolvePending } from '../web/js/sim/sim.js';
import { exportText,parseSave } from '../web/js/storage/save.js';
import { WriterLease } from '../web/js/storage/lease.js';
import { pinMoment,MOMENT_CAP } from '../web/js/mind/moments.js';
import { parseResult,probeModel,DialogueService } from '../web/js/dialogue/ai.js';
import { weeklyLife,effectiveLife } from '../web/js/sim/life.js';
const advance=(s,m)=>{for(let i=0;i<m*10;i++)step(s,.1);};
const balance=s=>300000+(s.stats.totals?.sale??0)-(s.stats.totals?.order??0)-(s.stats.totals?.expense??0);

test('two tabs cannot hold the writer lease together; closing the writer permits recovery',async()=>{
  let held=false;
  const locks={async request(name,options,fn){if(held)return fn(null);held=true;try{return await fn({name});}finally{held=false;}}};
  const first=new WriterLease(locks),second=new WriterLease(locks);
  assert.equal(await first.acquire(),true);assert.equal(await second.acquire(),false);
  first.release();await first.task;assert.equal(await second.acquire(),true);second.release();await second.task;
});

test('offline income is capped, idempotent, auditable, and never creates NPC memories or tobacco sales',()=>{
  const s=initialState(),social=JSON.stringify([s.clock,s.memories,s.relations,s.obligations]);s.savedAt=1000;
  s.facilities.tobaccoSales=true;s.shelf.cigaretteBlue=8;s.counts.cigaretteBlue.start=8;
  const r=settleOffline(s,1000+86400000);
  assert.equal(r.duration,8*3600000);assert.ok(r.revenue>0);assert.equal(s.counts.cigaretteBlue.sold,0);
  const money=s.money;settleOffline(s,1000+86400000);assert.equal(s.money,money);
  assert.equal(JSON.stringify([s.clock,s.memories,s.relations,s.obligations]),social);
  for(const value of Object.values(stockAudit(s)))assert.equal(value.actual,value.expected);
  assert.equal(s.money,balance(s));assert.doesNotThrow(()=>parseSave(exportText(s)));
});

test('tobacco is sold only after the game verifies an adult with ID; missing ID and minors are refused',()=>{
  const run=(id,hasId)=>{
    const s=initialState();s.actors={yuna:s.actors.yuna};s.visits=[];s.conversations=[];s.pending=[];s.queue=[];s.director.story=[];s.director.nextAt=1e9;
    s.facilities.tobaccoSales=true;s.shelf.cigaretteBlue=8;s.counts.cigaretteBlue.start=8;
    startVisit(s,[id],null,{inside:true,hasId,requestTobacco:'cigaretteBlue'});advance(s,110);
    return s;
  };
  const adult=run('doyun',true);assert.ok(adult.counts.cigaretteBlue.sold>0);assert.ok(adult.events.some(e=>e.type==='tobacco_check'));
  assert.equal(run('doyun',false).counts.cigaretteBlue.sold,0);assert.equal(run('minjun',true).counts.cigaretteBlue.sold,0);
  assert.equal(eligibleForTobacco(adult.people.haeun),false);
  for(const v of Object.values(stockAudit(adult)))assert.equal(v.actual,v.expected);
});

test('weekly life changes expire, introduce a neighbor and later form a new group without leaking facts',()=>{
  const s=initialState();s.day=8;weeklyLife(s);const p=Object.values(s.people).find(p=>p.lifeChange);
  assert.ok(p);assert.ok(s.people.week2);assert.equal(p.lifeChange.toldTo.length,0);
  assert.deepEqual(effectiveLife({...s,day:p.lifeChange.end},p),p.genes.life);
  s.day=15;weeklyLife(s);assert.ok(s.people.week3);assert.ok(s.groups.some(g=>g.id==='walk3'));
  const people=Object.keys(s.people).length;weeklyLife(s);assert.equal(Object.keys(s.people).length,people);
});

test('installed facilities cost once and daily operation expenses appear in the ledger and journal',()=>{
  const s=initialState(),before=s.money;
  assert.equal(setFacility(s,'welcomeMat',true),true);assert.equal(s.money,before-8000);
  setFacility(s,'welcomeMat',false);setFacility(s,'welcomeMat',true);assert.equal(s.money,before-8000);
  advance(s,180);assert.ok(s.journal.length);assert.ok(s.stats.totals.expense>=20000);assert.equal(s.money,balance(s));
});

test('pinned recordings survive pruning and use historical appearance, not current clothing',()=>{
  const s=initialState();advance(s,80);const m=s.moments.find(m=>m.confirmed);assert.ok(m);
  assert.equal(pinMoment(s,m.id),true);const look=structuredClone(m.looks);
  const person=s.people[m.actors[0]];person.genes.appearance.top.color='#ffffff';
  advance(s,1440*4);assert.ok(s.moments.some(x=>x.id===m.id));assert.deepEqual(m.looks,look);
  assert.ok(s.moments.length<=MOMENT_CAP);assert.doesNotThrow(()=>parseSave(exportText(s)));
});

test('dispatched model lines have a real-time budget independent of simulation acceleration',()=>{
  const s=initialState();s.aiMode='ollama';let p;
  for(let i=0;i<300&&!p;i++){step(s,.1);p=s.pending[0];}
  assert.ok(p);p.dispatched=true;
  advance(s,5);assert.ok(s.pending.includes(p),'game minutes do not exhaust a real-time budget');
  advanceDialogueTime(s,8.6);assert.ok(!s.pending.includes(p));assert.equal(resolvePending(s,p,{say:'네.',action:'say'}),'stale');
});

test('model output rejects foreign language, extra facts, long text and unavailable actions',()=>{
  const req={actions:['say'],slots:{},recent:[]};
  for(const obj of [{say:'了解了。',action:'say'},{say:'500원이에요.',action:'say'},{say:'네.'.repeat(50),action:'say'},{say:'네.',action:'buy'},{say:'어제도 오셨죠?',action:'say'}])assert.throws(()=>parseResult(JSON.stringify(obj),req));
});

test('connection probe tests generation and catches invalid model output, not just model listing',async()=>{
  let generated=false;
  const fake=async(url)=>url.endsWith('/api/tags')?{ok:true,json:async()=>({models:[{name:'test'}]})}:{ok:true,json:async()=>{generated=true;return {message:{content:'{"say":"네, 알겠어요.","action":"say"}'}};}};
  const result=await probeModel({mode:'ollama',url:'http://localhost',model:'test'},fake);assert.ok(result.ok);assert.ok(generated);assert.equal(result.sample,'네, 알겠어요.');
});

test('changing model settings cancels responses from the previous provider session',async()=>{
  let delivered=0;const svc=new DialogueService({fetchImpl:async()=>{await new Promise(r=>setTimeout(r,15));return {ok:true,json:async()=>({message:{content:'{"say":"네.","action":"say"}'}})};}});
  svc.configure({mode:'ollama',url:'http://localhost',model:'test'});
  const running=svc.run({id:'pending',request:{actions:['say'],slots:{}}},()=>delivered++);
  svc.configure({mode:'rule'});await running;assert.equal(delivered,0);assert.equal(svc.inflight.size,0);
});
