import {writeFileSync} from 'node:fs';
import {PixelCanvas,png} from './pixel-canvas.mjs';
import {initialState} from '../web/js/sim/sim.js';
import {drawPerson} from '../web/js/render/art.js';
import {pixelText} from '../web/js/render/pixel.js';
// Screen headings, clockwise. Preview is enlarged by integer nearest-neighbour pixels.
const dirs=['up','up-right','right','down-right','down','down-left','left','up-left'];
const s=initialState(),cv=new PixelCanvas(576,360),c=cv.getContext('2d');
c.fillStyle='#e0ddc7';c.fillRect(0,0,cv.width,cv.height);
const people=['yuna','minseo','harin','sunja'].map(id=>s.people[id]);
for(let row=0;row<people.length;row++)for(let col=0;col<8;col++){
  c.save();c.translate(36+col*72,78+row*88);
  drawPerson(c,people[row].genes.appearance,{dir:dirs[col],action:'idle',walking:row===1,frame:1,mood:75});c.restore();
  if(!row){c.fillStyle='#34473e';pixelText(c,['N','NE','E','SE','S','SW','W','NW'][col],29+col*72,10,8);}
}
const out=new PixelCanvas(cv.width*2,cv.height*2);out.getContext('2d').drawImage(cv,0,0,out.width,out.height);
writeFileSync('reports/eight-directions.png',png(out));console.log('8 screen headings, four people; 2x nearest-neighbour preview.');
