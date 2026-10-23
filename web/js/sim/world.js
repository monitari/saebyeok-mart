// Store layout, walkable grid and path finding. Pure data and functions, no rendering.
export const TILE = 32, COLS = 24, ROWS = 18, WIDTH = COLS * TILE, HEIGHT = ROWS * TILE;
export const LAYOUT_VERSION=5;

// The building is the union of these rooms. Shared edges are openings, not walls.
export const STORE_ROOMS = [
  {id:'sales',x:1,y:1,w:17,h:12},
  {id:'service',x:18,y:1,w:4,h:3},
  {id:'lounge',x:18,y:4,w:5,h:8},
  {id:'entry',x:7,y:13,w:8,h:2}
];
export function storeCell(x,y,version=LAYOUT_VERSION){
  return version<5?x>=1&&x<=22&&y>=1&&y<=14:STORE_ROOMS.some(r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h);
}
// Merge exposed tile edges into continuous wall runs; never outline the room joins.
export function storeBoundary(){
  const edges=[];
  for(let y=1;y<15;y++)for(let x=1;x<23;x++)if(storeCell(x,y)){
    for(const [side,dx,dy]of [['north',0,-1],['south',0,1],['west',-1,0],['east',1,0]]){
      if(storeCell(x+dx,y+dy))continue;
      const horizontal=dy!==0,line=horizontal?y+(dy>0?1:0):x+(dx>0?1:0),start=horizontal?x:y;
      const last=edges.find(e=>e.side===side&&e.line===line&&e.start+e.length===start);
      if(last)last.length++;else edges.push({side,line,start,length:1});
    }
  }
  return edges;
}

// Fixtures occupy floor cells (x, y, w, h in tiles). `access` cells are where a person stands to use them.
export const QUARTER_V2_FIXTURES = {
  tobaccoCabinet: {name:'계산대 뒤 담배 진열장',kind:'cabinet',staff:true,x:1,y:9,w:2,h:1,access:[[2,10,'up']]},
  milkFridge:  { name: '우유 냉장고', kind: 'fridge', x: 1, y: 1, w: 3, h: 3, access: [[1, 4, 'up'], [2, 4, 'up'], [3, 4, 'up']] },
  drinkFridge: { name: '음료 냉장고', kind: 'fridge', x: 4, y: 1, w: 4, h: 3, access: [[4, 4, 'up'], [5, 4, 'up'], [6, 4, 'up'], [7, 4, 'up']] },
  storage:     { name: '창고 문', kind: 'door', x: 8, y: 1, w: 2, h: 3, access: [[8, 4, 'up']], staff: true },
  mealCooler:  { name: '도시락 냉장 매대', kind: 'cooler', x: 10, y: 1, w: 5, h: 3, access: [[10, 4, 'up'], [11, 4, 'up'], [12, 4, 'up'], [13, 4, 'up'], [14, 4, 'up']] },
  microwave:   { name: '전자레인지', kind: 'appliance', x: 15, y: 1, w: 2, h: 3, access: [[15, 4, 'up']] },
  hotWater:    { name: '온수기', kind: 'appliance', x: 17, y: 1, w: 1, h: 3, access: [[17, 4, 'up']] },
  snackShelf:  { name: '과자 진열대', kind: 'shelf', tall: true, x: 4, y: 6, w: 2, h: 3, access: [[3, 6, 'right'], [3, 7, 'right'], [3, 8, 'right'], [6, 6, 'left'], [6, 7, 'left'], [6, 8, 'left']] },
  ramenShelf:  { name: '라면 진열대', kind: 'shelf', tall: true, x: 9, y: 6, w: 2, h: 3, access: [[8, 6, 'right'], [8, 7, 'right'], [8, 8, 'right'], [11, 6, 'left'], [11, 7, 'left'], [11, 8, 'left']] },
  dailyShelf:  { name: '생활용품 진열대', kind: 'shelf', tall: true, x: 9, y: 10, w: 4, h: 1, access: [[9, 11, 'up'], [10, 11, 'up'], [11, 11, 'up'], [12, 11, 'up'], [10, 9, 'down']] },
  counter:     { name: '계산대', kind: 'counter', x: 1, y: 11, w: 6, h: 1, access: [[3, 12, 'up']] },
  table:       { name: '창가 취식대', kind: 'table', x: 22, y: 5, w: 1, h: 3, access: [[21, 5, 'right'], [21, 6, 'right'], [21, 7, 'right']] },
  table2:      { name: '추가 취식대', kind: 'table', facility: 'extraTable', x: 18, y: 11, w: 4, h: 1, access: [[18, 10, 'down'], [19, 10, 'down'], [20, 10, 'down'], [21, 10, 'down']] },
  trash:       { name: '쓰레기통', kind: 'bin', x: 16, y: 8, w: 1, h: 1, access: [[16, 9, 'up']] },
  boxes:       { name: '입고 박스 공간', kind: 'pallet', x: 19, y: 13, w: 3, h: 2, access: [[18, 13, 'right'], [18, 14, 'right']], staff: true },
  umbrellaStand: { name: '우산꽂이', kind: 'stand', x: 12, y: 14, w: 1, h: 1, access: [[12, 13, 'down']] },
  // Interior expansion. Back-wall units sit in the wall rows; floor units block their own cells.
  alcoholFridge: { name: '주류 냉장고', kind: 'fridge', x: 18, y: 1, w: 3, h: 3, access: [[18, 4, 'up'], [19, 4, 'up'], [20, 4, 'up']] },
  coffeeMachine: { name: '원두커피 머신', kind: 'appliance', x: 21, y: 1, w: 2, h: 3, access: [[21, 4, 'up'], [22, 4, 'up']] },
  breadRack:   { name: '빵 진열대', kind: 'rack', tall: true, x: 1, y: 5, w: 1, h: 3, access: [[2, 5, 'left'], [2, 6, 'left'], [2, 7, 'left']] },
  iceFreezer:  { name: '아이스크림 냉동고', kind: 'freezer', x: 14, y: 6, w: 2, h: 1, access: [[14, 7, 'up'], [15, 7, 'up'], [14, 5, 'down'], [15, 5, 'down']] },
  recycle:     { name: '분리수거함과 국물통', kind: 'bin', x: 15, y: 8, w: 1, h: 1, access: [[15, 9, 'up']] },
  atm:         { name: 'ATM', kind: 'machine', tall: true, x: 22, y: 9, w: 1, h: 1, access: [[21, 9, 'right']] },
  newsRack:    { name: '신문 가판대', kind: 'rack', x: 13, y: 14, w: 1, h: 1, access: [[13, 13, 'down']] },
  basketStack: { name: '장바구니 거치대', kind: 'stand', x: 9, y: 14, w: 1, h: 1, access: [[10, 14, 'left']] },
  parcelShelf: { name: '택배 보관함', kind: 'cabinet', staff: true, x: 4, y: 9, w: 3, h: 1, access: [[5, 10, 'up']] },
  kiosk:       { name: '셀프 계산대', kind: 'machine', facility: 'selfCheckout', x: 1, y: 13, w: 1, h: 1, access: [[2, 13, 'left']] },
  // On the counter itself: these add no blocked cells beyond the counter.
  hotCase:     { name: '온장고', kind: 'warmer', onCounter: true, x: 5, y: 11, w: 2, h: 1, access: [[3, 10, 'right']], staff: true },
  counterRack: { name: '계산대 앞 껌 진열', kind: 'rack', onCounter: true, x: 2, y: 11, w: 1, h: 1, access: [[3, 12, 'up']] }
};
// One-cell deep wall equipment; two clear cross-aisles surround the shopping islands.
const rear=(id,x,w)=>({...QUARTER_V2_FIXTURES[id],x,y:1,w,h:1,access:Array.from({length:w},(_,i)=>[x+i,2,'up'])});
export const QUARTER_V3_FIXTURES={...QUARTER_V2_FIXTURES,
  milkFridge:rear('milkFridge',1,2),drinkFridge:rear('drinkFridge',3,3),
  storage:{...rear('storage',6,2),access:[[6,2,'up']]},mealCooler:rear('mealCooler',8,3),
  microwave:{...rear('microwave',11,2),access:[[11,2,'up']]},hotWater:rear('hotWater',13,1),
  alcoholFridge:rear('alcoholFridge',14,3),coffeeMachine:rear('coffeeMachine',17,2),
  atm:rear('atm',21,1),
  snackShelf:{...QUARTER_V2_FIXTURES.snackShelf,y:5,access:[[3,5,'right'],[3,6,'right'],[3,7,'right'],[6,5,'left'],[6,6,'left'],[6,7,'left']]},
  ramenShelf:{...QUARTER_V2_FIXTURES.ramenShelf,y:5,access:[[8,5,'right'],[8,6,'right'],[8,7,'right'],[11,5,'left'],[11,6,'left'],[11,7,'left']]},
  breadRack:{...QUARTER_V2_FIXTURES.breadRack,y:4,access:[[2,4,'left'],[2,5,'left'],[2,6,'left']]},
  iceFreezer:{...QUARTER_V2_FIXTURES.iceFreezer,x:15,access:[[15,7,'up'],[16,7,'up'],[15,5,'down'],[16,5,'down']]},
  recycle:{...QUARTER_V2_FIXTURES.recycle,x:19,y:3,access:[[19,4,'up']]},
  trash:{...QUARTER_V2_FIXTURES.trash,x:20,y:3,access:[[20,4,'up']]}
};
export const QUARTER_V4_FIXTURES={...QUARTER_V3_FIXTURES,
  restroom:{name:'공용 화장실',kind:'door',x:19,y:1,w:2,h:1,access:[[19,2,'up'],[20,2,'up']]},
  dessertCooler:{name:'디저트 냉장대',kind:'cooler',x:18,y:7,w:2,h:1,access:[[18,8,'up'],[19,8,'up'],[18,6,'down'],[19,6,'down']]}
};
export const FIXTURES={...QUARTER_V4_FIXTURES,
  kiosk:{...QUARTER_V4_FIXTURES.kiosk,y:8,access:[[2,8,'left']]},
  boxes:{...QUARTER_V4_FIXTURES.boxes,x:14,y:11,access:[[17,11,'left'],[17,12,'left']]}
};
export const ON_COUNTER = new Set(Object.keys(FIXTURES).filter(id => FIXTURES[id].onCounter));
// Historical recordings retain their original footprint even after the live store is rearranged.
export const LEGACY_FIXTURES={...QUARTER_V2_FIXTURES,
  snackShelf:{...FIXTURES.snackShelf,x:3,y:6,w:4,h:2,access:[[3,8,'up'],[4,8,'up'],[5,8,'up'],[6,8,'up'],[3,5,'down'],[5,5,'down']]},
  ramenShelf:{...FIXTURES.ramenShelf,x:9,y:6,w:4,h:2,access:[[9,8,'up'],[10,8,'up'],[11,8,'up'],[12,8,'up'],[10,5,'down'],[12,5,'down']]},
  dailyShelf:{...FIXTURES.dailyShelf,x:9,y:9,w:4,h:2,access:[[9,11,'up'],[10,11,'up'],[11,11,'up'],[12,11,'up']]},
  table:{...FIXTURES.table,name:'취식대',x:17,y:8,w:5,h:1,access:[[17,7,'down'],[18,7,'down'],[19,7,'down'],[20,7,'down'],[21,7,'down']]},
  table2:{...FIXTURES.table2,x:17,y:11,w:5,h:1,access:[[17,10,'down'],[18,10,'down'],[19,10,'down'],[20,10,'down'],[21,10,'down']]}
};
export const fixturesFor=s=>s.layoutVersion===1?LEGACY_FIXTURES:s.layoutVersion===2?QUARTER_V2_FIXTURES:s.layoutVersion===3?QUARTER_V3_FIXTURES:s.layoutVersion===4?QUARTER_V4_FIXTURES:FIXTURES;

export const SPOTS = {
  pos: [3, 10], pay: [3, 12],
  queue: [[3, 12], [5, 12], [6, 12], [7, 12], [8, 12], [8, 13], [7, 13]],
  doorIn: [10, 14], doorOut: [11, 14], street: [[0, 16], [23, 16], [0, 17], [23, 17]],
  waitInside: [[13, 11], [13, 12], [14, 9], [15, 9], [16, 9], [17, 9]],
  waitOutside: [[7, 16], [8, 16], [14, 16], [15, 16], [6, 16], [16, 16]],
  wetZone: [[10, 13], [11, 13], [10, 14], [11, 14]],
  staffIdle: [[2, 10], [5, 10]],
  kioskHelp: [2,7,'down-left']
};
export const STAFF_ZONE = new Set(['1,10', '2,10', '3,10', '4,10', '5,10', '6,10', '7,10']);

export const center = (x, y) => ({ x: x * TILE + 16, y: y * TILE + 22 });
export const cellOf = p => [Math.floor(p.x / TILE), Math.floor(p.y / TILE)];
const key = (x, y) => x + ',' + y;

function blockedCells(facilities = {}) {
  const set = new Set();
  for (const f of Object.values(FIXTURES)) {
    if (f.facility && !facilities[f.facility]) continue;
    for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) set.add(key(x, y));
  }
  return set;
}
let cache = { k: null, set: null };
function blocked(facilities) {
  const k = JSON.stringify(facilities ?? {});
  if (cache.k !== k) cache = { k, set: blockedCells(facilities) };
  return cache.set;
}

// Walkable for customers (staff=false) or staff (staff=true).
export function floorCell(x, y, { staff = false, facilities } = {}) {
  if (y >= 16 && y <= 17) return x >= 0 && x < COLS;           // street
  if (y === 15) return x === 10 || x === 11;                    // entrance
  if (y < 2 || !storeCell(x,y)) return false;
  if (blocked(facilities).has(key(x, y))) return false;
  if (!staff && STAFF_ZONE.has(key(x, y))) return false;
  return true;
}
export const isInside = p => !p.privateRoom && storeCell(...cellOf(p));

// Eight-neighbour A*, with no diagonal squeeze between fixtures or through staff-only space.
export function findPath(from, to, opts = {}) {
  const [sx, sy] = cellOf(from), [gx, gy] = cellOf(to);
  const ok = (x, y) => floorCell(x, y, opts) || (x === sx && y === sy);
  if (!floorCell(gx, gy, opts)) return [];
  if (sx === gx && sy === gy) return [center(gx, gy)];
  const open = [[sx, sy]], g = new Map([[key(sx, sy), 0]]), prev = new Map(), closed = new Set();
  const h = (x, y) => {const dx=Math.abs(x-gx),dy=Math.abs(y-gy);return Math.max(dx,dy)+(Math.SQRT2-1)*Math.min(dx,dy);};
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      const a = open[i], b = open[bi];
      if (g.get(key(...a)) + h(...a) < g.get(key(...b)) + h(...b)) bi = i;
    }
    const [x, y] = open.splice(bi, 1)[0], k = key(x, y);
    if (x === gx && y === gy) break;
    if (closed.has(k)) continue;
    closed.add(k);
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const nx = x + dx, ny = y + dy, nk = key(nx, ny);
      if (!ok(nx, ny) || closed.has(nk)) continue;
      if(dx&&dy&&(!floorCell(x+dx,y,opts)||!floorCell(x,y+dy,opts)))continue;
      const ng = g.get(k) + (dx&&dy?Math.SQRT2:1);
      if (ng < (g.get(nk) ?? Infinity)) { g.set(nk, ng); prev.set(nk, [x, y]); open.push([nx, ny]); }
    }
  }
  if (!prev.has(key(gx, gy))) return [];
  const route = [];
  let cur = [gx, gy];
  while (!(cur[0] === sx && cur[1] === sy)) { route.unshift(center(...cur)); cur = prev.get(key(...cur)); }
  return route;
}

// Nearest walkable cell, used to rescue a person who ended up somewhere invalid.
export function nearestFloor(p, opts = {}) {
  const [cx, cy] = cellOf(p);
  for (let r = 0; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (floorCell(cx + dx, cy + dy, opts)) return center(cx + dx, cy + dy);
  }
  return center(...SPOTS.doorIn);
}
