# DA6 R13 — Cron automático hospedado e integração fiscal R2 sem conflitos

**Data:** 09/10/2026. **Staging Supabase:** jxfxyqcpxoykdxbapswi. **GitHub:** PR #987 DRAFT (sem deploy ou merge de produção).

## 1. Ensaio REAL de agendamento remoto (com fixture 100% artificial)

Antes do ensaio, conferidos no banco: nenhum usuário, lote, foto ou arquivo no staging; quatro crons legados de WhatsApp/atendimento DESATIVADOS. Criado um único usuário Auth sintético, um lote DA6 identificado como QA e uma única foto artificial enfileirada sem arquivo real no Storage, somente na branch da6-qa-20261009.

Ativado SOMENTE o job pg_cron inventário DA6 `inventory-label-worker-da6-v1` (jobid=5, schedule `* * * * *`) no staging, com comando `select public.da6_worker_dispatch_tick_v1();`. Resultado observado diretamente, sem invocação manual do worker:

- `cron.job_run_details`: runid **5**, início `2026-10-09 20:25:00 UTC`, `status=succeeded`, `return_message=1 row`.
- `cron.job_run_details`: runid **6**, início `2026-10-09 20:26:00 UTC`, `status=succeeded`, `return_message=1 row`.
- A foto artificial saiu de `queued`, foi processada pelo worker sob chamada agendada e passou a `retry`, **`attempts=2`**, `error_code=storage_read_failed`, próxima tentativa programada. O erro era intencional (blob inexistente), evitando exposição de dados reais.

**O que este ensaio demonstra:** agendamento pg_cron → dispatcher da6 → pg_net + Vault → Edge Worker e máquina de estado de retentativa em staging remoto. Não comprova interpretação óptica de fotografias reais nem sucesso do processamento de uma imagem válida.

**Encerramento seguro EXECUTADO:** após evidência de duas execuções, `cron.alter_job(...active=>false)` apenas no projeto staging. Reconsulta: **todos os cinco cron jobs ativos=false**, inclusive DA6 e os quatro legados. Fixture eliminada por IDs/operador/identidade estritos. Staging verificou: `auth.users=0, inventory_label_batches=0, inventory_label_photos=0, inventory_label_counts=0, storage.objects DA6=0`. Nenhuma alteração em canônico, estoque, Bling, pedidos ou WhatsApp.

## 2. Reconciliar nova main fiscal R2 sem tocar DA6

A main GitHub avançou do commit base `168558b6b8710ee7feda1b7c6a9360357357b0d3` para `baf21c4280ecb51b6eed4cf704f5ab6143301844` (+12 commits, alterando 17 arquivos de fiscal R1/R2, testes e documentação). Comparação com a branch DA6 revelou **ZERO arquivos compartilhados** nas alterações após esse base.

Para manter o PR DA6 mesclável sem substituição de runtime, todos os 17 caminhos de main foram incorporados usando os SHAs dos seus blobs originais. Os dois arquivos de main modificados que já existiam no repositório (`scripts/test-fiscal-ncm-remote-gap-v2.mjs` e `supabase/functions/admin-service-intelligence-v1/index.ts`) foram previamente verificados por SHA como idênticos ao base na branch DA6, para evitar perdas. Criado um commit real de merge com dois pais **`fe1c376986306e86ff23a4c5e3c4de6d26a0e89e`**, preservando integralmente toda a árvore DA6. A branch foi avançada com `expected_sha` e `force=false`. O PR #987 retornou DRAFT `mergeable=true`, `behind=0` na fotografia daquele momento.

**CI pós-merge REAL:** GitHub Actions [#37986675847](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37986675847) COMPLETED **SUCCESS**, commit fonte `fe1c376986306e86ff23a4c5e3c4de6d26a0e89e`. Os seis jobs `postgres-worker`, `deterministic-tests`, `edge-types`, `postgres-review`, `local-supabase-storage`, `postgres-upload` deram SUCCESS; **87/87 testes determinísticos PASS, zero FAIL**. Manifesto atualizado com a evidência em `docs/projects/DA6_RELEASE_GATES_2026-10-09.json` (commit `a7904e85bd3b8ba3b1088fe6fd293b39ddf7372c`). Essa CI prova integração digital, NÃO valida hardware ou rollback físico.

## 3. Riscos e pendências irredutíveis

- **IMPRESSORA/CELULAR REAIS:** necessária etiqueta térmica 100 × 150 mm impressa em 203 dpi, fotos de celular verdadeiras com marcações 0/1/7/10/23/99, inclinação/sombra, QR danificado/duplicação e revisão assertiva. PNGs sintéticos 1×1 anteriores não são essa prova.
- **Backup e rollback físico/produtivo:** snapshot restaurável, plano de reversão testado antes de qualquer deploy. Ainda não ensaiados.
- **Supabase MIGRATIONS_FAILED:** pipeline de criação da branch ficou atrás do ledger produtivo em ~1000 migrações históricas; migração WhatsApp seguinte demanda modo `live`, que deve permanecer desativado no staging. Banco e gateway staging ativos, mas NÃO mascarar esse estado por migrações fictícias, `reset_branch` ou `merge_branch`.
- A main do projeto é alterada continuamente por outros projetos; verificar SHA e CI antes da revisão/merge final.
- **Release bloqueado**: sete `required_production_gates.passed=false`, `release_status=blocked`, `release_candidate_fingerprint=null`. PR #987 DRAFT. Nenhuma implantação produtiva realizada.
- Custo do staging aprovado US$ 0,01344/hora + uso, fora do Spend Cap. O ambiente deve ser destruído após concluir QA ou mediante orientação do usuário, não deixá-lo acumulando custo indefinidamente.

**Próxima etapa:** organizar sessão de teste em impressora e celular reais e ensaio de backup/rollback. Não repetir testes digitais 10/50/100 e cron já comprovados. Priorizar soluções ao drift de migrations sem alterar o modo seguro do WhatsApp.
