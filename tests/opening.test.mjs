import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState,step,stockAudit } from '../dist/sim.js';
import { OPENING_TIME,startOpening,restartGuide,noteOpening,guideView } from '../dist/opening.js';
import { workerAt } from '../dist/roster.js';
import { exportText,parseSave } from '../dist/save.js';
import { knowsName,remember } from '../dist/memory.js';
const advance=(s,m)=>{for(let i=0;i<m*10;i++)step(s,.1);};

test('a fresh opening is coherent with the roster, initial stock, known companions and the store ledger',()=>{
  const s=initialState(),shift=workerAt(s.roster,s.clock);
  assert.equal(s.clock,OPENING_TIME);assert.equal(s.day,1);assert.equal(s.onDuty,shift.worker);
  assert.equal(s.shift.startedAt,shift.start);assert.ok(s.people.yuna.status.fatigue>40);
  assert.equal(s.money,300000);assert.equal(s.sales.revenue,0);assert.equal(s.ledger.length,0);
  assert.equal(s.shelf.lunchbox+s.back.lunchbox,0);assert.equal(s.orders.auto,true);
  assert.equal(workerAt(s.roster,22*60).worker,'jae');
  assert.equal(s.opening.started,false);assert.equal(guideView(s),null);
  assert.deepEqual(Object.keys(s.actors).sort(),['harin','minseo','yuna']);
  assert.equal(s.director.story[0].members[0],'doyun');assert.equal(s.director.nextAt,OPENING_TIME+12);
  assert.ok(s.memories.haeun.some(m=>m.about.includes('jeongho')&&m.text.includes('아빠')));
  for(const [who,list]of Object.entries(s.memories))for(const m of list){
    assert.equal(m.origin,'background');assert.equal(m.source,'self');assert.equal(m.eventId,null);
    for(const other of m.about)assert.ok(knowsName(s,who,other),'background facts do not grant secret knowledge');
  }
  for(const audit of Object.values(stockAudit(s)))assert.equal(audit.actual,audit.expected);
  assert.deepEqual(parseSave(exportText(s)).opening,s.opening);
  const family=s.memories.haeun.find(m=>m.core);s.clock+=1440*60;
  for(let i=0;i<60;i++)remember(s,'haeun',{text:'잠깐 스친 일',importance:.2});
  assert.ok(s.memories.haeun.includes(family),'memory pressure does not make a child forget who her father is');
});

test('the first night has breathing room, then a real loan and a handover under several seeds',()=>{
  for(const seed of [20261022,42,4242]){
    const s=initialState(seed);startOpening(s);
    advance(s,11);
    assert.ok(s.events.filter(e=>e.type==='arrival').every(e=>e.actors.every(id=>['minseo','harin','doyun'].includes(id))));
    advance(s,79);
    const loan=s.obligations.find(o=>o.type==='umbrella_loan'&&o.debtor==='doyun');assert.ok(loan,`loan in seed ${seed}`);
    assert.ok(s.events.some(e=>e.type==='queue_urge'));assert.ok(s.events.some(e=>e.type==='shift_change'));
    assert.ok(s.memories.doyun.some(m=>m.obligationId===loan.id),'promises arise from real play, not background data');
    for(const audit of Object.values(stockAudit(s)))assert.equal(audit.actual,audit.expected);
    assert.doesNotThrow(()=>parseSave(exportText(s)));
  }
});

test('the optional guide advances through a worker, a confirmed scene and an actual event memory, and survives saves',()=>{
  const s=initialState();startOpening(s);assert.equal(guideView(s).action,'person');
  assert.equal(noteOpening(s,'person','minseo'),false);noteOpening(s,'person','yuna');
  assert.equal(guideView(s).action,'overview');assert.equal(noteOpening(s,'memory','yuna'),false);
  advance(s,45);
  const view=guideView(s);assert.equal(view.action,'moment');
  assert.equal(noteOpening(s,'moment','missing'),false);noteOpening(s,'moment',view.target);
  const memory=guideView(s);assert.equal(memory.action,'memory');
  const before=JSON.stringify([s.clock,s.money,s.memories,s.relations,s.events]);noteOpening(s,'memory',memory.target);
  assert.equal(guideView(s).complete,true);
  assert.equal(JSON.stringify([s.clock,s.money,s.memories,s.relations,s.events]),before,'opening UI never teaches NPCs or repeats effects');
  const loaded=parseSave(exportText(s));assert.equal(guideView(loaded).complete,true);
  noteOpening(loaded,'dismiss');assert.equal(guideView(loaded),null);
  restartGuide(loaded);assert.equal(guideView(loaded).action,'person');assert.equal(loaded.clock,s.clock);
});

test('skipping guidance and importing old saves preserve progress without injecting a new opening',()=>{
  const s=initialState();startOpening(s,true);assert.equal(guideView(s),null);
  advance(s,90);const old=JSON.parse(exportText(s));delete old.state.opening;
  for(const list of Object.values(old.state.memories))for(let i=list.length-1;i>=0;i--)if(list[i].origin==='background')list.splice(i,1);
  const before=JSON.stringify(old.state.memories),loaded=parseSave(JSON.stringify(old));
  assert.equal(loaded.opening,undefined);assert.equal(loaded.clock,s.clock);assert.equal(JSON.stringify(loaded.memories),before);
  assert.equal(guideView(loaded),null);
  restartGuide(loaded);assert.equal(guideView(loaded).action,'person');
  const broken=JSON.parse(exportText(s));broken.state.opening.guide.person='yes';
  assert.throws(()=>parseSave(JSON.stringify(broken)),/관찰 안내/);
});
