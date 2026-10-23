// Authored content: products, cast, fixed groups and the base roster.
// Appearance here is a partial override; genes.js fills the rest from the seed and validates parts.

export const PRODUCTS = {
  cigaretteBlue: { name:'솔빛 블루',price:4500,cost:3500,fixture:'tobaccoCabinet',shelfMax:8,color:'#6586a5',shape:'box',staffOnly:true,facility:'tobaccoSales' },
  cigaretteBrown: { name:'솔빛 브라운',price:4500,cost:3500,fixture:'tobaccoCabinet',shelfMax:8,color:'#9d805c',shape:'box',staffOnly:true,facility:'tobaccoSales' },
  coffee:      { name: '캔커피', price: 1800, cost: 1000, fixture: 'drinkFridge', shelfMax: 10, color: '#8a5a3c', shape: 'can' },
  water:       { name: '생수', price: 1000, cost: 450, fixture: 'drinkFridge', shelfMax: 10, color: '#9cc3cf', shape: 'bottle' },
  soda:        { name: '탄산음료', price: 2000, cost: 1100, fixture: 'drinkFridge', shelfMax: 8, color: '#c4483c', shape: 'can' },
  milk:        { name: '흰 우유', price: 2400, cost: 1500, fixture: 'milkFridge', shelfMax: 8, color: '#e8ece4', shape: 'carton' },
  banana:      { name: '바나나우유', price: 1700, cost: 1000, fixture: 'milkFridge', shelfMax: 8, color: '#e8cf5e', shape: 'jar' },
  lunchbox:    { name: '제육 도시락', price: 4900, cost: 3200, fixture: 'mealCooler', shelfMax: 4, color: '#c9773f', shape: 'tray', heat: 'microwave', eat: true, expires: 1 },
  kimbap:      { name: '삼각김밥', price: 1500, cost: 900, fixture: 'mealCooler', shelfMax: 8, color: '#3b4a3a', shape: 'triangle', eat: true, expires: 1 },
  sandwich:    { name: '샌드위치', price: 3200, cost: 2000, fixture: 'mealCooler', shelfMax: 5, color: '#e3c58c', shape: 'wedge', eat: true, expires: 1 },
  chips:       { name: '감자칩', price: 1700, cost: 1000, fixture: 'snackShelf', shelfMax: 8, color: '#e0b23f', shape: 'bag' },
  choco:       { name: '초코바', price: 1500, cost: 800, fixture: 'snackShelf', shelfMax: 8, color: '#6b3f2e', shape: 'bar' },
  candy:       { name: '막대사탕', price: 800, cost: 350, fixture: 'snackShelf', shelfMax: 10, color: '#e27aa0', shape: 'pop' },
  cupRamen:    { name: '컵라면', price: 1500, cost: 900, fixture: 'ramenShelf', shelfMax: 10, color: '#d4553a', shape: 'cup', heat: 'hotWater', eat: true },
  bigRamen:    { name: '큰컵라면', price: 1900, cost: 1150, fixture: 'ramenShelf', shelfMax: 6, color: '#b8352c', shape: 'bigcup', heat: 'hotWater', eat: true },
  tissue:      { name: '휴지', price: 2500, cost: 1500, fixture: 'dailyShelf', shelfMax: 6, color: '#dfe6ee', shape: 'box' },
  battery:     { name: '건전지', price: 4000, cost: 2400, fixture: 'dailyShelf', shelfMax: 6, color: '#3f6f8f', shape: 'card' },
  umbrella:    { name: '비닐우산', price: 7000, cost: 3800, fixture: 'dailyShelf', shelfMax: 5, color: '#c7d7dc', shape: 'umbrella', facility: 'umbrellaSale' },
  // Store interior expansion. `counter` goods are asked for at the till; `adult` goods need an age check.
  mask:        { name: '마스크', price: 1500, cost: 700, fixture: 'dailyShelf', shelfMax: 8, color: '#e8eef2', shape: 'card', par: 6 },
  salad:       { name: '닭가슴살 샐러드', price: 3900, cost: 2400, fixture: 'mealCooler', shelfMax: 4, color: '#7fae5a', shape: 'tray', eat: true, expires: 1, par: 4 },
  beer:        { name: '캔맥주', price: 2900, cost: 1700, fixture: 'alcoholFridge', shelfMax: 10, color: '#d8b13e', shape: 'can', adult: true },
  soju:        { name: '소주', price: 1900, cost: 1100, fixture: 'alcoholFridge', shelfMax: 10, color: '#7fc29a', shape: 'bottle', adult: true },
  bread:       { name: '단팥빵', price: 1600, cost: 900, fixture: 'breadRack', shelfMax: 8, color: '#c98a4a', shape: 'bun', expires: 2, par: 4 },
  castella:    { name: '카스텔라', price: 2200, cost: 1300, fixture: 'breadRack', shelfMax: 6, color: '#e2b456', shape: 'loaf', expires: 3, par: 3 },
  iceCream:    { name: '아이스크림', price: 1200, cost: 600, fixture: 'iceFreezer', shelfMax: 12, color: '#f1a7b9', shape: 'pop', frozen: true, par: 10 },
  iceCup:      { name: '얼음컵', price: 800, cost: 300, fixture: 'iceFreezer', shelfMax: 12, color: '#cfe6ee', shape: 'cup', frozen: true, par: 8 },
  newspaper:   { name: '조간신문', price: 1000, cost: 600, fixture: 'newsRack', shelfMax: 6, color: '#dedad0', shape: 'paper', expires: .5, par: 3 },
  gum:         { name: '껌', price: 1000, cost: 500, fixture: 'counterRack', shelfMax: 12, color: '#5fb3a1', shape: 'bar' },
  americano:   { name: '원두 아메리카노', price: 1500, cost: 400, fixture: 'coffeeMachine', shelfMax: 30, color: '#f4efe4', shape: 'cup', counter: true, brew: true },
  hotbar:      { name: '핫바', price: 2500, cost: 1400, fixture: 'hotCase', shelfMax: 6, color: '#c46a3f', shape: 'stick', counter: true, eat: true, expires: 1, par: 5 },
  // Products are only ever appended here: replay frames store stock in this order.
  hangover:    { name: '숙취해소 음료', price: 4500, cost: 2600, fixture: 'drinkFridge', shelfMax: 6, color: '#5c8a3a', shape: 'bottle', par: 6 },
  peachTea: {name:'복숭아 아이스티',price:1800,cost:900,fixture:'drinkFridge',shelfMax:6,color:'#ecac88',shape:'bottle',par:5},
  yogurt: {name:'딸기 요거트',price:1900,cost:1050,fixture:'milkFridge',shelfMax:5,color:'#e6a3b1',shape:'cup',expires:3,par:3},
  tunaRoll: {name:'참치 김밥',price:3000,cost:1800,fixture:'mealCooler',shelfMax:4,color:'#576c48',shape:'loaf',eat:true,expires:1,par:3},
  cheeseRamen: {name:'치즈 컵라면',price:2100,cost:1200,fixture:'ramenShelf',shelfMax:6,color:'#e2be52',shape:'cup',heat:'hotWater',eat:true,par:4},
  crackers: {name:'버터 크래커',price:2000,cost:1100,fixture:'snackShelf',shelfMax:6,color:'#dea15c',shape:'box',par:4},
  saltBread: {name:'소금빵',price:2300,cost:1300,fixture:'breadRack',shelfMax:5,color:'#c59a60',shape:'bun',expires:2,par:3},
  pudding: {name:'커스터드 푸딩',price:2800,cost:1600,fixture:'dessertCooler',shelfMax:5,color:'#e6cb79',shape:'cup',eat:true,expires:2,par:3},
  creamCake: {name:'딸기 생크림 케이크',price:3900,cost:2400,fixture:'dessertCooler',shelfMax:4,color:'#e6a0a0',shape:'wedge',eat:true,expires:1,par:2},
  wetWipes: {name:'휴대용 물티슈',price:1200,cost:600,fixture:'dailyShelf',shelfMax:6,color:'#a7c6bb',shape:'bag',par:4}
};

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
export const FIRST_WEEKDAY = 4; // DAY 1 is a Thursday.

// Base weekly roster. Night shift runs past midnight to 08:00 of the next day.
const weekdayShifts = [
  { id: 'am', label: '오전', start: 480, end: 840, worker: 'taeo' },
  { id: 'pm', label: '저녁', start: 840, end: 1320, worker: 'yuna' },
  { id: 'night', label: '야간', start: 1320, end: 1920, worker: 'jae' }
];
const weekendShifts = [
  { id: 'am', label: '오전', start: 480, end: 840, worker: 'yuna' },
  { id: 'pm', label: '저녁', start: 840, end: 1320, worker: 'taeo' },
  { id: 'night', label: '야간', start: 1320, end: 1920, worker: 'jae' }
];
export const BASE_ROSTER = Object.fromEntries(WEEKDAYS.map((_, i) => [i, (i === 0 || i === 6 ? weekendShifts : weekdayShifts).map(s => ({ ...s }))]));
export const INITIAL_EXCEPTIONS = [
  { id: 'x1', day: 2, shift: 'night', type: 'substitute', worker: 'taeo', note: '재현 개인 사정으로 태오 대타' },
  { id: 'x2', day: 3, shift: 'am', type: 'late', minutes: 25, note: '유나 버스 지연' }
];

const T = (k, p, so, se, me, su, im, av) => ({ kindness: k, patience: p, sociability: so, selfCentered: se, meticulous: me, suspicion: su, impulsivity: im, conflictAvoid: av });
const E = (verbosity, politeness, directness, initiative, gesture) => ({ verbosity, politeness, directness, initiative, gesture });
const H = h => h * 60;

export const CAST = [
  { id: 'yuna', name: '유나', kind: 'worker', seed: 1101,
    look: { age: 'adult', sex: 'f', build: 'slim', height: 0, hair: { style: 'ponytail', color: '#3e302b' }, top: { type: 'uniform', color: '#e6dfc8' }, bottom: { type: 'slacks', color: '#3f4a48' }, posture: 'upright' },
    temperament: T(82, 85, 35, 20, 88, 30, 15, 70), expression: E('short', 'formal', 40, 30, 'nod'),
    life: { ageGroup: '20대', ageYears: 25, background: '대학원 휴학 중인 저녁 알바생', budget: 0, favorites: ['banana'], purposes: [] },
    skills: { checkout: 70, stocking: 90, cleaning: 75, service: 70 } },
  { id: 'jae', name: '재현', kind: 'worker', seed: 1102,
    look: { age: 'adult', sex: 'm', build: 'broad', height: 2, hair: { style: 'short', color: '#26292a' }, top: { type: 'uniform', color: '#cfd6c8' }, bottom: { type: 'jeans', color: '#36465a' }, posture: 'slouch' },
    temperament: T(68, 62, 25, 35, 70, 55, 30, 35), expression: E('short', 'formal', 80, 25, 'still'),
    life: { ageGroup: '20대', ageYears: 29, background: '낮에 자고 밤에 일하는 야간 알바생', budget: 0, favorites: ['coffee'], purposes: [] },
    skills: { checkout: 85, stocking: 70, cleaning: 60, service: 55 } },
  { id: 'taeo', name: '태오', kind: 'worker', seed: 1103,
    look: { age: 'adult', sex: 'm', build: 'slim', height: 1, hair: { style: 'curly', color: '#5a3b28' }, top: { type: 'uniform', color: '#f0e3c4' }, bottom: { type: 'pants', color: '#55524a' }, posture: 'bouncy' },
    temperament: T(75, 50, 85, 40, 35, 20, 70, 55), expression: E('mid', 'mixed', 55, 80, 'wave'),
    life: { ageGroup: '20대', ageYears: 20, background: '오전과 주말, 대타를 맡는 대학생 알바생', budget: 0, favorites: ['chips'], purposes: [] },
    skills: { checkout: 55, stocking: 45, cleaning: 50, service: 85 } },

  { id: 'doyun', name: '도윤', kind: 'customer', seed: 2101,
    look: { age: 'adult', sex: 'm', build: 'average', height: 1, hair: { style: 'short', color: '#332c27' }, top: { type: 'vest', color: '#e07a35' }, bottom: { type: 'pants', color: '#3b4656' }, accessories: ['cap'], posture: 'lean' },
    temperament: T(60, 18, 45, 50, 40, 30, 65, 30), expression: E('short', 'mixed', 75, 60, 'fidget'),
    life: { ageGroup: '30대', ageYears: 34, background: '오토바이 배달 기사', windows: [[H(19), H(25)]], budget: 6000, favorites: ['coffee', 'kimbap'], purposes: ['배달 사이 쉬는 시간'], umbrellaHabit: 10, frequency: 1.3 } },
  { id: 'minseo', name: '민서', kind: 'customer', seed: 2102,
    look: { age: 'adult', sex: 'f', build: 'slim', height: 0, hair: { style: 'long', color: '#2f2422' }, top: { type: 'cardigan', color: '#a8b8a6' }, bottom: { type: 'skirt', color: '#5a6170' }, accessories: ['bag'], posture: 'upright' },
    temperament: T(78, 88, 30, 25, 80, 40, 20, 80), expression: E('short', 'formal', 30, 20, 'still'),
    life: { ageGroup: '20대', ageYears: 23, background: '근처 회사의 신입 사원', windows: [[H(20), H(23)]], budget: 9000, favorites: ['lunchbox', 'banana'], purposes: ['늦은 저녁'], umbrellaHabit: 85, frequency: 1 } },
  { id: 'harin', name: '하린', kind: 'customer', seed: 2103,
    look: { age: 'adult', sex: 'f', build: 'average', height: -1, hair: { style: 'bob', color: '#7a3f2e' }, top: { type: 'hoodie', color: '#cf8f8c' }, bottom: { type: 'jeans', color: '#4d6278' }, accessories: ['earbuds'], posture: 'bouncy' },
    temperament: T(72, 42, 88, 45, 30, 25, 82, 45), expression: E('mid', 'casual', 70, 85, 'wave'),
    life: { ageGroup: '20대', ageYears: 22, background: '근처 대학의 학생', windows: [[H(20), H(23)]], budget: 7000, favorites: ['chips', 'choco', 'soda'], purposes: ['새 간식 구경'], umbrellaHabit: 50, frequency: 1 } },
  { id: 'jiwoo', name: '지우', kind: 'customer', seed: 2104,
    look: { age: 'adult', sex: 'm', build: 'slim', height: 2, hair: { style: 'side', color: '#2b2b2e' }, top: { type: 'jacket', color: '#596b80' }, bottom: { type: 'pants', color: '#2e3540' }, accessories: ['backpack'], posture: 'slouch' },
    temperament: T(65, 70, 50, 30, 55, 50, 40, 60), expression: E('short', 'casual', 50, 35, 'still'),
    life: { ageGroup: '20대', ageYears: 24, background: '도서관에서 공부하는 취업 준비생', windows: [[H(20), H(23)]], budget: 5000, favorites: ['cupRamen', 'lunchbox'], purposes: ['공부 끝난 뒤 간식'], umbrellaHabit: 70, frequency: .5 } },
  { id: 'sunja', name: '순자', kind: 'customer', seed: 2105,
    look: { age: 'elder', sex: 'f', build: 'round', height: -2, hair: { style: 'bun', color: '#b9b8ae' }, top: { type: 'cardigan', color: '#8f7ea6' }, bottom: { type: 'pants', color: '#5c5e58' }, accessories: ['glasses'], posture: 'stoop' },
    temperament: T(96, 92, 70, 15, 75, 35, 15, 70), expression: E('mid', 'elder', 45, 65, 'nod'),
    life: { ageGroup: '60대 후반', ageYears: 68, background: '은퇴 후 산책이 일과인 동네 주민', windows: [[H(7), H(9)], [H(20), H(21.5)]], budget: 5000, favorites: ['milk', 'bread'], purposes: ['산책 끝에 우유'], umbrellaHabit: 95, frequency: 1, walkSpeed: .7 } },
  { id: 'mansik', name: '만식', kind: 'customer', seed: 2106,
    look: { age: 'adult', sex: 'm', build: 'broad', height: 2, hair: { style: 'buzz', color: '#2a2724' }, face: { shape: 'square', brows: 'stern', beard: 'stubble' }, top: { type: 'workvest', color: '#4f5a3e' }, bottom: { type: 'pants', color: '#6a6250' }, posture: 'upright' },
    temperament: T(88, 75, 40, 20, 60, 30, 30, 50), expression: E('short', 'mixed', 60, 30, 'still'),
    life: { ageGroup: '50대', ageYears: 52, background: '근처 공사 현장의 반장', windows: [[H(6), H(7.5)], [H(20), H(22.5)]], budget: 8000, favorites: ['bigRamen', 'soju'], purposes: ['일 끝나고 라면'], umbrellaHabit: 60, frequency: 1.1, staysToEat: true } },
  { id: 'seoyun', name: '서윤', kind: 'customer', seed: 2107,
    look: { age: 'adult', sex: 'f', build: 'average', height: 0, hair: { style: 'long', color: '#5b3a2a' }, top: { type: 'coat', color: '#cdb38e' }, bottom: { type: 'slacks', color: '#3d3a3f' }, accessories: ['bag'], posture: 'upright' },
    temperament: T(45, 40, 75, 85, 50, 60, 50, 20), expression: E('mid', 'formal', 35, 80, 'still'),
    life: { ageGroup: '40대', ageYears: 41, background: '건너편 학원의 원장', windows: [[H(21), H(22.5)], [H(13), H(14)]], budget: 15000, favorites: ['salad', 'water'], purposes: ['수업 사이 요기'], umbrellaHabit: 90, frequency: .9 } },
  { id: 'jeongho', name: '정호', kind: 'customer', seed: 2108,
    look: { age: 'adult', sex: 'm', build: 'average', height: 1, hair: { style: 'side', color: '#2c2724' }, top: { type: 'shirt', color: '#dfe5ea' }, bottom: { type: 'slacks', color: '#3b4250' }, accessories: ['glasses'], posture: 'upright' },
    temperament: T(70, 60, 45, 35, 65, 45, 30, 65), expression: E('short', 'formal', 45, 40, 'nod'),
    life: { ageGroup: '30대', ageYears: 38, background: '퇴근길에 아이를 데리고 오는 회사원', windows: [[H(18.5), H(20)]], budget: 12000, favorites: ['milk', 'beer'], purposes: ['내일 아침거리'], umbrellaHabit: 80, frequency: .9 } },
  { id: 'haeun', name: '하은', kind: 'customer', seed: 2109,
    look: { age: 'child', sex: 'f', build: 'average', height: 0, hair: { style: 'twin', color: '#3a2a22' }, top: { type: 'tee', color: '#ecc94a' }, bottom: { type: 'skirt', color: '#d36e78' }, posture: 'bouncy' },
    temperament: T(70, 20, 80, 60, 15, 10, 95, 30), expression: E('short', 'child', 80, 85, 'bouncy'),
    life: { ageGroup: '7세', ageYears: 7, background: '정호의 딸, 유치원생', windows: [[H(18.5), H(20)]], budget: 0, favorites: ['candy', 'banana'], purposes: ['따라 나온 길'], umbrellaHabit: 80, frequency: 0, walkSpeed: .9 } },
  { id: 'hyunwoo', name: '현우', kind: 'customer', seed: 2110,
    look: { age: 'adult', sex: 'm', build: 'average', height: 0, hair: { style: 'short', color: '#1f1d1d' }, top: { type: 'jacket', color: '#2f3d5c' }, bottom: { type: 'slacks', color: '#2a2e36' }, accessories: ['earbuds'], posture: 'slouch' },
    temperament: T(55, 45, 60, 55, 40, 35, 60, 40), expression: E('short', 'casual', 60, 55, 'fidget'),
    life: { ageGroup: '30대', ageYears: 31, background: '야근이 잦은 회사원', windows: [[H(22), H(24.5)]], budget: 8000, favorites: ['lunchbox', 'cupRamen', 'soda'], purposes: ['야근 중 야식'], umbrellaHabit: 40, frequency: 1 } },
  { id: 'sujin', name: '수진', kind: 'customer', seed: 2111,
    look: { age: 'adult', sex: 'f', build: 'slim', height: 1, hair: { style: 'ponytail', color: '#3a2c26' }, top: { type: 'jacket', color: '#7b7f86' }, bottom: { type: 'slacks', color: '#2f3238' }, accessories: ['bag'], posture: 'upright' },
    temperament: T(75, 70, 55, 30, 85, 40, 25, 55), expression: E('short', 'formal', 50, 45, 'nod'),
    life: { ageGroup: '20대', ageYears: 29, background: '현우와 같은 팀의 회사원', windows: [[H(22), H(24.5)]], budget: 9000, favorites: ['sandwich', 'americano'], purposes: ['야근 중 야식'], umbrellaHabit: 85, frequency: .9 } },
  { id: 'minjun', name: '민준', kind: 'customer', seed: 2112,
    look: { age: 'teen', sex: 'm', build: 'slim', height: 0, hair: { style: 'short', color: '#1d1b1b' }, top: { type: 'school', color: '#2e3f5e' }, bottom: { type: 'pants', color: '#2b3448' }, accessories: ['backpack'], posture: 'slouch' },
    temperament: T(70, 65, 20, 30, 50, 45, 45, 85), expression: E('short', 'formal', 25, 15, 'still'),
    life: { ageGroup: '10대', ageYears: 17, background: '학원 끝나고 들르는 고등학생', windows: [[H(21.5), H(23.5)]], budget: 3000, favorites: ['cupRamen', 'hotbar'], purposes: ['학원 끝나고 요기'], umbrellaHabit: 55, frequency: 1, staysToEat: true } },
  { id: 'yongsu', name: '용수', kind: 'customer', seed: 2113,
    look: { age: 'adult', sex: 'm', build: 'round', height: 0, hair: { style: 'balding', color: '#3b3632' }, face: { shape: 'round', brows: 'flat', beard: 'stubble' }, top: { type: 'jacket', color: '#7a5a3f' }, bottom: { type: 'pants', color: '#4a4740' }, posture: 'lean' },
    temperament: T(25, 15, 50, 80, 20, 70, 75, 10), expression: E('short', 'rude', 90, 70, 'fidget'),
    life: { ageGroup: '40대', ageYears: 47, background: '밤에 일하는 택시 기사', windows: [[H(23), H(27)]], budget: 7000, favorites: ['coffee', 'choco'], purposes: ['운행 중 잠깐'], umbrellaHabit: 60, frequency: 1 } },
  { id: 'yeonggil', name: '영길', kind: 'customer', seed: 2114,
    look: { age: 'elder', sex: 'm', build: 'slim', height: -1, hair: { style: 'short', color: '#c9c7c0' }, top: { type: 'jacket', color: '#6c705a' }, bottom: { type: 'slacks', color: '#4b4a44' }, accessories: ['glasses', 'cap'], posture: 'stoop' },
    temperament: T(60, 55, 35, 40, 92, 85, 10, 50), expression: E('mid', 'elder', 55, 50, 'still'),
    life: { ageGroup: '70대', ageYears: 74, background: '퇴직한 공무원, 순자와 같은 동네', windows: [[H(6.5), H(8)], [H(16), H(18)]], budget: 6000, favorites: ['milk', 'newspaper'], purposes: ['필요한 것만 사러'], umbrellaHabit: 98, frequency: .9, walkSpeed: .65 } },
  // Harder customers. Their trouble comes from temperament and state (drink, phone, habits), not from looks.
  { id: 'taesik', name: '태식', kind: 'customer', seed: 2115,
    look: { age: 'adult', sex: 'm', build: 'round', height: 1, hair: { style: 'side', color: '#2c2724' }, top: { type: 'shirt', color: '#e9eef2' }, bottom: { type: 'slacks', color: '#2f3540' }, posture: 'slouch' },
    temperament: T(62, 40, 75, 55, 25, 30, 72, 45), expression: E('mid', 'mixed', 60, 70, 'wave'),
    life: { ageGroup: '50대', ageYears: 51, background: '회식이 잦은 영업 과장', windows: [[H(22.5), H(26)]], budget: 15000, favorites: ['hangover', 'water'], purposes: ['회식 끝나고 귀갓길'], umbrellaHabit: 40, frequency: .9, drinker: true } },
  { id: 'minhyuk', name: '민혁', kind: 'customer', seed: 2116,
    look: { age: 'adult', sex: 'm', build: 'slim', height: 1, hair: { style: 'side', color: '#3b2a22' }, top: { type: 'hoodie', color: '#3c3f45' }, bottom: { type: 'jeans', color: '#33415a' }, accessories: ['earbuds'], posture: 'lean' },
    temperament: T(38, 28, 62, 86, 24, 30, 72, 25), expression: E('short', 'rude', 75, 65, 'fidget'),
    life: { ageGroup: '20대', ageYears: 27, background: '근처 원룸에 사는 직장인', windows: [[H(19), H(23.5)]], budget: 9000, favorites: ['soda', 'chips'], purposes: ['퇴근길 간식'], umbrellaHabit: 30, frequency: 1, phoneHeavy: true } },
  { id: 'hyesuk', name: '혜숙', kind: 'customer', seed: 2117,
    look: { age: 'elder', sex: 'f', build: 'average', height: -1, hair: { style: 'curly', color: '#4a3b33' }, top: { type: 'cardigan', color: '#b65c6a' }, bottom: { type: 'pants', color: '#4a4744' }, accessories: ['glasses', 'bag'], posture: 'upright' },
    temperament: T(40, 32, 72, 86, 72, 88, 30, 15), expression: E('mid', 'elder', 70, 80, 'still'),
    life: { ageGroup: '60대', ageYears: 63, background: '근처 아파트 주민, 따질 건 따지는 편', windows: [[H(10), H(12)], [H(17), H(19)]], budget: 12000, favorites: ['milk', 'sandwich'], purposes: ['장보기'], umbrellaHabit: 95, frequency: 1, refunder: true } },
  { id: 'manho', name: '만호', kind: 'customer', seed: 2118,
    look: { age: 'elder', sex: 'm', build: 'slim', height: 0, hair: { style: 'balding', color: '#bdbab2' }, top: { type: 'jacket', color: '#5f6b7a' }, bottom: { type: 'slacks', color: '#3f3f3f' }, posture: 'stoop' },
    temperament: T(48, 45, 75, 72, 60, 62, 30, 20), expression: E('mid', 'elder', 80, 85, 'nod'),
    life: { ageGroup: '70대', ageYears: 72, background: '은퇴한 교장 선생님', windows: [[H(7), H(9)], [H(15), H(17)]], budget: 6000, favorites: ['newspaper', 'milk'], purposes: ['신문 사러'], umbrellaHabit: 90, frequency: .9, walkSpeed: .75 } },
  { id: 'junseo', name: '준서', kind: 'customer', seed: 2119,
    look: { age: 'teen', sex: 'm', build: 'average', height: 0, hair: { style: 'curly', color: '#2a211d' }, top: { type: 'hoodie', color: '#b9473c' }, bottom: { type: 'jeans', color: '#3b4a63' }, accessories: ['backpack'], posture: 'bouncy' },
    temperament: T(60, 35, 85, 60, 25, 30, 85, 40), expression: E('mid', 'casual', 70, 85, 'wave'),
    life: { ageGroup: '10대', ageYears: 15, background: '근처 중학교 학생', windows: [[H(16), H(18.5)], [H(21), H(22.5)]], budget: 5000, favorites: ['chips', 'soda'], purposes: ['학원 끝나고 군것질'], umbrellaHabit: 35, frequency: 0 } },
  { id: 'seojin', name: '서진', kind: 'customer', seed: 2120,
    look: { age: 'teen', sex: 'f', build: 'slim', height: 0, hair: { style: 'ponytail', color: '#3a2a22' }, top: { type: 'tee', color: '#7fc4b0' }, bottom: { type: 'skirt', color: '#45506a' }, accessories: ['bag'], posture: 'upright' },
    temperament: T(70, 45, 80, 45, 40, 35, 70, 55), expression: E('mid', 'casual', 55, 75, 'wave'),
    life: { ageGroup: '10대', ageYears: 15, background: '근처 중학교 학생', windows: [[H(16), H(18.5)], [H(21), H(22.5)]], budget: 4000, favorites: ['iceCream', 'candy'], purposes: ['학원 끝나고 군것질'], umbrellaHabit: 60, frequency: 0 } },
  { id: 'dohyun', name: '도현', kind: 'customer', seed: 2121,
    look: { age: 'teen', sex: 'm', build: 'broad', height: 1, hair: { style: 'buzz', color: '#1d1b1b' }, top: { type: 'tee', color: '#e9e2c8' }, bottom: { type: 'shorts', color: '#2f3b2f' }, posture: 'slouch' },
    temperament: T(50, 30, 78, 72, 20, 40, 88, 30), expression: E('short', 'casual', 75, 80, 'fidget'),
    life: { ageGroup: '10대', ageYears: 16, background: '근처 중학교 학생', windows: [[H(16), H(18.5)], [H(21), H(22.5)]], budget: 6000, favorites: ['cupRamen', 'soda'], purposes: ['학원 끝나고 군것질'], umbrellaHabit: 25, frequency: 0 } }
];

// Personal verbal habit for short acknowledgements (expression genes).
const ACKS = { doyun: '아 네네.', minseo: '네.', harin: '네에.', jiwoo: '예.', sunja: '그래요, 그래요.', mansik: '예, 예.', seoyun: '어머, 네.', jeongho: '네, 네.', hyunwoo: '넵.', sujin: '네, 알겠습니다.', minjun: '네.', yongsu: '어어.', yeonggil: '그래요.', taesik: '어어, 네.', minhyuk: '어.', hyesuk: '그래요.', manho: '음, 그래요.', junseo: '네에.', seojin: '네.', dohyun: '넵.' };
for (const c of CAST) if (ACKS[c.id]) c.expression.ack = ACKS[c.id];

// Fixed groups: who usually comes together. A single visit may include only some members.
export const GROUPS = [
  { id: 'friends', name: '대학 동창 셋', kind: 'friends', members: ['minseo', 'harin', 'jiwoo'], purpose: '늦은 저녁', subsets: [[['minseo', 'harin'], 5], [['minseo', 'harin', 'jiwoo'], 2], [['minseo'], 2], [['harin', 'jiwoo'], 1]], leaveTogether: true, payMode: 'separate', frequency: 1.1 },
  { id: 'family', name: '정호네 부녀', kind: 'family', members: ['jeongho', 'haeun'], purpose: '퇴근길 장보기', subsets: [[['jeongho', 'haeun'], 5], [['jeongho'], 2]], leaveTogether: true, payMode: 'together', payer: 'jeongho', frequency: 1 },
  { id: 'coworkers', name: '야근 동료', kind: 'coworkers', members: ['hyunwoo', 'sujin'], purpose: '야근 중 야식', subsets: [[['hyunwoo', 'sujin'], 5], [['hyunwoo'], 3], [['sujin'], 1]], leaveTogether: false, payMode: 'separate', frequency: 1 },
  { id: 'teens', name: '동네 중학생 셋', kind: 'friends', members: ['junseo', 'seojin', 'dohyun'], purpose: '학원 끝나고 군것질', subsets: [[['junseo', 'seojin', 'dohyun'], 4], [['junseo', 'dohyun'], 3], [['seojin'], 1]], leaveTogether: true, payMode: 'separate', frequency: .9 }
];

// Starting relationships: [from, to, familiarity, trust]. Unlisted pairs start as strangers.
export const INITIAL_RELATIONS = [
  ['minseo', 'harin', 80, 75], ['harin', 'minseo', 85, 70], ['minseo', 'jiwoo', 60, 60], ['jiwoo', 'minseo', 65, 60], ['harin', 'jiwoo', 70, 55], ['jiwoo', 'harin', 60, 50],
  ['jeongho', 'haeun', 95, 90], ['haeun', 'jeongho', 95, 95], ['hyunwoo', 'sujin', 55, 50], ['sujin', 'hyunwoo', 50, 45],
  ['sunja', 'yeonggil', 45, 50], ['yeonggil', 'sunja', 50, 55], ['yuna', 'jae', 50, 60], ['jae', 'yuna', 45, 60], ['yuna', 'taeo', 40, 45], ['taeo', 'yuna', 55, 55], ['jae', 'taeo', 35, 40], ['taeo', 'jae', 40, 50],
  ['sunja', 'yuna', 40, 50], ['yuna', 'sunja', 40, 50], ['doyun', 'jae', 20, 30], ['jae', 'doyun', 20, 30]
];

// Names a person already knows at the start (besides their own group).
export const INITIAL_NAME_KNOWLEDGE = { yuna: ['jae', 'taeo', 'sunja'], jae: ['yuna', 'taeo'], taeo: ['yuna', 'jae'], sunja: ['yeonggil', 'yuna'], yeonggil: ['sunja'] };
