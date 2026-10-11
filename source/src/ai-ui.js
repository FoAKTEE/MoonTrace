/* Optional remote parser and iMessage inbox. The server only proposes relations; normalizeRemote() validates them
 * and every probability is still computed locally by infer(). Settings live in their own key, never in exported saves. */
const AI_KEY='moontrace-ai-v1',ROOM_RE=/^[A-Za-z0-9_-]{6,32}$/;
const aiRun={busy:false,timer:0,syncing:false,failures:0,lastSync:0,error:''};
function aiConfig(){
 try{const c=JSON.parse(localStorage.getItem(AI_KEY)||'null');if(c&&typeof c==='object')return {endpoint:String(c.endpoint||''),token:String(c.token||''),room:typeof c.room==='string'&&ROOM_RE.test(c.room)?c.room:'',inbox:c.inbox===true,cursor:Number.isInteger(c.cursor)&&c.cursor>=0?c.cursor:0};}catch(e){}
 return {endpoint:'',token:'',room:'',inbox:false,cursor:0};
}
function saveAiConfig(patch){const next={...aiConfig(),...patch};try{localStorage.setItem(AI_KEY,JSON.stringify(next));}catch(e){}return next;}
function aiReady(c=aiConfig()){return !!(c.endpoint&&c.token);}
function cleanEndpoint(raw){
 const v=String(raw||'').trim();if(!v)return '';
 let url;try{url=new URL(v);}catch(e){throw Error('服务器地址不是有效网址。');}
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error('服务器地址须以 https:// 开头。');
 return (url.origin+url.pathname).replace(/\/+$/,'');
}
function newRoomId(){const abc='abcdefghjkmnpqrstuvwxyz23456789',bytes=crypto.getRandomValues(new Uint8Array(12));return Array.from(bytes,(b,i)=>(i&&i%4===0?'-':'')+abc[b%abc.length]).join('');}
async function aiFetch(path,body,c=aiConfig(),timeout=150000){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeout);
 try{
  const res=await fetch(c.endpoint+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+c.token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:ctrl.signal,cache:'no-store'});
  let data=null;try{data=await res.json();}catch(e){}
  if(res.status===401)throw Error('访问口令不正确。');
  if(!res.ok)throw Error(typeof data?.error==='string'?data.error.slice(0,120):`服务器返回 ${res.status}。`);
  return data;
 }catch(e){if(e.name==='AbortError')throw Error('服务器响应超时。');if(e instanceof TypeError)throw Error('无法连接服务器，请检查地址与网络。');throw e;}
 finally{clearTimeout(timer);}
}
/** Seat → role name, so the parser can resolve “预言家查杀7” to a seat. Claims stay labelled as claims. */
function seatClaims(){const out={};for(const p of state.players){const r=getRole(state,p.confirmedRole)||getRole(state,p.claimedRole);if(r)out[p.id]=r.name+(p.confirmedRole?'':'（自称）');}return out;}
function claimRoleId(s,name){const t=String(name||'').trim();if(!t)return '';const r=roleCatalog(s).find(r=>r.name===t||(r.aliases||[]).includes(t));return r?r.id:'';}
function renderAiButton(){const btn=$('aiParseBtn');btn.hidden=!aiReady();btn.disabled=aiRun.busy||!$('speechInput').value.trim();$('aiParseLabel').textContent=aiRun.busy?'识别中…':'AI 识别';}
async function aiParseSpeech(){
 const text=$('speechInput').value.trim(),speaker=ui.speaker,n=state.n;if(!text||aiRun.busy)return;
 aiRun.busy=true;renderAiButton();
 try{
  const data=await aiFetch('/api/parse',{mode:'speech',text,speaker,n,claims:seatClaims()});
  if($('speechInput').value.trim()!==text||ui.speaker!==speaker||state.n!==n){toast('发言在识别期间被修改，请重新点「AI 识别」。',true);return;}
  const parsed=normalizeRemote(data,n,speaker);
  ui.pending=parsed.events[0]?.relations||[];ui.warnings=parsed.warnings;ui.via='ai';renderPreview();renderSpeaker();saveDraft();
  toast(ui.pending.length?`AI 识别出 ${ui.pending.length} 条关系，确认后才计入`:'AI 没有识别出明确的表态');
 }catch(e){toast('AI 识别失败：'+e.message+' 已保留本地规则结果。',true);}
 finally{aiRun.busy=false;renderAiButton();}
}
function renderAiStatus(){
 const c=aiConfig(),ready=aiReady(c),inbox=ready&&c.inbox&&c.room;
 $('aiMenuState').textContent=!ready?'可选 · 未开启':inbox?`已开启 · 房间 ${c.room}`:'已开启 AI 识别';
 $('privacyNote').textContent=ready?'点「AI 识别」或接收 iMessage 时，原文会发到你设置的服务器，由 Anthropic 的 Claude 解析；概率仍在本机计算，其余数据只保存在这台设备上。重要对局请导出备份。':'发言只保存在这台设备上，不上传，也不需要账号。重要对局请导出备份。';
 $('aiStatus').textContent=!inbox?'':aiRun.error?`同步失败：${aiRun.error} 稍后自动重试。`:aiRun.lastSync?`已同步 ${new Date(aiRun.lastSync).toLocaleTimeString('zh-CN',{hour12:false})}`:'等待第一次同步…';
}
function openAiDialog(){
 closeSheet('menuDialog');const c=aiConfig();
 $('aiEndpoint').value=c.endpoint||(location.protocol==='https:'?location.origin:'');$('aiToken').value=c.token;$('aiRoom').value=c.room;$('aiInbox').checked=c.inbox;
 $('aiError').textContent='';$('aiTestResult').textContent='';renderAiStatus();openSheet('aiDialog');
}
function readAiForm(){
 const endpoint=cleanEndpoint($('aiEndpoint').value),token=$('aiToken').value.trim(),room=$('aiRoom').value.trim(),inbox=$('aiInbox').checked;
 if(room&&!ROOM_RE.test(room))throw Error('房间号须为 6–32 位字母、数字、- 或 _。');
 if((token||inbox)&&!endpoint)throw Error('请先填写服务器地址。');
 if(endpoint&&!token)throw Error('请填写访问口令。');
 if(inbox&&!room)throw Error('接收 iMessage 记录需要房间号，可点「新建」。');
 return {endpoint,token,room,inbox};
}
function saveAiForm(e){
 e.preventDefault();let next;try{next=readAiForm();}catch(err){$('aiError').textContent=err.message;return;}
 const old=aiConfig();saveAiConfig({...next,cursor:next.room===old.room?old.cursor:0});
 aiRun.failures=0;aiRun.error='';aiRun.lastSync=0;closeSheet('aiDialog');renderAiButton();renderAiStatus();scheduleSync(0);
 toast(!next.endpoint?'已保存：仅本机模式':next.inbox?'已保存，开始接收 iMessage 记录':'已保存，记发言时可用 AI 识别');
}
async function testAi(){
 let c;try{c={...aiConfig(),...readAiForm()};}catch(err){$('aiError').textContent=err.message;return;}
 if(!c.endpoint){$('aiError').textContent='请先填写服务器地址。';return;}
 $('aiError').textContent='';$('aiTestResult').textContent='连接中…';
 try{const d=await aiFetch('/api/health',null,c,10000);$('aiTestResult').textContent=d?.ai?'连接成功，AI 可用':'已连接，但服务器还没配置 Anthropic API key';}
 catch(err){$('aiTestResult').textContent='';$('aiError').textContent=err.message;}
}
function clearAi(){askConfirm('停用 AI 与 iMessage？','将清除本机保存的服务器地址、口令和房间号。已记录的发言不受影响。',()=>{try{localStorage.removeItem(AI_KEY);}catch(e){}clearTimeout(aiRun.timer);aiRun.error='';aiRun.lastSync=0;closeAllSheets();renderAiButton();renderAiStatus();toast('已停用，回到纯本机模式');});}
function scheduleSync(delay=4000){clearTimeout(aiRun.timer);const c=aiConfig();if(!c.inbox||!c.room||!aiReady(c)||document.hidden)return;aiRun.timer=setTimeout(syncInbox,delay);}
async function syncInbox(){
 const c=aiConfig();if(!c.inbox||!c.room||!aiReady(c)||aiRun.syncing)return;
 aiRun.syncing=true;let failed=false;
 try{
  const data=await aiFetch(`/api/rooms/${encodeURIComponent(c.room)}/sync`,{after:c.cursor,n:state.n,claims:seatClaims()},c,15000);
  const now=aiConfig();
  if(now.room===c.room&&now.cursor===c.cursor){
   if(Number.isInteger(data?.last)&&data.last<c.cursor)saveAiConfig({cursor:0}); // room was recreated on the server: start over
   else applyInbox(Array.isArray(data?.entries)?data.entries:[],c.room,c.cursor);
  }
  aiRun.error='';aiRun.failures=0;aiRun.lastSync=Date.now();
 }catch(e){failed=true;aiRun.failures++;aiRun.error=e.message;}
 finally{aiRun.syncing=false;renderAiStatus();scheduleSync(failed?Math.min(60000,4000*2**aiRun.failures):4000);}
}
/** Each room entry is one iMessage: commit it separately so undo and retraction stay per message. */
function applyInbox(entries,room,cursor){
 const fresh=entries.filter(x=>Number.isInteger(x?.seq)&&x.seq>cursor).sort((a,b)=>a.seq-b.seq);if(!fresh.length)return;
 const before=result.ps.slice(),targets=new Set(),notes=[];let added=0,removed=0;
 for(const entry of fresh){
  if(entry.kind==='retract'&&Number.isInteger(entry.target)){
   const rid=`${room}:${entry.target}`;
   if(state.events.some(e=>e.rid===rid)&&commit('iMessage 撤回记录',s=>{s.events=s.events.filter(e=>e.rid!==rid);},{quiet:true}))removed++;
   continue;
  }
  if(entry.kind!=='event')continue;
  const rid=`${room}:${entry.seq}`;if(state.events.some(e=>e.rid===rid))continue;
  let parsed;try{parsed=normalizeRemote(entry,state.n);}catch(e){notes.push(e.message);continue;}
  notes.push(...parsed.warnings);if(!parsed.events.length)continue;
  const ok=commit('iMessage 记录',s=>{for(const ev of parsed.events){
   const round=ev.round>=1&&ev.round<s.round?ev.round:s.round; // notes may name earlier rounds; never a future one
   s.events.push({...makeEvent(ev.speaker,ev.text||String(entry.text||'').slice(0,6000),ev.relations,round,round===s.round?s.phase:'day'),via:'imessage',rid});
   const roleId=claimRoleId(s,ev.claim);if(roleId)setPlayerRole(s,ev.speaker,roleId,'claim');
  }},{quiet:true});
  if(ok){added+=parsed.events.length;parsed.events.forEach(ev=>ev.relations.forEach(r=>targets.add(r.to)));}
 }
 saveAiConfig({cursor:fresh.at(-1).seq});
 if(!added&&!removed){if(notes.length)toast('iMessage：'+notes[0],true);return;}
 if(targets.size&&!document.querySelector('dialog[open]')){
  state.selected=[...targets].sort((a,b)=>Math.abs(result.ps[b-1]-before[b-1])-Math.abs(result.ps[a-1]-before[a-1])||a-b)[0];state.layout.focus=true;render();persist();
 }
 toast(`iMessage：新增 ${added} 条记录${removed?`，撤回 ${removed} 条`:''}`);
}
/** A shared link like …/#room=abcd-efgh-jkmn joins that room on this device; the token is never put in links. */
function readRoomHash(){
 const m=location.hash.match(/[#&]room=([A-Za-z0-9_-]{6,32})(?=&|$)/);if(!m)return;
 try{history.replaceState(null,'',location.pathname+location.search);}catch(e){}
 const old=aiConfig();saveAiConfig({room:m[1],inbox:true,cursor:m[1]===old.room?old.cursor:0});
 if(!aiReady())setTimeout(()=>{openAiDialog();$('aiError').textContent='填写服务器地址和访问口令后，即可接收这个房间的 iMessage 记录。';},300);
}
function bindAiUI(){
 $('aiMenuBtn').onclick=openAiDialog;$('aiForm').onsubmit=saveAiForm;$('aiTest').onclick=testAi;$('aiClear').onclick=clearAi;
 $('aiNewRoom').onclick=()=>{$('aiRoom').value=newRoomId();$('aiInbox').checked=true;};$('aiParseBtn').onclick=aiParseSpeech;
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(aiRun.timer);else scheduleSync(0);});
 window.addEventListener('online',()=>scheduleSync(0));
 readRoomHash();renderAiStatus();scheduleSync(300);
}
