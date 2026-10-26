# Rodada 7 — consumidor local da outbox

Data: 25/10/2026
Branch: `project/whatsapp-atendimento-github-20261025`
Estado: código local; envio e disparo desligados; sem deploy ou chamadas externas.

## Escopo

Concluir localmente a entrega do resumo e das mensagens de operação que já são produzidas, mantendo o canal de envio fechado durante o desenvolvimento. Implementação nova no projeto WhatsApp Atendimento; nenhum código ou esquema do Vitrine Admin foi reutilizado.

## Contrato

- `whatsapp-outbox-worker` processa lotes de até cinco linhas pendentes e só aceita `POST` com bearer interno de pelo menos 32 caracteres. Reivindica cada linha imediatamente antes de processá-la, deixando as demais pendentes caso a execução seja interrompida. Cada tentativa Meta tem timeout de 12 segundos e o chamador interno aguarda até 90 segundos para cobrir o lote sequencial. A configuração Supabase usa `verify_jwt=false`, então a autorização é feita integralmente pelo segredo máquina-a-máquina; não foi criado login nem senha de usuário.
- Tanto a função como os chamadores exigem `META_OUTBOX_SENDER_ENABLED=true`. O `.env.example` conserva `false`. Tokens de acesso Meta, IDs dos telefones/Flows, versão Graph, chave AES-GCM, conexão Postgres e segredo de dispatch são configurações server-side.
- Webhook e separação acordam a função com `EdgeRuntime.waitUntil` somente após a transação produtora concluir. Um disparo pode encadear no máximo vinte invocações (cem mensagens), como limite de trabalho por evento; eventual fila restante espera o próximo evento. A documentação atual do Supabase descreve uma cota compartilhada de pelo menos 5.000 chamadas entre funções por minuto, então o limite local evita drain ilimitado, não é exigência da plataforma ([documentação](https://supabase.com/docs/guides/functions/recursive-functions)). Não existe cron, polling contínuo ou envio ao carregar a aplicação.
- O worker valida o tipo de mensagem, canal, destinatário e consistência do Flow ID; decifra a mensagem AES-GCM apenas em memória e não registra conteúdo ou dados do cliente. O `to` enviado à Cloud API usa somente os dígitos do telefone E.164.
- Para não duplicar uma mensagem que a Meta talvez já tenha aceitado, a linha deixa `pending` e fica `failed/delivery_unknown` antes do `POST`. Apenas HTTP 2xx com `messages[0].id` a marca `sent`. Não há retry automático. Erros de entrega ficam com códigos curtos; timeout, queda da função ou resposta incompleta exigem reconciliação manual antes de qualquer reenvio.
- `sent` representa aceite da Graph API, não entrega ou leitura no aparelho. O `wamid` e os estados subsequentes ficam armazenados somente no schema privado. O webhook processa `sent`, `delivered`, `read` e `failed`, escolhe o estado pela cronologia do timestamp (callbacks Meta podem chegar fora de ordem) e guarda apenas o código numérico de falha. Callbacks que precedem a gravação do aceite ficam pendentes por até 30 minutos e são reaplicados após o worker registrar o ID. Um callback só de status não acorda o worker.
- A tela administrativa `Mensagens` consulta `GET /outbox` sob a autorização GitHub existente, apresenta contagens e até 50 itens recentes, sem `wamid`, destinatário, conteúdo ou ciphertext. Exibe estado Meta/timestamp e código numérico quando houver falha. A tela é somente leitura e não expõe reenvio/cancelamento; o status do sender indica apenas a flag do worker, não a validade das credenciais.

## Configuração futura

Antes de uma homologação deliberada, ainda será necessário instalar as migrations aprovadas, implantar as funções, configurar credenciais oficiais de teste para cada canal, confirmar a versão Graph suportada e validar a estrutura no Flow Builder e em aparelho. Antes de ligar a flag, cancelar mensagens pendentes acumuladas enquanto o envio estava desligado e confirmar que os destinatários são os números de teste. A flag só deve ser ligada para essa etapa controlada. Nenhuma dessas operações faz parte do desenvolvimento local.

## Fechamento local

- `pnpm build` executa `tsc --noEmit` na aplicação e nas quatro entradas de Edge Functions listadas em `tsconfig.json` (Admin API, Flow runtime, checkout webhook e outbox worker), incluindo imports locais, e então gera o bundle Vite. O Deno CLI não está instalado para a checagem específica de Deno; a documentação Supabase esclarece que o CLI usa o Edge Runtime próprio e que o Deno separado serve para LSP e ferramentas próprias: https://supabase.com/docs/guides/functions/development-environment.
- `git diff --check` não apontou erros.
- Nenhum teste foi criado ou executado. Nenhum segredo foi inserido, migration aplicada, função implantada, Flow publicado, chamada Meta/Bling ou mensagem enviada.

## Limitação operacional

A política no máximo uma vez evita reenvio cego, mas pode perder uma mensagem se o worker parar depois da marcação prévia e antes do `POST`. A outbox não possui tela de reconciliação/reenvio; qualquer recuperação precisa ser manual e confirmar primeiro o estado junto à Meta.

## Atualização local — status de entrega Meta (26/10/2026)

A migration local `20261026004500_whatsapp_checkout.sql` agora inclui `provider_message_id`, status/timestamp/código numérico, uma constraint para o formato do ID e a fila temporária privada para callbacks que chegam antes do `markSent`. O worker grava o ID da resposta 2xx e reaplica os callbacks pendentes de forma transacional sob advisory lock por canal/ID. A regra de projeção usa timestamp Meta e, em igualdade de segundo, prioriza evidência positiva mais forte: `read > delivered > failed > sent`. Não guardar texto de erro recebido da Meta.

O webhook autenticado processa status e mensagens inbound separadamente; callback de status não acorda o sender. `GET /outbox` e a UI mostram status e timestamp sem revelar ID do provedor, telefone, payload ou ciphertext. O worker continua condicionado a `META_OUTBOX_SENDER_ENABLED=true`; o `.env.example` mantém `false` e nenhum envio foi feito.

Nesta atualização, `pnpm build` e `git diff --check` foram verificados. Deno CLI indisponível; nenhum teste automatizado criado/executado, migration aplicada, função implantada, chamada à Graph/Meta ou mensagem enviada. A referência oficial da Meta afirma que callbacks podem chegar fora de ordem e usa timestamp para ordenar: https://www.postman.com/meta/whatsapp-business-platform/request/rgtfq23/message-status-update-notifications.

## Atualização — saldo atual e canário autorizado (26/10/2026)

- **Nota intermediária supersedida pela decisão posterior do usuário:** estoque operacional do novo projeto fica no cadastro versionado do GitHub (`products.json` schema 4), e não é consultado nem mantido no Supabase. O Flow runtime usa a revisão fixada no GitHub; a confirmação faz uma única baixa idempotente nesse catálogo. Saldo zero/negativo não é oferecido no Flow, e saldo negativo depois da confirmação não bloqueia a venda fiscal Bling. A especificação vigente está em `IMPLEMENTATION-PLAN-LUNA-MAX.md` e no fechamento mais recente do `HANDOFF.md`.
- Foi executado o canário solicitado pelo usuário pelo painel existente, sem alterar o código do Vitrine: uma lista interativa de cinco tamanhos/preços enviada do 1018 para o final 8360. A Meta aceitou a mensagem às 03:27 UTC; aceite não confirma entrega/leitura. Não houve publicação de Flow, envio pelo worker novo ou chamada Bling.
