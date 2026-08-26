# Caneca 10

Site mobile e independente do Criador de Canecas do Produção.

## Abas

### Gerador interno — `index.html`

Fluxo operacional para criar canecas a partir de imagem, comandos salvos e instrução complementar. Usa o mesmo webhook Make do Produção, gera a arte horizontal, três mockups e cadastra o produto como inativo.

### Personalize a sua — `personalizar.html`

Versão de teste voltada ao cliente final.

1. O cliente escolhe um dos modelos marcados no Produção em `canecas/modelos_criacao`.
2. Envia uma foto pela câmera ou galeria.
3. Digita uma frase opcional.
4. Informa nome e WhatsApp e autoriza o envio do link dessa criação.
5. A aplicação combina o modelo visual com a foto e envia ao mesmo cenário Make de canecas.
6. São geradas quatro imagens: arte horizontal + três mockups.
7. A caneca é cadastrada em `/produtos/{id}` como inativa, `tipo_produto: caneca_personalizada` e `origem_cadastro: ceneca10_cliente_teste`.
8. A criação pública sem telefone é salva em `canecas/personalizadas_publicas/{id}`.
9. Os dados operacionais da solicitação são salvos em `canecas/personalizadas/{id}`.
10. É criada uma fila em `canecas/whatsapp_fila/{id}` e o site tenta chamar a ação Make `send_mug_customer_whatsapp`.
11. Se o envio automático ainda não estiver configurado no Make, a criação não trava: o cliente recebe um botão para abrir o próprio WhatsApp com o link pronto.
12. O botão de encomenda abre o WhatsApp oficial da Dona Antônia: `(65) 99815-0975`.

## Página pública de resultado

`resultado.html?id=<id-da-criacao>` mostra somente:

- arte horizontal;
- três mockups;
- modelo escolhido;
- frase;
- botão para encomendar pelo WhatsApp oficial.

O telefone do cliente não é exibido nessa página pública.

## Configuração do teste

A aba de personalização reaproveita `da_admin_v2_mug_make_webhook`. Para testar em outros celulares, abra:

`personalizar.html?admin=1`

A engrenagem permite salvar o webhook localmente e, opcionalmente, publicá-lo temporariamente em `canecas/config_publica/make_webhook` para os clientes da página de teste.

**Importante:** a publicação do webhook no Firebase é apenas para esta fase de teste. Antes de levar o recurso ao site principal, o ideal é trocar por um endpoint/proxy protegido para evitar exposição e abuso do webhook do Make.

## WhatsApp automático

O front-end já grava a fila e tenta a ação `send_mug_customer_whatsapp`. Para envio realmente automático, o cenário Make precisa ter uma rota com essa ação conectada a uma API oficial de WhatsApp/WhatsApp Business. Até essa rota existir, o fallback por link mantém o fluxo funcional até o final.
