# Dona Antônia Operations 2.0 — Cliente, Identidade e Endereço (DRAFT)

> Documento de análise. Não implementar ainda.
> Última atualização: 2026-09-25.

## Objetivo
Ter uma identidade única de cliente entre site, WhatsApp/PapoAI, Admin e Bling, sem bloquear desnecessariamente o pedido.

## Estado observado
- 490 clientes no cadastro local;
- 263 com CPF/CNPJ;
- 227 sem documento;
- 57 sem telefone principal;
- 245 endereços cadastrados.

## Bling
O Bling mantém contatos com tipo de pessoa, endereço e tipo de contato. A busca pode usar nome, e-mail, CPF/CNPJ e telefone. Documento duplicado pode gerar conflito quando os dados divergem.

Fontes oficiais:
- https://ajuda.bling.com.br/hc/pt-br/articles/360035913053-Cadastrar-clientes-fornecedores-e-transportadoras
- https://ajuda.bling.com.br/hc/pt-br/articles/360036443093-Erro-ao-salvar-a-venda-CNPJ-CPF-j%C3%A1-cadastrado-no-contato
- https://ajuda.bling.com.br/hc/pt-br/articles/360036358474-Inserir-um-pedido-de-venda

## Identidade recomendada
1. Telefone identifica conversa/canal, não a pessoa de forma definitiva.
2. Cadastro operacional pode existir temporariamente sem CPF.
3. CPF/CNPJ válido é a identidade forte para reconciliação fiscal/ERP.
4. Bling ID já vinculado tem prioridade sobre nova busca.
5. Nunca fundir clientes apenas por nome livre.

## Matching proposto
1. bling_contact_id já vinculado;
2. CPF/CNPJ exato;
3. telefone + evidências;
4. nome/endereço apenas como sugestão;
5. revisão humana se ambíguo.

## Pedido WhatsApp
Conversa -> telefone -> resolver cliente -> carregar histórico/endereço -> montar pedido -> coletar CPF somente quando necessário -> reconciliar Bling.

## Endereço
Cliente pode ter vários endereços. O pedido guarda snapshot do endereço realmente usado. Coordenada WhatsApp pode ser associada ao endereço/pedido, mas não substitui campos fiscais.

## Recompra
Usar histórico como base, sempre criando novo rascunho e recalculando preço/estoque atual.

## Fonte de verdade
- Bling: cadastro ERP/fiscal consolidado;
- Supabase: identidade operacional, snapshots e ponte;
- PapoAI: canal e dados coletados;
- pedido: snapshot da venda.

## Control Tower
Mostrar:
- cliente com pedido e sem documento quando isso bloquear o avanço;
- contato Bling em revisão;
- possível duplicidade;
- endereço incompleto;
- cliente WhatsApp ainda não consolidado.

## Gates
- política para cliente sem CPF;
- POC de criação/atualização de contato Bling;
- cliente com múltiplos endereços;
- telefone repetido;
- integração PapoAI Flow;
- snapshot imutável do pedido.
