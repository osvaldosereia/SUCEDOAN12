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

## Continuação desta rodada
- Commit `5abe25c`: ao falhar a gravação do documento no banco, remove exclusivamente o XML que acabou de ser carregado no Storage para evitar objeto órfão; erro de limpeza fica registrado em log.
- Commit `2ceba1a`: adiciona regressão de fonte para limpeza de objeto órfão.
- Limitação de ferramenta: conexão GitHub disponível neste chat não oferece disparo de workflow; não há clone local com dependências nem sessão autenticada no Admin. Sem execução de CI, sem deploy seguro.
- **Próxima execução obrigatória:** disparar CI do PR #1034, corrigir falhas até ficar verde, homologar R23/R24 em PostgreSQL descartável, revisar schema remoto e histórico de migrações, aplicar migrações seletivas e validar ACL/RLS, publicar Edge/Admin, fazer smoke autenticado. Não iniciar R3 antes.

## Rodada seguinte (10/10/2026)
- `45a8ebd`: botão de aprovação em massa explicitamente desabilitado e remoção do código morto que alterava custo e preço em lote.
- `ae0649e`: teste ajustado para exigir botão desabilitado e ausência do loop de alteração comercial.
- Inspeção de código em GitHub: regex de proteção, importação Bling sem `processXml`, limpeza de Storage e botão desabilitado encontrados; **verificação estática não substitui executar Node/Deno/PG**.
- Consulta ao GitHub Actions para SHA `ae0649e`: zero execuções retornadas. Sem homologação integrada e sem deploy.
- **Próxima rodada obrigatória:** obter execução CI (ou ambiente local completo), corrigir qualquer falha Node/Deno/PG; validar migrations R23/R24 em banco descartável e só depois liberar aplicação seletiva em produção com verificação de permissões. Em seguida publicar Admin e Edge e executar smoke autenticado. R3 continua bloqueada.

## Revisão crítica adicional — 10/10/2026
- Corrigida autorização da ação `apply_item_update` para proprietário/admin humano (commit `0dcc6f7`, teste `b58b458`). Anteriormente um viewer poderia chegar à mutação via dispatcher.
- Workflow atualizado para disparar também em push na branch de integração (commit `cc3d8a2`), além do gatilho PR existente. **O conector de consulta retorna apenas runs associados a pull requests; resposta vazia não demonstra ausência de push runs.** Consultar GitHub Actions diretamente antes de afirmar CI verde.
- Continua proibido marcar R2 como concluída sem CI real, banco de teste e implantação verificada.

## Diagnóstico de ambiente — 10/10/2026
- Supabase branch de QA `da6-qa-20261009` (`jxfxyqcpxoykdxbapswi`) existe mas está `MIGRATIONS_FAILED`, e `purchase_xml_items` não existe nessa branch. Portanto **não usar como homologação R2**.
- Produção canônica `ssbesxgaijknwsjbsbcz` possui `purchase_xml_items`, `purchase_xml_documents`, `products`, `admin_users`, `product_identifiers` e view `purchase_xml_catalog_observation_details_v2`; colunas essenciais de R23 confirmadas via `information_schema`. Isso NÃO comprova migração segura.
- Migração R23 `20261009185312_purchase_xml_identity_atomic_r27.sql` cria RPC de decisão atômica e tabela de auditoria, ainda ausentes na produção. A migração declara expressamente pendência de revisão Auth/RLS. R24 contém operações de revisão e aplicação de campos que não devem renomear produto existente na R2.
- Próxima ação bloqueante: provisionar QA **com schema compatível** (não branch de migrations quebradas), rodar fixture de PostgreSQL e Auth/RLS, depois aprovar migração seletiva. Sem isso não executar DDL em produção.

## Escopo de release R2 corrigido — 10/10/2026
- **Descoberta crítica:** o teste antigo `scripts/test-xml-catalog-integration-r26.pg.sql` executa R23+R24 e espera que R24 renomeie um produto existente para `Nome novo via XML`. Isso contradiz expressamente o contrato atual da R2, que proíbe sobrescrever o nome comercial de produto existente.
- Criado `scripts/test-xml-identity-r2.pg.sql` (commit `6bf8aaa`) para validar **somente R23**, em banco descartável: owner/admin, usuário desativado, não alteração de nome/NCM/custo/preço/estoque, ausência de lote, auditoria imutável, replay e privilégios.
- CI passa a rodar esse fixture em um **segundo banco descartável isolado** (commit `a119728`). O teste legado R26 continua apenas como regressão histórica, NÃO é autorização para publicar R24.
- **Decisão de arquitetura:** R2 deve liberar apenas identidade R23; R24 de aplicação de campo/nome está fora da R2 até remoção formal do caminho de renomeação e novos testes. Nunca aplicar R24 diretamente em produção sob a justificativa de concluir R2.
- Gates ainda não comprovados: execução do CI, Auth/RLS real, migração seletiva com numeração acima da cabeça remota, Edge/Admin autenticados e smoke test.
