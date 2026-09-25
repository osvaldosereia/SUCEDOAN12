-- Dona Antonia Operations 2.0
-- Foundation API v1: idempotent ledger/attention/approval helpers and cheap Control Tower summary.

create or replace function public.ops_record_event_v1(
  p_domain text,
  p_event_type text,
  p_summary text,
  p_actor_type text default 'system',
  p_entity_type text default null,
  p_entity_id text default null,
  p_correlation_id text default null,
  p_actor_id text default null,
  p_actor_label text default null,
  p_source_system text default 'dona_antonia',
  p_severity text default 'info',
  p_payload jsonb default '{}'::jsonb,
  p_external_ref text default null,
  p_idempotency_key text default null,
  p_occurred_at timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_idempotency_key is not null then
    select id into v_id
    from public.ops_events
    where idempotency_key=p_idempotency_key
    limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  insert into public.ops_events(
    occurred_at,domain,event_type,entity_type,entity_id,correlation_id,
    actor_type,actor_id,actor_label,source_system,severity,summary,payload,
    external_ref,idempotency_key
  ) values (
    coalesce(p_occurred_at,now()),p_domain,p_event_type,p_entity_type,p_entity_id,p_correlation_id,
    p_actor_type,p_actor_id,p_actor_label,p_source_system,p_severity,p_summary,coalesce(p_payload,'{}'::jsonb),
    p_external_ref,p_idempotency_key
  )
  returning id into v_id;

  return v_id;
exception when unique_violation then
  select id into v_id from public.ops_events where idempotency_key=p_idempotency_key limit 1;
  return v_id;
end;
$$;

create or replace function public.ops_open_attention_v1(
  p_type text,
  p_summary text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_correlation_id text default null,
  p_priority text default 'normal',
  p_owner_role text default 'supervisor',
  p_recommended_action text default null,
  p_evidence jsonb default '{}'::jsonb,
  p_source_system text default 'dona_antonia',
  p_idempotency_key text default null,
  p_due_at timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_idempotency_key is not null then
    select id into v_id
    from public.ops_attention
    where idempotency_key=p_idempotency_key
      and status in ('open','acknowledged')
    limit 1;

    if v_id is not null then
      update public.ops_attention
      set updated_at=now(),
          summary=p_summary,
          priority=p_priority,
          owner_role=p_owner_role,
          recommended_action=p_recommended_action,
          evidence=coalesce(p_evidence,'{}'::jsonb),
          due_at=p_due_at
      where id=v_id;
      return v_id;
    end if;
  end if;

  insert into public.ops_attention(
    type,entity_type,entity_id,correlation_id,priority,owner_role,status,
    summary,recommended_action,evidence,source_system,idempotency_key,due_at
  ) values (
    p_type,p_entity_type,p_entity_id,p_correlation_id,p_priority,p_owner_role,'open',
    p_summary,p_recommended_action,coalesce(p_evidence,'{}'::jsonb),p_source_system,p_idempotency_key,p_due_at
  )
  returning id into v_id;

  return v_id;
exception when unique_violation then
  select id into v_id from public.ops_attention where idempotency_key=p_idempotency_key limit 1;
  return v_id;
end;
$$;

create or replace function public.ops_resolve_attention_v1(
  p_attention_id uuid,
  p_resolution text,
  p_resolution_ref text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ops_attention
  set status='resolved',
      updated_at=now(),
      resolved_at=now(),
      resolution=p_resolution,
      resolution_ref=p_resolution_ref
  where id=p_attention_id
    and status in ('open','acknowledged');

  return found;
end;
$$;

create or replace function public.ops_request_approval_v1(
  p_action_type text,
  p_summary text,
  p_risk text default 'medium',
  p_entity_type text default null,
  p_entity_id text default null,
  p_correlation_id text default null,
  p_requested_by_type text default 'automation',
  p_requested_by_id text default null,
  p_requested_by_label text default null,
  p_proposed_action jsonb default '{}'::jsonb,
  p_evidence jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_expires_at timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_idempotency_key is not null then
    select id into v_id
    from public.ops_approvals
    where idempotency_key=p_idempotency_key
    limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  insert into public.ops_approvals(
    status,risk,action_type,entity_type,entity_id,correlation_id,
    requested_by_type,requested_by_id,requested_by_label,summary,
    proposed_action,evidence,idempotency_key,expires_at
  ) values (
    'pending',p_risk,p_action_type,p_entity_type,p_entity_id,p_correlation_id,
    p_requested_by_type,p_requested_by_id,p_requested_by_label,p_summary,
    coalesce(p_proposed_action,'{}'::jsonb),coalesce(p_evidence,'{}'::jsonb),p_idempotency_key,p_expires_at
  )
  returning id into v_id;

  return v_id;
exception when unique_violation then
  select id into v_id from public.ops_approvals where idempotency_key=p_idempotency_key limit 1;
  return v_id;
end;
$$;

create or replace function public.get_ops_control_tower_summary_v1()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'orders', jsonb_build_object(
      'awaiting', (select count(*) from public.orders where status='storefront_received'),
      'confirmed', (select count(*) from public.orders where status='confirmed'),
      'ready', (select count(*) from public.orders where status='ready'),
      'delivered', (select count(*) from public.orders where status='delivered'),
      'cancelled', (select count(*) from public.orders where status='cancelled')
    ),
    'whatsapp', jsonb_build_object(
      'human_required', (select count(*) from public.conversations where channel='whatsapp' and human_required=true),
      'human_mode', (select count(*) from public.conversations where channel='whatsapp' and mode='human')
    ),
    'inventory', jsonb_build_object(
      'active_products', (select count(*) from public.products where is_active=true),
      'zero_or_negative', (select count(*) from public.products where is_active=true and coalesce(stock,0)<=0),
      'expires_90d', (select count(*) from public.products where is_active=true and validity_date is not null and validity_date between current_date and current_date+90),
      'expired', (select count(*) from public.products where is_active=true and validity_date is not null and validity_date<current_date)
    ),
    'attention', jsonb_build_object(
      'open', (select count(*) from public.ops_attention where status in ('open','acknowledged')),
      'critical', (select count(*) from public.ops_attention where status in ('open','acknowledged') and priority='critical'),
      'high', (select count(*) from public.ops_attention where status in ('open','acknowledged') and priority='high')
    ),
    'approvals', jsonb_build_object(
      'pending', (select count(*) from public.ops_approvals where status='pending')
    )
  );
$$;

revoke all on function public.ops_record_event_v1(text,text,text,text,text,text,text,text,text,text,text,jsonb,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.ops_open_attention_v1(text,text,text,text,text,text,text,text,jsonb,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.ops_resolve_attention_v1(uuid,text,text) from public, anon, authenticated;
revoke all on function public.ops_request_approval_v1(text,text,text,text,text,text,text,text,text,jsonb,jsonb,text,timestamptz) from public, anon, authenticated;
revoke all on function public.get_ops_control_tower_summary_v1() from public, anon, authenticated;

grant execute on function public.ops_record_event_v1(text,text,text,text,text,text,text,text,text,text,text,jsonb,text,text,timestamptz) to service_role;
grant execute on function public.ops_open_attention_v1(text,text,text,text,text,text,text,text,jsonb,text,text,timestamptz) to service_role;
grant execute on function public.ops_resolve_attention_v1(uuid,text,text) to service_role;
grant execute on function public.ops_request_approval_v1(text,text,text,text,text,text,text,text,text,jsonb,jsonb,text,timestamptz) to service_role;
grant execute on function public.get_ops_control_tower_summary_v1() to service_role;
