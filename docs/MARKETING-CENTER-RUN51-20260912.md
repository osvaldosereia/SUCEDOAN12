# Marketing Center — Run 51 — 2026-09-12

## Escopo desta rodada

Somente Marketing. Nenhum Make, deploy, migration, Edge Function, rollout, publicação real, credencial social, aumento de canary, IA paga ou gasto externo foi ativado.

## Auditoria antes de alterar

- `docs/RETOMADA-DONA-ANTONIA.md` e `docs/MARKETING-CENTER-RUN50-20260912.md` relidos.
- `main` auditada no SHA `e4933c7a8657701c5271ed109230bcaecb619ed1`; atividade recente permaneceu concentrada em Flow/Admin/Vitrine, fora do Marketing.
- PRs recentes auditadas; mantida a branch isolada `feat/marketing-center-clean-20260911` / PR #276, sem rebase, merge ou force-push automático.
- Supabase real auditado antes de alterar: Marketing OFF, `execution_mode=off`, canary 0%, kill switch ON, geração/render/IA/publicadores OFF, aprovação obrigatória, attribution/triage/requeue OFF e budgets zero.
- Baseline confirmado: 0 assets, 0 render jobs, 0 publication jobs, 0 triage requests, 0 channel accounts, 8 eventos internos e 0 eventos com efeito externo.
- Todas as tabelas `marketing_%` auditadas seguem com RLS ligado; funções `marketing_%` seguem `SECURITY INVOKER`, sem EXECUTE para `anon`/`authenticated` e com EXECUTE para `service_role`.

## Bloco 1 — orçamento explícito + cadeia de integridade do render

Arquivos:

- `scripts/test-marketing-render-image-preview-pipeline-v1.mjs`
- `scripts/marketing-render-image-preview-pipeline-v1.mjs`

O pipeline totalmente em memória ganhou um orçamento local fail-closed que não pode ampliar os hard caps do runtime:

- imagens de entrada: até 12 MB agregados, preservando 4 MB por imagem;
- SVG gerado: até 2 MB;
- PNG de preview: até 8 MB;
- complexidade: até 240 unidades pelo hard cap; o chamador pode pedir limite menor, nunca maior;
- complexidade considera layers, imagens, texto e área do canvas.

O pipeline agora produz `marketing-render-integrity-v1`, sem bytes brutos, contendo:

- SHA-256 da spec normalizada;
- hashes e tamanho dos assets de origem, sem conteúdo/base64;
- vínculo com a idempotency key do manifesto;
- SHA-256 e idempotency key do SVG;
- SHA-256 e idempotency key do PNG/preview;
- orçamento utilizado e limites efetivos;
- idempotency key determinística do envelope inteiro;
- `preview_only=true`;
- rede/provider/Storage/filesystem/efeito externo OFF.

Falhas novas são explícitas: `input_budget_exceeded`, `render_complexity_budget_exceeded`, `svg_budget_exceeded` e `png_budget_exceeded`.

### TDD do bloco 1

RED real:

- commit de teste `c08516dc86d5555eb1c4706833e15823c032d5d0`;
- run `34681505832` falhou exatamente em `Validate fully in-memory Marketing image preview pipeline`; os contratos anteriores passaram.

GREEN real:

- implementação funcional no commit `5a2971d043eebd0742e0a93fd15e6ef54e58ab4d`;
- run `34681550186` terminou `success`;
- todos os 21 passos do workflow Marketing passaram.

## Bloco 2 — integridade obrigatória no preview privado de aprovação

Arquivos:

- `scripts/test-marketing-approval-preview-v1.mjs`
- `scripts/marketing-approval-preview-v1.mjs`

O preview de aprovação passou a validar também o envelope `marketing-render-integrity-v1` antes de considerar o render tecnicamente coerente.

Validações fail-closed:

- asset, revisão e `render_profile` precisam coincidir entre manifesto, preview e integridade;
- `manifest_idempotency_key` precisa coincidir com o manifesto seguro;
- `png_sha256` precisa coincidir exatamente com o preview rasterizado;
- `preview_idempotency_key` precisa coincidir com o preview;
- hashes da spec/SVG/PNG precisam ter formato SHA-256 válido;
- orçamento precisa estar `within_budget` e conter limites/consumo válidos;
- metadados de assets de origem são sanitizados e nunca carregam bytes;
- todas as flags de rede/provider/Storage/filesystem/efeito externo precisam continuar `false`.

Envelope ausente ou adulterado cria blockers explícitos, por exemplo:

- `render_integrity_missing:<canal>`;
- `render_integrity_invalid:<canal>:png_sha256_mismatch`.

A saída continua invariavelmente:

- `preview_only=true`;
- `approval_state=preview_only`;
- `ready_for_real_publish=false`;
- `mutations_allowed=false`;
- `network_allowed=false`;
- `external_side_effect=false`.

### TDD do bloco 2

RED real:

- commit de teste `fef49a32a473c5f60403308dc114a95bbbbdc907`;
- run `34681590768` terminou `failure` exatamente em `Validate local-only Marketing approval preview contract`.

GREEN real:

- implementação funcional no commit `eeccfc2b2ebb91eb808130bb76e5003dbf2f3058`;
- run `34681663869` terminou `success`;
- todos os 21 passos do workflow Marketing passaram novamente.

## Pós-auditoria do Supabase

Estado permaneceu fechado e sem mutação nesta rodada:

- Marketing OFF;
- `execution_mode=off`;
- canary 0%;
- kill switch ON;
- geração determinística OFF;
- IA de imagem/vídeo OFF;
- publicação global OFF;
- WhatsApp Status OFF;
- Instagram Stories OFF;
- Facebook Stories OFF;
- Instagram Carrossel OFF;
- Pinterest OFF;
- Google Perfil da Empresa OFF;
- aprovação obrigatória;
- attribution/triage/requeue OFF;
- budgets zero;
- 0 assets;
- 0 render jobs;
- 0 publication jobs;
- 0 triage requests;
- 0 channel accounts;
- 8 eventos internos;
- 0 eventos com `external_side_effect=true`.

Nenhuma migration, Edge Function, credencial ou integração foi implantada/reimplantada.

## Segurança fora do escopo encontrada no Advisor

A auditoria global do Supabase expôs problemas preexistentes fora do módulo Marketing. Eles não foram alterados nesta branch para evitar conflito de escopo:

- RLS desabilitado em `agent_eval_release_markers`, `whatsapp_direct_config`, `whatsapp_direct_state`, `whatsapp_direct_templates`, `whatsapp_direct_events` e `whatsapp_basket_media_assets`;
- funções não-Marketing `SECURITY DEFINER` executáveis por `anon` e/ou `authenticated`, incluindo `route_whatsapp_active_basket_address_guard_v52`, `get_agent_workflow_admin_v1`, `save_agent_workflow_stage_v1` e `set_agent_workflow_enabled_v1`;
- proteção contra senhas vazadas permanece desabilitada.

Não corrigir automaticamente dentro da PR de Marketing: habilitar RLS sem reconciliar os consumidores/policies pode bloquear fluxos ativos.

## Próximo bloco seguro

1. Evoluir a edição rápida sem IA usando somente specs versionadas e patches por allowlist.
2. Toda edição deve gerar nova spec/hash e passar novamente pelo pipeline `spec -> SVG -> PNG -> integrity -> approval preview`.
3. Adicionar diff de edição somente metadata/read-only para revisão humana.
4. Manter vídeo real apenas como manifesto/plano enquanto não houver encoder pinado e homologado.
5. Manter IA real, publishers, dispatch, requeue, canary, Instagram/Messenger/Ads e qualquer gasto pago completamente OFF.

## Estado

Marketing ainda não está integralmente concluído/homologado. A execução recorrente deve continuar.
