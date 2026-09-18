# Customer & Marketing OS — Status de Retomada

Atualizado em 18/09/2026.

Status: **PLANEJAMENTO SALVO — PRONTO PARA COMEÇAR CM-0**.

## Leia primeiro

1. `docs/CUSTOMER-MARKETING-OS-ARQUITETURA-MESTRE.md`
2. `docs/CUSTOMER-MARKETING-OS-ETAPA-CM1.md`
3. `docs/ROADMAP-FINAL-DONA-ANTONIA-20-ETAPAS.md`

## Decisões já aprovadas

- produto final é CRM + atendimento + vendas + pós-venda + marketing + Meta + IA;
- arquitetura definitiva nasce desde o início;
- fases ativam capacidades, não reescrevem a arquitetura;
- PapoAI é temporário e isolado por adapter;
- futuro transporte oficial será Meta Cloud API;
- Marketing Brain deve pensar como publicitário;
- Product/Brand Graph é estrutural;
- campanhas devem ser específicas e personalizadas;
- Meta Control Plane conhece capacidades/regras e escolhe o recurso adequado;
- templates devem suportar modo manual, assistido e automático;
- consentimento é ledger por finalidade, não simples booleano;
- Decision Engine pode escolher NO_ACTION;
- IA opera por Action Registry, sem acesso genérico irrestrito;
- autonomia evolui por gates;
- SQL/código primeiro; IA somente onde agrega valor;
- política OpenAI: Luna → Terra → Sol conforme necessidade/custo;
- custos e resultados devem ser medidos;
- nenhuma regra de negócio deve depender de payload específico do PapoAI.

## Baseline importante

No snapshot usado para planejamento:

- 505 clientes;
- 1.814 produtos;
- 340 conversas;
- 98 carrinhos;
- 45 pedidos canônicos;
- 139 pedidos históricos no staging Bling;
- 47/139 históricos vinculados a customer_id naquele momento;
- 13 customer_behavior_events;
- marketing_consents sem evidências positivas registradas;
- 6 tabelas com RLS desativado exigindo revisão cuidadosa.

Os números são dinâmicos. Reconsultar antes de qualquer operação de migração/reconciliação.

## Próxima rodada

**CM-0 — Architecture Lock**

Objetivo:

- auditar o que já existe;
- mapear tabelas/Edge Functions/código/Admin;
- definir contratos;
- evitar duplicações;
- fechar convenções de eventos, IDs, providers, consent, autonomia e auditoria;
- produzir o plano de migrations e implementação da CM-1.1.

Não ativar envio em massa, Meta direta, campanha automática ou ação externa durante CM-0.
