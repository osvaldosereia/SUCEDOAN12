# Dona Antônia — R30/R31 — Consolidação e liberação segura

**Data:** 09/10/2026  
**PR direta para main:** [#1034](https://github.com/osvaldosereia/SUCEDOAN12/pull/1034) (`agent/xml-catalog-final-integration-r28-20261009`, draft, **não publicada**).

## Evidências reais e verificadas

- **R28:** todos os 24 workflows passaram na versão funcional `e4a944b05583cb106de365e9c85f92fb2811f96e`. As alterações fiscais R1/R2 posteriores também foram trazidas à branch por cópias exatas dos blobs modificados da `main`; não sobrescrever o roteador fiscal ou o Admin com versões antigas.
- **R29:** [CI 37980712665](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37980712665) **SUCCESS**: Supabase Auth/PostgREST local + SQL exato de duas migrations R27, negação anônima de RPC privado HTTP 404 e rollback CAS de nome de produto inativo. Containers excluídos.
- **R30 Chromium:** [CI 37982219283](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37982219283) **SUCCESS**. O script `scripts/test-xml-admin-browser-r30.mjs` extrai funções **reais** da fonte do Admin, exercita comportamento em Chromium 1366px e 390px, com fonte fiscal lazy, prévia obrigatória, confirmação digitada, aplicação nome, reversão e bloqueio produto ativo. **Nenhuma chamada externa** feita no navegador. Os cenários são simulados; isso não substitui sessão humana real conectada ao Bling/Supabase.
- **R30 release plan:** `scripts/xml-selective-release-planner-r30.mjs` e `scripts/test-xml-selective-release-r30.mjs` inspecionam snapshot explícito remoto, duas versões geradas pela Supabase CLI acima do topo remoto, hash SHA-256 de SQL e seis gates de aceite; nenhum `db push`, `migration repair` ou conexão produtiva. O script **nunca** autoriza aplicar SQL (`can_apply_to_production=false`).
- **R31 autenticação Edge local:** novo workflow `xml-r31-authenticated-edge.yml` cria usuário sintético no GoTrue local e verifica acesso da Edge independente `purchase-xml-v1` para owner e proibição de viewer, owner desativado e anônimo, sem comunicação com Bling. **Consultar resultado do workflow**, não alegar homologação até concluir.

## Bloqueios de liberação não negociáveis

1. **Histórico SQL global:** no último snapshot confiável do projeto produtivo, 1.187 migrations remotas versus 136 arquivos locais; **não rodar `supabase db push` global nem `migration repair`**. Selecionar exclusivamente R27 identity e R27 field approval e verificar a versão máxima remota no momento da instalação.
2. **Versões atuais da branch R27 são provisórias:** `20261009185312_purchase_xml_identity_atomic_r27.sql` e `20261009185314_purchase_xml_field_approval_r27.sql` têm SQL testado, mas **timestamps anteriores** a `20261009190052_fiscal_nfe_autorecovery_v1_20261009`, aplicado em produção. Congelar demais implantações, consultar `list_migrations`, gerar dois novos nomes CLI **posteriores** ao maior timestamp e atualizar os caminhos de testes e CI, sem alterar corpo do SQL, com novo ciclo de CI.
3. **Supabase preview tradicional bloqueado por migration WhatsApp antiga:** a versão remota `20260908200932_whatsapp_sales_official_resources_homologation_v1` exige `whatsapp_release_mode=live`; reprodução em branch isolada falha em `live_mode_required` depois de 145 versões. A branch de teste paga criada na rodada anterior **foi excluída** com sucesso. Não ativar live, pular SQL ou adulterar histórico para passar.
4. **Release operacional:** validar backups e restauração do projeto canônico; testar autenticação e autorização da Edge, HTTP Admin/browser com credenciais de homologação, logs, limites e retorno seguro. Não emitir NF-e ou movimentar estoque/financeiro em testes. Confirmar publicação DB seletivo → Edge → Admin, com monitoramento e rollback aplicativo (não sair apagando tabelas fiscais de produção).

## Roteiro objetivo para janela de publicação

1. **Paralisar merges SQL concorrentes** na janela de release e fixar SHAs da `main`, PR #1034 e histórico `supabase_migrations`. Não criar outro serviço em produção.
2. Regerar pela **Supabase CLI** dois nomes cronologicamente superiores à última versão do projeto; conferir os SHA-256 dos SQLs contra a R27 já testada, não reaplicar arquivos históricos.
3. Homologar dois SQLs em Postgres/Supabase isolado com Auth, funções, RLS e teste do navegador + rede. R29/R30/R31 são camadas de evidência, não a publicação.
4. Confirmar backup/restauração/monitoramento e preparar reversão por feature flag e revert de código. Somente após todos os gates positivos, aplicar **as duas migrations selecionadas** pela integração Supabase (não global db push), publicar Edge e validar Admin.
5. Smoke antes de habilitar público; conferir fila, dossiê, retorno 401/403, nenhum efeito fiscal/estoque/financeiro, endpoints de compra e emissão NF-e da main. Registrar resultados, versão e commits no handoff.

**A produção permanece inalterada pelas rodadas R28–R31.**


## R31 — diagnóstico real e isolamento das dependências (complemento)

- Execução [#37983122339](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37983122339): **FAILED** na etapa HTTP `purchase-xml-v1`. O Supabase local iniciou; o fixture PostgreSQL/R27 aplicou; o usuário owner no GoTrue foi criado e obteve JWT. Porém, **15 chamadas Edge consecutivas expiraram em 12 segundos (HTTP 000)**. Logs `serving the request` sem resposta útil. Portanto **não existe evidência de owner/viewer/inativo/anônimo aprovada nesta execução**. Isto é um bloqueio da prova de Edge real, não prova de vulnerabilidade ou falha da regra fiscal.
- A árvore do handler inclui imports externos `npm:@supabase/supabase-js@2`, `jsr:@supabase/functions-js/edge-runtime.d.ts` e `npm:fast-xml-parser@5.11.2` (o parser é importado indiretamente via `xml-catalog-extractor.mjs`). O atraso de resolução/cold-start é **hipótese**, não causa confirmada.
- Adicionado `scripts/xml-r31-local-supabase-shim.mjs`, usado **apenas na cópia temporária da Edge do GitHub Actions**. Esse adaptador consulta **GoTrue e PostgREST locais de verdade** com token JWT e key de serviço local; o roteador principal TypeScript e o gateway real de aplicação de campo continuam inalterados. A cópia de `xml-catalog-extractor.mjs` no runner substitui a função de extração por uma que **lança erro se chamada**, pois o cenário testa somente `xml_field_apply_list`. O parser de XML continua validado nas suítes R19/R28. A versão versionada/de produção de ambos os arquivos **não foi modificada**. Confirmação de owner/roles deve ser obtida do teste R31 subsequente; não rotular essa prova como full Edge end-to-end do SDK supabase-js.
- Teste alternativo `R29` real PostgREST Auth e `R30` Chromium já estavam aprovados e continuam independentes dessa falha. Até uma prova adicional positiva, a PR #1034 permanece **draft e sem deploy**.


### R31 — correções de inicialização confirmadas

- Execução [#37984223877](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37984223877) terminou **FAILED** antes de testar autorização, com HTTP 503 `BOOT_ERROR`: o stub temporário de `xml-catalog-extractor.mjs` gravou os caracteres literais `\\n` em vez de uma quebra de linha, causando erro de parse `Expected unicode escape`. Corrigido usando `chr(10)` e adicionados dois `node --check` antes da inicialização dos contêineres. **O arquivo de produção nunca foi editado.**
- Inspeção do arquivo exato `supabase/functions/purchase-xml-v1/index.ts` confirmou **zero ocorrências de `Deno.serve`**, mas a exportação `handlePurchaseXmlRequest`. Ele é o **módulo usado pelo Admin** e não um endpoint autônomo. O wrapper temporário da CI agora adiciona somente no arquivo copiado `Deno.serve(req => handlePurchaseXmlRequest(...))`; em produção, o endpoint real continua `admin-service-intelligence-v1`.
- Avaliar o novo resultado da execução R31 após correções. O teste da cópia com adaptador local valida handler/roles com GoTrue/PostgREST, mas não testa carregamento de pacotes remotos nem publicação do serviço pai. Não transformar falha de inicialização da harness em conclusão sobre a lógica de autorização.


## R31 — execução final verificada: PASS (09/10/2026)

A nova execução **[GitHub Actions #37984775285](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37984775285)** terminou com **job `local-jwt-edge` `completed/success`**. As mensagens de log do comando efetivamente executado (não apenas o texto do script) confirmaram:

- `PASS R31: test user created in isolated Auth and exact XML migrations applied`
- `PASS R31: owner JWT accesses real local Edge field-apply list`
- `PASS R31: viewer JWT 403, inactive owner 403, anon 401. No remote Supabase/Bling requests.`

**Escopo e limitações:** foi usado o handler real `handlePurchaseXmlRequest`, o gateway `xmlFieldApplyGateway` real, usuário/JWT da instância GoTrue local, queries ao PostgREST local e as duas migrations reais R27 no fixture reduzido. A cópia temporária da função recebeu um `Deno.serve` (o original é módulo interno sem entrada própria); pacotes JS externos foram substituídos por adaptador CI que usa HTTP local; o parser de XML foi substituído por função que falha se chamada, pois a extração é testada em R19/R28. **A produção não recebeu nenhuma destas alterações.** A verificação R31 é prova de HTTP/JWT/roles do handler e gateway com Auth/DB reais locais, mas não prova do bundle completo do roteador produtivo `admin-service-intelligence-v1` e nem homologação em ambiente com o histórico inteiro de migrações.

**Gates resolvidos:** R29 PostgREST anônimo, R30 DOM real Chromium desktop/mobile com dados sintéticos, R31 JWT owner/viewer/inativo/anônimo e fluxo SQL PostgreSQL local. **Gates em aberto:** homólogo real do serviço pai, backup/restauração com procedimento documentado, versões canônicas CLI posteriores ao último timestamp remoto, validação de release integrada e smoke de produção depois da implantação. Não executar `db push` global.


## Inspeção read-only do banco produtivo após R31

A consulta `to_regclass` ao projeto canônico `ssbesxgaijknwsjbsbcz` retornou **NULL** para `purchase_xml_catalog_identity_actions_v1`, `purchase_xml_field_reviews_v1` e `purchase_xml_field_applications_v1`. `to_regprocedure` também retornou **NULL** para as assinaturas consultadas dos RPCs de aplicação/rollback. **As duas migrations de identity/review R27 não estão presentes no banco real** e, portanto, os botões novos **não podem ser publicados como funcionalidade ativa antes da implantação seletiva**. Nenhuma tabela/RPC foi criada nesta inspeção. O último timestamp remoto conferido era `20261009200925`, nome `fiscal_autorecovery_only_new_orders_20261009`. O release futuro deve congelar o histórico e gerar novamente os timestamps com a Supabase CLI acima da versão máxima na hora.
