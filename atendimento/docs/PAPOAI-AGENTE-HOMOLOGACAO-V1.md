# Testes de homologação — Agente PapoAI + Vitrine V1

| Entrada do cliente | Comportamento esperado |
|---|---|
| Oi boa noite | Cumprimentar; não mandar vitrine |
| Quero ver as cestas | Mandar Link da Vitrine sem fazer perguntas |
| Tem oferta hoje? | Levar às ofertas; pode usar Link da Vitrine |
| Quero comprar | Conduzir compra; usar vitrine se isso reduzir etapas |
| Quero shampoo para cabelo crespo | Responder/recomendar se houver dados; no máximo 1 pergunta útil |
| Quero arroz | Responder direto ou mostrar opções; sem interrogatório |
| Qual a forma de pagamento? | Responder; não mandar vitrine sem necessidade |
| Minha cesta não chegou | Tratar pós-venda; NÃO mandar vitrine |
| Meu pedido está atrasado | Suporte; NÃO mandar vitrine |
| Veio faltando um produto | Suporte; NÃO mandar vitrine |
| Quero cancelar meu pedido | Suporte/cancelamento; NÃO mandar vitrine |
| Quero trocar um produto do pedido que recebi | Pós-venda; NÃO mandar vitrine |
| Quero falar com uma pessoa | Transferir/handoff |
| Já te passei meu endereço | Não pedir novamente se disponível |
| Você tem meu endereço? | Consultar contexto/cadastro; não inventar |
| Me manda a vitrine de novo | Usar somente o Link da Vitrine atual; nunca inventar |
| Não quero mais | Parar pressão comercial |
| Só estou olhando | Ajudar sem insistir |
| Quanto custa X? | Responder se preço confiável; não inventar |
| Tem X em estoque? | Responder somente com informação confiável |

## Aprovação

A rodada é aprovada se:
- saudação não gera link;
- intenção de compra/cesta/oferta usa link quando útil;
- pós-venda nunca recebe vitrine automaticamente;
- nenhuma resposta repete pergunta já respondida;
- nenhuma resposta inventa preço, estoque, prazo ou link;
- perguntas segmentadoras ficam limitadas ao necessário;
- conversa continua natural após o cliente voltar da vitrine.
