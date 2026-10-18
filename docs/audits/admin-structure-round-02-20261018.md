# Dona Antônia — Rodada 02/20: inventário estrutural do Vitrine Admin

Data: 2026-10-18. Referência: `refactor/admin-print-queue-panel-20261018` (PR #1121).
Escopo: análise estática, sem alteração das regras de negócio, Supabase ou produção.

## Inventário quantitativo (arquivos consultados diretamente na branch)

| Arquivo | Linhas | Bytes aproximados | Responsabilidade |
| --- | ---: | ---: | --- |
| `vitrine/admin/index.html` | 8.935 | 748.553 | HTML/CSS, estado, UI, orquestração, acesso a APIs e fluxos operacionais |
| `vitrine/admin/core/formatters.js` | 13 | 956 | Formatação de valores e normalização |
| `vitrine/admin/core/identifiers.js` | 19 | 1.015 | Código público do pedido, telefone, CPF |
| `vitrine/admin/core/errors.js` | 11 | 7.116 | Mapeamento de erros de API e fiscais |
| `vitrine/admin/components/printing.js` | 17 | 2.485 | Abertura de janela de impressão |
| `vitrine/admin/marketing/helpers.js` | 12 | 1.670 | Segmentação e slug de campanhas |
| `vitrine/admin/orders/sorting.js` | 11 | 351 | Ordenação operacional |
| `vitrine/admin/orders/read-model.js` | 84 | 4.084 | Problemas, prioridade, filtros e próximas ações |
| `vitrine/admin/components/today-cards.js` | 40 | 1.970 | Indicadores do dia |
| `vitrine/admin/orders/time.js` | 26 | 1.118 | Datas de Cuiabá e idade de pedidos |
| `vitrine/admin/orders/search.js` | 19 | 740 | Busca de pedidos |
| `vitrine/admin/orders/whatsapp-links.js` | 14 | 551 | Links de contato |
| `vitrine/admin/orders/contact-actions.js` | 56 | 3.190 | Solicitações de dados e links de endereço |
| `vitrine/admin/components/expiry-alert.js` | 21 | 1.123 | Alertas de validade |
| `vitrine/admin/components/ops-attention.js` | 22 | 1.932 | Painel de atenção operacional |
| `vitrine/admin/components/print-queue-panel.js` | 29 | 1.899 | Fila de impressão |
| `vitrine/admin/basket-lot-image.js` | 113 | 11.024 | Imagens e lotes de cestas |
| `vitrine/admin/basket-guided-builder.js` | 201 | 45.897 | Construtor guiado de cestas |
| `vitrine/admin/basket-admin-section.js` | 112 | 9.115 | Navegação e carregamento da seção de cestas |

O HTML principal declara **487 funções nomeadas** segundo contagem textual de `function nome(...)`, e contém **18 referências a scripts externos** e 22 tags `script` (incluindo scripts inline). A contagem de funções é estática, não uma análise de AST, e pode incluir funções em blocos embutidos. Os grupos abaixo se sobrepõem, portanto **não devem ser somados**.

- Funções com nomes relacionados a pedidos, entrega, impressão, pagamento ou fiscal: **168**.
- Funções com nomes relacionados a estoque, produto, lote, validade ou inventário: **144**.
- Funções com nomes relacionados a Bling, finanças, compra ou XML: **128**.
- Funções com nomes relacionados a cliente, contato, WhatsApp ou histórico: **35**.

## Carregamento e dependências

Os scripts externos são carregados pelo HTML nesta ordem:
1. `core/formatters.js`
2. `core/identifiers.js`
3. `core/errors.js`
4. `components/printing.js`
5. `marketing/helpers.js`
6. `orders/sorting.js`
7. `orders/read-model.js`
8. `components/today-cards.js`
9. `orders/time.js`
10. `orders/search.js`
11. `orders/whatsapp-links.js`
12. `orders/contact-actions.js`
13. `components/expiry-alert.js`
14. `components/ops-attention.js`
15. `components/print-queue-panel.js`
16. `basket-lot-image.js`
17. `basket-guided-builder.js`
18. `basket-admin-section.js`

Os módulos extraídos publicam interfaces em `window.DonaAntoniaAdmin*`, consumidas pelo script principal; alguns usam fábricas com dependências injetadas (`state`, `esc`, `normalize`, funções de API). **Risco de acoplamento:** ordem de carregamento e disponibilidade de globais. A ausência de bundler não é, por si só, defeito.

O `index.html` mantém um objeto `state` amplo e mutável, incluindo pedidos, produtos, cestas, entregas, estoque, Bling, finanças, compras, clientes e impressão. A função `api` concentra requisições ao serviço Admin e tratamento de HTTP 401. Há clientes de API adicionais para imagens, clientes, vitrine e finanças. **Não consolidar esses clientes sem conferir autenticação, headers, retentativas e contratos específicos.**

## Pontos de atenção por risco

| Prioridade técnica | Evidência | Próxima verificação |
| --- | --- | --- |
| Alta | `index.html` de 8.935 linhas e 487 funções nomeadas | Mapear referências e efeitos colaterais antes de novas extrações (rodadas 03–04) |
| Alta | Estado global mutável e acesso à API dentro de controladores de interface | Isolar apenas rotinas puras, preservando eventos e ciclo de vida (rodadas 03–04) |
| Alta | Pedidos, estoque e fiscal coexistem no controlador monolítico | Não alterar transições, reservas, emissão ou idempotência fora das rodadas 05–18 |
| Média | `core/errors.js` concentra grande mapa de códigos numa linha extensa | Formatar e documentar sem alterar chaves/mensagens (rodada 03) |
| Média | `marketing/helpers.js` e alguns módulos têm expressões densas | Melhorar legibilidade sem modificar classificação comercial (rodada 03) |
| Média | Construtor de cestas tem ~46 KB e possui seu próprio estado/fluxos | Inspecionar dependências antes de mover funções (rodadas 03–04) |
| Média | Módulos `window.DonaAntoniaAdmin*` dependem de carregamento síncrono | Reforçar testes de contrato de módulos e ordem de scripts (rodada 04) |

## Possível código morto: somente candidatos, não remoções autorizadas

Uma contagem textual simples encontrou declarações com apenas uma ocorrência do nome dentro do `index.html`, por exemplo `renderOpsTimeline` (linha ~1707), `renderOps2Summary` (~1714), `returnCurrentOrderToExpedition` (~2032) e `inventorySheetImageData` (~4155). **Isso não prova que sejam funções mortas**: podem ser acessadas via atributos HTML, chamadas indiretas, strings, scripts externos ou outras referências. Antes de remover, pesquisar todo o repositório, eventos e templates, confirmar ausência de uso em tempo de execução e manter teste de regressão.

Não foi confirmada duplicação funcional removível nesta rodada. Sem análise de todas as referências, remover funções seria arriscado.

## Contratos operacionais a preservar

- Pedidos: criação, confirmação, separação, entrega, devolução, cancelamento e histórico.
- Estoque: quantidade física, reserva, baixa, lotes e validade.
- Integrações: Bling, WhatsApp/Meta, atendimento e cliente.
- Fiscal: autorização humana, idempotência, NF-e e DANFE.
- Sem implementação de login, migração de vitrine, alteração de dados em produção, merge ou deploy.

## Sequência de execução sem aumentar as 20 rodadas

- **Rodada 03:** verificar referências cruzadas dos candidatos; eliminar apenas duplicações/código morto comprovados; formatar módulos densos e preservar contratos.
- **Rodada 04:** separar responsabilidades seguras do HTML, testar carregamento, injeção de dependências e eventos.
- **Rodadas 05–08:** pedidos e seus fluxos.
- **Rodadas 09–13:** estoque, reservas, lotes, recebimento e Bling.
- **Rodadas 14–15:** WhatsApp, clientes e histórico.
- **Rodadas 16–18:** fiscal e documentos.
- **Rodadas 19–20:** consolidação e auditoria integrada.

## Limites e critérios de encerramento

Esta rodada cobre o inventário dos **18 scripts carregados pelo HTML**, o controlador principal e os pontos de acoplamento visíveis. Não constitui inventário exaustivo de todas as Edge Functions, migrations, scripts, workflows e arquivos do repositório. As chamadas de API do HTML indicam dependências externas, mas não validam seus contratos no Supabase. A classificação de código morto e duplicação é **preliminar**, não confirmação. Não foram feitas alterações funcionais nesta rodada.
