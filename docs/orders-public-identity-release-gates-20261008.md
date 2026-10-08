# Pedidos: gates para identidade pública de quatro dígitos

## Não publicar antes de validar

1. Alocar o código uma única vez por pedido, na criação, e persistir independentemente da atualização do snapshot público.
2. Proteger a imutabilidade no banco; updates do snapshot não podem trocar o código.
3. Preservar os códigos históricos AA000 sem renumeração ou backfill destrutivo.
4. Usar sequência 1000–9999, NO CYCLE; ao esgotar, retornar erro operacional explícito sem reaproveitar códigos.
5. Conferir o mesmo código visível no Admin, separação, comprovante, WhatsApp, entrega e documento fiscal, mantendo IDs técnicos internos quando exigidos pelo Bling.
6. Verificar se qualquer default ou função de snapshot consome sequência em operações de refresh; não aplicar migração que gere número em cada refresh.
7. Executar regressão do checkout, separação, mobile e fiscal antes de integrar à main.
8. Verificar a navegação mobile e as ações NÃO ENTREGUE e indicadores de separação.
9. Conferir checks do PR e reconciliar com a main atual antes de qualquer merge.
10. Validar um pedido controlado após implantação e então confirmar imutabilidade até a entrega.

## Bloqueios

Em caso de recusa de escrita, registrar mensagem exata, arquivo e operação. Não contornar recusas de segurança. Manter a produção intacta até cumprir todos os gates.
