# HANDOFF — Compras e Catálogo XML — Dona Antônia

**Revisado em:** 08/10/2026, horário de Cuiabá (America/Cuiaba).
**Status:** projeto em andamento. Código existente em produção, mas ainda falta homologação ponta a ponta das novas ações e evolução de revisão campo a campo.
**Repositório:** `osvaldosereia/SUCEDOAN12`, branch canônica `main`.
**Supabase canônico:** `ssbesxgaijknwsjbsbcz`.
**Área:** Vitrine/Admin → Compras/XML / Catálogo histórico dos XMLs.
**ERP:** Bling v3 (compras, fornecedores, lançamento de estoque, financeiro).

## 1. Decisão do proprietário — escopo obrigatório

- **NÃO usar** Cosmos, SI5, Brave ou IA externa para pesquisar produtos neste projeto. `si5_research_config.enabled=false` e `cosmos_research_config.enabled=false` confirmados na auditoria de 08/10.
- As únicas fontes do catálogo são NF-e **XML** que a ferramenta recebe do Bling e XMLs enviados manualmente pelo operador.
- **NÃO criar automações adicionais** de consulta/revisão em segundo plano. O cron preexistente `purchase-xml-daily-v1` de entrada de XMLs do Bling continua ativo (job 32, `0 10,22 * * *`), por decisão anterior. Catalogar no evento de importação e permitir releitura manual sob demanda.
- Separar sempre **ler e catalogar** de **cadastrar produto**, **vincular produto existente**, **atualizar campos fiscais/comerciais** e **receber estoque**.
- Nenhuma leitura/releitura de XML pode alterar, por conta própria, preços, estoque, NCM/CEST mestre, Bling, contas a pagar ou a vitrine de vendas. Toda atualização operacional requer autorização explícita; NCM e CEST exigem validação fiscal.
- Preservar funcionalidades atuais de Compras/XML: notas Bling, upload múltiplo, fornecedor, financeiro, custos/preços e recebimento/entrada no Bling.
- Interface leve no celular: catálogo abre somente ao clicar, não pré-carrega o histórico na página inicial.

## 2. Situação EXATA confirmada no banco — 08/10/2026

Consulta da view `purchase_xml_catalog_reconciliation_v1`:

| Indicador | Total |
| --- | ---: |
| Documentos NF-e XML | 90 |
| Itens declarados nos documentos | 214 |
| Itens registrados na staging operacional | 214 |
| Observações catalogadas diretamente do XML | 214 |
| Observações verificadas no XML original | 214 |
| Itens ausentes na staging | 0 |
| Observações ausentes | 0 |

View `purchase_xml_catalog_candidates_v1`: **147 candidatos**, dos quais **32 não vinculados** ao produto de venda, e **1 grupo com conflito de NCM**.
As contagens aumentam quando chegam novas notas; consultar novamente antes de comunicar valores futuros.

Na auditoria inicial existiam 56 itens faltantes (30 NF-e). Foram recuperados dos arquivos XML originais em uma execução controlada, sem criar produtos nem alterar estoque/preço.

A tabela de documentos indica atualmente **1 XML no modo `catalog_only`**.

## 3. Código já existente e principais marcos

1. **PR #971** do Catálogo Mestre XML **foi MESCLADO** à `main` (merge `8bd55ea3c88772c7efdf48b992cfc3c57e7f92b8`).
2. `main` avançou depois do PR #971:
   - `a673e2c65091`: ficha histórica de produto, revisão de evidências, criação inativa e vínculo.
   - `1fcfbd21fa9c`: proteção contra duplicação de vínculo e alteração indevida de nome.
3. **Atual `main` no instante do snapshot:** `1fcfbd21fa9c93c6a55a9e2bc205d2baa23eb244`.
4. Os arquivos da `main` já contêm:
   - `vitrine/admin/index.html`: `xmlCatalogSectionHtml`, `xmlCatalogDetailMarkup`, `xmlCatalogDetailSave`, busca e filtros; carregamento do catálogo somente sob clique.
   - `supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/index.ts`: `xml_catalog_list`, `xml_catalog_progress`, `xml_catalog_reprocess`, `xml_catalog_candidate_detail`, `xml_catalog_only_import`, `resolve_item_identity`.
   - `supabase/functions/purchase-xml-v1/index.ts`: cópia operacional do processamento XML; conferir que as cópias se mantêm alinhadas antes de editar.
   - `supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/xml-catalog-extractor.mjs`: parser NF-e do XML.
   - `supabase/migrations/20261009051500_purchase_xml_catalog_observations_v1.sql`: tabela/visões de observações.
   - `supabase/migrations/20261009071500_purchase_xml_catalog_details_v2.sql`: view de detalhes, **já aplicada**.
5. Edge Function de produção `admin-service-intelligence-v1`: **versão 230**, verificada em 08/10. **`verify_jwt=false` no runtime atual**, com autenticação/custom key dentro da função. Não alterar o `verify_jwt` sem auditar como a interface e os webhooks se autenticam, para não interromper o Admin.
6. A view `purchase_xml_catalog_observation_details_v2` retorna exatamente **214 observações distintas de 214**, com acesso negado diretamente a `anon` e `authenticated`, permitido a `service_role`.

## 4. ATENÇÃO: branch anterior ficou desatualizada

A branch de trabalho `agent/xml-catalog-review-details-v2` ainda existe (SHA em 08/10: `125b2cec29cd44f43f2a9f887c9d51ac0e2b1d39`), mas **a `main` já recebeu versões mais novas** da interface e do backend. A interface de ambas coincidia (mesmo SHA), porém o backend da `main` avançou por correções posteriores. **NÃO mesclar essa branch inteira nem restaurar arquivos antigos sobre a `main`**.

O snapshot anterior ficou incorreto se assumir que a ficha detalhada ainda não está na `main`. **Ela já está no código canônico**; falta validar os fluxos reais, não recriá-la.

Criar a próxima branch de programação **a partir da `main` mais recente**, obter SHAs atualizados e fazer commits pequenos, sem gravações simultâneas no mesmo arquivo. Validar resultados com CI e smoke test.

## 5. O que falta para CONCLUIR o projeto

**Prioridade A — homologação funcional (sem refazer o que já existe)**

1. Auditar o runtime atual versus `main`, conferir autenticador e endpoints (inclusive carregamento lazy e upload `catalog_only`).
2. Executar testes reais e repetíveis com XMLs existentes:
   - Ler, pesquisar, filtrar e abrir ficha de cada candidato.
   - Histórico completo de notas, fornecedores, preços, NCM/CEST observados.
   - Item sem GTIN; EAN comercial diferente do tributável; caixa/fardo com conversão diferente de 1.
   - Cadastrar novo produto **inativo** com estoque zero; não publicá-lo na vitrine.
   - Vincular uma linha do XML a produto existente sem alterar nome, GTIN indevidamente, preço, estoque, NCM/CEST.
   - Impedir duplicação de vínculo e verificar permissões por papel.
   - Nota duplicada ou XML reprocessado não gera estoque/financeiro em duplicidade.
   - Novo upload manual em modo **somente catalogar** versus importação de compras com financeiro, sem conflito de ações.
3. Conferir que erros de XML malformado, documento sem chave consistente, XML muito grande e lote sem fator não quebram Compras/XML.

**Prioridade B — finalizar a revisão de cadastro por campo**
- Uma ficha de candidato deve comparar: nome normalizado e descrição do fornecedor, EAN da unidade e da caixa, código do fornecedor, unidade, embalagem/fator, origem de cada NCM/CEST, custo histórico e fornecedor.
- Implementar **aprovação campo a campo com confirmação, log, rollback seguro e sem atualizar em massa**.
- Separar as decisões: (a) vincular item a produto, (b) criar produto inativo, (c) atualizar somente atributos selecionados, (d) validar fiscal, (e) registrar recebimento físico no fluxo próprio.
- As 32 identidades não vinculadas são **fila de revisão**, não autorização para criar 32 produtos automaticamente.
- Qualquer NCM/CEST diferente permanece pendente até verificação fiscal e, quando cabível, sincronização Bling expressamente aprovada.

**Prioridade C — qualidade e publicação**
- Testar via Admin mobile/desktop, sem mudar o visual do site público.
- Auditar RLS, permissões dos endpoints, imagens/arquivos XML privados e autenticação customizada do hub; garantir que nenhuma chave privileged esteja no cliente.
- CI para testes de parsing, upload, idempotência, conversão, status e read-only. Conferir uma falha conhecida no teste global `scripts/test-admin-pending-data-baskets-public-v1.mjs` envolvendo a página pública de pedidos e `channel_origin`: **não presumir que foi causada pela funcionalidade XML; tratar à parte**.
- PRs pequenos, atualizar a `main` somente após testes e revisão. Monitorar erros/tempo inicial do Admin.
- Documentar aceite: todos os XMLs lidos; as 5 ações (catalogar, localizar, vincular, cadastrar inativo, revisar/receber) corretamente segregadas; zero efeitos comerciais silenciosos.

## 6. Fontes do estado e referências no código

- Repositório: https://github.com/osvaldosereia/SUCEDOAN12
- PR histórico merged: https://github.com/osvaldosereia/SUCEDOAN12/pull/971
- Backend: `supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/index.ts`
- UI: `vitrine/admin/index.html`
- Migrações: `supabase/migrations/20261009051500_purchase_xml_catalog_observations_v1.sql` e `20261009071500_purchase_xml_catalog_details_v2.sql`
- Documentação anterior: `docs/projects/purchase-xml-catalog-master-v1.md`
- Supabase principal: `ssbesxgaijknwsjbsbcz`

## 7. Instrução para outra conversa

> Continuar o projeto **Dona Antônia — Compras e Catálogo XML** no repositório `osvaldosereia/SUCEDOAN12`, Supabase `ssbesxgaijknwsjbsbcz`. Leia **inteiramente este HANDOFF** no GitHub antes de programar. Consulte a `main` atual e o runtime Supabase, não use branch desatualizada para sobrescrever correções. O catálogo usa exclusivamente XML de NF-e importado do Bling ou enviado manualmente; nada de Cosmos, SI5, pesquisa externa, novas automações ou alteração automática de produtos, preços, fiscal e estoque. Faça primeiro auditoria/CI/teste ponta a ponta das funções já publicadas; depois corrija pendências e implemente revisão campo a campo com aprovação humana. Trabalhe em branch agent/* nova, faça commits atômicos e reporte o que foi testado e publicado.

**Este documento é um checkpoint, não autorização para considerar o projeto concluído.**

## Checkpoint R18 — 09/10/2026 — consolidação das oito PRs (integração de código concluída em branch)

**Branch canônica desta rodada:** `agent/xml-catalog-consolidation-r18-20261009`, derivada da `main` `8d2e187fa3d7a15111cfe1504786e213e9d7b2cf`. **PR draft [#997](https://github.com/osvaldosereia/SUCEDOAN12/pull/997)**. As PRs originais permanecem abertas; não houve merge na `main`.

### Conteúdo consolidado e decisões sobre conflitos

1. **#980:** comparador NCM/CEST/EAN, implementado no módulo separado e inserido no backend e no detalhe do Admin como **somente leitura**.
2. **#983:** auditoria de erros de catálogo, resolução de falhas após releitura, painel e confirmação manual. Arquivo de migração pré-existente na PR copiado ao repositório da branch, mas **não executado** nesta rodada.
3. **#986:** histórico paginado (60 por solicitação), botão Carregar mais, descarte de resposta obsoleta, deduplicação e carregamento lazy.
4. **#989:** extratores NF-e idênticos exigindo chave do próprio documento e protocolo SEFAZ coerente.
5. **#990:** ledger SQL de propostas/decisões e histórico **apenas em `docs/projects/`**; sem criar tabelas no Supabase.
6. **#992:** gateway humano com papel owner/admin, identidade do operador extraída do autenticador, proposta/decisão por campo e interface lazy no Admin.
7. **#993:** protótipo de aplicação nominal CAS e rollback preservado como documentação/teste, **não implantar isoladamente**.
8. **#995:** versão substitutiva com bloqueio de produtos ativos em prévia, aplicação e rollback, igualmente **somente SQL de proposta**, sem endpoint executor.

**Conflitos resolvidos:** dois `purchase-xml-v1/index.ts` reconstituídos e sincronizados byte a byte, incorporando as quatro alterações concorrentes da API; `vitrine/admin/index.html` recomposta com histórico, comparação, erro de catálogo e revisão no mesmo detalhe; os dois parsers, dois comparadores e os dois gateways também são espelhos idênticos. Testes originais de renderização isolada adaptados para incluir os helpers adicionais presentes após a integração, sem alterar seu comportamento operacional.

**Proteção de precisão adicionada na R18:** como o comparador #980 trabalha somente com as primeiras 60 evidências da paginação #986, a API expõe `comparison_scope` e a interface avisa explicitamente **Comparação PARCIAL** quando existir mais histórico. Não afirmar que uma comparação parcial representa todas as NF-e.

### Testes realizados de verdade

- [CI final XML Catalog R18 Consolidation — run 37934816543](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37934816543): **3/3 jobs concluídos em success**, incluindo verificação de tipos `deno check` de AMBOS os backends XML completos, verificados pelo resultado dos jobs:
  - `source-and-ui`: **11 scripts Node PASS** (catálogo, comparador, falhas, paginação, ficha legada, revisão/auditoria, autenticação, interface, CAS/rollback estático e limites do gateway).
  - `real-parser`: Deno + `fast-xml-parser` real: **PASS** na coerência de chave/protocolo e rejeição XML malformado/DTD.
  - `transactional-ledger`: PostgreSQL 17 em container **descartável**: **PASS** para autorização de proposta, aplicação e reversão apenas de produto inativo, compare-and-swap, idempotência, trilha auditável e bloqueios.
- Primeiras tentativas de CI falharam porque fixtures de UI em isolamento não incluíam todos os helpers após a integração. Correções realizadas, regressão reexecutada até a CI verde. Isso **não** equivale a validação ponta a ponta do Admin em produção.

### Runtime e segurança (somente leitura)

- Supabase canônico `ssbesxgaijknwsjbsbcz`: **90** documentos XML, **214** itens declarados e catalogados, **0** faltantes e **0** falhas de catalogação registradas.
- Auditoria: `purchase_xml_catalog_ingest_errors_v1` e `purchase_xml_catalog_observations_v1` com RLS habilitado; views de falhas e detalhes com `security_invoker=true`; sem leitura direta `anon`/`authenticated` nos objetos examinados.
- `purchase_xml_field_reviews_v1` e `purchase_xml_field_applications_v1` continuam **ausentes** em produção. Edge Admin ainda v230 (`verify_jwt=false`, autenticação interna), stage XML v10; não houve publicação.
- **Zero ações operacionais reais:** nenhuma modificação em produtos, estoque, preços, atributos fiscais, financeiro, Bling, vitrine, cron; nenhuma migração, deploy ou merge.

### Estado e próxima rodada

**R18 concluída quanto à consolidação de código e regressão integrada em CI; PR #997 permanece draft e não publicada.** Avançar para **R19**: homologar Bling/upload manual apenas sob controle, NF-e reais/anônimas de teste, XML sem protocolo, malformado, lote >10 MB, hash/privacidade/idempotência, consulta da origem e regressão do fluxo financeiro **sem operações fiscais/comerciais reais**. Depois R20 (histórico integral/compilação de comparação além de 60, UI), R21 (vinculação/cadastro inativo), R22–R27 (ledger/atores, aplicação controlada, fiscal, E2E e publicação com gates). Não integrar PRs individuais sobre a PR consolidada sem reconciliar SHAs e CI.

## Checkpoint R19 — 09/10/2026 — integridade de Bling/manual e fonte XML (testes isolados)

**PR draft empilhada:** [#999](https://github.com/osvaldosereia/SUCEDOAN12/pull/999), branch `agent/xml-catalog-ingest-integrity-r19-20261009`, criada a partir da branch consolidada R18 `agent/xml-catalog-consolidation-r18-20261009` (PR #997, derivada da `main` `8d2e187`). Não fazer merge direto na `main` sem conciliar a dependência R18.

### Código gravado
- Guard `xml-catalog-ingest-guard.mjs` duplicado de forma idêntica nos dois backends. `assertCatalogXmlSize` verifica **bytes UTF-8**, conforme limite da bucket privada `purchase-xml` (10 MiB), em vez de só `String.length`. Entrada inválida/oversize é rejeitada antes de iniciar o parser operacional no `processXml`.
- `assertCatalogXmlIntegrity` executa o parser real `fast-xml-parser@5.11.2` e valida identidade `infNFe@Id`, chave esperada, coerência de protocolo/cStat, malformação/DTD e número máximo de itens **antes de qualquer gravação de documento, contato, estoque ou financeiro no `processXml`**. O programa de importação pode ter buscado XML/OAuth antes, mas nenhuma atualização comercial é autorizada por esta validação.
- Na importação manual `catalog_only`, a validação é feita antes do upload ou documento novo. O fluxo preserva `financial_eligible=false`, `finance_reference.accounts=[]`, `receipt_status=review` e não chama Bling.
- XML já existente com mesmo `document_key` e `content_sha256` divergente é **rejeitado**, sem sobrescrever XML/registro/estoque/financeiro. Para legado sem hash, mantém compatibilidade sem afirmar equivalência. Releitura manual checa bytes, origem e hash antes de catalogar.
- **Limitação deliberada:** o modo operacional `manual_import` e o `bling_sync` seguem com suas rotinas e efeitos de compra existentes. Não foram executados em produção nesta rodada. Uma serialização diferente do mesmo XML pode alterar o SHA mesmo que a NF-e seja semanticamente equivalente; conflito requer revisão humana, nunca overwrite automático.

### Testes efetivamente realizados
- [GitHub CI R19 final — run 37937233361](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37937233361): **success** — Deno com parser real, mock isolado que executa a função existente `manualCatalogOnlyImport` por extração do próprio backend, type-check dos dois `index.ts` e regressão de protocolo V6.
- Casos aprovados: XML simples e sem protocolo, mismatch de chave/protocolo, status SEFAZ não autorizado, DTD, XML malformado, limite 10 MiB ASCII, XML Unicode com mais bytes que caracteres, 11 arquivos rejeitados, duplicação idempotente com SHA igual, rejeição com SHA diferente, sem chamadas a tabelas de produtos/financeiro/estoque nem Bling no mock de `catalog_only`.
- O mock é um teste de execução isolada do código real da função, **não** uma homologação de rede, bucket real, OAuth, Bling ou UI autenticada.

### Runtime somente leitura
- Supabase canônico: 90 XMLs registrados, 214 itens conciliados, nenhum faltante. `purchase_xml_documents`: 90 chaves distintas e nenhum hash ausente. Bucket `purchase-xml` é **privada** (`public=false`), limite `10.485.760` bytes, MIME XML/octet-stream. Consulta às políticas diretas de objeto filtradas pela bucket não retornou política aplicável.
- `purchase_xml_catalog_ingest_failures_v1` possui **0** pendências e ledger de revisão/aplicação continua não instalado. Admin produção v230 / stage XML v10 inalterados.
- Nenhuma migração, deploy, merge, leitura/transferência de XML privado real, nova pesquisa externa, cron, movimentação fiscal/comercial ou atualização de produto.

### Próximo trabalho — R20
- Histórico paginado completo: o comparador #980 atualmente considera a **primeira página de 60**, claramente marcada como parcial na R18. Propor/implementar comparação integral e bounded por servidor, sem baixar tudo no início, incluindo testes de >60 linhas, fornecedor, embalagem/GTIN, perdas de conexão e UI lazy.
- Manter R19/R18 em PRs draft até gates reais, sem substituir alteração recente da main.

## Checkpoint R20 — 09/10/2026 — comparação do histórico completo sob demanda

**PR draft empilhada:** [#1001](https://github.com/osvaldosereia/SUCEDOAN12/pull/1001), branch `agent/xml-catalog-full-history-r20-20261009`, originada da R19 [#999](https://github.com/osvaldosereia/SUCEDOAN12/pull/999), que depende da consolidação R18 [#997](https://github.com/osvaldosereia/SUCEDOAN12/pull/997), cuja raiz é a `main` `8d2e187fa3d7`. Sem merge/deploy/migration.

### Funcionalidade implementada na branch
- Serviço `xml-catalog-full-comparison.mjs` espelhado nos dois backends. Consulta `purchase_xml_catalog_observation_details_v2` com ordenação determinística e `count:exact`, **páginas de 200**, teto rígido de **5.000 observações por candidato**; calcula somente agregados, não devolve linhas XML completas ao navegador.
- Consulta separada `xml_catalog_full_comparison`, disponível apenas sob ação explícita de sessão humana `owner/admin` autenticada (JWT + `admin_users`). Tokens internos, `viewer` e `operator` rejeitados; falhas de consulta não expõem dados SQL sensíveis.
- Mantém abertura normal do detalhe em até 60 linhas, com carregamento lazy. Botão **Conferir histórico completo** aparece quando a primeira página não basta. Após clique, a UI mostra resultado integral, ou **PARCIAL** se o teto de 5.000 for atingido, a contagem mudar ou linhas se repetirem. Nunca apresentar resultado parcial como auditoria completa.
- Comparação inclui NCM, CEST, GTIN/EAN comercial e divergências por fornecedor; inclui EAN tributário `cEANTrib`, unidade comercial `uCom` e unidade tributável `uTrib` como **evidência**, nunca conversão automática de embalagem nem aprovação fiscal.
- Guardas da interface descartam respostas atrasadas ao mudar de candidato, não pré-carregam comparação integral, e não atualizam produtos/estoque/Bling/financeiro.
- Sem leitura pública de XMLs brutos, consulta externa, cron, migração, tela adicional, ou mudança no visual da vitrine pública.

### Testes verificados
- [CI final XML Catalog R20 Full History — run 37938913888](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37938913888): **2/2 jobs success**.
- Teste `test-xml-catalog-full-history-r20.mjs`: 137 observações com NCM divergente **depois** dos primeiros 60, GTIN tributário, compra/tributação por unidade, leitura paginada, limite máximo de 5.000, candidato vazio, erro SQL, contagem divergente entre páginas, repetição de observação, segurança de escopo, carregamento UI sob clique e descarte de resposta atrasada.
- CI também executou regressões de comparação v3, paginação v3, ficha v2, consolidação R18, revisão UI R15, `deno check` dos dois módulos XML, parser real e testes isolados da R19. Primeira CI falhou em teste isolado quando `full` e chave ausente eram comparados como iguais; condição corrigida e CI repetida com aprovação. **Não é homologação operacional em produção.**

### Runtime read-only
- Supabase canônico: 147 candidatos, máximo de **10 observações** por candidato, nenhum com mais de 60; 90 XMLs/214 linhas catalogadas e 0 faltantes. Logo a funcionalidade resolve demanda futura, não um acúmulo real atual.
- As views `purchase_xml_catalog_candidates_v1` e `purchase_xml_catalog_observation_details_v2` têm `security_invoker=true` e sem `SELECT` direto a `anon`/`authenticated`.
- Nenhum produto, estoque, custo, preço, fiscal, financeiro, Bling, Supabase de produção ou `main` foi modificado.

### Próximo passo
**R21:** homologação de identidade, EAN comercial/tributário, unidade/caixa, conversão de embalagem, vinculação humana e criação inativa, com papel/verificação/auditoria e teste E2E isolado, sem publicar ou aplicar dados reais. Após R21, R22–R27 para decisão/aplicação/rollback fiscal segregado, performance, integração e lançamento com gates formais. Não mesclar individualmente PRs #997/#999/#1001 sem respeitar dependências e executar a CI sobre a árvore combinada.

### Verificação de concorrência após o fechamento da R20
- Durante a rodada, a `main` passou de `8d2e187fa3d7` para `1c859e27664d`, por commit **alheio à R20** (`feat: ativar orçamento para pedido de venda Bling`). Mudou `orcamento/app-original.html`, `admin-products-live-v1/index.ts`, `admin-service-intelligence-v1/index.ts` (roteador pai) e uma migration de orçamento.
- Nenhum desses arquivos foi sobrescrito pela branch R20. Verificação: o roteamento `action==="purchase_xml"` → `handlePurchaseXmlRequest(req,body,false)` continua igual no roteador pai das duas versões, mas precisa de teste integrado ao rebase final.
- O Supabase mostra agora Admin v231 (`verify_jwt=false`), atualização **externa à R20**; a R20 não fez deploy. Contagens permanecem 90 XMLs, 214 itens catalogados, 0 faltantes.
- PR #1001 continua empilhada sobre R19 → R18, baseada na `main` anterior. **Antes de integrar em `main`, atualizar a cadeia a partir do novo commit com reconciliação e CI novamente.** Não fazer `force push`, merge ou deploy nesta rodada.

## Checkpoint R21 — 09/10/2026 — identificação atômica, EAN comercial/tributável, embalagem e cadastro inativo

**PR draft empilhada:** [#1004](https://github.com/osvaldosereia/SUCEDOAN12/pull/1004), branch `agent/xml-catalog-identity-atomic-r21-20261009`, originada de R20 #1001 → R19 #999 → R18 #997. R21: 12 commits, 7 arquivos antes deste checkpoint, zero commits atrás da branch R20. A `main` avançou paralelamente para `6125692fcbbac66c07869b0dba1cf21b0eae1440` por mudanças de orçamento/rotas Admin, alheias à R21; não sobrescrever nem mesclar sem reconciliar a `main` mais nova.

### Diagnóstico real da R21
- `resolvePurchaseItemIdentity` legado faz escrita em `products`, `product_identifiers` e `purchase_xml_items` em múltiplas transações. Se uma etapa falha, poderia deixar cadastro/identificador órfão, sem vínculo concluído; reexecuções e concorrência podem resultar em estados inconsistentes.
- O gatilho produtivo `purchase_xml_sync_inventory_lot_v1` escuta alterações em `purchase_xml_items.product_id` e `converted_quantity`, criando/atualizando lotes, inclusive quantidade recebida quando o documento já tem registro de recebimento. Este efeito precisa ser bloqueado no modo **somente evidência XML**, não apenas verificado por testes superficiais.
- Consulta Supabase somente leitura: `purchase_xml_items` 214 linhas, 59 linhas sem vínculo, **nenhuma das 59** com quantidade convertida positiva ou lote vinculado; `purchase_xml_catalog_candidates_v1` possui 32 **candidatos agrupados** sem vínculo, contagem distinta das 59 linhas operacionais. Produtos, identificadores, itens e embalagens estão com RLS habilitado e sem permissão de UPDATE direto para `anon/authenticated`.

### Código R21
1. SQL de preparação `docs/projects/purchase-xml-identity-atomic-r21.sql`, **NÃO MIGRAÇÃO/NÃO APLICADO**. RPC `purchase_xml_resolve_catalog_identity_v1` executa em transação única, `SECURITY INVOKER`, revogação de `PUBLIC/anon/authenticated`, concessão a `service_role`. Ledger `purchase_xml_catalog_identity_actions_v1` com RLS, eventos imutáveis e no máximo uma decisão por item.
2. A função bloqueia a linha de `purchase_xml_items`, serializa EAN com advisory xact lock e rejeita item já vinculado, fonte não verificada, GTIN inválido (inclui dígito verificador), duplicidade entre produtos, documento recebido, lote existente ou `converted_quantity<>0`, unidades por peso/volume e fator inadequado. Suporta EAN **comercial ou tributável escolhido expressamente**, papel `base_unit/package` e fator exato.
3. Para vínculo existente: **não altera o produto mestre**. Para novo cadastro: cria **inativo**, com WhatsApp desativado, estoque 0, NCM/custo/preço nulos, sem publicação e com revisão fiscal pendente. Atribui apenas `product_id` e metadados de identidade no item; não preenche `converted_quantity`, nem realiza recebimento. Inserções de produto, identificador, vínculo e auditoria são atômicas, sujeitas a rollback da transação.
4. Os dois `purchase-xml-v1/index.ts` idênticos chamam **somente a RPC** em `catalog_evidence_only=true`. Somente sessão humana owner/admin, confirmação explícita `CRIAR_INATIVO_XML` ou `VINCULAR_ITEM_XML`, ator obtido do JWT e `admin_users`, nunca enviado pelo cliente. Na ausência da RPC, falha fechado com `503 xml_identity_service_unavailable` sem deixar cadastro parcial; o caminho operacional legado sem `catalog_evidence_only` permanece sem alteração.
5. UI existente no Admin exige escolha explícita de EAN comercial ou tributável (mesmo quando diferentes), tipo unidade/embalagem, fator e confirmação humana. Não há pesquisa Cosmos/SI5, alteração de visual público, criação de cron, Bling, preço, estoque, NCM/CEST ou financeiro por esta rotina.

### Testes efetivos
- [CI final R21 — run 37941206019](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37941206019): **3/3 jobs success**.
  - `human-gateway-and-ui`: script Node de autorização/proveniência do ator, erros fail-closed, validação da origem EAN e fator; regressões de identidade/ficha, histórico R20 e R18.
  - `disposable-postgresql`: PostgreSQL 17 isolado com trigger de lote simulado: criação inativa + vínculo, nenhum lote, teste de duplicado, confirmação obrigatória, fonte XML não verificada, recebimento prévio, peso, quantidade operacional, ator ausente, auditoria e ausência de privilégio público.
  - `edge-types`: `deno check` nas duas cópias completas.
- A primeira execução de PostgreSQL revelou teste contraditório (item `CX` como unidade) e a segunda encontrou `UPDATE` negado na auditoria, proteção correta do banco; ambos os fixtures corrigidos **sem afrouxar as regras**. A terceira execução passou.
- **Não é homologação em produção.** A RPC e o ledger continuam inexistentes no Supabase produtivo, conforme `to_regprocedure/to_regclass` read-only. Admin produtivo chegou à v232 por atualização externa à R21; esta rodada não fez deploy.

### Gates pendentes para R22 e posteriores
- R22: revisar sintaxe/schema e triggers reais em homologação fiel ao Supabase, substituir SQL de rascunho por migração canônica revisada, resolver orquestração de dependências das PRs empilhadas e migrações anteriores; fazer testes de autenticação real e browser. Não implantar endpoint novo sem RPC.
- O modo catálogo **não pode tratar itens com lote/recebimento/conversão ativa**; esses casos exigem fluxo operacional de Compras. Não alterar o trigger global para contornar salvaguarda sem projeto separado.
- R23–R27: ledger de revisão campo a campo, aplicação/reversão com CAS, validação fiscal segregada, testes E2E XML real e publicação controlada com monitoramento.
- **Nenhum merge na main, migration, deploy, chamada fiscal/comercial, mutação Supabase produtiva, Bling ou cron nesta rodada.**

## Checkpoint R22 — 09/10/2026 — gates reais de lote, Bling inativo e segurança do ator

**PR draft empilhada:** [#1009](https://github.com/osvaldosereia/SUCEDOAN12/pull/1009), branch `agent/xml-catalog-release-gates-r22-20261009`, baseada na R21 #1004 → R20 #1001 → R19 #999 → R18 #997. Branch sem merge, nenhuma migração/deploy/alteração Supabase executada.

### Correções concluídas
1. **Bug real no rascunho R21:** cadastro criado `is_active=false`, porém `desired_bling_status='A'` (intenção de ativação no Bling). Novo SQL R22 grava **`'I'`**.
2. **Faltavam dois sinais de recebimento:** o gatilho produtivo não considera apenas `purchase_xml_documents.receipt_status='received'`, mas também plano `purchase_stock_receipt_plans_v1.status='verified'` e lançamento `purchase_stock_receipts.status='applied'`. O SQL R22 bloqueia os três antes de vincular.
3. **Lote órfão:** uma linha sem `inventory_lot_id` ainda pode ter `product_inventory_lots.source_ref='purchase-xml-item:<uuid>'` em estado operacional. Bloqueia qualquer lote preexistente por essa referência.
4. **Autorização:** a RPC agora confirma `admin_users.user_id` ativo com papel `owner/admin` dentro da transação, além do JWT/role verificado no gateway.
5. **GTIN:** código já confirmado para o mesmo produto, mas com papel `package_gtin` em vez de `base_gtin` (ou inverso), gera conflito e exige revisão, sem reinterpretar silenciosamente.
6. **Migração candidata:** `docs/projects/purchase-xml-identity-release-candidate-r22.sql` ainda é **PROPOSTA, não migração**, não foi aplicada. Publicação exige geração de migração canônica via CLI em homologação, controle da ordem DB → backend → UI e revisão de impacto.

### Prova de testes
- [CI XML Catalog R22 Release Gates — execução final 37943285385](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37943285385): **3/3 jobs SUCCESS** (estático/gateway, `deno check`, PostgreSQL 17 descartável).
- O teste PostgreSQL incorpora arquivo `scripts/fixtures/xml-production-lot-trigger-r22.sql`, copiado da definição real `pg_get_functiondef` + `pg_get_triggerdef` do Supabase canônico, e reproduz campos e tabelas necessárias.
- Logs contêm **`PASS R22 real lot trigger, active owner, receipt plans, Bling-inactive, audit and role conflicts`**. Cenários: vínculo seguro, cadastro inativo/estoque zero/Bling I, sem lotes, confirmação, replay, status de documento, plano verificado, estoque aplicado, lote desvinculado, EAN com papel divergente, operador/owner inativo, origem não verificada e grants.
- Primeira CI falhou porque o *fixture* estava sem coluna `purchase_xml_items.processing_status` exigida pelo trigger verdadeiro; completou-se a estrutura de **teste**; segunda CI integral passou. Nenhuma regra produtiva foi afrouxada.

### Produção auditada (somente leitura)
- `main` durante o fechamento: `6ce76d214a0759e946ddfca65364e19e1991d770` (alterações paralelas em orçamento e roteador pai, preservar na integração).
- Runtime Edge `admin-service-intelligence-v1` versão **234**, publicado por outros trabalhos, **não** por R22.
- `purchase_xml_items`: **214** linhas, **59** sem vínculo. View de observações: **214**. A RPC R22 e a tabela de auditoria ainda retornam `NULL` em `to_regprocedure/to_regclass`, isto é, **não implantadas**.
- `purchase_xml_catalog_observation_details_v2` tem `security_invoker=true`, 214 linhas `source_state='xml_verified'`. Objetos existentes de compra/produto têm RLS; novos grants só foram testados em banco descartável.
- A auditoria de Advisors do Supabase devolveu lints globais de outros domínios; **não** se deve alegar ausência de alertas de segurança no projeto inteiro. As verificações R22 concentram-se no escopo XML.

### Documentação de transição
- [Roteiro de publicação R22](https://github.com/osvaldosereia/SUCEDOAN12/blob/agent/xml-catalog-release-gates-r22-20261009/docs/projects/PURCHASE_XML_RELEASE_SEQUENCE_R22.md): depende da consolidação `main`, migração canônica via Supabase CLI (não criar filename arbitrário), Auth e teste E2E em homologação, permissão/rollback e smoke test. Execução R23 pode prosseguir diretamente.
- **R22 concluída em código e CI isolada**, sem autorizar implantação. Não aplicar SQL de docs, mesclar, fazer deploy, tocar estoque/fiscal/financeiro ou alterar Bling com base somente nestes testes.

## Checkpoint R23 — 09/10/2026 — código R18–R22 consolidado na main, migration canônica gerada e testada

- **PR principal (draft):** [#1012](https://github.com/osvaldosereia/SUCEDOAN12/pull/1012), branch `agent/xml-catalog-main-integration-r23-20261009`. Iniciada da `main 4683d79c2f0985e4c068544d706b475e9d462c53`; incorporou arquivos e histórico R22 com merge de dois pais. Preservou todas as mudanças de orçamento/Bling da main (sem arquivos sobrepostos); **não fez merge na main**.
- **Auditoria de migração divergente solucionada:** `20261009035359_purchase_xml_ingest_error_audit_v5` já constava no Supabase, enquanto a PR antiga tinha `20261009085000_...`. Conferidos os **1.940 caracteres SQL exatos** no `supabase_migrations.schema_migrations.statements[1]`, restaurado no repositório com número correto e **removida** a migração duplicada. Arquivo histórico em `docs/projects/purchase-xml-ingest-error-audit-applied-r23.sql`.
- **Migration R23:** `supabase/migrations/20261009145919_purchase_xml_identity_atomic_r23.sql`, gerada com Supabase CLI 2.84.2 no [CI #37948241592](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37948241592), commitada e **executada apenas no PostgreSQL descartável** como arquivo versionado. Permissões RLS, função `SECURITY INVOKER` de identidade atômica, status Bling `I`, bloqueios de lotes/recebimentos e auditoria incluídos.
- **CI conjunta FINAL VERDE:** seis workflows em uma árvore, R18 [37949113896](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37949113896), R19 [37949113827](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37949113827), R20 [37949113867](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37949113867), R21 [37949113822](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37949113822), R22 [37949113898](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37949113898), e R23 [37949113906](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37949113906) (**R23 3/3 jobs success**: Node incluindo orçamento/Bling, Deno parser+tipo, PostgreSQL17 migration/gatilho real).
- Supabase canônico continua com **214 itens, 59 sem vínculo**, ledger/RPC de identidade inexistentes; nenhuma migration produtiva nova, deploy Edge, alteração de preço/estoque/tributação, Bling ou publicação de produto. **Produção inalterada pela R23.**
- **Roteiro completo e limites:** [PURCHASE_XML_R23_INTEGRATION_CHECKPOINT.md](https://github.com/osvaldosereia/SUCEDOAN12/blob/agent/xml-catalog-main-integration-r23-20261009/docs/projects/PURCHASE_XML_R23_INTEGRATION_CHECKPOINT.md).
- **Próxima R24:** homologação de revisão humana campo a campo, SQL de aplicação/rollback CAS somente em produto inativo, e integração com as migrations R23, tudo sem mutar produção. Após R24, R25 fiscal, R26 E2E real isolado e R27 lançamento controlado com gates.

## Checkpoint R24 — 09/10/2026 — revisão individual, CAS nome inativo, rollback e gate visual

- **PR draft #1018:** [GitHub](https://github.com/osvaldosereia/SUCEDOAN12/pull/1018), base R23 #1012.
- **SQL + gateway implementados:** ledger de decisões e eventos imutáveis, aplicação e reversão do **nome exclusivamente em produtos inativos**, confirmação independente, revisão otimista e CAS, ator owner/admin ativo verificado no gateway **e no PostgreSQL**, sem mutação fiscal/estoque/Bling. Código espelhado nos dois backends `purchase-xml-v1`.
- **Migração versionada gerada pela CLI:** `supabase/migrations/20261009155445_purchase_xml_field_approval_r24.sql`, criada com `supabase migration new` no GitHub Actions, não aplicada à produção.
- **[CI final #37955537001](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37955537001): 3/3 jobs success** (Node gateway/permissões, Deno typecheck, PostgreSQL17 aplicação/rollback seguro). A migration commitada foi aplicada só no PostgreSQL descartável.
- **Atenção: UI não concluída.** Atualização no `vitrine/admin/index.html` foi bloqueada pela ferramenta de escrita. A tela R23 permanece sem novos controles de prévia/aplicação/reversão. Não afirmar que a ferramenta já está disponível para equipe, e **não publicar o backend/UI em produção**.
- **Produção intocada:** 214 itens, 59 desvinculados; os novos ledgers/RPCs não existem. `main` avançou paralelamente `d5f3f16b5b6b8ba27823406de0c43628e62d4a78` por projeto de separação. Planejar integração com as novas migrations e histórico antes de qualquer `db push`.
- **Instruções exatas para continuidade:** [PURCHASE_XML_R24_FIELD_REVIEW_CHECKPOINT.md](https://github.com/osvaldosereia/SUCEDOAN12/blob/agent/xml-catalog-field-approval-r24-20261009/docs/projects/PURCHASE_XML_R24_FIELD_REVIEW_CHECKPOINT.md).
- **Próxima R25:** completar a UI via caminho de gravação suportado, testes de browser/Auth reais em homologação, reconciliar migrations R23/R24 versus `main` e rever requisitos fiscais NCM/CEST/GTIN sem escrita automática. Só depois R26 E2E e R27 publicação.

## Checkpoint R25 — 09/10/2026 — dossiê fiscal XML somente leitura e prevenção de duplicidade em migrações

- **PR draft #1022:** [Github](https://github.com/osvaldosereia/SUCEDOAN12/pull/1022), branch `agent/xml-catalog-fiscal-audit-r25-20261009`, base R24 #1018.
- Serviço `xml-catalog-fiscal-dossier.mjs` e action `xml_catalog_fiscal_dossier` criados nos dois backends. Somente sessão humana owner/admin, apenas leitura, com histórico limitado/paginado da R20. Consolida NCM/CEST, GTIN comercial e tributável, `uCom/uTrib`, divergências por fornecedor, checksum EAN, falta de dados e identidade. Toda resposta recusa aprovação fiscal automática, conversão automática e mutação de produtos, estoque, preços, Bling e financeiro. O endpoint ainda **não está disponível pela interface do Admin**, que permanece sem a alteração visual bloqueada na R24.
- Corrigida duplicidade de migração de separação em GitHub vs. histórico Supabase: a `main` tinha `20261009160000_separation_ready_reservation_idempotence.sql` e o Supabase já tinha **SQL idêntico, 2.112 caracteres**, sob versão `20261009155231`. A R25 incorporou a `main d5f3f16b` no histórico como segundo pai, preservou o teste de separação, versionou o arquivo com `20261009155231` e eliminou duplicação no **candidato de merge**, sem escrever no banco remoto. Teste atualizado para a versão correta.
- **CI FINAL VERDE:** [workflow 37970784238](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37970784238), **3/3 jobs success**: Node (dossiê, GTIN, conflito, histórico e migrações); Deno (dois backends e parser XML real); PostgreSQL17 descartável (R24 revisão/aplicação/reversão CAS). Falhas iniciais de caminho de teste e `status` TypeScript corrigidas, depois CI verde.
- Supabase canônico consultado apenas em modo leitura: 214 linhas XML, 59 sem vínculo; 147 candidatos: 113 linked_reviewable, 32 not_linked, 1 fiscal_conflict, 1 cest_conflict. Migrações R23/R24, funções e ledgers correspondentes continuam **não implantados na produção**.
- **Bloqueios reais:** UI monolítica do Admin não pode ser alterada pelo caminho bloqueado da R24; dossiê e ações de aplicação/rollback não podem ser oferecidos como funcionais à equipe. R23 migration versionada `20261009145919` é anterior à migration já aplicada `20261009155231`; não usar `db push` nem `migration repair` às cegas. É obrigatório homologar a sequência em projeto Supabase isolado com autenticação real e então resolver o bloqueio de UI por procedimento autorizado.
- **Próxima rodada R26:** QA E2E Supabase/Auth/Edge/UI em ambiente isolado, plano de aplicação das migrations R23/R24 após a migração de separação já aplicada, fiscal e embalagem sem escrita automática, métricas e rollback. **Sem merge/deploy/escrita produtiva na R25**.
- Detalhes completos: [PURCHASE_XML_R25_FISCAL_CHECKPOINT.md](https://github.com/osvaldosereia/SUCEDOAN12/blob/agent/xml-catalog-fiscal-audit-r25-20261009/docs/projects/PURCHASE_XML_R25_FISCAL_CHECKPOINT.md).

## Retomada em novo chat — R26 (09/10/2026)

**Arquivo de continuação preservado:** [RETOMADA_COMPRAS_CATALOGO_XML_R26_2026-10-09.md](./RETOMADA_COMPRAS_CATALOGO_XML_R26_2026-10-09.md), commit inicial `d520e002f1b55a6cc97db80b3f59299517af4dcf`, branch `agent/xml-catalog-fiscal-audit-r25-20261009`, PR #1022. Leia este arquivo na íntegra ao retomar em outro chat. R25 está com CI 3/3 verde; R26 é a próxima rodada. Não confundir testes isolados com disponibilidade da UI ou homologação de produção. R23/R24 ainda têm migrations pendentes e a UI de aplicar/reverter permanece bloqueada. Sem merge/deploy na main ou produção.


## Checkpoint R26 — 09/10/2026 — suite integrada e bloqueio seguro de release

- **PR draft [#1025](https://github.com/osvaldosereia/SUCEDOAN12/pull/1025)**, branch `agent/xml-catalog-operational-gates-r26-20261009`, base R25 #1022; código, dados produtivos e alterações de pedidos na `main` preservados, sem merge/deploy.
- **[CI final R26 #37972261768](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37972261768): 3/3 SUCCESS**. Suíte Node/Edge e PostgreSQL17 descartável executa as migrations R23 e R24 juntas, com trigger real de lotes reproduzido, jornada humana completa de identidade → revisão → prévia → aplicar nome somente inativo → rollback CAS, permissões owner/admin e bloqueios operator/viewer/owner desativado, RLS/grants, sem alteração de preço, estoque ou fiscal. Primeiro CI falhou por teste R19 executado no Node; foi corrigido para Deno e repetido.
- **Preflight fail-closed:** módulo e testes R26 barram migração duplicada e R23 anterior à migração remota de separação já aplicada (`20261009155231`); todas as aprovações reais de staging, navegador, Auth, UI e rollback são obrigatórias para liberar.
- **Supabase apenas leitura:** sem branch homologatória disponível; nenhuma migration R23/R24 executada; UI R24/R25 do Admin continua bloqueada; não afirmar E2E real ou release pronta. Não executar `db push`/`migration repair` de maneira automática.
- **Handoff operacional detalhado e próximo roteiro:** [PURCHASE_XML_R26_OPERATIONAL_CHECKPOINT.md](./PURCHASE_XML_R26_OPERATIONAL_CHECKPOINT.md). Próximo trabalho é eliminar bloqueios de homologação isolada e UI, gerar versões de migration via CLI após histórico remoto e testar DB→Edge→UI; só então avaliar R27 de publicação.
