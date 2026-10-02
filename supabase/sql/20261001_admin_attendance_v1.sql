-- Dona Antônia — Central de Atendimento: contrato canônico de leitura/estado
-- 2026-10-01
-- Primeira fase: leitura das filas/conversas/contexto e estado mínimo de leitura/retorno.
-- Não envia WhatsApp, não altera PapoAI, clientes, pedidos ou mensagens.

create table if not exists public.attendance_conversation_state_v1 (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  last_read_message_id uuid null references public.whatsapp_messages_v1(id) on delete set null,
  last_read_at timestamptz null,
  follow_up_at timestamptz null,
  updated_at timestamptz not null default now()
);

create index if not exists attendance_conversation_state_v1_follow_up_idx
  on public.attendance_conversation_state_v1(follow_up_at)
  where follow_up_at is not null;

alter table public.attendance_conversation_state_v1 enable row level security;

revoke all on table public.attendance_conversation_state_v1 from public;
revoke all on table public.attendance_conversation_state_v1 from anon;
revoke all on table public.attendance_conversation_state_v1 from authenticated;
grant select, insert, update, delete on table public.attendance_conversation_state_v1 to service_role;

create or replace function public.ops2_admin_attendance_queue_v1(
  p_whatsapp_account_id uuid,
  p_limit integer default 50,
  p_search text default null,
  p_filter text default 'all'
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_limit integer := least(50,greatest(1,coalesce(p_limit,50)));
  v_search text := nullif(btrim(coalesce(p_search,'')),'');
  v_filter text := case lower(btrim(coalesce(p_filter,'all')))
    when 'unread' then 'unread'
    when 'human' then 'human'
    else 'all'
  end;
  v_account public.whatsapp_accounts%rowtype;
  v_rows jsonb;
begin
  select wa.* into v_account
  from public.whatsapp_accounts wa
  where wa.id=p_whatsapp_account_id and wa.is_active=true;

  if not found then
    return jsonb_build_object('ok',false,'error','whatsapp_account_not_found');
  end if;

  with queue_base as (
    select
      c.id as conversation_id,
      c.whatsapp_account_id,
      c.customer_id,
      coalesce(nullif(btrim(cu.name),''),public.canonical_whatsapp_e164_br_v2(c.wa_contact_e164),c.wa_contact_e164) as display_name,
      public.canonical_whatsapp_e164_br_v2(c.wa_contact_e164) as phone_e164,
      c.status,
      c.mode,
      c.stage,
      coalesce(c.human_required,false) as human_required,
      c.last_inbound_at,
      c.last_outbound_at,
      c.service_window_expires_at,
      greatest(
        coalesce(lm.message_at,'epoch'::timestamptz),
        coalesce(c.last_inbound_at,'epoch'::timestamptz),
        coalesce(c.last_outbound_at,'epoch'::timestamptz),
        coalesce(c.created_at,'epoch'::timestamptz)
      ) as last_activity_at,
      coalesce(st.follow_up_at,null) as follow_up_at,
      coalesce(unread.unread_count,0)::integer as unread_count,
      lm.text_body as last_message_text,
      lm.message_type as last_message_type,
      lm.direction as last_message_direction,
      lm.message_at as last_message_at,
      exists(
        select 1 from public.orders o
        where o.conversation_id=c.id
           or (c.customer_id is not null and o.customer_id=c.customer_id)
      ) as has_order,
      case
        when c.customer_id is null then true
        else coalesce((public.ops2_customer_registration_state_v1(c.customer_id)->>'registration_complete')::boolean,false) is not true
      end as registration_incomplete
    from public.conversations c
    left join public.customers cu on cu.id=c.customer_id
    left join public.attendance_conversation_state_v1 st on st.conversation_id=c.id
    left join lateral (
      select count(*)::integer as unread_count
      from public.whatsapp_messages_v1 m
      where m.conversation_id=c.id
        and m.whatsapp_account_id=c.whatsapp_account_id
        and m.direction='inbound'
        and coalesce(m.received_at,m.sent_at,m.created_at) > coalesce(st.last_read_at,'epoch'::timestamptz)
    ) unread on true
    left join lateral (
      select
        m.text_body,
        m.message_type,
        m.direction,
        coalesce(m.received_at,m.sent_at,m.created_at) as message_at
      from public.whatsapp_messages_v1 m
      where m.conversation_id=c.id
        and m.whatsapp_account_id=c.whatsapp_account_id
      order by coalesce(m.received_at,m.sent_at,m.created_at) desc,m.created_at desc,m.id desc
      limit 1
    ) lm on true
    where c.whatsapp_account_id=p_whatsapp_account_id
      and (
        v_search is null
        or coalesce(cu.name,'') ilike '%'||v_search||'%'
        or coalesce(public.canonical_whatsapp_e164_br_v2(c.wa_contact_e164),c.wa_contact_e164,'') ilike '%'||v_search||'%'
      )
  ), filtered as (
    select q.*
    from queue_base q
    where v_filter='all'
       or (v_filter='unread' and q.unread_count>0)
       or (v_filter='human' and (q.human_required or q.mode in ('human','human_copilot') or q.status='needs_human'))
  ), limited as (
    select q.*
    from filtered q
    order by
      q.last_activity_at desc,
      q.conversation_id
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
    'last_message_at',q.last_message_at,
    'last_inbound_at',q.last_inbound_at,
    'last_outbound_at',q.last_outbound_at,
    'service_window_expires_at',q.service_window_expires_at,
    'last_activity_at',q.last_activity_at,
    'follow_up_at',q.follow_up_at,
    'has_order',q.has_order,
    'registration_incomplete',q.registration_incomplete
  ) order by
    q.last_activity_at desc,
    q.conversation_id
  ),'[]'::jsonb)
  into v_rows
  from limited q;

  return jsonb_build_object(
    'ok',true,
    'account',jsonb_build_object(
      'id',v_account.id,
      'slug',v_account.slug,
      'display_name',v_account.display_name,
      'phone_e164',v_account.phone_e164
    ),
    'filter',v_filter,
    'limit',v_limit,
    'items',v_rows
  );
end;
$$;

create or replace function public.ops2_admin_attendance_conversation_v1(
  p_conversation_id uuid,
  p_before timestamptz default null,
  p_limit integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_limit integer := least(50,greatest(1,coalesce(p_limit,30)));
  v_conversation public.conversations%rowtype;
  v_account public.whatsapp_accounts%rowtype;
  v_messages jsonb;
  v_oldest timestamptz;
begin
  select c.* into v_conversation
  from public.conversations c
  where c.id=p_conversation_id;

  if not found then
    return jsonb_build_object('ok',false,'error','conversation_not_found');
  end if;

  select wa.* into v_account
  from public.whatsapp_accounts wa
  where wa.id=v_conversation.whatsapp_account_id and wa.is_active=true;

  if not found then
    return jsonb_build_object('ok',false,'error','whatsapp_account_not_found');
  end if;

  with selected as (
    select
      m.id,
      m.conversation_id,
      m.whatsapp_account_id,
      m.customer_id,
      m.direction,
      m.message_type,
      m.provider,
      m.provider_message_id,
      m.reply_to_message_id,
      m.text_body,
      m.status_current,
      m.sender_kind,
      m.sender_ref,
      m.metadata,
      coalesce(m.received_at,m.sent_at,m.created_at) as message_at,
      m.created_at
    from public.whatsapp_messages_v1 m
    where m.conversation_id=p_conversation_id
      and m.whatsapp_account_id=v_conversation.whatsapp_account_id
      and (p_before is null or coalesce(m.received_at,m.sent_at,m.created_at)<p_before)
    order by coalesce(m.received_at,m.sent_at,m.created_at) desc,m.created_at desc,m.id desc
    limit v_limit
  ), chronological as (
    select * from selected
    order by message_at asc,created_at asc,id asc
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id',m.id,
      'conversation_id',m.conversation_id,
      'whatsapp_account_id',m.whatsapp_account_id,
      'customer_id',m.customer_id,
      'direction',m.direction,
      'message_type',m.message_type,
      'provider',m.provider,
      'provider_message_id',m.provider_message_id,
      'reply_to_message_id',m.reply_to_message_id,
      'text_body',m.text_body,
      'status_current',m.status_current,
      'sender_kind',m.sender_kind,
      'sender_ref',m.sender_ref,
      'message_at',m.message_at,
      'metadata',m.metadata
    ) order by m.message_at asc,m.created_at asc,m.id asc),'[]'::jsonb),
    min(m.message_at)
  into v_messages,v_oldest
  from chronological m;

  return jsonb_build_object(
    'ok',true,
    'conversation',jsonb_build_object(
      'id',v_conversation.id,
      'whatsapp_account_id',v_conversation.whatsapp_account_id,
      'customer_id',v_conversation.customer_id,
      'phone_e164',public.canonical_whatsapp_e164_br_v2(v_conversation.wa_contact_e164),
      'status',v_conversation.status,
      'stage',v_conversation.stage,
      'mode',v_conversation.mode,
      'human_required',coalesce(v_conversation.human_required,false),
      'last_inbound_at',v_conversation.last_inbound_at,
      'last_outbound_at',v_conversation.last_outbound_at,
      'service_window_expires_at',v_conversation.service_window_expires_at,
      'opened_at',v_conversation.opened_at
    ),
    'account',jsonb_build_object(
      'id',v_account.id,
      'slug',v_account.slug,
      'display_name',v_account.display_name,
      'phone_e164',v_account.phone_e164
    ),
    'limit',v_limit,
    'before',p_before,
    'next_before',v_oldest,
    'messages',v_messages
  );
end;
$$;

create or replace function public.ops2_admin_attendance_context_v1(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_conversation public.conversations%rowtype;
  v_customer public.customers%rowtype;
  v_address public.customer_addresses%rowtype;
  v_registration jsonb;
  v_orders jsonb := '[]'::jsonb;
  v_doc_digits text;
  v_doc_masked text;
begin
  select c.* into v_conversation
  from public.conversations c
  where c.id=p_conversation_id;

  if not found then
    return jsonb_build_object('ok',false,'error','conversation_not_found');
  end if;

  if v_conversation.customer_id is not null then
    select cu.* into v_customer
    from public.customers cu
    where cu.id=v_conversation.customer_id;

    if found then
      select a.* into v_address
      from public.customer_addresses a
      where a.customer_id=v_customer.id and a.is_active=true
      order by a.is_default desc,a.updated_at desc,a.created_at desc,a.id
      limit 1;

      v_registration:=public.ops2_customer_registration_state_v1(v_customer.id);
      v_doc_digits:=regexp_replace(coalesce(v_customer.cpf_cnpj,''),'\D','','g');
      if length(v_doc_digits)>=4 then
        v_doc_masked:=repeat('*',greatest(0,length(v_doc_digits)-4))||right(v_doc_digits,4);
      else
        v_doc_masked:=null;
      end if;

      with recent_orders as (
        select o.*
        from public.orders o
        where o.customer_id=v_customer.id
        order by coalesce(o.confirmed_at,o.created_at) desc,o.created_at desc,o.id desc
        limit 10
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',o.id,
        'order_number',o.order_number,
        'status',o.status,
        'total',o.total,
        'currency',btrim(o.currency),
        'source',o.source,
        'payment_method',o.payment_method,
        'confirmed_at',o.confirmed_at,
        'created_at',o.created_at,
        'items',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',oi.id,
            'product_id',oi.product_id,
            'name',oi.name_snapshot,
            'sku',oi.sku_snapshot,
            'quantity',oi.quantity,
            'unit_price',oi.unit_price,
            'line_total',oi.line_total
          ) order by oi.created_at,oi.id)
          from public.order_items oi
          where oi.order_id=o.id
        ),'[]'::jsonb)
      ) order by coalesce(o.confirmed_at,o.created_at) desc,o.created_at desc,o.id desc),'[]'::jsonb)
      into v_orders
      from recent_orders o;
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,
    'conversation',jsonb_build_object(
      'id',v_conversation.id,
      'whatsapp_account_id',v_conversation.whatsapp_account_id,
      'customer_id',v_conversation.customer_id,
      'phone_e164',public.canonical_whatsapp_e164_br_v2(v_conversation.wa_contact_e164),
      'status',v_conversation.status,
      'mode',v_conversation.mode,
      'human_required',coalesce(v_conversation.human_required,false),
      'last_inbound_at',v_conversation.last_inbound_at,
      'last_outbound_at',v_conversation.last_outbound_at,
      'service_window_expires_at',v_conversation.service_window_expires_at
    ),
    'customer',case when v_customer.id is null then null else jsonb_build_object(
      'id',v_customer.id,
      'name',v_customer.name,
      'phone_e164',public.canonical_whatsapp_e164_br_v2(v_customer.primary_whatsapp_e164),
      'masked_document',v_doc_masked,
      'marketing_opt_in',v_customer.marketing_opt_in,
      'marketing_consent_updated_at',v_customer.marketing_consent_updated_at,
      'last_order_at',v_customer.last_order_at,
      'order_count',coalesce(v_customer.order_count,0),
      'lifetime_value',coalesce(v_customer.lifetime_value,0),
      'preferred_reply',v_customer.preferred_reply
    ) end,
    'address',case when v_address.id is null then null else jsonb_build_object(
      'id',v_address.id,
      'label',v_address.label,
      'street',v_address.street,
      'number',v_address.number,
      'complement',v_address.complement,
      'neighborhood',v_address.neighborhood,
      'city',v_address.city,
      'state',v_address.state,
      'postal_code',v_address.postal_code,
      'reference',v_address.reference,
      'is_default',v_address.is_default
    ) end,
    'registration',v_registration,
    'orders',v_orders
  );
end;
$$;

create or replace function public.ops2_admin_attendance_mark_read_v1(
  p_conversation_id uuid,
  p_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_message_at timestamptz;
  v_last_read_at timestamptz;
begin
  select coalesce(m.received_at,m.sent_at,m.created_at)
    into v_message_at
  from public.whatsapp_messages_v1 m
  where m.id=p_message_id and m.conversation_id=p_conversation_id;

  if not found then
    return jsonb_build_object('ok',false,'error','message_not_in_conversation');
  end if;

  insert into public.attendance_conversation_state_v1(
    conversation_id,last_read_message_id,last_read_at,updated_at
  ) values (
    p_conversation_id,p_message_id,v_message_at,now()
  )
  on conflict (conversation_id) do update set
    last_read_message_id=case
      when public.attendance_conversation_state_v1.last_read_at is null
        or excluded.last_read_at>=public.attendance_conversation_state_v1.last_read_at
      then excluded.last_read_message_id
      else public.attendance_conversation_state_v1.last_read_message_id
    end,
    last_read_at=greatest(
      coalesce(public.attendance_conversation_state_v1.last_read_at,'epoch'::timestamptz),
      excluded.last_read_at
    ),
    updated_at=now()
  returning last_read_at into v_last_read_at;

  return jsonb_build_object('ok',true,'conversation_id',p_conversation_id,'last_read_at',v_last_read_at);
end;
$$;

create or replace function public.ops2_admin_attendance_follow_up_v1(
  p_conversation_id uuid,
  p_follow_up_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_exists boolean;
begin
  select exists(select 1 from public.conversations c where c.id=p_conversation_id) into v_exists;
  if not v_exists then
    return jsonb_build_object('ok',false,'error','conversation_not_found');
  end if;

  if p_follow_up_at is not null and p_follow_up_at<=now() then
    return jsonb_build_object('ok',false,'error','follow_up_must_be_future');
  end if;

  insert into public.attendance_conversation_state_v1(conversation_id,follow_up_at,updated_at)
  values(p_conversation_id,p_follow_up_at,now())
  on conflict(conversation_id) do update set
    follow_up_at=excluded.follow_up_at,
    updated_at=now();

  return jsonb_build_object('ok',true,'conversation_id',p_conversation_id,'follow_up_at',p_follow_up_at);
end;
$$;

revoke all on function public.ops2_admin_attendance_queue_v1(uuid,integer,text,text) from public;
revoke all on function public.ops2_admin_attendance_queue_v1(uuid,integer,text,text) from anon;
revoke all on function public.ops2_admin_attendance_queue_v1(uuid,integer,text,text) from authenticated;
grant execute on function public.ops2_admin_attendance_queue_v1(uuid,integer,text,text) to service_role;

revoke all on function public.ops2_admin_attendance_conversation_v1(uuid,timestamptz,integer) from public;
revoke all on function public.ops2_admin_attendance_conversation_v1(uuid,timestamptz,integer) from anon;
revoke all on function public.ops2_admin_attendance_conversation_v1(uuid,timestamptz,integer) from authenticated;
grant execute on function public.ops2_admin_attendance_conversation_v1(uuid,timestamptz,integer) to service_role;

revoke all on function public.ops2_admin_attendance_context_v1(uuid) from public;
revoke all on function public.ops2_admin_attendance_context_v1(uuid) from anon;
revoke all on function public.ops2_admin_attendance_context_v1(uuid) from authenticated;
grant execute on function public.ops2_admin_attendance_context_v1(uuid) to service_role;

revoke all on function public.ops2_admin_attendance_mark_read_v1(uuid,uuid) from public;
revoke all on function public.ops2_admin_attendance_mark_read_v1(uuid,uuid) from anon;
revoke all on function public.ops2_admin_attendance_mark_read_v1(uuid,uuid) from authenticated;
grant execute on function public.ops2_admin_attendance_mark_read_v1(uuid,uuid) to service_role;

revoke all on function public.ops2_admin_attendance_follow_up_v1(uuid,timestamptz) from public;
revoke all on function public.ops2_admin_attendance_follow_up_v1(uuid,timestamptz) from anon;
revoke all on function public.ops2_admin_attendance_follow_up_v1(uuid,timestamptz) from authenticated;
grant execute on function public.ops2_admin_attendance_follow_up_v1(uuid,timestamptz) to service_role;
