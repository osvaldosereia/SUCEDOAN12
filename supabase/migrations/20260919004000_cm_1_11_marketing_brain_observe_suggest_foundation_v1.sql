-- CM-1.11 Marketing Brain OBSERVE/SUGGEST foundation.
-- Reuses Opportunity Engine, Marketing runtime and existing AI Action Registry.
-- No external publishing/sending side effect is permitted here.

create table if not exists public.marketing_strategy_briefs (
  id uuid primary key default gen_random_uuid(),
  brief_key text not null unique,
  opportunity_id uuid not null references public.customer_marketing_opportunities(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  strategy_key text not null,
  mode text not null check (mode in ('observe','suggest')),
  status text not null check (status in ('observed','suggested','rejected','approved','archived')),
  brief jsonb not null,
  context jsonb not null default '{}'::jsonb,
  ai_used boolean not null default false,
  model_task text,
  model_used text,
  reasoning_effort text,
  provider_response_id text,
  usage jsonb,
  estimated_cost_brl numeric,
  actual_cost_brl numeric,
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  source text not null default 'marketing_brain',
  engine_version text not null default 'cm1.11-v1',
  created_by uuid references public.admin_users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  external_side_effect boolean not null default false check (external_side_effect=false),
  check (jsonb_typeof(brief)='object'),
  check (jsonb_typeof(context)='object'),
  check (usage is null or jsonb_typeof(usage)='object'),
  check (
    brief ? 'objective' and brief ? 'audience' and brief ? 'insight'
    and brief ? 'product' and brief ? 'proposal' and brief ? 'angle'
    and brief ? 'offer' and brief ? 'format' and brief ? 'cta'
    and brief ? 'risks' and brief ? 'reason' and brief ? 'confidence'
  )
);

create index if not exists marketing_strategy_briefs_opportunity_idx
  on public.marketing_strategy_briefs(opportunity_id,mode,updated_at desc);
create index if not exists marketing_strategy_briefs_customer_idx
  on public.marketing_strategy_briefs(customer_id,status,updated_at desc);

alter table public.marketing_strategy_briefs enable row level security;
revoke all on table public.marketing_strategy_briefs from public,anon,authenticated;
grant select,insert,update,delete on table public.marketing_strategy_briefs to service_role;

create or replace function public.get_marketing_opportunity_context_v1(
  p_opportunity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  o public.customer_marketing_opportunities%rowtype;
  cp public.customer_commercial_profile_v1%rowtype;
  protection jsonb;
  segments jsonb;
begin
  select * into o
  from public.customer_marketing_opportunities
  where id=p_opportunity_id;

  if not found then raise exception 'opportunity_not_found'; end if;

  select * into cp
  from public.customer_commercial_profile_v1
  where customer_id=o.customer_id;

  protection:=public.evaluate_customer_contact_eligibility_v1(o.customer_id,'whatsapp','marketing',now());
  segments:=public.get_customer_dynamic_segments_v1(o.customer_id);

  return jsonb_build_object(
    'opportunity',jsonb_build_object(
      'id',o.id,
      'strategy_key',o.strategy_key,
      'title',o.title,
      'status',o.status,
      'confidence',o.confidence,
      'audience_rule',o.audience_rule,
      'evidence',o.evidence,
      'product_candidates',o.product_candidates,
      'exclusions',to_jsonb(o.exclusions),
      'expires_at',o.expires_at,
      'last_evaluated_at',o.last_evaluated_at,
      'engine_version',o.engine_version
    ),
    'customer_profile',jsonb_build_object(
      'order_count',coalesce(cp.order_count,0),
      'lifetime_value',coalesce(cp.lifetime_value,0),
      'average_ticket',coalesce(cp.average_ticket,0),
      'days_since_last_order',cp.days_since_last_order,
      'average_repurchase_interval_days',cp.average_repurchase_interval_days,
      'repurchase_frequency_label',cp.repurchase_frequency_label,
      'estimated_next_repurchase_at',cp.estimated_next_repurchase_at,
      'history_confidence',cp.history_confidence,
      'favorite_basket_name',cp.favorite_basket_name,
      'recent_engagement',cp.recent_engagement,
      'marketing_pressure',cp.marketing_pressure,
      'marketing_pressure_score',cp.marketing_pressure_score,
      'profile_completeness',cp.profile_completeness,
      'data_quality_score',cp.data_quality_score
    ),
    'segments',coalesce(segments,'{}'::jsonb),
    'customer_protection',coalesce(protection,'{}'::jsonb),
    'privacy',jsonb_build_object(
      'contains_name',false,
      'contains_phone',false,
      'contains_cpf_cnpj',false,
      'contains_address',false
    ),
    'context_version','cm1.11-v1',
    'external_side_effect',false
  );
end;
$function$;

revoke all on function public.get_marketing_opportunity_context_v1(uuid)
from public,anon,authenticated;
grant execute on function public.get_marketing_opportunity_context_v1(uuid)
to service_role;

create or replace function public.record_marketing_strategy_brief_v1(
  p_brief_key text,
  p_opportunity_id uuid,
  p_mode text,
  p_status text,
  p_brief jsonb,
  p_context jsonb,
  p_ai_used boolean default false,
  p_model_task text default null,
  p_model_used text default null,
  p_reasoning_effort text default null,
  p_provider_response_id text default null,
  p_usage jsonb default null,
  p_estimated_cost_brl numeric default null,
  p_actual_cost_brl numeric default null,
  p_confidence numeric default 0,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_mode text:=lower(btrim(coalesce(p_mode,'')));
  v_status text:=lower(btrim(coalesce(p_status,'')));
  v_key text:=btrim(coalesce(p_brief_key,''));
  v_opp public.customer_marketing_opportunities%rowtype;
  v_row public.marketing_strategy_briefs%rowtype;
begin
  if length(v_key)<12 then raise exception 'invalid_brief_key'; end if;
  if v_mode not in ('observe','suggest') then raise exception 'invalid_brief_mode'; end if;
  if v_status not in ('observed','suggested','rejected','approved','archived') then raise exception 'invalid_brief_status'; end if;
  if jsonb_typeof(coalesce(p_brief,'null'::jsonb))<>'object' then raise exception 'brief_object_required'; end if;
  if not (
    p_brief ? 'objective' and p_brief ? 'audience' and p_brief ? 'insight'
    and p_brief ? 'product' and p_brief ? 'proposal' and p_brief ? 'angle'
    and p_brief ? 'offer' and p_brief ? 'format' and p_brief ? 'cta'
    and p_brief ? 'risks' and p_brief ? 'reason' and p_brief ? 'confidence'
  ) then raise exception 'brief_schema_incomplete'; end if;
  if jsonb_typeof(coalesce(p_context,'{}'::jsonb))<>'object' then raise exception 'context_object_required'; end if;
  if coalesce(p_confidence,0)<0 or coalesce(p_confidence,0)>1 then raise exception 'invalid_confidence'; end if;
  if coalesce(p_ai_used,false)=false and (p_model_used is not null or p_provider_response_id is not null) then
    raise exception 'model_metadata_without_ai';
  end if;
  if v_mode='observe' and coalesce(p_ai_used,false) then raise exception 'observe_mode_cannot_use_ai'; end if;

  select * into v_opp from public.customer_marketing_opportunities where id=p_opportunity_id;
  if not found then raise exception 'opportunity_not_found'; end if;

  if p_created_by is not null and not exists(
    select 1 from public.admin_users a
    where a.user_id=p_created_by and a.is_active=true and a.role in ('owner','operator')
  ) then raise exception 'admin_not_authorized'; end if;

  insert into public.marketing_strategy_briefs(
    brief_key,opportunity_id,customer_id,strategy_key,mode,status,brief,context,
    ai_used,model_task,model_used,reasoning_effort,provider_response_id,usage,
    estimated_cost_brl,actual_cost_brl,confidence,source,engine_version,created_by,
    created_at,updated_at,external_side_effect
  )
  values(
    v_key,v_opp.id,v_opp.customer_id,v_opp.strategy_key,v_mode,v_status,p_brief,coalesce(p_context,'{}'::jsonb),
    coalesce(p_ai_used,false),nullif(btrim(coalesce(p_model_task,'')),''),nullif(btrim(coalesce(p_model_used,'')),''),
    nullif(btrim(coalesce(p_reasoning_effort,'')),''),nullif(btrim(coalesce(p_provider_response_id,'')),''),
    p_usage,p_estimated_cost_brl,p_actual_cost_brl,coalesce(p_confidence,0),
    'marketing_brain','cm1.11-v1',p_created_by,now(),now(),false
  )
  on conflict(brief_key) do update set
    brief=excluded.brief,
    context=excluded.context,
    status=excluded.status,
    ai_used=excluded.ai_used,
    model_task=excluded.model_task,
    model_used=excluded.model_used,
    reasoning_effort=excluded.reasoning_effort,
    provider_response_id=excluded.provider_response_id,
    usage=excluded.usage,
    estimated_cost_brl=excluded.estimated_cost_brl,
    actual_cost_brl=excluded.actual_cost_brl,
    confidence=excluded.confidence,
    created_by=coalesce(excluded.created_by,public.marketing_strategy_briefs.created_by),
    updated_at=now(),
    external_side_effect=false
  returning * into v_row;

  return jsonb_build_object(
    'ok',true,
    'brief_id',v_row.id,
    'brief_key',v_row.brief_key,
    'opportunity_id',v_row.opportunity_id,
    'mode',v_row.mode,
    'status',v_row.status,
    'ai_used',v_row.ai_used,
    'confidence',v_row.confidence,
    'engine_version',v_row.engine_version,
    'external_side_effect',false
  );
end;
$function$;

revoke all on function public.record_marketing_strategy_brief_v1(
  text,uuid,text,text,jsonb,jsonb,boolean,text,text,text,text,jsonb,numeric,numeric,numeric,uuid
) from public,anon,authenticated;
grant execute on function public.record_marketing_strategy_brief_v1(
  text,uuid,text,text,jsonb,jsonb,boolean,text,text,text,text,jsonb,numeric,numeric,numeric,uuid
) to service_role;

create or replace function public.marketing_strategy_brief_summary_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
select jsonb_build_object(
  'engine_version','cm1.11-v1',
  'briefs',(select count(*) from public.marketing_strategy_briefs where status<>'archived'),
  'observed',(select count(*) from public.marketing_strategy_briefs where status='observed'),
  'suggested',(select count(*) from public.marketing_strategy_briefs where status='suggested'),
  'ai_used',(select count(*) from public.marketing_strategy_briefs where ai_used),
  'external_side_effect',false
)
$function$;

revoke all on function public.marketing_strategy_brief_summary_v1()
from public,anon,authenticated;
grant execute on function public.marketing_strategy_brief_summary_v1()
to service_role;

-- Reuse the existing Action Registry instead of creating a parallel permission system.
insert into public.ai_action_registry(
  action_key,version,display_name,description,category,implementation_kind,implementation_ref,
  input_schema,output_schema,preconditions,side_effects,confirmation_required,autonomy_level,
  allowed_channels,allowed_roles,idempotency_strategy,cost_class,enabled,execution_mode,
  requires_human_handoff_clear,metadata,risk_class,confidence_autorun_allowed,updated_at
)
values(
  'marketing_opportunity_observe_v1',1,'Observar oportunidade de marketing',
  'Transforma uma oportunidade CM-1.10 em brief determinístico estruturado, sem IA e sem ação externa.',
  'marketing','edge_function','admin-marketing-brain-v1',
  '{"type":"object","required":["opportunity_id"]}'::jsonb,
  '{"type":"object","required":["brief","opportunity_id","external_side_effect"]}'::jsonb,
  '["opportunity_exists"]'::jsonb,'[]'::jsonb,false,'B',
  array['admin']::text[],array['owner','operator']::text[],'derived','none',true,'observe',
  false,'{"roadmap":"CM-1.11","mode":"OBSERVE","external_side_effect":false}'::jsonb,
  'reversible_write',false,now()
),
(
  'marketing_strategy_suggest_v1',1,'Sugerir estratégia de marketing',
  'Usa IA governada somente sobre oportunidade CM-1.10 já calculada e salva um brief; não cria campanha nem envia mensagem.',
  'marketing','edge_function','admin-marketing-brain-v1',
  '{"type":"object","required":["opportunity_id"]}'::jsonb,
  '{"type":"object","required":["brief","opportunity_id","external_side_effect"]}'::jsonb,
  '["opportunity_exists","runtime_ai_gate_open","budget_available"]'::jsonb,'[]'::jsonb,false,'C',
  array['admin']::text[],array['owner','operator']::text[],'derived','low',false,'off',
  false,'{"roadmap":"CM-1.11","mode":"SUGGEST","external_side_effect":false}'::jsonb,
  'reversible_write',false,now()
)
on conflict(action_key) do update set
  version=excluded.version,
  display_name=excluded.display_name,
  description=excluded.description,
  implementation_kind=excluded.implementation_kind,
  implementation_ref=excluded.implementation_ref,
  input_schema=excluded.input_schema,
  output_schema=excluded.output_schema,
  preconditions=excluded.preconditions,
  side_effects=excluded.side_effects,
  confirmation_required=excluded.confirmation_required,
  autonomy_level=excluded.autonomy_level,
  allowed_channels=excluded.allowed_channels,
  allowed_roles=excluded.allowed_roles,
  idempotency_strategy=excluded.idempotency_strategy,
  cost_class=excluded.cost_class,
  enabled=excluded.enabled,
  execution_mode=excluded.execution_mode,
  requires_human_handoff_clear=excluded.requires_human_handoff_clear,
  metadata=excluded.metadata,
  risk_class=excluded.risk_class,
  confidence_autorun_allowed=excluded.confidence_autorun_allowed,
  updated_at=now();

update public.marketing_runtime_config
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'opportunity_brain_version','cm1.11-v1',
  'opportunity_observe_enabled',true,
  'opportunity_suggest_enabled',false,
  'opportunity_suggest_max_daily_calls',0,
  'opportunity_suggest_max_output_tokens',900,
  'opportunity_suggest_reasoning_effort','medium',
  'opportunity_suggest_model_task','marketing_strategy',
  'opportunity_suggest_create_campaign',false,
  'opportunity_suggest_external_side_effect',false
),
updated_at=now()
where id=1;
