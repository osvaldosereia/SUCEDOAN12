-- Dona Antônia · Cestas pré-montadas por lote
-- Canonical repository snapshot of the live migration set applied on 2026-09-29.
-- Supabase migrations: basket_premounted_lots_v1, basket_premounted_order_engine_v2,
-- basket_lot_cumulative_stock_guard_v1, basket_premounted_fk_indexes_v1,
-- basket_lot_legacy_component_compat_v1.

create table if not exists public.basket_template_item_alternatives (
  id uuid primary key default gen_random_uuid(),
  template_item_id uuid not null references public.basket_template_items(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  priority integer not null default 100 check (priority between 1 and 9999),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(template_item_id,product_id)
);

create table if not exists public.basket_stock_lots (
  id uuid primary key default gen_random_uuid(),
  basket_id uuid not null references public.basket_templates(id) on delete restrict,
  lot_code text not null unique,
  status text not null default 'ready' check (status in ('draft','ready','depleted','cancelled')),
  quantity_built integer not null check (quantity_built>0),
  quantity_available integer not null check (quantity_available>=0),
  composition_hash text,
  built_at timestamptz not null default now(),
  built_by text,
  notes text,
  source text not null default 'admin' check (source in ('admin','bootstrap_existing','import')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (quantity_available<=quantity_built)
);

create table if not exists public.basket_stock_lot_items (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.basket_stock_lots(id) on delete cascade,
  source_template_item_id uuid references public.basket_template_items(id) on delete set null,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity_per_basket numeric(14,3) not null check (quantity_per_basket>0),
  position_order integer not null default 0,
  substitution_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.basket_stock_allocations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  basket_id uuid not null references public.basket_templates(id) on delete restrict,
  lot_id uuid not null references public.basket_stock_lots(id) on delete restrict,
  quantity integer not null check (quantity>0),
  status text not null default 'allocated' check (status in ('allocated','consumed','released')),
  component_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  released_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique(order_id,lot_id)
);

create index if not exists basket_alternatives_item_idx on public.basket_template_item_alternatives(template_item_id,priority);
create index if not exists basket_alternatives_product_idx on public.basket_template_item_alternatives(product_id);
create index if not exists basket_lots_basket_ready_idx on public.basket_stock_lots(basket_id,status,built_at,created_at);
create index if not exists basket_lot_items_lot_idx on public.basket_stock_lot_items(lot_id,position_order);
create index if not exists basket_lot_items_product_idx on public.basket_stock_lot_items(product_id);
create index if not exists basket_lot_items_template_item_idx on public.basket_stock_lot_items(source_template_item_id);
create index if not exists basket_allocations_order_idx on public.basket_stock_allocations(order_id,status);
create index if not exists basket_allocations_lot_idx on public.basket_stock_allocations(lot_id,status);
create index if not exists basket_allocations_basket_idx on public.basket_stock_allocations(basket_id);

alter table public.basket_template_item_alternatives enable row level security;
alter table public.basket_stock_lots enable row level security;
alter table public.basket_stock_lot_items enable row level security;
alter table public.basket_stock_allocations enable row level security;

revoke all on public.basket_template_item_alternatives from anon,authenticated;
revoke all on public.basket_stock_lots from anon,authenticated;
revoke all on public.basket_stock_lot_items from anon,authenticated;
revoke all on public.basket_stock_allocations from anon,authenticated;
grant all on public.basket_template_item_alternatives to service_role;
grant all on public.basket_stock_lots to service_role;
grant all on public.basket_stock_lot_items to service_role;
grant all on public.basket_stock_allocations to service_role;

create or replace view public.basket_locked_component_stock_v1 with (security_invoker=true) as
 WITH available_lots AS (
         SELECT li.product_id,
            sum(li.quantity_per_basket * l.quantity_available::numeric) AS qty
           FROM basket_stock_lots l
             JOIN basket_stock_lot_items li ON li.lot_id = l.id
          WHERE (l.status = ANY (ARRAY['ready'::text, 'depleted'::text])) AND l.quantity_available > 0
          GROUP BY li.product_id
        ), active_allocations AS (
         SELECT li.product_id,
            sum(li.quantity_per_basket * a_1.quantity::numeric) AS qty
           FROM basket_stock_allocations a_1
             JOIN basket_stock_lot_items li ON li.lot_id = a_1.lot_id
          WHERE a_1.status = 'allocated'::text
          GROUP BY li.product_id
        )
 SELECT p.id AS product_id,
    COALESCE(a.qty, 0::numeric) + COALESCE(x.qty, 0::numeric) AS basket_locked_quantity
   FROM products p
     LEFT JOIN available_lots a ON a.product_id = p.id
     LEFT JOIN active_allocations x ON x.product_id = p.id
  WHERE (COALESCE(a.qty, 0::numeric) + COALESCE(x.qty, 0::numeric)) > 0::numeric;;

create or replace view public.ops2_loose_sellable_stock_v1 with (security_invoker=true) as
 SELECT s.product_id,
    s.name,
    s.sku,
    s.gtin,
    s.is_active,
    s.legacy_stock,
    s.bling_product_id,
    s.link_status,
    s.bling_physical_total,
    s.bling_virtual_total,
    s.selected_deposit_id,
    s.sellable_physical,
    s.sellable_virtual,
    s.mirror_observed_at,
    s.source_event_id,
    s.source_resource,
    s.stock_authority,
    s.stock_cutover_at,
    s.bling_stock_ready,
    s.effective_sellable_stock,
    s.stock_source_reason,
    COALESCE(l.basket_locked_quantity, 0::numeric) AS basket_locked_quantity,
    GREATEST(0::numeric, COALESCE(s.effective_sellable_stock, 0::numeric) - COALESCE(l.basket_locked_quantity, 0::numeric)) AS loose_sellable_stock
   FROM ops2_sellable_stock_v1 s
     LEFT JOIN basket_locked_component_stock_v1 l ON l.product_id = s.product_id;;

create or replace view public.basket_current_lot_v1 with (security_invoker=true) as
 SELECT DISTINCT ON (basket_id) basket_id,
    id AS lot_id,
    lot_code,
    quantity_built,
    quantity_available,
    composition_hash,
    built_at,
    built_by,
    source,
    metadata
   FROM basket_stock_lots l
  WHERE status = 'ready'::text AND quantity_available > 0
  ORDER BY basket_id, built_at, created_at, id;;

revoke all on public.basket_locked_component_stock_v1 from public,anon,authenticated;
revoke all on public.ops2_loose_sellable_stock_v1 from public,anon,authenticated;
revoke all on public.basket_current_lot_v1 from public,anon,authenticated;
grant select on public.basket_locked_component_stock_v1 to service_role;
grant select on public.ops2_loose_sellable_stock_v1 to service_role;
grant select on public.basket_current_lot_v1 to service_role;

CREATE OR REPLACE FUNCTION public.create_basket_stock_lot_v1(p_basket_id uuid, p_quantity integer, p_items jsonb, p_operator text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_source text DEFAULT 'admin'::text, p_allow_stock_gap boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_basket public.basket_templates%rowtype;
  v_lot_id uuid:=gen_random_uuid();
  v_code text;
  v_item jsonb;
  v_product_id uuid;
  v_template_item_id uuid;
  v_qty numeric;
  v_available numeric;
  v_required numeric;
  v_hash text;
  v_gap jsonb:='[]'::jsonb;
  v_count integer:=0;
  v_req record;
begin
  if p_basket_id is null then raise exception 'invalid_basket'; end if;
  if coalesce(p_quantity,0)<=0 or p_quantity>500 then raise exception 'invalid_lot_quantity'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then
    raise exception 'empty_lot_composition';
  end if;

  select * into v_basket from public.basket_templates where id=p_basket_id and is_active=true;
  if not found then raise exception 'basket_not_found'; end if;

  v_hash:=md5(coalesce(p_items::text,'[]'));
  v_code:='CB-'||to_char(clock_timestamp() at time zone 'America/Cuiaba','YYMMDD')||'-'
          ||lpad(coalesce(v_basket.sort_order,0)::text,2,'0')||'-'
          ||upper(substr(replace(v_lot_id::text,'-',''),1,4));

  -- Validate each position first.
  for v_item in select value from jsonb_array_elements(p_items) loop
    begin v_product_id:=(v_item->>'product_id')::uuid;
    exception when others then raise exception 'invalid_lot_product'; end;
    begin v_template_item_id:=nullif(v_item->>'template_item_id','')::uuid;
    exception when others then v_template_item_id:=null; end;
    begin v_qty:=coalesce(nullif(v_item->>'quantity_per_basket','')::numeric,0);
    exception when others then raise exception 'invalid_lot_component_quantity'; end;
    if v_qty<=0 or v_qty>100 then raise exception 'invalid_lot_component_quantity'; end if;
    if not exists(select 1 from public.products where id=v_product_id and is_active=true) then
      raise exception 'lot_product_unavailable';
    end if;
    if v_template_item_id is not null and not exists(
      select 1 from public.basket_template_items
      where id=v_template_item_id and basket_id=p_basket_id
    ) then raise exception 'invalid_template_item'; end if;
    v_count:=v_count+1;
  end loop;

  -- Validate cumulative demand per SKU. A substitute may fill more than one position.
  for v_req in
    select (x.value->>'product_id')::uuid as product_id,
           sum((x.value->>'quantity_per_basket')::numeric * p_quantity)::numeric as required
    from jsonb_array_elements(p_items) x(value)
    group by (x.value->>'product_id')::uuid
  loop
    select loose_sellable_stock into v_available
    from public.ops2_loose_sellable_stock_v1
    where product_id=v_req.product_id;
    v_required:=v_req.required;
    if coalesce(v_available,0)<v_required then
      v_gap:=v_gap||jsonb_build_array(jsonb_build_object(
        'product_id',v_req.product_id,'available',coalesce(v_available,0),
        'required',v_required,'shortage',v_required-coalesce(v_available,0)
      ));
      if not p_allow_stock_gap then raise exception 'insufficient_loose_stock'; end if;
    end if;
  end loop;

  insert into public.basket_stock_lots(
    id,basket_id,lot_code,status,quantity_built,quantity_available,
    composition_hash,built_at,built_by,notes,source,metadata
  ) values(
    v_lot_id,p_basket_id,v_code,'ready',p_quantity,p_quantity,
    v_hash,now(),nullif(trim(coalesce(p_operator,'')),''),
    nullif(trim(coalesce(p_notes,'')),''),
    case when p_source in ('admin','bootstrap_existing','import') then p_source else 'admin' end,
    jsonb_build_object('stock_gap_at_creation',v_gap,'component_count',v_count)
  );

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id:=(v_item->>'product_id')::uuid;
    begin v_template_item_id:=nullif(v_item->>'template_item_id','')::uuid;
    exception when others then v_template_item_id:=null; end;
    v_qty:=(v_item->>'quantity_per_basket')::numeric;
    insert into public.basket_stock_lot_items(
      lot_id,source_template_item_id,product_id,quantity_per_basket,
      position_order,substitution_reason,metadata
    ) values(
      v_lot_id,v_template_item_id,v_product_id,v_qty,
      coalesce(nullif(v_item->>'position_order','')::integer,0),
      nullif(trim(coalesce(v_item->>'substitution_reason','')),''),
      jsonb_build_object(
        'template_product_id',nullif(v_item->>'template_product_id',''),
        'is_substitution',coalesce((v_item->>'is_substitution')::boolean,false)
      )
    );
  end loop;

  return jsonb_build_object(
    'ok',true,'lot_id',v_lot_id,'lot_code',v_code,
    'quantity_built',p_quantity,'stock_gap',v_gap
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.create_vitrine_cart_order_v1(p_phone text, p_payment_method text, p_items jsonb, p_customer_snapshot jsonb DEFAULT '{}'::jsonb, p_delivery jsonb DEFAULT '{}'::jsonb)
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
  v_basket public.basket_templates%rowtype;
  v_product public.products%rowtype;
  v_lot public.basket_stock_lots%rowtype;
  v_li record;
  v_product_id uuid;
  v_basket_id uuid;
  v_lot_id uuid;
  v_line_qty numeric;
  v_base_qty numeric;
  v_selected_qty numeric;
  v_min numeric;
  v_max numeric;
  v_delta numeric;
  v_unit numeric;
  v_line_total numeric;
  v_basket_unit numeric;
  v_basket_fiscal_unit numeric;
  v_total numeric(14,2):=0;
  v_fiscal numeric(14,2):=0;
  v_loose_demand jsonb:='{}'::jsonb;
  v_item_rows jsonb:='[]'::jsonb;
  v_alloc_rows jsonb:='[]'::jsonb;
  v_lot_demand jsonb:='{}'::jsonb;
  v_selected jsonb;
  v_supplied boolean;
  v_current_demand numeric;
  v_pair record;
  v_existing_stock numeric;
  v_first_basket uuid:=null;
  v_basket_names text[]:='{}'::text[];
  v_addr jsonb;
  v_preassembled_units numeric;
  v_extra_units numeric;
  v_lot_requested integer;
  v_component_snapshot jsonb;
begin
  v_phone:=public.normalize_storefront_phone_v2(p_phone);
  if jsonb_typeof(v_cart)<>'array' or jsonb_array_length(v_cart)=0 then raise exception 'cart_empty'; end if;
  if jsonb_array_length(v_cart)>80 then raise exception 'too_many_items'; end if;

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
    from public.customer_phones
    where phone_e164=v_phone
    order by is_primary desc,created_at asc
    limit 1;
  end if;

  for v_line in select value from jsonb_array_elements(v_cart) loop
    if jsonb_typeof(v_line)<>'object' then raise exception 'item_must_be_object'; end if;
    if coalesce(v_line->>'type','product') not in ('product','basket') then raise exception 'invalid_item_type'; end if;
    begin v_line_qty:=coalesce(nullif(v_line->>'qty','')::numeric,1);
    exception when others then raise exception 'invalid_quantity'; end;
    if v_line_qty<=0 or v_line_qty>30 or trunc(v_line_qty)<>v_line_qty then raise exception 'invalid_quantity'; end if;

    if coalesce(v_line->>'type','product')='product' then
      begin v_product_id:=(v_line->>'id')::uuid; exception when others then raise exception 'invalid_product_id'; end;
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
          'image_url',coalesce(v_product.image_url,''),
          'regular_price',v_product.price,
          'offer_price',case when v_product.is_offer then v_product.offer_price else null end
        )
      ));
    else
      begin v_basket_id:=(v_line->>'id')::uuid; exception when others then raise exception 'invalid_basket_id'; end;
      select * into v_basket from public.basket_templates where id=v_basket_id and is_active=true;
      if not found then raise exception 'basket_unavailable'; end if;

      begin v_lot_id:=nullif(v_line->>'lot_id','')::uuid;
      exception when others then v_lot_id:=null; end;

      if v_lot_id is not null then
        select * into v_lot
        from public.basket_stock_lots
        where id=v_lot_id and basket_id=v_basket_id and status='ready' and quantity_available>0
        for update;
      else
        select * into v_lot
        from public.basket_stock_lots
        where basket_id=v_basket_id and status='ready' and quantity_available>0
        order by built_at,created_at,id
        limit 1
        for update;
      end if;
      if not found then raise exception 'basket_lot_unavailable'; end if;

      v_lot_requested:=coalesce((v_lot_demand->>v_lot.id::text)::integer,0)+v_line_qty::integer;
      if v_lot_requested>v_lot.quantity_available then raise exception 'basket_lot_insufficient'; end if;
      v_lot_demand:=jsonb_set(v_lot_demand,array[v_lot.id::text],to_jsonb(v_lot_requested),true);

      if v_first_basket is null then v_first_basket:=v_basket.id; end if;
      if not (v_basket.name=any(v_basket_names)) then v_basket_names:=array_append(v_basket_names,v_basket.name); end if;
      v_basket_unit:=coalesce(v_basket.base_price,0);
      if v_basket_unit<0 then raise exception 'basket_price_invalid'; end if;
      v_basket_fiscal_unit:=0;
      v_supplied:=jsonb_typeof(v_line->'components')='array' and jsonb_array_length(v_line->'components')>0;

      for v_li in
        select
          li.id as lot_item_id,
          li.source_template_item_id,
          li.product_id as actual_product_id,
          li.quantity_per_basket,
          li.position_order,
          ti.product_id as template_product_id,
          ti.removable,
          ti.quantity_editable,
          ti.min_quantity,
          ti.max_quantity,
          ti.remove_unit_delta,
          ti.add_unit_delta
        from public.basket_stock_lot_items li
        left join public.basket_template_items ti on ti.id=li.source_template_item_id
        where li.lot_id=v_lot.id
        order by li.position_order,li.created_at,li.id
      loop
        select * into v_product from public.products where id=v_li.actual_product_id and is_active=true;
        if not found then raise exception 'basket_product_unavailable'; end if;

        v_base_qty:=v_li.quantity_per_basket;
        v_selected_qty:=v_base_qty;

        if v_supplied then
          v_selected:=null;
          select value into v_selected
          from jsonb_array_elements(v_line->'components')
          where value->>'product_id'=v_li.actual_product_id::text
          limit 1;
          if v_selected is null
             and v_li.template_product_id is not null
             and v_li.template_product_id<>v_li.actual_product_id then
            select value into v_selected
            from jsonb_array_elements(v_line->'components')
            where value->>'product_id'=v_li.template_product_id::text
            limit 1;
          end if;
          if v_selected is null then v_selected_qty:=0;
          else
            begin v_selected_qty:=coalesce(nullif(v_selected->>'quantity','')::numeric,0);
            exception when others then raise exception 'invalid_basket_quantity'; end;
          end if;
        end if;

        if v_selected_qty<0 or v_selected_qty>100 or trunc(v_selected_qty)<>v_selected_qty then
          raise exception 'invalid_basket_quantity';
        end if;
        if v_selected_qty=0 and not coalesce(v_li.removable,true) then raise exception 'item_not_removable'; end if;
        if v_selected_qty<v_base_qty and not (coalesce(v_li.removable,true) or coalesce(v_li.quantity_editable,true)) then
          raise exception 'quantity_not_editable';
        end if;
        if v_selected_qty>v_base_qty and not coalesce(v_li.quantity_editable,true) then
          raise exception 'quantity_not_editable';
        end if;

        select coalesce(loose_sellable_stock,0) into v_existing_stock
        from public.ops2_loose_sellable_stock_v1
        where product_id=v_product.id;
        v_min:=greatest(0,coalesce(v_li.min_quantity,case when coalesce(v_li.removable,true) then 0 else v_base_qty end));
        v_max:=coalesce(v_li.max_quantity,v_base_qty+floor(coalesce(v_existing_stock,0)));
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
          v_preassembled_units:=least(v_selected_qty,v_base_qty)*v_line_qty;
          v_extra_units:=greatest(v_selected_qty-v_base_qty,0)*v_line_qty;
          if v_extra_units>0 then
            v_current_demand:=coalesce((v_loose_demand->>v_product.id::text)::numeric,0)+v_extra_units;
            v_loose_demand:=jsonb_set(v_loose_demand,array[v_product.id::text],to_jsonb(v_current_demand),true);
          end if;
          v_item_rows:=v_item_rows||jsonb_build_array(jsonb_build_object(
            'product_id',v_product.id,'sku',v_product.sku,'name',v_product.name,
            'quantity',v_selected_qty*v_line_qty,'unit_price',v_unit,'line_total',v_line_total,
            'metadata',jsonb_build_object(
              'source','vitrine_direct','history_kind','basket_component',
              'basket_id',v_basket.id,'basket_name',v_basket.name,'basket_quantity',v_line_qty,
              'basket_lot_id',v_lot.id,'basket_lot_code',v_lot.lot_code,
              'base_quantity',v_base_qty,'selected_quantity',v_selected_qty,
              'preassembled_units',v_preassembled_units,'loose_extra_quantity',v_extra_units,
              'commercial_delta_per_basket',v_delta,'image_url',coalesce(v_product.image_url,''),
              'template_product_id',v_li.template_product_id
            )
          ));
        end if;
      end loop;

      if v_supplied and exists(
        select 1
        from jsonb_array_elements(v_line->'components') c
        where coalesce(c->>'product_id','')<>''
          and not exists(
            select 1
            from public.basket_stock_lot_items li
            left join public.basket_template_items ti on ti.id=li.source_template_item_id
            where li.lot_id=v_lot.id
              and (li.product_id::text=c->>'product_id' or ti.product_id::text=c->>'product_id')
          )
      ) then raise exception 'basket_component_not_in_lot'; end if;

      select coalesce(jsonb_agg(jsonb_build_object(
        'product_id',li.product_id,'quantity_per_basket',li.quantity_per_basket,
        'source_template_item_id',li.source_template_item_id
      ) order by li.position_order,li.created_at),'[]'::jsonb)
      into v_component_snapshot
      from public.basket_stock_lot_items li
      where li.lot_id=v_lot.id;

      v_alloc_rows:=v_alloc_rows||jsonb_build_array(jsonb_build_object(
        'basket_id',v_basket.id,'lot_id',v_lot.id,'quantity',v_line_qty,
        'component_snapshot',v_component_snapshot
      ));

      if v_basket_unit<0 then raise exception 'invalid_order_total'; end if;
      v_total:=v_total+round(v_basket_unit*v_line_qty,2);
      v_fiscal:=v_fiscal+round(v_basket_fiscal_unit*v_line_qty,2);
    end if;
  end loop;

  if v_total<75 then raise exception 'minimum_order'; end if;

  for v_pair in select key,value from jsonb_each_text(v_loose_demand) loop
    perform 1 from public.products where id=v_pair.key::uuid and is_active=true for update;
    if not found then raise exception 'product_unavailable'; end if;
    select loose_sellable_stock into v_existing_stock
    from public.ops2_loose_sellable_stock_v1
    where product_id=v_pair.key::uuid and is_active=true;
    if not found then raise exception 'product_unavailable'; end if;
    if coalesce(v_existing_stock,0)<v_pair.value::numeric then raise exception 'insufficient_stock'; end if;
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
    'local','vitrine-direct:'||v_order_id::text,v_payment_code,v_phone,'vitrine',
    round(v_total,2),v_order_number,
    case when array_length(v_basket_names,1)=1 then v_basket_names[1] else null end,
    jsonb_build_object(
      'source','vitrine_direct','cart',v_cart,'payment_label',v_payment_label,
      'delivery',v_delivery,'customer',v_customer,'basket_names',to_jsonb(v_basket_names),
      'preassembled_baskets',jsonb_array_length(v_alloc_rows)>0
    )
  );

  for v_line in select value from jsonb_array_elements(v_item_rows) loop
    insert into public.order_items(order_id,product_id,sku_snapshot,name_snapshot,quantity,unit_price,line_total,metadata)
    values(
      v_order_id,(v_line->>'product_id')::uuid,nullif(v_line->>'sku',''),v_line->>'name',
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
       and quantity_available>=(v_line->>'quantity')::integer;
    if not found then raise exception 'basket_lot_insufficient'; end if;

    insert into public.basket_stock_allocations(
      order_id,basket_id,lot_id,quantity,status,component_snapshot,metadata
    ) values(
      v_order_id,(v_line->>'basket_id')::uuid,(v_line->>'lot_id')::uuid,
      (v_line->>'quantity')::integer,'allocated',
      coalesce(v_line->'component_snapshot','[]'::jsonb),
      jsonb_build_object('source','order_create','preassembled',true)
    )
    on conflict(order_id,lot_id) do update
      set quantity=public.basket_stock_allocations.quantity+excluded.quantity,
          component_snapshot=excluded.component_snapshot;
  end loop;

  return jsonb_build_object(
    'order_id',v_order_id,'order_number',v_order_number,
    'total_cents',round(v_total*100)::bigint,'total',round(v_total,2),
    'customer_id',v_customer_id,'phone_e164',v_phone,'payment_method',v_payment_label,
    'preassembled_baskets',jsonb_array_length(v_alloc_rows)>0
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.reserve_vitrine_order_stock_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  r record;
  v_authority text;
  v_effective numeric;
  v_pending_local numeric;
  v_available numeric;
  v_demand_count integer:=0;
begin
  select coalesce(metadata->>'ops2_stock_authority','legacy_shadow')
    into v_authority
  from public.bling_hub_runtime_v2 where id=1;

  if p_order_id is null or not exists(
    select 1 from public.orders
    where id=p_order_id and source in ('vitrine','manual_whatsapp','papoai','reorder')
  ) then return jsonb_build_object('ok',false,'error','order_not_found'); end if;

  if exists(select 1 from public.vitrine_stock_reservations where order_id=p_order_id and status='consumed') then
    return jsonb_build_object('ok',true,'status','already_consumed','stock_authority',v_authority);
  end if;

  for r in
    select oi.product_id,
      sum(case
        when coalesce(oi.metadata->>'history_kind','')='basket_component'
          then greatest(oi.quantity-coalesce(nullif(oi.metadata->>'preassembled_units','')::numeric,0),0)
        else oi.quantity
      end) as quantity
    from public.order_items oi
    where oi.order_id=p_order_id and oi.product_id is not null
    group by oi.product_id
    having sum(case
      when coalesce(oi.metadata->>'history_kind','')='basket_component'
        then greatest(oi.quantity-coalesce(nullif(oi.metadata->>'preassembled_units','')::numeric,0),0)
      else oi.quantity
    end)>0
    order by oi.product_id
  loop
    v_demand_count:=v_demand_count+1;
    perform 1 from public.products p where p.id=r.product_id and p.is_active=true for update;
    if not found then return jsonb_build_object('ok',false,'error','product_unavailable','product_id',r.product_id); end if;

    if v_authority='bling' then
      select s.loose_sellable_stock into v_effective
      from public.ops2_loose_sellable_stock_v1 s
      where s.product_id=r.product_id and s.is_active=true and s.bling_stock_ready=true;
      if not found then return jsonb_build_object('ok',false,'error','bling_stock_unavailable','product_id',r.product_id); end if;

      select coalesce(sum(x.quantity),0) into v_pending_local
      from public.vitrine_stock_reservations x
      join public.orders o on o.id=x.order_id
      where x.product_id=r.product_id and x.status='reserved' and x.expires_at>now()
        and x.order_id<>p_order_id and (o.bling_synced_at is null or o.sync_status<>'sent_to_bling');
      v_available:=greatest(0,coalesce(v_effective,0)-coalesce(v_pending_local,0));
    else
      select greatest(0,coalesce(p.stock,0)-coalesce(l.basket_locked_quantity,0))
        into v_effective
      from public.products p
      left join public.basket_locked_component_stock_v1 l on l.product_id=p.id
      where p.id=r.product_id and p.is_active=true;
      select coalesce(sum(x.quantity),0) into v_pending_local
      from public.vitrine_stock_reservations x
      where x.product_id=r.product_id and x.status='reserved' and x.expires_at>now() and x.order_id<>p_order_id;
      v_available:=greatest(0,coalesce(v_effective,0)-coalesce(v_pending_local,0));
    end if;

    if v_available<r.quantity then
      return jsonb_build_object('ok',false,'error','insufficient_stock','product_id',r.product_id,
        'available',v_available,'requested',r.quantity,'stock_authority',v_authority);
    end if;
  end loop;

  if v_demand_count=0 then
    return jsonb_build_object('ok',true,'status','preassembled_only','stock_authority',v_authority,
      'local_reservation_tracking',true,'physical_stock_changed',false);
  end if;

  insert into public.vitrine_stock_reservations(order_id,product_id,quantity,status,expires_at,updated_at)
  select p_order_id,oi.product_id,
    sum(case
      when coalesce(oi.metadata->>'history_kind','')='basket_component'
        then greatest(oi.quantity-coalesce(nullif(oi.metadata->>'preassembled_units','')::numeric,0),0)
      else oi.quantity
    end),
    'reserved',now()+interval '48 hours',now()
  from public.order_items oi
  where oi.order_id=p_order_id and oi.product_id is not null
  group by oi.product_id
  having sum(case
    when coalesce(oi.metadata->>'history_kind','')='basket_component'
      then greatest(oi.quantity-coalesce(nullif(oi.metadata->>'preassembled_units','')::numeric,0),0)
    else oi.quantity
  end)>0
  on conflict(order_id,product_id) do update
    set quantity=excluded.quantity,status='reserved',expires_at=excluded.expires_at,
        updated_at=now(),consumed_at=null,released_at=null;

  return jsonb_build_object('ok',true,'status','reserved','stock_authority',v_authority,
    'local_reservation_tracking',true,'physical_stock_changed',false);
end;
$function$


CREATE OR REPLACE FUNCTION public.consume_vitrine_order_stock_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  r record;
  v_authority text;
  v_count int;
  v_consumed int;
  v_released int;
  v_stock numeric;
  v_has_basket boolean;
begin
  select coalesce(metadata->>'ops2_stock_authority','legacy_shadow')
    into v_authority from public.bling_hub_runtime_v2 where id=1;

  select count(*),count(*) filter(where status='consumed'),count(*) filter(where status='released')
    into v_count,v_consumed,v_released
  from public.vitrine_stock_reservations where order_id=p_order_id;

  select exists(
    select 1 from public.basket_stock_allocations
    where order_id=p_order_id and status in ('allocated','consumed')
  ) into v_has_basket;

  if v_count=0 then
    if v_has_basket then
      return jsonb_build_object('ok',true,'status','preassembled_only','already_consumed',false,
        'local_consume_skipped',true,'reservations_consumed',true,'physical_stock_changed',false);
    end if;
    return jsonb_build_object('ok',false,'error','stock_reservation_not_found');
  end if;

  if v_consumed=v_count then
    return jsonb_build_object('ok',true,'status',case when v_authority='bling' then 'bling_authority' else 'consumed' end,
      'already_consumed',true,'local_consume_skipped',v_authority='bling','reservations_consumed',true);
  end if;
  if v_released>0 then return jsonb_build_object('ok',false,'error','stock_reservation_released'); end if;

  if v_authority='bling' then
    update public.vitrine_stock_reservations
       set status='consumed',consumed_at=now(),released_at=null,updated_at=now()
     where order_id=p_order_id and status='reserved';
    return jsonb_build_object('ok',true,'status','bling_authority','already_consumed',false,
      'local_consume_skipped',true,'reservations_consumed',true,'physical_stock_changed',false);
  end if;

  for r in
    select product_id,quantity from public.vitrine_stock_reservations
    where order_id=p_order_id and status='reserved'
    order by product_id for update
  loop
    select stock into v_stock from public.products where id=r.product_id and is_active=true for update;
    if not found then return jsonb_build_object('ok',false,'error','product_unavailable','product_id',r.product_id); end if;
    if coalesce(v_stock,0)<r.quantity then
      return jsonb_build_object('ok',false,'error','insufficient_physical_stock','product_id',r.product_id,
        'available',coalesce(v_stock,0),'requested',r.quantity);
    end if;
  end loop;

  for r in
    select product_id,quantity from public.vitrine_stock_reservations
    where order_id=p_order_id and status='reserved' order by product_id
  loop
    update public.products set stock=stock-r.quantity,updated_at=now() where id=r.product_id;
  end loop;

  update public.vitrine_stock_reservations
     set status='consumed',consumed_at=now(),released_at=null,updated_at=now()
   where order_id=p_order_id and status='reserved';

  return jsonb_build_object('ok',true,'status','consumed','already_consumed',false,'physical_stock_changed',true);
end;
$function$


CREATE OR REPLACE FUNCTION public.sync_basket_allocations_from_order_status_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  r record;
begin
  if new.status='cancelled' and old.status is distinct from 'cancelled' then
    for r in
      select id,lot_id,quantity from public.basket_stock_allocations
      where order_id=new.id and status='allocated'
      for update
    loop
      update public.basket_stock_allocations
         set status='released',released_at=now()
       where id=r.id;
      update public.basket_stock_lots
         set quantity_available=least(quantity_built,quantity_available+r.quantity),
             status='ready',updated_at=now()
       where id=r.lot_id;
    end loop;
  elsif new.status='out_for_delivery' and old.status is distinct from 'out_for_delivery' then
    update public.basket_stock_allocations
       set status='consumed',consumed_at=now()
     where order_id=new.id and status='allocated';
  end if;
  return new;
end;
$function$


drop trigger if exists trg_sync_basket_allocations_order_status on public.orders;
create trigger trg_sync_basket_allocations_order_status
after update of status on public.orders
for each row execute function public.sync_basket_allocations_from_order_status_v1();

revoke all on function public.create_basket_stock_lot_v1(uuid,integer,jsonb,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.create_basket_stock_lot_v1(uuid,integer,jsonb,text,text,text,boolean) to service_role;
revoke all on function public.create_vitrine_cart_order_v1(text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_vitrine_cart_order_v1(text,text,jsonb,jsonb,jsonb) to service_role;
revoke all on function public.reserve_vitrine_order_stock_v1(uuid) from public,anon,authenticated;
grant execute on function public.reserve_vitrine_order_stock_v1(uuid) to service_role;
revoke all on function public.consume_vitrine_order_stock_v1(uuid) from public,anon,authenticated;
grant execute on function public.consume_vitrine_order_stock_v1(uuid) to service_role;
revoke all on function public.sync_basket_allocations_from_order_status_v1() from public,anon,authenticated;
grant execute on function public.sync_basket_allocations_from_order_status_v1() to service_role;
