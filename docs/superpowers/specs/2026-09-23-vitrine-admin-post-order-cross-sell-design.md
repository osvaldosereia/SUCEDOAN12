# Vitrine/Admin — Cross-sell pós-pedido de cesta

Data: 2026-09-23

## 1. Objetivo

Criar uma automação de cross-sell logo após o cliente enviar um pedido de cesta básica normal ou quase normal.

A automação deve:
- identificar pedidos elegíveis;
- selecionar até 10 produtos automaticamente;
- priorizar produtos com validade mais próxima e oferta automática ativa;
- completar a seleção com produtos normais fora de oferta;
- apresentar as opções no WhatsApp de forma simples;
- permitir que o cliente responda somente os números desejados;
- adicionar os produtos ao mesmo pedido;
- recalcular o total;
- registrar resultado e receita adicional;
- seguir o pedido normalmente caso o cliente não aceite nada.

A funcionalidade deve ser parte do Vitrine/Admin e usar as mesmas fontes de verdade já existentes para produto, estoque, validade, preço e oferta.

---

## 2. Princípio arquitetural

Não criar uma segunda lógica de ofertas.

Fontes oficiais:
- `products` = produto, preço normal, estoque, validade, ativo/inativo;
- `offers` = preço promocional vigente;
- `products.expiration_date` = validade;
- `products.auto_expiry_offer_enabled` = participação na oferta automática por validade;
- `orders`, `order_items`, `order_item_components` = pedido real;
- `basket_items` = composição padrão da cesta;
- PapoAI = conversa, envio ao cliente e interpretação da resposta textual;
- Supabase = decisão determinística, sessão, regras e alteração segura do pedido.

Regra central:
**a IA nunca escolhe preço, estoque, validade nem qual item corresponde ao número digitado.**
Tudo isso é determinado e congelado pelo backend.

---

## 3. Momento de disparo

O cross-sell deve ser avaliado imediatamente após:
- pedido de cesta salvo com sucesso;
- cliente identificado quando disponível;
- itens do pedido persistidos;
- antes da expedição/Bling considerar o pedido fechado de forma definitiva.

Estado sugerido do pedido/sessão:
`awaiting_cross_sell`

Tempo inicial sugerido de espera:
- 3 minutos;
- configurável no Admin;
- ausência de resposta nunca bloqueia o pedido.

Ao expirar:
- fecha a sessão;
- mantém o pedido original;
- segue fluxo normal.

---

## 4. Elegibilidade do pedido

### 4.1 Elegível

Pedido contendo pelo menos uma cesta e classificado como:
- cesta normal;
- cesta quase normal.

### 4.2 Classificação da cesta

Comparar a composição atual em `order_item_components` com a composição padrão em `basket_items`.

#### Cesta normal
- composição equivalente ao padrão;
- mesmas linhas essenciais;
- mesmas quantidades, tolerando apenas diferenças técnicas de ordenação.

#### Cesta quase normal
Configuração inicial:
- pelo menos 85% dos componentes padrão preservados;
- no máximo 3 alterações relevantes entre retirada, troca ou mudança de quantidade;
- sem transformação radical da cesta.

Essa tolerância deve ficar configurável no Admin.

### 4.3 Não elegível

Não disparar cross-sell quando:
- não houver cesta;
- pedido for majoritariamente de produtos avulsos;
- cesta estiver muito alterada;
- pedido já recebeu cross-sell;
- pedido estiver cancelado;
- pedido estiver em suporte/reclamação;
- pedido já estiver em fase operacional incompatível;
- não houver produtos elegíveis para recomendar;
- cliente tiver opt-out comercial aplicável ao contexto;
- sessão equivalente já estiver aberta.

---

## 5. Quantidade de produtos

Padrão:
- 5 produtos prioritários por validade/oferta;
- 5 produtos normais;
- total alvo = 10.

Se houver menos de 5 produtos de validade elegíveis:
- usar todos os disponíveis;
- completar até 10 com produtos normais.

Se houver menos de 10 produtos elegíveis no total:
- enviar apenas os disponíveis;
- nunca repetir produto;
- nunca inventar opção.

Configuração no Admin:
- quantidade de validade: padrão 5;
- quantidade normal: padrão 5;
- máximo total: padrão 10.

---

## 6. Grupo A — produtos por validade

Selecionar primeiro os produtos que atendem TODOS os critérios:

- `products.active = true`;
- `stock_quantity > 0`;
- `expiration_date is not null`;
- `expiration_date >= current_date`;
- `auto_expiry_offer_enabled = true`;
- não está na cesta/pedido atual;
- não foi selecionado anteriormente para a mesma sessão;
- preço válido;
- produto não bloqueado comercialmente.

Ordenação:
1. validade mais próxima;
2. menor estoque como desempate opcional;
3. atualização mais recente como desempate técnico.

### 6.1 Regras atuais de desconto por validade

- 60 a 90 dias: 10%;
- 30 a 59 dias: 20%;
- menos de 30 dias: 40%;
- vencido: nunca oferecer; estoque deve ser zerado pelo controle de validade conforme regra do Vitrine/Admin.

O preço enviado ao cliente deve vir de `offers` quando existir uma oferta vigente gerada pelo sistema.

Nunca recalcular no WhatsApp.

---

## 7. Grupo B — produtos normais

Selecionar produtos:

- ativos;
- com estoque > 0;
- com preço válido;
- fora de oferta vigente;
- não presentes na cesta/pedido;
- não selecionados no Grupo A;
- não repetidos na mesma sessão.

A seleção deve ser “aleatória controlada”, não puro `ORDER BY random()`.

Objetivo:
- variar categorias;
- favorecer itens fáceis de adicionar;
- evitar cinco produtos muito parecidos;
- evitar itens excessivamente caros em relação ao pedido.

### 7.1 Diversidade sugerida

Tentar distribuir entre:
- mercearia;
- limpeza/lavanderia;
- higiene/beleza;
- doces/lanches;
- utilidades/pet quando adequado.

### 7.2 Faixa de preço

Regra inicial:
- preferir itens individuais cujo preço seja até aproximadamente 15% do valor do pedido;
- permitir exceções configuráveis;
- evitar sugerir item caro que transforme uma compra simples em decisão difícil.

---

## 8. Exclusões obrigatórias

Nunca oferecer:
- produto já presente como item avulso;
- produto já presente dentro da cesta atual;
- produto vencido;
- produto sem estoque;
- produto inativo;
- produto sem preço válido;
- produto com oferta encerrada;
- item já recusado naquela sessão;
- item duplicado por SKU/GTIN/produto;
- produto sem possibilidade operacional de venda.

---

## 9. Snapshot da sessão

Criar uma estrutura própria de sessão para congelar as opções mostradas.

Tabela sugerida:
`post_order_cross_sell_sessions`

Campos mínimos:
- `id uuid`;
- `order_id uuid`;
- `customer_id uuid null`;
- `conversation_id uuid null`;
- `whatsapp_phone_e164 text`;
- `status text`;
- `basket_similarity numeric`;
- `basket_classification text`;
- `expires_at timestamptz`;
- `sent_at timestamptz null`;
- `completed_at timestamptz null`;
- `selected_numbers jsonb`;
- `accepted_product_count integer`;
- `added_revenue_cents integer`;
- `metadata jsonb`;
- `created_at timestamptz`;
- `updated_at timestamptz`.

Status sugeridos:
- `prepared`;
- `sent`;
- `partially_accepted`;
- `accepted`;
- `declined`;
- `expired`;
- `cancelled`.

Tabela sugerida:
`post_order_cross_sell_items`

Campos mínimos:
- `id uuid`;
- `session_id uuid`;
- `position integer` (1 a 10);
- `product_id uuid`;
- `source_kind text` = `expiry_offer` | `regular`;
- `name_snapshot text`;
- `sku_snapshot text`;
- `image_url_snapshot text`;
- `regular_price_cents integer`;
- `offered_price_cents integer`;
- `discount_percent numeric null`;
- `expiration_date_snapshot date null`;
- `stock_snapshot numeric`;
- `offer_id uuid null`;
- `accepted boolean default false`;
- `accepted_quantity numeric default 0`;
- `metadata jsonb`;
- `created_at timestamptz`.

Regra:
o cliente responde número; o backend resolve o número pela sessão.
A IA nunca transforma “2” em produto por conta própria.

---

## 10. Mensagem WhatsApp — V1

Formato inicial recomendado: texto.

Motivo:
- simples;
- rápido;
- barato;
- fácil de responder;
- não exige abrir link;
- reduz atrito.

Modelo:

```
Pedido recebido ✅

Antes de fechar, se quiser aproveitar, separei algumas opções para acrescentar à sua cesta:

🔥 Ofertas especiais
1. Produto A — de R$ 9,90 por R$ 7,92
2. Produto B — de R$ 12,90 por R$ 9,03
3. Produto C — de R$ 6,90 por R$ 4,14
4. Produto D — de R$ 8,90 por R$ 7,12
5. Produto E — de R$ 5,90 por R$ 5,31

🛒 Outras sugestões
6. Produto F — R$ 5,90
7. Produto G — R$ 3,49
8. Produto H — R$ 11,90
9. Produto I — R$ 7,50
10. Produto J — R$ 4,20

Se quiser acrescentar, responda só os números.
Ex.: 2 e 7

Se não quiser, pode responder “não”.
```

Regras:
- no máximo uma mensagem;
- sem texto promocional exagerado;
- sem pressionar;
- sem repetir envio;
- sem link obrigatório.

---

## 11. Respostas aceitas

O parser deve aceitar naturalmente:
- `2`;
- `2 e 7`;
- `2, 7 e 9`;
- `quero 2 e 7`;
- `coloca o 3`;
- `adiciona 1, 4, 6`;
- `não`;
- `nao quero`;
- `pode fechar`.

Interpretação:
- extrair números entre 1 e N da sessão aberta;
- eliminar repetição;
- rejeitar número inexistente;
- confirmar somente itens ainda válidos.

Se houver dúvida real:
- fazer uma pergunta curta;
- nunca adivinhar.

---

## 12. Validação antes de adicionar

Mesmo com snapshot, antes de escrever no pedido:

1. confirmar que a sessão está aberta;
2. confirmar que o pedido ainda aceita alteração;
3. confirmar estoque atual;
4. confirmar que o produto continua ativo;
5. confirmar preço/oferta segundo a política definida;
6. confirmar que o item não foi adicionado por outra via;
7. aplicar idempotência.

Se a oferta expirou entre envio e resposta:
- não adicionar silenciosamente com preço diferente;
- informar de forma curta;
- oferecer alternativa somente se houver regra segura.

---

## 13. Alteração do pedido

Ao aceitar itens:

- inserir produtos em `order_items`;
- usar `item_kind='product'`;
- guardar `cross_sell_session_id` e posição em metadata;
- usar preço congelado/validado;
- recalcular subtotal;
- recalcular desconto;
- recalcular total;
- preservar cesta original;
- não alterar composição da cesta;
- atualizar métricas da sessão.

A operação deve ser transacional e idempotente.

Chave de idempotência sugerida:
`cross_sell:{session_id}:{product_id}`

---

## 14. Resposta após inclusão

Exemplo:

```
Pronto 😊 Acrescentei os produtos 2 e 7 ao seu pedido.
Novo total: R$ 247,30.
```

Se houver inclusão parcial:

```
Acrescentei o produto 2 😊
O produto 7 acabou antes da confirmação, então mantive seu pedido sem ele.
Novo total: R$ 238,90.
```

Se o cliente recusar:

```
Tudo certo 😊 Vou manter seu pedido como está.
```

---

## 15. Link da vitrine

Não usar no primeiro envio.

Somente se o cliente pedir:
- “tem mais?”;
- “quero ver outras ofertas”;
- “manda a vitrine”;
- equivalente.

Nesse caso:
- gerar/usar o `Link da Vitrine` atual;
- não misturar essa navegação com a sessão numérica já fechada sem regra explícita.

---

## 16. Integração com PapoAI

PapoAI deve:
- receber o texto final da oferta já montado pelo backend;
- enviar a mensagem;
- receber a resposta do cliente;
- encaminhar a mensagem ao webhook atual;
- deixar o backend verificar se existe sessão cross-sell aberta.

Quando existir sessão:
- o backend tenta primeiro interpretar a resposta no contexto da sessão;
- se resolver números/recusa, executa ação determinística;
- se não resolver, libera resposta conversacional normal.

Não usar IA para escolher produto, desconto ou preço.

---

## 17. Vitrine/Admin — nova área

Criar seção:
**Oferta após cesta**

### 17.1 Configuração

Campos:
- Ativar automação;
- quantidade “Validade/Oferta” (default 5);
- quantidade “Sugestões normais” (default 5);
- limite total (default 10);
- similaridade mínima da cesta (default 85%);
- máximo de alterações (default 3);
- tempo de resposta (default 3 min);
- limite de preço por produto em relação ao pedido (default 15%);
- máximo de uma sessão por pedido;
- bloquear quando houver atendimento humano;
- bloquear quando houver reclamação/suporte.

### 17.2 Preview

Botão:
**Simular seleção**

Entrada:
- escolher pedido;
- visualizar por que ficou elegível/não elegível;
- mostrar 10 produtos;
- mostrar origem:
  - `Validade`;
  - `Normal`;
- mostrar preço normal/oferta;
- mostrar validade;
- mostrar estoque;
- mostrar se já está no pedido;
- mostrar mensagem final que seria enviada.

### 17.3 Métricas

Cards:
- pedidos de cesta;
- elegíveis;
- ofertas enviadas;
- aceitações;
- taxa de aceitação;
- produtos adicionados;
- receita adicional;
- ticket médio antes;
- ticket médio depois;
- receita adicional por sessão;
- produtos mais aceitos;
- produtos de validade escoados.

---

## 18. Relação com a aba Validades/Ofertas

A nova automação NÃO cadastra oferta.

Ela consome o que já existe.

Fluxo:
`Validade do produto -> regra de desconto -> offers -> cross-sell`

Se o operador:
- desativar `auto_expiry_offer_enabled`;
- alterar validade;
- alterar oferta;
- zerar estoque;
- desativar produto;

o produto deixa de aparecer automaticamente conforme a nova condição.

---

## 19. Guardas de segurança

- nunca oferecer vencido;
- nunca oferecer estoque zero;
- nunca repetir item do pedido;
- nunca alterar cesta-base para inserir cross-sell;
- nunca criar pedido novo para o adicional;
- nunca deixar IA calcular total;
- nunca permitir duas gravações do mesmo produto por reprocessamento;
- nunca bloquear expedição indefinidamente;
- nunca insistir após recusa;
- nunca enviar segunda sessão no mesmo pedido;
- registrar toda decisão em auditoria.

---

## 20. Auditoria

Tabela/evento sugerido:
`post_order_cross_sell_events`

Eventos:
- `eligibility_checked`;
- `session_prepared`;
- `message_sent`;
- `customer_accepted`;
- `customer_declined`;
- `session_expired`;
- `item_added`;
- `item_rejected_stock`;
- `item_rejected_price`;
- `order_recalculated`.

Cada evento deve guardar:
- session_id;
- order_id;
- event_type;
- payload compacto;
- created_at.

---

## 21. Fases de implantação

### Fase 1 — Shadow
- classificar pedidos;
- montar as 10 opções;
- mostrar no Admin;
- NÃO enviar ao cliente;
- validar qualidade das escolhas.

### Fase 2 — Homologação
- ativar somente em número/teste;
- mensagem real;
- aceitar resposta numérica;
- adicionar item ao pedido de teste;
- validar total.

### Fase 3 — Canary
- liberar para pequena porcentagem de pedidos;
- medir aceitação;
- comparar ticket médio.

### Fase 4 — Produção
- ativação ampla;
- monitorar estoque, validade e receita incremental.

---

## 22. Critérios de aceite V1

A V1 só está pronta quando:

1. pedido normal/quase normal é classificado corretamente;
2. cesta muito alterada não entra;
3. nenhum produto da cesta aparece entre as 10 opções;
4. nenhum produto sem estoque aparece;
5. nenhum vencido aparece;
6. até 5 ofertas de validade são priorizadas;
7. restante é preenchido por produtos normais elegíveis;
8. mensagem final contém numeração determinística;
9. cliente pode responder números;
10. itens entram no mesmo pedido;
11. total é recalculado;
12. repetição da mesma resposta não duplica item;
13. recusa encerra sessão;
14. timeout não bloqueia o pedido;
15. Admin mostra receita adicional;
16. toda operação fica auditável.

---

## 23. Decisão de produto

A V1 será:
- texto;
- 10 produtos no máximo;
- 5 por validade/oferta;
- 5 normais;
- resposta por número;
- sem imagem obrigatória;
- sem link obrigatório;
- uma única tentativa por pedido.

Depois da V1, testar A/B:
- texto puro;
- imagem única com os mesmos 10 produtos.

A versão vencedora deve ser escolhida por:
- taxa de aceitação;
- receita adicional por pedido;
- tempo de resposta;
- taxa de abandono;
- impacto operacional.
