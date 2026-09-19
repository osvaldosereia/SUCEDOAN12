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
- R13 deploy bloqueado por quota; R25 produção proibida;
- plano autônomo: **A1–A6 esgotadas programaticamente dentro dos limites seguros; A7 é a próxima rodada**.

## Último avanço seguro — A6
`hmlBoundaryContracts.ts` agora fecha também pairing, telemetria e privacidade. Pairing exige `TEST-PAIR-*` + `TEST-SESSION-*`, challenge fresco e não consumido. Telemetria exige `TEST-TELEMETRY-*` e rejeita PII, texto livre, advertising ID e qualquer sink externo. Privacidade exige `TEST-PRIVACY-*`, mesmo `TEST-SUBJECT-*` e zero escrita externa. A suíte unitária cobre os baselines e falhas fechadas correspondentes.

**Validação honesta:** arquivos/testes foram versionados, mas não são declarados verdes sem runner/typecheck real associado ao HEAD. Nenhum deploy/migration/executor/pedido/push foi executado e nenhuma homologação Android/iOS foi inferida.

## Próximo trabalho seguro
1. A7: UX/acessibilidade/offline/desempenho — 320px, 44px, teclado/foco/ARIA, reduced motion, estados loading/empty/error/offline/recovery e budgets/testes automatizáveis.
2. Depois A8 somente preflight/documentação de release/store/native, sem build/submissão real.
3. A9 auditoria final e documentos humanos/checklist; não criar novo escopo depois.

## Regras soberanas
- não modificar `comprar/`; não mergear PR #396;
- produção/pedidos/push/executores reais OFF;
- sem Bling, Meta, PapoAI, logística ou dados reais;
- sem apagar Edge Functions ou aumentar plano/spend cap;
- sem publicação/submissão em lojas;
- sem declarar Android/iOS homologados sem build/teste real.
