# Marketing Center — Run 43 — 2026-09-11

## Escopo

Continuação autônoma exclusiva do módulo Marketing na branch limpa `feat/marketing-center-clean-20260911` / PR #276. Nenhum Make, deploy, publisher externo, credencial social, IA paga, canary ou gasto foi habilitado.

## Auditoria antes de alterar

- Lido `docs/RETOMADA-DONA-ANTONIA.md` na `main`.
- Lido o checkpoint anterior `docs/MARKETING-CENTER-RUN42-20260911.md`.
- PR #276 auditada; branch limpa mantida isolada da PR histórica #254.
- `main`/PRs recentes auditados; mudanças concorrentes continuam majoritariamente fora do Marketing.
- Supabase auditado no projeto `ssbesxgaijknwsjbsbcz` antes do código.
- Estado inicial confirmado: 0 assets, 0 render jobs, 0 publication jobs, 0 triage requests, 8 eventos internos, 0 eventos com efeito externo e 0 channel accounts.
- Runtime confirmado fail-closed: Marketing OFF, execution mode OFF, canary 0%, kill switch ON, geração/render/IA OFF, publicação global OFF, seis publishers OFF, atribuição OFF, triage/requeue OFF, aprovação obrigatória e budgets zero.

## Bloco implementado

Adicionado preflight/dry-run local para os seis destinos do Marketing:

- WhatsApp Status;
- Instagram Stories;
- Facebook Stories;
- Instagram Carrossel;
- Pinterest;
- Google Perfil da Empresa.

Arquivos:

- `scripts/marketing-channel-preflight-v1.mjs`
- `scripts/test-marketing-channel-preflight-v1.mjs`
- `.github/workflows/marketing-center-clean-v1.yml` atualizado para validar o contrato e syntax-check do builder.

### Garantias do preflight

- puro/local: não executa rede;
- `external_side_effect=false` e `dry_run=true` por contrato;
- não requer nem aceita material de credenciais no preflight;
- `publisher_enabled=false` sempre;
- payloads são somente previews simbólicos, nunca requests reais;
- idempotency key determinística por canal + payload normalizado;
- URLs de mídia precisam ser HTTPS;
- cardinalidade por canal é validada;
- Instagram Carrossel aceita 2–10 mídias;
- Pinterest exige board ref e imagem;
- Google Perfil da Empresa exige location ref estruturado;
- WhatsApp Status permanece `manual_confirm`, sem inventar endpoint de publicação;
- nenhuma URL de API externa é embutida no builder;
- gates necessários são apenas declarados como requisitos futuros, nunca alterados.

## TDD / CI

RED confirmado:

- commit de contrato/workflow: `5019f306a89fb8eda16d480419075a233349b73d`;
- workflow `Marketing Center Clean Transplant` run `34659234207` concluiu `failure`;
- todos os contratos anteriores passaram e somente `Validate local-only Marketing channel preflight contract` falhou, pois o builder ainda não existia.

GREEN confirmado:

- implementação funcional: `2b5171257ae3624f95740e708cd5e94dba6fd066`;
- workflow run `34659344020` concluiu com `safety-contract=success`, incluindo o novo preflight;
- workflow endurecido com syntax-check do builder no commit `52825a970e77e5a9ca8368ce2c3b70dede7f3c43`;
- workflow run `34659391135` concluiu `success`: syntax-check + clean transplant + editor + biblioteca + operações read-only + métricas/readiness + channel preflight, todos verdes.

## Auditoria pós-implementação

Supabase foi reconsultado sem deploy/redeploy:

- 0 assets;
- 0 render jobs;
- 0 publication jobs;
- 0 triage requests;
- 8 eventos internos;
- 0 eventos com efeito externo;
- 0 channel accounts.

Runtime permaneceu exatamente fechado:

- `enabled=false`;
- `execution_mode=off`;
- `canary_percent=0`;
- `kill_switch=true`;
- geração/render determinístico/IA imagem/IA vídeo OFF;
- publicação global e todos os publishers OFF;
- `require_approval=true`;
- limites de publicação/IA/custo em zero;
- attribution/triage/requeue OFF;
- triage kill switch ON.

Nenhuma migration ou Edge Function foi implantada ou reimplantada nesta rodada.

## PR

PR limpa #276 permanece a única candidata de integração do Marketing. A PR #254 continua somente como referência técnica/doadora e não deve ser mergeada diretamente.

## Próximo bloco seguro

Criar a superfície privada/dormente de visualização do preflight e integrar o builder apenas ao fluxo interno de aprovação em modo preview, sem botão de publish/execute. Depois, avançar o renderer determinístico offline de imagem/vídeo (sem IA) e o preflight de IA com budget/gates, mantendo providers reais OFF.

## Estado de conclusão

Marketing ainda não está integralmente concluído/homologado. Não desativar a continuidade recorrente ainda.
