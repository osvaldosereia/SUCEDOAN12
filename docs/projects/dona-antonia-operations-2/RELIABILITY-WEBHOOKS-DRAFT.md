# Dona Antônia Operations 2.0 — Integração, Webhooks e Confiabilidade (DRAFT)

> Documento de análise. Nenhuma alteração de produção foi feita.
> Última atualização: 2026-09-25.

## Objetivo
Garantir que o fluxo máximo de automação continue confiável mesmo com falhas temporárias de Bling, rede, PapoAI, impressora ou SEFAZ.

## Estado real encontrado

### Bling API
O probe atual mostra acesso OK a:
- produtos;
- contatos;
- pedidos de venda;
- NF-e;
- depósitos;
- contas a pagar;
- contas a receber;
- contas financeiras.

OAuth recente também aparece saudável.

### Hub
- `hub_enabled=false`;
- domínios orders/products/stock/customers estão marcados como habilitados;
- porém o ciclo global está desligado.

### Webhooks
- `webhooks_enabled=false`;
- inbox `bling_webhook_inbox_v2` está vazia.

Conclusão:
**o projeto ainda não está operando no modelo reativo desejado.**

### Situações de pedido
A checagem atual do catálogo de situações está em:
- `state=scope_missing`;
- HTTP 403;
- recurso `situacoes/modulos`;
- `status_updates_enabled=false`.

Pela documentação do Bling, HTTP 403 significa token autenticado sem o escopo/permissão necessário.

Fontes:
- https://developer.bling.com.br/erros-comuns
- https://developer.bling.com.br/referencia

Isso é um bloqueador importante para o fluxo:
`Aguardando confirmação -> Aprovado/Separar -> Verificado -> ...`

Antes de implementar automação por situação, precisamos corrigir/homologar esse acesso no aplicativo Bling.

## Webhooks do Bling — comportamento oficial

Fonte:
https://developer.bling.com.br/webhooks

### Idempotência
O Bling pode enviar o mesmo webhook mais de uma vez.
O receptor deve responder 2xx também para duplicatas.

### Ordem
A entrega não é garantida na ordem em que os eventos aconteceram.

### Timeout
O endpoint deve responder 2xx em até 5 segundos.

### Retentativas
Se falhar:
- Bling tenta novamente;
- pode continuar por até 3 dias;
- intervalo aumenta entre tentativas.

### Falha prolongada
Se continuar falhando, a configuração daquele webhook pode ser desabilitada e precisa ser reativada.

## Arquitetura alvo do receptor
Webhook não deve executar um processo pesado durante a requisição.

Fluxo:
1. receber;
2. validar origem/assinatura conforme método oficial;
3. deduplicar;
4. gravar evento;
5. responder 2xx rapidamente;
6. processar assíncrono;
7. reconciliar estado atual no Bling;
8. registrar resultado no ledger.

## Eventos prioritários
- pedido criado;
- pedido atualizado;
- pedido removido/cancelado;
- estoque físico;
- estoque virtual/reserva quando suportado;
- produto;
- NF-e.

A lista final deve ser fechada a partir do catálogo oficial do aplicativo e das necessidades reais do fluxo.

## Regra anti-polling
Preferência:
- webhook para mudança;
- consulta sob demanda para confirmação;
- reconciliação periódica de baixa frequência como rede de segurança.

Evitar cron de 1-2 minutos para "ver se algo mudou" quando o Bling já informa por evento.

## Reconciliação
Mesmo com webhook, manter uma rotina leve de reconciliação.

Motivos:
- webhook pode ser desabilitado;
- evento pode atrasar;
- evento pode chegar fora de ordem;
- rede pode falhar;
- operador pode alterar diretamente no Bling.

Reconciliação não deve repetir efeitos.
Ela compara:
- fonte oficial;
- último estado conhecido;
- vínculo;
- ledger.

## Chaves de correlação
### Pedido
Usar uma chave externa estável em `numeroLoja`/campo apropriado + ID canônico.

### Produto
GTIN/SKU + binding interno.

### Cliente
ID interno + CPF/CNPJ quando aplicável; telefone é contato.

### Fiscal
chave NF-e / ID Bling / pedido.

Objetivo:
qualquer evento precisa encontrar sua entidade sem busca por texto solto.

## Rate limit
Bling documenta limite global da conta:
- 3 requisições/segundo;
- 120.000 requisições/dia.

Fonte:
https://developer.bling.com.br/limites

O desenho deve:
- centralizar rate limiting;
- evitar chamadas duplicadas;
- usar batch/paginação quando disponível;
- cachear leitura que não precisa ser instantânea;
- não fazer polling de cada card do dashboard.

## Control Tower — saúde das integrações
Mostrar sem linguagem técnica:
- Bling conectado;
- PapoAI conectado;
- SEFAZ/fiscal;
- impressão;
- webhooks;
- última sincronização;
- último evento;
- fila atrasada;
- falhas abertas.

Exemplo:
**Bling — Atenção**
"Não recebemos atualizações de pedidos há 18 minutos."

Botões:
- Ver detalhes
- Testar conexão
- Reconciliar
- Abrir instrução

## Health checks
Cada integração deve responder:
1. credencial está válida?
2. leitura funciona?
3. escrita homologada funciona?
4. último evento chegou quando?
5. existe fila parada?
6. existe erro sem dono?
7. webhook continua habilitado?
8. rate limit está saudável?

## Degradação segura

### Bling indisponível
- aceitar pedido local se regra permitir;
- manter como "aguardando ERP";
- não fingir reserva;
- não avançar para etapas que exigem estado Bling;
- reconciliar quando voltar.

### PapoAI indisponível
- pedido do site continua salvo;
- confirmação WhatsApp fica pendente;
- operador pode confirmar por outro contato;
- não perde pedido.

### Impressão indisponível
- pedido continua visível;
- job fica pendente;
- retry limitado;
- reimprimir manual.

### SEFAZ indisponível
- estado fiscal fica pendente;
- não repetir emissão de forma cega;
- reconciliar;
- seguir apenas regras fiscais homologadas.

## Métricas de confiabilidade
- uptime das integrações;
- idade do último webhook;
- eventos duplicados;
- eventos fora de ordem;
- retries;
- jobs em review_required;
- tempo pedido -> Bling;
- tempo confirmação -> impressão;
- tempo verificado -> fiscal;
- falha de impressão;
- divergências de reconciliação;
- uso diário da API.

## Gate obrigatório antes da implementação
1. corrigir permissão/escopo para Situações - Módulos;
2. provar atualização de situação de pedido via API;
3. ativar webhooks em homologação;
4. provar assinatura/recepção/deduplicação;
5. testar eventos duplicados;
6. testar eventos fora de ordem;
7. testar Bling fora do ar;
8. testar rate limit 429;
9. testar reconciliação pós-falha;
10. só então tornar o workflow dependente de eventos.
