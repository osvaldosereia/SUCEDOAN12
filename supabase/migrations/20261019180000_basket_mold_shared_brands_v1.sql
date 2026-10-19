-- Catálogo compartilhado de itens e marcas para as cinco cestas completas.
-- As quantidades permanecem em cada molde; as opções de marca são mantidas uma vez por item.
begin;

create table if not exists public.basket_mold_shared_items (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'cestas-completas',
  label text not null check (btrim(label) <> ''),
  sort_order integer not null default 0 check (sort_order >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope, label)
);

create table if not exists public.basket_mold_shared_item_options (
  id uuid primary key default gen_random_uuid(),
  shared_item_id uuid not null references public.basket_mold_shared_items(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  sort_order integer not null default 0 check (sort_order between 0 and 2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shared_item_id, product_id),
  unique (shared_item_id, sort_order)
);

create index if not exists basket_mold_shared_options_item_order_idx
  on public.basket_mold_shared_item_options(shared_item_id, sort_order);

alter table public.basket_mold_shared_items enable row level security;
alter table public.basket_mold_shared_item_options enable row level security;
revoke all on table public.basket_mold_shared_items from public, anon, authenticated;
revoke all on table public.basket_mold_shared_item_options from public, anon, authenticated;
grant select, insert, update, delete on table public.basket_mold_shared_items to service_role;
grant select, insert, update, delete on table public.basket_mold_shared_item_options to service_role;

-- Migra os rótulos existentes e as três opções de menor preço atuais, sem tocar nas quantidades.
with eligible as (
  select pos.label, pos.sort_order, opt.product_id,
         coalesce(p.offer_price, p.price, 0) as price,
         row_number() over (
           partition by pos.label, opt.product_id
           order by pos.sort_order, pos.id
         ) as duplicate_rank
  from public.basket_mold_positions pos
  join public.basket_molds m on m.id = pos.mold_id
  join public.basket_templates b on b.id = m.basket_id
  join public.basket_categories c on c.id = b.category_id and c.slug = 'cestas-completas'
  join public.basket_subcategories s on s.id = b.subcategory_id
  join public.basket_mold_position_options opt on opt.position_id = pos.id
  join public.products p on p.id = opt.product_id and p.is_active = true
  where s.name in ('Econômica','Mini Completa','Pequena Completa','Média Completa','Grande Completa')
), chosen as (
  select label, product_id, min(price) price
  from eligible
  where duplicate_rank = 1
  group by label, product_id
), labels as (
  select label, min(sort_order) sort_order
  from eligible
  group by label
)
insert into public.basket_mold_shared_items(scope,label,sort_order)
select 'cestas-completas', l.label, row_number() over (order by l.sort_order,l.label)-1
from labels l
on conflict (scope,label) do nothing;

with chosen as (
  select pos.label,opt.product_id,min(coalesce(p.offer_price,p.price,0)) price
  from public.basket_mold_positions pos
  join public.basket_molds m on m.id=pos.mold_id
  join public.basket_templates b on b.id=m.basket_id
  join public.basket_categories c on c.id=b.category_id and c.slug='cestas-completas'
  join public.basket_subcategories s on s.id=b.subcategory_id
  join public.basket_mold_position_options opt on opt.position_id=pos.id
  join public.products p on p.id=opt.product_id and p.is_active=true
  where s.name in ('Econômica','Mini Completa','Pequena Completa','Média Completa','Grande Completa')
  group by pos.label,opt.product_id
), ranked as (
  select i.id shared_item_id, c.product_id,
         row_number() over (partition by i.id order by c.price,c.product_id) as option_order
  from public.basket_mold_shared_items i
  join chosen c on c.label=i.label
  where i.scope='cestas-completas'
)
insert into public.basket_mold_shared_item_options(shared_item_id,product_id,sort_order)
select shared_item_id,product_id,option_order-1
from ranked where option_order<=3
on conflict (shared_item_id,product_id) do nothing;

-- Espelha a lista central nas posições já existentes apenas nos cinco moldes completos.
delete from public.basket_mold_position_options opt
using public.basket_mold_positions pos, public.basket_molds m,
      public.basket_templates b, public.basket_categories c, public.basket_subcategories s
where opt.position_id=pos.id and pos.mold_id=m.id and m.basket_id=b.id
  and b.category_id=c.id and b.subcategory_id=s.id and c.slug='cestas-completas'
  and s.name in ('Econômica','Mini Completa','Pequena Completa','Média Completa','Grande Completa')
  and exists(select 1 from public.basket_mold_shared_items i
    where i.scope='cestas-completas' and i.label=pos.label);

insert into public.basket_mold_position_options(position_id,product_id,sort_order,metadata)
select pos.id, opt.product_id, opt.sort_order, opt.metadata
from public.basket_mold_positions pos
join public.basket_molds m on m.id=pos.mold_id
join public.basket_templates b on b.id=m.basket_id
join public.basket_categories c on c.id=b.category_id and c.slug='cestas-completas'
join public.basket_subcategories s on s.id=b.subcategory_id
join public.basket_mold_shared_items i on i.scope='cestas-completas' and i.label=pos.label
join public.basket_mold_shared_item_options opt on opt.shared_item_id=i.id
where s.name in ('Econômica','Mini Completa','Pequena Completa','Média Completa','Grande Completa')
on conflict(position_id,product_id) do nothing;

create or replace function public.admin_basket_mold_shared_items_v1()
returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null or not exists(
    select 1 from public.admin_users a where a.user_id=v_uid and a.is_active and a.role<>'viewer'
  ) then raise exception 'admin_not_authorized'; end if;
  return jsonb_build_object('items',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',i.id,'label',i.label,'sort_order',i.sort_order,
      'options',coalesce((
        select jsonb_agg(jsonb_build_object(
          'product_id',p.id,'name',p.name,'brand',p.brand,'sku',p.sku,'gtin',p.gtin,
          'image_url',p.image_url,'price',p.price,'offer_price',p.offer_price,'is_offer',p.is_offer,
          'sort_order',o.sort_order
        ) order by o.sort_order,o.id)
        from public.basket_mold_shared_item_options o
        join public.products p on p.id=o.product_id
        where o.shared_item_id=i.id
      ),'[]'::jsonb)
    ) order by i.sort_order,i.label)
    from public.basket_mold_shared_items i where i.scope='cestas-completas'
  ),'[]'::jsonb));
end;
$function$;

create or replace function public.admin_save_basket_mold_shared_items_v1(p_items jsonb)
returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_item jsonb;
  v_option jsonb;
  v_item_id uuid;
  v_product_id uuid;
  v_label text;
  v_order integer;
  v_seen uuid[];
begin
  if v_uid is null or not exists(
    select 1 from public.admin_users a where a.user_id=v_uid and a.is_active and a.role<>'viewer'
  ) then raise exception 'admin_not_authorized'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>150 then
    raise exception 'basket_mold_shared_items_invalid';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_item_id:=nullif(v_item->>'id','')::uuid;
    v_label:=btrim(coalesce(v_item->>'label',''));
    if v_item_id is null or v_label='' or jsonb_typeof(v_item->'options')<>'array'
      or jsonb_array_length(v_item->'options')<1 or jsonb_array_length(v_item->'options')>3 then
      raise exception 'basket_mold_shared_item_invalid';
    end if;
    if not exists(select 1 from public.basket_mold_shared_items i
      where i.id=v_item_id and i.scope='cestas-completas') then
      raise exception 'basket_mold_shared_item_not_found';
    end if;
    v_seen:='{}'::uuid[];
    for v_option in select value from jsonb_array_elements(v_item->'options') loop
      v_product_id:=nullif(v_option->>'product_id','')::uuid;
      if v_product_id is null or v_product_id=any(v_seen)
        or not exists(select 1 from public.products p where p.id=v_product_id) then
        raise exception 'basket_mold_shared_product_invalid';
      end if;
      v_seen:=array_append(v_seen,v_product_id);
    end loop;
  end loop;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_item_id:=(v_item->>'id')::uuid;
    v_label:=btrim(v_item->>'label');
    update public.basket_mold_shared_items set label=v_label,updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('updated_by',v_uid)
      where id=v_item_id;
    delete from public.basket_mold_shared_item_options where shared_item_id=v_item_id;
    v_order:=0;
    for v_option in select value from jsonb_array_elements(v_item->'options') loop
      v_product_id:=(v_option->>'product_id')::uuid;
      insert into public.basket_mold_shared_item_options(shared_item_id,product_id,sort_order)
      values(v_item_id,v_product_id,v_order);
      v_order:=v_order+1;
    end loop;
    delete from public.basket_mold_position_options opt
    using public.basket_mold_positions pos,public.basket_molds m,
      public.basket_templates b,public.basket_categories c,public.basket_subcategories s
    where opt.position_id=pos.id and pos.mold_id=m.id and m.basket_id=b.id
      and b.category_id=c.id and b.subcategory_id=s.id and c.slug='cestas-completas'
      and s.name in ('Econômica','Mini Completa','Pequena Completa','Média Completa','Grande Completa')
      and pos.label=v_label;
    insert into public.basket_mold_position_options(position_id,product_id,sort_order)
    select pos.id,o.product_id,o.sort_order
    from public.basket_mold_positions pos
    join public.basket_molds m on m.id=pos.mold_id
    join public.basket_templates b on b.id=m.basket_id
    join public.basket_categories c on c.id=b.category_id and c.slug='cestas-completas'
    join public.basket_subcategories s on s.id=b.subcategory_id
    join public.basket_mold_shared_item_options o on o.shared_item_id=v_item_id
    where s.name in ('Econômica','Mini Completa','Pequena Completa','Média Completa','Grande Completa')
      and pos.label=v_label;
  end loop;
  return public.admin_basket_mold_shared_items_v1();
end;
$function$;

revoke all on function public.admin_basket_mold_shared_items_v1() from public,anon,authenticated;
revoke all on function public.admin_save_basket_mold_shared_items_v1(jsonb) from public,anon,authenticated;
grant execute on function public.admin_basket_mold_shared_items_v1() to service_role;
grant execute on function public.admin_save_basket_mold_shared_items_v1(jsonb) to service_role;
notify pgrst,'reload schema';
commit;