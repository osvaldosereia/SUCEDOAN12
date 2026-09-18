# Customer & Marketing OS — Status de Retomada

Atualizado em 18/09/2026.

Status: **CM-1.1 EM EXECUÇÃO — BOUNDARY SEGURO IMPLANTADO**.

## Leia primeiro

1. `docs/CUSTOMER-MARKETING-OS-ARQUITETURA-MESTRE.md`
2. `docs/CUSTOMER-MARKETING-OS-CM0-ARCHITECTURE-LOCK.md`
3. `docs/CUSTOMER-MARKETING-OS-ETAPA-CM1.md`
4. `docs/CUSTOMER-MARKETING-OS-CM1-1-SECURITY-PLAN.md`
5. `docs/CUSTOMER-MARKETING-OS-CM1-1-PROGRESS.md`
6. `docs/CUSTOMER-MARKETING-OS-GOVERNANCA-E-AUTONOMIA.md`
7. `docs/ROADMAP-FINAL-DONA-ANTONIA-20-ETAPAS.md`

## Governança

- o proprietário delegou ao assistente as decisões técnicas e de implantação deste projeto;
- não é necessário pedir aprovação para cada decisão técnica rotineira;
- limites de segurança, gastos externos relevantes, ações irreversíveis e confirmações obrigatórias de provedores continuam respeitados;
- referência: `docs/CUSTOMER-MARKETING-OS-GOVERNANCA-E-AUTONOMIA.md`.

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

## CM-0 concluída

A auditoria confirmou que o projeto já possui omnichannel core, CRM unificado, action registry, workflow engine, marketing foundation, commercial decision layer, purchase intelligence, segmentos e fundações WhatsApp/Meta. Eles serão consolidados, não duplicados.

Foi detectado como prioridade de segurança que o Admin atual possui endpoints públicos `verify_jwt=false`; novas superfícies Customer/Marketing/Meta sensíveis nascerão autenticadas.

## CM-1.1 em execução

Já foi implantado o boundary autenticado de Customer OS, a ação `customer_360`, o bootstrap de sessão por PIN/Auth, o client autenticado e o teste contratual. A nova UI permanece desligada até homologação.

Pendente nesta rodada: decisão explícita de policy para habilitar RLS nas 6 tabelas hoje sem RLS e homologação do fluxo de sessão.

Não foi ativado envio em massa, Meta direta ou campanha automática.
