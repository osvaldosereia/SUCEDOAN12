# Temas compartilhados de extras de cestas — Plano de implementação

> Execução inline desta implementação, com testes focados em cada integração.

**Objetivo:** Administrar temas e produtos extras globais para todas as cestas e permitir abrir seus carrosséis na vitrine.

**Arquitetura:** Persistir temas e produtos em tabelas relacionais com ordenação explícita e RLS. O admin usa RPCs autenticadas para ler/salvar a configuração completa; a vitrine consulta os temas com credencial de serviço e filtra por atividade e estoque antes de exibir. O cliente abre cada carrossel sob demanda e adiciona produtos ao carrinho sem mudar o preço da cesta.

**Stack:** Supabase Postgres/RPC, Edge Functions Deno, JavaScript da Vitrine Dona Antônia.

**Especificação:** `docs/superpowers/specs/2026-10-19-shared-basket-extra-themes.md`

## Restrições
- Um tema é global, não associado a uma cesta.
- A ordem salva no admin define a ordem na vitrine.
- Não limitar a quantidade de temas ou produtos por tema.
- Os extras são adicionados ao carrinho separadamente.
- Manter o formato legado de extras legível até a remoção segura de dados antigos.

## Arquivos
- Criar migração `20261020004000_shared_basket_extra_themes_v1.sql` para tabelas, RLS e RPCs.
- Alterar `admin-basket-molds-v1/index.ts` para validar e encaminhar ações do editor.
- Substituir `basket-mold-extras-admin.js` por editor global com busca, CRUD e setas de ordenação.
- Alterar `storefront-v2/index.ts` para devolver extras compartilhados em cestas comuns e moldes.
- Alterar `vitrine/index.html` para temas recolhidos e carrosséis horizontais sob demanda.
- Atualizar `test-basket-personalization-v1.mjs` e adicionar `test-shared-basket-extra-themes-v1.mjs`.

## Tarefas
1. Criar os testes de aceitação e confirmar que falham sem as tabelas, ações, editor e carrosséis.
2. Implementar migração e RPCs com validação de administrador, IDs de produto, duplicidade e ordem.
3. Integrar as ações do admin e editor; permitir buscar e selecionar sem limites fixos na lista salva.
4. Servir extras globais para cestas molde e antigas, filtrando produto ativo e saldo disponível.
5. Implementar tema recolhido, botão “Ver produtos”, carrossel horizontal e ação “Adicionar”.
6. Rodar testes estáticos/funcionais, verificar sintaxe do JavaScript e aplicar migração e Edge Functions.

## Revisão final
- RLS não dá acesso direto aos usuários públicos ou autenticados às tabelas.
- RPC de escrita valida papel de admin e mantém gravações atômicas.
- Temas sem produtos disponíveis não aparecem publicamente.
- Mudanças de temas não alteram composição nem preço-base da cesta.
- Testes anteriores de personalização e novos testes de extras passam.
