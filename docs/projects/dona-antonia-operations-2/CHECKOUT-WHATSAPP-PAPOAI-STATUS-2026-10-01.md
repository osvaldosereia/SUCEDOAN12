# Checkout WhatsApp — estado PapoAI

Data: 2026-10-01
Branch: `feat/checkout-whatsapp-confirmation`

## Estado confirmado no painel

Os dois templates utilitários foram submetidos e permanecem pendentes de aprovação.

| Canal | Nome real salvo pelo PapoAI | Tipo | Categoria | Estado |
|---|---|---|---|---|
| 0975 | `pedidorecebidosite0975` | Atendimento | Utilidade | Em análise |
| 1018 | `pedidorecebidosite1018` | Atendimento | Utilidade | Em análise |

Observações:

- o PapoAI removeu os sublinhados dos nomes sugeridos originalmente;
- o painel utilizado não exibiu uma opção explícita para confirmar `pt_BR`, então o idioma não deve ser declarado como confirmado até aparecer em uma tela de detalhes/aprovação;
- texto e quatro exemplos foram preenchidos conforme o handoff;
- nenhum template de marketing/recompra foi usado;
- nenhum envio foi realizado.

## Webhooks

Os dois webhooks continuam em **Teste** e estão parciais.

Estado salvo em ambos:

1. `Buscar ou criar um contato` por `phone_e164`.

Ainda NÃO configurado:

2. `Enviar mensagem` usando template utilitário;
3. mapeamento das quatro variáveis.

Não ativar os webhooks enquanto o template correspondente não estiver aprovado e selecionável.

## Nomes que devem ser usados após a aprovação

### 0975

Template real:

`pedidorecebidosite0975`

Mapeamento:

- `{{1}}` ← `order_number`
- `{{2}}` ← `total_formatted`
- `{{3}}` ← `delivery_label`
- `{{4}}` ← `payment_label`

### 1018

Template real:

`pedidorecebidosite1018`

Mapeamento:

- `{{1}}` ← `order_number`
- `{{2}}` ← `total_formatted`
- `{{3}}` ← `delivery_label`
- `{{4}}` ← `payment_label`

## Parte A / frontend

A verificação em Work reportou:

- quatro testes executados com sucesso;
- `index.html` e `vitrine/index.html` idênticos;
- `git diff --check` sem erros;
- reexecução do patch interrompida porque os trechos antigos já não existem, o que é esperado depois da aplicação do patch;
- nenhum novo commit foi necessário nessa rodada.

## Próxima etapa

Quando cada template estiver aprovado/selecionável:

1. abrir o webhook do mesmo canal;
2. adicionar somente a ação `Enviar mensagem`;
3. selecionar o template real daquele canal;
4. mapear as quatro variáveis;
5. salvar mantendo estado **Teste**;
6. conferir o salvamento reabrindo o webhook;
7. não enviar mensagem real ainda;
8. retornar para revisão técnica antes de secrets/deploy/ativação.

## Não fazer antes da revisão final

- não ativar os webhooks;
- não enviar mensagem real;
- não criar campanha/follow-up;
- não aplicar migration no Supabase produtivo;
- não deployar `whatsapp-order-outbound-v1`;
- não criar os secrets das URLs dos webhooks;
- não mergear nem rebasear em `main`.
