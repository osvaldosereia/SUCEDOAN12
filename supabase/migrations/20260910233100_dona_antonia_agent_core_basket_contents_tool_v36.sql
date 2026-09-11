begin;

create or replace function public.get_whatsapp_basket_contents_v1(p_basket_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_query text := translate(lower(trim(coalesce(p_basket_query,''))),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc');
  v_id uuid;
  v_name text;
  v_display text;
  v_price numeric;
  v_score real;
  v_second_score real;
  v_items jsonb;
  v_count integer;
begin
  v_query := regexp_replace(v_query,'[^a-z0-9 ]+',' ','g');
  v_query := regexp_replace(v_query,'\s+',' ','g');
  v_query := trim(v_query);
  if v_query='' then return jsonb_build_object('found',false,'reason','basket_query_required'); end if;

  with ranked as (
    select b.id,b.name,
      case when lower(b.name)='economica bonini' then 'Econômica' else b.name end as display_name,
      b.base_price,
      greatest(
        case
          when v_query = translate(lower(case when lower(b.name)='economica bonini' then 'Econômica' else b.name end),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc') then 1.0
          when (' '||v_query||' ') like '% '||translate(lower(case when lower(b.name)='economica bonini' then 'Econômica' else b.name end),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc')||' %' then 0.98
          when (' '||v_query||' ') like '% '||translate(lower(b.name),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc')||' %' then 0.97
          else 0.0 end,
        extensions.word_similarity(v_query,translate(lower(case when lower(b.name)='economica bonini' then 'Econômica' else b.name end),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc')),
        extensions.word_similarity(v_query,translate(lower(b.name),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc'))
      )::real as score
    from public.basket_templates b
    where b.is_active=true and b.is_whatsapp_active=true
  ), ordered as (
    select *, row_number() over(order by score desc, display_name) as rn from ranked
  )
  select id,name,display_name,base_price,score,(select score from ordered x where x.rn=2)
    into v_id,v_name,v_display,v_price,v_score,v_second_score
  from ordered where rn=1;

  if v_id is null or coalesce(v_score,0)<0.42 then
    return jsonb_build_object('found',false,'reason','basket_not_found');
  end if;

  if coalesce(v_second_score,0)>0.60 and abs(v_score-v_second_score)<0.05
     and v_query !~ '(bonini|koblenz|economica)' then
    return jsonb_build_object('found',false,'ambiguous',true,'reason','basket_ambiguous',
      'candidates',(
        select coalesce(jsonb_agg(jsonb_build_object('display_name',display_name,'commercial_price',base_price) order by score desc),'[]'::jsonb)
        from (
          select case when lower(b.name)='economica bonini' then 'Econômica' else b.name end as display_name,b.base_price,
                 greatest(
                   extensions.word_similarity(v_query,translate(lower(case when lower(b.name)='economica bonini' then 'Econômica' else b.name end),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc')),
                   extensions.word_similarity(v_query,translate(lower(b.name),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc'))
                 ) as score
          from public.basket_templates b where b.is_active=true and b.is_whatsapp_active=true
          order by score desc limit 3
        ) c
      )
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('name',p.name,'quantity',bti.quantity) order by bti.sort_order,p.name),'[]'::jsonb),count(*)::integer
    into v_items,v_count
  from public.basket_template_items bti
  join public.products p on p.id=bti.product_id
  where bti.basket_id=v_id;

  return jsonb_build_object(
    'found',true,
    'basket',jsonb_build_object('id',v_id,'name',v_name,'display_name',v_display,'commercial_price',v_price),
    'item_count',coalesce(v_count,0),'items',coalesce(v_items,'[]'::jsonb),
    'component_prices_included',false,'component_costs_included',false,'component_stock_included',false
  );
end
$$;

revoke all on function public.get_whatsapp_basket_contents_v1(text) from public,anon,authenticated;
grant execute on function public.get_whatsapp_basket_contents_v1(text) to service_role;

insert into public.ai_action_registry (
  action_key,version,display_name,description,category,implementation_kind,implementation_ref,input_schema,output_schema,
  preconditions,side_effects,compensation,confirmation_required,autonomy_level,max_amount_brl,allowed_channels,allowed_roles,
  idempotency_strategy,cost_class,enabled,execution_mode,requires_human_handoff_clear,metadata,risk_class,confidence_autorun_allowed
)
select 'wa_get_basket_contents',1,'Consultar composição da cesta',
  'Consulta a composição real de uma cesta básica ativa pelo nome. Retorna somente nome e quantidade dos itens e o preço comercial total da cesta; nunca retorna preço individual, custo ou estoque dos componentes.',
  'commerce','deterministic','get_whatsapp_basket_contents_v1',
  jsonb_build_object('type','object','properties',jsonb_build_object('basket_query',jsonb_build_object('type','string')),'required',jsonb_build_array('basket_query'),'additionalProperties',false),
  jsonb_build_object('type','object'),'[]'::jsonb,'[]'::jsonb,null,false,'A',null,array['whatsapp']::text[],array['system']::text[],
  'derived','none',true,'observe',true,jsonb_build_object('tool',true,'agent_core','v1','basket_component_prices','hidden','truth_source','basket_templates'),'read_only',false
on conflict (action_key) do update set description=excluded.description,implementation_ref=excluded.implementation_ref,input_schema=excluded.input_schema,
  output_schema=excluded.output_schema,enabled=true,execution_mode='observe',metadata=excluded.metadata,risk_class='read_only',updated_at=now();

commit;