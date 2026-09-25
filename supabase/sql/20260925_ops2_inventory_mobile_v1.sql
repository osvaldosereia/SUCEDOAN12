-- Dona Antonia Operations 2.0
-- Mobile inventory control: physical count audit + damage/expiry/loss incidents.
-- During transition, local storefront stock is updated for availability,
-- while ERP/fiscal reconciliation stays explicit and auditable.

create table if not exists public.ops_inventory_counts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  product_id uuid not null references public.products(id) on delete restrict,
  product_name_snapshot text not null,
  gtin_snapshot text,
  sku_snapshot text,
  system_quantity_before numeric(14,3) not null,
  counted_quantity numeric(14,3) not null check (counted_quantity>=0),
  difference numeric(14,3) not null,
  operator_label text,
  source text not null default 'mobile_balance',
  local_stock_applied boolean not null default true,
  reconciliation_state text not null
    check (reconciliation_state in ('matched','pending_erp_reconciliation','resolved')),
  reconciliation_ref text,
  notes text
);

create index if not exists ops_inventory_counts_product_idx
  on public.ops_inventory_counts(product_id,created_at desc);

create index if not exists ops_inventory_counts_pending_idx
  on public.ops_inventory_counts(reconciliation_state,created_at)
  where reconciliation_state='pending_erp_reconciliation';

alter table public.ops_inventory_counts enable row level security;

create table if not exists public.ops_inventory_incidents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  incident_type text not null
    check (incident_type in ('damage','expired','loss','return','other')),
  status text not null default 'open'
    check (status in ('open','review','closed')),
  product_id uuid not null references public.products(id) on delete restrict,
  product_name_snapshot text not null,
  gtin_snapshot text,
  sku_snapshot text,
  quantity numeric(14,3) not null check (quantity>0),
  local_stock_before numeric(14,3) not null,
  local_stock_delta numeric(14,3) not null default 0,
  local_stock_after numeric(14,3) not null,
  local_stock_applied boolean not null default false,
  needs_bling_reconciliation boolean not null default true,
  source_order_id uuid references public.orders(id) on delete set null,
  operator_label text,
  note text,
  resolution text,
  resolution_ref text,
  evidence jsonb not null default '{}'::jsonb
);

create index if not exists ops_inventory_incidents_open_idx
  on public.ops_inventory_incidents(status,created_at)
  where status in ('open','review');

create index if not exists ops_inventory_incidents_product_idx
  on public.ops_inventory_incidents(product_id,created_at desc);

alter table public.ops_inventory_incidents enable row level security;

create or replace function public.ops_record_inventory_count_v1(
  p_product_id uuid,
  p_counted_quantity numeric,
  p_operator_label text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_product public.products%rowtype;
  v_diff numeric(14,3);
  v_state text;
  v_count_id uuid;
begin
  if p_counted_quantity is null or p_counted_quantity<0 then
    raise exception 'invalid_quantity';
  end if;

  select * into v_product
  from public.products
  where id=p_product_id
  for update;

  if not found then raise exception 'product_not_found'; end if;

  v_diff:=round(p_counted_quantity-coalesce(v_product.stock,0),3);
  v_state:=case when v_diff=0 then 'matched' else 'pending_erp_reconciliation' end;

  update public.products
     set stock=round(p_counted_quantity,3),
         last_counted_at=now(),
         physically_verified=true,
         updated_at=now()
   where id=p_product_id;

  insert into public.ops_inventory_counts(
    product_id,product_name_snapshot,gtin_snapshot,sku_snapshot,
    system_quantity_before,counted_quantity,difference,operator_label,
    reconciliation_state
  ) values (
    v_product.id,v_product.name,v_product.gtin,v_product.sku,
    coalesce(v_product.stock,0),round(p_counted_quantity,3),v_diff,
    left(nullif(trim(coalesce(p_operator_label,'')),''),80),v_state
  )
  returning id into v_count_id;

  perform public.ops_record_event_v1(
    'inventory','inventory.count_recorded',
    case when v_diff=0 then 'Contagem física conferida sem diferença.'
         else 'Contagem física registrou diferença de estoque.' end,
    'human','product',v_product.id::text,v_product.id::text,
    null,left(nullif(trim(coalesce(p_operator_label,'')),''),80),
    'dona_antonia',
    case when v_diff=0 then 'info' else 'warning' end,
    jsonb_build_object(
      'count_id',v_count_id,
      'system_before',coalesce(v_product.stock,0),
      'counted',round(p_counted_quantity,3),
      'difference',v_diff,
      'local_stock_applied',true,
      'erp_reconciliation',v_state
    ),
    null,'inventory-count:'||v_count_id::text,now()
  );

  if v_diff<>0 then
    perform public.ops_open_attention_v1(
      'inventory_count_difference',
      'Balanço encontrou diferença em '||v_product.name||'.',
      'product',v_product.id::text,v_product.id::text,
      'normal','supervisor',
      'Revisar a causa da diferença antes da regularização definitiva no Bling/fiscal.',
      jsonb_build_object(
        'count_id',v_count_id,
        'system_before',coalesce(v_product.stock,0),
        'counted',round(p_counted_quantity,3),
        'difference',v_diff,
        'local_stock_applied',true
      ),
      'dona_antonia',
      'inventory-count-difference:'||v_count_id::text,
      null
    );
  end if;

  return jsonb_build_object(
    'count_id',v_count_id,
    'product_id',v_product.id,
    'previous_stock',coalesce(v_product.stock,0),
    'counted_stock',round(p_counted_quantity,3),
    'difference',v_diff,
    'reconciliation_state',v_state
  );
end;
$$;

create or replace function public.ops_record_inventory_incident_v1(
  p_product_id uuid,
  p_incident_type text,
  p_quantity numeric,
  p_operator_label text default null,
  p_note text default null,
  p_source_order_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_product public.products%rowtype;
  v_type text:=lower(trim(coalesce(p_incident_type,'')));
  v_before numeric(14,3);
  v_delta numeric(14,3):=0;
  v_after numeric(14,3);
  v_apply boolean:=false;
  v_incident_id uuid;
  v_priority text:='normal';
begin
  if v_type not in ('damage','expired','loss','return','other') then
    raise exception 'invalid_incident_type';
  end if;
  if p_quantity is null or p_quantity<=0 then
    raise exception 'invalid_quantity';
  end if;

  select * into v_product
  from public.products
  where id=p_product_id
  for update;

  if not found then raise exception 'product_not_found'; end if;

  v_before:=coalesce(v_product.stock,0);
  v_apply:=v_type in ('damage','expired','loss');

  if v_apply then
    v_delta:=-least(round(p_quantity,3),v_before);
    v_after:=greatest(v_before+v_delta,0);

    update public.products
       set stock=v_after,
           updated_at=now()
     where id=v_product.id;

    if p_quantity>v_before then v_priority:='high'; end if;
  else
    v_after:=v_before;
  end if;

  insert into public.ops_inventory_incidents(
    incident_type,status,product_id,product_name_snapshot,gtin_snapshot,sku_snapshot,
    quantity,local_stock_before,local_stock_delta,local_stock_after,local_stock_applied,
    needs_bling_reconciliation,source_order_id,operator_label,note,evidence
  ) values (
    v_type,'open',v_product.id,v_product.name,v_product.gtin,v_product.sku,
    round(p_quantity,3),v_before,v_delta,v_after,v_apply,true,p_source_order_id,
    left(nullif(trim(coalesce(p_operator_label,'')),''),80),
    left(nullif(trim(coalesce(p_note,'')),''),500),
    jsonb_build_object(
      'target','bling_quarantine_or_fiscal_reconciliation',
      'transition_mode',true,
      'requested_quantity',round(p_quantity,3),
      'available_local_stock_before',v_before
    )
  )
  returning id into v_incident_id;

  perform public.ops_record_event_v1(
    'inventory','inventory.incident_recorded',
    case v_type
      when 'damage' then 'Avaria registrada.'
      when 'expired' then 'Produto vencido registrado.'
      when 'loss' then 'Perda/extravio registrado.'
      when 'return' then 'Retorno físico registrado para inspeção.'
      else 'Ocorrência de estoque registrada.'
    end,
    'human','product',v_product.id::text,v_product.id::text,
    null,left(nullif(trim(coalesce(p_operator_label,'')),''),80),
    'dona_antonia',
    case when v_priority='high' then 'warning' else 'info' end,
    jsonb_build_object(
      'incident_id',v_incident_id,
      'incident_type',v_type,
      'quantity',round(p_quantity,3),
      'local_stock_before',v_before,
      'local_stock_delta',v_delta,
      'local_stock_after',v_after,
      'local_stock_applied',v_apply,
      'needs_bling_reconciliation',true
    ),
    null,'inventory-incident:'||v_incident_id::text,now()
  );

  perform public.ops_open_attention_v1(
    'inventory_incident',
    case v_type
      when 'damage' then 'Avaria aguardando destino/reconciliação: '||v_product.name
      when 'expired' then 'Produto vencido aguardando descarte/reconciliação: '||v_product.name
      when 'loss' then 'Perda/extravio aguardando regularização: '||v_product.name
      when 'return' then 'Produto retornado aguardando inspeção: '||v_product.name
      else 'Ocorrência de estoque aguardando revisão: '||v_product.name
    end,
    'inventory_incident',v_incident_id::text,v_product.id::text,
    v_priority,'supervisor',
    case v_type
      when 'return' then 'Inspecionar e decidir: voltar ao Geral, devolver fornecedor ou descartar.'
      else 'Revisar destino físico e conciliar no Bling/fiscal conforme a causa.'
    end,
    jsonb_build_object(
      'incident_id',v_incident_id,
      'product_id',v_product.id,
      'incident_type',v_type,
      'quantity',round(p_quantity,3),
      'local_stock_applied',v_apply,
      'local_stock_delta',v_delta
    ),
    'dona_antonia',
    'inventory-incident:'||v_incident_id::text,
    null
  );

  return jsonb_build_object(
    'incident_id',v_incident_id,
    'product_id',v_product.id,
    'incident_type',v_type,
    'quantity',round(p_quantity,3),
    'local_stock_before',v_before,
    'local_stock_delta',v_delta,
    'local_stock_after',v_after,
    'local_stock_applied',v_apply,
    'needs_bling_reconciliation',true
  );
end;
$$;

create or replace function public.get_ops_inventory_incidents_v1(p_limit integer default 30)
returns jsonb
language sql
security definer
set search_path=public
stable
as $$
  select jsonb_build_object(
    'open',count(*) filter (where status in ('open','review')),
    'damage',count(*) filter (where status in ('open','review') and incident_type='damage'),
    'expired',count(*) filter (where status in ('open','review') and incident_type='expired'),
    'loss',count(*) filter (where status in ('open','review') and incident_type='loss'),
    'return',count(*) filter (where status in ('open','review') and incident_type='return'),
    'incidents',coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',id,'created_at',created_at,'incident_type',incident_type,'status',status,
          'product_id',product_id,'product_name',product_name_snapshot,'gtin',gtin_snapshot,
          'sku',sku_snapshot,'quantity',quantity,'local_stock_before',local_stock_before,
          'local_stock_delta',local_stock_delta,'local_stock_after',local_stock_after,
          'local_stock_applied',local_stock_applied,'needs_bling_reconciliation',needs_bling_reconciliation,
          'operator_label',operator_label,'note',note,'source_order_id',source_order_id
        ) order by created_at desc
      ) filter (where rn<=greatest(1,least(100,coalesce(p_limit,30)))),
      '[]'::jsonb
    )
  )
  from (
    select i.*,row_number() over(order by created_at desc) rn
    from public.ops_inventory_incidents i
    where status in ('open','review')
  ) x;
$$;

revoke all on function public.ops_record_inventory_count_v1(uuid,numeric,text) from public,anon,authenticated;
revoke all on function public.ops_record_inventory_incident_v1(uuid,text,numeric,text,text,uuid) from public,anon,authenticated;
revoke all on function public.get_ops_inventory_incidents_v1(integer) from public,anon,authenticated;

grant execute on function public.ops_record_inventory_count_v1(uuid,numeric,text) to service_role;
grant execute on function public.ops_record_inventory_incident_v1(uuid,text,numeric,text,text,uuid) to service_role;
grant execute on function public.get_ops_inventory_incidents_v1(integer) to service_role;

create or replace function public.get_ops_control_tower_summary_v1()
returns jsonb
language sql
security definer
set search_path=public
stable
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'orders', jsonb_build_object(
      'awaiting', (select count(*) from public.orders where status='storefront_received'),
      'confirmed', (select count(*) from public.orders where status='confirmed'),
      'ready', (select count(*) from public.orders where status='ready'),
      'delivered', (select count(*) from public.orders where status='delivered'),
      'cancelled', (select count(*) from public.orders where status='cancelled')
    ),
    'whatsapp', jsonb_build_object(
      'human_required', (select count(*) from public.conversations where channel='whatsapp' and human_required=true),
      'human_mode', (select count(*) from public.conversations where channel='whatsapp' and mode='human')
    ),
    'inventory', jsonb_build_object(
      'active_products', (select count(*) from public.products where is_active=true),
      'zero_or_negative', (select count(*) from public.products where is_active=true and coalesce(stock,0)<=0),
      'expires_90d', (select count(*) from public.products where is_active=true and validity_date is not null and validity_date between current_date and current_date+90),
      'expired', (select count(*) from public.products where is_active=true and validity_date is not null and validity_date<current_date),
      'count_differences_pending', (select count(*) from public.ops_inventory_counts where reconciliation_state='pending_erp_reconciliation'),
      'incidents_open', (select count(*) from public.ops_inventory_incidents where status in ('open','review'))
    ),
    'attention', jsonb_build_object(
      'open', (select count(*) from public.ops_attention where status in ('open','acknowledged')),
      'critical', (select count(*) from public.ops_attention where status in ('open','acknowledged') and priority='critical'),
      'high', (select count(*) from public.ops_attention where status in ('open','acknowledged') and priority='high')
    ),
    'approvals', jsonb_build_object(
      'pending', (select count(*) from public.ops_approvals where status='pending')
    ),
    'printing', jsonb_build_object(
      'pending', (select count(*) from public.ops_print_jobs where status='pending'),
      'failed', (select count(*) from public.ops_print_jobs where status='failed'),
      'claimed', (select count(*) from public.ops_print_jobs where status='claimed'),
      'presented', (select count(*) from public.ops_print_jobs where status='presented'),
      'printed', (select count(*) from public.ops_print_jobs where status='printed')
    )
  );
$$;
