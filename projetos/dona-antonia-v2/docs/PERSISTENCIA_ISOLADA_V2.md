# Persistência V2 — contratos e implantação SEM risco para o legado

## Estado deste incremento
Implementadas **portas de repositório e serviços de aplicação**:
- \`src/application/catalog.ts\` tem mutações de preço, estoque, ativo, agrupamento, cestas, extras e valor interno com \`expectedRevision\`. Exige persistência atômica do adaptador.
- \`src/application/order-commands.ts\` tem comandos de transição e conferência, \`commandId\` idempotente e \`expectedVersion\` para impedir operadores concorrentes.
- \`src/server/pricing/quote.ts\` soma o valor interno no backend e **NUNCA devolve seu detalhamento**; verifica itens indisponíveis e consumo combinado de SKU entre cesta e extras.
- Repositórios \`Memory*\` são **apenas testes**. Não estão conectados à loja nem guardam pedidos reais.

## Separação segura para próxima etapa
1. Criar ambiente **Supabase de homologação isolado**, sem apontar para \`ssbesxgaijknwsjbsbcz\` ou \`qxstkwshuvplmmftrctj\` (legados).
2. Aplicar SQL planejado \`db/\` SOMENTE neste projeto, revisado com RLS e backups. Não configurar nenhuma trigger/cron/worker nos projetos existentes.
3. Servidor de homologação implementa \`CatalogRepository\` e \`OrderCommandStore\`, preservando transações e índices de versão/idempotência/outbox.
4. Login admin com RBAC verificado pelo backend e RLS como defesa adicional; nunca confiar em \`user_metadata\` ou apenas \`TO authenticated\`.
5. Adaptador público retorna \`PublicCatalogSnapshot\`, filtrando inativos, sem estoque ou preço, **sem custo, ajuste privado nem fornecedor**.
6. Checkout consulta cotação do servidor, sem aceitar total/valor unitário enviados pelo browser, e cria pedido + reserva saldo **numa única transação**.
7. Apenas depois de testado substituir explicitamente os mocks de \`/admin1\` e \`/site1\`. Root \`/\` e admin antigo ficam intocados.
8. Meta e Bling entram depois em consumidores de outbox isolados, sem filas ativas enquanto não houver pedidos reais.

## Invariantes já implementadas
- Os quatro estados visíveis são NOVO, EM_SEPARACAO, PRONTO e ENTREGUE.
- A falta de um produto abate quantidade no pedido; NF-e com erro não bloqueia marcar PRONTO.
- Operadores concorrentes não passam sem conferir \`version\`; comandos duplicados não geram novo evento no repositório de testes.
- \`sku\`, \`numero\` e snapshots de pedido imutáveis.
- Preços em centavos, nunca floats; valor interno por cesta não aparece na composição pública.
- Um SKU para cada sabor/aroma, categorias oficiais fechadas; tipos representam grupos de escolha.

## Limitações honestas
Nenhum banco foi criado, nenhuma migração foi executada, não há autenticação real e nenhuma API/Edge Function foi publicada. Interfaces de teste continuam demonstrativas até a infraestrutura isolada existir.

**Critérios de aceite da próxima conexão:** consultas/updates transactionais, rollback em erro, validação de estoque e fiscal, concorrência, RLS e auditoria com 802 produtos. Testar no navegador sobre staging; sem tocar nos bancos e domínio raiz em produção.

Docs oficiais atuais: https://supabase.com/docs/guides/functions/auth ; https://supabase.com/docs/guides/database/postgres/row-level-security .
