-- Regression test: exercise the real checkout RPC and roll back all order/stock writes.
-- Uses an existing complete customer internally; returns no personal data and commits no order.

do $test$
declare
 c record; a record; b record; result jsonb; test_error text; test_constraint text; stock_before integer; test_success boolean:=false;
begin
 select x.* into c from public.customers x where x.is_active is distinct from false and nullif(x.name,'') is not null and nullif(x.cpf_cnpj,'') is not null and nullif(x.primary_whatsapp_e164,'') is not null and exists(select 1 from public.customer_addresses y where y.customer_id=x.id and y.is_active is distinct from false and nullif(y.street,'') is not null and nullif(y.number,'') is not null and nullif(y.neighborhood,'') is not null and nullif(y.city,'') is not null) limit 1;
 select * into a from public.customer_addresses where customer_id=c.id and is_active is distinct from false and nullif(street,'') is not null and nullif(number,'') is not null and nullif(neighborhood,'') is not null and nullif(city,'') is not null limit 1;
 select * into b from public.basket_commercial_catalog_v1 where public_lot_kind='legacy_full' and public_available>0 and sale_price>=75 order by sale_price limit 1;
 if c.id is null or b.public_lot_id is null then raise exception 'test_fixture_unavailable'; end if;
 select quantity_available into stock_before from public.basket_stock_lots where id=b.public_lot_id;
 begin
 result:=public.create_vitrine_cart_order_v3(c.primary_whatsapp_e164,'Cartão de crédito',jsonb_build_array(jsonb_build_object('type','basket','id',b.basket_id,'lot_id',b.public_lot_id,'qty',1)),jsonb_build_object('id',c.id,'display_name',c.name,'address',jsonb_build_object('street',a.street,'number',a.number,'district',a.neighborhood,'city',a.city)),jsonb_build_object('date',(current_timestamp at time zone 'America/Cuiaba')::date::text,'label','Teste transacional'));
 if not exists(select 1 from public.basket_stock_allocations where order_id=(result->>'order_id')::uuid and lot_id=b.public_lot_id and allocation_role='legacy_full' and quantity=1 and status='allocated') then raise exception 'allocation_assertion_failed'; end if;
 if (select quantity_available from public.basket_stock_lots where id=b.public_lot_id)<>stock_before-1 then raise exception 'stock_assertion_failed'; end if;
 if not exists(select 1 from public.order_items where order_id=(result->>'order_id')::uuid) then raise exception 'order_items_assertion_failed'; end if;
 test_success:=true;
 raise exception using errcode='PZ001',message='rollback_checkout_test';
 exception when sqlstate 'PZ001' then null;
 when others then get stacked diagnostics test_error=message_text,test_constraint=constraint_name;
 end;
 if not test_success then raise exception 'checkout_still_fails: %',test_error; end if;
 if exists(select 1 from public.orders where id=(result->>'order_id')::uuid) then raise exception 'test_order_not_rolled_back'; end if;
 if (select quantity_available from public.basket_stock_lots where id=b.public_lot_id)<>stock_before then raise exception 'test_stock_not_rolled_back'; end if;
 perform set_config('codex.checkout_test',jsonb_build_object('checkout_passed',test_success,'allocation_role','legacy_full','order_items_created',true,'stock_reserved',true,'rolled_back',true,'total_cents',result->'total_cents')::text,false);
end $test$;
select current_setting('codex.checkout_test')::jsonb as result;

