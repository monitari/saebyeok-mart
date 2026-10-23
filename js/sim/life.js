import { generatePerson, makeGenes, uniqueLabels } from '../mind/genes.js';
import { addEvent, remember, learnName, adjust } from '../mind/memory.js';

export const LIFE_CHANGES=[
  {kind:'early',title:'일찍 시작하는 한 주',news:'이번 주는 출근 시간이 좀 빨라졌어요.',offset:-90,hurry:18,fatigue:10},
  {kind:'rest',title:'조금 여유로운 한 주',news:'이번 주는 잠깐 쉬고 있어요.',offset:60,hurry:-25,fatigue:-15},
  {kind:'study',title:'바쁜 한 주',news:'이번 주는 준비할 게 많아서 늦게 와요.',offset:100,hurry:15,fatigue:20},
  {kind:'taste',title:'달라진 작은 취향',news:'요즘은 커피 대신 물을 마셔요.',favorite:'water',hurry:0,fatigue:0}
];
export function effectiveLife(s,p){
  const life=p.genes.life,c=p.lifeChange;
  if(!c||s.day<c.start||s.day>=c.end)return life;
  const d=LIFE_CHANGES[c.kindIndex];
  return {...life,windows:life.windows.map(([a,b])=>{const start=a+(d.offset??0),normal=((start%1440)+1440)%1440;return [normal,normal+b-a];}),favorites:d.favorite?[d.favorite,...life.favorites.filter(p=>p!==d.favorite)]:life.favorites};
}
export function weeklyLife(s){
  const week=Math.floor((s.day-1)/7)+1;
  if(week<2||s.lastLifeWeek===week)return;
  s.lastLifeWeek=week;
  const customers=Object.values(s.people).filter(p=>p.kind==='customer'&&!p.groups.length&&!s.actors[p.id]);
  if(customers.length){
    const p=customers[(s.seed+week*7)%customers.length],kindIndex=(s.seed+week)%LIFE_CHANGES.length;
    p.lifeChange={start:s.day,end:s.day+6,kindIndex,toldTo:[]};
    (s.lifeHistory??=[]).push({day:s.day,id:p.id,title:LIFE_CHANGES[kindIndex].title});
  }
  if(Object.keys(s.people).length<40){
    const id=`week${week}`,def=generatePerson((s.seed+week*7919)>>>0,id,new Set(Object.values(s.people).map(p=>p.name)));
    const p={id,name:def.name,kind:'customer',generated:true,genes:makeGenes(def),skills:null,status:{fatigue:25,hunger:40,hurry:20,mood:65,action:'집에 있음'},visits:0,lastVisitAt:-99999,groups:[],introducedDay:s.day};
    s.people[id]=p;s.memories[id]=[];s.relations[id]={};s.names[id]={};s.reputation[id]=50;
    if(week%3===0){
      const neighbor=Object.values(s.people).find(other=>other.id!==id&&other.generated&&!other.groups.length&&!s.actors[other.id]);
      if(neighbor){
        const groupId=`walk${week}`;p.genes.life.windows=structuredClone(neighbor.genes.life.windows);
        s.groups.push({id:groupId,name:'산책을 함께하는 이웃',kind:'friends',members:[neighbor.id,id],purpose:'산책 끝에 장보기',subsets:[[[neighbor.id,id],3],[[neighbor.id],2],[[id],2]],leaveTogether:true,payMode:'separate',frequency:.7});
        p.groups.push(groupId);neighbor.groups.push(groupId);learnName(s,id,neighbor.id);learnName(s,neighbor.id,id);
        for(const [a,b]of [[id,neighbor.id],[neighbor.id,id]]){
          remember(s,a,{kind:'fact',about:[b],text:'동네 산책을 하며 알게 된 이웃이다.',source:'self',importance:.4});
          adjust(s,a,b,{fam:25,trust:10,bond:4});
        }
      }
    }
    const labels=uniqueLabels(Object.values(s.people));for(const person of Object.values(s.people))person.label=labels[person.id];
    (s.lifeHistory??=[]).push({day:s.day,id,title:'동네에 새로 온 사람'});
  }
  s.lifeHistory=(s.lifeHistory??[]).slice(-20);
}
export function tellLifeNews(s,customer,worker){
  const p=s.people[customer],c=p.lifeChange;if(!c)return;
  const title=LIFE_CHANGES[c.kindIndex].title;
  const e=addEvent(s,'life_news',{actors:[customer,worker],importance:.5,data:{customer,worker,title}});
  for(const id of e.witnesses)remember(s,id,{eventId:e.id,about:[customer],text:id===customer?`이번 주는 ${title}.`:`${p.label}에게 이번 주 생활이 달라졌다는 말을 들었다.`,importance:.45,source:id===customer?'self':'told',sourceId:customer});
  c.toldTo.push(worker);
}
export function finishDay(s){
  const day=s.sales.day,events=s.events.filter(e=>e.day===day),first=events.filter(e=>e.type==='arrival'&&e.actors.some(id=>s.people[id]?.firstVisitDay===day));
  const entry={day,revenue:s.sales.revenue,customers:s.sales.customers,firstVisitors:new Set(first.flatMap(e=>e.actors)).size,
    returned:events.filter(e=>e.type==='umbrella_return').length,open:s.obligations.filter(o=>o.status==='open').length,
    highlights:events.filter(e=>e.importance>=.5).slice(-4).map(e=>e.type)};
  (s.journal??=[]).push(entry);if(s.journal.length>14)s.journal.shift();
}
