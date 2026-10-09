# R02 — Continuação canônica + segurança (09/10/2026)

**Escopo:** projeto de pedidos Dona Antônia · [Plano #964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964) · continuação sobre [R02 #966](https://github.com/osvaldosereia/SUCEDOAN12/pull/966). Esta rodada não é um deploy.

## Por que esta rodada
1. Havia registro de impossibilidade de publicar commits via tarefa horária. Testei uma criação de branch e múltiplos commits atômicos no GitHub; a escrita **foi confirmada** por retornos de SHAs. Não se deve tratar bloqueios de execuções anteriores como negação permanente de permissão.
2. A R02 executava cinco funções reais capturadas no Supabase, porém **substituía `ops2_init_order_separation_v2` por um mock**. Essa inicialização influencia tanto o cabeçalho visual de cesta quanto a materialização dos itens de separação; precisava entrar na homologação.
3. A inspeção `SELECT` dos grants de produção mostrou **29 tabelas do esquema `public` com privilégio TRUNCATE** para `anon` ou `authenticated`, inclusive tabelas de empregos fiscais, entregas e eventos; muitas também possuem `TRIGGER` e `REFERENCES`. As ACLs padrão de `postgres` e `supabase_admin` podem introduzir tais permissões em objetos futuros. **RLS não substitui REVOKE de TRUNCATE.**

## Código executado
- `scripts/sql/orders-r2-canonical-init-function.sql`: sexta RPC canônica capturada por `pg_get_functiondef` somente leitura do projeto `ssbesxgaijknwsjbsbcz`; MD5 da definição `0155201ff36ac1e6d3f5bdf6022512e7` no checkpoint. Nenhum conteúdo comercial pessoal ou credencial foi copiado.
- `scripts/sql/orders-r2-canonical-separation-fixture.sql`: ajusta a fixture descartável (item, ordem, timestamp, unicidade) para executar a função verdadeira sem o antigo mock.
- `scripts/sql/orders-r2-canonical-init-assertions.sql`: separação de cestas com cabeçalho pai/itens componentes; remove item visual duplicado; mantém decisão `separated` e preço/quantidade mesmo após alteração da origem; atualiza somente item `pending`; replay, ausência de itens, status incorreto e registro `completed` não reaberto.
- `supabase/sql/orders-security-public-table-privileges-review-v1.sql`: proposta de **REVOKE restrito a TRUNCATE, TRIGGER e REFERENCES** para `anon` e `authenticated` em tabelas `public`, além de corrigir ACLs padrão dos dois owners observados, sem remover SELECT/INSERT/UPDATE/DELETE e sem conceder RLS permissiva. **Arquivo de revisão, NÃO é migration e NÃO foi aplicado.**
- `scripts/sql/orders-security-hml-setup.sql` e `orders-security-hml-assertions.sql`: reproduzem os grants legados e os defaults inseguros no PostgreSQL descartável, aplicam REVOKE e verificam ausência de privilégios efetivos, novas tabelas seguras e preservação das permissões operacionais explícitas.
- `.github/workflows/orders-r2-isolated-hml-ci.yml`: três bancos PostgreSQL 17 efêmeros; suites existentes de checkout/reserva/5 RPCs + sexto initializer + segurança. Nenhuma conexão real Bling, Meta, SEFAZ ou Supabase.

## Limitações ainda pendentes
- Mesmo seis RPCs reais **não são todas as migrations, Edge Functions, triggers e RLS canônicos**. Não declarar R02 integralmente homologada.
- O checkout `create_vitrine_cart_order_v3_base` e suas políticas completas continuam substituídos por fixture controlada. Meta 0975/1018 e Bling fiscal continuam simulados; produção não é tocada.
- A permissão `TRUNCATE` real foi apenas **auditada** em produção; resta confirmar owner/role grants aplicáveis e criar migration legítima via CLI, revisar rollback e validar funcionamento em staging antes de eventual correção em produção.
- Branches de R03 e R04 seguem em cadeias distintas; não mesclar a sequência automática indiscriminadamente, especialmente checkout legado de quatro dígitos.
- Nenhum cron, emissão de NF-e, envio WhatsApp, estoque, entrega ou dado real foi alterado.

## Próxima rodada recomendada
1. Inspecionar logs do GitHub Actions de R02 e corrigir qualquer falha até CI íntegro e atual.
2. Expandir o clone canônico por etapas: `create_vitrine_cart_order_v3_base`, inicialização/assign/item-set, gatilhos de Meta, ledger R06/R07 e RLS, sempre com dados sintéticos.
3. Decidir plano de correção das permissões e consolidar PRs em ordem, mantendo os bloqueios fiscais e a autorização SEFAZ como gates obrigatórios.
4. Avançar somente após CI e cobertura integral do caminho crítico; publicar checkpoint da rodada na [issue #964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964).

**Estado:** a publicação no GitHub foi recuperada nesta interação; homologação integral e uso produtivo ainda pendentes.
