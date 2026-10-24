# Matriz de acesso — V2 (R03)

A autorização é avaliada pelo banco com `da_next.has_permission()` e policies RLS. O frontend pode ocultar ações conforme `src/application/authorization.ts`, mas isso é conveniência visual; não substitui a policy.

| Papel | Leitura | Escrita autorizada nesta etapa | Dados restritos |
|---|---|---|---|
| ADMIN | Catálogo, operação, clientes, conversas, auditoria e dados privados | Catálogo, composição de cestas, preços internos e atribuição/revogação de papéis | Escrita transacional de pedidos, mensagens e fiscal continua apenas no servidor |
| PRODUCTS | Catálogo, composição e movimentos de estoque | Campos comerciais de produtos; tipos, vínculos e composição de cestas | Sem pedidos, clientes, perfil fiscal, custos ou ajuste interno; sem alteração direta de saldo |
| SEPARATION | Pedidos, itens, snapshots operacionais, clientes/endereço e movimentos de estoque | Nenhuma escrita direta de pedido nesta rodada; a transição segura depende do serviço transacional de pedidos | Sem catálogo editável, valores internos, fiscal ou conversas |
| SUPPORT | Pedidos e clientes necessários ao atendimento; conversas e mensagens | Nenhuma mensagem ou mudança de pedido enviada diretamente nesta rodada | Sem catálogo, estoque editável, fiscal ou dados internos |
| Anônimo / sem papel ativo | Nada em `da_next` | Nada | Schema privado e sem grants/policies para `anon`; conta Auth sem papel ativo também vê zero linhas |

## Regras de implementação

- O cadastro de papel referencia `auth.users`, permite um papel ativo por usuário e preserva revogações no histórico. Não existe cadastro público.
- Papéis são consultados no banco, não em `user_metadata` nem em dados editáveis pelo usuário. A alteração de papel revoga o acesso nas próximas consultas de imediato.
- O primeiro administrador exige bootstrap operacional controlado em um projeto V2 isolado. Nenhum usuário ou segredo inicial foi criado ou versionado.
- Campos privados de preço foram movidos de `basket_sizes` e `order_basket_snapshots` para tabelas próprias. Assim, uma consulta legítima de catálogo ou pedido não retorna esses campos junto com os dados permitidos.
- O papel PRODUCTS não pode atualizar `products.stock_units`; estoque requer o serviço de movimentação/idempotência a ser implementado em rodada posterior.
- Policies de UPDATE incluem `USING` e `WITH CHECK`. Grants de coluna restringem o que pode mudar mesmo para um papel que veja a linha.
- `da_next` continua fora das schemas expostas pelo Data API. `authenticated` tem `USAGE` e grants explícitos para as consultas autorizadas; `anon` não tem acesso. Expor schema no Data API exigirá uma decisão posterior e nova revisão.
- `service_role` é somente backend e nunca pode ser embutida no cliente. RLS não torna seguro compartilhar uma chave privilegiada.

## Limite desta rodada

O PostgreSQL descartável confirma grants, políticas, papéis, revogação, isolamento de valores privados e casos negativos/positivos. Não prova o login gerenciado pelo Supabase, emissão/refresh de JWT, recuperação de senha, MFA, configuração de schema exposto ou cookies. Não existe projeto Supabase V2 de homologação configurado; a tela/adapter de login real permanece desconectada.
