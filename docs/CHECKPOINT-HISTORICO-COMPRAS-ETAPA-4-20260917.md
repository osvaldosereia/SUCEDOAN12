# Checkpoint — Histórico de Compras — Etapa 4

Data: 17/09/2026  
Status: **CONCLUÍDA**

## Entregas realizadas

### Backend Supabase

Criadas e aplicadas:

- `room_repeat_last_purchase_preview_v1(token)`
- `room_repeat_last_purchase_apply_v1(token)`

Migrations:

- `supabase/migrations/20260917235000_repeat_last_purchase_room_v1.sql`
- `supabase/migrations/20260917235600_fix_repeat_last_purchase_cart_id_v1.sql`

### Regras da repetição

A repetição:

- exige sessão aberta e cliente identificado;
- usa somente a última compra comercial válida;
- exige que a cesta antiga ainda exista e esteja ativa;
- remonta a cesta usando a definição comercial atual;
- tenta reaplicar alterações de quantidade somente quando ainda permitidas pelas regras atuais;
- não reaplica substituições antigas automaticamente;
- reaplica produtos extras somente se estiverem ativos, verificados e com estoque;
- limita quantidades pelas regras atuais do Comprar;
- usa os preços efetivos do carrinho atual;
- registra a origem da recompra na sessão e em `customer_behavior_events`.

### Preview antes de aplicar

O cliente vê antes da confirmação:

- data da última compra;
- cesta;
- valor histórico;
- estimativa atual;
- produtos extras;
- itens indisponíveis;
- quantidades ajustadas;
- aviso quando a cesta anterior tinha personalizações que precisam ser conferidas.

Nada é adicionado sem confirmação explícita.

### API pública do Comprar

`shopping-chat-customer-v1` foi publicada em produção na versão 7 com:

- `repeat_last_purchase_preview`
- `repeat_last_purchase_apply`

As ações continuam protegidas pelo token opaco da sessão e pelo vínculo do cliente à sala.

### Frontend

Criados:

- `comprar/repeat-purchase-v1.js`
- `comprar/repeat-purchase-v1.css`

O `comprar/index.html` carrega os dois recursos antes de iniciar o app.

Comportamento:

- somente cliente identificado com carrinho vazio recebe a opção **Repetir última compra**;
- cliente sem histórico mantém o fluxo normal;
- ao escolher, o sistema mostra um resumo;
- o botão **Repetir esta compra** remonta o carrinho;
- após a montagem, o Comprar recarrega a mesma sessão e restaura a cesta/carrinho para revisão;
- cliente ainda pode alterar produtos antes de finalizar.

### Correção de integração

O botão de recompra foi colocado fora do grupo de chips interceptado pelo roteador conversacional para não ser bloqueado pelo listener de `conversation.js`.

## Testes

Foi criado:

`scripts/test-comprar-repeat-last-purchase-v1.mjs`

O CI `Testar Sala de Compra` passou com:

- sintaxe JavaScript;
- contrato da nova migration;
- ações da Edge Function;
- ordem de carregamento Papo identity → recompra → start;
- ausência de Make.

Também foi executado teste transacional no banco com `ROLLBACK`, sem alterar sessão real. O teste remontou corretamente uma compra com:

- cesta atual;
- extra histórico válido;
- preço/estoque atuais;
- total recalculado;
- contadores de itens aplicados/ignorados.

## Observação

A recompra segue exatamente a mesma regra de preço efetivo usada pelo carrinho do Comprar. A revisão ampla da política de preço promocional do carrinho, caso necessária, é uma questão comercial global do Comprar e não deve ser implementada isoladamente apenas na recompra.

## Próximo passo

**Etapa 5 — Minhas compras frequentes**

Criar:

- lista de produtos recorrentes por cliente;
- cesta favorita;
- produtos extras recorrentes;
- ranking por número de pedidos + recência;
- botão para adicionar novamente;
- validação de preço, estoque e disponibilidade atual.
