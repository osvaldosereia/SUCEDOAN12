# App Dona Antônia — HANDOFF

**Branch:** `app-dona-antonia-r0-isolation`  
**PR:** #396 — Draft — **NÃO MERGEAR**  
**Estado:** OFF / HOMOLOGAÇÃO / ISOLADO / NÃO PUBLICADO

## Ordem de retomada
1. Este arquivo.
2. `app-dona-antonia/docs/homologation/AUTONOMOUS-COMPLETION-PLAN.md`.
3. `app-dona-antonia/PROJECT-STATUS.md`.
4. `docs/projects/APP-DONA-ANTONIA-MASTER.md` quando necessário.

## Estado consolidado
- concluídas: R0–R9 e R20;
- parciais seguras: R12–R19 e R21–R24;
- R10 Android e R11 iOS bloqueadas até toolchain/build nativo real;
- R13: fundação HML endurecida; deploy de Edge Functions bloqueado por quota;
- R25: produção proibida sem autorização explícita;
- plano autônomo: A1 e A2 programaticamente concluídas; próxima A3.

## Último avanço seguro — A2
A barreira central de homologação agora cobre todas as superfícies sintéticas/futuras de I/O identificadas no App: HML network, push, mídia, secure session e telemetry sink. Todas exigem ambiente `homologation`, `productionEnabled=false` e recurso `TEST-*` antes do efeito. `production_order`, `production_push` e `external_executor` continuam bloqueados incondicionalmente.

Telemetria foi fechada no mesmo boundary: registry de eventos continua estrito e sem PII/free text/advertising IDs; o collector agora bloqueia production, flag de produção e resource não-TEST antes de chamar qualquer sink. Testes unitários foram ampliados para provar `calls === 0` nos caminhos bloqueados.

Proteções acumuladas:
- endpoints HML em allowlist exata;
- push somente `TEST-PUSH-*`;
- mídia somente `TEST-MEDIA-*`, sem upload/rede;
- secure session somente recursos/tokens TEST em homologação;
- telemetry sink somente `TEST-*` em homologação;
- release readiness exige ambiente HML, suíte de isolamento e typecheck comprovados;
- artefato nativo, secure storage, deep links, segurança, privacidade e metadata continuam gates obrigatórios.

**Validação honesta:** código e testes foram atualizados, mas não são declarados verdes sem runner/typecheck real associado ao HEAD. Nenhuma homologação Android/iOS foi inferida.

## Próximo trabalho seguro
1. A3 — fechar sessão/identidade/pairing: expiração, revogação, replay, tentativas, uso único e contratos backend/nativos possíveis sem rede real.
2. Depois A4 — deep links e notificações.
3. Manter R13 sem deploy enquanto a quota impedir Edge Functions; não apagar funções nem aumentar plano.
4. Manter R10/R11 sem declaração de homologação até build/teste nativo real; R25 fechado.

## Regras soberanas
- não modificar `comprar/`;
- não mergear PR #396;
- produção/pedidos/push/executores reais OFF;
- sem Bling, Meta, PapoAI ou logística;
- sem dados reais de clientes;
- sem apagar Edge Functions ou aumentar plano/spend cap;
- sem publicação/submissão em lojas;
- sem declarar Android/iOS homologados sem build/teste real.
