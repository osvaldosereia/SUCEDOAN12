# Marketing Center — Run 23 — 2026-09-11

## Escopo
Somente Marketing Dona Antônia. Sem Make. Nenhum rollout, publisher, Ads, Instagram/Messenger, provider de IA ou gasto externo foi ativado.

## Auditoria antes das alterações
- `docs/RETOMADA-DONA-ANTONIA.md` e Run 22 relidos.
- `main` auditada; avançou em frentes paralelas e a PR #254 permanece isolada e `mergeable=false`. Não foi feito rebase/merge forçado.
- Supabase auditado: `enabled=false`, `execution_mode=off`, `canary_percent=0`, `kill_switch=true`, `require_approval=true`, geração/render determinístico/IA/publicação global e os seis canais OFF, atribuição OFF e budgets/limites em zero.
- 0 render jobs e 0 eventos Marketing com `external_side_effect=true`.
- O HEAD da Run 22 continuava sem workflow run/check-run identificável antes desta rodada.

## Implementado
### V15 — diagnóstico seguro do renderer
Migration `20260911024500_marketing_render_diagnostics_v15.sql` com `marketing_render_diagnostics_read_model_v1`:
- somente leitura, `SECURITY INVOKER`;
- EXECUTE revogado de `public/anon/authenticated` e concedido apenas a `service_role`;
- detecta `processing` com lease vencido, `processing` sem lease e jobs `queued` acima do limiar;
- drill-down de falhas/revisões recentes por classe determinística (`timeout`, `rate_limit`, `authentication`, `storage`, `validation`, `network`, `other`);
- não retorna `last_error` bruto, `input_spec`, `output_spec` ou `lease_owner`;
- não executa retry, render, provider, publicação ou qualquer efeito externo.

Homologação real do read-model no Supabase: `ok=true`, `external_side_effect=false`, 0 leases vencidos, 0 processamentos sem lease, 0 filas antigas e 0 falhas recentes.

### Edge de insights v5
`admin-marketing-insights-v1` implantada como versão 5, `verify_jwt=true`, preservando RBAC `owner|operator`.
- compõe métricas existentes com `marketing_render_diagnostics_read_model_v1`;
- valida fail-closed `external_side_effect=false` e todos os marcadores de redaction antes de retornar dados;
- normaliza contadores de lease vencido, processamento sem lease e fila acima do limiar;
- nenhuma chamada a Meta/Pinterest/Google/OpenAI ou publisher.

### Contrato e CI
- Novo `scripts/test-marketing-render-diagnostics-v1.mjs` cobre SECURITY INVOKER, privilégios server-only, sinais de stuck jobs, redaction, ausência de rede/providers e integração fail-closed da Edge.
- Workflow `Marketing Center V1` agora observa `admin-v3/marketing-render-observability-v1.js`, todas as migrations `*marketing*.sql`, executa syntax check do painel Renderer e o novo teste de diagnóstico.
- O workflow ainda não apareceu para o HEAD novo na consulta desta rodada; não considerar CI verde até surgir uma execução conclusiva.

## Auditoria pós-DDL
- `marketing_render_diagnostics_read_model_v1`: `anon=false`, `authenticated=false`, `service_role=true`, `prosecdef=false`.
- Supabase Security Advisor foi executado. Há avisos globais preexistentes em outras frentes e INFO de tabelas RLS sem policies; no Marketing as tabelas seguem deliberadamente server-only/revogadas conforme a arquitetura atual. Nenhum novo SECURITY DEFINER público foi introduzido pela V15.
- Edge `admin-marketing-insights-v1`: ACTIVE v5, JWT obrigatório.

## Gates preservados
- Marketing OFF.
- execution_mode OFF.
- canary 0%.
- kill switch ON.
- aprovação obrigatória.
- geração, renderer determinístico, IA imagem e IA vídeo OFF.
- publicação global OFF.
- WhatsApp Status, Instagram Stories, Facebook Stories, Instagram Carrossel, Pinterest e Google Perfil da Empresa OFF.
- atribuição OFF.
- budgets/limites zero.
- nenhum Make e nenhum gasto/efeito externo.

## Observação de implementação
A camada server-side de diagnóstico está pronta e homologada. A atualização visual do painel para listar esses detalhes não foi incluída nesta rodada; o painel existente continua somente leitura e sem polling/retry. Não habilitar ação corretiva automática enquanto rollout permanecer OFF.

## Próximo bloco seguro
1. Confirmar o GitHub Actions `Marketing Center V1` do HEAD desta Run e corrigir apenas falhas do Marketing.
2. Exibir no painel Renderer, de forma somente leitura, os contadores e listas redigidas de jobs potencialmente presos/falhas recentes retornados pela Edge v5.
3. Adicionar teste de UI para garantir que `last_error`, specs, lease owner e ações de retry nunca sejam expostos.
4. Depois, avançar para uma estratégia manual de triagem/requeue desenhada mas ainda desabilitada por kill switch/gates, sem acionar publishers.

O Marketing ainda não está integralmente concluído/homologado.