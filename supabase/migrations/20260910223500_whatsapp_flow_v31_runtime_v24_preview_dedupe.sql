-- WhatsApp Flow V31 runtime V24: mantém V23 e corrige integridade da prévia/navegação.
-- Objetivos: consolidar extras repetidos, alinhar a prévia da personalização ao mesmo delta do carrinho
-- e manter toda a homologação sem write comercial enquanto os gates globais estiverem fechados.

create or replace function public.normalize_whatsapp_flow_pending_addons_v1(p_pending jsonb)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
with raw as (
  select
    case when coalesce(e.value->>'product_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (e.value->>'product_id')::uuid else null end as product_id,
    case when coalesce(e.value->>'quantity','') ~ '^[0-9]+$'
      then (e.value->>'quantity')::int else 0 end as quantity,
    e.ordinality as ord
  from jsonb_array_elements(case when jsonb_typeof(p_pending)='array' then p_pending else '[]'::jsonb end)
       with ordinality e(value,ordinality)
), grouped as (
  select product_id,sum(quantity)::int as quantity,min(ord) as ord
  from raw
  where product_id is not null and quantity>0
  group by product_id
), valid as (
  select g.product_id,
         least(g.quantity,6,greatest(0,floor(coalesce(p.stock,0))::int))::int as quantity,
         g.ord
  from grouped g
  join public.products p on p.id=g.product_id
  where p.is_active=true
    and coalesce(p.is_whatsapp_active,false)=true
    and coalesce(p.price,0)>0
    and coalesce(p.stock,0)>0
)
select coalesce(jsonb_agg(jsonb_build_object('product_id',product_id,'quantity',quantity) order by ord),'[]'::jsonb)
from valid
where quantity>0
$function$;

revoke all on function public.normalize_whatsapp_flow_pending_addons_v1(jsonb) from public,anon,authenticated;
grant execute on function public.normalize_whatsapp_flow_pending_addons_v1(jsonb) to service_role;

create or replace function public.format_whatsapp_flow_session_preview_v2(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  s public.experience_sessions%rowtype;
  b public.basket_templates%rowtype;
  v_selection jsonb;
  v_valid jsonb;
  v_delta numeric:=0;
  v_total numeric:=0;
  v_summary text:='';
  v_addons jsonb:='[]'::jsonb;
  v_pending jsonb:='[]'::jsonb;
  v_upsell uuid;
  v_changed int:=0;
  r record;
begin
  select * into s from public.experience_sessions where id=p_session_id;
  if not found then return jsonb_build_object('ok',false,'reason','session_not_found'); end if;
  begin
    select * into b from public.basket_templates where id=(s.context->>'basket_id')::uuid;
  exception when others then
    return jsonb_build_object('ok',false,'reason','basket_not_found');
  end;
  if b.id is null then return jsonb_build_object('ok',false,'reason','basket_not_found'); end if;

  v_selection:=coalesce(s.context->'flow_basket_selection',public.get_whatsapp_flow_basket_editor_v1(b.id)->'selection');
  v_valid:=public.validate_basket_flow_selection_v1(b.id,v_selection);
  if not coalesce((v_valid->>'valid')::boolean,false) then
    return jsonb_build_object('ok',false,'reason','basket_selection_invalid','issues',v_valid->'issues');
  end if;

  select coalesce(sum(case
      when (x->>'quantity')::numeric < bi.quantity then
        abs((x->>'quantity')::numeric-bi.quantity) * coalesce(bi.remove_unit_delta,case when coalesce(p.price,0)>0 then -p.price end,0)
      when (x->>'quantity')::numeric > bi.quantity then
        ((x->>'quantity')::numeric-bi.quantity) * coalesce(bi.add_unit_delta,case when coalesce(p.price,0)>0 then p.price end,0)
      else 0::numeric end),0),
      count(*) filter(where (x->>'quantity')::numeric<>bi.quantity)::int
    into v_delta,v_changed
  from jsonb_array_elements(v_valid->'normalized') x
  join public.basket_template_items bi on bi.basket_id=b.id and bi.product_id=(x->>'product_id')::uuid
  join public.products p on p.id=bi.product_id;

  v_total:=coalesce(b.base_price,0)+coalesce(v_delta,0);
  v_summary:=b.name||E'\nCesta: R$ '||replace(to_char(coalesce(b.base_price,0),'FM999999990.00'),'.',',');
  if v_changed>0 then
    v_summary:=v_summary||E'\nPersonalização aplicada: '||case when v_delta>=0 then '+' else '-' end||'R$ '||replace(to_char(abs(v_delta),'FM999999990.00'),'.',',');
  end if;

  v_pending:=public.normalize_whatsapp_flow_pending_addons_v1(s.context->'flow_pending_addons');
  for r in
    select p.id,p.name,p.price,(a->>'quantity')::int as qty
    from jsonb_array_elements(v_pending) a
    join public.products p on p.id=(a->>'product_id')::uuid
    where p.is_active=true and coalesce(p.is_whatsapp_active,false)=true and coalesce(p.price,0)>0
  loop
    v_total:=v_total+(r.price*r.qty);
    v_summary:=v_summary||E'\n'||r.qty||' × '||left(r.name,90)||' — R$ '||replace(to_char(r.price*r.qty,'FM999999990.00'),'.',',');
    v_addons:=v_addons||jsonb_build_array(jsonb_build_object('product_id',r.id,'name',r.name,'quantity',r.qty,'unit_price',r.price,'line_total',r.price*r.qty));
  end loop;

  begin v_upsell:=nullif(s.context->>'flow_pending_upsell_product_id','')::uuid; exception when others then v_upsell:=null; end;
  if v_upsell is not null and not exists(select 1 from jsonb_array_elements(v_addons) a where a->>'product_id'=v_upsell::text) then
    select p.id,p.name,p.price,1 as qty into r
    from public.products p
    where p.id=v_upsell and p.is_active=true and coalesce(p.is_whatsapp_active,false)=true and coalesce(p.price,0)>0 and coalesce(p.stock,0)>=1;
    if found then
      v_total:=v_total+r.price;
      v_summary:=v_summary||E'\n1 × '||left(r.name,90)||' — R$ '||replace(to_char(r.price,'FM999999990.00'),'.',',');
      v_addons:=v_addons||jsonb_build_array(jsonb_build_object('product_id',r.id,'name',r.name,'quantity',1,'unit_price',r.price,'line_total',r.price));
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,
    'basket_id',b.id,
    'basket_name',b.name,
    'basket_price',b.base_price,
    'personalization_delta',v_delta,
    'personalization_changed_items',v_changed,
    'addons',v_addons,
    'normalized_pending_addons',v_pending,
    'total_numeric',v_total,
    'total','R$ '||replace(to_char(v_total,'FM999999990.00'),'.',','),
    'summary',v_summary,
    'pricing_note','A cesta possui preço comercial próprio. A personalização é calculada pelo backend e os componentes da cesta não exibem preço individual.'
  );
end;
$function$;

revoke all on function public.format_whatsapp_flow_session_preview_v2(uuid) from public,anon,authenticated;
grant execute on function public.format_whatsapp_flow_session_preview_v2(uuid) to service_role;

create or replace function public.handle_whatsapp_flow_commercial_exchange_v24(
  p_session_id uuid,
  p_conversation_id uuid,
  p_action text,
  p_screen text default null,
  p_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
  v_response jsonb;
  v_data jsonb;
  v_screen text;
  v_preview jsonb;
  v_context jsonb;
  v_normalized jsonb;
  v_write_ready boolean:=coalesce((public.get_whatsapp_flow_commercial_write_readiness_v1()->>'ready')::boolean,false);
begin
  v_result:=public.handle_whatsapp_flow_commercial_exchange_v23(
    p_session_id,p_conversation_id,p_action,p_screen,p_data
  );
  if not coalesce((v_result->>'ok')::boolean,false) then return v_result; end if;

  if not v_write_ready
     and p_action='data_exchange'
     and coalesce(p_screen,'') ~ '^PRODUTO_[ABC]$'
     and coalesce(p_data->>'trigger','')='add_product' then
    select coalesce(context,'{}'::jsonb) into v_context
    from public.experience_sessions
    where id=p_session_id and conversation_id=p_conversation_id
    for update;
    if found then
      v_normalized:=public.normalize_whatsapp_flow_pending_addons_v1(v_context->'flow_pending_addons');
      update public.experience_sessions
         set context=jsonb_set(v_context,'{flow_pending_addons}',v_normalized,true),updated_at=now()
       where id=p_session_id and conversation_id=p_conversation_id;
    end if;
  end if;

  if jsonb_typeof(v_result->'response') is distinct from 'object' then return v_result; end if;
  v_response:=v_result->'response';
  v_screen:=coalesce(v_response->>'screen','');
  v_data:=coalesce(v_response->'data','{}'::jsonb);

  if v_screen in ('REVISAO','FINALIZAR') then
    v_preview:=public.format_whatsapp_flow_session_preview_v2(p_session_id);
    if coalesce((v_preview->>'ok')::boolean,false) then
      if v_screen='REVISAO' then
        v_data:=v_data||jsonb_build_object('summary',v_preview->>'summary','total',v_preview->>'total','pricing_note',v_preview->>'pricing_note');
      else
        v_data:=v_data||jsonb_build_object('final_summary',v_preview->>'summary','final_total',v_preview->>'total');
      end if;
      v_response:=jsonb_set(v_response,'{data}',v_data,false);
      v_result:=jsonb_set(v_result,'{response}',v_response,false);
    end if;
  end if;

  return v_result;
end;
$function$;

revoke all on function public.handle_whatsapp_flow_commercial_exchange_v24(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.handle_whatsapp_flow_commercial_exchange_v24(uuid,uuid,text,text,jsonb) to service_role;

create or replace function public.get_whatsapp_flow_v31_navigation_integrity_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  cfg public.automation_config%rowtype;
  v24 text:=coalesce(pg_get_functiondef('public.handle_whatsapp_flow_commercial_exchange_v24(uuid,uuid,text,text,jsonb)'::regprocedure),'');
  pv2 text:=coalesce(pg_get_functiondef('public.format_whatsapp_flow_session_preview_v2(uuid)'::regprocedure),'');
  norm text:=coalesce(pg_get_functiondef('public.normalize_whatsapp_flow_pending_addons_v1(jsonb)'::regprocedure),'');
  sample_id uuid;
  sample jsonb;
  search_count int:=0;
  checks jsonb;
  passed int;
begin
  select * into cfg from public.automation_config where id=1;
  select id into sample_id from public.products where is_active=true and coalesce(is_whatsapp_active,false)=true and coalesce(price,0)>0 and coalesce(stock,0)>=3 order by id limit 1;
  if sample_id is not null then
    sample:=public.normalize_whatsapp_flow_pending_addons_v1(jsonb_build_array(jsonb_build_object('product_id',sample_id,'quantity',1),jsonb_build_object('product_id',sample_id,'quantity',2)));
  else sample:='[]'::jsonb; end if;
  select jsonb_array_length(coalesce(public.get_whatsapp_flow_product_results_v1('sabonete',12)->'products','[]'::jsonb)) into search_count;

  checks:=jsonb_build_array(
    jsonb_build_object('name','runtime_v24_chains_v23','ok',position('handle_whatsapp_flow_commercial_exchange_v23' in v24)>0),
    jsonb_build_object('name','preview_uses_backend_selection_validation','ok',position('validate_basket_flow_selection_v1' in pv2)>0),
    jsonb_build_object('name','preview_uses_same_remove_delta','ok',position('remove_unit_delta' in pv2)>0),
    jsonb_build_object('name','preview_uses_same_add_delta','ok',position('add_unit_delta' in pv2)>0),
    jsonb_build_object('name','component_prices_hidden','ok',position('componentes da cesta não exibem preço individual' in pv2)>0),
    jsonb_build_object('name','pending_addons_grouped','ok',position('group by product_id' in lower(norm))>0),
    jsonb_build_object('name','pending_addons_cap_six','ok',position('least(g.quantity,6' in replace(lower(norm),' ',''))>0),
    jsonb_build_object('name','duplicate_sample_collapses','ok',jsonb_array_length(sample)=1 and coalesce((sample->0->>'quantity')::int,0)=3),
    jsonb_build_object('name','direct_search_bounded','ok',search_count<=12),
    jsonb_build_object('name','canary_one_percent','ok',cfg.whatsapp_live_canary_percent=1),
    jsonb_build_object('name','orchestrator_off','ok',not coalesce(cfg.experience_orchestrator_enabled,false)),
    jsonb_build_object('name','data_exchange_global_off','ok',not coalesce(cfg.whatsapp_flow_data_exchange_enabled,false)),
    jsonb_build_object('name','flow_send_global_off','ok',not coalesce(cfg.whatsapp_flow_send_enabled,false)),
    jsonb_build_object('name','commercial_write_off','ok',not coalesce(cfg.whatsapp_flow_commercial_write_enabled,false)),
    jsonb_build_object('name','bling_sync_off','ok',not coalesce(cfg.bling_order_sync_enabled,false))
  );
  select count(*)::int into passed from jsonb_array_elements(checks) c where coalesce((c->>'ok')::boolean,false);
  return jsonb_build_object('version',1,'passed',passed,'total',jsonb_array_length(checks),'healthy',passed=jsonb_array_length(checks),'checks',checks,'writes_executed',false,'orders_created',false);
end;
$function$;

revoke all on function public.get_whatsapp_flow_v31_navigation_integrity_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v31_navigation_integrity_readiness_v1() to service_role;
