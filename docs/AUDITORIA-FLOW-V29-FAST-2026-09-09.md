# Auditoria WhatsApp Flow V29 FAST — 2026-09-09

## Escopo e gates
- Candidata isolada: `flow-cestas-comercial-v5` / Meta Flow `1562977688342506`.
- V3 permanece default de produção e não deve ser substituída nesta rodada.
- Canary mantido em 1%.
- Bling order sync permanece OFF.
- Gates necessários à homologação: orchestrator, Data Exchange, send e commercial write ON.

## Diagnóstico consolidado
1. O transporte criptografado/Data Exchange responde a `ping` e os INIT anteriores chegaram ao backend sem `error_code`.
2. O backend V16 foi exercitado ponta a ponta em sessão sintética: CESTAS -> PERSONALIZAR -> MENU -> PRODUTOS -> PRODUTO -> ADD -> REVISAO.
3. Teste comercial: cesta Grande Koblenz R$ 420,00; produto avulso Amanda Biscoito Leite R$ 5,99; revisão R$ 425,99. Componentes da cesta continuam sem preço individual.
4. O principal risco visual/performance estava na hidratação de mídia do primeiro paint e das listas.
5. A V29 FAST isola otimizações por `definition_slug`, para não contaminar V3.
6. CESTAS preserva o campo `image` esperado pelo schema publicado, usando placeholder mínimo no primeiro paint.
7. Listas de produtos preservam o contrato `start.image` do NavigationList, com orçamento de payload e concorrência reduzida.
8. Foto maior é carregada apenas na tela de detalhe do produto.

## Fluxo funcional auditado
- INIT / CESTAS: 9 cestas, escolha direta.
- PERSONALIZAR: composição e quantidades da cesta; preço comercial próprio da cesta.
- MENU: navegação para categorias/busca/revisão.
- BUSCA: termo do cliente processado no backend.
- PRODUTOS: até 20 produtos por página; preço do produto avulso; abrir detalhe por toque.
- PRODUTO: imagem, descrição, quantidade 1..min(6, estoque), adicionar.
- Retorno à lista/menu e paginação: ações validadas no backend.
- REVISAO: resumo e total comercial correto.
- Cliente existente/novo e finalização permanecem sob os gates comerciais; Bling não é acionado nesta homologação.

## Teste proprietário
- Número autorizado: +556598150975.
- Sessão limpa final: `e25b13d9-7d35-4aaf-9583-c919bff01feb`.
- Job: `6cf7fbda-e8cd-4e05-b008-36facb4e75c9`.
- Meta aceitou o envio com HTTP 200 e retornou `wamid`.
- O aparelho ficou sem bateria antes da validação visual; não interpretar ausência de INIT dessa sessão como falha.

## Critério para encerrar homologação
1. Abrir o último botão no aparelho do proprietário.
2. Confirmar CESTAS sem spinner prolongado/erro.
3. Escolher cesta e alterar ao menos uma quantidade.
4. Abrir categoria, produto e detalhe; adicionar produto.
5. Conferir revisão/total.
6. Somente após sucesso visual considerar promoção da candidata. Não promover automaticamente.
