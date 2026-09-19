# AUTONOMOUS COMPLETION PLAN — Marketing Admin / Organic Social — Dona Antônia

Data: 2026-09-18

Objetivo: concluir **toda programação segura que não depende de interação humana**, mantendo integrações externas sem ativação real. Depois deste plano, devem restar apenas homologações/credenciais/consentimentos e o canary humano.

## Regras imutáveis durante todas as rodadas

- branch canônica: `marketing-admin-round8-continue-20260918`;
- reler HEAD e documentação antes de cada rodada;
- não misturar com Customer & Marketing OS;
- não usar Make como runtime novo;
- não expor tokens/segredos;
- não contornar Meta/Pinterest;
- `enabled=false`;
- `execution_mode=off`;
- `kill_switch=true`;
- `publishing_enabled=false`;
- `max_daily_publications=0`;
- todos os channel gates OFF;
- `attribution_recording_enabled=false` até homologação real;
- sem canary, sem publicação externa, sem cron de publicação;
- todo código de ativação futura deve nascer gated/fail-closed;
- quando um item depender de humano, registrar bloqueio e seguir para o próximo item autônomo.

## Critério de conclusão programática

Marcar **PROGRAMMATIC_COMPLETE** somente quando:
1. todas as rodadas abaixo estiverem concluídas ou explicitamente absorvidas por implementação equivalente;
2. testes estruturais/unitários disponíveis estiverem verdes;
3. Edge Functions/RPCs novos necessários estiverem implantados sem abrir gates;
4. Admin estiver preparado para operar os recursos em modo OFF/preview;
5. HML sintética ponta a ponta estiver verde sem side effect externo;
6. houver documentação final de ativação humana;
7. uma auditoria final reconfirmar 0 publicação real e 0 ativação externa.

---

## Rodada 11 — concluir Observabilidade no Admin

Objetivo: finalizar a integração já iniciada.

Entregas:
- integrar `getMarketingObservability()` ao `load()`;
- painel read-only de saúde/confiança;
- mostrar 0/insufficient_data sem conclusões de performance;
- testes fail-closed da action/client/UI;
- validar action autenticada pelo fluxo do Admin quando possível;
- atualizar docs.

Gate de saída:
- observabilidade visível no Admin;
- nenhum side effect;
- `admin-marketing-insights-v1` protegido e testado.

## Rodada 12 — Agenda Editorial V2

Objetivo: concluir toda programação de calendário que não exige publicação.

Entregas:
- filtros por canal/status/campanha/período;
- visão de conflitos;
- capacidade diária configurada, mantendo limite real 0;
- sugestão de redistribuição;
- preview de reprogramação;
- RPC de schedule/unschedule já existente coberto por testes, mas nenhuma execução automática;
- mobile/responsivo;
- estados vazios/erro/loading.

Gate de saída:
- calendário funcional em preview/edição manual interna;
- nenhum auto-schedule.

## Rodada 13 — Atribuição Comercial V2

Objetivo: deixar toda a cadeia de rastreio programada, mas desativada.

Entregas:
- integrar gerador UTM ao preview de assets/jobs;
- padronizar `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `da_asset`, `da_channel`;
- contratos de captura de click/conversation/order;
- dedupe/idempotency/evidence_key;
- validação de cadeia pai click -> conversation -> order;
- endpoint/Edge Function de ingestão preparado com runtime gate OFF;
- fixtures sintéticas e testes;
- read-model por canal/campanha/asset;
- nenhuma gravação real enquanto `attribution_recording_enabled=false`.

Gate de saída:
- rastreio ponta a ponta testável sinteticamente sem dados externos.

## Rodada 14 — Métricas de Canal V1

Objetivo: programar coletores/adapters e armazenamento sem executar coleta externa real.

Entregas:
- esquema de snapshots de métricas;
- adapters Meta e Pinterest com contratos claros;
- mapeamento de alcance/impressões/views/engagement/saves/shares quando disponíveis;
- normalização de métricas;
- retries/backoff/idempotency;
- health/error model;
- coletores nascem OFF;
- fixtures de respostas externas;
- testes sem chamadas reais;
- painel de métricas preparado para estado “sem dados”.

Gate de saída:
- coletores prontos tecnicamente para homologação após credenciais.

## Rodada 15 — Learning Engine V2

Objetivo: deixar aprendizado completo do lado programático sem IA desnecessária.

Entregas:
- consumir somente métricas/atribuição reais;
- thresholds mínimos por canal/formato;
- anti-repetição por produto/hook/formato;
- memória criativa consolidada;
- tendência apenas descritiva, sem ranking quando amostra insuficiente;
- recomendações OBSERVE/SUGGEST sem auto-action;
- zero IA por padrão; IA recebe somente agregados se futuramente habilitada;
- testes de insufficient_data e dados sintéticos.

Gate de saída:
- engine produz insight somente quando evidência suficiente.

## Rodada 16 — Daily Planner / Orchestrator V2

Objetivo: concluir automação diária em modo dry-run e preparar DRAFT gated.

Entregas:
- shortlist -> objetivo -> campanha candidata -> assets candidatos -> agenda candidata;
- `NO_ACTION` como saída válida;
- dedupe de campanha/produto recente;
- limites de custo;
- limite de frequência;
- capacidade de criar DRAFT somente atrás de gate explícito que continua OFF;
- nenhuma aprovação/publicação automática;
- logs/auditoria;
- testes de dry-run.

Gate de saída:
- uma execução sintética consegue gerar plano completo sem criar side effects.

## Rodada 17 — Autonomy State Machine

Objetivo: formalizar OFF -> OBSERVE -> SUGGEST -> DRAFT -> APPROVAL_REQUIRED -> CANARY -> LIVE.

Entregas:
- máquina de estados explícita;
- transições permitidas;
- transições proibidas sem humano;
- guardas de credencial/identidade/publishing;
- rollback/kill switch;
- status no Admin;
- auditoria de transições;
- CANARY/LIVE inacessíveis enquanto gates atuais estiverem fechados;
- testes de impossibilidade de salto de estado.

Gate de saída:
- autonomia futura controlada por política, não por condicionais dispersas.

## Rodada 18 — Centro de Conexões e Readiness Final

Objetivo: deixar a interface pronta para quando o owner voltar.

Entregas:
- checklist Meta;
- checklist Pinterest;
- callback/status/contas esperadas;
- razão exata de bloqueio;
- botão de tentar novamente somente quando configuração estiver pronta;
- status de token sem expor token;
- token expiry/refresh readiness;
- “o que falta fazer” em linguagem operacional;
- proteção contra IDs errados;
- limpeza de sessões OAuth expiradas;
- testes de readiness.

Gate de saída:
- owner consegue entender exatamente cada pendência sem olhar banco/código.

## Rodada 19 — Publicação Governada / Preflight V2

Objetivo: concluir o caminho de publicação sem executar publicação.

Entregas:
- preflight consolidado para todos os canais;
- requisitos de mídia por canal;
- identidade esperada;
- token/expiração;
- aprovação;
- limits;
- idempotency;
- stale jobs;
- duplicate publish protection;
- manual channels separados;
- simulação de provider response;
- testes de fail-closed para Meta/Pinterest/manual.

Gate de saída:
- job nunca chega ao adapter se qualquer requisito estiver ausente.

## Rodada 20 — Segurança, RBAC, RLS, Vault e Auditoria

Objetivo: hardening final programático.

Entregas:
- revisar service_role-only RPCs;
- revisar authenticated/anon exposure;
- revisar Vault helpers;
- revisar logs para ausência de secrets;
- revisar CORS/auth das Edge Functions;
- owner/operator permissions;
- cleanup de OAuth temp secrets;
- idempotency keys;
- advisory review focado no escopo Marketing;
- corrigir apenas findings do Marketing que possam ser resolvidos sem afetar outros projetos.

Gate de saída:
- nenhum secret em client/log/commit;
- operações críticas owner-only/fail-closed.

## Rodada 21 — Resiliência e Filas

Objetivo: tratar falhas sem operação humana emergencial.

Entregas:
- stale render jobs;
- stale publication jobs;
- retry budget;
- backoff;
- dead-letter/attention state;
- requeue manual segura;
- cleanup de leases;
- diagnósticos redacted;
- idempotência de retries;
- observabilidade de filas.

Gate de saída:
- jobs não ficam presos silenciosamente.

## Rodada 22 — UX, Mobile, Acessibilidade e Estados

Objetivo: acabamento completo do Admin.

Entregas:
- loading/error/empty/success em todos os painéis;
- mobile;
- navegação por teclado;
- labels;
- contraste e foco;
- mensagens de bloqueio claras;
- nenhuma credencial sensível em DOM;
- revisão de cache-busters;
- painel de “Pronto / Bloqueado / Falta ação humana”.

Gate de saída:
- Admin utilizável no celular e desktop sem ambiguidade operacional.

## Rodada 23 — Performance e Custo

Objetivo: fechar desperdícios.

Entregas:
- no-AI on page load;
- cache de read-models quando seguro;
- dedupe de render;
- budgets;
- limites de IA;
- nenhuma variação automática;
- reutilização de mídia;
- queries pesadas auditadas;
- índices necessários no escopo Marketing;
- limites de payload;
- testes/medição de custo lógico.

Gate de saída:
- nenhuma IA ou render caro dispara por navegação simples.

## Rodada 24 — HML Sintética Ponta a Ponta

Objetivo: provar toda a cadeia sem publicação real.

Cenário mínimo:
1. shortlist;
2. DRAFT sintético;
3. assets;
4. render/provider-ready;
5. revisão;
6. aprovação;
7. publication job;
8. schedule preview;
9. preflight;
10. tentativa externa bloqueada;
11. métricas/atribuição sintéticas;
12. learning em fixture suficiente;
13. observabilidade;
14. cleanup.

Entregas:
- suíte automatizada;
- relatório de evidência;
- zero chamada externa;
- zero side effect real.

Gate de saída:
- cadeia completa verde em HML sintética.

## Rodada 25 — Auditoria Final de Código e Documentação

Objetivo: consolidar tudo que foi programado.

Entregas:
- remover duplicação/legado seguro;
- revisar docs;
- atualizar PROJECT-MASTER/ROADMAP/TECHNICAL-INVENTORY;
- matriz de features x status;
- matriz de Edge Functions/RPCs;
- matriz de testes;
- registrar versões implantadas;
- registrar o que está apenas na branch e o que está em main;
- não fazer merge automático se houver risco de trabalho paralelo.

Gate de saída:
- documentação corresponde ao runtime real.

## Rodada 26 — Pacote de Ações Humanas

Objetivo: preparar o owner para executar somente o que não pode ser automatizado.

Criar `HUMAN-ACTIONS.md` com:
- Meta App Domain;
- Valid OAuth Redirect URI;
- OAuth Meta;
- validação da Page/Instagram exatos;
- Pinterest App/Secret;
- OAuth Pinterest;
- board;
- checklist visual;
- canary de uma publicação;
- como verificar resultado;
- como fechar o gate novamente;
- o que fazer em caso de erro.

Também criar `CANARY-RUNBOOK.md`:
- pré-requisitos;
- 1 canal;
- 1 job;
- max_daily_publications=1 somente durante o teste;
- rollback imediato;
- coleta de external_ref;
- verificação visual;
- fechamento do gate.

Gate de saída:
- nenhuma etapa humana depende de conhecimento técnico implícito.

## Rodada 27 — Programmatic Completion Gate

Objetivo: declarar conclusão somente com evidência.

Auditar:
- HEAD/branch;
- migrations;
- Edge versions;
- testes;
- runtime gates;
- 0 publicação real;
- 0 external side effect;
- 0 cron de publicação;
- Make não usado como runtime;
- human blockers listados;
- nenhuma tarefa segura e independente restante no roadmap.

Resultado esperado:
- gravar em CURRENT-STATE/HANDOFF:
  `PROGRAMMATIC_COMPLETE=true`
- registrar timestamp, HEAD e evidências;
- não criar novo escopo artificial;
- rodadas futuras, se ainda dispararem, devem apenas confirmar o gate e não fazer mudanças até o owner executar as ações humanas.
