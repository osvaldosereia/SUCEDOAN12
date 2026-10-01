-- Dona Antonia · sugestões automáticas de lotes de cestas
-- Camada de sugestão somente; não altera estoque físico até aprovação humana.

create table if not exists public.basket_lot_automation_settings (
  id smallint primary key default 1 check (id=1),
  enabled boolean not null default true,
  lot_quantity integer not null default 5 check (lot_quantity between 1 and 100),
  price_variation_pct numeric(6,2) not null default 15 check (price_variation_pct between 0 and 100),
  timezone text not null default 'America/Cuiaba',
  run_hour_local smallint not null default 8 check (run_hour_local between 0 and 23),
  updated_at timestamptz not null default now(),updated_by text,metadata jsonb not null default '{}'::jsonb
);
insert into public.basket_lot_automation_settings(id,enabled,lot_quantity,price_variation_pct,timezone,run_hour_local)
values(1,true,5,15,'America/Cuiaba',8) on conflict(id) do nothing;

create table if not exists public.basket_lot_substitution_rules (
  family_key text primary key,label text not null,enabled boolean not null default true,sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,updated_at timestamptz not null default now()
);
insert into public.basket_lot_substitution_rules(family_key,label,enabled,sort_order) values
('detergente','Detergente',true,10),('sabonete','Sabonete',true,20),('suco','Suco',true,30),
('molho_tomate','Molho de tomate',true,40),('milho','Milho',true,50),('miojo','Lámen / Miojo',true,60),
('macarrao','Macarrão',true,70),('creme_dental','Creme dental',true,80),('bolacha','Bolacha / Biscoito',true,90),('trigo','Farinha de trigo',true,100)
on conflict(family_key) do update set label=excluded.label,sort_order=excluded.sort_order;

create table if not exists public.basket_lot_automation_runs (
  id uuid primary key default gen_random_uuid(),run_date date not null,status text not null default 'running' check(status in('running','completed','failed')),
  source text not null default 'cron',generated_count integer not null default 0,attention_count integer not null default 0,
  started_at timestamptz not null default now(),finished_at timestamptz,metadata jsonb not null default '{}'::jsonb,unique(run_date)
);
create table if not exists public.basket_lot_suggestions (
  id uuid primary key default gen_random_uuid(),basket_id uuid not null references public.basket_templates(id) on delete restrict,
  suggestion_date date not null,status text not null default 'pending' check(status in('pending','approved','rejected')),
  buildability_status text not null default 'ready' check(buildability_status in('ready','attention')),
  quantity_planned integer not null check(quantity_planned between 1 and 500),sale_price numeric(14,2) not null check(sale_price>=0),
  component_sum numeric(14,2) not null default 0,hidden_adjustment numeric(14,2) not null default 0,price_variation_pct_snapshot numeric(6,2) not null default 15,
  generation_run_id uuid references public.basket_lot_automation_runs(id) on delete set null,source text not null default 'automation',
  issues jsonb not null default '[]'::jsonb,metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  reviewed_at timestamptz,reviewed_by text,approved_lot_id uuid references public.basket_stock_lots(id) on delete set null,
  unique(basket_id,suggestion_date,source)
);
create table if not exists public.basket_lot_suggestion_items (
  id uuid primary key default gen_random_uuid(),suggestion_id uuid not null references public.basket_lot_suggestions(id) on delete cascade,
  template_item_id uuid references public.basket_template_items(id) on delete set null,original_product_id uuid references public.products(id) on delete restrict,
  suggested_product_id uuid not null references public.products(id) on delete restrict,quantity_per_basket numeric(12,3) not null check(quantity_per_basket>0),
  position_order integer not null default 0,original_unit_price numeric(14,2),suggested_unit_price numeric(14,2) not null default 0,price_delta_pct numeric(8,3),
  is_substituted boolean not null default false,substitution_family text,substitution_reason text,loose_stock_snapshot numeric(14,3) not null default 0,
  stock_ok_snapshot boolean not null default true,metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists basket_lot_suggestions_queue_idx on public.basket_lot_suggestions(status,suggestion_date desc,created_at desc);
create index if not exists basket_lot_suggestions_basket_idx on public.basket_lot_suggestions(basket_id,suggestion_date desc);
create index if not exists basket_lot_suggestion_items_suggestion_idx on public.basket_lot_suggestion_items(suggestion_id,position_order);
create index if not exists basket_lot_suggestion_items_product_idx on public.basket_lot_suggestion_items(suggested_product_id);

alter table public.basket_lot_automation_settings enable row level security;
alter table public.basket_lot_substitution_rules enable row level security;
alter table public.basket_lot_automation_runs enable row level security;
alter table public.basket_lot_suggestions enable row level security;
alter table public.basket_lot_suggestion_items enable row level security;
revoke all on public.basket_lot_automation_settings,public.basket_lot_substitution_rules,public.basket_lot_automation_runs,public.basket_lot_suggestions,public.basket_lot_suggestion_items from anon,authenticated;
grant select,insert,update,delete on public.basket_lot_automation_settings,public.basket_lot_substitution_rules,public.basket_lot_automation_runs,public.basket_lot_suggestions,public.basket_lot_suggestion_items to service_role;

create or replace function public.basket_auto_norm_text_v1(p_value text) returns text language sql immutable set search_path to '' as $$
select lower(translate(coalesce(p_value,''),'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ','aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'));$$;
create or replace function public.basket_substitution_family_v1(p_name text,p_subcategory text default null) returns text language plpgsql immutable set search_path to '' as $$
declare n text:=public.basket_auto_norm_text_v1(p_name);s text:=public.basket_auto_norm_text_v1(p_subcategory);
begin
if s='detergente' or n like '%detergente%' then return 'detergente'; end if;
if n like '%creme dental%' or n like '%pasta de dente%' then return 'creme_dental'; end if;
if n like '%molho de tomate%' and n not like '%sardinha%' then return 'molho_tomate'; end if;
if (n like '%macarrao%' and (n like '%lamen%' or n like '%miojo%' or n like '%instantaneo%')) or n like '%miojo%' or n like '%lamen%' then return 'miojo'; end if;
if n like '%macarrao%' and n not like '%molho%' and n not like '%sopao%' then return 'macarrao'; end if;
if s like '%suco em po%' or n like '%suco em po%' then return 'suco'; end if;
if n like '%milho verde%' and n not like '%amido%' and n not like '%pipoca%' then return 'milho'; end if;
if n like '%sabonete%' and n not like '%saboneteira%' then return 'sabonete'; end if;
if n like '%farinha de trigo%' then return 'trigo'; end if;
if n like '%biscoito%' or n like '%bolacha%' or n like '%rosquinha%' then return 'bolacha'; end if;
return null;end;$$;
create or replace function public.basket_package_compatible_v1(p_original_packaging text,p_original_name text,p_candidate_packaging text,p_candidate_name text) returns boolean language plpgsql immutable set search_path to '' as $$
declare a text:=lower(coalesce(p_original_packaging,'')||' '||coalesce(p_original_name,''));b text:=lower(coalesce(p_candidate_packaging,'')||' '||coalesce(p_candidate_name,''));ma text[];mb text[];va numeric;vb numeric;ua text;ub text;da text;db text;
begin ma:=regexp_match(a,'([0-9]+([.,][0-9]+)?)\s*(kg|g|ml|l)([^a-z]|$)');mb:=regexp_match(b,'([0-9]+([.,][0-9]+)?)\s*(kg|g|ml|l)([^a-z]|$)');
if ma is null or mb is null then return public.basket_auto_norm_text_v1(p_original_packaging)=public.basket_auto_norm_text_v1(p_candidate_packaging); end if;
va:=replace(ma[1],',','.')::numeric;vb:=replace(mb[1],',','.')::numeric;ua:=ma[3];ub:=mb[3];da:=case when ua in('kg','g') then 'mass' else 'volume' end;db:=case when ub in('kg','g') then 'mass' else 'volume' end;if da<>db then return false;end if;if ua='kg' then va:=va*1000;elsif ua='l' then va:=va*1000;end if;if ub='kg' then vb:=vb*1000;elsif ub='l' then vb:=vb*1000;end if;return vb>=va*0.80 and vb<=va*1.25;end;$$;
create or replace function public.update_basket_lot_automation_settings_v1(p_enabled boolean,p_lot_quantity integer,p_price_variation_pct numeric,p_enabled_families text[],p_operator text default null) returns jsonb language plpgsql set search_path to '' as $$
begin if coalesce(p_lot_quantity,0)<1 or p_lot_quantity>100 then raise exception 'invalid_lot_quantity';end if;if coalesce(p_price_variation_pct,-1)<0 or p_price_variation_pct>100 then raise exception 'invalid_price_variation_pct';end if;
update public.basket_lot_automation_settings set enabled=coalesce(p_enabled,false),lot_quantity=p_lot_quantity,price_variation_pct=p_price_variation_pct,updated_at=now(),updated_by=nullif(trim(coalesce(p_operator,'')),'') where id=1;
update public.basket_lot_substitution_rules r set enabled=(r.family_key=any(coalesce(p_enabled_families,array[]::text[]))),updated_at=now();return jsonb_build_object('ok',true,'enabled',coalesce(p_enabled,false),'lot_quantity',p_lot_quantity,'price_variation_pct',p_price_variation_pct,'enabled_families',coalesce(p_enabled_families,array[]::text[]));end;$$;
revoke all on function public.basket_auto_norm_text_v1(text),public.basket_substitution_family_v1(text,text),public.basket_package_compatible_v1(text,text,text,text),public.update_basket_lot_automation_settings_v1(boolean,integer,numeric,text[],text) from public,anon,authenticated;
grant execute on function public.basket_auto_norm_text_v1(text),public.basket_substitution_family_v1(text,text),public.basket_package_compatible_v1(text,text,text,text),public.update_basket_lot_automation_settings_v1(boolean,integer,numeric,text[],text) to service_role;
