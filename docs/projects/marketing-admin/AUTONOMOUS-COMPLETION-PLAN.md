# AUTONOMOUS COMPLETION PLAN — Marketing Admin / Organic Social — Dona Antônia

Data: 2026-09-18

Objetivo: concluir **toda programação segura que não depende de interação humana** em apenas **9 rodadas amplas**, concentrando múltiplos blocos relacionados em cada execução. Depois disso, devem restar apenas homologações/credenciais/consentimentos e o canary humano.

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
- cada rodada deve avançar o máximo possível e pode concluir vários subblocos;
- não encerrar uma rodada por ter concluído apenas uma subtarefa se ainda houver trabalho independente e seguro;
- quando um item depender de humano, registrar o bloqueio e seguir imediatamente para os demais itens da mesma rodada ou da próxima.

## Critério de conclusão programática

Marcar **PROGRAMMATIC_COMPLETE=true** somente quando:
1. as 9 rodadas abaixo estiverem concluídas ou absorvidas por implementação equivalente;
2. testes estruturais/unitários disponíveis estiverem verdes;
3. Edge Functions/RPCs necessários estiverem implantados sem abrir gates;
4. Admin estiver pronto em modo OFF/preview;
5. HML sintética ponta a ponta estiver verde sem side effect externo;
6. documentação e runbooks humanos estiverem prontos;
7. auditoria final reconfirmar 0 publicação real e 0 ativação externa;
8. não existir mais nenhuma tarefa segura e independente restante.

---

## Rodada 11 — Observabilidade + Agenda Editorial

Objetivo: fechar toda a camada de visibilidade operacional e calendário interno.

Entregas:
- integrar `getMarketingObservability()` ao `load()`;
- painel read-only de saúde/confiança;
- estados `insufficient_data`, zero-data, atenção e erro;
- testes fail-closed action/client/UI;
- validar action autenticada quando possível;
- filtros de agenda por canal/status/campanha/período;
- visão de conflitos;
- capacidade diária configurada, mantendo limite real 0;
- sugestão de redistribuição;
- preview de reprogramação;
- cobertura de schedule/unschedule;
- mobile/responsivo;
- loading/error/empty states.

Gate de saída:
- observabilidade e agenda utilizáveis no Admin;
- nenhum auto-schedule e nenhum side effect.

## Rodada 12 — Atribuição Comercial + Métricas de Canal

Objetivo: deixar rastreio e métricas totalmente programados, mas desligados.

Entregas:
- integrar UTM aos assets/jobs;
- padronizar `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `da_asset`, `da_channel`;
- contratos click -> conversation -> order;
- dedupe/idempotency/evidence_key;
- endpoint de ingestão preparado com gate OFF;
- fixtures sintéticas de atribuição;
- read-model por canal/campanha/asset;
- esquema de snapshots de métricas;
- adapters Meta/Pinterest para alcance/impressões/views/engagement/saves/shares quando disponíveis;
- normalização, retry/backoff, idempotência e health/error model;
- coletores nascem OFF;
- painel de métricas preparado para “sem dados”;
- nenhuma gravação real enquanto `attribution_recording_enabled=false`.

Gate de saída:
- rastreio e métricas testáveis sinteticamente sem chamadas externas reais.

## Rodada 13 — Learning Engine + Memória Criativa + Daily Planner

Objetivo: concluir a inteligência interna sem exigir publicação.

Entregas:
- Learning Engine V2 com thresholds mínimos;
- consumir somente métricas/atribuição reais;
- anti-repetição por produto/hook/formato;
- memória criativa consolidada;
- tendência descritiva apenas quando houver evidência;
- zero IA por padrão;
- IA futura recebe somente agregados;
- Daily Planner V2: shortlist -> objetivo -> campanha candidata -> assets candidatos -> agenda candidata;
- `NO_ACTION` como saída válida;
- dedupe de campanha/produto recente;
- limites de custo e frequência;
- DRAFT preparado atrás de gate explícito OFF;
- logs/auditoria;
- testes com insufficient_data e fixtures suficientes.

Gate de saída:
- engine e planner produzem plano completo em dry-run sem side effects.

## Rodada 14 — Autonomy State Machine + Connection Readiness

Objetivo: formalizar autonomia e deixar as conexões prontas para o owner.

Entregas:
- máquina de estados OFF -> OBSERVE -> SUGGEST -> DRAFT -> APPROVAL_REQUIRED -> CANARY -> LIVE;
- transições permitidas e proibidas;
- guardas de credencial, identidade, publishing e aprovação;
- rollback/kill switch;
- auditoria de transições;
- CANARY/LIVE inacessíveis enquanto gates atuais estiverem fechados;
- checklist Meta;
- checklist Pinterest;
- callback/status/contas esperadas;
- motivo exato de bloqueio;
- status de token/expiração sem expor token;
- proteção contra IDs errados;
- limpeza de sessões OAuth expiradas;
- testes de readiness;
- tela operacional “o que falta fazer”.

Gate de saída:
- autonomia controlada por política e owner consegue entender pendências sem olhar banco/código.

## Rodada 15 — Publicação Governada + Resiliência de Filas

Objetivo: concluir todo caminho de publicação sem publicar.

Entregas:
- preflight consolidado para todos os canais;
- requisitos de mídia por canal;
- identidade esperada;
- token/expiração;
- aprovação;
- limits;
- idempotency;
- duplicate publish protection;
- manual channels separados;
- simulação de provider response;
- fail-closed Meta/Pinterest/manual;
- stale render jobs;
- stale publication jobs;
- retry budget/backoff;
- attention/dead-letter state;
- requeue manual segura;
- cleanup de leases;
- diagnósticos redacted;
- observabilidade das filas.

Gate de saída:
- job não alcança adapter quando faltar qualquer requisito e jobs não ficam presos silenciosamente.

## Rodada 16 — Segurança + RBAC/RLS/Vault + Performance/Custo

Objetivo: fechar hardening e desperdícios em um único bloco.

Entregas:
- revisar service_role-only RPCs;
- revisar exposure authenticated/anon;
- revisar Vault helpers;
- revisar logs para ausência de secrets;
- revisar CORS/auth das Edge Functions;
- owner/operator permissions;
- cleanup de OAuth temp secrets;
- idempotency keys;
- advisory review focado no Marketing;
- corrigir findings do Marketing que não afetem projetos paralelos;
- no-AI on page load;
- cache de read-models quando seguro;
- dedupe de render;
- budgets e limites de IA;
- nenhuma variação automática;
- reutilização de mídia;
- queries pesadas auditadas;
- índices necessários;
- limites de payload;
- testes de custo lógico.

Gate de saída:
- nenhum secret exposto, operações críticas fail-closed e nenhuma IA/render caro disparando por navegação simples.

## Rodada 17 — UX Final + Mobile + Acessibilidade + Operação

Objetivo: acabamento completo do Admin para uso real.

Entregas:
- loading/error/empty/success em todos os painéis;
- mobile e desktop;
- navegação por teclado;
- labels;
- contraste/foco;
- mensagens de bloqueio claras;
- nenhuma credencial sensível no DOM;
- cache-busters revisados;
- painel “Pronto / Bloqueado / Falta ação humana”;
- consistência visual dos módulos de Marketing;
- revisão operacional de campanhas, conteúdo, calendário, publicações, métricas e conexões.

Gate de saída:
- Admin utilizável no celular e computador sem ambiguidade operacional.

## Rodada 18 — HML Sintética Ponta a Ponta + Regressão

Objetivo: provar toda a cadeia de forma automatizada sem publicação real.

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
12. learning com fixture suficiente;
13. observabilidade;
14. resiliência/retry;
15. cleanup.

Entregas:
- suíte automatizada;
- regressão das Rodadas 11–17;
- relatório de evidência;
- zero chamada externa;
- zero side effect real;
- correção de falhas encontradas na própria rodada.

Gate de saída:
- cadeia completa verde em HML sintética.

## Rodada 19 — Auditoria Final + Documentação + Pacote Humano + Completion Gate

Objetivo: concluir tudo e entregar somente as ações que realmente dependem do owner.

Entregas:
- remover duplicação/legado seguro;
- revisar PROJECT-MASTER/ROADMAP/TECHNICAL-INVENTORY;
- matriz de features x status;
- matriz de Edge Functions/RPCs;
- matriz de testes;
- versões implantadas;
- registrar o que está na branch e o que está em main;
- criar `HUMAN-ACTIONS.md`;
- criar `CANARY-RUNBOOK.md`;
- documentar Meta App Domain;
- Valid OAuth Redirect URI;
- OAuth Meta;
- Page/Instagram exatos;
- Pinterest App/Secret/OAuth/board;
- checklist visual;
- canary de 1 publicação;
- rollback imediato;
- verificação de `external_ref`;
- fechamento do gate após teste;
- auditorar HEAD, migrations, Edge versions, runtime gates e automações;
- confirmar 0 publicação real, 0 external side effect e 0 cron de publicação;
- confirmar Make fora do runtime;
- confirmar que não resta tarefa segura independente.

Resultado esperado:
- gravar em CURRENT-STATE/HANDOFF:
  `PROGRAMMATIC_COMPLETE=true`;
- registrar timestamp, HEAD e evidências;
- não criar novo escopo artificial;
- rodadas futuras apenas reconfirmam o gate e aguardam o owner.
