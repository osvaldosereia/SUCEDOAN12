# Customer & Marketing OS — CM-1.3 Customer 360 Operacional

Atualizado em 18/09/2026.

Status: **BACKEND E UI PREPARADOS — FEATURE FLAG SEGURA AINDA DESLIGADA ATÉ HOMOLOGAÇÃO MANUAL DO PIN**.

## Objetivo

Abrir um cliente e entender rapidamente:

- quem é;
- como pode ser contatado;
- como foi identificado;
- o que comprou;
- produtos, marcas e categorias mais relevantes;
- como interage;
- carrinhos recentes;
- preferências observadas;
- consentimentos;
- segmentos;
- marketing recebido/atribuído;
- conflitos de identidade;
- qualidade dos dados.

## Backend canônico

O Customer 360 continua dentro de `customer-intelligence-v1`, com JWT obrigatório e validação de `admin_users`.

Não foi criado um CRM paralelo.

A ação `customer_360` agora reúne:

- `customers`;
- `customer_phones`;
- `customer_emails`;
- `customer_addresses`;
- `customer_channel_identities`;
- `customer_channel_consents`;
- purchase intelligence;
- segmentos comerciais;
- `customer_product_stats` + produto;
- conversas;
- carrinhos;
- comportamento;
- handoffs;
- service memory;
- preferências de substituição;
- marketing touchpoints;
- marketing events;
- timeline consolidada;
- avaliações do Identity Resolver.

## Resumo calculado sem IA

Campos derivados deterministicamente:

- lifecycle;
- customer_since;
- last_interaction_at;
- last_purchase_at;
- order_count;
- lifetime_value;
- average_ticket;
- open_cart.

Lifecycle inicial:

- sem compras → prospect;
- segmento inativo → inactive;
- primeiro comprador → new_customer;
- recorrente/mensal → recurring;
- demais compradores → active.

## Afinidade comercial

Marcas e categorias são agregadas a partir do histórico real de `customer_product_stats`.

Nenhum modelo de IA é chamado para montar a ficha.

Isso mantém:

- custo praticamente zero por abertura;
- resultado explicável;
- comportamento estável;
- ausência de alucinação.

## Qualidade de dados

O score atual considera presença de:

- nome;
- telefone;
- documento;
- endereço;
- canal verificado;
- histórico de compra;
- consentimento de marketing positivo.

É um indicador de completude, não um score de valor do cliente.

## Admin

A interface protegida foi ampliada para mostrar:

- ciclo de vida;
- completude;
- última interação;
- confiança da identidade;
- identidades de canal;
- consentimentos;
- produtos;
- marcas;
- categorias;
- conversas;
- carrinhos;
- preferências e memória;
- marketing;
- timeline;
- histórico de pedidos.

Existe também o monitor de conflitos de identidade.

A revisão humana **não faz merge**; registra apenas a decisão da avaliação.

## Segurança

A nova área continua atrás de:

`customerOsSecureUiEnabled=false`

Motivo: o backend já está pronto, mas o primeiro login precisa ser homologado manualmente com o PIN administrativo real no navegador.

A feature flag só deve ser ligada após esse teste.

## Próximo passo

CM-1.4 — Event Collector:

1. manter `normalized_channel_events` como event core de canal;
2. registrar eventos relevantes do Comprar/carrinho/checkout;
3. integrar pedidos/Bling;
4. integrar atendimento humano;
5. criar idempotência/evidence key consistente;
6. fazer a timeline crescer automaticamente sem depender de consultas ad hoc.
