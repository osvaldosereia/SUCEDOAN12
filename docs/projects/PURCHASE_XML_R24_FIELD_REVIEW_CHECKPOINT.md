# Dona Antônia — Compras e Catálogo XML — Checkpoint R24 (09/10/2026)

## Status técnico: BACKEND/SQL/CI CONCLUÍDOS; INTERFACE E PUBLICAÇÃO PENDENTES

**PR draft empilhada:** [#1018](https://github.com/osvaldosereia/SUCEDOAN12/pull/1018), branch `agent/xml-catalog-field-approval-r24-20261009`, base R23 [#1012](https://github.com/osvaldosereia/SUCEDOAN12/pull/1012). A PR não está mergeada na main.

### Implementação gravada no GitHub
1. `docs/projects/purchase-xml-field-approval-release-candidate-r24.sql`: união do ledger de revisão R14 com aplicação/reversão CAS da R17. **Quatro RPCs com rechecagem de usuário ativo owner/admin na transação** (open, decide, apply, rollback), além do JWT no gateway.
2. `supabase/migrations/20261009155445_purchase_xml_field_approval_r24.sql`: migração nomeada pela **Supabase CLI v2.84.2**, gerada em GitHub Actions [run 37955167716](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37955167716), commitada com SQL exatamente idêntico ao candidato e aplicada **somente em PostgreSQL 17 descartável**. **Não instalada na produção.**
3. `xml-catalog-field-apply-gateway.mjs` nas duas cópias de `purchase-xml-v1`: API humana owner/admin com quatro ações: lista por produto, prévia, aplicação e reversão. Ignora `actor_id` fornecido pelo cliente e usa identidade do Auth servidor. Falha fechada sem RPC.
4. `purchase-xml-v1/index.ts` nas duas cópias: rota separada para o novo gateway, preservando as ações de decisões read-only `xmlFieldReviewGateway` e os caminhos legado de compras.
5. **Apenas `products.name` de produto com `is_active=false`** pode ser alterado, e somente após decisão `approved`, confirmação independente `APLICAR_NOME_APROVADO_XML`, revisão e valor original verificados por CAS + locks. Reversão exige `REVERTER_NOME_APLICADO_XML` e compara com o valor previamente aplicado. O rollback é bloqueado se houve alteração concorrente ou o produto tornou-se ativo. Uma aprovação fiscal `ncm/cest/tax_gtin` permanece bloqueada para aplicação.
6. Trilha imutável em `purchase_xml_field_review_events_v1` e `purchase_xml_field_application_events_v1`; grants restritos à `service_role`, RLS habilitada. Nunca usar `SECURITY DEFINER` para contornar permissão.

### Testes reais
- CI **[37955537001](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37955537001)** — **3/3 jobs SUCCESS**:
  - Node executa gateway com owner, operador/anon/interno negados, ator falsificado ignorado, prévia, confirmação, reversão e contratos de SQL.
  - Deno `check` em dois `index.ts` XML completos.
  - PostgreSQL 17 descartável aplica a **migração já versionada** e testa aprovação, produto inativo, produto ativo bloqueado, concorrência e revisão otimista, registro e imutabilidade, rollback seguro e ACL.
- Primeiras tentativas CI identificaram um erro de sintaxe no mock Node e um nome incorreto do script legado R23. Ambos corrigidos e CI repetida até verde.
- **Limite importante:** os testes simulam Auth/usuários reais e a view XML com fixtures. Não são homologação de navegador e autenticação real contra um projeto Supabase separado.

### Bloqueio explícito de interface

Uma atualização da interface no arquivo monolítico `vitrine/admin/index.html` foi **bloqueada pela ferramenta de escrita**. Não tentei contornar as configurações de segurança. Portanto, na PR R24, **não há botão funcional de prévia/aplicar/reverter no Admin**; apenas as APIs e o banco de teste estão implementados. O Admin produtivo não foi atualizado e não se pode afirmar que a rotina já esteja utilizável pelos operadores. Exigir via rota de engenharia suportada a integração visual pequena e testes mobile/desktop **antes de deploy**.

### Estado de produção (read-only)
- Supabase canônico `ssbesxgaijknwsjbsbcz`: `purchase_xml_items` 214 itens, 59 sem vínculo.
- Ledger `purchase_xml_field_reviews_v1`, `purchase_xml_field_applications_v1` e função `purchase_xml_apply_field_review_v1` **não existem em produção**.
- `main` avançou paralelamente para `d5f3f16b5b6b8ba27823406de0c43628e62d4a78` com migration de separação; preservar essa alteração. A última versão de migration **aplicada** no banco, à consulta, é `20261009155231` (separação). O GitHub tem uma nova migration `20261009160000_separation_ready_reservation_idempotence.sql` e a R23 ainda possui migration pendente `20261009145919`. **Não usar `db push` automaticamente sem reconciliar ordem e histórico.**
- Nenhuma alteração foi feita em `main`, banco de produção, produtos, preço, estoque, impostos, financeiro, Bling, WhatsApp ou serviço Edge.

### Requisitos para próxima rodada (R25)
1. Integrar **UI** de revisão/consulta/prévia/aplicação/reversão usando caminho de atualização autorizado e de tamanho compatível. Sem aplicação automática, exigir dupla confirmação e mostrar bloqueios (ativo, divergência CAS).
2. Reconciliar `main` e histórico das migrations R23/R24 versus migrations remotas após `20261009155231`, gerar plano de deploy sem duplicidades ou replay; validar no ambiente de homologação com banco real, Auth + RLS + Edge e browser.
3. Separar NCM/CEST/EAN tributável das alterações de nome: somente evidência XML, revisão fiscal humana, sem mutações fiscais/estoque/financeiro.
4. Manter PR draft até passar gates R25 fiscal e R26 E2E. Publicação R27 somente após backup/monitoramento, DB → backend → UI, smoke tests e aprovação de segurança.

**Não abrir o deploy agora; R24 está concluída no núcleo técnico, não no produto utilizável.**
