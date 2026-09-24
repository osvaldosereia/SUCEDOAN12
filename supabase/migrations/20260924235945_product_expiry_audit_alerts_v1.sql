create table if not exists public.product_lifecycle_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  product_id uuid not null references public.products(id) on delete cascade,
  event text not null,
  actor_type text not null default 'system',
  actor_label text,
  previous_active boolean,
  new_active boolean,
  previous_expiration_date date,
  new_expiration_date date,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists product_lifecycle_audit_product_created_idx
  on public.product_lifecycle_audit (organization_id, product_id, created_at desc);

create index if not exists product_lifecycle_audit_event_created_idx
  on public.product_lifecycle_audit (organization_id, event, created_at desc);

alter table public.product_lifecycle_audit enable row level security;
revoke all on table public.product_lifecycle_audit from anon, authenticated;
grant all on table public.product_lifecycle_audit to service_role;

comment on table public.product_lifecycle_audit is
  'Trilha operacional de ativacao, desativacao e validade dos produtos. Escrita/leitura somente pelo backend administrativo.';

create or replace function public.reconcile_expiry_offers(p_organization_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $fn$
declare
  v_today date := (timezone('America/Cuiaba', now()))::date;
  v_expired_zeroed integer := 0;
  v_expired_deactivated integer := 0;
  v_expired_audited integer := 0;
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

  insert into public.product_lifecycle_audit (
    organization_id, product_id, event, actor_type, actor_label,
    previous_active, new_active, previous_expiration_date, new_expiration_date, details
  )
  select
    p.organization_id,
    p.id,
    'auto_expired_deactivation',
    'system',
    'Sistema · regra de validade',
    true,
    false,
    p.expiration_date,
    p.expiration_date,
    jsonb_build_object(
      'stock_before',coalesce(p.stock_quantity,0),
      'auto_expiry_offer_before',coalesce(p.auto_expiry_offer_enabled,false),
      'rule_date',v_today
    )
  from public.products p
  where p.organization_id = p_organization_id
    and p.active = true
    and p.expiration_date is not null
    and p.expiration_date < v_today;
  get diagnostics v_expired_audited = row_count;

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
    'expired_audited', v_expired_audited,
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
