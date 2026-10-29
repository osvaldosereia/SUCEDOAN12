# Catálogo Dona Antônia

O catálogo público fica em `/site/`; o painel administrativo fica em `/site/admin/`. A interface usa HTML, CSS e JavaScript nativos.

## Loja

- `site/app.js` coordena a vitrine. As áreas de extras, cesta e checkout ficam separadas em `site/storefront/extras.js`, `basket.js` e `checkout.js`.
- A vitrine carrega fotos sob demanda e consulta o preço, a composição e a disponibilidade quando a pessoa abre uma cesta.
- O pedido é criado no servidor por `storefront-v2`; o acesso privilegiado ao Supabase não é enviado ao navegador.
- Os novos pedidos usam um único código curto no formato duas letras e três números. O mesmo código aparece no pedido, no admin e na lista pública. Os códigos históricos não são regravados.

## Administração

- O painel usa um único código de acesso, sem login de usuário e senha. O valor fica em memória apenas durante a sessão do navegador.
- Configure um código de acesso forte de 13 a 128 caracteres com o nome `DONA_ADMIN_CODE` nas Edge Functions do Supabase. Não coloque o valor no HTML, JavaScript, configuração pública ou GitHub.
- Em **Clientes**, é possível buscar por telefone ou CPF/CNPJ e editar nome, CPF/CNPJ e endereço. Telefone permanece somente para consulta. A gravação é feita no servidor, valida se outro operador atualizou o cadastro e registra uma linha no histórico administrativo.
- **Cestas** e **Produtos** mantêm os fluxos de edição do painel; cadastros são desativados em vez de apagados.
- Em **WhatsApp**, **Pedido recebido** controla a mensagem enviada na criação do pedido; **Após a separação** controla outro envio. Salvar rascunho não envia nada à Meta. Envie a versão para análise e ative-a por número depois da aprovação; o modelo atual continua enviando até essa ativação.

## Publicação

A mudança de banco fica em `supabase/migrations/20261028050000_site_customer_edit_and_order_codes_v1.sql`. A migração precisa ser aplicada antes de publicar as funções que a utilizam. Configure `DONA_ADMIN_CODE` antes de publicar as funções administrativas.
