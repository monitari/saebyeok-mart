// Read-only summaries for the player. Never mutate events, money, relations or NPC knowledge.
import {PRODUCTS} from './data.js';
import {FACILITIES,productStatus,nextDelivery,orderMode} from './management.js';

const productRows=s=>Object.keys(PRODUCTS).filter(p=>!PRODUCTS[p].facility||s.facilities[PRODUCTS[p].facility]).map(p=>productStatus(s,p));
export function operationAlerts(s){
  const groups={now:[],waiting:[],info:[]};
  for(const r of productRows(s)){
    if(r.status==='ok')continue;
    const base={id:`stock:${r.p}`,product:r.p,title:PRODUCTS[r.p].name};
    if(r.expired>0&&s.shelf[r.p]>0)groups.now.push({...base,label:'판매 기한 확인',detail:`${r.expired}개가 오늘까지 판매 가능해요. 행사와 발주량을 확인하세요.`});
    else if(r.status==='refill')groups.waiting.push({...base,label:'진열 대기',detail:`창고·박스·운반 중 ${r.back+r.boxes+r.carrying}개. 알바생이 진열하면 다시 살 수 있어요.`});
    else if(r.pending>0&&r.status!=='expiry')groups.waiting.push({...base,label:'입고 대기',detail:`${r.pending}개 주문됨 · 다음 07시 입고. 중복 발주 전 수량을 확인하세요.`});
    else if(r.status==='expiry')groups.now.push({...base,label:'판매 기한 확인',detail:`${r.expired}개가 오늘까지 판매 가능해요. 행사와 발주량을 확인하세요.`});
    else if(r.status==='empty'&&(s.orders.par[r.p]??0)===0)groups.info.push({...base,label:'보충 중단',detail:'진열이 비었지만 기준 재고가 0으로 설정돼 있어요.'});
    else groups.now.push({...base,label:r.status==='empty'?'발주 검토':'부족 예상',detail:r.status==='empty'?`가용 재고와 입고 예정이 없어요. ${orderMode(s,r.p)==='auto'?'자동 발주 예산도 확인하세요.':'발주 여부를 결정해 주세요.'}`:`입고 전 예상 수요 ${r.until}개. 수량을 확인하세요.`});
  }
  for(const r of s.management.requests.filter(r=>r.status==='pending'))groups.now.unshift({id:`request:${r.id}`,request:r.id,person:r.customer,title:PRODUCTS[r.p].name,label:'손님 부탁',detail:'승인 대기 중인 재입고 요청이 있어요.'});
  if(s.management.draft)groups.now.unshift({id:'draft',tab:'stock',title:'작성된 주문서',label:'확정 대기',detail:'수량과 예산을 검토한 뒤 확정해 주세요.'});
  return groups;
}

export function decisionFeedback(s){
  const f=s.management.feedback;
  return [...f.changes].reverse().map(c=>{
    const title=c.kind==='facility'?`${FACILITIES[c.key].name} ${c.after?'사용 시작':'사용 중지'}`:c.kind==='par'?`${PRODUCTS[c.key].name} 기준 ${c.before} → ${c.after}개`:`${PRODUCTS[c.key].name} 직접 승인·발주 ${c.after-c.before}개`;
    if(c.kind==='facility'){
      if(!c.after)return {...c,title,detail:'사용을 중지한 기록이에요. 이전 효과를 현재 효과로 계산하지 않아요.'};
      const delta=k=>Math.max(0,(c.endTotals??f.totals)[k]-c.totals[k]);
      const text={welcomeMat:`비 오는 날 입장 ${delta('rainEntries')}회 동안 입구 젖음 증가량 합계 ${Math.round(delta('waterBlocked')*100)}%p 완화`,selfCheckout:`셀프 계산 ${delta('kioskSales')}건 처리`,extraTable:`추가 자리 이용 ${delta('extraSeatUses')}회`,warmLight:`손님 기분 상승 합계 ${Math.round(delta('lightLift'))}점`,umbrellaSale:`비닐우산 ${delta('umbrellaSold')}개 판매`,tobaccoSales:`담배 ${delta('tobaccoSold')}개 판매`}[c.key];
      return {...c,title,detail:`사용 시작${c.endedAt!==undefined?'부터 중지까지':' 후'} ${text}.`,exact:true};
    }
    const after=c.following,before=c.baseline;
    const average=(days,k)=>days.reduce((n,d)=>n+(d[k][c.key]??0),0)/days.length;
    if(before.length<2&&after.length>=2)return {...c,title,detail:`변경 전 기록이 부족해요. 변경 다음날부터 ${after.length}일의 하루 평균은 판매 ${average(after,'sold').toFixed(1)}개, 품절 시도 ${average(after,'missed').toFixed(1)}건, 폐기 ${average(after,'waste').toFixed(1)}개예요.`,postOnly:true};
    if(before.length<2)return {...c,title,detail:`변경 전 기록이 부족해요. 변경 후 마감 ${after.length}일을 기록했어요. 2일이 쌓이면 변경 이후 실적을 보여드려요.`};
    if(after.length<2)return {...c,title,detail:`변경 전 ${before.length}일 · 변경 후 ${after.length}일 기록. 변경 후 마감이 2일 쌓이면 비교해요.`};
    return {...c,title,detail:`변경 전 ${before.length}일과 이후 첫 ${after.length}일의 하루 평균: 판매 ${average(before,'sold').toFixed(1)} → ${average(after,'sold').toFixed(1)}개, 품절 시도 ${average(before,'missed').toFixed(1)} → ${average(after,'missed').toFixed(1)}건, 폐기 ${average(before,'waste').toFixed(1)} → ${average(after,'waste').toFixed(1)}개.`,comparison:true};
  });
}

export function returnSummary(s,offline){
  const seen=new Set();
  const scenes=[...s.events].reverse().filter(e=>{
    if(e.importance<.4||s.clock-e.at>2880||['arrival','purchase','delivery','waste','shift_change'].includes(e.type))return false;
    const key=e.type+':'+[...e.actors].sort().join(',');if(seen.has(key))return false;seen.add(key);return true;
  }).slice(0,3).map(e=>({id:e.id,type:e.type,at:e.at,actors:[...e.actors]}));
  return {clock:s.clock,offline:{duration:offline?.duration??0,revenue:offline?.revenue??0,items:offline?.items??0},scenes,pendingRequests:s.management.requests.filter(r=>r.status==='pending').length,openPromises:s.obligations.filter(o=>o.status==='open').length,nextDelivery:nextDelivery(s),incoming:Object.values(s.orders.pending).reduce((n,q)=>n+q,0)};
}
