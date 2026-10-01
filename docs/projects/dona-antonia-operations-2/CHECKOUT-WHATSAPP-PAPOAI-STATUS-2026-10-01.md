# Checkout WhatsApp — estado PapoAI

Data: 2026-10-01
Branch final de integração: `feat/checkout-whatsapp-confirmation-final`

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
- vínculo real da conversa/conta PapoAI tem prioridade;
- a origem validada do checkout (`0975` ou `1018`) é usada apenas como fallback;
- não enviar um mesmo pedido pelos dois canais.

## Gate de ativação

O backend possui `ops2_whatsapp_order_runtime_v1` com três modos:

- `off`: padrão de instalação; não enfileira nem libera mensagens;
- `canary`: somente o `canary_order_id` explicitamente escolhido pode ser enfileirado/retirado da fila;
- `live`: libera o fluxo normal depois da homologação.

A migration do gate também marca como `suppressed` qualquer fila pendente existente antes da instalação do gate. Isso evita backlog acidental durante a preparação.

## Segurança da ativação

Os webhooks continuam em **Teste** e o Supabase produtivo ainda não recebeu as migrations/função desta integração. Os URLs secretos dos webhooks não estão em Git, documentos ou respostas.

Próxima sequência técnica:

1. manter a branch final sincronizada com a `main`;
2. instalar migrations e gateway com runtime em `off`;
3. validar banco/funções sem envio;
4. configurar os dois URLs secretos server-side somente na janela de homologação;
5. ativar os webhooks no PapoAI via Work;
6. selecionar um pedido controlado e mudar temporariamente para `canary`;
7. executar e conferir um único envio: outbox, canal, template, variáveis e ausência de duplicidade;
8. voltar imediatamente para `off` se houver qualquer divergência;
9. somente após homologação explícita mudar para `live`.

## Não fazer antes da homologação

- não enviar mensagem para cliente real;
- não criar campanha/follow-up;
- não expor URLs secretas dos webhooks em GitHub, documentos ou respostas;
- não considerar HTTP 200 de webhook em Teste como prova de mensagem entregue;
- não mudar o runtime para `live` antes do canário validado.
