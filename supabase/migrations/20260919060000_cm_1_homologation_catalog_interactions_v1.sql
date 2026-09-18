-- CM-1 homologation: canonical catalog search/view interactions.
-- Adds deterministic, server-only event recording with short-window dedupe.

create index if not exists catalog_events_session_type_time_idx
  on public.catalog_events(catalog_session_id,event_type,occurred_at desc);

create index if not exists catalog_events_session_product_type_time_idx
  on public.catalog_events(catalog_session_id,product_id,event_type,occurred_at desc)
  where product_id is not null;

create or replace function public.record_catalog_interaction_v1(
  p_catalog_session_id uuid,
  p_event_type text,
  p_product_id uuid default null,
  p_event_data jsonb default '{}'::jsonb,
  p_dedupe_seconds integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $fn$
declare
  v_type text:=lower(btrim(coalesce(p_event_type,'')));
  v_session public.catalog_sessions%rowtype;
  v_data jsonb:=coalesce(p_event_data,'{}'::jsonb);
  v_fp text;
  v_existing uuid;
  v_event uuid;
  v_dedupe integer:=greatest(0,least(coalesce(p_dedupe_seconds,30),3600));
begin
  if p_catalog_session_id is null then raise exception 'catalog_session_required'; end if;
  if v_type not in ('catalog_search','product_view') then raise exception 'invalid_catalog_interaction'; end if;
  if jsonb_typeof(v_data)<>'object' then raise exception 'event_data_must_be_object'; end if;

  select * into v_session
  from public.catalog_sessions
  where id=p_catalog_session_id
  limit 1;
  if not found then raise exception 'catalog_session_not_found'; end if;
  if v_session.status='closed' then raise exception 'catalog_session_closed'; end if;
  if v_session.expires_at<=now() then raise exception 'catalog_session_expired'; end if;

  if v_type='product_view' then
    if p_product_id is null then raise exception 'product_id_required'; end if;
    if not exists(select 1 from public.products where id=p_product_id) then raise exception 'product_not_found'; end if;
  end if;

  v_fp:=encode(extensions.digest(
    concat_ws('|',
      v_type,
      coalesce(p_product_id::text,''),
      v_data::text
    ),
    'sha256'
  ),'hex');

  if v_dedupe>0 then
    select e.id into v_existing
    from public.catalog_events e
    where e.catalog_session_id=p_catalog_session_id
      and e.event_type=v_type
      and e.product_id is not distinct from p_product_id
      and e.event_data->>'event_fingerprint'=v_fp
      and e.occurred_at>=now()-make_interval(secs=>v_dedupe)
    order by e.occurred_at desc
    limit 1;
  end if;

  if v_existing is not null then
    return jsonb_build_object(
      'ok',true,
      'duplicate',true,
      'event_id',v_existing,
      'event_type',v_type,
      'external_side_effect',false
    );
  end if;

  insert into public.catalog_events(
    catalog_session_id,customer_id,product_id,event_type,event_data,occurred_at
  )
  values(
    p_catalog_session_id,
    v_session.customer_id,
    p_product_id,
    v_type,
    v_data||jsonb_build_object(
      'event_fingerprint',v_fp,
      'collector_version','cm1-catalog-interactions-v1'
    ),
    now()
  )
  returning id into v_event;

  return jsonb_build_object(
    'ok',true,
    'duplicate',false,
    'event_id',v_event,
    'event_type',v_type,
    'customer_id',v_session.customer_id,
    'external_side_effect',false
  );
end;
$fn$;

revoke all on function public.record_catalog_interaction_v1(uuid,text,uuid,jsonb,integer)
from public,anon,authenticated;
grant execute on function public.record_catalog_interaction_v1(uuid,text,uuid,jsonb,integer)
to service_role;
