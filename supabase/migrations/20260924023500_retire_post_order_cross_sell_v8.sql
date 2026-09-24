-- Etapa 2: PapoAI fica responsável pela conversa; Vitrine mantém apenas integração operacional.
-- Preservamos tabelas/sessões históricas para auditoria e evitamos DROP destrutivo nesta rodada.

update public.post_order_cross_sell_config
set enabled = false,
    mode = 'shadow',
    delivery_contract_ready = false,
    updated_at = now()
where enabled is distinct from false
   or mode is distinct from 'shadow'
   or delivery_contract_ready is distinct from false;

update public.post_order_cross_sell_sessions
set status = 'expired',
    updated_at = now()
where status in ('prepared','queued','sent','sent_test');

-- Defesa em profundidade: qualquer tentativa de preparar uma nova sessão pelo runtime legado
-- continua retornando um resultado seguro e sem oferta. Mantemos a assinatura para não quebrar
-- versões antigas durante o deploy gradual.
create or replace function public.prepare_post_order_cross_sell_shadow_v1(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return jsonb_build_object(
    'ok', true,
    'retired', true,
    'eligible', false,
    'reason', 'post_order_cross_sell_retired',
    'order_id', p_order_id
  );
end;
$$;

revoke all on function public.prepare_post_order_cross_sell_shadow_v1(uuid) from public, anon, authenticated;
grant execute on function public.prepare_post_order_cross_sell_shadow_v1(uuid) to service_role;

comment on function public.prepare_post_order_cross_sell_shadow_v1(uuid) is
'RETIRED 2026-09-24: compatibility no-op. PapoAI owns conversation intelligence; Vitrine retains operational identity/customer/order integration only.';
