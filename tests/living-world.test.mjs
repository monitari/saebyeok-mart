import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, step, stageOf, startConversation } from '../dist/sim.js';
import { tickStreet, streetInterval, STREET_CAP, validateStreet } from '../dist/street.js';
import { remember, consolidateMemories, dailyDecay, rel, adjust, noteContact, addEvent, openObligation, resolveObligation, learnResolved, relevantMemories } from '../dist/memory.js';
import { perceive } from '../dist/perceive.js';
import { momentView } from '../dist/moments.js';
import { exportText, parseSave } from '../dist/save.js';
import { hitTest } from '../dist/art.js';
const advance=(s,m)=>{for(let i=0;i<m*10;i++)step(s,.1);};

test('outside traffic is deterministic, bounded, varied and independent of customers and store randomness',()=>{
  const a=initialState(42),b=initialState(42),kinds=new Set(),before=JSON.stringify([a.people,a.actors,a.visits,a.stats,a.memories,a.events,a.rng,a.money]);
  for(let i=0;i<20000;i++){
    a.clock+=.1;b.clock+=.1;
    a.weather.kind=b.weather.kind=i<10000?'clear':'rain';
    tickStreet(a,.1);tickStreet(b,.1);
    assert.ok(a.street.people.length<=STREET_CAP);
    for(const p of a.street.people){kinds.add(p.kind);assert.ok(p.y>=520);assert.ok(!a.people[p.id]);}
  }
  assert.deepEqual(a.street,b.street);assert.ok(a.street.passed>100);
  assert.deepEqual([...kinds].sort(),['bicycle','pair','phone','shelter','walk']);
  assert.equal(JSON.stringify([a.people,a.actors,a.visits,a.stats,a.memories,a.events,a.rng,a.money]),before);
  assert.doesNotThrow(()=>validateStreet(a.street));
  const passer=a.street.people.find(p=>p.x>20&&p.x<748);
  assert.ok(passer);assert.equal(hitTest(a,passer.x,passer.y-5).type,'street');
});

test('the street is quieter overnight and during a storm; old saves gain a street without past footage',()=>{
  const s=initialState();s.weather.kind='clear';s.clock=120;const night=streetInterval(s);
  s.clock=1080;const evening=streetInterval(s);assert.ok(night>evening*3);
  s.weather.kind='storm';assert.ok(streetInterval(s)>evening);
  const current=initialState();startConversation(current,'queue_urge',[{sp:'minseo',to:'yuna',k:'confirm'}],{members:['minseo','yuna']});
  const old=JSON.parse(exportText(current));delete old.state.street;
  for(const m of old.state.moments)for(const f of m.frames)delete f.street;
  const loaded=parseSave(JSON.stringify(old));assert.ok(loaded.street.people.length);
  assert.equal(momentView(loaded,loaded.moments[0],0).street,null);
});

test('saving and restoring preserves pedestrian movement and historical traffic',()=>{
  const s=initialState();advance(s,40);const loaded=parseSave(exportText(s));
  assert.deepEqual(s.street,loaded.street);
  const m=s.moments.find(m=>m.frames.some(f=>f.street));assert.ok(m);
  const old=structuredClone(m.frames[0].street);advance(s,10);advance(loaded,10);
  assert.deepEqual(s.street,loaded.street);assert.deepEqual(momentView(s,m,0).street,old);
  const invalid=JSON.parse(exportText(s));invalid.state.street.people[0].y=100;
  assert.throws(()=>parseSave(JSON.stringify(invalid)),/거리/);
});

test('similar old experiences become one impression with counts, dates and event provenance',()=>{
  const s=initialState();s.memories.yuna=[];
  for(let i=0;i<3;i++){
    s.clock=1300+i*50;
    const e=addEvent(s,'kind_words',{actors:['minseo','yuna'],data:{from:'minseo',to:'yuna'}});perceive(s,e);
  }
  const relation=JSON.stringify(s.relations);s.clock=5000;
  assert.equal(consolidateMemories(s,'yuna'),2);
  const [m]=s.memories.yuna;assert.equal(s.memories.yuna.length,1);
  assert.equal(m.kind,'impression');assert.equal(m.evidence.count,3);
  assert.equal(m.evidence.firstAt,1300);assert.equal(m.evidence.lastAt,1400);
  assert.equal(m.evidence.eventIds.length,3);assert.match(m.text,/3번/);
  assert.equal(JSON.stringify(s.relations),relation,'fusion never pays social rewards again');
  for(const id of m.evidence.eventIds)assert.ok(s.events.find(e=>e.id===id).witnesses.includes('yuna'));
  assert.equal(consolidateMemories(s,'yuna'),0,'the same evidence is not counted twice');
  assert.doesNotThrow(()=>parseSave(exportText(s)));
});

test('hearsay, different informants, opposite outcomes and direct knowledge never become one certainty',()=>{
  const s=initialState();s.memories.yuna=[];
  const base={topic:'kid_candy',about:['minseo'],text:'사탕을 샀다고 들었다.',at:1000};
  for(const sourceId of ['jae','taeo'])for(let i=0;i<2;i++)remember(s,'yuna',{...base,source:'told',sourceId,eventId:`heard-${sourceId}-${i}`});
  for(const outcome of [true,false])for(let i=0;i<2;i++)remember(s,'yuna',{...base,source:'witnessed',outcome,eventId:`saw-${outcome}-${i}`});
  s.clock=5000;consolidateMemories(s,'yuna');assert.equal(s.memories.yuna.length,4);
  for(const m of s.memories.yuna){assert.equal(m.evidence.count,2);if(m.source==='told')assert.match(m.text,/전해 들은/);}
});

test('keyed memories retain repeated evidence, while a changed outcome remains a separate episode',()=>{
  const s=initialState();s.memories.yuna=[];
  const base={key:'candy:last',topic:'kid_candy',about:['minseo'],text:'사탕을 샀다.',outcome:true};
  remember(s,'yuna',{...base,eventId:'one'});s.clock++;
  remember(s,'yuna',{...base,eventId:'two'});
  const m=s.memories.yuna[0];assert.equal(m.evidence.count,2);
  remember(s,'yuna',{...base,eventId:'two'});assert.equal(s.memories.yuna[0].evidence.count,2);
  remember(s,'yuna',{...base,text:'오늘은 사탕을 사지 않았다.',outcome:false,eventId:'three'});
  assert.equal(s.memories.yuna.length,2);assert.equal(s.memories.yuna.filter(m=>m.key).length,1);
  assert.equal(s.memories.yuna.find(m=>m.key).outcome,false);
});

test('legacy memories acquire fusion topics from their actual events rather than guessed text',()=>{
  const s=initialState();s.memories.yuna=[];
  for(let i=0;i<3;i++){
    s.clock=1300+i*50;
    const e=addEvent(s,'kind_words',{actors:['minseo','yuna'],data:{from:'minseo',to:'yuna'}});perceive(s,e);
  }
  const old=JSON.parse(exportText(s));
  for(const m of old.state.memories.yuna){delete m.topic;delete m.perspective;delete m.outcome;}
  const loaded=parseSave(JSON.stringify(old));loaded.clock=5000;consolidateMemories(loaded,'yuna');
  assert.equal(loaded.memories.yuna.length,1);assert.equal(loaded.memories.yuna[0].evidence.count,3);
});

test('open promises and unresolved conflicts survive consolidation and memory pressure',()=>{
  const s=initialState();s.memories.yuna=[];
  const promise=remember(s,'yuna',{kind:'promise',topic:'restock_promise',about:['minseo'],text:'상품을 준비해 두어야 한다.',resolved:false,importance:.8});
  const conflict=remember(s,'yuna',{kind:'conflict',topic:'argument',about:['minseo'],text:'아직 지난 다툼이 신경 쓰인다.',resolved:false,importance:.6});
  s.clock=5000;
  for(let i=0;i<70;i++)remember(s,'yuna',{topic:'kind_words',about:['minseo'],text:'안부를 들었다.',at:1000+i,eventId:`warm-${i}`});
  dailyDecay(s);
  assert.ok(s.memories.yuna.includes(promise));assert.ok(s.memories.yuna.includes(conflict));
  assert.ok(s.memories.yuna.length<=40);
  const merged=s.memories.yuna.find(m=>m.consolidated);assert.ok(merged.evidence.count>20);assert.ok(merged.evidence.eventIds.length<=12);
  assert.ok(relevantMemories(s,'yuna',['minseo'],null,2).every(m=>!m.resolved));
});

test('closing a loan revises only the memories of people who learned the outcome, with separate source metadata',()=>{
  const s=initialState();
  const o=openObligation(s,'umbrella_loan',{debtor:'minseo',creditor:'store',item:'매장 우산',eventId:'loan'});
  for(const id of ['yuna','jae'])remember(s,id,{kind:'promise',obligationId:o.id,about:['minseo'],eventId:'loan',text:'우산을 아직 돌려받지 못했다.',resolved:false});
  resolveObligation(s,o,'return');s.clock++;
  learnResolved(s,'yuna',o.id);
  assert.match(s.memories.yuna.at(-1).text,/반납/);assert.doesNotMatch(s.memories.yuna.at(-1).text,/아직/);
  assert.equal(s.memories.jae.at(-1).resolved,false);
  learnResolved(s,'jae',o.id,'유나에게 우산이 돌아왔다는 인수인계를 받았다.',{source:'handover',sourceId:'yuna'});
  assert.equal(s.memories.jae.at(-1).resolution.source,'handover');assert.equal(s.memories.jae.at(-1).resolution.sourceId,'yuna');
  assert.ok(s.memories.jae.at(-1).originalText.includes('아직'));
});

test('reconciliation closes known conflict memories only for those who perceive it',()=>{
  const s=initialState();
  for(const id of ['yuna','jae'])remember(s,id,{kind:'conflict',topic:'argument',about:['minseo'],text:'지난 다툼이 마음에 걸린다.',resolved:false});
  const e=addEvent(s,'reconcile',{actors:['minseo','yuna'],data:{a:'minseo',b:'yuna'}});perceive(s,e);
  assert.ok(s.memories.yuna.find(m=>m.kind==='conflict').reconciled);
  assert.equal(s.memories.jae.find(m=>m.kind==='conflict').resolved,false);
});

test('frequent transactions alone do not create friendship; social trust and bond matter and slowly cool with absence',()=>{
  const s=initialState(),r=rel(s,'yuna','minseo');Object.assign(r,{fam:70,trust:30,bond:0,grat:0,griev:0});
  assert.equal(stageOf(s,'yuna','minseo'),'regular');
  noteContact(s,'yuna','minseo','visit-one');noteContact(s,'yuna','minseo','visit-one');assert.equal(r.encounters,1);
  adjust(s,'yuna','minseo',{bond:15,trust:15});assert.equal(stageOf(s,'yuna','minseo'),'close');
  adjust(s,'yuna','minseo',{trust:-35,griev:40});dailyDecay(s);
  assert.equal(r.trust,10);assert.notEqual(stageOf(s,'yuna','minseo'),'close');
  const previous=r.fam;s.clock+=1440*8;dailyDecay(s);assert.equal(r.fam,previous-1);
  assert.ok(r.fam>=15);assert.doesNotThrow(()=>parseSave(exportText(s)));
});
