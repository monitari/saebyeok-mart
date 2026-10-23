// Dependency-free raster smoke renderer for the game's Canvas subset. This is not a browser/UI test.
import { deflateSync } from 'node:zlib';
const ident=()=>[1,0,0,1,0,0];
const mul=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const point=(m,x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
const rgba=v=>{if(typeof v!=='string'||!v.startsWith('#'))throw new Error(`Unsupported raster colour: ${v}`);let h=v.slice(1);if(h.length===3)h=[...h].map(x=>x+x).join('');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16),h.length===8?parseInt(h.slice(6,8),16):255];};
const glyphs={
  ' ':'00000000000000000000000000000000000','A':'01110100011000111111100011000110001','B':'11110100011000111110100011000111110','C':'01111100001000010000100001000001111','D':'11110100011000110001100011000111110',
  'E':'11111100001000011110100001000011111','F':'11111100001000011110100001000010000','G':'01111100001000010111100011000101111','H':'10001100011000111111100011000110001','I':'11111001000010000100001000010011111',
  'J':'00111000100001000010100101001001100','K':'10001100101010011000101001001010001','L':'10000100001000010000100001000011111','M':'10001110111010110101100011000110001','N':'10001110011010110011100011000110001',
  'O':'01110100011000110001100011000101110','P':'11110100011000111110100001000010000','Q':'01110100011000110001101011001001101','R':'11110100011000111110101001001010001','S':'01111100001000001110000010000111110',
  'T':'11111001000010000100001000010000100','U':'10001100011000110001100011000101110','V':'10001100011000110001100010101000100','W':'10001100011000110101101011101110001','X':'10001100010101000100010101000110001',
  'Y':'10001100010101000100001000010000100','Z':'11111000010001000100010001000011111','0':'01110100011001110101110011000101110','1':'00100011000010000100001000010001110','2':'01110100010000100010001000100011111',
  '3':'11110000010000101110000010000111110','4':'00010001100101010010111110001000010','5':'11111100001000011110000010000111110','6':'01110100001000011110100011000101110','7':'11111000010001000100010000100001000',
  '8':'01110100011000101110100011000101110','9':'01110100011000101111000010000101110'
};
export class PixelCanvas {
  constructor(w,h){this.width=w;this.height=h;this.data=new Uint8ClampedArray(w*h*4);this.ctx=new PixelContext(this);}
  getContext(){return this.ctx;}
}
class PixelContext {
  constructor(canvas){this.canvas=canvas;this.fillStyle='#000000';this.strokeStyle='#000000';this.globalAlpha=1;this.lineWidth=1;this.globalCompositeOperation='source-over';this.font='10px monospace';this.textAlign='left';this.m=ident();this.stack=[];this.path=[];}
  save(){const {m,fillStyle,strokeStyle,globalAlpha,lineWidth,globalCompositeOperation,font,textAlign}=this;this.stack.push({m:[...m],fillStyle,strokeStyle,globalAlpha,lineWidth,globalCompositeOperation,font,textAlign});}
  restore(){Object.assign(this,this.stack.pop()??{});}
  transform(...m){this.m=mul(this.m,m);}
  translate(x,y){this.transform(1,0,0,1,x,y);}
  scale(x,y){this.transform(x,0,0,y,0,0);}
  rotate(r){this.transform(Math.cos(r),Math.sin(r),-Math.sin(r),Math.cos(r),0,0);}
  setTransform(...m){this.m=m;}
  blend(x,y,col,clear=false){
    x=Math.floor(x);y=Math.floor(y);const {width,height,data}=this.canvas;if(x<0||y<0||x>=width||y>=height)return;
    const i=(y*width+x)*4;if(clear){data[i+3]=0;return;}
    const a=col[3]/255*this.globalAlpha,old=data[i+3]/255;
    if(this.globalCompositeOperation==='source-in'){data[i]=col[0];data[i+1]=col[1];data[i+2]=col[2];data[i+3]=Math.round(old*a*255);return;}
    const total=a+old*(1-a);if(!total)return;
    for(let n=0;n<3;n++)data[i+n]=Math.round((col[n]*a+data[i+n]*old*(1-a))/total);
    data[i+3]=Math.round(total*255);
  }
  poly(points,col,clear=false){
    if(points.length<3)return;
    const minY=Math.max(0,Math.floor(Math.min(...points.map(p=>p[1])))),maxY=Math.min(this.canvas.height-1,Math.ceil(Math.max(...points.map(p=>p[1]))));
    for(let y=minY;y<=maxY;y++){
      const cuts=[];
      for(let i=0,j=points.length-1;i<points.length;j=i++){
        const a=points[i],b=points[j];if((a[1]>y+.5)!==(b[1]>y+.5))cuts.push(a[0]+(y+.5-a[1])*(b[0]-a[0])/(b[1]-a[1]));
      }
      cuts.sort((a,b)=>a-b);
      for(let k=0;k+1<cuts.length;k+=2)for(let x=Math.max(0,Math.ceil(cuts[k]-.5));x<Math.min(this.canvas.width,cuts[k+1]-.5);x++)this.blend(x,y,col,clear);
    }
  }
  fillRect(x,y,w,h){this.poly([[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(p=>point(this.m,...p)),rgba(this.fillStyle));}
  clearRect(x,y,w,h){this.poly([[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(p=>point(this.m,...p)),[0,0,0,0],true);}
  beginPath(){this.path=[];this.closed=false;}
  moveTo(x,y){this.path.push(point(this.m,x,y));}
  lineTo(x,y){this.path.push(point(this.m,x,y));}
  closePath(){this.closed=true;}
  ellipse(x,y,rx,ry,angle,start,end){
    for(let i=0;i<=32;i++){const t=start+(end-start)*i/32,dx=Math.cos(t)*rx,dy=Math.sin(t)*ry;this.path.push(point(this.m,x+dx*Math.cos(angle)-dy*Math.sin(angle),y+dx*Math.sin(angle)+dy*Math.cos(angle)));}
  }
  arc(x,y,r,start,end){this.ellipse(x,y,r,r,0,start,end);}
  fill(){this.poly(this.path,rgba(this.fillStyle));}
  stroke(){
    const pts=this.closed?[...this.path,this.path[0]]:this.path,col=rgba(this.strokeStyle);
    for(let i=1;i<pts.length;i++){
      const a=pts[i-1],b=pts[i],steps=Math.ceil(Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]))),r=Math.floor(this.lineWidth/2);
      for(let k=0;k<=steps;k++){const t=steps?k/steps:0;for(let dx=-r;dx<=r;dx++)for(let dy=-r;dy<=r;dy++)this.blend(Math.round(a[0]+(b[0]-a[0])*t)+dx,Math.round(a[1]+(b[1]-a[1])*t)+dy,col);}
    }
  }
  fillText(text,x,y){
    const size=Number(this.font.match(/([\d.]+)px/)?.[1]??10),scale=size/8;
    for(const [j,ch]of [...String(text).toUpperCase()].entries()){
      const glyph=glyphs[ch]??glyphs[' '];for(let i=0;i<35;i++)if(glyph[i]==='1')this.fillRect(x+(j*6+i%5)*scale,y-7*scale+Math.floor(i/5)*scale,scale,scale);
    }
  }
  drawImage(source,...args){
    let sx=0,sy=0,sw=source.width,sh=source.height,dx,dy,dw,dh;
    if(args.length===2){[dx,dy]=args;dw=sw;dh=sh;}
    else if(args.length===4)[dx,dy,dw,dh]=args;
    else [sx,sy,sw,sh,dx,dy,dw,dh]=args;
    const m=this.m,det=m[0]*m[3]-m[1]*m[2],corners=[[dx,dy],[dx+dw,dy],[dx+dw,dy+dh],[dx,dy+dh]].map(p=>point(m,...p));
    const x0=Math.max(0,Math.floor(Math.min(...corners.map(p=>p[0])))),x1=Math.min(this.canvas.width,Math.ceil(Math.max(...corners.map(p=>p[0]))));
    const y0=Math.max(0,Math.floor(Math.min(...corners.map(p=>p[1])))),y1=Math.min(this.canvas.height,Math.ceil(Math.max(...corners.map(p=>p[1]))));
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const tx=x+.5-m[4],ty=y+.5-m[5],lx=(m[3]*tx-m[2]*ty)/det,ly=(-m[1]*tx+m[0]*ty)/det,u=(lx-dx)/dw,v=(ly-dy)/dh;
      if(u<0||u>=1||v<0||v>=1)continue;
      const ix=Math.floor(sx+u*sw),iy=Math.floor(sy+v*sh);if(ix<0||iy<0||ix>=source.width||iy>=source.height)continue;
      const i=(iy*source.width+ix)*4;if(source.data[i+3])this.blend(x,y,[source.data[i],source.data[i+1],source.data[i+2],source.data[i+3]]);
    }
  }
}
let crcTable;
const crc=buf=>{crcTable??=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});let c=0xffffffff;for(const v of buf)c=crcTable[(c^v)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
export function png(canvas){
  const chunk=(type,data)=>{const name=Buffer.from(type),len=Buffer.alloc(4),sum=Buffer.alloc(4);len.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([len,name,data,sum]);};
  const header=Buffer.alloc(13);header.writeUInt32BE(canvas.width,0);header.writeUInt32BE(canvas.height,4);header[8]=8;header[9]=6;
  const raw=Buffer.alloc((canvas.width*4+1)*canvas.height);for(let y=0;y<canvas.height;y++)Buffer.from(canvas.data.buffer,y*canvas.width*4,canvas.width*4).copy(raw,y*(canvas.width*4+1)+1);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
