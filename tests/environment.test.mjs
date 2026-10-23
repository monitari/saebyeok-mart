import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {seasonAt,environmentAt,weatherChoices,exteriorNodes,STREET_PROPS,DISTRICT} from '../dist/environment.js';
import {initialState,step,startConversation} from '../dist/sim.js';
import {parseSave,exportText} from '../dist/save.js';
import {momentView} from '../dist/moments.js';
import {PixelCanvas} from '../scripts/pixel-canvas.mjs';
import {SCENE_WIDTH,SCENE_HEIGHT,boxFaces} from '../dist/projection.js';
import {renderScene} from '../dist/art.js';

test('seasons follow the saved game clock, including cycle boundaries and historical footage',()=>{
  for(const [day,name]of [[1,'spring'],[28,'spring'],[29,'summer'],[56,'summer'],[57,'autumn'],[84,'autumn'],[85,'winter'],[112,'winter'],[113,'spring']])assert.equal(seasonAt({clock:(day-1)*1440}).id,name);
  const s=initialState();startConversation(s,'queue_urge',[{sp:'minseo',to:'yuna',k:'confirm'}],{members:['minseo','yuna']});
  s.clock=84*1440+720;s.day=85;s.weather={kind:'snow',intensity:2,nextAt:s.clock+200};
  assert.equal(seasonAt(momentView(s,s.moments[0],0)).id,'spring');
  assert.equal(seasonAt(parseSave(exportText(s))).id,'winter');
  const winter=initialState();winter.clock=s.clock;winter.day=85;winter.weather={...s.weather};
  startConversation(winter,'queue_urge',[{sp:'minseo',to:'yuna',k:'confirm'}],{members:['minseo','yuna']});
  assert.equal(parseSave(exportText(winter)).moments[0].frames[0].weather.kind,'snow');
});

test('winter weather can produce real snow and a saved winter simulation resumes identically',()=>{
  const s=initialState();s.clock=84*1440+720;s.day=85;s.weather.nextAt=s.clock;
  assert.ok(weatherChoices(s).some(([kind])=>kind==='snow'));
  const a=parseSave(exportText(s)),b=parseSave(exportText(s));let snow=false;
  for(let i=0;i<150;i++){
    a.weather.nextAt=a.clock;b.weather.nextAt=b.clock;step(a,.1);step(b,.1);snow ||= a.weather.kind==='snow';
  }
  assert.ok(snow);assert.deepEqual(a.weather,b.weather);assert.deepEqual(a.actors,b.actors);assert.equal(a.rng,b.rng);
  assert.equal(environmentAt({...s,weather:{kind:'snow'}}).wet,false,'snow is not reported as rain');
});

test('street furniture leaves pedestrian lanes clear and cars stay inside the road without changing simulation randomness',()=>{
  for(const p of STREET_PROPS){assert.ok(p.y+p.h<=520||p.y>=568,'clear walking lanes: '+p.id);
    const points=Object.values(boxFaces(p.x,p.y,p.w,p.h,p.height+28)).flat();
    assert.ok(points.every(p=>p.x>=0&&p.x<SCENE_WIDTH&&p.y>=0&&p.y<SCENE_HEIGHT));
  }
  const s=initialState(),before=JSON.stringify(s),first=exteriorNodes(s);assert.deepEqual(exteriorNodes(s),first);
  for(let t=0;t<90;t++)for(const n of exteriorNodes({...s,elapsed:t}).filter(n=>n.kind==='car')){
    assert.ok(n.y>=DISTRICT.roadY&&n.y+n.h<=DISTRICT.roadY+DISTRICT.roadH);assert.ok(n.x>=DISTRICT.x&&n.x+n.w<=DISTRICT.x+DISTRICT.w);
  }
  assert.equal(JSON.stringify(s),before);
  assert.notDeepEqual(exteriorNodes({...s,elapsed:10}).filter(n=>n.kind==='car'),first.filter(n=>n.kind==='car'));
});

test('all four seasons render different pixels and rendering preserves the full game state',()=>{
  globalThis.OffscreenCanvas=PixelCanvas;
  const hashes=[];
  for(const [day,weather]of [[1,'clear'],[29,'rain'],[57,'clear'],[85,'snow']]){
    const s=initialState();s.clock=(day-1)*1440+720;s.day=day;s.weather.kind=weather;
    const before=JSON.stringify(s),cv=new PixelCanvas(SCENE_WIDTH,SCENE_HEIGHT);
    renderScene(cv.getContext('2d'),s,{now:1200,selected:'yuna'});
    assert.equal(JSON.stringify(s),before);hashes.push(createHash('sha256').update(cv.data).digest('hex'));
  }
  assert.equal(new Set(hashes).size,4);
});

test('opening hours wrap past midnight, street lights follow the clock, and the sky matches within each cached step',async()=>{
  const {shopOpen,environmentAt:env}=await import('../dist/environment.js');
  const {skyBands}=await import('../dist/art-quarter.js');
  const at=h=>({clock:h*60,weather:{kind:'clear'}});
  assert.deepEqual([1,2.5,15.9,16,23.9].map(h=>shopOpen({hours:[16,2]},at(h))),[true,false,false,true,true]);
  assert.deepEqual([7,21.9,22,3].map(h=>shopOpen({hours:[7,22]},at(h))),[true,true,false,false]);
  assert.ok([0,5,12,23.5].every(h=>shopOpen({hours:[0,24]},at(h))));
  assert.deepEqual([2,6.1,6.5,12,18.4,18.6].map(h=>env(at(h)).lights),[true,true,false,false,false,true]);
  // The page paints the same bands around the cached scene, so both must agree for a whole ten-minute step.
  assert.deepEqual(skyBands({clock:330}),skyBands({clock:339}));
  assert.notDeepEqual(skyBands({clock:0}),skyBands({clock:375}));
  const bands=skyBands({clock:720});assert.equal(bands[0].y0,0);assert.equal(bands.at(-1).y1,SCENE_HEIGHT);
  for(let i=1;i<bands.length;i++)assert.equal(bands[i].y0,bands[i-1].y1);
});

test('street furniture never stands on a cell people walk through',async()=>{
  const {floorCell}=await import('../dist/world.js');
  for(const p of STREET_PROPS.filter(p=>!p.backdrop))
    for(let cy=Math.floor(p.y/32);cy<=Math.floor((p.y+p.h-1)/32);cy++)for(let cx=Math.floor(p.x/32);cx<=Math.floor((p.x+p.w-1)/32);cx++)
      assert.equal(floorCell(cx,cy,{facilities:{}})||floorCell(cx,cy,{staff:true,facilities:{}}),false,`${p.id} blocks ${cx},${cy}`);
});

test('closed shops pull their shutters and a late-night shop stays lit after the others close',async()=>{
  globalThis.OffscreenCanvas=PixelCanvas;
  const {project,inPolygon}=await import('../dist/projection.js');
  const frame=hour=>{const s=initialState();s.clock=hour*60;s.weather.kind='clear';const cv=new PixelCanvas(SCENE_WIDTH,SCENE_HEIGHT);renderScene(cv.getContext('2d'),s,{now:0});return cv.data;};
  // Compare only pixels inside the shop's ground-floor front, so sky and window changes do not count.
  const front=id=>{const p=STREET_PROPS.find(p=>p.id===id),y=p.y+p.h;return [project(p.x+14,y,56),project(p.x+p.w-14,y,56),project(p.x+p.w-14,y,12),project(p.x+14,y,12)];};
  const diff=(a,b,poly)=>{let n=0,all=0;for(let y=0;y<SCENE_HEIGHT;y++)for(let x=0;x<SCENE_WIDTH;x++){if(!inPolygon({x:x+.5,y:y+.5},poly))continue;all++;const i=(y*SCENE_WIDTH+x)*4;if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])n++;}return n/all;};
  const before=frame(21.5),after=frame(22.2),late=frame(1.9),closed=frame(2.2);
  assert.ok(diff(before,after,front('bakery'))>.3,'the bakery shutters at 22:00');
  assert.ok(diff(after,late,front('chicken'))<.05,'the chicken place is still open at 01:54');
  assert.ok(diff(late,closed,front('chicken'))>.3,'and shutters at 02:00');
});
