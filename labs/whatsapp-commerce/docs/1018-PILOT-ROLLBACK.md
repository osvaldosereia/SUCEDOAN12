# Plano de ativação reversível — somente WhatsApp 1018

**Status: planejamento e código de laboratório, SEM ativação no número real.**
O telefone 0975 não pode ser afetado nem participar de experimentos.

## Informações verificadas sem alterações (2026-10-13)

- Ambos os canais 0975 e 1018 estão ativos no `whatsapp_accounts`.
- Em `whatsapp_channel_runtime_v1`, os dois canais têm `inbound_provider=meta`, `outbound_provider=meta`, captura e envio ativos, ANA habilitada. Portanto não trocar o callback da Meta às cegas.
- Existem vínculos `ops2_papoai_channel_bindings_v1` ativos para ambos os canais, enquanto um documento histórico desaconselha o transporte Meta/PapoAI assimétrico. Essas fontes refletem épocas diferentes. É obrigatório verificar a propriedade efetiva de cada envio ANTES de ativar um piloto.
- `ops2_meta_whatsapp_flow_bindings_v1` está vazio; `ops2_meta_whatsapp_senders_v1` não certifica o 1018 como habilitado. Isso não comprova ausência de outros recursos na conta Meta.
- A experiência mobile ainda teve a tela "undefined" relatada pelo usuário. Corrigir e validar a prévia inteira antes de convidar qualquer cliente.

## Implantação futura — passos obrigatórios e reversíveis

1. **Inventário e snapshot do estado atual:** registrar configuração de webhooks Meta, provedores, regras da ANA, PapoAI, etiquetas, template IDs e versões, parâmetros de runtime, e a origem de cada envio. Fotografar o estado *antes* da alteração, sem registrar tokens em arquivos/commits.
2. **Observação sem respostas:** conectar apenas leitura de eventos do 1018 ao laboratório, via roteador existente e sem trocar assinaturas. A observação não envia mensagens, não reclassifica templates, não confirma pedidos e não consome estoque.
3. **Prova de exclusividade da resposta:** garantir que uma conversa inscrita no piloto recebe resposta por um único sistema. Se PapoAI, ANA, webhook ou fila legada ainda puderem responder em paralelo, o piloto não deve começar.
4. **Preparação de volta:** ensaiar o retorno ao fluxo antigo com as mesmas configurações originais. Testar ativação e desativação sem ter que editar código, criar nova publicação ou restaurar o banco inteiro.
5. **Piloto controlado:** somente no 1018, começando com telefones de teste explicitamente permitidos, sem migrar conversas já existentes sem consentimento. Depois, habilitar porcentagem limitada de novas conversas mediante autorização explícita.
6. **Observabilidade:** medir tempo de resposta, duplicação, erros de cotação, erros de estoque, solicitações de atendimento, filas, e se os eventos do 1018 continuam no Vitrine/Admin.
7. **Gatilho de reversão:** erro de envio, mensagens duplicadas, incompatibilidade de Flow ou qualquer reclamação de cliente exigem desligar o piloto e restabelecer o roteamento anterior. O recurso será projetado para ter uma chave por canal; a confirmação do retorno deverá ser feita com mensagem de teste.
8. **Pós-reversão:** impedir a saída de mensagens que ainda estiverem na fila do laboratório, manter a trilha de auditoria e enviar as conversas ainda não encerradas ao atendimento anterior. Não reenviar mensagens sem deduplicação.

## Modos da chave

| Modo | Respostas atuais | Novo laboratório |
| --- | --- | --- |
| `off` | Mantidas | Inativo |
| `shadow` | Mantidas | Somente leitura; não responde |
| `pilot` | Mantidas para demais contatos | Candidatos limitados por lista permitida; só após prova de exclusividade |
| `expanded` | Mantidas para não selecionados | Percentual controlado de novos contatos; exige nova autorização |

**Nota de segurança:** `src/rollout-1018.mjs` faz somente decisões de roteamento. Seu campo `sendAllowed=false` sempre; não existe endpoint de envio ou capacidade de ativação nesse módulo. Um futuro roteador/dispatcher transacional com bloqueio de saída, exclusividade por contato e rollback durável será obrigatório antes de conectar o canal real.

## O que NÃO fazer na primeira ativação

- Não remover ou substituir assinaturas/webhooks Meta nem transferir o número 1018 de provedor.
- Não eliminar regras, templates ou automações atuais para "abrir espaço".
- Não alterar `whatsapp_channel_runtime_v1` diretamente a partir do laboratório.
- Não habilitar respostas simultâneas do PapoAI e do novo atendimento.
- Não abrir o piloto para todos os clientes nem para o 0975.
- Não confundir retorno do código com restauração efetiva das configurações do provedor.

## Condições para autorizar ativação

Tudo deve ser verdadeiro: screenshot mobile corrigida, cotação oficial homologada com valores ocultos, Flow aprovado/validado na Meta, templates aprovados se necessários, prestador efetivo do 1018 confirmado, exclusividade de envio demonstrada, snapshot original completo, ensaio de rollback aprovado, monitoramento da operação, e autorização explícita para ativação real do 1018.

**Até lá: produção intacta.**
