# Dona Antônia Operations 2.0 — BLOCO A RUNBOOK

> Runbook executável do BLOCO A — Pedido + Estoque Bling.
> Criado em 2026-09-25.
> Este documento complementa IMPLEMENTATION-ROADMAP.md e deve ser usado junto com HANDOFF.md e HOMOLOGATION-STATUS.md.

## Objetivo
Concluir com segurança a migração de pedidos novos e estoque vendável para o Bling, sem big-bang, sem dupla reserva/baixa e sem interromper o site público.

## Estado de entrada obrigatório
Antes de iniciar qualquer rodada:
- confirmar GitHub HEAD e commits posteriores ao último checkpoint;
- confirmar Supabase canônico ssbesxgaijknwsjbsbcz;
- confirmar versões das Edge Functions envolvidas;
- confirmar flags/runtime;
- confirmar que hub_enabled=false e webhooks_enabled=false enquanto o gate não exigir mudança explícita;
- confirmar stock_authority atual;
- confirmar ops2_direct_order_state_enabled atual;
- registrar rollback antes da primeira escrita;
- não alterar pedidos antigos; usar legado somente para leitura/validação.

## REGRA DE CONTINUIDADE — OBRIGATÓRIA
Nenhum avanço relevante pode existir somente no chat.

Durante e ao final de CADA rodada registrar no repositório:
1. objetivo da rodada;
2. estado inicial observado;
3. arquivos alterados;
4. migrations aplicadas;
5. Edge Functions publicadas + versão;
6. flags/runtime antes e depois;
7. commit(s);
8. IDs de canário, quando existirem;
9. testes executados;
10. evidências observadas;
11. PASS/FAIL;
12. erros e correções;
13. rollback disponível e, se usado, resultado;
14. pendências;
15. o que NÃO foi feito;
16. próximo passo exato;
17. ação manual necessária, se houver.

Arquivos de checkpoint:
- HANDOFF.md: sempre ao final de rodada relevante;
- HOMOLOGATION-STATUS.md: sempre que um gate for testado/homologado;
- IMPLEMENTATION-ROADMAP.md: somente quando o plano/ordem/critério mudar;
- este RUNBOOK: atualizar quando o procedimento do Bloco A mudar.

Uma rodada só conta como concluída com código versionado + deploy/migration quando necessário + teste + evidência + rollback conhecido + documentação atualizada.

---

# RODADA A0 — Baseline congelado

## Objetivo
Criar fotografia verificável imediatamente anterior ao cutover.

## Executar
- registrar HEAD;
- registrar versões de storefront-v2, admin-products-live-v1 e admin-service-intelligence-v1;
- registrar flags de Bling/estoque;
- registrar cobertura do bling_stock_mirror_v2;
- registrar divergências products.stock x saldo virtual;
- identificar nominalmente os 4 produtos ativos sem vínculo;
- registrar saúde recente dos webhooks;
- registrar estado dos gates já homologados.

## Não fazer
- não mudar autoridade de estoque;
- não habilitar early-order global;
- não limpar legado;
- não editar estoque para “fazer bater”.

## PASS
Baseline reproduzível e rollback explícito documentados.

## FAIL
Qualquer dúvida sobre runtime, cobertura ou flags. Parar antes de A1.

## Rollback
Não aplicável: rodada somente leitura/documentação.

---

# RODADA A1 — Cobertura determinística do catálogo

## Objetivo
Garantir que todo produto publicável tenha fonte segura de saldo Bling.

## Executar
- revisar os 4 produtos sem vínculo;
- tentar vínculo somente por GTIN/SKU/ID Bling confirmado;
- se identidade não puder ser provada, bloquear o produto da venda até correção humana;
- nunca fazer fuzzy/approximate match automático;
- revalidar 100% dos produtos publicáveis contra o mirror.

## PASS
Todo produto publicável está vinculado deterministicamente OU explicitamente bloqueado.

## FAIL
Produto permanece vendável sem fonte segura de saldo.

## Rollback
Reverter apenas vínculos criados na rodada; bloqueio de segurança pode permanecer até resolução.

---

# RODADA A2 — Cutover de LEITURA de estoque

## Objetivo
Fazer catálogo, carrinho, checkout e readiness consultarem a mesma fonte: saldo vendável derivado do Bling.

## Estratégia
Primeiro shadow, depois canário. Não remover products.stock.

## Executar
- centralizar leitura no read model ops2_sellable_stock_v1;
- garantir fallback controlado somente enquanto stock_authority=legacy_shadow;
- criar/usar flag de autoridade com rollback imediato;
- validar produto com saldo positivo, saldo zero e saldo menor que quantidade solicitada;
- validar cesta e componentes;
- validar simultaneidade/retry;
- observar erros e latência.

## PASS
- catálogo e checkout concordam;
- saldo insuficiente bloqueia compra;
- produto não vinculado não é vendido;
- nenhuma escrita indevida no Bling;
- nenhuma regressão relevante no site.

## FAIL
Qualquer autorização de venda acima do saldo virtual, inconsistência catálogo/checkout ou indisponibilidade relevante.

## Rollback
stock_authority -> legacy_shadow e restaurar leitura anterior sem desfazer mirror/eventos.

---

# RODADA A3 — Eliminar dupla reserva e dupla baixa

## Objetivo
Bling passa a ser o mecanismo oficial de reserva/baixa para pedidos novos do fluxo homologado.

## Executar
- mapear todos os pontos que alteram/reservam products.stock;
- desativar efeito operacional legado somente para o fluxo novo;
- manter products.stock como shadow/auditoria temporária;
- confirmação -> situação Aprovado / Separar -> reserva virtual Bling;
- cancelamento/rollback -> liberação única;
- saída -> lançamento físico único no ponto homologado;
- testar retry/idempotência.

## PASS
Uma confirmação causa uma única reserva; um rollback libera uma única reserva; uma saída causa uma única baixa física.

## FAIL
Dupla redução, saldo órfão, retry duplicando movimento ou pedido sem reserva.

## Rollback
Desabilitar novo gate e retornar ao fluxo anterior documentado. Não corrigir saldos manualmente sem reconciliação registrada.

---

# RODADA A4 — Early-order Bling em canário

## Objetivo
Pedido novo existir cedo no Bling, inicialmente em Aguardando confirmação.

## Executar
- manter ops2_direct_order_state_enabled=false globalmente;
- habilitar caminho apenas para canário controlado;
- criar pedido novo de teste pelo motor canônico;
- conferir chave externa/idempotência;
- conferir cliente, endereço, itens, quantidades, preços e total;
- conferir situação Aguardando confirmação;
- confirmar -> Aprovado / Separar;
- conferir reserva virtual;
- repetir chamada/retry e provar ausência de duplicação.

## PASS
1 pedido canário = 1 pedido canônico = 1 pedido Bling, com valores e situação corretos.

## FAIL
Duplicação, total divergente, cliente/endereço errado, itens divergentes ou situação incorreta.

## Rollback
Desligar canário/flag e cancelar/reverter somente o pedido de teste conforme procedimento homologado.

---

# RODADA A5 — Canário ponta a ponta

## Fluxo obrigatório
pedido novo
-> Bling Aguardando confirmação
-> confirmação
-> Aprovado / Separar
-> reserva virtual
-> impressão/fila de separação
-> separação
-> Verificado
-> saída
-> baixa física única
-> entrega OU retorno de teste conforme cenário escolhido.

## Validar em cada transição
- pedido local;
- pedido Bling;
- situação;
- saldo virtual;
- saldo físico;
- webhook recebido;
- assinatura/idempotência;
- mirror;
- read model;
- ledger;
- attention;
- print job;
- ausência de duplicidade;
- capacidade de rollback.

## PASS
Todo o fluxo fecha sem divergência não explicada e sem intervenção manual no banco.

## FAIL
Qualquer divergência de pedido, reserva, baixa, mirror, webhook ou idempotência.

## Rollback
Executar o rollback específico da última transição segura; registrar todos os efeitos. Nunca “acertar” banco silenciosamente.

---

# RODADA A6 — Ativação controlada

## Pré-condições
A0-A5 = PASS e documentados.

## Executar
- ativar ops2_direct_order_state_enabled de forma controlada;
- mudar stock_authority somente após prova de leitura e reserva;
- registrar timestamp exato do cutover;
- observar pequeno lote de pedidos novos;
- comparar Bling x mirror x read model;
- manter legado disponível apenas como rollback/shadow durante janela de segurança.

## PASS
Lote controlado sem divergência crítica, sem dupla reserva/baixa e sem regressão do site.

## FAIL
Reverter flags imediatamente e abrir attention/incidente com evidência.

## Rollback
- ops2_direct_order_state_enabled=false;
- stock_authority=legacy_shadow;
- preservar eventos e evidências;
- reconciliar pedidos afetados individualmente.

---

# RODADA A7 — Fechamento do Bloco A

## Objetivo
Declarar Pedido + Estoque Bling homologado somente com evidência.

## Executar
- atualizar HANDOFF.md;
- atualizar HOMOLOGATION-STATUS.md;
- registrar commits/migrations/deploys/flags;
- registrar pedidos canário;
- registrar métricas do lote controlado;
- listar qualquer débito técnico;
- registrar quais componentes legados ainda devem permanecer;
- definir próximo gate do BLOCO B.

## Critério de conclusão do BLOCO A
Somente marcar concluído quando:
- pedido nasce cedo no Bling;
- reserva oficial é Bling;
- site usa saldo vendável Bling;
- baixa física ocorre uma única vez;
- webhooks/mirror/read model fecham;
- retry é idempotente;
- rollback foi comprovado;
- documentação está atualizada.

# MODELO FIXO DE CHECKPOINT

## Checkpoint — [rodada] — [data/hora]
**Objetivo:**
**HEAD inicial:**
**Estado inicial/runtime:**
**Alterações de código:**
**Migrations:**
**Deploys/versões:**
**Flags antes:**
**Flags depois:**
**Canário(s):**
**Testes:**
**Evidências:**
**Gate:** PASS / FAIL / BLOQUEADO
**Erros encontrados:**
**Correções:**
**Rollback disponível:**
**Rollback executado:** sim/não + resultado
**O que não foi feito:**
**Pendências:**
**Ação humana necessária:**
**Próximo passo exato:**

# REGRA DE RETOMADA
Em qualquer novo chat:
1. ler HANDOFF.md;
2. ler IMPLEMENTATION-ROADMAP.md;
3. ler HOMOLOGATION-STATUS.md;
4. ler este BLOCO-A-RUNBOOK.md;
5. conferir GitHub HEAD e Supabase/runtime;
6. comparar fatos com o último checkpoint;
7. continuar somente da primeira rodada/gate não concluído.

Comando:
> Retome Dona Antônia Operations 2.0 pelo BLOCO A. Leia HANDOFF.md, IMPLEMENTATION-ROADMAP.md, HOMOLOGATION-STATUS.md e BLOCO-A-RUNBOOK.md. Confirme GitHub e Supabase/runtime antes de agir. Continue exatamente do primeiro gate não concluído e registre todo avanço no checkpoint obrigatório.
