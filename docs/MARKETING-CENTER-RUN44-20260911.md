# Marketing Center — Run 44 — 2026-09-11

## Escopo

Continuação autônoma exclusiva do módulo Marketing na branch limpa `feat/marketing-center-clean-20260911` / PR #276. Nenhum Make, deploy, publisher externo, credencial social, IA paga, canary ou gasto foi habilitado.

## Auditoria antes de alterar

- Lido `docs/RETOMADA-DONA-ANTONIA.md` na `main`.
- Lido o checkpoint anterior `docs/MARKETING-CENTER-RUN43-20260911.md`.
- PR #276 auditada antes da alteração; permaneceu draft/aberta, mas passou a `mergeable=false` após forte avanço concorrente da `main`.
- `main` atual auditada no SHA `a905057b463f29816c433932c518156416452f8d`.
- PRs recentes auditadas; mudanças concorrentes foram principalmente Vitrine/Admin/Flow e não foram incorporadas à força na branch Marketing.
- Comparação branch/main mostrou divergência grande desde o merge-base `dd3f29a4a6eff6a5dc77f3f2dd524f0f7c1a89d0`; por segurança não houve rebase, force-push ou merge forçado.
- Supabase `ssbesxgaijknwsjbsbcz` auditado antes do código e permaneceu `ACTIVE_HEALTHY`.
- Estado inicial confirmado: 0 assets, 0 render jobs, 0 publication jobs, 0 triage requests, 0 channel accounts, 8 eventos internos e 0 eventos com efeito externo.
- Runtime confirmado fail-closed: Marketing OFF, execution mode OFF, canary 0%, kill switch ON, geração/render/IA OFF, publicação global OFF, seis publishers OFF, atribuição OFF, triage/requeue OFF, aprovação obrigatória e budgets zero.
- Todas as tabelas `marketing_%` auditadas permanecem com RLS ligado.
- Security Advisor reconsultado. Os WARNs de `SECURITY DEFINER` encontrados pertencem a WhatsApp/Agent Workflow, não ao Marketing. O INFO `RLS enabled no policy` nas tabelas Marketing permanece coerente com o desenho server-only atual: `public/anon/authenticated` revogados e acesso administrativo mediado pelas Edges/RPCs protegidas.

## Bloco implementado

### 1. Preview local de aprovação

Arquivos:

- `scripts/marketing-approval-preview-v1.mjs`
- `scripts/test-marketing-approval-preview-v1.mjs`

O builder combina um asset em revisão com um ou mais destinos e o preflight local já homologado, produzindo um pacote de visualização seguro.

Garantias:

- `preview_only=true`;
- `approval_state=preview_only`;
- `ready_for_real_publish=false` sempre;
- `external_side_effect=false`;
- `network_allowed=false`;
- `mutations_allowed=false`;
- não retorna o payload bruto do alvo, evitando refletir material sensível;
- reutiliza o preflight local dos seis canais;
- expõe blockers explícitos quando runtime/gates/orçamento não permitem rollout;
- idempotency key determinística por asset normalizado + snapshot seguro do runtime + preflights;
- não possui publish, execute, approve, schedule, requeue ou chamada externa.

Blockers cobertos incluem:

- Marketing desligado;
- kill switch ligado;
- execution mode diferente de live;
- publishing global desligado;
- gate do canal desligado;
- budget diário de publicação zerado;
- preflight inválido por canal.

Mesmo se esses blockers fossem removidos futuramente, este módulo continua não executável por contrato: é apenas preview.

### 2. Renderer determinístico offline de imagem em SVG

Arquivos:

- `scripts/marketing-render-svg-v1.mjs`
- `scripts/test-marketing-render-svg-v1.mjs`

Foi escolhido SVG puro nesta branch limpa para evitar transplantar `sharp`/dependências históricas da PR #254 sem um manifesto de dependências atual na raiz.

Capacidades atuais:

- canvas configurável de 320 a 2160 px;
- fundo editável;
- até 24 layers;
- retângulos/cards com radius e cor;
- texto com posição, largura, tamanho, peso, alinhamento, cor e múltiplas linhas;
- imagens locais PNG/JPEG/WebP embutidas como data URI;
- `contain`/`cover` por `preserveAspectRatio`;
- saída SVG editável e leve;
- diretórios de saída criados localmente quando necessário.

Guardas:

- fontes de imagem remotas são recusadas;
- path traversal para fora do diretório de trabalho é recusado;
- SVG de entrada não é aceito como imagem para evitar conteúdo ativo/referências externas;
- formatos de imagem são allowlisted;
- limites de canvas/layers/texto;
- nenhuma rede/provider/IA;
- `ai_used=false`;
- `network_allowed=false`;
- `external_side_effect=false`;
- idempotency key determinística da composição final.

Isso cria o primeiro caminho de geração de imagem **sem IA** na branch limpa, ainda puramente offline e não conectado a fila/publicação.

## TDD / CI

### RED

Contratos foram persistidos antes das implementações e adicionados ao workflow no commit `14092191f7a6d5470c15af818c8283305ae130e5`.

Workflow `Marketing Center Clean Transplant` run `34662603112` concluiu `failure`.

A evidência do job mostrou:

- syntax-check anterior: success;
- clean transplant: success;
- editor: success;
- library: success;
- operations read-only: success;
- readiness: success;
- channel preflight: success;
- **approval preview: failure** porque a nova implementação ainda não existia;
- renderer SVG ficou skipped após a falha anterior.

Portanto o RED foi isolado ao novo comportamento.

### GREEN

Implementações:

- approval preview: commit `3c2be74ef8f1d27837a40ee9f226762a8072caac`;
- renderer SVG: commit `52d67a1c7832922f9e96d3ebe29d61409b5edc0e`;
- workflow endurecido com syntax-check dos dois módulos: commit `f9adf1fcafed0535773772d91a9e101719e8210b`.

Workflow run `34662716835` terminou `completed/success`.

Todos os passos Marketing ficaram verdes, incluindo:

- syntax check das UIs e tooling;
- clean transplant;
- editor;
- biblioteca;
- operações read-only;
- métricas/readiness;
- channel preflight;
- approval preview;
- renderer SVG offline.

## Auditoria pós-implementação

Supabase foi reconsultado sem deploy/redeploy e permaneceu inalterado:

- 0 assets;
- 0 render jobs;
- 0 publication jobs;
- 0 triage requests;
- 0 channel accounts;
- 8 eventos internos;
- 0 eventos com efeito externo.

Runtime continua exatamente fechado:

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

Nenhuma migration ou Edge Function foi implantada/reimplantada nesta rodada.

## PR / concorrência

PR #276 continua sendo a candidata limpa do Marketing. A PR histórica #254 segue apenas como doadora/referência técnica.

A `main` avançou de forma intensa em Admin V3, Vitrine e WhatsApp Flow. Não reconciliar isso com force/rebase automático. A próxima rodada deve primeiro reauditar a condição de merge da #276 e, se necessário, preparar um novo transplante incremental baseado na `main` atual em vez de forçar a branch antiga.

## Próximo bloco seguro

1. criar a superfície privada/dormente que **somente renderiza** o pacote `marketing-approval-preview-v1`, sem botões mutantes;
2. integrar essa visualização ao read-model de aprovação apenas após autenticação, mantendo o Admin público isolado;
3. avançar o renderer sem IA para rasterização/vídeo somente se a dependência/ambiente puder ser homologada na branch limpa sem introduzir rede ou provider;
4. criar preflight de IA imagem/vídeo que apenas estime/valide orçamento e gates, sem chamar provider;
5. continuar mantendo publicadores reais, IA paga, requeue e canary OFF.

## Estado de conclusão

Marketing ainda não está integralmente concluído/homologado. Não desativar a continuidade recorrente ainda.