# Dona Antônia Operations 2.0 — Fluxo de Exceções e Recuperação (DRAFT)

> Documento de análise. Nenhuma alteração de produção foi feita.
> Última atualização: 2026-09-25.

## Objetivo
Projetar o happy path com máxima automação, mas principalmente definir o que acontece quando algo dá errado.

Regra:
**falha previsível deve virar uma fila clara, não um erro técnico escondido.**

A Control Tower deve transformar falhas em uma destas categorias:
- corrigida automaticamente;
- aguardando evento externo;
- precisa de operador;
- precisa de supervisor;
- precisa do proprietário;
- bloqueada por segurança.

## Estado atual observado
- 7 pedidos sem customer_id;
- 32 pedidos sem forma de pagamento preenchida;
- 1 job de pedido Bling em review_required;
- 2 jobs Bling totais em review_required;
- 0 jobs atualmente em retry;
- 1.010 produtos ativos sem gôndola ou prateleira completa;
- 23 produtos ativos sem GTIN;
- 3 produtos ativos sem imagem;
- 42 conversas WhatsApp marcadas human_required;
- 97 conversas WhatsApp em modo human.

Conclusão: as maiores exceções estruturais hoje são **localização física de produtos**, **identidade/dados de pedido** e **atendimento humano**, não imagens.

## 1. Cliente não confirma

### Automático
1. pedido permanece Aguardando confirmação;
2. não entra em separação;
3. não imprime picking;
4. não lança estoque;
5. envia lembrete dentro da política WhatsApp;
6. expira/cancela conforme SLA comercial aprovado.

### Humano
Só aparece em "Precisa de você" se:
- cliente responde algo ambíguo;
- pede alteração;
- existe pedido de valor alto/atípico;
- follow-up esgotou sem resposta e a equipe decidir ligar.

## 2. Cliente cancela antes de separar
Se a mensagem for inequívoca:
- cancelar automaticamente;
- retirar de filas;
- liberar reserva se já houver;
- registrar origem da confirmação/cancelamento;
- não imprimir ou invalidar impressão anterior.

Bling permite situação Cancelado e o Gerenciador de Transições pode estornar estoque quando aplicável.

Fonte:
https://ajuda.bling.com.br/hc/pt-br/articles/360035604194-Cancelar-um-pedido-de-venda
https://ajuda.bling.com.br/hc/pt-br/articles/360036005114-Lan%C3%A7ar-e-estornar-estoque-de-vendas

## 3. Cliente cancela depois que separação começou
Não tratar igual ao cancelamento simples.

Fluxo:
1. marcar "Cancelamento durante separação";
2. impedir avanço para conferência/expedição;
3. devolver itens fisicamente à localização;
4. desfazer reserva/estoque conforme estágio real;
5. registrar quem confirmou a devolução;
6. só então fechar cancelamento.

Não automatizar retorno físico porque depende de ação no mundo real.

## 4. Falta de estoque detectada antes da impressão
Se Bling/reserva informar falta:
- não imprimir;
- pedido entra em "Problema — estoque";
- sistema tenta identificar substituto somente como sugestão;
- PapoAI pode pedir autorização do cliente para troca;
- preço é recalculado pelo motor oficial.

Não permitir IA substituir item silenciosamente.

## 5. Falta de produto durante separação
Operador toca PROBLEMA -> Sem estoque.

Automático:
- pedido sai temporariamente da fila normal;
- não vai à conferência;
- Control Tower mostra impacto;
- verifica saldo Bling e eventuais reservas;
- verifica produto alternativo;
- prepara mensagem para cliente.

Supervisor decide/cliente aprova:
- substituir;
- remover;
- cancelar item/pedido.

Depois o motor recalcula e atualiza Bling.

## 6. Produto não encontrado / localização errada
Operador toca PROBLEMA -> Produto não encontrado.

Automático:
- registrar produto/localização;
- incrementar indicador de qualidade da localização;
- mostrar mapa gôndola/prateleira esperado;
- não alterar estoque automaticamente.

Supervisor pode:
- corrigir localização;
- marcar estoque divergente;
- mandar balanço rápido.

Com 1.010 produtos ativos ainda sem localização completa, esta é prioridade de saneamento antes da impressão por rota física.

## 7. Produto danificado
Operador registra danificado + quantidade.

Não assumir automaticamente que o estoque deve cair.
Ideal:
- separar "indisponível para venda" de "baixa definitiva";
- supervisor confirma motivo;
- Bling recebe ajuste conforme política;
- ledger registra evidência.

## 8. Impressão térmica falha
A impressão deve ser idempotente por pedido + versão do picking.

Se falhar:
- pedido continua Aprovado/Separar;
- Control Tower mostra "impressão pendente";
- retry automático limitado;
- depois botão Reimprimir.

Nunca duplicar impressão indefinidamente.

A folha deve conter:
- versão;
- timestamp;
- QR;
para evitar que funcionário use uma lista antiga depois de alteração do pedido.

## 9. Pedido alterado depois da impressão
Qualquer alteração de item/quantidade depois de aprovado:
1. invalida versão anterior;
2. gera nova versão;
3. reimprime com destaque "REVISÃO";
4. Control Tower marca que há papel anterior inválido;
5. operador confirma que descartou a folha anterior quando necessário.

## 10. Conferência encontra item errado
Preferir Bling Checkout.

Se EAN não pertence ao pedido:
- não aceitar silenciosamente;
- mostrar item esperado;
- permitir voltar à separação;
- não avançar pedido enquanto divergente.

O Checkout Bling oferece Picking/Packing e leitura de produtos por pedido.

Fonte:
https://ajuda.bling.com.br/hc/pt-br/articles/18134856833943-Como-utilizar-o-checkout-de-pedidos-de-vendas-no-Bling

## 11. Conferência incompleta
Bling permite checkout parcial.

Direção:
- salvar progresso;
- pedido permanece "Conferência";
- não lançar estoque/fiscal/expedição;
- Control Tower alerta se passar do SLA.

## 12. Webhook Bling chega duplicado
Bling exige idempotência no receptor.

Regra:
- responder 2xx também para duplicata;
- deduplicar por event/idempotency key;
- processar de forma assíncrona;
- ledger registra duplicata apenas como diagnóstico quando necessário.

Fonte:
https://developer.bling.com.br/webhooks

## 13. Webhook chega fora de ordem
Bling não garante ordem.

Regra:
- evento não deve ser aplicado cegamente;
- buscar/reconciliar estado atual da entidade quando necessário;
- usar version/timestamp quando disponível;
- estado final vence sequência de chegada.

Fonte:
https://developer.bling.com.br/webhooks

## 14. Endpoint de webhook fora do ar
Bling tenta novamente por até 3 dias com backoff.

Risco crítico:
se continuar falhando, a configuração daquele webhook pode ser desabilitada e precisa ser reativada.

Control Tower deve monitorar:
- última recepção por recurso;
- atraso anormal;
- status da configuração;
- alerta crítico se webhook ficar silencioso.

Fonte:
https://developer.bling.com.br/webhooks

## 15. Sincronização pedido -> Bling dá resultado incerto
Nunca repetir POST cegamente.

O código atual já possui um padrão correto em várias operações:
- escreve;
- se resposta é incerta, reconcilia usando chave externa/numeroLoja;
- só tenta novamente quando sabe que não criou duplicata.

Esse padrão deve virar regra geral do projeto.

## 16. Pedido Bling diferente do local
Hoje já existem erros `post_update_order_mismatch`.

Fluxo:
- bloquear avanço automático;
- comparar campos gerenciados;
- mostrar diferença;
- definir qual sistema é fonte daquele campo;
- corrigir somente o lado que não é fonte;
- registrar resolução.

Nunca "forçar sincronização" sem mostrar qual dado divergiu.

## 17. NF-e rejeitada
Bling/SEFAZ retorna motivo.

Regra:
- pedido não sai como pronto;
- Control Tower mostra rejeição traduzida;
- não excluir nota rejeitada;
- corrigir causa e reenviar quando permitido;
- owner/supervisor fiscal recebe ação.

O próprio Bling orienta não excluir notas rejeitadas, e sim corrigir e reenviar.

Fonte:
https://ajuda.bling.com.br/hc/pt-br/articles/360037036154-Como-consultar-a-rejei%C3%A7%C3%A3o-da-nota

## 18. NF-e pendente/autorização incerta
Não enviar de novo imediatamente.

Fluxo:
- estado "Aguardando SEFAZ";
- reconciliar situação;
- timeout progressivo;
- só escalar depois de janela definida.

Evita nota duplicada ou reenvio indevido.

## 19. DANFE/etiqueta não imprime
Documento fiscal autorizado não deve ser recriado por causa da impressora.

Fluxo:
- manter NF-e válida;
- retry da impressão;
- permitir reimprimir;
- alertar estação/impressora;
- seguir somente se documento físico for necessário para a etapa.

## 20. Integração Bling indisponível
Classificar:
- leitura indisponível;
- escrita indisponível;
- OAuth;
- rate limit;
- escopo/permissão.

Happy path:
- fila local segura;
- não perder pedido;
- não repetir gravação de forma insegura;
- retomar após saúde restabelecida;
- Control Tower mostra desde quando está degradado.

## 21. PapoAI indisponível
Pedido do site não pode depender do PapoAI para existir.

Se PapoAI cair:
- pedido é salvo;
- confirmação WhatsApp fica pendente;
- Control Tower mostra canal indisponível;
- funcionário pode confirmar manualmente se falar com cliente;
- depois reconciliar mensagens.

## 22. Mensagem WhatsApp ambígua
IA nunca transforma frase ambígua em pedido confirmado.

Exemplo:
"acho que pode mandar aquela de sempre"

Se não houver segurança suficiente:
- rascunho;
- pergunta curta;
- ou handoff humano.

## 23. Cliente sem cadastro/CPF
Não bloquear desnecessariamente a recepção do pedido.

Fluxo:
- pedido pode existir como rascunho/aguardando confirmação;
- antes da etapa em que Bling/fiscal exigir identidade, pedir o dado;
- PapoAI/Flow tenta coletar;
- Control Tower mostra pendência;
- operador não redigita se dado chegar digitalmente.

## 24. Endereço incompleto
Automático:
- pedir rua/número/bairro/referência;
- aceitar localização WhatsApp;
- montar preview Maps;
- só liberar para expedição quando endereço for suficiente.

## 25. Entrega não concluída
Entregador toca NÃO ENTREGUE e motivo:
- cliente ausente;
- endereço não encontrado;
- recusou pedido;
- problema pagamento;
- outro.

Automático:
- pedido sai da rota concluída;
- não marcar recebido;
- não baixar financeiro;
- criar reentrega ou cancelamento conforme regra;
- avisar cliente;
- Control Tower acompanha.

## 26. Forma de pagamento muda na porta
Isso é fluxo normal, não erro.

Tela deve permitir trocar:
- PIX
- dinheiro
- crédito
- alimentação
- refeição
- split

Só confirma quando soma = total.

A questão fiscal permanece sujeita à homologação MT documentada no projeto.

## 27. Cartão falha
Entregador escolhe:
- tentar outro cartão;
- trocar meio;
- dividir meios;
- não entregar.

Nada deve ser marcado pago antes da confirmação real.

## 28. Valor recebido divergente
Bloquear fechamento automático.

Exemplos:
- dinheiro com desconto não autorizado;
- split soma diferente;
- troco lançado incorretamente.

Vai para supervisor/owner.

## 29. XML CNPJ com produto sem correspondência
Não criar vínculo arbitrário.

Fila:
- sugestão por GTIN;
- SKU fornecedor;
- descrição;
- histórico;
- confiança.

Se confiança abaixo do gate:
- supervisor escolhe produto ou cria novo.

## 30. Conversão caixa->unidade ambígua
Nunca ajustar estoque automaticamente.

Control Tower mostra:
- XML;
- qCom/uCom;
- qTrib/uTrib;
- DUN;
- fornecedor;
- histórico daquele item.

Supervisor confirma fator uma vez.
Depois o fator conhecido pode ser automático.

## 31. XML CPF
Sempre identificado como pessoal.

Pode alimentar evidências cadastrais/custo conforme política, mas:
- nunca cria conta a pagar empresarial automaticamente;
- nunca vira obrigação financeira da empresa por simples importação.

## 32. Conta a pagar duplicada
Reconciliação por documento/chave/parcela antes de criar.
Se houver duas candidatas:
- review_required;
- não criar terceira.

## 33. IA falha ou fonte está indisponível
A IA deve responder "não confirmado" e não completar lacuna por inferência.

Se ferramenta crítica falha:
- nenhuma ação de escrita;
- criar alerta;
- permitir tentativa posterior.

## 34. Regra de escalonamento
### Operador
- separação;
- conferência;
- problema físico simples.

### Supervisor
- estoque divergente;
- produto/localização;
- substituição;
- XML/conversão;
- reentrega.

### Owner
- fiscal;
- financeiro;
- alteração de regra;
- ação irreversível;
- segurança;
- automação crítica.

## 35. SLA de exceções
Projeto final deve definir tempos, por exemplo:
- confirmação cliente;
- impressão;
- separação;
- conferência;
- fiscal;
- rota;
- entrega;
- webhook;
- integração.

A Control Tower deve alertar por atraso, não apenas por erro.

## Métrica principal
A exceção deve ser rara e visível.

Medir:
- % pedidos no happy path;
- intervenções humanas por pedido;
- pedidos parados por etapa;
- tempo médio de resolução;
- reimpressões;
- divergências de conferência;
- rejeições fiscais;
- falhas de integração;
- entregas frustradas;
- divergências de pagamento.
