# Criador de Kits + Cestas do Site — Design

Data: 2026-10-05

## Objetivo

Substituir a experiência atual, que mistura modelo, lote, vínculo, família, posição e montagem, por duas ferramentas operacionais simples:

1. **Criador de Kits** — cria receitas internas reutilizáveis de produtos, sem reservar estoque.
2. **Cestas do Site** — cria produtos comerciais externos usando um ou mais kits internos e reserva estoque somente quando o operador informa uma quantidade real a montar.

A interface deve esconder conceitos técnicos de banco e estoque. O operador deve enxergar produtos, kits, cestas do site, quantidades e valores.

## Princípios obrigatórios

- Kit interno é uma **receita**, não estoque físico.
- Salvar ou editar kit **não reserva estoque**.
- Cada kit tem um tipo operacional simples: `Alimentos`, `Limpeza e Higiene` ou `Outro`.
- Cesta externa é combinação comercial de um ou mais kits internos.
- A `quantidade` informada na Cesta do Site é sempre **quantidade física a montar**, nunca quantidade da receita.
- Kit pode ser usado como base para outro kit, mas seus itens são **copiados/expandidos**; não existe dependência viva entre kits.
- Lote montado preserva snapshot da composição. Alterar kit depois não modifica lote anterior.
- Produtos repetidos entre kits são consolidados antes de custo, preço, capacidade e reserva.
- O motor canônico de estoque/reserva já validado deve continuar sendo a única fonte de verdade para bloquear estoque.
- A UI antiga não permanece como fluxo paralelo.

---

# 1. Navegação

A seção `Cestas` passa a ter somente duas abas principais:

- **Criador de Kits**
- **Cestas do Site**

O editor guiado antigo, famílias, posições, lote vinculado e compositores legados podem permanecer apenas como compatibilidade temporária de dados durante a migração. Não aparecem como alternativa operacional.

---

# 2. Aba Criador de Kits

## 2.1 Layout desktop — três colunas

### Coluna 1 — Produtos

Objetivo: localizar produtos e adicioná-los ao kit em montagem.

No topo:

- busca por nome, SKU ou EAN;
- chips de busca rápida em barra horizontal rolável;
- botão `+ Atalho`.

A lista é incremental e cada produto mostra:

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

### Edição rápida do produto

Na própria linha/card podem ser editados:

- estoque permitido pela regra oficial;
- custo;
- preço de venda.

`Salvar produto` grava no cadastro oficial, sem abrir a tela de Produtos.

A alteração de estoque nunca pode apagar quantidade já reservada. Exemplo: total efetivo 100, reservado 30, avulso 70. Os 30 reservados continuam protegidos.

## 2.2 Chips

Chips são atalhos de busca, não famílias técnicas.

Exemplos: `Arroz`, `Feijão`, `Óleo`, `Açúcar`, `Limpeza`, `Higiene`.

Devem permitir criar, renomear, reordenar, excluir e clicar para aplicar a busca. Em telas estreitas a barra rola horizontalmente.

---

# 3. Coluna 2 — Kit em montagem

## 3.1 Cabeçalho

Campos:

- nome do kit;
- tipo: `Alimentos`, `Limpeza e Higiene` ou `Outro`;
- observação interna opcional;
- `Usar kit existente como base`;
- informação opcional `Criado a partir de: ...` apenas para histórico.

## 3.2 Itens

Cada item mostra foto, nome, quantidade, custo unitário, venda unitária, subtotal de custo, subtotal de venda, alterar quantidade, `Trocar` e `Remover`.

Produtos iguais adicionados mais de uma vez são consolidados em uma única linha, somando quantidade.

## 3.3 Resumo fixo

Rodapé sempre acessível durante a rolagem:

- número de produtos;
- custo total;
- soma dos preços de venda.

Ações:

- `Salvar kit` — atualiza o kit atual;
- `Salvar como novo` — cria kit independente;
- `Limpar` — limpa a montagem com confirmação se houver alterações.

Nenhuma dessas ações reserva estoque.

---

# 4. Usar kit como base

Ao selecionar um kit existente:

1. ler sua composição atual;
2. copiar todos os produtos e quantidades para a coluna central;
3. exibir os itens como se fossem adicionados manualmente;
4. permitir alterar, trocar, remover e adicionar;
5. salvar o resultado como composição própria;
6. alterações posteriores no kit de origem não propagam para o derivado.

Não haverá kit aninhado por referência. O novo kit salva produtos, não ponteiro vivo para outro kit.

---

# 5. Coluna 3 — Reuso rápido

Dois modos:

## Mais usados

Produtos mais recorrentes em kits ativos, exibindo foto, nome, estoque avulso, número de kits em que aparece e `Adicionar`.

## Kits existentes

Lista de kits com nome, tipo, quantidade de produtos, custo calculado, soma de venda, `Usar como base` e `Editar`.

A lista não mistura kits internos com cestas externas.

---

# 6. Responsividade

- **Desktop:** três colunas simultâneas.
- **Tablet:** produtos + kit em destaque; terceira coluna recolhível.
- **Celular:** segmentos internos `Produtos | Kit | Mais usados`.

A ferramenta usa rolagem vertical clara. Ações essenciais não dependem de rolagem escondida nem overflow horizontal. Apenas a barra de chips pode rolar horizontalmente.

---

# 7. Aba Cestas do Site

## 7.1 Conceito

Uma cesta externa é composta exclusivamente por um ou mais kits internos.

Não se adicionam produtos avulsos diretamente nesta aba.

Exemplos:

**Econômica Bonini**
- Alimentos Econômica

**Grande Bonini**
- Alimentos Grande Bonini
- Limpeza e Higiene Padrão

Uma cesta pode usar 1, 2 ou mais kits.

## 7.2 Criação/edição

Campos:

- nome público;
- imagem;
- categoria pública;
- kits internos utilizados;
- preço final de venda;
- status público/venda.

A configuração da receita não precisa de quantidade física.

A ação **Montar** solicita separadamente:

- quantidade de cestas a montar.

Antes de confirmar, o sistema mostra:

- custo dos produtos por cesta;
- soma dos preços de venda por cesta;
- preço final;
- valor oculto;
- quantidade a montar;
- capacidade máxima pelo estoque;
- produtos insuficientes.

## 7.3 Valor oculto

`valor oculto = preço final da cesta externa - soma dos preços de venda dos produtos consolidados`

O valor oculto pertence à cesta externa/lote comercial, nunca ao kit interno. Pode ser positivo, zero ou negativo; valor negativo é destacado para revisão, sem bloqueio automático.

---

# 8. Consolidação dos kits

Antes de qualquer cálculo ou reserva, achatar os kits em uma composição única por `product_id`.

Exemplo:

- kit Alimentos usa 1 detergente;
- kit Limpeza usa 2 detergentes;
- cesta final usa 3 detergentes.

Para montar 10 cestas: reservar 30 detergentes.

A composição consolidada é usada em custo, venda, capacidade, estoque, reserva, snapshot, impressão e separação.

---

# 9. Reserva e montagem

## Kit interno

Criar/editar kit não mexe em estoque, não cria reserva e não cria lote físico.

## Cesta externa

Ao clicar `Montar` e informar quantidade:

1. resolver os kits da receita;
2. achatar e consolidar produtos;
3. multiplicar pela quantidade;
4. revalidar estoque avulso no servidor;
5. bloquear concorrência atomicamente;
6. se faltar qualquer produto, não criar reserva parcial;
7. se houver estoque, criar lote/reserva;
8. salvar snapshot completo da composição e valores.

O motor de reserva/lote já validado deve ser reutilizado recebendo a composição achatada.

---

# 10. Versionamento e histórico

Cada lote de cesta externa guarda:

- kits usados;
- snapshot das composições dos kits;
- composição final consolidada;
- custos/preços unitários usados;
- preço final;
- valor oculto;
- quantidade montada;
- operador e data.

Editar kit ou receita da cesta depois não altera lotes anteriores. Novas montagens usam a versão atual.

---

# 11. Dados e isolamento arquitetural

Criar uma camada própria de receitas internas, separada do domínio comercial/lote.

Entidades recomendadas:

### `assembly_kits`
- id
- name
- type (`food`, `cleaning_hygiene`, `other`)
- notes
- source_kit_id opcional, somente histórico
- is_active
- created_at / updated_at

### `assembly_kit_items`
- kit_id
- product_id
- quantity
- sort_order

### `assembly_search_chips`
- id
- label
- query
- sort_order
- is_active

### `store_basket_recipes`
- basket/commercial id
- configuração comercial atual

### `store_basket_recipe_kits`
- basket id
- kit id
- sort_order

Os nomes exatos podem variar, mas a separação semântica é obrigatória.

### Reutilizar

- cadastro oficial de produtos;
- visão de estoque avulso/reservado;
- motor canônico de reservas/lotes;
- disponibilidade pública;
- checkout/storefront existentes.

### Não reutilizar como domínio/UI principal

- posições/famílias do editor guiado atual;
- compositores legados;
- vínculo de lote exposto ao usuário;
- múltiplos editores concorrentes.

---

# 12. Atualização rápida de produto

Usar endpoint/RPC administrativo único e transacional.

Regras:

- custo >= 0;
- venda >= 0;
- estoque não pode violar reserva existente;
- auditoria/updated_at;
- resposta retorna total, reservado e avulso recalculados;
- falha não deixa atualização parcial;
- somente perfil autorizado pode alterar.

---

# 13. Migração das 9 cestas atuais

A migração não cria estoque nem duplica reservas.

1. ler composição/snapshot publicado das 9 cestas ativas;
2. separar produtos em `Alimentos` e `Limpeza e Higiene` por regra determinística, com relatório de exceções;
3. gerar kits internos distintos por composição exata;
4. deduplicar kits idênticos;
5. criar receita externa apontando para os kits correspondentes;
6. Econômica permanece apenas com kit de Alimentos;
7. lotes existentes permanecem snapshots históricos, sem nova reserva;
8. novas montagens passam a usar as novas receitas;
9. comparar estoque público/reservado antes e depois: deve ser idêntico.

Antes de aplicar em produção, gerar relatório:

`Cesta atual | Kit Alimentos | Kit Limpeza/Higiene | composição compartilhada | lotes atuais | estoque público/reservado`.

---

# 14. Operação de kits

Permitir criar, editar, duplicar, usar como base e arquivar.

Arquivar não apaga histórico. Se o kit estiver configurado em cesta externa ativa, bloquear até remoção/substituição. Exclusão física não faz parte da operação normal.

---

# 15. Operação de Cestas do Site

Lista mostra:

- foto;
- nome;
- kits componentes;
- preço final;
- valor oculto da configuração atual;
- quantidade pública disponível;
- status de venda;
- número de lotes.

Ações:

- `Editar cesta`;
- `Montar`;
- `Ver lotes`;
- `Imprimir`;
- `Pausar/Ativar venda`.

`Ver lotes` abre a lista real de lotes. Cada lote mostra código, quantidade inicial, disponível, estado, venda e ações específicas. Não abre editor genérico.

---

# 16. Impressão

Imprimir lote usa somente seu snapshot e mostra nome da cesta, código, quantidade montada, produtos consolidados, foto, nome, quantidade por cesta e quantidade total necessária.

Impressão não abre nem altera editor.

---

# 17. Erros e concorrência

Mensagens em português e operacionais, por exemplo:

- `Estoque insuficiente: Óleo precisa de 20 e há 15 disponíveis.`
- `Este kit está sendo usado pela Grande Bonini. Remova ou substitua o kit antes de arquivar.`
- `O estoque mudou enquanto você montava. A tela foi atualizada; revise a quantidade.`

Reserva é atômica: nenhuma falha pode deixar meia cesta reservada.

---

# 18. Performance

- busca paginada/incremental;
- chips não pré-carregam catálogo inteiro;
- Mais usados limitado/paginável;
- kits carregam resumo primeiro, itens sob demanda;
- imagens lazy-load;
- alteração de produto atualiza só o necessário;
- estoque sempre revalidado no servidor antes de reservar.

---

# 19. Testes mínimos

## Criador de Kits

1. criar kit manual;
2. editar quantidades;
3. remover item;
4. produto repetido consolida;
5. custo correto;
6. venda correta;
7. kit não reserva estoque;
8. usar kit como base expande itens;
9. derivado não muda com origem;
10. salvar como novo não altera origem;
11. chips CRUD/reordenação;
12. busca nome/SKU/EAN;
13. edição rápida custo/venda;
14. edição de estoque protege reservado;
15. Mais usados reflete kits ativos.

## Cestas do Site

16. criar cesta com um kit;
17. criar cesta com dois kits;
18. consolidar mesmo produto entre kits;
19. custo consolidado;
20. venda consolidada;
21. valor oculto;
22. capacidade por estoque;
23. falta de estoque bloqueia montagem;
24. reserva atômica;
25. alteração posterior do kit não muda lote antigo;
26. nova montagem usa versão atual;
27. Ver lotes mostra todos;
28. impressão usa snapshot;
29. pausa/retomada não altera composição;
30. migração das 9 cestas não muda estoque/reservas.

## UI/browser

31. desktop em três colunas sem sobreposição;
32. chips com scroll horizontal;
33. coluna Kit com scroll vertical claro;
34. resumo sempre acessível;
35. tablet funcional;
36. celular sem overflow horizontal;
37. nenhum seletor/ação do editor legado retorna ao fluxo.

---

# 20. Estratégia de implantação

1. criar camada de receitas e RPCs sem mudar storefront;
2. implementar Criador de Kits com TDD;
3. gerar relatório das 9 cestas atuais;
4. revisar migração sem tocar estoque;
5. implementar Cestas do Site;
6. integrar com motor de reserva validado;
7. migrar configurações das 9 cestas;
8. validar equivalência pública e de estoque;
9. trocar UI para as duas novas abas;
10. aposentar componentes anteriores somente após validação.

Rollback: manter dados antigos até validar a nova leitura; reverter a fonte de configuração não pode exigir reconstrução de estoque.

---

# 21. Critérios de aceite

A solução é aceita quando:

- operador cria kit sem compreender modelo/lote/família/posição;
- kit pode ser criado do zero ou a partir de outro kit expandido;
- kit tem tipo simples para organização;
- editar kit não altera estoque;
- custo/venda/estoque de produto podem ser ajustados no Criador;
- cesta externa só usa kits internos;
- quantidade de montagem é separada da receita;
- preço final e valor oculto ficam claros;
- estoque só é reservado ao montar quantidade real;
- lotes anteriores preservam histórico;
- as 9 cestas atuais continuam disponíveis no site após migração;
- migração não cria, perde nem duplica estoque/reserva;
- UI antiga deixa de ser fluxo operacional.
