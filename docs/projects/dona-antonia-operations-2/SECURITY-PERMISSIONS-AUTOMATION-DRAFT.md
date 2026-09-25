# Dona Antônia Operations 2.0 — Perfis, Aprovações e Autonomia (DRAFT)

> Documento de análise. Não implementar ainda.
> Última atualização: 2026-09-25.

## Objetivo
Permitir máxima automação e mínima interação humana mantendo separação clara de responsabilidades.

## Achado atual
O acesso administrativo atual foi desenhado como solução simples de transição. O PIN administrativo inicia uma sessão associada ao perfil proprietário, e hoje existe apenas um usuário administrativo ativo no cadastro interno.

Além disso, o gateway operacional atual valida se o usuário administrativo está ativo, mas não possui ainda uma matriz completa de permissões por ação.

Isso é incompatível com o modelo final de:
- dois tablets de operação;
- entregador;
- automações;
- IA;
- financeiro/fiscal;
- auditoria por pessoa/estação.

## Recursos do Bling que devem ser aproveitados
O Bling permite usuários secundários com permissões limitadas por módulo/operação. O Checkout identifica o usuário que está separando e suas automações são configuradas por usuário. O MCP oficial do Bling também respeita as permissões do usuário Bling que autorizou a conexão.

Fontes oficiais analisadas em 2026-09-25:
- https://ajuda.bling.com.br/hc/pt-br/articles/360035558634-Como-gerenciar-os-usu%C3%A1rios-no-Bling
- https://ajuda.bling.com.br/hc/pt-br/articles/27436736332951-Meu-Neg%C3%B3cio-Permiss%C3%B5es-de-usu%C3%A1rios
- https://ajuda.bling.com.br/hc/pt-br/articles/18134856833943-Como-utilizar-o-checkout-de-pedidos-de-vendas-no-Bling
- https://ajuda.bling.com.br/hc/pt-br/articles/24112035701143-Como-configurar-automa%C3%A7%C3%B5es-do-checkout-de-pedidos-de-venda
- https://developer.bling.com.br/mcp-server

Planos publicados atualmente indicam limites de usuários de 5 no Cobalto, 50 no Titânio, 100 no Diamante e ilimitado no Elite. O plano efetivo da empresa ainda deve ser confirmado.

## Perfis propostos

### Owner
- visão total;
- Control Tower;
- financeiro;
- fiscal;
- configurações;
- automações;
- IA;
- aprovações de alto impacto.

### Supervisor
- pedidos;
- clientes/endereço;
- estoque;
- XML/conversões;
- reentregas;
- exceções operacionais;
- sem configuração estrutural.

### Operador interno
- fila de separação;
- marcar Separado;
- informar Problema;
- reimprimir;
- conferência autorizada.

Não deve visualizar ou alterar financeiro geral, regras fiscais, preços globais ou integrações.

### Entregador
- apenas rota atribuída;
- Maps/WhatsApp;
- Entregue/Não entregue;
- meio de pagamento efetivo;
- split de pagamento;
- observação de tentativa.

### Automation / IA
Identidade técnica separada, com permissões mínimas necessárias e trilha completa de auditoria.

## Uso dos tablets

### Tablet 1
Interface Dona Antônia vertical, dedicada a separação:
- Separar
- Em separação
- Problemas
- Reimprimir
- SEPARADO
- PROBLEMA

### Tablet 2
Preferencialmente dedicado ao Bling Checkout com usuário secundário restrito.
Como as automações do Checkout são configuradas por usuário, o usuário/estação precisa ser homologado com a configuração padrão.

## Aprovações

### Automático
Pode executar sem humano quando:
- ação é determinística;
- regra já foi aprovada;
- operação é idempotente;
- dados necessários estão completos;
- risco é baixo.

Exemplos:
- resumo de pedido;
- confirmação capturada do WhatsApp;
- reserva por status;
- impressão;
- atualização de fila;
- alertas;
- reconciliações de leitura;
- relatórios.

### Exige pessoa
- montagem física;
- conferência física;
- produto faltando/danificado;
- pagamento efetivo na entrega;
- conversão ambígua;
- divergência financeira;
- exceção fiscal.

### Exige Owner
- alterar configuração da IA;
- alterar regras financeiras/fiscais;
- ação irreversível;
- cancelamento fiscal;
- alteração estrutural;
- aprovações críticas.

## Approval Queue
A Central de Controle deve manter uma fila estruturada de ações que precisam de decisão:
- ação proposta;
- entidade afetada;
- motivo;
- evidências;
- impacto;
- quem solicitou;
- Aprovar / Rejeitar / Abrir;
- resultado final.

A aprovação deve sempre ser específica para uma ação concreta.

## Auditoria
Toda ação relevante deve registrar:
- ator: humano, sistema, IA ou externo;
- papel/estação;
- entidade;
- evento;
- data/hora;
- origem;
- resultado;
- correlação;
- aprovação relacionada quando houver.

O fato de `admin_audit_logs` estar atualmente sem registros mostra que a trilha administrativa ainda não está pronta para o modelo final.

## Control Tower por perfil
Owner vê toda a empresa.
Supervisor vê exceções operacionais.
Operador vê somente tarefas físicas.
Entregador vê somente a rota atual.

A complexidade de permissão não deve aparecer para o funcionário; ele simplesmente vê poucos botões.

## IA + Bling
Quando usarmos o MCP oficial do Bling, a conexão da IA deve usar um usuário Bling dedicado com permissões adequadas, em vez de depender de um perfil administrativo irrestrito.

## Gates
1. confirmar plano Bling e vagas de usuários;
2. criar matriz de usuários/estações;
3. testar Checkout com usuário restrito;
4. validar automações por usuário;
5. substituir o acesso administrativo compartilhado por perfis adequados;
6. definir identidade de estação e, se necessário, funcionário;
7. definir approval queue;
8. definir ledger operacional;
9. revisar segurança da Control Tower;
10. só então liberar automações de escrita.
