-- Match the storefront's configured basket baseline. Stock changes affect
-- the selected products and quantities, never the configured baseline.
DO $patch$
DECLARE
  v_definition text := pg_get_functiondef(
    'public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)'::regprocedure
  );
  v_start_anchor text := $piece$      if v_mold_pricing_model='configured_base_delta_v1' then
        v_mold_public_data:=$piece$;
  v_end_anchor text := $piece$      v_basket_unit:=coalesce(v_mold.hidden_adjustment,0);$piece$;
  v_start_index integer := strpos(v_definition,v_start_anchor);
  v_end_index integer := strpos(v_definition,v_end_anchor);
  v_new_block text := $piece$      if v_mold_pricing_model='configured_base_delta_v1' then
        if exists(
          select 1 from public.basket_mold_positions pos
          where pos.mold_id=v_mold.id and not exists(
            select 1 from public.basket_mold_position_options opt where opt.position_id=pos.id
          )
        ) then
          raise exception 'basket_mold_composition_invalid';
        end if;

        -- Price the configured composition before applying stock or customer changes.
        -- Each variant contributes its own quantity; legacy positions use their first option.
        with configured as (
          select opt.product_id,
            case
              when coalesce(opt.metadata->>'base_quantity','') ~ '^[0-9]{1,3}$'
                then (opt.metadata->>'base_quantity')::numeric
              when row_number() over(partition by pos.id order by opt.sort_order,opt.product_id)=1
                then greatest(0,pos.quantity)
              else 0
            end as quantity
          from public.basket_mold_positions pos
          join public.basket_mold_position_options opt on opt.position_id=pos.id
          where pos.mold_id=v_mold.id
        )
        select
          coalesce(sum(round((case when product.is_offer=true
                                      and product.offer_price is not null
                                      and product.offer_price>=0
                                 then product.offer_price else product.price end)*configured.quantity,2)),0),
          case when coalesce(v_mold.conditional_hidden_enabled,false)
                     and coalesce(v_mold.conditional_hidden_adjustment,0)>0
                     and coalesce(bool_or(configured.product_id=v_mold.conditional_hidden_product_id),false)
               then round(v_mold.conditional_hidden_adjustment,2)
               else 0 end
        into v_mold_configured_product_total,v_mold_configured_conditional
        from configured
        left join public.products product on product.id=configured.product_id
        where configured.quantity>0;

        v_mold_configured_base:=case
          when coalesce(v_mold.metadata->>'site_admin_default_price_cents','') ~ '^[0-9]{1,9}$'
            then (v_mold.metadata->>'site_admin_default_price_cents')::numeric / 100
          else greatest(0,round(v_mold_configured_product_total
            +coalesce(v_mold.hidden_adjustment,0)+v_mold_configured_conditional,2))
        end;
      end if;

$piece$;
  v_old text[] := ARRAY[
    $piece$  v_mold_public_data jsonb;
$piece$,
    $piece$  v_mold_public_composition jsonb;
$piece$,
    $piece$  v_mold_missing_items jsonb;
$piece$,
    $piece$  v_mold_initial_product_total numeric:=0;
$piece$,
    $piece$  v_mold_initial_conditional numeric:=0;
$piece$,
    $piece$  v_mold_initial_item_count integer:=0;
$piece$,
    $piece$      v_mold_public_data:=null;
$piece$,
    $piece$      v_mold_public_composition:=null;
$piece$,
    $piece$      v_mold_initial_product_total:=0;
$piece$,
    $piece$      v_mold_initial_conditional:=0;
$piece$,
    $piece$      v_mold_initial_item_count:=0;
$piece$,
    $piece$v_basket_fiscal_unit-v_mold_initial_product_total$piece$,
    $piece$-v_mold_initial_conditional,2$piece$
  ];
  v_new text[] := ARRAY[
    $piece$$piece$,
    $piece$$piece$,
    $piece$$piece$,
    $piece$$piece$,
    $piece$$piece$,
    $piece$$piece$,
    $piece$$piece$,
    $piece$$piece$,
    $piece$$piece$,
    $piece$$piece$,
    $piece$$piece$,
    $piece$v_basket_fiscal_unit-v_mold_configured_product_total$piece$,
    $piece$-v_mold_configured_conditional,2$piece$
  ];
  v_index integer;
BEGIN
  IF v_start_index=0 OR v_end_index<=v_start_index
     OR length(v_definition)-length(replace(v_definition,v_start_anchor,''))<>length(v_start_anchor)
     OR length(v_definition)-length(replace(v_definition,v_end_anchor,''))<>length(v_end_anchor)
     OR strpos(substring(v_definition from v_start_index for v_end_index-v_start_index),
               'into v_mold_initial_product_total')=0 THEN
    RAISE EXCEPTION 'checkout configured price patch: unexpected function definition';
  END IF;
  v_definition := left(v_definition,v_start_index-1)||v_new_block||substring(v_definition from v_end_index);
  FOR v_index IN 1..array_length(v_old,1) LOOP
    IF length(v_definition)-length(replace(v_definition,v_old[v_index],''))<>length(v_old[v_index]) THEN
      RAISE EXCEPTION 'checkout configured price patch: unexpected section %',v_index;
    END IF;
    v_definition := replace(v_definition,v_old[v_index],v_new[v_index]);
  END LOOP;
  EXECUTE v_definition;
END;
$patch$;
