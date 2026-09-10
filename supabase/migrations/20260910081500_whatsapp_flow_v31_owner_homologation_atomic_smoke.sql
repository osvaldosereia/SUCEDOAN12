create or replace function public.recover_whatsapp_flow_owner_homologation_stale_v1(p_stale_minutes integer default 15)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_minutes integer:=greatest(5,least(coalesce(p_stale_minutes,15),120));
  v_jobs integer:=0;
  v_sessions integer:=0;
begin
  update public.outbound_jobs j
     set status='error',
         last_error='owner_homologation_dispatch_stale',
         locked_at=null,
         locked_by=null,
         updated_at=now()
   where j.status='processing'
     and j.job_type='seller_message'
     and j.payload->>'delivery_mode'='interactive'
     and j.payload#>>'{interactive,type}'='flow'
     and j.payload ? 'homologation_session_id'
     and coalesce(j.last_dispatch_at,j.updated_at,j.created_at) < now()-(v_minutes||' minutes')::interval
     and exists (
       select 1
         from public.experience_sessions s
         join public.experience_definitions d on d.id=s.definition_id
        where s.id=(j.payload->>'homologation_session_id')::uuid
          and d.slug='flow-cestas-comercial-v8-stable'
          and coalesce((s.context->>'homologation_test')::boolean,false)
          and coalesce((s.context->>'requested_by_owner')::boolean,false)
     );
  get diagnostics v_jobs=row_count;

  update public.experience_sessions s
     set status='abandoned',updated_at=now()
   where s.status in ('offered','open')
     and s.expires_at<=now()
     and coalesce((s.context->>'homologation_test')::boolean,false)
     and coalesce((s.context->>'requested_by_owner')::boolean,false)
     and exists(select 1 from public.experience_definitions d where d.id=s.definition_id and d.slug='flow-cestas-comercial-v8-stable');
  get diagnostics v_sessions=row_count;

  return jsonb_build_object('ok',true,'stale_jobs_recovered',v_jobs,'expired_sessions_abandoned',v_sessions,'stale_minutes',v_minutes);
end;
$function$;

revoke all on function public.recover_whatsapp_flow_owner_homologation_stale_v1(integer) from public, anon, authenticated;
grant execute on function public.recover_whatsapp_flow_owner_homologation_stale_v1(integer) to service_role;

create or replace function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v1(
  p_conversation_id uuid,
  p_idempotency_key text,
  p_body_text text default 'TESTE V31 — Flow Dona Antônia. Toque em Montar pedido.'
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_issue jsonb;
  v_session_id uuid;
  v_token text;
  v_flow_id text;
  v_cta text;
  v_action text;
  v_version text;
  v_recipient text;
  v_job_id uuid;
  v_dedupe text;
  v_payload jsonb;
  v_dispatch jsonb;
  c public.conversations%rowtype;
begin
  perform public.recover_whatsapp_flow_owner_homologation_stale_v1(15);

  select * into c from public.conversations where id=p_conversation_id;
  if not found then raise exception 'conversation_not_found'; end if;

  v_issue:=public.issue_whatsapp_flow_owner_homologation_token_v1(p_conversation_id,p_idempotency_key);
  if not coalesce((v_issue->>'ok')::boolean,false) then raise exception 'homologation_token_issue_failed'; end if;

  v_session_id:=(v_issue->>'session_id')::uuid;
  v_token:=v_issue->>'flow_token';
  v_flow_id:=v_issue->>'flow_id';
  v_cta:=coalesce(nullif(v_issue->>'flow_cta',''),'Montar pedido');
  v_action:=coalesce(nullif(v_issue->>'flow_action',''),'data_exchange');
  v_version:=coalesce(nullif(v_issue->>'flow_message_version',''),'3');
  v_recipient:=c.wa_contact_e164;
  v_dedupe:='flow-v31-owner-smoke:'||left(encode(extensions.digest(trim(p_idempotency_key),'sha256'),'hex'),32);

  select id into v_job_id from public.outbound_jobs where dedupe_key=v_dedupe;
  if v_job_id is null then
    v_payload:=jsonb_build_object(
      'body_text',left(coalesce(nullif(trim(p_body_text),''),'TESTE V31 — Flow Dona Antônia. Toque em Montar pedido.'),4096),
      'message_kind','conversation_reply',
      'message_type','interactive',
      'delivery_mode','interactive',
      'homologation_session_id',v_session_id::text,
      'interactive',jsonb_build_object(
        'type','flow',
        'body',jsonb_build_object('text',left(coalesce(nullif(trim(p_body_text),''),'TESTE V31 — Flow Dona Antônia. Toque em Montar pedido.'),1024)),
        'action',jsonb_build_object(
          'name','flow',
          'parameters',jsonb_build_object(
            'flow_message_version',v_version,
            'flow_token',v_token,
            'flow_id',v_flow_id,
            'flow_cta',v_cta,
            'flow_action',v_action
          )
        )
      )
    );

    insert into public.outbound_jobs(
      whatsapp_account_id,customer_id,conversation_id,job_type,status,recipient_e164,payload,dedupe_key,max_attempts,not_before
    ) values(
      c.whatsapp_account_id,c.customer_id,c.id,'seller_message','pending',v_recipient,v_payload,v_dedupe,3,now()
    ) returning id into v_job_id;
  end if;

  v_dispatch:=public.dispatch_whatsapp_flow_owner_homologation_job_v1(v_job_id);
  return jsonb_build_object('ok',true,'job_id',v_job_id,'session_id',v_session_id,'dispatch',v_dispatch,'recipient',v_recipient,'homologation_only',true);
end;
$function$;

revoke all on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v1(uuid,text,text) from public, anon, authenticated;
grant execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v1(uuid,text,text) to service_role;