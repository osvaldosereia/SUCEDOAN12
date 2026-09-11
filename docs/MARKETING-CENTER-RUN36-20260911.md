# Marketing Center — Run 36 — 2026-09-11

## Escopo
Somente Marketing da Dona Antônia. Sem Make. Nenhum rollout externo, canary, IA paga, Ads, Instagram/Messenger ou publisher foi habilitado.

## Auditoria inicial
- `docs/RETOMADA-DONA-ANTONIA.md` e Run 35 relidos antes das alterações.
- PR #254 permaneceu aberta e isolada; nenhum rebase/merge forçado foi executado.
- `main` auditada e PRs recentes revisadas; a PR #270 foi integrada na `main` com uma simplificação deliberada do Admin oficial para `app-lite.js`, removendo da interface/carregamento Produtos Live, Menu do Chat, módulos de IA e demais loaders legados.
- Supabase confirmou 0 `marketing_assets`, 0 `marketing_render_jobs`, 0 `marketing_publication_jobs`, 0 `marketing_render_triage_requests` e 0 `marketing_events.external_side_effect=true`.
- `marketing_readiness_v1()` confirmou Marketing OFF, `execution_mode=off`, canary 0%, kill switch ON, geração/render/IA OFF, publishing global e seis canais OFF, triagem/requeue OFF, kill switch da triagem ON, aprovação obrigatória e budgets zero.
- `marketing_render_triage_sla_v1()` confirmou `healthy`, warning/critical em zero, thresholds 3600/21600 s, redaction integral e `external_side_effect=false`.

## Regressão de compatibilidade encontrada
A Run 35 havia reconciliado `admin/config.js` com uma `main` anterior que ainda continha Produtos Live, Products Console, Menu do Chat, sessão confiável expandida e loaders auxiliares. Depois disso, a PR #270 simplificou oficialmente o Admin.

A branch Marketing, portanto, voltou a ficar incompatível com a intenção atual da `main`: mantinha loaders e endpoints que o Admin oficial passou a remover deliberadamente.

## Correção segura aplicada
`admin/config.js` foi reconstruído novamente a partir da `main` atual e recebeu somente o delta necessário do Marketing:

- preservados `edgeFunction=admin-ops-v1`, `basketsEdgeFunction=admin-baskets-v1`, `customerEdgeFunction=customer-intelligence-v1`, `countAppUrl` e o reaproveitamento simples de sessão existente na `main`;
- acrescentados apenas `marketingEdgeFunction`, `marketingWorkflowEdgeFunction`, `marketingUiEnabled=true` e o loader `loadMarketingCenter`;
- removidos da branch Marketing os loaders não relacionados que a PR #270 retirou do Admin oficial: Products Live, Products Console V3, Menu do Chat, Human Service Center e Financeiro;
- nenhum gate transacional, publisher, renderer, IA ou requeue foi ativado.

O `supabase/config.toml` foi rechecado contra a `main` atual e continua correto: é a configuração oficial atual acrescida somente das sete Edge Functions de Marketing, todas com `verify_jwt=true`.

## Contrato anti-regressão atualizado
`scripts/test-marketing-main-compat-v1.mjs` agora valida a arquitetura simplificada atual do Admin:

- exige os tokens oficiais mínimos da `main`;
- exige somente a integração de Marketing;
- falha se a branch ressuscitar Products Live, Products Console, Menu do Chat, Human Service Center ou Financeiro dentro de `admin/config.js`;
- continua exigindo todas as Edge Functions Marketing com JWT obrigatório.

## CI real da branch
O workflow `Marketing Center V1` passou a aceitar também `push` na branch isolada `feat/marketing-center-v1-20260910`, além de `main`, para permitir CI antes do merge.

A primeira execução real chegou até o contrato `Validate renderer triage metrics safety contract` e falhou. A causa foi localizada no próprio teste V18: ele ainda exigia a assinatura textual antiga `return json({ok:true,items,metrics,runtime:`, enquanto a V19 homologada já havia acrescentado `sla` à resposta segura da mesma ação `list` (`items,metrics,sla,runtime`). A implementação não precisou ser relaxada.

O contrato foi corrigido para exigir simultaneamente métricas V18 e SLA V19. Nova execução do workflow **Marketing Center V1** no commit funcional `490e8019f0b5b4cb48e9bc8806394cf4a4578ad3` concluiu com **status=completed / conclusion=success**. Portanto, pela primeira vez nesta sequência, a suíte da branch Marketing está confirmadamente verde em GitHub Actions.

O container local continuou sem resolver `github.com`, mas deixou de ser necessário como evidência principal após a execução real do Actions.

## PR / integração
A PR #254 continua historicamente divergida e não deve ser integrada por merge/rebase forçado. O CI verde valida o conteúdo da branch, mas não elimina o risco estrutural da divergência contra a `main` atual.

## Estado de segurança ao final
Nenhum dado operacional foi criado e nenhum efeito externo ocorreu. Marketing permanece OFF no runtime, canary 0%, kill switch ON, triagem/requeue OFF, geração/render/IA OFF, publishers OFF e budgets zero.

## Próximo bloco seguro
1. manter o CI verde como gate obrigatório;
2. continuar tratando a PR #254 como branch histórica e divergida, sem merge forçado;
3. preparar uma estratégia de transplantar somente o delta Marketing para uma branch limpa baseada na `main` atual, preservando os contratos verdes e evitando carregar centenas de commits divergentes;
4. não habilitar publisher, IA paga, requeue, Instagram/Messenger/Ads ou canary.

O Marketing ainda não está integralmente concluído/homologado programaticamente.
