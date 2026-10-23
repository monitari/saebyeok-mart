// Entry point: game loop, camera, speech bubbles, saving and the optional model connection.
import { initialState, step, SIM_DT, timeLabel, weekdayLabel, displayName, resolvePending, pendingToDispatch, setFacility, setPromo, setPar, placeOrder, addException, removeException, WORKERS, advanceDialogueTime, settleOffline } from './sim/sim.js';
import { renderScene, hitTestScene as hitTest } from './render/art.js';
import { skyBands } from './render/art-quarter.js';
import { SCENE_WIDTH as WIDTH, SCENE_HEIGHT as HEIGHT, FIT_WIDTH, FIT_HEIGHT, project } from './render/projection.js';
import { renderPeopleStrip, renderPerson, renderLog, renderEvents, renderRoster, renderJournal, hudText, won, resetKeys } from './ui/ui.js';
import {renderDashboard} from './ui/ui-dashboard.js';
import { streetActivity } from './sim/street.js';
import { openDB, writeSlot, readSlot, readLegacy, parseSave, exportText, MAX_IMPORT_BYTES } from './storage/save.js';
import { DialogueService, AI_MODES, testConnection, probeModel, PROXY_AVAILABLE, PAGE_ORIGIN } from './dialogue/ai.js';
import { validateException } from './sim/roster.js';
import { momentTitle, momentView, pinMoment } from './mind/moments.js';
import { WriterLease } from './storage/lease.js';
import { ShopSound } from './ui/sound.js';
import { clockLabel } from './sim/sim.js';
import { esc } from './ui/ui.js';
import { startOpening, restartGuide, noteOpening, guideView } from './sim/opening.js';
import {renderOperations} from './ui/ui-operations.js';
import {MODES,PRIORITIES,setOrderMode,createDraft,setFavorite} from './sim/management.js';
import {stockRows,applyStockBatch} from './sim/stock-tools.js';
import {PRODUCTS} from './sim/data.js';
import {approveDraft,decideRequest} from './sim/sim.js';
import {FIXTURES,floorCell} from './sim/world.js';
import {returnSummary} from './sim/operations-insights.js';

const $ = id => document.getElementById(id);
const canvas = $('scene'), ctx = canvas.getContext('2d'), viewport = $('viewport');
const mobileQuery = matchMedia('(max-width: 900px)');
const dev = new URLSearchParams(location.search).has('dev');

let state = initialState();
let generation = 0;                    // bumps when the whole state object is replaced
const ui = { selected: 'yuna', fixture: null, logFilter: 'all', logFollowing: true, logReadId: null, logNewCount: 0, panel: 'log', sheetPanel: 'ops', sidePanel:'ops', opsTab:'overview', stockFilter:'all',stockProduct:null,orderQty:{}, missed: new Set(), shownCount: 0, follow: false, drawerOpen: false, observing: false };
let speed = 1, paused = false, db = null, saveState = { ok: null, at: null, error: '' }, lastSaveKey = '', saveTimer = 0, importantDirty = 0, saveCount = 0;
const lease=new WriterLease(),sound=new ShopSound();
let worldRate=1,slowDialogue=true,hiddenAt=null;
try{const prefs=JSON.parse(localStorage.getItem('saebyeok-observation')??'{}');worldRate=[.5,1,2].includes(prefs.rate)?prefs.rate:1;slowDialogue=prefs.slow!==false;sound.ambient=Number.isFinite(prefs.ambient)?Math.max(0,Math.min(1,prefs.ambient)):.35;sound.effects=Number.isFinite(prefs.effects)?Math.max(0,Math.min(1,prefs.effects)):.55;}catch{ /* defaults */ }
const readyToPlay=()=>lease.owned&&!paused&&!$('settings').open&&!$('replay').open&&!$('welcome').open&&!$('operations-wide').open&&state.opening?.started!==false;
const playable=()=>readyToPlay()&&!document.hidden;
function storePreferences(){try{localStorage.setItem('saebyeok-observation',JSON.stringify({rate:worldRate,slow:slowDialogue,ambient:sound.ambient,effects:sound.effects}));}catch{ /* session */ }}
$('world-rate').value=String(worldRate);$('slow-dialogue').checked=slowDialogue;
$('ambient-volume').value=String(sound.ambient*100);$('effects-volume').value=String(sound.effects*100);
$('world-rate').onchange=e=>{worldRate=Number(e.target.value);storePreferences();};
$('slow-dialogue').onchange=e=>{slowDialogue=e.target.checked;storePreferences();};
$('ambient-volume').oninput=e=>{sound.ambient=Number(e.target.value)/100;storePreferences();};
$('effects-volume').oninput=e=>{sound.effects=Number(e.target.value)/100;storePreferences();};
async function toggleSound(){try{await sound.enable(sound.muted);for(const id of ['sound-toggle','sound-settings']){$(id).textContent=sound.muted?'소리 꺼짐':'소리 켜짐';$(id).setAttribute('aria-pressed',String(!sound.muted));}}catch(e){toast(e.message);}}
$('sound-toggle').onclick=toggleSound;$('sound-settings').onclick=toggleSound;
function showWriterState(){
  $('writer-banner').hidden=lease.owned;
  for(const id of ['reset','import','save-now','ai-apply'])$(id).disabled=!lease.owned;
  $('panel-ops').inert=!lease.owned;$('panel-roster').inert=!lease.owned;
}
$('writer-retry').onclick=async()=>{
  if(!await lease.acquire()){toast('먼저 영업 중인 다른 창을 닫아 주세요.');return;}
  try{if(db){const saved=await readSlot(db,'current');if(saved)replaceState(parseSave(saved),'최근 기록에서 영업을 이어가요.');}showWriterState();presentWelcome();await collectOffline();}catch(e){lease.release();showWriterState();toast(e.message);}
};
async function collectOffline(from=state.savedAt){
  if(!lease.owned||state.opening?.started===false)return;
  const collectedState=state,report=settleOffline(collectedState,Date.now(),from);await save('offline');
  if(state!==collectedState)return;
  if(report.duration>=60000){ui.returnSummary=returnSummary(state,report);ui.returnDismissed=false;refreshUI(true);toast(`부재중 ${report.items}개 판매 · ${won(report.revenue)} 정산`,{label:'복귀 요약',run:()=>{ui.opsTab='overview';showPanel('ops');}});}
}

// ---------- toast ----------
let toastTimer;
function toast(message, action) {
  const t = $('toast');
  t.replaceChildren(document.createTextNode(message));
  if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = action.run; t.append(b); t.style.pointerEvents = 'auto'; } else t.style.pointerEvents = 'none';
  t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), action ? 7000 : 3200);
}

// ---------- camera ----------
// The scene is drawn 1:1 into an offscreen buffer and copied to the screen at a whole number of
// device pixels per scene pixel. Only a viewport too small for 1:1 falls back to a smooth reduction.
// Camera centres and pointer positions are in projected scene pixels, not simulation tiles.
const sceneCanvas = () => { const c = document.createElement('canvas'); c.width = WIDTH; c.height = HEIGHT; return c; };
const sceneBuffer = sceneCanvas();
const cam = { zoom: 1, cx: WIDTH / 2, cy: HEIGHT / 2 };
const screen = { w: canvas.width, h: canvas.height, dpr: 1 };
function measureScreen(entry) {
  // devicePixelContentBoxSize is exact where supported; ignore it if it disagrees with the ratio (emulation).
  const dpr = devicePixelRatio || 1, r = canvas.getBoundingClientRect(), w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  const box = entry?.devicePixelContentBoxSize?.[0], exact = box && Math.abs(box.inlineSize - w) <= 1 && Math.abs(box.blockSize - h) <= 1;
  screen.dpr = dpr; screen.w = Math.max(1, exact ? box.inlineSize : w); screen.h = Math.max(1, exact ? box.blockSize : h);
  if (canvas.width !== screen.w || canvas.height !== screen.h) { canvas.width = screen.w; canvas.height = screen.h; }
  applyCam();
}
// Zoom steps: the largest whole scale at which the store fits (or the reduced fit), then each further whole multiple.
const fitScale = (w, h) => Math.min(w / FIT_WIDTH, h / FIT_HEIGHT);
function zoomLevels() {
  const fit = fitScale(screen.w, screen.h), base = fit >= 1 ? Math.floor(fit) : fit, out = [base];
  for (let n = Math.floor(base) + 1; n <= Math.min(12, Math.max(Math.floor(base) + 3, Math.floor(fit * 4))); n++) out.push(n);
  return out;
}
function levelIndex(z = cam.zoom) {
  const levels = zoomLevels(), want = levels[0] * z; let best = 0;
  for (let i = 1; i < levels.length; i++) if (Math.abs(Math.log(levels[i] / want)) < Math.abs(Math.log(levels[best] / want))) best = i;
  return best;
}
const deviceScale = () => zoomLevels()[levelIndex()];
const cssScale = () => deviceScale() / screen.dpr;
function snapZoom(z) { const levels = zoomLevels(); return levels[levelIndex(z)] / levels[0]; }
function clampCam() {
  const n = deviceScale(), halfW = screen.w / n / 2, halfH = screen.h / n / 2;
  cam.cx = halfW * 2 >= WIDTH ? WIDTH / 2 : Math.max(halfW, Math.min(WIDTH - halfW, cam.cx));
  cam.cy = halfH * 2 >= HEIGHT ? HEIGHT / 2 : Math.max(halfH, Math.min(HEIGHT - halfH, cam.cy));
}
// Top-left of the scene in device pixels, always whole so no column is stretched more than another.
function origin() { const n = deviceScale(); return { x: Math.round(screen.w / 2 - cam.cx * n), y: Math.round(screen.h / 2 - cam.cy * n), n }; }
function applyCam() {
  cam.zoom = snapZoom(cam.zoom);
  const i = levelIndex(), levels = zoomLevels(), n = levels[i];
  if (i === 0) { cam.cx = WIDTH / 2; cam.cy = HEIGHT / 2; } else clampCam();
  $('zoom-level').textContent = n >= 1 ? `×${n}` : `${Math.round(n * 100)}%`;
  $('zoom-level').title = n >= 1 ? `화면 픽셀 ${n}배` : '창이 좁아 매장을 축소해서 보여요';
  for (const b of document.querySelectorAll('[data-zoom]')) b.disabled = (b.dataset.zoom === 'out' && i === 0) || (b.dataset.zoom === 'in' && i === levels.length - 1);
}
function blit(c, source, w, h, n, x, y, s) {
  c.setTransform(1, 0, 0, 1, 0, 0);
  // Continue the scene's sky bands past the buffer edge, row for row, so the diorama has no visible frame.
  const sky = skyBands(s);
  sky.forEach((band, i) => { const top = i ? Math.round(y + band.y0 * n) : 0, bottom = i === sky.length - 1 ? h : Math.round(y + band.y1 * n); c.fillStyle = band.color; c.fillRect(0, top, w, bottom - top); });
  c.imageSmoothingEnabled = n < 1; c.imageSmoothingQuality = 'high';
  c.drawImage(source, x, y, WIDTH * n, HEIGHT * n);
}
function present() { const o = origin(); blit(ctx, sceneBuffer, screen.w, screen.h, o.n, o.x, o.y, state); }
function worldToScreen(x, y, z=0) { const p = project(x, y, z), o = origin(); return { x: (o.x + p.x * o.n) / screen.dpr, y: (o.y + p.y * o.n) / screen.dpr, k: o.n / screen.dpr }; }
function screenToScene(px, py) { const r = canvas.getBoundingClientRect(), o = origin(); return { x: ((px - r.left) * screen.dpr - o.x) / o.n, y: ((py - r.top) * screen.dpr - o.y) / o.n }; }
function setZoom(z, anchor) {
  const before = anchor ? screenToScene(anchor.x, anchor.y) : null;
  cam.zoom = snapZoom(Math.max(.01, z));
  if (before) { const after = screenToScene(anchor.x, anchor.y); cam.cx += before.x - after.x; cam.cy += before.y - after.y; }
  applyCam();
}
function stepZoom(dir, anchor) { const levels = zoomLevels(), i = Math.max(0, Math.min(levels.length - 1, levelIndex() + dir)); setZoom(levels[i] / levels[0], anchor); }
function defaultZoom() { if (mobileQuery.matches) { cam.zoom = 2; ui.follow = true; } else { cam.zoom = 1; } setFollow(ui.follow); applyCam(); }
function setFollow(on) { ui.follow = on; $('follow').setAttribute('aria-pressed', String(on)); }

// Pointer input: drag to pan, pinch to zoom, tap to select.
const pointers = new Map();
let drag = null;
viewport.addEventListener('pointerdown', e => {
  if (e.target.closest('.zoom')) return;
  viewport.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  drag = { x: e.clientX, y: e.clientY, cx: cam.cx, cy: cam.cy, moved: false, dist: pinchDist(), zoom: cam.zoom };
});
function pinchDist() { const p = [...pointers.values()]; return p.length === 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0; }
viewport.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId) || !drag) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const k = cssScale();
  if (pointers.size === 2 && drag.dist) {
    const p = [...pointers.values()], mid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
    setZoom(drag.zoom * pinchDist() / drag.dist, mid); drag.moved = true; setFollow(false); return;
  }
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.hypot(dx, dy) > 6) { drag.moved = true; setFollow(false); }
  if (drag.moved && cam.zoom > 1) { cam.cx = drag.cx - dx / k; cam.cy = drag.cy - dy / k; applyCam(); }
});
function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (drag && !drag.moved && pointers.size === 0) {
    const w = screenToScene(e.clientX, e.clientY), hit = hitTest(state, w.x, w.y,{selected:ui.selected,offsets});
    if (hit?.type === 'person') select(hit.id);
    else if(hit?.type==='street'){const a=state.street.people.find(a=>a.id===hit.id);if(a)toast(`지나가는 사람 · ${streetActivity(a)}`);}
    else if (hit?.type === 'fixture') { ui.fixture = hit.id;ui.stockProduct=null;ui.stockFilter='all';ui.opsTab='stock';showPanel('ops'); }
  }
  if (pointers.size === 0) drag = null;
}
viewport.addEventListener('pointerup', endPointer);
viewport.addEventListener('pointercancel', endPointer);
// Trackpads send many small deltas; one whole-pixel zoom step per notch-sized amount.
let wheelSum = 0;
viewport.addEventListener('wheel', e => {
  e.preventDefault(); wheelSum += e.deltaMode ? e.deltaY * 40 : e.deltaY;
  if (Math.abs(wheelSum) >= 60) { stepZoom(wheelSum < 0 ? 1 : -1, { x: e.clientX, y: e.clientY }); wheelSum = 0; }
}, { passive: false });
for (const b of document.querySelectorAll('[data-zoom]')) b.onclick = () => {
  const z=b.dataset.zoom;
  if(z==='fit'){cam.zoom=1;setFollow(false);applyCam();}
  else if(z==='store'){const p=project(384,288,28);cam.cx=p.x;cam.cy=p.y;setFollow(false);setZoom(1.8);}
  else stepZoom(z==='in'?1:-1);
};
$('follow').onclick = () => { setFollow(!ui.follow); if (ui.follow && cam.zoom < 1.4) setZoom(1.8); };
new ResizeObserver(entries => measureScreen(entries[0])).observe(canvas);
new ResizeObserver(entries => {
  document.documentElement.style.setProperty('--topbar-height', `${Math.ceil(entries[0].target.getBoundingClientRect().height)}px`);
}).observe(document.querySelector('.topbar'));

function setObservation(on) {
  ui.observing = on; document.body.classList.toggle('observing', on);
  $('observation-toggle').setAttribute('aria-pressed', String(on));
  $('observation-toggle').textContent = on ? '패널 다시 열기' : '관찰 모드';
  $('observation-toggle').title = on ? '인물과 기록 패널 다시 열기' : '패널을 접고 매장을 크게 보기';
  $('inspector').inert = on;
  applyCam();
}
$('observation-toggle').onclick = () => setObservation(!ui.observing);

function select(id) {
  ui.selected = id; ui.fixture = null;
  if(noteOpening(state,'person',id))requestSave();
  if(!ui.observing)showPanel('person');
  refreshUI(true);
}

// ---------- first observation ----------
function presentWelcome(){
  if(!lease.owned||state.opening?.started!==false)return;
  ui.selected=state.onDuty;ui.fixture=null;
  $('welcome-sound').checked=!sound.muted;
  $('welcome-storage').hidden=!!db;
  $('welcome-storage').textContent=db?'':'이 브라우저에서는 자동 저장을 사용할 수 없어요. 설정에서 진행 상황을 파일로 내보낼 수 있어요.';
  if(!$('welcome').open)$('welcome').showModal();
}
let enteringOpening=false;
async function enterOpening(skip=false){
  if(!lease.owned||state.opening?.started!==false||enteringOpening)return;
  enteringOpening=true;$('welcome-start').disabled=true;$('welcome-skip').disabled=true;
  // Resume audio during this user gesture; a failed audio device must not block the game.
  if($('welcome-sound').checked===sound.muted)await toggleSound();
  startOpening(state,skip);$('welcome').close();setSpeed(1);setPaused(false);
  acc=0;ui.selected=state.onDuty;ui.fixture=null;cam.cx=WIDTH/2;cam.cy=HEIGHT/2;defaultZoom();
  refreshUI(true);await save('start');
  enteringOpening=false;$('welcome-start').disabled=false;$('welcome-skip').disabled=false;
}
$('welcome-start').onclick=()=>enterOpening(false);
$('welcome-skip').onclick=()=>enterOpening(true);
$('welcome').addEventListener('cancel',e=>{e.preventDefault();enterOpening(true);});
function refreshOpeningGuide(){
  const guide=guideView(state);$('opening-guide').hidden=!guide;
  if(!guide)return;
  $('opening-guide-step').textContent=guide.complete?'첫 관찰 완료':`첫 관찰 ${guide.step} / 3`;
  $('opening-guide-title').textContent=guide.title;$('opening-guide-text').textContent=guide.text;
  $('opening-guide-action').textContent=guide.label;
}
$('opening-guide-action').onclick=()=>{
  const guide=guideView(state);if(!guide)return;
  if(guide.action==='person')select(guide.target);
  if(guide.action==='moment')watchMoment(guide.target);
  if(guide.action==='memory'){
    select(guide.target);noteOpening(state,'memory',guide.target);
    $('person-detail').querySelector('[data-memory-section]')?.scrollIntoView({block:'nearest'});
  }
  if(guide.action==='overview'){setFollow(false);setZoom(1);}
  if(guide.action==='dismiss')noteOpening(state,'dismiss');
  requestSave();refreshOpeningGuide();
};
$('opening-guide-dismiss').onclick=()=>{noteOpening(state,'dismiss');requestSave();refreshOpeningGuide();};
$('opening-guide-restart').onclick=()=>{restartGuide(state);$('settings').close();setObservation(false);requestSave();refreshUI(true);};

// ---------- recorded moments ----------
let knownMoments = new Set(), alertId = null, alertUntil = 0, momentsKey = null, autoFocus = false;
try { autoFocus = localStorage.getItem('saebyeok-auto-focus') === 'true'; } catch { /* session only */ }
$('moment-auto-focus').checked = autoFocus;
$('moment-auto-focus').onchange = e => { autoFocus = e.target.checked; try { localStorage.setItem('saebyeok-auto-focus', String(autoFocus)); } catch { /* session only */ } };
let replayMoment = null, replayIndex = 0, replayPlaying = false, replayLast = 0;
const deferredAiResults = [];
const replayCanvas = $('replay-canvas'), replayContext = replayCanvas.getContext('2d'), replayBuffer = sceneCanvas();
// Recordings are framed on the people involved at the largest whole-pixel scale that keeps them all in view.
function presentReplay(view, m) {
  const r = replayCanvas.getBoundingClientRect(), dpr = devicePixelRatio || 1, w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (replayCanvas.width !== w || replayCanvas.height !== h) { replayCanvas.width = w; replayCanvas.height = h; }
  const pts = m.actors.map(id => view.actors[id]).filter(Boolean).map(a => project(a.x, a.y, 25)), fit = fitScale(w, h);
  let n = fit >= 1 ? Math.floor(fit) : fit, cx = WIDTH / 2, cy = HEIGHT / 2;
  if (pts.length) {
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y), bw = Math.max(...xs) - Math.min(...xs) + 220, bh = Math.max(...ys) - Math.min(...ys) + 160;
    n = Math.max(n, Math.min(3, Math.floor(Math.min(w / bw, h / bh)))); cx = (Math.max(...xs) + Math.min(...xs)) / 2; cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  }
  const halfW = w / n / 2, halfH = h / n / 2;
  cx = halfW * 2 >= WIDTH ? WIDTH / 2 : Math.max(halfW, Math.min(WIDTH - halfW, cx));
  cy = halfH * 2 >= HEIGHT ? HEIGHT / 2 : Math.max(halfH, Math.min(HEIGHT - halfH, cy));
  blit(replayContext, replayBuffer, w, h, n, Math.round(w / 2 - cx * n), Math.round(h / 2 - cy * n), view);
}
const momentIsLive = m => !m.complete && state.conversations.some(c => m.convIds.includes(c.id));
function focusMoment(m) {
  const id = m.actors.find(id => state.actors[id]);
  if (id) { ui.selected = id; ui.fixture = null; }
  setFollow(false);
  const a = id ? state.actors[id] : m.place;
  const p=project(a.x,a.y,25);cam.zoom = Math.max(cam.zoom, 1.8); cam.cx = p.x; cam.cy = p.y; applyCam();
  m.seen = true; noteOpening(state,'moment',m.id);requestSave(); refreshUI(true);
}
function openReplay(m) {
  if (!m?.frames.length) return;
  noteOpening(state,'moment',m.id);
  m.seen = true; requestSave(); replayMoment = structuredClone(m); replayIndex = 0; replayPlaying = true; replayLast = performance.now();
  $('replay-title').textContent = momentTitle(m);
  $('replay-meta').textContent = `DAY ${m.day} ${clockLabel(m.at)} · ${m.actors.map(id => m.labels[id]).join(', ')}${m.complete ? '' : ' · 현재까지 기록된 부분'}`;
  $('replay-seek').max = String(m.frames.length - 1);
  const source = { rule:'규칙', ai:'AI', fallback:'대체', mock:'테스트' };
  $('replay-lines').innerHTML = m.lines.length ? m.lines.map(l => `<li data-at="${l.at}"><time>${clockLabel(l.at)}</time><div><b>${esc(m.labels[l.speaker])}</b>${l.to ? ` → ${esc(m.labels[l.to])}` : ''}<span class="src">${esc(source[l.source] ?? l.source)}</span><br>${esc(l.text)}</div></li>`).join('') : '<li class="empty">기록된 대사 없이 행동만 남은 장면이에요.</li>';
  $('replay').showModal(); renderReplay(); refreshMoments();
}
function renderReplay() {
  if (!replayMoment) return;
  const m = replayMoment, view = momentView(state, m, replayIndex), at = view.clock;
  renderScene(replayBuffer.getContext('2d'), view, { now:view.elapsed * 1000, selected:m.actors[0], related:m.actors.slice(1) });
  presentReplay(view, m);
  const recent = m.lines.filter(l => l.at <= at && at - l.at < 2).slice(-2);
  $('replay-caption').replaceChildren();
  for (const l of recent) { const p=document.createElement('div'); p.textContent=`${m.labels[l.speaker]}: ${l.text}`; $('replay-caption').append(p); }
  $('replay-seek').value = String(replayIndex);
  $('replay-position').textContent = clockLabel(at);
  $('replay-seek').setAttribute('aria-valuetext', `게임 시간 ${clockLabel(at)}`);
  $('replay-play').textContent = replayPlaying ? 'Ⅱ' : '▶';
  $('replay-play').setAttribute('aria-label', replayPlaying ? '다시 보기 일시정지' : '다시 보기 재생');
  for (const li of $('replay-lines').children) li.classList.toggle('future', Number(li.dataset.at) > at);
}
$('replay-play').onclick = () => { if (!replayMoment) return; if (replayIndex === replayMoment.frames.length - 1) replayIndex = 0; replayPlaying = !replayPlaying; replayLast = performance.now(); renderReplay(); };
$('replay-seek').oninput = e => { replayIndex = Number(e.target.value); replayPlaying = false; renderReplay(); };
$('replay').addEventListener('close', () => {
  replayMoment = null; replayPlaying = false;
});
function watchMoment(id) {
  const m = state.moments?.find(m => m.id === id); if (!m) return;
  if (momentIsLive(m) && m.actors.some(id => state.actors[id])) focusMoment(m); else openReplay(m);
  if (alertId === id) { alertId = null; $('moment-alert').hidden = true; }
}
function refreshMoments() {
  const moments = state.moments ?? [], now = performance.now();
  const fresh = moments.filter(m => !knownMoments.has(m.id));
  for (const m of fresh) knownMoments.add(m.id);
  if (knownMoments.size > 40) knownMoments = new Set(moments.map(m => m.id));
  const announced=fresh.filter(m=>m.notify!==false);
  if (announced.length) {
    const newest = announced.at(-1); alertId = newest.id; alertUntil = now + 12000;
    if (autoFocus && !paused && !$('settings').open && !$('replay').open) focusMoment(newest);
  }
  const alert = moments.find(m => m.id === alertId);
  $('moment-alert').hidden = !alert || now > alertUntil;
  if (alert) { $('moment-alert-text').textContent = `${momentIsLive(alert) ? '지금' : '방금'} · ${momentTitle(alert)}`; $('moment-watch').textContent = momentIsLive(alert) ? '지금 보기' : '다시 보기'; }
  const unread = moments.filter(m => !m.seen).length;
  $('moment-count').textContent = unread ? `안 본 장면 ${unread}개` : '잠깐 머물렀던 순간들';
  for (const badge of document.querySelectorAll('.unread-count')) { badge.textContent = String(unread); badge.hidden = !unread; }
  const key = `${state.day}|` + moments.map(m => `${m.id}:${m.type}:${m.confirmed}:${m.complete}:${m.seen}:${m.pinned}:${momentIsLive(m)}`).join('|');
  if (momentsKey === key) return; momentsKey = key;
  const card = m => `<button class="moment-card${m.seen ? '' : ' is-unread'}" data-moment="${esc(m.id)}"><span class="moment-card-time">DAY ${m.day} <time>${clockLabel(m.at)}</time>${m.seen ? '' : '<i aria-label="아직 안 본 장면"></i>'}</span><strong>${esc(momentTitle(m))}</strong><small>${m.actors.map(id => esc(m.labels[id])).join(', ')}</small><span class="moment-card-action${momentIsLive(m) ? ' is-live' : ''}">${momentIsLive(m) ? '지금 보기 ↗' : '다시 보기 →'}</span></button>`;
  const today = moments.filter(m => m.day === state.day).slice(-3).reverse();
  const focused = document.activeElement;
  const focusMomentId = focused?.dataset.moment ?? focused?.dataset.replay ?? focused?.dataset.pin;
  const focusContainer = $('moment-cards').contains(focused) ? $('moment-cards') : $('moment-archive').contains(focused) ? $('moment-archive') : null;
  const focusAttribute = focused?.dataset.pin ? 'pin' : focused?.dataset.replay ? 'replay' : 'moment';
  $('moment-cards').innerHTML = today.length ? today.map(card).join('') : '<p class="empty small">이야기가 시작되면 이곳에 장면이 남아요.</p>';
  $('moment-archive').innerHTML = moments.length ? [...moments].sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.at-a.at).map(m => `<article class="moment-tile">${card(m)}<button class="recorded-part" data-pin="${esc(m.id)}" aria-pressed="${!!m.pinned}">${m.pinned?'★ 간직하는 중':'☆ 이 장면 간직하기'}</button>${!m.complete ? `<button class="recorded-part" data-replay="${esc(m.id)}">지금까지 기록된 부분 보기</button>` : ''}</article>`).join('') : '<p class="empty">아직 기록된 장면이 없어요.</p>';
  if (focusContainer && focusMomentId) [...focusContainer.querySelectorAll(`[data-${focusAttribute}]`)].find(b => b.dataset[focusAttribute] === focusMomentId)?.focus({ preventScroll: true });
}
$('moment-watch').onclick = () => watchMoment(alertId);
$('moment-dismiss').onclick = () => { alertId = null; $('moment-alert').hidden = true; };
$('moments-all').onclick = () => { showPanel('events'); if (mobileQuery.matches) { $('inspector').classList.add('open'); $('sheet-handle').setAttribute('aria-expanded', 'true'); } };
document.addEventListener('click', e => { const pin=e.target.closest('[data-pin]');if(pin){if(!pinMoment(state,pin.dataset.pin))toast('간직할 수 있는 장면은 4개예요.');requestSave();refreshMoments();return;} const replay=e.target.closest('[data-replay]'); const card=e.target.closest('[data-moment]'); if (replay) openReplay(state.moments.find(m => m.id === replay.dataset.replay)); else if (card) watchMoment(card.dataset.moment); });

// ---------- speech bubbles ----------
// Few bubbles at once, one per speaker, selected person's lines first. Anything skipped stays in the log.
const bubbleState = { lastLogId: null, queue: [], shown: [] };
function bubbleLimit() { return mobileQuery.matches ? 2 : 3; }
function collectLines() {
  const log = state.log;
  let start = 0;
  if (bubbleState.lastLogId) { const i = log.findIndex(l => l.id === bubbleState.lastLogId); start = i >= 0 ? i + 1 : Math.max(0, log.length - 3); }
  else start = log.length;
  for (const l of log.slice(start)) bubbleState.queue.push({ ...l, queuedAt: performance.now() });
  if (log.length) bubbleState.lastLogId = log.at(-1).id;
}
function related(id) {
  const sel = ui.selected, a = state.actors[sel];
  return id === sel || (a?.visitId && state.actors[id]?.visitId === a.visitId);
}
function updateBubbles(now) {
  collectLines();
  bubbleState.shown = bubbleState.shown.filter(b => now < b.until && state.actors[b.speaker]);
  // Drop lines that waited too long; they remain readable in the log.
  const maxWait = 2600 / Math.max(1, Math.sqrt(speed));
  bubbleState.queue = bubbleState.queue.filter(q => { if (now - q.queuedAt > maxWait || !state.actors[q.speaker]) { ui.missed.add(q.id); return false; } return true; });
  bubbleState.queue.sort((a, b) => (related(b.speaker) ? 1 : 0) - (related(a.speaker) ? 1 : 0));
  while (bubbleState.queue.length) {
    const q = bubbleState.queue[0];
    const same = bubbleState.shown.findIndex(b => b.speaker === q.speaker);
    if (same >= 0) bubbleState.shown.splice(same, 1);
    if (bubbleState.shown.length >= bubbleLimit()) {
      // A line from the selected group may replace the oldest unrelated bubble.
      const victim = bubbleState.shown.findIndex(b => !related(b.speaker));
      if (!related(q.speaker) || victim < 0) break;
      bubbleState.shown.splice(victim, 1);
    }
    bubbleState.queue.shift();
    const dur = (2400 + q.text.length * 70) / Math.max(1, Math.pow(speed, .45));
    bubbleState.shown.push({ ...q, until: now + dur, shownAt: now });
  }
  if (ui.missed.size > 400) ui.missed = new Set([...ui.missed].slice(-300));
  drawBubbles(now);
}
function drawBubbles(now) {
  const layer = $('bubbles'), r = viewport.getBoundingClientRect();
  const existing = new Map([...layer.children].map(el => [el.dataset.id, el]));
  const placed = [];
  const order = [...bubbleState.shown].sort((a, b) => state.actors[b.speaker].y - state.actors[a.speaker].y);
  for (const b of order) {
    if(state.actors[b.speaker].privateRoom)continue;
    const a = state.actors[b.speaker],off=offsets[a.id]??{x:0,y:0},p = worldToScreen(a.x+off.x,a.y+off.y,a.anim === 'eat' ? 44 : 54);
    let el = existing.get(b.id);
    if (!el) {
      el = document.createElement('div');
      el.dataset.id = b.id;
      const isWorker = state.people[b.speaker].kind === 'worker';
      el.className = `bubble${isWorker ? ' worker' : ''}${b.source === 'ai' ? ' ai' : ''}`;
      const who = document.createElement('small');
      who.textContent = b.to && state.people[b.to] ? `${displayName(state, b.speaker)} → ${displayName(state, b.to)}` : displayName(state, b.speaker);
      el.append(who, document.createTextNode(b.text), document.createElement('i'));
      layer.append(el);
    }
    existing.delete(b.id);
    el.classList.toggle('focus', related(b.speaker));
    el.classList.toggle('fade', now > b.until - 250);
    const w = el.offsetWidth || 140, h = el.offsetHeight || 40;
    let x = Math.max(w / 2 + 6, Math.min(r.width - w / 2 - 6, p.x)), y = Math.max(h + 6, p.y);
    // Move up past bubbles already placed so none cover each other.
    for (let guard = 0; guard < 6; guard++) {
      const hit = placed.find(o => Math.abs(o.x - x) < (o.w + w) / 2 + 4 && Math.abs(o.y - y) < (o.h + h) / 2 + 2);
      if (!hit) break;
      y = hit.y - hit.h - 4;
      if (y < h + 6) { y = Math.max(h + 6, p.y); x = hit.x + (hit.w + w) / 2 + 6 < r.width - w / 2 ? hit.x + (hit.w + w) / 2 + 6 : hit.x - (hit.w + w) / 2 - 6; }
    }
    placed.push({ x, y, w, h });
    el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
    el.style.visibility = p.x < -40 || p.x > r.width + 40 || p.y < -20 || p.y > r.height + 60 ? 'hidden' : 'visible';
  }
  for (const el of existing.values()) el.remove();
  ui.shownCount = bubbleState.shown.length;
}

// Keeps two people standing on the same spot from drawing exactly on top of each other.
const offsets = {};
function separate() {
  const list = Object.values(state.actors).filter(a=>!a.privateRoom);
  for (const a of list) offsets[a.id] ??= { x: 0, y: 0 };
  for (const id of Object.keys(offsets)) if (!state.actors[id]) delete offsets[id];
  for (let i = 0; i < list.length; i++) {
    let tx = 0;
    for (let j = 0; j < list.length; j++) {
      if (i === j) continue;
      const a = list[i], b = list[j], dx = a.x - b.x, dy = a.y - b.y;
      if (Math.abs(dx) < 14 && Math.abs(dy) < 8) tx += (dx === 0 ? (a.id < b.id ? -1 : 1) : Math.sign(dx)) * 7;
    }
    const o = offsets[list[i].id];
    o.x += (Math.max(-10, Math.min(10, tx)) - o.x) * .15;
    const a=list[i],opts={staff:a.role==='worker',facilities:state.facilities};
    if(!floorCell(Math.floor((a.x+o.x-3)/32),Math.floor(a.y/32),opts)||!floorCell(Math.floor((a.x+o.x+3)/32),Math.floor(a.y/32),opts))o.x=0;
  }
}

// ---------- panels ----------
const panels = { person: $('panel-person'), log: $('panel-log'), events: $('panel-events'), roster: $('panel-roster'), ops: $('panel-ops') };
function placePanels() {
  const body = $('inspector-body'), drawer = $('drawer');
  if (mobileQuery.matches) {
    for (const [k, el] of Object.entries(panels)) { body.append(el); el.hidden = k !== ui.sheetPanel; }
  } else {
    for(const k of ['person','ops']){body.append(panels[k]);panels[k].hidden=k!==ui.sidePanel;}
    for (const k of ['log', 'events', 'roster']) { drawer.append(panels[k]); panels[k].hidden = k !== ui.panel; }
  }
  if($('operations-wide').open){$('operations-wide-body').append(panels.ops);panels.ops.hidden=false;}
  $('inspector-title').textContent=ui.sidePanel==='person'?'사람 살펴보기':'매장 운영';
  $('inspector-description').textContent=ui.sidePanel==='person'?'직접 본 일과 전해 들은 이야기가 쌓여요.':'재고를 준비하고, 사람들의 하루를 지켜봐요.';
  $('ops-expand').hidden=ui.sidePanel!=='ops';
  for (const b of document.querySelectorAll('.drawer-tabs [role=tab]')) b.setAttribute('aria-selected', String(b.dataset.panel === ui.panel));
  for (const b of document.querySelectorAll('.sheet-tabs [role=tab]')) b.setAttribute('aria-selected', String(b.dataset.panel === ui.sheetPanel));
  for (const b of document.querySelectorAll('[role=tab]')) { b.tabIndex = b.getAttribute('aria-selected') === 'true' ? 0 : -1; b.setAttribute('aria-controls', `panel-${b.dataset.panel}`); }
  $('drawer').classList.toggle('closed', !ui.drawerOpen);
  $('drawer-toggle').textContent = ui.drawerOpen ? '접기' : '펼치기';
  $('drawer-toggle').setAttribute('aria-expanded', String(ui.drawerOpen));
  $('sheet-title').textContent = { person: '인물', log: '대화 기록', events: '사건', roster: '근무표', ops: '발주와 시설' }[ui.sheetPanel];
}
function showPanel(name) {
  if(name!=='ops'&&$('operations-wide').open)$('operations-wide').close();
  if (ui.observing) setObservation(false);
  if (mobileQuery.matches) {ui.sheetPanel = name;$('inspector').classList.add('open');$('sheet-handle').setAttribute('aria-expanded','true');}
  else if(['ops','person'].includes(name))ui.sidePanel=name;
  else { ui.panel = name; ui.drawerOpen = true; }
  placePanels(); refreshUI(true);
}
for (const b of document.querySelectorAll('.drawer-tabs [role=tab]')) b.onclick = () => { if (ui.panel === b.dataset.panel && ui.drawerOpen) ui.drawerOpen = false; else { ui.panel = b.dataset.panel; ui.drawerOpen = true; } placePanels(); refreshUI(true); };
for (const b of document.querySelectorAll('.sheet-tabs [role=tab]')) b.onclick = () => { ui.sheetPanel = b.dataset.panel; $('inspector').classList.add('open'); $('sheet-handle').setAttribute('aria-expanded', 'true'); placePanels(); refreshUI(true); };
$('drawer-toggle').onclick = () => { ui.drawerOpen = !ui.drawerOpen; placePanels(); };
$('sheet-handle').onclick = () => { const open = !$('inspector').classList.contains('open'); $('inspector').classList.toggle('open', open); $('sheet-handle').setAttribute('aria-expanded', String(open)); };
$('ops-expand').onclick=()=>{$('operations-wide').showModal();placePanels();refreshUI(true);};
$('operations-close').onclick=()=>$('operations-wide').close();
$('operations-wide').addEventListener('close',()=>{placePanels();refreshUI(true);});
$('order-mode').onchange=e=>{if(!lease.owned)return;setOrderMode(state,e.target.value);requestSave();refreshUI(true);};
mobileQuery.addEventListener('change', () => { placePanels(); defaultZoom(); resetKeys(); refreshUI(true); });
$('log-filter').onchange = e => { ui.logFilter = e.target.value; ui.logFollowing = true; ui.logReadId = null; refreshUI(true); };
$('log-follow').onclick = () => { ui.logFollowing = !ui.logFollowing; refreshUI(true); };
$('log-latest').onclick = () => { ui.logFollowing = true; refreshUI(true); };
$('log-scroll').addEventListener('scroll', () => {
  const el = $('log-scroll');
  if (ui.logFollowing && el.scrollHeight - el.scrollTop - el.clientHeight > 40) { ui.logFollowing = false; refreshLogControls(); }
}, { passive: true });
function refreshLogControls() {
  $('log-follow').setAttribute('aria-pressed', String(ui.logFollowing));
  $('log-follow').textContent = ui.logFollowing ? '자동 이동 켜짐' : '자동 이동 꺼짐';
  $('log-latest').hidden = ui.logFollowing;
  $('log-latest').textContent = ui.logNewCount ? `새 대화 ${ui.logNewCount}개 ↓` : '최신 대화로 ↓';
}
document.addEventListener('keydown', e => {
  const tab = e.target.closest('[role=tab]');
  if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  const tabs = [...tab.closest('[role=tablist]').querySelectorAll('[role=tab]')];
  const index = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  e.preventDefault(); tabs[index].focus(); if (tabs[index] !== tab) tabs[index].click();
});
$('people-strip').addEventListener('click', e => { const b = e.target.closest('[data-person]'); if (b) select(b.dataset.person); });
$('person-detail').addEventListener('click', e => {
  const action = e.target.closest('[data-person-action]')?.dataset.personAction;
  if (action === 'locate' && state.actors[ui.selected]) {
    const a = state.actors[ui.selected],p=project(a.x,a.y,25);cam.cx = p.x; cam.cy = p.y; setZoom(Math.max(1.8, cam.zoom)); setFollow(true);
    if (mobileQuery.matches) { $('inspector').classList.remove('open'); $('sheet-handle').setAttribute('aria-expanded', 'false'); }
  }
  if (action === 'conversation') { ui.logFilter = 'person'; $('log-filter').value = 'person'; ui.logFollowing = true; ui.logReadId = null; showPanel('log'); if (mobileQuery.matches) { $('inspector').classList.add('open'); $('sheet-handle').setAttribute('aria-expanded', 'true'); } }
});

// Roster and operations use delegated handlers because their DOM is rebuilt.
document.addEventListener('submit', e => {
  if (e.target.id !== 'exception-form') return;
  e.preventDefault();
  const f = new FormData(e.target), type = f.get('type');
  const x = { day: Number(f.get('day')), shift: f.get('shift'), type, worker: type === 'substitute' ? f.get('worker') : null, minutes: ['late', 'overtime'].includes(type) ? Number(f.get('minutes')) : undefined, note: '직접 추가' };
  const err = validateException(x, WORKERS);
  if (err) { $('roster-message').textContent = err; return; }
  addException(state, x); requestSave(); refreshUI(true);
});
document.addEventListener('click', e => {
  const selection=e.target.closest('[data-stock-select]');if(selection){ui.stockSelected=selection.dataset.stockSelect==='clear'?[]:[...new Set([...(ui.stockSelected??[]),...stockRows(state,ui).map(r=>r.p)])];refreshUI(true);return;}
  if(e.target.closest('[data-alert-expand]')){ui.showAllAlerts=!ui.showAllAlerts;refreshUI(true);return;}
  if(e.target.closest('[data-return-dismiss]')){ui.returnDismissed=true;refreshUI(true);return;}
  if(e.target.closest('[data-return-show]')){ui.returnDismissed=false;refreshUI(true);return;}
  if(e.target.closest('[data-ops-requests]')){ui.opsTab='overview';ui.returnDismissed=true;showPanel('ops');$('ops-view').querySelector('[data-requests-area]')?.scrollIntoView({block:'center',behavior:'smooth'});return;}
  const open=e.target.closest('[data-open-panel]');if(open){showPanel(open.dataset.openPanel);return;}
  const person=e.target.closest('[data-open-person]');if(person){select(person.dataset.openPerson);return;}
  const tab=e.target.closest('[data-ops-tab]');if(tab){ui.opsTab=tab.dataset.opsTab;if(tab.closest('#store-pulse'))showPanel('ops');else refreshUI(true);return;}
  const prod=e.target.closest('[data-stock-product]');if(prod){ui.opsTab='stock';ui.stockProduct=prod.dataset.stockProduct;ui.fixture=null;ui.stockFilter='all';showPanel('ops');return;}
  if(e.target.closest('[data-stock-clear]')){ui.stockProduct=null;ui.fixture=null;ui.stockFilter='all';refreshUI(true);return;}
  const loc=e.target.closest('[data-locate-fixture]');if(loc){const f=FIXTURES[loc.dataset.locateFixture];if(f){ui.fixture=loc.dataset.locateFixture;const p=project((f.x+f.w/2)*32,(f.y+f.h/2)*32,25);cam.cx=p.x;cam.cy=p.y;setFollow(false);setZoom(1.8);if($('operations-wide').open)$('operations-wide').close();if(loc.closest('#store-pulse')){ui.opsTab='stock';ui.stockProduct=null;showPanel('ops');}else refreshUI(true);}return;}
  if(!lease.owned)return;
  const star=e.target.closest('[data-stock-favorite]');if(star){const p=star.dataset.stockFavorite;if(!setFavorite(state,p,!state.management.favorites.includes(p)))toast('즐겨찾기는 최대 8개까지 담을 수 있어요.');requestSave();refreshUI(true);return;}
  const batch=e.target.closest('[data-stock-batch]');if(batch){
    const action=batch.dataset.stockBatch,par=$('ops-view').querySelector('[data-bulk-par]')?.value;
    if(action==='par'&&!par?.trim()){toast('적용할 기준 재고를 입력해 주세요.');return;}
    const value=action==='par'?Number(par):action==='mode'?$('ops-view').querySelector('[data-bulk-mode]')?.value:true;
    const result=applyStockBatch(state,ui.stockSelected??[],action,value);toast(result.message);if(result.ok)requestSave();document.activeElement?.blur();refreshUI(true);return;
  }
  const draft=e.target.closest('[data-draft]');if(draft){const action=draft.dataset.draft;if(action==='create')createDraft(state);else if(action==='cancel')state.management.draft=null;else toast(approveDraft(state).message);requestSave();refreshUI(true);return;}
  const req=e.target.closest('[data-request]');if(req){toast(decideRequest(state,req.dataset.request,req.dataset.accept==='yes')?'손님 부탁을 처리했어요.':'발주 수량과 잔액을 확인해 주세요.');requestSave();refreshUI(true);return;}
  const facility=e.target.closest('[data-install]');if(facility){const key=facility.dataset.install;if(!setFacility(state,key,!state.facilities[key]))toast('비용이나 시설 사용 상태를 확인해 주세요.');requestSave();refreshUI(true);return;}
  const rm = e.target.closest('[data-remove-exception]');
  if (rm) { removeException(state, rm.dataset.removeException); requestSave(); refreshUI(true); return; }
  const ord = e.target.closest('[data-order]');
  if (ord) { const p=ord.dataset.order,input=document.querySelector(`[data-order-qty="${p}"]`),qty=Number(input?.value??ui.orderQty[p]??1);if (placeOrder(state,p,qty,'player')) { toast('발주했어요. 다음 07시 입고분에 포함돼요.'); requestSave(); } else toast('수량, 잔액, 시설 사용 여부를 확인해 주세요.'); refreshUI(true); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if(t.dataset.stockCheck){const selected=new Set(ui.stockSelected??[]);if(t.checked)selected.add(t.dataset.stockCheck);else selected.delete(t.dataset.stockCheck);ui.stockSelected=[...selected];t.blur();refreshUI(true);return;}
  if(t.dataset.bulkMode!==undefined){ui.bulkMode=t.value;t.blur();refreshUI(true);return;}
  if(t.dataset.bulkPar!==undefined){ui.bulkPar=t.value;t.blur();refreshUI(true);return;}
  if(t.dataset.stockFilter!==undefined){ui.stockFilter=t.value;ui.stockProduct=null;if(t.value==='favorites')ui.fixture=null;t.blur();refreshUI(true);return;}
  if(t.dataset.stockCategory!==undefined){ui.fixture=t.value||null;ui.stockProduct=null;t.blur();refreshUI(true);return;}
  if(!lease.owned)return;
  if(t.dataset.orderQty){ui.orderQty[t.dataset.orderQty]=Number(t.value);t.blur();refreshUI(true);return;}
  if(t.dataset.draftQty){const n=Number(t.value);if(state.management.draft&&Number.isInteger(n)&&n>=0&&n<=60)state.management.draft.items[t.dataset.draftQty]=n;t.blur();requestSave();refreshUI(true);return;}
  if(t.dataset.productMode){setOrderMode(state,t.value,t.dataset.productMode);t.blur();requestSave();refreshUI(true);return;}
  if(t.dataset.policy){const k=t.dataset.policy,n=Number(t.value);if(k==='priority'&&Object.hasOwn(PRIORITIES,t.value))state.management.priority=t.value;else if(['budget','reserve'].includes(k)&&Number.isInteger(n)&&n>=0&&n<=1e7)state.management[k]=n;else toast('0부터 천만 원 사이로 입력해 주세요.');t.blur();requestSave();refreshUI(true);return;}
  if (t.dataset.par) { if (!setPar(state, t.dataset.par, Number(t.value))) toast('기준 재고는 0에서 60 사이로 적어 주세요.');t.blur(); requestSave(); refreshUI(true); }
  if (t.dataset.promo !== undefined) { setPromo(state, t.dataset.promo, t.value || null); requestSave(); refreshUI(true); }
  if (t.dataset.facility) { if (!setFacility(state, t.dataset.facility, t.checked)) { toast('설치 비용이 부족하거나 지금 그 자리에 사람이 있어요.'); t.checked = !t.checked; } requestSave(); refreshUI(true); }
  if ('autoOrder' in t.dataset) { setOrderMode(state,t.checked?'auto':'manual'); requestSave(); }
});
document.addEventListener('input',e=>{
  const p=e.target.dataset.orderQty;if(!p||!Object.hasOwn(PRODUCTS,p))return;
  const n=Number(e.target.value),out=$('ops-view').querySelector(`[data-order-cost="${p}"]`);
  if(out)out.textContent=Number.isInteger(n)&&n>=1&&n<=60?`총 ${won(n*PRODUCTS[p].cost)}`:'수량 확인';
});

let uiClock = 0;
function refreshUI(force = false) {
  if (force) uiClock = 1;
  const s = state;
  $('day').textContent = `DAY ${s.day} (${weekdayLabel(s.day)})`;
  renderDashboard(s,ui);
  $('time').textContent = timeLabel(s);
  const hud = hudText(s);
  $('weather').textContent = hud.weather;
  $('weather').title = '게임 속 28일마다 계절이 바뀝니다. 봄 → 여름 → 가을 → 겨울';
  $('revenue').textContent = won(s.sales.revenue);
  $('cash').textContent = won(s.money);
  $('occupancy').textContent = hud.occupancy;
  $('street-count').textContent = hud.street;
  $('duty').textContent = hud.duty;
  $('log-count').textContent = s.log.length;
  const mob = mobileQuery.matches;
  if ((mob?ui.sheetPanel:ui.sidePanel) === 'person') { renderPeopleStrip($('people-strip'), s, ui); renderPerson($('person-detail'), s, ui); }
  const vis = k => k==='ops'?$('operations-wide').open||(mob?ui.sheetPanel:ui.sidePanel)==='ops':mob ? ui.sheetPanel === k : ui.drawerOpen && ui.panel === k;
  if (vis('log')) { renderLog($('log-list'), s, ui); refreshLogControls(); }
  if (vis('events')) {renderEvents($('event-list'), s);renderJournal($('daily-journal'),s);}
  if (vis('roster')) renderRoster($('roster-view'), s);
  if (vis('ops')) renderOperations($('ops-view'), s,ui);
  if(document.activeElement!==$('order-mode'))$('order-mode').value=s.management.mode;
  const lines=s.log.slice(-2),lineKey=lines.map(l=>l.id).join('|');if($('live-lines').dataset.key!==lineKey){$('live-lines').dataset.key=lineKey;$('live-lines').innerHTML=lines.map(l=>`<p><b>${esc(displayName(s,l.speaker))}</b><span>${esc(l.text)}</span></p>`).join('')||'<p class="muted">매장의 이야기가 이곳에 이어져요.</p>';}
  refreshMoments();
  refreshOpeningGuide();
  const selected = s.people[ui.selected];
  $('sheet-preview').textContent = ui.sheetPanel==='ops'?`${MODES[s.management.mode]} 발주 · ${s.management.requests.filter(r=>r.status==='pending').length}건 요청`:ui.fixture ? '시설 살펴보기' : selected ? displayName(s, ui.selected) : '손님을 선택하세요';
  $('selection-hint').textContent = selected && ui.follow && s.actors[ui.selected] ? `${displayName(s, ui.selected)} 따라가는 중 · 드래그하면 해제돼요.` : mobileQuery.matches ? '인물을 누르면 살펴볼 수 있어요. 두 손가락으로 확대해요.' : '인물을 눌러 살펴보세요. 드래그로 이동하고 휠로 확대해요.';
  $('speed-hint').hidden = speed < 8 || paused;
  updateChips();
}

// ---------- time controls ----------
function setSpeed(v) { speed = v; for (const b of document.querySelectorAll('.speed')) { b.classList.toggle('active', Number(b.dataset.speed) === v); b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === v)); } }
function setPaused(v) { paused = v; $('pause').textContent = v ? '▶' : 'Ⅱ'; $('pause').setAttribute('aria-label', v ? '재생' : '일시정지'); $('pause').classList.toggle('active', v); $('paused-flag').hidden = !v; }
for (const b of document.querySelectorAll('.speed')) b.onclick = () => setSpeed(Number(b.dataset.speed));
$('pause').onclick = () => setPaused(!paused);
document.addEventListener('keydown', e => { if (e.code === 'Space' && !e.target.closest('input, select, textarea, button, dialog')) { e.preventDefault(); setPaused(!paused); } });

// ---------- saving ----------
function updateChips() {
  const chip = $('save-chip');
  if(!lease.owned){chip.textContent='읽기 전용';chip.className='chip';}
  else if (saveState.ok === false) { chip.textContent = '저장 실패'; chip.className = 'chip error'; }
  else if (saveState.ok) { chip.textContent = `저장됨 ${saveState.at}`; chip.className = 'chip ok'; }
  else { chip.textContent = db ? '저장 대기' : '자동 저장 없음'; chip.className = db ? 'chip' : 'chip error'; }
  const ai = $('ai-chip');
  if (!service.active) { ai.textContent = '대사: 규칙 기반'; ai.className = 'chip'; }
  else { ai.textContent = `대사: ${AI_MODES[service.cfg.mode].real ? '로컬 AI' : '테스트 응답'} ${service.stats.ok}/${service.stats.ok + service.stats.failed}`; ai.className = service.stats.failed > service.stats.ok && service.stats.failed > 2 ? 'chip error' : 'chip ai'; }
}
function requestSave() { importantDirty = performance.now() + 1200; }
async function save(reason = 'auto') {
  if(!lease.owned||state.opening?.started===false)return false;
  if (!db) { saveState = { ok: false, at: null, error: '이 브라우저에서는 자동 저장을 쓸 수 없어요.' }; showStorage(); return false; }
  try {
    await writeSlot(db, 'current', state);
    if (++saveCount % 6 === 0) await writeSlot(db, 'backup', state);
    saveState = { ok: true, at: timeLabel(state), error: '' };
  } catch (e) {
    const first = saveState.ok !== false;
    saveState = { ok: false, at: null, error: e?.message ?? '저장 실패' };
    if (first) toast('브라우저 저장에 실패했어요. 파일로 보관해 주세요.', { label: '파일로 내보내기', run: exportFile });
  }
  showStorage(); updateChips();
  return saveState.ok;
}
function showStorage() {
  const el = $('storage-status');
  el.textContent = saveState.ok === false ? `저장 실패: ${saveState.error} 파일로 내보내 두면 안전해요.` : saveState.ok ? `마지막 자동 저장: 게임 시간 ${saveState.at}` : db ? '아직 저장 전이에요.' : '자동 저장을 쓸 수 없어요. 파일로 내보내 주세요.';
  el.classList.toggle('error', saveState.ok === false || !db);
}
// Triggers a save after money or memories change, without saving every frame.
function saveSignature() { return `${state.stats.totals?.sale ?? 0}|${state.stats.totals?.order ?? 0}|${state.obligations.length}|${state.obligations.filter(o => o.status === 'open').length}|${state.events.filter(e => e.importance >= .5).at(-1)?.id}|${state.moments?.at(-1)?.id}|${state.moments?.at(-1)?.complete}|${state.onDuty}`; }
function exportFile() {
  const blob = new Blob([exportText(state)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `saebyeok-day${state.day}-${timeLabel(state).replace(':', '')}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('기록을 파일로 내보냈어요.');
}
function replaceState(next, message) {
  state = next; generation++;
  service.cancelAll();deferredAiResults.length=0;
  ui.logReadId = null; ui.logFollowing = true; ui.logNewCount = 0;
  ui.returnSummary=null;ui.returnDismissed=false;ui.showAllAlerts=false;
  ui.stockSelected=[];ui.bulkMode='inherit';ui.bulkPar='';
  if ($('replay').open) $('replay').close();
  knownMoments = new Set((state.moments ?? []).map(m => m.id)); alertId = null; momentsKey = null;
  state.aiMode = service.active ? service.cfg.mode : 'rule';
  bubbleState.queue = []; bubbleState.shown = []; bubbleState.lastLogId = state.log.at(-1)?.id ?? null; ui.missed.clear();
  if (!state.people[ui.selected]) ui.selected = state.onDuty;
  ui.fixture = null; resetKeys(); $('bubbles').replaceChildren();
  refreshUI(true); if (message) toast(message);
}
$('export').onclick = exportFile;
$('save-now').onclick = async () => { const ok = await save('manual'); $('settings-message').textContent = ok ? '저장했어요.' : '저장하지 못했어요. 파일로 내보내 주세요.'; $('settings-message').classList.toggle('error', !ok); };
$('import').onchange = async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  const msg = $('settings-message');
  try {
    if (file.size > MAX_IMPORT_BYTES) throw new Error('세이브 파일이 너무 커요.');
    const next = parseSave(await file.text());
    replaceState(next, next.migratedFrom ? '이전 버전 기록을 옮겨 왔어요.' : '기록을 불러왔어요.');
    if(state.opening?.started===false){$('settings').close();presentWelcome();return;}
    const ok = await save('import');
    msg.textContent = ok ? '불러온 기록으로 이어서 진행해요.' : '불러왔지만 브라우저 저장은 실패했어요.'; msg.classList.toggle('error', !ok);
  } catch (err) { msg.textContent = err.message; msg.classList.add('error'); }
};
$('reset').onclick = async () => {
  if (!confirm('지금 기록을 지우고 새로 시작할까요? 필요하면 먼저 파일로 내보내세요.')) return;
  replaceState(initialState(), '새로운 밤을 준비했어요.');
  $('settings').close();setObservation(false);presentWelcome();
};
$('save-chip').onclick = () => openSettings();
$('settings-open').onclick = () => openSettings();
function openSettings() { showStorage(); fillAiForm(); $('settings').showModal(); }
document.addEventListener('visibilitychange', () => { if (document.hidden){sound.update(state,true);hiddenAt=readyToPlay()?Date.now():null;save('hidden');}else if(hiddenAt){const from=hiddenAt;hiddenAt=null;collectOffline(from);} });
addEventListener('pagehide', () => {save('hide');});

// ---------- dialogue model ----------
const service = new DialogueService();
const AI_KEY = 'saebyeok-ai-settings';
function loadAiSettings() { try { return JSON.parse(localStorage.getItem(AI_KEY) ?? 'null'); } catch { return null; } }
function storeAiSettings(cfg) { try { localStorage.setItem(AI_KEY, JSON.stringify(cfg)); } catch { /* settings stay for this session only */ } }
function fillAiForm() {
  const sel = $('ai-mode');
  if (!sel.options.length) for (const [k, m] of Object.entries(AI_MODES)) if (!m.dev || dev) sel.add(new Option(m.label, k));
  sel.value = service.cfg.mode;
  $('ai-url').value = service.cfg.url || AI_MODES[sel.value]?.defaultUrl || '';
  $('ai-model').value = service.cfg.model || AI_MODES[sel.value]?.defaultModel || '';
  // Without the local proxy, each visitor's own model server must allow this page's origin.
  const hint = $('ai-origin-hint');
  hint.hidden = PROXY_AVAILABLE;
  hint.textContent = `이 페이지는 내 컴퓨터의 모델 서버에 직접 연결해요. Ollama라면 환경 변수 OLLAMA_ORIGINS에 ${PAGE_ORIGIN} 를 넣고 Ollama를 다시 켜야 해요. 대사 요청은 이 컴퓨터 밖으로 나가지 않아요.`;
  aiStatusText();
}
function aiStatusText(extra) {
  const st = service.stats, el = $('ai-status');
  el.classList.remove('error');
  if (!service.active) el.textContent = extra ?? '지금은 규칙 기반 대사를 쓰고 있어요. AI로 만든 대사는 없어요.';
  else el.textContent = extra ?? `${AI_MODES[service.cfg.mode].label}: 생성 성공 ${st.ok}, 실제 사용 ${st.displayed}, 대체 ${st.fallback}, 늦은 응답 ${st.stale}, 실패 ${st.failed}. 최근 ${(st.lastMs/1000).toFixed(1)}초${st.lastError ? `, 오류 ${st.lastError}` : ''}`;
}
$('ai-mode').onchange = () => { const m = AI_MODES[$('ai-mode').value]; $('ai-url').value = m.defaultUrl ?? ''; $('ai-model').value = m.defaultModel ?? ''; };
function aiForm(){return {mode:$('ai-mode').value,url:$('ai-url').value.trim().replace(/\/v1\/?$/,''),model:$('ai-model').value.trim()};}
$('ai-list').onclick=async()=>{const r=await testConnection(aiForm());$('ai-model-list').replaceChildren(...r.models.map(id=>new Option(id,id)));if(r.models.length&&!r.models.includes($('ai-model').value))$('ai-model').value=r.models[0];aiStatusText(r.models.length?`찾은 모델: ${r.models.join(', ')}`:r.message);};
$('ai-test').onclick = async () => {
  const cfg = { mode: $('ai-mode').value, url: $('ai-url').value.trim(), model: $('ai-model').value.trim() };
  $('ai-status').textContent = '확인 중이에요.';
  $('ai-test').disabled=true;
  const r = await probeModel(cfg);
  $('ai-test').disabled=false;
  aiStatusText(`${r.message}${r.models.length ? `. 서버의 모델: ${r.models.slice(0, 6).join(', ')}` : ''}`);
  $('ai-status').classList.toggle('error', !r.ok);
};
$('ai-apply').onclick = () => {
  const cfg = aiForm();generation++;deferredAiResults.length=0;
  for(const p of state.pending){p.dispatched=false;p.realWait=0;p.deadline=state.elapsed+1.6;}
  service.configure(cfg); state.aiMode = service.active ? cfg.mode : 'rule'; storeAiSettings(cfg); aiStatusText(); updateChips();
};
{
  const saved = loadAiSettings();
  if (saved && AI_MODES[saved.mode] && (!AI_MODES[saved.mode].dev || dev)) service.configure(saved);
}
function pumpAi() {
  if (!service.active) return;
  const gen = generation;
  service.pump(pendingToDispatch(state), (id, result) => {
    if (!playable()) { deferredAiResults.push({ gen, id, result }); return; }
    applyAiResult(gen, id, result);
  });
}
function applyAiResult(gen, id, result) {
  // Delayed replies remain inert while watching the past, then pass the normal stale checks.
  if (gen !== generation) { service.stats.stale++; return; }
  const pend = state.pending.find(p => p.id === id);
  if (!pend) { service.stats.stale++; return; }
  const source=resolvePending(state, pend, result);
  if(source==='ai')service.stats.displayed++;else if(source==='fallback')service.stats.fallback++;
}

// ---------- loop ----------
let last = performance.now(), acc = 0;
function frame(now) {
  const real = Math.min(.25, (now - last) / 1000); last = now;
  if (playable()) {
    for(const response of deferredAiResults.splice(0))applyAiResult(response.gen,response.id,response.result);
    advanceDialogueTime(state,real);
    const important=slowDialogue&&ui.follow&&state.moments.some(m=>m.notify!==false&&m.actors.includes(ui.selected)&&momentIsLive(m));
    acc += real * (important?Math.min(.5,worldRate*speed):worldRate*speed);
    let steps = 0;
    while (acc >= SIM_DT && steps < 120) { step(state, SIM_DT); acc -= SIM_DT; steps++; }
    if (steps >= 120) acc = 0;
  }
  if (playable()) pumpAi();
  sound.update(state,!playable());
  if ($('replay').open && replayMoment && replayPlaying && now - replayLast >= 300) {
    replayLast = now; replayIndex = Math.min(replayIndex + 1, replayMoment.frames.length - 1);
    if (replayIndex === replayMoment.frames.length - 1) replayPlaying = false;
    renderReplay();
  }
  separate();
  if (ui.follow && state.actors[ui.selected]) { const a = state.actors[ui.selected],p=project(a.x,a.y,25);cam.cx += (p.x - cam.cx) * .08; cam.cy += (p.y - cam.cy) * .08; applyCam(); }
  const sel = ui.selected, va = state.actors[sel]?.visitId;
  renderScene(sceneBuffer.getContext('2d'), state, { now, selected: sel, fixture:ui.fixture,related: va ? Object.values(state.actors).filter(a => a.visitId === va && a.id !== sel).map(a => a.id) : [], offsets });
  present();
  updateBubbles(now);
  uiClock += real;
  if (uiClock > .25) { uiClock = 0; refreshUI(); }
  saveTimer += real;
  const sig = saveSignature();
  if (sig !== lastSaveKey) { lastSaveKey = sig; requestSave(); }
  if ((importantDirty && now > importantDirty) || saveTimer > 20) { importantDirty = 0; saveTimer = 0; save(); }
  requestAnimationFrame(frame);
}

// ---------- boot ----------
async function boot() {
  await lease.acquire();showWriterState();
  placePanels(); defaultZoom();
  state.aiMode = service.active ? service.cfg.mode : 'rule';
  try {
    db = await openDB();
    let loaded = null, note = '';
    try { const saved = await readSlot(db, 'current'); if (saved) { loaded = parseSave(saved); note = '마지막으로 머물렀던 밤을 이어서 보여 드려요.'; } }
    catch (e) {
      try { const backup = await readSlot(db, 'backup'); if (backup) { loaded = parseSave(backup); note = '최근 저장을 읽지 못해 예비 저장을 불러왔어요.'; } } catch { /* fall through to a new game */ }
      if (!loaded) note = `저장된 기록을 읽지 못했어요: ${e.message}`;
    }
    if (!loaded) { const legacy = await readLegacy(db); if (legacy) { try { loaded = parseSave(legacy); note = '이전 프로토타입 기록을 새 형식으로 옮겨 왔어요.'; } catch { /* keep a fresh game */ } } }
    if (loaded) {replaceState(loaded, note);if(lease.owned)await collectOffline();} else if (note) toast(note);
  } catch (e) {
    db = null; saveState = { ok: false, at: null, error: e.message };
    toast('브라우저 저장소를 쓸 수 없어요. 설정에서 파일로 보관할 수 있어요.', { label: '설정 열기', run: openSettings });
  }
  lastSaveKey = saveSignature();
  presentWelcome();
  refreshUI(true);
  requestAnimationFrame(t => { last = t; frame(t); });
}
if (dev) Object.assign(globalThis, { __game: { get state() { return state; }, ui, service, cam, setSpeed, setPaused, save, select } });
boot();
