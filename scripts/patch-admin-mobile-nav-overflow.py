from pathlib import Path
p=Path('vitrine/admin/index.html')
s=p.read_text(encoding='utf-8')
old='.wrap{max-width:100%;overflow-x:hidden}'
new='#content.wrap{max-width:100%;overflow-x:hidden}\n      .top .wrap,.admin-nav{overflow:visible!important}'
if old not in s:
    raise SystemExit('bad wrap rule not found')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('patched nav overflow')
