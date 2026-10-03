from pathlib import Path
import re

path=Path('vitrine/admin/index.html')
text=path.read_text(encoding='utf-8')
pattern=r"\n  function attendanceUuid\(value\)\{[\s\S]*?\n\s*function setTab\(tab\)\{"
replacement="""
  function renderAttendance(){
    location.assign('/vitrine/admin/atendimento/');
  }

  function setTab(tab){"""
new,count=re.subn(pattern,replacement,text,count=1)
if count!=1:
    raise SystemExit(f'expected one legacy attendance block, found {count}')
path.write_text(new,encoding='utf-8')
print('patched Admin Attendance to native route')
