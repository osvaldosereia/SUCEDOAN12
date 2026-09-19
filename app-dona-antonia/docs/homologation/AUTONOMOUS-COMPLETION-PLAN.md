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
Preflight, segurança de request/idempotência, bootstrap/catalog/checkout e fronteiras de pairing/telemetria/privacidade estão fechadas por contratos sintéticos fail-closed. Pairing exige challenge/sessão TEST, frescor e uso único; telemetria proíbe PII/texto livre/ad ID/sink externo; privacidade limita acesso/exclusão ao mesmo subject TEST e zero escrita externa. Testes unitários foram versionados. Deploy/migrations reais continuam bloqueados por quota/ação operacional e não foram executados; não apagar Edge Functions nem aumentar plano.

## Rodada A7 — UX, acessibilidade, offline e desempenho — PRÓXIMA
- auditoria 320px/44px/teclado/foco/ARIA/contraste/reduced motion; loading/empty/error/offline; recovery; budgets; testes automatizáveis.

## Rodada A8 — Release/store/native readiness
- preflight Android/iOS; configs Capacitor; APK/AAB/IPA checklist; metadata; reviewer TEST; privacy/data-safety; release readiness; runbooks; sem listing/tester/build/submissão real.

## Rodada A9 — Fechamento autônomo total
- auditar branch; executar tudo possível; confirmar `comprar/` intocado e efeitos reais OFF; corrigir trabalho seguro restante; criar `docs/homologation/HUMAN-ACTIONS-FINAL.md` e `FINAL-AUTONOMOUS-CHECKLIST.md`; atualizar checkpoints; marcar `PROGRAMMATIC_COMPLETE=true` somente se não restar tarefa segura/independente.

## Travamentos permanentes
- `comprar/` intocado; PR #396 Draft/não mergeado; produção/pedidos/push/executores reais OFF; sem Meta/PapoAI/Bling/logística/dados reais; sem apagar Edge Functions ou aumentar plano; sem publicação; sem declarar Android/iOS homologados sem build/teste real.
