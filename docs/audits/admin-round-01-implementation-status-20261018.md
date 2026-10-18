# Rodada 01/05 — situação de entrega

## Implementado na branch
- RPC SQL draft com lock FOR UPDATE, comparação de status, reserva/liberação e UPDATE da linha orders na mesma transação; patch de delivery_address, payment_method, customer_id e customer_snapshot.
- Tratamento de cancelamento de pedidos vitrine delegando a liberação ao trigger efetivo sync_vitrine_order_stock_reservation_v1; demais origens usam RPC de liberação.
- Endpoint admin-products-live-v1 encaminha transições created->confirmed e *->cancelled para nova RPC; mantém os outros status no caminho existente com CAS simples.
- Testes de contrato atualizados e plano de homologação documentado.

## Evidências e impedimentos
- Supabase operacional ssbesxgaijknwsjbsbcz consultado somente leitura para esquema e triggers.
- Staging trglbjtbkdkyqocufusw ainda não contém orders/order_items/products/vitrine_stock_reservations. **Nenhum teste SQL integrado foi realizado**.
- GitHub Actions não retornou execuções para o último commit consultado; **CI não está validado**.
- RPC não foi aplicada em staging nem produção; endpoint modificado só na branch.
- A semântica de side effects externos (Bling, impressão, eventos) após transição precisa de testes integrados; possível concorrência externa permanece.
- A migração SQL ainda é um DRAFT, não pronta para deploy.

## Critério para encerrar
Criar staging equivalente sem dados reais, executar testes concorrentes e rollback com resultados, validar CI e corrigir falhas. Até lá: **Rodada 01 não concluída**, apesar da implementação na branch.

## Homologação executada em 18/10/2026
- Staging `trglbjtbkdkyqocufusw` recebeu esquema **isolado de estoque**, com tabelas orders, order_items, products, vitrine_stock_reservations, bling_hub_runtime_v2, view ops2_sellable_stock_v1 e RPCs versionadas do repositório. Não é clone integral da produção.
- Migração `admin_atomic_stock_isolated_staging_20261018` aplicada com sucesso.
- SQL com BEGIN/ROLLBACK: confirmação, reserva, insuficiência, status obsoleto e cancelamento pelo trigger passaram.
- Duas requisições simultâneas à mesma confirmação: uma `ok:true`, outra `stale_order_status`; exatamente uma reserva persistida.
- Cancelamento posterior: reserva mudou para `released`.
- CI no commit `15eb3f65560278ede0670244be9d33c2fcfc3134`: 25/25 workflows com sucesso.
- Limitação: esquema reduzido, sem os outros 20 triggers de orders e sem integração real de Bling/impressão/WhatsApp; não houve deploy da Edge Function. Homologação integral da operação ainda requer esses cenários.
