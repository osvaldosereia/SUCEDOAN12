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
A barreira fail-closed central de `src/platform/homologationGuard.ts`, já aplicada ao cliente HML, push e mídia sintéticos, foi estendida ao adapter de sessão segura em `src/customer/nativeSecureSession.ts`.

Proteções acumuladas:
- HML exige recursos `TEST-*`, ambiente homologation e produção desabilitada antes de rede;
- endpoints HML usam allowlist exata das Edge Functions declaradas;
- push aceita somente `TEST-PUSH-*` e passa pelo guard antes de mutar estado;
- mídia passa por `simulate_media` antes de consumir fixture e permanece sem upload/rede;
- sessão segura agora possui ações explícitas `secure_session_read|write|clear` na barreira central;
- ambiente de produção, `productionEnabled=true` e recurso não `TEST-*` bloqueiam sessão antes de qualquer chamada ao storage bridge;
- `set()` aceita em homologação somente tokens `TEST-SESSION-*`, além da validação de valor não vazio;
- o adapter não ganhou fallback web, rede ou logging e continua preparado para Keychain/Keystore reais somente após homologação nativa.

Cobertura ampliada:
- `tests/unit/nativeSecureSession.test.ts`: fluxo TEST permitido; token vazio/real recusado antes do bridge; ambiente de produção bloqueado; flag de produção bloqueada; recurso não TEST bloqueado; ausência de web persistence/logging/fetch.

**Validação honesta:** o workflow disponível no PR continua sendo apenas o guard do Admin legado; ele não executa a suíte do App. Código e testes desta rodada foram implementados, mas não são declarados verdes sem runner/typecheck real da suíte do App associado ao HEAD. Nenhuma homologação Android/iOS foi inferida.

## Próximo trabalho seguro
1. Executar `npm test` e `npm run typecheck` em runner compatível com Node >=22.12 assim que houver runner da suíte do App e corrigir regressões reais.
2. Continuar aplicando a barreira central a qualquer adapter sintético restante com capacidade futura de I/O, sem criar rede real.
3. Continuar hardening R22/R24: revisar release readiness, política de URLs/deep links, telemetry redaction e preflights nativos.
4. Manter R13 sem deploy enquanto a quota impedir Edge Functions; não apagar funções nem aumentar plano.
5. Manter R10/R11 sem declaração de homologação até build/teste nativo real e R25 fechado.

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
