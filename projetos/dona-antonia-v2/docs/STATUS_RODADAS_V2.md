# STATUS DE RODADAS — DONA ANTÔNIA V2

**Criado:** 2026-10-23  
**NOTA:** planejado não é concluído. Atualizar no final de CADA rodada.

| Rodada | Título | Estado | Evidência |
|---|---|---|---|
| R00 | Auditoria integral e baseline | **Concluída — auditoria documental e baseline** | docs/AUDITORIA_COMPLETA_V2.md; SHA base 1a846beba768192c366937c1462bcfd6baeccee9; CI 40057635884 aprovado |
| R01 | Design system e disciplina de qualidade | **Concluída** | PR #1365; SHA R01 7a02a0da66dbcec6cfd7772da75f748ecb5bd29c; CI 40059800868 e 40059798099 aprovados |
| R02 | Modelagem/migrações para banco isolado | **Concluída; PR aberto, sem merge** | PR #1366; SHA 0ea8f43188ea55db56c176d1c34368a2b4303c10; CI 40061318922 aprovado |
| R03 | Login, RBAC e RLS V2 | **Concluída e ensaiada em prévia privada** | PR #1367; base RBAC 24 tabelas; conta `juniorsereia@gmail.com` ADMIN |
| R04 | Importação/reconciliação dos 802 produtos | **Concluída no staging V2; fonte autorizada como seed, não comprovada como export oficial** | 802 produtos + 802 perfis privados; 0 ativos/estoque; custo exato em 4 casas; tela de login validada; PR #1368 draft |
| R05 | Cadastro e estoque persistente | **Implementação e migrations aplicadas na V2; CI/E2E do branch pendentes** | Branch `agent/dona-antonia-r05-products-stock`, base R04 `4e3ccfba`; V2 `hjudhofluihkxykwekir`, 9 migrations/24 tabelas; 802 produtos sem alteração |
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
- Supabase V2 isolado está ativo e provisionado. Auth V2 e catálogo de produtos estão conectados; checkout persistente, pedidos, atendimento e integrações operacionais continuam pendentes.
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
**Estado:** implementação concluída; conta Auth confirmada e papel ADMIN ativo. A prévia privada oferece login e recuperação de senha. Nenhuma senha foi criada, alterada ou acessada pelo agente.
**Escopo:** papéis ADMIN/PRODUCTS/SEPARATION/SUPPORT; helper RLS; grants mínimos por tabela/coluna; separação dos preços privados; RPC `public.get_my_staff_role()` sem argumentos; client Supabase Auth, tela de login, sessão validada via `getUser`, navegação por papel e ocultação do campo de preço privado para PRODUCTS.
**Supabase V2:** projeto `Dona Antônia V2`, ref `hjudhofluihkxykwekir`, São Paulo, status ACTIVE_HEALTHY. Seis migrações aplicadas. Verificação SQL: 24 tabelas/24 RLS, 64 policies; `anon` sem `USAGE` no schema privado e sem execução da RPC; `authenticated` pode obter apenas o próprio papel. Convite aceito, e-mail confirmado e `last_sign_in_at` registrado; uma única atribuição ADMIN está ativa. A RPC de papel retornou `ADMIN` ao testar o subject da conta; nenhuma sessão estava ativa no instante da checagem. Custo estimado/confirmado: US$ 10 por mês para compute padrão, faturado por hora.
**Testes locais/CI:** PGlite (6 migrações/24 tabelas/RLS/RBAC positivo e negativo/RPC/revogação/privacidade/rollback); 50 testes unitários; lint, format, arquitetura (79 arquivos), TypeScript, build e `npm audit` (0 vulnerabilidades) aprovados. Playwright local não executou porque Chromium está ausente e o download foi ZIP inválido/zero bytes; CI GitHub #40063869241 passou todos os gates, incluindo os 17 testes E2E.
**Supabase Advisors (24/10/2026):** nenhum alerta de acesso anônimo ao schema privado. Um WARN de SECURITY DEFINER aponta `public.get_my_staff_role()`, intencional e limitada ao papel do próprio usuário autenticado. Performance lista 4 policies com chamada `auth.*` sem initplan, 11 FKs sem índice de cobertura e 38 sobreposições permissivas entre `admin_all` e policies de função; registrar como hardening antes de popular dados. Os 27 índices sem uso são esperados no banco recém-criado e vazio; não removê-los sem carga/consultas representativas. Configuração Auth de no máximo 10 conexões também aparece como INFO.
**Limites:** a tela de recuperação e o formulário para definir senha foram verificados visualmente, sem enviar solicitação nem inserir credenciais. A URL padrão Auth que apontava para `localhost:3000` foi corrigida para a prévia privada e duas URLs exatas de callback foram permitidas. Após autenticar, áreas do admin ainda incluem dados demonstrativos; CRUD persistente, checkout e integrações ficam para rodadas posteriores.
**Produção legada:** intocada; nenhuma alteração em `main`, sites públicos, Supabase existente, atendimento ou integração operacional. Nada publicado.
**PR:** #1367 — https://github.com/osvaldosereia/SUCEDOAN12/pull/1367; aberto, sem merge, base R02.
**Próximo passo:** concluída validação da tela; revisar Advisor/hardening em rodada própria antes das operações sensíveis. R04 carregou o seed V2 inativo; próxima é R05 — cadastro/estoque persistentes.


## R04 — Importação controlada e reconciliação do catálogo Bling
**Data:** 2026-10-24 (UTC)
**Branch:** `agent/dona-antonia-r04-bling-import`; PR #1368 draft, base R03, sem merge.
**Estado:** concluída no staging V2 isolado. O usuário autorizou utilizar a cópia gerada/histórica disponível; origem não comprovada como export do Bling.
**Escopo:** importador dry-run por padrão; CSV de 59 colunas; validações de SKU/EAN/fiscal; migração `purchase_cost_exact numeric(12,4)`; preservação de estoque em branco no JSON original privado.
**Carga:** 802 `da_next.products` e 802 `da_next.bling_product_profiles`; 776 GTINs preenchidos; 802 custos exatos e 802 originais com 59 campos; 0 ativos, 0 estoque positivo e 0 vendáveis. Custo comercial fica restrito a perfil privado. CSV não foi comitado.
**Login:** concluído pelo usuário na prévia owner-only `https://dona-antonia-v2-admin-preview.juniorsereia.chatgpt.site/admin/`; `last_sign_in_at` e papel `ADMIN` confirmados no Auth V2. O usuário definiu a própria senha pelo fluxo de recuperação; o agente não acessou a senha.
**Testes:** `format:check`, TypeScript, 64 testes unitários, `architecture:check` e build aprovados durante o empacotamento. Banco: 7 migrações, 24 tabelas/RLS e verificação de contagens. O login foi concluído pelo usuário e corroborado pelo `last_sign_in_at` Auth em 2026-10-24 05:49:40 UTC; sessão visual da UI concluída pelo usuário.
**Limites:** catálogo ainda não alimenta CRUD real do admin nem vitrine; origem do arquivo e saldo físico continuam sem comprovação. Nenhum produto foi ativado; sem integração Bling.
**Produção:** `main`, site público/admin legados, Supabase existente, atendimento e integrações operacionais intocados. A prévia é outro Site privado, owner-only; não houve publicação pública.
**Próxima rodada recomendada:** R05 — adapter e CRUD persistente de produtos/estoque na V2, mantendo o estado inicial não vendável; revisar achados de performance Advisor antes de ampliar as consultas.

## R05 — cadastro e estoque persistente
**Data:** 2026-10-24 (UTC)
**Branch:** `agent/dona-antonia-r05-products-stock`, derivada do head R04 `4e3ccfba7b06dc02a5ae3287d502351cb24aa4bf`; commit/PR e CI ainda pendentes.
**Estado:** implementação local concluída; gates remotos pendentes.
**Escopo implementado:** RPCs com paginação/busca/filtros no servidor; edição/cadastro de SKU, nome, marca, categoria, GTIN, preço, estoque, ativo, foto HTTPS e validade; revisão otimista; ajuste de estoque com motivo, idempotência e ledger; histórico; ficha fiscal/fornecedor em diálogo exclusivo para ADMIN e RPC separado com custo exato textual. Projeção do catálogo não inclui custo nem origem bruta de importação.
**Migrations:** `20261024060000_r05_admin_products.sql` e `20261024061000_r05_private_product_profile.sql`; aplicadas somente ao projeto V2 `hjudhofluihkxykwekir`. Projeto ACTIVE_HEALTHY. A listagem remota permaneceu em 802 produtos e 802 perfis privados; nenhuma linha do catálogo foi editada. Remote ACL verificado: `anon` não executa as RPCs privadas, `authenticated` executa sob guardas de identidade/permissão, `search_path=pg_catalog`.
**Testes locais:** typecheck, lint, format, architecture (89 arquivos), 80 testes unitários, teste DB isolado (9 migrations/24 tabelas/RLS/RBAC/privacidade/rollback) e build aprovados. Playwright local foi executado, mas os 17 casos não iniciaram por falta do executável Chromium. CI do novo commit ainda deve fornecer o gate E2E.
**Advisories:** o Advisor aponta avisos `authenticated_security_definer_function_executable` para RPCs protegidas por checagem explícita de usuário/permissão e `search_path=pg_catalog`, além de alertas gerais já presentes no schema RBAC/policies, FKs e configuração Auth. Não foram alterados achados fora da rodada; revisar hardening antes da homologação final. Link: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
**Pendências:** push/PR draft, CI incluindo Playwright e validação dos resultados; completar cobertura visual/autorização E2E. Upload de imagem por storage e ações em lote não foram implementados. A vitrine permanece em rodada posterior e o seed segue inativo/estoque zero.
**Isolamento:** sem mudanças na `main`, produção, sites legados, Supabases existentes, atendimento ou integrações; nenhuma publicação/deploy.
**Próxima rodada após aprovação dos gates:** R06 — persistir tipos, cestas e extras.
