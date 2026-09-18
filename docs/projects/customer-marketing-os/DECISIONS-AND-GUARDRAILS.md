# DECISIONS AND GUARDRAILS — Customer & Marketing OS

Este arquivo registra decisões que não podem ser perdidas entre janelas.

## D1 — Fonte de verdade

Supabase/PostgreSQL é a verdade transacional. Código/migrations do HEAD são a verdade de implementação. Documentação nunca deve contrariar runtime mais recente.

## D2 — Provider desacoplado

PapoAI é provider temporário. O core consome eventos normalizados. Trocar PapoAI por Meta não pode exigir reescrever CRM, eventos ou decisões.

## D3 — Meta Direct fail-closed

Meta Direct possui gate próprio e não deve obedecer flags legadas de `automation_config`.

Durante CM-1 homologation:
- enabled=false;
- release_mode=off;
- canonical outbound=false.

## D4 — Ativação externa exige autorização explícita

`external_activation_authorized=false` permanece regra obrigatória até nova autorização inequívoca do proprietário para essa ativação específica.

Homologação interna não autoriza:
- campanha;
- outbound;
- publishing;
- submit de template;
- marketing automático;
- aumento de canary externo.

## D5 — Consentimento fail-closed

UNKNOWN, DENIED ou REVOKED nunca viram marketing permitido.

GRANTED exige evidência válida. Não criar consentimento artificial para aumentar audiência ou “passar” teste.

## D6 — Identidade segura

Prioridade:
1. CPF/CNPJ exato;
2. Bling Contact ID;
3. telefone normalizado;
4. combinação segura;
5. revisão humana.

Nunca fazer merge silencioso de baixa confiança. Conflito real deve permanecer pendente até revisão humana.

## D7 — Deterministic first

SQL/código deve calcular:
- segmentos;
- LTV;
- ticket;
- recência;
- readiness;
- relações determinísticas;
- elegibilidade;
- suppressions;
- contadores;
- regras de gate.

IA não substitui cálculo reproduzível.

## D8 — IA governada

IA pode:
- interpretar;
- organizar;
- sugerir;
- escrever;
- resumir;
- produzir estratégia.

IA não pode ser autoridade para:
- identidade;
- consentimento;
- estado de gate;
- preço/custo/margem;
- pagamento;
- estoque;
- fiscal;
- envio externo.

Toda execução governada deve registrar custo.

## D9 — Não fabricar evidência

Não criar fixture persistente, consentimento artificial, campanha artificial, brief artificial ou execução de IA desnecessária apenas para mover um acceptance criterion de implemented para verified.

## D10 — PIN é gate humano

Não descobrir, inferir, brute-force, contornar ou testar automaticamente PIN do Customer OS ou Central de Relacionamento.

O responsável valida manualmente no navegador.

## D11 — Trabalho concorrente

O repositório contém projetos paralelos. Sempre:
- buscar HEAD;
- buscar versão mais recente do arquivo;
- editar apenas o escopo;
- preservar commits concorrentes.

## D12 — Projetos separados

Não misturar este projeto com:
- Marketing Studio/Publishing;
- Stop Motion;
- app mobile;
- financeiro/logística/fiscal;
- Caneca Fácil;
- AmeMais.

Integração deve ser explícita e documentada.

## D13 — Custos

Começar com custo zero/baixo:
- SQL antes de IA;
- cache e agregação;
- IA pequena para classificação;
- modelo mais caro apenas quando necessário;
- budget diário configurável;
- nenhuma chamada só para manter sistema “ativo”.

## D14 — Documentação obrigatória

Toda rodada relevante deve atualizar:
- CURRENT-STATE;
- HANDOFF;
- ROADMAP quando avançar;
- decisões quando mudar arquitetura;
- inventory quando mudar componentes.

O projeto não deve depender de conversa para ser compreendido.


## D15 — Supabase-first; Make somente histórico

O Customer & Marketing OS não usa Make como runtime de automação.

Toda automação nova deve ser implementada preferencialmente em:
- Supabase/PostgreSQL;
- Edge Functions;
- RPC/Jobs próprios aprovados;
- integrações diretas server-side.

Make pode ser consultado apenas como fonte histórica durante auditoria/migração para recuperar:
- IDs;
- nomes de conexões;
- respostas antigas;
- evidências de homologações anteriores;
- configuração legada necessária para substituição.

Não criar novos fluxos operacionais dependentes de Make.
