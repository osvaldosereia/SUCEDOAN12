-- WhatsApp Flow V35: upsell/cross-sell determinístico e consciente do estado temporário do Flow.
-- Não cria pedido/carrinho, não altera gates e não dá autoridade de catálogo à IA.

create or replace function public.get_whatsapp_flow_session_recommendations_v1(
  p_session_id uuid,
  p_conversation_id uuid,
  p_limit integer default 6
)
returns table(product_id uuid,name text,price numeric,image_url text,stock numeric,score numeric,reason text)
language sql
stable
security definer
set search_path to ''
as $function$
with sess as (
  select coalesce(s.context,'{}'::jsonb) as context
  from public.experience_sessions s
  where s.id=p_session_id and s.conversation_id=p_conversation_id
), basket_components as (
  select bi.product_id
  from sess s
  join public.basket_template_items bi
    on bi.basket_id = case
      when coalesce(s.context->>'basket_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (s.context->>'basket_id')::uuid else null end
), pending_addons as (
  select (x->>'product_id')::uuid as product_id
  from sess s
  cross join lateral jsonb_array_elements(case when jsonb_typeof(s.context->'flow_pending_addons')='array' then s.context->'flow_pending_addons' else '[]'::jsonb end) x
  where coalesce(x->>'product_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
), pending_product as (
  select (s.context#>>'{flow_pending_product,product_id}')::uuid as product_id
  from sess s
  where coalesce(s.context#>>'{flow_pending_product,product_id}','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
), excluded as (
  select product_id from basket_components
  union select product_id from pending_addons
  union select product_id from pending_product
), selected_categories as (
  select distinct p.sales_category
  from excluded e join public.products p on p.id=e.product_id
  where nullif(trim(coalesce(p.sales_category,'')),'') is not null
), base as (
  select r.*
  from public.get_cart_aware_recommendations(p_conversation_id,30,'upsell') r
  where not exists(select 1 from excluded e where e.product_id=r.product_id)
), ranked as (
  select b.product_id,b.name,b.price,b.image_url,b.stock,
    (b.score + case when exists(select 1 from selected_categories c where c.sales_category=b.sales_category) then 18 else 0 end)::numeric as adjusted_score,
    case when exists(select 1 from selected_categories c where c.sales_category=b.sales_category)
      then 'Combina com os itens escolhidos neste pedido' else b.reason end as recommendation_reason
  from base b
  where coalesce(b.price,0)>0 and coalesce(b.stock,0)>0
)
select product_id,name,price,image_url,stock,adjusted_score,recommendation_reason
from ranked
order by adjusted_score desc,name asc
limit greatest(1,least(coalesce(p_limit,6),6))
$function$;

revoke all on function public.get_whatsapp_flow_session_recommendations_v1(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_session_recommendations_v1(uuid,uuid,integer) to service_role;

create or replace function public.handle_whatsapp_flow_commercial_exchange_v25(
  p_session_id uuid,p_conversation_id uuid,p_action text,p_screen text default null,p_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_result jsonb; v_response jsonb; v_data jsonb; v_options jsonb;
begin
  v_result:=public.handle_whatsapp_flow_commercial_exchange_v24(p_session_id,p_conversation_id,p_action,p_screen,p_data);
  if not coalesce((v_result->>'ok')::boolean,false) then return v_result; end if;
  if jsonb_typeof(v_result->'response') is distinct from 'object' then return v_result; end if;

  v_response:=v_result->'response';
  if coalesce(v_response->>'screen','')='UPSELL' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',r.product_id::text,
      'title',left(r.name,70)||' · R$ '||replace(to_char(r.price,'FM999999990.00'),'.',','),
      'description',left(coalesce(r.reason,'Sugestão opcional'),90)
    ) order by r.score desc,r.name),'[]'::jsonb)
    into v_options
    from public.get_whatsapp_flow_session_recommendations_v1(p_session_id,p_conversation_id,6) r;

    v_data:=coalesce(v_response->'data','{}'::jsonb)||jsonb_build_object(
      'products',v_options,
      'upsell_note','Sugestões opcionais relacionadas ao seu pedido. Você pode continuar sem adicionar nada.'
    );
    v_response:=jsonb_set(v_response,'{data}',v_data,false);
    v_result:=jsonb_set(v_result,'{response}',v_response,false);
  end if;
  return v_result;
end;
$function$;

revoke all on function public.handle_whatsapp_flow_commercial_exchange_v25(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v25(uuid,uuid,text,text,jsonb) to service_role;

create or replace function public.get_whatsapp_flow_v35_session_upsell_readiness_v1(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  s public.experience_sessions%rowtype; cfg public.automation_config%rowtype;
  v_count int:=0; v_invalid int:=0; v_overlap int:=0; v_dupes int:=0;
  v25 text:=coalesce(pg_get_functiondef('public.handle_whatsapp_flow_commercial_exchange_v25(uuid,uuid,text,text,jsonb)'::regprocedure),'');
  recs jsonb:='[]'::jsonb;
begin
  select * into s from public.experience_sessions where id=p_session_id;
  if not found then return jsonb_build_object('ok',false,'reason','session_not_found'); end if;
  select * into cfg from public.automation_config where id=1;

  select coalesce(jsonb_agg(jsonb_build_object('product_id',r.product_id,'score',r.score,'reason',r.reason) order by r.score desc),'[]'::jsonb),count(*)::int
    into recs,v_count from public.get_whatsapp_flow_session_recommendations_v1(s.id,s.conversation_id,6) r;

  select count(*)::int into v_invalid
  from public.get_whatsapp_flow_session_recommendations_v1(s.id,s.conversation_id,6) r
  left join public.products p on p.id=r.product_id
  where p.id is null or not p.is_active or not coalesce(p.is_whatsapp_active,false) or coalesce(p.stock,0)<=0 or coalesce(p.price,0)<=0;

  select count(*)::int into v_overlap
  from public.get_whatsapp_flow_session_recommendations_v1(s.id,s.conversation_id,6) r
  where exists(select 1 from public.basket_template_items bi
    where coalesce(s.context->>'basket_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and bi.basket_id=(s.context->>'basket_id')::uuid and bi.product_id=r.product_id)
    or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(s.context->'flow_pending_addons')='array' then s.context->'flow_pending_addons' else '[]'::jsonb end) a where a->>'product_id'=r.product_id::text)
    or s.context#>>'{flow_pending_product,product_id}'=r.product_id::text;

  select count(*)-count(distinct r.product_id) into v_dupes
  from public.get_whatsapp_flow_session_recommendations_v1(s.id,s.conversation_id,6) r;

  return jsonb_build_object(
    'ok',v_count between 1 and 6 and v_invalid=0 and v_overlap=0 and v_dupes=0
      and position('handle_whatsapp_flow_commercial_exchange_v24' in v25)>0
      and cfg.whatsapp_live_canary_percent=1
      and not coalesce(cfg.experience_orchestrator_enabled,false)
      and not coalesce(cfg.whatsapp_flow_data_exchange_enabled,false)
      and not coalesce(cfg.whatsapp_flow_send_enabled,false)
      and not coalesce(cfg.whatsapp_flow_commercial_write_enabled,false)
      and not coalesce(cfg.bling_order_sync_enabled,false),
    'readiness_version','v35-session-upsell-v1','recommendation_count',v_count,
    'invalid_product_count',v_invalid,'selected_product_overlap_count',v_overlap,'duplicate_count',v_dupes,
    'max_recommendations',6,'session_context_aware',true,'ai_authoritative_for_products',false,
    'optional_upsell',true,'writes_executed',false,'pii_returned',false,
    'gates',jsonb_build_object(
      'whatsapp_live_canary_percent',cfg.whatsapp_live_canary_percent,
      'experience_orchestrator_enabled',cfg.experience_orchestrator_enabled,
      'whatsapp_flow_data_exchange_enabled',cfg.whatsapp_flow_data_exchange_enabled,
      'whatsapp_flow_send_enabled',cfg.whatsapp_flow_send_enabled,
      'whatsapp_flow_commercial_write_enabled',cfg.whatsapp_flow_commercial_write_enabled,
      'bling_order_sync_enabled',cfg.bling_order_sync_enabled)
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v35_session_upsell_readiness_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v35_session_upsell_readiness_v1(uuid) to service_role;
