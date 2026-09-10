# Marketing Center — Run 2 — 10/09/2026

## Estado herdado

A fundação da Run 1 permanece isolada na PR #254. O CI `Marketing Center V1` estava verde antes desta rodada. `main` avançou em frentes de WhatsApp Flow e estúdio de fotos de produtos; nenhum desses arquivos foi alterado nesta rodada.

O Supabase já continha `marketing_center_foundation_v1`, `marketing_default_presets_v1` e `marketing_performance_hardening_v1`.

## Entregue nesta rodada

### Renderer determinístico real de imagem

Adicionado `scripts/marketing-render-deterministic-v1.mjs` usando Sharp 0.34.3.

Características:

- renderiza WebP real;
- canvas entre 320 e 2160 px;
- fundo configurável;
- camadas `image`, `text` e `rect`;
- foto local com `contain/cover/fill/inside/outside`;
- texto, preço, CTA e identidade podem ser compostos sem IA;
- qualidade WebP configurável dentro de faixa segura;
- limita número de camadas;
- bloqueia URLs remotas e path traversal no renderer;
- não chama IA, API externa, Make ou canal de publicação;
- retorna explicitamente `external_side_effect=false` e `ai_used=false`.

Adicionado `scripts/test-marketing-render-v1.mjs`, que cria uma foto sintética de produto, renderiza uma oferta 1080×1080 em WebP, valida formato/dimensões/tamanho e confirma bloqueio de origem remota.

O workflow `Marketing Center V1` agora instala Sharp fixado em `0.34.3` e executa esse teste além do contrato de segurança existente.

### Media registry + fila de renderização

Migration versionada:

- `20260910054800_marketing_media_render_queue_v2.sql`

Migration aplicada ao Supabase como:

- `marketing_media_render_queue_v2`

Novas tabelas server-only:

- `marketing_media_objects`: versões de source/preview/output/thumbnail/poster e metadados de tamanho/hash/duração;
- `marketing_render_jobs`: fila idempotente para `deterministic_image`, `economical_video`, `ai_image`, `ai_video`.

Novas RPCs service-role only:

- `queue_marketing_render_v2`;
- `claim_marketing_render_jobs_v2` com `FOR UPDATE SKIP LOCKED` e lease;
- `complete_marketing_render_v2`.

Todas as tabelas novas têm RLS ligado e acesso direto de `anon/authenticated` revogado. As RPCs também estão sem EXECUTE para `anon/authenticated` e liberadas somente para `service_role`.

### Fail-closed comprovado

Auditoria pós-DDL:

```text
enabled=false
kill_switch=true
canary_percent=0
generation_enabled=false
deterministic_render_enabled=false
ai_image_enabled=false
ai_video_enabled=false
publishing_enabled=false
render_jobs=0
media_objects=0
anon_queue=false
authenticated_queue=false
service_queue=true
```

Teste real de `queue_marketing_render_v2` com todos os gates OFF retornou:

```json
{"ok":false,"error":"marketing_generation_disabled","external_side_effect":false}
```

Nenhum job foi criado e nenhum canal externo foi tocado.

## Advisors

A auditoria antes do novo DDL manteve apenas o padrão já conhecido de tabelas server-only com `RLS Enabled No Policy` e o aviso global de leaked password protection desabilitado. O relatório de performance contém avisos históricos de FKs e índices não usados; a nova fila já nasce com índices por asset e por status/ordem da fila.

## Próxima rodada

1. Confirmar o CI do novo renderer no head da PR #254.
2. Implementar o pipeline de vídeo econômico real com FFmpeg, sem IA generativa, incluindo teste curto e limites de duração/resolução.
3. Implementar worker de renderização em modo seguro/dry-run que consuma a fila somente quando `generation_enabled` e o gate específico forem autorizados; não habilitar esses gates ainda.
4. Evoluir o Admin para preview real, duplicação/versão, recorte/posição e reordenação de carrossel sem expor credenciais.
5. Adicionar calendário visual e estados de aprovação/agendamento sem publicar.
6. Depois criar adapters oficiais por canal em `dry_run/homologation`, mantendo publish OFF.
7. IA de imagem/vídeo continua opcional e desligada até existir autorização explícita de budget/gates.

## Regra de retomada

Ler este arquivo, `docs/MARKETING-CENTER-RUN1-20260910.md` e `docs/RETOMADA-DONA-ANTONIA.md`; auditar `main`, PR #254 e Supabase; trabalhar apenas no Marketing e não interferir no Flow ou nas demais etapas do roadmap principal.
