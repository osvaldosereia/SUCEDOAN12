-- Captura isolada de códigos EAN: sem efeitos sobre catálogo/estoque.
create table if not exists public.ean_capture_records_v1 (
  id uuid primary key default gen_random_uuid(),
  client_entry_id uuid not null unique,
  ean text not null check (ean ~ '^[0-9]{8,14}$'),
  quantity numeric(12,3) not null check (quantity > 0 and quantity <= 999999),
  expires_on date null,
  sync_status text not null default 'pending' check (sync_status in ('pending','found','not_found')),
  matched_product_id uuid null,
  synced_at timestamptz null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ean_capture_records_v1_created_idx on public.ean_capture_records_v1(created_at desc,id desc);
create index if not exists ean_capture_records_v1_status_idx on public.ean_capture_records_v1(sync_status,created_at desc);
create index if not exists ean_capture_records_v1_ean_idx on public.ean_capture_records_v1(ean);
alter table public.ean_capture_records_v1 enable row level security;
revoke all on public.ean_capture_records_v1 from anon,authenticated;
grant select,insert,update on public.ean_capture_records_v1 to service_role;
comment on table public.ean_capture_records_v1 is 'Leituras operacionais EAN independentes, sem atualizar produtos/estoque/site. Dados preservados para etapa futura autorizada.';
create or replace function public.ean_capture_stats_v1()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'total',count(*),
    'pending',count(*) filter(where sync_status='pending'),
    'found',count(*) filter(where sync_status='found'),
    'not_found',count(*) filter(where sync_status='not_found'),
    'quantity',coalesce(sum(quantity),0)
  ) from public.ean_capture_records_v1;
$$;
create or replace function public.ean_capture_sync_v1()
returns jsonb language plpgsql security invoker set search_path = ''
as $$
begin
  with resolved as (
    select e.id,
      (select matches.product_id from (
        select p.id as product_id,0 as priority
          from public.products p where p.gtin = e.ean
        union all
        select pi.product_id,1 as priority
          from public.product_identifiers pi
          where pi.identifier_value=e.ean and pi.status='confirmed'
      ) matches order by matches.priority,matches.product_id limit 1) as product_id
    from public.ean_capture_records_v1 e
  )
  update public.ean_capture_records_v1 e
  set sync_status=case when r.product_id is null then 'not_found' else 'found' end,
      matched_product_id=r.product_id,
      synced_at=now(),
      updated_at=now()
  from resolved r where r.id=e.id;
  return public.ean_capture_stats_v1();
end;
$$;
revoke all on function public.ean_capture_stats_v1() from public,anon,authenticated;
revoke all on function public.ean_capture_sync_v1() from public,anon,authenticated;
grant execute on function public.ean_capture_stats_v1() to service_role;
grant execute on function public.ean_capture_sync_v1() to service_role;