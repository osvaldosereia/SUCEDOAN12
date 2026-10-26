# Rodada 5 — webhook e confirmação de pedidos

Data: 25/10/2026
Branch: `project/whatsapp-atendimento-github-20261025`
Estado: implementação local; nenhuma migration aplicada e nenhum envio realizado.

## Decisão

Criar um webhook novo para a Cloud API, validar HMAC do corpo bruto e mapear cada `phone_number_id` por configuração server-side. Persistir deduplicação, rascunhos, pedidos, itens, eventos e fila de mensagens em `whatsapp_atendimento`, schema próprio e sem acesso de cliente. A confirmação do cliente e a criação do pedido ocorrem numa transação com chave idempotente e snapshot congelado do catálogo.

O webhook registra mensagens para envio na outbox privada. Não há consumidor da outbox nesta rodada. Tokens de Flow incluídos em payloads pendentes são cifrados com chave exclusiva do servidor; as sessões existentes conservam apenas o hash do token. A outbox não é uma autorização para enviar durante desenvolvimento.

O conteúdo final do `response_json` Meta continua dependente da ligação dos rascunhos da Rodada 3 ao endpoint na Rodada 7. Esta rodada aceita um formato versionado estrito e falha fechado nos campos ausentes, canal divergente, sessão expirada, cliente/endereço não confirmado ou produto sem identificadores de integração.

## Passos

1. Criar migration local com grants/restrições privados e índices de idempotência.
2. Implementar domínio para sessão, snapshot e resumo sem preço unitário.
3. Implementar handler GET de verificação e POST assinado para texto inicial, seleção de cesta, resposta de Flow e botões.
4. Gravar somente mensagens pendentes na outbox; sem cliente Graph API ou chamada de envio.
5. Atualizar os contratos e o handoff com formato, variáveis de ambiente e limites da rodada.
6. Conferir `pnpm build` e `git diff --check`; Deno não está disponível para `deno check`. Não executar testes nem migrations.

## Aceite

- Só mensagem Meta assinada e vinculada a canal configurado pode alterar estado.
- Repetir o mesmo evento não cria nova sessão, rascunho, pedido ou item de outbox.
- Apenas botão `confirm` transforma um rascunho válido em pedido.
- O pedido mantém a revisão GitHub, dados de produto, cliente, endereço, pagamento e total aceitos.
- Nenhum pedido lê/escreve tabelas operacionais antigas.
- Migrations permanecem locais e nenhuma mensagem sai do sistema.
