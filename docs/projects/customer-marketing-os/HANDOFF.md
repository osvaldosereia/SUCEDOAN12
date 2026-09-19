# HANDOFF — Customer & Marketing OS

**Leia este arquivo primeiro em qualquer nova janela/rodada.**

Projeto: **Dona Antônia — Customer & Marketing OS**. GitHub `osvaldosereia/SUCEDOAN12`; Supabase `ssbesxgaijknwsjbsbcz`. Leia também `CURRENT-STATE.md` e `AUTONOMOUS-COMPLETION-PLAN.md`. Confirme HEAD antes de editar e preserve trabalhos paralelos. Runtime Supabase-first; Make somente histórico/auditoria. Não iniciar CM-2.

## Estado canônico — 19/09/2026 ~01:14 America/Cuiaba

- **20 critérios = 15 verified / 5 implemented / 0 blocked**;
- `ready_for_manual_canary=true`;
- `safe_for_internal_homologation=true`;
- `cm1_complete=false`;
- `external_activation_authorized=false`;
- external side effect=false.

Implemented restantes:
- 2 Identity Resolver — 2 conflitos reais; decisão humana;
- 7 Product View — `product_view=0`, collector pronto;
- 13 Opportunity Lifecycle — 75 suppressed, 0 lifecycle fechado;
- 15 Marketing Brain SUGGEST — gate OFF;
- 18 AI cost — ledger pronto, 0 execuções/custo.

Evidência orgânica: receipts=18; catalog_open=64; **catalog_search=31**; product_view=0; carrinho=437; pedidos=47; timeline=1388. Próxima expiração natural de oportunidade: 23/09/2026 17:00:15 UTC.

## Gates obrigatórios

Manter Meta Direct OFF, canonical outbound OFF, publishing OFF, strategy AI OFF, canary 0%, marketing kill switch ON, orçamento IA 0. Não testar PIN, não auto-resolver identidade, não fabricar evidência.

Meta: WABA + Phone Number ID presentes; Graph API v26.0; Flow health separado e verificado; token WhatsApp read-only no Vault ausente; permissões e callback Direct não verificados; direct_ready_flag=false.

## Plano autônomo

- Rodada 06 — CONCLUÍDA;
- Rodada 07 — **CONCLUÍDA**;
- Rodada 08 — próxima;
- Rodadas 09–14 — pendentes.

### Rodada 07 concluída

Documento: `CM1-AUTONOMOUS-COMPLETION-ROUND-07.md`.

Entregue:
- `admin/relationship-homologation-hardening.js`;
- `admin/relationship-homologation-hardening.css`;
- HTML versionado carregando hardening;
- ARIA para tabs/status, foco visível e ajustes mobile;
- distinção visual entre **Ação humana** e **Evidência real** nos critérios implemented;
- aviso explícito de Meta diagnóstico somente leitura;
- contrato `scripts/test-cm-1-relationship-hardening-v1.mjs`;
- workflow dedicado `.github/workflows/test-customer-os-relationship-hardening.yml`;
- run inicial `35423379708` estava in_progress no último check; confirmar conclusão na próxima rodada.

HEAD inicial observado: `106cc4589ba1a43a99f1e2d15c6403778de8e67c`, mudança paralela de vídeo; preservada.

## Próxima rodada — 08

**Meta Direct preflight completo sem credencial humana.**

Pode avançar:
- confirmar CI da Rodada 07;
- revisar contrato de leitura do Vault e scopes esperados;
- revisar WABA/Phone/Graph/callback esperado;
- reforçar fail-closed e auditoria do diagnóstico;
- adicionar testes isolados para token ausente/inválido, scope ausente, sucesso e callback divergente;
- garantir que diagnóstico read-only nunca envie mensagem nem habilite runtime;
- deixar como única pendência externa a credencial/evidência humana real, se tecnicamente possível.

## Não fazer

Não ativar outbound/Meta Direct/publishing/IA externa; não submeter templates; não criar consentimento/product_view/lifecycle/custo artificial; não testar PIN; não auto-resolver identidade; não limpar flags legadas sem auditoria; não usar Make como runtime; não transformar readiness em autorização.

## Dependências humanas/orgânicas atuais

Revisar 2 conflitos; abrir produto real; fornecer System User token WhatsApp no Vault; executar diagnóstico Meta read-only autenticado; validar PIN/interface; aceitar Policy Registry; homologar callback Meta Direct; decidir sobre execução real governada de SUGGEST/IA/custo; autorizar separadamente qualquer ativação externa futura.

Ao final de cada rodada: consultar runtime, confirmar HEAD, programar/testar o máximo seguro, atualizar `CURRENT-STATE.md` e este `HANDOFF.md`, registrar documento/commit e promover critérios somente por evidência real.
