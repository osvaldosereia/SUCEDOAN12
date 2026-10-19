# Organização do Admin

`index.html` carrega os providers clássicos sincronamente antes de `admin-runtime.js`. Os controladores extraídos publicam factories congeladas; a carga desses arquivos não consulta APIs nem monta telas. O runtime compõe os controladores e inicia a navegação somente depois de inicializar os providers. A ordem real é verificada por `scripts/audit-admin-module-load-graph.mjs` e o bootstrap completo por `scripts/test-admin-runtime-bootstrap.mjs`.

## Fronteiras extraídas

| Unidade | Estado próprio | Acesso compartilhado explícito |
|---|---|---|
| `delivery/controller.js` | Busca e seleção de expedição, obsolescência da lista, rascunho de pagamento, rotas, catálogo, atribuição e filtro de veículo | Portas `orders` (lista/cache fiscal/leitura fiscal), `detail` (pedido aberto), `navigation`, `ui`, `formatters` e `orderView` |
| `delivery/model.js` | Nenhum | Argumentos: gate fiscal, pagamentos e destinos/links de rota |
| `closure/controller.js` | Pedidos do fechamento e geração de renderização | Portas `orders`, `navigation`, `ui`, `formatters`, `orderView` e abertura de pedido |
| `customers/controller.js` | Perfil, paginação e geração de busca/histórico | Cache `customers.get/set`, `customerApi`, `navigation`, `ui`, formatadores e abertura de pedido |
| `orders/fiscal-loader.js` | Fila, limite global de três chamadas e promessas em andamento por pedido/cache | `api` autenticada e `getCache`; descarta jobs ainda não iniciados de cache aposentado e não substitui respostas atualizadas pelo detalhe do pedido |

As factories não recebem o objeto `state` inteiro. Seus adaptadores estão nos fragmentos `00`, `02`, `04` e `14`. O cache de clientes permanece compartilhado por uma porta porque o editor de Pedidos usa as mesmas opções cadastrais. O cache fiscal também é compartilhado: trocar sua referência invalida escritas de leituras antigas.

As telas descartam respostas quando uma nova carga ou outra tela/modal já assumiu o destino. As operações mutáveis mantêm seus endpoints e payloads canônicos. A UI de rotas distingue falha de consulta de ausência de rotas; despacho comum continua sob os gates fiscais existentes.

## Runtime restante

Os 19 arquivos de `runtime-parts/` são fragmentos ordenados da IIFE, não scripts independentes. A lista de origem está em `scripts/build-admin-runtime.mjs`; edite o fragmento e regenere com:

```sh
node scripts/build-admin-runtime.mjs --write
node scripts/build-admin-runtime.mjs --check
```

Os controladores restantes de produtos/cestas, balanço, compras/XML, fiscal e edição de pedidos ainda compartilham estado, API e DOM. A extração dessas fronteiras continua pendente; a separação já feita não equivale à conclusão integral das Etapas 1 e 2.
