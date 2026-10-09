# R02 — Laboratório isolado e homologação sintética dos pedidos (08/10/2026)

**Plano:** [issue #964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964) · **Base:** R01 [PR #965](https://github.com/osvaldosereia/SUCEDOAN12/pull/965) · **Branch:** `agent/orders-r2-isolated-hml-20261008`.

## Isolamento demonstrável
- Banco **PostgreSQL 17 efêmero** iniciado como serviço local do GitHub Actions, nome `synthetic_orders_r2`, sem conexão ao projeto Supabase produtivo. Todos os dados são fictícios e recriados desde zero a cada execução; job descartado ao encerrar.
- Schema próprio `r2_hml`, usando uma **seleção mínima dos nomes e tipos auditados via SQL read-only do canônico**: `orders`, `order_items`, `order_separation_completions_v1`, `dispatch_fiscal_jobs`. A tabela `confirmation_events` é um **dublê explícito**, não a tabela de outbound Meta em produção.
- As rotinas `r2_hml.checkout_once`, `r2_hml.apply_verified_confirmation`, `r2_hml.finish_separation` e `r2_hml.claim_fiscal_job` são **dublês criados apenas no CI** para exercícios de contrato, **não** são as RPCs canônicas.
- Transportes externos falsos no CI: `HOMOLOGATION_TRANSPORT=disabled`, `BLING_LIVE_ENABLED=false`, `META_LIVE_ENABLED=false`, `FISCAL_LIVE_ENABLED=false`. Os testes JS usam **somente métodos fake síncronos** e a função pura de decisão fiscal de R01. Nenhum token, serviço Meta, Bling ou endpoint SEFAZ precisa ser configurado.
- A geração de `access_key` de 44 dígitos nos testes é **sintética**, sem valor fiscal.
- **Não** foi criada branch do Supabase, nem se rodaram migrations ou inserts na produção; a implantação real permanece bloqueada.

## Artefatos
1. [scripts/sql/orders-r2-hml-schema.sql](../scripts/sql/orders-r2-hml-schema.sql): schema do laboratório e funções SQL dublês.
2. [scripts/sql/orders-r2-hml-assertions.sql](../scripts/sql/orders-r2-hml-assertions.sql): dados sintéticos, falha antes da confirmação, evento Meta falso, replay de checkout, separação com falta, total 230→198, intenção fiscal única e rollback.
3. [scripts/test-orders-r2-transport-offline.mjs](../scripts/test-orders-r2-transport-offline.mjs): usa a função de política fiscal real e provedores fake para simular timeout, reconciliação de nota anterior, autorização SEFAZ e rejeição. Autorizar a nota **não altera status físico** do pedido.
4. [.github/workflows/orders-r2-isolated-hml-ci.yml](../.github/workflows/orders-r2-isolated-hml-ci.yml): banco descartável, testes e dois `psql` concorrentes tentando reivindicar a mesma intenção.

## Matriz de validação
| Situação | Método | Resultado exigido |
|---|---|---|
| Pedido abaixo de R$ 75 | SQL sintético | Negar criação |
| Duplo checkout idempotente | SQL sintético | Mesmo `order_id`, nenhuma segunda linha |
| Chave idempotente com payload divergente | SQL sintético | Rejeitar replay |
| Confirmação não assinada/texto diferente | SQL sintético + política real | Não confirmar / não emitir |
| `CONFIRMADO` nos canais 0975 e 1018 | SQL sintético | Aceitar após verificação no servidor; dedupe por evento |
| Evento Meta reciclado para outro pedido | SQL sintético | Rejeitar |
| Falta de item após checkout de R$ 230 | SQL sintético + política fiscal real | Total separado R$ 198, sem segundo checkout |
| Conclusão repetida | SQL sintético | Um registro e uma única intenção fiscal |
| Falha antes de `COMMIT` | Transação/ROLLBACK | Nenhum pedido órfão |
| Dois workers simultâneos | 2 conexões `psql` e `FOR UPDATE SKIP LOCKED` | Exatamente um claim |
| Emissão de NF-e com timeout incerto | Simulador Node | Consultar nota prévia, **não repetir POST** |
| Chave NF-e ausente ou rejeição | Política real + fake | Bloquear saída |
| Nota autorizada com ID, chave 44 dígitos, SEFAZ | Política real + fake | Liberar para expedição **sem** marcar saída física |

## O que falta para R02 ser homologação de verdade
Este exercício valida **invariantes e mocks** em ambiente PostgreSQL isolado, mas **não prova compatibilidade integral com os 1.168 migrations nem executa as funções/triggers reais do runtime produtivo**. A tentativa anterior de branch Supabase com todas as migrations falhou. Antes de marcar R02 integralmente concluída:
1. Extrair estrutura canônica das relações/RPCs necessárias por mecanismos read-only e montá-la em sandbox descartável **sem dados pessoais**; resolver dependências determinísticas sem saltar controles.
2. Reexecutar testes com `create_vitrine_cart_order_v3`, reserva de estoque, funções reais de separação e ledger fiscal **ou demonstrar compatibilidade funcional explicitamente limitada**, mantendo o gate de produção bloqueado.
3. Registrar conflitos de DDL, gatilhos, grants/RLS e patches propostos; testar concorrência/rollback nos caminhos reais.
4. Não ativar automaticamente o fiscal por conta do CI de mocks.
5. Aplicar o gate técnico de R02 somente após os itens acima; até lá: **R02 infraestrutura sintética pronta, homologação canônica pendente**.

## Continuidade
- R03 será responsável por número público imutável `DD|MM|YYYY - 001`, sequência semanal reiniciando na segunda-feira do fuso `America/Cuiaba`, checkout atômico e compatibilidade com consumidores. O PR #953 contém uma versão de **quatro dígitos**, logo **não pode ser mesclado como está**.
- Prioridade R04–R10 continua confirmação Meta autenticada, separação, reconciliação Bling, ledger/worker e NF-e sem duplicidade.
- Produção continua com gate fiscal de saída ativo e emissão fiscal automática desativada.

**Checkpoint:** este arquivo foi escrito como parte do R02 e não é evidência de deploy, comunicação, emissão ou homologação real de NF-e.


## Ampliação R02 — Exercício das RPCs reais do checkout, reserva e separação

Após o primeiro checkpoint de mocks, recuperamos **diretamente por SQL read-only `pg_get_functiondef`** os corpos atualmente implantados das seguintes cinco RPCs do projeto canônico:

| Função realmente implantada | MD5 da definição no runtime | Teste isolado |
|---|---|---|
| `create_vitrine_cart_order_v3` | `798d9c25e61e2babafa2b21ca8d0e83a` | Reserva atômica e rollback de falha |
| `reserve_vitrine_order_stock_v1` | `754d532252dd403a2fcbca2e2b267a52` | Reserva repetida, falta de estoque, 2 checkouts concorrentes |
| `ops2_prepare_order_separation_completion_v2` | `c70404a34b5cf48bc88b5d72eccebf86` | Conclusão com falta, total R$230→R$198, versão desatualizada, item pendente e replay |
| `ops2_apply_order_separation_stock_v2` | `411be8e90579e966f002acb15dc7652d` | Consome somente item separado, libera falta e não duplica movimento em replay |
| `ops2_mark_order_separation_completion_v2` | `c90080ab9a6764ee7ab8b2eb7eeff073` | Marca `completed`, preserva código original e carimbo persistido |

As definicões acima são extraídas de **produção somente para leitura** e copiadas sem lógica de negócio alterada para:
- `scripts/sql/orders-r2-canonical-checkout-reservation.sql` e `scripts/sql/orders-r2-canonical-separation-functions.sql`.
- `scripts/sql/orders-r2-canonical-dependencies-fixture.sql`: fixture de dependências sintéticas aproveitada do PR #953, **sem reutilizar a migration antiga de quatro dígitos**.
- `scripts/sql/orders-r2-canonical-runtime-assertions.sql`: testes do código real com falso `create_vitrine_cart_order_v3_base`, sem cliente real.
- `scripts/sql/orders-r2-canonical-separation-fixture.sql` + `scripts/sql/orders-r2-canonical-separation-assertions.sql`: segunda base efêmera e dados sintéticos; inicialização `ops2_init_order_separation_v2` ainda é dublê explícito; a consolidação, aplicação de reserva e marcação final são **as funções reais**.

**Isolamento:** o CI cria `synthetic_orders_r2` e `synthetic_separation_r2` como bancos descartáveis de PostgreSQL 17. Nenhuma conexão ao Supabase de produção é feita pelo CI; não é criado cliente real, documento fiscal, movimentação física ou envio WhatsApp.

**Limitação expressa:** esses testes executam cinco funções canônicas atuais com dependências selecionadas, **não** as 1.168 migrations/129 Edge Functions, nem todos os triggers reais, nem o checkout completo de `create_vitrine_cart_order_v3_base` ou a inicialização real da separação. Testes da identidade semanal e da integração Meta/Bling/SEFAZ continuam nos marcos posteriores. Se as definições do runtime mudarem, recapturar/validar MD5 antes da homologação final. Isso não é gate para NF-e em produção.

**Evidência:** resultados do workflow `orders-r2-isolated-hml-ci.yml`; verificar conclusão da execução correspondente ao SHA da branch após esta atualização. Não marcar como aprovado um workflow ainda em andamento.
