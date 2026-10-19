# Organização do Admin

`index.html` carrega os providers clássicos sincronamente antes de `admin-runtime.js`. Os controladores extraídos publicam factories congeladas; a carga desses arquivos não consulta APIs nem monta telas. O runtime compõe os controladores e inicia a navegação somente depois de inicializar os providers. A ordem real é verificada por `scripts/audit-admin-module-load-graph.mjs` e o bootstrap completo por `scripts/test-admin-runtime-bootstrap.mjs`.

## Fronteiras extraídas

| Unidade | Estado próprio | Acesso compartilhado explícito |
|---|---|---|
| `delivery/controller.js` | Busca e seleção de expedição, obsolescência da lista, rascunho de pagamento, rotas, catálogo, atribuição e filtro de veículo | Portas `orders` (lista/cache fiscal/leitura fiscal), `detail` (pedido aberto), `navigation`, `ui`, `formatters` e `orderView` |
| `delivery/model.js` | Nenhum | Argumentos: gate fiscal, pagamentos e destinos/links de rota |
| `closure/controller.js` | Pedidos do fechamento e geração de renderização | Portas `orders`, `navigation`, `ui`, `formatters`, `orderView` e abertura de pedido |
| `customers/controller.js` | Perfil, paginação e geração de busca/histórico | Cache `customers.get/set`, `customerApi`, `navigation`, `ui`, formatadores e abertura de pedido |
| `orders/session.js` | Snapshot do pedido, fiscal e geração da sessão; revisão de consultas | `isOpen`; tokens invalidam respostas após outro pedido assumir o editor |
| `orders/list-controller.js` | Filtros, fila manual, serialização de RPCs e gerações de carga/poll | `orders.get/set/loadFiscal`, `queueRequest`, navegação, UI e pintura |
| `orders/list-view.js` | Abas, contagens, busca, ordenação e vínculo dos botões da lista | Pedidos, estado dos filtros, modelo de card e callbacks explícitos de ação |
| `orders/detail-controller.js` | Escritas em andamento por pedido e ciclo de abertura/salvamento/cancelamento/reabertura | Sessão, API, cache de clientes, leitura dos campos e callbacks de pintura/recarga |
| `orders/detail-view.js` | Nenhum | Snapshot da sessão, modelos de leitura, renderização fiscal e ações; não consulta APIs |
| `orders/fiscal-controller.js` | Operações ocupadas e mensagens por pedido, revisão das consultas fiscais | Sessão, cache fiscal, API, confirmação e callbacks do detalhe/lista/DANFE |
| `orders/documents.js` | Nenhum | API de PDF oficial, pop-up, formatadores, modelo de separação e `openPrint` |
| `orders/fiscal-loader.js` | Fila, limite global de três chamadas e promessas em andamento por pedido/cache | `api` autenticada e `getCache`; descarta jobs ainda não iniciados de cache aposentado e não substitui respostas atualizadas pelo detalhe do pedido |
| `orders/manual-sale.js` | Rascunho de criação manual, buscas de cliente/item, configuração de cesta e envio do pedido | Portas `sale`, APIs, `orders`, UI e formatadores; respostas antigas de busca não substituem a consulta mais nova e envios concorrentes do mesmo rascunho são bloqueados |
| `orders/card-model.js` | Marcos do ciclo de vida, prontidão da separação, etiquetas fiscais/operacionais, busca e lista imutável de separadores | Funções de normalização/escape, prontidão cadastral e leituras fiscais por pedido/cache/sessão; lista injetada no fragmento operacional de separação |
| `orders/card-view.js` | HTML dos cards de pedido, progresso e controles visíveis | Modelo do card, prontidão cadastral, estado da fila manual, formatadores e classe de status |
| `orders/separation-view.js` | Estrutura do bottom sheet de separação e delegação dos cliques nos itens | `document`, escape de HTML e callbacks de fechamento/marcação; gravação, atribuição e conclusão permanecem no fragmento 16 |
| `products/mobile-quick-save.js` | Rascunhos, debounce e serialização do autosave rápido mobile de preço, custo, gôndola, validade e estoque | Lista de produtos, API, operador, status visível e fila oficial de estoque/Bling |
| `products/list-view.js` | Linhas desktop, cards mobile e links de cestas/kits dos produtos | Escape de HTML, formatação de quantidade e rótulo de categoria |

As factories não recebem o objeto `state` inteiro. Seus adaptadores estão nos fragmentos `00`, `02`, `04`, `14`, `16` e `19`. O cache de clientes permanece compartilhado por uma porta porque o editor de Pedidos usa as mesmas opções cadastrais. O cache fiscal também é compartilhado: trocar sua referência invalida escritas de leituras antigas.

As telas descartam respostas quando uma nova carga ou outra tela/modal já assumiu o destino. As operações mutáveis mantêm seus endpoints e payloads canônicos. A UI de rotas distingue falha de consulta de ausência de rotas; despacho comum continua sob os gates fiscais existentes.

## Runtime restante

Os 17 arquivos de `runtime-parts/` são fragmentos ordenados da IIFE, não scripts independentes. A lista de origem está em `scripts/build-admin-runtime.mjs`; edite o fragmento e regenere com:

```sh
node scripts/build-admin-runtime.mjs --write
node scripts/build-admin-runtime.mjs --check
```

Os controladores restantes de produtos/cestas, balanço e compras/XML ainda compartilham estado, API e DOM. Em Produtos, cards mobile/desktop e autosave rápido já têm providers; edição completa, ativação, lotes e filas de estoque continuam no runtime. Em Pedidos, o chat e o controlador/renderer dos itens do bottom sheet de separação ainda ficam na IIFE; a estrutura inicial e a delegação de eventos do sheet já têm provider próprio. Modelo e HTML dos cards de pedidos, filtros, apresentação/abas da lista, sessão, criação manual, editor, fiscal, detalhe e documentos já têm fronteiras explícitas. As demais extrações e a revisão integral continuam pendentes; estas separações não equivalem à conclusão integral das Etapas 1 e 2.

## Contratos de Pedidos

A sessão é criada no bootstrap. Os callbacks de lista, detalhe, fiscal e impressão são funções de ligação; suas factories só são executadas antes de `start()`, depois dos providers. Nenhuma função recebe o estado geral do aplicativo.

Salvar, cancelar e reabrir capturam o pedido e a geração do editor antes do POST. A lista pode ser atualizada após a gravação, mas a conclusão só reabre/repinta a mesma sessão. Operações fiscais usam bloqueio por pedido; a atualização posterior sempre consulta o ID de origem. Revisões de leitura impedem que uma resposta anterior substitua uma consulta ou mutação mais recente. O cache fiscal compartilhado também recebe resultados de pedidos que já não estão abertos.

A fila manual serializa consultas e alterações pelo contrato `manual_pick_queue_action_v1`; cliques repetidos no mesmo pedido durante uma alteração são descartados. O polling não substitui uma carga completa iniciada depois dele.

O editor privado anterior não tinha ligação com eventos, navegação ou `DonaAntoniaAdminBridge`. Seus handlers e auxiliares foram removidos, assim como a prévia compartilhada e o gerador de botões legado. Não foram removidos endpoints de backend, migrations históricas ou os fluxos canônicos de separação, atendimento e pagamento.
