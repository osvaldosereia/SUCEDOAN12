# Atendimento — Montador de pedidos Dona Antônia

Projeto novo e isolado. Não reutiliza o fluxo antigo do site, Firebase ou cenários antigos do Make.

## Objetivo do MVP

Criar uma página mobile simples para o cliente que veio do WhatsApp:

1. abrir uma cesta padrão pelo link do carrossel oficial da Meta;
2. aumentar, diminuir ou zerar itens da cesta;
3. acrescentar produtos/ofertas por categoria;
4. calcular o valor no navegador;
5. gerar uma única mensagem pronta com lista, quantidades, total e código do carrinho;
6. abrir o WhatsApp para o próprio cliente tocar em **Enviar**.

## URLs previstas

- `/atendimento/?cesta=economica`
- `/atendimento/?cesta=familia`
- `/atendimento/?cesta=completa`

Essas URLs poderão ser usadas nos botões dos templates/carrosséis do PapoAI/WhatsApp.

## Estado atual

O catálogo em `data/catalogo.json` é **somente demonstrativo** para validar a experiência. Os preços e SKUs desse arquivo não devem ser tratados como dados oficiais de venda.

O carrinho usa `localStorage` no MVP. Nenhum dado pessoal do cliente é armazenado.

## Arquitetura definida

- **PapoAI:** conversa, IA, CRM, funil, templates e automações do WhatsApp.
- **Bling:** fonte oficial de produtos, preços, estoque, clientes e pedidos.
- **Site /atendimento:** editor visual da cesta e adicionais.
- **GitHub Actions:** futura sincronização segura Bling → catálogo público sanitizado do montador.
- **Make:** futura operação em tempo real para localizar/cadastrar cliente no Bling e criar o pedido confirmado.
- **Firebase:** não faz parte deste projeto novo.

## Segurança

Nunca colocar `client_secret`, access token, refresh token ou qualquer credencial Bling/PapoAI dentro de `app.js` ou `catalogo.json`. O navegador nunca deve chamar a API autenticada do Bling diretamente.

## Próxima camada

1. substituir o catálogo demo por sincronização real do Bling;
2. definir composição real das cestas e regra de substituição/preço;
3. usar código/SKU real do Bling;
4. integrar fechamento confirmado ao Make/Bling;
5. depois adicionar fotos e melhorias de UX.
