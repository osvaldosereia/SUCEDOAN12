# Progresso da reconstrução V2

## Fundação concluída

- configuração central de ambiente;
- catálogo compartilhado e seguro;
- bloqueio de catálogo vazio;
- detecção de queda anormal e IDs duplicados;
- cache controlado;
- carrinho e favoritos compartilhados;
- roteamento por hash;
- página inicial de catálogo, busca, categorias e detalhe do produto;
- cestas, kits e Compra rápida resolvidos por referências do catálogo;
- painel administrativo modular em modo seguro.

## Cadastro de produtos em homologação

- consulta por EAN;
- captura separada de fotos;
- compressão e armazenamento local em IndexedDB;
- preparação de pacote para Make/OpenAI;
- validação e revisão humana da resposta da IA;
- editor com comparação de alterações;
- rascunhos locais;
- checklist e ficha de homologação;
- publicação externa ainda bloqueada.

## Checkout e pedidos em homologação

- validação de cliente, endereço, pagamento e pedido mínimo;
- geração de envelope com fingerprint;
- fila local protegida contra duplicidade;
- ordem de canais definida: WhatsApp, Firebase e Make;
- mensagem e URL do WhatsApp preparadas para abertura manual;
- sessão de despacho com histórico por canal;
- Firebase e Make desabilitados por configuração;
- fila de homologação local visível no admin, separada dos pedidos reais;
- teste de contrato para ordem, idempotência e bloqueio externo.

## Regras de segurança mantidas

- desenvolvimento somente na branch `rebuild-v2`;
- arquivos novos somente dentro de `v2/`;
- nenhuma alteração na branch `main`;
- nenhuma escrita no Firebase;
- nenhum webhook real acionado;
- nenhum envio automático pelo WhatsApp;
- checkout e publicação permanecem bloqueados para uso real.

## Próximas etapas prioritárias

1. executar o checkout em navegador e aparelho reais;
2. criar adaptador de gravação do pedido em um nó exclusivo de homologação no Firebase;
3. criar adaptador de webhook de homologação do Make com timeout e repetição controlada;
4. validar o cenário do Make até o Bling sem criar venda real;
5. adicionar confirmação e reprocessamento por canal no admin;
6. finalizar cupom, entrega e agendamento;
7. implementar separação, conferência e etiqueta;
8. concluir testes automatizados e plano de migração.
