create or replace function public.get_papoai_webhook_health_v3()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
with runtime as (
  select r.*
  from public.papoai_webhook_runtime_v2 r
  where r.id=1
), status_31d as (
  select i.status,count(*)::int as cnt
  from public.papoai_webhook_inbox_v2 i
  where i.received_at>=now()-interval '31 days'
  group by i.status
), channel_31d as (
  select
    coalesce(
      nullif(right(regexp_replace(coalesce(i.metadata->>'business_phone_e164',i.metadata->>'phone_to',''),'\D','','g'),4),''),
      'unknown'
    ) as channel_suffix,
    count(*)::int as cnt
  from public.papoai_webhook_inbox_v2 i
  where i.received_at>=now()-interval '31 days'
  group by 1
)
select jsonb_build_object(
  'generated_at',now(),
  'capture_enabled',(select capture_enabled from runtime),
  'last_seen_at',(select last_seen_at from runtime),
  'freshness_seconds',(
    select case when last_seen_at is null then null else extract(epoch from (now()-last_seen_at))::bigint end
    from runtime
  ),
  'last_runtime_error',(select last_error from runtime),
  'events_total',(select count(*) from public.papoai_webhook_inbox_v2),
  'events_24h',(select count(*) from public.papoai_webhook_inbox_v2 where received_at>=now()-interval '24 hours'),
  'raw_pending',(
    select count(*) from public.papoai_webhook_inbox_v2
    where status='captured' and expires_at>now()
  ),
  'normalized_terminal',(
    select count(*) from public.papoai_webhook_inbox_v2 where status='normalized'
  ),
  'processed_special',(
    select count(*) from public.papoai_webhook_inbox_v2 where status='processed'
  ),
  'review_required',(
    select count(*) from public.papoai_webhook_inbox_v2 where status='review_required'
  ),
  'events_with_error',(
    select count(*) from public.papoai_webhook_inbox_v2
    where nullif(btrim(coalesce(last_error,'')),'') is not null
  ),
  'conversation_linked_24h',(
    select count(*) from public.papoai_webhook_inbox_v2
    where received_at>=now()-interval '24 hours'
      and status in ('normalized','processed')
      and nullif(metadata->>'conversation_id','') is not null
  ),
  'conversation_unlinked_24h',(
    select count(*) from public.papoai_webhook_inbox_v2
    where received_at>=now()-interval '24 hours'
      and status in ('normalized','processed')
      and nullif(metadata->>'conversation_id','') is null
  ),
  'customer_linked_24h',(
    select count(*) from public.papoai_webhook_inbox_v2
    where received_at>=now()-interval '24 hours'
      and nullif(metadata->>'customer_id','') is not null
  ),
  'status_counts_31d',coalesce((select jsonb_object_agg(status,cnt) from status_31d),'{}'::jsonb),
  'channel_counts_31d',coalesce((select jsonb_object_agg(channel_suffix,cnt) from channel_31d),'{}'::jsonb),
  'flow_events_total',(select count(*) from public.papoai_customer_flow_events_v1),
  'flow_events_review',(select count(*) from public.papoai_customer_flow_events_v1 where status<>'processed'),
  'registration_summary',public.ops2_customer_registration_summary_v1(31),
  'structured_draft_enabled',(select structured_draft_enabled from public.ops2_papoai_bridge_runtime_v1 where id=1),
  'structured_order_commit_enabled',(select structured_order_commit_enabled from public.ops2_papoai_bridge_runtime_v1 where id=1)
);
$$;

revoke all on function public.get_papoai_webhook_health_v3() from public,anon,authenticated;
grant execute on function public.get_papoai_webhook_health_v3() to service_role;
