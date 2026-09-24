alter table public.products
  add column if not exists deactivation_reason text,
  add column if not exists deactivated_at timestamptz;

comment on column public.products.deactivation_reason is
  'Motivo operacional da inativacao do produto. expired identifica desativacao automatica por vencimento.';
comment on column public.products.deactivated_at is
  'Momento da inativacao operacional do produto.';

create index if not exists products_org_deactivation_reason_idx
  on public.products (organization_id, deactivation_reason, deactivated_at desc)
  where active = false;

create or replace function public.enforce_product_expiration_state_v1()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  v_today date := (timezone('America/Cuiaba', now()))::date;
begin
  -- Regra dura: um produto ja vencido nunca pode permanecer/voltar ativo.
  if coalesce(new.active,true) = true
     and new.expiration_date is not null
     and new.expiration_date < v_today then
    new.active := false;
    new.stock_quantity := 0;
    new.auto_expiry_offer_enabled := false;
    new.deactivation_reason := 'expired';
    new.deactivated_at := coalesce(new.deactivated_at, now());
  elsif tg_op = 'UPDATE' and old.active is distinct from new.active then
    if new.active = true then
      new.deactivation_reason := null;
      new.deactivated_at := null;
    else
      new.deactivation_reason := coalesce(nullif(new.deactivation_reason,''),'manual');
      new.deactivated_at := coalesce(new.deactivated_at, now());
    end if;
  elsif tg_op = 'INSERT' and coalesce(new.active,true) = false then
    new.deactivation_reason := coalesce(nullif(new.deactivation_reason,''),'manual');
    new.deactivated_at := coalesce(new.deactivated_at, now());
  end if;

  return new;
end;
$fn$;

drop trigger if exists products_enforce_expiration_state_v1 on public.products;
create trigger products_enforce_expiration_state_v1
before insert or update on public.products
for each row execute function public.enforce_product_expiration_state_v1();

revoke all on function public.enforce_product_expiration_state_v1() from public, anon, authenticated;
grant execute on function public.enforce_product_expiration_state_v1() to service_role;

create or replace function public.reconcile_expiry_offers(p_organization_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $fn$
declare
  v_today date := (timezone('America/Cuiaba', now()))::date;
  v_expired_zeroed integer := 0;
  v_expired_deactivated integer := 0;
  v_expired_offers_disabled integer := 0;
  v_inactive_offers_disabled integer := 0;
  v_ended_offers_disabled integer := 0;
  v_auto_disabled integer := 0;
  v_auto_upserted integer := 0;
begin
  if p_organization_id is null then
    raise exception 'organization_required';
  end if;

  select count(*)::integer
    into v_expired_zeroed
    from public.products p
   where p.organization_id = p_organization_id
     and p.active = true
     and p.expiration_date is not null
     and p.expiration_date < v_today
     and coalesce(p.stock_quantity,0) <> 0;

  -- Ao virar o dia seguinte ao vencimento, sai da vitrine, zera estoque e desliga oferta automatica.
  update public.products p
     set active = false,
         stock_quantity = 0,
         auto_expiry_offer_enabled = false,
         deactivation_reason = 'expired',
         deactivated_at = coalesce(p.deactivated_at, now()),
         updated_at = now()
   where p.organization_id = p_organization_id
     and p.active = true
     and p.expiration_date is not null
     and p.expiration_date < v_today;
  get diagnostics v_expired_deactivated = row_count;

  update public.offers o
     set active = false,
         metadata = coalesce(o.metadata,'{}'::jsonb) ||
           jsonb_build_object('deactivated_reason','expired_product','deactivated_at',now())
   where o.organization_id = p_organization_id
     and o.active = true
     and exists (
       select 1
         from public.products p
        where p.id = o.product_id
          and p.organization_id = p_organization_id
          and p.deactivation_reason = 'expired'
          and p.expiration_date is not null
          and p.expiration_date < v_today
     );
  get diagnostics v_expired_offers_disabled = row_count;

  -- Produto inativo nao pode manter oferta ativa, independentemente da origem da oferta.
  update public.offers o
     set active = false,
         metadata = coalesce(o.metadata,'{}'::jsonb) ||
           jsonb_build_object('deactivated_reason','inactive_product','deactivated_at',now())
   where o.organization_id = p_organization_id
     and o.active = true
     and exists (
       select 1
         from public.products p
        where p.id = o.product_id
          and p.organization_id = p_organization_id
          and p.active = false
     );
  get diagnostics v_inactive_offers_disabled = row_count;

  update public.offers o
     set active = false,
         metadata = coalesce(o.metadata,'{}'::jsonb) ||
           jsonb_build_object('deactivated_reason','offer_ended','deactivated_at',now())
   where o.organization_id = p_organization_id
     and o.active = true
     and o.ends_at is not null
     and o.ends_at <= now();
  get diagnostics v_ended_offers_disabled = row_count;

  update public.offers o
     set active = false,
         metadata = coalesce(o.metadata,'{}'::jsonb) ||
           jsonb_build_object('deactivated_reason','expiry_auto_not_eligible','deactivated_at',now())
   where o.organization_id = p_organization_id
     and o.active = true
     and coalesce(o.metadata->>'source','') = 'expiry_auto'
     and not exists (
       select 1
         from public.products p
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
    greatest(1, round(
      p.sale_price_cents::numeric *
      case
        when (p.expiration_date - v_today) < 30 then 0.60
        when (p.expiration_date - v_today) < 60 then 0.80
        else 0.90
      end
    )::integer),
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
    'expired_deactivated', v_expired_deactivated,
    'expired_offers_disabled', v_expired_offers_disabled,
    'inactive_offers_disabled', v_inactive_offers_disabled,
    'ended_offers_disabled', v_ended_offers_disabled,
    'auto_disabled', v_auto_disabled,
    'auto_upserted', v_auto_upserted
  );
end;
$fn$;

revoke all on function public.reconcile_expiry_offers(uuid) from public, anon, authenticated;
grant execute on function public.reconcile_expiry_offers(uuid) to service_role;
