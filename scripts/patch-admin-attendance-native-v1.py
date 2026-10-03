from pathlib import Path
import re

path = Path('vitrine/admin/index.html')
text = path.read_text(encoding='utf-8')

# Guardas de regressão: o patch não pode partir de um Admin sem os controles atuais de Pedidos.
for marker in ('Enviar pedido:', '65 99815-0975', '65 99688-4599'):
    if marker not in text:
        raise SystemExit(f'refusing patch: current Orders UI marker missing: {marker}')

pattern = r"\n  function attendanceUuid\(value\)\{[\s\S]*?\n\s*function setTab\(tab\)\{"
replacement = """
  function renderAttendance(){
    location.assign('/vitrine/admin/atendimento/');
  }

  function setTab(tab){"""
new, count = re.subn(pattern, replacement, text, count=1)
if count != 1:
    raise SystemExit(f'expected one legacy attendance block, found {count}')

# Guardas pós-patch: remover somente a bridge/iframe e preservar Pedidos.
for forbidden in ('attendanceFrame', "data?.type!=='da-attendance'", '?embedded=1'):
    if forbidden in new:
        raise SystemExit(f'legacy Attendance marker survived patch: {forbidden}')
for marker in ('Enviar pedido:', '65 99815-0975', '65 99688-4599'):
    if marker not in new:
        raise SystemExit(f'Orders UI marker lost during patch: {marker}')
if "location.assign('/vitrine/admin/atendimento/');" not in new:
    raise SystemExit('native Attendance route missing after patch')

path.write_text(new, encoding='utf-8')
print('patched Admin Attendance to native route; Orders markers preserved')
