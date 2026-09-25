-- Dona Antonia Operations 2.0
-- PapoAI capture observability v3: expose bridge health without extra jobs.

create or replace function public.get_papoai_webhook_capture_status_v2()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'capture_enabled',r.capture_enabled,
    'last_seen_at',r.last_seen_at,
    'last_event_key',r.last_event_key,
    'last_error',r.last_error,
    'captured_24h',(select count(*) from public.papoai_webhook_inbox_v2 where received_at>=now()-interval '24 hours'),
    'pending',(select count(*) from public.papoai_webhook_inbox_v2 where status in ('captured','normalized') and expires_at>now()),
    'raw_pending',(select count(*) from public.papoai_webhook_inbox_v2 where status='captured' and expires_at>now()),
    'normalized_pending',(select count(*) from public.papoai_webhook_inbox_v2 where status='normalized' and expires_at>now()),
    'review_required',(select count(*) from public.papoai_webhook_inbox_v2 where status='review_required' and expires_at>now()),
    'conversation_linked_24h',(
      select count(*)
      from public.papoai_webhook_inbox_v2
      where received_at>=now()-interval '24 hours'
        and status='normalized'
        and coalesce(metadata->>'conversation_id','')<>''
    ),
    'conversation_unlinked_24h',(
      select count(*)
      from public.papoai_webhook_inbox_v2
      where received_at>=now()-interval '24 hours'
        and status='normalized'
        and coalesce(metadata->>'conversation_id','')=''
    ),
    'expired',(select count(*) from public.papoai_webhook_inbox_v2 where expires_at<=now()),
    'adapter_version',2,
    'conversation_bridge_version',2
  )
  from public.papoai_webhook_runtime_v2 r
  where r.id=1;
$$;

revoke all on function public.get_papoai_webhook_capture_status_v2() from public,anon,authenticated;
grant execute on function public.get_papoai_webhook_capture_status_v2() to service_role;
