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

- [CI XML Catalog R18 Consolidation — run 37934501706](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37934501706): **3/3 jobs concluídos em success**, verificados pelos logs:
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
