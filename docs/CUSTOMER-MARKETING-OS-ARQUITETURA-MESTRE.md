# Dona Antônia Customer & Marketing OS — Arquitetura Mestre

Atualizado em 18/09/2026.

Status: **ARQUITETURA APROVADA — IMPLEMENTAÇÃO GRADUAL, COM DESTINO FINAL DEFINIDO DESDE O INÍCIO**.

> Este documento é a referência oficial do subprojeto Customer/Marketing/WhatsApp OS.
>
> Para evitar conflito de nomenclatura com o roadmap geral da Dona Antônia em 20 etapas, a “Etapa 1” deste subprojeto é chamada **CM-1**.
>
> Este documento complementa `docs/ROADMAP-FINAL-DONA-ANTONIA-20-ETAPAS.md`. Em caso de conflito específico sobre CRM, marketing, WhatsApp, Customer Intelligence ou Meta Control Plane, esta especificação mais recente deve ser revisada em conjunto com o roadmap geral antes de implementar.

## 1. Objetivo final

Construir o sistema operacional comercial da Dona Antônia, capaz de administrar de forma integrada e progressivamente autônoma:

- identificação do cliente;
- atendimento;
- vendas;
- carrinho e pedido;
- pós-venda;
- relacionamento;
- recompra;
- recuperação de clientes;
- marketing;
- campanhas;
- templates oficiais da Meta;
- criativos;
- segmentação;
- jornadas;
- atribuição;
- aprendizado;
- controle do WhatsApp oficial.

O objetivo operacional é chegar a uma **empresa operada por exceção**: o fluxo normal é resolvido por regras, automações e IA; pessoas entram principalmente em risco, baixa confiança, exceções, decisões sensíveis ou situações que exigem atendimento humano.

## 2. Princípio estrutural

As fases são **fases de ativação**, não fases de arquitetura.

A arquitetura final deve ser definida agora. Funções complexas podem nascer desligadas ou em `OBSERVE`, mas o formato dos dados, contratos, ações e eventos deve ser compatível com o produto final.

Não criar MVP descartável.

## 3. Arquitetura alvo

~~~text
CLIENTE
   │
WhatsApp / canais
   │
META CONTROL PLANE
   │
CHANNEL GATEWAY
   │
CONVERSATION CORE ───── EVENT COLLECTOR
   │                         │
   └──────────────┬──────────┘
                  │
           CUSTOMER BRAIN
                  │
      ┌───────────┼───────────┐
      │           │           │
SERVICE BRAIN  SALES BRAIN  MARKETING BRAIN
      │           │           │
      └───────────┼───────────┘
                  │
           DECISION ENGINE
                  │
          NEXT BEST ACTION
                  │
      ┌───────────┼───────────┐
      │           │           │
     WAIT      EXECUTE    HUMAN REVIEW
                  │
            JOURNEY ENGINE
                  │
           ACTION REGISTRY
                  │
      ┌───────────┼───────────┐
      │           │           │
Meta/WhatsApp  Criativos   Bling/Operação
~~~

## 4. Customer Brain

O cliente não será representado apenas por tags. O Customer 360 deve consolidar:

- identidade;
- telefones;
- CPF/CNPJ quando disponível;
- IDs externos;
- endereços;
- origem;
- relacionamento;
- conversas;
- pedidos;
- cestas;
- produtos;
- categorias;
- marcas;
- ticket médio;
- LTV;
- comportamento;
- preferências;
- canais;
- consentimentos;
- campanhas recebidas;
- respostas;
- problemas;
- handoffs;
- lifecycle;
- scores;
- qualidade dos dados;
- próxima melhor ação.

Tags são instrumentos operacionais. A fonte de verdade é composta por dados, eventos e relações.

## 5. Customer Identity Resolver

Identidade canônica por `customer_id`.

Fontes de vínculo:

1. CPF/CNPJ exato;
2. Bling Contact ID;
3. telefone E.164 normalizado;
4. combinação segura de dados;
5. revisão humana.

Nunca fundir clientes somente por nome.

Todo vínculo deve registrar:

- método;
- evidência;
- confiança;
- fonte;
- instante;
- auditoria.

## 6. Event Store

Desde CM-1, registrar eventos úteis para inteligência futura.

Exemplos:

- conversation_started;
- message_received;
- audio_received;
- image_received;
- catalog_opened;
- search_performed;
- category_viewed;
- product_viewed;
- cart_created;
- product_added;
- product_removed;
- checkout_started;
- cart_abandoned;
- order_created;
- order_confirmed;
- order_delivered;
- order_cancelled;
- campaign_selected;
- campaign_sent;
- campaign_delivered;
- campaign_read;
- campaign_replied;
- consent_granted;
- consent_revoked;
- human_handoff;
- complaint_opened;
- complaint_resolved.

Cada evento deve carregar, quando aplicável:

- customer_id;
- channel;
- source;
- conversation_id;
- session_id;
- product_id;
- order_id;
- campaign_id;
- occurred_at;
- metadata;
- idempotency/dedupe key.

## 7. Product Brain e Product Knowledge Graph

Cada produto deve ter perfil comercial, não apenas cadastral.

Base:

- marca;
- linha;
- categoria;
- subcategoria;
- atributos;
- fragrância/sabor/versão quando aplicável;
- preço;
- custo;
- margem;
- estoque;
- oferta;
- imagem;
- benefícios;
- faixa de preço;
- papel comercial;
- elegibilidade para marketing.

Relações previstas:

- SAME_LINE;
- COMPLEMENTARY;
- SUBSTITUTE;
- UPSELL;
- DOWNSELL;
- COMPATIBLE_BRAND;
- BOUGHT_TOGETHER.

As relações podem ter três origens:

1. semântica/IA;
2. regra comercial explícita;
3. comportamento observado.

Sempre guardar origem e confiança.

## 8. Marketing Brain

O Marketing Brain deve pensar como publicitário e analista comercial.

Antes de criar uma campanha, deve responder:

1. objetivo;
2. audiência;
3. insight;
4. produto;
5. proposta;
6. ângulo criativo;
7. oferta;
8. formato;
9. CTA.

Estratégias que o sistema deve conhecer:

- recompra;
- reposição;
- Brand Loyalty;
- Brand Extension;
- Compatible Brand;
- Brand Switching Opportunity;
- Cross-sell;
- Same Line;
- Bundle Completion;
- Category Expansion;
- Upsell;
- Economy Alternative;
- Price Drop;
- Back in Stock;
- New Product;
- Win-back;
- Reactivation;
- Stock Opportunity;
- High Margin Match;
- abandono de carrinho;
- primeira para segunda compra;
- pós-venda;
- relacionamento;
- campanhas sazonais;
- estratégias futuras criadas e versionadas.

## 9. Afinidade e personalização

Perfis futuros devem incluir:

- Brand Affinity;
- Brand Loyalty;
- Brand Switchability;
- Category Affinity;
- Product Affinity;
- Promotion Sensitivity;
- Price Sensitivity;
- Marketing Fatigue;
- Engagement;
- Repurchase Interval;
- Inactivity Risk;
- Cross-sell Propensity;
- Upsell Propensity.

Esses indicadores devem preferir estatística determinística quando suficiente. IA entra para interpretação, estratégia e casos ambíguos.

## 10. Creative Strategy

Um produto pode ter vários ângulos de comunicação, por exemplo:

- economia;
- rendimento;
- marca;
- novidade;
- perfume;
- praticidade;
- qualidade;
- combinação com outro produto;
- oferta.

O sistema deve registrar qual ângulo foi usado e o resultado obtido.

A métrica final é venda/margem/resultado, não “beleza” do criativo.

## 11. Decision Engine

Nenhum cérebro isolado manda no cliente.

O Decision Engine combina:

- customer fit;
- product fit;
- timing;
- estoque;
- preço;
- margem;
- consentimento;
- situação do atendimento;
- pressão de marketing;
- histórico recente;
- custo do canal;
- prioridade comercial;
- risco;
- confiança.

Saídas possíveis:

- SEND;
- EXECUTE;
- WAIT;
- NO_ACTION;
- SUPPRESS_MARKETING;
- HUMAN_REVIEW.

“Não fazer nada” é uma decisão válida e importante.

## 12. Meta Control Plane

O sistema final terá conexão própria com a plataforma oficial da Meta.

Deve conhecer e administrar, conforme capacidades disponíveis na conta e versão vigente:

- WABA;
- números;
- Cloud API;
- webhooks;
- mensagens;
- templates;
- categorias e status de templates;
- mídia;
- quick replies;
- botões;
- listas;
- catálogo;
- produtos;
- multi-product;
- WhatsApp Flows;
- capacidades por conta/canal;
- qualidade;
- erros;
- limites;
- versões da Graph API;
- políticas;
- permissões.

A Meta é responsável por aprovar ou rejeitar recursos que dependam de aprovação. Nosso sistema prepara, envia, acompanha, registra e reage ao status.

## 13. Meta Capability Selector

Antes de enviar, o sistema escolhe a melhor experiência disponível e permitida:

- texto;
- quick reply;
- botão;
- lista;
- mídia;
- produto;
- catálogo;
- multi-product;
- Flow;
- template;
- CTA;
- handoff humano.

A escolha deve considerar objetivo, estado da conversa, políticas, capacidade da conta, experiência do cliente e custo.

## 14. Meta Policy Registry

Não espalhar regras da Meta pelo código.

Manter um registro versionado com:

- regra;
- versão;
- vigência;
- capacidade;
- restrições;
- requisitos;
- fonte;
- last_reviewed_at.

Quando houver incerteza sobre permissão de envio, falhar de forma conservadora: `NO_ACTION` ou `HUMAN_REVIEW`.

## 15. Consent Ledger

Não reduzir consentimento a um booleano.

Registrar:

- status;
- finalidade;
- canal;
- origem;
- evidência;
- data de concessão;
- data de revogação;
- versão da política.

Finalidades podem incluir:

- atualização de pedido;
- relacionamento;
- recomendações;
- ofertas;
- novidades.

Ausência de evidência positiva não deve ser tratada como autorização.

## 16. Template Manager

Modos:

- MANUAL;
- ASSISTED;
- AUTOMATIC.

Fluxo futuro:

~~~text
Marketing Brain
  → Campaign Brief
  → Template AI
  → Policy Validator
  → Meta Template Manager
  → Meta
  → PENDING
  → APPROVED / REJECTED / demais estados
~~~

Guardar versões, categoria, variáveis, mídia, botões, status Meta, motivo de rejeição quando disponível, desempenho e uso.

## 17. Journey Engine

Padrão:

`TRIGGER → CONDITIONS → ACTIONS`.

Toda jornada deve ter:

- versão;
- modo;
- orçamento;
- cooldown;
- idempotência;
- kill switch;
- auditoria;
- critérios de entrada;
- critérios de saída;
- supressões.

## 18. Action Registry

IA nunca recebe acesso genérico irrestrito ao banco.

Ela chama ações governadas, como:

- get_customer_profile;
- get_purchase_history;
- search_products;
- get_product_stock;
- get_product_margin;
- get_active_cart;
- create_campaign_draft;
- create_template_draft;
- submit_template;
- generate_creative;
- schedule_followup;
- add_tag;
- remove_tag;
- send_whatsapp_message;
- transfer_to_human.

Cada ação registra:

- schema;
- risco;
- side effects;
- custo;
- autonomia;
- confirmação;
- limite;
- idempotência;
- auditoria.

## 19. Escada de autonomia

Toda função relevante deve poder operar em:

- OFF;
- OBSERVE;
- SUGGEST;
- DRAFT;
- APPROVAL_REQUIRED;
- HOMOLOGATION;
- CANARY;
- AUTONOMOUS/LIVE.

O código base deve ser o mesmo. A policy muda.

## 20. Política de IA e custo

Princípio permanente:

> **Determinístico primeiro, IA depois.**

Não usar IA para tarefas que SQL/código fazem melhor:

- somas;
- datas;
- margem matemática;
- estoque;
- regras de consentimento;
- eligibility;
- segmentação simples;
- janela de atendimento;
- dedupe;
- limites;
- status.

Roteamento OpenAI:

- **GPT-5.6 Luna**: alto volume, classificação, extração, enriquecimento simples, tarefas de baixo custo;
- **GPT-5.6 Terra**: raciocínio comercial/publicitário, estratégia, avaliação mais complexa;
- **GPT-5.6 Sol**: exceção para casos de alta complexidade/impacto quando Terra não for suficiente.

Não hardcodar modelo em dezenas de funções. Criar um **AI Model Router** configurável.

Exemplo conceitual:

~~~text
task_type
preferred_model
reasoning_effort
max_cost
fallback_model
escalation_conditions
cache_policy
batch_allowed
~~~

A seleção de modelo deve considerar custo atual e ser revisável pelo Admin.

Para processamento assíncrono em lote, preferir recursos de batch quando houver vantagem econômica e operacional.

Prompts estáveis devem ser estruturados para maximizar reaproveitamento/cache quando suportado.

## 21. Observabilidade e custo

Medir, sempre que aplicável:

- runs;
- success/failure;
- latency;
- openai_cost;
- messaging_cost;
- external_api_cost;
- human_minutes_saved;
- revenue_attributed;
- margin_attributed;
- cost_per_success;
- cost_per_order.

## 22. Baseline observado em 18/09/2026

Snapshot do Supabase no momento do planejamento:

- 505 clientes;
- 448 com WhatsApp;
- 259 com CPF/CNPJ;
- 1.814 produtos;
- 1.686 produtos ativos;
- 1.603 com estoque > 0;
- 1.504 ativos com preço/custo utilizáveis para cálculo de margem;
- 1.555 ativos com estoque, imagem e preço;
- 37 sem imagem;
- 275 sem custo válido;
- 1.120 sem descrição curta;
- 340 conversas;
- 710 mensagens;
- 399 sessões de catálogo;
- 409 eventos de catálogo;
- 98 carrinhos;
- 2.059 itens de carrinho;
- 45 pedidos canônicos;
- 921 itens de pedido;
- 680 registros de customer_product_stats;
- 13 customer_behavior_events;
- 139 pedidos no staging histórico do Bling;
- somente 47 dos 139 históricos estavam vinculados a customer_id no snapshot;
- marketing_consents sem registros positivos no snapshot.

Esses números são dinâmicos e não devem ser hardcodados.

## 23. Segurança identificada

No snapshot de 18/09/2026 foram detectadas 6 tabelas com RLS desativado:

- agent_eval_release_markers;
- whatsapp_direct_config;
- whatsapp_direct_state;
- whatsapp_direct_templates;
- whatsapp_direct_events;
- whatsapp_basket_media_assets.

Não habilitar RLS sem definir policies corretas, pois isso pode bloquear acessos existentes. A correção deve ser feita conscientemente durante CM-1.

## 24. Integração temporária com PapoAI

Durante a transição:

~~~text
WhatsApp/Meta
   → PapoAI
   → PapoAI Adapter
   → Normalized Events
   → Customer Brain
~~~

O core nunca deve depender de entidades específicas do PapoAI.

Quando o nosso transporte assumir:

~~~text
WhatsApp/Meta
   → Meta Adapter
   → Normalized Events
   → Customer Brain
~~~

O restante da plataforma permanece igual.

## 25. Regra de implementação

Antes de criar qualquer tabela, função, automação ou integração nova, responder:

1. já existe estrutura equivalente?
2. isso pertence ao core ou a um adapter?
3. funciona quando PapoAI sair?
4. funciona com Meta direta?
5. registra evento e auditoria?
6. respeita consentimento?
7. respeita estoque/margem/políticas?
8. permite OFF/OBSERVE/DRAFT/LIVE?
9. mede custo?
10. está preparado para autonomia futura?

Se a resposta for não, revisar o desenho antes de implementar.
