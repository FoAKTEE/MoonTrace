/* Probability colour: jade (unlikely) → sand (baseline) → cinnabar (likely), interpolated so neighbours differ visibly. */
const COLOR_STOPS=[[.12,[98,199,158]],[.34,[230,212,163]],[.6,[239,123,105]]];
function colorFor(p){
 const rgb=c=>`rgb(${c[0]},${c[1]},${c[2]})`;
 if(!(p>COLOR_STOPS[0][0]))return rgb(COLOR_STOPS[0][1]);
 for(let i=1;i<COLOR_STOPS.length;i++){if(p<=COLOR_STOPS[i][0]){const [a,ca]=COLOR_STOPS[i-1],[b,cb]=COLOR_STOPS[i],t=(p-a)/(b-a);return rgb(ca.map((v,k)=>Math.round(v+(cb[k]-v)*t)));}}
 return rgb(COLOR_STOPS[COLOR_STOPS.length-1][1]);
}
let state,loadError='',rawSaved='';
try{rawSaved=localStorage.getItem(STORAGE_KEY)||localStorage.getItem('moontrace-v1')||'';state=rawSaved?sanitizeState(JSON.parse(rawSaved)):demoState();}
catch(e){try{if(rawSaved)localStorage.setItem('moontrace-v3-recovery',rawSaved);}catch(_){}state=demoState();loadError='未能读取本机存档，原内容已尝试备份到 recovery；现显示演示。';}
let result=infer(state),deltas=Array(state.n).fill(0),undoStack=[],redoStack=[],saveTimer,toastTimer,confirmCallback=null;
const ui={tab:'graph',speaker:state.demo?5:state.selected,pending:[],warnings:[],settingsNew:false,relationContext:null,relationType:'suspect',zoom:false};
const DRAFT_KEY='moontrace-pocket-draft-v1';
let drawnEdges=[],nodePositions=[];
function syncSheetLock(){document.body.classList.toggle('has-sheet',!!document.querySelector('dialog[open]'));}
function openSheet(id){const el=$(id);if(!el.open){el.showModal();syncSheetLock();el.querySelector('.sheet-body')?.scrollTo(0,0);}return el;}
function closeSheet(id){const el=$(id);if(el.open)el.close();syncSheetLock();}
function closeAllSheets(){document.querySelectorAll('dialog[open]').forEach(d=>d.close());syncSheetLock();}
function toast(message,error=false){
 const el=$('toast');el.textContent=message;el.classList.toggle('error',error);el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3300);
 const top=[...document.querySelectorAll('dialog[open]')].at(-1);
 if(top){let note=top.querySelector('.sheet-toast');if(!note){note=document.createElement('div');note.className='sheet-toast';note.setAttribute('role','status');top.append(note);}note.textContent=message;setTimeout(()=>note.remove(),4000);}
}
function persist(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));$('saveStatus').classList.remove('failed');$('saveStatus').innerHTML='<i></i>已保存';}catch(e){$('saveStatus').classList.add('failed');$('saveStatus').innerHTML='<i></i>请导出备份';}},100);}
function saveDraft(){try{localStorage.setItem(DRAFT_KEY,JSON.stringify({speaker:ui.speaker,text:$('speechInput').value,pending:ui.pending,autoNext:$('autoNext').checked,recordRoleClaim:$('recordRoleClaim').checked,n:state.n,name:state.name}));}catch(e){}}
function clearDraft(){ui.pending=[];ui.warnings=[];$('speechInput').value='';try{localStorage.removeItem(DRAFT_KEY);}catch(e){}renderPreview();}
function restoreDraft(){try{const d=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');if(d&&d.n===state.n&&d.name===state.name&&Number.isInteger(d.speaker)&&d.speaker>=1&&d.speaker<=state.n){ui.speaker=d.speaker;$('speechInput').value=String(d.text||'').slice(0,6000);$('autoNext').checked=d.autoNext!==false;$('recordRoleClaim').checked=d.recordRoleClaim!==false;refreshPreview(false);if(Array.isArray(d.pending)&&d.pending.length<=120&&d.pending.every(r=>Number.isInteger(r.from)&&Number.isInteger(r.to)&&r.from>=1&&r.to>=1&&r.from<=state.n&&r.to<=state.n&&r.from!==r.to&&Object.hasOwn(TYPES,r.type)&&finite(r.strength)&&r.strength>=0&&r.strength<=1)){ui.pending=d.pending.map(r=>makeRelation(r.from,r.to,r.type,String(r.label||TYPES[r.type].label).slice(0,60),r.strength));renderPreview();}}}catch(e){}}
function commit(label,fn,{quiet=false}={}){
 const old=clone(state),oldPs=result.ps.slice(),draft=clone(state);
 try{fn(draft);assertCore(draft);const next=infer(draft);undoStack.push({state:old,label});if(undoStack.length>80)undoStack.shift();redoStack=[];state=draft;result=next;deltas=result.ps.map((p,i)=>oldPs[i]===undefined?0:p-oldPs[i]);state.selected=clamp(state.selected,1,state.n);ui.speaker=clamp(ui.speaker,1,state.n);render();persist();if(!quiet)toast(label);return true;}
 catch(e){toast(e.message,true);return false;}
}
function undo(){if(!undoStack.length)return;const item=undoStack.pop(),old=result.ps.slice();redoStack.push({state:clone(state),label:item.label});state=item.state;result=infer(state);deltas=result.ps.map((p,i)=>p-(old[i]??p));ui.speaker=clamp(ui.speaker,1,state.n);ui.zoom=false;refreshPreview();render();persist();toast('已撤销：'+item.label);}
function redo(){if(!redoStack.length)return;const item=redoStack.pop(),old=result.ps.slice();undoStack.push({state:clone(state),label:item.label});state=item.state;result=infer(state);deltas=result.ps.map((p,i)=>p-(old[i]??p));ui.speaker=clamp(ui.speaker,1,state.n);refreshPreview();render();persist();toast('已重做：'+item.label);}
function askConfirm(title,text,action){confirmCallback=action;$('confirmTitle').textContent=title;$('confirmText').textContent=text;openSheet('confirmDialog');}
function setTab(tab){if(!['graph','ranking','history'].includes(tab))return;ui.tab=tab;document.querySelectorAll('[data-tab]').forEach(el=>{const active=el.dataset.tab===tab;el.classList.toggle('active',active);el.setAttribute('aria-selected',String(active));el.tabIndex=active?0:-1;});['graph','ranking','history'].forEach(v=>$('view-'+v).hidden=v!==tab);if(tab==='graph')renderGraph();window.scrollTo({top:0,behavior:'instant'});}
function render(){renderStats();renderGraph();renderSelected();renderRanking();renderHistory();renderSpeaker();if($('playerDialog').open)renderDetail();$('undoBtn').disabled=!undoStack.length;$('redoBtn').disabled=!redoStack.length;paintIcons();}
function renderStats(){
 const alive=state.players.filter(p=>p.alive).length;
 $('gameMeta').textContent=`${state.n} 人局，${state.wolves} 狼`;$('demoBadge').hidden=!state.demo;
 $('roundLabel').innerHTML=icon(state.phase==='day'?'sun':'moon')+`第 ${state.round} ${state.phase==='day'?'天':'晚'}`;
 $('eventCount').textContent=state.events.length;$('focusPlayer').textContent=pad(state.selected);
 $('allEdges').classList.toggle('active',!state.layout.focus);$('allEdges').setAttribute('aria-pressed',String(!state.layout.focus));$('focusEdges').classList.toggle('active',state.layout.focus);$('focusEdges').setAttribute('aria-pressed',String(state.layout.focus));
 $('labelsBtn').textContent=state.layout.labels?'评价已开':'评价已关';$('labelsBtn').setAttribute('aria-pressed',String(state.layout.labels));
 $('menuSession').innerHTML=`<strong>${esc(state.name)}</strong><span>${alive} 人存活 / ${state.n} 人</span>`;
 $('rankSummary').innerHTML=icon('shield')+`全场概率之和 <b>${result.sum.toFixed(1)}</b> / ${state.wolves} 狼<span style="margin-left:auto;color:var(--fog);font-size:12px">含出局者</span>`;
 $('graphHint').textContent=ui.zoom?'拖动查看，点 − 还原':state.n>16?'人数较多，点 ＋ 放大':'点玩家查看，点连线修改';
}
function latestEdges(){const m=new Map();for(const e of state.events)for(const r of e.relations)m.set(`${r.from}:${r.to}:${e.kind==='skill'?e.skill.type:'speech'}`,{...r,eventId:e.id,round:e.round,text:e.text,skill:e.kind==='skill'});return [...m.values()];}
function edgePath(geo,cx,cy){
 const a=`${(cx+geo.start.x).toFixed(2)} ${(cy+geo.start.y).toFixed(2)}`,b=`${(cx+geo.end.x).toFixed(2)} ${(cy+geo.end.y).toFixed(2)}`;
 return geo.kind==='line'?`M${a} L${b}`:`M${a} A${geo.radius.toFixed(2)} ${geo.radius.toFixed(2)} 0 0 ${geo.delta>0?1:0} ${b}`;
}
/* Labels sit on the geodesic: try the midpoint, slide along the arc, then move inward or sideways; the cheapest spot clear of nodes and other labels wins. A moved label keeps a thin leader to its arc. */
function placeLabel(geo,w,h,boxes,nodeR,cx,cy){
 let best=null,bestCost=Infinity;
 for(const [i,f] of [.5,.42,.58,.34,.66].entries())for(const inward of [0,16,32,48,64,80,100,120])for(const side of [0,-24,24,-48,48]){
  const a=geo.point(f),len=Math.hypot(a.x,a.y)||1,ux=-a.x/len,uy=-a.y/len;
  const px=cx+a.x+ux*inward-uy*side,py=cy+a.y+uy*inward+ux*side,box={x:px-w/2,y:py-h/2,w,h,ax:cx+a.x,ay:cy+a.y,moved:inward>=32||side!==0};
  let cost=i*4+inward*1.2+Math.abs(side);
  if(nodePositions.some(nd=>{const dx=Math.max(0,Math.abs(cx+nd.x-px)-w/2),dy=Math.max(0,Math.abs(cy+nd.y-py)-h/2);return Math.hypot(dx,dy)<nodeR+5;}))cost+=2000;
  if(boxes.some(b=>box.x<b.x+b.w+3&&box.x+w+3>b.x&&box.y<b.y+b.h+3&&box.y+h+3>b.y))cost+=2000;
  if(Math.hypot(Math.abs(px-cx)+w/2,Math.abs(py-cy)+h/2)>194)cost+=2000;
  if(cost<bestCost){best=box;bestCost=cost;if(cost<4)return box;}
 }
 return best;
}
function renderGraph(){
 const svg=$('graph'),R=178,cx=200,cy=200,n=state.n,rho=state.layout.rho;
 const nodeR=n<=12?23:n<=16?20:n<=22?15.5:12;
 nodePositions=state.players.map((p,i)=>{const theta=-Math.PI/2+i*2*Math.PI/n+state.layout.rotation;return {id:p.id,x:Math.cos(theta)*R*rho,y:Math.sin(theta)*R*rho,theta};});
 const all=latestEdges();drawnEdges=all.filter(e=>!state.layout.focus||e.from===state.selected||e.to===state.selected);
 const markers=Object.entries(TYPES).map(([type,t])=>`<marker id="arrow-${type}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="8" markerHeight="8" orient="auto" markerUnits="userSpaceOnUse"><path d="M1 1.5 8.5 5 1 8.5Z" fill="${t.color}"/></marker>`).join('');
 let html=`<defs>${markers}<radialGradient id="moonGlow" cx="50%" cy="40%" r="64%"><stop offset="0" stop-color="#242b46"/><stop offset=".65" stop-color="#181d30"/><stop offset="1" stop-color="#131828"/></radialGradient></defs>`;
 html+=`<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#moonGlow)" stroke="#2a3047" stroke-width="1"/>`;
 if(!drawnEdges.length)html+=`<text x="${cx}" y="${cy+4}" text-anchor="middle" fill="#5f6580" font-size="12">${state.events.length?'这位玩家还没有相关发言':'记一段发言，线索从这里开始'}</text>`;
 const labels=[],boxes=[],wanted=[];
 drawnEdges.forEach((e,index)=>{
  const p=nodePositions[e.from-1],q=nodePositions[e.to-1],geo=geodesic(p,q,R,nodeR+7),t=TYPES[e.type],hot=e.from===state.selected||e.to===state.selected,d=edgePath(geo,cx,cy);
  html+=`<g class="edge-group" data-edge="${index}" tabindex="0" role="button" aria-label="${e.from}号对${e.to}号：${esc(e.label)}，编辑关系"><path d="${d}" fill="none" stroke="transparent" stroke-width="20"/><path class="edge-path" d="${d}" fill="none" stroke="${t.color}" stroke-width="${hot?1.6:1}" stroke-opacity="${hot?.9:.42}" ${e.type==='note'?'stroke-dasharray="3 4"':''} marker-end="url(#arrow-${e.type})"/></g>`;
  if(state.layout.labels&&(hot||all.length<=5))wanted.push({index,geo,t,raw:e.label||t.label});
 });
 wanted.sort((a,b)=>a.geo.length-b.geo.length);
 for(const item of wanted){
  const chars=Array.from(item.raw),label=chars.length>6?chars.slice(0,5).join('')+'…':item.raw,t=item.t;
  const w=Array.from(label).reduce((s,c)=>s+(/[\u0000-\u00ff]/.test(c)?6.2:11.4),0)+16,h=22;
  const box=placeLabel(item.geo,w,h,boxes,nodeR,cx,cy);boxes.push(box);
  const leader=box.moved?`<path d="M${box.ax.toFixed(1)} ${box.ay.toFixed(1)} L${(box.x+w/2).toFixed(1)} ${(box.y+h/2).toFixed(1)}" fill="none" stroke="${t.color}" stroke-opacity=".5" stroke-width=".8" stroke-dasharray="2 3"/><circle cx="${box.ax.toFixed(1)}" cy="${box.ay.toFixed(1)}" r="1.6" fill="${t.color}"/>`:'';
  labels.push(`<g class="edge-label" data-edge="${item.index}">${leader}<rect x="${box.x.toFixed(1)}" y="${box.y.toFixed(1)}" width="${w.toFixed(1)}" height="${h}" rx="11" fill="#0f1320" stroke="${t.color}" stroke-opacity=".5" stroke-width=".8"/><text x="${(box.x+w/2).toFixed(1)}" y="${(box.y+15).toFixed(1)}" text-anchor="middle" fill="${t.color}" font-size="11">${esc(label)}</text></g>`);
 }
 html+=labels.join('');
 const showPct=n<=22,seatSize=n<=12?15:n<=16?13.5:n<=22?12:10.5,touch=Math.max(nodeR+5,16),circ=2*Math.PI*nodeR;
 state.players.forEach(p=>{
  const pos=nodePositions[p.id-1],prob=result.ps[p.id-1],color=colorFor(prob),selected=p.id===state.selected,fixed=p.fixed!=='unknown';
  html+=`<g class="node" data-node="${p.id}" tabindex="0" role="button" aria-label="${p.id}号，${p.alive?'存活':'出局'}，狼概率${(prob*100).toFixed(1)}%，点击选中" transform="translate(${(cx+pos.x).toFixed(2)} ${(cy+pos.y).toFixed(2)})" opacity="${p.alive?1:.38}">`
   +`<circle r="${touch}" fill="transparent"/>`
   +(selected?`<circle r="${nodeR+6}" fill="#f2ebdd" fill-opacity=".06" stroke="#f2ebdd" stroke-opacity=".85" stroke-width="1.2"/>`:'')
   +`<circle class="node-body" r="${nodeR}" fill="${selected?'#262d45':'#1c2235'}" stroke="#2f3650" stroke-width="1.2"/>`
   +`<circle r="${nodeR}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="${(Math.max(prob,.004)*circ).toFixed(2)} ${circ.toFixed(2)}" transform="rotate(-90)"/>`
   +`<text class="seat" y="${showPct?-1.5:seatSize*.36}" text-anchor="middle" fill="${selected?'#f2ebdd':'#d9d3c6'}" font-size="${seatSize}">${pad(p.id)}</text>`
   +(showPct?`<text class="pct" y="${n<=16?11.5:10}" text-anchor="middle" fill="${color}" font-size="${n<=16?9:8}">${Math.round(prob*100)}%</text>`:'')
   +(fixed?`<circle cx="${(nodeR*.72).toFixed(1)}" cy="${(-nodeR*.72).toFixed(1)}" r="4" fill="${p.fixed==='wolf'?'#ef7b69':'#62c79e'}" stroke="#0f1320" stroke-width="1.5"/>`:'')
   +(!p.alive?`<path d="M${(-nodeR*.6).toFixed(1)} ${(nodeR*.6).toFixed(1)} L${(nodeR*.6).toFixed(1)} ${(-nodeR*.6).toFixed(1)}" stroke="#8b91a8" stroke-width="1.2"/>`:'')
   +`</g>`;
 });
 svg.innerHTML=html;
 const viewport=$('graphViewport'),canvas=$('graphCanvas');viewport.classList.toggle('zoomed',ui.zoom);
 if(ui.zoom){const factor=Math.max(1.55,n>22?2.4:n>16?1.9:1.55);canvas.style.width=`${factor*100}%`;canvas.style.height=`${factor*100}%`;}
 else{canvas.style.width='100%';canvas.style.height='100%';viewport.scrollTo(0,0);}
 $('zoomBtn').innerHTML=ui.zoom?'<svg class="icon" viewBox="0 0 16 16"><path d="M3 8h10"/></svg>':icon('plus');$('zoomBtn').setAttribute('aria-label',ui.zoom?'还原关系图':'放大关系图');
}
function renderSelected(){
 const p=state.players[state.selected-1],prob=result.ps[p.id-1],sources=result.evidence[p.id-1].filter(e=>Math.abs(e.contribution)>1e-10).length;
 let note=p.fixed!=='unknown'?(p.fixed==='wolf'?'已确认狼人':'已确认好人'):sources?`${sources} 位玩家的发言影响这个值`:'还没有直接证据，只受狼数约束';
 if(roleLabel(state,p))note=roleLabel(state,p)+' · '+note;
 if(state.sheriff===p.id)note='警长 · '+note;
 if(!p.alive)note='已出局，'+note;
 $('selectedCard').innerHTML=`<span class="selected-seat">${pad(p.id)}</span><div class="selected-info"><strong>${p.id} 号的狼概率</strong><p>${esc(note)}</p></div><div class="selected-detail"><div class="selected-value" style="color:${colorFor(prob)}">${(prob*100).toFixed(1)}<small>%</small></div><button class="plain detail-link" data-detail="${p.id}" aria-label="查看${p.id}号详情">详情 ${icon('chevron-right')}</button></div>`;
}
function selectPlayer(id,{detail=false}={}){if(!Number.isInteger(id)||id<1||id>state.n)return;state.selected=id;renderStats();renderGraph();renderSelected();renderRanking();persist();if(detail){renderDetail();openSheet('playerDialog');}}
function renderRanking(){
 const players=state.players.filter(p=>!$('aliveOnly').checked||p.alive).sort((a,b)=>result.ps[b.id-1]-result.ps[a.id-1]||a.id-b.id);
 $('ranking').innerHTML=players.length?players.map((p,i)=>{const prob=result.ps[p.id-1],color=colorFor(prob);return `<button class="rank-row ${p.id===state.selected?'selected':''} ${p.alive?'':'dead'}" data-detail="${p.id}" aria-label="${p.id}号，狼概率${(prob*100).toFixed(1)}%，查看详情"><span class="rank-index">${pad(i+1)}</span><span class="rank-person"><b>${pad(p.id)}</b>号${roleLabel(state,p)?`<small>${esc(roleLabel(state,p))}</small>`:p.fixed!=='unknown'?`<small>${p.fixed==='wolf'?'确认狼':'确认好人'}</small>`:''}</span><span class="rank-track"><span class="rank-fill" style="width:${prob*100}%;background:${color}"></span></span><span class="rank-percent" style="color:${color}">${(prob*100).toFixed(1)}%</span>${icon('chevron-right')}</button>`;}).join(''):`<div class="empty">没有存活玩家</div>`;
}
function renderHistory(){
 const events=state.events.filter(e=>!$('currentRoundOnly').checked||e.round===state.round).slice().sort((a,b)=>b.round-a.round||(b.phase==='night'?1:0)-(a.phase==='night'?1:0)||b.createdAt-a.createdAt);$('historyCaption').textContent=`共 ${state.events.length} 条，发言与技能按轮次归档`;
 if(!events.length){$('timeline').innerHTML=`<div class="empty">${icon('message')}还没有${$('currentRoundOnly').checked?'本轮':''}发言<br>记下第一段，线索就从这里开始。<br><button class="primary" data-compose>记一段发言</button></div>`;return;}
 let last='',html='';for(const e of events){const phase=`第 ${e.round} ${e.phase==='day'?'天':'晚'}`;if(phase!==last){html+=`<div class="log-section-label">${phase}</div>`;last=phase;}
 const skill=e.kind==='skill';
 html+=`<article class="log-card ${skill?'skill-log':''}"><div class="log-top"><button class="seat-badge" data-detail="${e.speaker}" aria-label="查看${e.speaker}号详情">${pad(e.speaker)}</button><span class="log-name">${skill?'技能 · '+(e.skill.status==='confirmed'?'已确认':'声称'):e.manual?'手动添加的关系':'发言'}</span><span class="log-time">${new Date(e.createdAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})}</span><button class="log-delete" data-delete-event="${e.id}" aria-label="删除${e.speaker}号的这条记录">${icon('trash')}</button></div><p class="log-text">${esc(e.text||'手动添加关系')}</p><div class="log-tags">${skill?`<button class="log-tag skill-edit" data-edit-skill="${e.id}">编辑技能与目标</button>`:e.relations.map(r=>`<button class="log-tag ${r.type}" data-edit-relation="${r.id}" data-event="${e.id}">${r.from!==e.speaker?pad(r.from)+' → ':''}${TYPES[r.type].short} ${pad(r.to)}</button>`).join('')}</div></article>`;}
 $('timeline').innerHTML=html;
}
function renderDetail(){
 const p=state.players[state.selected-1],prob=result.ps[p.id-1],col=colorFor(prob),fixed=p.fixed!=='unknown',evidence=result.evidence[p.id-1].slice().sort((a,b)=>Math.abs(b.contribution)-Math.abs(a.contribution));
 $('playerTitle').innerHTML=`<span class="num">${pad(p.id)}</span> 号玩家`;
 $('playerDetail').innerHTML=`<div class="detail-hero"><div><div class="probability-value" style="color:${col}">${(prob*100).toFixed(1)}<small>%</small></div><p>${fixed?'由已知身份决定，不是模型推断':'启发式估计，未经真实对局校准'}</p></div><button class="alive-btn ${p.alive?'':'dead'}" id="toggleAlive">${p.alive?'● 存活':'○ 已出局'}</button></div><label class="field-label">已知身份</label><div class="identity-grid">${[['unknown','未知'],['good','确认好人'],['wolf','确认狼人']].map(([val,text])=>`<button data-identity="${val}" class="${p.fixed===val?'active':''}" aria-pressed="${p.fixed===val}">${text}</button>`).join('')}</div>${playerRolePanel(p)}<label class="field-label" for="roleNote">其他备注</label><input id="roleNote" value="${esc(p.role)}" maxlength="40" placeholder="如：自称守卫，不锁定身份"><div class="evidence-title"><h3>概率从哪里来</h3><span>${evidence.length} 个来源</span></div>${fixed?'<p class="help">已确认身份固定为 '+(p.fixed==='wolf'?'狼人（100%）':'好人（0%）')+'，发言不会再改变这个值。</p>':evidence.length?evidence.map(e=>`<div class="evidence-row"><button class="seat-badge" data-detail="${e.from}" aria-label="查看来源${e.from}号">${pad(e.from)}</button><span class="evidence-text">${e.muted?'确认狼 · 不计分':e.contribution>0?'提高狼面':e.contribution<0?'降低狼面':'不改变分数'}<small>${e.entries.length} 轮去重证据</small></span><span class="evidence-score" style="color:${e.contribution>0?'var(--red)':e.contribution<0?'var(--mint2)':'var(--muted)'}">${e.contribution>=0?'+':''}${e.contribution.toFixed(2)}</span></div>`).join(''):'<p class="help">没有直接软证据。此概率由全局狼数约束与其他玩家的证据共同决定。</p>'}<details class="advanced"><summary>来源权重 <span id="sourceWeightValue">${p.weight.toFixed(2)}</span></summary><div class="advanced-content"><input id="sourceWeight" type="range" min="0" max="1" step="0.05" value="${p.weight}" aria-label="来源权重"><p class="help">调整此人所有历史发言的影响力，不是直接调整他的狼概率。</p></div></details>`;
}
function renderSpeaker(){
 const p=state.players[ui.speaker-1];$('dockSpeakerNumber').textContent=pad(ui.speaker);$('speechSpeaker').innerHTML=`<span class="mono">${pad(ui.speaker)}</span>号发言${!p.alive?' · 遗言':''}${icon('chevron-right')}`;
 $('composeLabel').textContent=$('speechInput').value.trim()||ui.pending.length?'继续发言':'记发言';
 if($('speakerDialog').open)renderSpeakerGrid();
}
function renderSpeakerGrid(){$('speakerGrid').innerHTML=state.players.map(p=>`<button class="seat-choice ${p.id===ui.speaker?'active':''} ${p.alive?'':'dead'}" data-speaker="${p.id}" aria-label="选择${p.id}号${p.alive?'':'，已出局'}" aria-pressed="${p.id===ui.speaker}">${pad(p.id)}${!p.alive?'<small>出局</small>':''}</button>`).join('');}
function openSpeaker(){renderSpeakerGrid();openSheet('speakerDialog');}
function changeSpeaker(id){
 const apply=()=>{ui.speaker=id;refreshPreview();renderSpeaker();saveDraft();closeSheet('speakerDialog');};
 if(ui.pending.length&&ui.speaker!==id)askConfirm('切换发言者？','这段草稿的识别关系会按新的发言者重新生成，手动修改将重置。',()=>{closeSheet('confirmDialog');apply();});else apply();
}
function openComposer(){renderSpeaker();renderPreview();openSheet('speechDialog');}
function refreshPreview(save=true){const parsed=parseSpeech($('speechInput').value,ui.speaker,state.n);ui.pending=parsed.relations;ui.warnings=parsed.warnings;renderPreview();renderSpeaker();if(save)saveDraft();}
function renderPreview(){
 renderClaimPreview();
 $('charCount').textContent=$('speechInput').value.length+' / 6000';$('previewTitle').textContent=ui.pending.length?`确认关系（${ui.pending.length} 条）`:'确认关系';
 $('previewTags').innerHTML=ui.pending.length?ui.pending.map((r,i)=>`<span class="preview-item ${r.type}"><button data-preview="${i}" aria-label="修改${r.from}号对${r.to}号的${esc(r.label)}关系">${pad(r.from)} → ${pad(r.to)} · ${esc(r.label)}</button><button data-remove-preview="${i}" aria-label="移除这条识别关系">×</button></span>`).join(''):'<span class="preview-placeholder">输入后，这里会出现“怀疑 / 保好 / 投票”等关系。确认后才计入概率。</span>';
 $('parserWarnings').textContent=ui.warnings.join(' ');$('submitSpeech').disabled=!$('speechInput').value.trim()&&!ui.pending.length;
}
function submitSpeech(){
 const text=$('speechInput').value.trim(),speaker=ui.speaker,relations=clone(ui.pending);if(!text&&!relations.length)return;
 if(relations.some(r=>r.from>state.n||r.to>state.n)){refreshPreview();toast('人数有变更，请重新确认关系。',true);return;}
 if(commit('记录发言',s=>{s.events.push(makeEvent(speaker,text,relations,s.round,s.phase));const claim=recognizeRoleClaim(text,speaker,s);if(claim&&$('recordRoleClaim').checked)setPlayerRole(s,speaker,claim.roleId,'claim');},{quiet:true})){
  const changes=deltas.slice();clearDraft();if($('autoNext').checked){for(let offset=1;offset<=state.n;offset++){const candidate=(speaker-1+offset)%state.n+1;if(state.players[candidate-1].alive){ui.speaker=candidate;break;}}}
  if(relations.length){const candidates=[...new Set(relations.map(r=>r.to))].sort((a,b)=>Math.abs(changes[b-1])-Math.abs(changes[a-1]));state.selected=candidates[0];state.layout.focus=true;}
  $('speechInput').blur();closeSheet('speechDialog');setTab('graph');render();persist();saveDraft();
  const max=relations.length?state.selected:null,delta=max?changes[max-1]*100:0;
  toast(`已记 ${speaker} 号${max?` · ${max}号狼概率 ${delta>=0?'+':''}${delta.toFixed(1)} 个百分点`:' · 未解析内容只保留原文'}`);
 }
}
function relationOptions(){return state.players.map(p=>`<option value="${p.id}">${pad(p.id)} 号${p.alive?'':' · 出局'}</option>`).join('');}
function renderRelationTypes(){$('relationTypes').innerHTML=Object.entries(TYPES).map(([type,t])=>`<button type="button" data-reltype="${type}" class="${type===ui.relationType?'active':''}" style="--type-color:${t.color};--type-bg:${t.color}12" aria-pressed="${type===ui.relationType}">${t.label}</button>`).join('');}
function openRelation(ctx={},relation=null){
 ui.relationContext=ctx;const r=relation||makeRelation(ctx.from||ui.speaker,ctx.to||((ctx.from||ui.speaker)%state.n+1),'suspect','',.8);ui.relationType=r.type;
 $('relationTitle').textContent=ctx.mode==='preview'?'纠正识别关系':ctx.eventId?'编辑连线':'添加关系';$('relSource').innerHTML=relationOptions();$('relTarget').innerHTML=relationOptions();$('relSource').value=r.from;$('relTarget').value=r.to;$('relLabel').value=r.label;$('relStrength').value=r.strength;$('relStrengthValue').textContent=r.strength.toFixed(2);$('relationError').textContent='';$('deleteRelation').hidden=!(ctx.eventId||ctx.mode==='preview');$('relationDialog').querySelector('details').open=false;renderRelationTypes();openSheet('relationDialog');
}
function saveRelation(e){
 e.preventDefault();const from=Number($('relSource').value),to=Number($('relTarget').value),type=ui.relationType,label=$('relLabel').value.trim()||TYPES[type].label,strength=Number($('relStrength').value),ctx=ui.relationContext;
 if(from===to){$('relationError').textContent='不能指向自己；自称身份请填在玩家备注中。';return;}
 const r=makeRelation(from,to,type,label,strength);
 if(ctx.mode==='preview'||ctx.mode==='pending'){if(ctx.mode==='preview')ui.pending[ctx.index]=r;else if(ui.pending.length<120)ui.pending.push(r);else{$('relationError').textContent='单条记录最多 120 条关系。';return;}renderPreview();saveDraft();renderSpeaker();closeSheet('relationDialog');return;}
 const ok=commit('已保存关系',s=>{if(ctx.eventId){const ev=s.events.find(ev=>ev.id===ctx.eventId);if(!ev)throw Error('对应记录已不存在。');const i=ev.relations.findIndex(v=>v.id===ctx.relationId);if(i<0)throw Error('对应关系已不存在。');ev.relations[i]=r;}else s.events.push(makeEvent(from,`${from}号 → ${to}号：${label}`,[r],s.round,s.phase,true));s.selected=to;},{quiet:true});
 if(ok){closeSheet('relationDialog');render();toast('已保存关系，概率已更新');}
}
function deleteRelation(){const ctx=ui.relationContext;if(ctx.mode==='preview'){ui.pending.splice(ctx.index,1);renderPreview();saveDraft();closeSheet('relationDialog');return;}
 if(ctx.eventId&&commit('已删除关系，保留原文',s=>{const ev=s.events.find(ev=>ev.id===ctx.eventId);if(ev)ev.relations=ev.relations.filter(r=>r.id!==ctx.relationId);},{quiet:true})){closeSheet('relationDialog');toast('已删除关系，保留原文');}}
function openSettings(isNew=false){
 closeSheet('menuDialog');ui.settingsNew=isNew;$('settingsTitle').textContent=isNew?'开始新对局':'对局设置';$('applySettings').textContent=isNew?'创建对局':'保存设置';$('settingName').value=isNew?'我的对局':state.name;$('settingN').value=state.n;$('settingW').value=state.wolves;
 for(const [id,value] of [['settingSensitivity',state.sensitivity],['settingDecay',state.decay]]){const el=$(id);el.querySelectorAll('[data-custom]').forEach(v=>v.remove());if(![...el.options].some(o=>Number(o.value)===value)){const opt=document.createElement('option');opt.value=value;opt.textContent='自定义 · '+value;opt.dataset.custom='true';el.append(opt);}el.value=value;}
 $('muteKnownWolves').checked=state.muteKnownWolves;$('settingsError').textContent='';$('settingsHint').textContent=isNew?'新对局会清空发言与身份标记。请先导出重要记录；本次打开期间可以撤销。':'缩减人数会移除超出编号的记录与关系，保存后可在记录页撤销。';$('settingsDialog').querySelector('details').open=false;highlightPreset();openSheet('settingsDialog');
}
function highlightPreset(){document.querySelectorAll('[data-preset]').forEach(b=>{const [n,w]=b.dataset.preset.split(',').map(Number);b.classList.toggle('active',n===Number($('settingN').value)&&w===Number($('settingW').value));});}
function applySettings(e){
 e.preventDefault();const n=Number($('settingN').value),w=Number($('settingW').value);if(!Number.isInteger(n)||n<5||n>30||!Number.isInteger(w)||w<0||w>n){$('settingsError').textContent='人数须为 5–30，狼数须为 0 到人数之间的整数。';return;}
 if(!ui.settingsNew&&state.roles.enabled&&(n!==state.n||w!==state.wolves)){$('settingsError').textContent='已开启角色配额；请在「角色与板子」中调整人数与狼牌数量。';return;}
 const name=$('settingName').value.trim()||'我的对局',sensitivity=Number($('settingSensitivity').value),decay=Number($('settingDecay').value),mute=$('muteKnownWolves').checked;
 const ok=commit(ui.settingsNew?'已创建新对局':'已保存对局设置',s=>{if(ui.settingsNew){const fresh=newState(n,w);Object.keys(s).forEach(k=>delete s[k]);Object.assign(s,fresh);}else if(n!==s.n){resizeGame(s,n);}s.name=name;s.wolves=w;s.sensitivity=sensitivity;s.decay=decay;s.muteKnownWolves=mute;},{quiet:true});
 if(ok){closeSheet('settingsDialog');ui.zoom=false;if(ui.settingsNew){ui.speaker=1;clearDraft();setTab('graph');}else{ui.speaker=clamp(ui.speaker,1,n);refreshPreview();}render();persist();toast(ui.settingsNew?'新对局已就绪':'对局设置已保存');}else $('settingsError').textContent='已知身份与狼数冲突，请更正身份或全局狼数。';
}
function nativeSave(name,text){
 try{
  if(window.MoontraceNative&&typeof window.MoontraceNative.saveFile==='function'){window.MoontraceNative.saveFile(name,text);return true;}
  if(window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.moontrace){window.webkit.messageHandlers.moontrace.postMessage({type:'save',name,text});return true;}
 }catch(e){}
 return false;
}
function downloadJSON(){
 const name=`moontrace-${state.n}p-round${state.round}-${new Date().toISOString().slice(0,10)}.json`,text=JSON.stringify(state,null,2);closeSheet('menuDialog');
 if(nativeSave(name,text)){toast('正在导出存档，包含原文与已知身份');return;}
 const blob=new Blob([text],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('已导出存档，包含原文与已知身份');
}
async function importJSON(file){if(!file)return;if(file.size>10*1024*1024){toast('文件超过 10 MB，未导入。',true);$('importFile').value='';return;}
 try{const incoming=sanitizeState(JSON.parse(await file.text()));askConfirm('导入这场对局？',`${incoming.name} · ${incoming.n} 人 / ${incoming.wolves} 狼，将替换当前记录；可在本次打开期间撤销。`,()=>{closeAllSheets();if(commit('已导入对局',s=>{Object.keys(s).forEach(k=>delete s[k]);Object.assign(s,incoming);})){ui.speaker=state.selected;ui.zoom=false;clearDraft();setTab('graph');render();}});}catch(e){toast('导入失败：'+e.message,true);}finally{$('importFile').value='';}
}
function loadDemo(){askConfirm('载入演示数据？','将替换当前记录。示例发言与身份不属于你之前那一局，可在记录页撤销。',()=>{closeAllSheets();commit('已载入演示数据',s=>{Object.keys(s).forEach(k=>delete s[k]);Object.assign(s,demoState());});ui.speaker=5;ui.zoom=false;clearDraft();setTab('graph');render();});}
function showPhase(){$('phaseSummary').innerHTML=icon(state.phase==='day'?'sun':'moon')+`第 ${state.round} ${state.phase==='day'?'天':'晚'}<p>${state.players.filter(p=>p.alive).length} 人存活</p>`;$('nextPhase').innerHTML=`进入第 ${state.phase==='day'?state.round:state.round+1} ${state.phase==='day'?'晚':'天'}`+icon('arrow-right');openSheet('phaseDialog');}
function bind(){
 document.addEventListener('click',e=>{
  const close=e.target.closest('[data-close]');if(close){closeSheet(close.dataset.close);return;}
  const tab=e.target.closest('[data-tab]');if(tab){setTab(tab.dataset.tab);return;}
  const detail=e.target.closest('[data-detail]');if(detail){selectPlayer(Number(detail.dataset.detail),{detail:true});return;}
  const speaker=e.target.closest('[data-speaker]');if(speaker){changeSpeaker(Number(speaker.dataset.speaker));return;}
  const preview=e.target.closest('[data-preview]');if(preview){const i=Number(preview.dataset.preview);openRelation({mode:'preview',index:i},ui.pending[i]);return;}
  const remove=e.target.closest('[data-remove-preview]');if(remove){ui.pending.splice(Number(remove.dataset.removePreview),1);renderPreview();saveDraft();return;}
  const edit=e.target.closest('[data-edit-relation]');if(edit){const ev=state.events.find(ev=>ev.id===edit.dataset.event),r=ev?.relations.find(r=>r.id===edit.dataset.editRelation);if(r)openRelation({eventId:ev.id,relationId:r.id},r);return;}
  const del=e.target.closest('[data-delete-event]');if(del){askConfirm('删除这条记录？','原文与关系会一起删除；技能记录删除后重算药量和次数。手动确认的身份与死亡状态不变，可撤销。',()=>{closeSheet('confirmDialog');commit('已删除发言记录',s=>s.events=s.events.filter(ev=>ev.id!==del.dataset.deleteEvent));});return;}
  const identity=e.target.closest('[data-identity]');if(identity){const id=state.selected,val=identity.dataset.identity;if(val===state.players[id-1].fixed)return;commit(`已更新 ${id} 号身份`,s=>{s.players[id-1].fixed=val;if(s.players[id-1].confirmedRole&&getRole(s,s.players[id-1].confirmedRole)?.camp!==val)s.players[id-1].confirmedRole='';},{quiet:true});renderDetail();return;}
  const type=e.target.closest('[data-reltype]');if(type){const prev=ui.relationType;ui.relationType=type.dataset.reltype;if(!$('relLabel').value.trim()||$('relLabel').value===TYPES[prev].label)$('relLabel').value=TYPES[ui.relationType].label;renderRelationTypes();return;}
  const preset=e.target.closest('[data-preset]');if(preset){const [n,w]=preset.dataset.preset.split(',');$('settingN').value=n;$('settingW').value=w;highlightPreset();return;}
  if(e.target.closest('[data-compose]'))openComposer();
 });
 $('graph').addEventListener('click',e=>{const node=e.target.closest('[data-node]');if(node){selectPlayer(Number(node.dataset.node));return;}const edge=e.target.closest('[data-edge]');if(edge){const r=drawnEdges[Number(edge.dataset.edge)];if(r){if(r.skill){const ev=state.events.find(e=>e.id===r.eventId);if(ev)openSkill(ev.speaker,ev);}else openRelation({eventId:r.eventId,relationId:r.id},r);}}});
 $('graph').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
 $('selectedCard').addEventListener('click',e=>{if(!e.target.closest('[data-detail]'))selectPlayer(state.selected,{detail:true});});
 $('allEdges').onclick=()=>{state.layout.focus=false;renderStats();renderGraph();persist();};$('focusEdges').onclick=()=>{state.layout.focus=true;renderStats();renderGraph();persist();};
 $('labelsBtn').onclick=()=>{state.layout.labels=!state.layout.labels;renderStats();renderGraph();persist();};
 $('zoomBtn').onclick=()=>{ui.zoom=!ui.zoom;renderStats();renderGraph();if(ui.zoom){const el=$('graphViewport'),p=nodePositions[state.selected-1],factor=el.scrollWidth/400;el.scrollLeft=(p.x+200)*factor-el.clientWidth/2;el.scrollTop=(p.y+200)*factor-el.clientHeight/2;}};
 $('linkBtn').onclick=()=>openRelation({from:state.selected});$('homeBtn').onclick=e=>{e.preventDefault();setTab('graph');};
 $('dockSpeaker').onclick=openSpeaker;$('speechSpeaker').onclick=openSpeaker;$('composeBtn').onclick=openComposer;
 $('speechInput').oninput=()=>refreshPreview();$('autoNext').onchange=saveDraft;$('submitSpeech').onclick=submitSpeech;$('manualPreview').onclick=()=>openRelation({mode:'pending',from:ui.speaker});
 $('playerDetail').addEventListener('click',e=>{if(e.target.closest('#toggleAlive')){const p=state.players[state.selected-1];commit(`${p.id} 号已${p.alive?'出局':'恢复存活'}，身份不变`,s=>s.players[p.id-1].alive=!p.alive,{quiet:true});}});
 $('playerDetail').addEventListener('change',e=>{const id=state.selected;if(e.target.id==='roleNote'){const val=e.target.value.trim();commit('已保存角色备注',s=>s.players[id-1].role=val,{quiet:true});}if(e.target.id==='sourceWeight'){const val=Number(e.target.value);commit('已更新来源权重',s=>s.players[id-1].weight=val,{quiet:true});}});
 $('playerDetail').addEventListener('input',e=>{if(e.target.id==='sourceWeight')$('sourceWeightValue').textContent=Number(e.target.value).toFixed(2);});
 $('playerLink').onclick=()=>openRelation({from:state.selected});$('playerSpeak').onclick=()=>{const id=state.selected;if(($('speechInput').value.trim()||ui.pending.length)&&ui.speaker!==id){toast('还有其他玩家的发言草稿，请先记录或清空。',true);return;}closeSheet('playerDialog');ui.speaker=id;refreshPreview();openComposer();};
 $('relationForm').onsubmit=saveRelation;$('deleteRelation').onclick=deleteRelation;$('relStrength').oninput=e=>$('relStrengthValue').textContent=Number(e.target.value).toFixed(2);
 $('menuBtn').onclick=()=>{renderStats();openSheet('menuDialog');};$('settingsBtn').onclick=()=>openSettings();$('settingsShortcut').onclick=()=>openSettings();$('newBtn').onclick=()=>openSettings(true);$('settingsForm').onsubmit=applySettings;$('settingN').oninput=highlightPreset;$('settingW').oninput=highlightPreset;
 $('phaseBtn').onclick=showPhase;$('nextPhase').onclick=()=>{if(commit('已进入下一阶段',s=>{if(s.phase==='day')s.phase='night';else{if(s.round>=999)throw Error('已达轮次上限。');s.round++;s.phase='day';}},{quiet:true})){closeSheet('phaseDialog');toast(`第 ${state.round} ${state.phase==='day'?'天':'晚'}，已更新`);}};
 $('undoBtn').onclick=undo;$('redoBtn').onclick=redo;$('aliveOnly').onchange=renderRanking;$('currentRoundOnly').onchange=renderHistory;
 $('modelBtn').onclick=()=>{closeSheet('menuDialog');openSheet('modelDialog');};$('helpBtn').onclick=()=>openSheet('modelDialog');
 $('exportBtn').onclick=downloadJSON;$('importBtn').onclick=()=>$('importFile').click();$('importFile').onchange=e=>importJSON(e.target.files[0]);$('loadDemo').onclick=loadDemo;
 $('confirmAction').onclick=()=>{const fn=confirmCallback;confirmCallback=null;closeSheet('confirmDialog');if(fn)fn();};
 document.querySelectorAll('dialog').forEach(dialog=>{
  dialog.addEventListener('close',()=>{dialog.querySelector('.sheet-toast')?.remove();syncSheetLock();if(dialog.id==='speechDialog'){saveDraft();renderSpeaker();}});
  // Backdrop dismissal ignores scroll/drags that started inside the sheet.
  let startedOutside=false;dialog.addEventListener('pointerdown',e=>{const r=dialog.getBoundingClientRect();startedOutside=e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;});
  dialog.addEventListener('click',e=>{if(e.target===dialog&&startedOutside){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeSheet(dialog.id);}});
  const grip=dialog.querySelector('.sheet-grip');let y=null;
  grip.addEventListener('pointerdown',e=>{y=e.clientY;grip.setPointerCapture(e.pointerId);});grip.addEventListener('pointerup',e=>{if(y!==null&&e.clientY-y>55)closeSheet(dialog.id);y=null;});grip.addEventListener('pointercancel',()=>y=null);
 });
 document.querySelector('.tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const tabs=['graph','ranking','history'],next=(tabs.indexOf(ui.tab)+(e.key==='ArrowRight'?1:2))%3;setTab(tabs[next]);$('tab-'+tabs[next]).focus();});
 document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&$('speechDialog').open&&!$('relationDialog').open&&!$('speakerDialog').open){e.preventDefault();submitSpeech();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!e.target.closest('input,textarea,select')&&!document.querySelector('dialog[open]')){e.preventDefault();e.shiftKey?redo():undo();}});
 const viewportSync=()=>{const v=window.visualViewport;document.documentElement.style.setProperty('--visible-height',(v?v.height:window.innerHeight)+'px');document.documentElement.style.setProperty('--visible-top',(v?v.offsetTop:0)+'px');document.documentElement.style.setProperty('--keyboard-inset',Math.max(0,v?window.innerHeight-v.height-v.offsetTop:0)+'px');const keyboardOpen=!!v&&window.innerHeight-v.height>150&&!!document.activeElement?.matches('input,textarea,select');document.body.classList.toggle('keyboard-open',keyboardOpen);};
 if(window.visualViewport){window.visualViewport.addEventListener('resize',viewportSync);window.visualViewport.addEventListener('scroll',viewportSync);}window.addEventListener('resize',viewportSync);viewportSync();
 window.addEventListener('pagehide',()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));saveDraft();}catch(e){}});
}
function back(){const top=[...document.querySelectorAll('dialog[open]')].at(-1);if(top){closeSheet(top.id);return true;}if(ui.zoom){ui.zoom=false;renderStats();renderGraph();return true;}if(ui.tab!=='graph'){setTab('graph');return true;}return false;}
/* ROLE_UI_MODULE */
window.Moontrace=Object.freeze({version:VERSION,appVersion:'3.0',ROLE_CATALOG,SKILLS,BOARD_PRESETS,roleCatalog,getRole,setPlayerRole,assertCore,roleResources,skillWarnings,makeSkillEvent,recognizeRoleClaim,resizeGame,cardinalityMarginals,infer,parseSpeech,geodesic,newState,sanitizeState,getState:()=>clone(state),getResult:()=>clone(result),back});
bind();bindRoleUI();paintIcons();restoreDraft();render();renderPreview();persist();if(loadError)setTimeout(()=>toast(loadError,true),300);
})();
