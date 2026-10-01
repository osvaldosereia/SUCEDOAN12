# Checkout → confirmação WhatsApp — handoff para Work

Data: 2026-10-01
Branch: `feat/checkout-whatsapp-confirmation`

## Estado atual confirmado

A investigação real no PapoAI confirmou que, no webhook de entrada, a ação `Enviar mensagem` exige **template aprovado** e não aceita texto livre vindo de `message_text`.

Decisão arquitetural atualizada:

- confirmação de pedido usará **somente template utilitário aprovado**;
- não haverá rota `session_text`;
- não dependeremos da janela de 24 horas;
- cada canal terá webhook e template próprios;
- 0975 nunca poderá usar o template/webhook do 1018 e vice-versa.

## Objetivo desta rodada no Work

1. aplicar o patch já preparado no checkout público;
2. criar/submeter os dois templates utilitários de confirmação no PapoAI/Meta;
3. se e somente se cada template já estiver aprovado/selecionável no painel, terminar a configuração dos dois webhooks em **Teste**;
4. não ativar envio real.

## Regras invioláveis

- pedido nasce somente no site/Supabase;
- WhatsApp nunca é requisito para persistir o pedido;
- não usar Make/n8n;
- não enviar teste para cliente real;
- não ativar campanha ou follow-up;
- não usar o 0975 para um pedido roteado ao 1018, nem o inverso;
- não adaptar template de marketing para confirmação de pedido;
- não colocar URL secreta do webhook do PapoAI em GitHub, documento ou resposta;
- não aplicar migration/deploy/merge em produção nesta rodada sem autorização explícita.

---

# Parte A — frontend GitHub

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

---

# Parte B — templates utilitários PapoAI/Meta

Criar um template por canal. Não reutilizar o template de recompra/marketing.

## Template 0975

Nome sugerido:

`pedido_recebido_site_0975`

Canal:

0975

Categoria:

**Utilidade / Utility**

Idioma:

Português do Brasil (`pt_BR`)

Corpo sugerido:

`Recebemos seu pedido {{1}} na Dona Antônia.`

`Total: {{2}}`

`Entrega: {{3}}`

`Pagamento: {{4}}`

`Nossa equipe vai preparar seu pedido. Se precisar falar sobre este pedido, responda a esta mensagem.`

Variáveis de exemplo para submissão:

- `{{1}}` = `DA-12345`
- `{{2}}` = `R$ 120,00`
- `{{3}}` = `02/10/2026`
- `{{4}}` = `PIX`

Sem oferta, promoção, cupom, novidade, chamada comercial ou consentimento de marketing.

## Template 1018

Nome sugerido:

`pedido_recebido_site_1018`

Canal:

1018

Mesma categoria, idioma, corpo e variáveis do 0975.

## Aprovação

- criar/submeter os dois templates;
- registrar somente nome, canal, categoria e estado final observado;
- se a aprovação não for imediata, **parar a Parte B nesse ponto**;
- não substituir por template de marketing;
- não ativar webhook sem template utilitário aprovado.

---

# Parte C — terminar os dois webhooks em Teste

Executar somente quando o template correspondente estiver aprovado e aparecer como selecionável.

O gateway enviará estes campos:

- `event`
- `source`
- `event_id`
- `order_id`
- `phone_e164`
- `order_number`
- `purchased_at`
- `channel_origin`
- `delivery_mode`
- `total_formatted`
- `payment_label`
- `delivery_label`

`delivery_mode` sempre será `utility_template`.

## Webhook 0975

Nome:

`Dona Antônia — pedido recebido 0975`

Estado:

**Teste**

Ações e somente estas ações:

1. `Buscar ou criar um contato`
   - telefone = `phone_e164`
2. `Enviar mensagem`
   - canal fixo = 0975
   - template = `pedido_recebido_site_0975`
   - mapear variáveis:
     - `{{1}}` ← `order_number`
     - `{{2}}` ← `total_formatted`
     - `{{3}}` ← `delivery_label`
     - `{{4}}` ← `payment_label`

## Webhook 1018

Nome:

`Dona Antônia — pedido recebido 1018`

Estado:

**Teste**

Ações e somente estas ações:

1. `Buscar ou criar um contato`
   - telefone = `phone_e164`
2. `Enviar mensagem`
   - canal fixo = 1018
   - template = `pedido_recebido_site_1018`
   - mapear variáveis:
     - `{{1}}` ← `order_number`
     - `{{2}}` ← `total_formatted`
     - `{{3}}` ← `delivery_label`
     - `{{4}}` ← `payment_label`

Não adicionar tag, funil, transferência, Flow, campanha, follow-up ou qualquer outra ação.

## Se o PapoAI não permitir mapear as variáveis

Não improvisar e não ativar.

Registrar exatamente quais campos o editor oferece depois de selecionar o template e deixar o webhook em Teste.

---

# Segredos

As URLs completas dos webhooks são credenciais operacionais.

Não registrar em documento, commit, log público ou resposta ao usuário.

Depois de ambos estarem integralmente configurados, as URLs serão cadastradas apenas como secrets server-side:

- `PAPOAI_ORDER_TEMPLATE_WEBHOOK_0975_URL`
- `PAPOAI_ORDER_TEMPLATE_WEBHOOK_1018_URL`

Não criar esses secrets nesta rodada.

---

# O que já está pronto na branch

- spec e plano;
- outbox idempotente por `order_id + message_kind`;
- roteamento 0975/1018;
- refresh após vínculo PapoAI do pedido;
- entrega simplificada para `utility_template` apenas;
- claim com `FOR UPDATE SKIP LOCKED`;
- máximo de 5 tentativas internas;
- falha ambígua do provedor não recebe retry automático para reduzir duplicidade;
- gateway interno protegido por service role;
- dois slots de provedor separados: template 0975 e template 1018;
- payload mínimo e estruturado com `total_formatted`, `delivery_label` e `payment_label`;
- view service-only de observabilidade;
- patch determinístico do checkout e testes de contrato.

---

# Entrega objetiva do Work

Retornar:

- Parte A aplicada: sim/não;
- testes executados e resultado;
- template 0975: criado? categoria? estado?;
- template 1018: criado? categoria? estado?;
- webhook 0975: parcial/integral; estado Teste; ações salvas;
- webhook 1018: parcial/integral; estado Teste; ações salvas;
- se houver limitação, descrever a tela/campo exato que bloqueou;
- não expor URLs secretas.

## Não fazer ainda

- não aplicar SQL no Supabase produtivo;
- não deployar `whatsapp-order-outbound-v1`;
- não criar secrets do Supabase;
- não ativar os webhooks PapoAI em produção;
- não fazer pedido real;
- não mergear em `main`.
