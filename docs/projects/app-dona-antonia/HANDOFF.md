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
A barreira fail-closed central de `src/platform/homologationGuard.ts`, já aplicada ao cliente HML e push sintético, foi integrada também ao adapter de mídia em `src/platform/media.ts`.

Proteções acumuladas:
- HML exige recursos `TEST-*`, ambiente homologation e produção desabilitada antes de rede;
- endpoints HML usam allowlist exata das Edge Functions declaradas;
- push aceita somente `TEST-PUSH-*` e passa pelo guard antes de mutar estado;
- mídia agora passa por `simulate_media` antes de consumir qualquer fixture;
- `environment=production` e `productionEnabled=true` bloqueiam foto/áudio fail-closed;
- mídia não-`TEST-*` é recusada pela barreira central antes da validação específica;
- fixtures bloqueadas não são consumidas, permitindo comprovar que o bloqueio ocorre antes da mutação;
- adapters de push/mídia permanecem sem I/O externo e reportam `externalRequestCount=0`.

Cobertura adicionada nesta rodada:
- `tests/unit/mediaSafety.test.ts`: mídia sintética permitida em HML; ambiente de produção bloqueado; flag de produção bloqueada; recurso não TEST recusado; ausência de requests externos.

**Validação honesta:** código e testes foram implementados, porém não são declarados verdes sem execução real de runner/typecheck associada ao HEAD. Nenhuma homologação Android/iOS foi inferida.

## Próximo trabalho seguro
1. Executar suíte/typecheck/isolation assim que houver runner disponível e corrigir regressões reais.
2. Aplicar a barreira central aos demais adapters sintéticos com capacidade futura de I/O, priorizando sessão/armazenamento sem criar rede real.
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
