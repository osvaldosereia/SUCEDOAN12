# Dona Antônia — PapoAI Commerce OS — R0-A Agent External Lab

Data: 2026-09-21  
Repositório: `osvaldosereia/SUCEDOAN12`  
Supabase: `ssbesxgaijknwsjbsbcz`  
Status desta especificação: **DESIGN APROVADO PARA ESCRITA; IMPLEMENTAÇÃO AINDA NÃO INICIADA**

## 1. Objetivo

Provar, de forma isolada e segura, a integração **PapoAI Agente Externo -> Supabase -> resposta ao PapoAI**, antes de conectar IA comercial, cestas, carrinho, pedido, Bling, pós-venda ou marketing.

A R0-A existe para responder com evidência real:

1. o PapoAI chama um endpoint HTTPS nosso;
2. o endpoint recebe telefone, nome, sessão e mensagem;
3. o endpoint responde no contrato aceito pelo PapoAI;
4. o PapoAI entrega a resposta ao WhatsApp;
5. sessão, deduplicação, rajada, silêncio e handoff funcionam como esperado;
6. falhas são observáveis por `correlation_id`;
7. nenhuma regra comercial ou efeito externo é acionado durante a prova.

## 2. Decisão arquitetural

### 2.1 Papel de cada sistema

**PapoAI**
- transporte WhatsApp;
- inbox e fila humana;
- Agente Externo;
- transferência/handoff;
- recursos operacionais do canal.

**Supabase**
- endpoint do Agente Externo;
- autenticação;
- normalização;
- identidade;
- sessão;
- logs;
- idempotência;
- estado do laboratório;
- kill switch;
- capability registry.

**OpenAI**
- **não usado na R0-A**.

### 2.2 Regra central

A R0-A não tenta provar comércio. Ela prova apenas o transporte conversacional.

O endpoint devolve uma **resposta fixa de laboratório**, associada à sessão recebida. Assim, qualquer falha observada pertence à integração PapoAI <-> Supabase e não fica misturada com prompt, modelo, estoque, cesta ou regras comerciais.

## 3. Reuso obrigatório do que já existe

A implementação deve reaproveitar:

- `ingest_channel_adapter_event_v1`;
- `channel_provider_adapters`;
- `channel_provider_contact_states`;
- `channel_provider_event_receipts`;
- `normalized_channel_events`;
- Identity Resolver existente;
- `conversations`;
- padrão de autenticação segura do `papo-comprar-webhook-v1`.

Não criar uma segunda identidade, segunda conversa ou segundo CRM paralelo.

O atual `papo-comprar-webhook-v1` permanece intacto durante a R0-A.

## 4. Novo endpoint

Criar Edge Function isolada:

`papo-external-agent-v1`

### 4.1 Entrada

Aceitar POST JSON.

Normalizar, no mínimo:

- telefone;
- nome;
- ID de sessão;
- mensagem atual;
- histórico, quando fornecido;
- direção/papel da mensagem;
- mídia/referência somente como metadado observável nesta fase.

Aliases devem seguir o contrato fornecido pelo proprietário e não devem substituir campos canônicos por suposição quando houver ambiguidade.

### 4.2 Autenticação

- segredo server-side;
- comparação constante;
- sem segredo configurado -> fail closed;
- segredo nunca em frontend, GitHub ou logs;
- preferir Vault/secret da Edge Function;
- aceitar somente o mecanismo efetivamente suportado pelo PapoAI durante homologação.

### 4.3 Saída de laboratório

Resposta normal de teste:

```json
{
  "message": {
    "text": "Teste Dona Antônia concluído. Recebi sua mensagem corretamente."
  },
  "handoff": false,
  "session_id": "<sessao-normalizada>",
  "correlation_id": "<uuid>"
}
```

O texto poderá incluir apenas informação necessária para confirmar a prova. Não incluir dados pessoais desnecessários.

## 5. Correlation ID e observabilidade

Cada chamada recebe um UUID.

Registrar:

- correlation_id;
- provider;
- session key;
- conversation_id canônica;
- customer_id quando resolvido;
- external message/event id quando existir;
- timestamp de entrada;
- timestamp de saída;
- duração;
- status do processamento;
- tipo de resposta: normal, silent, handoff, protocol_error;
- capability probes associados.

Nunca registrar:

- segredo;
- token;
- base64 de mídia;
- conteúdo sensível além do necessário para depuração.

## 6. Capability Registry

A R0-A deve introduzir ou estender uma estrutura canônica para capacidades de provider.

Estados mínimos:

- `unknown`;
- `observed_ui`;
- `observed_payload`;
- `verified_lab`;
- `verified_production`;
- `unsupported`;
- `manual_setup_required`.

Capacidades iniciais:

- `agent_external.request`;
- `agent_external.text_reply`;
- `agent_external.session`;
- `agent_external.handoff`;
- `agent_external.silent`;
- `agent_external.media_reply`;
- `agent_external.button_reply`;
- `agent_external.list_reply`;
- `agent_external.flow_reply`;
- `contact.custom_field_write`;
- `tag.assign`;
- `tag.remove`;
- `funnel.move`;
- `campaign.create`;
- `campaign.send`;
- `automation.create`.

A R0-A só tenta verificar as cinco primeiras capacidades relacionadas ao Agente Externo. As demais ficam registradas, mas continuam sem efeito.

## 7. Handoff

### 7.1 Pedido explícito de humano

Quando o payload de laboratório contiver uma frase de teste explicitamente reservada para homologação, por exemplo:

`TESTE_HANDOFF_DONA_ANTONIA`

o endpoint responde:

```json
{
  "message": {
    "text": "Vou transferir este teste para atendimento humano."
  },
  "handoff": true,
  "session_id": "...",
  "correlation_id": "..."
}
```

Não usar classificador de IA na R0-A.

### 7.2 Silêncio

Criar estado de sessão que permita marcar atendimento como pausado por humano.

Se a sessão estiver pausada, responder:

```json
{
  "message": null,
  "silent": true,
  "handoff": true,
  "reason": "human_active",
  "session_id": "...",
  "correlation_id": "..."
}
```

A prova física de como o PapoAI reage ao `silent` determina se a capacidade passa para `verified_lab`.

## 8. Rajada e deduplicação

### 8.1 Rajada

O laboratório deve suportar agrupamento configurável de mensagens sucessivas da mesma sessão.

Para a primeira prova:
- janela curta e configurável;
- não bloquear requisição além do timeout permitido;
- registrar mensagens agrupadas e resposta única;
- se a mecânica síncrona do Agente Externo impedir agrupamento seguro, marcar a capacidade como não comprovada e não improvisar.

### 8.2 Deduplicação

Preferir IDs externos quando disponíveis.

Fallback:
- hash determinístico de provider + sessão + mensagem + janela temporal controlada.

Nunca repetir um efeito apenas porque o PapoAI reenviou o mesmo POST.

## 9. Kill switch

A R0-A deve ter kill switch independente do resto do sistema.

Quando desligado:
- nenhuma lógica comercial;
- nenhuma IA;
- nenhuma chamada externa;
- resposta segura em modo silencioso/handoff conforme o comportamento homologado.

O kill switch da R0-A não altera os gates canônicos atuais de Meta Direct, Marketing OS ou PapoAI outbound.

## 10. Isolamento do Customer & Marketing OS

A R0-A não deve:

- ativar `PapoAI outbound` canônico;
- alterar `external_activation_authorized`;
- ativar Meta Direct;
- ativar publishing;
- ativar strategy AI;
- alterar canary;
- criar campanha;
- enviar template;
- criar pedido;
- escrever no Bling.

Ela reutiliza o adapter existente, mas permanece um laboratório de transporte.

## 11. Critérios de aceite

A R0-A só é considerada tecnicamente concluída quando houver evidência real de:

1. chave inválida -> 401;
2. JSON inválido -> 400;
3. payload sem mensagem -> 400;
4. payload válido -> 200;
5. telefone e sessão normalizados;
6. evento canônico registrado sem duplicação;
7. resposta fixa exibida corretamente no WhatsApp de homologação;
8. segunda mensagem na mesma sessão reconhecida como mesma sessão;
9. handoff de laboratório observado;
10. silent observado ou explicitamente marcado como não suportado;
11. timeout retorna contingência segura;
12. correlation_id permite rastrear ponta a ponta;
13. nenhuma ação comercial, campanha, pedido ou Bling ocorre.

## 12. Estratégia de teste

### Testes automáticos

Antes do deploy:
- autenticação;
- parser de aliases;
- normalização de telefone;
- sessão fallback;
- invalid JSON;
- empty message;
- deduplicação;
- handoff reservado;
- silent;
- kill switch;
- logs sem segredo.

### Teste físico

Usar exclusivamente contato/número de homologação autorizado.

Sequência mínima:
1. enviar mensagem simples;
2. confirmar resposta fixa;
3. enviar segunda mensagem;
4. executar teste reservado de handoff;
5. testar pausa/silent;
6. registrar evidência no Capability Registry.

## 13. O que vem depois

Somente após a R0-A:

### R0-B — Commerce Brain foundation
- intenção;
- tool routing;
- resposta determinística;
- OpenAI apenas onde necessário.

### R1 — leitura comercial
- listar cestas;
- composição completa;
- consultar produto;
- preço/estoque.

### R2 — cesta conversacional
- selecionar;
- retirar;
- aumentar;
- trocar;
- extras;
- preservar valor oculto;
- recalcular.

### R3 — checkout/pedido
- endereço;
- pagamento;
- resumo;
- confirmação explícita;
- pedido idempotente;
- integração downstream.

### R4 — WhatsApp rich capabilities
- imagem;
- botões;
- lista;
- Flow;
- cada recurso liberado somente após capability probe.

### R5 — lifecycle e marketing
- pós-venda;
- recompra;
- segmentação;
- outbound governado;
- templates Meta.

## 14. Decisões fechadas nesta especificação

- Agente Externo é a rota preferida para o cérebro próprio.
- R0-A começa com resposta fixa, não OpenAI.
- Supabase participa desde o primeiro teste para identidade, sessão, logs e evidência.
- PapoAI continua como provider/transport, não fonte de verdade.
- O webhook existente não será quebrado ou substituído nesta rodada.
- Capacidade não comprovada fica `unknown`; não será inferida.
- Não haverá cliente real nem efeito comercial na R0-A.
