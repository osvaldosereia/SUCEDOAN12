# Handoff técnico — R02 + R03, integração de checkout real e número semanal

**Data:** 09/10/2026 · **Escopo:** Dona Antônia, `osvaldosereia/SUCEDOAN12` · **Plano-mestre:** [#964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964).

## Ponto de partida

A R02 mais recente está no [PR #994](https://github.com/osvaldosereia/SUCEDOAN12/pull/994): checkout `create_vitrine_cart_order_v3_base` real, reserva real de produtos avulsos, lotes alimento/higiene (view simplificada), moldes, alteração independente de grupos e provas de ausência de sobrevenda em PG17 descartável. R02 ainda não está implantada.

A R03 está em [PR #968](https://github.com/osvaldosereia/SUCEDOAN12/pull/968), branch `agent/orders-r3-weekly-number-20261008`, divergente da linhagem R02 (não empilhada na R02). Seu número semanal imutável é `DD|MM|YYYY - NNN`, com semana ISO em fuso `America/Cuiaba`. Integração não deve fazer merge diretamente na main sem conciliar os commits em ordem.

## O que foi implementado nesta rodada

Criada a branch `agent/orders-r2-r3-integration-20261009` **derivada da R02 #994**, sem mexer nas branches existentes.

1. `scripts/sql/orders-r2-r3-integration-fixture.sql` adiciona ao laboratório R02 a estrutura mínima de snapshots históricos e dependências de trigger anteriores à R03: `order_public_snapshots_v1`, sequência antiga, função de formatar códigos legados, refresh do snapshot e trigger diferido de itens. Inclui histórico fictício `AA001` que deve permanecer intocado.
2. `scripts/sql/orders-r2-r3-integration-assertions.sql` faz checkout de quatro pedidos reais via `create_vitrine_cart_order_v3`: item avulso, cesta com dois kits, cesta alterando somente alimentos e cesta por molde com adicional oculto. Verifica totais fiscais e comerciais, reserva de estoque, apropriação de kits e preservação do kit intacto.
3. Após commit de cada pedido, compara `orders.order_number` com `order_public_snapshots_v1.public_code`, confere quantidade de itens no snapshot diferido, formato por data de Cuiabá, unicidade dos quatro números, contador semanal e preservação de `AA001`. Testa que UPSERT no snapshot não consome outro número e que alterar o código de um pedido existente é proibido.
4. O workflow `.github/workflows/orders-r2-isolated-hml-ci.yml` adicionou o **sétimo banco PostgreSQL 17 descartável**, mantendo seis laboratórios R02 anteriores. Faz checkout do código R03 **fixado no commit `e7408ad5cbcd6ae8d5ca16e90f2e287a7d61af4c`**, usa a migração R03 original, e não uma imitação. Roda os testes integrados sem Bling, Meta, SEFAZ, pedidos ou credenciais reais.

## Defeito real encontrado e correção candidata

Durante a execução conjunta, o trigger `trg_ops2_assign_order_weekly_number_v1` da R03 atualiza `orders.order_number` ao inserir o pedido, mas a função original de checkout R02 ainda montava `v_order_number` no formato `DA-YYMMDD-XXXXXXXX` e retornava essa variável local. **O checkout poderia apresentar o número DA ao cliente enquanto /montar/Admin/Meta mostrariam o número semanal correto**, reproduzindo a diferença que motivou a regra de ID único.

- `scripts/sql/orders-r2-r3-wrong-number-baseline.sql` demonstra essa discrepância com rollback.
- `supabase/sql/orders-r2-r3-checkout-public-number-readback-review-v1.sql` é uma **proposta de patch SQL não implantada**. Após o `INSERT INTO orders`, lê o `order_number` gerado pelo banco e devolve exatamente esse valor, sem tocar no identificador público depois do registro. Exige presença do trigger R03 e MD5 `927bd6406badc650daff796e69e8ff05` (checkout R02 após as duas correções anteriores), bloqueando alterações silenciosas.
- As quatro asserções de checkout conferem **também o campo `order_number` da resposta HTTP/RPC**, não somente o banco. Reaplicação da correção não pode mudar novamente a função.
- Concorrência integrada disputa o último estoque de um produto fictício: um checkout confirmado recebe o próximo número, o checkout rejeitado **não consome sequência nem cria snapshot ou reserva**.
- Foi removido **apenas deste workflow de integração** um teste redundante de concorrência que utilizava a mesma base já alterada por cenários anteriores. O teste seguinte, mais completo, em base isolada, permanece ativo, cobrindo lotes de alimentação e higiene.

Os testes são todos offline, com dados fictícios. A correção não está ativa no site real.

## Segurança, limitações e ordem futura

- **Não foi aplicada nenhuma migration em produção.** O SQL do checkout e do número R03 estão sendo executados apenas no PostgreSQL descartável do GitHub Actions.
- A view de disponibilidade do kit no laboratório é deliberadamente simplificada; não reproduz todos os casos do Bling/estoque, RLS, triggers ou integrações canônicas.
- O teste integra **contrato de banco** R02 + R03, não os consumidores web/Admin/Meta completos. Ainda falta consolidar o código R03 real (inclusive consumidores) com R04–R10 nas mesmas branches, resolver conflitos e executar testes fim a fim.
- R08–R10 exigem homologação fiscal e autorização SEFAZ; não eliminar o bloqueio de geração.
- Qualquer alteração posterior da migração R03 precisa atualizar o SHA fixado e revisar testes; não seguir uma branch móvel silenciosamente.
- Próxima rodada após CI: integrar o contrato do botão Meta R04 com o checkout numerado e o gate de separação R05, e avançar para homologação R06–R10.

**Resultado:** ver [GitHub Actions desta branch](https://github.com/osvaldosereia/SUCEDOAN12/actions/workflows/orders-r2-isolated-hml-ci.yml). Considerar a etapa aprovada apenas quando a HEAD tiver CI `success` e o PR estiver em draft com base na R02 #994.
