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
