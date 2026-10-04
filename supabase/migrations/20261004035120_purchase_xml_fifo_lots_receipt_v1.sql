create or replace function public.activate_purchase_xml_inventory_lots_v1(
  p_document_id uuid,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_items integer:=0;
  v_active integer:=0;
begin
  update public.purchase_xml_items
     set processing_status=processing_status,
         updated_at=now()
   where document_id=p_document_id
     and product_id is not null
     and coalesce(converted_quantity,0)>0;
  get diagnostics v_items=row_count;

  select count(*) into v_active
    from public.purchase_xml_items i
    join public.product_inventory_lots l on l.id=i.inventory_lot_id
   where i.document_id=p_document_id and l.status in ('active','depleted');

  return jsonb_build_object(
    'ok',true,'document_id',p_document_id,'items_touched',v_items,
    'active_lots',v_active,'verified_by',p_user_id,'local_product_stock_mutated',false
  );
end;
$$;
revoke all on function public.activate_purchase_xml_inventory_lots_v1(uuid,uuid) from public, anon, authenticated;

create or replace function public.purchase_xml_activate_inventory_lots_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_table_name='purchase_stock_receipt_plans_v1' then
    if new.status='verified' and (tg_op='INSERT' or old.status is distinct from new.status) then
      perform public.activate_purchase_xml_inventory_lots_v1(new.document_id,new.verified_by);
    end if;
  elsif tg_table_name='purchase_stock_receipts' then
    if new.status='applied' and (tg_op='INSERT' or old.status is distinct from new.status) then
      perform public.activate_purchase_xml_inventory_lots_v1(new.document_id,new.confirmed_by);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.purchase_xml_activate_inventory_lots_trigger_v1() from public, anon, authenticated;

drop trigger if exists purchase_receipt_plan_activate_inventory_lots_v1 on public.purchase_stock_receipt_plans_v1;
create trigger purchase_receipt_plan_activate_inventory_lots_v1
after insert or update on public.purchase_stock_receipt_plans_v1
for each row execute function public.purchase_xml_activate_inventory_lots_trigger_v1();

drop trigger if exists purchase_receipt_activate_inventory_lots_v1 on public.purchase_stock_receipts;
create trigger purchase_receipt_activate_inventory_lots_v1
after insert or update on public.purchase_stock_receipts
for each row execute function public.purchase_xml_activate_inventory_lots_trigger_v1();

create or replace function public.get_purchase_xml_receipt_preflight_v1(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
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
  if not found then return jsonb_build_object('ok',false,'ready',false,'error','document_not_found'); end if;

  select coalesce(metadata->>'ops2_stock_authority','legacy_shadow'),
         nullif(metadata->>'selected_deposit_id','')::bigint
    into v_authority,v_deposit from public.bling_hub_runtime_v2 where id=1;

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
           where l.entity_type='product' and l.status='matched'
             and l.source_id=purchase_xml_items.product_id::text
         ))
    into v_total,v_ready,v_review,v_unlinked
    from public.purchase_xml_items where document_id=p_document_id;

  select count(*),count(*) filter(where e.status='review_required')
    into v_lot_rows,v_lot_review
    from public.purchase_xml_item_lot_evidence e
    join public.purchase_xml_items i on i.id=e.purchase_item_id
   where i.document_id=p_document_id;

  v_cpf:=d.recipient_kind='CPF';
  return jsonb_build_object(
    'ok',true,'document_id',d.id,'document_key',d.document_key,
    'processing_status',d.processing_status,'receipt_status',d.receipt_status,
    'recipient_kind',d.recipient_kind,'financial_eligible',d.financial_eligible,
    'finance_status',d.finance_status,
    'cpf_finance_blocked',v_cpf and d.financial_eligible=false and d.finance_status='blocked_personal',
    'stock_authority',v_authority,'deposit_id',v_deposit,
    'item_count',v_total,'ready_item_count',v_ready,'review_item_count',v_review,
    'unlinked_bling_products',v_unlinked,'lot_evidence_rows',v_lot_rows,
    'lot_evidence_review_rows',v_lot_review,'expiration_required',false,
    'local_stock_write_allowed',v_authority<>'bling','external_bling_receipt_required',v_authority='bling',
    'ready',d.processing_status='processed' and v_total>0 and v_review=0 and v_unlinked=0
      and (v_authority<>'bling' or v_deposit is not null),
    'blocking_reasons',to_jsonb(array_remove(array[
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

create or replace function public.prepare_purchase_stock_receipt_plan_v1(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
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
    'product_id',q.product_id,'bling_product_id',q.bling_product_id,'quantity',q.quantity,
    'base_unit',q.base_unit,'purchase_item_ids',q.purchase_item_ids
  ) order by q.product_id),'[]'::jsonb)
  into v_expected
  from (
    select i.product_id,max(coalesce(l.bling_id,i.bling_product_id)) as bling_product_id,
      sum(i.converted_quantity)::numeric(18,6) as quantity,min(i.base_unit) as base_unit,
      jsonb_agg(i.id order by i.item_number) as purchase_item_ids
    from public.purchase_xml_items i
    left join lateral (
      select bling_id from public.bling_hub_entity_links_v2 x
      where x.entity_type='product' and x.status='matched' and x.source_id=i.product_id::text
      order by x.last_verified_at desc nulls last limit 1
    ) l on true
    where i.document_id=p_document_id group by i.product_id
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',x.product_id,'bling_product_id',x.bling_product_id,
    'physical',x.sellable_physical,'virtual',x.sellable_virtual,'observed_at',x.mirror_observed_at
  ) order by x.product_id),'[]'::jsonb)
  into v_baseline from public.ops2_sellable_stock_v1 x
  where x.product_id in (select product_id from public.purchase_xml_items where document_id=p_document_id and product_id is not null);

  select jsonb_build_object(
    'rows',count(*),
    'ready',count(*) filter(where e.status in ('observed','ready','materialized')),
    'review_required',count(*) filter(where e.status='review_required'),
    'without_expiration',count(*) filter(where e.expiration_date is null),
    'expiration_required',false
  ) into v_lot_summary
  from public.purchase_xml_item_lot_evidence e
  join public.purchase_xml_items i on i.id=e.purchase_item_id
  where i.document_id=p_document_id;

  insert into public.purchase_stock_receipt_plans_v1(
    document_id,status,stock_authority,deposit_id,expected_items,baseline_snapshot,
    lot_evidence_summary,idempotency_key,updated_at
  ) values(
    p_document_id,case when v_authority='bling' then 'awaiting_bling_receipt' else 'preview' end,
    v_authority,v_deposit,v_expected,v_baseline,coalesce(v_lot_summary,'{}'::jsonb),
    'purchase-receipt-plan:'||p_document_id::text,now()
  )
  on conflict(document_id) do update set
    expected_items=case when purchase_stock_receipt_plans_v1.status='verified' then purchase_stock_receipt_plans_v1.expected_items else excluded.expected_items end,
    baseline_snapshot=case when purchase_stock_receipt_plans_v1.status='verified' then purchase_stock_receipt_plans_v1.baseline_snapshot else excluded.baseline_snapshot end,
    lot_evidence_summary=excluded.lot_evidence_summary,deposit_id=excluded.deposit_id,
    stock_authority=excluded.stock_authority,
    updated_at=case when purchase_stock_receipt_plans_v1.status='verified' then purchase_stock_receipt_plans_v1.updated_at else now() end
  returning * into v_plan;

  return jsonb_build_object(
    'ok',true,'plan_id',v_plan.id,'document_id',v_plan.document_id,'status',v_plan.status,
    'stock_authority',v_plan.stock_authority,'deposit_id',v_plan.deposit_id,
    'expected_items',v_plan.expected_items,'baseline_snapshot',v_plan.baseline_snapshot,
    'lot_evidence_summary',v_plan.lot_evidence_summary,'expiration_required',false,'external_write',false
  );
end;
$$;