alter table public.whatsapp_messages_v1
  drop constraint whatsapp_messages_v1_message_type_check;

alter table public.whatsapp_messages_v1
  add constraint whatsapp_messages_v1_message_type_check
  check (
    message_type = any (array[
      'text'::text,
      'audio'::text,
      'image'::text,
      'video'::text,
      'document'::text,
      'location'::text,
      'interactive'::text,
      'button'::text,
      'template'::text,
      'reaction'::text,
      'system'::text,
      'unknown'::text
    ])
  );
