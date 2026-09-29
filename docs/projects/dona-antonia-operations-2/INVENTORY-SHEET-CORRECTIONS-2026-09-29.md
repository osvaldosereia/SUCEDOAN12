# Balanço A4 — correções de releitura, edição estável e conclusão Bling

Data: 2026-09-29

## Ajustes desta rodada

### 1. Cancelar leitura antes de aplicar

A tela de revisão passou a oferecer:
- **Cancelar esta leitura e ler novamente** quando a leitura ainda não gerou efeito em estoque/Bling;
- **Ler novamente para corrigir** quando já houve confirmação parcial;
- **Ler esta folha novamente** mesmo depois de a leitura anterior estar concluída.

Leituras canceladas sem efeito são marcadas como `rejected`, preservando auditoria e saindo das filas operacionais.

### 2. A mesma folha pode ser lida várias vezes

Foi removido o índice único `inventory_sheet_page_scans_one_per_page_uidx`.

A mesma combinação de lote + página pode gerar múltiplos scans ao longo do tempo.

Regras:
- leitura concluída anterior permanece como histórico;
- nova leitura é permitida;
- leituras antigas ainda não concluídas são marcadas como `rejected` quando uma nova leitura da mesma página é criada;
- a nova leitura/correção pode atualizar estoque e gôndola novamente;
- jobs antigos ainda em `queued/retry` podem ser cancelados quando forem superseded por uma nova leitura, enquanto jobs já concluídos permanecem auditáveis.

Migration:
- `20260929141000_inventory_sheet_repeat_reads_v1.sql`

### 3. Edição manual sem salto de tela

O problema de rolagem a cada dígito era causado por reconstrução completa de `inventorySheetReview` em cada evento `input`.

Agora:
- digitar ESTOQUE ou GÔNDOLA altera apenas o estado do item;
- somente selo/botão daquele item e botões gerais são atualizados;
- a lista não é reconstruída a cada tecla;
- foco e posição da tela permanecem estáveis durante a digitação.

### 4. Conclusão do Bling ficou automática

Foi identificada uma inconsistência de estado:
- o Bling já havia verificado os 25 jobs;
- jobs estavam `synced`;
- `inventory_sheet_item_results` continuava em `confirmed`.

Foi criado reconciliador automático:
- `confirmed + Bling synced -> applied`;
- `confirmed + Bling failed/review_required -> error`;
- recalcula `inventory_sheet_page_scans.status`;
- atualiza `applied_at`;
- recalcula conclusão do lote quando todas as páginas possuem pelo menos um scan aplicado.

O reconciliador roda:
- ao abrir/carregar pendências do Balanço;
- antes de aplicar/concluir um scan;
- depois do processamento dos jobs da folha.

### 5. Reparo da folha testada

Folha:
- lote `BAL-260929-92D3B1`;
- página `1/9`.

Validação final em produção:
- 25 produtos;
- 25 `review_state = applied`;
- 25 jobs `synced`;
- 25 jobs com `verified = true`;
- 25/25 saldos no `bling_stock_mirror_v2.physical_total` iguais à quantidade confirmada;
- scan `status = applied`.

Portanto essa página foi atualizada corretamente.

## Produção

- `admin-products-live-v1`: v80 ACTIVE.
- frontend deploy: sucesso.
- `admin-service-intelligence-v1`: fluxo de mirror usando `p_source_resource = stock`.

## Commits

- `79351c17ebadbd8891963e734a2b6b6ad4de7e91` — permite várias leituras da mesma página;
- `8c850f92b9f1f37f2b7b52f3c00e7f932943bc47` — backend cancelar/reler;
- `e6f8e42fe4922be71ba2bef23f511415813ec32d` — edição estável e controles de releitura;
- `1381b6543023c7f4349b235af7840c73c567d474` — reconciliação automática de jobs Bling concluídos.
