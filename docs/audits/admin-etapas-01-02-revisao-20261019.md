# Vitrine Admin — revisão das Etapas 1 e 2

## Continuação — núcleo de Pedidos, 19/10

Base desta continuação: `693f61fd9050cbdc6ead6817e32b0757764db51a`, no PR #1126 em draft. Nenhum merge, deploy, escrita remota ou migration aplicada.

### Código efetivamente reorganizado

Foram extraídos `orders/session.js`, `list-controller.js`, `detail-controller.js`, `detail-view.js`, `fiscal-controller.js`, `fiscal-loader.js`, `documents.js`, `manual-sale.js` e `card-model.js`. Lista/fila, sessão do editor, gravações, apresentação, fiscal, impressão, criação manual e leitura de marcos/etiquetas dos cards têm dependências explícitas. A leitura do endereço é única para salvar e cancelar. O estado geral perdeu o pedido atual, fiscal do editor, prévia antiga, filtros/fila da lista e estado do editor legado.

Os fragmentos passaram de 19 para 17; `17-fiscal-danfe` e `18-order-editing` foram eliminados depois de mover as responsabilidades ativas. São 35 scripts síncronos, 30 dependências diretas resolvidas, 5.407 linhas e 432.360 bytes no runtime (antes: 6.365 linhas e 507.152 bytes). Os callbacks preservam a inicialização antes de `start()`.

### Correções confirmadas

- Salvar, cancelar, reabrir, consultar, recuperar e emitir fiscal não substituem o pedido/modal que assumiu o editor enquanto a operação estava pendente.
- A atualização após emissão ou recuperação consulta o ID original, inclusive depois de abrir outro pedido.
- Emissão, recuperação, reconsulta e despacho do detalhe têm bloqueio por pedido contra execução concorrente no mesmo controlador; gravações do editor e alterações da fila também descartam repetição em andamento.
- Consultas fiscais fora de ordem e a leitura pós-emissão respeitam a revisão mais recente e o cache compartilhado.
- Consulta e mutação da fila manual são serializadas, impedindo que um snapshot anterior desfaça visualmente uma inclusão/retirada já concluída. A resposta atualiza dados sem pintar outra aba.
- Falha no despacho preserva os campos ainda não salvos do formulário.
- Testes do render fiscal real detectaram e permitiram corrigir duas colisões de nomes introduzidas na extração (`busy` e `feedback`), antes de publicar.
- A confirmação manual do pedido foi transferida para `list-controller.js`, com portas explícitas para operador e prontidão do cliente. O botão só mostra `CONFIRMADO` após resposta de sucesso; falhas restauram o rótulo anterior, e cliques concorrentes para o mesmo pedido são bloqueados. O detalhe só é reaberto depois de confirmação bem-sucedida.
- Revisão independente encontrou e corrigiu dois defeitos introduzidos nas extrações: o fluxo `?montar=1&separacao=...` usava a função privada antiga da fila (agora consulta a porta pública do controlador); e o cache fiscal não compartilhava a revisão entre leitura em lote e detalhe (agora ambos descartam respostas antigas usando a revisão por pedido). Foram acrescentadas regressões para os dois casos.
- A criação manual e suas buscas/configuração de cesta saíram do fragmento principal para `orders/manual-sale.js`, que usa portas explícitas para rascunho, API, UI e navegação. Leituras antigas de cliente, produto ou cesta não repintam a consulta mais recente, e o mesmo rascunho não pode enviar duas criações concorrentes. O payload `manual_order_create`, mínimo de R$ 75, endereço e pagamento continuam cobertos por testes.
- O modelo de ciclo de vida e etiquetas fiscais/operacionais dos pedidos saiu para `orders/card-model.js`. A regra `READY` não basta para declarar separação concluída; o estado persistido e o fallback da sessão aberta foram mantidos e passaram a ter testes diretos.
- A execução ampla dos testes encontrou um contrato que a suíte direcionada não alcançava: a tela de separação ainda consome os quatro nomes de separador no escopo do runtime. O provider agora os exporta como lista imutável e o fragmento injeta essa porta explicitamente; o seletor real e a atribuição passam nos testes.

### Remoções com evidência de alcance

A revisão partiu dos bindings reais de `paintOrderDetail`, lista, navegação, bootstrap e da única interface pública da IIFE (`DonaAntoniaAdminBridge`). As funções abaixo eram privadas e não tinham chamador nesses caminhos. Referências como `$('#retryHistorySync')` eram seletores dentro do próprio handler, sem criação de botão nem binding. Os helpers internos só eram alcançáveis a partir dessas mesmas entradas mortas; não foi usado o contador heurístico como prova isolada.

Removidas 28 declarações antigas: `advanceCurrentOrder`, `applySelectedCustomerToDelivery`, `blingOrderBlockerLabel`, `blingOrderJobErrorLabel`, `blingPreflightOperationalBlockers`, `canonicalOrderPayment`, `completeCurrentOrderCustomerDocument`, `confirmCurrentOrderPayment`, `createCurrentOrderCustomerInBling`, `createCurrentOrderProductsInBling`, `customerOptions`, `customerSummary`, `focusOrderCustomerForBling`, `loadCurrentOrderBlingPreview`, `mergeOrderCustomerResults`, `openComponentReplacement`, `paymentOptions`, `persistCurrentOrder`, `previewCurrentOrderBling`, `replaceComponentWithProduct`, `resolveCurrentOrderBlingDependencies`, `retryHistorySync`, `saveOrder`, `scheduleOrderCustomerSearch`, `searchComponentReplacement`, `searchOrderCustomers`, `setOrderDeliveryField` e `startSeparationFlow`. Esta última ainda referenciava `validateBlingBeforeSeparation`, inexistente. Também saiu o provider legado `orders/action-buttons.js`, sem consumidor operacional.

Nesta revisão foram removidos mais três helpers privados sem chamadores: `openPurchaseDocument` (a interface já usa `togglePurchaseDocument`), `purchaseFinanceLabel` (nenhum renderer ativo o usava) e `inventorySheetImageData` (a leitura local atual da folha cria seu canvas diretamente). O processamento OCR/filas A4 continua preservado e testado; só saiu a conversão de imagem órfã. Contratos de Balanço, Pedido, fila manual e separação que liam somente o HTML inline passaram a ler os providers/runtime ativos.

### Continuação — Produtos e contratos de Compras/XML, 19/10

A leitura manual do autosave rápido de Produtos confirmou uma condição de corrida: uma segunda gravação do mesmo produto podia começar enquanto a primeira aguardava a rede; a resposta anterior podia sobrescrever o objeto local durante uma edição mais recente. `flushMobileProductQuickSave` agora serializa gravações rápidas por produto, mantém o rascunho mais novo e não aplica campos de resposta que já foram editados novamente. O caminho de estoque continua na fila oficial e seu gate de confirmação do Bling foi mantido. O teste `test-admin-mobile-product-quick-save-race.mjs` reproduz a sobreposição com respostas adiadas.

Os contratos de Produtos e Compras/XML que falhavam no teste amplo ainda consultavam somente o `index.html`, embora os controladores ativos estejam nos fragmentos `06-baskets-products`, `10-purchase-finance`, `11-purchase-catalog` e `12-xml-import`. Atualizei esses verificadores para inspecionar as fontes carregadas, atualizei expectativas de paginação para a regra atual (cinco itens no desktop, seis no mobile) e alinhei um contrato à validação existente de embalagem (>1 unidade). Nenhuma regra de preço, lote, identidade fiscal ou recebimento mudou. O workflow Admin de regressão agora executa os contratos recuperados e a nova regressão de corrida.

O teste de botões agora executa os providers reais de sessão, apresentação e fiscal. Os testes de corrida antigos que recortavam handlers removidos foram substituídos pelas factories ativas. Os contratos de backend, payloads, autorização fiscal, opções de pagamento, histórico e totais continuam verificados nas fontes atuais.

### Cobertura por seção nesta continuação

| Área | Resultado efetivo |
|---|---|
| Pedidos | Refatoração de lista/fila, sessão, modelo dos cards, criação ma