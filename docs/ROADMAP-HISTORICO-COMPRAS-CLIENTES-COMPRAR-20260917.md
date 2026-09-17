# Projeto — Histórico de Compras e Recompra Inteligente no Chat Comprar

Data: 17/09/2026  
Repositório: `osvaldosereia/SUCEDOAN12`

## Decisão de produto

O PapoAI continua responsável pelo atendimento WhatsApp e pela IA nativa dele.

Nosso escopo é o **Chat Comprar + Supabase**. O webhook do PapoAI serve apenas para identificar o contato, localizar o cadastro pelo telefone e abrir o Comprar com uma sessão opaca já ligada ao cliente quando houver correspondência segura.

Nenhuma automação nova deste projeto usa Make.

## Objetivo

Construir um histórico comercial confiável de cada cliente para:

- facilitar checkout;
- permitir repetir a última compra;
- mostrar compras frequentes;
- priorizar cesta e produtos mais relevantes;
- melhorar ofertas dentro do Comprar;
- dar contexto útil à equipe no Admin;
- preparar, no futuro, segmentação e recompra baseada em comportamento real.

O histórico comercial deve vir de dados reais de pedidos. A IA não inventa preferências.

## Estado atual verificado

A base já possui:

- `customers`;
- `orders`;
- `order_items`;
- vínculo por `customer_id`;
- snapshots do pedido e dos itens;
- campos em `customers` como `last_order_at`, `order_count` e `lifetime_value`;
- identificação do cliente no Comprar via webhook PapoAI → Supabase;
- checkout que pode pular a digitação do telefone quando o cliente já está identificado.

No levantamento de 17/09/2026 havia 504 clientes, 17 pedidos locais e 423 itens de pedidos; 10 clientes já tinham histórico associado. O histórico antigo do Bling ainda será uma fonte futura de enriquecimento.

## Princípios de arquitetura

1. **Fonte de verdade:** `orders + order_items`. Não criar uma segunda tabela duplicando todos os pedidos apenas para chamar de “histórico”.
2. **Snapshots imutáveis:** pedido antigo conserva nome, quantidade e valor praticados naquele momento.
3. **Preço atual na recompra:** repetir pedido nunca reaproveita preço histórico como preço de venda. O carrinho é recriado com preço, estoque e oferta atuais.
4. **Identidade segura:** histórico é ligado por `customer_id`. Telefone/CPF entram apenas como chaves auxiliares de reconciliação quando necessário.
5. **Ambiguidade não é resolvida automaticamente:** correspondência duvidosa vai para revisão.
6. **Supabase First:** views/RPCs/Edge Functions/Cron/Triggers/Outbox conforme a necessidade; sem Make.
7. **Chat simples:** histórico melhora a experiência, mas não transforma o Comprar em um sistema pesado.
8. **Dados pessoais mínimos:** não criar inferências sensíveis. O projeto usa somente comportamento comercial necessário.
9. **Cancelamentos/devoluções permanecem no histórico:** mas não contam como receita válida quando a métrica exigir compra efetiva.

---

# Etapas de implantação

## Etapa 0 — Auditoria e contrato do histórico

Status: **PRÓXIMA**

### Entregas

- Mapear todos os pontos que gravam `orders` e `order_items`.
- Confirmar quais status representam pedido válido, cancelado, devolvido e entregue.
- Definir regra única para `order_count`, `lifetime_value`, `last_order_at` e ticket médio.
- Validar integridade dos 17 pedidos locais atuais.
- Conferir se todo pedido novo do Comprar grava `customer_id` sempre que o cliente estiver identificado.
- Criar testes de regressão do contrato do histórico.

### Critério de aceite

Nenhum pedido válido novo pode ficar sem vínculo com cliente quando o cliente já estiver identificado.

---

## Etapa 1 — Camada canônica de histórico

### Entregas

Criar consultas/RPCs para:

- histórico paginado por cliente;
- detalhe de um pedido;
- itens de cada pedido;
- última compra válida;
- última cesta comprada;
- últimos produtos comprados;
- totais por período;
- status comercial do pedido.

Criar uma visão consolidada de leitura, sem duplicar os pedidos.

### Regra

A camada deve distinguir:

- compra válida;
- cancelada;
- devolvida;
- ainda em andamento.

### Critério de aceite

Dado um `customer_id`, o sistema retorna uma linha do tempo comercial coerente e reproduzível.

---

## Etapa 2 — Resumo inteligente do cliente

### Entregas

Criar um resumo derivado contendo, no mínimo:

- primeira compra;
- última compra;
- dias desde a última compra;
- quantidade de pedidos válidos;
- valor total comprado;
- ticket médio;
- cesta mais comprada;
- última cesta;
- forma de pagamento mais usada;
- última forma de pagamento;
- produtos mais comprados;
- produtos comprados com maior frequência;
- categorias mais compradas;
- intervalo médio entre compras;
- frequência estimada de recompra.

### Estratégia

Usar view/materialized view ou tabela-resumo derivada atualizada por trigger/job, conforme custo e volume real.

### Critério de aceite

O resumo de um cliente precisa poder ser reconstruído integralmente a partir de `orders + order_items`.

---

## Etapa 3 — Histórico no Admin

### Entregas

Na ficha do cliente:

- cabeçalho com total de compras, última compra, ticket médio e valor acumulado;
- lista cronológica de pedidos;
- cesta comprada;
- produtos do pedido;
- valor;
- pagamento;
- status;
- endereço usado naquele pedido, quando necessário para operação;
- botão para abrir detalhe;
- resumo de produtos/cestas recorrentes.

### UX

Mobile first, simples e sem excesso de informação.

### Critério de aceite

A equipe consegue entender o relacionamento comercial do cliente em poucos segundos, sem consultar Bling manualmente para pedidos já locais.

---

## Etapa 4 — “Repetir minha última compra” no Comprar

### Entregas

Para cliente identificado:

- detectar última compra válida;
- mostrar opção discreta no início do Comprar;
- exibir resumo antes de repetir;
- recriar carrinho com catálogo atual;
- recalcular preços;
- revalidar estoque;
- manter ofertas atuais;
- informar itens indisponíveis;
- não adicionar nada sem confirmação explícita.

### Regra para cesta

Se a compra anterior tinha cesta:

- usar a cesta atual equivalente;
- recuperar extras separadamente;
- respeitar preço comercial atual da cesta;
- não somar preços históricos dos componentes.

### Critério de aceite

O cliente consegue reconstruir a última compra em poucos toques sem carregar valores antigos incorretos.

---

## Etapa 5 — “Minhas compras frequentes”

### Entregas

Criar uma área simples com:

- produtos recorrentes;
- cesta favorita;
- últimos produtos extras;
- frequência aproximada;
- botão “Adicionar novamente”.

### Ranking inicial

Priorizar:

1. número de pedidos distintos em que o produto apareceu;
2. recência;
3. quantidade total;
4. disponibilidade atual.

Não priorizar apenas por quantidade bruta.

### Critério de aceite

A lista representa hábito real e não é dominada por uma compra atípica de grande quantidade.

---

## Etapa 6 — Início personalizado do Comprar

### Entregas

Quando o cliente estiver identificado e tiver histórico, o início pode mostrar:

- “Repetir minha última compra”;
- “Minhas compras frequentes”;
- “Comprar novamente minha cesta”;
- “Começar uma compra nova”.

Cliente sem histórico continua vendo o fluxo atual.

### Regra de simplicidade

Nunca mostrar mais opções do que o necessário. Se só houver uma informação útil, mostrar somente ela.

### Critério de aceite

Personalização reduz passos sem esconder Cestas Básicas, Ofertas, Para Você e Para Casa.

---

## Etapa 7 — Ofertas personalizadas dentro do Comprar

### Entregas

Usar o histórico somente para ordenar ofertas já válidas:

- produto que o cliente já compra;
- categoria recorrente;
- cesta compatível;
- produto complementar ao carrinho atual.

### Restrições

- histórico não cria preço;
- oferta só existe se estiver ativa no catálogo;
- estoque atual sempre vence histórico;
- manter opção de ver ofertas gerais.

### Critério de aceite

Cliente recebe prioridade para ofertas relevantes sem perder acesso ao catálogo geral.

---

## Etapa 8 — Importação do histórico antigo do Bling

### Objetivo

Dar profundidade ao histórico dos mais de 500 clientes atuais.

### Entregas

- pesquisar/validar API oficial do Bling usada pela conta;
- importar pedidos antigos em lotes pequenos;
- idempotência por ID externo;
- vincular cliente por `bling_contact_id` quando disponível;
- usar CPF/telefone apenas para reconciliação controlada;
- criar fila de ambiguidades;
- preservar snapshots históricos;
- marcar origem do pedido como Bling/importado;
- impedir duplicação de pedidos que já existam localmente.

### Estratégia de implantação

1. importar primeiro uma amostra pequena;
2. validar clientes e totais;
3. ampliar por lotes;
4. reconciliar divergências;
5. somente depois liberar o histórico importado para personalização.

### Critério de aceite

Reexecutar a importação não cria duplicatas e não altera pedidos locais corretos.

---

## Etapa 9 — Segmentação comercial derivada

### Entregas

Criar segmentos calculados, não manuais:

- primeiro comprador;
- recorrente;
- mensal;
- inativo;
- alto valor;
- comprador de cesta;
- comprador de produtos avulsos;
- cliente com cesta favorita;
- cliente próximo do intervalo típico de recompra.

### Uso inicial

Somente Admin e personalização do Comprar.

Qualquer contato proativo futuro exige regra própria de consentimento e canal; não faz parte desta etapa.

### Critério de aceite

Todo segmento pode ser explicado por regra objetiva baseada em pedidos.

---

## Etapa 10 — Métricas e aprendizado do produto

### Métricas

- % de clientes identificados com histórico;
- uso de “repetir última compra”;
- conversão de recompra;
- tempo até finalizar;
- ticket de recompra;
- itens indisponíveis em recompra;
- uso de compras frequentes;
- conversão de oferta personalizada;
- clientes recuperados pelo histórico importado.

### Critério de aceite

Conseguimos comparar experiência nova vs. fluxo normal sem depender de interpretação subjetiva.

---

## Etapa 11 — Robustez, privacidade e manutenção

### Entregas

- índices necessários;
- paginação;
- limites de consulta;
- testes de carga;
- idempotência;
- auditoria de reconciliação;
- tratamento de cliente mesclado/duplicado;
- correção de vínculos errados;
- exclusão lógica/cancelamento preservando histórico;
- documentação de origem de cada dado;
- rotina para recalcular resumos quando necessário.

### Critério de aceite

O histórico continua correto mesmo após importação, cancelamento, alteração de catálogo ou correção cadastral.

---

# Rodadas de programação sugeridas

## Rodada 1 — Fundação
Etapas 0 e 1.

## Rodada 2 — Inteligência de cliente
Etapa 2.

## Rodada 3 — Admin
Etapa 3.

## Rodada 4 — Repetir compra
Etapa 4.

## Rodada 5 — Compras frequentes
Etapas 5 e 6.

## Rodada 6 — Personalização comercial
Etapa 7.

## Rodada 7 — Histórico legado
Etapa 8.

## Rodada 8 — Segmentação e métricas
Etapas 9 e 10.

## Rodada 9 — Hardening final
Etapa 11.

---

# Prioridade prática

A sequência obrigatória é:

**histórico confiável → resumo do cliente → Admin → repetir última compra → compras frequentes → personalização → importação Bling → segmentação.**

Não começar por recomendações, remarketing ou IA antes de a base histórica estar correta.

# Primeira próxima ação

Executar a **Etapa 0 — Auditoria e contrato do histórico**, sem alterar comportamento do cliente, e produzir um relatório técnico do que hoje já grava pedidos, como os status funcionam e quais lacunas existem antes da primeira migration do projeto.
