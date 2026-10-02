from pathlib import Path
p=Path('supabase/functions/papo-external-agent-v1/index.ts')
s=p.read_text()
old='version:108'
count=s.count(old)
if count!=2:
    raise SystemExit(f'expected 2 health version markers, found {count}')
p.write_text(s.replace(old,'version:110'))
print('papo-external-agent-v1 health version -> 110')
