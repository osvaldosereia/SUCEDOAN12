# Dona Antônia Operations 2.0 — Ponte PapoAI / WhatsApp (DRAFT FINAL DE ANÁLISE)

> Documento de análise. Não implementar ainda.
> Atualização: 2026-09-25.

## Papel
PapoAI será **canal de conversa e automação**, não ERP e não motor de pedido.

PapoAI:
- recebe mensagens;
- IA responde FAQ;
- recebe áudio/imagem/localização;
- transfere para humano;
- envia templates;
- coleta dados;
- pode iniciar um rascunho.

Dona Antônia:
- valida cliente;
- calcula preços;
- monta cesta;
- cria pedido;
- confirma/cancela;
- conversa com Bling.

Bling:
- ERP.

## Estado atual
A ponte antiga está inconsistente:
- `papo-external-agent-v1` foi aposentada e ainda recebe chamadas externas 410;
- `papo-comprar-webhook-v1` depende de estruturas antigas removidas;
- há RPCs históricos PapoAI->Bling que não devem ser reativados.

Portanto não "consertar" o legado. Substituir por uma ponte mínima.

## Contrato interno canônico

Independente do payload real do PapoAI, o adapter deve transformar tudo em poucos eventos:

- `whatsapp.message_received`
- `whatsapp.customer_data_received`
- `whatsapp.order_intent`
- `whatsapp.order_confirmed`
- `whatsapp.order_cancelled`
- `whatsapp.location_received`
- `whatsapp.human_handoff_requested`

Campos comuns:
- external_event_id
- external_message_id
- phone
- occurred_at
- conversation_ref
- payload mínimo
- correlation_id

## Idempotência
Cada evento externo só pode ser aplicado uma vez.

Reenvio do webhook:
- responder sucesso;
- reconhecer event/message id;
- não duplicar pedido/confirmação/localização.

## Confirmação do pedido

### Preferência
Usar uma ação explícita/estruturada no WhatsApp quando o PapoAI/Meta permitir:
**Confirmar pedido**
**Cancelar**

Isso é superior a tentar interpretar qualquer frase livre.

### Texto livre
Aceitar automaticamente somente quando inequívoco e ligado ao último resumo vigente.

Exemplos seguros:
- "confirmo"
- "pode confirmar"
- "pode mandar"

Exemplos ambíguos:
- "acho que sim"
- "pode ser"
- "depois vejo"

Ambíguo -> uma pergunta curta ou humano.

## Versão do resumo
Toda confirmação precisa se referir à versão atual do pedido.

Se o cliente alterou itens depois do resumo:
- versão anterior não pode confirmar a nova composição;
- enviar novo resumo;
- exigir nova confirmação.

Campos:
- order_draft_id
- revision
- summary_hash
- sent_message_id
- confirmed_message_id

## Cancelamento
Antes de separação:
- explícito -> automático.

Depois de separação:
- cria exceção "cancelamento durante operação";
- exige retorno físico/controle.

## Localização
Se o PapoAI repassar mensagem de localização:
- guardar latitude/longitude;
- relacionar conversa -> cliente -> endereço/pedido;
- nunca depender apenas do texto da mensagem;
- manter origem e timestamp.

POC deve confirmar o formato exato fornecido pelo PapoAI/Meta.

## Venda manual
Sempre existir como fallback.

Tela:
**Nova venda WhatsApp**

Pode receber contexto automaticamente:
- telefone;
- cliente;
- endereço;
- conversa;
- última compra.

Atendente monta/revisa e envia resumo.

## Retorno para a conversa
Eventos relevantes:
- resumo para confirmar;
- pedido confirmado;
- alteração;
- cancelamento;
- saiu para entrega;
- entrega concluída.

Fora da janela permitida pela Meta:
- usar template de utilidade aprovado.

## Custo
Evitar mensagens redundantes.
Priorizar:
- um resumo completo;
- uma confirmação;
- status realmente úteis.

Não enviar cada transição interna do ERP ao cliente.

## Segurança
PapoAI jamais recebe credencial Bling.
PapoAI chama somente gateway Dona Antônia com escopo específico.

Ações permitidas externamente:
- enviar dado;
- criar/editar rascunho dentro de regra;
- confirmar/cancelar versão explícita;
- entregar localização.

## POC obrigatório
- payload real dos webhooks da conta PapoAI;
- resposta/ack;
- message_id;
- localização;
- transferência humano;
- template de utilidade;
- confirmação explícita;
- reenvio duplicado;
- conversa fora de 24h;
- falha do nosso endpoint.

## Resultado esperado
Happy path site:
site -> resumo WhatsApp -> cliente confirma -> pedido aprovado sem funcionário.

Happy path WhatsApp:
PapoAI -> rascunho -> resumo -> cliente confirma -> pedido aprovado sem funcionário, salvo quando a intenção exigir revisão.
