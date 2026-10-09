-- Orçamento -> pedido de venda Bling: trava idempotente por orçamento.
create table if not exists public.sales_quote_bling_orders (
  quote_id uuid primary key references public.sales_quotes(id) on delete restrict,
  external_key text not null unique,
  status text not null default 'processing'
    check (status in ('processing','synced','review_required')),
  bling_order_id bigint unique,
  attempt_count integer not null default 0,
  last_error text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sales_quote_bling_orders_status_idx
  on public.sales_quote_bling_orders(status,updated_at desc);
alter table public.sales_quote_bling_orders enable row level security;
-- RLS: nenhum acesso direto por navegador. Apenas serviço administrativo.
revoke all on public.sales_quote_bling_orders from anon, authenticated;

create or replace function public.sales_quote_bling_claim_v1(p_quote_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_quote public.sales_quotes%rowtype;
        v_link public.sales_quote_bling_orders%rowtype;
        v_key text;
begin
  select * into v_quote from public.sales_quotes
    where id=p_quote_id and archived_at is null for update;
  if not found then return jsonb_build_object('ok',false,'error','quote_not_found'); end if;
  select * into v_link from public.sales_quote_bling_orders where quote_id=p_quote_id for update;
  if found then
    return jsonb_build_object('ok',false,'error',case when v_link.status='synced' then 'already_synced' when v_link.status='processing' then 'conversion_in_progress' else 'manual_review_required' end,
      'status',v_link.status,'bling_order_id',v_link.bling_order_id,'external_key',v_link.external_key);
  end if;
  v_key:='ORC-'||substr(replace(p_quote_id::text,'-',''),1,20);
  insert into public.sales_quote_bling_orders(quote_id,external_key,status,attempt_count)
    values(p_quote_id,v_key,'processing',1);
  return jsonb_build_object('ok',true,'status','processing','external_key',v_key);
end $$;
revoke all on function public.sales_quote_bling_claim_v1(uuid) from public, anon, authenticated;
grant execute on function public.sales_quote_bling_claim_v1(uuid) to service_role;
