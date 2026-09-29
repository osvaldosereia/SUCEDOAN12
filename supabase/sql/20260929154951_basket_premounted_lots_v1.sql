
-- Dona Antonia · Cestas pre-montadas por lote v1
create table if not exists public.basket_template_item_alternatives (
  id uuid primary key default gen_random_uuid(),
  template_item_id uuid not null references public.basket_template_items(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  priority integer not null default 100 check (priority between 1 and 9999),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(template_item_id, product_id)
);

create table if not exists public.basket_stock_lots (
  id uuid primary key default gen_random_uuid(),
  basket_id uuid not null references public.basket_templates(id) on delete restrict,
  lot_code text not null unique,
  status text not null default 'ready' check (status in ('draft','ready','depleted','cancelled')),
  quantity_built integer not null check (quantity_built > 0),
  quantity_available integer not null check (quantity_available >= 0),
  composition_hash text,
  built_at timestamptz not null default now(),
  built_by text,
  notes text,
  source text not null default 'admin' check (source in ('admin','bootstrap_existing','import')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (quantity_available <= quantity_built)
);

create table if not exists public.basket_stock_lot_items (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.basket_stock_lots(id) on delete cascade,
  source_template_item_id uuid references public.basket_template_items(id) on delete set null,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity_per_basket numeric(14,3) not null check (quantity_per_basket > 0),
  position_order integer not null default 0,
  substitution_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.basket_stock_allocations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  basket_id uuid not null references public.basket_templates(id) on delete restrict,
  lot_id uuid not null references public.basket_stock_lots(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  status text not null default 'allocated' check (status in ('allocated','consumed','released')),
  component_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  released_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique(order_id, lot_id)
);

create index if not exists basket_lots_basket_ready_idx
  on public.basket_stock_lots(basket_id,status,built_at,created_at);
create index if not exists basket_lot_items_lot_idx
  on public.basket_stock_lot_items(lot_id,position_order);
create index if not exists basket_lot_items_product_idx
  on public.basket_stock_lot_items(product_id);
create index if not exists basket_allocations_order_idx
  on public.basket_stock_allocations(order_id,status);
create index if not exists basket_allocations_lot_idx
  on public.basket_stock_allocations(lot_id,status);
create index if not exists basket_alternatives_item_idx
  on public.basket_template_item_alternatives(template_item_id,priority);

alter table public.basket_template_item_alternatives enable row level security;
alter table public.basket_stock_lots enable row level security;
alter table public.basket_stock_lot_items enable row level security;
alter table public.basket_stock_allocations enable row level security;

revoke all on public.basket_template_item_alternatives from anon,authenticated;
revoke all on public.basket_stock_lots from anon,authenticated;
revoke all on public.basket_stock_lot_items from anon,authenticated;
revoke all on public.basket_stock_allocations from anon,authenticated;
grant all on public.basket_template_item_alternatives to service_role;
grant all on public.basket_stock_lots to service_role;
grant all on public.basket_stock_lot_items to service_role;
grant all on public.basket_stock_allocations to service_role;

create or replace view public.basket_locked_component_stock_v1
with (security_invoker=true)
as
with available_lots as (
  select li.product_id,
         sum(li.quantity_per_basket * l.quantity_available)::numeric as qty
  from public.basket_stock_lots l
  join public.basket_stock_lot_items li on li.lot_id=l.id
  where l.status in ('ready','depleted') and l.quantity_available>0
  group by li.product_id
),
active_allocations as (
  select li.product_id,
         sum(li.quantity_per_basket * a.quantity)::numeric as qty
  from public.basket_stock_allocations a
  join public.basket_stock_lot_items li on li.lot_id=a.lot_id
  where a.status='allocated'
  group by li.product_id
)
select p.id as product_id,
       coalesce(a.qty,0)+coalesce(x.qty,0) as basket_locked_quantity
from public.products p
left join available_lots a on a.product_id=p.id
left join active_allocations x on x.product_id=p.id
where coalesce(a.qty,0)+coalesce(x.qty,0)>0;

revoke all on public.basket_locked_component_stock_v1 from public,anon,authenticated;
grant select on public.basket_locked_component_stock_v1 to service_role;

create or replace view public.ops2_loose_sellable_stock_v1
with (security_invoker=true)
as
select s.*,
       coalesce(l.basket_locked_quantity,0)::numeric as basket_locked_quantity,
       greatest(0,coalesce(s.effective_sellable_stock,0)-coalesce(l.basket_locked_quantity,0))::numeric as loose_sellable_stock
from public.ops2_sellable_stock_v1 s
left join public.basket_locked_component_stock_v1 l on l.product_id=s.product_id;

revoke all on public.ops2_loose_sellable_stock_v1 from public,anon,authenticated;
grant select on public.ops2_loose_sellable_stock_v1 to service_role;

create or replace view public.basket_current_lot_v1
with (security_invoker=true)
as
select distinct on (l.basket_id)
  l.basket_id,l.id as lot_id,l.lot_code,l.quantity_built,l.quantity_available,
  l.composition_hash,l.built_at,l.built_by,l.source,l.metadata
from public.basket_stock_lots l
where l.status='ready' and l.quantity_available>0
order by l.basket_id,l.built_at,l.created_at,l.id;

revoke all on public.basket_current_lot_v1 from public,anon,authenticated;
grant select on public.basket_current_lot_v1 to service_role;

create or replace function public.create_basket_stock_lot_v1(
  p_basket_id uuid,
  p_quantity integer,
  p_items jsonb,
  p_operator text default null,
  p_notes text default null,
  p_source text default 'admin',
  p_allow_stock_gap boolean default false
) returns jsonb
language plpgsql
set search_path to ''
as $$
declare
  v_basket public.basket_templates%rowtype;
  v_lot_id uuid:=gen_random_uuid();
  v_code text;
  v_item jsonb;
  v_product_id uuid;
  v_template_item_id uuid;
  v_qty numeric;
  v_available numeric;
  v_required numeric;
  v_hash text;
  v_gap jsonb:='[]'::jsonb;
  v_count integer:=0;
begin
  if p_basket_id is null then raise exception 'invalid_basket'; end if;
  if coalesce(p_quantity,0)<=0 or p_quantity>500 then raise exception 'invalid_lot_quantity'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then
    raise exception 'empty_lot_composition';
  end if;

  select * into v_basket from public.basket_templates where id=p_basket_id and is_active=true;
  if not found then raise exception 'basket_not_found'; end if;

  v_hash:=md5(coalesce(p_items::text,'[]'));
  v_code:='CB-'||to_char(clock_timestamp() at time zone 'America/Cuiaba','YYMMDD')||'-'
          ||lpad(coalesce(v_basket.sort_order,0)::text,2,'0')||'-'
          ||upper(substr(replace(v_lot_id::text,'-',''),1,4));

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin v_product_id:=(v_item->>'product_id')::uuid;
    exception when others then raise exception 'invalid_lot_product'; end;
    begin v_template_item_id:=nullif(v_item->>'template_item_id','')::uuid;
    exception when others then v_template_item_id:=null; end;
    begin v_qty:=coalesce(nullif(v_item->>'quantity_per_basket','')::numeric,0);
    exception when others then raise exception 'invalid_lot_component_quantity'; end;
    if v_qty<=0 or v_qty>100 then raise exception 'invalid_lot_component_quantity'; end if;
    if not exists(select 1 from public.products where id=v_product_id and is_active=true) then
      raise exception 'lot_product_unavailable';
    end if;
    if v_template_item_id is not null and not exists(
      select 1 from public.basket_template_items
      where id=v_template_item_id and basket_id=p_basket_id
    ) then raise exception 'invalid_template_item'; end if;

    select loose_sellable_stock into v_available
    from public.ops2_loose_sellable_stock_v1
    where product_id=v_product_id;
    v_required:=v_qty*p_quantity;
    if coalesce(v_available,0)<v_required then
      v_gap:=v_gap||jsonb_build_array(jsonb_build_object(
        'product_id',v_product_id,'available',coalesce(v_available,0),
        'required',v_required,'shortage',v_required-coalesce(v_available,0)
      ));
      if not p_allow_stock_gap then raise exception 'insufficient_loose_stock'; end if;
    end if;
    v_count:=v_count+1;
  end loop;

  insert into public.basket_stock_lots(
    id,basket_id,lot_code,status,quantity_built,quantity_available,
    composition_hash,built_at,built_by,notes,source,metadata
  ) values(
    v_lot_id,p_basket_id,v_code,'ready',p_quantity,p_quantity,
    v_hash,now(),nullif(trim(coalesce(p_operator,'')),''),
    nullif(trim(coalesce(p_notes,'')),''),
    case when p_source in ('admin','bootstrap_existing','import') then p_source else 'admin' end,
    jsonb_build_object('stock_gap_at_creation',v_gap,'component_count',v_count)
  );

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id:=(v_item->>'product_id')::uuid;
    begin v_template_item_id:=nullif(v_item->>'template_item_id','')::uuid;
    exception when others then v_template_item_id:=null; end;
    v_qty:=(v_item->>'quantity_per_basket')::numeric;
    insert into public.basket_stock_lot_items(
      lot_id,source_template_item_id,product_id,quantity_per_basket,
      position_order,substitution_reason,metadata
    ) values(
      v_lot_id,v_template_item_id,v_product_id,v_qty,
      coalesce(nullif(v_item->>'position_order','')::integer,0),
      nullif(trim(coalesce(v_item->>'substitution_reason','')),''),
      jsonb_build_object(
        'template_product_id',nullif(v_item->>'template_product_id',''),
        'is_substitution',coalesce((v_item->>'is_substitution')::boolean,false)
      )
    );
  end loop;

  return jsonb_build_object(
    'ok',true,'lot_id',v_lot_id,'lot_code',v_code,
    'quantity_built',p_quantity,'stock_gap',v_gap
  );
end;
$$;

revoke all on function public.create_basket_stock_lot_v1(uuid,integer,jsonb,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.create_basket_stock_lot_v1(uuid,integer,jsonb,text,text,text,boolean) to service_role;

create or replace function public.sync_basket_allocations_from_order_status_v1()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  r record;
begin
  if new.status='cancelled' and old.status is distinct from 'cancelled' then
    for r in
      select id,lot_id,quantity from public.basket_stock_allocations
      where order_id=new.id and status='allocated'
      for update
    loop
      update public.basket_stock_allocations
         set status='released',released_at=now()
       where id=r.id;
      update public.basket_stock_lots
         set quantity_available=least(quantity_built,quantity_available+r.quantity),
             status='ready',updated_at=now()
       where id=r.lot_id;
    end loop;
  elsif new.status='out_for_delivery' and old.status is distinct from 'out_for_delivery' then
    update public.basket_stock_allocations
       set status='consumed',consumed_at=now()
     where order_id=new.id and status='allocated';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_basket_allocations_order_status on public.orders;
create trigger trg_sync_basket_allocations_order_status
after update of status on public.orders
for each row execute function public.sync_basket_allocations_from_order_status_v1();

revoke all on function public.sync_basket_allocations_from_order_status_v1() from public,anon,authenticated;
grant execute on function public.sync_basket_allocations_from_order_status_v1() to service_role;

