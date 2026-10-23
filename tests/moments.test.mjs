import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, step, startConversation, speak, SIM_DT } from '../dist/sim.js';
import { momentView, MOMENT_CAP, FRAME_CAP, tickMoments } from '../dist/moments.js';
import { exportText, parseSave, MAX_IMPORT_BYTES } from '../dist/save.js';

const advance=(s,minutes)=>{for(let i=0;i<minutes/SIM_DT;i++)step(s,SIM_DT);};

test('meaningful exchanges record real lines and poses; replay reads never run effects',()=>{
  const s=initialState();
  const c=startConversation(s,'queue_urge',[{sp:'minseo',to:'yuna',k:'confirm'}],{members:['minseo','yuna']});
  const m=s.moments.find(m=>m.convIds.includes(c.id));
  assert.ok(m,'scene is announced before its first line');
  const first=structuredClone(m.frames[0]);
  const {entry}=speak(s,'minseo','yuna','잠깐만요.',{convId:c.id,source:'rule'});
  assert.deepEqual(m.lines,[entry]);
  s.actors.minseo.x+=2; s.clock+=.5; tickMoments(s);
  assert.deepEqual(m.frames[0],first,'earlier positions are immutable snapshots');
  assert.notEqual(m.frames[1].actors.minseo.x,first.actors.minseo.x);
  const before=structuredClone(s);
  for(let i=0;i<m.frames.length;i++){
    const view=momentView(s,m,i);
    assert.equal(view.clock,m.frames[i].at);
    assert.deepEqual(view.actors,m.frames[i].actors);
    assert.equal(view.people.minseo.status.mood,m.frames[i].moods.minseo);
  }
  assert.deepEqual(s,before);
});

test('completed scenes survive log pruning and save/load with their original transcript',()=>{
  const s=initialState();advance(s,80);
  const m=s.moments.find(m=>m.type==='umbrella_loan');
  assert.ok(m?.complete);assert.ok(m.lines.length);assert.ok(m.eventIds.length);
  const original=structuredClone(m);s.log=[];
  const loaded=parseSave(exportText(s)), restored=loaded.moments.find(x=>x.id===m.id);
  assert.deepEqual(restored,original);
  assert.ok(restored.lines.some(l=>l.text.includes('우산')));
});

test('recordings stay bounded for a week and fit the existing save limit',()=>{
  const s=initialState();advance(s,1440*7);
  assert.ok(s.moments.length<=MOMENT_CAP);
  assert.ok(s.moments.every(m=>m.frames.length<=FRAME_CAP&&m.lines.length<=24));
  assert.equal(new Set(s.moments.map(m=>m.id)).size,s.moments.length);
  assert.ok(Buffer.byteLength(exportText(s),'utf8')<MAX_IMPORT_BYTES);
  assert.doesNotThrow(()=>parseSave(exportText(s)));
});

test('older version-2 saves load without inventing past footage; invalid recordings are rejected',()=>{
  const s=initialState();delete s.moments;
  assert.deepEqual(parseSave(exportText(s)).moments,[]);
  advance(s,80);const raw=JSON.parse(exportText(s));
  raw.state.moments[0].frames[0].actors.minseo.x=null;
  assert.throws(()=>parseSave(raw),/장면 기록/);
  const bad=JSON.parse(exportText(s));bad.state.moments[0].lines.push({speaker:'missing',text:'지어낸 대사',at:0});
  assert.throws(()=>parseSave(bad),/장면 기록/);
});
