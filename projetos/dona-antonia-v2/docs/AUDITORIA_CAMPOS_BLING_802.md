# Auditoria de cadastro dos produtos — Bling, 802 SKUs

Fonte técnica auditada: **DONA_ANTONIA_BLING_802_PRODUTOS_INDEPENDENTES_7_CATEGORIAS.csv**, 802 linhas, cabeçalho compatível com o modelo de exportação Bling de **59 colunas**. A cópia encontrada tem metadado `model_generated: true` e sua origem **não está comprovada como exportação do Bling**. O usuário autorizou explicitamente seu uso como base inicial da V2. Ela foi carregada somente no projeto Supabase V2 isolado como catálogo de staging; portanto, continua sendo fixture/histórico e não deve ser tratada como export oficial, banco atualizado do Bling ou saldo físico.

## Contagens reais no arquivo
- 802/802 SKUs, descrições, unidades UN, preços, custos, NCM, origem, fornecedores, códigos de fornecedor e categoria.
- 776/802 GTIN/EAN de unidade preenchidos (26 sem GTIN).
- 28/802 GTIN de embalagem e itens por caixa preenchidos.
- 668/802 CEST preenchidos e 652/802 marca.
- 802/802 inativos, estoque **em branco/desconhecido**. Não publicar diretamente: precisa conferência física.
- ID Bling ausente em todas as linhas; esta cópia não permite vincular cadastro criado no Bling.
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

O importador `scripts/import-bling.mjs` agora opera em dry-run por padrão. A validação cobre o cabeçalho, SKU único, GTIN e dígito verificador, GTIN da embalagem, categoria, unidade, preço/custo não negativos, itens por caixa e formato de NCM/CEST; GTIN duplicado e NCM/CEST fora de formato aparecem em conflitos de revisão, e GTINs unitários duplicados desativam as linhas afetadas na projeção. O saldo em branco é preservado como desconhecido no arquivo privado e projetado como zero apenas para manter a saída pública não vendável. Custo com até quatro casas decimais é preservado em `purchase_cost_exact` (numeric(12,4)); centavos arredondados permanecem em `purchase_cost_cents` apenas para compatibilidade. Ambos e os 59 campos originais ficam no perfil privado. O comando não chama API nem banco. Arquivos locais só são criados com `--write-to` explícito, fora de `public/`, e o JSON administrativo recebe permissão `0600`.

### Execução R04 — 24/10/2026
- SHA-256 da cópia auditada: `80d5733eeee4135c04c461b79c44e2afb42c1916c49eafca76f20e9fcbe1d4e1`.
- Cabeçalho compatível com o esperado: 59 colunas; registros: 802; SKUs únicos: 802; SKUs duplicados: 0.
- GTIN unitário: 776 preenchidos, 26 ausentes, 0 duplicados e 0 erros de dígito verificador. GTIN de embalagem/itens por caixa: 28 preenchidos.
- NCM: 802 preenchidos e válidos após remover pontuação; CEST: 668 preenchidos e válidos. Marca: 652 preenchidas.
- Preço e custo preenchidos nas 802 linhas; não foram incluídos valores no relatório por serem comerciais. O custo tem quatro casas decimais em todas as linhas; o schema V2 atual guarda centavos inteiros, então as 802 linhas ficam em revisão por possível perda de precisão até decisão de modelagem/ arredondamento.
- Situação: 802 inativos; estoque: 802 em branco/desconhecido; vendáveis: 0.
- Resultado: dry-run estrutural aprovado; 802 alertas de precisão de custo, sem erros de SKU/GTIN/NCM/CEST. **Importação no staging bloqueada** até obter um export oficial comprovável, decidir como preservar os quatro decimais do custo e ensaiar o login do admin V2; a origem atual não satisfaz o gate do planejamento. Não foi feita escrita em arquivo gerado, banco, Bling ou produção.

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
