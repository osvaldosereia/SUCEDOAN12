DO $migration$
DECLARE
  v_def text;
  v_old text;
  v_tail text;
  v_start integer;
  v_end integer;
  v_keep integer;
BEGIN
  v_def:=pg_get_functiondef('public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)'::regprocedure);

  v_old:=$old$if coalesce(v_line->>'type','product') not in ('product','basket','basket_mold') then raise exception 'invalid_item_type'; end if;$old$;
  IF length(v_def)-length(replace(v_def,v_old,''))<>length(v_old) THEN RAISE EXCEPTION 'basket item type block changed'; END IF;
  v_def:=replace(v_def,v_old,$new$if coalesce(v_line->>'type','product') not in ('product','basket_mold') then raise exception 'invalid_item_type'; end if;$new$);

  v_start:=strpos(v_def,$m$    -- Compatibilidade transacional com lotes completos antigos.$m$);
  IF v_start=0 THEN RAISE EXCEPTION 'legacy basket branch not found'; END IF;
  v_tail:=substring(v_def from v_start);
  v_end:=strpos(v_tail,$m$  end loop;

  if v_total<75$m$);
  IF v_end=0 THEN RAISE EXCEPTION 'basket checkout loop end not found'; END IF;
  v_def:=substring(v_def from 1 for v_start-1)||substring(v_def from v_start+v_end-1);

  v_start:=strpos(v_def,$m$  for v_line in select value from jsonb_array_elements(v_alloc_rows) loop$m$);
  IF v_start=0 THEN RAISE EXCEPTION 'legacy allocation loop not found'; END IF;
  v_tail:=substring(v_def from v_start);
  v_end:=strpos(v_tail,E'  end loop;\n\n  return jsonb_build_object(');
  IF v_end=0 THEN RAISE EXCEPTION 'legacy allocation loop end not found'; END IF;
  v_keep:=v_start+v_end-1+length(E'  end loop;\n\n');
  v_def:=substring(v_def from 1 for v_start-1)||substring(v_def from v_keep);

  v_def:=regexp_replace(v_def,E'  v_(alloc_rows|lot_demand|group|group_lot_id|group_kind|group_changed|group_short|food_lot_id|hygiene_lot_id|food_changed|hygiene_changed|food_short|hygiene_short|lot_requested|li|selected_qty|base_qty|min|max|delta|preassembled_units|loose_units|all_split|legacy_lot_id|legacy_lot|supplied|selected) [^\n]*;\n','','g');
  v_old:=E'  -- O formato do lote é decidido por item. Não existe mais chave global legacy/split.\n  v_all_split:=true;\n\n';
  IF strpos(v_def,v_old)=0 THEN RAISE EXCEPTION 'legacy split selector not found'; END IF;
  v_def:=replace(v_def,v_old,'');

  v_old:=$m$'split_kits',true,'separation_plan',v_sep_rows,$m$;
  IF length(v_def)-length(replace(v_def,v_old,''))<>2*length(v_old) THEN RAISE EXCEPTION 'legacy split metadata changed'; END IF;
  v_def:=replace(v_def,v_old,$n$'separation_plan',v_sep_rows,$n$);

  IF position('basket_stock_lot' in v_def)>0 OR position('basket_lot_' in v_def)>0
     OR position('v_legacy_lot' in v_def)>0 OR position('split_kits' in v_def)>0
     OR position('legacy_full' in v_def)>0 THEN RAISE EXCEPTION 'legacy lot checkout code remains'; END IF;
  EXECUTE v_def;
END;
$migration$;
