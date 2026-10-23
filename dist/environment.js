// Derived from simulation time, never the computer clock or the store's random stream.
export const SEASON_DAYS=28;
export const SEASONS=[
  {id:'spring',label:'봄',leaf:'#9bb783',flower:'#e7b6be',grass:'#8b9e78'},
  {id:'summer',label:'여름',leaf:'#457e58',flower:'#e4c96c',grass:'#658662'},
  {id:'autumn',label:'가을',leaf:'#bb7c49',flower:'#d4a15f',grass:'#9b926b'},
  {id:'winter',label:'겨울',leaf:'#8c9790',flower:'#d5ddd6',grass:'#929d93'}
];
export function seasonAt(s){return SEASONS[Math.floor(Math.max(0,Math.floor(s.clock/1440))/SEASON_DAYS)%4];}
export const hourOf=s=>((s.clock%1440)+1440)%1440/60;
export function environmentAt(s){
  const season=seasonAt(s),hour=hourOf(s);
  // Street lights and lit signs run a little past dawn and switch on before full dark.
  return {season,hour,night:hour<6||hour>=19,lights:hour<6.25||hour>=18.5,wet:['rain','storm'].includes(s.weather.kind),snow:s.weather.kind==='snow',storm:s.weather.kind==='storm'};
}
// Opening hours may wrap past midnight ([16,2]); [0,24] never closes.
export function shopOpen(p,s){if(!p.hours)return true;const [a,b]=p.hours,h=hourOf(s);return a<b?h>=a&&h<b:h>=a||h<b;}
// Decorative variety (lit windows, parked cars) from a hash, never from the store's random streams.
export function noise(...v){let h=2166136261;for(const ch of v.join(','))h=Math.imul(h^ch.charCodeAt(0),16777619);h^=h>>>13;h=Math.imul(h,0x5bd1e995);return ((h^h>>>15)>>>0)/4294967296;}
export function weatherChoices(s){
  const season=seasonAt(s).id,cur=s.weather.kind;
  if(season==='winter')return cur==='snow'?[['snow',4],['cloudy',4],['clear',2]]:[['clear',5],['cloudy',3],['snow',2]];
  if(season==='summer')return cur==='storm'?[['rain',4],['cloudy',2]]:[['clear',4],['cloudy',3],['rain',2],['storm',.5]];
  return cur==='clear'?[['clear',6],['cloudy',3],['rain',1]]:cur==='cloudy'?[['clear',5],['cloudy',3],['rain',1]]:cur==='rain'?[['cloudy',4],['rain',2],['storm',.5],['clear',3]]:[['rain',4],['cloudy',2]];
}

export const DISTRICT={x:-256,y:-192,w:1312,h:1056,roadY:592,roadH:160};
// Keep the established pedestrian lanes (y=520..568) completely clear.
// Shops have a ground-floor store and homes upstairs; `hours` drive shutters, awnings and lit signs.
export const STREET_PROPS=[
  {id:'bakery',kind:'shop',backdrop:true,x:-224,y:48,w:176,h:160,height:150,color:'#ae8871',sign:'BREAD & CO',awning:'#b47561',hours:[7,22]},
  {id:'laundry',kind:'shop',backdrop:true,x:144,y:-176,w:224,h:128,height:146,color:'#8caaa6',sign:'LAUNDRY 24',awning:'#5d8d90',hours:[0,24]},
  {id:'chicken',kind:'shop',backdrop:true,x:832,y:-176,w:192,h:160,height:176,color:'#b59c7c',sign:'CHICKEN',awning:'#b85a43',hours:[16,2],neon:'KARAOKE'},
  {id:'parking',kind:'parking',backdrop:true,x:816,y:0,w:224,h:104,height:2},
  {id:'florist',kind:'shop',x:816,y:128,w:192,h:176,height:140,color:'#9eaa8b',sign:'FLOWER',awning:'#7a9162',hours:[9,20]},
  // The shop's own frontage: pole sign, terrace tables and a delivery scooter, all off the walking rows.
  {id:'pylon',kind:'pylon',x:4,y:436,w:14,h:14,height:150},
  {id:'parasol-a',kind:'parasol',x:494,y:426,w:40,h:40,height:70,fade:true},
  {id:'parasol-b',kind:'parasol',x:594,y:432,w:40,h:40,height:70,fade:true},
  {id:'scooter',kind:'scooter',x:446,y:488,w:36,h:14,height:40},
  {id:'signal-north',kind:'signal',x:-20,y:572,w:8,h:8,height:98},
  {id:'signal-south',kind:'signal',x:66,y:764,w:8,h:8,height:98},
  {id:'bus-stop',kind:'busStop',x:688,y:778,w:100,h:28,height:74},
  {id:'pole-west',kind:'pole',x:-136,y:846,w:8,h:8,height:96},
  {id:'pole-mid',kind:'pole',x:296,y:846,w:8,h:8,height:96},
  {id:'pole-east',kind:'pole',x:880,y:846,w:8,h:8,height:96},
  {id:'tree-west',kind:'tree',x:-152,y:408,w:48,h:48,height:108},
  {id:'tree-east',kind:'tree',x:872,y:424,w:48,h:48,height:108},
  {id:'tree-south',kind:'tree',x:600,y:792,w:48,h:48,height:108},
  {id:'bed-west',kind:'bed',x:-208,y:348,w:128,h:40,height:14},
  {id:'bed-east',kind:'bed',x:824,y:344,w:160,h:40,height:14},
  {id:'bed-south',kind:'bed',x:104,y:800,w:176,h:32,height:14},
  {id:'bench-west',kind:'bench',x:-80,y:432,w:64,h:22,height:32},
  {id:'bench-east',kind:'bench',x:784,y:456,w:64,h:22,height:32},
  {id:'bench-south',kind:'bench',x:344,y:792,w:80,h:24,height:32},
  {id:'bin-west',kind:'bin',x:-24,y:478,w:20,h:20,height:32},
  {id:'bin-east',kind:'bin',x:960,y:476,w:20,h:20,height:32},
  {id:'lamp-west',kind:'lamp',x:-48,y:572,w:8,h:8,height:116},
  {id:'lamp-east',kind:'lamp',x:800,y:572,w:8,h:8,height:116},
  {id:'lamp-south',kind:'lamp',x:480,y:776,w:8,h:8,height:116}
];
export function exteriorNodes(s){
  const nodes=STREET_PROPS.filter(p=>!p.backdrop).map(p=>({...p,type:'exterior',depth:p.x+p.y+(p.w+p.h)/2}));
  const night=environmentAt(s).night;
  for(let i=0;i<(night?2:3);i++){
    const phase=((s.elapsed*(i===1?34:28)+(s.seed%911)+i*463)%1552+1552)%1552;
    const x=i===1?1120-phase:-352+phase,y=i===1?692:620;
    if(x<DISTRICT.x||x+74>DISTRICT.x+DISTRICT.w)continue;
    nodes.push({type:'exterior',kind:'car',id:`car-${i}`,x,y,w:74,h:30,height:32,direction:i===1?-1:1,color:['#9dafb3','#b88a72','#78918a'][i],depth:x+y+52});
  }
  return nodes;
}
