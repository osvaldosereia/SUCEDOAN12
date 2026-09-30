from pathlib import Path

src = Path('supabase/functions/admin-products-live-v1/index.ts').read_text(encoding='utf-8')

checks = {
    'current basket name fallback': 'im.parent_basket_name||im.basket_name' in src,
    'component-only basket synthesis': 'for(const [k,components] of compsByBasket)' in src,
    'synthetic marker': 'synthetic_from_components:true' in src,
}

missing = [name for name, ok in checks.items() if not ok]
if missing:
    raise SystemExit('missing current basket detail support: ' + ', '.join(missing))

print('order detail basket components contract OK')
