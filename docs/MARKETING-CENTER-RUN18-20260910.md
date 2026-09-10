# Marketing Center — Run 18 — 2026-09-10

## Escopo
Somente Marketing da Dona Antônia. Sem Make, sem rollout social, sem Ads, sem gasto de IA e sem aumento de canary.

## Auditoria inicial
- `docs/RETOMADA-DONA-ANTONIA.md` relido.
- checkpoint anterior `docs/MARKETING-CENTER-RUN17-20260910.md` relido.
- PR #254 continua aberta e isolada em `feat/marketing-center-v1-20260910`.
- HEAD da Run 17 ainda não tinha check-run associado no início desta rodada.
- Supabase auditado pelo schema real do Marketing antes de DDL.
- Gates confirmados antes/depois: Marketing OFF, execution mode OFF, canary 0%, kill switch ON, geração/render/IA/publicação OFF, seis canais OFF, atribuição OFF e budgets em zero.

## Implementado

### 1. Binding transacional do output de carrossel
Migration `marketing_carousel_output_binding_v12` aplicada e persistida em `20260910215500_marketing_carousel_output_binding_v12.sql`.

Nova RPC `complete_marketing_carousel_render_v1` conclui um slide somente quando todas as evidências combinam:
- job existe e está `processing`;
- `lease_owner` coincide com o worker;
- lease não expirou;
- `carousel_slide_id`, `asset_version` e `slide_no` vieram do `output_spec` criado pelo batch e conferem com o slide real;
- mídia de saída pertence ao mesmo asset e versão;
- role da mídia é `output`;
- metadata `render_job_id` coincide exatamente com o job;
- render determinístico de carrossel exige WebP 1080×1350.

Na conclusão atômica:
- job -> `rendered` e lease é limpo;
- slide -> `rendered` + `output_media_id`;
- asset permanece `render_queued` até todos os slides da versão atual estarem renderizados;
- último slide concluído marca o asset `rendered`;
- evento auditável `carousel_slide_render_completed` é append-only e `external_side_effect=false`.

Repetir a mesma conclusão já consolidada com o mesmo `media_id` devolve `idempotent=true`.

### 2. Read model de progresso por slide
Nova RPC `marketing_carousel_render_progress_v1` retorna somente a versão atual do asset e associa cada slide ao job mais recente correspondente por asset/version/slide.

Campos principais:
- status do slide;
- `output_media_id`;
- job/status/tentativas/erro;
- timestamp consolidado.

### 3. Edge administrativa
`admin-marketing-carousel-v1` evoluiu para versão 2 no Supabase com `verify_jwt=true`.

Nova ação read-only `progress`:
- mantém autenticação JWT + RBAC `owner|operator`;
- usa exclusivamente a RPC interna de progresso;
- resume `total`, `rendered`, `failed`, `pending`, `complete`;
- retorna `external_side_effect=false`;
- não chama Meta, Pinterest, Google, OpenAI ou qualquer provider externo.

### 4. CI
Criado `scripts/test-marketing-carousel-output-binding-v1.mjs`, cobrindo por contrato:
- lease obrigatório;
- scope asset/version/slide;
- media/job binding;
- idempotência;
- ausência de endpoints externos;
- privilégios server-only;
- ação de progresso read-only na Edge.

Workflow `Marketing Center V1` atualizado para observar a migration V12 e executar o novo teste.

## Homologação Supabase
- migration V12 aplicada com sucesso;
- `complete_marketing_carousel_render_v1`: anon=false, authenticated=false, service_role=true;
- chamada com job inexistente falhou fechada com `job_not_found` e `external_side_effect=false`;
- `admin-marketing-carousel-v1` ACTIVE, versão 2, `verify_jwt=true`.

## Gates preservados
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

## Próximo bloco seguro
1. confirmar CI da Run 18 no novo HEAD;
2. ligar a ação `progress` visualmente ao painel do Admin por slide;
3. integrar o orquestrador/worker ao `complete_marketing_carousel_render_v1` depois de persistir a mídia, sem permitir fallback para `complete_marketing_render_v3` em jobs de carrossel;
4. homologar transacionalmente lease válido, lease expirado, cross-version, cross-slide, cross-job e repetição idempotente com ROLLBACK;
5. seguir métricas de render e atribuição determinística;
6. manter todos os publicadores exclusivamente em dry-run até autorização explícita.

O Marketing ainda não está integralmente concluído/homologado; a automação não deve ser desativada nesta rodada.
