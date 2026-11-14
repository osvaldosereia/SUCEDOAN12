DO $$
DECLARE d text; t text; a int; b int;
BEGIN
 d:=pg_get_functiondef('public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)'::regprocedure);
 d:=replace(d,$x$if coalesce(v_line->>'type','product') not in ('product','basket','basket_mold') then raise exception 'invalid_item_type'; end if;$x$,$x$if coalesce(v_line->>'type','product') not in ('product','basket_mold') then raise exception 'invalid_item_type'; end if;$x$);
 a:=strpos(d,$x$    -- Compatibilidade transacional com lotes completos antigos.$x$);
 IF a=0 THEN RETURN; END IF;
 t:=substring(d from a); b:=strpos(t,$x$  end loop;

  if v_total<75$x$);
 IF b=0 THEN RAISE EXCEPTION 'basket loop end missing'; END IF;
 d:=substring(d from 1 for a-1)||substring(d from a+b-1);
 a:=strpos(d,$x$  for v_line in select value from jsonb_array_elements(v_alloc_rows) loop$x$);
 IF a=0 THEN RAISE EXCEPTION 'legacy allocation missing'; END IF;
 t:=substring(d from a); b:=strpos(t,E'  end loop;\n\n  return jsonb_build_object(');
 IF b=0 THEN RAISE EXCEPTION 'allocation end missing'; END IF;
 d:=substring(d from 1 for a-1)||substring(d from a+b-1+length(E'  end loop;\n\n'));
 d:=regexp_replace(d,E'  v_(alloc_rows|lot_demand|group|group_lot_id|group_kind|group_changed|group_short|food_lot_id|hygiene_lot_id|food_changed|hygiene_changed|food_short|hygiene_short|lot_requested|li|selected_qty|base_qty|min|max|delta|preassembled_units|loose_units|all_split|legacy_lot_id|legacy_lot|supplied|selected) [^\n]*;\n','','g');
 d:=replace(d,E'  -- O formato do lote é decidido por item. Não existe mais chave global legacy/split.\n  v_all_split:=true;\n\n','');
 d:=replace(d,$x$'split_kits',true,'separation_plan',v_sep_rows,$x$,$x$'separation_plan',v_sep_rows,$x$);
 IF position('basket_stock_lot' in d)>0 OR position('split_kits' in d)>0 THEN RAISE EXCEPTION 'legacy stock remains'; END IF;
 EXECUTE d;
END $$;