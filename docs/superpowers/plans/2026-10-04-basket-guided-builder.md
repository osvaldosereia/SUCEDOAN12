# Cestas/Kits Guided Builder Implementation Plan

> **Execução:** usar `superpowers:executing-plans` ou `superpowers:subagent-driven-development`, tarefa por tarefa, com TDD e verificação antes de merge.

**Objetivo:** entregar no Vitrine/Admin um editor guiado de Cestas/Kits por termos e carrosséis, com criação de lote que reserva estoque atomicamente antes da montagem física, preservando catálogo canônico, histórico, preço oculto, impressão e controles já existentes.

**Arquitetura:** `basket_templates` continua sendo a única entidade comercial pública. `basket_kit_templates` e `basket_kit_template_items` continuam sendo a composição operacional. Cada item operacional passa a ter rótulo/família/busca para alimentar o carrossel. Uma reserva explícita de componentes separa `Em montagem` de `Montado`; toda mutação de estoque fica em RPCs service-role, com prévia sem mutação e confirmação transacional.

**Stack:** Supabase/PostgreSQL, Edge Function TypeScript `admin-products-live-v1`, HTML/CSS/JS em `vitrine/admin/index.html`, Node.js 24, Playwright 1.62.1 e GitHub Actions.

**Especificação:** `docs/superpowers/specs/2026-10-04-basket-guided-builder-design.md`

## Restrições globais

- Salvar modelo, editar termos ou escolher produtos **não reserva estoque**.
- A prévia de lote é somente leitura.
- A reserva nasce apenas em `Criar lote / reservar` para quantidade concreta.
- `Em montagem` reserva estoque; `Montado` confirma montagem física; `Ativar venda` permanece separado.
- Nunca reservar acima de `ops2_loose_sellable_stock_v1`.
- Lotes e pedidos históricos não são regravados.
- Edição de lote reservado usa delta atômico: aumento reserva a diferença, redução libera a diferença, troca libera e reserva na mesma transação.
- Cancelamento só libera estoque se as proteções de histórico/dependência permitirem.
- Lotes legados `ready/depleted` continuam protegendo estoque sem dupla contagem; drafts legados não passam a reservar retroativamente.
- O kit legado `Kit Limpeza e Higiene` deve ser promovido para `basket_templates` sem clonar sua composição nem publicar lotes draft.
- RPCs mutantes novas: `revoke` de `public`, `anon`, `authenticated`; `grant execute` somente a `service_role`.
- Implementação em branch/worktree novo baseado no `main` mais recente; não desenvolver a feature diretamente em cima do PR #795.

## Casos críticos obrigatórios

1. Mesmo SKU em duas posições: UI exige confirmação; prévia/reserva consolidam necessidade total por `product_id`.
2. Duas reservas concorrentes: locks em ordem estável + revalidação no servidor; nunca estoque negativo.
3. Edição sem estoque suficiente: rollback integral, preservando composição e reserva anteriores.
4. Lote com pedido/alocação ou dependência: reabertura/cancelamento/liberação destrutiva bloqueados com motivo legível.
5. Legado + reserva explícita: `basket_locked_component_stock_v1` conta cada unidade uma vez.

---

### Task 1 — Promover kits standalone legados para o catálogo comercial único

**Arquivos**
- `scripts/test-basket-unified-commercial-model.mjs`
- `supabase/migrations/20261005021000_basket_promote_legacy_standalone_kits_v1.sql`

- [ ] Portar para a branch de execução o teste RED já validado no PR #795.
- [ ] Rodar `node --disable-warning=ExperimentalWarning scripts/test-basket-unified-commercial-model.mjs` e confirmar falha pela migration ausente.
- [ ] Criar migration idempotente que selecione kits ativos com `basket_id is null AND category_id is not null`, crie `basket_templates`, vincule `basket_kit_templates.basket_id` e `basket_stock_lots.basket_id`, sem copiar `basket_kit_template_items`.
- [ ] Preservar `status`, `quantity_built`, `quantity_available`, `sale_enabled`, composição, código e preço dos lotes; lotes draft continuam não publicados.
- [ ] Rodar também `test-basket-canonical-commerce.mjs` e `test-basket-storefront-canonical.mjs`.
- [ ] Commit: `fix: promover kits legados para catálogo comercial`.

### Task 2 — Transformar composição em posições guiadas persistentes

**Arquivos**
- `supabase/sql/20261005_basket_guided_positions_v1.sql`
- `supabase/migrations/20261005030000_basket_guided_positions_v1.sql`
- `scripts/test-basket-guided-positions-v1.mjs`

**Contrato**
Adicionar a `basket_kit_template_items`: `position_label text`, `family_key text`, `search_query text`.
Criar:
- `basket_commercial_model_editor_v1(p_basket_id uuid) returns jsonb`
- `save_basket_commercial_model_composition_v1(p_basket_id uuid, p_positions jsonb, p_operator text) returns jsonb`

- [ ] Escrever teste RED para leitura/gravação de posições, ordem, quantidade e regras existentes (`removable`, `quantity_editable`, min/max, deltas).
- [ ] Garantir em teste que salvar modelo não toca lote, reserva ou estoque.
- [ ] Backfill não destrutivo: usar família inequívoca quando existir; senão rótulo/nome do produto e `search_query` textual.
- [ ] Permitir mesmo produto em mais de uma posição somente com `duplicate_confirmed=true`.
- [ ] Rodar `test-basket-guided-positions-v1.mjs` + `test-basket-mounted-edit-print-models.mjs`.
- [ ] Commit: `feat: adicionar posições guiadas aos modelos de cesta`.

### Task 3 — Expor catálogo dos carrosséis por família, com fallback de busca

**Arquivos**
- `supabase/functions/admin-products-live-v1/index.ts`
- `scripts/test-basket-guided-builder-ui-v1.mjs`
- `scripts/test-basket-family-picker-ux-v1.mjs`

**Contrato**
Ação GET `basket_commercial_position_products` com `basket_id`, `kit_template_item_id`, `family_key`, `q`, `limit`, `offset`.
Cada card retorna: `id`, `name`, `sku`, `gtin`, `packaging`, `image_url`, `cost_price`, `sale_price`, `effective_sellable_stock`, `basket_locked_quantity`, `loose_stock`, `is_active`.

- [ ] Teste RED: família explícita tem prioridade; busca textual só é fallback; produto sem estoque aparece mas não é selecionável.
- [ ] Implementar endpoint reutilizando `basket_lot_substitution_products` e a mesma origem do family picker atual.
- [ ] Não aplicar top-7, preço ou embalagem como filtro oculto dos membros autorizados.
- [ ] Paginar busca textual e, quando necessário, família grande sem perder membros.
- [ ] Rodar os dois testes de família/UI.
- [ ] Commit: `feat: expor catálogo guiado de produtos por posição`.

### Task 4 — Criar domínio explícito de reserva e estado de montagem

**Arquivos**
- `supabase/sql/20261005_basket_component_reservations_v1.sql`
- `supabase/migrations/20261005031000_basket_component_reservations_v1.sql`
- `scripts/test-basket-reservation-domain-v1.mjs`
- ajustar views canônicas de estoque/disponibilidade.

**Contrato**
Criar `basket_lot_component_reservations` com `lot_id`, `product_id`, `quantity_reserved`, `status`, timestamps e metadata. Adicionar `basket_stock_lots.assembly_status` com `legacy|assembling|mounted`.

- [ ] Teste RED para reserva explícita + fallback legado sem dupla contagem.
- [ ] Backfill: `ready/depleted` legados => `mounted`; `draft` legados => `legacy`; não criar reserva retroativa de draft.
- [ ] Atualizar `basket_locked_component_stock_v1` e `ops2_loose_sellable_stock_v1` para somar reservas ativas + legado não migrado exatamente uma vez.
- [ ] Manter `basket_lot_public_availability_v1` exigindo lote pronto e, para lotes novos, `assembly_status='mounted'`.
- [ ] Rodar `test-basket-reservation-domain-v1.mjs`, `test-basket-canonical-commerce.mjs` e `test-basket-canonical-checkout.mjs`.
- [ ] Commit: `feat: separar reserva de estoque da montagem física`.

### Task 5 — Implementar prévia e criação atômica `Criar lote / reservar`

**Arquivos**
- `supabase/sql/20261005_basket_guided_lot_flow_v1.sql`
- `supabase/migrations/20261005032000_basket_guided_lot_flow_v1.sql`
- `scripts/test-basket-guided-lot-flow-v1.mjs`

**RPCs**
- `preview_basket_commercial_lot_v1(...)`
- `create_basket_commercial_lot_reserved_v1(...)`

- [ ] Teste RED: prévia consolida itens repetidos por `product_id`, calcula `por_unidade × lote`, `available`, `required`, `balance_after`, sem mutação.
- [ ] Teste RED de concorrência: locks em ordem estável por produto, revalidação de `loose_stock` dentro da transação, rollback integral se faltar qualquer SKU.
- [ ] Criar lote novo como `status='draft'`, `assembly_status='assembling'`, `sale_enabled=false`, com reserva explícita total.
- [ ] Persistir snapshots: custo, soma comercial, preço final e `hidden_adjustment_snapshot`.
- [ ] Se houver SKU consolidado de duas posições, registrar os IDs das posições no snapshot/metadata para auditoria.
- [ ] Rodar também `test-basket-zero-price-fallback.mjs` e `test-basket-lot-types-links-financials.mjs`.
- [ ] Commit: `feat: criar lote com prévia e reserva atômica`.

### Task 6 — Implementar edição por delta de reserva, montagem e cancelamento

**Arquivos**
- `supabase/sql/20261005_basket_guided_lot_flow_v1.sql`
- `scripts/test-basket-guided-lot-flow-v1.mjs`
- compatibilizar `supabase/sql/20261004_basket_lot_reopen_and_model_admin_v1.sql`.

**RPCs**
- `update_basket_reserved_lot_v1(p_lot_id, p_quantity, p_items, p_public_name, p_sale_price, p_operator, p_notes) returns jsonb`
- `mark_basket_reserved_lot_mounted_v1(p_lot_id, p_operator) returns jsonb`
- `cancel_basket_reserved_lot_v1(p_lot_id, p_operator, p_reason) returns jsonb`

- [ ] Escrever RED para aumento, redução e troca de produto usando delta de reserva.
- [ ] Cobrir falha por estoque insuficiente com rollback integral.
- [ ] Preservar proteções existentes: `lot_sale_must_be_disabled`, `lot_has_order_history`, `lot_already_changed`, `lot_is_dependency` ou equivalentes coerentes.
- [ ] `Marcar como montado` muda `assembly_status` para `mounted`, grava operador/horário e não reserva novamente.
- [ ] Cancelamento elegível muda status para `cancelled`, desativa venda e libera somente reserva remanescente; histórico bloqueia operação destrutiva.
- [ ] Reabertura de lote novo montado deve voltar para edição preservando reserva, e não zerar indevidamente `quantity_available`; ajustar sem quebrar legados.
- [ ] Rodar `test-basket-guided-lot-flow-v1.mjs` + `test-basket-mounted-edit-print-models.mjs` + `test-basket-lot-ops-rules.mjs`.
- [ ] Commit: `feat: editar e cancelar lotes com delta de reserva`.

### Task 7 — Expor as novas operações pela Edge Function administrativa

**Arquivos**
- `supabase/functions/admin-products-live-v1/index.ts`
- `scripts/test-basket-guided-builder-ui-v1.mjs`

**Ações**
- GET `basket_commercial_model_editor`
- GET `basket_commercial_position_products`
- POST `basket_commercial_model_composition_save`
- POST `basket_commercial_lot_preview`
- POST `basket_commercial_lot_reserve`
- POST `basket_commercial_lot_update`
- POST `basket_commercial_lot_mount`
- POST `basket_commercial_lot_cancel`

- [ ] Escrever RED para registro de rotas, validação de payload e mapeamento de erros de domínio.
- [ ] Implementar adaptadores finos: nenhuma regra de estoque duplicada na Edge Function.
- [ ] Mapear erros conhecidos para mensagens operacionais em PT-BR sem esconder o código técnico em log.
- [ ] Garantir autenticação administrativa já usada pelo endpoint atual e service-role somente no backend.
- [ ] Rodar `test-basket-guided-builder-ui-v1.mjs` + `test-basket-admin-canonical-api.mjs`.
- [ ] Commit: `feat: expor fluxo guiado de lotes no admin api`.

### Task 8 — Construir o editor guiado vertical no Vitrine/Admin

**Arquivos**
- `vitrine/admin/index.html`
- `scripts/test-basket-guided-builder-ui-v1.mjs`

- [ ] RED: exigir seções `Dados comerciais`, `Itens da cesta/kit`, carrosséis por posição, `Resumo`, `Criar lote / reservar`.
- [ ] Reutilizar `openBasketCommercialCreate`/editor existente em vez de criar outra página paralela.
- [ ] Termos: adicionar, renomear, remover quando permitido e reordenar.
- [ ] Para cada termo, lazy-load do carrossel; card com foto, nome, embalagem, código/EAN, custo, venda, total, reservado e avulso.
- [ ] Selecionar produto principal e quantidade por cesta/kit; manter flags `removable`, `quantity_editable`, min/max e família.
- [ ] Mesmo SKU em duas posições: exibir aviso e pedir confirmação explícita antes de salvar/preview.
- [ ] Resumo fixo: custo, soma de venda, preço final, ajuste oculto, quantidade de posições e alertas.
- [ ] Salvar modelo não chama reserva.
- [ ] Detalhes pesados carregam somente ao abrir para manter a seção leve.
- [ ] Commit: `feat: criar editor guiado de cestas e kits`.

### Task 9 — Integrar prévia, reserva e estados operacionais na UI

**Arquivos**
- `vitrine/admin/index.html`
- `scripts/test-basket-guided-builder-ui-v1.mjs`

- [ ] Mostrar quantidade a montar e tabela `Produto | Por cesta | Lote | Necessário | Avulso | Saldo` antes da confirmação.
- [ ] Destacar em vermelho/erro apenas os SKUs insuficientes e bloquear confirmar.
- [ ] Botão `Criar lote / reservar` chama confirmação apenas após prévia válida.
- [ ] Lista de lotes usa rótulos operacionais `Em montagem`, `Montado`, `Pausado`, `Esgotado`, `Cancelado`.
- [ ] `Marcar como montado` não ativa venda; `Ativar venda` continua separado.
- [ ] `Editar lote` usa delta; `Cancelar lote` mostra impacto de estoque antes da confirmação.
- [ ] Preservar `Duplicar lote`, `Imprimir lote`, `Ver composição`, nome, preço, código curto e histórico.
- [ ] Rodar contratos existentes de impressão/modelos.
- [ ] Commit: `feat: integrar reserva e montagem à operação de lotes`.

### Task 10 — Browser smoke e responsividade

**Arquivos**
- `scripts/test-basket-guided-builder-browser.mjs`
- `vitrine/admin/index.html`

- [ ] Playwright: abrir editor, criar termos, abrir carrossel, selecionar produto, alterar quantidade, revisar resumo e simular lote.
- [ ] Verificar que preview não altera badges de estoque local antes da confirmação.
- [ ] Testar visual desktop e viewport mobile; carrossel horizontal no celular, sem campos esmagados e sem scroll lateral da página inteira.
- [ ] Testar erro de estoque insuficiente e manutenção do estado do editor após erro.
- [ ] Testar lote `Em montagem` aparecendo após confirmação mockada/fixture de API adequada ao padrão dos testes atuais.
- [ ] Commit: `test: cobrir fluxo guiado de cestas no navegador`.

### Task 11 — Atualizar CI de Cestas/Kits

**Arquivo**
- `.github/workflows/basket-kit-editor-ci.yml`

- [ ] Adicionar os novos testes Node antes dos browser tests.
- [ ] Adicionar `scripts/test-basket-guided-builder-browser.mjs` com `PLAYWRIGHT_PATH` já usado pelo workflow.
- [ ] Rodar localmente todos os testes rápidos de Cestas e, se possível no ambiente, Playwright.
- [ ] Abrir PR pequeno da feature; aguardar CI completo verde.
- [ ] Não aplicar migration em produção antes do CI e revisão do diff.
- [ ] Commit: `ci: validar montagem guiada de cestas e kits`.

### Task 12 — Deploy controlado no Supabase e smoke pós-deploy

**Ordem obrigatória**
1. promoção standalone;
2. posições guiadas;
3. reserva explícita;
4. fluxo de lote;
5. deploy da Edge Function/admin.

- [ ] Antes de cada migration, executar query de pré-check de contagem/estado afetado e registrar resultado no PR.
- [ ] Aplicar migrations no projeto canônico `ssbesxgaijknwsjbsbcz` somente após merge/CI verde.
- [ ] Pós-check: kit `Kit Limpeza e Higiene` aparece como modelo comercial único e seus lotes draft continuam indisponíveis publicamente.
- [ ] Pós-check de estoque com SKU controlado: antes, reservar lote, depois; validar `effective_sellable_stock`, `basket_locked_quantity`, `loose_sellable_stock` e reversão por cancelamento.
- [ ] Criar lote de teste em `Em montagem`, confirmar que não aparece no storefront.
- [ ] Marcar montado, manter venda pausada, confirmar que ainda não aparece.
- [ ] Ativar venda e confirmar disponibilidade canônica/checkout; pausar novamente após smoke se lote for apenas de teste.
- [ ] Rodar Supabase advisors; tratar somente regressões introduzidas por esta entrega, sem ampliar escopo para warnings antigos não relacionados.

## Verificação final

Rodar no mínimo:

```bash
node --disable-warning=ExperimentalWarning scripts/test-basket-kit-suggestions.mjs
node --disable-warning=ExperimentalWarning scripts/test-basket-kit-commercial-fields.mjs
node --disable-warning=ExperimentalWarning scripts/test-basket-lot-ops-rules.mjs
node --disable-warning=ExperimentalWarning scripts/test-basket-mounted-edit-print-models.mjs
node --disable-warning=ExperimentalWarning scripts/test-basket-canonical-commerce.mjs
node --disable-warning=ExperimentalWarning scripts/test-basket-canonical-checkout.mjs
node --disable-warning=ExperimentalWarning scripts/test-basket-admin-canonical-api.mjs
node --disable-warning=ExperimentalWarning scripts/test-basket-storefront-canonical.mjs
node --disable-warning=ExperimentalWarning scripts/test-basket-unified-commercial-model.mjs
node --disable-warning=ExperimentalWarning scripts/test-basket-guided-positions-v1.mjs
node --disable-warning=ExperimentalWarning scripts/test-basket-reservation-domain-v1.mjs
node --disable-warning=ExperimentalWarning scripts/test-basket-guided-lot-flow-v1.mjs
node --disable-warning=ExperimentalWarning scripts/test-basket-guided-builder-ui-v1.mjs
```

Depois rodar os browser tests do workflow `Basket kit editor`.

## Estratégia de PRs

Para reduzir risco, executar em PRs pequenos:

1. **PR A:** promoção de kits standalone legados — pode reaproveitar/encerrar a intenção do PR #795.
2. **PR B:** posições guiadas + catálogo de carrossel, sem reserva ainda.
3. **PR C:** domínio de reserva + RPCs de prévia/criação/edição/montagem/cancelamento.
4. **PR D:** UX guiada + browser smoke + CI.
5. **Deploy:** migrations em ordem e smoke controlado após cada marco.

Cada PR deve ter teste RED antes da implementação, GREEN após a implementação, revisão do diff e CI verde antes de merge.