# CURRENT STATE — Customer & Marketing OS

Snapshot canônico atualizado em **19/09/2026 00:14 America/Cuiaba**.

> Este snapshot prevalece sobre checkpoints históricos anteriores. Detalhes de implementação permanecem nos documentos desta pasta e no histórico Git.

## Estado geral

- fase: `internal_homologation`;
- CM-0 e CM-1.1 a CM-1.15: implementadas;
- critérios: **20**;
- verified: **15**;
- implemented aguardando evidência/gate: **5**;
- blocked: **0**;
- `ready_for_manual_canary=true`;
- `cm1_complete=false`;
- `safe_for_internal_homologation=true`;
- `external_activation_authorized=false`;
- external side effect: **false**.

## Critérios ainda não verificados

### 2 — Identity Resolver
- customer_linked=6;
- provider identities=16;
- conflitos reais pendentes=**2**;
- decisão continua humana; nenhum auto-merge.

### 7 — Product View
- collector presente e homologado;
- `product_view=0`;
- aguarda abertura real de produto após deploy; não fabricar evento.

### 13 — Opportunity Lifecycle
- 75 oportunidades históricas/ativas;
- todas atualmente `suppressed`;
- dismissed=0, converted=0, expired=0;
- próxima expiração natural: `2026-09-23T17:00:15.936202+00:00`;
- promoção somente por lifecycle real persistido.

### 15 — Marketing Brain SUGGEST
- capacidade implementada;
- `suggest_enabled=false`;
- briefs=0;
- não ativar IA apenas para produzir evidência.

### 18 — Medição de custo de IA
- AI executions=0;
- custo observado=0;
- orçamento runtime=0;
- ledger/capacidade implementados; evidência real depende de futura execução governada legítima.

## Evidência real atual

- PapoAI receipts=18;
- canonical events 24h=18;
- customers=506;
- `catalog_open=64`;
- `catalog_search=19` — critério 6 já verified por tráfego real;
- `product_view=0`;
- carrinho=437 eventos;
- pedidos=47;
- timeline rows=1376;
- customer_product_stats=699;
- product graph edges=526;
- marketing events=144;
- positive marketing consent customers=0.

## Runtime protegido

### Canal canônico
- provider atual: `papoai`;
- inbound=true;
- outbound=false;
- AI=false;
- auto_reply=false;
- canary=0%;
- Meta Direct ready=false.

### Provider adapter
- PapoAI inbound=active;
- outbound=disabled.

### Marketing
- enabled=false;
- execution_mode=off;
- publishing_enabled=false;
- kill_switch=true;
- max_daily_publications=0;
- max_daily_ai_cost_cents=0.

### External effects 7d
- marketing=0;
- AI Actions=0.

## Meta / WhatsApp Direct

Confirmado:
- WABA presente;
- Phone Number ID presente;
- Graph API `v26.0`;
- Flow health funciona separadamente;
- outbound fail-closed;
- Meta Direct OFF;
- `release_mode=off`.

Ainda pendente:
- `dona_antonia_whatsapp_access_token_v1` no Vault: **não configurado**;
- permissões WhatsApp reais: não verificadas;
- callback específico Meta Direct: não verificado;
- `direct_ready_flag=false`.

Blockers canônicos permanecem:
1. `permissions_unverified_or_blocking`;
2. `webhook_not_verified`;
3. `direct_ready_flag_false`.

Não confundir Flow health verified com callback Meta Direct verified.

## Warnings

- `identity_conflicts_pending`;
- `no_positive_marketing_consent` — esperado e fail-closed;
- `legacy_automation_outbound_live_but_canonical_gate_closed` — flags legadas existem, porém gates canônicos novos prevalecem; não limpar sem auditoria de dependências.

## Gates manuais pendentes

- Customer OS PIN browser validation;
- Relationship Center PIN browser validation;
- Meta Policy Registry verification;
- Meta Direct homologation;
- external activation authorization.

Não descobrir, inferir, testar ou contornar PIN automaticamente.

## Supabase-first

- Supabase/PostgreSQL/Edge Functions são runtime e source of truth;
- Make pode ser consultado somente como histórico/auditoria;
- nenhuma nova automação operacional deve ser criada no Make;
- OpenAI somente quando necessário, governado e autorizado.

## GitHub / concorrência

HEAD observado no início da Rodada 06: `7314fe5123c5e619869267f651bca2d61ee11beb`.

O HEAD recente pertence ao projeto paralelo de vídeo/Studio Criativo. Esse trabalho foi preservado; a Rodada 06 tocou somente documentação do Customer & Marketing OS.

## CI / regressão — Rodada 06

- workflow Customer OS: `.github/workflows/test-admin-v3.yml`;
- cobre scripts CM-1, readiness, acceptance, evidence observer, lifecycle, canary, Meta Policy Registry, Meta read-only e Meta Direct unified ingress;
- último CI funcional ampliado já registrado: run `35388463946`, **SUCCESS**, 38 validações;
- no HEAD `7314fe5`, o workflow geral `Testar Admin e compatibilidade Vitrine`, run `35420372760`, concluiu **SUCCESS**;
- esse run geral não substitui a suíte Customer OS completa, porque o HEAD paralelo não tocou paths que disparam `test-admin-v3.yml`;
- desde a última suíte Customer OS verde, as alterações Customer OS observadas foram checkpoints/documentação, sem mudança funcional conhecida.

Não afirmar “Customer OS CI verde no HEAD atual” sem um run específico da suíte; afirmar apenas as evidências acima.

## Plano autônomo

Plano canônico: `AUTONOMOUS-COMPLETION-PLAN.md`.

- Rodada 06 — **concluída**: regressão, CI e consistência canônica;
- Rodada 07 — próxima: hardening da Central de Relacionamento;
- Rodadas 08–14 — pendentes conforme plano.

Documento da Rodada 06:
`CM1-AUTONOMOUS-COMPLETION-ROUND-06.md`.

## Próxima ação autônoma

Executar Rodada 07 sem PIN e sem abrir gates externos:
- revisar/hardenizar UX da Central;
- separar visualmente programado vs evidência real vs ação humana;
- melhorar loading/erro/vazio e acessibilidade;
- manter Meta/ativação somente read-only/fail-closed;
- atualizar testes contratuais.

## Ações que continuam humanas ou orgânicas

- revisar os 2 conflitos reais de identidade;
- gerar `product_view` por uso real no Comprar;
- fornecer/configurar System User token WhatsApp no Vault;
- executar diagnóstico Meta read-only autenticado;
- validar PIN/interface no navegador;
- aceitar Policy Registry como gate humano;
- homologar callback Meta Direct;
- decidir futuramente sobre execução real governada de SUGGEST/IA/custo;
- autorizar separadamente qualquer ativação externa futura.
