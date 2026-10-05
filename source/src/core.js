/* Moontrace: offline, dependency-free, auditable inference. No remote requests. */
(() => {
'use strict';
const VERSION = 2, STORAGE_KEY = 'moontrace-v3', MAX_EVENTS = 600;
const $ = id => document.getElementById(id);
const clone = obj => JSON.parse(JSON.stringify(obj));
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const uid = () => 'e'+Date.now().toString(36)+Math.random().toString(36).slice(2,9);
const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2,'0');
const finite = x => typeof x === 'number' && Number.isFinite(x);
const ICONS = {
 'plus':'<path d="M8 3v10M3 8h10"/>', 'chevron-right':'<path d="m6 3 5 5-5 5"/>',
 'arrow-right':'<path d="M3 8h10m-4-4 4 4-4 4"/>','arrow-down-left':'<path d="M12 3v5a3 3 0 0 1-3 3H3m3-3-3 3 3 3"/>',
 'download':'<path d="M8 2v8m-3-3 3 3 3-3M3 10v3h10v-3"/>','upload':'<path d="M8 11V3m-3 3 3-3 3 3M3 11v3h10v-3"/>',
 'book':'<path d="M8 4v10M8 4C6 2 3 2 1.5 3v10C4 12 6 12 8 14c2-2 4-2 6.5-1V3C12 2 10 2 8 4Z"/>',
 'settings':'<path d="M2 4h12M2 8h12M2 12h12"/><circle cx="5" cy="4" r="1.5" fill="var(--night)"/><circle cx="11" cy="8" r="1.5" fill="var(--night)"/><circle cx="6" cy="12" r="1.5" fill="var(--night)"/>',
 'pen':'<path d="M3 13l1-4 7-7 3 3-7 7-4 1Z"/><path d="m9 4 3 3"/>',
 'undo':'<path d="M2 3v5h5M2 8c1-5 10-6 12 0 1 3-2 6-5 6"/>','redo':'<path d="M14 3v5H9m5 0C13 3 4 2 2 8c-1 3 2 6 5 6"/>',
 'shield':'<path d="m8 1 6 2v5c0 3-3 5-6 7-3-2-6-4-6-7V3Z"/><path d="m5 8 2 2 4-4"/>',
 'tag':'<path d="M2 2h6l6 6-6 6-6-6Z"/><circle cx="5" cy="5" r=".8"/>',
 'link':'<path d="m6 10 4-4M5 7 3 9c-3 3 1 7 4 4l2-2M7 5l2-2c3-3 7 1 4 4l-2 2"/>',
 'cursor':'<path d="m3 2 10 6-5 1-2 5Z"/>','reset':'<path d="M3 3v4h4M3 7a5 5 0 1 1 1 5"/>',
 'spark':'<path d="m8 1 1.8 5.2L15 8l-5.2 1.8L8 15l-1.8-5.2L1 8l5.2-1.8Z"/>',
 'lock':'<rect x="3" y="7" width="10" height="7" rx="2"/><path d="M5 7V4a3 3 0 0 1 6 0v3M8 10v1"/>',
 'info':'<circle cx="8" cy="8" r="6"/><path d="M8 7v4M8 4.5v.1"/>',
 'trash':'<path d="M2 4h12M6 2h4M4 4v10h8V4M6 7v4M10 7v4"/>',
 'sun':'<circle cx="8" cy="8" r="3"/><path d="M8 1v1M8 14v1M1 8h1M14 8h1M3 3l1 1m8 8 1 1M3 13l1-1m8-8 1-1"/>',
 'moon':'<path d="M13 10A6 6 0 0 1 6 2a6 6 0 1 0 7 8Z"/>',
 'message':'<path d="M14 10a2 2 0 0 1-2 2H6l-4 3V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2Z"/><path d="M5 6h6M5 9h4"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 16 16" aria-hidden="true">${ICONS[name]||ICONS.info}</svg>`;
function paintIcons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>{el.outerHTML=icon(el.dataset.icon)});}
const TYPES = Object.freeze({
 suspect:{label:'怀疑',short:'疑狼',color:'#ef7b69',lambda:Math.log(1.8)},
 trust:{label:'保好',short:'保好',color:'#62c79e',lambda:-Math.log(1.8)},
 vote:{label:'投票',short:'投票',color:'#ab93ec',lambda:Math.log(1.35)},
 checkW:{label:'声称查杀',short:'查杀?',color:'#f0b06b',lambda:Math.log(3)},
 checkG:{label:'声称金水',short:'金水?',color:'#8fd9b8',lambda:-Math.log(3)},
 skill:{label:'技能记录',short:'技能',color:'#e6d4a3',lambda:0},
 note:{label:'备注',short:'备注',color:'#8b91a8',lambda:0}
});
function newState(n=12,wolves=4){return {version:VERSION,name:'我的对局',n,wolves,round:1,phase:'day',demo:false,
 players:Array.from({length:n},(_,i)=>({id:i+1,alive:true,fixed:'unknown',role:'',weight:.65,...playerRoleDefaults()})),
 roles:defaultRoleConfig(),sheriff:0,events:[],sensitivity:1,decay:.9,muteKnownWolves:true,selected:1,
 layout:{rho:.83,rotation:0,focus:true,labels:true}};}
function makeRelation(from,to,type,label='',strength=.8){return {id:uid(),from,to,type,label:label||TYPES[type].label,strength};}
function makeEvent(speaker,text,relations,round,phase='day',manual=false){return {id:uid(),speaker,text,relations,round,phase,manual,createdAt:Date.now()};}
function demoState(){
 const s=newState(12,4);s.name='演示对局';s.round=2;s.demo=true;s.selected=6;
 const examples=[
  [1,'我怀疑6号，8号像好人。',[[1,6,'suspect','发言存疑',.85],[1,8,'trust','像好人',.7]],1],
  [3,'我暂时信2号，6号这轮的发言前后不一致。',[[3,2,'trust','暂时相信',.7],[3,6,'suspect','前后矛盾',.85]],1],
  [5,'4号是好人，6号一直在自证，我怀疑6号。',[[5,4,'trust','偏好人',.7],[5,6,'suspect','怀疑6号',.9]],2],
  [6,'我是平民，我怀疑5号，暂时信8号。',[[6,5,'suspect','反向质疑',.75],[6,8,'trust','暂时相信',.7]],2],
  [9,'我这轮想投6号，11号可能是狼。',[[9,6,'vote','归票6号',.9],[9,11,'suspect','有狼面',.75]],2],
  [11,'2号是好人，我怀疑9号。',[[11,2,'trust','偏好人',.8],[11,9,'suspect','发言存疑',.75]],2]
 ];
 s.events=examples.map((e,i)=>({...makeEvent(e[0],e[1],e[2].map(a=>makeRelation(...a)),e[3]),createdAt:Date.now()-(examples.length-i)*180000}));
 s.players[5].role='自称平民';return s;
}
function logAdd(a,b){if(a===-Infinity)return b;if(b===-Infinity)return a;const m=Math.max(a,b);return m+Math.log1p(Math.exp(Math.min(a,b)-m));}
/** Exact marginals for exp(sum(score_i * x_i)) restricted to sum(x_i)=K. */
function cardinalityMarginals(scores,K){
 const m=scores.length;if(!Number.isInteger(K)||K<0||K>m)throw Error('狼人数与已知身份不兼容。');
 if(K===0)return scores.map(()=>0);if(K===m)return scores.map(()=>1);
 const f=Array.from({length:m+1},()=>Array(K+1).fill(-Infinity));
 const b=Array.from({length:m+1},()=>Array(K+1).fill(-Infinity));f[0][0]=0;b[m][0]=0;
 for(let i=0;i<m;i++)for(let k=0;k<=K;k++)f[i+1][k]=logAdd(f[i][k],k>0?f[i][k-1]+scores[i]:-Infinity);
 for(let i=m-1;i>=0;i--)for(let k=0;k<=K;k++)b[i][k]=logAdd(b[i+1][k],k>0?b[i+1][k-1]+scores[i]:-Infinity);
 const Z=f[m][K];return scores.map((s,i)=>{let part=-Infinity;for(let k=0;k<K;k++)part=logAdd(part,f[i][k]+b[i+1][K-1-k]);return clamp(Math.exp(s+part-Z),0,1);});
}
function inferBase(s){
 const latest=new Map(),byId=new Map(s.players.map(p=>[p.id,p]));
 for(const event of s.events){if(event.round>s.round)continue;for(const r of event.relations){
  if(TYPES[r.type].lambda===0)continue;
  latest.set(`${r.from}:${r.to}:${event.round}`,{...r,eventId:event.id,round:event.round,text:event.text});
 }}
 const pairs=new Map();
 for(const r of latest.values()){
  const source=byId.get(r.from);if(!source||!byId.has(r.to))continue;
  const muted=s.muteKnownWolves&&source.fixed==='wolf';
  const raw=TYPES[r.type].lambda*r.strength*(muted?0:source.weight)*Math.pow(s.decay,Math.max(0,s.round-r.round));
  const key=`${r.from}:${r.to}`;if(!pairs.has(key))pairs.set(key,{from:r.from,to:r.to,raw:0,contribution:0,entries:[],muted});
  const pair=pairs.get(key);pair.raw+=raw;pair.entries.push({...r,raw,muted});
 }
 const scores=Array(s.n).fill(0),evidence=Array.from({length:s.n},()=>[]);
 for(const pair of pairs.values()){
  pair.contribution=clamp(pair.raw,-1.2,1.2)*s.sensitivity;
  scores[pair.to-1]+=pair.contribution;evidence[pair.to-1].push(pair);
 }
 const knownWolves=s.players.filter(p=>p.fixed==='wolf').length,unknown=s.players.filter(p=>p.fixed==='unknown'),K=s.wolves-knownWolves;
 const unknownPs=cardinalityMarginals(unknown.map(p=>scores[p.id-1]),K);
 const ps=s.players.map(p=>p.fixed==='wolf'?1:0);unknown.forEach((p,i)=>ps[p.id-1]=unknownPs[i]);
 return {ps,scores,evidence,K,knownWolves,unknownCount:unknown.length,baseUnknown:unknown.length?K/unknown.length:0,
 sum:ps.reduce((a,b)=>a+b,0),expectedAlive:s.players.reduce((a,p)=>a+(p.alive?ps[p.id-1]:0),0),activeEntries:latest.size};
}
function assertCore(s){
 if(!Number.isInteger(s.n)||s.n<5||s.n>30)throw Error('玩家人数须为 5–30 的整数。');
 if(!Number.isInteger(s.wolves)||s.wolves<0||s.wolves>s.n)throw Error('狼人数须为 0 到玩家人数之间的整数。');
 const w=s.players.filter(p=>p.fixed==='wolf').length,g=s.players.filter(p=>p.fixed==='good').length;
 if(w>s.wolves)throw Error(`已有 ${w} 位确认狼人，超过全局 ${s.wolves} 狼；请先更正身份或狼数。`);
 if(g>s.n-s.wolves)throw Error(`已确认好人过多，剩余座位放不下 ${s.wolves} 狼；请检查已知身份。`);
 if(s.events.length>MAX_EVENTS)throw Error(`此单局最多记录 ${MAX_EVENTS} 条事件；请导出后新建对局。`);
 assertRoles(s);
 if(s.events.some(e=>e.relations.length>120)||s.events.reduce((a,e)=>a+e.relations.length,0)>10000)throw Error('每条记录最多 120 条关系，单局最多 10000 条关系。');
}
/** Normalize and validate imported values; never inject untrusted HTML or execute code. */
function sanitizeState(input){
 if(!input||![1,2].includes(input.version))throw Error('文件不是支持的 Moontrace 对局（支持 v1 / v2 存档）。');
 const n=Number(input.n),wolves=Number(input.wolves);if(!Number.isInteger(n)||n<5||n>30)throw Error('文件中玩家数量无效。');
 const s=newState(n,wolves);s.name=String(input.name||'导入的对局').slice(0,40);
 s.round=Number(input.round);if(!Number.isInteger(s.round)||s.round<1||s.round>999)throw Error('轮次无效。');
 s.phase=input.phase==='night'?'night':'day';s.demo=Boolean(input.demo);
 if(!Array.isArray(input.players)||input.players.length!==n)throw Error('玩家列表不完整。');
 const ids=new Set();s.players=input.players.map(p=>{
  if(!Number.isInteger(p.id)||p.id<1||p.id>n||ids.has(p.id))throw Error('玩家编号无效或重复。');ids.add(p.id);
  if(!['unknown','good','wolf'].includes(p.fixed)||typeof p.alive!=='boolean'||!finite(p.weight)||p.weight<0||p.weight>1)throw Error('玩家身份、状态或来源权重无效。');
  return {id:p.id,fixed:p.fixed,alive:p.alive,role:String(p.role||'').slice(0,40),weight:p.weight};
 }).sort((a,b)=>a.id-b.id);
 for(const [key,low,high] of [['sensitivity',0,2],['decay',0,1]]){if(!finite(input[key])||input[key]<low||input[key]>high)throw Error('模型参数无效。');s[key]=input[key];}
 s.muteKnownWolves=input.muteKnownWolves!==false;
 normalizeRoles(input,s);
 if(!Array.isArray(input.events)||input.events.length>MAX_EVENTS)throw Error('事件列表无效或过大。');
 let totalRelations=0;s.events=input.events.map(e=>{
  if(!Number.isInteger(e.speaker)||e.speaker<1||e.speaker>n||!Number.isInteger(e.round)||e.round<1||e.round>s.round)throw Error('事件来源或轮次无效。');
  if(!Array.isArray(e.relations)||e.relations.length>120)throw Error('单条事件关系过多。');totalRelations+=e.relations.length;
  const relations=e.relations.map(r=>{
   if(!Number.isInteger(r.from)||!Number.isInteger(r.to)||r.from<1||r.from>n||r.to<1||r.to>n||r.from===r.to||!Object.prototype.hasOwnProperty.call(TYPES,r.type)||!finite(r.strength)||r.strength<0||r.strength>1)throw Error('存在无效关系。');
   return makeRelation(r.from,r.to,r.type,String(r.label||TYPES[r.type].label).slice(0,60),r.strength);
  });return {...makeEvent(e.speaker,String(e.text||'').slice(0,6000),relations,e.round,e.phase==='night'?'night':'day',Boolean(e.manual)),createdAt:finite(e.createdAt)?e.createdAt:Date.now(),...(e.kind==='skill'?{kind:'skill',skill:normalizeSkill(e,s)}:{})};
 });if(totalRelations>10000)throw Error('关系总数过多。');
 s.selected=Number.isInteger(input.selected)?clamp(input.selected,1,n):1;
 const l=input.layout||{};s.layout={rho:finite(l.rho)?clamp(l.rho,.62,.87):.83,rotation:finite(l.rotation)?l.rotation%(Math.PI*2):0,focus:!!l.focus,labels:l.labels!==false};
 assertCore(s);return s;
}
function chineseNumeral(t){const m={'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};if(t==='十')return 10;if(t.includes('十')){const a=t.split('十');return (a[0]?m[a[0]]:1)*10+(a[1]?m[a[1]]:0);}return m[t]||t;}
/** Deliberately conservative clause parser. Uncertain language is not forced into evidence. */
function parseSpeech(raw,speaker,n){
 let text=raw.replace(/[０-９]/g,c=>String(c.charCodeAt(0)-0xff10)).replace(/([一二两三四五六七八九十]{1,3})号/g,(_,v)=>chineseNumeral(v)+'号');
 const parts=text.split(/[，,。；;\n！？!?]+/).map(x=>x.trim()).filter(Boolean),clauses=[],numberList=[];
 for(const part of parts){
  if(/^\d+号?(?:\s*[、和及]\s*\d+号?)*$/.test(part)){numberList.push(part);continue;}
  if(numberList.length){if(/^\d/.test(part))clauses.push(numberList.join('、')+'、'+part);else {clauses.push(...numberList,part);}numberList.length=0;}
  else clauses.push(part);
 }
 clauses.push(...numberList);
 const relations=[],warnings=[];
 const warn=x=>{if(!warnings.includes(x))warnings.push(x);};
 function add(from,to,type,label,strength=.8){
  if(to===from)return;if(to<1||to>n){warn(`发现超出当前人数的编号 ${to}，未计入。`);return;}
  const old=relations.findIndex(r=>r.from===from&&r.to===to);
  const next=makeRelation(from,to,type,label,strength);
  if(old>=0){const r=relations[old];if(Math.sign(TYPES[r.type].lambda)===Math.sign(TYPES[type].lambda)&&Math.abs(TYPES[r.type].lambda)>Math.abs(TYPES[type].lambda))return;relations[old]=next;}else relations.push(next);
 }
 for(const clause of clauses){
  if(/如果|假如|假设|要是|除非|一狼|一只狼|至少.*狼|同边|一组|共边|二选一|(?:出|投)(?:一|1)个/.test(clause)){
   if(/\d/.test(clause))warn('条件句或联合身份判断未自动计分，请手动确认。');continue;
  }
  if(/不(?:太)?(?:觉得|认为|怀疑|像|信|站)|不是|不一定|未必|不能|并非|不确定|不知道|不像|没有信息|没信息|没(?:有)?视角|别投|不投|不要投|不该投|不想投|不能投|不(?:想|该|能)?(?:出|保|投|杀|刀)|不支持|不相信|不信任|不可信|没有觉得/.test(clause)){
   if(/\d/.test(clause))warn('检测到否定或不确定表达，未自动形成阵营判断。');continue;
  }
  const historic=clause.match(/^(\d+)号?\s*(?:上票(?:给)?|投(?:票)?(?:给|了)?)\s*(\d+)号?/);
  if(historic){const from=+historic[1],to=+historic[2];if(from>=1&&from<=n)add(from,to,'vote','记录票型',.8);else warn(`来源编号 ${from} 超出当前人数。`);continue;}
  if(/\d+号?\s*(?:说|觉得|认为|表示|指出|怀疑|认定|提到)/.test(clause)||/[“”「」]|他说|她说|听说|据说|有人说/.test(clause)){
   warn('检测到转述或引语，未归因给当前发言者；可手动补充来源。');continue;
  }
  const clean=clause.replace(/第\d+(?:天|轮|晚)/g,'').replace(/\d+(?:\.\d+)?%/g,'');
  const nums=[...clean.matchAll(/\d+/g)].map(m=>+m[0]).filter((v,i,a)=>a.indexOf(v)===i);
  if(!nums.length)continue;
  if((nums.length>1&&/比|相对|相比/.test(clause))||/概率|百分之/.test(clause)){warn('比较句或概率表述未自动计分，请手动确认。');continue;}
  const trust=/好人|偏好|可信|相信|信任|信\s*\d|保(?:下|住|一手)?\s*\d|站(?:边)?\s*\d|支持|跟\s*\d/.test(clause);
  const suspect=/狼|可疑|怀疑|有问题|不做好|偏坏|身份低|踩/.test(clause);
  const checkW=/查杀/.test(clause),checkG=/金水/.test(clause);
  const vote=/(?:投|票(?:给|挂)|归票|归|出)(?:给|了|掉|死|一下)?\s*\d|(?:今天|这轮).*(?:出|投)/.test(clause);
  if((trust&&suspect&&!checkW&&!checkG)||(checkW&&checkG)) {warn('同一句含多种相反评价，请用逗号分句或手动补充。');continue;}
  let type=null,label='';
  if(checkW){type='checkW';label='声称查杀';}
  else if(checkG){type='checkG';label='声称金水';}
  else if(vote){type='vote';label='投票指向';}
  else if(trust){type='trust';label='偏好人';}
  else if(suspect){type='suspect';label=/前后|矛盾/.test(clause)?'前后矛盾':'怀疑';}
  else if(/骑士|守卫|预言家|女巫|神|平民|自证|划水|观察|保留|信息/.test(clause)){
   type='note';label=(clause.match(/骑士|守卫|预言家|女巫|神|平民/)||[])[0];label=label?'声称'+label:'待观察';
  }
  if(type)nums.forEach(to=>add(speaker,to,type,label,/可能|暂时|比较|偏/.test(clause)?.65:.85));
 }
 if(/我(?:是|自称|跳)(?:个|一个)?(?:平民|村民|预言家|女巫|骑士|守卫|猎人|狼人|狼)/.test(text))warn('身份自称只保留原文，不自动确认为好人或狼人。');
 if(raw.trim()&&relations.length===0&&warnings.length===0)warn('未识别到明确指向，将只保存原文；可手动补充关系。');
 return {relations,warnings};
}
/** Orthogonal-circle geometry in a disk of radius R centered at (0,0). */
function geodesic(p,q,R=1,trim=0){
 const det=p.x*q.y-p.y*q.x;
 if(Math.abs(det)<1e-8*R*R){const length=Math.hypot(q.x-p.x,q.y-p.y),t=length?Math.min(trim/length,.42):0;
  const point=a=>({x:p.x+(q.x-p.x)*a,y:p.y+(q.y-p.y)*a});
  return {kind:'line',point,start:point(t),end:point(1-t),t0:t,t1:1-t,length};}
 const h1=(p.x*p.x+p.y*p.y+R*R)/2,h2=(q.x*q.x+q.y*q.y+R*R)/2;
 const c={x:(h1*q.y-p.y*h2)/det,y:(p.x*h2-h1*q.x)/det};
 const radius=Math.sqrt(Math.max(0,c.x*c.x+c.y*c.y-R*R));
 const a=Math.atan2(p.y-c.y,p.x-c.x),b=Math.atan2(q.y-c.y,q.x-c.x);
 let delta=((b-a+Math.PI*3)%(Math.PI*2))-Math.PI;
 const point=t=>({x:c.x+radius*Math.cos(a+delta*t),y:c.y+radius*Math.sin(a+delta*t)});
 const length=radius*Math.abs(delta),t=length?Math.min(trim/length,.42):0;
 return {kind:'arc',c,radius,a,delta,point,start:point(t),end:point(1-t),t0:t,t1:1-t,length};
}
