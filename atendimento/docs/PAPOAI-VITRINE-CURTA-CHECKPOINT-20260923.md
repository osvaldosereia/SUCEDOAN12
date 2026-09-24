# PapoAI + Vitrine curta — checkpoint 2026-09-23

## Estado em produção

Fluxo validado:

PapoAI/WhatsApp -> webhook de saída "Mensagem recebida" -> Supabase CRM `papo-external-agent-v1` -> decisão de intenção comercial -> emissão de link curto no storefront -> webhook de entrada PapoAI -> campo personalizado **Link da Vitrine** -> resposta normal do Agente PapoAI.

Exemplo validado:
- cliente: `quero ver as cestas`
- resposta: `https://donaantonia.com.br/catalogo_0235`
- código consumido com sucesso;
- checkout reconheceu automaticamente cliente cadastrado.

## Produção

- `papo-external-agent-v1`: v95 ACTIVE
- `simple-storefront-v1`: v20 ACTIVE
- `admin-service-intelligence-v1`: v82 ACTIVE

## Link curto

Formato:
`https://donaantonia.com.br/catalogo_XXXX`

Regras:
- 4 dígitos;
- telefone/CPF/ID nunca aparecem na URL;
- validade de 30 minutos;
- código retirado de circulação por 24h após emissão;
- proteção de tentativas no resolver;
- links antigos `?c=TOKEN` preservados temporariamente por compatibilidade.

## Identidade

O link resolve o telefone no backend e grava a identificação somente para a sessão da vitrine. O checkout usa o telefone completo e o RPC canônico `lookup_customer_by_phone`, incluindo variantes brasileiras com/sem 9º dígito.

## Decisão de gerar vitrine

O link NÃO é criado em toda mensagem.

Gera link quando houver intenção clara:
- catálogo/vitrine;
- ver/escolher/comprar cestas;
- ofertas/promoções;
- ver produtos/opções/loja;
- intenção genérica de compra/pedido.

Não gera automaticamente:
- saudação;
- conversa geral;
- Flow/cadastro;
- reclamação;
- pedido atrasado/não recebido;
- cancelamento/troca/devolução/reembolso;
- rastreio/status/nota fiscal e demais pós-venda.

O evento grava `storefront_link_decision` com `eligible`, `reason` e `kind`.

## PapoAI

Webhook de entrada `teste1` deve manter apenas:
1. buscar/criar contato pelo telefone;
2. atualizar campo **Link da Vitrine** com `shopping_url`.

Não usar a ação 3 "Enviar mensagem" nesse webhook, porque a API Oficial expõe apenas template aprovado nessa ação. Dentro da janela de atendimento, quem responde é o Agente PapoAI normalmente.

## Próxima etapa

Revisar as instruções do Agente PapoAI para garantir:
- responder diretamente quando já possui informação suficiente;
- fazer no máximo uma ou duas perguntas segmentadoras apenas quando necessárias;
- usar **Link da Vitrine** somente quando realmente ajuda a compra;
- não mandar vitrine em pós-venda/suporte;
- não repetir link no mesmo contexto;
- preferir conversa curta, natural e comercial sem pressão.
