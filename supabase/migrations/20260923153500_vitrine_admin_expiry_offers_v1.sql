create extension if not exists pg_cron;

alter table public.products
  add column if not exists expiration_date date,
  add column if not exists auto_expiry_offer_enabled boolean not null default false;

create index if not exists products_org_expiration_date_idx
  on public.products (organization_id, expiration_date)
  where expiration_date is not null;

create unique index if not exists offers_org_product_unique_idx
  on public.offers (organization_id, product_id);

create or replace function public.reconcile_expiry_offers(p_organization_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $fn$
declare
  v_today date := (timezone('America/Cuiaba', now()))::date;
  v_expired_zeroed integer := 0;
  v_expired_offers_disabled integer := 0;
  v_ended_offers_disabled integer := 0;
  v_auto_disabled integer := 0;
  v_auto_upserted integer := 0;
begin
  if p_organization_id is null then
    raise exception 'organization_required';
  end if;

  update public.products p
     set stock_quantity = 0,
         updated_at = now()
   where p.organization_id = p_organization_id
     and p.expiration_date is not null
     and p.expiration_date < v_today
     and coalesce(p.stock_quantity,0) <> 0;
  get diagnostics v_expired_zeroed = row_count;

  update public.offers o
     set active = false,
         metadata = coalesce(o.metadata,'{}'::jsonb) || jsonb_build_object('deactivated_reason','expired_product','deactivated_at',now())
   where o.organization_id = p_organization_id
     and o.active = true
     and exists (
       select 1 from public.products p
        where p.id = o.product_id
          and p.organization_id = p_organization_id
          and p.expiration_date is not null
          and p.expiration_date < v_today
     );
  get diagnostics v_expired_offers_disabled = row_count;

  update public.offers o
     set active = false,
         metadata = coalesce(o.metadata,'{}'::jsonb) || jsonb_build_object('deactivated_reason','offer_ended','deactivated_at',now())
   where o.organization_id = p_organization_id
     and o.active = true
     and o.ends_at is not null
     and o.ends_at <= now();
  get diagnostics v_ended_offers_disabled = row_count;

  update public.offers o
     set active = false,
         metadata = coalesce(o.metadata,'{}'::jsonb) || jsonb_build_object('deactivated_reason','expiry_auto_not_eligible','deactivated_at',now())
   where o.organization_id = p_organization_id
     and coalesce(o.metadata->>'source','') = 'expiry_auto'
     and not exists (
       select 1 from public.products p
        where p.id = o.product_id
          and p.organization_id = p_organization_id
          and p.auto_expiry_offer_enabled = true
          and p.expiration_date between v_today and (v_today + 90)
          and p.active = true
          and coalesce(p.stock_quantity,0) > 0
          and p.sale_price_cents > 0
     );
  get diagnostics v_auto_disabled = row_count;

  insert into public.offers (
    organization_id, product_id, title, sale_price_cents,
    starts_at, ends_at, active, metadata
  )
  select
    p.organization_id,
    p.id,
    case
      when (p.expiration_date - v_today) < 30 then 'Oferta validade · 40%'
      when (p.expiration_date - v_today) < 60 then 'Oferta validade · 20%'
      else 'Oferta validade · 10%'
    end,
    greatest(
      1,
      round(
        p.sale_price_cents::numeric *
        case
          when (p.expiration_date - v_today) < 30 then 0.60
          when (p.expiration_date - v_today) < 60 then 0.80
          else 0.90
        end
      )::integer
    ),
    now(),
    ((p.expiration_date + 1)::timestamp at time zone 'America/Cuiaba'),
    true,
    jsonb_build_object(
      'source','expiry_auto',
      'discount_percent',
        case
          when (p.expiration_date - v_today) < 30 then 40
          when (p.expiration_date - v_today) < 60 then 20
          else 10
        end,
      'duration_mode','expiration_date',
      'expiration_date',p.expiration_date,
      'managed_at',now()
    )
  from public.products p
  where p.organization_id = p_organization_id
    and p.auto_expiry_offer_enabled = true
    and p.expiration_date between v_today and (v_today + 90)
    and p.active = true
    and coalesce(p.stock_quantity,0) > 0
    and p.sale_price_cents > 0
  on conflict (organization_id, product_id)
  do update set
    title = excluded.title,
    sale_price_cents = excluded.sale_price_cents,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    active = excluded.active,
    metadata = excluded.metadata;
  get diagnostics v_auto_upserted = row_count;

  return jsonb_build_object(
    'ok', true,
    'today', v_today,
    'expired_zeroed', v_expired_zeroed,
    'expired_offers_disabled', v_expired_offers_disabled,
    'ended_offers_disabled', v_ended_offers_disabled,
    'auto_disabled', v_auto_disabled,
    'auto_upserted', v_auto_upserted
  );
end;
$fn$;

revoke all on function public.reconcile_expiry_offers(uuid) from public, anon, authenticated;
grant execute on function public.reconcile_expiry_offers(uuid) to service_role;

create or replace function public.stop_stock_zero_offer_v1()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if coalesce(new.stock_quantity,0) <= 0 and coalesce(old.stock_quantity,0) > 0 then
    update public.offers
       set active = false,
           metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
             'deactivated_reason','stock_zero',
             'deactivated_at',now()
           )
     where organization_id = new.organization_id
       and product_id = new.id
       and active = true
       and coalesce(metadata->>'duration_mode','') = 'stock_zero';
  end if;
  return new;
end;
$fn$;

drop trigger if exists products_stop_stock_zero_offer_v1 on public.products;
create trigger products_stop_stock_zero_offer_v1
after update of stock_quantity on public.products
for each row
when (old.stock_quantity is distinct from new.stock_quantity)
execute function public.stop_stock_zero_offer_v1();

do $do$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
    from cron.job
   where jobname = 'dona-antonia-expiry-offers'
   limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'dona-antonia-expiry-offers',
    '5 4 * * *',
    $cmd$select public.reconcile_expiry_offers('95b1b61d-f6ed-41cb-8917-b55f6793b10b'::uuid);$cmd$
  );
end;
$do$;
