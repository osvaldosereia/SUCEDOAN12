# R2 — critérios de conclusão e release (09/10/2026)

## Implementado no PR #1034
- Importação de XML Bling manual/diária e upload manual encaminhada para catálogo evidencial, sem alterar estoque/produtos/financeiro.
- Bling preserva origem e reutiliza run pai; importação por chave 44 dígitos, digest e replay.
- Produtos existentes: nome/NCM preservados; custo e preço só com opt-in explícito; aplicação legada de nome bloqueada, rollback mantido.
- Novos produtos: nome comercial unitário digitado manualmente, validado na UI e API; criação inativa via RPC transacional de identidade.
- Conversão: fator inteiro, UN com fator 1, caixa/fardo requer confirmação; custo unitário calculado pelo valor líquido da linha / unidades convertidas.
- Regressões fonte/aritmética em scripts/test-xml-registration-r2.mjs.

## Bloqueios confirmados (NÃO CONCLUÍDO / NÃO LIBERADO)
1. Consulta SQL somente leitura na produção `ssbesxgaijknwsjbsbcz`: **0** funções `purchase_xml_resolve_catalog_identity_v1`, **0** `purchase_xml_open_field_review_v1`, **0** tabelas `purchase_xml_catalog_identity_actions_v1`, `purchase_xml_field_reviews_v1`, `purchase_xml_field_applications_v1`. Criação de produto na UI falha até instalação segura do gateway.
2. Migrations candidatas `20261009185312_purchase_xml_identity_atomic_r27.sql` e `20261009185314_purchase_xml_field_approval_r27.sql` possuem cabeçalhos explícitos proibindo instalação direta em produção sem testes de auth/RLS e release. Histórico de migrações remoto divergente. **Não executar db push, migration repair, nem aplicar cegamente SQL em produção.**
3. Workflow `.github/workflows/xml-catalog-r28-final-integration.yml` possui Node, Deno e fixture PostgreSQL, mas não foi confirmada execução verde para commit `8cbff6a` (consulta GitHub Actions: 0 runs). Asserções de fonte não substituem teste integrado.
4. Não houve smoke autenticado na UI Admin nem importação real Bling/arquivo neste turno. Nenhum deploy Edge/Admin e nenhuma escrita de produção.

## Gate de conclusão
- CI: Node + Deno check + PostgreSQL descartável verdes para SHA de release.
- Pré-implantação: auditar migrations seletivas contra schema real e ACL/RLS, backup, preparar rollback; não alterar fluxos alheios.
- Aplicar somente migrations validadas e confirmar RPC/tabelas/roles na produção.
- Deploy Edge real `admin-service-intelligence-v1` (não só módulo interno) e UI Admin com SHA verificado.
- Smoke autenticado: upload manual e Bling (origem), duplicata, criar produto inativo com nome humano, vincular existente, conversão 10 CX×12=120 UN, UN×1, custo unitário, ausência de estoque/preço/NCM/financeiro não autorizados.
- Se qualquer etapa falhar, bloquear release e registrar evidência.

**R3 bloqueada até todos os gates acima.**
