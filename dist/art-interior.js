// Pixel drawings for the store's equipment and small details. Everything here reads state; nothing changes it.
// `g` carries the shared helpers from art.js (rect, shade, product icons, stock rows).
import { TILE, WIDTH, FIXTURES } from './world.js';
import { PRODUCTS } from './data.js';

const at = (s, fid, anims = ['browse', 'pick', 'use']) => Object.values(s.actors).filter(a => FIXTURES[fid].access.some(([x, y]) => Math.floor(a.x / TILE) === x && Math.floor(a.y / TILE) === y) && anims.includes(a.anim));
const minuteOf = s => ((s.clock % 1440) + 1440) % 1440;

// ---------- walls and ceiling ----------
export function drawCeiling(c, g) {
  const R = g.R;
  // Air conditioner, speakers, cameras, a convex mirror and the exit sign.
  R(c, 424, 3, 76, 13, '#eef0ec'); R(c, 428, 12, 68, 2, '#b9bfba'); for (let i = 0; i < 6; i++) R(c, 432 + i * 11, 6, 7, 1, '#c9cfca');
  for (const x of [250, 560]) { R(c, x, 4, 10, 10, '#3d4847'); R(c, x + 2, 6, 6, 6, '#56625f'); }
  for (const x of [40, 714]) { R(c, x, 6, 14, 7, '#2a2f31'); R(c, x + (x < 384 ? 12 : -2), 8, 4, 3, '#2a2f31'); }
  R(c, 264, 22, 40, 10, '#2e8c55'); R(c, 266, 24, 36, 6, '#45b06f'); R(c, 274, 25, 4, 4, '#f4f4ee'); R(c, 279, 26, 6, 1, '#f4f4ee'); R(c, 290, 25, 6, 4, '#f4f4ee');
}
export function drawWallDetails(c, s, g, now) {
  const R = g.R, m = minuteOf(s);
  // A wall clock showing the game's own time.
  const cx = 100, cy = 18;
  c.fillStyle = '#f7f5ee'; c.beginPath(); c.arc(cx, cy, 11, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#3a4442'; c.lineWidth = 2; c.stroke();
  const hand = (len, turns, w) => { const a = turns * Math.PI * 2 - Math.PI / 2; c.strokeStyle = '#2b3331'; c.lineWidth = w; c.beginPath(); c.moveTo(cx, cy); c.lineTo(Math.round(cx + Math.cos(a) * len), Math.round(cy + Math.sin(a) * len)); c.stroke(); };
  hand(5, (m % 720) / 720, 2); hand(8, (m % 60) / 60, 1);
  // Calendar on the left side wall with today's game day.
  R(c, 5, 54, 22, 26, '#f4f1e6'); R(c, 5, 54, 22, 6, '#c0453b');
  c.fillStyle = '#2f3533'; c.font = 'bold 11px sans-serif'; c.textAlign = 'center'; c.fillText(String(s.day), 16, 75); c.textAlign = 'left';
  // Convex security mirror in the far corner.
  c.fillStyle = '#c9d4d6'; c.beginPath(); c.arc(744, 46, 10, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#5c6664'; c.lineWidth = 2; c.stroke();
  R(c, 739, 41, 4, 3, '#f3f7f7');
  // Camera status lights blink.
  if (Math.floor(now / 900) % 2) { R(c, 52, 8, 2, 2, '#e04a3a'); R(c, 712, 8, 2, 2, '#e04a3a'); }
}

// ---------- back wall units ----------
export function drawCoffeeStation(c, s, g) {
  const R = g.R, f = FIXTURES.coffeeMachine, x = f.x * TILE, w = f.w * TILE, cof = s.interior.coffee, brewing = !!cof.by && s.elapsed < cof.until;
  R(c, x, 34, w, 7, '#6b4a33'); R(c, x + 26, 35, 10, 5, '#c8a46a'); R(c, x + 29, 36, 4, 3, '#6b4a33');
  R(c, x, 88, w, 48, '#ece7da'); R(c, x, 86, w, 5, '#cfc6b0'); R(c, x + w / 2, 92, 1, 40, '#c9c1ab'); R(c, x + 4, 128, w - 8, 3, '#b4ab94');
  // Machine: bean hopper shows what is left, the screen lights while brewing.
  R(c, x + 5, 46, 32, 42, '#2b2f31'); R(c, x + 5, 46, 32, 3, '#45494b');
  R(c, x + 9, 41, 16, 7, '#d8e2e0'); R(c, x + 10, 47 - Math.round(cof.beans * 5), 14, Math.round(cof.beans * 5), '#6b4429');
  R(c, x + 10, 53, 22, 9, brewing ? '#7fe3b0' : cof.beans < .2 ? '#d9824d' : '#3b5b55');
  R(c, x + 18, 64, 6, 5, '#55595b'); R(c, x + 12, 80, 18, 4, '#55595b');
  if (brewing) { R(c, x + 17, 72, 8, 8, '#f4efe4'); R(c, x + 20, 69, 2, 4, '#5a3a24'); c.globalAlpha = .5; for (let i = 0; i < 3; i++) R(c, x + 18 + i * 3, 58 - ((s.elapsed * 40 + i * 4) % 8), 1, 3, '#ffffff'); c.globalAlpha = 1; }
  // Cup tower, lids and straws.
  R(c, x + 42, 42, 9, 44, '#c9d3d3'); for (let i = 0; i < 8; i++) R(c, x + 43, 46 + i * 5, 7, 2, '#f4efe4');
  R(c, x + 53, 70, 8, 16, '#8f9692'); R(c, x + 54, 66, 2, 6, '#d6493f'); R(c, x + 57, 65, 2, 7, '#3f7a5e');
}
export function drawCondiments(c, g) {
  const R = g.R, x = FIXTURES.microwave.x * TILE;
  // Napkins and wooden chopsticks next to the microwave.
  R(c, x + 50, 76, 12, 9, '#f4f1e8'); R(c, x + 52, 73, 8, 3, '#ffffff'); R(c, x + 66, 74, 12, 11, '#b08a5a'); for (let i = 0; i < 4; i++) R(c, x + 67 + i * 3, 70, 1, 6, '#e3c891');
}

// ---------- floor units (depth sorted) ----------
export function drawBreadRack(c, s, g) {
  const R = g.R, f = FIXTURES.breadRack, x = f.x * TILE + 2, top = f.y * TILE - 30, bottom = (f.y + f.h) * TILE;
  R(c, x + 3, bottom - 2, 28, 5, '#00000022');
  R(c, x, top, 28, bottom - top, '#9b7650'); R(c, x + 2, top + 2, 24, bottom - top - 6, '#e9dcc4');
  R(c, x - 1, top - 6, 30, 7, '#c0453b'); R(c, x + 10, top - 5, 8, 5, '#f2d27a');
  const prods = ['bread', 'castella'], tierH = Math.floor((bottom - top - 8) / 4);
  for (let t = 0; t < 4; t++) {
    const ty = top + 4 + t * tierH;
    R(c, x + 2, ty + tierH - 3, 24, 3, '#b58b5c');
    g.stockRow(c, prods[t % 2], s, x + 3, ty + tierH - 15, 2, 11, true);
  }
}
export function drawIceFreezer(c, s, g) {
  const R = g.R, f = FIXTURES.iceFreezer, x = f.x * TILE + 2, w = f.w * TILE - 4, y = f.y * TILE - 8, open = at(s, 'iceFreezer').length > 0;
  R(c, x + 3, y + 34, w, 5, '#00000022');
  R(c, x, y + 12, w, 22, '#eef3f4'); R(c, x, y + 26, w, 8, '#3f7fb5'); R(c, x + 4, y + 28, w - 8, 2, '#7fb2d9');
  R(c, x, y, w, 14, '#9ab8c2'); R(c, x + 2, y + 2, w - 4, 10, '#cde6ee');
  g.stockRow(c, 'iceCream', s, x + 4, y + 1, 4, 7, true);
  g.stockRow(c, 'iceCup', s, x + 32, y + 1, 4, 7, true);
  // Sliding glass lid: one half pushed over the other while someone is choosing.
  c.globalAlpha = .45; R(c, open ? x + w / 2 - 6 : x + 2, y + 2, w / 2 - 2, 10, '#ffffff'); R(c, x + w / 2, y + 2, w / 2 - 2, 10, '#ffffff'); c.globalAlpha = 1;
  if (open) { c.globalAlpha = .35; R(c, x + 4, y - 4, 20, 3, '#ffffff'); R(c, x + 8, y - 8, 12, 2, '#ffffff'); c.globalAlpha = 1; }
}
export function drawRecycle(c, s, g) {
  const R = g.R, f = FIXTURES.recycle, x = f.x * TILE + 2, y = f.y * TILE - 6, fill = s.interior.bins.recycle;
  R(c, x, y + 4, 14, 30, '#3f6f9f'); R(c, x, y + 2, 14, 4, '#2f5878'); R(c, x + 4, y + 12, 6, 6, '#f4f4ee');
  R(c, x + 16, y + 14, 12, 20, '#9aa3a6'); R(c, x + 15, y + 12, 14, 3, '#7c8487'); for (let i = 0; i < 3; i++) R(c, x + 17 + i * 4, y + 13, 2, 1, '#5b6366');
  if (fill > .8) { R(c, x + 2, y - 1, 10, 4, '#f4efe4'); R(c, x + 5, y - 3, 4, 3, '#d4553a'); }
  if (fill >= 1) { R(c, x - 3, y + 32, 6, 3, '#c4483c'); R(c, x + 12, y + 33, 5, 2, '#f4efe4'); }
}
export function drawBinFill(c, s, g) {
  const R = g.R, f = FIXTURES.trash, x = f.x * TILE + 6, y = f.y * TILE - 8, fill = s.interior.bins.general;
  if (fill > .6) R(c, x + 2, y - 2, 16, 4, '#2f3437');
  if (fill > .85) { R(c, x + 4, y - 5, 6, 4, '#f1eee4'); R(c, x + 11, y - 4, 5, 3, '#c9773f'); }
  if (fill >= 1) { R(c, x - 4, y + 28, 7, 3, '#f1eee4'); R(c, x + 20, y + 27, 6, 3, '#c4483c'); }
}
export function drawAtm(c, s, g) {
  const R = g.R, f = FIXTURES.atm, x = f.x * TILE + 2, top = f.y * TILE - 42, bottom = (f.y + 1) * TILE, busy = !!s.interior.atm.by;
  R(c, x + 3, bottom - 2, 28, 4, '#00000022');
  R(c, x, top, 28, bottom - top, '#d7dbd8'); R(c, x, top, 28, 8, '#2f6f9f'); R(c, x + 3, top + 2, 6, 4, '#f2d27a');
  R(c, x + 5, top + 12, 18, 13, '#2a3b44'); R(c, x + 6, top + 13, 16, 11, busy ? '#9fe0ff' : '#35505c');
  if (busy) { R(c, x + 8, top + 16, 10, 1, '#2a3b44'); R(c, x + 8, top + 19, 7, 1, '#2a3b44'); }
  R(c, x + 6, top + 29, 16, 12, '#a4aaa6'); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R(c, x + 8 + i * 5, top + 31 + j * 4, 3, 2, '#e9ece9');
  R(c, x + 7, top + 45, 14, 2, '#333a3c'); R(c, x + 5, top + 52, 18, 3, '#333a3c');
}
export function drawNewsRack(c, s, g) {
  const R = g.R, f = FIXTURES.newsRack, x = f.x * TILE + 4, y = f.y * TILE - 8, n = Math.min(6, s.shelf.newspaper ?? 0);
  R(c, x, y, 24, 36, '#6c727a'); R(c, x + 2, y + 2, 20, 30, '#8b929a');
  for (let i = 0; i < n; i++) { R(c, x + 3, y + 26 - i * 4, 18, 4, '#ece8de'); R(c, x + 5, y + 27 - i * 4, 12, 1, '#7d7d76'); }
  if (!n) R(c, x + 3, y + 26, 18, 2, '#d9846d');
}
export function drawBasketStack(c, s, g) {
  const R = g.R, f = FIXTURES.basketStack, x = f.x * TILE + 4, y = f.y * TILE + 4, n = s.interior.baskets.stack;
  R(c, x, y + 20, 24, 6, '#4f5557');
  for (let i = 0; i < n; i++) basket(c, R, x, y + 14 - i * 3);
}
function basket(c, R, x, y) { R(c, x, y, 24, 7, '#c8463d'); R(c, x + 2, y + 2, 20, 1, '#e07a6f'); R(c, x + 3, y - 2, 2, 3, '#8f2f28'); R(c, x + 19, y - 2, 2, 3, '#8f2f28'); }
export function drawParcelShelf(c, s, g, mini) {
  const R = g.R, f = FIXTURES.parcelShelf, x = f.x * TILE + 2, w = f.w * TILE - 4, top = f.y * TILE - 12, bottom = (f.y + 1) * TILE;
  R(c, x, top, w, bottom - top, '#8c7a5c'); R(c, x + 2, top + 2, w - 4, bottom - top - 4, '#b39f7b');
  for (let i = 1; i < 3; i++) R(c, x + i * w / 3, top + 2, 2, bottom - top - 4, '#8c7a5c');
  R(c, x + 2, top + (bottom - top) / 2, w - 4, 2, '#8c7a5c');
  s.interior.parcels.slice(0, 6).forEach((p, i) => {
    const bx = x + 5 + (i % 3) * (w / 3), by = top + 4 + Math.floor(i / 3) * ((bottom - top) / 2);
    R(c, bx, by, 20, 12, '#c49a62'); R(c, bx, by, 20, 3, '#d8b37c'); R(c, bx + 4, by + 5, 10, 4, p.kind === 'arrive' ? '#f2d27a' : '#f4f4ee');
  });
  // CCTV monitor on top shows a tiny live picture of the shop.
  R(c, x + w - 34, top - 20, 30, 20, '#1f2426'); R(c, x + w - 22, top - 1, 6, 2, '#1f2426');
  if (mini) c.drawImage(mini, x + w - 32, top - 18, 26, 16); else R(c, x + w - 32, top - 18, 26, 16, '#35454a');
}
export function drawTobaccoCabinet(c, s, g) {
  const R = g.R, f = FIXTURES.tobaccoCabinet, x = f.x * TILE + 2, w = f.w * TILE - 4, top = f.y * TILE - 34, bottom = (f.y + 1) * TILE;
  R(c, x, top, w, bottom - top, '#5e6a5e'); R(c, x + 3, top + 3, w - 6, bottom - top - 12, '#c5cab6');
  if (s.facilities.tobaccoSales) { g.stockRow(c, 'cigaretteBlue', s, x + 5, top + 6, 5, 11, true); g.stockRow(c, 'cigaretteBrown', s, x + 5, top + 24, 5, 11, true); }
  else for (let i = 0; i < 3; i++) R(c, x + 6, top + 12 + i * 12, w - 12, 2, '#a9ae9c');
  R(c, x, bottom - 9, w, 6, '#b5413a'); R(c, x + 4, bottom - 8, 4, 4, '#f4f4ee');
}
export function drawKiosk(c, s, g, now) {
  const R = g.R, f = FIXTURES.kiosk, x = f.x * TILE + 4, top = f.y * TILE - 30, bottom = (f.y + 1) * TILE, k = s.interior.kiosk;
  R(c, x + 8, top + 26, 8, bottom - top - 26, '#5a6266'); R(c, x + 2, bottom - 4, 20, 4, '#3f4548');
  R(c, x, top, 24, 28, '#2b3134'); R(c, x + 2, top + 2, 20, 18, k.error ? (Math.floor(now / 400) % 2 ? '#e0574a' : '#7a2b24') : k.by ? '#9fe0c0' : '#3f6f74');
  R(c, x + 5, top + 22, 14, 3, '#9aa3a6'); R(c, x + 18, top + 21, 3, 3, k.by ? '#ff5a4a' : '#7a3a34');
}
export function drawWetSign(c, g) {
  const R = g.R, x = 9 * TILE + 8, y = 13 * TILE + 2;
  R(c, x, y + 4, 16, 24, '#e8c53a'); R(c, x + 2, y + 2, 12, 3, '#e8c53a'); R(c, x + 1, y + 26, 2, 3, '#a8891f'); R(c, x + 13, y + 26, 2, 3, '#a8891f');
  R(c, x + 6, y + 9, 4, 4, '#2b2b2b'); R(c, x + 5, y + 14, 6, 2, '#2b2b2b'); R(c, x + 4, y + 18, 3, 4, '#2b2b2b'); R(c, x + 9, y + 18, 3, 4, '#2b2b2b');
}

// ---------- the till ----------
export function drawCounterDetails(c, s, g) {
  const R = g.R, top = FIXTURES.counter.y * TILE - 20, x = FIXTURES.counter.x * TILE;
  // Customer-facing card terminal, receipt printer, a donation box and the scanner holster.
  R(c, 130, top - 6, 9, 9, '#2e3436'); R(c, 131, top - 5, 7, 3, '#7fc3c0'); R(c, 132, top - 1, 5, 2, '#9aa3a6');
  R(c, 141, top - 3, 10, 6, '#e9ebe7'); if (s.checkout) R(c, 143, top - 3 - Math.min(10, (s.elapsed - s.checkout.startedAt) * 6), 6, Math.min(10, (s.elapsed - s.checkout.startedAt) * 6), '#ffffff');
  R(c, 152, top - 1, 7, 7, '#d9b44a'); R(c, 154, top - 1, 3, 1, '#5b4a24');
  R(c, 92, top - 8, 6, 8, '#2e3436'); R(c, 93, top - 7, 4, 4, '#4a7c74');
  // Baskets left at the till pile up until a worker returns them.
  for (let i = 0; i < Math.min(4, s.interior.baskets.counter); i++) basket(c, R, x + 4, top - 2 - i * 3);
  // Warmer with hot bars, glowing from inside.
  const hx = FIXTURES.hotCase.x * TILE + 4, n = Math.min(6, s.shelf.hotbar ?? 0);
  R(c, hx, top - 24, 56, 26, '#a8a294'); R(c, hx + 2, top - 22, 52, 21, n ? '#f2b45a' : '#cfc7b4');
  c.globalAlpha = .35; R(c, hx + 2, top - 22, 52, 5, '#ffffff'); c.globalAlpha = 1;
  for (let i = 0; i < n; i++) { R(c, hx + 6 + i * 8, top - 16, 4, 12, '#c46a3f'); R(c, hx + 7 + i * 8, top - 19, 1, 3, '#efe7d6'); }
  // Gum rack hanging on the customer side.
  R(c, 66, top + 18, 28, 18, '#e6e0cf'); R(c, 66, top + 34, 28, 2, '#b8ae95');
  g.stockRow(c, 'gum', s, 68, top + 21, 4, 7, true);
}

// ---------- entrance and street ----------
export function drawDoor(c, s, g) {
  const R = g.R, x = 10 * TILE, y = 15 * TILE;
  const open = Object.values(s.actors).some(a => a.x > x - 6 && a.x < x + 70 && a.y > y - 34 && a.y < y + 40);
  R(c, x, y - 4, 64, 4, '#9aa5a0'); R(c, x + 30, y - 7, 4, 4, '#d7b44a');
  c.globalAlpha = .35;
  if (open) { R(c, x + 1, y, 8, 30, '#cfe4e6'); R(c, x + 55, y, 8, 30, '#cfe4e6'); }
  else { R(c, x + 2, y, 29, 30, '#cfe4e6'); R(c, x + 33, y, 29, 30, '#cfe4e6'); }
  c.globalAlpha = 1;
  R(c, open ? x + 6 : x + 27, y + 12, 2, 8, '#c4ccc4'); R(c, open ? x + 56 : x + 35, y + 12, 2, 8, '#c4ccc4');
}
export function drawWindowSigns(c, s, g, dl) {
  const R = g.R, y = 15 * TILE + 2;
  const promos = [...new Set(Object.values(s.interior.promos))];
  promos.slice(0, 2).forEach((kind, i) => {
    R(c, 70 + i * 52, y, 44, 20, '#d23b32'); R(c, 72 + i * 52, y + 2, 40, 16, '#e5574d');
    c.fillStyle = '#fff6d8'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center'; c.fillText(kind, 92 + i * 52, y + 15); c.textAlign = 'left';
  });
  // Neon "OPEN" lit after dark.
  const glow = dl < .6;
  R(c, 600, y + 2, 52, 16, '#1d2a2c');
  c.fillStyle = glow ? '#ff6f61' : '#7a4a44'; c.font = 'bold 11px sans-serif'; c.textAlign = 'center'; c.fillText('OPEN', 626, y + 14); c.textAlign = 'left';
  if (glow) { c.globalAlpha = .18; R(c, 596, y - 2, 60, 24, '#ff6f61'); c.globalAlpha = 1; }
}
export function drawStreetService(c, s, g) {
  const R = g.R, x0 = 460, road = 16 * TILE + 38, t = s.interior.truck;
  // Bags put out at night wait at the curb for the morning collection.
  for (let i = 0; i < Math.min(6, s.interior.curbBags); i++) { const bx = 336 + (i % 3) * 13, by = 16 * TILE + 14 - Math.floor(i / 3) * 7; R(c, bx, by, 12, 12, i % 2 ? '#2f3437' : '#e7e7e0'); R(c, bx + 4, by - 3, 4, 3, i % 2 ? '#2f3437' : '#e7e7e0'); }
  if (!t) return;
  const body = { delivery: '#e8e8e2', parcel: '#7a5a3a', garbage: '#3f7a4f' }[t.kind], stripe = { delivery: '#3f7a5e', parcel: '#e8c53a', garbage: '#e8c53a' }[t.kind];
  R(c, x0, road - 34, 120, 34, body); R(c, x0, road - 14, 120, 4, stripe);
  R(c, x0 + 120, road - 24, 34, 24, '#4a6f9a'); R(c, x0 + 128, road - 21, 18, 9, '#bfe0f0');
  for (const wx of [x0 + 20, x0 + 96, x0 + 136]) { c.fillStyle = '#1d2122'; c.beginPath(); c.arc(wx, road, 7, 0, Math.PI * 2); c.fill(); R(c, wx - 2, road - 2, 4, 4, '#8a9093'); }
  if (t.kind === 'delivery') { R(c, x0 - 10, road - 18, 10, 12, '#c49a62'); R(c, x0 - 22, road - 14, 10, 10, '#c49a62'); }
}
