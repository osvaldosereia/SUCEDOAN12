DO $test$
DECLARE
  v_fixture_count integer;
  v_mismatch_count integer;
BEGIN
  SELECT count(*) INTO v_fixture_count
  FROM public.products p
  JOIN public.ops2_loose_sellable_stock_v1 s ON s.product_id=p.id
  JOIN public.storefront_ean_sellable_stock_v1 e ON e.product_id=p.id
  WHERE p.is_active=true
    AND s.stock_authority='bling'
    AND s.bling_stock_ready=true
    AND e.ean_sellable_stock=0
    AND s.loose_sellable_stock>0;

  IF v_fixture_count=0 THEN
    RAISE EXCEPTION 'basket_stock_authority_regression_fixture_missing';
  END IF;

  SELECT count(*) INTO v_mismatch_count
  FROM public.products p
  JOIN public.ops2_loose_sellable_stock_v1 s ON s.product_id=p.id
  JOIN public.storefront_ean_sellable_stock_v1 e ON e.product_id=p.id
  WHERE p.is_active=true
    AND s.stock_authority='bling'
    AND s.bling_stock_ready=true
    AND e.ean_sellable_stock=0
    AND s.loose_sellable_stock>0
    AND public.basket_component_fresh_sellable_stock_v1(p.id)<>s.loose_sellable_stock;

  IF v_mismatch_count>0 THEN
    RAISE EXCEPTION 'basket_stock_authority_mismatch: % products still prefer the EAN count', v_mismatch_count;
  END IF;
END;
$test$;
