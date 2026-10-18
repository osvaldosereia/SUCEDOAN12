# Marketing Center — Run 61 — 2026-09-12

## Escopo desta rodada

Continuidade exclusiva do módulo Marketing da Dona Antônia, sem Make e sem alterar qualquer gate de rollout. Esta rodada implementa a próxima etapa segura registrada no Run 60: uma superfície privada/dormente, somente leitura, que consome exclusivamente o frame sanitizado do coordenador de revisão.

## Auditoria obrigatória antes da alteração

### Retomada e checkpoint
- `docs/RETOMADA-DONA-ANTONIA.md` relido e preservado como fonte de verdade.
- checkpoint anterior relido: `docs/MARKETING-CENTER-RUN60-20260912.md`.
- branch isolada mantida: `feat/marketing-center-clean-20260911`.
- PR preservada como draft: #276.
- nenhum rebase, merge ou force-push contra `main`.

### Main / concorrência
- `main` auditada em `82c5a664fbb92ab7f242aa9bb3fd01d46b67e6e4` (`docs(flow): checkpoint run53 v71`).
- atividade recente segue concentrada em Flow/IA/Admin fora do Marketing.
- decisão: não tocar nos loaders públicos nem reconciliar a branch nesta rodada para evitar conflito com as frentes paralelas.

### Supabase — pré-auditoria
`marketing_runtime_config` permaneceu fail-closed:
- `enabled=false`
- `execution_mode=off`
- `canary_percent=0`
- `kill_switch=true`
- geração/render/IA OFF
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
- eventos: 8 internos / 0 externos

Segurança auditada:
- 15/15 tabelas `marketing_%` com RLS ativo
- 20 funções Marketing auditadas
- 0 `SECURITY DEFINER`
- 0 EXECUTE para `anon`
- 0 EXECUTE para `authenticated`

## Implementação

### Superfície privada/read-only do frame de revisão
Novo módulo:
- `admin-v3/marketing-review-frame-surface-readonly-v1.js`

Contrato:
- consome somente `marketing-review-frame-v1` já sanitizado pelo coordenador;
- mostra apenas:
  - `current | superseded | stale`
  - asset id
  - revisão
  - epoch
  - quantidade de alterações
  - quantidade de blockers
  - estado sanitizado do lease (`active | superseded | stale`)
- não mostra token de lease, session token, snapshot token, idempotency key, hashes completos, blockers brutos, spec, legenda, SVG, PNG ou request body;
- escaping obrigatório em todo texto derivado do frame;
- nenhuma rede, Supabase, Storage, filesystem, provider, publisher, persistência local, aprovação, agendamento, publicação ou requeue;
- permanece fora de `admin/app-lite.js` e `admin-v3/index.html`.

### Mount fail-closed
`mountCurrent` faz validação de lifecycle duas vezes antes da alteração do DOM:
1. frame precisa estar `current`;
2. lifecycle é reconsultado imediatamente antes do mount;
3. `superseded`, `stale`, lease revogado/desconhecido ou frame adulterado falham antes da mutação do DOM.

A superfície pode renderizar de forma read-only o status de frames `superseded`/`stale`, mas nunca montá-los como revisão ativa.

## TDD comprovado

### RED
- commit de contrato/workflow: `08c95b181580ccddf37e01a5998d1c17a4380c55`
- workflow: `34709117559`
- resultado: `failure`
- falha ocorreu no passo `Syntax check dormant private Marketing UI and local tooling`, pois o módulo de produção ainda não existia.

### GREEN
- commit funcional: `ad736d141481a669c496fee3e8cf376160f63661`
- workflow: `34709175360`
- resultado: `completed/success`
- syntax check passou;
- todos os contratos anteriores do Marketing passaram;
- novo passo `Validate dormant fail-closed Marketing review frame surface` passou.

Arquivos de teste/CI:
- `scripts/test-marketing-review-frame-surface-readonly-ui-v1.mjs`
- `.github/workflows/marketing-center-clean-v1.yml`

## Pós-auditoria

Nenhuma migration, Edge Function, Storage, segredo, credencial ou integração externa foi alterada.

Supabase continua sem efeitos externos:
- 8 eventos totais
- 8 internos
- 0 externos

Todos os gates de rollout permanecem inalterados e fechados. Nenhum canary foi aumentado e nenhuma publicação real, Instagram, Messenger, Ads ou gasto pago foi ativado.

## Estado do projeto

O Marketing ainda **não** está integralmente concluído/homologado. A automação de continuidade não deve ser encerrada nesta rodada.

## Próximo bloco seguro sugerido

Criar um agregador privado/dormente de revisão ativa que componha exclusivamente as superfícies já sanitizadas (`summary + comparison + session/frame status`) em uma única visão read-only, com:
- snapshot/lease binding obrigatório;
- atualização idempotente em memória;
- invalidação automática da visão quando o frame deixar de ser `current`;
- zero dados brutos, zero persistência, zero rede e zero mutações externas;
- continuar fora dos loaders públicos.

Somente depois de os contratos privados/read-only estarem maduros deve-se discutir integração visual no Admin — ainda sob gate explícito e sem publicar externamente.
