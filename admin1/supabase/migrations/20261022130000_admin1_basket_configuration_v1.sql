create table if not exists public.admin1_basket_sizes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 60),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists admin1_basket_sizes_name_unique_idx
  on public.admin1_basket_sizes (lower(name));

create table if not exists public.admin1_basket_product_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists admin1_basket_product_types_name_unique_idx
  on public.admin1_basket_product_types (lower(name));

create table if not exists public.admin1_basket_type_products (
  product_type_id uuid not null references public.admin1_basket_product_types(id) on delete cascade,
  product_id uuid not null references public.admin1_products(id) on delete restrict,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (product_type_id, product_id)
);
create index if not exists admin1_basket_type_products_order_idx
  on public.admin1_basket_type_products (product_type_id, sort_order, product_id);

create table if not exists public.admin1_basket_type_quantities (
  product_type_id uuid not null references public.admin1_basket_product_types(id) on delete cascade,
  size_id uuid not null references public.admin1_basket_sizes(id) on delete restrict,
  quantity numeric(12,3) not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (product_type_id, size_id)
);

insert into public.admin1_basket_sizes (name, sort_order, is_active)
values ('Econômica', 0, true), ('Mini', 1, true), ('Pequena', 2, true), ('Média', 3, true), ('Grande', 4, true)
on conflict do nothing;

alter table public.admin1_basket_sizes enable row level security;
alter table public.admin1_basket_product_types enable row level security;
alter table public.admin1_basket_type_products enable row level security;
alter table public.admin1_basket_type_quantities enable row level security;

drop policy if exists "Admin1 basket sizes development access" on public.admin1_basket_sizes;
create policy "Admin1 basket sizes development access" on public.admin1_basket_sizes
  for all to anon, authenticated using (true) with check (true);
drop policy if exists "Admin1 basket types development access" on public.admin1_basket_product_types;
create policy "Admin1 basket types development access" on public.admin1_basket_product_types
  for all to anon, authenticated using (true) with check (true);
drop policy if exists "Admin1 basket type products development access" on public.admin1_basket_type_products;
create policy "Admin1 basket type products development access" on public.admin1_basket_type_products
  for all to anon, authenticated using (true) with check (true);
drop policy if exists "Admin1 basket type quantities development access" on public.admin1_basket_type_quantities;
create policy "Admin1 basket type quantities development access" on public.admin1_basket_type_quantities
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.admin1_basket_sizes to anon, authenticated;
grant select, insert, update, delete on public.admin1_basket_product_types to anon, authenticated;
grant select, insert, update, delete on public.admin1_basket_type_products to anon, authenticated;
grant select, insert, update, delete on public.admin1_basket_type_quantities to anon, authenticated;

create or replace function public.admin1_save_basket_product_type_v1(p_type jsonb)
returns public.admin1_basket_product_types
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_type->>'name', ''));
  v_products jsonb := coalesce(p_type->'products', '[]'::jsonb);
  v_quantities jsonb := coalesce(p_type->'quantities', '[]'::jsonb);
  v_item jsonb;
  v_product_id uuid;
  v_size_id uuid;
  v_quantity numeric;
  v_order integer := 0;
  v_result public.admin1_basket_product_types;
begin
  if v_name = '' then raise exception using errcode = '23514', message = 'Informe o nome do tipo de produto.'; end if;
  if jsonb_typeof(v_products) <> 'array' or jsonb_typeof(v_quantities) <> 'array' then
    raise exception using errcode = '23514', message = 'Produtos ou quantidades estão em formato inválido.';
  end if;

  v_id := nullif(p_type->>'id', '')::uuid;
  if v_id is null then
    insert into public.admin1_basket_product_types (name, sort_order, is_active)
    values (v_name, greatest(0, coalesce(nullif(p_type->>'sort_order', '')::integer, 0)), coalesce((p_type->>'is_active')::boolean, true))
    returning id into v_id;
  else
    update public.admin1_basket_product_types
    set name = v_name,
        sort_order = greatest(0, coalesce(nullif(p_type->>'sort_order', '')::integer, 0)),
        is_active = coalesce((p_type->>'is_active')::boolean, true),
        updated_at = now()
    where id = v_id;
    if not found then raise exception using errcode = 'P0002', message = 'Tipo de produto não encontrado.'; end if;
  end if;

  delete from public.admin1_basket_type_products where product_type_id = v_id;
  for v_item in select value from jsonb_array_elements(v_products)
  loop
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    if v_product_id is null or not exists (select 1 from public.admin1_products where id = v_product_id) then
      raise exception using errcode = '23503', message = 'Um dos produtos selecionados não existe no catálogo Admin1.';
    end if;
    insert into public.admin1_basket_type_products (product_type_id, product_id, sort_order)
    values (v_id, v_product_id, v_order);
    v_order := v_order + 1;
  end loop;

  delete from public.admin1_basket_type_quantities where product_type_id = v_id;
  for v_item in select value from jsonb_array_elements(v_quantities)
  loop
    v_size_id := nullif(v_item->>'size_id', '')::uuid;
    v_quantity := nullif(v_item->>'quantity', '')::numeric;
    if v_size_id is null or v_quantity is null or v_quantity < 0 then
      raise exception using errcode = '23514', message = 'Informe quantidades iguais ou maiores que zero para cada tamanho.';
    end if;
    insert into public.admin1_basket_type_quantities (product_type_id, size_id, quantity)
    values (v_id, v_size_id, v_quantity);
  end loop;

  select * into v_result from public.admin1_basket_product_types where id = v_id;
  return v_result;
end;
$$;

grant execute on function public.admin1_save_basket_product_type_v1(jsonb) to anon, authenticated;

create or replace function public.admin1_reorder_basket_sizes_v1(p_size_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(array_length(p_size_ids, 1), 0) <> (select count(*) from public.admin1_basket_sizes) then
    raise exception using errcode = '23514', message = 'A lista de tamanhos mudou. Atualize a tela e tente novamente.';
  end if;
  if (select count(distinct item) from unnest(p_size_ids) item) <> array_length(p_size_ids, 1) then
    raise exception using errcode = '23514', message = 'A ordem contém tamanhos repetidos.';
  end if;
  if exists (select 1 from unnest(p_size_ids) item left join public.admin1_basket_sizes s on s.id = item where s.id is null) then
    raise exception using errcode = '23514', message = 'Um dos tamanhos não existe mais.';
  end if;
  update public.admin1_basket_sizes s
  set sort_order = ordered.ordinality - 1, updated_at = now()
  from unnest(p_size_ids) with ordinality as ordered(id, ordinality)
  where s.id = ordered.id;
end;
$$;
grant execute on function public.admin1_reorder_basket_sizes_v1(uuid[]) to anon, authenticated;
