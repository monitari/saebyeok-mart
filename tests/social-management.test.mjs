import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,step,startVisit,spawnWorker,stockAudit,setFacility,START_MONEY} from '../dist/sim.js';
import {rankSeats,socialPull,groupWaitLimit} from '../dist/social-space.js';
import {workerStyle} from '../dist/worker-style.js';
import {stockRows,applyStockBatch,recommendationReasons} from '../dist/stock-tools.js';
import {setFavorite,productStatus,newDay} from '../dist/management.js';
import {FIXTURES,center} from '../dist/world.js';
import {exportText,parseSave,MAX_IMPORT_BYTES} from '../dist/save.js';
const run=(s,minutes)=>{for(let i=0;i<minutes*10;i++)step(s,.1);};
const audit=s=>{for(const [p,a]of Object.entries(stockAudit(s)))assert.equal(a.actual,a.expected,p);};
function quiet(worker='yuna'){
  const s=initialState(42);s.clock=1440+900;s.day=2;s.sales.day=2;s.management.today=newDay(2);s.orders.lastAutoDay=2;s.orders.lastDeliveryDay=2;
  s.actors={};s.visits=[];s.conversations=[];s.pending=[];s.queue=[];s.checkout=null;s.reserved={};s.director.story=[];s.director.nextAt=1e9;
  s.weather={kind:'clear',intensity:0,nextAt:1e9};s.wetness=.1;s.onDuty=worker;spawnWorker(s,worker,true);return s;
}
function seated(s,id,cell){
  startVisit(s,[id],null,{inside:true});const a=s.actors[id];
  Object.assign(a,center(...cell),{cur:{t:'eat',p:'kimbap'},phase:2,t:1e9,spot:cell,path:[],plan:[],goal:center(...cell)});
  s.reserved[`cell:${cell[0]},${cell[1]}`]=id;return a;
}
function relation(s,from,to,griev=0){s.relations[from][to]={fam:60,trust:70,bond:45,grat:0,griev};}

test('seat preferences use only the chooser’s relations and people they can currently see nearby',()=>{
  const s=quiet();s.facilities.extraTable=true;seated(s,'harin',FIXTURES.table.access[1]);
  startVisit(s,['minseo'],null,{inside:true});const a=s.actors.minseo;Object.assign(a,center(20,6));
  const cells=[FIXTURES.table.access[0],FIXTURES.table2.access[0]];
  relation(s,'minseo','harin');relation(s,'harin','minseo',80);
  const snapshot=JSON.stringify(s);assert.deepEqual(rankSeats(s,a,cells)[0].cell,cells[0]);assert.ok(socialPull(s,'minseo','harin')>0);assert.equal(JSON.stringify(s),snapshot);
  relation(s,'minseo','harin',70);assert.deepEqual(rankSeats(s,a,cells)[0].cell,cells[1]);
  s.actors.harin.y=17*32;assert.equal(rankSeats(s,a,cells)[0].reason,null);
});

test('actually sitting beside or away from a person leaves a private, accurate memory and never reserves an occupied seat',()=>{
  for(const griev of [0,70]){
    const s=quiet();s.facilities.extraTable=true;const b=seated(s,'harin',FIXTURES.table.access[1]);
    startVisit(s,['minseo'],null,{inside:true});const a=s.actors.minseo;Object.assign(a,center(20,6),{plan:[{t:'eat',p:'kimbap'},{t:'leave'}],cur:null,phase:0});relation(s,'minseo','harin',griev);
    const before=JSON.stringify(s.memories.harin.filter(m=>m.topic==='social_space'));
    for(let i=0;i<150&&!s.memories.minseo.some(m=>m.topic==='social_space');i++)step(s,.1);
    assert.ok(s.memories.minseo.some(m=>m.key===`seat:${griev?'away':'near'}:harin`&&m.source==='self'));
    assert.notDeepEqual(a.spot,b.spot);assert.equal(JSON.stringify(s.memories.harin.filter(m=>m.topic==='social_space')),before);
    assert.equal(a.socialChoice.kind,griev?'away':'near');assert.doesNotThrow(()=>parseSave(exportText(s)));
  }
  const s=quiet();seated(s,'harin',FIXTURES.table.access[1]);startVisit(s,['minseo'],null,{inside:true});
  const a=s.actors.minseo;Object.assign(a,center(16,6),{plan:[{t:'eat',p:'kimbap'}],cur:null,phase:0});relation(s,'minseo','harin');step(s,.1);
  assert.equal(a.socialChoice.kind,'near');delete s.actors.harin;run(s,8);
  assert.equal(s.memories.minseo.some(m=>m.key==='seat:near:harin'),false,'a departed person was not there when the chooser sat down');
});

test('a close group member waits longer, a grievance shortens the wait, and hurry still matters',()=>{
  const times=[];
  for(const griev of [0,70]){
    const s=quiet();startVisit(s,['minseo','harin'],'friends',{inside:true});relation(s,'minseo','harin',griev);
    const a=s.actors.minseo,b=s.actors.harin;
    Object.assign(a,{plan:[{t:'regroup'},{t:'leave'}],cur:null,phase:0});
    Object.assign(b,center(...FIXTURES.table.access[0]),{cur:{t:'eat',p:'kimbap'},phase:2,t:1e9,plan:[],path:[]});
    const limit=groupWaitLimit(s,a,['harin']);times.push(limit);
    run(s,20);assert.equal(a.cur?.t==='regroup',griev===0);
  }
  assert.ok(times[0]>times[1]);
  const s=quiet();startVisit(s,['minseo'],null,{inside:true});relation(s,'minseo','harin');const a=s.actors.minseo;
  s.people.minseo.status.hurry=20;const calm=groupWaitLimit(s,a,['harin']);s.people.minseo.status.hurry=90;assert.ok(groupWaitLimit(s,a,['harin'])<calm);
});

test('workers start routine stocking and cleaning at different points while urgent service keeps precedence',()=>{
  const chosen={};
  for(const id of ['yuna','taeo']){
    const s=quiet(id);s.shelf.coffee=4;s.back.coffee=8;step(s,.1);chosen[id]=s.actors[id].job?.type;
  }
  assert.equal(chosen.yuna,'restock');assert.notEqual(chosen.taeo,'restock');
  assert.equal(workerStyle(quiet().people.yuna).strongest,'stocking');assert.equal(workerStyle(quiet().people.jae).strongest,'checkout');
  const wet=quiet();wet.wetness=.49;step(wet,.1);assert.equal(wet.actors.yuna.job.type,'mop');
  const busy=quiet();busy.management.priority='stock';busy.shelf.coffee=0;busy.back.coffee=10;
  startVisit(busy,['minseo'],null,{inside:true});busy.interior.kiosk.by='minseo';busy.interior.kiosk.error=true;step(busy,.1);assert.equal(busy.actors.yuna.job.type,'helpKiosk');
});

test('batch changes validate the whole selection, affect only selected products, and never spend money',()=>{
  const s=initialState(),money=s.money,memories=JSON.stringify(s.memories);
  assert.ok(applyStockBatch(s,['coffee','water'],'mode','manual').ok);assert.equal(s.management.overrides.coffee,'manual');assert.equal(s.management.overrides.milk,undefined);
  assert.ok(applyStockBatch(s,['coffee','water'],'par',23).ok);assert.equal(s.orders.par.coffee,23);assert.equal(s.orders.par.water,23);
  const snapshot=JSON.stringify(s);
  for(const [ids,action,value]of [[['coffee','missing'],'par',5],[['coffee'],'par',-1],[['coffee'],'mode','invalid'],[['coffee','cigaretteBlue'],'mode','auto']]){
    assert.equal(applyStockBatch(s,ids,action,value).ok,false);assert.equal(JSON.stringify(s),snapshot);
  }
  assert.equal(s.money,money);assert.equal(JSON.stringify(s.memories),memories);
  assert.ok(applyStockBatch(s,['coffee','coffee'],'mode','inherit').ok);assert.equal(s.management.overrides.coffee,undefined);
});

test('favorites persist, remain bounded, and filters and recommendation reasons reflect real stock including reservations',()=>{
  const s=initialState();assert.ok(applyStockBatch(s,['coffee','water'],'favorite',true).ok);
  assert.deepEqual(stockRows(s,{stockFilter:'favorites'}).map(r=>r.p).sort(),['coffee','water']);
  const before=[...s.management.favorites];assert.equal(applyStockBatch(s,Object.keys(s.shelf).slice(0,12),'favorite',true).ok,false);assert.deepEqual(s.management.favorites,before);
  assert.deepEqual(parseSave(exportText(s)).management.favorites,before);
  const old=JSON.parse(exportText(s));delete old.state.management.favorites;assert.deepEqual(parseSave(JSON.stringify(old)).management.favorites,[]);
  const invalid=JSON.parse(exportText(s));invalid.state.management.favorites=['missing'];assert.throws(()=>parseSave(JSON.stringify(invalid)),/운영/);
  s.holds.push({p:'coffee'});s.orders.pending.coffee=2;const reasons=recommendationReasons(s,productStatus(s,'coffee')).join(' ');assert.match(reasons,/예약 1개/);assert.match(reasons,/주문한 2개/);
  assert.ok(setFavorite(s,'coffee',false));assert.deepEqual(s.management.favorites,['water']);
});

test('thirty days preserve stock, money, bounded records and save continuation with the new preferences',()=>{
  const s=initialState(20261022);setFacility(s,'welcomeMat',true);setFavorite(s,'coffee',true);setFavorite(s,'water',true);
  for(let day=0;day<30;day++){
    run(s,1440);audit(s);assert.ok(s.events.length<=500);assert.ok(s.management.history.length<=7);
    for(const list of Object.values(s.memories)){assert.ok(list.length<=80);if(list.length>40)assert.ok(list.every(m=>!m.resolved||m.core===true||m.kind==='conflict'&&!m.reconciled),'only protected memories may exceed the soft cap');}
    assert.equal(s.money,START_MONEY+(s.stats.totals.sale??0)-(s.stats.totals.order??0)-(s.stats.totals.expense??0));
  }
  const text=exportText(s);assert.ok(Buffer.byteLength(text,'utf8')<MAX_IMPORT_BYTES);const copy=parseSave(text);
  run(s,20);run(copy,20);assert.equal(s.rng,copy.rng);assert.equal(s.money,copy.money);assert.deepEqual(s.management,copy.management);audit(copy);
});
