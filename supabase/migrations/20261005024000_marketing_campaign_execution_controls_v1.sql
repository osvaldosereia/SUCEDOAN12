begin;

create or replace function public.marketing_cancel_campaign_execution_v1(
  p_campaign_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_campaign public.marketing_campaigns_v1%rowtype;
  v_skipped integer:=0;
  v_cancelled_outbox integer:=0;
  v_reason text:=coalesce(nullif(btrim(coalesce(p_reason,'')),''),'campaign_cancelled');
begin
  select * into v_campaign from public.marketing_campaigns_v1 where id=p_campaign_id for update;
  if not found then return jsonb_build_object('ok',false,'error','campaign_not_found'); end if;
  if v_campaign.status='cancelled' then
    return jsonb_build_object('ok',true,'duplicate',true,'campaign_id',v_campaign.id,'status','cancelled');
  end if;
  if v_campaign.status not in ('scheduled','running','paused') then
    return jsonb_build_object('ok',false,'error','campaign_invalid_transition','status',v_campaign.status);
  end if;

  update public.whatsapp_outbox_v1 o
  set status='cancelled',last_error='campaign_cancelled',updated_at=now()
  where o.id in (
    select d.outbox_id from public.marketing_campaign_dispatches_v1 d
    where d.campaign_id=v_campaign.id and d.status in ('pending','claimed','retry') and d.outbox_id is not null
  ) and o.status in ('queued','claimed');
  get diagnostics v_cancelled_outbox=row_count;

  update public.whatsapp_messages_v1 m
  set status_current='cancelled'
  where m.id in (
    select o.message_id from public.whatsapp_outbox_v1 o
    join public.marketing_campaign_dispatches_v1 d on d.outbox_id=o.id
    where d.campaign_id=v_campaign.id and o.status='cancelled' and o.message_id is not null
  ) and m.status_current in ('queued','sending');

  update public.marketing_campaign_dispatches_v1
  set status='skipped',skip_reason='campaign_cancelled',claimed_at=null,last_error=v_reason,updated_at=now()
  where campaign_id=v_campaign.id and status in ('pending','claimed','retry');
  get diagnostics v_skipped=row_count;

  update public.marketing_campaigns_v1
  set status='cancelled',cancelled_at=now(),execution_last_error=v_reason,updated_at=now()
  where id=v_campaign.id;

  return jsonb_build_object('ok',true,'duplicate',false,'campaign_id',v_campaign.id,'status','cancelled',
    'skipped_dispatches',v_skipped,'cancelled_outboxes',v_cancelled_outbox);
end;
$$;
revoke all on function public.marketing_cancel_campaign_execution_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.marketing_cancel_campaign_execution_v1(uuid,text) to service_role;

create or replace function public.marketing_campaign_execution_status_v1(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_campaign public.marketing_campaigns_v1%rowtype;
  v_execution public.marketing_campaign_execution_runtime_v1%rowtype;
  v_channel public.whatsapp_channel_runtime_v1%rowtype;
  v_total integer:=0;
  v_pending integer:=0;
  v_claimed integer:=0;
  v_skipped integer:=0;
  v_accepted integer:=0;
  v_retry integer:=0;
  v_uncertain integer:=0;
  v_failed integer:=0;
begin
  select * into v_campaign from public.marketing_campaigns_v1 where id=p_campaign_id;
  if not found then return jsonb_build_object('ok',false,'error','campaign_not_found'); end if;
  select * into v_execution from public.marketing_campaign_execution_runtime_v1 where whatsapp_account_id=v_campaign.whatsapp_account_id;
  select * into v_channel from public.whatsapp_channel_runtime_v1 where whatsapp_account_id=v_campaign.whatsapp_account_id;

  select count(*)::integer,
         count(*) filter(where status='pending')::integer,
         count(*) filter(where status='claimed')::integer,
         count(*) filter(where status='skipped')::integer,
         count(*) filter(where status='accepted')::integer,
         count(*) filter(where status='retry')::integer,
         count(*) filter(where status='uncertain')::integer,
         count(*) filter(where status='failed')::integer
  into v_total,v_pending,v_claimed,v_skipped,v_accepted,v_retry,v_uncertain,v_failed
  from public.marketing_campaign_dispatches_v1 where campaign_id=v_campaign.id;

  return jsonb_build_object(
    'ok',true,
    'campaign_id',v_campaign.id,
    'status',v_campaign.status,
    'revision',v_campaign.revision,
    'scheduled_for',v_campaign.scheduled_for,
    'started_at',v_campaign.started_at,
    'paused_at',v_campaign.paused_at,
    'completed_at',v_campaign.completed_at,
    'failed_at',v_campaign.failed_at,
    'cancelled_at',v_campaign.cancelled_at,
    'execution_last_error',v_campaign.execution_last_error,
    'runtime',jsonb_build_object(
      'mode',coalesce(v_execution.mode,'off'),
      'campaigns_enabled',coalesce(v_channel.campaigns_enabled,false),
      'send_enabled',coalesce(v_channel.send_enabled,false),
      'outbound_provider',v_channel.outbound_provider
    ),
    'counts',jsonb_build_object(
      'total',v_total,'pending',v_pending,'claimed',v_claimed,'skipped',v_skipped,
      'accepted',v_accepted,'retry',v_retry,'uncertain',v_uncertain,'failed',v_failed
    )
  );
end;
$$;
revoke all on function public.marketing_campaign_execution_status_v1(uuid) from public,anon,authenticated;
grant execute on function public.marketing_campaign_execution_status_v1(uuid) to service_role;

commit;
