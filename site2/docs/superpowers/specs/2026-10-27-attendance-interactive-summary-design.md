# Atendimento: resumo seguro de respostas interativas

## Objetivo

Na conversa do Admin, identificar o resultado de uma seleção por lista e o recebimento de uma resposta de Flow sem expor payload técnico. Isso ajuda a pessoa que atende a entender a conversa enquanto a área de pedidos continua mostrando cada intenção Flow/Catálogo separadamente.

## Situação atual e evidências

- A RPC `public.ops2_admin_attendance_conversation_v1` retorna `metadata` por mensagem, mas `src/lib/supabase/admin-attendance.ts` hoje projeta somente `id`, direção, tipo, `text_body`, status e horário.
- Consulta somente estrutural ao Supabase canônico `ssbesxgaijknwsjbsbcz`, limitada a mensagens inbound dos últimos 30 dias, encontrou `metadata.interactive` com `type=list_reply` e `type=nfm_reply`. Os campos de `list_reply` são `id`, `title`, `description`; os de `nfm_reply` são `name`, `body`, `response_json`. Foram consultados apenas nomes de campos/tipos; nenhum texto de conversa, escolha, cadastro ou pedido foi lido.
- A definição remota da RPC `public.ops2_admin_attendance_queue_v1` seleciona `lm.text_body as last_message_text` sem condicionar pelo tipo. O adapter server-only passava esse conteúdo ao componente de fila, cuja função de preview priorizava o texto antes do tipo. Portanto a mesma resposta estruturada podia aparecer na lista antes de abrir a bolha.
- `admin-whatsapp-ops-v1` está ativa v39 e importa código fixado no commit `13d10dfcaa925340b0ce17011498cb6a502572fa` do GitHub. A allowlist dessa versão não tem envio interativo genérico. Esta especificação não adiciona nem simula esse envio.
- A coleção oficial da Meta documenta a rota `/{{Phone-Number-ID}}/messages` e mantém exemplos distintos para botão, lista, produtos, catálogo e Flow: [Messages](https://www.postman.com/meta/whatsapp-business-platform/folder/o48mro7/messages). O request de template interativo distingue mensagens `type=template` com botões aprovados: [Send Message Template Interactive](https://www.postman.com/meta/whatsapp-business-platform/request/lwtlz1k/send-message-template-interactive).

## Abordagens consideradas

1. Exibir `metadata`/`response_json` diretamente. Rejeitada: pode revelar cadastro, endereço, escolhas e estrutura interna do pedido.
2. Filtrar apenas a bolha de conversa e manter preview da fila sem filtro. Rejeitada: deixa a prévia fora da conversa como caminho alternativo para vazar o mesmo texto.
3. Projetar no servidor resumos permitidos (`Selecionou: <title>` e `Resposta do Flow recebida`), mascarar texto de eventos estruturados na fila, e manter payload oculto. Escolhida: melhora leitura sem enviar conteúdo sensível à UI.

## Decisões fechadas

1. `list_reply` pode renderizar apenas o campo `title`, removendo caracteres Unicode de controle/formatação (`Cc`/`Cf`) e limitando em 160 caracteres. Não renderizar `id` ou `description`.
2. `nfm_reply` renderiza o texto fixo “Resposta do Flow recebida”. Não renderizar `name`, `body` nem `response_json`; suprimir também `text_body` dessa mensagem.
3. Para tipos estruturados `interactive`, `button` e `order`, não renderizar `text_body` como texto livre. Em `order`, a bolha usa o rótulo de Catálogo já existente; os itens e totais ficam na seção de intenção/pedido.
4. A fila de conversas projeta texto vazio/sentinel para `interactive`, `button` e `order` antes de passar props ao componente. A prévia decide pelo tipo primeiro: pedido de Catálogo ou resposta/mensagem interativa recebe rótulo fixo e não lê texto bruto.
5. Metadados ausentes, malformados ou com tipo desconhecido seguem no rótulo genérico existente; o adapter não lança erro nem interpreta JSON livre.
6. O adapter retorna somente `interactiveSummary` escalar para bolhas; o objeto `metadata` nunca é passado à UI.
7. Eventos Flow e Catálogo continuam representados por intenções/pedidos próprios na área lateral. Essa área e a regra de pedidos separados não mudam.
8. Nenhum endpoint de envio, migration, Edge Function ou conexão remota é alterado nesta fatia.

## Critérios de aceite

- Uma resposta inbound de lista sem `text_body` aparece como “Selecionou: <title>”.
- Uma resposta NFM/Flow aparece como “Resposta do Flow recebida” e não exibe texto bruto ou JSON.
- Prévia da fila e bolha de conversa não exibem `text_body` de respostas interativas, botões ou evento de pedido Catálogo.
- Caracteres de controle bidi/formatação no título não alteram a aparência do rótulo.
- Uma interação desconhecida ou inválida conserva o rótulo de tipo existente.
- A resposta Flow continua associada à intenção independente em “Pedidos pelo WhatsApp”; pedidos de Catálogo não são mesclados.
- Typecheck e lint/formatação focados passam. Nenhum teste automatizado, mensagem real ou escrita remota é executado.
