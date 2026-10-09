# Dona Antônia — R01 / Arquitetura e checkpoint verificável
Data: 2026-10-08 (America/Cuiaba) · Plano de 14 rodadas: [issue #964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964)

> Auditoria **somente leitura** do Supabase produtivo `ssbesxgaijknwsjbsbcz`; alterações de código confinadas a `agent/orders-r1-audit-tests-20261008`. Nenhuma migration/Edge/cron aplicada, nem envio Meta, NF-e, estoque, pagamento ou pedido real modificado.

## Identidade do checkpoint
- GitHub `main` observado: `28d48841adcc66ddd9fb857cb11226fd74fa93a0` (#963, vitrine).
- Base desta branch: `e0dca8bfea9b60b9f42f9830781d70755cd0b16e` (endurecimento Meta+SEFAZ); parte de `agent/orders-auto-fiscal-outbox-20261008`, dependente do contrato `agent/orders-auto-fiscal-contract-20261008`.
- PR #953 draft para checkout idempotente ainda define número **de quatro dígitos**; nova exigência `DD|MM|YYYY - 001`, reset **semanal** (segunda-feira, America/Cuiaba). **Não mesclar #953 como está.**
- PR #950 draft: inversão de locks na vitrine rápida de acréscimos; conferir concorrência antes de integrar. PR #943 draft: Smart Delivery e Google Route. PR #959 (histórico Meta) e #963 (vitrine resiliente) incorporados à `main`.
- Supabase canônico: PostgreSQL **17.6**, **1.168** migrations registradas (última `20261008205642_admin_attendance_document_live_0975_20261008_v1`), **129** Edge Functions listadas. Apenas branch `main` do Supabase disponível; **ambiente de homologação isolado ainda não preparado**. Migrações legadas não podem ser reaplicadas cegamente.
- Produção observada: **204** pedidos; **22** registros de conclusão da separação; **76** registros `ops2_order_whatsapp_confirmation_v1` (são estados de outbound; **não demonstram aceite Meta autenticado**); **11** jobs em `dispatch_fiscal_jobs` (4 autorizados, 7 exigindo revisão); **0** rotas em `ops_delivery_runs`.
- Flags: `require_fiscal_authorization_before_dispatch=true`; `dispatch_invoice_authorize_enabled=false`; `dispatch_fiscal_canary_enabled=false`; `dispatch_fiscal_human_issue_enabled=true`. Não existe evidência de **worker fiscal automático** ativo.
- `pgmq`, `pg_cron`, `pg_net` instalados; fila PGMQ existente: `agent_core_learning_v1` (não é fiscal). Cron `bling-hub-v2-cycle` ativo; `fiscal-ai-autonomous-worker-v1` inativo. Um cron do hub não comprova emissão de NF-e após separação.

## Mapa de arquitetura (situação e contrato-alvo)

| Fase | Componente/RPC existente | Lacuna e entrega |
|---|---|---|
| Checkout | `orders`, `order_items`, `create_vitrine_cart_order_v3`, `reserve_vitrine_order_stock_v1`, reserva `vitrine_stock_reservations` | Reconciliar PR #953, identidade pública imutável semanal e checkout idempotente sem alterar legado (R03) |
| Meta / WhatsApp | `ops2_whatsapp_outbox_v1`, `ops2_order_whatsapp_confirmation_v1`, `whatsapp-meta-webhook-v1` | Vincular aceite **real** do botão `CONFIRMADO` e assinatura a pedido/canal/evento, antes da ANA; dedupe (R04) |
| Separação | `order_separation_assignments_v1`, `order_separation_items_v1`, `order_separation_completions_v1`, `ops2_prepare_order_separation_completion_v2` | Validar parciais, faltas, conclusão livre de NF-e e recibo original (R05) |
| Composição final | `ops2_apply_order_separation_stock_v2`, snapshots, `basket_stock_allocations` | Confirmar cestas, valores ocultos, descontos, estoque reservado e reconciliação do total (R06) |
| Bling | `bling_hub_jobs_v2`, `bling_hub_entity_links_v2`, `orders.bling_order_id` | Exatidão de linhas/total, recuperação idempotente de HTTP 400/timeout, status verificado (R07) |
| Fiscal | `dispatch_fiscal_jobs`, `ops2_fiscal_dispatch_preflight_v1`, `fiscal_runtime_config`, `check_order_dispatch_fiscal_gate_v1` | Gate Meta+separação+paridade+preflight; fila durável, automação diferente da confirmação humana, conciliação de NF-e prévia e autorização real SEFAZ (R08–R10) |
| Entrega | `ops4_start_dispatch_v1`, `ops_delivery_runs`, controles fiscal e pagamento | Não inferir saída física da NF-e, registrar carregamento/entrega/pagamento de forma idempotente (R11) |
| Operação | Vitrine/Admin, atendimento Meta, relatórios | Observabilidade, histórico e UX sob demanda (R12) |

## Triggers e gates já presentes no runtime
- `orders`: triggers de checkout básico, snapshot/ajustes, mensagem WhatsApp, sincronização de reserva, gate fiscal de saída, gate de pagamento, sincronização logística, encerramento de vitrine de acréscimos.
- `order_separation_items_v1` e `order_separation_completions_v1`: fechamento de janela de acréscimos; conclusão exige atribuição de separador.
- `dispatch_fiscal_jobs`: `trg_ops2_guard_dispatch_fiscal_job_v1` impede escrita fora do contrato.
- As RPCs `ops2_prepare_order_separation_completion_v2`, `ops2_mark_order_separation_completion_v2`, `ops2_apply_order_separation_stock_v2`, `mark_order_dispatch_fiscal_authorized_v1`, `ops4_start_dispatch_v1` usam SECURITY DEFINER, **sem EXECUTE de anon/authenticated** na checagem direta (ponto positivo; rever função por função para garantir service role e search_path corretos).

## Riscos e prioridades (sem afirmar exploração)
1. **P0 — Homologação não existe:** nenhuma branch Supabase isolada válida; R02 exige clone canônico com dados sintéticos, mock de Meta/Bling/SEFAZ e transportes externos OFF. Tentativa anterior de replay de migrations falhou em dependências históricas.
2. **P0 — Fiscal automático não implementado:** o contrato `order-auto-fiscal-policy-v1.mjs` **não é** worker persistente. Não ativar flag, não substituir a subaction de confirmação humana por um “clique” automático fingido. Conciliar `dispatch_fiscal_jobs` antes de escolher outbox versus PGMQ.
3. **P0 — Aceite Meta ainda sem prova ponta a ponta:** tabela de confirmação é evidência de estado de envio, não necessariamente de botão recebido e verificado. `verified_signature` só pode ser produzido no servidor depois da validação do webhook. Texto livre ou campo recebido do browser não autentica.
4. **P0 — Nova numeração não pronta:** PR #953 mantém quatro dígitos. Implementação semanal exige atomicidade sob concorrência, idempotência e compatibilidade com consumidores legados.
5. **P1 — RLS/security:** tabelas sensíveis `orders`, `order_items`, `order_separation_items_v1`, `order_separation_completions_v1`, `dispatch_fiscal_jobs`, `ops2_whatsapp_outbox_v1` estão com RLS ativo. Advisors registraram **1** `anon_security_definer_function_executable`: `ops2_maybe_enqueue_customer_bling_v1`; auditar corpo/grants em branch de correção antes de mudar produção. **37** ocorrências de definer executável para `authenticated`, **3** `function_search_path_mutable`. O linter informou **191** tabelas com RLS sem policy (várias private podem ser intencionais); tratar individualmente, não liberar indiscriminadamente. [Aviso anon-definer](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).
6. **P1 — Desempenho:** advisor informou 67 FKs sem índice de cobertura, 92 índices sem uso registrado; revisar relevância real de cada um antes de criar/remover índices. [FK sem índice](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).
7. **P1 — Divergência GitHub/runtime:** 1.168 migrations e 129 funções Edge, parte implantada enquanto PRs de outras frentes permanecem abertos. Em R02 comparar assinatura/hash das funções **afetadas** com a base canônica e eliminar drift por plano, não por reset geral.
8. **P1 — Produtos fiscais:** a validação fiscal não pode inventar NCM/CEST/tributos. Exceção determinística deve permanecer bloqueada e auditável; preflight antes de qualquer POST irreversível.

## R01 — mudanças e evidências
- **Commit 1:** `4507cca210e9490a1ed694b48389b0433713d45b` — atualiza fixtures e testes do contrato de confirmação Meta assinada, `order_id` e evidência SEFAZ `access_key`/status. Acrescenta testes negativos e reconciliação.
- **Commit 2:** `8d1354eb6f1dc2e4c72a2fa0d1fcc34818ca2260` — restaura disparo do CI da política fiscal na branch R01, adiciona sintaxe e higiene.
- **CI:** [GitHub Actions run #37868582395](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37868582395): `Pedidos - Politica NF-e automatica` **SUCCESS** em `8d1354e`. Não executa integrações ou transações reais.
- **PR:** [#965](https://github.com/osvaldosereia/SUCEDOAN12/pull/965) **draft**, base main, **sem merge**.
- As verificações PostgreSQL concorrentes de R03 e a integração fiscal real continuam para rodadas futuras. Resultado verde do contrato puro não significa conclusão fiscal.

## Entrega esperada da R02
1. Extrair somente a estrutura operacional vigente das tabelas/RPC/triggers necessárias para teste isolado, com dependências explícitas; não transportar dados pessoais.
2. Produzir dataset sintético de pedido/cesta/kits/estoque/falta parcial, Meta fake assinada, Bling e SEFAZ falsos, worker bloqueado externamente.
3. Executar smoke de CRUD e transações, concorrência e rollback, documentar divergências de schema e fases de migração segura.
4. Registrar nova branch/PR draft, matriz de CI PASS/FAIL e atualização na issue #964.
5. Manter `main`, Supabase produção, flags fiscais e integrações reais **intactos**.

## Regras invariantes
Pedido mínimo **R$75 no checkout**; apenas Cuiabá/Várzea Grande; após corte **12h Cuiabá**, entrega no próximo dia elegível; sem domingos/feriados nacionais. Baixas e saída são eventos físicos; NF-e autorizada libera mas não movimenta fisicamente. Nunca repetir POST de NF-e com resultado incerto. Número novo imutável, não reescrever histórico.

**Nota:** documento registra estado observado na R01. Atualizar o checkpoint por rodada; não usá-lo como prova de que uma feature está ativa em produção.
