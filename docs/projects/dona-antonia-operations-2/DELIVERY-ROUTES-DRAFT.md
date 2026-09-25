# Dona Antônia Operations 2.0 — Rota, Entrega e Motorista (DRAFT)

> Documento de análise. Não implementar ainda.
> Última atualização: 2026-09-25.

## Objetivo
Definir a última etapa física do pedido com o mínimo de interação humana:
- pedidos aptos entram automaticamente na fila;
- sistema sugere rota;
- entregador vê somente o necessário;
- pagamento real é registrado na porta;
- entrega fecha automaticamente os sistemas.

## O que o Bling cobre bem
Pesquisa oficial em 2026-09-25 confirma que o Bling possui forte estrutura de logística para transportadoras e objetos logísticos:
- serviço logístico no pedido/NF;
- objetos de postagem;
- remessas;
- etiquetas;
- tracking;
- integrações como Loggi, Correios e outras.

Fontes:
- https://ajuda.bling.com.br/hc/pt-br/articles/360038663234-Como-selecionar-o-servi%C3%A7o-log%C3%ADstico-no-pedido-de-venda-ou-na-nota-fiscal
- https://ajuda.bling.com.br/hc/pt-br/articles/4411316372119-Selecionar-o-servi%C3%A7o-da-log%C3%ADstica-Loggi-no-pedido
- https://ajuda.bling.com.br/hc/pt-br/articles/4410782973335-Gerar-e-enviar-a-remessa-para-a-log%C3%ADstica-Loggi

Não foi localizada documentação oficial de um módulo do Bling voltado a:
- roteirização de entregas próprias por múltiplos endereços locais;
- ordem ótima de paradas usando coordenadas;
- tela simples de motorista próprio;
- captura de pagamento na porta;
- localização enviada pelo WhatsApp.

Conclusão:
**Bling continua sendo ERP/fiscal/logístico documental; rota local própria permanece função Dona Antônia.**

## Estado atual do Admin
A tela Expedição já possui:
- pedidos prontos/em entrega/entregues;
- busca;
- WhatsApp;
- Maps;
- confirmação de entrega;
- não entregue + motivo;
- reentrega;
- DANFE;
- seleção em lote/manifesto;
- pagamento previsto;
- fechamento/fiscal.

Isso é uma base útil, mas contém complexidade fiscal que deverá ser reduzida depois que o Bling assumir mais etapas.

## Fluxo alvo

### 1. Entrada na fila de expedição
Quando pedido estiver:
- conferido;
- estoque/fiscal/documentos nos gates corretos;
- endereço válido;
- sem exceção bloqueante;

ele entra automaticamente em:
`ready_to_dispatch`.

Nenhum funcionário precisa copiar pedido para outra tela.

### 2. Preparação da rota
Sistema agrupa pedidos por:
- data/turno;
- cidade;
- capacidade/veículo quando aplicável;
- coordenadas conhecidas;
- endereço quando coordenada não existir;
- prioridade/reentrega.

### 3. Coordenadas
Hierarquia preferida:
1. localização/pin enviado pelo cliente no WhatsApp;
2. coordenada já validada no cadastro;
3. geocodificação do endereço;
4. endereço textual como fallback.

Nunca sobrescrever uma coordenada validada com geocodificação inferior sem evidência.

## PapoAI e localização
Como clientes já conversam pelo WhatsApp, a coleta do pin/localização deve ser aproveitada quando disponível.

Fluxo desejado:
WhatsApp/PapoAI -> cliente envia localização -> vincular a cliente/endereço/pedido -> rota usa coordenada.

O código antigo possuía tentativa de captura de localização no ecossistema PapoAI, mas a estrutura correspondente foi desmontada durante limpeza. Não reativar legado; redesenhar uma captura mínima no projeto final.

## Roteirização
O projeto não deve tentar construir um "Google Maps próprio".

Camada Dona Antônia precisa apenas:
- montar lista de paradas;
- enviar coordenadas/endereço para um serviço de roteirização;
- receber ordem sugerida;
- permitir ajuste humano;
- abrir navegação.

A escolha do provedor fica para fase de homologação.

## Uso inteligente de API de mapas
Para evitar custo:
- não recalcular rota a cada abertura de tela;
- recalcular apenas quando conjunto de pedidos muda;
- guardar resultado da rota por versão;
- coordenada validada deve ser reutilizada;
- geocodificar um endereço uma vez e cachear;
- não consultar rota para pedidos já entregues/cancelados.

## Tela do entregador
Mobile vertical.

Cabeçalho:
- Rota 1
- X entregas
- total a receber
- progresso

Parada atual:
- cliente;
- endereço;
- referência;
- distância/posição na rota;
- valor;
- pagamento previsto;
- observação.

Botões grandes:
- MAPS
- WHATSAPP
- ENTREGUE
- NÃO ENTREGUE

Não mostrar estoque, XML, produtos completos, financeiro geral ou configuração.

## Ao tocar ENTREGUE
Abrir tela de pagamento real:

- PIX
- Dinheiro
- Crédito
- Alimentação
- Refeição
- Dividir

Se dividir:
- adicionar partes;
- soma precisa ser igual ao total;
- bloquear fechamento se divergente.

Depois:
- registrar entrega;
- registrar settlement;
- enviar ao Bling;
- reconciliar financeiro/fiscal;
- mensagem ao cliente;
- ledger;
- próxima parada abre automaticamente.

## Ao tocar NÃO ENTREGUE
Motivos grandes:
- Cliente ausente
- Endereço não encontrado
- Cliente recusou
- Problema no pagamento
- Veículo/rota
- Outro

Automático:
- não registra pagamento;
- pedido sai de concluídos;
- gera reentrega/cancelamento conforme regra;
- notifica operação;
- próxima parada abre.

## Reentrega
Reentrega deve manter:
- histórico da tentativa anterior;
- motivo;
- data/hora;
- rota;
- entregador;
- observação.

Não criar um novo pedido comercial só porque houve nova tentativa.

## Pagamento previsto x efetivo
A rota usa o previsto apenas para preparação:
- levar troco;
- levar maquininha adequada;
- confirmar bandeira alimentação/refeição.

O fechamento usa somente o pagamento efetivo.

## Preparação automática por pagamento
Antes de sair, a Central pode resumir:
- X PIX;
- X dinheiro;
- valor estimado em dinheiro;
- X crédito;
- X alimentação/refeição;
- pedidos que exigem confirmar bandeira.

Isso reduz surpresa do entregador.

## Veículos
No início pode bastar:
- Rota/Carro 1;
- Rota/Carro 2.

Não criar gestão de frota complexa.

Campos mínimos:
- rota_id;
- driver/device;
- vehicle_label;
- pedidos;
- ordem das paradas;
- status.

## Romaneio
Se papel ainda for útil:
- uma impressão por rota, não por sistema paralelo;
- pedido;
- cliente;
- endereço;
- telefone;
- valor;
- pagamento previsto;
- observações;
- volumes;
- QR opcional.

A tela mobile deve ser fonte operacional principal; papel é fallback.

## Integração com Bling
Manter no Bling:
- pedido;
- cliente;
- NF-e;
- transportador/volumes quando fiscalmente necessário;
- contas/recebimentos;
- status ERP relevante.

Manter Dona Antônia:
- rota;
- ordem de paradas;
- pin WhatsApp;
- tentativa de entrega;
- interface motorista;
- prova operacional;
- pagamento efetivo capturado na porta antes de sincronização.

## Control Tower
Mostrar:
- pedidos prontos sem rota;
- rotas abertas;
- entregas em andamento;
- atraso por parada;
- não entregues;
- pagamentos ainda não reconciliados;
- rota parada;
- cliente sem localização/endereço suficiente.

## Automação máxima
Happy path:
conferido -> elegível -> rota -> motorista -> entregue/pagamento -> Bling -> concluído.

Interações humanas inevitáveis:
- dirigir;
- entregar;
- receber pagamento;
- registrar falha real.

Todo o resto deve ser automatizado.

## Gates
1. resolver fluxo fiscal x pagamento na entrega;
2. capturar/localizar pins WhatsApp de forma confiável;
3. testar geocodificação/reuso de coordenadas;
4. escolher provedor de rota;
5. medir custo por rota;
6. testar com 5-10 entregas;
7. testar reentrega;
8. testar split de pagamento;
9. testar dois carros;
10. homologar fechamento Bling.
