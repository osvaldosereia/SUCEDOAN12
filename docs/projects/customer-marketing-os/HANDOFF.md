# HANDOFF — Customer & Marketing OS

**Leia este arquivo primeiro em qualquer nova janela.**

Projeto: **Dona Antônia — Customer & Marketing OS**.
GitHub: `osvaldosereia/SUCEDOAN12`.
Supabase: `ssbesxgaijknwsjbsbcz`.

## Freeze canônico — 19/09/2026 ~08:40 America/Cuiaba

A programação autônoma segura da CM-1 foi **esgotada**.

Rodadas 06–14: concluídas.

Estado runtime:
- 20 critérios = **15 verified / 5 implemented / 0 blocked**;
- `safe_for_internal_homologation=true`;
- `cm1_complete=false`;
- `external_activation_authorized=false`;
- external side effect=false.

Documentos obrigatórios daqui em diante:
1. `HUMAN-ACTIONS-FINAL.md`;
2. `FINAL-AUTONOMOUS-CHECKLIST.md`;
3. `CURRENT-STATE.md`.

## Pendências reais

1. revisar 2 conflitos de identidade;
2. gerar Product View real;
3. fornecer System User token WhatsApp no Vault;
4. executar Meta Foundation -> Verificar Meta agora;
5. validar PIN/interface;
6. aceitar/revisar Policy Registry;
7. homologar callback Meta Direct;
8. aguardar lifecycle real de oportunidade;
9. decidir se haverá execução real governada de SUGGEST/IA/custo;
10. autorização externa continua separada.

## Estado Meta

- WABA presente;
- Phone Number ID presente;
- Graph API v26.0;
- Policy Registry 8/8 técnico pronto;
- token WhatsApp read-only ausente;
- permissions_clear=false;
- webhook_ready=false;
- direct_ready_flag=false;
- Meta Direct ready=false.

## Guardrails

Preservar:
- Meta Direct OFF;
- canonical outbound OFF;
- publishing OFF;
- strategy AI OFF;
- canary 0%;
- budget IA 0;
- kill switch ON;
- PapoAI outbound disabled.

Não:
- auto-resolver identidade;
- testar/descobrir PIN;
- fabricar product_view/lifecycle/consentimento/custo;
- usar Make como runtime;
- iniciar CM-2;
- autorizar ativação externa por inferência.

Após cada ação humana, reconsultar Supabase e promover somente o que tiver evidência real.
