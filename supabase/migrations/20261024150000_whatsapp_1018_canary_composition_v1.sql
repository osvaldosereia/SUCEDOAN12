-- Extend the isolated 1018→8360 canary with one itemized composition message.
-- Keep unique(sender,recipient,UTC date,kind), service role only and RLS.
-- This migration does not touch ANA, production messages, customer orders or stock.
alter table public.whatsapp_1018_interactive_canary_v1
  drop constraint if exists whatsapp_1018_interactive_canary_v1_kind_check;
alter table public.whatsapp_1018_interactive_canary_v1
  add constraint whatsapp_1018_interactive_canary_v1_kind_check
  check (kind in ('sizes','combinations','composition'));
comment on table public.whatsapp_1018_interactive_canary_v1 is
  'Internal Meta canary, sender 1018 recipient 8360. One claim per kind per UTC day, including itemized composition. Requires human send and open 24h window.';
