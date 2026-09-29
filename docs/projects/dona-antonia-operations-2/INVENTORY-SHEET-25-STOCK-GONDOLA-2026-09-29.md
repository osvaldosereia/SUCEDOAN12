# Balanço A4 — layout 25 produtos + estoque/gôndola

Data: 2026-09-29

## Alteração concluída
- impressão permanece A4 vertical;
- cada página agora comporta 25 produtos em grade 5 colunas × 5 linhas;
- validade foi removida do card impresso;
- foram removidas as caixas numeradas de 0 a 10;
- cada produto possui somente dois campos manuscritos:
  - ESTOQUE, à esquerda;
  - GÔNDOLA, à direita;
- a foto continua sendo da folha A4 inteira.

## Leitura por IA
A leitura do balanço foi atualizada para o novo layout:
- até 25 cards por página;
- lê REF e EAN para conferência de identidade;
- lê separadamente a quantidade manuscrita em ESTOQUE;
- lê separadamente o número manuscrito em GÔNDOLA;
- não procura validade nem caixas 0–10;
- qualquer campo duvidoso vai para confirmação humana.

## Aplicação
Na revisão do Admin são mostrados dois campos editáveis por produto: estoque e gôndola.
Ao aplicar:
- estoque segue o fluxo canônico já existente e mantém a sincronização/segurança com Bling;
- gôndola é salva em `products.gondola`;
- se a gôndola ainda não existir em `vitrine_gondolas`, ela é criada/reativada;
- mudança de gôndola limpa a prateleira antiga para evitar localização inconsistente.

## Persistência
`inventory_sheet_item_results` recebeu:
- `ai_gondola`;
- `confirmed_gondola`;
com validação de 1 a 9999.

## Implementação
- GitHub: commit funcional `85b51dd74c84bd502c76a5341a9bb1bc8198765e`;
- Supabase: `admin-products-live-v1` publicado em v71;
- migration: `20260929103000_inventory_sheet_gondola_capture_v2.sql`.

## Validação
Verificado no código:
- grade 5×5;
- sem validade no card;
- sem caixas 0–10;
- dois campos ESTOQUE/GÔNDOLA;
- payload da confirmação envia ambos;
- backend aceita 25 itens e persiste gôndola;
- constraints da nova coluna presentes no banco.

Validação física ainda recomendada: imprimir uma folha real, preencher os 25 cards à mão, fotografar a página inteira e conferir a leitura antes de usar o lote completo.


## Refinamento visual — fotos maiores (2026-09-29)

Após validação do layout 5×5, o card foi compactado internamente para privilegiar a identificação visual do produto sem alterar a quantidade de 25 produtos por página. A área da foto passou de 25 mm para 30 mm de altura; paddings e pequenos espaçamentos internos foram reduzidos, enquanto os quadros manuscritos de ESTOQUE e GÔNDOLA permaneceram com 8,4 mm de altura. Nome, EAN e REF continuam presentes. Alteração aplicada em `vitrine/admin/index.html` no commit `9beae71b48bed518b7c708a927f7816693465040`.
