# Auditoria conservadora do index

Arquivo analisado: `index-pagespeed-test.html`
Tamanho: 533285 bytes

> Este relatório lista candidatos. Nenhum item deve ser removido apenas por aparecer aqui.

## Declarações ou atribuições repetidas

- `renderCategory`: function declaration na linha 3381; function assignment na linha 5612; function assignment na linha 6204; function assignment na linha 6633. Ocorrências totais do nome: 6.
- `renderSearch`: function declaration na linha 3709; function assignment na linha 5630; function assignment na linha 6268; function assignment na linha 6663. Ocorrências totais do nome: 8.
- `renderBrand`: function declaration na linha 3407; function assignment na linha 6231; function assignment na linha 6653. Ocorrências totais do nome: 5.
- `renderSubcategory`: function declaration na linha 3397; function assignment na linha 6220; function assignment na linha 6643. Ocorrências totais do nome: 5.
- `abrirWhatsAppPedido`: function declaration na linha 5205; function assignment na linha 6705. Ocorrências totais do nome: 4.
- `applyBannersData`: function declaration na linha 1547; function assignment na linha 5503. Ocorrências totais do nome: 4.
- `renderBasketDetail`: function declaration na linha 3675; function assignment na linha 5644. Ocorrências totais do nome: 4.
- `renderHome`: function assignment na linha 6148; function assignment na linha 6609. Ocorrências totais do nome: 8.
- `renderOffers`: function declaration na linha 3416; function assignment na linha 6241. Ocorrências totais do nome: 4.
- `renderProduct`: function declaration na linha 3740; function assignment na linha 6616. Ocorrências totais do nome: 4.
- `renderRoutine`: function declaration na linha 3423; function assignment na linha 6249. Ocorrências totais do nome: 5.
- `renderSiteMenuContent`: function declaration na linha 3860; function assignment na linha 6711. Ocorrências totais do nome: 7.
- `setQty`: function declaration na linha 2408; function assignment na linha 6680. Ocorrências totais do nome: 5.
- `toggleFavorite`: function declaration na linha 2030; function assignment na linha 6694. Ocorrências totais do nome: 4.

## Funções com baixa evidência de referência

- `daHomeCareProducts`: 1 ocorrência(s); declaração(ões) nas linhas 6040.
- `daHomeStandardShelfHtml`: 1 ocorrência(s); declaração(ões) nas linhas 5704.
- `daHomeTreatProducts`: 1 ocorrência(s); declaração(ões) nas linhas 6056.
- `daHomeUsefulProducts`: 1 ocorrência(s); declaração(ões) nas linhas 6051.
- `purgeBrowserRuntimeCaches`: 1 ocorrência(s); declaração(ões) nas linhas 1240.
- `sleep`: 1 ocorrência(s); declaração(ões) nas linhas 1305.
- `startDeploymentVersionWatch`: 1 ocorrência(s); declaração(ões) nas linhas 1288.

## Marcadores críticos

- `purgeBrowserRuntimeCaches`: 1 ocorrência(s).
- `startDeploymentVersionWatch`: 1 ocorrência(s).
- `ensureLatestDeployment`: 2 ocorrência(s).
- `applyBannersData`: 4 ocorrência(s).
- `renderHome`: 8 ocorrência(s).
- `handleRoute`: 10 ocorrência(s).
- `bindEvents`: 2 ocorrência(s).

## Protocolo obrigatório antes de remover

1. Confirmar que o nome não é chamado por HTML inline, atributos `on*`, timers, eventos ou `window`.
2. Confirmar que não é uma implementação-base posteriormente envolvida por wrapper.
3. Confirmar que uma redefinição posterior substitui integralmente a anterior em todas as rotas.
4. Testar home, busca, categoria, produto, carrinho, checkout, banners, kits, cestas e WhatsApp.
5. Remover em pequenos grupos e comparar comportamento e métricas antes/depois.
