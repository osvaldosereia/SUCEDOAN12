# R13 — Auditoria de paridade estrutural e segurança do checkout até entrega

**Dona Antônia · 09/10/2026 · plano [#964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964).**
**Branch:** `agent/orders-r13-rls-schema-parity-20261009` sobre R12 [#1021](https://github.com/osvaldosereia/SUCEDOAN12/pull/1021), na cadeia integrada R02–R10 [#1016](https://github.com/osvaldosereia/SUCEDOAN12/pull/1016).

## Auditoria canônica, somente SELECT no Supabase
- Metadados de **11 tabelas críticas** coletados da produção: `orders`, `order_items`, `order_separation_items_v1`, `order_separation_completions_v1`, `vitrine_stock_reservations`, `order_payment_settlements`, `order_payment_parts`, `ops_delivery_stops`, `ops_delivery_runs`, `dispatch_fiscal_jobs`, `order_fiscal_controls`.
- **11/11 com RLS habilitada**, `FORCE ROW LEVEL SECURITY` desligado; **0 políticas explícitas** nessas tabelas. Isso **não significa acesso público total**: na ausência de políticas, RLS funciona como negação por padrão para papéis sujeitos a ela. Proprietário da tabela e service-role podem ter bypass, requerendo validação contextual.
- **30 triggers de usuário ativos** nessas tabelas da instância canônica, incluindo validação básica de checkout, envio de WhatsApp, sincronização de reserva, número de entrega, pagamentos e gate fiscal legado. A fixture de laboratório R02–R12 simula apenas parte deles.
- **5 tabelas críticas** (`dispatch_fiscal_jobs`, `ops_delivery_runs`, `ops_delivery_stops`, `order_payment_parts`, `order_payment_settlements`) possuem `TRUNCATE`, `TRIGGER` e/ou `REFERENCES` concedidos ao `anon`/`authenticated`. Junto com as outras 24 identificadas na R02, a revisão de ACL permanece urgente. RLS não limita `TRUNCATE`.
- Esta auditoria leu somente nomes/grants/flags dos catálogos PostgreSQL: **nenhuma transação de cliente, endereço, CPF, pedido, nota ou pagamento foi lida**, e nenhuma alteração foi feita.

## Código executável desta etapa
- `scripts/fixtures/orders-r13-canonical-schema-security-20261009.json`: fotografia de metadados capturados por consulta somente leitura; data e ausência de dados pessoais explícitas. **Não representa um backup de produção.**
- `scripts/test-orders-r13-schema-security-parity.mjs`: compara os objetos da fotografia com os de um banco PostgreSQL 17 **descartável** após executar a suíte integrada R02–R12. Mostra tabelas ausentes, triggers não reproduzidos, RLS ainda desligada e concessões de risco no laboratório; exibe também as concessões já existentes na produção. Produz arquivo JSON, sumário GitHub Actions e comando `--require-parity` que **retorna erro** se faltar paridade.
- `scripts/test-orders-r13-schema-security-unit.mjs`: testes negativos para ausência de tabela, trigger, RLS e grant perigoso; teste positivo para cópia estrutural coerente. O teste **não dá autorização de produção** mesmo quando a comparação não tem diferenças.
- Workflow `.github/workflows/orders-r2-r7-bling-chain-ci.yml`: mantém o caminho R02→R12 já existente com checkout verdadeiro em catálogo fictício, número R03, Meta fictícia, fechamento R06, intent R07, R08 bloqueado, observação GET fictícia R09, prova SEFAZ fictícia R10, guarda de carga R11 e pagamento dividido R12; ao final executa relatório R13 **na mesma instância efêmera**, publica artifact com gaps de paridade e testa a revisão de grants em **outro banco descartável** usando o SQL anteriormente aprovado em CI.

## Restrições e critério de liberação
- **R13 não está homologada em clone completo.** Uma CI verde significa que os TESTES e o RELATÓRIO rodaram corretamente; o relatório **deve continuar indicando `ready_for_canonical_staging=false`** enquanto RLS e triggers não forem reproduzidos e grants reais corrigidos em uma migração revisada.
- O laboratório usa tabelas mínimas e alguns helpers simplificados. Ainda faltam regras RLS/Edge/canais de WhatsApp/estoque Bling real/IBS-CBS e rotinas de cancelamento, expedição e estorno em ambiente fiel.
- O script `supabase/sql/orders-security-public-table-privileges-review-v1.sql` continua somente rascunho; nenhum REVOKE foi aplicado. Revisar roles/owners, gerar migration pela CLI, ensaiar rollback e fazer a correção validada em staging antes de agendar produção.
- O emissor fiscal de R10 **permanece bloqueado** sem aprovação tributária de saída confiável, verificação documental/retorno fiscal verdadeiro e canário autorizado. Meta, Bling e SEFAZ reais não foram chamados.
- A branch/PR não altera `main`, banco de produção, dados de clientes, rotas, pagamentos, estoque, notas ou mensagens.

## Próximo passo técnico
1. Executar e confirmar CI no HEAD, sanar eventuais problemas nos novos testes.
2. Extrair com segurança, somente leitura, as definições dos 30 triggers e dependências *necessárias*, construir clone fiel RLS/ACL/roles em Supabase local isolado, mantendo transações fictícias.
3. Confrontar as alterações R02–R12 contra o esquema atual por migration dry-run e teste de rollback. Resolver as incompatibilidades antes de integrar PRs.
4. Iniciar R14 somente com parecer fiscal assinado, template Meta válido, E2E do Bling/SEFAZ homologado e staging canônico aprovado; publicar por canário gradual sob revisão.

**A programação horária permanece independente desta branch. Não há cron novo nesta PR.**
