# Admin do Atendimento Dona Antônia

Painel criado para gerir o site de apoio ao atendimento do WhatsApp/PapoAI.

## Objetivo

O admin não substitui o PapoAI nem o Bling. Ele administra apenas o que pertence ao **site montador** e prepara os links/dados necessários para as integrações.

### O que o painel já gerencia

- textos do site de apoio;
- número e texto do botão de retorno ao WhatsApp;
- composição visual das cestas;
- produtos extras/ofertas e categorias;
- links prontos por cesta para botões de carrossel/template no PapoAI;
- links por categoria para levar o cliente diretamente às ofertas;
- regras de arquitetura Bling/PapoAI/Make;
- validação do catálogo;
- rascunho local;
- pré-visualização sem publicar;
- exportação de `catalogo.json`, `site-config.json` ou pacote completo.

## Segurança

Este repositório é público. Por isso:

- não colocar token do Bling no JavaScript;
- não colocar API Key do PapoAI no JavaScript;
- não colocar PAT do GitHub no JavaScript;
- não colocar dados reais de clientes no repositório;
- o admin atual não grava diretamente no GitHub.

A publicação automática deverá ser adicionada somente por um backend autenticado ou outra camada server-side.

## Relações com os sistemas

### Bling

Fonte oficial para produtos, SKU, preço, estoque, contatos/clientes e pedidos. O catálogo do site deverá ser uma cópia sincronizada, e preço/estoque devem ser revalidados no fechamento.

### PapoAI

Canal de conversa, IA, CRM, funil, templates oficiais da Meta, WhatsApp Flow e automações. O admin gera os links que serão usados em carrosséis e mantém o site preparado para receber a pessoa de volta do WhatsApp.

### Make

Deve ser usado somente nas operações em tempo real que realmente precisem da API do Bling, principalmente no fechamento do pedido: CPF → contato → validação → pedido de venda.

## Endereços

- Site: `https://donaantonia.com.br/atendimento/`
- Admin: `https://donaantonia.com.br/atendimento/admin/`

## Estado atual

O catálogo ainda está com dados demonstrativos (`source: demo-local`). A próxima camada é a sincronização real do Bling e depois um backend seguro de publicação do admin.
