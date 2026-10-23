// Existing skills still control duration. Habits control when a worker starts routine upkeep.
export function workerStyle(p){
  const meticulous=p.genes.temperament.meticulous,skills=p.skills??{};
  const labels={checkout:'계산',stocking:'진열',cleaning:'청소',service:'응대'};
  const strongest=Object.keys(labels).sort((a,b)=>(skills[b]??0)-(skills[a]??0))[0];
  return {strongest,label:labels[strongest],restockAt:.2+(skills.stocking??50)/600+meticulous/1200,tidyAt:.35+meticulous/400,mopAt:.55-meticulous/1000,
    description:{checkout:'계산을 빠르게 처리하는 편이에요.',stocking:'빈칸이 커지기 전에 진열을 채우는 편이에요.',cleaning:'청소 작업에 능숙해요.',service:'손님에게 먼저 말을 걸고 응대하는 편이에요.'}[strongest]};
}
