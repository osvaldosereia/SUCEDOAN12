# STATUS DE RODADAS — DONA ANTÔNIA V2

**Criado:** 2026-10-23  
**NOTA:** planejado não é concluído. Atualizar no final de CADA rodada.

| Rodada | Título | Estado | Evidência |
|---|---|---|---|
| R00 | Auditoria integral e baseline | **Concluída — auditoria documental e baseline** | docs/AUDITORIA_COMPLETA_V2.md; SHA base 1a846beba768192c366937c1462bcfd6baeccee9; CI 40057635884 aprovado |
| R01 | Design system e disciplina de qualidade | **Concluída** | PR #1365; SHA R01 7a02a0da66dbcec6cfd7772da75f748ecb5bd29c; CI 40059800868 e 40059798099 aprovados |
| R02 | Modelagem/migrações para banco isolado | **Concluída; PR aberto, sem merge** | `docs/DIAGRAMA_ERD_V2.md`; `npm run test:db`; CI pendente/após PR |
| R03 | Login, RBAC e RLS V2 | Planejada | — |
| R04 | Importação/reconciliação dos 802 produtos | Planejada | — |
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
**SHA de implementação validado:** 08ece30274c4b36e1c325fcf0e3d3fbabb41c49a.
**Estado:** Concluída; PR #1366 aberto, sem merge.
**Escopo:** cadeia de quatro migrações versionadas; schema privado `da_next`, 21 tabelas com RLS fechado e sem policies; constraints para catálogo, pedidos, snapshots, reservas, idempotência, fiscal, auditoria e outbox; tipos TS e contratos de persistência; ERD, ADR e instruções de banco. Propostas duplicadas `db/001–004` removidas.
**Testes locais:** lint, format:check, architecture:check, `npm run test:db` (4 migrações/21 tabelas), TypeScript, 39 testes unitários, build e `npm audit --audit-level=moderate` (0 vulnerabilidades) passaram.
**PR/CI:** PR #1366 — https://github.com/osvaldosereia/SUCEDOAN12/pull/1366; CI 40061111459 aprovado no SHA de implementação acima, incluindo suíte de navegador; sem merge.
**Limites:** PGlite confirma comportamento coberto em PostgreSQL isolado, não substitui Supabase real; nenhum projeto remoto consultado ou alterado. Sem adapter, Auth/RBAC, policies, checkout nem worker.
**Produção legada:** intocada; branch `main`, sites, bancos, atendimento e integrações operacionais intocados.
**Próxima rodada:** R03 — modelo de ator, login/RBAC e policies RLS, com testes de autorização e sem conectar aos Supabase legados.
