# R02 + R03 + R04 + R05 — Integração real do checkout, número público e confirmação Meta

**Data:** 09/10/2026 · **Projeto:** Dona Antônia · **Issue principal:** [#964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964)

## Resultado

**[CI integrada #37939894155 — SUCCESS](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37939894155)** e **[CI de regressão R02 #37939894053 — SUCCESS](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37939894053)**. Testes usam **PostgreSQL 17 descartável** com números, contas, mensagens e produtos fictícios. Não existem conexões com Meta, Bling, Supabase canônico ou SEFAZ durante os testes.

Branch `agent/orders-r2-r5-meta-chain-20261009`, empilhada sobre [R02/R03 + views reais do Bling — PR #1000](https://github.com/osvaldosereia/SUCEDOAN12/pull/1000). **Não mesclada, não publicada e sem migrations aplicadas.**

## O que foi integrado sem duplicar o código R03–R05

1. A **função canônica `create_vitrine_cart_order_v3_base`**, o wrapper e a reserva, exportados anteriormente da produção só por leitura, sob as correções *draft* do pedido mínimo R$75 e cestas com grupos independentes.
2. A **migration R03 original**, carregada do commit fixo `e7408ad5cbcd6ae8d5ca16e90f2e287a7d61af4c`, que aloca o número público `DD|MM|YYYY - NNN` na transação. O SQL candidato R02/R03 lê o número gravado pelo trigger, garantindo o mesmo código no checkout e na visão do separador.
3. As **duas SQLs originais R04 e R05**, carregadas do commit fixo `e84dd252f9b4e3c0ba4bc151a6d89f298e87604d`. Nenhuma implementação Meta foi reescrita ou substituída por código paralelo. A função de verificação recebe mensagens fictícias persistidas como se já tivessem passado pela validação criptográfica do webhook.
4. Uma fixture `scripts/sql/orders-r2-r5-real-checkout-meta-fixture.sql` cria por checkout verdadeiro três pedidos fictícios (um produto avulso de R$100, uma cesta dividida de R$160 e um molde de R$105 com despesas ocultas), seus códigos públicos, reservas e alocações. Depois simula templates utilitários enviados nos dois canais e botões de resposta vinculados aos respectivos `wamid`.
5. A asserção `scripts/sql/orders-r2-r5-real-checkout-meta-assertions.sql` liga tudo: chave pública preservada, ledger R04 server-only, `ORDER_R4` desativado por padrão, ativação *apenas no banco fictício*, bloqueio R05 de atribuição, UPSERT, item separado/faltante, conclusão e avanço de status. Após o botão, as operações autorizadas passam. Um terceiro pedido permanece bloqueado.
6. Mensagem de texto com a palavra de confirmação, resposta vinculada à conta errada e replay do mesmo botão **não criam prova indevida**. Tentativas de acionar a RPC privada como `anon/authenticated` não recebem privilégio `EXECUTE`.
7. O feed de `/montar` **obtém os números públicos reais gerados por R03** no laboratório, e a função R05 anexa a sinalização da confirmação do servidor a cada cartão.

## Arquivos desta rodada

- `scripts/sql/orders-r2-r5-real-checkout-meta-fixture.sql` — esquema mínimo de mensagens/outbox/operadores e três pedidos gerados pelo checkout real.
- `scripts/sql/orders-r2-r5-real-checkout-meta-assertions.sql` — regressões fim a fim **somente de SQL**.
- `.github/workflows/orders-r2-r5-meta-chain-ci.yml` — workflow isolado Node/psql e PostgreSQL 17, com as fontes R03/R04/R05 fixadas por SHA.

A primeira execução revelou apenas expectativa incorreta do valor de cesta molde: o checkout real devolve **R$105** (R$15 de outras despesas), não R$100. A segunda encontrou variável `basket_id` ambígua em um teste PL/pgSQL; trocada por `v_basket_order_id`. Ambos os problemas de fixture foram corrigidos e os **dois workflows finais passaram**.

## Limitações explícitas e gates ainda pendentes

- **Não executa o transporte HTTP real da Meta**, assinatura `X-Hub-Signature-256`, provedor, aprovação de template em ambos números, callback do webhook, nem confirma que o botão funciona após envio por produção. A fixture é um atestado sintético, não comprovação de assinatura real.
- A função `manual_pick_queue_feed_v1` de origem permanece um *shim* no laboratório, embora use os pedidos e códigos públicos verdadeiros; faltam UI móvel e política RLS/operador real.
- R02 ainda utiliza uma seleção de dependências sintéticas, não todo o schema canônico, seus triggers e rotinas de evento.
- Os projetos R03, R04, R05 continuam em linhagens diferentes de PR. Este experimento **importa o SQL original por SHA somente para CI**; não integrou as migrations na main.
- Estoque Bling: a auditoria agregada do checkpoint R02 [#1000](https://github.com/osvaldosereia/SUCEDOAN12/pull/1000) mostrou muitos espelhos com `observed_at` antigo. Política de frescor e recuperação do sync devem ser estabelecidas **sem desativar em massa produtos por um corte arbitrário**.
- R06–R10 continuam pendentes de integração com o mesmo checkout e provas Meta/Blíng, além de validação de CFOP/CST/CSOSN por responsável tributário. Emissão automática e expedição **não foram liberadas**.

## Próximos passos

1. Integrar **R06** fechamento da separação e manifesto imutável sobre pedidos confirmados por R04/R05 em banco sintético; testar que o pedido **não perde seu número** nem cobra itens faltantes.
2. Incluir **R07** venda Bling e confirmação read-back idempotente, sem tocar o Bling real.
3. Auditar políticas de segurança (permissões `TRUNCATE` e RLS) e estado dos dois templates da Meta; preparar rollout por gates.
4. Somente após integração R08–R10, testes ponta a ponta e aprovação fiscal explícita, planejar staging e piloto produtivo.

**Produção intocada:** não houve deploy, migration, merge, alteração de pedidos/clientes/estoque, emissão de NF-e, webhook Meta, envio WhatsApp ou operação fiscal real.
