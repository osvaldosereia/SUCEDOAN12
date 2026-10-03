-- Dona Antônia — Central de Atendimento
-- Fila v4: filtros operacionais RECENTE / PEDIDOS / CADASTRO.
-- PEDIDOS e CADASTRO consideram pedidos dos 3 dias de calendário em Cuiabá:
-- hoje + os 2 dias anteriores, a partir de 00:00 America/Cuiaba.

create or replace function public.ops2_admin_attendance_queue_v4(
  p_whatsapp_account_id uuid,
  p_limit integer default 50,
  p_search text default null,
  p_label_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_limit integer := least(50,greatest(1,coalesce(p_limit,50)));
  v_search text := nullif(btrim(coalesce(p_search,'')),'');
  v_account public.whatsapp_accounts%rowtype;
  v_rows jsonb;
  v_recent_from timestamptz := ((((now() at time zone 'America/Cuiaba')::date - 2)::timestamp) at time zone 'America/Cuiaba');
begin
  select wa.* into v_account
  from public.whatsapp_accounts wa
  where wa.id=p_whatsapp_account_id and wa.is_active=true;
  if not found then return jsonb_build_object('ok',false,'error','whatsapp_account_not_found'); end if;

  if p_label_id is not null and not exists(
    select 1 from public.attendance_labels_v1 l where l.id=p_label_id and l.is_active=true
  ) then
    return jsonb_build_object('ok',false,'error','attendance_label_not_found');
  end if;

  with queue_base as (
    select
      c.id as conversation_id,
      c.whatsapp_account_id,
      c.customer_id,
      coalesce(nullif(btrim(cu.name),''),public.canonical_whatsapp_e164_br_v2(c.wa_contact_e164),c.wa_contact_e164) as display_name,
      public.canonical_whatsapp_e164_br_v2(c.wa_contact_e164) as phone_e164,
      c.status,c.mode,c.stage,coalesce(c.human_required,false) as human_required,
      c.last_inbound_at,c.last_outbound_at,c.service_window_expires_at,
      coalesce(lm.message_at,c.created_at) as canonical_last_message_at,
      st.follow_up_at,
      coalesce(unread.unread_count,0)::integer as unread_count,
      lm.text_body as last_message_text,lm.message_type as last_message_type,lm.direction as last_message_direction,
      coalesce(lbl.labels,'[]'::jsonb) as labels,
      exists(
        select 1 from public.orders o
        where o.conversation_id=c.id or (c.customer_id is not null and o.customer_id=c.customer_id)
      ) as has_order,
      recent_order.recent_order_at,
      (recent_order.recent_order_at is not null) as has_recent_order,
      case
        when c.customer_id is null then true
        else coalesce((public.ops2_customer_registration_state_v1(c.customer_id)->>'registration_complete')::boolean,false) is not true
      end as registration_incomplete
    from public.conversations c
    left join public.customers cu on cu.id=c.customer_id
    left join public.attendance_conversation_state_v1 st on st.conversation_id=c.id
    left join lateral (
      select count(*)::integer as unread_count from public.whatsapp_messages_v1 m
      where m.conversation_id=c.id and m.whatsapp_account_id=c.whatsapp_account_id and m.direction='inbound'
        and coalesce(m.received_at,m.sent_at,m.created_at)>coalesce(st.last_read_at,'epoch'::timestamptz)
    ) unread on true
    left join lateral (
      select m.text_body,m.message_type,m.direction,coalesce(m.received_at,m.sent_at,m.created_at) as message_at
      from public.whatsapp_messages_v1 m
      where m.conversation_id=c.id and m.whatsapp_account_id=c.whatsapp_account_id
      order by coalesce(m.received_at,m.sent_at,m.created_at) desc,m.created_at desc,m.id desc limit 1
    ) lm on true
    left join lateral (
      select jsonb_agg(
        jsonb_build_object('id',l.id,'name',l.name,'color',l.color,'sort_order',l.sort_order)
        order by l.sort_order,l.name
      ) as labels
      from public.attendance_conversation_labels_v1 cl
      join public.attendance_labels_v1 l on l.id=cl.label_id and l.is_active=true
      where cl.conversation_id=c.id
    ) lbl on true
    left join lateral (
      select max(o.created_at) as recent_order_at
      from public.orders o
      where (o.conversation_id=c.id or (c.customer_id is not null and o.customer_id=c.customer_id))
        and o.created_at >= v_recent_from
    ) recent_order on true
    where c.whatsapp_account_id=p_whatsapp_account_id
      and (
        v_search is null
        or coalesce(cu.name,'') ilike '%'||v_search||'%'
        or coalesce(public.canonical_whatsapp_e164_br_v2(c.wa_contact_e164),c.wa_contact_e164,'') ilike '%'||v_search||'%'
      )
      and (
        p_label_id is null
        or exists(
          select 1 from public.attendance_conversation_labels_v1 f
          where f.conversation_id=c.id and f.label_id=p_label_id
        )
      )
  ), limited as (
    select q.* from queue_base q
    order by q.canonical_last_message_at desc,q.conversation_id
    limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'conversation_id',q.conversation_id,
    'whatsapp_account_id',q.whatsapp_account_id,
    'customer_id',q.customer_id,
    'display_name',q.display_name,
    'phone_e164',q.phone_e164,
    'status',q.status,
    'mode',q.mode,
    'stage',q.stage,
    'human_required',q.human_required,
    'unread_count',q.unread_count,
    'last_message_text',q.last_message_text,
    'last_message_type',q.last_message_type,
    'last_message_direction',q.last_message_direction,
    'last_message_at',q.canonical_last_message_at,
    'canonical_last_message_at',q.canonical_last_message_at,
    'last_activity_at',q.canonical_last_message_at,
    'last_inbound_at',q.last_inbound_at,
    'last_outbound_at',q.last_outbound_at,
    'service_window_expires_at',q.service_window_expires_at,
    'follow_up_at',q.follow_up_at,
    'has_order',q.has_order,
    'has_recent_order',q.has_recent_order,
    'recent_order_at',q.recent_order_at,
    'registration_incomplete',q.registration_incomplete,
    'labels',q.labels
  ) order by q.canonical_last_message_at desc,q.conversation_id),'[]'::jsonb)
  into v_rows from limited q;

  return jsonb_build_object(
    'ok',true,
    'account',jsonb_build_object('id',v_account.id,'slug',v_account.slug,'display_name',v_account.display_name,'phone_e164',v_account.phone_e164),
    'limit',v_limit,
    'label_id',p_label_id,
    'recent_from',v_recent_from,
    'items',v_rows
  );
end;
$$;

revoke all on function public.ops2_admin_attendance_queue_v4(uuid,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.ops2_admin_attendance_queue_v4(uuid,integer,text,uuid) to service_role;
