// Clockwise headings in logical floor coordinates. Cardinal names stay save-compatible.
export const DIRECTIONS=['right','down-right','down','down-left','left','up-left','up','up-right'];
export const DIRECTION_VECTORS={right:[1,0],'down-right':[1,1],down:[0,1],'down-left':[-1,1],left:[-1,0],'up-left':[-1,-1],up:[0,-1],'up-right':[1,-1]};
export function directionFromVector(dx,dy,fallback='down'){
  if(Math.hypot(dx,dy)<.01)return fallback;
  return DIRECTIONS[(Math.round(Math.atan2(dy,dx)/(Math.PI/4))+8)%8];
}
