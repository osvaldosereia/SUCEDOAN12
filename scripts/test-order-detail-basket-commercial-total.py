from pathlib import Path

src = Path('supabase/functions/admin-products-live-v1/index.ts').read_text(encoding='utf-8')

checks = {
    'single synthetic basket adjustment guard': 'compsByBasket.size===1' in src,
    'uses canonical other expenses': 'oq.data.other_expenses' in src,
    'synthetic commercial total': 'syntheticCommercialTotal' in src,
    'preserves component sum separately': 'componentTotalCents:sum' in src,
}

missing = [name for name, ok in checks.items() if not ok]
if missing:
    raise SystemExit('missing synthetic basket commercial total support: ' + ', '.join(missing))

print('order detail basket commercial total contract OK')
