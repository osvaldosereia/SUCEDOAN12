from pathlib import Path

APP=Path('vitrine/admin/atendimento/attendance-app.js')
LIB=Path('vitrine/admin/atendimento/attendance-library.js')
HTML=Path('vitrine/admin/atendimento/index.html')

app=APP.read_text(encoding='utf-8')
if "import {attendanceJsonApi} from './attendance-auth.js';" not in app:
    app="import {attendanceJsonApi} from './attendance-auth.js';\n"+app
start=app.find("function adminToken(){")
end=app.find("function channelByPhone",start)
if start<0 or end<0:
    raise SystemExit('attendance-app api markers missing')
app=app[:start]+"async function api(action,params={},method='GET'){return await attendanceJsonApi(action,params,method)}\n"+app[end:]
APP.write_text(app,encoding='utf-8')

lib=LIB.read_text(encoding='utf-8')
if "import {attendanceJsonApi} from './attendance-auth.js';" not in lib:
    lib=lib.replace("import {optimizeLibraryImage} from './attendance-library-image.js';", "import {optimizeLibraryImage} from './attendance-library-image.js';\nimport {attendanceJsonApi} from './attendance-auth.js';",1)
lib=lib.replace("const token=()=>String(sessionStorage.getItem(TOKEN_KEY)||'').trim();\n",'',1)
start=lib.find("async function api(action,params={},method='GET'){")
end=lib.find("function canonicalMime",start)
if start<0 or end<0:
    raise SystemExit('attendance-library api markers missing')
lib=lib[:start]+"async function api(action,params={},method='GET'){return await attendanceJsonApi(action,params,method)}\n\n"+lib[end:]
LIB.write_text(lib,encoding='utf-8')

html=HTML.read_text(encoding='utf-8')
html=html.replace('<script type="module" src="./attendance-app.js"></script>','<script type="module" src="./attendance-app.js?v=auth-refresh-v1"></script>',1)
html=html.replace('<script type="module" src="./attendance-library.js"></script>','<script type="module" src="./attendance-library.js?v=auth-refresh-v1"></script>',1)
HTML.write_text(html,encoding='utf-8')

print('attendance auth refresh patch applied')
