# Marketing Center — Run 36 — 2026-09-11

## Escopo
Somente Marketing da Dona Antônia. Sem Make. Nenhum rollout externo, canary, IA paga, Ads, Instagram/Messenger ou publisher foi habilitado.

## Auditoria inicial
- `docs/RETOMADA-DONA-ANTONIA.md` e Run 35 relidos antes das alterações.
- PR #254 permaneceu aberta e isolada; nenhum rebase/merge forçado foi executado.
- `main` auditada em `0902c688c3d88a405a2eb70aae4018c43a0b973d`.
- PRs recentes auditadas; a PR #270 foi integrada na `main` com uma simplificação deliberada do Admin oficial para `app-lite.js`, removendo da interface/carregamento Produtos Live, Menu do Chat, módulos de IA e demais loaders legados.
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

## CI
O workflow `Marketing Center V1` passou a aceitar também `push` na branch isolada `feat/marketing-center-v1-20260910`, além de `main`, para permitir CI da própria branch antes do merge.

Apesar disso, até o fechamento desta rodada o GitHub Actions ainda retornou zero workflow runs/check statuses para os commits consultados. Portanto **CI não é declarado verde**. O ambiente container também continua sem resolver `github.com`, impossibilitando clone local para executar a suíte completa.

## PR / integração
A PR #254 continua `mergeable=false`. A branch está fortemente divergida da `main`; o conflito histórico não foi resolvido por rebase ou merge forçado. Esta rodada reduziu novamente o risco do arquivo compartilhado `admin/config.js`, mas não declara a PR pronta para merge.

## Estado de segurança ao final
Nenhum dado operacional foi criado e nenhum efeito externo ocorreu. Marketing permanece OFF no runtime, canary 0%, kill switch ON, triagem/requeue OFF, geração/render/IA OFF, publishers OFF e budgets zero.

## Próximo bloco seguro
1. confirmar uma execução real do CI da branch quando o Actions disponibilizar run;
2. continuar tratando a PR #254 como branch histórica e divergida, sem merge forçado;
3. avaliar migração do delta Marketing para uma branch limpa baseada na `main` atual somente quando houver forma segura de transplantar os arquivos sem trazer 680 commits divergentes;
4. não habilitar publisher, IA paga, requeue, Instagram/Messenger/Ads ou canary.

O Marketing ainda não está integralmente concluído/homologado programaticamente.
