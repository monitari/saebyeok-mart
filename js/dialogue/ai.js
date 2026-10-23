// Dialogue model adapters. Off by default: the game runs on rule-based lines.
// A model only phrases a line and picks from the actions it was offered; sim.js re-validates everything.
import { lintLine, cleanLine, LINE_MAX } from './lint.js';
import { PRODUCTS } from '../sim/data.js';

// server.mjs offers a same-origin proxy at /local-ai. On static hosting (GitHub Pages) there is none,
// so the browser calls the visitor's own Ollama directly, which must allow this page's origin.
export const PROXY_AVAILABLE = ['127.0.0.1', 'localhost', '[::1]'].includes(globalThis.location?.hostname);
export const PAGE_ORIGIN = globalThis.location?.origin ?? '';
export const AI_MODES = {
  rule: { label: '규칙 기반 대사 (AI 없음)', real: false },
  ollama: { label: '로컬 서버: Ollama', real: true, defaultUrl: PROXY_AVAILABLE ? '/local-ai' : 'http://127.0.0.1:11434', defaultModel: 'qwen2.5:3b' },
  openai: { label: '로컬 서버: OpenAI 호환 (LM Studio, llama.cpp)', real: true, defaultUrl: PROXY_AVAILABLE ? '/local-lm' : 'http://127.0.0.1:1234', defaultModel: 'local-model' },
  mock: { label: '테스트용 가짜 응답 (실제 AI 아님)', real: false, dev: true }
};

const SYSTEM_PROMPT = [
  '너는 편의점 관찰 게임의 대사 한 줄을 고르는 도구다.',
  '반드시 JSON 한 개만 출력한다. 형식: {"say": "대사" 또는 null, "action": "행동 ID"}',
  `say는 한국어 1~2문장, ${LINE_MAX}자 이하. 말할 필요가 없으면 null.`,
  '금지: 가운뎃점, 불릿, 괄호 해설, 별표 행동 묘사, 내면 독백, 감정 설명, 말줄임표 반복, 교훈이나 철학.',
  'intent가 정한 말의 목적만 말한다. 주제는 하나. 직전 대사를 되풀이하지 않는다.',
  'slots에 없는 상품, 가격, 숫자, 과거 사건을 만들지 않는다. 기억에 없는 일은 말하지 않는다.',
  'action은 actions 목록 중 하나만 고른다. 목록에 없는 행동은 할 수 없다.',
  'register가 formal이면 해요체, casual이면 반말, elder는 어르신 말투, child는 아이 말투, rude는 퉁명스러운 반말, worker는 알바생의 공손한 해요체.'
  ,'example은 상황에 맞춰 검증된 대사다. 의미와 화자의 역할을 유지하고 표현만 바꾼다. 확신이 없으면 example을 그대로 쓴다. 반드시 한국어로만 말한다.'
].join('\n');

export function buildMessages(request, correction = null) {
  const msgs = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: JSON.stringify(request) }];
  if (correction) msgs.push({ role: 'user', content: `형식 오류: ${correction}. JSON 한 개로 다시 답해.` });
  return msgs;
}

// Extracts {say, action} from raw model text. Throws on anything else.
export function parseResult(raw, request) {
  const text = String(raw ?? '').trim();
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('JSON 없음');
  const obj = JSON.parse(text.slice(start, end + 1));
  if (!obj || typeof obj !== 'object') throw new Error('객체 아님');
  const actions = request.actions ?? ['say'];
  if(typeof obj.action!=='string'||!actions.includes(obj.action))throw new Error('허용되지 않은 행동');
  const action = obj.action;
  if (obj.say === null || obj.say === '' || obj.say === undefined) return { say: null, action };
  if (typeof obj.say !== 'string') throw new Error('say 형식');
  const rawProblems=lintLine(obj.say);
  if(rawProblems.length)throw new Error('대사 규칙 위반 '+rawProblems.join(','));
  const say = cleanLine(obj.say);
  if(['casual','rude'].includes(request.speaker?.register)&&/(?:요|습니다|십시오)[.!?…]*$/.test(say))throw new Error('요청한 반말 말투와 다름');
  if(!/[가-힣]/.test(say)||/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(say))throw new Error('한국어 대사만 허용');
  const slots=Object.values(request.slots??{}).map(String);
  const problems = lintLine(say, { recent: (request.recent ?? []).map(r => r.text),numbers:slots.map(v=>v.replace(/,/g,'')).filter(v=>/^\d+$/.test(v)),productNames:slots,allProductNames:Object.values(PRODUCTS).map(p=>p.name) });
  if(/시켜\s*둘|준비해\s*둘|예약해\s*둘/.test(say)&&!String(request.intent).includes('promise'))problems.push('unsupported_promise');
  if(/어제|지난번/.test(say)&&!(request.memories?.length||/어제|지난번/.test(request.example??'')))problems.push('unsupported_past');
  if(['thank_bye','bye','colleague_bye'].includes(request.intent)&&(/우산|계산|판매|품절|주문|기다/.test(say)||!/(감사|고맙|들어가|가세요|계세요|안녕|수고|다음에|또|먼저|조심)/.test(say)))problems.push('wrong_farewell');
  if(['welcome','welcome_familiar','greet_familiar','colleague_hi'].includes(request.intent)&&!/(안녕|어서|오셨|오셨어|반갑|오랜만|왔|오늘도|또|출근)/.test(say))problems.push('wrong_greeting');
  if(String(request.example??'').startsWith('아니')&&/^(네|예)[,.\s]/.test(say))problems.push('reversed_answer');
  if (problems.length) throw new Error('대사 규칙 위반 ' + problems.join(','));
  return { say, action };
}

async function postJSON(fetchImpl, url, body, signal) {
  const res = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
const trimUrl = u => String(u || '').replace(/\/+$/, '');

export const ADAPTERS = {
  async ollama(cfg, messages, signal, fetchImpl) {
    const data = await postJSON(fetchImpl, `${trimUrl(cfg.url)}/api/chat`, { model: cfg.model, messages, stream: false, format: 'json', options: { temperature: .6, num_predict: 90 } }, signal);
    return data?.message?.content ?? '';
  },
  async openai(cfg, messages, signal, fetchImpl) {
    const data = await postJSON(fetchImpl, `${trimUrl(cfg.url)}/v1/chat/completions`, { model: cfg.model, messages, temperature: .6, max_tokens: 90, stream: false }, signal);
    return data?.choices?.[0]?.message?.content ?? '';
  },
  // Deterministic stand-in for checking delays, failures and stale replies without a model.
  async mock(cfg, messages, signal) {
    const req = JSON.parse(messages[1].content);
    const delay = cfg.mockDelayMs ?? 1500;
    await new Promise((resolve, reject) => { const t = setTimeout(resolve, delay); signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('timeout')); }); });
    const roll = Math.random();
    if (roll < (cfg.mockFailRate ?? .2)) throw new Error('mock failure');
    if (roll < (cfg.mockFailRate ?? .2) + .1) return '대사: *웃으며* (괄호) 형식 위반';
    return JSON.stringify({ say: req.example ?? null, action: req.actions[0] });
  }
};

export async function testConnection(cfg, fetchImpl = fetch) {
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 4000);
  try {
    if (cfg.mode === 'ollama') {
      const res = await fetchImpl(`${trimUrl(cfg.url)}/api/tags`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const names = (data.models ?? []).map(m => m.name);
      return { ok: names.includes(cfg.model), models: names, message: names.includes(cfg.model) ? '연결됨' : names.length ? `모델 ${cfg.model} 없음` : '설치된 모델 없음' };
    }
    if (cfg.mode === 'openai') {
      const res = await fetchImpl(`${trimUrl(cfg.url)}/v1/models`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const names = (data.data ?? []).map(m => m.id);
      return { ok: names.length > 0, models: names, message: names.length ? '연결됨' : '불러온 모델 없음' };
    }
    return { ok: cfg.mode === 'mock', models: [], message: cfg.mode === 'mock' ? '테스트 응답 사용' : 'AI 꺼짐' };
  } catch (e) {
    // A blocked cross-origin request surfaces only as a generic TypeError, so name the likely cause.
    const hint = !PROXY_AVAILABLE && /^https?:\/\//.test(cfg.url) ? ` 서버가 켜져 있는지, 그리고 이 페이지 주소(${PAGE_ORIGIN})를 허용했는지 확인해 주세요.` : '';
    return { ok: false, models: [], message: (e.name === 'AbortError' ? '응답 없음.' : `연결 실패: ${e.message}.`) + hint };
  } finally { clearTimeout(t); }
}

export async function probeModel(cfg, fetchImpl = fetch) {
  const listed = await testConnection(cfg, fetchImpl);
  if (!listed.ok) return listed;
  if (listed.models.length && !listed.models.includes(cfg.model)) return { ...listed, ok:false, message:'선택한 모델이 서버에 없어요.' };
  const request={intent:'confirm',actions:['say'],recent:[],slots:{},example:'네, 알겠어요.',speaker:{role:'알바생',register:'worker'},situation:{place:'편의점',scene:'연결 시험'}};
  const ctrl=new AbortController(), timer=setTimeout(()=>ctrl.abort(),30000), start=Date.now();
  try {
    const raw=await ADAPTERS[cfg.mode](cfg,buildMessages(request),ctrl.signal,fetchImpl);
    const result=parseResult(raw,request);
    return {...listed,ok:true,latencyMs:Date.now()-start,sample:result.say,message:`생성 확인 완료 (${((Date.now()-start)/1000).toFixed(1)}초): ${result.say??'침묵'}`};
  } catch(e) { return {...listed,ok:false,message:`모델 목록은 확인했지만 대사 생성 실패: ${ctrl.signal.aborted?'30초 초과':e.message}`}; }
  finally { clearTimeout(timer); }
}

// Queue with a concurrency limit, a per-call timeout and at most one retry for format errors.
// The game never waits on this: unanswered lines fall back to rule text when their deadline passes.
export class DialogueService {
  constructor({ fetchImpl = (...a) => fetch(...a), timeoutMs = 8000, maxConcurrent = 1, maxRetries = 1 } = {}) {
    this.fetchImpl = fetchImpl; this.timeoutMs = timeoutMs; this.maxConcurrent = maxConcurrent; this.maxRetries = maxRetries;
    this.cfg = { mode: 'rule', url: '', model: '' };
    this.inflight = new Map();
    this.epoch = 0;
    this.stats = { ok: 0, failed: 0, retried: 0, stale: 0, displayed:0, fallback:0, lastMs: 0, lastError: '' };
  }
  configure(cfg) { this.cfg = { ...this.cfg, ...cfg }; this.cancelAll(); }
  get active() { return this.cfg.mode !== 'rule'; }
  cancelAll() { this.epoch++; for (const c of this.inflight.values()) c.abort(); this.inflight.clear(); }
  // Sends undispatched requests. `onResult(id, result|null)` is called later; the caller checks staleness.
  pump(pendingList, onResult) {
    if (!this.active) return;
    for (const p of pendingList) {
      if (this.inflight.size >= this.maxConcurrent) break;
      if (p.dispatched) continue;
      p.dispatched = true;
      this.run(p, onResult);
    }
  }
  async run(p, onResult) {
    const epoch=this.epoch, cfg={...this.cfg};
    const adapter = ADAPTERS[this.cfg.mode];
    const ctrl = new AbortController();
    this.inflight.set(p.id, ctrl);
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    const started = Date.now();
    let result = null, correction = null;
    try {
      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        const raw = await adapter(cfg, buildMessages(p.request, correction), ctrl.signal, this.fetchImpl);
        if(epoch!==this.epoch)return;
        try { result = parseResult(raw, p.request); break; }
        catch (e) { correction = e.message; if (attempt < this.maxRetries) this.stats.retried++; }
      }
      if (result) {this.stats.ok++;this.stats.lastError='';} else { this.stats.failed++; this.stats.lastError = correction ?? '형식 오류'; }
    } catch (e) {
      if(epoch!==this.epoch)return;
      this.stats.failed++; this.stats.lastError = ctrl.signal.aborted ? '시간 초과' : e.message;
    } finally {
      clearTimeout(timer);
      if(this.inflight.get(p.id)===ctrl)this.inflight.delete(p.id);
      if(epoch===this.epoch)this.stats.lastMs = Date.now() - started;
    }
    if(epoch===this.epoch)onResult(p.id, result);
  }
}
