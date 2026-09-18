# HANDOFF — App Dona Antônia

**Data:** 18/09/2026  
**Projeto:** App Dona Antônia  
**Branch de desenvolvimento:** `app-dona-antonia-r0-isolation`  
**PR:** #396 — draft — NÃO MERGEAR  
**Estado:** OFF / ISOLADO / NÃO PUBLICADO

## R13 HML — hardening adicional aplicado — 18/09/2026

- migração `20260918204500_customer_app_hml_cart_integrity_v2.sql` aplicada;
- config HML possui hard-off por constraint `enabled=false`;
- banco valida carrinho TEST e recalcula total por funções SQL restritas a `service_role`;
- checkout HML versionado recalcula total server-side e rejeita divergência;
- helper compartilhado HML: 5/5 testes locais verdes + typecheck;
- validação SQL: cart válido aceito, total 5000, ID real recusado, chave `phone` recusada;
- advisors: nenhum finding de performance específico HML; apenas INFO de RLS sem policy pública, intencional com zero grants para anon/authenticated;
- quota de Edge Functions continua sendo o único bloqueio de deploy da R13; nenhuma função existente foi apagada.

## CHECKPOINT NOVO — 18/09/2026 — hardening seguro após R24

- branch validada antes da edição: `app-dona-antonia-r0-isolation`;
- R22: session guard local para expiração/revogação + scanner de segredos FCM/APNs/private key;
- R23: 10 controles críticos com piso explícito de 44px + budgets mensuráveis de desempenho;
- R24: `APP-STORE-CHECKLIST.md`, `PLAY-STORE-CHECKLIST.md` e `REVIEW-PROFILE.md` sintético criados;
- 6/6 testes de session/performance verdes;
- 3/3 testes de store docs verdes;
- suíte combinada local destes gates + release readiness: 13/13 verdes;
- runtime/config atual: 62 arquivos;
- nenhuma publicação, tester, build nativo, produção ou integração real foi acionada;
- R10 continua bloqueada; R25 continua proibida sem autorização explícita.

## ATUALIZAÇÃO FINAL DESTA RETOMADA — 18/09/2026

Este é o estado mais novo e prevalece sobre checkpoints anteriores do arquivo:
- testes tocados nesta retomada: 49/49 verdes;
- typecheck do conjunto modificado/reconstruído: verde;
- runtime/config atual: 60 arquivos; nenhum achado proibido nas varreduras incrementais;
- R12 ganhou contrato de bridge nativo, mas Keychain/Keystore reais continuam pendentes;
- R15 agora exige allowlist HTTPS para deep links absolutos;
- R22 ganhou gate central de abuso local;
- R24 está parcial com readiness local e documentação de loja, sem qualquer submissão;
- R0–R9 e R20 concluídas; R12–R19 e R21–R24 parciais conforme dependências;
- R10 segue bloqueada por toolchain Android; R25 continua proibida sem autorização explícita;
- produção, comprar/, pedidos reais, push real e executores externos continuam OFF/intocados.

## CHECKPOINT MAIS RECENTE — 18/09/2026 — retomada 16:58+ America/Cuiaba

**Este checkpoint substitui o “Ponto EXATO” antigo abaixo como estado operacional atual.**

- PR #396 continua Draft e NÃO MERGEAR.
- R12/R14/R15 tiveram fundações locais validadas e corrigidas, mas continuam parciais por dependências nativas/backend.
- R16 parcial: push HML somente TEST-PUSH-*, marketing OFF, sem provedor/rede.
- R17 parcial: política/fixtures de mídia TEST-MEDIA-*, sem upload/rede.
- R18 parcial: histórico/recompra sintéticos, sessão verificada, preços recalculados e confirmação explícita.
- R19 reforçada: revogação de aparelho limpa sessão local mesmo sem backend.
- R21 reforçada: contadores locais sem PII para pairing/deep-link/push.
- Supabase HML read-only: enabled=false, homologation, 60 req/min, 10/10 produtos TEST-PROD-*.
- runtime/config atual: 58 arquivos; sem achados proibidos nas varreduras executadas.
- R10 continua bloqueada por toolchain Android nativa real.
- Produção, Comprar, pedido real, push real, Meta, PapoAI, Bling e logística continuam OFF/intocados.

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
