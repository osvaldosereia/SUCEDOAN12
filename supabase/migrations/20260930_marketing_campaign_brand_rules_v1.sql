create table if not exists public.marketing_campaign_brand_rules_v1 (
  brand_key text primary key,
  display_name text not null,
  is_enabled boolean not null default true,
  notes text,
  sort_order integer not null default 100,
  updated_at timestamptz not null default now()
);

alter table public.marketing_campaign_brand_rules_v1 enable row level security;

insert into public.marketing_campaign_brand_rules_v1 (brand_key, display_name, is_enabled, sort_order) values
  ('nivea','NIVEA',true,10),
  ('elseve','Elseve',true,20),
  ('seda','Seda',false,30),
  ('monange','Monange',false,40),
  ('lola-cosmetics','Lola Cosmetics',false,50),
  ('skala','Skala',false,60),
  ('dove','Dove',false,70),
  ('omo','OMO',false,80),
  ('ype','Ypê',false,90),
  ('downy','Downy',false,100)
on conflict (brand_key) do update set
  display_name=excluded.display_name,
  is_enabled=excluded.is_enabled,
  sort_order=excluded.sort_order,
  updated_at=now();
