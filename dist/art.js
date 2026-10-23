import { renderQuarterScene, hitTestScene } from './art-quarter.js';
import { project } from './projection.js';
// Pixel characters and portraits shared by the quarter-view scene.
// Text in the scene is kept to big signage only; product names and prices live in the UI.
import { BODY, BUILD_WIDTH } from './genes.js';
import { PRODUCTS } from './data.js';

const makeCanvas = (w, h) => { if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h); const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function shade(hex, amt) {
  const n = parseInt(hex.slice(1, 7), 16);
  const f = v => Math.max(0, Math.min(255, Math.round(v + amt * (amt < 0 ? v : 255 - v))));
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map(v => v.toString(16).padStart(2, '0')).join('');
}
const R = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

// ---------- people ----------
const OUTLINE = '#1c2321', SHOE = '#2b2a2a', UNIFORM_VEST = '#3f7a5e';
function bodyMetrics(app) {
  const b = BODY[app.age] ?? BODY.adult, h = app.height ?? 0;
  const leg = b.leg + Math.round(h * .6), torso = b.torso + (h > 1 ? 1 : 0), head = b.head;
  const sw = b.shoulder + (BUILD_WIDTH[app.build] ?? 0) - (app.age === 'child' ? 1 : 0);
  return { leg, torso, head, sw, hip: app.build === 'round' ? sw : app.build === 'broad' ? sw - 3 : sw - 1 };
}

function drawLegs(c, app, m, pose) {
  const col = app.bottom.color, type = app.bottom.type, lw = Math.max(3, Math.floor(m.hip / 2) - 1);
  const side = pose.dir === 'left' || pose.dir === 'right';
  const stride = pose.walking ? [0, 2, 0, -2][pose.frame % 4] : 0;
  if (pose.sitting) {
    R(c, -m.hip / 2, -m.leg - 1, m.hip, 4, col);
    R(c, -m.hip / 2, -m.leg + 3, m.hip, 2, SHOE);
    return;
  }
  const diagonal=pose.dir.includes('-');
  const legs = diagonal ? [[-m.hip/2-1+stride,0],[m.hip/2-lw-1-stride,-2]] : side ? [[-lw / 2 + stride, 0], [-lw / 2 - stride, 1]] : [[-m.hip / 2, pose.walking && pose.frame % 2 ? -1 : 0], [m.hip / 2 - lw, pose.walking && pose.frame % 2 === 0 && pose.frame % 4 === 0 ? 0 : pose.walking ? -1 : 0]];
  for (const [x, lift] of legs) {
    const top = -m.leg, len = m.leg + lift;
    if (type === 'skirt') {
      R(c, x, top + Math.round(m.leg * .55), lw, len - Math.round(m.leg * .55) - 2, app.age === 'child' ? '#f1e6d8' : shade(app.skin, -.15));
    } else if (type === 'shorts') {
      R(c, x, top, lw, Math.round(m.leg * .4), col);
      R(c, x, top + Math.round(m.leg * .4), lw, len - Math.round(m.leg * .4) - 2, app.skin);
    } else {
      R(c, x, top, lw, len - 2, col);
      R(c, x + lw - 1, top, 1, len - 2, shade(col, -.18));
      if (type === 'jeans') R(c, x + 1, top + 2, 1, len - 5, shade(col, .18));
    }
    R(c, x - (side && pose.dir === 'left' ? 1 : 0), -2 + lift, lw + (side ? 1 : 0), 2, app.age === 'child' ? '#d65f5f' : SHOE);
  }
  if (type === 'skirt') { const sk = Math.round(m.leg * .55); R(c, -m.hip / 2 - 1, -m.leg, m.hip + 2, sk, col); R(c, -m.hip / 2 - 1, -m.leg + sk - 1, m.hip + 2, 1, shade(col, -.2)); }
}

function drawTorso(c, app, m, pose) {
  const top = app.top, col = top.color, side = pose.dir === 'left' || pose.dir === 'right', back = pose.dir.startsWith('up'), diagonal=pose.dir.includes('-');
  const sw = side ? m.sw - 4 : diagonal?m.sw-2:m.sw, y0 = -m.leg - m.torso, x0 = -sw / 2;
  const under = top.type === 'vest' || top.type === 'workvest' ? '#5d6466' : top.type === 'uniform' ? col : null;
  const base = under ?? col;
  R(c, x0, y0, sw, m.torso, base);
  if (app.build === 'round') { R(c, x0 - 1, y0 + m.torso * .45, sw + 2, m.torso * .55, base); }
  if (top.type === 'coat') R(c, x0, y0 + m.torso, sw, 6, col), R(c, x0, y0 + m.torso + 5, sw, 1, shade(col, -.25));
  R(c, x0, y0 + m.torso - 1, sw, 1, shade(base, -.25));
  if (!back && !side) {
    c.save();if(diagonal)c.translate(-2,0);
    if (top.type === 'shirt') { R(c, -2, y0, 4, 2, '#f4f4ef'); R(c, -.5, y0 + 2, 1, m.torso - 3, shade(col, -.15)); }
    if (top.type === 'jacket' || top.type === 'cardigan') { R(c, -2, y0, 4, m.torso - 1, top.type === 'jacket' ? '#e6e2d6' : shade(col, .2)); R(c, -2, y0, 1, m.torso - 1, shade(col, -.25)); R(c, 1, y0, 1, m.torso - 1, shade(col, -.25)); if (top.type === 'cardigan') for (let i = 3; i < m.torso - 1; i += 3) R(c, 1, y0 + i, 1, 1, '#f3ead6'); }
    if (top.type === 'hoodie') { R(c, -3, y0 + m.torso - 6, 6, 3, shade(col, -.15)); R(c, -2, y0 + 1, 1, 4, '#f0ebe0'); R(c, 1, y0 + 1, 1, 4, '#f0ebe0'); }
    if (top.type === 'school') { R(c, -2, y0, 4, 3, '#f3f3ee'); R(c, -1, y0 + 2, 2, 5, '#b5363c'); }
    if (top.type === 'tee' && app.age === 'child') R(c, -2, y0 + 4, 4, 3, shade(col, .35));
    c.restore();
  }
  if (top.type === 'vest' || top.type === 'workvest' || top.type === 'uniform') {
    const vcol = top.type === 'uniform' ? UNIFORM_VEST : col, inset = side ? 0 : 1;
    R(c, x0 + inset, y0 + 1, sw - inset * 2, m.torso - 1, vcol);
    if (!back && !side) R(c, -1, y0 + 1, 2, m.torso - 2, shade(vcol, -.2));
    if (top.type === 'vest') R(c, x0 + inset, y0 + m.torso * .55, sw - inset * 2, 2, '#f2efd2');
    if (top.type === 'workvest') { R(c, x0 + 2, y0 + 2, 1, m.torso - 3, '#e8e2a6'); R(c, x0 + sw - 3, y0 + 2, 1, m.torso - 3, '#e8e2a6'); if (!back) R(c, x0 + 2, y0 + m.torso - 6, 4, 3, shade(col, -.25)); }
    if (top.type === 'uniform' && !back && !side) { R(c, x0 + sw - 6, y0 + 3, 4, 2, '#f5f3ea'); R(c, x0 + 2, y0 + m.torso - 4, sw - 4, 1, shade(vcol, .25)); }
  }
  if(diagonal){R(c,x0+sw-3,y0+2,3,m.torso-3,shade(col,-.22));R(c,x0+sw-2,y0,2,2,shade(col,-.12));}
  return { y0, sw };
}

function drawArms(c, app, m, pose, tor) {
  const top = app.top, sleeve = top.type === 'vest' || top.type === 'workvest' ? '#5d6466' : top.type === 'tee' ? null : top.color;
  const aw = app.age === 'child' ? 2 : 3, len = m.torso + 1, side = pose.dir === 'left' || pose.dir === 'right';
  const swing = pose.walking ? [1, 0, -1, 0][pose.frame % 4] : 0;
  const arm = (x, y, l, raised) => {
    if (raised) { R(c, x, y - l + 4, aw, l - 2, sleeve ?? app.skin); R(c, x, y - l + 2, aw, 2, app.skin); return; }
    const sl = sleeve ? l - 2 : 4;
    R(c, x, y, aw, sl, sleeve ?? top.color);
    if (!sleeve) R(c, x, y + 4, aw, l - 6, app.skin);
    R(c, x, y + l - 2, aw, 2, app.skin);
  };
  const y = tor.y0 + 1, act = pose.action;
  if (side) {
    const fx = pose.dir === 'left' ? -aw : 0;
    if (act === 'reach' || act === 'pay') { R(c, fx + (pose.dir === 'left' ? -4 : 2), y + 2, 6, aw, sleeve ?? app.skin); R(c, fx + (pose.dir === 'left' ? -5 : 7), y + 2, 2, aw, app.skin); }
    else arm(fx + swing, y, len, false);
    return;
  }
  const diagonal=pose.dir.includes('-'),back=pose.dir.startsWith('up');
  const lx = -tor.sw / 2 - aw + 1, rx = tor.sw / 2 - 1;
  if(diagonal&&(act==='reach'||act==='pay')){
    arm(rx,y-1,len-2,false);R(c,lx-2,y+2,aw,6,sleeve??app.skin);R(c,lx-3,y+(back?0:6),4,3,app.skin);return;
  }
  if (act === 'reach') { arm(lx, y + swing, len, false); arm(rx, y, len, back); if (!back) R(c, rx - 3, y + 4, aw + 2, 3, app.skin); return; }
  if (act === 'eat') { arm(lx, y, len, false); const up = pose.frame % 2; R(c, rx - 3, y + (up ? -1 : 4), aw, up ? 6 : len - 4, sleeve ?? app.skin); R(c, rx - 3, y + (up ? -3 : len - 1), 3, 2, app.skin); return; }
  if (act === 'pay' || act === 'scan') { const k = pose.frame % 2; R(c, lx + 2, y + 5, aw, 5, sleeve ?? app.skin); R(c, rx - 2, y + 4 + k, aw, 5, sleeve ?? app.skin); R(c, -3, y + 8 + k, 6, 2, app.skin); return; }
  if (act === 'carry') { R(c, lx + 1, y + 2, aw, 7, sleeve ?? app.skin); R(c, rx - 1, y + 2, aw, 7, sleeve ?? app.skin); return; }
  if (act === 'mop') { const k = pose.frame % 2; R(c, lx + 1, y + 3 + k, aw, 6, sleeve ?? app.skin); R(c, rx - 1, y + 4 - k, aw, 6, sleeve ?? app.skin); return; }
  arm(lx, y + swing, len, false); arm(rx, y - swing-(diagonal?1:0), len-(diagonal?2:0), false);
}

function headShape(c, app, x, y, w, h, col) {
  R(c, x, y, w, h, col);
  const cut = app.face.shape === 'round' ? 1 : app.face.shape === 'oval' ? 2 : 0;
  if (cut) { c.clearRect(Math.round(x), Math.round(y), 1, cut); c.clearRect(Math.round(x + w - 1), Math.round(y), 1, cut); c.clearRect(Math.round(x), Math.round(y + h - cut), 1, cut); c.clearRect(Math.round(x + w - 1), Math.round(y + h - cut), 1, cut); }
  if (app.face.shape === 'square') { R(c, x, y + h - 2, 1, 2, shade(col, -.12)); R(c, x + w - 1, y + h - 2, 1, 2, shade(col, -.12)); }
}

function drawHead(c, app, m, pose, tor) {
  const hw = m.head, hh = m.head + (app.face.shape === 'long' ? 2 : 0), side = pose.dir === 'left' || pose.dir === 'right', back = pose.dir.startsWith('up'), diagonal=pose.dir.includes('-');
  const stoop = app.posture === 'stoop' ? 2 : app.posture === 'slouch' ? 1 : 0;
  const lean = diagonal?-1:side ? (pose.dir === 'left' ? -stoop : stoop) : 0;
  const x = -hw / 2 + lean, y = tor.y0 - hh + 1 + (back || side ? 0 : stoop * .5);
  const hair = app.hair.color, style = app.hair.style;
  // Hair that falls behind the head and shoulders.
  if (style === 'long') R(c, x - 1, y + 3, hw + 2, hh + 7, shade(hair, -.08));
  if (style === 'bob') R(c, x - 1, y + 2, hw + 2, hh - 1, shade(hair, -.05));
  if (style === 'ponytail' && (back || side)) R(c, side ? (pose.dir === 'left' ? x + hw - 1 : x - 2) : x + hw / 2 - 2, y + 4, 4, 9, hair);
  if (style === 'twin') { R(c, x - 3, y + 4, 3, 7, hair); R(c, x + hw, y + 4, 3, 7, hair); }
  if (style === 'bun') R(c, x + hw / 2 - 3 + lean, y - 4, 6, 5, hair);
  headShape(c, app, x, y, hw, hh, app.skin);
  if (app.top.type === 'hoodie') R(c, x - 1, y + hh - 2, hw + 2, 2, shade(app.top.color, -.2));
  if(diagonal){
    // Three-quarter face: offset nose, uneven eye spacing, visible ear and a shaded far cheek.
    const ey=y+Math.round(hh*.52),ex=x+2,my=ey+4;
    R(c,x+hw-3,y+3,3,hh-4,shade(app.skin,-.2));
    R(c,x-1,ey+2,2,2,app.skin);R(c,x+hw-2,ey+1,2,3,shade(app.skin,-.1));
    if(back){
      if(style==='balding'){R(c,x+3,y+4,hw-3,hh-5,hair);R(c,x+3,y,hw-3,3,shade(app.skin,-.08));}
      else R(c,x+3,y-1,hw-2,hh-1,style==='buzz'?shade(hair,.1):hair);
      R(c,x+1,y-1,4,3,hair);R(c,x+2,ey+1,2,3,app.skin);
      if(app.accessories.includes('glasses'))R(c,x,ey,3,1,'#4b4f4a');
    }else{
      R(c,ex,ey,2,2,'#2a2423');R(c,ex+5,ey,1,2,'#2a2423');
      R(c,ex,ey-2,2,1,hair);R(c,ex+5,ey-2,2,1,hair);
      if(pose.talking&&pose.frame%2)R(c,ex+1,my,2,2,'#7a3b34');
      else {R(c,ex+1,my,3,1,'#8a5a4c');if((pose.mood??60)>72)R(c,ex+3,my-1,1,1,'#8a5a4c');}
      if(app.age==='child')R(c,ex-1,ey+2,2,1,'#e79a8f');
      if(app.age==='elder')R(c,ex+4,ey+2,2,1,shade(app.skin,-.2));
      if(app.face.beard==='mustache')R(c,ex,my-1,4,1,hair);
      if(app.face.beard==='stubble')for(let i=0;i<3;i++)R(c,ex+i*2,my+2,1,1,shade(app.skin,-.35));
      if(app.accessories.includes('glasses')){R(c,ex-1,ey-1,4,4,'#4b4f4a');R(c,ex,ey,2,2,'#c9dde0');R(c,ex+4,ey-1,3,3,'#4b4f4a');R(c,ex+5,ey,1,1,'#c9dde0');R(c,ex+3,ey,1,1,'#4b4f4a');}
      if(style==='balding'){R(c,x+hw-2,y+2,2,6,hair);R(c,x,y+2,2,3,hair);}
      else {R(c,x-1,y-1,hw+1,style==='buzz'?3:4,style==='buzz'?shade(hair,.1):hair);
        if(style!=='buzz'){R(c,x+hw-3,y+2,3,hh-5,hair);R(c,x,y+2,style==='side'?5:3,2,hair);}
        if(style==='curly')for(let i=0;i<hw;i+=3)R(c,x+i,y-2,2,1,hair);
      }
    }
    if(app.accessories.includes('earbuds'))R(c,x+hw-2,ey+1,1,2,'#f4f4f4');
  } else if (back) {
    // From behind: hair covers the head.
    if (style === 'balding') { R(c, x, y + 4, hw, hh - 6, hair); }
    else if (style === 'buzz') R(c, x, y, hw, hh - 3, shade(hair, .1));
    else R(c, x, y - 1, hw, hh - 1, hair);
  } else if (side) {
    const front = pose.dir === 'left' ? x : x + hw - 1;
    R(c, front + (pose.dir === 'left' ? -1 : 1), y + hh * .5, 1, 2, shade(app.skin, -.1));
    const ex = pose.dir === 'left' ? x + 2 : x + hw - 4;
    R(c, ex, y + Math.round(hh * .5), 2, 2, '#2a2423');
    if (style !== 'balding' && style !== 'buzz') R(c, pose.dir === 'left' ? x + 4 : x - 1, y - 1, hw - 3, 5, hair), R(c, pose.dir === 'left' ? x + hw - 4 : x - 1, y - 1, 5, hh - 4, hair);
    else R(c, x, y, hw, 2, style === 'buzz' ? shade(hair, .1) : hair);
    if (app.accessories.includes('glasses')) R(c, ex - 1, y + Math.round(hh * .5) - 1, 4, 1, '#4b4f4a');
  } else {
    const ey = y + Math.round(hh * .52), big = app.age === 'child' ? 2 : 1;
    R(c, -3 + lean - (big - 1), ey, big + 1, 2, '#2a2423'); R(c, 2 + lean, ey, big + 1, 2, '#2a2423');
    const brow = app.face.brows, bc = shade(hair, -.1);
    if (brow === 'stern') { R(c, -4, ey - 3, 2, 1, bc); R(c, -2, ey - 2, 1, 1, bc); R(c, 1, ey - 2, 1, 1, bc); R(c, 2, ey - 3, 2, 1, bc); }
    else if (brow === 'flat') { R(c, -4, ey - 2, 3, 1, bc); R(c, 1, ey - 2, 3, 1, bc); }
    else { R(c, -3, ey - 2, 2, 1, shade(bc, .2)); R(c, 2, ey - 2, 2, 1, shade(bc, .2)); }
    const mood = pose.mood ?? 60, my = ey + 4;
    if (pose.talking && pose.frame % 2) R(c, -1, my, 2, 2, '#7a3b34');
    else if (mood < 35) { R(c, -2, my + 1, 4, 1, '#7a4a3e'); R(c, -2, my, 1, 1, '#7a4a3e'); R(c, 1, my, 1, 1, '#7a4a3e'); }
    else if (mood > 72) { R(c, -2, my, 1, 1, '#8a4c40'); R(c, 1, my, 1, 1, '#8a4c40'); R(c, -1, my + 1, 2, 1, '#8a4c40'); }
    else R(c, -1, my, 3, 1, '#8a5a4c');
    if (app.face.beard === 'stubble') for (let i = -4; i <= 3; i += 2) R(c, i, y + hh - 3 + (i % 4 === 0 ? 0 : 1), 1, 1, shade(app.skin, -.35));
    if (app.face.beard === 'mustache') R(c, -2, my - 1, 4, 1, shade(hair, -.2));
    if (app.age === 'elder') { R(c, -4, ey + 2, 2, 1, shade(app.skin, -.16)); R(c, 2, ey + 2, 2, 1, shade(app.skin, -.16)); }
    if (app.age === 'child') { R(c, -5, ey + 2, 2, 1, '#e79a8f'); R(c, 3, ey + 2, 2, 1, '#e79a8f'); }
    if (app.accessories.includes('glasses')) { R(c, -5, ey - 1, 4, 4, '#4b4f4a'); R(c, 1, ey - 1, 4, 4, '#4b4f4a'); R(c, -4, ey, 2, 2, '#c9dde0'); R(c, 2, ey, 2, 2, '#c9dde0'); R(c, -1, ey, 2, 1, '#4b4f4a'); }
    // Hair on top and the fringe.
    if (style === 'balding') { R(c, x - 1, y + 3, 2, 5, hair); R(c, x + hw - 1, y + 3, 2, 5, hair); R(c, -2, y + 1, 2, 1, shade(app.skin, .3)); }
    else if (style === 'buzz') R(c, x, y, hw, 2, shade(hair, .1));
    else {
      R(c, x - 1, y - 1, hw + 2, 4, hair);
      if (style === 'side') R(c, x - 1, y + 2, hw * .6, 2, hair);
      if (style === 'curly') { for (let i = 0; i < hw + 2; i += 3) R(c, x - 1 + i, y - 2, 2, 1, hair); R(c, x - 2, y + 1, 2, 5, hair); R(c, x + hw, y + 1, 2, 5, hair); }
      if (['long', 'bob', 'ponytail', 'twin', 'bun'].includes(style)) { R(c, x - 1, y + 2, 2, style === 'long' || style === 'bob' ? hh - 2 : 4, hair); R(c, x + hw - 1, y + 2, 2, style === 'long' || style === 'bob' ? hh - 2 : 4, hair); R(c, x + 2, y + 2, hw - 6, 1, hair); }
      if (style === 'short') { R(c, x - 1, y + 2, 2, 3, hair); R(c, x + hw - 1, y + 2, 2, 3, hair); }
    }
    if (app.accessories.includes('earbuds')) { R(c, x - 1, ey + 1, 1, 2, '#f4f4f4'); R(c, x + hw, ey + 1, 1, 2, '#f4f4f4'); }
  }
  if (app.accessories.includes('cap')) {
    const capCol = app.age === 'elder' ? '#5d6a54' : '#4c5f52';
    R(c, x - 1, y - 2, hw + 2, 5, capCol); R(c, x - 1, y + 2, hw + 2, 1, shade(capCol, -.3));
    if (!back) { if(diagonal)R(c,x-3,y+3,hw-2,2,shade(capCol,-.15));else if (side) R(c, pose.dir === 'left' ? x - 5 : x + hw, y + 2, 6, 2, shade(capCol, -.15)); else R(c, x + 1, y + 3, hw - 2, 2, shade(capCol, -.15)); }
  }
  if (app.accessories.includes('scarf')) R(c, -tor.sw / 2, tor.y0 - 1, tor.sw, 3, '#b2564a');
}

function drawExtras(c, app, m, pose, tor) {
  const back = pose.dir.startsWith('up'), side = pose.dir === 'left' || pose.dir === 'right';
  if (app.accessories.includes('backpack')) {
    if (back) R(c, -tor.sw / 2 + 1, tor.y0 + 1, tor.sw - 2, m.torso - 2, '#3d4a57'), R(c, -tor.sw / 2 + 2, tor.y0 + m.torso - 6, tor.sw - 4, 3, '#4f5d6c');
    else if (side) R(c, pose.dir === 'left' ? tor.sw / 2 - 1 : -tor.sw / 2 - 3, tor.y0 + 1, 4, m.torso - 3, '#3d4a57');
    else { R(c, -tor.sw / 2 + 1, tor.y0, 2, m.torso - 2, '#3d4a57'); R(c, tor.sw / 2 - 3, tor.y0, 2, m.torso - 2, '#3d4a57'); }
  }
  if (app.accessories.includes('bag') && !back) {
    for (let i = 0; i < m.torso; i++) R(c, -tor.sw / 2 + 1 + i * (tor.sw - 2) / m.torso, tor.y0 + i, 1, 1, '#6e5a47');
    R(c, tor.sw / 2 - 2, tor.y0 + m.torso - 3, 6, 6, '#a88a62');
  }
  const h = pose.holding;
  if (h === 'box' || pose.action === 'carry') { R(c, -7, tor.y0 + 3, 14, 10, '#c49a62'); R(c, -7, tor.y0 + 3, 14, 2, '#d8b37c'); R(c, -1, tor.y0 + 3, 2, 10, '#a9824f'); }
  else if (h === 'goods') { const x = side ? (pose.dir === 'left' ? -tor.sw / 2 - 5 : tor.sw / 2 + 1) : tor.sw / 2 + 1; R(c, x, -m.leg + 1, 6, 7, '#f1f1ec'); R(c, x + 1, -m.leg - 1, 1, 2, '#f1f1ec'); R(c, x + 4, -m.leg - 1, 1, 2, '#f1f1ec'); R(c, x, -m.leg + 6, 6, 1, '#cfcfc6'); }
  else if (h === 'umbrella' || h === 'rental') { const col = h === 'rental' ? '#6d9e86' : '#b8c7cc', x = side ? (pose.dir === 'left' ? -tor.sw / 2 - 3 : tor.sw / 2) : tor.sw / 2 + 1; R(c, x, tor.y0 + 4, 2, m.torso + m.leg - 6, col); R(c, x - 1, tor.y0 + 2, 4, 3, shade(col, -.2)); }
  else if (h === 'mop' || h === 'broom' || pose.action === 'mop') { const k = pose.frame % 2 ? 2 : -2; c.fillStyle = '#8c6c48'; for (let i = 0; i < 26; i++) c.fillRect(Math.round(5 + k * i / 26), Math.round(tor.y0 + 2 + i), 1, 1); R(c, 1 + k, -1, 9, 3, h === 'broom' ? '#c6a35a' : '#d9d9d0'); }
  else if (h === 'phone') { const x = side ? (pose.dir === 'left' ? -tor.sw / 2 + 1 : tor.sw / 2 - 4) : tor.sw / 2 - 2; R(c, x, tor.y0 - 10, 3, 6, '#23383d'); R(c, x + 1, tor.y0 - 9, 1, 3, '#9ed3cd'); }
  else if (h === 'basket') { const x = side ? (pose.dir === 'left' ? -tor.sw / 2 - 9 : tor.sw / 2 - 1) : tor.sw / 2 - 1; R(c, x, -m.leg - 2, 10, 7, '#c8463d'); R(c, x + 1, -m.leg - 1, 8, 1, '#e07a6f'); R(c, x + 4, -m.leg - 6, 2, 4, '#8f2f28'); if (pose.itemColor) R(c, x + 2, -m.leg - 4, 4, 3, pose.itemColor); }
  else if (h === 'coffee') { const x = side ? (pose.dir === 'left' ? -tor.sw / 2 - 4 : tor.sw / 2) : tor.sw / 2; R(c, x, tor.y0 + m.torso - 6, 4, 6, '#f4efe4'); R(c, x, tor.y0 + m.torso - 7, 4, 1, '#3a3a3a'); R(c, x + 1, tor.y0 + m.torso - 4, 2, 2, '#8a5a3c'); }
  else if (h === 'parcel') { R(c, -tor.sw / 2 - 2, tor.y0 + 4, 12, 9, '#c49a62'); R(c, -tor.sw / 2 - 2, tor.y0 + 4, 12, 2, '#d8b37c'); R(c, -tor.sw / 2 + 1, tor.y0 + 8, 6, 3, '#f4f4ee'); }
  else if (h === 'trashbag') { const x = tor.sw / 2; R(c, x, -m.leg - 4, 10, 12, '#2f3437'); R(c, x + 3, -m.leg - 7, 4, 3, '#2f3437'); }
  else if (h === 'baskets') { for (let i = 0; i < 3; i++) R(c, -8, tor.y0 + 6 - i * 3, 16, 5, '#c8463d'); }
  else if (h === 'beans') { R(c, -6, tor.y0 + 4, 12, 10, '#6b4429'); R(c, -4, tor.y0 + 6, 8, 3, '#c8a46a'); }
  else if (h === 'item') R(c, side ? (pose.dir === 'left' ? -tor.sw / 2 - 3 : tor.sw / 2) : tor.sw / 2, tor.y0 + m.torso - 2, 4, 4, pose.itemColor ?? '#d6b55c');
}

export function drawPerson(c, app, pose) {
  const m = bodyMetrics(app);
  const bob = !pose.walking && !pose.sitting && pose.frame % 2 && (app.posture === 'bouncy' || app.age === 'child') ? 1 : 0;
  c.save();
  c.translate(0, (pose.sitting ? -2 : 0) + bob);
  const mirror = pose.dir.endsWith('right');
  if (mirror) c.scale(-1, 1);
  const p2 = mirror ? { ...pose, dir: pose.dir.replace('right','left') } : pose;
  if (p2.dir.startsWith('up')) { drawLegs(c, app, m, p2); const tor = drawTorso(c, app, m, p2); drawArms(c, app, m, p2, tor); drawHead(c, app, m, p2, tor); drawExtras(c, app, m, p2, tor); }
  else { drawLegs(c, app, m, p2); const tor = drawTorso(c, app, m, p2); drawExtras(c, app, m, { ...p2, holding: ['box'].includes(p2.holding) ? null : p2.holding }, tor); drawArms(c, app, m, p2, tor); drawHead(c, app, m, p2, tor); if (p2.holding === 'box' || p2.action === 'carry') drawExtras(c, app, m, { ...p2, holding: 'box' }, tor); }
  c.restore();
}

const SPRITE_W = 48, SPRITE_H = 66, OX = 24, OY = 62;
const spriteCache = new Map();
function sprite(person, pose) {
  const key = `${person.id}|${JSON.stringify(person.genes.appearance)}|${pose.dir}|${pose.action}|${pose.frame}|${pose.walking ? 1 : 0}|${pose.sitting ? 1 : 0}|${pose.holding ?? ''}|${pose.talking ? 1 : 0}|${Math.round((pose.mood ?? 60) / 35)}|${pose.itemColor ?? ''}`;
  let spr = spriteCache.get(key);
  if (spr) return spr;
  const raw = makeCanvas(SPRITE_W, SPRITE_H), g = raw.getContext('2d');
  g.translate(OX, OY); drawPerson(g, person.genes.appearance, pose);
  spr = makeCanvas(SPRITE_W, SPRITE_H);
  const o = spr.getContext('2d');
  // A one-pixel dark outline keeps silhouettes readable at small sizes.
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) o.drawImage(raw, dx, dy);
  o.globalCompositeOperation = 'source-in'; o.fillStyle = OUTLINE; o.fillRect(0, 0, SPRITE_W, SPRITE_H);
  o.globalCompositeOperation = 'source-over'; o.drawImage(raw, 0, 0);
  if (spriteCache.size > 900) spriteCache.clear();
  spriteCache.set(key, spr);
  return spr;
}
export function drawPortrait(canvas, person, opts = {}) {
  const c = canvas.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, canvas.width, canvas.height);
  const spr = sprite(person, { dir: 'down', action: 'idle', frame: 0, mood: opts.mood ?? 60 });
  // Small canvases show the head and shoulders at 1x; larger ones show the whole body scaled up.
  if (canvas.height < 56) { c.drawImage(spr, Math.round((canvas.width - SPRITE_W) / 2), -8); return; }
  const scale = Math.max(1, Math.floor(Math.min(canvas.width / SPRITE_W, canvas.height / (SPRITE_H - 8))));
  c.drawImage(spr, Math.round((canvas.width - SPRITE_W * scale) / 2), Math.round(canvas.height - (OY + 3) * scale), SPRITE_W * scale, SPRITE_H * scale);
}

const POSE_ACTION = { browse: 'idle', pick: 'reach', restock: 'reach', use: 'reach', pay: 'pay', scan: 'scan', eat: 'eat', clean: 'reach', mop: 'mop', sit: 'idle', sleep: 'idle' };
function poseOf(s, a, now) {
  const p = s.people[a.id];
  const walking = a.path.length > 0, frame = walking ? Math.floor(a.walk * .9) % 4 : Math.floor(now / 520 + a.id.length) % 2;
  let holding = null, action = POSE_ACTION[a.anim] ?? 'idle';
  if (a.munching && !walking && action === 'idle') action = 'eat';
  if (a.holding?.p) { holding = 'box'; action = 'carry'; }
  else if (a.onPhone && a.role === 'customer' && !a.holding) holding = 'phone';
  else if (typeof a.holding === 'string') holding = a.holding;
  else if (a.bag?.length && a.role === 'customer') holding = 'goods';
  else if (a.basket) holding = 'basket';
  else if (a.cart?.length && a.role === 'customer') holding = 'item';
  const itemColor = a.cart?.[0] ? PRODUCTS[a.cart[0].p].color : null;
  return { dir: a.dir, frame, walking, action, sitting: ['eat', 'sit', 'sleep'].includes(a.anim), holding, itemColor, mood: p.status.mood, talking: a.talkUntil > s.elapsed };
}

export function renderScene(c,s,view={}) { renderQuarterScene(c,s,view,{sprite,poseOf,makeCanvas}); }
// Legacy logical-point API. UI picking uses hitTestScene with canvas coordinates.
export function hitTest(s,x,y,view={}) { const p=project(x,y); return hitTestScene(s,p.x,p.y,view); }
export { hitTestScene, SPRITE_W, SPRITE_H };
