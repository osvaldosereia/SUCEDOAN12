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
A barreira fail-closed de `src/platform/homologationGuard.ts` foi integrada ao cliente HML em `src/platform/apiClient.ts`.

Proteções desta rodada:
- nova ação `hml_network` exige recurso `TEST-*`;
- cliente HML habilitado passa pelo guard antes de qualquer chamada de rede;
- `environment=production` bloqueia a construção do cliente;
- `productionEnabled=true` bloqueia a construção do cliente;
- `clientId` continua restrito a `TEST-CLIENT-*`;
- endpoint remoto agora usa allowlist exata das três Edge Functions HML declaradas, em vez de aceitar qualquer slug pelo prefixo;
- cliente desabilitado continua inerte e não exige credenciais.

Cobertura adicionada/expandida:
- `tests/unit/homologationGuard.test.ts`: HML TEST permitido e identificador não TEST recusado;
- `tests/unit/apiClientSafety.test.ts`: prova que ambiente/flag de produção falham antes de `fetch` e que cliente OFF permanece inerte.

**Validação honesta:** não há workflow run associado ao HEAD desta rodada no conector GitHub. Portanto os testes novos estão implementados, mas não são declarados verdes até execução real de runner/typecheck.

## HEAD desta retomada
Código + testes antes deste checkpoint: `ccc40b23688f17cb8be7627e9d0137b9dc4ca0bd`.

## Próximo trabalho seguro
1. Executar suíte/typecheck/isolation assim que houver runner disponível e corrigir qualquer regressão real.
2. Aplicar a mesma barreira fail-closed aos demais adapters sintéticos que possam produzir I/O, sem ampliar produção.
3. Continuar hardening R22/R24 e preflights nativos sem fingir homologação.
4. Manter R13 sem deploy enquanto a quota impedir Edge Functions; não apagar funções nem aumentar plano.
5. Manter R25 fechado.

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
