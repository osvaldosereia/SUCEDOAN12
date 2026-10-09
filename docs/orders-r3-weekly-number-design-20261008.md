# R03 — Numeração semanal do pedido (draft; não implantado)

**Plano:** [#964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964) · **PR:** [#968](https://github.com/osvaldosereia/SUCEDOAN12/pull/968) · **Base de código:** PR #953, branch `agent/orders-code-identity-fix-20261008`.

## Evidência do runtime canônico consultada somente leitura
- `public.orders.order_number`: `text`, `NULL` permitido, índice parcial `orders_order_number_uq` para não nulos.
- `public.order_public_snapshots_v1.public_code`: `text`, `NOT NULL`, unique `order_public_snapshots_v1_public_code_uidx`; default antigo `ops2_format_order_public_code_v1(nextval('order_public_code_seq_v1'))`; check atualmente restrita ao legado `AA001`.
- `orders` tem triggers de cadastro, WhatsApp, fiscal, movimentações e status; alterar o `order_number` após `INSERT` poderia acionar efeitos colaterais. Portanto o número nasce em **BEFORE INSERT** e é copiado **em AFTER INSERT** para o snapshot antes de tarefas do checkout.
- Origens observadas: `vitrine`, `storefront_v2`, `manual_whatsapp`, `shopping_room`, `bling_import`, `system_canary`, `legacy`. A nova regra trata apenas pedidos de cliente das origens `vitrine`, `storefront_v2`, `manual_whatsapp`, `papoai`, `reorder`; imports não recebem número artificial de pedido de cliente.

## Contrato de identidade
- Formato fixo: **`DD|MM|AAAA - 001`** (ex.: `08|10|2026 - 001`). Os símbolos são literais, não uma URL.
- A data do prefixo é o **dia de criação em Cuiabá**, mesmo quando a operação é disparada de servidor UTC.
- A sequência é única e crescente dentro da semana ISO **segunda 00:00 a domingo 23:59 em America/Cuiaba**. No próximo início de semana, volta a **001**. Sábado e domingo só mudam o prefixo diário, não reiniciam a sequência.
- `orders.order_number` é criado **na mesma transação de INSERT**, antes da fila WhatsApp. O snapshot recebe **o mesmo valor**. Cartões do Admin, `/montar` e notificações não podem criar outro número.
- Usa tabela `order_public_weekly_counters_v1` com `PRIMARY KEY week_start` e `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, assegurando atomicidade sob concorrência, com até 999 posições por semana. Ao alcançar o limite, falhar fechado (não reciclar número). Reavaliar capacidade antes de rollout se volume mudar.
- Guarda imutabilidade do campo `orders.order_number` quando em formato novo e de `snapshot.public_code` sempre.
- Histórico `AA000` ou quatro dígitos preservado; snapshots importados ainda usam o gerador anterior quando necessário, mas UPSERTs de snapshot já existente não consomem número novo.
- Segurança: helper com EXECUTE restrito, contador com RLS e sem acesso `anon/authenticated` direto. Revisão de privilégio de trigger SECURITY DEFINER antes de qualquer deploy.

## Teste em PostgreSQL descartável
Arquivo draft de migração `supabase/migrations/20261008032000_order_public_identity_at_creation_v1.sql` **substituiu a proposta antiga de quatro dígitos dentro do PR ainda não aplicado**. Não é uma migration extra aplicada a clientes. Testes em `scripts/sql/orders-public-identity-assertions-v1.sql`, fixture `scripts/sql/orders-public-identity-integration-v1.sql`, workflow `orders-public-identity-postgres-ci.yml`.

Cenários: novo número na criação, snapshot único e atualizado após inserir itens, replay de checkout com pedido único, duas requisições simultâneas com a mesma idempotência, estoque sem sobrevenda, rollback, data Cuiabá versus UTC, domingo→segunda, terça mantendo sequência, dois contadores concorrentes, import Bling sem renumeração, código histórico intacto, restrição de EXECUTE.

## Pendências antes de afirmar R03 concluída
- CI PostgreSQL 17 totalmente verde e sem falhas por fixtures.
- Teste de compatibilidade de **todos os consumidores** de `order_number` e `public_code`: vitrine cliente, Admin, `/montar`, Bling, Meta e vitrine de separação. Alguns padrões regex podem esperar `AA000` ou quatro dígitos; textos com `|` e espaços devem ser tratados como **dados**, nunca concatenados sem `encodeURIComponent` para URL.
- Identificar o fluxo de origem `shopping_room` antes de decidir se também deve receber numeração semanal.
- Confirmar que nenhum componente ainda aloquem IDs localmente quando já existe `orders.order_number`.
- Validar rollback com triggers reais num **clone canônico completo**, ainda bloqueado pela R02.
- Não fazer merge/implantação na `main` nem alterar Supabase produtivo sem revisão.

**Situação:** desenvolvimento em branch draft; **não ativado para pedidos reais**.
