# PapoAI Commerce OS — Current State

Atualizado: 2026-09-21

## Estado geral

- R0-A transporte PapoAI → Supabase: comprovado em laboratório.
- Agente `Dona Antônia — Homologação`: criado no PapoAI.
- Loop entre os dois números internos: identificado e bloqueado na Edge Function.
- Edge Function `papo-external-agent-v1`: **v11**, ativa tecnicamente, mas os cérebros estão desligados.
- `channel_provider_agent_labs.enabled=false`
- `papoai_commerce_brain_config.enabled=false`
- `papoai_commerce_brain_config.write_enabled=false`
- `papoai_commerce_brain_config.ai_enabled=false`

Nenhum atendimento comercial real foi ativado nesta rodada.

## R0-B — Commerce Brain: base programada

### Fonte de verdade
Supabase é autoridade para:
- cestas;
- produtos;
- estoque;
- preços;
- ofertas;
- carrinho;
- cálculos;
- personalização;
- valor oculto;
- histórico e cliente.

A IA nunca calcula preço/total e nunca altera carrinho diretamente.

### Cestas
Readiness atual:
- 9 cestas ativas no WhatsApp;
- 0 cestas vazias;
- 0 divergências de `hidden_adjustment`;
- política: lista completa em uma única mensagem, agrupada por categoria;
- preço individual de componente: oculto;
- `hidden_adjustment`: oculto ao cliente.

A função `format_papoai_commerce_basket_message_v1` já produz a lista completa da cesta.

### Produtos
- 306 produtos vendáveis;
- 306/306 com imagem;
- busca comercial `search_papoai_commerce_products_v1`;
- retorna preço comercial/oferta e imagem, sem delegar preço à IA.

### Personalização
Funções existentes reaproveitadas:
- `start_papoai_commerce_basket_v1`
- `set_papoai_commerce_basket_quantity_v1`
- `set_papoai_commerce_addon_quantity_v1`
- `replace_papoai_commerce_basket_item_v1`
- `recalculate_papoai_commerce_cart_v1`

Correção aplicada:
- ao iniciar cesta, o `hidden_adjustment` oficial é atualizado e copiado para o carrinho antes do recálculo.

Nova função:
- `preview_papoai_commerce_basket_personalization_v1`

Ela simula mudanças sem gravar dados.

Teste real de cálculo:
- Mini Bonini: R$ 175,00;
- Feijão: quantidade 2 → 1;
- Óleo: quantidade 2 → 3;
- delta comercial: -R$ 1,70;
- novo total: **R$ 173,30**;
- `writes_performed=false`.

### Executor de comandos
Criado `execute_papoai_commerce_command_v1`.

Comandos previstos:
- list_baskets
- basket_detail
- customer_context
- search_products
- offers
- cart_state
- start_basket
- set_basket_quantity
- set_addon_quantity
- replace_basket_item

Toda execução passa pelo Supabase e é auditável em `papoai_commerce_command_audit`.

### Inteligência
Criado `papoai-commerce-intent-v1.mjs`.

Estratégia:
1. regras determinísticas para intenções óbvias;
2. GPT-5.6 Luna apenas quando necessário;
3. IA extrai intenção/entidades;
4. Supabase executa e valida;
5. histórico enviado à IA limitado a 12 mensagens.

A v10 do Agente Externo já contém esse roteador, mas ele está dormente enquanto `papoai_commerce_brain_config.enabled=false`.

## Proteções contra loop

Os dois números internos estão em:
`channel_provider_agent_labs.metadata.blocked_internal_phones`.

Eventos originados por número interno ou pela própria IA:
- `silent=true`;
- `handoff=false`;
- não geram resposta comercial.

## Próxima rodada

Prioridade recomendada:
1. resolver automaticamente referências de produto dentro do carrinho ("tira um feijão", "coloca mais dois óleos");
2. resolver substituições com segurança ("troca OMO por outro sabão");
3. gerar resposta final da personalização em linguagem natural;
4. incorporar identificação do cliente/última compra;
5. preparar checkout determinístico;
6. só depois ativar `enabled`, primeiro sem escrita e em homologação.

Nenhum gate de produção deve ser ativado automaticamente.


## Complemento da rodada ampla

Foi adicionado o resolvedor natural de itens do carrinho:

- `resolve_papoai_commerce_cart_item_v1`
- `set_papoai_commerce_basket_quantity_by_query_v1`

Ele permite que frases como "tira um feijão" ou "deixa 3 óleos" sejam resolvidas contra os itens realmente presentes no carrinho. Quando houver ambiguidade, a operação não é aplicada: o sistema devolve candidatos e exige confirmação.

A v11 do Agente Externo já usa esse resolvedor para alterações de quantidade quando `write_enabled=true`.

Os gates continuam:
- `papoai_commerce_brain_config.enabled=false`
- `papoai_commerce_brain_config.write_enabled=false`
- `papoai_commerce_brain_config.ai_enabled=false`
- `channel_provider_agent_labs.enabled=false`

Portanto nenhuma alteração comercial real está ativa.
