begin;

alter table public.whatsapp_messages_v1
  drop constraint if exists whatsapp_messages_v1_message_type_check;

alter table public.whatsapp_messages_v1
  add constraint whatsapp_messages_v1_message_type_check
  check (message_type = any (array[
    'text'::text,
    'audio'::text,
    'image'::text,
    'document'::text,
    'location'::text,
    'interactive'::text,
    'button'::text,
    'template'::text,
    'reaction'::text,
    'system'::text,
    'unknown'::text
  ]));

commit;
