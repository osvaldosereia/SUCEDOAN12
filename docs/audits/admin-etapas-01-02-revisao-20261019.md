# Vitrine Admin — revisão das Etapas 1 e 2

Data: 19/10/2026. Base inicial: branch `fix/admin-fiscal-hardening-20261018`, HEAD `50602328c6a14f325b763f04218d44b469d5d7de`, PR draft #1126.

## Resultado desta continuação

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
- Os 35 workflows do HEAD atualizado `77d7061`, incluindo o contrato corrigido de Cestas, concluíram sem falhas. A rodada anterior teve uma única falha no teste estático que ainda procurava a regra no runtime; o teste foi alinhado ao módulo extraído e passou na rodada seguinte. No head remoto atual `eef4827`, os 35 workflows também concluíram com sucesso. A extração do helper de diálogo nesta continuação adiciona uma condição nova de execução ao workflow de Marketing; a rodada da CI para esse novo commit ainda ficará pendente de publicação da branch.

## Limite estrutural remanescente

Os vinte fragmentos continuam concatenados dentro da IIFE porque fluxos operacionais ainda leem e escrevem o mesmo `state`, chamam `api`/DOM e dependem da sequência de inicialização. Nesta continuação, três modelos puros sem efeitos colaterais foram isolados e os contratos de carga foram ampliados. Uma conversão indiscriminada dos controladores restantes exigiria trocar seus contratos de estado, API, DOM e ciclo de vida; isso não foi tratado como remoção mecânica. O grafo síncrono e as dependências ainda existentes estão registrados em `admin-module-load-graph.json` quando o workflow executa.
