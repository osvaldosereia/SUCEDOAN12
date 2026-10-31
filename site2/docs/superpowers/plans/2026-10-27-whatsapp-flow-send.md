# Envio manual do Flow de cesta no Atendimento

> Plano e contrato da fatia local de envio do Flow a partir de uma conversa. Executar as etapas de validação antes de qualquer liberação real.

## Objetivo

Permitir que um atendente autenticado escolha uma cesta e envie o Flow correspondente pela conta Meta da conversa. O envio abre uma sessão privada ligada ao canal, ao cliente, ao molde e à fotografia imutável do catálogo. A submissão do Flow continua sendo uma intenção separada; não cria pedido nem confirma compra.

## Jornada no Admin

1. Na conversa de `/atendimento`, o atendente escolhe uma das cestas elegíveis e clica **Enviar Flow de cesta**.
2. O Admin mostra a disponibilidade com texto curto. A ação fica indisponível se a sessão não for de equipe ativa, a conversa não tiver E.164 confiável, o canal não for um dos dois números autorizados, a última mensagem recebida estiver fora da janela aplicável, a cesta não estiver ativa, faltar alternativa elegível em qualquer posição ou não existir binding publicado e verificado daquele número.
3. A equipe confirma uma única ação de envio. O navegador envia apenas os UUIDs da conversa, da cesta e da operação idempotente; não recebe token Meta, credencial ou payload privado.
4. O servidor cria a tentativa, abre uma sessão técnica e snapshot do catálogo, valida o vínculo entre tentativa e sessão e chama a Cloud API. O token aleatório do Flow é transitório: persiste somente seu hash no contrato privado da sessão.
5. O histórico da conversa exibe o estado sanitizado (`preparing`, `sending`, `sent`, `failed` ou `needs_review`) e o motivo curto quando houver bloqueio. Esse estado não é recibo de leitura, preenchimento, confirmação de pedido nem status de entrega ao aparelho.
6. Ao concluir, a resposta `nfm_reply` cria uma intenção Flow própria e solicita uma confirmação explícita pelo caminho de intake já definido. Um carrinho nativo de Catálogo continua sendo outro pedido, mesmo na mesma conversa ou imediatamente depois.

## Contrato servidor e estado

### Preparação autenticada

`POST /functions/v1/whatsapp-order-flow-send-v1` usa JWT de usuário. A RPC `whatsapp_order_flow_send_prepare_admin_v1` confere equipe ativa, conversa WhatsApp, conta Meta (`0975`/`1018`), E.164, janela de atendimento, cesta ativa, molde único, pelo menos uma opção ativa e com HTTPS/foto/preço em cada posição e binding do número em estado `PUBLISHED`, verificado e habilitado para envio. Um estado pendente ou ambíguo anterior bloqueia duplicação.

### Sessão e chamada Meta

- A função autenticada invoca server-to-server `whatsapp-flow-session-open-v1` com a chave de serviço apenas no header interno protegido; recebe o token aleatório uma única vez e não o registra.
- `whatsapp_order_flow_send_mark_sending_v1` associa sessão, hash do token, tentativa, canal, destinatário, Flow e cesta e repete validações críticas antes do efeito externo.
- O envio candidato usa `POST https://graph.facebook.com/{version}/{phone_number_id}/messages`, `type=interactive`, `interactive.type=flow`, CTA e `flow_action=data_exchange`.
- A versão Graph vem somente da configuração de servidor e é validada por formato. O App/Access Token é selecionado pelo binding de canal; nenhum valor, payload completo ou resposta bruta da Meta vai para logs/UI.
- Somente um `wamid` validado encerra como `sent`. Resposta HTTP definitiva de rejeição encerra como `failed`. Timeout, 408, 5xx ou 2xx sem `wamid` encerram como `needs_review`; nunca há retry automático da chamada externa.

### Idempotência e recuperação

- A chave de idempotência impede duplo clique/replay da mesma ação. Uma tentativa não resolvida por mais de três minutos é marcada `needs_review`; não se presume que a Meta não entregou.
- `needs_review` bloqueia novo envio da mesma conversa até investigação humana no painel da Meta/histórico da conversa. Não reenviar às cegas: uma segunda abertura pode duplicar o Flow ao cliente.
- A fatia atual não implementa reconciliação automática de estados de entrega. O painel apresenta a tentativa com código seguro; procedimento operacional posterior deve permitir registrar a revisão sem apagar o histórico nem reabrir envio automaticamente.
- O estado `sent` significa somente que a API devolveu um `wamid`, não que a mensagem foi entregue ou lida.

## Segurança e dados

- A UI fala com a Edge Function autenticada; o browser não consulta tabelas privadas nem envia Graph API diretamente.
- O ledger de tentativas fica no schema privado, com RLS e grants fechados. RPC pública definer são explícitas, com `search_path=''` e checagem de função/usuário.
- Selecionar token somente pela conta exata, usando `META_ACCESS_TOKEN_0975` ou `META_ACCESS_TOKEN_1018`; não aceitar fallback global que poderia enviar pelo número com escopo incorreto. Não persistir App Secret, access token, token Flow em claro, corpo criptografado, corpo de erro Meta ou conteúdo pessoal desnecessário. A tentativa guarda IDs de operação, canal, basket, WAMID após sucesso, estado e código de falha allowlisted.
- A abertura usa o snapshot imutável da cesta. Preços e estoque da sessão são recalculados na confirmação de compra conforme o plano de intake; uma sessão técnica expirada não expira a intenção comercial.
- Os dois números têm binding, Flow publicado, versão, disponibilidade de token e endpoint de chave próprios. Nunca inferir que uma publicação em um WABA cobre o outro.

## Evidência auditada no Supabase canônico em 27/10/2026

- Há cinco cestas/moldes ativos de WhatsApp. O catálogo oferecível atual contém 48 produtos distintos; todos têm URL HTTPS de imagem e preço elegível no snapshot consultado.
- Ainda há 21 posições sem nenhuma alternativa elegível: Econômica 2, Mini Completa 4, Pequena Completa 5, Média Completa 5 e Grande Completa 5. O envio bloqueia a cesta inteira quando qualquer posição não puder ser respondida. O dono está atualizando o catálogo; esses itens só ficam disponíveis quando produto e vínculo da posição estiverem ativos para WhatsApp.
- As duas tabelas legadas consultadas para bindings não têm linhas. Ausência nessas tabelas não demonstra que não existe Flow fora do banco; IDs, versões, estado publicado, endpoint e mapeamento correto de cada WABA precisam ser verificados na Meta antes do binding greenfield.
- URLs HTTPS presentes não provam que as imagens respondem, sejam públicas à Meta ou apareçam no componente de escolha publicado. A exigência de foto por alternativa segue sem homologação normativa/visual.

## Evidência oficial e questões ainda abertas

- A coleção oficial Meta Postman lista **Send Published Flow by ID** e usa `POST /{Phone-Number-ID}/messages`: [Meta Postman — Send Published Flow by ID](https://www.postman.com/meta/whatsapp-business-platform/request/1i6xpic/send-published-flow-by-id).
- Os exemplos mantidos pela Meta demonstram ambos os modos: o exemplo de pesquisa envia `flow_action="navigate"` com uma tela inicial declarada; o exemplo de webhook envia `flow_action="data_exchange"` sem `flow_action_payload`, usando `flow_id`, `flow_message_version`, `flow_token` e `flow_cta`. O mesmo exemplo reconhece respostas `interactive.type="nfm_reply"`: [Meta — exemplo oficial de pesquisa](https://github.com/WhatsApp/WhatsApp-Flows-Tools/blob/main/articles/creating-surveys/main.py) e [Meta — exemplo oficial de webhook e Flow](https://github.com/WhatsApp/WhatsApp-Flows-Tools/blob/main/examples/webhook/nodejs/flows-webhook/server.js).
- Essa evidência sustenta o envelope de envio candidato com `data_exchange`; ela não valida o Flow JSON da cesta, os componentes dinâmicos, imagens por alternativa, contrato de tela, nem versão implantada em cada WABA. A referência normativa de componentes respondeu HTTP 429 nesta pesquisa. JSON, Data API version, endpoint e fotos precisam passar pelo Flow Validator da Meta e por conferência nos dois números antes de publicar ou enviar.
- A mesma documentação oficial de componentes não confirmou a propriedade de imagem em cada alternativa; nenhuma cópia de terceiros será tratada como regra. O contrato candidato de imagem permanece bloqueado até Validator oficial e conferência real nos dois números.
- Uma mensagem interativa de Flow fora da janela de atendimento não será tentada neste MVP. Retomar contato exige nova mensagem do cliente ou template aprovado compatível, a ser pesquisado e homologado separadamente.

## Estado da implementação e gates

**Implementado somente localmente:** migration candidata `20261027211816_whatsapp_order_flow_send_v1.sql`, função Edge autenticada `whatsapp-order-flow-send-v1`, helper server-only, ação de servidor e CTA no Atendimento, histórico de estado sanitizado e guardas de basket/canal/janela/binding. A migration cria tabela de tentativas privada e RPCs; ainda depende da foundation de intake e sessões.

**Não concluído para produção:** o `deno check --frozen` da nova função passou; o parser PostgreSQL aceitou as 22 instruções externas da migration, mas não compilou os corpos PL/pgSQL nem resolveu dependências contra o schema canônico. Ainda é necessário validar SQL/PLpgSQL numa baseline isolada; revisar grants, referências, locks, idempotência e chamadas internas; concluir e aprovar Flow JSON; confirmar imagem por alternativa; criar e verificar binding publicado distinto para cada WABA; validar tokens/Graph version pelo health check sem expor segredos; testar visualmente com números de homologação; só então implantar migration/função e habilitar envio gradual.

Validação local desta revisão: `pnpm typecheck`, Biome focado, `deno check --frozen` da Edge Function nova, parser PostgreSQL de topo (22 instruções) e `git diff --check` passaram. Nenhum teste automatizado foi criado/executado.

Até os gates de produção: nenhuma migration foi aplicada, nenhuma Edge Function implantada, nenhum Flow publicado, nenhuma mensagem enviada, nenhum segredo consultado e nenhum pedido criado por essa ação.
