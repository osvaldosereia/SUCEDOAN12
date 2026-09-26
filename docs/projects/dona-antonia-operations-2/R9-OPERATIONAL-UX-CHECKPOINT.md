# Operations 2.0 — R9 · UX operacional das cinco superfícies

Data: 2026-09-26
Status: contrato/read model operacional aplicado; nenhuma mutação de pedido legado.

## Objetivo
Reduzir decisão e cliques do operador sem duplicar ERP e sem enfraquecer gates backend.

## Hierarquia comum
Toda superfície deve responder nesta ordem:
1. O que precisa de atenção agora?
2. Qual é a próxima ação permitida?
3. O que está bloqueando a ação?
4. Qual evidência confirma que terminou?

Estados não devem depender só de cor. Sempre usar rótulo textual, ação principal única e mensagem de bloqueio acionável.

## Read model aplicado
Migration ops2_r9_operational_ux_state_v1.
Função interna ops2_operational_ux_state_v1():
- contagem de pedidos novos/confirmados/separando/prontos/em rota;
- atenções abertas/urgentes;
- retornos aguardando revisão;
- impressões pendentes;
- recommended_surface determinístico.

Baseline observado sem alterar dados:
- 0 novos;
- 33 confirmados;
- 0 separando;
- 1 pronto;
- 0 em rota;
- 16 atenções abertas;
- 9 urgentes;
- 0 retornos em revisão;
- 0 impressões pendentes;
- recomendação atual: central_attention.

## Superfície 1 — Central
Primeiro bloco: Precisa de você.
Depois: Pedidos, Separação, Expedição/rota, Estoque.
Não transformar dashboard em ERP. Cards são atalhos com contagem + motivo.
Atenção urgente prevalece sobre métricas informativas.

## Superfície 2 — Pedidos / Nova Venda WhatsApp
Fluxo visual: Novo -> Confirmado -> Separando -> Conferido -> Fiscal -> Expedição -> Em rota -> Entregue.
Mostrar uma ação primária por estado.
Bloqueios devem usar mensagens humanas: endereço incompleto, pagamento ausente, estoque insuficiente, conferência EAN pendente, fiscal não autorizado.
Nova Venda WhatsApp continua usando motor canônico; não criar segundo modelo de pedido.

## Superfície 3 — Tablet Separação
Leitor EAN é foco principal.
Mostrar produto atual, esperado x conferido e progresso total.
EAN errado/sobra: erro imediato sem avançar.
Concluir somente quando backend retornar sessão verified.
Evitar botões administrativos secundários durante separação.

## Superfície 4 — Estoque Mobile
Leitura EAN -> nome/foto -> quantidade contada -> confirmar.
Teclado numérico próprio; foco volta ao leitor após confirmação.
Divergência sob autoridade Bling vira reconciliação/atenção; nunca esconder diferença.
Incidentes: avaria, vencido, perda e retorno em ações separadas.

## Superfície 5 — Entregador
Ordem de informação: endereço/mapa -> cliente/telefone -> pedido/observação -> valor -> pagamento -> concluir.
Pagamento real deve ser capturado antes de Entregue.
Split mostra partes e diferença restante em tempo real.
Não entregou abre fluxo de retorno/reentrega; não restaura estoque automaticamente.
Botões grandes, mobile-first, uma ação destrutiva por vez.

## Mensagens operacionais padronizadas
- EAN pendente: “Confira todos os itens antes de concluir.”
- Fiscal: “Nota ainda não autorizada. A expedição permanece bloqueada.”
- Pagamento: “Registre o pagamento completo antes de concluir a entrega.”
- Retorno: “Mercadoria retornada precisa de revisão antes de voltar ao estoque.”
- Estoque: “Saldo precisa de conferência. O pedido não será liberado até resolver.”
- Integração: “Integração temporariamente indisponível. Tente novamente sem repetir a operação anterior.”

## Segurança UX
A UI nunca é a autoridade de regra crítica. Gates PostgreSQL/Hub continuam sendo a proteção final.
Nenhum botão deve oferecer bypass administrativo para EAN, fiscal, baixa física, pagamento ou retorno.
Retries de ações externas devem mostrar estado pendente/incerto antes de permitir nova tentativa.

## Ações humanas acumuladas — pós-R12
- Testar Tablet Separação em tablet + leitor EAN real.
- Testar Estoque Mobile em equipamento real.
- Testar Entregador em celular real, inclusive Maps/WhatsApp.
- Testar impressão física 85 mm.
- Fazer sessão rápida com operador real e registrar pontos de confusão/cliques desnecessários.

## Gate R9
PASS: contrato UX + priorização/read model operacional.
PENDENTE: validação física/visual em dispositivos, acumulada para pós-R12.

## Próximo passo
R10: hardening técnico GitHub/Supabase/runtime, RLS/advisors, segurança, performance, custos, Edge Functions, RPCs, triggers, jobs, flags, duplicações e reprodutibilidade.
