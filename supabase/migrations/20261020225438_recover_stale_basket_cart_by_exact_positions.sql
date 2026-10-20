do $patch$
declare
 v_target regprocedure := 'public.create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)'::regprocedure;
 v_def text;
 v_old text := $old$      if not found then raise exception 'basket_mold_unavailable'; end if;$old$;
 v_new text := $new$      if not found then
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
      end if;$new$;
begin
 select pg_get_functiondef(v_target) into v_def;
 if strpos(v_def,'Recover saved carts only from an exact')>0 then return; end if;
 if length(v_def)-length(replace(v_def,v_old,''))<>length(v_old) then
   raise exception 'checkout_recovery_patch_target_mismatch';
 end if;
 execute replace(v_def,v_old,v_new);
end $patch$;