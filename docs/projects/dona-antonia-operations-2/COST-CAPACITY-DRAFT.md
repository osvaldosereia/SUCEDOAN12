# Dona Antônia Operations 2.0 — Custos, Capacidade e Anti-Sobrecarga (DRAFT)

> Documento de análise. Não implementar ainda.
> Atualização: 2026-09-25.

## Baseline atual observado
No Supabase canônico:
- 100 Edge Functions implantadas;
- 56 tabelas públicas;
- 3 cron jobs ativos fisicamente.

Crons:
- Bling Hub a cada 2 minutos;
- fiscal AI a cada minuto;
- XML compras diariamente.

Os dois primeiros estão logicamente desativados por configuração, mas continuam agendados.

Conclusão:
há espaço grande para simplificação após o cutover.

## Meta
Não definir número artificial de funções/tabelas.
Cada componente precisa justificar sua existência.

Target qualitativo:
- 1 gateway operacional;
- poucas funções especializadas;
- webhooks;
- processamento por evento;
- sem worker acordando vazio;
- sem duplicação de ERP.

## Bling
Limite oficial documentado:
- 3 requests/s;
- 120.000 requests/dia.

Webhooks reduzem muito o consumo.

Estratégia:
- uma chamada de detalhe somente quando necessária;
- cache curto para tela;
- reconciliador leve;
- batch/paginação;
- rate limiter central.

## OpenAI
Usar IA de forma escalonada.

Exemplo de política:
- tarefas determinísticas: zero LLM;
- classificação/resumo simples: modelo de menor custo;
- relatório/análise média: modelo intermediário;
- investigação complexa/owner: modelo forte.

Não enviar histórico inteiro a cada pergunta.

Usar cache/context packages.

A API é cobrada separadamente da assinatura ChatGPT e os preços mudam; consultar página oficial antes da implementação:
https://developers.openai.com/api/docs/pricing

## WhatsApp/PapoAI
Economia principal:
- evitar mensagens duplicadas;
- usar janela ativa do cliente;
- template de utilidade quando necessário;
- não mandar cada status técnico.

## Mapas
Não geocodificar repetidamente.
Não recalcular rota em toda atualização de tela.
Versionar rota por conjunto de paradas.

## Impressão
Print bridge local não deve fazer polling.
Recebe job somente quando:
- pedido aprovado;
- reimpressão;
- documento novo.

## Control Tower
Dashboard deve usar read models locais.
Não fazer consulta Bling/OpenAI em todo refresh.

## Métricas futuras
- requests Bling/dia;
- webhook events/dia;
- calls OpenAI por domínio;
- custo IA/dia;
- templates WhatsApp;
- rotas calculadas;
- jobs de impressão;
- exceções por 100 pedidos.

## Regra de orçamento
Todo novo automatismo deve provar pelo menos um:
- reduz clique humano;
- reduz erro;
- reduz tempo;
- aumenta rastreabilidade;
- cumpre regra fiscal;
- melhora experiência do cliente.

Se não provar, não entra.
