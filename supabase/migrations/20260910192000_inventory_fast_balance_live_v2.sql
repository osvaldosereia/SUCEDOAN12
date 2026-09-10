begin;

-- Leitura rápida v2: sempre BALANÇO.
-- A primeira leitura depois de 30 minutos inicia uma nova janela e substitui o saldo por 1.
-- Leituras repetidas do mesmo EAN em até 30 minutos da leitura anterior incrementam o saldo.

-- GTIN é a identidade física usada pelo leitor. Evita importação concorrente duplicada.
alter table public.products add constraint products_gtin_key unique (gtin);

create table if not exists public.inventory_fast_balance_state_v2 (
  product_id uuid primary key references public.products(id) on delete cascade,
  ean text not null,
  quantity integer not null check (quantity > 0),
  window_started_at timestamptz not null,
  last_scanned_at timestamptz not null,
  expires_at timestamptz not null,
  first_scanned_by uuid references auth.users(id) on delete set null,
  last_scanned_by uuid references auth.users(id) on delete set null,
  last_device_label text,
  legacy_checkpoint_id uuid references public.inventory_fast_checkpoints(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_fast_balance_state_v2_recent_idx
  on public.inventory_fast_balance_state_v2(last_scanned_at desc);
create index if not exists inventory_fast_balance_state_v2_ean_idx
  on public.inventory_fast_balance_state_v2(ean);

alter table public.inventory_fast_balance_state_v2 enable row level security;
revoke all on table public.inventory_fast_balance_state_v2 from public, anon, authenticated;
grant select, insert, update, delete on table public.inventory_fast_balance_state_v2 to service_role;

create table if not exists public.inventory_fast_balance_events_v2 (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  ean text not null,
  user_id uuid references auth.users(id) on delete set null,
  device_label text,
  event_kind text not null default 'scan' check (event_kind in ('scan','checkpoint_adopted')),
  is_new_window boolean not null default false,
  previous_stock numeric,
  balance_quantity integer not null check (balance_quantity > 0),
  scanned_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists inventory_fast_balance_events_v2_product_idx
  on public.inventory_fast_balance_events_v2(product_id, scanned_at desc);
create index if not exists inventory_fast_balance_events_v2_ean_idx
  on public.inventory_fast_balance_events_v2(ean, scanned_at desc);

alter table public.inventory_fast_balance_events_v2 enable row level security;
revoke all on table public.inventory_fast_balance_events_v2 from public, anon, authenticated;
grant select, insert on table public.inventory_fast_balance_events_v2 to service_role;
grant usage, select on sequence public.inventory_fast_balance_events_v2_id_seq to service_role;

create or replace function public.record_inventory_fast_balance_scan_v2(
  p_product_id uuid,
  p_user_id uuid,
  p_device_label text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_product public.products%rowtype;
  v_state public.inventory_fast_balance_state_v2%rowtype;
  v_quantity integer;
  v_new_window boolean := false;
  v_previous_stock numeric;
begin
  select * into v_product
    from public.products
   where id = p_product_id
   for update;
  if not found then raise exception 'product_not_found'; end if;
  if nullif(v_product.gtin,'') is null then raise exception 'product_gtin_required'; end if;

  v_previous_stock := v_product.stock;

  select * into v_state
    from public.inventory_fast_balance_state_v2
   where product_id = p_product_id
   for update;

  if not found or v_state.last_scanned_at < v_now - interval '30 minutes' then
    v_quantity := 1;
    v_new_window := true;
    insert into public.inventory_fast_balance_state_v2(
      product_id, ean, quantity, window_started_at, last_scanned_at, expires_at,
      first_scanned_by, last_scanned_by, last_device_label, legacy_checkpoint_id, updated_at
    ) values (
      p_product_id, v_product.gtin, 1, v_now, v_now, v_now + interval '30 minutes',
      p_user_id, p_user_id, nullif(left(coalesce(p_device_label,''),120),''), null, v_now
    )
    on conflict (product_id) do update set
      ean = excluded.ean,
      quantity = 1,
      window_started_at = v_now,
      last_scanned_at = v_now,
      expires_at = v_now + interval '30 minutes',
      first_scanned_by = p_user_id,
      last_scanned_by = p_user_id,
      last_device_label = nullif(left(coalesce(p_device_label,''),120),''),
      legacy_checkpoint_id = null,
      updated_at = v_now;
  else
    v_quantity := v_state.quantity + 1;
    update public.inventory_fast_balance_state_v2 set
      quantity = v_quantity,
      last_scanned_at = v_now,
      expires_at = v_now + interval '30 minutes',
      last_scanned_by = p_user_id,
      last_device_label = nullif(left(coalesce(p_device_label,''),120),''),
      updated_at = v_now
    where product_id = p_product_id;
  end if;

  update public.products set
    stock = v_quantity,
    physically_verified = true,
    physically_verified_at = v_now,
    physically_verified_by = p_user_id,
    last_counted_at = v_now,
    updated_at = v_now,
    metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
      'last_inventory_mode','fast_balance_v2',
      'fast_balance_quantity',v_quantity,
      'fast_balance_last_scan_at',v_now
    )
  where id = p_product_id;

  insert into public.inventory_fast_balance_events_v2(
    product_id, ean, user_id, device_label, event_kind, is_new_window,
    previous_stock, balance_quantity, scanned_at
  ) values (
    p_product_id, v_product.gtin, p_user_id, nullif(left(coalesce(p_device_label,''),120),''),
    'scan', v_new_window, v_previous_stock, v_quantity, v_now
  );

  return jsonb_build_object(
    'product_id', p_product_id,
    'ean', v_product.gtin,
    'quantity', v_quantity,
    'previous_stock', v_previous_stock,
    'new_window', v_new_window,
    'window_started_at', case when v_new_window then v_now else v_state.window_started_at end,
    'last_scanned_at', v_now,
    'expires_at', v_now + interval '30 minutes'
  );
end;
$$;

-- Converte automaticamente o checkpoint legado do usuário quando ele abre a nova Leitura Rápida.
-- Isso preserva as leituras já feitas antes da mudança sem reaplicá-las duas vezes.
create or replace function public.adopt_open_inventory_fast_balance_checkpoints_v2(
  p_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checkpoint public.inventory_fast_checkpoints%rowtype;
  v_row jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_ean text;
  v_last timestamptz;
  v_previous_stock numeric;
  v_current_last timestamptz;
  v_adopted integer := 0;
  v_closed integer := 0;
begin
  for v_checkpoint in
    select * from public.inventory_fast_checkpoints
     where user_id = p_user_id
       and closed_at is null
       and operation_mode = 'balance'
     order by updated_at
     for update
  loop
    for v_row in select value from jsonb_array_elements(coalesce(v_checkpoint.known_rows,'[]'::jsonb))
    loop
      begin
        v_product_id := nullif(coalesce(v_row->>'product_id',v_row->'product'->>'id'),'')::uuid;
      exception when others then
        v_product_id := null;
      end;
      v_quantity := greatest(0,coalesce((v_row->>'quantity')::integer,0));
      v_ean := regexp_replace(coalesce(v_row->>'code',v_row->'product'->>'gtin',''),'\D','','g');
      begin
        v_last := coalesce(nullif(v_row->>'last_scanned_at','')::timestamptz,v_checkpoint.updated_at);
      exception when others then
        v_last := v_checkpoint.updated_at;
      end;

      if v_product_id is null or v_quantity <= 0 then continue; end if;
      select stock into v_previous_stock from public.products where id=v_product_id for update;
      if not found then continue; end if;

      select last_scanned_at into v_current_last
        from public.inventory_fast_balance_state_v2
       where product_id=v_product_id
       for update;

      if v_current_last is not null and v_current_last > v_last then
        continue;
      end if;

      insert into public.inventory_fast_balance_state_v2(
        product_id,ean,quantity,window_started_at,last_scanned_at,expires_at,
        first_scanned_by,last_scanned_by,last_device_label,legacy_checkpoint_id,updated_at
      ) values (
        v_product_id,v_ean,v_quantity,v_last,v_last,v_last+interval '30 minutes',
        p_user_id,p_user_id,v_checkpoint.device_label,v_checkpoint.id,v_last
      )
      on conflict(product_id) do update set
        ean=excluded.ean,
        quantity=excluded.quantity,
        window_started_at=excluded.window_started_at,
        last_scanned_at=excluded.last_scanned_at,
        expires_at=excluded.expires_at,
        last_scanned_by=excluded.last_scanned_by,
        last_device_label=excluded.last_device_label,
        legacy_checkpoint_id=excluded.legacy_checkpoint_id,
        updated_at=excluded.updated_at;

      update public.products set
        stock=v_quantity,
        physically_verified=true,
        physically_verified_at=v_last,
        physically_verified_by=p_user_id,
        last_counted_at=v_last,
        updated_at=greatest(updated_at,v_last),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'last_inventory_mode','fast_balance_v2_checkpoint_adopted',
          'fast_balance_quantity',v_quantity,
          'fast_balance_last_scan_at',v_last
        )
      where id=v_product_id;

      insert into public.inventory_fast_balance_events_v2(
        product_id,ean,user_id,device_label,event_kind,is_new_window,
        previous_stock,balance_quantity,scanned_at,metadata
      ) values (
        v_product_id,v_ean,p_user_id,v_checkpoint.device_label,'checkpoint_adopted',true,
        v_previous_stock,v_quantity,v_last,jsonb_build_object('legacy_checkpoint_id',v_checkpoint.id)
      );
      v_adopted := v_adopted + 1;
    end loop;

    update public.inventory_fast_checkpoints
       set closed_at=clock_timestamp(),updated_at=clock_timestamp()
     where id=v_checkpoint.id;
    v_closed := v_closed + 1;
  end loop;

  return jsonb_build_object('adopted_products',v_adopted,'closed_checkpoints',v_closed);
end;
$$;

revoke all on function public.record_inventory_fast_balance_scan_v2(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.adopt_open_inventory_fast_balance_checkpoints_v2(uuid) from public, anon, authenticated;
grant execute on function public.record_inventory_fast_balance_scan_v2(uuid,uuid,text) to service_role;
grant execute on function public.adopt_open_inventory_fast_balance_checkpoints_v2(uuid) to service_role;

commit;