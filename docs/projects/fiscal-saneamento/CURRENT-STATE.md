# Dona Antônia — Saneamento Fiscal / Estado Atual

Atualizado em: 2026-09-24

## Escopo e regras

- Supabase canônico/Bling Hub: `ssbesxgaijknwsjbsbcz`
- Supabase Vitrine: `qxstkwshuvplmmftrctj`
- Não usar Make.
- Pedidos antigos permanecem legado somente leitura.
- XML de compra do usuário é evidência técnica de produto; não é escrituração/estoque/financeiro da Dona Antônia.
- Não inventar NCM, CEST ou origem.
- Escrita fiscal no Bling continua fail-closed: GET antes, PATCH mínimo, GET depois, idempotência e auditoria.

## R0.15 — Conflitos de evidência observada

Migration:
`20260925002000_product_fiscal_observed_evidence_guard_r0_15.sql`

Criada:
`refresh_product_fiscal_observed_conflicts_v1()`

O strict-auto agora exige, além dos gates anteriores:

- ausência de conflito NCM;
- ausência de conflito CEST;
- consenso de origem;
- origem do consenso igual à origem canônica;
- ausência dos blockers da fila fiscal.

Objetivo: impedir que uma evidência nova divergente seja ignorada por um perfil previamente validado.

## R0.16 — Lacunas legais reveladas pelos XMLs

Migration:
`20260925003000_product_fiscal_rules_xml_gaps_r0_16.sql`

Regras oficiais MT confirmadas na SEFAZ-MT e adicionadas/ajustadas:

- CEST 03.015.00 / NCM 2202.99.00 — bebida hidroeletrolítica/isotônica < 600 ml;
- CEST 11.002.00 / NCM 3808.94.19 — sabões/desinfetantes/sanitizantes em pó para lavar roupas;
- CEST 11.006.00 / NCM 3402.50.00 — detergente líquido para lavar roupa;
- CEST 17.041.00 / NCM 2103.20.10 — molho de tomate <= 1 kg.

Fonte legal:
https://app1.sefaz.mt.gov.br/sistema/legislacao/legislacaotribut.nsf/7c7b6a9347c50f55032569140065ebbf/e5f1b349942b011a0425849b0043212a

As regras 3305.90.00 para outras preparações capilares e condicionadores continuam separadas. Casos ambíguos continuam fail-closed.

## R0.17 — Hardening do matcher fiscal

Migration:
`20260925004000_fiscal_rule_matcher_search_path_r0_17.sql`

`fiscal_rule_description_matches_v1(text,jsonb)` passou a usar `search_path=public`.

O WARN correspondente do Supabase Advisor foi eliminado.

## R0.17b — Cobertura textual de regras já verificadas

Migration aplicada no Supabase e versionada no GitHub:
`20260924202949_product_fiscal_rule_text_coverage_r0_17.sql`

Sem alterar NCM ou CEST legal, foram ampliados somente os qualificadores de descrição de duas regras oficiais MT:

- 20.014.00 / 3304.99.10 — aceita também nomenclatura comercial `hidratante facial` / `creme hidratante`;
- 20.037.00 / 3401.30.00 — aceita também `água micelar` / `solução de limpeza`.

Resultado da reclassificação:

- Água Micelar 7 em 1 NIVEA 200 ml passou a `candidate` para CEST 20.037.00, sem blocker;
- Hidratante Facial Antissinais Garnier 85 g passou a `candidate` para CEST 20.014.00, sem blocker;
- 2 alertas `cest_evidence_unmapped` foram resolvidos;
- nenhum candidato ambíguo foi criado.

Os candidatos continuam sem escrita no Bling enquanto não houver os gates independentes exigidos.

## XMLs pessoais ingeridos

O ledger usa `evidence_type='user_purchase_nfe_xml'`.

Política:

- guarda GTIN/NCM/CEST/origem/CFOP/CST-descritivo relevantes;
- marca `recipient_scope='personal_purchase'`;
- não grava nome, CPF ou endereço do destinatário no payload;
- CEST ausente não é evidência negativa;
- CFOP é contexto da operação-fonte, não regra de saída;
- origem só consolida por consenso.

Estado atual do ledger desse tipo:

- 33 linhas de evidência;
- 28 produtos distintos.

Na rodada retomada deste chat foram acrescentadas 23 evidências em 19 produtos.

## Achados novos importantes

### Gatorade 500 ml

Produtos:

- GTIN 7892840808044 — Tangerina;
- GTIN 7892840808051 — Uva.

Resultado:

- NCM canônico: 22029900;
- CEST legal: 0301500;
- origem consenso/Bling: 0;
- strict-auto: aprovado;
- canário Bling executado individualmente nos dois produtos;
- GET antes/PATCH/GET depois verificados;
- somente CEST mudou;
- ambos estão `aligned`.

### Produtos bloqueados por origem

Estão `blocked` / `not_sync_eligible` até revisão independente:

- Brilhante Lava-Roupas Líquido 3 L — GTIN 7891150020672:
  - XML: origem 5;
  - Bling: origem 0.
- OMO Sanitiza & Higieniza 2,2 kg — GTIN 7891150072237:
  - XML: origem 5;
  - Bling: origem 0.
- Heinz Molho de Tomate Rústico 320 g — GTIN 7896102503241:
  - XML: origem 5;
  - Bling: origem 0.

Não corrigir automaticamente nenhum dos lados.

### Cremes/condicionadores 3305.90.00

Manter fail-closed quando descrição/evidências deixam dúvida entre:

- 20.020.00 — outras preparações capilares;
- 20.021.00 — condicionadores.

Os XMLs novos reforçaram que vendedores podem informar 20.021.00 para máscaras/cremes de tratamento. A regra MT vigente mantém máscaras/finalizadores em 20.020.00. Esses casos permanecem bloqueados; o XML não sobrescreve a regra legal.

### Massas 1902.11.00

Há XMLs informando 17.049.00 para macarrões com NCM 1902.11.00. A regra MT vigente separa:

- 17.049.00 — massa comum não derivada do trigo;
- 17.049.06 — massa comum com ovos derivada de farinha de trigo.

Por isso os macarrões com evidência 17.049.00 permanecem `cest_evidence_unmapped` e não são promovidos automaticamente.

## Estado fiscal atual

`product_fiscal_profiles`:

- 284 `auto_validated`;
- 50 `blocked`;
- 1.480 `pending`.

Produtos ativos:

- 1.673 perfis fiscais ativos;
- 369 já possuem CEST no perfil;
- 284 estão `auto_validated`;
- 50 estão bloqueados;
- 1.339 permanecem pendentes.

Fila aberta relevante:

- 34 `origin_evidence_conflict` blockers;
- 9 `gtin_invalid` blockers;
- 5 `cest_rule_mismatch` blockers;
- 3 `ncm_evidence_conflict` blockers;
- 2 `cest_evidence_unmapped` warnings.

`product_fiscal_bling_diff_v1` no último checkpoint:

- 18 `aligned`;
- 266 `cest_missing`;
- 1.389 `not_sync_eligible`.

O canário original Monange continua alinhado.

Auditoria `bling_hub_audit_v2` foi validada: canários e lotes anteriores possuem before/after, `other_tax_fields_stable=true` e resultado verificado.

## Segurança

As tabelas fiscais possuem RLS e permanecem sem policy pública intencionalmente: anon/authenticated ficam deny-all e o acesso operacional é service-role.

Não abrir policies públicas para resolver isso.

## Próxima ação recomendada

1. Continuar ingestão dos próximos XMLs como `user_purchase_nfe_xml`, sem criar produto novo automaticamente.
2. Cruzar GTIN comercial e, quando necessário, `cEANTrib` unitário explicitamente documentado.
3. Rodar:
   - `refresh_product_fiscal_evidence_quality_v1()`;
   - `refresh_product_fiscal_rule_integrity_v1()`;
   - `refresh_product_fiscal_observed_conflicts_v1()`;
   - `refresh_product_fiscal_origin_consensus_v1()`.
4. Confirmar regras novas sempre na legislação oficial MT antes de allowlist.
5. Fazer auditoria read-only do Bling apenas nos candidatos necessários.
6. Não escrever CEST no Bling quando existir qualquer conflito NCM/CEST/origem.
7. Para famílias totalmente verdes, continuar canário/lote pequeno e verificado.
8. Só depois avançar da R0 fiscal para pagamentos/recebimentos, tela do entregador e conciliação.
