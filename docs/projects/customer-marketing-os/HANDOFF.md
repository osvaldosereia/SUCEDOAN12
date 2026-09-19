# HANDOFF — Customer & Marketing OS

**Leia este arquivo primeiro em qualquer nova janela/rodada.**

Projeto: **Dona Antônia — Customer & Marketing OS**. GitHub `osvaldosereia/SUCEDOAN12`; Supabase `ssbesxgaijknwsjbsbcz`. Leia também `CURRENT-STATE.md` e `AUTONOMOUS-COMPLETION-PLAN.md`. Confirme HEAD antes de editar e preserve trabalhos paralelos. Runtime Supabase-first; Make somente histórico/auditoria. Não iniciar CM-2.

## Estado canônico — 19/09/2026 ~02:16 America/Cuiaba

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

Evidência orgânica: receipts=18; catalog_open=64; catalog_search=31; product_view=0; carrinho=437; pedidos=47; timeline=1388. Próxima expiração natural de oportunidade: 23/09/2026 17:00:15 UTC.

## Gates obrigatórios

Manter Meta Direct OFF, canonical outbound OFF, publishing OFF, strategy AI OFF, canary 0%, marketing kill switch ON, orçamento IA 0. Não testar PIN, não auto-resolver identidade, não fabricar evidência.

Meta: WABA + Phone Number ID presentes; Graph API v26.0; Flow health separado e verificado; token WhatsApp read-only no Vault ausente; permissões e callback Direct não verificados; direct_ready_flag=false.

## Plano autônomo

- Rodada 06 — concluída;
- Rodada 07 — concluída;
- Rodada 08 — **concluída tecnicamente**;
- Rodada 09 — próxima;
- Rodadas 10–14 — pendentes.

### Rodada 08 concluída

Documento: `CM1-AUTONOMOUS-COMPLETION-ROUND-08.md`.

Entregue:
- CI da Rodada 07 confirmado SUCCESS (`35423379708`);
- contrato Meta read-only auditado;
- GET-only e proibição de envio/mutação confirmados;
- scopes `whatsapp_business_management` e `whatsapp_business_messaging` explícitos;
- callback esperado `whatsapp-meta-direct-v1` e separação Flow health/Direct confirmados;
- novo teste `test-cm-1-meta-preflight-fail-closed-v2.mjs`;
- workflow dedicado `Customer OS · Meta Preflight` criado;
- run inicial `35426161049` estava `in_progress` no fechamento; confirmar no início da Rodada 09.

Nenhuma alteração/deploy de runtime foi necessária: o comportamento requerido já existia e permaneceu fail-closed.

## Próxima rodada — 09

**Identity Review: preparação final humana.**

Antes de programar:
1. confirmar resultado do run `35426161049`;
2. confirmar HEAD atual e preservar paralelo;
3. reexecutar RPCs canônicos.

Pode avançar:
- revisar fila/UX dos conflitos;
- melhorar evidências exibidas para candidatos;
- mascarar dados sensíveis;
- exigir justificativa;
- impedir auto-merge;
- garantir auditoria append-only;
- adicionar testes isolados de aprovação/rejeição sem tocar nos casos reais;
- deixar decisão humana real simples e segura.

## Não fazer

Não ativar outbound/Meta Direct/publishing/IA externa; não submeter templates; não criar consentimento/product_view/lifecycle/custo artificial; não testar PIN; não auto-resolver identidade; não limpar flags legadas sem auditoria; não usar Make como runtime; não transformar readiness em autorização.

## Dependências humanas/orgânicas atuais

Revisar 2 conflitos; abrir produto real; fornecer System User token WhatsApp no Vault; executar diagnóstico Meta read-only autenticado; validar PIN/interface; aceitar Policy Registry; homologar callback Meta Direct; decidir sobre execução real governada de SUGGEST/IA/custo; autorizar separadamente qualquer ativação externa futura.

Ao final de cada rodada: consultar runtime, confirmar HEAD, programar/testar o máximo seguro, atualizar `CURRENT-STATE.md` e este `HANDOFF.md`, registrar documento/commit e promover critérios somente por evidência real.
