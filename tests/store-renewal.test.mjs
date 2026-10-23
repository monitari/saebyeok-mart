import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,startVisit,step,stockAudit,registerFor,startConversation} from '../web/js/sim/sim.js';
import {PRODUCTS} from '../web/js/sim/data.js';
import {parseSave,exportText} from '../web/js/storage/save.js';
import {FIXTURES,fixturesFor,center,floorCell,LAYOUT_VERSION} from '../web/js/sim/world.js';
import {sceneNodes,hitTestScene} from '../web/js/render/art-quarter.js';
import {project} from '../web/js/render/projection.js';
import {orderSceneNodes} from '../web/js/render/depth-order.js';
import {phrase,allTemplateSamples} from '../web/js/dialogue/dialogue.js';
import {lintLine} from '../web/js/dialogue/lint.js';
import {witnessesAt} from '../web/js/mind/memory.js';
import {paymentReceipt} from '../web/js/sim/payments.js';
import {parseResult} from '../web/js/dialogue/ai.js';
import {momentView} from '../web/js/mind/moments.js';
const run=(s,n)=>{for(let i=0;i<n*10;i++)step(s,.1);};
const until=(s,p,n=60)=>{for(let i=0;i<n*10;i++){step(s,.1);if(p(s))return true;}return false;};
function quiet(){const s=initialState();s.actors={yuna:s.actors.yuna};s.visits=[];s.queue=[];s.checkout=null;s.conversations=[];s.pending=[];s.reserved={};s.director.story=[];s.director.nextAt=1e9;s.interior.baskets={stack:6,counter:0};s.weather.kind='clear';return s;}
function audit(s){for(const [p,v]of Object.entries(stockAudit(s)))assert.equal(v.actual,v.expected,p);}

test('layout 3 migrates a path through the new dessert case without losing goods or rewriting old recordings',()=>{
  const s=initialState(),a=s.actors.harin;s.layoutVersion=3;
  Object.assign(a,{...center(18,7),goal:center(18,7),path:[center(18,7)],cur:null,phase:0});
  const before=JSON.stringify([s.money,s.counts,s.memories,s.relations,s.ledger]);
  const loaded=parseSave(exportText(s));assert.equal(loaded.layoutVersion,LAYOUT_VERSION);
  assert.ok(floorCell(Math.floor(loaded.actors.harin.x/32),Math.floor(loaded.actors.harin.y/32),{facilities:loaded.facilities}));
  assert.equal(JSON.stringify([loaded.money,loaded.counts,loaded.memories,loaded.relations,loaded.ledger]),before);audit(loaded);
  assert.equal(fixturesFor({layoutVersion:3}).restroom,undefined);assert.ok(FIXTURES.restroom);
});

test('appended menu items migrate empty and then use the same shopping, price and stock accounting as existing goods',()=>{
  const added=Object.keys(PRODUCTS).slice(Object.keys(PRODUCTS).indexOf('peachTea'));
  const old=quiet();for(const p of added){delete old.counts[p];delete old.shelf[p];delete old.back[p];delete old.orders.par[p];delete old.batches[p];}
  delete old.interior.restroom;delete old.interior.tidy.dessertCooler;old.layoutVersion=3;
  const migrated=parseSave(exportText(old));for(const p of added){assert.equal(migrated.shelf[p],0);assert.equal(migrated.counts[p].start,0);assert.ok(migrated.orders.par[p]>0);}audit(migrated);
  for(const p of ['pudding','creamCake','cheeseRamen']){
    const s=quiet();startVisit(s,['minseo'],null,{inside:true});const a=s.actors.minseo;
    a.parcelToSend=false;a.plan=[{t:'shop',p},{t:'checkout'},{t:'leave'}];a.budget=20000;
    assert.ok(until(s,x=>x.ledger.some(e=>e.kind==='sale'&&e.items.some(([id])=>id===p))));audit(s);
  }
});

test('restroom admits one person, hides them from the scene and witnesses, and restores mid-use deterministically',()=>{
  const s=quiet();startVisit(s,['minseo'],null,{inside:true,purpose:'restroom'});startVisit(s,['harin'],null,{inside:true,purpose:'restroom'});
  assert.ok(until(s,x=>!!x.interior.restroom.by));const id=s.interior.restroom.by,a=s.actors[id];
  assert.equal(Object.values(s.actors).filter(a=>a.privateRoom).length,1);
  assert.ok(!sceneNodes(s).some(n=>n.id===id));assert.ok(!witnessesAt(s,{x:a.x,y:a.y}).includes(id));
  const saved=parseSave(exportText(s));assert.equal(saved.interior.restroom.by,id);assert.equal(saved.actors[id].privateRoom,true);
  const before=s.money;run(s,25);run(saved,25);assert.equal(s.interior.restroom.by,null);assert.equal(s.money,before);assert.ok(s.interior.restroom.uses>=1);assert.deepEqual(s.interior,saved.interior);assert.equal(s.rng,saved.rng);
  assert.equal(s.ledger.filter(e=>e.kind==='sale').length,0);assert.ok(s.memories[id].some(m=>m.topic==='visit_purpose'&&m.text.includes('화장실')));audit(s);
});

test('cash and card settle once, preserve discounts, record change, and survive a mid-checkout save',()=>{
  assert.deepEqual(paymentReceipt('cash',1700),{method:'cash',total:1700,contribution:0,due:1700,tendered:2000,change:300});
  assert.equal(paymentReceipt('cash',3200,1000).due,2200);assert.equal(paymentReceipt('card',1700).change,0);
  for(const method of ['cash','card']){
    const s=quiet();s.facilities.selfCheckout=true;startVisit(s,['minseo'],null,{inside:true});const a=s.actors.minseo;
    a.payment=method;a.parcelToSend=false;a.errands=[{type:'test-counter'}];a.plan=[{t:'shop',p:'chips'},{t:'checkout'},{t:'leave'}];a.budget=10000;
    assert.ok(until(s,x=>!!x.checkout));const loaded=parseSave(exportText(s));run(s,40);run(loaded,40);
    const sales=s.ledger.filter(e=>e.kind==='sale');assert.equal(sales.length,1);assert.equal(sales[0].payment.method,method);assert.equal(sales[0].amount,1700);
    assert.equal(sales[0].payment.change,method==='cash'?300:0);assert.equal(s.money,loaded.money);assert.deepEqual(s.ledger,loaded.ledger);audit(s);
  }
});

test('friends and family use casual speech while service and unfamiliar listeners retain their own registers',()=>{
  const s=initialState();assert.equal(registerFor(s,'minseo','harin'),'casual');assert.equal(registerFor(s,'jeongho','haeun'),'casual');
  assert.equal(registerFor(s,'minseo','yuna'),'formal');assert.equal(registerFor(s,'harin','yeonggil'),'formal');assert.equal(registerFor(s,'yongsu','yuna'),'rude');assert.equal(registerFor(s,'yuna','yongsu'),'worker');
  assert.match(phrase('discount_ask',{register:'rude',rand:()=>0}),/줘|해/);
  const pick={};const q=phrase('friend_food_q',{register:'casual',facts:{rainy:true},pick,rand:()=>0});assert.match(q,/뜨거운/);assert.equal(pick.topic,'warm');
  assert.match(phrase('friend_food_a',{register:'casual',facts:{topic:pick.topic},rand:()=>0}),/라면|간식/);
  assert.equal(phrase('total',{register:'worker',facts:{who:'jae'},slots:{price:'1,700'},rand:()=>0}),'1,700원입니다.');
  for(const sample of allTemplateSamples())assert.deepEqual(lintLine(sample.text),[],sample.text);
});

test('footprint ordering fixes long objects that centre-depth sorting puts in front of a nearer person',()=>{
  const screen={left:0,top:0,right:100,bottom:100};
  const shelf={id:'shelf',type:'fixture',depth:200,bounds:{left:0,top:0,right:200,bottom:20},screen};
  const person={id:'person',type:'person',depth:80,bounds:{left:15,top:30,right:19,bottom:34},screen};
  assert.deepEqual(orderSceneNodes([person,shelf]).map(n=>n.id),['shelf','person']);
  const s=initialState(),a=s.actors.harin;Object.assign(a,center(8,5));
  let ns=sceneNodes(s),ai=ns.findIndex(n=>n.id===a.id),rack=ns.findIndex(n=>n.id==='ramenShelf'&&n.f.x===9&&n.f.y===5);
  assert.ok(ai<rack,'left-side shopper is behind the rack');
  Object.assign(a,center(11,5));ns=sceneNodes(s);ai=ns.findIndex(n=>n.id===a.id);rack=ns.findIndex(n=>n.id==='ramenShelf'&&n.f.x===10&&n.f.y===5);assert.ok(ai>rack,'right-side shopper is in front');
  const p=project(a.x,a.y,36);assert.equal(hitTestScene(s,p.x,p.y)?.id,a.id);
  Object.assign(a,center(10,16));ns=sceneNodes(s);assert.ok(ns.findIndex(n=>n.id===a.id)>ns.findIndex(n=>n.id==='entry-4'),'street actor is not overpainted by a late doorway pass');
});

test('replays preserve occupied restroom rather than taking the live state',()=>{
  const s=quiet();startVisit(s,['minseo'],null,{inside:true,purpose:'restroom'});assert.ok(until(s,x=>!!x.interior.restroom.by));
  startConversation(s,'queue_urge',[{sp:'yuna',k:'confirm'}],{members:['yuna']});const m=s.moments.at(-1),i=m.frames.findIndex(f=>f.actors.minseo?.privateRoom);assert.ok(i>=0);
  run(s,6);const view=momentView(s,m,i);assert.equal(view.interior.restroom.by,'minseo');assert.ok(!sceneNodes(view).some(n=>n.id==='minseo'));
});

test('invalid saved payment amounts, methods and restroom occupants are rejected',()=>{
  const s=quiet();startVisit(s,['minseo'],null,{inside:true});
  const invalid=edit=>{const copy=JSON.parse(exportText(s));edit(copy.state);return JSON.stringify(copy);};
  assert.throws(()=>parseSave(invalid(x=>{x.actors.minseo.payment='unknown';})),/결제/);
  assert.throws(()=>parseSave(invalid(x=>{x.actors.minseo.receipt={...paymentReceipt('cash',1700),change:999};})),/영수증/);
  assert.throws(()=>parseSave(invalid(x=>{x.checkout={customer:'minseo',items:[],payment:'unknown'};})),/결제/);
  assert.throws(()=>parseSave(invalid(x=>{x.ledger.push({kind:'sale',amount:1700,payment:paymentReceipt('card',1500)});})),/장부/);
  assert.throws(()=>parseSave(invalid(x=>{x.interior.restroom.by='minseo';})),/화장실/);
});

test('local-model casual speech cannot silently return to polite speech',()=>{
  const request={intent:'confirm',actions:['say'],speaker:{register:'casual'},example:'응.',recent:[]};
  assert.equal(parseResult(JSON.stringify({say:'응, 맞아.',action:'say'}),request).say,'응, 맞아.');
  for(const register of ['casual','rude'])for(const say of ['네, 맞아요.','알겠습니다.'])assert.throws(()=>parseResult(JSON.stringify({say,action:'say'}),{...request,speaker:{register}}),/반말/);
  assert.equal(parseResult(JSON.stringify({say:'네, 맞아요.',action:'say'}),{...request,speaker:{register:'formal'}}).say,'네, 맞아요.');
});
