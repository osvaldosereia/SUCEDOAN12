# Roadmap — PapoAI + Chat Comprar

Data: 17/09/2026

## Objetivo

Transformar o PapoAI em porta de entrada do WhatsApp e o Chat Comprar em continuação inteligente da mesma jornada, preservando o Supabase como fonte de verdade para cliente, pedido, endereço, cesta, estoque e histórico comercial.

## Princípio de arquitetura

- PapoAI: conversa WhatsApp, atendimento humano/IA e CRM operacional.
- Supabase: identidade comercial, clientes, sessões, carrinho, pedidos, endereços, histórico e regras.
- Chat Comprar: experiência visual de compra ligada à identidade já conhecida no WhatsApp.
- O telefone normalizado é a chave de busca inicial. Nome vindo do PapoAI é contexto; nunca substitui a identificação por telefone.
- Dados pessoais não são colocados em URLs. O Comprar recebe somente um token opaco de sessão.

## Etapa 1 — Identidade PapoAI → Comprar — EXECUTAR AGORA

1. Receber webhook autenticado do PapoAI com telefone, nome e mensagem inicial.
2. Normalizar telefone e consultar `lookup_customer_by_phone`.
3. Vincular/reutilizar uma conversa WhatsApp existente ou criar uma conversa segura para o contato.
4. Criar/reutilizar a sessão do Comprar via `room_start_for_conversation_v1`.
5. Devolver URL com token opaco do Comprar e contexto mínimo do cliente.
6. Se houver cliente cadastrado, o Comprar abre com `state.customer` preenchido e chama a pessoa pelo primeiro nome.
7. No checkout, cliente já identificado não digita telefone novamente; segue direto para confirmação do endereço salvo.
8. Cliente desconhecido mantém o fluxo atual e informa o telefone no checkout.

### Etapa 1A — identificação — CONCLUÍDA E VALIDADA

O PapoAI já envia nome e telefone no webhook. Em teste real de 17/09/2026, o Supabase recebeu os dados, encontrou o cliente pelo telefone, vinculou `customer_id` e criou/reutilizou a sessão personalizada do Comprar.

### Etapa 1B — entrega do link personalizado — EXECUTAR AGORA

Para cliente identificado, o mesmo webhook entrega automaticamente no WhatsApp a URL opaca da sessão do Comprar. A primeira versão usa uma **ponte temporária** e isolada no transporte outbound já existente (Supabase → webhook Make → WhatsApp Business Cloud), somente para enviar o link individual. Essa ponte não decide venda, não executa IA e não altera cadastro ou pedido.

A IA antiga permanece desligada, assim como o worker conversacional e o auto-reply antigos. Somente o transporte estritamente necessário para entregar o link é habilitado. Quando a PapoAI disponibilizar/confirmar uma saída nativa segura para mensagens dinâmicas, esta ponte temporária pode ser substituída sem mudar a identidade, a sessão ou o checkout do Comprar.

Resultado esperado: o cliente sai do WhatsApp para o Comprar já reconhecido, sem repetir dados que o sistema já possui.

## Etapa 2 — Última compra e recompra inteligente — FUTURA

1. Consultar último pedido concluído do cliente.
2. Identificar a última cesta e os produtos extras.
3. Recalcular tudo com preços, estoque e ofertas atuais — nunca reaproveitar valor histórico como preço de venda.
4. Mostrar no início do Comprar opções como `Repetir minha última cesta`, `Ver última compra`, `Ver outras cestas`.
5. Destacar itens indisponíveis/substituídos antes de montar o carrinho.
6. Manter confirmação explícita do cliente antes de adicionar a compra anterior ao carrinho.

## Etapa 3 — Sincronização de contexto Comprar → PapoAI — FUTURA

1. Confirmar os endpoints de escrita de contatos, etiquetas e atributos personalizados disponíveis na conta PapoAI.
2. Guardar a chave da API Papo somente no Supabase Vault.
3. Atualizar no PapoAI apenas contexto operacional útil: cliente conhecido, comprou, pedido aberto, recompra, atenção humana e último pedido.
4. Nunca usar o PapoAI como banco mestre de pedidos/clientes.
5. Tornar a sincronização idempotente e tolerante a indisponibilidade do PapoAI.

## Etapa 4 — Pedido e entrega conectados ao WhatsApp — FUTURA

1. Pedido confirmado no Comprar gera evento operacional.
2. Mudanças de status `separando`, `pronto`, `em rota`, `entregue` podem gerar mensagens pelo PapoAI.
3. Motorista/equipe continua controlando rota e status no nosso sistema.
4. Exceções de endereço, atraso ou item faltante encaminham para atendimento humano com contexto.

## Etapa 5 — Pós-venda e recompra — FUTURA

1. Após entrega, perguntar se chegou tudo certo.
2. Resposta negativa cria prioridade de atendimento humano; não dispara venda automática.
3. Recompra usa intervalo e histórico real do cliente.
4. Mensagens proativas respeitam consentimento e regras do WhatsApp/templates.
5. Segmentar sem duplicar o histórico comercial no PapoAI.

## Etapa 6 — CRM e inteligência operacional — FUTURA

1. Resumo do cliente para atendente: nome, último pedido, pedido atual, última cesta, endereço conhecido e alertas.
2. Etiquetas simples e duráveis; estados transitórios permanecem no Supabase.
3. Métricas de atendimento → compra → entrega → recompra.
4. Relatórios de conversão do WhatsApp para o Comprar e abandono por etapa.
5. Handoff IA → humano com resumo e dados do pedido sem fazer o cliente repetir informações.

## Fora da Etapa 1

- Repetir pedido anterior.
- Atualizar etiquetas no PapoAI.
- Enviar status de entrega pelo PapoAI.
- Pós-venda automático.
- NPS/remarketing.
- Alterar regras comerciais, produtos, preços ou estoque.

Esses itens ficam registrados neste roadmap e só devem ser executados em etapas posteriores.
