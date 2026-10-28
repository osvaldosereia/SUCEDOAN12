# Atendimento: mensagens interativas seguras

## Objetivo

Permitir que o atendente humano envie mensagens nativas de botões de resposta e lista pela inbox, usando a Cloud API oficial da Meta e o mesmo padrão de autorização, janela de atendimento, canário, idempotência, auditoria e histórico já exigido para os outros envios.

## Decisão de arquitetura

Escolha: adicionar um fluxo dedicado e tipado no backend Supabase, com uma Server Action autenticada no Admin. A ação não altera o gateway remoto `admin-whatsapp-ops-v1` nem faz Graph API pelo navegador. A nova Edge Function valida a sessão e o papel do usuário, normaliza o tipo permitido, chama RPCs restritos a `service_role` para enfileirar e reivindicar a mensagem, envia à Meta e registra a aceitação no histórico canônico.

O envio usa `whatsapp_outbox_v1`, mas não reutiliza as RPCs de texto existentes: a leitura atual confirmou que `enqueue_text_v3`, `claim_outbox_v3` e `accept_meta_outbound_v1` rejeitam `message_type <> 'text'` e gravam a mensagem canônica como texto. As RPCs interativas terão nomes e validações próprios para não enfraquecer os contratos existentes.

## Evidência e capacidades Meta

- A coleção oficial Meta Cloud API lista operações separadas para reply button, list, produto único, multiproduto, catálogo, template de catálogo e Flow no endpoint `/{{Version}}/{{Phone-Number-ID}}/messages`: [coleção oficial Meta no Postman](https://www.postman.com/meta/whatsapp-business-platform/request/ne00kt6/send-reply-button).
- A referência do SDK Node.js hospedado pela Meta documenta exemplos estruturados para reply buttons, listas, produto único e listas de produtos. Ela registra até três reply buttons e lista como formato dividido em seções, mas está arquivada; seus exemplos servem como confirmação do formato, não como substituto do validador atual da Meta: [referência interativa do SDK Meta](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/interactive/).
- A coleção oficial Meta também lista pedidos de mensagem de lista e produtos: [Send List Message](https://www.postman.com/meta/whatsapp-business-platform/request/r3ufenw/send-list-message) e [Send Multi-Product Message](https://www.postman.com/meta/whatsapp-business-platform/request/j1w5o6p/send-multi-product-message).
- Nova checagem em 27/10/2026: a coleção oficial WhatsApp Cloud API apresenta mensagens de catálogo e multi-produto separadas, mas não lista request de carrossel no diretório de mensagens. As páginas oficiais da Meta para catálogo/carrossel retornaram HTTP 429. O exemplo oficial de carrossel genérico encontrado é do Instagram (`graph.instagram.com`), não da WhatsApp Cloud API. Um eventual template carrossel WhatsApp também é outro formato e exige contrato de envio e aprovação de template; o schema oficial acessível não foi confirmado. Não inventar payload nem transferir contrato de Instagram/provedor para WhatsApp.
- Catálogo/produtos Meta e Flow são formatos próprios e continuam nos fluxos específicos já existentes. Este composer não converte uma lista comum em catálogo, carrossel ou Flow.

## Escopo

- Mensagem `button`: corpo obrigatório, cabeçalho/rodapé opcionais e 1–3 botões de resposta. Título limitado a 20 caracteres; IDs de resposta únicos, gerados pelo sistema e sem semântica sensível.
- Mensagem `list`: corpo obrigatório, rótulo do botão de lista e uma seção simples com 1–10 opções. Títulos limitados a 24 caracteres; descrição opcional até 72; IDs de resposta gerados pelo sistema. A seção única evita uma interface complexa e deixa o limite global conservador em dez linhas.
- Para ambos os tipos: enviar apenas dentro da janela de atendimento confirmada no servidor, por conta habilitada e homologada, respeitando canário quando ativo. O servidor resolve conta, telefone do cliente e `phone_number_id` a partir da conversa.
- Respostas recebidas: mostrar somente o título higienizado da opção selecionada; nunca exibir `payload`, metadata bruta ou IDs internos na inbox.
- Resultado de envio incerto: manter outbox em revisão, bloquear novas mensagens interativas nessa conversa e instruir o atendente a conferir o histórico. O bloqueio só é removido por reconciliação operacional, não por retry de browser.

## Fora desta fatia

- Envio de produtos/catálogo Meta pelo composer: permanece no fluxo específico de catálogo, com vínculo do Catálogo Meta e `retailer_id` verificados por número.
- Carrossel nativo ou de template: não implementar payload até obter schema oficial Meta acessível, confirmar se o formato se aplica ao caso e validar aprovação, versão Graph e renderização no WABA de homologação. Mensagem de Catálogo/multi-produto continua sendo alternativa nativa distinta.
- Flow de cesta: permanece na ação própria, com fotos obrigatórias e validação das opções.
- Templates de recontato fora da janela de atendimento, automação com IA, configuração do catálogo e gravação de respostas interativas como pedido: não fazem parte desta alteração.
- Aplicar migration, implantar Edge Function, enviar mensagem real ou alterar configuração de Meta em produção.

## Backend e autorização

1. Server Action exige a sessão de administrador atual e encaminha apenas `conversation_id`, tipo/estrutura tipada e chave de idempotência.
2. Edge Function usa `verify_jwt=true` e `withSupabase({ auth: 'user' })`, consulta papel ativo em `admin_users`, valida método/`Content-Length`, limite do corpo, campos desconhecidos, tamanho/quantidade/IDs. Só a Server Action do Admin invoca a função; a UI não chama Meta nem envia destino.
3. RPC de enqueue, executável somente por `service_role`, trava a chave de idempotência; valida conversa, conta ativa, número destino normalizado, janela de 24 horas, `human_send_enabled`, `send_enabled`, `homologated_at`, provedor Meta homologado, canário e ausência de envio incerto. Repetição igual retorna o mesmo outbox; mesma chave com payload diferente retorna conflito.
4. RPC de claim repete as verificações sensíveis em transação, confere provedor/conta/destinatário e move `queued -> claimed` uma única vez. A função devolve somente o destino já resolvido, `phone_number_id`, payload permitido e IDs necessários.
5. Edge Function envia `messaging_product=whatsapp`, `recipient_type=individual`, `to`, `type=interactive` e o objeto interativo allowlisted. O token e versão Graph vêm apenas de secrets do runtime; nenhum valor secreto entra no browser, nos arquivos versionados ou nos logs.
6. RPC de aceitação exige outbox Meta `human_attendance`, `interactive`, estado `claimed` e `wamid` válido. Cria/resolve uma mensagem canônica `whatsapp_messages_v1` tipo `interactive`, registra aceitação, atualiza timestamps da conversa e normaliza status Meta pendente. Os metadados persistidos contêm formato e resumo seguros; não guardam token nem erro bruto.
7. Erro Meta definitivo marca falha com código sanitizado. Timeout/resultado ambíguo deixa indicação de incerteza e não tenta novamente. Logs nunca contêm token, payload integral ou telefone completo.

## Interface simples

- A caixa atual de texto e o envio de mídia continuam separados.
- Um controle recolhido **Mensagem interativa** abre duas escolhas curtas: **Botões** ou **Lista**. O atendente não vê JSON. Em conta que use provedor diferente da Cloud API Meta, o controle mostra por que está indisponível.
- Em **Botões**, o atendente escreve a pergunta e os rótulos das opções. Em **Lista**, escreve a pergunta e cada opção em uma linha; os IDs são gerados silenciosamente.
- Prévia textual mostra corpo, botões ou opções antes do envio. Uma única ação **Enviar mensagem interativa** envia explicitamente; selecionar uma opção no editor nunca envia.
- Erros da Meta são convertidos em mensagens curtas. Resultado incerto trava novos envios interativos até reconciliação operacional; texto continua pelo fluxo existente.
- A UI não habilita envio com base apenas no estado carregado da página; RPCs são a autoridade final.

## Critérios de aceite

- Botões e lista são construídos a partir de tipos permitidos, nunca de JSON arbitrário do usuário.
- Campos inválidos ou acima dos limites são bloqueados no navegador, Server Action, Edge Function e RPC.
- Browser nunca escolhe conta, destinatário, `phone_number_id`, token, versão Graph nem provedor.
- O backend retorna o mesmo resultado para idempotência repetida equivalente e conflito para reutilização divergente.
- A guarda de janela/canário/homologação executa na transação de enqueue e novamente no claim.
- Apenas mensagens reconhecidas pela Meta viram outbound canônico; evento de status prematuro é conciliado pelo aceite.
- `button_reply` e `list_reply` aparecem como “Selecionou: …” com texto higienizado; raw payload não é mostrado.
- Carrossel permanece documentado como indisponível e não tem payload especulativo.
- Verificações permitidas: typecheck, Biome focalizado, build e `git diff --check`. Não criar/rodar testes automatizados segundo a regra vigente.
- Nada é aplicado no Supabase canônico nem enviado à Meta durante esta implementação local.

## Gates para liberação

1. Baseline de staging isolado e migração aplicada nele, nunca na `main` de produção.
2. Inspecionar papéis/grants das RPCs, compilar PL/pgSQL e verificar integração com `whatsapp_outbox_v1`, `whatsapp_messages_v1` e reconciliador de status.
3. Deploy isolado da Edge Function com secrets já existentes no projeto de staging, sem imprimi-los.
4. Homologar um botão e uma lista em destinatário de canário por cada número, confirmar webhook, resposta recebida e status; testar fora da janela e validar bloqueio.
5. Revisar UX com sessão administrativa e só depois executar cutover autorizado.
