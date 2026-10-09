# R18 — Reproduzir SQL canônico em PostgreSQL 17 descartável

**Dona Antônia · 09/10/2026 · [issue #964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964)**  
**Base:** R17 [PR #1043](https://github.com/osvaldosereia/SUCEDOAN12/pull/1043), SHA `0b51c071b50e01f130a765a2c21a20ba82f9bdd4`.  
**Branch R18:** `agent/orders-r18-trigger-dependency-staging-20261009`.  
**STATUS: STAGING PARCIAL AUTÊNTICO, NÃO É CLONE COMPLETO; R14/PRODUÇÃO BLOQUEADOS.**

## 1. O que foi realmente feito
- Consultado o Supabase canônico `ssbesxgaijknwsjbsbcz` **somente SELECT de catálogo**. Foram obtidos `md5(pg_get_functiondef(...))`, owners, `SECURITY DEFINER`, `proconfig/search_path` e dependências catalogadas de **29 funções distintas** associadas a **30 triggers** de 11 tabelas. Nenhum corpo PLPGSQL, CPF/endereço de cliente, XML, segredo, estoque, pedido ou NF-e foi extraído.
- **Nota crítica:** `pg_depend` não revelou vínculos internos dessas funções PL/pgSQL, isto é esperado e **não comprova ausência de dependências**. Todas as chamadas SQL internas, `SECURITY DEFINER`, `search_path`, schemas, owners, extensões e privilégios indiretos ainda precisam de revisão antes da carga integral.
- Duas funções distintas do schema `private` foram vistas em três bindings de trigger com `SECURITY DEFINER` e EXECUTE efetivo, mas `has_schema_privilege('anon'/'authenticated','private','USAGE')=false`; acesso EXECUTE isolado **não equivale a capacidade de chamada direta**, nem prova vulnerabilidade.
- Criada `scripts/fixtures/orders-r18-canonical-function-fingerprints-20261009.json` (29 digests) e `scripts/fixtures/orders-r18-source-candidates-20261009.json` (busca GitHub de fontes SQL sem afirmar equivalência de código). **25 funções têm arquivo SQL candidato, quatro sem fonte localizada no índice**: `private.set_updated_at`, `public.ops2_order_delivery_number_fill_v1`, `public.smart_delivery_guard_route_resequence_v1`, `public.trg_snapshot_order_hidden_adjustment_v1`.
- SQL criado **somente para fixtures mínimas** de tabelas fictícias em PostgreSQL17 Actions. Não foi criado staging remoto pago.

## 2. Três contratos realmente reproduzidos a partir do código versionado
1. `supabase/sql/20260928_ops2_r4_fiscal_job_integrity_v1.sql` — trigger `trg_ops2_guard_dispatch_fiscal_job_v1`: evita registro de NF-e como autorizada sem invoice ID positivo, chave fiscal com 44 dígitos, situação SEFAZ, e recusa tentativas acima do máximo. Transações de sucesso e erro, com `ROLLBACK`.
2. `supabase/migrations/20261007120000_order_separation_team_auto_fiscal_v4.sql` — trigger `trg_ops2_require_separator_completion_v4`: exige separador válido (`jose/claudio/jovenil/kelly`). **Não executar migration completa!** Ela contém `UPDATE` comerciais e alteração em `fiscal_runtime_config`. O extrator `scripts/orders-r18-stage-safe-source.mjs` retira apenas DDL da função e trigger, de forma conservadora, por âncoras verificadas.
3. `supabase/migrations/20261002143000_require_storefront_checkout_basics.sql` — trigger `trg_enforce_storefront_checkout_basics_v1`: exige campos obrigatórios e cadastro/ endereço ativos em compras da vitrine; ignora pedidos de origem distinta conforme contrato. Testes fictícios e rollback.

**Resultado:** em [Actions R18 #37983925531](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37983925531), os três triggers e os três **hashes completos** `md5(pg_get_functiondef)` corresponderam aos valores capturados no Supabase canônico. As permissões do guard fiscal e de separação também foram verificadas. `full_canonical_parity=false` permanece explícito.

## 3. Artefatos do repositório
- `scripts/orders-r18-stage-safe-source.mjs`: extrator seguro de DDL parcial da migration V4, sem executar seu `UPDATE`.
- `scripts/sql/orders-r18-canonical-safe-stage-setup.sql`: tabelas/clientes inteiramente fictícios, sem segredos ou serviço externo.
- `scripts/sql/orders-r18-canonical-safe-stage-assertions.sql`: testes negativos, positivos e de permissões; `BEGIN/ROLLBACK`.
- `scripts/orders-r18-safe-stage-verify.mjs`: compara triggers e funções do PostgreSQL17 efêmero com a fotografia real, retorna erro quando hash/status/security/owner diferem.
- `scripts/fixtures/orders-r18-source-candidates-20261009.json`: candidatos à fonte SQL de **todas** as 29 funções. Localização via busca não vale como verificação: pode haver versões antigas e mudanças na main ou SQL remoto.
- `scripts/test-orders-r18-source-map.mjs`: testa cobertura da lista e obrigatoriedade de explicitar fontes não resolvidas.
- `.github/workflows/orders-r18-source-stage-ci.yml`: PG17 descartável, sem acesso a Supabase remoto nem habilitação Meta/Bling/SEFAZ, artefato JSON de conformidade de origem.

**Evidência adicional:** primeira reprodução de dois guardas [#37983713961 — SUCCESS](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37983713961); três guardas [#37983925531 — SUCCESS](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37983925531). O último CI após inventário deve ser confirmado por HEAD.

## 4. Integração com outras frentes e limitações
- A main mudou durante esta rodada; verificação mais recente indicou `fb9265f3b2e33d8546de1e31f24e905eacc91098`, com arquivos fiscais/Compras XML, Admin e migrations em paralelo. A R18 **não editou nenhum arquivo da main**; toda mudança foi em `scripts/orders-r18-*`, `scripts/sql/orders-r18-*`, `scripts/fixtures/orders-r18-*`, `docs` e workflow isolado.
- Os 3 contratos reproduzidos não incluem: outbox Meta, ledger/worker de NF-e única, idempotência de Bling, autorização real SEFAZ, reconciliação de faltas/estoque, custódia fiscal, pagamento e rota. **Nenhuma ação comercial/produção foi executada.**
- Ainda é necessário reproduzir os outros **27 bindings de trigger** (26 funções distintas restantes), com análise de dependências, versões e SQL seguro para testes. A mera presença de SQL no GitHub não prova que corresponde ao objeto canônico em produção.
- Histórico do banco permanece divergente do conjunto de arquivos locais; **NÃO `supabase db push` global**, nem `migration repair` automático; preparar migrations selecionadas, ensaiar rollback/restore e preservar trabalhos paralelos.

## 5. Próxima rodada R19
1. Resolver quatro funções sem SQL indexado procurando branches e migrações anteriores, e comparar MD5 de outras candidatas com catálogo. Nunca inventar código de produção.
2. Ordenar e instalar gradualmente dependências SQL para os 27 triggers restantes em staging PG17, com teste negativo/positivo para checkout, estoque, Meta/outbox, pagamentos, separação, fiscal e entrega.
3. Fazer mapa de `search_path`, owners, default ACLs e membership, testar execução com `anon`, `authenticated` e `service_role` no ambiente efêmero.
4. Simular duas workers e notas incertas, verificar que não há POST duplicado e que rota só sai depois da autorização fiscal. R14 permanece bloqueado até homologações autênticas aprovadas pelo usuário.
5. Consolidar cadeia R02–R19 com main seletivamente, sempre após obter SHAs atuais e sem alterações simultâneas em Admin/Compras XML/Etiquetas.

**Não confundir GitHub Actions verde com implantação, paridade do Supabase ou liberação de NF-e.**
