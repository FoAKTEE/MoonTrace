"""v3 role/skill regression. No network; Chromium touch emulation, not hardware."""
from pathlib import Path
import json,shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'tests/v3';OUT.mkdir(exist_ok=True)
HTML=(ROOT/'index.html').read_text()
report={'numerical':{},'ui':[],'errors':[],'limitations':['Chromium touch/viewport emulation only; no real-device validation.','LocalStorage shim; native storage not exercised.']}
def check(v,msg):
 assert v,msg
 report['ui'].append(msg)
def init(p):
 p.on('pageerror',lambda e:report['errors'].append(str(e)))
 p.evaluate('''()=>{const db={};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>db[k]??null,setItem:(k,v)=>db[k]=String(v),removeItem:k=>delete db[k]}})}''')
 p.set_content(HTML);p.set_default_timeout(4000)
def state(p): return p.evaluate('Moontrace.getState()')
def result(p): return p.evaluate('Moontrace.getResult()')
def close(p,id):p.locator(f'#{id} [data-close="{id}"]').first.click()
def detail(p,id):
 p.evaluate('()=>document.querySelectorAll("dialog[open]").forEach(d=>d.close())')
 p.locator('#tab-ranking').click();p.locator(f'#ranking [data-detail="{id}"]').click()
def choose(p,id,role,mode):
 detail(p,id);p.locator(f'[data-pick-role="{mode}"]').click();p.locator(f'[data-choose-role="{role}"]').click()
 if mode=='confirmed':p.locator('#confirmAction').click()
with sync_playwright() as pw:
 b=pw.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 p=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,accept_downloads=True);init(p)
 report['numerical']=p.evaluate((ROOT/'tests/roles_numerical.js').read_text())
 # Board touch configuration: expands current table without deleting previous speeches.
 previous=state(p)['events'];p.click('#rolesShortcut');p.select_option('#boardPreset','many');p.click('#saveBoard')
 check(state(p)['n']==17 and state(p)['wolves']==6,'17-player multi-role board synchronizes headcount and wolf count')
 check(len(state(p)['events'])==len(previous),'Board change preserves existing speeches')
 check(p.locator('#graph .node').count()==17,'Ring expands for configured roles')
 check(state(p)['roles']['enabled'],'Role quotas enabled')
 # Claims vs true cards.
 before=result(p)['ps'];choose(p,5,'witch','claim');check(state(p)['players'][4]['claimedRole']=='witch','Touch role picker records a claim');check(result(p)['ps']==before,'Role claim does not change wolf probabilities')
 choose(p,5,'witch','confirmed');check(state(p)['players'][4]['confirmedRole']=='witch','Confirmed role saved');check(result(p)['ps'][4]==0,'Confirmed witch locks nonwolf')
 p.locator('#playerDetail .sheet-body') if False else None
 p.screenshot(path=str(OUT/'player-witch.png'))
 # Quota rejects duplicate witch atomically.
 choose(p,6,'witch','confirmed');check(state(p)['players'][5]['confirmedRole']=='','Duplicate confirmed witch blocked');check(p.locator('#rolePickerDialog').is_visible(),'Picker stays open on conflict')
 p.evaluate('()=>document.querySelectorAll("dialog[open]").forEach(d=>d.close())')
 p.click('#phaseBtn');p.click('#nextPhase');check(state(p)['phase']=='night','Night phase reached explicitly')
 detail(p,5);p.locator('[data-open-skill="5"]').click();p.select_option('#skillType','poison');p.select_option('#skillTarget1','8');p.select_option('#skillStatus','claimed');p.click('#saveSkill')
 check(p.evaluate('Moontrace.roleResources(Moontrace.getState(),5).poison')==1,'Claimed poison does not consume potion')
 # Edit the event, confirm use.
 p.evaluate('()=>document.querySelectorAll("dialog[open]").forEach(d=>d.close())');p.click('#tab-history');p.locator('[data-edit-skill]').first.click();p.select_option('#skillStatus','confirmed');p.screenshot(path=str(OUT/'skill-poison.png'));p.click('#saveSkill')
 check(p.evaluate('Moontrace.roleResources(Moontrace.getState(),5).poison')==0,'Confirmed poison consumes one use')
 check(state(p)['players'][7]['alive'],'Skill record does not automatically kill target')
 check(state(p)['players'][7]['fixed']=='unknown','Skill record does not infer target role')
 p.screenshot(path=str(OUT/'skill-timeline.png'))
 # Delete and undo restore derived usage.
 p.locator('.skill-log [data-delete-event]').first.click();p.click('#confirmAction');check(p.evaluate('Moontrace.roleResources(Moontrace.getState(),5).poison')==1,'Deleting skill restores derived remaining potion');p.click('#undoBtn');check(p.evaluate('Moontrace.roleResources(Moontrace.getState(),5).poison')==0,'Undo restores skill and resource use')
 # Cupid links via two target selects.
 choose(p,2,'cupid','claim');p.locator('[data-open-skill="2"]').click();p.select_option('#skillTarget1','8');p.select_option('#skillTarget2','10');p.fill('#skillRound','1');p.select_option('#skillStatus','confirmed');p.click('#saveSkill')
 check(p.evaluate('Moontrace.roleResources(Moontrace.getState(),2).links[0].join(",")')=='8,10','Cupid supports two distinct linked players')
 detail(p,8);check('8号 ↔ 10号' in p.locator('#playerDetail').inner_text(),'Linked player sees lover record');
 p.locator('#playerDetail summary').filter(has_text='警徽').click();p.check('#playerThirdParty');check(state(p)['players'][7]['thirdParty'],'Third-party overlay saved')
 # Role claim preview.
 p.evaluate('()=>document.querySelectorAll("dialog[open]").forEach(d=>d.close())');p.click('#dockSpeaker');p.click('[data-speaker="7"]');p.click('#composeBtn');p.fill('#speechInput','我是骑士。');check(p.locator('#roleClaimPreview').is_visible(),'Speech recognizes role claim with confirmation preview');p.click('#submitSpeech');check(state(p)['players'][6]['claimedRole']=='knight','Confirmed speech stores only claimed role');check(state(p)['players'][6]['fixed']=='unknown','Speech role claim never locks identity')
 # Custom role, board resizing and v2-schema download roundtrip.
 p.click('#rolesShortcut');p.locator('#boardDialog summary').filter(has_text='自定义其他角色').click();p.fill('#boardCustomName','机械狼');p.select_option('#boardCustomCamp','wolf');p.fill('#boardCustomDesc','本桌记录继承能力');p.click('#boardAddCustom');p.click('#saveBoard');check(state(p)['n']==18 and state(p)['wolves']==7,'Custom wolf card updates board counts')
 p.click('#menuBtn')
 with p.expect_download() as download:p.click('#exportBtn')
 path=download.value.path();data=json.loads(Path(path).read_text());check(data['version']==2 and len(data['roles']['custom'])==1,'New save schema exports custom roles');check(any(e.get('kind')=='skill' for e in data['events']),'Skill records exported')
 p.set_input_files('#importFile',{'name':'roles.json','mimeType':'application/json','buffer':json.dumps(data).encode()});p.click('#confirmAction');check(len(state(p)['events'])==len(data['events']),'New save imports without losing multi-round events');check(state(p)['roles']['custom'][0]['name']=='机械狼','Custom role reimported')
 # Screenshots + small-screen fit in all new sheets.
 p.click('#rolesShortcut');p.screenshot(path=str(OUT/'board.png'));close(p,'boardDialog')
 for w,h in [(320,568),(375,667),(390,844),(430,932),(844,390)]:
  p.set_viewport_size({'width':w,'height':h});p.wait_for_timeout(250);p.click('#tab-graph');p.click('#rolesShortcut');p.wait_for_timeout(250);check(p.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),f'Board no horizontal overflow {w}x{h}')
  check(p.locator('#saveBoard').bounding_box()['y']+p.locator('#saveBoard').bounding_box()['height']<=h+1,f'Board save visible {w}x{h}');close(p,'boardDialog')
  detail(p,5);p.locator('[data-pick-role="claim"]').click();check(p.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),f'Role picker fits {w}x{h}');close(p,'rolePickerDialog')
  p.locator('[data-open-skill="5"]').click();p.wait_for_timeout(250);check(p.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),f'Skill recorder fits {w}x{h}');check(p.locator('#saveSkill').bounding_box()['y']+p.locator('#saveSkill').bounding_box()['height']<=h+1,f'Skill save visible {w}x{h}');p.evaluate('()=>document.querySelectorAll("dialog[open]").forEach(d=>d.close())')
 p.set_viewport_size({'width':390,'height':844});detail(p,5);p.locator('[data-pick-role="claim"]').click();p.screenshot(path=str(OUT/'role-picker.png'));close(p,'rolePickerDialog');close(p,'playerDialog');p.click('#tab-graph');p.screenshot(path=str(OUT/'home.png'))
 check(not report['errors'],'No JavaScript errors in v3 interactions')
 b.close()
(OUT/'test-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
