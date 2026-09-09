# DECISÃO — WhatsApp Flow V2 em produção — 09/09/2026

> **Documento de decisão mais recente para o WhatsApp Flow comercial da Dona Antônia.**
>
> Para qualquer conflito com snapshots de 08/09/2026 em `docs/RETOMADA-DONA-ANTONIA.md` ou documentos anteriores, **este documento prevalece exclusivamente no escopo WhatsApp Flow / Data Exchange / rollout comercial**. Não altera os gates de Bling, fiscal, financeiro, logística ou Driver App.

## Decisão do proprietário

O proprietário autorizou explicitamente em 09/09/2026 o rollout de **100% do WhatsApp Flow comercial**, desde que validado e pronto. A autorização foi persistida no Supabase e o guard de rollout passou a exigir essa autorização persistida.

Bling continua separado e **OFF**.

## Flow comercial atual

```text
definition_slug=flow-cestas-comercial-v2
Meta Flow ID=1539877778181619
Meta name=Dona Antônia - Cestas Comercial V2
Meta status=PUBLISHED
Meta validation_errors=[]
Flow JSON=7.3
Data API=3.0
handler=handle_whatsapp_flow_commercial_exchange_v9
Edge=whatsapp-flow-data-exchange-v1 version 13 ACTIVE
```

O Flow V1 (`flow-cestas-comercial-v1`, Meta ID `1538860004926321`) permanece apenas para **compatibilidade de sessões antigas**. Novas sessões resolvem deterministicamente para V2 via `get_whatsapp_current_commercial_flow_slug_v1()`.

## Gates atuais autorizados

```text
whatsapp_live_canary_percent=100
experience_orchestrator_enabled=true
whatsapp_flow_data_exchange_enabled=true
whatsapp_flow_send_enabled=true
whatsapp_flow_commercial_write_enabled=true
bling_order_sync_enabled=false
```

Não restaurar automaticamente o snapshot antigo de 1%/OFF. O trigger `guard_whatsapp_flow_rollout_v1` valida a autorização persistida. Bling somente pode ser ligado com autorização separada (`bling_sync_authorized`).

## Fonte oficial de dados

**Supabase é o banco operacional oficial.**

```text
basket_templates            -> cadastro das 9 cestas
basket_template_items       -> composição das cestas
products                    -> produtos
Admin v3                    -> gestão operacional destes dados
```

Firebase/Purebase não é fonte de runtime do WhatsApp Flow.

### Política de componentes da cesta

Uma cesta ativa no WhatsApp e sua composição no Supabase são a autoridade do bundle.

Para a cesta base ficar pronta para escrita:

- `basket_templates.is_active=true`;
- `basket_templates.is_whatsapp_active=true`;
- preço comercial da cesta > 0;
- composição não vazia;
- todos os `product_id` da composição resolvem em `supabase.products`.

Os flags legados de venda individual (`products.is_active`, `physically_verified`, `is_whatsapp_active`, estoque) **não bloqueiam um componente pertencente a uma cesta oficial**. Eles continuam como telemetria/advisory; nunca inventar ou alterar esses flags apenas para deixar readiness verde.

Readiness de 09/09/2026 após V31:

```text
ready_for_real_homologation=true
blockers={}
ready_baskets=9
total_baskets=9
```

### Política de produtos extras / avulsos

Produtos adicionados fora da cesta continuam estritos e precisam simultaneamente de:

```text
physically_verified=true
is_active=true
is_whatsapp_active=true
price configurado
stock>0
```

A busca e a gravação foram alinhadas na V32 para usar a mesma política.

## Personalização V2

A tela `PERSONALIZAR_A` usa **uma única tela** para toda a composição da cesta:

- até 27 Dropdowns;
- slots `q01..q16` = **Alimentos**;
- slots `q17..q27` = **Higiene e Limpeza**;
- quantidade original já vem pré-selecionada;
- `0 · Retirar` quando permitido e quando há regra segura de preço;
- preço individual de componente não é exibido;
- uma foto compacta da cesta no topo;
- um único botão **Atualizar cesta**;
- após o clique, todas as quantidades são gravadas em lote e o carrinho é recalculado **uma vez**.

Smoke V27 confirmou `recalculation_count=1` para alteração simultânea de vários componentes.

## Regra de preço da personalização

O valor base comercial da cesta permanece predefinido e não é substituído pela soma dos componentes.

Ajustes:

```text
redução/retirada -> remove_unit_delta ou fallback -products.price
acréscimo        -> add_unit_delta ou fallback +products.price
sem alteração    -> delta 0
```

A margem/diferença estrutural embutida no preço base não é exposta ao cliente.

### Componentes sem preço unitário

Há 10 produtos legados distintos usados em alguma cesta que ainda não têm preço unitário oficial confiável no Supabase e não possuem duplicata exata segura por EAN/SKU/nome. Não inventar preço.

Enquanto não forem corrigidos no Admin v3, esses componentes aparecem na composição mas permanecem em **quantidade fixa**:

- Apti Macarrão Lámen Carne 70g;
- Apti Mistura para Bolo Chocolate 400g;
- Bucha de Lavar Louça Unidade;
- Dona Dê Farinha de Mandioca Branca 1kg;
- Frisco Suco em Pó Laranja 18g;
- Frisco Suco em Pó Uva 18g;
- Ovo - 1 Duzia;
- Sabão em Pó OMO 700g;
- Tio Jonas Tempero Completo com Pimenta 300g;
- Ypê Sabão em Barra 800g.

## Imagens / performance

A Edge v13 reduz carga mobile:

```text
imagem de cesta/detalhe: máximo aproximado 80 KB
tumbnail de seletor/card: máximo aproximado 45 KB
target edge: 360 px / 260 px
JPEG quality: 66 / 58
```

A tela de personalização não tenta colocar foto individual em 27 componentes. Isso evita payload grande e respeita os limites do WhatsApp Flow. Produtos adicionais continuam podendo usar miniaturas compactas em resultados curtos.

## Homologações concluídas

- Meta oficial: `validation_errors=[]`;
- Meta health: `AVAILABLE` para Flow, WABA, Business e App;
- Flow V2: `PUBLISHED`;
- Edge v13: `ACTIVE`;
- token de sessão nova sem slug explícito resolveu para V2/Meta ID `1539877778181619`;
- 9/9 cestas canônicas prontas;
- `0` em componente de cesta suportado; add-on continua sem quantidade zero persistida;
- smoke de duas alterações simultâneas passou e recalculou uma vez;
- sessões/carrinho sintéticos de homologação foram abandonados/limpos após os testes;
- cenários Make temporários de criação/validação/metadata/publicação V25 estão OFF.

## Migrations desta decisão

```text
20260909182737_whatsapp_flow_bulk_selection_single_recalc_v27.sql
20260909182919_whatsapp_flow_persisted_owner_authorization_guard_v29.sql
20260909183643_whatsapp_flow_v2_default_routing_v30.sql
20260909183845_whatsapp_basket_canonical_supabase_readiness_v31.sql
20260909184425_whatsapp_standalone_product_channel_consistency_v32.sql
```

Também preservar as migrations imediatamente anteriores que criaram o personalizador V25 e quantidade zero V26.

## Regras que continuam inalteradas

- somente Cuiabá e Várzea Grande;
- entrega própria;
- pagamento somente na entrega: PIX, dinheiro, cartão na entrega, alimentação/refeição conforme configuração comercial;
- componente de cesta não mostra preço individual;
- Bling order sync continua OFF até homologação/autorização separada;
- emissão fiscal não é ativada por esta decisão;
- nenhum módulo financeiro/logístico/fiscal dormente é ativado por esta decisão.

## Próxima evolução recomendada

1. completar no Admin v3 os preços unitários oficiais dos 10 componentes hoje fixos;
2. acompanhar erros/latência reais da V2 e payloads de imagem;
3. manter V1 apenas enquanto houver necessidade de compatibilidade de sessões antigas;
4. qualquer V3 futura deve ser criada/validada em paralelo e só virar `default_for_new_sessions=true` após smoke equivalente.
