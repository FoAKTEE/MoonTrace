"""AI parsing and iMessage inbox. The server is mocked with page.route; no network, no API key."""
from pathlib import Path
import json,shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'tests/v3';OUT.mkdir(exist_ok=True)
HTML=(ROOT/'index.html').read_text()
SERVER='https://mt.test'
report={'ui':[],'errors':[],'requests':[],'limitations':['Server mocked with page.route; Worker covered by server/test/e2e.mjs.']}
def check(v,msg):
 assert v,msg
 report['ui'].append(msg)
SHIM='''(seed)=>{const db=seed||{};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>db[k]??null,setItem:(k,v)=>db[k]=String(v),removeItem:k=>delete db[k]}})}'''
def open_page(b,config=None,handler=None):
 p=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
 p.on('pageerror',lambda e:report['errors'].append(str(e)))
 if handler:p.route(SERVER+'/**',handler)
 p.evaluate(SHIM,{'moontrace-ai-v1':json.dumps(config)} if config else {})
 p.set_content(HTML);p.set_default_timeout(4000);return p
def state(p):return p.evaluate('Moontrace.getState()')
def cfg(p):return p.evaluate('JSON.parse(localStorage.getItem("moontrace-ai-v1")||"null")')
def reply(route,data,status=200):
 if route.request.method=='OPTIONS':route.fulfill(status=204,headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'});return
 body=route.request.post_data_json if route.request.method=='POST' else None
 report['requests'].append({'url':route.request.url,'auth':route.request.headers.get('authorization'),'body':body})
 route.fulfill(status=status,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body=json.dumps(data(body) if callable(data) else data))
with sync_playwright() as pw:
 b=pw.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 # Validation of untrusted server output, using the same merge rule as the local parser.
 p=open_page(b)
 r=p.evaluate('''()=>{const M=Moontrace;
  const a=M.normalizeRemote({events:[{speaker:4,text:'',claim:'',relations:[
   {from:4,to:6,type:'suspect',hedged:true,label:'有点像狼'},{from:4,to:6,type:'vote',hedged:false,label:'出6'},
   {from:4,to:8,type:'trust',hedged:false,label:'保'},{from:4,to:99,type:'suspect',hedged:false},{from:5,to:7,type:'suspect',hedged:false},
   {from:4,to:4,type:'trust',hedged:false},{from:4,to:9,type:'skill',hedged:false},{from:4,to:10,type:'checkW',hedged:'yes',label:'x'.repeat(99)}]}],warnings:['条件句未计入']},12,4);
  const local=M.parseSpeech('我有点怀疑6号，今天投6',4,12).relations;
  let bad=0;for(const x of [null,{},{events:'x'}])try{M.normalizeRemote(x,12)}catch(e){bad++}
  const notes=M.normalizeRemote({events:[{speaker:0,relations:[]},{speaker:13,relations:[]},{speaker:3,text:'3号踩6',relations:[{from:3,to:6,type:'suspect',hedged:false,label:'踩'}]}]},12);
  return {rels:a.events[0].relations.map(r=>[r.from,r.to,r.type,r.strength,r.label.length]),warnings:a.warnings,local:local.map(r=>[r.to,r.type]),bad,notes:notes.events.map(e=>e.speaker),notesWarn:notes.warnings.length};}''')
 check(r['rels']==[[4,6,'suspect',0.65,4],[4,8,'trust',0.85,1],[4,10,'checkW',0.85,60]],'Remote relations keep only valid seats/types; hedged→0.65, firm→0.85; labels capped')
 check(r['local']==[[6,'suspect']],'Same-target merge matches the local parser (suspect outranks vote)')
 check('识别结果含其他人的表态，未归给当前发言者。' in r['warnings'] and '条件句未计入' in r['warnings'],'Speech mode refuses relations from other seats and keeps server warnings')
 check(r['bad']==3 and r['notes']==[3] and r['notesWarn']==2,'Malformed payloads rejected; out-of-range speakers skipped with a warning')
 check(p.locator('#aiParseBtn').is_hidden(),'AI button hidden until a server is configured')
 p.click('#menuBtn');check(p.locator('#aiMenuState').inner_text()=='可选 · 未开启','Menu shows AI as optional and off')
 check('不上传' in p.locator('#privacyNote').inner_text(),'Offline privacy note unchanged without a server');p.close()

 # Composer: AI proposes, user confirms, probabilities come from the local model.
 def parse(body):
  if 'boom' in body['text']:return {'error':'AI 服务出错（500）。'}
  return {'events':[{'speaker':body['speaker'],'text':'','claim':'','relations':[{'from':body['speaker'],'to':6,'type':'suspect','hedged':True,'label':'前后矛盾'},{'from':body['speaker'],'to':6,'type':'vote','hedged':False,'label':'出6'},{'from':body['speaker'],'to':11,'type':'trust','hedged':False,'label':'不像狼'},{'from':body['speaker'],'to':40,'type':'suspect','hedged':False,'label':'越界'}]}],'warnings':['条件句“如果6是狼那8也是”未计入']}
 def handler(route):
  url=route.request.url
  if url.endswith('/api/parse'):
   body=route.request.post_data_json if route.request.method=='POST' else {}
   reply(route,parse,500 if body and 'boom' in body.get('text','') else 200)
  elif url.endswith('/api/health'):reply(route,{'ok':True,'ai':True})
  else:reply(route,{'entries':[],'last':0})
 p=open_page(b,{'endpoint':SERVER,'token':'tok'},handler)
 p.click('#dockSpeaker');p.click('[data-speaker="4"]');p.click('#composeBtn')
 check(p.locator('#aiParseBtn').is_visible() and p.locator('#aiParseBtn').is_disabled(),'AI button shown when configured, disabled while empty')
 text='如果6是狼那8也是。我觉得6号前后矛盾，11号不像狼，今天先出6。'
 p.fill('#speechInput',text);local=p.evaluate('Moontrace.parseSpeech(%s,4,12).relations.length'%json.dumps(text))
 p.click('#aiParseBtn');p.wait_for_function('document.querySelector("#parserSource").textContent.startsWith("Claude")')
 req=report['requests'][-1]
 check(req['auth']=='Bearer tok' and req['body']['mode']=='speech' and req['body']['speaker']==4 and req['body']['n']==12 and req['body']['text']==text,'Parse request carries token, mode, speaker, seat count and raw text')
 check(p.locator('#previewTags .preview-item').count()==2,f'AI preview replaces rule preview (rules found {local}); out-of-range seat dropped')
 check('条件句' in p.locator('#parserWarnings').inner_text(),'Server warnings shown in the preview')
 p.screenshot(path=str(OUT/'ai-preview.png'))
 before=len(state(p)['events']);p.click('#submitSpeech')
 s=state(p);ev=s['events'][-1]
 check(len(s['events'])==before+1 and ev.get('via')=='ai' and sorted((x['to'],x['type'],x['strength']) for x in ev['relations'])==[(6,'suspect',0.65),(11,'trust',0.85)],'Confirmed AI result stored as an ordinary event marked via=ai')
 check(p.evaluate('JSON.stringify(Moontrace.getResult().ps)===JSON.stringify(Moontrace.infer(Moontrace.getState()).ps)'),'Displayed probabilities equal the local inference of the stored state')
 check(p.evaluate('Moontrace.sanitizeState(Moontrace.getState()).events.at(-1).via')=='ai','Export/import keeps the via marker')
 p.click('#tab-history');check(p.locator('.log-name').first.inner_text()=='发言 · AI 识别','History labels AI-parsed speech')
 # Editing after AI parse falls back to local rules; server errors keep the local result.
 p.click('#composeBtn');p.fill('#speechInput','boom 我怀疑3号');rules=p.locator('#previewTags .preview-item').count()
 p.click('#aiParseBtn');p.wait_for_selector('.toast.show.error');p.wait_for_function('!document.querySelector("#aiParseBtn").disabled')
 check('AI 识别失败' in p.locator('#toast').inner_text() and p.locator('#previewTags .preview-item').count()==rules and p.locator('#parserSource').inner_text().startswith('本地'),'Server error keeps local rule result')
 p.evaluate('()=>document.querySelectorAll("dialog[open]").forEach(d=>d.close())')
 # Settings sheet: validation, connection test, phone-width fit.
 p.click('#menuBtn');check(p.locator('#aiMenuState').inner_text()=='已开启 AI 识别','Menu reflects configured AI');check('Anthropic' in p.locator('#privacyNote').inner_text(),'Privacy note discloses remote parsing when configured')
 p.click('#aiMenuBtn');p.fill('#aiEndpoint','http://evil.example');p.click('#aiForm button[type=submit]');check('https://' in p.locator('#aiError').inner_text(),'Plain-http endpoints rejected')
 p.fill('#aiEndpoint',SERVER);p.click('#aiTest');p.wait_for_function('document.querySelector("#aiTestResult").textContent.includes("连接成功")');check(True,'Connection test reports a healthy server')
 p.click('#aiNewRoom');room=p.input_value('#aiRoom');check(p.evaluate('r=>/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/.test(r)',room) and p.is_checked('#aiInbox'),'New room id is random, readable, and enables the inbox')
 for w,h in [(320,568),(390,844),(844,390)]:
  p.set_viewport_size({'width':w,'height':h});p.wait_for_timeout(200);box=p.locator('#aiForm button[type=submit]').bounding_box()
  check(p.evaluate('document.documentElement.scrollWidth<=innerWidth+1') and box['y']+box['height']<=h+1,f'AI settings fit {w}x{h}')
 p.set_viewport_size({'width':390,'height':844});p.screenshot(path=str(OUT/'ai-settings.png'))
 p.click('#aiForm button[type=submit]');check(cfg(p)['room']==room and cfg(p)['inbox'] and cfg(p)['cursor']==0,'Saving stores the room with a fresh cursor')
 check('moontrace-ai-v1' not in json.dumps(state(p)) and 'tok' not in json.dumps(state(p)),'Token and server settings never enter the game save');p.close()

 # Inbox: events arrive, apply once, retract, survive re-delivery.
 log=[{'seq':1,'kind':'event','text':'3号踩6保8，9号归票6，5跳预言家','events':[
  {'speaker':3,'text':'3号踩6保8','claim':'','relations':[{'from':3,'to':6,'type':'suspect','hedged':False,'label':'踩'},{'from':3,'to':8,'type':'trust','hedged':False,'label':'保'}]},
  {'speaker':9,'round':1,'text':'9号归票6','claim':'','relations':[{'from':9,'to':6,'type':'vote','hedged':False,'label':'归票'},{'from':9,'to':25,'type':'vote','hedged':False,'label':'越界'}]},
  {'speaker':5,'round':7,'text':'5跳预言家','claim':'预言家','relations':[]}],'warnings':[]}]
 def sync(body):return {'entries':[e for e in log if e['seq']>body['after']],'last':len(log)}
 p=open_page(b,{'endpoint':SERVER,'token':'tok','room':'room-test1','inbox':True,'cursor':0},lambda route:reply(route,sync))
 p.wait_for_function('Moontrace.getState().events.some(e=>e.via==="imessage")')
 s=state(p);got=[e for e in s['events'] if e.get('via')=='imessage']
 check([(e['speaker'],e['rid'],len(e['relations'])) for e in got]==[(3,'room-test1:1',2),(9,'room-test1:1',1),(5,'room-test1:1',0)],'One iMessage becomes per-speaker events sharing a room id; out-of-range seat dropped')
 check(s['players'][4]['claimedRole']=='seer' and s['players'][4]['fixed']=='unknown','Claimed role recorded as a claim only')
 check([(e['round'],e['phase']) for e in got]==[(s['round'],s['phase']),(1,'day'),(s['round'],s['phase'])],'Inbox events keep an earlier round from the notes; no round or a future round falls back to the current one')
 check(cfg(p)['cursor']==1,'Cursor advances after applying')
 check(s['selected']==6 and s['layout']['focus'],'Graph focuses the player whose probability moved most')
 syncs=[r for r in report['requests'] if r['url'].endswith('/sync')]
 check(syncs[-1]['body']['n']==12 and syncs[-1]['body']['after']==0,'Sync sends seat count and cursor')
 p.click('#tab-history');check(p.locator('.log-name',has_text='iMessage').count()==3,'History labels iMessage records')
 p.click('#tab-graph');p.screenshot(path=str(OUT/'ai-inbox.png'))
 p.evaluate('()=>{const db=JSON.parse(localStorage.getItem("moontrace-ai-v1"));db.cursor=0;localStorage.setItem("moontrace-ai-v1",JSON.stringify(db));}')
 p.wait_for_timeout(5000);check(len([e for e in state(p)['events'] if e.get('via')=='imessage'])==3,'Re-delivered entries are not applied twice')
 log.append({'seq':2,'kind':'retract','target':1});p.wait_for_function('!Moontrace.getState().events.some(e=>e.via==="imessage")',timeout=9000)
 check(cfg(p)['cursor']==2,'Retraction from iMessage removes every event of that message')
 p.click('#tab-history');p.click('#undoBtn');check(len([e for e in state(p)['events'] if e.get('via')=='imessage'])==3,'Retraction is undoable locally')
 p.click('#menuBtn');check(p.locator('#aiMenuState').inner_text()=='已开启 · 房间 room-test1','Menu shows the connected room');p.close()

 # Shared link joins a room without carrying the token.
 p=b.new_page(viewport={'width':390,'height':844});p.on('pageerror',lambda e:report['errors'].append(str(e)))
 p.add_init_script('(()=>{const db={};Object.defineProperty(window,"localStorage",{configurable:true,value:{getItem:k=>db[k]??null,setItem:(k,v)=>db[k]=String(v),removeItem:k=>delete db[k]}})})()')
 p.goto((ROOT/'index.html').as_uri()+'#room=abcd-efgh-jkmn');p.wait_for_selector('#aiDialog[open]')
 check(p.input_value('#aiRoom')=='abcd-efgh-jkmn' and p.is_checked('#aiInbox') and '访问口令' in p.locator('#aiError').inner_text(),'#room= link pre-fills the room and asks for the token')
 check(p.evaluate('location.hash')=='','Room hash removed from the address bar');p.close()
 check(not report['errors'],'No JavaScript errors in AI interactions')
 b.close()
(OUT/'ai-test-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'passed':len(report['ui']),'errors':report['errors']},ensure_ascii=False))
