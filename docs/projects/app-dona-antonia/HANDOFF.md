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
A barreira fail-closed de `src/platform/homologationGuard.ts`, já integrada ao cliente HML, foi estendida ao adapter sintético de push em `src/notifications/pushClient.ts`.

Proteções acumuladas:
- `hml_network` exige recurso `TEST-*` e cliente HML habilitado passa pelo guard antes de rede;
- `environment=production` e `productionEnabled=true` bloqueiam o cliente HML;
- endpoints HML usam allowlist exata das três Edge Functions declaradas;
- registro de push continua aceitando somente `TEST-PUSH-*`;
- antes de registrar token sintético, o push client agora executa `simulate_push` no guard central;
- `environment=production` ou `productionEnabled=true` bloqueiam registro de push antes de mutar estado;
- adapter de push permanece sem I/O e com `externalRequestCount=0`.

Cobertura adicionada nesta rodada:
- `tests/unit/pushClientSafety.test.ts`: homologação sintética permitida, ambiente de produção bloqueado, flag de produção bloqueada e token real-looking recusado.

**Validação honesta:** os testes foram implementados, porém não são declarados verdes sem execução real de runner/typecheck associada ao HEAD. Nenhuma homologação Android/iOS foi inferida.

## HEAD desta retomada
Código + testes antes deste checkpoint: `6702c0a27984b74a1f6bf0181d8d54e1b3d87793`.

## Próximo trabalho seguro
1. Executar suíte/typecheck/isolation assim que houver runner disponível e corrigir regressões reais.
2. Aplicar a barreira central aos demais adapters sintéticos com capacidade futura de I/O, priorizando mídia/sessão sem criar rede real.
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
