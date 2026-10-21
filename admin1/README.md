# Admin1 do catálogo Dona Antônia

Painel de consulta conectado somente à ação GET `products` da função pública `storefront-v2` do projeto Supabase ativo. A API retorna apenas itens publicados e disponíveis, com seus campos públicos (imagem, categoria, preço, estoque, SKU e EAN).

A camada `src/public-api.js` permite somente o método HTTP GET e a ação `products`. As operações de cadastro, edição, exclusão, integração e sincronização não são incluídas. Nenhuma chave secreta, sessão administrativa ou endpoint de escrita é usado.

Cestas permanecem desabilitadas neste incremento porque a listagem pública atual pode atualizar um snapshot interno no banco.
