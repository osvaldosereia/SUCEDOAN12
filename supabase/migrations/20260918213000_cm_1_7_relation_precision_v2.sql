-- CM-1.7 v2: precision pass after bootstrap review.
-- Fixes overly broad relations by using the operational taxonomy leaf (subsubcategory)
-- and shrinks purchase confidence when evidence comes from very few orders.

create or replace function public.get_product_relation_candidates_v1(
  p_product_id uuid,
  p_limit integer default 30
)
returns table(
  source_product_id uuid,
  target_product_id uuid,
  relation_type text,
  confidence numeric,
  source_kind text,
  source_key text,
  evidence jsonb
)
language sql
stable
security definer
set search_path=''
as $function$
with params as (
  select greatest(1,least(coalesce(p_limit,30),100)) lim
),
catalog as (
  select
    r.*,
    nullif(lower(trim(coalesce(p.category,''))),'') as operational_category,
    nullif(lower(trim(coalesce(p.subcategory,''))),'') as operational_subcategory,
    nullif(lower(trim(coalesce(p.subsubcategory,''))),'') as operational_leaf
  from public.product_marketing_readiness_v1 r
  join public.products p on p.id=r.product_id
),
src as (
  select * from catalog where product_id=p_product_id
),
catalog_candidates as (
  select
    s.product_id source_product_id,
    t.product_id target_product_id,
    case
      when nullif(trim(coalesce(s.product_line,'')),'') is not null
       and lower(s.product_line)=lower(t.product_line) then 'SAME_LINE'
      when s.operational_leaf is not null
       and s.operational_leaf=t.operational_leaf
       and nullif(trim(coalesce(s.brand,'')),'') is not null
       and lower(s.brand)=lower(t.brand) then 'SAME_LINE'
      when s.operational_leaf is not null
       and s.operational_leaf=t.operational_leaf
       and t.effective_price>s.effective_price*1.15
       and t.effective_price<=s.effective_price*2.00 then 'UPSELL'
      when s.operational_leaf is not null
       and s.operational_leaf=t.operational_leaf
       and t.effective_price<s.effective_price*0.85
       and t.effective_price>=s.effective_price*0.50 then 'DOWNSELL'
      when s.operational_leaf is not null
       and s.operational_leaf=t.operational_leaf
       and greatest(s.effective_price,t.effective_price)>0
       and least(s.effective_price,t.effective_price)/greatest(s.effective_price,t.effective_price)>=0.70
       then 'SUBSTITUTE'
      when s.operational_leaf is not null
       and s.operational_leaf=t.operational_leaf
       and nullif(trim(coalesce(s.brand,'')),'') is not null
       and nullif(trim(coalesce(t.brand,'')),'') is not null
       and lower(s.brand)<>lower(t.brand)
       and greatest(s.effective_price,t.effective_price)>0
       and least(s.effective_price,t.effective_price)/greatest(s.effective_price,t.effective_price)>=0.65
       then 'COMPATIBLE_BRAND'
      else null
    end relation_type,
    case
      when nullif(trim(coalesce(s.product_line,'')),'') is not null
       and lower(s.product_line)=lower(t.product_line) then 0.9700
      when s.operational_leaf is not null and s.operational_leaf=t.operational_leaf
       and nullif(trim(coalesce(s.brand,'')),'') is not null and lower(s.brand)=lower(t.brand) then 0.9200
      when s.operational_leaf is not null and s.operational_leaf=t.operational_leaf
       and t.effective_price>s.effective_price*1.15 and t.effective_price<=s.effective_price*2.00
        then least(0.8800::numeric,0.7000 + case when lower(coalesce(s.brand,''))=lower(coalesce(t.brand,'')) then 0.1000 else 0 end)
      when s.operational_leaf is not null and s.operational_leaf=t.operational_leaf
       and t.effective_price<s.effective_price*0.85 and t.effective_price>=s.effective_price*0.50
        then least(0.8800::numeric,0.7000 + case when lower(coalesce(s.brand,''))=lower(coalesce(t.brand,'')) then 0.1000 else 0 end)
      when s.operational_leaf is not null and s.operational_leaf=t.operational_leaf
       and greatest(s.effective_price,t.effective_price)>0
        then least(0.8800::numeric,0.6500 + (least(s.effective_price,t.effective_price)/greatest(s.effective_price,t.effective_price))*0.2300)
      else 0.5500
    end::numeric confidence,
    'rule'::text source_kind,
    'catalog_rule_v2'::text source_key,
    jsonb_build_object(
      'operational_leaf',s.operational_leaf,
      'source_operational_category',s.operational_category,
      'target_operational_category',t.operational_category,
      'source_operational_subcategory',s.operational_subcategory,
      'target_operational_subcategory',t.operational_subcategory,
      'source_brand',s.brand,
      'target_brand',t.brand,
      'source_price',s.effective_price,
      'target_price',t.effective_price,
      'source_price_tier',s.price_tier,
      'target_price_tier',t.price_tier,
      'rule_version','catalog_rule_v2'
    ) evidence
  from src s
  join catalog t on t.product_id<>s.product_id and t.marketing_eligible
  where s.marketing_eligible
),
order_presence as (
  select distinct oi.order_id,oi.product_id
  from public.order_items oi
  where oi.product_id is not null
),
source_orders as (
  select count(*)::numeric source_order_count
  from order_presence op
  where op.product_id=p_product_id
),
pairs as (
  select
    a.product_id source_product_id,
    b.product_id target_product_id,
    count(*)::numeric pair_orders
  from order_presence a
  join order_presence b on b.order_id=a.order_id and b.product_id<>a.product_id
  where a.product_id=p_product_id
  group by a.product_id,b.product_id
),
purchase_base as (
  select
    p.*,
    so.source_order_count,
    case when so.source_order_count>0 then p.pair_orders/so.source_order_count else 0 end support_ratio,
    least(1::numeric,p.pair_orders/5.0) evidence_strength
  from pairs p cross join source_orders so
),
purchase_candidates as (
  select
    p.source_product_id,
    p.target_product_id,
    'BOUGHT_TOGETHER'::text relation_type,
    least(0.9500::numeric,0.4500 + p.support_ratio*0.2500 + p.evidence_strength*0.2500)::numeric confidence,
    'purchase'::text source_kind,
    'order_cooccurrence_v2'::text source_key,
    jsonb_build_object(
      'pair_orders',p.pair_orders,
      'source_orders',p.source_order_count,
      'support_ratio',round(p.support_ratio,4),
      'evidence_strength',round(p.evidence_strength,4),
      'rule_version','order_cooccurrence_v2'
    ) evidence
  from purchase_base p

  union all

  select
    p.source_product_id,
    p.target_product_id,
    'COMPLEMENTARY'::text relation_type,
    least(0.9000::numeric,0.4000 + p.support_ratio*0.2500 + p.evidence_strength*0.2500)::numeric confidence,
    'purchase'::text source_kind,
    'cross_category_cooccurrence_v2'::text source_key,
    jsonb_build_object(
      'pair_orders',p.pair_orders,
      'source_orders',p.source_order_count,
      'support_ratio',round(p.support_ratio,4),
      'evidence_strength',round(p.evidence_strength,4),
      'source_operational_leaf',s.operational_leaf,
      'target_operational_leaf',t.operational_leaf,
      'source_category',s.category,
      'target_category',t.category,
      'rule_version','cross_category_cooccurrence_v2'
    ) evidence
  from purchase_base p
  join catalog s on s.product_id=p.source_product_id
  join catalog t on t.product_id=p.target_product_id
  where coalesce(s.operational_leaf,'')<>coalesce(t.operational_leaf,'')
),
combined as (
  select * from catalog_candidates where relation_type is not null
  union all
  select * from purchase_candidates
),
dedup as (
  select distinct on (source_product_id,target_product_id,relation_type)
    source_product_id,target_product_id,relation_type,confidence,source_kind,source_key,evidence
  from combined
  order by source_product_id,target_product_id,relation_type,confidence desc,
    case source_kind when 'purchase' then 0 else 1 end
)
select d.source_product_id,d.target_product_id,d.relation_type,d.confidence,d.source_kind,d.source_key,d.evidence
from dedup d
order by d.confidence desc,
  case d.relation_type
    when 'BOUGHT_TOGETHER' then 1 when 'SAME_LINE' then 2 when 'COMPLEMENTARY' then 3
    when 'SUBSTITUTE' then 4 when 'UPSELL' then 5 when 'DOWNSELL' then 6 else 7 end,
  d.target_product_id
limit (select lim from params);
$function$;

revoke all on function public.get_product_relation_candidates_v1(uuid,integer) from public,anon,authenticated;
grant execute on function public.get_product_relation_candidates_v1(uuid,integer) to service_role;

create or replace function public.materialize_product_relation_candidates_v1(
  p_product_id uuid,
  p_limit integer default 30,
  p_min_confidence numeric default 0.55
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_row record;
  v_seen integer:=0;
  v_inserted integer:=0;
  v_updated integer:=0;
  v_status text;
  v_existing uuid;
begin
  if p_product_id is null or not exists(select 1 from public.products where id=p_product_id) then
    raise exception 'product_not_found';
  end if;
  if coalesce(p_min_confidence,0)<0 or coalesce(p_min_confidence,0)>1 then raise exception 'invalid_confidence'; end if;

  for v_row in
    select * from public.get_product_relation_candidates_v1(p_product_id,p_limit)
    where confidence>=coalesce(p_min_confidence,0.55)
  loop
    v_seen:=v_seen+1;
    v_status:=case
      when v_row.relation_type='SAME_LINE' and v_row.confidence>=0.90 then 'active'
      when v_row.relation_type='BOUGHT_TOGETHER'
        and coalesce((v_row.evidence->>'pair_orders')::numeric,0)>=2
        and v_row.confidence>=0.70 then 'active'
      else 'suggested'
    end;

    select id into v_existing
    from public.product_relation_edges
    where source_product_id=v_row.source_product_id
      and target_product_id=v_row.target_product_id
      and relation_type=v_row.relation_type;

    insert into public.product_relation_edges(
      source_product_id,target_product_id,relation_type,confidence,source_kind,source_key,status,evidence,
      relation_version,first_seen_at,last_seen_at,created_at,updated_at
    )
    values(
      v_row.source_product_id,v_row.target_product_id,v_row.relation_type,v_row.confidence,
      v_row.source_kind,v_row.source_key,v_status,v_row.evidence,'cm1.7-v2',now(),now(),now(),now()
    )
    on conflict(source_product_id,target_product_id,relation_type) do update set
      confidence=case when public.product_relation_edges.source_kind='human'
        then public.product_relation_edges.confidence else excluded.confidence end,
      source_kind=case when public.product_relation_edges.source_kind='human'
        then public.product_relation_edges.source_kind else excluded.source_kind end,
      source_key=case when public.product_relation_edges.source_kind='human'
        then public.product_relation_edges.source_key else excluded.source_key end,
      status=case
        when public.product_relation_edges.status='rejected' then 'rejected'
        when public.product_relation_edges.source_kind='human' and public.product_relation_edges.status='active' then 'active'
        else excluded.status end,
      evidence=case when public.product_relation_edges.source_kind='human'
        then public.product_relation_edges.evidence||jsonb_build_object(
          'last_candidate_source',excluded.source_key,
          'last_candidate_confidence',excluded.confidence,
          'last_candidate_evidence',excluded.evidence
        )
        else excluded.evidence end,
      relation_version='cm1.7-v2',
      last_seen_at=now(),
      updated_at=now();

    if v_existing is null then v_inserted:=v_inserted+1; else v_updated:=v_updated+1; end if;
  end loop;

  return jsonb_build_object(
    'ok',true,'product_id',p_product_id,'candidates_seen',v_seen,
    'inserted',v_inserted,'updated',v_updated,'version','cm1.7-v2'
  );
end;
$function$;

revoke all on function public.materialize_product_relation_candidates_v1(uuid,integer,numeric) from public,anon,authenticated;
grant execute on function public.materialize_product_relation_candidates_v1(uuid,integer,numeric) to service_role;

-- Remove only unreviewed automatically generated v1 edges. Human-reviewed data is preserved.
delete from public.product_relation_edges
where reviewed_at is null
  and source_key in ('catalog_rule_v1','order_cooccurrence_v1','cross_category_cooccurrence_v1');
