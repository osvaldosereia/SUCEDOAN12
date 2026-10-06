# Design: categorias, subdivisões e vitrine de cestas

**Data:** 2026-10-06  
**Status:** Design aprovado em conversa; aguardando revisão deste documento antes do plano de implementação.

## Objetivo

Organizar a vitrine de cestas em categorias e subdivisões configuráveis no admin, ajustar os cards para três colunas no celular e seis no desktop, e permitir que a equipe administre esses agrupamentos para cestas e kits sem regras embutidas baseadas em nomes.

## Entendimento aprovado

- Somente **Cestas Completas** e **Cestas Só Alimentos** começam ativas.
- Cada uma começa com as subdivisões **Grande**, **Média**, **Pequena** e **Mini**.
- Cada molde inicial desses tamanhos começa com três composições públicas, exibidas como **Tipo 1**, **Tipo 2** e **Tipo 3**.
- A quantidade de composições continua editável por molde.
- A categoria e a subdivisão de cada cesta ou kit são definidas pelo usuário no admin. A cesta **Econômica** não recebe tratamento especial; sua classificação é escolhida no admin.
- Categorias, subdivisões, nomes, ordem e estado ativo devem ser configuráveis. A vitrine consulta esses dados e vínculos; não deriva classificação, tamanho ou comportamento do texto de nomes ou de slugs.
- Os cards mostram três colunas em telas móveis e seis colunas em telas desktop, mantendo os elementos do card legíveis e proporcionais.

## Abordagem

Persistir subdivisões como registros próprios vinculados a uma categoria, com chaves estáveis para associar cada cesta ou kit. Essa estrutura permite renomear e reorganizar os rótulos sem alterar a lógica da vitrine ou os vínculos existentes.

### Dados

- Manter `basket_categories` como cadastro de categorias.
- Criar `basket_subcategories`, com vínculo obrigatório à categoria, nome, slug técnico, ordem e estado ativo.
- Adicionar `subcategory_id` a `basket_templates` e `basket_kit_templates`.
- Aplicar chaves estrangeiras e índices; impedir a exclusão de categoria ou subdivisão enquanto houver registros vinculados.
- Restringir acesso direto às tabelas e usar as Edge Functions autenticadas já existentes para operações administrativas.
- Criar inicialmente as duas categorias e oito subdivisões descritas acima. Desativar **Kits Promocionais** e as demais categorias atualmente ativas para que somente as duas escolhidas apareçam no início. Novas categorias e subdivisões são criadas inativas até ativação explícita.
- Não inferir nem preencher vínculos de subdivisão pelo nome das cestas. Cestas e kits sem classificação completa permanecem administráveis e não entram em uma subdivisão pública até serem classificados.

### Admin

- Adicionar uma área de gestão de categorias e subdivisões dentro do fluxo existente de Cestas.
- Permitir criar, renomear, reordenar, ativar/desativar e excluir categorias e subdivisões não utilizadas.
- Exibir contagem e vínculo de cestas/kits para prevenir exclusões que perderiam classificação.
- Nos editores de moldes e kits, apresentar primeiro a categoria e depois apenas suas subdivisões ativas. Selecionar uma categoria deve atualizar a lista de subdivisões.
- Manter a quantidade pública de composições por molde configurável; os moldes iniciais Grande, Média, Pequena e Mini recebem valor inicial 3.

### Vitrine pública

- Buscar categorias e subdivisões ativas junto às cestas e kits publicados.
- Construir as seções dinamicamente com a ordem salva no admin; cada subdivisão contém os cards que apontam para ela.
- Gerar os rótulos Tipo 1, Tipo 2, ..., a partir do número configurado de composições do molde.
- Não depender de nomes como “Grande”, “Econômica” ou “Cestas Completas”, nem de uma lista fixa de slugs.
- Usar três colunas em telas móveis, quatro em telas médias e seis em telas desktop. Dimensionar imagem, nome, preço e botão para evitar sobreposição nas larguras menores.

## Compatibilidade e transição

- Preservar IDs e vínculos de categoria existentes.
- A migração adiciona subdivisões e campos sem remover cestas, kits ou histórico.
- A ativação inicial mantém somente as duas categorias solicitadas visíveis.
- A classificação das cestas e kits existentes será feita pelos controles do admin, sem associação automática por nome.
- Reativar ou criar outras categorias posteriormente será possível no admin, sem novo deploy para alterar rótulos, ordem ou estado.

## Critérios de aceite

1. O admin pode criar, editar, reordenar e ativar categorias e subdivisões.
2. O admin pode classificar cestas e kits por categoria e subdivisão; a lista de subdivisões respeita a categoria selecionada.
3. A vitrine apresenta apenas agrupamentos ativos configurados, na ordem definida no admin.
4. Cestas sem classificação completa não aparecem soltas nem são classificadas por nome.
5. Um molde com três composições exibe exatamente Tipo 1, Tipo 2 e Tipo 3; a quantidade pode ser alterada no admin.
6. Os cards usam três colunas em telas móveis e seis em desktop, sem sobreposição de seus componentes.
7. Na configuração inicial, somente Cestas Completas e Cestas Só Alimentos estão ativas, cada uma com Grande, Média, Pequena e Mini.

## Fora de escopo

- Criar ou ativar novas categorias além das duas iniciais.
- Alterar composição, preço ou valor oculto dos produtos que formam cada cesta.
- Classificar automaticamente cestas e kits existentes a partir do nome.
