from pathlib import Path

path=Path('vitrine/admin/index.html')
s=path.read_text(encoding='utf-8')
tag='<script defer src="/vitrine/admin/cestas-kits-v2.js?v=20261005"></script>'
# Remove any previous occurrence, including the mistaken one inside generated print HTML.
s=s.replace(tag+'\n','').replace(tag,'')
body=s.rfind('</body>')
html=s.rfind('</html>')
if body < 0 or html < body:
    raise SystemExit('real document footer not found')
if len(s)-html > 32:
    raise SystemExit('unexpected content after document close')
s=s[:body]+tag+'\n'+s[body:]
if s.count(tag)!=1:
    raise SystemExit('v2 module tag count is not exactly one')
if not s.rstrip().endswith('</html>'):
    raise SystemExit('document no longer ends with html close')
path.write_text(s,encoding='utf-8')
