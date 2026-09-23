
do $$
declare
  v_product_ok boolean;
  v_customer_ok boolean;
  v_legacy_frozen boolean;
begin
  select exists(
    select 1 from public.bling_hub_jobs_v2
    where domain='product' and status='synced'
      and coalesce((result->>'verified')::boolean,false)=true
  ) into v_product_ok;

  select exists(
    select 1 from public.bling_hub_jobs_v2
    where domain='customer' and status='synced'
      and coalesce((result->>'verified')::boolean,false)=true
  ) into v_customer_ok;

  select legacy_queues_frozen
    into v_legacy_frozen
  from public.bling_hub_runtime_v2
  where id=1;

  if not coalesce(v_product_ok,false) then
    raise exception 'product_canary_not_verified';
  end if;
  if not coalesce(v_customer_ok,false) then
    raise exception 'customer_canary_not_verified';
  end if;
  if not coalesce(v_legacy_frozen,false) then
    raise exception 'legacy_queues_not_frozen';
  end if;
  if exists(
    select 1 from public.fiscal_runtime_config
    where id=1 and (
      enabled=true
      or bling_invoice_prepare_enabled=true
      or bling_invoice_send_enabled=true
    )
  ) then
    raise exception 'fiscal_must_remain_off';
  end if;

  update public.bling_hub_runtime_v2
  set mode='live',
      hub_enabled=true,
      products_enabled=true,
      customers_enabled=true,
      stock_enabled=false,
      orders_enabled=false,
      webhooks_enabled=false,
      fiscal_enabled=false,
      updated_at=now()
  where id=1;
end
$$;
