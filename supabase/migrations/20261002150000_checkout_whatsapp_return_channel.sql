-- Retorna ao checkout o mesmo canal/número escolhido pela outbox da confirmação.
-- A outbox de cliente é criada sincronicamente pelo trigger do pedido antes do enriquecimento.

create or replace function public.ops2_enrich_storefront_order_result_v1(p_result jsonb)
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_result jsonb:=coalesce(p_result,'{}'::jsonb);
  v_order_id uuid;
  v_customer_id uuid;
  v_state jsonb;
  v_complete boolean:=false;
  v_flow_required boolean:=true;
  v_document_only_pending boolean:=false;
  v_missing jsonb:='[]'::jsonb;
  v_whatsapp_return_phone text;
  v_whatsapp_return_origin text;
begin
  begin
    v_order_id:=nullif(v_result->>'order_id','')::uuid;
  exception when others then
    v_order_id:=null;
  end;

  if v_order_id is not null then
    select customer_id into v_customer_id from public.orders where id=v_order_id;

    select q.channel_phone_e164,q.channel_origin
      into v_whatsapp_return_phone,v_whatsapp_return_origin
      from public.ops2_whatsapp_outbox_v1 q
     where q.order_id=v_order_id
       and q.recipient_kind='customer'
       and q.message_kind='order_received'
     order by q.created_at desc
     limit 1;
  end if;

  if v_customer_id is not null then
    v_state:=public.ops2_customer_registration_state_v1(v_customer_id);
    v_complete:=coalesce((v_state->>'registration_complete')::boolean,false);
    v_flow_required:=coalesce((v_state->>'flow_required')::boolean,true);
    v_document_only_pending:=coalesce((v_state->>'document_only_pending')::boolean,false);
    v_missing:=coalesce(v_state->'missing_fields','[]'::jsonb);
  else
    v_missing:='["customer"]'::jsonb;
  end if;

  return v_result || jsonb_build_object(
    'registration_complete',v_complete,
    'registration_state',case when v_complete then 'complete' else 'pending' end,
    'registration_missing_fields',v_missing,
    'flow_required',v_flow_required,
    'document_only_pending',v_document_only_pending,
    'whatsapp_return_phone',v_whatsapp_return_phone,
    'whatsapp_return_origin',v_whatsapp_return_origin
  );
end;
$$;
