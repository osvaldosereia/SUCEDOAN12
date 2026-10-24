# STATUS DE RODADAS — DONA ANTÔNIA V2

**Criado:** 2026-10-23  
**NOTA:** planejado não é concluído. Atualizar no final de CADA rodada.

| Rodada | Título                                    | Estado                                                                                      | Evidência                                                                                                                               |
| ------ | ----------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| R00    | Auditoria integral e baseline             | **Concluída — auditoria documental e baseline**                                             | docs/AUDITORIA_COMPLETA_V2.md; SHA base 1a846beba768192c366937c1462bcfd6baeccee9; CI 40057635884 aprovado                               |
| R01    | Design system e disciplina de qualidade   | **Concluída**                                                                               | PR #1365; SHA R01 7a02a0da66dbcec6cfd7772da75f748ecb5bd29c; CI 40059800868 e 40059798099 aprovados                                      |
| R02    | Modelagem/migrações para banco isolado    | **Concluída; PR aberto, sem merge**                                                         | PR #1366; SHA 0ea8f43188ea55db56c176d1c34368a2b4303c10; CI 40061318922 aprovado                                                         |
| R03    | Login, RBAC e RLS V2                      | **Concluída e ensaiada em prévia privada**                                                  | PR #1367; base RBAC 24 tabelas; conta `juniorsereia@gmail.com` ADMIN                                                                    |
| R04    | Importação/reconciliação dos 802 produtos | **Concluída no staging V2; fonte autorizada como seed, não comprovada como export oficial** | 802 produtos + 802 perfis privados; 0 ativos/estoque; custo exato em 4 casas; tela de login validada; PR #1368 draft                    |
| R05    | Cadastro e estoque persistente            | **Concluída; PR draft sem merge/publicação**                                                | PR #1369; código SHA `36c8b478`; CI #40069099198 aprovado (inclui 17 E2E); migrations V2/9 no projeto isolado; 802 produtos preservados |
| R06    | Cestas, tipos e extras persistentes       | **Concluída; PR draft sem merge/publicação**                                                 | PR #1370 draft; implementação `2c42f6ec`, docs `d45e6a90`; CI #40090765643 aprovado (17/17 E2E); V2 11 migrations/26 tabelas |
| R07    | Catálogo público dinâmico/performance     | **Concluída; PR draft sem merge/publicação**                                                     | PR #1371 draft; código `677bb081`, docs `1ef0b2f4`; CI #40091732365 e checkpoint #40092012827 aprovados (17/17 E2E); sem migration V2 nova |
| R08    | Cotação e checkout transacional           | **Concluída em staging isolado; PR #1374 draft sem merge/publicação**                         | migration `20261024083000_r08_public_checkout.sql`; Supabase V2 12 migrations; CI #40094688858 aprovado, incluindo smoke browser |
| R09    | Pedidos persistentes, quatro abas         | **Concluída em staging isolado; PR #1375 draft sem merge/publicação**                     | branch `agent/dona-antonia-r09-orders-four-tabs`; commit `2a912ee3`; migration V2 13/27; CI #40096134747 aprovado (17/17 E2E) |
| R10    | Separação e multioperador                 | **Concluída em staging isolado; PR draft sem merge/publicação**                              | branch `agent/dona-antonia-r10-separation-concurrency`; migration V2 14/27; testes locais e CI final aprovados                          |
| R11    | Inbox WhatsApp humano V2                  | **Concluída em staging isolado; PR draft sem merge/publicação**                             | branch `agent/dona-antonia-r11-whatsapp-inbox`; migration V2 15/27; CI #40098948246 aprovado (17/17 E2E); ACL remota aprovada       |
| R12    | Mensagens Utility Meta por evento         | **Concluída em staging isolado; PR draft sem merge/publicação**                             | PR #1381; head `e55582f5`; CI #40101770367 aprovado (111 testes e 17 E2E); V2 18 migrations/30 tabelas; 0 mensagens/outbox              |
| R13    | NF-e Bling pós-separação                  | **Concluída em staging isolado; PR draft sem merge/publicação** | PR #1382; head `f1af5906`; CI #40102849252 aprovado (17/17 E2E); V2 19 migrations/32 tabelas; 802 produtos/perfis preservados; 0 pedidos/documentos |
| R14    | Clientes/entrega/relatórios essenciais    | **Concluída em staging isolado; PR draft sem merge/publicação** | PR #1384; head `c97cb236`; CI #40115614242 aprovado (16/16 E2E após correção da expectativa); V2 20 migrations/33 tabelas; 802 produtos/perfis preservados |
| R15    | Auditoria final/performance/homologação   | **Concluída em V2 isolada; bloqueios de homologação documentados** | PR #1394; head `5344a6c3`; código `8aa59fe0`; CI #40132993673 + checkpoint final #40133495710 aprovado (18/18 E2E), testes locais 124/124, auditoria sintética 802 produtos/3 operadores, npm audit sem vulnerabilidades; Lighthouse/backup remoto pendentes |
| R16    | Pré-voo para staging isolado            | **Bloqueada; não concluída** | PR #1396 draft; código `390a0bd`; CI #40138207500 (push) e #40138209762 (PR) verdes, 18/18 E2E; testes locais 132/132; seed aprovado; três gates operacionais bloqueados; produção fora do escopo |

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
**Branch:** `agent/dona-antonia-r05-products-stock`, derivada do head R04 `4e3ccfba7b06dc02a5ae3287d502351cb24aa4bf`. Código: SHA `36c8b4780840e30c332a47c65d57045b40876d8a`. PR #1369 draft, sem merge. Checkpoint complementar: commit `ccbffc863e484a6c6dd226ee8bc2fba3d8c4127b` em `docs/R05_EVIDENCIAS_ENCERRAMENTO.md`.
**Estado:** Concluída; CI de código passou. O commit documental complementar também passou pelo CI #40069221500.
**Escopo implementado:** RPCs com paginação/busca/filtros no servidor; edição/cadastro de SKU, nome, marca, categoria, GTIN, preço, estoque, ativo, foto HTTPS e validade; revisão otimista; ajuste de estoque com motivo, idempotência e ledger; histórico; ficha fiscal/fornecedor em diálogo exclusivo para ADMIN e RPC separado com custo exato textual. Projeção do catálogo não inclui custo nem origem bruta de importação.
**Migrations:** `20261024060000_r05_admin_products.sql` e `20261024061000_r05_private_product_profile.sql`; aplicadas somente ao projeto V2 `hjudhofluihkxykwekir`. Projeto ACTIVE_HEALTHY. A listagem remota permaneceu em 802 produtos e 802 perfis privados; nenhuma linha do catálogo foi editada. Remote ACL verificado: `anon` não executa as RPCs privadas, `authenticated` executa sob guardas de identidade/permissão, `search_path=pg_catalog`.
**Testes:** local: typecheck, lint, format, architecture (89 arquivos), 80 testes unitários, teste DB isolado (9 migrations/24 tabelas/RLS/RBAC/privacidade/rollback) e build aprovados. Playwright local foi executado, mas os 17 casos não iniciaram por falta do executável Chromium. CI #40069099198 aprovou auditoria, lint/formato, arquitetura, migrações PostgreSQL, TypeScript, testes unitários, build e navegador mobile/desktop; 17/17 E2E passaram. CI #40069221500 aprovou o commit documental complementar.
**Advisories:** o Advisor aponta avisos `authenticated_security_definer_function_executable` para RPCs protegidas por checagem explícita de usuário/permissão e `search_path=pg_catalog`, além de alertas gerais já presentes no schema RBAC/policies, FKs e configuração Auth. Não foram alterados achados fora da rodada; revisar hardening antes da homologação final. Link: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
**Pendências fora de R05:** upload de imagem por Storage, ações em lote e vitrine dinâmica permanecem em rodadas posteriores. Seed segue inativo/estoque zero.
**Isolamento:** sem mudanças na `main`, produção, sites legados, Supabases existentes, atendimento ou integrações; nenhuma publicação/deploy.
**Próxima rodada:** R06 — persistir tipos, cestas e extras.

## R06 — tipos, cestas e extras persistentes

**Data:** 2026-10-24 (UTC)
**Branch/base:** `agent/dona-antonia-r06-baskets-types-extras`, derivada do head R05 `397635d0085bac6042b4b408df185d6992755c51`; PR #1370 draft, head `2c42f6ec6b791d2e346995a8e5711d0223c86159`.
**Estado:** Concluída; PR permanece draft e sem merge/publicação.
**Escopo implementado:** adapter administrativo com revisão CAS; CRUD/ordenação de tamanhos e tipos, vínculos, quantidades, extras, foto HTTPS e ajuste privado; projeção pública server-side com apenas campos vendáveis e `startingTotalCents`, sem composição/ajuste privado no JSON; vitrine usa o RPC público quando as variáveis publishable da V2 estão configuradas e conserva fallback demonstrativo controlado.
**Migrações:** `20261024070000_r06_basket_configuration.sql` e `20261024120000_r06_public_catalog_concurrency.sql`, aplicadas somente em `hjudhofluihkxykwekir`. Remoto confirmou 11 migrações/26 tabelas, 802 produtos e 802 perfis privados sem alteração; `get_storefront_catalog()` respondeu via REST com chave publishable como `anon`, enquanto o RPC administrativo respondeu 401/42501. Revisão singleton inicia em 1 e gravações obsoletas são rejeitadas com `40001` no teste PostgreSQL.
**Verificações locais:** `npm run check`, `npm run lint`, `npm run format:check`, `npm run architecture:check` (97 arquivos), `npm test` (87/87), `npm run test:db` (11 migrações/26 tabelas, RLS/RBAC, CAS, projeção pública e privacidade) e `npm run build` passaram. Playwright local continua sem Chromium.
**CI:** workflow #40090765643 passou auditoria, lint/formato, arquitetura, migrações PostgreSQL, TypeScript, 87 testes unitários, build e 17/17 E2E; logs registram `17 passed (15.8s)`.
**Limite documentado:** o seed remoto permanece inativo/estoque zero; por isso o endpoint público real retorna catálogo vazio até ativação deliberada de produtos. A integração de vitrine e o contrato seguro estão testados, mas não houve homologação comercial nem ativação de estoque nesta rodada.
**Isolamento:** sem merge, deploy ou publicação; áreas legadas e integrações operacionais intocadas.
**Próxima rodada:** R07 — catálogo público dinâmico e performance de abertura.

## R08 — cotação e checkout transacional

**Data:** 2026-10-24 (UTC)
**Branch/base:** `agent/dona-antonia-r08-quote-checkout`, derivada do head R07 `ecc198ef76b92d76f22f614738f467f2ddb88cf4`; PR draft será aberto contra R07, sem merge/publicação.
**Estado:** Concluída em staging V2 isolado; CI remoto aprovado.
**Escopo implementado:** contrato de checkout com endereço restrito a Cuiabá/Várzea Grande, pedido mínimo de R$ 75, corte às 12h, domingos/feriados configuráveis, pagamento na entrega e CPF opcional; formulário acessível e responsivo com rascunho em `sessionStorage`; retry preserva carrinho/dados e evita duplo clique. O adapter chama RPCs públicas que retornam apenas cotação/recibo, sem ajuste privado ou preço individual de componente da cesta.
**Servidor:** migration `20261024083000_r08_public_checkout.sql` cria feriados, sequência de pedido, cotação server-side, validação de SKU/atividade/validade/estoque, preço agregado com ajuste interno, reserva transacional por 30 minutos e criação idempotente por `idempotencyKey`. O recibo público contém somente id, número, total, status `NOVO` e `replayed`.
**Supabase V2:** migration aplicada somente em `hjudhofluihkxykwekir`; remoto confirmou 12 migrations, 802 produtos, 802 perfis privados, 0 pedidos antes de homologação, execução anônima somente das duas RPCs públicas e acesso anônimo negado à tabela de feriados. Nenhuma linha de produto/perfil foi alterada; produção e projetos legados intocados.
**Testes locais:** `npm run test:db` (12 migrations/27 tabelas, RPC pública, RLS/RBAC, cotação, reserva e replay idempotente), `npm test` (97/97), `npm run check`, lint, `format:check`, `architecture:check` (108 arquivos), `build` e `git diff --check` aprovados. Playwright local não iniciou por ausência do Chromium. CI #40094688858 aprovou todos os gates, instalou Chromium no ambiente de teste e passou o smoke test mobile/desktop.
**Limites/riscos:** feriados móveis dependem de cadastro na tabela privada antes da homologação; o seed continua inativo/estoque zero, então não houve pedido real. A migration usa SECURITY DEFINER apenas nas duas RPCs públicas, com `search_path=pg_catalog`, payload validado, campos privados fora do retorno e RLS/ACL fechados.
**Próxima rodada:** R09 — pedidos persistentes em quatro abas, consumindo os pedidos `NOVO` sem alterar a operação legada.

## R09 — pedidos persistentes em quatro abas

**Data:** 2026-10-24 (UTC)
**Branch/base:** `agent/dona-antonia-r09-orders-four-tabs`, derivada do head R08 `6bbf6f49ccc40b4cd67d38ffa10e9ee46773737c`; PR #1375 draft contra `agent/dona-antonia-r08-quote-checkout`, sem merge/publicação. Commit remoto `2a912ee3e3ab2cc00c324f400b6b952e63e0f980`.
**Estado:** Concluída; CI remoto aprovado. PR permanece draft e sem merge/publicação.
**Escopo implementado:** RPC autenticada paginada `admin_list_orders` com busca server-side por número, nome e telefone; `admin_get_order` com endereço, cliente, estados auxiliares, snapshots e itens; adapter Supabase e painel administrativo persistente com exatamente quatro abas. O total é o agregado confirmado pelo servidor; componentes de cesta não recebem preço unitário e o ajuste privado nunca é projetado. O modo demonstrativo anterior fica restrito à prévia sem Supabase configurado.
**Supabase V2:** migration `20261024100000_r09_admin_orders_read.sql` aplicada somente em `hjudhofluihkxykwekir`. Verificação remota: ACL `anon` negada e `authenticated` permitida nas duas RPCs; 13 migrations, 802 produtos, 802 perfis privados e 0 pedidos. Nenhuma linha de catálogo/perfil foi alterada.
**Testes locais:** `npm run test:db` (13 migrations/27 tabelas, RLS/RBAC, busca/detalhe e privacidade), `npm test` (100/100), `npm run check`, `npm run lint`, `npm run format:check`, `npm run architecture:check` (112 arquivos) e `npm run build` passaram. Playwright local não executou porque Chromium não está instalado; CI #40096134747 passou todos os gates e 17/17 E2E mobile/desktop com Chromium.
**Bloqueios/riscos:** sem pedido real no staging, não foi possível demonstrar visualmente um pedido recém-confirmado em `NOVO`; o contrato, RPC e painel estão prontos para a homologação com seed vendável. O Advisor registra o novo aviso esperado de `SECURITY DEFINER` para as duas RPCs autenticadas, além dos avisos anteriores de policies/FKs; todos permanecem registrados para hardening posterior.
**Produção legada:** intocada; sem alterações em `main`, sites/admin legados, Supabases legados, atendimento, Bling/Meta operacional, DNS, workflows de produção, merge, deploy ou publicação.
**Próxima rodada:** R11 — inbox WhatsApp humano desacoplado, sem migrar o legado.

## R10 — separação robusta e concorrência

**Data:** 2026-10-24 (UTC)
**Branch/base:** `agent/dona-antonia-r10-separation-concurrency`, derivada exatamente do head remoto R09 `217c515405162db9506d4b2829365ec4d324e336`; PR draft será aberto contra `agent/dona-antonia-r09-orders-four-tabs`, sem merge/publicação.
**Estado:** concluída em staging V2 isolado; PR #1376 permanece draft e sem merge/publicação.
**Escopo implementado:** `admin_apply_order_command` transacional com lock `FOR UPDATE`, claims por operador, versão esperada, retry idempotente por `(order_id, command_id)` e fingerprint, comandos START/MARK/FINISH/DELIVER, conferência SEPARADO/FALTOU, abatimento proporcional de cesta e extras no total com limite não-negativo, outbox, eventos e auditoria. Falha fiscal não impede `PRONTO`; não há worker, emissão fiscal, Meta ou Bling acionado.
**Admin V2:** detalhe versionado com ações de iniciar separação, marcar item separado/faltou, concluir como pronto, marcar entregue e imprimir; conflito de versão retorna mensagem de atualização por outro operador. Exatamente quatro abas permanecem.
**Supabase V2:** migration local `20261024130000_r10_order_commands.sql` aplicada exclusivamente ao projeto `hjudhofluihkxykwekir`; remoto registrou 14 migrations, ACL `anon=false`/`authenticated=true` para a RPC de comando, 802 produtos, 802 perfis privados e 0 pedidos. Nenhuma linha de catálogo/perfil foi alterada.
**Testes locais:** `npm test` (101/101), `npm run test:db` (14 migrations/27 tabelas, ACL/RBAC, claim concorrente, retry idempotente, total não-negativo, fiscal pendente e auditoria), `npm run check`, lint, `format:check`, `architecture:check` (112 arquivos), build e `git diff --check` passaram. Playwright local segue sem Chromium; CI #40097766424 passou todos os gates e confirmou `17 passed (16.9s)` no navegador mobile/desktop.
**Advisors:** os avisos esperados de `SECURITY DEFINER`, RLS/policies, FKs e Auth permanecem registrados; a nova RPC usa `search_path=pg_catalog`, guarda `orders.separate`, ACL fechada para anon e não expõe preços privados.
**Limites:** staging permanece com seed inativo/estoque zero e 0 pedidos; portanto a aceitação visual de uma separação real fica reservada à homologação com seed vendável. Não foi criado custo novo, nem houve deploy/publicação/merge.
**Próxima rodada:** R11 — inbox WhatsApp humano desacoplado, sem migrar o legado.

## R12 — mensagens utilitárias Meta por evento

**Data:** 2026-10-24 (UTC)
**Branch/base:** `agent/dona-antonia-r12-meta-utility`, derivada exatamente do head R11 `6f2e00826b1b31ba12d34f65edbd53d93ba8148c`; PR #1381 draft contra `agent/dona-antonia-r11-whatsapp-inbox`, sem merge/publicação. Head de implementação `e55582f531c57169a2e708a668fe09d5a5c0e869`; checkpoint documental `5889395ff91fe26ffe0fd28101a0335f378c4a39`.
**Estado:** concluída em staging V2 isolado; CI remoto aprovado.
**Escopo implementado:** registro de templates Utility por conta, triggers de eventos de pedido para outbox transacional, chave idempotente com revisão/recipiente/conta, RPC autenticada de listagem, estados de entrega/leitura/erro, retry limitado a três tentativas, orçamento diário por conta e hardening das policies RLS novas. As contas iniciam desabilitadas, templates iniciam pendentes/inativos e não existe worker Meta.
**Supabase V2:** migrations R12 `20261024150000_r12_meta_utility`, `20261024150500_r12_meta_utility_policy_hardening` e `20261024151000_r12_meta_utility_budget` aplicadas somente em `hjudhofluihkxykwekir`; remoto confirmou 18 migrations, três tabelas Utility, oito templates pendentes/inativos, zero mensagens e zero itens de outbox Utility. ACL: anon não executa a listagem; authenticated executa os RPCs sob guardas de permissão. 802 produtos e 802 perfis privados não sofreram alteração.
**Testes locais:** `npm test` (111/111), `npm run test:db` (18 migrations/30 tabelas, RLS/RBAC positivo/negativo, trigger, replay, retry e orçamento), `npm run check`, `npm run lint`, `npm run format:check`, `npm run architecture:check` (122 arquivos), `npm run build` e `git diff --check` passaram. Playwright local não executou por ausência do Chromium; CI #40101770367 passou todos os gates e o navegador mobile/desktop.
**Advisors:** o pós-migration não adicionou novas policies permissivas sobrepostas nas três tabelas R12; permanecem apenas achados históricos de SECURITY DEFINER/policies/FKs/Auth já documentados. As funções R12 mantêm `search_path=pg_catalog`, validação explícita de permissão e ACL sem anon.
**Limites:** nenhum template foi aprovado/ativado, nenhuma conta/número de teste foi habilitada, nenhum worker ou request Meta foi executado e o atendimento legado não foi tocado. Não houve custo novo, merge, deploy ou publicação.
**Próxima rodada:** R15 — segurança, performance, custos e homologação.

## R13 — emissão fiscal via Bling (orquestração isolada)

**Data:** 2026-10-24 (UTC)  
**Branch/base:** `agent/dona-antonia-r13-bling-fiscal`, derivada exatamente do head R12 `5b41a0793f23296e533e0812c6df1789f2fc821a`; PR #1382 draft contra `agent/dona-antonia-r12-meta-utility`, sem merge/publicação. Head de implementação `f1af5906a91c1107216f250c3b3ca7c2925ade8c`.  
**Estado:** Concluída em staging V2 isolado; CI remoto aprovado.  
**Escopo implementado:** snapshot privado dos itens; contexto tributário explícito (UF destino, CFOP, CST/CSOSN, regime, NCM/CEST/origem); solicitação autenticada somente após separação (PRONTO/ENTREGUE); outbox idempotente por documento/tentativa; reconciliação autenticada de EMITIDA/ERRO; chave de acesso validada; retry limitado a três tentativas; erro fiscal visível sem alterar o status operacional do pedido. Não há OAuth, token, HTTP, worker ou chamada ao Bling real.  
**Banco isolado:** migration `20261024160000_r13_bling_fiscal.sql` aplicada exclusivamente em `hjudhofluihkxykwekir`. Verificação remota: 19 migrations; 802 produtos; 802 perfis privados; 0 pedidos; 0 documentos fiscais; 0 itens/eventos fiscais; `anon=false` e `authenticated=true` para os RPCs de administração. Novas tabelas possuem RLS e policy única `admin.all`; produtos e perfis não sofreram alteração. Advisors mantêm somente alertas históricos do schema/Auth e as duas SECURITY DEFINER autenticadas esperadas pelos RPCs novos.  
**Testes locais:** `npm test` (115/115), `npm run test:db` (19 migrations/32 tabelas, RLS/RBAC, snapshot, retry e idempotência), `npm run check`, `npm run lint`, `npm run format:check`, `npm run architecture:check` (126 arquivos), `npm run build` e `git diff --check` passaram. Playwright local foi tentado e bloqueado pela ausência do Chromium; CI #40102849252 instalou Chromium e confirmou os 17 testes de navegador.  
**Limites/isolamento:** sem credenciais, integração operacional, custo novo, merge, deploy ou publicação; `main`, sites públicos/admin legados, Supabases legados, atendimento, Bling/Meta operacionais, DNS e workflows de produção permaneceram intocados.  
**Próxima rodada:** R14 — clientes, entrega e relatórios essenciais.

## R14 — clientes, entrega e relatórios essenciais

**Data:** 2026-10-24 (UTC)  
**Branch/base:** `agent/dona-antonia-r14-customers-delivery-reports`, derivada exatamente do checkpoint R13 `60d08bdaaf54fc79bf36fb6151216018b61dd81e`; PR #1384 draft contra `agent/dona-antonia-r13-bling-fiscal`, sem merge/publicação. Head final `c97cb23616a01fb1354919d30d4b3cce77bc308c`.  
**Estado:** Concluída em staging V2 isolado; CI remoto aprovado.  
**Escopo implementado:** busca protegida de clientes por nome/telefone; detalhes, endereços recorrentes e histórico de pedidos; resultado da entrega `CONCLUIDA`/`PROBLEMA` com observação limitada a 500 caracteres e chave idempotente; relatório operacional por período com pedidos, total confirmado, etapas, entrega e fiscal; painéis responsivos Clientes/Relatórios e confirmação de entrega na ficha do pedido. Nenhum módulo de rotas/motoristas foi criado.  
**Banco isolado:** migration `20261024170000_r14_customers_delivery_reports.sql` aplicada exclusivamente em `hjudhofluihkxykwekir`. Remoto confirmou 20 migrations, 33 tabelas, 802 produtos, 802 perfis privados, 0 clientes, 0 pedidos e 0 eventos de entrega; RPCs novas com `anon=false` e `authenticated=true`; `delivery_events` com RLS e leitura operacional. Advisors: 3 achados históricos RLS sem policy, 3 SECURITY DEFINER anônimos históricos, 25 funções SECURITY DEFINER autenticadas esperadas e proteção de senha vazada desativada.  
**Testes locais:** `npm test` (121/121), `npm run test:db` (20 migrations/33 tabelas, RBAC/RLS, privacidade, histórico, relatório e retry de entrega), `npm run check`, `npm run lint`, `npm run format:check`, `npm run architecture:check` (134 arquivos), `npm run build` e `git diff --check` passaram. Playwright local permanece limitado pela ausência do Chromium; CI #40115614242 passou a suíte browser e confirmou o fluxo atualizado de navegação.  
**Limites/isolamento:** sem envio externo, custo novo, merge, deploy ou publicação; `main`, sites públicos/admin legados, Supabases legados, atendimento, Bling/Meta operacionais, DNS e workflows de produção permaneceram intocados.  
**Próxima rodada:** R15 — segurança, performance, custos e homologação.
\n## R15 — auditoria final, performance, custos e homologação\n\n**Data:** 2026-10-24 (UTC)  \n**Branch/base:** `agent/dona-antonia-r15-audit-homologacao`, derivada do head R14 `09a871b54059fbc75ef4546bb45fc3484b98f086`; PR #1394 draft contra `agent/dona-antonia-r14-customers-delivery-reports`, sem merge/publicação. Head final `5344a6c3bf479c9f1fc43fee000f27ea5fc841ca` (código `8aa59fe0fee9244b2db0ecee05044b0ef30fdd7d`).  \n**Estado:** Concluída tecnicamente na V2 isolada, com bloqueios de homologação real documentados; checkpoint documental #40133495710 aprovado. Não foi marcada como produção-ready.  \n**Escopo implementado:** módulo puro de classificação de Core Web Vitals com metas LCP <= 2,5 s, INP <= 200 ms e CLS <= 0,1; auditoria estática de segredos e bundle; probe sintético de 802 produtos e três operadores; teste Playwright dedicado para carga de catálogo e erros de página; critérios explícitos para não transformar métrica não medida em aprovação.  \n**Evidência de performance:** `npm run r15:audit` passou com 802 itens, três operadores e maior duração local de 20,26 ms (alvo <= 2.000 ms), sem segredos detectados; bundle JS/CSS local de 669.507 bytes, maior asset `demo-extra` com 451.987 bytes — fixture demonstrativa, não catálogo remoto. O CI #40132993673 instalou Chromium e passou os 18 testes de navegador.  \n**Verificações locais:** `npm test` (124/124), `npm run test:db` (20 migrations/33 tabelas, RLS/RBAC, privacidade e rollback), `npm run check`, lint, `format:check`, arquitetura (136 arquivos), build, `git diff --check`, `npm audit --audit-level=moderate` (0 vulnerabilidades) e `npm run r15:audit` passaram. Playwright local executou 18 casos e foi bloqueado exclusivamente pela ausência do executável Chromium; não foi instalado download adicional.  \n**Supabase V2 remoto:** projeto ACTIVE_HEALTHY em PostgreSQL 17.11; 20 migrations, 33 tabelas, RLS habilitado em todas, 802 produtos, 802 perfis privados, 0 clientes, 0 pedidos, 0 documentos fiscais e 0 eventos de entrega. Security Advisors mantêm 3 tabelas históricas RLS sem policy, 3 funções SECURITY DEFINER anônimas históricas, 25 funções SECURITY DEFINER autenticadas esperadas e proteção contra senha vazada desativada; nenhum achado foi escondido ou alterado nesta rodada. Logs consultados na janela de auditoria retornaram entradas de pgbouncer, PostgREST, Auth, Edge, Postgres e auditoria Auth, sem ativar tráfego operacional.  \n**LGPD/privacidade:** o probe não encontrou tokens/chaves em código de produção; preços privados e campos fiscais permanecem fora da projeção pública; não foram criados clientes ou pedidos reais. Isso é evidência técnica de isolamento, não parecer jurídico.  \n**Backup/restore e homologação:** nenhum restore remoto destrutivo foi executado. O ensaio local de rollback permanece coberto pelo `test:db`; um backup/restore real do projeto exigiria cópia/branch ou operação destrutiva e não foi feito para evitar custo e risco. Lighthouse em redes distintas, p75 real de Web Vitals, concorrência com pedidos seed vendáveis e restauração remota continuam pendentes porque o staging não possui URL pública de homologação nem dados comerciais ativos.  \n**Limites/isolamento:** sem migration nova, custo novo, merge, deploy, publicação, domínio, dados reais, mensagens Meta, transporte Bling, atendimento legado ou alteração em `main`.  \n**Próxima:** R16 permanece condicionada à conclusão/autorização da homologação controlada; não iniciar piloto produtivo automaticamente.\n
## R16 — pré-voo para staging isolado

**Data:** 24/10/2026 (UTC)
**Branch/base:** `agent/dona-antonia-r16-pilot-preflight`, PR #1396 aberto e draft contra `agent/dona-antonia-r15-audit-homologacao` (base `6f8c195d39de72ec057470e15443f25a6b0ba378`). Head de código confirmado: `390a0bdce81611e5e25b8e2c1eb6f47fb8f80b38`.
**Estado:** pré-voo bloqueado; R16 não concluída.

**Correções orientadas por teste:** o checkpoint de teste c2214ae3aa0c224e55efbdc82d4f4a61589b2cf7 reproduziu o falso passe dos flags DA_V2_* e a falha FK RESTRICT no rollback após checkout. Os runs #40137723002 (push) e #40137727796 (pull request) falharam no test:db pelo vínculo basket_extra_types; a suíte local também mostrou o script antigo retornando ready com os flags definidos. A implementação removeu esses flags e migrou a fonte de decisão para o manifesto de evidências; o rollback agora exclui somente quando não há histórico relacionado e arquiva os registros em caso de pedido, reserva, movimento adicional ou vínculo externo ao seed. O teste local PGlite percorre ambos os ramos.

**Readiness:** `npm run r16:readiness` lê o manifesto versionado `docs/R16_EVIDENCE_MANIFEST.json` e valida sua estrutura e referências locais, incluindo os valores declarados de SKU/estoque, operadores pseudonimizados e hashes de backup/restore. Retorna `blocked`: o seed é o único gate operacional aprovado. Staging, operadores e backup/restore seguem pendentes. A autorização produtiva é um gate separado com `required=false`; `roundCompleted` é sempre `false`. O script não consulta banco, não faz probe HTTP, não valida conteúdo remoto de backup e não confirma identidades; as referências exigem revisão humana.

**Verificações locais no head de código:** `npm test` (132/132), `npm run test:db` (20 migrations/33 tabelas, RLS/RBAC e ambos os caminhos de rollback), `npm run check`, `npm run r16:readiness`, `npm run lint`, `npm run format:check`, `npm run architecture:check` (138 arquivos), `npm run build` e `git diff --check` passaram. O smoke browser foi executado no CI; testes locais não foram repetidos após esta atualização documental.

**CI do head de código:** #40138207500 (push) e #40138209762 (pull request) passaram os gates de segurança, lint/formato, arquitetura, migrações PostgreSQL descartáveis, TypeScript, testes, build sem deploy e browser mobile/desktop (18/18 E2E).

**Snapshot V2 confirmado por leitura em 24/10/2026:** projeto `hjudhofluihkxykwekir`, `ACTIVE_HEALTHY`, PostgreSQL 17.11 e nenhum branch Supabase. Contagens: 805 produtos, 805 perfis privados, 0 clientes, 0 pedidos, 0 documentos fiscais e 0 eventos de entrega. O seed está ativo e consistente: três SKUs `R16-TEST-*` com 30 unidades cada, três tipos, cesta `r16-test` ativa e três movimentos. Não houve escrita no banco nesta retomada.

**Pendências:** URL V2 compartilhável de staging; a prévia conhecida é owner-only e publicação/deploy não estão autorizados. Faltam 2–3 operadores com identidades confirmadas; nenhuma conta ou credencial foi criada. Não foi demonstrado backup/restore em alvo descartável sem custo e sem restore sobre a origem. Nenhum branch, PITR, cópia ou restore foi criado.

**Rollback do seed:** `docs/R16_TEST_SEED_ROLLBACK.sql` é manual e não foi executado remotamente. Remove o seed determinístico quando não há referências; se houver pedido, reserva, movimento adicional ou vínculo externo, arquiva os registros e mantém o histórico. O rollback local não equivale a restore de snapshot remoto.

**Isolamento:** nenhum recurso pago, branch Supabase, usuário, credencial, publicação, deploy, restore ou integração operacional foi criado/acionado. Produção, site/admin em uso, `main`, Supabases legados, atendimento, Meta/Bling operacionais, DNS e workflows de produção ficaram intocados. Só avançar após evidência real dos gates e homologação no staging; R16 permanece incompleta.
