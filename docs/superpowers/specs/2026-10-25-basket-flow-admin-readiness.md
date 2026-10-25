# Prontidão do Vitrine Admin para o Flow de cestas

**Data:** 25/10/2026
**Escopo:** revisar e preparar o Vitrine Admin e o Flow de cestas para atender por tamanho, tipo de produto, opções de marca e cotação atual, mantendo o Flow publicado inalterado.

## Diagnóstico inicial (antes da implementação)

- O Admin salva metadados flow_v1 de tamanhos e tipos de produto.
- O runtime whatsapp-1018-basket-flow-v1/engine.mjs ainda não consulta esses metadados.
- A prévia administrativa escolhe a composição com menor preço disponível, mas omitiria do painel qualquer posição sem tipo ativo mapeado, embora a soma ainda a mantivesse fixa.
- A lista de tamanhos não mostrava preço inicial; esse preço precisa vir da cotação pública de cada combinação disponível.
- O endpoint de opções deve receber a quantidade-base da posição para refletir o critério de estoque usado pelo runtime.

## Decisões de implementação

1. Consultar, em segundo plano e por tamanho, as combinações disponíveis e mostrar “A partir de” com a combinação mais barata.
2. Exibir no simulador as posições que permanecem fixas, com quantidade, preço unitário, subtotal e motivo.
3. Fazer o Admin salvar tipo, ordem, modo e limites usados também pelo runtime V2; posições sem tipo compatível continuam fixas e são explicadas na prévia.
4. Salvar rótulos alternativos de posições do molde em metadata.flow_v1, permitindo corrigir mapeamentos no Admin sem alterar os rótulos ou opções dos moldes públicos.
5. Manter o Flow V1 publicado e separar o novo motor V2. A cotação do V2 não cria pedido nem reserva estoque.

## Estado atual na PR #1410

A implementação da experiência solicitada está na branch `fix/whatsapp-flow-brand-summary-total` e na PR [#1410](https://github.com/osvaldosereia/SUCEDOAN12/pull/1410):

- O Flow V2 usa as telas `TAMANHO`, `TIPO_PRODUTO`, `OPCAO_EDIT` e `RESUMO`. A pessoa escolhe o tamanho, percorre os tipos na ordem do Admin e ajusta a quantidade de cada produto.
- As opções exibem dados atuais de catálogo e estoque, incluindo foto, nome, marca e preço unitário. A cotação é atualizada no servidor.
- A prévia do Admin consome a mesma configuração e cotação do runtime. Mostra preço inicial, posições editáveis e fixas, limites e total ao vivo.
- O Flow V2 continua em `DRAFT`; o Flow V1 publicado permanece separado. O endpoint atualmente implantado ainda não contém este runtime V2 e a migration de alinhamento ainda não consta no ledger do Supabase.
- A documentação operacional e os detalhes do contrato estão em `vitrine/admin/whatsapp-lab/meta-flow/DYNAMIC-IMPLEMENTATION.md`.

## Pendências para operação

- Integrar a PR após resolver ou classificar os checks legados que esperam a vitrine ativa, enquanto a página pública está em manutenção.
- Implantar as Edge Functions e aplicar a migration após a revisão do branch.
- Validar o JSON e as telas no Flow Builder da Meta.
- Homologar no canal interno `1018` para o destinatário interno `8360`; conferir preços e estoque em cada etapa.
- Publicar o Flow V2 somente depois dessa homologação e conferência comercial.
