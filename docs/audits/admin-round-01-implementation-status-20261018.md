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
