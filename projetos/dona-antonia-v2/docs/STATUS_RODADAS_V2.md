# STATUS DE RODADAS — DONA ANTÔNIA V2

**Criado:** 2026-10-23  
**Atualizado:** 2026-10-25  
**NOTA:** planejamento, esquema existente e código operacional são estados diferentes. Só marcar uma rodada concluída com critérios de ponta a ponta e evidências.

| Rodada | Título | Estado | Evidência |
|---|---|---|---|
| R00 | Auditoria integral e baseline | **Concluída — auditoria, sem implementação** | [AUDITORIA_COMPLETA_V2.md](AUDITORIA_COMPLETA_V2.md); baseline 1a846be; branch isolada agent/dona-antonia-r00-audit-20261025 |
| R01 | Design system e disciplina de qualidade | Planejada | Ainda não iniciada |
| R02 | Modelagem/migrações para banco isolado | **Parcial; bloqueada por reconciliação** | Supabase V2 tem 20 migrações até R14; branch contém 4 SQL de planejamento, sem histórico equivalente |
| R03 | Login, RBAC e RLS V2 | **Parcial no banco; app não conectado** | RLS/RBAC e 1 atribuição ADMIN existem; testes por perfil e autenticação no app ausentes |
| R04 | Importação/reconciliação dos 802 produtos | **Pendente de reconciliação** | Contagem agregada atual: 805 produtos; diferenças por SKU não foram lidas nesta auditoria |
| R05 | Cadastro e estoque persistente | **Parcial no banco; UI demonstrativa** | Produtos existem no Supabase; admin React altera estado local |
| R06 | Cestas, tipos e extras persistentes | **Parcial no banco; UI demonstrativa** | Tabelas/configurações existem; frontend V2 não persiste mudanças |
| R07 | Catálogo público dinâmico/performance | Planejada | Leitura atual do site usa JSON estático/demos; sem adaptador Supabase |
| R08 | Cotação e checkout transacional | **Parcial no banco; sem fluxo ponta a ponta** | Migração/função de cotação existem; 0 pedidos e confirmação no checkout está desabilitada |
| R09 | Pedidos persistentes, quatro abas | **Parcial no banco; UI demonstrativa** | Estruturas existem; 0 pedidos e painel usa amostras em memória |
| R10 | Separação e multioperador | **Parcial no banco; não homologada no app** | Comandos/eventos/versionamento existem no banco; interface V2 permanece demonstrativa |
| R11 | Inbox WhatsApp humano V2 | **Estrutura parcial; não operacional** | Tabelas existem; 0 conversas/mensagens e 0 Edge Functions |
| R12 | Mensagens Utility Meta por evento | **Scaffold inativo** | 8 templates pendentes/inativos; 2 configurações, nenhuma habilitada; 0 mensagens |
| R13 | NF-e Bling pós-separação | **Estrutura parcial; integração ausente** | Tabelas/modelos fiscais existem; sem Edge Function ou documentos fiscais |
| R14 | Clientes/entrega/relatórios essenciais | **Estrutura parcial; sem uso no app** | Tabelas existem; 0 clientes na contagem agregada |
| R15 | Auditoria final/performance/homologação | Planejada | Depende de integração ponta a ponta e testes de segurança/performance |
| R16 | Piloto/migração autorizada | Planejada; requer autorização expressa | Nenhum piloto, envio real ou publicação realizado |
| R17 | Comércio WhatsApp, Flows e marketing (proposta) | Proposta, não aprovada para execução | Detalhar depois de estabilizar R11/R12 |

## R00 — Auditoria integral e baseline

**Data:** 2026-10-25  
**SHA inicial:** 1a846beba768192c366937c1462bcfd6baeccee9  
**Branch final:** agent/dona-antonia-r00-audit-20261025  
**SHA final:** commit desta atualização de status; ver histórico da branch  
**Estado:** concluída como auditoria e baseline. Nenhuma funcionalidade foi implementada nesta rodada.  
**Escopo efetivamente executado:** inventário de código/documentação/SQL/testes/dependências/workflows; validações locais; inspeção somente de leitura do projeto Supabase dedicado e de contagens agregadas. Sem leitura de linhas de cliente/conversa, sem consulta a banco legado e sem leitura/configuração de secrets.  
**Testes executados:** architecture:check passou (62 módulos); TypeScript passou; 9 arquivos/35 testes unitários passaram; build passou. Playwright local não iniciou por ausência do Chromium e falha do download neste ambiente; a CI do SHA inicial passou incluindo E2E desktop/mobile.  
**Evidência CI:** [GitHub Actions 40057635884](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/40057635884).  
**Commits:** [relatório de auditoria](AUDITORIA_COMPLETA_V2.md); este commit atualiza o status. Sem PR, merge ou deploy.  
**Bloqueios/riscos:** o banco dedicado está mais avançado que o repositório (20 migrações até R14); não aplicar SQL antes de reconciliar. App sem conexão real; WhatsApp/Meta inativo.  
**Produção legada:** intocada. Vitrine/Admin, site raiz, bancos legados, Meta, Bling, /site1 e /admin1 não foram alterados.  
**Próxima rodada recomendada:** R01, independente do banco. R02 só após revisão do histórico/schema V2 ativo e plano de migrações testável em ambiente descartável.

## Interpretação dos estados

“Parcial no banco” descreve objetos observados no projeto Supabase V2; não significa funcionalidade conectada, testada ou pronta para operação. Para marcar R02–R16 como concluída, exigir código versionado, testes relevantes, critérios de aceite satisfeitos e evidência da rodada. Não usar os bancos legados nem ativar tráfego Meta durante desenvolvimento comum.

## Histórico e proteção operacional

- A V2 está em projetos/dona-antonia-v2 no repositório SUCEDOAN12. A branch principal de desenvolvimento continua agent/dona-antonia-nova-plataforma; esta rodada foi registrada em uma nova branch criada a partir do SHA-base atual.
- O projeto Supabase dedicado “Dona Antônia V2” está ativo e contém estado aplicado além dos quatro SQL versionados. A documentação anterior que dizia que o projeto V2 não existia foi superada por esta auditoria.
- O código atual continua sendo uma prévia demonstrativa: não há checkout confirmável, autenticação integrada, persistência no app, webhook ou envio WhatsApp real.
- /site1 e /admin1 são prévias. O PR #1363 e o workflow correspondente foram apenas consultados; não houve atualização.
- Os projetos Supabase legados, a Vitrine/Admin em operação, Bling, Meta, raiz do site e main seguem fora do escopo de escrita.

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
