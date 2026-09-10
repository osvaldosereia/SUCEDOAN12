# Marketing Center — Run 15 — 2026-09-10

## Escopo

Somente Marketing da Dona Antônia, sem Make, sem rollout externo, sem IA paga e sem ativação de Instagram/Messenger/Ads.

## Auditoria prévia

- `docs/RETOMADA-DONA-ANTONIA.md` relido primeiro.
- checkpoint mais recente relido: `docs/MARKETING-CENTER-RUN14-20260910.md`.
- PR #254 mantida isolada em `feat/marketing-center-v1-20260910`; nenhuma tentativa de merge.
- PRs recentes auditadas; Flow e atendimento continuam em frentes separadas.
- CI específico do head anterior confirmado verde: `Marketing Center V1`, run 94.
- Supabase `ssbesxgaijknwsjbsbcz` auditado antes do DDL.
- runtime confirmado: Marketing OFF, `execution_mode=off`, canary 0, kill switch ON, geração/render/IA/publicação OFF e budgets 0.
- bucket `marketing-private` continua privado, 100 MB e MIME allowlist controlada.

## Implementado

### 1. Atribuição determinística append-only V10

Nova migration `marketing_attribution_foundation_v10`:

- adiciona `attribution_recording_enabled=false` ao runtime;
- cria `marketing_attribution_touchpoints` com RLS e acesso server-only;
- registra somente evidência explícita `click | conversation | order`;
- liga cada touchpoint a `asset_id`, campanha derivada do asset e canal;
- usa `evidence_key` único para idempotência;
- não aceita atribuição inferida, proximidade temporal ou decisão de IA;
- `conversation` exige pai `click` do mesmo asset/canal;
- `order` exige pai `click` ou `conversation` do mesmo asset/canal;
- impede evento com timestamp anterior ao pai;
- valida fonte de evidência em allowlist (`internal_link`, `whatsapp_conversation`, `order_system`, `manual_verified_import`);
- registra auditoria interna em `marketing_events` sempre com `external_side_effect=false`.

A gravação fica fail-closed enquanto qualquer um destes controles impedir execução:

```text
marketing.enabled=false
marketing.execution_mode=off
marketing.kill_switch=true
marketing.attribution_recording_enabled=false
```

### 2. Read model sem inferência

Nova RPC `marketing_attribution_read_model_v1`:

- conta touchpoints totais, cliques, conversas e pedidos;
- agrega por canal;
- declara explicitamente `status=deterministic_evidence_only`;
- declara `inferred_attribution=false`;
- não chama provider e não publica nada.

`marketing_metrics_read_model_v1` foi evoluída para incorporar esse objeto de atribuição em vez do placeholder `foundation_only`.

### 3. Append-only endurecido em duas camadas

Na auditoria pós-DDL foi detectado que o `service_role`, apesar do trigger append-only, ainda herdava privilégios de UPDATE/DELETE. Foi aplicada imediatamente a migration corretiva `marketing_attribution_privileges_v10_fix`:

- `service_role`: SELECT + INSERT;
- `service_role`: UPDATE=false, DELETE=false;
- `anon/authenticated`: sem SELECT;
- RPC de gravação e read model: `anon/authenticated` sem EXECUTE, `service_role` com EXECUTE;
- trigger `BEFORE UPDATE OR DELETE` continua como segunda barreira.

### 4. Homologação controlada com rollback

Teste real no Supabase, integralmente dentro de transação com `ROLLBACK`:

1. gates foram temporariamente liberados apenas dentro da transação;
2. asset descartável criado;
3. cadeia `click -> conversation -> order` registrada;
4. repetição da mesma evidência validou idempotência;
5. tentativa de UPDATE validou o guard append-only;
6. `ROLLBACK` executado;
7. auditoria posterior confirmou `0` assets de autoteste persistidos;
8. runtime voltou/permaneceu exatamente OFF.

Teste fail-closed fora da transação retornou:

```text
marketing_attribution_recording_disabled
external_side_effect=false
```

### 5. CI

Novo `scripts/test-marketing-attribution-v1.mjs` verifica:

- subgate default OFF;
- RLS/revokes;
- SECURITY INVOKER e ausência de SECURITY DEFINER;
- append-only;
- idempotência;
- regras determinísticas de encadeamento;
- ausência de endpoints/providers externos;
- `external_side_effect=false`;
- privilege hardening do service-role.

O workflow `Marketing Center V1` foi ampliado para executar esse contrato e observar as duas novas migrations.

## Estado pós-run que deve permanecer

```text
marketing.enabled=false
marketing.execution_mode=off
marketing.canary_percent=0
marketing.kill_switch=true
marketing.attribution_recording_enabled=false
marketing.generation_enabled=false
marketing.deterministic_render_enabled=false
marketing.ai_image_enabled=false
marketing.ai_video_enabled=false
marketing.publishing_enabled=false
whatsapp_status_publish_enabled=false
instagram_story_publish_enabled=false
facebook_story_publish_enabled=false
instagram_carousel_publish_enabled=false
pinterest_publish_enabled=false
google_business_publish_enabled=false
max_daily_publications=0
max_daily_ai_image_generations=0
max_daily_ai_video_seconds=0
max_daily_ai_cost_cents=0
```

Nenhum Make, Meta, Pinterest, Google ou provider de IA foi chamado; nenhuma publicação, anúncio ou gasto foi ativado.

## Próximo bloco seguro

1. transformar o contrato salvo dos slides em `render_spec` determinístico explícito e testável;
2. homologar `media_id -> temporário -> crop -> WebP` com fixture/asset descartável, mantendo renderer global OFF;
3. expor o novo read model de atribuição no Admin sem habilitar gravação;
4. preparar geradores de links/códigos internos de atribuição sem tracking externo e sem dispatcher;
5. manter todos os publicadores oficiais exclusivamente em dry-run até autorização explícita.

## Conclusão

Marketing ainda não está integralmente concluído nem homologado programaticamente. A automação recorrente deve permanecer ativa.
