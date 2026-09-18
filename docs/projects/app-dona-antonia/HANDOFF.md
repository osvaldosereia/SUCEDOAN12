# HANDOFF — App Dona Antônia

**Data:** 18/09/2026  
**Projeto:** App Dona Antônia  
**Branch de desenvolvimento:** `app-dona-antonia-r0-isolation`  
**PR:** #396 — draft — NÃO MERGEAR  
**Estado:** OFF / ISOLADO / NÃO PUBLICADO

## Ordem obrigatória de leitura

1. `docs/projects/APP-DONA-ANTONIA-MASTER.md`
2. `docs/superpowers/specs/2026-09-18-app-dona-antonia-ios-android-design.md`
3. `docs/superpowers/plans/2026-09-18-app-dona-antonia-rodadas-implementacao.md`
4. branch `app-dona-antonia-r0-isolation`
5. `app-dona-antonia/PROJECT-STATUS.md`

O `PROJECT-STATUS.md` da branch contém o checkpoint mais recente e prevalece sobre snapshots antigos.

## Estado resumido

Concluídas:
- Rodadas 0–9;
- Rodada 20.

Parciais:
- R13 Supabase HML;
- R19 Privacidade local;
- R21 Telemetria;
- R22 Hardening;
- R23 UX/acessibilidade.

Bloqueada:
- R10 Android, por toolchain nativa ausente.

## Ponto EXATO onde a programação parou

Foram criados e commitados, mas ainda não homologados/testados no checkpoint final:

- R12: `src/customer/secureSession.ts` + `tests/unit/secureSession.test.ts`;
- R14: `src/customer/pairing.ts` + `tests/contract/pairing.test.ts`;
- R15: `src/platform/appLinks.ts` + `tests/unit/appLinks.test.ts`;
- ajuste complementar em `src/platform/urlPolicy.ts`.

A próxima conversa deve começar validando esses módulos. Não assumir que R12/R14/R15 estão concluídas antes dos testes.

## Primeira sequência de execução

1. validar `secureSession.test.ts`;
2. validar `pairing.test.ts`;
3. validar `appLinks.test.ts`;
4. rodar typecheck;
5. rodar isolamento;
6. corrigir falhas, se houver;
7. atualizar `PROJECT-STATUS.md`;
8. atualizar este HANDOFF e o documento mestre;
9. continuar automaticamente pelas rodadas seguras seguintes.

## Bloqueios atuais

### Android / R10
Sem Android SDK/ADB/Gradle válido no ambiente. Capacitor 8.5.2 e app ID `br.com.donaantonia.app` já estão preparados, mas não existe APK homologado.

### Supabase / R13
Migração HML aplicada:
`20260918193553_customer_app_hml_foundation_v1.sql`

Gate:
- `enabled=false`;
- RLS ativo;
- zero grants para `anon/authenticated`;
- dados exclusivamente TEST.

Deploy de novas Edge Functions bloqueado por:
`Max number of functions reached for project`.

Não apagar funções existentes e não alterar plano/spend cap sem autorização.

## Regra máxima

Até o gate final:
- não modificar `comprar/`;
- não fazer merge do PR #396;
- não ativar produção;
- não enviar push real;
- não gerar pedido real;
- não acionar Bling, Meta, PapoAI ou logística;
- não usar dados reais de clientes;
- não habilitar flags de produção.

## Autorização operacional

O proprietário autorizou avançar automaticamente por várias rodadas seguras.

Só pedir autorização quando houver:
- custo novo;
- produção real;
- operação destrutiva relevante;
- risco de atingir clientes/dados reais;
- decisão comercial/jurídica obrigatória do proprietário.
