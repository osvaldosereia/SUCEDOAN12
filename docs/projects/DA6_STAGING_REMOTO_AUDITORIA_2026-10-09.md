# DA6 — Staging Supabase remoto, auditoria de implantação
**Data:** 09/10/2026. **Ambiente:** somente branch de homologação; NÃO É PRODUÇÃO nem aprovação de release.

## 1. Custo e ambiente realmente provisionado
- Organização Supabase: `zrzgcszvvjqdodqzmyrg` (plano Pro). Custo informado pelo conector: **US$ 0,01344/hora** para branch; alternativa projeto novo: US$ 10/mês. A confirmação de custo foi executada pelo conector antes de criar a branch.
- Branch: `da6-qa-20261009`; ID `812c1d56-1e8a-4236-8382-b127faac5b0e`; projeto isolado `jxfxyqcpxoykdxbapswi`; parent `ssbesxgaijknwsjbsbcz`; `with_data=false` (nenhum produto/cliente importado).
- URL de API informada pelo Supabase: `https://jxfxyqcpxoykdxbapswi.supabase.co`.
- Branch temporária gera custo pelo tempo ativa e, conforme a documentação Supabase, preview branches não são cobertas pelo Spend Cap. **Monitorar custo e excluir ao encerrar os testes**, não deixar o staging esquecido.

## 2. Proteções efetivamente executadas na branch e verificadas
- Quatro agendamentos LEGADOS da branch (conversa/WhatsApp) foram desativados exclusivamente no staging com `cron.alter_job(...,active=>false)`. Nenhum cron do projeto canônico foi alterado.
- Criadas **somente em staging** as tabelas `inventory_label_batches`, `inventory_label_photos` e `inventory_label_counts` com FKs, checks, índice de deduplicação, RLS ativo e sem grants `anon`/`authenticated`. Base espelhada a partir de consultas READ ONLY ao schema canônico, sem copiar dados reais.
- Bucket privado `inventory-label-photos`, limite 10 MiB por objeto, permitido JPEG/PNG/WebP. Sem políticas `storage.objects` abertas na branch.
- Migrations DA6 aplicadas com sucesso via conector **na branch staging**: `da6_qa_staging_baseline_tables_v1`, `da6_worker_queue_v1`, `da6_worker_vault_key_v1`, `da6_manual_review_audit_v1`, `da6_upload_atomic_reservation_v1`, `da6_staging_worker_dispatch_cron_v1`.
- Tabela de revisão `inventory_label_review_events` presente com RLS. Consulta de privilégios: RPCs `da6_worker_dispatch_tick_v1`, `da6_worker_key_v1`, `inventory_label_claim_next`, `inventory_label_fail_photo`, `inventory_label_finish_photo`, `inventory_label_reserve_photo_v1` e `inventory_label_review_count_v1` negam EXECUTE a `anon` e `authenticated`, e permitem `service_role`.
- Chave de worker gerada exclusivamente no Vault do staging. URL/ID de destino gravados no Vault apontam à **própria** branch `jxfxyqcpxoykdxbapswi`. **Nenhum valor secreto exposto em arquivo ou chat**.
- Função Edge `admin-products-live-v1` implantada na branch, versão **163**, estado Supabase `ACTIVE`, incluindo `index.ts`, `inventory-label-photo-api.ts`, `inventory-label-worker.ts`, `inventory-label-worker-omr.ts`; versão compilada SHA-256 `919c935c3d8f4a7034be9e1e0ee99fa88f93e8867fd6c81212700b2e191dc9f7`. O `verify_jwt=false` mantém o mecanismo próprio do código (autenticação de operador e chave x-da6-worker-key exclusiva para worker), **somente em staging**.
- Cron DA6 `inventory-label-worker-da6-v1` criado e **DESATIVADO**. Sua função foi invocada manualmente com fila vazia; resultado verificável `{"ok":true,"no_op":true,"reason":"queue_empty"}`. Nenhuma chamada HTTP de worker foi iniciada: foto/lote inexistente.
- Ao encerrar a rodada, `inventory_label_batches=0`, `photos=0`, `counts=0`, `review_events=0` na branch. Todos os cinco cron jobs no staging estavam `active=false`.
- Reconsulta ao projeto **produtivo** `ssbesxgaijknwsjbsbcz`: `batches=0`, `photos=0`, `counts=0`; cron legado `inventory-label-worker-da6-v1` permaneceu `active=true`. Nenhuma alteração de estoque/Bling/produção.

## 3. Itens críticos NÃO homologados
1. **BRANCH STATUS INCONSISTENTE:** o conector registra `preview_project_status=ACTIVE_HEALTHY`, banco aceita SQL e Edge `ACTIVE`, porém estado da branch `MIGRATIONS_FAILED`. Não dar como normalizado; investigar o pipeline de sincronização de migrações Supabase antes de autorizar release.
2. **HTTP ponta a ponta não realizado:** uma tentativa de abrir a URL pela ferramenta de acesso web não foi permitida; teste de `curl` no ambiente desta execução falhou por DNS, não por resposta do aplicativo. **Não existe prova** de retorno HTTP 200/401/405, upload real via Storage hospedado, nem dos retornos do worker por pg_net.
3. **Cron/pg_net hospedado não homologado:** apenas o no-op de fila vazia foi comprovado. O agendamento permanece desativado até teste controlado e revisão de credenciais/allowlist.
4. **Fotos reais e impressora** ausentes: nenhuma impressão em 203 dpi/100×150 mm ou fotografia de celular real foi examinada. Sem testes de 0/1/7/10/23/99 com sombra/dupla marca/QR danificado.
5. **Rollback/backup** produtivo e de staging ainda não ensaiados. Falha preexistente no CI genérico Admin and Baskets Guard (`channel_origin`) pertence a fluxo paralelo e não deve ser silenciada.

**Consequência:** todos os sete gates em `docs/projects/DA6_RELEASE_GATES_2026-10-09.json` mantidos `passed:false`; `release_status=blocked`, `release_candidate_fingerprint=null`. CI local digital 6/6 e 87/87 de `37978738727` não equivale a prova hospedada.

## 4. Próximas ações exatas, sem refazer implementação
- Resolver/status de migrations da branch; confirmar `status` da API e migrações reais, sem `reset_branch` ou `merge_branch` em produção.
- A partir de executor que consiga resolver a URL do staging, chamar Edge com requests autenticadas e negativas, criar **usuário/produto 100% artificiais** e medir 10/50/100 uploads assinados reais, upload via navegador fechado, leitura OMR, retries, cron controlado e trilha de revisão. Não subir dados de clientes.
- Somente depois, habilitar cron DA6 temporariamente no staging, observar `net._http_response` e Edge logs, desligar novamente ao fim do ensaio; outros quatro cron legados devem ficar permanentemente desativados.
- Executar com impressora e celular reais; anexar evidências em local privado, colocar cabeçalhos `DA6_ATTESTATION_V1` por gate/documento somente após execução e aprovação verificadas.
- Com staging aprovado, planejar backup, rollback, freeze SHA exato, `--enforce`, revisão protegida, rollout gradual. **Não executar merge/deploy automático.**

Este documento é um checkpoint do staging REAL, não uma certificação final nem comprovação dos testes físicos.

## 5. Reteste real de HTTP/worker no staging (09/10/2026)

**Atualização posterior com resultados concretos:** a limitação anterior de DNS do executor foi contornada usando o `pg_net` **dentro do próprio projeto staging**. A Edge Function remota foi alcançada por HTTPS:
- API health `200`; worker sem chave `401`; chave incorreta `401`; com segredo do Vault e fila vazia `200/processed:0`; operador anônimo `401`; método GET no worker `405`.
- Foto **100% artificial**, sem blob, gerou status `retry` na tentativa 1, `retry` na tentativa 2 e `failed` na 3, erro `storage_read_failed`; 4ª invocação `processed:0`, não ultrapassou 3. Backoff antecipado manualmente na única fixture para realizar ensaio rápido; cron da branch continuou desativado.
- Fixture foi excluída sob verificação; staging voltou a `auth.users=0`, `batches=0`, `photos=0`, `counts=0`, `review_events=0`. Produção não foi modificada.
- Investigação de `MIGRATIONS_FAILED`: histórico de produção tem 1187 migrações; branch herdou 145 até `20260908200406`, mais 6 DA6 staging. Primeira ausente: `20260908200932 whatsapp_sales_official_resources_homologation_v1`; exige `whatsapp_release_mode=live` e MVP true, enquanto staging tem `off` e MVP false. **Causa provável, não prova do erro exato do workflow**. Não habilitar WhatsApp nem copiar >1000 migrações para contornar a falha.
- Documento específico de evidência **não aprovadora**: `docs/projects/DA6_STAGING_HTTP_REAL_WORKER_RETRY_2026-10-09.md` (commit `0196bf3438a0f8c1949427730243ead1f7ab6e11`).

**Limites mantidos:** nenhum upload real de foto no Storage hospedado, QR/OMR real, cron automático com foto, ensaio físico, backup/rollback ou revisão da main; sete gates de produção permanecem bloqueados, PR #987 DRAFT. Staging ativo continua cobrando US$ 0,01344/hora.
