// Whole-pixel drawing. Every primitive is reduced to integer fillRect spans, so nothing in the
// scene is anti-aliased: edges keep hard 2:1 stairs, circles stay stepped and text stays bitmap.
// Callers set c.fillStyle; only fillRect is used, which the Node raster checker also supports.

export function fillPoly(c,pts){
  if(pts.length<3)return;
  let top=Infinity,bottom=-Infinity;for(const p of pts){top=Math.min(top,p.y);bottom=Math.max(bottom,p.y);}
  for(let y=Math.floor(top);y<Math.ceil(bottom);y++){
    const sy=y+.5,cuts=[];
    for(let i=0,j=pts.length-1;i<pts.length;j=i++){
      const a=pts[i],b=pts[j];if((a.y>sy)!==(b.y>sy))cuts.push(a.x+(sy-a.y)*(b.x-a.x)/(b.y-a.y));
    }
    cuts.sort((a,b)=>a-b);
    for(let k=0;k+1<cuts.length;k+=2){const x0=Math.ceil(cuts[k]-.5),x1=Math.ceil(cuts[k+1]-.5);if(x1>x0)c.fillRect(x0,y,x1-x0,1);}
  }
}

// Pixels are collected first so translucent strokes never darken where they overlap.
const key=(x,y)=>(y+8192)*16384+x+8192;
function flush(c,set){
  const rows=new Map();
  for(const k of set){const y=Math.floor(k/16384)-8192,x=k%16384-8192;(rows.get(y)??rows.set(y,[]).get(y)).push(x);}
  for(const [y,xs]of rows){
    xs.sort((a,b)=>a-b);let start=xs[0],prev=xs[0];
    for(const x of xs.slice(1)){if(x===prev+1){prev=x;continue;}c.fillRect(start,y,prev-start+1,1);start=prev=x;}
    c.fillRect(start,y,prev-start+1,1);
  }
}
function trace(set,a,b,w){
  let x=Math.round(a.x),y=Math.round(a.y);const x1=Math.round(b.x),y1=Math.round(b.y);
  const dx=Math.abs(x1-x),dy=-Math.abs(y1-y),sx=x<x1?1:-1,sy=y<y1?1:-1,flatLine=dx>=-dy,lo=-Math.floor((w-1)/2);
  for(let err=dx+dy;;){
    for(let i=lo;i<lo+w;i++)set.add(flatLine?key(x,y+i):key(x+i,y));
    if(x===x1&&y===y1)break;
    const e2=2*err;if(e2>=dy){err+=dy;x+=sx;}if(e2<=dx){err+=dx;y+=sy;}
  }
}
export function pixelLine(c,a,b,w=1){const set=new Set();trace(set,a,b,w);flush(c,set);}
export function outline(c,pts){const set=new Set();for(let i=0;i<pts.length;i++)trace(set,pts[i],pts[(i+1)%pts.length],1);flush(c,set);}

const span=(rx,ry,y)=>ry<=0||Math.abs(y)>=ry?-1:rx*Math.sqrt(1-(y/ry)**2);
export function fillEllipse(c,cx,cy,rx,ry){
  cx=Math.round(cx);cy=Math.round(cy);
  for(let j=-Math.ceil(ry);j<Math.ceil(ry);j++){const h=span(rx,ry,j+.5);if(h<0)continue;const x0=Math.round(cx-h),x1=Math.round(cx+h);if(x1>x0)c.fillRect(x0,cy+j,x1-x0,1);}
}
export function ringEllipse(c,cx,cy,rx,ry,t=1){
  cx=Math.round(cx);cy=Math.round(cy);
  for(let j=-Math.ceil(ry);j<Math.ceil(ry);j++){
    const h=span(rx,ry,j+.5);if(h<0)continue;const x0=Math.round(cx-h),x1=Math.round(cx+h),g=span(rx-t,ry-t,j+.5);
    if(g<0){if(x1>x0)c.fillRect(x0,cy+j,x1-x0,1);continue;}
    const i0=Math.round(cx-g),i1=Math.round(cx+g);
    if(i0>x0)c.fillRect(x0,cy+j,i0-x0,1);if(x1>i1)c.fillRect(i1,cy+j,x1-i1,1);
  }
}

// Bitmap fonts: 3x5 for small fixture labels, 5x7 for the rest. Rows are read top to bottom.
const SMALL={
  A:'010101111101101',B:'110101110101110',C:'011100100100011',D:'110101101101110',E:'111100110100111',F:'111100110100100',G:'011100101101011',
  H:'101101111101101',I:'111010010010111',J:'001001001101010',K:'101101110101101',L:'100100100100111',M:'101111111101101',N:'110101101101101',
  O:'010101101101010',P:'110101110100100',Q:'010101101110011',R:'110101110101101',S:'011100010001110',T:'111010010010010',U:'101101101101111',
  V:'101101101101010',W:'101101111111101',X:'101101010101101',Y:'101101010010010',Z:'111001010100111',
  0:'111101101101111',1:'010110010010111',2:'110001010100111',3:'110001010001110',4:'101101111001001',5:'111100110001110',6:'011100111101111',
  7:'111001010010010',8:'111101111101111',9:'111101111001110','+':'000010111010000','-':'000000111000000','%':'101001010100101',':':'000010000010000','&':'010101010101011',' ':'000000000000000'
};
const NORMAL={
  A:'01110100011000111111100011000110001',B:'11110100011000111110100011000111110',C:'01111100001000010000100001000001111',D:'11110100011000110001100011000111110',
  E:'11111100001000011110100001000011111',F:'11111100001000011110100001000010000',G:'01111100001000010111100011000101111',H:'10001100011000111111100011000110001',
  I:'11111001000010000100001000010011111',J:'00111000100001000010100101001001100',K:'10001100101010011000101001001010001',L:'10000100001000010000100001000011111',
  M:'10001110111010110101100011000110001',N:'10001110011010110011100011000110001',O:'01110100011000110001100011000101110',P:'11110100011000111110100001000010000',
  Q:'01110100011000110001101011001001101',R:'11110100011000111110101001001010001',S:'01111100001000001110000010000111110',T:'11111001000010000100001000010000100',
  U:'10001100011000110001100011000101110',V:'10001100011000110001100010101000100',W:'10001100011000110101101011101110001',X:'10001100010101000100010101000110001',
  Y:'10001100010101000100001000010000100',Z:'11111000010001000100010001000011111',0:'01110100011001110101110011000101110',1:'00100011000010000100001000010001110',
  2:'01110100010000100010001000100011111',3:'11110000010000101110000010000111110',4:'00010001100101010010111110001000010',5:'11111100001000011110000010000111110',
  6:'01110100001000011110100011000101110',7:'11111000010001000100010000100001000',8:'01110100011000101110100011000101110',9:'01110100011000101111000010000101110',
  '+':'00000001000010011111001000010000000','-':'00000000000000011111000000000000000','%':'11001110010001000100010001001110011',':':'00000011000110000000011000110000000','&':'01100100101010001000101011001001101',' ':'00000000000000000000000000000000000'
};
// Scene labels used to be CSS font sizes; map them onto the two bitmap faces.
const face=size=>size<=8?{g:SMALL,w:3,h:5,sy:1,bold:0}:size<12?{g:NORMAL,w:5,h:7,sy:1,bold:0}:{g:NORMAL,w:5,h:7,sy:2,bold:1};
export function textWidth(text,size=9){const f=face(size);return Math.max(0,[...String(text)].length*(f.w+f.bold+1)-1);}
// (x,y) is the left end of the baseline. skew .5 follows a wall that runs along the floor's x axis.
export function pixelText(c,text,x,y,size=9,skew=0){
  const f=face(size),adv=f.w+f.bold+1;x=Math.round(x);y=Math.round(y);
  for(const [n,ch]of [...String(text).toUpperCase()].entries()){
    const glyph=f.g[ch]??f.g[' '];
    for(let i=0;i<glyph.length;i++){
      if(glyph[i]!=='1')continue;
      const col=n*adv+i%f.w,row=Math.floor(i/f.w),drop=Math.floor(col*skew);
      c.fillRect(x+col,y-f.h*f.sy+row*f.sy+drop,1+f.bold,f.sy);
    }
  }
}
