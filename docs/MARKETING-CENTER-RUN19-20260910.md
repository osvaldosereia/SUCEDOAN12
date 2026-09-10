# Marketing Center — Run 19 — 2026-09-10

## Escopo
Somente Marketing da Dona Antônia. Sem Make, sem rollout social, sem Ads, sem gasto de IA e sem aumento de canary.

## Auditoria inicial
- `docs/RETOMADA-DONA-ANTONIA.md` relido.
- checkpoint anterior `docs/MARKETING-CENTER-RUN18-20260910.md` relido.
- PR #254 continua aberta e isolada em `feat/marketing-center-v1-20260910`; `main` avançou e a PR permanece com conflito, portanto nenhum rebase/merge foi forçado.
- HEAD anterior da Run 18 ainda não possuía workflow run associado ao commit auditado.
- Supabase auditado antes de qualquer alteração: `marketing_runtime_config` continua OFF/fail-closed; `complete_marketing_carousel_render_v1` permanece anon=false, authenticated=false, service_role=true; render_jobs=0; assets=0; eventos Marketing com `external_side_effect=true`=0.

## Implementado

### 1. Adapter de conclusão segura do worker
Novo `scripts/marketing-render-completion-adapter-v1.mjs`.

O adapter é exclusivo para jobs de carrossel e chama somente `complete_marketing_carousel_render_v1` após a mídia final já estar persistida e registrada. Guardas:
- URL aceita somente `https://*.supabase.co`;
- service-role obrigatória;
- job/media/worker obrigatórios;
- identidade de carrossel obrigatória em `output_spec` (`carousel_slide_id`, `asset_version`, `slide_no`);
- redirect de rede bloqueado (`redirect: error`);
- resposta deve retornar `external_side_effect=false`;
- `job_id` e `media_id` retornados precisam coincidir exatamente;
- não existe fallback para `complete_marketing_render_v3`.

### 2. Worker fail-closed para carrossel persistido
`marketing-render-worker-v1.mjs` agora:
- após persistir output privado de um job de carrossel, exige `media_id`;
- exige adapter/configuração explícita de conclusão (`carousel_completion_required`);
- exige identidade efetiva do worker, preferindo `workerId`, depois `job.lease_owner`;
- chama a conclusão segura somente depois da persistência;
- rejeita conclusão que indique efeito externo;
- expõe `completed` no resultado interno;
- mantém `external_side_effect=false`;
- CLI ganhou `--complete-carousel` e `--worker-id`, ambos opt-in; nenhum runtime foi ativado.

Isso elimina o risco de um output de carrossel persistido ser considerado concluído pelo worker sem passar pelas verificações transacionais de lease + asset/version/slide + media/job binding da migration V12.

### 3. Teste
Novo `scripts/test-marketing-render-completion-v1.mjs` valida:
- detecção de job de carrossel;
- endpoint RPC exclusivo de conclusão segura;
- ausência de fallback genérico;
- `redirect=error`;
- job/worker/media corretos no payload;
- bloqueio de host não-Supabase;
- bloqueio de job sem identidade de carrossel;
- presença dos fail-closed guards no worker.

Teste executado localmente nesta rodada: `marketing render completion v1: ok`.

## Estado Supabase pós-implementação
Nenhuma migration, Edge Function ou configuração de produção foi alterada nesta rodada.

Persistem:
- Marketing OFF
- execution_mode OFF
- canary 0%
- kill switch ON
- generation OFF
- deterministic renderer OFF
- AI image/video OFF
- global publishing OFF
- WhatsApp Status OFF
- Instagram Story OFF
- Facebook Story OFF
- Instagram Carousel OFF
- Pinterest OFF
- Google Business Profile OFF
- attribution recording OFF
- budgets/publication limits = 0
- render_jobs=0
- assets=0
- external-effect Marketing events=0

## Próximo bloco seguro
1. incluir o novo adapter/teste explicitamente no workflow `Marketing Center V1` e confirmar CI do novo HEAD;
2. ligar `progress` visualmente aos cards de slide do Admin com estados pendente/processando/renderizado/falhou, sem mutação automática;
3. homologar transacionalmente a conclusão V12 com fixtures rollback-only para lease válido, expirado, cross-version, cross-slide, cross-job e repetição idempotente;
4. acrescentar métricas de render por slide/falhas/latência sem inferência;
5. manter todos os publicadores exclusivamente em dry-run até autorização explícita.

O Marketing ainda não está integralmente concluído/homologado; a automação não deve ser desativada nesta rodada.
