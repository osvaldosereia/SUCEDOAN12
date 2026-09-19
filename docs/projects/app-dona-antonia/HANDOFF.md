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
O preflight de beta interno em `src/platform/releaseReadiness.ts` foi endurecido para falhar fechado não apenas nos gates nativos e efeitos reais, mas também na própria evidência de homologação.

Proteções acumuladas:
- HML exige recursos `TEST-*`, ambiente homologation e produção desabilitada antes de rede;
- endpoints HML usam allowlist exata das Edge Functions declaradas;
- push aceita somente `TEST-PUSH-*` e passa pelo guard antes de mutar estado;
- mídia passa por `simulate_media` antes de consumir fixture e permanece sem upload/rede;
- sessão segura possui ações explícitas `secure_session_read|write|clear` na barreira central e só aceita `TEST-SESSION-*` em escrita;
- release readiness agora exige explicitamente `appEnvironment=homologation`;
- release readiness exige evidência real de `isolationSuiteValidated=true` e `typecheckValidated=true`;
- ambiente production, suíte de isolamento não executada ou typecheck não executado viram blockers independentes e impedem `ready=true`;
- os gates anteriores de artefato nativo, sessão segura, deep links, segurança, privacidade, metadata e todos os efeitos reais OFF permanecem obrigatórios.

Cobertura ampliada:
- `tests/unit/releaseReadiness.test.ts`: HML segura permitida; artefato/sessão/deep links ausentes bloqueados; ambiente production e efeitos reais bloqueados; isolamento/typecheck sem evidência bloqueados; segurança/privacidade/metadata independentes.

**Validação honesta:** os testes foram atualizados, porém não são declarados verdes sem runner/typecheck real da suíte do App associado ao HEAD. O workflow disponível historicamente no PR não comprova a suíte do App. Nenhuma homologação Android/iOS foi inferida.

## Próximo trabalho seguro
1. Executar `npm test` e `npm run typecheck` em runner compatível com Node >=22.12 assim que houver runner da suíte do App e corrigir regressões reais.
2. Continuar R22/R24 com política de URLs/deep links, telemetry redaction e preflights nativos fail-closed.
3. Continuar aplicando a barreira central a qualquer adapter sintético restante com capacidade futura de I/O, sem criar rede real.
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

## Rodada A1 concluída agora — baseline/reprodutibilidade
- HEAD de início: `30800fb1e7031b4fd1193d7147d44410874e89ac`;
- criados `scripts/verify-test-layout.mjs` e scripts npm `verify:test-layout` + `validate:programmatic`;
- auditoria estrutural no HEAD: 53 arquivos em `tests/`, 51 testes executáveis;
- distribuição: 37 unit, 4 contract, 6 security, 3 e2e, 1 isolation;
- testes executáveis fora dos globs previstos: 0;
- gate agregado passa a exigir layout de testes + suíte + typecheck + preflight nativo;
- não foi alegado `npm test` integral verde sem runner/dependências reais;
- próxima rodada autônoma: A2 — guard central/fail-closed total.
