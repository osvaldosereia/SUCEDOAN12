# Marketing Center — Run 27 — 2026-09-11

## Escopo
Somente Marketing Dona Antônia. Sem Make. Nenhum publisher real, Ads, Instagram/Messenger, provider de IA ou gasto externo foi ativado.

## Auditoria antes das alterações
- `docs/RETOMADA-DONA-ANTONIA.md` e `docs/MARKETING-CENTER-RUN26-20260911.md` relidos.
- PR #254 auditada: aberta, branch isolada `feat/marketing-center-v1-20260910`, `mergeable=false`; nenhum rebase/merge forçado.
- HEAD inicial observado: `b5bb93cb7edcfba971f021e1c0240686c6e1c31e`.
- `main` avançou novamente em frentes paralelas de Flow/IA/estúdio de produto; nenhuma dessas frentes foi alterada.
- O GitHub continuou retornando 0 workflow runs associados aos HEADs da PR nesta rodada; CI não deve ser declarado verde sem execução conclusiva.
- Supabase `ssbesxgaijknwsjbsbcz` permaneceu `ACTIVE_HEALTHY`.
- Gates auditados antes das mudanças: Marketing OFF, `execution_mode=off`, canary 0%, kill switch ON, geração/render/IA OFF, publishing global e seis canais OFF, atribuição OFF, triagem OFF, requeue OFF, kill switch de triagem ON, aprovação obrigatória e budgets zero.
- Contagens auditadas: 0 assets, 0 render jobs, 0 publication jobs, 0 triage requests e 0 eventos Marketing com efeito externo.

## Deploy pendente da Run 26 concluído
A Edge `admin-marketing-render-triage-v1` pôde ser implantada normalmente nesta rodada, sem contornar bloqueios:
- primeiro deploy da versão com ação `list` -> v2;
- após o bloco V17 abaixo -> v3;
- estado final: `ACTIVE`, `verify_jwt=true`.

A ação `list` da Run 26 permanece server-side, redigida e sem efeito externo. Nenhum provider externo foi chamado.

## Implementado — Renderer Triage Cancel V17
### RPC `cancel_marketing_render_requeue_v1`
Nova ação explícita para cancelar uma solicitação de triagem ainda `pending_review`.

Regras:
- `SECURITY INVOKER`;
- server-only: `anon=false`, `authenticated=false`, `service_role=true`;
- revalida o ator na tabela `admin_users`;
- somente `owner|operator` ativos;
- owner pode cancelar qualquer solicitação pendente;
- operator só pode cancelar solicitação que ele próprio abriu;
- replay sobre `cancelled` retorna sucesso idempotente;
- `approved`, `executed`, `blocked` ou qualquer estado não pendente não são cancelados pela RPC;
- cancellation não consulta nem exige Marketing/triage/requeue gates abertos — é uma ação de segurança/controle;
- cancellation nunca altera `marketing_render_jobs`, nunca coloca job em `queued` e nunca chama renderer/provider;
- registra evento `requeue_cancelled` com `external_side_effect=false`;
- a trilha existente continua imutável e DELETE continua proibido ao service_role.

Migration aplicada no Supabase e persistida em:
`supabase/migrations/20260911054500_marketing_render_triage_cancel_v17.sql`.

### Edge `admin-marketing-render-triage-v1`
Nova ação `cancel`:
- disponível somente após autenticação JWT e RBAC geral `owner|operator`;
- passa `p_actor` a partir do usuário autenticado, sem aceitar identidade arbitrária do browser;
- chama exclusivamente `cancel_marketing_render_requeue_v1`;
- exige `external_side_effect=false` na resposta e falha fechado com `unsafe_cancel_response` em caso contrário;
- approve/execute continuam owner-only;
- nenhuma chamada a Meta, Pinterest, Google, OpenAI ou publisher.

Estado implantado: Edge v3, `ACTIVE`, JWT obrigatório.

## Testes/contratos
`test-marketing-render-triage-v1.mjs` foi ampliado para cobrir V17:
- RPC de cancelamento presente e server-only;
- replay idempotente;
- somente `pending_review` pode ser cancelado;
- RBAC também revalidado no banco;
- operator restrito à própria solicitação;
- evento auditável `requeue_cancelled`;
- ausência de qualquer `UPDATE marketing_render_jobs ... queued` na migration de cancelamento;
- cancelamento independente de gates abertos;
- Edge com ação `cancel` e fail-closed específico;
- ausência de providers externos preservada.

O workflow dedicado já executa `test-marketing-render-triage-v1.mjs`; não foi necessário ampliar a lista de steps.

## Homologação Supabase
Validações concluídas:
- chamada com request inexistente retorna `triage_request_not_found` e `external_side_effect=false`;
- privilégios confirmados: `anon_execute=false`, `authenticated_execute=false`, `service_role_execute=true`;
- Edge implantada em v3, `ACTIVE`, `verify_jwt=true`.

Uma tentativa de homologação transacional com fixtures temporárias e ROLLBACK foi bloqueada pela camada de segurança da ferramenta antes da execução. O bloqueio não foi contornado. Portanto o comportamento de cancel/replay com fixture real deve ser revalidado em uma rodada futura apenas se a ferramenta permitir normalmente.

## Security Advisor
Security Advisor executado após DDL.
- `marketing_render_triage_requests` continua no padrão server-only com RLS e sem policy pública; o advisor mostra `RLS Enabled No Policy` como INFO, coerente com o padrão deliberado do módulo.
- nenhum novo `SECURITY DEFINER` foi introduzido pelo Marketing V17.
- WARNs de `SECURITY DEFINER` encontrados pertencem a outras frentes (Flow/Agent Workflow) e não foram alterados por escopo.
- proteção de senha vazada desabilitada é aviso global de Auth e não foi alterada nesta frente.

## Gates preservados
- Marketing OFF;
- execution_mode OFF;
- canary 0%;
- kill switch ON;
- triagem OFF;
- requeue OFF;
- kill switch de triagem ON;
- aprovação obrigatória;
- geração/renderer/IA OFF;
- publicação global e seis canais OFF;
- atribuição OFF;
- budgets/limites zero.

## Próximo bloco seguro
1. Confirmar execução real do GitHub Actions `Marketing Center V1` no HEAD atual e corrigir apenas falhas de Marketing.
2. Se a ferramenta permitir normalmente, homologar transacionalmente V17 com fixture + ROLLBACK: owner cancel, replay idempotente, operator próprio, operator alheio bloqueado e estado aprovado bloqueado.
3. Levar ao Admin Renderer um botão `Cancelar solicitação` exclusivamente para `pending_review`, sem expor approve/execute e sem depender de abertura de gates.
4. Incluir visualmente estado `cancelled` apenas em histórico/auditoria, sem misturá-lo à fila operacional ativa.
5. Manter requeue real OFF e publishers exclusivamente OFF/dry-run.

O Marketing ainda não está integralmente concluído/homologado.
