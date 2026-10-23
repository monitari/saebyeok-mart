import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState,step,stockAudit,startVisit } from '../web/js/sim/sim.js';
import { FIXTURES,LEGACY_FIXTURES,LAYOUT_VERSION,floorCell,center } from '../web/js/sim/world.js';
import { project,unproject,floorQuad,boxFaces,inPolygon,SCENE_WIDTH,SCENE_HEIGHT } from '../web/js/render/projection.js';
import { sceneNodes,hitTestScene } from '../web/js/render/art-quarter.js';
import { parseSave,exportText } from '../web/js/storage/save.js';
import { startConversation } from '../web/js/sim/sim.js';
import { momentView } from '../web/js/mind/moments.js';
import { PixelCanvas,png } from '../scripts/pixel-canvas.mjs';

test('quarter-view projection round-trips logical points and leaves room for walls and upright sprites',()=>{
  for(let y=32;y<=576;y+=16)for(let x=0;x<=768;x+=16){
    const p=project(x,y),back=unproject(p.x,p.y);
    assert.ok(Math.abs(back.x-x)<1e-9&&Math.abs(back.y-y)<1e-9);
    assert.ok(p.x>=0&&p.x<SCENE_WIDTH&&p.y>54&&p.y<SCENE_HEIGHT-5);
  }
  const a=project(32,32),b=project(64,32),c=project(32,64);
  assert.equal(b.x>a.x&&b.y>a.y,true);assert.equal(c.x<a.x&&c.y>a.y,true);
  assert.equal(project(32,32,40).y,a.y-40);
  assert.ok(inPolygon(project(48,48),floorQuad(32,32,32,32)));
  assert.ok(!inPolygon(project(120,120),floorQuad(32,32,32,32)));
  assert.equal(Object.keys(boxFaces(32,32,32,32,40)).length,3);
});

test('picking uses projected silhouettes and real fixture faces, including conditional equipment',()=>{
  const s=initialState(),a=s.actors.minseo;Object.assign(a,{...center(13,12),path:[]});
  let p=project(a.x,a.y,25);assert.deepEqual(hitTestScene(s,p.x,p.y),{type:'person',id:a.id});
  const atm=FIXTURES.atm;p=project(atm.x*32+16,(atm.y+1)*32-2,31);
  assert.deepEqual(hitTestScene(s,p.x,p.y),{type:'fixture',id:'atm'});
  assert.ok(!sceneNodes(s).some(n=>n.id==='kiosk'));
  s.facilities.selfCheckout=true;assert.ok(sceneNodes(s).some(n=>n.id==='kiosk'));
  assert.equal(hitTestScene(s,5,5),null);
});

test('depth ordering uses both map axes and a selected customer can be seen and picked through an occluding rack',()=>{
  const s=initialState(),a=s.actors.minseo,b=s.actors.harin;
  Object.assign(a,{...center(18,5)});Object.assign(b,{...center(13,8)});
  const nodes=sceneNodes(s),ai=nodes.findIndex(n=>n.id===a.id),bi=nodes.findIndex(n=>n.id===b.id);
  assert.ok(ai>bi,'x contributes to depth even when y is smaller');
  let found=false;
  for(let y=4;y<14&&!found;y++)for(let x=2;x<22&&!found;x++){
    if(!floorCell(x,y,{facilities:s.facilities}))continue;
    Object.assign(a,center(x,y));const view={selected:a.id},ns=sceneNodes(s,view);
    if(!ns.some(n=>n.faded))continue;
    const p=project(a.x,a.y,32),hit=hitTestScene(s,p.x,p.y,view);
    if(hit?.id===a.id)found=true;
  }
  assert.ok(found,'a faded shelf must not intercept the revealed person’s click');
});

test('old layout migration relocates blocked shoppers and occupied seats without changing goods, money or social history',()=>{
  const s=initialState(),a=s.actors.harin,b=s.actors.minseo;
  Object.assign(a,{...center(4,8),cur:{t:'shop',p:'chips'},phase:3,t:1,spot:[4,8,'up'],goal:center(4,8),path:[center(4,8)],cart:[{p:'chips',by:'harin'}]});
  s.shelf.chips--;
  Object.assign(b,{...center(17,7),cur:{t:'hog'},phase:2,t:20,spot:[17,7,'down'],goal:center(17,7),path:[],anim:'sit'});
  s.reserved={'cell:4,8':'harin','cell:17,7':'minseo'};s.layoutVersion=1;
  const keep=JSON.stringify([s.money,s.counts,s.ledger,s.memories,s.relations,s.events,s.obligations]),loaded=parseSave(exportText(s));
  assert.equal(loaded.layoutVersion,LAYOUT_VERSION);
  assert.equal(JSON.stringify([loaded.money,loaded.counts,loaded.ledger,loaded.memories,loaded.relations,loaded.events,loaded.obligations]),keep);
  for(const actor of Object.values(loaded.actors)){
    assert.ok(floorCell(Math.floor(actor.x/32),Math.floor(actor.y/32),{staff:actor.role==='worker',facilities:loaded.facilities}));
    for(const p of actor.path)assert.ok(floorCell(Math.floor(p.x/32),Math.floor(p.y/32),{staff:actor.role==='worker',facilities:loaded.facilities}));
  }
  assert.ok(FIXTURES.table.access.some(c=>c[0]===loaded.actors.minseo.spot[0]&&c[1]===loaded.actors.minseo.spot[1]));
  assert.equal(loaded.actors.harin.cart.filter(it=>it.p==='chips').length,1);
  for(const audit of Object.values(stockAudit(loaded)))assert.equal(audit.actual,audit.expected);
  step(loaded,.1);assert.equal(loaded.actors.harin.cart.length,1,'migration does not pick the paid-for-inventory unit again');
});

test('old recordings keep their old floor plan while new recordings preserve the revised layout',()=>{
  const s=initialState();startConversation(s,'queue_urge',[{sp:'minseo',to:'yuna',k:'confirm'}],{members:['minseo','yuna']});
  const m=s.moments[0];assert.equal(m.frames[0].layoutVersion,LAYOUT_VERSION);
  let v=momentView(s,m,0);assert.equal(sceneNodes(v).find(n=>n.id==='snackShelf').f.x,FIXTURES.snackShelf.x);
  const old=structuredClone(m);for(const f of old.frames)delete f.layoutVersion;
  v=momentView(s,old,0);assert.equal(v.layoutVersion,1);
  assert.equal(sceneNodes(v).find(n=>n.id==='snackShelf').f.x,LEGACY_FIXTURES.snackShelf.x);
  const save=JSON.parse(exportText(s));delete save.state.layoutVersion;save.state.moments=[old];
  const loaded=parseSave(JSON.stringify(save));assert.deepEqual(loaded.moments[0],old);
});

test('a full old dining area migrates to fewer window seats without overlapping diners or losing their belongings',()=>{
  const s=initialState();startVisit(s,['doyun','sunja','yongsu'],null,{inside:true});
  const diners=['harin','minseo','doyun','sunja','yongsu'];
  for(const [i,id]of diners.entries()){
    const seat=LEGACY_FIXTURES.table.access[i],a=s.actors[id];
    Object.assign(a,{...center(...seat),goal:center(...seat),path:[],spot:[...seat],cur:{t:i===4?'doze':'hog'},phase:2,t:20,anim:i===4?'sleep':'sit',dozing:i===4,sleptAt:s.elapsed,hogging:i!==4});
  }
  s.layoutVersion=1;const loaded=parseSave(exportText(s));
  const positions=diners.map(id=>`${loaded.actors[id].x},${loaded.actors[id].y}`);
  assert.equal(new Set(positions).size,5);
  assert.equal(diners.filter(id=>FIXTURES.table.access.some(c=>c[0]===loaded.actors[id].spot[0]&&c[1]===loaded.actors[id].spot[1])).length,3);
  step(loaded,.1);assert.equal(loaded.actors.yongsu.dozing,false);
  for(const audit of Object.values(stockAudit(loaded)))assert.equal(audit.actual,audit.expected);
});

test('the real scene renderer is read-only, draws a full raster and updates visible stock through its cache',async()=>{
  globalThis.OffscreenCanvas=PixelCanvas;
  const {renderScene}=await import('../web/js/render/art.js');
  const s=initialState(),before=JSON.stringify(s),first=new PixelCanvas(SCENE_WIDTH,SCENE_HEIGHT);
  renderScene(first.getContext('2d'),s,{now:0,selected:'yuna'});assert.equal(JSON.stringify(s),before);
  const data=png(first);assert.deepEqual([...data.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  let colour=0;for(let i=0;i<first.data.length;i+=4)if(first.data[i]>100&&first.data[i+1]>100)colour++;
  assert.ok(colour>150000,'walls, floor and stocked fixtures must all render');
  s.shelf.coffee=0;const second=new PixelCanvas(SCENE_WIDTH,SCENE_HEIGHT);renderScene(second.getContext('2d'),s,{now:0,selected:'yuna'});
  let changed=0;for(let i=0;i<first.data.length;i+=4)if(first.data[i]!==second.data[i]||first.data[i+1]!==second.data[i+1])changed++;
  assert.ok(changed>50,'empty stock is visible immediately instead of reusing an old fixture bitmap');
});

test('the scene is drawn only in whole pixels: no anti-aliased paths, strokes, scaled text or fractional rectangles',async()=>{
  globalThis.OffscreenCanvas=PixelCanvas;
  const {renderScene}=await import('../web/js/render/art.js');
  const {initialState:fresh,step:advance,setFacility}=await import('../web/js/sim/sim.js');
  const proto=Object.getPrototypeOf(new PixelCanvas(1,1).getContext('2d')),saved={},bad=[];
  for(const name of ['fill','stroke','fillText','arc','ellipse','transform','rotate'])saved[name]=proto[name];
  for(const name of ['fill','stroke','fillText','arc','ellipse','rotate'])proto[name]=function(...a){bad.push(name);return saved[name].apply(this,a);};
  // Only whole-pixel shifts and mirror flips keep pixels intact; translate and scale go through transform.
  proto.transform=function(a,b,c,d,e,f){if(Math.abs(a)!==1||Math.abs(d)!==1||b||c||!Number.isInteger(e)||!Number.isInteger(f))bad.push(`transform ${[a,b,c,d,e,f]}`);return saved.transform.call(this,a,b,c,d,e,f);};
  saved.fillRect=proto.fillRect;proto.fillRect=function(...a){if(a.some(v=>!Number.isInteger(v)))bad.push(`fillRect ${a.join(',')}`);return saved.fillRect.apply(this,a);};
  saved.drawImage=proto.drawImage;proto.drawImage=function(img,...a){if(a.some(v=>!Number.isInteger(v)))bad.push(`drawImage ${a.join(',')}`);return saved.drawImage.call(this,img,...a);};
  try{
    const s=fresh();setFacility(s,'selfCheckout',true);s.weather.kind='storm';s.wetness=.6;s.interior.wetSign=true;
    for(let i=0;i<300;i++)advance(s,.1);
    s.interior.promos.chips='1+1';
    renderScene(new PixelCanvas(SCENE_WIDTH,SCENE_HEIGHT).getContext('2d'),s,{now:1234,selected:Object.keys(s.actors)[0],fixture:'atm'});
  }finally{Object.assign(proto,saved);}
  assert.deepEqual([...new Set(bad)].slice(0,8),[]);
  // Tile edges are exact 2:1 stairs only if a tile spans a whole number of half-pixels.
  assert.equal(Number.isInteger(32*(project(32,0).y-project(0,0).y)/32),true);
});
