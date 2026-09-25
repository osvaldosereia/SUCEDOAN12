# Dona Antônia Operations 2.0 — Recebimento, Divergência e Devolução ao Fornecedor (DRAFT FINAL)

> Documento de análise. Não implementar ainda.
> Atualização: 2026-09-25.

## Objetivo
Evitar que mercadoria errada, faltante ou avariada entre no estoque como se estivesse correta.

## Descoberta principal
O Check-in de Recebimentos do Bling já cobre praticamente todo o processo profissional necessário.

Ele funciona sobre NF-e de entrada importada por XML e antes do lançamento de estoque.

Fonte:
https://ajuda.bling.com.br/hc/pt-br/articles/37029128283927-Como-realizar-o-check-in-de-recebimentos-de-nota-de-entrada-no-Bling

## O que o Bling já faz
Conferência por:
- lista;
- nome;
- código do fornecedor;
- GTIN/EAN;
- DUN;
- lote.

Permite registrar:
- produto faltando;
- danificado;
- incorreto;
- recusado.

Para divergência, permite:
- gerar crédito com fornecedor;
- gerar nota de devolução;
- somente registrar a pendência.

Mantém histórico de ações e usuário.

## Fluxo CNPJ recomendado
NF-e aparece no Bling
-> XML importado
-> Check-in físico
-> divergências registradas
-> lotes/validade
-> finalizar Check-in
-> lançar estoque
-> lançar/conciliar financeiro
-> produto disponível.

A opção Bling de lançar estoque automaticamente ao finalizar Check-in pode ser usada depois de homologada.

## Produto danificado na chegada
Não entra em Geral para depois sair.

No próprio Check-in:
- marcar danificado;
- quantidade;
- ação:
  - crédito fornecedor; ou
  - gerar devolução; ou
  - pendência.

Isso reduz movimentação inútil.

## Produto recusado
Se nenhuma unidade daquele item foi aceita:
- usar `Recusar produto`;
- não entrar no estoque;
- gerar devolução ou crédito conforme acordo.

## Produto faltando
Registrar quantidade faltante.
Não criar entrada fictícia para depois ajustar.

Financeiro e pedido de compra precisam refletir o acordo com fornecedor.

## Devolução de compra
Bling gera nota de devolução diretamente a partir da nota de entrada, inclusive parcial, referenciando a chave original.

Fonte:
https://ajuda.bling.com.br/hc/pt-br/articles/360036041393-Como-gerar-nota-de-devolu%C3%A7%C3%A3o-para-o-fornecedor-a-partir-da-nota-de-compra-no-Bling

A tributação deve seguir orientação contábil e dados da nota original.

## Observação profissional
ERPs como Omie seguem a mesma lógica:
- devolução ao fornecedor é uma operação própria;
- movimenta estoque;
- possui reflexo financeiro;
- mantém vínculo com a compra.

Fonte comparativa:
https://ajuda.omie.com.br/pt-BR/articles/499177-cadastrando-uma-nota-fiscal-de-devolucao-ao-fornecedor

Isso confirma que não devemos “ajustar estoque” como substituto de uma devolução real.

## Crédito do fornecedor
Se fornecedor não recebe mercadoria de volta mas concede crédito:
- registrar crédito/ajuste financeiro;
- não criar devolução física inexistente.

O Check-in Bling já oferece ação de gerar crédito.

## Caixa -> unidade
DUN e regra fornecedor/produto continuam essenciais.

No recebimento:
- XML informa embalagem;
- DUN pode converter automaticamente;
- fator conhecido é aplicado;
- fator desconhecido vai para revisão.

Nunca lançar estoque antes de resolver o fator.

## Lote/validade
Para produtos controlados por validade:
- lote deve nascer no recebimento;
- validade deve ser obrigatória quando aplicável;
- estoque só fica comercialmente disponível depois da conferência.

## Compras no CPF
Não usar Check-in CNPJ para “transformar” compra CPF em compra empresarial.

Fluxo separado:
- upload;
- staging;
- cadastro/evidência;
- custo gerencial;
- origem fiscal pendente;
- sem AP empresarial automático;
- sem estoque fiscal regular automático.

## Automação máxima
Humano:
- bipa/conta mercadoria;
- marca problema físico.

Sistema:
- concilia XML;
- cadastra/vincula;
- aplica DUN;
- registra lote;
- prepara devolução/crédito;
- lança estoque após Check-in;
- financeiro após gates.

## Control Tower
Mostrar:
- NF-e aguardando Check-in;
- divergências;
- devoluções fornecedor pendentes;
- créditos aguardando conciliação;
- fatores caixa->unidade desconhecidos;
- lote sem validade;
- nota recebida sem lançamento de estoque.
