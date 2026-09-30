# PapoAI — Estratégia Operacional Simples

**Data:** 2026-09-30

## Decisão

A operação não usará Meta Cloud API direta nem Make como transporte primário das automações de atendimento.

O caminho operacional escolhido é:

1. site salva o pedido e garante `customer_id` + telefone + nome;
2. site abre o WhatsApp operacional já usado pelo PapoAI;
3. o próprio cliente envia a mensagem de pedido;
4. PapoAI recebe e atende normalmente;
5. webhook existente envia o inbound ao Supabase;
6. Supabase liga a conversa ao pedido pelo `NUMERO:` exato da mensagem, com fallback apenas quando há um único pedido recente inequívoco;
7. cadastro completo/incompleto é verdade do Supabase, não do texto da IA;
8. o Flow do PapoAI continua útil para clientes novos, mas não é requisito para o pedido existir no Admin;
9. Bling só recebe cliente/pedido quando os dados exigidos pela etapa estiverem aptos.

## Regra principal

Nunca fazer o pedido depender do preenchimento do Flow.

- pedido deve existir antes do WhatsApp;
- cadastro incompleto vira pendência, não perda de pedido;
- Flow serve para enriquecer/completar cadastro;
- atendimento humano é exceção, não etapa obrigatória.

## Site → PapoAI

O site já envia uma mensagem estruturada contendo:

- `PEDIDO DONA ANTONIA`;
- `NUMERO: <8 últimos caracteres do order_number>`;
- `CLIENTE: NOVO` ou `CADASTRADO`;
- nome, telefone, endereço, bairro, cidade;
- itens, total, pagamento e entrega.

O `NUMERO:` é o identificador operacional preferencial para vínculo da conversa ao pedido.

## Vínculo automático do inbound

Migration `ops2_papoai_inbound_order_link_v1`:

- lê o inbound do PapoAI depois que a conversa foi resolvida;
- tenta primeiro o sufixo de pedido informado em `NUMERO:`;
- exige coerência de cliente/telefone e janela de tempo;
- não sobrescreve pedido ligado a outra conversa;
- fallback só é permitido quando existe exatamente um pedido recente do mesmo cliente/telefone;
- ambiguidade resulta em não-vínculo, nunca em chute.

O pedido real `DA-260930-4AD2B81A` foi ligado por `order_number_exact` à conversa correta após a implantação.

## Cadastro

O Supabase mantém a jornada por pedido em `ops2_customer_registration_journeys_v1`.

Estados:

- `pending`;
- `complete`.

Campos faltantes são explícitos em `missing_fields`, atualmente incluindo nome, documento, endereço e cidade conforme a regra canônica.

`ops2_customer_identity_summary_v2()` agrega a situação operacional e `ops2_customer_identity_summary_v1()` delega para a v2, mantendo compatibilidade com o Admin existente.

## PapoAI — regra de simplicidade

### 0975

É o canal atual usado pelo site para o handoff do pedido.

A automação de cadastro do site deve ficar concentrada nele:

- gatilho `CLIENTE: NOVO`;
- adicionar tag `CADASTRO_PENDENTE`, se o PapoAI suportar de forma confiável;
- enviar o Flow de cadastro 0975 já existente;
- não parar a IA indefinidamente;
- no máximo um lembrete automático seguro, preferencialmente condicionado à permanência da tag pendente.

### 1018

Não deve responder ao mesmo gatilho `CLIENTE: NOVO` usado pelo site enquanto não houver isolamento nativo comprovado por canal.

Pode continuar atendendo conversas orgânicas pela ANA. Cadastro estruturado no 1018 deve ser tratado separadamente, sem criar risco de envio cruzado.

## Flow

O Flow continua válido, porém é opcional para a existência do pedido.

O backend já reconhece respostas reais contendo `flow_token`, `data_sharing_consent` e `custom_1..custom_5` e atualiza cliente/pedido.

Se o cliente não preencher o Flow:

- o pedido permanece no Admin;
- a jornada permanece `pending`;
- o Admin mostra a pendência;
- nenhuma criação automática de pedido PapoAI ocorre.

## Meta direta

`whatsapp-meta-direct-v1` foi restaurada para stub `410 retired_direct_meta_transport`.

Os gates outbound permanecem:

- `dispatch_mode=disabled`;
- `dispatch_enabled=false`;
- `transport_verified=false`.

Não usar esse caminho sem uma nova decisão arquitetural explícita.

## Make

Cenários antigos podem ser usados apenas como evidência/histórico. Não retornar Make para o runtime principal desta arquitetura.

## Próxima alteração no PapoAI

Executar via Work:

1. manter `cadastro 0975` como automação do site;
2. remover `CLIENTE: NOVO` de `cadastro 1018` para eliminar risco cruzado;
3. manter `Pedido → COMPROU` desativado;
4. manter Flow atual do 0975;
5. usar tag pendente/concluído e lembrete apenas se o PapoAI suportar isso deterministicamente;
6. não criar campanhas, pedidos conversacionais ou pós-venda nesta rodada.
