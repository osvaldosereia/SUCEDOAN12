# Caneca 10

Site mobile e independente do Criador de Canecas do Produção.

## Abas

### Gerador interno — `index.html`

Fluxo operacional para criar canecas a partir de imagem, comandos salvos e instrução complementar. Usa o mesmo webhook Make do Produção, gera a arte horizontal, três mockups e cadastra o produto como inativo.

### Personalize a sua — `personalizar.html`

Versão de teste voltada ao cliente final.

1. O cliente escolhe um modelo. A página une os registros de `canecas/modelos_criacao` com as canecas já existentes em `/produtos`, sem excluir produtos inativos.
2. Todas as canecas criadas que possuem arte ou imagem podem ser escolhidas como modelo.
3. Ao selecionar um modelo, a página mostra a frase usada nele quando essa informação estiver salva e oferece **Usar esta mesma frase**.
4. O cliente envia uma foto pela câmera ou galeria.
5. Informa seu nome para atendimento, um **nome para destacar na caneca** e a frase.
6. O prompt orienta a IA a manter **foto + nome em destaque** no mesmo lado/polo da composição e a **frase no lado oposto da caneca**.
7. Antes da geração, o cliente precisa abrir o WhatsApp oficial da Dona Antônia e enviar a mensagem pronta com o código da criação. Ao voltar, confirma o envio para liberar o botão de gerar.
8. São geradas quatro imagens: arte horizontal + três mockups.
9. A caneca é cadastrada em `/produtos/{id}` como inativa, `tipo_produto: caneca_personalizada`, `modelo_caneca: true` e `origem_cadastro: ceneca10_cliente_teste`.
10. Toda nova criação também é salva automaticamente em `canecas/modelos_criacao/{id}`, portanto passa a servir de modelo para as próximas personalizações mesmo continuando inativa.
11. A criação pública é salva em `canecas/personalizadas_publicas/{id}` e os dados operacionais em `canecas/personalizadas/{id}`.
12. Depois que o link público existe, o botão final abre o WhatsApp oficial da Dona Antônia com o código e o link das quatro imagens.

## Página pública de resultado

`resultado.html?id=<id-da-criacao>` mostra:

- arte horizontal;
- três mockups;
- modelo escolhido;
- nome em destaque;
- frase;
- botão para encomendar pelo WhatsApp oficial.

## Configuração do teste

A aba de personalização reaproveita `da_admin_v2_mug_make_webhook`. Para testar em outros celulares, abra:

`personalizar.html?admin=1`

A engrenagem permite salvar o webhook localmente e, opcionalmente, publicá-lo temporariamente em `canecas/config_publica/make_webhook` para os clientes da página de teste.

**Importante:** a publicação do webhook no Firebase é apenas para esta fase de teste. Antes de levar o recurso ao site principal, o ideal é trocar por um endpoint/proxy protegido para evitar exposição e abuso do webhook do Make.

## WhatsApp

Não existe fila de envio automático nem rota `send_mug_customer_whatsapp`. O próprio navegador abre `wa.me` apontando para o WhatsApp oficial da Dona Antônia. A mensagem inicial é obrigatória para liberar a criação e serve para captar o contato real do cliente. Após a geração, outro link `wa.me` envia o endereço da página temporária com as quatro imagens.
