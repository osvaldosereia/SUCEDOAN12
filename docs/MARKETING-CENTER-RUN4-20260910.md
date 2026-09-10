# Marketing Center — Run 4 — 10/09/2026

## Auditoria de retomada

- `docs/RETOMADA-DONA-ANTONIA.md` relido antes de qualquer alteração.
- PR #254 continua aberta e isolada em `feat/marketing-center-v1-20260910`.
- `main` avançou principalmente em processamento de imagens de produto; esta rodada não alterou essas frentes.
- Supabase `ssbesxgaijknwsjbsbcz` confirmado `ACTIVE_HEALTHY`.
- Runtime de Marketing revalidado integralmente OFF:

```text
enabled=false
execution_mode=off
canary_percent=0
kill_switch=true
generation_enabled=false
deterministic_render_enabled=false
ai_image_enabled=false
ai_video_enabled=false
publishing_enabled=false
whatsapp_status_publish_enabled=false
instagram_story_publish_enabled=false
facebook_story_publish_enabled=false
instagram_carousel_publish_enabled=false
pinterest_publish_enabled=false
google_business_publish_enabled=false
```

Nenhum gate foi alterado.

## Correção do CI de vídeo

O CI anterior falhava somente no teste MP4. O FFmpeg estava instalado corretamente, mas rejeitava os JPEGs intermediários otimizados produzidos pelo Sharp naquele runner.

Correção aplicada em `scripts/marketing-render-economical-video-v1.mjs`:

- frames intermediários mudaram de JPEG otimizado para PNG lossless;
- isso remove dependência de particularidades do decoder MJPEG entre builds do FFmpeg;
- saída final continua MP4/H.264/yuv420p/faststart;
- nenhuma chamada externa, IA ou provider foi adicionada.

## Worker determinístico real

Adicionado `scripts/marketing-render-worker-v1.mjs`.

Responsabilidades atuais:

- processa somente `deterministic_image` e `economical_video`;
- reutiliza os renderers reais Sharp/WebP e FFmpeg/MP4;
- recusa explicitamente `ai_image` e `ai_video` com `ai_render_not_authorized`;
- recusa job já finalizado;
- trabalha exclusivamente com workspace/local paths já controlados pelos renderers;
- grava somente artefato local de render;
- retorna metadados normalizados de mídia;
- sempre retorna `ai_used=false` e `external_side_effect=false`.

Não existe dispatcher de publicação neste worker.

## Fila V3 — lease, retry e idempotência

Criada e aplicada no Supabase a migration `marketing_render_worker_hardening_v3`.

Ela adiciona:

- `claim_marketing_render_jobs_v3` com limite configurável de tentativas, máximo absoluto 20;
- jobs que esgotam tentativas passam para `review_required`, evitando loop infinito;
- recuperação segura de lease expirado;
- ordenação estável e `FOR UPDATE SKIP LOCKED`;
- `complete_marketing_render_v3` idempotente para jobs já finalizados;
- correção de contabilização de `actual_cost_cents` para não somar novamente em retries/conclusões repetidas;
- eventos internos com `external_side_effect=false`.

Permissões verificadas após migration:

```text
claim_marketing_render_jobs_v3:
  anon_execute=false
  authenticated_execute=false
  service_role_execute=true

complete_marketing_render_v3:
  anon_execute=false
  authenticated_execute=false
  service_role_execute=true
```

## Testes e CI

Adicionado `scripts/test-marketing-worker-v1.mjs` cobrindo:

1. job de imagem determinística produz WebP real;
2. job de vídeo econômico produz MP4 real;
3. IA permanece recusada;
4. job finalizado não é reprocessado;
5. metadata confirma ausência de IA e de efeito externo.

Workflow `Marketing Center V1` atualizado para incluir:

- migration V3;
- worker;
- teste do worker;
- syntax check do worker;
- testes reais de imagem, vídeo e contrato de segurança.

No momento deste checkpoint o novo CI está em execução. A próxima rodada deve confirmar o resultado antes de avançar.

## Rollout preservado

- nenhuma publicação externa;
- nenhuma ativação Meta/Pinterest/Google;
- nenhum gasto de IA;
- nenhuma chamada OpenAI/Google/Veo/Runway;
- nenhum aumento de canary;
- nenhuma dependência Make;
- WhatsApp Status continua desenho `manual_confirm`;
- nenhuma Edge Function de Marketing foi implantada nesta rodada.

## Próxima rodada

1. Confirmar CI do head atual e corrigir qualquer regressão antes de prosseguir.
2. Integrar o worker local à fila V3 por um executor controlado, ainda sem publicação, com credencial server-only e dry-run padrão.
3. Evoluir o Admin para preview visual real e edição rápida de layout: posição, escala, crop, texto, preço, CTA, duplicar versão e reordenar carrossel.
4. Criar calendário visual e fluxo `draft -> review -> approved -> scheduled`, sem dispatcher externo.
5. Depois criar adapters oficiais por canal somente em `dry_run/homologation`, mantendo todos os publish gates OFF.
6. IA de imagem/vídeo continua opcional e bloqueada até provider e orçamento serem autorizados explicitamente.

## Regra de retomada

Ler `docs/RETOMADA-DONA-ANTONIA.md`, este checkpoint e Runs anteriores; auditar `main`, PR #254 e Supabase; trabalhar somente no Marketing e manter todos os efeitos externos OFF.
