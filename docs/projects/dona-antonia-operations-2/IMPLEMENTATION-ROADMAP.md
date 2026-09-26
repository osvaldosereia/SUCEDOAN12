# Dona Antônia Operations 2.0 — IMPLEMENTATION ROADMAP

> Aprovado para implantação segura em 2026-09-25. Executar por homologação, shadow/canary e rollback; não fazer big-bang.
> Atualizado em 2026-09-25 após validação do estado real no GitHub e Supabase.

## Objetivo da programação
Concluir a migração para o desenho Operations 2.0 sem interromper o site público, usando o Bling como ERP/fonte oficial dos domínios homologados e mantendo o Vitrine/Admin como camada operacional simples.

## Estado real de partida
Já concluído ou homologado:
- fundação Control Tower: ledger, attention e approvals;
- motor canônico multicanal;
- site e Nova Venda WhatsApp usando o motor canônico;
- receiver/normalização/ponte de conversa PapoAI;
- Situações/Módulos/Transições do Bling;
- reserva oficial de estoque via situação Aprovado / Separar;
- webhook real Bling com assinatura e idempotência;
- mirror de saldo virtual por webhook;
- read model de estoque vendável;
- proteção de aprovação contra saldo virtual insuficiente;
- lançamento e estorno físico de estoque no Bling homologados por canário;
- picking 85 mm e tablet de Separação;
- Estoque Mobile auditável;
- pagamento efetivo/split e fluxo de não entrega/retorno implementados em modo de homologação.

Gates ainda deliberadamente fechados:
- `ops2_direct_order_state_enabled=false`;
- `stock_authority=legacy_shadow`;
- cutover de estoque ainda não executado;
- impressão física silenciosa ainda não homologada;
- pagamento real -> Bling/financeiro ainda bloqueado;
- fiscal definitivo ainda depende de homologação operacional/contábil.

## BLOCO A — Fechar pedido + estoque Bling
Prioridade máxima. Não iniciar limpeza estrutural antes deste bloco.

### A1 — Atualizar documentação e baseline
- registrar últimos gates já homologados;
- registrar versões atuais das Edge Functions;
- registrar flags/runtime;
- registrar último commit conhecido;
- listar os 4 produtos ativos ainda sem vínculo exato Bling;
- preservar evidência das divergências legado x saldo virtual.

Critério de saída:
- documentação representa exatamente produção;
- existe rollback explícito antes de qualquer cutover.

### A2 — Resolver cobertura do catálogo
- revisar os 4 produtos sem vínculo exato;
- vincular somente por identidade determinística (GTIN/SKU/ID confirmado);
- nunca criar vínculo aproximado automático;
- garantir cobertura do estoque vendável para todos os produtos publicáveis.

Critério de saída:
- nenhum produto publicável sem fonte de saldo segura, ou produto explicitamente bloqueado da venda.

### A3 — Cutover de leitura de estoque
- fazer site/checkout/readiness consumirem o read model de saldo vendável Bling;
- preservar shadow comparativo temporariamente;
- impedir que divergência de `products.stock` volte a autorizar venda;
- manter rollback simples para `legacy_shadow`.

Critério de saída:
- catálogo e checkout usam a mesma regra de saldo;
- produto sem saldo virtual suficiente não pode ser comprado;
- nenhum estoque negativo criado.

### A4 — Remover dupla reserva/dupla baixa
- desativar o efeito operacional legado que reserva/consome `products.stock` no novo fluxo;
- manter dados legados apenas como espelho/auditoria durante a transição;
- reserva oficial passa a ser a reserva do Bling;
- baixa física oficial passa a ocorrer uma única vez no ponto operacional homologado.

Critério de saída:
- confirmar pedido não produz dupla redução;
- cancelar/rollback libera exatamente uma reserva;
- retry é idempotente.

### A5 — Early-order Bling
- habilitar primeiro em canário;
- pedido novo deve existir no Bling em Aguardando confirmação;
- confirmação deve levar a Aprovado / Separar;
- verificar total, itens, cliente, chave externa e situação;
- preservar reconciliação e anti-duplicidade.

Critério de saída:
- 1 pedido canário ponta a ponta sem duplicação;
- rollback comprovado;
- depois pequeno lote controlado.

### A6 — Canário completo de estoque
Fluxo:
pedido -> Aguardando confirmação -> confirmação -> reserva virtual -> separação -> Verificado -> saída -> lançamento físico -> entrega/retorno conforme caso.

Validar:
- saldo virtual;
- saldo físico;
- webhooks;
- mirror;
- read model;
- idempotência;
- atenção/exceções;
- rollback.

Somente após PASS:
- `ops2_direct_order_state_enabled=true` de forma controlada;
- mudar `stock_authority` somente com evidência de cutover;
- registrar timestamp e commit do cutover.

## BLOCO B — Separação e conferência
### B1 — Tablet Separação
- validar em equipamento real;
- leitor EAN;
- estados Confirmado/Separando/Separado;
- reimpressão;
- correções/exceções.

### B2 — Impressão 85 mm
- POC de impressora física;
- foto, EAN, quantidade e localização;
- fila idempotente;
- distinguir queued/presented/printed;
- retry seguro.

### B3 — Checkout/conferência Bling
- POC com Bling Checkout;
- leitura EAN;
- conferência parcial/completa;
- mapear conclusão para Verificado;
- não reconstruir no Admin o que o Checkout resolver melhor.

## BLOCO C — Estoque operacional
### C1 — Balanço
- manter UX mobile;
- substituir efeito local definitivo por reconciliação/movimento oficial;
- diferença nunca deve ser escondida.

### C2 — Geral + Quarentena
- homologar depósitos;
- avaria/vencido/perda -> fluxo fiscal/estoque correto;
- retorno -> Quarentena até inspeção;
- sobra sem origem -> revisão, nunca entrada automática.

### C3 — Lotes/validade
- Bling como fonte de lote/saldo/validade;
- FEFO quando aplicável;
- ofertas limitadas à quantidade elegível;
- lote vencido não desativa produto inteiro se houver outro lote vendável.

## BLOCO D — Rota, entrega e pagamento
### D1 — Rotas
- canário real de `ops_delivery_runs`/`ops_delivery_stops`;
- ordenação e edição antes da saída;
- impedir pedido duplicado em rota;
- futura entrada de pins/localizadores WhatsApp.

### D2 — Entregador
- validar tablet/celular;
- pedido, cliente, telefone, endereço, Maps, observações;
- entregue/não entregue;
- retorno físico;
- reentrega.

### D3 — Pagamento efetivo
- validar PIX, dinheiro, crédito, alimentação/refeição;
- split de duas formas na UI;
- total deve fechar exatamente;
- sincronizar recebimento real ao Bling somente após homologação;
- nunca tratar forma prevista no pedido como pagamento efetivo.

## BLOCO E — Fiscal e financeiro
- fechar regra com contador para entrega domiciliar;
- NF-e/DANFE no ponto correto;
- retorno de mercadoria e recusa;
- perdas/avarias/vencimentos;
- contas a receber;
- conciliação do pagamento efetivo;
- refund/reembolso;
- nenhum fluxo fiscal destrutivo automático sem gate específico.

## BLOCO F — Compras/XML
- preservar rotina atual enquanto substituto não estiver homologado;
- priorizar recursos nativos Bling/SEFAZ/Check-in;
- XML CPF sem financeiro empresarial;
- conversão caixa -> unidade determinística;
- fornecedores/custos;
- devolução a fornecedor;
- remover customização apenas depois de equivalência comprovada.

## BLOCO G — PapoAI multicanal
- mapear somente eventos estruturados confiáveis;
- botão/Flow -> draft versionado;
- texto livre não cria pedido automaticamente;
- confirmação converge para motor canônico;
- pós-venda e recompra entram depois do fluxo operacional principal estável.

## BLOCO H — Control Tower
- completar cards e fila Precisa de você;
- approvals reais;
- timeline;
- saúde das integrações;
- estoque crítico;
- pedidos parados;
- exceções fiscais/financeiras;
- copiloto sob demanda, sem IA decidindo regra crítica.

## BLOCO I — Segurança e perfis
- Owner;
- Supervisor;
- Operador;
- Entregador;
- automações/service role;
- eliminar dependência de perfil/PIN compartilhado;
- princípio do menor privilégio.

## BLOCO J — Limpeza final
Executar somente quando substitutos estiverem homologados:
- Edge Functions históricas;
- tabelas sem uso;
- triggers legados;
- crons inúteis;
- rotas antigas;
- código morto;
- documentação histórica redundante.

Nunca apagar apenas porque parece antigo. Antes da remoção:
1. procurar referências no código;
2. conferir runtime;
3. conferir banco;
4. confirmar substituto;
5. registrar rollback/backup quando aplicável.

# REGRA OBRIGATÓRIA DE CONTINUIDADE E REGISTRO

Esta regra é parte do projeto e deve ser obedecida em TODA rodada de programação, inclusive quando o trabalho for feito em outro chat.

## Antes de programar
1. Ler `HANDOFF.md`.
2. Ler este `IMPLEMENTATION-ROADMAP.md`.
3. Conferir o estado real no GitHub e Supabase.
4. Conferir commits posteriores à última anotação.
5. Não assumir que o histórico do chat é a fonte de verdade.
6. Identificar o gate exato que está sendo trabalhado e o rollback.

## Durante a rodada
Registrar continuamente fatos importantes; não esperar o final se houver risco de perder contexto:
- arquivos alterados;
- migrations aplicadas;
- Edge Functions publicadas e versões;
- flags/runtime alterados;
- testes executados;
- IDs de canário quando necessários;
- resultados observados;
- erros encontrados;
- correções;
- decisões arquiteturais;
- pendências externas/humanas.

## Antes de encerrar qualquer rodada importante
É OBRIGATÓRIO atualizar `HANDOFF.md` e, quando afetado, este roadmap e/ou `HOMOLOGATION-STATUS.md`.

O checkpoint deve conter no mínimo:
- data/hora ou data da rodada;
- objetivo;
- o que foi realmente programado;
- o que foi realmente publicado/aplicado;
- commit(s);
- migrations;
- versões de funções;
- estado das flags;
- testes e evidências;
- PASS/FAIL de cada gate;
- problemas conhecidos;
- rollback disponível;
- o que NÃO foi feito;
- próximo passo exato;
- eventual ação manual necessária.

## Regra de segurança de retomada
Nenhuma rodada deve depender da memória de uma conversa do ChatGPT.

Se um chat travar, fechar ou for substituído, a retomada deve ser possível apenas com:
1. repositório;
2. Supabase/runtime;
3. `HANDOFF.md`;
4. `IMPLEMENTATION-ROADMAP.md`;
5. `HOMOLOGATION-STATUS.md`;
6. commits/logs.

## Regra de conclusão
Uma etapa NÃO está concluída apenas porque o código foi escrito.
Só marcar como concluída quando houver:
- código versionado;
- migration/deploy quando necessário;
- teste;
- evidência;
- rollback conhecido;
- documentação atualizada.

## Comando padrão de retomada
> Retome Dona Antônia Operations 2.0. Leia `docs/projects/dona-antonia-operations-2/HANDOFF.md`, `IMPLEMENTATION-ROADMAP.md` e `HOMOLOGATION-STATUS.md`. Confirme o estado real no GitHub e Supabase e compare os commits posteriores à última anotação. Continue exatamente do próximo gate registrado. Não confie apenas no histórico do chat e não faça limpeza antes de homologar o substituto.
