
do $$
begin
  if not exists(
    select 1
    from public.bling_hub_jobs_v2
    where domain='stock'
      and status='synced'
      and coalesce((result->>'verified')::boolean,false)=true
      and coalesce((result->>'changed')::boolean,false)=true
  ) then
    raise exception 'stock_write_canary_not_verified';
  end if;

  if not exists(
    select 1 from public.bling_hub_runtime_v2
    where id=1 and legacy_queues_frozen=true
  ) then
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
      stock_enabled=true,
      orders_enabled=false,
      webhooks_enabled=false,
      fiscal_enabled=false,
      updated_at=now()
  where id=1;

  update public.bling_hub_canary_allowlist_v2
  set enabled=false,updated_at=now()
  where domain='stock';
end
$$;
