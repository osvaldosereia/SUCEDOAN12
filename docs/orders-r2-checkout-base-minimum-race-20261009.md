# R02 — Checkout canônico, proteção do pedido mínimo e concorrência (09/10/2026)

**Projeto:** Dona Antônia · [Issue #964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964) · encadeado sobre [PR #988](https://github.com/osvaldosereia/SUCEDOAN12/pull/988). **Somente branch; nenhuma migration nem deploy.**

## Auditoria real do checkout

Consulta read-only ao Supabase canônico `ssbesxgaijknwsjbsbcz` localizou `create_vitrine_cart_order_v3_base`, atualmente com **39.884 bytes** e hash MD5 `b765301f2dfb833341bf01762749c7e8`. A função original foi exportada integralmente em `scripts/sql/orders-r2-canonical-checkout-base.sql`. O checkout utiliza `create_vitrine_cart_order_v3` como wrapper e `reserve_vitrine_order_stock_v1` para reservar estoque.

### Achado de segurança

Na base atual, o mínimo de R$ 75 é validado por:

`if v_total<75 and coalesce((v_customer->>'stock_adjusted_retry')::boolean,false)=false then raise exception 'minimum_order'; end if;`

**O campo `v_customer` é preenchido diretamente por `p_customer_snapshot` fornecido no checkout.** Isso permite que um novo pedido inferior a R$ 75 passe informando `stock_adjusted_retry:true`, sem autorização do servidor. O teste de laboratório `orders-r2-checkout-base-unsafe-baseline.sql` reproduz esse comportamento com pedido fictício de R$ 50, **antes de aplicar qualquer correção**, dentro de transação com `ROLLBACK`.

A correção candidata (em `supabase/sql/orders-r2-checkout-minimum-hardening-review-v1.sql`) exige R$ 75 em **todo pedido novo**. Não cria exceção baseada no navegador e só altera a cláusula depois de conferir o hash da definição canônica. É segura para reexecução no laboratório, mas não deve ser aplicada em produção sem atualizar a revisão do hash, gerar migration pelo CLI e homologar a função real com os novos requisitos. Pedidos **originalmente válidos** cuja separação tenha faltas legítimas são reconciliados depois, com prova R06/R07, e podem terminar abaixo do mínimo, sem alterar o checkout.

## Código novo

- `scripts/sql/orders-r2-canonical-checkout-base.sql`: a função de produção original, exportada read-only; não é uma nova implementação.
- `scripts/sql/orders-r2-checkout-base-fixture.sql`: PostgreSQL 17 descartável com tabelas sintéticas de pedidos, itens, produtos, clientes e estoque. Catálogo para produtos avulsos, sem clientes reais.
- `scripts/sql/orders-r2-checkout-base-unsafe-baseline.sql`: comprova a falha atual com cliente fictício e reverte a transação.
- `supabase/sql/orders-r2-checkout-minimum-hardening-review-v1.sql`: proposta de alteração mínima e guardada por hash, **draft, não migration**.
- `scripts/sql/orders-r2-checkout-base-assertions.sql`: executa o checkout base **real** com wrapper/reserva reais e verifica: mínimo de R$ 75, tentativa de falsificação do campo, crédito/PIX, quantidade, item sem estoque, carrinho vazio, nenhum pedido/reserva criado após erro, replay e correspondência de quantidade e total.
- `.github/workflows/orders-r2-isolated-hml-ci.yml`: amplia para um **quarto banco** descartável e testa duas sessões concorrentes, cada uma tentando comprar 6 unidades de um item com apenas 8 disponíveis após o primeiro pedido. Apenas uma transação pode vencer.

## O que este teste comprova

Em um banco PostgreSQL 17 separado: execução dos corpos reais da base do checkout, wrapper e reserva de estoque, com dependências mínimas simuladas. As regras de carrinho e controle de estoque da função original são exercitadas ao mesmo tempo, inclusive race de duas sessões; fontes Meta, Bling e SEFAZ permanecem desligadas.

**Não comprova homologação fim a fim em produção.** As tabelas, políticas RLS, gatilhos e a view de estoque Bling são reduzidas a um subconjunto para o laboratório. O caminho de cestas com lotes, moldes e substituições ainda depende de fixture que reproduza essas tabelas e decisões. O enriquecimento de WhatsApp/cadastro foi simulado, assim como o telefone normalizado. O número de pedido original `DA-YYMMDD-...` ainda não passou pela substituição semanal da R03.

## Próximos passos

1. Rodar e aprovar o novo teste concorrente com checkout base real no CI.
2. Conferir com responsável de operações se existe alguma aplicação legítima do campo `stock_adjusted_retry`; não aceitar clientes desconhecidos como prova de ajuste. Reprovar a exceção atual para novos pedidos.
3. Resolver R03 numeração semanal e R04 confirmação de botão, integrando as PRs numa branch de homologação consistente.
4. Completar as fixtures de cesta e estoque Bling, revisar RLS e privilégios de R02 e executar o fluxo R06–R10 sem API de produção.
5. Depois de homologação e aprovação de mudança, gerar migração via Supabase CLI (não aplicar SQL `supabase/sql` direto na produção).

**Produção totalmente intocada:** sem merge, migration, deploy, atendimento WhatsApp, NF-e real, alterações de preço/estoque, pedido ou cliente.
