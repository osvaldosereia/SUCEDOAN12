create or replace function public.is_whatsapp_basket_choice_flow_live_v1()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.experience_definitions d
    join public.experience_feature_flags f on f.key=d.feature_key
    where d.slug='flow-cestas-escolha-v1'
      and d.feature_key='flow_basket_commercial'
      and d.experience_type='whatsapp_flow'
      and d.status='active'
      and d.provider_id='1070149582048643'
      and coalesce((d.metadata->>'customer_exposure')::boolean,false)
      and coalesce((d.metadata->>'production_enabled')::boolean,false)
      and coalesce(d.metadata->>'provider_status','')='PUBLISHED'
      and coalesce(d.metadata->>'health_status','')='AVAILABLE'
      and f.enabled
      and f.rollout_percent=100
      and f.channel='whatsapp'
  );
$$;

revoke all on function public.is_whatsapp_basket_choice_flow_live_v1() from public,anon,authenticated;
grant execute on function public.is_whatsapp_basket_choice_flow_live_v1() to service_role;

create or replace function public.queue_whatsapp_basket_choice_flow_live_v1(
  p_conversation_id uuid,
  p_source_message_id uuid default null,
  p_body_text text default 'Escolha sua cesta básica. Depois eu te pergunto se quer receber assim ou personalizar.'
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  cfg public.automation_config%rowtype;
  c public.conversations%rowtype;
  d public.experience_definitions%rowtype;
  s public.experience_sessions%rowtype;
  v_token text;
  v_hash text;
  v_protocol text;
  v_body text;
  v_key text;
  v_interactive jsonb;
  v_reply_id uuid;
  v_job_id uuid;
  v_existing_job uuid;
begin
  if not public.is_whatsapp_basket_choice_flow_live_v1() then
    raise exception 'basket_choice_flow_not_live';
  end if;

  select * into cfg from public.automation_config where id=1;
  if not found
     or not coalesce(cfg.automation_enabled,false)
     or not coalesce(cfg.outbound_enabled,false)
     or not coalesce(cfg.ai_enabled,false)
     or not coalesce(cfg.conversation_worker_enabled,false)
     or not coalesce(cfg.whatsapp_inbound_enabled,false)
     or not coalesce(cfg.whatsapp_auto_reply_enabled,false) then
    raise exception 'whatsapp_automation_unavailable';
  end if;

  select * into c from public.conversations where id=p_conversation_id for update;
  if not found or c.channel<>'whatsapp' or c.whatsapp_account_id is null then raise exception 'whatsapp_conversation_required'; end if;
  if c.human_required or c.mode='human' then raise exception 'conversation_requires_human'; end if;
  if c.service_window_expires_at is null or c.service_window_expires_at<=now() then raise exception 'conversation_service_window_closed'; end if;

  select * into d from public.experience_definitions
  where slug='flow-cestas-escolha-v1' and status='active' and provider_id='1070149582048643';
  if not found then raise exception 'basket_choice_flow_definition_unavailable'; end if;

  v_key:='basket-choice-live:'||coalesce(p_source_message_id::text,gen_random_uuid()::text);
  if p_source_message_id is not null then
    select j.id into v_existing_job from public.outbound_jobs j where j.dedupe_key=v_key limit 1;
    if found then
      select es.* into s from public.experience_sessions es where es.idempotency_key=v_key limit 1;
      return jsonb_build_object('ok',true,'duplicate',true,'session_id',s.id,'outbound_job_id',v_existing_job,'flow_id',d.provider_id,'definition_slug',d.slug);
    end if;
  end if;

  select coalesce(protocol_version,'3') into v_protocol from public.whatsapp_flow_transport_config where id=1;
  v_protocol:=coalesce(nullif(v_protocol,''),'3');
  if v_protocol<>'3' then raise exception 'unsupported_flow_message_version'; end if;

  v_token:=encode(extensions.gen_random_bytes(24),'hex');
  v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
  v_body:=left(coalesce(nullif(trim(coalesce(p_body_text,'')),''),'Escolha sua cesta básica. Depois eu te pergunto se quer receber assim ou personalizar.'),1024);

  insert into public.experience_sessions(
    conversation_id,customer_id,definition_id,source_message_id,idempotency_key,context,
    flow_token_hash,flow_token_issued_at,expires_at
  ) values(
    c.id,c.customer_id,d.id,p_source_message_id,v_key,
    jsonb_build_object('entry_reason','basket_intent','experience','basket_photo_list_v2','selective_live_lane',true),
    v_hash,now(),now()+interval '30 minutes'
  ) returning * into s;

  insert into public.experience_events(conversation_id,session_id,definition_id,event_type,interface_type,cohort,event_data)
  values(c.id,s.id,d.id,'session_created','whatsapp_flow',c.automation_cohort,jsonb_build_object('feature_key',d.feature_key,'definition_slug',d.slug,'selective_live_lane',true));
  insert into public.experience_events(conversation_id,session_id,definition_id,event_type,interface_type,cohort,event_data)
  values(c.id,s.id,d.id,'flow_token_issued','whatsapp_flow',c.automation_cohort,jsonb_build_object('definition_slug',d.slug,'provider_id',d.provider_id,'protocol_version',v_protocol,'selective_live_lane',true));

  v_interactive:=jsonb_build_object(
    'type','flow','body',jsonb_build_object('text',v_body),
    'action',jsonb_build_object('name','flow','parameters',jsonb_build_object(
      'flow_message_version',v_protocol,'flow_token',v_token,'flow_id',d.provider_id,
      'flow_cta','Escolher cesta','flow_action','data_exchange'
    ))
  );

  insert into public.messages(conversation_id,direction,message_type,body_text,ai_interpretation,raw_event)
  values(c.id,'outbound','interactive',v_body,
    jsonb_build_object('source','whatsapp_flow','action_type','basket_choice_flow_live','delivery_mode','interactive','action_result',jsonb_build_object('session_id',s.id,'flow_id',d.provider_id,'definition_slug',d.slug)),
    jsonb_build_object('source','whatsapp','flow_offer',true,'selective_live_lane',true,'source_message_id',p_source_message_id))
  returning id into v_reply_id;

  insert into public.outbound_jobs(whatsapp_account_id,customer_id,conversation_id,job_type,recipient_e164,dedupe_key,payload)
  values(c.whatsapp_account_id,c.customer_id,c.id,'seller_message',c.wa_contact_e164,v_key,
    jsonb_build_object('message_kind','conversation_reply','message_type','interactive','body_text',v_body,
      'delivery_mode','interactive','interactive',v_interactive,'reply_message_id',v_reply_id,
      'source_message_id',p_source_message_id,'service_window_expires_at',c.service_window_expires_at,
      'basket_choice_flow_live',true,'flow_session_id',s.id))
  returning id into v_job_id;

  insert into public.whatsapp_sales_action_events(conversation_id,message_id,action_type,action_payload,result,reversible,required_confirmation,confidence)
  values(c.id,p_source_message_id,'basket_choice_flow_live',jsonb_build_object('interactive',v_interactive),jsonb_build_object('session_id',s.id,'flow_id',d.provider_id,'definition_slug',d.slug),true,false,1);

  return jsonb_build_object('ok',true,'duplicate',false,'session_id',s.id,'reply_message_id',v_reply_id,'outbound_job_id',v_job_id,'flow_id',d.provider_id,'flow_action','data_exchange','definition_slug',d.slug);
end;
$$;

revoke all on function public.queue_whatsapp_basket_choice_flow_live_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.queue_whatsapp_basket_choice_flow_live_v1(uuid,uuid,text) to service_role;

create or replace function public.route_whatsapp_basket_choice_flow_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  m public.messages%rowtype;
  normalized text:='';
  awaiting text:='';
  v_reset boolean:=false;
  v_flow jsonb;
  v_body text;
begin
  if new.job_type<>'conversation' or new.status<>'pending' then return new; end if;
  if not public.is_whatsapp_basket_choice_flow_live_v1() then return new; end if;

  select * into m from public.messages where id=new.message_id and direction='inbound';
  if not found then return new; end if;

  normalized:=translate(lower(trim(regexp_replace(coalesce(m.body_text,m.transcript,''),'\s+',' ','g'))),
    'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');

  select coalesce(s.awaiting,'') into awaiting from public.whatsapp_sales_state s where s.conversation_id=new.conversation_id;
  if not found then awaiting:=''; end if;

  v_reset:=normalized ~ '(^| )(novo pedido|pedido novo|reiniciar( o)? pedido|recomecar( o)? pedido|comecar( um)? novo pedido|comecar de novo|quero (fazer )?(um )?pedido novo|quero (fazer )?outro pedido|nova compra)( |$)';

  if v_reset then
    perform public.reset_whatsapp_order_context_v1(new.conversation_id,m.id,'explicit_new_order');
  elsif normalized !~ '(^| )(cesta|cestas|cesta basica|cestas basicas)( |$)' then
    return new;
  elsif awaiting='basket_address_flow' then
    perform public.cancel_whatsapp_address_flow_v1(new.conversation_id);
    perform public.update_whatsapp_sales_state_v1(new.conversation_id,null,null,'basket_choice_requested',null,'');
  elsif awaiting<>'' then
    return new;
  end if;

  v_body:='Escolha sua cesta básica. Toque em uma cesta para ver os produtos antes de encomendar.';
  v_flow:=public.queue_whatsapp_basket_choice_flow_live_v1(new.conversation_id,m.id,v_body);
  new.status:='done';
  new.result:=jsonb_build_object('deterministic',true,'action','basket_choice_photo_flow','flow',v_flow,'selective_live_lane',true);
  new.updated_at:=now();
  return new;
end;
$$;

revoke all on function public.route_whatsapp_basket_choice_flow_v1() from public,anon,authenticated;
drop trigger if exists trg_000_whatsapp_basket_choice_flow_v1 on public.ai_jobs;
create trigger trg_000_whatsapp_basket_choice_flow_v1 before insert on public.ai_jobs
for each row execute function public.route_whatsapp_basket_choice_flow_v1();

create or replace function public.dispatch_whatsapp_flow_outbound_job_v1(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_cfg public.automation_config%rowtype;
  v_job public.outbound_jobs%rowtype;
  v_interactive jsonb;
  v_webhook text;
  v_request_id bigint;
  v_payload jsonb;
  v_params jsonb;
  v_address_flow_id text;
  v_basket_flow_id text;
  v_is_address_flow boolean:=false;
  v_is_basket_choice_flow boolean:=false;
begin
  if p_job_id is null then return jsonb_build_object('ok',false,'reason','job_id_required'); end if;
  select * into v_cfg from public.automation_config where id=1;

  select j.* into v_job
  from public.outbound_jobs j join public.conversations c on c.id=j.conversation_id
  where j.id=p_job_id and j.job_type='seller_message' and j.payload->>'message_kind'='conversation_reply'
    and j.payload->>'delivery_mode'='interactive' and j.payload#>>'{interactive,type}'='flow'
    and j.status in ('pending','error') and j.not_before<=now() and j.attempts<j.max_attempts
    and c.mode='ai' and c.service_window_expires_at>now()
  for update of j;
  if not found then return jsonb_build_object('ok',true,'skipped','job_unavailable'); end if;

  v_interactive:=v_job.payload->'interactive';
  v_params:=v_interactive#>'{action,parameters}';
  select provider_id into v_address_flow_id from public.experience_definitions where slug='flow-endereco-v1' and status='active';
  select provider_id into v_basket_flow_id from public.experience_definitions where slug='flow-cestas-escolha-v1' and status='active';
  v_is_address_flow:=coalesce(v_params->>'flow_id','')=coalesce(v_address_flow_id,'') and coalesce(v_params->>'flow_action','')='navigate';
  v_is_basket_choice_flow:=coalesce(v_params->>'flow_id','')=coalesce(v_basket_flow_id,'')
    and coalesce(v_params->>'flow_action','')='data_exchange'
    and coalesce(v_job.payload->>'basket_choice_flow_live','false')='true'
    and public.is_whatsapp_basket_choice_flow_live_v1();

  if not coalesce(v_cfg.automation_enabled and v_cfg.outbound_enabled and v_cfg.ai_enabled and v_cfg.conversation_worker_enabled,false) then
    return jsonb_build_object('ok',true,'skipped','automation_disabled');
  end if;
  if not coalesce(v_cfg.whatsapp_flow_send_enabled,false) and not v_is_address_flow and not v_is_basket_choice_flow then
    return jsonb_build_object('ok',true,'skipped','whatsapp_flow_send_disabled');
  end if;

  if coalesce(v_interactive->>'type','')<>'flow' or coalesce(v_interactive#>>'{action,name}','')<>'flow' then return jsonb_build_object('ok',false,'reason','flow_payload_invalid'); end if;
  if coalesce(v_params->>'flow_message_version','')<>'3'
     or coalesce(v_params->>'flow_id','') !~ '^[0-9]{6,32}$'
     or coalesce(v_params->>'flow_token','') !~ '^[A-Fa-f0-9]{32,128}$'
     or nullif(trim(coalesce(v_params->>'flow_cta','')),'') is null
     or length(v_params->>'flow_cta')>20
     or coalesce(v_params->>'flow_action','') not in ('data_exchange','navigate') then
    return jsonb_build_object('ok',false,'reason','flow_parameters_invalid');
  end if;
  if coalesce(v_params->>'flow_action','')='navigate' and jsonb_typeof(v_params->'flow_action_payload') is distinct from 'object' then
    return jsonb_build_object('ok',false,'reason','flow_navigation_payload_required');
  end if;

  select decrypted_secret into v_webhook from vault.decrypted_secrets
  where name='dona_antonia_whatsapp_outbound_make_webhook' order by created_at desc limit 1;
  if nullif(v_webhook,'') is null then return jsonb_build_object('ok',false,'reason','webhook_unavailable'); end if;

  update public.outbound_jobs
  set status='processing',attempts=attempts+1,locked_at=now(),locked_by='pgnet-make-flow-v1',dispatch_attempts=dispatch_attempts+1,
      last_dispatch_at=now(),last_error=null,dispatch_response_status=null,dispatch_response=null,dispatch_response_checked_at=null,updated_at=now()
  where id=v_job.id returning * into v_job;

  v_payload:=jsonb_build_object('event','outbound_delivery','protocol_version',4,'job',jsonb_build_object(
    'id',v_job.id::text,'conversation_id',v_job.conversation_id::text,'recipient_e164',v_job.recipient_e164,'attempt',v_job.attempts,
    'delivery_mode','interactive','body_text',left(coalesce(v_job.payload->>'body_text',''),4096),'interactive',v_interactive,'reply_message_id',v_job.payload->>'reply_message_id'));
  begin
    v_request_id:=net.http_post(url:=v_webhook,body:=v_payload,headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=30000);
  exception when others then
    update public.outbound_jobs set status='error',last_error='flow_dispatch_enqueue_failed',not_before=now()+interval '2 minutes',locked_at=null,locked_by=null,updated_at=now() where id=v_job.id;
    return jsonb_build_object('ok',false,'reason','flow_dispatch_enqueue_failed');
  end;
  update public.outbound_jobs set last_dispatch_request_id=v_request_id,updated_at=now() where id=v_job.id;
  return jsonb_build_object('ok',true,'request_id',v_request_id,'job_id',v_job.id,'protocol_version',4,'interactive_type','flow','address_flow',v_is_address_flow,'basket_choice_flow',v_is_basket_choice_flow);
end;
$$;

revoke all on function public.dispatch_whatsapp_flow_outbound_job_v1(uuid) from public,anon,authenticated;
grant execute on function public.dispatch_whatsapp_flow_outbound_job_v1(uuid) to service_role;

update public.experience_definitions
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('default_for_new_sessions',false,'customer_exposure',false),updated_at=now()
where feature_key='flow_basket_commercial' and slug<>'flow-cestas-escolha-v1';

update public.experience_definitions
set status='active',
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('default_for_new_sessions',true,'customer_exposure',true,'production_enabled',true,'provider_status','PUBLISHED','health_status','AVAILABLE','selective_live_lane',true,'restored_photo_list_at',now()),
    config=coalesce(config,'{}'::jsonb)||jsonb_build_object('flow_cta','Escolher cesta','flow_action','data_exchange','endpoint_uri','https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/whatsapp-flow-data-exchange-v1','flow_json_path','whatsapp/flows/flow-cestas-escolha-v1.json','data_api_version','3.0'),
    updated_at=now()
where slug='flow-cestas-escolha-v1' and provider_id='1070149582048643';