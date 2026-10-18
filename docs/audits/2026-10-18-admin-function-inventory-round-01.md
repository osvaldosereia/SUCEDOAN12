# Vitrine Admin — inventário de funções, rodada 01

Referência: branch `fix/admin-fiscal-hardening-20261018`. Análise estática de código; não equivale a execução operacional ou prova de ausência de uso.

## Escopo inicial efetivamente inspecionado

| Arquivo | Funções nomeadas | Capturas de erro vazias | Diagnóstico |
|---|---:|---:|---|
| `vitrine/admin/index.html` | 487 | 30 | Controlador principal concentra navegação, HTML, APIs e ações operacionais |
| `supabase/functions/admin-products-live-v1/index.ts` | 222 | 47 | Gateway de 154 ações; verificar correspondência entre registro, métodos e autorização |
| `supabase/functions/admin-service-intelligence-v1/index.ts` | 215 | 26 | Gateway multifuncional; separar domínios sem quebrar importações |
| `vitrine/admin/atendimento/attendance-app.js` | 85 | 2 | Atendimento possui controlador próprio; verificar estado e eventos |
| `vitrine/admin/ana/ana-admin.js` | 24 | 0 | Módulo próprio; revisar callbacks e estado de edição |
| `vitrine/admin/basket-admin-section.js` | 10 | 0 | Carregador de módulos de cestas |
| **Total deste lote** | **1.043** | **105** | Contagem textual, não total do projeto |

## Defeitos confirmados por inspeção

1. Cinco ações POST tinham handlers, mas faltavam na allowlist `LOCAL`: `product_lot_save`, `product_lot_tracking_complete`, `order_check_start`, `order_check_scan`, `order_check_finish`. A verificação de `LOCAL.has(a)` precede os handlers, tornando-os inacessíveis por esse gateway. Corrigido no commit `8bc88b0c`.
2. `history_sync_retry` e `bling_oauth_begin` não constavam em `WRITE_ACTIONS`. Classificadas como escrita no commit `8bc88b0c`; validar implicações de permissão antes de implantação.
3. Há cópias byte a byte idênticas do `purchase-xml-v1/index.ts`, de pelo menos sete auxiliares XML e de dois módulos PapoAI dentro de `admin-service-intelligence-v1`. Consolidar somente após conferir o empacotamento/deploy.

## Candidatas a funções sem uso (não remover sem verificar referências indiretas)

- Frontend: `renderOpsTimeline`, `renderOps2Summary`, `returnCurrentOrderToExpedition`, `inventorySheetImageData`, `bindInventorySheetPhoto`, `setBalanceSubtab`, `purchaseFinanceRowLabel`, `purchaseFinanceBlockHtml`, `purchaseStatusLabel`, `purchaseReceiptLabel`, `recalcPurchaseCatalogCard`, `applyPurchaseCatalogItemUpdate`, `purchasePaymentConfigHtml`, `openPurchaseDocument`, `openManualSale`, `blingPreflightAlertHtml`, `confirmCurrentOrderPayment`, `orderStockAlertHtml`, `orderBlingLinkHtml`, `orderBlingPreviewHtml`, `previewCurrentOrderBling`, `createCurrentOrderCustomerInBling`, `createCurrentOrderProductsInBling`, `resolveCurrentOrderBlingDependencies`, `completeCurrentOrderCustomerDocument`, `printDelivery`, `orderActionButtonsHtml`.
- Produtos backend: `basketKitPackageCompatible`, `basketKitSuggestions`.
- Inteligência backend: `blingHubReadProductsByIds`.
- ANA: `markDirty`.

Critério de detecção: o identificador aparece somente na própria declaração **dentro do arquivo examinado**. Event handlers dinâmicos, referências de outros arquivos, scripts embutidos e interfaces públicas ainda precisam ser considerados. Isso é apenas uma lista de investigação, não autorização de remoção.

## Pontos de revisão por risco

- `saveProduct`: produto, estoque e oferta são gravados em operações separadas; documentar estados de sucesso parcial e recuperação.
- `loadProducts`: verificar concorrência entre filtros, paginação e geração de requisições; existe guarda de geração.
- `setTab`: grande dispatcher de telas; avaliar registro declarativo preservando carregamento preguiçoso.
- `openProductEditor`: separar montagem de formulário, leitura de dados e eventos.
- `paintPurchases`: separar apresentação de documentos, alertas, catálogo e eventos.
- `openOrder` / `loadCurrentOrderFiscal`: revisar sincronização de dados fiscais com o pedido atualmente selecionado.
- Revisar cada `catch {}` conforme impacto: falha opcional tolerada, erro que exige registro, erro que exige feedback ou falha crítica.

## Próxima sequência de trabalho

1. Inventariar todos os módulos das 18 seções e respectivas Edge Functions.
2. Verificar chamadas dinâmicas e classificar cada candidata a código morto.
3. Auditar cobertura da allowlist `LOCAL`, ações POST e permissões.
4. Corrigir inconsistências confirmadas antes de extrair controladores grandes.
5. Consolidar duplicações comprovadas sem alterar os contratos de execução.
6. Executar apenas verificações direcionadas às mudanças, sem homologação operacional ampla por padrão.

**Regra de segurança:** não excluir código apenas por ausência de referência textual; não implantar em produção sem aprovação separada.
