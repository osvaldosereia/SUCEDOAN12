# STATUS DE RODADAS — DONA ANTÔNIA V2

**Criado:** 2026-10-23  
**NOTA:** planejado não é concluído. Atualizar no final de CADA rodada.

| Rodada | Título | Estado | Evidência |
|---|---|---|---|
| R00 | Auditoria integral e baseline | **Concluída — auditoria documental e baseline** | docs/AUDITORIA_COMPLETA_V2.md; SHA base 1a846beba768192c366937c1462bcfd6baeccee9; CI 40057635884 aprovado |
| R01 | Design system e disciplina de qualidade | Planejada | — |
| R02 | Modelagem/migrações para banco isolado | Planejada | — |
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
- CI de referência mais recente citada: https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/40056490923; revalidar SHA e sucesso em R00.
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
