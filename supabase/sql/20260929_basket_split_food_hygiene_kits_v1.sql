-- 2026-09-29 · Dona Antônia
-- Cestas divididas em lote de Alimentos + Kit universal Limpeza/Higiene.
-- Migration aplicada no Supabase como basket_split_food_hygiene_kits_v1.

create table if not exists public.basket_kit_templates (
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('food','hygiene')),
 basket_id uuid references public.basket_templates(id) on delete cascade,
 name text not null,
 code_prefix text not null check(code_prefix ~ '^[A-Z]{2}$'),
 is_active boolean not null default true,
 sort_order integer not null default 0,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(code_prefix)
);
create unique index if not exists basket_kit_templates_food_basket_uidx on public.basket_kit_templates(basket_id) where kind='food';
create unique index if not exists basket_kit_templates_single_hygiene_uidx on public.basket_kit_templates(kind) where kind='hygiene' and is_active=true;

create table if not exists public.basket_kit_template_items (
 id uuid primary key default gen_random_uuid(),
 kit_template_id uuid not null references public.basket_kit_templates(id) on delete cascade,
 product_id uuid not null references public.products(id) on delete restrict,
 source_template_item_id uuid references public.basket_template_items(id) on delete set null,
 quantity numeric(14,3) not null check(quantity>0),
 removable boolean not null default true,
 quantity_editable boolean not null default true,
 min_quantity numeric(14,3) not null default 0,
 max_quantity numeric(14,3),
 remove_unit_delta numeric(14,2),
 add_unit_delta numeric(14,2),
 sort_order integer not null default 0,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists basket_kit_template_items_kit_idx on public.basket_kit_template_items(kit_template_id,sort_order);
create index if not exists basket_kit_template_items_product_idx on public.basket_kit_template_items(product_id);
create index if not exists basket_kit_template_items_source_item_idx on public.basket_kit_template_items(source_template_item_id);

alter table public.basket_templates add column if not exists uses_hygiene_kit boolean not null default false;
alter table public.basket_templates add column if not exists split_kits_enabled boolean not null default false;
alter table public.basket_stock_lots alter column basket_id drop not null;
alter table public.basket_stock_lots add column if not exists kit_template_id uuid references public.basket_kit_templates(id) on delete restrict;
alter table public.basket_stock_lots add column if not exists lot_kind text not null default 'legacy_full';
alter table public.basket_stock_lots add column if not exists short_code text;
alter table public.basket_stock_lots add column if not exists duplicated_from_lot_id uuid references public.basket_stock_lots(id) on delete set null;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='basket_stock_lots_lot_kind_chk') then
  alter table public.basket_stock_lots add constraint basket_stock_lots_lot_kind_chk check(lot_kind in ('legacy_full','food','hygiene'));
 end if;
 if not exists(select 1 from pg_constraint where conname='basket_stock_lots_short_code_chk') then
  alter table public.basket_stock_lots add constraint basket_stock_lots_short_code_chk check(short_code is null or short_code ~ '^[A-Z]{2}[0-9]$');
 end if;
end $$;
create index if not exists basket_stock_lots_kit_ready_idx on public.basket_stock_lots(kit_template_id,status,built_at,created_at) where kit_template_id is not null;
create unique index if not exists basket_stock_lots_active_short_code_uidx on public.basket_stock_lots(short_code) where short_code is not null and status in ('draft','ready');
create index if not exists basket_stock_lots_duplicated_from_idx on public.basket_stock_lots(duplicated_from_lot_id);

alter table public.basket_stock_lot_items add column if not exists kit_template_item_id uuid references public.basket_kit_template_items(id) on delete set null;
create index if not exists basket_stock_lot_items_kit_item_idx on public.basket_stock_lot_items(kit_template_item_id);
alter table public.basket_stock_allocations add column if not exists allocation_role text not null default 'legacy_full';
do $$ begin
 if not exists(select 1 from pg_constraint where conname='basket_stock_allocations_role_chk') then
  alter table public.basket_stock_allocations add constraint basket_stock_allocations_role_chk check(allocation_role in ('legacy_full','food','hygiene'));
 end if;
end $$;
alter table public.basket_stock_allocations drop constraint if exists basket_stock_allocations_order_id_lot_id_key;
create unique index if not exists basket_stock_allocations_order_lot_basket_role_uidx on public.basket_stock_allocations(order_id,lot_id,basket_id,allocation_role);

alter table public.basket_kit_templates enable row level security;
alter table public.basket_kit_template_items enable row level security;
revoke all on public.basket_kit_templates from anon,authenticated;
revoke all on public.basket_kit_template_items from anon,authenticated;
grant all on public.basket_kit_templates to service_role;
grant all on public.basket_kit_template_items to service_role;

update public.basket_stock_lots set lot_kind='legacy_full' where kit_template_id is null and coalesce(lot_kind,'')<>'legacy_full';
update public.basket_templates bt set uses_hygiene_kit=exists(
 select 1 from public.basket_template_items bi join public.products p on p.id=bi.product_id
 where bi.basket_id=bt.id and p.sales_category in ('limpeza_lavanderia','higiene_beleza')
);

insert into public.basket_kit_templates(kind,basket_id,name,code_prefix,sort_order,metadata)
select 'food',bt.id,'Alimentos · '||bt.name,
 case bt.name when 'Economica Bonini' then 'EB' when 'Mini Bonini' then 'NB' when 'Mini Koblenz' then 'NK'
 when 'Pequena Bonini' then 'PB' when 'Pequena Koblenz' then 'PK' when 'Média Bonini' then 'MB' when 'Média Koblenz' then 'MK'
 when 'Grande Bonini' then 'GB' when 'Grande Koblenz' then 'GK' else upper(substr(regexp_replace(bt.name,'[^A-Za-z]','','g'),1,2)) end,
 bt.sort_order,jsonb_build_object('bootstrap','split_kits_2026_09_29')
from public.basket_templates bt where bt.is_active=true
on conflict(code_prefix) do update set name=excluded.name,basket_id=excluded.basket_id,sort_order=excluded.sort_order,updated_at=now();

insert into public.basket_kit_templates(kind,basket_id,name,code_prefix,sort_order,metadata)
values('hygiene',null,'Kit Limpeza e Higiene','LH',1000,jsonb_build_object('bootstrap','split_kits_2026_09_29','basis','Mini Bonini'))
on conflict(code_prefix) do update set name=excluded.name,updated_at=now();

insert into public.basket_kit_template_items(kit_template_id,product_id,source_template_item_id,quantity,removable,quantity_editable,min_quantity,max_quantity,remove_unit_delta,add_unit_delta,sort_order,metadata)
select kt.id,bi.product_id,bi.id,bi.quantity,bi.removable,bi.quantity_editable,bi.min_quantity,bi.max_quantity,bi.remove_unit_delta,bi.add_unit_delta,bi.sort_order,jsonb_build_object('source','commercial_basket_food')
from public.basket_kit_templates kt join public.basket_template_items bi on bi.basket_id=kt.basket_id join public.products p on p.id=bi.product_id
where kt.kind='food' and p.sales_category not in ('limpeza_lavanderia','higiene_beleza')
and not exists(select 1 from public.basket_kit_template_items x where x.kit_template_id=kt.id and x.source_template_item_id=bi.id);

insert into public.basket_kit_template_items(kit_template_id,product_id,source_template_item_id,quantity,removable,quantity_editable,min_quantity,max_quantity,remove_unit_delta,add_unit_delta,sort_order,metadata)
select kt.id,bi.product_id,bi.id,bi.quantity,bi.removable,bi.quantity_editable,bi.min_quantity,bi.max_quantity,bi.remove_unit_delta,bi.add_unit_delta,bi.sort_order,jsonb_build_object('source','universal_hygiene','basis_basket','Mini Bonini')
from public.basket_kit_templates kt join public.basket_templates bt on bt.name='Mini Bonini' join public.basket_template_items bi on bi.basket_id=bt.id join public.products p on p.id=bi.product_id
where kt.kind='hygiene' and p.sales_category in ('limpeza_lavanderia','higiene_beleza')
and not exists(select 1 from public.basket_kit_template_items x where x.kit_template_id=kt.id and x.product_id=bi.product_id);

create or replace view public.basket_current_kit_lot_v2 with(security_invoker=true) as
select distinct on(l.kit_template_id) l.kit_template_id,l.id lot_id,l.basket_id,l.lot_kind,l.short_code,l.lot_code,l.quantity_built,l.quantity_available,l.composition_hash,l.built_at,l.built_by,l.duplicated_from_lot_id,l.source,l.metadata
from public.basket_stock_lots l where l.kit_template_id is not null and l.status='ready' and l.quantity_available>0
order by l.kit_template_id,l.built_at,l.created_at,l.id;

create or replace view public.basket_current_lot_v1 with(security_invoker=true) as
select distinct on(l.basket_id) l.basket_id,l.id lot_id,l.lot_code,l.quantity_built,l.quantity_available,l.composition_hash,l.built_at,l.built_by,l.source,l.metadata
from public.basket_stock_lots l where l.status='ready' and l.quantity_available>0 and l.lot_kind='legacy_full'
order by l.basket_id,l.built_at,l.created_at,l.id;

create or replace view public.basket_split_availability_v1 with(security_invoker=true) as
with hygiene as (
 select k.id kit_template_id,l.lot_id,l.short_code,l.quantity_available from public.basket_kit_templates k
 left join public.basket_current_kit_lot_v2 l on l.kit_template_id=k.id where k.kind='hygiene' and k.is_active=true limit 1
),food as (
 select k.basket_id,k.id kit_template_id,l.lot_id,l.short_code,l.quantity_available from public.basket_kit_templates k
 left join public.basket_current_kit_lot_v2 l on l.kit_template_id=k.id where k.kind='food' and k.is_active=true
)
select bt.id basket_id,bt.name,bt.uses_hygiene_kit,bt.split_kits_enabled,
 f.kit_template_id food_kit_template_id,f.lot_id food_lot_id,f.short_code food_short_code,coalesce(f.quantity_available,0)::integer food_available,
 h.kit_template_id hygiene_kit_template_id,case when bt.uses_hygiene_kit then h.lot_id else null end hygiene_lot_id,
 case when bt.uses_hygiene_kit then h.short_code else null end hygiene_short_code,
 case when bt.uses_hygiene_kit then coalesce(h.quantity_available,0) else 2147483647 end::integer hygiene_available,
 case when bt.split_kits_enabled=false then 0 when f.lot_id is null then 0 when bt.uses_hygiene_kit and h.lot_id is null then 0
 else least(coalesce(f.quantity_available,0),case when bt.uses_hygiene_kit then coalesce(h.quantity_available,0) else coalesce(f.quantity_available,0) end) end::integer split_available
from public.basket_templates bt left join food f on f.basket_id=bt.id left join hygiene h on true;

revoke all on public.basket_current_kit_lot_v2 from public,anon,authenticated;
revoke all on public.basket_current_lot_v1 from public,anon,authenticated;
revoke all on public.basket_split_availability_v1 from public,anon,authenticated;
grant select on public.basket_current_kit_lot_v2 to service_role;
grant select on public.basket_current_lot_v1 to service_role;
grant select on public.basket_split_availability_v1 to service_role;

CREATE OR REPLACE FUNCTION public.next_basket_kit_short_code_v1(p_kit_template_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_prefix text;
  v_digit text;
begin
  select code_prefix into v_prefix
  from public.basket_kit_templates
  where id=p_kit_template_id and is_active=true;
  if v_prefix is null then raise exception 'kit_template_not_found'; end if;

  for v_digit in
    select x from unnest(array['1','2','3','4','5','6','7','8','9','0']) x
  loop
    if not exists(
      select 1 from public.basket_stock_lots
      where short_code=v_prefix||v_digit
        and status in ('draft','ready')
    ) then
      return v_prefix||v_digit;
    end if;
  end loop;

  raise exception 'kit_short_code_exhausted';
end;
$function$
;
CREATE OR REPLACE FUNCTION public.create_basket_kit_lot_v1(p_kit_template_id uuid, p_quantity integer, p_items jsonb, p_operator text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_short_code text DEFAULT NULL::text, p_duplicated_from_lot_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_kit public.basket_kit_templates%rowtype;
  v_lot_id uuid:=gen_random_uuid();
  v_short text;
  v_internal_code text;
  v_item jsonb;
  v_product_id uuid;
  v_kit_item_id uuid;
  v_source_item_id uuid;
  v_qty numeric;
  v_available numeric;
  v_required numeric;
  v_req record;
  v_count integer:=0;
  v_hash text;
begin
  if p_kit_template_id is null then raise exception 'invalid_kit_template'; end if;
  if coalesce(p_quantity,0)<=0 or p_quantity>500 then raise exception 'invalid_lot_quantity'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array'
     or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then
    raise exception 'empty_lot_composition';
  end if;

  if (
    select count(*)<>count(distinct value->>'product_id')
    from jsonb_array_elements(p_items)
  ) then raise exception 'duplicate_product_in_kit_lot'; end if;

  select * into v_kit
  from public.basket_kit_templates
  where id=p_kit_template_id and is_active=true
  for share;
  if not found then raise exception 'kit_template_not_found'; end if;

  v_short:=upper(trim(coalesce(p_short_code,'')));
  if v_short='' then v_short:=public.next_basket_kit_short_code_v1(p_kit_template_id); end if;
  if v_short !~ '^[A-Z]{2}[0-9]$' or left(v_short,2)<>v_kit.code_prefix then
    raise exception 'invalid_kit_short_code';
  end if;
  if exists(
    select 1 from public.basket_stock_lots
    where short_code=v_short and status in ('draft','ready')
  ) then raise exception 'kit_short_code_in_use'; end if;

  if p_duplicated_from_lot_id is not null and not exists(
    select 1 from public.basket_stock_lots
    where id=p_duplicated_from_lot_id and kit_template_id=p_kit_template_id
  ) then raise exception 'invalid_source_lot'; end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin v_product_id:=(v_item->>'product_id')::uuid;
    exception when others then raise exception 'invalid_lot_product'; end;
    begin v_kit_item_id:=nullif(v_item->>'kit_template_item_id','')::uuid;
    exception when others then v_kit_item_id:=null; end;
    begin v_source_item_id:=nullif(v_item->>'source_template_item_id','')::uuid;
    exception when others then v_source_item_id:=null; end;
    begin v_qty:=coalesce(nullif(v_item->>'quantity_per_kit','')::numeric,0);
    exception when others then raise exception 'invalid_lot_component_quantity'; end;

    if v_qty<=0 or v_qty>100 or trunc(v_qty)<>v_qty then raise exception 'invalid_lot_component_quantity'; end if;
    if not exists(select 1 from public.products where id=v_product_id and is_active=true) then
      raise exception 'lot_product_unavailable';
    end if;
    if v_kit_item_id is not null and not exists(
      select 1 from public.basket_kit_template_items
      where id=v_kit_item_id and kit_template_id=p_kit_template_id
    ) then raise exception 'invalid_kit_template_item'; end if;
    v_count:=v_count+1;
  end loop;

  for v_req in
    select (x.value->>'product_id')::uuid as product_id,
           sum((x.value->>'quantity_per_kit')::numeric*p_quantity)::numeric as required
    from jsonb_array_elements(p_items) x(value)
    group by (x.value->>'product_id')::uuid
  loop
    select loose_sellable_stock into v_available
    from public.ops2_loose_sellable_stock_v1
    where product_id=v_req.product_id;
    v_required:=v_req.required;
    if coalesce(v_available,0)<v_required then
      raise exception 'insufficient_loose_stock:%:%:%',
        v_req.product_id,coalesce(v_available,0),v_required;
    end if;
  end loop;

  v_hash:=md5(coalesce(p_items::text,'[]'));
  v_internal_code:='KIT-'||v_short||'-'||upper(substr(replace(v_lot_id::text,'-',''),1,6));

  insert into public.basket_stock_lots(
    id,basket_id,kit_template_id,lot_kind,short_code,lot_code,status,
    quantity_built,quantity_available,composition_hash,built_at,built_by,
    notes,source,duplicated_from_lot_id,metadata
  ) values(
    v_lot_id,v_kit.basket_id,v_kit.id,v_kit.kind,v_short,v_internal_code,'ready',
    p_quantity,p_quantity,v_hash,now(),nullif(trim(coalesce(p_operator,'')),''),
    nullif(trim(coalesce(p_notes,'')),''),
    'admin',p_duplicated_from_lot_id,
    jsonb_build_object('component_count',v_count,'short_code',v_short,'split_kit',true)
  );

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id:=(v_item->>'product_id')::uuid;
    begin v_kit_item_id:=nullif(v_item->>'kit_template_item_id','')::uuid;
    exception when others then v_kit_item_id:=null; end;
    begin v_source_item_id:=nullif(v_item->>'source_template_item_id','')::uuid;
    exception when others then v_source_item_id:=null; end;
    v_qty:=(v_item->>'quantity_per_kit')::numeric;

    insert into public.basket_stock_lot_items(
      lot_id,kit_template_item_id,source_template_item_id,product_id,
      quantity_per_basket,position_order,substitution_reason,metadata
    ) values(
      v_lot_id,v_kit_item_id,v_source_item_id,v_product_id,
      v_qty,coalesce(nullif(v_item->>'position_order','')::integer,0),
      nullif(trim(coalesce(v_item->>'change_note','')),''),
      jsonb_build_object(
        'kit_kind',v_kit.kind,
        'template_product_id',nullif(v_item->>'template_product_id',''),
        'is_changed',coalesce((v_item->>'is_changed')::boolean,false)
      )
    );
  end loop;

  return jsonb_build_object(
    'ok',true,'lot_id',v_lot_id,'short_code',v_short,
    'lot_code',v_internal_code,'quantity_built',p_quantity,
    'kit_template_id',v_kit.id,'kind',v_kit.kind
  );
exception
  when unique_violation then raise exception 'kit_short_code_in_use';
end;
$function$
;
CREATE OR REPLACE FUNCTION public.enable_split_baskets_for_ready_kits_v1()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_count integer;
begin
  update public.basket_templates bt
  set split_kits_enabled=true,updated_at=now()
  where bt.is_active=true
    and exists(
      select 1
      from public.basket_kit_templates fk
      join public.basket_stock_lots fl on fl.kit_template_id=fk.id
      where fk.kind='food' and fk.basket_id=bt.id
        and fl.status='ready' and fl.quantity_available>0
    )
    and (
      bt.uses_hygiene_kit=false
      or exists(
        select 1
        from public.basket_kit_templates hk
        join public.basket_stock_lots hl on hl.kit_template_id=hk.id
        where hk.kind='hygiene' and hk.is_active=true
          and hl.status='ready' and hl.quantity_available>0
      )
    )
    and bt.split_kits_enabled=false;
  get diagnostics v_count=row_count;
  return v_count;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.basket_group_matches_lot_v1(p_components jsonb, p_group text, p_lot_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with expected as (
    select li.product_id::text product_id,sum(li.quantity_per_basket)::numeric qty
    from public.basket_stock_lot_items li
    where li.lot_id=p_lot_id
    group by li.product_id
  ),
  supplied as (
    select x.value->>'product_id' product_id,
           sum(coalesce(nullif(x.value->>'quantity','')::numeric,0))::numeric qty
    from jsonb_array_elements(coalesce(p_components,'[]'::jsonb)) x(value)
    where coalesce(x.value->>'component_group','')=p_group
      and coalesce(x.value->>'product_id','')<>''
    group by x.value->>'product_id'
  ),
  diff as (
    select coalesce(e.product_id,s.product_id) product_id,
           coalesce(e.qty,0) expected_qty,
           coalesce(s.qty,0) supplied_qty
    from expected e
    full join supplied s using(product_id)
  )
  select not exists(
    select 1 from diff where abs(expected_qty-supplied_qty)>0.0001
  );
$function$
;
CREATE OR REPLACE FUNCTION public.create_vitrine_cart_order_v3(p_phone text, p_payment_method text, p_items jsonb, p_customer_snapshot jsonb DEFAULT '{}'::jsonb, p_delivery jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_phone text;
  v_customer_id uuid;
  v_order_id uuid:=gen_random_uuid();
  v_order_number text;
  v_payment_code text;
  v_payment_label text;
  v_cart jsonb:=coalesce(p_items,'[]'::jsonb);
  v_customer jsonb:=coalesce(p_customer_snapshot,'{}'::jsonb);
  v_delivery jsonb:=coalesce(p_delivery,'{}'::jsonb);
  v_line jsonb;
  v_components jsonb;
  v_basket public.basket_templates%rowtype;
  v_product public.products%rowtype;
  v_line_qty numeric;
  v_product_id uuid;
  v_unit numeric;
  v_line_total numeric;
  v_total numeric(14,2):=0;
  v_fiscal numeric(14,2):=0;
  v_item_rows jsonb:='[]'::jsonb;
  v_alloc_rows jsonb:='[]'::jsonb;
  v_sep_rows jsonb:='[]'::jsonb;
  v_loose_demand jsonb:='{}'::jsonb;
  v_lot_demand jsonb:='{}'::jsonb;
  v_current_demand numeric;
  v_existing_stock numeric;
  v_pair record;
  v_basket_unit numeric;
  v_basket_fiscal_unit numeric;
  v_group text;
  v_group_lot_id uuid;
  v_group_kind text;
  v_group_changed boolean;
  v_group_short text;
  v_food_lot_id uuid;
  v_hygiene_lot_id uuid;
  v_food_changed boolean:=false;
  v_hygiene_changed boolean:=false;
  v_food_short text:=null;
  v_hygiene_short text:=null;
  v_lot_requested integer;
  v_li record;
  v_selected_qty numeric;
  v_base_qty numeric;
  v_min numeric;
  v_max numeric;
  v_delta numeric;
  v_preassembled_units numeric;
  v_loose_units numeric;
  v_component_snapshot jsonb;
  v_addr jsonb;
  v_first_basket uuid:=null;
  v_basket_names text[]:='{}'::text[];
  v_all_split boolean;
begin
  v_phone:=public.normalize_storefront_phone_v2(p_phone);
  if jsonb_typeof(v_cart)<>'array' or jsonb_array_length(v_cart)=0 then raise exception 'cart_empty'; end if;
  if jsonb_array_length(v_cart)>80 then raise exception 'too_many_items'; end if;

  select not exists(
    select 1 from public.basket_templates
    where is_active=true and split_kits_enabled=false
  ) into v_all_split;
  if not v_all_split then raise exception 'split_kits_not_globally_ready'; end if;

  v_payment_label:=trim(coalesce(p_payment_method,''));
  v_payment_code:=case v_payment_label
    when 'PIX' then 'pix'
    when 'Dinheiro' then 'cash'
    when 'Cartão de crédito' then 'credit_card'
    when 'Cartão alimentação/refeição' then 'food_card'
    else null
  end;
  if v_payment_code is null then raise exception 'invalid_payment'; end if;

  begin
    if coalesce(v_customer->>'id','')<>'' then
      v_customer_id:=(v_customer->>'id')::uuid;
      if not exists(select 1 from public.customers where id=v_customer_id) then v_customer_id:=null; end if;
    end if;
  exception when others then v_customer_id:=null;
  end;
  if v_customer_id is null then
    select id into v_customer_id from public.customers where primary_whatsapp_e164=v_phone limit 1;
  end if;
  if v_customer_id is null then
    select customer_id into v_customer_id
    from public.customer_phones where phone_e164=v_phone
    order by is_primary desc,created_at asc limit 1;
  end if;

  for v_line in select value from jsonb_array_elements(v_cart) loop
    if jsonb_typeof(v_line)<>'object' then raise exception 'item_must_be_object'; end if;
    if coalesce(v_line->>'type','product') not in ('product','basket') then raise exception 'invalid_item_type'; end if;
    begin v_line_qty:=coalesce(nullif(v_line->>'qty','')::numeric,1);
    exception when others then raise exception 'invalid_quantity'; end;
    if v_line_qty<=0 or v_line_qty>30 or trunc(v_line_qty)<>v_line_qty then raise exception 'invalid_quantity'; end if;

    if coalesce(v_line->>'type','product')='product' then
      begin v_product_id:=(v_line->>'id')::uuid;
      exception when others then raise exception 'invalid_product_id'; end;
      select * into v_product from public.products where id=v_product_id and is_active=true;
      if not found or v_product.price is null then raise exception 'product_unavailable'; end if;
      select loose_sellable_stock into v_existing_stock
      from public.ops2_loose_sellable_stock_v1
      where product_id=v_product.id and is_active=true;
      if coalesce(v_existing_stock,0)<=0 then raise exception 'product_unavailable'; end if;

      v_unit:=case when v_product.is_offer=true and v_product.offer_price is not null and v_product.offer_price>=0
                   then v_product.offer_price else v_product.price end;
      v_line_total:=round(v_unit*v_line_qty,2);
      v_total:=v_total+v_line_total;
      v_fiscal:=v_fiscal+v_line_total;
      v_current_demand:=coalesce((v_loose_demand->>v_product.id::text)::numeric,0)+v_line_qty;
      v_loose_demand:=jsonb_set(v_loose_demand,array[v_product.id::text],to_jsonb(v_current_demand),true);
      v_item_rows:=v_item_rows||jsonb_build_array(jsonb_build_object(
        'product_id',v_product.id,'sku',v_product.sku,'name',v_product.name,
        'quantity',v_line_qty,'unit_price',v_unit,'line_total',v_line_total,
        'metadata',jsonb_build_object(
          'source','vitrine_direct','history_kind','product',
          'image_url',coalesce(v_product.image_url,'')
        )
      ));
      continue;
    end if;

    begin
      select * into v_basket
      from public.basket_templates
      where id=(v_line->>'id')::uuid and is_active=true and split_kits_enabled=true;
    exception when others then raise exception 'invalid_basket_id'; end;
    if not found then raise exception 'basket_unavailable'; end if;

    if v_first_basket is null then v_first_basket:=v_basket.id; end if;
    if not (v_basket.name=any(v_basket_names)) then v_basket_names:=array_append(v_basket_names,v_basket.name); end if;

    v_components:=coalesce(v_line->'components','[]'::jsonb);
    if jsonb_typeof(v_components)<>'array' or jsonb_array_length(v_components)=0 then
      raise exception 'basket_components_required';
    end if;

    begin v_food_lot_id:=nullif(v_line->>'food_lot_id','')::uuid;
    exception when others then v_food_lot_id:=null; end;
    begin v_hygiene_lot_id:=nullif(v_line->>'hygiene_lot_id','')::uuid;
    exception when others then v_hygiene_lot_id:=null; end;
    if v_food_lot_id is null then raise exception 'basket_food_lot_required'; end if;
    if v_basket.uses_hygiene_kit and v_hygiene_lot_id is null then raise exception 'basket_hygiene_lot_required'; end if;

    if not exists(
      select 1
      from public.basket_stock_lots l
      join public.basket_kit_templates k on k.id=l.kit_template_id
      where l.id=v_food_lot_id and k.kind='food' and k.basket_id=v_basket.id
    ) then raise exception 'basket_food_lot_invalid'; end if;
    if v_basket.uses_hygiene_kit and not exists(
      select 1
      from public.basket_stock_lots l
      join public.basket_kit_templates k on k.id=l.kit_template_id
      where l.id=v_hygiene_lot_id and k.kind='hygiene'
    ) then raise exception 'basket_hygiene_lot_invalid'; end if;

    v_food_changed:=not public.basket_group_matches_lot_v1(v_components,'food',v_food_lot_id);
    v_hygiene_changed:=case when v_basket.uses_hygiene_kit
      then not public.basket_group_matches_lot_v1(v_components,'hygiene',v_hygiene_lot_id)
      else false end;

    v_basket_unit:=coalesce(v_basket.base_price,0);
    v_basket_fiscal_unit:=0;
    v_food_short:=null;
    v_hygiene_short:=null;

    foreach v_group in array array['food','hygiene'] loop
      if v_group='hygiene' and not v_basket.uses_hygiene_kit then continue; end if;
      v_group_lot_id:=case when v_group='food' then v_food_lot_id else v_hygiene_lot_id end;
      v_group_changed:=case when v_group='food' then v_food_changed else v_hygiene_changed end;
      v_group_kind:=v_group;

      select short_code into v_group_short
      from public.basket_stock_lots where id=v_group_lot_id;
      if v_group='food' then v_food_short:=v_group_short; else v_hygiene_short:=v_group_short; end if;

      if not v_group_changed then
        perform 1
        from public.basket_stock_lots
        where id=v_group_lot_id and status='ready' and quantity_available>0
        for update;
        if not found then raise exception 'basket_kit_lot_unavailable'; end if;

        v_lot_requested:=coalesce((v_lot_demand->>v_group_lot_id::text)::integer,0)+v_line_qty::integer;
        select quantity_available into v_existing_stock
        from public.basket_stock_lots where id=v_group_lot_id;
        if v_lot_requested>coalesce(v_existing_stock,0) then raise exception 'basket_kit_lot_insufficient'; end if;
        v_lot_demand:=jsonb_set(v_lot_demand,array[v_group_lot_id::text],to_jsonb(v_lot_requested),true);

        select coalesce(jsonb_agg(jsonb_build_object(
          'product_id',li.product_id,'quantity_per_kit',li.quantity_per_basket,
          'kit_template_item_id',li.kit_template_item_id
        ) order by li.position_order,li.created_at),'[]'::jsonb)
        into v_component_snapshot
        from public.basket_stock_lot_items li
        where li.lot_id=v_group_lot_id;

        v_alloc_rows:=v_alloc_rows||jsonb_build_array(jsonb_build_object(
          'basket_id',v_basket.id,'lot_id',v_group_lot_id,'quantity',v_line_qty,
          'allocation_role',v_group_kind,'short_code',v_group_short,
          'component_snapshot',v_component_snapshot
        ));
      end if;

      if exists(
        select 1
        from jsonb_array_elements(v_components) c
        where coalesce(c->>'component_group','')=v_group
          and coalesce(c->>'product_id','')<>''
          and not exists(
            select 1 from public.basket_stock_lot_items li
            where li.lot_id=v_group_lot_id and li.product_id::text=c->>'product_id'
          )
      ) then raise exception 'basket_component_not_in_selected_kit'; end if;

      for v_li in
        select
          li.product_id,
          li.quantity_per_basket,
          li.position_order,
          li.kit_template_item_id,
          ki.removable,ki.quantity_editable,ki.min_quantity,ki.max_quantity,
          ki.remove_unit_delta,ki.add_unit_delta
        from public.basket_stock_lot_items li
        left join public.basket_kit_template_items ki on ki.id=li.kit_template_item_id
        where li.lot_id=v_group_lot_id
        order by li.position_order,li.created_at,li.id
      loop
        select * into v_product from public.products where id=v_li.product_id and is_active=true;
        if not found then raise exception 'basket_product_unavailable'; end if;

        v_base_qty:=v_li.quantity_per_basket;
        select coalesce(sum(nullif(c.value->>'quantity','')::numeric),0)
        into v_selected_qty
        from jsonb_array_elements(v_components) c(value)
        where coalesce(c.value->>'component_group','')=v_group
          and c.value->>'product_id'=v_li.product_id::text;

        if v_selected_qty<0 or v_selected_qty>100 or trunc(v_selected_qty)<>v_selected_qty then
          raise exception 'invalid_basket_quantity';
        end if;

        if v_selected_qty=0 and coalesce(v_li.removable,true)=false then raise exception 'item_not_removable'; end if;
        if v_selected_qty<v_base_qty
           and not (coalesce(v_li.removable,true) or coalesce(v_li.quantity_editable,true)) then
          raise exception 'quantity_not_editable';
        end if;
        if v_selected_qty>v_base_qty and coalesce(v_li.quantity_editable,true)=false then
          raise exception 'quantity_not_editable';
        end if;

        select coalesce(loose_sellable_stock,0) into v_existing_stock
        from public.ops2_loose_sellable_stock_v1
        where product_id=v_product.id;
        v_min:=greatest(0,coalesce(v_li.min_quantity,case when coalesce(v_li.removable,true) then 0 else v_base_qty end));
        v_max:=coalesce(v_li.max_quantity,
          case when v_group_changed then floor(coalesce(v_existing_stock,0)) else v_base_qty+floor(coalesce(v_existing_stock,0)) end);
        if v_selected_qty<v_min or v_selected_qty>v_max then raise exception 'basket_quantity_out_of_range'; end if;

        v_delta:=0;
        if v_selected_qty<v_base_qty then
          v_delta:=abs(v_selected_qty-v_base_qty)*coalesce(v_li.remove_unit_delta,-coalesce(v_product.price,0));
        elsif v_selected_qty>v_base_qty then
          v_delta:=(v_selected_qty-v_base_qty)*coalesce(v_li.add_unit_delta,coalesce(v_product.price,0));
        end if;
        v_basket_unit:=v_basket_unit+v_delta;

        if v_selected_qty>0 then
          v_unit:=coalesce(v_product.price,0);
          v_line_total:=round(v_unit*v_selected_qty*v_line_qty,2);
          v_basket_fiscal_unit:=v_basket_fiscal_unit+round(v_unit*v_selected_qty,2);
          v_preassembled_units:=case when v_group_changed then 0 else v_selected_qty*v_line_qty end;
          v_loose_units:=v_selected_qty*v_line_qty-v_preassembled_units;

          if v_loose_units>0 then
            v_current_demand:=coalesce((v_loose_demand->>v_product.id::text)::numeric,0)+v_loose_units;
            v_loose_demand:=jsonb_set(v_loose_demand,array[v_product.id::text],to_jsonb(v_current_demand),true);
          end if;

          v_item_rows:=v_item_rows||jsonb_build_array(jsonb_build_object(
            'product_id',v_product.id,'sku',v_product.sku,'name',v_product.name,
            'quantity',v_selected_qty*v_line_qty,'unit_price',v_unit,'line_total',v_line_total,
            'metadata',jsonb_build_object(
              'source','vitrine_direct','history_kind','basket_component',
              'parent_basket_name',v_basket.name,'basket_id',v_basket.id,
              'basket_name',v_basket.name,'basket_quantity',v_line_qty,
              'component_group',v_group,'group_mode',case when v_group_changed then 'loose' else 'lot' end,
              'kit_lot_id',v_group_lot_id,'kit_lot_short_code',case when v_group_changed then null else v_group_short end,
              'base_quantity',v_base_qty,'selected_quantity',v_selected_qty,
              'preassembled_units',v_preassembled_units,'loose_quantity',v_loose_units,
              'commercial_delta_per_basket',v_delta,'image_url',coalesce(v_product.image_url,'')
            )
          ));
        end if;
      end loop;
    end loop;

    if v_basket_unit<0 then raise exception 'invalid_order_total'; end if;
    v_total:=v_total+round(v_basket_unit*v_line_qty,2);
    v_fiscal:=v_fiscal+round(v_basket_fiscal_unit*v_line_qty,2);

    v_item_rows:=v_item_rows||jsonb_build_array(jsonb_build_object(
      'product_id',null,'sku',null,'name',v_basket.name,
      'quantity',v_line_qty,'unit_price',round(v_basket_unit,2),'line_total',round(v_basket_unit*v_line_qty,2),
      'metadata',jsonb_build_object(
        'source','vitrine_direct','history_kind','basket','basket_id',v_basket.id,
        'image_url',coalesce(v_basket.image_url,''),
        'food_mode',case when v_food_changed then 'loose' else 'lot' end,
        'food_lot_id',v_food_lot_id,
        'food_lot_short_code',case when v_food_changed then null else v_food_short end,
        'hygiene_required',v_basket.uses_hygiene_kit,
        'hygiene_mode',case when not v_basket.uses_hygiene_kit then 'none' when v_hygiene_changed then 'loose' else 'lot' end,
        'hygiene_lot_id',case when v_basket.uses_hygiene_kit then v_hygiene_lot_id else null end,
        'hygiene_lot_short_code',case when v_basket.uses_hygiene_kit and not v_hygiene_changed then v_hygiene_short else null end,
        'commercial_base_price',v_basket.base_price,
        'hidden_value_preserved',true
      )
    ));

    v_sep_rows:=v_sep_rows||jsonb_build_array(jsonb_build_object(
      'basket_id',v_basket.id,'basket_name',v_basket.name,'quantity',v_line_qty,
      'food',jsonb_build_object(
        'mode',case when v_food_changed then 'loose' else 'lot' end,
        'lot_id',case when v_food_changed then null else v_food_lot_id end,
        'short_code',case when v_food_changed then null else v_food_short end
      ),
      'hygiene',case when not v_basket.uses_hygiene_kit then jsonb_build_object('mode','none')
        else jsonb_build_object(
          'mode',case when v_hygiene_changed then 'loose' else 'lot' end,
          'lot_id',case when v_hygiene_changed then null else v_hygiene_lot_id end,
          'short_code',case when v_hygiene_changed then null else v_hygiene_short end
        ) end
    ));
  end loop;

  if v_total<75 then raise exception 'minimum_order'; end if;

  for v_pair in select key,value from jsonb_each_text(v_loose_demand) loop
    perform 1 from public.products where id=v_pair.key::uuid and is_active=true for update;
    if not found then raise exception 'product_unavailable'; end if;
    select loose_sellable_stock into v_existing_stock
    from public.ops2_loose_sellable_stock_v1
    where product_id=v_pair.key::uuid and is_active=true;
    if not found then raise exception 'product_unavailable'; end if;
    if coalesce(v_existing_stock,0)<v_pair.value::numeric then
      raise exception 'insufficient_stock';
    end if;
  end loop;

  v_order_number:='DA-'||to_char(clock_timestamp() at time zone 'America/Cuiaba','YYMMDD')||'-'||upper(substr(replace(v_order_id::text,'-',''),1,8));
  v_addr:=jsonb_strip_nulls(jsonb_build_object(
    'customer_name',nullif(v_customer->>'display_name',''),'source_customer_id',v_customer_id,
    'phone',v_phone,'street',nullif(v_customer#>>'{address,street}',''),
    'number',nullif(v_customer#>>'{address,number}',''),'complement',nullif(v_customer#>>'{address,complement}',''),
    'district',coalesce(nullif(v_customer#>>'{address,district}',''),nullif(v_customer#>>'{address,neighborhood}','')),
    'city',nullif(v_customer#>>'{address,city}',''),'state',nullif(v_customer#>>'{address,state}',''),
    'postal_code',nullif(v_customer#>>'{address,postal_code}',''),'raw_text',nullif(v_customer#>>'{address,raw_text}',''),
    'google_maps_url',nullif(v_customer#>>'{address,google_maps_url}',''),
    'delivery_date',nullif(v_delivery->>'date',''),'delivery_label',nullif(v_delivery->>'label',''),
    'delivery_reason',nullif(v_delivery->>'reason',''),'delivery_time_zone',nullif(v_delivery->>'time_zone',''),
    'delivery_cutoff_hour',v_delivery->'cutoff_hour'
  ));

  insert into public.orders(
    id,customer_id,status,total,currency,delivery_address,customer_snapshot,confirmed_at,
    created_at,updated_at,basket_id,fiscal_subtotal,other_expenses,discount,sync_status,
    idempotency_key,payment_method,phone_e164,source,subtotal,order_number,basket_name_snapshot,
    checkout_snapshot
  ) values(
    v_order_id,v_customer_id,'storefront_received',round(v_total,2),'BRL',coalesce(v_addr,'{}'::jsonb),
    jsonb_strip_nulls(jsonb_build_object(
      'customer_id',v_customer_id,'name',nullif(v_customer->>'display_name',''),
      'phone_e164',v_phone,'status',case when v_customer_id is null then 'new' else 'registered' end
    )),
    null,now(),now(),
    case when array_length(v_basket_names,1)=1 then v_first_basket else null end,
    round(v_fiscal,2),greatest(round(v_total-v_fiscal,2),0),greatest(round(v_fiscal-v_total,2),0),
    'local','vitrine-direct-v3:'||v_order_id::text,v_payment_code,v_phone,'vitrine',
    round(v_total,2),v_order_number,
    case when array_length(v_basket_names,1)=1 then v_basket_names[1] else null end,
    jsonb_build_object(
      'source','vitrine_direct','cart',v_cart,'payment_label',v_payment_label,
      'delivery',v_delivery,'customer',v_customer,'basket_names',to_jsonb(v_basket_names),
      'split_kits',true,'separation_plan',v_sep_rows,'hidden_value_preserved',true
    )
  );

  for v_line in select value from jsonb_array_elements(v_item_rows) loop
    insert into public.order_items(order_id,product_id,sku_snapshot,name_snapshot,quantity,unit_price,line_total,metadata)
    values(
      v_order_id,
      case when nullif(v_line->>'product_id','') is null then null else (v_line->>'product_id')::uuid end,
      nullif(v_line->>'sku',''),v_line->>'name',
      (v_line->>'quantity')::numeric,(v_line->>'unit_price')::numeric,(v_line->>'line_total')::numeric,
      coalesce(v_line->'metadata','{}'::jsonb)
    );
  end loop;

  for v_line in select value from jsonb_array_elements(v_alloc_rows) loop
    update public.basket_stock_lots
    set quantity_available=quantity_available-(v_line->>'quantity')::integer,
        status=case when quantity_available-(v_line->>'quantity')::integer=0 then 'depleted' else 'ready' end,
        updated_at=now()
    where id=(v_line->>'lot_id')::uuid
      and status='ready'
      and quantity_available>=(v_line->>'quantity')::integer;
    if not found then raise exception 'basket_kit_lot_insufficient'; end if;

    insert into public.basket_stock_allocations(
      order_id,basket_id,lot_id,quantity,status,component_snapshot,allocation_role,metadata
    ) values(
      v_order_id,(v_line->>'basket_id')::uuid,(v_line->>'lot_id')::uuid,
      (v_line->>'quantity')::integer,'allocated',
      coalesce(v_line->'component_snapshot','[]'::jsonb),
      v_line->>'allocation_role',
      jsonb_build_object(
        'source','order_create_v3','preassembled',true,
        'short_code',v_line->>'short_code','allocation_role',v_line->>'allocation_role'
      )
    )
    on conflict(order_id,lot_id,basket_id,allocation_role) do update
      set quantity=public.basket_stock_allocations.quantity+excluded.quantity,
          component_snapshot=excluded.component_snapshot,
          metadata=excluded.metadata;
  end loop;

  return jsonb_build_object(
    'order_id',v_order_id,'order_number',v_order_number,
    'total_cents',round(v_total*100)::bigint,'total',round(v_total,2),
    'customer_id',v_customer_id,'phone_e164',v_phone,'payment_method',v_payment_label,
    'split_kits',true,'separation_plan',v_sep_rows,'hidden_value_preserved',true
  );
end;
$function$
;

revoke all on function public.next_basket_kit_short_code_v1(uuid) from public,anon,authenticated;
grant execute on function public.next_basket_kit_short_code_v1(uuid) to service_role;
revoke all on function public.create_basket_kit_lot_v1(uuid,integer,jsonb,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.create_basket_kit_lot_v1(uuid,integer,jsonb,text,text,text,uuid) to service_role;
revoke all on function public.enable_split_baskets_for_ready_kits_v1() from public,anon,authenticated;
grant execute on function public.enable_split_baskets_for_ready_kits_v1() to service_role;
revoke all on function public.basket_group_matches_lot_v1(jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.basket_group_matches_lot_v1(jsonb,text,uuid) to service_role;
revoke all on function public.create_vitrine_cart_order_v3(text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_vitrine_cart_order_v3(text,text,jsonb,jsonb,jsonb) to service_role;
