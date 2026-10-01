-- Regression contract for complete basket suggestion editing.
-- Safe to run inside a transaction; approval is rolled back.
begin;

select set_config('request.jwt.claim.sub',(
  select user_id::text from public.admin_users where is_active=true order by created_at limit 1
),true);

DO $$
declare
  s record;
  items jsonb;
  original_lot_count bigint;
  save_result jsonb;
  approve_result jsonb;
  lot_id uuid;
  test_price numeric;
begin
  if to_regprocedure('public.basket_lot_suggestion_save_v2(uuid,integer,numeric,jsonb,text)') is null then
    raise exception 'missing basket_lot_suggestion_save_v2';
  end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='basket_stock_lots' and column_name='sale_price_override') then
    raise exception 'missing basket_stock_lots.sale_price_override';
  end if;

  select * into s
  from public.basket_lot_suggestions
  where status='pending' and buildability_status='ready'
  order by suggestion_date desc,created_at
  limit 1;
  if not found then raise exception 'no ready pending suggestion available for regression'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,
    'suggested_product_id',i.suggested_product_id,
    'quantity_per_basket',i.quantity_per_basket,
    'position_order',i.position_order
  ) order by i.position_order,i.id),'[]'::jsonb)
  into items
  from public.basket_lot_suggestion_items i
  where i.suggestion_id=s.id;

  test_price:=round(s.sale_price+1.23,2);
  select count(*) into original_lot_count from public.basket_stock_lots;

  save_result:=public.basket_lot_suggestion_save_v2(s.id,s.quantity_planned,test_price,items,'regression');
  if save_result->>'ok' <> 'true' then raise exception 'save_v2 failed'; end if;
  if (select sale_price from public.basket_lot_suggestions where id=s.id) <> test_price then raise exception 'sale price was not saved'; end if;
  if (select hidden_adjustment from public.basket_lot_suggestions where id=s.id) <> round(test_price-(select component_sum from public.basket_lot_suggestions where id=s.id),2) then raise exception 'hidden adjustment mismatch'; end if;

  approve_result:=public.basket_lot_suggestion_approve_v1(s.id,'regression');
  lot_id:=nullif(approve_result#>>'{lot,lot_id}','')::uuid;
  if lot_id is null then raise exception 'approval did not create lot'; end if;
  if (select sale_price_override from public.basket_stock_lots where id=lot_id) <> test_price then raise exception 'lot sale price override mismatch'; end if;
  if (select sale_enabled from public.basket_stock_lots where id=lot_id) <> false then raise exception 'approved suggestion must stay disabled for sale'; end if;
  if (select count(*) from public.basket_stock_lots) <> original_lot_count+1 then raise exception 'unexpected lot count after approval'; end if;
end $$;

rollback;
select 'BASKET_SUGGESTION_EDITOR_V2_OK' as result;
