import { mkdir,writeFile } from 'node:fs/promises';
import { ADAPTERS,buildMessages,parseResult,probeModel } from '../dist/ai.js';
const cfg={mode:'ollama',url:process.env.MODEL_URL??'http://127.0.0.1:11434',model:process.env.MODEL_NAME??'qwen2.5:3b'};
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(cfg.url).hostname))throw new Error('Local model only');
const probe=await probeModel(cfg);
const requests=[
 {intent:'confirm',example:'네, 알겠어요.',situation:{scene:'계산 중',weather:'비'},speaker:{role:'손님',register:'formal'}},
 {intent:'urge_reply',example:'앞 손님 계산만 마칠게요.',situation:{scene:'앞 손님 계산 중 뒤 손님이 재촉함'},speaker:{role:'알바생',register:'worker',traits:{patience:90,kindness:80}}},
 {intent:'small_reply',example:'아니요, 이제 시작이에요.',situation:{scene:'배달 일을 시작하는 길'},recent:[{who:'알바생',text:'퇴근하시는 길이에요?'}],speaker:{role:'손님',register:'formal'}},
 {intent:'umbrella_ack_known',example:'챙겨 오셨네요. 감사합니다.',situation:{scene:'손님이 빌린 우산을 반납'},memories:[{text:'이 손님에게 매장 우산을 빌려줌'}],speaker:{role:'알바생',register:'worker'}}
];
const cases=[];
if(probe.ok)for(const request of requests){
 const full={slots:{},recent:[],memories:[],actions:['say'],...request};const start=Date.now();
 try{const raw=await ADAPTERS.ollama(cfg,buildMessages(full),AbortSignal.timeout(20000),fetch);const parsed=parseResult(raw,full);cases.push({intent:full.intent,rule:full.example,model:parsed.say,ms:Date.now()-start,valid:true});}
 catch(e){cases.push({intent:full.intent,rule:full.example,ms:Date.now()-start,valid:false,error:e.message});}
}
const report={at:new Date().toISOString(),config:cfg,probe,cases,passed:cases.filter(c=>c.valid).length,total:cases.length};
await mkdir('reports',{recursive:true});await writeFile('reports/model-benchmark.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
