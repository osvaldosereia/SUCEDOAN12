# Marketing Center — Run 40 — 2026-09-11

## Escopo
Somente Marketing. Sem Make. Nenhuma publicação externa, provider pago, canary ou rollout foi ativado.

## Auditoria inicial
- `docs/RETOMADA-DONA-ANTONIA.md` e Run 39 revisados antes das alterações.
- `main` observado avançando em Vitrine V2, Flow e Product Studio, fora do escopo Marketing.
- PR limpa #276 permaneceu a superfície de trabalho; a divergência da `main` não foi resolvida por rebase/merge forçado.
- Supabase real: 0 assets, 0 render jobs, 0 publication jobs, 0 triage requests e 0 eventos Marketing com `external_side_effect=true`.
- Runtime real preservado: Marketing OFF, `execution_mode=off`, canary 0, kill switch ON, geração/render/IA OFF, publishing global e todos os canais OFF, aprovação obrigatória, budgets 0, attribution OFF, triage/requeue OFF e triage kill switch ON.
- `marketing_admin_snapshot_v1()` confirmou 7 comandos padrão e 5 modelos padrão, sem campanhas/assets/jobs/contas e com `external_side_effect=false`.
- Privilege audit confirmou `create_marketing_command_draft_v1`, `create_marketing_template_draft_v1` e `marketing_admin_snapshot_v1` executáveis apenas pelo `service_role` entre `anon/authenticated/service_role`; tabelas de biblioteca permanecem server-only/RLS.

## Bloco implementado
Terceiro slice da UI privada/dormente: `admin-v3/marketing-library-v1.js`.

A biblioteca:
- exige sessão JWT do Admin protegido e envia `Authorization: Bearer <access_token>`;
- usa somente a Edge protegida `admin-marketing-v1`;
- lê biblioteca via `overview` e falha fechado se o snapshot não declarar `external_side_effect=false`;
- lista os comandos e modelos versionados já existentes;
- permite reutilizar uma versão existente preenchendo o formulário sem mutá-la;
- salva somente novas versões por `create_command` e `create_template`;
- suporta comandos de imagem, vídeo, carrossel e legenda;
- suporta produção `no_ai`, `manual`, `hybrid` e `ai` apenas como configuração;
- para `ai/hybrid`, injeta obrigatoriamente `requires_ai_gate=true` e `requires_cost_budget=true`;
- mantém `deterministic_renderer` como caminho explícito sem IA;
- não contém ações de approve/publish/enable/schedule/execute/requeue;
- não chama Meta, Pinterest, Google ou OpenAI diretamente;
- continua sem qualquer mount no Admin público `admin/app-lite.js`.

## TDD e CI
Ciclo RED→GREEN executado:
1. contrato `scripts/test-marketing-library-v1.mjs` criado antes da implementação no commit `a0004e9cbe7302fcdd46de03211100d6e75b599b`;
2. workflow atualizado no commit `29f985b5ba8c0627c7de2624c2214a0ac17ded8c` para exigir syntax-check e o novo contrato;
3. run `34645596438` falhou como esperado no `Syntax check dormant private Marketing UI` porque `admin-v3/marketing-library-v1.js` ainda não existia;
4. implementação criada no commit `6c274b6d429281598b6482de2f2c07cd87d48f3c`;
5. run `34645688708` concluiu `success` com syntax check + clean safety + editor + library contract;
6. guard geral foi endurecido no commit `ebd20fd03a489f0de8e84d808317a40e90221483` para proibir o mount da biblioteca no Admin público e validar JWT/fail-closed/no-provider;
7. run `34645794869` concluiu `success`, com todos os passos do `safety-contract` verdes.

## Segurança / Supabase Advisor
- Marketing continua no padrão server-only: RLS ligado, sem grants de `anon/authenticated` nas tabelas/RPCs auditadas.
- INFO `RLS Enabled No Policy` para tabelas Marketing permanece compatível com esse padrão server-only.
- WARNs de `SECURITY DEFINER` observados continuam pertencendo a WhatsApp/Agent Workflow, fora desta frente.
- Foi detectada uma vulnerabilidade global preexistente e fora do Marketing: `public.agent_eval_release_markers` está com RLS desabilitado. Não foi alterada nesta rodada porque habilitar RLS sem definir a política correta pode interromper outra frente; precisa ser tratada pelo responsável do Agent Eval.

## Rollout
Nenhuma migration ou Edge Function foi implantada nesta rodada. Nenhum gate do Supabase foi alterado. Nenhuma publicação, geração paga, requeue, Meta/Instagram/Messenger/Ads ou integração externa foi acionada.

## Próxima rodada segura
1. Reauditar `main`/PR #276/Supabase.
2. Continuar o transplante da UI privada por slice coerente, preferencialmente campanhas + calendário/fila/aprovação read-model, mantendo tudo fora do Admin público.
3. Transplantar gradualmente os contratos/renderizadores determinísticos da branch histórica somente quando necessários ao slice, sempre com RED→GREEN.
4. Manter publishers reais, IA paga, requeue e canary totalmente desligados.
5. Não forçar rebase/merge se a divergência com `main` continuar; preservar a branch limpa e resolver integração somente de forma segura.
