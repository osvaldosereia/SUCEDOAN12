# Dona Antônia — R2 cadastro XML — checkpoint técnico (09/10/2026)

## Alterações implementadas nesta janela (somente PR #1034, SEM deploy)

- `apply_item_update`: nome existente imutável, com rejeição ANTES de escrever em `purchase_xml_items`; não copiar NCM de entrada para venda; `update_cost` e `update_sale_price` somente se explicitamente `true`.
- `runBlingSync` (`bling_daily` e `bling_manual`): usa `manualCatalogOnlyImport` para guardar XML, itens e observações **sem `processXml` operacional**. Liga `bling_nfe_id` ao documento se ausente. Não criar/editar produtos, preço, estoque ou contas a pagar na importação.
- `manual_import` legado redirecionado para `manualCatalogOnlyImport`; máximo 10 XMLs por chamada (UI deve dividir lotes). `xml_catalog_only_import` já usa a mesma função.
- `daily_sync`: não executar `backfillPaymentMetadata` nem `reconcilePendingFinance` como efeito da leitura XML.
- `resolve_item_identity`: somente com `catalog_evidence_only:true`, usuário owner/admin, confirmação e nome humano obrigatório no caminho de criação; antigo caminho operacional bloqueado. A transação SQL `purchase_xml_resolve_catalog_identity_v1` deve estar presente antes de liberar UI de criação.
- Regressão `scripts/test-xml-registration-r2.mjs` integrada ao workflow `xml-catalog-r28-final-integration.yml`.

## Limitações e riscos não resolvidos

1. **Ainda não concluída R2:** não foi entregue a nova UI para todos os campos essenciais ausentes; categoria, preço de venda e validações de novo produto devem ser especificados na criação sem obrigar preço quando cadastro inativo/sem venda. A conversão por caixa existente requer fator humano, mas a proposta de persistência por fornecedor deve ser testada com GTIN caixa vs unidade.
2. A sincronização Bling chama a rotina catálogo em lote unitário; ela cria um `purchase_xml_import_runs` secundário por XML além do run principal. Funcional mas gera overhead e marca origem `manual_xml` no registro do documento. **Corrigir em refatoração R2 antes de release**, passando origem e run id ao helper único, preservando idempotência.
3. O legado `processXml` e `manualImport` continuam definidos para compatibilidade, mas **não devem ser chamados pelos actions de importação**. Verificar outros chamadores internos antes do deploy.
4. Existem rotas separadas `finance_post`, `prepare_receipt_plan`, `apply_item_update`; são ações explícitas distintas, não importação. Não presumir que todas foram revisadas.
5. Nenhum CI verde confirmado para os últimos commits: a consulta de workflow runs retornou lista vazia. Nenhum E2E no Admin autenticado ou teste de importação Bling real realizado.
6. A produção mantém `purchase_xml_settings.auto_create_inactive_products=true` e cron Bling ativo. **Como código R2 não foi publicado, comportamento produtivo não mudou**. Não alterar configurações sem análise do serviço pai e plano de reversão.
7. Há divergência grande de migrations entre repo e Supabase: não executar `supabase db push` ou `migration repair`.

## Próximo incremento R2

Extrair `ingestCatalogXml(xml, source, runId, blingNfeId)` sem criar run aninhado; usar helper em Bling e upload, preservando `source` e chave de 44 dígitos. Revisar fluxos da UI e a criação de produtos para nome editável e campos essenciais; escrever testes de payload e integração com duplicatas, fornecedor, uCom/uTrib, CX→UN. Após CI + homologação, preparar release seletivo. Não iniciar R3 estoque até R2 segura.
