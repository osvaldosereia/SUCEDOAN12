# Dona Antônia Operations 2.0 — Fechamento Fiscal para Entrega e Pagamento no Domicílio (DRAFT)

> Documento de análise. Não implementar ainda.
> Atualização: 2026-09-25.

## Descoberta principal

A Consulta Tributária 008/2026-UDCR/UNERC da SEFAZ/MT, aprovada em 01/08/2026, analisou exatamente uma situação muito próxima à da Dona Antônia: venda não presencial, emissão do documento fiscal e pagamento no domicílio com a maquineta levada ao cliente.

A conclusão publicada pela SEFAZ/MT foi que **a obrigatoriedade de vincular o comprovante do pagamento eletrônico ao documento fiscal não se aplica à venda com entrega e pagamento em domicílio**, desde que sejam observadas as condições da Portaria 262/2023-SEFAZ.

Referência:
https://app1.sefaz.mt.gov.br/84256714006FBE3C/B3B7FACD2DB8F63084257C8B0052E28D/3671321DA762E24A03258D95005ED9C6

Condições destacadas no próprio parecer:
- equipamento de pagamento deve conter nome empresarial e endereço do estabelecimento, impressos no comprovante;
- observar as informações exigidas no XML pela Portaria;
- regra é aplicável às operações abrangidas pela Portaria/CNAEs.

## Impacto no nosso problema

Esse entendimento reduz bastante o maior conflito identificado anteriormente.

O Bling informa que, em Mato Grosso, sua integração do comprovante eletrônico é tratada para NFC-e e **não para NF-e**:
https://ajuda.bling.com.br/hc/pt-br/articles/21801243223191-Obrigatoriedade-do-c%C3%B3digo-identificador-da-opera%C3%A7%C3%A3o-na-NFC-e-e-NF-e-no-Mato-Grosso

Se a operação da Dona Antônia se enquadrar corretamente na exceção de entrega + pagamento no domicílio, essa limitação do Bling deixa de ser, em princípio, o bloqueador central.

## Momento do documento fiscal

O RICMS/MT estabelece como regra geral que a Nota Fiscal deve ser emitida **antes de iniciada a saída da mercadoria**.

Referência:
https://www.sefaz.mt.gov.br/legislacao/SubIndice.aspx?ID=27

O mesmo dispositivo permite NFC-e para consumidor final em certas operações, inclusive entrega em domicílio dentro do mesmo município, e informa que NF-e pode ser usada em substituição à NFC-e.

Como Dona Antônia atende Cuiabá e Várzea Grande e as entregas podem atravessar município, a direção arquitetural mais simples é manter **NF-e modelo 55 como padrão**, salvo orientação fiscal diferente.

## Fluxo fiscal candidato

Pedido aprovado
-> separação
-> conferência
-> pedido Verificado
-> gerar/autorizar NF-e no Bling
-> imprimir DANFE/DANFE simplificado
-> liberar para rota
-> entrega no domicílio
-> pagamento real ocorre
-> entregador registra pagamento efetivo
-> Bling financeiro é atualizado/reconciliado
-> pedido concluído

Esse fluxo elimina o ciclo impossível atual de:
"precisa entregar/pagar para liberar fiscal"
versus
"precisa fiscal para poder sair".

## O que ainda NÃO está fechado

### Campo de pagamento da NF-e
No momento da emissão, o pagamento ainda não ocorreu e o meio pode mudar na porta.

Existem no leiaute nacional:
- indicador de pagamento à vista/a prazo;
- meios específicos;
- código 90 "Sem pagamento".

Porém o uso correto desses campos para **venda com pagamento iminente no domicílio** precisa ser homologado com a contabilidade.

Não hardcodar:
- PIX;
- cartão;
- "sem pagamento";
- forma prevista.

O sistema deve ter política fiscal configurável até a homologação.

## Pagamento previsto x pagamento fiscal x pagamento efetivo

Separar definitivamente:

1. **Previsto**
   - cliente informa no site/WhatsApp;
   - serve para logística.

2. **Fiscal**
   - informação colocada no documento antes da saída;
   - política definida pela contabilidade e legislação.

3. **Efetivo**
   - o que realmente ocorreu na entrega;
   - fonte para o financeiro e fechamento operacional.

Esses três valores podem coincidir, mas não devem ser tratados como a mesma coisa no modelo de dados.

## CNAE
A Portaria 262/2023, com alterações, inclui vários CNAEs de varejo de alimentos, como supermercados e minimercados/mercearias.

Não inferir automaticamente o CNAE da Dona Antônia.
Antes de produção:
- confirmar CNAE principal/secundários da empresa;
- confirmar com contador se a operação se enquadra na exceção do art. 2º, III;
- confirmar como cumprir o art. 3º no XML em venda direta pelo próprio canal.

## Maquininhas
Gate prático:
- confirmar se cada POS usado na entrega imprime nome empresarial + endereço correto;
- se não, trocar/configurar equipamento antes do cutover.

## PIX
Mesmo na exceção de vinculação, o financeiro precisa registrar o recebimento real.
Se o PIX não vier por Bling Conta, não presumir confirmação bancária só porque cliente disse "paguei".

## Conclusão provisória
A arquitetura pode ser fechada com **NF-e antes da saída + pagamento efetivo na entrega + financeiro depois**, desde que contador confirme:
1. enquadramento na exceção domiciliar;
2. política de campos de pagamento da NF-e;
3. requisitos do XML da Portaria;
4. POS utilizado.

Isso transforma o ponto fiscal de "bloqueador de arquitetura" em "gate de homologação contábil".
