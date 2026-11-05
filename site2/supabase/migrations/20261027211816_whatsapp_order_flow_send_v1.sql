-- Local candidate only. This migration depends on the greenfield order-intake
-- foundation and has not been applied to the canonical Supabase project.

create unique index whatsapp_order_flow_binding_one_enabled_per_account_uidx
  on whatsapp_ordering_private.whatsapp_order_flow_bindings_v1 (whatsapp_account_id)
  where is_send_enabled;

create table whatsapp_ordering_private.whatsapp_flow_send_attempts_v1 (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  actor_id uuid not null,
  whatsapp_account_id uuid not null
    references public.whatsapp_accounts(id) on delete restrict,
  conversation_id uuid not null
    references public.conversations(id) on delete restrict,
  customer_id uuid
    references public.customers(id) on delete set null,
  basket_template_id uuid not null
    references public.basket_templates(id) on delete restrict,
  basket_mold_id uuid not null
    references public.basket_molds(id) on delete restrict,
  flow_binding_id uuid not null
    references whatsapp_ordering_private.whatsapp_order_flow_bindings_v1(id) on delete restrict,
  flow_session_id uuid
    references whatsapp_ordering_private.whatsapp_flow_sessions_v2(id) on delete set null,
  to_phone_e164 text not null
    check (to_phone_e164 ~ '^[+][1-9][0-9]{7,14}$'),
  meta_flow_id text not null
    check (meta_flow_id ~ '^[0-9]{6,32}$'),
  flow_json_version text not null
    check (length(btrim(flow_json_version)) between 1 and 16),
  flow_message_version text not null
    check (length(btrim(flow_message_version)) between 1 and 8),
  data_api_version text not null
    check (length(btrim(data_api_version)) between 1 and 32),
  flow_cta text not null
    check (length(btrim(flow_cta)) between 1 and 20),
  body_text text not null
    check (length(btrim(body_text)) between 1 and 1024),
  status text not null default 'preparing'
    check (status in ('preparing', 'sending', 'sent', 'failed', 'needs_review')),
  provider_message_id text,
  error_code text
    check (error_code is null or error_code ~ '^[a-z0-9_]{1,80}$'),
  claimed_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_flow_send_attempt_receipt_check
    check (status <> 'sent' or coalesce(provider_message_id, '') ~ '^wamid\.[A-Za-z0-9_=-]{10,240}$')
);

create index whatsapp_flow_send_attempt_conversation_recent_idx
  on whatsapp_ordering_private.whatsapp_flow_send_attempts_v1
    (conversation_id, created_at desc);

alter table whatsapp_ordering_private.whatsapp_flow_send_attempts_v1
  enable row level security;
revoke all on table whatsapp_ordering_private.whatsapp_flow_send_attempts_v1
  from public, anon, authenticated, service_role;

create function public.whatsapp_order_flow_send_prepare_admin_v1(
  p_idempotency_key uuid,
  p_conversation_id uuid,
  p_basket_template_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_access jsonb;
  v_existing whatsapp_ordering_private.whatsapp_flow_send_attempts_v1%rowtype;
  v_account public.whatsapp_accounts%rowtype;
  v_conversation public.conversations%rowtype;
  v_template public.basket_templates%rowtype;
  v_binding whatsapp_ordering_private.whatsapp_order_flow_bindings_v1%rowtype;
  v_mold_id uuid;
  v_mold_count integer;
  v_attempt whatsapp_ordering_private.whatsapp_flow_send_attempts_v1%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'admin_not_authorized');
  end if;
  v_access := public.ops2_admin_attendance_customer_access_v1(false);
  if coalesce((v_access ->> 'ok')::boolean, false) is distinct from true then
    return jsonb_build_object('ok', false, 'error', 'admin_not_authorized');
  end if;
  if p_idempotency_key is null or p_conversation_id is null or p_basket_template_id is null then
    return jsonb_build_object('ok', false, 'error', 'flow_send_request_invalid');
  end if;

  select * into v_existing
  from whatsapp_ordering_private.whatsapp_flow_send_attempts_v1 a
  where a.idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_existing.actor_id is distinct from auth.uid()
      or v_existing.conversation_id is distinct from p_conversation_id
      or v_existing.basket_template_id is distinct from p_basket_template_id then
      return jsonb_build_object('ok', false, 'error', 'admin_not_authorized');
    end if;
    if v_existing.status in ('preparing', 'sending')
      and v_existing.updated_at < now() - interval '3 minutes' then
      update whatsapp_ordering_private.whatsapp_flow_send_attempts_v1
      set status = 'needs_review', error_code = 'send_state_unresolved',
          finished_at = now(), updated_at = now()
      where id = v_existing.id;
      return jsonb_build_object(
        'ok', true, 'duplicate', true, 'attempt_id', v_existing.id,
        'status', 'needs_review', 'error_code', 'send_state_unresolved'
      );
    end if;
    return jsonb_build_object(
      'ok', true, 'duplicate', true, 'attempt_id', v_existing.id,
      'status', v_existing.status, 'error_code', v_existing.error_code
    );
  end if;

  update whatsapp_ordering_private.whatsapp_flow_send_attempts_v1
  set status = 'needs_review', error_code = 'send_state_unresolved',
      finished_at = now(), updated_at = now()
  where conversation_id = p_conversation_id
    and status in ('preparing', 'sending')
    and updated_at < now() - interval '3 minutes';
  if exists (
    select 1
    from whatsapp_ordering_private.whatsapp_flow_send_attempts_v1 a
    where a.conversation_id = p_conversation_id
      and a.status in ('preparing', 'sending', 'needs_review')
  ) then
    return jsonb_build_object('ok', false, 'error', 'flow_send_needs_review');
  end if;

  select * into v_conversation
  from public.conversations c
  where c.id = p_conversation_id
  for update;
  if not found or v_conversation.channel <> 'whatsapp'
      or v_conversation.whatsapp_account_id is null then
    return jsonb_build_object('ok', false, 'error', 'conversation_unavailable');
  end if;
  if v_conversation.wa_contact_e164 is null
      or v_conversation.wa_contact_e164 !~ '^[+][1-9][0-9]{7,14}$' then
    return jsonb_build_object('ok', false, 'error', 'flow_recipient_phone_unavailable');
  end if;
  if v_conversation.last_inbound_at is null
      or v_conversation.last_inbound_at <= now() - interval '24 hours' then
    return jsonb_build_object('ok', false, 'error', 'service_window_closed');
  end if;

  select * into v_account
  from public.whatsapp_accounts a
  where a.id = v_conversation.whatsapp_account_id
    and a.is_active
    and a.slug in ('dona-antonia-0975', 'dona-antonia-1018')
    and a.waba_id ~ '^[0-9]{6,32}$'
    and a.phone_number_id ~ '^[0-9]{6,32}$';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'flow_account_unavailable');
  end if;

  select * into v_template
  from public.basket_templates b
  where b.id = p_basket_template_id
    and b.is_active
    and b.is_whatsapp_active;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'basket_unavailable');
  end if;

  select count(*)::integer into v_mold_count
  from public.basket_molds m
  where m.basket_id = v_template.id;
  if v_mold_count <> 1 then
    return jsonb_build_object('ok', false, 'error', 'basket_mold_ambiguous');
  end if;
  select m.id into v_mold_id
  from public.basket_molds m
  where m.basket_id = v_template.id
  order by m.created_at, m.id
  limit 1;
  if exists (
    select 1
    from public.basket_mold_positions pos
    left join public.basket_mold_position_options opt on opt.position_id = pos.id
    left join public.products p on p.id = opt.product_id
    where pos.mold_id = v_mold_id
    group by pos.id
    having count(opt.product_id) filter (
      where p.is_active is true
        and p.is_whatsapp_active is true
        and p.image_url ~* '^https://'
        and case
          when p.is_offer is true and p.offer_price is not null then p.offer_price >= 0
          else p.price is not null and p.price >= 0
        end
    ) = 0
  ) then
    return jsonb_build_object('ok', false, 'error', 'basket_position_has_no_eligible_options');
  end if;

  select * into v_binding
  from whatsapp_ordering_private.whatsapp_order_flow_bindings_v1 b
  where b.whatsapp_account_id = v_account.id
    and b.flow_action = 'data_exchange'
    and upper(b.flow_status) = 'PUBLISHED'
    and b.is_verified
    and b.is_send_enabled
    and b.verified_at is not null
  limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'flow_binding_not_ready');
  end if;

  insert into whatsapp_ordering_private.whatsapp_flow_send_attempts_v1 (
    idempotency_key, actor_id, whatsapp_account_id, conversation_id,
    customer_id, basket_template_id, basket_mold_id, flow_binding_id,
    to_phone_e164, meta_flow_id, flow_json_version, flow_message_version,
    data_api_version, flow_cta, body_text
  ) values (
    p_idempotency_key, auth.uid(), v_account.id, v_conversation.id,
    v_conversation.customer_id, v_template.id, v_mold_id, v_binding.id,
    v_conversation.wa_contact_e164, v_binding.meta_flow_id,
    v_binding.flow_json_version, v_binding.flow_message_version,
    v_binding.data_api_version, v_binding.flow_cta, v_binding.body_text
  ) returning * into v_attempt;

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'attempt_id', v_attempt.id,
    'status', v_attempt.status,
    'whatsapp_account_id', v_account.id,
    'account_slug', v_account.slug,
    'meta_waba_id', v_account.waba_id,
    'meta_phone_number_id', v_account.phone_number_id,
    'basket_template_id', v_template.id,
    'basket_mold_id', v_mold_id,
    'conversation_id', v_conversation.id,
    'customer_id', v_conversation.customer_id,
    'sender_phone_e164', v_conversation.wa_contact_e164,
    'meta_flow_id', v_binding.meta_flow_id,
    'flow_json_version', v_binding.flow_json_version,
    'data_api_version', v_binding.data_api_version,
    'flow_message_version', v_binding.flow_message_version,
    'flow_cta', v_binding.flow_cta,
    'body_text', v_binding.body_text
  );
end;
$function$;

create function public.whatsapp_order_flow_send_mark_sending_v1(
  p_attempt_id uuid,
  p_session_id uuid,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_attempt whatsapp_ordering_private.whatsapp_flow_send_attempts_v1%rowtype;
  v_session whatsapp_ordering_private.whatsapp_flow_sessions_v2%rowtype;
  v_account public.whatsapp_accounts%rowtype;
  v_conversation public.conversations%rowtype;
begin
  if auth.role() is distinct from 'service_role' or auth.uid() is not null then
    return jsonb_build_object('ok', false, 'error', 'service_role_required');
  end if;
  if p_attempt_id is null or p_session_id is null
      or coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'flow_send_request_invalid');
  end if;
  select * into v_attempt
  from whatsapp_ordering_private.whatsapp_flow_send_attempts_v1 a
  where a.id = p_attempt_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'flow_send_attempt_not_found');
  end if;
  if v_attempt.status <> 'preparing' then
    return jsonb_build_object('ok', true, 'status', v_attempt.status, 'duplicate', true);
  end if;
  select * into v_session
  from whatsapp_ordering_private.whatsapp_flow_sessions_v2 s
  where s.id = p_session_id
    and s.token_hash = p_token_hash
    and s.revoked_at is null
    and s.expires_at > now()
    and s.whatsapp_account_id = v_attempt.whatsapp_account_id
    and s.conversation_id = v_attempt.conversation_id
    and s.customer_id is not distinct from v_attempt.customer_id
    and s.meta_flow_id = v_attempt.meta_flow_id
    and s.flow_schema_version = v_attempt.flow_json_version
    and s.basket_template_id = v_attempt.basket_template_id
    and s.basket_mold_id = v_attempt.basket_mold_id;
  if not found then
    update whatsapp_ordering_private.whatsapp_flow_send_attempts_v1
    set status = 'failed', error_code = 'flow_session_invalid',
        finished_at = now(), updated_at = now()
    where id = v_attempt.id;
    return jsonb_build_object('ok', false, 'error', 'flow_session_invalid');
  end if;
  select * into v_conversation
  from public.conversations c
  where c.id = v_attempt.conversation_id
    and c.whatsapp_account_id = v_attempt.whatsapp_account_id
    and c.wa_contact_e164 = v_attempt.to_phone_e164
    and c.last_inbound_at > now() - interval '24 hours'
  for update;
  if not found then
    update whatsapp_ordering_private.whatsapp_flow_send_attempts_v1
    set status = 'failed', error_code = 'service_window_closed',
        finished_at = now(), updated_at = now()
    where id = v_attempt.id;
    return jsonb_build_object('ok', false, 'error', 'service_window_closed');
  end if;
  select * into v_account
  from public.whatsapp_accounts a
  where a.id = v_attempt.whatsapp_account_id
    and a.is_active
    and a.slug in ('dona-antonia-0975', 'dona-antonia-1018')
    and a.waba_id = v_session.meta_waba_id
    and a.phone_number_id = v_session.meta_phone_number_id;
  if not found then
    update whatsapp_ordering_private.whatsapp_flow_send_attempts_v1
    set status = 'failed', error_code = 'flow_account_unavailable',
        finished_at = now(), updated_at = now()
    where id = v_attempt.id;
    return jsonb_build_object('ok', false, 'error', 'flow_account_unavailable');
  end if;
  if not exists (
    select 1 from whatsapp_ordering_private.whatsapp_order_flow_bindings_v1 b
    where b.id = v_attempt.flow_binding_id
      and b.whatsapp_account_id = v_attempt.whatsapp_account_id
      and b.meta_flow_id = v_attempt.meta_flow_id
      and b.flow_json_version = v_attempt.flow_json_version
      and b.data_api_version = v_attempt.data_api_version
      and b.flow_message_version = v_attempt.flow_message_version
      and b.flow_action = 'data_exchange'
      and upper(b.flow_status) = 'PUBLISHED'
      and b.is_verified and b.is_send_enabled and b.verified_at is not null
  ) then
    update whatsapp_ordering_private.whatsapp_flow_send_attempts_v1
    set status = 'failed', error_code = 'flow_binding_not_ready',
        finished_at = now(), updated_at = now()
    where id = v_attempt.id;
    return jsonb_build_object('ok', false, 'error', 'flow_binding_not_ready');
  end if;
  update whatsapp_ordering_private.whatsapp_flow_send_attempts_v1
  set status = 'sending', flow_session_id = v_session.id,
      claimed_at = now(), updated_at = now()
  where id = v_attempt.id;
  return jsonb_build_object(
    'ok', true, 'status', 'sending', 'attempt_id', v_attempt.id,
    'account_slug', v_account.slug,
    'meta_phone_number_id', v_account.phone_number_id,
    'to_phone_e164', v_attempt.to_phone_e164,
    'meta_flow_id', v_attempt.meta_flow_id,
    'flow_message_version', v_attempt.flow_message_version,
    'flow_cta', v_attempt.flow_cta,
    'body_text', v_attempt.body_text
  );
end;
$function$;

create function public.whatsapp_order_flow_send_finish_v1(
  p_attempt_id uuid,
  p_status text,
  p_provider_message_id text,
  p_error_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_attempt whatsapp_ordering_private.whatsapp_flow_send_attempts_v1%rowtype;
begin
  if auth.role() is distinct from 'service_role' or auth.uid() is not null then
    return jsonb_build_object('ok', false, 'error', 'service_role_required');
  end if;
  if p_attempt_id is null or p_status not in ('sent', 'failed', 'needs_review')
      or (p_error_code is not null and p_error_code !~ '^[a-z0-9_]{1,80}$')
      or (p_status = 'sent' and coalesce(p_provider_message_id, '') !~ '^wamid\.[A-Za-z0-9_=-]{10,240}$')
      or (p_status <> 'sent' and p_provider_message_id is not null) then
    return jsonb_build_object('ok', false, 'error', 'flow_send_receipt_invalid');
  end if;
  select * into v_attempt
  from whatsapp_ordering_private.whatsapp_flow_send_attempts_v1 a
  where a.id = p_attempt_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'flow_send_attempt_not_found');
  end if;
  if v_attempt.status in ('sent', 'failed', 'needs_review') then
    return jsonb_build_object('ok', true, 'status', v_attempt.status, 'duplicate', true);
  end if;
  if v_attempt.status <> 'sending'
      and not (v_attempt.status = 'preparing' and p_status = 'failed') then
    return jsonb_build_object('ok', false, 'error', 'flow_send_attempt_not_claimed');
  end if;
  update whatsapp_ordering_private.whatsapp_flow_send_attempts_v1
  set status = p_status,
      provider_message_id = p_provider_message_id,
      error_code = p_error_code,
      finished_at = now(), updated_at = now()
  where id = v_attempt.id;
  return jsonb_build_object('ok', true, 'status', p_status, 'attempt_id', v_attempt.id);
end;
$function$;

create function public.whatsapp_order_flow_send_admin_list_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_access jsonb;
  v_items jsonb;
  v_block_reason text;
  v_conversation public.conversations%rowtype;
  v_account public.whatsapp_accounts%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'admin_not_authorized');
  end if;
  v_access := public.ops2_admin_attendance_customer_access_v1(false);
  if coalesce((v_access ->> 'ok')::boolean, false) is distinct from true then
    return jsonb_build_object('ok', false, 'error', 'admin_not_authorized');
  end if;
  if p_conversation_id is null then
    return jsonb_build_object('ok', false, 'error', 'conversation_unavailable');
  end if;
  select * into v_conversation
  from public.conversations c
  where c.id = p_conversation_id and c.channel = 'whatsapp';
  if not found or v_conversation.whatsapp_account_id is null then
    v_block_reason := 'conversation_unavailable';
  elsif v_conversation.wa_contact_e164 is null
      or v_conversation.wa_contact_e164 !~ '^[+][1-9][0-9]{7,14}$' then
    v_block_reason := 'flow_recipient_phone_unavailable';
  elsif v_conversation.last_inbound_at is null
      or v_conversation.last_inbound_at <= now() - interval '24 hours' then
    v_block_reason := 'service_window_closed';
  else
    select * into v_account
    from public.whatsapp_accounts a
    where a.id = v_conversation.whatsapp_account_id
      and a.is_active and a.slug in ('dona-antonia-0975', 'dona-antonia-1018')
      and a.waba_id ~ '^[0-9]{6,32}$'
      and a.phone_number_id ~ '^[0-9]{6,32}$';
    if not found then
      v_block_reason := 'flow_account_unavailable';
    elsif not exists (
      select 1 from whatsapp_ordering_private.whatsapp_order_flow_bindings_v1 b
      where b.whatsapp_account_id = v_account.id
        and b.flow_action = 'data_exchange'
        and upper(b.flow_status) = 'PUBLISHED'
        and b.is_verified and b.is_send_enabled and b.verified_at is not null
    ) then
      v_block_reason := 'flow_binding_not_ready';
    elsif exists (
      select 1 from whatsapp_ordering_private.whatsapp_flow_send_attempts_v1 a
      where a.conversation_id = p_conversation_id
        and a.status in ('preparing', 'sending', 'needs_review')
    ) then
      v_block_reason := 'flow_send_needs_review';
    end if;
  end if;
  select coalesce(jsonb_agg(page.item order by page.created_at desc), '[]'::jsonb)
  into v_items
  from (
    select a.created_at, jsonb_build_object(
      'id', a.id,
      'basket_name', b.name,
      'status', a.status,
      'error_code', a.error_code,
      'created_at', a.created_at
    ) as item
    from whatsapp_ordering_private.whatsapp_flow_send_attempts_v1 a
    join public.basket_templates b on b.id = a.basket_template_id
    where a.conversation_id = p_conversation_id
    order by a.created_at desc, a.id desc
    limit 5
  ) page;
  return jsonb_build_object(
    'ok', true,
    'items', v_items,
    'ready_for_send', v_block_reason is null,
    'block_reason', v_block_reason
  );
end;
$function$;

revoke all on function public.whatsapp_order_flow_send_prepare_admin_v1(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.whatsapp_order_flow_send_prepare_admin_v1(uuid, uuid, uuid)
  to authenticated;
revoke all on function public.whatsapp_order_flow_send_mark_sending_v1(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.whatsapp_order_flow_send_mark_sending_v1(uuid, uuid, text)
  to service_role;
revoke all on function public.whatsapp_order_flow_send_finish_v1(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.whatsapp_order_flow_send_finish_v1(uuid, text, text, text)
  to service_role;
revoke all on function public.whatsapp_order_flow_send_admin_list_v1(uuid)
  from public, anon;
grant execute on function public.whatsapp_order_flow_send_admin_list_v1(uuid)
  to authenticated;

comment on table whatsapp_ordering_private.whatsapp_flow_send_attempts_v1 is
  'One-shot Flow CTA send state; never stores the opaque Flow token. Ambiguous deliveries stay needs_review and are never retried automatically.';
comment on function public.whatsapp_order_flow_send_prepare_admin_v1(uuid, uuid, uuid)
  is 'Authenticated active-staff preparation for sending a verified published Flow to an E.164 conversation during the Meta customer-service window.';
comment on function public.whatsapp_order_flow_send_mark_sending_v1(uuid, uuid, text)
  is 'Service-only final account, binding, window and session check before the Cloud API call.';
comment on function public.whatsapp_order_flow_send_finish_v1(uuid, text, text, text)
  is 'Service-only Flow send receipt; ambiguous attempts are terminal for automatic retry.';
comment on function public.whatsapp_order_flow_send_admin_list_v1(uuid)
  is 'Authenticated Admin projection of recent Flow CTA sends for one conversation; returns no token or payload.';
