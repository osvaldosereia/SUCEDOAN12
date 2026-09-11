# Marketing Center — Run 28 — 2026-09-11

## Escopo
Somente Marketing Dona Antônia. Sem Make. Nenhum publisher real, Ads, Instagram/Messenger, provider de IA ou gasto externo foi ativado.

## Auditoria antes das alterações
- `docs/RETOMADA-DONA-ANTONIA.md` e `docs/MARKETING-CENTER-RUN27-20260911.md` relidos.
- PR #254 auditada: aberta na branch isolada `feat/marketing-center-v1-20260910`; nenhum rebase/merge forçado.
- `main` continuou avançando em frentes paralelas de Flow/IA/estúdio de produto; nenhuma dessas frentes foi alterada.
- GitHub Actions ainda retornava 0 workflow runs para o HEAD observado antes deste bloco; CI não deve ser declarado verde sem execução conclusiva.
- Supabase `ssbesxgaijknwsjbsbcz` permaneceu `ACTIVE_HEALTHY`.
- Gates auditados: Marketing OFF, `execution_mode=off`, canary 0%, kill switch ON, geração/render/IA OFF, publishing global e seis canais OFF, atribuição OFF, triagem OFF, requeue OFF, kill switch de triagem ON, aprovação obrigatória e budgets zero.
- Contagens auditadas: 0 assets, 0 render jobs, 0 publication jobs, 0 triage requests e 0 eventos Marketing com efeito externo.

## Implementado — cancelamento seguro no Admin Renderer
A aba Renderer agora expõe uma ação de segurança exclusivamente para solicitações `pending_review`:
- botão `Cancelar solicitação` só é renderizado para `pending_review`;
- a ação chama apenas `triage('cancel')`;
- não existe approve/execute na UI;
- a UI falha fechada se a resposta não terminar em `status=cancelled`;
- após cancelar, a lista é recarregada manualmente;
- nenhum polling contínuo foi introduzido;
- o cancelamento não depende da abertura dos gates de triagem/requeue.

## Histórico separado de cancelados
A listagem de triagem foi evoluída para manter estados operacionais e histórico claramente separados:
- estados operacionais: `pending_review | approved | blocked`;
- histórico: `cancelled`;
- cancelados entram somente quando `include_cancelled=true` é solicitado explicitamente;
- no Admin, `cancelled` aparece em `Histórico cancelado`, fora da fila operacional ativa;
- a projeção permanece redigida: sem snapshots internos, idempotency key, actor ids ou erro bruto.

## Edge `admin-marketing-render-triage-v1`
A Edge foi evoluída e implantada no Supabase:
- estado final observado: `ACTIVE`, versão 4, `verify_jwt=true`;
- `ACTIVE_LIST_STATUSES=[pending_review,approved,blocked]`;
- `HISTORY_LIST_STATUSES=[cancelled]`;
- `include_cancelled` é opt-in;
- `cancel` continua usando identidade derivada da sessão autenticada;
- nova validação fail-closed rejeita resposta de cancelamento cujo estado final não seja `cancelled`;
- nenhuma chamada a Meta, Pinterest, Google, OpenAI ou publisher foi adicionada.

## Testes/contratos
`test-marketing-render-triage-v1.mjs` foi ampliado para cobrir:
- histórico cancelado opt-in e separado dos estados operacionais;
- cancelamento visível apenas para `pending_review`;
- uso explícito de `triage('cancel')`;
- ausência de `approve/execute` na UI;
- fail-closed se o cancelamento não terminar em `cancelled`;
- redaction e ausência de polling/providers preservadas.

Validações locais possíveis nesta rodada:
- `node --check` do `marketing-render-observability-v1.js`: OK;
- `node --check` do `test-marketing-render-triage-v1.mjs`: OK.

## Homologação Supabase
- Edge `admin-marketing-render-triage-v1` v4: ACTIVE, JWT obrigatório.
- `cancel_marketing_render_requeue_v1`: `anon=false`, `authenticated=false`, `service_role=true`.
- Contagens finais: 0 assets, 0 render jobs, 0 publication jobs, 0 triage requests e 0 eventos com efeito externo.
- A homologação com fixtures reais de owner/operator/replay continua pendente; não foi criado dado artificial em produção nesta rodada.

## Security Advisor
Security Advisor executado após o deploy.
- tabelas de Marketing continuam RLS/server-only sem policies públicas, padrão deliberado do módulo;
- nenhum novo `SECURITY DEFINER` foi introduzido por esta Run;
- WARNs de `SECURITY DEFINER` encontrados pertencem a Flow/Agent Workflow e ficaram fora de escopo;
- aviso global de leaked-password protection permanece fora do escopo do Marketing.

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
1. Confirmar execução real do GitHub Actions `Marketing Center V1` no HEAD novo e corrigir apenas falhas de Marketing.
2. Se a ferramenta permitir normalmente, homologar V17 com fixture + ROLLBACK: owner cancel, replay idempotente, operator próprio, operator alheio bloqueado e estado aprovado bloqueado.
3. Evoluir auditoria/read model de triagem para contadores compactos por estado e idade, somente leitura, sem retry automático.
4. Manter requeue real OFF e publishers exclusivamente OFF/dry-run.

O Marketing ainda não está integralmente concluído/homologado.
