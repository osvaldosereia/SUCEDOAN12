# Auditoria conservadora do index

Arquivo analisado: `index-pagespeed-test.html`
Tamanho: 531658 bytes

> Este relatório lista candidatos. Nenhum item deve ser removido apenas por aparecer aqui.

## Declarações ou atribuições repetidas

- `renderCategory`: function declaration na linha 3377; function assignment na linha 5604; function assignment na linha 6205; function assignment na linha 6634. Ocorrências totais do nome: 6.
- `renderSearch`: function declaration na linha 3705; function assignment na linha 5622; function assignment na linha 6269; function assignment na linha 6664. Ocorrências totais do nome: 8.
- `renderBrand`: function declaration na linha 3403; function assignment na linha 6232; function assignment na linha 6654. Ocorrências totais do nome: 5.
- `renderSubcategory`: function declaration na linha 3393; function assignment na linha 6221; function assignment na linha 6644. Ocorrências totais do nome: 5.
- `abrirWhatsAppPedido`: function declaration na linha 5201; function assignment na linha 6706. Ocorrências totais do nome: 4.
- `applyBannersData`: function declaration na linha 1543; function assignment na linha 5495. Ocorrências totais do nome: 4.
- `renderBasketDetail`: function declaration na linha 3671; function assignment na linha 5636. Ocorrências totais do nome: 4.
- `renderHome`: function assignment na linha 6148; function assignment na linha 6610. Ocorrências totais do nome: 8.
- `renderOffers`: function declaration na linha 3412; function assignment na linha 6242. Ocorrências totais do nome: 4.
- `renderProduct`: function declaration na linha 3736; function assignment na linha 6617. Ocorrências totais do nome: 4.
- `renderRoutine`: function declaration na linha 3419; function assignment na linha 6250. Ocorrências totais do nome: 5.
- `renderSiteMenuContent`: function declaration na linha 3856; function assignment na linha 6712. Ocorrências totais do nome: 7.
- `setQty`: function declaration na linha 2404; function assignment na linha 6681. Ocorrências totais do nome: 5.
- `toggleFavorite`: function declaration na linha 2026; function assignment na linha 6695. Ocorrências totais do nome: 4.

## Funções com baixa evidência de referência

- `purgeBrowserRuntimeCaches`: 1 ocorrência(s); declaração(ões) nas linhas 1236.
- `sleep`: 1 ocorrência(s); declaração(ões) nas linhas 1301.
- `startDeploymentVersionWatch`: 1 ocorrência(s); declaração(ões) nas linhas 1284.

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
