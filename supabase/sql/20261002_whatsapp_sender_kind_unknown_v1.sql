-- Permite autoria outbound explicitamente desconhecida quando o provedor não informa IA/humano.
-- Mantém todas as categorias existentes e adiciona apenas 'unknown'.
alter table public.whatsapp_messages_v1
  drop constraint if exists whatsapp_messages_v1_sender_kind_check;

alter table public.whatsapp_messages_v1
  add constraint whatsapp_messages_v1_sender_kind_check
  check (sender_kind = any (array[
    'customer'::text,
    'ana_rule'::text,
    'ana_ai'::text,
    'human'::text,
    'automation'::text,
    'campaign'::text,
    'system'::text,
    'unknown'::text
  ]));
