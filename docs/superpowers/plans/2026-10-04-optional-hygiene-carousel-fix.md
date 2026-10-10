# Ajuste de lotes de cestas — higiene opcional e quantidade no card

1. Tornar o vínculo de Limpeza/Higiene opcional por lote de alimentos.
2. Carregar lotes de higiene para qualquer lote de alimentos, sem obrigar seleção.
3. Fazer vitrine/checkout inferirem presença de higiene pelo `linked_hygiene_lot_id` do lote de alimentos.
4. Reverter a normalização acidental que marcou a Econômica Bonini como obrigatoriamente com higiene.
5. Manter validação de que um lote de higiene escolhido esteja pronto/disponível.
6. Corrigir o layout do carrossel para manter quantidade e estoque dentro do card.
7. Validar com testes de regressão e produção sem criar pedidos reais.
