# Categorias e subdivisões configuráveis da vitrine — plano de implementação

> **Para agentes:** usar `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para implementar tarefa por tarefa. As etapas usam `- [ ]`.

**Objetivo:** Permitir que o admin mantenha categorias e subdivisões para cestas e kits, e exibir a vitrine agrupada por esses dados com cards responsivos em 3 colunas móveis e 6 desktop.

**Arquitetura:** Adicionar `basket_subcategories` com FK para `basket_categories`, e FKs de subdivisão nos modelos comerciais de cestas e kits. As Edge Functions administrativas autenticadas mantêm cadastros e vínculos; a função pública entrega os agrupamentos ativos ordenados. A página renderiza os dados recebidos sem regras baseadas em rótulos, slugs ou nomes.

**Stack:** PostgreSQL/Supabase, Edge Functions Deno/TypeScript, JavaScript de navegador e CSS responsivo.

**Especificação:** `docs/superpowers/specs/2026-10-06-vitrine-categorias-subcategorias-design.md`

## Restrições globais

- Não inferir classificação nem comportamento a partir do nome ou slug de categoria, subdivisão, cesta ou kit.
- Categoria, subdivisão, ordem, estado ativo e número de composições devem ser configuráveis no admin.
- Criar inicialmente as categorias Cestas Completas e Cestas Só Alimentos ativas, com Grande, Média, Pequena e Mini em cada uma; demais categorias existentes e novos cadastros começam inativos.
- Os moldes iniciais das categorias ativas começam com três composições; a quantidade continua configurável de 1 a 4 por molde.
- Cestas e kits sem classificação completa continuam administráveis e não aparecem agrupados na vitrine.
- Novas tabelas expostas no schema public devem ter RLS e acesso de escrita somente por fluxo administrativo autenticado.
- Não alterar o cálculo comercial, composição de produtos, pedidos, estoque ou reservas.
- Usar `supabase migration new` para gerar o arquivo de migration; manter o espelho SQL conforme o padrão existente do projeto.
- Não adicionar nem executar testes automatizados nesta implementação, salvo solicitação do usuário; deixar os checks automáticos já configurados do repositório rodarem no PR.

## Revisão de riscos

- Subdivisão associada a uma categoria diferente: a API e o banco devem rejeitar o vínculo inválido.
- Alteração de nome: IDs estáveis devem preservar associação e ordem.
- Exclusão de cadastro utilizado: bloquear e retornar os itens vinculados.
- Mudança de categoria no editor: limpar a subdivisão selecionada se ela não pertencer à nova categoria.
- Categoria ou subdivisão inativa: não exibir os cards publicamente; manter dados e opções no admin.
- Falta de classificação: manter o item disponível no admin e fora dos grupos públicos.

---

### Tarefa 1: Persistência e funções transacionais

**Arquivos:**
- Criar: migration gerada por `supabase migration new basket_category_subcategories_v1` em `supabase/migrations/`
- Criar: `supabase/sql/20261006_basket_category_subcategories_v1.sql`
- Atualizar: definições das RPCs de molde e modelo comercial na migration nova

**Interfaces:**
- Produzir `public.basket_subcategories(id, category_id, name, slug, sort_order, is_active, created_at, updated_at)`.
- Produzir `basket_templates.subcategory_id` e `basket_kit_templates.subcategory_id`, ambos FK para `basket_subcategories`.
- Atualizar `admin_save_basket_mold_v1` e `save_basket_commercial_model_v2` para validar e persistir IDs de categoria/subdivisão.
- Listar IDs, nomes, estado e ordem das categorias/subcategorias nas RPCs administrativas de molde.

- [ ] Gerar a migration pelo Supabase CLI e criar o espelho SQL seguindo o formato já usado pelo domínio de cestas.
- [ ] Criar tabela, FKs, índices, RLS e grants; impedir exclusões com itens associados.
- [ ] Inserir as oito subdivisões iniciais e ajustar estados para deixar somente as duas categorias solicitadas ativas.
- [ ] Definir três composições iniciais nos moldes atualmente associados às categorias iniciais, preservando o campo configurável para cada molde.
- [ ] Atualizar RPCs para validar que a subdivisão pertence à categoria selecionada, sem consultar rótulos.
- [ ] Revisar a migration completa e o diff de segurança antes de seguir.\n- [ ] Aplicar a migration aprovada ao projeto Supabase e conferir as colunas, FKs, políticas e registros iniciais antes de publicar as funções.

### Tarefa 2: API administrativa para categorias e subdivisões

**Arquivos:**
- Atualizar: `supabase/functions/admin-products-live-v1/index.ts`
- Atualizar: `supabase/functions/admin-basket-molds-v1/index.ts`
- Atualizar: `supabase/functions/admin-basket-guided-v1/index.ts`

**Interfaces:**
- Adicionar listagem, criação, edição, ordenação, ativação/desativação e exclusão segura de subdivisões.
- Estender as respostas administrativas para incluir `subcategory_id` e os registros de subdivisão disponíveis.
- Exigir vínculo válido entre categoria e subdivisão nas gravações de molde e modelo comercial/kit.

- [ ] Estender `basket_categories_admin` para devolver subdivisões e contagens de cestas e kits associados.
- [ ] Adicionar ações autenticadas `basket_subcategory_save` e `basket_subcategory_delete`; validar nome, categoria, duplicidade e uso antes de excluir.
- [ ] Estender as gravações administrativas existentes para salvar categoria e subdivisão em cestas e kits.
- [ ] Atualizar respostas de lista e detalhe sem alterar permissões, cálculo de preço, estoque ou pedidos.
- [ ] Inspecionar as rotas e respostas para confirmar compatibilidade com moldes e modelos comerciais existentes.

### Tarefa 3: Gestão e seleção no admin

**Arquivos:**
- Criar: `vitrine/admin/basket-category-admin.js`
- Atualizar: `vitrine/admin/basket-admin-section.js`
- Atualizar: `vitrine/admin/basket-mold-admin.js`
- Atualizar: `vitrine/admin/basket-guided-builder.js`

**Interfaces:**
- A nova área recebe e salva dados pelas ações administrativas da Tarefa 2.
- Os editores de molde e modelo comercial enviam `category_id` e `subcategory_id`; a seleção de subdivisão depende da categoria atual.

- [ ] Adicionar uma aba “Categorias e subdivisões” ao fluxo existente de Cestas.
- [ ] Criar telas para cadastrar, editar, reordenar, ativar/desativar e excluir cadastros sem uso, mostrando contagem dos itens vinculados.
- [ ] Adicionar seletores dependentes de categoria e subdivisão aos editores de cestas e kits comerciais.
- [ ] Manter a quantidade de composições de cada molde editável e iniciar os moldes selecionados com 3.
- [ ] Revisar a experiência de cadastro, mudança de categoria, edição de nome e exclusão bloqueada no admin.

### Tarefa 4: Agrupamento público e grade responsiva

**Arquivos:**
- Atualizar: `supabase/functions/storefront-v2/index.ts`
- Atualizar: `index.html`
- Atualizar: `vitrine/index.html`

**Interfaces:**
- A função pública devolve `category_id/name/sort_order` e `subcategory_id/name/sort_order` para cada card elegível.
- A página agrupa por IDs e ordenação recebidos; os nomes só são rótulos.
- Layout final: 3 colunas no celular, 4 em telas médias e 6 no desktop.

- [ ] Incluir as relações de categoria/subdivisão na leitura pública de cestas e moldes e filtrar itens sem vínculo completo ou em grupos inativos.
- [ ] Substituir os grupos e subdivisões fixos no HTML por agrupamento dinâmico baseado na resposta da API.
- [ ] Dimensionar foto, nome, preço e botão para caberem nas três colunas móveis e seis colunas desktop.
- [ ] Atualizar o cache-buster do recurso público se a mudança alterar um arquivo JavaScript compartilhado.
- [ ] Publicar as Edge Functions administrativas e públicas depois da migration.\n- [ ] Conferir visualmente a vitrine nos breakpoints móvel, intermediário e desktop, e observar os checks automáticos existentes no PR.

## Escopo desta rodada

Inclui as duas categorias e oito subdivisões iniciais, seus controles administrativos, associação individual das cestas/kits e o agrupamento responsivo público. A criação e ativação de cadastros adicionais será feita pelo admin depois do lançamento, sem código ou deploy novo.
