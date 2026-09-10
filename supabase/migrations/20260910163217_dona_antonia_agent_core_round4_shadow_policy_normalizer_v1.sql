begin;

-- Rodada 4/6: normalizacao deterministica das decisoes shadow e replay auditavel.
-- Nenhuma escrita comercial e liberada por esta migration.

create or replace function public.agent_core_canonical_intent_for_topic_v1(p_topic text)
returns text
language sql
immutable
set search_path=''
as $$
  select case lower(coalesce(p_topic,''))
    when 'basket' then 'basket'
    when 'product_search' then 'product_search'
    when 'product_detail' then 'product_search'
    when 'checkout' then 'checkout'
    when 'payment' then 'payment'
    when 'human' then 'human'
    when 'greeting' then 'greeting'
    when 'post_sale' then 'post_sale'
    when 'delivery_time' then 'delivery'
    when 'delivery_fee' then 'delivery'
    when 'delivery_promise' then 'delivery'
    when 'delivery_area' then 'delivery'
    else null
  end;
$$;

create or replace function public.agent_core_shadow_decision_anchor_v1(
  p_topic text,
  p_planned_tool text,
  p_next_action text,
  p_should_use_flow boolean
)
returns boolean
language sql
immutable
set search_path=''
as $$
  select case public.agent_core_canonical_intent_for_topic_v1(p_topic)
    when 'basket' then
      lower(coalesce(p_planned_tool,'')) in ('wa_list_baskets','wa_get_recommendations')
      or lower(coalesce(p_next_action,'')) in ('show_baskets','start_basket_flow')
      or coalesce(p_should_use_flow,false)
    when 'product_search' then
      lower(coalesce(p_planned_tool,'')) in ('wa_search_products','wa_get_product')
      or lower(coalesce(p_next_action,''))='show_products'
    when 'checkout' then
      lower(coalesce(p_planned_tool,''))='wa_confirm_order'
      or lower(coalesce(p_next_action,'')) in ('checkout','request_confirmation')
    when 'human' then
      lower(coalesce(p_planned_tool,''))='wa_handoff_human'
      or lower(coalesce(p_next_action,''))='handoff'
    when 'greeting' then
      lower(coalesce(p_next_action,''))='reply'
      and nullif(lower(coalesce(p_planned_tool,'')),'') is null
    when 'payment' then
      lower(coalesce(p_planned_tool,''))='wa_get_policy'
      and lower(coalesce(p_next_action,'')) in ('reply','clarify')
    when 'delivery' then
      lower(coalesce(p_planned_tool,''))='wa_get_policy'
      and lower(coalesce(p_next_action,'')) in ('reply','clarify','handoff')
    when 'post_sale' then
      lower(coalesce(p_planned_tool,'')) in ('wa_get_policy','wa_handoff_human')
      or lower(coalesce(p_next_action,'')) in ('reply','handoff','clarify')
    else false
  end;
$$;

create or replace function public.normalize_agent_core_shadow_turn_policy_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_expected text;
  v_raw text;
  v_next text;
  v_flow boolean:=false;
  v_secondary jsonb:='[]'::jsonb;
  v_original_secondary jsonb:='[]'::jsonb;
  v_old_secondary text;
begin
  if coalesce(new.execution_mode,'')<>'observe' or coalesce(new.status,'')<>'planned' then
    return new;
  end if;

  v_expected:=public.agent_core_canonical_intent_for_topic_v1(new.topic);
  v_raw:=lower(coalesce(new.decision_intent,''));
  v_next:=lower(coalesce(new.metadata->>'next_action',''));
  v_flow:=lower(coalesce(new.metadata->>'should_use_flow','false')) in ('true','t','1','yes');

  if v_expected is null or v_raw='' or v_raw=v_expected then
    return new;
  end if;

  if not public.agent_core_shadow_decision_anchor_v1(new.topic,new.planned_tool,v_next,v_flow) then
    return new;
  end if;

  if jsonb_typeof(new.metadata->'secondary_intents')='array' then
    v_original_secondary:=new.metadata->'secondary_intents';
  end if;
  v_secondary:=v_original_secondary;

  -- Se a intencao crua representa uma intencao valida diferente da primaria deterministica,
  -- preserve-a como secundaria para nao perder pedidos compostos (ex.: cesta + arroz).
  v_old_secondary:=case
    when v_raw in ('search','product_search','product_detail','product') then 'product_search'
    when v_raw in ('basket','baskets') then 'basket'
    when v_raw in ('cart','cart_change','cart_review') then 'cart_review'
    when v_raw in ('checkout','payment','delivery','post_sale','human','general','greeting','clarify') then v_raw
    else null
  end;

  if v_old_secondary is not null and v_old_secondary<>v_expected
     and not exists(select 1 from jsonb_array_elements_text(v_secondary) x where x=v_old_secondary) then
    v_secondary:=v_secondary||to_jsonb(v_old_secondary);
  end if;

  new.metadata:=coalesce(new.metadata,'{}'::jsonb)
    ||jsonb_build_object(
      'policy_normalized',true,
      'policy_normalizer_version',1,
      'raw_decision_intent',new.decision_intent,
      'normalized_decision_intent',v_expected,
      'policy_normalization_reason','strong_topic_and_action_anchor',
      'secondary_intents',v_secondary
    );
  new.decision_intent:=v_expected;
  return new;
end;
$$;

revoke all on function public.agent_core_canonical_intent_for_topic_v1(text) from public,anon,authenticated;
revoke all on function public.agent_core_shadow_decision_anchor_v1(text,text,text,boolean) from public,anon,authenticated;
revoke all on function public.normalize_agent_core_shadow_turn_policy_v1() from public,anon,authenticated;
grant execute on function public.agent_core_canonical_intent_for_topic_v1(text) to service_role;
grant execute on function public.agent_core_shadow_decision_anchor_v1(text,text,text,boolean) to service_role;

drop trigger if exists trg_agent_core_shadow_policy_normalize_v1 on public.agent_core_turns;
create trigger trg_agent_core_shadow_policy_normalize_v1
before insert or update of status,decision_intent,planned_tool,metadata,topic
on public.agent_core_turns
for each row
execute function public.normalize_agent_core_shadow_turn_policy_v1();

-- Replay manual/autorizado precisa poder substituir uma decisao shadow anterior.
-- O replay continua sem efeito comercial porque o Agent Core permanece em observe.
create or replace function public.is_whatsapp_agent_core_shadow_eligible_v1(p_job_id uuid, p_replay boolean default false)
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
begin
  select * into cfg from public.agent_core_runtime_config where id=1;
  if not found or not cfg.enabled or cfg.execution_mode<>'observe' or not cfg.shadow_openai_enabled then
    return jsonb_build_object('eligible',false,'reason','agent_core_shadow_disabled');
  end if;

  select * into j from public.ai_jobs where id=p_job_id;
  if not found then return jsonb_build_object('eligible',false,'reason','job_not_found'); end if;
  if j.status<>'done' or j.job_type<>'conversation' then
    return jsonb_build_object('eligible',false,'reason','job_not_shadowable','status',j.status,'job_type',j.job_type);
  end if;

  select * into c from public.conversations where id=j.conversation_id;
  if not found then return jsonb_build_object('eligible',false,'reason','conversation_not_found'); end if;

  select exists(
    select 1 from public.human_handoffs h
    where h.conversation_id=c.id and h.status in ('open','claimed')
  ) into v_open_handoff;
  if v_open_handoff then return jsonb_build_object('eligible',false,'reason','human_handoff_precedence'); end if;
  if c.mode<>'ai' then return jsonb_build_object('eligible',false,'reason','conversation_not_ai'); end if;

  if not p_replay and coalesce(c.automation_cohort,'') not in ('ai_canary','homologation') then
    return jsonb_build_object('eligible',false,'reason','cohort_not_shadow_enabled','cohort',c.automation_cohort);
  end if;

  if not p_replay and exists(
    select 1 from public.agent_core_turns t
    where t.message_id=j.message_id
      and t.agent_version=cfg.agent_version
      and t.execution_mode=cfg.execution_mode
      and t.model is not null
  ) then
    return jsonb_build_object('eligible',false,'reason','already_shadow_planned');
  end if;

  if not p_replay then
    select count(*) into v_hour
    from public.agent_core_turns t
    where t.created_at>=now()-interval '1 hour' and t.model is not null;
    if v_hour>=cfg.shadow_max_runs_per_hour then
      return jsonb_build_object('eligible',false,'reason','shadow_hourly_cap','count',v_hour);
    end if;
  end if;

  return jsonb_build_object(
    'eligible',true,
    'reason',case when p_replay then 'authorized_replay' else 'eligible_shadow' end,
    'conversation_id',j.conversation_id,
    'message_id',j.message_id,
    'agent_version',cfg.agent_version,
    'replay',coalesce(p_replay,false)
  );
end;
$$;

revoke all on function public.is_whatsapp_agent_core_shadow_eligible_v1(uuid,boolean) from public,anon,authenticated;
grant execute on function public.is_whatsapp_agent_core_shadow_eligible_v1(uuid,boolean) to service_role;

create or replace function public.get_agent_core_round4_policy_guard_readiness_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'shadow_only',true,
    'normalizer_trigger',exists(
      select 1 from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c on c.oid=t.tgrelid
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where not t.tgisinternal and n.nspname='public' and c.relname='agent_core_turns'
        and t.tgname='trg_agent_core_shadow_policy_normalize_v1'
    ),
    'authorized_replay_supported',position('not p_replay and exists' in lower(pg_catalog.pg_get_functiondef('public.is_whatsapp_agent_core_shadow_eligible_v1(uuid,boolean)'::regprocedure)))>0,
    'commercial_writes_enabled',coalesce((select whatsapp_flow_commercial_write_enabled from public.automation_config where id=1),false),
    'flow_send_enabled',coalesce((select whatsapp_flow_send_enabled from public.automation_config where id=1),false),
    'bling_enabled',coalesce((select bling_order_sync_enabled from public.automation_config where id=1),false)
  );
$$;

revoke all on function public.get_agent_core_round4_policy_guard_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_policy_guard_readiness_v1() to service_role;

commit;
