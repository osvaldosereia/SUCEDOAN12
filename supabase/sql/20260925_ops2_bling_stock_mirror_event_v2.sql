-- Dona Antônia Operations 2.0
-- Aplicação idempotente e ordenada do espelho de estoque Bling.
-- O espelho é shadow: não altera products.stock nem escreve de volta no Bling.

create or replace function public.apply_bling_stock_mirror_event_v2(
  p_product_id uuid,
  p_bling_product_id bigint,
  p_physical_total numeric,
  p_virtual_total numeric,
  p_deposit_balances jsonb,
  p_observed_at timestamptz,
  p_source_event_id text,
  p_source_resource text,
  p_replace_deposits boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resource text := lower(trim(coalesce(p_source_resource,'')));
  v_observed_at timestamptz := coalesce(p_observed_at,now());
  v_event_id text := nullif(left(trim(coalesce(p_source_event_id,'')),200),'');
  v_deposits jsonb := coalesce(p_deposit_balances,'{}'::jsonb);
  v_row public.bling_stock_mirror_v2%rowtype;
  v_applied boolean := false;
begin
  if p_product_id is null then
    raise exception 'product_id_required';
  end if;
  if coalesce(p_bling_product_id,0) <= 0 then
    raise exception 'bling_product_id_required';
  end if;
  if p_physical_total is null or p_virtual_total is null then
    raise exception 'stock_totals_required';
  end if;
  if v_resource not in ('stock','virtual_stock','backfill') then
    raise exception 'invalid_source_resource';
  end if;
  if jsonb_typeof(v_deposits) <> 'object' then
    raise exception 'deposit_balances_must_be_object';
  end if;

  insert into public.bling_stock_mirror_v2(
    product_id,
    bling_product_id,
    physical_total,
    virtual_total,
    deposit_balances,
    observed_at,
    source_event_id,
    source_resource,
    created_at,
    updated_at
  )
  values(
    p_product_id,
    p_bling_product_id,
    p_physical_total,
    p_virtual_total,
    v_deposits,
    v_observed_at,
    v_event_id,
    v_resource,
    now(),
    now()
  )
  on conflict(product_id) do update
  set bling_product_id = excluded.bling_product_id,
      physical_total = excluded.physical_total,
      virtual_total = excluded.virtual_total,
      deposit_balances = case
        when p_replace_deposits then excluded.deposit_balances
        else coalesce(public.bling_stock_mirror_v2.deposit_balances,'{}'::jsonb) || excluded.deposit_balances
      end,
      observed_at = excluded.observed_at,
      source_event_id = excluded.source_event_id,
      source_resource = excluded.source_resource,
      updated_at = now()
  where excluded.observed_at >= public.bling_stock_mirror_v2.observed_at
  returning * into v_row;

  if found then
    v_applied := true;
  else
    select *
      into v_row
      from public.bling_stock_mirror_v2
     where product_id = p_product_id;
  end if;

  return jsonb_build_object(
    'applied',v_applied,
    'stale_ignored',not v_applied,
    'product_id',v_row.product_id,
    'bling_product_id',v_row.bling_product_id,
    'physical_total',v_row.physical_total,
    'virtual_total',v_row.virtual_total,
    'deposit_balances',v_row.deposit_balances,
    'observed_at',v_row.observed_at,
    'source_event_id',v_row.source_event_id,
    'source_resource',v_row.source_resource
  );
end
$$;

revoke all on function public.apply_bling_stock_mirror_event_v2(
  uuid,bigint,numeric,numeric,jsonb,timestamptz,text,text,boolean
) from public, anon, authenticated;

grant execute on function public.apply_bling_stock_mirror_event_v2(
  uuid,bigint,numeric,numeric,jsonb,timestamptz,text,text,boolean
) to service_role;

comment on function public.apply_bling_stock_mirror_event_v2(
  uuid,bigint,numeric,numeric,jsonb,timestamptz,text,text,boolean
) is
'Operations 2.0: aplica snapshot de stock/virtual_stock no shadow mirror. Eventos mais antigos que observed_at são ignorados e nunca alteram products.stock.';
