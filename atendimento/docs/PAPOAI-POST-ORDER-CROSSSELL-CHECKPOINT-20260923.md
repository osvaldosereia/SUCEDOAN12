# CHECKPOINT — PapoAI + Pós-cesta — 2026-09-23

## Estado

Backend do Pós-cesta concluído e mantido em **SHADOW**.

Configuração ativa:
- enabled: true
- mode: shadow
- expiry_offer_count: 5
- regular_count: 5
- total_limit: 10
- response_window_seconds: 180
- delivery_contract_ready: false

Nenhuma oferta pós-cesta é enviada enquanto `delivery_contract_ready=false`.

## Fluxo pronto

1. Vitrine grava o pedido.
2. Shadow classifica cesta normal / quase normal / modificada.
3. Grupo A seleciona 5 produtos com validade mais próxima.
4. Grupo B seleciona 5 produtos normais com diversidade determinística.
5. A mensagem de pedido enviada pelo cliente ao WhatsApp contém `PEDIDO DONA ANTONIA` + `NUMERO:`.
6. `papo-external-agent-v1` identifica esse pedido.
7. O storefront localiza a sessão exata e monta a mensagem comercial determinística.
8. Quando o gate de entrega for liberado, essa mensagem será sincronizada para o PapoAI.
9. Cliente pode responder `2`, `2 e 7`, `quero 3`, `não`, `pode fechar`.
10. Backend resolve os números pela sessão; a IA não escolhe produto nem preço.
11. Ao aceitar, os produtos entram no mesmo pedido, o estoque é reservado e o total é recalculado.
12. Ao iniciar separação, qualquer sessão aberta é cancelada antes da mutação de estoque/Bling.

## Regra de validade

A oferta pública da Vitrine continua controlada individualmente por `auto_expiry_offer_enabled`.

O Pós-cesta NÃO exige ativação pública em massa.

Para o Grupo A:
- <30 dias: 40%
- 30–59 dias: 20%
- 60–90 dias: 10%

Funções canônicas:
- `expiry_discount_percent_v1`
- `expiry_offer_price_cents_v1`

Se houver uma oferta vigente mais barata, prevalece o menor preço.
Caso contrário, o Pós-cesta usa um quote privado, sem publicar a oferta no catálogo.

## Guardas implementadas

- sem estoque: não selecionar / não aceitar;
- produto inativo: não selecionar / não aceitar;
- vencido: não selecionar / não aceitar;
- item já no pedido/cesta: não selecionar;
- sessão vencida: não aceitar;
- resposta ambígua: não interpretar;
- separação iniciada: não aceitar;
- uma sessão por pedido/modo;
- alteração real somente após sessão marcada como enviada;
- modo test/canary/live exigido para escrita real;
- test mode possui allowlist deployment-only;
- delivery_contract_ready obrigatório para envio;
- resposta repetida não duplica item;
- PapoAI nunca calcula preço nem total.

## Testes executados

### Shadow
Após recálculo dos Shadows atuais:
- 8 pedidos elegíveis;
- 80 itens selecionados;
- 40 itens de validade;
- 40 itens normais;
- 0 item sem estoque/inativo;
- 0 item vencido;
- 0 item já presente no pedido.

### Parser
Validados:
- `2` -> seleção
- `2 e 7` -> seleção múltipla
- `quero 3` -> seleção
- `coloca o 3` -> seleção
- `adiciona 1, 4 e 8` -> seleção
- `não` -> recusa
- `pode fechar` -> recusa
- `quero o 10` -> seleção
- `quero 2 kg de arroz` -> desconhecido
- `me manda 2 pacotes` -> desconhecido

### Transação com rollback
Teste real em subtransação:
- 2 itens foram acrescentados;
- total foi recalculado;
- reserva de estoque foi atualizada;
- sessão passou para accepted;
- rollback restaurou pedido, total e sessão;
- 0 item real de cross-sell ficou gravado.

### Separação com rollback
- sessão aberta simulada;
- início da separação cancelou a sessão;
- rollback restaurou o estado original.

## Funções principais

Storefront:
- `prepare_post_order_cross_sell_shadow_v1`
- `post_order_cross_sell_context`
- `post_order_cross_sell_reply`
- `post_order_cross_sell_mark_sent`

Banco:
- `parse_post_order_cross_sell_reply_v1`
- `mark_post_order_cross_sell_sent_v1`
- `decline_post_order_cross_sell_v1`
- `accept_post_order_cross_sell_v1`
- `cancel_post_order_cross_sell_for_separation_v1`
- `expire_post_order_cross_sell_sessions_v1`

PapoAI bridge:
- detecta pedido por `PEDIDO DONA ANTONIA` + `NUMERO:`;
- captura contexto;
- código de entrega operacional está dormente enquanto gate=false;
- código de resposta numérica está dormente até existir sessão efetivamente enviada.

## Admin

### Pós-cesta
- Shadow de pedidos;
- classificação;
- 10 sugestões;
- origem Validade / Normal;
- preview da mensagem.

### Atendimento IA
Controles reais:
- Vitrine contextual ON/OFF;
- Pós-cesta ON/OFF;
- quantidade validade;
- quantidade normal;
- saúde da ponte PapoAI.

Somente leitura:
- transferência;
- follow-up;
- modelo/raciocínio/prompt-base.

Indicador:
- Entrega PapoAI: PENDENTE / PRONTA.

## Único gate externo restante

Criar/configurar no PapoAI um campo de texto operacional, por exemplo:

**Mensagem Operacional**

No webhook de entrada já usado para a Vitrine:
- mapear payload `system_message` -> campo `Mensagem Operacional`.

No prompt do agente, adicionar regra restrita:
- quando a mensagem atual for um `PEDIDO DONA ANTONIA` e houver Mensagem Operacional atualizada para aquela interação, responder exatamente com esse conteúdo;
- quando o cliente estiver respondendo por número/recusa a uma oferta pós-cesta e houver Mensagem Operacional atualizada para aquela interação, responder exatamente com esse conteúdo;
- fora desses contextos, ignorar o campo;
- nunca reutilizar conteúdo antigo.

Após configurar:
1. testar somente número de homologação;
2. confirmar mensagem 5+5;
3. responder `2 e 7`;
4. conferir mesmo pedido, estoque e novo total;
5. somente então mudar gate para pronto e modo test/canary/live conforme homologação.

## Não usar

- Make;
- Meta diretamente;
- envio arbitrário pela ação “Enviar mensagem” do webhook (ela exige template nesse ambiente);
- ativação pública em massa das ofertas de validade;
- live antes do gate de homologação.
