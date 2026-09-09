begin;

create table if not exists public.whatsapp_order_context_resets (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  source_message_id uuid references public.messages(id) on delete set null,
  reset_at timestamptz not null default now(),
  reset_count integer not null default 1 check(reset_count>0),
  reason text not null default 'new_order',
  metadata jsonb not null default '{}'::jsonb
);
alter table public.whatsapp_order_context_resets enable row level security;
revoke all on public.whatsapp_order_context_resets from public,anon,authenticated;
grant select,insert,update,delete on public.whatsapp_order_context_resets to service_role;

update public.experience_feature_flags
set enabled=true, rollout_percent=100, updated_at=now()
where key in ('flow_basket_commercial','flow_personalize_basket');

create or replace function public.reset_whatsapp_order_context_v1(
  p_conversation_id uuid,
  p_source_message_id uuid default null,
  p_reason text default 'new_order'
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_cart_count integer:=0;
  v_request_count integer:=0;
  v_session_count integer:=0;
  v_s record;
  v_reason text:=left(trim(coalesce(p_reason,'new_order')),120);
begin
  perform 1 from public.conversations where id=p_conversation_id for update;
  if not found then raise exception 'conversation_not_found'; end if;

  update public.carts set status='abandoned',updated_at=now()
   where conversation_id=p_conversation_id and status='draft';
  get diagnostics v_cart_count=row_count;

  update public.whatsapp_basket_order_requests set status='cancelled',updated_at=now()
   where conversation_id=p_conversation_id and status='ready_for_human';
  get diagnostics v_request_count=row_count;

  for v_s in select id from public.experience_sessions
              where conversation_id=p_conversation_id and status in ('offered','open')
  loop
    perform public.abandon_experience_session_v1(v_s.id,'new_order_reset');
    v_session_count:=v_session_count+1;
  end loop;

  delete from public.whatsapp_sales_state where conversation_id=p_conversation_id;

  insert into public.whatsapp_order_context_resets(conversation_id,source_message_id,reset_at,reset_count,reason,metadata)
  values(p_conversation_id,p_source_message_id,now(),1,v_reason,jsonb_build_object('source','deterministic_new_order'))
  on conflict(conversation_id) do update
    set source_message_id=excluded.source_message_id,
        reset_at=excluded.reset_at,
        reset_count=public.whatsapp_order_context_resets.reset_count+1,
        reason=excluded.reason,
        metadata=excluded.metadata;

  update public.conversations
     set stage='new',context_summary=null,sales_pressure_level=0,proactive_offer_count=0,
         upsell_declined=false,fast_checkout=false,last_offer_at=null,updated_at=now()
   where id=p_conversation_id;

  return jsonb_build_object('ok',true,'conversation_id',p_conversation_id,
    'draft_carts_abandoned',v_cart_count,'basket_requests_cancelled',v_request_count,
    'experience_sessions_abandoned',v_session_count,'reset_at',now());
end;
$$;

create or replace function public.queue_whatsapp_flow_offer_v1(
  p_conversation_id uuid,
  p_source_message_id uuid,
  p_definition_slug text default 'flow-cestas-comercial-v1',
  p_cart_id uuid default null,
  p_body_text text default 'Escolha sua cesta e monte seu pedido aqui pelo WhatsApp.',
  p_context jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  cfg public.automation_config%rowtype;
  c public.conversations%rowtype;
  s jsonb; t jsonb; v_session_id uuid;
  v_body text:=left(trim(coalesce(p_body_text,'')),1024);
  v_key text; v_interactive jsonb; v_reply_id uuid; v_job_id uuid;
begin
  select * into cfg from public.automation_config where id=1;
  if not coalesce(cfg.experience_orchestrator_enabled and cfg.whatsapp_flow_data_exchange_enabled and cfg.whatsapp_flow_send_enabled,false) then
    raise exception 'whatsapp_flow_send_disabled';
  end if;
  select * into c from public.conversations where id=p_conversation_id and mode='ai' and status<>'closed' for update;
  if not found then raise exception 'conversation_not_available'; end if;
  if c.service_window_expires_at<=now() then raise exception 'conversation_service_window_closed'; end if;
  if v_body='' then v_body:='Escolha sua cesta e monte seu pedido aqui pelo WhatsApp.'; end if;

  v_key:='flow-offer:'||coalesce(p_source_message_id::text,gen_random_uuid()::text)||':'||left(coalesce(p_definition_slug,'flow-cestas-comercial-v1'),80);
  s:=public.create_experience_session_v1(c.id,coalesce(p_definition_slug,'flow-cestas-comercial-v1'),v_key,p_source_message_id,p_cart_id,coalesce(p_context,'{}'::jsonb));
  v_session_id:=(s->>'session_id')::uuid;
  t:=public.issue_whatsapp_flow_token_v1(v_session_id);

  v_interactive:=jsonb_build_object('type','flow','body',jsonb_build_object('text',v_body),'action',jsonb_build_object(
    'name','flow','parameters',jsonb_build_object('flow_message_version',t->>'flow_message_version','flow_token',t->>'flow_token',
      'flow_id',t->>'flow_id','flow_cta',t->>'flow_cta','flow_action',t->>'flow_action')));

  insert into public.messages(conversation_id,direction,message_type,body_text,ai_interpretation,raw_event)
  values(c.id,'outbound','interactive',v_body,
    jsonb_build_object('source','whatsapp_flow','action_type','whatsapp_flow_offer','delivery_mode','interactive','action_result',jsonb_build_object('session_id',v_session_id,'flow_id',t->>'flow_id','definition_slug',t->>'definition_slug')),
    jsonb_build_object('source','whatsapp','flow_offer',true,'source_message_id',p_source_message_id)) returning id into v_reply_id;

  insert into public.outbound_jobs(whatsapp_account_id,customer_id,conversation_id,job_type,recipient_e164,dedupe_key,payload)
  values(c.whatsapp_account_id,c.customer_id,c.id,'seller_message',c.wa_contact_e164,'flow_offer:'||v_reply_id::text,
    jsonb_build_object('message_kind','conversation_reply','message_type','interactive','body_text',v_body,'delivery_mode','interactive','interactive',v_interactive,
      'reply_message_id',v_reply_id,'source_message_id',p_source_message_id,'service_window_expires_at',c.service_window_expires_at))
  on conflict(dedupe_key) do nothing returning id into v_job_id;

  insert into public.whatsapp_sales_action_events(conversation_id,message_id,action_type,action_payload,result,reversible,required_confirmation,confidence)
  values(c.id,p_source_message_id,'whatsapp_flow_offer',jsonb_build_object('interactive',v_interactive),jsonb_build_object('session_id',v_session_id,'flow_id',t->>'flow_id'),true,false,1);

  return jsonb_build_object('ok',true,'session_id',v_session_id,'reply_message_id',v_reply_id,'outbound_job_id',v_job_id,'flow_id',t->>'flow_id','flow_action',t->>'flow_action');
end;
$$;

create or replace function public.dispatch_whatsapp_flow_outbound_job_v1(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_cfg public.automation_config%rowtype; v_job public.outbound_jobs%rowtype;
  v_interactive jsonb; v_webhook text; v_request_id bigint; v_payload jsonb; v_params jsonb;
begin
  if p_job_id is null then return jsonb_build_object('ok',false,'reason','job_id_required'); end if;
  select * into v_cfg from public.automation_config where id=1;
  if not coalesce(v_cfg.automation_enabled and v_cfg.outbound_enabled and v_cfg.ai_enabled and v_cfg.conversation_worker_enabled and v_cfg.whatsapp_flow_send_enabled,false) then
    return jsonb_build_object('ok',true,'skipped','automation_disabled');
  end if;

  select j.* into v_job from public.outbound_jobs j join public.conversations c on c.id=j.conversation_id
   where j.id=p_job_id and j.job_type='seller_message' and j.payload->>'message_kind'='conversation_reply'
     and j.payload->>'delivery_mode'='interactive' and j.payload#>>'{interactive,type}'='flow'
     and j.status in ('pending','error') and j.not_before<=now() and j.attempts<j.max_attempts
     and c.mode='ai' and c.service_window_expires_at>now() for update of j;
  if not found then return jsonb_build_object('ok',true,'skipped','job_unavailable'); end if;

  v_interactive:=v_job.payload->'interactive'; v_params:=v_interactive#>'{action,parameters}';
  if coalesce(v_interactive->>'type','')<>'flow' or coalesce(v_interactive#>>'{action,name}','')<>'flow' then return jsonb_build_object('ok',false,'reason','flow_payload_invalid'); end if;
  if coalesce(v_params->>'flow_message_version','')<>'3'
     or coalesce(v_params->>'flow_id','') !~ '^[0-9]{6,32}$'
     or coalesce(v_params->>'flow_token','') !~ '^[A-Fa-f0-9]{32,128}$'
     or nullif(trim(coalesce(v_params->>'flow_cta','')),'') is null or length(v_params->>'flow_cta')>20
     or coalesce(v_params->>'flow_action','') not in ('data_exchange','navigate') then
    return jsonb_build_object('ok',false,'reason','flow_parameters_invalid');
  end if;

  select decrypted_secret into v_webhook from vault.decrypted_secrets where name='dona_antonia_whatsapp_outbound_make_webhook' order by created_at desc limit 1;
  if nullif(v_webhook,'') is null then return jsonb_build_object('ok',false,'reason','webhook_unavailable'); end if;

  update public.outbound_jobs set status='processing',attempts=attempts+1,locked_at=now(),locked_by='pgnet-make-flow-v1',
    dispatch_attempts=dispatch_attempts+1,last_dispatch_at=now(),last_error=null,dispatch_response_status=null,dispatch_response=null,dispatch_response_checked_at=null,updated_at=now()
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
  return jsonb_build_object('ok',true,'request_id',v_request_id,'job_id',v_job.id,'protocol_version',4,'interactive_type','flow');
end;
$$;

create or replace function public.notify_whatsapp_outbound_insert()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.job_type='seller_message' and new.payload->>'message_kind'='conversation_reply' then
    begin
      if new.payload->>'delivery_mode'='interactive' and new.payload#>>'{interactive,type}'='flow' then
        perform public.dispatch_whatsapp_flow_outbound_job_v1(new.id);
      else
        perform public.dispatch_whatsapp_outbound_job(new.id);
      end if;
    exception when others then null;
    end;
  end if;
  return new;
end;
$$;

create or replace function public.route_whatsapp_flow_entry_v1()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  m public.messages%rowtype; iid text:=''; normalized text:=''; awaiting text:=''; v_reset boolean:=false;
  v_flow jsonb; v_cart_id uuid; v_selected_basket uuid; v_body text;
begin
  if new.job_type<>'conversation' or new.status<>'pending' then return new; end if;
  select * into m from public.messages where id=new.message_id and direction='inbound'; if not found then return new; end if;
  iid:=coalesce(m.ai_interpretation->>'id','');
  normalized:=translate(lower(trim(regexp_replace(coalesce(m.body_text,m.transcript,''),'\s+',' ','g'))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');
  select coalesce(s.awaiting,'') into awaiting from public.whatsapp_sales_state s where s.conversation_id=new.conversation_id; if not found then awaiting:=''; end if;

  v_reset:=normalized ~ '(^| )(novo pedido|pedido novo|reiniciar( o)? pedido|reinicie|recomecar( o)? pedido|comecar( um)? novo pedido|comecar de novo|quero (fazer )?(um )?pedido novo|quero (fazer )?outro pedido|quero comprar de novo|nova compra|fazer nova compra)( |$)';
  if v_reset then
    perform public.reset_whatsapp_order_context_v1(new.conversation_id,m.id,'explicit_new_order');
    v_body:='Vamos começar um novo pedido. Toque em Montar pedido para escolher sua cesta, personalizar e adicionar outros produtos.';
    v_flow:=public.queue_whatsapp_flow_offer_v1(new.conversation_id,m.id,'flow-cestas-comercial-v1',null,v_body,jsonb_build_object('entry_reason','new_order_reset'));
    new.status:='done'; new.result:=jsonb_build_object('deterministic',true,'action','new_order_flow','flow',v_flow,'context_reset',true); new.updated_at:=now(); return new;
  end if;

  if awaiting in ('basket_customer_confirmation','basket_customer_data') then return new; end if;
  if normalized ~ '(quero encomendar a cesta que escolhi|terminei de escolher os produtos adicionais da minha cesta)' then return new; end if;

  if iid like 'da_basket:%' or normalized ~ '(^| )(cesta|cestas)( |$)' then
    begin if iid like 'da_basket:%' then v_selected_basket:=substring(iid from length('da_basket:')+1)::uuid; end if; exception when others then v_selected_basket:=null; end;
    select id into v_cart_id from public.carts where conversation_id=new.conversation_id and status='draft' order by updated_at desc limit 1;
    v_body:='Abra o pedido para ver as 9 cestas com fotos, preços e composição. Você pode personalizar e adicionar outros produtos sem sair do WhatsApp.';
    v_flow:=public.queue_whatsapp_flow_offer_v1(new.conversation_id,m.id,'flow-cestas-comercial-v1',v_cart_id,v_body,
      jsonb_strip_nulls(jsonb_build_object('entry_reason','basket_intent','selected_basket_id',v_selected_basket)));
    new.status:='done'; new.result:=jsonb_build_object('deterministic',true,'action','whatsapp_flow_baskets','flow',v_flow); new.updated_at:=now(); return new;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_00_whatsapp_flow_entry_v1 on public.ai_jobs;
create trigger trg_00_whatsapp_flow_entry_v1 before insert on public.ai_jobs for each row execute function public.route_whatsapp_flow_entry_v1();

revoke all on function public.reset_whatsapp_order_context_v1(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.queue_whatsapp_flow_offer_v1(uuid,uuid,text,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.dispatch_whatsapp_flow_outbound_job_v1(uuid) from public,anon,authenticated;
revoke all on function public.route_whatsapp_flow_entry_v1() from public,anon,authenticated;
grant execute on function public.reset_whatsapp_order_context_v1(uuid,uuid,text) to service_role;
grant execute on function public.queue_whatsapp_flow_offer_v1(uuid,uuid,text,uuid,text,jsonb) to service_role;
grant execute on function public.dispatch_whatsapp_flow_outbound_job_v1(uuid) to service_role;

update public.experience_definitions
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('new_order_context_reset_enabled',true,'flow_entry_routing_enabled',true,
  'flow_feature_rollout_percent',100,'legacy_basket_catalog_link_superseded',true,'implementation_stage','new_order_reset_and_flow_entry_v19'),updated_at=now()
where slug='flow-cestas-comercial-v1';

commit;
