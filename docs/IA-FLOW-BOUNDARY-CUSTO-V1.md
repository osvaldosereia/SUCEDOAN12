# IA + WhatsApp Flow — fronteira transacional e estratégia de custo V1

Data: 09/09/2026

Status: **implementado em branch isolada `ai-flow-boundary-v1`; não ativado em produção**.

## Regra central

**A IA atende; o WhatsApp Flow monta, personaliza e fecha o pedido.**

A IA pode:
- conversar com naturalidade;
- responder dúvidas gerais e institucionais;
- consultar produto, preço e estoque no banco próprio conferido;
- explicar e recomendar;
- entender áudio e imagem;
- detectar intenção de compra.

A IA não deve montar carrinho, alterar quantidade, substituir item, personalizar cesta nem confirmar encomenda em conversa livre quando o Flow estiver disponível.

Quando a intenção se torna transacional, o atendimento abre o Flow.

## Exemplos oficiais

- `Vocês têm leite?` → consulta Supabase e responde; **não abre Flow**.
- `Quanto custa o leite Piracanjuba?` → consulta Supabase e responde; **não abre Flow**.
- `Qual leite é melhor para fazer bolo?` → IA pode orientar e usar produtos reais quando necessário; **não abre Flow enquanto for consulta**.
- `Quero 2 leites` → **abre Flow**.
- `Me manda 3 arroz` → **abre Flow**.
- `Quanto custa a cesta básica?` → responde as cestas/valores; **não abre Flow**.
- `Quero uma cesta` → **abre Flow**.
- `Quero tirar o açúcar e colocar mais arroz na cesta` → **abre Flow**.
- `Quero finalizar` → **abre/retoma Flow**.

O cliente não precisa ouvir a palavra técnica “Flow”. A fala deve ser natural, por exemplo: `Claro. Vou abrir o pedido para você escolher os produtos e quantidades.`

## Arquitetura de custo

Ordem de decisão:

1. **fast path determinístico** — saudação simples, disponibilidade/preço simples, cesta informativa e intenção transacional explícita;
2. **consulta direta ao Supabase** quando a resposta é preço/estoque/cesta;
3. **IA somente quando interpretação, orientação, recomendação ou conversa livre agregarem valor**;
4. **Flow** para qualquer alteração transacional;
5. **humano** quando houver exceção, reclamação sensível, regra conflitante ou indisponibilidade do Flow.

### Contexto máximo enviado à IA V4

Não enviar catálogo, carrinho e manual completos.

Contexto compacto:
- mensagem atual: até 1.200 caracteres;
- até 4 mensagens anteriores relevantes;
- perfil mínimo do cliente, sem CPF/endereço bruto;
- até 4 produtos recorrentes do histórico comercial;
- conhecimento: máximo 4 itens;
- guidance: máximo 5 itens;
- procedimentos: máximo 2 itens;
- sem `raw_event`, sem catálogo inteiro, sem histórico inteiro, sem carrinho operacional.

O `get_service_intelligence_bundle_v2` é usado somente quando o assunto parece exigir política da empresa ou contexto de cestas; o resultado é aparado antes de ser enviado ao modelo.

## Modelo

V4 usa configuração própria:

- `OPENAI_CONVERSATION_MODEL_V4`, fallback `gpt-5.6-luna`;
- `OPENAI_REASONING_EFFORT_V4`, fallback `low`;
- `store=false`;
- saída estruturada por JSON Schema;
- `max_output_tokens=700`, que é teto e não meta de consumo.

A intenção é usar Luna/low como padrão para alto volume e reservar qualquer escalonamento futuro de raciocínio para casos em que métricas demonstrem necessidade.

## Memória

A memória enviada a cada chamada deve ser útil e pequena:
- nome;
- preferência de resposta existente;
- quantidade/data de pedidos;
- padrão de mídia de entrada;
- até 4 produtos recorrentes com frequência e última compra.

Não enviar histórico completo do cliente em toda chamada.

## Fronteira com o Flow

A implementação desta branch **não modifica**:
- `whatsapp/flows/**`;
- `supabase/functions/whatsapp-flow-data-exchange-v1/**`;
- scripts `build-flow-*`;
- JSON/telas/assets do Flow.

Ela somente consome a função existente `queue_whatsapp_flow_offer_v1(...)` como interface pública para abrir a experiência transacional.

Isso permite desenvolvimento paralelo com a tarefa que está finalizando o Flow.

## Componentes implementados

- `supabase/functions/conversation-worker-v4/index.ts`
  - novo worker, sem substituir o V3;
  - fast paths determinísticos;
  - contexto compacto;
  - consulta de memória comercial resumida;
  - GPT-5.6 Luna/low por padrão;
  - conversa geral segura;
  - transação sempre delegada ao Flow.

- `supabase/migrations/20260909194200_ai_flow_boundary_routing_v1.sql`
  - pré-roteador transacional barato;
  - perguntas informativas não abrem Flow;
  - pedidos explícitos abrem Flow sem gastar IA;
  - fail-open para IA/humano se o Flow estiver indisponível.

- `supabase/functions/conversation-worker-v4/policy.test.ts`
  - regressão de fronteira informação × transação.

- `.github/workflows/test-conversation-worker-v4.yml`
  - `deno check`;
  - testes da política;
  - guard que falha se esta linha de trabalho tocar arquivos de implementação do Flow.

## Ativação futura

A ativação deve ocorrer somente depois que a tarefa paralela concluir o Flow e registrar qual definição está pronta para clientes.

Sequência segura:
1. CI V4 verde;
2. Flow concluído/homologado pela tarefa paralela;
3. rebase/merge da branch sem tocar arquivos do Flow;
4. aplicar migration da fronteira transacional;
5. deploy do `conversation-worker-v4`;
6. trocar dispatcher de V3 para V4 em gate controlado;
7. canary/testes reais;
8. medir tokens por chamada, taxa de abertura do Flow, perguntas resolvidas sem IA e handoffs;
9. só então ampliar rollout.

Até essa ativação, produção continua no V3 e a outra tarefa pode evoluir o Flow sem interferência desta branch.
