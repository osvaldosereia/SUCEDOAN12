# Reformulação da sessão Cestas — design

**Objetivo:** organizar a sessão Cestas do Vitrine Admin em três abas editáveis e manter as mudanças coerentes com o carrossel público atual.

## Intenção e limites

A equipe precisa cadastrar tipos de cesta, definir a quantidade de cada tipo de produto em cada cesta e selecionar/ordenar os produtos que aparecem nas opções do site. A navegação terá somente “Tipos de cestas”, “Tipos e quantidades” e “Produtos do carrossel”.

A implementação preservará os 15 modelos comerciais, os 9 moldes, os 29 grupos atuais e os históricos. Os nomes Doação e Família serão cadastrados como tipos administrativos sem publicação comercial automática, pois ainda não existem modelos comerciais vinculados. Os cinco tipos atualmente ativos serão vinculados aos seus modelos ativos. Valores não serão alterados sem ação explícita de edição.

## Solução escolhida

Adicionar tabelas administrativas normalizadas para tipos de cesta, tipos de produto, quantidades e opções de produto. Isso evita sobrecarregar nomes de moldes ou rótulos livres para expressar relações que precisam ser editáveis. A migração inicial fará cópia conservadora dos nomes, quantidades e produtos atuais, sem apagar registros existentes; o vínculo com os moldes atuais permitirá propagar edições para o site.

A interface será dividida por responsabilidade: shell de abas, domínio/validação, acesso à API e um módulo por aba. O gateway usará o JWT administrativo atual e funções Postgres que validam o papel do usuário. A vitrine continuará usando o estoque e as verificações atuais; a ordem configurada será respeitada ao oferecer alternativas.

## Requisitos funcionais

- Tipos iniciais: Doação, Econômica, Mini, Pequena, Média, Grande e Família; permitir criar, renomear, ordenar e desativar tipos.
- Tipos iniciais de produto, agrupados em Alimentos, Limpeza e Higiene conforme o pedido do usuário; permitir criar, editar, ordenar e desativar tipos.
- Matriz editável de quantidades, com uma coluna para cada tipo de cesta e zero como quantidade válida.
- Busca e seleção sem limite artificial de produtos por tipo; guardar a ordem manual e exibir destaque 1º, 2º e 3º.
- Novos tipos sem modelo comercial não serão publicados nem ativados no site por padrão.
- Mudanças para tipos vinculados atualizam as quantidades e alternativas das posições existentes sem ignorar estoque, validade ou elegibilidade de produto do site.
- Remover da navegação as telas antigas substituídas. Preservar código e recursos ainda usados por outros fluxos; não apagar operações de lotes, extras ou taxonomia sem prova de que deixaram de ter consumidores.

## Segurança e compatibilidade

As tabelas administrativas terão RLS ativada e acesso direto revogado; somente RPCs administrativas autorizadas poderão ler ou gravar. A migração será aditiva, transacional e idempotente. Não alterar produção, dados de estoque, preços, pedidos ou Bling durante a implementação. O site continuará recebendo apenas modelos comerciais ativos e já elegíveis.

## Fora do escopo

Criar e publicar modelos comerciais Doação/Família, alterar preços/estoque, remover histórico ou reformular checkout e pedidos.

## Abordagens consideradas

1. Reaproveitar rótulos de moldes como taxonomia: menor custo inicial, mas mistura nomes exibidos, quantidades e opções e não comporta tipos de cesta ainda sem molde.
2. Substituir as tabelas de cesta existentes: modelo simples, porém arriscaria dados ativos e compatibilidade do site.
3. **Adicionar um catálogo administrativo normalizado e adaptadores para os moldes atuais (escolhida):** mais explícita, editável e compatível; exige uma migração e uma sincronização cuidadosa dos registros ligados.
