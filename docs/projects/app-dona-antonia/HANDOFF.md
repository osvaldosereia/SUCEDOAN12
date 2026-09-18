# App Dona Antônia — HANDOFF

**Branch:** `app-dona-antonia-r0-isolation`  
**PR:** #396 — Draft — **NÃO MERGEAR**  
**Estado:** OFF / HOMOLOGAÇÃO / ISOLADO / NÃO PUBLICADO

## Ordem de retomada
1. Este arquivo.
2. `docs/projects/APP-DONA-ANTONIA-MASTER.md` na `main` enquanto a cópia branch-local não existir.
3. `app-dona-antonia/PROJECT-STATUS.md` nesta branch.
4. Design e plano em `docs/superpowers/`.

## Estado consolidado
- concluídas: R0–R9 e R20;
- parciais seguras: R12–R19 e R21–R24;
- R10 Android e R11 iOS: bloqueadas até toolchain/build nativo real;
- R13: fundação HML endurecida; deploy de Edge Functions continua bloqueado por quota;
- R25: produção proibida sem autorização explícita.

## Último avanço seguro
Foi adicionada uma nova barreira local fail-closed em `src/platform/homologationGuard.ts`.

Ela bloqueia independentemente de feature flags:
- qualquer ambiente diferente de `homologation`;
- qualquer `productionEnabled=true`;
- `production_order`;
- `production_push`;
- `external_executor`;
- ações de fixture/simulação cujo recurso não comece por `TEST-`.

Cobertura criada em `tests/unit/homologationGuard.test.ts`, incluindo checkout sintético permitido, recurso não TEST recusado, ambiente/flag de produção recusados e executores/efeitos reais recusados.

**Importante:** os testes foram adicionados, mas este checkpoint não declara execução local/CI deles porque o conector GitHub não forneceu runner/check associado ao HEAD no momento da gravação. Validar no próximo ambiente com runner disponível antes de promovê-los a “verdes”.

## HEAD desta retomada
Após código + teste: `64829413ef23f9238d289dca3733e919f88aa790`.

## Próximo trabalho seguro
1. Executar suíte/typecheck/isolation do novo guard assim que houver runner disponível.
2. Integrar o guard nos adapters de efeitos sintéticos onde isso não alterar contratos existentes.
3. Continuar hardening de R22/R24 e preflights nativos sem fingir homologação.
4. Não contornar quota de Edge Functions e não tocar produção.

## Regras soberanas
- não modificar `comprar/`;
- não mergear PR #396;
- produção OFF;
- sem pedidos, push, mensagens ou logística reais;
- sem Bling, Meta ou PapoAI;
- sem dados reais de clientes;
- sem apagar Edge Functions para liberar quota;
- sem aumento de plano/spend cap;
- sem publicação/submissão em lojas;
- sem declarar Android/iOS homologados sem build/teste nativo real.
