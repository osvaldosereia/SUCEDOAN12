# Customer & Marketing OS — CM-1.7 Product/Brand Graph

Atualizado em 18/09/2026.

Status: **V2 IMPLANTADA — GRAFO DETERMINÍSTICO ATIVO, IA NÃO É FONTE DE VERDADE**.

## Objetivo

Criar relações reutilizáveis entre produtos e marcas para:

- cross-sell;
- substituição;
- upsell/downsell;
- mesma linha;
- compatibilidade de marca;
- produtos comprados juntos;
- campanhas futuras;
- sugestões no atendimento.

## Estrutura canônica

Tabela:

`product_relation_edges`

Cada aresta registra:

- source_product_id;
- target_product_id;
- relation_type;
- confidence;
- source_kind;
- source_key;
- status;
- evidence;
- relation_version;
- first_seen_at;
- last_seen_at;
- revisão humana.

Relações:

- SAME_LINE;
- COMPLEMENTARY;
- SUBSTITUTE;
- UPSELL;
- DOWNSELL;
- COMPATIBLE_BRAND;
- BOUGHT_TOGETHER.

Fontes:

- rule;
- purchase;
- ai;
- human.

IA pode futuramente sugerir uma relação, mas não ganha status `active` automaticamente.

## Funções

### get_product_relation_candidates_v1

Gera candidatos a partir de:

- taxonomia operacional;
- marca;
- faixa de preço;
- Product Marketing Readiness;
- coocorrência real em pedidos.

### materialize_product_relation_candidates_v1

Persiste sugestões/arestas idempotentes.

Autoativação conservadora:

- SAME_LINE somente com taxonomia precisa e confiança alta;
- BOUGHT_TOGETHER somente com pelo menos 2 pedidos de evidência e confiança mínima.

Demais relações ficam como `suggested`.

### get_product_relations_v1

Consulta padronizada para os demais módulos.

Inclui relações simétricas na direção inversa quando aplicável.

### review_product_relation_v1

Owner/operator pode:

- aprovar;
- rejeitar;
- registrar observação.

A aprovação humana passa a ser origem `human`, com trilha de auditoria.

### brand_relation_graph_v1

Agrega as arestas de produtos por par de marcas e tipo de relação.

## Correção de precisão V2

O primeiro bootstrap revelou um problema importante: usar apenas a categoria de cliente, que é intencionalmente ampla, podia gerar relações falsas.

Exemplo detectado durante a validação:

- escova dental Colgate;
- desodorante NIVEA;

ambos estavam em `Para Você > Higiene Pessoal`, portanto uma regra muito ampla poderia tratá-los como substitutos.

A V2 passou a exigir a **folha da taxonomia operacional** (`products.subsubcategory`) para SAME_LINE, SUBSTITUTE, UPSELL, DOWNSELL e COMPATIBLE_BRAND.

Resultado do teste após a correção:

- 0 arestas de regra cruzando folhas operacionais nesses tipos;
- 0 arestas automáticas V1 obsoletas restantes;
- 0 BOUGHT_TOGETHER ativo com menos de 2 pedidos de evidência.

As arestas V1 não revisadas foram removidas e regeneradas. Relações já revisadas por humano seriam preservadas.

## Confidence de compra

A V1 dava peso excessivo quando um produto aparecia uma única vez e, por acaso, junto de outro.

A V2 usa:

- support ratio;
- quantidade absoluta de pair_orders;
- evidence_strength com saturação progressiva.

Assim um único pedido não recebe confiança quase máxima.

## Bootstrap inicial

Foram materializados candidatos para os 50 produtos marketing-ready com maior prioridade.

Snapshot após V2:

- 526 arestas;
- 147 ativas;
- 379 sugeridas.

Distribuição naquele momento:

- SAME_LINE active: 104;
- BOUGHT_TOGETHER active: 43;
- BOUGHT_TOGETHER suggested: 87;
- COMPLEMENTARY suggested: 23;
- SUBSTITUTE suggested: 93;
- UPSELL suggested: 102;
- DOWNSELL suggested: 74.

Os números são dinâmicos.

## Segurança

`product_relation_edges`:

- RLS ativo;
- sem acesso anon/authenticated;
- funções operacionais limitadas a service_role;
- revisão exige admin owner/operator.

## Custo

O grafo V1/V2 não usa IA.

É SQL + dados existentes.

## Próximo passo

CM-1.8 — Segment Engine.

Segmentos devem ser recalculáveis por regra e nunca depender de etiquetas manuais como fonte primária.
