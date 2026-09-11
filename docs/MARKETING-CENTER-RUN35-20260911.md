# Marketing Center — Run 35 — 2026-09-11

## Escopo
Somente Marketing da Dona Antônia. Sem Make. Nenhum rollout externo, canary, IA paga, Ads, Instagram/Messenger ou publisher foi habilitado.

## Auditoria inicial
- `docs/RETOMADA-DONA-ANTONIA.md` e Run 34 relidos antes das alterações.
- PR #254 permaneceu aberta e isolada; nenhum rebase/merge forçado foi executado.
- `main` auditada em `f3e9d11234761fb1823dd14f0c134c2a7860f28f`, com avanço recente do Product Studio fora do escopo Marketing.
- Supabase confirmou 0 `marketing_assets`, 0 `marketing_render_jobs`, 0 `marketing_publication_jobs`, 0 `marketing_render_triage_requests` e 0 `marketing_events.external_side_effect=true`.
- `marketing_readiness_v1()` confirmou Marketing OFF, `execution_mode=off`, canary 0%, kill switch ON, geração/render/IA OFF, publishing global e seis canais OFF, triagem/requeue OFF, kill switch da triagem ON, aprovação obrigatória e budgets zero.
- `marketing_render_triage_sla_v1()` confirmou `healthy`, warning/critical em zero, thresholds 3600/21600 s, redaction integral e `external_side_effect=false`.

## Conflito crítico encontrado
A branch da PR ainda carregava versões antigas de dois arquivos compartilhados com a `main`:

1. `admin/config.js`
2. `supabase/config.toml`

O `admin/config.js` da branch não continha recursos já presentes na `main`, incluindo `productsEdgeFunction`, `chatMenuEdgeFunction`, `trustedBrowserSession`, loaders de Produtos e loader do Menu do Chat. Um merge direto daquela versão poderia regredir funcionalidades fora de Marketing.

O `supabase/config.toml` da branch também não continha várias seções recentes da `main`, incluindo `conversation-worker-v3`, Agent Core/Learning, bootstrap PIN e funções do Shopping Chat/Menu do Chat.

## Correção segura aplicada
### `admin/config.js`
A versão da branch foi reconstruída a partir da configuração atual da `main`, preservando integralmente:
- sessão confiável;
- Produtos Live;
- Products Console V3;
- Menu do Chat;
- Financeiro e demais módulos já presentes.

Foram acrescentados somente os campos/loaders do Marketing:
- `marketingEdgeFunction`;
- `marketingWorkflowEdgeFunction`;
- `marketingUiEnabled=true` apenas para a superfície Admin da branch;
- loader modular `loadMarketingCenter()` e Renderer observability.

Nenhum gate transacional/publicação do Marketing foi alterado; a UI habilitada não habilita geração, publicação, IA ou requeue no backend.

### `supabase/config.toml`
A versão da branch foi reconstruída a partir da configuração atual da `main`, preservando todas as seções recentes e acrescentando somente as sete Edge Functions do Marketing, todas com `verify_jwt=true`:
- `admin-marketing-v1`;
- `admin-marketing-workflow-v1`;
- `admin-marketing-media-v1`;
- `admin-marketing-dry-run-v1`;
- `admin-marketing-insights-v1`;
- `admin-marketing-carousel-v1`;
- `admin-marketing-render-triage-v1`.

## Novo contrato anti-regressão
Criado `scripts/test-marketing-main-compat-v1.mjs` para impedir que futuras rodadas do Marketing removam silenciosamente configurações atuais da `main`.

O contrato exige simultaneamente:
- Produtos, Menu do Chat e sessão confiável no Admin;
- loader/config do Marketing;
- seções atuais críticas do `supabase/config.toml`;
- todas as Edge Functions do Marketing com JWT obrigatório.

O workflow `Marketing Center V1` foi atualizado para executar esse contrato antes dos demais testes.

## Evidência / CI
- Commits desta rodada: `8bcfaa87905b1e5dd15cdc33bd8225bf6fe7db18`, `2e902bfb0f9cd483f23588cc5b46794b9496395e`, `440e4566897088edeef1e641b9f97074e79f4fa0`, `088c4981d1de92cda45fcc7120a0a6b15036a26e`.
- GitHub Actions continuou sem workflow run associado ao HEAD consultado nesta rodada; CI não é declarado verde sem execução real.
- PR #254 ainda aparece `mergeable=false`; portanto a reconciliação dos dois arquivos compartilhados reduziu risco, mas não autoriza merge e não prova que todos os conflitos históricos foram eliminados.

## Estado de segurança ao final
Nenhum dado operacional foi criado e nenhum efeito externo ocorreu. Marketing permanece OFF no runtime, canary 0%, kill switch ON, triagem/requeue OFF, geração/render/IA OFF, publishers OFF e budgets zero.

## Próximo bloco seguro
1. confirmar execução real do CI quando GitHub Actions disponibilizar run;
2. continuar inventário de arquivos compartilhados da PR contra a `main` para localizar os conflitos históricos restantes;
3. reconciliar apenas arquivos realmente compartilhados, sempre tomando a `main` atual como base e reaplicando somente o delta de Marketing;
4. não rebasear/mergear à força e não habilitar publisher, IA paga, requeue ou canary.

O Marketing ainda não está integralmente concluído/homologado programaticamente.