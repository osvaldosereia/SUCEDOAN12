begin;

create or replace function public.ops2_admin_ana_preview_start_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid:=auth.uid();
  v_conversation public.conversations%rowtype;
  v_message public.whatsapp_messages_v1%rowtype;
  v_job public.whatsapp_ana_jobs_v1%rowtype;
  v_gate jsonb;
  v_history jsonb:='[]'::jsonb;
  v_recovered_stale boolean:=false;
  v_previous_claimed_at timestamptz:=null;
  v_recovery_count integer:=0;
begin
  if v_user is null then
    return jsonb_build_object('ok',false,'error','admin_auth_required');
  end if;
  if not exists (
    select 1 from public.admin_users a
    where a.user_id=v_user and a.is_active=true
  ) then
    return jsonb_build_object('ok',false,'error','admin_not_authorized');
  end if;
  if p_conversation_id is null then
    return jsonb_build_object('ok',false,'error','invalid_conversation_id');
  end if;

  select c.* into v_conversation
  from public.conversations c
  where c.id=p_conversation_id
  for update;
  if not found then
    return jsonb_build_object('ok',false,'error','conversation_not_found');
  end if;

  v_gate:=public.ops2_attendance_ai_gate_v1(v_conversation.id);
  if coalesce((v_gate->>'ok')::boolean,false) is not true
     or coalesce((v_gate->>'allowed')::boolean,false) is not true then
    return jsonb_build_object('ok',false,'error','ai_gate_closed','gate',v_gate);
  end if;

  select m.* into v_message
  from public.whatsapp_messages_v1 m
  where m.conversation_id=v_conversation.id
    and m.direction='inbound'
    and m.message_type='text'
    and nullif(btrim(coalesce(m.text_body,'')),'') is not null
  order by coalesce(m.received_at,m.created_at) desc,m.created_at desc,m.id desc
  limit 1;
  if not found then
    return jsonb_build_object('ok',false,'error','ana_preview_no_text_inbound');
  end if;

  select j.* into v_job
  from public.whatsapp_ana_jobs_v1 j
  where j.inbound_message_id=v_message.id
  for update;

  if found then
    if v_job.status='claimed' then
      if v_job.claimed_at is null
         or v_job.claimed_at > now() - interval '2 minutes'
         or v_job.dry_run is not true
         or coalesce(v_job.metadata->>'source','')<>'admin_preview'
         or coalesce(v_job.metadata->>'dry_run_not_sendable','false')<>'true' then
        return jsonb_build_object('ok',false,'error','ana_preview_busy','job_id',v_job.id);
      end if;

      v_recovered_stale:=true;
      v_previous_claimed_at:=v_job.claimed_at;
      begin
        v_recovery_count:=greatest(0,coalesce((v_job.metadata->>'stale_claim_recovery_count')::integer,0));
      exception when others then
        v_recovery_count:=0;
      end;
    end if;

    if v_job.status='completed' then
      return jsonb_build_object(
        'ok',true,'cached',true,'dry_run',true,'dry_run_not_sendable',true,
        'job_id',v_job.id,'status',v_job.status,'decision',v_job.decision,
        'suggestion_text',v_job.suggestion_text,'confidence',v_job.confidence,
        'reason',v_job.reason,'model',v_job.model,
        'missing_context',coalesce(v_job.metadata->'missing_context','[]'::jsonb),
        'completed_at',v_job.completed_at
      );
    end if;

    update public.whatsapp_ana_jobs_v1 j
    set status='claimed',claimed_at=now(),completed_at=null,last_error=null,
        decision=null,suggestion_text=null,confidence=null,reason=null,
        attempt_count=j.attempt_count+1,
        metadata=coalesce(j.metadata,'{}'::jsonb)
          || jsonb_build_object(
            'source','admin_preview',
            'initiated_by',v_user,
            'dry_run_not_sendable',true
          )
          || case when v_recovered_stale then jsonb_build_object(
            'stale_claim_recovery_count',v_recovery_count+1,
            'last_stale_claim_recovered_at',now(),
            'last_stale_claimed_at',v_previous_claimed_at,
            'stale_claim_recovery_reason','lease_expired'
          ) else '{}'::jsonb end,
        updated_at=now()
    where j.id=v_job.id
    returning j.* into v_job;
  else
    insert into public.whatsapp_ana_jobs_v1(
      inbound_message_id,conversation_id,whatsapp_account_id,dry_run,status,
      claimed_at,attempt_count,metadata
    ) values (
      v_message.id,v_conversation.id,v_message.whatsapp_account_id,true,'claimed',
      now(),1,jsonb_build_object(
        'source','admin_preview',
        'initiated_by',v_user,
        'provider',v_message.provider,
        'provider_message_id',v_message.provider_message_id,
        'dry_run_not_sendable',true
      )
    ) returning * into v_job;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'direction',x.direction,
      'text_body',x.text_body,
      'sender_kind',x.sender_kind,
      'created_at',x.occurred_at
    ) order by x.occurred_at,x.id
  ),'[]'::jsonb)
  into v_history
  from (
    select m.id,m.direction,m.text_body,m.sender_kind,
           coalesce(m.received_at,m.sent_at,m.created_at) occurred_at
    from public.whatsapp_messages_v1 m
    where m.conversation_id=v_conversation.id
      and nullif(btrim(coalesce(m.text_body,'')),'') is not null
    order by coalesce(m.received_at,m.sent_at,m.created_at) desc,m.created_at desc,m.id desc
    limit 12
  ) x;

  return jsonb_build_object(
    'ok',true,'cached',false,'dry_run',true,'dry_run_not_sendable',true,
    'job_id',v_job.id,'status',v_job.status,
    'inbound_message_id',v_message.id,'inbound_text',v_message.text_body,
    'history',v_history,
    'recovered_stale_claim',v_recovered_stale
  );
end;
$function$;

revoke all on function public.ops2_admin_ana_preview_start_v1(uuid) from public,anon,authenticated;
grant execute on function public.ops2_admin_ana_preview_start_v1(uuid) to authenticated;

commit;
