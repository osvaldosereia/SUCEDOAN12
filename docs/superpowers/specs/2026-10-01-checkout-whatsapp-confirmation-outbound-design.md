# Dona Antônia — Checkout com confirmação automática no WhatsApp

**Data:** 2026-10-01

## 1. Objetivo

Retirar do cliente a obrigação de abrir o WhatsApp e tocar em “Enviar” para concluir o pedido.

O pedido deve nascer e ser confirmado no site. O WhatsApp passa a ser um canal de confirmação e continuidade da conversa, nunca uma etapa obrigatória para criação do pedido.

## 2. Resultado esperado

Fluxo principal:

1. cliente finaliza o checkout no site;
2. backend valida cadastro, estoque, data de entrega e pagamento;
3. pedido canônico é criado no Supabase;
4. checkout exibe imediatamente “Pedido recebido”;
5. backend cria uma intenção de mensagem outbound vinculada ao pedido;
6. a confirmação é enviada automaticamente ao WhatsApp do cliente pelo canal correto;
7. após 3 segundos, o site faz uma tentativa não obrigatória de retornar/abrir a conversa do WhatsApp;
8. se o navegador/celular bloquear a abertura automática, permanece um botão “Voltar ao WhatsApp”.

Nenhuma falha de abertura do WhatsApp pode desfazer, duplicar ou invalidar o pedido já criado.

## 3. Regra arquitetural

### Fonte de verdade

- pedido: Supabase / motor canônico do site;
- PapoAI/WhatsApp: canal de comunicação;
- Bling: ERP, sem participação na criação da mensagem de confirmação do checkout.

### Proibição

- PapoAI não cria o pedido do checkout;
- texto livre no WhatsApp não é requisito para validar pedido do site;
- não usar Make/n8n no fluxo principal;
- não depender de popup, `wa.me` ou clique do cliente para persistir a venda.

## 4. Checkout

O botão final passa a representar apenas a ação de finalizar o pedido no sistema.

Texto recomendado:

**Finalizar pedido**

Após sucesso:

- limpar carrinho somente depois de resposta positiva do backend;
- mostrar número do pedido;
- mostrar total, data de entrega e forma de pagamento;
- informar que a confirmação será enviada ao WhatsApp;
- exibir contagem de 3 segundos para tentativa de retorno ao WhatsApp quando houver canal conhecido;
- manter botão manual `Voltar ao WhatsApp`;
- manter botão `Continuar no site`/`Voltar à vitrine`.

O código atual que reserva antecipadamente uma nova janela com `window.open('about:blank')` deixa de ser necessário para a conclusão do pedido.

## 5. Retorno automático ao WhatsApp

A tentativa automática é apenas conveniência.

### Regra

Depois da tela de sucesso:

- aguardar aproximadamente 3 segundos;
- se houver origem/canal WhatsApp conhecido, tentar abrir a conversa desse canal;
- se a abertura automática for bloqueada, não mostrar erro de pedido;
- manter botão manual para a mesma conversa;
- não reenviar mensagem nem recriar pedido ao retornar.

Não existe garantia universal de que navegador móvel permita abrir outro aplicativo sem nova interação do usuário. Por isso o fallback manual é obrigatório.

## 6. Roteamento 0975 / 1018

Preservar os dois canais atuais.

- origem 0975 -> confirmação pelo 0975;
- origem 1018 -> confirmação pelo 1018;
- cliente vindo por link personalizado deve manter o canal de origem;
- entrada direta no site usa o canal padrão configurado pela Dona Antônia;
- não permitir envio duplicado pelos dois números para o mesmo pedido.

O pedido deve guardar/snapshotar o canal de origem quando disponível.

## 7. Outbox de WhatsApp

Criar uma fila operacional server-side para mensagens transacionais do pedido.

Campos mínimos sugeridos:

- `id`;
- `order_id`;
- `customer_id`;
- `phone_e164`;
- `channel_origin` (`0975` ou `1018`);
- `message_kind` (`order_received` inicialmente);
- `payload`/snapshot mínimo da mensagem;
- `status` (`pending`, `sending`, `sent`, `retry`, `failed`, `suppressed`);
- `attempt_count`;
- `external_message_id` quando disponível;
- `last_error`;
- `created_at`;
- `sent_at`.

### Idempotência

Um mesmo `order_id + message_kind` só pode gerar uma confirmação efetiva.

Retries devem reutilizar a mesma intenção e nunca criar mensagem duplicada.

## 8. Conteúdo da confirmação

Mensagem inicial simples e transacional.

Exemplo lógico:

- Pedido recebido pela Dona Antônia;
- número do pedido;
- total;
- data de entrega;
- forma de pagamento;
- orientação curta de que o pedido será preparado.

Não incluir marketing nessa mensagem.

## 9. Janela Meta / template

O gateway deve decidir o formato permitido pelo canal oficial:

- dentro da janela permitida de atendimento, usar mensagem transacional suportada pelo PapoAI/Meta;
- fora da janela, usar somente template de utilidade aprovado, quando necessário e permitido;
- se o PapoAI exigir configuração externa de template/ação, manter a intenção pendente até a integração estar configurada, sem afetar a criação do pedido.

## 10. Integração PapoAI

A parte programável no repositório deve ser separada da parte que depende da interface da conta PapoAI.

### No código

- criar intenção outbound após pedido confirmado;
- manter vínculo pedido -> cliente -> conversa quando já existir;
- expor logs/status mínimos no Admin;
- preparar adapter/gateway idempotente para envio;
- não inserir credenciais do PapoAI no frontend.

### Na interface PapoAI / Work

Quando necessário:

- validar qual ação/API oficial da conta envia mensagem/template pelo canal 0975 e 1018;
- configurar template de utilidade de confirmação se necessário;
- testar somente com contato controlado autorizado;
- não ativar campanha nem follow-up como parte deste fluxo.

## 11. Falhas e experiência do cliente

### Pedido criado + WhatsApp falhou

- mostrar `Pedido recebido` normalmente;
- pedido permanece no Admin;
- registrar outbound como `retry`/`failed`;
- permitir nova tentativa server-side;
- não pedir que o cliente refaça o pedido.

### Pedido não criado

- não disparar outbound;
- não limpar carrinho;
- mostrar erro real do checkout e permitir correção/tentativa.

## 12. Observabilidade

No Admin, por pedido, mostrar no mínimo:

- confirmação WhatsApp: pendente / enviada / falhou;
- canal usado;
- horário;
- última falha quando houver;
- ação manual de reenviar somente quando seguro e idempotente.

## 13. Segurança

- telefone normalizado e validado no backend;
- credenciais somente server-side;
- RLS/service role conforme padrão atual;
- rate limit para qualquer endpoint público envolvido;
- payload de envio deve vir do pedido salvo, não de texto arbitrário enviado pelo navegador após a criação;
- não confiar no cliente para escolher livremente o número de origem quando houver identidade PapoAI válida.

## 14. Testes obrigatórios

1. pedido normal pelo site direto;
2. pedido vindo do 0975;
3. pedido vindo do 1018;
4. pedido salvo com outbound enviado;
5. pedido salvo com outbound temporariamente indisponível;
6. retry sem duplicidade;
7. tentativa de retorno automático após 3 segundos;
8. navegador que bloqueia abertura automática;
9. botão manual `Voltar ao WhatsApp`;
10. carrinho não é limpo quando o pedido falha;
11. dois cliques rápidos não criam dois pedidos/mensagens;
12. pedido aparece no Admin independentemente do WhatsApp.

## 15. Critérios de aceitação

- cliente não precisa abrir WhatsApp nem tocar em enviar para o pedido existir;
- pedido é criado apenas uma vez no motor canônico;
- confirmação automática é enviada pelo canal correto quando a integração estiver disponível;
- falha de WhatsApp não vira falha de pedido;
- retorno automático em ~3 s é best-effort e possui fallback manual;
- nenhum envio duplicado entre 0975 e 1018;
- logs mínimos permitem identificar rapidamente falhas de envio;
- nenhum segredo novo é exposto no frontend.
