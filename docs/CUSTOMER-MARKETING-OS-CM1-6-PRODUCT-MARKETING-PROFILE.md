# Customer & Marketing OS — CM-1.6 Product Marketing Profile

Atualizado em 18/09/2026.

Status: **V1 IMPLANTADA — READINESS DETERMINÍSTICO ATIVO NO MARKETING BRAIN**.

## Objetivo

O sistema precisa saber quais produtos podem ser promovidos e explicar por quê antes de qualquer IA escolher campanha.

CM-1.6 separa:

- dados operacionais do produto;
- enriquecimento comercial;
- readiness determinístico;
- ranking de oportunidade.

## Estrutura

### product_marketing_profiles

Armazena somente a camada que não deve duplicar cadastro operacional:

- product_line;
- attributes;
- benefits;
- commercial_role override;
- replenishment_type override;
- creative_angles;
- relation_candidates;
- enrichment_status;
- enrichment_source;
- enrichment_confidence;
- profile_version;
- evidence.

Preço, custo, estoque, oferta, marca, categoria e imagem continuam em `products`.

## Product Marketing Readiness

View:

`product_marketing_readiness_v1`

Calcula sem IA:

- categoria de marketing;
- subcategoria;
- imagem efetiva;
- preço efetivo;
- margem;
- price tier relativo à categoria;
- commercial role;
- replenishment type;
- creative angles básicos;
- marketing_eligible;
- exclusion_reasons;
- readiness_score.

### Requisitos hard para marketing_eligible

O produto precisa:

- estar ativo;
- estar comercialmente ativo no Bling;
- ter estoque;
- ter preço;
- ter custo;
- ter margem positiva;
- ter imagem;
- ter taxonomia;
- ter sales_category/política comercial.

Se qualquer requisito falhar, o produto continua visível para diagnóstico, mas fica fora da shortlist canônica.

## Exclusion reasons

Primeiros motivos:

- inactive;
- commercial_status_blocked;
- out_of_stock;
- missing_or_invalid_price;
- missing_cost;
- non_positive_or_unknown_margin;
- missing_image;
- missing_taxonomy;
- missing_sales_category.

Isso permite corrigir cadastro sem depender de interpretação da IA.

## Readiness score

Cada requisito hard soma para um score de 0 a 100.

O score é de prontidão de dados/comercial, não previsão de vendas.

## Price tier

O tier é relativo dentro da categoria usando distribuição de preço:

- entry;
- value;
- premium;
- top.

Isso evita usar um único corte de preço para categorias muito diferentes.

## Commercial role

Derivado inicialmente por regra:

- oferta válida → traffic_builder;
- destaque de vitrine → hero;
- is_upsell → upsell;
- margem alta → margin_builder;
- demais → core.

Pode ser sobrescrito pelo profile quando existir evidência comercial.

## Replenishment type

Quando há histórico suficiente em `customer_product_stats`, o sistema estima intervalo médio e classifica:

- frequent;
- monthly;
- periodic;
- occasional;
- unknown.

## IA

Nenhuma IA foi usada para montar readiness, score, margem, estoque, tier ou elegibilidade.

Campos não deriváveis ficam pendentes para enriquecimento posterior.

A política de custo da etapa permanece:

- determinístico primeiro;
- modelo barato para enriquecimento em volume;
- escalonamento apenas quando houver ambiguidade real.

## Resultado real do primeiro snapshot

No smoke test da implantação:

- 1.814 produtos avaliados;
- 671 marketing-ready;
- 1.143 bloqueados por pelo menos um requisito;
- readiness médio 87,48%.

Principais exclusões observadas naquele snapshot:

- commercial_status_blocked: 938;
- non_positive_or_unknown_margin: 283;
- missing_cost: 275;
- out_of_stock: 211;
- inactive: 128;
- missing_sales_category: 100;
- missing_or_invalid_price: 72;
- missing_image: 37.

Esses números são dinâmicos e devem ser recalculados.

## Shortlist V2

Criada:

`marketing_product_shortlist_v2`

Ela somente considera produtos `marketing_eligible=true`.

O ranking continua determinístico e considera:

- margem;
- estoque;
- oferta;
- readiness;
- commercial role;
- enriquecimento;
- antirrepetição de campanha;
- penalidade de estoque baixo.

## Marketing Brain

`admin-marketing-brain-v1` já foi migrado para usar a shortlist V2.

O endpoint de shortlist também retorna o resumo de readiness.

No Admin de Marketing, a área de Oportunidades passa a mostrar:

- quantidade pronta;
- quantidade bloqueada;
- readiness médio;
- readiness do produto no card.

A IA estratégica continua com gate próprio e orçamento fechado conforme política já existente.

## Segurança

`product_marketing_profiles`:

- RLS habilitado;
- sem acesso anon/authenticated;
- escrita somente server-side.

Funções de profile/readiness destinadas ao backend ficam limitadas a service_role.

## Próximo passo

CM-1.7 — Product/Brand Graph:

- SAME_LINE;
- COMPLEMENTARY;
- SUBSTITUTE;
- UPSELL;
- DOWNSELL;
- COMPATIBLE_BRAND;
- BOUGHT_TOGETHER.

As relações devem registrar origem, confiança, versão e evidência. IA não vira verdade automática.
