create or replace function public.ops2_link_papoai_capture_order_v1(p_capture_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.papoai_webhook_inbox_v2%rowtype;
  v_content text;
  v_suffix text;
  v_conversation_id uuid;
  v_customer_id uuid;
  v_account_id uuid;
  v_phone text;
  v_order public.orders%rowtype;
  v_count integer:=0;
  v_reason text:=null;
begin
  select * into v_row
  from public.papoai_webhook_inbox_v2
  where id=p_capture_id
  for update;

  if not found then return jsonb_build_object('ok',false,'error','capture_not_found'); end if;
  if coalesce(v_row.event_name,'')<>'message.received' then
    return jsonb_build_object('ok',true,'linked',false,'reason','not_inbound_message');
  end if;

  begin v_conversation_id:=nullif(v_row.metadata->>'conversation_id','')::uuid; exception when others then v_conversation_id:=null; end;
  begin v_customer_id:=nullif(v_row.metadata->>'customer_id','')::uuid; exception when others then v_customer_id:=null; end;
  begin v_account_id:=nullif(v_row.metadata->>'whatsapp_account_id','')::uuid; exception when others then v_account_id:=null; end;
  v_phone:=public.canonical_whatsapp_e164_br_v2(coalesce(v_row.metadata->>'canonical_phone_e164',v_row.phone_candidate));

  if v_conversation_id is null then
    return jsonb_build_object('ok',true,'linked',false,'reason','conversation_not_linked');
  end if;

  v_content:=coalesce(
    v_row.payload#>>'{data,message,content}',
    v_row.payload#>>'{data,message,text}',
    v_row.payload#>>'{data,message,body}',
    ''
  );
  select upper((regexp_match(v_content,'NUMERO:[[:space:]]*([A-Fa-f0-9]{8})'))[1]) into v_suffix;

  if v_suffix is not null then
    select count(*) into v_count
    from public.orders o
    where o.source in ('vitrine','storefront_v2')
      and upper(right(coalesce(o.order_number,''),8))=v_suffix
      and o.created_at between v_row.received_at-interval '12 hours' and v_row.received_at+interval '30 minutes'
      and (v_customer_id is null or o.customer_id is null or o.customer_id=v_customer_id)
      and (v_phone is null or public.normalize_phone_digits(o.phone_e164)=any(public.phone_variants_br(v_phone)));

    if v_count=1 then
      select * into v_order
      from public.orders o
      where o.source in ('vitrine','storefront_v2')
        and upper(right(coalesce(o.order_number,''),8))=v_suffix
        and o.created_at between v_row.received_at-interval '12 hours' and v_row.received_at+interval '30 minutes'
        and (v_customer_id is null or o.customer_id is null or o.customer_id=v_customer_id)
        and (v_phone is null or public.normalize_phone_digits(o.phone_e164)=any(public.phone_variants_br(v_phone)))
      order by o.created_at desc
      limit 1
      for update;
      v_reason:='order_number_exact';
    elsif v_count>1 then
      return jsonb_build_object('ok',true,'linked',false,'reason','order_number_ambiguous','suffix',v_suffix,'matches',v_count);
    end if;
  end if;

  if v_order.id is null then
    select count(*) into v_count
    from public.orders o
    where o.source in ('vitrine','storefront_v2')
      and o.conversation_id is null
      and o.created_at between v_row.received_at-interval '6 hours' and v_row.received_at+interval '30 minutes'
      and (
        (v_customer_id is not null and o.customer_id=v_customer_id)
        or (v_phone is not null and public.normalize_phone_digits(o.phone_e164)=any(public.phone_variants_br(v_phone)))
      );

    if v_count=1 then
      select * into v_order
      from public.orders o
      where o.source in ('vitrine','storefront_v2')
        and o.conversation_id is null
        and o.created_at between v_row.received_at-interval '6 hours' and v_row.received_at+interval '30 minutes'
        and (
          (v_customer_id is not null and o.customer_id=v_customer_id)
          or (v_phone is not null and public.normalize_phone_digits(o.phone_e164)=any(public.phone_variants_br(v_phone)))
        )
      order by o.created_at desc
      limit 1
      for update;
      v_reason:='single_recent_customer_order';
    elsif v_count>1 then
      return jsonb_build_object('ok',true,'linked',false,'reason','recent_order_ambiguous','matches',v_count);
    else
      return jsonb_build_object('ok',true,'linked',false,'reason',case when v_suffix is null then 'order_marker_missing_no_fallback' else 'order_not_found' end,'suffix',v_suffix);
    end if;
  end if;

  if v_order.conversation_id is not null and v_order.conversation_id<>v_conversation_id then
    return jsonb_build_object('ok',true,'linked',false,'reason','order_already_linked_elsewhere','order_id',v_order.id,'order_number',v_order.order_number);
  end if;

  update public.orders
     set conversation_id=v_conversation_id,
         whatsapp_account_id=coalesce(whatsapp_account_id,v_account_id),
         customer_id=coalesce(customer_id,v_customer_id),
         checkout_snapshot=coalesce(checkout_snapshot,'{}'::jsonb)
           || jsonb_strip_nulls(jsonb_build_object(
             'papoai_order_linked',true,
             'papoai_order_link_reason',v_reason,
             'papoai_capture_id',p_capture_id,
             'papoai_order_linked_at',now()
           )),
         updated_at=now()
   where id=v_order.id;

  update public.papoai_webhook_inbox_v2
     set metadata=coalesce(metadata,'{}'::jsonb)
       || jsonb_build_object(
         'order_id',v_order.id,
         'order_number',v_order.order_number,
         'order_linked',true,
         'order_link_reason',v_reason
       )
   where id=p_capture_id;

  return jsonb_build_object('ok',true,'linked',true,'order_id',v_order.id,'order_number',v_order.order_number,'conversation_id',v_conversation_id,'reason',v_reason);
end;
$$;

revoke all on function public.ops2_link_papoai_capture_order_v1(uuid) from public,anon,authenticated;
grant execute on function public.ops2_link_papoai_capture_order_v1(uuid) to service_role;

create or replace function public.ops2_papoai_capture_order_link_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.event_name='message.received'
     and nullif(new.metadata->>'conversation_id','') is not null
     and (old.metadata->>'conversation_id') is distinct from (new.metadata->>'conversation_id') then
    perform public.ops2_link_papoai_capture_order_v1(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.ops2_papoai_capture_order_link_trigger_v1() from public,anon,authenticated;

drop trigger if exists trg_ops2_papoai_capture_order_link_v1 on public.papoai_webhook_inbox_v2;
create trigger trg_ops2_papoai_capture_order_link_v1
after update of metadata on public.papoai_webhook_inbox_v2
for each row execute function public.ops2_papoai_capture_order_link_trigger_v1();

do $$
declare r record;
begin
  for r in
    select id
    from public.papoai_webhook_inbox_v2
    where event_name='message.received'
      and received_at>=now()-interval '31 days'
      and nullif(metadata->>'conversation_id','') is not null
      and coalesce(payload#>>'{data,message,content}',payload#>>'{data,message,text}',payload#>>'{data,message,body}','') ~* 'NUMERO:[[:space:]]*[A-F0-9]{8}'
    order by received_at
  loop
    perform public.ops2_link_papoai_capture_order_v1(r.id);
  end loop;
end $$;