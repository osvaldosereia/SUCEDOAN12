# Catálogo XML — informações técnicas completas da NF-e (v4)

**Escopo:** somente XMLs já importados do Bling ou enviados manualmente. Nenhuma pesquisa Cosmos/SI5, API IA, agendamento novo, atualização fiscal, alteração de preços ou estoque.

## Estrutura

- View `purchase_xml_catalog_technical_evidence_v4` no Supabase canônico: consulta de fonte preservada, invoker RLS, acesso somente service_role.
- Reconhece por item: EAN comercial/tributável, unidades e quantidades comerciais/tributáveis, custo documentado, pedido do fornecedor (`xPed` e `nItemPed`), `indTot`, `indEscala`, `cBenef`, `nFCI`, CFOP sob perspectiva do emitente.
- Fiscal de origem: NCM, CEST, ICMS (CST/CSOSN, alíquotas/valores), PIS, Cofins, IPI e informações de II/ICMS destino, quando existentes.
- Reforma tributária: CST IBS/CBS, `cClassTrib`, base, IBS estadual/municipal e CBS exatamente como declarados. **NÃO homologar essas regras com base no XML do fornecedor.**
- Rastreabilidade: lotes `rastro` apenas quando presentes, sem inferir validade ou dimensões.
- Não inventar medidas: colunas físicas são explicitamente nulas quando não constam da documentação.
- Endpoint autenticado `purchase_action=xml_catalog_technical_evidence` recebe `observation_id` UUID, devolve uma ficha de cada vez. Nenhum UPDATE/INSERT; dados fiscais continuam em revisão.
- Frontend da ficha histórica apresenta botão **Ver dados fiscais completos** por item: lê somente sob clique, exibe grupos de atributos e escapa valores externos; preserva formulário de cadastro inativo aberto.

## Auditoria em 08/10/2026

Dados consultados no Supabase canônico:
- 90 XMLs, 214 itens completos no catálogo.
- 214 itens com IBS/CBS e grupos ICMS/PIS/Cofins descritos no XML.
- 135 itens com referência de pedido de fornecedor.
- 16 itens com código de benefício fiscal, 3 com FCI.
- 1 item com CFOP 5910, marcado para análise da operação.
- 0 informações de lotes `rastro` neste conjunto; não confundir com lote inexistente no mundo físico.

## Validação

- View criada e confirmada com 214 linhas para 214 identificadores distintos, sem multiplicação por joins.
- Teste de privilégio: `anon` e `authenticated` sem SELECT; `service_role` com SELECT.
- Edge Function de homologação `admin-xml-fiscal-evidence-stage-v4` (JWT obrigatório) devolveu HTTP 200 para uma observação real, com IBS/CBS; retorna HTTP 400 para identificador inválido.
- Nenhuma gravação em `products`, `product_fiscal_profiles`, estoque ou Bling.
- Teste versionado `scripts/test-xml-catalog-technical-evidence-v4.mjs` e CI dedicado.

## Publicação controlada

**Não substituir imediatamente o Admin principal**, pois PRs #976 (UX de XML) e #980 (comparação fiscal XML) estão em revisão e alteram os mesmos arquivos. Após homologação e mesclagem coordenada, incorporar o módulo e interface preservando ambos. O CI geral de página de pedidos vem falhando em caso não relacionado ao XML (`channel_origin`), investigar separadamente sem mascarar o teste.
