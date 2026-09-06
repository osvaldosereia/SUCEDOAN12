# Atendimento — Montador de pedidos Dona Antônia

Projeto novo e isolado. Não reutiliza o fluxo antigo do site, Firebase ou cenários antigos do Make.

## Objetivo

Criar uma página mobile simples para o cliente que veio do WhatsApp:

1. abrir uma cesta padrão pelo link do carrossel oficial da Meta;
2. aumentar, diminuir ou zerar itens da cesta;
3. acrescentar produtos/ofertas por categoria;
4. calcular o valor no navegador;
5. gerar uma única mensagem pronta com lista, quantidades, total e código do carrinho;
6. abrir o WhatsApp para o próprio cliente tocar em **Enviar**.

## URLs

- Site: `https://donaantonia.com.br/atendimento/`
- Admin: `https://donaantonia.com.br/atendimento/admin/`
- Cesta: `/atendimento/?cesta=economica`
- Cesta: `/atendimento/?cesta=familia`
- Oferta/categoria: `/atendimento/?cesta=economica&secao=ofertas&categoria=Bebidas`

Essas URLs são próprias para uso nos botões dos templates/carrosséis do PapoAI/WhatsApp.

## Admin

O painel em `admin/` já oferece:

- dashboard;
- edição dos textos do site;
- edição do WhatsApp e prévia da mensagem;
- cadastro e edição de cestas;
- composição das cestas por SKU;
- produtos extras/ofertas por categoria;
- gerador de links para carrosséis do PapoAI;
- mapa Bling/PapoAI/Make;
- validação;
- rascunho em `localStorage`;
- pré-visualização sem publicação;
- exportação dos JSONs.

A escrita automática no GitHub ainda não foi ligada de propósito: como o repositório é público, isso só deve ser feito depois com backend autenticado.

## Estado atual

O catálogo em `data/catalogo.json` é **somente demonstrativo** para validar a experiência. Os preços e SKUs desse arquivo não devem ser tratados como dados oficiais de venda.

O carrinho usa `localStorage` no MVP. Nenhum dado pessoal do cliente é armazenado.

## Arquitetura definida

- **PapoAI:** conversa, IA, CRM, funil, templates, WhatsApp Flow e automações.
- **Bling:** fonte oficial de produtos, preços, estoque, clientes e pedidos.
- **Site `/atendimento`:** editor visual da cesta e adicionais.
- **Admin `/atendimento/admin`:** gestão do site montador e geração dos links do PapoAI.
- **GitHub Actions/camada server-side:** futura sincronização segura Bling → catálogo público sanitizado.
- **Make:** futura operação em tempo real para localizar/cadastrar cliente no Bling e criar o pedido confirmado.
- **Firebase:** não faz parte deste projeto novo.

## Segurança

Nunca colocar `client_secret`, access token, refresh token ou qualquer credencial Bling/PapoAI dentro do frontend, `app.js`, admin ou `catalogo.json`. O navegador nunca deve chamar a API autenticada do Bling diretamente.

## Documentação

- `RETOMADA.md`
- `admin/README.md`
- `docs/ARQUITETURA-ATENDIMENTO.md`

## Próxima camada

1. substituir o catálogo demo por sincronização real do Bling;
2. definir composição real das cestas e regra de substituição/preço;
3. sincronizar a cópia de produtos necessária ao PapoAI;
4. integrar fechamento confirmado ao Make/Bling;
5. ligar publicação autenticada do admin;
6. depois adicionar fotos e melhorias de UX.
