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
- `sent` representa aceite da Graph API, não entrega ou leitura no aparelho. O webhook para status de entrega/leitura ainda não foi implementado.
- A tela administrativa `Mensagens` consulta `GET /outbox` sob a autorização GitHub existente, apresenta contagens e até 50 itens recentes, sem destinatário, conteúdo ou ciphertext. A tela é somente leitura e não expõe reenvio/cancelamento; o status do sender indica apenas a flag do worker, não a validade das credenciais.

## Configuração futura

Antes de uma homologação deliberada, ainda será necessário instalar as migrations aprovadas, implantar as funções, configurar credenciais oficiais de teste para cada canal, confirmar a versão Graph suportada e validar a estrutura no Flow Builder e em aparelho. Antes de ligar a flag, cancelar mensagens pendentes acumuladas enquanto o envio estava desligado e confirmar que os destinatários são os números de teste. A flag só deve ser ligada para essa etapa controlada. Nenhuma dessas operações faz parte do desenvolvimento local.

## Fechamento local

- `pnpm build` compila a aplicação e as entradas TypeScript declaradas, incluindo o worker.
- `git diff --check` não apontou erros.
- Nenhum teste foi criado ou executado. Nenhum segredo foi inserido, migration aplicada, função implantada, Flow publicado, chamada Meta/Bling ou mensagem enviada.

## Limitação operacional

A política no máximo uma vez evita reenvio cego, mas pode perder uma mensagem se o worker parar depois da marcação prévia e antes do `POST`. A outbox não possui tela de reconciliação/reenvio; qualquer recuperação precisa ser manual e confirmar primeiro o estado junto à Meta.
