-- R7 receipt plan hardening: aggregate repeated products and require fresh Bling observation.

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
    'product_id',q.product_id,
    'bling_product_id',q.bling_product_id,
    'quantity',q.quantity,
    'base_unit',q.base_unit,
    'purchase_item_ids',q.purchase_item_ids
  ) order by q.product_id),'[]'::jsonb)
  into v_expected
  from (
    select
      i.product_id,
      max(coalesce(l.bling_id,i.bling_product_id)) as bling_product_id,
      sum(i.converted_quantity)::numeric(18,6) as quantity,
      min(i.base_unit) as base_unit,
      jsonb_agg(i.id order by i.item_number) as purchase_item_ids
    from public.purchase_xml_items i
    left join lateral (
      select bling_id from public.bling_hub_entity_links_v2 x
      where x.entity_type='product' and x.status='matched' and x.source_id=i.product_id::text
      order by x.last_verified_at desc nulls last limit 1
    ) l on true
    where i.document_id=p_document_id
    group by i.product_id
  ) q;

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
    expected_items=case when purchase_stock_receipt_plans_v1.status='verified'
      then purchase_stock_receipt_plans_v1.expected_items else excluded.expected_items end,
    baseline_snapshot=case when purchase_stock_receipt_plans_v1.status='verified'
      then purchase_stock_receipt_plans_v1.baseline_snapshot else excluded.baseline_snapshot end,
    lot_evidence_summary=excluded.lot_evidence_summary,
    deposit_id=excluded.deposit_id,
    stock_authority=excluded.stock_authority,
    updated_at=case when purchase_stock_receipt_plans_v1.status='verified'
      then purchase_stock_receipt_plans_v1.updated_at else now() end
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
  v_stale integer:=0;
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
    'product_id',e.product_id,
    'bling_product_id',e.bling_product_id,
    'physical',c.sellable_physical,
    'virtual',c.sellable_virtual,
    'observed_at',c.mirror_observed_at,
    'baseline_physical',b.physical,
    'expected_delta',e.qty,
    'observed_delta',coalesce(c.sellable_physical,0)-coalesce(b.physical,0),
    'fresh_observation',coalesce(c.mirror_observed_at>v_plan.created_at,false),
    'verified',
      coalesce(c.mirror_observed_at>v_plan.created_at,false)
      and (coalesce(c.sellable_physical,0)-coalesce(b.physical,0))>=coalesce(e.qty,0)
  ) order by e.product_id),'[]'::jsonb),
  count(*) filter(where c.product_id is null
    or coalesce(c.mirror_observed_at>v_plan.created_at,false) is not true
    or (coalesce(c.sellable_physical,0)-coalesce(b.physical,0))<coalesce(e.qty,0)),
  count(*) filter(where c.product_id is not null
    and coalesce(c.mirror_observed_at>v_plan.created_at,false) is not true)
  into v_current,v_missing,v_stale
  from (
    select (x->>'product_id')::uuid product_id,
           nullif(x->>'bling_product_id','')::bigint bling_product_id,
           coalesce((x->>'quantity')::numeric,0) qty
    from jsonb_array_elements(v_plan.expected_items) x
  ) e
  left join lateral (
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
         review_reason=case
           when v_missing=0 then null
           when v_stale>0 then 'bling_stock_mirror_not_refreshed_after_plan'
           else 'bling_physical_delta_not_verified' end,
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
    'ok',true,'verified',v_missing=0,'missing_items',v_missing,'stale_items',v_stale,
    'plan_id',v_plan.id,'verification_snapshot',coalesce(v_current,'[]'::jsonb),
    'local_stock_applied',false,'external_write',false
  );
end;
$$;