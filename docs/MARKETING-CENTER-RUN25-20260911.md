# Marketing Center — Run 25 — 2026-09-11

## Escopo
Somente Marketing Dona Antônia. Sem Make. Nenhum publisher, Ads, Instagram/Messenger, provider de IA ou gasto externo foi ativado.

## Auditoria antes das alterações
- `docs/RETOMADA-DONA-ANTONIA.md` e `docs/MARKETING-CENTER-RUN24-20260911.md` relidos.
- PR #254 auditada: aberta, branch isolada `feat/marketing-center-v1-20260910`, `mergeable=false`; nenhum rebase/merge forçado.
- `main` avançou para `9c13aa44c4843d94840ecead6fd02d9c132c19b0` em frente paralela de chat; não alterada.
- Supabase auditado: Marketing OFF, `execution_mode=off`, canary 0%, kill switch ON, geração/render/IA/publicação OFF; 0 assets, 0 render jobs, 0 publication jobs e 0 eventos Marketing com efeito externo.

## Implementado — Renderer Triage V16
### Fundação transacional
Novos controles em `marketing_runtime_config`, todos seguros por padrão:
- `render_triage_enabled=false`;
- `render_requeue_enabled=false`;
- `render_triage_kill_switch=true`.

Nova tabela server-only `marketing_render_triage_requests`:
- solicitações explícitas de requeue;
- idempotency key única;
- uma solicitação aberta por job;
- estados `pending_review | approved | executed | blocked | cancelled`;
- snapshots de elegibilidade/resultado;
- RLS habilitado e sem acesso `anon/authenticated`;
- `service_role` sem DELETE;
- trigger impede DELETE, mudança da identidade/idempotência e transições inválidas/saída de estado terminal.

### Elegibilidade determinística
`marketing_render_requeue_eligibility_v1` / `preview_marketing_render_requeue_v1` permitem somente:
- lease expirado;
- processamento sem lease;
- fila acima do limiar;
- `failed`;
- `review_required`.

Bloqueiam explicitamente:
- lease ativo;
- job terminal (`rendered/cancelled`);
- asset arquivado;
- versão do job incompatível com a versão atual do asset;
- limite de 20 tentativas;
- job ainda não preso/falhado;
- outra triagem aberta para o mesmo job.

### Request / approve / execute
- `request_marketing_render_requeue_v1`: idempotente, exige gate de triagem e kill switch liberado; não requeueia o job.
- `approve_marketing_render_requeue_v1`: revalida elegibilidade atual sob lock; aprovação stale vira bloqueio.
- `execute_marketing_render_requeue_v1`: exige request aprovado + triagem ON + requeue ON + kill switches liberados + Marketing/generation ON + `execution_mode` em `homologation|canary|live` + gate correspondente ao tipo de render. Revalida tudo antes de mudar o job para `queued`.
- Replay do mesmo execute é idempotente.
- Todos os eventos gravados declaram `external_side_effect=false`.

### RBAC/Admin Edge
Nova Edge `admin-marketing-render-triage-v1`:
- ACTIVE v1;
- `verify_jwt=true`;
- `owner|operator` podem consultar preview e solicitar triagem;
- somente `owner` pode aprovar/executar;
- nenhuma URL/provider de Meta, Pinterest, Google ou OpenAI;
- respostas falham fechadas se `external_side_effect` não for exatamente `false`.

A Edge está implantada, mas a execução real continua impossível porque todos os gates de triagem/requeue e Marketing permanecem OFF.

## Homologação transacional rollback-only
Executada no Supabase e seguida de ROLLBACK integral:
- `failed` elegível;
- lease ativo bloqueado;
- job terminal bloqueado;
- cross-version bloqueado;
- request com triagem OFF falha fechado;
- request idempotente;
- approval válido;
- execute com requeue OFF falha fechado;
- execute com `execution_mode=off` falha fechado;
- execute em homologation temporária funciona dentro da transação;
- replay de execute é idempotente;
- tentativa de adulterar a identidade da triagem é rejeitada pelo trigger.

Pós-rollback confirmado: 0 assets, 0 render jobs, 0 publication jobs, 0 triage requests e 0 eventos Marketing com efeito externo.

## Segurança
- RPCs V16: `anon=false`, `authenticated=false`, `service_role=true`.
- Tabela de triagem: `anon/authenticated` sem SELECT; `service_role` com SELECT/INSERT/UPDATE e `DELETE=false`.
- Security Advisor continua exibindo `RLS Enabled No Policy` no padrão server-only já usado pelo projeto; a nova tabela aparece nessa categoria porque RLS está ON e os papéis públicos foram revogados. Persistem também avisos globais/preexistentes fora do escopo Marketing; nenhum foi alterado nesta rodada.

## CI
- Criado `scripts/test-marketing-render-triage-v1.mjs` cobrindo gates, elegibilidade, RBAC, JWT, idempotência, imutabilidade, privilégios e ausência de providers externos.
- Workflow `Marketing Center V1` atualizado para observar a nova Edge e executar o novo contrato.
- No último check antes deste checkpoint, o HEAD ainda tinha 0 check-runs; não declarar CI verde até existir execução conclusiva.

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
1. Confirmar/corrigir somente o CI dedicado do novo HEAD.
2. Integrar ao painel Renderer uma UI compacta de **preview de elegibilidade** e, somente quando o gate de triagem estiver explicitamente habilitado no futuro, permitir criação da solicitação; não expor botão de execução automática.
3. Criar listagem server-only de triagens pendentes/aprovadas/bloqueadas com IDs abreviados e sem payload/spec/erro bruto.
4. Manter approve/execute restritos a owner e requeue real OFF até autorização/homologação adicional.
5. Continuar sem publishers reais, sem IA paga e sem elevar canary.

O Marketing ainda não está integralmente concluído/homologado.