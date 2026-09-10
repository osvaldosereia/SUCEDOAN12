-- Contagem rápida: checkpoints automáticos e fila persistente de EANs não encontrados.
-- O checkpoint NÃO altera estoque; a operação ADICIONAR/BALANÇO continua sendo aplicada apenas no salvamento final.

create table if not exists public.inventory_fast_checkpoints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_label text not null,
  operation_mode text not null check (operation_mode in ('add','balance')),
  scan_total integer not null default 0 check (scan_total >= 0),
  known_rows jsonb not null default '[]'::jsonb check (jsonb_typeof(known_rows) = 'array'),
  unknown_rows jsonb not null default '[]'::jsonb check (jsonb_typeof(unknown_rows) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create unique index if not exists inventory_fast_checkpoints_open_user_device_uidx
  on public.inventory_fast_checkpoints(user_id, device_label)
  where closed_at is null;

create index if not exists inventory_fast_checkpoints_recent_idx
  on public.inventory_fast_checkpoints(user_id, updated_at desc);

alter table public.inventory_fast_checkpoints enable row level security;
revoke all on table public.inventory_fast_checkpoints from anon, authenticated;
grant select, insert, update, delete on table public.inventory_fast_checkpoints to service_role;

create table if not exists public.unresolved_product_eans (
  id uuid primary key default gen_random_uuid(),
  ean text not null unique check (ean ~ '^[0-9]{5,32}$'),
  status text not null default 'pending' check (status in ('pending','researching','resolved','ignored','error')),
  scan_count bigint not null default 1 check (scan_count > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  first_seen_by uuid references auth.users(id) on delete set null,
  last_seen_by uuid references auth.users(id) on delete set null,
  source text not null default 'inventory_fast',
  research_attempts integer not null default 0 check (research_attempts >= 0),
  last_research_at timestamptz,
  resolved_product_id uuid references public.products(id) on delete set null,
  resolution jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists unresolved_product_eans_pending_idx
  on public.unresolved_product_eans(status, last_seen_at desc)
  where status in ('pending','error');

alter table public.unresolved_product_eans enable row level security;
revoke all on table public.unresolved_product_eans from anon, authenticated;
grant select, insert, update, delete on table public.unresolved_product_eans to service_role;

create or replace function public.record_unresolved_product_ean_v1(
  p_ean text,
  p_user_id uuid,
  p_delta integer default 1,
  p_source text default 'inventory_fast',
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ean text := regexp_replace(coalesce(p_ean,''), '\D', '', 'g');
  v_delta integer := greatest(1, least(coalesce(p_delta,1), 1000));
  v_row public.unresolved_product_eans%rowtype;
begin
  if length(v_ean) < 5 or length(v_ean) > 32 then
    raise exception 'invalid_ean';
  end if;

  insert into public.unresolved_product_eans(
    ean, status, scan_count, first_seen_by, last_seen_by, source, metadata
  ) values (
    v_ean, 'pending', v_delta, p_user_id, p_user_id,
    coalesce(nullif(trim(p_source),''),'inventory_fast'),
    coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict (ean) do update set
    scan_count = public.unresolved_product_eans.scan_count + excluded.scan_count,
    last_seen_at = now(),
    last_seen_by = excluded.last_seen_by,
    source = excluded.source,
    status = case when public.unresolved_product_eans.status = 'resolved' then 'resolved' else 'pending' end,
    metadata = public.unresolved_product_eans.metadata || excluded.metadata,
    updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'ean', v_row.ean,
    'status', v_row.status,
    'scan_count', v_row.scan_count,
    'last_seen_at', v_row.last_seen_at
  );
end;
$$;

revoke all on function public.record_unresolved_product_ean_v1(text,uuid,integer,text,jsonb) from public, anon, authenticated;
grant execute on function public.record_unresolved_product_ean_v1(text,uuid,integer,text,jsonb) to service_role;
