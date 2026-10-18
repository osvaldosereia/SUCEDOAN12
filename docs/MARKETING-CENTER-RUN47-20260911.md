# Marketing Center — Run 47 — 2026-09-11

## Escopo

Continuação autônoma exclusiva do módulo Marketing na branch isolada `feat/marketing-center-clean-20260911` / PR #276. Nenhum Make, deploy, publisher externo, credencial social, IA paga, canary, gasto ou integração real foi habilitado.

## Auditoria antes de alterar

- Lido `docs/RETOMADA-DONA-ANTONIA.md`.
- Lido o checkpoint anterior `docs/MARKETING-CENTER-RUN46-20260911.md`.
- `main` auditada no SHA `8de35531b7631fd9ce7ca1a04c47f26a2b47863a`, com avanço concorrente principalmente em Vitrine V3 e alinhamento de migrations; não houve razão segura para merge/rebase forçado nesta rodada.
- PRs recentes auditadas; PR #291 de Vitrine V3 foi integrada à `main` e não pertence ao Marketing.
- PR #276 permaneceu isolada, draft e sem integração automática.
- Supabase `ssbesxgaijknwsjbsbcz` auditado antes de alterar: todas as tabelas `marketing_%` continuam com RLS ligado; funções `marketing_%` auditadas continuam `SECURITY INVOKER`, sem `EXECUTE` para `anon`/`authenticated` e com `service_role` preservado.
- Changelog/documentação atual do Supabase revisados; nenhuma mudança desta rodada exigiu DDL, Edge deploy, grant ou alteração de Auth.

## Bloco implementado

### 1. Manifesto determinístico de render local

Arquivos:

- `scripts/marketing-render-manifest-v1.mjs`
- `scripts/test-marketing-render-manifest-v1.mjs`

O manifesto cria um plano determinístico, local-only e não executável para três perfis:

- `square_1_1` -> 1080x1080;
- `story_9_16` -> 1080x1920;
- `pinterest_2_3` -> 1000x1500.

Suporta `image` e `video`, mas sem executar encoder ou rasterizador adicional nesta rodada. Para imagem, o plano aponta SVG local -> raster PNG local. Para vídeo, o plano aponta SVG local -> frames locais -> plano de encode MP4, mantendo `executor_allowed=false`.

Garantias fail-closed:

- apenas `source_svg` local;
- URL remota proibida;
- path traversal/absoluto proibido;
- vídeo limitado a 1–60 segundos no manifesto;
- `dry_run=true`;
- `ai_used=false`;
- `external_side_effect=false`;
- `network_allowed=false`;
- `provider_call_allowed=false`;
- `credentials_required_now=false`;
- `executor_allowed=false`;
- modos `ai`/`hybrid` apenas marcam `requires_ai_preflight=true`; não chamam provider;
- idempotency key SHA-256 determinística.

Não foi introduzida dependência nova de rasterização/vídeo porque a rodada não homologou runtime local pinado que justificasse ampliar a superfície de execução. O manifesto prepara esse passo futuro sem criar custo, rede ou executor.

### 2. Compatibilidade de formato nos request bundles dry-run

Arquivos:

- `scripts/marketing-channel-request-bundle-v1.mjs`
- `scripts/test-marketing-channel-request-bundle-v1.mjs`

O bundle continua credential-free, endpoint-free e não-despachável, mas agora valida opcionalmente `render_profile` por destino:

- WhatsApp Status -> `story_9_16`;
- Instagram Stories -> `story_9_16`;
- Facebook Stories -> `story_9_16`;
- Instagram Carrossel -> `square_1_1`;
- Pinterest -> `pinterest_2_3`;
- Google Perfil da Empresa -> `square_1_1`.

Se um `render_profile` for informado e não for compatível, falha com `channel_format_mismatch`. Para preservar compatibilidade com preflights já existentes, ausência do campo retorna `format_validation.status=not_provided` e continua sem dispatch.

Pinterest Business foi revisado nesta rodada e mantém como prática recomendada o formato vertical 2:3 / 1000x1500 para Pins; o perfil interno foi alinhado a essa referência sem ativar publicação.

## TDD / CI

### RED

- testes foram criados/alterados antes da implementação;
- commits de teste: `951effc9f424da16e98f518e51e394e9c548c0da` e `62cc96d92443c27e91041dd0517dafb4e5aab193`;
- workflow foi atualizado no commit `616ac28da84c6f84b62909bb354c72eb9f719d0c` antes de existir `marketing-render-manifest-v1.mjs`;
- run `34671074894` / run #95 terminou `completed/failure` no syntax-check, exatamente pela ausência da implementação do manifesto.

### GREEN

- manifesto implementado no commit `376c9d2cdd20e65ea73a6134301757b33a394e8c`;
- validação de perfil no bundle implementada no commit funcional `577744af0c82248bad231d488a957d8113dfb317`;
- workflow run `34671128693` / run #99 terminou `completed/success`;
- passaram syntax-check, clean transplant guard, editor, biblioteca, operações read-only, métricas/readiness, channel preflight, request bundle format-aware, approval preview, AI preflight, AI readiness UI, renderer SVG e manifesto determinístico de render.

## Auditoria pós-implementação

Nenhum deploy/redeploy foi executado. Supabase permaneceu com:

- assets = 0;
- render jobs = 0;
- publication jobs = 0;
- triage requests = 0;
- channel accounts = 0;
- eventos internos = 8;
- eventos com efeito externo = 0.

Runtime continua fechado:

- `enabled=false`;
- `execution_mode=off`;
- `canary_percent=0`;
- `kill_switch=true`;
- `generation_enabled=false`;
- `deterministic_render_enabled=false`;
- `ai_image_enabled=false`;
- `ai_video_enabled=false`;
- `publishing_enabled=false`;
- todos os seis publishers OFF;
- `require_approval=true`;
- `max_daily_publications=0`;
- `max_daily_ai_image_generations=0`;
- `max_daily_ai_video_seconds=0`;
- `max_daily_ai_cost_cents=0`;
- attribution/triage/requeue OFF;
- triage kill switch ON.

RLS/RBAC auditados permanecem preservados. Nenhuma migration, Edge Function, credencial, provider pago ou publicação externa foi alterada.

## Próximo bloco seguro

1. verificar se o repositório já possui runtime local/pinado adequado para rasterização SVG->PNG e encode de vídeo sem rede/provider; só então criar executor local explicitamente separado do manifesto e ainda atrás de gate OFF;
2. se não houver runtime homologável, manter o executor inexistente e evoluir a integração privada entre manifesto -> preview/aprovação, sem publicação;
3. adicionar validação de manifesto/render profile ao approval preview local para impedir aprovação de formato incompatível ainda em dry-run;
4. continuar a UI Marketing fora do Admin público até existir host autenticado apropriado;
5. publishers reais, IA paga, requeue, canary, Ads/Messenger e qualquer ativação externa permanecem proibidos.

## Estado de conclusão

Marketing ainda não está integralmente concluído/homologado. Não desativar a continuidade recorrente ainda.
