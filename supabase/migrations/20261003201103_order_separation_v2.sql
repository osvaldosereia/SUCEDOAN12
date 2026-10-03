-- Dona Antônia · Order Separation V2
-- Canonical server-side state for separator assignment, per-line classification,
-- completion audit and later financial/stock orchestration.

create table if not exists public.order_separation_assignments_v1 (
  order_id uuid primary key references public.orders(id) on delete cascade,
  separator_key text null check (separator_key is null or separator_key in ('jose','claudenil','kelly','jovenil')),
  separator_label text null,
  assigned_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_separation_items_v1 (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  product_id uuid null references public.products(id) on delete set null,
  state text not null default 'pending' check (state in ('pending','separated','missing')),
  quantity numeric not null check (quantity > 0),
  unit_price numeric not null default 0,
  line_total numeric not null default 0,
  changed_at timestamptz null,
  changed_by_separator_key text null check (changed_by_separator_key is null or changed_by_separator_key in ('jose','claudenil','kelly','jovenil')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, order_item_id)
);

create index if not exists order_separation_items_order_state_idx
  on public.order_separation_items_v1(order_id,state);
create index if not exists order_separation_items_product_idx
  on public.order_separation_items_v1(product_id) where product_id is not null;

create table if not exists public.order_separation_completions_v1 (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  order_number text null,
  phase text not null default 'prepared',
  original_total numeric not null default 0,
  original_subtotal numeric not null default 0,
  original_fiscal_subtotal numeric not null default 0,
  original_discount numeric not null default 0,
  original_other_expenses numeric not null default 0,
  original_basket_hidden_adjustment numeric not null default 0,
  missing_subtotal numeric not null default 0,
  final_total numeric not null default 0,
  missing_items jsonb not null default '[]'::jsonb,
  deliverable_order_item_ids uuid[] not null default '{}'::uuid[],
  separator_key text null check (separator_key is null or separator_key in ('jose','claudenil','kelly','jovenil')),
  metadata jsonb not null default '{}'::jsonb,
  prepared_at timestamptz not null default now(),
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.order_separation_assignments_v1 enable row level security;
alter table public.order_separation_items_v1 enable row level security;
alter table public.order_separation_completions_v1 enable row level security;

revoke all on table public.order_separation_assignments_v1 from anon, authenticated;
revoke all on table public.order_separation_items_v1 from anon, authenticated;
revoke all on table public.order_separation_completions_v1 from anon, authenticated;
grant all on table public.order_separation_assignments_v1 to service_role;
grant all on table public.order_separation_items_v1 to service_role;
grant all on table public.order_separation_completions_v1 to service_role;

create or replace function public.ops2_init_order_separation_v2(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_inserted integer := 0;
  v_count integer := 0;
begin
  if p_order_id is null then
    return jsonb_build_object('ok',false,'error','invalid_order_id');
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id;

  if not found then
    return jsonb_build_object('ok',false,'error','order_not_found');
  end if;

  if v_order.status not in ('confirmed','processing') then
    return jsonb_build_object('ok',false,'error','order_not_in_separation','status',v_order.status);
  end if;

  if exists(select 1 from public.order_separation_completions_v1 where order_id=p_order_id) then
    select count(*) into v_count from public.order_separation_items_v1 where order_id=p_order_id;
    return jsonb_build_object('ok',true,'status','already_completed','item_count',v_count,'order_updated_at',v_order.updated_at);
  end if;

  insert into public.order_separation_items_v1(
    order_id,order_item_id,product_id,state,quantity,unit_price,line_total,created_at,updated_at
  )
  select
    oi.order_id,oi.id,oi.product_id,'pending',oi.quantity,oi.unit_price,oi.line_total,now(),now()
  from public.order_items oi
  where oi.order_id=p_order_id and oi.quantity>0
  on conflict (order_id, order_item_id) do update
    set product_id=excluded.product_id,
        quantity=excluded.quantity,
        unit_price=excluded.unit_price,
        line_total=excluded.line_total,
        updated_at=now()
    where public.order_separation_items_v1.state = 'pending'
      and not exists(
        select 1 from public.order_separation_completions_v1 c
        where c.order_id=public.order_separation_items_v1.order_id
      );

  get diagnostics v_inserted = row_count;
  select count(*) into v_count
  from public.order_separation_items_v1
  where order_id=p_order_id;

  if v_count=0 then
    return jsonb_build_object('ok',false,'error','order_has_no_items');
  end if;

  return jsonb_build_object(
    'ok',true,
    'status','initialized',
    'rows_touched',v_inserted,
    'item_count',v_count,
    'order_updated_at',v_order.updated_at
  );
end;
$$;

create or replace function public.ops2_set_order_separator_v2(
  p_order_id uuid,
  p_separator_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_key text := nullif(lower(trim(coalesce(p_separator_key,''))), '');
  v_label text;
  v_now timestamptz := now();
begin
  if p_order_id is null then
    return jsonb_build_object('ok',false,'error','invalid_order_id');
  end if;

  if v_key is not null and v_key not in ('jose','claudenil','kelly','jovenil') then
    return jsonb_build_object('ok',false,'error','invalid_separator');
  end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then
    return jsonb_build_object('ok',false,'error','order_not_found');
  end if;

  if v_order.status not in ('confirmed','processing') then
    return jsonb_build_object('ok',false,'error','order_not_in_separation','status',v_order.status);
  end if;

  if exists(select 1 from public.order_separation_completions_v1 where order_id=p_order_id) then
    return jsonb_build_object('ok',false,'error','separation_already_completed');
  end if;

  v_label := case v_key
    when 'jose' then 'José'
    when 'claudenil' then 'Claudenil'
    when 'kelly' then 'Kelly'
    when 'jovenil' then 'Jovenil'
    else null
  end;

  insert into public.order_separation_assignments_v1(
    order_id,separator_key,separator_label,assigned_at,created_at,updated_at
  ) values(
    p_order_id,v_key,v_label,case when v_key is null then null else v_now end,v_now,v_now
  )
  on conflict (order_id) do update
    set separator_key=excluded.separator_key,
        separator_label=excluded.separator_label,
        assigned_at=excluded.assigned_at,
        updated_at=v_now;

  update public.orders set updated_at=v_now where id=p_order_id;

  return jsonb_build_object(
    'ok',true,
    'order_id',p_order_id,
    'separator_key',v_key,
    'separator_label',v_label,
    'order_updated_at',v_now
  );
end;
$$;

create or replace function public.ops2_set_order_separation_item_v2(
  p_order_id uuid,
  p_order_item_id uuid,
  p_state text,
  p_expected_order_updated_at timestamptz,
  p_separator_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_state text := lower(trim(coalesce(p_state,'')));
  v_separator text := nullif(lower(trim(coalesce(p_separator_key,''))), '');
  v_now timestamptz := now();
  v_init jsonb;
begin
  if p_order_id is null or p_order_item_id is null then
    return jsonb_build_object('ok',false,'error','invalid_order_item');
  end if;

  if v_state not in ('separated','missing') then
    return jsonb_build_object('ok',false,'error','invalid_separation_state');
  end if;

  if v_separator is not null and v_separator not in ('jose','claudenil','kelly','jovenil') then
    return jsonb_build_object('ok',false,'error','invalid_separator');
  end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then
    return jsonb_build_object('ok',false,'error','order_not_found');
  end if;

  if v_order.status not in ('confirmed','processing') then
    return jsonb_build_object('ok',false,'error','order_not_in_separation','status',v_order.status);
  end if;

  if p_expected_order_updated_at is null or v_order.updated_at is distinct from p_expected_order_updated_at then
    return jsonb_build_object(
      'ok',false,
      'error','stale_order_version',
      'conflict','order_version_conflict',
      'order_updated_at',v_order.updated_at
    );
  end if;

  if exists(select 1 from public.order_separation_completions_v1 where order_id=p_order_id) then
    return jsonb_build_object('ok',false,'error','separation_already_completed');
  end if;

  select * into v_item
  from public.order_items
  where id=p_order_item_id and order_id=p_order_id and quantity>0;
  if not found then
    return jsonb_build_object('ok',false,'error','order_item_not_found');
  end if;

  insert into public.order_separation_items_v1(
    order_id,order_item_id,product_id,state,quantity,unit_price,line_total,changed_at,changed_by_separator_key,created_at,updated_at
  ) values(
    p_order_id,v_item.id,v_item.product_id,v_state,v_item.quantity,v_item.unit_price,v_item.line_total,v_now,v_separator,v_now,v_now
  )
  on conflict (order_id,order_item_id) do update
    set state=excluded.state,
        changed_at=v_now,
        changed_by_separator_key=v_separator,
        updated_at=v_now;

  update public.orders set updated_at=v_now where id=p_order_id;

  return jsonb_build_object(
    'ok',true,
    'order_id',p_order_id,
    'order_item_id',p_order_item_id,
    'state',v_state,
    'changed_by_separator_key',v_separator,
    'order_updated_at',v_now
  );
end;
$$;

create or replace function public.ops2_get_order_separation_v2(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_assignment jsonb := null;
  v_completion jsonb := null;
  v_items jsonb := '[]'::jsonb;
  v_pending integer := 0;
  v_separated integer := 0;
  v_missing integer := 0;
  v_init jsonb;
begin
  if p_order_id is null then
    return jsonb_build_object('ok',false,'error','invalid_order_id');
  end if;

  select * into v_order from public.orders where id=p_order_id;
  if not found then
    return jsonb_build_object('ok',false,'error','order_not_found');
  end if;

  if v_order.status in ('confirmed','processing')
     and not exists(select 1 from public.order_separation_completions_v1 where order_id=p_order_id) then
    v_init := public.ops2_init_order_separation_v2(p_order_id);
    if coalesce((v_init->>'ok')::boolean,false) is not true then
      return v_init;
    end if;
  end if;

  select jsonb_build_object(
    'separator_key',a.separator_key,
    'separator_label',a.separator_label,
    'assigned_at',a.assigned_at,
    'updated_at',a.updated_at
  ) into v_assignment
  from public.order_separation_assignments_v1 a
  where a.order_id=p_order_id;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',s.id,
    'order_item_id',s.order_item_id,
    'product_id',s.product_id,
    'state',s.state,
    'quantity',s.quantity,
    'unit_price',s.unit_price,
    'line_total',s.line_total,
    'changed_at',s.changed_at,
    'changed_by_separator_key',s.changed_by_separator_key,
    'name',oi.name_snapshot,
    'sku',oi.sku_snapshot,
    'image_url',nullif(coalesce(oi.metadata->>'image_url',p.image_url,''),''),
    'basket_name',nullif(oi.metadata->>'basket_name',''),
    'basket_id',nullif(oi.metadata->>'basket_id',''),
    'kind',coalesce(nullif(oi.metadata->>'history_kind',''),'product'),
    'updated_at',s.updated_at
  )) order by oi.created_at,oi.id),'[]'::jsonb)
  into v_items
  from public.order_separation_items_v1 s
  join public.order_items oi on oi.id=s.order_item_id
  left join public.products p on p.id=s.product_id
  where s.order_id=p_order_id;

  select
    count(*) filter(where state='pending'),
    count(*) filter(where state='separated'),
    count(*) filter(where state='missing')
  into v_pending,v_separated,v_missing
  from public.order_separation_items_v1
  where order_id=p_order_id;

  select jsonb_strip_nulls(jsonb_build_object(
    'id',c.id,
    'phase',c.phase,
    'original_total',c.original_total,
    'missing_subtotal',c.missing_subtotal,
    'final_total',c.final_total,
    'separator_key',c.separator_key,
    'prepared_at',c.prepared_at,
    'completed_at',c.completed_at,
    'metadata',c.metadata
  )) into v_completion
  from public.order_separation_completions_v1 c
  where c.order_id=p_order_id;

  return jsonb_build_object(
    'ok',true,
    'order_id',v_order.id,
    'order_number',v_order.order_number,
    'status',v_order.status,
    'order_updated_at',v_order.updated_at,
    'customer_name',coalesce(nullif(v_order.customer_snapshot->>'name',''),nullif(v_order.delivery_address->>'customer_name',''),'Cliente'),
    'delivery',v_order.delivery_address,
    'original_total',coalesce(v_completion->'original_total',to_jsonb(v_order.total)),
    'total',v_order.total,
    'assignment',coalesce(v_assignment,'null'::jsonb),
    'items',v_items,
    'counts',jsonb_build_object('pending',v_pending,'separated',v_separated,'missing',v_missing,'total',v_pending+v_separated+v_missing),
    'completion',coalesce(v_completion,'null'::jsonb)
  );
end;
$$;

revoke all on function public.ops2_init_order_separation_v2(uuid) from public, anon, authenticated;
revoke all on function public.ops2_set_order_separator_v2(uuid,text) from public, anon, authenticated;
revoke all on function public.ops2_set_order_separation_item_v2(uuid,uuid,text,timestamptz,text) from public, anon, authenticated;
revoke all on function public.ops2_get_order_separation_v2(uuid) from public, anon, authenticated;

grant execute on function public.ops2_init_order_separation_v2(uuid) to service_role;
grant execute on function public.ops2_set_order_separator_v2(uuid,text) to service_role;
grant execute on function public.ops2_set_order_separation_item_v2(uuid,uuid,text,timestamptz,text) to service_role;
grant execute on function public.ops2_get_order_separation_v2(uuid) to service_role;
