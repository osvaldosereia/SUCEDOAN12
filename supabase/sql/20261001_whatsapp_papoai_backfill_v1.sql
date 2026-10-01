-- Safe historical PapoAI -> canonical WhatsApp backfill.
-- Only rows with exact legacy account + conversation + customer phone bindings are mirrored.
with candidates as materialized (
  select
    i.*,
    c.id as bound_conversation_id,
    c.whatsapp_account_id as bound_account_id,
    c.customer_id as bound_customer_id,
    c.wa_contact_e164 as bound_phone_e164,
    c.source as bound_source,
    lower(coalesce(i.metadata->>'message_type',i.payload#>>'{data,message,type}','unknown')) as raw_message_type
  from public.papoai_webhook_inbox_v2 i
  join public.conversations c
    on (i.metadata->>'conversation_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   and c.id=(i.metadata->>'conversation_id')::uuid
  where i.event_name='message.received'
    and i.status in ('normalized','processed')
    and coalesce((i.metadata->>'canonical_mirror')::boolean,false) is false
    and (i.metadata->>'whatsapp_account_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and c.whatsapp_account_id=(i.metadata->>'whatsapp_account_id')::uuid
    and nullif(i.metadata->>'canonical_phone_e164','') is not null
    and c.wa_contact_e164=i.metadata->>'canonical_phone_e164'
    and nullif(i.metadata->>'whatsapp_message_id','') is not null
), mirrored as materialized (
  select
    x.id as capture_id,
    public.whatsapp_ingest_event_v1(
      x.bound_account_id,
      'papoai',
      x.event_key,
      x.event_name,
      x.metadata->>'whatsapp_message_id',
      x.bound_phone_e164,
      x.received_at,
      x.body_hash,
      x.payload,
      jsonb_build_object(
        'direction','inbound',
        'message_type',case
          when x.raw_message_type='text' then 'text'
          when x.raw_message_type='audio' or x.raw_message_type like 'audio/%' then 'audio'
          when x.raw_message_type='image' or x.raw_message_type like 'image/%' then 'image'
          when x.raw_message_type in ('document','file') or x.raw_message_type like 'application/%' then 'document'
          when x.raw_message_type='location' then 'location'
          when x.raw_message_type='interactive' then 'interactive'
          else 'unknown'
        end,
        'provider_conversation_id',coalesce(nullif(x.conversation_ref,''),x.payload#>>'{data,session,uid}'),
        'text_body',case when x.raw_message_type='text' then nullif(x.payload#>>'{data,message,content}','') else null end,
        'status_current','received',
        'sender_kind','customer',
        'customer_id',x.bound_customer_id,
        'source',x.bound_source,
        'received_at',x.received_at,
        'metadata',jsonb_build_object(
          'source','papoai',
          'legacy_backfill',true,
          'legacy_capture_id',x.id,
          'legacy_event_key',x.event_key,
          'legacy_conversation_id',x.bound_conversation_id,
          'raw_type',x.raw_message_type
        )
      )
    ) as result
  from candidates x
), applied as (
  update public.papoai_webhook_inbox_v2 i
  set metadata=i.metadata || jsonb_build_object(
    'canonical_mirror',true,
    'canonical_mirrored_at',now(),
    'canonical_event_id',m.result->>'event_id',
    'canonical_message_id',m.result->>'message_id',
    'canonical_backfill',true
  )
  from mirrored m
  where i.id=m.capture_id
    and coalesce((m.result->>'ok')::boolean,false) is true
  returning i.id
)
select count(*) as mirrored_capture_count from applied;
