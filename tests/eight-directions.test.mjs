import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DIRECTIONS,DIRECTION_VECTORS,directionFromVector} from '../web/js/sim/directions.js';
import {screenDirection} from '../web/js/render/projection.js';
import {FIXTURES,QUARTER_V2_FIXTURES,LAYOUT_VERSION,fixturesFor,center,cellOf,floorCell,findPath,SPOTS} from '../web/js/sim/world.js';
import {initialState,step,stockAudit,startConversation} from '../web/js/sim/sim.js';
import {parseSave,exportText} from '../web/js/storage/save.js';
import {momentView} from '../web/js/mind/moments.js';
import {drawPerson} from '../web/js/render/art.js';
import {PixelCanvas} from '../scripts/pixel-canvas.mjs';

test('all eight floor headings project to distinct, correct screen headings',()=>{
  const expected={up:'up-right',right:'down-right',down:'down-left',left:'up-left','up-right':'right','down-right':'down','down-left':'left','up-left':'up'};
  for(const [d,[x,y]] of Object.entries(DIRECTION_VECTORS)){
    assert.equal(directionFromVector(x,y),d);assert.equal(screenDirection(d),expected[d]);
  }
  assert.equal(directionFromVector(0,0,'left'),'left');
  assert.equal(new Set(DIRECTIONS.map(screenDirection)).size,8);
});

test('eight views have different pixels for every age, including walking, sitting and carried items',()=>{
  const s=initialState(),people=Object.values(s.people);
  for(const age of ['child','adult','elder']){
    const app=people.find(p=>p.genes.appearance.age===age).genes.appearance;
    for(const mode of [{},{walking:true,frame:1},{sitting:true,action:'eat'},{holding:'basket'},{action:'reach'}]){
      const hashes=DIRECTIONS.map(dir=>{
        const cv=new PixelCanvas(48,66),c=cv.getContext('2d');c.translate(24,62);
        drawPerson(c,app,{dir,frame:0,action:'idle',mood:60,...mode});
        return createHash('sha256').update(cv.data).digest('hex');
      });
      assert.equal(new Set(hashes).size,8,`${age} ${JSON.stringify(mode)}`);
    }
  }
});

test('routes use open diagonals but never cross fixture corners, walls or the employee area',()=>{
  const facilities={extraTable:true,selfCheckout:true};
  const open=findPath(center(13,7),center(17,9),{facilities});
  assert.equal(open.length,4,'open floor uses diagonal steps');
  for(const staff of [false,true])for(const f of Object.values(FIXTURES)){
    if(f.staff&&!staff)continue;
    for(const cell of f.access){
      let prev=staff?SPOTS.pos:SPOTS.doorIn;
      const path=findPath(center(...prev),center(...cell),{staff,facilities});assert.ok(path.length);
      for(const p of path){
        const next=cellOf(p),dx=next[0]-prev[0],dy=next[1]-prev[1];
        assert.ok(Math.abs(dx)<=1&&Math.abs(dy)<=1);
        if(dx&&dy){assert.ok(floorCell(prev[0]+dx,prev[1],{staff,facilities}));assert.ok(floorCell(prev[0],prev[1]+dy,{staff,facilities}));}
        prev=next;
      }
    }
  }
  assert.equal(findPath(center(...SPOTS.doorIn),center(...SPOTS.pos),{facilities}).length,0);
  for(const y of [3,4,8])for(let x=2;x<=18;x++)assert.ok(floorCell(x,y,{facilities}),`cross aisle ${x},${y}`);
  for(const id of ['milkFridge','drinkFridge','mealCooler','microwave','hotWater','alcoholFridge','coffeeMachine'])assert.equal(FIXTURES[id].h,1);
});

test('layout 2 migrates ongoing shopping, appliances and worker chores to their new access cells',()=>{
  const cases=[['drinkFridge',{t:'shop',p:'coffee'},true],['microwave',{t:'heat',via:'microwave',p:'lunchbox'},false],['coffeeMachine',{t:'brew'},false],['atm',{t:'atm'},false],['trash',{t:'dump'},false],['recycle',{t:'trash',kind:'soup'},false]];
  for(const [id,cur,spot] of cases)for(const phase of [1,2]){
    const s=initialState(),a=s.actors.minseo,cell=QUARTER_V2_FIXTURES[id].access[0];
    s.layoutVersion=2;Object.assign(a,{...center(...cell),goal:center(...cell),path:[],cur,phase,t:8,spot:spot?[...cell]:null,dir:cell[2],anim:phase===2?'use':'walk'});
    if(spot)s.reserved[`cell:${cell[0]},${cell[1]}`]=a.id;
    const before=JSON.stringify([s.money,s.shelf,s.back,s.counts,a.cart,a.bag,s.memories,s.relations]),loaded=parseSave(exportText(s)),b=loaded.actors.minseo;
    assert.equal(loaded.layoutVersion,LAYOUT_VERSION);assert.deepEqual(b.goal,center(...FIXTURES[id].access[0]));
    if(phase===2)assert.deepEqual({x:b.x,y:b.y},b.goal);
    assert.equal(b.phase,phase);assert.equal(b.t,8);
    assert.equal(JSON.stringify([loaded.money,loaded.shelf,loaded.back,loaded.counts,b.cart,b.bag,loaded.memories,loaded.relations]),before);
    assert.equal(parseSave(exportText(loaded)).layoutVersion,LAYOUT_VERSION);
  }
  for(const [job,id] of [[{type:'restock',p:'coffee',phase:1},'storage'],[{type:'restock',p:'coffee',phase:3},'drinkFridge'],[{type:'beans',phase:3},'coffeeMachine'],[{type:'emptyBins',phase:2},'recycle']]){
    const s=initialState(),a=s.actors[s.onDuty],cell=QUARTER_V2_FIXTURES[id].access[job.type==='beans'?1:0];s.layoutVersion=2;
    Object.assign(a,{...center(...cell),goal:center(...cell),path:[],job,anim:job.phase>=2?'restock':'walk'});
    const b=parseSave(exportText(s)).actors[a.id];assert.ok(FIXTURES[id].access.some(c=>JSON.stringify(center(...c))===JSON.stringify(b.goal)));
    assert.deepEqual(b.job,job);
  }
});

test('layout 2 recordings retain deep fixtures and eight-direction recordings survive save/load',()=>{
  const s=initialState();s.actors.minseo.dir='up-left';
  startConversation(s,'queue_urge',[{sp:'minseo',to:'yuna',k:'confirm'}],{members:['minseo','yuna']});
  const m=s.moments[0],old=structuredClone(m);for(const f of old.frames)f.layoutVersion=2;
  assert.equal(fixturesFor(momentView(s,old,0)).drinkFridge.h,3);
  const loaded=parseSave(exportText(s));assert.equal(loaded.moments[0].frames[0].actors.minseo.dir,'up-left');
  assert.equal(fixturesFor(momentView(loaded,loaded.moments[0],0)).drinkFridge.h,1);
});

test('a busy day actually uses eight walking headings and every actor stays on legal floor',()=>{
  const s=initialState(777),seen=new Set();
  for(let i=0;i<14400;i++){
    step(s,.1);
    for(const a of Object.values(s.actors)){
      if(a.anim==='walk')seen.add(a.dir);
      assert.ok(floorCell(...cellOf(a),{staff:a.role==='worker',facilities:s.facilities})||a.y>=480,`${a.id} at ${cellOf(a)}`);
    }
  }
  assert.equal(seen.size,8);
  for(const v of Object.values(stockAudit(s)))assert.equal(v.actual,v.expected);
  const restored=parseSave(exportText(s));
  for(let i=0;i<50;i++){step(s,.1);step(restored,.1);}
  assert.deepEqual(restored.actors,s.actors);assert.equal(restored.money,s.money);
});
