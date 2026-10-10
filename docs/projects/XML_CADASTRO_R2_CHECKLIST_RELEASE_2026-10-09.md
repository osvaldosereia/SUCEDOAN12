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
