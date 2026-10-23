import test from 'node:test';
import assert from 'node:assert/strict';
import {STORE_ROOMS,storeCell,storeBoundary,FIXTURES,QUARTER_V4_FIXTURES,fixturesFor,SPOTS,LAYOUT_VERSION,center,cellOf,floorCell,findPath} from '../web/js/sim/world.js';
import {initialState,step,stockAudit} from '../web/js/sim/sim.js';
import {parseSave,exportText} from '../web/js/storage/save.js';
import {sceneNodes} from '../web/js/render/art-quarter.js';

test('the joined rooms have recessed exterior corners and continuous openings between rooms',()=>{
  assert.equal(STORE_ROOMS.length,4);
  for(const [x,y]of [[2,13],[6,14],[16,14],[20,12],[22,2]]){
    assert.equal(storeCell(x,y),false);assert.equal(floorCell(x,y),false);
    assert.equal(storeCell(x,y,4),true,'old footage retains its rectangle');
  }
  const actual=new Set();
  for(const edge of storeBoundary())for(let n=0;n<edge.length;n++){
    const key=`${edge.side}:${edge.line}:${edge.start+n}`;assert.ok(!actual.has(key));actual.add(key);
  }
  const expected=new Set();
  for(let y=1;y<15;y++)for(let x=1;x<23;x++)if(storeCell(x,y)){
    if(!storeCell(x,y-1))expected.add(`north:${y}:${x}`);
    if(!storeCell(x,y+1))expected.add(`south:${y+1}:${x}`);
    if(!storeCell(x-1,y))expected.add(`west:${x}:${y}`);
    if(!storeCell(x+1,y))expected.add(`east:${x+1}:${y}`);
  }
  assert.deepEqual(actual,expected);
  for(const [x,y]of [[17,4],[18,4],[7,12],[7,13],[18,2],[18,3]])assert.ok(floorCell(x,y));
});

test('all furniture fits inside the footprint and every usable floor cell is connected through the entrance',()=>{
  const facilities={selfCheckout:true,extraTable:true};
  for(const [id,f]of Object.entries(FIXTURES))for(let y=f.y;y<f.y+f.h;y++)for(let x=f.x;x<f.x+f.w;x++)assert.ok(storeCell(x,y),id);
  for(const staff of [false,true])for(let y=2;y<18;y++)for(let x=0;x<24;x++){
    if(!floorCell(x,y,{staff,facilities}))continue;
    const path=findPath(center(10,16),center(x,y),{staff,facilities});assert.ok(path.length,`${staff}: ${x},${y}`);
    assert.ok(path.every(p=>floorCell(...cellOf(p),{staff,facilities})));
  }
  for(const cell of [...SPOTS.waitInside,...SPOTS.queue,SPOTS.kioskHelp])assert.ok(floorCell(...cell.slice(0,2),{staff:true,facilities}));
  assert.notDeepEqual(SPOTS.kioskHelp.slice(0,2),FIXTURES.kiosk.access[0].slice(0,2));
  for(let x=0;x<24;x++)assert.equal(floorCell(x,15),x===10||x===11);
});

test('layout 4 saves relocate kiosk service, deliveries and waiting spots without changing the economy or memories',()=>{
  const cases=[
    {id:'minseo',cell:[2,13],cur:{t:'checkout'},phase:21,fixture:'kiosk'},
    {worker:true,cell:[18,13],job:{type:'box',phase:1},fixture:'boxes'},
    {worker:true,cell:[2,12],job:{type:'helpKiosk',phase:2,t:1},help:true},
    {id:'harin',cell:[16,13],cur:{t:'regroup'},phase:1,waiting:true}
  ];
  for(const c of cases){
    const s=initialState();s.layoutVersion=4;s.facilities.selfCheckout=true;
    const a=s.actors[c.worker?s.onDuty:c.id];Object.assign(a,center(...c.cell),{goal:center(...c.cell),path:[],phase:c.phase??0,cur:c.cur??null,job:c.job??null});
    if(c.waiting){a.spot=[...c.cell,'up'];s.reserved[`cell:${c.cell.join(',')}`]=a.id;}
    if(c.fixture==='kiosk')s.interior.kiosk.by=a.id;
    if(c.help){s.interior.kiosk.by='minseo';s.interior.kiosk.error=true;}
    const before=JSON.stringify([s.money,s.shelf,s.back,s.counts,s.memories,s.relations,s.ledger]);
    const loaded=parseSave(exportText(s)),b=loaded.actors[a.id];assert.equal(loaded.layoutVersion,LAYOUT_VERSION);
    assert.equal(JSON.stringify([loaded.money,loaded.shelf,loaded.back,loaded.counts,loaded.memories,loaded.relations,loaded.ledger]),before);
    assert.ok(floorCell(...cellOf(b),{staff:!!c.worker,facilities:loaded.facilities}));
    if(c.fixture)assert.deepEqual(b.goal,center(...FIXTURES[c.fixture].access[0]));
    if(c.help)assert.deepEqual(cellOf(b),SPOTS.kioskHelp.slice(0,2));
    if(c.waiting){assert.ok(floorCell(...b.spot.slice(0,2),{facilities:loaded.facilities}));assert.equal(loaded.reserved[`cell:${c.cell.join(',')}`],undefined);}
    const again=parseSave(exportText(loaded));for(let i=0;i<100;i++){step(loaded,.1);step(again,.1);}
    assert.deepEqual(loaded.actors,again.actors);assert.equal(loaded.rng,again.rng);
    for(const [p,v]of Object.entries(stockAudit(loaded)))assert.equal(v.actual,v.expected,p);
  }
});

test('old recordings keep their original furniture and new perimeter nodes participate in depth ordering',()=>{
  assert.equal(fixturesFor({layoutVersion:4}),QUARTER_V4_FIXTURES);
  const s=initialState(),old={...s,layoutVersion:4};
  assert.equal(sceneNodes(old).filter(n=>n.type==='wall').length,0);
  const walls=sceneNodes(s).filter(n=>n.type==='wall');assert.ok(walls.length>=6);
  for(const n of walls){assert.ok(n.bounds);assert.ok(n.screen);assert.ok(Number.isFinite(n.depth));}
  assert.equal(sceneNodes(old).find(n=>n.id==='boxes').f.x,19);
  assert.equal(sceneNodes(s).find(n=>n.id==='boxes').f.x,14);
});
