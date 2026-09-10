begin;

create table if not exists public.agent_core_runtime_config (
  id smallint primary key default 1 check (id=1),
  enabled boolean not null default true,
  execution_mode text not null default 'observe' check (execution_mode in ('off','observe','homologation','canary','live')),
  agent_version text not null default 'v1',
  planner_model text not null default 'gpt-5.6-luna',
  escalation_model text not null default 'gpt-5.6-terra',
  reasoning_effort text not null default 'low' check (reasoning_effort in ('none','low','medium','high')),
  max_tool_calls smallint not null default 6 check (max_tool_calls between 1 and 12),
  max_history_messages smallint not null default 3 check (max_history_messages between 0 and 8),
  prompt_cache_key_prefix text not null default 'dona-antonia-agent-core-v1',
  prompt_cache_ttl text not null default '30m' check (prompt_cache_ttl in ('30m')),
  previous_response_state_enabled boolean not null default false,
  memory_read_enabled boolean not null default true,
  learning_write_enabled boolean not null default false,
  legacy_router_policy text not null default 'shadow' check (legacy_router_policy in ('keep','shadow','bypass','retired')),
  updated_at timestamptz not null default now()
);

insert into public.agent_core_runtime_config(id,enabled,execution_mode)
values (1,true,'observe')
on conflict (id) do nothing;

create table if not exists public.agent_core_turns (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  agent_version text not null,
  execution_mode text not null check (execution_mode in ('off','observe','homologation','canary','live')),
  topic text,
  tool_keys text[] not null default '{}'::text[],
  planned_tool text,
  policy_decision text,
  status text not null default 'observed' check (status in ('observed','planned','executed','blocked','failed')),
  model text,
  input_tokens integer,
  cached_input_tokens integer,
  cache_write_tokens integer,
  output_tokens integer,
  latency_ms integer,
  context_bytes integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(message_id, agent_version, execution_mode)
);

create index if not exists agent_core_turns_conversation_created_idx
  on public.agent_core_turns(conversation_id, created_at desc);
create index if not exists agent_core_turns_status_created_idx
  on public.agent_core_turns(status, created_at desc);

alter table public.agent_core_runtime_config enable row level security;
alter table public.agent_core_turns enable row level security;
revoke all on public.agent_core_runtime_config from public, anon, authenticated;
revoke all on public.agent_core_turns from public, anon, authenticated;
grant select,insert,update on public.agent_core_runtime_config to service_role;
grant select,insert,update on public.agent_core_turns to service_role;

create or replace function public.touch_agent_core_runtime_config_v1()
returns trigger language plpgsql security invoker set search_path=public as $$
begin new.updated_at=now(); return new; end $$;
drop trigger if exists trg_touch_agent_core_runtime_config_v1 on public.agent_core_runtime_config;
create trigger trg_touch_agent_core_runtime_config_v1 before update on public.agent_core_runtime_config
for each row execute function public.touch_agent_core_runtime_config_v1();
revoke all on function public.touch_agent_core_runtime_config_v1() from public,anon,authenticated;
grant execute on function public.touch_agent_core_runtime_config_v1() to service_role;

insert into public.ai_action_registry(
 action_key,version,display_name,description,category,implementation_kind,implementation_ref,input_schema,output_schema,
 preconditions,side_effects,confirmation_required,autonomy_level,allowed_channels,allowed_roles,idempotency_strategy,cost_class,
 enabled,execution_mode,requires_human_handoff_clear,metadata,risk_class
) values
('wa_search_products',1,'Buscar produtos do WhatsApp','Busca no catálogo fisicamente conferido; nunca inventa produto, preço ou estoque.','catalog','deterministic','search_whatsapp_sellable_products_v1','{"type":"object","properties":{"query":{"type":"string"},"limit":{"type":"integer","minimum":1,"maximum":10}},"required":["query"],"additionalProperties":false}'::jsonb,'{"type":"array"}'::jsonb,'[]'::jsonb,'[]'::jsonb,false,'A',array['whatsapp'],array['system'],'derived','none',true,'observe',true,'{"agent_core":"v1","tool":true,"truth_source":"counter_verified"}'::jsonb,'read_only'),
('wa_get_product',1,'Consultar produto','Consulta um produto conferido por ID.','catalog','deterministic','get_whatsapp_sellable_product_v1','{"type":"object","properties":{"product_id":{"type":"string","format":"uuid"}},"required":["product_id"],"additionalProperties":false}'::jsonb,'{"type":"object"}'::jsonb,'[]'::jsonb,'[]'::jsonb,false,'A',array['whatsapp'],array['system'],'derived','none',true,'observe',true,'{"agent_core":"v1","tool":true}'::jsonb,'read_only'),
('wa_get_cart',1,'Consultar carrinho','Lê o carrinho atual da conversa.','commerce','deterministic','get_whatsapp_sales_cart_v1','{"type":"object","properties":{},"additionalProperties":false}'::jsonb,'{"type":"object"}'::jsonb,'[]'::jsonb,'[]'::jsonb,false,'A',array['whatsapp'],array['system'],'derived','none',true,'observe',true,'{"agent_core":"v1","tool":true}'::jsonb,'read_only'),
('wa_list_baskets',1,'Listar cestas básicas','Lista somente as cestas básicas ativas com preço comercial próprio.','commerce','deterministic','get_whatsapp_simple_baskets_v1','{"type":"object","properties":{},"additionalProperties":false}'::jsonb,'{"type":"array"}'::jsonb,'[]'::jsonb,'[]'::jsonb,false,'A',array['whatsapp'],array['system'],'derived','none',true,'observe',true,'{"agent_core":"v1","tool":true,"basket_component_prices":"hidden"}'::jsonb,'read_only'),
('wa_get_policy',1,'Consultar política de atendimento','Consulta respostas determinísticas de política comercial/operacional.','service','deterministic','get_whatsapp_basic_policy_reply_v1','{"type":"object","properties":{"message":{"type":"string"}},"required":["message"],"additionalProperties":false}'::jsonb,'{"type":"object"}'::jsonb,'[]'::jsonb,'[]'::jsonb,false,'A',array['whatsapp'],array['system'],'derived','none',true,'observe',true,'{"agent_core":"v1","tool":true}'::jsonb,'read_only'),
('wa_get_recommendations',1,'Obter recomendações relevantes','Recomenda extras/upsell com base no carrinho e histórico permitido, sem inventar itens.','commerce','deterministic','get_cart_aware_recommendations','{"type":"object","properties":{"kind":{"type":"string","enum":["upsell","cross_sell"]},"limit":{"type":"integer","minimum":1,"maximum":6}},"required":["kind"],"additionalProperties":false}'::jsonb,'{"type":"array"}'::jsonb,'[]'::jsonb,'[]'::jsonb,false,'A',array['whatsapp'],array['system'],'derived','none',true,'observe',true,'{"agent_core":"v1","tool":true,"optional":true}'::jsonb,'read_only'),
('wa_add_product',1,'Adicionar produto','Adiciona produto real e quantidade ao carrinho; backend revalida estoque e preço.','commerce','deterministic','add_whatsapp_sales_product_v1','{"type":"object","properties":{"product_id":{"type":"string","format":"uuid"},"quantity":{"type":"number","minimum":1}},"required":["product_id","quantity"],"additionalProperties":false}'::jsonb,'{"type":"object"}'::jsonb,'["product_validated"]'::jsonb,'["cart_write"]'::jsonb,false,'A',array['whatsapp'],array['system'],'required','none',true,'observe',true,'{"agent_core":"v1","tool":true,"revalidate_backend":true}'::jsonb,'reversible_write'),
('wa_set_quantity',1,'Alterar quantidade','Ajusta quantidade no carrinho; quantidade zero remove o item.','commerce','deterministic','set_whatsapp_sales_product_quantity_v1','{"type":"object","properties":{"product_id":{"type":"string","format":"uuid"},"quantity":{"type":"number","minimum":0}},"required":["product_id","quantity"],"additionalProperties":false}'::jsonb,'{"type":"object"}'::jsonb,'["cart_item_exists"]'::jsonb,'["cart_write"]'::jsonb,false,'A',array['whatsapp'],array['system'],'required','none',true,'observe',true,'{"agent_core":"v1","tool":true,"revalidate_backend":true}'::jsonb,'reversible_write'),
('wa_replace_product',1,'Trocar produto','Solicita troca validada pelo backend; nunca inventa equivalência ou compensação.','commerce','deterministic','replace_whatsapp_sales_product_v1','{"type":"object","properties":{"original_product_id":{"type":"string","format":"uuid"},"replacement_product_id":{"type":"string","format":"uuid"},"customer_confirmed":{"type":"boolean"}},"required":["original_product_id","replacement_product_id","customer_confirmed"],"additionalProperties":false}'::jsonb,'{"type":"object"}'::jsonb,'["replacement_validated"]'::jsonb,'["cart_write"]'::jsonb,true,'B',array['whatsapp'],array['system'],'required','none',true,'observe',true,'{"agent_core":"v1","tool":true,"revalidate_backend":true}'::jsonb,'reversible_write'),
('wa_confirm_order',1,'Confirmar encomenda','Registra a encomenda somente após confirmação explícita e validações do backend. Não envia ao Bling.','orders','deterministic','confirm_whatsapp_sales_order_v1','{"type":"object","properties":{"delivery_address":{"type":"object"}},"required":["delivery_address"],"additionalProperties":false}'::jsonb,'{"type":"object"}'::jsonb,'["explicit_customer_confirmation","valid_address","cart_valid"]'::jsonb,'["order_create"]'::jsonb,true,'B',array['whatsapp'],array['system'],'required','none',true,'observe',true,'{"agent_core":"v1","tool":true,"bling":false}'::jsonb,'commitment'),
('wa_handoff_human',1,'Transferir para humano','Cria handoff preservando o contexto e impede a IA de continuar enquanto o humano estiver no controle.','service','deterministic','queue_human_handoff_v1','{"type":"object","properties":{"reason":{"type":"string"},"summary":{"type":"string"}},"required":["reason","summary"],"additionalProperties":false}'::jsonb,'{"type":"object"}'::jsonb,'[]'::jsonb,'["human_handoff"]'::jsonb,false,'A',array['whatsapp'],array['system'],'required','none',true,'observe',false,'{"agent_core":"v1","tool":true,"handoff_precedence":true}'::jsonb,'reversible_write')
on conflict (action_key) do update set version=excluded.version,display_name=excluded.display_name,description=excluded.description,category=excluded.category,implementation_kind=excluded.implementation_kind,implementation_ref=excluded.implementation_ref,input_schema=excluded.input_schema,output_schema=excluded.output_schema,preconditions=excluded.preconditions,side_effects=excluded.side_effects,confirmation_required=excluded.confirmation_required,autonomy_level=excluded.autonomy_level,allowed_channels=excluded.allowed_channels,allowed_roles=excluded.allowed_roles,idempotency_strategy=excluded.idempotency_strategy,cost_class=excluded.cost_class,enabled=excluded.enabled,execution_mode=excluded.execution_mode,requires_human_handoff_clear=excluded.requires_human_handoff_clear,metadata=excluded.metadata,risk_class=excluded.risk_class;

create or replace function public.get_whatsapp_agent_core_toolset_v1()
returns jsonb language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(jsonb_build_object('name',a.action_key,'description',a.description,'input_schema',a.input_schema,'risk_class',a.risk_class,'confirmation_required',a.confirmation_required,'autonomy_level',a.autonomy_level,'implementation_ref',a.implementation_ref) order by a.category,a.action_key),'[]'::jsonb)
from public.ai_action_registry a
where a.enabled and a.execution_mode<>'off' and a.allowed_channels @> array['whatsapp']::text[] and a.metadata->>'agent_core'='v1' and coalesce((a.metadata->>'tool')::boolean,false);
$$;
revoke all on function public.get_whatsapp_agent_core_toolset_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_agent_core_toolset_v1() to service_role;

create or replace function public.preview_whatsapp_agent_action_v1(p_conversation_id uuid,p_action_key text,p_input jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare open_handoff boolean;
begin
 select exists(select 1 from public.human_handoffs h where h.conversation_id=p_conversation_id and h.status='open') into open_handoff;
 return public.simulate_ai_action_v1(p_action_key,coalesce(p_input,'{}'::jsonb),'whatsapp','system',null,open_handoff);
end $$;
revoke all on function public.preview_whatsapp_agent_action_v1(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.preview_whatsapp_agent_action_v1(uuid,text,jsonb) to service_role;

do $$
declare d text;
begin
 d:=pg_get_functiondef('public.build_whatsapp_sales_context_v1(uuid,uuid)'::regprocedure);
 if position('get_service_intelligence_compact_v2' in d)>0 then
   d:=replace(d,'get_service_intelligence_compact_v2','get_service_intelligence_compact_v3');
   execute d;
 end if;
end $$;

create or replace function public.build_whatsapp_agent_core_packet_v1(p_conversation_id uuid,p_message_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cfg public.agent_core_runtime_config%rowtype; base jsonb; msg text; stage text; topic text; summary_text text; customer_mem jsonb:='[]'::jsonb; tools jsonb:='[]'::jsonb; hist jsonb:='[]'::jsonb; max_hist integer;
begin
 select * into cfg from public.agent_core_runtime_config where id=1;
 if not found or not cfg.enabled or cfg.execution_mode='off' then return jsonb_build_object('enabled',false,'execution_mode','off'); end if;
 base:=public.build_whatsapp_sales_context_v1(p_conversation_id,p_message_id);
 msg:=coalesce(base#>>'{message,text}',''); stage:=coalesce(base#>>'{conversation,stage}',''); topic:=public.classify_whatsapp_service_topic_v1(msg,stage); max_hist:=greatest(0,least(cfg.max_history_messages,8));
 if jsonb_typeof(base->'history')='array' then select coalesce(jsonb_agg(value),'[]'::jsonb) into hist from (select value from jsonb_array_elements(base->'history') with ordinality x(value,ord) order by ord limit max_hist) q; end if;
 if cfg.memory_read_enabled then
   select left(s.summary,700) into summary_text from public.conversation_memory_snapshots s where s.conversation_id=p_conversation_id;
   if (base->'customer'->>'id') is not null then
     select coalesce(jsonb_agg(jsonb_build_object('key',m.memory_key,'value',left(m.memory_value,180),'confidence',m.confidence) order by m.confidence desc,m.updated_at desc),'[]'::jsonb) into customer_mem
     from (select * from public.customer_service_memory m where m.customer_id=(base->'customer'->>'id')::uuid and m.status='active' and (m.expires_at is null or m.expires_at>now()) order by m.confidence desc,m.updated_at desc limit 6) m;
   end if;
 end if;
 tools:=public.get_whatsapp_agent_core_toolset_v1();
 return jsonb_build_object('enabled',true,'agent',jsonb_build_object('version',cfg.agent_version,'execution_mode',cfg.execution_mode,'planner_model',cfg.planner_model,'escalation_model',cfg.escalation_model,'reasoning_effort',cfg.reasoning_effort,'max_tool_calls',cfg.max_tool_calls,'prompt_cache_key_prefix',cfg.prompt_cache_key_prefix,'prompt_cache_ttl',cfg.prompt_cache_ttl),'topic',topic,'message',base->'message','conversation',base->'conversation','customer',base->'customer','cart',base->'cart','sales_state',base->'sales_state','history',hist,'conversation_summary',coalesce(summary_text,''),'customer_memory',customer_mem,'intelligence',public.get_service_intelligence_compact_v3('whatsapp',msg,null,stage),'toolset',tools,'truth_sources',jsonb_build_array('counter_verified','supabase_transactional_backend'),'rules',jsonb_build_object('human_handoff_precedence',true,'no_invented_catalog',true,'explicit_confirmation_for_commitments',true,'basket_component_prices_hidden',true));
end $$;
revoke all on function public.build_whatsapp_agent_core_packet_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.build_whatsapp_agent_core_packet_v1(uuid,uuid) to service_role;

comment on table public.agent_core_runtime_config is 'Dona Antônia Agent Core: configuração única do orquestrador. Nasce em observe e não altera rollout por si só.';
comment on table public.agent_core_turns is 'Trilha de decisão/custo do Agent Core sem armazenar prompt completo nem PII desnecessária.';

commit;