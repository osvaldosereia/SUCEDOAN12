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

## Limite deliberado do snapshot canônico
O JSON `scripts/fixtures/orders-r13-canonical-schema-security-20261009.json` traz apenas **concessões unidas para anon/authenticated**, não grants individualizados por role (e não captura `PUBLIC` separadamente). Seria tecnicamente incorreto inventar esses dados. Assim, a R16 **marca snapshot legado incompleto e BLOQUEIA** mesmo se um clone artificial vier a reproduzir tudo o que o JSON já contém.

Para fechar R13, ler **somente metadados** em Supabase canônico (`pg_class`, `pg_trigger`, `pg_policy`, `pg_catalog.aclexplode`, permissões herdadas/de default, owners e dependências), gerar novo snapshot versionado sem dados pessoais, reproduzir roles/RLS/ACL/triggers em clone fiel e executar comparação. Verificar também `pg_default_acl`, privilégios efetivos (incluindo membership), funções SECURITY DEFINER e gatilhos dependentes. Sem acesso legítimo a catálogo remoto, manter o gate vermelho; **não preencher valores por suposição**.

## Evidências GitHub
- Patch comparador: `461d3a0e2360b596db2f09b3ed41d65e3bc0dce1`.
- Testes R13: `8c3f9d94d3bb03363ffa9662c37d11bd96168f3f`.
- Workflow integrado fail-closed: `a4c6eb0df4d2e47a58f80df0d2a01bdd07bfbd0e`.
- CI unitário: [#37980296009](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37980296009) **SUCCESS**.
- CI integrado no commit anterior ao reforço do bloqueio: [#37980219599](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37980219599) **SUCCESS**, não prova deploy.
- CI integrada após reforço: [#37980259353](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37980259353), validar conclusão antes de declarar PASS.
- Todos os testes continuam sintéticos. Nenhum telefone Meta, Bling, SEFAZ ou banco de produção foi alterado.

## Próxima rodada (R17)
1. Confirmar CI PostgreSQL 17 no HEAD da PR R16, e gate R14 BLOCKED.
2. Capturar catálogo real somente leitura **incluindo PUBLIC, default privileges, FORCE RLS, roles, owners e todos os triggers**; mapear 29/30 triggers não reproduzidos.
3. Construir staging fiel descartável, carregar somente migrações selecionadas, testando regressão e rollback sem tocar no Supabase canônico.
4. Integrar mudanças recentes da main de modo pontual (proteção das demais frentes), atualizar checkpoint da issue #964.
5. Obter homologações reais controladas Meta 0975/1018, Bling read-back e SEFAZ com aprovação tributária formal; **emissão NF-e e expedição em produção permanecem OFF** até todos os gates R14.

## Segurança
PR draft somente. Não houve merge/deploy, SQL produtivo, mudança de preços/estoques/pedidos, envio Meta, emissão de NF-e ou alteração de configuração fiscal em produção.
