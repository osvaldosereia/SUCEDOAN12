-- Follow-up indexes from Supabase performance advisor.
create index if not exists whatsapp_messages_reply_to_idx
  on public.whatsapp_messages_v1(reply_to_message_id)
  where reply_to_message_id is not null;

create index if not exists whatsapp_templates_account_idx
  on public.whatsapp_templates_v1(whatsapp_account_id)
  where whatsapp_account_id is not null;

create index if not exists whatsapp_outbox_account_idx
  on public.whatsapp_outbox_v1(whatsapp_account_id);
create index if not exists whatsapp_outbox_conversation_idx
  on public.whatsapp_outbox_v1(conversation_id)
  where conversation_id is not null;
create index if not exists whatsapp_outbox_customer_idx
  on public.whatsapp_outbox_v1(customer_id)
  where customer_id is not null;
create index if not exists whatsapp_outbox_message_idx
  on public.whatsapp_outbox_v1(message_id)
  where message_id is not null;
create index if not exists whatsapp_outbox_template_idx
  on public.whatsapp_outbox_v1(template_id)
  where template_id is not null;

create index if not exists marketing_optout_events_v2_message_idx
  on public.marketing_optout_events_v2(whatsapp_message_id)
  where whatsapp_message_id is not null;
