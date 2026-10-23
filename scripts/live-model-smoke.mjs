import {mkdir,writeFile} from 'node:fs/promises';
import {initialState,step,advanceDialogueTime,pendingToDispatch,resolvePending,stockAudit} from '../web/js/sim/sim.js';
import {DialogueService} from '../web/js/dialogue/ai.js';
const s=initialState(),svc=new DialogueService();s.aiMode='ollama';svc.configure({mode:'ollama',url:'http://127.0.0.1:11434',model:'qwen2.5:3b'});
let applied=0,fallback=0;const end=Date.now()+10000;
await new Promise(done=>{const timer=setInterval(()=>{
  advanceDialogueTime(s,.02);for(let i=0;i<2;i++)step(s,.1);
  svc.pump(pendingToDispatch(s),(id,result)=>{const p=s.pending.find(p=>p.id===id);if(!p){svc.stats.stale++;return;}const source=resolvePending(s,p,result);if(source==='ai'){applied++;svc.stats.displayed++;}if(source==='fallback'){fallback++;svc.stats.fallback++;}});
  if(Date.now()>=end){clearInterval(timer);svc.cancelAll();done();}
},20);});
const audit=stockAudit(s),report={at:new Date().toISOString(),realSeconds:10,gameMinutes:s.elapsed,applied,fallback,service:svc.stats,auditOK:Object.values(audit).every(v=>v.actual===v.expected),sources:s.stats.dialogueSources,lines:s.log.slice(-12).map(l=>({text:l.text,source:l.source,kind:l.kind}))};
await mkdir('reports',{recursive:true});await writeFile('reports/live-model-smoke.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
if(!applied||!report.auditOK)process.exitCode=1;
