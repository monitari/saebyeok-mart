// Side panels and drawers. Each renderer rebuilds its DOM only when its key changes.
import { PRODUCTS, WEEKDAYS } from './data.js';
import { FIXTURES } from './world.js';
import { displayName, clockLabel, weekdayLabel, WORKERS, rosterTimeline, WEATHER_LABEL, availableBack } from './sim.js';
import {seasonAt} from './environment.js';
import { relationLabel } from './memory.js';
import { SOURCE_LABEL } from './perceive.js';
import { EXCEPTION_TYPES } from './roster.js';
import { drawPortrait } from './art.js';
import { SCENES } from './catalog.js';
import { LIFE_CHANGES } from './life.js';

export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const won = n => '₩' + Math.round(n).toLocaleString('ko-KR');
const keys = {};
function changed(name, key) { if (keys[name] === key) return false; keys[name] = key; return true; }
export function resetKeys() { for (const k of Object.keys(keys)) delete keys[k]; }

const ROLE = { worker: '알바생', customer: '손님' };
const TONE = { grateful: '고마움', annoyed: '불편함', angry: '화남', hurt: '서운함', warm: '따뜻함', doubtful: '의심', relieved: '안도', sympathetic: '안쓰러움', disappointed: '실망', happy: '기쁨', sulky: '시무룩', startled: '놀람' };
import { wariness, TROUBLE } from './nuisance.js';
export const EVENT_TITLE = {
  kiosk_help: '셀프 계산대 도움', parcel_pickup: '택배 찾아감', parcel_courier: '택배 기사 방문', garbage_pickup: '쓰레기 수거', alcohol_refused: '주류 판매 거절',
  ...Object.fromEntries(Object.entries(SCENES).map(([k,v])=>[k,v.title])),
  umbrella_loan: '우산을 빌려줌', umbrella_return: '우산 반납', queue_urge: '줄에서 재촉', restock_promise: '발주 약속', promise_kept: '약속한 상품 전달', promise_missed: '지키지 못한 약속',
  line_cut: '새치기', argument: '언쟁', reconcile: '화해', kind_words: '다정한 한마디', paid_for: '대신 낸 돈', favor_thanks: '지난번 일 인사', kid_candy: '사탕 실랑이', left_trash: '남겨진 쓰레기',
  slipped: '미끄러운 입구', discount_refused: '할인 부탁', friend_share: '나눠 먹기', meet: '우연한 만남', shift_change: '교대', delivery: '입고', waste: '폐기'
};

// ---------- people ----------
function portrait(s, id, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  drawPortrait(c, s.people[id], { mood: s.people[id].status.mood });
  return c;
}
export function renderPeopleStrip(el, s, ui) {
  const present = Object.keys(s.actors).filter(id => s.actors[id].role === 'customer' || id === s.onDuty);
  const away = Object.keys(s.people).filter(id => !present.includes(id) && (s.people[id].visits > 0 || s.playerNames[id]));
  const key = `${present.join(',')}|${away.join(',')}|${ui.selected}|${Object.keys(s.playerNames).length}`;
  if (!changed('strip', key)) return;
  const focused = el.contains(document.activeElement) ? document.activeElement?.closest('[data-person]')?.dataset.person : null;
  const awayOpen = el.querySelector('details')?.open ?? false;
  el.replaceChildren();
  const chip = (id, cls) => {
    const b = document.createElement('button');
    b.className = `pchip ${cls}${id === ui.selected ? ' selected' : ''}`;
    b.dataset.person = id;
    b.title = `${displayName(s, id)} 살펴보기`;
    b.setAttribute('aria-pressed', String(id === ui.selected));
    b.append(portrait(s, id, 28, 34));
    const t = document.createElement('span'); t.textContent = displayName(s, id); b.append(t);
    return b;
  };
  const h1 = document.createElement('h4'); h1.textContent = `지금 매장에 ${present.length}명`; el.append(h1);
  for (const id of present) el.append(chip(id, 'here'));
  if (away.length) {
    const details = document.createElement('details'); details.className = 'away-people'; details.open = awayOpen || away.includes(focused);
    const summary = document.createElement('summary'); summary.textContent = `다녀간 사람 ${away.length}명`; details.append(summary);
    const list = document.createElement('div'); list.className = 'away-list';
    for (const id of away) list.append(chip(id, 'away')); details.append(list); el.append(details);
  }
  if (focused) [...el.querySelectorAll('[data-person]')].find(b => b.dataset.person === focused)?.focus({ preventScroll: true });
}

function bar(label, v, warm) { return `<span>${label}</span><div class="bar${warm ? ' warm' : ''}" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(v)}"><i style="width:${Math.round(v)}%"></i></div><span class="bar-value">${Math.round(v)}</span>`; }
function visitSummary(s, id) {
  const a = s.actors[id];
  if (!a?.visitId) return '';
  const v = s.visits.find(x => x.id === a.visitId);
  if (!v) return '';
  const others = v.members.filter(m => m !== id).map(m => displayName(s, m));
  const g = s.groups.find(x => x.id === v.groupId);
  const pay = v.payMode === 'together' ? `${displayName(s, v.payer)}가 함께 계산` : '각자 계산';
  const parts = [others.length ? `일행 ${others.join(', ')}` : '혼자 방문', v.purpose ? `목적: ${v.purpose}` : '', others.length ? pay : '', others.length ? (v.leaveTogether ? '같이 나감' : '따로 나갈 수 있음') : '', v.absent?.length && g ? `오늘 안 온 사람 ${v.absent.length}명` : ''];
  return parts.filter(Boolean).join(', ');
}
function memoryItem(s, m) {
  const src = m.origin==='background'?'이미 알고 있던 사실':m.source === 'told' ? `${displayName(s, m.sourceId)}에게 들음` : m.source === 'handover' ? `${displayName(s, m.sourceId)}의 인수인계` : m.kind === 'habit' ? SOURCE_LABEL.habit : SOURCE_LABEL[m.source] ?? '';
  const day = Math.floor(m.at / 1440) + 1;
  const e=m.evidence,combined=m.consolidated&&e?.count>1;
  const history=combined?`<span class="tag memory-combined">${m.kind==='habit'?'습관':'겹쳐 남은 인상'} · 기록 ${e.count}회</span>`:'';
  const span=combined?`<small>DAY ${Math.floor(e.firstAt/1440)+1}부터 DAY ${Math.floor(e.lastAt/1440)+1}까지의 경험${e.eventIds.length?' · 보관 중인 사건 근거 '+e.eventIds.length+'개':''}</small>`:'';
  const closed=m.resolution?`<small>마무리를 알게 된 날 DAY ${Math.floor(m.resolution.at/1440)+1} · ${esc(m.resolution.source==='handover'?displayName(s,m.resolution.sourceId)+'의 인수인계':SOURCE_LABEL[m.resolution.source]??'확인함')}</small>`:'';
  return `<div class="mem${!m.resolved ? ' open' : ''}${m.source === 'told' ? ' hearsay' : ''}">${history}${esc(m.text)}<small>${!m.resolved ? '<span class="tag">아직 이어지는 일</span>' : ''}${esc(src)}${m.origin==='background'?'':`, DAY ${day} ${clockLabel(m.at)}`}${m.tone && TONE[m.tone] ? `, ${TONE[m.tone]}` : ''}</small>${span}${closed}</div>`;
}
function genesHtml(s, p) {
  const g = p.genes, a = g.appearance, t = g.temperament, e = g.expression, l = g.life, st = p.status;
  const dl = obj => `<dl class="gene-grid">${Object.entries(obj).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
  const T = { kindness: '친절함', patience: '참을성', sociability: '사교성', selfCentered: '자기중심성', meticulous: '꼼꼼함', suspicion: '의심', impulsivity: '충동성', conflictAvoid: '갈등 회피' };
  return `<details class="genes" data-disclosure="genes"><summary>인물 상세 데이터</summary><p class="small muted">유전자 v${g.version}, 시드 ${g.seed}</p>
    <div class="gene-block"><h5>A. 외형</h5>${dl({ 연령대: a.age, 체형: a.build, 키: a.height, 피부: a.skin, 얼굴: `${a.face.shape}, 눈썹 ${a.face.brows}, 수염 ${a.face.beard}`, 머리: `${a.hair.style} ${a.hair.color}`, 상의: `${a.top.type} ${a.top.color}`, 하의: `${a.bottom.type} ${a.bottom.color}`, 소품: a.accessories.join(', ') || '없음', 자세: a.posture, 호환_보정: a.fixes.join(', ') || '없음' })}</div>
    <div class="gene-block"><h5>B. 성향</h5><div class="bars">${Object.entries(T).map(([k, label]) => bar(label, t[k])).join('')}</div></div>
    <div class="gene-block"><h5>C. 표현</h5>${dl({ 말의_길이: e.verbosity, 말투: e.politeness, 직설성: e.directness, 말_거는_빈도: e.initiative, 몸짓: e.gesture, 말버릇: e.ack ?? '없음' })}</div>
    <div class="gene-block"><h5>D. 생활</h5>${dl({ 연령: l.ageGroup, 배경: s.playerNames[p.id] ? l.background : '아직 모름', 방문_시간대: (l.windows ?? []).map(([a1, b1]) => `${clockLabel(a1)}~${clockLabel(b1)}`).join(', ') || '근무표', 예산: l.budget ? won(l.budget) : '없음', 선호: (l.favorites ?? []).map(f => PRODUCTS[f]?.name).join(', '), 모임: p.groups.map(id => s.groups.find(x => x.id === id)?.name).join(', ') || '없음' })}</div>
    <div class="gene-block"><h5>E. 현재 상태</h5><div class="bars">${bar('피로', st.fatigue, true)}${bar('배고픔', st.hunger, true)}${bar('급함', st.hurry, true)}${bar('기분', st.mood)}</div><p class="small">${esc(st.action)}</p></div>
    <div class="gene-block"><h5>F. 기억과 관계</h5><p class="small">기억 ${s.memories[p.id].length}개, 미해결 ${s.memories[p.id].filter(m => !m.resolved).length}개, 관계 ${Object.keys(s.relations[p.id]).length}명</p></div>
  </details>`;
}
export function renderPerson(el, s, ui) {
  if (ui.fixture) return renderFixture(el, s, ui.fixture);
  const id = ui.selected, p = s.people[id];
  if (!p) { el.innerHTML = '<p class="empty">매장 안의 사람을 누르면 여기서 살펴볼 수 있어요.</p>'; return; }
  const mems = s.memories[id], a = s.actors[id];
  const key = `${id}|${JSON.stringify(mems)}|${a?.state}|${Object.values(p.status).filter(v => typeof v === 'number').map(v => Math.round(v / 5)).join(',')}|${JSON.stringify(s.relations[id])}|${displayName(s, id)}|${s.actors[id]?.visitId}|${s.visits.length}`;
  if (!changed('person', key)) return;
  const same = el.dataset.person === id;
  const open = new Set(same ? [...el.querySelectorAll('details[open]')].map(d => d.dataset.disclosure) : []);
  const focusAction = el.contains(document.activeElement) ? document.activeElement?.dataset.personAction : null;
  el.dataset.person = id;
  const rels = Object.entries(s.relations[id]).filter(([, r]) => r.fam > 0 || r.grat > 0 || r.griev > 0).sort((x, y) => (y[1].fam + y[1].grat + y[1].griev) - (x[1].fam + x[1].grat + x[1].griev)).slice(0, 6);
  const sorted = [...mems].sort((x, y) => (x.resolved === y.resolved ? y.at - x.at : x.resolved ? 1 : -1));
  const primary = sorted.slice(0, 3), older = sorted.slice(3);
  const life = p.genes.life;
  el.innerHTML = `<div class="detail-head"><span id="detail-portrait"></span><div><h2>${esc(displayName(s, id))}</h2>
      <div class="role">${ROLE[p.kind]}, ${esc(life.ageGroup)}${s.playerNames[id] && p.kind === 'customer' ? `, ${esc(life.background)}` : ''}${!s.playerNames[id] ? ', 아직 이름을 몰라요' : ''}</div>
      <p class="doing"><span class="presence ${a ? 'here' : ''}"></span>${a ? esc(a.state) : p.kind === 'worker' ? '근무가 아니에요' : '지금은 매장에 없어요'}</p></div></div>
    ${p.lifeChange?.toldTo.length&&s.day<p.lifeChange.end?`<p class="life-note">이번 주: ${esc(LIFE_CHANGES[p.lifeChange.kindIndex].title)}</p>`:''}
    <div class="person-actions"><button data-person-action="locate" ${a ? '' : 'disabled'}>매장에서 찾기</button><button data-person-action="conversation">이 사람의 대화</button></div>
    ${a?.visitId ? `<div class="section-title">이번 방문</div><p class="small">${esc(visitSummary(s, id))}</p>` : ''}
    ${a?.receipt?`<div class="ops-note"><b>이번 결제 · ${a.receipt.method==='cash'?'현금':'카드'}</b><p>구매 금액 ${won(a.receipt.total)}${a.receipt.method==='cash'?`<br>받은 돈 ${won(a.receipt.tendered)} · 거스름돈 ${won(a.receipt.change)}`:''}${a.receipt.contribution?`<br>다른 손님이 보탠 돈 ${won(a.receipt.contribution)}`:''}</p></div>`:''}
    <div class="section-title" data-memory-section>마음에 남은 일 <small>${mems.filter(m => !m.resolved).length ? `이어지는 일 ${mems.filter(m => !m.resolved).length}개` : `기억 ${mems.length}개`}</small></div>
    <p class="small muted memory-help">오래된 비슷한 일은 인상으로 겹쳐 남아요. 약속과 풀리지 않은 갈등은 따로 기억해요.</p>
    ${primary.length ? primary.map(m => memoryItem(s, m)).join('') : '<p class="empty">아직 남은 기억이 없어요.<br>오늘의 만남이 여기에 쌓일 거예요.</p>'}
    ${older.length ? `<details class="person-disclosure" data-disclosure="memories"><summary>이전 기억 ${older.length}개 더 보기</summary>${older.map(m => memoryItem(s, m)).join('')}</details>` : ''}
    <details class="person-disclosure" data-disclosure="status"><summary>지금 상태</summary>
    <div class="section-title">지금 상태</div><div class="bars">${bar('기분', p.status.mood)}${bar('배고픔', p.status.hunger, true)}${bar('피로', p.status.fatigue, true)}${bar('급함', p.status.hurry, true)}</div>
    </details>
    <div class="section-title">이 사람이 보는 관계 <small>방향이 있어요</small></div>
    ${rels.length ? rels.map(([to, r]) => `<div class="rel"><span>${esc(displayName(s, to))}</span><small>${relationLabel(r)}</small><small>익숙함 ${r.fam}, 신뢰 ${r.trust}, 정 ${r.bond??0}${r.grat ? `, 고마움 ${r.grat}` : ''}${r.griev ? `, 불만 ${r.griev}` : ''}</small>${r.encounters?`<small>계산하며 만난 방문 ${r.encounters}회${r.lastAt!==undefined?` · 마지막 교류 DAY ${Math.floor(r.lastAt/1440)+1}`:''}</small>`:''}</div>`).join('') : '<p class="empty">아직 아는 사람이 거의 없어요.</p>'}
    ${p.kind === 'customer' ? `<div class="rel"><span>이 매장</span><small>평판 ${Math.round(s.reputation[id])}</small></div>` : ''}
    ${genesHtml(s, p)}`;
  el.querySelector('#detail-portrait').replaceWith(portrait(s, id, 72, 96));
  for (const details of el.querySelectorAll('[data-disclosure]')) details.open = open.has(details.dataset.disclosure);
  if (focusAction) el.querySelector(`[data-person-action="${focusAction}"]`)?.focus({ preventScroll: true });
}
function renderFixture(el, s, fid) {
  const f = FIXTURES[fid];
  const prods = Object.keys(PRODUCTS).filter(p => PRODUCTS[p].fixture === fid && (!PRODUCTS[p].facility || s.facilities[PRODUCTS[p].facility]));
  const key = `fx|${fid}|${JSON.stringify(s.interior)}|${prods.map(p => s.shelf[p] + ':' + s.back[p]).join(',')}|${s.appliances.microwave.by}|${s.rental.inStand}|${s.boxes.length}|${s.trash.length}`;
  if (!changed('person', key)) return;
  let body = '';
  if (prods.length) body = `<table class="grid"><tr><th>상품</th><th>가격</th><th>진열</th><th>창고</th></tr>${prods.map(p => `<tr><td>${esc(PRODUCTS[p].name)}</td><td class="num">${won(PRODUCTS[p].price)}</td><td class="num ${s.shelf[p] === 0 ? 'soldout' : ''}">${s.shelf[p] === 0 ? '품절' : s.shelf[p]}</td><td class="num">${s.back[p]}</td></tr>`).join('')}</table>`;
  if (fid === 'microwave') body = `<p>${s.appliances.microwave.by ? `${esc(displayName(s, s.appliances.microwave.by))}이(가) ${esc(PRODUCTS[s.appliances.microwave.item]?.name ?? '')}을(를) 데우는 중` : '비어 있어요'}</p>`;
  if (fid === 'umbrellaStand') body = `<p>대여 우산 ${s.rental.inStand}개 꽂혀 있음 (전체 ${s.rental.total}개)</p>${s.obligations.filter(o => o.type === 'umbrella_loan' && o.status === 'open').map(o => `<p class="small">빌려 간 사람: ${esc(displayName(s, o.debtor))}</p>`).join('')}`;
  const x = s.interior, pct = v => Math.round(Math.min(1, v) * 100) + '%';
  const extra = {
    coffeeMachine: `<p>원두 ${pct(x.coffee.beans)}${x.coffee.by ? `, ${esc(displayName(s, x.coffee.by))}이(가) 커피를 내리는 중` : ''}. 컵은 계산대에서 사요.</p>`,
    alcoholFridge: '<p>주류는 계산대에서 나이를 확인한 뒤에만 팔아요.</p>',
    trash: `<p>채워진 정도 ${pct(x.bins.general)}</p>`, recycle: `<p>채워진 정도 ${pct(x.bins.recycle)}. 컵라면 국물과 컵, 캔을 버려요.</p>`,
    atm: `<p>${x.atm.by ? `${esc(displayName(s, x.atm.by))}이(가) 쓰는 중` : '비어 있어요'}. 매장 매출과는 상관없어요.</p>`,
    basketStack: `<p>거치대 ${x.baskets.stack}개, 계산대에 놓인 것 ${x.baskets.counter}개</p>`,
    parcelShelf: `<p>보낼 택배 ${x.parcels.filter(p => p.kind === 'send').length}개, 찾아갈 택배 ${x.parcels.filter(p => p.kind === 'arrive').length}개. 택배 기사는 오후 4시에 와요.</p>`,
    kiosk: `<p>${x.kiosk.by ? (x.kiosk.error ? '멈춰서 알바생을 기다리는 중' : `${esc(displayName(s, x.kiosk.by))}이(가) 계산하는 중`) : '비어 있어요'}</p>`
  }[fid];
  if (extra) body = extra + body;
  if (x.tidy[fid] !== undefined) body += `<p class="small muted">정리 상태 ${pct(x.tidy[fid])}</p>`;
  if (fid === 'boxes') body =`<p>입고 박스 ${s.boxes.length}개</p>${s.boxes.slice(0, 12).map(b => `<span class="tag">${esc(PRODUCTS[b.p].name)} ${b.n}</span>`).join('')}`;
  if (fid === 'table' || fid === 'table2') body = `<p>자리 ${f.access.length}개, 남은 쓰레기 ${s.trash.filter(t => f.access.some(c => c[0] === t.cell[0] && c[1] === t.cell[1])).length}개</p>`;
  el.innerHTML = `<div class="detail-head"><div><h2>${esc(f.name)}</h2><p class="doing">${prods.length ? '진열 상태' : '매장 시설'}</p></div></div>${body}<p class="small muted" style="margin-top:12px">사람을 누르면 다시 인물 정보로 돌아가요.</p>`;
}

// ---------- log ----------
export function filteredLog(s, ui) {
  const filter = ui.logFilter, sel = ui.selected;
  if (filter === 'all') return s.log;
  if (filter === 'person') return s.log.filter(l => l.speaker === sel || l.to === sel);
  const visitId = s.actors[sel]?.visitId ?? [...s.log].reverse().find(l => (l.speaker === sel || l.to === sel) && l.visitId)?.visitId;
  const members = new Set(s.visits.find(v => v.id === visitId)?.members ?? [sel]);
  const convs = new Set(s.log.filter(l => l.visitId === visitId && visitId && l.convId).map(l => l.convId));
  return s.log.filter(l => l.speaker === sel || l.to === sel || (visitId && l.visitId === visitId) || (l.convId && convs.has(l.convId)) || (s.actors[sel] && members.has(l.speaker)));
}
export function renderLog(list, s, ui) {
  const entries = filteredLog(s, ui), sel = ui.selected;
  const seen = entries.findIndex(l => l.id === ui.logReadId);
  ui.logNewCount = ui.logFollowing ? 0 : ui.logReadId ? seen >= 0 ? entries.length - seen - 1 : entries.length : entries.length;
  if (ui.logFollowing) ui.logReadId = entries.at(-1)?.id ?? null;
  const key = `${entries.at(-1)?.id}|${ui.logFilter}|${sel}|${entries.length}|${ui.missed.size}|${ui.logFollowing}`;
  if (!changed('log', key)) return;
  const scroll = list.parentElement;
  const top = scroll.scrollTop, anchor = [...list.children].find(li => li.offsetTop + li.offsetHeight > top);
  const anchorId = anchor?.dataset.line, offset = anchor ? top - anchor.offsetTop : 0;
  const src = { rule: '규칙', ai: 'AI', fallback: '대체', mock: '테스트' };
  list.innerHTML = entries.length ? entries.slice(-150).map(l => `<li data-line="${esc(l.id)}" class="${sel && (l.speaker === sel || l.to === sel) ? 'hl' : ''}"><time><small>DAY ${Math.floor(l.at / 1440) + 1}</small>${clockLabel(l.at)}</time><div><span class="who">${esc(displayName(s, l.speaker))}</span>${l.to ? `<span class="to"> → ${esc(displayName(s, l.to))}</span>` : ''}<span class="src ${esc(l.source)}">${esc(src[l.source] ?? l.source)}</span>${ui.missed.has(l.id) ? '<span class="missed">말풍선 생략</span>' : ''}<p>${esc(l.text)}</p></div></li>`).join('') : '<li class="empty">아직 이 보기의 대화가 없어요.<br>다른 사람을 선택하거나 잠시 기다려 주세요.</li>';
  if (ui.logFollowing) scroll.scrollTop = scroll.scrollHeight;
  else {
    const next = [...list.children].find(li => li.dataset.line === anchorId);
    scroll.scrollTop = next ? next.offsetTop + offset : top;
  }
}

// ---------- events ----------
export function renderEvents(list, s) {
  const evs = s.events.filter(e => e.importance >= .3 || e.type === 'shift_change' || e.type === 'delivery');
  const key = `${evs.length}|${evs.at(-1)?.id}|${s.obligations.map(o => o.status).join('')}|${Object.keys(s.playerNames).length}`;
  if (!changed('events', key)) return;
  list.innerHTML = evs.length ? evs.slice(-80).reverse().map(e => {
    const who = e.actors.map(id => displayName(s, id)).join(', ');
    const seen = e.witnesses.filter(w => !e.actors.includes(w)).map(id => displayName(s, id));
    const o = s.obligations.find(x => x.eventId === e.id);
    const status = o ? { open: '미해결', resolved: '해결됨', kept: '지켜짐', broken: '못 지킴' }[o.status] : '';
    return `<li><time>DAY ${e.day} ${clockLabel(e.at)}</time> <b>${esc(EVENT_TITLE[e.type] ?? e.type)}</b>${status ? `<span class="tag">${status}</span>` : ''}${who ? esc(who) : ''}<small>${seen.length ? `곁에서 본 사람: ${esc(seen.join(', '))}` : '다른 목격자 없음'}</small></li>`;
  }).join('') : '<li class="empty">아직 기록할 만한 일이 없어요.</li>';
}

// ---------- roster ----------
export function renderRoster(el, s) {
  if (el.contains(document.activeElement) && document.activeElement.matches('input,select')) return;
  const key = `${s.day}|${JSON.stringify(s.roster.exceptions)}|${s.onDuty}|${s.shift.handover ? 1 : 0}`;
  if (!changed('roster', key)) return;
  const name = id => s.people[id]?.name ?? id;
  const days = Array.from({ length: 7 }, (_, i) => s.day + i);
  const rows = days.map(d => {
    const segs = rosterTimeline(s, d).filter(x => x.day === d);
    return `<tr class="${d === s.day ? 'today' : ''}"><td>DAY ${d} (${weekdayLabel(d)})</td>${['am', 'pm', 'night'].map(id => { const seg = segs.find(x => x.id === id); if (!seg) return '<td>-</td>'; return `<td>${esc(name(seg.worker))}<br><small class="muted">${clockLabel(seg.start)}~${clockLabel(seg.end)}</small>${seg.notes.length ? `<br><span class="note">${esc(seg.notes.join(', '))}</span>` : ''}</td>`; }).join('')}</tr>`;
  }).join('');
  const ex = s.roster.exceptions.filter(x => x.day >= s.day - 1).map(x => `<li>DAY ${x.day} ${{ am: '오전', pm: '저녁', night: '야간' }[x.shift]} ${EXCEPTION_TYPES[x.type]}${x.worker ? ` ${esc(name(x.worker))}` : ''}${x.minutes ? ` ${x.minutes}분` : ''}${x.note ? ` <span class="muted small">${esc(x.note)}</span>` : ''} <button data-remove-exception="${esc(x.id)}" class="small">삭제</button></li>`).join('');
  el.innerHTML = `<p class="small">지금 근무: <b>${esc(name(s.onDuty))}</b>${s.shift.handover ? ' (인수인계 중)' : ''}. 교대 때는 몇 가지만 전달돼요. 전달되지 않은 일은 다음 알바생이 몰라요.</p>
    <table class="grid"><tr><th>날짜</th><th>오전 08~14</th><th>저녁 14~22</th><th>야간 22~08</th></tr>${rows}</table>
    <h4 style="margin:12px 0 4px;font-size:13px">날짜별 예외</h4><ul class="small">${ex || '<li class="muted">없음</li>'}</ul>
    <form class="form-row" id="exception-form">
      <label>날짜 <select name="day">${days.map(d => `<option value="${d}">DAY ${d} (${weekdayLabel(d)})</option>`).join('')}</select></label>
      <label>시간대 <select name="shift"><option value="am">오전</option><option value="pm">저녁</option><option value="night">야간</option></select></label>
      <label>종류 <select name="type">${Object.entries(EXCEPTION_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label>대타 알바생 <select name="worker">${WORKERS.map(w => `<option value="${w}">${esc(name(w))}</option>`).join('')}</select></label>
      <label>분 <input name="minutes" type="number" min="1" max="240" value="30"></label>
      <button type="submit">추가</button>
    </form><p id="roster-message" class="message small"></p>`;
}

for (const [t, v] of Object.entries(TROUBLE)) EVENT_TITLE['trouble_' + t] = v.label;
// Difficult customers as the workers remember them. A worker who was not told knows nothing here.
export function wariList(s) {
  const list = wariness(s).slice(0, 12);
  if (!list.length) return '<div class="facility"><b>알바생들이 기억하는 주의 손님</b><p>아직 없어요.</p></div>';
  return `<div class="facility"><b>알바생들이 기억하는 주의 손님</b><ul class="wary-list">${list.map(w => `<li><b>${esc(s.people[w.worker].name)}</b> → ${esc(displayName(s, w.customer))}<br><small>${esc(w.text)}${w.source === 'handover' ? ' (인수인계로 들음)' : w.source === 'told' ? ' (전해 들음)' : ''}</small></li>`).join('')}</ul></div>`;
}
// ---------- ops ----------
// Equipment the workers keep up with. Plain numbers; nothing here changes the store.
export function storeStatus(s) {
  const x = s.interior, pct = v => Math.round(Math.min(1, v) * 100) + '%';
  const messy = Object.entries(x.tidy).sort((a, b) => a[1] - b[1])[0];
  const stickers = Object.values(x.stickers).reduce((n, v) => n + v, 0);
  return `<div class="facility"><b>매장 상태</b><table class="grid">
    <tr><th>일반 쓰레기통</th><td class="num">${pct(x.bins.general)}</td></tr><tr><th>분리수거와 국물통</th><td class="num">${pct(x.bins.recycle)}</td></tr>
    <tr><th>창고의 쓰레기봉투</th><td class="num">${x.bagsInBack}개</td></tr><tr><th>밖에 내놓은 봉투</th><td class="num">${x.curbBags}개</td></tr>
    <tr><th>가장 흐트러진 진열</th><td class="num">${esc(FIXTURES[messy[0]]?.name ?? '')} ${pct(messy[1])}</td></tr>
    <tr><th>커피 원두</th><td class="num">${pct(x.coffee.beans)}</td></tr><tr><th>장바구니</th><td class="num">거치대 ${x.baskets.stack}, 계산대 ${x.baskets.counter}</td></tr>
    <tr><th>택배</th><td class="num">보낼 것 ${x.parcels.filter(p => p.kind === 'send').length}, 찾아갈 것 ${x.parcels.filter(p => p.kind === 'arrive').length}</td></tr>
    <tr><th>할인 스티커</th><td class="num">${stickers}개</td></tr></table>
    <p>알바생이 한가할 때 진열을 정리하고 쓰레기통을 비워요. 밤에는 봉투를 밖에 내놓고, 새벽 5시에 수거차가 가져가요.</p></div>`;
}
export function renderOps(el, s) {
  if (el.contains(document.activeElement) && document.activeElement.matches('input,select')) return;
  const key = `${JSON.stringify(wariness(s).map(w => w.worker + w.customer + w.at))}|${JSON.stringify(s.interior)}|${JSON.stringify(s.shelf)}|${JSON.stringify(s.back)}|${JSON.stringify(s.orders)}|${JSON.stringify(s.facilities)}|${s.money}|${s.holds.length}`;
  if (!changed('ops', key)) return;
  const rows = Object.entries(PRODUCTS).filter(([, d]) => !d.facility || s.facilities[d.facility]).map(([p, d]) => `<tr><td>${esc(d.name)}</td><td class="num">${won(d.price)}</td><td class="num ${s.shelf[p] === 0 ? 'soldout' : ''}">${s.shelf[p] === 0 ? '품절' : s.shelf[p]}</td><td class="num">${s.back[p]}${s.back[p] !== availableBack(s, p) ? ` <small class="muted">(예약 ${s.back[p] - availableBack(s, p)})</small>` : ''}</td><td class="num">${s.orders.pending[p] ?? 0}</td><td><input class="par" type="number" min="0" max="40" value="${s.orders.par[p] ?? 0}" data-par="${p}" aria-label="${esc(d.name)} 기준 재고"></td><td><button data-order="${p}" class="small">+5 발주</button></td></tr>`).join('');
  const today = s.sales;
  el.innerHTML = `<div class="ops-grid"><div>
      <table class="grid"><tr><th>상품</th><th>가격</th><th>진열</th><th>창고</th><th>주문 중</th><th>기준 재고</th><th></th></tr>${rows}</table>
      <p class="small muted">주문은 다음 날 07시에 박스로 들어오고, 알바생이 시간이 날 때 진열해요. 새벽 3시에 기준 재고만큼 자동 발주해요.</p>
    </div><div>
      <div class="facility"><label><input type="checkbox" data-auto-order ${s.orders.auto ? 'checked' : ''}> 알바생 자동 발주</label><p>끄면 직접 발주해야 해요. 알바생이 손님에게 하는 약속도 실제 발주가 가능할 때만 나와요.</p></div>
      <div class="facility"><label><input type="checkbox" data-facility="extraTable" ${s.facilities.extraTable ? 'checked' : ''}> 취식대 하나 더 놓기</label><p>앉을 자리가 늘면 먹고 가는 손님이 많아지고 쓰레기도 늘어요.</p></div>
      <div class="facility"><label><input type="checkbox" data-facility="umbrellaSale" ${s.facilities.umbrellaSale ? 'checked' : ''}> 비닐우산 들여놓기</label><p>비 오는 날 우산을 사 가는 손님이 생겨요. 대여 우산은 따로 ${s.rental.total}개 있어요.</p></div>
      <div class="facility"><label><input type="checkbox" data-facility="tobaccoSales" ${s.facilities.tobaccoSales?'checked':''}> 담배 판매대 · 첫 설치 ₩10,000</label><p>솔빛 블루와 브라운을 발주할 수 있어요. 손님이 요청하면 알바생이 신분을 확인하고 꺼내줘요.</p></div>
      <div class="facility"><label><input type="checkbox" data-facility="welcomeMat" ${s.facilities.welcomeMat?'checked':''}> 입구 매트 · 첫 설치 ₩8,000</label><p>빗물이 덜 들어와 입구가 천천히 젖어요.</p></div>
      <div class="facility"><label><input type="checkbox" data-facility="warmLight" ${s.facilities.warmLight?'checked':''}> 따뜻한 조명 · 첫 설치 ₩12,000</label><p>들어온 손님의 기분이 조금 나아져요.</p></div>
      <div class="facility"><label><input type="checkbox" data-facility="selfCheckout" ${s.facilities.selfCheckout?'checked':''}> 셀프 계산대 · 첫 설치 ₩40,000</label><p>줄이 길면 젊은 손님이 직접 계산해요. 알바생과 얼굴을 익힐 기회는 줄고, 가끔 멈춰서 알바생이 도우러 가요. 주류, 담배, 택배는 계산대에서만 돼요.</p></div>
      <div class="facility"><b>행사</b><p>1+1은 하나 사면 하나 더, 2+1은 둘 사면 하나 더 가져가요. 행사 상품을 찾는 손님이 늘지만 공짜로 나간 만큼 매출은 줄어요.</p>
        <div class="promo-grid">${Object.entries(PRODUCTS).filter(([, d]) => !d.counter && !d.staffOnly && d.fixture !== 'counterRack' && (!d.facility || s.facilities[d.facility])).map(([p, d]) => `<label>${esc(d.name)} <select data-promo="${p}"><option value="">없음</option><option value="1+1" ${s.interior.promos[p] === '1+1' ? 'selected' : ''}>1+1</option><option value="2+1" ${s.interior.promos[p] === '2+1' ? 'selected' : ''}>2+1</option></select></label>`).join('')}</div></div>
      ${storeStatus(s)}
      ${wariList(s)}
      <p class="small muted">추가 취식대는 첫 설치 20,000원, 우산 판매대는 5,000원이에요. 구입한 시설은 다시 켤 때 비용이 들지 않아요. 자정에 운영비 12,000원이 정산돼요.</p>
      <table class="grid"><tr><th>오늘</th><td class="num">매출 ${won(today.revenue)}</td></tr><tr><th>계산</th><td class="num">${today.tx}건</td></tr><tr><th>금고</th><td class="num">${won(s.money)}</td></tr>
      ${s.history.slice(-3).reverse().map(h => `<tr><th>DAY ${h.day}</th><td class="num">${won(h.revenue)}, 손님 ${h.customers}명</td></tr>`).join('')}</table>
    </div></div>`;
}

export function renderJournal(el,s){
  const key=JSON.stringify([s.journal,s.lifeHistory,s.offlineReport,s.day]);if(!changed('journal',key))return;
  const offline=s.offlineReport?.items?`<div class="journal-entry"><b>부재중 영업</b><p>${s.offlineReport.items}개 판매 · ${won(s.offlineReport.revenue)}</p><small>재고와 매출만 정산했어요. 인물 이야기는 이어서 진행돼요.</small></div>`:'';
  const days=(s.journal??[]).slice(-7).reverse().map(d=>`<article class="journal-entry"><b>DAY ${d.day}</b><p>매출 ${won(d.revenue)} · 방문 ${d.customers}명 · 우산 반납 ${d.returned}건</p><small>이어지는 일 ${d.open}개${d.highlights.length?' · '+d.highlights.map(t=>esc(EVENT_TITLE[t]??t)).join(', '):''}</small></article>`).join('');
  const life=(s.lifeHistory??[]).slice(-3).reverse().map(e=>`<p class="small">DAY ${e.day} · ${esc(displayName(s,e.id))} · ${esc(e.title)}</p>`).join('');
  el.innerHTML=offline+days+(days?'':'<p class="empty">하루가 지나면 이곳에 영업 기록이 쌓여요.</p>')+life;
}

export function hudText(s) {
  const customers = Object.values(s.actors).filter(a => a.role === 'customer');
  return { occupancy: `손님 ${customers.length}명, ${s.visits.length}팀`, street:`거리 ${s.street?.people.length??0}명`, duty: `근무 ${s.people[s.onDuty].name}${s.shift.handover ? ' (교대 중)' : ''}`, weather: `${seasonAt(s).label} / ${WEATHER_LABEL[s.weather.kind]}` };
}
export { WEEKDAYS };
