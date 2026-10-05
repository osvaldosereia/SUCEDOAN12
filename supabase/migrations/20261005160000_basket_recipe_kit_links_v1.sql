-- Dona Antônia · vínculo entre modelos comerciais e receitas internas de kits v1
-- Configurar uma receita no modelo NÃO reserva estoque. Reserva continua exclusiva do lote físico.
begin;

create table if not exists public.store_basket_recipe_kits (
  id uuid primary key default gen_random_uuid(),
  basket_id uuid not null references public.basket_templates(id) on delete cascade,
  kit_id uuid not null references public.assembly_kits(id) on delete restrict,
  quantity numeric(14,3) not null default 1 check (quantity > 0 and quantity <= 100),
  is_required boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (basket_id, kit_id)
);

create index if not exists store_basket_recipe_kits_basket_sort_idx
  on public.store_basket_recipe_kits(basket_id,sort_order,id);
create index if not exists store_basket_recipe_kits_kit_idx
  on public.store_basket_recipe_kits(kit_id,basket_id);

alter table public.store_basket_recipe_kits enable row level security;
revoke all on public.store_basket_recipe_kits from public,anon,authenticated;
grant all on public.store_basket_recipe_kits to service_role;

create or replace function public.basket_recipe_kits_v1(p_basket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_kits jsonb;
begin
  if p_basket_id is null or not exists(
    select 1 from public.basket_templates b where b.id=p_basket_id
  ) then raise exception 'basket_not_found'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'link_id',r.id,
    'kit_id',k.id,
    'name',k.name,
    'type',k.type,
    'quantity',r.quantity,
    'is_required',r.is_required,
    'sort_order',r.sort_order,
    'item_count',coalesce(stats.item_count,0),
    'unit_cost_total',coalesce(stats.cost_total,0),
    'unit_sale_total',coalesce(stats.sale_total,0),
    'cost_total',round(coalesce(stats.cost_total,0)*r.quantity,2),
    'sale_total',round(coalesce(stats.sale_total,0)*r.quantity,2),
    'items',coalesce(stats.items,'[]'::jsonb)
  ) order by r.sort_order,r.id),'[]'::jsonb)
  into v_kits
  from public.store_basket_recipe_kits r
  join public.assembly_kits k on k.id=r.kit_id
  left join lateral (
    select
      count(*)::integer as item_count,
      round(coalesce(sum(i.quantity*coalesce(p.cost,0)),0),2) as cost_total,
      round(coalesce(sum(i.quantity*coalesce(p.price,0)),0),2) as sale_total,
      coalesce(jsonb_agg(jsonb_build_object(
        'product_id',i.product_id,
        'quantity',i.quantity,
        'sort_order',i.sort_order,
        'name',p.name,
        'sku',p.sku,
        'gtin',p.gtin,
        'packaging',p.packaging,
        'image_url',p.image_url,
        'cost_price',coalesce(p.cost,0),
        'sale_price',coalesce(p.price,0)
      ) order by i.sort_order,i.id),'[]'::jsonb) as items
    from public.assembly_kit_items i
    join public.products p on p.id=i.product_id
    where i.kit_id=k.id
  ) stats on true
  where r.basket_id=p_basket_id;

  return jsonb_build_object('ok',true,'basket_id',p_basket_id,'kits',v_kits);
end;
$function$;

create or replace function public.save_basket_recipe_kits_v1(
  p_basket_id uuid,
  p_kits jsonb,
  p_operator text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item jsonb;
  v_kit_id uuid;
  v_quantity numeric;
  v_required boolean;
  v_position integer:=0;
  v_seen uuid[]:=array[]::uuid[];
  v_operator text:=coalesce(nullif(btrim(coalesce(p_operator,'')),''),'Operação');
begin
  if p_basket_id is null or not exists(
    select 1 from public.basket_templates b where b.id=p_basket_id and b.is_active=true
  ) then raise exception 'basket_not_found'; end if;

  if jsonb_typeof(coalesce(p_kits,'null'::jsonb))<>'array'
     or jsonb_array_length(p_kits)>20 then
    raise exception 'basket_recipe_kits_invalid';
  end if;

  for v_item in select value from jsonb_array_elements(p_kits)
  loop
    begin
      v_kit_id:=(v_item->>'kit_id')::uuid;
    exception when others then
      raise exception 'basket_recipe_kit_invalid';
    end;

    if v_kit_id=any(v_seen) then raise exception 'basket_recipe_kit_duplicate'; end if;
    v_seen:=array_append(v_seen,v_kit_id);

    if not exists(
      select 1 from public.assembly_kits k where k.id=v_kit_id and k.is_active=true
    ) then raise exception 'basket_recipe_kit_unavailable'; end if;

    begin
      v_quantity:=coalesce(nullif(v_item->>'quantity','')::numeric,1);
    exception when others then
      raise exception 'basket_recipe_kit_quantity_invalid';
    end;
    if v_quantity<=0 or v_quantity>100 then raise exception 'basket_recipe_kit_quantity_invalid'; end if;

    begin
      v_required:=coalesce((v_item->>'is_required')::boolean,true);
    exception when others then
      raise exception 'basket_recipe_kit_required_invalid';
    end;

    v_position:=v_position+1;
  end loop;

  delete from public.store_basket_recipe_kits where basket_id=p_basket_id;

  v_position:=0;
  for v_item in select value from jsonb_array_elements(p_kits)
  loop
    v_kit_id:=(v_item->>'kit_id')::uuid;
    v_quantity:=coalesce(nullif(v_item->>'quantity','')::numeric,1);
    v_required:=coalesce((v_item->>'is_required')::boolean,true);

    insert into public.store_basket_recipe_kits(
      basket_id,kit_id,quantity,is_required,sort_order,metadata
    ) values (
      p_basket_id,v_kit_id,v_quantity,v_required,v_position,
      jsonb_build_object('linked_by',v_operator,'linked_at',now())
    );
    v_position:=v_position+1;
  end loop;

  return public.basket_recipe_kits_v1(p_basket_id);
end;
$function$;

revoke all on function public.basket_recipe_kits_v1(uuid) from public,anon,authenticated;
grant execute on function public.basket_recipe_kits_v1(uuid) to service_role;
revoke all on function public.save_basket_recipe_kits_v1(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_basket_recipe_kits_v1(uuid,jsonb,text) to service_role;

commit;
