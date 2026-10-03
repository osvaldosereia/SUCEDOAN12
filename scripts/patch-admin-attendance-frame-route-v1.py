from pathlib import Path

path=Path('vitrine/admin/index.html')
text=path.read_text(encoding='utf-8')
old="frame.src='/vitrine/admin/atendimento/?embedded=1';"
new="frame.src='./atendimento/?embedded=1';"
count=text.count(old)
if count != 1:
    raise SystemExit(f'expected exactly 1 attendance iframe route, found {count}')
path.write_text(text.replace(old,new,1),encoding='utf-8')
print('patched attendance iframe route to relative path')
