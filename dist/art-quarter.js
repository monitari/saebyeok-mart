// Pixel isometric diorama. Simulation coordinates, inventory and knowledge are read-only here.
import { TILE, WIDTH, HEIGHT, fixturesFor, center, STORE_ROOMS, storeCell, storeBoundary } from './world.js';
import { PRODUCTS } from './data.js';
import { SCENE_WIDTH, SCENE_HEIGHT, ISO_Y, ORIGIN_X, ORIGIN_Y, project, boxFaces, inPolygon, screenDirection } from './projection.js';
import { fillPoly, outline, pixelLine, fillEllipse, ringEllipse, pixelText, textWidth } from './pixel.js';
import {orderSceneNodes} from './depth-order.js';
import {exteriorNodes,seasonAt} from './environment.js';
import {districtGround,districtDetails,districtObject,districtOverlay,districtWeather,paintSky,skyBands as bands,skyColors,streetLook} from './art-exterior.js';

const P={floor:'#d8d3bb',grout:'#c0c4af',wall:'#d7ddc9',trim:'#698c7c',green:'#386b58',dark:'#283e3e',wood:'#b49368',cream:'#f0e9cf'};
// Drawing snaps each floor axis to whole half-pixels before projecting. Shared corners land on the
// same pixel, and every edge along a floor axis is an exact 2:1 stair. Picking keeps the exact projection.
const A=v=>Math.round(v*ISO_Y);
const pt=(a,b,z)=>({x:ORIGIN_X+2*(a-b),y:ORIGIN_Y+a+b-z});
const sp=(x,y,z=0)=>pt(A(x),A(y),Math.round(z));
const range=(v,w)=>{const s=A(v);return [s,w>0?Math.max(s+1,A(v+w)):s];};
const zRange=(z,height)=>{const b=Math.round(z);return [b,height>0?Math.max(b+1,Math.round(z+height)):b];};
function quad(x,y,w,h,z=0){const [a0,a1]=range(x,w),[b0,b1]=range(y,h),Z=Math.round(z);return [pt(a0,b0,Z),pt(a1,b0,Z),pt(a1,b1,Z),pt(a0,b1,Z)];}
function faces(x,y,w,h,height,z=0){
  const [a0,a1]=range(x,w),[b0,b1]=range(y,h),[zb,zt]=zRange(z,height);
  const t=[pt(a0,b0,zt),pt(a1,b0,zt),pt(a1,b1,zt),pt(a0,b1,zt)],b=[pt(a0,b0,zb),pt(a1,b0,zb),pt(a1,b1,zb),pt(a0,b1,zb)];
  return {top:t,left:[t[3],t[2],b[2],b[3]],right:[t[2],t[1],b[1],b[2]]};
}
export function polygon(c,points,color,stroke=null){
  const pts=points.map(p=>({x:Math.round(p.x),y:Math.round(p.y)}));
  c.fillStyle=color;fillPoly(c,pts);if(stroke){c.fillStyle=stroke;outline(c,pts);}
}
const line=(c,a,b,color,width=1)=>{c.fillStyle=color;pixelLine(c,a,b,width);};
const tint=(col,d)=>{const n=parseInt(col.slice(1),16);return '#'+[n>>16,(n>>8)&255,n&255].map(v=>Math.max(0,Math.min(255,Math.round(v+d))).toString(16).padStart(2,'0')).join('');};
function box(c,x,y,w,h,height,col,z=0){
  const f=faces(x,y,w,h,height,z);polygon(c,f.left,tint(col,-24));polygon(c,f.right,tint(col,-43));polygon(c,f.top,tint(col,15),'#20373530');
}
const flat=(c,x,y,w,h,col,z=0)=>polygon(c,quad(x,y,w,h,z),col);
function front(c,x,y,w,bottom,height,col){const [a0,a1]=range(x,w),b=A(y),[z0,z1]=zRange(bottom,height);polygon(c,[pt(a0,b,z1),pt(a1,b,z1),pt(a1,b,z0),pt(a0,b,z0)],col);}
function side(c,x,y,h,bottom,height,col){const a=A(x),[b0,b1]=range(y,h),[z0,z1]=zRange(bottom,height);polygon(c,[pt(a,b0,z1),pt(a,b1,z1),pt(a,b1,z0),pt(a,b0,z0)],col);}
// Bitmap lettering sheared to follow a wall along the floor's x axis.
function label(c,text,x,y,z,color='#e8eedb',size=9){const p=sp(x,y,z);c.fillStyle=color;pixelText(c,text,p.x,p.y,size,.5);}
const exteriorDrawing={box,flat,front,side,line,sp,label,tint,polygon,fillEllipse,ringEllipse,textWidth};
// The sky behind the diorama; the page paints the same bands around the scene so its edge never shows.
export const skyBands=s=>bands(s,SCENE_HEIGHT);
export function backdrop(s){return skyColors(s).bottom;}
export function daylight(s){const m=((s.clock%1440)+1440)%1440;return m<300||m>1200?.14:m<420?.14+(m-300)/120*.7:m>1080?.84-(m-1080)/120*.7:.9;}
const heights={fridge:70,cooler:37,door:76,shelf:39,table:27,counter:32,cabinet:54,rack:38,bin:23,appliance:62,freezer:25,machine:52,stand:19,warmer:23,pallet:19};
const perimeter=storeBoundary();
const shaped=s=>(s.layoutVersion??1)>=5;
export function fixtureHeight(id,f){return id==='umbrellaStand'?48:id==='newsRack'?25:id==='basketStack'?15:id==='counterRack'?14:id==='boxes'?24:heights[f.kind]??32;}
function pieces(id,f){
  if(['machine','bin','stand','pallet'].includes(f.kind)||['storage','restroom','coffeeMachine','microwave','hotWater'].includes(id))return [{...f}];
  const out=[];
  for(let j=0;j<f.h;j++)for(let i=0;i<f.w;i++)out.push({...f,x:f.x+i,y:f.y+j,w:1,h:1});
  return out;
}
export function sceneNodes(s,view={}){
  const nodes=exteriorNodes(s),fixtures=fixturesFor(s);
  for(const [id,f]of Object.entries(fixtures)){
    if(f.facility&&!s.facilities[f.facility])continue;
    for(const [index,piece]of pieces(id,f).entries()){
      const height=fixtureHeight(id,f),z=f.onCounter?32:0,x=piece.x*TILE+2,y=piece.y*TILE+2,w=piece.w*TILE-4,h=piece.h*TILE-4;
      const faces=boxFaces(x,y,w,h,height,z);
      nodes.push({type:'fixture',id,index,f:piece,whole:f,height,z,x,y,w,h,faces,depth:(piece.x+piece.y+(piece.w+piece.h)/2)*TILE+(f.onCounter?2:0)});
    }
    if(f.kind==='table')for(const [i,cell]of f.access.entries()){
      const a=center(...cell);nodes.push({type:'stool',id:`${id}-${i}`,x:a.x-8,y:a.y-8,w:16,h:16,height:14,depth:a.x+a.y-2});
    }
  }
  for(const a of Object.values(s.actors)){
    if(a.privateRoom)continue;
    const off=view.offsets?.[a.id]??{x:0,y:0};const p=project(a.x+off.x,a.y+off.y);
    nodes.push({type:'person',id:a.id,a,p,x:a.x+off.x-2,y:a.y+off.y-2,w:4,h:4,depth:a.x+off.x+a.y+off.y});
  }
  for(const a of s.street?.people??[])nodes.push({type:'street',id:a.id,a,p:project(a.x,a.y),x:a.x-2,y:a.y-2,w:4,h:4,depth:a.x+a.y});
  if(s.interior?.truck)nodes.push({type:'truck',id:'truck',x:467,y:548,w:94,h:20,height:41,depth:1085});
  if(shaped(s))for(const [index,e]of perimeter.entries()){
    // Full rear walls are part of the backdrop; low cutaway walls sort with people.
    if(e.side==='north'&&e.line===1||e.side==='west'&&e.line===1||e.side==='south'&&e.line===15)continue;
    const horizontal=e.side==='north'||e.side==='south';
    const x=(horizontal?e.start:e.line)*TILE-(horizontal?0:2),y=(horizontal?e.line:e.start)*TILE-(horizontal?2:0);
    const w=horizontal?e.length*TILE:4,h=horizontal?4:e.length*TILE;
    const height=e.side==='north'?40:e.side==='west'?24:12;
    nodes.push({type:'wall',id:`wall-${index}`,x,y,w,h,height,depth:x+y+(w+h)/2});
  }
  if(shaped(s))for(const [index,[x,y]]of [[2,14],[20,13]].entries())nodes.push({type:'planter',id:`planter-${index}`,x:x*TILE,y:y*TILE,w:54,h:20,height:33,depth:(x+y)*TILE+37});
  const ledges=shaped(s)?[[7*TILE,3*TILE],[12*TILE,3*TILE]]:[[32,288],[384,352]];
  for(const [index,[x,w]]of [...ledges,[320,2],[384,2],[323,27],[354,27]].entries()){
    nodes.push({type:'doorway',id:`entry-${index}`,index,x,y:478,w,h:2,height:index<2?7:56,depth:x+w/2+479});
  }
  for(const n of nodes){
    n.bounds={left:n.x,top:n.y,right:n.x+n.w,bottom:n.y+n.h};
    const pts=n.faces?Object.values(n.faces).flat():Object.values(boxFaces(n.x,n.y,n.w,n.h,n.height??54)).flat();
    n.screen=n.p?{left:n.p.x-24,right:n.p.x+24,top:n.p.y-64,bottom:n.p.y+6}:{left:Math.min(...pts.map(p=>p.x))-4,right:Math.max(...pts.map(p=>p.x))+4,top:Math.min(...pts.map(p=>p.y))-8,bottom:Math.max(...pts.map(p=>p.y))+4};
  }
  const sorted=orderSceneNodes(nodes);
  // Reveal a selected person's silhouette rather than burying them under a tall rack.
  const selected=nodes.find(n=>n.type==='person'&&n.id===view.selected);
  if(selected)for(const n of sorted.slice(sorted.indexOf(selected)+1))if(n.type==='fixture'&&n.height>=35||n.fade){
    const faces=n.faces??boxFaces(n.x-12,n.y-12,n.w+24,n.h+24,n.height+24);
    n.faded=[20,35,47].some(z=>Object.values(faces).some(poly=>inPolygon({x:selected.p.x,y:selected.p.y-z},poly)));
  }
  return sorted;
}
export function hitTestScene(s,x,y,view={}){
  const p={x,y},nodes=sceneNodes(s,view);
  const selected=nodes.find(n=>n.type==='person'&&n.id===view.selected);
  const throughSelected=selected&&Math.abs(x-selected.p.x)<14&&y<=selected.p.y+5&&y>=selected.p.y-53;
  for(const n of nodes.reverse()){
    if(n.type==='person'||n.type==='street'){
      const child=n.type==='person'?s.people[n.id].genes.appearance.age==='child':n.a.appearance.age==='child';
      if(Math.abs(x-n.p.x)<(n.a.kind==='bicycle'?22:14)&&y<=n.p.y+5&&y>=n.p.y-(child?38:53))return {type:n.type,id:n.id};
    }else if(n.type==='fixture'&&!(n.faded&&throughSelected)&&Object.values(n.faces).some(poly=>inPolygon(p,poly)))return {type:'fixture',id:n.id};
  }
  return null;
}

const floors=new Map();
function ground(c,s){
  const dl=daylight(s),night=dl<.5;
  paintSky(c,s,SCENE_WIDTH,SCENE_HEIGHT);
  districtGround(c,s,exteriorDrawing);
  const shadow=quad(24,24,WIDTH-32,HEIGHT-26).map(p=>({x:p.x+8,y:p.y+20}));polygon(c,shadow,'#09182065');
  box(c,22,22,WIDTH-44,HEIGHT-22,10,night?'#34454a':'#88918a',-10);
  if(shaped(s))for(const r of STORE_ROOMS)flat(c,r.x*TILE,r.y*TILE,r.w*TILE,r.h*TILE,P.grout);
  else flat(c,TILE,TILE,22*TILE,14*TILE,P.grout);
  for(let y=1;y<18;y++)for(let x=0;x<24;x++){
    if(y<15&&(x<1||x>22))continue;
    const store=storeCell(x,y,s.layoutVersion??1),col=store?(x>=(shaped(s)?18:20)&&y>=4&&y<=11?((x+y)%2?'#ccb894':'#d4c3a2'):shaped(s)&&y>=13?((x+y)%2?'#a4bba7':'#b0c4ae'):y===10&&x<8?'#b4c4ae':((x+y)%2?'#e5e0cd':'#dad8c2')):night?((x+y)%2?'#33474c':'#394e51'):((x+y)%2?'#8a9c98':'#849590');
    flat(c,x*TILE,y*TILE,TILE-2.7,TILE-2.7,col);
    if(!store&&x%3===0)flat(c,x*TILE+4,y*TILE+10,22,1,night?'#4b6260':'#a7b2a5');
  }
  districtDetails(c,s,exteriorDrawing);
  // Two full rear walls, with the near walls cut low so the shop remains readable.
  const backWidth=shaped(s)?21*TILE:WIDTH-64,leftLength=shaped(s)?12*TILE:448;
  box(c,27,27,backWidth+10,5,101,P.wall);
  box(c,27,32,5,leftLength,101,'#bdcbbd');
  front(c,32,32,backWidth,82,5,P.green);front(c,32,32,backWidth,98,3,'#f1e9c6');
  side(c,32,32,leftLength,83,5,P.green);
  // Wall-mounted posters, safety notice and low skirting add detail without blocking an aisle.
  side(c,32,32,leftLength,1,4,'#729384');front(c,32,32,backWidth,1,4,'#729384');
  for(const [y,col,accent]of [[96,'#eddab5','#c47c54'],[150,'#bdd4bf','#3f7965'],[310,'#e9c4b4','#b55f54']]){
    side(c,33,y,35,38,33,col);side(c,33,y+3,29,62,4,accent);
    for(let i=0;i<3;i++)side(c,33,y+5,25-i*5,43+i*5,2,accent);
  }
  side(c,32,228,34,44,31,'#e9e6cd');side(c,32,228,34,68,7,'#b66f55');
  const calendar=sp(32,246,52);c.fillStyle='#405e51';pixelText(c,String(s.day),calendar.x-Math.floor(textWidth(String(s.day),10)/2),calendar.y,10);
  const camera=sp(46,42,96);c.fillStyle='#425e56';c.fillRect(camera.x-3,camera.y-3,10,5);c.fillStyle='#a7c8b3';c.fillRect(camera.x+5,camera.y-2,3,3);
  // Air conditioner, clock and shop name on the rear wall.
  box(c,300,29,78,5,15,'#e5ead9',78);
  for(let i=0;i<6;i++)front(c,305+i*11,35,7,82,1,'#8c9f97');
  // The shop sign is centred on its board; bitmap text width is in screen pixels, two per floor half-unit.
  const sign='SAEBYEOK 24',signX=392+(150-textWidth(sign,14)/2/ISO_Y)/2;
  front(c,392,34,150,76,21,P.green);front(c,392,34,150,76,1,'#24493d');label(c,sign,signX,34,80,'#f0e6bd',14);
  for(const [x,name,col]of [[44,'DAIRY','#88b8ae'],[110,'DRINKS','#649e97'],[268,'FRESH','#ca9760'],[460,'CHILLED','#9aaf6c']]){
    front(c,x,34,63,72,9,col);label(c,name,x+3,34,74,'#fff1d3',7);
  }
  // Window counter on the cutaway side; narrow frames leave faces and food visible.
  side(c,23*TILE,4.5*TILE,5.5*TILE,16,67,night?'#668c9225':'#9bd2d73a');
  for(let y=5;y<=10;y+=2)line(c,sp(23*TILE,y*TILE,13),sp(23*TILE,y*TILE,84),'#abc8bc',2);
  line(c,sp(23*TILE,4.5*TILE,84),sp(23*TILE,10*TILE,84),'#abc8bc',2);
  // Exterior threshold, welcome mat and a few warm reflections on the wet paving.
  flat(c,10*TILE,14*TILE+10,64,45,s.facilities.welcomeMat?'#526d61':'#8e9b83');
  for(let i=0;i<5;i++)flat(c,10*TILE+5,14*TILE+15+i*6,53,1,'#b1ba9a');
  if(['rain','storm'].includes(s.weather.kind))for(let i=0;i<9;i++)flat(c,55+i*74,16*TILE+(i%2)*24,32,2,night?'#b9a66b55':'#ccd5bb66');
  for(let x=20;x<WIDTH-40;x+=100)flat(c,x,HEIGHT-12,46,2,night?'#91a488':'#d2d1ac');
}
function product(c,p,x,y,z,small=false){
  const d=PRODUCTS[p];if(!d)return;const size=small?4:6,height=['bottle','can','jar'].includes(d.shape)?small?8:11:small?5:8;
  box(c,x,y,size,size*.75,height,d.color,z);
  if(['bottle','can','jar','cup','bigcup'].includes(d.shape))flat(c,x,y,size,size*.75,'#eee9cb',z+height+.3);
  front(c,x+.5,y+size*.75+.1,size-1,z+height*.35,1.4,'#eee8c6');
}
function goods(c,s,n,rows=3){
  const ps=Object.keys(PRODUCTS).filter(p=>PRODUCTS[p].fixture===n.id&&(!PRODUCTS[p].facility||s.facilities[PRODUCTS[p].facility]));
  if(!ps.length)return;
  const tidy=s.interior?.tidy?.[n.id]??1;
  for(let row=0;row<rows;row++){
    const z=n.z+9+row*(n.height-15)/rows,p=ps[(row+n.index*rows)%ps.length],d=PRODUCTS[p],fill=Math.min(1,(s.shelf[p]??0)/d.shelfMax);
    if(n.f.kind==='fridge'||n.whole.w>=n.whole.h){
      front(c,n.x+2,n.y+n.h+.2,n.w-4,z-3,2,'#e9e7d0');
      front(c,n.x+4,n.y+n.h+.5,8,z-3,2,'#e7c766');
      for(let i=0;i<4;i++)if(i<Math.ceil(fill*4))product(c,p,n.x+3+i*(n.w-7)/4,n.y+n.h-5-(tidy<.5&&i%2?3:0),z,true);
    }else{
      side(c,n.x+n.w+.2,n.y+2,n.h-4,z-3,2,'#e9e7d0');
      side(c,n.x+n.w+.5,n.y+4,8,z-3,2,'#e7c766');
      for(let i=0;i<4;i++)if(i<Math.ceil(fill*4))product(c,p,n.x+n.w-5,n.y+3+i*(n.h-7)/4,z,true);
    }
  }
  const promo=ps.map(p=>s.interior?.promos?.[p]).find(Boolean);
  if(promo){front(c,n.x+4,n.y+n.h+.5,19,n.z+n.height-9,7,'#d86c4e');label(c,promo,n.x+5,n.y+n.h+.6,n.z+n.height-4,'#fff1d1',6);}
  if(ps.some(p=>(s.interior?.stickers?.[p]??0)>0))front(c,n.x+3,n.y+n.h+.7,7,n.z+10,4,'#e0a34b');
}
function table(c,s,n){
  for(const [dx,dy]of [[3,3],[n.w-6,n.h-6]])box(c,n.x+dx,n.y+dy,3,3,23,'#566c61');
  box(c,n.x,n.y,n.w,n.h,4,P.wood,23);
  for(const t of s.trash??[])if(n.f.access.some(a=>a[0]===t.cell[0]&&a[1]===t.cell[1])){
    const axis=n.whole.w>=n.whole.h?0:1,min=axis?n.f.y:n.f.x,span=axis?n.f.h:n.f.w;
    if(t.cell[axis]>=min&&t.cell[axis]<min+span)product(c,Object.keys(PRODUCTS).find(p=>PRODUCTS[p].shape===t.kind)??'cupRamen',n.x+8,n.y+9,28);
  }
}
function equipment(c,s,n,now){
  const {id,x,y,w,h,height,z}=n,inter=s.interior;
  if(n.f.kind==='table'){table(c,s,n);return;}
  if(n.f.kind==='counter'){
    box(c,x,y,w,h,height-4,P.green);box(c,x-1,y-1,w+2,h+2,4,P.cream,height-4);
    if(n.index===2){box(c,x+3,y+3,18,12,12,'#344d47',33);front(c,x+5,y+15,14,39,6,s.checkout?'#a0e9bc':'#719e89');box(c,x+22,y+13,5,7,3,'#4a5c50',33);}
    if(n.index===3){box(c,x+7,y+9,13,9,3,'#dcdfc5',33);flat(c,x+10,y+11,6,2,'#cc6a50',36);}
    if(n.index===0)label(c,'24',x+9,y+h+.5,12,'#dfdfb7',13);
    return;
  }
  if(id==='storage'){
    box(c,x,y,w,h,76,'#a7b0a0');front(c,x+5,y+h+.1,w-10,2,69,'#6f8577');front(c,x+10,y+h+.2,w-20,32,28,'#82998b');
    label(c,'STAFF',x+10,y+h+.4,57,'#e0e4c8',8);front(c,x+w-12,y+h+.5,3,26,2,'#e9d496');return;
  }
  if(id==='restroom'){
    const busy=!!inter?.restroom?.by;
    box(c,x,y,w,h,76,'#bdc9bb');front(c,x+5,y+h+.1,w-10,2,69,'#7b9d9b');
    front(c,x+9,y+h+.3,w-18,44,19,'#e5e9d9');label(c,'WC',x+20,y+h+.5,50,'#3e6362',12);
    front(c,x+w-13,y+h+.5,5,30,3,busy?'#cc7458':'#a9ca8a');front(c,x+w-13,y+h+.5,3,23,5,'#ece2b9');return;
  }
  if(n.f.kind==='fridge'){
    box(c,x,y,w,h,height,'#a9bfb6');front(c,x+2,y+h+.1,w-4,7,height-17,'#294c50');
    front(c,x+2,y+h+.3,w-4,height-8,4,'#e8efd2');goods(c,s,n,3);
    front(c,x+w-5,y+h+.8,1.6,22,21,'#c2d8ca');line(c,sp(x+7,y+h+1,16),sp(x+w-7,y+h+1,55),'#d5e7db45');return;
  }
  if(id==='coffeeMachine'||id==='microwave'||id==='hotWater'){
    box(c,x,y,w,h,29,'#a4b1a1');box(c,x-1,y-1,w+2,h+2,3,P.cream,29);
    if(id==='coffeeMachine'){
      box(c,x+5,y+h-29,29,25,31,'#354547',32);box(c,x+10,y+h-24,16,13,7,'#9cae9b',63);
      front(c,x+9,y+h-3.7,20,48,8,inter?.coffee?.by?'#92e5b8':inter?.coffee?.beans<.2?'#cf8d55':'#789e90');
      box(c,x+17,y+h-7,6,6,7,'#eee9d7',33);if(inter?.coffee?.by)line(c,sp(x+20,y+h-6,46),sp(x+20,y+h-6,39),'#896544',2);
      for(let i=0;i<5;i++)box(c,x+40,y+h-12,8,7,2,'#f0ebd8',33+i*3);
      label(c,'COFFEE',x+5,y+h+.3,15,'#425e50',7);
    }else if(id==='microwave'){
      const busy=!!s.appliances.microwave.by;box(c,x+3,y+h-25,w-6,24,20,'#dadfce',32);front(c,x+6,y+h-.5,w-20,37,11,busy?'#e5ba6c':'#385351');
      front(c,x+w-12,y+h,5,43,2,busy?'#9ee4b7':'#7a9785');front(c,x+w-12,y+h,5,37,2,'#75847d');
    }else{
      box(c,x+5,y+h-21,18,18,28,'#dddcc6',32);front(c,x+7,y+h-2,14,48,6,'#ca6c52');box(c,x+12,y+h-3,5,5,3,'#56736c',35);
    }return;
  }
  if(n.f.kind==='cooler'||n.f.kind==='freezer'){
    box(c,x,y,w,h,height,'#9cbbb1');flat(c,x+3,y+3,w-6,h-6,'#456c6b',height+.3);
    const ps=Object.keys(PRODUCTS).filter(p=>PRODUCTS[p].fixture===id);
    for(let row=0;row<2;row++)for(let i=0;i<3;i++){const p=ps[(i+n.index*3+row)%ps.length];if((s.shelf[p]??0)>row*3+i)product(c,p,x+4+i*(w-8)/3,y+5+row*10,height+1,true);}
    flat(c,x+2,y+2,w-4,h-4,'#b8e1d42e',height+10);line(c,sp(x+3,y+3,height+11),sp(x+w-3,y+3,height+11),'#def0d7',2);return;
  }
  if(id==='atm'||id==='kiosk'){
    box(c,x,y,w,h,height,'#729785');front(c,x+4,y+h+.3,w-8,24,19,'#304f4b');front(c,x+7,y+h+.5,w-14,30,10,id==='kiosk'&&inter?.kiosk?.error?'#cf795e':'#b0d9b6');
    front(c,x+6,y+h+.6,w-12,19,2,'#dedfc3');front(c,x+8,y+h+.7,w-16,11,3,'#2c4a43');label(c,id==='atm'?'ATM':'SELF',x+3,y+h+.8,47,'#f4eac8',8);return;
  }
  if(id==='trash'||id==='recycle'){
    const fill=id==='trash'?inter?.bins?.general:inter?.bins?.recycle;
    box(c,x+2,y+2,w-4,h-4,21,id==='trash'?'#597263':'#668b98');box(c,x+1,y+1,w-2,h-2,3,'#b1bc9f',21);flat(c,x+6,y+6,w-12,h-12,fill>.8?'#806e50':'#253e3c',24.1);
    if(fill>.8)box(c,x+5,y+6,10,8,6,'#c7bea0',24);return;
  }
  if(id==='umbrellaStand'){
    box(c,x+3,y+3,w-6,h-6,17,'#667d6c');for(let i=0;i<Math.min(4,s.rental.inStand);i++){
      const a=x+6+i*6;line(c,sp(a,y+10,12),sp(a,y+10,45),'#9bbca5',2);const p=sp(a,y+10,45);c.fillStyle='#749581';c.fillRect(p.x-1,p.y-2,5,1);c.fillRect(p.x-2,p.y-1,1,2);c.fillRect(p.x+4,p.y-1,1,2);
    }return;
  }
  if(id==='basketStack'){
    const count=Math.min(6,inter?.baskets?.stack??6);for(let i=0;i<count;i++){box(c,x+2,y+2,w-4,h-4,3,'#688f77',i*2);flat(c,x+5,y+5,w-10,h-10,'#365749',i*2+3.1);}return;
  }
  if(id==='boxes'){
    box(c,x,y,w,h,5,'#8d7958');for(let i=0;i<Math.min(5,s.boxes.length);i++){const bx=x+5+(i%3)*20,by=y+5+Math.floor(i/3)*20;box(c,bx,by,18,17,15,'#b99966',5);flat(c,bx+7,by,3,17,'#e0c795',20.1);}return;
  }
  if(id==='hotCase'){
    box(c,x,y,w,h,22,'#9eaf97',32);front(c,x+2,y+h+.3,w-4,37,12,'#524b34');
    const bars=Math.max(1,Math.floor((w-8)/13));
    for(let i=0;i<bars;i++)if((s.shelf.hotbar??0)>n.index*bars+i)box(c,x+5+i*13,y+h-6,11,4,3,'#d9ad63',39);return;
  }
  if(id==='parcelShelf'||id==='tobaccoCabinet'){
    box(c,x,y,w,h,height,'#9cae94');front(c,x+2,y+h+.2,w-4,5,height-10,'#3e5a4d');
    if(id==='parcelShelf'){
      for(let i=0;i<Math.min(9,inter?.parcels?.length??0);i++)if(i%n.whole.w===n.index)box(c,x+4,y+h-12,10,10,9,'#bb9965',8+Math.floor(i/n.whole.w)*15);
      if(n.index===0)label(c,'PARCEL',x+2,y+h+.7,height-5,'#f4e2bb',6);
    }else if(s.facilities.tobaccoSales)goods(c,s,n,3);return;
  }
  // Bread, snacks, noodles, daily goods, newspapers and the gum rack share physical shelf tiers.
  box(c,x,y,w,h,height,id==='breadRack'?'#aa936d':id==='newsRack'?'#819d87':'#8ca696',z);
  const cap={snackShelf:'#cb9760',ramenShelf:'#b97158',dailyShelf:'#6e9e9c',breadRack:'#c9a76e'}[id];
  if(cap)flat(c,x+1,y+1,w-2,h-2,cap,z+height+.5);
  if(n.whole.w>=n.whole.h)front(c,x+1,y+h+.2,w-2,z+4,height-9,'#3c5750');else side(c,x+w+.2,y+1,h-2,z+4,height-9,'#405c50');
  goods(c,s,n,id==='newsRack'||id==='counterRack'?1:3);
  if(id==='snackShelf'||id==='ramenShelf'){
    // Small shelf-end promotional card mounted on the fixture itself.
    front(c,x+5,y+h+.9,12,z+height-9,6,'#f5df9f');label(c,'SALE',x+5,y+h+1,z+height-6,'#975b43',5);
  }
}

function drawPerson(c,s,n,view,helpers){
  const a=n.a,street=n.type==='street',p=n.p;
  const pose=street?{dir:screenDirection(a.paused&&a.kind==='shelter'?'up':a.dir),action:'idle',frame:Math.floor(a.walk)%4,walking:!a.paused&&a.kind!=='bicycle',sitting:a.kind==='bicycle',mood:60}:helpers.poseOf(s,a,view.now??0);
  if(!street)pose.dir=screenDirection(pose.dir);
  const x=Math.round(p.x+(a.drunk?Math.sin((view.now??0)/260+a.id.length)*2:0)),y=Math.round(p.y),person=street?{id:a.id,genes:{appearance:a.appearance}}:s.people[a.id];
  c.fillStyle='#10261f40';fillEllipse(c,x,y,10,4);
  if(view.selected===n.id||view.related?.includes(n.id)){c.fillStyle=view.selected===n.id?'#f0cc70':'#b7d6b0';ringEllipse(c,x,y+1,14,7,2);}
  c.drawImage(helpers.sprite(person,pose),x-24,y-62);
  if(!street&&s.checkout?.customer===a.id){
    c.fillStyle=s.checkout.payment==='cash'?'#b5cf8c':'#d7b16e';c.fillRect(x+6,y-25,9,5);
    c.fillStyle=s.checkout.payment==='cash'?'#597c4d':'#6c5739';c.fillRect(x+8,y-23,3,1);
  }
  if(street&&a.kind==='bicycle'){
    for(const dx of [-12,12]){c.fillStyle='#1f3d3e';ringEllipse(c,x+dx,y-1,7,7,2);}
    line(c,{x:x-12,y:y-1},{x:x-3,y:y-15},'#b2a17b',2);line(c,{x:x-3,y:y-15},{x:x+12,y:y-1},'#b2a17b',2);line(c,{x:x-12,y:y-1},{x:x+4,y:y-1},'#b2a17b',2);
  }
  if(street&&a.paused&&a.kind==='phone'){c.fillStyle='#283e43';c.fillRect(x+7,y-30,5,8);c.fillStyle='#badac0';c.fillRect(x+8,y-29,3,4);}
  if(a.y>=15*TILE&&['rain','storm'].includes(s.weather.kind)&&(street?a.umbrella:a.hasUmbrella||a.holding==='rental')){
    const col=a.holding==='rental'?'#729e7e':street?a.appearance.top.color:'#859f9a';
    polygon(c,[{x:x-17,y:y-53},{x:x-9,y:y-62},{x:x+5,y:y-66},{x:x+17,y:y-57},{x:x+8,y:y-51}],col,'#344e4d');line(c,{x,y:y-55},{x,y:y-38},'#ccd6bb');
  }
  if(view.selected===n.id){c.fillStyle='#f0cc70';c.fillRect(x-2,y-61,5,3);}
  if(a.anim==='sleep'){c.fillStyle='#e1e3c7';const bob=Math.floor((view.now??0)/700)%2;pixelText(c,'z',x+9,y-47-bob,8);pixelText(c,'z',x+13,y-53-bob,8);}
}
function doorway(c,s,n){
  const y=15*TILE;
  if(n.index<2){box(c,n.x,y-2,n.w,2,7,'#8ea594');return;}
  if(n.index<4){box(c,n.x,y-1,2,2,56,'#c3d1ba');return;}
  const open=Object.values(s.actors).some(a=>Math.abs(a.x-11*TILE)<55&&Math.abs(a.y-y)<45);
  if(!open)front(c,n.x,y,n.w,5,46,'#a4c5ba25');
  if(n.index===4)label(c,'OPEN',10*TILE+9,y,57,'#d4e2a5',8);
}
function truck(c,s){
  const x=490,y=548,col=s.interior.truck.kind==='garbage'?'#84a895':'#d3d8bd';
  box(c,x,y,70,20,34,col,7);box(c,x-23,y,24,20,23,col,7);front(c,x-20,y+20.3,17,22,11,'#3e6870');
  for(const dx of [-12,54]){const p=sp(x+dx,y+21,2);c.fillStyle='#182f34';fillEllipse(c,p.x,p.y,7,7);c.fillStyle='#94a997';c.fillRect(p.x-2,p.y-2,4,4);}
}
const exteriorImages=new Map();
function exteriorImage(s,n,helpers){
  const key=n.id+'|'+streetLook(s);
  if(exteriorImages.has(key))return exteriorImages.get(key);
  const pts=Object.values(boxFaces(n.x-44,n.y-44,n.w+88,n.h+88,n.height+48)).flat(),minX=Math.floor(Math.min(...pts.map(p=>p.x))),minY=Math.floor(Math.min(...pts.map(p=>p.y)));
  const canvas=helpers.makeCanvas(Math.ceil(Math.max(...pts.map(p=>p.x)))-minX+2,Math.ceil(Math.max(...pts.map(p=>p.y)))-minY+2),g=canvas.getContext('2d');
  g.translate(-minX,-minY);districtObject(g,s,n,exteriorDrawing);
  const image={canvas,x:minX,y:minY};if(exteriorImages.size>160)exteriorImages.clear();exteriorImages.set(key,image);return image;
}
// Low street-facing walls become a glazed shopfront: tiled kick plate, faint glass, mullions and window posters.
function storefront(c,s,n){
  const across=n.w>=n.h,top=58,glass='#d4ece81c',frame='#e3ece0b8';
  box(c,n.x,n.y,n.w,n.h,10,'#3d6b58');box(c,n.x,n.y,n.w,n.h,2,'#d6dccb',10);
  if(across){
    const y=n.y+n.h;front(c,n.x,y+.2,n.w,12,top-12,glass);
    for(let x=n.x;x<=n.x+n.w;x+=TILE)line(c,sp(x,y,12),sp(x,y,top),frame);
    line(c,sp(n.x,y,top),sp(n.x+n.w,y,top),frame,2);
    if(n.w>=2*TILE){front(c,n.x+7,y+.4,14,18,20,'#e9c47a');front(c,n.x+9,y+.6,10,30,5,'#c95d47');front(c,n.x+TILE+8,y+.4,12,16,12,'#9fd0bf');}
  }else{
    const x=n.x+n.w;side(c,x+.2,n.y,n.h,12,top-12,glass);
    for(let y=n.y;y<=n.y+n.h;y+=TILE)line(c,sp(x,y,12),sp(x,y,top),frame);
    line(c,sp(x,n.y,top),sp(x,n.y+n.h,top),frame,2);
  }
}
const fixtureImages=new Map();
function fixtureImage(s,n,now,helpers){
  const ps=Object.keys(PRODUCTS).filter(p=>PRODUCTS[p].fixture===n.id),i=s.interior;
  const key=JSON.stringify([s.layoutVersion,n.id,n.index,ps.map(p=>[s.shelf[p],i?.promos?.[p],i?.stickers?.[p]]),Math.round((i?.tidy?.[n.id]??1)*4),s.rental.inStand,s.boxes.length,
    i?.parcels?.length,i?.baskets?.stack,i?.bins,!!i?.restroom?.by,!!s.checkout,i?.coffee?.by,(i?.coffee?.beans??1)<.2,!!i?.kiosk?.error,!!s.appliances.microwave.by,s.facilities.tobaccoSales,s.trash.map(t=>t.cell)]);
  if(fixtureImages.has(key))return fixtureImages.get(key);
  const pts=Object.values(n.faces).flat(),minX=Math.floor(Math.min(...pts.map(p=>p.x)))-7,minY=Math.floor(Math.min(...pts.map(p=>p.y)))-16;
  const width=Math.ceil(Math.max(...pts.map(p=>p.x)))-minX+8,height=Math.ceil(Math.max(...pts.map(p=>p.y)))-minY+9;
  const canvas=helpers.makeCanvas(width,height),g=canvas.getContext('2d');g.translate(-minX,-minY);equipment(g,s,n,now);
  const image={canvas,x:minX,y:minY};if(fixtureImages.size>180)fixtureImages.clear();fixtureImages.set(key,image);return image;
}
export function renderQuarterScene(c,s,view,helpers){
  const now=view.now??0,key=JSON.stringify([s.layoutVersion,s.day,s.facilities.welcomeMat,daylight(s)<.5,streetLook(s)]);
  if(!floors.has(key)){const cv=helpers.makeCanvas(SCENE_WIDTH,SCENE_HEIGHT);ground(cv.getContext('2d'),s);if(floors.size>3)floors.clear();floors.set(key,cv);}
  c.imageSmoothingEnabled=false;c.drawImage(floors.get(key),0,0);
  const clock=sp(230,33,82);c.fillStyle='#89a397';fillEllipse(c,clock.x,clock.y+1,10,10);c.fillStyle='#f1edd7';fillEllipse(c,clock.x,clock.y,9,9);
  line(c,clock,{x:clock.x+Math.sin(s.clock/720*Math.PI*2)*5,y:clock.y-Math.cos(s.clock/720*Math.PI*2)*5},'#314e46',2);
  line(c,clock,{x:clock.x+Math.sin(s.clock/60*Math.PI*2)*7,y:clock.y-Math.cos(s.clock/60*Math.PI*2)*7},'#314e46');
  if(s.wetness>.05)for(const [x,y]of [[10,13],[11,13],[10,14],[11,14]])flat(c,x*TILE+4,y*TILE+5,24,24,`#89afb0${Math.round(Math.min(.55,s.wetness*.6)*255).toString(16).padStart(2,'0')}`);
  for(const l of s.nuisance?.litter??[])product(c,l.kind==='can'?'beer':'chips',l.cell[0]*TILE+10,l.cell[1]*TILE+12,0,true);
  const nodes=sceneNodes(s,view);
  for(const n of nodes){
    if(n.type==='exterior'){
      if(n.kind==='car'||n.kind==='signal')districtObject(c,s,n,exteriorDrawing,now);
      else{const image=exteriorImage(s,n,helpers);c.globalAlpha=n.faded?.32:1;c.drawImage(image.canvas,image.x,image.y);c.globalAlpha=1;}
    }
    else if(n.type==='fixture'){
      const image=fixtureImage(s,n,now,helpers);c.globalAlpha=n.faded ? .32 : 1;c.drawImage(image.canvas,image.x,image.y);c.globalAlpha=1;
      if(n.id==='coffeeMachine'&&s.interior?.coffee?.by){
        for(let i=0;i<3;i++){const p=sp(n.x+20,n.y+n.h-7,63+(now/160+i*3)%9);c.fillStyle='#e6efcd90';c.fillRect(p.x+i*2,p.y,1,3);}
      }
      if(view.fixture===n.id)polygon(c,faces(n.x,n.y,n.w,n.h,n.height,n.z).top,'#f3d47c35','#e5ca78');
    }else if(n.type==='stool'){
      box(c,n.x+6,n.y+6,4,4,12,'#526e60');box(c,n.x,n.y,n.w,n.h,3,'#78967c',12);
    }else if(n.type==='wall'){
      if(n.height===12&&!(n.h>n.w&&n.x===23*TILE-2))storefront(c,s,n);
      else{box(c,n.x,n.y,n.w,n.h,n.height,P.wall);box(c,n.x,n.y,n.w,n.h,3,P.trim,n.height);}
    }else if(n.type==='planter'){
      box(c,n.x,n.y,n.w,n.h,15,'#8d7961');flat(c,n.x+3,n.y+3,n.w-6,n.h-6,'#4d5040',15);
      const foliage=seasonAt(s).leaf;
      for(let i=0;i<4;i++){
        box(c,n.x+4+i*12,n.y+4,9,11,14+i%2*4,i%2?foliage:tint(foliage,14),15);
        if(s.weather.kind==='snow')flat(c,n.x+4+i*12,n.y+4,9,11,'#dbe5de',29+i%2*4);
      }
    }else if(n.type==='doorway')doorway(c,s,n);else if(n.type==='truck')truck(c,s);else drawPerson(c,s,n,view,helpers);
  }
  if(s.interior?.wetSign){const p=sp(12*TILE+20,14*TILE-8);polygon(c,[{x:p.x-6,y:p.y},{x:p.x+1,y:p.y-20},{x:p.x+10,y:p.y-14},{x:p.x+6,y:p.y+3}],'#dbc66e','#7e885a');}
  for(let i=0;i<Math.min(4,s.interior?.curbBags??0);i++)box(c,580+i*14,557,12,10,12,'#53675d');
  const dl=daylight(s);
  if(dl<.7){
    polygon(c,quad(0,15*TILE,WIDTH,3*TILE),'#0d233440');
    const rooms=shaped(s)?STORE_ROOMS:[{x:1,y:1,w:22,h:14}];
    for(const r of rooms)polygon(c,quad(r.x*TILE,r.y*TILE,r.w*TILE,r.h*TILE),s.facilities.warmLight?'#ffe0a512':'#eae8bb08');
  }
  districtOverlay(c,s,exteriorDrawing);
  districtWeather(c,s,now,exteriorDrawing);
}
