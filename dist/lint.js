// Dialogue checks. Applied to every line, whether it comes from rules or a model.
export const LINE_MAX = 60, SENTENCE_MAX = 2;

const BANNED_CHARS = /[·•∙ㆍ*()\[\]{}<>「」『』"“”#_~]/;
const EMOJI = /\p{Extended_Pictographic}/u;
const NARRATION = /(생각했다|생각한다|속으로|느꼈다|느낀다|미소|웃으며|한숨|고개를|끄덕|눈물|마음이 따뜻|기분이 좋아|라고 말했|듯이|듯 말|중얼|혼잣말)/;
const NARRATIVE_END = /(했다|였다|었다|았다|한다|이다)[.!?]?$/;
const MORAL = /(인생|삶이란|삶은|결국 중요한|소중한 건|소중한 것|행복이란|진정한|세상은|우리 모두|잊지 마세요|그게 바로|따뜻한 마음|사람 사는)/;

// Removes markup a model might add. Kept compatible with the prototype's behaviour.
export function cleanLine(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[·•*]/g, '').replace(/\([^)]*\)/g, '').replace(/[\r\n]+/g, ' ').trim().slice(0, LINE_MAX);
}

export function sentenceCount(text) {
  const parts = text.split(/(?<=[.?!])\s+/).map(t => t.trim()).filter(Boolean);
  return parts.length;
}

const norm = t => t.replace(/[\s.,?!]/g, '');

// Returns a list of violations. An empty list means the line may be shown.
export function lintLine(text, ctx = {}) {
  const reasons = [];
  if (typeof text !== 'string' || !text.trim()) return ['empty'];
  const t = text.trim();
  if ([...t].length > LINE_MAX) reasons.push('too_long');
  if (sentenceCount(t) > SENTENCE_MAX) reasons.push('too_many_sentences');
  if (BANNED_CHARS.test(t)) reasons.push('banned_mark');
  if (/^[-–—]/.test(t) || /\n/.test(t)) reasons.push('list_or_break');
  if ((t.match(/…|\.\.\./g) ?? []).length > 1 || /\.{4,}/.test(t)) reasons.push('ellipsis');
  if (EMOJI.test(t)) reasons.push('emoji');
  if (/[!?]{2,}/.test(t)) reasons.push('repeated_punct');
  if (NARRATION.test(t)) reasons.push('narration');
  if (NARRATIVE_END.test(t)) reasons.push('narrative_ending');
  if (MORAL.test(t)) reasons.push('moralizing');
  if (ctx.recent?.some(r => norm(r) === norm(t))) reasons.push('repeat');
  if (ctx.numbers) {
    for (const n of t.match(/\d[\d,]*/g) ?? []) if (!ctx.numbers.includes(n.replace(/,/g, ''))) reasons.push('unknown_number');
  }
  if (ctx.productNames) {
    for (const name of ctx.allProductNames ?? []) if (t.includes(name) && !ctx.productNames.includes(name)) reasons.push('unrelated_product');
  }
  return reasons;
}
