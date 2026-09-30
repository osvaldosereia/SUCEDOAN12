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
8. o Flow do PapoAI continua útil para completar os dados realmente necessários ao atendimento, mas não é requisito para o pedido existir no Admin;
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

## Cadastro canônico

O Supabase mantém a jornada por pedido em `ops2_customer_registration_journeys_v1`.

Estados:

- `pending`;
- `complete`.

Campos faltantes são explícitos em `missing_fields`.

A regra canônica `ops2_customer_registration_state_v1(customer_id)` agora separa três conceitos:

- `registration_complete`: nome + telefone + documento válido + endereço/cidade utilizáveis;
- `flow_required`: falta nome, telefone, endereço ou cidade — situação em que o formulário de cadastro realmente agrega valor operacional;
- `document_only_pending`: identidade e endereço já estão suficientes para atendimento/entrega e falta somente CPF/CNPJ, que pode ser tratado na etapa fiscal/Bling sem forçar o cliente a preencher o Flow inteiro novamente.

Essa separação mantém o pedido aberto e correto sem transformar CPF isolado em motivo para repetir o formulário completo.

`ops2_customer_identity_summary_v2()` agrega a situação operacional e `ops2_customer_identity_summary_v1()` delega para a v2, mantendo compatibilidade com o Admin existente.

O resumo também expõe:

- `flow_required_orders`;
- `flow_required_with_conversation`;
- `flow_required_without_conversation`;
- `document_only_pending_orders`.

## PapoAI — regra de simplicidade

### 0975

É o canal atual usado pelo site para o handoff do pedido.

A automação de cadastro do site fica concentrada nele.

Gatilhos operacionais desejados, todos baseados no texto estruturado que o site já envia:

- `CLIENTE: NOVO`; ou
- `ENDERECO: NAO INFORMADO`; ou
- `CIDADE: NAO INFORMADA`.

O objetivo é atingir cliente novo e também cliente já conhecido que ainda não tem endereço/cidade completos, sem mandar Flow novamente para quem só está sem documento.

Ações:

- adicionar tag `CADASTRO_PENDENTE`, se o PapoAI suportar de forma confiável;
- enviar o Flow de cadastro 0975 já existente;
- não parar a IA indefinidamente;
- não criar pedido;
- não aplicar `COMPROU`;
- no máximo um lembrete automático seguro, somente se houver condição determinística para evitar duplicidade/spam.

### 1018

A automação automática de cadastro permanece desativada enquanto o site usa 0975 e não existe isolamento nativo comprovado por canal.

O 1018 pode continuar atendendo conversas orgânicas normalmente pela ANA.

## Flow

O Flow continua válido, porém é opcional para a existência do pedido.

O backend já reconhece respostas reais contendo `flow_token`, `data_sharing_consent` e `custom_1..custom_5` e atualiza cliente/pedido.

Se o cliente não preencher o Flow:

- o pedido permanece no Admin;
- a jornada permanece `pending`;
- o Admin mostra a pendência;
- nenhuma criação automática de pedido PapoAI ocorre.

## Evidência real de produção

Em 30/09/2026, depois da simplificação da automação 0975, foram observadas duas novas respostas reais de Flow:

- ambas chegaram pelo número final 0975;
- ambas foram `processed` sem revisão;
- cada uma vinculou exatamente 1 pedido;
- em ambos os casos a conversa do Flow era a mesma conversa ligada ao pedido;
- os dois clientes terminaram com `registration_complete=true` e `missing_fields=[]`;
- não houve criação duplicada de pedido observada nesses casos.

Pedidos usados como evidência operacional:

- `DA-260930-7FA9BFB5`;
- `DA-260930-73D039BF`.

Isso confirma na prática o caminho:

site → pedido salvo → WhatsApp 0975 → Flow PapoAI → webhook → Supabase → mesmo cliente/pedido → cadastro completo.

## Meta direta

`whatsapp-meta-direct-v1` permanece aposentada como stub `410 retired_direct_meta_transport`.

Os gates outbound permanecem desligados.

Não usar esse caminho sem uma nova decisão arquitetural explícita.

## Make

Cenários antigos podem ser usados apenas como evidência/histórico. Não retornar Make para o runtime principal desta arquitetura.

## Próximo ajuste no PapoAI

Executar via Work somente uma pequena ampliação da automação `cadastro 0975`:

1. manter `CLIENTE: NOVO`;
2. acrescentar, em lógica OU, `ENDERECO: NAO INFORMADO`;
3. acrescentar, em lógica OU, `CIDADE: NAO INFORMADA`;
4. se o construtor não suportar lógica OU de forma inequívoca, não improvisar nem criar múltiplos envios; relatar a limitação;
5. manter `cadastro 1018` desativada;
6. manter `Pedido → COMPROU` desativado;
7. não criar campanha, pedido conversacional, pós-venda ou integração Meta/Make nesta etapa.
