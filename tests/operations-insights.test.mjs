import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,step,startVisit,stockAudit,setFacility,setPar,placeOrder,settleOffline} from '../dist/sim.js';
import {newDay,closeManagementDay,setOrderMode,createDraft} from '../dist/management.js';
import {operationAlerts,decisionFeedback,returnSummary} from '../dist/operations-insights.js';
import {chooseVisitPurpose} from '../dist/visit-purpose.js';
import {addEvent} from '../dist/memory.js';
import {exportText,parseSave} from '../dist/save.js';

const run=(s,minutes)=>{for(let i=0;i<minutes*10;i++)step(s,.1);};
function quiet(){
  const s=initialState(42);s.clock=1440+9*60;s.day=2;s.sales.day=2;s.management.today=newDay(2);
  s.orders.lastAutoDay=2;s.orders.lastDeliveryDay=2;s.director.story=[];s.director.nextAt=1e9;
  s.conversations=[];s.queue=[];s.checkout=null;s.visits=[];s.reserved={};s.pending=[];
  for(const id of Object.keys(s.actors))if(id!==s.onDuty)delete s.actors[id];
  s.weather={kind:'rain',intensity:1,nextAt:1e9};s.wetness=.1;return s;
}
const audit=s=>{for(const [p,a]of Object.entries(stockAudit(s)))assert.equal(a.actual,a.expected,p);};

test('alerts group one current state per product and move it from decision to waiting without notification growth',()=>{
  const s=initialState();s.shelf.coffee=0;s.back.coffee=0;let g=operationAlerts(s);
  assert.equal(g.now.filter(a=>a.product==='coffee').length,1);
  const snapshot=JSON.stringify(s);assert.deepEqual(operationAlerts(s),g);assert.equal(JSON.stringify(s),snapshot);
  placeOrder(s,'coffee',3);g=operationAlerts(s);assert.equal(g.now.filter(a=>a.product==='coffee').length,0);assert.equal(g.waiting.filter(a=>a.product==='coffee').length,1);
  s.orders.pending.coffee=0;s.back.coffee=3;g=operationAlerts(s);assert.equal(g.waiting.find(a=>a.product==='coffee').label,'진열 대기');
  s.back.coffee=0;setPar(s,'coffee',0);assert.ok(operationAlerts(s).info.some(a=>a.product==='coffee'));
  createDraft(s);assert.ok(operationAlerts(s).now.some(a=>a.id==='draft'));
});

test('decision feedback compares actual completed days and retains evidence after rolling history expires',()=>{
  const s=quiet();s.day=4;s.clock=3*1440+600;s.management.today=newDay(4);
  s.management.history=[1,2,3].map(day=>{const d=newDay(day);d.sold.coffee=2;d.missed.coffee=4;return d;});
  setPar(s,'coffee',24);assert.equal(decisionFeedback(s)[0].comparison,undefined);
  for(let day=4;day<=15;day++){
    s.management.today.day=day;s.management.today.sold.coffee=6;s.management.today.missed.coffee=1;
    s.clock=day*1440;s.day=day;closeManagementDay(s);
  }
  const change=decisionFeedback(s)[0];assert.ok(change.comparison);assert.match(change.detail,/2\.0 → 6\.0/);assert.match(change.detail,/4\.0 → 1\.0/);
  assert.equal(s.management.feedback.changes[0].following.length,3);assert.ok(s.management.history[0].day>change.day);
  assert.deepEqual(parseSave(exportText(s)).management.feedback,s.management.feedback);
  const early=quiet();setPar(early,'coffee',24);
  for(let day=2;day<=4;day++){early.management.today.day=day;early.management.today.sold.coffee=3;early.clock=day*1440;early.day=day;closeManagementDay(early);}
  const post=decisionFeedback(early)[0];assert.ok(post.postOnly);assert.equal(post.comparison,undefined);assert.match(post.detail,/기록이 부족/);
});

test('facility effects count real entry benefits and stop measuring at the end of a usage window',()=>{
  const s=quiet();setFacility(s,'welcomeMat',true);startVisit(s,['doyun'],null,{purpose:'shelter'});
  for(let i=0;i<500&&!s.actors.doyun?.flags.entered;i++)step(s,.1);
  assert.equal(s.management.feedback.totals.rainEntries,1);assert.ok(Math.abs(s.management.feedback.totals.waterBlocked-.028)<1e-8);
  s.day=3;s.clock=2*1440+600;setFacility(s,'welcomeMat',false);
  const before=decisionFeedback(s).find(c=>c.kind==='facility'&&c.after).detail;
  s.management.feedback.totals.waterBlocked+=1;s.management.feedback.totals.rainEntries+=10;
  assert.equal(decisionFeedback(s).find(c=>c.kind==='facility'&&c.after).detail,before);
});

test('return summary separates offline settlement from existing real scenes and is entirely read-only',()=>{
  const s=quiet();const e=addEvent(s,'kind_words',{actors:['yuna'],importance:.6});
  addEvent(s,'arrival',{actors:['doyun'],importance:.1});
  const memories=JSON.stringify(s.memories),count=s.events.length;
  const report=settleOffline(s,1000000,400000),snapshot=JSON.stringify(s);
  const summary=returnSummary(s,report);assert.ok(summary.offline.items>0);assert.ok(summary.scenes.some(x=>x.id===e.id));assert.equal(summary.scenes.length,1);
  assert.equal(JSON.stringify(s),snapshot);assert.equal(JSON.stringify(s.memories),memories);assert.equal(s.events.length,count);audit(s);
  const again=settleOffline(s,1000000,400000);assert.equal(again.items,0);
});

test('ATM, price browsing, shelter and waiting visits leave without a checkout or fabricated purchases',()=>{
  for(const purpose of ['atm','browse','shelter','wait']){
    const s=quiet(),money=s.money,sold=JSON.stringify(s.counts),workerMemory=JSON.stringify(s.memories.yuna);
    startVisit(s,['doyun'],null,{purpose});const actor=s.actors.doyun,initialBudget=actor.budget;
    assert.equal(actor.plan.some(st=>st.t==='shop'||st.t==='checkout'),false);
    run(s,60);assert.equal(s.actors.doyun,undefined,purpose);assert.equal(s.money,money,purpose);assert.equal(JSON.stringify(s.counts),sold,purpose);
    assert.equal(actor.budget,initialBudget+(purpose==='atm'?20000:0));
    assert.equal(s.management.today.visits[purpose],1);assert.equal(s.management.today.outcomes.noPurchase,1);
    assert.ok(s.memories.doyun.some(m=>m.key===`visit:${purpose}`&&m.source==='self'));
    assert.equal(JSON.stringify(s.memories.yuna),workerMemory);audit(s);
  }
});

test('saving during a non-purchase visit preserves its plan, outcome and deterministic continuation',()=>{
  const s=quiet();startVisit(s,['doyun'],null,{purpose:'browse'});run(s,2);
  const copy=parseSave(exportText(s));run(s,60);run(copy,60);
  assert.deepEqual(copy.management,s.management);assert.deepEqual(copy.memories,s.memories);assert.equal(copy.rng,s.rng);audit(copy);
  const old=JSON.parse(exportText(s));delete old.state.management.feedback;
  for(const d of [old.state.management.today,...old.state.management.history]){delete d.visits;delete d.outcomes;}
  const migrated=parseSave(JSON.stringify(old));assert.deepEqual(migrated.management.feedback.changes,[]);assert.deepEqual(migrated.management.today.visits,{});
  for(const mutate of [x=>x.management.feedback.changes.push({kind:'imaginary'}),x=>x.management.feedback.totals.waterBlocked=-1,x=>x.management.today.visits.invented=1]){
    const invalid=JSON.parse(exportText(s));mutate(invalid.state);assert.throws(()=>parseSave(JSON.stringify(invalid)),/운영/);
  }
});

test('natural incidental visits respect obligations, groups, ages and rain, and occur in a normal multi-day run',()=>{
  const s=quiet(),p=s.people.doyun,v={members:['doyun']};
  assert.equal(chooseVisitPurpose(s,p,v,{casual:true},.02),'atm');
  assert.equal(chooseVisitPurpose(s,p,v,{casual:true},.06),'browse');
  assert.equal(chooseVisitPurpose(s,p,v,{casual:true},.11),'shelter');
  s.weather.kind='clear';assert.equal(chooseVisitPurpose(s,p,v,{casual:true},.11),'shopping');
  assert.equal(chooseVisitPurpose(s,p,{members:['doyun','minseo']},{casual:true},.02),'shopping');
  assert.equal(chooseVisitPurpose(s,p,v,{casual:false},.02),'shopping');
  const teen=Object.values(s.people).find(p=>p.genes.appearance.age==='teen');assert.equal(chooseVisitPurpose(s,teen,{members:[teen.id]},{casual:true},.02),'browse');
  const game=initialState(42);setOrderMode(game,'auto');run(game,1440*3);audit(game);
  const days=[...game.management.history,game.management.today];
  assert.ok(days.reduce((n,d)=>n+['atm','browse','shelter','wait'].reduce((a,k)=>a+(d.visits[k]??0),0),0)>0);
  assert.ok(game.management.feedback.changes.length<=12);assert.doesNotThrow(()=>parseSave(exportText(game)));
});
