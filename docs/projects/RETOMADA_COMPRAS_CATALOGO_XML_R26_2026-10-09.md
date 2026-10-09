# RETOMADA OFICIAL — DONA ANTÔNIA / COMPRAS E CATÁLOGO XML
**Data:** 09/10/2026 · **Ponto de continuidade:** R26 · **Projeto:** `osvaldosereia/SUCEDOAN12`

## 1. Onde retomar
- **Branch de trabalho:** `agent/xml-catalog-fiscal-audit-r25-20261009`
- **Último commit verificado:** `dee7dde582db76a3ebf28e4886091a52908accc8`
- **PR draft R25:** https://github.com/osvaldosereia/SUCEDOAN12/pull/1022
- **Dependências:** R24 [#1018](https://github.com/osvaldosereia/SUCEDOAN12/pull/1018) → R23 [#1012](https://github.com/osvaldosereia/SUCEDOAN12/pull/1012) → R22 [#1009](https://github.com/osvaldosereia/SUCEDOAN12/pull/1009) → R21 [#1004](https://github.com/osvaldosereia/SUCEDOAN12/pull/1004) → R20 [#1001](https://github.com/osvaldosereia/SUCEDOAN12/pull/1001) → R19 [#999](https://github.com/osvaldosereia/SUCEDOAN12/pull/999) → R18 [#997](https://github.com/osvaldosereia/SUCEDOAN12/pull/997).
- **Main verificada no encerramento:** `d5f3f16b5b6b8ba27823406de0c43628e62d4a78`, avançada por correção de pedidos/separação. Checar novamente antes de qualquer escrita.

## 2. Fontes de verdade
1. Handoff longitudinal: [HANDOFF_COMPRAS_CATALOGO_XML_2026-10-08.md](./HANDOFF_COMPRAS_CATALOGO_XML_2026-10-08.md). Ler integralmente antes da R26.
2. R25: [PURCHASE_XML_R25_FISCAL_CHECKPOINT.md](./PURCHASE_XML_R25_FISCAL_CHECKPOINT.md).
3. R24: [PURCHASE_XML_R24_FIELD_REVIEW_CHECKPOINT.md](./PURCHASE_XML_R24_FIELD_REVIEW_CHECKPOINT.md).
4. R23: [PURCHASE_XML_R23_INTEGRATION_CHECKPOINT.md](./PURCHASE_XML_R23_INTEGRATION_CHECKPOINT.md).

## 3. O que está comprovadamente concluído
- R18–R23: integração de XML da importação manual/Bling, integridade de identidade e autorização da NF-e, limite UTF-8, deduplicação, auditoria, histórico paginado e comparação completa até teto de segurança; vínculo humano/cadastro inativo por RPC transacional, com gatilho de lotes testado em PostgreSQL descartável.
- R24: revisão humana campo a campo (ledger/auditoria), prévia, aplicação **somente do NOME em produto INATIVO** e rollback CAS, com funções revalidando `owner/admin` ativo. A UI de aplicar/reverter não foi gravada (bloqueio de escrita no arquivo monolítico).
- R25: dossiê fiscal `xml_catalog_fiscal_dossier` somente leitura, agrega NCM/CEST/EAN comercial e tributável/unidades uCom/uTrib/conflitos/histórico parcial. Não aprova fiscalmente nem atualiza produto, preço, estoque ou Bling.
- **CI R25 aprovada:** https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37971049140 — três jobs SUCCESS: fiscal-evidence Node, deno-typecheck e database-regression PostgreSQL 17. Logs anteriores de falha de tipagem e nome de arquivo foram corrigidos.
- O SQL de separação da main `20261009160000_...` é **100% igual em 2.112 caracteres** ao já aplicado no Supabase como `20261009155231_separation_ready_reservation_idempotence_20261009`. Na branch R25, foi reconciliado com o timestamp aplicado, sem repetir a migração e com teste de separação atualizado.
- **Nenhum merge na main, deploy Edge, migração produtiva, atualização automática fiscal, cadastro de produto ou mudança de estoque/preço/financeiro/Bling foi realizado nesta rodada.**

## 4. Supabase — verificações em modo somente leitura
- Projeto canônico: `ssbesxgaijknwsjbsbcz`.
- Itens XML: **214**, linhas sem vínculo: **59**. Candidatos agrupados: **113** vinculados/revisáveis, **32** não vinculados, **1** conflito fiscal e **1** conflito CEST.
- As tabelas `purchase_xml_field_reviews_v1` e `purchase_xml_field_applications_v1` e RPC `purchase_xml_resolve_catalog_identity_v1` **não estão instaladas no banco produtivo**.
- Histórico remoto de migração inclui `20261009155231` já aplicada; as migrations XML R23 `20261009145919_purchase_xml_identity_atomic_r23.sql` e R24 `20261009155445_purchase_xml_field_approval_r24.sql` **ainda não estão instaladas**. A primeira tem versão cronologicamente anterior a uma já aplicada: **NÃO executar `db push` ou `migration repair` automaticamente**.

## 5. Bloqueadores reais da implantação
1. **Interface Admin:** `vitrine/admin/index.html` é monolítico. A ferramenta bloqueou a gravação dos novos controles visuais na R24; R25 não alterou o arquivo. Sem botões de prévia/aplicação/rollback nem dossiê fiscal integrado à UI. Resolver apenas por procedimento de engenharia autorizado e pequenas alterações; não contornar restrições.
2. **Migrações:** reconciliar R23/R24 e todo histórico Supabase com a `main` mais recente; projetar migração canônica e rollback e validar sequência num banco de homologação Supabase isolado.
3. **Homologação real:** antes de publicar, executar Auth real (owner/admin, operator, viewer, desativado), RLS/grants reais, Edge, navegador desktop/mobile, importação XML de teste, simulação Bling, estoque/lotes, concorrência, desempenho e rollback. Os CI descartáveis **não** equivalem a esse gate.
4. **Fiscal:** NCM, CEST, EAN tributável e fator embalagem são evidências de fornecedor, nunca aceitação tributária ou mudança automática. Continuar exigindo revisão humana.

## 6. Próxima rodada — R26
1. Ler handoff + checkpoints e inspecionar `main`, PR #1022 e histórico real de migrations.
2. Montar CI/homologação integrada sem atualizar produção; conciliar o calendário de migrations da árvore R25 e testar sequência DB → Edge → UI.
3. Resolver integração visual apenas por caminho de edição autorizado; se ferramenta bloquear, registrar bloqueio e finalizar restantes, sem falsa alegação de conclusão.
4. Validar jornadas E2E do Admin com testes de autorização, decisão, aplicação/rollback de nome inativo e dossiê fiscal. Nunca alterar produto fiscal/estoque a partir de XML sem revisão específica.
5. Registrar commits, workflow/job IDs e quaisquer bloqueios no handoff; abrir PR da R26 como draft empilhada. R27 somente após gates de publicação.

## 7. Regras de programação estabelecidas
- Atuar como programador sênior com rodadas completas; branch `agent/*`, commits atômicos, evitar escrita paralela no mesmo arquivo, sempre confirmar SHA.
- Preservar trabalho paralelo da `main` (pedidos/separação, orçamento/Bling, outros).
- Catálogo obtém informações **exclusivamente** dos XMLs de NF-e do Bling ou uploads manuais; não reativar Cosmos, SI5, busca externa, cron ou pesquisa fiscal automática.
- Nunca inventar resultados de CI/deploy, e não marcar funcionalidade pronta para uso antes de UI e homologação.
- A autorização geral para programação não anula os gates de segurança; **nenhum deploy ou mutação em produção** sem validação compatível.

## 8. Comando curto para colar no novo chat
> CONTINUAR DONA ANTÔNIA — COMPRAS E CATÁLOGO XML — R26. Acesse GitHub `osvaldosereia/SUCEDOAN12` e leia integralmente `docs/projects/RETOMADA_COMPRAS_CATALOGO_XML_R26_2026-10-09.md` na branch `agent/xml-catalog-fiscal-audit-r25-20261009`; em seguida leia o handoff original e o checkpoint R25. Continue diretamente a programação R26, sem perguntar novamente o que já foi decidido. Preserve a `main`, respeite os gates e salve cada rodada com commits, CI e atualização do handoff.
