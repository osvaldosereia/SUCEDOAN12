-- Follow-up to 21:50 migration: PostgreSQL does not support min(uuid).
CREATE OR REPLACE FUNCTION public.ops2_admin_attendance_reconcile_customer_v1(p_conversation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_conversation public.conversations%rowtype;
  v_resolution jsonb;
  v_customer_id uuid;
  v_phone text;
  v_order_customer_count integer;
  v_order_customer_id uuid;
begin
  if p_conversation_id is null then
    return jsonb_build_object('ok',false,'error','invalid_conversation_id');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('attendance-customer:'||p_conversation_id::text,0));

  select c.* into v_conversation
  from public.conversations c
  where c.id=p_conversation_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'error','conversation_not_found');
  end if;

  v_phone:=public.canonical_whatsapp_e164_br_v2(v_conversation.wa_contact_e164);
  if v_phone is null then
    return jsonb_build_object('ok',false,'error','invalid_phone','match_status','invalid');
  end if;

  if v_conversation.customer_id is not null then
    return jsonb_build_object(
      'ok',true,
      'match_status','linked',
      'linked',true,
      'changed',false,
      'customer_id',v_conversation.customer_id,
      'phone_e164',v_phone
    );
  end if;

  v_resolution:=public.resolve_customer_by_phone_v1(v_phone);

  if v_resolution->>'match_status'='ambiguous' then
    -- A conversation may have an explicit storefront order, which is stronger
    -- evidence than phone variants shared by multiple historical registrations.
    -- Never guess based solely on name, Bling presence, or completion level.
    select count(distinct o.customer_id), min(o.customer_id::text)::uuid
      into v_order_customer_count,v_order_customer_id
      from public.orders o
      join public.customers cu on cu.id=o.customer_id and cu.is_active=true
     where o.conversation_id=p_conversation_id
       and public.canonical_whatsapp_e164_br_v2(o.phone_e164)=v_phone
       and public.canonical_whatsapp_e164_br_v2(cu.primary_whatsapp_e164)=v_phone
       and o.customer_id in (
         select ids.customer_id
           from public.customer_ids_by_phone_variants_v1(v_phone) ids
       );
    if v_order_customer_count=1 then
      v_resolution:=jsonb_build_object('ok',true,'match_status','matched',
        'customer_id',v_order_customer_id,'reason','conversation_order_verified');
    else
      return jsonb_build_object(
        'ok',true,
        'match_status','ambiguous',
        'linked',false,
        'changed',false,
        'candidate_count',coalesce((v_resolution->>'candidate_count')::integer,0),
        'phone_e164',v_phone
      );
    end if;
  end if;

  if v_resolution->>'match_status'='none' then
    return jsonb_build_object(
      'ok',true,
      'match_status','none',
      'linked',false,
      'changed',false,
      'candidate_count',0,
      'phone_e164',v_phone
    );
  end if;

  if v_resolution->>'match_status'<>'matched' then
    return jsonb_build_object(
      'ok',false,
      'error',coalesce(v_resolution->>'error','customer_resolution_failed'),
      'match_status',coalesce(v_resolution->>'match_status','invalid'),
      'linked',false,
      'phone_e164',v_phone
    );
  end if;

  v_customer_id:=nullif(v_resolution->>'customer_id','')::uuid;
  if v_customer_id is null or not exists(select 1 from public.customers c where c.id=v_customer_id) then
    return jsonb_build_object('ok',false,'error','customer_resolution_failed','match_status','invalid');
  end if;

  update public.conversations
  set customer_id=v_customer_id,updated_at=now()
  where id=p_conversation_id and customer_id is null;

  update public.whatsapp_messages_v1
  set customer_id=v_customer_id
  where conversation_id=p_conversation_id and customer_id is null;

  return jsonb_build_object(
    'ok',true,
    'match_status','matched',
    'linked',true,
    'changed',true,
    'customer_id',v_customer_id,
    'phone_e164',v_phone
  );
end;
$function$;
