-- Remove the remaining Bling-stock checks from admin reporting and local
-- inventory workflows. Bling order/fiscal integration remains separate.

-- The basket configuration API must show the Supabase product balance and its
-- local basket commitments, never a stock mirror.
do $migration$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  v_def:=pg_get_functiondef('public.admin_basket_configuration_v1()'::regprocedure);
  v_old:=$old$'stock',case
              when s.stock_authority='bling' and s.bling_stock_ready is true
                then coalesce(s.sellable_physical,s.effective_sellable_stock,0)
              else coalesce(p.stock,0)
            end,$old$;
  v_new:=$new$'stock',coalesce(p.stock,0),$new$;
  if position(v_old in v_def)=0 then raise exception 'admin_basket_configuration stock field changed'; end if;
  v_def:=replace(v_def,v_old,v_new);
  v_old:=$old$'physical_stock',case
              when s.stock_authority='bling' and s.bling_stock_ready is true
                then coalesce(s.sellable_physical,s.effective_sellable_stock,0)
              else null
            end,$old$;
  v_new:=$new$'physical_stock',coalesce(p.stock,0),$new$;
  if position(v_old in v_def)=0 then raise exception 'admin_basket_configuration physical field changed'; end if;
  v_def:=replace(v_def,v_old,v_new);
  v_old:=$old$'loose_sellable_stock',case
              when s.stock_authority='bling' and s.bling_stock_ready is true
                then coalesce(s.loose_sellable_stock,0)
              else null
            end,$old$;
  v_new:=$new$'loose_sellable_stock',coalesce(s.loose_sellable_stock,0),$new$;
  if position(v_old in v_def)=0 then raise exception 'admin_basket_configuration loose field changed'; end if;
  v_def:=replace(v_def,v_old,v_new);
  v_old:=$old$'basket_locked_quantity',case
              when s.stock_authority='bling' and s.bling_stock_ready is true
                then coalesce(s.basket_locked_quantity,0)
              else null
            end,$old$;
  v_new:=$new$'basket_locked_quantity',coalesce(s.basket_locked_quantity,0),$new$;
  if position(v_old in v_def)=0 then raise exception 'admin_basket_configuration basket lock field changed'; end if;
  v_def:=replace(v_def,v_old,v_new);
  v_def:=replace(v_def,'''stock_authority'',s.stock_authority,','''stock_authority'',''supabase'',''stock_source'',''supabase.products.stock'',');
  execute v_def;
end;
$migration$;

create or replace function public.get_ops2_sellable_stock_status_v1()
returns jsonb
language sql
stable security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'active_products',count(*) filter(where is_active),
    'active_stock_positive',count(*) filter(where is_active and effective_sellable_stock>0),
    'active_stock_zero',count(*) filter(where is_active and effective_sellable_stock<=0),
    'catalog_stock_total',coalesce(sum(legacy_stock),0),
    'sellable_stock_total',coalesce(sum(effective_sellable_stock),0),
    'stock_authority','supabase',
    'stock_source','supabase.products.stock',
    'stock_cutover_at',max(stock_cutover_at),
    'last_stock_change_at',(select max(updated_at) from public.products)
  )
  from public.ops2_sellable_stock_v1;
$function$;

create or replace function public.get_ops2_sellable_stock_v1(p_product_id uuid)
returns jsonb
language sql
stable security definer
set search_path = ''
as $function$
  select coalesce((
    select jsonb_build_object(
      'product_id',p.id,'is_active',p.is_active,'stock_authority','supabase',
      'stock_cutover_at',nullif(rt.metadata->>'ops2_supabase_stock_authority_at','')::timestamptz,
      'stock',coalesce(p.stock,0),'catalog_stock',coalesce(p.stock,0),
      'legacy_stock',coalesce(p.stock,0),'effective_sellable_stock',coalesce(p.stock,0),
      'basket_locked_quantity',coalesce(s.basket_locked_quantity,0),
      'sellable_stock',coalesce(s.loose_sellable_stock,0),
      'stock_source','supabase.products.stock','stock_source_reason','supabase_products_stock'
    )
    from public.products p
    left join public.ops2_loose_sellable_stock_v1 s on s.product_id=p.id
    cross join public.bling_hub_runtime_v2 rt
    where p.id=p_product_id and rt.id=1
  ),jsonb_build_object('product_id',p_product_id,'error','product_not_found'));
$function$;

create or replace function public.ops2_set_lot_tracking_complete_v1(
  p_product_id uuid,
  p_complete boolean,
  p_operator text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_product public.products%rowtype;
  v_count integer;
  v_unquantified integer;
  v_tracked numeric(14,3);
  v_catalog_stock numeric(14,3);
begin
  select * into v_product from public.products where id=p_product_id for update;
  if not found then raise exception 'product_not_found'; end if;
  v_catalog_stock:=round(coalesce(v_product.stock,0),3);
  select count(*) filter(where status<>'cancelled'),
         count(*) filter(where status<>'cancelled' and quantity_on_hand is null),
         coalesce(sum(coalesce(quantity_on_hand,0)) filter(where status<>'cancelled' and source<>'bling'),0)
    into v_count,v_unquantified,v_tracked
    from public.product_inventory_lots
   where product_id=p_product_id and source<>'bling';
  if p_complete then
    if v_count=0 then raise exception 'lot_tracking_requires_lot'; end if;
    if v_unquantified>0 then raise exception 'lot_tracking_has_unquantified_lot'; end if;
    if abs(coalesce(v_tracked,0)-coalesce(v_catalog_stock,0))>0.001 then
      raise exception 'lot_tracking_catalog_stock_mismatch tracked=% supabase=%',v_tracked,v_catalog_stock;
    end if;
  end if;
  update public.products
     set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
       'lot_tracking_complete',coalesce(p_complete,false),
       'lot_tracking_updated_at',now(),
       'lot_tracking_updated_by',nullif(trim(coalesce(p_operator,'')),''),
       'lot_tracking_catalog_qty',v_tracked,
       'lot_tracking_stock_source','supabase.products.stock'
     ),updated_at=now()
   where id=p_product_id;
  return jsonb_build_object('ok',true,'product_id',p_product_id,'lot_tracking_complete',coalesce(p_complete,false),
    'lots',v_count,'unquantified_lots',v_unquantified,'tracked_quantity',v_tracked,
    'catalog_stock',v_catalog_stock,'stock_source','supabase.products.stock');
end;
$function$;

create or replace function public.ops_apply_stock_recount_result_v1(
  p_product_id uuid,
  p_count_id uuid,
  p_counted_quantity numeric,
  p_operator_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_attention public.ops_attention%rowtype;
  v_catalog_stock numeric;
  v_match boolean;
  v_now timestamptz:=now();
  v_review uuid;
begin
  select * into v_attention from public.ops_attention
   where entity_type='product' and entity_id=p_product_id::text
     and status in ('open','acknowledged')
     and idempotency_key='ops2:stock-recount:'||p_product_id::text
   for update;
  if not found then return jsonb_build_object('tracked',false); end if;
  select round(coalesce(stock,0),3) into v_catalog_stock from public.products where id=p_product_id for update;
  if not found then return jsonb_build_object('tracked',true,'error','product_not_found','stock_source','supabase.products.stock'); end if;
  v_match:=abs(round(coalesce(p_counted_quantity,0),3)-v_catalog_stock)<=0.0001;
  if not v_match then
    insert into public.ops_stock_reconciliation_reviews(attention_id,product_id,count_id,counted_quantity,bling_physical_snapshot,difference_to_bling,operator_label)
    values(v_attention.id,p_product_id,p_count_id,round(p_counted_quantity,3),v_catalog_stock,
      round(p_counted_quantity-v_catalog_stock,3),left(nullif(trim(coalesce(p_operator_label,'')),''),80))
    on conflict(attention_id,count_id) do update set counted_quantity=excluded.counted_quantity,
      bling_physical_snapshot=excluded.bling_physical_snapshot,difference_to_bling=excluded.difference_to_bling,
      operator_label=excluded.operator_label,updated_at=now()
    returning id into v_review;
  end if;
  update public.ops_attention
     set evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object(
       'latest_count_id',p_count_id,'latest_counted_quantity',round(p_counted_quantity,3),
       'latest_counted_at',v_now,'latest_operator',left(nullif(trim(coalesce(p_operator_label,'')),''),80),
       'current_supabase_stock',v_catalog_stock,'matches_supabase_stock',v_match,
       'stock_source','supabase.products.stock','reconciliation_review_id',v_review,'automatic_stock_write',false),
       status=case when v_match then 'resolved' else 'open' end,
       resolved_at=case when v_match then v_now else null end,
       resolution=case when v_match then 'Recontagem coincide com o saldo cadastrado no Supabase.' else null end,
       resolution_ref=case when v_match then 'inventory-count:'||p_count_id::text else null end,
       recommended_action=case when v_match then recommended_action else 'Confirme a contagem e classifique a diferença antes de regularizar o saldo local.' end,
       updated_at=v_now
   where id=v_attention.id;
  return jsonb_build_object('tracked',true,'matches_supabase_stock',v_match,
    'supabase_stock',v_catalog_stock,'counted_quantity',round(p_counted_quantity,3),
    'attention_status',case when v_match then 'resolved' else 'open' end,
    'review_id',v_review,'classification_required',not v_match,'automatic_stock_write',false,
    'stock_source','supabase.products.stock');
end;
$function$;

create or replace function public.get_ops2_stock_cutover_preflight_v1()
returns jsonb
language sql
stable security definer
set search_path = 'public'
as $function$
with inventory as (
  select count(*) filter(where is_active) as active_products,
         count(*) filter(where is_active and coalesce(stock,0)>0) as active_stock_positive,
         count(*) filter(where is_active and coalesce(stock,0)<=0) as active_stock_zero,
         coalesce(sum(greatest(0,coalesce(stock,0))),0) as catalog_stock_total
  from public.products
), reservations as (
  select count(distinct r.order_id) as orders,count(*) as rows
  from public.vitrine_stock_reservations r join public.orders o on o.id=r.order_id
  where o.status not in ('cancelled','delivered','returned')
    and public.supabase_stock_pending_reservations_v1(r.product_id,null::uuid)>0
), manual as (
  select count(distinct p.id) as products
  from public.products p
  where p.is_active=true and coalesce(p.stock,0)<=0
    and (exists(select 1 from public.basket_admin_product_options o where o.product_id=p.id)
      or exists(select 1 from public.basket_mold_position_options o where o.product_id=p.id))
)
select jsonb_build_object(
  'phase','supabase_stock_authority_fixed','authority','supabase',
  'stock_source','supabase.products.stock','stock_authority_fixed',true,
  'active_products',inventory.active_products,'active_stock_positive',inventory.active_stock_positive,
  'active_stock_zero',inventory.active_stock_zero,'catalog_stock_total',inventory.catalog_stock_total,
  'pending_local_reservation_orders',reservations.orders,'pending_local_reservation_rows',reservations.rows,
  'products_for_manual_basket_review',manual.products,'ready',true,'blocking_reasons','[]'::jsonb
)
from inventory,reservations,manual
$function$;

create or replace function public.ops2_check_stock_cutover_canary_v1(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_run public.ops2_stock_cutover_runs%rowtype;
  v_authority text;
  v_bad integer;
  v_result jsonb;
begin
  select * into v_run from public.ops2_stock_cutover_runs where id=p_run_id for update;
  if not found then raise exception 'cutover_run_not_found'; end if;
  select coalesce(metadata->>'ops2_stock_authority','legacy_shadow') into v_authority
    from public.bling_hub_runtime_v2 where id=1;
  select count(*) into v_bad from public.ops2_sellable_stock_v1
    where stock_authority<>'supabase' or effective_sellable_stock<0;
  v_result:=jsonb_build_object('authority',v_authority,'stock_source','supabase.products.stock',
    'invalid_stock_rows',v_bad,'healthy',v_authority='supabase' and v_bad=0);
  update public.ops2_stock_cutover_runs set checked_at=now(),check_result=v_result,
    status=case when coalesce((v_result->>'healthy')::boolean,false) then 'passed' else status end,updated_at=now()
  where id=p_run_id;
  return v_result;
end;
$function$;

create or replace function public.get_purchase_xml_receipt_preflight_v1(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  d public.purchase_xml_documents%rowtype;
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
  select count(*),
    count(*) filter(where product_id is not null and conversion_status<>'review_required'
      and processing_status not in ('review_required','failed','pending') and coalesce(converted_quantity,0)>0
      and coalesce(base_unit_cost,0)>=0),
    count(*) filter(where product_id is null or conversion_status='review_required'
      or processing_status in ('review_required','failed','pending') or coalesce(converted_quantity,0)<=0),
    count(*) filter(where product_id is not null and not exists(
      select 1 from public.bling_hub_entity_links_v2 l where l.entity_type='product' and l.status='matched'
        and l.source_id=purchase_xml_items.product_id::text))
  into v_total,v_ready,v_review,v_unlinked
  from public.purchase_xml_items where document_id=p_document_id and stock_update_requested is true;
  select count(*),count(*) filter(where e.status='review_required') into v_lot_rows,v_lot_review
  from public.purchase_xml_item_lot_evidence e join public.purchase_xml_items i on i.id=e.purchase_item_id
  where i.document_id=p_document_id and i.stock_update_requested is true;
  v_cpf:=d.recipient_kind='CPF';
  return jsonb_build_object(
    'ok',true,'document_id',d.id,'document_key',d.document_key,'processing_status',d.processing_status,
    'receipt_status',d.receipt_status,'recipient_kind',d.recipient_kind,'financial_eligible',d.financial_eligible,
    'finance_status',d.finance_status,'cpf_finance_blocked',v_cpf and d.financial_eligible=false and d.finance_status='blocked_personal',
    'stock_authority','supabase','stock_source','supabase.products.stock','deposit_id',null,
    'item_count',v_total,'ready_item_count',v_ready,'review_item_count',v_review,
    'products_without_bling_link',v_unlinked,'lot_evidence_rows',v_lot_rows,
    'lot_evidence_review_rows',v_lot_review,'expiration_required',false,
    'local_stock_write_allowed',true,'external_bling_receipt_required',false,
    'ready',d.processing_status='processed' and v_total>0 and v_review=0 and v_lot_review=0,
    'blocking_reasons',to_jsonb(array_remove(array[
      case when d.processing_status<>'processed' then 'document_not_processed' end,
      case when v_total=0 then 'no_stock_items_selected' end,
      case when v_review>0 then 'items_require_conversion_or_product_match_review' end,
      case when v_lot_review>0 then 'lot_evidence_requires_review' end
    ],null))
  );
end;
$function$;

-- Receipt plans compare local catalog stock only. The separate apply RPC writes
-- the receipt quantity to products.stock and remains idempotent by document.
do $migration$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  v_def:=pg_get_functiondef('public.prepare_purchase_stock_receipt_plan_v1(uuid)'::regprocedure);
  v_old:=$old$v_authority:=p->>'stock_authority';
  v_deposit:=nullif(p->>'deposit_id','')::bigint;$old$;
  v_new:=$new$v_authority:='supabase';
  v_deposit:=null;$new$;
  if position(v_old in v_def)=0 then raise exception 'purchase receipt authority assignment changed'; end if;
  v_def:=replace(v_def,v_old,v_new);
  v_old:=$old$select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',x.product_id,'bling_product_id',x.bling_product_id,
    'physical',x.sellable_physical,'virtual',x.sellable_virtual,'observed_at',x.mirror_observed_at
  ) order by x.product_id),'[]'::jsonb)
  into v_baseline from public.ops2_sellable_stock_v1 x
  where x.product_id in (select product_id from public.purchase_xml_items where document_id=p_document_id and product_id is not null and stock_update_requested is true);$old$;
  v_new:=$new$select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',p.id,'catalog_stock',coalesce(p.stock,0),
    'basket_locked_quantity',coalesce(s.basket_locked_quantity,0),
    'sellable_stock',coalesce(s.loose_sellable_stock,0),'observed_at',p.updated_at
  ) order by p.id),'[]'::jsonb)
  into v_baseline from public.products p
  left join public.ops2_loose_sellable_stock_v1 s on s.product_id=p.id
  where p.id in (select product_id from public.purchase_xml_items where document_id=p_document_id and product_id is not null and stock_update_requested is true);$new$;
  if position(v_old in v_def)=0 then raise exception 'purchase receipt baseline block changed'; end if;
  v_def:=replace(v_def,v_old,v_new);
  v_def:=replace(v_def,'case when v_authority=''bling'' then ''awaiting_bling_receipt'' else ''preview'' end','''preview''');
  execute v_def;
end;
$migration$;

create or replace function public.verify_purchase_stock_receipt_plan_v1(
  p_document_id uuid,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_plan public.purchase_stock_receipt_plans_v1%rowtype;
  v_receipt public.purchase_stock_receipts%rowtype;
  v_snapshot jsonb;
  v_now timestamptz:=now();
begin
  select * into v_plan from public.purchase_stock_receipt_plans_v1 where document_id=p_document_id for update;
  if not found then raise exception 'purchase_receipt_plan_not_found'; end if;
  if v_plan.status='verified' then
    return jsonb_build_object('ok',true,'verified',true,'idempotent_replay',true,'plan_id',v_plan.id,
      'stock_source','supabase.products.stock');
  end if;
  select * into v_receipt from public.purchase_stock_receipts where document_id=p_document_id for update;
  if not found or v_receipt.status<>'applied' then
    return jsonb_build_object('ok',true,'verified',false,'status','awaiting_local_stock_application',
      'local_stock_applied',false,'stock_source','supabase.products.stock');
  end if;
  v_snapshot:=coalesce(v_receipt.result,'{}'::jsonb)||jsonb_build_object(
    'receipt_id',v_receipt.id,'source','supabase.products.stock','local_stock_applied',true,
    'applied_at',v_receipt.applied_at);
  update public.purchase_stock_receipt_plans_v1
    set verification_snapshot=v_snapshot,status='verified',verified_at=v_now,verified_by=p_user_id,
        review_reason=null,stock_authority='supabase',deposit_id=null,updated_at=v_now
    where id=v_plan.id;
  return jsonb_build_object('ok',true,'verified',true,'plan_id',v_plan.id,
    'verification_snapshot',v_snapshot,'local_stock_applied',true,
    'stock_source','supabase.products.stock','external_write',false);
end;
$function$;

update public.purchase_stock_receipt_plans_v1
set status='preview',stock_authority='supabase',deposit_id=null,
    baseline_snapshot='[]'::jsonb,updated_at=now()
where status='awaiting_bling_receipt';

