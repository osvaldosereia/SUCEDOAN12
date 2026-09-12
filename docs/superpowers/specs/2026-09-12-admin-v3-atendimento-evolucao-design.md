# Admin V3 — Atendimento e evolução contínua

## Objetivo
Consolidar no `admin-v3` a gestão do atendimento da Dona Antônia, preservando o motor simples de regras existente, adicionando histórico operacional dos últimos 7 dias, análise de desempenho e um histórico confiável de ajustes para permitir evolução contínua das configurações.

## Princípios
- `admin-v3` é o único painel administrativo novo usado nesta etapa.
- O atendimento continua baseado em regras simples (`service_simple_rules`) com IA restrita para classificação de intenção e humanização, sem reativar os sistemas antigos.
- O histórico de 7 dias é uma leitura das conversas e mensagens reais existentes; não duplica mensagens.
- Cada alteração relevante nas regras e na configuração gera um registro auditável com antes/depois, origem, motivo e autor quando disponível.
- A análise deve ser conservadora: mede cobertura, fallback, handoff, resposta automática, intenções mais frequentes e pontos sem regra; não altera regras automaticamente.
- Toda publicação/alteração de estratégia continua exigindo ação explícita no Admin V3 ou intervenção administrativa por esta conversa.

## Arquitetura

### 1. Histórico 7 dias
Criar uma API administrativa dedicada que leia `conversations`, `messages`, eventos de ação e handoffs dos últimos 7 dias, agrupando por conversa. O painel mostrará busca, data, cliente/telefone mascarado, última mensagem, modo/status e contadores de entrada/saída.

### 2. Análise da estratégia
Criar `service_strategy_analysis_snapshots` para armazenar diagnósticos datados. Cada snapshot registra métricas de 7 dias, principais intenções sem cobertura, fallbacks/handoffs e observações/recomendações. A API gera snapshot sob demanda; nenhuma mudança de regra é aplicada automaticamente.

### 3. Histórico de ajustes
Criar `service_strategy_change_log`. Alterações em `service_simple_rules` e `service_simple_runtime_config` serão registradas automaticamente por triggers com operação, antes/depois e timestamp. A API administrativa também poderá acrescentar `reason`, `expected_result` e `source` quando a alteração vier do Admin V3.

### 4. Admin V3
Adicionar uma área “Atendimento” dentro do `admin-v3` com três blocos principais:
- Regras e gatilhos: editor simples já existente, migrado/embutido no Admin V3.
- Histórico 7 dias: lista de conversas com detalhe e mensagens.
- Evolução: snapshot atual, recomendações e histórico de ajustes.

### 5. Segurança
- Toda API administrativa exige sessão válida e papel administrativo.
- Dados de cliente são mostrados apenas no painel autenticado.
- Novas tabelas ficam com RLS ativa e sem acesso direto de `anon`/`authenticated`; somente `service_role` e Edge Function administrativa.
- Funções privilegiadas terão `search_path` fixo e `EXECUTE` revogado de `public`, `anon` e `authenticated`.

## Métricas principais
- conversas atendidas em 7 dias;
- mensagens de entrada e saída;
- respostas automáticas executadas;
- fallbacks por falta de regra;
- handoffs para humano;
- consultas de produto;
- abertura do Flow de cestas;
- intenções/perguntas sem regra mais frequentes;
- regras mais acionadas;
- taxa de cobertura aproximada = respostas automáticas válidas / mensagens elegíveis.

## Estratégia de análise recorrente
1. Ler últimos 7 dias.
2. Identificar mensagens sem regra, fallbacks e handoffs.
3. Agrupar textos semelhantes e priorizar recorrência.
4. Comparar com as regras publicadas atuais.
5. Propor no máximo 5 ajustes por rodada, priorizando maior impacto e menor risco.
6. Registrar cada mudança com motivo e resultado esperado.
7. Na análise seguinte, comparar métricas antes/depois e manter, ajustar ou reverter a mudança.

## Critério de finalização desta etapa
- Admin V3 contém a gestão do atendimento.
- Histórico de 7 dias abre e detalha conversas reais.
- Snapshots de análise podem ser gerados e consultados.
- Mudanças de regra/configuração entram no histórico de ajustes automaticamente.
- Motor automático permanece desligado durante a configuração inicial e só é religado depois dos testes controlados.
