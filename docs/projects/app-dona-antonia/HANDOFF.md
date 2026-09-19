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
- R10/R11 bloqueadas até toolchain/build nativo real;
- R13 deploy bloqueado por quota;
- R25 produção proibida;
- plano autônomo: A1–A4 concluídas; A5 esgotada programaticamente até o limite nativo; A6 em andamento seguro, sem deploy.

## Último avanço seguro — A6
Além do preflight backend e da segurança de request/idempotência, foi adicionado `src/platform/hmlBoundaryContracts.ts`, fechando contratos puramente sintéticos para bootstrap, catálogo e checkout. Bootstrap exige HML + `TEST-SUBJECT-*` + zero requests externos. Catálogo exige IDs `TEST-PRODUCT-*`, preços inteiros não negativos e shape consistente. Checkout exige `TEST-SUBJECT-*`, `TEST-CART-*`, `TEST-OP-*`, `TEST-IDEMPOTENCY-*`, produtos sintéticos, carrinho não vazio e igualdade entre total apresentado e autoritativo. `tests/unit/hmlBoundaryContracts.test.ts` cobre baseline e falhas fechadas de produção/recurso real/total divergente.

**Validação honesta:** arquivos/testes foram versionados, mas não são declarados verdes sem runner/typecheck real associado ao HEAD. Nenhum deploy/migration foi executado e nenhuma homologação Android/iOS foi inferida.

## Próximo trabalho seguro
1. Continuar A6 nos contratos pairing/telemetria/privacidade e checklist backend sem deploy; revisar se resta qualquer fronteira HML programática.
2. Quando A6 estiver esgotada programaticamente, avançar A7 UX/acessibilidade/offline/desempenho.
3. Manter R10/R11 e R25 fechadas.

## Regras soberanas
- não modificar `comprar/`;
- não mergear PR #396;
- produção/pedidos/push/executores reais OFF;
- sem Bling, Meta, PapoAI ou logística;
- sem dados reais de clientes;
- sem apagar Edge Functions ou aumentar plano/spend cap;
- sem publicação/submissão em lojas;
- sem declarar Android/iOS homologados sem build/teste real.
