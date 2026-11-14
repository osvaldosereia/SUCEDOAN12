DO $migration$
DECLARE
  v_def text;
  v_old text;
  v_tail text;
  v_start integer;
  v_end integer;
  v_keep integer;
  v_remove text;
BEGIN
  v_def := pg_get_functiondef(
    'public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)'::regprocedure
  );

  v_old := $old$if coalesce(v_line->>'type','product') not in ('product','basket','basket_mold') then raise exception 'invalid_item_type'; end if;$old$;
  IF length(v_def)-length(replace(v_def,v_old,''))<>length(v_old) THEN
    RAISE EXCEPTION 'create_vitrine_cart_order_v3_base item type block changed';
  END IF;
  v_def := replace(v_def,v_old,$new$if coalesce(v_line->>'type','product') not in ('product','basket_mold') then raise exception 'invalid_item_type'; end if;$new$);

  v_start := strpos(v_def,$marker$    -- Compatibilidade transacional com lotes completos antigos.$marker$);
  IF v_start=0 THEN RAISE EXCEPTION 'legacy basket branch not found'; END IF;
  v_tail := substring(v_def from v_start);
  v_end := strpos(v_tail,$marker$  end loop;

  if v_total<75$marker$);
  IF v_end=0 THEN RAISE EXCEPTION 'basket checkout loop end not found'; END IF;
  v_def := substring(v_def from 1 for v_start-1)
    || substring(v_def from v_start+v_end-1);

  v_start := strpos(v_def,$marker$  for v_line in select value from jsonb_array_elements(v_alloc_rows) loop$marker$);
  IF v_start=0 THEN RAISE EXCEPTION 'legacy lot allocation loop not found'; END IF;
  v_tail := substring(v_def from v_start);
  v_end := strpos(v_tail,E'  end loop;\n\n  return jsonb_build_object(');
  IF v_end=0 THEN RAISE EXCEPTION 'legacy lot allocation loop end not found'; END IF;
  v_keep := v_start+v_end-1+length(E'  end loop;\n\n');
  v_def := substring(v_def from 1 for v_start-1)||substring(v_def from v_keep);

  FOREACH v_remove IN ARRAY ARRAY[
    $remove$  v_alloc_rows jsonb:='[]'::jsonb;
$remove$,
    $remove$  v_lot_demand jsonb:='{}'::jsonb;
$remove$,
    $remove$  v_group text;
$remove$,
    $remove$  v_group_lot_id uuid;
$remove$,
    $remove$  v_group_kind text;
$remove$,
    $remove$  v_group_changed boolean;
$remove$,
    $remove$  v_group_short text;
$remove$,
    $remove$  v_food_lot_id uuid;
$remove$,
    $remove$  v_hygiene_lot_id uuid;
$remove$,
    $remove$  v_food_changed boolean:=false;
$remove$,
    $remove$  v_hygiene_changed boolean:=false;
$remove$,
    $remove$  v_food_short text:=null;
$remove$,
    $remove$  v_hygiene_short text:=null;
$remove$,
    $remove$  v_lot_requested integer;
$remove$,
    $remove$  v_li record;
$remove$,
    $remove$  v_selected_qty numeric;
$remove$,
    $remove$  v_base_qty numeric;
$remove$,
    $remove$  v_min numeric;
$remove$,
    $remove$  v_max numeric;
$remove$,
    $remove$  v_delta numeric;
$remove$,
    $remove$  v_preassembled_units numeric;
$remove$,
    $remove$  v_loose_units numeric;
$remove$,
    $remove$  v_all_split boolean;
$remove$,
    $remove$  v_legacy_lot_id uuid;
$remove$,
    $remove$  v_legacy_lot public.basket_stock_lots%rowtype;
$remove$,
    $remove$  v_supplied boolean;
$remove$,
    $remove$  v_selected jsonb;
$remove$
  ] LOOP
    IF strpos(v_def,v_remove)=0 THEN
      RAISE EXCEPTION 'expected legacy declaration missing: %',trim(v_remove);
    END IF;
    v_def := replace(v_def,v_remove,'');
  END LOOP;

  v_old := $old$  -- O formato do lote é decidido por item. Não existe mais chave global legacy/split.
  v_all_split:=true;

$old$;
  IF strpos(v_def,v_old)=0 THEN RAISE EXCEPTION 'legacy split selector not found'; END IF;
  v_def := replace(v_def,v_old,'');

  v_old := $old$'split_kits',true,'separation_plan',v_sep_rows,$old$;
  IF length(v_def)-length(replace(v_def,v_old,''))<>2*length(v_old) THEN
    RAISE EXCEPTION 'legacy split metadata not found twice';
  END IF;
  v_def := replace(v_def,v_old,$new$'separation_plan',v_sep_rows,$new$);

  IF position('basket_stock_lot' in v_def)>0
     OR position('basket_lot_' in v_def)>0
     OR position('v_legacy_lot' in v_def)>0
     OR position('split_kits' in v_def)>0
     OR position('legacy_full' in v_def)>0 THEN
    RAISE EXCEPTION 'legacy lot checkout code remains';
  END IF;

  EXECUTE v_def;
END;
$migration$;
