# App Dona Antônia — Plano de Conclusão Autônoma

**Data:** 18/09/2026
**Limite:** no máximo 9 rodadas adicionais
**Branch:** `app-dona-antonia-r0-isolation`
**PR:** #396 — Draft — NÃO MERGEAR
**Objetivo:** esgotar toda programação, teste, hardening, documentação e preparação que possa ser feita sem interação humana, custo novo, produção real ou risco a clientes/dados reais.

## Regra de execução
Cada rodada deve confirmar o HEAD, executar o máximo seguro, validar o possível, atualizar checkpoints e nunca modificar `comprar/`, mergear o PR, ativar produção ou inventar sucesso nativo/backend/lojas sem evidência real.

## Rodada A1 — Baseline, suíte e reprodutibilidade ✅ PROGRAMATICAMENTE CONCLUÍDA
Baseline programático consolidado: 53 arquivos em `tests/`, 51 testes executáveis, 0 fora do layout coberto; criado `scripts/verify-test-layout.mjs`, `npm run verify:test-layout` e `npm run validate:programmatic`. A execução integral continua dependente de runner/dependências e não é declarada verde sem evidência.

## Rodada A2 — Guard central e fail-closed total ✅ PROGRAMATICAMENTE CONCLUÍDA
Barreira central cobre HML network, push, mídia, secure session e telemetry sink. Todos exigem homologação, `productionEnabled=false` e recurso `TEST-*` antes de qualquer efeito. Ações de produção/executor externo permanecem bloqueadas incondicionalmente. Telemetria mantém registry fechado e rejeição de PII/advertising IDs; agora também falha fechado antes do sink em production, flag de produção ou resource não-TEST. Testes de segurança foram ampliados; não são declarados verdes sem runner real.

## Rodada A3 — Sessão, identidade e pairing
- fechar contratos locais de sessão; expiração/revogação/replay; limites de tentativas; pairing de uso único; contratos nativos/backend; testes de abuso/concorrência possíveis sem backend real.
**Saída esperada:** R12/R14 esgotadas até o limite não nativo.

## Rodada A4 — Deep links e notificações
- fechar policy de URLs/deep links; allowlist HTTPS; payloads opacos sem PII; roteamento determinístico; push HML sintético; preferências; validation/deduplicação; configs nativas preparatórias.
**Saída esperada:** R15/R16 esgotadas até o limite não nativo.

## Rodada A5 — Mídia, privacidade e dados locais
- contratos Photo Picker/câmera/microfone; MIME/tamanho/duração; EXIF; anexos; privacidade local; revogação/limpeza; acesso/correção/exclusão; testes fail-closed.
**Saída esperada:** R17/R19 esgotadas até o limite não nativo/backend.

## Rodada A6 — HML/backend preparado para deploy
- migrations; integridade carrinho/total; idempotência/rate limit; bootstrap/catalog/checkout; contratos pairing/telemetria/privacidade; manifest/checklist; testes possíveis; sem apagar Edge Functions/aumentar plano.
**Saída esperada:** R13/R21 com código pronto, restando deploy/homologação bloqueados por quota.

## Rodada A7 — UX, acessibilidade, offline e desempenho
- auditoria 320px/44px/teclado/foco/ARIA/contraste/reduced motion; loading/empty/error/offline; recovery; budgets; testes automatizáveis.
**Saída esperada:** R20/R23 esgotadas até o limite sem aparelho/browser real.

## Rodada A8 — Release/store/native readiness
- preflight Android/iOS; configs Capacitor; APK/AAB/IPA checklist; metadata; reviewer TEST; privacy/data-safety; release readiness; runbooks; sem listing/tester/build/submissão real.
**Saída esperada:** R22/R24 e preparação R10/R11 esgotadas até o limite sem toolchain real.

## Rodada A9 — Fechamento autônomo total
- auditar branch; executar tudo possível; confirmar `comprar/` intocado e efeitos reais OFF; corrigir trabalho seguro restante; criar `docs/homologation/HUMAN-ACTIONS-FINAL.md` e `FINAL-AUTONOMOUS-CHECKLIST.md`; atualizar checkpoints; marcar `PROGRAMMATIC_COMPLETE=true` somente se não restar tarefa segura/independente.

## Travamentos permanentes
- `comprar/` intocado; PR #396 Draft/não mergeado; produção/pedidos/push/executores reais OFF; sem Meta/PapoAI/Bling/logística/dados reais; sem apagar Edge Functions ou aumentar plano; sem publicação; sem declarar Android/iOS homologados sem build/teste real.
