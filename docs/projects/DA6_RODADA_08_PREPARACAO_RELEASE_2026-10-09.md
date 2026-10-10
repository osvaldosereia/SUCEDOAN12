# DA6 — Rodada 8: pacote de release controlado (09/10/2026)

> **Estado:** PREPARAÇÃO DE RELEASE, NÃO PUBLICADO. Não converter PR #987 em pronto, não fazer merge, não aplicar migrações em produção, não desligar a programação horária enquanto os gates não estiverem homologados.

## Evidências anteriores
- R1–R7 implementadas/testadas em branch isolada `agent/gondola-labels-balance-20261009`.
- R7 concluiu reconciliação de `main` preservando orçamento/Bling, CNPJ, pedidos e fluxo A4; PR #987 retornou a `mergeable=true`. CI DA6 da R7 com 6/6 jobs verdes e 60 testes determinísticos (ver `DA6_RODADA_07_AUDITORIA_REGRESSOES_2026-10-09.md`).
- R6 validou Supabase CLI local **real** com 160 uploads assinados em Storage privado, Auth, deduplicação, worker Deno, seis contagens por QR/OMR e revisão auditável. Não equivale a fotos físicas ou Edge hospedado.
- Fonte do cron DA6 já não possui URL fixa de produção; exige três entradas Vault por ambiente e no-op sem credenciais.

## Entregas desta preparação
1. **Independência da CDN na impressão:** `product-shelf-labels.js` carrega `/vitrine/admin/vendor/JsBarcode.all-3.11.6.min.js` e `/vitrine/admin/vendor/qrcode-generator-2.0.4.js` da origem do próprio Admin. Os arquivos de licença MIT de ambos foram preservados, junto aos arquivos originais. A impressão não depende mais de disponibilidade de jsDelivr durante o uso. Isso **não** significa que uma impressora física já foi homologada.
2. **Teste de impressão off-line:** `tests/da6-vendored-print.test.cjs` verifica origem local dos bundles e licenças, executa os bundles no Chrome sem requisições externas, gera Code128, lê o QR gerado por `jsQR` e confere seis registros no HTML.
3. **Prova de bloqueio da publicação:** `docs/projects/DA6_RELEASE_GATES_2026-10-09.json`, `scripts/da6-release-gate.mjs` e `tests/da6-release-gate.test.cjs`. Em `--report`, o script somente informa gates; `--enforce` sai com código 3 enquanto houver prova pendente, mesmo que o CI de software esteja verde. A evidência de cada gate aprovado deverá ser um documento `docs/projects/DA6_QA_*.md` com SHA-256 fixado no manifesto. O script **não** publica, não modifica banco, não faz merge nem chama Bling.

## Comandos de conferência (executar no checkout da branch)
```bash
node scripts/da6-release-gate.mjs --report
node scripts/da6-release-gate.mjs --enforce   # Esperado: exit 3 até homologação completa
node --test tests/da6-release-gate.test.cjs tests/da6-vendored-print.test.cjs
```

## Gates obrigatórios ainda PENDENTES
1. Imprimir ao menos um conjunto representativo de etiquetas em impressora física térmica **203 dpi / 100×150 mm**. Conferir dimensões sem reescalonamento, quatro marcadores, QR e Code128 legíveis, seis linhas sem cortes. Registrar impressora/driver, evidências de teste e defeitos.
2. Fotografar as etiquetas físicas por **celular real** com contagens 0,1,7,10,23,99; rotação, distorção, sombra, pouca luz, caneta/pintura parcial e caso ilegível. Confirmar que nunca há quantidade inventada e que casos ambíguos vão para revisão. Manter dados de clientes fora dos testes.
3. Deploy do DA6 em **staging Edge Supabase hospedado distinto da produção**, com storage privado, autenticação de operador, URL assinada, pg_cron+pg_net+Vault, 3 tentativas, token fencing, métricas de tempo/memória/timeout em lote 100. Não criar serviço pago sem avaliação do custo; não usar canônico de produção como staging.
4. Confirmar `main` atual no instante do release e inexistência de conflito em PR #987. Não forçar SHA nem apagar arquivos de outros projetos.
5. Snapshot/backup comprovado do banco e registro da versão de Edge/Admin que será revertida em caso de regressão.
6. Ensaiar rollback do **frontend e Edge** em staging sem perder fotos históricas e sem apagar tabelas de auditoria.

## Ordem de rollout APÓS todos os gates (somente procedimento, não executado)
1. Congelar SHA de `main` e PR #987; arquivar relatório de diff, versões dos assets locais e CI 6/6. Executar `node scripts/da6-release-gate.mjs --enforce` — se falhar, **parar**.
2. Conferir variáveis e permissões da função Edge no projeto escolhido; executar snapshot/backup e registrar checkpoint. Verificar existência e políticas do bucket privado.
3. Inspecionar e validar migrações específicas DA6 no banco de staging primeiro; em produção só com janela controlada e dry-run. **Não aplicar automaticamente via CI.**
   - Estrutura/bucket DA6, RPC de claim e idempotência (`20261009112000_da6_worker_queue_rpc.sql`).
   - RPC de revisão auditável (`20261009140500_da6_manual_review_audit_v1.sql`) e reserva de upload transacional (`20261009150000_da6_upload_atomic_reservation_v1.sql`).
   - **Cron por último**, somente após configuração de Vault e a função Edge corretos (`20261009133000_da6_worker_dispatch_cron_v1.sql`).
4. Realizar smoke autenticado do gateway e foto de teste; comprovar que nenhuma contagem histórica dispara `inventory_balance_commit`, atualizações de estoque ou Bling.
5. Disponibilizar os assets e frontend DA6 com ativação gradual de operação, observando logs da Edge, fila e taxas de revisão/erro. Preservar `Estoque > Balanço` A4.
6. Após estabilização, validar workflows gerais do Admin, cestas e pedidos, rota fiscal e WhatsApp. Só então gerar relatório final e desligar a automação horária.

## Resposta a falha: rollback sem perda de dados
- Em caso de erro, **interromper a entrada de novas fotos** e retirar os recursos da UI DA6 via rollback do frontend, preservando A4 e pedidos.
- Suspender o agendador exclusivamente por seu nome: `select cron.unschedule('inventory-label-worker-da6-v1');` **apenas após confirmar que ele existe e é desta funcionalidade**.
- Restaurar a versão anterior do gateway Edge/HTML pela referência SHA anterior arquivada; não reverter cegamente alterações de outros agentes.
- **Não dar DROP** em tabelas históricas `inventory_label_*`, bucket de fotografias ou eventos de auditoria com dados reais.
- Registrar evidências, tratar jobs `processing/retry` e conferir que nenhuma quantidade mudou estoque; reativar apenas depois de corrigir e revalidar.
- O Bling só pode receber atualizações pelo fluxo canônico separado e mediante confirmação segura, nunca via foto histórica sem revisão.

## Situação de custos e autonomia
- Sem IA para ler etiquetas; o CI local pode ser executado sem criar novo Supabase remoto.
- Validação física exige hardware/amostras reais; Edge hospedado exige staging autorizado. A automação continua implementando verificações seguras, sem inventar aprovação de gates inacessíveis.

## Checkpoint de testes da preparação R8 (verificado)

- **Fonte validada:** commit `bfd40c625870fe4a586ace0e2ef81f497bde5b7d`.
- **CI GitHub Actions [37952073545](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37952073545): 6/6 jobs SUCCESS** — `deterministic-tests` **65 PASS / 0 FAIL**, `edge-types`, `postgres-review`, `postgres-upload`, `postgres-worker`, `local-supabase-storage` todos verdes.
- Bibliotecas QR/Code128 executadas pelo Chrome a partir de arquivos próprios com licença MIT; decodificação do QR por `jsQR` confirmou o payload de identificação DA6 e o SVG Code128 foi renderizado sem acesso HTTP externo.
- O manifesto de release **permanece BLOQUEADO**, sem qualquer gate físico ou Edge remoto considerado aprovado por testes sintéticos.
- Este checkpoint altera somente documentos de release, **não** o código fonte testado. Nenhum merge/deploy/SQL no canônico ou chamada ao Bling nesta rodada.

## Proteção nova — evidências vinculadas ao código exato

- `scripts/da6-release-fingerprint.mjs` calcula SHA-256 composto e reprodutível de todos os arquivos críticos da implementação: página do Admin, módulos JS/CSS DA6, bibliotecas QR/Code128 locais, gateway central, worker, RPC/migrações e workflow do CI. Também inclui automaticamente módulos novos `inventory-label-*.js/.css/.ts` e migrações `*_da6_*.sql`.
- O manifesto `docs/projects/DA6_RELEASE_GATES_2026-10-09.json` inclui `release_candidate_fingerprint`. **Permanece `null` e mantém o release BLOQUEADO.** Não usar o SHA da implementação atual como aprovação física; só fixá-lo no momento do congelamento do código após a homologação dos dispositivos.
- `scripts/da6-release-gate.mjs --enforce` rejeita tanto o fingerprint ausente quanto qualquer diferença em relação ao código local; não permite que aprovações ou fotos de uma versão anterior sejam reaproveitadas após mudanças na impressão, OMR, Edge ou schema.
- Testes isolados de mudança de um byte, inclusão de novo módulo, preservação em alteração de documentação e release bloqueado estão em `tests/da6-release-fingerprint.test.cjs`.
- Para obter o hash antes de capturar fotos reais:
  ```bash
  node scripts/da6-release-fingerprint.mjs
  node scripts/da6-release-gate.mjs --report
  ```
- No momento de homologar, guardar o hash e o SHA de commit nas evidências físicas/hospedadas, sem publicar dados de clientes. Se a implementação mudar após aprovar, **repetir os testes físicos/hospedados afetados**, criar novas evidências e atualizar o fingerprint.
- A presença de um fingerprint nunca substitui os sete gates existentes, a aprovação protegida nem o bloqueio de merge/deploy.

## Pré-checagem isolada de staging (sem deploy)

Antes de qualquer **ensaio hospedado** em ambiente remoto DA6, o operador
técnico deve identificar um projeto Supabase SEPARADO dos dois projetos
existentes da Dona Antônia. Não usar `ssbesxgaijknwsjbsbcz` (canônico) nem
`qxstkwshuvplmmftrctj` (Vitrine/Admin). Não criar novo serviço pago sem a
verificação apropriada de custos e condições.

`scripts/da6-staging-preflight.mjs` é totalmente **offline**, não usa
chaves de API, não chama Supabase e não altera sistemas. Ele exige quatro
variáveis:

- `DA6_TARGET_ENV=staging`
- `DA6_STAGING_PROJECT_REF=<ref de 20 caracteres do staging>`
- `DA6_STAGING_CONFIRM_REF=<a mesma ref verificada separadamente>`
- `DA6_STAGING_WORKER_URL=https://<ref>.supabase.co/functions/v1/admin-products-live-v1?action=inventory_label_worker_tick`

Para diagnosticar a ausência de configuração: 
`node scripts/da6-staging-preflight.mjs --report`.
Antes de executar testes no staging:
`node scripts/da6-staging-preflight.mjs --enforce`;
retorno **3 = proibição**, retorno 0 = apenas identidade de destino
verificada, **não** equivale a homologação remota ou autorização de deploy.

O script rejeita projetos de produção, confirmação divergente,
outro protocolo/host, rota inadequada e parâmetros extras. Não guardar
credenciais, URLs com tokens nem fotografias reais no GitHub. O staging
hospedado continua exigindo Auth/Storage privado, Vault, pg_net, cron,
métricas de desempenho, limites de recursos, rollback e revisão humana.
