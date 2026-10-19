# Remediação transacional — diagnóstico e sequência de implantação

Data: 18/10/2026. Branch de trabalho fix/admin-fiscal-hardening-20261018. PR rascunho #1126.

## Evidência técnica

Em updateOrderCanonical, confirmar chama reserve_vitrine_order_stock_v1 e só depois grava orders.status; cancelar chama release_vitrine_order_stock_v1 e só depois grava orders.status. Cada chamada é uma transação de banco separada. Falha após a primeira chamada produz estado parcialmente atualizado. O script scripts/test-admin-transactional-baseline-contract.mjs documenta a sequência existente e falha caso ela mude sem revisão do contrato.

A implementação versionada de reserva usa locks em products e upsert em vitrine_stock_reservations, com janela de 48 horas no SQL de horizonte. A liberação pode restaurar stock quando a autoridade não é Bling. Logo, compensação cega/retry externo não é aceitável.

A consulta somente leitura ao projeto DONA-ANTONIA-2-STAGING (trglbjtbkdkyqocufusw) não encontrou as duas RPCs de reserva/liberação no schema public. Portanto, esse staging ainda não é uma base de homologação equivalente para esses fluxos. Nenhuma consulta de dados de pedidos/clientes foi feita.

## Arquitetura proposta para correção, não implantada

1. Identificar e comparar as definições efetivamente implantadas de reserva, liberação, consumo e gatilhos no ambiente de destino. Conferir os campos de orders, constraints, grants e triggers antes de criar migração.
2. Criar RPC transacional interna de transição de pedido, com bloqueio SELECT FOR UPDATE na linha orders, verificação do status esperado, transição permitida, idempotência por estado e chamada da rotina de estoque dentro da **mesma transação Postgres**.
3. Se reserva/liberação retornar jsonb ok=false, disparar exceção SQL para abortar a transação, sem deixar efeitos parciais. Erros esperados devem ser mapeados no endpoint sem encobrir o rollback.
4. Atualizar somente os ramos confirmed/cancelled do endpoint para a RPC, mantendo demais validações e transições. Evitar duplicar eventos, não restaurar estoque duas vezes e preservar autoridade Bling.
5. Executar testes com dois clientes concorrentes, replay, timeout após commit, estoque insuficiente, cancelamento de reserva consumida, falha simulada de atualização e rollback.
6. Validar migração em staging com schema equivalente e backups, revisar permissões/segurança da RPC e plano de reversão; somente depois propor deploy separado.

## Outros bloqueios

- Fiscal: inspecionar implementação do Hub e locks/idempotência em emissão antes de qualquer alteração.
- Bling: reconciliação por identidade externa quando resposta for incerta; nunca repetir POST de criação cegamente.
- WhatsApp: correlacionar message IDs e webhooks, validar retries e eventos fora de ordem.
- Balanço: planejar transação local para lote/contagem/localização, com saga explícita para Bling externo.

## Resultado desta etapa

Foi criada uma linha de base de regressão e um desenho de remediação, **não uma correção transacional**. Não houve mudança de RPC, schema, produção ou staging. Os riscos P0 permanecem abertos.
