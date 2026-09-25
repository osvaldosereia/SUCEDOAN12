# Dona Antônia Operations 2.0 — Fluxo Máximo de Automação (DRAFT)

> Documento de análise. Não implementar ainda.
> Última atualização: 2026-09-25.

## Objetivo
Desenhar o fluxo diário com o **mínimo possível de interação humana**, usando o Bling para tudo que ele resolve bem e deixando no Admin apenas interfaces extremamente simples para as ações que realmente precisam de pessoa.

Premissa do usuário:
- pedidos chegam pelo site;
- alguns pedidos precisam ser lançados manualmente por causa do WhatsApp;
- nenhum pedido deve ir para separação sem aprovação/confirmação, porque alguns clientes desistem;
- após aprovação, o ideal é imprimir automaticamente uma lista de separação em impressora térmica de bobina ~85 mm;
- funcionários devem usar tablet vertical/computador com pouquíssimos botões;
- automações devem assumir todo o restante que for seguro.

## Descobertas do Bling relevantes

### Situações e transições
O Bling permite:
- criar situações personalizadas;
- definir transições permitidas;
- executar ações automáticas ao mudar de situação;
- lançar estoque e contas em transições.

Fonte oficial:
https://ajuda.bling.com.br/hc/pt-br/articles/360039070654-Gerenciador-de-transi%C3%A7%C3%B5es-para-situa%C3%A7%C3%B5es-de-pedidos-de-venda

### Reserva sem dar baixa física
O Bling permite escolher quais situações dos pedidos entram no cálculo de reserva de estoque.

Portanto podemos ter:
- `Aguardando confirmação` -> NÃO reserva;
- `Aprovado / Separar` -> reserva;
- `Verificado` -> saída física, conforme configuração.

Fonte:
https://ajuda.bling.com.br/hc/pt-br/articles/360036512833-Como-dar-baixa-no-estoque-no-momento-que-o-pedido-for-feito-Reserva-de-estoque

### Criação do pedido já com situação
A API do Bling passou a aceitar `situacao.id` já no POST de pedido de venda (changelog v323, 28/05/2025).

Fonte:
https://developer.bling.com.br/changelogs

### Webhook de pedido
Bling possui webhook `order.created/updated/deleted`, permitindo fluxo reativo sem polling.

Fonte:
https://developer.bling.com.br/webhooks

### Checkout
Checkout Bling suporta Picking/Packing, leitura EAN/GTIN, usuário em separação, checkout parcial e finalização como Verificado.

Fontes:
https://ajuda.bling.com.br/hc/pt-br/articles/18134856833943-Como-utilizar-o-checkout-de-pedidos-de-vendas-no-Bling
https://ajuda.bling.com.br/hc/pt-br/articles/360036545814-O-que-fazer-para-aparecer-todos-os-produtos-da-venda-no-Checkout-de-pedidos

### Estoque após checkout
O Gerenciador de Transições pode lançar estoque automaticamente quando o pedido vira `Verificado`.

Fonte:
https://ajuda.bling.com.br/hc/pt-br/articles/360037052553-Como-lan%C3%A7ar-estoque-automaticamente-ap%C3%B3s-realizar-o-checkout-de-pedidos-de-vendas

### Relatório de separação
Relatório nativo possui:
- código;
- cliente;
- pedido;
- GTIN/EAN;
- descrição;
- quantidade;
- lote;
- localização;
- saldo;
- desmembramento de kits;
- ordenação por localização.

Fonte:
https://ajuda.bling.com.br/hc/pt-br/articles/14923712469527-Como-gerar-relat%C3%B3rio-de-separa%C3%A7%C3%A3o-de-vendas-no-Bling

### Imagens
Bling possui imagem no cadastro e imagens podem aparecer em impressão detalhada de venda/proposta, mas a documentação do **Relatório de Separação** não lista imagem como coluna.

Fonte:
https://ajuda.bling.com.br/hc/pt-br/articles/360036009454-Como-inserir-imagens-no-produto

### Impressão automática nativa
Bling automatiza DANFE/etiqueta depois do Checkout e usa QZ Tray.
Não foi encontrada documentação oficial de impressão automática de um **relatório de separação customizado com foto em bobina de 85 mm imediatamente ao aprovar o pedido**.

Conclusão: esta impressão é uma das poucas customizações Dona Antônia realmente justificadas.

## Fluxo recomendado — ponta a ponta

### ETAPA 0 — Pedido nasce

#### A. Site
Cliente fecha pedido no donaantonia.com.br.

Automático:
1. validar estoque comercial, mínimo, cidade, endereço, cesta e preço;
2. criar pedido canônico;
3. criar/espelhar pedido no Bling na situação `Aguardando confirmação`;
4. NÃO reservar estoque ainda;
5. registrar origem `site`;
6. enviar resumo para WhatsApp/PapoAI;
7. pedir confirmação do cliente.

#### B. WhatsApp/manual
Cliente insiste em comprar pela conversa.

Atendente usa uma tela simples:
**Nova venda WhatsApp**

Automático:
- localizar cliente;
- preencher endereço/histórico;
- adicionar produtos/cesta;
- aplicar regra de cesta;
- calcular total;
- gerar resumo.

O pedido também nasce como `Aguardando confirmação`.

### ETAPA 1 — Confirmação antes da separação

Objetivo: impedir separação de pedidos que o cliente abandonou.

#### Melhor automação
A aprovação deve ser, sempre que possível, **confirmação do próprio cliente pelo WhatsApp**, e não um clique interno adicional.

PapoAI envia:
- resumo;
- total;
- endereço;
- pagamento previsto;
- chamada simples: Confirmar / Cancelar.

Se o cliente confirma:
1. evento é registrado;
2. pedido muda automaticamente para `Aprovado / Separar`;
3. Bling é atualizado;
4. estoque passa a ficar reservado no Bling;
5. impressão de separação é disparada.

Se o cliente cancela:
- pedido vai para Cancelado;
- não reserva;
- não imprime;
- não entra na operação.

Se não responde:
- continua `Aguardando confirmação`;
- Control Tower mostra após SLA;
- follow-up pode ser automático dentro das regras WhatsApp/Meta;
- só vai para humano se necessário.

#### Exceção manual
Quando o atendente já recebeu uma confirmação inequívoca na conversa:
**[Cliente confirmou]**
pode aprovar diretamente.

Tudo deve ficar auditado com ator e, quando possível, message_id da confirmação.

## ETAPA 2 — Aprovação dispara tudo automaticamente

Ao pedido entrar em `Aprovado / Separar`:

1. Bling passa a considerar o pedido na reserva;
2. webhook/evento confirma a mudança;
3. cria job de impressão idempotente;
4. impressora térmica recebe automaticamente a lista;
5. Control Tower muda pedido para fila `Separar`.

Nenhum funcionário precisa:
- abrir Bling;
- gerar relatório;
- escolher impressora;
- clicar em imprimir;
- lançar reserva;
- lançar status manualmente.

## ETAPA 3 — Lista de separação térmica 85 mm

### Por que custom
O relatório nativo do Bling tem excelentes dados de picking, mas não documenta:
- foto no relatório de separação;
- layout dedicado 85 mm;
- disparo automático na aprovação.

A Dona Antônia já possui praticamente todas as fotos.

Estado atual observado:
- produtos ativos: 1.634;
- com imagem: 1.631 (~99,8%);
- com GTIN: 1.611 (~98,6%);
- com gôndola: 629;
- com prateleira: 625;
- com gôndola + prateleira: 624 (~38,2%);
- com foto + GTIN + localização completa: 620 (~37,9%).

**Maior bloqueador não é foto nem EAN; é localização física.**

### Layout recomendado
Bobina 85 mm, vertical e comprida.

Cabeçalho:
- PEDIDO #DA-XXXX
- nome curto do cliente
- hora aprovação
- QR do pedido

Para cada item, ordenado por:
`gôndola -> prateleira -> nome`

Exemplo conceitual:

[FOTO 22-25 mm]   **3x**
ARROZ TIO BONINI 5KG
EAN 789...
GÔNDOLA 04 · PRAT. B

Para cestas:
- imprimir componentes individualizados;
- cabeçalho opcional: `Cesta Grande — componentes`;
- nunca imprimir preço unitário ao separador.

Rodapé:
- total de linhas;
- total de unidades;
- QR para abrir o pedido;
- código curto para reimpressão.

### Impressora
Direção recomendada:
- impressora térmica fixa conectada ao computador do estoque;
- QZ Tray já é tecnologia usada pelo Bling para impressão local PDF/ZPL;
- avaliar reutilizar o mesmo QZ Tray para a impressão custom Dona Antônia;
- alternativa: agente local mínimo de impressão.

Tablet não precisa estar fisicamente conectado à impressora.

### Falha de impressão
Nunca impedir o pedido inteiro silenciosamente.
Control Tower mostra:
`Pedido aprovado — impressão falhou`
com botão **Reimprimir**.

## ETAPA 4 — Separação física

O separador trabalha principalmente com o papel.

Não precisa abrir ERP enquanto coleta.

A folha já sai em rota física de estoque.

### Finalização
No final da separação:
- funcionário lê o QR da folha no tablet **ou**
- toca no pedido da fila;
- tela mostra apenas:
  **[SEPARADO]**
  **[PROBLEMA]**

Se `PROBLEMA`:
- Sem estoque
- Produto não encontrado
- Produto danificado
- Outro

A Control Tower trata exceção.

## ETAPA 5 — Conferência

Minha recomendação é **não eliminar a conferência por código de barras**.

É uma interação humana pequena que reduz erro de entrega.

Direção:
- segundo tablet/computador dedicado à conferência;
- ler QR/número do pedido;
- usar Bling Checkout em modo Picking ou Packing;
- bipar EANs;
- finalização vira `Verificado` automaticamente.

Homologar qual modo é mais rápido:
- Picking: todos itens visíveis;
- Packing: um item por vez.

Se a UX do Checkout no tablet for ruim, considerar uma interface fina própria, mas somente após POC. Não duplicar antes de testar o nativo.

## ETAPA 6 — Após Verificado

Automático:
1. Bling muda para Verificado;
2. Gerenciador de Transições pode lançar estoque automaticamente;
3. baixa de lote pode seguir FEFO/validade;
4. workflow fiscal entra automaticamente;
5. documentos são gerados/impressos conforme configuração homologada;
6. pedido entra em `Pronto para expedição`.

**A posição exata de geração/autorização da NF-e continua dependente do fechamento fiscal do pagamento na entrega.**
Ver `FINANCE-PAYMENT-DELIVERY-DRAFT.md`.

## ETAPA 7 — Expedição

Automático:
- agrupar pedidos aptos;
- impedir saída de pedido com bloqueio;
- montar rota sugerida;
- usar endereço + localização WhatsApp quando disponível;
- preparar romaneio/driver view;
- enviar para a tela do entregador.

Funcionário interno idealmente só precisa ver:
**X pedidos prontos para rota**

e:
**[Liberar carro/rota]**
ou nem isso se regra permitir automatizar lote de rota em horários definidos.

## ETAPA 8 — Entregador

Tela vertical extremamente simples.

Para cada parada:
- cliente;
- endereço;
- referência;
- Maps;
- WhatsApp;
- total;
- pagamento previsto.

Botões:
**[ENTREGUE]**
**[NÃO ENTREGUE]**

Ao tocar Entregue:
- escolher pagamento efetivo;
- permitir split;
- validar soma;
- confirmar.

Esse é um dos poucos pontos em que intervenção humana é inevitável porque o pagamento acontece fisicamente.

## ETAPA 9 — Fechamento automático

Após confirmação:
- financeiro Bling é atualizado/conferido;
- fiscal é conciliado conforme fluxo homologado;
- pedido fecha;
- cliente recebe confirmação/agradecimento;
- histórico do cliente atualiza;
- ledger registra tudo;
- Control Tower remove das pendências.

Se houver divergência, entra automaticamente em:
**Precisa de você**

## Uso dos 2 tablets

### Tablet 1 — Operação
Tela fixa vertical:
- Aguardando confirmação (somente exceções)
- Separar
- Separados
- Problemas

Ações grandes:
- Cliente confirmou
- Separado
- Problema
- Reimprimir

### Tablet 2 — Conferência/expedição
Preferência:
- Bling Checkout dedicado para bipagem;
- depois tela Dona Antônia para expedição/entregador quando necessário.

Também pode ficar no computador com leitor USB se for mais rápido.

## Quantidade de cliques humanos ideal

### Pedido do site, cliente confirma no WhatsApp
Funcionário:
- 0 cliques até a separação;
- 1 clique ao terminar separação;
- bipagens de conferência;
- 0 cliques para estoque/documentos quando automação homologada.

### Pedido WhatsApp lançado manualmente
Funcionário:
- lança o pedido;
- cliente confirma;
- depois fluxo igual ao site.

### Expedição/entrega
Entregador:
- confirmar entrega;
- informar pagamento efetivo;
- exceção se não entregar.

## Status propostos

### Visão do funcionário
- Aguardando confirmação
- Separar
- Separando
- Conferir
- Pronto
- Em entrega
- Entregue
- Problema

### Bling
Usar situações nativas/customizadas apenas onde necessário:
- Aguardando confirmação (custom)
- Aprovado / Separar (custom)
- estados de Checkout/Verificado
- Atendido/fiscal conforme fluxo
- Cancelado

A Central traduz status técnicos em linguagem simples.

## O que deve ser automático por padrão
- criação/espelho no Bling;
- confirmação recebida do WhatsApp;
- mudança de situação;
- reserva de estoque;
- impressão de picking;
- criação de fila;
- webhooks;
- alertas de SLA;
- baixa de estoque após conferência;
- seleção FEFO de lote quando aplicável;
- fiscal/documentos após homologação;
- roteirização sugerida;
- mensagens de status;
- ledger;
- relatórios Control Tower;
- reconciliações.

## O que deve permanecer humano
- confirmação explícita do cliente, embora capturada automaticamente;
- montagem física;
- conferência física;
- tratamento de falta/dano;
- pagamento físico na entrega;
- exceções fiscais/financeiras;
- ambiguidades de cadastro/conversão.

## Princípio operacional final
**Humano trabalha no mundo físico. Sistema trabalha no mundo digital.**

Se uma etapa é apenas:
- copiar dado;
- mudar status;
- gerar documento;
- reservar;
- imprimir;
- avisar;
- reconciliar;
- registrar histórico;

ela deve ser automatizada.

O funcionário só deve interagir quando existe uma decisão ou ação física real.

## Gates antes de implementar
1. preencher/localizar produtos para que picking por localização seja confiável;
2. POC de pedido criado no Bling em situação custom Aguardando confirmação;
3. validar reserva apenas após Aprovado;
4. POC de webhook de status;
5. POC de impressão automática 85 mm com foto via QZ/local agent;
6. testar tablet vertical;
7. testar Bling Checkout em tablet/computador;
8. fechar fiscal/pagamento na entrega;
9. testar ponta a ponta em 5-10 pedidos reais;
10. somente depois remover fluxos antigos.
