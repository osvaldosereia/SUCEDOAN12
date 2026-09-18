-- CM-1.8 Segment Engine v1
-- Dynamic/reproducible segments built from facts. Manual tags are not a source of truth.

create or replace view public.customer_segment_registry_v1
with (security_invoker=true)
as
select * from (values
  ('comprou_alguma_vez','Comprou alguma vez',false,'Possui ao menos um pedido válido'),
  ('primeira_compra','Primeira compra',false,'Possui exatamente um pedido válido'),
  ('recorrente','Recorrente',false,'Possui dois ou mais pedidos válidos'),
  ('sem_compra_30d','30 dias sem compra',false,'Última compra ocorreu há 30 dias ou mais'),
  ('sem_compra_60d','60 dias sem compra',false,'Última compra ocorreu há 60 dias ou mais'),
  ('mercearia','Compra mercearia',false,'Histórico contém produto de mercearia'),
  ('lavanderia','Compra limpeza/lavanderia',false,'Histórico contém produto de limpeza ou lavanderia'),
  ('higiene','Compra higiene/beleza',false,'Histórico contém produto de higiene ou beleza'),
  ('cesta_basica','Compra cesta básica',false,'Possui pedido válido identificado com cesta'),
  ('falou_nao_comprou','Falou e não comprou',false,'Possui conversa e nenhum pedido válido'),
  ('carrinho_nao_concluido','Carrinho não concluído',false,'Possui carrinho abandonado ou rascunho antigo'),
  ('marketing_permitido','Marketing permitido',false,'Customer Protection permite marketing no WhatsApp agora'),
  ('marketing_nao_permitido','Marketing não permitido',false,'Customer Protection bloqueia marketing no WhatsApp agora'),
  ('atendimento_problema','Em atendimento/problema',false,'Possui handoff aberto ou conversa marcada para humano'),
  ('baixa_qualidade_dados','Baixa qualidade de dados',false,'Completude cadastral operacional abaixo de 75%'),
  ('marca','Comprou marca específica',true,'Histórico contém compra da marca informada'),
  ('categoria','Comprou categoria específica',true,'Histórico contém compra da categoria informada')
) as x(segment_key,label,requires_value,description);

create or replace view public.customer_segment_facts_v1
with (security_invoker=true)
as
with dims as (
  select
    s.customer_id,
    array_agg(distinct p.brand order by p.brand)
      filter(where nullif(trim(coalesce(p.brand,'')),'') is not null) as purchased_brands,
    array_agg(distinct coalesce(
      nullif(trim(p.customer_subcategory),''),
      nullif(trim(p.subcategory),''),
      nullif(trim(p.customer_category),''),
      nullif(trim(p.category),''),
      nullif(trim(p.sales_category),'')
    ) order by coalesce(
      nullif(trim(p.customer_subcategory),''),
      nullif(trim(p.subcategory),''),
      nullif(trim(p.customer_category),''),
      nullif(trim(p.category),''),
      nullif(trim(p.sales_category),'')
    )) filter(where coalesce(
      nullif(trim(p.customer_subcategory),''),
      nullif(trim(p.subcategory),''),
      nullif(trim(p.customer_category),''),
      nullif(trim(p.category),''),
      nullif(trim(p.sales_category),'')
    ) is not null) as purchased_categories,
    bool_or(lower(concat_ws(' ',p.sales_category,p.customer_category,p.customer_subcategory,p.customer_subsubcategory,p.category,p.subcategory,p.subsubcategory)) like '%mercearia%') as has_mercearia,
    bool_or(
      lower(concat_ws(' ',p.sales_category,p.customer_category,p.customer_subcategory,p.customer_subsubcategory,p.category,p.subcategory,p.subsubcategory)) like '%lavander%'
      or lower(concat_ws(' ',p.sales_category,p.customer_category,p.customer_subcategory,p.customer_subsubcategory,p.category,p.subcategory,p.subsubcategory)) like '%limpeza%'
    ) as has_lavanderia,
    bool_or(
      lower(concat_ws(' ',p.sales_category,p.customer_category,p.customer_subcategory,p.customer_subsubcategory,p.category,p.subcategory,p.subsubcategory)) like '%higiene%'
      or lower(concat_ws(' ',p.sales_category,p.customer_category,p.customer_subcategory,p.customer_subsubcategory,p.category,p.subcategory,p.subsubcategory)) like '%beleza%'
    ) as has_higiene
  from public.customer_product_stats s
  join public.products p on p.id=s.product_id
  where s.purchase_count>0
  group by s.customer_id
),
conv as (
  select
    customer_id,
    count(*)::integer conversation_count,
    max(updated_at) last_conversation_at,
    bool_or(status='needs_human' or human_required=true or mode='human') has_human_service
  from public.conversations
  where customer_id is not null
  group by customer_id
),
cart as (
  select
    customer_id,
    bool_or(
      status='abandoned'
      or (status='draft' and updated_at<now()-interval '2 hours')
    ) has_incomplete_cart,
    max(updated_at) filter(where status in ('abandoned','draft')) last_incomplete_cart_at
  from public.carts
  where customer_id is not null
  group by customer_id
),
handoff as (
  select
    customer_id,
    bool_or(lower(coalesce(status,'')) not in ('resolved','closed','cancelled')) has_open_handoff
  from public.human_handoffs
  where customer_id is not null
  group by customer_id
),
address as (
  select customer_id,bool_or(is_active<>false) has_address
  from public.customer_addresses
  group by customer_id
),
purchase as (
  select
    c.id customer_id,
    coalesce(i.order_count,0) order_count,
    i.first_order_at,
    i.last_order_at,
    coalesce(i.days_since_last_order,case when i.last_order_at is not null then extract(day from now()-i.last_order_at)::integer else null end) days_since_last_order,
    i.average_ticket,
    i.lifetime_value,
    coalesce(seg.basket_orders,0) basket_orders,
    coalesce(seg.segments,'{}'::text[]) legacy_segments,
    coalesce(seg.reasons,'{}'::jsonb) legacy_reasons
  from public.customers c
  left join public.customer_purchase_intelligence_v1 i on i.customer_id=c.id
  left join public.customer_commercial_segments_v1 seg on seg.customer_id=c.id
)
select
  c.id customer_id,
  c.name,
  c.primary_whatsapp_e164,
  c.cpf_cnpj,
  c.is_active,
  p.order_count,
  p.first_order_at,
  p.last_order_at,
  p.days_since_last_order,
  p.average_ticket,
  p.lifetime_value,
  p.basket_orders,
  coalesce(d.purchased_brands,'{}'::text[]) purchased_brands,
  coalesce(d.purchased_categories,'{}'::text[]) purchased_categories,
  coalesce(d.has_mercearia,false) has_mercearia,
  coalesce(d.has_lavanderia,false) has_lavanderia,
  coalesce(d.has_higiene,false) has_higiene,
  coalesce(cv.conversation_count,0) conversation_count,
  cv.last_conversation_at,
  coalesce(cv.has_human_service,false) has_human_service,
  coalesce(ct.has_incomplete_cart,false) has_incomplete_cart,
  ct.last_incomplete_cart_at,
  coalesce(h.has_open_handoff,false) has_open_handoff,
  coalesce(a.has_address,false) has_address,
  round((
    (
      (nullif(trim(coalesce(c.name,'')),'') is not null)::int+
      (public.canonical_phone_br(c.primary_whatsapp_e164) is not null)::int+
      (nullif(regexp_replace(coalesce(c.cpf_cnpj,''),'[^0-9]','','g'),'') is not null)::int+
      coalesce(a.has_address,false)::int
    )::numeric/4*100
  ),2) data_quality_score,
  array_remove(array[
    case when p.order_count>0 then 'comprou_alguma_vez' end,
    case when p.order_count=1 then 'primeira_compra' end,
    case when p.order_count>=2 then 'recorrente' end,
    case when p.order_count>0 and coalesce(p.days_since_last_order,0)>=30 then 'sem_compra_30d' end,
    case when p.order_count>0 and coalesce(p.days_since_last_order,0)>=60 then 'sem_compra_60d' end,
    case when coalesce(d.has_mercearia,false) then 'mercearia' end,
    case when coalesce(d.has_lavanderia,false) then 'lavanderia' end,
    case when coalesce(d.has_higiene,false) then 'higiene' end,
    case when p.basket_orders>0 then 'cesta_basica' end,
    case when coalesce(cv.conversation_count,0)>0 and p.order_count=0 then 'falou_nao_comprou' end,
    case when coalesce(ct.has_incomplete_cart,false) then 'carrinho_nao_concluido' end,
    case when coalesce(cv.has_human_service,false) or coalesce(h.has_open_handoff,false) then 'atendimento_problema' end,
    case when (
      (
        (nullif(trim(coalesce(c.name,'')),'') is not null)::int+
        (public.canonical_phone_br(c.primary_whatsapp_e164) is not null)::int+
        (nullif(regexp_replace(coalesce(c.cpf_cnpj,''),'[^0-9]','','g'),'') is not null)::int+
        coalesce(a.has_address,false)::int
      )::numeric/4*100
    )<75 then 'baixa_qualidade_dados' end
  ],null)::text[] static_segments,
  p.legacy_segments,
  p.legacy_reasons
from public.customers c
join purchase p on p.customer_id=c.id
left join dims d on d.customer_id=c.id
left join conv cv on cv.customer_id=c.id
left join cart ct on ct.customer_id=c.id
left join handoff h on h.customer_id=c.id
left join address a on a.customer_id=c.id;

create or replace function public.get_customer_dynamic_segments_v1(
  p_customer_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  f public.customer_segment_facts_v1%rowtype;
  protection jsonb;
  all_segments text[];
begin
  select * into f from public.customer_segment_facts_v1 where customer_id=p_customer_id;
  if not found then raise exception 'customer_not_found'; end if;

  protection:=public.evaluate_customer_contact_eligibility_v1(p_customer_id,'whatsapp','marketing',now());

  select coalesce(array_agg(distinct x order by x),'{}'::text[])
  into all_segments
  from unnest(
    coalesce(f.static_segments,'{}'::text[])
    || coalesce(f.legacy_segments,'{}'::text[])
    || array[case when coalesce((protection->>'allowed')::boolean,false)
             then 'marketing_permitido' else 'marketing_nao_permitido' end]
  ) x
  where x is not null and x<>'';

  return jsonb_build_object(
    'customer_id',f.customer_id,
    'segments',to_jsonb(all_segments),
    'dimensions',jsonb_build_object(
      'brands',to_jsonb(coalesce(f.purchased_brands,'{}'::text[])),
      'categories',to_jsonb(coalesce(f.purchased_categories,'{}'::text[]))
    ),
    'facts',jsonb_build_object(
      'order_count',f.order_count,
      'first_order_at',f.first_order_at,
      'last_order_at',f.last_order_at,
      'days_since_last_order',f.days_since_last_order,
      'conversation_count',f.conversation_count,
      'last_conversation_at',f.last_conversation_at,
      'last_incomplete_cart_at',f.last_incomplete_cart_at,
      'data_quality_score',f.data_quality_score
    ),
    'legacy_reasons',f.legacy_reasons,
    'marketing',protection,
    'engine_version','cm1.8-v1'
  );
end;
$function$;

revoke all on function public.get_customer_dynamic_segments_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_customer_dynamic_segments_v1(uuid) to service_role;

create or replace function public.query_customer_segment_v1(
  p_segment_key text,
  p_value text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table(
  customer_id uuid,
  name text,
  primary_whatsapp_e164 text,
  order_count integer,
  last_order_at timestamptz,
  lifetime_value numeric,
  data_quality_score numeric,
  match_reason text
)
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_key text:=lower(btrim(coalesce(p_segment_key,'')));
  v_value text:=nullif(lower(btrim(coalesce(p_value,''))),'');
  v_requires_value boolean;
begin
  select requires_value into v_requires_value
  from public.customer_segment_registry_v1 where segment_key=v_key;
  if not found then raise exception 'invalid_segment_key'; end if;
  if v_requires_value and v_value is null then raise exception 'segment_value_required'; end if;

  return query
  with base as (
    select f.*,
      case when v_key in ('marketing_permitido','marketing_nao_permitido')
        then public.evaluate_customer_contact_eligibility_v1(f.customer_id,'whatsapp','marketing',now())
        else null::jsonb end protection
    from public.customer_segment_facts_v1 f
  ),
  matched as (
    select b.*,
      case
        when v_key='marca' then exists(
          select 1 from unnest(b.purchased_brands) x where lower(trim(x))=v_value
        )
        when v_key='categoria' then exists(
          select 1 from unnest(b.purchased_categories) x where lower(trim(x))=v_value
        )
        when v_key='marketing_permitido' then coalesce((b.protection->>'allowed')::boolean,false)
        when v_key='marketing_nao_permitido' then not coalesce((b.protection->>'allowed')::boolean,false)
        else v_key=any(coalesce(b.static_segments,'{}'::text[])||coalesce(b.legacy_segments,'{}'::text[]))
      end is_match
    from base b
  )
  select
    m.customer_id,m.name,m.primary_whatsapp_e164,m.order_count,m.last_order_at,m.lifetime_value,m.data_quality_score,
    case
      when v_key='marca' then 'Comprou a marca '||coalesce(p_value,'')
      when v_key='categoria' then 'Comprou a categoria '||coalesce(p_value,'')
      when v_key='marketing_permitido' then 'Customer Protection permitiu marketing no momento da consulta'
      when v_key='marketing_nao_permitido' then 'Customer Protection bloqueou marketing no momento da consulta'
      else coalesce(m.legacy_reasons->>v_key,
        (select r.description from public.customer_segment_registry_v1 r where r.segment_key=v_key),
        v_key)
    end match_reason
  from matched m
  where m.is_match
  order by m.last_order_at desc nulls last,m.lifetime_value desc,m.customer_id
  limit greatest(1,least(coalesce(p_limit,100),1000))
  offset greatest(0,coalesce(p_offset,0));
end;
$function$;

revoke all on function public.query_customer_segment_v1(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.query_customer_segment_v1(text,text,integer,integer) to service_role;

create or replace function public.segment_engine_summary_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  result jsonb:='{}'::jsonb;
  r record;
begin
  for r in
    select segment_key,label
    from public.customer_segment_registry_v1
    where requires_value=false
    order by segment_key
  loop
    if r.segment_key in ('marketing_permitido','marketing_nao_permitido') then
      result:=result||jsonb_build_object(
        r.segment_key,
        (select count(*) from public.query_customer_segment_v1(r.segment_key,null,1000,0))
      );
    else
      result:=result||jsonb_build_object(
        r.segment_key,
        (select count(*) from public.customer_segment_facts_v1 f
         where r.segment_key=any(coalesce(f.static_segments,'{}'::text[])||coalesce(f.legacy_segments,'{}'::text[])))
      );
    end if;
  end loop;
  return jsonb_build_object(
    'engine_version','cm1.8-v1',
    'customer_count',(select count(*) from public.customer_segment_facts_v1),
    'segments',result
  );
end;
$function$;

revoke all on function public.segment_engine_summary_v1() from public,anon,authenticated;
grant execute on function public.segment_engine_summary_v1() to service_role;
