// Character "genes": structured, versioned data used to build and reproduce a person.
// Not a biology model. Appearance and temperament are generated and stored independently.
export const GENE_VERSION = 1;

export function rng32(seed) {
  let t = seed >>> 0;
  return () => { t = (t + 0x6D2B79F5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];

// Part catalogue. Every part declares which body ages and builds it fits.
const ALL_AGES = ['child', 'teen', 'adult', 'elder'], ADULTISH = ['teen', 'adult', 'elder'], ALL_BUILDS = ['slim', 'average', 'broad', 'round'];
export const PARTS = {
  hair: {
    short: { ages: ALL_AGES }, buzz: { ages: ADULTISH }, side: { ages: ADULTISH }, curly: { ages: ALL_AGES }, bob: { ages: ALL_AGES },
    long: { ages: ALL_AGES }, ponytail: { ages: ALL_AGES }, bun: { ages: ADULTISH }, twin: { ages: ['child'] }, balding: { ages: ['adult', 'elder'] }
  },
  top: {
    tee: { ages: ALL_AGES, builds: ALL_BUILDS }, hoodie: { ages: ALL_AGES, builds: ALL_BUILDS }, shirt: { ages: ADULTISH, builds: ALL_BUILDS },
    jacket: { ages: ADULTISH, builds: ALL_BUILDS }, cardigan: { ages: ADULTISH, builds: ALL_BUILDS }, coat: { ages: ['adult', 'elder'], builds: ['slim', 'average', 'broad'] },
    vest: { ages: ['adult'], builds: ['slim', 'average', 'broad'], over: true }, workvest: { ages: ['adult'], builds: ['average', 'broad', 'round'], over: true },
    school: { ages: ['teen'], builds: ['slim', 'average'] }, uniform: { ages: ['adult', 'teen'], builds: ALL_BUILDS, over: true }
  },
  bottom: {
    pants: { ages: ALL_AGES }, jeans: { ages: ADULTISH }, slacks: { ages: ADULTISH }, skirt: { ages: ALL_AGES }, shorts: { ages: ['child', 'teen', 'adult'] }
  },
  accessory: {
    cap: { ages: ALL_AGES, conflicts: ['bun', 'twin'] }, glasses: { ages: ALL_AGES }, bag: { ages: ADULTISH }, backpack: { ages: ['child', 'teen', 'adult'] },
    earbuds: { ages: ['teen', 'adult'] }, scarf: { ages: ADULTISH }
  }
};
export const BODY = {
  // Pixel metrics inside a 32x48 frame. Heights in px from the feet.
  child: { leg: 8, torso: 10, head: 12, shoulder: 12 },
  teen: { leg: 12, torso: 13, head: 13, shoulder: 14 },
  adult: { leg: 13, torso: 15, head: 14, shoulder: 16 },
  elder: { leg: 12, torso: 14, head: 14, shoulder: 15 }
};
export const BUILD_WIDTH = { slim: -2, average: 0, broad: 3, round: 2 };
const SKINS = ['#f1cfb2', '#e8bf9b', '#dcae88', '#c99872', '#b07f5c', '#8d6347'];
const HAIR_COLORS = ['#1d1b1b', '#2c2422', '#3e302b', '#5a3b28', '#7a3f2e', '#9a7a55', '#b9b8ae'];
const CLOTH = ['#5a6c7e', '#8b9e82', '#c28c8a', '#d9d2b7', '#3f4a48', '#a6b4a7', '#c7a05a', '#6b5a7a', '#7f5f48', '#2f3d5c'];
const FACES = ['round', 'oval', 'square', 'long'], BROWS = ['soft', 'flat', 'stern'];

function fits(part, slot, age, build, hairStyle) {
  const spec = PARTS[slot]?.[part];
  if (!spec) return false;
  if (!spec.ages.includes(age)) return false;
  if (spec.builds && !spec.builds.includes(build)) return false;
  if (spec.conflicts?.includes(hairStyle)) return false;
  return true;
}

// Builds a complete appearance from seed + authored overrides, replacing incompatible parts.
// `fixes` records each replacement so the stored result explains itself.
export function buildAppearance(seed, look = {}) {
  const r = rng32(seed), fixes = [];
  const age = ALL_AGES.includes(look.age) ? look.age : pick(r, ['adult', 'adult', 'teen', 'elder']);
  const build = ALL_BUILDS.includes(look.build) ? look.build : pick(r, ALL_BUILDS);
  const want = (slot, value, fallbackList, hair) => {
    if (value && fits(value, slot, age, build, hair)) return value;
    const pool = fallbackList.filter(p => fits(p, slot, age, build, hair));
    const chosen = pick(r, pool.length ? pool : Object.keys(PARTS[slot]));
    if (value) fixes.push(`${slot}:${value}→${chosen}`);
    return chosen;
  };
  const hairStyle = want('hair', look.hair?.style, Object.keys(PARTS.hair));
  const app = {
    age, build, sex: look.sex ?? pick(r, ['f', 'm', 'n']),
    height: Math.max(-2, Math.min(2, look.height ?? Math.round(r() * 4 - 2))) || 0,
    skin: look.skin ?? pick(r, SKINS),
    face: { shape: look.face?.shape ?? pick(r, FACES), brows: look.face?.brows ?? pick(r, BROWS), beard: age === 'child' || age === 'teen' ? 'none' : look.face?.beard ?? 'none' },
    hair: { style: hairStyle, color: look.hair?.color ?? pick(r, HAIR_COLORS) },
    top: { type: want('top', look.top?.type, Object.keys(PARTS.top).filter(t => t !== 'uniform')), color: look.top?.color ?? pick(r, CLOTH) },
    bottom: { type: want('bottom', look.bottom?.type, Object.keys(PARTS.bottom)), color: look.bottom?.color ?? pick(r, CLOTH) },
    accessories: [],
    posture: look.posture ?? pick(r, ['upright', 'slouch', 'lean', 'bouncy']),
    fixes
  };
  for (const a of look.accessories ?? []) {
    if (fits(a, 'accessory', age, build, hairStyle)) app.accessories.push(a); else fixes.push(`accessory:${a}→없음`);
  }
  return app;
}

export function validateAppearance(app) {
  const problems = [];
  if (!PARTS.hair[app.hair?.style]) problems.push('hair');
  for (const slot of ['top', 'bottom']) if (!fits(app[slot]?.type, slot, app.age, app.build, app.hair?.style)) problems.push(slot);
  for (const a of app.accessories ?? []) if (!fits(a, 'accessory', app.age, app.build, app.hair?.style)) problems.push('accessory:' + a);
  return problems;
}

// Full gene record: separate sections, plus the seed, generated result and data version.
export function makeGenes(def) {
  return {
    version: GENE_VERSION,
    seed: def.seed,
    appearance: buildAppearance(def.seed, def.look),
    temperament: { ...def.temperament },
    expression: { ...def.expression },
    life: { ...def.life, windows: def.life.windows?.map(w => [...w]) ?? [], favorites: [...(def.life.favorites ?? [])] }
  };
}

// A whole neighbourhood person from one seed. Appearance and temperament use separate streams,
// so looks never decide personality.
const NAMES = { f: ['하윤', '예린', '은지', '미경', '보람', '정숙', '소영', '다은'], m: ['서준', '지호', '동현', '상철', '경민', '태희', '준영', '병수'], n: ['해솔', '이랑', '가온', '누리'] };
const BACKGROUNDS = { teen: ['근처 중학교 학생', '편의점 앞 학원에 다니는 학생'], adult: ['근처 병원 간호사', '퇴근이 늦은 회사원', '동네 미용실 사장', '야간 택배 분류 일을 하는 사람', '근처 원룸에 사는 대학원생', '헬스장 트레이너'], elder: ['손주를 돌보는 동네 주민', '경비 일을 하는 어르신'] };
export function generatePerson(seed, id, usedNames = new Set()) {
  const look = rng32(seed), mind = rng32(seed ^ 0x5bd1e995), life = rng32(seed ^ 0x27d4eb2f);
  const age = pick(look, ['adult', 'adult', 'adult', 'teen', 'elder']);
  const sex = pick(look, ['f', 'm', 'f', 'm', 'n']);
  const appearance = { age, sex, build: pick(look, ALL_BUILDS), height: Math.round(look() * 4 - 2), accessories: look() < .5 ? [pick(look, Object.keys(PARTS.accessory))] : [] };
  const pool = NAMES[sex].filter(n => !usedNames.has(n));
  const name = pick(life, pool.length ? pool : NAMES.n);
  const v = () => Math.round(10 + mind() * 85);
  const temperament = { kindness: v(), patience: v(), sociability: v(), selfCentered: v(), meticulous: v(), suspicion: v(), impulsivity: v(), conflictAvoid: v() };
  const expression = { verbosity: pick(mind, ['short', 'short', 'mid']), politeness: age === 'elder' ? 'elder' : temperament.kindness < 30 && temperament.selfCentered > 70 ? 'rude' : pick(mind, ['formal', 'formal', 'mixed', 'casual']), directness: v(), initiative: v(), gesture: pick(mind, ['nod', 'still', 'wave', 'fidget']) };
  // Drawn last from this stream so earlier values for a seed do not shift.
  expression.ack = expression.politeness === 'elder' ? pick(mind, ['그래요.', '예, 예.', '그럼요.']) : expression.politeness === 'rude' ? pick(mind, ['어.', '어어.', '그래.']) : pick(mind, ['네.', '네에.', '넵.', '예.', '네네.']);
  const start = pick(life, [7, 8, 12, 17, 19, 21, 23]) * 60 + Math.floor(life() * 4) * 15;
  const favs = ['coffee', 'water', 'soda', 'milk', 'banana', 'lunchbox', 'kimbap', 'sandwich', 'chips', 'choco', 'cupRamen', 'bigRamen', 'tissue', 'battery'];
  const f1 = pick(life, favs), f2 = pick(life, favs.filter(x => x !== f1));
  return {
    id, name, kind: 'customer', seed, generated: true, look: appearance, temperament, expression,
    life: { ageGroup: age === 'teen' ? '10대' : age === 'elder' ? '70대' : pick(life, ['20대', '30대', '40대', '50대']), background: pick(life, BACKGROUNDS[age === 'child' ? 'teen' : age]), windows: [[start, start + 90 + Math.floor(life() * 90)]], budget: 3000 + Math.floor(life() * 10) * 1000, favorites: [f1, f2], purposes: ['필요한 것 사러'], umbrellaHabit: Math.round(20 + life() * 75), frequency: .35 + life() * .5, staysToEat: life() < .25 }
  };
}

const COLOR_WORDS = [['#e07a35', '주황'], ['#ecc94a', '노란'], ['#cf8f8c', '분홍'], ['#d36e78', '분홍'], ['#a8b8a6', '연두'], ['#8f7ea6', '보라'], ['#4f5a3e', '국방색'], ['#cdb38e', '베이지'],
  ['#dfe5ea', '흰'], ['#2f3d5c', '남색'], ['#596b80', '회청색'], ['#7b7f86', '회색'], ['#2e3f5e', '남색'], ['#7a5a3f', '갈색'], ['#6c705a', '카키'],
  ['#b9473c', '빨간'], ['#7fc4b0', '민트색'], ['#e9e2c8', '아이보리'], ['#3c3f45', '검은'], ['#e9eef2', '흰'], ['#b65c6a', '자주색'], ['#5f6b7a', '회청색'],
  ['#5a6c7e', '청회색'], ['#8b9e82', '올리브색'], ['#c28c8a', '분홍'], ['#d9d2b7', '아이보리'], ['#3f4a48', '짙은 회색'], ['#a6b4a7', '연두'], ['#c7a05a', '겨자색'], ['#6b5a7a', '보라'], ['#7f5f48', '갈색']];
const SIZE_WORDS = app => app.build === 'broad' ? '덩치 큰' : app.build === 'round' ? '통통한' : app.height >= 1 ? '키 큰' : app.height <= -1 ? '키 작은' : app.build === 'slim' ? '마른' : '';
// Labels must tell people apart, so duplicates get a body-size word in front.
export function uniqueLabels(people) {
  const out = {}, seen = {};
  for (const p of people) { const l = lookLabel(p.genes.appearance); out[p.id] = l; (seen[l] ??= []).push(p); }
  for (const [l, list] of Object.entries(seen)) {
    if (list.length < 2) continue;
    list.forEach((p, i) => { const w = SIZE_WORDS(p.genes.appearance); out[p.id] = i === 0 && !w ? l : `${w || '다른'} ${l}`; });
  }
  // Still the same after body size: try the colour of the top, then a plain order.
  const again = {};
  for (const p of people) (again[out[p.id]] ??= []).push(p);
  for (const [l, list] of Object.entries(again)) {
    if (list.length < 2) continue;
    const used = new Set();
    list.forEach((p, i) => {
      const c = colorWord(p.genes.appearance.top.color);
      let label = c && !l.includes(c) ? `${c} 옷의 ${l}` : l;
      if (used.has(label)) label = `${l} ${i + 1}`;
      used.add(label); out[p.id] = label;
    });
  }
  return out;
}
const TOP_WORDS = { tee: '티셔츠', hoodie: '후드티', shirt: '셔츠', jacket: '재킷', cardigan: '카디건', coat: '코트', vest: '조끼', workvest: '작업 조끼', school: '교복', uniform: '유니폼' };
function colorWord(hex) {
  const found = COLOR_WORDS.find(([c]) => c === hex);
  return found ? found[1] : '';
}
// A label for someone whose name the viewer does not know yet, built from what is visible.
export function lookLabel(app) {
  if (app.age === 'child') return `${colorWord(app.top.color) || '작은'} 옷 아이`;
  if (app.top.type === 'school') return '교복 학생';
  if (app.age === 'teen') return `${colorWord(app.top.color) ? colorWord(app.top.color) + ' ' : ''}${TOP_WORDS[app.top.type] ?? '옷'} 학생`;
  if (app.age === 'elder') return app.accessories.includes('cap') ? '모자 쓴 어르신' : app.accessories.includes('glasses') ? '안경 쓴 어르신' : '어르신';
  if (app.top.type === 'workvest') return '작업 조끼 손님';
  if (app.hair.style === 'balding') return '갈색 점퍼 손님';
  const color = colorWord(app.top.color);
  if (app.top.type === 'vest') return `${color} 조끼 손님`;
  if (app.accessories.includes('glasses')) return '안경 쓴 손님';
  if (app.accessories.includes('backpack')) return '백팩 멘 손님';
  if (app.accessories.includes('earbuds') && app.top.type === 'hoodie') return '후드티 손님';
  return `${color ? color + ' ' : ''}${TOP_WORDS[app.top.type] ?? '옷'} 손님`;
}
