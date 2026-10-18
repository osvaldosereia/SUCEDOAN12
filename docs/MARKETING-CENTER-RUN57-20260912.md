# Marketing Center — Run 57 — 2026-09-12

## Escopo desta rodada

Continuidade estritamente no módulo Marketing da Dona Antônia, sem Make, sem rollout e sem qualquer ativação externa. A rodada executou o próximo bloco seguro registrado na Run 56:

1. token efêmero determinístico de snapshot para detectar troca de contexto entre build e mount;
2. proteção fail-closed contra regressão de revisão somente em memória;
3. memória limitada por asset, sem Storage, banco, local/session storage ou filesystem;
4. manutenção integral dos gates, kill switches, canary e budgets fechados.

Nenhum publisher, IA paga, Storage, migration, Edge Function, Instagram/Messenger/Ads, credencial, endpoint ou gasto foi ativado.

## Auditoria antes de alterar

- Lido `docs/RETOMADA-DONA-ANTONIA.md`.
- Lido `docs/MARKETING-CENTER-RUN56-20260912.md`.
- PR isolada mantida: `#276`, branch `feat/marketing-center-clean-20260911`, draft.
- `main` auditada em `ea15ee578f6335ad33ee6968320311e42aa86ba7`, com mudanças recentes concentradas em WhatsApp Flow, Chat, Admin e automação de imagens de produto, fora do Marketing Center.
- Comparação antes da implementação: branch Marketing `114` commits à frente e `262` atrás da `main`; permaneceu isolada, sem rebase, merge ou force-push.
- Supabase confirmado fail-closed antes da implementação: Marketing OFF, `execution_mode=off`, canary 0%, kill switch ON, geração/render/IA/publicadores OFF, aprovação obrigatória e budgets zero.
- Contagens prévias: 0 assets, 0 render jobs, 0 publication jobs, 0 triage requests, 0 channel accounts e 8 eventos internos.
- 15/15 tabelas `marketing_%` com RLS ativo.
- 20/20 funções `marketing_%` auditadas como `SECURITY INVOKER`, sem EXECUTE para `anon` ou `authenticated`.

## Bloco implementado

Arquivo alterado:

- `admin-v3/marketing-quick-edit-review-summary-readonly-v1.js`

Teste ampliado:

- `scripts/test-marketing-quick-edit-review-summary-readonly-ui-v1.mjs`

### Token efêmero determinístico de snapshot

O summary agora exige um token derivado exclusivamente da identidade já sanitizada do contexto de revisão:

```text
asset_id + revision + package_sha256 + idempotency_key
```

Formato versionado:

```text
marketing-snapshot-v1:<asset>:<revision>:<package_sha256>:<idempotency_key>
```

O token:

- é determinístico;
- não é segredo, credencial ou bearer token;
- não concede autorização;
- existe apenas para detectar troca de contexto entre build e mount;
- não é gravado em banco, Storage, localStorage, sessionStorage, IndexedDB ou filesystem;
- é recalculado e comparado fail-closed antes de montar o summary.

Troca ou adulteração de token falha com `stale_snapshot:snapshot_token_mismatch`.

### Proteção contra regressão de revisão

O summary mantém em memória somente a maior revisão já observada por asset. Se um asset já apresentou revisão mais nova e depois for entregue um snapshot de revisão menor, a superfície falha fechado com:

```text
stale_snapshot:revision_regression
```

A memória é deliberadamente limitada:

- no máximo 100 assets;
- sem persistência externa;
- somente avança após todas as validações do snapshot, vínculos e comparação passarem;
- revisão igual não cria avanço nem efeito colateral;
- ao exceder o limite, o asset mais antigo é removido do mapa em memória.

### Guard no mount

Foi adicionada a função privada `mountSummary(...)`. O token validado durante o build precisa continuar idêntico imediatamente antes do mount. Assim, um summary montado com token de outro asset/revisão/pacote/chave é recusado mesmo se a troca ocorrer entre as duas etapas.

A superfície continua:

- `preview_only=true`;
- `mutations_allowed=false`;
- `network_allowed=false`;
- `external_side_effect=false`;
- fora do loader público do Admin;
- sem `fetch`, XHR, axios, credenciais, Storage, aprovação, scheduling, publishing, execute ou requeue.

## TDD comprovado

### RED

Primeiro o contrato foi ampliado exigindo:

- `createSnapshotToken`;
- `mountSummary`;
- token determinístico;
- rejeição de token adulterado;
- rejeição de regressão de revisão;
- rejeição de troca de token no mount.

Commit RED:

- `f5ee99382c312e068de3e4ec68855e352342dc4d` — `test(marketing): require ephemeral snapshot token and revision regression guard`.

Run RED:

- `34697359741` — `completed / failure`.

Todos os contratos anteriores do Marketing passaram. A única falha foi o novo passo `Validate dormant readonly Marketing review summary UI`, exatamente porque a produção ainda não possuía `mountSummary`:

```text
AssertionError: mountSummary must exist
actual: undefined
expected: function
```

### GREEN

Commit funcional:

- `3928551f902bda6f634212693ad06b697efb0fae` — `feat(marketing): guard summary with ephemeral snapshot token`.

Run GREEN:

- `34697418331` — `completed / success`.

O job `safety-contract` passou integralmente. Todos os 27 contratos do Marketing ficaram verdes, inclusive:

- clean transplant safety contract;
- editor e biblioteca;
- operações/readiness read-only;
- preflights e request bundles dos canais;
- approval preview;
- AI preflight offline;
- SVG/manifest/PNG em memória;
- pipeline de preview totalmente em memória;
- quick edit e pacote de revisão;
- handoff bounded-memory;
- comparison read-only;
- novo summary com token efêmero e revision-regression guard.

## Pós-auditoria Supabase

Após a implementação, o runtime permaneceu exatamente fechado:

- Marketing OFF;
- `execution_mode=off`;
- canary 0%;
- kill switch ON;
- geração OFF;
- deterministic render OFF;
- IA imagem/vídeo OFF;
- publicação global OFF;
- WhatsApp Status OFF;
- Instagram Stories OFF;
- Instagram Carrossel OFF;
- Facebook Stories OFF;
- Pinterest OFF;
- Google Perfil da Empresa OFF;
- aprovação obrigatória;
- attribution/triage/requeue OFF;
- budgets e limites diários em 0.

Contagens pós-implementação:

- `marketing_assets`: 0;
- `marketing_render_jobs`: 0;
- `marketing_publication_jobs`: 0;
- `marketing_render_triage_requests`: 0;
- `marketing_channel_accounts`: 0;
- `marketing_events`: 8;
- eventos com `external_side_effect=true`: 0.

Segurança pós-implementação:

- 15/15 tabelas `marketing_%` com RLS ativo;
- 20/20 funções `marketing_%` permanecem `SECURITY INVOKER` e sem EXECUTE para `anon`/`authenticated`.

Nenhuma migration, Edge Function, Storage, credencial, integração externa ou configuração de Auth foi alterada nesta rodada.

## Concorrência / main / PR

A `main` foi auditada em `ea15ee578f6335ad33ee6968320311e42aa86ba7`. A branch Marketing continuou deliberadamente isolada devido à divergência acumulada. Não houve rebase, merge, force-push ou alteração de outras frentes.

## Próximo bloco seguro sugerido

O Marketing ainda não está integralmente concluído/homologado.

Próxima rodada segura:

1. adicionar invalidação explícita, bounded-memory, do token quando uma revisão superior do mesmo asset for recebida, permitindo a UI distinguir `stale`, `superseded` e `current` sem persistência;
2. criar um pequeno envelope read-only de sessão de revisão que una token, revisão observada e blockers, ainda sem conteúdo bruto e sem ação mutável;
3. manter tudo privado, dormente e fora do loader público;
4. continuar sem vídeo real, IA paga, Storage, publishers, dispatch, requeue, canary, Instagram/Messenger/Ads ou gasto até autorização explícita.
