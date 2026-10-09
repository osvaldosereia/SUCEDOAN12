# Dona Antônia — Compras/XML — Checkpoint R23 — 09/10/2026

## Resultado: integração de código e preparação de migração concluídas; produção inalterada

- PR draft consolidada: [#1012](https://github.com/osvaldosereia/SUCEDOAN12/pull/1012).
- Base da integração: **main `4683d79c2f0985e4c068544d706b475e9d462c53`**, incorporando R18–R22 com merge de dois pais sem force-push. Houve **51 arquivos XML** importados, sem conflitos de caminho com os cinco arquivos que a main modificou em orçamento, Bling e roteador pai desde o início das rodadas. Verificação explícita no Node garante que `purchase_xml`, `blingHubOrderManagedDiff` e código de orçamento estão presentes.
- Migrations corrigidas:
  - `supabase/migrations/20261009035359_purchase_xml_ingest_error_audit_v5.sql`: recriada no versionamento a partir da **declaração SQL exata já aplicada** no Supabase. Confrontei os 1.940 caracteres com `supabase_migrations.schema_migrations.statements[1]`: **100% idênticos**. Em produção essa versão está instalada; portanto não usar `20261009085000_...`, que foi removida da branch para impedir aplicação dupla.
  - `supabase/migrations/20261009145919_purchase_xml_identity_atomic_r23.sql`: gerada com **Supabase CLI 2.84.2** no GitHub Actions `37948241592`, depois versionada. Corpo SQL idêntico à versão endurecida R22, com cabeçalho de migration R23. Inclui identidade humana owner/admin, auditoria imutável RLS, proteção de GTIN, criação inativa, `desired_bling_status='I'`, bloqueios para lotes, recebimentos verificados/aplicados e fiscalização segregada.
  - Arquivo antigo da auditoria mantido sob `docs/projects/purchase-xml-ingest-error-audit-applied-r23.sql` para testes, sem ser tratado como nova migration.
- **Teste real em banco descartável:** workflow `XML Catalog R23 Main Integration` [run 37949113906](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37949113906), **3/3 jobs SUCCESS**, executou o **arquivo de migration R23 já commitado** em PostgreSQL 17 temporário usando snapshot do verdadeiro gatilho produtivo `purchase_xml_sync_inventory_lot_v1`; além de regressões Node de Bling/orçamento/API e Deno parser+TypeScript.
- **CI da árvore unificada:** todos os seis workflows de XML da última árvore integrada passaram: R18 `37949113896`, R19 `37949113827`, R20 `37949113867`, R21 `37949113822`, R22 `37949113898`, R23 `37949113906`. A PR é técnica e segue em draft.
- **Supabase produtivo sem escrita:** `purchase_xml_items=214`, `product_id IS NULL=59`; as tabelas e RPC da nova identidade permanecem inexistentes. Nenhum merge/deploy, alteração de produto, Bling, estoque, preços, fiscal, financeiro ou WhatsApp.

## Gates e sequência a partir da R24

1. **R24 — revisar e homologar fluxo de aprovação de campos**: propostas R14–R17 ainda apenas em SQL de docs; estabelecer migration canônica e autenticação owner/admin, testar alterações `name` só em produtos inativos, revisão individual com auditoria e rollback CAS. Não aplicar alterações em dados reais nesta etapa.
2. **R25 — auditoria fiscal e unidades**: NCM/CEST e EAN tributável são só evidência; revisão fiscal humana antes de qualquer mutação. Proibir alterações automáticas de `stock`, `price`, `cost`, `conversion_factor` por simples leitura XML. Validar compatibilidade com Bling.
3. **R26 — homologação operacional real em projeto separado**: Auth e RLS reais (owner, operator, viewer, usuário desativado), UI desktop/mobile, XMLs de teste sem dados pessoais, Bling OAuth simulado ou ambiente sandbox, performance e concorrência, trigger real, testes de saída/retorno e erros de conexão. CI PostgreSQL descartável, mesmo com trigger exato, **não substitui** esse gate.
4. **R27 — implantação controlada só com gates aprovados**: backup, migration, grants, Edge versionado, UI, smoke tests, observabilidade, sem cron extra nem automações automáticas de cadastro, estoque, fiscal ou financeiro. Se não houver autorização operacional/ambiente de homologação, manter PR draft e produção inalterada.

**Observação de segurança:** não é seguro publicar o backend R21/R22 sem antes aplicar a migration R23. A ausência da RPC provoca falha fechada `503` na ação de vínculo, sem cadastrar produtos. Não usar `migration repair` para marcar migration não executada.

**Arquivo canônico:** este checkpoint deve ser sincronizado com o handoff principal antes de qualquer nova rodada. A árvore de integração é `agent/xml-catalog-main-integration-r23-20261009`; não reaplicar PRs antigas sobre ela sem comparar SHAs.
