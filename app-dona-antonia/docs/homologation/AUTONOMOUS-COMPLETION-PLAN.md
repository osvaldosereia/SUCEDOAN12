# App Dona Antônia — Plano de Conclusão Autônoma

**Data:** 19/09/2026
**Limite:** no máximo 9 rodadas adicionais
**Branch:** `app-dona-antonia-r0-isolation`
**PR:** #396 — Draft — NÃO MERGEAR
**Objetivo:** esgotar toda programação, teste, hardening, documentação e preparação que possa ser feita sem interação humana, custo novo, produção real ou risco a clientes/dados reais.

## Regra de execução
Cada rodada deve confirmar o HEAD, executar o máximo seguro, validar o possível, atualizar checkpoints e nunca modificar `comprar/`, mergear o PR, ativar produção ou inventar sucesso nativo/backend/lojas sem evidência real.

## Rodada A1 — Baseline, suíte e reprodutibilidade ✅ PROGRAMATICAMENTE CONCLUÍDA
Baseline programático consolidado; execução integral continua dependente de runner/dependências e não é declarada verde sem evidência.

## Rodada A2 — Guard central e fail-closed total ✅ PROGRAMATICAMENTE CONCLUÍDA
Barreira central cobre HML network, push, mídia, secure session e telemetry sink; efeitos reais permanecem bloqueados.

## Rodada A3 — Sessão, identidade e pairing ✅ PROGRAMATICAMENTE CONCLUÍDA ATÉ O LIMITE NÃO NATIVO
Pairing/session sintéticos fechados com TEST IDs/tokens, expiração, uso único e rate limits; restante depende de Keychain/Keystore/backend real.

## Rodada A4 — Deep links e notificações ✅ PROGRAMATICAMENTE CONCLUÍDA ATÉ O LIMITE NÃO NATIVO
Deep links mantêm roteamento determinístico e allowlist explícita; URLs absolutas exigem HTTPS. PII, credenciais e material de sessão falham fechado. Router sintético de notificações usa IDs `TEST-NOTIFICATION-*`, valida link antes do consumo e deduplica em memória. Push continua somente sintético.

## Rodada A5 — Mídia, privacidade e dados locais ✅ ESGOTADA PROGRAMATICAMENTE ATÉ LIMITE NATIVO
Cofre efêmero de metadados HML, IDs `TEST-MEDIA-*`, MIME/tamanho/TTL/retention fechados; política de EXIF e direitos locais sintéticos. Permissões/pickers e stripping EXIF efetivo dependem de build/teste nativo.

## Rodada A6 — HML/backend preparado para deploy ✅ ESGOTADA PROGRAMATICAMENTE SEM DEPLOY
Preflight, segurança de request/idempotência, bootstrap/catalog/checkout e fronteiras de pairing/telemetria/privacidade estão fechadas por contratos sintéticos fail-closed. Deploy/migrations reais continuam bloqueados por quota/ação operacional e não foram executados; não apagar Edge Functions nem aumentar plano.

## Rodada A7 — UX, acessibilidade, offline e desempenho ✅ ESGOTADA PROGRAMATICAMENTE ATÉ LIMITE DE BROWSER/APARELHO
Auditoria estática cobre 320px, 44px, foco/ARIA, contraste/reduced motion, estados loading/empty/error/offline, recovery e budgets. Restante exige browser/aparelho/medição real e está listado em `UX-CHECKLIST.md`.

## Rodada A8 — Release/store/native readiness ✅ ESGOTADA DOCUMENTALMENTE ATÉ LIMITE NATIVO/HUMANO
Preflight nativo existente permanece fail-closed. `STORE-RELEASE-READINESS.md` consolida gates Android/iOS, assinatura, metadata, reviewer TEST, privacy/data-safety, artefatos e regras de bloqueio. Nenhum build, console, listing, tester, TestFlight ou submissão foi executado. Android/iOS permanecem não homologados.

## Rodada A9 — Fechamento autônomo total ✅ CONCLUÍDA
Auditoria final confirmou o PR aberto/Draft/não mergeado, efeitos reais OFF e bloqueios remanescentes dependentes de runner/toolchain, quota, credenciais, console, aparelho ou ação humana. Foram criados `HUMAN-ACTIONS-FINAL.md` e `FINAL-AUTONOMOUS-CHECKLIST.md`.

**PROGRAMMATIC_COMPLETE=true** — não resta tarefa segura e independente dentro de A1–A9. Isto não equivale a homologação nativa, deploy backend, publicação ou autorização de produção. A branch está divergente de `main`; sincronização/rebase/merge não é feito autonomamente para não arriscar trabalho paralelo nem `comprar/`.

## Travamentos permanentes
- `comprar/` intocado por este escopo; PR #396 Draft/não mergeado; produção/pedidos/push/executores reais OFF; sem Meta/PapoAI/Bling/logística/dados reais; sem apagar Edge Functions ou aumentar plano; sem publicação; sem declarar Android/iOS homologados sem build/teste real.
- depois da A9 não criar novo escopo autônomo; executar apenas ações humanas documentadas ou novo escopo explícito.
