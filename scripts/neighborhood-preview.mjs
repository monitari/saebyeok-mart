import {writeFileSync} from 'node:fs';
import {PixelCanvas,png} from './pixel-canvas.mjs';
import {initialState} from '../web/js/sim/sim.js';
import {renderScene} from '../web/js/render/art.js';
import {SCENE_WIDTH,SCENE_HEIGHT} from '../web/js/render/projection.js';
globalThis.OffscreenCanvas=PixelCanvas;
for(const [name,day,weather,hour]of [['spring',1,'clear',12],['summer',29,'storm',21],['autumn',57,'cloudy',16],['winter',85,'snow',17]]){
  const s=initialState();s.clock=(day-1)*1440+hour*60;s.day=day;s.weather.kind=weather;
  const before=JSON.stringify(s),cv=new PixelCanvas(SCENE_WIDTH,SCENE_HEIGHT);
  renderScene(cv.getContext('2d'),s,{now:1234,selected:'yuna'});
  if(JSON.stringify(s)!==before)throw Error('Renderer mutated state');
  writeFileSync(`reports/neighborhood-${name}.png`,png(cv));console.log(`${name}: ${SCENE_WIDTH}x${SCENE_HEIGHT}`);
}
