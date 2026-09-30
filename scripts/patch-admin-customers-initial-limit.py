from pathlib import Path

path=Path('supabase/functions/admin-service-intelligence-v1/index.ts')
s=path.read_text(encoding='utf-8')
start=s.index('async function vitrineListCustomers')
next_pos=s.find('\nasync function ',start+20)
end=next_pos if next_pos!=-1 else len(s)
block=s[start:end]
old='.limit(650);'
new='.limit(q?650:limit);'
if new in block:
    print('already patched')
    raise SystemExit(0)
if block.count(old)!=1:
    raise SystemExit(f'expected one customer limit anchor, found {block.count(old)}')
block=block.replace(old,new,1)
s=s[:start]+block+s[end:]
path.write_text(s,encoding='utf-8')
print('patched customer initial load limit')
