from pathlib import Path

admin = Path('vitrine/admin/index.html').read_text(encoding='utf-8')
migration = Path('supabase/sql/20260930_order_separation_atomic_v1.sql')

checks = {
    'frontend separation has no explicit consume call': "api('order_consume_stock'" not in admin,
    'payment pix canonical option': "['pix','PIX']" in admin,
    'payment cash canonical option': "['cash','Dinheiro']" in admin,
    'payment credit canonical option': "['credit_card','Cartão de crédito']" in admin,
    'payment food canonical option': "['food_card','Cartão alimentação']" in admin,
    'payment meal canonical option': "['meal_card','Cartão refeição']" in admin,
    'payment select emits canonical value': "'<option value=\"'+value+'\" '" in admin,
    'atomic migration exists': migration.exists(),
}
if migration.exists():
    sql = migration.read_text(encoding='utf-8')
    checks.update({
        'confirmed no longer consumes': "new.status in ('confirmed','sent_to_bling')" not in sql,
        'processing consumes': "new.status in ('processing','ready','out_for_delivery','delivered')" in sql,
        'consume result checked': 'v_result := public.consume_vitrine_order_stock_v1(new.id)' in sql,
        'consume failure aborts transition': "raise exception 'order_stock_consume_failed:%'" in sql,
    })

missing = [name for name, ok in checks.items() if not ok]
if missing:
    raise SystemExit('separation atomic regression: ' + ', '.join(missing))
print('admin separation atomic contract OK')
