-- R11: isolated V2 human WhatsApp inbox read model and outbound queue.
-- This migration never calls Meta, sends a message, or migrates legacy support data.

create or replace function public.admin_list_conversations(
  p_provider_account text,
  p_status text,
  p_search text,
  p_limit integer,
  p_offset integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_limit integer := least(50, greatest(1, coalesce(p_limit, 30)));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_account text := nullif(btrim(coalesce(p_provider_account, '')), '');
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
  v_search text := nullif(lower(btrim(coalesce(p_search, ''))), '');
  v_total integer;
  v_items jsonb;
begin
  if not da_next.has_permission('conversations.read') then
    raise exception using errcode = '42501', message = 'Permissão de atendimento necessária.';
  end if;
  if v_account is not null and v_account not in ('0975', '1018') then
    raise exception using errcode = '22023', message = 'Conta WhatsApp inválida.';
  end if;
  if v_status is not null and v_status not in ('ABERTA', 'PENDENTE', 'CONCLUIDA') then
    raise exception using errcode = '22023', message = 'Status de conversa inválido.';
  end if;

  select count(*)::integer into v_total
  from da_next.conversations as c
  where (v_account is null or c.provider_account = v_account)
    and (v_status is null or c.status = v_status)
    and (v_search is null or lower(concat_ws(' ', c.customer_phone_snapshot, c.external_contact_id)) like '%' || v_search || '%');

  select coalesce(jsonb_agg(to_jsonb(result) order by result.last_message_at desc nulls last, result.id), '[]'::jsonb)
    into v_items
  from (
    select
      c.id,
      c.provider,
      c.provider_account,
      c.external_contact_id,
      c.customer_phone_snapshot,
      c.customer_id,
      c.order_id,
      c.status,
      c.assigned_to,
      c.last_message_at,
      c.updated_at,
      (select m.content_text
         from da_next.conversation_messages as m
        where m.conversation_id = c.id
        order by m.occurred_at desc, m.id desc
        limit 1) as last_message_preview,
      (select count(*)::integer from da_next.conversation_messages as m where m.conversation_id = c.id) as message_count
    from da_next.conversations as c
    where (v_account is null or c.provider_account = v_account)
      and (v_status is null or c.status = v_status)
      and (v_search is null or lower(concat_ws(' ', c.customer_phone_snapshot, c.external_contact_id)) like '%' || v_search || '%')
    order by c.last_message_at desc nulls last, c.id
    limit v_limit offset v_offset
  ) as result;

  return jsonb_build_object('items', v_items, 'total', v_total, 'limit', v_limit, 'offset', v_offset);
end;
$function$;

create or replace function public.admin_get_conversation(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_conversation da_next.conversations;
  v_messages jsonb;
begin
  if not da_next.has_permission('conversations.read') then
    raise exception using errcode = '42501', message = 'Permissão de atendimento necessária.';
  end if;
  select * into v_conversation from da_next.conversations where id = p_conversation_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Conversa não encontrada.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'provider_account', m.provider_account,
    'provider_message_id', m.provider_message_id,
    'direction', m.direction,
    'content_text', m.content_text,
    'media_metadata', m.media_metadata,
    'delivery_status', m.delivery_status,
    'idempotency_key', m.idempotency_key,
    'occurred_at', m.occurred_at
  ) order by m.occurred_at, m.id), '[]'::jsonb)
    into v_messages
  from da_next.conversation_messages as m
  where m.conversation_id = p_conversation_id;

  return jsonb_build_object(
    'id', v_conversation.id,
    'provider', v_conversation.provider,
    'provider_account', v_conversation.provider_account,
    'external_contact_id', v_conversation.external_contact_id,
    'customer_phone_snapshot', v_conversation.customer_phone_snapshot,
    'customer_id', v_conversation.customer_id,
    'order_id', v_conversation.order_id,
    'status', v_conversation.status,
    'assigned_to', v_conversation.assigned_to,
    'version', v_conversation.version,
    'last_message_at', v_conversation.last_message_at,
    'messages', v_messages
  );
end;
$function$;

create or replace function public.admin_queue_conversation_message(
  p_conversation_id uuid,
  p_provider_account text,
  p_idempotency_key text,
  p_content_text text,
  p_media_metadata jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  v_conversation da_next.conversations;
  v_existing da_next.conversation_messages;
  v_message da_next.conversation_messages;
  v_media jsonb := coalesce(p_media_metadata, '[]'::jsonb);
  v_content text := nullif(btrim(coalesce(p_content_text, '')), '');
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
begin
  if not da_next.has_permission('conversations.manage') then
    raise exception using errcode = '42501', message = 'Permissão de atendimento necessária.';
  end if;
  if p_conversation_id is null or p_provider_account not in ('0975', '1018') or v_key is null then
    raise exception using errcode = '22023', message = 'Mensagem sem identificação válida.';
  end if;
  if jsonb_typeof(v_media) <> 'array' then
    raise exception using errcode = '22023', message = 'Anexos da mensagem inválidos.';
  end if;
  if v_content is null and jsonb_array_length(v_media) = 0 then
    raise exception using errcode = '22023', message = 'Mensagem vazia.';
  end if;

  select * into v_conversation
  from da_next.conversations
  where id = p_conversation_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Conversa não encontrada.';
  end if;
  if v_conversation.provider_account <> p_provider_account then
    raise exception using errcode = '22023', message = 'Conta não corresponde à conversa.';
  end if;

  select * into v_existing from da_next.conversation_messages where idempotency_key = v_key;
  if found then
    if v_existing.conversation_id <> p_conversation_id
       or v_existing.content_text is distinct from v_content
       or v_existing.media_metadata is distinct from v_media then
      raise exception using errcode = '40001', message = 'Chave de idempotência reutilizada.';
    end if;
    return jsonb_build_object(
      'id', v_existing.id,
      'conversation_id', v_existing.conversation_id,
      'provider_account', v_existing.provider_account,
      'direction', v_existing.direction,
      'content_text', v_existing.content_text,
      'media_metadata', v_existing.media_metadata,
      'delivery_status', v_existing.delivery_status,
      'idempotency_key', v_existing.idempotency_key,
      'occurred_at', v_existing.occurred_at,
      'replayed', true
    );
  end if;

  insert into da_next.conversation_messages (
    conversation_id, provider_account, direction, content_text, media_metadata,
    delivery_status, idempotency_key, occurred_at
  ) values (
    p_conversation_id, p_provider_account, 'SAIDA', v_content, v_media,
    'NA_FILA', v_key, now()
  ) returning * into v_message;

  update da_next.conversations
     set version = version + 1, last_message_at = v_message.occurred_at, status = 'PENDENTE'
   where id = p_conversation_id;

  insert into da_next.integration_outbox (
    aggregate_type, aggregate_id, aggregate_version, event_type, idempotency_key, payload
  ) values (
    'CONVERSATION', p_conversation_id, v_conversation.version + 1,
    'ConversationMessageQueued', 'conversation:' || v_key,
    jsonb_build_object('message_id', v_message.id, 'provider_account', p_provider_account)
  );

  return jsonb_build_object(
    'id', v_message.id,
    'conversation_id', v_message.conversation_id,
    'provider_account', v_message.provider_account,
    'direction', v_message.direction,
    'content_text', v_message.content_text,
    'media_metadata', v_message.media_metadata,
    'delivery_status', v_message.delivery_status,
    'idempotency_key', v_message.idempotency_key,
    'occurred_at', v_message.occurred_at,
    'replayed', false
  );
end;
$function$;

revoke all on function public.admin_list_conversations(text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_get_conversation(uuid) from public, anon, authenticated;
revoke all on function public.admin_queue_conversation_message(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.admin_list_conversations(text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_get_conversation(uuid) to authenticated;
grant execute on function public.admin_queue_conversation_message(uuid, text, text, text, jsonb) to authenticated;

comment on function public.admin_queue_conversation_message(uuid, text, text, text, jsonb) is
  'Queues an isolated V2 outbound message with idempotency; no WhatsApp/Meta transport is called.';
