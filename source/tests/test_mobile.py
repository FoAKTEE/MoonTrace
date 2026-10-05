"""Mobile interaction and numeric regression tests.

Run: python build.py; python tests/test_mobile.py
Requires Playwright and Chromium. CHROMIUM_PATH optionally selects an executable.
The constrained test runtime uses page.set_content and an in-memory localStorage
shim. This is NOT a real iOS/Android, software-keyboard, or disk-persistence test.
"""
from pathlib import Path
import json, os, shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'index.html').read_text()
REPORT={'numerical':{},'ui':[], 'browser_errors':[], 'limitations':['Chromium mobile-viewport emulation, not real devices.','localStorage uses an in-memory shim; real file:// / Safari persistence is not verified.','Keyboard layout tested at reduced viewport heights, not with a real software keyboard.']}

def check(condition,name):
    if not condition:
        raise AssertionError(name)
    REPORT['ui'].append(name)

def initialize(page, seed=None, unavailable=False):
    page.on('pageerror',lambda e: REPORT['browser_errors'].append(str(e)))
    page.evaluate('''({seed,unavailable}) => {
        const data=seed||{};
        Object.defineProperty(window,'localStorage',{configurable:true,value:{
            getItem:k=>{if(unavailable)throw Error('Storage disabled');return data[k]??null;},
            setItem:(k,v)=>{if(unavailable)throw Error('Storage disabled');data[k]=String(v);},
            removeItem:k=>{if(unavailable)throw Error('Storage disabled');delete data[k];}
        }});
    }''',{'seed':seed,'unavailable':unavailable})
    page.set_content(HTML)
    page.wait_for_timeout(250)
    page.set_default_timeout(6000)

def close(page,id):
    page.locator(f'#{id} [data-close="{id}"]').first.click()

def expect_dialog(page,id,visible=True):
    assert page.locator(f'#{id}').is_visible()==visible, id

def state(page): return page.evaluate('Moontrace.getState()')
def result(page): return page.evaluate('Moontrace.getResult()')

def no_overflow(page,name):
    check(page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),name)

with sync_playwright() as pw:
    options={'headless':True,'args':['--no-sandbox']}
    executable=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
    if executable: options['executable_path']=executable
    browser=pw.chromium.launch(**options)
    page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,accept_downloads=True)
    requests=[];page.on('request',lambda r:requests.append(r.url))
    initialize(page)
    REPORT['numerical']=page.evaluate((ROOT/'tests'/'numerical.js').read_text())
    check(page.locator('#graph .node').count()==12,'12-player initial ring')
    check(page.locator('#demoBadge').is_visible(),'Demo explicitly labeled')
    check(len(page.locator('#graph .edge-group').all())<12,'Default graph focuses selected player')
    check(page.locator('.view:visible').count()==1,'Only one main panel visible')
    check(page.locator('#composeBtn').bounding_box()['y']>700,'Speech entry stays at thumb-friendly bottom')
    page.locator('#tab-ranking').tap()
    check(page.locator('#ranking .rank-row').count()==12 and not page.locator('#view-graph').is_visible(),'Ranking is a separate tab')
    page.locator('#tab-history').tap()
    check(page.locator('#timeline .log-card').count()==6,'History is a separate tab')
    page.locator('#tab-graph').tap()
    # Touch-only speaker selection, input, correction, recording, auto-advance.
    original=result(page)['ps']
    page.locator('#dockSpeaker').tap();page.locator('[data-speaker="4"]').tap()
    check(page.locator('#dockSpeakerNumber').inner_text()=='04','Touch seat picker selects speaker')
    page.locator('#composeBtn').tap();page.locator('#speechInput').fill('我怀疑6号，8号是好人。')
    check(page.locator('.preview-item').count()==2,'Speech parsed into two editable previews')
    check(state(page)['events'].__len__()==6 and result(page)['ps']==original,'Typing alone does not commit probabilities')
    page.locator('[data-preview="0"]').tap();page.locator('#relLabel').fill('本轮发言矛盾')
    page.locator('#relationForm button[type=submit]').tap()
    check('本轮发言矛盾' in page.locator('#previewTags').inner_text(),'Touch editing preserves corrected relation label')
    page.locator('#submitSpeech').tap()
    check(len(state(page)['events'])==7 and not page.locator('#speechDialog').is_visible(),'Submit closes sheet and saves original text')
    updated=result(page)['ps']
    check(updated[5]>original[5] and updated[7]<original[7],'Evidence updates constrained marginals')
    check(page.locator('#dockSpeakerNumber').inner_text()=='05','Auto-next advances to next speaker')
    check(page.locator('#view-graph').is_visible(),'After recording, graph becomes active')
    page.locator('#tab-history').tap();page.locator('#undoBtn').tap()
    check(len(state(page)['events'])==6,'Undo speech via history tab')
    page.locator('#redoBtn').tap();check(len(state(page)['events'])==7,'Redo speech')
    # Direct relation creation without Shift / dragging.
    page.locator('#tab-graph').tap();page.locator('#graph [data-node="2"]').tap();page.locator('#linkBtn').tap()
    check(page.locator('#relSource').input_value()=='2','Add relationship uses selected source')
    page.locator('#relTarget').select_option('10');page.locator('[data-reltype="trust"]').tap();page.locator('#relLabel').fill('暂时保好')
    page.locator('#relationForm button[type=submit]').tap()
    check(len(state(page)['events'])==8,'Touch-only directed relation saved')
    # Detail sheets, identity constraints, deaths.
    page.locator('#selectedCard [data-detail]').tap()
    expect_dialog(page,'playerDialog')
    page.locator('[data-identity="wolf"]').tap()
    check(result(page)['ps'][9]==1,'Confirmed wolf pinned to 100%')
    expected=result(page)['expectedAlive'];page.locator('#toggleAlive').tap()
    check(abs(result(page)['expectedAlive']-(expected-1))<1e-9 and result(page)['ps'][9]==1,'Death changes alive expectation but not team')
    close(page,'playerDialog')
    page.locator('#graph [data-node="2"]').tap();page.locator('#selectedCard [data-detail]').tap();page.locator('[data-identity="good"]').tap()
    check(result(page)['ps'][1]==0,'Confirmed good pinned to 0%')
    page.locator('#roleNote').fill('自称骑士');page.locator('#roleNote').press('Tab')
    check(state(page)['players'][1]['role']=='自称骑士','Player role note saved without automatic identity assumptions')
    close(page,'playerDialog')
    # Arrow editing, label toggle, zoom.
    page.locator('#allEdges').tap();check(page.locator('#graph .edge-group').count()>=12,'All-table graph filter')
    page.locator('#labelsBtn').tap();check(page.locator('#graph .edge-label').count()==0,'Hide labels to reduce clutter')
    page.locator('#labelsBtn').tap()
    page.locator('#zoomBtn').tap();check(page.locator('#graphViewport').evaluate('(e)=>e.scrollWidth>e.clientWidth'),'Graph supports zoom with native touch panning')
    page.locator('#zoomBtn').tap()
    # Settings and constraints.
    page.locator('#menuBtn').tap();page.locator('#settingsBtn').tap()
    page.locator('#settingN').fill('30');page.locator('#settingW').fill('10');page.locator('#applySettings').tap()
    check(page.locator('#graph .node').count()==30 and abs(result(page)['sum']-10)<1e-9,'30 players and 10-wolf constraint')
    page.locator('#zoomBtn').tap()
    check(page.locator('#graphViewport').evaluate('(e)=>e.scrollWidth/e.clientWidth>2.3'),'Large table offers larger touch targets after zoom')
    no_overflow(page,'30-player zoom does not overflow the page')
    page.locator('#zoomBtn').tap();page.locator('#settingsShortcut').tap();page.locator('#settingW').fill('0');page.locator('#applySettings').tap()
    check(page.locator('#settingsDialog').is_visible() and state(page)['wolves']==10,'Conflicting total wolves rejected')
    close(page,'settingsDialog')
    page.locator('#menuBtn').tap();page.locator('#newBtn').tap();page.locator('#settingN').fill('5');page.locator('#settingW').fill('1');page.locator('#applySettings').tap()
    check(page.locator('#graph .node').count()==5 and not page.locator('#demoBadge').is_visible(),'New 5-player game resets records and demo label')
    page.locator('#graph [data-node="1"]').tap();page.locator('#selectedCard [data-detail]').tap();page.locator('[data-identity="wolf"]').tap()
    check(result(page)['ps']==[1,0,0,0,0],'Single remaining wolf implies other players are non-wolves')
    close(page,'playerDialog');page.locator('#graph [data-node="2"]').tap();page.locator('#selectedCard [data-detail]').tap();page.locator('[data-identity="wolf"]').tap()
    check(state(page)['players'][1]['fixed']=='unknown','Contradictory confirmed identity blocked')
    close(page,'playerDialog')
    page.locator('#phaseBtn').tap();page.locator('#nextPhase').tap();page.locator('#phaseBtn').tap();page.locator('#nextPhase').tap()
    check(state(page)['round']==2 and state(page)['phase']=='day','Day/night advancement requires explicit action')
    # Draft survives sheet close and can be restored from mock storage.
    page.locator('#composeBtn').tap();page.locator('#speechInput').fill('我怀疑3号，2号是好人。');close(page,'speechDialog')
    check(page.locator('#composeLabel').inner_text()=='继续发言','Collapsed composer preserves draft indicator')
    page.locator('#composeBtn').tap();check(page.locator('#speechInput').input_value()=='我怀疑3号，2号是好人。','Draft survives reopening')
    page.locator('#submitSpeech').tap()
    # Import is compatible with v1 and is confirmed before overwrite.
    payload=state(page);payload['players'][1]['role']='<img src=x onerror="window.hacked=1">';payload['events'][0]['text']='<script>window.hacked=1</script>'
    page.locator('#importFile').set_input_files({'name':'safety-test.json','mimeType':'application/json','buffer':json.dumps(payload).encode()})
    expect_dialog(page,'confirmDialog');page.locator('#confirmAction').tap()
    check(page.evaluate('window.hacked===undefined'),'Imported content is escaped, not executable')
    page.locator('#tab-history').tap();check('<script>' in page.locator('#timeline').inner_text(),'Raw imported text retained literally')
    page.locator('#menuBtn').tap()
    with page.expect_download(timeout=5000) as dl:
        page.locator('#exportBtn').tap()
    dest=ROOT/'tests'/'export-test.json';dl.value.save_as(dest)
    check(json.loads(dest.read_text())['n']==5,'JSON export generates valid save file');dest.unlink()
    # Confirmed deletion and undo.
    page.locator('#timeline [data-delete-event]').first.tap();page.locator('#confirmAction').tap()
    check(len(state(page)['events'])==0,'Deletion requires confirmation and removes event')
    page.locator('#undoBtn').tap();check(len(state(page)['events'])==1,'Deleted original text can be restored')
    # Model explanations tucked into a sheet.
    page.locator('#menuBtn').tap();page.locator('#modelBtn').tap();check(page.locator('#modelDialog').is_visible(),'Model explanation reachable from menu');close(page,'modelDialog')
    # Restore demonstration and test responsive dimensions and visibility.
    page.locator('#menuBtn').tap();page.locator('#loadDemo').tap();page.locator('#confirmAction').tap()
    for width,height in [(320,568),(360,740),(375,667),(390,844),(414,896),(430,932),(768,1024),(1280,800)]:
        page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(60)
        no_overflow(page,f'No horizontal overflow at {width}×{height}')
        rect=page.locator('#composeBtn').bounding_box()
        check(rect['x']>=0 and rect['x']+rect['width']<=width+1 and rect['y']+rect['height']<=height+1,f'Primary speech action within viewport at {width}×{height}')
        for tab in ['ranking','history','graph']:
            page.locator('#tab-'+tab).click();no_overflow(page,f'{tab} tab fits at {width}px')
    # Reduced-height, keyboard-like browser viewport. Not a real keyboard test.
    page.set_viewport_size({'width':390,'height':410});page.locator('#composeBtn').click();page.locator('#speechInput').fill('我怀疑6号。')
    page.wait_for_timeout(100)
    rect=page.locator('#submitSpeech').bounding_box()
    check(rect['y']>=0 and rect['y']+rect['height']<=411,'Submit button remains visible in reduced-height viewport')
    page.locator('#submitSpeech').tap()
    # Fresh demonstration page for the final visual outputs.
    visuals=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
    initialize(visuals)
    visuals.wait_for_timeout(300)
    visuals.screenshot(path=str(ROOT.parent/'moontrace-mobile-preview.png'))
    visuals.locator('#composeBtn').tap();visuals.locator('#speechInput').fill('我怀疑6号，4号像好人，这轮想投6号。')
    visuals.locator('#previewTitle').tap();visuals.wait_for_timeout(250)
    visuals.screenshot(path=str(ROOT.parent/'moontrace-mobile-input.png'))
    close(visuals,'speechDialog');visuals.locator('#tab-ranking').tap();visuals.wait_for_timeout(200)
    visuals.screenshot(path=str(ROOT.parent/'moontrace-mobile-ranking.png'))
    # Storage blocked: app must still work and tell user to export.
    fallback=browser.new_page(viewport={'width':360,'height':740},is_mobile=True,has_touch=True)
    initialize(fallback,unavailable=True)
    check(fallback.locator('#graph .node').count()==12,'App renders with storage unavailable')
    check('请导出' in fallback.locator('#saveStatus').inner_text(),'Unavailable autosave is disclosed')
    check(not requests,'Main app loads without network requests')
    check(not REPORT['browser_errors'],'No uncaught JavaScript errors')
    browser.close()
(ROOT/'tests'/'test-report.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2))
print(json.dumps(REPORT,ensure_ascii=False,indent=2))
