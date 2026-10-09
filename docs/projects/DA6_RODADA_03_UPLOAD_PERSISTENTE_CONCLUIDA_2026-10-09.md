# DA6 — Rodada 3 concluída: Upload persistente e retomável (09/10/2026)

## Estado verificado
- Repositório: `osvaldosereia/SUCEDOAN12`, branch `agent/gondola-labels-balance-20261009`, PR draft #987.
- **Sem merge, sem deploy, sem estoque/Bling alterados.**
- CI da implementação R3: [run 37938346810](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37938346810): quatro jobs aprovados — Node 49/49, Deno/WASM, PostgreSQL17 revisão e PostgreSQL17 reserva. Última mudança da migração foi a rejeição explícita de SHA NULL e requer CI mais recente verde.
- Supabase canônico `ssbesxgaijknwsjbsbcz`: bucket `inventory-label-photos` privado; na inspeção inicial havia 0 lotes, 0 fotos e 0 contagens. **A migração transacional da R3 não foi aplicada ao canônico; o gateway Edge publicado ainda não contém rotas DA6.**

## Correções implementadas e integradas à branch
1. `supabase/migrations/20261009150000_da6_upload_atomic_reservation_v1.sql`: função RPC `inventory_label_reserve_photo_v1` restrita a `service_role`, com `SELECT ... FOR UPDATE` na linha do lote, proprietário conferido no banco, validação estrita de MIME, SHA-256 e tamanho de 1 até 10MiB, máximo de arquivos do lote e resultado de deduplicação por hash/operador. Não tem chamadas a produtos/estoque/Bling. Não usa IA.
2. `supabase/functions/admin-products-live-v1/inventory-label-photo-api.ts`: passou a reservar arquivo por RPC transacional, evitando condição de corrida na consulta de COUNT; se o objeto já chegou ao Storage, envia `needs_confirmation`; caso contrário renova URL assinada de upload; fotos já recebidas e de outros lotes são marcadas como repetidas. Erros de concorrência geram conflito 409 para tentativa posterior, não falso sucesso.
3. `vitrine/admin/inventory-label-photo-upload.js`: lê os primeiros bytes e valida assinaturas JPEG/PNG/WebP antes da reserva; aceita `options.batch_id` para reusar o lote existente sem criar outro; conserva contagem e progresso por item, confirmação individual, detecção de duplicidade.
4. `vitrine/admin/inventory-label-photo-tab.js`: opção explícita “Retomar lote selecionado”, conserva seleção após falhas e comunica status `recebidas` sem prometer `processadas`. Reabrindo a página, seleciona-se o lote anterior e as fotos pendentes para retomar.
5. `supabase/functions/admin-products-live-v1/inventory-label-worker.ts`: compara assinatura dos bytes armazenados com MIME informado antes da decodificação com ImageMagick WASM; continua verificando SHA256 e comprimento reais.
6. `tests/da6-upload-batch-resume.test.cjs`: 10/50/100 fotos com dados binários sintéticos JPEG, três estágios do servidor simulado, idempotência ao reenviar 100 fotos, erro no quinto arquivo e retomada no mesmo lote, rejeição de conteúdo PNG disfarçado de JPEG, tamanho limite e prova de preservação do estado `queued` após perder estado do navegador.
7. `tests/da6-upload-postgres-fixture.sql` + `da6-upload-postgres-assertions.sql`: PostgreSQL17 isolado com rollback, 10 slots, dedup após upload/retomada, limites, sessão/service role, lote de outro operador, MIME, tamanho e SHA inválidos, e independência de operadores.
8. `.github/workflows/da6-inventory-labels-ci.yml`: job `postgres-upload` com PostgreSQL17, além de `deterministic-tests`, `edge-types` e `postgres-review`. Todo código sujeito a CI na branch.

## Critérios de saída da programação R3
- [x] 10, 50 e 100 fotografias simuladas sem perda/duplicação de itens na fila.
- [x] Retomada no mesmo lote depois de upload parcial, sem recriar reservas de fotos já enfileiradas.
- [x] Validar assinatura binária antes de aceitar foto do celular e no worker.
- [x] Lote e deduplicação idempotentes no PostgreSQL com trava transacional e regras de capacidade em testes isolados.
- [x] UI de retomada manual; confirma fotos individualmente. O celular só pode ser fechado quando o upload estiver confirmado.
- [x] Deno Edge e PostgreSQL17 integrados no CI.
- [ ] Teste **real** de upload assinado com Supabase Storage, usuários autenticados, 100 arquivos, interrupção do navegador e cron/worker integrado: depende de publicar gateway homologado ou ambiente de staging. Continua gate de integração de R4/R6/R8, NÃO houve execução sobre fotos de clientes.
- [ ] Teste de concorrência com dois processos PostgreSQL físicos em paralelo: bloqueio `FOR UPDATE` implementado e capacidade verificada sequencialmente no banco isolado; aprofundar em R4.

## Próxima rodada R4
- Revalidar HEAD/CI e migrar atenção para o worker e cron: processamento persistente independente do navegador, 3 tentativas por fotografia, locks/leases de 5 minutos, tratamento de falha e recuperação, timeout/memória de ImageMagick, filas em 100 fotos sem disparos indevidos, métricas e segurança dos tokens.
- Incluir provas automatizadas de concorrência e `SKIP LOCKED` em banco isolado e testes de recuperação de job interrompido.
- Manter R1-R3 verdes e documentar. **Não publicar** até passar por homologação física e integridade do Admin.
