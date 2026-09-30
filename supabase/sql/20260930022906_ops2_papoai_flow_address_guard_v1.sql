-- Applied to canonical Supabase 20260930022906
-- Dona Antônia Operations 2.0
create or replace function public.ops2_process_papoai_flow_capture_v2(p_capture_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r public.papoai_webhook_inbox_v2%rowtype;
  v_text text;
  v_token text;
  v_consent text;
  v_name text;
  v_doc text;
  v_address text;
  v_district text;
  v_city text;
  v_bridge jsonb;
  v_result jsonb;
  v_tmp text;
begin
  select * into r from public.papoai_webhook_inbox_v2 where id=p_capture_id for update;
  if not found then return jsonb_build_object('ok',false,'error','capture_not_found'); end if;

  v_text:=coalesce(r.payload#>>'{data,message,content}',r.payload#>>'{data,message,text}',r.payload#>>'{data,message,body}','');
  v_token:=public.ops2_papoai_flow_text_field_v1(v_text,'flow_token');
  if v_token is null then return jsonb_build_object('ok',true,'skipped',true,'reason','not_flow_text'); end if;

  v_consent:=lower(coalesce(public.ops2_papoai_flow_text_field_v1(v_text,'data_sharing_consent'),''));
  if v_consent not in ('true','1','yes','sim') then
    update public.papoai_webhook_inbox_v2
       set status='review_required',last_error='flow_consent_missing_or_false',
           processed_at=now(),
           metadata=coalesce(metadata,'{}'::jsonb)
             || jsonb_build_object('structured_mode','papoai_flow_text_v2','structured_processed',false)
     where id=p_capture_id;
    return jsonb_build_object('ok',false,'error','flow_consent_missing_or_false');
  end if;

  v_name:=public.ops2_papoai_flow_text_field_v1(v_text,'custom_5');
  v_doc:=public.ops2_papoai_flow_text_field_v1(v_text,'custom_3');
  v_address:=public.ops2_papoai_flow_text_field_v1(v_text,'custom_4');
  v_district:=public.ops2_papoai_flow_text_field_v1(v_text,'custom_1');
  v_city:=public.ops2_papoai_flow_text_field_v1(v_text,'custom_2');

  -- Some Flow responses occasionally place only the street type ("Rua") in custom_4
  -- and the actual address in custom_1. Preserve the user's richer text rather than
  -- storing a clearly incomplete street.
  if v_address is not null
     and length(btrim(v_address))<=10
     and lower(regexp_replace(btrim(v_address),'[. ]','','g')) in
       ('rua','r','avenida','av','travessa','tv','estrada','rodovia','alameda')
     and v_district is not null
     and (v_district ~ '[0-9]' or length(v_district)>20)
  then
    v_tmp:=v_address;
    v_address:=v_district;
    v_district:=null;
  end if;

  v_bridge:=public.papoai_ensure_conversation_v2(p_capture_id);
  if coalesce((v_bridge->>'ok')::boolean,false) is not true then
    update public.papoai_webhook_inbox_v2
       set status='review_required',last_error=coalesce(v_bridge->>'error','conversation_bridge_failed'),
           processed_at=now(),
           metadata=coalesce(metadata,'{}'::jsonb)
             || jsonb_build_object('structured_mode','papoai_flow_text_v2','structured_processed',false)
     where id=p_capture_id;
    return v_bridge||jsonb_build_object('flow_detected',true);
  end if;

  v_result:=public.ops2_apply_papoai_customer_flow_v2(
    v_token,r.phone_candidate,v_name,v_doc,v_address,v_district,v_city,'MT',
    coalesce(r.conversation_ref,v_bridge->>'conversation_id'),p_capture_id,v_token
  );

  update public.papoai_webhook_inbox_v2
     set status=case when coalesce((v_result->>'ok')::boolean,false) then 'processed' else 'review_required' end,
         last_error=case when coalesce((v_result->>'ok')::boolean,false) then null else coalesce(v_result->>'error','flow_processing_failed') end,
         processed_at=now(),
         metadata=coalesce(metadata,'{}'::jsonb)
           || jsonb_strip_nulls(jsonb_build_object(
             'structured_mode','papoai_flow_text_v2',
             'structured_processed',coalesce((v_result->>'ok')::boolean,false),
             'flow_token',v_token,'customer_id',v_result->>'customer_id',
             'conversation_id',coalesce(v_result->>'conversation_id',v_bridge->>'conversation_id'),
             'orders_linked',coalesce((v_result->>'orders_linked')::integer,0),
             'order_id',v_result->>'order_id','order_number',v_result->>'order_number',
             'document_valid',coalesce((v_result->>'document_valid')::boolean,false)
           ))
   where id=p_capture_id;

  return v_result||jsonb_build_object('flow_detected',true,'flow_token',v_token);
end;
$$;
revoke all on function public.ops2_process_papoai_flow_capture_v2(uuid) from public,anon,authenticated;
grant execute on function public.ops2_process_papoai_flow_capture_v2(uuid) to service_role;
