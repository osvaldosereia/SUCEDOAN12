-- Claim determinístico da outbox para o clique manual do Admin.
create or replace function public.ops2_claim_order_whatsapp_outbox_v1(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_item public.ops2_whatsapp_outbox_v1%rowtype;
begin
  if p_order_id is null then
    return jsonb_build_object('ok',false,'error','order_id_required');
  end if;

  update public.ops2_whatsapp_outbox_v1
     set status='retry',locked_at=null,updated_at=now(),last_error=coalesce(last_error,'stale_sending_recovered')
   where order_id=p_order_id
     and status='sending'
     and locked_at<now()-interval '15 minutes'
     and attempt_count<5;

  with next_item as (
    select q.id
    from public.ops2_whatsapp_outbox_v1 q
    where q.order_id=p_order_id
      and q.status in ('pending','retry')
      and q.delivery_mode='utility_template'
      and q.available_at<=now()
      and q.attempt_count<5
    order by case q.recipient_kind when 'customer' then 0 else 1 end,q.created_at
    for update skip locked
    limit 1
  )
  update public.ops2_whatsapp_outbox_v1 q
     set status='sending',attempt_count=q.attempt_count+1,locked_at=now(),updated_at=now(),last_error=null
    from next_item n
   where q.id=n.id
  returning q.* into v_item;

  if not found then
    return jsonb_build_object('ok',true,'found',false);
  end if;
  return jsonb_build_object('ok',true,'found',true,'item',to_jsonb(v_item));
end;
$$;

revoke all on function public.ops2_claim_order_whatsapp_outbox_v1(uuid) from public,anon,authenticated;
grant execute on function public.ops2_claim_order_whatsapp_outbox_v1(uuid) to service_role;
