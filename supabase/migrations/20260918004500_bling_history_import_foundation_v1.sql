begin;

-- Etapa 8 — fundação segura para importar histórico antigo do Bling.
-- Nenhum registro desta área entra na inteligência do cliente até ser explicitamente promovido.

create table if not exists public.bling_history_import_runtime (
  id smallint primary key default 1 check (id=1),
  enabled boolean not null default false,
  fetch_enabled boolean not null default false,
  promotion_enabled boolean not null default false,
  max_orders_per_run integer not null default 10 check (max_orders_per_run between 1 and 100),
  start_date date,
  end_date date,
  notes text,
  updated_at timestamptz not null default now()
);

insert into public.bling_history_import_runtime(id)
values(1)
on conflict(id) do nothing;

create table if not exists public.bling_history_import_runs (
  id uuid primary key default gen_random_uuid(),
  mode text not null default 'preview' check (mode in ('preview','fetch','reconcile','promote')),
  status text not null default 'pending' check (status in ('pending','running','done','partial','error','cancelled')),
  requested_start_date date,
  requested_end_date date,
  page integer not null default 1 check (page>=1),
  page_size integer not null default 10 check (page_size between 1 and 100),
  fetched_count integer not null default 0,
  staged_count integer not null default 0,
  matched_count integer not null default 0,
  review_count integer not null default 0,
  promoted_count integer not null default 0,
  duplicate_count integer not null default 0,
  cursor jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bling_history_status_policy (
  bling_status_id bigint primary key,
  status_name text,
  canonical_status text check (canonical_status in ('delivered','cancelled','returned','ignored')),
  approved boolean not null default false,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists public.bling_history_staging_orders (
  id uuid primary key default gen_random_uuid(),
  bling_order_id bigint not null unique,
  import_run_id uuid references public.bling_history_import_runs(id) on delete set null,
  bling_contact_id bigint,
  order_number text,
  store_order_number text,
  order_date date,
  status_id bigint,
  status_name text,
  total numeric(14,2) not null default 0,
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  other_expenses numeric(14,2) not null default 0,
  customer_name text,
  customer_document text,
  customer_phone text,
  delivery_address jsonb not null default '{}'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  matched_customer_id uuid references public.customers(id) on delete set null,
  customer_match_method text,
  canonical_status text check (canonical_status in ('delivered','cancelled','returned','ignored')),
  reconciliation_status text not null default 'pending'
    check (reconciliation_status in ('pending','matched','review','duplicate_local','ready','promoted','ignored','error')),
  reconciliation_notes text[] not null default '{}'::text[],
  local_order_id uuid references public.orders(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  promoted_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.bling_history_staging_items (
  id uuid primary key default gen_random_uuid(),
  staging_order_id uuid not null references public.bling_history_staging_orders(id) on delete cascade,
  item_index integer not null check (item_index>=0),
  bling_product_id bigint,
  product_id uuid references public.products(id) on delete set null,
  product_match_method text,
  sku text,
  gtin text,
  name text not null,
  quantity numeric(14,3) not null default 0,
  unit_price numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(staging_order_id,item_index)
);

create table if not exists public.bling_history_reconciliation_issues (
  id uuid primary key default gen_random_uuid(),
  staging_order_id uuid not null references public.bling_history_staging_orders(id) on delete cascade,
  issue_type text not null check (issue_type in ('customer_ambiguous','customer_unmatched','status_unmapped','order_duplicate','total_mismatch','product_unmatched','product_ambiguous','other')),
  severity text not null default 'review' check (severity in ('info','review','blocking')),
  details jsonb not null default '{}'::jsonb,
  resolved boolean not null default false,
  resolution jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(staging_order_id,issue_type,details)
);

create index if not exists bling_history_staging_orders_run_idx
  on public.bling_history_staging_orders(import_run_id,order_date,bling_order_id);
create index if not exists bling_history_staging_orders_reconcile_idx
  on public.bling_history_staging_orders(reconciliation_status,order_date desc);
create index if not exists bling_history_staging_orders_contact_idx
  on public.bling_history_staging_orders(bling_contact_id);
create index if not exists bling_history_staging_items_order_idx
  on public.bling_history_staging_items(staging_order_id,item_index);
create index if not exists bling_history_staging_items_product_idx
  on public.bling_history_staging_items(product_id);
create index if not exists bling_history_issues_open_idx
  on public.bling_history_reconciliation_issues(resolved,severity,created_at)
  where resolved=false;

alter table public.bling_history_import_runtime enable row level security;
alter table public.bling_history_import_runs enable row level security;
alter table public.bling_history_status_policy enable row level security;
alter table public.bling_history_staging_orders enable row level security;
alter table public.bling_history_staging_items enable row level security;
alter table public.bling_history_reconciliation_issues enable row level security;

revoke all on public.bling_history_import_runtime from public,anon,authenticated;
revoke all on public.bling_history_import_runs from public,anon,authenticated;
revoke all on public.bling_history_status_policy from public,anon,authenticated;
revoke all on public.bling_history_staging_orders from public,anon,authenticated;
revoke all on public.bling_history_staging_items from public,anon,authenticated;
revoke all on public.bling_history_reconciliation_issues from public,anon,authenticated;

grant select,insert,update on public.bling_history_import_runtime to service_role;
grant select,insert,update on public.bling_history_import_runs to service_role;
grant select,insert,update,delete on public.bling_history_status_policy to service_role;
grant select,insert,update on public.bling_history_staging_orders to service_role;
grant select,insert,update,delete on public.bling_history_staging_items to service_role;
grant select,insert,update,delete on public.bling_history_reconciliation_issues to service_role;

create or replace function public.reconcile_bling_history_order_v1(p_staging_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  o public.bling_history_staging_orders%rowtype;
  v_existing_order uuid;
  v_by_bling uuid;
  v_by_doc uuid;
  v_by_phone uuid;
  v_customer uuid;
  v_method text;
  v_status text;
  v_notes text[]:='{}'::text[];
  v_ready boolean:=true;
  r record;
  v_product uuid;
  v_product_method text;
  v_candidates integer;
begin
  select * into o from public.bling_history_staging_orders where id=p_staging_order_id for update;
  if not found then raise exception 'staging_order_not_found'; end if;

  delete from public.bling_history_reconciliation_issues where staging_order_id=o.id and resolved=false;

  select id into v_existing_order from public.orders where bling_order_id=o.bling_order_id limit 1;
  if v_existing_order is not null then
    update public.bling_history_staging_orders
       set local_order_id=v_existing_order,
           reconciliation_status='duplicate_local',
           reconciliation_notes=array['Pedido já existe localmente pelo bling_order_id'],
           updated_at=now()
     where id=o.id;
    insert into public.bling_history_reconciliation_issues(staging_order_id,issue_type,severity,details)
    values(o.id,'order_duplicate','info',jsonb_build_object('local_order_id',v_existing_order,'bling_order_id',o.bling_order_id))
    on conflict do nothing;
    return jsonb_build_object('status','duplicate_local','local_order_id',v_existing_order);
  end if;

  if o.bling_contact_id is not null then
    select id into v_by_bling from public.customers where bling_contact_id=o.bling_contact_id limit 1;
  end if;

  if nullif(regexp_replace(coalesce(o.customer_document,''),'[^0-9]','','g'),'') is not null then
    select id into v_by_doc
      from public.customers
     where regexp_replace(coalesce(cpf_cnpj,''),'[^0-9]','','g')
           =regexp_replace(o.customer_document,'[^0-9]','','g')
     limit 1;
  end if;

  if nullif(public.normalize_phone_digits(o.customer_phone),'') is not null then
    select id into v_by_phone
      from public.customers
     where public.normalize_phone_digits(primary_whatsapp_e164)=public.normalize_phone_digits(o.customer_phone)
     limit 1;
  end if;

  if v_by_bling is not null then
    if (v_by_doc is not null and v_by_doc<>v_by_bling) or (v_by_phone is not null and v_by_phone<>v_by_bling) then
      v_ready:=false;
      v_notes:=array_append(v_notes,'Bling contact conflita com CPF/telefone local');
      insert into public.bling_history_reconciliation_issues(staging_order_id,issue_type,severity,details)
      values(o.id,'customer_ambiguous','blocking',jsonb_build_object('by_bling',v_by_bling,'by_document',v_by_doc,'by_phone',v_by_phone))
      on conflict do nothing;
    else
      v_customer:=v_by_bling;v_method:='bling_contact_id';
    end if;
  elsif v_by_doc is not null and v_by_phone is not null and v_by_doc<>v_by_phone then
    v_ready:=false;
    v_notes:=array_append(v_notes,'CPF e telefone apontam para clientes diferentes');
    insert into public.bling_history_reconciliation_issues(staging_order_id,issue_type,severity,details)
    values(o.id,'customer_ambiguous','blocking',jsonb_build_object('by_document',v_by_doc,'by_phone',v_by_phone))
    on conflict do nothing;
  elsif v_by_doc is not null then
    v_customer:=v_by_doc;v_method:='document_exact';
  elsif v_by_phone is not null then
    v_customer:=v_by_phone;v_method:='phone_exact';
  else
    v_ready:=false;
    v_notes:=array_append(v_notes,'Cliente não localizado');
    insert into public.bling_history_reconciliation_issues(staging_order_id,issue_type,severity,details)
    values(o.id,'customer_unmatched','blocking',jsonb_build_object('bling_contact_id',o.bling_contact_id))
    on conflict do nothing;
  end if;

  select canonical_status into v_status
    from public.bling_history_status_policy
   where bling_status_id=o.status_id and approved=true;

  if v_status is null then
    v_ready:=false;
    v_notes:=array_append(v_notes,'Situação do Bling ainda não mapeada');
    insert into public.bling_history_reconciliation_issues(staging_order_id,issue_type,severity,details)
    values(o.id,'status_unmapped','blocking',jsonb_build_object('status_id',o.status_id,'status_name',o.status_name))
    on conflict do nothing;
  end if;

  for r in
    select * from public.bling_history_staging_items where staging_order_id=o.id order by item_index
  loop
    v_product:=null;v_product_method:=null;v_candidates:=0;

    if r.bling_product_id is not null then
      select id into v_product from public.products where bling_product_id=r.bling_product_id limit 1;
      if v_product is not null then v_product_method:='bling_product_id'; end if;
    end if;

    if v_product is null and nullif(trim(coalesce(r.sku,'')),'') is not null then
      select count(*),min(id) into v_candidates,v_product
        from public.products where lower(trim(coalesce(sku,'')))=lower(trim(r.sku));
      if v_candidates=1 then v_product_method:='sku_exact'; else v_product:=null; end if;
    end if;

    if v_product is null and nullif(regexp_replace(coalesce(r.gtin,''),'[^0-9]','','g'),'') is not null then
      select count(*),min(id) into v_candidates,v_product
        from public.products
       where regexp_replace(coalesce(gtin,''),'[^0-9]','','g')
             =regexp_replace(r.gtin,'[^0-9]','','g');
      if v_candidates=1 then v_product_method:='gtin_exact'; else v_product:=null; end if;
    end if;

    update public.bling_history_staging_items
       set product_id=v_product,product_match_method=v_product_method,updated_at=now()
     where id=r.id;

    if v_product is null then
      insert into public.bling_history_reconciliation_issues(staging_order_id,issue_type,severity,details)
      values(o.id,'product_unmatched','review',jsonb_build_object('item_index',r.item_index,'bling_product_id',r.bling_product_id,'sku',r.sku,'gtin',r.gtin,'name',r.name))
      on conflict do nothing;
    end if;
  end loop;

  update public.bling_history_staging_orders
     set matched_customer_id=v_customer,
         customer_match_method=v_method,
         canonical_status=v_status,
         reconciliation_status=case when v_status='ignored' then 'ignored' when v_ready then 'ready' else 'review' end,
         reconciliation_notes=v_notes,
         updated_at=now()
   where id=o.id;

  return jsonb_build_object(
    'status',case when v_status='ignored' then 'ignored' when v_ready then 'ready' else 'review' end,
    'customer_id',v_customer,
    'customer_match_method',v_method,
    'canonical_status',v_status,
    'notes',v_notes
  );
end
$$;

create or replace function public.promote_bling_history_order_v1(p_staging_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  cfg public.bling_history_import_runtime%rowtype;
  s public.bling_history_staging_orders%rowtype;
  v_order_id uuid;
  v_existing uuid;
  i record;
  v_cancelled_at timestamptz;
  v_returned_at timestamptz;
begin
  select * into cfg from public.bling_history_import_runtime where id=1;
  if not found or cfg.promotion_enabled is not true then raise exception 'bling_history_promotion_disabled'; end if;

  select * into s from public.bling_history_staging_orders where id=p_staging_order_id for update;
  if not found then raise exception 'staging_order_not_found'; end if;
  if s.reconciliation_status='promoted' and s.local_order_id is not null then
    return jsonb_build_object('status','already_promoted','order_id',s.local_order_id);
  end if;
  if s.reconciliation_status<>'ready' then raise exception 'staging_order_not_ready'; end if;
  if s.matched_customer_id is null then raise exception 'customer_not_reconciled'; end if;
  if s.canonical_status is null or s.canonical_status='ignored' then raise exception 'status_not_promotable'; end if;

  select id into v_existing from public.orders where bling_order_id=s.bling_order_id limit 1;
  if v_existing is not null then
    update public.bling_history_staging_orders set local_order_id=v_existing,reconciliation_status='duplicate_local',updated_at=now() where id=s.id;
    return jsonb_build_object('status','duplicate_local','order_id',v_existing);
  end if;

  v_cancelled_at:=case when s.canonical_status='cancelled' then coalesce(s.order_date::timestamptz,now()) end;
  v_returned_at:=case when s.canonical_status='returned' then coalesce(s.order_date::timestamptz,now()) end;

  insert into public.orders(
    bling_order_id,customer_id,status,total,subtotal,fiscal_subtotal,other_expenses,discount,
    delivery_address,customer_snapshot,confirmed_at,created_at,updated_at,cancelled_at,returned_at,
    phone_e164,source,order_number,sync_status,checkout_snapshot
  )
  values(
    s.bling_order_id,s.matched_customer_id,s.canonical_status,s.total,s.subtotal,s.subtotal,s.other_expenses,s.discount,
    s.delivery_address,
    jsonb_strip_nulls(jsonb_build_object(
      'name',s.customer_name,
      'document',s.customer_document,
      'phone',s.customer_phone,
      'bling_contact_id',s.bling_contact_id,
      'source','bling_history_import'
    )),
    coalesce(s.order_date::timestamptz,now()),
    coalesce(s.order_date::timestamptz,now()),
    now(),
    v_cancelled_at,v_returned_at,
    nullif(trim(s.customer_phone),''),
    'bling_import',
    coalesce(nullif(trim(s.order_number),''),'BLING-'||s.bling_order_id::text),
    'sent_to_bling',
    jsonb_build_object(
      'source','bling_import',
      'bling_order_id',s.bling_order_id,
      'bling_status_id',s.status_id,
      'bling_status_name',s.status_name,
      'import_staging_id',s.id
    )
  )
  returning id into v_order_id;

  for i in
    select * from public.bling_history_staging_items where staging_order_id=s.id order by item_index
  loop
    insert into public.order_items(order_id,product_id,sku_snapshot,name_snapshot,quantity,unit_price,line_total,metadata,created_at)
    values(
      v_order_id,i.product_id,nullif(trim(i.sku),''),i.name,i.quantity,i.unit_price,i.line_total,
      jsonb_build_object(
        'source','bling_import',
        'bling_product_id',i.bling_product_id,
        'product_match_method',i.product_match_method,
        'historical_snapshot',true
      ),
      coalesce(s.order_date::timestamptz,now())
    );
  end loop;

  update public.bling_history_staging_orders
     set local_order_id=v_order_id,reconciliation_status='promoted',promoted_at=now(),updated_at=now()
   where id=s.id;

  return jsonb_build_object('status','promoted','order_id',v_order_id,'bling_order_id',s.bling_order_id);
end
$$;

create or replace function public.bling_history_import_readiness_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
select jsonb_build_object(
  'enabled',r.enabled,
  'fetch_enabled',r.fetch_enabled,
  'promotion_enabled',r.promotion_enabled,
  'max_orders_per_run',r.max_orders_per_run,
  'start_date',r.start_date,
  'end_date',r.end_date,
  'staged_orders',(select count(*) from public.bling_history_staging_orders),
  'pending',(select count(*) from public.bling_history_staging_orders where reconciliation_status='pending'),
  'ready',(select count(*) from public.bling_history_staging_orders where reconciliation_status='ready'),
  'review',(select count(*) from public.bling_history_staging_orders where reconciliation_status='review'),
  'promoted',(select count(*) from public.bling_history_staging_orders where reconciliation_status='promoted'),
  'duplicates',(select count(*) from public.bling_history_staging_orders where reconciliation_status='duplicate_local'),
  'open_issues',(select count(*) from public.bling_history_reconciliation_issues where resolved=false)
)
from public.bling_history_import_runtime r
where r.id=1
$$;

revoke all on function public.reconcile_bling_history_order_v1(uuid) from public,anon,authenticated;
revoke all on function public.promote_bling_history_order_v1(uuid) from public,anon,authenticated;
revoke all on function public.bling_history_import_readiness_v1() from public,anon,authenticated;
grant execute on function public.reconcile_bling_history_order_v1(uuid) to service_role;
grant execute on function public.promote_bling_history_order_v1(uuid) to service_role;
grant execute on function public.bling_history_import_readiness_v1() to service_role;

commit;
