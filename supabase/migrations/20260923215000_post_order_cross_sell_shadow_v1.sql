-- Post-order cross-sell Shadow V1
-- Source of truth: Vitrine/Admin. No WhatsApp send and no order mutation in Shadow mode.

create table if not exists public.post_order_cross_sell_config (
  organization_id uuid primary key,
  enabled boolean not null default true,
  mode text not null default 'shadow' check (mode in ('off','shadow','test','canary','live')),
  expiry_offer_count integer not null default 5 check (expiry_offer_count between 0 and 10),
  regular_count integer not null default 5 check (regular_count between 0 and 10),
  total_limit integer not null default 10 check (total_limit between 1 and 10),
  basket_similarity_min numeric(5,2) not null default 85 check (basket_similarity_min between 0 and 100),
  max_component_changes integer not null default 3 check (max_component_changes between 0 and 50),
  max_standalone_product_lines integer not null default 3 check (max_standalone_product_lines between 0 and 50),
  max_basket_quantity numeric not null default 3 check (max_basket_quantity > 0),
  response_window_seconds integer not null default 180 check (response_window_seconds between 30 and 3600),
  regular_item_max_order_ratio numeric(6,4) not null default 0.15 check (regular_item_max_order_ratio between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.post_order_cross_sell_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  order_id uuid not null references public.orders(id) on delete cascade,
  mode text not null default 'shadow',
  status text not null default 'shadow_prepared',
  eligible boolean not null default false,
  basket_similarity numeric(5,2) not null default 0,
  basket_classification text not null default 'ineligible',
  changed_lines integer not null default 0,
  standalone_product_lines integer not null default 0,
  basket_quantity numeric not null default 0,
  selected_count integer not null default 0,
  ineligible_reason text,
  expires_at timestamptz,
  sent_at timestamptz,
  completed_at timestamptz,
  selected_numbers jsonb not null default '[]'::jsonb,
  accepted_product_count integer not null default 0,
  added_revenue_cents integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id,mode)
);

create table if not exists public.post_order_cross_sell_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.post_order_cross_sell_sessions(id) on delete cascade,
  position integer not null check (position between 1 and 10),
  product_id uuid not null references public.products(id),
  source_kind text not null check (source_kind in ('expiry_offer','regular')),
  name_snapshot text not null,
  sku_snapshot text,
  image_url_snapshot text,
  category_snapshot text,
  regular_price_cents integer not null check (regular_price_cents >= 0),
  offered_price_cents integer not null check (offered_price_cents >= 0),
  discount_percent numeric(6,2),
  expiration_date_snapshot date,
  stock_snapshot numeric not null default 0,
  offer_id uuid references public.offers(id),
  accepted boolean not null default false,
  accepted_quantity numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(session_id,position),
  unique(session_id,product_id)
);

create table if not exists public.post_order_cross_sell_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  session_id uuid references public.post_order_cross_sell_sessions(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists post_order_cross_sell_sessions_org_updated_idx on public.post_order_cross_sell_sessions(organization_id,updated_at desc);
create index if not exists post_order_cross_sell_sessions_order_idx on public.post_order_cross_sell_sessions(order_id);
create index if not exists post_order_cross_sell_items_session_idx on public.post_order_cross_sell_items(session_id,position);
create index if not exists post_order_cross_sell_items_product_idx on public.post_order_cross_sell_items(product_id);
create index if not exists post_order_cross_sell_items_offer_idx on public.post_order_cross_sell_items(offer_id) where offer_id is not null;
create index if not exists post_order_cross_sell_events_order_idx on public.post_order_cross_sell_events(order_id,created_at desc);
create index if not exists post_order_cross_sell_events_session_idx on public.post_order_cross_sell_events(session_id);

alter table public.post_order_cross_sell_config enable row level security;
alter table public.post_order_cross_sell_sessions enable row level security;
alter table public.post_order_cross_sell_items enable row level security;
alter table public.post_order_cross_sell_events enable row level security;

insert into public.post_order_cross_sell_config(organization_id,enabled,mode)
select distinct organization_id,true,'shadow'
from public.products
where organization_id is not null
on conflict (organization_id) do nothing;

CREATE OR REPLACE FUNCTION public.prepare_post_order_cross_sell_shadow_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_order public.orders%rowtype;
  v_cfg public.post_order_cross_sell_config%rowtype;
  v_session_id uuid;
  v_basket_count integer := 0;
  v_basket_qty numeric := 0;
  v_standalone_lines integer := 0;
  v_standard_units numeric := 0;
  v_matched_units numeric := 0;
  v_similarity numeric(5,2) := 0;
  v_changed_lines integer := 0;
  v_classification text := 'ineligible';
  v_eligible boolean := false;
  v_reason text := null;
  v_expiry_selected integer := 0;
  v_regular_selected integer := 0;
  v_today date := (timezone('America/Cuiaba',now()))::date;
begin
  select * into v_order from public.orders where id=p_order_id;
  if not found then return jsonb_build_object('ok',false,'error','order_not_found'); end if;

  select * into v_cfg from public.post_order_cross_sell_config where organization_id=v_order.organization_id;
  if not found then
    insert into public.post_order_cross_sell_config(organization_id,enabled,mode)
    values(v_order.organization_id,true,'shadow')
    on conflict (organization_id) do nothing;
    select * into v_cfg from public.post_order_cross_sell_config where organization_id=v_order.organization_id;
  end if;

  select count(*),coalesce(sum(quantity),0) into v_basket_count,v_basket_qty
  from public.order_items where order_id=p_order_id and item_kind='basket';

  select count(*) into v_standalone_lines
  from public.order_items where order_id=p_order_id and item_kind='product';

  with expected as (
    select bi.product_id, sum(bi.quantity * oi.quantity)::numeric as expected_qty
    from public.order_items oi
    join public.basket_items bi on bi.basket_id=oi.basket_id
    where oi.order_id=p_order_id and oi.item_kind='basket'
    group by bi.product_id
  ),
  actual as (
    select oic.product_id, sum(oic.quantity)::numeric as actual_qty
    from public.order_items oi
    join public.order_item_components oic on oic.order_item_id=oi.id
    where oi.order_id=p_order_id and oi.item_kind='basket' and oic.product_id is not null
    group by oic.product_id
  ),
  all_products as (
    select coalesce(e.product_id,a.product_id) as product_id,
           coalesce(e.expected_qty,0) as expected_qty,
           coalesce(a.actual_qty,0) as actual_qty
    from expected e full join actual a on a.product_id=e.product_id
  )
  select coalesce(sum(expected_qty),0),
         coalesce(sum(least(expected_qty,actual_qty)),0),
         count(*) filter (where abs(expected_qty-actual_qty)>0.0001)
  into v_standard_units,v_matched_units,v_changed_lines
  from all_products;

  if v_standard_units>0 then
    v_similarity:=round((v_matched_units/v_standard_units*100)::numeric,2);
  end if;

  if v_similarity>=99.99 and v_changed_lines=0 then v_classification:='normal';
  elsif v_similarity>=v_cfg.basket_similarity_min and v_changed_lines<=v_cfg.max_component_changes then v_classification:='near_normal';
  else v_classification:='modified'; end if;

  if not v_cfg.enabled or v_cfg.mode='off' then v_reason:='automation_disabled';
  elsif v_basket_count=0 then v_reason:='no_basket';
  elsif v_order.status in ('cancelled','returned','delivered') then v_reason:='terminal_order';
  elsif v_basket_qty>v_cfg.max_basket_quantity then v_reason:='bulk_basket_quantity';
  elsif v_standalone_lines>v_cfg.max_standalone_product_lines then v_reason:='too_many_standalone_products';
  elsif v_standard_units<=0 then v_reason:='basket_standard_missing';
  elsif v_classification not in ('normal','near_normal') then v_reason:='basket_too_modified';
  else v_eligible:=true; end if;

  insert into public.post_order_cross_sell_sessions(
    organization_id,order_id,mode,status,eligible,basket_similarity,basket_classification,
    changed_lines,standalone_product_lines,basket_quantity,selected_count,ineligible_reason,metadata,updated_at
  ) values(
    v_order.organization_id,p_order_id,'shadow',
    case when v_eligible then 'shadow_prepared' else 'ineligible' end,
    v_eligible,v_similarity,v_classification,v_changed_lines,v_standalone_lines,v_basket_qty,0,v_reason,
    jsonb_build_object('engine','shadow_v2','order_status',v_order.status,'evaluated_at',now()),now()
  )
  on conflict(order_id,mode) do update set
    organization_id=excluded.organization_id,status=excluded.status,eligible=excluded.eligible,
    basket_similarity=excluded.basket_similarity,basket_classification=excluded.basket_classification,
    changed_lines=excluded.changed_lines,standalone_product_lines=excluded.standalone_product_lines,
    basket_quantity=excluded.basket_quantity,selected_count=0,ineligible_reason=excluded.ineligible_reason,
    metadata=excluded.metadata,updated_at=now()
  returning id into v_session_id;

  delete from public.post_order_cross_sell_items where session_id=v_session_id;

  if v_eligible then
    with used_products as (
      select distinct product_id from (
        select oi.product_id from public.order_items oi
        where oi.order_id=p_order_id and oi.product_id is not null
        union all
        select oic.product_id from public.order_items oi
        join public.order_item_components oic on oic.order_item_id=oi.id
        where oi.order_id=p_order_id and oic.product_id is not null
      ) u
    ),
    candidates as (
      select p.id product_id,p.name,p.sku,p.image_url,p.sale_price_cents,p.stock_quantity,p.expiration_date,
             coalesce(p.metadata->>'sales_category',p.metadata->>'storefront_category','Outros') category,
             o.id offer_id,o.sale_price_cents offer_price,
             nullif(o.metadata->>'discount_percent','')::numeric discount_percent
      from public.products p
      join lateral (
        select x.* from public.offers x
        where x.organization_id=p.organization_id and x.product_id=p.id and x.active=true
          and coalesce(x.metadata->>'source','')='expiry_auto'
          and (x.starts_at is null or x.starts_at<=now())
          and (x.ends_at is null or x.ends_at>now())
        order by x.created_at desc limit 1
      ) o on true
      where p.organization_id=v_order.organization_id and p.active=true
        and coalesce(p.stock_quantity,0)>0 and p.sale_price_cents>0
        and p.expiration_date is not null and p.expiration_date>=v_today
        and p.auto_expiry_offer_enabled=true
        and not exists(select 1 from used_products u where u.product_id=p.id)
      order by p.expiration_date,p.stock_quantity,p.id
      limit least(v_cfg.expiry_offer_count,v_cfg.total_limit)
    )
    insert into public.post_order_cross_sell_items(
      session_id,position,product_id,source_kind,name_snapshot,sku_snapshot,image_url_snapshot,
      category_snapshot,regular_price_cents,offered_price_cents,discount_percent,
      expiration_date_snapshot,stock_snapshot,offer_id,metadata
    )
    select v_session_id,row_number() over(order by expiration_date,stock_quantity,product_id)::integer,
           product_id,'expiry_offer',name,sku,image_url,category,sale_price_cents,offer_price,
           coalesce(discount_percent,round((1-offer_price::numeric/nullif(sale_price_cents,0))*100,2)),
           expiration_date,stock_quantity,offer_id,jsonb_build_object('source','shadow_v2')
    from candidates;
    get diagnostics v_expiry_selected=row_count;

    with used_products as (
      select distinct product_id from (
        select oi.product_id from public.order_items oi
        where oi.order_id=p_order_id and oi.product_id is not null
        union all
        select oic.product_id from public.order_items oi
        join public.order_item_components oic on oic.order_item_id=oi.id
        where oi.order_id=p_order_id and oic.product_id is not null
        union all
        select i.product_id from public.post_order_cross_sell_items i where i.session_id=v_session_id
      ) u
    ),
    candidates as (
      select p.id product_id,p.name,p.sku,p.image_url,p.sale_price_cents,p.stock_quantity,
             coalesce(p.metadata->>'sales_category',p.metadata->>'storefront_category','Outros') category,
             case when v_order.total_cents>0
                       and p.sale_price_cents<=floor(v_order.total_cents*v_cfg.regular_item_max_order_ratio)
                  then 0 else 1 end price_bucket,
             md5(p_order_id::text||':'||p.id::text) deterministic_key
      from public.products p
      where p.organization_id=v_order.organization_id and p.active=true
        and coalesce(p.stock_quantity,0)>0 and p.sale_price_cents>0
        and not exists(select 1 from used_products u where u.product_id=p.id)
        and not exists(
          select 1 from public.offers o
          where o.organization_id=p.organization_id and o.product_id=p.id and o.active=true
            and (o.starts_at is null or o.starts_at<=now())
            and (o.ends_at is null or o.ends_at>now())
        )
    ),
    ranked as (
      select c.*,row_number() over(partition by category order by price_bucket,deterministic_key) category_rank
      from candidates c
    ),
    chosen as (
      select * from ranked
      order by category_rank,price_bucket,deterministic_key
      limit greatest(0,v_cfg.total_limit-v_expiry_selected)
    )
    insert into public.post_order_cross_sell_items(
      session_id,position,product_id,source_kind,name_snapshot,sku_snapshot,image_url_snapshot,
      category_snapshot,regular_price_cents,offered_price_cents,discount_percent,
      expiration_date_snapshot,stock_snapshot,offer_id,metadata
    )
    select v_session_id,
           (v_expiry_selected+row_number() over(order by category_rank,price_bucket,deterministic_key))::integer,
           product_id,'regular',name,sku,image_url,category,sale_price_cents,sale_price_cents,0,
           null,stock_quantity,null,jsonb_build_object('source','shadow_v2','selection','deterministic_diversity')
    from chosen;
    get diagnostics v_regular_selected=row_count;

    update public.post_order_cross_sell_sessions
    set selected_count=v_expiry_selected+v_regular_selected,updated_at=now()
    where id=v_session_id;
  end if;

  insert into public.post_order_cross_sell_events(organization_id,session_id,order_id,event_type,payload)
  values(v_order.organization_id,v_session_id,p_order_id,
    case when v_eligible then 'shadow_prepared' else 'shadow_ineligible' end,
    jsonb_build_object('engine','shadow_v2','classification',v_classification,'similarity',v_similarity,
      'changed_lines',v_changed_lines,'reason',v_reason,'expiry_selected',v_expiry_selected,
      'regular_selected',v_regular_selected));

  return jsonb_build_object('ok',true,'session_id',v_session_id,'eligible',v_eligible,
    'classification',v_classification,'similarity',v_similarity,'changed_lines',v_changed_lines,
    'reason',v_reason,'selected_count',v_expiry_selected+v_regular_selected,
    'expiry_selected',v_expiry_selected,'regular_selected',v_regular_selected);
end;
$function$


CREATE OR REPLACE FUNCTION public.list_post_order_cross_sell_shadow_v1(p_organization_id uuid, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
with limited as (
  select s.*
  from public.post_order_cross_sell_sessions s
  where s.organization_id=p_organization_id and s.mode='shadow'
  order by s.updated_at desc
  limit greatest(1,least(coalesce(p_limit,50),100))
),
summary as (
  select
    count(*)::integer as evaluated,
    count(*) filter(where eligible)::integer as eligible,
    count(*) filter(where not eligible)::integer as ineligible,
    count(*) filter(where basket_classification='normal')::integer as normal,
    count(*) filter(where basket_classification='near_normal')::integer as near_normal,
    round(coalesce(avg(selected_count),0),1) as avg_selected
  from limited
)
select jsonb_build_object(
  'summary',(select to_jsonb(summary) from summary),
  'sessions',coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id',l.id,
        'order_id',l.order_id,
        'order_number',o.order_number,
        'order_status',o.status,
        'order_total_cents',o.total_cents,
        'created_at',o.created_at,
        'updated_at',l.updated_at,
        'eligible',l.eligible,
        'status',l.status,
        'basket_similarity',l.basket_similarity,
        'basket_classification',l.basket_classification,
        'changed_lines',l.changed_lines,
        'standalone_product_lines',l.standalone_product_lines,
        'basket_quantity',l.basket_quantity,
        'selected_count',l.selected_count,
        'ineligible_reason',l.ineligible_reason,
        'basket_names',coalesce((
          select jsonb_agg(oi.name_snapshot order by oi.id)
          from public.order_items oi
          where oi.order_id=l.order_id and oi.item_kind='basket'
        ),'[]'::jsonb),
        'items',coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'position',i.position,
              'product_id',i.product_id,
              'source_kind',i.source_kind,
              'name',i.name_snapshot,
              'category',i.category_snapshot,
              'regular_price_cents',i.regular_price_cents,
              'offered_price_cents',i.offered_price_cents,
              'discount_percent',i.discount_percent,
              'expiration_date',i.expiration_date_snapshot,
              'stock',i.stock_snapshot
            ) order by i.position
          )
          from public.post_order_cross_sell_items i
          where i.session_id=l.id
        ),'[]'::jsonb)
      ) order by l.updated_at desc
    )
    from limited l
    join public.orders o on o.id=l.order_id
  ),'[]'::jsonb)
);
$function$


revoke all on public.post_order_cross_sell_config from anon,authenticated;
revoke all on public.post_order_cross_sell_sessions from anon,authenticated;
revoke all on public.post_order_cross_sell_items from anon,authenticated;
revoke all on public.post_order_cross_sell_events from anon,authenticated;
revoke all on function public.prepare_post_order_cross_sell_shadow_v1(uuid) from public,anon,authenticated;
revoke all on function public.list_post_order_cross_sell_shadow_v1(uuid,integer) from public,anon,authenticated;
grant execute on function public.prepare_post_order_cross_sell_shadow_v1(uuid) to service_role;
grant execute on function public.list_post_order_cross_sell_shadow_v1(uuid,integer) to service_role;
