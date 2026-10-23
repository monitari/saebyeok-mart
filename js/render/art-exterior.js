// The neighbourhood around the shop: sky, diorama base, paving, buildings, street furniture and night light.
// Presentation only; it reads the simulation and never changes it.
import {DISTRICT,STREET_PROPS,environmentAt,shopOpen,noise} from '../sim/environment.js';
import {storeCell,TILE} from '../sim/world.js';
import {ISO_X} from './projection.js';

const rgb=c=>{const n=parseInt(c.slice(1,7),16);return [n>>16,(n>>8)&255,n&255];};
const mix=(a,b,t)=>'#'+rgb(a).map((v,i)=>Math.round(v+(rgb(b)[i]-v)*t).toString(16).padStart(2,'0')).join('');
// Left edge that centres bitmap text on a wall along the floor's x axis.
const centred=(g,text,x,w,size)=>x+(w-g.textWidth(text,size)/ISO_X)/2;

// Sky keyframes: minute of day, zenith, horizon. The 새벽 hours get the longest, richest gradient.
const SKY=[[0,'#0a1522','#162838'],[285,'#0a1522','#162838'],[330,'#17213d','#3b3858'],[375,'#2f3d64','#b07a68'],[430,'#6a8fa0','#c8c3a6'],
  [720,'#77a0a8','#c3d4c2'],[1040,'#7392a0','#cfb894'],[1110,'#353a5b','#b0705d'],[1170,'#14213a','#2b3447'],[1440,'#0a1522','#162838']];
// Ten-minute steps through dawn and dusk, half-hour steps otherwise, so the cached scene and the page
// around it always paint the same bands and the cache is rebuilt only when the sky visibly moves.
export function skyColors(s){
  const raw=((s.clock%1440)+1440)%1440,step=raw>=280&&raw<440||raw>=1030&&raw<1180?10:30,m=Math.floor(raw/step)*step;let i=0;while(m>=SKY[i+1][0])i++;
  const [a,t0,b0]=SKY[i],[b,t1,b1]=SKY[i+1],t=(m-a)/(b-a);return {top:mix(t0,t1,t),bottom:mix(b0,b1,t)};
}
export function skyBands(s,height,count=16){
  const {top,bottom}=skyColors(s);
  return Array.from({length:count},(_,i)=>({y0:Math.round(i*height/count),y1:Math.round((i+1)*height/count),color:mix(top,bottom,i/(count-1))}));
}
export function paintSky(c,s,w,h){
  for(const b of skyBands(s,h)){c.fillStyle=b.color;c.fillRect(0,b.y0,w,b.y1-b.y0);}
  const e=environmentAt(s);if(!e.lights)return;
  const fade=e.hour>=5&&e.hour<7?.75:e.hour>=18&&e.hour<20?.6:0;
  for(let i=0;i<120;i++){
    const r=noise('star',i,'b');if(r<fade)continue;
    const x=Math.floor(noise('star',i,'x')*w),y=Math.floor(noise('star',i,'y')*h*.85);
    c.fillStyle=r>.93?'#f4efd2':r>.7?'#c8d3dc99':'#9fb0c066';c.fillRect(x,y,1,1);
    if(r>.975){c.fillRect(x-1,y,3,1);c.fillRect(x,y-1,1,3);}
  }
}

// A thick cut-away base: paving, two soil layers and the pipes under the road.
function slab(c,g,e){
  const {front,side,polygon,sp,tint}=g,d=DISTRICT,X=d.x+d.w,Y=d.y+d.h,D=46,dim=(col,k)=>e.night?tint(col,k-28):tint(col,k);
  polygon(c,[sp(d.x,d.y,-D),sp(X,d.y,-D),sp(X,Y,-D),sp(d.x,Y,-D)].map(p=>({x:p.x+10,y:p.y+18})),'#03080e48');
  for(const [top,height,col]of [[0,7,e.snow?'#dfe7e2':'#9aa69e'],[7,13,'#7a6a51'],[20,13,'#665841'],[33,13,'#4f4435']]){
    front(c,d.x,Y,d.w,-top-height,height,dim(col,0));side(c,X,d.y,d.h,-top-height,height,dim(col,-20));
  }
  side(c,X,d.roadY,d.roadH,-11,11,dim('#3d4649',0));
  for(let i=0;i<90;i++){
    const z=-10-noise('pebble',i)*32,col=noise('pebble',i,'c')<.5?'#8d7a5c':'#3f362b';
    if(i%2)front(c,d.x+noise('pebble',i,'x')*(d.w-6),Y,4,z,2,dim(col,0));else side(c,X,d.y+noise('pebble',i,'y')*(d.h-6),4,z,2,dim(col,-20));
  }
  const ring=(y,z,r,outer,inner)=>{const pts=k=>Array.from({length:16},(_,i)=>sp(X,y+Math.cos(i/16*Math.PI*2)*r*k,z+Math.sin(i/16*Math.PI*2)*r*k));polygon(c,pts(1),dim(outer,0));polygon(c,pts(.62),dim(inner,0));};
  ring(672,-27,12,'#8f9893','#1f2726');ring(628,-17,5,'#b9875a','#2b2520');ring(716,-19,5,'#6f8fa8','#232a30');
}

export function districtGround(c,s,g){
  const {flat,box,line,sp,fillEllipse,ringEllipse}=g,e=environmentAt(s),d=DISTRICT;
  slab(c,g,e);
  flat(c,d.x,d.y,d.w,d.h,e.night?'#22343a':'#7f8c86');
  const pave=e.night?['#34484b','#2e4246','#334749','#2a3d42']:['#a4ada3','#99a69c','#a1ab9f','#919d94'];
  for(let y=d.y;y<d.y+d.h;y+=32)for(let x=d.x;x<d.x+d.w;x+=32){
    if(x>=0&&x<768&&y>=0&&y<576)continue;
    const r=noise('pave',x,y);flat(c,x,y,30,30,pave[(x+y)%64?(r<.14?2:0):(r<.1?3:1)]);
    if(r>.965)flat(c,x+5,y+13,15,1,e.night?'#2b3c3f':'#87918a');
  }
  // Road: grain, patched asphalt, manholes, stop lines and a centre line.
  flat(c,d.x,592,d.w,160,e.wet?'#2f3f48':e.night?'#22333b':'#5c686c');
  for(const [x,y,w,h]of [[-200,606,70,26],[402,700,96,30],[930,612,60,34]])flat(c,x,y,w,h,e.wet?'#31414a':e.night?'#25363d':'#556165');
  for(let i=0;i<260;i++)flat(c,d.x+noise('grain',i)*(d.w-4),596+noise('grain',i,1)*150,2,1,noise('grain',i,2)<.5?(e.night?'#33464d':'#69757a'):(e.night?'#20313a':'#505b60'));
  box(c,d.x,582,d.w,8,6,'#a8b5ac');box(c,d.x,752,d.w,8,6,'#a8b5ac');
  for(let x=d.x;x<d.x+d.w-32;x+=80){flat(c,x,669,45,3,'#d3bc76');flat(c,x,677,45,2,'#cdb77b');}
  for(let y=602;y<744;y+=20)flat(c,0,y,56,11,e.wet?'#a5b7b6':'#d1d6c7');
  flat(c,-30,596,5,72,'#cfd3c4');flat(c,80,676,5,72,'#cfd3c4');
  for(const [x,y]of [[236,700],[760,628],[-150,716]]){const p=sp(x,y);c.fillStyle=e.night?'#1b2a30':'#454f52';fillEllipse(c,p.x,p.y,10,5);c.fillStyle=e.night?'#3a4b51':'#7c878a';ringEllipse(c,p.x,p.y,10,5,1);}
  for(const x of [-160,208,720,976]){
    flat(c,x,574,30,9,'#263c40');for(let i=0;i<6;i++)flat(c,x+3+i*4,574,1,9,'#82918b');
    if(e.wet){flat(c,x-11,562,52,9,'#8eaeb54b');for(let i=0;i<3;i++)flat(c,x+8+i*5,568,1,7,'#c0d5d061');}
  }
  if(e.wet)for(let i=0;i<18;i++){
    const x=-220+i*69,y=i%2?706:606;flat(c,x,y,38+i%3*9,7,'#a0c1c334');flat(c,x+5,y+2,22,1,'#c1d4c64c');
  }
  flat(c,682,770,116,42,e.night?'#3a4a4c':'#a9b0a3');
  for(const p of STREET_PROPS.filter(p=>p.kind==='tree')){
    flat(c,p.x-10,p.y-8,p.w+20,p.h+16,'#667c67');flat(c,p.x-6,p.y-4,p.w+12,p.h+8,e.snow?'#d0ded9':e.season.grass);
    for(let i=0;i<14;i++)if(!e.snow)flat(c,p.x-4+noise(p.id,i)*(p.w+6),p.y-2+noise(p.id,i,1)*(p.h+4),2,1,g.tint(e.season.grass,noise(p.id,i,2)<.5?-22:18));
    if(!e.night&&!e.wet&&!e.snow)flat(c,p.x+26,p.y+20,62,21,'#273b3427');
    if(['spring','autumn'].includes(e.season.id))for(let i=0;i<16;i++)flat(c,p.x-18+(i*19)%92,p.y-14+(i*31)%80,3,2,e.season.id==='spring'?'#e7b6be':'#bc9057');
  }
  if(e.snow){
    for(let x=d.x;x<d.x+d.w;x+=40){flat(c,x,578,31,5,'#d5e3df');flat(c,x,755,35,6,'#d5e3df');}
    for(let i=0;i<30;i++)flat(c,-232+i*41,782+i%3*17,22,6,'#d5e3df');
  }
  // These buildings stand behind the shop's opaque rear walls, which are painted next.
  for(const p of STREET_PROPS.filter(p=>p.backdrop).sort((a,b)=>a.x+a.y-b.x-b.y))districtObject(c,s,p,g,0);
}

// Painted after the shop's own floor tiles and before its walls: kerb paving and every light that falls on the ground.
export function districtDetails(c,s,g){
  const {flat,sp,fillEllipse}=g,e=environmentAt(s),d=DISTRICT;
  const tactile=e.night?'#8f7d45':'#d6b552',dots=e.night?'#6f6036':'#b8963c';
  for(const y of [571,761]){flat(c,d.x,y,d.w,8,tactile);for(let x=d.x+3;x<d.x+d.w;x+=8)flat(c,x,y+3,2,2,dots);}
  if(!e.lights)return;
  const pool=(x,y,r,col)=>{const p=sp(x,y);for(const [k,a]of [[1,'14'],[.7,'1e'],[.42,'2a']]){c.fillStyle=col+a;fillEllipse(c,p.x,p.y,r*k*1.06,r*k*.53);}};
  for(const p of STREET_PROPS){
    if(p.kind==='lamp')pool(p.x+4,p.y+4,100,'#ffd99a');
    else if(p.kind==='pylon')pool(p.x+7,p.y+16,74,'#e6f4d4');
    else if(p.kind==='busStop')pool(p.x+p.w-18,p.y+p.h+6,46,'#f4e3b6');
    else if(p.kind==='shop'&&shopOpen(p,s)){
      flat(c,p.x+4,p.y+p.h,p.w-8,44,'#ffd99a10');flat(c,p.x+12,p.y+p.h,p.w-24,24,'#ffd99a1a');
    }
  }
  // The shop is the brightest thing on the street: light falls out through every glass wall.
  for(const [x,y,w,h]of [[32,416,192,46],[480,416,96,46],[224,480,256,34],[576,384,160,56],[736,128,50,256]])flat(c,x,y,w,h,'#eef6dd18');
  for(const [x,y,w,h]of [[40,416,176,24],[488,416,80,24],[232,480,240,16],[584,384,144,30],[736,140,28,232]])flat(c,x,y,w,h,'#eef6dd1e');
  flat(c,316,480,72,62,'#fff6dc1a');
  if(e.wet)for(const p of STREET_PROPS.filter(p=>p.kind==='lamp'||p.kind==='pylon')){
    const q=sp(p.x+6,p.y+26);for(let i=0;i<5;i++){c.fillStyle=i%2?'#ffd99a22':'#ffe8b832';c.fillRect(q.x-2+i,q.y+(i%2)*3,1,24-i*3);}
  }
}

// Overhead wires, painted last so they hang above everything on the far pavement.
export function districtOverlay(c,s,g){
  const {line,sp}=g,e=environmentAt(s),d=DISTRICT,poles=STREET_PROPS.filter(p=>p.kind==='pole').sort((a,b)=>a.x-b.x),col=e.night?'#0e171a':'#2a383a';
  for(const dx of [-16,4,22]){
    const anchors=[{x:d.x,y:poles[0].y+3,z:poles[0].height-8},...poles.map(p=>({x:p.x+dx+1,y:p.y+3,z:p.height-6})),{x:d.x+d.w,y:poles[0].y+3,z:poles[0].height-8}];
    for(let i=1;i<anchors.length;i++){
      const a=anchors[i-1],b=anchors[i],sag=Math.min(12,Math.abs(b.x-a.x)/40),pa=sp(a.x,a.y,a.z),pb=sp(b.x,b.y,b.z);
      const mid={x:(pa.x+pb.x)/2,y:(pa.y+pb.y)/2+sag};line(c,pa,mid,col);line(c,mid,pb,col);
    }
  }
}

// Everything time-dependent the street paints, as one cache key: the cached ground and prop bitmaps are
// rebuilt only when one of these changes, not on a fixed timer.
const windowShare=h=>h>=18.5&&h<22?.75:h>=22||h<1?.45:h<5?.12:.4;
export function streetLook(s){
  const e=environmentAt(s),h=e.hour,sky=skyColors(s);
  return [Math.floor(s.clock/1440),s.weather.kind,e.season.id,sky.top,sky.bottom,e.night,e.lights,windowShare(h),Math.floor(s.clock/180),
    h>=10&&h<20,h>=11&&h<14||h>=17||h<3,STREET_PROPS.filter(p=>p.hours).map(p=>shopOpen(p,s)?1:0).join('')].join('|');
}
const WINDOW_LIGHT=['#f3d58f','#eac27a','#cfe0e6','#f0cf9a'];
function windowLight(n,s,i,e){
  if(!e.lights)return null;
  const share=windowShare(e.hour);
  return noise(n.id,i,Math.floor(s.clock/1440))<share?WINDOW_LIGHT[Math.floor(noise(n.id,i,'tone')*4)]:null;
}
function display(c,n,g,e,x,y,w){
  const {front,ringEllipse,sp}=g;
  if(n.id==='bakery')for(let r=0;r<2;r++)for(let i=0;i<Math.floor(w/7);i++)front(c,x+2+i*7,y,5,16+r*14,4,r?'#d9a861':'#b97f45');
  else if(n.id==='florist')for(let i=0;i<Math.floor(w/8);i++)front(c,x+2+i*8,y,6,10+i%3*5,9,[e.season.flower,'#d77d7d','#f0e0a0'][i%3]);
  else if(n.id==='laundry')for(let i=0;i<Math.floor(w/15);i++){front(c,x+1+i*15,y,13,10,17,'#e7ebe6');const p=sp(x+7+i*15,y,19);c.fillStyle='#4d6d72';ringEllipse(c,p.x,p.y,4,4,1);}
  else if(n.id==='chicken')for(let i=0;i<Math.floor(w/12);i++){front(c,x+2+i*12,y,8,14,5,'#7c4a33');front(c,x+3+i*12,y,2,19,6,'#d9c48a');}
}
function building(c,s,n,g,e){
  const {box,flat,front,side,label,tint,line,sp}=g,{x,y,w,h}=n,H=n.height,open=shopOpen(n,s),F=y+h+.5;
  const wall=e.night?tint(n.color,-38):n.color;
  box(c,x,y,w,h,H,wall);
  front(c,x,F,w,98,5,tint(wall,-18));side(c,x+w+.5,y,h,98,5,tint(wall,-32));
  // Ground floor: three glass bays, or a ribbed shutter outside opening hours.
  const bw=(w-20)/3;
  for(let k=0;k<3;k++){
    const bx=x+10+k*bw;front(c,bx,F,bw-4,4,60,e.night?'#1f2d2e':'#3a5150');
    if(open){front(c,bx+2,F+.3,bw-8,8,52,e.lights?'#f0d898':'#9fbcb4');front(c,bx+5,F+.5,3,14,44,e.lights?'#fff5d060':'#e8f2e270');display(c,n,g,e,bx+3,F+.7,bw-10);}
    else{front(c,bx+2,F+.3,bw-8,8,52,e.night?'#566060':'#a0a7a2');for(let z=11;z<58;z+=4)front(c,bx+2,F+.6,bw-8,z,1,e.night?'#434c4c':'#87908b');}
  }
  if(open){box(c,x-4,y+h-2,w+8,24,5,n.awning,64);for(let i=0;i<w+8;i+=22)flat(c,x-4+i,y+h-2,10,24,'#efe6c8',69.5);front(c,x-4,y+h+22.5,w+8,59,5,tint(n.awning,-22));}
  else box(c,x-2,y+h,w+4,4,6,tint(n.awning,-40),64);
  const lit=e.lights&&open,sign=n.sign;
  front(c,x+8,F,w-16,74,22,lit?'#fff4d2':e.lights?'#4a5250':'#ece1be');front(c,x+8,F+.2,w-16,74,2,tint(n.awning,lit?0:-30));
  label(c,sign,centred(g,sign,x+8,w-16,10),F+.4,82,lit?tint(n.awning,-45):e.lights?'#7b8580':'#3a5550',10);
  // Homes upstairs: lit windows thin out as the night goes on.
  const cols=Math.floor((w-16)/44),rows=Math.max(1,Math.floor((H-112)/40)),cell=(w-24)/cols;let i=0;
  for(let r=0;r<rows;r++)for(let k=0;k<cols;k++,i++){
    const wx=x+12+k*cell+(cell-26)/2,z=110+r*40,col=windowLight(n,s,i,e);
    front(c,wx-2,F,30,z-3,28,tint(wall,-26));front(c,wx,F+.3,26,z,22,col??(e.lights?'#24333a':'#a9c3c4'));
    if(col)front(c,wx,F+.5,8,z,22,tint(col,-30));else if(!e.lights)front(c,wx+4,F+.5,4,z+8,12,'#e2eeea80');
    front(c,wx-3,F+.6,32,z-4,2,tint(wall,20));
  }
  const sideCols=Math.floor((h-24)/50);
  for(let r=0;r<rows;r++)for(let k=0;k<sideCols;k++,i++){
    const col=windowLight(n,s,i,e);side(c,x+w+.5,y+18+k*(h-30)/sideCols,24,110+r*40,22,col?tint(col,-22):e.lights?'#1d2a2f':'#8fa9ab');
  }
  if(n.neon){
    const on=e.lights&&open;front(c,x+18,F,w-36,H-36,18,on?'#2b1b33':'#625a64');
    if(on){front(c,x+18,F+.3,w-36,H-36,1,'#f5a3e6');front(c,x+18,F+.3,w-36,H-19,1,'#f5a3e6');}
    label(c,n.neon,centred(g,n.neon,x+18,w-36,10),F+.5,H-31,on?'#ffc8f2':'#a3979f',10);
  }
  // Yellow gas pipe, meter and outdoor air-conditioner units on the side wall.
  const px=x+w+.8;line(c,sp(px,y+h-12,4),sp(px,y+h-12,H-8),'#d4aa45',2);line(c,sp(px,y+h-12,104),sp(px,y+26,104),'#d4aa45',2);
  box(c,x+w,y+h-36,4,14,16,'#c9cbbf',26);
  for(const dy of [28,h-72])if(dy>20){box(c,x+w,y+dy,10,24,17,e.night?'#9da396':'#d7dacd',H-48);side(c,x+w+10.6,y+dy+5,14,H-45,11,'#7f8a84');}
  // Green waterproofed roof with a stair housing and a water tank, as on most low-rise Korean blocks.
  box(c,x-3,y-3,w+6,h+6,6,e.snow?'#d4e1dd':tint(wall,-14),H);
  flat(c,x+4,y+4,w-8,h-8,e.snow?'#e3ebe4':e.night?'#2c4739':'#5f8f6b',H+6);
  box(c,x+12,y+14,40,30,24,tint(wall,-6),H+6);front(c,x+22,y+44.5,14,H+6,19,'#394947');
  box(c,x+w-58,y+18,28,24,22,e.night?'#2d5a74':'#4b88aa',H+6);box(c,x+w-52,y+22,16,16,3,e.night?'#3a6b86':'#79acc6',H+28);
  if(e.snow){flat(c,x+12,y+14,40,30,'#e3ebe4',H+30.5);flat(c,x+w-58,y+18,28,24,'#e3ebe4',H+28.5);}
  if(n.id==='florist'&&open&&!e.snow)for(let k=0;k<5;k++){box(c,x+16+k*32,y+h+20,12,12,12,'#5f7f86');box(c,x+17+k*32,y+h+21,10,10,7,[e.season.flower,'#d77d7d','#f0e0a0','#c8a0d8','#e9a05c'][k],12);}
}

function car(c,g,e,n,moving){
  const {box,front,side,polygon,sp}=g,{x,y,w,h}=n,d=n.direction||1,head=d===1?x+w:x;
  if(moving&&e.lights){
    // Headlights reach along the lane but stop at the edge of the model.
    for(const [len,spread,col]of [[110,10,'#ffe9b012'],[60,4,'#ffe9b01c']]){
      const end=Math.max(DISTRICT.x,Math.min(DISTRICT.x+DISTRICT.w,head+d*len));
      polygon(c,[sp(head,y+6),sp(end,y-spread),sp(end,y+h+spread),sp(head,y+h-6)],col);
    }
  }
  box(c,x,y,w,h,15,n.color,7);box(c,x+20,y+3,33,h-6,15,n.color,22);
  front(c,x+22,y+h-2,28,25,10,'#375860');side(c,x+(d===1?54:20),y+5,h-10,25,10,'#5e8087');
  for(const dx of [12,58])box(c,x+dx,y+h-1,10,4,10,'#243335',1);
  for(const yy of [3,h-8]){
    box(c,x+(d===1?w-2:0),y+yy,2,5,4,moving&&e.lights?'#ffdf9c':'#c4cab5',14);
    box(c,x+(d===1?0:w-2),y+yy,2,5,4,moving&&e.lights?'#ff5a48':'#9c4a40',14);
  }
  if(moving&&e.wet)for(let i=0;i<3;i++)g.flat(c,x-8-i*8,y+h+2,5,1,'#b7cbca55');
}

export function districtObject(c,s,n,g,now=0){
  const {box,flat,front,side,line,sp,label,tint,polygon}=g,e=environmentAt(s),{x,y,w,h}=n;
  if(n.kind==='shop')building(c,s,n,g,e);
  else if(n.kind==='parking'){
    flat(c,x,y,w,h,e.night?'#26363b':'#76827f');
    const paint=e.night?'#7d8780':'#dfe2d4',share=e.night?.75:.45,block=Math.floor(s.clock/180);
    for(const row of [0,1])for(let k=0;k<=3;k++)flat(c,x+4+k*74,y+4+row*52,2,42,paint);
    for(const row of [0,1])for(let k=0;k<3;k++)if(noise('park',k,row,block)<share)
      car(c,g,e,{x:x+10+k*74,y:y+10+row*52,w:66,h:30,direction:1,color:['#c8cdc2','#5f7480','#9a5b4c','#d6c79a','#3f4a50'][Math.floor(noise('park',k,row,block,'c')*5)]},false);
  }else if(n.kind==='tree'){
    box(c,x+20,y+20,8,8,69,'#766b55');
    for(const [dx,dy,z]of [[5,18,43],[29,16,53],[18,4,62]]){
      box(c,x+dx,y+dy,5,5,26,'#766b55',z-10);
      if(e.season.id!=='winter'){box(c,x+dx-16,y+dy-12,38,32,25,e.season.leaf,z);box(c,x+dx-9,y+dy-8,28,24,13,tint(e.season.leaf,15),z+25);}
      if(e.snow)box(c,x+dx-7,y+dy-4,19,13,4,'#dbe6e0',z+17);
      if(e.season.id==='spring')for(let j=0;j<4;j++)box(c,x+dx-10+j*8,y+dy+j%2*10,6,5,3,e.season.flower,z+26);
    }
  }else if(n.kind==='bed'){
    box(c,x,y,w,h,12,'#8f8970');flat(c,x+4,y+4,w-8,h-8,e.snow?'#d4e0d8':'#59684d',13);
    if(!e.snow)for(let i=0;i<Math.floor(w/12);i++){
      box(c,x+7+i*12,y+8+i%2*9,8,8,6,e.season.leaf,13);
      if(e.season.id!=='winter')flat(c,x+9+i*12,y+9+i%2*9,4,4,e.season.flower,20);
    }
  }else if(n.kind==='bench'){
    for(const dx of [8,w-14])box(c,x+dx,y+4,5,h-2,15,'#435d59');
    for(let i=0;i<3;i++)box(c,x,y+i*7,w,5,3,'#b19a76',16);
    box(c,x,y,w,4,12,'#ac926f',21);if(e.snow)flat(c,x,y,w,4,'#d5e1da',34);
  }else if(n.kind==='bin'){
    box(c,x,y,w,h,30,'#526e67');box(c,x-1,y-1,w+2,h+2,4,'#8da397',30);front(c,x+4,y+h+1,w-8,23,4,'#243f3c');
    front(c,x+6,y+h+1,7,8,8,'#c6d3b4');
  }else if(n.kind==='lamp'){
    box(c,x-3,y-3,14,14,5,'#6c8077');box(c,x,y,5,5,112,'#667c75');box(c,x-10,y-4,25,12,6,'#b2bca7',110);
    flat(c,x-8,y-2,21,8,e.lights?'#ffe1a1':'#c7d0bd',110);
  }else if(n.kind==='car')car(c,g,e,n,true);
  else if(n.kind==='pylon'){
    // The shop's pole sign: the first thing anyone sees of it from down the road.
    const on=e.lights,F=y+11.5;
    box(c,x,y,w,h,6,'#6b7d75');box(c,x+4,y+4,6,6,98,'#9aa69f',6);
    box(c,x-22,y+3,58,8,46,'#2d6a55',104);front(c,x-20,F,54,108,40,on?'#f7f4de':'#e6e4cf');
    front(c,x-20,F+.2,54,136,12,on?'#3f9a72':'#2f7a5c');label(c,'SAEBYEOK',centred(g,'SAEBYEOK',x-20,54,8),F+.4,139,'#f6f3dc',8);
    label(c,'24',centred(g,'24',x-20,54,14),F+.4,113,on?'#2a8a62':'#2f7a5c',14);front(c,x-20,F+.3,54,108,3,'#e08a3c');
    if(e.snow)flat(c,x-22,y+3,58,8,'#e3ebe4',150.5);
  }else if(n.kind==='parasol'){
    // Terrace table: the umbrella is open by day and furled at night.
    const cx=x+w/2,cy=y+h/2,open=e.hour>=10&&e.hour<20&&!e.snow,chair=e.night?'#b9b6aa':'#e6e3d6';
    const seat=(px,py,bx,by,bw,bh)=>{box(c,px,py,9,9,8,chair);box(c,bx,by,bw,bh,10,tint(chair,8),8);};
    seat(cx-4,y,cx-4,y,9,2);seat(x,cy-4,x,cy-4,2,9);
    box(c,cx-2,cy-2,4,4,20,'#5d6b66');box(c,cx-12,cy-12,24,24,3,e.night?'#2f5e45':'#3f7d57',20);
    if(e.snow)flat(c,cx-11,cy-11,22,22,'#e3ebe4',23.5);
    seat(x+w-9,cy-4,x+w-2,cy-4,2,9);seat(cx-4,y+h-9,cx-4,y+h-2,9,2);
    box(c,cx-1,cy-1,2,2,open?58:42,'#d9d6c8',23);
    const red=e.night?'#8d3a2e':'#c94f3c',cream=e.night?'#aaa392':'#f1e8d2';
    if(open){
      const apex=sp(cx,cy,94),rim=Array.from({length:8},(_,i)=>({a:i/8*Math.PI*2,p:sp(cx+Math.cos(i/8*Math.PI*2)*30,cy+Math.sin(i/8*Math.PI*2)*30,77)}));
      const tris=rim.map((r,i)=>({i,q:rim[(i+1)%8],r,d:Math.cos(r.a)+Math.sin(r.a)+Math.cos(rim[(i+1)%8].a)+Math.sin(rim[(i+1)%8].a)})).sort((a,b)=>a.d-b.d);
      for(const t of tris)polygon(c,[apex,t.r.p,t.q.p],t.i%2?cream:red);
    }else{box(c,cx-3,cy-3,6,6,30,cream,46);box(c,cx-3,cy-3,6,6,4,red,62);box(c,cx-1,cy-1,2,2,6,red,76);}
  }else if(n.kind==='scooter'){
    const hr=e.hour;if(!(hr>=11&&hr<14||hr>=17||hr<3))return;
    for(const dx of [6,30]){const p=sp(x+dx,y+7,5);c.fillStyle='#1d2526';g.fillEllipse(c,p.x,p.y,5,5);c.fillStyle='#8d9893';c.fillRect(p.x-1,p.y-1,2,2);}
    box(c,x+8,y+3,20,8,9,'#c9473a',6);box(c,x+12,y+3,12,8,3,'#283033',15);box(c,x+25,y+3,5,8,18,'#c9473a',6);
    line(c,sp(x+30,y+1,25),sp(x+30,y+13,25),'#2b3335');
    box(c,x,y+1,13,12,13,'#ece6d2',14);front(c,x+1,y+13.5,11,17,5,'#d36d3f');
  }else if(n.kind==='signal'){
    // Daytime green for traffic; from late night until dawn the signal only flashes amber.
    const flash=e.hour<5||e.hour>=23.5,blink=Math.floor(now/550)%2===0,F=y+7.5,z=n.height-20;
    box(c,x+2,y+2,4,4,n.height,'#56645f');box(c,x-8,y,22,7,14,'#202a29',z-3);
    const lamps=flash?['#3a2a28',blink?'#ffc94a':'#4a4026','#24372e']:['#3a2a28','#4a4026','#46e08f'];
    lamps.forEach((col,i)=>front(c,x-6+i*7,F,5,z,7,col));
    box(c,x+8,y,7,5,12,'#202a29',52);front(c,x+9,y+5.5,5,55,5,flash?'#4a2a26':'#e2483a');
  }else if(n.kind==='busStop'){
    const on=e.lights,F=y+h+.5;
    for(const [dx,dy]of [[0,0],[w-3,0],[0,h-3],[w-3,h-3]])box(c,x+dx,y+dy,3,3,68,'#5b6e6a');
    box(c,x+6,y+4,w-46,10,4,'#a78f6c',15);
    front(c,x,F,w-36,8,56,'#cfe6e41c');line(c,sp(x,F,64),sp(x+w-36,F,64),'#a9bdb7');
    front(c,x+w-34,F,32,6,60,'#3b4f4c');front(c,x+w-32,F+.3,28,10,52,on?'#f7e8bd':'#d9d0b2');
    ['#c95d47','#4f8ab0','#e0b347'].forEach((col,i)=>front(c,x+w-29+i*8,F+.5,6,18+i*9,7,col));
    box(c,x-4,y-4,w+8,h+8,4,e.snow?'#e1e9e4':'#4f6964',68);
    box(c,x+w+10,y+10,3,3,88,'#6d7c77');front(c,x+w+4,y+13.5,16,76,14,'#2f6fa3');label(c,'BUS',centred(g,'BUS',x+w+4,16,8),y+13.8,80,'#f2f2e6',8);
  }else if(n.kind==='pole'){
    box(c,x,y,w,h,n.height,'#8a8c83');for(let z=26;z<n.height-24;z+=34)box(c,x-1,y-1,w+2,h+2,2,'#74766e',z);
    box(c,x-20,y+2,48,4,4,'#6b6d66',n.height-14);for(const dx of [-16,4,22])box(c,x+dx,y+2,3,3,5,'#d9dccd',n.height-10);
    if(n.id==='pole-mid'){box(c,x-13,y+9,12,12,24,'#7d8a85',n.height-58);box(c,x-11,y+11,8,8,3,'#9aa59f',n.height-34);}
    front(c,x,y+h+.5,8,38,12,'#e8e5d4');front(c,x+1,y+h+.7,6,44,2,'#c55a44');
  }
}

export function districtWeather(c,s,now,g){
  const e=environmentAt(s);if(!e.wet&&!e.snow)return;
  const {sp,line}=g,d=DISTRICT,count=e.storm?190:e.snow?120:100;
  for(let i=0;i<count;i++){
    const x=d.x+((i*137+now*.025)%d.w),y=d.y+((i*79+now*(e.snow?.008:.04))%d.h);
    if(storeCell(Math.floor(x/TILE),Math.floor(y/TILE),s.layoutVersion??1))continue;
    if(STREET_PROPS.some(n=>n.kind==='shop'&&x>=n.x&&x<n.x+n.w&&y>=n.y&&y<n.y+n.h))continue;
    const p=sp(x,y,(i*17)%60);
    line(c,p,{x:p.x+(e.snow?1:e.storm?-5:-2),y:p.y+(e.snow?1:7)},e.snow?'#dfebe5ae':'#b6d2ce70',e.snow?2:1);
  }
}
