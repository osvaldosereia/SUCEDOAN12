DO $migration$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  v_def := pg_get_functiondef('public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)'::regprocedure);

  v_old := $old$if not found or v_product.price is null then raise exception 'product_unavailable'; end if;$old$;
  v_new := $new$if not found or v_product.price is null then
        raise exception 'product_unavailable'
          using detail=jsonb_build_object(
            'kind','product','product_id',v_product_id,
            'requested',v_line_qty,'available',0,
            'reason','product_not_orderable'
          )::text;
      end if;$new$;
  IF length(v_def)-length(replace(v_def,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'create_vitrine_cart_order_v3_base direct product block changed';
  END IF;
  v_def := replace(v_def,v_old,v_new);

  v_old := $old$if coalesce(v_existing_stock,0)<=0 then raise exception 'product_unavailable'; end if;$old$;
  v_new := $new$if coalesce(v_existing_stock,0)<=0 then
        raise exception 'product_unavailable'
          using detail=jsonb_build_object(
            'kind','product','product_id',v_product.id,
            'requested',v_line_qty,'available',greatest(0,coalesce(v_existing_stock,0)),
            'reason','sem_estoque'
          )::text;
      end if;$new$;
  IF length(v_def)-length(replace(v_def,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'create_vitrine_cart_order_v3_base product stock block changed';
  END IF;
  v_def := replace(v_def,v_old,v_new);

  v_old := $old$perform 1 from public.products where id=v_pair.key::uuid for update;
    if not found then raise exception 'product_unavailable'; end if;$old$;
  v_new := $new$perform 1 from public.products where id=v_pair.key::uuid for update;
    if not found then
      raise exception 'product_unavailable'
        using detail=jsonb_build_object(
          'kind','product','product_id',v_pair.key::uuid,
          'requested',v_pair.value::numeric,'available',0,
          'reason','produto_nao_encontrado'
        )::text;
    end if;$new$;
  IF length(v_def)-length(replace(v_def,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'create_vitrine_cart_order_v3_base aggregate product block changed';
  END IF;
  v_def := replace(v_def,v_old,v_new);

  v_old := $old$from public.storefront_ean_sellable_stock_v1
      where product_id=v_pair.key::uuid and is_active=true;
      if not found then raise exception 'product_unavailable'; end if;$old$;
  v_new := $new$from public.storefront_ean_sellable_stock_v1
      where product_id=v_pair.key::uuid and is_active=true;
      if not found then
        raise exception 'product_unavailable'
          using detail=jsonb_build_object(
            'kind',case when v_mold_component_demand=v_pair.value::numeric then 'basket_mold_component' else 'product' end,
            'product_id',v_pair.key::uuid,
            'requested',v_pair.value::numeric,'available',0,
            'reason','saldo_nao_encontrado'
          )::text;
      end if;$new$;
  IF length(v_def)-length(replace(v_def,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'create_vitrine_cart_order_v3_base aggregate stock lookup changed';
  END IF;
  v_def := replace(v_def,v_old,v_new);

  v_old := $old$if v_mold_component_demand<>v_pair.value::numeric then
        raise exception 'product_unavailable';
      end if;$old$;
  v_new := $new$if v_mold_component_demand<>v_pair.value::numeric then
        raise exception 'product_unavailable'
          using detail=jsonb_build_object(
            'kind','basket_mold_component','product_id',v_pair.key::uuid,
            'requested',v_pair.value::numeric,'available',0,
            'reason','demanda_de_componente_invalida'
          )::text;
      end if;$new$;
  IF length(v_def)-length(replace(v_def,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'create_vitrine_cart_order_v3_base mold demand block changed';
  END IF;
  v_def := replace(v_def,v_old,v_new);

  v_old := $old$else
        raise exception 'insufficient_stock';
      end if;
    end if;
  end loop;$old$;
  v_new := $new$else
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
  end loop;$new$;
  IF length(v_def)-length(replace(v_def,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'create_vitrine_cart_order_v3_base insufficient stock block changed';
  END IF;
  EXECUTE replace(v_def,v_old,v_new);

  v_def := pg_get_functiondef('public.create_vitrine_cart_order_v3(text,text,jsonb,jsonb,jsonb)'::regprocedure);
  v_old := $old$raise exception '%',v_error using errcode='P0001';$old$;
  v_new := $new$raise exception '%',v_error using errcode='P0001',detail=v_reservation::text;$new$;
  IF length(v_def)-length(replace(v_def,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'create_vitrine_cart_order_v3 reservation error block changed';
  END IF;
  EXECUTE replace(v_def,v_old,v_new);
END;
$migration$;