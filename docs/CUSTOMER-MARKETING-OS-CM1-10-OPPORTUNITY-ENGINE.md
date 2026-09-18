# Customer & Marketing OS — CM-1.10 Opportunity Engine

Atualizado em 18/09/2026.

Status: **V1 IMPLANTADA — OPORTUNIDADES DETERMINÍSTICAS EM OBSERVAÇÃO, SEM ENVIO**.

## Objetivo

Detectar oportunidades comerciais a partir de fatos já calculados, sem pedir para IA inventar:

- público;
- timing;
- produto;
- motivo;
- confiança.

CM-1.10 não cria campanha, template ou mensagem.

## Estrutura

Tabela:

`customer_marketing_opportunities`

Cada oportunidade registra:

- opportunity_key;
- customer_id;
- strategy_key;
- title;
- audience_rule;
- evidence;
- product_candidates;
- confidence;
- exclusions;
- estimated_audience;
- status;
- source;
- engine_version;
- first_detected_at;
- last_evaluated_at;
- expires_at;
- trilha de dismissal/conversão futura.

Estados:

- suggested;
- suppressed;
- dismissed;
- expired;
- converted.

## Estratégias V1

Implementadas inicialmente:

- repurchase_due;
- repurchase_overdue;
- first_to_second_purchase;
- cart_abandoned;
- cross_sell;
- brand_extension;
- offer_affinity;
- reactivation.

## Fontes de evidência

O engine reutiliza:

- CM-1.9 Customer Commercial Profile;
- CM-1.8 Segment Engine;
- CM-1.7 Product/Brand Graph;
- CM-1.6 Product Marketing Readiness;
- customer_product_stats;
- carrinhos;
- Customer Protection.

## Guardrails

A oportunidade pode existir comercialmente e ainda assim estar bloqueada para ação.

Exclusões V1:

- marketing_not_allowed;
- high_marketing_pressure;
- very_low_profile_completeness.

Quando existe exclusão, a oportunidade fica `suppressed`.

Isso é proposital: o sistema pode aprender que existe uma oportunidade sem confundir isso com permissão para contactar o cliente.

## Precisão V2

O primeiro smoke test revelou dois riscos de falso positivo.

### Pedidos muito próximos

Compras no mesmo dia podiam produzir intervalo médio abaixo de 1 dia e gerar falsa “recompra atrasada”.

Correção:

- repurchase_due/overdue exigem intervalo médio >= 3 dias.

### Carrinho antigo

Um carrinho abandonado muito antigo podia continuar aparecendo.

Correção:

- recuperação de carrinho só considera carrinho atualizado nos últimos 7 dias.

### Afinidade de oferta

Categorias amplas como “Para Casa” não podem, sozinhas, justificar oferta personalizada.

Prioridade V2:

1. marca;
2. subcategoria;
3. categoria somente quando não for uma categoria ampla/genérica.

### Product Graph

Candidatos são deduplicados por target_product_id para evitar o mesmo item aparecer mais de uma vez por relações diferentes.

## Materialização

Funções:

- `evaluate_customer_opportunities_v1`: avaliação ao vivo, sem escrita;
- `refresh_customer_opportunities_v1`: materializa um cliente;
- `refresh_customer_opportunities_batch_v1`: materializa em lote;
- `get_customer_opportunities_v1`: consulta persistida;
- `opportunity_engine_summary_v1`: resumo operacional.

## Bootstrap inicial

Foram processados 31 clientes com compra ou carrinho relevante.

Resultado do primeiro materialize:

- 75 oportunidades detectadas;
- 31 clientes com oportunidade;
- 0 actionable;
- 75 suppressed.

Distribuição naquele snapshot:

- cross_sell: 27;
- offer_affinity: 27;
- reactivation: 19;
- brand_extension: 1;
- first_to_second_purchase: 1.

O fato de 100% estarem suppressed é coerente com o estado atual do Consent Ledger/Customer Protection: não existe autorização positiva suficiente para marketing na base.

Isso confirma o fail-closed.

## Customer 360

O endpoint seguro agora avalia as oportunidades atuais ao abrir o cliente.

O Resumo mostra:

- título;
- confiança;
- produtos candidatos;
- disponível/bloqueada;
- motivo do bloqueio.

A tela informa explicitamente que esse bloco não executa ação.

## Segurança

Tabela e funções:

- RLS;
- server-only;
- sem anon/authenticated;
- service_role para backend.

CM-1.10 tem `external_side_effect=false`.

## IA e custo

IA: **zero**.

SQL/código decide:

- timing;
- evidência;
- confiança inicial;
- exclusões;
- produto candidato.

## Próximo passo oficial

CM-1.11 — Marketing Brain em OBSERVE/SUGGEST.

A IA receberá uma oportunidade já calculada e poderá transformar isso em brief publicitário estruturado.

Ela não poderá:

- alterar consentimento;
- liberar suppression;
- enviar mensagem;
- inventar estoque/preço/margem;
- escolher cliente fora da oportunidade;
- executar campanha.

Política prevista:

- Luna para classificação/organização;
- Terra para estratégia publicitária;
- Sol somente por exceção;
- custo registrado por execução;
- teto por tarefa;
- nenhuma execução externa no primeiro modo.
