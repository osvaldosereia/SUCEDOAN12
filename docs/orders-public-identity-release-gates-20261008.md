# Pedidos: gates para identidade pública de quatro dígitos

## Não publicar antes de validar

1. Alocar o código uma única vez por pedido, na criação, e persistir independentemente da atualização do snapshot público.
2. Proteger a imutabilidade no banco; updates do snapshot não podem trocar o código.
3. Preservar os códigos históricos AA000 sem renumeração ou backfill destrutivo.
4. Usar sequência 1000–9999, NO CYCLE; ao esgotar, retornar erro operacional explícito sem reaproveitar códigos.
5. Conferir o mesmo código visível no Admin, separação, comprovante, WhatsApp, entrega e documento fiscal, mantendo IDs técnicos internos quando exigidos pelo Bling.
6. Verificar se qualquer default ou função de snapshot consome sequência em operações de refresh; não aplicar migração que gere número em cada refresh.
7. Executar regressão do checkout, separação, mobile e fiscal antes de integrar à main.
8. Verificar a navegação mobile e as ações NÃO ENTREGUE e indicadores de separação.
9. Conferir checks do PR e reconciliar com a main atual antes de qualquer merge.
10. Validar um pedido controlado após implantação e então confirmar imutabilidade até a entrega.

## Bloqueios

Em caso de recusa de escrita, registrar mensagem exata, arquivo e operação. Não contornar recusas de segurança. Manter a produção intacta até cumprir todos os gates.

## Integração validada em ambiente descartável

- Workflow: `.github/workflows/orders-public-identity-postgres-ci.yml`.
- Postgres 17 com estrutura mínima compatível: duas migrations reais aplicadas, códigos AA000 preservados, código numérico persistido na criação, imutabilidade, UPSERT sem consumo adicional de sequência e preenchimento diferido dos produtos.
- Teste de checkout idempotente: duas requisições simultâneas com o mesmo UUID devem retornar o mesmo `order_id`; nova carga sob o mesmo UUID deve ser rejeitada.
- O teste **não reproduz** o schema operacional completo, as reservas reais de estoque nem os efeitos de Meta/Bling. Uma aprovação não substitui homologação no ambiente integrado.

## Ordem obrigatória para publicação sem interromper o checkout

1. Manter o PR #953 como draft e verificar se a `main` não introduziu conflitos, especialmente em `vitrine/admin/index.html` e no novo módulo `montar`.
2. Homologar o checkout, snapshots, outbox de WhatsApp, reserva de estoque, separação e fiscal com dados controlados e sem envios externos involuntários.
3. Ativar primeiro as Edge Functions e consumidores compatíveis com **ambos** os formatos de número. Nenhum fluxo de saída pode continuar rejeitando números de quatro dígitos.
4. Aplicar primeiro a migration **aditiva de idempotência** e verificar tabela, funções e permissões. A migração não altera checkout antigo.
5. Em janela controlada, aplicar a migration de identidade pública, após confirmar compatibilidade de todos os consumidores e que o gatilho diferido de itens preenche o snapshot criado antecipadamente.
6. Só depois distribuir o `storefront-v2` idempotente e a interface pública com `checkout_request_id`. Nunca entregar o frontend novo enquanto as RPCs de idempotência ainda não existirem; isso causaria HTTP 503 para todos os novos pedidos.
7. Testar um pedido controlado, reexecutar exatamente a mesma tentativa e confirmar um único pedido, estoque reservado uma só vez, código público imutável e vitrine preenchida.
8. Revisar monitoramento por erros `checkout_attempt_lookup_unavailable`, `checkout_request_changed`, `order_public_identity_immutable` e falhas no outbox. Só então encerrar o rollout.

**Rollback operacional:** interromper primeiro a distribuição do frontend idempotente e voltar ao backend compatível; preservar dados, códigos e migrations já executadas. Não remover a sequência nem renumerar pedidos criados durante a janela. Se a identidade pública estiver causando erros, interromper novas criações até revisar o fluxo, em vez de alterar códigos existentes.

**Status:** CI de contrato e integração PostgreSQL isolada aprovados; produção ainda não homologada nem modificada.
