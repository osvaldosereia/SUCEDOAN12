# WhatsApp Flow Cestas — Run 7 — 2026-09-09

## Objetivo

Corrigir a fonte de verdade da composição das cestas após confirmação de que a vitrine pública contém as cestas e produtos corretos.

## Decisão arquitetural

- A composição comercial oficial das cestas continua alinhada aos códigos publicados em `site/produtos-cesta-basica.json`.
- Em runtime do WhatsApp Flow, os produtos são resolvidos exclusivamente no Supabase (`public.products`).
- O Flow nunca carrega o catálogo inteiro.
- Preços individuais dos componentes da cesta permanecem ocultos.
- Produtos extras continuam exigindo catálogo vendável, preço e estoque determinísticos do Supabase.
- A IA não cria produto, preço, estoque nem regra comercial.

## Problema encontrado

A auditoria anterior confundia duas condições diferentes:

1. **composição canônica existente no Supabase**;
2. **produto fisicamente verificado/ativo para escrita transacional**.

Os SKUs das cestas da vitrine já existem em `public.products` e `basket_template_items` aponta para esses registros. Entretanto, vários registros vieram de `legacy_basket_migration` com `is_active=false`/`physically_verified=false`.

Isso deve bloquear escrita real quando a regra estrita exigir estoque/verificação, mas não deve bloquear a exibição da composição oficial no Flow.

## Implementação

Migration: `20260909114000_whatsapp_flow_storefront_composition_supabase_products_v1.sql`

### `get_whatsapp_flow_basket_editor_v2`

- lê `basket_templates` + `basket_template_items`;
- resolve nome, SKU e imagem via `public.products`;
- não expõe preço individual dos componentes;
- distingue `verified` de `canonical_unverified`;
- informa `preview_ready` separado de `cart_write_ready`;
- declara explicitamente `runtime_catalog_full_load=false`.

### Compatibilidade

`get_whatsapp_flow_basket_editor_v1` agora delega ao V2, portanto o handler comercial existente recebe a nova origem correta sem alterar o contrato do Data Exchange.

### `get_whatsapp_basket_component_readiness_v2`

Readiness separado em duas dimensões:

- `preview_ready`: composição integralmente resolvida no Supabase;
- `cart_write_ready`: todos os componentes atendem à validação rígida para escrita real.

O readiness V1 estrito foi preservado e continua sendo usado como autoridade para escrita.

## Resultado real após aplicação

- cestas ativas no WhatsApp: **9**;
- cestas resolvidas integralmente no Supabase para preview: **9/9**;
- `preview_ready=true` global;
- `cart_write_ready=false` global neste momento;
- exemplo Econômica Bonini: **14/14 componentes resolvidos no Supabase**;
- os componentes retornam SKU, nome e imagem reais do Supabase.

## Segurança preservada

Após a migration foi confirmado:

```text
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

Nenhum Flow foi exposto a cliente e nenhuma escrita comercial foi habilitada.

## Make

Auditoria encontrou ativos:

- Dona Antônia - WhatsApp Inbound Controlado v1;
- Dona Antônia - WhatsApp Outbound Event-Driven v3;
- Dona Antônia - CTA URL Cesta (configurável), on-demand;
- Cadastro 1 Foto - Categorias e Marcas Existentes - JSON Robusto - Auto Inativo v6;
- consultar no cpf.

Nenhuma alteração foi feita no Make nesta rodada porque este bloco tratou exclusivamente da fonte de verdade da composição do Flow.

## Próximo bloco

1. adaptar/confirmar o Data Exchange para usar a composição V2 no percurso CESTA → PERSONALIZAR;
2. tratar imagem WebP/AVIF para formato aceito pelo componente visual do Flow com cache server-side;
3. separar regras de remover componente das regras de aumentar quantidade, mantendo escrita strict/fail-closed;
4. continuar extras dinâmicos via Supabase, sem catálogo completo;
5. avançar homologação visual sem alterar gates.
