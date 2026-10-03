-- Public, read-only order summary snapshots. The order UUID is the opaque link token.
create table if not exists public.order_public_snapshots_v1 (
  order_id uuid primary key references public.orders(id) on delete cascade,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  refreshed_at timestamptz not null default now(),
  open_count bigint not null default 0 check (open_count >= 0),
  last_opened_at timestamptz
);

alter table public.order_public_snapshots_v1 enable row level security;
revoke all on table public.order_public_snapshots_v1 from anon, authenticated;

create or replace function public.ops2_refresh_order_public_snapshot_v1(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_snapshot jsonb;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then return null; end if;

  select jsonb_strip_nulls(jsonb_build_object(
    'version', 1,
    'order_id', v_order.id::text,
    'order_number', v_order.order_number,
    'created_at', v_order.created_at,
    'total', v_order.total,
    'subtotal', v_order.subtotal,
    'payment_label', coalesce(nullif(v_order.checkout_snapshot->>'payment_label',''), nullif(v_order.payment_method,''), 'A confirmar'),
    'customer_name', coalesce(nullif(v_order.customer_snapshot->>'name',''), nullif(v_order.customer_snapshot->>'display_name',''), nullif(v_order.delivery_address->>'customer_name',''), 'Cliente'),
    'delivery', jsonb_strip_nulls(jsonb_build_object(
      'street', v_order.delivery_address->>'street',
      'number', v_order.delivery_address->>'number',
      'complement', v_order.delivery_address->>'complement',
      'district', coalesce(nullif(v_order.delivery_address->>'district',''), nullif(v_order.delivery_address->>'neighborhood','')),
      'city', v_order.delivery_address->>'city',
      'state', v_order.delivery_address->>'state',
      'reference', coalesce(nullif(v_order.delivery_address->>'reference',''), nullif(v_order.delivery_address->>'raw_text','')),
      'delivery_date', v_order.delivery_address->>'delivery_date',
      'delivery_label', v_order.delivery_address->>'delivery_label'
    )),
    'baskets', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', coalesce(bt.id::text, x.item->>'id'),
        'name', coalesce(bt.name, v_order.basket_name_snapshot, 'Cesta'),
        'image_url', nullif(bt.image_url,''),
        'quantity', coalesce(nullif(x.item->>'qty','')::numeric, 1)
      )) order by x.ord)
      from jsonb_array_elements(coalesce(v_order.checkout_snapshot->'cart','[]'::jsonb)) with ordinality as x(item,ord)
      left join public.basket_templates bt on bt.id::text = x.item->>'id'
      where x.item->>'type' = 'basket'
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'name', oi.name_snapshot,
        'quantity', oi.quantity,
        'unit_price', oi.unit_price,
        'line_total', oi.line_total,
        'image_url', nullif(coalesce(oi.metadata->>'image_url', p.image_url, ''),''),
        'basket_name', nullif(oi.metadata->>'basket_name',''),
        'basket_id', nullif(oi.metadata->>'basket_id',''),
        'kind', coalesce(nullif(oi.metadata->>'history_kind',''), 'product')
      )) order by oi.created_at, oi.id)
      from public.order_items oi
      left join public.products p on p.id = oi.product_id
      where oi.order_id = p_order_id and oi.quantity > 0
    ), '[]'::jsonb)
  )) into v_snapshot;

  insert into public.order_public_snapshots_v1(order_id,snapshot,refreshed_at)
  values (p_order_id,v_snapshot,now())
  on conflict (order_id) do update set snapshot=excluded.snapshot, refreshed_at=now();
  return v_snapshot;
end;
$$;

revoke all on function public.ops2_refresh_order_public_snapshot_v1(uuid) from public, anon, authenticated;
grant execute on function public.ops2_refresh_order_public_snapshot_v1(uuid) to service_role;

-- order_items are inserted in the same checkout transaction. A deferred constraint
-- trigger runs at transaction end, when every final item already exists. Only the
-- first deferred row refreshes; the rest see the immutable snapshot and no-op.
create or replace function public.ops2_order_item_public_snapshot_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.order_public_snapshots_v1 s where s.order_id = new.order_id
  ) then
    return new;
  end if;
  perform public.ops2_refresh_order_public_snapshot_v1(new.order_id);
  return new;
end;
$$;

revoke all on function public.ops2_order_item_public_snapshot_trigger_v1() from public, anon, authenticated;

drop trigger if exists trg_order_item_public_snapshot_v1 on public.order_items;
create constraint trigger trg_order_item_public_snapshot_v1
after insert on public.order_items
deferrable initially deferred
for each row execute function public.ops2_order_item_public_snapshot_trigger_v1();
