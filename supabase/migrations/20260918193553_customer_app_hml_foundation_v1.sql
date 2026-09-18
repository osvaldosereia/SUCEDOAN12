create table public.customer_app_hml_config (
  key text primary key,
  enabled boolean not null default false,
  environment text not null default 'homologation' check (environment = 'homologation'),
  max_requests_per_minute integer not null default 60 check (max_requests_per_minute between 1 and 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (key = 'global')
);

create table public.customer_app_hml_catalog (
  id text primary key check (id like 'TEST-PROD-%'),
  name text not null,
  section text not null check (section in ('for-you','for-home')),
  category text not null,
  subcategory text not null,
  unit text not null,
  price_cents integer not null check (price_cents > 0),
  promo_price_cents integer null,
  active boolean not null default true,
  image_kind text not null default 'placeholder' check (image_kind = 'placeholder'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (
    promo_price_cents is null
    or (promo_price_cents > 0 and promo_price_cents < price_cents)
  )
);

create table public.customer_app_hml_orders (
  id text primary key check (id like 'TEST-HML-ORDER-%'),
  customer_label text not null default 'Cliente Teste' check (customer_label like 'Cliente Teste%'),
  payment_method text not null check (payment_method in ('pix','cash','credit_card','meal_card')),
  total_cents integer not null check (total_cents > 0),
  cart jsonb not null check (jsonb_typeof(cart) = 'array'),
  status text not null default 'confirmed' check (status in ('confirmed','separating','ready','on_route','delivered','cancelled')),
  environment text not null default 'homologation' check (environment = 'homologation'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_app_hml_rate_limits (
  client_id text not null check (client_id like 'TEST-CLIENT-%'),
  endpoint text not null check (endpoint in ('bootstrap','catalog','checkout')),
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (client_id, endpoint, window_start)
);

alter table public.customer_app_hml_config enable row level security;
alter table public.customer_app_hml_catalog enable row level security;
alter table public.customer_app_hml_orders enable row level security;
alter table public.customer_app_hml_rate_limits enable row level security;

revoke all on table public.customer_app_hml_config from public, anon, authenticated;
revoke all on table public.customer_app_hml_catalog from public, anon, authenticated;
revoke all on table public.customer_app_hml_orders from public, anon, authenticated;
revoke all on table public.customer_app_hml_rate_limits from public, anon, authenticated;

grant select, insert, update, delete on table public.customer_app_hml_config to service_role;
grant select, insert, update, delete on table public.customer_app_hml_catalog to service_role;
grant select, insert, update, delete on table public.customer_app_hml_orders to service_role;
grant select, insert, update, delete on table public.customer_app_hml_rate_limits to service_role;

insert into public.customer_app_hml_config (
  key, enabled, environment, max_requests_per_minute
) values (
  'global', false, 'homologation', 60
);

insert into public.customer_app_hml_catalog
(id, name, section, category, subcategory, unit, price_cents, promo_price_cents, active, image_kind, sort_order)
values
('TEST-PROD-001','Arroz Tipo 1 5kg','for-you','Mercearia','Arroz e Feijão','5 kg',3290,2990,true,'placeholder',10),
('TEST-PROD-002','Feijão Carioca 1kg','for-you','Mercearia','Arroz e Feijão','1 kg',899,null,true,'placeholder',20),
('TEST-PROD-007','Café Torrado 500g','for-you','Mercearia','Café e Matinais','500 g',2490,2190,true,'placeholder',30),
('TEST-PROD-011','Shampoo Nutrição 350ml','for-you','Higiene','Cabelos','350 ml',1690,1390,true,'placeholder',40),
('TEST-PROD-013','Sabonete Suave 90g','for-you','Higiene','Banho','90 g',349,299,true,'placeholder',50),
('TEST-PROD-015','Sabão em Pó 1,6kg','for-home','Limpeza','Lavanderia','1,6 kg',2290,1990,true,'placeholder',60),
('TEST-PROD-017','Desinfetante Floral 2L','for-home','Limpeza','Casa','2 L',1090,899,true,'placeholder',70),
('TEST-PROD-020','Esponja Multiuso 3un','for-home','Casa','Cozinha','3 un',549,449,true,'placeholder',80),
('TEST-PROD-021','Papel Higiênico Folha Dupla 12un','for-home','Casa','Papel','12 un',2190,1890,true,'placeholder',90),
('TEST-PROD-023','Ração para Cães Adultos 1kg','for-home','Pet','Cães','1 kg',1990,1740,true,'placeholder',100);
