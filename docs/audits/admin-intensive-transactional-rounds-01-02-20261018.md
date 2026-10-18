# Execução intensiva 01–02 — evidências e limites (18/10/2026)

- Confirmado por consulta somente leitura no projeto ssbesxgaijknwsjbsbcz: public.orders tem id uuid, status text, confirmed_at, cancelled_at, updated_at; as RPCs reserve_vitrine_order_stock_v1 e release_vitrine_order_stock_v1 existem e foram lidas.
- A reserva efetivamente implantada considera componentes pré-montados de cestas e usa ops2_loose_sellable_stock_v1, diferentemente da versão simplificada em alguns SQLs históricos. Não substituir a RPC atual pelo arquivo histórico.
- Criado supabase/sql/admin_order_stock_transition_atomic_v1_DRAFT.sql. Ele bloqueia a linha orders, compara estado esperado, chama a RPC existente e atualiza status na mesma transação. Erro da RPC causa EXCEPTION/rollback.
- Criado teste estático scripts/test-admin-atomic-stock-sql-draft.mjs, integrado ao workflow Admin print queue panel. Não substitui testes de banco.
- O draft **não** está conectado ao endpoint. A operação atual pode alterar endereço/pagamento e status em uma mesma requisição; o desenho definitivo deve preservar essa semântica e as validações existentes. Revisar também transições permitidas, idempotência por reenvio, grants e triggers.
- DONA-ANTONIA-2-STAGING não tem as tabelas necessárias. Nenhuma migração foi aplicada e nenhum teste concorrente de banco foi executado.
- Fiscal/Bling: permanecem pendentes inspeção detalhada do Hub, simulação de timeout, prova de idempotência e reconciliação de escrita externa. Nenhuma emissão/integração real foi disparada.
- Rodada 03: não iniciada nesta execução para evitar alterações sem homologação de estoque e fiscal.

Próxima execução: disponibilizar staging equivalente sem dados pessoais, rodar migração de teste, concorrência/rollback, ajustar draft conforme resultados, depois integrar o endpoint. Manter produção intacta.
