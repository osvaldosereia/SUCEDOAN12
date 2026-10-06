-- Dona Antônia · Cestas Molde v1
-- Rodada 1/6: domínio canônico para Molde -> Posições -> Opções de produto.
-- Não altera basket_templates, lotes, reservas, checkout ou estoque existentes.

begin;

create table if not exists public.basket_molds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  image_url text,
  hidden_value numeric(12,2) not null default 0,
  public_composition_count smallint not null default 2 check (public_composition_count between 1 and 4),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.basket_mold_positions (
  id uuid primary key default gen_random_uuid(),
  mold_id uuid not null references public.basket_molds(id) on delete cascade,
  position_key text not null,
  label text not null,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mold_id, position_key)
);

create table if not exists public.basket_mold_position_options (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.basket_mold_positions(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  is_active boolean not null default true,
  sort_order integer not null default 0,
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
  on public.basket_mold_position_options(product_id)
  where is_active = true;

alter table public.basket_molds enable row level security;
alter table public.basket_mold_positions enable row level security;
alter table public.basket_mold_position_options enable row level security;

-- O domínio é administrativo/interno nesta fase. Não o exponha ao navegador.
revoke all on table public.basket_molds from public, anon, authenticated;
revoke all on table public.basket_mold_positions from public, anon, authenticated;
revoke all on table public.basket_mold_position_options from public, anon, authenticated;

grant select, insert, update, delete on table public.basket_molds to service_role;
grant select, insert, update, delete on table public.basket_mold_positions to service_role;
grant select, insert, update, delete on table public.basket_mold_position_options to service_role;

drop trigger if exists trg_basket_molds_updated_at on public.basket_molds;
create trigger trg_basket_molds_updated_at
before update on public.basket_molds
for each row execute function public.set_updated_at();

drop trigger if exists trg_basket_mold_positions_updated_at on public.basket_mold_positions;
create trigger trg_basket_mold_positions_updated_at
before update on public.basket_mold_positions
for each row execute function public.set_updated_at();

drop trigger if exists trg_basket_mold_position_options_updated_at on public.basket_mold_position_options;
create trigger trg_basket_mold_position_options_updated_at
before update on public.basket_mold_position_options
for each row execute function public.set_updated_at();

create or replace function public.basket_mold_domain_v1(p_mold_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'name', m.name,
        'slug', m.slug,
        'description', m.description,
        'image_url', m.image_url,
        'hidden_value', m.hidden_value,
        'public_composition_count', m.public_composition_count,
        'is_active', m.is_active,
        'sort_order', m.sort_order,
        'metadata', m.metadata,
        'positions', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', pos.id,
              'position_key', pos.position_key,
              'label', pos.label,
              'quantity', pos.quantity,
              'sort_order', pos.sort_order,
              'metadata', pos.metadata,
              'options', coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'id', opt.id,
                    'product_id', opt.product_id,
                    'is_active', opt.is_active,
                    'sort_order', opt.sort_order,
                    'metadata', opt.metadata,
                    'product', jsonb_build_object(
                      'id', p.id,
                      'name', p.name,
                      'sku', p.sku,
                      'gtin', p.gtin,
                      'brand', p.brand,
                      'packaging', p.packaging,
                      'price', p.price,
                      'cost', p.cost,
                      'image_url', p.image_url,
                      'is_active', p.is_active
                    )
                  ) order by opt.sort_order, p.name, opt.id
                )
                from public.basket_mold_position_options opt
                join public.products p on p.id = opt.product_id
                where opt.position_id = pos.id
              ), '[]'::jsonb)
            ) order by pos.sort_order, pos.label, pos.id
          )
          from public.basket_mold_positions pos
          where pos.mold_id = m.id
        ), '[]'::jsonb)
      ) order by m.sort_order, m.name, m.id
    ),
    '[]'::jsonb
  )
  from public.basket_molds m
  where p_mold_id is null or m.id = p_mold_id;
$function$;

revoke all on function public.basket_mold_domain_v1(uuid) from public, anon, authenticated;
grant execute on function public.basket_mold_domain_v1(uuid) to service_role;

commit;
