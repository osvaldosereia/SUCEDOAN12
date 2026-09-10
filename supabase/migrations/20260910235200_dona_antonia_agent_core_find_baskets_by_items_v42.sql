begin;

create or replace function public.find_whatsapp_baskets_by_items_v1(p_items_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_norm text:=translate(lower(trim(coalesce(p_items_query,''))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');
  v_terms text[];
  v_result jsonb;
begin
  v_norm:=regexp_replace(v_norm,'[^a-z0-9 ]+',' ','g');
  v_norm:=regexp_replace(v_norm,'\s+',' ','g');
  select coalesce(array_agg(distinct t order by t),'{}'::text[]) into v_terms
  from unnest(regexp_split_to_array(trim(v_norm),' +')) t
  where length(t)>=3
    and t not in ('quais','qual','cesta','cestas','tem','têm','com','que','vem','dentro','possui','possuem','produto','produtos','item','itens','uma','umas','alguma','algumas','todos','todas','para','dos','das');

  if coalesce(array_length(v_terms,1),0)=0 then
    return jsonb_build_object('found',false,'reason','item_query_required','query_terms','[]'::jsonb);
  end if;

  with basket_matches as (
    select b.id,b.name,case when lower(b.name)='economica bonini' then 'Econômica' else b.name end as display_name,b.base_price,
      count(distinct term)::int as matched_terms
    from public.basket_templates b
    cross join unnest(v_terms) term
    where b.is_active=true and b.is_whatsapp_active=true
      and exists (
        select 1
        from public.basket_template_items bi
        join public.products p on p.id=bi.product_id
        where bi.basket_id=b.id
          and translate(lower(coalesce(p.name,'')),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') like '%'||term||'%'
      )
    group by b.id,b.name,b.base_price
    having count(distinct term)=array_length(v_terms,1)
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'display_name',display_name,'commercial_price',base_price) order by base_price,display_name),'[]'::jsonb)
  into v_result from basket_matches;

  return jsonb_build_object(
    'found',jsonb_array_length(v_result)>0,
    'query_terms',to_jsonb(v_terms),
    'baskets',v_result,
    'component_prices_included',false,
    'component_costs_included',false,
    'component_stock_included',false
  );
end
$$;

revoke all on function public.find_whatsapp_baskets_by_items_v1(text) from public,anon,authenticated;
grant execute on function public.find_whatsapp_baskets_by_items_v1(text) to service_role;

insert into public.ai_action_registry (
 action_key,version,display_name,description,category,implementation_kind,implementation_ref,input_schema,output_schema,
 preconditions,side_effects,compensation,confirmation_required,autonomy_level,max_amount_brl,allowed_channels,allowed_roles,
 idempotency_strategy,cost_class,enabled,execution_mode,requires_human_handoff_clear,metadata,risk_class,confidence_autorun_allowed
)
select 'wa_find_baskets_by_items',1,'Encontrar cestas por itens',
 'Encontra em uma única consulta quais cestas básicas ativas contêm todos os itens citados pelo cliente. Use para perguntas como quais cestas têm arroz e feijão. Não retorna preço, custo ou estoque individual dos componentes.',
 'commerce','deterministic','find_whatsapp_baskets_by_items_v1',
 jsonb_build_object('type','object','properties',jsonb_build_object('items_query',jsonb_build_object('type','string')),'required',jsonb_build_array('items_query'),'additionalProperties',false),
 jsonb_build_object('type','object'),'[]'::jsonb,'[]'::jsonb,null,false,'A',null,array['whatsapp']::text[],array['system']::text[],
 'derived','none',true,'observe',true,jsonb_build_object('tool',true,'agent_core','v1','basket_component_prices','hidden','truth_source','basket_template_items'),'read_only',false
on conflict (action_key) do update set description=excluded.description,implementation_ref=excluded.implementation_ref,input_schema=excluded.input_schema,
 output_schema=excluded.output_schema,enabled=true,execution_mode='observe',metadata=excluded.metadata,risk_class='read_only',updated_at=now();

commit;