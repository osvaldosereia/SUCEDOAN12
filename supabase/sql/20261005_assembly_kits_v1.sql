-- Dona Antônia · receitas internas reutilizáveis de kits v1
-- Kit interno é receita: este domínio não cria lote nem reserva estoque.
begin;

create table if not exists public.assembly_kits (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 180),
  type text not null check (type in ('food','cleaning_hygiene','other')),
  notes text null,
  source_kit_id uuid null references public.assembly_kits(id) on delete set null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assembly_kits_active_type_name_idx
  on public.assembly_kits(is_active,type,name);

create table if not exists public.assembly_kit_items (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references public.assembly_kits(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kit_id, product_id)
);

create index if not exists assembly_kit_items_product_idx
  on public.assembly_kit_items(product_id,kit_id);

create table if not exists public.assembly_search_chips (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(btrim(label)) between 1 and 80),
  query text not null check (length(btrim(query)) between 1 and 120),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists assembly_search_chips_label_lower_uidx
  on public.assembly_search_chips(lower(btrim(label))) where is_active=true;
create index if not exists assembly_search_chips_active_sort_idx
  on public.assembly_search_chips(is_active,sort_order,label);

alter table public.assembly_kits enable row level security;
alter table public.assembly_kit_items enable row level security;
alter table public.assembly_search_chips enable row level security;

revoke all on public.assembly_kits from public,anon,authenticated;
revoke all on public.assembly_kit_items from public,anon,authenticated;
revoke all on public.assembly_search_chips from public,anon,authenticated;
grant all on public.assembly_kits to service_role;
grant all on public.assembly_kit_items to service_role;
grant all on public.assembly_search_chips to service_role;

create or replace function public.save_assembly_kit_v1(
  p_kit_id uuid,
  p_name text,
  p_type text,
  p_notes text,
  p_source_kit_id uuid,
  p_items jsonb,
  p_operator text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_kit_id uuid;
  v_name text:=btrim(coalesce(p_name,''));
  v_type text:=btrim(coalesce(p_type,''));
  v_notes text:=nullif(btrim(coalesce(p_notes,'')),'');
  v_operator text:=coalesce(nullif(btrim(coalesce(p_operator,'')),''),'Operação');
  v_item jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_saved public.assembly_kits%rowtype;
begin
  if length(v_name)<1 or length(v_name)>180 then raise exception 'assembly_kit_name_invalid'; end if;
  if v_type not in ('food','cleaning_hygiene','other') then raise exception 'assembly_kit_type_invalid'; end if;
  if jsonb_typeof(coalesce(p_items,'null'::jsonb))<>'array'
     or jsonb_array_length(p_items)<1
     or jsonb_array_length(p_items)>200 then
    raise exception 'assembly_kit_items_invalid';
  end if;
  if p_source_kit_id is not null and p_source_kit_id=p_kit_id then
    raise exception 'assembly_kit_source_self';
  end if;
  if p_source_kit_id is not null and not exists(
    select 1 from public.assembly_kits k where k.id=p_source_kit_id
  ) then
    raise exception 'assembly_kit_source_not_found';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id:=(v_item->>'product_id')::uuid;
      v_qty:=(v_item->>'quantity')::numeric;
    exception when others then
      raise exception 'assembly_kit_item_invalid';
    end;
    if v_qty<=0 or v_qty>999 then raise exception 'assembly_kit_item_quantity_invalid'; end if;
    if not exists(
      select 1 from public.products p where p.id=v_product_id and p.is_active=true
    ) then
      raise exception 'assembly_kit_product_unavailable:%',v_product_id;
    end if;
  end loop;

  if p_kit_id is null then
    insert into public.assembly_kits(name,type,notes,source_kit_id,is_active,metadata)
    values(v_name,v_type,v_notes,p_source_kit_id,true,
      jsonb_build_object('created_by',v_operator,'created_via','assembly_kit_builder_v1'))
    returning id into v_kit_id;
  else
    select k.id into v_kit_id
    from public.assembly_kits k
    where k.id=p_kit_id
    for update;
    if v_kit_id is null then raise exception 'assembly_kit_not_found'; end if;

    update public.assembly_kits
    set name=v_name,
        type=v_type,
        notes=v_notes,
        source_kit_id=p_source_kit_id,
        is_active=true,
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('updated_by',v_operator),
        updated_at=now()
    where id=v_kit_id;
  end if;

  delete from public.assembly_kit_items where kit_id=v_kit_id;

  insert into public.assembly_kit_items(kit_id,product_id,quantity,sort_order)
  select v_kit_id,product_id,sum(quantity)::numeric,min(sort_order)::integer
  from (
    select
      (e.value->>'product_id')::uuid as product_id,
      (e.value->>'quantity')::numeric as quantity,
      coalesce(nullif(e.value->>'sort_order','')::integer,e.ordinality::integer-1) as sort_order
    from jsonb_array_elements(p_items) with ordinality as e(value,ordinality)
  ) raw
  group by product_id;

  select * into v_saved from public.assembly_kits where id=v_kit_id;
  return jsonb_build_object(
    'ok',true,
    'kit',jsonb_build_object(
      'id',v_saved.id,'name',v_saved.name,'type',v_saved.type,'notes',v_saved.notes,
      'source_kit_id',v_saved.source_kit_id,'is_active',v_saved.is_active,
      'created_at',v_saved.created_at,'updated_at',v_saved.updated_at
    ),
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',i.id,'product_id',i.product_id,'quantity',i.quantity,'sort_order',i.sort_order
      ) order by i.sort_order,i.id)
      from public.assembly_kit_items i where i.kit_id=v_kit_id
    ),'[]'::jsonb),
    'item_count',(select count(*) from public.assembly_kit_items i where i.kit_id=v_kit_id)
  );
end;
$function$;

create or replace function public.archive_assembly_kit_v1(
  p_kit_id uuid,
  p_operator text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_operator text:=coalesce(nullif(btrim(coalesce(p_operator,'')),''),'Operação');
  v_in_use boolean:=false;
begin
  if p_kit_id is null then raise exception 'assembly_kit_required'; end if;
  perform 1 from public.assembly_kits where id=p_kit_id for update;
  if not found then raise exception 'assembly_kit_not_found'; end if;

  if to_regclass('public.store_basket_recipe_kits') is not null then
    execute 'select exists(
      select 1
      from public.store_basket_recipe_kits r
      join public.basket_templates b on b.id=r.basket_id
      where r.kit_id=$1 and b.is_active=true
    )' into v_in_use using p_kit_id;
    if v_in_use then raise exception 'assembly_kit_in_use'; end if;
  end if;

  update public.assembly_kits
  set is_active=false,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('archived_by',v_operator,'archived_at',now()),
      updated_at=now()
  where id=p_kit_id;

  return jsonb_build_object('ok',true,'kit_id',p_kit_id,'is_active',false);
end;
$function$;

revoke all on function public.save_assembly_kit_v1(uuid,text,text,text,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_assembly_kit_v1(uuid,text,text,text,uuid,jsonb,text) to service_role;
revoke all on function public.archive_assembly_kit_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.archive_assembly_kit_v1(uuid,text) to service_role;

commit;
