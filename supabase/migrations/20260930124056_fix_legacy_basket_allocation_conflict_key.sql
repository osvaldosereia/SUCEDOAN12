-- 2026-09-30 · Dona Antônia
-- Hotfix: legacy basket checkout still writes allocation_role='legacy_full' by default,
-- but the split-kit migration replaced the old UNIQUE(order_id, lot_id) with
-- UNIQUE(order_id, lot_id, basket_id, allocation_role).
-- Keep legacy sales mode intact and align the ON CONFLICT target with the live index.

do $migration$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='create_vitrine_cart_order_v1'
    and pg_get_function_identity_arguments(p.oid)='p_phone text, p_payment_method text, p_items jsonb, p_customer_snapshot jsonb, p_delivery jsonb';

  if v_oid is null then
    raise exception 'create_vitrine_cart_order_v1_not_found';
  end if;

  v_def := pg_get_functiondef(v_oid);

  if v_def ~* 'on conflict\s*\(\s*order_id\s*,\s*lot_id\s*,\s*basket_id\s*,\s*allocation_role\s*\)\s*do update' then
    return;
  end if;

  if not (v_def ~* 'on conflict\s*\(\s*order_id\s*,\s*lot_id\s*\)\s*do update') then
    raise exception 'legacy_conflict_target_not_found';
  end if;

  v_new := regexp_replace(
    v_def,
    'on conflict\s*\(\s*order_id\s*,\s*lot_id\s*\)\s*do update',
    'on conflict(order_id,lot_id,basket_id,allocation_role) do update',
    'i'
  );

  execute v_new;
end
$migration$;
