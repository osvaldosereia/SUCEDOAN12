# Loja Integrada Basket Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar dentro da Loja Integrada um montador para cinco modelos de cesta que preserve um único ajuste oculto fixo por cesta, use produtos reais e finalize no carrinho e checkout nativos.

**Architecture:** A página do montador será conteúdo nativo da Loja Integrada com JavaScript e CSS pequenos e limitados à página. O browser manterá apenas a seleção de componentes e exibirá o total comercial calculado sem revelar o valor do ajuste; produtos, SKUs e disponibilidade virão de fontes verificadas. Antes de construir ou instalar qualquer fluxo de preço, será provado que o carrinho nativo cobra o mesmo total e preserva as linhas/SKUs individuais.

**Tech Stack:** Loja Integrada Crescimento (página de conteúdo, CSS/JavaScript personalizado e carrinho nativo), integração oficial Bling–Loja Integrada, dados já existentes do projeto Supabase ssbesxgaijknwsjbsbcz somente se necessários para a composição/total server-side, JavaScript sem dependências externas e Node.js node:test.

**Spec:** docs/superpowers/specs/2026-10-23-loja-integrada-basket-builder-design.md

## Global Constraints

- Usar exatamente um ajuste oculto fixo por cesta; campos condicionais existentes ficam fora do cálculo.
- No modelo inicial, o total comercial é a soma da composição padrão mais esse único ajuste; trocas/quantidades usam a diferença dos produtos e extras usam o preço vigente.
- Não expor ao comprador preço unitário, subtotal de componentes ou o valor separado do ajuste; não embutir o valor do ajuste em JavaScript público.
- Usar apenas produtos reais com SKU e estoque sincronizados pelo Bling; não reutilizar o código do montador antigo nem importar catálogo antes de confirmar identidade/canal.
- Acrescentar os componentes individualmente ao carrinho nativo, com checkout nativo; preservar Pagamento na Entrega.
- Manter a loja nova em manutenção e a página do montador inativa durante configuração/testes; não alterar a loja antiga, domínio ou DNS.
- Não criar checkout, pedidos, emissão fiscal, estoque sincronizado paralelo, banco paralelo ou extensão paga.
- Não enviar pedido, executar pagamento ou emitir NF-e de teste; não alterar nem reutilizar os trechos de código existentes da loja.

## Review Focus

1. **Canal Bling incorreto ou catálogo legado:** o teste operacional deve confirmar a conta, canal de destino e um SKU real antes de qualquer importação.
2. **Ajuste oculto ausente ou duplicado:** o teste de cotação deve demonstrar que somente um ajuste fixo é aplicado, inclusive se campos condicionais existirem nos dados.
3. **Produto substituto sem estoque ou SKU divergente:** teste de troca deve impedir indisponibilidade e manter o SKU do produto escolhido no carrinho.
4. **Carrinho recalcula preço/estoque:** teste com SKU real deve comparar total do montador e do carrinho; qualquer divergência bloqueia a instalação do fluxo de preço.
5. **Clique repetido ou falha parcial ao adicionar várias linhas:** teste deve impedir duplicação e informar claramente se alguma linha não chegou ao carrinho.

---

### Task 1: Confirmar canal e catálogo real do Bling

**Files:** Nenhum; inspeção operacional no painel Bling e Loja Integrada.

**Interfaces:**
- Consumes: sessão autenticada do painel Loja Integrada já confirmado como Super Cestas Dona Antônia.
- Produces: identidade confirmada da conta/canal Bling, mapeamento do canal para a loja correta e pelo menos um produto real com SKU, preço, estoque e categoria reconciliados.

- [ ] **Step 1: Verificar a identidade da empresa e do canal no Bling**
  
  Confirmar na interface autenticada que a conta selecionada é a operação Super Cestas Dona Antônia e que o canal ativo aponta para a loja provisória correta. Se for necessária autenticação, usar somente o fluxo seguro do navegador; não pedir nem registrar credenciais no chat.

- [ ] **Step 2: Conferir um SKU real de ponta a ponta**
  
  Selecionar um produto real com estoque disponível no Bling. Conferir SKU, nome, marca, preço, quantidade em estoque e categoria; comparar com a configuração do canal e as categorias já existentes na Loja Integrada. Não usar os 178 itens da consulta anterior como prova de identidade.

- [ ] **Step 3: Importar apenas o SKU confirmado, se ainda não estiver na Loja Integrada**
  
  Usar a integração oficial Bling–Loja Integrada, com a loja ainda em manutenção. Não criar preço, estoque, SKU ou produto fictício. Se o canal/catálogo não puder ser confirmado, parar sem importar.

- [ ] **Step 4: Verificar o resultado da sincronização**
  
  Confirmar no painel da Loja Integrada que o item aparece uma única vez e que SKU, preço e disponibilidade correspondem ao Bling. Registrar a evidência sem exportar segredos.

**Verification:** conta e canal identificados nominalmente; um SKU real reconciliado nos dois painéis; nenhuma importação em lote.

---

### Task 2: Provar o preço no carrinho nativo antes do desenvolvimento

**Files:** Nenhum código. Teste controlado na página temporária da loja em manutenção.

**Interfaces:**
- Consumes: o produto real reconciliado da Task 1 e a composição/ajuste fixo de um modelo existente.
- Produces: decisão técnica documentada: o carrinho cobra o total comercial exato com uma única linha de ajuste oculto lógico e mantém cada componente/SKU como linha identificável, ou o trabalho de preço/carrinho é bloqueado.

- [ ] **Step 1: Selecionar um modelo e sua composição verificada**
  
  Usar um único modelo e produtos reais; confirmar pelo mecanismo interno de dados qual é o ajuste fixo aplicável. Não retornar nem registrar seu valor em código público.

- [ ] **Step 2: Executar somente o fluxo nativo de adição ao carrinho**
  
  Com uma seleção controlada, conferir as linhas, SKUs, quantidades, estoque e total no carrinho. Não enviar pedido nem iniciar pagamento.

- [ ] **Step 3: Comparar os totais**
  
  Comparar o total comercial esperado (itens escolhidos + exatamente um ajuste fixo) com o total exibido pelo carrinho e a etapa de checkout antes de qualquer submissão.

- [ ] **Step 4: Aplicar o gate**
  
  Se o carrinho não puder cobrar o total exato sem alterar preços reais de catálogo, expor uma linha de ajuste, usar preço fictício, criar checkout externo ou depender de API não documentada, interromper aqui e relatar a limitação. Não construir uma cotação que difira do valor cobrado.

**Verification:** total do carrinho e total comercial iguais; produtos/SKUs individuais preservados; checkout acessível sem criar pedido ou pagamento. Se qualquer verificação falhar, nenhuma instalação de preço/carrinho prossegue.

---

### Task 3: Implementar o núcleo novo do montador (somente após aprovação do gate da Task 2)

**Files:**
- Create: integrations/loja-integrada/basket-builder-core.mjs
- Create: integrations/loja-integrada/basket-builder.css
- Test: tests/loja-integrada-basket-builder.test.mjs

**Interfaces:**
- Consumes: contrato de produtos, disponibilidade e cotação já confirmado nas Tasks 1–2.
- Produces:
  - createBasketState(modelId, composition, products) → estado normalizado da cesta.
  - applyBasketAction(state, action, availability) → novo estado ou erro de validação.
  - renderBasketSummary(state, productLabels, quote) → HTML seguro dos itens selecionados, sem preço individual ou ajuste separado.

- [ ] **Step 1: Escrever testes de comportamento que falham**
  
  Em tests/loja-integrada-basket-builder.test.mjs, criar testes Node nativos para: seleção dos cinco modelos; troca apenas por alternativa aprovada; incremento/decremento e limite de estoque; inclusão/remoção de extra; total com uma única cotação do servidor; campos condicionais ignorados; ausência de preço individual/valor do ajuste no HTML; falha fechada para dados de estoque/preço incompletos.

- [ ] **Step 2: Executar os testes para confirmar falha**
  
  Run: node --test tests/loja-integrada-basket-builder.test.mjs  
  Expected: FAIL por ausência dos exports do núcleo.

- [ ] **Step 3: Implementar o núcleo mínimo**
  
  Implementar as três funções exportadas em integrations/loja-integrada/basket-builder-core.mjs. Manter o valor do ajuste fora do estado de browser; não interpretar campos condicionais. Usar escape de HTML para nomes/marcas e quantidades inteiras não negativas, limitadas ao estoque confirmado.

- [ ] **Step 4: Implementar apenas o CSS local da página**
  
  Criar integrations/loja-integrada/basket-builder.css com escopo sob #li-basket-builder, estilos responsivos para seleção, composição, controles de quantidade, extras, total e mensagens de erro. Não carregar fontes, bibliotecas ou imagens externas.

- [ ] **Step 5: Executar novamente os testes**
  
  Run: node --test tests/loja-integrada-basket-builder.test.mjs  
  Expected: PASS; incluir casos de falha operacional listados em Review Focus 2–3.

- [ ] **Step 6: Commit**
  
      git add integrations/loja-integrada/basket-builder-core.mjs integrations/loja-integrada/basket-builder.css tests/loja-integrada-basket-builder.test.mjs
      git commit -m "feat: add Loja Integrada basket builder core"

---

### Task 4: Integrar cotação e adição de componentes ao carrinho nativo

**Files:**
- Create: integrations/loja-integrada/basket-builder.js
- Create only if the verified contract requires server-side price calculation: supabase/functions/basket-builder-quote-v1/index.ts
- Test: tests/loja-integrada-basket-builder.test.mjs

**Interfaces:**
- Consumes: exports do núcleo da Task 3 e mecanismos nativos/documentados comprovados na Task 2.
- Produces:
  - mountBasketBuilder(root, adapters) → controlador com destroy().
  - adapters.getModels(), adapters.getProducts(modelId), adapters.getQuote(selection), adapters.addItem(productId, quantity) — cada adapter implementado apenas contra fonte/fluxo verificado.
  - Cotação pública contém somente totalCents e disponibilidade necessária; nunca o valor separado do ajuste fixo.

- [ ] **Step 1: Escrever testes de integração com adapters falsos**
  
  Cobrir carregamento de modelos e composição, atualização de total após troca/quantidade/extra, rejeição de estoque desatualizado, clique repetido e falha parcial ao adicionar componentes. Confirmar que cada produto é adicionado como sua própria linha nativa com o identificador/SKU correspondente.

- [ ] **Step 2: Executar testes para confirmar falha**
  
  Run: node --test tests/loja-integrada-basket-builder.test.mjs  
  Expected: FAIL até a montagem e adapters existirem.

- [ ] **Step 3: Implementar controller e adapters**
  
  Inicializar apenas quando o elemento #li-basket-builder existir na página e destruir/listeners ao sair da página. Atualizar o total usando a cotação confirmada. Adicionar itens individualmente pelo formulário/link oficial do carrinho. Se necessário, a Edge Function consulta somente os dados existentes necessários e mantém o ajuste server-side; ela não cria tabelas nem expõe o ajuste separado. Não ler nem reutilizar o código do montador antigo.

- [ ] **Step 4: Executar a suíte**
  
  Run: node --test tests/loja-integrada-basket-builder.test.mjs  
  Expected: PASS, inclusive nos cenários de estoque e adição parcial.

- [ ] **Step 5: Commit**
  
      git add integrations/loja-integrada/basket-builder.js tests/loja-integrada-basket-builder.test.mjs supabase/functions/basket-builder-quote-v1/index.ts
      git commit -m "feat: connect basket builder to native cart"

---

### Task 5: Instalar como página nativa inativa e validar na loja em manutenção

**Files:**
- Modify only after code review: custom HTML/CSS/JS manager on the Loja Integrada and one new inactive content page.
- Source of truth: files from integrations/loja-integrada/ in this branch.

**Interfaces:**
- Consumes: branch-tested code and verified product/price/cart adapters from Tasks 1–4.
- Produces: página do montador criada e inativa; scripts limitados ao caminho do montador; fluxo nativo validado sem pedido ou pagamento.

- [ ] **Step 1: Criar página de conteúdo em rascunho/inativa**
  
  Adicionar o container #li-basket-builder e título descritivo. Não publicar a página, não alterar a página inicial, tema, snippets existentes ou estado de manutenção.

- [ ] **Step 2: Instalar o código novo com guarda de rota**
  
  Adicionar o CSS/JavaScript nos campos de personalização da Loja Integrada com uma condição explícita para a rota da página do montador. Conferir que nenhum dos 13 trechos existentes foi editado.

- [ ] **Step 3: Validar os cinco modelos na prévia**
  
  Testar seleção, composição, alternativas de marca, quantidades, extras, recálculo instantâneo e limite de estoque usando os dados reais verificados. Confirmar que preço unitário e o ajuste separado não aparecem.

- [ ] **Step 4: Validar carrinho e checkout sem enviar pedido**
  
  Adicionar os componentes ao carrinho, confirmar linhas/SKUs/total e abrir o checkout para verificar comportamento nativo e Pagamento na Entrega. Não confirmar compra, pagamento ou emissão fiscal.

- [ ] **Step 5: Reverter o carrinho de teste e preservar manutenção**
  
  Remover as linhas de teste do carrinho, manter a página inativa e a loja em manutenção. Confirmar que o domínio e DNS permanecem inalterados.

- [ ] **Step 6: Registrar a evidência final**
  
  Anotar o que funcionou, o que ficou pendente e limitações reais; não declarar pronta para produção enquanto a página permanecer inativa e a loja em manutenção.
