# DA6 — Rodada 7: regressão A4, concorrência da interface e auditoria (09/10/2026)

## Estado da programação e testes
- Projeto `osvaldosereia/SUCEDOAN12`; branch `agent/gondola-labels-balance-20261009`; PR [#987](https://github.com/osvaldosereia/SUCEDOAN12/pull/987) aberto em draft.
- **CI DA6 [GitHub Actions #37954882564](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37954882564): 6/6 jobs SUCCESS**, incluindo `deterministic-tests` (**69/69 PASS, 0 FAIL**), `edge-types`, `postgres-worker`, `postgres-review`, `postgres-upload` e `local-supabase-storage`.
- **Nenhum deploy ou migração DA6 em produção nesta rodada**. Nenhum pedido, estoque, Bling ou nota fiscal foi modificado.
- No fim da execução, a branch estava **192 commits à frente e 1 atrás da main**. A main recebeu arquivos novos para idempotência de reserva na separação de pedidos, sem sobreposição nominal com DA6; GitHub relatou PR `mergeable=false` no último instante. **Não forçar merge**; reavaliar estado de merge e conflitos reais antes do rollout.

## Correções aplicadas
1. `vitrine/admin/inventory-label-photo-tab.js`: respostas de polling atrasadas não podem substituir os resultados de um lote que o operador selecionou depois. O controle `statusSeq` invalida consultas antigas ao mudar entre A4/fotografias, sair da tela ou trocar lote; o resultado só é renderizado se ainda corresponder ao lote, modo e requisição ativos. A lista dos lotes também não altera uma tela abandonada. Preservado `hidden` original de todos os controles A4 e o comportamento da câmera ao retornar à leitura.
2. `tests/da6-a4-photo-regression.test.cjs`: testes Chrome real, viewport 390 px, para alternância de A4 → fotos → A4, controles ocultos desde a origem, retorno da câmera, botão A4 inalterado, atualização de lotes fora de ordem e resposta após deixar a aba. Verifica ainda presença de `renderBalance` e fluxos `inventory_sheet_create` e `inventory_sheet_analyze` do balanço A4 no Admin.
3. `tests/da6-photo-confirm-cas.test.ts`: cinco verificações Deno reais da lógica da API contra confirmação de arquivo com `UPDATE` sem linha afetada, status concorrente atualizado, conflito 409, foto deletada durante confirmação, bytes com tamanho divergente e usuário `viewer` impedido. O endpoint já tinha a lógica de verificação CAS; os testes garantem sua manutenção.
4. `.github/workflows/da6-inventory-labels-ci.yml`: adicionado teste Deno do CAS; a compilação tipada foi corrigida no arquivo de teste usando narrowing explícito das respostas da API.

## Auditoria de regressão e segurança
- A nova aba mantém separado o histórico de fotos do saldo vigente: **não chama `inventory_balance_commit` nem sincroniza Bling automaticamente**.
- Testes reais existentes de QR/OMR, impressora 203 dpi simulada, upload assinado local 10/50/100, 160 arquivos na fila, ACL/RLS e revisão foram reexecutados e passaram nesta rodada.
- No projeto canônico `ssbesxgaijknwsjbsbcz` (leituras SQL, sem mutações): `inventory_label_batches=0`, `inventory_label_photos=0`, `inventory_label_counts=0`; tabela de auditoria R5 ainda ausente; bucket privado `inventory-label-photos` com limite 10 MiB. Há um job pg_cron `inventory-label-worker-da6-v1` ativo a cada minuto, mas sem fotos na fila. Ele **não foi modificado aqui**.
- A Edge Function `admin-products-live-v1` publicada estava na versão 160 na consulta desta rodada, ainda sem validação/publicação da branch DA6.
- O workflow geral **Admin and Baskets Guard CI** segue falhando na exigência `channel_origin` para `pedido/index.html`. A auditoria confirmou que esse arquivo tem **SHA idêntico na main e na branch** (`594ba50d1122474355b91f9da744053e91749c83`) e o marcador está ausente nas duas. É problema preexistente ao DA6; **não alterar o fluxo público de pedidos em uma correção de balanço**. Resolver no projeto responsável antes de exigir todos os checks globais verdes.

## Gates e próximo trabalho
- **Rodada 7 de código/regressões DA6: encerrada com CI específico 6/6 verde.** O projeto como um todo **NÃO** está pronto para produção.
- Ainda pendente a **homologação física** em impressora térmica real 203 dpi e fotos feitas por celular: posição das quatro referências, leitura de QR/Code128, seis registros preenchidos, inclinação, sombras, desfoco e retentativa, sem contagens erradas.
- Pendente um ambiente remoto separado para provar o gateway Edge e o cron/pg_net hospedados, medindo duração, memória e conexão real sob lote 100.
- Pendente revisar PR mergeable/conflitos da main e o CI geral `Admin and Baskets Guard`, sem sobrescrever commits de separação ou pedidos.
- **Próxima fase R8 é PREPARAÇÃO de implantação:** plano de migrações em ordem, Vault/URL por ambiente, rollback, checks operacionais e publicação gradual **apenas quando os gates físicos/remotos e CI necessários estiverem comprovados**. Não publicar sem essa evidência.
- Manter a automação horária até a implantação e relatório final, sem declarar que o sistema está pronto antes da liberação segura.
