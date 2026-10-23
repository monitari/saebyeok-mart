// Rule-based phrasing. The game decides what happens; this only picks short words for it.
// Each kind lists variants per speech register. `null` inside a list means "say nothing".
import { lintLine } from './lint.js';

const batchim = w => { const c = (w ?? '').charCodeAt(w.length - 1) - 0xAC00; return c >= 0 && c <= 11171 && c % 28 !== 0; };
export const josa = {
  iyo: w => w + (batchim(w) ? '이요' : '요'),
  ya: w => w + (batchim(w) ? '아' : '야'),
  neun: w => w + (batchim(w) ? '은' : '는'),
  reul: w => w + (batchim(w) ? '을' : '를'),
  ga: w => w + (batchim(w) ? '이' : '가'),
  rang: w => w + (batchim(w) ? '이랑' : '랑'),
  ege: w => w + '에게'
};

// Chat that can simply not happen when everything left to say would repeat what this person said before.
const SOFT = new Set(['colleague_bye', 'handover_ack', 'friend_food_q', 'friend_food_a', 'friend_share', 'friend_missing', 'coworker_overtime', 'coworker_reply', 'meet_greet', 'meet_reply', 'greet_familiar', 'welcome_familiar', 'habit_guess', 'elder_to_kid', 'kid_to_elder', 'kind_words', 'colleague_hi', 'hearsay_umbrella', 'hearsay_soldout', 'hearsay_paidfor']);

import { LINES, CONTEXT } from './dialogue-data.js';
import {EXTRA_LINES,VOICE_CONTEXT} from './dialogue-voices.js';
for(const [kind,regs]of Object.entries(EXTRA_LINES))for(const [reg,lines]of Object.entries(regs)){
  const spec=LINES[kind]??={};spec[reg]=[...new Set([...(spec[reg]??[]),...lines])];
}
for(const [kind,lines]of Object.entries(VOICE_CONTEXT))(CONTEXT[kind]??=[]).push(...lines);
export { LINES, CONTEXT };

const FALLBACK = { rude: ['casual', 'formal'], casual: ['formal'], child: ['casual', 'formal'], elder: ['formal'], formal: ['casual'], worker: ['formal'] };
function variants(kind, register) {
  const spec = LINES[kind];
  if (!spec) return [];
  for (const r of [register, ...(FALLBACK[register] ?? []), 'formal', 'worker']) if (spec[r]) return spec[r];
  return [];
}

export function fill(template, slots = {}) {
  return template.replace(/\{(\w+?)(이요|야|는|를|가|랑)?\}/g, (_, key, suffix) => {
    const v = String(slots[key] ?? '');
    if (!suffix) return v;
    return { 이요: josa.iyo, 야: josa.ya, 는: josa.neun, 를: josa.reul, 가: josa.ga, 랑: josa.rang }[suffix](v);
  });
}

// A condition matches when every key agrees with the facts. Arrays mean "any of these".
// `has` lists facts that only need to be present. Naming a speaker or listener counts double.
function matches(when, facts) {
  return Object.entries(when).every(([k, v]) => k === 'has' ? [].concat(v).every(x => facts[x]) : Array.isArray(v) ? v.includes(facts[k]) : facts[k] === v);
}
export function specificity(when = {}) {
  return Object.entries(when).reduce((n, [k, v]) => n + (k === 'who' || k === 'to' ? 2 : k === 'has' ? [].concat(v).length : 1), 0);
}
const placeholders = t => [...t.matchAll(/\{(\w+?)(?:이요|야|는|를|가|랑)?\}/g)].map(m => m[1]);

// Picks a phrasing. Lines whose conditions fit the moment best are tried first; plain lines are the fallback.
// `facts` describe the moment (see factsFor in sim.js). `avoid(text, score)` blocks lines this speaker
// used recently; if every line is blocked, a required line is still said and an optional one is dropped.
// `rand` is the simulation RNG so results are reproducible.
export function phrase(kind, { register = 'formal', slots = {}, rand = Math.random, recent = [], sociability = 50, verbosity = 'short', facts = {}, avoid = null, pick = null } = {}) {
  const spec = LINES[kind], ctx = CONTEXT[kind] ?? [];
  if (!spec && !ctx.length) return null;
  const allSlots = { ...(facts.slots ?? {}), ...slots };
  const cands = [];
  for (const e of ctx) if ((!e.reg || [].concat(e.reg).includes(register)) && matches(e.when ?? {}, facts)) cands.push({ t: e.t, score: specificity(e.when), topic: e.topic ?? null });
  let base = spec ? variants(kind, register) : [];
  if (verbosity === 'short' && base.length > 2) base = [...base].sort((a, b) => (a?.length ?? 0) - (b?.length ?? 0)).slice(0, Math.ceil(base.length / 2) + 1);
  for (const t of base) cands.push({ t, score: 0, topic: null });
  if (!cands.length) return null;
  const best = Math.max(...cands.map(c => c.score));
  // Something worth remarking on makes even a quiet person more likely to speak.
  if (spec?.optional && rand() < spec.optional * (1 - sociability / 120) * (best > 0 ? .35 : 1)) return null;
  let fallback = null;
  for (const score of [...new Set(cands.map(c => c.score))].sort((a, b) => b - a)) {
    const tier = cands.filter(c => c.score === score), start = Math.floor(rand() * tier.length);
    for (let i = 0; i < tier.length; i++) {
      const c = tier[(start + i) % tier.length];
      if (c.t === null) { if (score === 0 && !fallback) return null; continue; }
      if (placeholders(c.t).some(k => allSlots[k] === undefined || allSlots[k] === null || allSlots[k] === '')) continue;
      const text = fill(c.t, allSlots);
      if (lintLine(text, { recent }).length) continue;
      if (avoid?.(text, score)) { fallback ??= { text, topic: c.topic }; continue; }
      if (pick) pick.topic = c.topic;
      return text;
    }
  }
  if (fallback && spec && !spec.optional && !SOFT.has(kind)) { if (pick) pick.topic = fallback.topic; return fallback.text; }
  return null;
}

// Every template expanded with sample slots; used by tests to check the rule bank.
export function allTemplateSamples() {
  const slots = { p: '제육 도시락', n: '도윤', when: '어제', price: '4,900', last: '캔커피', wish: '제육 도시락', ack: '아 네네.', end: '22시' };
  const out = [];
  for (const [kind, spec] of Object.entries(LINES)) for (const [reg, list] of Object.entries(spec)) {
    if (!Array.isArray(list)) continue;
    for (const t of list) if (t !== null) out.push({ kind, reg, text: fill(t, slots) });
  }
  for (const [kind, list] of Object.entries(CONTEXT)) for (const e of list) out.push({ kind, reg: [].concat(e.reg ?? 'any').join('/'), text: fill(e.t, slots), when: e.when });
  return out;
}

// ---------- lines that depend on the moment ----------
// Same intent as the plain lines above, but tied to weather, time, how well people know each other,
// how long it has been, what they bought before, and who is speaking.
