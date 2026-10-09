-- R02+ READ-ONLY export of CANONICAL ops2_init_order_separation_v2.
-- SHA of definition MD5: 0155201ff36ac1e6d3f5bdf6022512e7
-- Source: ssbesxgaijknwsjbsbcz, read-only pg_get_functiondef.
-- TEST ONLY, never apply this file to production.
CREATE OR REPLACE FUNCTION public.ops2_init_order_separation_v2(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order public.orders%rowtype;
  v_inserted integer:=0;
  v_count integer:=0;
begin
  if p_order_id is null then return jsonb_build_object('ok',false,'error','invalid_order_id'); end if;
  select * into v_order from public.orders where id=p_order_id;
  if not found then return jsonb_build_object('ok',false,'error','order_not_found'); end if;
  if v_order.status not in ('confirmed','processing') then
    return jsonb_build_object('ok',false,'error','order_not_in_separation','status',v_order.status);
  end if;
  if exists(select 1 from public.order_separation_completions_v1 where order_id=p_order_id) then
    select count(*) into v_count
    from public.order_separation_items_v1 s
    join public.order_items oi on oi.id=s.order_item_id
    where s.order_id=p_order_id
      and not (
        coalesce(oi.metadata->>'history_kind','') in ('basket','basket_mold')
        and exists(
          select 1 from public.order_items c
          where c.order_id=p_order_id
            and coalesce(c.metadata->>'history_kind','') in ('basket_component','basket_mold_component')
            and (
              (
                nullif(oi.metadata->>'basket_id','') is not null
                and nullif(c.metadata->>'basket_id','')=nullif(oi.metadata->>'basket_id','')
              )
              or lower(trim(coalesce(nullif(c.metadata->>'basket_name',''),nullif(c.metadata->>'parent_basket_name',''),'')))
                 = lower(trim(coalesce(nullif(oi.metadata->>'basket_name',''),oi.name_snapshot,'')))
            )
        )
      );
    return jsonb_build_object('ok',true,'status','already_completed','item_count',v_count,'order_updated_at',v_order.updated_at);
  end if;

  delete from public.order_separation_items_v1 s
  using public.order_items oi
  where s.order_id=p_order_id
    and s.order_item_id=oi.id
    and oi.order_id=p_order_id
    and coalesce(oi.metadata->>'history_kind','') in ('basket','basket_mold')
    and exists(
      select 1
      from public.order_items c
      where c.order_id=p_order_id
        and coalesce(c.metadata->>'history_kind','') in ('basket_component','basket_mold_component')
        and (
          (
            nullif(oi.metadata->>'basket_id','') is not null
            and nullif(c.metadata->>'basket_id','')=nullif(oi.metadata->>'basket_id','')
          )
          or lower(trim(coalesce(nullif(c.metadata->>'basket_name',''),nullif(c.metadata->>'parent_basket_name',''),'')))
             = lower(trim(coalesce(nullif(oi.metadata->>'basket_name',''),oi.name_snapshot,'')))
        )
    );

  insert into public.order_separation_items_v1(
    order_id,order_item_id,product_id,state,quantity,unit_price,line_total,created_at,updated_at
  )
  select oi.order_id,oi.id,oi.product_id,'pending',oi.quantity,oi.unit_price,oi.line_total,now(),now()
  from public.order_items oi
  where oi.order_id=p_order_id
    and oi.quantity>0
    and not (
      coalesce(oi.metadata->>'history_kind','') in ('basket','basket_mold')
      and exists(
        select 1
        from public.order_items c
        where c.order_id=p_order_id
          and coalesce(c.metadata->>'history_kind','') in ('basket_component','basket_mold_component')
          and (
            (
              nullif(oi.metadata->>'basket_id','') is not null
              and nullif(c.metadata->>'basket_id','')=nullif(oi.metadata->>'basket_id','')
            )
            or lower(trim(coalesce(nullif(c.metadata->>'basket_name',''),nullif(c.metadata->>'parent_basket_name',''),'')))
               = lower(trim(coalesce(nullif(oi.metadata->>'basket_name',''),oi.name_snapshot,'')))
          )
      )
    )
  on conflict (order_id,order_item_id) do update
    set product_id=excluded.product_id,
        quantity=excluded.quantity,
        unit_price=excluded.unit_price,
        line_total=excluded.line_total,
        updated_at=now()
    where public.order_separation_items_v1.state='pending'
      and not exists(
        select 1 from public.order_separation_completions_v1 c
        where c.order_id=public.order_separation_items_v1.order_id
      );

  get diagnostics v_inserted=row_count;
  select count(*) into v_count
  from public.order_separation_items_v1 s
  join public.order_items oi on oi.id=s.order_item_id
  where s.order_id=p_order_id
    and not (
      coalesce(oi.metadata->>'history_kind','') in ('basket','basket_mold')
      and exists(
        select 1 from public.order_items c
        where c.order_id=p_order_id
          and coalesce(c.metadata->>'history_kind','') in ('basket_component','basket_mold_component')
          and (
            (
              nullif(oi.metadata->>'basket_id','') is not null
              and nullif(c.metadata->>'basket_id','')=nullif(oi.metadata->>'basket_id','')
            )
            or lower(trim(coalesce(nullif(c.metadata->>'basket_name',''),nullif(c.metadata->>'parent_basket_name',''),'')))
               = lower(trim(coalesce(nullif(oi.metadata->>'basket_name',''),oi.name_snapshot,'')))
          )
      )
    );
  if v_count=0 and coalesce(jsonb_array_length(coalesce(v_order.checkout_snapshot->'separation_plan','[]'::jsonb)),0)=0 then
    return jsonb_build_object('ok',false,'error','order_has_no_items');
  end if;
  return jsonb_build_object('ok',true,'status','initialized','rows_touched',v_inserted,'item_count',v_count,'order_updated_at',v_order.updated_at);
end;
$function$
;
