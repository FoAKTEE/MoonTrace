/* Role extension v3. Card alignment and victory affiliation are intentionally separate.
 * Speech/skill claims never silently become hard identity constraints.
 * Rule checks are warnings for a configurable table, NOT an automated game referee. */
const ROLE_CATALOG = Object.freeze([
 {id:'villager',name:'平民',camp:'good',group:'民',aliases:['村民'],skills:[],desc:'没有主动技能；用发言与票型记录推理。'},
 {id:'seer',name:'预言家',camp:'good',group:'神',aliases:[],skills:['check'],desc:'记录每晚查验对象与报告结果；报验不等于已经证实的身份。'},
 {id:'guard',name:'守卫',camp:'good',group:'神',aliases:[],skills:['guard'],desc:'记录每晚守护对象或空守；默认提醒不能连续两晚守同一人。'},
 {id:'witch',name:'女巫',camp:'good',group:'神',aliases:[],skills:['save','poison'],desc:'分别记录解药、毒药；已确认的使用消耗药量。自救与同夜双药按本桌设置。'},
 {id:'hunter',name:'猎人',camp:'good',group:'神',aliases:['猎手'],skills:['shoot'],desc:'记录开枪对象或压枪；死因限制按本桌规则，仅提示，不自动判定死亡。'},
 {id:'idiot',name:'白痴',camp:'good',group:'神',aliases:[],skills:['reveal'],desc:'记录翻牌免除放逐；确认的翻牌记录显示失去投票权，不自动标记出局。'},
 {id:'cupid',name:'丘比特',camp:'good',group:'特殊',aliases:['爱神'],skills:['link'],desc:'记录两名恋人。底牌是否为狼与是否参与第三方胜利分开，不自动推断恋人阵营。'},
 {id:'knight',name:'骑士',camp:'good',group:'神',aliases:[],skills:['duel'],desc:'记录决斗对象及法官给出的结果；结果不会自动锁定目标身份或推进昼夜。'},
 {id:'wolf',name:'狼人',camp:'wolf',group:'狼',aliases:['小狼','普通狼'],skills:['attack','explode'],desc:'记录夜刀与自爆；共同夜刀可由任一已知狼的技能页录入，不自动结算。'},
 {id:'whiteWolfKing',name:'白狼王',camp:'wolf',group:'狼',aliases:[],skills:['attack','explodeTake'],desc:'记录自爆带走目标。自爆与带人合为一条记录；死亡需按法官结果另行标记。'},
 {id:'blackWolfKing',name:'黑狼王',camp:'wolf',group:'狼',aliases:['狼王','狼枪'],skills:['attack','blackShot','explode'],desc:'记录出局开枪目标；毒杀、殉情、自爆等限制有版本差异，请核对本桌规则。'},
 {id:'nightmare',name:'梦魇',camp:'wolf',group:'狼',aliases:[],skills:['fear','attack'],desc:'记录恐惧/封锁技能的目标；不自动假定被封锁者身份或技能成败。'},
 {id:'wolfBeauty',name:'狼美人',camp:'wolf',group:'狼',aliases:[],skills:['charm','attack'],desc:'记录魅惑目标；殉情、骑士互动与能否自爆由法官结算。'},
 {id:'hiddenWolf',name:'隐狼',camp:'wolf',group:'狼',aliases:[],skills:['custom'],desc:'记录隐藏狼身份与继承信息；查验表现依板子，金水不能机械等于非狼。'},
 {id:'gargoyle',name:'石像鬼',camp:'wolf',group:'狼',aliases:[],skills:['investigate','attack'],desc:'记录查验底牌和继承刀权；不自动判定继承时机。'},
 {id:'evilKnight',name:'恶灵骑士',camp:'wolf',group:'狼',aliases:[],skills:['reflect','attack'],desc:'记录反伤与夜间技能结果；免疫、反伤顺序按本桌规则。'},
 {id:'dreamer',name:'摄梦人',camp:'good',group:'神',aliases:[],skills:['dream'],desc:'记录每晚梦游目标；梦死与免疫结果由法官确认。'},
 {id:'magician',name:'魔术师',camp:'good',group:'神',aliases:[],skills:['swap'],desc:'记录交换的两名玩家；本应用不自动重定向其他技能。'},
 {id:'gravekeeper',name:'守墓人',camp:'good',group:'神',aliases:[],skills:['grave'],desc:'记录墓验对象与报告；不直接把发言报告写成真实身份。'},
 {id:'bearTamer',name:'驯熊师',camp:'good',group:'神',aliases:[],skills:['roar'],desc:'记录咆哮结果；邻座、空位与特殊狼规则不自动推演。'}
]);
const SKILLS = Object.freeze({
 attack:{name:'夜刀',targets:1,optional:true,phase:'night'},
 explode:{name:'自爆',targets:0,phase:'day',once:true},
 check:{name:'查验',targets:1,phase:'night',results:['未记录','报金水','报查杀']},
 guard:{name:'守护',targets:1,optional:true,phase:'night'},
 save:{name:'使用解药',targets:1,phase:'night',once:true},
 poison:{name:'使用毒药',targets:1,phase:'night',once:true},
 shoot:{name:'开枪',targets:1,optional:true,phase:'any',once:true},
 blackShot:{name:'狼王开枪',targets:1,optional:true,phase:'any',once:true},
 explodeTake:{name:'自爆带人',targets:1,optional:true,phase:'day',once:true},
 reveal:{name:'翻牌免放逐',targets:0,phase:'day',once:true},
 link:{name:'连接恋人',targets:2,phase:'night',once:true},
 duel:{name:'决斗',targets:1,phase:'day',once:true,results:['未记录','目标出局','骑士出局','其他 / 特殊判定']},
 fear:{name:'恐惧 / 封锁',targets:1,phase:'night'},
 charm:{name:'魅惑',targets:1,phase:'night'},
 investigate:{name:'查验底牌',targets:1,phase:'night'},
 reflect:{name:'反伤',targets:1,phase:'night',once:true},
 dream:{name:'摄梦',targets:1,phase:'night'},
 swap:{name:'交换',targets:2,phase:'night'},
 grave:{name:'墓验',targets:1,phase:'night',results:['未记录','报好人','报狼人']},
 roar:{name:'熊咆哮',targets:0,phase:'night',results:['未记录','咆哮','未咆哮']},
 custom:{name:'其他技能 / 备注',targets:1,optional:true,phase:'any'}
});
const DEATH_REASONS = Object.freeze({unknown:'死因未明',vote:'被放逐',attack:'狼刀',poison:'毒杀',shot:'开枪带走',duel:'骑士决斗',explode:'自爆',explodeTake:'自爆带走',lover:'殉情',dream:'梦死',other:'其他'});
const BOARD_PRESETS = Object.freeze({
 classic:{name:'12人 · 预女猎白',counts:{villager:4,wolf:4,seer:1,witch:1,hunter:1,idiot:1}},
 white:{name:'12人 · 白狼王守卫',counts:{villager:4,wolf:3,whiteWolfKing:1,seer:1,witch:1,hunter:1,guard:1}},
 black:{name:'12人 · 黑狼王守卫',counts:{villager:4,wolf:3,blackWolfKing:1,seer:1,witch:1,hunter:1,guard:1}},
 knight:{name:'12人 · 骑士示例',counts:{villager:4,wolf:3,whiteWolfKing:1,seer:1,witch:1,guard:1,knight:1}},
 many:{name:'17人 · 多神自定义示例',counts:{villager:5,wolf:3,whiteWolfKing:1,blackWolfKing:1,nightmare:1,seer:1,guard:1,witch:1,hunter:1,cupid:1,knight:1}}
});
function defaultRoleConfig(){return {enabled:false,counts:{},custom:[],rules:{guardRepeat:false,witchDouble:false,witchSelfSave:'first',poisonStopsShot:true,blackWolfSelfExplode:false,note:''}};}
function playerRoleDefaults(){return {claimedRole:'',confirmedRole:'',thirdParty:false,deathReason:'unknown'};}
function roleCatalog(s){return [...ROLE_CATALOG,...(s.roles?.custom||[])];}
function getRole(s,id){return roleCatalog(s).find(r=>r.id===id)||null;}
function roleLabel(s,p){const r=getRole(s,p.confirmedRole||p.claimedRole);return r?`${p.confirmedRole?'确认':'自称'}${r.name}`:'';}
function countsSummary(s,counts=s.roles.counts){let n=0,wolves=0;for(const [id,count] of Object.entries(counts)){n+=count;if(getRole(s,id)?.camp==='wolf')wolves+=count;}return {n,wolves};}
function normalizeRoles(input,s){
 const data=input.roles||{},base=defaultRoleConfig();
 if(data.custom!==undefined&&!Array.isArray(data.custom))throw Error('自定义角色列表无效。');
 if((data.custom||[]).length>24)throw Error('最多支持 24 个自定义角色。');
 const used=new Set(ROLE_CATALOG.map(r=>r.id));
 base.custom=(data.custom||[]).map(r=>{
  if(typeof r.id!=='string'||!/^custom_[A-Za-z0-9_-]{1,48}$/.test(r.id)||used.has(r.id))throw Error('自定义角色编号无效或重复。');
  used.add(r.id);if(!['good','wolf'].includes(r.camp)||typeof r.name!=='string'||!r.name.trim())throw Error('自定义角色名称或底牌阵营无效。');
  return {id:r.id,name:r.name.trim().slice(0,16),camp:r.camp,group:r.camp==='wolf'?'狼':'特殊',desc:String(r.desc||'按本桌规则记录。').slice(0,240),skills:['custom'],aliases:[]};
 });
 base.enabled=data.enabled===true;
 if(data.counts!==undefined&&(!data.counts||Array.isArray(data.counts)||typeof data.counts!=='object'))throw Error('板子配额无效。');
 for(const [id,n] of Object.entries(data.counts||{})){if(!used.has(id)||!Number.isInteger(n)||n<0||n>30)throw Error('角色配额无效。');if(n)base.counts[id]=n;}
 const rules=data.rules||{};
 for(const key of ['guardRepeat','witchDouble','poisonStopsShot','blackWolfSelfExplode'])if(typeof rules[key]==='boolean')base.rules[key]=rules[key];
 if(['never','first','always'].includes(rules.witchSelfSave))base.rules.witchSelfSave=rules.witchSelfSave;
 base.rules.note=String(rules.note||'').slice(0,1500);s.roles=base;
 s.sheriff=Number.isInteger(input.sheriff)&&input.sheriff>=1&&input.sheriff<=s.n?input.sheriff:0;
 for(const p of s.players){const original=input.players.find(x=>x.id===p.id)||{};Object.assign(p,playerRoleDefaults());
  for(const key of ['claimedRole','confirmedRole']){const val=original[key]||'';if(typeof val!=='string'||(val&&!used.has(val)))throw Error(`${p.id}号角色无效。`);p[key]=val;}
  p.thirdParty=original.thirdParty===true;p.deathReason=Object.hasOwn(DEATH_REASONS,original.deathReason)?original.deathReason:'unknown';
  if(p.confirmedRole&&getRole(s,p.confirmedRole).camp!==p.fixed)throw Error(`${p.id}号的已确认角色与底牌阵营冲突。`);
 }
}
function normalizeSkill(e,s){
 if(e.kind!=='skill')return null;
 const a=e.skill;
 if(!a||!Object.hasOwn(SKILLS,a.type)||!getRole(s,a.roleId)||!['claimed','confirmed'].includes(a.status))throw Error('技能记录类型或角色无效。');
 const targets=a.targets;if(!Array.isArray(targets)||targets.length>2||new Set(targets).size!==targets.length||targets.some(i=>!Number.isInteger(i)||i<1||i>s.n))throw Error('技能目标无效。');
 const cfg=SKILLS[a.type];if(targets.length!==cfg.targets&&!(cfg.optional&&targets.length===0))throw Error('技能目标数量与类型不一致。');
 return {type:a.type,roleId:a.roleId,targets:targets.slice(),status:a.status,result:String(a.result||'').slice(0,80),note:String(a.note||'').slice(0,1500),override:a.override===true};
}
function assertRoles(s){
 if(!s.roles)return;
 const roles=roleCatalog(s),known=new Map(roles.map(r=>[r.id,0]));
 if(roles.length>ROLE_CATALOG.length+24)throw Error('自定义角色过多。');
 for(const p of s.players){
  for(const key of ['claimedRole','confirmedRole'])if(p[key]&&!getRole(s,p[key]))throw Error(`${p.id}号的角色不存在。`);
  if(p.confirmedRole){const r=getRole(s,p.confirmedRole);if(p.fixed!==r.camp)throw Error(`${p.id}号的已确认角色与底牌阵营冲突。`);known.set(r.id,known.get(r.id)+1);}
 }
 if(s.roles.enabled){
  for(const [id,n] of Object.entries(s.roles.counts)){if(!known.has(id)||!Number.isInteger(n)||n<0||n>30)throw Error('角色配额无效。');}
  const totals=countsSummary(s);if(totals.n!==s.n)throw Error(`板子共 ${totals.n} 张牌，与 ${s.n} 人不符。请到「角色与板子」调整。`);
  if(totals.wolves!==s.wolves)throw Error(`板子中有 ${totals.wolves} 张狼牌，与总狼数 ${s.wolves} 不符。`);
  for(const [id,n] of known)if(n>(s.roles.counts[id]||0))throw Error(`已确认 ${n} 位${getRole(s,id).name}，超过板子配额 ${s.roles.counts[id]||0}。`);
 }
 for(const e of s.events)if(e.kind==='skill')normalizeSkill(e,s);
}
function inferRoles(s,base){
 const catalog=roleCatalog(s),enabled=!!s.roles?.enabled,remaining={...(s.roles?.counts||{})};
 for(const p of s.players)if(p.confirmedRole)remaining[p.confirmedRole]=(remaining[p.confirmedRole]||0)-1;
 const totals={wolf:0,good:0};if(enabled)for(const r of catalog)totals[r.camp]+=Math.max(0,remaining[r.id]||0);
 // Conditional on binary camp, residual roles are exchangeable. This preserves EACH
 // role count exactly in expectation; role claims have no uncalibrated numeric bonus.
 const rolePs=s.players.map(p=>{if(p.confirmedRole)return {[p.confirmedRole]:1};if(!enabled)return null;
  const row={};for(const r of catalog){const left=remaining[r.id]||0;if(left>0&&totals[r.camp]>0)row[r.id]=(r.camp==='wolf'?base.ps[p.id-1]:1-base.ps[p.id-1])*left/totals[r.camp];}return row;
 });
 const godPs=rolePs.map(row=>row?Object.entries(row).reduce((sum,[id,p])=>sum+(getRole(s,id)?.camp==='good'&&getRole(s,id)?.group!=='民'?p:0),0):null);
 return {...base,rolePs,godPs,roleRemaining:remaining,roleCountsEnabled:enabled};
}
function infer(s){const base=inferBase(s);return inferRoles(s,base);}
function setPlayerRole(s,id,roleId,mode){
 const p=s.players[id-1];if(!p)throw Error('玩家不存在。');
 if(roleId&&!getRole(s,roleId))throw Error('角色不存在。');
 if(mode==='claim'){p.claimedRole=roleId;return;}
 if(mode!=='confirmed')throw Error('请选择自称或已确认。');
 p.confirmedRole=roleId;if(roleId)p.fixed=getRole(s,roleId).camp;
 // Clearing the exact card keeps independently useful camp knowledge, stated in UI.
}
function recognizeRoleClaim(text,speaker,s){
 const trimmed=text.trim();if(!trimmed||/如果|假如|假设|要是|“|”|「|」|听说|他说|她说/.test(trimmed))return null;
 const names=roleCatalog(s).flatMap(r=>[r.name,...r.aliases].map(name=>({name,id:r.id}))).sort((a,b)=>b.name.length-a.name.length);
 for(const {name,id} of names){const safe=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  if(new RegExp(`(?:^|[，,。；;\\n！!？?])\\s*(?:我(?:是|就是|这张牌是)|我跳|我自称|我底牌是)\\s*${safe}(?=$|[，,。；;\\n！!？?\\s]|牌|身份|我|今晚|昨晚|今天|昨天)`).test(trimmed))return {speaker,roleId:id};
 }return null;
}
function skillHistory(s,id,{confirmedOnly=false,excludeId=null}={}){return s.events.filter(e=>e.kind==='skill'&&e.speaker===id&&e.id!==excludeId&&(!confirmedOnly||e.skill.status==='confirmed'));}
function roleResources(s,id){
 const list=skillHistory(s,id,{confirmedOnly:true}),used=type=>list.filter(e=>e.skill.type===type).length;
 return {save:Math.max(0,1-used('save')),poison:Math.max(0,1-used('poison')),shot:Math.max(0,1-used('shoot')-used('blackShot')),duel:Math.max(0,1-used('duel')),voting:!used('reveal'),links:list.filter(e=>e.skill.type==='link').map(e=>e.skill.targets),used};
}
function skillWarnings(s,actor,a,round,phase,excludeId=null){
 const warnings=[],p=s.players[actor-1],cfg=SKILLS[a.type],role=getRole(s,a.roleId),rules=s.roles.rules;
 if(!p||!cfg||!role)return ['玩家或技能无效。'];
 if(!role.skills.includes(a.type)&&a.type!=='custom')warnings.push('此技能不在所选角色的默认技能中；可能是本桌变体。');
 if(cfg.phase!=='any'&&cfg.phase!==phase)warnings.push(`此技能默认在${cfg.phase==='night'?'夜晚':'白天'}使用；你正在记录${phase==='night'?'夜晚':'白天'}。`);
 if(a.type==='link'&&round!==1)warnings.push('丘比特通常首夜连人；请确认是补录或本桌变体。');
 if(a.status!=='confirmed')return warnings;
 if(p.confirmedRole&&p.confirmedRole!==a.roleId)warnings.push('使用角色与此人已确认的底牌不一致；请核对借用技能、继承或本桌变体。');
 const previous=skillHistory(s,actor,{confirmedOnly:true,excludeId});
 if(cfg.once&&previous.some(e=>e.skill.type===a.type))warnings.push('此一次性技能已有确认记录；请检查重复消耗。');
 if(a.type==='guard'&&!rules.guardRepeat&&a.targets.length){if(previous.some(e=>e.skill.type==='guard'&&e.phase==='night'&&Math.abs(e.round-round)===1&&e.skill.targets[0]===a.targets[0]))warnings.push('相邻两晚守护了同一人，与当前「不可连守」设置冲突。');}
 if(['save','poison'].includes(a.type)&&!rules.witchDouble&&previous.some(e=>e.round===round&&e.phase===phase&&['save','poison'].includes(e.skill.type)&&e.skill.type!==a.type))warnings.push('同夜使用了解药与毒药，与当前「不可双药」设置冲突。');
 if(a.type==='save'&&a.targets[0]===actor&&(rules.witchSelfSave==='never'||(rules.witchSelfSave==='first'&&round!==1)))warnings.push('这次自救与女巫自救设置冲突。');
 if(['shoot','blackShot'].includes(a.type)){
  if(rules.poisonStopsShot&&p.deathReason==='poison')warnings.push('记录的死因为毒杀；当前设置下不能开枪。');
  if(['lover','dream'].includes(p.deathReason))warnings.push('殉情 / 梦死后的开枪限制请按本桌规则核实。');
  if(a.type==='blackShot'&&p.deathReason==='explode'&&!rules.blackWolfSelfExplode)warnings.push('当前设置不允许黑狼王自爆后开枪。');
 }
 if(['check','poison','shoot','blackShot','duel','explodeTake','fear','charm','dream','investigate'].includes(a.type)&&a.targets.includes(actor))warnings.push('所选技能指向自己；请检查本桌是否允许。');
 if(!cfg.once&&cfg.phase==='night'&&previous.some(e=>e.round===round&&e.phase===phase&&e.skill.type===a.type))warnings.push('这一晚已有同类技能记录；可能是重复录入。');
 return warnings;
}
function makeSkillEvent(s,actor,a,round,phase){
 const cfg=SKILLS[a.type],role=getRole(s,a.roleId),targetText=a.targets.length?a.targets.map(n=>n+'号').join('、'):(cfg.targets?'空用 / 放弃':'');
 const text=`${a.status==='confirmed'?'已确认':'声称'} · ${role.name}${cfg.name}${targetText?' → '+targetText:''}${a.result&&a.result!=='未记录'?' · '+a.result:''}${a.note?'\n'+a.note:''}`;
 const relations=a.targets.filter(t=>t!==actor).map(to=>makeRelation(actor,to,'skill',`${a.status==='claimed'?'声称':''}${cfg.name}${a.result&&a.result!=='未记录'?' · '+a.result:''}`,0));
 return {...makeEvent(actor,text,relations,round,phase,true),kind:'skill',skill:clone(a)};
}
function resizeGame(s,n){
 s.players=Array.from({length:n},(_,i)=>s.players[i]||{id:i+1,alive:true,fixed:'unknown',role:'',weight:.65,...playerRoleDefaults()});
 s.events=s.events.filter(e=>e.speaker<=n&&!(e.kind==='skill'&&e.skill.targets.some(t=>t>n))).map(e=>({...e,relations:e.relations.filter(r=>r.from<=n&&r.to<=n)}));
 s.n=n;s.selected=Math.min(s.selected,n);if(s.sheriff>n)s.sheriff=0;s.layout.rotation=0;
}
