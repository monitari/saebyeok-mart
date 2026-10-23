// Isolated local smoke test. Never attaches to a user's browser profile or game save.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
const root=path.resolve('dist'),delay=ms=>new Promise(r=>setTimeout(r,ms));
const server=createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep))throw Error('path');
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
    res.end(await readFile(file));
  }catch{res.statusCode=404;res.end();}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const profile=await mkdtemp(path.join(tmpdir(),'saebyeok-render-'));
const chrome=spawn(process.env.CHROME_PATH??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
  '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'
],{windowsHide:true,stdio:'ignore'});
let ws,seq=0;const pending=new Map(),errors=[];
const call=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(`Timed out: ${method}`));},15000);
  pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params}));
});
try{
  let port;
  for(let i=0;i<100;i++){try{port=Number((await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await delay(100);}}
  assert.ok(port,'headless browser started');
  const tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await once(ws,'open');
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(Error(JSON.stringify(m.error)));else p?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text+': '+(m.params.exceptionDetails.exception?.description??''));});
  await call('Runtime.enable');await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/?dev`});
  const evaluate=async expression=>{
    const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;
  };
  for(let i=0;i<100;i++){if(await evaluate("!!document.getElementById('welcome')?.open"))break;await delay(100);}
  await evaluate("document.getElementById('welcome-skip').click()");await delay(1800);
  assert.equal(await evaluate("document.getElementById('welcome').open"),false);
  const result=await evaluate(`(async()=>{
    const {initialState,step}=await import('/sim.js'),{renderScene,hitTestScene}=await import('/art.js');
    const {FIXTURES,center}=await import('/world.js'),{project,SCENE_WIDTH,SCENE_HEIGHT}=await import('/projection.js');
    const s=initialState();for(let i=0;i<400;i++)step(s,.1);
    const cv=document.createElement('canvas');cv.width=SCENE_WIDTH;cv.height=SCENE_HEIGHT;
    renderScene(cv.getContext('2d'),s,{now:1234,selected:'yuna'});
    const f=FIXTURES.atm,p=project(f.x*32+16,(f.y+1)*32-2,31);
    return {layout:s.layoutVersion,atm:hitTestScene(s,p.x,p.y),image:cv.toDataURL('image/png'),canvas:document.getElementById('scene').width,scroll:document.documentElement.scrollWidth};
  })()`);
  assert.equal(result.layout,5);assert.equal(result.atm?.id,'atm');assert.ok(result.canvas>0);assert.ok(result.scroll<=1440);
  await writeFile('reports/quarter-browser-scene.png',Buffer.from(result.image.split(',')[1],'base64'));
  const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile('reports/quarter-browser-desktop.png',Buffer.from(shot.data,'base64'));
  // Operate the real controls against the isolated game's state.
  const controls=await evaluate(`(async()=>{
    __game.setPaused(true);
    const click=q=>{const e=document.querySelector(q);if(!e)throw Error('Missing '+q);e.click();};
    const change=(q,value)=>{const e=document.querySelector(q);if(!e)throw Error('Missing '+q);e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}));};
    const check=(v,m)=>{if(!v)throw Error(m);};
    click('[data-zoom="fit"]');const districtZoom=document.getElementById('zoom-level').textContent;
    click('[data-zoom="store"]');check(document.getElementById('zoom-level').textContent!==districtZoom,'store view zooms in');
    click('[data-zoom="fit"]');check(document.getElementById('zoom-level').textContent===districtZoom,'district view restored');
    check(document.getElementById('weather').textContent.includes('봄'),'season appears in HUD');
    change('#order-mode','approval');check(__game.state.management.mode==='approval','mode');
    click('[data-ops-tab="stock"]');click('[data-draft="create"]');
    const first=Object.keys(__game.state.management.draft.items)[0];check(!!first,'draft contents');
    change('[data-draft-qty="'+first+'"]','1');check(__game.state.management.draft.items[first]===1,'quantity');
    const cost=(await import('/management.js')).draftCost(__game.state),before=__game.state.money;
    click('[data-draft="approve"]');check(__game.state.money===before-cost,'atomic approval');check(__game.state.management.draft===null,'draft cleared');
    change('#order-mode','manual');change('[data-order-qty="coffee"]','3');const coffee=__game.state.orders.pending.coffee??0;click('[data-order="coffee"]');check(__game.state.orders.pending.coffee===coffee+3,'manual quantity');
    click('[data-ops-tab="facilities"]');click('[data-install="welcomeMat"]');check(__game.state.facilities.welcomeMat,'facility');
    click('[data-ops-tab="work"]');change('[data-policy="priority"]','stock');check(__game.state.management.priority==='stock','priority');
    click('[data-open-person="'+__game.state.onDuty+'"]');check(!document.getElementById('panel-person').hidden,'person panel');click('.back-to-ops');check(!document.getElementById('panel-ops').hidden,'return');
    click('[data-ops-tab="stock"]');click('#ops-expand');check(document.getElementById('operations-wide').open,'wide view');
    const {parseSave,exportText}=await import('/save.js');check(parseSave(exportText(__game.state)).management.mode==='manual','save');
    return {approval:true,manual:true,facility:true,priority:true,personReturn:true,save:true};
  })()`);
  const opsShot=await call('Page.captureScreenshot',{format:'png'});await writeFile('reports/operations-wide.png',Buffer.from(opsShot.data,'base64'));
  await evaluate("document.getElementById('operations-close').click()");
  const renewal=await evaluate(`(async()=>{
    const click=q=>{const e=document.querySelector(q);if(!e)throw Error('Missing '+q);e.click();};
    const check=(v,m)=>{if(!v)throw Error(m);};
    check(document.querySelectorAll('#store-pulse button').length===4,'four actionable status tiles');
    const person=document.querySelector('#floor-people [data-open-person]');check(!!person,'live people');person.click();
    click('#store-pulse [data-ops-tab=stock]');check(!document.getElementById('panel-ops').hidden,'status tile opens operations from person panel');
    const category=document.querySelector('[data-stock-category]');category.value='dessertCooler';category.dispatchEvent(new Event('change',{bubbles:true}));
    check(document.querySelectorAll('[data-stock-check]').length===2,'dessert category');
    check(document.querySelector('[data-order=pudding]'),'new menu can be ordered');click('[data-stock-clear]');
    click('#store-pulse [data-locate-fixture=restroom]');check(__game.ui.fixture==='restroom','restroom location');
    click('[data-zoom=fit]');click('[data-stock-clear]');
    const {step}=await import('/sim.js');for(let i=0;i<400;i++)step(__game.state,.1);
    click('#store-pulse [data-ops-tab=overview]');
    check(document.querySelector('.receipt-row'),'real payment receipt visible');
    check(document.querySelector('.floor-people button small').textContent.length>0,'real actor status');
    return {statusTiles:true,people:true,categories:true,restroom:true,receipts:true};
  })()`);
  await evaluate("document.getElementById('inspector-body').scrollTop=0;scrollTo(0,0)");await delay(150);
  const renewedShot=await call('Page.captureScreenshot',{format:'png'});await writeFile('reports/store-renewal-desktop.png',Buffer.from(renewedShot.data,'base64'));
  const stockTools=await evaluate(`(async()=>{
    const click=q=>{const e=document.querySelector(q);if(!e)throw Error('Missing '+q);e.click();};
    const change=(q,value)=>{const e=document.querySelector(q);if(!e)throw Error('Missing '+q);e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}));};
    const check=(v,m)=>{if(!v)throw Error(m);};
    click('[data-ops-tab="stock"]');click('[data-stock-favorite="coffee"]');check(__game.state.management.favorites.includes('coffee'),'favorite added');
    change('[data-stock-filter]','favorites');check(document.querySelectorAll('[data-stock-check]').length===1,'favorite filter');
    click('[data-stock-select="visible"]');check(__game.ui.stockSelected.length===1,'select visible');
    change('[data-bulk-mode]','approval');click('[data-stock-batch="mode"]');check(__game.state.management.overrides.coffee==='approval','batch mode');
    const water=__game.state.orders.par.water;change('[data-bulk-par]','9');click('[data-stock-batch="par"]');check(__game.state.orders.par.coffee===9&&__game.state.orders.par.water===water,'batch target scoped');
    change('[data-bulk-par]','');click('[data-stock-batch="par"]');check(__game.state.orders.par.coffee===9,'empty target must not mean zero');
    document.querySelector('[data-stock-reason="coffee"] summary').click();
    click('[data-stock-select="clear"]');check(document.querySelector('[data-stock-reason="coffee"]').open,'reason disclosure preserved');
    const qty=document.querySelector('[data-order-qty="coffee"]');qty.value='5';qty.dispatchEvent(new Event('input',{bubbles:true}));
    const cost=(await import('/data.js')).PRODUCTS.coffee.cost*5;check(document.querySelector('[data-order-cost="coffee"]').textContent.includes(cost.toLocaleString('ko-KR')),'live order estimate');
    qty.dispatchEvent(new Event('change',{bubbles:true}));click('[data-stock-select="visible"]');change('[data-bulk-par]','9');
    const {parseSave,exportText}=await import('/save.js');check(parseSave(exportText(__game.state)).management.favorites.includes('coffee'),'favorite saved');
    document.querySelector('.bulk-tools').scrollIntoView({block:'center'});
    return {favorite:true,filter:true,batchMode:true,batchPar:true,blankParGuard:true,estimate:true,reasons:true};
  })()`);
  const bulkShot=await call('Page.captureScreenshot',{format:'png'});await writeFile('reports/operations-bulk.png',Buffer.from(bulkShot.data,'base64'));
  await evaluate("document.querySelector('[data-stock-select=clear]').click();const filter=document.querySelector('[data-stock-filter]');filter.value='all';filter.dispatchEvent(new Event('change',{bubbles:true}));scrollTo(0,0)");
  const insights=await evaluate(`(async()=>{
    const click=q=>{const e=document.querySelector(q);if(!e)throw Error('Missing '+q);e.click();};
    const check=(v,m)=>{if(!v)throw Error(m);};
    click('[data-ops-tab="review"]');check(document.getElementById('ops-view').textContent.includes('입구 매트'),'facility feedback');
    const {returnSummary}=await import('/operations-insights.js'),{settleOffline}=await import('/sim.js');
    const now=Date.now(),memories=JSON.stringify(__game.state.memories);
    const report=settleOffline(__game.state,now,now-600000);check(report.items>0,'real offline settlement');
    __game.ui.returnSummary=returnSummary(__game.state,report);__game.ui.returnDismissed=false;
    check(JSON.stringify(__game.state.memories)===memories,'summary must not teach NPCs');
    click('[data-ops-tab="overview"]');check(!!document.querySelector('.return-card'),'return summary visible');
    click('[data-return-dismiss]');check(!document.querySelector('.return-card'),'dismiss');
    click('[data-return-show]');check(!!document.querySelector('.return-card'),'reopen');
    const waiting=document.querySelector('[data-alert-group="waiting"]');waiting.open=true;
    click('[data-ops-tab="overview"]');check(document.querySelector('[data-alert-group="waiting"]').open,'disclosure survives refresh');
    check(document.querySelectorAll('[data-alert-group]').length===3,'three alert priorities');
    return {feedback:true,returnSummary:true,dismiss:true,noInventedMemories:true,alertPriorities:true};
  })()`);
  const returnShot=await call('Page.captureScreenshot',{format:'png'});await writeFile('reports/operations-return.png',Buffer.from(returnShot.data,'base64'));
  await evaluate("document.querySelector('[data-return-dismiss]').click();document.querySelector('[data-ops-tab=review]').click()");
  const feedbackShot=await call('Page.captureScreenshot',{format:'png'});await writeFile('reports/operations-feedback.png',Buffer.from(feedbackShot.data,'base64'));
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true});await delay(500);
  const mobile=await evaluate("({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,canvas:document.getElementById('scene').width})");
  await evaluate("document.querySelector('.sheet-tabs [data-panel=ops]').click();document.querySelector('[data-ops-tab=stock]').click()");
  await delay(350);
  const mobileTools=await evaluate(`(()=>{
    const body=document.getElementById('inspector-body');body.scrollTop=200;
    const nav=document.querySelector('.ops-nav').getBoundingClientRect(),area=body.getBoundingClientRect();
    if(nav.top<area.top-1||nav.top>area.top+2)throw Error('Operations navigation must remain visible while scrolling');
    document.querySelector('[data-ops-tab=work]').click();
    for(const detail of document.querySelectorAll('#ops-view details'))detail.open=true;
    const p=document.getElementById('panel-ops');if(p.scrollWidth>p.clientWidth)throw Error('Work status overflow');
    document.querySelector('[data-ops-tab=stock]').click();body.scrollTop=0;
    return {stickyNav:true,workTable:true};
  })()`);
  const mobileShot=await call('Page.captureScreenshot',{format:'png'});await writeFile('reports/operations-mobile.png',Buffer.from(mobileShot.data,'base64'));
  const sheet=await evaluate("(()=>{const p=document.getElementById('panel-ops');return {width:p.clientWidth,scroll:p.scrollWidth,visible:!p.hidden,open:document.getElementById('inspector').classList.contains('open')}})()");
  assert.ok(sheet.visible&&sheet.open);assert.ok(sheet.scroll<=sheet.width);
  assert.ok(mobile.scroll<=mobile.width);assert.ok(mobile.canvas>0);assert.deepEqual(errors,[]);
  await evaluate("document.getElementById('sheet-handle').click();document.querySelector('[data-zoom=fit]').click()");await delay(300);
  const mapSize=await evaluate("({height:document.getElementById('viewport').clientHeight,width:document.documentElement.scrollWidth})");assert.ok(mapSize.height>=150);assert.ok(mapSize.width<=390);
  const mapShot=await call('Page.captureScreenshot',{format:'png'});await writeFile('reports/store-renewal-mobile.png',Buffer.from(mapShot.data,'base64'));
  console.log(JSON.stringify({desktop:'1440x1000',mobile,sheet,controls,stockTools,mobileTools,insights,renewal,layout:result.layout,atmPick:result.atm.id,runtimeErrors:errors}));
}finally{
  if(ws?.readyState===WebSocket.OPEN){try{await call('Browser.close');}catch{}ws.close();}
  if(chrome.exitCode===null)chrome.kill();
  server.closeAllConnections();server.close();
}
