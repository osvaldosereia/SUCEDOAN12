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
- 245 endereços cadastrados;
- há pedidos atuais sem customer_id e pedidos sem forma de pagamento.

Conclusão: CPF é importante, mas não pode ser requisito para que uma conversa/pedido sequer exista. O dado deve ser coletado antes do ponto fiscal/ERP em que realmente se torna necessário.

## Bling
Documentação oficial confirma:
- contatos têm tipo de pessoa, endereço e tipo de contato;
- busca pode ser feita por nome, e-mail, CPF/CNPJ e telefone;
- CPF/CNPJ duplicado pode causar conflito no pedido quando dados divergem;
- o Bling oferece configuração para permitir documento duplicado, mas isso NÃO é desejável como padrão para Dona Antônia;
- histórico de vendas/financeiro do contato fica disponível no pedido;
- para emissão de NF-e, dados obrigatórios do destinatário podem ser necessários.

Fontes:
- https://ajuda.bling.com.br/hc/pt-br/articles/360035913053-Cadastrar-clientes-fornecedores-e-transportadoras
- https://ajuda.bling.com.br/hc/pt-br/articles/360036443093-Erro-ao-salvar-a-venda-CNPJ-CPF-j%C3%A1-cadastrado-no-contato
- https://ajuda.bling.com.br/hc/pt-br/articles/360036358474-Inserir-um-pedido-de-venda
- https://ajuda.bling.com.br/hc/pt-br/articles/27626984856471-Meu-neg%C3%B3cio-Clientes-e-produtos

## Identidade recomendada

### Nível 1 — conversa
Telefone WhatsApp identifica o canal/conversa, não a pessoa de forma definitiva.

### Nível 2 — cliente operacional
Cadastro local pode existir com:
- nome;
- telefone;
- endereço;
- histórico de pedidos;
- sem CPF temporariamente.

### Nível 3 — identidade fiscal/ERP
CPF/CNPJ válido e reconciliado com Bling.

Quando CPF existir:
- deve ser chave forte de correspondência;
- não criar outro contato Bling se já existe um com aquele documento;
- divergência de nome/endereço deve virar revisão, não duplicação silenciosa.

## Regra de matching
Ordem proposta:
1. bling_contact_id já vinculado;
2. CPF/CNPJ exato;
3. telefone + evidências;
4. nome/endereço apenas como sugestão;
5. revisão humana se ambíguo.

Nunca usar somente nome livre para fusão automática.

## Pedido pelo WhatsApp
Fluxo:
1. conversa chega com telefone;
2. resolver cliente por telefone;
3. se houver 1 correspondência segura, carregar histórico/endereço;
4. se não houver, criar identidade operacional mínima;
5. montar pedido;
6. antes da etapa fiscal/ERP que exigir documento, coletar CPF;
7. reconciliar com Bling;
8. não pedir novamente se já existe dado válido.

## Flow/PapoAI
PapoAI pode coletar:
- nome;
- telefone;
- CPF quando necessário;
- endereço;
- localização.

Mas PapoAI não é fonte oficial do cliente.

Ele envia dados -> motor de identidade valida -> Bling/local são reconciliados.

## Endereços
Cliente pode ter mais de um endereço.

Não sobrescrever automaticamente endereço antigo quando o cliente usa outro local.
Guardar:
- endereço salvo;
- endereço do pedido como snapshot;
- coordenada validada;
- referência;
- origem da coordenada.

O pedido deve manter snapshot para preservar o endereço efetivamente usado naquela venda.

## Localização WhatsApp
Pin/localização é forte evidência logística, mas não substitui os campos fiscais do endereço.

Fluxo:
- guardar coordenada;
- associar ao endereço/pedido;
- usar para rota;
- manter texto de rua/número/bairro para documento/atendimento.

## Recompra
Histórico Bling + histórico local permite:
- "repetir última compra";
- usar última cesta;
- preencher endereço;
- sugerir pagamento previsto.

Sempre gerar um novo rascunho e recalcular preços/estoque atuais.

## Evitar duplicidade
Control Tower deve mostrar:
- CPF já existe em outro cliente;
- mesmo telefone em múltiplos cadastros;
- contato Bling sem vínculo;
- cliente local sem Bling;
- divergência CPF/nome.

Fusão de cadastros é ação de supervisor/owner.

## Política de coleta de CPF
Não pedir CPF em toda conversa.

Pedir quando:
- cliente ainda não possui;
- venda vai avançar para etapa que exige identificação fiscal/ERP;
- regra fiscal exigir.

Isso reduz atrito no WhatsApp.

## Fonte de verdade
- Bling: cadastro ERP/fiscal consolidado;
- Supabase: identidade operacional/canal, snapshots de pedido e ponte;
- PapoAI: conversa/dados coletados;
- pedido: snapshot do que foi usado na venda.

## Control Tower
Cards:
- clientes sem CPF que possuem pedido aguardando avanço;
- contatos Bling em revisão;
- duplicidades;
- endereço incompleto;
- localização ausente em rota;
- cadastro novo do WhatsApp aguardando consolidação.

## Gate
Antes da implementação:
1. deduplicar estratégia de CPF;
2. definir política para clientes sem CPF;
3. homologar criação/atualização de contatos Bling;
4. testar alteração de endereço;
5. testar cliente com dois endereços;
6. testar mesmo telefone em dois contatos;
7. integrar PapoAI Flow;
8. garantir snapshot do pedido.
