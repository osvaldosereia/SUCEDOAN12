# Checkout → confirmação WhatsApp — handoff para Work

Data: 2026-10-01
Branch: `feat/checkout-whatsapp-confirmation`

## Objetivo

Concluir as duas partes que exigem workspace/browser completo sem publicar em produção ainda:

1. aplicar o patch já preparado no checkout público;
2. preparar no PapoAI dois webhooks de entrada isolados para confirmação por texto dentro da janela ativa.

## Regras invioláveis

- pedido nasce somente no site/Supabase;
- WhatsApp nunca é requisito para persistir o pedido;
- não usar Make/n8n;
- não enviar teste para cliente real;
- não ativar campanha ou follow-up;
- não usar o 0975 para um pedido roteado ao 1018, nem o inverso;
- não inventar rota de template Meta;
- não colocar URL secreta do webhook do PapoAI em GitHub/código;
- não aplicar migration/deploy/merge em produção nesta rodada sem autorização explícita.

## Parte A — frontend GitHub

Na branch `feat/checkout-whatsapp-confirmation`:

1. executar:
   `python3 scripts/patch-checkout-whatsapp-return.py`
2. executar:
   `node scripts/test-checkout-whatsapp-return.mjs`
3. executar:
   `node scripts/test-checkout-whatsapp-outbox.mjs`
4. executar:
   `node scripts/test-checkout-whatsapp-observability.mjs`
5. executar:
   `node scripts/test-site-only-order-registration.mjs`
6. executar:
   `git diff --check`
7. confirmar que `index.html` e `vitrine/index.html` continuam byte-a-byte iguais;
8. revisar o diff;
9. commit somente se todos os testes estiverem verdes.

Comportamento esperado do checkout:

- botão final: `Finalizar pedido`;
- não reservar popup com `window.open('about:blank')`;
- após sucesso do `submit_order`, limpar carrinho;
- mostrar `Pedido recebido`;
- informar que a confirmação será enviada ao WhatsApp;
- usar URL simples da conversa, sem texto de pedido pré-preenchido;
- após aproximadamente 3 segundos fazer tentativa best-effort de retorno ao WhatsApp;
- manter botão `Voltar ao WhatsApp`;
- manter botão `Voltar à vitrine`;
- bloqueio de abertura do aplicativo nunca vira erro de pedido.

## Parte B — PapoAI, somente preparação

Criar dois webhooks de entrada dedicados, inicialmente em **Teste**:

### Webhook 0975

Nome sugerido: `Dona Antônia — pedido recebido 0975`

Campos de requisição que nosso gateway enviará:

- `event`
- `source`
- `event_id`
- `order_id`
- `phone_e164`
- `order_number`
- `purchased_at`
- `channel_origin`
- `delivery_mode`
- `message_text`

Ações:

1. `Buscar ou criar um contato`
   - telefone = `phone_e164`
2. `Enviar mensagem`
   - canal fixo = 0975
   - mensagem = `message_text`

Não adicionar tag, funil, transferência, Flow, campanha, follow-up ou template.

### Webhook 1018

Mesmo contrato, nome sugerido `Dona Antônia — pedido recebido 1018`.

Ações:

1. `Buscar ou criar um contato`
   - telefone = `phone_e164`
2. `Enviar mensagem`
   - canal fixo = 1018
   - mensagem = `message_text`

Não adicionar qualquer ação extra.

## Janela Meta

Esses dois webhooks de texto serão usados exclusivamente para outbox com `delivery_mode=session_text`.

Pedidos sem inbound recente permanecem `delivery_mode=utility_template` e NÃO devem ser consumidos enquanto não existir rota comprovada de template utilitário oficial para cada canal.

Não adaptar template de marketing para confirmação de pedido.

## Segredos

As URLs completas dos webhooks são credenciais operacionais. Não registrar em documento, commit, log público ou resposta ao usuário.

Depois que os dois webhooks estiverem corretos, retornar apenas:

- `0975 webhook preparado: sim/não`
- `1018 webhook preparado: sim/não`
- estado: Teste/Ativo
- ações configuradas
- qualquer limitação encontrada

Não expor os links.

## O que já está pronto na branch

- spec e plano;
- outbox idempotente por `order_id + message_kind`;
- roteamento 0975/1018;
- refresh após vínculo PapoAI do pedido;
- distinção `session_text` / `utility_template`;
- claim com `FOR UPDATE SKIP LOCKED`;
- máximo de 5 tentativas internas;
- falha ambígua do provedor não recebe retry automático para reduzir duplicidade;
- gateway interno protegido por service role;
- quatro slots de provedor separados: texto/template × 0975/1018;
- payload mínimo;
- view service-only de observabilidade;
- patch determinístico do checkout e testes de contrato.

## Não fazer ainda

- não aplicar SQL no Supabase produtivo;
- não deployar `whatsapp-order-outbound-v1`;
- não criar secrets do Supabase;
- não ativar webhooks PapoAI em produção;
- não fazer pedido real;
- não mergear em `main`.
