# Admin Pedidos → WhatsApp + cadastro vinculado — design

Data: 2026-10-01

## Objetivo

Na tela `Pedidos` do Vitrine/Admin, permitir ao operador:

1. enviar a confirmação do pedido no mesmo padrão utilitário do checkout público para o WhatsApp do cliente;
2. enviar uma cópia operacional para `+55 65 99815-0975`;
3. gerar e enviar ao cliente um link de cadastro avulso vinculado ao pedido;
4. vincular automaticamente o cadastro concluído ao pedido correto, sem depender de texto livre, número do pedido digitado pelo cliente ou busca no histórico da conversa.

## Decisões

- O pedido canônico continua sendo a fonte de verdade no Supabase.
- O PapoAI continua sendo a camada de transporte WhatsApp; não reativar Flow legado.
- Confirmação de pedido usa apenas template utilitário aprovado e payload estruturado.
- O envio manual é idempotente por `order_id + message_kind + recipient_kind`.
- `recipient_kind=customer` envia ao telefone do pedido usando o canal de origem quando conhecido; fallback 0975.
- `recipient_kind=ops_0975` envia para `+5565998150975` usando o canal 1018, para evitar tentativa de envio do 0975 para ele próprio.
- O link de cadastro usa token aleatório opaco, uso único, expiração de 24 horas e fica vinculado a `order_id + phone_e164`.
- O formulário público `/cadastro/` aceita `order_token`, resolve o telefone no backend e não expõe `order_id` no link.
- Ao concluir `customer_register`, o backend consome o token em transação lógica: valida telefone, grava `orders.customer_id`, atualiza snapshots quando aplicável e chama a jornada canônica de cadastro/integração existente.
- O vínculo antigo por PapoAI permanece apenas como fallback; o token do pedido é o caminho principal.
- Fora da janela de 24 horas, o link de cadastro não será enviado como texto livre automaticamente. O backend prepara o link e o Admin oferece abrir/copiar o WhatsApp; transporte automático só pode ser adicionado com template utilitário aprovado específico.

## UX no pedido

Adicionar bloco `WhatsApp e cadastro` com:

- status do telefone e do cadastro;
- botão `Enviar pedido no WhatsApp`;
- resultado por destinatário: cliente e cópia 0975;
- botão `Gerar link de cadastro` quando houver telefone;
- botão `Abrir WhatsApp com link` e `Copiar link` após gerar;
- estado `Cadastro pendente`, `Link gerado`, `Cadastro concluído`.

## Segurança

- token armazenado apenas como hash SHA-256;
- token bruto retornado somente no momento da emissão;
- consumo único e expiração em 24h;
- telefone do cadastro precisa coincidir com o telefone vinculado ao token;
- nenhuma URL secreta de webhook PapoAI no GitHub;
- nenhuma mensagem real deve ser enviada durante testes automatizados.
