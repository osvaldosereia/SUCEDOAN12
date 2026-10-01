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
  ('seda','Seda',true,30),
  ('monange','Monange',true,40),
  ('lola-cosmetics','Lola Cosmetics',true,50),
  ('skala','Skala',true,60),
  ('dove','Dove',true,70),
  ('omo','OMO',true,80),
  ('ype','Ypê',true,90),
  ('downy','Downy',true,100)
on conflict (brand_key) do update set
  display_name=excluded.display_name,
  sort_order=excluded.sort_order,
  updated_at=now();
