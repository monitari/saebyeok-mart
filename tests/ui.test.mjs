import test from 'node:test';
import assert from 'node:assert/strict';
import { filteredLog } from '../web/js/ui/ui.js';

test('a departed customer group filter keeps its visit and cashier replies, excluding unrelated people',()=>{
  const s={actors:{worker:{id:'worker'}},visits:[],log:[
    {id:'1',speaker:'minseo',to:'harin',visitId:'v1',convId:'c1'},
    {id:'2',speaker:'harin',to:'minseo',visitId:'v1',convId:'c1'},
    {id:'3',speaker:'harin',to:'worker',visitId:'v1',convId:'c2'},
    {id:'4',speaker:'worker',to:'harin',visitId:null,convId:'c2'},
    {id:'5',speaker:'worker',to:'other',visitId:null,convId:'c3'},
    {id:'6',speaker:'other',to:'worker',visitId:'v2',convId:'c3'}
  ]};
  assert.deepEqual(filteredLog(s,{selected:'minseo',logFilter:'visit'}).map(l=>l.id),['1','2','3','4']);
  assert.deepEqual(filteredLog(s,{selected:'minseo',logFilter:'person'}).map(l=>l.id),['1','2']);
  assert.equal(filteredLog(s,{selected:'minseo',logFilter:'all'}).length,6);
});

test('an unvisited or off-duty person has no group to accidentally match',()=>{
  const s={actors:{worker:{}},visits:[],log:[{id:'1',speaker:'worker',to:'other',visitId:null,convId:'c1'}]};
  assert.deepEqual(filteredLog(s,{selected:'newcomer',logFilter:'visit'}),[]);
});
