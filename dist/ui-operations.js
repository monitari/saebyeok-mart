import {PRODUCTS} from './data.js';
import {FIXTURES} from './world.js';
import {MODES,PRIORITIES,FACILITIES,orderMode,recommendations,nextDelivery,orderAllowance,draftCost,schedule} from './management.js';
import {esc,won,storeStatus,wariList,EVENT_TITLE} from './ui.js';
import {displayName,clockLabel} from './sim.js';
import {operationAlerts,decisionFeedback} from './operations-insights.js';
import {VISIT_PURPOSES} from './visit-purpose.js';
import {stockRows,recommendationReasons} from './stock-tools.js';
import {workerStyle} from './worker-style.js';
import {PAYMENT_LABELS} from './payments.js';
const LABELS={refill:'진열 보충',empty:'진열 품절',low:'부족 예상',expiry:'오늘까지 판매',ok:'여유 있음'};
const tabs={overview:'현황',stock:'재고·발주',facilities:'시설',work:'업무',review:'변화'};
const keys=new WeakMap();
const selectOptions=(values,current)=>Object.entries(values).map(([v,label])=>`<option value="${v}" ${v===current?'selected':''}>${esc(label)}</option>`).join('');
const total=o=>Object.values(o??{}).reduce((a,b)=>a+b,0);
const arrival=s=>`${Math.floor(nextDelivery(s)/1440)+1}일차 07:00`;
function report(s){const h=s.management.history.at(-1);if(!h)return '<p class="muted small">첫 마감이 끝나면 판매·폐기·놓친 수요를 함께 정리해요.</p>';
  const busy=h.hours.indexOf(Math.max(...h.hours)),visits=Object.entries(h.visits??{});
  return `<div class="ops-note"><b>${h.day}일차 마감</b><p>판매 ${total(h.sold)}개 · 폐기 ${total(h.waste)}개<br>품절 시도 ${total(h.missed)}건 중 대체 선택 ${total(h.substituted)}건<br>발주 ${won(h.orderCost)} · 운영·시설 지출 ${won(h.expense)}</p>${visits.length?`<p>${visits.map(([k,n])=>`${VISIT_PURPOSES[k]} ${n}명`).join('<br>')}<br>구매 없이 나간 방문 ${h.outcomes?.noPurchase??0}명 · 줄 대기 포기 ${h.outcomes?.abandoned??0}명</p>`:''}<small>${total(h.hours)?`${busy}시대 계산이 가장 많았어요.`:'계산 기록이 없어요.'} 판매량은 최근 7일 추천에 반영돼요.</small><button data-ops-tab="stock">다음 발주 준비</button></div>`;
}
function requests(s){const list=s.management.requests.filter(r=>['pending','ordered'].includes(r.status));return `<section class="ops-section"><h3>손님 부탁 <span>${list.length}</span></h3>${list.length?list.map(r=>`<article class="request-card"><b>${esc(displayName(s,r.customer))}</b><span class="status-tag">${r.status==='pending'?'승인 대기':'발주·예약 접수'}</span><p>${esc(PRODUCTS[r.p].name)} 1개 · ${esc(displayName(s,r.worker))} 접수</p>${r.status==='pending'?`<div class="row"><button data-request="${r.id}" data-accept="yes">${won(PRODUCTS[r.p].cost)} 발주·예약</button><button data-request="${r.id}" data-accept="no">거절</button></div>`:'<small>입고되면 한 개를 따로 보관해요. 실제 수령 때 관계에 반영돼요.</small>'}</article>`).join(''):'<p class="muted small">손님이 재입고를 문의하면 알바생이 남겨요. 미승인 요청은 3일 뒤 종료돼요.</p>'}</section>`;}
function alerts(s,ui){
  const groups=operationAlerts(s),labels={now:'지금 결정할 일',waiting:'처리를 기다리는 일',info:'참고할 일'};
  return Object.entries(groups).map(([key,items])=>{
    const list=items.slice(0,ui.showAllAlerts?items.length:4).map(a=>`<button class="ops-alert" ${a.product?`data-stock-product="${a.product}"`:a.request?'data-ops-requests':`data-ops-tab="${a.tab}"`}><span><b>${esc(a.title)}</b><small>${esc(a.detail)}</small></span><em>${esc(a.label)}</em></button>`).join('');
    const content=list||(key==='now'?'<p class="muted small">지금 결정할 일이 없어요.</p>':'<p class="muted small">해당 사항이 없어요.</p>');
    return key==='now'?`<section class="ops-section" data-alert-group="${key}"><h3>${labels[key]} <span>${items.length}</span></h3>${content}</section>`:`<details class="ops-section" data-alert-group="${key}"><summary>${labels[key]} · ${items.length}건</summary>${content}</details>`;
  }).join('')+(Object.values(groups).some(a=>a.length>4)?`<button data-alert-expand>${ui.showAllAlerts?'경고 간단히 보기':'경고 전체 펼쳐 보기'}</button>`:'');
}
function comeback(s,r){
  if(!r)return '';
  const o=r.offline;
  return `<section class="return-card" aria-label="복귀 요약"><div class="stock-title"><b>다시 문을 열었어요</b><button data-return-dismiss aria-label="복귀 요약 접기">접기</button></div><p>부재중 ${Math.floor(o.duration/60000)}분 정산 · ${o.items}개 판매 · ${won(o.revenue)}</p><small>부재중에는 재고와 매출을 정산해요. 인물의 시간과 이야기는 멈춘 자리에서 이어져요.</small><h4>최근에 기록된 장면</h4>${r.scenes.map(e=>`<button class="ops-alert" data-open-panel="events"><span><b>${esc(EVENT_TITLE[e.type]??'매장의 일')}</b><small>${Math.floor(e.at/1440)+1}일차 ${clockLabel(e.at)} · ${esc(e.actors.map(id=>displayName(s,id)).join(', '))}</small></span><em>기록 보기</em></button>`).join('')||'<p class="muted small">최근 이틀 동안 남은 주요 장면이 없어요.</p>'}<p>요약 시점: 승인 대기 ${r.pendingRequests}건 · 이어지는 약속 ${r.openPromises}개<br>다음 입고 ${Math.floor(r.nextDelivery/1440)+1}일차 07:00 · ${r.incoming}개</p><button data-ops-requests>남은 부탁 확인</button></section>`;
}
function review(s){
  const changes=decisionFeedback(s),today=s.management.today;
  return `<section class="ops-section"><h3>운영을 바꾼 뒤</h3><p class="muted small">발주와 기준 재고 변경은 전후 기록을 비교해요. 날씨·행사·방문객도 달라지므로 변화가 전부 설정 덕분이라는 뜻은 아니에요. 시설은 사용 시작 뒤 실제 집계한 효과예요.</p>${changes.map(c=>`<article class="ops-note"><b>${esc(c.title)}</b><small>${c.day}일차 ${clockLabel(c.at)} · ${c.exact?'효과 집계':c.comparison?'전후 기록 비교':'관찰 중'}</small><p>${esc(c.detail)}</p>${c.kind==='facility'?`<button data-ops-tab="facilities">시설 확인</button>`:`<button data-stock-product="${c.key}">상품 확인</button>`}</article>`).join('')||'<p class="muted">직접 발주하거나 기준 재고·시설을 바꾸면 이곳에서 이후 변화를 살펴볼 수 있어요.</p>'}</section><section class="ops-section"><h3>오늘 들어온 이유</h3>${Object.entries(VISIT_PURPOSES).map(([k,label])=>`<div class="ops-count-row"><span>${label}</span><b>${today.visits[k]??0}명</b></div>`).join('')}<p class="muted small">구매 없이 나간 방문 ${today.outcomes.noPurchase??0}명 · 줄 대기 포기 ${today.outcomes.abandoned??0}명<br>들어온 때와 나간 때가 달라 두 수치는 일치하지 않을 수 있어요.</p></section>`;
}
function overview(s,ui){
  const e=schedule(s.day),w=s.actors[s.onDuty];
  return comeback(s,ui.returnDismissed?null:ui.returnSummary)+`<div class="ops-metrics"><div><small>오늘 매출</small><strong>${won(s.sales.revenue)}</strong></div><div><small>금고 잔액</small><strong>${won(s.money)}</strong></div></div>
    <div class="ops-note"><b>다음 입고 ${arrival(s)}</b><p>주문 ${total(s.orders.pending)}개 · 진열 대기 ${s.boxes.reduce((n,b)=>n+b.n,0)}개</p><small>${esc(displayName(s,s.onDuty))}: ${esc(w?.state||'매장을 살피는 중')}</small></div>
    ${alerts(s,ui)}<button class="ops-primary" data-ops-tab="review">운영 결과와 방문 이유 살펴보기</button>${ui.returnSummary&&ui.returnDismissed?'<button data-return-show>복귀 요약 다시 보기</button>':''}<div data-requests-area>${requests(s)}</div>${receipts(s)}
    <details class="ops-section"><summary>동네 소식 · ${esc(e.title)}</summary><p>${e.start}–${e.end}일차 · ${esc(e.description)}</p><small>방문 시간과 추가 구매에 반영돼요. 확정 판매량은 아니에요.</small></details>${report(s)}`;
}
function receipts(s){
  const entries=s.ledger.filter(e=>e.kind==='sale'&&e.payment).slice(-3).reverse();
  return `<section class="ops-section receipts"><h3>최근 결제</h3>${entries.map(e=>`<div class="receipt-row"><span class="payment-badge">${PAYMENT_LABELS[e.payment.method]}</span><div><b>${won(e.amount)}</b><small>${esc(displayName(s,e.customer))}${e.by==='kiosk'?' · 셀프 계산':''}</small>${e.payment.method==='cash'?`<small>받은 돈 ${won(e.payment.tendered)} / 거스름돈 ${won(e.payment.change)}</small>`:''}${e.payment.contribution?`<small>다른 손님이 보탠 금액 ${won(e.payment.contribution)}</small>`:''}</div></div>`).join('')||'<p class="muted small">현금·카드 결제가 끝나면 영수증이 남아요.</p>'}<small>카드 매출도 운영 자금에 즉시 합산해요.</small></section>`;
}
function stockToolbar(s,ui,visible){
  const ids=(ui.stockSelected??[]).filter(p=>Object.hasOwn(PRODUCTS,p));
  return `<div class="ops-actions stock-selection"><button data-stock-select="visible" ${visible.length?'':'disabled'}>보이는 ${visible.length}개 선택</button><button data-stock-select="clear" ${ids.length?'':'disabled'}>선택 해제</button><span>선택 ${ids.length}개</span></div>${ids.length?`<section class="bulk-tools" aria-label="선택 상품 일괄 설정"><b>선택한 ${ids.length}개 상품</b><p class="muted small">${ids.map(p=>esc(PRODUCTS[p].name)).join(', ')}</p><div class="ops-fields"><label>발주 방식<select data-bulk-mode>${selectOptions({inherit:'전체 설정 따름',...MODES},ui.bulkMode??'inherit')}</select></label><button data-stock-batch="mode">발주 방식 적용</button><label>기준 재고<input type="number" min="0" max="60" data-bulk-par value="${esc(ui.bulkPar??'')}" placeholder="0~60"></label><button data-stock-batch="par">기준 재고 적용</button></div><button data-stock-batch="favorite">즐겨찾기 추가 · 최대 8개</button><small>선택 목록에는 다른 보기에서 고른 상품도 포함돼요.</small></section>`:''}`;
}
function stockCard(s,ui,r,rec){
  const d=PRODUCTS[r.p],favorite=s.management.favorites.includes(r.p),selected=(ui.stockSelected??[]).includes(r.p);
  const qty=ui.orderQty?.[r.p]??Math.max(1,rec[r.p]?.qty??1),valid=Number.isInteger(qty)&&qty>0&&qty<=60;
  return `<article class="stock-card ${selected?'selected':''}">
    <div class="stock-title"><label class="stock-check"><input type="checkbox" data-stock-check="${r.p}" ${selected?'checked':''}><b>${esc(d.name)}</b></label><button class="stock-star" data-stock-favorite="${r.p}" aria-pressed="${favorite}" aria-label="${esc(d.name)} 즐겨찾기 ${favorite?'해제':'추가'}">${favorite?'★':'☆'}</button></div>
    <div class="stock-title"><span class="status-tag ${r.status}">${LABELS[r.status]}</span><small>매입 ${won(d.cost)} · 판매 ${won(d.price)}</small></div>
    <div class="stock-counts"><span>진열 <b>${s.shelf[r.p]}</b></span><span>창고 <b>${r.back}</b></span><span>입고 예정 <b>${r.pending}</b></span></div>
    <small>예약 ${r.held} · 박스/운반 ${r.boxes+r.carrying}${r.average===null?' · 기준 재고로 추천':` · 하루 수요 약 ${r.average.toFixed(1)}개`}</small>
    <div class="ops-fields"><label>기준 재고<input type="number" min="0" max="60" data-par="${r.p}" value="${s.orders.par[r.p]??0}"></label><label>상품별 발주<select data-product-mode="${r.p}">${selectOptions({inherit:'전체 설정 따름',...MODES},s.management.overrides[r.p]??'inherit')}</select></label></div>
    <div class="ops-actions"><label>수량<input aria-label="${esc(d.name)} 직접 발주 수량" type="number" min="1" max="60" data-order-qty="${r.p}" value="${Number.isFinite(qty)?qty:1}"></label><button data-order="${r.p}">직접 발주</button><output data-order-cost="${r.p}">${valid?`총 ${won(qty*d.cost)}`:'수량 확인'}</output></div>
    <small>현재 ${MODES[orderMode(s,r.p)]} · 목표 ${r.target}개, 추가 필요 ${r.need}개</small>
    <details class="stock-reason" data-stock-reason="${r.p}"><summary>추천 근거</summary>${recommendationReasons(s,r).map(line=>`<p>${esc(line)}</p>`).join('')}</details>
  </article>`;
}
function stock(s,ui){
  const draft=s.management.draft,rec=Object.fromEntries(recommendations(s).map(r=>[r.p,r])),filter=ui.stockFilter??'all';
  const visible=stockRows(s,ui);
  return `<div class="ops-note"><b>발주 기준</b><p>새벽 03시에 자동 발주·승인 주문서를 준비해요.<br>지금 주문하면 ${arrival(s)}에 입고돼요.</p><div class="ops-fields"><label>하루 발주 예산<input type="number" min="0" max="10000000" step="1000" data-policy="budget" value="${s.management.budget}"></label><label>남겨둘 금고 잔액<input type="number" min="0" max="10000000" step="1000" data-policy="reserve" value="${s.management.reserve}"></label></div><small>오늘 발주 ${won(s.management.spent)} · 자동/승인 가능 ${won(orderAllowance(s))}<br>직접 발주·손님 부탁 승인은 금고 잔액 안에서 별도로 결정해요.</small></div>
    <div class="ops-actions"><button data-draft="create">추천 주문서 ${draft?'다시 계산':'만들기'}</button><label>보기<select data-stock-filter>${selectOptions({all:'전체 상품',favorites:'즐겨찾기',attention:'확인 필요',refill:'진열 보충',empty:'진열 품절',expiry:'폐기 주의'},filter)}</select></label><label>매대<select data-stock-category>${selectOptions({'':'모든 매대',...Object.fromEntries([...new Set(Object.values(PRODUCTS).map(d=>d.fixture))].map(id=>[id,FIXTURES[id].name]))},ui.fixture??'')}</select></label></div>
    ${ui.fixture||ui.stockProduct?`<div class="ops-note"><b>${esc(ui.stockProduct?PRODUCTS[ui.stockProduct].name:FIXTURES[ui.fixture]?.name)}</b>${ui.fixture?fixtureInfo(s,ui.fixture):''}<button data-stock-clear>전체 상품</button></div>`:''}
    ${draft?`<section class="draft-card"><h3>${clockLabel(draft.at)} 작성한 주문서</h3><small>수량을 조정한 뒤 한 번에 확정해요. 체크아웃·청소·진열은 발주 모드와 관계없이 진행돼요.</small>${Object.entries(draft.items).map(([p,n])=>`<label class="draft-row"><span>${esc(PRODUCTS[p].name)}<small>매입 ${won(PRODUCTS[p].cost)}</small></span><input aria-label="${esc(PRODUCTS[p].name)} 승인 수량" type="number" min="0" max="60" data-draft-qty="${p}" value="${n}"></label>`).join('')||'<p>추천 발주가 없어요. 기준 재고와 예산을 확인해 주세요.</p>'}<div class="ops-actions"><b>총 ${won(draftCost(s))}</b><button class="ops-primary" data-draft="approve" ${draftCost(s)===0?'disabled':''}>주문서 확정</button><button data-draft="cancel">취소</button></div>${draft.pending!==JSON.stringify(s.orders.pending)?'<p class="ops-warning">입고 예정량이 바뀌었어요. 다시 계산해 주세요.</p>':''}</section>`:''}
    ${stockToolbar(s,ui,visible)}<div class="stock-list">${visible.map(r=>stockCard(s,ui,r,rec)).join('')||'<p class="muted">조건에 맞는 상품이 없어요.</p>'}</div>`;
}
function fixtureInfo(s,id){const x=s.interior,f=FIXTURES[id],who=a=>a?`${esc(displayName(s,a))} 사용 중`:'대기 중';
  if(id==='restroom')return `<p>${x.restroom.by?'사용 중':'이용 가능'} · 누적 이용 ${x.restroom.uses}회</p><small>한 명씩 이용해요. 안에서는 매장 대화를 듣지 못해요.</small>`;
  const info={microwave:who(s.appliances.microwave.by),hotWater:who(s.appliances.hotWater.by),coffeeMachine:`${who(x.coffee.by)} · 원두 ${Math.round(x.coffee.beans*100)}%`,atm:who(x.atm.by),kiosk:x.kiosk.error?'오류 대응 대기':who(x.kiosk.by),trash:`일반 쓰레기 ${Math.round(x.bins.general*100)}%`,recycle:`분리수거 ${Math.round(x.bins.recycle*100)}%`,basketStack:`장바구니 ${x.baskets.stack}개`,boxes:`입고 박스 ${s.boxes.length}개`,umbrellaStand:`대여 우산 ${s.rental.inStand}개`,parcelShelf:`보관 택배 ${x.parcels.length}개`,counter:`계산 대기 ${s.queue.length}명`,table:`취식 ${f.access.length}석`,table2:`취식 ${f.access.length}석`}[id];return info?`<p>${info}</p>`:'';
}
function facilities(s){return `<p class="muted small">설치 위치와 운영 부담을 함께 확인하세요. 구입한 시설은 다시 켜도 비용이 들지 않아요.</p><div class="facility-cards">${Object.entries(FACILITIES).map(([id,f])=>`<article class="facility-card"><div class="stock-title"><b>${f.name}</b><span class="status-tag">${s.facilities[id]?'사용 중':s.facilityOwned[id]?'구입함':'미설치'}</span></div><p>${f.benefit}</p><small>${f.tradeoff}</small><div class="ops-actions"><button data-install="${id}">${s.facilities[id]?'사용 중지':s.facilityOwned[id]?'사용하기':`${won(f.price)} 설치`}</button>${f.fixture?`<button data-locate-fixture="${f.fixture}">위치 보기</button>`:''}</div></article>`).join('')}</div><details class="ops-section"><summary>상품 행사</summary>${Object.entries(PRODUCTS).filter(([,d])=>!d.counter&&!d.staffOnly&&d.fixture!=='counterRack'&&(!d.facility||s.facilities[d.facility])).map(([p,d])=>`<label class="draft-row">${esc(d.name)}<select data-promo="${p}">${selectOptions({'':'없음','1+1':'1+1','2+1':'2+1'},s.interior.promos[p]??'')}</select></label>`).join('')}</details>`;}
function work(s){
  const w=s.people[s.onDuty],a=s.actors[s.onDuty],style=workerStyle(w);
  return `<div class="ops-note"><b>${esc(w.name)} 근무 중</b><p>${esc(a?.state||'매장을 살피는 중')}</p><small>피로 ${Math.round(w.status.fatigue)} · 계산 대기 ${s.queue.length}명</small><div class="ops-actions"><button data-open-person="${w.id}">알바생 살펴보기</button><button data-open-panel="roster">근무표 열기</button></div></div>
    <div class="ops-note"><b>${style.label}에 강한 알바생</b><p>${style.description}</p><small>계산 ${w.skills.checkout} · 진열 ${w.skills.stocking} · 청소 ${w.skills.cleaning} · 응대 ${w.skills.service}<br>꼼꼼함에 따라 정리와 바닥 청소를 시작하는 시점도 달라져요.</small></div>
    <label class="ops-policy">업무 우선순위<select data-policy="priority">${selectOptions(PRIORITIES,s.management.priority)}</select></label><p class="muted small">계산 대기와 위험한 젖은 바닥을 먼저 처리해요. 진행 중인 작업이 끝나면 새 우선순위가 적용돼요.</p>
    <div class="ops-note"><b>밀린 일</b><p>입고 박스 ${s.boxes.length}개<br>취식대 쓰레기 ${s.trash.length}개<br>일반 쓰레기통 ${Math.round(s.interior.bins.general*100)}%<br>커피 원두 ${Math.round(s.interior.coffee.beans*100)}%</p></div>${report(s)}`;
}
export function renderOperations(el,s,ui){
  if(el.contains(document.activeElement)&&document.activeElement.matches('input,select'))return;
  const key=JSON.stringify([s.management,s.shelf,s.back,s.boxes,s.orders,s.holds,s.money,s.facilities,s.facilityOwned,s.interior,s.onDuty,s.actors[s.onDuty]?.state,s.queue.length,Math.floor(s.clock),ui.opsTab,ui.stockFilter,ui.stockProduct,ui.fixture,ui.orderQty,ui.showAllAlerts,ui.returnSummary,ui.returnDismissed,ui.stockSelected,ui.bulkMode,ui.bulkPar]);if(keys.get(el)===key)return;keys.set(el,key);
  const disclosureKey=d=>d.dataset.alertGroup??d.dataset.stockReason??d.querySelector('summary')?.textContent;
  const disclosures=new Set([...el.querySelectorAll('details[open]')].map(d=>`${el.dataset.tab}:${disclosureKey(d)}`));
  const tab=ui.opsTab??'overview';
  el.innerHTML=`<nav class="ops-nav" aria-label="운영 항목">${Object.entries(tabs).map(([id,t])=>`<button data-ops-tab="${id}" aria-pressed="${tab===id}">${t}</button>`).join('')}</nav><div class="ops-content">${tab==='stock'?stock(s,ui):tab==='facilities'?facilities(s):tab==='work'?work(s):tab==='review'?review(s):overview(s,ui)}</div>`;
  if(tab==='work')el.querySelector('.ops-content').insertAdjacentHTML('beforeend',`<details class="ops-section"><summary>매장 상태 자세히</summary>${storeStatus(s)}</details><details class="ops-section"><summary>알바생들이 기억하는 주의 손님</summary>${wariList(s)}</details>`);
  el.dataset.tab=tab;for(const d of el.querySelectorAll('details'))d.open=disclosures.has(`${tab}:${disclosureKey(d)}`);
}
