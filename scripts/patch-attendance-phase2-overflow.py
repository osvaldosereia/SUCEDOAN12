from pathlib import Path
p=Path('vitrine/admin/atendimento/attendance.css')
s=p.read_text()
old='.quick-tools{display:flex;gap:5px;overflow-x:auto;padding:0 0 7px;scrollbar-width:thin}'
new='.quick-tools{display:flex;gap:5px;overflow-x:hidden;padding:0 0 7px}'
if old not in s:
    raise SystemExit('old quick-tools overflow rule not found')
s=s.replace(old,new,1)
p.write_text(s)
