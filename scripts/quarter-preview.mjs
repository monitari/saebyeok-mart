import {writeFileSync} from 'node:fs';
import {PixelCanvas,png} from './pixel-canvas.mjs';
globalThis.OffscreenCanvas=PixelCanvas;
const {initialState,step,setFacility}=await import('../dist/sim.js');
const {renderScene}=await import('../dist/art.js');
const {SCENE_WIDTH,SCENE_HEIGHT}=await import('../dist/projection.js');
const s=initialState();
const render=(name,state,selected='yuna')=>{
  const before=JSON.stringify(state),canvas=new PixelCanvas(SCENE_WIDTH,SCENE_HEIGHT);
  renderScene(canvas.getContext('2d'),state,{now:state.elapsed*1000,selected});
  if(JSON.stringify(state)!==before)throw new Error('Renderer changed game state');
  writeFileSync(`reports/quarter-${name}.png`,png(canvas));console.log(`${name}: ${canvas.width}x${canvas.height}`);
};
render('opening',s);
setFacility(s,'tobaccoSales',true);setFacility(s,'extraTable',true);setFacility(s,'selfCheckout',true);
for(let i=0;i<400;i++)step(s,.1);
render('busy',s,'doyun');
const day=structuredClone(s);day.clock=12*60;day.weather.kind='clear';render('day',day);
console.log('Standalone raster QA only; browser layout, fonts and input still require a browser.');
