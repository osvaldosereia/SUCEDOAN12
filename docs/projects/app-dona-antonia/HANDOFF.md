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
A5 não possui mais trabalho independente evidente sem implementação/build nativo: permissões, pickers e stripping EXIF efetivo permanecem bloqueios nativos explícitos.

A6 recebeu `docs/homologation/HML-BACKEND-DEPLOY-MANIFEST.md`, documentando invariantes de deploy HML, gate de migrations, rollback, integridade de carrinho/total, idempotência/rate limit, pairing, telemetria/privacidade e regra `BLOCKED_QUOTA` sem apagar Edge Functions ou aumentar custo. Foi criado `src/platform/hmlBackendPreflight.ts`, um preflight puro e fail-closed que só retorna ready para homologação sintética `TEST-PROJECT-*`, projeto alvo esperado, migrations revisadas, rollback documentado, suíte de isolamento/typecheck executados, quota disponível, nenhuma migration destrutiva e nenhum executor real. `tests/unit/hmlBackendPreflight.test.ts` cobre cada gate.

**Validação honesta:** arquivos/testes foram versionados, mas não são declarados verdes sem runner/typecheck real associado ao HEAD. Nenhum deploy/migration foi executado e nenhuma homologação Android/iOS foi inferida.

## Próximo trabalho seguro
1. Continuar A6 em contratos estáticos/sintéticos de integridade, idempotência/rate limit e checklist backend sem deploy.
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
