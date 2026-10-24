# Auditoria de cadastro dos produtos — Bling, 802 SKUs

Fonte auditada: **DONA_ANTONIA_BLING_802_PRODUTOS_INDEPENDENTES_7_CATEGORIAS.csv**, 802 linhas, modelo oficial de **59 colunas**. Não é banco Supabase atualizado; é o arquivo-base anterior à integração.

## Contagens reais no arquivo
- 802/802 SKUs, descrições, unidades UN, preços, custos, NCM, origem, fornecedores e categoria.
- 776/802 GTIN/EAN de unidade preenchidos (26 sem GTIN).
- 28/802 GTIN de embalagem e itens por caixa preenchidos.
- 668/802 CEST preenchidos e 652/802 marca.
- 802/802 inativos, estoque **em branco** de propósito. Não publicar diretamente: precisa conferência física.
- ID Bling ausente em todas as linhas, pois ainda não existe cadastro no Bling associado.
- CFOP/CST/CSOSN de saída não são campos desse CSV de produtos: dependem da operação, regime e destino.

## O que a V2 tinha e o que foi alterado
| Grupo | Modelo público Product | SQL inicial | Perfil Bling privado |
|---|---|---|---|
| SKU/Descrição/Marca/Categoria | Sim | Sim | SKU de vínculo |
| GTIN unitário | Sim | Sim | Sim |
| Preço/Estoque/Ativo | Sim | Sim | Não duplicar autoridade |
| Foto 1:1 | Sim | Sim | Não |
| NCM/CEST | Não (corretamente) | Sim | Sim |
| Custo | Não (corretamente) | Sim | Vincular privado |
| Origem, UN, fornecedor e código fornecedor | Não | Parcial | Sim |
| EAN da embalagem, itens/caixa | Não | Sim | Sim |
| 59 campos originais | Não | Não | original_bling_import jsonb |
| ID Bling / sincronia | Não | Parcial | Sim |
| CFOP/CST da nota | Não | Não | Contexto fiscal transacional |

O importador \`scripts/import-bling.mjs\` já valida as 59 colunas e salva \`originalBlingFields\` no arquivo privado \`data/catalog.admin.json\`, mas **não grava no banco nem realiza OAuth**. Antes de importação real, mapear JSON privado para \`da_next.bling_product_profiles\` e \`da_next.products\` dentro de transação.

## Organização de interface profissional
- Lista rápida: foto quadrada, nome, SKU, EAN, estoque, preço e ativo.
- Ficha futura: "Geral e imagens", "Preços e estoque" e "Fiscal e fornecedor".
- Apenas gestor com permissão pode ver custos, dados fiscais e fornecedor.
- Erros de NCM/CEST são validados e explicados, não impedem editar estoque.
- SKU de cada sabor/aroma é independente. Não transformar em produto pai/variante.
- Natureza de operação e regras de saída definidas pelo responsável fiscal antes da NF-e.
- **Proibido** publicar original_bling_import, custo ou dado do fornecedor nos JSON estáticos de \`/site1\`.

## Gates antes do Bling real
OAuth seguro servidor; não armazenar segredo no bundle; limite de API e retry; guardar BLING ID; idempotência de cadastros; reconciliação de estoque e preços com política explícita; simular erro de NCM e API 429; aprovação fiscal.
