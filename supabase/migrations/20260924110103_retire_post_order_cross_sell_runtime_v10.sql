-- Etapa 5 — limpeza final do runtime aposentado de pós-cesta.
-- Os registros históricos permanecem nas tabelas post_order_cross_sell_* para auditoria.
-- Somente as RPCs executáveis são removidas após os Edge Functions deixarem de chamá-las.

drop function if exists public.accept_post_order_cross_sell_v1(uuid, integer[]);
drop function if exists public.cancel_post_order_cross_sell_for_separation_v1(uuid);
drop function if exists public.decline_post_order_cross_sell_v1(uuid);
drop function if exists public.expire_post_order_cross_sell_sessions_v1(uuid);
drop function if exists public.list_post_order_cross_sell_shadow_v1(uuid, integer);
drop function if exists public.mark_post_order_cross_sell_sent_v1(uuid, text);
drop function if exists public.parse_post_order_cross_sell_reply_v1(text, integer);
drop function if exists public.prepare_post_order_cross_sell_shadow_v1(uuid);
drop function if exists public.queue_post_order_cross_sell_delivery_v1(uuid, text);
