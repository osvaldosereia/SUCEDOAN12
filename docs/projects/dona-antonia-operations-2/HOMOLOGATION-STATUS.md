# Dona Antônia Operations 2.0 — Homologação / Implantação

> Início autorizado em 2026-09-25.
> Branch de trabalho: `ops2/homologacao-implantacao`.

## Política desta fase
- sem big-bang;
- alterações pequenas e reversíveis;
- preservar pedidos antigos;
- Bling como ERP;
- webhooks/eventos em vez de polling;
- nenhuma limpeza destrutiva antes do cutover;
- cada etapa com validação e rollback.

## Fase 0 — iniciada
1. baseline do runtime capturado;
2. branch isolada criada;
3. fundação da Control Tower preparada;
4. remover desperdício de crons fisicamente ativos mas logicamente desligados;
5. validar fundação no Supabase;
6. começar homologação Bling: situações, reserva, webhooks e Checkout.

## Baseline encontrado
- Bling Hub: `hub_enabled=false`;
- Bling webhooks: `webhooks_enabled=false`;
- cron Hub ainda ativo a cada 2 minutos;
- fiscal runtime: `enabled=false`, `execution_mode=off`;
- cron fiscal AI ainda ativo a cada 1 minuto;
- XML compras diário permanece necessário.

Decisão:
- pausar os dois crons ociosos;
- manter XML diário;
- não remover funções/tabelas ainda.

## Foundation v1
Novas estruturas não destrutivas:
- `ops_events`;
- `ops_attention`;
- `ops_approvals`.

RLS habilitado sem acesso direto do cliente. Uso inicialmente somente por backend/service role.


## Execução registrada — 2026-09-25

### Concluído
- branch de homologação criada e integrada ao `main`;
- migration `ops2_foundation_v1` aplicada no Supabase;
- migration `ops2_foundation_api_v1` aplicada no Supabase;
- tabelas `ops_events`, `ops_attention`, `ops_approvals` criadas com RLS;
- helpers idempotentes de evento, atenção e aprovação criados;
- resumo leve da Control Tower criado;
- cron `bling-hub-v2-cycle` pausado porque `hub_enabled=false`;
- cron `fiscal-ai-autonomous-worker-v1` pausado porque o runtime fiscal está `off`;
- cron diário de XML mantido;
- `admin-products-live-v1` atualizado para v14;
- aba `Hoje` evoluída para `Central`;
- painel `Precisa de você` ligado à fila real de `ops_attention`;
- três pendências iniciais registradas:
  - permissão Bling para Situações/Módulos;
  - endpoint PapoAI legado ainda configurado externamente;
  - localização física de produtos incompleta.

### Pull requests
- PR #547 — Fase 0 — merged;
- PR #548 — Control Tower / atenção — merged.

### Sem mudança ainda
- fluxo de criação/aprovação de pedidos;
- reserva oficial no Bling;
- webhooks Bling;
- PapoAI novo;
- estoque oficial do site;
- fiscal;
- pagamento;
- rota;
- balanço oficial no Bling.

Esses domínios continuam no fluxo atual até passarem pela respectiva POC.

## Próximo gate
**Bling — Situações/Módulos + reserva + webhooks.**

O runtime atual continua marcando `situacoes/modulos` como `scope_missing` (HTTP 403). Antes de ativar o workflow automático de pedidos, precisamos homologar essa permissão e provar:
1. leitura das situações;
2. atualização de situação;
3. situação `Aguardando confirmação`;
4. situação `Aprovado / Separar`;
5. reserva somente após aprovação;
6. webhook de atualização;
7. reconciliação sem polling.


## OAuth Bling preparado — 2026-09-25

### Concluído
- PR #551 integrado ao `main`;
- fluxo Owner -> Reconectar Bling -> autorização Bling -> callback -> Admin preparado;
- callback reutiliza `admin-service-intelligence-v1`;
- nenhum novo Edge Function foi criado;
- state OAuth possui hash e expiração;
- refresh token continua armazenado apenas pelo cofre/RPC existente;
- `admin-service-intelligence-v1` implantado em v135;
- `admin-products-live-v1` implantado em v17;
- runbook `BLING-HOMOLOGATION-RUNBOOK.md` criado;
- runtime Bling está em `mode=homologation`, mas `hub_enabled=false` e `webhooks_enabled=false`.

### Restrição encontrada
O projeto Supabase atingiu o limite atual de Edge Functions. Em vez de aumentar plano ou criar mais uma função, o callback OAuth foi consolidado dentro da função administrativa existente.

Essa decisão segue o princípio do Operations 2.0: menos funções e responsabilidades claras.

### Gate humano Bling
Agora existe uma etapa externa inevitável no painel do Bling:
1. adicionar os escopos de Situações/Módulos/Transições ao aplicativo Dona Antônia;
2. configurar/salvar o redirect OAuth para `admin-service-intelligence-v1`;
3. salvar o aplicativo;
4. no Vitrine/Admin > Bling técnico, usar **Reconectar Bling**;
5. voltar à Central e usar **Testar novamente**.

O Bling revoga a autorização anterior quando os escopos do aplicativo são alterados, portanto a reautorização é necessária.

### Não ativar ainda
Mesmo depois da reautorização:
- não ativar `hub_enabled`;
- não ativar `webhooks_enabled`;
- não mover pedidos para o novo fluxo;
até passarem os testes de catálogo de situações, reserva e webhook.


## Avanços adicionais — 2026-09-25

### OAuth / Bling
- `admin-service-intelligence-v1` v136: troca OAuth ajustada para JWT (`enable-jwt: 1`);
- `admin-products-live-v1` v18;
- `storefront-v2` v15;
- Hub permanece em `mode=homologation`, `hub_enabled=false`, `webhooks_enabled=false`;
- bloqueio externo continua: `situacoes/modulos` HTTP 403 até reautorização com novos escopos.

### Shadow readiness
Foi criada a projeção read-only `get_ops2_order_shadow_readiness_v1`.

A primeira leitura dos pedidos novos/abertos mostrou:
- 12 pedidos avaliados;
- 7 prontos para ERP;
- 5 bloqueados;
- 0 com produto sem vínculo Bling;
- 5 com cliente/vínculo pendente;
- 4 com endereço incompleto;
- 0 sem pagamento.

Conclusão: produtos já estão em condição muito melhor que clientes/endereço para o early-order no Bling.

### Reserva de estoque
Mudança de produção concluída:
- checkout NÃO reserva mais ao enviar o pedido;
- pedido aguarda confirmação sem reserva;
- a reserva local temporária ocorre somente em `created -> confirmed`;
- 122 linhas antigas de reserva de pedidos ainda não confirmados, totalizando 198 unidades, foram liberadas;
- nenhuma dessas liberações restaurou estoque físico, pois eram somente reservas;
- a política está registrada no ledger.

Esse modelo é intermediário. Depois do gate Bling, a reserva local será substituída pela reserva oficial por situação no Bling.

### Próximo bloco
Preparar fila de impressão de picking após aprovação, sem acoplar impressão à baixa de estoque. A impressão física automática só será ativada depois da POC com impressora/tablets.


## Implementação multicanal e PapoAI — 2026-09-25

### Separação / impressão
- fila `ops_print_jobs` implantada;
- picking 85 mm é enfileirado após aprovação;
- navegador registra apenas `presented`, não `printed`;
- claim/finish para futuro agente físico já existem;
- impressão foi desacoplada da baixa de estoque;
- impressão física automática continua desligada até POC de hardware.

### Motor de pedido multicanal
- `create_canonical_cart_order_v2` implantado;
- fontes canônicas novas: `vitrine`, `manual_whatsapp`, `papoai`, `reorder`;
- site já usa o wrapper canônico;
- mesma regra determinística de cesta, preço, estoque e pedido mínimo;
- Admin operacional deixou de pressupor que todo pedido novo vem do site.

### Venda WhatsApp
- tela **+ Venda WhatsApp** implantada em Pedidos;
- busca cliente;
- endereço;
- produtos;
- cestas;
- personalização de cesta;
- cotação pelo mesmo motor do site;
- pedido nasce Novo e sem reserva;
- origem registrada como `manual_whatsapp`;
- resolver fiscal já aceita as novas fontes canônicas.

### PapoAI
- endpoint `papo-external-agent-v1` deixou de responder 410 e foi substituído por receiver **capture-only**;
- receiver v105;
- valida chave existente por SHA-256;
- payload é sanitizado antes de persistir;
- máximo 256 KB;
- inbox idempotente com RLS;
- retenção lógica 7 dias;
- nenhuma ação em cliente/pedido/estoque/Bling/IA durante a POC;
- Control Tower expõe somente o status/contagem da captura.

### Versões
- `storefront-v2`: v16;
- `admin-products-live-v1`: v22;
- `admin-service-intelligence-v1`: v137;
- `papo-external-agent-v1`: v105.

### Gates ainda abertos
1. Bling `situacoes/modulos` continua dependendo de reautorização humana no aplicativo.
2. Ainda não chegou amostra real nova no receiver PapoAI v105; o adapter normalizador será escrito somente depois de observar payload real.
3. Impressão física automática depende de hardware.
4. Reserva oficial no Bling depende do gate de situações.


### Rascunho PapoAI versionado
- tabela `papoai_order_drafts_v2`;
- deduplicação por `papoai_draft_events_v2`;
- uma revisão ativa por conversa;
- resumo enviado ao cliente é preso a `revision + summary_hash`;
- confirmação de revisão antiga é rejeitada;
- confirmação repetida é idempotente;
- confirmação cria `source=papoai` pelo motor canônico;
- total confirmado precisa ser exatamente o total cotado; divergência reverte a transação;
- cancelamento de rascunho é versionado.

Estado: infraestrutura pronta, mas **não ligada ao receiver** enquanto não existir amostra real do payload PapoAI v105.


## PapoAI adapter v2 — payload real observado

### Captura real
O receiver PapoAI recebeu uma amostra real de `message.received` em 2026-09-25.

Estrutura observada:
- `event.type`;
- `event.occurred_at`;
- `data.session.uid`;
- `data.contact.id` / `name`;
- `data.message.id`;
- `data.message.external_id` (WhatsApp/WAMID);
- `data.message.direction`;
- `data.message.type`;
- `data.message.phone_number_from`;
- `data.message.phone_number_to`;
- `data.message.created_at`.

Nenhum conteúdo pessoal da amostra foi copiado para a documentação.

### Implementado
- migration `papoai_capture_normalizer_v2`;
- normalização central em `papoai_normalize_capture_v2`;
- backlog capturado normalizado sem cron;
- receiver v106 normaliza inline após persistir o payload sanitizado;
- adapter_version agora é 2;
- `external_message_id`, `conversation_ref` e `phone_candidate` passam a ser preenchidos pelo schema real observado;
- WAMID fica somente em metadata operacional;
- tentativa de vínculo de cliente é determinística por telefone, sem criar cliente automaticamente;
- eventos incompletos/desconhecidos ficam `review_required`;
- Control Tower passa a mostrar quantidade normalizada/revisão.

### Regra de segurança
Uma mensagem livre recebida NÃO cria pedido e NÃO altera carrinho automaticamente.
O rascunho PapoAI versionado só será alimentado por eventos/ações que consigam produzir itens estruturados e determinísticos.


## Control Tower timeline — 2026-09-25

### Concluído
- `ops_timeline` read-only no gateway operacional;
- `admin-products-live-v1` v23;
- Central exibe até 12 eventos recentes de negócio;
- não expõe payload técnico bruto;
- mostra origem, resumo, ator e horário;
- timeline usa o ledger já existente, sem nova tabela e sem polling.

Objetivo:
o proprietário consegue entender o que mudou recentemente sem precisar perguntar primeiro ao ChatGPT.


## Ponte PapoAI -> Conversa local v2

### Concluído
- `papoai_ensure_conversation_v2` implantada;
- receiver `papo-external-agent-v1` v107;
- mensagem inbound normalizada passa a vincular/criar o espelho operacional da conversa;
- chave de correlação operacional: conta WhatsApp ativa + telefone;
- sessão/contact id do PapoAI ficam em `referral`;
- conversa existente é reutilizada;
- cliente só é vinculado quando já existe correspondência determinística;
- nenhuma mensagem cria cliente, carrinho, pedido ou escrita no Bling;
- duplicidade é protegida por captura idempotente + lock transacional de conta/telefone.

### Validação
Os eventos normalizados já existentes foram reconciliados:
- conversas antigas conhecidas foram reutilizadas;
- contatos novos criaram somente a conversa operacional;
- nenhum erro ficou na amostra conciliada.

A criação de rascunho de pedido continua separada e exige evento estruturado/determinístico.


## Separação tablet + PapoAI homologado — 2026-09-25

### PapoAI
- receiver v107 em produção;
- adapter v2;
- ponte de conversa v2;
- eventos reais posteriores ao deploy foram vinculados automaticamente;
- estado observado: 9 eventos nas últimas 24h, 9 normalizados e vinculados, 0 sem conversa, 0 em revisão;
- a antiga pendência de “aguardar primeiro payload real” foi resolvida;
- texto livre continua sem permissão para criar pedidos.

### Picking
- detalhe do pedido agora leva GTIN/EAN até o ticket;
- ticket térmico ajustado para bobina de 85 mm;
- folha mostra foto, nome, EAN, quantidade, gôndola e prateleira;
- rodapé mostra produtos diferentes + unidades totais;
- `admin-products-live-v1` v24.

### Tablet
- nova aba `Separação` no Vitrine/Admin;
- layout vertical com poucas ações;
- fila somente Confirmados/Separando;
- ações: iniciar, separado, reimprimir, abrir/corrigir;
- nenhuma API ou worker novo foi criado.

### Hardware ainda pendente
A fila automática já existe, mas impressão física silenciosa continua desligada até POC do equipamento.
O Bling consegue automatizar impressão de DANFE/DANFE Simplificado no Checkout e usa QZ Tray para comunicação com impressoras. Nossa lista de picking personalizada exige POC equivalente com a impressora local antes de habilitar impressão silenciosa.


## Estoque mobile auditável — 2026-09-25

### Implementado
- nova base `ops_inventory_counts` para registrar cada contagem física;
- nova base `ops_inventory_incidents` para avaria, vencido, perda, retorno e outras ocorrências;
- Balanço continua atualizando o estoque local durante a transição, mas agora a diferença fica explicitamente pendente de reconciliação ERP/fiscal;
- diferenças de balanço abrem `ops_attention`;
- avaria/vencido/perda retiram imediatamente a quantidade do estoque vendável local;
- retorno NÃO volta automaticamente ao estoque vendável; fica aguardando inspeção;
- toda ocorrência gera ledger + fila de atenção;
- a tela mobile de Estoque reúne Balanço e Avaria/Vencido/Retorno usando o mesmo leitor EAN;
- Control Tower passa a contar ocorrências e diferenças de balanço.

### Importante
O ajuste local de estoque é transitório enquanto Bling ainda não está homologado como autoridade online de estoque. A ocorrência mantém `needs_bling_reconciliation=true` para não confundir disponibilidade comercial com regularização ERP/fiscal.

Nenhuma ocorrência fictícia foi criada para teste.


## Pagamento efetivo na entrega — 2026-09-25

### Implementado
- tabela `order_payment_settlements` para representar o recebimento real do pedido;
- tabela `order_payment_parts` para múltiplas formas de pagamento;
- meios operacionais: PIX, dinheiro, crédito, alimentação, refeição e outro;
- soma das partes precisa ser exatamente igual ao total do pedido;
- captura é idempotente e não permite sobrescrever silenciosamente um recebimento já registrado;
- a tela de entrega agora registra o pagamento REAL antes de marcar o pedido como Entregue;
- pagamento previsto continua separado do pagamento efetivo;
- se cartão/pagamento falhar, o operador deve usar `Não entregou`, e não confirmar a entrega;
- Control Tower passa a mostrar pagamentos recebidos ainda não conciliados com o Bling.

### Gate Bling/fiscal preservado
A captura local NÃO cria baixa financeira nem altera NF-e no Bling neste estágio.

Cada settlement nasce com:
`bling_sync_state=blocked_homologation`.

A sincronização automática só será liberada depois de:
1. homologar fiscal/pagamento de delivery com contador;
2. fechar escopos e fluxo de pedido no Bling;
3. testar múltiplas formas/parcelas no Bling;
4. confirmar que o documento fiscal e financeiro refletem o meio efetivamente recebido.

### Segurança operacional
A ordem agora é:
**receber -> registrar forma/valores -> validar total -> marcar Entregue**.

Isso evita marcar entrega concluída e depois descobrir que não houve pagamento.


## Não entrega e retorno físico — 2026-09-25

### Implementado
- nova entidade `order_delivery_return_cases`;
- ao tocar `Não entregou`, o pedido NÃO volta imediatamente para Pronto;
- motivo da falha vira uma tentativa auditável;
- mercadoria permanece fora do estoque vendável enquanto está retornando;
- entregador passa a ver `CONFIRMAR RETORNO AO DEPÓSITO`;
- somente depois do retorno físico o sistema toma a próxima decisão.

### Fluxo
**não entregou -> retornando -> retorno físico confirmado**

Motivos normalmente aptos a reentrega:
- cliente ausente;
- endereço não encontrado;
- reagendamento;
- veículo/rota.

Após retorno físico:
- pedido volta para `ready`;
- estoque continua consumido/alocado ao mesmo pedido;
- nenhuma reposição ao estoque geral é feita.

Motivos que exigem revisão:
- pagamento falhou;
- cliente recusou/desistiu;
- outro ambíguo.

Após retorno físico:
- pedido fica bloqueado para nova saída;
- abre atenção de supervisor;
- estoque NÃO é restaurado automaticamente;
- fiscal/devolução/inspeção serão resolvidos antes de cancelar ou recolocar mercadoria à venda.

### Proteções
- enquanto existir retorno aberto, pagamento efetivo não pode ser capturado;
- enquanto existir retorno aberto, pedido não pode virar Entregue;
- retorno em revisão bloqueia nova expedição também no backend;
- nenhuma ocorrência fictícia foi criada.


## Resolução segura de retorno — 2026-09-25

### Supervisor
Quando a mercadoria já retornou fisicamente e o caso está em revisão, existem agora dois fechamentos seguros:

1. **Liberar para reentrega**
   - encerra a revisão;
   - mantém o pedido em `ready`;
   - não restaura estoque, pois os itens continuam alocados ao pedido.

2. **Cliente desistiu + tudo retornou íntegro**
   - exige confirmação explícita;
   - cancela comercialmente o pedido;
   - restaura o estoque local consumido;
   - abre atenção fiscal obrigatória para verificar retorno/devolução no Bling;
   - não executa nenhuma ação fiscal automática.

Se houver avaria, falta ou item impróprio:
- a tela orienta a ir para `Estoque mobile`;
- não oferece restauração total;
- o retorno continua bloqueado até tratamento item a item.

### Proteção
- resolução exige perfil owner/supervisor;
- retorno com pagamento já capturado não pode ser cancelado por este atalho;
- nenhuma NF-e é cancelada automaticamente;
- nenhuma venda histórica é apagada.


## Gate Bling automatizado pós-OAuth — 2026-09-25
- `admin-service-intelligence-v1` publicado em v139;
- após uma reautorização OAuth bem-sucedida, o backend testa automaticamente `/situacoes/modulos`;
- catálogo autorizado passa a gravar `state=ready` e `status_updates_enabled=true`;
- a pendência `bling_scope_missing` é resolvida automaticamente quando o teste passa;
- Hub, Webhooks e fiscal continuam desligados; nenhuma escrita de pedido é ativada automaticamente;
- enquanto o Bling responder 403, o runtime permanece em homologação e o canário não avança.

### Ação manual ainda necessária
No cadastro do aplicativo Dona Antônia no Bling, liberar o acesso aos recursos de Situações/Módulos/Transições, salvar e reautorizar o aplicativo pelo botão **Reconectar Bling** do Vitrine/Admin. Depois disso a verificação é automática.


## Situações e reserva de estoque — HOMOLOGADO em 2026-09-25

### Situações/Módulos
- OAuth válido;
- `/situacoes/modulos` = HTTP 200;
- módulo **Vendas** = 98310;
- `status_updates_enabled=true`;
- `Aguardando confirmação` = 915901;
- `Aprovado / Separar` = 915902;
- `Verificado` = 24;
- `Atendido` = 9;
- `Cancelado` = 12.

### Transições do fluxo Operations 2.0
- `Aguardando confirmação -> Aprovado / Separar` = 504837238;
- `Aprovado / Separar -> Aguardando confirmação` = 504838770;
- transições criadas/validadas sem ações implícitas de estoque.

### Reserva
Canário Bling `26967482613` validado com leitura de saldo antes/depois.

Em `Aguardando confirmação`:
- saldo físico = saldo virtual.

Em `Aprovado / Separar`:
- saldo físico não muda;
- saldo virtual é reduzido pela quantidade reservada.

Rollback para `Aguardando confirmação`:
- saldo virtual é liberado;
- saldo físico permanece inalterado.

Amostra comprovada:
- Açafrão 10 físico / 10 virtual -> 9 virtual -> 10 virtual;
- Achocolatado 3 / 3 -> 2 -> 3;
- Arroz 97 / 97 -> 96 -> 97.

### Gate
**PASSOU.**

Pendência correspondente na Control Tower/Supabase foi resolvida.
Próxima homologação: webhooks Bling + reconciliação de eventos, mantendo processamento geral desligado até o canário ficar verde.


## Webhooks Bling — HOMOLOGADO em 2026-09-25

### Passou
- HMAC SHA-256 com `X-Bling-Signature-256`;
- assinatura inválida rejeitada com 401;
- duplicidade responde 2xx e não duplica inbox;
- evento reconhecido fica `held` quando processamento está desligado;
- pedido vinculado é reconciliado por evento com leitura pontual do Bling;
- quando local e remoto coincidem, evento fecha como `processed` sem mutação local;
- canário `c1acf430-cfd8-4018-b103-b0589025e05e` reconciliou pedido `26967482613` em situação `915901`.

### Entrega real comprovada
- `order.updated` real recebido para o pedido `26967482613`;
- situação `915902` recebida após aprovação;
- drift intencional detectado sem mutação;
- rollback gerou novo `order.updated` com `915901`;
- segundo evento reconciliou como `order_reconciled_noop`;
- 56 eventos reais `virtual_stock.updated` recebidos: 28 na reserva + 28 na liberação;
- todas as assinaturas reais verificadas;
- eventos do canário foram limpos;
- reserva final liberada e saldo físico intacto.

Estado do gate:
**PASSOU.**

O processamento geral permanece desligado enquanto o próximo gate, atualização segura do espelho de estoque por webhook, é homologado.


## Espelho de estoque Bling por webhook — HOMOLOGADO

### Cobertura
- ativos: 1.634;
- ativos vinculados ao Bling: 1.630;
- mirror coberto: 1.630;
- ativos sem correspondência exata: 4;
- vinculados sem mirror: 0.

### Divergência encontrada no modelo legado
- 1.087 iguais;
- 543 divergentes;
- 168 local > Bling;
- 375 local < Bling;
- 11 local positivo com Bling virtual zero;
- 3 local zero com Bling virtual positivo.

### Evento real
- `virtual_stock.updated` dirige o shadow mirror;
- proteção contra evento fora de ordem;
- 28 eventos reais de liberação processados automaticamente;
- 28/28 HTTP 200;
- maior tempo observado no receiver: 2.214 ms;
- mirror final do canário: físico 3 / virtual 3;
- pedido canário final: `Aguardando confirmação`.

### Incidente de homologação
Primeira versão do trigger usou `min(uuid)`, inexistente no PostgreSQL, e causou respostas 500 temporárias. A flag shadow foi pausada, a função foi corrigida e o canário real foi repetido com sucesso.

Estado: **PASSOU**.

Próximo gate: substituir validação/reserva/consumo local de `products.stock` antes do cutover público para o saldo virtual do Bling.


## 2026-09-25 — Gate: motor de pedido usando estoque vendável
Estado: **PASSOU em legacy_shadow**.

- `create_vitrine_cart_order_v1` valida disponibilidade pelo `ops2_sellable_stock_v1`;
- 1.630/1.630 produtos ativos equivalentes ao saldo legado durante shadow;
- produto simples: PASS;
- insuficiência: PASS (`insufficient_stock`);
- cesta real com 27 componentes: PASS;
- testes transacionais com rollback e zero pedidos de teste persistidos;
- migration: `20260925_ops2_order_sellable_stock_read_v1.sql`;
- commit: `1276debb`.

Próximo gate: eliminar dupla reserva/consumo/release local antes de `stock_authority=bling`.


## 2026-09-25 — Gate: impedir dupla movimentação local sob autoridade Bling
Estado: **PASSOU**.

- reserva local: skip explícito quando `ops2_stock_authority=bling`;
- consumo de `products.stock`: skip explícito;
- restauração local: skip explícito;
- simulação Bling executada em transação e revertida;
- autoridade final: `legacy_shadow`;
- migration: `20260925_ops2_disable_legacy_stock_mutations_on_bling_v1.sql`;
- commit: `2ebff6d8`.

Observação: um teste legado renovou timestamps de 15 reservas de pedido existente; os timestamps foram restaurados imediatamente e nenhum saldo/status de pedido foi alterado. Não usar pedido real em próximos testes.


## 2026-09-25 — Gate: canário de leitura com autoridade Bling
Estado técnico: **PASSOU**. Cutover global: **BLOQUEADO**.

- simulação transacional de `ops2_stock_authority=bling`;
- read model retornou exatamente o saldo virtual Bling em três casos divergentes;
- rollback confirmado; autoridade final `legacy_shadow`;
- 1.087/1.630 iguais e 543 divergentes;
- extremos: 51 Bling >=5x legado; 6 legado >=5x Bling; 11 local positivo/Bling zero; 3 local zero/Bling positivo;
- não ativar globalmente até reconciliação determinística.


## 2026-09-25 — Gate: escrita de reconciliação no Bling
Estado: **BLOQUEADO CORRETAMENTE até recontagem física atual**.

- caminho de POST `/estoques` operação `B` confirmado no Hub;
- pós-escrita/verificação já existem;
- 9 contagens históricas são de 07–18/09 e não justificam saldo oficial em 25/09;
- regra canônica: contagem != regularização; causa da diferença deve ser classificada;
- 14 atenções de recontagem abertas (9 high + 5 normal);
- nenhuma escrita de saldo executada.


## 2026-09-25 — Estoque Mobile: fila de recontagem do cutover
Estado: **PROGRAMADO E VALIDADO / execução física pendente**.

- 14 blockers expostos no Balanço: 9 high + 5 normal;
- gateway Admin v39;
- RPCs restritas a service_role;
- recontagem que coincide com Bling resolve o blocker sem escrita ERP;
- divergência permanece aberta para classificação;
- escrita automática no Bling continua proibida;
- teste com rollback preservou a fila e nenhum saldo foi alterado.


## 2026-09-25 — Gate de classificação de divergência
Estado: **PROGRAMADO E VALIDADO / depende de contagem física**.

- divergência de recontagem agora gera revisão auditável;
- causa + nota são obrigatórias antes de ficar pronta para revisão ERP;
- nenhum movimento Bling é disparado pela classificação;
- acesso direto anon/authenticated bloqueado; service_role permitido;
- Admin gateway v40;
- 14 blockers preservados; 0 revisões artificiais criadas.


## 2026-09-25 — Pré-cutover determinístico do estoque Bling
Estado: **PASS TÉCNICO / BLOQUEADO SOMENTE POR 14 RECONTAGENS FÍSICAS**.

- 1630/1630 produtos ativos prontos no espelho Bling;
- depósito Geral selecionado;
- mirror gate e physical stock gate verificados;
- 0 controles físicos em review_required;
- 0 reservas locais vivas; 15 linhas expiradas de 1 pedido histórico/vivo não bloqueiam disponibilidade;
- 14 blockers, todos com GTIN e Bling product id distintos e mirror recente;
- reserve/consume/release testados em branch Bling com rollback: nenhum `products.stock` ou `vitrine_stock_reservations` foi alterado;
- autoridade permaneceu `legacy_shadow`;
- preflight automático criado e protegido (service_role only).


## 2026-09-25 — Inventory/activation guard do cutover
Estado: **PASS**.
- Inventory Mobile não escreve `products.stock` quando autoridade=`bling`;
- recontagem compara com saldo físico Bling atual, não snapshot histórico;
- teste rollback confirmou estoque local inalterado e zero resíduos;
- ativação Bling agora é fail-closed pelo preflight;
- rollback explícito exige motivo;
- funções de ativação/rollback são service_role-only;
- tentativa de ativação com 14 blockers foi recusada como esperado;
- autoridade final: `legacy_shadow`.


## 2026-09-25 — Canário de cutover + escritores locais
Estado: **PASS / CANÁRIO PREPARADO, NÃO ATIVADO**.
- auditoria encontrou e protegeu incidentes e recebimento XML contra escrita local após autoridade Bling;
- teste rollback de incidente confirmou estoque local inalterado;
- canário persistente preparado com run id `b22e416d-9b3d-432c-b76a-7a7ebcbf2b17`;
- check atual: 0 bad active rows, 0 mirror >24h, 0 physical review, 14 recount blockers;
- Admin gateway v41 mostra preflight, mas não oferece ativação pública;
- cutover segue fail-closed em `legacy_shadow`.


## 2026-09-25 — Gate de integridade de escritores de estoque
Estado: **PASS**.
- todos os escritores locais conhecidos foram mapeados;
- Admin product_save e rotinas de validade não escrevem saldo sob autoridade Bling;
- trigger zero-stock não usa saldo legado para desativar produto sob Bling;
- teste transacional do trigger PASS e rollback limpo;
- `ops2_stock_writer_guard=verified`;
- preflight agora exige esse gate;
- único blocker restante: 14 recontagens físicas;
- autoridade final `legacy_shadow`.


## 2026-09-25 — Separação: conferência EAN obrigatória
Estado: **PROGRAMADO + TESTE TRANSACIONAL PASS / HARDWARE E CANÁRIO REAL PENDENTES**.
- sessão e itens de conferência auditáveis;
- EAN estranho bloqueado;
- excesso bloqueado;
- conclusão incompleta bloqueada;
- conferência exata libera `ready`;
- Tablet Separação trocou SEPARADO por CONFERIR;
- Admin Edge v43;
- zero resíduos do teste;
- RPCs somente service_role.


## 2026-09-25 — Gate backend da conferência + Verificado Bling
Estado: **BACKEND PASS / BLING VERIFIED CODE READY / CANÁRIO REAL PENDENTE**.
- bypass `processing -> ready` fechado no PostgreSQL;
- teste rollback confirmou bloqueio sem check e liberação com check verified;
- transição Bling 915902 -> 24 = 504837240, ativa, sem ações;
- Hub v155 aceita canário `verified` somente se pedido local está ready e possui conferência EAN verified;
- nenhuma escrita externa executada;
- rollout global permanece OFF.


## 2026-09-25 — Encadeamento EAN -> Verificado Bling
Estado: **CODE READY / FAIL-CLOSED / CANÁRIO REAL PENDENTE**.
- Admin v44;
- Hub v156;
- dupla validação local ready + sessão EAN verified;
- flag dedicada `ops2_ean_verified_sync_enabled=false`;
- 0 pedidos novos processing/ready disponíveis para canário;
- nenhum pedido legado alterado;
- nenhuma escrita externa Bling;
- estoque continua `legacy_shadow`, com blocker físico independente.


## 2026-09-25 — Fiscal antes da expedição
Estado: **BACKEND/DB GATE PASS / EMISSÃO AUTOMÁTICA OFF**.
- `ready -> out_for_delivery` agora é protegido também no PostgreSQL;
- sem autorização fiscal: bloqueia;
- `authorized`/not_required: permite;
- teste transacional PASS e rollback limpo;
- Admin v45;
- DANFE permanece somente após autorização;
- fiscal runtime continua OFF para geração/autorização automática;
- nenhuma NF-e real emitida nesta rodada.


## 2026-09-25 — Baixa física no ponto de expedição
Estado: **CODE + DB GATE PASS / LIVE WRITE DORMANT ATÉ CUTOVER**.
- ação operacional idempotente `ops2_launch_physical_stock` criada;
- exige autoridade Bling + gate físico homologado + fiscal autorizado + pedido ready/Verificado;
- Admin integra a ação antes de `out_for_delivery`;
- DB também exige `state='launched'` quando autoridade=bling;
- teste rollback: sem baixa = bloqueado; launched = permitido;
- Hub v157; Admin v46;
- autoridade real permanece `legacy_shadow`, portanto zero nova baixa física real nesta rodada;
- nenhuma NF-e emitida nesta rodada.


## 2026-09-25/26 — Entregador: gate de pagamento para entrega
Estado: **DB + ADMIN PASS / BLING FINANCE SYNC AINDA BLOQUEADO**.
- pagamento efetivo já suportava até 8 partes; UI operacional usa até 2;
- novo gate DB impede `out_for_delivery -> delivered` sem settlement de entrega exato;
- soma das partes também é revalidada no banco;
- retorno ativo bloqueia entrega;
- teste rollback R$100: sem pagamento bloqueado; R$60 PIX + R$40 crédito permitido; zero resíduos;
- Admin v47;
- `bling_sync_state` permanece `blocked_homologation`: nenhuma baixa financeira Bling foi executada.


## 2026-09-25/26 — Pedido ↔ rota/parada DB invariant
Estado: **TESTE TRANSACIONAL PASS**.
- `orders.status` passou a sincronizar automaticamente a parada ativa;
- última parada concluída fecha a rota;
- writers fora da Edge não deixam mais pedido entregue com parada ainda aberta;
- teste rollback confirmou `delivered/delivered/completed`;
- SQL commit `95e43c00`;
- nenhum pedido/rota real foi usado como mutação.

## 2026-09-28 — Gôndolas: limpeza total + localização com balanço
Estado: **PROGRAMADO / BACKEND ATIVO / TESTE DE SINTAXE PASS**.
- Gôndola ganhou ação **Limpar gôndola**, com confirmação forte; remove somente `gondola` e `shelf` dos produtos, sem apagar cadastro ou alterar estoque;
- limpeza em lote passa pela API administrativa e gera evento operacional `gondola.cleared` com quantidade removida;
- novo modo **Localizar + balanço**: EAN apenas seleciona o produto; nada é gravado até operador informar e confirmar a quantidade física;
- confirmação executa o mesmo motor oficial de balanço (`ops_record_inventory_count_v1` + reconciliação) e depois grava a localização da gôndola;
- autoridade de estoque verificada nesta rodada: `bling`; por isso a contagem física não força `products.stock` fora do ERP e divergências seguem a reconciliação existente;
- modo **Só localizar** permanece disponível e não altera estoque;
- Admin frontend commit `94772f11`; backend commits `142282f9` e `edec2f5a`; Edge `admin-products-live-v1` v55 ACTIVE / health interno v39;
- nenhum produto/gôndola real foi alterado durante os testes desta implementação.



## 2026-09-28 — R3: falha de entrega / retorno / reentrega / cancelamento
Estado: **PROGRAMÁVEL FECHADO / CANÁRIO FÍSICO ADIADO**.

Revisão confirmou que a base já existente cobre:
- falha de entrega somente em `out_for_delivery`;
- bloqueio se pagamento já tiver sido capturado;
- retorno físico sem devolver mercadoria automaticamente ao estoque;
- reentrega mantendo a mercadoria alocada ao mesmo pedido;
- retorno de pagamento recusado/desistência/outros em `returned_review`;
- bloqueio de nova saída e de `delivered` enquanto retorno estiver aberto;
- cancelamento íntegro bloqueado se existir pagamento capturado;
- avaria/falta não restaura o pedido inteiro: permanece em revisão e deve seguir Estoque Mobile/incidente.

Hardening desta R3 após cutover Bling:
- `ops_resolve_delivery_return_review_v1(cancel_intact)` agora é fail-closed sob `ops2_stock_authority=bling`;
- cancelamento só prossegue se `bling_order_stock_controls_v2.state='reversed'`;
- evita cancelamento local sem estorno da baixa física oficial;
- reversão usa o mecanismo idempotente já homologado `claim_bling_order_stock_action_v2/finish_bling_order_stock_action_v2`;
- Admin v57 aciona primeiro a reversão protegida e só depois conclui o cancelamento;
- reentrega não estorna estoque e o novo despacho reutiliza `state=launched`, evitando dupla baixa;
- falha/incerteza no estorno entra em atenção crítica e não deve ser repetida automaticamente.

Restrição de infraestrutura:
- projeto atingiu o limite de Edge Functions do plano;
- nenhuma função nova foi criada;
- o Edge legado sem referências `shopping-room-reset-v1` foi reaproveitado temporariamente como worker interno de estorno R3, protegido por bearer de service role;
- registrar rename/consolidação para cleanup futuro quando houver capacidade de remover/reorganizar Edge Functions.

Teste transacional:
- pedido + retorno sintéticos;
- `cancel_intact` sem `state=reversed` foi bloqueado por `bling_physical_stock_reverse_required_before_cancel`;
- rollback completo;
- 0 pedidos e 0 retornos sintéticos residuais.

Deploys/commits:
- migration aplicada: `ops2_r3_return_cancel_bling_stock_guard_v1`;
- SQL canônico: `483e4834`;
- Admin: `38b486c1`, Edge `admin-products-live-v1` v57 ACTIVE;
- worker interno versionado: `7d5396b5`, Edge `shopping-room-reset-v1` v3 ACTIVE.

Nenhum pedido real, NF-e, pagamento ou estoque real foi alterado durante os testes desta R3.


## 2026-09-28 — R4: fiscal operacional NF-e / DANFE
Estado: **PROGRAMÁVEL FECHADO / EMISSÃO REAL NÃO EXECUTADA**.

### Hardening aplicado
- novo preflight `ops2_fiscal_dispatch_preflight_v1(order_id)`;
- emissão só pode ser armada se:
  - pedido = `ready`;
  - vínculo Bling = `matched`;
  - pedido pós-cutover estiver comprovadamente `Verificado` no Bling;
  - soma das linhas = `fiscal_subtotal`;
  - `fiscal_subtotal + other_expenses - discount = total`;
  - despesas/descontos não forem negativos;
- trigger em `fiscal_runtime_config` impede armar canário/generação/autorização quando o preflight falha;
- diferença de cesta permanece representada por `other_expenses`, sem criar item fiscal falso.

### Pagamento
- rota legada `order_fiscal_confirm_payment` foi desativada no Admin;
- pagamento real continua vindo do settlement da entrega;
- evita reintroduzir o antigo ciclo impossível “entrega -> confirmar pagamento -> emitir NF-e” quando a expedição exige NF-e antes da saída.

### Jobs / retry / SEFAZ
- job `authorized` agora exige:
  - invoice id;
  - chave de acesso com 44 dígitos;
  - status SEFAZ preenchido;
- write attempts continuam limitados a 1;
- retry após POST irreversível continua **reconcile-only**, nunca repetição cega;
- health RPC `get_ops2_fiscal_dispatch_health_v1` adicionada para detectar `generating/authorizing` presos, review/error e documentos autorizados inválidos.

### Estado observado
- 2 jobs históricos autorizados;
- 2/2 com chave de 44 dígitos;
- 0 review_required;
- 0 error;
- 0 generating stale;
- 0 authorizing stale;
- 0 authorized_invalid_document.

### Canário pós-cutover
Pedido `DA-260928-D6432EB3`:
- total produtos/fiscal: R$ 171,28;
- outras despesas: R$ 3,91;
- total canônico: R$ 175,19;
- recomposição fecha exatamente;
- preflight ainda bloqueia corretamente por:
  - `order_not_ready`;
  - `bling_order_not_verified`.

### Testes
- tentativa transacional de armar emissão para o canário foi bloqueada;
- runtime permaneceu com geração/autorização/canário OFF;
- job sintético `authorized` com chave inválida foi recusado;
- rollback completo, 0 resíduos;
- advisors sem novo bloqueador; permanecem achados históricos já conhecidos.

### Runtime
- `admin-products-live-v1` v59 ACTIVE;
- emissão automática continua OFF;
- gate de expedição permanece `enforce`;
- autorização fiscal continua obrigatória antes da expedição.

### Commits
- `c2d48375` + fix `b8c3520d`: preflight fiscal e guard do runtime;
- `fbeceb98`: desativa confirmação fiscal antiga de pagamento;
- `4445de84`: integridade de job fiscal e health;
- `2099fc20`: Admin mostra bloqueios do preflight antes de emitir.

Nenhuma NF-e nova foi gerada, enviada ou autorizada nesta R4.


## 2026-09-28 — R5: estoque Bling pós-cutover
Estado: **PASS / DIAGNÓSTICO PÓS-CUTOVER CORRIGIDO**.

O plano antigo tratava a R5 como readiness pré-cutover, porém o cutover já ocorreu na R1. A rodada foi adaptada para auditoria pós-cutover.

### Estado real
- `stock_authority=bling`;
- Hub live;
- depósito selecionado: `14887252169`;
- physical stock gate = verified;
- mirror gate = verified;
- writer guard = verified;
- 1.610 produtos ativos;
- 1.610/1.610 com saldo Bling pronto;
- 0 ativos sem cobertura;
- 0 mirrors ativos >24h;
- 0 controles físicos em `review_required`.

### Correção do preflight
O preflight legado ainda reportava `ready=false` porque carregava regras de ativação pré-cutover:
- 14 atenções históricas de recontagem;
- reservas locais de proteção.

Após o cutover esses itens são informativos e não devem declarar o runtime indisponível.

`get_ops2_stock_cutover_preflight_v1()` agora distingue:
- `pre_cutover`: mantém os gates antigos;
- `post_cutover_live`: readiness depende de cobertura Bling, freshness do mirror, gates físico/mirror/writer, depósito e ausência de `review_required`.

Resultado atual:
- `phase=post_cutover_live`;
- `ready=true`;
- `blocking_reasons=[]`;
- 14 recount blockers continuam visíveis como `informational`;
- reservas locais continuam visíveis como `informational`.

### Writer test
Teste sintético transacional executou:
`reserve_vitrine_order_stock_v1 -> consume_vitrine_order_stock_v1 -> release_vitrine_order_stock_v1`
sob autoridade Bling.

Resultado:
- `products.stock` não mudou;
- rollback completo;
- 0 pedido sintético residual;
- 0 reserva sintética residual.

### Baixa/reversão
- controle físico continua idempotente por `bling_order_stock_controls_v2`;
- estado observado real: 1 controle `reversed`, 0 `review_required`;
- R3 já reforçou que cancelamento após saída exige reversão oficial Bling.

### Commit
- `13ec5c66` — preflight pós-cutover correto.

Nenhum estoque real foi alterado nesta R5.


## 2026-09-28 — R6: lotes / validade / FEFO / ofertas
Estado: **PROGRAMÁVEL FECHADO / ADOÇÃO DE LOTES GRADUAL**.

### Problema corrigido
O modelo anterior tinha apenas `products.validity_date`. Uma validade vencida podia desativar o produto inteiro, mesmo que existisse outro lote válido.

### Modelo novo
Criado `product_inventory_lots` com:
- produto;
- lote;
- validade;
- quantidade física;
- quantidade reservada;
- status;
- origem;
- referência externa;
- recebimento;
- metadata.

Views:
- `ops2_product_lot_summary_v1`;
- `ops2_expiry_offer_policy_v1`.

RPCs:
- `ops2_upsert_product_lot_v1`;
- `ops2_set_lot_tracking_complete_v1`;
- `ops2_fefo_preview_v1`;
- `ops2_reconcile_lot_expiry_status_v1`.

### Segurança de adoção
O modo lote é fail-safe e gradual:
- enquanto `lot_tracking_complete=false`, vale a regra legada de `products.validity_date`;
- `lot_tracking_complete=true` só pode ser ativado se todos os lotes estiverem quantificados;
- a soma física dos lotes precisa conferir com `sellable_physical` do Bling;
- divergência bloqueia a ativação;
- nenhum produto real foi convertido automaticamente para o novo modo.

### FEFO
Quando o tracking está completo:
- validade efetiva = lote vendável mais próximo;
- FEFO ignora lote vencido/quarentena/depletado;
- produto não é desativado se existir qualquer outro lote vendável;
- se produto havia sido desativado somente por vencimento e aparece lote válido, pode ser reativado;
- `products.validity_date` vira compatibilidade visual com a validade FEFO efetiva.

### Ofertas automáticas
Faixas confirmadas:
- 0–29 dias: 40%;
- 30–59 dias: 20%;
- 60–90 dias: 10%;
- 91+ dias: sem oferta automática.

A automação usa o lote FEFO quando tracking completo e a validade legada quando ainda não estiver completo.

### Admin
`admin-products-live-v1` v60 ACTIVE:
- endpoints para listar lotes;
- salvar lote;
- ativar/desativar tracking completo;
- preview FEFO;
- tela de vencimentos usa validade efetiva e mostra origem `lot_fefo` ou `legacy`;
- edição direta da validade legada é bloqueada quando tracking de lotes está completo.

### Testes transacionais
1. Produto real usado somente dentro de rollback, estoque físico Bling = 2:
   - lote vencido qty 1;
   - lote válido +20 dias qty 1;
   - tracking completo aceito porque 1+1 = físico 2;
   - produto permaneceu vendável;
   - validade efetiva = lote +20;
   - desconto = 40%;
   - FEFO alocou o lote válido.
2. Fronteiras testadas:
   - 29 => 40%;
   - 30 => 20%;
   - 59 => 20%;
   - 60 => 10%;
   - 90 => 10%;
   - 91 => null.
3. Tracking com soma dos lotes 1 e físico Bling 2 foi bloqueado por `lot_tracking_physical_mismatch`.
4. Todos os testes terminaram com rollback e 0 resíduos.

### Commits
- `00f5414d` — modelo lotes/FEFO;
- `6e34c20e` — Admin lot-aware v60;
- `8bfe6ced` — reconciliação obrigatória com físico Bling.

Nenhum lote real foi criado e nenhum produto real foi alterado permanentemente nesta R6.


## 2026-09-28 — R7: compras / XML / fornecedores / caixa→unidade
Estado: **PROGRAMÁVEL FECHADO / RECEBIMENTO FÍSICO BLING AINDA HUMANO**.

### Estado auditado
- 33 XMLs armazenados;
- 65 itens;
- 23 documentos `processed`;
- 10 documentos `review_required`;
- 11 itens `inferred_xml`;
- 9 `known`;
- 14 `not_needed`;
- 31 itens em revisão;
- rotina diária ativa às 06:00 Cuiabá, lookback 3 dias;
- `stock_authority=bling`;
- 0 recebimentos físicos aplicados por este módulo;
- 0 violações CPF -> financeiro empresarial.

### Recebimento sob autoridade Bling
O antigo RPC local já bloqueava soma em `products.stock` sob autoridade Bling. A R7 completou o caminho correto:
1. XML precisa estar processado e todos os itens resolvidos/conversões aprovadas;
2. `get_purchase_xml_receipt_preflight_v1`;
3. `prepare_purchase_stock_receipt_plan_v1` grava baseline físico do Bling;
4. recebimento/check-in permanece no Bling;
5. `verify_purchase_stock_receipt_plan_v1` exige mirror observado depois do plano e delta físico >= quantidade esperada;
6. só então a nota vira `received`;
7. `local_stock_applied=false`.

Linhas repetidas do mesmo produto na NF-e são agregadas antes da comparação, evitando falso delta.

Teste em rollback com nota real pronta:
- plano criado como `awaiting_bling_receipt`;
- verificação imediata não aprovou;
- nenhum `purchase_stock_receipt` foi aplicado;
- 0 resíduos após rollback.

### Lotes/validade no XML
O parser agora lê o grupo NF-e `rastro`:
- `nLote`;
- `qLote`;
- `dFab`;
- `dVal`;
- `cAgreg`.

Evidência fica em `purchase_xml_item_lot_evidence`; não vira estoque/lote automaticamente.
Backfill seguro leu os 33 XMLs já armazenados:
- 33 documentos lidos;
- 0 falhas;
- 0 registros `rastro` encontrados.

Portanto nenhum lote/validade histórico foi inventado.

### Caixa/fardo -> unidade
Foi encontrado um caso real inseguro:
- item: `ARROZ DUBOM FT 6X5`;
- o XML havia gerado fator 30 por razão tributária de peso;
- 20 fardos viraram incorretamente 600 unidades na camada de histórico;
- custo derivado R$ 3,00;
- custo/preço do cadastro do produto continuavam NULL, portanto a inferência errada não chegou a ser aprovada no catálogo.

Correção:
- item passou para `review_required`;
- fator/quantidade/custo derivados foram limpos;
- regra de embalagem inferida passou para revisão;
- documento voltou para `review_required`;
- fator 6 aparece apenas como **sugestão pela descrição `FT 6X5`**, nunca como confirmação automática.

Regra futura:
- razão qTrib/qCom só vira fator automático quando a unidade tributável for unitária (`UN/UND/PC/...`);
- peso/volume não pode virar contagem de unidades;
- descrição explícita de embalagem pode sugerir fator;
- regra salva automaticamente só é reutilizada quando estiver `confirmed`.

Auditoria dos outros 11 `inferred_xml` encontrou correspondência explícita entre descrição e fator (FD6, FD10, CX12, CX20, CX24, CX120 etc.); nenhum outro conflito foi identificado.

### CPF/CNPJ
- constraint DB continua bloqueando CPF com `financial_eligible=true`;
- teste sintético confirmou o bloqueio e terminou com rollback;
- CPF continua sem conta a pagar empresarial;
- tratamento fiscal/contábil de entrada física comprada em CPF continua dependente da política do contador e NÃO foi automatizado;
- CNPJ mantém conciliação/financeiro existente com deduplicação.

### Admin
A interface antiga ainda dizia que “somava estoque”. Foi corrigida:
- `Preparar entrada`: cria baseline/plano, não mexe em estoque;
- operador recebe/confirma no Bling;
- `Verificar entrada no Bling`: comprova mirror novo + delta físico;
- só após prova mostra `Entrada confirmada no Bling`.

Commit UI: `39247fa6`.

### Segurança/observabilidade
- `get_ops2_purchase_xml_health_v1()` criado;
- views de lotes R6 agora `security_invoker=true`;
- acesso anon/auth dessas views revogado; service_role mantém SELECT;
- tabelas novas R7 têm RLS e são restritas ao service_role;
- advisors: nenhum novo achado crítico; permanecem achados históricos do projeto.

### Runtime/commits
Hub observado: `admin-service-intelligence-v1` v207 ACTIVE no fechamento desta rodada.
O `admin-products-live-v1` foi observado em v64 por trabalho paralelo; a R7 não sobrescreveu esse Edge.

Commits principais:
- `9e121663` — preflight/plano/evidência de lote;
- `d8806bf9` — agregação + freshness/delta de recebimento;
- `9df04d56` / `8e29a3b7` — parser rastro + fluxo protegido;
- `de6c0f04` / `2b1f4455` / `237b0e72` — backfill seguro;
- `6eef73a3` / `d6456b81` — conversão segura;
- `717d74c3` — quarentena DUBOM;
- `13f7570a` / `e206cb8d` — estado do plano no detalhe;
- `39247fa6` — UX de recebimento Bling;
- `7b4e30a3` — health + segurança das views.

Nenhum estoque real foi movimentado e nenhuma nota foi marcada como recebida artificialmente nesta R7.
