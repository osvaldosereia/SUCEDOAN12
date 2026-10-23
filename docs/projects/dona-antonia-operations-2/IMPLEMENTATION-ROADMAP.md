# Dona Antônia Operations 2.0 — IMPLEMENTATION ROADMAP

## Checkpoint R21 — observação incremental Admin1 — 2026-10-23 07:02:40 UTC

- Branch `agent/admin1-observation-r21-0702-20261023`, baseada no SHA mais recente de `main` consultado antes da edição: `f9cd3e93ce8e1faa7269748473dedec2bd2f723c`. PR #1269, #1321 e #1322 estão merged; os 42 workflows associados à main passaram e não havia PR Admin1 aberta.
- Duas consultas somente leitura e agregadas de logs (06:07:39–07:02:00 e 07:02:00–07:02:40 UTC) retornaram zero linhas para `admin1-products-read-v1` em `ssbesxgaijknwsjbsbcz` e `admin1-legacy-catalog-read-v1` em `xaoeldjuxzsdsblimzxo`, inclusive no período do smoke. As duas funções seguem ACTIVE e respondem 410; manter esse estado até completar as janelas de 24h e atribuir eventuais callers.
- Revalidado projeto canônico ACTIVE_HEALTHY, 1.247 migrations (uma linha alvo `20261020230115`), funções v5 e v377; projeto Admin1 separado ACTIVE_HEALTHY, função proxy v3. Nenhuma migration, função, configuração, RLS/grant ou dado alterado. A publicação R13 segue bloqueada por `SUPABASE_ACCESS_TOKEN` inválido; nenhuma credencial alternativa foi usada.
- Smoke read-only de `/` confirmou cinco cestas, quatro ofertas carregadas e carrinho vazio; `/vitrine/admin/` abriu a Central. Check do runtime passou (9 fragmentos, 638.778 caracteres) no checkout local já documentado no HANDOFF. Sem deploy de Pages ou Supabase; sem efeitos de pedido, cliente, fiscal, Bling, estoque ou financeiro.
- Arquivos alterados nesta rodada: HANDOFF e este roadmap. CI principal: 42/42 sucesso; checks da PR R21 precisam passar antes de integração. Rollback: reverter somente os commits documentais desta PR.
- Próxima tarefa concreta: após 2026-10-24 02:14:07.824 UTC, concluir 24h do proxy legado e atribuir chamadas; após 03:20:07.529 UTC, concluir 24h do leitor canônico e atribuir chamadas. Preservar 410 até os resultados. Após renovação do token pelo proprietário, publicar R13 via fluxo normal e verificar versão/hash/outcomes.


## Checkpoint R20 — drift R13 confirmado e verificação pós-R19 — 2026-10-23 06:07:39 UTC

- Base revalidada: `main` `fc50bead81bc87baaafbbf4c5a9e96324a7e676c`, squash da PR #1321. A PR #1321 está merged; os dois checks da PR passaram (`Admin service outcome telemetry CI` run #39909293923 e `Basket lot helper grant CI` run #39909293874). No push de main, 42/42 workflows terminaram com sucesso às 06:07 UTC.
- Comparação read-only do item de código registrado no roadmap: no projeto canônico `ssbesxgaijknwsjbsbcz`, `admin-service-intelligence-v1` continua ACTIVE v377, `verify_jwt=false`, SHA `543b00c23a468f361ce00c63a4ee81a537daed1a7e6f14cce33082e0676f5bb3`, atualizado em 2026-10-21 16:13:48.854 UTC. Comparei os 14 arquivos da versão implantada com `main`: 13/14 coincidem byte a byte. O único delta é `index.ts`: import de `withAdminServiceOutcomeTelemetry` e wrapper do dispatcher adicionados pela R13. Remover somente essa instrumentação da fonte de main produz igualdade byte a byte com o arquivo implantado; não há outro drift de fonte nessa função.
- A diferença é exatamente a instrumentação R13 já integrada e testada no repositório, ainda não publicada na função. A publicação permanece bloqueada pelo `SUPABASE_ACCESS_TOKEN` inválido registrado no workflow #39848977831, aguardando renovação pelo proprietário. Não tentei deploy nem usei credencial alternativa. Nenhuma Edge Function, migration, configuração, policy, grant ou dado foi aplicado; projeto alvo apenas consultado.
- Pós-merge, o smoke read-only recarregou `/` e `/vitrine/admin/`: homepage com cinco tamanhos de cesta, quatro ofertas após o carregamento assíncrono e pedido vazio (`0 itens · R$ 0,00`); a Central e a navegação do Admin abriram. Rotas preservadas. Nenhuma ação de pedido, checkout, mensagem, NF-e, Bling, estoque, pagamento ou financeiro foi acionada. Os logs Admin1 agregados e allowlisted entre 06:03:12 e 06:07:39 UTC ficaram vazios nos dois projetos, inclusive durante esse smoke.
- A janela Admin1 de 24h continua aberta: proxy `admin1-legacy-catalog-read-v1` v3 no projeto `xaoeldjuxzsdsblimzxo` fecha em/apos 2026-10-24 02:14:07.824 UTC; leitor canônico `admin1-products-read-v1` v5 fecha em/apos 2026-10-24 03:20:07.529 UTC. Os dois permanecem 410 e não devem ser removidos até que as janelas fechem e qualquer chamada seja atribuída.
- Check local do runtime já executado nesta rodada: `python3 scripts/build-vitrine-admin-runtime.py --check` retornou OK (9 fragmentos, 638.778 caracteres) no checkout disponível `agent/admin-runtime-contract-tests`/HEAD `fdad74b683d461b8581074f2c139332123cf5728`; alterações locais preexistentes foram preservadas. Esta PR é documental, não modifica runtime nem exige novo teste de domínio. Nenhuma implantação de Pages/Supabase foi solicitada por este checkpoint; o smoke confirma as rotas em produção após o merge.
- Rollback: reverter somente os commits do checkpoint documental; não há rollback de Supabase ou runtime.

### Próxima tarefa exata

Em/apos 2026-10-24 02:14:07.824 UTC, agregar 24h de logs allowlisted do proxy legado e excluir o GET 410 conhecido de smoke em 02:15:44.718 UTC, mantendo 410 se não houver caller. Em/apos 2026-10-24 03:20:07.529 UTC, fechar 24h do leitor canônico e atribuir qualquer chamada antes de decidir remoção. Separadamente, após a renovação do `SUPABASE_ACCESS_TOKEN` pelo proprietário, executar o preflight da R13, implantar a versão testada no projeto canônico e confirmar versão/hash; só então analisar os resultados agregados por ação/status/classe para reproduzir os 502. Sem renovação, não usar outra credencial nem acionar deploy.

## Checkpoint R19 — observação incremental Admin1 e smoke pós-R18 — 2026-10-23 06:03:12 UTC

- Base revalidada em `main` `81681420f012e63df4d54c2b43fa1845ba5575a0`. PR #1269 permanece merged; HANDOFF e roadmap já estão na main em `docs/projects/dona-antonia-operations-2/`. PR #1319 (alinhamento do arquivo de migration) e #1320 (checkpoint R18) estão merged. As 42 workflows associadas ao commit atual da main terminaram com sucesso às 06:00 UTC; nenhuma pendente/falha.
- Projeto canônico confirmado: `ssbesxgaijknwsjbsbcz`, ACTIVE_HEALTHY, sa-east-1, PostgreSQL 17.6.1.166. A ledger retornou 1.247 migrations, com uma linha para `allow_validated_hidden_basket_components` em `20261020230115`; nenhum SQL de migration foi aplicado ou reparado nesta rodada. `admin1-products-read-v1` permanece ACTIVE v5, `verify_jwt=false`, SHA `6a2c730ddbab268c0f95c4b08a9a3f443bbfa8bf8745584ed21dd2cbd8f7aa51`. `admin1-legacy-catalog-read-v1` segue ACTIVE v3 no projeto separado `xaoeldjuxzsdsblimzxo`, SHA `5f9d03ed30d6b5d125de6693b82a7e86c154148cfd2baee292ffa1a3731d4ae6`. Ambos continuam endpoints retirados que respondem 410; não foram alterados.
- Telemetria somente agregada e allowlisted entre 2026-10-23 05:22:00 e 06:03:12 UTC: zero linhas para os dois endpoints (inclui o smoke read-only abaixo). Nenhum corpo, PII, IP, cabeçalho ou identificador foi consultado. A janela de 24h do proxy legado fecha somente em/apos 2026-10-24 02:14:07.824 UTC; a janela da função canônica, em/apos 2026-10-24 03:20:07.529 UTC. Manter 410 até concluir ambas e atribuir qualquer caller; não remover endpoint com janela incompleta.
- Smoke read-only em 2026-10-23 aproximadamente 06:01–06:03 UTC: `/` abriu a Vitrine rápida, exibiu as cinco cestas (Econômica, Mini, Pequena, Média e Grande), quatro ofertas após carregar e pedido vazio (`0 itens · R$ 0,00`). `/vitrine/admin/` abriu a Central com a navegação existente. Rotas preservadas. Nenhum pedido/checkout, mensagem, NF-e, ação de Bling, estoque, pagamento ou financeiro foi iniciado.
- Check do runtime executado: `python3 scripts/build-vitrine-admin-runtime.py --check` → `OK: 9 source fragments exactly match vitrine/admin/admin-runtime.js (638778 characters)`. O checkout local disponível está na branch `agent/admin-runtime-contract-tests`, HEAD `fdad74b683d461b8581074f2c139332123cf5728`, com alterações preexistentes em testes/documentação/workflow preservadas; o check não escreveu arquivos. Este comando local não substitui CI da main. Esta PR altera somente HANDOFF e roadmap, portanto não exige teste de runtime nem outra suíte de domínio.
- Alterações desta rodada: somente este checkpoint documental em HANDOFF e roadmap. Nenhuma migration, função, configuração, policy, grant ou dado foi aplicada em Supabase; nenhum deploy de runtime/site é solicitado. Rollback: reverter o commit documental, sem rollback de banco. Sem alteração de site/Admin publicada por esta rodada.

### Próxima tarefa exata

Em/apos 2026-10-24 02:14:07.824 UTC, consultar o intervalo completo de 24h da `admin1-legacy-catalog-read-v1` no projeto separado, usando agregação por versão/método/status; excluir o GET 410 de smoke conhecido às 02:15:44.718 UTC e novos smokes identificáveis. Manter 410 se não houver dependência. Depois, em/apos 2026-10-24 03:20:07.529 UTC, fechar a janela de 24h da `admin1-products-read-v1` canônica com status/campos allowlisted. Não remover função com caller não atribuído. R13 segue bloqueada pela renovação de `SUPABASE_ACCESS_TOKEN` pelo proprietário; não usar credencial alternativa.

## Checkpoint R18 — alinhamento da migration à ledger e smoke pós-publicação — 2026-10-23 05:22:38 UTC

- Base revalidada: `main` em `4ccc3855d9cd5b2ce4fbecdd0c94c6f8aac55fc6`; PR [#1319](https://github.com/osvaldosereia/SUCEDOAN12/pull/1319) foi integrada por squash. A branch `agent/checkout-migration-ledger-align-20261023` renomeou `supabase/migrations/20261020230000_allow_validated_hidden_basket_components.sql` para `supabase/migrations/20261020230115_allow_validated_hidden_basket_components.sql`, sem alterar o SQL (blob `3ee339c467fe40c692f69135bf3e5875b19315c6`). Commits da branch: `a3bc59dd8c89c95eb7af667687a866ca171bb4cb` e `27c37809f185807ac268f8b31dc339b1d1e86c6d`; squash: `4ccc3855d9cd5b2ce4fbecdd0c94c6f8aac55fc6`.
- Reconciliação red/green read-only: antes da renomeação, a comparação encontrou a versão local `20261020230000` diferente da versão remota; o SQL já era idêntico. `supabase_migrations.schema_migrations` no canônico tem exatamente uma linha para `allow_validated_hidden_basket_components`, versão `20261020230115`, com `statements[1]` byte a byte igual ao arquivo (ignorando somente newline terminal). Depois, o caminho do arquivo, a versão da ledger e o SQL coincidem. Não foi necessário aplicar ou reparar migration, nem inserir linha na ledger; a ausência de `20261020230000` era somente divergência de timestamp/nome do arquivo. O próximo passo anterior sobre repair/reconciliação fica resolvido.
- Projeto Supabase canônico confirmado: `ssbesxgaijknwsjbsbcz`, ACTIVE_HEALTHY, sa-east-1, PostgreSQL 17.6.1.166. `admin1-products-read-v1` segue ACTIVE v5, `verify_jwt=false`, SHA `6a2c730ddbab268c0f95c4b08a9a3f443bbfa8bf8745584ed21dd2cbd8f7aa51`; a função separada `admin1-legacy-catalog-read-v1` continua ACTIVE v3 no projeto `xaoeldjuxzsdsblimzxo`. Nenhuma migration, Edge Function, schema, policy, grant, configuração ou linha de negócio foi escrita nesta correção. A função de checkout já estava alinhada ao SQL da ledger antes da PR.
- CI: o gate da PR #1319, `attendance-papoai-send-ci` run #39905153905, concluiu sucesso. Às 05:22:02 UTC, 40 de 42 workflows associados ao squash estavam concluídos com sucesso, sem falhas; `Basket mold admin` e `Basket kit editor` ainda estavam em execução. O checkout local não está montado. O runtime do Admin não mudou, portanto `python3 scripts/build-vitrine-admin-runtime.py --check` não se aplica.
- Publicação e smoke read-only: Pages run #39904191604 (commit `b254aa6`) e #39904693902 (commit `654c02c`) completaram build e deploy. Em 2026-10-23 aproximadamente 05:21 UTC, após recarga, `/` exibiu os cinco tamanhos, quatro ofertas após carregar e carrinho `0 itens · R$ 0,00`; `/vitrine/admin/` abriu a Central com a navegação existente. Nenhum botão de produto/pedido, checkout, mensagem, NF-e, Bling, estoque, pagamento ou financeiro foi acionado. Rotas continuam `/` e `/vitrine/admin/`.
- Telemetria agregada allowlisted entre 05:02:04 e 05:22:00 UTC: zero linhas para `admin1-products-read-v1` no canônico e zero para `admin1-legacy-catalog-read-v1` no projeto separado. A janela de 24h segue incompleta; nenhum payload, IP, cabeçalho, query ou identificador foi lido.
- Rollback: reverter o squash #1319 restaura o nome anterior do arquivo, mas reintroduz o timestamp pendente no runner; só fazê-lo se houver falha demonstrada. Não há rollback Supabase porque nenhum estado de banco mudou.

### Próxima tarefa exata

Em ou após `2026-10-24 02:14:07.824 UTC`, agregar a primeira janela completa de 24h da função proxy v3 no projeto `xaoeldjuxzsdsblimzxo`, separar o GET 410 de smoke conhecido às 02:15:44.718 UTC e manter 410. Em ou após `2026-10-24 03:20:07.529 UTC`, fechar 24h de `admin1-products-read-v1` v5 no canônico, usando apenas status HTTP e campos allowlisted e excluindo o GET de smoke já registrado. Não remover as funções enquanto houver caller não atribuído. R13 segue aguardando a renovação de `SUPABASE_ACCESS_TOKEN` pelo proprietário; não usar credencial alternativa.

## Checkpoint R17 — migration de checkout versionada e observação Admin1 — 2026-10-23 05:13 UTC

- Base revalidada em main `1737b7c52f602a0bda900eb5df22955198ae0707`; PR #1269 permanece integrada. PR #1317, aberta pela branch `agent/checkout-hidden-basket-components-20261023`, foi integrada por squash em `b254aa69566604601dffa066577616044db8022a`. O único arquivo de código é `supabase/migrations/20261020230000_allow_validated_hidden_basket_components.sql`, blob `3ee339c467fe40c692f69135bf3e5875b19315c6`, idêntico ao arquivo da antiga PR #1204. A PR antiga foi fechada após a integração do arquivo; seu head antigo falhava no workflow de Atendimento, enquanto a nova head passou no contrato #39904066282.
- A consulta do projeto canônico `ssbesxgaijknwsjbsbcz` (ACTIVE_HEALTHY, sa-east-1, PostgreSQL 17.6.1.166) confirmou que `create_vitrine_cart_order_v3_base(text,text,jsonb,jsonb,jsonb)` já contém o guard de cesta oculta, a validação de `history_kind` e a checagem de estoque fresco. A função é SECURITY INVOKER. A versão `20261020230000` não aparece no ledger retornado por `supabase_list_migrations`; portanto não foi reaplicada nesta rodada. Nenhuma linha de pedido/cliente/estoque foi alterada e nenhuma Edge Function, policy, grant ou configuração foi aplicada.
- As branches de desenvolvimento listadas incluíam apenas `da6-qa-20261009` em `MIGRATIONS_FAILED` e `main` de produção; não havia branch viável para testar a migration. A migration protege execução repetida com marcador e aborta se o bloco anterior do RPC divergir. A função atual já corresponde ao alvo, então não houve mudança funcional no banco. A discrepância entre função e ledger fica registrada para conciliação por ferramenta de repair que aceite a versão exata; não inserir manualmente em `supabase_migrations` nem criar uma segunda versão.
- CI: check `contract` da PR #1317 passou (workflow `attendance-papoai-send-ci`, run #39904066282). Na verificação pós-merge do commit `b254aa6`, 44/45 check runs estavam em sucesso às 05:13 UTC, sem falhas; o último, `test` no run #39904198087, permanecia na instalação do Chromium do Playwright. O checkout local não estava disponível, então não foram executados testes locais. `python3 scripts/build-vitrine-admin-runtime.py --check` não se aplica: nenhum runtime Admin foi alterado.
- Smoke somente leitura em 2026-10-23: a homepage `/` exibiu os cinco tamanhos, depois quatro ofertas carregadas, e carrinho vazio. `/vitrine/admin/` abriu a Central do Admin existente. Não foram acionados botões de produto/pedido, checkout, mensagem, NF-e, Bling, estoque, pagamento ou financeiro. A rota continua `/vitrine/admin/`. Retificação R18: o Pages deploy dos commits #1317/#1318 foi confirmado nos runs #39904191604 e #39904693902; não houve deploy Supabase.
- Observação R16 incremental: entre 04:03:00 e 05:02:04 UTC, não houve chamada a `/functions/v1/admin1-products-read-v1` no projeto canônico. No projeto separado `xaoeldjuxzsdsblimzxo`, a função `admin1-legacy-catalog-read-v1` continua ACTIVE v3, hash `5f9d03ed30d6b5d125de6693b82a7e86c154148cfd2baee292ffa1a3731d4ae6`; na janela desde a atualização às 02:14:07.824 UTC houve somente GET 410 em 02:15:44.718 UTC, o smoke conhecido. A canônica permanece ACTIVE v5, hash `6a2c730ddbab268c0f95c4b08a9a3f443bbfa8bf8745584ed21dd2cbd8f7aa51`.
- Rollback da mudança no repositório: reverter o squash #1317 remove somente o arquivo versionado. Não existe rollback de função/banco desta rodada, pois o alvo já estava presente e nenhuma aplicação foi feita. O rollback não deve reimplantar uma função anterior nem remover o guard ativo.

### Próxima tarefa exata

Em ou após `2026-10-24 02:14:07 UTC`, agregar a primeira janela de 24h do proxy v3 em `xaoeldjuxzsdsblimzxo`, separar o GET de smoke conhecido e manter a resposta 410. Em ou após `2026-10-24 03:20:07 UTC`, fechar 24h da função v5 canônica com status e campos allowlisted, sem payload/PII. A divergência de versão da migration foi resolvida em R18: a ledger já guardava o SQL exato sob `20261020230115`, e o arquivo foi alinhado sem reapply ou repair. R13 continua aguardando renovação de `SUPABASE_ACCESS_TOKEN` pelo proprietário. Não remover as funções enquanto houver dependência/chamada não atribuída.

### Acompanhamento R16 — recorte inicial de observação — 2026-10-23 04:03 UTC

- Main `1dbacf0856e66d0fd4873d22db09d8e307c8e9c8`; PR #1269 integrada; PR #1315 integrada. As rotas continuam `/` e `/vitrine/admin/`.
- Todos os 42 workflows de push da main passaram.
- No projeto canônico `ssbesxgaijknwsjbsbcz`, a função `admin1-products-read-v1` permanece ACTIVE v5 com hash `6a2c730ddbab268c0f95c4b08a9a3f443bbfa8bf8745584ed21dd2cbd8f7aa51`. Na janela inicial de 03:20:07–04:03 UTC houve apenas o GET de smoke HTTP 410; a única linha de telemetria interpretável é `products/browser/none/unknown/none` (ação/caller/origem/página/fetch-site). A janela de 24h segue incompleta.
- Smoke read-only confirmou cinco tamanhos de cesta, quatro ofertas e pedido vazio na homepage; a lista de produtos carregou no Admin existente. Nenhuma alteração real foi executada.
- Sem alteração funcional, Supabase, migration, configuração ou publicação nesta rodada. O rollback limita-se ao commit documental; runtime permaneceu inalterado.

### Próxima tarefa exata

Revisar 24h do proxy separado `admin1-legacy-catalog-read-v1` v3 a partir de 2026-10-24 02:14:07 UTC; depois fechar 24h da função canônica v5 a partir de 2026-10-23 03:20:07 UTC em 2026-10-24 03:20:07 UTC. Excluir o smoke conhecido, agregar somente campos allowlisted e manter 410 até decisão sustentada por tráfego/dependências. R13 segue bloqueada pela renovação do `SUPABASE_ACCESS_TOKEN` pelo proprietário.

### Conclusão R16 — leitor Admin1 exposto aposentado — 2026-10-23 03:23 UTC

- Base `main`: `acdc4d2118c833e0945f551f747a88aa85fec0bc`; PR #1269 integrada. Rotas preservadas: `/` e `/vitrine/admin/`.
- PR #1314 integrada por squash; v4 de `admin1-products-read-v1` substituída por handler 410, sem consultas/service role, com telemetria sanitizada. CI do contrato (#39894257441) e consumidor Admin (#39894257433) aprovados.
- Projeto canônico `ssbesxgaijknwsjbsbcz`: função ACTIVE v5, `verify_jwt=false`, hash `6a2c730ddbab268c0f95c4b08a9a3f443bbfa8bf8745584ed21dd2cbd8f7aa51`, atualizada às 03:20:07.529 UTC. O log real das 03:20:29.940 UTC comprova GET HTTP 410; JSON smoke `legacy_endpoint_retired`. Nenhuma migration/DDL, dado, policy, grant ou configuração foi alterada.
- Smoke atual do Admin em `/vitrine/admin/` carregou cinco produtos sem mutações. Homepage já smokeada na rodada anterior; a recaptura AX desta rodada falhou antes de renderizar estado. Nenhum efeito real de pedido, mensagem, fiscal, estoque ou financeiro. Runtime Admin inalterado; verificação do build não aplicável sem checkout local.
- Rollback: reverter squash #1314 e reimplantar v4 do pai `d90b7b1`; restaura comportamento vulnerável, somente se houver regressão funcional comprovada. Evidência detalhada em HANDOFF.
  
### Próxima tarefa exata

Depois de `2026-10-24 03:20:07 UTC`, revisar 24h completos da v5 com agregação segura por status e telemetria allowlisted; separar o GET de smoke das chamadas posteriores e manter 410 até atribuir qualquer caller. Em seguida, após `2026-10-24 02:14:07 UTC`, revisar 24h do proxy separado `admin1-legacy-catalog-read-v1` v3. Não executar a remoção final sem comprovar zero dependências/chamadas e confirmar rollback. R13 continua pendente de `SUPABASE_ACCESS_TOKEN` renovado pelo proprietário.


> Aprovado para implantação segura em 2026-09-25. Executar por homologação, shadow/canary e rollback; não fazer big-bang.
> Atualizado em 2026-10-23 após validação do estado real no GitHub, site em uso e Supabase.

### Conclusão R15 — Admin1: aposentar proxy sem consumidores — 2026-10-23 02:18 UTC

- Base de código revalidada: `main` em `5b08618085415eef5fe7119ed183436ec4669fdc`; PR #1269 já está integrada. O Admin continua em `/vitrine/admin/`.
- PR #1308 foi integrada em `5b08618` e aposentou apenas `admin1-legacy-catalog-read-v1` no projeto separado `xaoeldjuxzsdsblimzxo`. O proxy agora retorna 410 sem consultar o upstream; OPTIONS preserva 204/CORS. O endpoint canônico `admin1-products-read-v1` v4 em `ssbesxgaijknwsjbsbcz` foi preservado por tráfego histórico sem caller atribuído.
- CI dedicado da PR #1308 (#39888361655) e do commit de merge (#39888434036) passaram; Pages #39888433617 passou; 46/46 checks de `main` verdes. Smoke read-only confirmou homepage `/`, Admin `/vitrine/admin/` e resposta 410 da função aposentada. Evidência detalhada, arquivos/commits e rollback em HANDOFF.
- Deploy aplicado somente ao projeto `xaoeldjuxzsdsblimzxo`, versão 3/hash `5f9d03ed30d6b5d125de6693b82a7e86c154148cfd2baee292ffa1a3731d4ae6`. Nenhuma migration, dado, grant, policy, configuração ou função do projeto canônico foi alterada; advisors não se aplicam.
- Reversão: revert do squash #1308 e reimplante da versão anterior do proxy no projeto xao, conforme revisão `f50aeb7`; sem rollback de banco.

### Próxima tarefa exata

Após 2026-10-23 20:00:29 UTC, agregar uma janela completa de 24h dos logs de `admin1-products-read-v1` v4 no projeto canônico e atribuir chamadas por ação/contexto sem payload/PII; manter a função até resolver consumidores históricos. Após 2026-10-24 02:14:07 UTC, medir 24h completos do proxy legado v3 e verificar se houve chamadas além do GET de smoke; manter 410 enquanto a origem de qualquer chamada não estiver esclarecida. A publicação da telemetria R13 segue bloqueada pela renovação de `SUPABASE_ACCESS_TOKEN` (#39848977831), sem substituição por outra credencial.

### Conclusão R14 — 2026-10-23 01:30 UTC

- Main de código: `727c44cd1bc86ae9395235f3979ab03caa2c0483`. PR #1301 (squash `daa0f9e`) alinhou `firstCestasMs` ao marco `da-home-size-cards` e os contratos/browser aos cinco tamanhos sem preço/contagem inicial. Oito checks da PR passaram e 48/48 workflows pós-merge passaram; Pages #39883669088 publicou o SHA `daa0f9e`.
- O smoke R6 revelou que seu seletor de imagem estava obsoleto (`.basket-card-photo` vs. `.basket-size-card-photo`). PR #1305 corrigiu o observador/assertions, conectou esse arquivo aos filtros de CI e testou as cinco ações nos cards; squash `727c44c`. Basket product carousel #39884069118 e Basket kit editor #39884069147 passaram. Smoke R6 confirmou 5 cards, imagem carregada em 390×844 e 320×740, sem overflow/erros JS; `firstCestasMs` 2773/2816 ms. Pages #39884215611 também passou; na main ainda havia dois runs de Basket kit editor instalando Chromium, sem falhas reportadas às 01:30 UTC.
- Sem mudança no Admin, Supabase ou dados; rota continua `/vitrine/admin/`. Estado/hash das funções, smoke, rollback e evidência detalhada no HANDOFF. PRs redundantes #1298/#1302 foram fechadas após reconciliação dos deltas.

### Próxima tarefa exata

Auditar por leitura as fontes/callers das funções ativas `admin1-products-read-v1` v4 no canônico e `admin1-legacy-catalog-read-v1` v2 em `xaoeldjuxzsdsblimzxo`; mapear projeto/hash/consumidor/rota. Não mover Admin/rotas nem fazer deploy até comprovar divergência com teste e plano de rollback. O deploy da telemetria R13 continua aguardando a renovação de `SUPABASE_ACCESS_TOKEN` pelo proprietário; seguir a reconciliação Admin1 como tarefa independente.

### Acompanhamento R14 — 2026-10-23 01:18 UTC

- Main atual: `d228fdb521479794d96fe68805564fe229e3b1c3`. PR #1301 segue aberta na head `f911b9d93bcbc6aa934546235095d223a3eebf8f`; seis workflows passaram e os dois finais (#39882594973 e #39882595018) seguem em instalação de Chromium, antes dos testes. A reprodução V8 de R3 passou após limitar o harness aos helpers da homepage e marcar `cestas-completas` no fixture.
- Não houve publicação nem alteração Supabase. O projeto canônico permanece ACTIVE_HEALTHY, e as versões/hash relevantes, rotas preservadas, smoke e rollback estão registrados no acompanhamento R14 do HANDOFF.
- Próximo gate: concluir os dois workflows da head atual; corrigir e repetir se houver falha; após ambos verdes, revalidar mergeabilidade, integrar #1301 normalmente, confirmar Pages e smoke de `/` e `/vitrine/admin/`. Depois encerrar duplicatas apenas quando seus deltas estiverem cobertos.

### Checkpoint de execução — 2026-10-23 (R14: cards leves da homepage e contrato de CI)

- Main revalidada: `5d24cd70d4c609dcdd4ea8aeb94b0c867ccaff10`; PR #1300 integrada. PR #1301 aberta/mergeable na base `483d30e6ee811a5a9eb290f6cc0367abd9db1a4d`, branch `agent/fix-public-basket-card-contracts-20261023`, head `31184b23385c536e7a86e4f8902de60079a83ed3`.
- A PR alinha testes e fixtures de navegador ao contrato atual `home_size_cards`, preserva as cinco opções de Cestas Completas sem preço/contagem no carregamento inicial e corrige `firstCestasMs` para ler o marco ativo `da-home-size-cards`. O teste R2 agora avalia somente os dois helpers puros; a reprodução isolada passou.
- Arquivos: `index.html`; `scripts/test-admin-pending-data-baskets-public-v1.mjs`; `scripts/test-basket-carousel-browser.mjs`; `scripts/test-basket-home-browser.mjs`; `scripts/test-basket-unified-commercial-model.mjs`; `scripts/test-home-performance-contract.mjs`; `scripts/test-storefront-mobile-r1.mjs` até `r4.mjs`.
- Head CI #31184b2: seis workflows passaram (#39881247833, #39881247867, #39881247838, #39881247841, #39881247844 e #39881247805). Os gates #39881248170 (Basket product carousel) e #39881247911 (Basket kit editor) permaneciam `in_progress` na instalação de Playwright/Chromium às 2026-10-23 01:04 UTC; sem resultado final, portanto não integrar ainda.
- Smoke somente leitura em 2026-10-23 confirmou a homepage acessível em `/`, título da Vitrine e pedido vazio. O leitor web não executou a UI dinâmica nem abriu o Admin; o smoke visual mais recente do Admin disponível no histórico do handoff foi em 2026-10-22. Nenhum pedido/checkout/mensagem, NF-e, ação Bling, estoque ou financeiro foi acionado. Sem evidência de publicação desta PR.
- Supabase canônico `ssbesxgaijknwsjbsbcz` revalidado ACTIVE_HEALTHY, sa-east-1, PostgreSQL 17.6.1.166, 142 funções. `storefront-v2` v99/hash `5bd0b5ab9ec2b21c00c6a185daaf45ef6d75aee2dc4c0598a165b43b00d7dfd2`; `admin-service-intelligence-v1` v377/hash `543b00c23a468f361ce00c63a4ee81a537daed1a7e6f14cce33082e0676f5bb3`; `admin-products-live-v1` v184/hash `d087c872ed23fa03dc2c3c784255b2bada1129de62b07db6f558c8ab7fd6291e`. `admin1-products-read-v1` continua ACTIVE v4 no canônico e `admin1-legacy-catalog-read-v1` ACTIVE v2 no projeto `xaoeldjuxzsdsblimzxo`. Nenhuma alteração Supabase; advisors não se aplicam.
- Sem runtime visual do Admin: build check do runtime não aplicável. Rollback, se a #1301 for integrada, é revert do squash; sem rollback de banco.

### Próxima tarefa exata

Aguardar os runs #39881248170 e #39881247911; integrá-la por squash somente quando os gates concluírem com sucesso. Se instalador de Chromium continuar pendente/falhar, registrar o bloqueio exato e não contornar a proteção. Após o merge, confirmar Pages e smoke somente leitura em `/` e `/vitrine/admin/`; então encerrar PRs sobrepostas #1302 e #1298 após conferir que os deltas estão cobertos.
### Checkpoint de execução — 2026-10-22 (R13: telemetria segura de resultado por ação)

- Main antes da mudança: 13edd3d43a837d33c62a084643fde909e68d269c. A implementação da PR #1290 foi integrada por squash em 9b8710e6981e5e664ce7f59fd186c552054e07f0; branch/head agent/admin-service-outcome-telemetry-20261022 / e4f966cb409fbc2c0999c91ee44b9cd370852837. PR: https://github.com/osvaldosereia/SUCEDOAN12/pull/1290.
- Mudança: instrumentação de saída do dispatcher de admin-service-intelligence-v1 com allowlist fixa das 41 ações, status HTTP e classe de erro de baixa cardinalidade. Só quatro campos allowlisted são logados; payload, PII, identificadores e detalhes de erro/provedores são excluídos. Resposta original e propagação de exceções foram preservadas.
- Arquivos: supabase/functions/admin-service-intelligence-v1/index.ts; supabase/functions/admin-service-intelligence-v1/_shared/admin-service-outcome-telemetry.mjs; scripts/test-admin-service-outcome-telemetry.mjs; .github/workflows/admin-service-outcome-telemetry-ci.yml. Commits de implementação/teste/CI: 97851f30b9c035a793ff108571020af49b3e9a2a, 12a1ea05c819539be52ba307c02d834e2985f5fe, 4a950744715d0832a77eb6bf588236d4f0c84133, cef284d15cf0192a79e221ff400c43fe775dc7f4 e e4f966cb409fbc2c0999c91ee44b9cd370852837.
- Verificação: teste de contrato local passou em Node v24.19.0; workflow dedicado e nove workflows adicionais da PR passaram na head final (incluindo #39869720058); no merge, o workflow dedicado #39869839458 e os demais workflows de push iniciados para o commit também concluíram com sucesso. A tentativa inicial de verificar todo o entrypoint com Deno reportou 178 diagnósticos em código legado inalterado; o CI final verifica o contrato da integração e faz deno check somente do helper.
- Supabase alvo: projeto canônico ssbesxgaijknwsjbsbcz, ACTIVE_HEALTHY em sa-east-1, PostgreSQL 17.6.1.166. Função ainda ACTIVE v377 com hash 543b00c23a468f361ce00c63a4ee81a537daed1a7e6f14cce33082e0676f5bb3; a telemetria nova não foi implantada. Nenhuma migration/configuração/dado/policy/grant/função foi aplicada. Deploy continua bloqueado pelo erro já registrado de SUPABASE_ACCESS_TOKEN no run #39848977831; não foi contornado.
- Smoke somente leitura em 2026-10-22: site / e Vitrine Admin /vitrine/admin/ abriram; cesta vazia, sem pedido. A rota foi mantida. O check do runtime do Admin não se aplica porque nenhum arquivo desse runtime foi alterado.
- Publicação confirmada: merge no repositório; não há evidência de deploy da função. Rollback: revert do merge da PR #1290; sem rollback de banco, porque não houve mutação Supabase.

### Próxima tarefa de código/operação

Após o proprietário renovar/validar SUPABASE_ACCESS_TOKEN, publicar o SHA atual de main no projeto canônico, conferir versão/hash e analisar telemetria agregada por ação/status/classe para reproduzir e corrigir a origem dos 502 com teste. Enquanto a credencial estiver inválida, não acionar o deploy nem contorná-lo por outra credencial; seguir uma tarefa independente do roadmap que possa ser implementada e verificada sem essa publicação.

## REFORMA CONTÍNUA DO SISTEMA E DO SITE PÚBLICO — 2026-10-22

### Checkpoint de execução — 2026-10-22 (R12: paridade do runtime de inteligência de serviço)

- Base da auditoria: `main` `b315c1ab6569396ad1d171a917ca76b08f2f6400`; PR #1269 integrada. PR #1286 partiu da branch `agent/admin-service-audit-checkpoint-20261022`, commit final `e61253a9fc460a55d8ffcec5e278c6fcc41b6ed5`, e foi integrada por squash em `2026-10-22T22:13:55Z` como `3ee3651e6fc1fc9982f998d1850f0ed1f9b07a62`. Esta confirmação de smoke/documentação está na branch `agent/admin-service-audit-smoke-final-20261022`.
- `Basket lot helper grant CI` passou nos runs #39863190764 (commit inicial `449dd43f0b4b65764c28edf96518993ec3183a30`), #39863339275 (commit final `e61253a9fc460a55d8ffcec5e278c6fcc41b6ed5`) e no push de main #39863403369 (merge `3ee3651e6fc1fc9982f998d1850f0ed1f9b07a62`).
- Alvo Supabase confirmado: projeto canônico `ssbesxgaijknwsjbsbcz`, ACTIVE_HEALTHY, sa-east-1, PostgreSQL 17.6.1.166. `admin-service-intelligence-v1` está ACTIVE v377, `verify_jwt=false`, hash publicado `543b00c23a468f361ce00c63a4ee81a537daed1a7e6f14cce33082e0676f5bb3`.
- Paridade de fonte confirmada por leitura: os 14 arquivos retornados pela implantação v377 coincidem byte a byte com os caminhos equivalentes de main. As 10 fontes XML sob `supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/` também coincidem byte a byte com as 10 cópias standalone em `supabase/functions/purchase-xml-v1/`. Não há drift funcional ou de fonte que justifique deploy.
- Telemetria agregada da função, janela exata 2026-10-21 22:04Z–2026-10-22 22:04Z: 1.162 POST — 1.060 respostas 200, 78 respostas 502 e 2 respostas 500 — mais 16 OPTIONS 200 e 22 respostas 409. Os 80 erros 5xx exibiram `EDGE_FUNCTION_ERROR`. Os 2 eventos de log `level=error` correspondem aos 2 HTTP 500; não houve evento `level=error` correlacionado às 78 respostas 502. Os logs disponíveis não identificam qual `action` estava no corpo; nenhum corpo, conteúdo de cliente, URL de busca ou identificador de pedido foi lido ou armazenado neste checkpoint.
- Resultado operacional: a função está em uso, então não desativar nem substituir. A concentração de 502 inclui pico de 43 numa hora UTC e 10 na hora seguinte; a causa e a ação de origem ainda não estão comprovadas. 409 foi mantido como conflito sem inferir defeito.
- Alterações desta rodada: somente HANDOFF e roadmap. Projeto alvo `ssbesxgaijknwsjbsbcz` consultado em modo read-only; nenhuma migration, DDL, função, configuração, grant, policy ou dado foi aplicado. O smoke gerou apenas leituras do site/Admin; nenhum pedido/checkout, mensagem, NF-e, ação de Bling, estoque ou financeiro foi acionado.
- CI: os workflows recentes observados no HEAD de main antes da PR estavam verdes. O teste dirigido `Basket lot helper grant CI` passou nos runs #39863190764 (commit inicial), #39863339275 (commit final da PR #1286) e #39863403369 no push pós-merge.
- Smoke visual pós-merge: `/` abriu a Vitrine rápida; após o carregamento mostrou cinco tamanhos de cesta, quatro ofertas e carrinho vazio. `/vitrine/admin/` abriu o Admin existente; a Central e a área Produtos foram acessíveis. A lista Produtos permaneceu em carregamento até uma busca explícita somente de leitura; depois exibiu cinco linhas e “Ver mais 5”. Nos logs de `admin-products-live-v1` v184 (2026-10-22 22:10Z–22:15Z) houve 3 POST 200, 2 GET 200 e 2 OPTIONS 204; GET teve média 3.747 ms e máximo 4.463 ms, POST média 1.447 ms e máximo 2.283 ms. Isso confirma um atraso de leitura, sem erro HTTP observado nessa janela; não foi gravado dado. Sem alterações de UI/runtime, não houve publicação do site/Admin. Rotas mantidas em `/` e `/vitrine/admin/`.
- Rollback: reverter o commit/PR deste checkpoint restaura apenas documentação, sem efeito de runtime ou banco. Nenhum rollback de Supabase é necessário.

### Próxima tarefa exata

Adicionar ao dispatcher de `admin-service-intelligence-v1` telemetria de resultado por ação de uma allowlist fixa (ação, status HTTP e classe de erro), sem registrar corpo, IDs, IP, headers brutos, dados de clientes ou detalhes retornados por provedores. Criar teste de contrato que prove a allowlist e a ausência de payload/PII; usar a telemetria para isolar as 78 respostas 502 antes de mudar comportamento. Aplicar correção funcional somente quando a causa for reproduzida em teste. A publicação continua bloqueada até o proprietário renovar o secret inválido `SUPABASE_ACCESS_TOKEN` (run #39848977831); não disparar deploy enquanto a credencial não for validada.

### Checkpoint pós-integração — 2026-10-22 (PR #1284)

- Main `d9af3d38bb197507f07d8773d74668a95eeef351` contém a PR #1284 (merge squash); commits da branch: implementação `3c3f022a51d551de8305e341e26a0889f4743d37`, checkpoint `c2511569ddab3c3839a39b5b601589f6cf52aff6`.
- Arquivos: workflow `.github/workflows/basket-lot-helper-grant-ci.yml`, teste `scripts/test-basket-lot-helper-grant.mjs`, renomeação da migration de `20261022205411_...` para `20261022205909_basket_lot_helper_direct_execute_revoke.sql`, e este roadmap/HANDOFF.
- CI de contrato #39854085809 passou. A #1284 não reaplicou a migration nem alterou o banco; ledger e ACL foram consultados após o merge e permaneceram iguais. O workflow Basket kit #39854086139 estava em andamento na instalação Chromium, sem alterações relacionadas a Cestas nesta PR.
- No canônico `ssbesxgaijknwsjbsbcz`, migration version `20261022205909`; helper sem EXECUTE para authenticated/anon/PUBLIC, EXECUTE preservado para postgres/service_role. Advisors: 42 SECURITY DEFINER para authenticated, search_path mutável 0, 228 RLS INFO e 1 leaked-password WARN.
- Sem runtime/frontend/Edge Function alterado e sem publicação de UI. Acesso de navegador não permitiu smoke interativo nesta rodada. Rotas mantidas em `/` e `/vitrine/admin/`; funções `admin1` ativas continuam nos respectivos projetos, sem migração.
- Rollback da fonte: revert da #1284; rollback do ACL aplicado pela #1283: GRANT exato ao helper, documentado no HANDOFF.

### Próxima tarefa de código

Comparar somente leitura a versão/hash publicada de `admin-service-intelligence-v1` no canônico com main e os arquivos versionados de compras/XML; registrar a divergência concreta antes de qualquer ação. Para qualquer deploy, o teste e preflight específicos vêm primeiro; o secret `SUPABASE_ACCESS_TOKEN` está inválido conforme #39848977831 e precisa ser renovado pelo proprietário. Não disparar deploy enquanto isso não estiver resolvido. Observar somente o cron EAN natural e aguardar sessão fisicamente verificada.

### Checkpoint de execução — 2026-10-22 (R11: helper de lotes e ledger Supabase)

- Main foi revalidada em `a09f26a60ef774465f7872db3574613f799ad963`; #1269 e #1283 estão integradas. A #1283 removeu somente EXECUTE direto por `authenticated` do helper `public.basket_lot_admin_allowed_v1()`; os dois RPCs protegidos de substituição continuam disponíveis. O projeto canônico `ssbesxgaijknwsjbsbcz` confirmou: chamada direta negada, administrador permitido na RPC e não-admin negado. O ACL persistido deixa EXECUTE a postgres/service_role; não a authenticated/anon/PUBLIC.
- Advisor de funções SECURITY DEFINER executáveis por authenticated reduziu 43→42; search_path mutável continua 0. Permanecem 228 avisos INFO de RLS sem policy e 1 WARN de proteção de senha. Nenhuma policy ampla foi criada.
- A migration aplicada aparece no ledger como versão `20261022205909`, nome `20261022205411_basket_lot_helper_direct_execute_revoke`. A #1284 (branch `agent/basket-lot-ledger-align-20261022`, implementação `3c3f022a51d551de8305e341e26a0889f4743d37`) alinha somente o prefixo do arquivo e os caminhos do teste/workflow; SQL byte a byte preservado, sem reaplicar no banco. CI dedicado #39854085809 passou no commit de código. Sem alteração de runtime/Admin; build check não aplicável e smoke interativo não declarado. Rollback do banco permanece o GRANT exato documentado no HANDOFF.
- Projeto canônico permanece ACTIVE_HEALTHY (sa-east-1, PostgreSQL 17.6.1.166); a branch dev `da6-qa-20261009` está MIGRATIONS_FAILED. `admin1-products-read-v1` continua ACTIVE v4 em ssbesxgaijknwsjbsbcz e `admin1-legacy-catalog-read-v1` ACTIVE v2 no projeto separado `xaoeldjuxzsdsblimzxo`; sem desativar ou migrar essas funções. Admin continua em `/vitrine/admin/`.

### Próxima tarefa de código

Comparar somente leitura a versão/hash publicada de `admin-service-intelligence-v1` no projeto canônico com main e os arquivos versionados de compras/XML; registrar primeiro o drift funcional concreto. Caso exija deploy, preparar teste e preflight próprios. A workflow só permite publicação manual em main e o secret `SUPABASE_ACCESS_TOKEN` está inválido conforme o run #39848977831; não fazer deploy até o proprietário renovar o secret. Em paralelo, acompanhar somente os ciclos naturais do cron EAN e aguardar sessão fisicamente verificada.

### Checkpoint de execução — 2026-10-22 (R10: auth do cron EAN e guarda de deploy)

- Main avançou de b68ebc2539878f031fdcbf5cf5db8683db9255fa para a307e4eadfe19e02fc212d25a344c484749f337b após #1279. #1278 corrigiu a autenticação do cron EAN: admin-products-live-v1 v183 estava com verify_jwt=true contra o contrato versionado false; como o cron usa header interno sem JWT, o gateway retornava 401 antes do handler. A v184 está ACTIVE, verify_jwt=false, hash d087c872ed23fa03dc2c3c784255b2bada1129de62b07db6f558c8ab7fd6291e no projeto canônico ssbesxgaijknwsjbsbcz.
- Logs naturais mostram 401 às 20:28:00.202Z (v183) e 200 às 20:30:02.678Z, 20:32:01.980Z e 20:34:02.289Z (v184). A auditoria SQL entre 20:28Z e 20:35Z encontrou 0 sessões EAN verificadas e 0 auditorias target_key=verified; nenhum efeito Bling ocorreu. Não houve invocação manual. Flags live foram preservadas.
- #1279 (merge a307e4eadfe19e02fc212d25a344c484749f337b) restringe .github/workflows/xml-r31-supabase-deploy-once.yml a workflow_dispatch em main, remove --debug e testa o gate. O run #39848977831 disparou por pull_request e falhou antes de deploy com 401 Invalid access token; o secret SUPABASE_ACCESS_TOKEN não foi exibido nem alterado. Próxima execução manual depende de atualizar essa credencial.
- Testes/CI: node scripts/test-xml-r31-deploy-workflow-guard.mjs, parsing YAML e diff check passaram; CI do guarda #39850146584/#39850198538 passou. O teste OPS2 #39848425463 e Admin Products #39848977723 passaram. Pages no commit a307 #39850185015 passou.
- Smoke sem escrita: site / abriu a vitrine (5 cestas, 4 ofertas); Admin /vitrine/admin/ carregou Central e as 19 áreas. Nenhum pedido, checkout, mensagem ou operação fiscal/financeira/estoque foi criado.
- Sem migrations, DDL, correção de dados, RLS, grants ou flags Supabase nesta rodada. A única mudança canônica foi implantação de admin-products-live-v1 v184. Rollback da função é reimplantar a fonte v183 com JWT obrigatório (reintroduz o 401 do cron); sem rollback de DB. A workflow de deploy pode ser revertida pela #1279, o que reabre risco de tentativa de publicação em PR.
- O checkpoint histórico que atribuía o 401 à leitura Produtos está corrigido: o 401 era exclusivamente do cron ops2_recover_ean_verified.

### Decisão de arquitetura

Esta reforma é do sistema já usado pela Dona Antônia. Não criar outro site, outro Admin, outro app, outro banco ou um segundo fluxo operacional. O site público continua na raiz do domínio. O Admin atual em /vitrine/admin/ é a única aplicação administrativa e continuará sendo ajustado nesse caminho. A migração para /admin/ está fora do escopo atual; /admin/ pode ser reconsiderado depois, se houver necessidade. O catálogo em /catalogo-admin/ continua sendo somente uma prévia pública de leitura, não um segundo Admin.

Fonte canônica: repositório osvaldosereia/SUCEDOAN12 e Supabase ssbesxgaijknwsjbsbcz. O projeto Supabase antigo não deve voltar a receber chamadas. Não remover caminhos, tabelas, funções, dados ou integrações até provar que não têm uso. Manter pedidos e histórico, catálogo, estoque Bling, fiscal, financeiro, WhatsApp e regras operacionais.

### Baseline verificado em 2026-10-22

- No snapshot inicial, main estava em 24719f9c57b2d362b1e7c5b197dc57fc66a6b8f5; revalidada em 9ec95df6b55e24f3964c22d4b2064d3163519de4 após a PR #1269. A árvore principal já não contém os diretórios experimentais /site e /admin1.
- No site ao vivo, / abre a vitrine pública; /admin/ retorna para a raiz e não abre o painel; /vitrine/admin/ abre o Admin em uso.
- A troca de produto em uma cesta pública foi testada: escolher Arroz Tio Bonini atualizou o item e o total de R$ 419,30 para R$ 425,70. O teste parou antes de adicionar a cesta ou enviar pedido.
- A página pública raiz concentra cerca de 200 KB de HTML, com aproximadamente 138 KB de JavaScript embutido.
- O Admin atual usa vitrine/admin/admin-runtime.js, com cerca de 642 KB, mais nove fragmentos de texto ordenados em runtime-src. Eles recompõem uma única IIFE e ainda não são módulos independentes. O CSS principal tem cerca de 126 KB.
- O diretório tests/ tem três arquivos, além de dezenas de scripts/test-* na pasta scripts/. Há 66 workflows de GitHub; falta mapear quais executam os gates relevantes para cada área. Cada lote deve rodar o build e os testes direcionados correspondentes.
- No projeto Supabase canônico há 142 Edge Functions ativas. Os advisors de segurança registravam 3 avisos de search_path mutável, 43 funções SECURITY DEFINER executáveis por authenticated, 1 aviso de proteção contra senhas vazadas e 228 tabelas com RLS sem policy. O último grupo inclui tabelas privadas e políticas de negação padrão; classificar tabela por tabela antes de mudar. Avisos de performance: 77 FKs sem índice e 97 índices sem uso, a revisar com consultas e carga reais. A admin1-products-read-v1 (v3) está ativa e teve chamadas reais nas últimas 24 h (56 GET products, 42 categories, 13 product, 2 matches e 1 health); origem e consumidor ainda não aparecem nos logs. O wrapper admin1-legacy-catalog-read-v1 existe no repositório, mas não constava como deployment ativo nesta revalidação. Manter a função ativa e identificar o consumidor antes de qualquer mudança.
- Este snapshot é uma fotografia, não um valor permanente. Atualizar a baseline antes de cada onda; o roadmap operacional existente e parte do handoff têm datas de setembro e não substituem a leitura do runtime atual.

### Checkpoint de execução — 2026-10-22

- Main no início do lote de runtime em `383fc5062483dacb61541ec2624b526633ee4d4a`;
- A documentação do checkpoint anterior foi integrada pela PR #1276 em `cb78f7eef4bd075fb3c7a01f69d7dc1245299c97`; #1269 já está mergeada em `9ec95df6b55e24f3964c22d4b2064d3163519de4`, #1273 em `52c7ca0a75a0e7bb55f3cd4d99b7cf969bcb6627` e #1275 em `383fc5062483dacb61541ec2624b526633ee4d4a`. Main está sem proteção/checks obrigatórios configurados.
- #1275 adicionou diagnóstico categorizado limitado ao GET válido de `admin1-products-read-v1` e teste de contrato. Arquivos: `.github/workflows/admin1-products-read-context-ci.yml`, `scripts/test-admin1-consumer-context.mjs`, `supabase/functions/admin1-products-read-v1/consumer-context.mjs`, `supabase/functions/admin1-products-read-v1/index.ts`. Sem parâmetros ou identificadores de busca, IP, Referer completo ou User-Agent bruto no logger customizado.
- Projeto canônico `ssbesxgaijknwsjbsbcz` está ACTIVE_HEALTHY, região sa-east-1, PostgreSQL 17.6.1.166. A função canônica `admin1-products-read-v1` está ACTIVE v4, `verify_jwt=false`, hash `b61be132530350da259e006674038c458c0d2aac3d5142c70e6ff2eeb8f58ff9`. O GET controlado `?action=health` retornou 200 e logou `health / unknown / browser / fetchSite=none`; isso valida execução do logger, não comprova uso pelo frontend.
- Foi revalidada `admin1-legacy-catalog-read-v1` ACTIVE v2 em outro projeto, `xaoeldjuxzsdsblimzxo`, `verify_jwt=false`; o código publicado encaminha ao leitor canônico. Não desligar nem migrar até mapear chamadas naturais e dependências.
- Testes direcionados da #1275 passaram (teste de contexto, sintaxe JS e TS); `python3 scripts/build-vitrine-admin-runtime.py --check` passou (9 fragmentos, 640.167 caracteres). Os quatro testes ajustados pela #1273 também passaram. Na main, Pages deploys `39845023999` e `39846355173` concluíram success, assim como Admin1 reader run `39845026219`. No snapshot geral consultado, Basket kit editor seguia in progress e o workflow independente XML R31 one-shot falhou 401 por token inválido.
- Smoke do site publicado: `/` abriu a vitrine com cinco cestas/ofertas e carrinho vazio; `/vitrine/admin/` abriu. Na primeira leitura, Produtos ficou em “Carregando…” e houve POST 401 em `admin-products-live-v1` v183 (20:04:02Z); em rechecagem posterior, a lista carregou cinco produtos com mais cinco disponíveis. Tratar como intermitência/recuperação a investigar; não há causa isolada. Nenhuma mutação de catálogo/pedido/estoque, mensagem, emissão fiscal ou pagamento ocorreu.
- Supabase: foi aplicado somente deploy v4 do leitor canônico no projeto `ssbesxgaijknwsjbsbcz`. Sem migration/schema/dados/policies/grants/configuração; sem advisors de banco, pois não houve alteração desses itens. O wrapper legado permaneceu intacto. Rollback da função é redeploy da fonte v3 anterior; rollback do código é revert dos commits #1275/#1273.
- Rotas preservadas: site `/`; Admin `/vitrine/admin/`. Sem `/admin/`, aplicação paralela, pedido/check-out sintético ou efeitos em Bling, WhatsApp, fiscal ou financeiro.

### Rodada anterior concluída — contratos do Admin e jornada pública — 2026-10-22 (histórico)

- A PR #1269 está merged; main é `9ec95df6b55e24f3964c22d4b2064d3163519de4`. PR #1270 continua aberta, com 19 workflows (9 success, 10 failure); o gate direcionado `products-session` passa. As dez falhas foram reproduzidas no SHA-base `24719f9c57b2d362b1e7c5b197dc57fc66a6b8f5` e no HEAD de #1270 antes dos ajustes, sem diferença atribuível ao código de Produtos.
- PR #1271 (`agent/admin-runtime-contract-tests`, revisão de código `4544862784812ce91b074c829e059b5255ba98ee`) atualiza somente contratos de teste do Admin modular e dos pedidos. O helper `scripts/helpers/admin-ui-source.mjs` compõe HTML, runtime e folhas de estilo realmente servidos; 15 testes foram ajustados, incluindo harness de sintaxe ESM e testes da vitrine pública do pedido. Commits desta atualização: `65938f4`, `15ec7d2` e `4544862`. Nenhum runtime ou comportamento operacional mudou.
- Passaram localmente 24/24 testes do lote, o build check do runtime, `node --check vitrine/admin/admin-runtime.js` e `git diff --check`. Na última consulta da revisão de código `4544862`, cinco de sete workflows estavam concluídos com sucesso; o job ANA já havia passado e o workflow de Cestas ainda instalava Chromium. Nenhum dos sete workflows reportou falha; consultar o estado final antes da integração. Smoke de leitura confirmou `/` com cinco cestas e carrinho vazio e `/vitrine/admin/` na Central com 19 áreas. Nenhuma publicação ocorreu.
- Supabase canônico `ssbesxgaijknwsjbsbcz`: ACTIVE_HEALTHY, PostgreSQL 17.6.1.166, 1.244 migrations (última `20261022114704`), 142 funções. Advisors atuais seguem com 228 RLS sem policy, 3 search_path mutáveis, 43 SECURITY DEFINER executáveis por authenticated, 1 aviso de proteção de senha; performance 77 FKs sem índice, 97 índices sem uso e 1 aviso de conexões. Não houve migration, deploy de função, alteração de configuração ou dados. O descompasso de migration (1.244 no banco / 180 arquivos, 31 timestamps comuns) continua bloqueando DDL.
- Rollback: reverter ou fechar #1271; só contratos de teste/helper foram alterados. Sem efeito no runtime ou banco.

Próxima ação exata: corrigir a jornada pública existente em `pedido/index.html` para usar o `channel_origin` que `order-public-view-v1` já retorna ao montar o link de WhatsApp para os canais 0975/1018; cobrir os dois casos sem enviar mensagem. No mesmo domínio, ajustar `scripts/test-admin-pending-data-baskets-public-v1.mjs` e `scripts/test-checkout-simple-ux.mjs` para validar `/` como entrada pública e `/vitrine/` como redirecionamento legado, em vez de exigir cópias HTML. Preservar `/` e `/vitrine/admin/`; executar testes de link curto/cliente e smoke de leitura. Não aplicar migrations no canônico até reconciliar o ledger.

### Rodada atual — ofertas da home e primeiro carregamento de imagem — 2026-10-22

- Baseline revalidada: `main` `b75035006a064c5939d7e1dbb4fe8c8ad5307c88`; PRs #1269 e #1270 merged. #1271 aberta, mergeable, HEAD de código `89d1e46f368ea2811fc9ff5cbe9e206f85b533c0`.
- Corrigido o carregamento de ofertas na home existente em `/`: seção e mount entram no shell inicial e em navegação nova, observer lazy é ativado ao hidratar, e ofertas carregadas/cacheadas são preservadas em atualizações do catálogo. O índice global impede múltiplas imagens de cesta de receberem prioridade alta.
- Arquivos nesta onda: `index.html`, `scripts/test-storefront-mobile-r3.mjs`, `r4.mjs` e `r5.mjs`. R1–R5 passaram no snapshot da PR; `python3 scripts/build-vitrine-admin-runtime.py --check` passou (9 fragmentos, 638.778 caracteres); os 13 workflows do commit `89d1e46` passaram.
- Smoke de leitura antes do merge: `/` exibiu cinco cestas/carrinho vazio; `/vitrine/admin/` abriu a Central com 19 áreas. Não houve pedido ou mensagem. O novo commit ainda não estava publicado.
- Supabase `ssbesxgaijknwsjbsbcz`: `ACTIVE_HEALTHY`, Postgres `17.6.1.166`, 1.244 migrations, última `20261022114704`, 142 funções; `admin1-products-read-v1` ativa v3. Nenhuma mudança de DB/função/config/dados nesta onda. Ledger divergente (180 SQLs no repo; 31 versões compartilhadas); sem DDL até reconciliar.
- Rollback: reverter o merge de #1271; não há rollback de Supabase.
- Próximo gate desta onda: integrar #1271 pelo fluxo normal após os checks da revisão documental final e confirmar a implantação por smoke de leitura no mesmo `/` e `/vitrine/admin/`.

### Ordem de execução

#### Onda 0 — ajustes urgentes e rede de segurança

1. [Concluída parcialmente em 2026-10-22] Mapear a entrada /vitrine/admin/ e as 19 áreas/entradas observadas; o primeiro lote de baixo risco foi escolhido e codificado na PR #1270. A integração segue bloqueada pelo CI amplo vermelho (10/19 checks), embora o gate dedicado de Produtos esteja verde. Completar a matriz de dependências e corrigir os contratos falhos após confirmar quais já falham em main. Não migrar a URL.
2. Registrar um conjunto curto de regressão da vitrine: carregamento inicial, preços de cesta, troca de opção, recálculo do total e estado sem pedido submetido. Critério: a correção recente de variação permanece coberta e não há chamada de criação de pedido no teste.
3. Reconciliar a árvore publicada, o commit de main e as versões das funções críticas no Supabase, incluindo Admin1. Critério: cada função ativa do fluxo principal tem fonte versionada e consumidor identificado; divergências entram em uma lista de correção, sem deploy cego.
4. Classificar os avisos de segurança do Supabase começando por funções SECURITY DEFINER, search_path e autenticação. Corrigir somente permissões comprovadamente excessivas, com teste de acesso permitido e negado. Não adicionar policies abertas para silenciar o advisor.

#### Onda 1 — organizar o Admin existente

1. Mapear entrada, navegação, módulos, folhas de estilo, chamadas de API, estado compartilhado e pontos de inicialização.
2. Manter o runtime servido estável enquanto os fragmentos são organizados. A cada lote: editar função ou grupo pequeno, regenerar o runtime e exigir python3 scripts/build-vitrine-admin-runtime.py --check.
3. Extrair funções puras e dependências explícitas antes de separar módulos por domínio. Preservar ordem e nomes de eventos, funções globais, contratos Supabase e regras de negócio até que testes as protejam.
4. Depois da paridade estrutural, organizar CSS por domínio sem alterar precedência visual. Testar navegação, modal e viewport correspondentes.
5. Critério: o Admin atual fica mais fácil de localizar e alterar, sem mudar o comportamento operacional do lote.

#### Onda 2 — organizar o site público existente

1. Manter index.html como entrada de /. Inventariar os blocos de HTML, CSS e JavaScript e suas dependências.
2. Extrair um bloco por lote para arquivos existentes ou novos dentro do mesmo projeto; não criar uma segunda pasta/site para servir a vitrine.
3. Priorizar cesta, busca/categorias, produto, carrinho e checkout. Preservar preço, estoque, substituição, mínimo de pedido, região de entrega e integração com o Supabase canônico.
4. Critério: a mesma URL pública carrega os mesmos fluxos; os testes da cesta e uma verificação visual simples passam depois de cada lote.

#### Onda 3 — contratos do backend e módulos por domínio

Trabalhar um domínio por vez: catálogo/produtos; cestas; clientes; pedidos; estoque; expedição/entregas; compras/XML; Bling; fiscal/financeiro; WhatsApp/atendimento. Documentar entrada, saída, autenticação, efeitos no banco e retries de cada Edge Function chamada pelo domínio. Extrair código compartilhado somente quando as responsabilidades e permissões forem claras. Evitar juntar ou renomear APIs durante uma extração estrutural.

Critério por domínio: contrato registrado, teste do caminho feliz, teste de falha/retry quando houver efeito externo, fonte no GitHub alinhada com a função publicada e rollback conhecido.

#### Onda 4 — dados, segurança e desempenho

1. Auditar policies e grants com os papéis anon, authenticated e service_role; testar acesso negativo e positivo. RLS habilitado sem policy pode ser a negação correta.
2. Revisar funções SECURITY DEFINER e fixar search_path explicitamente quando aplicável; confirmar proprietário, grants e chamadas antes de alterar.
3. Medir consultas lentas e planos antes de adicionar ou remover índices. Não excluir índices somente porque o advisor marca “unused”.
4. Fazer mudanças de schema aditivas, migradas e reversíveis. Preservar histórico e evitar renomear/apagar dados como parte de uma extração de frontend.
5. Critério: o advisor é acompanhado por achados classificados e cada correção tem teste de segurança e de desempenho.

#### Onda 5 — interface, acessibilidade e limpeza final

Após estabilizar a estrutura e os contratos, corrigir navegação móvel, estados de carregamento/erro, acessibilidade, tempo de carregamento e consistência visual no próprio site e Admin. Remover código, funções, tabelas, crons ou rotas antigas somente depois de busca de referências no repositório, confirmação de ausência de uso no runtime/logs e plano de rollback.

### Regra objetiva para cada ajuste

Um lote contém uma mudança pequena e um domínio. Antes: identificar arquivo, comportamento atual e risco. Durante: preservar contratos e limitar o diff. Depois: executar somente as verificações que cobrem a mudança — sintaxe/build, teste direcionado e smoke de leitura quando necessário. Mudanças com efeitos em pedido, estoque, financeiro, fiscal ou Bling exigem teste em modo seguro e evidência antes da ativação. Não fazer compra, checkout real ou alteração operacional para testar.

Registrar em cada lote: arquivos, commit/PR, comando de teste e resultado, verificação no site quando pertinente, eventual alteração Supabase e rollback. Se falhar, corrigir o lote atual antes de começar outro.

### Execução autônoma horária

- A cada hora, retomar do último checkpoint verificável no repositório, nas PRs e neste roadmap.
- Buscar o máximo de progresso **validado** por rodada. Podem ser concluídos vários ajustes pequenos quando pertencem ao mesmo domínio, compartilham testes e têm rollback claro. Não misturar alterações independentes só para aumentar o volume.
- Trabalhar no código em uso: vitrine/Admin em `/vitrine/admin/` e site público em `/`. Não criar Admin/site paralelo e não migrar a rota para `/admin/`.
- Priorizar a próxima pendência das ondas acima; escolher uma área coerente por rodada. Se um teste falhar, corrigir e repetir os testes do mesmo lote antes de mudar de domínio.
- Versionar em branch `agent/*`, fazer commits pequenos, manter/abrir PR e registrar arquivos, SHAs, testes, CI, smoke e rollback. Integrar/publicar apenas pelo fluxo já aprovado do repositório, depois dos gates correspondentes.
- Alterar o Supabase canônico quando a correção confirmar necessidade: versionar schema/funções em migrations, conferir alvo/impacto/dados/idempotência/rollback, testar em branch disponível quando viável, aplicar só a mudança necessária, consultar o resultado e executar os testes/advisors pertinentes. Corrigir dados apenas em linhas identificadas e preservar pedidos/histórico. Não enviar mensagens, emitir NF-e, criar checkout/pedido em produção, movimentar dinheiro ou estoque como smoke; prepare o código e registre o gate quando houver efeito externo.
- Ao final de cada rodada, atualizar HANDOFF com resultado comprovado, o que ficou pendente e a próxima tarefa. Desativar a recorrência quando o plano técnico estiver concluído ou restarem somente bloqueios humanos, registrando a lista final.

### Próxima tarefa de código

Fazer comparação somente leitura do deploy ativo admin-service-intelligence-v1 no projeto canônico com main/arquivos XML; listar versão/hash e drift concreto. Se houver divergência que exija implantação, criar teste e preflight específicos antes de executar. A workflow de deploy foi restringida a manual em main e exige atualizar o secret SUPABASE_ACCESS_TOKEN, inválido segundo o run #39848977831; não disparar enquanto isso não for resolvido. Em paralelo, acompanhar apenas o cron EAN natural até existir sessão fisicamente verificada; sem POST manual, pedido sintético ou alteração de status.



## Objetivo da programação
Concluir a migração para o desenho Operations 2.0 sem interromper o site público, usando o Bling como ERP/fonte oficial dos domínios homologados e mantendo o Vitrine/Admin como camada operacional simples.

## Estado real de partida
Já concluído ou homologado:
- fundação Control Tower: ledger, attention e approvals;
- motor canônico multicanal;
- site e Nova Venda WhatsApp usando o motor canônico;
- receiver/normalização/ponte de conversa PapoAI;
- Situações/Módulos/Transições do Bling;
- reserva oficial de estoque via situação Aprovado / Separar;
- webhook real Bling com assinatura e idempotência;
- mirror de saldo virtual por webhook;
- read model de estoque vendável;
- proteção de aprovação contra saldo virtual insuficiente;
- lançamento e estorno físico de estoque no Bling homologados por canário;
- picking 85 mm e tablet de Separação;
- Estoque Mobile auditável;
- pagamento efetivo/split e fluxo de não entrega/retorno implementados em modo de homologação.

Gates ainda deliberadamente fechados:
- `ops2_direct_order_state_enabled=false`;
- `stock_authority=legacy_shadow`;
- cutover de estoque ainda não executado;
- impressão física silenciosa ainda não homologada;
- pagamento real -> Bling/financeiro ainda bloqueado;
- fiscal definitivo ainda depende de homologação operacional/contábil.

## BLOCO A — Fechar pedido + estoque Bling
Prioridade máxima. Não iniciar limpeza estrutural antes deste bloco.

### A1 — Atualizar documentação e baseline
- registrar últimos gates já homologados;
- registrar versões atuais das Edge Functions;
- registrar flags/runtime;
- registrar último commit conhecido;
- listar os 4 produtos ativos ainda sem vínculo exato Bling;
- preservar evidência das divergências legado x saldo virtual.

Critério de saída:
- documentação representa exatamente produção;
- existe rollback explícito antes de qualquer cutover.

### A2 — Resolver cobertura do catálogo
- revisar os 4 produtos sem vínculo exato;
- vincular somente por identidade determinística (GTIN/SKU/ID confirmado);
- nunca criar vínculo aproximado automático;
- garantir cobertura do estoque vendável para todos os produtos publicáveis.

Critério de saída:
- nenhum produto publicável sem fonte de saldo segura, ou produto explicitamente bloqueado da venda.

### A3 — Cutover de leitura de estoque
- fazer site/checkout/readiness consumirem o read model de saldo vendável Bling;
- preservar shadow comparativo temporariamente;
- impedir que divergência de `products.stock` volte a autorizar venda;
- manter rollback simples para `legacy_shadow`.

Critério de saída:
- catálogo e checkout usam a mesma regra de saldo;
- produto sem saldo virtual suficiente não pode ser comprado;
- nenhum estoque negativo criado.

### A4 — Remover dupla reserva/dupla baixa
- desativar o efeito operacional legado que reserva/consome `products.stock` no novo fluxo;
- manter dados legados apenas como espelho/auditoria durante a transição;
- reserva oficial passa a ser a reserva do Bling;
- baixa física oficial passa a ocorrer uma única vez no ponto operacional homologado.

Critério de saída:
- confirmar pedido não produz dupla redução;
- cancelar/rollback libera exatamente uma reserva;
- retry é idempotente.

### A5 — Early-order Bling
- habilitar primeiro em canário;
- pedido novo deve existir no Bling em Aguardando confirmação;
- confirmação deve levar a Aprovado / Separar;
- verificar total, itens, cliente, chave externa e situação;
- preservar reconciliação e anti-duplicidade.

Critério de saída:
- 1 pedido canário ponta a ponta sem duplicação;
- rollback comprovado;
- depois pequeno lote controlado.

### A6 — Canário completo de estoque
Fluxo:
pedido -> Aguardando confirmação -> confirmação -> reserva virtual -> separação -> Verificado -> saída -> lançamento físico -> entrega/retorno conforme caso.

Validar:
- saldo virtual;
- saldo físico;
- webhooks;
- mirror;
- read model;
- idempotência;
- atenção/exceções;
- rollback.

Somente após PASS:
- `ops2_direct_order_state_enabled=true` de forma controlada;
- mudar `stock_authority` somente com evidência de cutover;
- registrar timestamp e commit do cutover.

## BLOCO B — Separação e conferência
### B1 — Tablet Separação
- validar em equipamento real;
- leitor EAN;
- estados Confirmado/Separando/Separado;
- reimpressão;
- correções/exceções.

### B2 — Impressão 85 mm
- POC de impressora física;
- foto, EAN, quantidade e localização;
- fila idempotente;
- distinguir queued/presented/printed;
- retry seguro.

### B3 — Checkout/conferência Bling
- POC com Bling Checkout;
- leitura EAN;
- conferência parcial/completa;
- mapear conclusão para Verificado;
- não reconstruir no Admin o que o Checkout resolver melhor.

## BLOCO C — Estoque operacional
### C1 — Balanço
- manter UX mobile;
- substituir efeito local definitivo por reconciliação/movimento oficial;
- diferença nunca deve ser escondida.

### C2 — Geral + Quarentena
- homologar depósitos;
- avaria/vencido/perda -> fluxo fiscal/estoque correto;
- retorno -> Quarentena até inspeção;
- sobra sem origem -> revisão, nunca entrada automática.

### C3 — Lotes/validade
- Bling como fonte de lote/saldo/validade;
- FEFO quando aplicável;
- ofertas limitadas à quantidade elegível;
- lote vencido não desativa produto inteiro se houver outro lote vendável.

## BLOCO D — Rota, entrega e pagamento
### D1 — Rotas
- canário real de `ops_delivery_runs`/`ops_delivery_stops`;
- ordenação e edição antes da saída;
- impedir pedido duplicado em rota;
- futura entrada de pins/localizadores WhatsApp.

### D2 — Entregador
- validar tablet/celular;
- pedido, cliente, telefone, endereço, Maps, observações;
- entregue/não entregue;
- retorno físico;
- reentrega.

### D3 — Pagamento efetivo
- validar PIX, dinheiro, crédito, alimentação/refeição;
- split de duas formas na UI;
- total deve fechar exatamente;
- sincronizar recebimento real ao Bling somente após homologação;
- nunca tratar forma prevista no pedido como pagamento efetivo.

## BLOCO E — Fiscal e financeiro
- fechar regra com contador para entrega domiciliar;
- NF-e/DANFE no ponto correto;
- retorno de mercadoria e recusa;
- perdas/avarias/vencimentos;
- contas a receber;
- conciliação do pagamento efetivo;
- refund/reembolso;
- nenhum fluxo fiscal destrutivo automático sem gate específico.

## BLOCO F — Compras/XML
- preservar rotina atual enquanto substituto não estiver homologado;
- priorizar recursos nativos Bling/SEFAZ/Check-in;
- XML CPF sem financeiro empresarial;
- conversão caixa -> unidade determinística;
- fornecedores/custos;
- devolução a fornecedor;
- remover customização apenas depois de equivalência comprovada.

## BLOCO G — PapoAI multicanal
- mapear somente eventos estruturados confiáveis;
- botão/Flow -> draft versionado;
- texto livre não cria pedido automaticamente;
- confirmação converge para motor canônico;
- pós-venda e recompra entram depois do fluxo operacional principal estável.

## BLOCO H — Control Tower
- completar cards e fila Precisa de você;
- approvals reais;
- timeline;
- saúde das integrações;
- estoque crítico;
- pedidos parados;
- exceções fiscais/financeiras;
- copiloto sob demanda, sem IA decidindo regra crítica.

## BLOCO I — Segurança e perfis
- Owner;
- Supervisor;
- Operador;
- Entregador;
- automações/service role;
- eliminar dependência de perfil/PIN compartilhado;
- princípio do menor privilégio.

## BLOCO J — Limpeza final
Executar somente quando substitutos estiverem homologados:
- Edge Functions históricas;
- tabelas sem uso;
- triggers legados;
- crons inúteis;
- rotas antigas;
- código morto;
- documentação histórica redundante.

Nunca apagar apenas porque parece antigo. Antes da remoção:
1. procurar referências no código;
2. conferir runtime;
3. conferir banco;
4. confirmar substituto;
5. registrar rollback/backup quando aplicável.

# REGRA OBRIGATÓRIA DE CONTINUIDADE E REGISTRO

Esta regra é parte do projeto e deve ser obedecida em TODA rodada de programação, inclusive quando o trabalho for feito em outro chat.

## Antes de programar
1. Ler `HANDOFF.md`.
2. Ler este `IMPLEMENTATION-ROADMAP.md`.
3. Conferir o estado real no GitHub e Supabase.
4. Conferir commits posteriores à última anotação.
5. Não assumir que o histórico do chat é a fonte de verdade.
6. Identificar o gate exato que está sendo trabalhado e o rollback.

## Durante a rodada
Registrar continuamente fatos importantes; não esperar o final se houver risco de perder contexto:
- arquivos alterados;
- migrations aplicadas;
- Edge Functions publicadas e versões;
- flags/runtime alterados;
- testes executados;
- IDs de canário quando necessários;
- resultados observados;
- erros encontrados;
- correções;
- decisões arquiteturais;
- pendências externas/humanas.

## Antes de encerrar qualquer rodada importante
É OBRIGATÓRIO atualizar `HANDOFF.md` e, quando afetado, este roadmap e/ou `HOMOLOGATION-STATUS.md`.

O checkpoint deve conter no mínimo:
- data/hora ou data da rodada;
- objetivo;
- o que foi realmente programado;
- o que foi realmente publicado/aplicado;
- commit(s);
- migrations;
- versões de funções;
- estado das flags;
- testes e evidências;
- PASS/FAIL de cada gate;
- problemas conhecidos;
- rollback disponível;
- o que NÃO foi feito;
- próximo passo exato;
- eventual ação manual necessária.

## Regra de segurança de retomada
Nenhuma rodada deve depender da memória de uma conversa do ChatGPT.

Se um chat travar, fechar ou for substituído, a retomada deve ser possível apenas com:
1. repositório;
2. Supabase/runtime;
3. `HANDOFF.md`;
4. `IMPLEMENTATION-ROADMAP.md`;
5. `HOMOLOGATION-STATUS.md`;
6. commits/logs.

## Regra de conclusão
Uma etapa NÃO está concluída apenas porque o código foi escrito.
Só marcar como concluída quando houver:
- código versionado;
- migration/deploy quando necessário;
- teste;
- evidência;
- rollback conhecido;
- documentação atualizada.

## Comando padrão de retomada
> Retome Dona Antônia Operations 2.0. Leia `docs/projects/dona-antonia-operations-2/HANDOFF.md`, `IMPLEMENTATION-ROADMAP.md` e `HOMOLOGATION-STATUS.md`. Confirme o estado real no GitHub e Supabase e compare os commits posteriores à última anotação. Continue exatamente do próximo gate registrado. Não confie apenas no histórico do chat e não faça limpeza antes de homologar o substituto.


## PLANO AUTÔNOMO DE FECHAMENTO — 12 RODADAS LONGAS — 2026-09-26

Regra desta sequência: R1 inicia imediatamente; R2–R12 avançam em cadência horária por agendamento/encadeamento automático. Bloqueios que exijam presença, decisão ou evidência física do proprietário não interrompem o trabalho seguro: devem ser acumulados nos documentos canônicos e consolidados em uma única lista operacional ao final da R12. Não usar Make. Não mutar pedidos legados. Não inventar evidência física/fiscal/financeira.

1. **R1 — baseline + invariantes Entregador/rota:** consolidar os gates já implementados de pagamento exato antes de delivered e sincronização pedido↔parada↔rota; revisar continuidade, documentação e lacunas seguras antes das próximas ondas.
2. **R2 — pagamento real/split → Bling em shadow:** formas, contas, recebimentos, idempotência, reconciliação, retry e anti-duplicidade; nenhum lançamento real não homologado.
3. **R3 — falha de entrega/retorno/reentrega/cancelamento:** retorno físico, inspeção, avaria/perda, reversões e proteção contra dupla restauração de estoque.
4. **R4 — fiscal operacional NF-e/DANFE:** gate de expedição, autorização SEFAZ, DANFE, erros/retry, vínculo pedido/NF, pagamento efetivo e representação de cesta/diferença; emissão automática continua OFF até homologação.
5. **R5 — estoque Bling/cutover readiness:** writers, triggers, read models, estoque físico/virtual, baixa/reversão idempotente, 14 blockers de recontagem e recuperação do SQL canônico/reprodutível; sem cutover global.
6. **R6 — lotes/validade/FEFO/ofertas:** saldo elegível por lote, faixas 10%/20%/40%, vencidos e integração vitrine/admin sem desativar produto com outro lote vendável.
7. **R7 — compras/XML/fornecedores/caixa→unidade:** rotina diária + manual, CPF sem financeiro, CNPJ financeiro apenas validado, conversões determinísticas, custos, idempotência e aproveitamento Bling/Check-in quando comprovado.
8. **R8 — PapoAI/WhatsApp operacional:** identidade, link personalizado, Flow, cliente, pedido, histórico e eventos estruturados; robustez/idempotência sem reintroduzir inteligência de atendimento no Admin.
9. **R9 — UX operacional das cinco superfícies:** Central, Pedidos/Nova Venda WhatsApp, Tablet Separação, Estoque Mobile e Entregador; mobile, acessibilidade, estados, mensagens e redução de cliques sem duplicar ERP.
10. **R10 — hardening técnico:** GitHub↔Supabase/runtime, RLS/advisors, segurança, performance, custo, Edge Functions, RPCs, triggers, jobs, flags, duplicações e reprodutibilidade.
11. **R11 — ensaio integrado amplo:** site→checkout→pedido→Bling→EAN→fiscal→estoque→expedição→rota→entregador→pagamento→entrega/retorno; corrigir lacunas seguras e regressões.
12. **R12 — auditoria final/readiness:** fechar correções seguras restantes, smoke tests/advisors, estado final e lista única ordenada de todas as ações humanas necessárias para a próxima fase de homologação/cutover.

### Gate pós-R12
Após a R12, pausar novas ondas de implementação que dependam de evidência humana. O proprietário executa a lista consolidada (contagens, equipamento físico, autorizações/canários/cutovers que realmente exijam presença). Só então uma nova sequência de rodadas deve ser planejada com base nas evidências obtidas.
