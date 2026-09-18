# Customer & Marketing OS — Dona Antônia

**Pasta canônica do projeto.**

Este diretório existe para que o Customer & Marketing OS possa ser retomado em qualquer conversa, janela ou sessão sem depender de memória do chat e sem se misturar com outros projetos do repositório.

## Identidade do projeto

- Projeto: **Customer & Marketing OS — Dona Antônia**
- Repositório: `osvaldosereia/SUCEDOAN12`
- Supabase: `ssbesxgaijknwsjbsbcz`
- Branch principal: `main`
- Admin oficial: `/admin/`
- Comprar: `/comprar/`
- Central de Relacionamento: `/admin/relacionamento.html`

## Escopo deste projeto

Este projeto cobre a camada de relacionamento, inteligência de cliente, WhatsApp e decisão comercial:

- identidade canônica do cliente;
- Customer 360;
- Event Collector;
- consentimento e proteção do cliente;
- perfil comercial;
- Product Marketing Profile;
- Product/Brand Graph;
- Segment Engine;
- Opportunity Engine;
- Marketing Brain;
- Meta Foundation / Meta Control Plane;
- templates WhatsApp;
- adapter temporário PapoAI;
- Central de Relacionamento;
- auditoria, custos, gates e homologação.

## O que NÃO pertence a este projeto

Manter separado, embora possa integrar no futuro:

- Marketing Studio / publicação de conteúdo e Round 8 — documentação canônica em `docs/projects/marketing-admin/`;
- Studio Criativo / Stop Motion;
- app mobile Dona Antônia;
- Financeiro / logística / fiscal do roadmap geral;
- Caneca Fácil;
- AmeMais;
- ferramentas independentes do Admin.

Integrações com esses módulos devem ocorrer por contratos claros; não mover regras desses projetos para cá apenas por conveniência.

## Ordem de leitura obrigatória

Ao retomar:

1. `HANDOFF.md`
2. `CURRENT-STATE.md`
3. `PROJECT-MASTER.md`
4. `ROADMAP.md`
5. `DECISIONS-AND-GUARDRAILS.md`
6. `TECHNICAL-INVENTORY.md`

Depois, quando necessário, consultar os documentos históricos/originais indicados abaixo.

## Fonte de verdade

A prioridade de verdade é:

1. runtime real do Supabase;
2. código e migrations presentes no HEAD atual do GitHub;
3. arquivos desta pasta canônica;
4. documentos históricos do projeto;
5. conversas antigas.

Nunca usar um documento estático para contrariar um snapshot runtime mais recente.

## Documentos históricos importantes

- `docs/CUSTOMER-MARKETING-OS-ARQUITETURA-MESTRE.md`
- `docs/CUSTOMER-MARKETING-OS-ETAPA-CM1.md`
- `docs/CUSTOMER-MARKETING-OS-CM1-ACCEPTANCE-CHECKLIST.md`
- `docs/CUSTOMER-MARKETING-OS-CM1-HOMOLOGACAO.md`
- `docs/RETOMADA-CUSTOMER-MARKETING-OS-ATUAL.md`

Esses arquivos continuam válidos como histórico e detalhamento, mas esta pasta passa a ser o **ponto oficial de entrada**.

## Regra de atualização

Sempre que uma rodada alterar estado, arquitetura, gate, decisão ou próxima ação:

- atualizar `CURRENT-STATE.md`;
- atualizar `HANDOFF.md`;
- atualizar `ROADMAP.md` quando houver avanço de etapa;
- registrar decisões estruturais em `DECISIONS-AND-GUARDRAILS.md`;
- atualizar `TECHNICAL-INVENTORY.md` quando surgirem/removerem componentes centrais.

Nenhuma nova janela deve precisar reconstruir o projeto por commits dispersos.
