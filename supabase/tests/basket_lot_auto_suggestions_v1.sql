-- Regression: basket lot automatic suggestions
-- Safe to run against canonical Supabase: all changes rollback.
begin;

do $$
declare
  v_active integer;
  v_before_lots integer;
  v_after_lots integer;
  v_result jsonb;
  v_date date := (clock_timestamp() at time zone 'America/Cuiaba')::date;
  v_bad integer;
begin
  if to_regclass('public.basket_lot_automation_settings') is null then raise exception 'missing basket_lot_automation_settings'; end if;
  if to_regclass('public.basket_lot_suggestions') is null then raise exception 'missing basket_lot_suggestions'; end if;
  if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='generate_basket_lot_suggestions_v1') then raise exception 'missing generator'; end if;

  select count(*) into v_active from public.basket_templates where is_active=true;
  select count(*) into v_before_lots from public.basket_stock_lots;

  update public.basket_lot_automation_settings set enabled=true,lot_quantity=5,price_variation_pct=15 where id=1;
  v_result:=public.generate_basket_lot_suggestions_v1(v_date,'regression',true);

  if coalesce((v_result->>'generated_count')::integer,-1)<>v_active then
    raise exception 'generator count mismatch: %',v_result;
  end if;

  if (select count(*) from public.basket_lot_suggestions where suggestion_date=v_date and source='automation')<>v_active then
    raise exception 'queue does not contain one suggestion per active basket';
  end if;

  if exists(select 1 from public.basket_lot_suggestions where suggestion_date=v_date and source='automation' and quantity_planned<>5) then
    raise exception 'suggestion quantity is not 5';
  end if;

  select count(*) into v_after_lots from public.basket_stock_lots;
  if v_after_lots<>v_before_lots then raise exception 'generation changed physical basket lots'; end if;

  select count(*) into v_bad
  from public.basket_lot_suggestion_items i
  join public.basket_lot_suggestions s on s.id=i.suggestion_id
  where s.suggestion_date=v_date and s.source='automation' and i.is_substituted=true
    and (i.substitution_family is null or abs(coalesce(i.price_delta_pct,999))>15.001);
  if v_bad<>0 then raise exception 'invalid automatic substitution found'; end if;

  if exists(
    select 1 from public.basket_lot_suggestion_items i
    join public.basket_lot_suggestions s on s.id=i.suggestion_id
    left join public.basket_lot_substitution_rules r on r.family_key=i.substitution_family
    where s.suggestion_date=v_date and s.source='automation' and i.is_substituted=true
      and coalesce(r.enabled,false)=false
  ) then raise exception 'automatic substitution used a disabled family'; end if;

  -- Idempotent second run must not duplicate the queue.
  v_result:=public.generate_basket_lot_suggestions_v1(v_date,'regression',false);
  if coalesce((v_result->>'idempotent')::boolean,false) is not true then raise exception 'generator is not idempotent'; end if;
end $$;

rollback;
