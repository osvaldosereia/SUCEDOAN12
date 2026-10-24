# Vitrine Admin — runtime organizado em fontes ordenadas

O arquivo servido pelo navegador continua sendo `/vitrine/admin/admin-runtime.js`.
O código-fonte foi separado em nove fragmentos ordenados dentro de `runtime-src/`.

**Importante:** cada `*.part.js.txt` é um fragmento textual, não um módulo JavaScript independente. Os nomes indicam aproximadamente a região do código, não isolamento de domínio. As fronteiras atuais foram alinhadas a declarações de funções de nível superior; nenhuma função foi cortada entre dois fragmentos. Esta primeira divisão é **estrutural e conservadora**: o build recompõe byte a byte o mesmo runtime e mantém uma única IIFE, com o mesmo escopo, hoisting, dependências e ordem de execução. Não carregar os fragmentos diretamente no HTML.

## Comandos

```sh
python3 scripts/build-vitrine-admin-runtime.py --check
python3 scripts/build-vitrine-admin-runtime.py
```

A primeira opção verifica se o runtime distribuído está idêntico à concatenação dos fragmentos; a segunda regenera o runtime distribuído. O HTML permanece apontando para o mesmo arquivo `admin-runtime.js`.

## Manutenção

1. Edite os fragmentos em ordem, mantendo as fronteiras em declarações de funções completas.
2. Regenere `admin-runtime.js` e inclua o arquivo gerado no mesmo commit.
3. Use `--check` para detectar divergências.
4. Uma futura modularização semântica por domínio exigirá extrair funções completas e injetar explicitamente dependências compartilhadas; **não** mover declarações de uma IIFE para scripts globais, pois isso pode alterar o funcionamento.

Esta rodada deliberadamente não altera APIs, autenticação, impressão, fiscal, estoque, atendimento, Bling ou montagem de pedidos.

## Rodada de alinhamento de fronteiras

Os nove fragmentos foram redistribuídos sem modificar nenhum caractere do runtime recomposto. Os oito cortes ocorrem imediatamente antes das funções: `confirmDeliveryFromExpedition`, `openFinanceEditor`, `openProductEditor`, `processInventorySheetEntries`, `loadPurchases`, `xmlCatalogDetailRefresh`, `openManualBasketConfig` e `fiscalBlockReasonLabel`. A concatenação foi comparada diretamente ao arquivo `admin-runtime.js` e resultou idêntica.

Os nomes dos fragmentos continuam indicativos, não representam ainda módulos independentes nem isolamento perfeito por domínio.
