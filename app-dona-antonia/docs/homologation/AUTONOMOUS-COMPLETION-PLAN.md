# App Dona Antônia — Plano de Conclusão Autônoma

**Data:** 18/09/2026
**Limite:** no máximo 9 rodadas adicionais
**Branch:** `app-dona-antonia-r0-isolation`
**PR:** #396 — Draft — NÃO MERGEAR
**Objetivo:** esgotar toda programação, teste, hardening, documentação e preparação que possa ser feita sem interação humana, custo novo, produção real ou risco a clientes/dados reais.

## Regra de execução

Cada rodada deve:
1. ler `docs/projects/app-dona-antonia/HANDOFF.md`, este plano e `app-dona-antonia/PROJECT-STATUS.md`;
2. confirmar o HEAD antes de editar;
3. executar o máximo seguro da rodada;
4. se a rodada já estiver coberta por implementação equivalente, validar e avançar imediatamente para a próxima;
5. rodar os testes/typecheck/isolamento disponíveis e registrar limitações reais;
6. atualizar HANDOFF/STATUS/PR ao final;
7. nunca modificar `comprar/`, nunca mergear o PR, nunca ativar produção;
8. nunca inventar sucesso de Android/iOS/backend/lojas sem evidência real.

## Rodada A1 — Baseline, suíte e reprodutibilidade ✅ PROGRAMATICAMENTE CONCLUÍDA

- consolidar um comando de validação do App;
- auditar todos os testes existentes e remover inconsistências;
- validar typecheck possível;
- validar isolamento completo da branch;
- checar scripts npm e preflights;
- corrigir regressões locais encontradas;
- registrar claramente quais validações não podem rodar por ausência de runner/toolchain.

**Saída alcançada:** baseline programático consolidado. Foram auditados 53 arquivos em `tests/`, sendo 51 testes executáveis: 37 unit, 4 contract, 6 security, 3 e2e e 1 isolation; 0 testes executáveis ficaram fora do layout coberto. Criado `scripts/verify-test-layout.mjs`, `npm run verify:test-layout` e o gate agregado `npm run validate:programmatic`. A execução integral do gate continua dependente de runner/dependências disponíveis e não é declarada verde sem evidência real.

## Rodada A2 — Guard central e fail-closed total

- mapear todos os adapters com capacidade presente/futura de I/O;
- exigir `homologation`, `productionEnabled=false` e recursos `TEST-*` antes de qualquer efeito;
- aplicar guard central onde ainda faltar;
- ampliar scanner de segredo/config/host;
- testar que nenhuma ação bloqueada chega a rede/storage externo.

**Saída esperada:** barreira única de homologação cobrindo toda superfície programada.

## Rodada A3 — Sessão, identidade e pairing

- fechar contratos locais de sessão;
- expiração/revogação/replay;
- limites de tentativas;
- pairing de uso único;
- contratos de adapter nativo;
- contratos backend/HML ainda não publicados;
- testes de abuso e concorrência possíveis sem backend real.

**Saída esperada:** R12/R14 esgotadas até o limite não nativo.

## Rodada A4 — Deep links e notificações

- fechar policy de URLs/deep links;
- allowlist HTTPS;
- payloads opacos sem PII;
- roteamento interno determinístico;
- push HML sintético;
- preferências transacional/marketing;
- payload validation e deduplicação local;
- templates/configs nativos preparatórios que não exijam build real.

**Saída esperada:** R15/R16 esgotadas até o limite não nativo.

## Rodada A5 — Mídia, privacidade e dados locais

- fechar contratos de Photo Picker/câmera/microfone;
- MIME/tamanho/duração;
- política de metadados/EXIF;
- composição de anexos;
- privacidade local;
- revogação/limpeza de sessão;
- contratos para acesso/correção/exclusão;
- testes fail-closed sem upload real.

**Saída esperada:** R17/R19 esgotadas até o limite não nativo/backend.

## Rodada A6 — HML/backend preparado para deploy

- revisar migrations HML;
- integridade de carrinho/total;
- idempotência e rate limit;
- bootstrap/catalog/checkout;
- contratos de pairing/telemetria/privacidade que ainda puderem ser versionados;
- manifest/checklist de deploy;
- testes server-side locais/estáticos possíveis;
- não apagar Edge Functions e não aumentar plano.

**Saída esperada:** R13/R21 com todo código pronto, restando somente deploy/homologação bloqueados por quota.

## Rodada A7 — UX, acessibilidade, offline e desempenho

- auditoria estrutural completa;
- 320px;
- alvos de 44px;
- teclado/foco/ARIA;
- contraste/reduced motion;
- estados loading/empty/error/offline;
- recovery sem duplicação;
- budgets de performance;
- testes automatizáveis sem browser/aparelho real;
- corrigir qualquer inconsistência de UX detectável por código.

**Saída esperada:** R20/R23 esgotadas até o limite sem aparelho/browser real.

## Rodada A8 — Release/store/native readiness

- consolidar preflight Android/iOS;
- configs Capacitor preparatórias;
- checklist de APK/AAB/IPA;
- App Store/Play Store metadata drafts;
- reviewer profile TEST;
- privacy/data-safety drafts;
- release readiness fail-closed;
- security/release runbooks;
- não criar listing, tester, build ou submissão real.

**Saída esperada:** R22/R24 e preparação R10/R11 esgotadas até o limite sem toolchain real.

## Rodada A9 — Fechamento autônomo total

- auditar toda a branch desde o último baseline;
- executar novamente tudo que for possível;
- confirmar `comprar/` intocado;
- confirmar produção/pedidos/push/executores OFF;
- revisar todos os bloqueios restantes;
- corrigir qualquer tarefa segura que ainda reste, mesmo que pertença a rodada anterior;
- criar `docs/homologation/HUMAN-ACTIONS-FINAL.md` com passos humanos exatos e em ordem;
- criar `docs/homologation/FINAL-AUTONOMOUS-CHECKLIST.md`;
- atualizar HANDOFF, MASTER/STATUS e PR;
- marcar `PROGRAMMATIC_COMPLETE=true` somente se não restar nenhuma tarefa segura/independente.

**Saída esperada:** fim da programação autônoma. Tudo que restar deve depender de ambiente nativo, quota/custo, credencial, aparelho, console de loja, produção ou outra ação humana real.

## Travamentos permanentes

Até ação humana posterior:
- `comprar/` intocado;
- PR #396 Draft e não mergeado;
- produção OFF;
- pedidos reais OFF;
- push real OFF;
- Meta/PapoAI/Bling/logística OFF;
- dados reais de clientes proibidos;
- sem exclusão de Edge Functions para liberar quota;
- sem aumento de plano/spend cap;
- sem publicação em lojas;
- sem declarar Android/iOS homologados sem build/teste real.
