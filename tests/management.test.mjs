import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,step,stockAudit,placeOrder,approveDraft,requestRestock,decideRequest,restockOption,canWorkerOrder,startVisit,startConversation} from '../web/js/sim/sim.js';
import {createDraft,setOrderMode,productStatus,recommendations,orderAllowance,nextDelivery,activeSchedule,neighborhoodBias,closeManagementDay,newDay} from '../web/js/sim/management.js';
import {exportText,parseSave} from '../web/js/storage/save.js';
import {PRODUCTS} from '../web/js/sim/data.js';
import {center,FIXTURES} from '../web/js/sim/world.js';
const run=(s,n)=>{for(let i=0;i<n;i++)step(s,.1);};
const atThree=s=>{s.clock=1620-.05;s.day=2;s.sales.day=2;s.management.today.day=2;s.orders.lastAutoDay=1;s.orders.lastDeliveryDay=1;s.director.nextAt=1e9;s.director.story=[];};
const audit=s=>{for(const [p,a]of Object.entries(stockAudit(s)))assert.equal(a.actual,a.expected,p);};

test('automatic order respects cash reserve, daily budget, product overrides, and runs once at 03:00',()=>{
  const s=initialState();s.management.budget=3000;s.management.reserve=s.money-2000;
  setOrderMode(s,'manual','lunchbox');atThree(s);step(s,.1);
  assert.ok(s.management.spent<=2000);assert.equal(s.orders.pending.lunchbox??0,0);
  const pending=structuredClone(s.orders.pending);run(s,10);assert.deepEqual(s.orders.pending,pending);
  const fresh=initialState(),money=fresh.money;step(fresh,.1);assert.equal(fresh.money,money,'night opening does not retrospectively run a morning order');
});

test('manual and approval modes do not let a worker secretly order or promise stock',()=>{
  for(const mode of ['manual','approval']){
    const s=initialState();setOrderMode(s,mode);atThree(s);const money=s.money;step(s,.1);
    assert.equal(s.money,money);assert.deepEqual(s.orders.pending,{});
    assert.equal(restockOption(s,'lunchbox'),'request');assert.equal(canWorkerOrder(s,'lunchbox',2),false);
    assert.equal(placeOrder(s,'lunchbox',2,'yuna'),false);
    assert.equal(!!s.management.draft,mode==='approval');
  }
  const s=initialState();setOrderMode(s,'manual');setOrderMode(s,'auto','lunchbox');atThree(s);step(s,.1);
  assert.ok(s.orders.pending.lunchbox>0);assert.equal(Object.keys(s.orders.pending).length,1);
});

test('approval is atomic, editable, rejects stale pending quantities and cannot be double charged',()=>{
  const s=initialState();setOrderMode(s,'approval');createDraft(s);s.management.draft.items={coffee:2,lunchbox:1};
  const cost=PRODUCTS.coffee.cost*2+PRODUCTS.lunchbox.cost,money=s.money;
  s.management.budget=cost-1;assert.equal(approveDraft(s).ok,false);assert.equal(s.money,money);assert.deepEqual(s.orders.pending,{});
  s.management.budget=cost;assert.equal(approveDraft(s).ok,true);assert.equal(s.money,money-cost);assert.equal(s.management.draft,null);
  assert.equal(approveDraft(s).ok,false);assert.equal(s.money,money-cost);
  createDraft(s);placeOrder(s,'coffee',1);const before=s.money;assert.equal(approveDraft(s).ok,false);assert.equal(s.money,before);
});

test('recommendations distinguish shelf refill from stock shortage and count incoming/carrying units',()=>{
  const s=initialState();s.shelf.coffee=0;s.back.coffee=8;s.orders.par.coffee=10;
  s.actors[s.onDuty].holding={p:'coffee',n:2};let r=productStatus(s,'coffee');assert.equal(r.status,'refill');assert.equal(r.need,0);assert.equal(r.carrying,2);
  s.actors[s.onDuty].holding=null;s.back.coffee=0;s.orders.pending.coffee=10;r=productStatus(s,'coffee');assert.equal(r.need,0);assert.equal(r.pending,10);
  assert.ok(recommendations(s).reduce((n,r)=>n+r.qty*PRODUCTS[r.p].cost,0)<=orderAllowance(s));
  assert.equal(nextDelivery(s),1860);s.clock=1800;s.day=2;assert.equal(nextDelivery(s),1860);
});

test('request approval orders and reserves a real unit without teaching absent people; collection completes it',()=>{
  const s=initialState();setOrderMode(s,'manual');s.director.story=[];s.director.nextAt=1e9;
  const r=requestRestock(s,'yuna','doyun','lunchbox');assert.equal(requestRestock(s,'yuna','doyun','lunchbox'),r);
  const memories=JSON.stringify(s.memories),money=s.money;assert.equal(decideRequest(s,r.id,true),true);
  assert.equal(JSON.stringify(s.memories),memories);assert.equal(s.money,money-PRODUCTS.lunchbox.cost);assert.equal(decideRequest(s,r.id,true),false);
  s.clock=1859.95;s.day=2;s.sales.day=2;s.management.today.day=2;step(s,.1);
  const hold=s.holds.find(h=>h.obligationId===r.obligationId);assert.ok(hold);assert.equal(s.back.lunchbox,1);audit(s);
  startVisit(s,['doyun'],null,{inside:true});const a=s.actors.doyun;
  a.plan=[{t:'shop',p:'lunchbox'},{t:'checkout'},{t:'leave'}];a.cur=null;a.phase=0;a.budget=20000;s.people.doyun.genes.life.favorites=['lunchbox'];
  run(s,1500);assert.equal(r.status,'fulfilled');assert.ok(s.obligations.find(o=>o.id===r.obligationId)?.status==='kept');audit(s);
});

test('manual mode answers an actual repeated shortage with a request, never a false promise',()=>{
  const s=initialState();setOrderMode(s,'manual');s.director.story=[];s.director.nextAt=1e9;
  const a=s.actors.minseo;Object.assign(a,{...center(...FIXTURES.counter.access[0]),path:[],goal:null,cur:null,plan:[{t:'checkout'},{t:'leave'}],cart:[],errands:[{type:'soldoutAgain',p:'lunchbox'}],phase:0});
  run(s,600);
  assert.ok(s.management.requests.some(r=>r.customer==='minseo'&&r.p==='lunchbox'));
  assert.ok(s.log.some(l=>l.text==='발주 요청을 남겨둘게요.'));assert.equal(s.orders.pending.lunchbox??0,0);
});

test('old saves retain automation intent, new policies and requests survive restoration, invalid imports fail',()=>{
  const s=initialState();setOrderMode(s,'approval');setOrderMode(s,'manual','coffee');createDraft(s);requestRestock(s,'yuna','doyun','coffee');
  assert.deepEqual(parseSave(exportText(s)).management,s.management);
  const old=JSON.parse(exportText(s));delete old.state.management;old.state.orders.auto=false;
  assert.equal(parseSave(JSON.stringify(old)).management.mode,'manual');
  for(const mutate of [m=>m.mode='nonsense',m=>m.budget=-1,m=>m.draft.items.coffee=Infinity,m=>m.requests[0].customer='missing']){
    const copy=JSON.parse(exportText(s));mutate(copy.state.management);assert.throws(()=>parseSave(JSON.stringify(copy)),/운영/);
  }
});

test('a week in each order mode preserves books, bounded forecasts and deterministic save continuation',()=>{
  for(const mode of ['auto','approval','manual']){
    const s=initialState(42);setOrderMode(s,mode);run(s,1440*7*10);audit(s);
    assert.ok(s.management.history.length<=7);assert.ok(s.management.requests.length<=40);
    const copy=parseSave(exportText(s));run(s,20);run(copy,20);assert.deepEqual(s.management,copy.management);assert.equal(s.money,copy.money);
    const expenses=s.stats.totals?.expense??0;assert.equal(s.money,300000+(s.stats.totals?.sale??0)-(s.stats.totals?.order??0)-expenses);
  }
});

test('neighborhood news changes only the advertised days and relevant customers',()=>{
  const s=initialState();assert.equal(activeSchedule(s),null);s.day=4;s.clock=3*1440+18*60;
  assert.ok(activeSchedule(s));const teen=Object.values(s.people).find(p=>p.genes.appearance.age==='teen');assert.ok(neighborhoodBias(s,teen)>1);
  s.day=7;assert.equal(activeSchedule(s),null);
});

test('an already composed response rechecks ordering policy at the moment it is spoken',()=>{
  const s=initialState();s.director.story=[];s.director.nextAt=1e9;s.conversations=[];
  startConversation(s,'checkout',[{sp:'yuna',to:'minseo',decider:['restockAnswer','yuna','lunchbox'],choices:[
    {id:'promise',k:'restock_promise',allowed:true,effect:['restockPromise','yuna','minseo','lunchbox']},
    {id:'request',k:'restock_none',literal:'발주 요청을 남겨둘게요.',noAi:true,allowed:false,effect:['requestRestock','yuna','minseo','lunchbox']}
  ]}],{members:['yuna','minseo']});
  setOrderMode(s,'manual');run(s,30);
  assert.ok(s.management.requests.some(r=>r.customer==='minseo'));assert.equal(s.orders.pending.lunchbox??0,0);
  assert.ok(s.log.some(l=>l.text==='발주 요청을 남겨둘게요.'));
});

test('uncollected reservations release held stock without inventing knowledge or losing inventory',()=>{
  const s=initialState();const r=requestRestock(s,'yuna','doyun','coffee');decideRequest(s,r.id,true);
  const o=s.obligations.find(o=>o.id===r.obligationId);s.holds.push({id:'testhold',p:'coffee',for:'doyun',obligationId:o.id,day:o.dueDay});
  s.clock=(o.dueDay+3)*1440;const memories=JSON.stringify(s.memories);closeManagementDay(s);
  assert.equal(r.status,'expired');assert.equal(s.holds.length,0);assert.equal(JSON.stringify(s.memories),memories);audit(s);
});

test('waste reduces fresh-food recommendations but a zero target always stops replenishment',()=>{
  const s=initialState(),day=newDay(1);day.sold.lunchbox=2;day.waste.lunchbox=5;s.management.history=[day];s.orders.par.lunchbox=10;
  const r=productStatus(s,'lunchbox');assert.equal(r.target,3);assert.equal(r.wasteAdjusted,true);
  s.orders.par.lunchbox=0;assert.equal(productStatus(s,'lunchbox').need,0);
  assert.equal(placeOrder(s,'coffee',1.5),false);
});

test('worker priorities change the next task while serving queues and dangerous wet floors first',()=>{
  const setup=priority=>{const s=initialState();s.director.story=[];s.director.nextAt=1e9;s.conversations=[];s.checkout=null;s.queue=[];
    for(const id of Object.keys(s.actors))if(id!==s.onDuty)delete s.actors[id];s.visits=[];
    s.shelf.coffee=0;s.back.coffee=8;s.trash=[{id:'t',cell:FIXTURES.table.access[0],kind:'cup',at:s.clock}];s.management.priority=priority;s.wetness=.1;s.actors[s.onDuty].job=null;return s;};
  const stock=setup('stock');step(stock,.1);assert.equal(stock.actors[stock.onDuty].job.type,'restock');
  const clean=setup('clean');step(clean,.1);assert.equal(clean.actors[clean.onDuty].job.type,'clean');
  for(const p of ['stock','clean']){const s=setup(p);s.wetness=.9;step(s,.1);assert.equal(s.actors[s.onDuty].job.type,'mop');}
});
