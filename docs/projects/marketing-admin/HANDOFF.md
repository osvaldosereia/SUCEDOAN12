# HANDOFF — Marketing Admin / Organic Social — Dona Antônia

Leia primeiro `CURRENT-STATE.md`, `AUTONOMOUS-COMPLETION-PLAN.md`, `PROJECT-MASTER.md`, `ROADMAP.md`, `DECISIONS-AND-GUARDRAILS.md` e `TECHNICAL-INVENTORY.md`.

## Branch canônica de desenvolvimento
`marketing-admin-round8-continue-20260918`

## Estado consolidado
Fase `connection_homologation`, com desenvolvimento interno autônomo. Meta App ID `1547249776748513` validado com segredo no Vault via Graph `v26.0`; backend aceita somente Page `1928140920768577` e Instagram Business `17841451162237654` / `@dona_antonia_cuiaba`. Meta ainda depende de App Domain/Valid OAuth Redirect URI e consentimento. Pinterest depende de App/Secret/board.

Publicação deve permanecer fechada: `enabled=false`, `execution_mode=off`, `kill_switch=true`, `publishing_enabled=false`, `max_daily_publications=0`, `attribution_recording_enabled=false`, channel gates=false. Sem canary sem autorização explícita. Make não é runtime novo.

## Rodadas concluídas/absorvidas
- Rodada 9 anterior: Agenda V1 `preview_only`, tracking UTM preview, Learning determinístico e Daily Plan dry-run.
- Rodada 10 anterior: `marketing_observability_read_model_v1()` aplicada.
- Rodada 11 do plano condensado: observabilidade + agenda.

### Rodada 11 — checkpoint atual
- `admin-marketing-insights-v1` v17 / ACTIVE / JWT=true expõe `observability` read-only;
- `admin/marketing-api.js` expõe `getMarketingObservability()`;
- `admin/marketing-observability-panel.js` monta automaticamente o painel Saúde e Confiança após autenticação, sem exigir edição concorrente de `marketing.js`;
- validação fail-closed exige `observe_only`, `auto_action=false`, `auto_publish=false`, `auto_schedule=false`;
- teste `tests/marketing-observability-admin-contract.mjs` protege o contrato do Admin;
- Agenda permanece apenas sugestiva/preview, sem auto-schedule;
- runtime revalidado: 0 published jobs e 0 external side effects; todos os gates externos OFF.

## Próxima ação segura — Rodada 12
Executar **Atribuição Comercial + Métricas de Canal** conforme `AUTONOMOUS-COMPLETION-PLAN.md`: integrar UTM aos assets/jobs, contratos click -> conversation -> order, dedupe/idempotency/evidence_key, fixtures sintéticas, read-models e snapshots/adapters de métricas Meta/Pinterest. Ingestão e coletores devem nascer OFF. Não fazer chamadas externas reais.

## Bloqueios humanos
- Meta App Domains + Valid OAuth Redirect URI;
- consentimento OAuth e identidade Meta;
- Pinterest App/Secret/board;
- autorização explícita futura de canary.

## Plano autônomo condensado
O plano canônico possui **9 rodadas amplas, da Rodada 11 à Rodada 19**. Esta regra substitui referências antigas a Rodadas 11–27. Após `PROGRAMMATIC_COMPLETE=true`, não criar novo escopo; apenas preservar os gates e aguardar `HUMAN-ACTIONS.md`.