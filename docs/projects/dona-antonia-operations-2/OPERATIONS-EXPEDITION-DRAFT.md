# Dona Antônia Operations 2.0 — Separação, Conferência, Expedição e Entrega (DRAFT)

> Documento de análise. Não implementar ainda.
> Última atualização: 2026-09-25.

## Objetivo
Usar o máximo possível do Bling na logística interna e manter no Admin apenas o que é específico da operação local da Dona Antônia.

## Capacidades nativas atuais do Bling confirmadas

Fontes oficiais consultadas:
- Checkout de pedidos: https://ajuda.bling.com.br/hc/pt-br/articles/18134856833943-Como-utilizar-o-checkout-de-pedidos-de-vendas-no-Bling
- Relatório de separação: https://ajuda.bling.com.br/hc/pt-br/articles/14923712469527-Como-gerar-relat%C3%B3rio-de-separa%C3%A7%C3%A3o-de-vendas-no-Bling
- Automações do Checkout: https://ajuda.bling.com.br/hc/pt-br/articles/24112035701143-Como-configurar-automa%C3%A7%C3%B5es-do-checkout-de-pedidos-de-venda
- Impressão QZ Tray: https://ajuda.bling.com.br/hc/pt-br/articles/14386699861399-Impress%C3%A3o-autom%C3%A1tica-de-etiqueta-log%C3%ADstica
- Gerenciador de transições: https://ajuda.bling.com.br/hc/pt-br/articles/360039070654-Gerenciador-de-transi%C3%A7%C3%B5es-para-situa%C3%A7%C3%B5es-de-pedidos-de-venda

### Bling Checkout
Permite:
- Picking por pedido;
- leitura de SKU/GTIN/EAN;
- câmera no celular;
- quantidade antes da leitura;
- salvar checkout parcial;
- finalizar como Verificado;
- mostrar pedido "Em separação";
- mostrar qual usuário está separando;
- evitar duplicidade de separação.

Isso substitui grande parte do que seria caro reproduzir no Admin.

### Relatório de Separação
Pode trazer:
- produto;
- cliente;
- pedido;
- GTIN/EAN;
- descrição;
- quantidade;
- lote;
- localização física;
- saldo.

Pode ordenar por localização física e exportar PDF/CSV/XLS ou imprimir.

Isso atende muito bem a lógica gôndola/prateleira.

### Automação pós-conferência
Ao finalizar Checkout o Bling pode:
- gerar NF-e;
- enviar NF-e à SEFAZ;
- imprimir DANFE;
- DANFE simplificado;
- etiqueta de transporte;
- declaração de conteúdo;
- remessa de postagem.

O projeto não deve reproduzir esses recursos salvo lacuna comprovada.

### QZ Tray
Bling usa QZ Tray para impressão direta em impressoras locais PDF/ZPL.

A configuração é por computador/usuário e depende de ambiente local.

## Decisão de projeto provisória

### Separação/conferência
Preferir Bling Checkout como motor nativo.

Admin Dona Antônia:
- mostra fila operacional simples;
- botão "Separar/Conferir" pode abrir/encaminhar para o fluxo apropriado;
- Control Tower monitora andamento.

Evitar criar um scanner EAN completo paralelo se o Checkout Bling atender na homologação.

### Picking por localização
Usar localização física do produto no Bling como fonte operacional final, se o modelo de localização suportar nossa gôndola/prateleira.

Se não suportar granularidade suficiente:
- manter metadado Dona Antônia;
- sincronizar para campo de localização compatível;
- relatório próprio apenas como último recurso.

## Impressão
Separar dois tipos:

### Documento nativo
- DANFE;
- DANFE simplificado;
- etiqueta;
- declaração.
=> Bling/QZ Tray.

### Documento próprio Dona Antônia
- folha específica do montador se houver necessidade não atendida;
- romaneio/folha do entregador local;
- rota local;
- observações operacionais de pagamento/cliente.

Só esses justificam impressão custom.

## Impressão automática ao entrar pedido
O desejo original é imprimir uma folha de separação assim que o pedido chega.

Bling oferece automações após Checkout, mas a documentação consultada não comprova impressão automática de um relatório custom de picking imediatamente no recebimento do pedido.

Portanto existem duas alternativas:
1. operador usa fila/relatório do Bling e imprime em lote;
2. pequena ponte local imprime folha Dona Antônia ao evento de novo pedido.

Não decidir até POC operacional.

## Admin atual
Já existe uma boa tela de Expedição com:
- aguardando saída;
- em entrega;
- entregues;
- WhatsApp;
- Maps;
- DANFE;
- romaneio;
- confirmação de entrega;
- retorno por não entrega;
- pagamento/fiscal.

Ela é uma base útil, mas deve ser simplificada após Bling assumir Checkout/fiscal/documentos.

## Entregador
O entregador tem necessidades que Bling não cobre claramente como produto dedicado:
- lista das entregas do dia;
- ordem de rota local;
- endereço/referência;
- localização recebida via WhatsApp;
- Maps;
- telefone/WhatsApp;
- valor a receber;
- pagamento previsto;
- registrar meio efetivo;
- split de pagamento;
- tentativa não concluída;
- observação;
- confirmação de entrega.

Essa camada continua justificando Admin/mobile próprio.

## Roteirização
Na documentação oficial pesquisada não foi encontrado recurso nativo do Bling voltado a ordenar entregas locais próprias usando localizadores WhatsApp/latitude-longitude.

Direção:
- manter roteirização como módulo Dona Antônia;
- entrada: endereços + pins WhatsApp;
- saída: sequência sugerida;
- sempre permitir reorganização humana;
- integrar Maps para navegação, sem duplicar mapas completos no sistema.

## Fluxo operacional alvo provisório

Pedido confirmado
-> Bling registra/reserva
-> fila de separação
-> picking por localização
-> Checkout/conferência EAN no Bling
-> fiscal conforme fluxo homologado
-> documentos Bling/QZ
-> fila de expedição Dona Antônia
-> agrupamento/rota
-> entregador
-> meio de pagamento efetivo
-> confirmação de entrega
-> fechamento financeiro
-> ledger/Control Tower.

A posição exata de "fiscal" depende da resolução do conflito documentado em `FINANCE-PAYMENT-DELIVERY-DRAFT.md`.

## Status simples para funcionário
Independentemente dos status internos do Bling, o Admin deve traduzir para linguagem operacional:

- Novo
- Separar
- Conferir
- Pronto
- Em entrega
- Entregue
- Problema

O funcionário não precisa entender nomenclatura técnica de ERP.

## Control Tower
Deve monitorar:
- pedidos parados;
- pedido em separação e responsável;
- checkout parcial;
- divergência de itens;
- documento fiscal pendente;
- impressão falhou;
- pronto sem rota;
- saiu e não foi entregue;
- pagamento não confirmado;
- reentrega;
- SLA/tempo em cada etapa.

## O que remover depois de homologar
- conferência custom duplicada;
- geração/consulta de DANFE custom quando nativo funcionar;
- orquestração fiscal duplicada;
- status internos redundantes.

## O que manter custom
- fila operacional simplificada;
- venda manual/WhatsApp;
- cesta personalizável;
- rota/entregador;
- pagamento efetivo na entrega;
- Control Tower/ledger;
- integrações especiais PapoAI.

## Gates
1. testar Checkout Bling com pedidos reais de cesta composta;
2. confirmar como componentes chegam no pedido Bling;
3. testar leitura EAN e quantidades;
4. testar localização física;
5. testar impressão QZ;
6. resolver fluxo fiscal/pagamento;
7. testar romaneio e tela de entregador;
8. só então decidir quais telas custom permanecem.
