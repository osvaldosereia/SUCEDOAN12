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
- plano autônomo: **A1–A8 esgotadas nos respectivos limites seguros; A9 é a próxima e última rodada**.

## Último avanço seguro — A7/A8
A7 foi esgotada programaticamente: auditoria estática cobre 320px, 44px, foco/ARIA, contraste/reduced motion, loading/empty/error/offline, recovery e budgets; o restante exige browser/aparelho/medição real. A8 adicionou `STORE-RELEASE-READINESS.md`, consolidando gates Android/iOS, assinatura, metadata, reviewer TEST, privacy/data-safety e evidências de release. O preflight nativo permanece fail-closed.

**Validação honesta:** Android/iOS não estão homologados. Testes/typecheck não são declarados verdes sem runner real associado ao HEAD. Nenhum build, APK/AAB/IPA, console de loja, TestFlight, deploy, pedido, push ou efeito externo foi acionado.

## Próximo trabalho seguro
Executar A9 integralmente: auditar branch/gates e isolamento; corrigir qualquer restante seguro; criar `app-dona-antonia/docs/homologation/HUMAN-ACTIONS-FINAL.md` e `app-dona-antonia/docs/homologation/FINAL-AUTONOMOUS-CHECKLIST.md`; atualizar checkpoints/PR. Marcar `PROGRAMMATIC_COMPLETE=true` apenas se a auditoria demonstrar que não resta tarefa segura e independente. Depois disso, não criar novo escopo.

## Regras soberanas
- não modificar `comprar/`; não mergear PR #396;
- produção/pedidos/push/executores reais OFF;
- sem Bling, Meta, PapoAI, logística ou dados reais;
- sem apagar Edge Functions ou aumentar plano/spend cap;
- sem publicação/submissão em lojas;
- sem declarar Android/iOS homologados sem build/teste real.
