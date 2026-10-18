# Marketing Center — Run 62 — 2026-09-12

## Escopo desta rodada

Continuidade exclusiva do módulo Marketing da Dona Antônia, sem Make e sem alterar qualquer gate de rollout. Esta rodada implementa o bloco seguro registrado no Run 61: um agregador privado/dormente da revisão ativa, somente leitura e somente em memória, compondo `summary + comparison + session/frame status` sem expor os bindings internos.

## Auditoria obrigatória antes da alteração

### Retomada e checkpoint
- `docs/RETOMADA-DONA-ANTONIA.md` relido e preservado como fonte de verdade.
- checkpoint anterior relido: `docs/MARKETING-CENTER-RUN61-20260912.md`.
- branch isolada mantida: `feat/marketing-center-clean-20260911`.
- PR preservada como draft: #276.
- nenhum rebase, merge ou force-push contra `main`.

### Main / PRs recentes
- `main` auditada em `3d5cb00d4c45c623c12d2d4279400327520b4493` (`docs(flow): checkpoint run54 v72 basket personalization integrity`).
- PRs recentes #295–#302 auditadas; atividade recente segue concentrada em produtos, chat, Flow e Admin fora do Marketing.
- decisão: não tocar em loaders públicos nem reconciliar a branch nesta rodada para evitar conflito com frentes paralelas.

### Supabase — pré-auditoria
`marketing_runtime_config` permaneceu fail-closed:
- `enabled=false`
- `execution_mode=off`
- `canary_percent=0`
- `kill_switch=true`
- `generation_enabled=false`
- `deterministic_render_enabled=false`
- `ai_image_enabled=false`
- `ai_video_enabled=false`
- `publishing_enabled=false`
- todos os seis publishers OFF
- `require_approval=true`
- budgets de publicação/IA em zero
- attribution OFF
- triage/requeue OFF
- triage kill switch ON

Estado de dados auditado:
- assets: 0
- render jobs: 0
- publication jobs: 0
- triage requests: 0
- channel accounts: 0
- eventos: 8 totais / 0 externos

Segurança auditada:
- 15/15 tabelas `marketing_%` com RLS ativo
- 20 funções Marketing auditadas
- 0 `SECURITY DEFINER`
- 0 EXECUTE para `anon`
- 0 EXECUTE para `authenticated`

## Implementação

### Agregador privado/read-only da revisão ativa
Novo módulo:
- `admin-v3/marketing-review-active-aggregate-readonly-v1.js`

Novo contrato de teste:
- `scripts/test-marketing-review-active-aggregate-readonly-ui-v1.mjs`
- executado pelo contrato já observado `scripts/test-marketing-review-frame-surface-readonly-ui-v1.mjs`, preservando o workflow existente.

Contrato do agregador:
- consome somente o summary sanitizado, comparison sanitizado e frame sanitizado já existentes;
- exige binding consistente por asset/revisão entre summary, comparison e frame;
- mantém internamente o binding obrigatório `snapshot_token + lease_token`, sem expô-lo no objeto retornado nem no HTML;
- replay idêntico do mesmo snapshot/lease reutiliza a mesma view em memória;
- uma revisão/frame mais novo do mesmo asset torna a view antiga `superseded`;
- frame revogado, inválido ou não corrente torna a view `stale`;
- clone/desvinculação da view falha fechado como `stale`;
- registry limitado a 100 views; evicção invalida o binding antigo;
- `mountCurrent` consulta o lifecycle antes e imediatamente antes da mutação do DOM;
- nenhuma view `superseded` ou `stale` pode alterar o DOM.

A view pública do agregador contém apenas:
- schema/version
- asset id
- revisão
- epoch
- status sanitizado
- review status
- contagem de paths alterados/total
- status sanitizado da comparação
- contagem de blockers
- flags read-only/fail-closed

Não contém:
- snapshot token
- lease token
- session token
- idempotency key
- package SHA ou outros hashes
- blockers brutos
- paths brutos
- spec, caption, approval payload, SVG/PNG ou request body

O módulo não usa rede, Supabase, Storage, filesystem, provider, publisher, persistência local, aprovação, agendamento, publicação ou requeue e permanece fora de `admin/app-lite.js` e `admin-v3/index.html`.

## TDD comprovado

### RED
- contrato novo: `e28b62a3f19a5521ede50763cea0db1b3895b501`
- contrato conectado ao safety workflow: `37cdf8f757a3090c326013ca4f5c42813aa2a0c6`
- workflow: `34712245102`
- resultado: falha esperada no passo `Validate dormant fail-closed Marketing review frame surface` quando o teste tentou carregar `marketing-review-active-aggregate-readonly-v1.js` ainda inexistente.
- todos os contratos anteriores chegaram verdes até esse ponto.

### GREEN
- implementação: `501c4df3165f682c6da43c93913d56f4ee949f98`
- workflow: `34712298427`
- resultado: `completed/success`.
- o safety-contract completo passou, incluindo o novo contrato do agregador importado pelo teste de frame surface.

## Pós-auditoria

Nenhuma migration, Edge Function, Storage, segredo, credencial ou integração externa foi alterada.

Supabase permaneceu sem efeitos externos:
- Marketing OFF / `execution_mode=off` / canary 0% / kill switch ON
- geração/render/IA/publishing e seis publishers OFF
- aprovação obrigatória e budgets zero
- 0 assets
- 0 render jobs
- 0 publication jobs
- 0 triage requests
- 0 channel accounts
- 8 eventos totais / 0 externos
- 15/15 tabelas Marketing com RLS ativo
- 20 funções `marketing_%`, 0 `SECURITY DEFINER`, 0 EXECUTE para `anon`/`authenticated`

## Estado do projeto

O Marketing ainda **não** está integralmente concluído/homologado. A automação de continuidade não deve ser encerrada nesta rodada.

## Próximo bloco seguro sugerido

Criar uma camada privada/dormente de `review workspace` que reúna o agregador ativo com o preview de aprovação já sanitizado, ainda somente em memória e read-only, exigindo:
- mesmo asset/revisão/epoch corrente;
- binding efêmero interno sem expor tokens/hashes;
- invalidação imediata quando a view agregada deixar de ser `current`;
- idempotência bounded-memory;
- zero persistência, zero rede e zero mutações externas;
- continuar fora dos loaders públicos.

Depois disso, avaliar se os contratos privados/read-only estão maduros o bastante para planejar uma integração visual do Marketing no Admin, ainda atrás de gate explícito OFF e sem publishers reais.
