# Catálogo XML — Fase 2: ficha histórica e vinculação aprovada

## Funcionalidade
- Ficha por produto candidato, carregada somente ao clicar em “Ver ficha e histórico”.
- Fonte por NF-e: fornecedor, data, código do fornecedor, GTIN comercial/tributável, NCM, CEST, CFOP, quantidade, unidade, custo de compra, produto associado e revisão.
- Sugestão de produto já cadastrado é somente informativa; o operador escolhe uma linha específica e o produto de destino.
- Ação explícita: vincular uma linha ao cadastro atual (preservar o nome atual) OU criar produto inativo com estoque 0.
- Papel do código de barras e fator de embalagem precisam de confirmação; embalagem externa FD/CX requer papel embalagem e fator superior a 1.
- Sem EAN numérico ou com compra em KG/G/L/LT/MT/M/TON, bloqueio nesta ficha e indicação de revisão operacional. Não inventar “1 KG = 1 UN”.
- Criação a partir desta ficha: NCM não é gravado como classificado; o código extraído e CEST ficam em metadados como candidatos para revisão fiscal.
- Sem lançamento automático de estoque, preços ou Bling pela ficha. Custo/preço e recebimento são tratados pela sessão de compras já existente.

## Infraestrutura
- Nova visão `purchase_xml_catalog_observation_details_v2`: um registro por observação do XML original, joins somente de leitura com produto e perfil fiscal. RLS e acesso exclusivo via service_role.
- Nova ação `xml_catalog_candidate_detail` no backend do Admin, retornando até 60 ocorrências por candidato e propostas de produto para seleção humana.
- Nenhum cron e nenhuma API externa.

## Testes
- Migração aplicada no Supabase canônico.
- View conferida: 211 linhas, 211 observações distintas, mantendo todos os dados catalogados.
- Acesso direto à view bloqueado para `anon` e `authenticated`; o backend `service_role` mantém acesso.
- Execução em função de stage com autenticação: HTTP 200, amostra de feijão sem EAN e unidade KG retornou pendente sem vínculo.
- Verificações de UI: produto sem EAN/peso não recebe atalhos arriscados de criação/vínculo; EAN numérico e UN recebe ações com confirmação.
- PR separado da fase 1; publicar apenas após revisão de CI e compatibilidade com mudanças simultâneas.


## Rodada V3 — formulário persistente e divergências fiscais
- O formulário de identificação do Catálogo XML conserva EAN (unidade/embalagem), fator de conversão, busca de produto e nome do rascunho ao atualizar a lista de resultados. Ao trocar a linha de XML, reinicia as escolhas para impedir aplicação ao produto errado.
- Quando uma observação já está vinculada a um produto, a ficha sinaliza divergência de NCM/CEST entre o documento e o cadastro/perfil fiscal. Não altera o NCM ou CEST nem grava perfil fiscal automaticamente.
- Criado `scripts/test-xml-catalog-review-ux-v3.mjs` com teste de renderização e preservação do estado, alertas e regras de autorização.
- A seção permanece carregada sob demanda, sem API externa e sem novo agendamento.
- Os itens de compra sem GTIN válido ou medidos em KG/L continuam em revisão operacional; nunca converter para unidades por suposição.
