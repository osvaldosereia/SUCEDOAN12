-- CM-1.7 Product/Brand Graph v1
-- Relations are versioned, evidence-based and reviewable. No AI relation becomes truth automatically.

create table if not exists public.product_relation_edges (
  id uuid primary key default gen_random_uuid(),
  source_product_id uuid not null references public.products(id) on delete cascade,
  target_product_id uuid not null references public.products(id) on delete cascade,
  relation_type text not null check (relation_type in (
    'SAME_LINE','COMPLEMENTARY','SUBSTITUTE','UPSELL','DOWNSELL','COMPATIBLE_BRAND','BOUGHT_TOGETHER'
  )),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  source_kind text not null check (source_kind in ('rule','purchase','ai','human')),
  source_key text not null,
  status text not null default 'suggested'
    check (status in ('suggested','active','rejected','superseded')),
  evidence jsonb not null default '{}'::jsonb,
  relation_version text not null default 'cm1.7-v1',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  reviewed_by uuid references public.admin_users(user_id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_product_id<>target_product_id),
  check (jsonb_typeof(evidence)='object'),
  unique(source_product_id,target_product_id,relation_type)
);

create index if not exists product_relation_edges_source_idx
  on public.product_relation_edges(source_product_id,status,relation_type,confidence desc);
create index if not exists product_relation_edges_target_idx
  on public.product_relation_edges(target_product_id,status,relation_type,confidence desc);

alter table public.product_relation_edges enable row level security;
revoke all on table public.product_relation_edges from public,anon,authenticated;
grant select,insert,update,delete on table public.product_relation_edges to service_role;

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
src as (
  select * from public.product_marketing_readiness_v1 where product_id=p_product_id
),
catalog_candidates as (
  select
    s.product_id source_product_id,
    t.product_id target_product_id,
    case
      when nullif(trim(coalesce(s.product_line,'')),'') is not null
       and s.product_line=t.product_line then 'SAME_LINE'
      when nullif(trim(coalesce(s.brand,'')),'') is not null
       and lower(s.brand)=lower(t.brand)
       and s.category=t.category
       and coalesce(s.subcategory,'')=coalesce(t.subcategory,'') then 'SAME_LINE'
      when s.category=t.category
       and coalesce(s.subcategory,'')=coalesce(t.subcategory,'')
       and t.effective_price>s.effective_price*1.15
       and t.effective_price<=s.effective_price*2.00 then 'UPSELL'
      when s.category=t.category
       and coalesce(s.subcategory,'')=coalesce(t.subcategory,'')
       and t.effective_price<s.effective_price*0.85
       and t.effective_price>=s.effective_price*0.50 then 'DOWNSELL'
      when s.category=t.category
       and coalesce(s.subcategory,'')=coalesce(t.subcategory,'')
       and greatest(s.effective_price,t.effective_price)>0
       and least(s.effective_price,t.effective_price)/greatest(s.effective_price,t.effective_price)>=0.70 then 'SUBSTITUTE'
      when s.category=t.category
       and coalesce(s.subcategory,'')=coalesce(t.subcategory,'')
       and nullif(trim(coalesce(s.brand,'')),'') is not null
       and nullif(trim(coalesce(t.brand,'')),'') is not null
       and lower(s.brand)<>lower(t.brand)
       and greatest(s.effective_price,t.effective_price)>0
       and least(s.effective_price,t.effective_price)/greatest(s.effective_price,t.effective_price)>=0.65 then 'COMPATIBLE_BRAND'
      else null
    end relation_type,
    case
      when nullif(trim(coalesce(s.product_line,'')),'') is not null and s.product_line=t.product_line then 0.9500
      when nullif(trim(coalesce(s.brand,'')),'') is not null and lower(s.brand)=lower(t.brand)
       and s.category=t.category and coalesce(s.subcategory,'')=coalesce(t.subcategory,'') then 0.8800
      when s.category=t.category and coalesce(s.subcategory,'')=coalesce(t.subcategory,'')
       and t.effective_price>s.effective_price*1.15 and t.effective_price<=s.effective_price*2.00
        then least(0.8500::numeric,0.6500 + case when lower(coalesce(s.brand,''))=lower(coalesce(t.brand,'')) then 0.1000 else 0 end)
      when s.category=t.category and coalesce(s.subcategory,'')=coalesce(t.subcategory,'')
       and t.effective_price<s.effective_price*0.85 and t.effective_price>=s.effective_price*0.50
        then least(0.8500::numeric,0.6500 + case when lower(coalesce(s.brand,''))=lower(coalesce(t.brand,'')) then 0.1000 else 0 end)
      when greatest(s.effective_price,t.effective_price)>0
        then least(0.8500::numeric,0.6200 + (least(s.effective_price,t.effective_price)/greatest(s.effective_price,t.effective_price))*0.2300)
      else 0.5500
    end::numeric confidence,
    'rule'::text source_kind,
    'catalog_rule_v1'::text source_key,
    jsonb_build_object(
      'source_category',s.category,
      'target_category',t.category,
      'source_subcategory',s.subcategory,
      'target_subcategory',t.subcategory,
      'source_brand',s.brand,
      'target_brand',t.brand,
      'source_price',s.effective_price,
      'target_price',t.effective_price,
      'source_price_tier',s.price_tier,
      'target_price_tier',t.price_tier
    ) evidence
  from src s
  join public.product_marketing_readiness_v1 t
    on t.product_id<>s.product_id
   and t.marketing_eligible
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
purchase_candidates as (
  select
    p.source_product_id,
    p.target_product_id,
    'BOUGHT_TOGETHER'::text relation_type,
    least(0.9800::numeric,0.5500 + case when so.source_order_count>0 then (p.pair_orders/so.source_order_count)*0.4300 else 0 end)::numeric confidence,
    'purchase'::text source_kind,
    'order_cooccurrence_v1'::text source_key,
    jsonb_build_object(
      'pair_orders',p.pair_orders,
      'source_orders',so.source_order_count,
      'support_ratio',case when so.source_order_count>0 then round(p.pair_orders/so.source_order_count,4) else 0 end
    ) evidence
  from pairs p cross join source_orders so

  union all

  select
    p.source_product_id,
    p.target_product_id,
    'COMPLEMENTARY'::text relation_type,
    least(0.9200::numeric,0.5000 + case when so.source_order_count>0 then (p.pair_orders/so.source_order_count)*0.4200 else 0 end)::numeric confidence,
    'purchase'::text source_kind,
    'cross_category_cooccurrence_v1'::text source_key,
    jsonb_build_object(
      'pair_orders',p.pair_orders,
      'source_orders',so.source_order_count,
      'source_category',s.category,
      'target_category',t.category,
      'source_subcategory',s.subcategory,
      'target_subcategory',t.subcategory
    ) evidence
  from pairs p
  cross join source_orders so
  join public.product_marketing_readiness_v1 s on s.product_id=p.source_product_id
  join public.product_marketing_readiness_v1 t on t.product_id=p.target_product_id
  where coalesce(s.category,'')<>coalesce(t.category,'')
     or coalesce(s.subcategory,'')<>coalesce(t.subcategory,'')
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
      when v_row.relation_type='SAME_LINE' and v_row.confidence>=0.85 then 'active'
      when v_row.relation_type='BOUGHT_TOGETHER' and coalesce((v_row.evidence->>'pair_orders')::numeric,0)>=2 then 'active'
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
      v_row.source_kind,v_row.source_key,v_status,v_row.evidence,'cm1.7-v1',now(),now(),now(),now()
    )
    on conflict(source_product_id,target_product_id,relation_type) do update set
      confidence=greatest(public.product_relation_edges.confidence,excluded.confidence),
      source_kind=case
        when public.product_relation_edges.source_kind='human' then public.product_relation_edges.source_kind
        when excluded.confidence>=public.product_relation_edges.confidence then excluded.source_kind
        else public.product_relation_edges.source_kind end,
      source_key=case
        when public.product_relation_edges.source_kind='human' then public.product_relation_edges.source_key
        when excluded.confidence>=public.product_relation_edges.confidence then excluded.source_key
        else public.product_relation_edges.source_key end,
      status=case
        when public.product_relation_edges.status in ('rejected','active') then public.product_relation_edges.status
        else excluded.status end,
      evidence=public.product_relation_edges.evidence||jsonb_build_object(
        'last_candidate_source',excluded.source_key,
        'last_candidate_confidence',excluded.confidence,
        'last_candidate_evidence',excluded.evidence
      ),
      relation_version='cm1.7-v1',
      last_seen_at=now(),
      updated_at=now();

    if v_existing is null then v_inserted:=v_inserted+1; else v_updated:=v_updated+1; end if;
  end loop;

  return jsonb_build_object(
    'ok',true,'product_id',p_product_id,'candidates_seen',v_seen,
    'inserted',v_inserted,'updated',v_updated,'version','cm1.7-v1'
  );
end;
$function$;

revoke all on function public.materialize_product_relation_candidates_v1(uuid,integer,numeric) from public,anon,authenticated;
grant execute on function public.materialize_product_relation_candidates_v1(uuid,integer,numeric) to service_role;

create or replace function public.get_product_relations_v1(
  p_product_id uuid,
  p_include_suggested boolean default true,
  p_min_confidence numeric default 0.55,
  p_limit integer default 50
)
returns table(
  edge_id uuid,
  relation_type text,
  confidence numeric,
  status text,
  source_kind text,
  source_key text,
  target_product_id uuid,
  target_name text,
  target_brand text,
  target_category text,
  target_subcategory text,
  target_effective_price numeric,
  target_marketing_eligible boolean,
  evidence jsonb,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $function$
with outgoing as (
  select e.*
  from public.product_relation_edges e
  where e.source_product_id=p_product_id
    and e.status<>'rejected' and e.status<>'superseded'
    and (p_include_suggested or e.status='active')
    and e.confidence>=coalesce(p_min_confidence,0.55)
),
incoming_symmetric as (
  select
    e.id,e.target_product_id as source_product_id,e.source_product_id as target_product_id,
    e.relation_type,e.confidence,e.source_kind,e.source_key,e.status,e.evidence,e.relation_version,
    e.first_seen_at,e.last_seen_at,e.reviewed_by,e.reviewed_at,e.review_notes,e.created_at,e.updated_at
  from public.product_relation_edges e
  where e.target_product_id=p_product_id
    and e.relation_type in ('SAME_LINE','COMPLEMENTARY','SUBSTITUTE','COMPATIBLE_BRAND','BOUGHT_TOGETHER')
    and e.status<>'rejected' and e.status<>'superseded'
    and (p_include_suggested or e.status='active')
    and e.confidence>=coalesce(p_min_confidence,0.55)
),
edges as (
  select * from outgoing
  union all
  select * from incoming_symmetric
),
dedup as (
  select distinct on (relation_type,target_product_id)
    *
  from edges
  order by relation_type,target_product_id,confidence desc,updated_at desc
)
select
  d.id,d.relation_type,d.confidence,d.status,d.source_kind,d.source_key,
  d.target_product_id,p.name,p.brand,r.category,r.subcategory,r.effective_price,r.marketing_eligible,
  d.evidence,d.updated_at
from dedup d
join public.products p on p.id=d.target_product_id
left join public.product_marketing_readiness_v1 r on r.product_id=d.target_product_id
order by d.confidence desc,d.relation_type,p.name
limit greatest(1,least(coalesce(p_limit,50),200));
$function$;

revoke all on function public.get_product_relations_v1(uuid,boolean,numeric,integer) from public,anon,authenticated;
grant execute on function public.get_product_relations_v1(uuid,boolean,numeric,integer) to service_role;

create or replace function public.review_product_relation_v1(
  p_edge_id uuid,
  p_status text,
  p_admin_user_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_status text:=lower(btrim(coalesce(p_status,'')));
  v_row public.product_relation_edges%rowtype;
begin
  if v_status not in ('active','rejected') then raise exception 'invalid_review_status'; end if;
  if not exists(
    select 1 from public.admin_users
    where user_id=p_admin_user_id and is_active=true and role in ('owner','operator')
  ) then raise exception 'admin_not_authorized'; end if;

  update public.product_relation_edges
  set status=v_status,reviewed_by=p_admin_user_id,reviewed_at=now(),
      review_notes=nullif(btrim(coalesce(p_notes,'')),''),
      source_kind=case when v_status='active' then 'human' else source_kind end,
      source_key=case when v_status='active' then 'human_review_v1' else source_key end,
      confidence=case when v_status='active' then greatest(confidence,0.9900) else confidence end,
      updated_at=now()
  where id=p_edge_id
  returning * into v_row;

  if not found then raise exception 'relation_not_found'; end if;
  return jsonb_build_object(
    'ok',true,'edge_id',v_row.id,'status',v_row.status,'confidence',v_row.confidence,
    'reviewed_at',v_row.reviewed_at,'relation_type',v_row.relation_type
  );
end;
$function$;

revoke all on function public.review_product_relation_v1(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.review_product_relation_v1(uuid,text,uuid,text) to service_role;

create or replace view public.brand_relation_graph_v1
with (security_invoker=true)
as
select
  p1.brand as source_brand,
  p2.brand as target_brand,
  e.relation_type,
  count(*)::bigint edge_count,
  round(avg(e.confidence),4) avg_confidence,
  max(e.confidence) max_confidence,
  max(e.updated_at) last_updated_at
from public.product_relation_edges e
join public.products p1 on p1.id=e.source_product_id
join public.products p2 on p2.id=e.target_product_id
where e.status in ('active','suggested')
  and nullif(trim(coalesce(p1.brand,'')),'') is not null
  and nullif(trim(coalesce(p2.brand,'')),'') is not null
group by p1.brand,p2.brand,e.relation_type;

create or replace function public.product_relation_graph_summary_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
select jsonb_build_object(
  'edges',(select count(*) from public.product_relation_edges),
  'active_edges',(select count(*) from public.product_relation_edges where status='active'),
  'suggested_edges',(select count(*) from public.product_relation_edges where status='suggested'),
  'reviewed_edges',(select count(*) from public.product_relation_edges where reviewed_at is not null),
  'by_type',coalesce((
    select jsonb_object_agg(relation_type,count)
    from (
      select relation_type,count(*)::bigint count
      from public.product_relation_edges
      group by relation_type
    ) x
  ),'{}'::jsonb),
  'version','cm1.7-v1'
)
$function$;

revoke all on function public.product_relation_graph_summary_v1() from public,anon,authenticated;
grant execute on function public.product_relation_graph_summary_v1() to service_role;
