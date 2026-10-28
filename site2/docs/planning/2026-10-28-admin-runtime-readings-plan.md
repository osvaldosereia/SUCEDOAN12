# Leituras dinâmicas do dashboard e das configurações — plano de implementação

> **Execução:** aplicar este plano no worktree isolado, tarefa a tarefa. Não criar nem executar testes automatizados, conforme a instrução do proprietário.

**Objetivo:** fazer as páginas iniciais do Admin exibirem leituras atuais do Supabase/Meta depois do login, em vez de mensagens congeladas durante a exportação estática.

**Arquitetura:** mover as leituras do dashboard, Configurações e Flows para efeitos client-side autenticados. Compartilhar os contratos de integração entre adaptadores server e browser; preservar os gateways/RPCs Supabase e os componentes de ação já existentes.

**Stack:** Next.js App Router em exportação estática, React, Supabase SSR/browser client, TypeScript, Biome.

**Spec:** `site2/docs/planning/2026-10-28-admin-runtime-readings-design.md`

## Restrições globais

- Projeto Supabase único: `ssbesxgaijknwsjbsbcz`.
- Usar somente a chave publishable no navegador; não ler ou exibir valores de secrets.
- Não modificar callbacks Meta, não enviar mensagens, não publicar Flow, não gravar Bling/estoque/pedidos e não emitir NF-e.
- Não aplicar migration nem redeployar Edge Functions.
- Não criar/rodar testes automatizados; executar somente verificações estáticas essenciais.
- GitHub Pages serve a pasta `site2/` na raiz do `main`, com `basePath=/site2`.

## Pontos de revisão

- Usuário sem sessão: a UI não apresenta dados comerciais e redireciona para login.
- Sessão inválida ou papel sem autorização: backend rejeita; o cliente mostra erro sem fingir sucesso.
- Timeout/falha de rede: páginas deixam de mostrar estados antigos como se fossem atuais e distinguem erro de contagem zero.
- Dois números/WABAs: manter a consulta individual por ID de canal e mostrar campos de resposta permitidos.
- Subpath: links, redirects e assets funcionam sob `/site2`.

## Tarefa 1 — contratos e adaptador browser de integrações

**Arquivos:**

- Criar `site2/src/lib/supabase/integration-types.ts`.
- Criar `site2/src/lib/supabase/browser-admin-integrations.ts`.
- Modificar `site2/src/lib/supabase/admin-integrations.ts` para importar e reexportar os tipos compartilhados.

**Interfaces:**

- Reutilizar os tipos `AdminIntegrationError`, `BlingIntegrationResult`, `MetaAccountReadinessResult` e seus dados discriminados.
- O adaptador browser exporta `getBlingIntegrationReadiness()` e `getMetaAccountReadiness(whatsappAccountId)` com os mesmos retornos seguros do adaptador server.
- `getBlingIntegrationReadiness` continua GET em `admin-products-live-v1?action=bling_status`.
- `getMetaAccountReadiness` continua POST em `meta-account-readiness-v1` com apenas o ID do canal; a função Edge executa somente a consulta Graph de leitura e filtra a resposta.

- [x] Extrair os tipos sem alterar os formatos de resposta.
- [x] Criar adaptador browser usando `@/lib/supabase/client`, `getSession`, `apikey` publicável e bearer da sessão.
- [x] Revisar diff para confirmar que não foi criada nenhuma chamada mutativa.
- [x] Executar Biome focalizado e `pnpm typecheck`.

## Tarefa 2 — Configurações e Flow em runtime

**Arquivos:**

- Modificar `site2/src/app/(admin)/configuracoes/page.tsx`.
- Modificar `site2/src/app/(admin)/configuracoes/fluxos/page.tsx`.
- Manter `site2/src/app/(admin)/configuracoes/fluxos/flow-setup-panel.tsx` sem novas ações automáticas.

- [x] Trocar as consultas server-side por `useEffect` com flag de montagem, estados de carregamento/erro e adaptadores browser existentes.
- [x] Buscar lista de canais, ANA, resumo Bling e, para cada canal, prontidão Meta.
- [x] Buscar canais na página Flow; renderizar painéis existentes somente depois de obter contas.
- [x] Manter as confirmações dos botões de configuração existentes; nenhuma ação de configuração será invocada durante carregamento.
- [x] Executar Biome focalizado, `pnpm typecheck` e `git diff --check`.

## Tarefa 3 — dashboard em runtime

**Arquivos:**

- Modificar `site2/src/app/(admin)/page.tsx`.

- [x] Carregar painel de pedidos, auditoria de foto, canais e status Bling no navegador pelos adaptadores existentes/novo.
- [x] Preservar o layout visual atual e distinguir carregamento, erro e valores reais.
- [x] Executar Biome focalizado, `pnpm typecheck` e `git diff --check`.

## Tarefa 4 — exportação, publicação e verificação do artefato

**Arquivos:**

- Atualizar o ledger `site2/docs/planning/implementation-ledger.md`.
- Publicar somente a saída estática nova sob `site2/` no `main`, preservando a raiz e o site `/site` existente.

- [x] Executar build estático com `NEXT_OUTPUT_EXPORT=1`, `NEXT_PUBLIC_BASE_PATH=/site2` e `pnpm build`.
- [x] Inspecionar de forma estática o HTML inicial de dashboard/configurações/Flows para garantir que os erros do build não continuam congelados; não ler ou expor secrets.
- [ ] Conferir se a árvore nova contém apenas `site2/`, sem excluir arquivos de `/site` ou da raiz.
- [ ] Commitar e enviar as mudanças de código/docs à branch de trabalho.
- [ ] Atualizar o artefato `site2/` no `main`; conferir sucesso do Pages e HTTP 200 para login, dashboard, configurações e assets.
- [ ] Registrar explicitamente que login com senha, autorização de operador e pedido real continuam sem validação enquanto não houver sessão operacional; não marcar o MVP completo por causa de uma build.
