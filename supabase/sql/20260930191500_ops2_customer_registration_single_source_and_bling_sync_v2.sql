-- Single source of truth for customer registration -> admin -> Bling.
-- Applied to production on 2026-09-30.

create or replace function public.ops2_maybe_enqueue_customer_bling_v1(
  p_customer_id uuid,
  p_reason text default 'registration_state_change'
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_state jsonb;
  v_customer public.customers%rowtype;
  v_address_updated_at timestamptz;
  v_existing uuid;
  v_job uuid;
  v_fingerprint text;
begin
  if p_customer_id is null then return null; end if;

  select * into v_customer
  from public.customers
  where id=p_customer_id;
  if not found then return null; end if;

  v_state:=public.ops2_customer_registration_state_v1(p_customer_id);

  if coalesce((v_state->>'bling_ready')::boolean,false)=false then
    return null;
  end if;

  select j.id into v_existing
  from public.bling_hub_jobs_v2 j
  where j.domain='customer'
    and j.operation='sync_customer'
    and j.source_system='canonical_ssbes'
    and j.source_id=p_customer_id::text
    and j.status in ('pending','processing','retry')
  order by j.created_at desc,j.id desc
  limit 1;
  if v_existing is not null then return v_existing; end if;

  select max(a.updated_at) into v_address_updated_at
  from public.customer_addresses a
  where a.customer_id=p_customer_id and a.is_active=true;

  v_fingerprint:=md5(
    coalesce(v_state::text,'')||'|'||
    coalesce(v_customer.updated_at::text,'')||'|'||
    coalesce(v_address_updated_at::text,'')
  );

  v_job:=public.enqueue_bling_hub_job_v2(
    'customer',
    'sync_customer',
    'canonical_ssbes',
    p_customer_id::text,
    'canonical_ssbes:customer:'||p_customer_id::text||':registration:'||v_fingerprint,
    jsonb_build_object(
      'customer_id',p_customer_id,
      'allow_create',true,
      'requested_from','registration_state_trigger',
      'reason',coalesce(nullif(trim(p_reason),''),'registration_state_change'),
      'canonical_registration_state',v_state
    ),
    1
  );

  return v_job;
end;
$$;

create or replace function public.ops2_refresh_customer_registration_journeys_v1(
  p_customer_id uuid,
  p_emit_event boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order_id uuid;
  v_count integer:=0;
  v_bling_job uuid;
begin
  if p_customer_id is null then
    return jsonb_build_object('ok',false,'error','customer_id_required','refreshed_orders',0);
  end if;

  for v_order_id in
    select o.id
    from public.orders o
    where o.customer_id=p_customer_id
      and o.source in ('vitrine','storefront_v2')
  loop
    perform public.ops2_refresh_order_registration_journey_v1(v_order_id,p_emit_event);
    v_count:=v_count+1;
  end loop;

  v_bling_job:=public.ops2_maybe_enqueue_customer_bling_v1(
    p_customer_id,
    'registration_journey_refresh'
  );

  return jsonb_build_object(
    'ok',true,
    'customer_id',p_customer_id,
    'refreshed_orders',v_count,
    'bling_job_id',v_bling_job
  );
end;
$$;

create or replace view public.ops2_admin_customer_registration_v1
with (security_invoker=true)
as
select
  c.id as customer_id,
  c.name as customer_name,
  c.cpf_cnpj,
  c.primary_whatsapp_e164,
  c.bling_contact_id,
  s.state as registration_state,
  coalesce((s.state->>'registration_complete')::boolean,false) as registration_complete,
  coalesce((s.state->>'flow_required')::boolean,true) as flow_required,
  coalesce((s.state->>'document_only_pending')::boolean,false) as document_only_pending,
  coalesce((s.state->>'bling_ready')::boolean,false) as bling_ready,
  coalesce((s.state->>'already_linked_bling')::boolean,false) as bling_linked,
  coalesce(s.state->'missing_fields','[]'::jsonb) as missing_fields,
  case when a.id is null then '{}'::jsonb else jsonb_build_object(
    'id',a.id,
    'street',a.street,
    'number',a.number,
    'complement',a.complement,
    'neighborhood',a.neighborhood,
    'city',a.city,
    'state',a.state,
    'postal_code',a.postal_code,
    'reference',a.reference,
    'google_maps_url',a.google_maps_url,
    'block',a.block,
    'is_default',a.is_default,
    'updated_at',a.updated_at
  ) end as current_address
from public.customers c
cross join lateral (
  select public.ops2_customer_registration_state_v1(c.id) as state
) s
left join lateral (
  select ca.*
  from public.customer_addresses ca
  where ca.customer_id=c.id and ca.is_active=true
  order by ca.is_default desc nulls last, ca.updated_at desc nulls last, ca.created_at desc
  limit 1
) a on true;

-- Backfill is deliberately limited to recent operational customers.
do $$
declare r record;
begin
  for r in
    select distinct o.customer_id
    from public.orders o
    join public.customers c on c.id=o.customer_id
    where o.customer_id is not null
      and o.source in ('vitrine','storefront_v2')
      and o.created_at >= now()-interval '7 days'
      and coalesce(c.bling_contact_id,0)=0
      and coalesce((public.ops2_customer_registration_state_v1(c.id)->>'registration_complete')::boolean,false)=true
  loop
    perform public.ops2_maybe_enqueue_customer_bling_v1(r.customer_id,'recent_operational_backfill');
  end loop;
end;
$$;
