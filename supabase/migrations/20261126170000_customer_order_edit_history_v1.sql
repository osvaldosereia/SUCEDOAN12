-- Customer self-service order editing and read-only order history.
-- Capability tokens stay valid for history and edits; expires_at continues to gate confirmation only.
ALTER TABLE private.order_customer_actions_v1
  DROP CONSTRAINT IF EXISTS order_customer_actions_v1_pkey;
ALTER TABLE private.order_customer_actions_v1
  ADD CONSTRAINT order_customer_actions_v1_pkey PRIMARY KEY (order_id,token_hash);
CREATE INDEX IF NOT EXISTS order_customer_actions_order_v1
  ON private.order_customer_actions_v1(order_id,issued_at DESC);

CREATE OR REPLACE FUNCTION public.ops3_issue_customer_order_action_v1(p_order_id uuid, p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  IF p_token_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_token_hash');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error','order_not_found');
  END IF;

  IF v_order.source NOT IN ('vitrine','storefront_v2')
     OR v_order.status<>'storefront_received'
     OR v_order.confirmed_at IS NOT NULL
     OR v_order.cancelled_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'error','order_not_eligible');
  END IF;

  IF EXISTS (SELECT 1 FROM private.order_customer_actions_v1 WHERE token_hash=p_token_hash AND order_id<>v_order.id) THEN
    RETURN jsonb_build_object('ok',false,'error','token_already_assigned');
  END IF;

  INSERT INTO private.order_customer_actions_v1(order_id,token_hash,expires_at)
  VALUES(v_order.id,p_token_hash,now()+interval '7 days')
  ON CONFLICT(token_hash) DO UPDATE
    SET issued_at=now(),
        expires_at=EXCLUDED.expires_at,
        confirmed_at=NULL,
        confirmed_total=NULL;

  RETURN jsonb_build_object('ok',true,'order_id',v_order.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.ops3_customer_order_session_v1(p_token_hash text, p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_action private.order_customer_actions_v1%ROWTYPE;
  v_owner public.orders%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_public public.order_public_snapshots_v1%ROWTYPE;
  v_can_edit boolean := false;
  v_reason text := 'order_status_closed';
BEGIN
  IF p_token_hash !~ '^[a-f0-9]{64}$' OR p_order_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_request');
  END IF;

  SELECT * INTO v_action
  FROM private.order_customer_actions_v1
  WHERE token_hash=p_token_hash;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error','not_found');
  END IF;

  SELECT * INTO v_owner FROM public.orders WHERE id=v_action.order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error','not_found');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error','not_found');
  END IF;

  IF p_order_id IS DISTINCT FROM v_action.order_id
     AND (v_owner.customer_id IS NULL OR v_order.customer_id IS DISTINCT FROM v_owner.customer_id) THEN
    RETURN jsonb_build_object('ok',false,'error','access_denied');
  END IF;

  SELECT * INTO v_public
  FROM public.order_public_snapshots_v1
  WHERE order_id=v_order.id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error','snapshot_missing');
  END IF;

  v_can_edit :=
    v_order.source IN ('vitrine','storefront_v2')
    AND v_order.status IN ('storefront_received','received','confirmed')
    AND v_order.cancelled_at IS NULL
    AND v_order.bling_order_id IS NULL
    AND v_order.bling_synced_at IS NULL
    AND COALESCE(v_order.sync_status,'local')='local'
    AND NOT EXISTS (SELECT 1 FROM public.order_separation_assignments_v1 x WHERE x.order_id=v_order.id)
    AND NOT EXISTS (SELECT 1 FROM public.order_separation_items_v1 x WHERE x.order_id=v_order.id)
    AND NOT EXISTS (SELECT 1 FROM public.order_separation_completions_v1 x WHERE x.order_id=v_order.id);

  IF v_can_edit THEN
    v_reason := NULL;
  ELSIF v_order.status IN ('processing','separating','ready','ready_for_delivery','out_for_delivery','delivered')
     OR EXISTS (SELECT 1 FROM public.order_separation_assignments_v1 x WHERE x.order_id=v_order.id)
     OR EXISTS (SELECT 1 FROM public.order_separation_items_v1 x WHERE x.order_id=v_order.id)
     OR EXISTS (SELECT 1 FROM public.order_separation_completions_v1 x WHERE x.order_id=v_order.id) THEN
    v_reason := 'separation_started';
  ELSIF v_order.cancelled_at IS NOT NULL OR v_order.status='cancelled' THEN
    v_reason := 'order_cancelled';
  ELSIF v_order.bling_order_id IS NOT NULL OR v_order.bling_synced_at IS NOT NULL OR COALESCE(v_order.sync_status,'local')<>'local' THEN
    v_reason := 'bling_sync_started';
  END IF;

  RETURN jsonb_build_object(
    'ok',true,
    'order_id',v_order.id,
    'public_token',v_public.public_token,
    'public_code',v_public.public_code,
    'status',v_order.status,
    'total',COALESCE(NULLIF(v_public.snapshot->>'final_total','')::numeric,v_order.total),
    'updated_at',v_order.updated_at,
    'confirmed',v_order.status='confirmed' AND v_order.confirmed_at IS NOT NULL,
    'can_edit',v_can_edit,
    'edit_reason',v_reason,
    'customer_name',COALESCE(NULLIF(v_order.customer_snapshot->>'name',''),NULLIF(v_order.delivery_address->>'customer_name',''),'Cliente'),
    'payment_label',COALESCE(NULLIF(v_order.checkout_snapshot->>'payment_label',''),NULLIF(v_order.payment_method,''),'A confirmar'),
    'delivery',jsonb_strip_nulls(jsonb_build_object(
      'street',v_order.delivery_address->>'street',
      'number',v_order.delivery_address->>'number',
      'complement',v_order.delivery_address->>'complement',
      'district',COALESCE(NULLIF(v_order.delivery_address->>'district',''),NULLIF(v_order.delivery_address->>'neighborhood','')),
      'city',v_order.delivery_address->>'city',
      'state',v_order.delivery_address->>'state',
      'postal_code',v_order.delivery_address->>'postal_code',
      'reference',COALESCE(NULLIF(v_order.delivery_address->>'reference',''),NULLIF(v_order.delivery_address->>'raw_text','')),
      'delivery_date',v_order.delivery_address->>'delivery_date',
      'delivery_label',v_order.delivery_address->>'delivery_label'
    )),
    'edit_cart',CASE WHEN v_can_edit THEN COALESCE(v_order.checkout_snapshot->'cart','[]'::jsonb) ELSE NULL END,
    'items',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'product_id',oi.product_id,
        'name',oi.name_snapshot,
        'unit_price',oi.unit_price,
        'quantity',oi.quantity,
        'kind',COALESCE(NULLIF(oi.metadata->>'history_kind',''),'product'),
        'basket_id',oi.metadata->>'basket_id',
        'position_id',oi.metadata->>'position_id',
        'position_label',oi.metadata->>'position_label',
        'selected_product_id',oi.metadata->>'selected_product_id',
        'selected_quantity',oi.metadata->>'selected_quantity',
        'basket_quantity',oi.metadata->>'basket_quantity',
        'image_url',COALESCE(NULLIF(oi.metadata->>'image_url',''),p.image_url,'')
      ) ORDER BY oi.created_at,oi.id)
      FROM public.order_items oi
      LEFT JOIN public.products p ON p.id=oi.product_id
      WHERE oi.order_id=v_order.id AND oi.quantity>0
    ),'[]'::jsonb),
    'edit_count',COALESCE(NULLIF(v_order.checkout_snapshot#>>'{customer_edit,edit_count}','')::integer,0)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.ops3_customer_order_history_v1(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_action private.order_customer_actions_v1%ROWTYPE;
  v_owner public.orders%ROWTYPE;
  v_orders jsonb;
BEGIN
  IF p_token_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_token');
  END IF;

  SELECT * INTO v_action
  FROM private.order_customer_actions_v1
  WHERE token_hash=p_token_hash;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error','not_found');
  END IF;

  SELECT * INTO v_owner FROM public.orders WHERE id=v_action.order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error','not_found');
  END IF;

  SELECT COALESCE(jsonb_agg(q.item ORDER BY q.created_at DESC),'[]'::jsonb)
  INTO v_orders
  FROM (
    SELECT
      o.created_at,
      jsonb_build_object(
        'order_id',o.id,
        'public_token',s.public_token,
        'public_code',s.public_code,
        'created_at',o.created_at,
        'status',o.status,
        'total',COALESCE(NULLIF(s.snapshot->>'final_total','')::numeric,o.total),
        'can_edit',
          o.source IN ('vitrine','storefront_v2')
          AND o.status IN ('storefront_received','received','confirmed')
          AND o.cancelled_at IS NULL
          AND o.bling_order_id IS NULL
          AND o.bling_synced_at IS NULL
          AND COALESCE(o.sync_status,'local')='local'
          AND NOT EXISTS (SELECT 1 FROM public.order_separation_assignments_v1 x WHERE x.order_id=o.id)
          AND NOT EXISTS (SELECT 1 FROM public.order_separation_items_v1 x WHERE x.order_id=o.id)
          AND NOT EXISTS (SELECT 1 FROM public.order_separation_completions_v1 x WHERE x.order_id=o.id)
      ) AS item
    FROM public.orders o
    JOIN public.order_public_snapshots_v1 s ON s.order_id=o.id
    WHERE o.id=v_owner.id
       OR (v_owner.customer_id IS NOT NULL AND o.customer_id=v_owner.customer_id)
    ORDER BY o.created_at DESC
    LIMIT 100
  ) q;

  RETURN jsonb_build_object('ok',true,'orders',v_orders,'count',jsonb_array_length(v_orders));
END;
$function$;

CREATE OR REPLACE FUNCTION public.ops3_get_customer_order_action_v1(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_action private.order_customer_actions_v1%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_token_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_token');
  END IF;

  SELECT * INTO v_action FROM private.order_customer_actions_v1 WHERE token_hash=p_token_hash;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error','not_found');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id=v_action.order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error','not_found');
  END IF;

  v_result:=public.ops3_customer_order_session_v1(p_token_hash,v_order.id);
  IF COALESCE((v_result->>'ok')::boolean,false) IS NOT TRUE THEN
    RETURN v_result;
  END IF;

  RETURN v_result||jsonb_build_object(
    'can_confirm',v_action.expires_at>now()
      AND v_action.confirmed_at IS NULL
      AND v_order.status='storefront_received'
      AND v_order.confirmed_at IS NULL
      AND v_order.cancelled_at IS NULL,
    'expires_at',v_action.expires_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.ops3_update_customer_order_v1(p_token_hash text, p_order_id uuid, p_expected_updated_at timestamp with time zone, p_items jsonb, p_payment_method text, p_address jsonb, p_delivery jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_phone text;
  v_customer_id uuid;
  v_order_id uuid;
  v_order public.orders%rowtype;
  v_token_order public.orders%rowtype;
  v_action private.order_customer_actions_v1%rowtype;
  v_reservation jsonb;
  v_reservation_error text;
  v_edit_count integer;
  v_now timestamptz:=now();
  v_order_number text;
  v_payment_code text;
  v_payment_label text;
  v_cart jsonb:=coalesce(p_items,'[]'::jsonb);
  v_customer jsonb:='{}'::jsonb;
  v_delivery jsonb:=coalesce(p_delivery,'{}'::jsonb);
  v_line jsonb;
  v_components jsonb;
  v_basket public.basket_templates%rowtype;
  v_product public.products%rowtype;
  v_line_qty numeric;
  v_product_id uuid;
  v_unit numeric;
  v_line_total numeric;
  v_total numeric(14,2):=0;
  v_fiscal numeric(14,2):=0;
  v_item_rows jsonb:='[]'::jsonb;
  v_sep_rows jsonb:='[]'::jsonb;
  v_loose_demand jsonb:='{}'::jsonb;
  v_current_demand numeric;
  v_mold_component_demand numeric;
  v_existing_stock numeric;
  v_pair record;
  v_basket_unit numeric;
  v_basket_fiscal_unit numeric;
  v_component_snapshot jsonb;
  v_addr jsonb;
  v_first_basket uuid:=null;
  v_basket_names text[]:='{}'::text[];
  v_mold public.basket_molds%rowtype;
  v_mold_position record;
  v_mold_component_count integer;
  v_mold_position_count integer;
  v_composition_number integer;
  v_conditional_hidden_applied numeric:=0;
  v_mold_pricing_model text;
  v_mold_public_data jsonb;
  v_mold_public_composition jsonb;
  v_mold_missing_items jsonb;
  v_mold_configured_product_total numeric:=0;
  v_mold_configured_base numeric:=0;
  v_mold_initial_product_total numeric:=0;
  v_mold_configured_conditional numeric:=0;
  v_mold_initial_conditional numeric:=0;
  v_mold_initial_item_count integer:=0;
  v_mold_selection_delta numeric:=0;
  v_manual_replacement_required boolean:=false;
  v_replacement_product_id uuid;
  v_requested_sort_order integer;
  v_selected_option jsonb;
  v_selected jsonb;
  v_selected_qty numeric;
  v_options jsonb;
  v_selected_total numeric;

begin
  if p_token_hash !~ '^[a-f0-9]{64}$' or p_order_id is null or p_expected_updated_at is null then
    raise exception 'invalid_customer_edit_request';
  end if;

  select * into v_action
  from private.order_customer_actions_v1
  where token_hash=p_token_hash
  for update;
  if not found then raise exception 'invalid_customer_action'; end if;

  select * into v_token_order from public.orders where id=v_action.order_id;
  if not found then raise exception 'customer_order_not_found'; end if;

  select * into v_order
  from public.orders
  where id=p_order_id
  for update;
  if not found then raise exception 'customer_order_not_found'; end if;

  if p_order_id is distinct from v_action.order_id
     and (v_token_order.customer_id is null or v_order.customer_id is distinct from v_token_order.customer_id) then
    raise exception 'customer_order_access_denied';
  end if;

  if v_order.source not in ('vitrine','storefront_v2')
     or v_order.status not in ('storefront_received','received','confirmed')
     or v_order.cancelled_at is not null
     or v_order.bling_order_id is not null or v_order.bling_synced_at is not null
     or coalesce(v_order.sync_status,'local')<>'local'
     or exists(select 1 from public.order_separation_assignments_v1 x where x.order_id=v_order.id)
     or exists(select 1 from public.order_separation_items_v1 x where x.order_id=v_order.id)
     or exists(select 1 from public.order_separation_completions_v1 x where x.order_id=v_order.id) then
    raise exception 'order_not_editable';
  end if;

  if v_order.updated_at is distinct from p_expected_updated_at then
    raise exception 'order_changed';
  end if;
  if jsonb_typeof(coalesce(p_address,'null'::jsonb))<>'object' then
    raise exception 'delivery_details_required';
  end if;
  if nullif(btrim(coalesce(p_address->>'street','')),'') is null
     or nullif(btrim(coalesce(p_address->>'number','')),'') is null
     or nullif(btrim(coalesce(p_address->>'district','')),'') is null
     or nullif(btrim(coalesce(v_order.delivery_address->>'city','')),'') is null
     or nullif(btrim(coalesce(v_order.delivery_address->>'state','')),'') is null then
    raise exception 'delivery_details_required';
  end if;
  if coalesce(p_delivery->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'delivery_date_unavailable';
  end if;

  v_order_id:=v_order.id;
  v_order_number:=v_order.order_number;
  v_phone:=coalesce(v_order.phone_e164,nullif(v_order.delivery_address->>'phone',''));
  v_customer_id:=v_order.customer_id;
  v_customer:=case
    when jsonb_typeof(v_order.checkout_snapshot->'customer')='object' then v_order.checkout_snapshot->'customer'
    else coalesce(v_order.customer_snapshot,'{}'::jsonb)
  end;
  v_customer:=v_customer||jsonb_build_object(
    'id',v_order.customer_id,
    'display_name',coalesce(nullif(v_customer->>'display_name',''),nullif(v_order.customer_snapshot->>'name',''),nullif(v_order.delivery_address->>'customer_name',''),'Cliente'),
    'address',jsonb_strip_nulls(jsonb_build_object(
      'street',nullif(btrim(p_address->>'street'),''),
      'number',nullif(btrim(p_address->>'number'),''),
      'complement',nullif(btrim(coalesce(p_address->>'complement','')),''),
      'district',nullif(btrim(p_address->>'district'),''),
      'neighborhood',nullif(btrim(p_address->>'district'),''),
      'city',v_order.delivery_address->>'city',
      'state',v_order.delivery_address->>'state',
      'postal_code',nullif(btrim(coalesce(p_address->>'postal_code','')),''),
      'reference',nullif(btrim(coalesce(p_address->>'reference','')),''),
      'raw_text',nullif(btrim(coalesce(p_address->>'reference','')),'')
    ))
  );
  v_delivery:=coalesce(p_delivery,'{}'::jsonb);

  if jsonb_typeof(v_cart)<>'array' or jsonb_array_length(v_cart)=0 then raise exception 'cart_empty'; end if;
  if jsonb_array_length(v_cart)>80 then raise exception 'too_many_items'; end if;

  v_payment_label:=trim(coalesce(p_payment_method,''));
  v_payment_code:=case v_payment_label
    when 'PIX' then 'pix'
    when 'Dinheiro' then 'cash'
    when 'Cartão de crédito' then 'credit_card'
    when 'Cartão alimentação/refeição' then 'food_card'
    else null
  end;
  if v_payment_label<>'' and v_payment_code is null then raise exception 'invalid_payment'; end if;

  delete from public.vitrine_stock_reservations where order_id=v_order_id;

  for v_line in select value from jsonb_array_elements(v_cart) loop
    if jsonb_typeof(v_line)<>'object' then raise exception 'item_must_be_object'; end if;
    if coalesce(v_line->>'type','product') not in ('product','basket_mold') then raise exception 'invalid_item_type'; end if;
    begin v_line_qty:=coalesce(nullif(v_line->>'qty','')::numeric,1);
    exception when others then raise exception 'invalid_quantity'; end;
    if v_line_qty<=0 or v_line_qty>30 or trunc(v_line_qty)<>v_line_qty then raise exception 'invalid_quantity'; end if;

    if coalesce(v_line->>'type','product')='product' then
      begin v_product_id:=(v_line->>'id')::uuid;
      exception when others then raise exception 'invalid_product_id'; end;
      select * into v_product from public.products where id=v_product_id and is_active=true;
      if not found or v_product.price is null then
        raise exception 'product_unavailable'
          using detail=jsonb_build_object(
            'kind','product','product_id',v_product_id,
            'requested',v_line_qty,'available',0,
            'reason','product_not_orderable'
          )::text;
      end if;
      select case when stock_authority='bling' then loose_sellable_stock else coalesce(ean_sellable_stock,loose_sellable_stock) end into v_existing_stock
      from public.storefront_ean_sellable_stock_v1
      where product_id=v_product.id and is_active=true;
      if coalesce(v_existing_stock,0)<=0 then
        raise exception 'product_unavailable'
          using detail=jsonb_build_object(
            'kind','product','product_id',v_product.id,
            'requested',v_line_qty,'available',greatest(0,coalesce(v_existing_stock,0)),
            'reason','sem_estoque'
          )::text;
      end if;

      v_unit:=case when v_product.is_offer=true and v_product.offer_price is not null and v_product.offer_price>=0
                   then v_product.offer_price else v_product.price end;
      v_line_total:=round(v_unit*v_line_qty,2);
      v_total:=v_total+v_line_total;
      v_fiscal:=v_fiscal+v_line_total;
      v_current_demand:=coalesce((v_loose_demand->>v_product.id::text)::numeric,0)+v_line_qty;
      v_loose_demand:=jsonb_set(v_loose_demand,array[v_product.id::text],to_jsonb(v_current_demand),true);
      v_item_rows:=v_item_rows||jsonb_build_array(jsonb_build_object(
        'product_id',v_product.id,'sku',v_product.sku,'name',v_product.name,
        'quantity',v_line_qty,'unit_price',v_unit,'line_total',v_line_total,
        'metadata',jsonb_build_object(
          'source','vitrine_direct','history_kind','product',
          'image_url',coalesce(v_product.image_url,'')
        )
      ));
      continue;
    end if;

    if coalesce(v_line->>'type','product')='basket_mold' then
      v_mold_pricing_model:=coalesce(nullif(v_line->>'pricing_model',''),'legacy_component_sum_v1');
      v_mold_public_data:=null;
      v_mold_public_composition:=null;
      v_mold_configured_product_total:=0;
      v_mold_configured_base:=0;
      v_mold_initial_product_total:=0;
      v_mold_configured_conditional:=0;
      v_mold_initial_conditional:=0;
      v_mold_initial_item_count:=0;
      v_mold_selection_delta:=0;

      begin
        select * into v_basket
        from public.basket_templates
        where id=(v_line->>'id')::uuid and is_active=true;
      exception when others then raise exception 'invalid_basket_id'; end;
      if not found then
        -- Recover saved carts only from an exact, unambiguous position set.
        -- Products, quantities, prices and stock are still validated below.
        v_components:=coalesce(v_line->'components','[]'::jsonb);
        if jsonb_typeof(v_components)<>'array' or jsonb_array_length(v_components)=0 then
          raise exception 'basket_mold_unavailable';
        end if;
        select * into v_basket from public.basket_templates
        where is_active=true and id=(
          select min(candidate.basket_id::text)::uuid
          from (
            select m.basket_id
            from public.basket_molds m
            join public.basket_templates b on b.id=m.basket_id and b.is_active=true
            join public.basket_mold_positions pos on pos.mold_id=m.id
            group by m.basket_id,m.id
            having count(*)=jsonb_array_length(v_components)
               and count(*)=(select count(distinct c->>'position_id') from jsonb_array_elements(v_components) c)
               and bool_and(exists(select 1 from jsonb_array_elements(v_components) c where c->>'position_id'=pos.id::text))
          ) candidate
          having count(*)=1
        );
        if not found then raise exception 'basket_mold_unavailable'; end if;
      end if;

      select * into v_mold from public.basket_molds where basket_id=v_basket.id;
      if not found then raise exception 'basket_mold_not_configured'; end if;
      if not public.basket_mold_cutover_ready_v1(v_basket.id) then
        raise exception 'basket_mold_legacy_pending';
      end if;

      begin v_composition_number:=coalesce(nullif(v_line->>'composition_number','')::integer,1);
      exception when others then raise exception 'basket_mold_composition_invalid'; end;
      if v_composition_number<1 or v_composition_number>v_mold.public_composition_count then
        raise exception 'basket_mold_composition_invalid';
      end if;

      v_components:=coalesce(v_line->'components','[]'::jsonb);
      if jsonb_typeof(v_components)<>'array' then raise exception 'basket_mold_components_required'; end if;
      select count(*) into v_mold_position_count from public.basket_mold_positions where mold_id=v_mold.id;
      if v_mold_position_count=0 or jsonb_array_length(v_components)<>v_mold_position_count then
        raise exception 'basket_mold_component_invalid';
      end if;

      if exists(
        select 1 from jsonb_array_elements(v_components) c
        where not exists(
          select 1 from public.basket_mold_positions pos
          where pos.mold_id=v_mold.id and pos.id::text=c->>'position_id'
        )
      ) then raise exception 'basket_mold_component_invalid'; end if;

      if v_mold_pricing_model='configured_base_delta_v1' then
        v_mold_public_data:=public.basket_mold_public_compositions_v2(v_basket.id);
        select comp.value into v_mold_public_composition
        from jsonb_array_elements(coalesce(v_mold_public_data->'compositions','[]'::jsonb)) comp(value)
        where coalesce(nullif(comp.value->>'number','')::integer,0)=v_composition_number
        limit 1;
        if not found or v_mold_public_composition is null then
          select jsonb_build_object(
            'items',coalesce(jsonb_agg(jsonb_build_object(
              'position_id',pos.id,'product_id',configured.product_id
            ) order by pos.sort_order,pos.id),'[]'::jsonb)
          )
          into v_mold_public_composition
          from public.basket_mold_positions pos
          join lateral(
            select opt_row.product_id
            from public.basket_mold_position_options opt_row
            where opt_row.position_id=pos.id
            order by case when coalesce(opt_row.metadata,'{}'::jsonb) @> '{"preferred":true}'::jsonb then 0 else 1 end,
                     opt_row.sort_order,opt_row.product_id
            limit 1
          ) configured on true
          where pos.mold_id=v_mold.id;
        end if;
        if v_mold_public_composition is null then
          raise exception 'basket_mold_composition_invalid';
        end if;
        if jsonb_typeof(v_mold_public_composition->'items')<>'array' then
          raise exception 'basket_mold_composition_invalid';
        end if;

        -- Fill positions omitted because no configured option had sellable stock.
        -- The existing per-position checks below will mark these as manual replacements.
        select coalesce(jsonb_agg(
          jsonb_build_object('position_id',pos.id,'product_id',configured.product_id)
          order by pos.sort_order,pos.id
        ),'[]'::jsonb)
        into v_mold_missing_items
        from public.basket_mold_positions pos
        join lateral(
          select opt_row.product_id
          from public.basket_mold_position_options opt_row
          where opt_row.position_id=pos.id
          order by case when coalesce(opt_row.metadata,'{}'::jsonb) @> '{"preferred":true}'::jsonb then 0 else 1 end,
                   opt_row.sort_order,opt_row.product_id
          limit 1
        ) configured on true
        where pos.mold_id=v_mold.id
          and not exists(
            select 1
            from jsonb_array_elements(v_mold_public_composition->'items') existing_item(value)
            where existing_item.value->>'position_id'=pos.id::text
          );

        if jsonb_array_length(v_mold_missing_items)>0 then
          v_mold_public_composition:=jsonb_set(
            v_mold_public_composition,
            '{items}',
            (v_mold_public_composition->'items')||v_mold_missing_items,
            true
          );
        end if;

        if jsonb_array_length(v_mold_public_composition->'items')<>v_mold_position_count then
          raise exception 'basket_mold_composition_invalid';
        end if;
        select count(distinct item.value->>'position_id') into v_mold_initial_item_count
        from jsonb_array_elements(v_mold_public_composition->'items') item(value)
        where exists(
          select 1 from public.basket_mold_positions pos
          where pos.mold_id=v_mold.id and pos.id::text=item.value->>'position_id'
        );
        if v_mold_initial_item_count<>v_mold_position_count then
          raise exception 'basket_mold_composition_invalid';
        end if;

        select coalesce(sum(round(round(
          (case when configured_product.is_offer=true
                      and configured_product.offer_price is not null
                      and configured_product.offer_price>=0
                then configured_product.offer_price else configured_product.price end)*100
        )*pos_row.quantity/100,2)),0)
        into v_mold_configured_product_total
        from public.basket_mold_positions pos_row
        join lateral(
          select opt_row.product_id
          from public.basket_mold_position_options opt_row
          where opt_row.position_id=pos_row.id
          order by opt_row.sort_order,opt_row.product_id
          limit 1
        ) configured on true
        join public.products configured_product on configured_product.id=configured.product_id
        where pos_row.mold_id=v_mold.id;

        if coalesce(v_mold.conditional_hidden_enabled,false)
           and v_mold.conditional_hidden_product_id is not null
           and coalesce(v_mold.conditional_hidden_adjustment,0)>0
           and exists(
             select 1
             from public.basket_mold_positions pos_row
             join lateral(
               select opt_row.product_id
               from public.basket_mold_position_options opt_row
               where opt_row.position_id=pos_row.id
               order by opt_row.sort_order,opt_row.product_id
               limit 1
             ) configured on true
             where pos_row.mold_id=v_mold.id
               and configured.product_id=v_mold.conditional_hidden_product_id
               and pos_row.quantity>0
           )
        then
          v_mold_configured_conditional:=round(v_mold.conditional_hidden_adjustment,2);
        end if;

        v_mold_configured_base:=CASE
          WHEN coalesce(v_mold.metadata->>'site_admin_default_price_cents','') ~ '^[0-9]{1,9}$'
            THEN (v_mold.metadata->>'site_admin_default_price_cents')::numeric / 100
          ELSE round(
            v_mold_configured_product_total
            +coalesce(v_mold.hidden_adjustment,0)
            +v_mold_configured_conditional,2
          )
        END;

        select coalesce(sum(round(round(
          (case when initial_product.is_offer=true
                      and initial_product.offer_price is not null
                      and initial_product.offer_price>=0
                then initial_product.offer_price else initial_product.price end)*100
        )*pos_row.quantity/100,2)),0)
        into v_mold_initial_product_total
        from public.basket_mold_positions pos_row
        join jsonb_array_elements(v_mold_public_composition->'items') initial_item(value)
          on initial_item.value->>'position_id'=pos_row.id::text
        join public.products initial_product
          on initial_product.id=nullif(initial_item.value->>'product_id','')::uuid
        where pos_row.mold_id=v_mold.id;

        if coalesce(v_mold.conditional_hidden_enabled,false)
           and v_mold.conditional_hidden_product_id is not null
           and coalesce(v_mold.conditional_hidden_adjustment,0)>0
           and exists(
             select 1
             from public.basket_mold_positions pos_row
             join jsonb_array_elements(v_mold_public_composition->'items') initial_item(value)
               on initial_item.value->>'position_id'=pos_row.id::text
             where pos_row.mold_id=v_mold.id
               and nullif(initial_item.value->>'product_id','')::uuid=v_mold.conditional_hidden_product_id
               and pos_row.quantity>0
           )
        then
          v_mold_initial_conditional:=round(v_mold.conditional_hidden_adjustment,2);
        end if;
      end if;

      v_basket_unit:=coalesce(v_mold.hidden_adjustment,0);
      v_basket_fiscal_unit:=0;
      v_component_snapshot:='[]'::jsonb;

      for v_mold_position in
        select id,label,quantity,sort_order
        from public.basket_mold_positions
        where mold_id=v_mold.id
        order by sort_order,id
      loop
        select count(*) into v_mold_component_count
        from jsonb_array_elements(v_components) c
        where c->>'position_id'=v_mold_position.id::text;
        if v_mold_component_count<>1 then raise exception 'basket_mold_component_invalid'; end if;

        select value into v_selected
        from jsonb_array_elements(v_components)
        where value->>'position_id'=v_mold_position.id::text
        limit 1;

        v_options:=coalesce(v_selected->'options','[]'::jsonb);
        if jsonb_typeof(v_options)<>'array' then raise exception 'basket_mold_component_invalid'; end if;
        if jsonb_array_length(v_options)=0 then
          v_options:=jsonb_build_array(jsonb_build_object(
            'product_id',v_selected->>'product_id',
            'quantity',case when v_selected ? 'quantity' then v_selected->'quantity' else to_jsonb(v_mold_position.quantity) end
          ));
        end if;
        v_selected_total:=0;

        for v_selected_option in select value from jsonb_array_elements(v_options)
        loop
          begin v_product_id:=nullif(v_selected_option->>'product_id','')::uuid;
          exception when others then raise exception 'basket_mold_component_invalid'; end;
          if v_product_id is null then raise exception 'basket_mold_option_invalid'; end if;
          select opt_row.sort_order into v_requested_sort_order
          from public.basket_mold_position_options opt_row
          where opt_row.position_id=v_mold_position.id and opt_row.product_id=v_product_id;
          if not found then
            select opt_row.product_id,opt_row.sort_order
            into v_product_id,v_requested_sort_order
            from public.basket_mold_position_options opt_row
            where opt_row.position_id=v_mold_position.id
            order by case when coalesce(opt_row.metadata,'{}'::jsonb) @> '{"preferred":true}'::jsonb then 0 else 1 end,
                     opt_row.sort_order,opt_row.product_id
            limit 1;
          end if;
          if v_product_id is null then raise exception 'basket_mold_option_invalid'; end if;

          select * into v_product from public.products where id=v_product_id;
          if not found or v_product.price is null then raise exception 'basket_mold_option_invalid'; end if;

          begin
            v_selected_qty:=coalesce(nullif(v_selected_option->>'quantity','')::numeric,0);
          exception when others then raise exception 'invalid_basket_quantity'; end;
          if v_selected_qty<0 or v_selected_qty>1000 or trunc(v_selected_qty)<>v_selected_qty then raise exception 'invalid_basket_quantity'; end if;
          v_selected_total:=v_selected_total+v_selected_qty;
          if v_selected_total>1000 then raise exception 'invalid_basket_quantity'; end if;

          select public.basket_component_fresh_sellable_stock_v1(v_product.id) into v_existing_stock;
          if v_product.is_active is not true or coalesce(v_existing_stock,0)<v_selected_qty*v_line_qty then
            select opt_row.product_id into v_replacement_product_id
            from public.basket_mold_position_options opt_row
            join public.products replacement_product on replacement_product.id=opt_row.product_id
            where opt_row.position_id=v_mold_position.id
              and replacement_product.is_active=true
              and public.basket_component_fresh_sellable_stock_v1(replacement_product.id)>=v_selected_qty*v_line_qty
            order by case
                       when (opt_row.sort_order,opt_row.product_id)>(coalesce(v_requested_sort_order,-1),v_product_id) then 0
                       else 1
                     end,
                     opt_row.sort_order,opt_row.product_id
            limit 1;
            if found then
              v_product_id:=v_replacement_product_id;
              select * into v_product from public.products where id=v_product_id;
              select public.basket_component_fresh_sellable_stock_v1(v_product.id) into v_existing_stock;
            end if;
          end if;
          v_manual_replacement_required:=v_product.is_active is not true
            or coalesce(v_existing_stock,0)<v_selected_qty*v_line_qty;
          if v_selected_qty=0 then
            v_component_snapshot:=v_component_snapshot||jsonb_build_array(jsonb_build_object(
              'position_id',v_mold_position.id,'label',v_mold_position.label,
              'product_id',v_product.id,'quantity',0
            ));
            continue;
          end if;

          v_unit:=case when v_product.is_offer=true and v_product.offer_price is not null and v_product.offer_price>=0
                       then v_product.offer_price else v_product.price end;
          v_line_total:=round(v_unit*v_selected_qty*v_line_qty,2);
          v_basket_fiscal_unit:=v_basket_fiscal_unit+round(v_unit*v_selected_qty,2);
          v_basket_unit:=v_basket_unit+round(v_unit*v_selected_qty,2);
          if not v_manual_replacement_required then
            v_current_demand:=coalesce((v_loose_demand->>v_product.id::text)::numeric,0)+(v_selected_qty*v_line_qty);
            v_loose_demand:=jsonb_set(v_loose_demand,array[v_product.id::text],to_jsonb(v_current_demand),true);
          end if;

          v_item_rows:=v_item_rows||jsonb_build_array(jsonb_build_object(
            'product_id',v_product.id,'sku',v_product.sku,'name',v_product.name,
            'quantity',v_selected_qty*v_line_qty,'unit_price',v_unit,'line_total',v_line_total,
            'metadata',jsonb_build_object(
              'source','vitrine_direct','history_kind','basket_mold_component',
              'basket_id',v_basket.id,'basket_name',v_basket.name,'basket_quantity',v_line_qty,
              'mold_id',v_mold.id,'position_id',v_mold_position.id,'position_label',v_mold_position.label,
              'composition_number',v_composition_number,'selected_quantity',v_selected_qty,
              'selected_product_id',v_selected_option->>'product_id',
              'image_url',coalesce(v_product.image_url,''),
              'manual_replacement_required',v_manual_replacement_required,
              'manual_replacement_reason',case when v_manual_replacement_required then 'no_available_basket_option' else null end
            )
          ));
          v_component_snapshot:=v_component_snapshot||jsonb_build_array(jsonb_build_object(
            'position_id',v_mold_position.id,'label',v_mold_position.label,
            'product_id',v_product.id,'quantity',v_selected_qty,
            'selected_product_id',v_selected_option->>'product_id'
          ));
        end loop;
      end loop;

      v_conditional_hidden_applied:=0;
      if coalesce(v_mold.conditional_hidden_enabled,false)
         and v_mold.conditional_hidden_product_id is not null
         and coalesce(v_mold.conditional_hidden_adjustment,0)>0
         and exists(
           select 1
           from jsonb_array_elements(v_component_snapshot) c
           where c->>'product_id'=v_mold.conditional_hidden_product_id::text
             and coalesce(nullif(c->>'quantity','')::numeric,0)>0
         )
      then
        v_conditional_hidden_applied:=round(v_mold.conditional_hidden_adjustment,2);
        v_basket_unit:=v_basket_unit+v_conditional_hidden_applied;
      end if;

      if v_mold_pricing_model='configured_base_delta_v1' then
        v_mold_selection_delta:=round(v_basket_fiscal_unit-v_mold_initial_product_total,2);
        v_basket_unit:=greatest(0,round(
          v_mold_configured_base
          +v_mold_selection_delta
          +v_conditional_hidden_applied
          -v_mold_initial_conditional,2
        ));
      end if;

      if v_basket_unit<0 then raise exception 'invalid_order_total'; end if;
      if v_first_basket is null then v_first_basket:=v_basket.id; end if;
      if not (v_basket.name=any(v_basket_names)) then v_basket_names:=array_append(v_basket_names,v_basket.name); end if;
      v_total:=v_total+round(v_basket_unit*v_line_qty,2);
      v_fiscal:=v_fiscal+round(v_basket_fiscal_unit*v_line_qty,2);

      v_item_rows:=v_item_rows||jsonb_build_array(jsonb_build_object(
        'product_id',null,'sku',null,'name',v_basket.name,
        'quantity',v_line_qty,'unit_price',round(v_basket_unit,2),'line_total',round(v_basket_unit*v_line_qty,2),
        'metadata',jsonb_build_object(
          'source','vitrine_direct','history_kind','basket_mold','basket_id',v_basket.id,
          'mold_id',v_mold.id,'composition_number',v_composition_number,
          'hidden_value_fixed',v_mold.hidden_adjustment,
          'conditional_hidden_enabled',v_mold.conditional_hidden_enabled,
          'conditional_hidden_product_id',v_mold.conditional_hidden_product_id,
          'conditional_hidden_value',v_conditional_hidden_applied,
          'hidden_value_total',round(v_basket_unit-v_basket_fiscal_unit,2),
          'hidden_value_preserved',true,
          'component_snapshot',v_component_snapshot,'image_url',coalesce(v_basket.image_url,'')
        )
      ));
      v_sep_rows:=v_sep_rows||jsonb_build_array(jsonb_build_object(
        'basket_id',v_basket.id,'basket_name',v_basket.name,'quantity',v_line_qty,
        'mold',jsonb_build_object('mode','loose','mold_id',v_mold.id,'composition_number',v_composition_number,
          'hidden_value_fixed',v_mold.hidden_adjustment,
          'conditional_hidden_value',v_conditional_hidden_applied,
          'hidden_value_total',round(v_basket_unit-v_basket_fiscal_unit,2),
          'components',v_component_snapshot)
      ));
      continue;
    end if;

  end loop;

  if v_total<75 then raise exception 'minimum_order'; end if;

  for v_pair in select key,value from jsonb_each_text(v_loose_demand) loop
    perform 1 from public.products where id=v_pair.key::uuid for update;
    if not found then
      raise exception 'product_unavailable'
        using detail=jsonb_build_object(
          'kind','product','product_id',v_pair.key::uuid,
          'requested',v_pair.value::numeric,'available',0,
          'reason','produto_nao_encontrado'
        )::text;
    end if;

    select coalesce(sum(nullif(item->>'quantity','')::numeric),0)
    into v_mold_component_demand
    from jsonb_array_elements(v_item_rows) as item
    where item->>'product_id'=v_pair.key
      and item#>>'{metadata,history_kind}'='basket_mold_component';

    if coalesce((select p.is_active from public.products p where p.id=v_pair.key::uuid),false) then
      select case when stock_authority='bling' then loose_sellable_stock else coalesce(ean_sellable_stock,loose_sellable_stock) end into v_existing_stock
      from public.storefront_ean_sellable_stock_v1
      where product_id=v_pair.key::uuid and is_active=true;
      if not found then
        raise exception 'product_unavailable'
          using detail=jsonb_build_object(
            'kind',case when v_mold_component_demand=v_pair.value::numeric then 'basket_mold_component' else 'product' end,
            'product_id',v_pair.key::uuid,
            'requested',v_pair.value::numeric,'available',0,
            'reason','saldo_nao_encontrado'
          )::text;
      end if;
    else
      if v_mold_component_demand<>v_pair.value::numeric then
        raise exception 'product_unavailable'
          using detail=jsonb_build_object(
            'kind','basket_mold_component','product_id',v_pair.key::uuid,
            'requested',v_pair.value::numeric,'available',0,
            'reason','demanda_de_componente_invalida'
          )::text;
      end if;
      select public.basket_component_fresh_sellable_stock_v1(v_pair.key::uuid)
      into v_existing_stock;
    end if;

    if coalesce(v_existing_stock,0)<v_pair.value::numeric then
      if v_mold_component_demand=v_pair.value::numeric then
        select coalesce(jsonb_agg(
          case when item->>'product_id'=v_pair.key
            then jsonb_set(item,'{metadata}',
              coalesce(item->'metadata','{}'::jsonb)||jsonb_build_object(
                'manual_replacement_required',true,
                'manual_replacement_reason','aggregate_stock_shortage'
              ),true)
            else item end
          order by ordinal
        ),'[]'::jsonb)
        into v_item_rows
        from jsonb_array_elements(v_item_rows) with ordinality rows(item,ordinal);
      else
        raise exception 'insufficient_stock'
          using detail=jsonb_build_object(
            'kind',case when v_mold_component_demand=v_pair.value::numeric then 'basket_mold_component' else 'product' end,
            'product_id',v_pair.key::uuid,
            'requested',v_pair.value::numeric,
            'available',greatest(0,coalesce(v_existing_stock,0)),
            'reason','estoque_insuficiente'
          )::text;
      end if;
    end if;
  end loop;

  v_order_number:=v_order.order_number;
  v_addr:=jsonb_strip_nulls(jsonb_build_object(
    'customer_name',nullif(v_customer->>'display_name',''),'source_customer_id',v_customer_id,
    'phone',v_phone,'street',nullif(v_customer#>>'{address,street}',''),
    'number',nullif(v_customer#>>'{address,number}',''),'complement',nullif(v_customer#>>'{address,complement}',''),
    'district',coalesce(nullif(v_customer#>>'{address,district}',''),nullif(v_customer#>>'{address,neighborhood}','')),
    'city',nullif(v_customer#>>'{address,city}',''),'state',nullif(v_customer#>>'{address,state}',''),
    'postal_code',nullif(v_customer#>>'{address,postal_code}',''),'raw_text',nullif(v_customer#>>'{address,raw_text}',''),
    'google_maps_url',nullif(v_customer#>>'{address,google_maps_url}',''),
    'delivery_date',nullif(v_delivery->>'date',''),'delivery_label',nullif(v_delivery->>'label',''),
    'delivery_reason',nullif(v_delivery->>'reason',''),'delivery_time_zone',nullif(v_delivery->>'time_zone',''),
    'delivery_cutoff_hour',v_delivery->'cutoff_hour'
  ));

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_cart) item(value)
    WHERE COALESCE(item.value->>'type','product')='basket_mold'
  ) AND v_total<75 THEN
    RAISE EXCEPTION 'minimum_order';
  END IF;

  v_edit_count:=coalesce(nullif(v_order.checkout_snapshot#>>'{customer_edit,edit_count}','')::integer,0)+1;
  update public.orders
  set total=round(v_total,2),
      delivery_address=coalesce(v_addr,'{}'::jsonb),
      fiscal_subtotal=round(v_fiscal,2),
      other_expenses=greatest(round(v_total-v_fiscal,2),0),
      discount=greatest(round(v_fiscal-v_total,2),0),
      payment_method=v_payment_code,
      subtotal=round(v_total,2),
      basket_id=case when array_length(v_basket_names,1)=1 then v_first_basket else null end,
      basket_name_snapshot=case when array_length(v_basket_names,1)=1 then v_basket_names[1] else null end,
      checkout_snapshot=coalesce(v_order.checkout_snapshot,'{}'::jsonb)||jsonb_build_object(
        'source','vitrine_direct','cart',v_cart,'payment_label',v_payment_label,
        'delivery',v_delivery,'customer',v_customer,'basket_names',to_jsonb(v_basket_names),
        'separation_plan',v_sep_rows,'hidden_value_preserved',true,
        'customer_edit',jsonb_build_object('edited_at',v_now,'edit_count',v_edit_count)
      ),
      updated_at=v_now
  where id=v_order_id;

  delete from public.order_items where order_id=v_order_id;

  for v_line in select value from jsonb_array_elements(v_item_rows) loop
    insert into public.order_items(order_id,product_id,sku_snapshot,name_snapshot,quantity,unit_price,line_total,metadata)
    values(
      v_order_id,
      case when nullif(v_line->>'product_id','') is null then null else (v_line->>'product_id')::uuid end,
      nullif(v_line->>'sku',''),v_line->>'name',
      (v_line->>'quantity')::numeric,(v_line->>'unit_price')::numeric,(v_line->>'line_total')::numeric,
      coalesce(v_line->'metadata','{}'::jsonb)
    );
  end loop;

  v_reservation:=public.reserve_vitrine_order_stock_v1(v_order_id);
  if coalesce((v_reservation->>'ok')::boolean,false) is not true then
    v_reservation_error:=coalesce(nullif(v_reservation->>'error',''),'stock_reservation_failed');
    raise exception 'customer_edit_stock_unavailable:%',v_reservation_error using errcode='P0001';
  end if;
  perform public.ops2_refresh_order_public_snapshot_v1(v_order_id);

  return jsonb_build_object(
    'ok',true,
    'order_id',v_order_id,'order_number',v_order_number,
    'total_cents',round(v_total*100)::bigint,'total',round(v_total,2),
    'payment_method',v_payment_label,
    'updated_at',(select updated_at from public.orders where id=v_order_id),
    'edit_count',v_edit_count,
    'separation_plan',v_sep_rows
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.ops4_apply_postorder_quickreply_v1(p_order_id uuid, p_account_id uuid, p_phone_e164 text, p_action text, p_nonce_hash text, p_provider_message_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare f private.ops4_postorder_followups_v1%rowtype;
  v_token_hash text; v_result jsonb;
begin
  if p_action not in ('confirm','edit')
    or p_nonce_hash !~ '^[a-f0-9]{64}$'
    or nullif(btrim(coalesce(p_provider_message_id,'')),'') is null then
    return jsonb_build_object('ok',false,'error','invalid_reply');
  end if;
  select * into f from private.ops4_postorder_followups_v1
    where order_id=p_order_id for update;
  if not found or f.confirm_status<>'sent'
    or f.whatsapp_account_id is distinct from p_account_id
    or f.phone_e164 is distinct from p_phone_e164
    or f.confirm_nonce_hash is distinct from p_nonce_hash
    or f.sent_at is null or now()>f.expires_at then
    return jsonb_build_object('ok',false,'error','reply_not_applicable');
  end if;
  if p_action='edit' then
    update private.ops4_postorder_followups_v1
      set confirm_status='changes_requested',
          reply_provider_message_id=p_provider_message_id,updated_at=now()
      where order_id=p_order_id;
    return jsonb_build_object('ok',true,'action','edit','order_id',p_order_id);
  end if;
  select token_hash into v_token_hash from private.order_customer_actions_v1
    where order_id=p_order_id and expires_at>now()
    order by issued_at desc,token_hash limit 1;
  if v_token_hash is null then
    return jsonb_build_object('ok',false,'error','customer_action_missing');
  end if;
  v_result:=public.ops3_confirm_customer_order_v1(
    v_token_hash,f.confirm_total,f.confirm_order_updated_at
  );
  if coalesce((v_result->>'ok')::boolean,false) is true then
    update private.ops4_postorder_followups_v1
      set confirm_status='confirmed',reply_provider_message_id=p_provider_message_id,
          updated_at=now() where order_id=p_order_id;
  elsif v_result->>'error' in ('order_changed','order_status_closed','session_expired') then
    update private.ops4_postorder_followups_v1
      set confirm_status='conflict',last_error=v_result->>'error',updated_at=now()
      where order_id=p_order_id;
  end if;
  return v_result||jsonb_build_object('action','confirm','order_id',p_order_id);
end;$function$


REVOKE ALL ON FUNCTION public.ops3_customer_order_session_v1(text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ops3_customer_order_history_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ops3_update_customer_order_v1(text,uuid,timestamp with time zone,jsonb,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops3_customer_order_session_v1(text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ops3_customer_order_history_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ops3_update_customer_order_v1(text,uuid,timestamp with time zone,jsonb,text,jsonb,jsonb) TO service_role;
