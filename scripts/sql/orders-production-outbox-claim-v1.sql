-- Snapshot of the active checkout WhatsApp outbox claim routine, obtained via pg_get_functiondef.
-- No production credentials or messages. Use ONLY in disposable CI PostgreSQL.
CREATE OR REPLACE FUNCTION public.ops2_claim_checkout_order_whatsapp_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_runtime_mode text;
  v_canary_order_id uuid;
  v_item public.ops2_whatsapp_outbox_v1%rowtype;
begin
  if p_order_id is null then return jsonb_build_object('ok',false,'error','order_id_required'); end if;

  select r.mode,r.canary_order_id into v_runtime_mode,v_canary_order_id
  from public.ops2_whatsapp_order_runtime_v1 r where r.id=1;
  v_runtime_mode:=coalesce(v_runtime_mode,'off');

  if v_runtime_mode='off' then
    return jsonb_build_object('ok',true,'found',false,'reason','runtime_off');
  end if;
  if v_runtime_mode='canary' and p_order_id is distinct from v_canary_order_id then
    return jsonb_build_object('ok',true,'found',false,'reason','not_canary_order');
  end if;

  update public.ops2_whatsapp_outbox_v1
     set status='retry',locked_at=null,updated_at=now(),last_error=coalesce(last_error,'stale_sending_recovered')
   where order_id=p_order_id and recipient_kind='customer'
     and status='sending' and locked_at<now()-interval '15 minutes' and attempt_count<5;

  with next_item as (
    select q.id from public.ops2_whatsapp_outbox_v1 q
    where q.order_id=p_order_id and q.recipient_kind='customer'
      and q.status in ('pending','retry') and q.delivery_mode='utility_template'
      and q.available_at<=now() and q.attempt_count<5
    order by q.available_at,q.created_at
    for update skip locked limit 1
  )
  update public.ops2_whatsapp_outbox_v1 q
     set status='sending',attempt_count=q.attempt_count+1,locked_at=now(),updated_at=now(),last_error=null
    from next_item n where q.id=n.id
  returning q.* into v_item;

  if not found then return jsonb_build_object('ok',true,'found',false); end if;
  return jsonb_build_object('ok',true,'found',true,'item',to_jsonb(v_item));
end;
$function$;
