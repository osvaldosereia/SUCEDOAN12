# Dona Antônia Operations 2.0 — HANDOFF

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

## Acompanhamento R16 — observação inicial do endpoint — 2026-10-23 04:03 UTC

- Main revalidada em `1dbacf0856e66d0fd4873d22db09d8e307c8e9c8`; PR #1269 permanece integrada e os documentos estão na main. A PR #1315 que registrou o deploy v5 também está merged em `1dbacf0856e66d0fd4873d22db09d8e307c8e9c8`. Rotas preservadas: homepage `/` e Admin `/vitrine/admin/`.
- CI de push para `1dbacf0856e66d0fd4873d22db09d8e307c8e9c8`: 42/42 workflows concluídos com sucesso, sem pendências/falhas.
- O projeto canônico `ssbesxgaijknwsjbsbcz` segue ACTIVE_HEALTHY em sa-east-1, PostgreSQL 17.6.1.166. `admin1-products-read-v1` segue ACTIVE v5, `verify_jwt=false`, SHA `6a2c730ddbab268c0f95c4b08a9a3f443bbfa8bf8745584ed21dd2cbd8f7aa51`.
- Agregação de `function_edge_logs` entre 2026-10-23 03:20:07 e 04:03 UTC: uma chamada GET, HTTP 410, no endpoint retirado; corresponde ao smoke já registrado às 03:20:29.940 UTC. Não houve outra chamada ao endpoint nesse recorte. A telemetria allowlisted classificou `action=products`, `caller=browser`, `origin=none`, `page=unknown`, `fetchSite=none`; dois registros sem esses campos não foram interpretados como chamadas. Nenhum payload, query, IP, cabeçalho ou identificador foi consultado.
- No mesmo recorte curto, os logs agregados de `admin-products-live-v1` mostraram 11 POST 200, 2 GET 200 e 2 OPTIONS 204. O smoke visual somente leitura confirmou linhas de produtos no Admin existente; na homepage confirmou cinco tamanhos de cesta e, após rolar, quatro ofertas, com pedido vazio. Nenhum formulário de alteração, pedido, checkout, mensagem, NF-e, ação de estoque, Bling ou financeiro foi executado.
- Esta rodada não alterou código funcional, runtime, Edge Function, schema, dados, grants, policies ou configuração; não houve novo deploy Supabase/Pages nem rollback de dados. O check de build do runtime não foi necessário porque o runtime não mudou. Reverter o checkpoint documental significa reverter o commit desta PR; sem impacto no sistema.

### Próxima tarefa exata

Em ou após 2026-10-24 02:14:07 UTC, agregar os 24h completos do projeto separado `xaoeldjuxzsdsblimzxo` para `admin1-legacy-catalog-read-v1` v3, distinguindo o GET de smoke conhecido. Em ou após 2026-10-24 03:20:07 UTC, fechar as primeiras 24h de `admin1-products-read-v1` v5 no canônico, excluir da interpretação o GET de smoke das 03:20:29.940 UTC e atribuir somente chamadas adicionais pelos campos allowlisted. Manter ambas as respostas 410; não remover funções sem evidência de zero dependências/chamadas. R13 continua bloqueada pela renovação de `SUPABASE_ACCESS_TOKEN` pelo proprietário; não usar credencial alternativa.

## Conclusão R16 — aposentadoria do leitor Admin1 exposto — 2026-10-23 03:23 UTC

- Base revalidada: `main` em `acdc4d2118c833e0945f551f747a88aa85fec0bc`; PR #1269 está integrada e os documentos estão na main. As rotas permanecem na homepage `/` e Admin `/vitrine/admin/`.
- PR [#1314](https://github.com/osvaldosereia/SUCEDOAN12/pull/1314), branch `agent/retire-canonical-admin1-products-read-20261023`, foi integrada por squash no SHA acima. Commits da branch: `3fd58ac58a8c790de421ee3b48ce46a0876a331e` (handler, teste e CI) e `94ec6cf8197f33830621f7b1ae47ede3a52200ca` (guarda do contrato do runtime Admin). Arquivos: `.github/workflows/admin1-products-read-retirement-ci.yml`, `scripts/test-admin1-products-read-retirement.mjs`, `supabase/functions/admin1-products-read-v1/index.ts` e `supabase/functions/admin1-products-read-v1/retired-handler.mjs`.
- A função `admin1-products-read-v1` está ACTIVE v5 no projeto canônico `ssbesxgaijknwsjbsbcz` (ACTIVE_HEALTHY, sa-east-1, PostgreSQL 17.6.1.166), `verify_jwt=false`, SHA do pacote `6a2c730ddbab268c0f95c4b08a9a3f443bbfa8bf8745584ed21dd2cbd8f7aa51`, atualizada em `2026-10-23 03:20:07.529 UTC`. Os três arquivos implantados conferem com a main; a API do Supabase remove somente o newline terminal de `index.ts` e `retired-handler.mjs`.
- Verificação do endpoint real: em `2026-10-23 03:20:29.940 UTC`, `function_edge_logs` registrou GET, HTTP 410, caminho `/functions/v1/admin1-products-read-v1`, projeto_ref `ssbesxgaijknwsjbsbcz`. O smoke do navegador confirmou JSON `legacy_endpoint_retired`. O handler não inicializa cliente, usa service key, consulta RPC/tabelas ou faz fetch; mantém só telemetria allowlisted e OPTIONS 204/CORS.
- CI obrigatório de PR passou: contrato dedicado #39894257441 e `consumer-context` #39894257433. Os testes locais reportados no PR passaram: `node scripts/test-admin1-products-read-retirement.mjs`, `node --check supabase/functions/admin1-products-read-v1/retired-handler.mjs` e `node --experimental-strip-types --check supabase/functions/admin1-products-read-v1/index.ts`. A suíte protege que o runtime Admin usa `admin-products-live-v1` e não chama a função retirada. Não houve deploy Pages esperado, pois nenhum asset/rota web foi alterado; a implantação Supabase foi comprovada pelo estado ACTIVE v5 e pelo log HTTP 410.
- Smoke somente leitura: em `/vitrine/admin/`, a aba Produtos carregou cinco linhas e “Ver mais 5”; nenhuma edição foi acionada. A homepage `/` havia passado no smoke da rodada anterior (Vitrine rápida, cinco tamanhos, quatro ofertas, carrinho vazio). A recaptura AX desta rodada falhou com “Accessibility capture changed before it was committed”; isso é falha de captura, sem evidência de indisponibilidade do site. Nenhum pedido/checkout, mensagem, NF-e, ação Bling, estoque, pagamento ou financeiro foi executado.
- O build `python3 scripts/build-vitrine-admin-runtime.py --check` não foi executado localmente: o checkout do repositório não está montado nesta sessão e o runtime não foi modificado. A regressão de CI verificou o arquivo de runtime da main.
- Nenhuma migration/DDL, linha de banco, grant, policy ou configuração foi alterada. O projeto canônico recebeu apenas a Edge Function acima. Rollback: reverter o squash #1314 e reimplantar a fonte v4 de `d90b7b1dd5b0ac2d59ddc0e08530c489c5b2d1a0`; isso reabre a exposição anterior, portanto só usar diante de regressão funcional demonstrada. Não há rollback de dados.
  
### Próxima tarefa exata

Após `2026-10-24 03:20:07 UTC`, fechar uma janela contínua de 24h dos logs v5 de `admin1-products-read-v1`. Agregar somente status HTTP e os campos allowlisted de ação, caller, origem e página; não selecionar query, body, IP, cabeçalhos ou identificadores. Separar o GET de smoke em `03:20:29.940 UTC` de qualquer chamada posterior. Se persistir caller legítimo, localizar no código/cache sem restaurar a leitura pública; se não houver chamadas, preparar a decisão de remoção definitiva com teste e rollback. A função permanece em 410 durante a observação. A janela do proxy separado `admin1-legacy-catalog-read-v1` v3 só termina em `2026-10-24 02:14:07 UTC`; não remover antes de revisar esse recorte. A telemetria R13 de `admin-service-intelligence-v1` segue bloqueada pela renovação do `SUPABASE_ACCESS_TOKEN` pelo proprietário (#39848977831); não trocar credenciais.


## Conclusão R15 — aposentadoria do proxy Admin1 legado — 2026-10-23 02:18 UTC

- Estado revalidado antes desta rodada: PR #1269 foi integrada em `9ec95df6b55e24f3964c22d4b2064d3163519de4`; portanto `HANDOFF.md` e este roadmap já estão na `main`. A `main` antes do checkpoint estava em `5b08618085415eef5fe7119ed183436ec4669fdc`. A orientação permanece: site em `/` e Vitrine Admin em `/vitrine/admin/`; nenhuma rota foi movida.
- A auditoria separou os alvos: `admin1-products-read-v1` v4 no projeto canônico `ssbesxgaijknwsjbsbcz` tem histórico de acessos sem rota atribuída e segue preservada; não é consumida pelo runtime atual do Admin, que usa `admin-products-live-v1`. Em `xaoeldjuxzsdsblimzxo`, `admin1-legacy-catalog-read-v1` v2 era somente um proxy do canônico, sem consumidor no código de `main` e sem chamadas após v2 no recorte auditado. A alteração atinge apenas esse proxy legado.
- PR de código [#1308](https://github.com/osvaldosereia/SUCEDOAN12/pull/1308), branch `agent/admin1-legacy-catalog-retirement-20261022`, foi integrada por squash em `5b08618085415eef5fe7119ed183436ec4669fdc`. Commits da branch: `f2e8e2a7` (teste de contrato), `c00b1323` (CI), `fe8da9d8` (handler), `00c60054` (ajuste de sintaxe), `473ca7fc` (conexão do handler) e `3f4fb095` (remoção do contrato morto). Arquivos: `.github/workflows/admin1-legacy-catalog-retirement-ci.yml`; `scripts/test-admin1-legacy-catalog-retirement.mjs`; `supabase/functions/admin1-legacy-catalog-read-v1/index.ts`; `supabase/functions/admin1-legacy-catalog-read-v1/retired-handler.mjs`; removido `supabase/functions/admin1-legacy-catalog-read-v1/read-contract.mjs`.
- O handler responde a GET/POST e demais métodos com HTTP 410, JSON `legacy_endpoint_retired`, `Cache-Control: no-store`, sem payload de catálogo e sem fetch a upstream; OPTIONS permanece 204 com os cabeçalhos CORS. A tentativa inicial TDD falhou como esperado sem o handler (#39888293399); o CI dedicado da PR passou (#39888361655: contrato + sintaxe). Pós-merge, o workflow dedicado #39888434036 e Pages #39888433617 passaram. A revalidação do commit `5b08618` retornou 46/46 check runs com sucesso, sem falhas.
- Supabase: alvo confirmado da implantação foi o projeto separado `xaoeldjuxzsdsblimzxo` (ACTIVE_HEALTHY, sa-east-1, PostgreSQL 17.11.0.003), não o canônico. A função `admin1-legacy-catalog-read-v1` está ACTIVE v3, `verify_jwt=false`, SHA-256 `5f9d03ed30d6b5d125de6693b82a7e86c154148cfd2baee292ffa1a3731d4ae6`, atualizada em 2026-10-23 02:14:07.824 UTC; os arquivos implantados conferem byte a byte com `main`. O smoke HTTP ao endpoint real retornou `{"ok":false,"error":"legacy_endpoint_retired"}` (410); o log registrou o GET de smoke. A função canônica `admin1-products-read-v1` permanece ACTIVE v4, hash `b61be132530350da259e006674038c458c0d2aac3d5142c70e6ff2eeb8f58ff9`, sem alteração.
- Não houve migration/DDL, alteração de dados, configuração, grant, policy ou mudança de função no projeto canônico; advisors de banco não se aplicavam. Sem efeito em pedidos, catálogo canônico, Bling/estoque, WhatsApp, fiscal ou financeiro. O check `python3 scripts/build-vitrine-admin-runtime.py --check` não se aplica: nenhum arquivo de runtime do Admin foi modificado. O checkout local não está montado nesta execução; validação executável veio do CI vinculado à PR e ao commit de `main`.
- Smoke somente leitura em 2026-10-23: `https://donaantonia.com.br/` carregou a Vitrine rápida, categorias, cinco tamanhos de cesta, ofertas carregando e carrinho `Pedido 0`; `https://donaantonia.com.br/vitrine/admin/` carregou o Admin existente, navegação e Central. O endpoint legado retornou 410 conforme esperado. Nenhum pedido/checkout, mensagem, NF-e, ação Bling, estoque, pagamento ou financeiro foi acionado. A publicação da aplicação/web continua evidenciada por Pages #39888433617; a alteração publicada é a Edge Function do projeto separado descrito acima.
- Rollback: reverter o squash #1308 (`5b08618`) e reimplantar no alvo `xaoeldjuxzsdsblimzxo` o código anterior de `admin1-legacy-catalog-read-v1` da revisão `f50aeb75337433fb5fc54d57da22f5a64e145024` (`index.ts` + `read-contract.mjs`, mantendo `verify_jwt=false`). Não há rollback de banco/dados.
  
### Próxima tarefa exata

Após completar 24 horas do deploy v4 do endpoint canônico (janela fecha em 2026-10-23 20:00:29 UTC), consultar uma janela agregada de logs de `admin1-products-read-v1` e mapear ação, origem, página/caller sem extrair payload ou PII. Preservar v4 até existir consumidor legítimo identificado ou evidência de inatividade; não confundir essa função com o runtime atual `admin-products-live-v1`. Em execução posterior a 2026-10-24 02:14:07 UTC, fechar a primeira janela integral de 24h do proxy legado v3 e confirmar se houve chamadas além do GET de smoke; manter a resposta 410 até identificar/descartar qualquer caller. A telemetria R13 de `admin-service-intelligence-v1` continua pendente da renovação de `SUPABASE_ACCESS_TOKEN` pelo proprietário (#39848977831); não contornar com outra credencial.

## Conclusão R14 — cards leves, regressões e smoke móvel — 2026-10-23 01:30 UTC

- Base de código revalidada: `main` em `727c44cd1bc86ae9395235f3979ab03caa2c0483`. O checkpoint anterior (#1304, squash `6098cff`) já está na main. Site permanece em `/`; Admin permanece em `/vitrine/admin/`.
- PR #1301 integrada por squash em `daa0f9e97ae9d02ca6c01eff3330db2ef736d74e` (branch `agent/fix-public-basket-card-contracts-20261023`, head final `ea26ab8eacd8b81d13459ec4f825d1995fddb727`). Arquivos: `index.html`; `scripts/test-admin-pending-data-baskets-public-v1.mjs`; `scripts/test-basket-carousel-browser.mjs`; `scripts/test-basket-home-browser.mjs`; `scripts/test-basket-unified-commercial-model.mjs`; `scripts/test-home-performance-contract.mjs`; `scripts/test-storefront-mobile-r1.mjs` a `r4.mjs`. O runtime da homepage lê `firstCestasMs` do marco `da-home-size-cards`; os contratos/browser cobrem os cinco tamanhos, sem preço/contagem inicial, navegação da cesta e sem submissão de pedido.
- CI da PR #1301: 8/8 passaram na head final (runs #39883539151, #39883539566, #39883539164, #39883539095, #39883539134, #39883539220, #39883539066 e #39883539054). Pós-merge, 48/48 workflows concluíram sem falhas no commit `daa0f9e`; Basket product carousel #39883676826, Basket kit editor #39883676400 e Pages #39883669088 passaram. Pages está comprovada no SHA do merge.
- Pós-publicação, o smoke móvel apontou `firstCardImageLoaded=false`; a inspeção mostrou que o observador consultava a classe inexistente `.basket-card-photo`, enquanto o módulo serve `.basket-size-card-photo`. Não era falha da imagem de produção.
- PR #1305 integrada por squash como `727c44cd1bc86ae9395235f3979ab03caa2c0483` (head final `3d5bc8fbedc2ab18032e27cee4fb30638a55dfab`). Alterou somente `.github/workflows/basket-carousel-ci.yml`, `scripts/test-storefront-mobile-r6-live-browser.mjs` e `scripts/test-basket-carousel-browser.mjs`: seletor real do smoke, espera/assert de imagem e métrica, acionamento do workflow quando R6 muda e teste de cinco cards/ações. PR checks Basket product carousel #39884069118 e Basket kit editor #39884069147 passaram. Smoke R6 em #39884069118: endpoint `home_size_cards` HTTP 200, 5 cards, primeira imagem carregada em 390×844 e 320×740, sem overflow ou erros JS; `firstCestasMs` de 2773 ms e 2816 ms na rede/CPU simulada. O push da main para o commit `727c44c` tinha 43/45 workflows concluídos e 0 falha às 01:30 UTC; Basket product carousel #39884221629 e Pages #39884215611 passaram, dois Basket kit editor (#39884221369 e #39884215803) ainda estavam instalando Chromium. PR gates passaram; nenhum gate de branch protection/revisão bloqueou.
- Smoke pós-publicação somente leitura: `https://donaantonia.com.br/` respondeu com o título “Dona Antônia · Vitrine rápida” e pedido vazio. O smoke R6 confirmou os cards/imagens acima. O leitor web não conseguiu abrir `/vitrine/admin/`; smoke visual anterior do Admin em 2026-10-22 continua no histórico. Nenhum pedido, checkout, mensagem, NF-e, estoque, Bling ou financeiro foi acionado.
- Supabase revalidado: projeto canônico `ssbesxgaijknwsjbsbcz`, ACTIVE_HEALTHY, sa-east-1, PostgreSQL 17.6.1.166. Funções sem mudança: `storefront-v2` v99 hash `5bd0b5ab9ec2b21c00c6a185daaf45ef6d75aee2dc4c0598a165b43b00d7dfd2`; `admin-service-intelligence-v1` v377 hash `543b00c23a468f361ce00c63a4ee81a537daed1a7e6f14cce33082e0676f5bb3`; `admin-products-live-v1` v184 hash `d087c872ed23fa03dc2c3c784255b2bada1129de62b07db6f558c8ab7fd6291e`; `admin1-products-read-v1` v4 hash `b61be132530350da259e006674038c458c0d2aac3d5142c70e6ff2eeb8f58ff9`. Projeto separado `xaoeldjuxzsdsblimzxo`: `admin1-legacy-catalog-read-v1` ACTIVE v2 hash `1315a09561028a991b2b8853bf038f407e527f7a0f2926be9680188f474b17f0`. Nenhuma migration, função, config, dado, grant ou policy foi aplicada; advisors não eram pertinentes. `python3 scripts/build-vitrine-admin-runtime.py --check` não se aplica, pois nenhum runtime/Admin foi alterado.
- PRs duplicadas #1298 e #1302 foram fechadas sem merge após comparar os deltas: a chave de cache e o contrato de cinco tamanhos/preço/contagem estão cobertos em main; o smoke R6 foi corrigido e passou em #1305. Sem mutação Supabase; rollback de runtime se necessário é reverter #1301 (`daa0f9e`). Reverter #1305 (`727c44c`) restaura somente observabilidade/CI, sem efeito funcional no site ou banco.

### Próxima tarefa exata

Reconciliar, em modo somente leitura, as duas Edge Functions ativas com prefixo `admin1`: comparar `admin1-products-read-v1` v4 do canônico `ssbesxgaijknwsjbsbcz` com a fonte versionada e localizar todos os consumidores no `main`; comparar `admin1-legacy-catalog-read-v1` v2 no projeto `xaoeldjuxzsdsblimzxo` da mesma forma. Registrar projeto, hash, consumidor e rota usada antes de qualquer decisão. Manter o Admin em `/vitrine/admin/`; não mover função/rota nem implantar código sem divergência funcional reproduzida, teste, alvo, impacto e rollback confirmados. A publicação da telemetria R13 em `admin-service-intelligence-v1` continua pendente do secret `SUPABASE_ACCESS_TOKEN` renovado pelo proprietário (erro do run #39848977831); não contornar por outra credencial.

## Acompanhamento do checkpoint R14 — 2026-10-23 01:18 UTC

- Main revalidada: `d228fdb521479794d96fe68805564fe229e3b1c3` (PR documental #1303 integrada). A documentação R14 abaixo havia sido registrada antes da correção R3; este acompanhamento substitui seu estado pendente.
- PR de código #1301: https://github.com/osvaldosereia/SUCEDOAN12/pull/1301, branch `agent/fix-public-basket-card-contracts-20261023`, head `f911b9d93bcbc6aa934546235095d223a3eebf8f`, base declarada `483d30e6ee811a5a9eb290f6cc0367abd9db1a4d`; estado GitHub `mergeable=true`, `mergeable_state=unstable` enquanto os checks rodam. Depois do snapshot anterior, foram corrigidos os testes R2 e R3: R2 avalia apenas os helpers puros; R3 limita o harness aos helpers da vitrine e identifica o fixture como categoria `cestas-completas`. A reprodução de contrato R3 em V8 passou.
- Arquivos da PR: `index.html`; `scripts/test-admin-pending-data-baskets-public-v1.mjs`; `scripts/test-basket-carousel-browser.mjs`; `scripts/test-basket-home-browser.mjs`; `scripts/test-basket-unified-commercial-model.mjs`; `scripts/test-home-performance-contract.mjs`; `scripts/test-storefront-mobile-r1.mjs` a `r4.mjs`. A mudança de runtime é somente a métrica de homepage `firstCestasMs`; não há alteração do runtime do Admin.
- CI na head `f911b9d`: seis workflows passaram — #39882594982 Admin and Baskets Guard, #39882595035 Checkout Hotfix, #39882594946 Marketing UI, #39882594966 Basket mold storefront R5, #39882594998 mobile typography e #39882594974 WhatsApp Meta Central. Os dois gates finais, #39882594973 Basket kit editor e #39882595018 Basket product carousel, continuam `in_progress` na etapa `playwright install --with-deps chromium`; em 01:18 UTC nenhum ainda havia iniciado os testes subsequentes. A falha R2 antiga da PR duplicada #1302 pertence a outra head e não é o resultado da head atual. Não integrar nem contornar a instalação enquanto os jobs estiverem ativos.
- Smoke somente de leitura em 2026-10-23: `https://donaantonia.com.br/` está acessível, título “Dona Antônia · Vitrine rápida”, pedido vazio. O leitor web não executa a UI e não conseguiu abrir `/vitrine/admin/`; smoke visual anterior do Admin está registrado no histórico de 2026-10-22. Os resultados de browser em produção são pré-publicação e não confirmam a métrica/imagem no build novo.
- Supabase revalidado por leitura: projeto canônico `ssbesxgaijknwsjbsbcz`, ACTIVE_HEALTHY, sa-east-1, PostgreSQL 17.6.1.166. Funções ativas e sem alteração nesta rodada: `storefront-v2` v99, hash `5bd0b5ab9ec2b21c00c6a185daaf45ef6d75aee2dc4c0598a165b43b00d7dfd2`; `admin-service-intelligence-v1` v377, hash `543b00c23a468f361ce00c63a4ee81a537daed1a7e6f14cce33082e0676f5bb3`; `admin-products-live-v1` v184, hash `d087c872ed23fa03dc2c3c784255b2bada1129de62b07db6f558c8ab7fd6291e`; `admin1-products-read-v1` v4, hash `b61be132530350da259e006674038c458c0d2aac3d5142c70e6ff2eeb8f58ff9`. No projeto separado `xaoeldjuxzsdsblimzxo`, `admin1-legacy-catalog-read-v1` permanece ACTIVE v2, hash `1315a09561028a991b2b8853bf038f407e527f7a0f2926be9680188f474b17f0`. Nenhuma migration, Edge Function, configuração, dado, grant ou policy foi aplicada; advisors não se aplicam.
- Publicação ainda não comprovada; rotas continuam `/` e `/vitrine/admin/`. `python3 scripts/build-vitrine-admin-runtime.py --check` não se aplica, pois o runtime/Admin não mudou. Rollback, caso a PR seja integrada, é reverter seu commit squash; não há rollback Supabase.
- PRs duplicadas #1298 e #1302 permanecem abertas até comparar seus deltas com a #1301 integrada. A PR #1303 já foi integrada por squash como `d228fdb`.

### Próxima tarefa exata

Aguardar os runs #39882594973 e #39882595018. Se falharem, abrir os logs, corrigir a falha no mesmo domínio e repetir os testes. Se ambos passarem, revalidar base/mergeabilidade e integrar #1301 pelo fluxo normal do repositório; depois conferir o workflow Pages disparado pelo merge e fazer smoke de leitura da homepage e do Admin existente. Fechar #1298/#1302 somente se a comparação confirmar que todo delta útil foi coberto. Registrar então SHA de merge e evidência de publicação. A implantação R13 no Supabase segue sem relação com esta PR e permanece pendente da credencial `SUPABASE_ACCESS_TOKEN` autorizada.

> Atualização documental: 2026-10-23. Os checkpoints operacionais abaixo são históricos; confirme runtime e banco antes de qualquer ação operacional.

## Checkpoint de execução — 2026-10-23 (R14: cards leves da homepage e contrato de CI)

- Main revalidada antes deste checkpoint: `5d24cd70d4c609dcdd4ea8aeb94b0c867ccaff10` (PR #1300 integrada). A PR #1301 está aberta e mergeable, base `483d30e6ee811a5a9eb290f6cc0367abd9db1a4d`, branch `agent/fix-public-basket-card-contracts-20261023`, head `31184b23385c536e7a86e4f8902de60079a83ed3` (15 commits). O arquivo `index.html` alterado limita-se ao snapshot de desempenho; os outros nove arquivos são contratos/testes de cartões e fluxo da homepage.
- Mudanças efetivas na PR: contratos estáticos e de navegador passaram a refletir `home_size_cards`, com cinco tamanhos de Cestas Completas, sem preço/contagem inicial e com navegação/cotação sob mock; a métrica `firstCestasMs` agora lê `da-home-size-cards`. O teste R2 havia incluído, por uma faixa ampla, endpoint TypeScript com acesso ao banco; a correção final isola somente `isValidPublicHome` e `priorityFromPublicHome`. Commits finais relevantes: `92e5707cd8f5d0f184bd705d0c13a22411c0944b`, `98de3a8b0b0194dcfd80926bcd1a95579cfca538`, `5de73622a1e7e58f4d5404a6e5dfafe78c924d84`, `393a0d37ebfd57a8c385a8e2526e3188447dbcf1` e `31184b23385c536e7a86e4f8902de60079a83ed3`.
- CI na head `31184b2`: concluídos com sucesso WhatsApp Meta #39881247833, Basket mold storefront R5 #39881247867, Marketing Professional UI #39881247838, Checkout Hotfix #39881247841, Admin and Baskets Guard #39881247844 e Basket mobile readable typography #39881247805. Basket product carousel #39881248170 e Basket kit editor #39881247911 estavam em `in_progress` às 2026-10-23 01:04 UTC, ambos parados na etapa `playwright install --with-deps chromium`, sem conclusão/falha reportada. Execução R2 isolada em V8 passou após a mudança; as duas verificações pendentes ainda precisam terminar antes da integração.
- Smoke somente leitura em 2026-10-23: a abertura de `https://donaantonia.com.br/` confirmou a página pública acessível, título “Dona Antônia · Vitrine rápida” e pedido vazio. O leitor web não executou a página dinâmica nem acessou `/vitrine/admin/`; o último smoke visual do Admin no histórico deste handoff é o de 2026-10-22. Não houve efeito de pedido, checkout, cliente, mensagem, NF-e, Bling, estoque ou financeiro. A etapa de smoke móvel do CI é somente leitura e pode reportar a imagem ainda não carregada na janela curta; não substitui smoke pós-publicação.
- Supabase revalidado em modo de leitura: canônico `ssbesxgaijknwsjbsbcz`, ACTIVE_HEALTHY, `sa-east-1`, PostgreSQL `17.6.1.166`, 142 funções. `storefront-v2` ACTIVE v99, hash `5bd0b5ab9ec2b21c00c6a185daaf45ef6d75aee2dc4c0598a165b43b00d7dfd2`; `admin-service-intelligence-v1` ACTIVE v377, hash `543b00c23a468f361ce00c63a4ee81a537daed1a7e6f14cce33082e0676f5bb3`; `admin-products-live-v1` ACTIVE v184, hash `d087c872ed23fa03dc2c3c784255b2bada1129de62b07db6f558c8ab7fd6291e`. Prefixo `admin1` preservado: `admin1-products-read-v1` ACTIVE v4 no canônico e `admin1-legacy-catalog-read-v1` ACTIVE v2 no projeto separado `xaoeldjuxzsdsblimzxo`. Nenhuma migration, função, configuração, dado, grant ou policy foi alterada; advisors não se aplicam nesta rodada.
- Não houve publicação: PR #1301 continua aberta e o deploy de telemetria R13 segue condicionado à credencial `SUPABASE_ACCESS_TOKEN` já registrada no R13. O runtime/Admin não foi alterado; `python3 scripts/build-vitrine-admin-runtime.py --check` não se aplica. Rollback do código, após eventual merge, é reverter o squash da PR #1301; sem rollback de banco porque nada foi aplicado.
- Rotas preservadas: site em `/`, Admin existente em `/vitrine/admin/`. PR #1302 contém alterações sobrepostas nos mesmos contratos e PR #1298 está defasada; ainda não foram encerradas, aguardando a integração/verificação do sucessor #1301.

### Próxima tarefa exata

Aguardar conclusão dos runs #39881248170 e #39881247911 na head `31184b23385c536e7a86e4f8902de60079a83ed3`. Se ambos concluírem com sucesso e a PR permanecer mergeable, integrar #1301 por squash pela rota normal; então fechar #1302 e #1298 somente após confirmar que seus deltas foram cobertos. Consultar o workflow Pages de push no commit de merge e verificar o site `/` e Admin `/vitrine/admin/` após publicação. Se a instalação do Chromium continuar pendente/falhar, deixar a PR aberta, registrar o run/step e continuar na rodada seguinte sem contornar CI. Depois, atualizar este checkpoint com SHA do merge e evidência de publicação.
## Checkpoint de execução — 2026-10-22 (R13: telemetria segura de resultado por ação)

- Base: main 9b8710e6981e5e664ce7f59fd186c552054e07f0 após PR #1290; implementação na branch agent/admin-service-outcome-telemetry-20261022, head e4f966cb409fbc2c0999c91ee44b9cd370852837, integrada por squash em 2026-10-22T23:08:42Z. PR: https://github.com/osvaldosereia/SUCEDOAN12/pull/1290.
- A implementação registra resultado HTTP por ação com allowlist fixa de 41 ações e somente event, action, status e error_class. Payloads, IDs, IP, headers brutos, conteúdo de clientes, mensagens de exceção e detalhes de provedores ficam fora dos logs. Respostas originais permanecem intactas; exceções continuam sendo relançadas.
- Arquivos incluídos na PR: supabase/functions/admin-service-intelligence-v1/index.ts; supabase/functions/admin-service-intelligence-v1/_shared/admin-service-outcome-telemetry.mjs; scripts/test-admin-service-outcome-telemetry.mjs; .github/workflows/admin-service-outcome-telemetry-ci.yml. Commits da branch: 97851f30b9c035a793ff108571020af49b3e9a2a, 12a1ea05c819539be52ba307c02d834e2985f5fe, 4a950744715d0832a77eb6bf588236d4f0c84133, cef284d15cf0192a79e221ff400c43fe775dc7f4 e e4f966cb409fbc2c0999c91ee44b9cd370852837.
- Teste local de contrato passou em Node v24.19.0. No primeiro CI, o deno check do entrypoint monolítico retornou 178 diagnósticos em trechos legados não alterados; nenhum apontava para a importação/integração nova. O workflow foi ajustado para validar a integração pelo teste de contrato e rodar deno check apenas no helper. Na head final, o workflow próprio #39869720058 e os outros nove workflows de PR relacionados passaram; no merge, o workflow de telemetria #39869839458 e os oito workflows de push listados para esse commit terminaram com sucesso.
- Supabase canônico confirmado por leitura: projeto ssbesxgaijknwsjbsbcz, ACTIVE_HEALTHY, região sa-east-1, PostgreSQL 17.6.1.166. A Edge Function admin-service-intelligence-v1 permanece ACTIVE v377, hash publicado 543b00c23a468f361ce00c63a4ee81a537daed1a7e6f14cce33082e0676f5bb3; ela ainda não inclui este código. A comparação prévia confirmou os 14 arquivos implantados iguais à base de main 13edd3d43a837d33c62a084643fde909e68d269c. Nenhuma migration, função, configuração, dado, grant ou policy foi aplicada nesta rodada. A execução de deploy segue bloqueada pela falha registrada do secret SUPABASE_ACCESS_TOKEN no workflow #39848977831; não houve tentativa de contornar o gate nem alteração do secret.
- Smoke somente de leitura em 2026-10-22 confirmou a vitrine pública em / e o Admin existente em /vitrine/admin/; a navegação carregou, cesta permaneceu vazia e nenhum pedido foi iniciado. Nenhum arquivo do runtime visual do Admin mudou, portanto python3 scripts/build-vitrine-admin-runtime.py --check não se aplica a esta mudança.
- Publicação: PR integrada em main; publicação da Edge Function não comprovada e não realizada. Rollback do código: reverter o merge da PR #1290, removendo o wrapper, helper, teste e workflow e restaurando o dispatcher anterior; não há rollback de banco, pois nada foi aplicado no Supabase.

### Próxima tarefa exata

Quando o proprietário renovar/validar SUPABASE_ACCESS_TOKEN, confirmar que o workflow de deploy consegue autenticar e publicar o SHA atual de main no projeto ssbesxgaijknwsjbsbcz. Em seguida, consultar a versão/hash implantados e agregar logs somente por ação/status/classe para localizar as respostas 502; reproduzir a causa em teste antes de alterar comportamento. Se o gate continuar inválido, não disparar deploy nem usar credenciais alternativas para contorná-lo; avançar em outra tarefa independente do roadmap que não dependa da publicação.

## Checkpoint de execução — 2026-10-22 (R12: paridade do runtime de inteligência de serviço)

- Base da auditoria: `main` em `b315c1ab6569396ad1d171a917ca76b08f2f6400`; PR #1269 integrada. PR #1286, da branch `agent/admin-service-audit-checkpoint-20261022`, terminou no commit `e61253a9fc460a55d8ffcec5e278c6fcc41b6ed5` e foi integrada por squash em `2026-10-22T22:13:55Z` como `3ee3651e6fc1fc9982f998d1850f0ed1f9b07a62`. Esta confirmação de smoke/documentação parte de `main` nesse merge, pela branch `agent/admin-service-audit-smoke-final-20261022`.
- CI: `Basket lot helper grant CI` passou no run #39863190764 (commit de auditoria `449dd43f0b4b65764c28edf96518993ec3183a30`), no run #39863339275 (commit final `e61253a9fc460a55d8ffcec5e278c6fcc41b6ed5`) e no push de main #39863403369 (merge `3ee3651e6fc1fc9982f998d1850f0ed1f9b07a62`).
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

## Checkpoint pós-integração — 2026-10-22 (PR #1284: ledger da migration)

- Main atual: `d9af3d38bb197507f07d8773d74668a95eeef351`, squash merge da PR #1284. O commit de implementação foi `3c3f022a51d551de8305e341e26a0889f4743d37`; o checkpoint detalhado entrou na mesma PR no commit `c2511569ddab3c3839a39b5b601589f6cf52aff6`.
- Arquivos: atualizado `.github/workflows/basket-lot-helper-grant-ci.yml`; atualizado `scripts/test-basket-lot-helper-grant.mjs`; removido `supabase/migrations/20261022205411_basket_lot_helper_direct_execute_revoke.sql`; adicionado `supabase/migrations/20261022205909_basket_lot_helper_direct_execute_revoke.sql`; atualizados este HANDOFF e `IMPLEMENTATION-ROADMAP.md`.
- No projeto canônico `ssbesxgaijknwsjbsbcz`, o ledger segue com versão `20261022205909` e nome `20261022205411_basket_lot_helper_direct_execute_revoke`. A migration de ACL aplicada pela #1283 não foi reaplicada na #1284 nem após o merge. A #1284 é somente alinhamento do nome-fonte/teste/workflow.
- Revalidação pós-merge: projeto ACTIVE_HEALTHY em sa-east-1, PostgreSQL 17.6.1.166; ACL do helper permanece `{postgres=X/postgres,service_role=X/postgres}`, `authenticated_execute=false`, `anon_execute=false`, SECDEF owner postgres, search_path vazio. A RPC protegida continua coberta pelos testes permitidos/negados da #1283.
- Segurança: SECURITY DEFINER executáveis por authenticated = 42 (eram 43 antes da #1283); search_path mutável = 0; 228 RLS sem policy (INFO) e 1 proteção de senha vazada (WARN). Sem grants/policies amplos. Branch dev `da6-qa-20261009` permanece MIGRATIONS_FAILED.
- CI: contrato da #1284 passou no run #39854085809 (commit `3c3f022a51d551de8305e341e26a0889f4743d37`); PR #1284 foi integrada pela rota normal, sem revisão solicitada. O workflow independente Basket kit editor #39854086139 ainda aparecia em andamento instalando Chromium; ele não alterou arquivos de Cestas e não impediu o merge. Nenhum gate obrigatório adicional foi informado pelo GitHub.
- Publicação/smoke: sem alteração de runtime, frontend, rota ou Edge Function; portanto nenhuma publicação do site/Admin foi necessária. Não houve smoke interativo das rotas porque o navegador conectado não forneceu acesso ao site/Admin nesta rodada. Não declarar a implantação de UI como verificada.
- Rollback: revert da PR #1284 restaura somente o nome anterior do arquivo e os caminhos do teste/workflow, sem efeito de banco. Rollback do ACL aplicado na #1283 é o GRANT exato: `GRANT EXECUTE ON FUNCTION public.basket_lot_admin_allowed_v1() TO authenticated;`.
- Prefixo `admin1` revalidado e preservado: `admin1-products-read-v1` ACTIVE v4, `verify_jwt=false`, em ssbesxgaijknwsjbsbcz; `admin1-legacy-catalog-read-v1` ACTIVE v2, `verify_jwt=false`, em `xaoeldjuxzsdsblimzxo`. Sem migração, desligamento ou alteração de rota. Público continua em `/`; Admin em `/vitrine/admin/`.

### Próxima tarefa exata

Comparar somente leitura a versão/hash publicada de `admin-service-intelligence-v1` no projeto canônico com o código em main e os arquivos de compras/XML versionados; documentar drift funcional concreto antes de qualquer deploy. Se houver drift que exija publicação, preparar teste e preflight específicos. A workflow de deploy é manual em main, mas o secret `SUPABASE_ACCESS_TOKEN` segue inválido conforme run #39848977831; a atualização do segredo cabe ao proprietário. Não disparar deploy sem credencial válida. Acompanhar apenas ciclos naturais do cron EAN e aguardar sessão fisicamente verificada.

## Checkpoint de execução — 2026-10-22 (R11: ACL do helper de lotes e alinhamento do ledger)

- Base revalidada antes da edição: main `a09f26a60ef774465f7872db3574613f799ad963`. A #1269 está integrada; a correção de ACL foi integrada pela PR #1283 no mesmo commit. Esta correção de versionamento está na PR #1284, branch `agent/basket-lot-ledger-align-20261022`, commit de implementação `3c3f022a51d551de8305e341e26a0889f4743d37`.
- O helper `public.basket_lot_admin_allowed_v1()` deixou de ter execução direta por `authenticated`; as duas RPCs administrativas de substituição continuam executáveis e chamam o helper dentro do contexto protegido. A migration já foi aplicada ao projeto canônico `ssbesxgaijknwsjbsbcz`; não a reaplicar.
- O ledger do projeto registra versão `20261022205909`, nome `20261022205411_basket_lot_helper_direct_execute_revoke`. A #1284 apenas renomeia o arquivo versionado para `supabase/migrations/20261022205909_basket_lot_helper_direct_execute_revoke.sql` e atualiza seu caminho no teste/workflow. O SQL continua byte a byte igual; nenhuma DDL, função, grant, dado ou configuração é aplicada por esta PR.
- Preflight canônico: `ACTIVE_HEALTHY`, região `sa-east-1`, PostgreSQL `17.6.1.166`. A única branch de desenvolvimento `da6-qa-20261009` continua `MIGRATIONS_FAILED`; não foi possível usá-la para teste de migration.
- Comportamento validado depois da aplicação, em transação revertida: chamada direta ao helper por authenticated foi negada; administrador ativo sem papel viewer conseguiu chamar a RPC de catálogo; identidade não administrativa recebeu `admin_forbidden`. Consulta persistida do ACL: postgres e service_role têm EXECUTE; authenticated, anon e PUBLIC não têm. O helper segue SECURITY DEFINER do owner postgres com search_path vazio. Nenhuma linha de negócio foi alterada.
- Security advisor no canônico: aviso `authenticated_security_definer_function_executable` caiu de 43 para 42; `function_search_path_mutable` está zerado. Permanecem 228 achados INFO de RLS sem policy e 1 WARN de proteção a senhas vazadas. Não foram adicionadas policies/grants abrangentes.
- Testes da #1283: contrato de migration #39853165695, Basket Kit #39853165540 e attendance #39853165574 passaram. Na #1284, o workflow dedicado do contrato passou no run #39854085809 para o commit de implementação; o run independente Basket kit #39854086139 ainda estava em andamento neste checkpoint. O script verifica o revoke único e o rollback exato. Build do runtime Admin não se aplica: nenhum arquivo de runtime foi alterado.
- Nenhuma função Edge foi implantada nesta rodada. As funções com prefixo `admin1` foram revalidadas e preservadas: `admin1-products-read-v1` ACTIVE v4, `verify_jwt=false`, no projeto canônico; `admin1-legacy-catalog-read-v1` ACTIVE v2, `verify_jwt=false`, no projeto separado `xaoeldjuxzsdsblimzxo` (“Dona Antonia Admin1”). Sem redirecionamento, remoção ou mudança de rota.
- Smoke: este lote não muda o site/Admin e não requer publicação de frontend. A conexão de navegador disponível não permitiu uma verificação interativa de `/` e `/vitrine/admin/`; não declaro smoke nem implantação dessas rotas. As rotas permanecem `/` e `/vitrine/admin/`.
- Rollback do ACL de produção, se necessário: `GRANT EXECUTE ON FUNCTION public.basket_lot_admin_allowed_v1() TO authenticated;`. Reverter a #1284 restaura apenas o nome anterior do arquivo e seus caminhos de teste/workflow, sem efeito no banco.

### Próxima tarefa exata

Seguir a tarefa já priorizada no roadmap: comparar em modo somente leitura a versão/hash de `admin-service-intelligence-v1` publicada no projeto canônico com o código em main e os arquivos versionados de compras/XML; registrar divergência funcional concreta antes de qualquer deploy. Se houver drift, preparar teste e preflight específico. A publicação manual segue bloqueada até o proprietário renovar o secret inválido `SUPABASE_ACCESS_TOKEN` (run #39848977831); não disparar deploy enquanto isso não for resolvido. Continuar observando apenas o cron EAN natural, sem POST manual; aguardar sessão EAN fisicamente verificada.

## Checkpoint de execução — 2026-10-22 (R10: autenticação interna OPS2 e guarda de deploy XML)

Este checkpoint corrige a hipótese anterior: o POST 401 observado era a recuperação EAN agendada, não a leitura da aba Produtos.

- Baseline de código: main b68ebc2539878f031fdcbf5cf5db8683db9255fa após a PR #1278; a PR #1279 foi integrada em a307e4eadfe19e02fc212d25a344c484749f337b. A rota do Admin permanece /vitrine/admin/.
- Causa do 401 do cron: admin-products-live-v1 v183 tinha verify_jwt=true, embora o contrato no repositório configure verify_jwt=false. O cron bling-hub-v2-cycle autentica a chamada interna pelo header compartilhado, sem JWT; o gateway rejeitava antes do handler. O handler agora compara o segredo interno em tempo constante. Os demais caminhos de Admin continuam exigindo adminAuth e associação administrativa ativa.
- Arquivos de #1278: supabase/functions/admin-products-live-v1/internal-auth.mjs, supabase/functions/admin-products-live-v1/index.ts, scripts/test-admin-products-live-internal-auth.mjs e .github/workflows/admin-products-live-internal-auth-ci.yml. Commits da PR: 639e4368, e9cf388c, ffe80f63, f0937dbf; squash merge b68ebc2539878f031fdcbf5cf5db8683db9255fa.
- No Supabase canônico ssbesxgaijknwsjbsbcz, admin-products-live-v1 está ACTIVE v184, verify_jwt=false, hash d087c872ed23fa03dc2c3c784255b2bada1129de62b07db6f558c8ab7fd6291e; as três fontes implantadas coincidem com main. Estado ACTIVE_HEALTHY, região sa-east-1. Flags existentes permaneceram live/ativas e não foram alteradas.
- Evidência natural: function_edge_logs registrou 401 em 20:28:00.202Z na v183 e HTTP 200 em 20:30:02.678Z, 20:32:01.980Z e 20:34:02.289Z na v184. Leitura SQL entre 20:28Z e 20:35Z encontrou 0 sessões EAN verificadas e 0 auditorias Bling com target_key=verified; não houve recuperação externa nessa janela. O preflight tinha 20 pedidos pós-cutover elegíveis em potencial, mas nenhum com sessão física verificada e verified_at.
- PR #1279 corrige o workflow .github/workflows/xml-r31-supabase-deploy-once.yml: publicação canônica não roda por PR nem push; só por workflow_dispatch no main. Removeu --debug e adicionou teste de contrato e CI. O run #39848977831 tentou deploy durante pull_request e falhou antes de publicar: API Supabase respondeu 401 Invalid access token. Nenhum segredo foi exibido/alterado e nenhuma função R31 foi implantada por esse run. PR #1279 mergeada em a307e4eadfe19e02fc212d25a344c484749f337b.
- CI: contrato OPS2 39848425463 e Admin Products 39848977723 passaram; teste do guarda no PR 39850146584 e no main 39850198538 passaram. Basket Kit Editor 39848977652 passou. Pages main b68 39848967029 e Pages main a307 39850185015 passaram. O workflow de deploy XML continua sem credencial GitHub válida: run #39848977831 é falha autenticada e demanda atualizar o secret SUPABASE_ACCESS_TOKEN pelo proprietário antes de qualquer disparo manual.
- Smoke sem escrita: / abriu a vitrine pública com cinco cestas e quatro ofertas; /vitrine/admin/ carregou a Central e navegação das 19 áreas. A lista Produtos carregou cinco itens em smoke de leitura anterior ao deploy. Nenhum pedido, checkout, mensagem ou efeito de estoque/fiscal foi criado.
- Supabase: não houve migration, DDL, correção de dados, mudança de flags, RLS ou grants. Somente admin-products-live-v1 v184 foi implantada no projeto canônico. A branch de desenvolvimento da6-qa-20261009 segue MIGRATIONS_FAILED; não havia branch utilizável e não houve mudança de schema.
- Rollback da função: redeploy da fonte preservada v183 com verify_jwt=true restaura o estado anterior, mas também reintroduz o 401 do cron. Não há rollback de banco. O guarda de deploy pode ser revertido pela PR #1279; isso voltaria a permitir que alterações da workflow acionassem tentativa automática em PR.
- Rotas e regras comerciais foram preservadas: público em /, Admin em /vitrine/admin/; sem migração para /admin/, checkout sintético, mensagem, NF-e, pagamento ou movimento de estoque.

### Próxima tarefa exata

Continuar R10 com comparação somente leitura da versão publicada de admin-service-intelligence-v1 no Supabase canônico contra main e os arquivos de compras/XML versionados. Registrar versões/hash e a divergência funcional concreta antes de qualquer ação. Se houver drift que necessite implantação, preparar teste e preflight específicos; a workflow manual exige atualização do secret SUPABASE_ACCESS_TOKEN porque o run #39848977831 comprovou que o valor atual é inválido. Não disparar a workflow nem redeployar uma função sem essa reconciliação. Enquanto isso, observar apenas os ciclos naturais do cron EAN; aguardar conferência EAN física real e não invocar a recuperação manualmente.

## Checkpoint de execução — 2026-10-22 (diagnóstico Admin1 e teste rápido do Admin)

Este checkpoint supersede as fotografias anteriores desta página. Revalidei main, PRs, CI, runtime e os projetos Supabase envolvidos.

- Main no início do lote de runtime: `383fc5062483dacb61541ec2624b526633ee4d4a`.
- A PR #1269 (`docs/refactor-roadmap-end-to-end-20261022`) foi integrada em `9ec95df6b55e24f3964c22d4b2064d3163519de4`; os documentos canônicos já estão em main. A PR #1273 (contratos de CI) foi integrada em `52c7ca0a75a0e7bb55f3cd4d99b7cf969bcb6627`. A PR #1275 (diagnóstico do consumidor Admin1) foi integrada por squash em `383fc5062483dacb61541ec2624b526633ee4d4a`, a partir do HEAD `6cc9e1a79cf7052f0e73ee7cdb793e3c280d2adc`. A PR documental #1276 foi integrada por squash em `cb78f7eef4bd075fb3c7a01f69d7dc1245299c97`.
- A branch `main` não tem proteção nem checks obrigatórios configurados no GitHub neste snapshot. A integração ocorreu pela API normal do GitHub. A PR #1275 não tinha revisão pendente.
- Código da PR #1275: `.github/workflows/admin1-products-read-context-ci.yml`, `scripts/test-admin1-consumer-context.mjs`, `supabase/functions/admin1-products-read-v1/consumer-context.mjs` e `supabase/functions/admin1-products-read-v1/index.ts`. O logger registra somente categorias limitadas (ação permitida, classe de origem/página/chamador e fetch-site) em GET válido; não registra parâmetros, GTIN/busca, IP, Referer completo nem User-Agent bruto e não usa headers para autenticar.
- Função no Supabase canônico `ssbesxgaijknwsjbsbcz` (ACTIVE_HEALTHY, sa-east-1, PostgreSQL 17.6.1.166): `admin1-products-read-v1` está ACTIVE v4, `verify_jwt=false`, hash `b61be132530350da259e006674038c458c0d2aac3d5142c70e6ff2eeb8f58ff9`. O smoke controlado `GET ?action=health` retornou HTTP 200 e gerou o registro categorizado `health / unknown / browser / fetchSite=none`; isso comprova que o logger executa, mas não identifica um chamador natural do frontend. A plataforma Supabase também mantém metadados padrão de acesso nos edge logs; a exclusão de IP aplica-se ao logger customizado da aplicação.
- A reconciliação do prefixo `admin1` encontrou outra função ACTIVE: `admin1-legacy-catalog-read-v1` v2 no projeto legado `xaoeldjuxzsdsblimzxo`, `verify_jwt=false`. A fonte atualmente publicada encaminha ao endpoint canônico `ssbesxgaijknwsjbsbcz/functions/v1/admin1-products-read-v1`. Mantida ativa; não há evidência suficiente de chamadas naturais para removê-la nem de que o projeto legado possa ser desligado.
- Testes direcionados passaram: `node scripts/test-admin1-consumer-context.mjs`; `node --check` em `consumer-context.mjs` e `read-contract.mjs`; `node --experimental-strip-types --check` em `index.ts`; `python3 scripts/build-vitrine-admin-runtime.py --check` (9 fragmentos, 640.167 caracteres). Também passaram os quatro testes de contratos da PR #1273. Pages deploys `39845023999` (main `383fc…`) e `39846355173` (merge documental `cb78…`) passaram; workflow Admin1 `39845026219` passou. No conjunto geral, `Basket kit editor` ainda estava em execução no último snapshot e o workflow independente `XML R31 deploy Supabase CLI` falhou com 401 / token inválido. Não alterei secrets.
- Smoke inicial do site publicado: `/` abriu “Dona Antônia · Vitrine rápida”, com cinco cestas/ofertas e carrinho vazio; `/vitrine/admin/` abriu o Admin existente. Na primeira observação da aba Produtos, ela permaneceu em “Carregando…”; os logs canônicos registraram POST 401 de `admin-products-live-v1` v183 em 22/10/2026 às 20:04:02Z. Em uma nova leitura após a integração de #1276, a lista carregou e exibiu cinco produtos, com “Ver mais 5”; isso aponta para falha intermitente ou recuperação posterior, não indisponibilidade permanente. Nenhuma gravação de produto, pedido, estoque, cliente ou pagamento ocorreu. A causa e a relação entre o POST 401 e o carregamento posterior permanecem não isoladas.
- Mudança aplicada ao Supabase: somente deploy da Edge Function `admin1-products-read-v1` v4 no projeto `ssbesxgaijknwsjbsbcz`. Nenhuma migration, alteração de schema/dados, policy, grant ou configuração foi aplicada; advisors de banco não foram executados porque não houve mudança de schema/permissão. O wrapper legado permaneceu intacto. Rollback do deploy: republicar no projeto canônico a fonte v3 anterior (`index.ts` e `read-contract.mjs`), removendo o helper novo; rollback de código: revert dos commits de #1275/#1273, sem rollback de banco.
- Rotas e regras preservadas: site em `/`, Admin em `/vitrine/admin/`; sem migração para `/admin/`, sem rota paralela, sem checkout/pedido sintético e sem efeitos em Bling, WhatsApp, fiscal ou financeiro.

### Próxima tarefa exata

Esta orientação histórica foi superada pelo checkpoint mais recente acima. O POST 401 era do cron de recuperação EAN, não do carregamento da aba Produtos. Consulte o checkpoint atual para a comparação de fonte publicada de admin-service-intelligence-v1, o estado do secret de deploy e os gates operacionais reais.


## Continuidade da reforma do site e Admin (2026-10-22)

O usuário definiu a reforma gradual do sistema e site existentes. Não criar outro site, outro Admin, outro banco ou implementação paralela. Em 2026-10-22, esclareceu que o trabalho fica no Vitrine Admin existente em `/vitrine/admin/`; migração para `/admin/` está fora do escopo agora. A estratégia canônica está em IMPLEMENTATION-ROADMAP.md, seção “REFORMA CONTÍNUA DO SISTEMA E DO SITE PÚBLICO”.

Baseline inicial observado em 2026-10-22:
- Repositório canônico osvaldosereia/SUCEDOAN12; main em 24719f9c57b2d362b1e7c5b197dc57fc66a6b8f5.
- Supabase canônico ssbesxgaijknwsjbsbcz.
- Site público ao vivo em /. Admin existente abre em /vitrine/admin/. `/admin/` ainda volta à raiz, mas sua migração foi expressamente adiada e não faz parte do próximo lote.
- Site público testado: troca de opção de cesta recalculou o total de R$ 419,30 para R$ 425,70; nenhum pedido foi enviado.
- Nenhuma mudança de runtime, banco ou deploy foi feita nesta atualização documental.
- Rotina "Reforma Dona Antônia" programada para começar em 22/10/2026 às 12:00 (America/Cuiaba) e repetir de hora em hora. Cada rodada deve maximizar ajustes validados dentro de um domínio coerente, com branch/PR, testes e sem mutações operacionais em produção.

### Rodada inicial de 2026-10-22 (histórico anterior às integrações posteriores)

- O mapeamento inicial do Admin confirmou 19 áreas/entradas em `/vitrine/admin/`: Central, Atendimento, ANA, Pedidos, Expedição, Entregador, Fechamento, Produtos, Cestas, Validades, Orçamentos, Clientes, Marketing, Compras/XML, Leitura EAN, Balanço, Gôndolas, Financeiro e Bling técnico.
- A sessão Produtos foi implementada na PR #1270 (`agent/vitrine-products-hardening`, HEAD `5197aa4a8e9951a9a1a942fb0d93e9ed4425cd96`): categorias novas preservando valores legados, retomada de salvamento parcial pelo mesmo ID, cache curto de facetas invalidado após mudanças e paginação real. Naquele snapshot, a PR ainda estava aberta; depois foi integrada em `main` no commit `b75035006a064c5939d7e1dbb4fe8c8ad5307c88`.
- CI direcionado `products-session`: passou integralmente — `python3 scripts/build-vitrine-admin-runtime.py --check`, sintaxe JS e os testes de lista, edição rápida móvel e editor completo. O CI amplo terminou com 10 de 19 checks em falha (pedidos/fiscal, checkout, marketing, ANA/Admin legado e cesta simples); por isso a PR #1270 não foi integrada nem implantada.
- Smoke do mesmo sistema em uso: `/` recalculou a cesta de R$ 419,30 para R$ 425,70 ao escolher Arroz Tio Bonini; o fluxo foi encerrado sem adicionar a cesta nem criar pedido. `/vitrine/admin/` abriu; a lista Produtos carregou 5 itens e ofereceu mais 5. Nenhuma gravação operacional foi feita.
- Supabase canônico confirmado: `ssbesxgaijknwsjbsbcz`. `admin1-products-read-v1` segue ativa (v3) e teve chamadas reais em 24 h: 56 GET products, 42 categories, 13 product, 2 matches e 1 health; origem não identificada nos logs. Não desativar. Nenhuma migration, Edge Function ou configuração foi aplicada.
- O ledger do banco tem 1.244 versões; `main` contém 180 arquivos SQL de migration (175 com prefixo timestamp, 8 timestamps duplicados), com apenas 31 timestamps compartilhados. Há 1.213 versões do banco sem arquivo correspondente e 136 timestamps únicos apenas no repositório. O banco avança até `20261022114704`; o repositório até `20261022103000`. Não aplicar DDL até reconciliar essa divergência.
- Rollback: sem efeito em produção para reverter. Antes de merge, basta reverter/remover a PR de código; não há alteração de banco ou deploy para desfazer.

A próxima tarefa daquela fotografia — comparar os contratos de Admin/runtime com a base e a PR #1270 — foi concluída nas rodadas subsequentes. O checkpoint atual abaixo supersede SHAs, estado das PRs e próxima tarefa.


> Documento canônico de continuidade. Atualizar ao final de cada rodada relevante.


## Objetivo
Simplificar a operação da Dona Antônia usando:
- donaantonia.com.br como canal de venda;
- Vitrine/Admin como i### Revalidação e onda de ofertas da home — 2026-10-22

- Revalidação de GitHub: `main` atual em `b75035006a064c5939d7e1dbb4fe8c8ad5307c88`; #1269 e #1270 estão merged. A PR #1271 (`agent/admin-runtime-contract-tests`) permanece aberta, mergeable, baseada nesse SHA. O commit de código desta onda é `89d1e46f368ea2811fc9ff5cbe9e206f85b533c0`.
- Diagnóstico: R3/R4 reproduziram que a home não inseria `#homeOffersMount` e não iniciava `observeOffers()`. A home passa a inserir uma seção adiada de ofertas no shell inicial e na navegação nova; a hidratação do shell ativa o observer uma vez, mantém respostas carregadas na montagem existente e pinta ofertas em cache sem refazer requisição em atualizações só do catálogo.
- A mesma correção mantém o índice de imagens cumulativo entre categorias/subcategorias: somente o primeiro card da home fica `eager`/prioritário; os seguintes continuam protegidos pelo carregamento lazy horizontal. Os testes R3/R4 agora usam os campos públicos reais de `BasketCarousel.card`; R3 inclui o helper de subcategorias no harness. R5 abre a lista de alternativas no teste, injeta a pré-validação assíncrona já usada no checkout e respeita os atributos lazy/decoding existentes.
- Arquivos desta onda: `index.html`, `scripts/test-storefront-mobile-r3.mjs`, `scripts/test-storefront-mobile-r4.mjs` e `scripts/test-storefront-mobile-r5.mjs`. A PR #1271 tem 53 arquivos ao todo, incluindo `pedido/index.html`, `scripts/helpers/admin-ui-source.mjs` e contratos do Admin. Na etapa anterior da mesma PR, os commits `65938f4`, `15ec7d2` e `4544862` alinharam 15 testes do Admin/Pedidos ao runtime modular e ao harness ESM: `test-order-separation-completion-feedback-v4.mjs`, `test-admin-orders-clean-flow-v3.mjs`, `test-order-manual-queue-v1.mjs`, `test-separator-assignment-repair-v1.mjs`, `test-montar-picking-v1.mjs`, `test-order-customer-notifications-v1.mjs`, `test-admin-attendance-native-v1.mjs`, `test-admin-attendance-offers-tab-v1.mjs`, `test-admin-ana-section-v1.mjs`, `test-fiscal-nfe-autorecovery-v1.mjs`, `test-basket-simple-tabs-v1.mjs`, `test-basket-lot-ops-rules.mjs`, `test-customer-postorder-flow-v1.mjs`, `test-order-public-summary.mjs` e `test-admin-order-public-vitrine.mjs`. A rota administrativa continua em `/vitrine/admin/`.
- Verificações: os testes `scripts/test-storefront-mobile-r1.mjs` a `r5.mjs` passaram, executados contra a fonte da PR. `python3 scripts/build-vitrine-admin-runtime.py --check` passou no workspace disponível (9 fragmentos, 638.778 caracteres); o runtime do Admin não foi alterado nesta onda. Em `89d1e46`, os 13 workflows de CI aplicáveis terminaram `success` (13/13).
- Smoke pré-integração, leitura somente: o site publicado `/` mostrava cinco cestas e carrinho vazio; `/vitrine/admin/` abriu a Central com 19 áreas. Esse smoke antecede a implantação deste commit. Nenhum pedido, mensagem, checkout, estoque ou dado operacional foi criado ou alterado.
- Supabase canônico confirmado: `ssbesxgaijknwsjbsbcz`, `ACTIVE_HEALTHY`, PostgreSQL `17.6.1.166`; 1.244 migrations, última `20261022114704`; 142 Edge Functions. `admin1-products-read-v1` continua ativa na versão 3. Nenhuma migration, função, configuração, policy/grant, advisor ou dado foi alterado nesta onda. Divergência do ledger permanece: 1.244 versões aplicadas, 180 SQLs versionados e 31 timestamps compartilhados; DDL segue aguardando reconciliação.
- Integração/publicação: a PR ainda não foi integrada neste checkpoint. Sem evidência de implantação do novo commit. Rollback: reverter o merge da #1271; não há rollback de Supabase.
- Próxima tarefa exata, após merge e smoke em produção: mapear, somente por leitura, os consumidores atuais de `admin1-products-read-v1` correlacionando chamadas reais/logs do Supabase com callsites e autenticação no repositório/runtime; manter a função ativa até identificar todos os consumidores e decidir seu destino dentro do sistema existente. Depois, reconciliar o ledger de migrations antes de qualquer DDL.


nterface operacional simples para funcionários;
- Bling como ERP oficial (produtos, estoque operacional, compras, fornecedores, vendas, fiscal e financeiro);
- ChatGPT como camada de gestão, análise, automações e acompanhamento;
- Supabase apenas para regras e integrações específicas que o Bling não resolve adequadamente.

## Princípios
1. Não substituir nem apagar fluxo de produção antes de homologar o substituto.
2. Não reconstruir no Admin funções que o Bling já execute bem.
3. Funcionários não devem depender do painel completo do Bling para a rotina.
4. Regras críticas e determinísticas não ficam a critério da IA.
5. Preferir eventos/webhooks a polling periódico.
6. Bling será a fonte oficial do ERP; Admin será a interface operacional da Dona Antônia.
7. ChatGPT será a interface gerencial do proprietário sempre que tecnicamente possível.

## Escopo da auditoria
Classificar cada função atual como:
- BLING
- ADMIN DONA ANTÔNIA
- CHATGPT
- INTEGRAÇÃO MÍNIMA
- REMOVER APÓS HOMOLOGAÇÃO

Domínios:
- site e checkout;
- pedidos;
- clientes;
- produtos e cadastro;
- estoque;
- cestas;
- ofertas;
- validade;
- gôndola/prateleira;
- compras e fornecedores;
- XML/NF-e de entrada;
- conversão caixa -> unidade;
- fiscal;
- contas a pagar;
- contas a receber;
- separação/picking;
- conferência;
- impressão automática;
- expedição;
- entrega/rotas;
- relatórios e gestão;
- automações ChatGPT.

## Regras já aprovadas
### XML / compras
- NF/XML do CNPJ: usar o máximo possível do fluxo nativo do Bling.
- XML de compra no CPF: pode cadastrar/atualizar produtos, fornecedor, custo e estoque conforme regras aprovadas, mas NÃO deve criar conta a pagar/vínculo financeiro empresarial.
- Compras em caixa com venda por unidade exigem conversão determinística para unidades, custo unitário e estoque correto.

### Pedidos / operação
Fluxo-alvo:
cliente -> donaantonia.com.br -> validação mínima -> Bling -> separação -> conferência -> fiscal -> expedição -> entrega.

- Ao entrar pedido, objetivo é imprimir automaticamente uma lista de separação organizada por gôndola/prateleira.
- Interface do funcionário deve ser simples: Montar -> Conferir -> Expedir.
- Folha do entregador é diferente da folha de separação: cliente, endereço, telefone, localização/mapa, volumes, pagamento/valor a receber e observações.
- Avaliar aproveitamento de Picking/Packing, Checkout de Pedidos, DANFE simplificado, etiquetas e impressão nativa do Bling.
- Para impressão personalizada imediata, avaliar ponte/agente local de impressão sem recriar ERP.

## Arquitetura-alvo
CLIENTE
  -> donaantonia.com.br
  -> camada mínima Dona Antônia
  -> Bling (ERP)
  -> fiscal/financeiro/estoque/compras

FUNCIONÁRIO
  -> Admin Operacional Dona Antônia
  -> Montagem / Conferência / Expedição / Entrega

PROPRIETÁRIO
  -> ChatGPT
  -> gestão do Bling + exceções + relatórios + automações

BLING
  -> webhooks/eventos
  -> sincronização mínima com Supabase/Admin quando necessário

## Estado técnico conhecido
- Repositório principal: osvaldosereia/SUCEDOAN12.
- Supabase canônico ativo: ssbesxgaijknwsjbsbcz.
- Projeto legado Chat Commerce OS está inativo e retirado do runtime; não deve voltar a ser usado.
- Há diversas Edge Functions históricas/duplicadas relacionadas a Bling e operação; NÃO remover até auditoria e homologação.
- A documentação existente registra runtimes antigos de Bling Hub/fiscal desativados, embora jobs pg_cron tenham existido.
- O Vitrine/Admin atual possui ações intermediárias de Bling/fiscal/financeiro que precisam ser confrontadas com capacidades nativas do Bling/MCP.

## Fases
### Fase 1 — Auditoria e matriz
Inventariar GitHub + Supabase + Admin + integração Bling e produzir matriz de destino.

### Fase 2 — Bling como ERP
Validar conexão, permissões, módulos e configurações; definir fonte oficial por domínio.

### Fase 3 — Pedido até expedição
Simplificar pedido do site -> Bling; impressão automática; separação; conferência; NF-e; expedição.

### Fase 4 — Compras / XML / estoque
NF-e recebida, XML manual CPF/CNPJ, fornecedores, caixa->unidade, custos, estoque e pedidos de compra.

### Fase 5 — Financeiro
Contas a pagar/receber, vencimentos, conciliação operacional e relatórios.

### Fase 6 — ChatGPT gestor
Rotinas agendadas, alertas por exceção, panorama diário, estoque crítico, compras, fiscal, financeiro e pedidos parados.

### Fase 7 — Limpeza
Remover somente componentes comprovadamente substituídos e sem dependências de produção.

## Próximo passo
Fechar a Fase 1 com a matriz de fonte de verdade por entidade e o desenho TO-BE do fluxo pedido -> Bling -> impressão -> separação -> conferência -> fiscal -> expedição -> entrega. Depois definir o gateway mínimo e auditável para gestão via ChatGPT.

## Progresso da auditoria em 2026-09-25
- Confirmado que o pedido hoje só é enfileirado ao Bling no início da separação, após consumo do estoque local.
- Confirmado que o Hub automático está desabilitado globalmente, embora o cron físico exista.
- Confirmado que XML diário está ativo às 06:00 Cuiabá e passa pelo monólito admin-service-intelligence-v1.
- Confirmado gate CPF: XML pessoal nunca cria financeiro empresarial.
- Confirmada confirmação humana obrigatória para entrada física de estoque de XML.
- Confirmada lógica determinística de personalização de cesta e diferença comercial/fiscal.
- Confirmada ausência, nesta sessão, de plugin Bling direto no diretório de plugins do ChatGPT.
- Detalhes em CURRENT-STATE.md e AUDIT-MATRIX.md.


## Regra adicional de continuidade
O usuário determinou que não deve haver programação nem alteração de produção até toda a análise estar concluída, revisada e consolidada no Projeto Final detalhado. Documentação de análise pode ser atualizada para preservar continuidade.

## Novo requisito multicanal
Clientes podem comprar diretamente pelo WhatsApp/PapoAI sem usar o site. O projeto final deve incluir venda manual e rascunho assistido pelo PapoAI, ambos convergindo para o mesmo motor canônico de pedido do site. Ver `ANALYSIS-NOTES.md` e `SOURCE-OF-TRUTH-DRAFT.md`.


## Nova frente de análise — Control Tower
Foi aprovada para análise uma Central de Controle no Vitrine/Admin com dashboard, fila "Precisa de você", supervisão de automações, timeline operacional e copiloto OpenAI. Não é implementação ainda.

Direção registrada em:
- `CONTROL-TOWER-DRAFT.md`
- `AI-OBSERVABILITY-CONTINUITY-DRAFT.md`

Princípio: dashboard responde proativamente o que precisa de atenção; chat é camada de investigação/comando. Estado real vem de Bling/Supabase/PapoAI e ledger, nunca da memória de uma conversa.


## Achado crítico — pagamento/fiscal
A análise detectou um ciclo impossível no fluxo atual: o readiness fiscal exige pedido entregue + pagamento confirmado, enquanto o gate de expedição exige autorização fiscal antes da saída. Isso deve ser redesenhado antes de qualquer implementação. Também foi confirmado que o Bling suporta dinheiro, crédito, vale alimentação, vale refeição, PIX e múltiplas formas, mas o Admin atual só confirma um meio único pelo total. Ver `FINANCE-PAYMENT-DELIVERY-DRAFT.md`.


## Achado — compras/XML/estoque
O Bling deve ser o único consumidor da distribuição SEFAZ/NSU do CNPJ. A rotina custom atual lê NF-e já registradas no Bling; não consulta a SEFAZ diretamente. O projeto final deve preferir busca automática SEFAZ nativa + Check-in + DUN + lotes no Bling e reduzir o custom a XML CPF, conversão caixa->unidade, fila de revisão e auditoria. Ver `PURCHASES-XML-INVENTORY-DRAFT.md`.


## Achado — separação/expedição
Bling Checkout cobre grande parte de Picking/Packing, leitura EAN, checkout parcial, usuário em separação, geração fiscal/documentos e impressão QZ. O Admin deve manter principalmente fila simplificada, rota/entregador, venda manual/WhatsApp e fechamento de pagamento. Ver `OPERATIONS-EXPEDITION-DRAFT.md`.


## Fluxo máximo de automação
O usuário reforçou que o projeto deve reduzir ao mínimo a interação humana. A direção agora é: pedido nasce em `Aguardando confirmação`; cliente confirma preferencialmente pelo PapoAI/WhatsApp; aprovação muda automaticamente para `Aprovado / Separar`, ativa reserva no Bling e dispara impressão térmica custom 85 mm com foto/EAN/quantidade/localização; separador só marca `SEPARADO`; conferência usa preferencialmente Bling Checkout; após Verificado, estoque/documentos seguem automações homologadas; entregador só registra entrega e pagamento efetivo. Ver `WORKFLOW-MAX-AUTOMATION-DRAFT.md`.

Achado de dados: 1.634 produtos ativos, ~99,8% com imagem, ~98,6% com GTIN, mas apenas ~38,2% com gôndola+prateleira; localização física é o principal gate para picking automático ordenado.

## Revisão de acesso operacional — 2026-09-25
Foi concluída uma revisão do modelo de acesso para proprietário, supervisão, operação, entrega e automação. O desenho está documentado em `SECURITY-PERMISSIONS-AUTOMATION-DRAFT.md`. O modelo final não deve usar um único perfil compartilhado nos tablets.

## Fluxo de exceções — 2026-09-25
Foi concluído um primeiro desenho de exceções e recuperação. A regra é que falhas previsíveis virem filas claras na Control Tower, com retries idempotentes e escalonamento por papel. Foram documentados cancelamento, falta de estoque, impressão, conferência, webhook, Bling, NF-e, PapoAI, entrega, pagamento, XML e IA. Ver `EXCEPTION-RECOVERY-DRAFT.md` e `ORDER-STATE-MACHINE-DRAFT.md`.

## Confiabilidade e webhooks — 2026-09-25
O Bling está acessível em leitura nos principais domínios, mas o runtime global do Hub e webhooks estão desligados. A leitura de `situacoes/modulos` retorna 403 e `status_updates_enabled=false`, portanto automação por situações ainda não está homologada. Webhooks Bling precisam ser tratados com idempotência, entrega fora de ordem, resposta rápida e reconciliação. Ver `RELIABILITY-WEBHOOKS-DRAFT.md`.

## Balanço de estoque — 2026-09-25
A ferramenta de Balanço é requisito crítico. O frontend atual tem boa UX para leitor EAN + teclado numérico, mas o backend atual grava `products.stock` diretamente e não é compatível com Bling como fonte oficial. O Bling possui módulo nativo `Estoque > Conferência de estoque` com leitura de código, imagem, localização, saldo atual, diferença, log, sessão em nuvem e geração de Balanço. Direção: POC nativa primeiro; se os leitores/tablets não entregarem a UX necessária, manter a tela Dona Antônia como frontend fino escrevendo operação B no Bling. Ver `INVENTORY-COUNT-BALANCE-DRAFT.md`.

## Rota e eficiência — 2026-09-25
Roteirização própria e tela do entregador permanecem como função Dona Antônia; o Bling cobre logística documental/transportadoras, mas não foi encontrado recurso nativo oficial equivalente à rota local com pins WhatsApp + pagamento na porta. Também foi formalizada a regra arquitetural "se nada aconteceu, nada deve rodar": webhooks/eventos, read models pequenos, IA sob demanda e crons apenas como rede de segurança. Ver `DELIVERY-ROUTES-DRAFT.md` e `ARCHITECTURE-EFFICIENCY-DRAFT.md`.

## Cliente e cobertura da análise — 2026-09-25
Foi consolidada a estratégia de identidade: telefone identifica canal; CPF/CNPJ é identidade forte fiscal/ERP; Bling é o cadastro ERP consolidado; pedido mantém snapshot do endereço usado. Estado observado: 490 clientes, 227 sem documento e 57 sem telefone principal. Também foi criado `ANALYSIS-COVERAGE-DRAFT.md` para impedir que o Projeto Final seja escrito antes de fechar os bloqueadores restantes.

## Cestas e representação fiscal — 2026-09-25
Para cestas personalizadas, a direção preferida é enviar ao Bling os componentes reais do pedido, não depender de uma composição fixa. O uso atual de `other_expenses` para a diferença comercial deve ser reavaliado fiscalmente: foi aberto um candidato de rateio determinístico do preço comercial entre os componentes para que a soma dos itens coincida com a cesta, mantendo NCM/tributação individual. Não implementar sem homologação fiscal. Ver `BASKETS-COMMERCIAL-FISCAL-DRAFT.md`.

## Validade e ofertas por lote — 2026-09-25
Foi identificado que desconto por validade não pode continuar baseado em uma única data do produto quando existirem vários lotes. Bling deve ser fonte de lote/saldo/validade; Dona Antônia mantém a regra comercial por faixa e um pool promocional limitado à quantidade dos lotes elegíveis. Vencimento de um lote não implica desativar o produto inteiro se houver outro lote vendável. Ver `VALIDITY-OFFERS-DRAFT.md`.

## Rodada ampla pré-final — 2026-09-25
A análise arquitetural foi cruzada ponta a ponta. Principal descoberta fiscal: a Consulta 008/2026 da SEFAZ/MT conclui que venda não presencial com entrega e pagamento no domicílio pode ficar dispensada da vinculação tecnológica do comprovante ao documento fiscal quando cumpridas as condições da Portaria 262/2023. Isso permite desenhar NF-e antes da saída e fechamento do pagamento após a entrega, sujeito à homologação do contador sobre CNAE, XML e campos de pagamento.

Também foram fechados em draft:
- ponte PapoAI mínima e event-driven;
- modelo mínimo de ledger/attention/approvals;
- política anti-sobrecarga/custos;
- sequência de POCs/cutover;
- revisão cruzada de 14 contradições atuais.

Novos documentos:
- `FISCAL-HOME-DELIVERY-RESOLUTION-DRAFT.md`
- `PAPOAI-BRIDGE-FINAL-DRAFT.md`
- `CONTROL-TOWER-DATA-MODEL-DRAFT.md`
- `COST-CAPACITY-DRAFT.md`
- `POC-CUTOVER-PLAN-DRAFT.md`
- `FINAL-CROSS-REVIEW-DRAFT.md`

Nenhuma programação/produção deve ser alterada até o Projeto Final aprovado.

## Variantes reais, perdas e devoluções — 2026-09-25
Foi feita uma última análise ampla das exceções físicas/fiscais.

Achados críticos:
- NF-e autorizada + mercadoria já saiu + cliente recusa/não paga => não tratar como cancelamento simples; no retorno ao estabelecimento há NF-e de entrada/retorno referenciando a original.
- avarias, vencimentos, extravios e diferenças negativas reais de estoque exigem tratamento fiscal de baixa; consultas SEFAZ/MT 148/2026 e 151/2026 apontam CFOP 5.927, sem destaque, com estorno de crédito quando apropriado.
- sobra de balanço sem origem NÃO deve virar entrada automática; deve ser investigada.
- isso corrige o desenho do Balanço: a contagem continua rápida, mas divergências passam por reconciliação antes de regularizar estoque.
- usar somente dois depósitos lógicos: Geral + Quarentena (desconsiderada do saldo vendável).
- compra em CPF NÃO pode ser presumida como "fora da SEFAZ". XML CPF continua sem gerar conta a pagar empresarial, mas entrada/estoque fiscal precisam de política do contador antes da automação.

Documentos:
- `SALES-CANCELLATIONS-RETURNS-DRAFT.md`
- `STOCK-LOSS-DISCARD-FISCAL-ORIGIN-DRAFT.md`
- `OPERATIONAL-VARIANT-MATRIX-DRAFT.md`

Nenhuma implementação foi feita.

## Rodada máxima final de análise — 2026-09-25
A análise foi ampliada para pós-venda, CDC/e-commerce, recall de alimentos, recebimento profissional, devolução ao fornecedor, saldo virtual/reserva e reconciliação de estoque.

Principais decisões:
- usar Check-in de Recebimentos Bling antes de lançar estoque;
- danificado/faltante/incorreto no recebimento vira pendência/crédito/devolução no próprio Bling;
- site deve espelhar saldo virtual do depósito Geral, atualizado por webhooks;
- Geral + Quarentena são suficientes;
- pós-venda precisa tratar arrependimento, vício, troca, refund e devolução sem apagar a venda original;
- recall por lote entra como fluxo simples de bloqueio + Quarentena + rastreabilidade;
- operação custom fica limitada a cinco superfícies: Central, Pedidos/Nova venda WhatsApp, Tablet Separação, Balanço/Avaria/Retorno e Entregador;
- compras/check-in/checkout/fiscal/financeiro ficam preferencialmente no Bling;
- análise marcada como pronta para consolidação do PROJECT-MASTER; ainda não implementar.

Novos documentos:
- `POSTSALE-CONSUMER-RECALL-DRAFT.md`
- `RECEIVING-SUPPLIER-RETURNS-DRAFT.md`
- `STOCK-RECONCILIATION-DRAFT.md`
- `MINIMAL-PROFESSIONAL-OPERATION-DRAFT.md`
- `PROJECT-FINAL-READINESS.md`

## Projeto Final Consolidado — 2026-09-25
A fase de análise foi consolidada em documentos canônicos:

1. `PROJECT-MASTER.md` — arquitetura e operação final;
2. `SOURCE-OF-TRUTH.md` — autoridade final por domínio;
3. `IMPLEMENTATION-ROADMAP.md` — ordem de homologação e implantação.

Os arquivos `*-DRAFT.md` permanecem como evidência e pesquisa de apoio, mas decisões novas devem partir do PROJECT-MASTER e SOURCE-OF-TRUTH final.

**Importante:** ainda não houve implementação de produção desta nova arquitetura. Próximo passo só deve começar após aprovação explícita do Projeto Final.

## Como retomar em qualquer novo chat
Dizer:
"Retome Dona Antônia Operations 2.0. Leia docs/projects/dona-antonia-operations-2/HANDOFF.md no SUCEDOAN12, confirme o estado real no GitHub/Supabase antes de agir e continue do Próximo passo. Não altere produção sem homologação."

## Regra de continuidade
Ao terminar cada rodada importante:
1. atualizar este HANDOFF;
2. registrar o que foi realmente concluído;
3. registrar pendências/bloqueios;
4. atualizar Próximo passo;
5. nunca depender apenas do histórico do chat.


## Implantação em andamento — 2026-09-25
A análise foi aprovada e a implantação segura já começou. A frase antiga de "não implementar" neste HANDOFF ficou histórica e não deve bloquear o trabalho atual.

Concluído na onda atual:
- fundação Control Tower/ledger/attention/approvals;
- polling ocioso pausado;
- Bling em modo homologação com Hub/Webhooks ainda OFF;
- OAuth de reautorização Bling preparado;
- reserva do checkout movida para a confirmação;
- shadow readiness de early-order;
- fila de impressão de picking;
- motor canônico multicanal;
- Nova venda WhatsApp;
- PapoAI receiver capture-only no lugar do 410.

Versões atuais:
- admin-products-live-v1 v22;
- storefront-v2 v16;
- admin-service-intelligence-v1 v137;
- papo-external-agent-v1 v105.

Próximos gates:
- capturar payload real do PapoAI e normalizar eventos;
- reautorizar escopos de Situações no Bling e provar reserva/webhook;
- depois canário de early-order no Bling;
- POC de impressora física.


### Ponte PapoAI de conversa operacional
- payload real já é normalizado pelo adapter v2;
- `papoai_ensure_conversation_v2` faz o vínculo do inbound com `conversations`;
- receiver PapoAI v107 chama normalização + ponte inline, sem cron;
- conversa local é espelho operacional, não fonte do canal;
- cliente não é criado automaticamente;
- texto livre não cria pedido;
- rascunho versionado só deve receber eventos estruturados e determinísticos.

Próximo passo PapoAI: observar eventos de botões/flows/ações estruturadas e mapear somente os que permitirem montar/revisar o draft com segurança.


### Estado de implantação — separação/PapoAI
- PapoAI receiver v107 + normalizer v2 + conversation bridge v2 estão recebendo tráfego real;
- 9/9 eventos observados em 24h ficaram vinculados a conversas, sem revisão pendente;
- nova aba Separação atende tablet vertical com fluxo mínimo;
- picking 85 mm agora inclui foto, nome, EAN, quantidade e localização;
- impressão silenciosa ainda depende da POC física;
- próximo grande bloqueio externo continua sendo reautorizar o Bling para Situações/Módulos/Transições.


### Estoque mobile auditável
- `ops_inventory_counts` registra contagem física, saldo anterior, diferença, operador e estado de reconciliação;
- `ops_inventory_incidents` registra avaria, vencido, perda, retorno e outras ocorrências;
- Balanço não perde mais a causa/auditoria da diferença;
- durante a transição, a contagem atualiza o espelho local para manter o site coerente, mas diferença segue aberta para reconciliação no Bling/fiscal;
- avaria/vencido/perda saem imediatamente do estoque vendável local;
- retorno fica fora do vendável até inspeção;
- tela `Estoque mobile` no Admin usa leitor EAN + teclado na tela;
- próximo passo deste domínio: após homologar estoque/depósitos no Bling, trocar o efeito local por movimento oficial Geral -> Quarentena / reconciliação de Balanço.


### Pagamento efetivo na entrega
- `order_payment_settlements` e `order_payment_parts` foram adicionadas;
- o pagamento previsto no pedido não é mais tratado como pagamento efetivo;
- entregador/operador registra o que realmente recebeu;
- split de até 2 formas já está disponível na UI operacional, enquanto o backend suporta até 8 partes;
- a soma precisa fechar exatamente o total;
- somente depois da captura o pedido é marcado como Entregue;
- se o pagamento falhar, usar `Não entregou`;
- settlement fica `blocked_homologation` para Bling até o gate fiscal/financeiro;
- não chamar mais o antigo `order_fiscal_confirm_payment` como confirmação simples da entrega.

Próximo passo deste domínio: implementar retorno físico/não entrega como ocorrência explícita e depois, após homologação Bling, sincronizar recebimentos reais ao financeiro.


### Não entrega / retorno físico
- `order_delivery_return_cases` controla tentativas não concluídas e retorno da mercadoria;
- `Não entregou` não volta mais o pedido diretamente para Pronto;
- pedido permanece em entrega com overlay `returning` até a mercadoria voltar fisicamente;
- no tablet do entregador aparece `CONFIRMAR RETORNO AO DEPÓSITO`;
- ausente/endereço/reagendamento/veículo -> retorno confirmado -> `ready` para reentrega, sem restaurar estoque;
- pagamento falhou/cliente recusou/outro -> retorno confirmado -> `returned_review`, bloqueado para nova saída e atenção do supervisor;
- backend bloqueia captura de pagamento/Entregue enquanto houver retorno aberto;
- backend bloqueia saída de pedido `ready` com retorno em revisão.

Próximo passo: criar a resolução do retorno em revisão (mercadoria íntegra x avaria/falta) e só depois executar cancelamento/restauração de estoque/fluxo fiscal correspondente.


### Resolução de retorno em revisão
- supervisor pode liberar mercadoria íntegra para reentrega sem mexer no estoque;
- supervisor pode cancelar apenas quando confirmar que TODO o retorno está íntegro;
- nesse caso o estoque local consumido é restaurado e o pedido fica cancelado comercialmente;
- sempre abre atenção fiscal `delivery_return_fiscal_review`; nenhuma NF-e é alterada automaticamente;
- se existir pagamento capturado, o cancelamento íntegro é bloqueado até fluxo de reembolso;
- se houver avaria/falta, usar Estoque mobile e não restaurar o pedido inteiro.


## Gate Bling automatizado pós-OAuth — 2026-09-25
- `admin-service-intelligence-v1` publicado em v139;
- após uma reautorização OAuth bem-sucedida, o backend testa automaticamente `/situacoes/modulos`;
- catálogo autorizado passa a gravar `state=ready` e `status_updates_enabled=true`;
- a pendência `bling_scope_missing` é resolvida automaticamente quando o teste passa;
- Hub, Webhooks e fiscal continuam desligados; nenhuma escrita de pedido é ativada automaticamente;
- enquanto o Bling responder 403, o runtime permanece em homologação e o canário não avança.

### Ação manual ainda necessária
No cadastro do aplicativo Dona Antônia no Bling, liberar o acesso aos recursos de Situações/Módulos/Transições, salvar e reautorizar o aplicativo pelo botão **Reconectar Bling** do Vitrine/Admin. Depois disso a verificação é automática.


## Bling — Situações + reserva de estoque homologadas — 2026-09-25

### Escopos e catálogo
- reconexão OAuth concluída com o aplicativo correto **GitHub - Sincronização de Produtos**;
- `GET /situacoes/modulos` passou a responder HTTP 200;
- módulo **Vendas** identificado de forma determinística;
- catálogo de situações e transições gravado no runtime;
- `status_updates_enabled=true`;
- situações customizadas resolvidas:
  - `Aguardando confirmação` = 915901;
  - `Aprovado / Separar` = 915902;
- transição `Aguardando confirmação -> Aprovado / Separar` = 504837238;
- transição de rollback `Aprovado / Separar -> Aguardando confirmação` = 504838770.

### Canário real
Pedido Bling usado para homologação: `26967482613`.

Estado inicial:
- situação `Aguardando confirmação`;
- sem NF-e;
- saldo físico e saldo virtual iguais nos produtos amostrados.

Após mudança para `Aprovado / Separar`:
- situação alterada e confirmada por leitura da API;
- saldo físico permaneceu inalterado;
- saldo virtual caiu 1 unidade nos três produtos amostrados;
- reserva de estoque portanto foi comprovada.

Produtos amostrados:
- Açafrão-da-terra Itapero 30 g: físico 10 / virtual 10 -> 9;
- Achocolatado Apti 200 g: físico 3 / virtual 3 -> 2;
- Arroz Tio Bonini 5 kg: físico 97 / virtual 97 -> 96.

Rollback:
- pedido voltou para `Aguardando confirmação`;
- saldo virtual retornou a 10 / 3 / 97;
- saldo físico continuou intacto;
- liberação da reserva também foi comprovada.

### Configuração Bling homologada
Reserva de estoque configurada para considerar:
- `Aprovado / Separar`;
- `Verificado`.

`Aguardando confirmação` não deve reservar.

### Resultado
Gate **Situações + Reserva** = HOMOLOGADO.

O Hub geral continua em homologação e webhooks ainda não foram liberados para processamento. Próximo gate: homologar webhook real do Bling e reconciliação sem polling.


## Bling — receiver e reconciliação de webhooks homologados internamente — 2026-09-25

### Código/runtime
- o código em produção estava 18,6 KB à frente do GitHub; o drift foi eliminado antes de novos deploys;
- `admin-service-intelligence-v1` sincronizada no `SUCEDOAN12`;
- v148 adicionou canário interno do receiver;
- v149 adicionou reconciliação de pedido orientada a evento, somente leitura;
- commits principais:
  - `e3378907` — sincronização do runtime + canário do receiver;
  - `ff680757` — reconciliação de webhook de pedido por evento.

### Receiver canário
Evento sintético assinado internamente:
- assinatura HMAC válida -> HTTP 200;
- evento armazenado com `signature_verified=true`;
- como `hub_enabled=false` e `webhooks_enabled=false`, evento ficou `held`;
- envio duplicado do mesmo `eventId/hash` -> HTTP 200 e `duplicate=true`, sem segunda linha;
- assinatura inválida -> HTTP 401;
- nenhum efeito externo e nenhuma mutação de pedido.

### Reconciliação canário
Evento: `c1acf430-cfd8-4018-b103-b0589025e05e`.
Pedido Bling: `26967482613`.
Pedido canônico: `2e464c9f-f5df-4d75-baa4-f6455addd6d4`.

Resultado:
- vínculo Bling <-> pedido local resolvido;
- status local `storefront_received` mapeia para Bling `915901`;
- leitura remota observou `915901`;
- classificação `order_reconciled_noop`;
- evento finalizado como `processed`;
- `local_mutation=false`;
- anti-loop preservado.

### Gate atual
Receiver + idempotência + assinatura + reconciliação de pedido = **PASSARAM internamente**.

Ainda falta a prova de **entrega real pelo Bling**. A inbox estava vazia antes do canário, então o aplicativo ainda não está enviando webhooks para o endpoint.

Ação manual necessária no aplicativo **GitHub - Sincronização de Produtos**:
1. abrir aba **Webhooks**;
2. cadastrar servidor:
   `https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-service-intelligence-v1?source=bling-webhook-v2`
3. habilitar versão `v1` para:
   - Pedido de Venda (`order`);
   - Produto (`product`);
   - Estoque (`stock`);
   - Nota Fiscal (`invoice`);
4. habilitar ações disponíveis `created`, `updated`, `deleted`;
5. salvar.

O Bling habilita `virtual_stock` automaticamente junto com `stock`.

Segurança:
- manter `hub_enabled=false`;
- manter `webhooks_enabled=false`;
- eventos reais recebidos ficam `held` até a homologação final.


## Bling — entrega real de webhooks homologada — 2026-09-25

### Prova real
Depois da configuração manual no aplicativo **GitHub - Sincronização de Produtos**, o Bling começou a entregar webhooks reais no receiver do Operations 2.0.

Pedido canário:
- Bling: `26967482613`;
- canônico: `2e464c9f-f5df-4d75-baa4-f6455addd6d4`.

Ao mudar `Aguardando confirmação -> Aprovado / Separar`:
- chegou `order.updated` real com situação `915902`;
- assinatura real foi validada;
- evento ficou `held` porque processamento geral permanece desligado;
- a reconciliação detectou corretamente drift entre local `storefront_received`/esperado `915901` e Bling `915902`;
- nenhuma mutação local foi feita.

Ao devolver `Aprovado / Separar -> Aguardando confirmação`:
- chegou segundo `order.updated` real com situação `915901`;
- assinatura válida;
- reconciliação terminou como `order_reconciled_noop`;
- local e Bling ficaram consistentes.

### Estoque virtual
A aprovação e o rollback geraram **56 eventos reais `virtual_stock.updated`**:
- 28 produtos ao entrar a reserva;
- os mesmos 28 produtos ao liberar a reserva;
- todas as assinaturas verificadas;
- saldo físico permaneceu intacto;
- saldo virtual foi reservado e depois liberado.

Os 56 eventos do canário foram classificados como teste e limpos da fila `held`, sem alterar estoque local.

### Resultado
Gate **Webhook real + assinatura + idempotência + reconciliação de pedido = HOMOLOGADO**.

Estado de segurança preservado:
- `mode=homologation`;
- `hub_enabled=false`;
- `webhooks_enabled=false`;
- nenhum processamento geral foi ativado;
- Make não foi usado.

Próximo passo: homologar o processamento de `virtual_stock.updated` para atualizar de forma segura o espelho local usado pelo site, antes de liberar webhooks gerais.



## Espelho de estoque Bling por webhook — HOMOLOGADO em 2026-09-25

### Backfill
O shadow mirror `bling_stock_mirror_v2` foi preenchido por leitura do Bling, sem escrita externa:
- 1.634 produtos ativos;
- 1.630 ativos com vínculo Bling exato;
- 1.630/1.630 vinculados cobertos pelo mirror;
- 4 ativos sem correspondência exata por GTIN/SKU no catálogo Bling;
- 0 vinculados sem snapshot.

Comparação do legado `products.stock` com o saldo virtual do depósito Geral:
- 1.087 iguais;
- 543 divergentes;
- 168 com local acima do Bling;
- 375 com local abaixo do Bling;
- 11 vendáveis localmente enquanto o Bling estava zerado;
- 3 zerados localmente enquanto o Bling tinha saldo.

Os 4 sem vínculo ficaram em atenção; nenhum vínculo aproximado foi criado.

### Atualização orientada a evento
Foi implantada aplicação idempotente de `virtual_stock.updated` no mirror:
- fonte: webhook Bling assinado;
- depósito vendável: Geral;
- proteção contra evento fora de ordem por `observed_at`;
- nunca altera `products.stock`;
- nunca escreve estoque de volta no Bling;
- sem cron/worker de sincronização contínua.

Durante a primeira ativação do trigger houve um erro de implementação: uso de `min(uuid)` no PostgreSQL causou respostas HTTP 500 para eventos de estoque. A flag shadow foi desligada imediatamente, o erro foi localizado nos logs e corrigido pela migration `ops2_virtual_stock_shadow_trigger_v1_fix`.

Após a correção:
- flag shadow reativada;
- rollback real do pedido canário gerou 28 `virtual_stock.updated`;
- 28/28 foram processados automaticamente;
- receiver respondeu HTTP 200 em todos;
- maior tempo observado: 2.214 ms;
- mirror do Achocolatado fechou em físico 3 / virtual 3;
- pedido canário voltou para `Aguardando confirmação`;
- reserva ficou liberada;
- 0 eventos `virtual_stock` canários permaneceram presos em `held`.

Estado do gate: **PASSOU**.

O Hub geral continua desligado:
- `hub_enabled=false`;
- `webhooks_enabled=false`;
- somente o shadow mirror de `virtual_stock.updated` está ativo.

### Próximo gate
Antes de o site consumir o mirror, remover a dependência operacional do modelo legado:
- checkout ainda valida `products.stock`;
- confirmação ainda cria reserva local;
- trigger legado ainda consome `products.stock` ao confirmar;
- Admin ainda calcula readiness com `products.stock`;
- esse ciclo precisa ser substituído de forma atômica para impedir dupla contagem com a reserva oficial do Bling.


## Regra reforçada de continuidade — 2026-09-25

O planejamento operacional detalhado foi atualizado em `IMPLEMENTATION-ROADMAP.md` no commit `ef3b60a0`.

A partir desta rodada, é regra obrigatória:
- nenhuma rodada importante termina sem atualizar o HANDOFF;
- conferir GitHub + Supabase/runtime antes de retomar;
- registrar commits, migrations, versões de Edge Functions, flags, testes, evidências, PASS/FAIL, rollback, pendências e próximo passo exato;
- atualizar também `HOMOLOGATION-STATUS.md` quando um gate for testado/homologado;
- não depender do histórico do chat para continuidade;
- código escrito sem teste/evidência/documentação não conta como etapa concluída;
- se houver interrupção, a retomada deve ser possível somente pelo repositório, Supabase/runtime e documentos canônicos.

### Próximo bloco oficial
Prioridade: fechar **pedido + estoque Bling** antes de limpeza ou expansão lateral.

Sequência:
1. baseline/documentação e 4 produtos sem vínculo;
2. cobertura determinística do catálogo;
3. cutover da leitura de estoque para saldo vendável Bling;
4. remoção da dupla reserva/baixa local;
5. early-order Bling em canário;
6. canário ponta a ponta com reserva virtual, separação, Verificado, saída e baixa física;
7. somente após PASS, ativação controlada das flags de produção.

O roadmap completo contém os blocos seguintes: Separação/Checkout, Estoque operacional, Rota/Entrega/Pagamento, Fiscal/Financeiro, Compras/XML, PapoAI, Control Tower, Segurança e Cleanup.

## Continuidade do próximo bloco — 2026-09-25
O próximo bloco oficial permanece **Pedido + Estoque Bling**, seguindo exclusivamente o planejamento já registrado em `IMPLEMENTATION-ROADMAP.md`.

Regra reforçada:
- manter o padrão documental já existente nesta pasta;
- não criar documentos paralelos de planejamento sem necessidade;
- atualizar `HANDOFF.md` ao final de cada rodada relevante;
- atualizar `HOMOLOGATION-STATUS.md` quando um gate for testado/homologado;
- atualizar `IMPLEMENTATION-ROADMAP.md` somente quando houver mudança real de plano, ordem ou critério;
- registrar commits, migrations, versões, flags, testes, PASS/FAIL, rollback, pendências e próximo passo exato;
- nunca depender apenas do histórico do chat.

### Próximo passo exato
Seguir o **BLOCO A — Fechar pedido + estoque Bling** já existente no `IMPLEMENTATION-ROADMAP.md`, começando por **A1 — Atualizar documentação e baseline**, sem criar uma estrutura documental nova.


## BLOCO A — A1 baseline atualizado — 2026-09-25

Rodada executada somente em leitura/documentação. Nenhuma flag, estoque, pedido ou runtime foi alterado.

### GitHub
HEAD observado antes deste checkpoint: `c538766a`.
Último commit funcional do Operations 2.0 antes das atualizações documentais: `af5fbc25` — homologação de lançamento/estorno físico de pedido.

### Runtime Supabase/Bling
- projeto canônico: `ssbesxgaijknwsjbsbcz`;
- `mode=homologation`;
- `hub_enabled=false`;
- `webhooks_enabled=false`;
- `ops2_direct_order_state_enabled=false`;
- `stock_authority=legacy_shadow`;
- `stock_cutover_at=null`;
- physical stock gate: `verified`;
- webhook gate: `real_delivery_verified`;
- stock mirror gate: `verified`.

Versões observadas:
- `admin-service-intelligence-v1` v154;
- `admin-products-live-v1` v36;
- `storefront-v2` v16;
- `papo-external-agent-v1` v107.

### Baseline do estoque vendável
- produtos ativos: 1.634;
- prontos no mirror Bling: 1.630;
- não prontos: 4;
- iguais legado x Bling: 1.087;
- divergentes: 543;
- legado positivo / Bling zero: 11;
- legado zero / Bling positivo: 3;
- última observação do mirror no baseline: 2026-09-25T22:47:21Z.

### 4 produtos ativos sem mirror Bling
1. Desodorante antitranspirante roll-on NIVEA Dry Comfort Feminino — GTIN `4005808257584` — estoque local 3 — WhatsApp inativo.
2. Flocão de Milho Urbano 500 g — GTIN `787896038300136` — estoque local 3 — WhatsApp inativo.
3. Gel Dental Infantil Avengers Kids+ Morango Condor 50 g — GTIN `7891055394878` — estoque local 3 — WhatsApp inativo.
4. Papel Higiênico Branquíssimo e Fofíssimo Folha Simples Personal 16 rolos — SKU/GTIN `7896110005874` — estoque local 10 — **WhatsApp ativo**.

### Evidência / gate
A1 baseline documental: **PASS**.
Nenhuma tentativa de corrigir vínculo foi feita nesta rodada.

### Observação técnica
A consulta inicial tratou `status_updates_enabled` como coluna física, mas o runtime atual não possui essa coluna; esse estado deve ser lido do metadata/estrutura correspondente. Nenhuma alteração resultou dessa consulta.

### Rollback
Não aplicável: rodada sem escrita em produção.

### Próximo passo exato
Continuar o BLOCO A com **A2 — Resolver cobertura do catálogo** do `IMPLEMENTATION-ROADMAP.md`.
Primeiro investigar deterministicamente os quatro produtos acima no catálogo Bling. Não criar vínculo aproximado. O produto Personal 16 rolos merece prioridade porque ainda está ativo no canal. Se não houver identidade exata comprovável, bloquear da venda antes do futuro cutover.


## BLOCO A — A2 cobertura do catálogo — investigação — 2026-09-25

Continuação executada sem criar vínculo aproximado e sem alterar flags de produção.

### Resultado
Os quatro produtos ativos fora do mirror continuam sem `bling_product_id` também na visão fiscal `product_fiscal_bling_diff_v1`. O banco local ainda não contém evidência suficiente para afirmar uma identidade Bling exata para nenhum deles.

### Decisão de segurança
Nenhum vínculo foi criado. A regra A2 exige identidade determinística por GTIN/SKU/ID confirmado; nome semelhante não é suficiente. O item Personal 16 rolos permanece como prioridade porque no baseline foi observado ativo no canal.

### Gate
A2: **EM ANDAMENTO / BLOQUEADO PARA VÍNCULO** até consulta exata ao catálogo Bling ou bloqueio comercial comprovado dos itens sem fonte de saldo.

### Flags
Sem alteração:
- `ops2_direct_order_state_enabled=false`;
- `stock_authority=legacy_shadow`;
- `stock_cutover_at=null`.

### Próximo passo exato
Usar a integração Bling já existente para consultar os quatro identificadores diretamente no catálogo ERP. Vincular somente correspondências exatas. Para qualquer item sem correspondência inequívoca, bloquear da venda antes do cutover de leitura de estoque. Depois reexecutar `get_ops2_sellable_stock_status_v1()` e exigir cobertura segura antes de avançar ao cutover.


## BLOCO A — A2 rodada pequena: caminho oficial de consulta Bling — 2026-09-25

### Escopo
Somente localizar e validar o mecanismo já existente no código para consulta determinística de produto no Bling. Nenhuma escrita de produto, vínculo, estoque ou flag nesta rodada.

### Evidência
O caminho já existe em `supabase/functions/purchase-xml-v1/index.ts`, função `remoteProductByGtin`:
- consulta `GET /produtos` com `gtins[]`;
- normaliza e compara o GTIN retornado;
- aceita somente uma correspondência exata;
- se houver mais de uma correspondência exata, gera `multiple_bling_gtin`.

A função `ensureProduct` já utiliza esse mecanismo antes de qualquer criação/vínculo e também rejeita conflito entre `local.bling_product_id` e o produto encontrado por GTIN.

### Gate
A2 / mecanismo de identificação: **PASS**.
O projeto já possui regra adequada para identidade determinística; não é necessário inventar novo mecanismo.

### Alterações de produção
Nenhuma.

### Próximo passo exato
Em uma nova rodada pequena, reutilizar esse caminho já existente em modo somente consulta para os quatro GTINs pendentes. Registrar os resultados exatos antes de qualquer vínculo ou bloqueio comercial.


## BLOCO A — A2 cobertura do catálogo concluída — 2026-09-25

### Evidência final
O read model `ops2_sellable_stock_v1` mostrou os quatro produtos pendentes com:
- `bling_product_id=null`;
- `link_status=not_found`;
- `bling_stock_ready=false`;
- `stock_source_reason=unlinked`.

Isso confirma que o mecanismo determinístico de matching já os procurou sem encontrar correspondência Bling segura.

### Ação
Os quatro produtos foram desativados comercialmente com `is_active=false` e `is_whatsapp_active=false`. Cadastro e estoque histórico foram preservados; nenhum produto foi apagado e nenhum vínculo artificial foi criado.

Produtos desativados:
- NIVEA Dry Comfort Feminino — GTIN 4005808257584 — estoque local preservado 3;
- Flocão de Milho Urbano 500 g — GTIN 787896038300136 — estoque local preservado 3;
- Gel Dental Infantil Avengers Kids+ 50 g — GTIN 7891055394878 — estoque local preservado 3;
- Papel Higiênico Personal 16 rolos — GTIN 7896110005874 — estoque local preservado 10.

### Revalidação
Após a ação:
- produtos ativos: 1.630;
- `active_bling_ready=1630`;
- `active_not_ready=0`;
- `stock_authority=legacy_shadow`;
- `stock_cutover_at=null`;
- divergências legado x Bling permanecem 543 e serão tratadas no gate apropriado, sem cópia cega de saldos.

### Gate
**A2 — PASS.**
100% do catálogo ativo restante possui cobertura segura do mirror Bling.

### Rollback
Os quatro cadastros permanecem intactos e podem ser reativados após vínculo Bling determinístico e mirror válido. Não restaurar venda antes disso.

### Próximo passo exato
Avançar para o próximo gate do BLOCO A no `IMPLEMENTATION-ROADMAP.md`: preparar e validar o cutover da **leitura de estoque** para `ops2_sellable_stock_v1`, ainda sem ligar globalmente `stock_authority=bling`. Mapear primeiro todos os consumidores de `products.stock` no site/checkout/admin para evitar fonte dupla.


## BLOCO A — cutover de leitura: mapeamento de dependências — 2026-09-25

### Escopo
Rodada média de preparação. Nenhuma mudança de `stock_authority` e nenhum cutover global.

### Dependências encontradas
O estoque legado ainda participa diretamente de pontos críticos:
- `storefront-v2`: listagem de ofertas e detalhe de produto consultam `products.stock`;
- `create_vitrine_cart_order_v1`: disponibilidade de produto, limite de componente de cesta e validação final de demanda usam `products.stock`;
- `reserve_vitrine_order_stock_v1`: calcula disponibilidade sobre `products.stock` menos reservas locais;
- `consume_vitrine_order_stock_v1` e `release_vitrine_order_stock_v1`: ainda pertencem ao ciclo legado de baixa/restauração;
- `admin-products-live-v1`: exibe e permite editar `products.stock`, portanto deve permanecer tratado como interface transitória até o gate de estoque operacional.

### Evidência
No banco atual, as quatro funções `create_vitrine_cart_order_v1`, `reserve_vitrine_order_stock_v1`, `consume_vitrine_order_stock_v1` e `release_vitrine_order_stock_v1` ainda contêm dependência direta de estoque legado.

### Decisão
Não alterar somente a vitrine isoladamente. O próximo patch deve manter catálogo + criação do pedido + validação de demanda coerentes com `ops2_sellable_stock_v1`. Reserva/consumo/release legado será desligado no gate específico de dupla reserva/baixa, não misturado silenciosamente nesta etapa.

Enquanto `stock_authority=legacy_shadow`, o read model devolve o mesmo saldo legado, permitindo implantar a troca de leitura sem alterar a autoridade real.

### Gate
Mapeamento de consumidores críticos: **PASS**.
Cutover de leitura: **AINDA NÃO EXECUTADO**.

### Próximo passo exato
Implementar uma migration versionada para fazer `create_vitrine_cart_order_v1` validar disponibilidade e limites através de `ops2_sellable_stock_v1.effective_sellable_stock`; em seguida adaptar `storefront-v2` para a mesma fonte. Manter `stock_authority=legacy_shadow`, executar smoke tests de produto simples, cesta e insuficiência, e só então avaliar o canário de autoridade Bling.


## BLOCO A — leitura de estoque / storefront — 2026-09-25

### Implementação
`storefront-v2` foi migrado para consultar `ops2_sellable_stock_v1.effective_sellable_stock` nos pontos públicos de disponibilidade:
- ofertas;
- lista de produtos;
- detalhe do produto;
- composição de cesta;
- cotação de cesta.

A leitura de `vitrine_stock_reservations` foi removida desses caminhos públicos para evitar descontar duas vezes quando a autoridade passar a ser o saldo virtual Bling.

### Deploy
- `storefront-v2` publicado como **v17**;
- commits de código: `7d02b300`, `fdbd3bd8`, `b0e92966`.

### Segurança do rollout
`stock_authority` continua `legacy_shadow`. Portanto, `effective_sellable_stock` ainda resolve para `products.stock`; a mudança desta rodada centraliza a leitura sem mudar a autoridade efetiva do saldo.

### Validação
- filtros diretos `.gt("stock",0)` removidos do storefront;
- chamadas de `reservedMap` removidas do storefront;
- catálogo ativo continua com cobertura Bling completa: 1.630/1.630, conforme gate A2.

### Pendente nesta etapa
O motor SQL `create_vitrine_cart_order_v1` ainda valida `products.stock` diretamente. Reserva/consumo/release locais também continuam legados. Não ativar `stock_authority=bling` antes de corrigir o motor e separar o gate de dupla reserva/baixa.

### Gate
Storefront read-model rollout: **PASS em legacy_shadow**.
Cutover global: **NÃO AUTORIZADO AINDA**.

### Rollback
Reimplantar `storefront-v2` v16 se houver regressão de apresentação. Nenhuma alteração de saldo ou autoridade foi feita nesta rodada.

### Próximo passo exato
Criar migration versionada para `create_vitrine_cart_order_v1` validar disponibilidade/limites/demanda via `ops2_sellable_stock_v1.effective_sellable_stock`; aplicar com `legacy_shadow`; executar smoke tests transacionais sem deixar pedido de teste persistido. Depois tratar reserva/consumo/release local no gate seguinte.


## BLOCO A — motor de pedido no read model de estoque — 2026-09-25

### Implementação
`create_vitrine_cart_order_v1` passou a usar `ops2_sellable_stock_v1.effective_sellable_stock` para:
- disponibilidade inicial de produto;
- limite automático de quantidade em componente de cesta;
- validação final da demanda agregada.

O lock de produto permanece antes da validação final para preservar serialização do fluxo atual.

Migration versionada:
- `supabase/sql/20260925_ops2_order_sellable_stock_read_v1.sql`;
- commit `1276debb`.

### Estado de rollout
- `stock_authority=legacy_shadow`;
- equivalência observada: **1.630/1.630** produtos ativos com `legacy_stock = effective_sellable_stock`;
- nenhuma ativação global Bling nesta rodada.

### Smoke tests
1. Produto simples com saldo 1 e pedido de 1 unidade: **PASS**.
2. Mesmo produto com pedido de 2 unidades: **PASS**, rejeitado com `insufficient_stock`.
3. Cesta real `Grande Koblenz`, 27 componentes: **PASS**.
4. Todos os testes de criação foram executados em transação com rollback; `leaked_test_orders=0`.

### Gate
Motor de criação/validação no read model: **PASS em legacy_shadow**.

### Rollback
A definição anterior permanece recuperável pelo histórico/migrations e commits. Como a autoridade continua legado, não houve alteração de saldo. Em regressão, restaurar a definição anterior de `create_vitrine_cart_order_v1`.

### Próximo passo exato
Tratar `reserve_vitrine_order_stock_v1`, `consume_vitrine_order_stock_v1` e `release_vitrine_order_stock_v1` para impedir dupla reserva/baixa quando `stock_authority=bling`. Não ativar Bling como autoridade até esse gate passar.


## BLOCO A — guard contra dupla reserva/baixa local — 2026-09-25

### Implementação
As funções legadas receberam guard explícito por `ops2_stock_authority`:
- `reserve_vitrine_order_stock_v1`: em autoridade `bling`, retorna `local_reservation_skipped=true`;
- `consume_vitrine_order_stock_v1`: em autoridade `bling`, retorna `local_consume_skipped=true` e não baixa `products.stock`;
- `release_vitrine_order_stock_v1`: em autoridade `bling`, retorna `local_release_skipped=true` e não restaura `products.stock`.

Em `legacy_shadow`, o comportamento anterior é preservado.

Migration:
- `supabase/sql/20260925_ops2_disable_legacy_stock_mutations_on_bling_v1.sql`;
- commit `2ebff6d8`.

### Teste do modo Bling
Foi feita simulação transacional alterando temporariamente `ops2_stock_authority=bling` e executando as três funções. Assertions confirmaram os três retornos de skip. A transação foi revertida e a autoridade final confirmada como `legacy_shadow`.

### Ocorrência de teste e recuperação
Uma chamada adicional em `legacy_shadow` usou um pedido existente apenas para validar o caminho legado e renovou `updated_at/expires_at` de 15 reservas. Não houve consumo/baixa de estoque nem mudança de status do pedido. Os 15 registros foram restaurados imediatamente para:
- `updated_at = created_at = 2026-09-25 16:31:16.625974+00`;
- `expires_at = created_at + 2h = 2026-09-25 18:31:16.625974+00`.
Não reutilizar pedidos reais para testes futuros.

### Gate
Guard de dupla reserva/baixa local: **PASS**.
Autoridade Bling continua **não ativada**.

### Próximo passo exato
Revisar os chamadores `storefront-v2` e `admin-products-live-v1` para que mensagens/eventos não afirmem “estoque local consumido” quando o retorno for `bling_authority`. Depois executar canário controlado de leitura com `stock_authority=bling` sem ativar ainda o fluxo geral de pedidos.


## BLOCO A — canário de leitura Bling + semântica do Admin — 2026-09-25

### Admin
`admin-products-live-v1` foi ajustado para reconhecer o retorno `bling_authority` de `consume_vitrine_order_stock_v1`. Sob autoridade Bling:
- não registra falsamente “estoque local consumido”;
- evento informa que nenhuma baixa local foi executada;
- retorno expõe `stock_status=bling_authority` e `local_consume_skipped=true`.

Deploy:
- `admin-products-live-v1` **v37**;
- commit `bec25a53`.

### Canário somente leitura
Foi feita simulação transacional de `ops2_stock_authority=bling`, sem pedido e sem movimentação, usando produtos deliberadamente divergentes. O read model passou a devolver exatamente `sellable_virtual`:
- Desinfetante Desaflora: legado 50 -> Bling 364;
- Papel Higiênico Soberano 4 rolos: legado 3 -> Bling 300;
- Arroz Koblenz 5 kg: legado 101 -> Bling 265.

Assertions: **PASS**.
Rollback executado; autoridade final confirmada `legacy_shadow`.

### Barreira encontrada antes do cutover
Entre 1.630 produtos ativos/cobertos:
- 1.087 saldos iguais;
- 543 divergentes;
- 51 com Bling >= 5x o legado;
- 6 com legado >= 5x o Bling;
- 11 com legado positivo e Bling zero;
- 3 com legado zero e Bling positivo.

Essas diferenças tornam inseguro ativar `stock_authority=bling` globalmente sem reconciliação. Parte pode representar conversão caixa->unidade/cadastro histórico e deve ser comprovada, não normalizada por heurística.

### Gate
Canário técnico de troca da fonte de leitura: **PASS**.
Cutover global: **BLOQUEADO por reconciliação de 543 divergências**.

### Próximo passo exato
Classificar as 543 divergências por risco e causa provável, começando pelos 71 casos extremos/zero (51 >=5x Bling, 6 >=5x legado, 11 local>0/Bling=0, 3 local=0/Bling>0; grupos podem se sobrepor). Cruzar GTIN/SKU, bindings, embalagem/conversão e dados de compra/XML existentes. Não corrigir saldos automaticamente. Produzir lote determinístico de reconciliação e só depois considerar canário real de autoridade.


## BLOCO A — reconciliação de estoque por risco — 2026-09-25

### Priorização escolhida
A reconciliação começou pelos casos de maior risco comercial:
1. local > 0 e Bling = 0;
2. local = 0 e Bling > 0;
3. razões extremas >=5x;
4. demais diferenças.

### Evidência dos 14 casos de cruzamento por zero
Foram encontrados:
- 11 produtos com estoque local positivo e saldo Bling físico/virtual zero;
- desses 11, **9 possuem verificação física local recente** e **2 não possuem**;
- 3 produtos com local zero e Bling físico/virtual = 1;
- os 3 do sentido inverso **não possuem verificação física local**;
- nenhum dos 14 possui histórico de compra/conversão já consolidado em `product_purchase_history` ou `product_supplier_packaging`.

Conclusão operacional:
- os 9 `local>0 / Bling=0` com verificação física são forte candidato a saldo inicial/movimentação ausente no Bling, mas ainda não foram corrigidos automaticamente;
- os 2 `local>0 / Bling=0` sem verificação exigem nova contagem antes de qualquer ajuste;
- os 3 `local=0 / Bling>0` exigem contagem física antes do cutover.

### Novo read model
Criada a view read-only `ops2_stock_reconciliation_v1`, com `security_invoker=true`, sem acesso anon/authenticated e leitura apenas via service_role.

Classificação atual das 543 divergências:
- 472 `quantity_difference`;
- 51 `bling_extreme_high`;
- 9 `bling_zero_local_verified`;
- 6 `legacy_extreme_high`;
- 3 `local_zero_recount_required`;
- 2 `bling_zero_recount_required`.

Migration:
- `supabase/sql/20260925_ops2_stock_reconciliation_read_model_v1.sql`;
- commit `fed9ce65`.

### Segurança
Advisors executados após DDL. Nenhuma nova finding específica da view apareceu. Permanecem avisos históricos do projeto (RLS sem policy em tabelas internas, índices não usados e 4 FKs sem índice), não tratados nesta rodada para evitar misturar escopo.

### Gate
Classificação determinística da fila de reconciliação: **PASS**.
Alteração automática de saldos: **NÃO EXECUTADA**.
Cutover Bling: **continua bloqueado**.

### Próximo passo exato
Tratar primeiro os 9 `bling_zero_local_verified`: confirmar que os vínculos GTIN/SKU estão corretos e preparar ajuste controlado do saldo físico no depósito Geral do Bling com base na última contagem física local, um lote pequeno por vez e com snapshot/rollback. Depois recontar fisicamente os 5 casos sem evidência local suficiente (2 local>0/Bling=0 e 3 local=0/Bling>0).


## BLOCO A — gate de regularização antes do canário de escrita — 2026-09-25

### Decisão de segurança operacional/fiscal
Antes de executar POST `/estoques` com operação `B`, o código atual do Hub e o draft canônico de balanço foram revisados.

O Hub já suporta:
- leitura de saldo Bling por produto/depósito;
- POST `/estoques` com `operacao=B`;
- depósito Geral resolvido;
- leitura pós-escrita e verificação exata do target;
- tratamento de entrega incerta sem repetição cega.

Porém, `INVENTORY-COUNT-BALANCE-DRAFT.md` registra a regra revisada: **contagem física != regularização automática**. Divergência precisa de causa antes de virar saldo fiscal/ERP.

As 9 evidências locais anteriormente classificadas como “verificadas” têm datas entre 07/09 e 18/09/2026. Em 25/09 elas não são prova suficiente do saldo físico atual. Portanto **nenhum POST de balanço foi feito nesta rodada**.

### Fila operacional criada
Foram abertas 14 atenções idempotentes em `ops_attention`:
- 9 prioridade `high`: local > 0 / Bling = 0 com verificação histórica;
- 2 prioridade normal: local > 0 / Bling = 0 sem verificação;
- 3 prioridade normal: local = 0 / Bling > 0 sem verificação.

Cada atenção contém GTIN, SKU, Bling product id, saldo legado, físico/virtual Bling, data da verificação anterior e `automatic_stock_write=false`.

### Gate
Canário de escrita de saldo: **ADIADO CORRETAMENTE / BLOQUEADO por recontagem física atual e classificação da causa**.
Nenhum saldo Bling ou local foi alterado.

### Próximo passo exato
Integrar essa fila à ferramenta Balanço/Estoque Mobile para que o operador leia os 14 EANs e registre a quantidade física atual. Para cada diferença:
1. quantidade física = Bling -> resolver atenção sem escrita;
2. quantidade física != Bling -> classificar origem documental/perda/sobra;
3. somente após classificação, executar regularização adequada no Bling;
4. revalidar espelho físico/virtual e fechar o blocker.


## BLOCO A — fila de recontagem integrada ao Estoque Mobile — 2026-09-25

### Implementado
- RPC read-only `get_ops_stock_recount_queue_v1()`;
- RPC interna `ops_apply_stock_recount_result_v1(...)`;
- nova ação autenticada `stock_recount_queue` no `admin-products-live-v1`;
- `admin-products-live-v1` publicado em **v39**;
- Balanço/Estoque Mobile ganhou seção **Recontagem para Bling** antes das faltas de pedidos;
- lista mostra prioridade, EAN, saldo local, físico Bling e virtual Bling;
- botão **Contar** carrega o item no leitor/teclado já existente;
- após uma contagem, a fila é recarregada.

### Regra de segurança
A recontagem **não escreve estoque no Bling**.
- se a quantidade física atual coincidir com o físico Bling, o blocker é resolvido sem escrita ERP;
- se diferir, a atenção permanece aberta e exige classificação da causa antes de regularização;
- `automatic_stock_write=false` permanece explícito.

### Evidência
- fila: 14 itens = 9 high + 5 normal;
- permissões RPC: anon=false, authenticated=false, service_role=true;
- teste transacional/rollback não deixou alteração: fila continuou em 14;
- nenhum POST de estoque Bling executado.

### Código
- `45281ee8` — read model da fila;
- `502dfe99` — rota da fila no Admin;
- `79a7cca8` — interface Estoque Mobile;
- `fe4d28d1` — aplicar resultado da recontagem;
- `b5efb401` — persistir SQL canônico.

### Próximo passo exato
Executar as 14 recontagens físicas no Estoque Mobile. A programação seguinte deve tratar somente os itens cuja nova contagem ainda divergir do físico Bling, exigindo causa antes de qualquer movimento/regularização oficial.


## BLOCO A — classificação obrigatória de divergência de estoque — 2026-09-25

### Implementado
- tabela auditável `ops_stock_reconciliation_reviews` com RLS e acesso direto revogado;
- divergência após recontagem cria revisão `classification_required`;
- causas permitidas: entrada documentada, perda/avaria/vencimento, erro de contagem, movimento ERP faltante, sobra sem origem ou outro;
- nota de causa obrigatória; referência de evidência opcional;
- classificação muda somente para `ready_for_erp_review`;
- não existe nesta etapa rotina automática de ajuste de saldo Bling;
- `automatic_stock_write=false` persistido na revisão e na atenção;
- gateway `admin-products-live-v1` publicado em **v40** com ação autenticada `stock_reconciliation_classify`.

### Evidência
- blockers físicos continuam 14, pois nenhuma contagem real foi inventada;
- reviews atuais = 0, como esperado antes das recontagens;
- RPC de classificação: anon=false, authenticated=false, service_role=true;
- advisor de segurança executado; a nova tabela aparece com RLS sem policy, coerente com o padrão interno service-role-only. O advisor também mantém avisos preexistentes do projeto, incluindo leaked-password protection desabilitada; não foi alterado nesta rodada.

### Código
- `4aa1c672` — gateway de classificação;
- `c869f42b` — persistência do gate SQL.

### Próximo passo exato
Aguardar/executar as 14 contagens físicas. Para cada divergência real, usar a classificação obrigatória. Só depois projetar/executar o movimento Bling correspondente, com revisão humana e evidência.


## BLOCO A — pré-cutover amplo de estoque Bling — 2026-09-25

### Gate determinístico
Criada `get_ops2_stock_cutover_preflight_v1()`, read-only e restrita a service_role.
Migration: `supabase/sql/20260925_ops2_stock_cutover_preflight_v1.sql`.
Commit: `810e9e9f`.

Estado medido:
- authority: `legacy_shadow`;
- depósito selecionado: Geral / 14887252169;
- ativos: 1630;
- ativos sem Bling stock ready: 0;
- mirror gate: verified;
- physical stock gate: verified;
- controles físicos `review_required`: 0;
- reservas locais **vivas**: 0;
- reservas locais expiradas históricas: 15 linhas de 1 pedido `storefront_received`; expiração 25/09 18:31 UTC; não entram mais no cálculo de disponibilidade e não bloqueiam o cutover;
- blockers de recontagem: 14;
- resultado preflight: `ready=false`, único motivo: `physical_recount_pending`.

### Validação dos 14 blockers
- 14/14 `bling_stock_ready=true`;
- 14 Bling product ids distintos;
- 0 GTIN ausente;
- 0 mirrors com mais de 24h na medição;
- nenhuma vinculação foi inventada ou alterada.

### Gate reserve/consume/release
As funções legadas já possuem branch explícito para `ops2_stock_authority=bling`.
Foi executado teste isolado em subtransação com rollback:
- reserve -> `local_reservation_skipped=true`;
- consume -> `local_consume_skipped=true`;
- release -> `local_release_skipped=true`, `restored_physical_stock=false`;
- hash completo de `products.stock`: inalterado;
- hash completo de `vitrine_stock_reservations`: inalterado;
- authority após rollback: `legacy_shadow`.
A função temporária de teste foi removida após a prova.

Conclusão: quando Bling virar autoridade, essas três rotinas não fazem dupla reserva nem baixa/restauração local.

### Segurança
`get_ops2_stock_cutover_preflight_v1`: anon=false, authenticated=false, service_role=true.
Advisor executado. Nenhuma nova exposição executável anon/authenticated foi criada. Avisos históricos do projeto permanecem fora deste escopo.

### Gate desta rodada
Compatibilidade de reserve/consume/release com autoridade Bling: **PASS**.
Pré-cutover técnico: **PASS exceto evidência física**.
Cutover: **NÃO EXECUTADO**.
Único blocker determinístico atual: **14 recontagens físicas**.

### Próximo passo exato
Realizar as 14 recontagens no Estoque Mobile. Se todas coincidirem com Bling, o preflight deve ficar `ready=true`. As que divergirem entram no gate de causa já implementado; somente depois de regularização controlada e revalidação o primeiro canário real de `ops2_stock_authority=bling` poderá ser executado.


## BLOCO A — hardening final antes da contagem física — 2026-09-25

### Inventory Mobile corrigido para a futura autoridade Bling
Foi identificado e corrigido um risco pré-cutover: `ops_record_inventory_count_v1` ainda escrevia `products.stock` incondicionalmente.
Agora:
- em `legacy_shadow`, preserva o comportamento atual;
- em `bling`, registra contagem/evidência e marca verificação física, mas `local_stock_applied=false` e NÃO altera `products.stock`;
- `ops_apply_stock_recount_result_v1` deixou de comparar a contagem com o snapshot antigo da pendência e passa a buscar `sellable_physical` atual em `ops2_sellable_stock_v1`;
- se o saldo Bling atual não estiver disponível, a pendência permanece aberta e falha fechada.

Teste em subtransação/rollback sob `ops2_stock_authority=bling`:
- produto blocker com local=5 e Bling físico=0;
- contagem simulada=0;
- retorno `local_stock_applied=false`;
- `products.stock` antes=5 e depois=5;
- zero contagens/reviews de teste vazaram;
- autoridade após rollback=`legacy_shadow`.
Checkpoint: `5510b95d`.

### Ativação protegida + rollback
Criadas funções internas service_role-only:
- `ops2_activate_bling_stock_authority_v1()`: só ativa se `get_ops2_stock_cutover_preflight_v1().ready=true`; grava timestamp de cutover;
- `ops2_rollback_bling_stock_authority_v1(reason)`: volta para `legacy_shadow` e exige motivo, registrando timestamp/motivo.
Commit: `3a514fb0`.

Teste negativo executado agora: tentativa de ativação foi corretamente recusada com `stock_cutover_preflight_failed`, mantendo `legacy_shadow`, porque existem 14 recontagens físicas abertas.
Permissões confirmadas: anon/authenticated sem EXECUTE; service_role com EXECUTE.

### Estado
Não houve cutover. Nenhum saldo real foi alterado nesta rodada.
O único blocker do preflight continua sendo `physical_recount_pending=14`.


## BLOCO A — canário operacional + auditoria ampla de escritores de estoque — 2026-09-25

### Auditoria ampla
Busca em código + funções PostgreSQL identificou dois escritores locais adicionais que precisavam de proteção para a futura autoridade Bling:
1. `ops_record_inventory_incident_v1` — avaria/vencido/perda;
2. `apply_purchase_stock_receipt_v1` — recebimento de XML de compra.

Correções live:
- incidentes sob `stock_authority=bling` continuam registrados/auditados, mas `local_stock_applied=false`, delta local=0 e seguem para reconciliação/movimento oficial no Bling;
- recebimento XML sob autoridade Bling agora falha fechado com `bling_stock_authority_requires_erp_receipt`, não escreve `products.stock` e registra auditoria;
- comportamento `legacy_shadow` preservado.
Teste de incidente em subtransação/rollback: local antes=5/depois=5, `local_stock_applied=false`, zero resíduos. Não havia documento XML disponível no banco para um canário real de compra nesta medição; a proteção é anterior a qualquer escrita.
Commit: `1b379200`.

### Canário operacional preparado
Criada `ops2_stock_cutover_runs` (RLS, service-role-only) e funções:
- `ops2_prepare_stock_cutover_canary_v1()`;
- `ops2_check_stock_cutover_canary_v1(run_id)`.

Run preparado: `b22e416d-9b3d-432c-b76a-7a7ebcbf2b17`.
Resultado atual:
- ready=false;
- authority=legacy_shadow;
- blockers=14 physical recount;
- bad active stock rows=0;
- mirrors >24h=0;
- physical review required=0.
O check só considera saudável autoridade Bling + zero blockers/reviews/linhas ruins/mirror antigo.
Commit: `0cf4cc76`.

### Admin
`admin-products-live-v1` v41 expõe GET autenticado `stock_cutover_preflight` para visibilidade operacional, sem endpoint de ativação pública.
Commit: `c2c1f0d6`.

### Segurança
Advisors executados. Nova tabela usa RLS sem policy e grants diretos anon/authenticated revogados, seguindo o padrão interno service-role-only. Permanecem avisos históricos do projeto fora desta rodada.

### Estado final
- Nenhum cutover executado;
- nenhum saldo real alterado;
- authority=`legacy_shadow`;
- único blocker do preflight: 14 recontagens físicas.


## BLOCO A — gate de integridade de entradas/saídas de estoque — 2026-09-25

Revisão transversal executada em funções PostgreSQL, triggers e Edge Functions para todos os caminhos conhecidos que podem alterar disponibilidade/saldo.

### Escritores mapeados e protegidos
- pedido: reserve/consume/release — já guardados;
- balanço: `ops_record_inventory_count_v1` — já guardado;
- avaria/vencido/perda: `ops_record_inventory_incident_v1` — guardado;
- compra/XML: `apply_purchase_stock_receipt_v1` — fail-closed sob Bling;
- Admin product_save — corrigido para não sobrescrever `products.stock` ao editar produto sob Bling;
- Admin expiry reconcile/expiration_save — corrigido para não zerar `products.stock` sob Bling;
- trigger `enforce_zero_stock_inactive` — corrigido para não desativar produto por saldo legado <=0 sob Bling.

O trigger foi testado em subtransação: estoque foi temporariamente zerado com autoridade Bling, produto não foi desativado e rollback restaurou saldo original=1.

Admin atualizado/deploy: `admin-products-live-v1` v42.
Commits Admin: `85fb8f39`, `093a98f5`.

### Gate permanente
Runtime ganhou `ops2_stock_writer_guard.state=verified` com escopo explícito dos sete caminhos acima.
`get_ops2_stock_cutover_preflight_v1` agora exige também `writer_guard_verified=true`; se o gate deixar de estar verificado, cutover fica bloqueado automaticamente.
Preflight atual:
- writer_guard_verified=true;
- active_not_bling_ready=0;
- live local reservations=0;
- physical review required=0;
- único blocking_reason=`physical_recount_pending` (14).

Commit do gate: `606d79ed`.

### Observação arquitetural
A rotina antiga de validade ainda trabalha com `products.validity_date`/ativação de produto. A escrita de saldo foi neutralizada, portanto não contorna a autoridade Bling. A substituição definitiva da lógica de validade por lotes/FEFO do Bling permanece uma etapa própria e não é necessária para inventar saldo no cutover.

Estado final: `legacy_shadow`; nenhum saldo real alterado.


## BLOCO B — separação com conferência obrigatória por EAN — 2026-09-25

### Problema fechado
A tela Tablet Separação permitia `processing -> ready` pelo botão SEPARADO sem conferência unitária. Isso foi removido do caminho da tela.

### Implementação
Criadas tabelas internas auditáveis:
- `ops_order_check_sessions`;
- `ops_order_check_items`.
RLS habilitado, acesso direto anon/authenticated revogado; RPCs service-role-only:
- `ops_start_order_check_v1`;
- `ops_scan_order_check_v1`;
- `ops_get_order_check_v1`;
- `ops_finish_order_check_v1`.

Regras:
- só inicia com pedido em `processing`;
- snapshot consolida quantidade esperada por produto + EAN;
- EAN fora do pedido é rejeitado;
- quantidade acima da esperada é rejeitada;
- conclusão é rejeitada enquanto existir item incompleto;
- somente após conferência exata o gateway muda pedido para `ready`;
- evento `order.check_verified` é auditado.

Admin:
- Tablet Separação agora mostra **CONFERIR**;
- diálogo mobile recebe leitor/entrada EAN, mostra conferido/esperado e mantém foco;
- botão de conclusão só aparece habilitado quando a sessão está completa;
- `admin-products-live-v1` publicado em **v43**.
Commits: gateway `4f7b099c`; UI `6f8dc369`; SQL checkpoint `84dee6dc`.

### Testes
Teste sintético dentro de transação/rollback:
- pedido processing com produto qty=2;
- sessão criada;
- primeira leitura -> 1/2;
- tentativa de concluir incompleta bloqueada;
- segunda leitura -> 2/2;
- conclusão -> verified=true;
- rollback;
- zero pedido/sessão de teste persistido.
Permissões RPC: anon/authenticated=false; service_role=true.
Advisor de segurança executado; novas tabelas aparecem como RLS sem policy, coerente com o padrão interno service-role-only.

### Limite desta rodada
Não foi feito canário em pedido real nem teste de hardware de leitor/tablet. Pedidos antigos não foram alterados.
Integração com o Checkout nativo do Bling continua como POC separado; o Admin agora já garante a regra mínima de conferência sem depender desse POC.

### Próximo passo
Fechar a proteção backend para impedir qualquer outro caminho `processing -> ready` sem sessão verificada e depois validar sincronização do estado Verificado com Bling em canário controlado.


## BLOCO B — backend fechado + preparação do Verificado Bling — 2026-09-25
- Regra permanente registrada no PROJECT-MASTER: sequência/prioridade/solução técnica ficam a cargo do executor.
- Criado trigger `trg_ops_enforce_order_check_before_ready_v1`: qualquer `processing -> ready` sem sessão EAN `verified` falha com `order_check_required_before_ready`.
- Teste transacional: bypass sem sessão bloqueado; com sessão verified permitido; rollback limpo.
- SQL canônico atualizado: `20260925_ops2_order_ean_check_v1.sql`, commit `a7d297f0`.
- Bling: confirmado no catálogo live que `Aprovado / Separar (915902) -> Verificado (24)` usa transição `504837240`, ativa e sem ações acopladas.
- `admin-service-intelligence-v1` ganhou suporte canário a target `verified`, mas exige pedido local `ready` + sessão EAN verificada antes de qualquer escrita externa.
- Hub publicado em **v155**; commit `d1d2f887`.
- Nenhum pedido real foi usado e nenhum status Bling foi alterado nesta rodada.
- `ops2_direct_order_state_enabled` continua fechado; integração automática continua deliberadamente OFF até canário controlado em pedido novo elegível.

### Próxima prioridade autônoma
Preparar o encadeamento idempotente pós-conferência para Bling Verificado em modo protegido, mantendo falha fechada e sem ativar rollout global; depois executar canário somente quando existir pedido novo elegível, nunca em pedido legado.


## BLOCO B — encadeamento protegido EAN -> Verificado Bling — 2026-09-25
- `order_check_finish` agora possui encadeamento pós-conferência para o Hub, porém protegido por flag própria `ops2_ean_verified_sync_enabled`.
- Flag criada explicitamente como **false**; publicar a versão não altera pedidos.
- Quando futuramente habilitada, a conclusão EAN monta snapshot canônico e solicita `ops2_ensure_order_state(target=verified)`.
- O Hub também revalida independentemente: pedido local precisa estar `ready` e possuir sessão `ops_order_check_sessions.status=verified` com `verified_at`.
- O caminho direto do Hub foi ampliado para `verified` e usa `mapping.verified_id=24`; a transição real conhecida é 915902 -> 24.
- Admin Edge publicado em **v44**, commit `4cf1fc48`.
- Hub publicado em **v156**, commit `11470a35`.
- Estado da flag: `ops2_ean_verified_sync_enabled=false`.
- Não há pedido novo em `processing` ou `ready` disponível para canário neste momento; nenhum pedido legado foi usado.
- Nenhuma escrita externa Bling executada nesta rodada.
- Preflight de estoque continua bloqueado somente por `physical_recount_pending`.
- Advisor de segurança executado: permanecem INFOs históricos de RLS sem policy no padrão interno service-role-only; nenhuma exposição pública nova foi criada.

### Próxima prioridade autônoma
Manter o sync EAN->Bling desligado até existir pedido novo elegível para canário. Enquanto isso, avançar o próximo elo que pode ser validado sem pedido real: gate pós-Verificado para fiscal/DANFE e expedição, sem emitir NF-e automaticamente antes da homologação fiscal.


## BLOCO C — gate fiscal de expedição fechado no banco — 2026-09-25
- Revisado fluxo existente Verificado/ready -> fiscal -> DANFE -> expedição.
- Configuração fiscal live permanece deliberadamente segura: `enabled=false`, `execution_mode=off`, `dispatch_gate_mode=enforce`, `require_fiscal_authorization_before_dispatch=true`, geração/autorização automáticas=false.
- O Admin já consultava `fiscal_dispatch_gate` antes de `ready -> out_for_delivery`, porém existia bypass possível por escrita direta no status.
- Criado trigger DB `trg_ops_enforce_fiscal_before_dispatch_v1` / função `ops_enforce_fiscal_before_dispatch_v1`.
- Invariante: `ready -> out_for_delivery` só é aceito quando `order_fiscal_controls.dispatch_fiscal_status in ('authorized','not_required')`.
- Teste sintético rollback: saída sem autorização bloqueada; controle `authorized` permite saída; zero resíduos.
- Migration canônica: `20260925_ops2_fiscal_dispatch_db_guard_v1.sql`, commit `4f56f20b`.
- Admin ganhou mensagens explícitas para bloqueio fiscal/DANFE e foi publicado em **v45**, commit `6f3e301d`.
- DANFE continua obtido do documento oficial Bling e só abre quando fiscal autorizado + chave de acesso válida.
- Nenhuma NF-e foi gerada/enviada nesta rodada; nenhuma escrita fiscal externa ocorreu.
- Advisor executado após DDL.

### Próxima prioridade autônoma
Consolidar o estado operacional pós-fiscal para que a fila de Expedição derive somente de pedidos `ready` + fiscal autorizado, e revisar o momento exato da baixa física/saída Bling para evitar dupla baixa entre Verificado, NF-e e saída para entrega. Depois seguir para Entregador/pagamento.


## BLOCO C — baixa física idempotente no ponto de expedição — 2026-09-25
- Auditada a sequência real `Verificado/ready -> fiscal -> baixa física -> out_for_delivery`.
- Confirmado que a baixa física Bling já tinha canário real homologado (28 linhas, lançamento/estorno restaurados), mas ainda não existia ação operacional ligada ao fluxo normal.
- Criada no Bling Hub a ação `ops2_launch_physical_stock`:
  - só opera quando `ops2_stock_authority='bling'`;
  - exige `ops2_physical_stock_gate.state='verified'`;
  - exige fiscal autorizado;
  - exige pedido local `ready`;
  - exige vínculo único com pedido Bling;
  - exige situação remota Bling `Verificado`;
  - usa `claim_bling_order_stock_action_v2` para idempotência;
  - executa `lancar-estoque/{depositId}` uma única vez;
  - comprova delta físico antes de marcar `launched`;
  - resultado incerto/falha vira `review_required` + atenção crítica e NÃO deve ser repetido automaticamente.
- Admin passa a chamar a baixa física antes de `ready -> out_for_delivery` somente sob autoridade Bling.
- O trigger DB de expedição foi reforçado: sob autoridade Bling, além do fiscal autorizado, exige `bling_order_stock_controls_v2.state='launched'`. Escrita direta no banco não contorna a baixa.
- Teste sintético transacional:
  - autoridade temporária Bling + fiscal autorizado + sem baixa física => bloqueio correto;
  - controle `launched` => transição para `out_for_delivery` aceita;
  - rollback completo; nenhum pedido/controle sintético persistiu.
- Estado real permanece seguro: autoridade continua `legacy_shadow`; portanto nenhuma baixa física real nova foi disparada nesta rodada.
- Commits:
  - `24a940e6` — ação operacional idempotente de baixa física no Hub;
  - `edc828f8` — Admin aciona baixa física no ponto de expedição quando autoridade=bling;
  - `605a6a55` — trigger DB exige baixa física lançada após cutover.
- Deploys:
  - `admin-service-intelligence-v1` **v157**;
  - `admin-products-live-v1` **v46**.
- O Hub v157 foi publicado com suas dependências compartilhadas existentes; nenhuma dependência foi removida para facilitar deploy.
- Security Advisor após DDL: somente achados históricos já conhecidos (RLS sem policy no modelo service-role interno e configuração histórica); nenhum novo bypass identificado nesta rodada.

### Sequência operacional consolidada
`Conferência EAN -> ready/Verificado -> NF-e autorizada -> baixa física Bling comprovada/idempotente -> out_for_delivery -> Entregador -> pagamento/entrega`.

### Próxima prioridade
Revisar e fechar o Entregador para que pagamento real, entrega e retorno físico respeitem essa sequência, incluindo split payment e impedimento de `delivered` sem pagamento capturado exato.


## BLOCO D — Entregador: pagamento obrigatório antes de concluir entrega — 2026-09-25/26
- Auditados pagamento efetivo, split payment, falha de entrega e retorno físico já existentes.
- Identificado que o Admin validava pagamento antes de `delivered`, porém faltava a mesma invariante diretamente no PostgreSQL.
- Criado trigger `trg_ops_enforce_delivery_payment_before_delivered_v1` / função `ops_enforce_delivery_payment_before_delivered_v1`.
- Regra DB para `out_for_delivery -> delivered`:
  - não pode existir retorno ativo `returning/returned_review`;
  - precisa existir exatamente um settlement válido de origem `delivery`;
  - settlement precisa estar `captured/synced/needs_review`;
  - `expected_total_cents == captured_total_cents == total do pedido`;
  - soma real de `order_payment_parts` também precisa ser exatamente o total.
- Isso protege inclusive escrita direta no banco, não apenas o Admin.
- Admin foi endurecido para aceitar `delivered` somente a partir de `out_for_delivery` e ganhou mensagem explícita para ausência de pagamento.
- Teste sintético rollback:
  - pedido R$100 sem pagamento -> `delivered` bloqueado;
  - split R$60 PIX + R$40 cartão -> captura aceita;
  - depois do split exato -> `delivered` permitido;
  - zero pedido/settlement/parts sintéticos persistidos.
- Fluxo de falha continua correto: `Não entregou` é recusado se pagamento já foi capturado; mercadoria em retorno não volta automaticamente ao estoque vendável.
- Migration: `supabase/sql/20260925_ops2_delivery_payment_db_guard_v1.sql`, commit `f96d1c37`.
- Admin commit `86f5b43b`; `admin-products-live-v1` publicado em **v47**.
- Security Advisor executado; permanecem achados históricos já conhecidos, sem nova exposição criada.

### Sequência consolidada até aqui
`Conferência EAN -> Verificado -> NF-e autorizada -> baixa física Bling comprovada -> out_for_delivery -> captura do pagamento real (1 ou split) -> delivered`.
Falha antes do pagamento segue para `delivery_return_cases`, sem restauração automática do estoque.

### Próxima prioridade autônoma
Fechar a consistência da parada/rota após `delivered` e preparar o vínculo do pagamento real com o financeiro do Bling em modo de homologação, sem sincronizar recebimento externo até a representação fiscal/financeira estar comprovada.


## BLOCO D — Pedido canônico ↔ parada/rota: sincronização DB — 2026-09-25/26
- Identificado que a Edge tentava sincronizar a parada após mudanças operacionais, mas o vínculo não era uma invariante do banco; outro writer poderia deixar pedido e rota divergentes.
- Criado trigger AFTER UPDATE `trg_ops_sync_delivery_stop_from_order_v1` em `orders.status`.
- Função `ops_sync_delivery_stop_from_order_trigger_v1` delega para o read/write model já existente `ops_sync_delivery_stop_v1`.
- Estados sincronizados: `out_for_delivery`, `delivered`, `ready`, `cancelled`.
- A função existente mantém `failed` protegido e conclui a rota quando não restam paradas abertas.
- Teste transacional PASS: pedido sintético em rota dispatched + pagamento exato -> pedido `delivered`, parada `delivered`, rota `completed`, `completed_at` preenchido.
- Tudo em rollback; nenhuma rota/pedido real alterado.
- SQL canônico: `supabase/sql/20260925_ops2_delivery_route_order_sync_guard_v1.sql`; commit `95e43c00`.
- Security Advisor: somente achados históricos já conhecidos (RLS/no-policy INFO e leaked-password protection WARN); nenhuma nova exposição identificada.

### Próxima prioridade autônoma
Modelar e provar em shadow a representação do recebimento real no Bling (inclusive split), sem POST financeiro real até a homologação determinar endpoints/contas/formas e idempotência/reconciliação.


## R1/12 — baseline do fechamento autônomo — 2026-09-26
- Novo plano de 12 rodadas longas aprovado e registrado no `IMPLEMENTATION-ROADMAP.md`.
- R1 toma como baseline os dois últimos gates homologados:
  - `out_for_delivery -> delivered` exige pagamento delivery capturado exato, inclusive split;
  - mudança do pedido sincroniza parada/rota no banco e pode concluir a rota quando não restam paradas abertas.
- Evidências já válidas desta base: testes sintéticos/rollback PASS, SQL canônico versionado e nenhum pedido real usado para mutação.
- A tentativa de uma consulta operacional agregada adicional via conector foi bloqueada pela camada de segurança da ferramenta; não houve contorno, repetição insegura nem escrita.
- Regra para R1–R12: dependências humanas não interrompem trabalho seguro; registrar e acumular para uma lista única ao final da R12.
- As próximas rodadas devem decidir tecnicamente a sequência interna, preservar gates fail-closed, não usar Make e não alterar pedidos legados.
- Plano canônico registrado no commit `35f9db13dd9ad91e5c2ca28b945184b464a4443a`.

### Próximo passo exato
R2: modelar/provar em shadow o recebimento real/split no Bling, com idempotência, reconciliação e anti-duplicidade, sem POST financeiro real não homologado.


## R2/12 — pagamento real/split -> Bling em shadow — 2026-09-26
- Runtime revalidado: leitura de contas a receber e contas financeiras do Bling respondeu HTTP 200.
- Não havia settlements reais persistidos; nenhum recebimento financeiro externo foi executado.
- Migration Supabase `ops2_payment_bling_shadow_v1` aplicada.
- Criados `ops_payment_bling_method_map_v1` e `ops_payment_bling_shadow_plans_v1`.
- `ops_prepare_delivery_payment_bling_shadow_v1` valida settlement/partes/total, gera fingerprint idempotente e plano por parte do split, sempre com `external_write=false` e `automatic_retry=false`.
- PIX, dinheiro, crédito, alimentação, refeição e outro começam `unmapped`; nenhum ID Bling foi inventado. O plano fica `blocked_mapping` até forma + conta + categoria serem comprovadas.
- `ops_payment_bling_shadow_status_v1` expõe readiness do shadow.
- Teste negativo com settlement inexistente PASS; 0 planos residuais. A ferramenta bloqueou o teste sintético que exigia INSERT de pedido e não houve contorno.
- Advisors pós-DDL executados; nenhum write financeiro Bling e nenhum uso de Make.

### Ações humanas acumuladas para pós-R12
1. Homologar IDs exatos no Bling de forma de pagamento + conta financeira + categoria para PIX, dinheiro, crédito, alimentação e refeição.
2. Depois da R12, executar canário financeiro real controlado somente após revisar a lista final.

### Próximo passo exato
R3: falha de entrega/retorno/reentrega/cancelamento, com reversões e proteção contra dupla restauração de estoque.


## Esteira autônoma de fechamento — R1/20 — 2026-09-27
O usuário autorizou 20 rodadas amplas autônomas, sem depender de escolhas técnicas humanas. R1 executada imediatamente; 19 execuções horárias subsequentes foram programadas. Cada rodada deve reler este HANDOFF, IMPLEMENTATION-ROADMAP.md, HOMOLOGATION-STATUS.md e o runtime real antes de agir.

### Baseline real na abertura
- Supabase canônico: ssbesxgaijknwsjbsbcz.
- catálogo baseline run: 9db0ee8c-6954-4b21-8a54-4a273a9ce069.
- 85 stock_update confirmados Supabase -> Bling.
- 454 stock_update ainda planejados.
- 86 restantes com delta absoluto 1.
- Hub: hub_enabled=false, mode=homologation, write_canary_limit=1.
- products/stock/customers/orders habilitados no domínio; webhooks_enabled=false; fiscal_enabled=false.
- crons antigos Bling Hub e fiscal AI inativos; purchase-xml-daily-v1 ativo.
- jobs atuais: 146 synced, 3 cancelled, 2 review_required históricos; nenhum pending/processing/retry aberto ao baseline.
- advisors: security apenas INFO rls_enabled_no_policy no desenho interno fechado; performance apenas unused_index INFO.

### Achado e correção R1
O canário anterior mostrou que um worker de estoque pode permanecer processing além da janela curta do orquestrador. A recuperação manual segura foi comprovada por leitura readonly do Bling antes do retry.
Nesta R1:
- admin-service-intelligence-v1 alterado para lease de stock worker de 90s (antes 300s);
- versão publicada: v160 ACTIVE;
- commit de código: 5c0e0afe5dacc779f64f6e05dbcb52eca90aca1d;
- proteção permanece: writes serializados, live_supabase_stock_drift, idempotency key e read-before/write/read-after;
- qualquer recuperação de processing/stale deve observar o Bling readonly antes de retry;
- nenhum cutover global foi feito.

### Backlog autônomo priorizado para as rodadas seguintes
1. concluir os 86 delta 1 restantes, com circuit breaker e recuperação segura;
2. criar/validar observabilidade explícita de stale stock workers para não depender de inspeção manual;
3. iniciar delta 2 em canário pequeno e ampliar apenas com PASS;
4. avançar demais divergências de estoque por faixas de risco, sempre usando estoque atual do Supabase como target durante esta migração;
5. reconciliar o plano/snapshot após writes e impedir target antigo;
6. auditar e sincronizar preço de venda Supabase -> Bling separadamente de estoque, com dry-run e canário;
7. auditar cadastro/identidade/status dos 1.630 produtos vinculados; não reativar legado Bling-only;
8. construir saneamento seguro de produtos Bling obsoletos sem apagar histórico fiscal;
9. revisar os 2 review_required históricos e classificar se são legado/resolvido/bug atual, sem alterar pedido legado;
10. completar observabilidade Control Tower para catálogo/Bling/jobs/canários;
11. revisar webhooks held/processing e preparar ativação sem ligá-la globalmente;
12. revisar early-order/direct state e gates, mantendo desligados até evidência;
13. revisar estoque mobile/balanço e preparar reconciliação para o futuro balanço físico;
14. revisar compras/XML, conversão caixa->unidade, fornecedores e rotina diária;
15. revisar lotes/validade/FEFO/ofertas e implementar o que for seguro sem ação humana;
16. revisar PapoAI/Flow/link/associação cliente-pedido e logs operacionais;
17. revisar rota/entregador/pagamento split/retorno em modo não destrutivo;
18. revisar fiscal/DANFE/financeiro e implementar apenas infraestrutura/gates não destrutivos;
19. hardening amplo: RLS, grants, functions, triggers, jobs, flags, Edge Functions e código morto com prova de substituição;
20. reensaio integrado e reavaliação geral; se algum item estiver bloqueado por humano, registrar para a lista final e executar a próxima melhoria autônoma disponível.

### Regra das rodadas
- NÃO usar Make.
- NÃO alterar pedidos legados.
- NÃO fazer cutover global de estoque antes do balanço físico/homologação.
- NÃO habilitar automação fiscal/financeira destrutiva.
- Sempre preferir evidência real, canário, idempotência e rollback.
- Sempre salvar progresso no GitHub.


## Esteira autônoma — R5/20 — 2026-09-27 — PASS
R5 executada manualmente sob autorização para continuar imediatamente.

### Hardening de worker
- migration Supabase `ops2_bling_stock_worker_health_v1`;
- view interna `ops2_bling_stock_worker_health_v1` security_invoker e sem grants public/anon/authenticated;
- função interna `ops2_bling_stock_worker_health_summary_v1()` security_invoker e sem grants public/anon/authenticated;
- health model mede processing, stale_90s, retry, review_required, oldest_processing_at e last_stock_job_at;
- baseline e fechamento: healthy=true, processing=0, stale_90s=0, retry=0, review_required=0.

### Estoque Supabase -> Bling
- 5 canários de 5 produtos, todos delta absoluto 1;
- 25/25 novos jobs synced;
- 25/25 read-after-write verified=true;
- nenhum worker lento/stale nesta rodada;
- nenhum review/failure;
- live_supabase_stock_drift guard preservado;
- acumulado: 110 stock_update confirmed;
- 429 stock_update planejados restantes;
- 61 delta absoluto 1 restantes;
- drift dos 110 confirmados contra products.stock atual: 0.

### Runtime ao fechar
- hub_enabled=false;
- mode=homologation;
- write_canary_limit=1;
- sem cutover global;
- pedidos legados não alterados;
- Make não usado.

### Advisors
- security: 75 INFO rls_enabled_no_policy no padrão interno fechado conhecido;
- performance: 46 INFO unused_index; sem blocker novo.

### Próximo passo exato — R6/20
Concluir os 61 delta 1 restantes em blocos controlados com health gate. Se o grupo chegar a zero sem divergência, preparar e executar apenas um primeiro canário pequeno de delta 2, preservando homologation e circuit breaker.


## Esteira autônoma — R6/20 — 2026-09-27 — PASS
### Delta 1 concluído
- baseline R6: 110 confirmados / 61 delta 1;
- 12 canários completos de 5 = 60 novos produtos synced + verified;
- acumulado: 170 confirmados;
- delta 1 restante: 0;
- 0 drift nos confirmados ao fechamento;
- Hub desligado e homologation preservado.

### Drift real corretamente bloqueado
- um canário preparado foi recusado por live_supabase_stock_drift antes de qualquer write;
- produto b22e8f53-bad5-440c-8b74-b72851c1e21a mudou no Supabase de target snapshot 19 para estoque atual 0;
- leitura readonly do Bling mostrou current_stock=20 e target atual=0, external_write=false;
- plano foi reconciliado para desired_stock=0/current_bling_physical=20;
- canário antigo foi rolled_back, sem write incorreto;
- este item saiu corretamente de delta 1 e será tratado na faixa de risco correspondente.

### Delta 2 preparado com gate próprio
- migration ops2_arm_catalog_stock_canary_delta2_v1 aplicada;
- gate delta 1 original não foi relaxado;
- novo gate exige confirmação literal própria, lote <=5, abs(delta)<=2 e live stock sem drift;
- amostra de 5 itens delta -2 passou no gate DB;
- canário foi rolled_back sem external write porque a Edge ainda conserva o limite delta 1; não foi contornado.

### Estado
- 170 confirmed;
- 369 stock_update planejados;
- delta1=0;
- delta2=121;
- stock authority global não alterada;
- nenhum pedido legado alterado; Make não usado.

### Próximo passo exato — R7/20
Atualizar de forma estreita o executor interno da Edge para reconhecer explicitamente canário delta2 armado pelo novo gate, mantendo <=5, live-stock guard, binding exato, idempotência, read-before/write/read-after e write_canary_limit=1. Publicar/testar sem write; depois executar primeiro canário real delta2 de 5. Expandir somente após PASS.


## Esteira ampla — R7/12 — checkpoint 2026-09-27 — EM PROGRESSO SEGURO
R7 iniciou imediatamente por autorização do usuário. Escopo amplo Bling + catálogo.

### Delta 2 habilitado fail-closed
- código commit 3185098: executor aceita faixa delta2 somente para canário previamente armado; delta1 preservado;
- Edge admin-service-intelligence-v1 publicada v161 ACTIVE com pacote completo e verify_jwt=false preservado por autenticação interna existente;
- teste negativo: canário prepared não armado retornou 409 canary_not_armed / external_write=false;
- primeiro canário delta2 real: 5/5 synced e verified.

### Expansão e circuit breaker
- segundo lote adicional 5/5 PASS;
- terceiro lote: 4 synced/verified e 1 ficou processing; expansão interrompida automaticamente;
- Hub desligado antes da recuperação;
- após lease, preview readonly do produto 155b08fc-614c-4056-9504-17f5641155ff confirmou Bling=10, target=8, portanto write não havia sido aplicado;
- o MESMO job e4284dd1-55ac-43c2-9e76-fb377a8d90e1 foi liberado para retry, sem criar duplicata;
- após allowlist temporária e processamento, mesmo job synced/verified, previous_stock=10, stock=8;
- canário completo reconciliado 5/5.

### Recovery automatizado
- commit d285920: novo subaction interno ops2_recover_stock_job;
- Edge publicada v162 ACTIVE;
- recovery só aceita stock/set_stock processing stale (>95s) ou retry;
- valida live Supabase stock, binding exato e faz leitura readonly do Bling;
- se remoto já estiver no target, finaliza synced sem write;
- se remoto ainda divergir, libera o mesmo job para retry; não cria novo job;
- teste fail-closed contra job já synced: 409 job_not_recoverable / external_write=false.

### Estado neste checkpoint
- 185 stock_update confirmed;
- 354 stock_update planned;
- delta2 restante 106;
- drift dos 185 confirmados vs Supabase atual = 0;
- hub_enabled=false, mode=homologation, write_canary_limit=1;
- sem cutover global, sem Make, sem alteração de pedidos legados.

### Continuação R7
Continuar delta2 em blocos controlados usando recovery novo quando necessário. Depois avançar divergências maiores por bandas separadas; só então preço/cadastro/saneamento Bling, sem misturar writes de preço e estoque.


## R7 continuidade — delta 2 + verificador por evidência read-after-write — 2026-09-27/28
Estado: **PASS do canário / hardening aplicado**.

- checkpoint real retomado em 185 produtos confirmados;
- canário `83b65df1-c814-499b-9dad-01090ce39f90`: 5 produtos, todos delta absoluto 2, live-stock drift=0 e sem reserva concorrente;
- 5/5 jobs `set_stock` concluíram `synced`;
- worker confirmou read-after-write `verified=true` nos cinco: 18→16, 8→6, 14→12, 4→6 e 99→101;
- foi detectada uma falsa divergência no verificador legado: ele dependia de `bling_stock_mirror_v2`, que permanece stale enquanto webhooks globais estão OFF;
- migration `20260928022300_ops2_catalog_canary_verified_job_evidence_v2` cria verificador v2 que prioriza evidência auditada do read-after-write do próprio job e usa mirror como fallback;
- migration `20260928022600_ops2_reconcile_verified_stock_canary_evidence_v1` reconciliou genericamente canários com jobs synced+verified, sem hardcode de IDs;
- canário final = verified, `external_write_enabled=false`;
- plano agora: 190 confirmed / 1440 planned; dentro dos planned há 1091 noop e 101 delta 2 ainda pendentes;
- worker health: healthy=true, processing=0, stale_90s=0, retry=0, review_required=0;
- runtime final: mode=homologation, hub_enabled=false, webhooks_enabled=false, fiscal_enabled=false, write_canary_limit=1;
- stock authority global não foi alterada; nenhum pedido legado foi tocado.

Commits:
- `74a504a8` — verificação por evidência read-after-write;
- `72e9d2b9` — reconciliação genérica de evidência verificada.

Advisors:
- security: sem novo blocker decorrente das migrations; permanece WARN de leaked-password protection desabilitada e INFO de RLS sem policy em tabelas internas fechadas;
- performance: somente unused_index INFO.

Rollback:
- Hub e allowlist do canário foram desligados ao final;
- não há write pendente/incerto;
- caso o verificador v2 precise ser revertido, o v1 permanece disponível e as evidências dos jobs são append/auditáveis.

Próximo passo:
- continuar R7 pelos 101 delta 2 restantes em canários de até 5, usando o verificador v2;
- após delta 2, abrir delta 3 em amostra pequena com gate separado; não ampliar silenciosamente o limite de risco;
- manter Hub OFF entre janelas e parar em qualquer processing/retry/review_required ou live-stock drift.


## Compras/XML — Notas recebidas SEFAZ x API Bling — 2026-09-28

### Diagnóstico confirmado em conta real
- busca automática de NF-e recebidas na SEFAZ: habilitada no Bling;
- certificado A1 no servidor do Bling: válido;
- aba **Notas recebidas**, loja **Nenhuma**, lista NF-e emitidas contra o CNPJ matriz;
- API pública v3 usada pelo Admin lista NF-e já registradas/importadas no Bling; a fila pré-importação de **Notas recebidas** não é tratada como fonte equivalente pelo módulo;
- regra de segurança preservada: o Admin **não manifesta** NF-e automaticamente e não força **Confirmação da Operação** apenas para alimentar integração.

### Ajustes aplicados
- commit `a36225d2`: sincronização manual `bling_sync` ampliada para **90 dias**; rotina diária continua usando o lookback configurado (3 dias);
- resposta do módulo passou a declarar explicitamente `source_scope=bling_imported_entry_nfe` e que a fila SEFAZ recebida não é exposta pela integração pública usada;
- commit `cff476a6`: Vitrine/Admin passou a separar visualmente **Notas recebidas SEFAZ** de **Notas importadas**;
- botão principal agora é **Importar do Bling (90 dias)**;
- novo botão **Abrir notas recebidas SEFAZ** abre a tela oficial do Bling;
- mensagem de zero resultados não é mais interpretada como ausência de NF-e na SEFAZ;
- Edge `admin-service-intelligence-v1` publicada como **v165 ACTIVE**, preservando os demais arquivos da v164 e substituindo somente o módulo Compras/XML.

### Verificação
Probe somente-leitura após deploy:
- HTTP 200;
- `company_document_resolved=true`;
- empresa: 200;
- NF-e: 200;
- produto/fornecedor: 200;
- contas a pagar: 200;
- nenhum write externo executado no teste.

### Limite oficial mantido
Sem endpoint público oficial para consumir diretamente a fila pré-importação de **Notas recebidas** do Bling, não implementar scraping, endpoint interno ou segundo consumidor SEFAZ/NSU. Fluxo suportado:
`SEFAZ -> Bling Notas recebidas -> manifestação/importação no Bling -> Admin reconcilia/importa XML`.
Upload manual de XML no Admin continua disponível para exceções.


## Compras/XML — filtros históricos por data — 2026-09-28

Implementado no Vitrine/Admin:
- **Este mês**;
- **Mês passado**;
- **Últimos 90 dias**;
- **Últimos 120 dias**;
- **Últimos 180 dias**;
- **Escolher datas** (período personalizado, limitado a 365 dias).

Comportamento:
- o período filtra os XMLs já processados no Admin;
- o mesmo período consulta, em modo **somente leitura**, as NF-e de entrada já registradas no Bling;
- a tela separa **Notas no Bling** de **Notas processadas no Admin**;
- o botão **Importar período do Bling** usa o período escolhido;
- a fila pré-importação **Notas recebidas SEFAZ** continua separada e sem manifestação automática;
- estoque continua exigindo confirmação humana.

Implementação:
- commit `02ead96f`: backend com janelas históricas + `browse_bling` read-only;
- commit `e439204f`: UI do Vitrine/Admin com filtros e período personalizado;
- Edge `admin-service-intelligence-v1` publicada **v166 ACTIVE**.

Validação:
- todos os presets retornaram HTTP 200;
- Este mês: 2026-09-01 a 2026-09-30;
- Mês passado: 2026-08-01 a 2026-08-31;
- 90 dias: 2026-07-01 a 2026-09-28;
- 120 dias: 2026-06-01 a 2026-09-28;
- 180 dias: 2026-04-02 a 2026-09-28;
- consulta read-only de 180 dias ao Bling: **36 NF-e**, sem truncamento;
- no staging/Admin, **12 XMLs** já processados no recorte de 180 dias;
- JavaScript do Admin validado sintaticamente após a alteração.


## Bling — taxonomia de categorias/subcategorias igual ao Supabase — 2026-09-28

Concluído:
- fonte adotada: produtos **ativos** do Supabase canônico;
- 1.610 produtos ativos considerados, todos com `bling_product_id`;
- taxonomia canônica: **25 categorias principais + 111 subcategorias = 136 categorias**;
- árvore criada no Bling e verificada sem categorias/subcategorias faltantes;
- cobertura dos 1.610 produtos por lotes verificados: **1.610/1.610**, `drift=0`;
- alterações de categoria foram parciais (`PATCH categoria.id`), sem alteração de preço, estoque ou fiscal;
- verificação pós-escrita usou detalhe do produto e, nos lotes rápidos, webhook assinado `product.updated`, com fallback para leitura direta.

Limpeza:
- categoria órfã `Higiene e Perfumaria` removida;
- `GERAL` e `A CLASSIFICAR` inicialmente preservadas por terem produtos legados;
- 12 produtos legados foram realocados para subcategorias válidas (Fini, Dori, café, Remmus, Diodoro, Lola e um Azeite Allegro duplicado);
- após a realocação, `GERAL` e `A CLASSIFICAR` ficaram sem uso e foram removidas;
- verificação final do Bling: **136 categorias totais, 25 raízes, 111 filhas, 0 extras, 0 faltantes, 0 ambiguidades**.

Implementação/auditoria:
- commits principais: `581faf74`, `d4b0fafa`, `0a6171fa`, `4a02e831`, `30fe6afb`, `41cff1a5`, `62da853a`, `439757a4`, `be7c914f`, `93a2412f`;
- Edge `admin-service-intelligence-v1` usada em produção controlada até **v181 ACTIVE**;
- trilhas de auditoria: `catalog_taxonomy_structure_sync`, `catalog_taxonomy_product_sync`, `catalog_taxonomy_product_sync_fast`, `catalog_taxonomy_rehome_legacy_extras`, `catalog_taxonomy_cleanup_extras`.


## Compras/XML — revisão de produtos, custo unitário e preço autorizado — 2026-09-28

Implementado no Vitrine/Admin:
- clicar na NF-e abre os produtos **para baixo, dentro da própria lista**;
- cada item mostra produto/EAN, quantidade e unidade de compra, estoque atual, custo atual do cadastro, custo da nova nota por **UN**, preço de venda atual e sugestão de venda;
- política de sugestão: **custo unitário x 1,40** (markup padrão de 40%), com preço final editável antes da confirmação;
- controles separados **Atualizar custo** e **Atualizar preço de venda**;
- botão por item **Autorizar atualização** e ação em lote **Autorizar itens prontos**;
- autorização de cadastro/preço **não altera estoque**; recebimento físico permanece no botão separado **Dar entrada**;
- produto novo/inativo permanece sinalizado; a aprovação de custo/preço não o ativa automaticamente.

Regra obrigatória de embalagem:
- operação vende produto em **UN**;
- CX, FD, PCT e DP, além de descrições com evidência de embalagem, não podem mais ser silenciosamente interpretados como fator 1;
- quando o XML fornece uma relação tributária/comercial segura, ela pode ser inferida;
- regras já confirmadas por fornecedor/produto podem ser reutilizadas;
- descrições como CX/0024, 60UN X 01FD ou 10PC X ... geram **sugestão** de fator, mas exigem confirmação humana quando o XML não comprova a conversão;
- custo unitário é recalculado somente após a conversão para UN.

Proteções adicionadas:
- processamento do XML deixou de sobrescrever automaticamente products.cost/products.unit;
- custo/preço do catálogo agora só mudam pela ação humana apply_item_update;
- constraint purchase_xml_items_pack_factor_guard impede embalagem resolvida com fator <= 1;
- dados antigos suspeitos foram reabertos para revisão: **21 itens / 2 documentos**;
- validação pós-migração: **0 itens de embalagem inseguros marcados como resolvidos** e **0 documentos prontos para entrada contendo embalagem sem conversão**;
- trilha de auditoria: purchase_catalog_item_approved.

Implementação:
- backend Compras/XML: commits 9d31f002, 2ac1b8c3;
- Vitrine/Admin: commits dc485bbb, 268fe507;
- migration versionada: commit bea65ca2, arquivo supabase/sql/20260928_purchase_xml_unit_pricing_approval_v2.sql;
- migration Supabase aplicada: purchase_xml_unit_pricing_approval_v2;
- Edge admin-service-intelligence-v1 publicada **v182 ACTIVE**;
- JavaScript do Admin validado sintaticamente após a alteração.


## Compras/XML — contas a pagar Bling v2 — 2026-09-28

Corrigido o fluxo financeiro das NF-e de entrada.

### Achado
O XML era processado corretamente, mas a criação manual de parcelas por `POST /contas/pagar` retornava HTTP 400. O erro não impedia o restante do XML de ficar como processado, o que também dificultava a retentativa financeira.

### Implementação
- fonte oficial do contas a pagar continua sendo o Bling;
- lançamento passou a usar a ação nativa da própria NF-e: `POST /nfe/{idNotaFiscal}/lancar-contas`;
- `/contas/pagar` ficou para leitura/conciliação;
- conciliação ocorre antes da escrita e novamente depois;
- produtos/estoque e financeiro têm estados independentes;
- notas duplicadas podem reconciliar o financeiro sem reprocessar produtos;
- XML CPF continua sem financeiro empresarial;
- entrada de estoque continua separada e humana;
- falha financeira cria `ops_attention.type=purchase_finance`;
- Admin ganhou Reconciliar com Bling, Lançar contas/Tentar novamente, tentativas, último erro, NF-e Bling e contas conciliadas;
- ciclo diário das 06:00 também faz reconciliação somente leitura das pendências;
- lançamentos aceitos mas ainda não confirmados continuam sendo rechecados até `finance_reconciled_at` existir.

### Banco / deploy
- migration: `purchase_xml_finance_reliability_v2`;
- migration versionada: `supabase/sql/20260928_purchase_xml_finance_reliability_v2.sql`;
- backend commits: `38232149`, `ee6db5c9`, `fa91c445`;
- Admin: `166eceed`;
- Edge `admin-service-intelligence-v1`: **v185 ACTIVE**.

### Validação
Dois ciclos internos retornaram HTTP 200 e a reconciliação declarou `write_external=false`.
Snapshot após validação:
- 18 NF-e conciliadas / confirmadas: R$ 34.682,17;
- 15 NF-e em revisão financeira: R$ 31.273,76;
- as pendentes permanecem com alerta aberto;
- nenhuma NF-e antiga foi lançada em lote pela rotina de reconciliação;
- uma importação manual paralela ainda estava em andamento no snapshot, então contagens podem evoluir.

Critério final: somente financeiro `posted` com `finance_reconciled_at` preenchido é tratado como confirmado.


## Compras do Bling — simplificação de uso + teste — 2026-09-28

Revisada a experiência do módulo Compras/XML no Vitrine/Admin.

### UX
A tela foi reorganizada para um fluxo operacional de 3 passos:
1. **Escolha o período**;
2. **Buscar e importar notas**;
3. **Revisar as notas importadas**.

Mudanças:
- título simplificado para **Compras do Bling**;
- botão principal renomeado para **Buscar e importar notas**;
- upload manual de XML movido para **Outras formas de importar XML**, recolhido por padrão;
- a lista de notas retornadas pelo Bling deixou de competir visualmente com a lista de trabalho e foi movida para **Comparar com as notas do Bling**, recolhida por padrão;
- cards principais agora mostram: No Bling, Já importadas, Ainda não importadas, Precisam de atenção, Financeiro confirmado e Prontas para estoque;
- quando houver notas do Bling ainda ausentes no Admin, a tela explica diretamente qual botão usar;
- última execução passou a usar textos humanos (Rotina automática / Importação manual / Concluída / Falhou);
- mensagens do botão principal passaram a informar novas, já existentes e falhas com linguagem operacional.

### Confiabilidade
- execuções `running` abandonadas são encerradas automaticamente após 5 minutos;
- o encerramento é registrado no metadata como `stale_closed=true`;
- não há mais importação antiga presa indefinidamente como “em andamento”.

### Testes
- JavaScript inline do Admin validado sintaticamente: OK;
- Edge `admin-service-intelligence-v1` publicada **v187 ACTIVE**;
- ciclo real da rotina de importação disparado após o deploy: HTTP 200;
- período testado: últimos 3 dias;
- resultado do teste: 0 novas notas, 0 duplicadas, 0 falhas;
- reconciliação financeira do teste: `write_external=false`, 15 pendências revisadas sem criação de contas;
- execução antiga presa em `running` foi encerrada automaticamente com sucesso;
- após o saneamento: 0 importações presas em `running`.

Commits:
- `63c48a81` — simplificação da tela;
- `ba8a5efa` — saneamento inicial de runs;
- `07a7feec` — correção final do saneamento seguro.


## Compras do Bling — correção de processamento interrompido — 2026-09-28

Durante a revisão final da UX foi encontrada 1 NF-e que tinha:
- financeiro já confirmado no Bling;
- 4 itens gravados no Admin, todos corretamente em revisão de conversão;
- documento ainda marcado como `processing` porque uma execução anterior foi interrompida antes do fechamento do status.

Correção:
- o saneamento de execuções abandonadas agora também recompõe documentos presos em `processing` há mais de 5 minutos;
- o status é reconstruído pelos itens já gravados, sem refazer financeiro, preço ou estoque;
- documento sem itens vira `failed`;
- documento com itens pendentes vira `review_required`;
- documento totalmente resolvido vira `processed/ready`.

Validação real:
- NF-e de IRMAOS DOMINGOS LTDA, R$ 2.376,50, foi corrigida de `processing` para `review_required`;
- 4/4 itens preservados e marcados para revisão;
- financeiro permaneceu `posted`;
- estoque permaneceu sem entrada automática;
- 0 execuções de importação permanecem em `running`;
- JavaScript atual do Admin passou novamente na validação sintática.

Deploy:
- backend commit `d14c8742`;
- ajuste visual do aviso `cd8f885a`;
- Edge `admin-service-intelligence-v1` **v188 ACTIVE**.


## Compras do Bling — simplificação da nota expandida — 2026-09-28

A revisão visual da NF-e aberta foi simplificada para uso operacional.

### Financeiro
- os dois botões **Reconciliar com Bling** e **Tentar lançamento novamente** foram substituídos por **Resolver financeiro**;
- o botão primeiro faz conciliação somente leitura;
- se o financeiro já existir, apenas confirma;
- se não existir e for seguro lançar, pede confirmação antes da escrita;
- divergências de parcela, fornecedor ou dados incompletos continuam bloqueando a escrita;
- erros técnicos não ficam mais expostos como código cru na tela;
- `installment_total_mismatch` passa a mostrar **Total da NF-e**, **Total das parcelas** e **Diferença** em linguagem humana;
- detalhes como ID da NF-e/tentativas foram movidos para uma seção técnica recolhida.

### Produtos e preços
- ordem da nota expandida: **Produtos e preços → Financeiro → Entrada no estoque**;
- texto principal mudou para **Confira antes de atualizar o produto**;
- a margem de 40% passou a ser tratada como **mínimo sugerido**, não como ordem para reduzir preço;
- quando o preço atual já é maior que o mínimo de 40%, o campo abre com o **preço atual** e a opção **Atualizar preço de venda** fica desmarcada;
- só há alteração do preço se o operador marcar conscientemente a atualização;
- mudar a conversão recalcula custo/margem, mas continua preservando preço atual quando ele já estiver acima do mínimo.

### Estoque
- removido o botão duplicado **Dar entrada** da linha recolhida;
- entrada de estoque aparece somente dentro da nota aberta, depois da revisão de produtos e do financeiro;
- nenhuma dessas alterações dá entrada automática no estoque.

### Teste com a NF-e mostrada pelo operador
NF-e Bling `26980521526`:
- total da NF-e: **R$ 249,00**;
- parcela informada: **R$ 250,00**;
- diferença: **R$ 1,00**;
- financeiro permanece bloqueado para escrita até correção da divergência;
- produto Macarrão Espaguete com Ovos QDelícia 500 g: 5 CX × 20 = 100 UN;
- custo unitário: **R$ 2,49**;
- mínimo sugerido de 40%: **R$ 3,49**;
- preço atual: **R$ 3,69**;
- novo comportamento validado: campo mantém **R$ 3,69** e atualização de preço fica desmarcada.

Validação técnica:
- JavaScript inline do Admin: sintaxe OK;
- sem botões antigos `data-purchase-finance-reconcile` / `data-purchase-finance-post`;
- sem botão de entrada de estoque duplicado na linha recolhida.

Commits:
- `fa5b3dcb` — simplificação da nota expandida;
- `d4cc2cd2` — rótulos financeiros em linguagem humana.


## Compras do Bling — identificação de pagamento no ato — 2026-09-28

Implementada leitura do grupo de pagamentos da NF-e (`pag/detPag`), preservando:
- código `tPag`;
- valor `vPag`;
- data de pagamento;
- troco `vTroco`;
- dados de cartão quando presentes;
- resumo normalizado em `metadata.payment_summary`.

Classificação operacional:
- dinheiro, cartão de crédito, cartão de débito, vales, depósito, PIX, transferência/carteira e crédito virtual podem ser classificados como **pagamento no ato provável** quando o valor líquido fecha com a NF-e;
- boleto, duplicata e pagamento posterior continuam tratados como pagamento a prazo;
- classificação serve apenas para alerta e orientação; **nenhuma baixa automática foi implementada**.

Admin:
- `finance_status=posted` deixou de ser exibido como “Financeiro OK” e passou a significar **Conta no Bling**;
- quando a NF-e indicar pagamento no ato, a linha mostra **Confirmar baixa**;
- a nota aberta mostra forma de pagamento, valor e orientação de qual conta financeira usar;
- cartão de crédito orienta baixa na conta financeira do cartão e controle separado da fatura;
- PIX/débito/transferência orientam baixa na conta bancária correspondente;
- dinheiro orienta baixa em caixa;
- botão **Ver contas a pagar no Bling** abre o financeiro sem executar alteração.

Backfill produtivo:
- 33 XMLs históricos reprocessados somente para metadados de pagamento;
- 33/33 atualizados, 0 falhas;
- 19 NF-e classificadas como provável pagamento no ato;
- distribuição observada: cartão de débito, cartão de crédito, vale alimentação, combinações débito+PIX, PIX e dinheiro;
- 8 dessas 19 já possuem contas registradas/conciliadas no Bling; 11 continuam em revisão financeira.

Caso validado da NF-e Bling `26980521526`:
- total NF-e: R$ 249,00;
- XML: Dinheiro R$ 250,00;
- troco: R$ 1,00;
- pagamento efetivo: R$ 249,00;
- portanto o pagamento fecha com a NF-e;
- a antiga divergência de R$ 1,00 vem da parcela/cobrança de R$ 250,00, e não do pagamento;
- UI ajustada para explicar essa diferença e impedir criação de outra conta enquanto houver divergência.

Deploy/commits:
- backend: `3c43bd9f`;
- Admin: `7fecc103`, `d7886346`;
- Edge `admin-service-intelligence-v1`: **v189 ACTIVE**;
- JavaScript do Admin validado sintaticamente: OK.


## Compras do Bling — contas financeiras e baixa assistida — 2026-09-28

Implementado o próximo estágio do financeiro de compras.

### API/arquitetura
- contas financeiras/portadores do Bling são consultadas por `GET /contas-contabeis`;
- baixa de conta a pagar preparada para `POST /contas/pagar/{id}/baixar`;
- mapeamento forma de pagamento -> conta financeira fica local em `purchase_xml_settings.metadata.payment_account_mappings`;
- nenhum mapeamento é presumido automaticamente.

### Admin
Nova seção **Contas financeiras para baixa**:
- Cartão de crédito;
- Cartão de débito;
- PIX;
- Dinheiro;
- Vale alimentação/refeição;
- Transferência/depósito.

A tela consulta as contas existentes no Bling e permite salvar o vínculo. Salvar o vínculo não movimenta dinheiro.

### Prévia da baixa
O botão **Preparar baixa** é read-only e só fica pronto quando:
- NF-e indica provável pagamento no ato;
- conta a pagar está conciliada;
- existe exatamente 1 conta a pagar elegível;
- existe uma única forma de pagamento;
- existe conta financeira mapeada;
- saldo da conta a pagar = valor pago (tolerância R$ 0,05);
- situação da conta permite baixa.

Pagamento dividido, várias contas a pagar ou divergência de valor permanecem em revisão.

### Baixa assistida
A ação final foi programada, mas exige confirmação humana explícita `CONFIRMAR_BAIXA`.
Proteções:
- chamadas internas/automáticas são bloqueadas;
- saldo e situação são reconsultados imediatamente antes da escrita;
- mudança de saldo cancela a baixa;
- após o POST, a conta é consultada novamente;
- somente baixa verificada é registrada como `metadata.settlement.verified=true`;
- auditoria `purchase_payable_settled`.

### Estado real do Bling
Consulta read-only retornou **1 conta financeira: Caixa (ID 14889129939)**.
Por segurança:
- Caixa não foi automaticamente associado a cartão, débito ou PIX;
- nenhum mapeamento foi salvo automaticamente;
- nenhuma baixa foi executada nesta rodada.

Testes:
- débito sem mapeamento -> `financial_account_mapping_missing`;
- crédito sem mapeamento -> `financial_account_mapping_missing`;
- pagamento dividido com 6 contas -> `requires_single_payable`;
- JavaScript do Admin: sintaxe OK.

Commits:
- `595a13d5` — contas financeiras + prévia;
- `7f1e0eee` — configuração visual;
- `5705cefb` — baixa protegida;
- `a3188900` — confirmação humana na UI.

Edge: `admin-service-intelligence-v1` **v191 ACTIVE**.


## R1 LIVE — cutover Bling para pedidos/estoque — 2026-09-28

R1 executada e encerrada.

### Marco de corte
- UTC: `2026-09-28T14:44:46.627499Z`
- política: `future_only`
- pedidos anteriores ao marco: ignorados pelo novo fluxo automático.

### Runtime
- Hub: `mode=live`, `hub_enabled=true`;
- products/stock/customers/orders/webhooks: ativos;
- `fiscal_enabled=false`;
- `ops2_stock_authority=bling`;
- `ops2_direct_order_state_enabled=true`;
- `ops2_ean_verified_sync_enabled=true`;
- cron `bling-hub-v2-cycle`: ativo a cada 2 minutos;
- Edge `admin-products-live-v1`: v50 ACTIVE;
- Edge `admin-service-intelligence-v1`: v196 ACTIVE.

### Fluxo novo
- checkout continua local até confirmação;
- confirmar pedido novo pós-corte:
  - reserva local transitória;
  - criação/atualização imediata no Bling;
  - situação `Aprovado / Separar`;
  - Bling passa a carregar a reserva virtual;
- falha transitória:
  - `review_bling`;
  - atenção operacional;
  - fallback `sync_order` na fila;
  - worker atualiza `bling_order_id/bling_synced_at` ao recuperar;
- separação não baixa estoque local sob autoridade Bling;
- conferência EAN mantém caminho `Verificado`;
- baixa física permanece no gate de expedição já homologado.

### Estoque
Refresh integral executado no corte:
- 1.668 vínculos de produto percorridos;
- 1.610 produtos ativos;
- 1.610/1.610 ativos prontos;
- 1.610/1.610 ativos com leitura fresca;
- 0 ativos sem cobertura;
- 0 ativos com espelho >24h.

O storefront foi testado contra o espelho recém-atualizado e retornou o mesmo saldo virtual do Bling.

### Histórico
- 2.723 webhooks antigos pendentes foram marcados `ignored`;
- consumidor R1 live aceita apenas `order`, `stock`, `virtual_stock`;
- teste com pedido antigo:
  - HTTP 409;
  - `pre_cutover_order_ignored`;
  - `external_write=false`.

### Pedido real pós-corte
Foi observado 1 pedido novo real ainda aguardando confirmação.

Preview somente leitura:
- `ready=true`;
- `write_eligible=true`;
- 30 itens resolvidos;
- 0 unresolved;
- cliente vinculado;
- R$ 171,28 em produtos;
- R$ 3,91 em outras despesas;
- R$ 175,19 total;
- `balances=true`.

Nenhuma escrita foi antecipada.

### Logs
Desde o corte:
- único HTTP >=400 nos serviços R1 foi o 409 deliberado do teste de pedido pré-corte;
- nenhum outro 4xx/5xx observado.

### Referências
- checkpoint: `R1-LIVE-CUTOVER-2026-09-28.md`;
- current state atualizado: `CURRENT-STATE.md`;
- commits principais: `0acd5d81`, `afb8921a`, `3c6811e8`, `eb236d91`, `a48dd4dc`, `90c8077a`, `d074a69a`, `77362ef2`, `42264ecf`, `7f25a3e7`.

### Próximo passo
Não reabrir histórico. Observar o primeiro pedido pós-corte quando houver confirmação humana e validar ponta a ponta:
`Confirmado -> Aprovado/Separar -> Verificado -> Expedição/baixa física`.


## R2 live — fechamento programável 2026-09-28

A cadeia pós-cutover está programada de ponta a ponta e fail-closed:
`confirmed/Aprovado-Separar -> processing -> EAN/Verificado -> NF-e autorizada -> baixa física -> out_for_delivery -> settlement real -> delivered -> Atendido`.

Novos reforços:
- NF-e autorizada manualmente no Bling é reconciliada passivamente pelo ciclo;
- captura de pagamento gera plano Bling shadow automaticamente;
- settlement real alimenta `order_fiscal_controls`;
- entrega concluída fecha `Verificado -> Atendido` somente após pagamento + fiscal + baixa física comprovados;
- falhas finais entram em `review_bling` e recuperação automática, sem desfazer entrega nem repetir estoque.

Deploy:
- Hub v201;
- Admin Edge v56.

Único gate restante desta R2 é humano/físico: separar e bipar o pedido canário real `DA-260928-D6432EB3`, depois emitir a NF-e com confirmação humana e seguir a entrega real.


## R2 live — revalidação pós-fechamento programável — 2026-09-28

Revalidação executada após commits paralelos do Admin (gôndolas), sem alteração do fluxo R2.

Estado real confirmado no Supabase:
- pedido-canário `DA-260928-D6432EB3`: `status=confirmed`, `sync_status=sent_to_bling`;
- Bling order id: `26983249693`;
- total: R$ 175,19;
- job corretivo `sync_order_status -> approved_separation`: `synced`, 1 tentativa, HTTP 200, sem erro;
- controle fiscal permanece corretamente bloqueado antes da entrega: `delivery_status=pending`, `payment_status=pending`, `dispatch_fiscal_status=pending`;
- nenhum `dispatch_fiscal_job` foi criado antecipadamente para o canário;
- Edge `admin-service-intelligence-v1`: v201 ACTIVE;
- Edge `admin-products-live-v1`: v56 ACTIVE.

Conclusão desta revalidação:
- nenhuma regressão observada nos gates R2;
- nenhum efeito externo adicional foi disparado;
- o canário continua parado no ponto correto, antes da separação física;
- não simular EAN, NF-e, pagamento ou entrega.

Próximo gate exato:
`confirmed/Aprovado-Separar -> iniciar separação real -> bipagem EAN real -> ready/Verificado`.
Depois desse gate, validar fiscal/baixa física/entrega no mesmo pedido real.


## R3 — fechamento programável sem etapa física — 2026-09-28

O usuário optou por adiar separação/EAN e demais provas físicas da R2. A R3 avançou somente em lógica segura, sem simular operação real.

### Estado
Fluxo protegido:
`out_for_delivery -> falha -> returning -> retorno físico -> redelivery OU returned_review`.

Reentrega:
- volta a `ready`;
- estoque permanece alocado;
- não há estorno físico;
- nova saída reutiliza o controle Bling já `launched`, evitando dupla baixa.

Cancelamento íntegro após retorno:
- exige ausência de pagamento capturado;
- sob autoridade Bling, exige estorno físico oficial comprovado antes do cancelamento;
- DB rejeita `cancel_intact` se `bling_order_stock_controls_v2.state <> 'reversed'`;
- Admin v57 chama o worker de estorno antes da RPC de resolução;
- o worker usa claim/finish idempotentes e endpoint Bling `estornar-estoque`;
- resultado incerto/falha -> `review_required`/atenção crítica; não repetir automaticamente;
- após reversão comprovada, o pedido pode ser cancelado comercialmente e abre atenção fiscal para tratar eventual NF-e de retorno/devolução sem apagar a venda original.

Avaria/falta:
- não usa cancelamento íntegro;
- permanece em revisão;
- tratar via Estoque Mobile/incidente, sem restaurar pedido inteiro.

### Teste
Teste sintético em transação confirmou que cancelamento sem reversão Bling é bloqueado. Rollback: 0 resíduos.

### Runtime
- `admin-products-live-v1`: v57 ACTIVE;
- worker interno temporário `shopping-room-reset-v1`: v3 ACTIVE;
- stock authority: Bling.

### Commits
- `483e4834` — guard DB da reversão;
- `38b486c1` — Admin exige reversão antes do cancelamento;
- `7d5396b5` — worker interno de estorno versionado.

### Limitação conhecida
O projeto atingiu o limite de Edge Functions. Em vez de aumentar custo, foi reaproveitado um Edge legado sem referências para o worker R3. Consolidar/renomear durante o cleanup técnico.

### Próximo passo
R3 programável pode ser considerada fechada sem executar etapa física agora. Próxima rodada do plano: **R4 — fiscal operacional NF-e/DANFE**, reforçando gate de expedição, autorização SEFAZ, DANFE, erros/retry, vínculo pedido/NF, pagamento efetivo e representação de cesta/diferença, mantendo emissão automática OFF até homologação.


## R4 — fechamento programável sem emissão real — 2026-09-28

R4 fiscal operacional concluída no limite seguro.

Fluxo protegido:
`ready + Bling Verificado + total fiscal consistente -> confirmação humana EMITIR_NFE -> gerar no máximo uma vez -> autorizar no máximo uma vez -> reconciliar -> authorized -> DANFE -> baixa física -> expedição`.

Regras consolidadas:
- fiscal automático OFF;
- emissão humana continua protegida por confirmação explícita;
- preflight DB impede armar o runtime se pedido/valores/vínculo/Verificado não estiverem corretos;
- diferença da cesta vai para `other_expenses`;
- job autorizado exige chave NF-e válida de 44 dígitos;
- retry de operações fiscais irreversíveis é somente reconciliação;
- ação antiga de “confirmar pagamento fiscal” foi desativada; settlement real da entrega permanece a fonte de pagamento.

Canário `DA-260928-D6432EB3` continua sem qualquer mutação fiscal e bloqueado corretamente até a etapa física EAN/Verificado.

Runtime:
- Admin v59 ACTIVE;
- fiscal generation OFF;
- fiscal authorization OFF;
- fiscal canary OFF;
- dispatch gate enforce.

Próxima rodada do plano: **R5 — estoque Bling/cutover readiness e escritores**, agora revisando o estado pós-cutover já ativo, writers, triggers, read models, baixa/reversão idempotente, blockers antigos e SQL canônico/reprodutível, sem reabrir histórico.


## R5 — fechamento pós-cutover — 2026-09-28

R5 adaptada ao estado real: o estoque já está oficialmente no Bling desde a R1.

Resultado:
- `stock_authority=bling`;
- 1.610/1.610 ativos prontos;
- mirror fresco;
- physical/mirror/writer gates verified;
- nenhuma revisão física crítica aberta;
- preflight corrigido para `post_cutover_live ready=true`.

Os 14 blockers de recontagem antigos e as reservas locais de proteção continuam registrados para auditoria, mas não são mais tratados como blockers de um cutover que já ocorreu.

Teste em rollback confirmou que reserve/consume/release não alteram `products.stock` sob autoridade Bling.

Commit:
- `13ec5c66`.

Próxima rodada: **R6 — lotes/validade/FEFO/ofertas**, revisando a regra atual 10%/20%/40%, produto vencido, saldo por lote e evitando desativar produto inteiro quando existir outro lote vendável.


## R6 — fechamento programável — 2026-09-28

R6 concluída com adoção gradual e sem conversão automática dos produtos atuais.

Estado:
- novo modelo de lotes pronto;
- FEFO pronto;
- ofertas 40/20/10 validadas nas bordas;
- produto não desativa se houver outro lote vendável;
- tracking completo exige soma dos lotes = estoque físico Bling;
- Admin v60 ACTIVE;
- nenhum lote real criado nesta rodada.

Fluxo futuro por produto:
`cadastrar/receber lotes -> conferir quantidades -> soma = físico Bling -> marcar lot_tracking_complete -> validade/oferta passa para FEFO`.

Até essa confirmação, cada produto continua usando sua validade atual de forma compatível.

Commits:
- `00f5414d`;
- `6e34c20e`;
- `8bfe6ced`.

Próxima rodada: **R7 — compras/XML/fornecedores/caixa→unidade**, conectando entrada XML ao cadastro, conversão de embalagem, custo unitário, fornecedor, lotes/validade quando houver evidência, estoque e regras CPF/CNPJ sem duplicidade.


## Balanço A4 por foto — 2026-09-28

Nova operação implantada no Vitrine/Admin:
- Produtos → **Imprimir balanço A4** cria um lote rastreável;
- impressão em **A4 vertical**, 5 colunas × 4 linhas, até 20 produtos por página;
- cada página traz lote `BAL-...`, página X/Y e cada card traz `REF`, foto, nome, EAN, validade, caixas 0–10 e campo largo para quantidade acima de 10;
- a foto enviada deve mostrar **a folha A4 inteira**;
- Balanço → **Fotografar folha A4 inteira** envia a página à OpenAI Vision;
- a leitura cruza lote + página + posição + REF + EAN;
- leituras confiáveis ficam prontas; qualquer ambiguidade exige confirmação humana;
- alteração manual de uma quantidade lida pela IA também exige confirmação explícita;
- aplicação ocorre em blocos de no máximo 5 itens, registra `ops_record_inventory_count_v1` e, como Bling é a autoridade de estoque, enfileira `set_stock` no Hub;
- o worker lê o saldo do depósito, grava o saldo contado no Bling, relê e só considera concluído quando o valor remoto confere;
- retry é idempotente: a mesma contagem e o mesmo job são reaproveitados após falha/conexão interrompida.

Persistência:
- `inventory_sheet_batches`;
- `inventory_sheet_items`;
- `inventory_sheet_page_scans`;
- `inventory_sheet_item_results`.

Backend:
- `admin-products-live-v1` v64 ACTIVE;
- ações `inventory_sheet_create`, `inventory_sheet_analyze`, `inventory_sheet_apply`;
- `admin-service-intelligence-v1` v206 ACTIVE atualiza o espelho Supabase logo após verificar a escrita de estoque no Bling;\n- não foi criada nova Edge Function porque o projeto atingiu o limite de funções; o módulo foi incorporado ao gateway canônico existente, sem upgrade de plano.

Validação pendente exclusivamente física:
1. imprimir uma página real;
2. marcar contagens;
3. fotografar a folha inteira;
4. conferir a leitura no Admin;
5. aplicar uma página real e confirmar os saldos resultantes no Bling.


## R7 — fechamento programável — 2026-09-28

R7 concluída no limite seguro.

### Fluxo canônico de compra/entrada
`Bling/Upload XML -> parse -> vínculo produto -> conversão caixa→UN -> revisão humana quando necessário -> custo/fornecedor -> preflight -> baseline estoque Bling -> recebimento/check-in no Bling -> mirror novo + delta comprovado -> received`.

Sob `stock_authority=bling`:
- XML não soma `products.stock`;
- confirmar entrada no Admin não movimenta estoque;
- o Admin apenas prepara e depois verifica a entrada;
- confirmação final exige prova física no mirror Bling posterior ao plano.

### Lote
NF-e `rastro` agora é capturado como evidência.
Os 33 XMLs antigos foram relidos com segurança e nenhum contém `rastro`, portanto não houve criação automática de lote.

### Conversão
Erro real encontrado e isolado:
`ARROZ DUBOM FT 6X5` tinha fator 30 derivado de peso tributável. Agora está em revisão, sem quantidade/custo derivados. Fator 6 é somente sugestão até confirmação humana.

Os 11 demais fatores inferidos atuais têm evidência explícita de embalagem compatível.

### Estado de saúde
- 33 documentos;
- 65 itens;
- 23 processados / 10 documentos em revisão;
- 31 itens em revisão;
- 0 violações CPF-financeiro;
- 0 recebimentos locais aplicados;
- stock authority Bling;
- rotina diária 06:00 Cuiabá.

### Runtime
- Hub v207 ACTIVE no checkpoint;
- Admin Edge observado v64 por trabalho paralelo;
- frontend de Compras corrigido no commit `39247fa6`.

### Próxima rodada
**R8 — PapoAI/WhatsApp operacional**:
identidade, link personalizado, Flow, cliente, associação com pedido, histórico, eventos estruturados, idempotência e painel simples de ponte — sem reintroduzir inteligência de atendimento no Admin.


## R8 — PapoAI/WhatsApp operacional — fechamento programável — 2026-09-28

A programação da ponte operacional está fechada no limite seguro.

Implementado:
- emissão idempotente de `catalogo_####`;
- token ligado a conversa/cliente;
- Storefront vincula pedido somente após token resgatado;
- Flow estruturado `customer_flow_v1` cadastra/vincula cliente idempotentemente;
- Flow pode atualizar pedidos pós-cutover sem cliente, nunca pedidos de outro cliente;
- texto livre permanece capture-only;
- painel simples PapoAI/WhatsApp na Central;
- pedido estruturado automático permanece bloqueado por runtime flag.

Runtimes no fechamento:
- `papo-external-agent-v1` v108 ACTIVE;
- `storefront-v2` v18 ACTIVE;
- `admin-products-live-v1` v69 ACTIVE.

Saúde observada:
- 411 eventos totais;
- 223/24h;
- 411 conversas vinculadas;
- 112 reconhecimentos de cliente;
- 0 review;
- 0 erro;
- 0 Flow real ainda;
- 0 token real ainda;
- 0 draft;
- 0 pedido criado pela ponte.

Teste sintético completo de Flow/link/order foi aprovado em transação e rollback limpo.

### Gate humano externo
Configurar no PapoAI o webhook do Flow usando `mode=customer_flow_v1` e homologar 1 caso real.
Não habilitar `structured_order_commit_enabled` antes disso.

Detalhes: `R8-PAPOAI-WHATSAPP-CHECKPOINT.md`.


## Auditoria Bling — empresa fiscal x canais de venda — 2026-09-29
Auditoria read-only feita pela API oficial do Bling, incorporada ao `probe_readonly` do `admin-service-intelligence-v1`.

Estado confirmado:
- empresa fiscal conectada: **SUPER CESTAS DONA ANTONIA LTDA**, CNPJ **51.385.335/0001-06**;
- depósito ativo/padrão: **Geral**;
- canais de venda cadastrados:
  - `Loja Nuvem` — Nuvemshop — **habilitado**;
  - `Super Cestas Dona Antonia` — Google Shopping — **desabilitado**;
  - `Dona Antonia Google Shopping` — Google Shopping — **habilitado**;
  - `Loja Mercado Livre - 01` — Mercado Livre — **habilitado**;
  - `Bling Loja Virtual` — Bling Loja Virtual — **habilitado**;
- amostra dos 100 pedidos de venda mais recentes no Bling: todos vieram sem `loja.id`; exemplos de `numeroLoja` são `VITRINE-...` e `SITE-...`. Portanto os canais acima **não fazem parte do fluxo atual de pedidos Dona Antônia**;
- a importação de XML/NF-e de entrada continua usando `/nfe?tipo=0`, sem filtro de canal de venda, e valida o CNPJ da empresa. Esses canais antigos não são a causa direta de NF-e recebidas não aparecerem no Admin;
- porém canais habilitados podem manter automações próprias de pedidos/estoque/preço no Bling e são ruído/risko desnecessário para a arquitetura de operação única.

Decisão:
- desativar no Bling os quatro canais sem uso: `Loja Nuvem`, `Dona Antonia Google Shopping`, `Loja Mercado Livre - 01` e `Bling Loja Virtual`;
- manter `Super Cestas Dona Antonia` desabilitado;
- **não excluir** histórico/vínculos nesta etapa; apenas desativar;
- a API pública do Bling expõe esses canais somente para leitura (`GET /canais-venda` e `GET /canais-venda/{id}`), então a desativação deve ser feita em **Central de Extensões > Minhas instalações > ⋮ > Desativar**;
- após a desativação, repetir o `probe_readonly` e confirmar que todos os cinco canais estão com situação 2/desabilitado.
- sincronização `purchase-xml-daily-v1` ajustada para **06:00 e 18:00 de Cuiabá** (cron `0 10,22 * * *` em UTC);
- `purchase_xml_settings.auto_create_payables=false` enquanto o financeiro automático de compras permanecer suspenso.


## Compras/XML — fila profissional de catálogo 31 dias — 2026-09-29
Implementado o modelo de automação por confiança para produtos vindos de NF-e:
- backend `catalog_queue` agrupa por produto/GTIN os itens das NF-e emitidas nos últimos 31 dias;
- fila única no Vitrine/Admin mostra produto novo ou existente, EAN, NCM, fornecedor, NF mais recente, conversão embalagem→UN, custo atual x novo, preço atual x sugerido e status;
- filtros: Pendentes, Novos, Já cadastrados, Revisar, Prontos, Aprovados e Todos;
- busca por produto, EAN, fornecedor, NF e NCM;
- botão **Autorizar seguros** aprova em lote somente itens com vínculo/custo/conversão determinísticos;
- itens ambíguos ficam fora do lote e exigem revisão humana;
- aprovação em lote atualiza custo unitário; preço só é elevado automaticamente quando está abaixo da sugestão mínima de 40%; estoque permanece inalterado;
- cadastro automático de produto novo continua habilitado; produto novo local nasce inativo e entra na fila para revisão comercial;
- janela automática operacional permanece em 31 dias.

Validação no runtime após implantação:
- 26 produtos únicos na janela de 31 dias;
- 11 novos;
- 15 já existentes;
- 22 prontos para aprovação segura;
- 2 exigindo revisão;
- 2 já aprovados.


## Produtos em cestas/kits + regra de lote/validade — 2026-09-29
### Filtro de produtos
- Vitrine/Admin > Produtos recebeu filtro **Somente produtos de cestas/kits**.
- O backend considera componentes dos templates ativos de cesta, componentes dos kits ativos e alternativas ativas.
- Estado validado na implantação: **30 produtos únicos** participam de cesta/kit ativo.
- `admin-products-live-v1` publicada como v113.

### Regra profissional de entrada por validade
Decisão arquitetural: cadastro comercial e recebimento físico são etapas distintas.
- atualizar produto existente nunca deve sobrescrever a validade do estoque anterior;
- cada recebimento/validade deve ser registrado em `product_inventory_lots` como lote separado;
- FEFO usa a validade mais próxima primeiro;
- XML pode fornecer rastreabilidade em `purchase_xml_item_lot_evidence`; quando não fornecer, a validade deve ser coletada no recebimento;
- uma mesma linha de NF-e pode ser dividida em vários lotes/validades;
- Bling permanece autoridade do saldo físico; o ledger de lotes no Admin deve reconciliar com o saldo físico antes de `lot_tracking_complete=true`.

Achado atual:
- estrutura FEFO e lotes já existe;
- porém ainda existem **0 lotes materializados** e **0 produtos com lot_tracking_complete=true** no banco;
- portanto o FEFO ainda não deve ser tratado como operacional até o fluxo de recebimento materializar/reconciliar lotes e a separação consumir/sugerir lotes de forma consistente.


## Recebimento por lote/validade + FEFO seguro — 2026-09-29
Implementado no Vitrine/Admin > Compras/XML:
- cada item de NF-e agora possui seção **Lotes e validades desta entrada**;
- XML com rastro pré-preenche lote/validade; sem rastro, operador informa;
- uma linha pode ser dividida em várias validades;
- soma dos lotes deve fechar exatamente com a quantidade convertida em UN;
- opção explícita **Sem controle de validade** para itens em que realmente não se aplica;
- entrada não pode ser preparada/verificada enquanto o plano de lotes estiver incompleto;
- salvar lotes/validade não altera estoque físico;
- após o aumento de estoque ser verificado no Bling, os lotes da compra são materializados em `product_inventory_lots` de forma idempotente;
- o Admin mostra lotes já cadastrados do produto ao lado da nova entrada;
- com `lot_tracking_complete=true`, o menor vencimento é marcado **FEFO: sair primeiro**;
- sem tracking completo, a menor validade é apenas referência provisória, com aviso de que o estoque legado ainda não foi reconciliado;
- FEFO de separação não será tratado como autoritativo até o levantamento inicial de lotes/validades do estoque antigo fechar com o físico do Bling.

Runtime:
- `admin-service-intelligence-v1` publicado como v214;
- teste read-only de documento retornou `receipt_lot_plan` e `current_inventory_lots` corretamente;
- no estado atual ainda não há lotes históricos materializados; a primeira entrada validada passará a criar o ledger de lotes novos.


## Migração progressiva de lotes/FEFO por produto — 2026-09-29
Decisão operacional: não exigir inventário geral de validades antes de usar o módulo.

Modelo híbrido por produto:
- enquanto `lot_tracking_complete=false`, o produto continua usando a validade legada e os lotes cadastrados são referência parcial;
- novas compras já podem registrar lotes/validades normalmente;
- o operador pode abrir **Produtos > Lotes** e distribuir o estoque daquele produto por validade aos poucos;
- o Admin mostra estoque físico Bling, quantidade já distribuída em lotes e quantidade ainda faltante;
- o botão **Ativar FEFO neste produto** somente conclui quando os lotes quantificados fecham com o estoque físico do Bling;
- depois de concluído, o produto usa validade efetiva por lotes e FEFO;
- não existe ativação global: cada produto migra no seu próprio ritmo.

UX adicionada em Produtos:
- badge por produto: **Lotes pendentes** ou **FEFO completo**;
- ação rápida **Lotes**;
- filtro: **Lotes/FEFO pendente** / **Lotes/FEFO completo**;
- dentro do editor, botão **Lotes/validades**;
- formulário simples para lote, validade e quantidade.

Runtime: `admin-products-live-v1` publicado como v114. JavaScript do Admin validado sem erro de sintaxe.


## Identidade cliente / PapoAI multicanal — 2026-09-29
Correção estrutural implantada para impedir pedidos do site órfãos de cliente. O checkout cria/resolve identidade antes do pedido e há trigger de defesa no banco; telefone brasileiro é canonizado com equivalência segura do nono dígito; 1018 e 0975 são contas distintas; o Flow real do PapoAI (mensagem com `flow_token` + `custom_1..custom_5`) é processado automaticamente e enriquece cliente/endereço/documento válido. Backfill deixou 0 pedidos recentes com telefone e sem cliente. Restou somente 1 pedido legado de 22/09 sem telefone, que não deve ser vinculado por aproximação. Detalhes e evidências em `PAPOAI-CUSTOMER-IDENTITY-FIX-2026-09-29.md`.
