# Customer & Marketing OS — CM-1 — Estratégia de Implantação

Atualizado em 18/09/2026.

Status: **PRONTO PARA INICIAR**.

CM-1 corresponde à “Etapa 1” do novo subprojeto Customer/Marketing/WhatsApp OS. Não confundir com a Etapa 1 do roadmap geral em 20 etapas, que já foi concluída anteriormente.

## Objetivo da CM-1

Colocar em produção uma fundação operacional que já gere valor e, ao mesmo tempo, capture desde o primeiro dia os dados necessários para:

- substituir futuramente o PapoAI;
- operar WhatsApp oficial via Meta;
- atendimento autônomo;
- pós-venda;
- CRM;
- marketing personalizado;
- campanhas;
- criação automática de templates;
- criação de criativos;
- journeys;
- Next Best Action;
- autonomia progressiva.

Ao terminar CM-1, o sistema ainda pode usar o PapoAI como transporte, mas **o cérebro passa a ser nosso**.

## Princípio da CM-1

CM-1 não é um MVP descartável.

Tudo deve usar os contratos definitivos descritos em:

`docs/CUSTOMER-MARKETING-OS-ARQUITETURA-MESTRE.md`.

## Rodada CM-0 — Architecture Lock

Objetivo: congelar contratos antes de ampliar código.

Definir e documentar os contratos para:

- Customer;
- Identity;
- Channel;
- Conversation;
- Message;
- Event;
- Consent;
- Product;
- Brand;
- Product Relation;
- Segment;
- Strategy;
- Opportunity;
- Decision;
- Action;
- Journey;
- Campaign;
- Template;
- Creative;
- Meta Capability;
- Meta Policy;
- Outcome;
- Attribution;
- AI Execution.

Entregas:

- mapa de tabelas existentes que serão reaproveitadas;
- mapa de redundâncias a evitar;
- contratos de ID;
- convenção de eventos;
- convenção de source/provider;
- convenção de idempotência;
- convenção de autonomia;
- convenção de auditoria;
- diagrama de dependências.

Critério de saída: nenhuma rodada posterior precisa inventar uma entidade central nova sem atualizar conscientemente a arquitetura mestre.

## Rodada CM-1.1 — Segurança e fundação

Objetivos:

- revisar as tabelas com RLS desativado;
- definir policies sem quebrar integrações;
- revisar RBAC;
- validar secrets;
- validar acesso server-only;
- consolidar fonte de verdade.

Reaproveitar prioritariamente:

- customers;
- customer_phones;
- customer_addresses;
- conversations;
- messages;
- carts;
- cart_items;
- orders;
- order_items;
- customer_product_stats;
- customer_behavior_events;
- catalog_sessions;
- catalog_events;
- marketing_consents;
- customer_consent_events;
- channel_accounts;
- customer_channel_identities;
- normalized_channel_events;
- automation_workflows;
- ai_action_registry;
- marketing_campaigns;
- marketing_assets;
- marketing_attribution_touchpoints;
- commercial_decision_evaluations;
- whatsapp_direct_*.

Critério de saída: não existe nova duplicação desnecessária de CRM, pedidos, mensagens ou produtos.

## Rodada CM-1.2 — Customer Identity Resolver

Implementar resolução canônica de identidade.

Prioridade:

1. CPF/CNPJ exato;
2. Bling Contact ID;
3. telefone normalizado;
4. combinação segura;
5. revisão humana.

Criar ou complementar estruturas para:

- match_method;
- confidence;
- evidence;
- source;
- matched_at;
- review_status;
- merge/split audit.

Executar reconciliação segura do histórico Bling sem unir pessoas por nome isolado.

Critério de saída:

- novos pedidos vinculam corretamente quando houver evidência suficiente;
- históricos incertos ficam em fila de revisão;
- nenhum merge silencioso de baixa confiança.

## Rodada CM-1.3 — Customer 360 operacional

Criar/ajustar a tela de Clientes no Admin.

Resumo:

- nome;
- telefone;
- CPF;
- cidade/bairro;
- cliente desde;
- última interação;
- última compra;
- pedidos;
- ticket médio;
- LTV;
- status de consentimento;
- lifecycle.

Abas/blocos:

- Compras;
- Produtos;
- Marcas;
- Categorias;
- Conversas;
- Carrinhos;
- Comportamento;
- Preferências;
- Consentimentos;
- Segmentos;
- Tags;
- Marketing;
- Timeline;
- Qualidade de dados.

Critério de saída: abrir um cliente e entender rapidamente quem é, o que comprou, como interage e se pode ou não receber comunicações.

## Rodada CM-1.4 — Event Collector

Centralizar captura de eventos.

Fontes iniciais:

- PapoAI/WhatsApp;
- Comprar;
- catálogo;
- carrinho;
- checkout;
- pedidos;
- Bling;
- atendimento humano;
- campanhas futuras.

Obrigatório:

- evento normalizado;
- occurred_at;
- customer_id quando resolvido;
- source;
- channel;
- provider;
- dedupe/idempotency;
- metadata;
- vínculos com product/order/campaign quando existirem.

Critério de saída: ações relevantes passam a alimentar automaticamente a timeline e o histórico comportamental.

## Rodada CM-1.5 — Consent Ledger e Customer Protection

Criar modelo de consentimento por finalidade.

Estados:

- UNKNOWN;
- GRANTED;
- DENIED;
- REVOKED.

Registrar:

- finalidade;
- canal;
- origem;
- evidência;
- granted_at;
- revoked_at;
- policy_version.

Criar primeiro Suppression Engine:

- telefone válido;
- consentimento;
- opt-out;
- bloqueios;
- cooldown;
- estado do atendimento;
- pedido em andamento;
- restrições.

Critério de saída: para qualquer cliente o sistema consegue explicar “pode” ou “não pode” entrar em marketing e por quê.

## Rodada CM-1.6 — Product Marketing Profile

Enriquecer produto com camada comercial.

Campos/conceitos:

- brand;
- product_line;
- attributes;
- benefits;
- price_tier;
- commercial_role;
- marketing_eligible;
- exclusion_reason;
- replenishment_type;
- creative_angles;
- relation_candidates.

Criar/validar Product Marketing Readiness:

- ativo;
- estoque;
- preço;
- custo;
- margem calculável;
- imagem;
- taxonomia;
- política comercial.

Usar IA apenas para enriquecimento que não seja derivável diretamente.

Política de modelo:

- Luna para enriquecimento/classificação em volume;
- Terra apenas para ambiguidade real;
- Sol somente por exceção.

Critério de saída: o sistema sabe quais produtos podem ser promovidos e por quê.

## Rodada CM-1.7 — Product/Brand Graph inicial

Criar relações versionadas e com confiança:

- SAME_LINE;
- COMPLEMENTARY;
- SUBSTITUTE;
- UPSELL;
- DOWNSELL;
- COMPATIBLE_BRAND;
- BOUGHT_TOGETHER.

Fontes:

- regras determinísticas;
- dados de compras;
- IA;
- revisão humana.

Não usar saída da IA como “verdade” sem registrar confiança/origem.

Critério de saída: campanhas futuras podem consultar relações de produto/marca por API/ação padronizada.

## Rodada CM-1.8 — Segment Engine

Criar segmentos dinâmicos.

Primeiros segmentos:

- comprou alguma vez;
- primeira compra;
- recorrente;
- 30d sem compra;
- 60d sem compra;
- mercearia;
- lavanderia;
- higiene;
- cesta básica;
- marca específica;
- categoria específica;
- falou e não comprou;
- carrinho não concluído;
- marketing permitido;
- marketing não permitido;
- cliente em atendimento/problema;
- cliente com baixa qualidade de dados.

Segmento deve recalcular automaticamente, não depender de tag manual.

Critério de saída: consultas de público são reproduzíveis e auditáveis.

## Rodada CM-1.9 — Customer Commercial Profile

Calcular por SQL/código sempre que possível:

- order_count;
- lifetime_value;
- average_ticket;
- first_order_at;
- last_order_at;
- days_since_last_order;
- average_repurchase_interval;
- top_products;
- top_categories;
- top_brands;
- brand_distribution;
- recent_engagement;
- marketing_pressure;
- profile_completeness;
- data_quality_score.

Primeiros índices de afinidade podem ser estatísticos.

IA não faz contas que SQL pode fazer.

Critério de saída: Customer 360 mostra um perfil comercial utilizável para segmentação.

## Rodada CM-1.10 — Opportunity Engine

Criar oportunidades determinísticas iniciais:

- recompra;
- cliente atrasado;
- carrinho abandonado;
- cross-sell;
- mesma marca;
- extensão de linha;
- categoria ainda não explorada;
- produto complementar;
- reativação;
- estoque oportuno;
- produto em oferta compatível;
- primeira para segunda compra.

Cada oportunidade deve registrar:

- strategy_key;
- audience rule;
- evidence;
- product candidates;
- confidence;
- exclusions;
- estimated audience;
- created_at;
- expires_at;
- status.

Critério de saída: o Admin apresenta oportunidades sem depender da IA “inventar” dados.

## Rodada CM-1.11 — Marketing Brain em OBSERVE/SUGGEST

Adicionar primeira IA de estratégia.

Entrada: oportunidade já calculada + dados agregados.

Saída estruturada:

- objetivo;
- audiência;
- insight;
- produto;
- proposta;
- ângulo;
- oferta;
- formato;
- CTA;
- riscos;
- motivo;
- confidence.

Política de custo:

- não chamar IA cliente por cliente quando uma análise agregada resolver;
- Luna para classificação/organização;
- Terra para estratégia publicitária;
- Sol apenas em caso complexo e explicitamente escalado;
- registrar custo por execução;
- definir teto por tarefa;
- usar cache/prompt estável quando possível;
- batch para trabalho assíncrono em massa quando economicamente vantajoso.

Critério de saída: o sistema explica oportunidades e produz briefs utilizáveis sem executar campanhas sozinho.

## Rodada CM-1.12 — Meta Foundation

Construir contrato definitivo do Meta Control Plane mesmo antes de retirar o PapoAI.

Modelar:

- WABA;
- phone number;
- Graph API version;
- account capability;
- policy registry;
- template;
- template version;
- template Meta status;
- Flow;
- message type;
- webhook event;
- quality/health;
- error;
- permission;
- provider state.

Não duplicar estruturas existentes se puderem ser evoluídas.

Critério de saída: trocar PapoAI por conexão direta Meta não exige reconstruir CRM, campanhas ou eventos.

## Rodada CM-1.13 — Template Draft Assistant

No Admin:

- listar biblioteca local;
- criar manualmente;
- criar com IA;
- editar;
- versionar;
- validar estrutura;
- registrar finalidade/categoria;
- associar estratégia;
- associar criativo;
- deixar preparado para submissão à Meta.

Modo inicial: `DRAFT`/manual.

No futuro, habilitar submit/monitor via Meta Control Plane sem mudar o modelo de dados.

Critério de saída: template nasce como objeto governado e versionado.

## Rodada CM-1.14 — PapoAI Adapter temporário

Isolar integração atual.

Fluxo:

~~~text
PapoAI
  → Adapter
  → Normalized Event
  → Customer Brain
~~~

Não permitir que regra de negócio dependa de payload específico do PapoAI.

Capturar o máximo de contexto permitido pelo webhook/API disponível, incluindo etiquetas apenas se a API realmente oferecer leitura/escrita confiável.

Critério de saída: desligar PapoAI futuramente exige trocar adapter, não reescrever o core.

## Rodada CM-1.15 — Central de Relacionamento

Criar área operacional no Admin:

- Visão Geral;
- Clientes;
- Segmentos;
- Oportunidades;
- Produtos;
- Marcas;
- Marketing Brain;
- Templates;
- Meta Foundation;
- Qualidade dos Dados;
- Auditoria.

Dashboard deve mostrar, entre outros:

- clientes;
- identificados;
- recorrentes;
- em risco;
- inativos;
- consentimentos;
- oportunidades;
- produtos marketing-ready;
- produtos bloqueados por dados;
- identidade histórica pendente;
- problemas de integração.

## Definição de “CM-1 pronta”

Teste ponta a ponta:

1. cliente entra em contato;
2. sistema resolve identidade;
3. Customer 360 atualiza;
4. conversa vira evento;
5. catálogo vira evento;
6. busca vira evento;
7. produto visualizado vira evento;
8. carrinho vira evento;
9. pedido vira evento;
10. perfil comercial recalcula;
11. afinidades atualizam;
12. segmento muda;
13. oportunidade é criada/removida;
14. consentimento é respeitado;
15. Marketing Brain consegue sugerir estratégia;
16. tudo fica auditado;
17. nenhuma ação externa indevida é executada;
18. custo de IA é medido;
19. nenhuma tarefa determinística usa IA sem necessidade;
20. arquitetura continua pronta para conexão direta Meta.

## Ordem oficial de implementação

CM-0
→ CM-1.1
→ CM-1.2
→ CM-1.3
→ CM-1.4
→ CM-1.5
→ CM-1.6
→ CM-1.7
→ CM-1.8
→ CM-1.9
→ CM-1.10
→ CM-1.11
→ CM-1.12
→ CM-1.13
→ CM-1.14
→ CM-1.15
→ homologação CM-1.

## Regra de liberação

A cada rodada:

- migrations versionadas;
- testes;
- dry-run quando aplicável;
- feature flag/gate;
- observabilidade;
- rollback;
- custo;
- segurança;
- documentação;
- nenhuma ativação externa irreversível sem gate explícito.

## Próxima ação

**Iniciar CM-0 — Architecture Lock.**
