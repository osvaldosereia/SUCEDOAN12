-- Checkout WhatsApp: PapoAI HTTP acceptance is not Meta send confirmation.
-- A row is accepted after the PapoAI webhook queues it and becomes sent only
-- after a canonical outbound message.sent with a real wamid is captured.

alter table public.ops2_whatsapp_outbox_v1
  drop constraint if exists ops2_whatsapp_outbox_v1_status_check;

alter table public.ops2_whatsapp_outbox_v1
  add constraint ops2_whatsapp_outbox_v1_status_check
  check (status = any(array['pending'::text,'sending'::text,'accepted'::text,'sent'::text,'retry'::text,'failed'::text,'suppressed'::text]));

create or replace function public.ops2_finish_whatsapp_outbox_v1(
  p_outbox_id uuid,
  p_status text,
  p_external_message_id text default null::text,
  p_last_error text default null::text,
  p_retry_after_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text:=lower(coalesce(btrim(p_status),''));
  v_item public.ops2_whatsapp_outbox_v1%rowtype;
begin
  if p_outbox_id is null then
    return jsonb_build_object('ok',false,'error','outbox_id_required');
  end if;
  if v_status not in ('accepted','sent','retry','failed','suppressed') then
    return jsonb_build_object('ok',false,'error','invalid_finish_status');
  end if;
  if v_status='sent' and nullif(btrim(coalesce(p_external_message_id,'')),'') is null then
    return jsonb_build_object('ok',false,'error','sent_requires_external_message_id');
  end if;

  -- message.sent can win the race by a few milliseconds. In that case an
  -- asynchronous 202 acknowledgement must never downgrade real sent -> accepted.
  if v_status='accepted' then
    select * into v_item
    from public.ops2_whatsapp_outbox_v1
    where id=p_outbox_id;
    if found and v_item.status='sent' and nullif(btrim(coalesce(v_item.external_message_id,'')),'') is not null then
      return jsonb_build_object(
        'ok',true,
        'outbox_id',v_item.id,
        'status',v_item.status,
        'attempt_count',v_item.attempt_count,
        'external_message_id',v_item.external_message_id,
        'race_resolved',true
      );
    end if;
  end if;

  update public.ops2_whatsapp_outbox_v1
     set status=v_status,
         external_message_id=case when v_status='sent' then nullif(btrim(p_external_message_id),'') else external_message_id end,
         last_error=case when v_status in ('accepted','sent') then null else nullif(left(coalesce(p_last_error,''),500),'') end,
         sent_at=case when v_status='sent' then now() when v_status='accepted' then null else sent_at end,
         available_at=case when v_status='retry' then now()+make_interval(secs=>greatest(60,least(coalesce(p_retry_after_seconds,300),3600))) else available_at end,
         locked_at=null,
         updated_at=now()
   where id=p_outbox_id
     and status='sending'
  returning * into v_item;

  if not found then
    return jsonb_build_object('ok',false,'error','outbox_not_sending');
  end if;

  return jsonb_build_object(
    'ok',true,
    'outbox_id',v_item.id,
    'status',v_item.status,
    'attempt_count',v_item.attempt_count,
    'external_message_id',v_item.external_message_id
  );
end;
$function$;

revoke all on function public.ops2_finish_whatsapp_outbox_v1(uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.ops2_finish_whatsapp_outbox_v1(uuid,text,text,text,integer) to service_role;

create or replace function public.ops2_reconcile_order_whatsapp_sent_v1()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_order_number text;
  v_order_id uuid;
begin
  if new.direction is distinct from 'outbound'
     or new.provider is distinct from 'papoai'
     or new.provider_message_id is null
     or new.provider_message_id not like 'wamid.%' then
    return new;
  end if;

  v_order_number:=substring(coalesce(new.text_body,'') from '(DA-[0-9]{6}-[A-Z0-9]+)');
  if v_order_number is null then
    return new;
  end if;

  select o.id into v_order_id
  from public.orders o
  where o.order_number=v_order_number
  limit 1;

  if v_order_id is null then
    return new;
  end if;

  update public.ops2_whatsapp_outbox_v1 q
     set status='sent',
         external_message_id=new.provider_message_id,
         sent_at=coalesce(new.sent_at,new.created_at,now()),
         last_error=null,
         locked_at=null,
         payload=coalesce(q.payload,'{}'::jsonb)||jsonb_build_object(
           'delivery_confirmation',jsonb_build_object(
             'source','papoai_message.sent',
             'canonical_message_id',new.id,
             'confirmed_at',now()
           )
         ),
         updated_at=now()
   where q.order_id=v_order_id
     and q.recipient_kind='customer'
     and q.whatsapp_account_id=new.whatsapp_account_id
     and q.status in ('sending','accepted','sent')
     and (q.external_message_id is null or q.external_message_id=new.provider_message_id);

  return new;
end;
$function$;

revoke all on function public.ops2_reconcile_order_whatsapp_sent_v1() from public,anon,authenticated;

drop trigger if exists ops2_reconcile_order_whatsapp_sent_v1 on public.whatsapp_messages_v1;
create trigger ops2_reconcile_order_whatsapp_sent_v1
after insert or update of provider_message_id,text_body,status_current on public.whatsapp_messages_v1
for each row execute function public.ops2_reconcile_order_whatsapp_sent_v1();

-- Correct the optimistic historical state first. These rows were previously
-- called sent after the PapoAI endpoint returned success, even without wamid.
update public.ops2_whatsapp_outbox_v1 q
   set status='accepted',
       sent_at=null,
       last_error=null,
       payload=coalesce(q.payload,'{}'::jsonb)||jsonb_build_object(
         'delivery_state_migration',jsonb_build_object(
           'previous_status','sent',
           'reason','provider_ack_without_wamid',
           'migrated_at',now()
         )
       ),
       updated_at=now()
 where q.recipient_kind='customer'
   and q.status='sent'
   and q.external_message_id is null;

-- Recover historical confirmations when the canonical message.sent capture
-- safely matches channel, customer phone, order number/suffix and time window.
with candidates as (
  select
    q.id as outbox_id,
    m.provider_message_id,
    coalesce(m.sent_at,m.created_at) as confirmed_at,
    m.id as canonical_message_id,
    row_number() over(partition by q.id order by m.created_at asc,m.id asc) as rn
  from public.ops2_whatsapp_outbox_v1 q
  join public.orders o on o.id=q.order_id
  join public.conversations c
    on c.whatsapp_account_id=q.whatsapp_account_id
   and c.wa_contact_e164=q.phone_e164
  join public.whatsapp_messages_v1 m
    on m.conversation_id=c.id
   and m.whatsapp_account_id=q.whatsapp_account_id
   and m.direction='outbound'
   and m.provider='papoai'
   and m.provider_message_id like 'wamid.%'
   and m.created_at>=q.created_at-interval '2 minutes'
   and m.created_at<=q.created_at+interval '10 minutes'
   and (
     m.text_body ilike '%'||o.order_number||'%'
     or m.text_body ilike '%'||right(o.order_number,8)||'%'
   )
  where q.recipient_kind='customer'
    and q.status='accepted'
    and q.external_message_id is null
), chosen as (
  select * from candidates where rn=1
)
update public.ops2_whatsapp_outbox_v1 q
   set status='sent',
       external_message_id=c.provider_message_id,
       sent_at=c.confirmed_at,
       last_error=null,
       payload=coalesce(q.payload,'{}'::jsonb)||jsonb_build_object(
         'delivery_confirmation',jsonb_build_object(
           'source','historical_papoai_message.sent',
           'canonical_message_id',c.canonical_message_id,
           'confirmed_at',c.confirmed_at
         )
       ),
       updated_at=now()
  from chosen c
 where q.id=c.outbox_id;
