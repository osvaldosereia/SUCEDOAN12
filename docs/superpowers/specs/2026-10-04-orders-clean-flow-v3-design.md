# Pedidos V3 — fluxo operacional limpo

## Objetivo
Substituir a gestão atual de pedidos por um único fluxo operacional simples, sem módulos sobrepostos ou código morto: **Confirmado → Separado → Entregue → Fiscal**.

## Princípios
- Uma única tela/lista de Pedidos, sempre com todos os pedidos, ordenados por `created_at DESC`.
- A UI não expõe os estados técnicos intermediários `processing`, `ready` e `out_for_delivery`; quando precisarem continuar no banco durante a migração, são detalhes internos e nunca uma segunda lógica operacional.
- Remover `vitrine/admin/orders-unified-queue-v1.js` e incorporar a nova experiência diretamente na implementação canônica do Admin.
- Depois de confirmado, produtos/quantidades ficam travados. Antes de iniciar a separação, uma ação explícita pode reabrir o pedido. Depois que qualquer item for marcado na separação, composição não reabre.
- NF-e não bloqueia separação nem entrega. Por enquanto, fiscal ocorre somente depois de `delivered`.

## Lista de pedidos
Cada card exibe no topo: código, data/hora, cliente, total atual e etiquetas de marcos já concluídos.

Controles pequenos e discretos:
- `CONFIRMADO`: confirma/reserva o pedido. Após concluído, vira etiqueta no topo.
- `SEPARADO`: não marca artificialmente; abre/continua a separação. Só vira etiqueta quando a conclusão real da separação estiver persistida.
- `ENTREGUE`: só habilita após separação concluída. Abre confirmação curta de entrega + pagamento. Após concluído, vira etiqueta no topo.

Ações do card:
- `ABRIR VITRINE SEPARAÇÃO`
- `ABRIR PEDIDO`

Não há filtros de estágio no topo, confirmação em massa, coluna “próxima ação”, nem “Vitrine Cliente” na lista.

## Vitrine de separação
Abre como **bottom sheet dentro do Admin**, subindo de baixo para cima, com X no topo. Não abre nova aba.

Cada item mostra foto, nome, quantidade, preço e exatamente dois botões:
- `SEPARADO`
- `FALTOU`

Enquanto houver item pendente, `CONCLUIR SEPARAÇÃO` permanece bloqueado.

Na conclusão:
- itens `FALTOU` ficam persistidos em `order_separation_items_v1`;
- `missing_subtotal` é abatido uma única vez;
- `orders.total`, `subtotal` e `fiscal_subtotal` passam ao valor final;
- estoque é aplicado apenas aos itens efetivamente separados;
- o pedido passa a representar operacionalmente **Separado**, sem avançar para entrega;
- a vitrine pública é regenerada.

## Vitrine do cliente
A vitrine pública mostra:
- total original quando houve falta;
- valor abatido;
- total final;
- cada item com estado visível, incluindo `FALTOU`;
- itens faltantes permanecem visíveis, não desaparecem.

O botão `VITRINE CLIENTE` fica apenas dentro do pedido aberto e usa o canal oficial da conversa vinculada (0975/1018), falhando fechado quando não houver identificação segura.

## Pedido aberto
O modal deixa de ser uma central técnica e passa a ser uma ficha operacional.

### Cabeçalho
- pedido, data, cliente, telefone;
- total atual;
- etiquetas `CONFIRMADO`, `SEPARADO`, `ENTREGUE` e `NF-e` quando aplicável.

### Bloco 1 — Cliente e entrega
- nome, telefone, endereço, referência;
- edição permitida enquanto não entregue;
- botão para abrir conversa/WhatsApp quando houver;
- sem duplicação de resumo do cliente.

### Bloco 2 — Itens
- lista única dos itens;
- antes de confirmado: edição existente permitida;
- após confirmado: somente leitura;
- depois da separação, itens `FALTOU` aparecem destacados e o resumo financeiro mostra original, abatimento e final.

### Bloco 3 — Atendimento
- `ENVIAR/ABRIR VITRINE CLIENTE`;
- cadastro pendente somente quando realmente necessário;
- sem três botões redundantes de WhatsApp da empresa.

### Bloco 4 — Operação
- botão contextual único: confirmar, abrir separação ou confirmar entrega;
- reabrir somente antes da separação começar;
- cancelar até antes de entregue, com motivo e tratamento de estoque.

### Bloco 5 — Fiscal
Visível como bloco simples somente depois de `ENTREGUE`:
- status Bling/NF-e;
- ação humana de emitir/autorizar quando habilitada;
- DANFE quando disponível.

Detalhes de diagnóstico ERP/Bling ficam fora do fluxo normal. Erros relevantes aparecem como aviso objetivo, com uma ação de correção quando houver.

## Entrega e pagamento
`ENTREGUE` confirma entrega e recebimento juntos. O diálogo mostra:
- forma de pagamento prevista;
- seletor da forma efetivamente recebida;
- valor recebido, preenchido com o total final;
- confirmação única.

A transação registra pagamento e só então conclui `delivered`. NF-e passa a ficar elegível após isso.

## Limpeza de legado
Remover da UI e, quando sem consumidores, do código:
- `orders-unified-queue-v1.js`;
- filtros `Todos/Separar/Pronto/Entrega/Finalizado` e filtros de problemas;
- confirmação em massa;
- fila paralela “Separação” usada como uma segunda gestão de pedidos;
- `orderRowPrimaryActionHtml`/“Próxima ação” quando substituídos pelo card V3;
- controles pré-entrega de NF-e e gate fiscal de expedição na UI;
- integrações/diagnósticos duplicados no pedido aberto.

Não remover tabelas/RPCs históricas apenas por não aparecerem na UI. Primeiro migrar consumidores, depois excluir somente código sem chamada.

## Compatibilidade de dados
Durante a migração, estados antigos existentes devem ser traduzidos para marcos V3:
- `storefront_received`/`created` → não confirmado;
- `confirmed`/`processing` → confirmado;
- `ready`/`out_for_delivery` com conclusão de separação → separado;
- `delivered` → entregue.

Pedidos já existentes não podem perder histórico, valores, faltas, estoque ou vínculo com Bling.

## Critérios de aceite
1. A página Pedidos não depende de script que sobrepõe a UI antiga.
2. Todos os pedidos aparecem em ordem do mais recente.
3. Confirmado/Separado/Entregue funcionam como marcos reais e etiquetas.
4. Separação é bottom sheet e não nova aba.
5. `FALTOU` abate o total uma única vez e aparece para o cliente.
6. Concluir separação não marca o pedido como em entrega.
7. Entrega exige confirmação do recebimento.
8. NF-e só entra no fluxo após entregue.
9. Pedido aberto não mostra ruído técnico desnecessário.
10. Testes antigos conflitantes são removidos/atualizados junto com o código que protegiam.