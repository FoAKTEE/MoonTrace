() => {
 const M=Moontrace,clone=s=>JSON.parse(JSON.stringify(s));let assertions=0,boards=0;
 const ok=(v,m)=>{assertions++;if(!v)throw Error(m);};const near=(a,b,m)=>ok(Math.abs(a-b)<1e-8,`${m}: ${a} != ${b}`);
 const raises=(fn,m)=>{let raised=false;try{fn();}catch(e){raised=true;}ok(raised,m);};
 function board(id){const counts=clone(M.BOARD_PRESETS[id].counts),n=Object.values(counts).reduce((a,b)=>a+b,0);const s=M.newState(n,0);s.roles.enabled=true;s.roles.counts=counts;s.wolves=Object.entries(counts).reduce((a,[id,n])=>a+(M.getRole(s,id).camp==='wolf'?n:0),0);return s;}
 for(const id of Object.keys(M.BOARD_PRESETS))for(let trial=0;trial<12;trial++){
  const s=board(id);const cards=Object.entries(s.roles.counts).flatMap(([id,n])=>Array(n).fill(id));
  for(let i=0;i<Math.min(trial,s.n);i++)M.setPlayerRole(s,i+1,cards[i],'confirmed');
  s.events=Array.from({length:s.n},(_,i)=>({id:'e'+i,speaker:i+1,text:'',round:1,phase:'day',relations:[{id:'r'+i,from:i+1,to:(i+3)%s.n+1,type:i%2?'trust':'suspect',label:'',strength:((i+trial)%10)/10}]}));
  M.assertCore(s);const r=M.infer(s);near(r.sum,s.wolves,'global wolf count');r.rolePs.forEach(row=>near(Object.values(row).reduce((a,b)=>a+b,0),1,'row total'));
  for(const [role,count] of Object.entries(s.roles.counts))near(r.rolePs.reduce((a,row)=>a+(row[role]||0),0),count,'role column '+role);
  for(const p of s.players)near(Object.entries(r.rolePs[p.id-1]).reduce((a,[id,v])=>a+(M.getRole(s,id).camp==='wolf'?v:0),0),r.ps[p.id-1],'role wolf sum');
  const imported=M.sanitizeState(JSON.parse(JSON.stringify(s)));near(M.infer(imported).sum,r.sum,'roundtrip inference');ok(imported.roles.enabled,'role config preserved');boards++;
 }
 for(const wolfCount of [0,5]){const s=M.newState(5,wolfCount);s.roles.enabled=true;s.roles.counts={wolf:wolfCount,villager:5-wolfCount};M.assertCore(s);const r=M.infer(s);r.rolePs.forEach(row=>near(Object.values(row).reduce((a,b)=>a+b,0),1,'all-same-camp'));}
 const s=board('many');const initial=M.infer(s).ps;M.setPlayerRole(s,1,'seer','claim');initial.forEach((p,i)=>near(M.infer(s).ps[i],p,'claim not evidence'));
 M.setPlayerRole(s,1,'seer','confirmed');M.assertCore(s);near(M.infer(s).ps[0],0,'seer fixes nonwolf');M.setPlayerRole(s,2,'seer','confirmed');raises(()=>M.assertCore(s),'duplicate role quota rejected');M.setPlayerRole(s,2,'','confirmed');
 M.setPlayerRole(s,3,'whiteWolfKing','confirmed');near(M.infer(s).ps[2],1,'white wolf king pinned');s.players[2].thirdParty=true;near(M.infer(s).ps[2],1,'third party does not erase wolf card');
 const legacy=M.newState(12,4);legacy.version=1;delete legacy.roles;delete legacy.sheriff;for(const p of legacy.players){delete p.claimedRole;delete p.confirmedRole;delete p.thirdParty;delete p.deathReason;}legacy.players[0].role='自称守卫';const migrated=M.sanitizeState(legacy);ok(migrated.version===2,'v1 upgrades');ok(!migrated.roles.enabled,'legacy no invented deck');ok(migrated.players[0].role==='自称守卫'&&!migrated.players[0].confirmedRole,'legacy note stays note');
 const malicious=clone(migrated);malicious.roles.custom=[{id:'__proto__',name:'bad',camp:'wolf'}];raises(()=>M.sanitizeState(malicious),'bad custom ID rejected');
 const invalid=clone(s);invalid.roles.counts.wolf=0;raises(()=>M.assertCore(invalid),'incomplete deck rejected');
 const incompatible=clone(s);incompatible.players[0].fixed='wolf';raises(()=>M.sanitizeState(incompatible),'conflicting confirmed role rejected');
 for(const role of M.ROLE_CATALOG){ok(M.recognizeRoleClaim('我是'+role.name+'，我怀疑6号',4,s)?.roleId===role.id,'claim '+role.name);ok(!M.recognizeRoleClaim('我不是'+role.name,4,s),'negative '+role.name);}
 for(const text of ['如果我是女巫','2号说我是女巫','他说：“我是女巫”','我玩狼人杀','我是狼人杀玩家','我不是预言家'])ok(!M.recognizeRoleClaim(text,1,s),'safe parser '+text);
 ok(M.recognizeRoleClaim('我是猎手。',1,s)?.roleId==='hunter','hunter alias');ok(M.recognizeRoleClaim('我是村民。',1,s)?.roleId==='villager','villager alias');
 const skillState=M.newState(12,4);skillState.round=3;skillState.phase='night';
 const act=(type,roleId,targets,status='confirmed')=>({type,roleId,targets,status,result:'未记录',note:'',override:false});
 const unchanged=M.infer(skillState).ps;
 const a=act('save','witch',[2],'claimed');skillState.events.push(M.makeSkillEvent(skillState,1,a,1,'night'));
 near(M.roleResources(skillState,1).save,1,'claimed potion not consumed');skillState.events.push(M.makeSkillEvent(skillState,1,{...a,status:'confirmed'},1,'night'));
 near(M.roleResources(skillState,1).save,0,'confirmed potion consumed');unchanged.forEach((v,i)=>near(M.infer(skillState).ps[i],v,'skill record does not imply identity'));
 ok(M.skillWarnings(skillState,1,{...a,status:'confirmed'},2,'night').some(w=>w.includes('一次性')),'reused potion warning');
 ok(M.skillWarnings(skillState,1,act('poison','witch',[3]),1,'night').some(w=>w.includes('双药')),'witch same night conflict');skillState.roles.rules.witchDouble=true;ok(!M.skillWarnings(skillState,1,act('poison','witch',[3]),1,'night').some(w=>w.includes('双药')),'witch double option');
 ok(M.skillWarnings(skillState,1,act('save','witch',[1]),2,'night').some(w=>w.includes('自救')),'selfsave denied after first');skillState.roles.rules.witchSelfSave='always';ok(!M.skillWarnings(skillState,1,act('save','witch',[1]),2,'night').some(w=>w.includes('自救')),'selfsave allowed option');
 skillState.events.push(M.makeSkillEvent(skillState,4,act('guard','guard',[5]),1,'night'));
 ok(M.skillWarnings(skillState,4,act('guard','guard',[5]),2,'night').some(w=>w.includes('不可连守')),'guard adjacent conflict');ok(!M.skillWarnings(skillState,4,act('guard','guard',[5]),3,'night').some(w=>w.includes('不可连守')),'guard spaced legal');skillState.roles.rules.guardRepeat=true;ok(!M.skillWarnings(skillState,4,act('guard','guard',[5]),2,'night').some(w=>w.includes('不可连守')),'guard option');
 skillState.players[5].deathReason='poison';ok(M.skillWarnings(skillState,6,act('shoot','hunter',[7]),2,'day').some(w=>w.includes('毒杀')),'hunter poison warning');skillState.players[5].deathReason='explode';ok(M.skillWarnings(skillState,6,act('blackShot','blackWolfKing',[7]),2,'day').some(w=>w.includes('自爆')),'black explode warning');
 skillState.events.push(M.makeSkillEvent(skillState,8,act('link','cupid',[3,9]),1,'night'));ok(M.roleResources(skillState,8).links[0].join(',')==='3,9','cupid pair');ok(skillState.players.every(p=>!p.thirdParty),'link does not guess victory side');
 skillState.events.push(M.makeSkillEvent(skillState,10,act('reveal','idiot',[]),2,'day'));ok(!M.roleResources(skillState,10).voting,'idiot voting status');ok(skillState.players[9].alive,'idiot not automatically killed');
 const rt=M.sanitizeState(skillState);ok(rt.events.filter(e=>e.kind==='skill').length===5,'all skill events roundtrip');near(M.roleResources(rt,1).save,0,'resource restored from save');
 const badSkill=clone(skillState);badSkill.events[0].skill.targets=[99];raises(()=>M.sanitizeState(badSkill),'bad skill target rejected');
 skillState.events=skillState.events.filter(e=>!(e.speaker===1&&e.skill.status==='confirmed'));near(M.roleResources(skillState,1).save,1,'delete returns potion');
 const custom=M.newState(5,1);custom.roles.custom.push({id:'custom_test',name:'机械狼',camp:'wolf',group:'狼',skills:['custom'],aliases:[],desc:'本桌'});custom.roles.enabled=true;custom.roles.counts={custom_test:1,villager:4};M.setPlayerRole(custom,1,'custom_test','confirmed');M.assertCore(custom);near(M.infer(custom).rolePs[0].custom_test,1,'custom role inference');ok(M.sanitizeState(custom).roles.custom[0].name==='机械狼','custom role roundtrip');
 return {assertions,role_board_scenarios:boards,builtin_roles:M.ROLE_CATALOG.length,skills:Object.keys(M.SKILLS).length};
}
