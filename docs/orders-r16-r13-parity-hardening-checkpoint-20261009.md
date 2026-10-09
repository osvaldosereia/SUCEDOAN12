# R16 — R13 fail-closed + revisão de convergência GitHub
Data: 2026-10-09 (America/Cuiaba). Checkpoint de desenvolvimento, **não homologação de produção**.

## Base e isolamento
- Projeto: `osvaldosereia/SUCEDOAN12`.
- Branch de trabalho: `agent/orders-r15-r13-parity-hardening-20261009`, derivada do HEAD R15 `c7a2f0176645521683081c54b1d2378a311a5ffc`, PR #1032.
- Captura da main no começo da rodada: `022bf1acad9f9095a8ee752500571c4dedaaf806`. **Conferir novamente antes da integração.**
- Comparação GitHub `main...R15`: diverged, R15 276 commits à frente e 17 atrás, 130 arquivos reportados do lado R15. Comparação inversa: 35 arquivos só/mais recentes na main, sobretudo fiscal/Compras XML/Admin.
- Mudanças sensíveis na main não portadas: `supabase/functions/admin-products-live-v1/index.ts` (diff amplo), `vitrine/admin/index.html`, `supabase/migrations/20261009160000_separation_ready_reservation_idempotence.sql`, `20261009190000_fiscal_nfe_autorecovery_v1.sql` e migrações XML.
- **Não executar merge global R15→main**, nem sobrescrever arquivos Admin/Edge de Compras/XML, Etiquetas/Balanço e fiscal. Exige cherry-picks cirúrgicos/integração com 3-way review e staging.

## Falha R13 e patch
A versão anterior de `compareCanonicalSchema()` declarava PASS se RLS fosse `true` e o nome dos triggers existisse, **mesmo com policy_count diferente, FORCE RLS divergente, trigger extra, grants por role mudados ou snapshot vazio/incompleto**. O teste positivo antigo omitia `policy_count`, `forced` e ACL por papel.

Correções da R16:
1. Paridade estrita: `rls`, `forced`, `policy_count`, nome dos triggers em ambos os sentidos e comparação de `public_grants` legado.
2. ACL por papel: exige `role_grants` por `PUBLIC`, `anon`, `authenticated`; leitura direta de `pg_catalog.aclexplode(c.relacl)` no banco de **CI PostgreSQL 17**, com papel PUBLIC de OID zero. Detecta `UPDATE/INSERT/DELETE` em PUBLIC e `MAINTAIN/TRUNCATE/TRIGGER/REFERENCES` entre os papéis.
3. **Fail-closed** para snapshot/registro ausente, campo inválido, tabela duplicada ou trigger duplicado.
4. Suíte de 15 testes incluindo negativo para FORCE RLS, política a mais/menos, trigger extra, role PUBLIC UPDATE, role MAINTAIN, RLS desligada e snapshot vazio.
5. Workflow rápido `orders-r13-parity-ci.yml` com Node 22; workflow integrado PostgreSQL 17 `orders-r2-r7-bling-chain-ci.yml` exige que `--require-parity` retorne exit 3 quando ainda falta paridade canônica.

## Snapshot canônico atualizado por consulta read-only
No início da rodada, a fotografia R13 não separava grants por papel e omitia `MAINTAIN`. Em sequência, foi efetuada **nova captura somente de catálogos**, com `pg_class`, `pg_policies`, `pg_trigger` e `pg_catalog.aclexplode`, para as 11 tabelas críticas. A fixture versionada passou a registrar `PUBLIC`, `anon` e `authenticated` separadamente; flags RLS/FORCE, contagem de policies, triggers, owner e relação.

**Resultado real:** 11/11 RLS ativas, FORCE desligado, zero policies, 30 triggers do usuário. Cinco tabelas de fiscal/rotas/pagamentos têm grants explícitos `MAINTAIN`, `TRUNCATE`, `TRIGGER` e `REFERENCES` para `anon` e `authenticated`; `PUBLIC` diretamente não mostrou grants nessas 11 tabelas. A versão anterior omitia `MAINTAIN`. A captura é estruturada, não contém dados de clientes e não mudou nenhuma tabela.

**Relatório integrado PostgreSQL 17 sobre o snapshot atualizado:** 29 triggers canônicos faltando no laboratório; 14 triggers extras/sintéticos em relação à fotografia; RLS divergente nas 11 tabelas; zero diferenças de FORCE e zero de policy count; 5 tabelas canônicas ainda com ACLs de risco. O gate `--require-parity` retornou o código **3**, esperado para BLOCKED, dentro de um workflow **SUCCESS** que verifica o bloqueio. [Evidência CI #37980724496](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37980724496). **SUCCESS no workflow não significa PASS em paridade.**

Os 30 triggers também foram ligados, via SELECT, às funções executadas e flags `SECURITY DEFINER`: várias estão em `public` e `private`. **Não transplantar triggers isolados** sem validar as funções, owners, dependências e privilégios efetivos. Essa evidência de catálogo **não é clone completo** nem substitui ensaio de migrações.

O gate R13 **continua BLOCKED**, agora por razões materiais demonstráveis (triggers ausentes no laboratório, políticas/RLS divergentes e concessões diretas de risco canônicas), não mais por omissão do campo role-grants. Falta também auditar membership, default ACL, funções e Storage/Vault antes de decidir paridade completa.

## Evidências GitHub
- Patch comparador: `461d3a0e2360b596db2f09b3ed41d65e3bc0dce1`.
- Testes R13: `8c3f9d94d3bb03363ffa9662c37d11bd96168f3f`.
- Workflow integrado fail-closed: `a4c6eb0df4d2e47a58f80df0d2a01bdd07bfbd0e`.
- CI unitário: [#37980296009](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37980296009) **SUCCESS**.
- CI integrado no commit anterior ao reforço do bloqueio: [#37980219599](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37980219599) **SUCCESS**, não prova deploy.
- CI integrada após reforço: [#37980259353](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37980259353) **SUCCESS**.
- Snapshot com ACL canônica atualizada: `8d788032abf5ceffdab05638d617e97826ed7381`.
- CI Node 22 sobre snapshot atualizado: [#37980724544](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37980724544) **SUCCESS**.
- CI PostgreSQL 17 integrado sobre snapshot atualizado: [#37980724496](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37980724496) **SUCCESS**. A ação prova que o relatório e o bloqueio funcionam, **não paridade**.
- Todos os testes continuam sintéticos. Nenhum telefone Meta, Bling, SEFAZ ou banco de produção foi alterado.

## Adendo — raiz da recorrência de MAINTAIN e ensaio de REVOKE (R16)
A consulta read-only a `pg_default_acl` também confirmou que os *default privileges* de tabelas criadas por `postgres` e `supabase_admin` no schema `public` concedem `MAINTAIN/TRUNCATE/TRIGGER/REFERENCES` aos papéis `anon` e `authenticated`. Logo, corrigir apenas tabelas existentes não impede o problema de ressurgir em futuras tabelas. As demais permissões comerciais do owner `supabase_admin` não foram alteradas.

O contrato em rascunho `supabase/sql/orders-security-public-table-privileges-review-v1.sql` revogava anteriormente apenas `TRUNCATE/TRIGGER/REFERENCES`. Foi ampliado **sem tocar em produção** para revogar também `MAINTAIN` nas tabelas existentes e nas duas políticas de default ACL. A fixture de PostgreSQL17 agora **concede `MAINTAIN` antes da correção**, exige sua ausência **depois** em tabelas presentes e futuras, preservando `SELECT/INSERT` de aplicação e service_role. Testes sintéticos aprovados. **Não aplicar esse SQL no Supabase real antes de ensaiar permissões herdadas/owners/migração selecionada e rollback em staging.**

- Commit do SQL rascunho: `eb27e18dc81b0021e75be511727ddec512dcff59`.
- Fixture e asserções PostgreSQL17: `6c5323762dc804772619eb691899fbf62ba2d19e`, `a33b890babe5d2f68e04773ed1b5fe0960bb71ab`.
- CI para acionar com alterações nessas fontes: `3572cc0bf08027e04bacc52456dc68ef9f7217b6`.
- [CI integrada PG17 #37981156657 — SUCCESS](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37981156657) e [#37981164365 — SUCCESS](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37981164365), versão com `MAINTAIN`.
- [CI unitária R13 #37981164527 — SUCCESS](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37981164527).
- A verificação read-only da migration `20261008032000` continuou retornando **0** registros aplicados. Isso não autoriza executar `db push`.

## Próxima rodada (R17)
1. Confirmar CI PostgreSQL 17 no HEAD da PR R16, e gate R14 BLOCKED.
2. Completar mapa de dependências dos 30 triggers canônicos e default privileges/roles efetivos (a ACL direta de PUBLIC/anon/authenticated já foi capturada, somente leitura). Construir reprodução fiel das 11 tabelas sem considerar relatórios sintéticos como homologação.
3. Construir staging fiel descartável, carregar somente migrações selecionadas, testando regressão e rollback sem tocar no Supabase canônico.
4. Integrar mudanças recentes da main de modo pontual (proteção das demais frentes), atualizar checkpoint da issue #964.
5. Obter homologações reais controladas Meta 0975/1018, Bling read-back e SEFAZ com aprovação tributária formal; **emissão NF-e e expedição em produção permanecem OFF** até todos os gates R14.

## Segurança
PR draft somente. Não houve merge/deploy, SQL produtivo, mudança de preços/estoques/pedidos, envio Meta, emissão de NF-e ou alteração de configuração fiscal em produção.
