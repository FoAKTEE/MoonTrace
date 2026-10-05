/* Touch-first role board, player picker and multi-round ability ledger. */
let boardDraft=null,rolePicker={player:1,mode:'claim'},skillEditId=null;
function roleCampTitle(r){return r.camp==='wolf'?'狼牌':r.group==='民'?'平民':'非狼特殊牌';}
function roleMark(r){return `<span class="role-mark ${r.camp==='wolf'?'wolf':'good'}">${esc(r.name.slice(0,1))}</span>`;}
function playerRolePanel(p){
 const actual=getRole(state,p.confirmedRole),claim=getRole(state,p.claimedRole),r=actual||claim,resource=roleResources(state,p.id);
 const links=state.events.filter(e=>e.kind==='skill'&&e.skill.type==='link'&&e.skill.status==='confirmed'&&e.skill.targets.includes(p.id));
 const badge=(text)=>`<span class="resource-chip">${esc(text)}</span>`;
 let resources='';if(r?.id==='witch')resources=badge(`解药 ${resource.save}/1`)+badge(`毒药 ${resource.poison}/1`);
 if(['hunter','blackWolfKing'].includes(r?.id))resources=badge(`开枪 ${resource.shot}/1`);
 if(r?.id==='knight')resources=badge(`决斗 ${resource.duel}/1`);
 if(r?.id==='idiot')resources=badge(resource.voting?'尚未记录翻牌':'已翻牌 · 无投票权');
 const past=skillHistory(state,p.id,{confirmedOnly:true});if(r?.id==='guard'&&past.length){const g=past.filter(e=>e.skill.type==='guard').sort((a,b)=>b.round-a.round)[0];if(g)resources=badge(`第${g.round}晚 ${g.skill.targets.length?'守'+g.skill.targets[0]+'号':'空守'}`);}
 const roleRows=result.rolePs[p.id-1];const sorted=roleRows?Object.entries(roleRows).filter(([,v])=>v>1e-8).sort((a,b)=>b[1]-a[1]):[];
 return `<section class="player-role-panel"><div class="section-top"><h3>角色身份</h3><button class="text-button" data-open-board>板子配额 ${icon('chevron-right')}</button></div><div class="role-status-pair"><button data-pick-role="claim" data-role-player="${p.id}"><span>自称</span><strong>${claim?esc(claim.name):'未记录'}</strong>${icon('chevron-right')}</button><button data-pick-role="confirmed" data-role-player="${p.id}" class="${actual?'has-confirmed':''}"><span>已确认</span><strong>${actual?esc(actual.name):'未翻牌'}</strong>${icon('chevron-right')}</button></div>${r?`<p class="role-description">${esc(r.desc)}</p>`:''}${resources?`<div class="resource-row">${resources}<small>按已确认记录估算；未录入的使用不计</small></div>`:''}${links.length?`<p class="role-description lover-note">恋人记录：${links.map(e=>e.skill.targets.map(n=>n+'号').join(' ↔ ')).join('；')}。不自动改变底牌阵营。</p>`:''}<button class="skill-entry" data-open-skill="${p.id}">${icon('spark')}记${r?esc(r.name):'角色'}技能<span>${skillHistory(state,p.id).length} 条</span>${icon('chevron-right')}</button>${sorted.length?`<details class="advanced role-probs"><summary>角色概率<span>配额推算</span></summary><div class="advanced-content"><p class="help">同阵营剩余角色按配额分配；自称和技能报告不改变分布，未经实战校准。</p>${sorted.map(([id,v])=>`<div class="role-prob-row"><span>${esc(getRole(state,id).name)}</span><div><i style="width:${(v*100).toFixed(1)}%"></i></div><b>${(v*100).toFixed(1)}%</b></div>`).join('')}</div></details>`:''}<details class="advanced"><summary>警徽、第三方与死因</summary><div class="advanced-content"><label class="toggle-label"><input type="checkbox" id="playerSheriff" ${state.sheriff===p.id?'checked':''}><span>持有警徽（全场最多一人）</span></label><label class="toggle-label"><input type="checkbox" id="playerThirdParty" ${p.thirdParty?'checked':''}><span>参与第三方胜利条件</span></label><p class="help">这是胜利关系备注，不改变狼底牌概率，也不自动裁定胜负。</p><label class="field-label" for="playerDeathReason">记录死因（不自动标记出局）</label><select id="playerDeathReason">${Object.entries(DEATH_REASONS).map(([id,name])=>`<option value="${id}" ${p.deathReason===id?'selected':''}>${name}</option>`).join('')}</select></div></details></section>`;
}
function openRolePicker(player,mode='claim'){
 rolePicker={player,mode};$('rolePickerTitle').textContent=`${player}号 · ${mode==='confirmed'?'确认真实角色':'记录自称角色'}`;
 $('rolePickerHelp').textContent=mode==='confirmed'?'只填你确实掌握的底牌；确认后同步狼 / 非狼约束。':'自称只作标记，不锁定身份，不改变概率。';
 $('roleSearch').value='';renderRolePicker();openSheet('rolePickerDialog');
}
function renderRolePicker(){
 const query=$('roleSearch').value.trim(),p=state.players[rolePicker.player-1],selected=p[rolePicker.mode==='claim'?'claimedRole':'confirmedRole'];
 const roles=roleCatalog(state).filter(r=>!query||[r.name,...r.aliases].some(n=>n.includes(query)));
 $('rolePickerList').innerHTML=['good','wolf'].map(camp=>`<h3 class="role-group-title">${camp==='wolf'?'狼人底牌':'非狼底牌'}<small>${roles.filter(r=>r.camp===camp).length} 种</small></h3><div class="role-picker-grid">${roles.filter(r=>r.camp===camp).map(r=>`<button data-choose-role="${r.id}" class="${selected===r.id?'selected':''}">${roleMark(r)}<span><strong>${esc(r.name)}</strong><small>${state.roles.enabled?`配额 ${state.roles.counts[r.id]||0}`:roleCampTitle(r)}</small></span>${selected===r.id?'<i>✓</i>':''}</button>`).join('')}</div>`).join('');
 $('clearRole').textContent=rolePicker.mode==='confirmed'?'清除真实角色（保留阵营）':'清除自称';
}
function chooseRole(id){
 const {player,mode}=rolePicker,r=getRole(state,id);
 const apply=()=>{if(commit(`${player}号${mode==='claim'?'自称':'确认'}${r?.name||'角色已清除'}`,s=>setPlayerRole(s,player,id,mode),{quiet:true})){closeSheet('rolePickerDialog');render();toast(mode==='claim'?'已记录自称，概率不变':'已更新角色，配额与狼数重新计算');}};
 if(mode==='confirmed'&&id)askConfirm(`确认${player}号是${r.name}？`,'这是身份硬约束，不是对发言的猜测。该角色会占用板子配额，并同步狼 / 非狼身份。',apply);else apply();
}
function openBoard(){
 boardDraft=clone(state.roles);if(!Object.values(boardDraft.counts).some(Boolean))boardDraft.counts={wolf:state.wolves,villager:state.n-state.wolves};
 $('boardError').textContent='';$('boardEnabled').checked=boardDraft.enabled;$('boardRuleNote').value=boardDraft.rules.note;
 for(const [id,key] of [['ruleGuardRepeat','guardRepeat'],['ruleWitchDouble','witchDouble'],['rulePoisonStops','poisonStopsShot'],['ruleBlackExplode','blackWolfSelfExplode']])$(id).checked=boardDraft.rules[key];
 $('ruleSelfSave').value=boardDraft.rules.witchSelfSave;$('boardPreset').value='';$('boardCustomName').value='';$('boardCustomDesc').value='';
 renderBoardCounts();openSheet('boardDialog');
}
function draftCatalog(){return roleCatalog({...state,roles:boardDraft});}
function renderBoardCounts(){
 const fake={...state,roles:boardDraft},t=countsSummary(fake),catalog=draftCatalog();
 $('boardTotals').innerHTML=`<span><b>${t.n}</b> 人</span><span><b>${t.wolves}</b> 狼牌</span><span><b>${t.n-t.wolves}</b> 非狼牌</span>`;
 const active=catalog.filter(r=>(boardDraft.counts[r.id]||0)>0);
 $('boardRows').innerHTML=active.length?active.map(r=>`<div class="role-count-row">${roleMark(r)}<span class="role-count-name"><strong>${esc(r.name)}</strong><small>${roleCampTitle(r)}</small></span><div class="role-stepper"><button type="button" data-role-count="${r.id}" data-step="-1" aria-label="减少${esc(r.name)}">−</button><input type="number" inputmode="numeric" min="0" max="30" data-count-value="${r.id}" value="${boardDraft.counts[r.id]}" aria-label="${esc(r.name)}数量"><button type="button" data-role-count="${r.id}" data-step="1" aria-label="增加${esc(r.name)}">＋</button></div></div>`).join(''):'<p class="help">从下方添加角色，或选一个示例板子开始。</p>';
 $('boardAddRole').innerHTML='<option value="">添加其他角色…</option>'+catalog.filter(r=>!boardDraft.counts[r.id]).map(r=>`<option value="${r.id}">${esc(r.name)} · ${roleCampTitle(r)}</option>`).join('');
 $('boardCountHint').textContent=boardDraft.enabled?'保存后同步玩家人数与总狼数。缩减人数需要确认。':'尚未开启配额约束；角色选择和技能记录仍然可用。';
}
function saveBoard(e){
 e.preventDefault();boardDraft.enabled=$('boardEnabled').checked;
 for(const [id,key] of [['ruleGuardRepeat','guardRepeat'],['ruleWitchDouble','witchDouble'],['rulePoisonStops','poisonStopsShot'],['ruleBlackExplode','blackWolfSelfExplode']])boardDraft.rules[key]=$(id).checked;
 boardDraft.rules.witchSelfSave=$('ruleSelfSave').value;boardDraft.rules.note=$('boardRuleNote').value.trim();
 const draft=clone(boardDraft),t=countsSummary({...state,roles:draft});
 if(draft.enabled&&(!Number.isInteger(t.n)||t.n<5||t.n>30)){$('boardError').textContent='开启板子时总牌数须为 5–30 张。';return;}
 const candidate=clone(state);candidate.roles=draft;if(draft.enabled){resizeGame(candidate,t.n);candidate.wolves=t.wolves;}
 try{assertCore(candidate);}catch(err){$('boardError').textContent=err.message;return;}
 const apply=()=>{if(commit('已保存角色与板子',s=>{Object.keys(s).forEach(k=>delete s[k]);Object.assign(s,candidate);})){closeSheet('boardDialog');ui.speaker=clamp(ui.speaker,1,state.n);refreshPreview();render();}};
 if(draft.enabled&&t.n<state.n)askConfirm('缩减座位数量？',`将从 ${state.n} 人改成 ${t.n} 人，超出编号的玩家和相关技能记录会移除。可撤销，建议先导出。`,apply);else apply();
}
function addCustomRole(){
 const name=$('boardCustomName').value.trim(),camp=$('boardCustomCamp').value;
 if(!name){$('boardError').textContent='请输入自定义角色名称。';return;}
 if(draftCatalog().some(r=>r.name===name)){$('boardError').textContent='这个名称已存在，请直接添加该角色。';return;}
 if(boardDraft.custom.length>=24){$('boardError').textContent='最多添加 24 个自定义角色。';return;}
 const id='custom_'+uid();boardDraft.custom.push({id,name,camp,group:camp==='wolf'?'狼':'特殊',skills:['custom'],aliases:[],desc:$('boardCustomDesc').value.trim()||'按本桌规则记录。'});boardDraft.counts[id]=1;
 $('boardCustomName').value='';$('boardCustomDesc').value='';$('boardError').textContent='';renderBoardCounts();
}
function skillFormValue(){return {type:$('skillType').value,roleId:$('skillRole').value,targets:[$('skillTarget1').value,$('skillTarget2').value].filter((v,i)=>v&&i<SKILLS[$('skillType').value].targets).map(Number),status:$('skillStatus').value,result:$('skillResult').value,note:$('skillNote').value.trim(),override:$('skillOverride').checked};}
function openSkill(player=state.selected,event=null){
 skillEditId=event?.id||null;const p=state.players[player-1];
 $('skillTitle').textContent=event?'编辑技能记录':`${player}号 · 记技能`;$('skillActor').innerHTML=relationOptions();$('skillActor').value=event?.speaker||player;
 $('skillRole').innerHTML=roleCatalog(state).filter(r=>r.skills.length).map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('');
 const selectedRole=event?.skill.roleId||p.confirmedRole||p.claimedRole||'seer';$('skillRole').value=getRole(state,selectedRole)?.skills.length?selectedRole:'seer';
 $('skillRound').value=event?.round||state.round;$('skillRound').max=state.round;$('skillPhase').value=event?.phase||state.phase;
 $('skillStatus').value=event?.skill.status||'claimed';$('skillNote').value=event?.skill.note||'';$('skillOverride').checked=event?.skill.override||false;$('skillError').textContent='';
 renderSkillTypes(event?.skill.type);renderSkillFields(event?.skill);openSheet('skillDialog');
}
function renderSkillTypes(selected){const r=getRole(state,$('skillRole').value);const types=[...new Set([...r.skills,'custom'])];$('skillType').innerHTML=types.map(id=>`<option value="${id}">${SKILLS[id].name}</option>`).join('');if(selected&&types.includes(selected))$('skillType').value=selected;}
function renderSkillFields(value=null){
 const cfg=SKILLS[$('skillType').value];
 for(let i=1;i<=2;i++){const el=$('skillTarget'+i),v=value?.targets[i-1]??el.value;el.innerHTML=`<option value="">${cfg.optional?'空用 / 放弃':'请选择目标'}</option>`+relationOptions();el.value=v||'';el.closest('label').hidden=i>cfg.targets;el.required=i<=cfg.targets&&!cfg.optional;}
 $('skillResultWrap').hidden=!cfg.results;$('skillResult').innerHTML=(cfg.results||['未记录']).map(r=>`<option>${esc(r)}</option>`).join('');if(value?.result&&cfg.results?.includes(value.result))$('skillResult').value=value.result;
 $('skillRoleHelp').textContent=getRole(state,$('skillRole').value)?.desc||'';refreshSkillWarnings();
}
function refreshSkillWarnings(){
 const a=skillFormValue(),warnings=skillWarnings(state,Number($('skillActor').value),a,Number($('skillRound').value),$('skillPhase').value,skillEditId);
 $('skillWarnings').textContent=warnings.join(' ');$('skillOverrideWrap').hidden=!warnings.length;
 $('skillStatusHint').textContent=a.status==='confirmed'?'计入药量 / 技能次数和冲突提醒；不自动确认角色、目标身份或死亡。':'只保留声称的行为，不消耗药量，也不改变角色或狼概率。';
}
function saveSkill(e){
 e.preventDefault();const a=skillFormValue(),actor=Number($('skillActor').value),round=Number($('skillRound').value),phase=$('skillPhase').value;
 if(!Number.isInteger(round)||round<1||round>state.round){$('skillError').textContent='只能补录第 1 轮到当前轮的技能。';return;}
 if(round===state.round&&state.phase==='day'&&phase==='night'){ $('skillError').textContent='当前还未进入本轮夜晚；请先推进阶段，或补录上一晚。';return; }
 if(new Set(a.targets).size!==a.targets.length){$('skillError').textContent='两个目标不能是同一人。';return;}
 const warnings=skillWarnings(state,actor,a,round,phase,skillEditId);
 if(warnings.length&&!a.override){$('skillError').textContent='存在规则提醒。核对后勾选「按本桌规则保留」才能记录。';return;}
 const ev=makeSkillEvent(state,actor,a,round,phase);
 if(commit(skillEditId?'已更新技能记录':'已记录技能',s=>{if(skillEditId){const idx=s.events.findIndex(e=>e.id===skillEditId);if(idx<0)throw Error('原记录已不存在。');ev.id=skillEditId;ev.createdAt=s.events[idx].createdAt;s.events[idx]=ev;}else s.events.push(ev);},{quiet:true})){closeSheet('skillDialog');render();toast(a.status==='confirmed'?'已记录确认技能，技能余量已更新':'已记录技能声称，概率与技能余量不变');}
}
function renderClaimPreview(){
 const claim=recognizeRoleClaim($('speechInput').value,ui.speaker,state);ui.detectedClaim=claim;
 $('roleClaimPreview').hidden=!claim;
 if(claim){$('roleClaimText').textContent=`同时记录 ${ui.speaker}号自称${getRole(state,claim.roleId).name}`;}
}
function bindRoleUI(){
 $('rolesShortcut').onclick=openBoard;$('rolesMenuBtn').onclick=()=>{closeSheet('menuDialog');openBoard();};
 $('skillShortcut').onclick=()=>openSkill(state.selected);
 $('recordRoleClaim').onchange=saveDraft;
 $('roleSearch').oninput=renderRolePicker;$('clearRole').onclick=()=>chooseRole('');
 $('boardPreset').innerHTML='<option value="">选择示例板子…</option>'+Object.entries(BOARD_PRESETS).map(([id,p])=>`<option value="${id}">${p.name}</option>`).join('');
 $('boardPreset').onchange=e=>{if(!e.target.value)return;boardDraft.counts=clone(BOARD_PRESETS[e.target.value].counts);boardDraft.enabled=true;$('boardEnabled').checked=true;renderBoardCounts();};
 $('boardEnabled').onchange=()=>{boardDraft.enabled=$('boardEnabled').checked;renderBoardCounts();};
 $('boardAddRole').onchange=e=>{if(e.target.value){boardDraft.counts[e.target.value]=1;renderBoardCounts();}};
 $('boardRows').addEventListener('change',e=>{const id=e.target.dataset.countValue;if(id){const n=Number(e.target.value);if(!Number.isInteger(n)||n<0||n>30){$('boardError').textContent='角色数量须为 0–30 的整数。';renderBoardCounts();return;}boardDraft.counts[id]=n;renderBoardCounts();}});
 $('boardForm').onsubmit=saveBoard;$('boardAddCustom').onclick=addCustomRole;
 $('skillRole').onchange=()=>{renderSkillTypes();renderSkillFields();};$('skillType').onchange=()=>renderSkillFields();
 $('skillForm').addEventListener('change',refreshSkillWarnings);$('skillForm').onsubmit=saveSkill;
 document.addEventListener('click',e=>{
  const picker=e.target.closest('[data-pick-role]');if(picker){openRolePicker(Number(picker.dataset.rolePlayer),picker.dataset.pickRole);return;}
  const choose=e.target.closest('[data-choose-role]');if(choose){chooseRole(choose.dataset.chooseRole);return;}
  if(e.target.closest('[data-open-board]')){openBoard();return;}
  const skill=e.target.closest('[data-open-skill]');if(skill){openSkill(Number(skill.dataset.openSkill));return;}
  const edit=e.target.closest('[data-edit-skill]');if(edit){const ev=state.events.find(ev=>ev.id===edit.dataset.editSkill);if(ev)openSkill(ev.speaker,ev);return;}
  const count=e.target.closest('[data-role-count]');if(count){const id=count.dataset.roleCount;boardDraft.counts[id]=clamp((boardDraft.counts[id]||0)+Number(count.dataset.step),0,30);renderBoardCounts();}
 });
 $('playerDetail').addEventListener('change',e=>{const id=state.selected;
  if(e.target.id==='playerSheriff'){const checked=e.target.checked;commit('已更新警徽',s=>s.sheriff=checked?id:0,{quiet:true});}
  if(e.target.id==='playerThirdParty'){const checked=e.target.checked;commit('已更新第三方备注',s=>s.players[id-1].thirdParty=checked,{quiet:true});}
  if(e.target.id==='playerDeathReason'){const val=e.target.value;commit('已记录死因，存活状态未改变',s=>s.players[id-1].deathReason=val,{quiet:true});}
 });
}
