import {PRODUCTS} from './data.js';
import {productStatus,MODES,setOrderMode,setFavorite,setTargetPar,activeSchedule} from './management.js';

export function stockRows(s,ui){
  return Object.keys(PRODUCTS).filter(p=>!PRODUCTS[p].facility||s.facilities[PRODUCTS[p].facility]).map(p=>productStatus(s,p)).filter(r=>
    (!ui.stockProduct||ui.stockProduct===r.p)&&(!ui.fixture||PRODUCTS[r.p].fixture===ui.fixture)&&
    (!ui.stockFilter||ui.stockFilter==='all'||ui.stockFilter==='favorites'&&s.management.favorites.includes(r.p)||ui.stockFilter==='attention'&&r.status!=='ok'||ui.stockFilter===r.status));
}
export function applyStockBatch(s,products,action,value){
  const ids=[...new Set(products)];
  if(!ids.length||ids.length>Object.keys(PRODUCTS).length||ids.some(p=>!Object.hasOwn(PRODUCTS,p)||PRODUCTS[p].facility&&!s.facilities[PRODUCTS[p].facility]))return {ok:false,message:'판매 중인 상품을 먼저 선택해 주세요.'};
  if(action==='mode'&&!(value==='inherit'||Object.hasOwn(MODES,value)))return {ok:false,message:'발주 방식을 선택해 주세요.'};
  if(action==='favorite'&&(typeof value!=='boolean'||value&&new Set([...s.management.favorites,...ids]).size>8))return {ok:false,message:'즐겨찾기는 최대 8개까지 담을 수 있어요.'};
  if(action==='par'&&(!Number.isInteger(value)||value<0||value>60))return {ok:false,message:'기준 재고는 0부터 60 사이로 입력해 주세요.'};
  if(!['mode','favorite','par'].includes(action))return {ok:false,message:'적용할 항목을 선택해 주세요.'};
  for(const p of ids)if(action==='mode')setOrderMode(s,value,p);else if(action==='par')setTargetPar(s,p,value);else setFavorite(s,p,value);
  return {ok:true,message:`${ids.length}개 상품에 적용했어요.`};
}
export function recommendationReasons(s,r){
  const lines=[];
  if((s.orders.par[r.p]??0)===0)lines.push('기준 재고가 0이라 추천 보충을 멈췄어요.');
  else if(r.average===null)lines.push('마감 기록이 없어 설정한 기준 재고를 사용해요.');
  else lines.push(`최근 ${s.management.history.length}일의 판매·품절 시도·대체 선택으로 하루 수요 약 ${r.average.toFixed(1)}개를 계산했어요.`);
  if(r.average!==null&&(s.orders.par[r.p]??0)>0&&!r.wasteAdjusted)lines.push('기준 재고와 하루 예상 수요에 여유 25%를 더한 수량 중 큰 쪽을 목표로 해요.');
  if(r.average!==null&&activeSchedule(s)?.products.includes(r.p))lines.push('진행 중인 동네 일정으로 이 상품의 예상 수요를 20% 높여 계산했어요.');
  if(r.wasteAdjusted)lines.push('최근 폐기가 있어 신선 상품의 목표를 낮췄어요.');
  lines.push(`목표 ${r.target}개에서 가용 재고와 입고 예정 ${r.have}개를 빼면 추가 필요량은 ${r.need}개예요.`);
  if(r.held)lines.push(`예약 ${r.held}개는 일반 손님에게 팔 수 있는 수량에서 제외했어요.`);
  if(r.pending)lines.push(`이미 주문한 ${r.pending}개를 포함했어요.`);
  return lines;
}
