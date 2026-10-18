# XML: falhas de catalogação visíveis e recuperação manual (V5)

## Problema corrigido
A importação operacional das NF-e (Bling e uploads manuais) deve continuar funcionando mesmo se o parser da biblioteca histórica falhar. O código anterior registrava somente uma mensagem nos logs e não deixava pendência explícita para revisão.

## Fluxo da solução
- Leitura de XML novo: tenta persistir todas as observações do XML na biblioteca; se falhar, grava a pendência por `document_id` em `purchase_xml_catalog_ingest_errors_v1`, sem bloquear compra/financeiro.
- Releitura bem-sucedida: marca a pendência como resolvida; se falhar, atualiza erro com momento da tentativa.
- Admin > Compras/XML > Abrir catálogo histórico: exibe total de falhas, até 15 erros recentes e botão **Reler XML** por nota, com confirmação. Nada carrega antes de abrir catálogo.
- Não modifica produto, NCM, CEST, preço, estoque, Bling ou financeiro. Não cria cron nem pesquisa fontes externas.
- Tabelas e view restritas a backend (RLS e GRANT service_role); `anon` e `authenticated` não podem ler.

## Homologação realizada
- Migração aplicada no Supabase canônico.
- Edge Function isolada `admin-xml-catalog-stage-v1` versão 10 compilada com os patches das duas cópias sincronizadas do módulo XML.
- `xml_catalog_progress` em stage retornou HTTP 200, 90 documentos, 214 itens declarados, 214 armazenados/verificados no XML, zero itens ausentes, zero falhas de catalogação.
- Releitura manual controlada de uma nota com um item: HTTP 200, 1 item no XML, 0 itens extras, `products_updated=false`, `stock_updated=false`, `bling_called=false`, `finance_updated=false`.
- Acesso de banco: anon=false, authenticated=false, service_role=true.
- Advisor de RLS sem policies é INFO intencional: somente serviço privilegiado acessa a tabela.
- Workflow XML Catalog Ingest Audit V5 passou; workflow geral do Admin registra falha independente em teste `test-admin-pending-data-baskets-public-v1.mjs`, pois o HTML público não contém `channel_origin`. Não relacionado aos arquivos deste PR.

## Publicação
PR #983 ainda draft; **não foi integrado à main, nem foi atualizada a função principal Admin**. Publicar quando o CI geral e as alterações paralelas da tela estiverem conciliados, testando novamente o resultado em produção.

## Próximas etapas
1. Resolver o teste geral da página pública de pedidos na respectiva frente de programação, sem misturar esse ajuste ao XML.
2. Reconciliar alterações paralelas de Compras/XML PRs #976, #980, #982 e #983, evitando substituição de arquivo monolítico por versões antigas.
3. Revisar a ficha de produto do XML, aplicar somente campos aprovados, sem herdar NCM ou movimentar estoque.
