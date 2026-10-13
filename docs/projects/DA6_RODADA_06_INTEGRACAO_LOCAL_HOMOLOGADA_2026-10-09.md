# DA6 — Rodada 6: integração Supabase local homologada, gates físicos pendentes (09/10/2026)

## Resultado confirmado
- Repositório `osvaldosereia/SUCEDOAN12`; branch `agent/gondola-labels-balance-20261009`; PR #987 aberto em draft; não houve merge nem deploy.
- **CI definitivo [37946614355](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37946614355): 6/6 jobs SUCCESS**.
- `deterministic-tests`: **54 testes PASS, 0 FAIL**.
- `postgres-worker`: 6 testes reais de concorrência PASS, e a nova prova SQL de cron com Vault/pg_net simulados passou.
- `postgres-review`, `postgres-upload`, `edge-types`: todos PASS.
- `local-supabase-storage`: inicializou Supabase CLI completo **em contêineres efêmeros no runner do GitHub Actions**, PostgreSQL 17 real, Auth, PostgREST e Storage privado reais, sem banco ou credenciais da produção.

## Fluxo integrado comprovado (somente Supabase LOCAL)
1. Criou operador Auth/Admin e produto artificiais; bucket `inventory-label-photos` configurado como privado.
2. Testou lotes de **10 + 50 + 100 = 160 fotografias** reais em formato binário PNG, usando `createSignedUploadUrl`, PUT multipart da implementação de navegador `DonaAntoniaLabelUpload.uploadSigned`, `inventory_label_photo_confirm`, SHA-256 real e controle de capacidade transacional. Todos os 160 objetos foram recebidos e confirmados.
3. Reenvio das mesmas 160 fotografias detectou exatamente **160 duplicidades**, sem recriar entradas.
4. Uma chave anônima não conseguiu baixar os arquivos privados.
5. Descartou o contexto de formulário/navegador, recuperou os lotes via banco e iniciou `inventoryLabelWorkerTick` em execução independente.
6. Etiqueta **digital com QR real, quatro marcadores e seis marcações OMR** foi lida pelo worker com o mesmo ImageMagick WASM e jsQR do Admin; gravou **6 contagens históricas**, todas inicialmente `pending_review`, sem alterar estoque.
7. Aprovação explícita de quantidade **0** gerou evento auditável consultado por API, com nome de operador e uma decisão.
8. As fotografias sem QR entraram em `retry`, sem gerar contagens. O worker continuou em ciclos até consumir **todos os 160 uploads**: `remainingQueued=0`; continuaram apenas **6 contagens legítimas**, com **1 evento de revisão**. Nenhuma fotografia excedeu 3 tentativas.
9. Integração usa arquivos sintéticos, Auth/Storage de instância descartável, e não realiza qualquer escrita nos projetos Supabase reais, pedidos, estoque ou Bling.

## Segurança corrigida nesta rodada
- A migração `20261009133000_da6_worker_dispatch_cron_v1.sql` continha a URL da Edge Function **de produção** escrita diretamente. Isso foi removido antes de homologação: o despacho agora exige três segredos de Vault por ambiente:
  - `da6_label_worker_key_v1`: chave hexadecimal de 64 caracteres, igual à esperada pelo gateway da instância.
  - `da6_label_worker_project_ref_v1`: referência do projeto com 20 caracteres alfanuméricos minúsculos.
  - `da6_label_worker_url_v1`: URL HTTPS exata `https://<project_ref>.supabase.co/functions/v1/admin-products-live-v1?action=inventory_label_worker_tick`.
- Ausência, divergência, chave inválida ou URL diferente deixam o dispatcher em `no_op/error`, sem efetuar request.
- O PostgreSQL 17 de CI usa `net.http_post` interceptado artificialmente: comprovou não emitir chamadas sem segredos, rejeitar destino estranho, enviar à URL de homologação fictícia apenas quando bem configurado e não despachar com fila vazia.
- O teste local não instala cron real do projeto, evitando envio acidental para ambientes remotos.
- `vitrine/admin/inventory-label-photo-upload.js` aceita HTTP **somente para localhost na própria origem** durante a homologação; em produção exige HTTPS do projeto Supabase canônico e caminho assinado do bucket privado.

## Artefatos de implementação/testes
- `tests/da6-local-supabase-bootstrap.sql`: schema sintético RLS/ACL no Supabase local.
- `tests/da6-local-supabase-e2e.test.ts`: Auth, Storage, upload assinado 10/50/100, SHA, duplicidade, fila, OMR com QR real, revisão e histórico.
- `tests/da6-cron-staging-fixture.sql`, `tests/da6-cron-staging-assertions.sql`, `tests/da6-cron-staging-safety.test.cjs`: fail-closed e nenhuma URL de produção fixada.
- `.github/workflows/da6-inventory-labels-ci.yml`: sexto job `local-supabase-storage` com Supabase CLI local efêmero, sem custos de criar projeto remoto.
- Última evidência do CI: `DA6_REAL_LOCAL_STORAGE_PASS` reportando os três lotes, 160 objetos consumidos, 0 na fila, 6 contagens válidas, 1 revisão.

## Gates NÃO aprovados e que continuam obrigatórios
1. **Impressora 203 dpi física e fotografias reais de celular**: ainda indisponíveis. Testar papel 100×150 mm sem ajuste de escala, fiduciais não cortados, QR/Code128, seis balanços marcados com caneta, iluminação normal/baixa, inclinação, 90°/180°, sombras e fotos borradas. Exigir zero quantidade aceita incorretamente; imagens incertas vão a revisão.
2. **Gateway Edge hospedado + pg_net/cron reais em staging remoto**: esta rodada executou o worker Deno real sobre serviços Supabase locais, mas não publicou uma Edge Function hospedada nem executou cron de produção. Nenhuma branch de Supabase remota separada estava disponível; criar nova pode ter custo e confirmação específica. Não implantar na produção para simular teste.
3. **Tempo e memória em Edge hospedado** com lote 100, validação de limite de 55 segundos e retorno do host, logs, métricas e permissões; testa-se novamente antes do deploy.
4. **Regressões R7** da aba de balanço A4, Admin, cestas, checkout, autenticação/RLS, e CI geral `Admin and Baskets Guard`; branch divergiu da main, não mesclar sem comparar.
5. **Publicação R8** somente após gates: snapshots/backup, secrets de Vault por ambiente, migrações em ordem validada, rollback de Edge e frontend, rollout limitado e monitoramento.

## Próxima execução
- Iniciar **Rodada 7 de auditoria e regressões**, preservando R1–R6 verdes e sem tocar nos fluxos de pedidos de outras branches.
- Tratar gate físico/Edge remoto como pendência de homologação de produção, sem declarar sistema pronto para clientes.
- Revisar a rotina programada somente quando todos os gates estiverem verdes e publicação segura concluída.
