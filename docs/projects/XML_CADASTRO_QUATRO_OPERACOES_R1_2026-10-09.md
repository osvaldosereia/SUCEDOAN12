# Dona Antônia — Compras/XML e Cadastro de Produtos — R1 (auditoria e contrato de consolidação)

Data: 2026-10-09. Repositório: `osvaldosereia/SUCEDOAN12`. Projeto canônico Supabase: `ssbesxgaijknwsjbsbcz`.
**Este checkpoint é uma auditoria read-only, NÃO é publicação, alteração de estoque, mudança fiscal ou autorização de migrar banco.**
PR técnica consolidada de referência: **#1034**, branch `agent/xml-catalog-final-integration-r28-20261009`, ainda **draft**. Evitar branches e PRs adicionais sobre os mesmos arquivos. Não resgatar em separado a pilha de PRs R18–R27, já absorvida no #1034.

## 1. Contrato funcional aprovado pelo proprietário (prevalece sobre UX e fluxos anteriores)

Fontes de dados: **somente XMLs recuperados do Bling/SEFAZ pela integração existente e XMLs enviados manualmente**. Sem Cosmos, SI5, pesquisa externa de produto, IA para classificação, ou novo agendamento. A leitura automática existente de notas do Bling pode continuar; ela deve ser estritamente de **ingestão de evidências**, nunca autorização comercial implícita.

Existem **quatro operações por item de XML**, determinadas por vínculo confiável e opção humana de movimentar estoque:

| Produto | Sem entrada de estoque | Com entrada de estoque |
|---|---|---|
| Já existe | Atualizar dados selecionados; **não mudar nome existente**; estoque intocado | Atualizar dados selecionados; preservar nome; confirmar quantidade recebida e registrar uma entrada única |
| Novo | Exigir nome comercial revisado; criar cadastro com estoque zero | Exigir nome revisado; criar cadastro e lançar quantidade unitária recebida **uma só vez** |

- Nenhuma importação, releitura ou sincronização pode tomar a idade/data da nota como autorização para somar estoque.
- Padrão da UI: **somente cadastro, sem estoque**, inclusive XMLs novos do Bling. Cada documento/item aceita escolha individual; seleção em massa apenas como atalho, com prévia/confirmacão.
- Produto existente: preservar `products.name` sem exceção no fluxo XML. A funcionalidade prévia de CAS para renomear **produto inativo** do PR #1034 é legado de outra regra e **não deve ser disponibilizada como ação normal neste novo fluxo**; não mesclar UI antiga sem resolver isso.
- Produto novo: não copiar como nome comercial a descrição bruta `CX/FD/PCT ...`. Exibir texto original preservado, campo editável obrigatório de nome para **unidade de venda**; cadastrar `unit='UN'`. Exigir os demais campos essenciais ausentes (categoria, preço de venda quando aplicável, conversão, identificação segura), sem fabricar dados.
- Toda quantidade e todo custo controlado pelo cadastro/estoque são **por unidade**: `unidades = quantidade_comercial_XML × fator_embalagem`, `custo_unitário = custo_líquido_documentado_do_item ÷ unidades`, observando desconto/frete/seguro/outros. Se `uCom` do XML já for UN, fator 1, sem multiplicação adicional. Se unidade comercial for CX/FD e fator não confirmado, **bloquear aplicação de estoque e cadastro com quantidade inconclusiva**, e solicitar unidades por embalagem. Gravar regra por produto+fornecedor+item/unidade, sempre mostrando evidência e permitindo revisar.
- Guardar XML íntegro e histórico fiscal, inclusive NCM/CEST, CFOP, CST/CSOSN, origem, GTIN comercial/tributável, uCom/uTrib, impostos, fornecedor, custo, lote e validade se fornecidos. Dados fiscais de **entrada** são evidências; não atualizar automaticamente perfil fiscal de **venda** sem validação.
- Duplicação: chave NF-e 44 dígitos para documento; controle transacional/idempotente de **item efetivamente recebido**; impedir repetição mesmo quando documento veio primeiro pelo Bling e depois por upload. Importar sem estoque **não consome** a possibilidade futura de registrar uma entrada daquele item mediante confirmação.
- O sistema deve continuar simples: abas **XMLs/Compras**, **Revisar cadastros**, **Histórico**; ação de estoque identificável nas notas, sem obrigar acesso ao Bling. Cards de "Prontos", "Ajustar" e "Conferir", bulk para operação sem estoque e categoria/conversão apenas em grupos coerentes; não aprovar NCM/CEST conflituosos em massa.
- Evitar modificação silenciosa de nome, estoque, preço de venda, NCM/CEST, financeiro, Bling ou site público.

## 2. Inventário do código (consulta GitHub realizada nesta R1)

- `main` lida no commit **`baf21c4280ecb51b6eed4cf704f5ab6143301844`**; #1034 está **divergente**: `ahead_by=40`, `behind_by=12`, merge-base `baf21c4280ecb51b6eed4cf704f5ab6143301844`. Não fazer merge sem nova reconciliação de CI/arquivos, sobretudo fiscal.
- #1034 já reúne comparador NCM/CEST/GTIN, histórico paginado, parser íntegro, gateway de revisão, dossiê fiscal read-only, aplicação/rollback nominal inativo, testes Node/Deno/PostgreSQL/Chromium/GoTrue local. Não recriar estes módulos.
- Front-end existente: `vitrine/admin/index.html`, seção `xmlCatalogSectionHtml` lazy, ficha `xmlCatalogDetailMarkup`/`xmlCatalogDetailSave`, upload manual `xml_catalog_only_import` em lotes de cinco por requisição, e importação operacional `manual_import` em lotes de dez.
- Backend **operacional do Admin**: `supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/index.ts`, acionado através do serviço pai `admin-service-intelligence-v1`. O arquivo `supabase/functions/purchase-xml-v1/index.ts` é um módulo/cópia de compatibilidade, **não um endpoint autônomo Deno.serve**. Verificar paridade antes de cada edição.
- A função `manualCatalogOnlyImport` permite 1–10 XMLs por chamada; a UI faz chunks. Preserva evidências sem operações em produtos/estoque/financeiro.
- **Risco de fluxo antigo que precisa de correção em R2:** `processXml` da importação operacional `bling_sync/manual_import` chama `ensureProductSafe`, grava `product_supplier_packaging`, atualiza fornecedor/metadata em `products` e pode executar `syncFinanceDocument` se configuração permitir. A leitura automática ainda usa esse caminho; NÃO presumir que todo XML recebido é somente catálogo.
- **Lacuna de estoque:** o Admin atual em `receivePurchaseDocument` informa "Admin não soma estoque local" e manda preparar/verificar recebimento no Bling. Isso conflita com o requisito novo "tudo no Vitrine/Admin"; R3 deve escolher fonte única de saldo e evitar dupla contabilização com espelho/lotes/Bling.

## 3. Evidência SQL produtiva read-only nesta R1 (não alterada)

| Indicador do projeto canônico | Contagem |
|---|---:|
| `purchase_xml_documents` | 90 |
| `purchase_xml_items` | 214 |
| `purchase_xml_catalog_observations_v1` | 214 |
| Documentos incompletos na conciliação | 0 |
| Candidatos no catálogo | 147 |
| Candidatos sem produto vinculado | 33 |
| Candidatos com NCM conflitante | 1 |
| `products` | 1859 |
| `product_supplier_packaging` | 125 |
| `purchase_stock_receipts` | 0 |
| `purchase_stock_receipt_plans_v1` | 0 |
| `purchase_xml_field_reviews_v1` e `purchase_xml_field_applications_v1` | ausentes |
| Histórico migrations | 1188 remotas; topo `20261009200925` |

Configuração **efetiva** lida de `purchase_xml_settings`:
`daily_enabled=true`, `daily_lookback_days=31`, `auto_create_inactive_products=true`, `auto_sync_product_supplier=true`, `auto_create_payables=false`. Cron Bling `purchase-xml-daily-v1` (job 32) **ACTIVE**, `0 10,22 * * *`. A opção de criar produtos inativos automaticamente é incompatível com a nova exigência de **nome de produto novo revisado manualmente**; corrigir o fluxo/flag com transição segura antes de habilitar a nova interface. Não confundir a contagem zero de receipts com prova de que não houve outras entradas por Bling/mirror.

Runtime Supabase: `admin-service-intelligence-v1` ACTIVE **v247**, `verify_jwt=false` (autenticador próprio do serviço pai; revisar antes de modificar o parâmetro). Migrations R27 de identidade e revisão do #1034 NÃO aplicadas. Não usar `db push` geral, `migration repair` ou replay de 1188 migrations. Preview pago R29 anterior foi excluído; CI isolada R29–R31 já existe, sem provar E2E completo do serviço pai.

## 4. Priorização obrigatória após esta R1

**R2 — Um caminho único de ingestão e cadastro seguro.** Em toda entrada Bling/manual, salvar XML/observações/staging sem escrita implícita em produtos, financeiro, estoque; separar processamento operacional legado por compatibilidade/feature flags controladas. Criar contrato claro de match GTIN unitário x GTIN caixa x fornecedor e candidatura sem duplicar; formulários para nome obrigatório de novo produto, campos essenciais ausentes e regra caixa→UN. Aproveitar parser e comparação do #1034.

**R3 — Quatro operações atômicas e estoque sob comando humano.** Preview por item/documento e escolha explícita. Unidade/custo corretos, usuário e revisão auditados; recibo idempotente por documento+item; usar/sincronizar **uma única autoridade de estoque** após auditoria de `apply_purchase_stock_receipt_v1`, lotes, Bling mirror e `ops2`. Importação de catálogo nunca lança estoque. Estoque/financeiro jamais alterados por efeito indireto de uma atualização cadastral.

**R4 — UI objetiva e em massa.** Três abas, filas Pronto/Ajustar/Conferir, botões sem ambiguidade, multiarquivo (chunks backend max 10), seleção por documento e por item, correção de nome novo e fator, lote seguro; nenhum campo fiscal conflituoso aprovado em lote.

**R5 — Homologação/release.** Parser real, XML antigo, XML recente, PDF não XML, duplicata Bling↔upload, parcial, item novo/existente, GTIN caixa, unidade desconhecida, fator 1/6/12/24, custo líquido, lote, preço intacto, NCM/CEST conflitante, duas sessões, rollback e CIs. Ambiente isolado, Auth do roteador pai, E2E desktop/mobile, backup; migrations explicitamente selecionadas e reversionadas via CLI **após** topo remoto; DB→Edge→Admin e smoke somente depois de gates e autorização específica.

## 5. Limites, status e próximo passo

**R1 = auditoria + consolidação de estratégia e fonte de verdade; código operacional R2–R5 ainda não executado nesta retomada.** PR #1034 continua draft. **Nenhum** merge/deploy, migration, alteração de configuração, novo agendamento, consulta externa de produtos, lançamento de estoque, edição de produtos, financeiro ou envio ao Bling foi feito.

Antes de R2: revalidar SHA atual de main e #1034; não sobrescrever alterações fiscais concorrentes. Primeiro corrigir o risco de importação automática legada criar produtos sem nome revisado; depois construir operações por item com proteção transacional e aceitar apenas a UI única.
