# Criador de Kits + Cestas do Site — Design

Data: 2026-10-05

## Objetivo

Substituir a experiência atual, que mistura modelo, lote, vínculo, família, posição e montagem, por duas ferramentas operacionais simples:

1. **Criador de Kits** — cria receitas internas reutilizáveis de produtos, sem reservar estoque.
2. **Cestas do Site** — cria os produtos comerciais externos usando um ou mais kits internos e reserva estoque somente quando o usuário informa a quantidade a montar.

A interface deve esconder conceitos técnicos de banco e estoque. O operador deve enxergar apenas produtos, kits, cestas do site, quantidades e valores.

## Princípios

- Kit interno é uma **receita**, não um estoque.
- Salvar ou editar um kit **não reserva estoque**.
- Cesta externa é uma **combinação comercial** de um ou mais kits internos.
- Reservar estoque acontece somente ao criar/montar uma quantidade real de cesta externa.
- Kits podem ser usados como base para criar outros kits, mas os itens são **copiados/expandidos**, sem dependência viva entre os kits.
- Lotes já montados preservam um **snapshot** da composição usada no momento da montagem. Alterar um kit depois não modifica lotes anteriores.
- Se dois kits da mesma cesta usam o mesmo produto, as quantidades são somadas antes de custo, preço, capacidade e reserva.
- O backend pode reutilizar o motor canônico de reserva/lotes já validado; a interface não deve expor seus conceitos internos.

---

# 1. Navegação

A seção `Cestas` do Admin passa a ter somente duas abas principais:

- **Criador de Kits**
- **Cestas do Site**

A UI antiga de modelo/lote guiado não permanece como fluxo paralelo. Durante a migração ela pode existir apenas como compatibilidade interna de dados, nunca como caminho alternativo do operador.

---

# 2. Aba Criador de Kits

## 2.1 Layout desktop

Tela dividida em três colunas:

### Coluna 1 — Produtos

Objetivo: localizar produtos e adicioná-los ao kit em montagem.

Elementos:

- campo de busca por nome, SKU ou EAN;
- barra horizontal de chips com rolagem;
- botão `+ Atalho`;
- lista de produtos;
- carregamento incremental para manter a tela leve.

Cada produto mostra:

- foto;
- nome;
- SKU/EAN;
- embalagem;
- estoque total;
- estoque reservado;
- estoque avulso;
- custo real;
- preço de venda real;
- quantidade a adicionar;
- botão `Adicionar`.

### Edição rápida de produto

Na própria linha/card o operador pode editar:

- estoque real/avulso permitido pela regra de estoque;
- preço de custo;
- preço de venda.

Botão `Salvar produto` grava os dados no cadastro oficial do produto.

### Proteção de estoque

A edição de estoque nunca pode apagar ou reduzir estoque já reservado abaixo da quantidade bloqueada.

Exemplo:

- total efetivo: 100;
- reservado: 30;
- avulso: 70.

O operador pode ajustar a parcela disponível conforme a regra oficial de estoque, mas 30 unidades reservadas continuam protegidas.

## 2.2 Chips de busca rápida

Chips são apenas atalhos de pesquisa, não famílias técnicas.

Exemplos:

`Arroz` `Feijão` `Óleo` `Açúcar` `Macarrão` `Limpeza` `Higiene`

Devem permitir:

- criar;
- renomear;
- reordenar;
- excluir;
- clicar para preencher/aplicar a busca;
- rolagem horizontal em telas pequenas.

Chips são configuração do Admin e não alteram produtos nem kits.

---

# 3. Coluna 2 — Kit em montagem

## 3.1 Cabeçalho

Campos:

- nome do kit;
- observação interna opcional;
- `Usar kit existente como base`;
- indicação informativa `Criado a partir de: ...` quando aplicável.

A origem é apenas histórico. Não cria vínculo funcional.

## 3.2 Itens

Cada item mostra:

- foto;
- nome;
- quantidade no kit;
- custo unitário;
- preço de venda unitário;
- subtotal de custo;
- subtotal de venda;
- `+` / `−` ou campo numérico;
- `Trocar`;
- `Remover`.

Produtos iguais adicionados duas vezes devem ser consolidados em uma única linha, somando quantidade.

## 3.3 Resumo fixo

Rodapé visível durante a rolagem:

- quantidade de linhas/produtos;
- custo total do kit;
- soma dos preços de venda dos produtos.

Ações:

- `Salvar kit` — atualiza o kit que está sendo editado;
- `Salvar como novo` — cria cópia independente;
- `Limpar` — limpa a montagem atual com confirmação se houver alterações não salvas.

Salvar um kit nunca reserva estoque.

---

# 4. Usar kit como base

Ao selecionar um kit existente como base:

1. o sistema lê a composição atual do kit escolhido;
2. copia todos os produtos e quantidades para a montagem atual;
3. os produtos aparecem como se tivessem sido adicionados manualmente;
4. o operador pode alterar, trocar, remover ou adicionar itens;
5. ao salvar como novo, o novo kit recebe sua própria composição;
6. alterações futuras no kit de origem não propagam para o kit derivado.

Não haverá kit aninhado por referência na receita salva. O kit derivado guarda produtos, não um ponteiro vivo para o kit original.

---

# 5. Coluna 3 — Reuso rápido

A terceira coluna terá dois modos:

## 5.1 Mais usados

Produtos mais recorrentes em kits ativos.

Exibe:

- foto;
- nome;
- estoque avulso;
- quantidade de kits que usam o produto;
- botão `Adicionar`.

Ordenação principal: quantidade de kits em que o produto aparece. Desempate por nome.

## 5.2 Kits existentes

Lista dos kits internos ativos com:

- nome;
- número de produtos;
- custo total calculado;
- soma de venda calculada;
- botão `Usar como base`;
- botão `Editar`.

A lista não mistura kits com cestas externas.

---

# 6. Responsividade

## Desktop

Três colunas simultâneas.

## Tablet

Colunas 1 e 2 principais; coluna 3 recolhível.

## Celular

As três colunas tornam-se abas/segmentos internos:

- `Produtos`;
- `Kit`;
- `Mais usados`.

O conteúdo deve usar uma única rolagem vertical previsível. Nenhum modal deve depender de uma rolagem escondida ou de barras horizontais para acessar ações essenciais.

---

# 7. Aba Cestas do Site

## 7.1 Conceito

Uma cesta externa é um produto comercial composto exclusivamente por um ou mais kits internos.

O usuário não adiciona produtos avulsos diretamente nesta aba.

Exemplos:

### Econômica Bonini

- `Alimentos Econômica`

### Grande Bonini

- `Alimentos Grande Bonini`
- `Limpeza e Higiene Padrão`

Uma cesta externa pode usar 1, 2 ou mais kits.

## 7.2 Criação/edição

Campos:

- nome da cesta externa;
- imagem;
- categoria pública;
- kits internos usados;
- quantidade a montar;
- preço final de venda;
- status público/venda.

O sistema mostra, antes de confirmar:

- custo total dos produtos;
- soma dos preços de venda dos produtos;
- preço final configurado;
- valor oculto;
- quantidade a montar;
- capacidade máxima pelo estoque;
- produtos insuficientes, se houver.

## 7.3 Valor oculto

`valor oculto = preço final da cesta externa - soma dos preços de venda dos produtos consolidados`

O valor oculto pertence à cesta externa/lote comercial e não aos kits internos.

Pode ser positivo, zero ou negativo; o sistema apenas destaca visualmente valores negativos para revisão, sem bloquear por padrão.

---

# 8. Consolidação dos kits

Antes de qualquer cálculo ou reserva, o sistema deve achatar todos os kits escolhidos em uma única composição por produto.

Exemplo:

- Kit Alimentos usa 1 detergente;
- Kit Limpeza usa 2 detergentes;
- composição final usa 3 detergentes por cesta.

Para 10 cestas, o sistema reserva 30 detergentes.

A consolidação é usada para:

- custo;
- soma dos preços de venda;
- capacidade máxima;
- verificação de estoque;
- reserva;
- snapshot do lote;
- impressão/separação.

---

# 9. Reserva e montagem

## 9.1 Kit interno

Criar/editar kit:

- não mexe em estoque;
- não cria reserva;
- não cria lote físico.

## 9.2 Cesta externa

Ao informar uma quantidade e confirmar `Criar/Montar`:

1. sistema resolve os kits selecionados;
2. achata a composição;
3. consolida SKUs repetidos;
4. multiplica pela quantidade;
5. bloqueia/concorre atomicamente no banco;
6. revalida estoque avulso;
7. se faltar qualquer produto, não cria reserva parcial;
8. se tudo estiver disponível, cria o lote/reserva;
9. salva snapshot completo da composição e valores.

O motor de reserva já validado pode ser reutilizado, desde que receba a composição achatada e permaneça a única fonte de verdade para bloquear estoque.

---

# 10. Versionamento e histórico

Kit interno tem versão lógica por `updated_at`/snapshot de conteúdo.

Um lote de cesta externa guarda:

- IDs dos kits usados;
- versão/snapshot dos kits naquele momento;
- composição final consolidada;
- custos e preços unitários utilizados;
- preço final da cesta;
- valor oculto;
- quantidade montada;
- operador e data.

Alterar um kit depois não altera lotes anteriores.

Ao editar uma cesta externa que já tem lotes, a nova configuração vale apenas para novas montagens.

---

# 11. Dados e isolamento arquitetural

## 11.1 Nova camada canônica de receitas

Criar uma camada própria para kits internos, separada do conceito atual de cesta comercial/lote.

Entidades recomendadas:

- `assembly_kits`
  - id
  - name
  - notes
  - source_kit_id opcional, apenas histórico
  - is_active
  - created_at / updated_at

- `assembly_kit_items`
  - kit_id
  - product_id
  - quantity
  - position/order

- `assembly_search_chips`
  - id
  - label
  - query
  - sort_order
  - is_active

- `store_basket_recipes`
  - basket_id / commercial_id
  - configuração comercial atual

- `store_basket_recipe_kits`
  - basket_id
  - kit_id
  - sort_order

Os nomes exatos podem ser ajustados na implementação, mas a separação semântica é obrigatória.

## 11.2 Reuso do que já funciona

Reutilizar:

- tabela oficial de produtos;
- visão de estoque avulso/reservado;
- motor canônico de reservas/lotes;
- disponibilidade pública;
- checkout/publicação já validados.

Não reutilizar como UI ou domínio principal:

- posições/famílias do editor guiado atual;
- compositores legados;
- vínculo de lote apresentado ao usuário;
- múltiplos editores concorrentes.

---

# 12. Atualização rápida de produto

A edição na Coluna Produtos deve usar um endpoint/RPC administrativo único e transacional.

Regras:

- custo >= 0;
- venda >= 0;
- estoque informado não pode violar reserva existente;
- atualizar `updated_at`/auditoria;
- resposta devolve imediatamente estoque total, reservado e avulso recalculados;
- falha em qualquer campo não deixa atualização parcial;
- operações restritas a perfil administrativo permitido.

---

# 13. Migração das cestas atuais

A migração não deve recriar estoque nem duplicar reserva.

Para as 9 cestas ativas atuais:

1. ler o snapshot/composição comercial hoje publicado;
2. classificar produtos em `Alimentos` e `Limpeza e Higiene` com regras determinísticas e revisão de exceções;
3. gerar kits internos distintos por composição exata;
4. deduplicar kits de limpeza/higiene idênticos;
5. criar as receitas das cestas externas referenciando os kits internos;
6. Econômica permanece somente com kit de alimentos, conforme regra atual;
7. lotes já existentes permanecem como snapshots históricos, sem nova reserva;
8. novas montagens passam a usar a nova receita de kits;
9. validar que estoque público e reservado antes/depois da migração não mudou.

A migração precisa produzir um relatório comparativo por cesta antes de ser aplicada em produção.

---

# 14. Operação de kits

Lista de kits deve permitir:

- criar;
- editar;
- duplicar;
- usar como base;
- arquivar.

Arquivar um kit:

- não apaga histórico;
- não altera lotes anteriores;
- é bloqueado se ele ainda estiver configurado em alguma cesta externa ativa, ou exige remoção/substituição primeiro.

Excluir fisicamente não faz parte da operação normal.

---

# 15. Operação de cestas externas

Lista de Cestas do Site mostra de forma direta:

- foto;
- nome;
- kits que compõem;
- preço final;
- valor oculto da configuração atual;
- quantidade pública disponível;
- status de venda;
- lotes existentes.

Ações principais:

- `Editar cesta`;
- `Montar`;
- `Ver lotes`;
- `Imprimir`;
- `Pausar/Ativar venda`.

`Ver lotes` abre lista real de lotes, nunca um editor genérico. Cada lote mostra código, quantidade inicial, disponível, estado, venda e ações específicas.

---

# 16. Impressão

Impressão de lote usa o snapshot real do lote e mostra:

- nome da cesta;
- código do lote;
- quantidade montada;
- produtos consolidados;
- foto;
- nome;
- quantidade por cesta;
- quantidade total necessária no lote.

Não deve abrir ou mutar editor para imprimir.

---

# 17. Erros e concorrência

Mensagens devem ser operacionais, em português:

- `Estoque insuficiente: Óleo precisa de 20 e há 15 disponíveis.`
- `Este kit está sendo usado pela Grande Bonini. Remova ou substitua o kit antes de arquivar.`
- `O estoque mudou enquanto você montava. A tela foi atualizada; revise a quantidade.`

Reservas são atômicas. Nenhuma falha pode deixar meia cesta reservada.

---

# 18. Performance

- busca de produtos paginada/incremental;
- chips não fazem pré-carregamento do catálogo inteiro;
- coluna Mais usados traz conjunto limitado e paginável;
- kits existentes carregam resumo primeiro e itens sob demanda;
- imagens lazy-load;
- evitar recarregar toda a seção após alterar um único produto;
- cache curto somente para dados não críticos; estoque é revalidado no servidor antes de reservar.

---

# 19. Testes mínimos

## Criador de Kits

1. criar kit com produtos manuais;
2. editar quantidades;
3. remover produto;
4. produto repetido consolida quantidade;
5. custo total correto;
6. venda total correta;
7. kit não reserva estoque;
8. usar kit como base expande produtos;
9. derivado não muda quando origem muda;
10. salvar como novo não altera origem;
11. chips criar/editar/reordenar/excluir;
12. busca por nome/SKU/EAN;
13. edição rápida de custo/venda;
14. edição de estoque não viola reservado;
15. mais usados reflete kits ativos.

## Cestas do Site

16. criar cesta com um kit;
17. criar cesta com dois kits;
18. mesmo produto em dois kits é consolidado;
19. custo consolidado correto;
20. venda consolidada correta;
21. valor oculto correto;
22. quantidade máxima por estoque correta;
23. falta de estoque bloqueia montagem;
24. reserva completa é atômica;
25. kit alterado depois não muda lote antigo;
26. nova montagem usa nova versão do kit;
27. lista de lotes mostra todos os lotes;
28. impressão usa snapshot real;
29. pausa/retomada de venda não altera composição;
30. migração das 9 cestas não muda estoque/reservas.

## UI/browser

31. desktop três colunas sem sobreposição;
32. chips rolam horizontalmente;
33. coluna do kit possui rolagem vertical clara;
34. resumo permanece acessível;
35. tablet funcional;
36. celular usa abas internas sem overflow horizontal;
37. nenhum seletor/ação do editor legado reaparece.

---

# 20. Estratégia de implantação

1. criar novas tabelas/RPCs de receitas em paralelo, sem mudar storefront;
2. implementar Criador de Kits e testes;
3. gerar relatório de migração das 9 cestas atuais;
4. revisar migração sem alterar estoque;
5. implementar Cestas do Site usando as receitas;
6. integrar com o motor de reserva já validado;
7. migrar configurações das 9 cestas;
8. validar equivalência pública e de estoque;
9. trocar a UI da seção Cestas para as duas novas abas;
10. aposentar rotas/componentes do editor guiado anterior somente depois da validação.

Rollback: a migração mantém os dados antigos até a validação completa; voltar a leitura da configuração anterior deve ser possível sem reconstruir estoque.

---

# 21. Critérios de aceite

A solução é aceita quando:

- um operador consegue criar um kit sem compreender modelo/lote/família/posição;
- um kit pode ser criado do zero ou a partir de outro kit expandido;
- editar kit não altera estoque;
- produtos podem ter custo/venda/estoque ajustados no Criador sem abrir cadastro;
- uma cesta externa só é composta por kits internos;
- preço final e valor oculto são claros;
- estoque é reservado apenas ao montar quantidade real;
- lotes anteriores preservam composição histórica;
- as 9 cestas atuais continuam disponíveis no site após migração;
- nenhuma unidade de estoque é criada, perdida ou reservada em duplicidade na migração;
- a UI antiga confusa deixa de ser o fluxo operacional.
