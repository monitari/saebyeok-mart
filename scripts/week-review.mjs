import {mkdir,writeFile} from 'node:fs/promises';
import {initialState,step,stockAudit,setFacility} from '../web/js/sim/sim.js';
import {exportText,parseSave} from '../web/js/storage/save.js';
import {startOpening} from '../web/js/sim/opening.js';
const reports=[];
for(const seed of [42,4242,20261022]){
  const s=initialState(seed);startOpening(s,true);setFacility(s,'tobaccoSales',true);let maxPending=0;
  for(let i=0;i<1440*21*10;i++){step(s,.1);maxPending=Math.max(maxPending,s.pending.length);}
  parseSave(exportText(s));
  const audit=Object.values(stockAudit(s)).every(v=>v.actual===v.expected),balance=s.money===300000+(s.stats.totals.sale??0)-(s.stats.totals.order??0)-(s.stats.totals.expense??0);
  const memories=Object.values(s.memories).flat(),relationships=Object.values(s.relations).flatMap(Object.values);
  reports.push({seed,days:21,people:Object.keys(s.people).length,groups:s.groups.length,visitors:s.stats.visitors,eventCounts:s.stats.eventCounts,dialogue:s.stats.dialogueSources,money:s.money,expenses:s.stats.totals.expense,audit,balance,maxPending,saveBytes:Buffer.byteLength(exportText(s)),moments:s.moments.length,
    streetPassed:s.street.passed,streetPresent:s.street.people.length,maxMemories:Math.max(...Object.values(s.memories).map(m=>m.length)),consolidated:memories.filter(m=>m.consolidated).length,impressions:memories.filter(m=>m.kind==='impression').length,openMemories:memories.filter(m=>!m.resolved).length,closeRelations:relationships.filter(r=>r.fam>=45&&r.bond>=12&&r.trust>=40&&r.griev<20).length});
  if(!audit||!balance)throw new Error(`Audit failed: ${seed}`);
}
await mkdir('reports',{recursive:true});await writeFile('reports/week-review.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports,null,2));
