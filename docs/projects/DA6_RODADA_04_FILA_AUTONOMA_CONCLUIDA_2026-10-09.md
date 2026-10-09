# DA6 — Rodada 4 concluída: fila autônoma, concorrência e recuperação (09/10/2026)

## Estado verificado
- Projeto: `osvaldosereia/SUCEDOAN12`; branch `agent/gondola-labels-balance-20261009`; PR #987 aberto em rascunho.
- CI final de R4: **[GitHub Actions 37940877225](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37940877225)**, com cinco jobs em `success`: `deterministic-tests`, `edge-types`, `postgres-review`, `postgres-upload` e `postgres-worker`.
- Nenhum deploy ou merge, nenhum banco canônico alterado nesta rodada, nenhum estoque atualizado e nenhuma chamada ao Bling.
- Os testes PostgreSQL foram feitos em banco efêmero; o worker Deno usou Storage simulado com arquivos PNG verdadeiros.

## Implementação concluída na branch
1. `supabase/functions/admin-products-live-v1/inventory-label-worker.ts`: limite de imagem descomprimida de 20 megapixels, antes do resize; orçamento de 40 s para iniciar um próximo item da fila, com margem abaixo do timeout HTTP de 55 s. Os limites evitam trabalho novo após esgotar o orçamento, mas não interrompem automaticamente uma decodificação já iniciada; validar tempo máximo no ambiente real antes de publicar.
2. `tests/da6-worker-postgres-fixture.sql`: PostgreSQL 17 descartável com `inventory_label_batches`, `inventory_label_photos`, `inventory_label_counts`, `products` e todas as RPCs de produção versionadas em `20261009112000_da6_worker_queue_rpc.sql`.
3. `tests/da6-worker-concurrency.test.cjs`: seis cenários reais com clientes PostgreSQL independentes e locks transacionais:
   - clientes sem `service_role` não podem retirar tarefas;
   - dois processos simultâneos obtêm **fotos diferentes** via `FOR UPDATE SKIP LOCKED`;
   - tentativas 1, 2 e 3 terminam com `failed`, sem quarta;
   - lease vencido após 5 minutos recebe novo `claim_token` e impede escrita de resultados antigos;
   - **100 fotografias** processadas por **quatro workers simultâneos**, com 100 contagens únicas e nenhum item pendente;
   - terceira execução interrompida termina em `failed`, sem contagem incorreta.
4. `tests/da6-worker-edge-queue.test.ts`: executa `inventoryLabelWorkerTick` real do Deno sobre PNG binário real proveniente de Storage simulado, com metadados SHA corretos; um QR ausente causa retentativa/erro final e nenhuma contagem; arquivo PNG informado como JPEG é bloqueado.
5. `.github/workflows/da6-inventory-labels-ci.yml`: novo job `postgres-worker` com PostgreSQL 17 e driver pg do ambiente de testes; codec Edge inclui o teste do worker; `deterministic-tests` exclui o teste de conexão com PostgreSQL (executado no job especializado). Todos os testes anteriores continuam verdes.

## Observações de segurança e condições de saída
- O banco registra **contagens históricas pendentes de revisão**, não atualizações de estoque.
- A continuação do processamento depois que o navegador é fechado depende de já haver foto confirmada no Storage. Não prometer que o navegador transmite arquivos após ser encerrado.
- Leases de 5 minutos, 3 tentativas e tokens de reserva são validados em PostgreSQL real. O servidor do banco mantém a fila independentemente do dispositivo do operador.
- O código do worker/cron ainda não foi homologado ponta a ponta com Storage real e pg_net/Supabase Edge hospedado; não declarar pronto para produção.
- O timeout de 55 s, o orçamento de 40 s e a capacidade de 3 arquivos por invocação são estratégias iniciais; medir consumo real de memória/tempo antes do deploy.

## Próxima execução: Rodada 5
- Revalidar `main` e PR #987 antes de editar, pois havia divergência de uma alteração na main.
- Fechar revisão manual e trilha auditável de contagens pendentes/rejeitadas/corrigidas; validar papel do operador e RLS, contagens duplicadas entre lotes, quantidade 0–99 e histórico, com migrações somente em banco de testes até autorização de publicação controlada.
- Testar UX de revisão em celular e desempenho, não alterar saldos do Bling/estoque.
- Manter CI de R1–R4 verde; criar checkpoint da R5.
- Seguir R6 com fotos/impressora físicas + Storage real em staging, R7 regressão A4 e site/admin/permissões, R8 publicação controlada/rollback.
