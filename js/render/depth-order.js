// Painter constraints use floor footprints, not the centre of a long shelf.
// Screen-separated objects need no dependency. A stable depth fallback handles ties.
export function orderSceneNodes(nodes){
  const ordered=[...nodes].sort((a,b)=>a.depth-b.depth||a.type.localeCompare(b.type)||a.id.localeCompare(b.id));
  const edges=ordered.map(()=>[]),degree=ordered.map(()=>0);
  for(let i=0;i<ordered.length;i++)for(let j=i+1;j<ordered.length;j++){
    const a=ordered[i],b=ordered[j],A=a.bounds,B=b.bounds,R=a.screen,S=b.screen;
    if(!A||!B||!R||!S||R.right<S.left||S.right<R.left||R.bottom<S.top||S.bottom<R.top)continue;
    let ab=A.right<=B.left+.01||A.bottom<=B.top+.01;
    let ba=B.right<=A.left+.01||B.bottom<=A.top+.01;
    if(!ab&&!ba&&a.type==='fixture'&&b.type==='fixture'&&a.z!==b.z){ab=a.z+a.height<=b.z;ba=b.z+b.height<=a.z;}
    if(ab===ba)continue;
    const from=ab?i:j,to=ab?j:i;edges[from].push(to);degree[to]++;
  }
  const result=[],done=new Set();
  while(result.length<ordered.length){
    let i=degree.findIndex((n,i)=>n===0&&!done.has(i));
    if(i<0)i=degree.findIndex((_,i)=>!done.has(i));
    done.add(i);result.push(ordered[i]);for(const next of edges[i])degree[next]--;
  }
  return result;
}
