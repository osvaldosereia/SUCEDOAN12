# STATUS DE RODADAS — DONA ANTÔNIA V2

**Atualizado:** 2026-10-25  
**NOTA:** planejado não é concluído. Cada rodada marca somente o escopo realmente feito.

| Rodada | Título | Estado | Evidência |
|---|---|---|---|
| R00 | Auditoria integral e baseline | **Concluída — auditoria documental, gates e baseline** | [AUDITORIA_COMPLETA_V2.md](AUDITORIA_COMPLETA_V2.md); base 1a846be; CI 40057635884 |
| R01 | Design system e disciplina de qualidade | Planejada | Depende de corrigir lacunas de CI e dependências apontadas em R00 |
| R02 | Modelagem/migrações para banco isolado | Planejada | Reconciliar tabelas/outbox e validar em banco descartável isolado |
| R03 | Login, RBAC e RLS V2 | Planejada | Sem auth/RBAC real na baseline |
| R04 | Importação/reconciliação dos 802 produtos | Planejada | CSV fonte ausente; corrigir projeção pública e testar parser antes de qualquer importação |
| R05 | Cadastro e estoque persistente | Planejada | Requer R02–R04 |
| R06 | Cestas, tipos e extras persistentes | Planejada | Requer projeção persistida |
| R07 | Catálogo público dinâmico/performance | Planejada | Hoje o catálogo é arquivo estático opcional e a composição é DEMO |
| R08 | Cotação e checkout transacional | Planejada | Sem pedido real, reserva ou validações de entrega/pagamento |
| R09 | Pedidos persistentes, quatro abas | Planejada | Pedidos atuais são fictícios e em memória |
| R10 | Separação e multioperador | Planejada | Requer concorrência, claims/lease e transações reais |
| R11 | Inbox WhatsApp humano V2 | Planejada | Caixa humana; independente de IA, Utility, Flow e campanhas |
| R12 | Mensagens Utility Meta por evento | Planejada | Somente atualizações transacionais de pedido; não é marketing |
| R13 | NF-e Bling pós-separação | Planejada | Requer validação fiscal e staging dedicado |
| R14 | Clientes/entrega/relatórios essenciais | Planejada | Requer pedidos persistentes |
| R15 | Auditoria final/performance/homologação | Planejada | Não iniciado |
| R16 | Piloto/migração autorizada | Planejada | Exige etapa e autorização próprias |

## R00 — Auditoria integral e baseline

**Data:** 2026-10-25  
**SHA inicial:** 1a846beba768192c366937c1462bcfd6baeccee9  
**SHA final:** HEAD da branch de auditoria indicada no PR da R00  
**Estado:** Concluída como auditoria; V2 segue em prévia demonstrativa  
**Escopo efetivamente implementado:** inventário dos 90 arquivos V2, leitura dos quatro SQLs, telas, regras, scripts, dependências, testes, workflows específicos, PR #1363 e documentação; correção de documentação contraditória. Nenhuma integração foi implantada.  
**Testes executados e resultado:** architecture:check, TypeScript, 35/35 unitários e build passaram. E2E local não iniciou por falta do Chromium. A CI do SHA base 1a846beba768192c366937c1462bcfd6baeccee9 passou os nove cenários de navegador. A PR #1364 registrou auditoria npm on-line com 4 alertas (2 moderados, 2 críticos); a repetição offline em 25/10 deu 0 pela cache e não é confirmação de segurança. Advisories atuais aplicáveis às versões resolvidas estão detalhados em AUDITORIA_COMPLETA_V2.md.  
**PR/commits:** branch agent/dona-antonia-r00-auditoria; PR #1364 aberta contra agent/dona-antonia-nova-plataforma, sem merge. O SHA atual consta no PR.  
**Bloqueios/riscos:** não existe Supabase V2, autenticação, persistência ou integração real. Ver P1/P2 em AUDITORIA_COMPLETA_V2.md. A CI atual não é disparada por PR em branch agent/*; o workflow de publicação em main pode atualizar apenas /site1 e /admin1 quando mergeado.  
**Produção legada:** intocada; nenhuma chamada ou alteração em site, Vitrine/Admin, bancos antigos, atendimento, Meta ou Bling.  
**Próxima rodada recomendada:** R01 — design system e disciplina de qualidade, incluindo CI para PR, lockfile, lint, formato, acessibilidade e 320/390/1280 px.

## Lacuna de escopo para as funções de WhatsApp

R11 é exclusivamente Inbox humana; R12 é exclusivamente mensagem Utility transacional de andamento do pedido. IA Ana, venda/checkout por WhatsApp Flow e campanhas de marketing são três frentes independentes, ainda sem números ou ordem de rodada definidos. Cada uma requer escopo, regras e gate próprios; não as misturar com R11, R12 ou entre si.

## Histórico anterior às rodadas

- Há protótipo de UI V2 e regras de domínio com testes; protótipos não significam integração real.
- CI atual da base auditada: [workflow 40057635884](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/40057635884), SHA 1a846beba768192c366937c1462bcfd6baeccee9.
- /site1 e /admin1 são prévias demonstrativas publicadas em uma rodada anterior e não são automaticamente iguais à branch atual.
- Supabase V2 não foi criado ou aplicado; não há checkout real, auth V2 ou atendimento conectado.
- Bancos legados e site raiz não devem sofrer alterações.

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
