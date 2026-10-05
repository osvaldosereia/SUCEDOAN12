from pathlib import Path
p=Path('vitrine/admin/index.html')
s=p.read_text(encoding='utf-8')
for old,new in [
  ('basket-guided-builder.js?v=guided-v2','basket-guided-builder.js?v=guided-v3'),
  ('basket-admin-section.js?v=canonical-v2','basket-admin-section.js?v=canonical-v3'),
]:
  if s.count(old)!=1: raise SystemExit(f'{old} count={s.count(old)}')
  s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('basket module cache versions bumped to v3')
