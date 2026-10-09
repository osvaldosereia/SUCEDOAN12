# Dona Antônia — Compras/XML — Sequência de implantação controlada (checkpoint R22)

**Estado:** candidato técnico validado em CI; **nenhum deploy ou migration**. PR dependentes: [#997](https://github.com/osvaldosereia/SUCEDOAN12/pull/997) → [#999](https://github.com/osvaldosereia/SUCEDOAN12/pull/999) → [#1001](https://github.com/osvaldosereia/SUCEDOAN12/pull/1001) → [#1004](https://github.com/osvaldosereia/SUCEDOAN12/pull/1004) → [#1009](https://github.com/osvaldosereia/SUCEDOAN12/pull/1009). Não usar as PRs isoladas ou inverter a ordem.

## 1. Entregas da R22

- SQL candidato reforçado: `docs/projects/purchase-xml-identity-release-candidate-r22.sql` (em `docs`, **não é migration**).
- Snapshot do gatilho **real** `purchase_xml_sync_inventory_lot_v1`: `scripts/fixtures/xml-production-lot-trigger-r22.sql`.
- Teste temporário em PostgreSQL 17: `scripts/test-xml-catalog-identity-production-schema-r22.pg.sql`.
- Contrato Node: `scripts/test-xml-release-gates-r22.mjs`; workflow `.github/workflows/xml-catalog-release-gates-r22.yml`.
- CI final verificada: [run 37943285385](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37943285385) **3/3 jobs success**. Nenhum arquivo de produção modificado por R22; os dois backends compilam sem diferenças.

## 2. Segurança obrigatória da função de identidade

- Gate humano em duas camadas: JWT `sb.auth.getUser` + papel ativo `owner/admin` no gateway, e nova checagem `admin_users.is_active/role` **dentro** da transação.
- Proteger RLS no ledger, proibir leitura e escrita direta `anon/authenticated` e `EXECUTE` da RPC por qualquer papel público. `SECURITY INVOKER` e `GRANT EXECUTE` apenas a `service_role`; não expor chave secreta ao navegador.
- A transação só aceita item `xml_verified`, sem produto, sem `converted_quantity`, sem `inventory_lot_id`, sem lote preexistente, sem documento `received`, sem plano de recebimento `verified` e sem entrada de estoque `applied`. Todos os outros seguem a revisão operacional Compras/XML, **não** o fluxo de evidências.
- Novos produtos: `is_active=false`, `is_whatsapp_active=false`, `is_offer=false`, `stock=0`, `ncm=NULL`, `price=NULL`, `cost=NULL`, **`desired_bling_status='I'`**. NCM/CEST permanecem em revisão fiscal.
- Identificador comercial/tributário, unidade/caixa/fardo e fator validados; EAN confirmado que muda de papel sem revisão gera conflito explícito. Vínculo não altera nome de SKU existente.
- Gatilho real produz zero lotes para itens de evidência que passaram no gate. Guardar evidências sem atualizar estoque, recebimento, financeiro ou Bling.

## 3. Sequência de publicação — R23 em diante

1. **Capturar `main` mais recente e comparar SHA de todos os arquivos** antes de alterar ou mesclar. Em 09/10/2026, `main=6ce76d214a0759e946ddfca65364e19e1991d770`. Mudanças paralelas recentes afetaram roteador pai `admin-service-intelligence-v1/index.ts` e orçamento. Não sobrescrever.
2. Criar **branch de integração** da `main` mais recente; reconciliar de modo controlado os commits de #997, #999, #1001, #1004 e #1009, sem perder modificações do roteador. Compilar e executar **CI de todas as cinco PRs** na árvore consolidada.
3. Gerar migração **canônica via Supabase CLI** em workspace de homologação (`supabase migration new ...` após consultar `supabase migration new --help`), usando o SQL R22 revisado — nunca criar nome de migration arbitrariamente nem aplicar o SQL diretamente à produção sem histórico de migration. Checar dependências de `purchase_xml_catalog_observation_details_v2`, `purchase_stock_receipt_plans_v1`, `purchase_stock_receipts`, `product_inventory_lots`, `product_identifiers`, `admin_users`.
4. Executar a migration no **ambiente de homologação isolado** e repetir cenários com autenticação verdadeira e gatilhos reais, usuário desativado, operador e owner, estoque/lotes, histórico, pagamento, rollback/reexecução, EAN unidade/caixa e concorrência. Inspecionar `supabase db advisors` e RLS/GRANT.
5. **Publicar banco antes do backend**: o backend R21+ é fail-closed quando a RPC não existe (503) e impediria uso da ficha, apesar de não corromper dados. Conferir DB, backup, rastreamento dos resultados, então deploy backend, smoke test Auth, então disponibilidade da UI. Manter rollout reversível.
6. **Critérios de aceite de produção:** 90 documentos/214 evidências conciliadas (ou contagens mais atuais), zero diferenças não explicadas, cadastro de teste **inativo** e estoque zero, vínculo sem alteração de produto mestre, zero lotes/financeiro/SEFAZ/Bling criados pela catalogação, duplicidade bloqueada, acesso público negado e registro de auditoria.
7. Em falha: **não desativar trigger de estoque**, não aplicar `UPDATE` corretivo em produção sem auditoria, preservar logs/IDs, deixar funcionalidade nova desligada. Reverter código/endpoint através de release anterior; migration pode necessitar reversão planejada específica, não `DROP CASCADE` automático.

## 4. Próximas etapas

- **R23:** integração de branch `main` atual + homologação das migrations/ACL/fluxos no banco isolado. Os scripts R18–R22 já estão prontos para CI.
- **R24:** aprovações campo a campo/rollback com provas E2E.
- **R25:** revisão fiscal exclusiva, unidade/embalagem/GTIN tributável e critérios Bling.
- **R26:** testes completos no Admin desktop/mobile e performance.
- **R27:** publicação controlada somente após gates acima, smoke tests e auditoria final.

**Nota:** a R22 confirma comportamento em banco descartável com definição do gatilho produtivo, **não** autoriza chamar a versão atual de homologada em produção.
