# Cestas: lotes montados, impressão e modelos editáveis

## Objetivo

Deixar a seção **Cestas** do Vitrine/Admin rápida e operacionalmente clara, permitindo administrar modelos e lotes sem perder o histórico nem alterar pedidos passados.

## Requisitos funcionais

1. Um lote salvo como rascunho deve aparecer como **Em edição**, sem ser confundido com ausência de lote.
2. Todo lote em edição deve oferecer a ação explícita **Marcar como montado**. A montagem reserva estoque, mas não ativa o lote no site.
3. Um lote montado e ainda não utilizado em pedido deve poder voltar para edição completa (nome, valor, quantidade, composição, tipo, vínculo e observação). Durante a edição, ele deixa de reservar estoque até ser marcado como montado novamente.
4. Lotes com histórico de pedido, lote parcialmente consumido/desmontado, lote ativo no site ou lote usado por outro lote não podem voltar para edição destrutiva; a UI deve explicar o motivo.
5. Todo lote montado deve oferecer **Imprimir lote** em A4 retrato, com cabeçalho contendo nome, código, valor e quantidade do lote e produtos em cards verticais de 4 colunas, cada card com foto, nome e quantidade por kit.
6. A lista de lotes montados deve exibir de forma visível o **nome** e o **valor** de cada lote.
7. O modelo de kit deve ser editável e salvável: nome, prefixo e composição (produto + quantidade). Deve ser possível adicionar, trocar/remover produtos e salvar a composição.
8. O modelo de kit deve poder ser excluído de forma segura (arquivamento lógico) somente quando não houver lote em edição/montado dependente dele.
9. O modelo de cesta já possui edição de metadados e itens; acrescentar exclusão segura (arquivamento lógico) quando não houver modelos de kit/lotes ativos dependentes.
10. A tela deve continuar preservando lotes históricos; exclusão de modelo nunca apaga histórico de lotes/pedidos.
11. A abertura da seção Cestas deve remover o N+1 atual de cálculo de próximo código por modelo e reutilizar os lotes já carregados.
12. A Econômica Bonini/EB1 deve continuar como rascunho existente até ação humana. O sistema não deve montá-lo automaticamente.

## Regras de segurança operacional

- Marcar como montado e ativar no site são ações diferentes.
- Reabrir lote montado para edição exige: `status=ready`, `sale_enabled=false`, `quantity_available=quantity_built`, nenhum registro em `basket_stock_allocations` e nenhum lote pronto dependente do lote por vínculo.
- Excluir modelo significa `is_active=false`; registros históricos permanecem.
- Alteração do modelo não modifica lotes já montados.

## UX

- Estados principais: **Em edição**, **Montado**, **Esgotado**, **Cancelado**.
- Na visão do kit, mostrar indicadores separados para **Montados** e **Em edição**.
- A impressão deve funcionar sem criar arquivo persistente nem alterar dados.
- Ações destrutivas devem exigir confirmação humana e explicar bloqueios de histórico/estoque.
