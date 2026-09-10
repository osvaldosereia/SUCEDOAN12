create extension if not exists pg_trgm with schema extensions;

create or replace function public.canonicalize_whatsapp_product_query_v1(p_message text)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare
  q text:=translate(lower(trim(coalesce(p_message,''))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');
begin
  q:=regexp_replace(q,'[^a-z0-9 ]+',' ','g');
  q:=regexp_replace(q,'\s+',' ','g');
  q:=trim(q);
  q:=regexp_replace(q,'^(por favor |pf |favor )+','','g');
  q:=regexp_replace(q,'^(voce(s)? |vcs )?(tem|temos|vende|vendem|trabalha com|trabalham com)\s+','','g');
  q:=regexp_replace(q,'^(eu )?(quero|queria|preciso|gostaria|procuro|busco)\s+(de\s+)?','','g');
  q:=regexp_replace(q,'^(me )?(mostra|mostre|manda|mande|veja|busque|procure)\s+(um |uma |uns |umas |o |a |os |as |de )*','','g');
  q:=regexp_replace(q,'^(qual|quais)\s+(a |as |o |os )?(marca|marcas|opcao|opcoes|tipo|tipos)\s+(de\s+)?','','g');
  q:=regexp_replace(q,'^(quanto custa|qual o preco de|qual preco de|preco de)\s+','','g');
  q:=regexp_replace(q,'\s+(por favor|pf)$','','g');
  q:=regexp_replace(q,'\s+',' ','g');
  return left(trim(q),120);
end;
$$;

revoke all on function public.canonicalize_whatsapp_product_query_v1(text) from public,anon,authenticated;
grant execute on function public.canonicalize_whatsapp_product_query_v1(text) to service_role;

create or replace function public.search_whatsapp_sellable_products_agent_v1(p_query text,p_limit integer default 8)
returns table(id uuid, sku text, gtin text, name text, brand text, category text, packaging text, price numeric, stock numeric, image_url text, gondola text, shelf text, score integer, canonical_query text, match_mode text)
language sql
stable security definer
set search_path=''
as $$
with q as (
  select public.canonicalize_whatsapp_product_query_v1(p_query) as term,
         greatest(1,least(coalesce(p_limit,8),20)) as lim
), exact_hits as (
  select s.*,q.term as canonical_query,'exact'::text as match_mode
  from q cross join lateral public.search_whatsapp_sellable_products_v1(q.term,q.lim) s
), fuzzy_pool as (
  select p.id,p.sku,p.gtin,p.name,p.brand,p.category,p.packaging,p.price,p.stock,p.image_url,p.gondola,p.shelf,
    q.term as canonical_query,
    greatest(
      extensions.word_similarity(q.term,translate(lower(coalesce(p.name,'')),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc')),
      extensions.word_similarity(q.term,translate(lower(coalesce(p.category,'')),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc')),
      extensions.word_similarity(q.term,translate(lower(coalesce(p.brand,'')),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc'))
    ) as sim
  from public.products p cross join q
  where not exists(select 1 from exact_hits)
    and length(q.term)>=4
    and p.physically_verified=true and p.is_active=true and p.is_whatsapp_active=true
    and p.price is not null and p.price>=0 and coalesce(p.stock,0)>0
), fuzzy_hits as (
  select f.id,f.sku,f.gtin,f.name,f.brand,f.category,f.packaging,f.price,f.stock,f.image_url,f.gondola,f.shelf,
         greatest(50,least(79,round(f.sim*100)::int)) as score,
         f.canonical_query,'fuzzy'::text as match_mode
  from fuzzy_pool f
  where f.sim>=0.68
  order by f.sim desc,f.name,f.id
  limit (select lim from q)
)
select e.id,e.sku,e.gtin,e.name,e.brand,e.category,e.packaging,e.price,e.stock,e.image_url,e.gondola,e.shelf,e.score,e.canonical_query,e.match_mode
from exact_hits e
union all
select f.id,f.sku,f.gtin,f.name,f.brand,f.category,f.packaging,f.price,f.stock,f.image_url,f.gondola,f.shelf,f.score,f.canonical_query,f.match_mode
from fuzzy_hits f
limit (select lim from q);
$$;

revoke all on function public.search_whatsapp_sellable_products_agent_v1(text,integer) from public,anon,authenticated;
grant execute on function public.search_whatsapp_sellable_products_agent_v1(text,integer) to service_role;

create or replace function public.resolve_whatsapp_agent_core_topic_v4(p_message text,p_stage text,p_awaiting text,p_interactive_id text)
returns text
language plpgsql
stable security definer
set search_path=''
as $$
declare
  t text;
  cq text;
begin
  t:=public.resolve_whatsapp_agent_core_topic_v3(p_message,p_stage,p_awaiting,p_interactive_id);
  if t<>'general' then return t; end if;
  cq:=public.canonicalize_whatsapp_product_query_v1(p_message);
  if length(cq)>=2 and exists(select 1 from public.search_whatsapp_sellable_products_agent_v1(cq,1)) then
    return 'product_search';
  end if;
  return t;
end;
$$;

revoke all on function public.resolve_whatsapp_agent_core_topic_v4(text,text,text,text) from public,anon,authenticated;
grant execute on function public.resolve_whatsapp_agent_core_topic_v4(text,text,text,text) to service_role;

create or replace function public.build_whatsapp_agent_core_packet_v1(p_conversation_id uuid,p_message_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
  cfg public.agent_core_runtime_config%rowtype;
  base jsonb; msg text; stage text; awaiting text; iid text; topic text;
  selective jsonb; intelligence jsonb; tools jsonb:='[]'::jsonb; hist jsonb:='[]'::jsonb; max_hist integer;
  j public.ai_jobs%rowtype; c public.conversations%rowtype; historical_safe jsonb; historical boolean:=false; hist_action text;
begin
  select * into cfg from public.agent_core_runtime_config where id=1;
  if not found or not cfg.enabled or cfg.execution_mode='off' then return jsonb_build_object('enabled',false,'execution_mode','off'); end if;
  base:=public.build_whatsapp_sales_context_v1(p_conversation_id,p_message_id);
  select * into c from public.conversations where id=p_conversation_id;
  select * into j from public.ai_jobs where conversation_id=p_conversation_id and message_id=p_message_id order by created_at desc limit 1;
  if found and coalesce(c.automation_cohort,'')='homologation' then
    historical_safe:=public.is_agent_core_stateless_historical_replay_job_v2(j.id);
    historical:=coalesce((historical_safe->>'safe')::boolean,false);
    hist_action:=coalesce(historical_safe->>'action','');
  end if;
  msg:=coalesce(base#>>'{message,text}',''); stage:=coalesce(base#>>'{conversation,stage}',''); awaiting:=coalesce(base#>>'{sales_state,awaiting}',''); iid:=coalesce(base#>>'{message,interactive,id}','');
  topic:=public.resolve_whatsapp_agent_core_topic_v4(msg,case when historical then '' else stage end,case when historical then '' else awaiting end,iid);
  max_hist:=greatest(0,least(cfg.max_history_messages,8));
  if historical then
    select coalesce(jsonb_agg(jsonb_build_object('direction',x.direction,'type',x.message_type,'text',left(coalesce(x.body_text,x.transcript,''),220)) order by x.created_at),'[]'::jsonb)
      into hist from (select direction,message_type,body_text,transcript,created_at from public.messages where conversation_id=p_conversation_id and created_at<=(select created_at from public.messages where id=p_message_id) order by created_at desc limit max_hist) x;
  elsif jsonb_typeof(base->'history')='array' then
    select coalesce(jsonb_agg(value),'[]'::jsonb) into hist from (select value from jsonb_array_elements(base->'history') with ordinality x(value,ord) order by ord limit max_hist) q;
  end if;
  selective:=case when historical then jsonb_build_object('summary','','memories','[]'::jsonb) else public.get_agent_core_selective_memory_v1(p_conversation_id) end;
  tools:=public.get_whatsapp_agent_core_toolset_v1();
  if historical then
    if hist_action='search' then
      select coalesce(jsonb_agg(x),'[]'::jsonb) into tools from jsonb_array_elements(tools) x where x->>'name' in ('wa_search_products','wa_get_product','wa_get_policy');
    else
      select coalesce(jsonb_agg(x),'[]'::jsonb) into tools from jsonb_array_elements(tools) x where x->>'name' in ('wa_list_baskets','wa_get_policy');
    end if;
  end if;
  intelligence:=coalesce(public.get_service_intelligence_compact_v3('whatsapp',msg,null,case when historical then null else stage end),'{}'::jsonb)
    || jsonb_build_object('conversation_summary',coalesce(selective->>'summary',''),'knowledge_text_matches',public.search_service_knowledge_text_v1(msg,3),'memory_policy',jsonb_build_object('declared_precedence',true,'sensitive_attributes_excluded',true));
  return jsonb_build_object('enabled',true,'agent',jsonb_build_object('version',cfg.agent_version,'execution_mode',cfg.execution_mode,'planner_model',cfg.planner_model,'escalation_model',cfg.escalation_model,'reasoning_effort',cfg.reasoning_effort,'max_tool_calls',cfg.max_tool_calls,'prompt_cache_key_prefix',cfg.prompt_cache_key_prefix,'prompt_cache_ttl',cfg.prompt_cache_ttl),'topic',topic,'message',base->'message','conversation',case when historical then jsonb_build_object('id',p_conversation_id,'stage','','mode','ai','fast_checkout',false,'upsell_declined',false) else base->'conversation' end,'customer',case when historical then null else base->'customer' end,'cart',case when historical then jsonb_build_object('exists',false,'items','[]'::jsonb) else base->'cart' end,'sales_state',case when historical then '{}'::jsonb else base->'sales_state' end,'history',hist,'conversation_summary',coalesce(selective->>'summary',''),'customer_memory',coalesce(selective->'memories','[]'::jsonb),'intelligence',intelligence,'toolset',tools,'truth_sources',jsonb_build_array('counter_verified','supabase_transactional_backend'),'rules',jsonb_build_object('human_handoff_precedence',true,'no_invented_catalog',true,'explicit_confirmation_for_commitments',true,'basket_component_prices_hidden',true,'declared_memory_precedence',true,'global_learning_requires_human_review',true,'state_aware_topic',true,'historical_replay',historical,'historical_state_neutral',historical,'historical_toolset_restricted',historical,'canonical_product_search',true));
end
$$;

revoke all on function public.build_whatsapp_agent_core_packet_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.build_whatsapp_agent_core_packet_v1(uuid,uuid) to service_role;