# Marketing Brain V1 — Round 2

Atualizado em 18/09/2026.

Status: **SHORTLIST DETERMINÍSTICA + DRAFT ECONÔMICO IMPLANTADOS; IA PAGA CONTINUA BLOQUEADA**.

## Entregue

- `marketing_product_shortlist_v1` server-only;
- elegibilidade comercial exige:
  - produto ativo;
  - `desired_bling_status='A'`;
  - categoria comercial;
  - estoque e preço positivos;
  - imagem disponível;
  - quando custo é conhecido, preço efetivo acima do custo;
- ranking considera:
  - oferta válida;
  - desconto;
  - margem;
  - estoque;
  - qualidade cadastral;
  - destaque;
  - penalidade de estoque muito baixo;
  - penalidade de uso recente em campanha;
- `admin-marketing-brain-v1` autenticado com JWT + `admin_users`;
- ações:
  - `shortlist`;
  - `create_deterministic_draft`;
  - `strategy_preview` (bloqueada por gate);
  - `generate_ai_draft` (bloqueada por gate);
- estratégia paga preparada para `gpt-5.6-luna`, shortlist máxima 18, saída curta, sem escalonamento automático;
- `strategy_ai_enabled=false`;
- `strategy_max_daily_calls=0`;
- Admin mostra oportunidades e permite criar rascunho econômico sem IA.

## Rascunho piloto

Foi criado um único rascunho piloto de Limpeza para validar o fluxo.
Ele permanece:
- status `draft`;
- enabled `false`;
- execution_mode `off`;
- kill_switch `true`;
- sem publicação;
- sem render;
- sem chamada OpenAI.

O teste seguinte confirmou que os produtos usados foram penalizados pela janela de antirrepetição e deixaram o topo da shortlist.

## Próximo bloco

1. detalhe/edição do rascunho no Admin;
2. gerar plano de peças da campanha sem imagem paga;
3. criar assets de Story, post, carrossel e Reel 10s em DRAFT;
4. construir render determinístico de templates;
5. somente depois liberar uma chamada controlada de IA estratégica para comparação A/B com o modo determinístico.
