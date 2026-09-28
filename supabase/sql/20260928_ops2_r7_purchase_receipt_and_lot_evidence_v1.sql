-- R7 purchase XML receipt, lot evidence and Bling-authority verification.

create table if not exists public.purchase_xml_item_lot_evidence (
  id uuid primary key default gen_random_uuid(),
  purchase_item_id uuid not null references public.purchase_xml_items(id) on delete cascade,
  trace_index integer not null default 1 check (trace_index > 0),
  lot_code text,
  manufacture_date date,
  expiration_date date,
  xml_quantity numeric(18,6),
  base_quantity numeric(18,6),
  conversion_factor numeric(18,6),
  status text not null default 'observed'
    check (status in ('observed','ready','review_required','materialized','ignored')),
  source text not null default 'nfe_rastro',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(purchase_item_id,trace_index)
);

create index if not exists purchase_xml_item_lot_evidence_item_idx
  on public.purchase_xml_item_lot_evidence(purchase_item_id,status,expiration_date);

alter table public.purchase_xml_item_lot_evidence enable row level security;
revoke all on table public.purchase_xml_item_lot_evidence from public,anon,authenticated;
grant select,insert,update,delete on table public.purchase_xml_item_lot_evidence to service_role;

create table if not exists public.purchase_stock_receipt_plans_v1 (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.purchase_xml_documents(id) on delete restrict,
  status text not null default 'preview'
    check (status in ('preview','awaiting_bling_receipt','verified','review_required','cancelled')),
  stock_authority text not null,
  deposit_id bigint,
  expected_items jsonb not null default '[]'::jsonb,
  baseline_snapshot jsonb not null default '[]'::jsonb,
  verification_snapshot jsonb not null default '[]'::jsonb,
  lot_evidence_summary jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  verified_by uuid,
  review_reason text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.purchase_stock_receipt_plans_v1 enable row level security;
revoke all on table public.purchase_stock_receipt_plans_v1 from public,anon,authenticated;
grant select,insert,update,delete on table public.purchase_stock_receipt_plans_v1 to service_role;

create or replace function public.get_purchase_xml_receipt_preflight_v1(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  d public.purchase_xml_documents%rowtype;
  v_authority text;
  v_deposit bigint;
  v_total integer:=0;
  v_ready integer:=0;
  v_review integer:=0;
  v_unlinked integer:=0;
  v_lot_rows integer:=0;
  v_lot_review integer:=0;
  v_cpf boolean:=false;
begin
  select * into d from public.purchase_xml_documents where id=p_document_id;
  if not found then
    return jsonb_build_object('ok',false,'ready',false,'error','document_not_found');
  end if;

  select coalesce(metadata->>'ops2_stock_authority','legacy_shadow'),
         nullif(metadata->>'selected_deposit_id','')::bigint
    into v_authority,v_deposit
    from public.bling_hub_runtime_v2 where id=1;

  select count(*),
         count(*) filter(where product_id is not null
           and conversion_status<>'review_required'
           and processing_status not in ('review_required','failed','pending')
           and coalesce(converted_quantity,0)>0
           and coalesce(base_unit_cost,0)>=0),
         count(*) filter(where product_id is null
           or conversion_status='review_required'
           or processing_status in ('review_required','failed','pending')
           or coalesce(converted_quantity,0)<=0),
         count(*) filter(where product_id is not null and not exists(
           select 1 from public.bling_hub_entity_links_v2 l
           where l.entity_type='product'
             and l.status='matched'
             and l.source_id=purchase_xml_items.product_id::text
         ))
    into v_total,v_ready,v_review,v_unlinked
    from public.purchase_xml_items
   where document_id=p_document_id;

  select count(*),
         count(*) filter(where e.status='review_required' or e.expiration_date is null)
    into v_lot_rows,v_lot_review
    from public.purchase_xml_item_lot_evidence e
    join public.purchase_xml_items i on i.id=e.purchase_item_id
   where i.document_id=p_document_id;

  v_cpf:=d.recipient_kind='CPF';

  return jsonb_build_object(
    'ok',true,
    'document_id',d.id,
    'document_key',d.document_key,
    'processing_status',d.processing_status,
    'receipt_status',d.receipt_status,
    'recipient_kind',d.recipient_kind,
    'financial_eligible',d.financial_eligible,
    'finance_status',d.finance_status,
    'cpf_finance_blocked',v_cpf and d.financial_eligible=false and d.finance_status='blocked_personal',
    'stock_authority',v_authority,
    'deposit_id',v_deposit,
    'item_count',v_total,
    'ready_item_count',v_ready,
    'review_item_count',v_review,
    'unlinked_bling_products',v_unlinked,
    'lot_evidence_rows',v_lot_rows,
    'lot_evidence_review_rows',v_lot_review,
    'local_stock_write_allowed',v_authority<>'bling',
    'external_bling_receipt_required',v_authority='bling',
    'ready',
      d.processing_status='processed'
      and v_total>0
      and v_review=0
      and v_unlinked=0
      and (v_authority<>'bling' or v_deposit is not null),
    'blocking_reasons',
      to_jsonb(array_remove(array[
        case when d.processing_status<>'processed' then 'document_not_processed' end,
        case when v_total=0 then 'document_without_items' end,
        case when v_review>0 then 'items_require_conversion_or_match_review' end,
        case when v_unlinked>0 then 'products_not_linked_to_bling' end,
        case when v_authority='bling' and v_deposit is null then 'bling_deposit_missing' end,
        case when v_lot_review>0 then 'lot_evidence_requires_review' end
      ],null))
  );
end;
$$;

revoke all on function public.get_purchase_xml_receipt_preflight_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_purchase_xml_receipt_preflight_v1(uuid) to service_role;

create or replace function public.prepare_purchase_stock_receipt_plan_v1(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  p jsonb;
  v_plan public.purchase_stock_receipt_plans_v1%rowtype;
  v_expected jsonb;
  v_baseline jsonb;
  v_lot_summary jsonb;
  v_authority text;
  v_deposit bigint;
begin
  p:=public.get_purchase_xml_receipt_preflight_v1(p_document_id);
  if coalesce((p->>'ready')::boolean,false) is not true then
    return jsonb_build_object('ok',false,'error','purchase_receipt_preflight_failed','preflight',p);
  end if;

  v_authority:=p->>'stock_authority';
  v_deposit:=nullif(p->>'deposit_id','')::bigint;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',i.product_id,
    'bling_product_id',coalesce(l.bling_id,i.bling_product_id),
    'quantity',i.converted_quantity,
    'base_unit',i.base_unit,
    'base_unit_cost',i.base_unit_cost,
    'purchase_item_id',i.id
  ) order by i.item_number),'[]'::jsonb)
  into v_expected
  from public.purchase_xml_items i
  left join lateral (
    select bling_id from public.bling_hub_entity_links_v2 x
    where x.entity_type='product' and x.status='matched' and x.source_id=i.product_id::text
    order by x.last_verified_at desc nulls last limit 1
  ) l on true
  where i.document_id=p_document_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',x.product_id,
    'bling_product_id',x.bling_product_id,
    'physical',x.sellable_physical,
    'virtual',x.sellable_virtual,
    'observed_at',x.mirror_observed_at
  ) order by x.product_id),'[]'::jsonb)
  into v_baseline
  from public.ops2_sellable_stock_v1 x
  where x.product_id in (
    select product_id from public.purchase_xml_items where document_id=p_document_id and product_id is not null
  );

  select jsonb_build_object(
    'rows',count(*),
    'ready',count(*) filter(where e.status in ('observed','ready') and e.expiration_date is not null),
    'review_required',count(*) filter(where e.status='review_required' or e.expiration_date is null)
  )
  into v_lot_summary
  from public.purchase_xml_item_lot_evidence e
  join public.purchase_xml_items i on i.id=e.purchase_item_id
  where i.document_id=p_document_id;

  insert into public.purchase_stock_receipt_plans_v1(
    document_id,status,stock_authority,deposit_id,expected_items,baseline_snapshot,
    lot_evidence_summary,idempotency_key,updated_at
  ) values(
    p_document_id,
    case when v_authority='bling' then 'awaiting_bling_receipt' else 'preview' end,
    v_authority,v_deposit,v_expected,v_baseline,coalesce(v_lot_summary,'{}'::jsonb),
    'purchase-receipt-plan:'||p_document_id::text,now()
  )
  on conflict(document_id) do update set
    expected_items=excluded.expected_items,
    baseline_snapshot=case
      when purchase_stock_receipt_plans_v1.status='verified'
        then purchase_stock_receipt_plans_v1.baseline_snapshot
      else excluded.baseline_snapshot end,
    lot_evidence_summary=excluded.lot_evidence_summary,
    deposit_id=excluded.deposit_id,
    stock_authority=excluded.stock_authority,
    updated_at=now()
  returning * into v_plan;

  return jsonb_build_object(
    'ok',true,'plan_id',v_plan.id,'document_id',v_plan.document_id,
    'status',v_plan.status,'stock_authority',v_plan.stock_authority,
    'deposit_id',v_plan.deposit_id,'expected_items',v_plan.expected_items,
    'baseline_snapshot',v_plan.baseline_snapshot,
    'lot_evidence_summary',v_plan.lot_evidence_summary,
    'external_write',false
  );
end;
$$;

revoke all on function public.prepare_purchase_stock_receipt_plan_v1(uuid) from public,anon,authenticated;
grant execute on function public.prepare_purchase_stock_receipt_plan_v1(uuid) to service_role;

create or replace function public.verify_purchase_stock_receipt_plan_v1(
  p_document_id uuid,
  p_user_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_plan public.purchase_stock_receipt_plans_v1%rowtype;
  v_current jsonb;
  v_missing integer:=0;
  v_now timestamptz:=now();
begin
  select * into v_plan
  from public.purchase_stock_receipt_plans_v1
  where document_id=p_document_id
  for update;

  if not found then raise exception 'purchase_receipt_plan_not_found'; end if;
  if v_plan.status='verified' then
    return jsonb_build_object('ok',true,'verified',true,'idempotent_replay',true,'plan_id',v_plan.id);
  end if;
  if v_plan.stock_authority<>'bling' then
    raise exception 'purchase_receipt_plan_not_bling_authority';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',c.product_id,
    'bling_product_id',c.bling_product_id,
    'physical',c.sellable_physical,
    'virtual',c.sellable_virtual,
    'observed_at',c.mirror_observed_at,
    'baseline_physical',b.physical,
    'expected_delta',e.qty,
    'observed_delta',coalesce(c.sellable_physical,0)-coalesce(b.physical,0),
    'verified',(coalesce(c.sellable_physical,0)-coalesce(b.physical,0))>=coalesce(e.qty,0)
  ) order by c.product_id),'[]'::jsonb),
  count(*) filter(where (coalesce(c.sellable_physical,0)-coalesce(b.physical,0))<coalesce(e.qty,0))
  into v_current,v_missing
  from (
    select (x->>'product_id')::uuid product_id,
           nullif(x->>'bling_product_id','')::bigint bling_product_id,
           coalesce((x->>'quantity')::numeric,0) qty
    from jsonb_array_elements(v_plan.expected_items) x
  ) e
  join lateral (
    select coalesce((x->>'physical')::numeric,0) physical
    from jsonb_array_elements(v_plan.baseline_snapshot) x
    where (x->>'product_id')::uuid=e.product_id
    limit 1
  ) b on true
  left join public.ops2_sellable_stock_v1 c on c.product_id=e.product_id;

  update public.purchase_stock_receipt_plans_v1
     set verification_snapshot=coalesce(v_current,'[]'::jsonb),
         status=case when v_missing=0 then 'verified' else 'review_required' end,
         verified_at=case when v_missing=0 then v_now else null end,
         verified_by=case when v_missing=0 then p_user_id else null end,
         review_reason=case when v_missing=0 then null else 'bling_physical_delta_not_verified' end,
         updated_at=v_now
   where id=v_plan.id;

  if v_missing=0 then
    update public.purchase_xml_documents
       set receipt_status='received',updated_at=v_now
     where id=p_document_id;

    insert into public.purchase_stock_receipts(document_id,status,confirmed_by,confirmed_at,applied_at,result,idempotency_key,updated_at)
    values(
      p_document_id,'applied',p_user_id,v_now,v_now,
      jsonb_build_object('mode','bling_verified','verification_snapshot',v_current,'local_stock_applied',false),
      'purchase-stock:'||p_document_id::text,v_now
    )
    on conflict(document_id) do update set
      status='applied',confirmed_by=coalesce(public.purchase_stock_receipts.confirmed_by,excluded.confirmed_by),
      confirmed_at=coalesce(public.purchase_stock_receipts.confirmed_at,excluded.confirmed_at),
      applied_at=coalesce(public.purchase_stock_receipts.applied_at,excluded.applied_at),
      result=excluded.result,updated_at=v_now;

    insert into public.bling_hub_audit_v2(event_type,severity,domain,source_system,source_id,details)
    values('purchase_stock_receipt_bling_verified','info','stock','bling',p_document_id,
      jsonb_build_object('local_stock_applied',false,'verification_snapshot',v_current,'verified_by',p_user_id));
  end if;

  return jsonb_build_object(
    'ok',true,'verified',v_missing=0,'missing_items',v_missing,
    'plan_id',v_plan.id,'verification_snapshot',coalesce(v_current,'[]'::jsonb),
    'local_stock_applied',false,'external_write',false
  );
end;
$$;

revoke all on function public.verify_purchase_stock_receipt_plan_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.verify_purchase_stock_receipt_plan_v1(uuid,uuid) to service_role;