# Checkout WhatsApp — estado PapoAI

Data: 2026-10-01
Branch de integração: `feat/checkout-whatsapp-confirmation-sync`

## Estado confirmado no painel

Os dois templates utilitários estão aprovados/ativos.

| Canal | Nome real salvo pelo PapoAI | Categoria | Estado |
|---|---|---|---|
| 0975 | `pedidorecebidosite0975` | Utilidade | Aprovado/Ativo |
| 1018 | `pedidorecebidosite1018` | Utilidade | Aprovado/Ativo |

Observações:

- o PapoAI removeu os sublinhados dos nomes sugeridos originalmente;
- nenhum template de marketing/recompra foi usado;
- nenhum envio real foi realizado durante a configuração.

## Webhooks

Os dois webhooks estão integralmente configurados e permanecem em **Teste**.

### 0975

Ações salvas e conferidas após reabrir:

1. `Buscar ou criar um contato`
   - telefone ← `phone_e164`
2. `Enviar mensagem`
   - canal fixo = 0975
   - template = `pedidorecebidosite0975`
   - `Var_1` ← `order_number`
   - `Var_2` ← `total_formatted`
   - `Var_3` ← `delivery_label`
   - `Var_4` ← `payment_label`

Amostra fictícia de mapeamento capturada: `TESTE-MAPEAMENTO-0975`.
Painel observado: **1 recebimento / 0 processamentos**.

### 1018

Ações salvas e conferidas após reabrir:

1. `Buscar ou criar um contato`
   - telefone ← `phone_e164`
2. `Enviar mensagem`
   - canal fixo = 1018
   - template = `pedidorecebidosite1018`
   - `Var_1` ← `order_number`
   - `Var_2` ← `total_formatted`
   - `Var_3` ← `delivery_label`
   - `Var_4` ← `payment_label`

Amostra fictícia de mapeamento capturada: `TESTE-MAPEAMENTO-1018`.
Painel observado: **1 recebimento / 0 processamentos**.

## Contrato esperado do backend

O gateway server-side enviará:

- `event = order_received`
- `source = dona_antonia_supabase`
- `event_id`
- `order_id`
- `phone_e164`
- `order_number`
- `purchased_at`
- `channel_origin`
- `delivery_mode = utility_template`
- `total_formatted`
- `delivery_label`
- `payment_label`

Não usar `message_text` nem rota `session_text`.

## Regra de canal

- pedido roteado ao 0975 → webhook/template 0975;
- pedido roteado ao 1018 → webhook/template 1018;
- não enviar um mesmo pedido pelos dois canais.

## Segurança da ativação

Os webhooks continuam em **Teste**. Enquanto estiverem nesse estado, uma requisição pode aparecer como recebida sem ser processada. Por isso o backend produtivo não deve receber os URLs desses webhooks como secrets de envio antes da etapa controlada de ativação.

Próxima sequência técnica:

1. concluir e validar a branch sincronizada com a `main` atual;
2. revisar migration/outbox/gateway;
3. aplicar migration/deploy de forma controlada sem URL de provedor ativo;
4. configurar secrets server-side somente na janela de homologação;
5. ativar os webhooks no PapoAI via Work;
6. executar teste controlado autorizado;
7. conferir outbox, canal, template e ausência de duplicidade;
8. só então liberar o fluxo para pedidos reais.

## Não fazer antes da homologação

- não enviar mensagem para cliente real;
- não criar campanha/follow-up;
- não expor URLs secretas dos webhooks em GitHub, documentos ou respostas;
- não considerar HTTP 200 de webhook em Teste como prova de mensagem entregue.
