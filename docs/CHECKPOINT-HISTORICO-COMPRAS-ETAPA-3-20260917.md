# Checkpoint — Histórico de Compras — Etapa 3

Data: 17/09/2026  
Status: **CONCLUÍDA**

## Entregas realizadas

### Backend do Admin

A Edge Function `admin-core-v1` foi atualizada e publicada em produção na versão 3.

Novas ações:

- `customer_history`
- `customer_history_order`

A listagem de clientes também passou a retornar:

- `order_count`
- `lifetime_value`
- `last_order_at`

### Tela de clientes

Na rota **Clientes** do Admin agora há:

- quantidade de compras por cliente;
- valor acumulado;
- data da última compra;
- botão **Histórico**.

### Histórico do cliente

O painel mostra:

- quantidade de pedidos;
- valor total comprado;
- ticket médio;
- última compra;
- cesta mais comprada;
- forma de pagamento mais usada;
- frequência estimada;
- intervalo médio;
- produtos mais recorrentes;
- categorias recorrentes;
- linha do tempo de pedidos.

### Detalhe do pedido

Ao abrir um pedido do histórico são mostrados:

- número;
- data;
- total;
- status;
- pagamento;
- cesta;
- endereço usado naquele pedido;
- lista completa de itens e valores históricos.

Os dados vêm dos snapshots do pedido e não do cadastro atual.

### UI

Arquivos alterados/criados:

- `admin/app.js`
- `admin/index.html`
- `admin/customer-history-v1.css`
- `supabase/functions/admin-core-v1/index.ts`

A interface é responsiva e adaptada para celular.

## Validação

Contrato validado diretamente no Supabase com cliente contendo histórico:

- inteligência encontrada;
- histórico retornando pedidos;
- detalhe do pedido retornando corretamente;
- itens do pedido retornando corretamente.

A Edge Function publicada contém as duas novas ações e as RPCs canônicas de histórico.

## Observação de segurança

Esta etapa mantém o modelo de acesso já existente do Admin. O hardening geral de autenticação/autorização continua registrado para a etapa final de robustez; nenhuma credencial nova foi colocada no navegador.

## Próximo passo

**Etapa 4 — Repetir minha última compra no Chat Comprar**

Implementar com segurança:

- detectar cliente identificado;
- localizar última compra válida;
- oferecer a repetição sem atrapalhar o fluxo normal;
- mostrar resumo antes de adicionar;
- reconstruir cesta/carrinho com catálogo atual;
- recalcular preços e ofertas;
- validar estoque;
- identificar itens indisponíveis;
- exigir confirmação explícita.
