DO $$
DECLARE
  d text;
  t text;
  a integer;
  b integer;
BEGIN
  d:=pg_get_functiondef('public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)'::regprocedure);

  d:=replace(
    d,
    $old$if coalesce(v_line->>'type','product') not in ('product','basket','basket_mold') then raise exception 'invalid_item_type'; end if;$old$,
    $new$if coalesce(v_line->>'type','product') not in ('product','basket_mold') then raise exception 'invalid_item_type'; end if;$new$
  );

  a:=strpos(d,$x$    -- Compatibilidade transacional com lotes completos antigos.$x$);
  IF a>0 THEN
    t:=substring(d from a);
    b:=strpos(t,$x$  end loop;

  if v_total<75$x$);
    IF b=0 THEN RAISE EXCEPTION 'legacy basket loop end missing'; END IF;
    d:=substring(d from 1 for a-1)||substring(d from a+b-1);
  END IF;

  a:=strpos(d,$x$  for v_line in select value from jsonb_array_elements(v_alloc_rows) loop$x$);
  IF a>0 THEN
    t:=substring(d from a);
    b:=strpos(t,E'  end loop;\n\n  return jsonb_build_object(');
    IF b=0 THEN RAISE EXCEPTION 'legacy allocation loop end missing'; END IF;
    d:=substring(d from 1 for a-1)||substring(d from a+b-1+length(E'  end loop;\n\n'));
  END IF;

  d:=replace(d,$old$
    begin
      select * into v_basket
      from public.basket_templates
      where id=(v_line->>'id')::uuid and is_active=true;
    exception when others then raise exception 'invalid_basket_id'; end;
    if not found then raise exception 'basket_unavailable'; end if;

$old$,'');

  d:=regexp_replace(
    d,
    E'  v_(alloc_rows|lot_demand|group|group_lot_id|group_kind|group_changed|group_short|food_lot_id|hygiene_lot_id|food_changed|hygiene_changed|food_short|hygiene_short|lot_requested|li|base_qty|min|max|delta|preassembled_units|loose_units|all_split|legacy_lot_id|legacy_lot|supplied) [^\n]*;\n',
    '',
    'g'
  );
  d:=replace(d,E'  -- O formato do lote é decidido por item. Não existe mais chave global legacy/split.\n  v_all_split:=true;\n\n','');
  d:=replace(d,$x$'split_kits',true,'separation_plan',v_sep_rows,$x$,$x$'separation_plan',v_sep_rows,$x$);

  IF position('basket_stock_lot' in d)>0
     OR position('split_kits' in d)>0
     OR position('v_legacy_lot' in d)>0
     OR position('basket_unavailable' in d)>0
     OR position('not in (''product'',''basket'',''basket_mold'')' in d)>0
     OR position('not in (''product'',''basket_mold'')' in d)=0
  THEN
    RAISE EXCEPTION 'legacy basket checkout path remains';
  END IF;

  EXECUTE d;
END $$;

-- Current product stock comes from products/ERP and real order reservations.
-- Old assembled-basket lot allocations are historical and must not reduce sellable stock.
CREATE OR REPLACE VIEW public.ops2_loose_sellable_stock_v1 AS
 SELECT s.product_id,
    s.name,
    s.sku,
    s.gtin,
    s.is_active,
    s.legacy_stock,
    s.bling_product_id,
    s.link_status,
    s.bling_physical_total,
    s.bling_virtual_total,
    s.selected_deposit_id,
    s.sellable_physical,
    s.sellable_virtual,
    s.mirror_observed_at,
    s.source_event_id,
    s.source_resource,
    s.stock_authority,
    s.stock_cutover_at,
    s.bling_stock_ready,
    s.effective_sellable_stock,
    s.stock_source_reason,
    0::numeric AS basket_locked_quantity,
    GREATEST((0)::numeric, COALESCE(s.effective_sellable_stock, (0)::numeric)) AS loose_sellable_stock
   FROM public.ops2_sellable_stock_v1 s;

-- Product and basket stock views now reserve only real open orders.
CREATE OR REPLACE VIEW public.storefront_product_sellable_stock_v1 AS
 SELECT p.id AS product_id,
    COALESCE(p.stock, (0)::numeric) AS catalog_stock,
    (0)::numeric AS basket_locked_quantity,
    reservations.pending_order_quantity,
    GREATEST((0)::numeric, COALESCE(p.stock, (0)::numeric) - reservations.pending_order_quantity) AS sellable_stock,
    p.is_active,
    p.is_whatsapp_active,
    COALESCE(p.price, (0)::numeric) AS price,
    p.validity_date
   FROM public.products p
   CROSS JOIN LATERAL (
     SELECT COALESCE(public.supabase_stock_pending_reservations_v1(p.id, NULL::uuid), (0)::numeric) AS pending_order_quantity
   ) reservations;

-- Retain the legacy view name for compatibility, but no longer lock stock for old basket lots.
CREATE OR REPLACE VIEW public.basket_locked_component_stock_v1 AS
 SELECT product.id AS product_id,
    0::numeric AS basket_locked_quantity
   FROM public.products product
  WHERE false;

REVOKE EXECUTE ON FUNCTION public.activate_basket_kit_lot_draft_v1(uuid,text) FROM authenticated;
