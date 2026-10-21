# Admin do catálogo Dona Antônia

Painel independente para administrar produtos e modelos de cestas do site. A primeira versão usa os gateways administrativos existentes do projeto canônico, sem acesso direto ao banco pelo navegador.

## Estrutura

- `index.html`: ponto de entrada estático publicado em `/catalogo-admin/`.
- `src/auth.js`: reaproveita a sessão administrativa do domínio e valida expiração localmente.
- `src/api.js`: concentra chamadas autenticadas às Edge Functions de administração.
- `src/app.js`: estado e telas de produtos, cestas e conexão Bling.
- `styles.css`: interface responsiva, separada da operação do Vitrine Admin.

## Limites da primeira entrega

- Produtos: busca, consulta, cadastro e edição pelo gateway `admin-products-live-v1`.
- Cestas: preço, nome, imagem, ativação e itens da composição pelo mesmo gateway.
- Bling: consulta do estado da integração. Importação e publicação automáticas ficam para a próxima etapa, com regras explícitas para nome, categoria, preço, estoque e ativação.
- Nenhuma chave secreta fica no navegador; o acesso a dados e mutações é autorizado pelas Edge Functions e pelo cadastro `admin_users`.

## Abrir localmente

Sirva a raiz do repositório em um servidor HTTP e acesse `/catalogo-admin/`. A autenticação e as chamadas administrativas dependem do domínio autorizado pelo Supabase.
