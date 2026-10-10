-- Dona Antônia · Cestas Molde v1
-- Rodada 1/6: configuração apenas. Não altera estoque, lotes, checkout ou pedidos.

begin;

create table if not exists public.basket_molds (
  id uuid primary key default gen_random_uuid(),
  basket_id uuid not null unique references public.basket_templates(id) on delete cascade,
  hidden_adjustment numeric(12,2) not null default 0,
  public_composition_count smallint not null default 2 check (public_composition_count between 1 and 6),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.basket_mold_positions (
  id uuid primary key default gen_random_uuid(),
  mold_id uuid not null references public.basket_molds(id) on delete cascade,
  label text not null check (btrim(label) <> ''),
  quantity numeric(12,3) not null check (quantity > 0 and quantity <= 999),
  sort_order integer not null default 0 check (sort_order >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.basket_mold_position_options (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.basket_mold_positions(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  sort_order integer not null default 0 check (sort_order >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (position_id, product_id)
);

create index if not exists basket_mold_positions_mold_order_idx
  on public.basket_mold_positions(mold_id, sort_order, id);
create index if not exists basket_mold_position_options_position_order_idx
  on public.basket_mold_position_options(position_id, sort_order, id);
create index if not exists basket_mold_position_options_product_idx
  on public.basket_mold_position_options(product_id);

alter table public.basket_molds enable row level security;
alter table public.basket_mold_positions enable row level security;
alter table public.basket_mold_position_options enable row level security;

revoke all on table public.basket_molds from public, anon, authenticated;
revoke all on table public.basket_mold_positions from public, anon, authenticated;
revoke all on table public.basket_mold_position_options from public, anon, authenticated;

grant select, insert, update, delete on table public.basket_molds to service_role;
grant select, insert, update, delete on table public.basket_mold_positions to service_role;
grant select, insert, update, delete on table public.basket_mold_position_options to service_role;

create or replace function public.basket_mold_editor_v1(p_basket_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  select jsonb_build_object(
    'basket_id', b.id,
    'basket_name', b.name,
    'basket_image_url', b.image_url,
    'mold_id', m.id,
    'hidden_adjustment', coalesce(m.hidden_adjustment, 0),
    'public_composition_count', coalesce(m.public_composition_count, 2),
    'metadata', coalesce(m.metadata, '{}'::jsonb),
    'positions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'position_id', pos.id,
          'label', pos.label,
          'quantity', pos.quantity,
          'sort_order', pos.sort_order,
          'metadata', pos.metadata,
          'options', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'option_id', opt.id,
                'product_id', p.id,
                'name', p.name,
                'sku', p.sku,
                'gtin', p.gtin,
                'image_url', p.image_url,
                'is_active', p.is_active,
                'sort_order', opt.sort_order,
                'metadata', opt.metadata
              ) order by opt.sort_order, opt.id
            )
            from public.basket_mold_position_options opt
            join public.products p on p.id = opt.product_id
            where opt.position_id = pos.id
          ), '[]'::jsonb)
        ) order by pos.sort_order, pos.id
      )
      from public.basket_mold_positions pos
      where pos.mold_id = m.id
    ), '[]'::jsonb)
  )
  from public.basket_templates b
  left join public.basket_molds m on m.basket_id = b.id
  where b.id = p_basket_id;
$function$;

create or replace function public.save_basket_mold_v1(
  p_basket_id uuid,
  p_hidden_adjustment numeric,
  p_public_composition_count integer,
  p_positions jsonb,
  p_operator text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_mold_id uuid;
  v_position jsonb;
  v_options jsonb;
  v_option jsonb;
  v_position_id uuid;
  v_product_id uuid;
  v_seen_products uuid[];
  v_label text;
  v_quantity numeric;
  v_position_order integer := 0;
  v_option_order integer;
begin
  if p_basket_id is null or not exists (
    select 1 from public.basket_templates b where b.id = p_basket_id
  ) then
    raise exception 'basket_mold_basket_not_found';
  end if;

  if p_public_composition_count is null or p_public_composition_count < 1 or p_public_composition_count > 6 then
    raise exception 'basket_mold_public_composition_count_invalid';
  end if;

  if p_positions is null or jsonb_typeof(p_positions) <> 'array' or jsonb_array_length(p_positions) = 0 then
    raise exception 'basket_mold_positions_required';
  end if;

  -- Validate the entire payload before replacing the current configuration.
  for v_position in select value from jsonb_array_elements(p_positions)
  loop
    v_label := btrim(coalesce(v_position->>'label', ''));
    if v_label = '' then
      raise exception 'basket_mold_position_label_required';
    end if;

    begin
      v_quantity := nullif(v_position->>'quantity', '')::numeric;
    exception when others then
      raise exception 'basket_mold_position_quantity_invalid';
    end;
    if v_quantity is null or v_quantity <= 0 or v_quantity > 999 then
      raise exception 'basket_mold_position_quantity_invalid';
    end if;

    v_options := v_position->'options';
    if v_options is null or jsonb_typeof(v_options) <> 'array' or jsonb_array_length(v_options) = 0 then
      raise exception 'basket_mold_position_options_required';
    end if;

    v_seen_products := '{}'::uuid[];
    for v_option in select value from jsonb_array_elements(v_options)
    loop
      begin
        if jsonb_typeof(v_option) = 'string' then
          v_product_id := trim(both '"' from v_option::text)::uuid;
        else
          v_product_id := nullif(v_option->>'product_id', '')::uuid;
        end if;
      exception when others then
        raise exception 'basket_mold_product_invalid';
      end;

      if v_product_id is null or not exists (
        select 1 from public.products p where p.id = v_product_id
      ) then
        raise exception 'basket_mold_product_not_found';
      end if;

      if v_product_id = any(v_seen_products) then
        raise exception 'basket_mold_duplicate_option';
      end if;
      v_seen_products := array_append(v_seen_products, v_product_id);
    end loop;
  end loop;

  insert into public.basket_molds(
    basket_id, hidden_adjustment, public_composition_count, metadata
  ) values (
    p_basket_id,
    coalesce(p_hidden_adjustment, 0),
    p_public_composition_count,
    jsonb_build_object('domain_version', 1, 'updated_by', coalesce(nullif(btrim(p_operator), ''), 'Operação'))
  )
  on conflict (basket_id) do update
    set hidden_adjustment = excluded.hidden_adjustment,
        public_composition_count = excluded.public_composition_count,
        metadata = coalesce(public.basket_molds.metadata, '{}'::jsonb)
          || jsonb_build_object('domain_version', 1, 'updated_by', coalesce(nullif(btrim(p_operator), ''), 'Operação')),
        updated_at = now()
  returning id into v_mold_id;

  delete from public.basket_mold_positions where mold_id = v_mold_id;

  v_position_order := 0;
  for v_position in select value from jsonb_array_elements(p_positions)
  loop
    v_label := btrim(v_position->>'label');
    v_quantity := (v_position->>'quantity')::numeric;

    insert into public.basket_mold_positions(
      mold_id, label, quantity, sort_order, metadata
    ) values (
      v_mold_id,
      v_label,
      v_quantity,
      v_position_order,
      coalesce(v_position->'metadata', '{}'::jsonb)
    ) returning id into v_position_id;

    v_option_order := 0;
    for v_option in select value from jsonb_array_elements(v_position->'options')
    loop
      if jsonb_typeof(v_option) = 'string' then
        v_product_id := trim(both '"' from v_option::text)::uuid;
      else
        v_product_id := (v_option->>'product_id')::uuid;
      end if;

      insert into public.basket_mold_position_options(
        position_id, product_id, sort_order, metadata
      ) values (
        v_position_id,
        v_product_id,
        v_option_order,
        case when jsonb_typeof(v_option) = 'object'
          then coalesce(v_option->'metadata', '{}'::jsonb)
          else '{}'::jsonb
        end
      );
      v_option_order := v_option_order + 1;
    end loop;

    v_position_order := v_position_order + 1;
  end loop;

  return public.basket_mold_editor_v1(p_basket_id);
end;
$function$;

revoke all on function public.basket_mold_editor_v1(uuid) from public, anon, authenticated;
grant execute on function public.basket_mold_editor_v1(uuid) to service_role;

revoke all on function public.save_basket_mold_v1(uuid, numeric, integer, jsonb, text) from public, anon, authenticated;
grant execute on function public.save_basket_mold_v1(uuid, numeric, integer, jsonb, text) to service_role;

commit;
