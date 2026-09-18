# Customer & Marketing OS — CM-1.9 Customer Commercial Profile

Atualizado em 18/09/2026.

Status: **V1 IMPLANTADA — PERFIL COMERCIAL DETERMINÍSTICO INTEGRADO AO CUSTOMER 360**.

## Objetivo

Transformar histórico bruto em um perfil comercial calculável e reutilizável sem pedir para IA fazer contas que SQL resolve melhor.

O perfil passa a concentrar:

- quantidade de pedidos;
- lifetime value;
- ticket médio;
- primeira compra;
- última compra;
- dias desde a última compra;
- intervalo médio de recompra;
- próxima recompra estimada;
- produtos principais;
- categorias principais;
- marcas principais;
- distribuição de gasto por marca;
- engajamento recente;
- pressão de marketing;
- completude do perfil;
- qualidade cadastral.

## Estruturas

### customer_commercial_profile_v1

Read model determinístico por cliente.

Reaproveita:

- customer_purchase_intelligence_v1;
- customer_segment_facts_v1;
- normalized_channel_events;
- conversations;
- marketing_attribution_touchpoints;
- customer_product_stats;
- customer_channel_identities.

Não cria cópia paralela de pedidos ou CRM.

### get_customer_commercial_profile_v1

Retorna um objeto pronto para Customer 360 com:

- métricas de compra;
- favorite basket;
- favorite payment method;
- top_products;
- top_categories;
- top_brands;
- brand_distribution;
- recent_engagement;
- marketing_pressure;
- profile_completeness;
- profile_gaps;
- data_quality_score.

### customer_commercial_profile_summary_v1

Resumo agregado da saúde comercial da base.

## Recent Engagement

Classificação inicial:

- high;
- medium;
- low;
- dormant.

É derivada de:

- mensagens inbound 7/30 dias;
- última mensagem inbound;
- conversas recentes.

Não é previsão de compra.

## Marketing Pressure

O score de 0 a 100 considera sinais de pressão já registrados:

- touchpoints 7/30 dias;
- outbound de marketing 7/30 dias;
- proactive offers;
- sales pressure level.

Classificação:

- none;
- low;
- medium;
- high.

Esse índice não concede permissão de contato. Customer Protection continua sendo o gate obrigatório.

## Profile Completeness

Score de 0 a 100 com evidências disponíveis:

- nome;
- telefone válido;
- CPF/CNPJ;
- endereço;
- identidade de canal;
- histórico comportamental;
- histórico de compras.

O perfil também devolve `profile_gaps` para permitir enriquecimento organizado.

## Afinidade

Top products, categories e brands incluem:

- quantidade de compras/pedidos;
- quantidade;
- total gasto;
- última compra;
- participação no gasto do cliente.

`brand_distribution` registra a participação percentual de cada marca conhecida no histórico.

## Customer 360

O backend seguro `customer-intelligence-v1` foi atualizado para carregar CM-1.9.

O Resumo agora apresenta:

- perfil comercial;
- qualidade cadastral;
- ritmo comercial;
- dias desde última compra;
- próxima recompra estimada;
- engajamento recente;
- pressão de marketing;
- marcas/categorias/produtos derivados do perfil comercial.

O visual não cria ações externas.

## Snapshot inicial

No primeiro summary após implantação:

- 505 clientes;
- 31 com histórico de compra;
- 6 recorrentes;
- 450 classificados como dormant pelos eventos atualmente normalizados;
- 179 perfis com completude >= 75%;
- completude média do perfil: 61,27%;
- qualidade cadastral média: 69,70%;
- 0 clientes com pressão de marketing alta.

Os números são dinâmicos.

O alto número de `dormant` é interpretado como ausência de eventos de canal normalizados suficientes para parte da base histórica, não como conclusão de desinteresse do cliente.

## IA e custo

CM-1.9 usa SQL/código.

Custo de IA: **zero**.

IA não calcula ticket, frequência, afinidade, datas ou score.

## Segurança

A função detalhada e o summary são server-only/service_role.

A view usa `security_invoker=true`.

CM-1.9 não envia mensagem, não cria campanha e não altera consentimento.

## Próximo passo oficial

CM-1.10 — Opportunity Engine.

Criar oportunidades determinísticas iniciais para:

- recompra;
- atraso de recompra;
- carrinho abandonado;
- primeira para segunda compra;
- cross-sell;
- mesma marca;
- extensão de linha;
- complemento;
- categoria ainda não explorada;
- reativação;
- produto em oferta compatível;
- estoque oportuno.

Cada oportunidade deve manter evidência, confidence, candidatos e exclusões antes de qualquer Marketing Brain.
