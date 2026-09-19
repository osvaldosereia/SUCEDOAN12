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
- plano autônomo: **A1–A6 esgotadas; A7 avançada e em fechamento programático**.

## Último avanço seguro — A7
A auditoria existente já cobre piso de 320px, alvos primários de 44px, foco visível, ARIA, contraste forçado e reduced motion. Foi adicionado `uxReadiness.ts` com contratos determinísticos para recovery offline/error, limite de tentativas, budgets de JS/CSS/imagem crítica e validação fail-closed de tamanho/label/alcance por teclado. `uxReadiness.test.ts` cobre limites e falhas fechadas. Estados loading/empty/error/offline já permanecem modelados no shell.

**Validação honesta:** arquivos/testes foram versionados, mas não são declarados verdes sem runner/typecheck real associado ao HEAD. Auditoria visual/nativa, leitor de tela e métricas em dispositivo continuam dependentes de execução real. Nenhum efeito externo foi acionado.

## Próximo trabalho seguro
1. Fechar A7 com qualquer auditoria estática restante que seja independente de runner/dispositivo.
2. Entrar em A8 somente para preflight/documentação de release/store/native, sem build/submissão real.
3. A9: auditoria final e documentos humanos/checklist; não criar novo escopo depois.

## Regras soberanas
- não modificar `comprar/`; não mergear PR #396;
- produção/pedidos/push/executores reais OFF;
- sem Bling, Meta, PapoAI, logística ou dados reais;
- sem apagar Edge Functions ou aumentar plano/spend cap;
- sem publicação/submissão em lojas;
- sem declarar Android/iOS homologados sem build/teste real.
