# DA6 — Rodada 5 concluída: revisão humana auditável e histórico (09/10/2026)

## Situação e evidências verificadas
- Projeto: `osvaldosereia/SUCEDOAN12`, branch `agent/gondola-labels-balance-20261009`, PR draft #987. **Nenhum merge ou deploy realizado nesta rodada.**
- **GitHub Actions DA6 [run 37943493695](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37943493695): 5/5 jobs SUCCESS** (`deterministic-tests`, `edge-types`, `postgres-review`, `postgres-upload`, `postgres-worker`).
- `deterministic-tests` teve **52/52 testes aprovados, 0 falhas**, incluídos três casos de histórico/revisão em Chrome.
- `postgres-review` aprovou migração `20261009140500_da6_manual_review_audit_v1.sql` e os testes ampliados de quantidade zero, 99, rejeição, correção, auditoria, slot inativo, duplicação entre fotos, replay idempotente, permissões e RLS. **PostgreSQL 17 efêmero com ROLLBACK**.
- Inspeção read-only do banco canônico `ssbesxgaijknwsjbsbcz`: 0 lotes, 0 fotos e 0 contagens; bucket `inventory-label-photos` privado; tabela `inventory_label_review_events` **ainda não criada em produção**.
- O contador de commits à frente da `main` aumentou, e a branch divergiu em três commits da `main` durante a rodada; revisar conflitos antes de merge, sem substituir alterações concorrentes.

## Entregas desta rodada, somente na branch
1. **Consulta on-demand do histórico:** nova ação autenticada `inventory_label_photo_history` em `inventory-label-photo-api.ts` e roteamento no `index.ts`. Antes de buscar qualquer evento, confirma que a foto pertence ao operador autenticado. Consulta no máximo 40 eventos somente quando solicitada pelo usuário, evitando custo no polling de 15 s. Resolve `display_name` em `admin_users` sem enviar UUID do operador ao navegador.
2. **Interface:** `inventory-label-photo-review.js` expõe histórico acessível por botão, com data, responsável, valor anterior/novo, decisão e justificativa. Toda nota e texto são escapados antes de entrar no HTML. Sinaliza fotos duplicadas e impede sugestão de segunda contagem sem registro.
3. **Indicadores e ergonomia:** `inventory-label-photo-tab.js` mostra contagens pendentes, aprovadas e rejeitadas separadamente das fotos processadas, preserva a conferência aberta no polling, conserva o histórico já consultado e **não re-renderiza enquanto o operador digita quantidade ou motivo**, evitando perda do preenchimento no celular. CSS adaptado ao mobile.
4. **Migração reforçada:** `inventory_label_review_count_v1` exige slot não nulo 1–6, UUID do produto válido, aceita quantidade explícita apenas na decisão `correct` e mantém a exigência de motivo com pelo menos cinco caracteres. Em caso de erro/colisão com foto diferente, não modifica a contagem original. A migração foi reconstruída a partir de commit aprovado após detectarmos uma substituição textual incorreta do caractere `$` numa regex — **defeito corrigido antes de publicação e validado pelo CI**.
5. **Testes:** `tests/da6-review-extended-assertions.sql` comprova valor 0/99, `reject`, `correct`, `approve`, replay idempotente, foto duplicada, ACL `service_role`, rejeição de papel comum, RLS do log e proibição de atualizar contagem finalizada. `tests/da6-review-history-browser.test.cjs` cobre consulta apenas por clique, escape de código HTML, aprovação de zero e duplicidade no Chrome em viewport mobile. Workflow `postgres-review` executa ambos os conjuntos SQL em uma mesma transação encerrada com `ROLLBACK`.

## Segurança e limites
- **Nenhuma contagem histórica é aplicada ao estoque vigente e nenhuma chamada ao Bling é disparada.** `approved` significa somente conferência histórica, não autorização para atualizar estoque.
- As migrações de revisão e reserva de upload **não foram aplicadas no banco canônico**; endpoints e interface DA6 permanecem apenas na branch. CI e browser automatizado não substituem homologação real.
- O log de auditoria só é lido para a fotografia do operador autenticado, e RLS/ACL restringem acesso direto às tabelas.
- Haverá novo ciclo de integração da `main` ao final, preservando A4, catálogo, pedidos e outros projetos concorrentes.

## Próxima rodada obrigatória — R6
1. Preparar ou utilizar ambiente de homologação isolado Supabase/Edge: upload assinado real (10, 50, 100 imagens), RLS de Storage, encerramento do navegador após upload confirmado, cron → worker WASM/QR/OMR → revisão, medição de memória/tempo e recuperação de falhas.
2. Criar fixtures/simuladores para plano de impressão físico; **homologação de impressora 203 dpi e fotografias de celular não pode ser declarada sem amostras físicas reais**. Se essas imagens não estiverem disponíveis, registrar o gate e avançar nos testes independentes possíveis.
3. Validar transação das migrações em cópia descartável e planejar rollback antes de deploy de produção.
4. Prosseguir R7 regressões do Admin/A4/cestas/checkout/permissões e R8 publicação gradual monitorada; nenhuma contagem histórica poderá escrever estoque sem fluxo canônico explícito e seguro.
5. Desativar a automação horária **somente após** produção homologada, testes reais e relatório final; não marcar entregue antes.
