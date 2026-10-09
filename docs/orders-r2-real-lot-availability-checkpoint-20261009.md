# R02+ — Disponibilidade real de cestas pré-montadas (09/10/2026)

**Projeto:** Dona Antônia / SUCEDOAN12. **Plano-mestre:** [#964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964). **Base:** [R02 kits e moldes PR #994](https://github.com/osvaldosereia/SUCEDOAN12/pull/994).

## Auditoria canônica (somente leitura)

A consulta `public.basket_lot_public_availability_v1` foi capturada via `pg_get_viewdef` no Supabase canônico `ssbesxgaijknwsjbsbcz`; assinatura MD5 `c03e94673e3fb50b27db893e12a0159a`. Não foram consultados pedidos ou clientes.

**Defeito potencial identificado:** a CTE `component_health` exige `ops2_sellable_stock_v1.effective_sellable_stock > 0` para **cada produto de uma cesta pré-montada**, inclusive lotes `assembly_status=mounted/legacy`. Para um lote já fisicamente montado com `quantity_available > 0`, esse estoque avulso pode estar zerado porque as unidades foram transferidas para a cesta. O estoque da cesta, registrado no próprio lote, permanece positivo. A consulta real o classificaria como `component_out_of_stock`, retirando uma cesta montada da vitrine.

A regra proposta ainda exige produto existente e ativo e não altera os gates de categoria, status, `sale_enabled`, `assembly_status`, `quantity_available`, vínculo do kit de higiene ou disponibilidade do lote associado.

## Alterações, somente branch/testes

- `scripts/sql/orders-r2-canonical-lot-availability-view.sql`: consulta original capturada em formato executável **apenas para fixture**, não é migration.
- `scripts/sql/orders-r2-real-lot-view-fixture.sql`: completa apenas colunas e categorias necessárias para carregar a view canônica; `ops2_sellable_stock_v1` permanece uma simulação com dados fictícios. Não existe Bling real no laboratório.
- `scripts/sql/orders-r2-real-lot-view-baseline.sql`: em transação revertida, zera estoque avulso dos produtos que já foram montados e confirma que a view **original** torna indisponível o lote de alimentos, higiene e cesta legada.
- `supabase/sql/orders-r2-mounted-lot-real-view-review-v1.sql`: **correção candidata para revisão, não migration aplicada**. Exige MD5 exato da view original para primeira execução; altera apenas a expressão de estoque do componente para aceitar lotes `mounted/legacy` pela prova de `quantity_available` e validação do produto ativo; rejeita divergência da definição e aceita reexecução marcada.
- `scripts/sql/orders-r2-real-lot-view-assertions.sql`: regressão pós-ajuste: cestas montadas disponíveis mesmo com estoque solto zero, checkout com dois kits pré-montados sem reserva avulsa, categoria desativada, produto inativo, kit de higiene pausado, montagem ainda em andamento e quantidade zerada.
- `.github/workflows/orders-r2-isolated-hml-ci.yml`: sétima base PostgreSQL 17 descartável. Preserva testes anteriores, inclusive concorrência sobre lotes e checkout real.

## Limitações e critérios de implantação

- A view real é executada, mas seu insumo `ops2_sellable_stock_v1` continua **simulado**, não uma cópia completa do espelho de estoques do Bling.
- É necessário conferir com a operação que `quantity_available` contabiliza corretamente unidades físicas realmente montadas e não apenas cestas previstas; corrigir estoque divergente deve ser tarefa operacional explícita.
- RLS, gatilhos de estoque, reconciliação da separação R06/R07, saída fiscal R08–R10 e entrega não estão homologados ponta a ponta.
- **Não foi feito deploy, merge na main, migration, alteração real de produtos/estoque/pedidos, emissão fiscal ou envio WhatsApp.** A branch depende de revisão e canário antes de qualquer aplicação.
