# Admin V3 + Chat Comprar Final Design

**Data:** 2026-09-14

## Objetivo

Finalizar o Atendimento do Admin V3 como configurador exclusivo do Chat Comprar da Dona Antônia, sem controlar WhatsApp nativo, Meta Flow, templates Meta, PapoAI ou atendimento humano.

## Decisões

1. `ame-mais/` é projeto separado e não aparece no menu do Admin V3.
2. A página `admin-v3/atendimento.html` terá um único controlador JavaScript e três áreas: Fluxo do Chat, Respostas Inteligentes e Testar.
3. O Chat Comprar continua responsável por cestas, produtos, ofertas, carrinho e checkout. Interações estruturadas não usam IA.
4. Texto livre é roteado no próprio `shopping-chat-v1`: regras determinísticas primeiro; regras configuradas no Admin em seguida; IA somente quando necessária para escolher uma regra permitida.
5. O Chat Comprar não lê `automation_config`, não cria `ai_jobs` de conversa, não usa `conversation-worker-v3`, não gera `outbound_jobs` WhatsApp e não cria `human_handoffs`.
6. Fallback desconhecido mostra opções do próprio chat. Nunca encaminha para humano.
7. Modos permitidos no editor: `text`, `reply_buttons`, `cta_url`, `baskets`, `offers`, `products`, `product_lookup`, `checkout` e `silence`.
8. Produtos e cestas do Chat Comprar dependem do estado comercial do site (`physically_verified`, `is_active`, estoque), não de `is_whatsapp_active`.
9. Áudio e imagem não bloqueiam a ativação. Enquanto não houver processamento próprio homologado, o lançamento principal usa texto + interações estruturadas.
10. A IA usa OpenAI somente no backend, nunca expõe chave ao navegador, e recebe apenas regras candidatas compactas.

## Fluxo de mensagem

`send_text` salva a mensagem do cliente, tenta intenção determinística, tenta correspondência direta das regras publicadas, opcionalmente usa IA para classificar entre regras permitidas e devolve `{reply, ui}` diretamente ao Chat Comprar. A resposta é persistida como mensagem outbound da superfície `shopping_room`, sem transporte WhatsApp.

## Admin

- **Fluxo do Chat:** reutiliza `shopping_chat_helper_config` via `admin-chat-menu-v1`.
- **Respostas Inteligentes:** reutiliza `service_simple_rules` e `service_simple_runtime_config`, mas restringe os modos ao Chat Comprar.
- **Testar:** ação `simulate` no backend administrativo devolve intenção, regra, uso ou não de IA e UI prevista sem criar pedido, mensagem ou job.

## Segurança e custo

Endpoints públicos continuam protegidos por token aleatório de sessão + CORS. Endpoints administrativos continuam autenticados por JWT do Admin. A IA não participa de cliques em chips, botões, carrosséis, carrinho ou checkout. O caminho determinístico é sempre preferido.

## Critérios de aceite

- Abrir Atendimento não trava e todas as três áreas funcionam.
- Ame Mais não aparece no Admin V3.
- Nenhuma opção de atendimento humano/Meta/WhatsApp aparece no editor.
- `oi`, cestas, ofertas, categorias, produtos, pagamento, entrega e checkout funcionam sem worker WhatsApp.
- Pergunta livre pode ser classificada pela IA quando necessário.
- Pergunta desconhecida recebe menu/chips, nunca handoff.
- Testes de contrato e sintaxe passam antes do merge.
