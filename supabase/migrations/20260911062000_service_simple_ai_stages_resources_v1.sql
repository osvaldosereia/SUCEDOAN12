-- Dona Antônia: etapas configuráveis e biblioteca rica de recursos para a IA simples.

alter table public.service_simple_rules
  add column if not exists stages jsonb not null default '[]'::jsonb;

update public.service_simple_rules
set stages = jsonb_build_array(jsonb_build_object(
  'question', question,
  'variations', to_jsonb(variations),
  'answer', answer,
  'response_mode', response_mode,
  'tool_config', tool_config
))
where stages='[]'::jsonb;

create table if not exists public.service_simple_conversation_state (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  rule_id uuid not null references public.service_simple_rules(id) on delete cascade,
  stage_index integer not null default 0 check(stage_index>=0),
  updated_at timestamptz not null default now()
);
alter table public.service_simple_conversation_state enable row level security;
revoke all on table public.service_simple_conversation_state from public, anon, authenticated;
grant select,insert,update,delete on table public.service_simple_conversation_state to service_role;

alter table public.service_simple_rules drop constraint if exists service_simple_rules_response_mode_check;
alter table public.service_simple_rules add constraint service_simple_rules_response_mode_check check (response_mode = any(array[
  'text','reply_buttons','cta_url','list_view','list_select','basket_flow','registration_flow','address_flow','custom_flow','product_lookup',
  'catalog_message','single_product','product_list','image','audio_ai','video','document','location','contact',
  'template_quick_reply','template_cta','template_carousel','template_catalog','template_multi_product','human','silence'
]::text[]));

create or replace function public.get_service_simple_rule_candidates_v2(
  p_conversation_id uuid,
  p_message text,
  p_limit integer default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_message text:=public.normalize_service_question_v1(p_message);
  v_limit integer:=least(10,greatest(1,coalesce(p_limit,5)));
  v_active_rule uuid;
  v_active_stage integer;
  v_reset_at timestamptz;
  v_rows jsonb;
begin
  select r.reset_at into v_reset_at
  from public.whatsapp_order_context_resets r
  where r.conversation_id=p_conversation_id;

  select s.rule_id,s.stage_index into v_active_rule,v_active_stage
  from public.service_simple_conversation_state s
  where s.conversation_id=p_conversation_id
    and s.updated_at > coalesce(v_reset_at,'-infinity'::timestamptz)
    and s.updated_at > now()-interval '2 hours';

  with expanded as (
    select r.id as rule_id,r.priority,
           (x.ord-1)::int as stage_index,
           jsonb_array_length(r.stages) as total_stages,
           coalesce(x.stage->>'question','') as question,
           case when jsonb_typeof(x.stage->'variations')='array'
                then array(select jsonb_array_elements_text(x.stage->'variations')) else '{}'::text[] end as variations,
           coalesce(x.stage->>'answer','') as answer,
           coalesce(nullif(x.stage->>'response_mode',''),r.response_mode,'text') as response_mode,
           coalesce(x.stage->'tool_config','{}'::jsonb) as tool_config,
           (r.id=v_active_rule and (x.ord-1)=v_active_stage) as active_stage
    from public.service_simple_rules r
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(r.stages)='array' and jsonb_array_length(r.stages)>0
           then r.stages
           else jsonb_build_array(jsonb_build_object(
             'question',r.question,'variations',to_jsonb(r.variations),'answer',r.answer,
             'response_mode',r.response_mode,'tool_config',r.tool_config)) end
    ) with ordinality x(stage,ord)
    where r.status='published'
      and ((x.ord-1)=0 or (r.id=v_active_rule and (x.ord-1)=v_active_stage))
  ), scored as (
    select e.*,
           max(case when n.normalized=v_message then 1 else 0 end)::int as exact,
           max(case when n.normalized=v_message then 1::real else extensions.similarity(n.normalized,v_message) end) as score
    from expanded e
    cross join lateral (
      select public.normalize_service_question_v1(p) normalized
      from unnest(array_prepend(e.question,e.variations)) p
    ) n
    where n.normalized<>''
    group by e.rule_id,e.priority,e.stage_index,e.total_stages,e.question,e.variations,e.answer,e.response_mode,e.tool_config,e.active_stage
  ), ranked as (
    select (rule_id::text||':'||stage_index::text) as candidate_id,
           rule_id,stage_index,total_stages,question,variations,answer,response_mode,tool_config,priority,active_stage,exact,score
    from scored
    order by active_stage desc, exact desc, score desc, priority desc
    limit v_limit
  )
  select coalesce(jsonb_agg(to_jsonb(ranked) order by active_stage desc,exact desc,score desc,priority desc),'[]'::jsonb)
  into v_rows from ranked;

  return jsonb_build_object(
    'message_normalized',v_message,
    'active_rule_id',v_active_rule,
    'active_stage_index',v_active_stage,
    'candidates',v_rows
  );
end;
$$;
revoke all on function public.get_service_simple_rule_candidates_v2(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.get_service_simple_rule_candidates_v2(uuid,text,integer) to service_role;

create or replace function public.advance_service_simple_stage_v1(
  p_conversation_id uuid,
  p_rule_id uuid,
  p_stage_index integer
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_total integer;
  v_next integer;
begin
  select jsonb_array_length(stages) into v_total
  from public.service_simple_rules
  where id=p_rule_id and status='published';

  if v_total is null or v_total<=0 then
    delete from public.service_simple_conversation_state where conversation_id=p_conversation_id;
    return jsonb_build_object('ok',true,'completed',true);
  end if;

  v_next:=coalesce(p_stage_index,0)+1;
  if v_next>=v_total then
    delete from public.service_simple_conversation_state where conversation_id=p_conversation_id;
    return jsonb_build_object('ok',true,'completed',true,'total_stages',v_total);
  end if;

  insert into public.service_simple_conversation_state(conversation_id,rule_id,stage_index,updated_at)
  values(p_conversation_id,p_rule_id,v_next,now())
  on conflict(conversation_id) do update
  set rule_id=excluded.rule_id,stage_index=excluded.stage_index,updated_at=excluded.updated_at;

  return jsonb_build_object('ok',true,'completed',false,'next_stage_index',v_next,'total_stages',v_total);
end;
$$;
revoke all on function public.advance_service_simple_stage_v1(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.advance_service_simple_stage_v1(uuid,uuid,integer) to service_role;

create or replace function public.queue_whatsapp_simple_rich_interactive_v1(
  p_conversation_id uuid,
  p_source_message_id uuid,
  p_body_text text,
  p_interactive jsonb,
  p_action_type text default 'simple_rich',
  p_action_result jsonb default '{}'::jsonb,
  p_confidence numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  cfg public.automation_config%rowtype;
  c public.conversations%rowtype;
  v_type text;
  v_body text:=left(trim(coalesce(p_body_text,'')),4096);
  v_reply_id uuid;
  v_job_id uuid;
begin
  select * into cfg from public.automation_config where id=1;
  if not found or not coalesce(cfg.automation_enabled and cfg.outbound_enabled and cfg.whatsapp_inbound_enabled and cfg.whatsapp_auto_reply_enabled and cfg.whatsapp_sales_mvp_enabled,false) then
    raise exception 'whatsapp_sales_reply_disabled';
  end if;
  select cv.* into c from public.conversations cv where cv.id=p_conversation_id and cv.mode='ai' and cv.status<>'closed' for update;
  if not found or c.service_window_expires_at<=now() then raise exception 'conversation_service_window_closed'; end if;
  if not cfg.whatsapp_sales_interactive_enabled then raise exception 'whatsapp_sales_interactive_disabled'; end if;
  if jsonb_typeof(p_interactive) is distinct from 'object' then raise exception 'invalid_interactive_payload'; end if;
  v_type:=coalesce(p_interactive->>'type','');
  if v_type not in ('button','list','cta_url','catalog_message','product','product_list') then raise exception 'unsupported_simple_interactive'; end if;
  if v_type='cta_url' then
    if coalesce(p_interactive->'action'->>'name','')<>'cta_url' then raise exception 'invalid_cta_action'; end if;
    if coalesce(p_interactive->'action'->'parameters'->>'url','') !~ '^https://[^[:space:]]+$' then raise exception 'https_url_required'; end if;
  end if;
  insert into public.messages(conversation_id,direction,message_type,body_text,ai_interpretation,raw_event)
  values(c.id,'outbound','interactive',v_body,
    jsonb_build_object('source','simple_ai','action_type',left(coalesce(p_action_type,'simple_rich'),80),'confidence',p_confidence,'delivery_mode','interactive','action_result',coalesce(p_action_result,'{}'::jsonb)),
    jsonb_build_object('source','whatsapp','simple_ai',true,'source_message_id',p_source_message_id)) returning id into v_reply_id;
  insert into public.outbound_jobs(whatsapp_account_id,customer_id,conversation_id,job_type,recipient_e164,dedupe_key,payload)
  values(c.whatsapp_account_id,c.customer_id,c.id,'seller_message',c.wa_contact_e164,'simple_rich:'||v_reply_id::text,
    jsonb_build_object('message_kind','conversation_reply','message_type','interactive','body_text',v_body,'delivery_mode','interactive','interactive',p_interactive,'reply_message_id',v_reply_id,'source_message_id',p_source_message_id,'service_window_expires_at',c.service_window_expires_at))
  on conflict(dedupe_key) do nothing returning id into v_job_id;
  insert into public.whatsapp_sales_action_events(conversation_id,message_id,action_type,action_payload,result,reversible,required_confirmation,confidence)
  values(c.id,p_source_message_id,left(coalesce(p_action_type,'simple_rich'),80),jsonb_build_object('interactive',p_interactive),coalesce(p_action_result,'{}'::jsonb),true,false,p_confidence);
  return jsonb_build_object('ok',true,'reply_message_id',v_reply_id,'outbound_job_id',v_job_id,'interactive_type',v_type);
end;
$$;
revoke all on function public.queue_whatsapp_simple_rich_interactive_v1(uuid,uuid,text,jsonb,text,jsonb,numeric) from public,anon,authenticated;
grant execute on function public.queue_whatsapp_simple_rich_interactive_v1(uuid,uuid,text,jsonb,text,jsonb,numeric) to service_role;