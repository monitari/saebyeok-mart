import { DIRECTION_VECTORS,directionFromVector } from '../sim/directions.js';
// Logical store coordinates remain in 32px tiles. Only the presentation is isometric.
// ISO_Y*TILE is a whole 12px, so every floor tile is an exact 48x24 diamond with clean 2:1 pixel stairs.
export const SCENE_WIDTH=1832, SCENE_HEIGHT=1056;
export const ISO_X=.75, ISO_Y=.375, ORIGIN_X=860, ORIGIN_Y=270;
// The neighborhood includes the rear shops, both sidewalks and a two-lane road.
export const FIT_WIDTH=1800, FIT_HEIGHT=1036;
export function project(x,y,z=0){return {x:ORIGIN_X+(x-y)*ISO_X,y:ORIGIN_Y+(x+y)*ISO_Y-z};}
export function unproject(x,y){const dx=(x-ORIGIN_X)/ISO_X,dy=(y-ORIGIN_Y)/ISO_Y;return {x:(dx+dy)/2,y:(dy-dx)/2};}
export const floorQuad=(x,y,w,h,z=0)=>[project(x,y,z),project(x+w,y,z),project(x+w,y+h,z),project(x,y+h,z)];
export function boxFaces(x,y,w,h,height,z=0){
  const b=floorQuad(x,y,w,h,z),t=floorQuad(x,y,w,h,z+height);
  return {top:t,left:[t[3],t[2],b[2],b[3]],right:[t[2],t[1],b[1],b[2]]};
}
export function inPolygon(p,poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i],b=poly[j],cross=(p.x-a.x)*(b.y-a.y)-(p.y-a.y)*(b.x-a.x);
    if(Math.abs(cross)<1e-6&&p.x>=Math.min(a.x,b.x)-1e-6&&p.x<=Math.max(a.x,b.x)+1e-6&&p.y>=Math.min(a.y,b.y)-1e-6&&p.y<=Math.max(a.y,b.y)+1e-6)return true;
    if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}
// Screen-facing sprite headings follow the two diagonals of the floor.
export function screenDirection(dir){const [x,y]=DIRECTION_VECTORS[dir]??[0,1];return directionFromVector((x-y)*ISO_X,(x+y)*ISO_Y);}
