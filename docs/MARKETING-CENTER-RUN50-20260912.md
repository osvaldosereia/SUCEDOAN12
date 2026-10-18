# Marketing Center — Run 50 — 2026-09-12

## Escopo desta rodada

Somente Marketing. Nenhum Make, deploy, migration, Edge Function, rollout, publicação real, credencial social, aumento de canary, IA paga ou gasto externo foi ativado.

## Auditoria antes de alterar

- `docs/RETOMADA-DONA-ANTONIA.md` e `docs/MARKETING-CENTER-RUN49-20260912.md` relidos.
- `main` auditada no SHA `335a762e57f049c1d07c2d6e4b65af307740448c`; atividade recente permaneceu concentrada em Admin/Vitrine/Flow e processamento de imagens, fora do Marketing.
- PRs recentes auditadas; mantida a branch isolada `feat/marketing-center-clean-20260911` / PR #276, sem rebase, merge ou force-push automático.
- Supabase real auditado antes de alterar: Marketing OFF, `execution_mode=off`, canary 0%, kill switch ON, geração/render/IA/publicadores OFF, aprovação obrigatória, attribution/triage/requeue OFF e budgets zero.
- Baseline: 0 assets, 0 render jobs, 0 publication jobs, 0 triage requests, 0 channel accounts, 8 eventos internos e 0 eventos com efeito externo.
- Changelog Supabase revisado; a mudança de grants explícitos na Data API reforça a decisão de manter as tabelas Marketing protegidas por RLS e sem grants públicos implícitos.

## Bloco — pipeline de imagem totalmente em memória

Arquivos:

- `scripts/test-marketing-render-image-preview-pipeline-v1.mjs`
- `scripts/marketing-render-image-preview-pipeline-v1.mjs`
- `.github/workflows/marketing-center-clean-v1.yml`

Foi implementada a cadeia local única:

`spec -> SVG bytes em memória -> manifesto seguro -> PNG Buffer -> preview metadata`

Características de segurança:

- sem `node:fs` no pipeline novo;
- sem escrita em filesystem;
- sem Storage;
- sem `fetch`, HTTP, provider ou credenciais;
- imagens de entrada chegam apenas como `Buffer` em `image_assets`;
- referências por `asset_ref`, sem caminhos locais;
- URL remota é recusada com `remote_source_forbidden`;
- qualquer `src` de filesystem é recusado com `filesystem_source_forbidden`;
- limite de 4 MB por imagem de entrada;
- limite agregado de 12 MB em imagens de entrada;
- máximo de 24 layers e canvas máximo de 2160 px;
- perfil do manifesto precisa coincidir exatamente com as dimensões da spec;
- hashes SHA-256 de SVG e PNG;
- chaves de idempotência determinísticas;
- metadados de aprovação não contêm bytes de SVG ou PNG;
- `preview_only=true`;
- `external_side_effect=false`;
- `network_allowed=false`;
- `provider_call_allowed=false`;
- `storage_write_allowed=false`;
- `filesystem_write_allowed=false`.

Modos `ai`/`hybrid` continuam sem executar IA. Quando o manifesto exige IA, o pipeline exige um `marketing-ai-preflight-v1` seguro com provider/rede ainda bloqueados; nenhuma chamada real é criada.

## TDD

RED real:

- teste criado primeiro no commit `9b0020519a14e2de3baed5a62e165bb7fefc4b5b`;
- workflow passou a exigir o novo contrato no commit `c908f7f5e522cbf23e1958976037db6fc8973a97`;
- run `34679040937` terminou em `failure`, exatamente no syntax-check porque `marketing-render-image-preview-pipeline-v1.mjs` ainda não existia.

GREEN real:

- implementação funcional no commit `1fa3d3deb06b799697cd8c075cbe7123695c8120`;
- run `34679085570` terminou em `success`;
- todos os 21 passos do workflow Marketing passaram, incluindo o novo contrato `Validate fully in-memory Marketing image preview pipeline`.

## Pós-auditoria do Supabase

Estado permaneceu fechado:

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

Todas as tabelas `marketing_%` auditadas seguem com RLS ligado. Todas as funções `marketing_%` auditadas seguem `SECURITY INVOKER`, sem EXECUTE para `anon`/`authenticated` e com EXECUTE para `service_role`.

Nenhuma migration, Edge Function, credencial ou integração foi implantada/reimplantada.

## PR / isolamento

- PR #276 continua aberta e draft.
- Após o commit funcional, o GitHub reportou `mergeable=true`.
- Nenhum rebase, merge ou force-push contra a `main` foi executado.

## Próximo bloco seguro

1. Integrar o novo pipeline em memória ao approval preview privado sem expor os buffers na UI.
2. Adicionar orçamento explícito de memória/complexidade por preview e validação de assinatura/hash entre `spec`, manifesto, SVG e PNG.
3. Evoluir edição rápida sem IA usando somente specs versionadas e previews locais.
4. Manter vídeo apenas como manifesto/plano até existir runtime de encode pinado e homologado.
5. Manter IA real, publishers, dispatch, requeue, canary, Instagram/Messenger/Ads e qualquer gasto pago completamente OFF.

## Estado

Marketing ainda não está integralmente concluído/homologado. A execução recorrente deve continuar.
