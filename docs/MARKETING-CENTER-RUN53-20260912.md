# Marketing Center — Run 53 — 2026-09-12

## Escopo

Continuação autônoma e isolada do módulo Marketing da Dona Antônia, sem Make e sem alterar outras frentes. Nenhum rollout, integração externa, gasto, canary, Instagram/Messenger/Ads, publisher real, Edge Function, migration ou credencial foi ativado nesta rodada.

## Auditoria antes de alterar

- `docs/RETOMADA-DONA-ANTONIA.md` relido na `main`.
- checkpoint anterior relido: `docs/MARKETING-CENTER-RUN52-20260912.md`.
- `main` auditada em `e44ea92449d849bfab64169f8ee4929d401aca33`, com atividade recente concentrada em WhatsApp Flow, fora do Marketing.
- PR #276 mantida aberta e draft; sem rebase, merge ou force-push.
- Supabase `ssbesxgaijknwsjbsbcz` auditado antes e depois; nenhuma mutação de banco foi realizada.

## Bloco 1 — pacote privado/read-only de revisão da edição rápida

Criado `scripts/marketing-quick-edit-review-package-v1.mjs`.

Ele une de forma determinística:

`quick edit metadata -> render integrity -> approval preview`

Propriedades de segurança:
- não carrega o `spec` editável no pacote final;
- não carrega bytes SVG/PNG;
- não carrega legenda, request body, token, credencial ou payload publicável;
- valida `asset_id`, revisão, `render_profile`, `spec_sha256`, hashes SVG/PNG e idempotency keys;
- recusa divergência entre quick edit e render com fail-closed;
- reutiliza o approval preview existente apenas para obter validações e blockers;
- sanitiza cada destino para status e chaves de idempotência, sem conteúdo publicável;
- gera `package_sha256` e `idempotency_key` determinísticos;
- força `preview_only=true`, `mutations_allowed=false`, `external_side_effect=false`, `network_allowed=false`, `provider_call_allowed=false`, `storage_write_allowed=false` e `filesystem_write_allowed=false`.

### TDD

- RED: workflow Marketing `34686482664`, falhou antes da implementação do novo builder.
- GREEN: workflow Marketing `34686503454`, `completed/success` após a implementação.

## Bloco 2 — superfície privada/dormente de revisão

Criado `admin-v3/marketing-quick-edit-review-readonly-v1.js`.

A UI:
- recebe somente `marketing-quick-edit-review-package-v1`;
- valida todos os flags de segurança fail-closed;
- exige vínculo exato do `spec_sha256` entre a edição e a integridade do novo render;
- mostra revisão anterior -> nova revisão, nota da alteração, paths modificados e prefixos de hashes;
- mostra metadados do render e orçamento de complexidade;
- mostra destinos e estados de preflight/render/preview/integridade;
- mostra blockers de rollout preservados;
- faz escaping de HTML;
- não usa `fetch`, credenciais, rede, Storage ou qualquer ação mutante;
- permanece dormente e não foi ligada ao Admin público.

### TDD

- RED: workflow Marketing `34686558568`, `completed/failure` antes de a UI existir.
- GREEN: workflow Marketing `34686608396`, `completed/success` no commit funcional `80ee1ce8161fd91d1cc09f206eec95ae314577e5`.

O GREEN final executou syntax-check e todos os contratos do Marketing Center, incluindo editor, biblioteca, operações/readiness, preflights, approval preview, IA offline, SVG, manifesto, rasterização PNG em memória, pipeline de preview, quick edit, pacote de revisão e nova UI read-only.

## Pós-auditoria Supabase

Runtime continua fechado:
- `enabled=false`;
- `execution_mode=off`;
- canary `0%`;
- kill switch ON;
- generation OFF;
- deterministic render operacional OFF;
- IA de imagem OFF;
- IA de vídeo OFF;
- publishing global OFF;
- WhatsApp Status publisher OFF;
- Instagram Stories publisher OFF;
- Facebook Stories publisher OFF;
- Instagram Carousel publisher OFF;
- Pinterest publisher OFF;
- Google Perfil da Empresa publisher OFF;
- aprovação obrigatória;
- attribution/triage/requeue OFF;
- budgets de publicação/IA em zero.

Contagens:
- 0 assets;
- 0 render jobs;
- 0 publication jobs;
- 0 triage requests;
- 0 channel accounts;
- 8 eventos internos;
- 0 eventos com `external_side_effect=true`.

Segurança Marketing:
- 15/15 tabelas `marketing_%` com RLS ativo;
- funções `marketing_%` auditadas com `SECURITY INVOKER`;
- sem `EXECUTE` para `anon` ou `authenticated` nas funções Marketing auditadas;
- `service_role` permanece o papel com EXECUTE nos RPCs internos.

O Security Advisor também reporta `RLS Enabled No Policy` nas tabelas Marketing. Neste desenho isso mantém acesso cliente fail-closed, coerente com os RPCs internos/service-role e com a ausência de acesso `anon/authenticated`; nenhuma policy foi aberta nesta rodada. Outros avisos do Advisor sobre três funções Agent Workflow `SECURITY DEFINER` e leaked-password protection pertencem a outras frentes e foram apenas registrados, não alterados.

## Estado da PR e concorrência

- PR: #276 — `Marketing Center: clean protected backend transplant`.
- permanece draft e aberta.
- antes deste checkpoint o GitHub reportava `mergeable=true`.
- não houve rebase/merge/force-push contra `main`.
- a `main` auditada permanece `e44ea92449d849bfab64169f8ee4929d401aca33` nesta rodada.

## Proibições preservadas

Continuam proibidos/fechados:
- publicação real;
- endpoints/dispatch externos;
- IA paga/provider real;
- Storage/upload do preview;
- executor real de vídeo;
- requeue automático;
- canary > 0;
- Instagram/Messenger/Ads;
- qualquer gasto pago;
- ligação da superfície Marketing ao Admin público sem nova homologação.

## Próximo bloco seguro

1. integrar o novo pacote de revisão ao editor dormente apenas por handoff em memória/callback local, sem persistência e sem rede;
2. adicionar comparação local entre revisões com resumo de paths/hashes, sem valores sensíveis e sem conteúdo bruto;
3. manter a persistência real atrás dos RPCs/RBAC existentes, sem atalho direto de banco;
4. manter vídeo como manifesto/plano enquanto não existir runtime de encode pinado e homologado;
5. continuar publishers oficiais apenas como builders/preflight/dry-run, sem endpoint/credencial/dispatch.

## Estado de conclusão

O Marketing ainda não está integralmente concluído nem homologado para rollout real. A continuidade deve permanecer ativa; nenhum gate pode ser aberto automaticamente.
