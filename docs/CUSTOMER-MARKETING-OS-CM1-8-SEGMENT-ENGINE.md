# Customer & Marketing OS — CM-1.8 Segment Engine

Atualizado em 18/09/2026.

Status: **V1 IMPLANTADA — SEGMENTOS DINÂMICOS INTEGRADOS AO CUSTOMER 360**.

## Objetivo

Segmentação precisa ser reproduzível e auditável.

Nenhum segmento do CM-1.8 depende de tag manual como fonte de verdade.

O motor recalcula a partir de:

- pedidos;
- produtos comprados;
- conversas;
- carrinhos;
- handoffs;
- qualidade cadastral;
- Customer Protection.

## Estruturas

### customer_segment_registry_v1

Catálogo dos segmentos disponíveis.

Informa:

- segment_key;
- label;
- requires_value;
- description.

### customer_segment_facts_v1

Read model determinístico por cliente.

Consolida:

- order_count;
- first_order_at;
- last_order_at;
- days_since_last_order;
- lifetime_value;
- basket_orders;
- marcas compradas;
- categorias compradas;
- sinais de mercearia;
- limpeza/lavanderia;
- higiene/beleza;
- conversas;
- atendimento humano;
- carrinho não concluído;
- endereço;
- data quality score.

### get_customer_dynamic_segments_v1

Retorna para um cliente:

- segments;
- dimensions.brands;
- dimensions.categories;
- facts;
- marketing eligibility;
- versão do motor.

### query_customer_segment_v1

Consulta uma audiência por segmento.

Segmentos com valor:

- marca;
- categoria.

Segmentos sem valor:

- comprou_alguma_vez;
- primeira_compra;
- primeiro_comprador;
- recorrente;
- mensal;
- inativo;
- alto_valor;
- comprador_cesta;
- produtos_avulsos;
- cesta_favorita;
- proximo_recompra;
- sem_compra_30d;
- sem_compra_60d;
- mercearia;
- lavanderia;
- higiene;
- cesta_basica;
- falou_nao_comprou;
- carrinho_nao_concluido;
- marketing_permitido;
- marketing_nao_permitido;
- atendimento_problema;
- baixa_qualidade_dados.

## Compatibilidade

Os segmentos comerciais anteriores não foram descartados.

A registry V2 mantém as chaves antigas consultáveis enquanto o novo engine adiciona os segmentos de Customer/Marketing OS.

Isso evita quebrar:

- Admin;
- personalização do Comprar;
- rotinas comerciais existentes.

## Marketing permitido

`marketing_permitido` não usa uma coluna estática.

A consulta chama:

`evaluate_customer_contact_eligibility_v1`

Portanto a audiência muda automaticamente quando muda:

- consentimento;
- suppression;
- pedido em andamento;
- handoff;
- interação recente;
- cooldown;
- telefone/identidade;
- status do cliente.

`marketing_nao_permitido` é o complemento operacional dessa decisão.

## Customer 360

`customer-intelligence-v1` foi conectado ao CM-1.8.

Agora:

- a listagem segura de clientes filtra por `query_customer_segment_v1`;
- o detalhe Customer 360 carrega `get_customer_dynamic_segments_v1`;
- o payload comercial preserva `legacy_segments` para compatibilidade;
- existe ação protegida `segment_registry` com registry + summary.

## Admin

Quando Customer OS seguro estiver habilitado, o filtro Clientes passa a oferecer também:

- Comprou alguma vez;
- Primeira compra;
- 30/60 dias sem compra;
- Mercearia;
- Limpeza/lavanderia;
- Higiene/beleza;
- Cesta básica;
- Falou e não comprou;
- Carrinho não concluído;
- Em atendimento/problema;
- Baixa qualidade de dados;
- Marketing permitido/bloqueado.

Quando a feature segura estiver desligada, a interface mantém somente os filtros legados. Isso evita expor novas decisões de Customer Protection por endpoint antigo.

No detalhe do cliente, a área antes chamada Perfil comercial passa a mostrar **Segmentos dinâmicos** quando os dados vêm do Customer OS seguro.

## Snapshot da implantação

No primeiro summary:

- 505 clientes avaliados;
- 31 já compraram alguma vez;
- 25 em primeira compra;
- 6 recorrentes;
- 20 com 30+ dias sem compra;
- 20 com 60+ dias sem compra;
- 44 falaram e ainda não compraram;
- 44 em atendimento/problema;
- 1 com carrinho não concluído pela regra inicial;
- 242 com baixa qualidade cadastral;
- 0 marketing permitido;
- 505 marketing não permitido.

O último resultado é propositalmente fail-closed: ainda não há consentimentos positivos reais suficientes no ledger canônico.

Os números são dinâmicos.

## Custo

CM-1.8 não usa IA.

Segmentação é SQL/código.

## Segurança

As funções de consulta do Segment Engine são server-side/service_role.

Os novos filtros completos ficam preparados para a superfície autenticada Customer OS.

Nenhum disparo externo é criado pelo Segment Engine.

## Próximo passo

CM-1.9 — Customer Commercial Profile.

Calcular perfil comercial completo com SQL/código:

- average ticket;
- days since last order;
- average repurchase interval;
- top products/categories/brands;
- brand distribution;
- recent engagement;
- marketing pressure;
- profile completeness;
- data quality score.
