begin;

create or replace function public.execute_papoai_commerce_command_v1(
  p_conversation_id uuid,
  p_command jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_cfg public.papoai_commerce_brain_config%rowtype;
  v_type text:=lower(trim(coalesce(p_command->>'type','')));
  v_result jsonb;
begin
  select * into v_cfg from public.papoai_commerce_brain_config where id=1;
  if not coalesce(v_cfg.enabled,false) then raise exception 'papoai_commerce_brain_disabled'; end if;

  case v_type
    when 'list_baskets' then
      if not v_cfg.basket_reads_enabled then raise exception 'basket_reads_disabled'; end if;
      v_result:=jsonb_build_object('ok',true,'baskets',public.get_papoai_commerce_basket_catalog_v1());

    when 'basket_detail' then
      if not v_cfg.basket_reads_enabled then raise exception 'basket_reads_disabled'; end if;
      v_result:=public.format_papoai_commerce_basket_message_v1(p_command->>'basket');

    when 'customer_context' then
      v_result:=public.get_papoai_commerce_customer_snapshot_v2(p_conversation_id);

    when 'repeat_preview' then
      v_result:=public.preview_papoai_commerce_repeat_last_purchase_v1(p_conversation_id);

    when 'repeat_last_purchase' then
      if not coalesce(v_cfg.write_enabled,false) then raise exception 'papoai_commerce_write_disabled'; end if;
      v_result:=public.propose_papoai_commerce_repeat_last_purchase_v1(p_conversation_id);

    when 'search_products' then
      v_result:=public.search_papoai_commerce_products_v1(
        p_command->>'query',nullif(p_command->>'limit','')::integer
      );

    when 'offers' then
      v_result:=public.get_papoai_commerce_offers_v1(
        p_conversation_id,coalesce(nullif(p_command->>'limit','')::integer,4)
      );

    when 'cart_state' then
      v_result:=public.get_papoai_commerce_cart_state_v1(p_conversation_id);

    when 'cart_summary' then
      v_result:=public.format_papoai_commerce_cart_summary_v1(p_conversation_id);

    when 'checkout_readiness' then
      v_result:=public.get_papoai_commerce_checkout_readiness_v1(p_conversation_id);

    when 'prepare_order_confirmation' then
      if not coalesce(v_cfg.write_enabled,false) then raise exception 'papoai_commerce_write_disabled'; end if;
      v_result:=public.prepare_papoai_commerce_order_confirmation_v1(
        p_conversation_id,p_command->>'payment_method'
      );

    when 'pending_action' then
      v_result:=public.get_papoai_commerce_pending_action_v1(p_conversation_id);

    when 'confirm_pending' then
      if not coalesce(v_cfg.write_enabled,false) then raise exception 'papoai_commerce_write_disabled'; end if;
      v_result:=public.confirm_papoai_commerce_pending_action_v1(
        p_conversation_id,coalesce((p_command->>'confirm')::boolean,true)
      );

    when 'start_basket' then
      v_result:=public.start_papoai_commerce_basket_v1(p_conversation_id,p_command->>'basket');

    when 'set_basket_quantity' then
      if coalesce(p_command->>'product_id','')<>'' then
        v_result:=public.set_papoai_commerce_basket_quantity_v1(
          p_conversation_id,(p_command->>'product_id')::uuid,(p_command->>'quantity')::numeric
        );
      else
        v_result:=public.set_papoai_commerce_basket_quantity_by_query_v1(
          p_conversation_id,p_command->>'source_query',(p_command->>'quantity')::numeric
        );
      end if;

    when 'set_addon_quantity' then
      if coalesce(p_command->>'product_id','')<>'' then
        v_result:=public.set_papoai_commerce_addon_quantity_v1(
          p_conversation_id,(p_command->>'product_id')::uuid,(p_command->>'quantity')::numeric
        );
      else
        v_result:=public.set_papoai_commerce_addon_by_query_v1(
          p_conversation_id,p_command->>'query',(p_command->>'quantity')::numeric
        );
      end if;

    when 'replacement_candidates' then
      v_result:=public.resolve_papoai_commerce_replacement_candidates_v1(
        p_conversation_id,p_command->>'source_query',p_command->>'replacement_query',
        coalesce(nullif(p_command->>'limit','')::integer,5)
      );

    when 'propose_replacement' then
      if not coalesce(v_cfg.write_enabled,false) then raise exception 'papoai_commerce_write_disabled'; end if;
      v_result:=public.propose_papoai_commerce_replacement_v1(
        p_conversation_id,p_command->>'source_query',p_command->>'replacement_query'
      );

    when 'replace_basket_item' then
      v_result:=public.replace_papoai_commerce_basket_item_v2(
        p_conversation_id,
        (p_command->>'source_product_id')::uuid,
        (p_command->>'replacement_product_id')::uuid,
        coalesce((p_command->>'customer_confirmed')::boolean,false)
      );

    when 'queue_bling' then
      v_result:=public.queue_papoai_commerce_bling_v1((p_command->>'order_id')::uuid);

    else
      raise exception 'unsupported_commerce_command:%',v_type;
  end case;

  insert into public.papoai_commerce_command_audit(conversation_id,command_type,command,outcome,result_summary)
  values(
    p_conversation_id,v_type,coalesce(p_command,'{}'::jsonb),'ok',
    jsonb_build_object(
      'ok',coalesce((v_result->>'ok')::boolean,true),
      'available',v_result->>'available',
      'ready',v_result->>'ready',
      'found',v_result->>'found',
      'order_id',v_result->>'order_id',
      'needs_clarification',v_result->>'needs_clarification'
    )
  );

  return v_result;
exception when others then
  begin
    insert into public.papoai_commerce_command_audit(conversation_id,command_type,command,outcome,result_summary)
    values(
      p_conversation_id,coalesce(nullif(v_type,''),'unknown'),coalesce(p_command,'{}'::jsonb),'error',
      jsonb_build_object('error',sqlerrm)
    );
  exception when others then null;
  end;
  raise;
end;
$$;

revoke all on function public.execute_papoai_commerce_command_v1(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.execute_papoai_commerce_command_v1(uuid,jsonb) to service_role;

commit;
