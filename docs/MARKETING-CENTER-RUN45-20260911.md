# Marketing Center — Run 45 — 2026-09-11

## Escopo

Continuação autônoma exclusiva do módulo Marketing na branch isolada `feat/marketing-center-clean-20260911` / PR #276. Nenhum Make, deploy, publisher externo, credencial social, IA paga, canary ou gasto foi habilitado.

## Auditoria antes de alterar

- Lido `docs/RETOMADA-DONA-ANTONIA.md` na `main`.
- Lido o checkpoint anterior `docs/MARKETING-CENTER-RUN44-20260911.md`.
- `main` auditada no SHA `14d11cab3aa36da9996fa8229f258df1f0183e89`; PRs recentes continuam concentradas em Vitrine/Admin/Flow/Product Studio, sem motivo para merge/rebase forçado nesta rodada.
- PR #276 auditada antes do código. A comparação com `main` confirmou divergência histórica grande; a estratégia continua sendo isolamento, sem force/rebase automático.
- Supabase `ssbesxgaijknwsjbsbcz` permaneceu `ACTIVE_HEALTHY`.
- Estado inicial confirmado: 0 assets, 0 render jobs, 0 publication jobs, 0 triage requests, 0 channel accounts, 8 eventos internos e 0 eventos com efeito externo.
- Runtime confirmado fechado: Marketing OFF, execution mode OFF, canary 0%, kill switch ON, geração/render/IA OFF, publicação global OFF, seis publishers OFF, attribution/triage/requeue OFF, aprovação obrigatória e budgets zero.
- Todas as tabelas `marketing_%` auditadas continuam com RLS ligado.
- Funções `marketing_%` auditadas continuam `SECURITY INVOKER` (`prosecdef=false`) e sem EXECUTE para `anon`/`authenticated`; `service_role` permanece autorizado.
- Security Advisor continua com INFO `RLS enabled no policy` coerente com o padrão server-only do Marketing. WARNs atuais de `SECURITY DEFINER` pertencem a WhatsApp/Agent Workflow, não ao Marketing.

## Bloco implementado

### 1. UI privada/dormente de preview de aprovação

Arquivos:

- `admin-v3/marketing-approval-preview-readonly-v1.js`
- `scripts/test-marketing-approval-preview-readonly-ui-v1.mjs`

A superfície não busca dados nem possui integração de rede. Ela recebe exclusivamente um pacote já produzido pelo contrato `marketing-approval-preview-v1` e o renderiza localmente.

Fail-closed obrigatório:

- `schema_version=marketing-approval-preview-v1`;
- `preview_only=true`;
- `approval_state=preview_only`;
- `ready_for_real_publish=false`;
- `external_side_effect=false`;
- `network_allowed=false`;
- `mutations_allowed=false`;
- cada target também precisa declarar `external_side_effect=false`, `network_allowed=false` e `publisher_enabled=false`.

A UI:

- escapa conteúdo antes de montar HTML;
- mostra asset, targets, preflight e blockers;
- não contém `fetch`, bearer token, credencial, endpoint externo ou chamada mutante;
- não aprova, agenda, publica, executa ou reenfileira;
- permanece fora do Admin público por contrato do clean transplant.

### 2. Preflight offline de IA imagem/vídeo

Arquivos:

- `scripts/marketing-ai-preflight-v1.mjs`
- `scripts/test-marketing-ai-preflight-v1.mjs`

O builder é puro/offline e existe apenas para decidir se um pedido de geração `ai`/`hybrid` estaria dentro dos gates e budgets configurados. Ele não chama provider e não recebe credencial.

Validações:

- modos `no_ai | ai | hybrid`;
- mídia `image | video`;
- quantidade/unidades solicitadas;
- custo unitário recebido como dado configurável, nunca hardcoded de provider;
- `enabled`, `execution_mode`, `kill_switch`, `generation_enabled`;
- gates separados `ai_image_enabled` e `ai_video_enabled`;
- budget diário geral de IA;
- limite diário de gerações de imagem;
- limite diário de segundos de vídeo.

Garantias permanentes deste módulo:

- `dry_run=true`;
- `external_side_effect=false`;
- `network_allowed=false`;
- `credentials_required_now=false`;
- `provider_call_allowed=false`;
- idempotency key determinística;
- orçamento/gate fechado vira blocker explícito;
- `no_ai` não depende dos gates de IA e estima custo IA em zero.

Mesmo em um snapshot hipotético com gates/budget abertos, `provider_call_allowed` continua `false`; este arquivo não é executor.

### 3. Guards do clean transplant endurecidos

Atualizados:

- `.github/workflows/marketing-center-clean-v1.yml`;
- `scripts/test-marketing-clean-transplant-v1.mjs`.

O workflow agora executa syntax-check e contratos dos dois blocos novos. O guard do Admin público passou a rejeitar também `marketing-approval-preview-readonly-v1`.

## TDD / CI

### RED

Os testes e o workflow foram persistidos antes das implementações.

Workflow `Marketing Center Clean Transplant` run `34665786129`, no commit `880f24c7eec17dda51376cfeb73cacffedf5def7`, terminou `failure` na etapa de syntax-check porque os novos arquivos de produção ainda não existiam. Os passos posteriores ficaram skipped. Isso confirmou o RED pelo motivo esperado.

### GREEN

Implementações:

- UI read-only: commit `3d31054fb824ab79ce1bba8e641ae4ce47285a70`;
- AI preflight offline: commit `c538257ae967eca3172c04850421c5b0f964940f`.

Workflow run `34665836823` terminou `completed/success`.

Todos os passos ficaram verdes, incluindo:

- syntax-check de toda UI/tooling Marketing da branch;
- clean transplant safety contract;
- editor;
- biblioteca;
- operações read-only;
- métricas/readiness;
- channel preflight;
- approval preview;
- nova UI read-only de approval preview;
- novo AI preflight offline;
- renderer SVG determinístico.

## Auditoria pós-implementação

Supabase foi reconsultado sem deploy/redeploy e permaneceu inalterado:

- 0 assets;
- 0 render jobs;
- 0 publication jobs;
- 0 triage requests;
- 0 channel accounts;
- 8 eventos internos;
- 0 eventos com efeito externo.

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
- `max_daily_ai_cost_cents=0`;
- `max_daily_ai_image_generations=0`;
- `max_daily_ai_video_seconds=0`;
- attribution/triage/requeue OFF;
- triage kill switch ON.

Nenhuma migration ou Edge Function foi implantada/reimplantada nesta rodada.

## PR / concorrência

A PR #276 continua sendo a candidata limpa. Não usar a PR histórica #254 como merge direto.

A `main` está muito à frente do merge-base da branch por trabalho concorrente. Não fazer force/rebase automático. Nesta rodada a PR voltou a aparecer `mergeable=true`, mas isso não muda a regra de não integrar sem reauditoria imediata.

## Próximo bloco seguro

1. manter a UI de approval preview desconectada do Admin público até existir host autenticado apropriado;
2. avançar geração sem IA para rasterização e vídeo offline apenas se dependências puderem ser homologadas sem rede/provider/runtime pago;
3. criar read-model privado para comparar custo estimado/gates da IA sem executar provider;
4. preparar adaptadores oficiais por canal apenas como request builders/dry-run, sem credenciais e sem dispatch;
5. continuar com publishers reais, IA paga, requeue e canary OFF.

## Estado de conclusão

Marketing ainda não está integralmente concluído/homologado. Não desativar a continuidade recorrente ainda.
