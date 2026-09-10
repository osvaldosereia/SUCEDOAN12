begin;

alter table public.agent_core_pre_router_snapshots
  add column if not exists fast_checkout boolean not null default false,
  add column if not exists upsell_declined boolean not null default false;

create or replace function public.observe_agent_core_pre_router_state_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  c public.conversations%rowtype;
  m public.messages%rowtype;
  st public.whatsapp_sales_state%rowtype;
  bs public.catalog_sessions%rowtype;
  k public.carts%rowtype;
  cust jsonb:='{}'::jsonb;
  contact jsonb:='{}'::jsonb;
  v_open_handoff boolean:=false;
  v_basket_active boolean:=false;
  v_cart_exists boolean:=false;
  v_cart_valid boolean:=false;
begin
  begin
    if new.job_type<>'conversation' or new.status<>'pending' or new.message_id is null then return new; end if;

    select * into c from public.conversations where id=new.conversation_id;
    if not found or c.channel<>'whatsapp' or coalesce(c.automation_cohort,'')<>'homologation' then return new; end if;

    select * into m from public.messages where id=new.message_id and conversation_id=new.conversation_id and direction='inbound';
    if not found then return new; end if;

    select * into st from public.whatsapp_sales_state where conversation_id=new.conversation_id;

    select * into bs
      from public.catalog_sessions
      where conversation_id=new.conversation_id and metadata->>'flow'='basket_basic_v1'
      order by created_at desc limit 1;
    v_basket_active:=bs.id is not null and bs.status='open' and (bs.expires_at is null or bs.expires_at>now());

    if bs.cart_id is not null then
      select * into k from public.carts where id=bs.cart_id;
    else
      select * into k from public.carts
      where conversation_id=new.conversation_id and status='draft'
      order by updated_at desc limit 1;
    end if;
    v_cart_exists:=k.id is not null;
    v_cart_valid:=v_cart_exists and k.status='draft' and coalesce(k.pricing_status,'ready')='ready'
      and exists(select 1 from public.cart_items ci where ci.cart_id=k.id and ci.quantity>0);

    select exists(
      select 1 from public.human_handoffs h
      where h.conversation_id=new.conversation_id and h.status in ('open','claimed')
    ) into v_open_handoff;

    begin cust:=public.get_agent_core_basket_customer_status_compact_v1(new.conversation_id); exception when others then cust:='{}'::jsonb; end;
    begin contact:=public.get_agent_core_checkout_contact_compact_v1(new.conversation_id); exception when others then contact:='{}'::jsonb; end;

    insert into public.agent_core_pre_router_snapshots(
      ai_job_id,conversation_id,message_id,observed_at,message_type,interactive_id,
      conversation_mode,conversation_stage,service_window_open,human_required,open_handoff,
      awaiting,basket_session_active,cart_exists,cart_valid,customer_registered,address_known,pii_stored,
      fast_checkout,upsell_declined
    ) values (
      new.id,new.conversation_id,new.message_id,now(),left(coalesce(m.message_type,''),40),left(coalesce(m.ai_interpretation->>'id',''),120),
      left(coalesce(c.mode,''),30),left(coalesce(c.stage,''),80),
      c.service_window_expires_at is not null and c.service_window_expires_at>now(),
      coalesce(c.human_required,false),v_open_handoff,left(coalesce(st.awaiting,''),80),
      v_basket_active,v_cart_exists,v_cart_valid,
      coalesce((cust->>'registered')::boolean,false),coalesce((contact->>'address_known')::boolean,false),false,
      coalesce(c.fast_checkout,false),coalesce(c.upsell_declined,false)
    )
    on conflict(ai_job_id) do update set
      observed_at=excluded.observed_at,
      message_type=excluded.message_type,
      interactive_id=excluded.interactive_id,
      conversation_mode=excluded.conversation_mode,
      conversation_stage=excluded.conversation_stage,
      service_window_open=excluded.service_window_open,
      human_required=excluded.human_required,
      open_handoff=excluded.open_handoff,
      awaiting=excluded.awaiting,
      basket_session_active=excluded.basket_session_active,
      cart_exists=excluded.cart_exists,
      cart_valid=excluded.cart_valid,
      customer_registered=excluded.customer_registered,
      address_known=excluded.address_known,
      fast_checkout=excluded.fast_checkout,
      upsell_declined=excluded.upsell_declined,
      pii_stored=false;
  exception when others then
    begin
      insert into public.whatsapp_ops_events(event_type,severity,conversation_id,ai_job_id,details)
      values('agent_core_pre_router_snapshot_failed','warning',new.conversation_id,new.id,jsonb_build_object('sqlstate',sqlstate,'pii_stored',false));
    exception when others then null;
    end;
  end;
  return new;
end
$$;

create or replace function public.build_whatsapp_agent_core_packet_v2(p_conversation_id uuid,p_message_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  base jsonb;
  s public.agent_core_pre_router_snapshots%rowtype;
  v_topic text;
  v_conv jsonb;
  v_rules jsonb;
  v_meta jsonb;
begin
  base:=public.build_whatsapp_agent_core_packet_v1(p_conversation_id,p_message_id);
  if coalesce((base->>'enabled')::boolean,false) is not true then return base; end if;
  if coalesce((base#>>'{metadata,historical_replay}')::boolean,false) then return base; end if;

  select ps.* into s
  from public.agent_core_pre_router_snapshots ps
  join public.ai_jobs j on j.id=ps.ai_job_id
  where ps.conversation_id=p_conversation_id
    and ps.message_id=p_message_id
    and j.conversation_id=p_conversation_id
    and j.message_id=p_message_id
  order by ps.observed_at desc
  limit 1;

  if not found then
    return base || jsonb_build_object(
      'pre_router_state',null,
      'metadata',coalesce(base->'metadata','{}'::jsonb)||jsonb_build_object('pre_router_snapshot_used',false)
    );
  end if;

  v_topic:=public.resolve_whatsapp_agent_core_topic_v4(
    coalesce(base#>>'{message,text}',''),
    coalesce(s.conversation_stage,''),
    coalesce(s.awaiting,''),
    coalesce(s.interactive_id,'')
  );

  v_conv:=jsonb_build_object(
    'id',p_conversation_id,
    'mode',coalesce(s.conversation_mode,''),
    'stage',coalesce(s.conversation_stage,''),
    'fast_checkout',coalesce(s.fast_checkout,false),
    'upsell_declined',coalesce(s.upsell_declined,false)
  );
  v_rules:=coalesce(base->'rules','{}'::jsonb)||jsonb_build_object(
    'pre_router_state_authoritative_for_shadow',true,
    'pre_router_snapshot_contains_pii',false
  );
  v_meta:=coalesce(base->'metadata','{}'::jsonb)||jsonb_build_object(
    'pre_router_snapshot_used',true,
    'pre_router_snapshot_observed_at',s.observed_at,
    'pre_router_snapshot_ai_job_id',s.ai_job_id
  );

  return base || jsonb_build_object(
    'topic',v_topic,
    'conversation',v_conv,
    'customer',jsonb_build_object(
      'registered',coalesce(s.customer_registered,false),
      'has_known_address',coalesce(s.address_known,false),
      'pre_router_structural_only',true
    ),
    'cart',jsonb_build_object(
      'exists',coalesce(s.cart_exists,false),
      'valid',coalesce(s.cart_valid,false),
      'items','[]'::jsonb,
      'pre_router_structural_only',true
    ),
    'sales_state',jsonb_build_object(
      'awaiting',coalesce(s.awaiting,''),
      'last_action','',
      'basket_session_active',coalesce(s.basket_session_active,false),
      'pending_delivery_address','{}'::jsonb,
      'pre_router_structural_only',true
    ),
    'pre_router_state',jsonb_build_object(
      'available',true,
      'message_type',coalesce(s.message_type,''),
      'interactive_id',coalesce(s.interactive_id,''),
      'conversation_mode',coalesce(s.conversation_mode,''),
      'conversation_stage',coalesce(s.conversation_stage,''),
      'service_window_open',coalesce(s.service_window_open,false),
      'human_required',coalesce(s.human_required,false),
      'open_handoff',coalesce(s.open_handoff,false),
      'awaiting',coalesce(s.awaiting,''),
      'basket_session_active',coalesce(s.basket_session_active,false),
      'cart_exists',coalesce(s.cart_exists,false),
      'cart_valid',coalesce(s.cart_valid,false),
      'customer_registered',coalesce(s.customer_registered,false),
      'address_known',coalesce(s.address_known,false),
      'fast_checkout',coalesce(s.fast_checkout,false),
      'upsell_declined',coalesce(s.upsell_declined,false),
      'pii_stored',false
    ),
    'rules',v_rules,
    'metadata',v_meta
  );
end
$$;

revoke all on function public.build_whatsapp_agent_core_packet_v2(uuid,uuid) from public,anon,authenticated;
grant execute on function public.build_whatsapp_agent_core_packet_v2(uuid,uuid) to service_role;

create or replace function public.observe_whatsapp_agent_core_turn_v1(p_conversation_id uuid,p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  p jsonb;
  cfg public.agent_core_runtime_config%rowtype;
  keys text[]='{}'::text[];
  bytes integer:=0;
  hist_count integer:=0;
  knowledge_count integer:=0;
  guidance_count integer:=0;
  procedure_count integer:=0;
begin
  select * into cfg from public.agent_core_runtime_config where id=1;
  if not found or not cfg.enabled or cfg.execution_mode='off' then
    return jsonb_build_object('observed',false,'reason','agent_core_disabled');
  end if;
  p:=public.build_whatsapp_agent_core_packet_v2(p_conversation_id,p_message_id);
  select coalesce(array_agg(x->>'name' order by x->>'name'),'{}'::text[]) into keys from jsonb_array_elements(coalesce(p->'toolset','[]'::jsonb)) x;
  bytes:=octet_length(p::text);
  hist_count:=jsonb_array_length(coalesce(p->'history','[]'::jsonb));
  knowledge_count:=jsonb_array_length(coalesce(p#>'{intelligence,knowledge}','[]'::jsonb));
  guidance_count:=jsonb_array_length(coalesce(p#>'{intelligence,guidance}','[]'::jsonb));
  procedure_count:=jsonb_array_length(coalesce(p#>'{intelligence,procedures}','[]'::jsonb));

  insert into public.agent_core_turns(conversation_id,message_id,agent_version,execution_mode,topic,tool_keys,status,context_bytes,metadata)
  values(p_conversation_id,p_message_id,cfg.agent_version,cfg.execution_mode,p->>'topic',keys,'observed',bytes,
    jsonb_build_object('history_count',hist_count,'knowledge_count',knowledge_count,'guidance_count',guidance_count,'procedure_count',procedure_count,'prompt_stored',false,'pre_router_snapshot_used',coalesce((p#>>'{metadata,pre_router_snapshot_used}')::boolean,false)))
  on conflict(message_id,agent_version,execution_mode) do update set
    topic=excluded.topic,tool_keys=excluded.tool_keys,status='observed',context_bytes=excluded.context_bytes,metadata=excluded.metadata;

  return jsonb_build_object('observed',true,'agent_version',cfg.agent_version,'execution_mode',cfg.execution_mode,'topic',p->>'topic','tool_count',cardinality(keys),'context_bytes',bytes,'history_count',hist_count,'knowledge_count',knowledge_count,'guidance_count',guidance_count,'procedure_count',procedure_count,'pre_router_snapshot_used',coalesce((p#>>'{metadata,pre_router_snapshot_used}')::boolean,false));
end
$$;

create or replace function public.is_whatsapp_agent_core_shadow_eligible_v2(p_job_id uuid,p_replay boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  cfg public.agent_core_runtime_config%rowtype;
  j public.ai_jobs%rowtype;
  c public.conversations%rowtype;
  v_open_handoff boolean;
  v_hour integer;
  v_historical jsonb;
  v_greeting_held boolean:=false;
begin
  select * into cfg from public.agent_core_runtime_config where id=1;
  if not found or not cfg.enabled or cfg.execution_mode<>'observe' or not cfg.shadow_openai_enabled then
    return jsonb_build_object('eligible',false,'reason','agent_core_shadow_disabled');
  end if;
  select * into j from public.ai_jobs where id=p_job_id;
  if not found then return jsonb_build_object('eligible',false,'reason','job_not_found'); end if;
  if j.job_type<>'conversation' then return jsonb_build_object('eligible',false,'reason','job_not_shadowable','status',j.status,'job_type',j.job_type); end if;

  select * into c from public.conversations where id=j.conversation_id;
  if not found then return jsonb_build_object('eligible',false,'reason','conversation_not_found'); end if;

  v_greeting_held:=j.status='held' and coalesce(j.error_message,'')='deterministic_greeting_fastpath';
  if j.status<>'done' and not v_greeting_held then
    return jsonb_build_object('eligible',false,'reason','job_not_shadowable','status',j.status,'job_type',j.job_type);
  end if;
  if v_greeting_held and (p_replay or coalesce(c.automation_cohort,'')<>'homologation') then
    return jsonb_build_object('eligible',false,'reason','held_greeting_homologation_only');
  end if;

  if p_replay and coalesce(c.automation_cohort,'')='homologation' and j.status='done' and j.created_at<now()-interval '15 minutes' then
    v_historical:=public.is_agent_core_stateless_historical_replay_job_v3(p_job_id);
    if coalesce((v_historical->>'safe')::boolean,false) then
      return jsonb_build_object(
        'eligible',true,'reason','authorized_homologation_historical_replay_v3','conversation_id',j.conversation_id,
        'message_id',j.message_id,'agent_version',cfg.agent_version,'replay',true,'historical_context',true,
        'historical_action',v_historical->>'action','allowed_tool_family',v_historical->>'allowed_tool_family'
      );
    end if;
    return jsonb_build_object('eligible',false,'reason',coalesce(v_historical->>'reason','historical_replay_blocked'),
      'historical_context',true,'historical_action',v_historical->>'action');
  end if;

  select exists(select 1 from public.human_handoffs h where h.conversation_id=c.id and h.status in ('open','claimed')) into v_open_handoff;
  if v_open_handoff then return jsonb_build_object('eligible',false,'reason','human_handoff_precedence'); end if;
  if c.mode<>'ai' then return jsonb_build_object('eligible',false,'reason','conversation_not_ai'); end if;
  if not p_replay and coalesce(c.automation_cohort,'') not in ('ai_canary','homologation') then
    return jsonb_build_object('eligible',false,'reason','cohort_not_shadow_enabled','cohort',c.automation_cohort);
  end if;
  if not p_replay and exists(
    select 1 from public.agent_core_turns t where t.message_id=j.message_id and t.agent_version=cfg.agent_version
      and t.execution_mode=cfg.execution_mode and t.model is not null
  ) then return jsonb_build_object('eligible',false,'reason','already_shadow_planned'); end if;
  if not p_replay then
    select count(*) into v_hour from public.agent_core_turns t where t.created_at>=now()-interval '1 hour' and t.model is not null;
    if v_hour>=cfg.shadow_max_runs_per_hour then return jsonb_build_object('eligible',false,'reason','shadow_hourly_cap','count',v_hour); end if;
  end if;
  return jsonb_build_object('eligible',true,'reason',case when v_greeting_held then 'eligible_homologation_greeting_shadow' when p_replay then 'authorized_replay' else 'eligible_shadow' end,
    'conversation_id',j.conversation_id,'message_id',j.message_id,'agent_version',cfg.agent_version,'replay',coalesce(p_replay,false),'historical_context',false,'pre_router_snapshot_expected',coalesce(c.automation_cohort,'')='homologation');
end
$$;

revoke all on function public.is_whatsapp_agent_core_shadow_eligible_v2(uuid,boolean) from public,anon,authenticated;
grant execute on function public.is_whatsapp_agent_core_shadow_eligible_v2(uuid,boolean) to service_role;

create or replace function public.dispatch_whatsapp_agent_core_shadow_v1(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare cfg public.agent_core_runtime_config%rowtype; j public.ai_jobs%rowtype; v_check jsonb; v_secret text; v_request bigint;
begin
  v_check:=public.is_whatsapp_agent_core_shadow_eligible_v2(p_job_id,false);
  if coalesce((v_check->>'eligible')::boolean,false) is not true then return v_check||jsonb_build_object('dispatched',false); end if;
  select * into cfg from public.agent_core_runtime_config where id=1;
  select * into j from public.ai_jobs where id=p_job_id;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='agent_core_webhook_key_v1' order by created_at desc limit 1;
  if v_secret is null then return jsonb_build_object('eligible',false,'dispatched',false,'reason','agent_core_secret_missing'); end if;
  begin
    v_request:=net.http_post(
      url:='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/dona-antonia-agent-core-v1',
      headers:=jsonb_build_object('Content-Type','application/json','x-da-agent-key',v_secret),
      body:=jsonb_build_object('event','shadow','job_id',p_job_id,'replay',false),
      timeout_milliseconds:=120000
    );
    insert into public.agent_core_turns(conversation_id,message_id,ai_job_id,agent_version,execution_mode,status,metadata)
    values(j.conversation_id,j.message_id,j.id,cfg.agent_version,cfg.execution_mode,'observed',jsonb_build_object('openai_shadow',true,'dispatch_request_id',v_request,'dispatch_at',now(),'eligibility_version',2))
    on conflict(message_id,agent_version,execution_mode) do update
      set ai_job_id=excluded.ai_job_id,metadata=public.agent_core_turns.metadata||excluded.metadata;
    insert into public.whatsapp_ops_events(event_type,severity,conversation_id,ai_job_id,details)
    values('agent_core_shadow_dispatched','info',j.conversation_id,j.id,jsonb_build_object('request_id',v_request,'agent_version',cfg.agent_version,'eligibility_version',2));
    return jsonb_build_object('eligible',true,'dispatched',true,'request_id',v_request,'job_id',p_job_id,'eligibility_version',2);
  exception when others then
    insert into public.whatsapp_ops_events(event_type,severity,conversation_id,ai_job_id,details)
    values('agent_core_shadow_dispatch_failed','warning',j.conversation_id,j.id,jsonb_build_object('agent_version',cfg.agent_version,'eligibility_version',2));
    return jsonb_build_object('eligible',true,'dispatched',false,'reason','shadow_dispatch_failed');
  end;
end
$$;

create or replace function public.agent_core_shadow_postprocess_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_shadow_terminal boolean:=false;
begin
  v_shadow_terminal:=new.status='done' or (new.status='held' and coalesce(new.error_message,'')='deterministic_greeting_fastpath');
  if not v_shadow_terminal then return new; end if;
  if tg_op='UPDATE' and old.status is not distinct from new.status and old.error_message is not distinct from new.error_message then return new; end if;

  if new.conversation_id is not null and new.message_id is not null then
    begin
      perform public.observe_whatsapp_agent_core_turn_v1(new.conversation_id,new.message_id);
    exception when others then
      insert into public.whatsapp_ops_events(event_type,severity,conversation_id,ai_job_id,details)
      values('agent_core_shadow_observe_failed','warning',new.conversation_id,new.id,jsonb_build_object('non_blocking',true,'router_consolidation','round4_v20'));
    end;
  end if;

  begin
    perform public.dispatch_whatsapp_agent_core_shadow_v1(new.id);
  exception when others then
    insert into public.whatsapp_ops_events(event_type,severity,conversation_id,ai_job_id,details)
    values('agent_core_shadow_trigger_error','warning',new.conversation_id,new.id,jsonb_build_object('non_blocking',true,'router_consolidation','round4_v20'));
  end;
  return new;
end
$$;

revoke all on function public.agent_core_shadow_postprocess_trigger_v1() from public,anon,authenticated;

drop trigger if exists trg_agent_core_shadow_postprocess_v1 on public.ai_jobs;
create trigger trg_agent_core_shadow_postprocess_v1
after insert or update on public.ai_jobs
for each row
when (new.status='done' or (new.status='held' and new.error_message='deterministic_greeting_fastpath'))
execute function public.agent_core_shadow_postprocess_trigger_v1();

create or replace function public.get_agent_core_round4_pre_router_shadow_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_cfg public.agent_core_runtime_config%rowtype;
  v_snapshot_cols integer:=0;
  v_trigger boolean:=false;
  v_greeting_held_supported boolean:=false;
begin
  select * into v_cfg from public.agent_core_runtime_config where id=1;
  select count(*) into v_snapshot_cols from information_schema.columns
   where table_schema='public' and table_name='agent_core_pre_router_snapshots'
     and column_name in ('fast_checkout','upsell_declined');
  select exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where not t.tgisinternal and c.relname='ai_jobs' and t.tgname='trg_agent_core_shadow_postprocess_v1') into v_trigger;
  select position('deterministic_greeting_fastpath' in pg_get_functiondef(p.oid))>0 into v_greeting_held_supported
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='is_whatsapp_agent_core_shadow_eligible_v2' limit 1;
  return jsonb_build_object(
    'version',1,
    'packet_builder','build_whatsapp_agent_core_packet_v2',
    'snapshot_structural_columns_complete',v_snapshot_cols=2,
    'postprocess_trigger_present',v_trigger,
    'held_greeting_shadow_supported',coalesce(v_greeting_held_supported,false),
    'held_greeting_homologation_only',true,
    'pre_router_state_contains_pii',false,
    'execution_mode',v_cfg.execution_mode,
    'shadow_only',v_cfg.execution_mode='observe',
    'write_execution_permitted',false,
    'retirement_authorized',false
  );
end
$$;

revoke all on function public.get_agent_core_round4_pre_router_shadow_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_pre_router_shadow_readiness_v1() to service_role;

commit;