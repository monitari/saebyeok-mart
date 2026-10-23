import {PRODUCTS} from './data.js';
import {displayName,availableBack} from './sim.js';
import {esc} from './ui.js';
import {drawPortrait} from './art.js';
export function renderDashboard(s,ui){
  const pulse=document.getElementById('store-pulse'),people=document.getElementById('floor-people');
  const empty=Object.keys(PRODUCTS).filter(p=>(!PRODUCTS[p].facility||s.facilities[PRODUCTS[p].facility])&&s.shelf[p]===0&&availableBack(s,p)===0).length;
  const pending=s.management.requests.filter(r=>r.status==='pending').length;
  const rows=[['계산대',`${s.queue.length}명 대기`,'work',s.checkout?'결제 진행 중':'알바생이 응대해요'],['재고 확인',`${empty}종 품절`,'stock',`입고 예정 ${Object.values(s.orders.pending).reduce((a,b)=>a+b,0)}개`],['손님 부탁',`${pending}건 대기`,'overview','확인하고 답해주세요'],['화장실',s.interior.restroom.by?'사용 중':'이용 가능','restroom','매장 안쪽 공용 화장실']];
  const key=JSON.stringify(rows);if(pulse.dataset.key!==key){pulse.dataset.key=key;pulse.innerHTML=rows.map(([label,value,tab,sub],i)=>`<button ${tab==='restroom'?'data-locate-fixture="restroom"':`data-ops-tab="${tab}"`}><span class="pulse-index">0${i+1}</span><span><small>${label}</small><b>${value}</b><em>${sub}</em></span><span class="pulse-arrow">↗</span></button>`).join('');}
  const actors=Object.values(s.actors).filter(a=>a.flags.entered||a.id===s.onDuty);
  const peopleKey=JSON.stringify(actors.map(a=>[a.id,a.state,ui.selected===a.id,displayName(s,a.id),s.people[a.id].genes.appearance.top.color]));
  if(people.dataset.key===peopleKey)return;people.dataset.key=peopleKey;
  people.innerHTML=`<span class="floor-people-label">지금 매장에는<br><b>${actors.length}명</b></span>`+actors.map(a=>`<button data-open-person="${a.id}" aria-pressed="${ui.selected===a.id}"><canvas width="36" height="48" data-floor-avatar="${a.id}" aria-hidden="true"></canvas><span><b>${esc(displayName(s,a.id))}</b><small>${esc(a.state)}</small></span></button>`).join('');
  for(const cv of people.querySelectorAll('canvas'))drawPortrait(cv,s.people[cv.dataset.floorAvatar],{mood:60});
}
