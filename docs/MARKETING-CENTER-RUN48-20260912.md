# Marketing Center — Run 48 — 2026-09-12

## Escopo desta rodada

Somente Marketing. Nenhum Make, rollout, deploy, publicação real, credencial social, aumento de canary ou gasto pago foi ativado.

## Auditoria antes de alterar

- `docs/RETOMADA-DONA-ANTONIA.md` e `docs/MARKETING-CENTER-RUN47-20260911.md` relidos.
- `main` auditada no SHA `caafcda6408d7abd4b3f2d9f0f0c530ad7de6fae`; mudança recente principal fora do Marketing: worker confiável de imagem de produto.
- PRs recentes auditadas: atividade concorrente concentrada em Vitrine/Admin; mantida a branch isolada `feat/marketing-center-clean-20260911` / PR #276.
- Supabase real auditado antes de qualquer mudança: runtime Marketing OFF, `execution_mode=off`, canary 0%, kill switch ON, geração/render/IA/publicadores OFF, aprovação obrigatória e budgets zero; filas e contas de canais zeradas.
- Todas as tabelas `marketing_%` auditadas continuam com RLS ligado.
- Funções `marketing_%` auditadas continuam `SECURITY INVOKER`, sem EXECUTE para `anon`/`authenticated` e com EXECUTE para `service_role`.
- Security Advisor continua apontando avisos fora do Marketing (WhatsApp/Agent Workflow e leaked-password protection); não foram alterados nesta rodada.

## Bloco 1 — manifesto de render integrado ao preview de aprovação

Arquivos:

- `scripts/marketing-approval-preview-v1.mjs`
- `scripts/test-marketing-approval-preview-v1.mjs`

O preview agora valida o manifesto `marketing-render-manifest-v1` por destino antes de compor o pacote de aprovação:

- WhatsApp Status / Instagram Stories / Facebook Stories -> `story_9_16`;
- Instagram Carrossel / Google Perfil da Empresa -> `square_1_1`;
- Pinterest -> `pinterest_2_3`.

Falha fechado para manifesto adulterado, asset divergente ou formato incompatível. Manifesto ausente segue legível para compatibilidade de preview, mas cria blocker explícito. `ready_for_real_publish=false` permanece incondicional; rede e mutações permanecem OFF.

### TDD

- RED: commit `3921bd68653ae11aeefa238418e3aed9a3a9b3bb`, run `34673806699`, falha exatamente em `Validate local-only Marketing approval preview contract`.
- GREEN: commit `f27edebffb0eca801d409c6105b0395de6e3bb2d`, run `34673845425`, `completed/success`.

## Bloco 2 — rasterização PNG sem IA, local e em memória

Foi confirmado que o próprio repositório já usa `sharp@0.34.3` pinado em GitHub Actions. Não foi encontrado runtime de vídeo/FFmpeg igualmente pinado; por isso encode de vídeo continua inexistente nesta branch.

Arquivos:

- `scripts/marketing-rasterize-png-buffer-v1.mjs`
- `scripts/test-marketing-rasterize-png-buffer-v1.mjs`
- `.github/workflows/marketing-center-clean-v1.yml`

O novo rasterizador:

- recebe somente SVG em bytes + manifesto seguro;
- produz PNG em `Buffer`, sem gravar arquivo;
- usa dimensões do manifesto 1:1, 9:16 ou 2:3;
- limita SVG de entrada a 5 MB;
- rejeita manifesto de vídeo e manifesto adulterado;
- calcula SHA-256 e idempotency key determinística;
- mantém `external_side_effect=false`, `network_allowed=false`, `provider_call_allowed=false` e `storage_write_allowed=false`;
- não acessa Supabase, filas, storage, Meta, Google, Pinterest, OpenAI ou filesystem.

O workflow instala apenas `sharp@0.34.3`, exatamente pinado, e executa syntax-check + contrato real de rasterização.

### TDD

- RED: commit `a933654ad94a4d6aaa73e09c3ad680287caa2d46`, run `34673887437`, instalação do Sharp passou e o workflow falhou no syntax-check porque o módulo de produção ainda não existia.
- GREEN: commit `4a911e4a858c161e20624937a4f8c8f30e694d3b`, run de PR `34673938218`, `completed/success`. Todos os passos do Marketing passaram, inclusive `Validate in-memory PNG rasterizer`.

## Pós-auditoria Supabase

Sem alteração de estado:

- assets: 0
- render jobs: 0
- publication jobs: 0
- triage requests: 0
- channel accounts: 0
- eventos internos: 8
- eventos com `external_side_effect=true`: 0

Runtime segue:

- Marketing OFF;
- `execution_mode=off`;
- canary 0%;
- kill switch ON;
- geração determinística OFF;
- IA de imagem/vídeo OFF;
- publicação global OFF;
- todos os seis publishers OFF;
- aprovação obrigatória;
- attribution/triage/requeue OFF;
- budgets zero.

Nenhuma migration, Edge Function ou integração foi implantada/reimplantada.

## Decisões de segurança

- Não fazer rebase/merge automático com `main`, pois há forte atividade concorrente fora do Marketing.
- Não criar executor de vídeo sem runtime pinado e contrato determinístico equivalente.
- Não persistir o PNG no Storage ainda; o rasterizador é estritamente em memória para manter ausência de efeitos externos.
- Não ligar a UI privada ao Admin público nesta rodada.

## Próximo bloco seguro

1. Evoluir a UI privada de approval preview para exibir `render_validation`/perfil esperado/atual, ainda read-only e dormente.
2. Criar um pacote efêmero `SVG -> manifesto -> PNG buffer -> preview metadata` sem upload/storage, preservando idempotência e hashes.
3. Só estudar executor de vídeo após existir runtime pinado/homologado no repositório; até lá vídeo continua apenas como manifesto/plano.
4. Manter IA real, publishers, dispatch, requeue, canary e gastos pagos totalmente OFF.

## Estado

Marketing ainda não está integralmente concluído/homologado. A execução recorrente deve continuar.