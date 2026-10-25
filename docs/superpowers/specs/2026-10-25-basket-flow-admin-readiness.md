# Prontidão do Vitrine Admin para o Flow de cestas

**Data:** 25/10/2026  
**Escopo:** melhorar a configuração administrativa e tornar a prévia fiel às limitações atuais do runtime, sem alterar o Flow publicado.

## Estado encontrado

- O Admin salva metadados flow_v1 de tamanhos e tipos de produto.
- O runtime whatsapp-1018-basket-flow-v1/engine.mjs ainda não consulta esses metadados.
- A prévia administrativa escolhe a composição com menor preço disponível, mas omitiria do painel qualquer posição sem tipo ativo mapeado, embora a soma ainda a mantivesse fixa.
- A lista de tamanhos não mostrava preço inicial; esse preço precisa vir da cotação pública de cada combinação disponível.
- O endpoint de opções deve receber a quantidade-base da posição para refletir o critério de estoque usado pelo runtime.

## Decisões

1. Consultar, em segundo plano e por tamanho, as combinações disponíveis e mostrar “A partir de” com a combinação mais barata.
2. Exibir no simulador as posições que permanecem fixas, com quantidade, preço unitário, subtotal e motivo.
3. Explicar no Admin que as configurações de tipo/ordem/modo ainda não controlam o runtime Meta; registrar que a cotação atual aceita um SKU por posição.
4. Não alterar o endpoint Meta, o Flow publicado, o banco, os pedidos ou o estoque nesta etapa.

## Fora do escopo

A implementação do atendimento solicitado (uma etapa por tipo, múltiplas marcas na mesma posição, fotos e cotação final por seleção) exige mudar o contrato do Flow e a cotação no servidor. Não será apresentado como pronto apenas por mudar a prévia do Admin.
