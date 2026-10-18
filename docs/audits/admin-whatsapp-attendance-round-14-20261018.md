# Rodada 14/20 — WhatsApp e atendimento

Auditoria de código versionado do envio de pedidos e webhook Meta. Não houve envio de mensagens.

## Proteções identificadas
- orderWhatsappGatewayReadiness consulta disponibilidade do gateway.
- orderWhatsappSend enfileira mensagem via ops2_enqueue_admin_order_whatsapp_v1 e consulta status após tentativas de entrega.
- dispatchOrderWhatsapp chama admin-orders-v1 em duas tentativas, com timeout.
- whatsapp-meta-webhook-v1 verifica assinatura Meta e limite de payload antes da normalização.
- Eventos não associados a contas conhecidas são ignorados; eventos repetidos são contabilizados.
- Fluxos de respostas rápidas e automação ANA tratam eventos de entrada; eco do WhatsApp Business é identificado separadamente.
- O webhook processa status de mensagens e eventos de templates.

## Riscos pendentes
1. A duplicação de chamadas ao gateway requer teste de idempotência do consumidor, não apenas da fila.
2. A função de normalização e a persistência precisam de testes funcionais de repetição e ordem de eventos.
3. O webhook pode retornar sucesso para evento de conta não resolvida, por desenho; exigir alerta operacional para volume anormal.
4. Confirmar reconciliação de mensagens pendentes e falhas de entrega.
5. Não houve validação de mensagens, números, templates ou provedores reais.

## Entrega
Teste estático scripts/test-admin-whatsapp-attendance-contract.mjs criado. Inclusão no workflow foi bloqueada pela ferramenta. Não considerar CI concluído.
