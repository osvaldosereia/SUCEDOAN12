# Vitrine Admin — revisão das Etapas 1 e 2

## Continuação — núcleo de Pedidos, 19/10

Base desta continuação: `693f61fd9050cbdc6ead6817e32b0757764db51a`, no PR #1126 em draft. Nenhum merge, deploy, escrita remota ou migration aplicada.

### Código efetivamente reorganizado

Foram extraídos `orders/session.js`, `list-controller.js`, `detail-controller.js`, `detail-view.js`, `fiscal-controller.js` e `documents.js`. Lista/fila, sessão do editor, gravações, apresentação, fiscal e impressão têm dependências explícitas. A leitura do endereço é única para salvar e cancelar. O estado geral perdeu o pedido atual, fiscal do editor, prévia antiga, filtros/fila da lista e estado do editor legado.

Os fragmentos passaram de 19 para 17; `17-fiscal-danfe` e `18-order-editing` foram eliminados depois de mover as responsabilidades ativas. São 33 scripts síncronos, 28 dependências diretas resolvidas, 5.576 linhas e 449.465 caracteres no runtime (antes: 6.365 linhas e 507.152 caracteres). Os callbacks preservam a inicialização antes de `start()`.

### Correções confirmadas

- Salvar, cancelar, reabrir, consultar, recuperar e emitir fiscal não substituem o pedido/modal que assumiu o editor enquanto a operação estava pendente.
- A atualização após emissão ou recuperação consulta o ID original, inclusive depois de abrir outro pedido.
- Emissão, recuperação, reconsulta e despacho do detalhe têm bloqueio por pedido contra execução concorrente no mesmo controlador; gravações do editor e alterações da fila também descartam repetição em andamento.
- Consultas fiscais fora de ordem e a leitura pós-emissão respeitam a revisão mais recente e o cache compartilhado.
- Consulta e mutação da fila manual são serializadas, impedindo que um snapshot anterior desfaça visualmente uma inclusão/retirada já concluída. A resposta atualiza dados sem pintar outra aba.
- Falha no despacho preserva os campos ainda não salvos do formulário.
- Testes do render fiscal real detectaram e permitiram corrigir duas colisões de nomes introduzidas na extração (`busy` e `feedback`), antes de publicar.

### Remoções com evidência de alcance

A revisão partiu dos bindings reais de `paintOrderDetail`, lista, navegação, bootstrap e da única interface pública da IIFE (`DonaAntoniaAdminBridge`). As funções abaixo eram privadas e não tinham chamador nesses caminhos. Referências como `$('#retryHistorySync')` eram seletores dentro do próprio handler, sem criação de botão nem binding. Os helpers internos só eram alcançáveis a partir dessas mesmas entradas mortas; não foi usado o contador heurístico como prova isolada.

Removidas 28 declarações antigas: `advanceCurrentOrder`, `applySelectedCustomerToDelivery`, `blingOrderBlockerLabel`, `blingOrderJobErrorLabel`, `blingPreflightOperationalBlockers`, `canonicalOrderPayment`, `completeCurrentOrderCustomerDocument`, `confirmCurrentOrderPayment`, `createCurrentOrderCustomerInBling`, `createCurrentOrderProductsInBling`, `customerOptions`, `customerSummary`, `focusOrderCustomerForBling`, `loadCurrentOrderBlingPreview`, `mergeOrderCustomerResults`, `openComponentReplacement`, `paymentOptions`, `persistCurrentOrder`, `previewCurrentOrderBling`, `replaceComponentWithProduct`, `resolveCurrentOrderBlingDependencies`, `retryHistorySync`, `saveOrder`, `scheduleOrderCustomerSearch`, `searchComponentReplacement`, `searchOrderCustomers`, `setOrderDeliveryField` e `startSeparationFlow`. Esta última ainda referenciava `validateBlingBeforeSeparation`, inexistente. Também saiu o provider legado `orders/action-buttons.js`, sem consumidor operacional.

O teste de botões agora executa os providers reais de sessão, apresentação e fiscal. Os testes de corrida antigos que recortavam handlers removidos foram substituídos pelas factories ativas. Os contratos de backend, payloads, autorização fiscal, opções de pagamento, histórico e totais continuam verificados nas fontes atuais.

### Cobertura por seção nesta continuação

| Área | Resultado efetivo |
|---|---|
| Pedidos | Refatoração de lista/fila, sessão, detalhe, edição, cancelamento, reabertura, fiscal e documentos; correções acima e testes comportamentais. Criação manual, cards/chat e separação continuam pendentes de extração. |
| Expedição, Entregador e Fechamento | Adaptadores do pedido aberto atualizados para a sessão; contratos e testes locais continuam na suíte. Não houve operação real. |
| Clientes | Cache passa explicitamente ao editor; contratos de histórico conservam o endpoint de repetição no backend. O handler privado antigo sem botão foi removido. |
| Central, Atendimento, ANA, Produtos, Cestas, Validades, Orçamentos, Marketing, Compras/XML, Balanço, Gôndolas, Financeiro e Bling técnico | Cobertura de regressão da suíte existente; a auditoria manual desta continuação concentrou-se em Pedidos. Não se declara nova revisão integral dessas áreas. |

### Verificação e pendências

Verificação local: 128 scripts `test-admin-*.mjs`, 5 `test-admin-*.py` e 5 `test-smart-delivery-*.mjs` passaram (138 ao todo), além de Cestas/lotes, gates e feedback da separação, estoque Bling, paridade, bootstrap, grafo e 10 pares de espelhos Edge. Foi corrigido um contrato anterior que ainda lia apenas o HTML inline. Revisão independente e CI do head publicado serão registradas ao final. As Etapas 1 e 2 continuam abertas. Além dos trechos restantes de Pedidos, persistem as fronteiras de Produtos/Cestas, Balanço e Compras/XML, a revisão manual integral das declarações e homologação externa de Edge/Bling/SEFAZ/impressão. A tabela histórica abaixo preserva as revisões anteriores; testes contratuais não equivalem a homologação operacional.

---


Data: 19/10/2026. Base inicial: branch `fix/admin-fiscal-hardening-20261018`, HEAD `50602328c6a14f325b763f04218d44b469d5d7de`, PR draft #1126.

## Rodada ampla — base `119f413`

Nesta rodada foram feitas alterações de código em quatro áreas operacionais e no serviço fiscal compartilhado, sem escrita remota, deploy, merge ou alteração de regras comerciais.

- **Inicialização:** o bootstrap executado em VM reproduziu `ReferenceError: Cannot access 'orderDisplayCode' before initialization` no head da branch. Identificadores e catálogo de erros agora são inicializados antes dos consumidores. O novo teste carrega a sequência real de providers e executa a IIFE sem chamadas externas.
- **Expedição/Entregador:** cerca de 640 linhas saíram da IIFE para `delivery/controller.js`, com busca, seleção, rascunho de pagamento, rotas, catálogo, atribuição, veículo e obsolescência privados. O controlador recebe portas de pedidos, detalhe, navegação, UI e formatação; não recebe o `state` inteiro. Regras puras de fiscal, valores e destinos estão em `delivery/model.js`.
- **Fechamento:** lista e ciclo de renderização privados em `closure/controller.js`; removida a cópia de `closureOrders` que a Central mantinha sem outra leitura. Helpers financeiros e de diagnóstico Bling foram movidos para os fragmentos de seus domínios, sem antecipar efeitos de inicialização.
- **Clientes:** listagem, perfil, histórico e formulário saíram do fragmento de Bling e do perfil para `customers/controller.js`. Perfil/paginação são privados; o cache de clientes continua compartilhado por `get/set` porque Pedidos usa os mesmos cadastros.
- **Leitura fiscal:** `orders/fiscal-loader.js` impõe limite global de três consultas, compartilha promessas da mesma consulta, descarta trabalhos ainda não iniciados de um cache aposentado e impede que respostas antigas sobrescrevam um status atualizado pelo detalhe do pedido ou escrevam num cache já substituído.
- **Carga e contratos:** 19 fragmentos restantes, 28 scripts clássicos e 23 dependências diretas do runtime verificadas. O runtime passou de 7.353 para 6.365 linhas (591.597 para 507.152 caracteres). As interfaces e os estados pertencentes a cada módulo estão em `vitrine/admin/README.md`.

### Defeitos reproduzidos e corrigidos

1. TDZ de identificador no bootstrap da branch.
2. Cargas antigas de Expedição/Entregador substituindo dados mais recentes ou escrevendo em uma tela já removida.
3. Falha de atualização do Entregador sem tratamento pelo botão de refresh; agora há retorno de erro e os controles antigos da rota são removidos.
4. Falha na consulta de rotas apresentada como lista vazia; agora a falha é informada e preparar uma rota exige uma recarga válida. O despacho comum mantém os gates fiscais atuais.
5. Latitude/longitude nulas ou vazias convertidas em `0,0`; o destino agora recorre ao endereço. Coordenadas zero reais continuam válidas.
6. Resposta fiscal atrasada sobrescrevendo atualização mais recente do pedido; consulta concorrente duplicada do mesmo pedido.
7. Card do Entregador permanecendo na fila depois da confirmação da entrega porque apenas a Expedição era repintada.
8. Histórico/detalhe de compra atrasados substituindo o formulário novo de edição do cliente; a resposta agora exige que o mesmo conteúdo de modal ainda esteja ativo.
9. Confirmação de recebimento no Fechamento substituindo outra tela aberta enquanto o POST estava pendente. O cache recebe o resultado, mas a pintura exige a mesma view.
10. Gravação/exclusão de cliente pendente fechando outro modal ou substituindo outra página ao concluir. A conclusão agora respeita a propriedade do formulário e a aba atual.

Os endpoints e payloads canônicos de saída, entrega, pagamento simples/dividido, retorno, revisão e cliente foram preservados. Os testes estáticos foram alinhados às fontes extraídas; testes novos exercitam as factories e seus eventos sem dados reais.

### Verificação e retomada

A rodada local cobre 123 scripts `test-admin-*.mjs`, 5 scripts `test-admin-*.py` e 5 scripts `test-smart-delivery-*.mjs`, além dos contratos de Cestas, paridade do runtime, carregamento e espelhos Edge. Os 133 scripts passaram, assim como Cestas, paridade, bootstrap completo, grafo, módulos e os 10 pares espelhados Edge. A revisão independente confirmou o defeito de conclusão de recebimento (preexistente) e uma espera desnecessária por jobs fiscais já invalidados (introduzida no novo scheduler); ambos foram corrigidos com regressões RED→GREEN. A revisão não identificou regressão Critical/Important introduzida. A CI é consultada após publicar o novo head. Pagamento dividido com falha parcial e integrações externas ainda não receberam homologação ponta a ponta.

A Etapa 1 ainda não está integralmente concluída: Pedidos/fiscal/edição, produtos/cestas, balanço e compras/XML ainda têm controladores dentro da IIFE. A Etapa 2 também continua aberta: a revisão manual de todas as declarações e a homologação ponta a ponta de integrações externas não foram concluídas. Retomar pelas fronteiras de estado desses controladores; não repetir as extrações acima nem tratar cobertura contratual como auditoria manual integral.

## Resultado da continuação anterior

- O runtime continua sendo montado de 20 fragmentos na ordem atual. Foram extraídos para módulos puros os modelos de composição para impressão de separação, completude cadastral do cliente e conciliação/renderização das formas de pagamento. Os três são carregados antes do runtime, publicados por interfaces congeladas e testados sem DOM ou chamadas remotas.
- A extração reduziu o escopo lexical compartilhado em sete funções e consolidou o gerador duplicado de `<option>`. Quatro módulos de Marketing agora compartilham o helper defensivo para fechar `<dialog>`, em vez de manter quatro implementações idênticas. A sequência clássica passou a 23 scripts e 19 dependências de runtime verificadas.
- Corrigida a ordenação de itens sem gôndola na lista de separação. `Number(null)` era `0`, apesar do sentinela `999999` usado para itens sem posição; agora esses itens ficam ao final.
- Atualizados contratos que ainda descreviam o runtime inline, o Atendimento embutido, a fila v3 ou a API de atendimento antiga. Os testes agora verificam os arquivos e rotas usados pela branch.
- Corrigida uma falha silenciosa pós-expedição: se o despacho era concluído mas a recarga falhava, a lista antiga podia continuar habilitada. A tela agora marca os dados como obsoletos, bloqueia ações até a recarga e informa o operador.
- Nenhuma regra comercial, endpoint de produção, dado, migration aplicada ou fluxo externo foi alterado.

## Revisão por seção

| Seção | Código e contratos revisados | Resultado nesta branch |
|---|---|---|
| Central | Navegação, bootstrap, carregamento síncrono, resumo do dia | Contratos de controlador, carregamento e inicialização passaram. A ordem dos scripts é verificada no grafo. |
| Atendimento | Página standalone, API autenticada, fila v4, etiquetas, mídia, envio e atualização | Contratos locais passaram após alinhar testes à implementação atual. Envio continua desabilitado na interface; respostas rápidas são de leitura; localização recebida usa fallback sem mapa. Não implementei esses comportamentos nesta tarefa. |
| ANA | Módulo carregado sob demanda, autenticação e contratos de operações | Suíte `test-admin-ana-section-v1.mjs` e testes de Edge/integração passaram. Sem mudança de fluxo. |
| Pedidos | Criação, cliente, transições, impressão, fiscal, edição, pagamento e leitura pública | Contratos de pedido, fiscal, cliente e impressão passaram. Regras puras de completude cadastral, itens de separação e formas de pagamento foram extraídas e testadas isoladamente; a renderização duplicada das opções de pagamento foi centralizada. |
| Expedição | Conferência, fila, autorização fiscal, despacho e atualização após despacho | Contratos de confirmação/separação e gates operacionais passaram. Falha de recarga após despacho agora bloqueia a lista obsoleta; coberta por teste de regressão. Não foi feita homologação externa. |
| Entregador | Rotas, atribuição, conclusão, falha e retorno | Contratos de entrega, cancelamento, sincronização e ordem operacional passaram. Nenhum dado real foi alterado. |
| Fechamento | Resumo e encerramento operacional | Revisado junto dos controladores de pedidos e finanças; contratos gerais do controlador passaram. Não foi detectada duplicação removível com segurança. |
| Produtos | Busca, estoque, disponibilidade, ajuste e integração Bling | Contratos de produtos, estoque físico, ajuste e sincronização passaram. As ações de estoque permanecem sob os gates atuais. |
| Cestas | Catálogo, composição, lotes, alternativas e valor oculto | Contratos de disponibilidade pública, composição e lotes passaram. O contrato estático da regra de lote agora lê o modelo de separação extraído. Os valores ocultos e o modelo atual foram preservados. |
| Validades | Lotes, FEFO, vencidos e alertas | Contratos de FEFO e ciclo de vida passaram. Nenhuma regra de desconto ou descarte foi alterada. |
| Orçamentos | Cotação, conversão e criação manual | Contratos de orçamento e criação de pedido passaram; a ligação atual pelo Atendimento standalone também foi verificada. |
| Clientes | Endereço, pagamento, busca e histórico | Contratos de dados cadastrais e rastreabilidade do histórico passaram; as proteções existentes contra respostas assíncronas tardias foram mantidas. |
| Marketing | Segmentação, campanhas, agendamento, visualizações e diálogos | Suítes de campanhas, helpers e corridas de atualização passaram. Quatro cópias idênticas do fechamento de diálogos foram substituídas por `marketing/dialog.js`, com teste para fechamento normal e `close()` lançando. O workflow de helpers agora cobre mudanças nesses módulos. Não houve alteração de consentimento ou disparos. |
| Compras/XML | Importação, catálogo, recebimento e fiscal | Contratos de recebimento, identidade fiscal e paridade dos espelhos Edge passaram. Não foram criadas nem aplicadas migrations. |
| Balanço | Folha, leitura, aplicação, concorrência e gravações | Contratos de balanço e leitura passaram. Escritas reais ou testes em banco não foram executados nesta continuação. |
| Gôndolas | Cadastro, associação e leitura de código | Contratos operacionais e de inventário passaram. Nenhum cadastro foi alterado. |
| Financeiro | Leitura financeira e integrações fiscais/Bl​​ing | Contratos de integração e fiscal passaram. Não houve escrita no Bling nem emissão de documento. |
| Bling técnico | OAuth, fila, reconciliação, pedidos e documentos | Contratos de integração, recuperação fiscal, idempotência e DANFE passaram. O DANFE exige autorização; a migração atômica de status/estoque já está no branch e foi homologada em staging conforme `admin-round-01-implementation-status-20261018.md`. |

## Inventário, duplicações e erros

O inventário estático cobre frontend, Edge Functions e SQL e deve ser lido como índice para revisão, não como prova de defeito ou código morto. As declarações com uma única referência foram pesquisadas antes de qualquer remoção; nenhuma foi confirmada como código morto nesta continuação.

Os grupos de arquivos byte a byte idênticos são mantidos pelos contratos de espelhamento de Edge Functions (helpers compartilhados espelhados e endpoint/XML incorporado). `test-admin-edge-mirror-parity.mjs` confirma os pares. As redefinições `CREATE OR REPLACE FUNCTION` representam o histórico versionado de migrations; não são duplicações removíveis. Nomes repetidos como `isCurrent` e `open` pertencem a closures diferentes.

As capturas vazias também são sinais heurísticos. Há casos de parse opcional de JSON, limpeza de UI, fechamento de janela e reconciliação best-effort. Não removi catches em massa: operações externas e de estoque precisam preservar os estados de erro, repetição ou reconciliação já cobertos pelos contratos.

## Limites verificados sem escrita

O projeto Supabase consultado foi `ssbesxgaijknwsjbsbcz` (ativo). A listagem contém 138 Edge Functions ativas; sete funções centrais do Vitrine/Admin consultadas estão ativas. O repositório contém 42 diretórios de função e também abriga mais de um produto, portanto a diferença de inventário não é evidência suficiente para remoção nem publicação.

Os advisors de produção retornaram avisos que exigem decisão de segurança fora desta alteração de branch: 3 funções com `search_path` mutável, 36 funções `SECURITY DEFINER` executáveis por `authenticated` e proteção de senha vazada desativada. Também há avisos INFO de 217 tabelas com RLS sem policy e 74 FKs sem índice cobridor. Esses achados foram apenas lidos; permissões, migrations, configuração Auth e dados de produção não foram modificados.

Na continuação de 19/10, os advisors foram consultados também no staging `trglbjtbkdkyqocufusw` (DONA-ANTONIA-2-STAGING), sem escrita: 22 tabelas com RLS sem policy (INFO), proteção de senha vazada desabilitada (WARN), 18 FKs sem índice cobridor, um índice reportado como não usado e estratégia fixa de conexões do Auth (INFO). São avisos do ambiente de staging, distintos dos achados previamente registrados para produção; nenhum schema, policy, índice ou configuração foi alterado.

Não houve homologação ponta a ponta das Edge Functions modificadas, do Bling, WhatsApp/Meta, SEFAZ, impressão física ou leitura/escrita em pedidos reais. A validação existente de SQL atômico em staging continua separada dessas integrações.

## Verificações executadas

- `node scripts/build-admin-runtime.mjs --check`
- `node scripts/audit-admin-module-load-graph.mjs`
- `node scripts/test-admin-module-load-contract.mjs`
- `node scripts/test-admin-separation-model.mjs`
- `node scripts/test-admin-customer-readiness-model.mjs`
- `node scripts/test-admin-order-payment-method-model.mjs`
- `node scripts/test-admin-marketing-dialog-helper.mjs`
- `node scripts/test-admin-expedition-stale-refresh.mjs`
- Inventário integral de funções e contratos de seção.
- 116 scripts `test-admin-*.mjs` e 5 scripts `test-admin-*.py`, sem falhas após atualizar contratos defasados e cobrir a falha de recarga da Expedição.
- Os 35 workflows do HEAD atualizado `77d7061`, incluindo o contrato corrigido de Cestas, concluíram sem falhas. A rodada anterior teve uma única falha no teste estático que ainda procurava a regra no runtime; o teste foi alinhado ao módulo extraído e passou na rodada seguinte. No head remoto `7b2da71`, os 38 workflows concluíram com sucesso, incluindo o workflow de Marketing atualizado; não houve falhas.

## Limite estrutural remanescente

Após a rodada ampla, os 19 fragmentos restantes continuam concatenados dentro da IIFE; os controladores ainda não extraídos leem e escrevem o mesmo `state`, chamam `api`/DOM e dependem da sequência de inicialização. Nesta continuação, três modelos puros sem efeitos colaterais foram isolados e os contratos de carga foram ampliados. Uma conversão indiscriminada dos controladores restantes exigiria trocar seus contratos de estado, API, DOM e ciclo de vida; isso não foi tratado como remoção mecânica. O grafo síncrono e as dependências ainda existentes estão registrados em `admin-module-load-graph.json` quando o workflow executa.
