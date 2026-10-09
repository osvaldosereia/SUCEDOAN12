# R17 — Pré-validação canônica de dependências e convergência de migrações

**Dona Antônia · 09/10/2026 · [issue #964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964) · branch `agent/orders-r17-canonical-dependency-preflight-20261009` sobre R16 PR #1037.**  
**STATUS: DESENVOLVIMENTO, laboratório PostgreSQL17 sintético. Produção read-only. NÃO HOMOLOGADO.**

## A. Origem e segurança
- R16 HEAD de partida: `f416dcdbc066c10c8a38328e7fbd8ef976bf98a7`. CI Node R13 e integrada R02–R12 sobre esse HEAD SUCCESS.
- `main` na comparação R17: `6fed790135939c14f10fefef3aaad96c88560cf2`. Históricos divergentes; R17 estava 291 commits à frente e 21 atrás da main no snapshot do comparador inverso (R17→main). Confirmar novamente antes de cherry-pick.
- Frentes paralelas já têm alterações de Admin, Compras/XML, orçamentos, reserva na separação e recuperação fiscal. NÃO aplicar merge da main em bloco, sobrescrever `vitrine/admin/index.html`, `admin-products-live-v1/index.ts`, nem migrations em produção.
- Todas as consultas ao Supabase `ssbesxgaijknwsjbsbcz` foram **somente SELECT de catálogos**: `pg_class`, `pg_trigger`, `pg_proc`, `pg_language`, `pg_default_acl`, `supabase_migrations.schema_migrations`. Sem consulta de dados comerciais, corpos PLPGSQL, senhas, tokens, clientes, notas ou estoques.

## B. Captura canônica nova (verificável)
1. `scripts/fixtures/orders-r17-canonical-trigger-dependencies-20261009.json`: 30 triggers de usuário das mesmas 11 tabelas canônicas da R13. Cada registro tem tabela, trigger, flag enabled, MD5 de `pg_get_triggerdef`, schema e nome da função, assinatura, owner, linguagem, `SECURITY DEFINER` e EXECUTE efetivo de `anon/authenticated`. **Nenhum corpo de função capturado**. MD5 detecta divergência de definição, não comprova semântica nem dependências internas da função.
2. `scripts/fixtures/orders-r17-canonical-default-acl-20261009.json`: três entradas de default ACL de `postgres`/`supabase_admin` no schema `public`, por tipo de objeto.
3. `scripts/fixtures/orders-r17-canonical-migration-history-20261009.json`: 1.187 versões registradas no Supabase, 38 versões a partir de 08/10/2026, última `20261009190052`. A árvore R17 contém 131 arquivos de migration (histórico parcial/squash ou operações fora do repositório podem explicar); isso **NÃO indica** automaticamente que 1.056 migrations devam ser aplicadas. Fazer reconciliação por versão e conteúdo.
4. A versão semanal pública `20261008032000` segue ausente do histórico remoto segundo checagem read-only da R16; precisa continuar pendente até ensaio seguro. Não executar `db push` global.

**Risco observado:** 21 dos 30 vínculos de triggers apontam para funções `SECURITY DEFINER`; três vínculos, representando **duas funções distintas** do schema `private`, têm EXECUTE efetivo pelas roles examinadas. Não é prova de exploração, especialmente porque funções `RETURNS trigger` possuem restrições de chamada direta; exige revisão de owner, grants, security/search_path e dependências reais.

## C. Preflight em código
- `scripts/orders-r17-canonical-preflight.mjs`: compara **nome/estado/hash de definição** de todos os triggers; schema/nome/assinatura e owner/permissões/SECURITY DEFINER das funções; captura ACL por owner e tipo; detecta versões remotas recentes sem arquivo local, versões locais recentes ainda não registradas, nomes de migration duplicados. Se snapshots forem omitidos ou incorretos, falha fechado.
- `scripts/test-orders-r17-canonical-preflight.mjs`: casos negativos e positivos cobrindo funções privilegiadas, falta/excesso de triggers, hash alterado, owner, flags, ACL e versões divergentes. Confere concordância com as 30 entradas da fixture R13.
- `.github/workflows/orders-r17-canonical-preflight-ci.yml`: testes Node 22 sem credenciais externas.
- `.github/workflows/orders-r2-r7-bling-chain-ci.yml`: depois dos cenários reais de banco R02–R12 (Meta/Bling/SEFAZ **fictícios**), consulta o **próprio PostgreSQL17 descartável** e gera artefato JSON R17. `--require-trigger-parity` precisa sair código 3 enquanto faltarem objetos canônicos; workflow verde indica diagnóstico/bloqueio correto, não liberação.
- Continua `approved_for_production=false`, `safe_for_global_db_push=false`, sem ativação de transporte externo.

## D. Resultado da primeira CI PostgreSQL17
[Run #37982260635 — SUCCESS](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37982260635), com artefato `orders-r17-canonical-preflight-report`:
- **29 triggers canônicos faltantes** no laboratório integrado e **14 extras/sintéticos**.
- Um vínculo de owner/grant divergente mesmo no trigger com nome correspondente; zero diferenças de hash nos que correspondem.
- 16 concessões perigosas contabilizadas nas default ACL canônicas (MAINTAIN, TRUNCATE, TRIGGER, REFERENCES), distribuídas entre `anon` e `authenticated`.
- Três versões recentes de migration presentes na R17 ainda não registradas no remoto; outras entradas remotas recentes não estão no diretório local.
- Gate `trigger_parity_complete=false`; release e todos os demais gates R14 continuam BLOQUEADOS.
[CI rápida R17 #37982212123 — SUCCESS](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37982212123), primeira execução de 15 testes.
- A última versão do código inclui teste de concordância R13↔R17 e distinção entre 3 vínculos e 2 funções. Verificar os workflows do **HEAD final** antes de encerrar.

## E. Mapa seletivo de fontes SQL / revisão de integração
Busca em fontes GitHub no momento da auditoria (não comprova compatibilidade com produção):
- `supabase/sql/20260928_ops2_r4_fiscal_job_integrity_v1.sql`: guard do ledger fiscal `dispatch_fiscal_jobs`.
- `supabase/migrations/20261007120000_order_separation_team_auto_fiscal_v4.sql`: `ops2_require_separator_completion_v4`.
- `supabase/sql/20261001_checkout_whatsapp_outbox_v1.sql`: trigger de outbox WhatsApp do checkout.
- `supabase/sql/20260930_order_separation_atomic_v1.sql`: reserva de estoque; conferir contra `supabase/migrations/20261009160000_separation_ready_reservation_idempotence.sql` da main atual, NÃO importar cegamente.
- `supabase/migrations/20261005010000_orders_fiscal_flow_v4.sql`: gate de liberação fiscal.
- `supabase/sql/20260928_ops2_delivery_payment_fiscal_sync_v1.sql`: sincronização de pagamentos.
Restantes das 30 funções precisam de rastreio de fontes, dependências internas e revisão para construção do staging.

## F. Próxima rodada R18 (sem esperar decisões comerciais)
1. Expandir o inventário para **TODAS** as fontes SQL das 30 funções de trigger, dependências de outras funções, views, extensões, schemas, `search_path`, owners, grants indiretos, cron, storage e Vault; comparar snapshots de definições por SHA/hash em staging.
2. Construir ambiente realmente isolado com roles/RLS/ACL e funções canônicas na ordem de dependência. Testar `SECURITY DEFINER`, triggers de checkout, separação, outbox e fiscal. Nada de migrar todos os 1.187 registros sem revisão.
3. Produzir plano de migrations **selecionadas** e rollback; reconciliar conflitos das trilhas Compras/XML e Fiscal na main.
4. CI E2E com dois operadores/workers, concorrência de reserva, queda de rede, NF-e incerta/autorização tardia, retorno/entrega, e somente então homologações Meta 0975/1018, Bling GET/readback, parecer fiscal e SEFAZ sob autorização específica.
5. Conservar 9 gates de R14 BLOQUEADOS até evidências formais. **Nenhum merge, deploy, SQL produtivo, emissão NF-e, disparo Meta real ou alteração comercial sem gates e autorização.**

**R17 é uma rodada verificável de auditoria/testes, não instalação ou homologação.**
