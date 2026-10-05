#!/usr/bin/env python3
"""Build the dependency-free web app. Python 3.9+; no packages required.

Writes index.html (standalone) and app.js here, then — when the sibling
folders exist — copies the page into ../web, ../pwa (with manifest + service
worker hooks), ../android/assets/www and ../ios/Moontrace/www so every
package ships the same build."""
import hashlib, shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
src = ROOT / 'src'
shell = (src / 'shell.html').read_text(encoding='utf-8')
shell = shell.replace('<!-- STYLES -->', '<style>\n' + (src / 'style.css').read_text(encoding='utf-8') + '\n' + (src / 'roles.css').read_text(encoding='utf-8') + '\n</style>')
shell = shell.replace('<!-- ROLE_DIALOGS -->', (src / 'roles-dialogs.html').read_text(encoding='utf-8'))
shell = shell.replace('<!-- MODEL -->', (src / 'model.html').read_text(encoding='utf-8'))
js = (src / 'core.js').read_text(encoding='utf-8') + '\n' + (src / 'roles-core.js').read_text(encoding='utf-8') + '\n' + (src / 'ui.js').read_text(encoding='utf-8')
js = js.replace('/* ROLE_UI_MODULE */', (src / 'roles-ui.js').read_text(encoding='utf-8'))
shell = shell.replace('<!-- SCRIPT -->', '<script>\n' + js + '\n</script>')

standalone = shell.replace('<!-- PWA -->\n', '')
(ROOT / 'index.html').write_text(standalone, encoding='utf-8')
(ROOT / 'app.js').write_text(js, encoding='utf-8')
print(f'Built index.html ({len(standalone.encode()):,} bytes)')

parent = ROOT.parent
for target in ('web/index.html', 'android/assets/www/index.html', 'ios/Moontrace/www/index.html'):
    p = parent / target
    if p.parent.is_dir():
        p.write_text(standalone, encoding='utf-8')
        print('  →', target)

pwa = parent / 'pwa'
if pwa.is_dir():
    build_id = hashlib.sha256(standalone.encode()).hexdigest()[:10]
    head = ('<link rel="manifest" href="manifest.webmanifest">\n'
            '<link rel="apple-touch-icon" href="icons/icon-180.png">\n'
            '<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">\n')
    register = ('<script>if("serviceWorker" in navigator&&location.protocol==="https:")'
                'addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));</script>\n')
    page = shell.replace('<!-- PWA -->\n', head).replace('</body>', register + '</body>')
    (pwa / 'index.html').write_text(page, encoding='utf-8')
    sw = (pwa / 'sw.template.js').read_text(encoding='utf-8').replace('__BUILD__', build_id)
    (pwa / 'sw.js').write_text(sw, encoding='utf-8')
    print('  → pwa/index.html, pwa/sw.js (build', build_id + ')')
