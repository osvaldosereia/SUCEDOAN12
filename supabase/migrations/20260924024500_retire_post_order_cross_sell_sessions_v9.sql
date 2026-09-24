-- Completa a aposentadoria do pós-cesta: o estado histórico usado pelo Shadow era shadow_prepared.
-- Mantemos os registros para auditoria, mas nenhum deles permanece operacional.
update public.post_order_cross_sell_sessions
set status = 'expired',
    updated_at = now()
where status in ('prepared','shadow_prepared','queued','sent','sent_test');
