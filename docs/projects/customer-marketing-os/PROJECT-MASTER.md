# PROJECT MASTER — Customer & Marketing OS

Atualizado em 18/09/2026.

## 1. Objetivo

Construir o sistema operacional de relacionamento e inteligência comercial da Dona Antônia, capaz de entender quem é o cliente, registrar sua jornada, proteger consentimento, identificar oportunidades, sugerir estratégias e preparar a transição para WhatsApp oficial direto pela Meta sem reconstruir o core.

O objetivo final é uma operação por exceção: regras determinísticas e automações resolvem o fluxo normal; IA é usada apenas onde agrega interpretação, estratégia ou linguagem; humanos entram em exceções, baixa confiança, autorizações e decisões sensíveis.

## 2. Princípios

- Supabase/PostgreSQL é a verdade transacional.
- Dados e eventos devem ser canônicos e independentes de provider.
- PapoAI é transporte temporário, não cérebro do sistema.
- Meta Direct é destino futuro, mas permanece fail-closed até homologação e autorização.
- Identidade nunca é mesclada silenciosamente em baixa confiança.
- Consentimento é fail-closed.
- Regras determinísticas não usam IA.
- IA não altera verdade transacional, consentimento, identidade, pagamento ou gates.
- Evidência real vale mais que fixture artificial.
- Nenhum critério é promovido apenas para “fechar checklist”.
- Toda ação externa deve ter gate próprio, auditoria, idempotência e kill switch.

## 3. Arquitetura lógica

```text
CANAIS / PROVIDERS
  PapoAI hoje
  Meta Direct no futuro
        |
        v
PROVIDER ADAPTER
        |
        v
NORMALIZED CHANNEL EVENTS
        |
        +--> IDENTITY RESOLVER
        |        |
        |        v
        |     CUSTOMER
        |
        +--> EVENT COLLECTOR
                 |
                 v
             CUSTOMER 360
                 |
      +----------+----------+
      |          |          |
  SEGMENTS   PROFILE    CONSENT/PROTECTION
      |          |          |
      +----------+----------+
                 |
          OPPORTUNITY ENGINE
                 |
          MARKETING BRAIN
                 |
          DECISION / REVIEW
                 |
      future journeys/actions/meta
```

## 4. Componentes CM-1

### CM-0 — Architecture Lock
Contratos principais e limites do sistema.

### CM-1.1 — Segurança e fundação
RLS/RBAC, server-only, secrets, reutilização de tabelas existentes.

### CM-1.2 — Identity Resolver
Resolução por CPF/CNPJ, Bling ID, telefone e evidências seguras. Conflitos vão para revisão humana.

### CM-1.3 — Customer 360
Visão consolidada de cadastro, compras, produtos, conversas, carrinhos, comportamento, consentimentos, segmentos, marketing e qualidade de dados.

### CM-1.4 — Event Collector
Ingestão e normalização de eventos de conversa, catálogo, busca, produto, carrinho, checkout, pedido e providers.

### CM-1.5 — Consent Ledger / Customer Protection
Estado atual + ledger append-only + suppression + decisão determinística de elegibilidade de contato.

### CM-1.6 — Product Marketing Profile
Readiness comercial do produto com preço, custo, margem, estoque, imagem e taxonomia.

### CM-1.7 — Product/Brand Graph
Relações SAME_LINE, COMPLEMENTARY, SUBSTITUTE, UPSELL, DOWNSELL, COMPATIBLE_BRAND e BOUGHT_TOGETHER.

### CM-1.8 — Segment Engine
Segmentação dinâmica e reproduzível por comportamento, compra, categoria, marca, consentimento e qualidade de dados.

### CM-1.9 — Customer Commercial Profile
Pedidos, LTV, ticket médio, recência, recompra, afinidades, completude e engajamento calculados de forma determinística.

### CM-1.10 — Opportunity Engine
Detecta recompra, reativação, carrinho abandonado, cross-sell, extensão de linha, oferta compatível e outras oportunidades.

### CM-1.11 — Marketing Brain
OBSERVE/SUGGEST. Estratégia é assistida por IA somente atrás de gate e orçamento.

### CM-1.12 — Meta Foundation
Contrato de WABA, número, capabilities, políticas, templates, Flow, erros e estado do provider.

### CM-1.13 — Template Draft Assistant
Biblioteca e versionamento de templates. DRAFT/manual nesta fase; sem submissão automática.

### CM-1.14 — PapoAI Adapter
Isola o provider temporário e produz eventos normalizados.

### CM-1.15 — Central de Relacionamento
Interface operacional para clientes, segmentos, oportunidades, produtos, marketing brain, templates, Meta, dados, homologação e auditoria.

## 5. Definição de CM-1 pronta

São 20 critérios oficiais:

1. cliente entra em contato;
2. identidade é resolvida;
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
13. oportunidade cria/remove;
14. consentimento é respeitado;
15. Marketing Brain consegue sugerir;
16. tudo fica auditado;
17. não há ação externa indevida;
18. custo de IA é medido;
19. tarefa determinística não usa IA sem necessidade;
20. arquitetura permanece pronta para Meta Direct.

A função runtime canônica é `public.cm1_acceptance_checklist_v1()`.

## 6. Integrações

### PapoAI
Provider temporário de inbound. Não guardar regra de negócio específica do payload dele no core.

### Comprar
Gera eventos de catálogo, busca, produto, carrinho e pedido e utiliza identidade/sessão canônica.

### Meta
A fundação existe, mas Meta Direct, publishing e outbound continuam desligados na homologação.

### Marketing Studio / publicação
Projeto paralelo. Pode consumir públicos, oportunidades e briefs deste OS, mas não é o mesmo projeto e não define os gates do Customer OS.

## 7. Política de IA e custo

- SQL/código primeiro para cálculo e classificação determinística.
- IA somente quando interpretação/estratégia realmente agrega valor.
- orçamento e limite diário devem existir antes de ativar.
- registrar execução e custo estimado/real.
- não ativar IA apenas para produzir evidência.
- reutilizar contexto agregado em vez de chamadas por cliente quando possível.

## 8. Segurança operacional

Durante homologação interna:

- Meta Direct OFF;
- outbound canônico OFF;
- publishing OFF;
- templates runtime OFF;
- Marketing execution OFF;
- Marketing kill switch ON;
- AI strategy OFF;
- orçamento IA = 0;
- PapoAI outbound adapter OFF;
- ativação externa não autorizada.

## 9. Regra de evolução

A próxima etapa só pode avançar quando:

- o estado atual estiver registrado;
- CI/testes relevantes estiverem conhecidos;
- runtime estiver auditado;
- nenhuma regressão de gate existir;
- documentação desta pasta for atualizada.

Nunca reconstruir o projeto em paralelo por falta de documentação.
