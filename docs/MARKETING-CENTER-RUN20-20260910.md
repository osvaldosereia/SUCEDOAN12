# Marketing Center — Run 20 — 2026-09-10

## Escopo desta rodada
Somente Marketing da Dona Antônia. Nenhum Make, rollout externo, Meta Ads, Messenger, Instagram activation ou gasto pago foi habilitado.

## Auditoria inicial
- `docs/RETOMADA-DONA-ANTONIA.md` e `docs/MARKETING-CENTER-RUN19-20260910.md` relidos antes das alterações.
- PR #254 continua aberta e isolada em `feat/marketing-center-v1-20260910`.
- `main` avançou em paralelo; PR permanece `mergeable=false`. Não houve rebase/merge forçado.
- Supabase `ssbesxgaijknwsjbsbcz` revalidado antes das alterações.
- Runtime verificado: `enabled=false`, `execution_mode=off`, `canary_percent=0`, `kill_switch=true`, `require_approval=true`, `generation_enabled=false`, `deterministic_render_enabled=false`, `ai_image_enabled=false`, `ai_video_enabled=false`, `publishing_enabled=false`, os seis canais de publicação OFF, `attribution_recording_enabled=false`, budgets/limites de gasto e publicação em zero.
- Contadores no início: 0 assets, 0 render jobs e 0 eventos Marketing com `external_side_effect=true`.
- `complete_marketing_carousel_render_v1` continua sem EXECUTE para `anon`/`authenticated`; apenas `postgres`/`service_role`.

## Implementado

### 1. Progresso visual seguro por slide
Novo módulo `admin-v3/marketing-carousel-progress-v1.js` carregado pelo `marketing-workflow-v1.js`.

O módulo:
- usa somente a ação read-only `progress` de `admin-marketing-carousel-v1`;
- exige `external_side_effect=false` na resposta e falha fechado caso contrário;
- mostra resumo `renderizados / pendentes / falha-revisão`;
- acrescenta estado visual por slide: `Pendente`, `Na fila`, `Processando`, `Renderizado`, `Falhou` ou `Revisão necessária`;
- oferece atualização manual explícita e atualiza após seleção de asset ou ações relevantes do editor;
- não possui `request_render`, `publish` ou endpoints de Meta/Pinterest/Google;
- não usa polling contínuo, reduzindo leituras desnecessárias.

Durante a revisão foi eliminado um desenho inicial com `MutationObserver` de `childList`, que poderia reagir às próprias badges e criar renderizações recursivas. A versão persistida observa apenas mudanças de classe para troca do asset ativo e eventos explícitos do usuário.

### 2. CI da Run 19 + Run 20
Workflow `.github/workflows/marketing-center-v1.yml` atualizado para:
- observar e verificar sintaxe de `admin-v3/marketing-carousel-progress-v1.js`;
- verificar sintaxe de `scripts/marketing-render-completion-adapter-v1.mjs`;
- executar explicitamente `scripts/test-marketing-render-completion-v1.mjs` da Run 19;
- executar o novo `scripts/test-marketing-carousel-progress-admin-v1.mjs`.

Novo contrato `test-marketing-carousel-progress-admin-v1.mjs` valida:
- ação read-only `progress` + `asset_id`;
- fail-closed de `external_side_effect`;
- mapeamento dos estados por slide;
- badge/controle de atualização no Admin;
- ausência de mutações/publicadores/providers no módulo visual;
- RBAC `owner|operator` e RPC de progresso no Edge existente.

## Segurança preservada
Nenhum DDL, migration ou deploy de Edge Function foi necessário nesta rodada. Não houve chamada a Meta, Pinterest, Google Business Profile, OpenAI ou outro provider externo.

Os gates permanecem intocados e OFF. Nenhum canary foi aumentado, nenhuma conta social foi ativada, nenhum dispatcher real foi criado e nenhum budget foi alterado.

## Validação
- PR head após as alterações: `ddaef5dc293e5106ec7465183b46d107e7102565` antes deste checkpoint.
- GitHub ainda não havia criado workflow/check-run para esse HEAD na última consulta (`total_count=0`). Tratar como validação CI pendente, não como verde.
- Tentativa de clone local no ambiente auxiliar falhou por DNS/rede (`Could not resolve host: github.com`); é limitação transitória do runner auxiliar e não alterou o repositório.

## Próxima rodada
1. Confirmar o GitHub Actions `Marketing Center V1` do novo HEAD e corrigir qualquer falha sem relaxar contratos.
2. Homologar transacionalmente V12 com fixtures rollback-only: lease válido/expirado, worker errado, cross-version, cross-slide, cross-job e repetição idempotente.
3. Acrescentar métricas de render por estado/latência no read-model, somente leitura.
4. Manter publicadores oficiais exclusivamente em dry-run até autorização expressa de rollout.

## Status
Marketing ainda não está integralmente concluído/homologado programaticamente. A automação recorrente deve continuar.
