# Arquitetura do Atendimento Dona Antônia

Atualizado em 06/09/2026.

## Decisão

Construir um site de apoio pequeno e rápido, administrado por `/atendimento/admin`, sem recriar CRM, chatbot ou ERP.

Fluxo:

`PapoAI/WhatsApp → carrossel/template → site montador → cliente personaliza/adiciona → botão WhatsApp → cliente envia a lista → PapoAI continua → confirmação → Make → Bling`

## Pesquisa Bling — documentação oficial atual

Referências:

- API e OAuth 2.0: https://developer.bling.com.br/bling-api
- Webhooks: https://developer.bling.com.br/webhooks
- Produtos: https://ajuda.bling.com.br/hc/pt-br/articles/360036756914-Como-cadastrar-produtos
- Produtos com composição/kit: https://ajuda.bling.com.br/hc/pt-br/articles/360035495774-Cadastrar-produtos-com-composi%C3%A7%C3%A3o-kit
- Pedidos de venda: https://ajuda.bling.com.br/hc/pt-br/articles/360036358474-Inserir-um-pedido-de-venda

### Conclusões para o projeto

1. O Bling possui API REST com OAuth 2.0 e deve ser acessado apenas por servidor/automação segura.
2. Produto possui SKU e preço, e o Bling deve continuar como fonte oficial de cadastro.
3. Cestas podem se relacionar com produtos `Com Composição`, cujos componentes precisam existir previamente.
4. O Bling permite webhooks para `order`, `product`, `stock`, `virtual_stock`, `invoice` e outros recursos, úteis futuramente para atualização reativa.
5. No fechamento, o pedido de venda deve usar o contato correto e os produtos oficiais.
6. O site não deve controlar estoque de forma independente; deve exibir cópia sincronizada e revalidar antes do pedido oficial.

## Pesquisa PapoAI — canais oficiais públicos

Referências:

- Automações: https://papoai.com.br/blog/automacao-whatsapp-fluxos
- CRM para WhatsApp: https://papoai.com.br/blog/crm-para-whatsapp
- Atendimento automatizado: https://papoai.com.br/blog/atendimento-automatizado-whatsapp
- API oficial do WhatsApp: https://papoai.com.br/blog/whatsapp-business-api-guia-completo
- Templates/campanhas e opt-in: https://papoai.com.br/blog/disparo-em-massa-whatsapp
- Funil: https://papoai.com.br/blog/funil-de-vendas-whatsapp

### Conclusões para o projeto

1. O PapoAI deve ser o canal principal de atendimento e CRM, evitando duplicar essas funções no nosso admin.
2. A própria documentação pública do PapoAI recomenda automações para boas-vindas, qualificação, confirmação de pedido, pós-venda, recuperação e transferência humana.
3. O PapoAI trabalha sobre a API oficial da Meta e usa templates aprovados quando necessário.
4. Pelas telas da conta da Dona Antônia já verificadas no projeto, o PapoAI também possui: automações configuráveis, template/resposta rápida, WhatsApp Flow, tags, Kanban, webhook, transferência, gestão de produtos com busca inteligente e API de produtos. Como esses detalhes internos não estão todos descritos publicamente, a integração deve respeitar exatamente o que o painel da conta expuser.
5. O admin do nosso site deve gerar links prontos para os botões dos carrosséis/templates, mas não deve recriar o editor de templates, CRM ou funil do PapoAI.

## Divisão definitiva de responsabilidades

| Função | Sistema |
| --- | --- |
| conversa e IA | PapoAI |
| WhatsApp oficial / templates / Flow | PapoAI |
| CRM / funil / automações / handoff | PapoAI |
| personalização visual da cesta | site `/atendimento` |
| configuração do site montador | admin `/atendimento/admin` |
| produtos, SKU, preço, estoque | Bling |
| composição de kits/cestas | Bling + regras de apresentação do site |
| contato fiscal / cliente | Bling |
| pedido oficial | Bling |
| integração em tempo real no fechamento | Make |
| sincronizações periódicas | GitHub Actions ou camada server-side segura |

## Dados que o admin NÃO deve armazenar

- CPF de cliente;
- endereço de cliente;
- histórico de conversas;
- token OAuth do Bling;
- API Key do PapoAI;
- token/PAT do GitHub;
- credenciais Meta.

## Evolução planejada

### Fase 1 — concluída nesta rodada

- admin visual;
- cestas;
- ofertas/categorias;
- textos do site;
- mensagem de retorno ao WhatsApp;
- links PapoAI por cesta/categoria;
- preview local;
- validação;
- exportação segura.

### Fase 2

Sincronização Bling → catálogo do site, incluindo SKU, nome, preço, estoque e composição necessária.

### Fase 3

Sincronização Bling → catálogo de produtos do PapoAI, mantendo o Bling como origem.

### Fase 4

Novo cenário Make mínimo para fechamento: receber pedido confirmado → validar CPF/contato → validar itens → criar pedido de venda → retornar número.

### Fase 5

Backend autenticado para o admin publicar alterações sem expor credenciais no navegador.
