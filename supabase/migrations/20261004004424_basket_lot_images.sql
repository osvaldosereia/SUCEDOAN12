create table public.basket_lot_images (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.basket_stock_lots(id),
  hygiene_lot_id uuid references public.basket_stock_lots(id),
  composition_key text not null unique,
  manifest jsonb not null,
  status text not null check(status in ('generating','scene_ready','preview','published','failed')),
  model text not null,
  scene_url text,
  image_url text,
  byte_size integer check(byte_size between 1 and 50000),
  width integer check(width in (512,640,768)),
  usage jsonb not null default '{}',
  attempts integer not null default 1 check(attempts between 1 and 3),
  error text,
  created_by uuid not null,
  published_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create index basket_lot_images_public_lookup on public.basket_lot_images(lot_id,hygiene_lot_id,published_at desc) where status='published';
alter table public.basket_lot_images enable row level security;
revoke all on public.basket_lot_images from anon,authenticated;
grant all on public.basket_lot_images to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('basket-images','basket-images',true,2000000,array['image/webp'])
on conflict(id) do nothing;
