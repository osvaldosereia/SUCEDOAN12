# Plano de implementação — Vitrine/Admin Cross-sell pós-cesta

Data: 2026-09-23  
Spec canônica: `docs/superpowers/specs/2026-09-23-vitrine-admin-post-order-cross-sell-design.md`

## Objetivo

Implementar o cross-sell pós-pedido em rodadas pequenas, observáveis e reversíveis, começando em **Shadow Mode**, sem enviar mensagem ao cliente e sem alterar pedidos.

Arquitetura atual preservada:
- Vitrine/Admin: `vitrine/admin/index.html`
- API operacional: `supabase/functions/vitrine-admin-v1/index.ts`
- Supabase Vitrine: `qxstkwshuvplmmftrctj`
- PapoAI/CRM: `ssbesxgaijknwsjbsbcz`
- Bling Hub: não alterar nesta primeira fase
- Make: não usar

## Decisões fechadas

1. Uma única fonte de verdade para oferta:
   - `products`
   - `offers`
   - `expiration_date`
   - `auto_expiry_offer_enabled`
   - RPC existente `reconcile_expiry_offers`

2. O cross-sell usa a mesma regra central de desconto por validade.
   - Funções canônicas: `expiry_discount_percent_v1` e `expiry_offer_price_cents_v1`.
   - Grupo A pode criar um quote privado de Pós-cesta mesmo quando a oferta pública do produto estiver desligada.
   - `auto_expiry_offer_enabled` continua controlando somente a oferta pública no catálogo.
   - Assim não é necessário ativar em massa todos os produtos com validade cadastrada.

3. Shadow Mode não envia WhatsApp e não altera `orders`/`order_items`.

4. Seleção normal não usa `ORDER BY random()`.
   - Será pseudoaleatória determinística por `order_id + product_id`.
   - O mesmo pedido gera o mesmo preview enquanto os dados de elegibilidade não mudarem.

5. O primeiro envio real será somente após homologação em número de teste.

6. Cross-sell deve acontecer antes da primeira separação.
   - Quando a separação começar, qualquer sessão aberta será encerrada.
   - Respostas tardias nunca modificam pedido que já entrou na separação/Bling.

---

# R1 — Shadow Core

## Meta

Construir o motor de classificação e seleção sem efeito externo.

## Banco

Migration:
`supabase/migrations/20260923_post_order_cross_sell_shadow_v1.sql`

Criar:

### `post_order_cross_sell_config`
Uma configuração por organização.

Campos:
- organization_id
- enabled
- mode = `off|shadow|test|canary|live`
- expiry_offer_count default 5
- regular_count default 5
- total_limit default 10
- basket_similarity_min default 85
- max_component_changes default 3
- max_standalone_product_lines default 3
- max_basket_quantity default 3
- response_window_seconds default 180
- regular_item_max_order_ratio default 0.15
- created_at
- updated_at

Estado inicial:
- `enabled=true`
- `mode='shadow'`

### `post_order_cross_sell_sessions`
Persistir cada avaliação de pedido.

Nesta rodada:
- status apenas `shadow_prepared|ineligible`
- nenhuma sessão é enviada.

### `post_order_cross_sell_items`
Snapshot das opções 1..10.

### `post_order_cross_sell_events`
Auditoria.

Eventos R1:
- eligibility_checked
- shadow_prepared
- shadow_ineligible

## Funções SQL/RPC

### `cross_sell_basket_similarity_v1(order_id)`

Calcular por cesta:

- `standard_units = sum(basket_items.quantity)`
- `matched_units = sum(least(current_qty, standard_qty))`
- `retention_pct = matched_units / standard_units * 100`
- `changed_lines`:
  - componente padrão removido/reduzido;
  - componente padrão aumentado;
  - componente novo/trocado.

Classificação inicial:
- `normal`: 100% e 0 alterações;
- `near_normal`: >= 85% e <= 3 alterações;
- `modified`: abaixo disso.

Guardas adicionais:
- máximo 3 linhas avulsas fora da cesta;
- máximo 3 unidades de cesta por pedido por padrão;
- pedido deve ter pelo menos uma cesta.

### `prepare_post_order_cross_sell_shadow_v1(order_id)`

Fluxo:
1. valida pedido;
2. calcula similaridade;
3. classifica elegibilidade;
4. obtém componentes atuais da cesta;
5. obtém produtos avulsos já presentes;
6. cria conjunto de exclusão;
7. seleciona Grupo A;
8. seleciona Grupo B;
9. grava snapshot;
10. grava auditoria;
11. retorna preview.

## Grupo A — validade/oferta

Consulta somente:
- product active;
- stock > 0;
- expiration_date entre hoje e 90 dias em America/Cuiaba;
- não está no conjunto de exclusão;
- preço válido;
- se houver oferta vigente mais barata, usar esse preço;
- caso contrário, calcular quote privado com a regra 10% / 20% / 40%.

Ordenar:
1. expiration_date asc;
2. stock_quantity asc;
3. product_id.

Limite padrão: 5.

## Grupo B — normal

Consulta:
- ativo;
- estoque > 0;
- sale_price_cents > 0;
- sem oferta vigente;
- não presente no pedido/cesta;
- não selecionado no Grupo A;
- preço <= 15% do total do pedido, quando houver candidatos suficientes.

Estratégia:
1. agrupar por `metadata.sales_category` / `storefront_category`;
2. escolher diversidade de categorias;
3. ordenar dentro de categoria por hash determinístico de `order_id + product_id`;
4. completar vagas restantes determinísticamente.

Limite padrão: 5.

## API

Adicionar em `vitrine-admin-v1`:

- `cross_sell_shadow_prepare`
- `cross_sell_shadow_get`
- `cross_sell_shadow_list`
- `cross_sell_config_get`

Nenhum endpoint de escrita em pedido nesta rodada.

## Gate R1

Aprovado somente se:
- 0 WhatsApp enviado;
- 0 linhas novas em `order_items`;
- 0 mudança de total;
- 0 mudança em Bling;
- classificação reproduzível;
- produto da cesta nunca aparece;
- estoque zero nunca aparece;
- vencido nunca aparece;
- Grupo A usa a regra canônica de validade e nunca exige ativação pública em massa;
- mesmo pedido retorna mesma lista quando catálogo não mudou.

---

# R2 — Admin Shadow

## Meta

Tornar o Shadow visível e auditável para o operador.

## UI

Adicionar aba principal:
**Pós-cesta**

Posição recomendada:
- imediatamente após **Pedidos**.

Blocos:

### Estado
- modo: SHADOW
- automação ativa/inativa
- nenhuma mensagem é enviada

### Cards
- pedidos avaliados
- elegíveis
- não elegíveis
- cesta normal
- cesta quase normal
- média de produtos selecionados

### Lista
Colunas:
- pedido
- cliente
- cesta
- similaridade
- classificação
- quantidade de alterações
- situação
- data

### Detalhe
Mostrar:
- composição padrão;
- composição enviada;
- diferenças;
- itens avulsos;
- motivo elegível/não elegível;
- 10 sugestões;
- origem de cada sugestão;
- estoque;
- validade;
- preço normal;
- preço ofertado;
- % desconto;
- mensagem que seria enviada.

### Botão
**Simular seleção novamente**

Não altera pedido.

## Gate R2

Validar manualmente pelo menos:
- 3 cestas normais;
- 3 quase normais;
- 2 muito alteradas;
- 1 pedido só de produto;
- 1 pedido em quantidade grande.

Meta:
- nenhuma recomendação incoerente crítica;
- nenhuma repetição do pedido;
- nenhum item inválido.

---

# R3 — Shadow automático em pedidos novos

## Meta

Parar de depender de botão/manual.

## Trigger

Após criação bem-sucedida de pedido:
- agendar preparação Shadow assíncrona;
- não atrasar confirmação do checkout;
- falha do cross-sell nunca falha o pedido.

Preferência:
- chamada interna idempotente no fluxo backend existente;
- não criar polling.

Idempotência:
`cross_sell_shadow:{order_id}:v1`

## Admin

Marcar:
- auto preparado;
- manual/reprocessado;
- erro técnico;
- motivo da não elegibilidade.

## Testes

Adicionar:
`scripts/test-vitrine-post-order-cross-sell-shadow-v1.mjs`

Cobrir:
- pure basket;
- near-normal basket;
- modified basket;
- mixed order;
- bulk basket;
- expired product;
- stock zero;
- duplicate product;
- active manual offer não entra no Grupo A;
- active expiry_auto entra;
- deterministic selection.

## Gate R3

- 100% dos pedidos novos recebem avaliação ou motivo de falha;
- checkout não aumenta erro;
- nenhuma ação externa.

---

# R4 — Test Mode / PapoAI sem alterar pedido

## Meta

Validar mensagem real e entendimento da resposta, ainda sem inserir produtos.

Config:
- `mode='test'`
- allowlist de telefones de teste.

## Fluxo

1. pedido elegível;
2. backend prepara snapshot;
3. envia uma única mensagem ao PapoAI;
4. PapoAI entrega ao WhatsApp;
5. resposta volta pelo webhook já existente;
6. backend detecta sessão aberta;
7. parser interpreta:
   - números;
   - múltiplos números;
   - recusa;
   - dúvida;
8. registra somente o que teria acontecido.

Status:
- sent_test
- simulated_accept
- simulated_decline
- simulated_expired

Nenhuma alteração em `order_items`.

## Mensagem V1

Texto único com:
- Pedido recebido;
- Ofertas especiais 1..N;
- Outras sugestões;
- instrução para responder números;
- “não” para recusar.

## Gate R4

Testes WhatsApp:
- `2`
- `2 e 7`
- `quero 3`
- `1, 4 e 8`
- `não`
- `pode fechar`
- número inválido
- resposta após expiração

Todos devem ser determinísticos.

---

# R5 — Homologação transacional

## Meta

Permitir alteração real apenas em pedidos de teste.

## Banco/backend

RPC:
`accept_post_order_cross_sell_v1(session_id, positions[])`

Transação única:
1. lock session;
2. lock order;
3. confirmar sessão válida;
4. confirmar pedido ainda editável;
5. confirmar que separação não iniciou;
6. revalidar produto/estoque/ativo;
7. validar preço snapshot vs política;
8. inserir em `order_items`;
9. metadata com:
   - cross_sell_session_id
   - cross_sell_position
   - source=post_order_cross_sell
10. recalcular subtotal/discount/total;
11. marcar itens aceitos;
12. atualizar receita incremental;
13. fechar sessão ou permitir uma única confirmação;
14. auditar.

Idempotência:
unique lógico por `session_id + product_id`.

## Integração com separação

Ao clicar **Iniciar separação**:
- fechar sessão aberta como `cancelled`;
- reason = `separation_started`;
- só então prosseguir.

Assim:
- nunca existe resposta tardia alterando pedido já separado;
- Bling continua recebendo snapshot final e estável.

## Gate R5

Em pedido de teste:
- item entra uma vez;
- total correto;
- refresh preserva estado;
- mesma resposta repetida não duplica;
- estoque insuficiente não entra;
- início da separação bloqueia alteração tardia;
- preview Bling continua fechando total exato.

---

# R6 — Canary

## Meta

Liberar gradualmente para clientes reais.

Config:
- `mode='canary'`
- percentage inicial: 10%
- seleção por hash de order_id, estável.

Condições:
- somente cesta normal/quase normal;
- 1 sessão por pedido;
- janela 3 minutos;
- zero insistência;
- sem follow-up adicional.

## Observabilidade

Admin:
- elegíveis
- enviados
- aceitos
- recusados
- expirados
- erro
- receita adicional
- ticket antes
- ticket depois
- itens mais aceitos
- produtos de validade vendidos

Alertas:
- taxa de erro > 2%;
- qualquer duplicação;
- qualquer divergência de total;
- qualquer produto vencido/estoque zero selecionado;
- qualquer alteração após separação.

Falha crítica:
- modo volta automaticamente para `shadow`.

---

# R7 — Produção + otimização

## Meta

Ativar 100% após canário estável.

Config:
- `mode='live'`

Depois de volume suficiente:
- ranking por aceitação;
- afinidade cesta → produto;
- afinidade cliente → categoria;
- priorização de validade combinada com probabilidade de venda.

Não alterar a regra base:
- primeiros lugares continuam favorecendo objetivo de escoamento por validade;
- nunca oferecer item inválido.

## A/B posterior

A:
- texto

B:
- uma imagem única + texto curto

Métrica de decisão:
- receita adicional / pedido elegível;
- taxa de aceitação;
- tempo de resposta;
- cancelamento/abandono;
- impacto operacional.

---

# Arquivos previstos

## Criar
- `supabase/migrations/20260923_post_order_cross_sell_shadow_v1.sql`
- `scripts/test-vitrine-post-order-cross-sell-shadow-v1.mjs`
- testes adicionais por rodada

## Alterar
- `supabase/functions/vitrine-admin-v1/index.ts`
- `vitrine/admin/index.html`
- fluxo de criação do pedido somente a partir da R3
- fluxo de separação somente a partir da R5
- `papo-external-agent-v1` somente a partir da R4

## Não tocar na R1
- Bling Hub
- fiscal
- Make
- checkout visual
- prompt principal do agente PapoAI
- pedido real
- estoque real além das regras já existentes

---

# Sequência recomendada de execução

1. **R1 Shadow Core**
2. **R2 Admin Shadow**
3. **R3 Shadow automático**
4. observar pedidos reais em Shadow
5. **R4 Test Mode PapoAI**
6. **R5 Homologação transacional**
7. **R6 Canary 10%**
8. **R7 Produção**

Não pular Shadow → Live.

---

# Critério para iniciar programação

A R1 pode ser programada sem interação humana porque:
- não envia mensagem;
- não altera pedido;
- não interfere no Bling;
- é reversível;
- produz apenas dados de observação/auditoria.

Ao concluir R1, o próximo gate é visual: conferir no Admin alguns pedidos reais antes de habilitar qualquer comunicação com cliente.
