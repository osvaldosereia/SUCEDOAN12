# Pré-requisitos da migração atômica — verificação de staging

Em 18/10/2026 foi consultado, somente leitura, o projeto Supabase DONA-ANTONIA-2-STAGING (trglbjtbkdkyqocufusw).

A consulta a information_schema.tables, schema public, para orders, order_items, products, vitrine_stock_reservations e bling_hub_runtime_v2 retornou zero linhas. A consulta anterior a information_schema.routines para reserve_vitrine_order_stock_v1 e release_vitrine_order_stock_v1 também retornou zero linhas.

**Resultado:** staging não é equivalente ao esquema operacional exigido. Migração atômica não deve ser aplicada ou considerada testada ali antes da restauração controlada do esquema e das RPCs, incluindo triggers, permissões e dados fictícios.

No código versionado, updateOrderCanonical chama reserva/liberação por RPC antes de orders.update. Essa separação permanece um risco P0. O SQL versionado não comprova a definição efetivamente implantada em produção.

Próxima ação objetiva: identificar a instância Supabase de produção correta e consultar **somente metadados** (pg_get_functiondef, information_schema.columns, triggers, constraints e grants). Com as definições confirmadas, preparar migração transacional em branch; preparar staging equivalente sem dados pessoais; testar concorrência, rollback e replay; somente depois considerar atualização do endpoint.

Nenhum banco foi modificado nesta etapa.
