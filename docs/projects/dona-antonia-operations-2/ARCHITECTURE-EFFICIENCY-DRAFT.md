# Dona Antônia Operations 2.0 — Eficiência de Arquitetura e Custos (DRAFT)

> Documento de análise. Não implementar ainda.
> Última atualização: 2026-09-25.

## Princípio
O sistema deve ser inteligente pela **qualidade do desenho**, não pela quantidade de funções, crons, tabelas ou chamadas de IA.

Regra:
**se nada aconteceu, idealmente nada deve rodar.**

## Direção arquitetural

### 1. Event-driven
Preferir:
- webhook;
- ação humana;
- evento de pedido;
- mudança no Bling;
- mensagem PapoAI.

Evitar:
- cron de 1 minuto;
- polling de status;
- loops que "perguntam se mudou".

### 2. Uma fonte de verdade por domínio
- Bling: ERP, estoque físico, fiscal, financeiro, compras, fornecedores.
- Supabase: site, regras especiais Dona Antônia, cache/espelho, rota, ledger/control tower.
- PapoAI: conversa/canal.
- GitHub: documentação/arquitetura.

Evitar duas fontes com autoridade igual.

### 3. Espelho mínimo
Dados Bling replicados no Supabase somente se houver motivo:
- desempenho do site;
- regra local;
- correlação;
- histórico operacional necessário.

Não copiar tabelas inteiras "por precaução".

### 4. Read model para dashboard
A Control Tower não deve executar dezenas de chamadas API toda vez que abrir.

Usar:
- eventos;
- pequenos agregados locais;
- estado normalizado;
- consultas sob demanda quando drill-down for aberto.

Exemplo:
card "Pedidos com problema = 3" vem do banco local/eventos.
Ao abrir um pedido específico, aí consulta Bling se precisar de confirmação atual.

### 5. IA sob demanda
Não mandar toda a empresa para OpenAI periodicamente.

IA roda quando:
- usuário pergunta;
- evento exige classificação;
- relatório agendado;
- exceção necessita explicação.

Regras simples ficam em código/SQL, não em LLM.

### 6. Crons somente como rede de segurança
Aceitáveis:
- relatório diário;
- reconciliação leve;
- verificação diária de algo sem webhook;
- manutenção eventual.

Não aceitáveis:
- cron de 1 minuto permanentemente para verificar ausência de evento;
- fiscal AI rodando vazio;
- Hub acordando sem trabalho.

### 7. Jobs só quando há trabalho
Fila deve ser acionada por evento.
Worker:
- processa fila;
- termina;
- não precisa ficar vivo.

### 8. Idempotência
Cada efeito externo deve ter chave estável:
- pedido;
- estoque;
- NF-e;
- impressão;
- mensagem;
- financeiro.

Isso reduz retries perigosos e duplicidade.

### 9. Cache com validade explícita
Nenhum cache deve parecer fonte de verdade.

Campos conceituais:
- source_system;
- source_id;
- observed_at;
- synced_at;
- stale_after;
- sync_state.

### 10. Logs úteis, não barulho
Não guardar milhões de eventos técnicos irrelevantes.

Ledger guarda:
- evento de negócio;
- exceção;
- ação humana;
- automação importante;
- resultado.

Logs técnicos detalhados podem ter retenção curta.

### 11. Documentação não vira banco
GitHub guarda:
- regras;
- decisões;
- arquitetura;
- runbooks.

Não guardar estado operacional corrente em Markdown.

### 12. LLM não é scheduler
Automação determinística fica em evento/job/regra.
IA decide apenas onde realmente há raciocínio.

## Revisão do estado atual sob este princípio

### Manter
- storefront-v2;
- gateway/admin mínimo;
- auth adequado;
- motor de cesta;
- venda manual;
- PapoAI bridge mínimo;
- rota/entregador;
- Control Tower;
- ledger;
- fallback de balanço se Bling nativo falhar na UX.

### Consolidar
- admin monolítico;
- Bling bridge;
- fiscal orchestration;
- produto/estoque duplicado;
- PapoAI legado.

### Remover depois de homologação
- funções aposentadas 410;
- Edge Functions sem tráfego/dependência;
- crons inertes;
- tabelas de módulos extintos;
- polling substituído por webhook;
- wrappers que só duplicam recurso nativo do Bling.

## Regra de aprovação de um novo componente
Antes de criar uma função/tabela/job, responder:
1. Qual problema real resolve?
2. Bling/PapoAI/OpenAI já faz isso?
3. Precisa ficar disponível 24h ou pode ser evento?
4. Qual é a fonte de verdade?
5. Qual custo de execução/armazenamento?
6. Como será removido se deixar de ser necessário?
7. Como será observado?
8. Qual falha cria se parar?

Se respostas não forem claras, não criar.

## Meta de simplificação
Projeto final deve buscar:
- poucas Edge Functions com responsabilidades claras;
- poucas rotinas recorrentes;
- webhooks como principal sincronismo;
- um ledger central;
- um gateway operacional;
- uma camada Bling oficial;
- UI simples.

O número final exato só deve ser definido depois da matriz de dependências e POCs.
