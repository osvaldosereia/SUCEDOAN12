# STATUS DE RODADAS — DONA ANTÔNIA V2

**Criado:** 2026-10-23  
**NOTA:** planejado não é concluído. Atualizar no final de CADA rodada.

| Rodada | Título | Estado | Evidência |
|---|---|---|---|
| R00 | Auditoria integral e baseline | **Concluída — auditoria documental e baseline** | docs/AUDITORIA_COMPLETA_V2.md; SHA base 1a846beba768192c366937c1462bcfd6baeccee9; CI 40057635884 aprovado |
| R01 | Design system e disciplina de qualidade | **Concluída** | PR #1365; SHA R01 7a02a0da66dbcec6cfd7772da75f748ecb5bd29c; CI 40059800868 e 40059798099 aprovados |
| R02 | Modelagem/migrações para banco isolado | **Concluída; PR aberto, sem merge** | PR #1366; SHA 0ea8f43188ea55db56c176d1c34368a2b4303c10; CI 40061318922 aprovado |
| R03 | Login, RBAC e RLS V2 | Implementada; ambiente V2 aplicado; login pela UI ainda não ensaiado | PR #1367; 6 migrações/24 tabelas; 50 testes; projeto isolado `hjudhofluihkxykwekir`; ~US$10/mês |
| R04 | Importação/reconciliação dos 802 produtos | **Implementação local concluída; carga staging bloqueada por procedência, precisão do custo e login UI** | `docs/AUDITORIA_CAMPOS_BLING_802.md`; dry-run: 802 SKUs únicos, 802 revisões de precisão do custo, 0 vendáveis; 64 testes passam |
| R05 | Cadastro e estoque persistente | Planejada | — |
| R06 | Cestas, tipos e extras persistentes | Planejada | — |
| R07 | Catálogo público dinâmico/performance | Planejada | — |
| R08 | Cotação e checkout transacional | Planejada | — |
| R09 | Pedidos persistentes, quatro abas | Planejada | — |
| R10 | Separação e multioperador | Planejada | — |
| R11 | Inbox WhatsApp humano V2 | Planejada | — |
| R12 | Mensagens Utility Meta por evento | Planejada | — |
| R13 | NF-e Bling pós-separação | Planejada | — |
| R14 | Clientes/entrega/relatórios essenciais | Planejada | — |
| R15 | Auditoria final/performance/homologação | Planejada | — |
| R16 | Piloto/migração autorizada | Planejada | — |

## Histórico anterior às rodadas
- Há protótipo avançado de UI V2 e regras de negócio implementadas e testadas.
- CI R01 mais recente: https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/40059667625; sucesso em lint, auditoria, arquitetura, TS, 39 testes unitários, build e 17 casos E2E.
- /site1 e /admin1 são prÉvias demonstrativas publicadas em rodada anterior; não estão automaticamente sincronizadas com a branch atual.
- Supabase V2 ainda não criado/aplicado; não há checkout real, auth V2 ou atendimento conectado.
- Os bancos legados e site raiz NÃO devem sofrer alterações.

## Modelo de atualização por rodada
### Rxx — [título]
**Data:**  
**SHA inicial:**  
**SHA final:**  
**Estado:**  
**Escopo efetivamente implementado:**  
**Testes executados e resultado:**  
**PR/commits:**  
**Bloqueios/riscos:**  
**Produção legada:** intocada / INCIDENTE (detalhar se houver).  
**Próxima rodada recomendada:**  


## R00 — auditoria integral e baseline
**Data:** 2026-10-23 (Cuiabá)  
**SHA inicial auditado:** 1a846beba768192c366937c1462bcfd6baeccee9  
**SHA final da rodada:** será o commit do PR de documentação nesta branch.  
**Estado:** Concluída.  
**Escopo:** inspeção dos 90 arquivos da pasta V2; comparação entre plano/documentos e implementação; revisão estática das quatro DDLs, workflows, dependências, interface, scripts e testes.  
**Testes:** architecture:check, check, test (35 testes), build e npm audit completos executados localmente; CI de mesma SHA passou todos os gates, inclusive 9 E2E. Browser local não iniciou porque Chromium estava ausente e o download foi inválido. SQL não foi aplicado: não havia PostgreSQL/psql/Docker local. npm audit apontou 4 alertas em dependências dev/importação (2 críticas, 2 moderadas); runtime audit sem alertas.  
**PR/commit:** documentação da R00 em branch agent/dona-antonia-r00-auditoria, direcionada à branch de trabalho agent/dona-antonia-nova-plataforma; sem merge ou publicação.  
**Riscos/bloqueios:** backend/auth/persistência inexistentes; schema exige reconciliação antes de migração; autoridade do estoque e preço pendente; dependências críticas; workflow de preview em main publica automaticamente /site1 e /admin1.  
**Produção legada:** intocada. Supabases existentes não consultados nem alterados.  
**Próxima rodada recomendada:** R01 — atualizar dependências e lockfile, adicionar lint/format e validações de interface, mantendo gate de publicação explícito.


## R01 — design system e disciplina de qualidade
**Data:** 2026-10-24 (UTC)
**SHA inicial:** b4738e895dc246f8bc07af95035cd746e32d7975 (baseline R00)
**SHA final de código:** 7a02a0da66dbcec6cfd7772da75f748ecb5bd29c
**Estado:** Concluída; PR #1365 aberto para revisão, sem merge.
**Escopo:** lockfile reproduzível e atualização de dependências vulneráveis; Node mínimo declarado; ESLint, Prettier e checks no CI; tokens visuais compartilhados; extração de lógica pura da vitrine; testes responsivos e Axe; proteção de publicação manual com confirmação explícita. O CI revelou baixo contraste em cinco grupos de texto; cores ajustadas e revalidadas.
**Testes:** local: `npm ci`, `npm audit --audit-level=moderate` (0 vulnerabilidades), lint, format:check, architecture:check, TypeScript, 39 testes, build e `git diff --check` aprovados. CI 40059800868 e 40059798099: todos os gates aprovados, incluindo Chromium e 17/17 testes de navegador (seis combinações de viewport, duas verificações Axe e nove testes de fluxo existentes).
**PR/commits:** https://github.com/osvaldosereia/SUCEDOAN12/pull/1365; branch `agent/dona-antonia-r01-qualidade`.
**Bloqueios/riscos:** Playwright usa Chromium de CI porque a instalação local do browser não estava disponível; nenhuma integração real de backend foi exercitada nesta rodada.
**Produção legada:** intocada; sem merge, deploy, migração, envio de mensagem ou acesso/escrita em Supabase.
**Próxima rodada recomendada:** R02 — reconciliação do schema, diagrama de entidades, contratos TS e validação de migrações apenas em banco descartável isolado.


## R02 — schema isolado e contratos
**Data:** 2026-10-24 (UTC)
**SHA inicial:** 7a02a0da66dbcec6cfd7772da75f748ecb5bd29c (head remoto de R01)
**SHA de implementação validado:** 0ea8f43188ea55db56c176d1c34368a2b4303c10 (head final da branch R02).
**Estado:** Concluída; PR #1366 aberto, sem merge.
**Escopo:** cadeia de quatro migrações versionadas; schema privado `da_next`, 21 tabelas com RLS fechado e sem policies; constraints para catálogo, pedidos, snapshots, reservas, idempotência, fiscal, auditoria e outbox; tipos TS e contratos de persistência; ERD, ADR e instruções de banco. Propostas duplicadas `db/001–004` removidas.
**Testes locais:** lint, format:check, architecture:check, `npm run test:db` (4 migrações/21 tabelas), TypeScript, 39 testes unitários, build e `npm audit --audit-level=moderate` (0 vulnerabilidades) passaram.
**PR/CI:** PR #1366 — https://github.com/osvaldosereia/SUCEDOAN12/pull/1366; CI 40061111459 aprovado no SHA de implementação acima, incluindo suíte de navegador; sem merge.
**Limites:** PGlite confirma comportamento coberto em PostgreSQL isolado, não substitui Supabase real; nenhum projeto remoto consultado ou alterado. Sem adapter, Auth/RBAC, policies, checkout nem worker.
**Produção legada:** intocada; branch `main`, sites, bancos, atendimento e integrações operacionais intocados.
**Próxima rodada:** R03 — modelo de ator, login/RBAC e policies RLS, com testes de autorização e sem conectar aos Supabase legados.


## R03 — Login, RBAC e policies RLS
**Data:** 2026-10-24 (UTC)
**SHA inicial:** 0ea8f43188ea55db56c176d1c34368a2b4303c10 (head R02)
**Estado:** implementação e bootstrap ADMIN da R03 concluídos no projeto isolado; o Auth confirmou a conta e registrou um acesso. O fluxo de login dentro do admin V2 ainda não foi exercitado ponta a ponta.
**Escopo:** papéis ADMIN/PRODUCTS/SEPARATION/SUPPORT; helper RLS; grants mínimos por tabela/coluna; separação dos preços privados; RPC `public.get_my_staff_role()` sem argumentos; client Supabase Auth, tela de login, sessão validada via `getUser`, navegação por papel e ocultação do campo de preço privado para PRODUCTS.
**Supabase V2:** projeto `Dona Antônia V2`, ref `hjudhofluihkxykwekir`, São Paulo, status ACTIVE_HEALTHY. Seis migrações aplicadas. Verificação SQL: 24 tabelas/24 RLS, 64 policies; `anon` sem `USAGE` no schema privado e sem execução da RPC; `authenticated` pode obter apenas o próprio papel. Convite aceito, e-mail confirmado e `last_sign_in_at` registrado; uma única atribuição ADMIN está ativa. A RPC de papel retornou `ADMIN` ao testar o subject da conta; nenhuma sessão estava ativa no instante da checagem. Custo estimado/confirmado: US$ 10 por mês para compute padrão, faturado por hora.
**Testes locais/CI:** PGlite (6 migrações/24 tabelas/RLS/RBAC positivo e negativo/RPC/revogação/privacidade/rollback); 50 testes unitários; lint, format, arquitetura (79 arquivos), TypeScript, build e `npm audit` (0 vulnerabilidades) aprovados. Playwright local não executou porque Chromium está ausente e o download foi ZIP inválido/zero bytes; CI GitHub #40063869241 passou todos os gates, incluindo os 17 testes E2E.
**Supabase Advisors (24/10/2026):** nenhum alerta de acesso anônimo ao schema privado. Um WARN de SECURITY DEFINER aponta `public.get_my_staff_role()`, intencional e limitada ao papel do próprio usuário autenticado. Performance lista 4 policies com chamada `auth.*` sem initplan, 11 FKs sem índice de cobertura e 38 sobreposições permissivas entre `admin_all` e policies de função; registrar como hardening antes de popular dados. Os 27 índices sem uso são esperados no banco recém-criado e vazio; não removê-los sem carga/consultas representativas. Configuração Auth de no máximo 10 conexões também aparece como INFO.
**Limites:** conta confirmada e acesso Auth registrado, mas o login pela tela do admin V2 e recuperação de senha ainda não foram testados. O dev server local não é alcançável pelo navegador remoto; não foi publicada uma prévia. UI ainda exibe dados demonstrativos; CRUD persistente, checkout e integrações ficam para rodadas posteriores.
**Produção legada:** intocada; nenhuma alteração em `main`, sites públicos, Supabase existente, atendimento ou integração operacional. Nada publicado.
**PR:** #1367 — https://github.com/osvaldosereia/SUCEDOAN12/pull/1367; aberto, sem merge, base R02.
**Próximo passo:** validar o fluxo de login pela tela do admin V2 em ambiente isolado e revisar os achados de Advisor antes de carregar dados. O gate de identidade/bootstrap está atendido. Em seguida, R04 — importação controlada e reconciliação do catálogo Bling.


## R04 — Importação controlada e reconciliação do catálogo Bling
**Data:** 2026-10-24 (UTC)
**Branch:** `agent/dona-antonia-r04-bling-import`, base no head R03 `4ecb9a0f7897611bde18470d57ba4c30febce80b`.
**Estado:** código de validação/dry-run concluído; carga no staging não executada porque a cópia localizada não tem procedência comprovada como export oficial e o login pelo admin V2 ainda não foi ensaiado.
**Escopo implementado:** importador agora tem dry-run sem escrita por padrão; parser aceita CSV delimitado por vírgula, ponto e vírgula ou tab; valida cabeçalho de 59 campos, SKU único, categoria fechada, unidade UN, valores monetários, GTIN/check digit unitário e de embalagem, itens por caixa e formato de NCM/CEST; sinaliza conflitos de GTIN/fiscal e custo com precisão maior que centavos; preserva estoque vazio como desconhecido; separa projeção comercial dos dados fiscais/custo/fornecedor; saída privada requer `--write-to` e recebe modo 0600, com bloqueio de gravação sob `public/`.
**Fonte auditada:** cópia na Library com metadado `model_generated: true`, também indicada no README como gerada na conversa. SHA-256 `80d5733eeee4135c04c461b79c44e2afb42c1916c49eafca76f20e9fcbe1d4e1`. Cabeçalho estruturalmente compatível com 59 colunas; 802 linhas e SKUs únicos; 776 EANs preenchidos e válidos; nenhum EAN duplicado; 802 inativos e saldo em branco; custo com quatro casas decimais em todas as linhas contra schema atual em centavos; 0 vendáveis. Nenhuma linha foi gravada em arquivo derivado, Supabase ou Bling.
**Testes:** `npm test` inclui os casos do importador; 64 testes passam. Dry-run completo: 802 linhas, 802 revisões de precisão do custo, sem SKU/GTIN duplicados ou anomalias de formato NCM/CEST e zero produtos vendáveis. E2E local não iniciou porque o binário Chromium não está instalado; CI #40065336877 passou em lint, audit, arquitetura, PGlite, TS, unitários, build e navegador.
**Produção:** branch `main`, sites, Supabase legado, atendimento e integrações operacionais intocados; nenhuma alteração remota no Supabase V2 e nada publicado.
**Bloqueios:** obter export Bling de origem comprovável; modelar/decidir como preservar custo com quatro casas decimais; executar login pela UI do admin V2; então repetir dry-run antes da carga idempotente ao staging. Saldo físico e autoridade operacional continuam sem resolução; importação não ativará produtos.
**Próxima ação:** encerrar os gates pendentes de R03/R04; em seguida, carregar catálogo validado somente no Supabase V2 isolado. R05 segue bloqueada até a R04 ter aceite completo.
