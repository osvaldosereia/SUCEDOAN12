# Dona Antônia Operations 2.0 — Ledger e Control Tower: Modelo Mínimo (DRAFT)

> Documento de análise. Não implementar ainda.
> Atualização: 2026-09-25.

## Objetivo
Ter supervisão total sem criar outro ERP nem um lago de logs caro.

## Decisão de simplificação
Não criar dezenas de tabelas de observabilidade.

Modelo mínimo proposto:

### 1. ops_events
Append-only para eventos de negócio relevantes.

Guarda:
- id
- occurred_at
- domain
- event_type
- entity_type
- entity_id
- correlation_id
- actor_type
- actor_id/label
- source_system
- severity
- summary
- payload JSON pequeno
- external_ref
- idempotency_key

### 2. ops_attention
Fila atual "Precisa de você".

Guarda somente problemas abertos:
- id
- type
- entity
- priority
- owner_role
- opened_at
- due_at
- summary
- evidence refs
- recommended_action
- status
- resolved_at
- resolution_ref

Quando resolve, fecha. Histórico permanece no ledger.

### 3. ops_approvals
Somente ações que exigem aprovação.

- proposed_action
- entity
- requested_by
- risk
- expires_at
- evidence
- approved/rejected
- decided_by
- execution_ref

Não criar uma tabela separada para cada automação.

## Automação e runs
Execuções simples viram eventos:
- automation.started
- automation.completed
- automation.failed

Se no futuro houver necessidade de métricas volumosas, criar estrutura especializada somente com evidência de necessidade.

## Dashboard
Cards não fazem chamadas diretas a dez serviços.

Exemplo:
- pedidos com problema;
- integrações degradadas;
- XML para revisar;
- pagamentos pendentes.

Contagens vêm de:
- tabelas de domínio locais;
- ops_attention;
- projeções pequenas.

Bling só é consultado ao abrir detalhes ou em reconciliação/evento.

## IA
A IA nunca recebe o banco inteiro.

Cada botão cria um "context package":
- pedido;
- cliente;
- eventos;
- estado Bling relevante;
- conversa relacionada;
- exceção.

Modelos:
- regra/SQL antes de IA;
- modelo barato para classificação/resumo;
- modelo mais forte para análise complexa.

## Retenção
Ledger é negócio/auditoria, não log de debug.

Não guardar:
- cada request HTTP;
- cada token;
- cada renderização de tela;
- polling vazio.

Logs técnicos podem ter retenção curta no provedor.

## Documentação
- GitHub = decisões/regras/runbooks.
- Ledger = o que aconteceu.
- Bling = ERP.
- Conversas PapoAI = canal.
- OpenAI = análise.

## Continuidade
Ao abrir um novo chat/copiloto:
1. ler PROJECT-MASTER/HANDOFF;
2. consultar estado atual por ferramentas;
3. consultar ledger se necessário;
4. nunca assumir que uma conversa antiga descreve o estado atual.

## Resultado
A Control Tower consegue responder:
- o que precisa de atenção;
- o que foi automático;
- o que uma pessoa fez;
- o que falhou;
- o que está atrasado;
- por que determinado pedido não avançou.

Sem duplicar toda a operação em tabelas paralelas.
