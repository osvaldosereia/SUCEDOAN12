# Projeto detalhado — Flow, cadastro do cliente e confirmação do pedido

Projeto: WhatsApp Atendimento GitHub — SUCEDOAN12  
Atualizado: 25/10/2026 (America/Cuiaba)  
Branch: project/whatsapp-atendimento-github-20261025  
Estado: desenho inicial preservado como pesquisa. As decisões de UX e limites de implementação confirmados depois pelo usuário estão registrados na seção 10 e prevalecem quando houver conflito com a proposta original. Nenhum Flow foi publicado.

## 1. Decisão de arquitetura

A proposta separa os dados por função:

| Área | Fonte proposta | Regra |
| --- | --- | --- |
| Produtos usados nas cestas | Arquivos JSON versionados no GitHub | O novo projeto mantém ali cadastro, marca, preço, identificador e referência de imagem. Não usar Supabase como catálogo de produtos. |
| Composição das cestas | Arquivos JSON versionados no GitHub | Guardar tamanho, preço-base, posições, alternativas de marca, quantidades padrão e ordem. |
| Cadastro de cliente e endereços | Supabase existente | Consultar pelo telefone WhatsApp no servidor e preencher nome/endereço para revisão. Não copiar cadastro de cliente para o GitHub. |
| Flow e integração Meta | Endpoint HTTPS privado, preferencialmente uma Edge Function nova e isolada no Supabase existente | Usar Supabase como runtime seguro e ponte para o cadastro, sem guardar o catálogo de produtos nele. Não alterar funções existentes nem publicar até revisão e teste. |
| Pedido confirmado | Caminho canônico de pedidos já usado pela operação | Após revisão técnica, reaproveitar o serviço existente de pedido. Não criar um segundo formato de pedido nem inserir diretamente em tabelas sem passar pelas regras atuais. |

Esta decisão revisa a proibição anterior de qualquer uso do Supabase: a orientação mais recente do usuário permite usar o cadastro de clientes existente. A fronteira aprovada agora é: produtos e cestas no GitHub; identidade/endereço do cliente e integração de pedido no backend existente. Nenhum dado de produto será mantido no Supabase como fonte do novo catálogo.

A Edge Function é uma recomendação de arquitetura, não uma implantação. O Flow dinâmico precisa de um endpoint HTTPS que processe a troca criptografada de dados da Meta, faça o cálculo no servidor e responda rapidamente. O endpoint da Meta encerra a solicitação se não receber resposta em até 10 segundos; por isso deve usar catálogo versionado em cache, consultas de cliente objetivas e logs sem conteúdo pessoal.

## 2. O telefone e a identificação do cliente

O cliente não deve digitar o próprio telefone no Flow.

A Meta envia a identificação do remetente nos eventos de mensagem e de conclusão do Flow. Para carregar o cadastro antes de o Flow terminar, o backend deve associar a sessão a um identificador opaco em flow_token, ligado ao telefone E.164 e ao canal Meta que abriu a jornada. O token não deve conter nome, telefone, endereço, preço ou outros dados pessoais. Na conclusão, o backend confere se o remetente do webhook corresponde à sessão iniciada.

Regra de busca:

1. Normalizar o telefone recebido para E.164.
2. Usar o resolvedor de identidade de cliente já adotado pela operação, depois de confirmar seu contrato e suas permissões.
3. Vincular automaticamente somente um resultado ativo e inequívoco.
4. Se não encontrar cliente, pedir nome e endereço no Flow.
5. Se o número estiver associado a mais de um cadastro ou houver dúvida, não escolher sozinho: pedir correção ou encaminhar para atendimento humano.
6. Mostrar os dados encontrados para o cliente confirmar ou corrigir antes de preparar o resumo.
7. Uma correção feita no pedido vira snapshot de entrega. Não alterar automaticamente o cadastro mestre do cliente.

A inspeção somente de schema do projeto Supabase “Dona Antônia” encontrou a estrutura pública customers, customer_phones e customer_addresses. O telefone principal fica em customers.primary_whatsapp_e164; telefones adicionais ficam separados; os endereços também ficam em tabela própria e podem ser múltiplos, ativos e marcados como padrão. Isso permite localizar o cadastro e apresentar o endereço padrão, oferecendo seleção de outro endereço ou preenchimento de um novo.

Também existe a estrutura papoai_order_drafts_v2 e a tabela canônica orders. O draft já contempla referência de cliente, pagamento, snapshot do cliente, entrega, valor cotado, mensagens enviadas/confirmadas e vínculo ao pedido canônico. É uma candidata forte para reaproveitamento após auditoria do serviço que a grava. O desenho não autoriza escrita nessas tabelas durante esta etapa.

A verificação foi limitada a nomes, colunas, relações e indicadores de RLS. Nenhuma linha de cliente/endereço foi lida ou alterada. O estado de RLS não substitui a revisão das políticas e do caminho de acesso; a consulta deve ocorrer somente no servidor, através de função existente aprovada ou função nova com acesso mínimo. Segredos Supabase nunca entram no navegador.

## 3. Jornada proposta no WhatsApp

### Etapa 1 — Abrir a cesta

O cliente inicia ou aceita a jornada no canal correto. O servidor cria uma sessão curta, registra qual número da empresa iniciou o atendimento e prepara o flow_token opaco.

### Etapa 2 — Escolher o tamanho

O Flow mostra os tamanhos disponíveis e a indicação de preço inicial conforme a configuração comercial publicada.

### Etapa 3 — Editar cada tipo de produto

Manter uma tela por tipo de produto, conforme a preferência registrada. Em cada tela:

- mostrar as marcas/SKUs permitidos para aquele tipo;
- mostrar foto suportada, nome e preço unitário de cada alternativa;
- usar seleção única para a marca quando a regra permitir uma marca por posição;
- mostrar um seletor independente para a quantidade permitida, iniciando na quantidade padrão;
- permitir zero como opção de retirada, se a regra dessa cesta permitir;
- enviar as escolhas da tela ao servidor ao avançar, para validar e recalcular o total.

Para três marcas e cinco opções de quantidade, a mesma tela comporta dois campos de seleção independentes: uma escolha de marca e uma escolha de quantidade. A imagem, o nome e o preço ficam associados à opção da marca. Não é um cartão de produto com botão +/−. Se a regra futura permitir dividir a quantidade entre várias marcas no mesmo tipo, isso deve ser tratado como requisito separado, com uma linha de quantidade para cada marca.

### Etapa 4 — Confirmar dados do cliente

Se houver correspondência única, apresentar nome e endereço padrão para confirmar. Se houver mais de um endereço ativo, permitir escolher um. Sempre oferecer correção do endereço de entrega. Se não houver cadastro ou a correspondência for duvidosa, coletar os dados necessários no Flow.

O resumo do pedido usa um snapshot dos dados confirmados naquele momento. Isso evita que uma alteração futura no cadastro mude retroativamente o endereço de um pedido já fechado.

### Etapa 5 — Escolher pagamento

Apresentar a forma de pagamento como seleção única. Usar as formas atualmente aceitas pelo negócio: dinheiro, Pix, cartão de débito, cartão de crédito, vale-alimentação e vale-refeição, após validar a lista final da operação.

O Flow coleta somente a modalidade. Não coletar número do cartão, código de segurança, senha ou credencial de pagamento. O pagamento é realizado pelo processo normal da empresa na entrega/atendimento.

### Etapa 6 — Enviar o resumo para o WhatsApp

A última tela do Flow explica que o resumo será enviado naquela conversa para confirmação. O botão do Flow conclui o formulário e aciona o webhook. A conclusão do Flow ainda não confirma o pedido.

A Meta envia a resposta de conclusão ao webhook. Nosso servidor valida sessão, remetente, canal, revisão dos dados e preço, e então envia uma mensagem separada no mesmo chat. Essa mensagem é o resumo legível com os botões de resposta. Os botões interativos oficiais aceitam até três respostas; usar:

- Confirmar pedido
- Editar pedido
- Cancelar

A mensagem deve mostrar os produtos incluídos e suas quantidades, sem preço unitário. Deve mostrar uma única vez o preço final da cesta, a forma de pagamento, o nome do cliente e o endereço de entrega. O ajuste comercial interno fica incorporado no total e não aparece como linha separada.

Exemplo de formato:

> Confira seu pedido  
> 2 × Arroz Marca A 5 kg  
> 1 × Feijão Marca B 1 kg  
> ...  
> Total da cesta: R$ 000,00  
> Pagamento: Pix  
> Cliente: Nome  
> Entrega: endereço confirmado  
>   
> [Confirmar pedido] [Editar pedido] [Cancelar]

O total deve ser o valor final correto antes do cliente confirmar. Se o preço ou a disponibilidade mudar entre a mensagem e a confirmação, não aceitar silenciosamente o valor antigo: recalcular e enviar novo resumo para uma confirmação explícita.

### Etapa 7 — Confirmar e registrar o pedido

Somente o retorno do botão Confirmar pedido muda o estado para confirmado. O webhook da resposta usa o identificador da sessão e uma chave idempotente para impedir que repetição de evento crie dois pedidos.

Depois da confirmação, o backend encaminha o snapshot, itens, quantidades, preço interno e forma de pagamento ao processo canônico de pedidos já usado pela operação. O resumo para o cliente continua sem preços unitários; os dados internos necessários para operação/ERP ficam preservados no registro do pedido.

Editar reabre a configuração usando o rascunho existente e gera um novo resumo. Cancelar encerra o rascunho. Sessões abandonadas expiram e nunca viram pedidos automaticamente.

## 4. Regra de preço e disponibilidade

O catálogo público do GitHub define os produtos e preços que o novo projeto oferece. Para cada sessão, o servidor fixa uma revisão imutável dos arquivos de cesta/produto, evitando misturar valores de commits diferentes.

O total parte do preço-base da cesta e aplica as diferenças das marcas e quantidades escolhidas. A regra é validada no servidor na conclusão do Flow e novamente quando o cliente toca em Confirmar pedido. O navegador e o JSON submetido não são autoridade de preço.

GitHub não é controle de estoque em tempo real. Implementação vigente: o endpoint consulta server-side o saldo vendável do Supabase ao montar cada etapa e o webhook revalida a disponibilidade antes de criar o rascunho. A leitura falha fechado quando não é possível confirmar o saldo. A aplicação não reserva nem decrementa estoque; a equipe ainda deve conferir falta durante a separação.

## 5. Administração mínima do Flow

A primeira versão do gestor deve ter somente o necessário:

1. **Produtos:** pesquisar, cadastrar e editar os produtos usados nas cestas, com identificador estável, nome, marca, preço, foto e estado ativo.
2. **Cestas:** editar tamanhos, preço-base, composição, alternativas de marca, quantidades padrão e limites permitidos.
3. **Flow:** configurar canais, etapas fixas, opção de quantidade/remoção, dados de cliente, meios de pagamento e formato do resumo.
4. **Prévia e validação:** mostrar a tela de cada etapa, revisar os dados usados e validar Flow JSON antes de publicação.
5. **Versões:** relacionar cada Flow a uma revisão imutável de produtos/cestas; publicar separadamente para cada canal após validação.

Não criar um construtor visual genérico nem exigir edição de JSON para o uso cotidiano. O JSON é gerado pelo sistema; modo avançado pode ficar oculto até existir necessidade. Não criar senha própria para o admin, mas nenhuma gravação no GitHub pode usar token de escrita exposto no navegador: a persistência precisa passar por identidade GitHub ou backend autorizado.

## 6. Segurança, privacidade e confiabilidade

- Manter chave privada da Meta, token de acesso, segredo Supabase e lógica do ajuste interno somente em segredos/configuração de servidor.
- Não colocar telefone, nome, endereço, dados do cliente ou pedido nos arquivos públicos do GitHub.
- Não registrar payload descriptografado de Flow nos logs comuns.
- Associar cada sessão a um canal, remetente e revisão de produto/cesta; rejeitar token expirado ou remetente diferente.
- Tratar webhooks e cliques repetidos de forma idempotente.
- Guardar apenas o mínimo necessário para concluir e operar o pedido.
- Validar cliente, preço, quantidade, disponibilidade, pagamento e endereço antes da confirmação e da criação do pedido.
- Transferir para uma pessoa em falha de identidade, falta de endereço, indisponibilidade de produto ou inconsistência de preço.

## 7. Rodadas de implementação propostas

| Rodada | Entrega | Limite |
| --- | --- | --- |
| 1. Extração | Exportar e conferir cestas/produtos usados | Sem leitura direta do banco para importar produtos; sem mudanças em produção. |
| 2. Dados | Definir schema JSON, regra de preço e imagens | GitHub como fonte de produto/cesta; ajuste confidencial fora do repositório público. |
| 3. Admin inicial | Cadastro simples de produtos e editor de cestas | Branch e diretório próprios; sem senha própria e sem token no navegador. |
| 4. Flow mínimo | Gerar Flow JSON com marca, imagem, quantidade, cliente e pagamento | Prévia/validação antes de publicar; sem operação Meta ao vivo. |
| 5. Backend | Endpoint HTTPS isolado, flow_token, leitura de cliente e cálculo | Consultar apenas dados necessários; não ler/gravar produto no Supabase. |
| 6. Fechamento | Resumo na conversa com Confirmar, Editar e Cancelar | Nenhum pedido canônico antes do toque explícito em Confirmar. |
| 7. Piloto | Provar os dois números com contatos controlados | Sem envio em massa e sem alteração do site/admin de produção. |

## 8. Gates antes de programar o checkout

1. Receber a exportação completa e verificar os produtos das cestas.
2. Confirmar o resolvedor de cliente existente, formato E.164 e política para telefone ambíguo.
3. Confirmar regra para cliente sem cadastro e para endereço ausente/múltiplo.
4. Identificar a checagem de estoque e disponibilidade.
5. Revisar a função que grava rascunhos/pedidos; confirmar se papoai_order_drafts_v2 e orders são os destinos corretos.
6. Fechar as formas de pagamento e limites de quantidade.
7. Validar a fórmula do preço-base e o valor final exibido.
8. Validar a conclusão do Flow, o envio de resumo no chat e a confirmação idempotente nos dois canais.

## 9. Estado desta rodada

Concluído: pesquisa documental Meta/Supabase, leitura apenas do schema de clientes/endereço/pedido e desenho funcional do fechamento. Nenhuma linha pessoal de cliente foi lida, nenhum dado ou schema Supabase foi alterado e nenhuma ação foi feita na Meta. Não foi programado código nesta rodada.

## Fontes oficiais

### Meta

- [Flow endpoints e Flow token](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/implementingyourflowendpoint)
- [Envio de Flow](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/sendingaflow)
- [Webhooks de conclusão de Flow](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/flowswebhooks)
- [API de Flows](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/flowsapi)
- [Botões de resposta interativa](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-reply-buttons-messages)
- [Boas práticas e prazo do endpoint](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/bestpractices)

### Supabase

- [Proteção de dados, RLS e segredos](https://supabase.com/docs/guides/database/secure-data)
- [Chaves de API e uso no backend](https://supabase.com/docs/guides/getting-started/api-keys)
- [Edge Functions](https://supabase.com/docs/guides/functions)

### Contexto do repositório

- [Identificação de cliente](../../dona-antonia-operations-2/CUSTOMER-IDENTITY-DRAFT.md)
- [Vínculo de cliente no atendimento](../../superpowers/specs/2026-10-05-attendance-customer-linking-design.md)
- [Pesquisa de cesta e preço no WhatsApp](BASKET-ORDER-RESEARCH.md)

Pesquisa atualizada em 25/10/2026. O comportamento deve ser provado no Flow Builder e em número de teste antes de assumir publicação ou operação.

## 10. Decisões confirmadas depois da proposta inicial

O usuário fechou a seleção de produto e quantidade para o novo Flow:

- Uma tela por tipo de produto, com **somente um produto selecionável naquela tela**.
- Na mesma tela, as opções de produto aparecem primeiro e as quantidades aparecem logo abaixo.
- A última opção do seletor de produto é sempre `Não quero esse produto`; ela permite retirar o tipo em qualquer cesta.
- Quantidades disponíveis: de 1 a 6, limitadas ao saldo atual do produto quando o saldo for menor que seis.
- Produto com saldo desconhecido ou zero fica indisponível para seleção.
- Produtos, cestas, imagens compactadas e saldos são mantidos no catálogo novo do GitHub. O Supabase não é fonte de produto; serve somente à consulta server-side do cadastro/endereço do cliente.

O rascunho local implementa uma tela lógica `GROUP` que o endpoint atualiza a cada tipo, seguida de `CUSTOMER_REVIEW`. O checkout local aceita somente cliente ativo, único e com endereço ativo cadastrado; não cria cadastro ou endereço novo. As modalidades presentes no JSON atual são Pix, dinheiro, débito e crédito. Depois de concluir, o webhook enfileira o resumo, mas ele não chega à conversa enquanto não existir um consumidor da outbox. O Flow não confirma o pedido: a confirmação futura continua sendo pelo botão explícito no resumo do chat.

Os 61 saldos existentes no catálogo estão `null`, sem importação de tabela de produtos do Supabase; é preciso preencher os valores pelo Admin antes de oferecer itens em ambiente real. O saldo ainda não tem reserva/decremento automático. Flow Builder/Meta e aparelho não foram homologados. Nenhum Flow foi publicado, função implantada, migration aplicada, chamada Meta/Bling ou mensagem enviada nesta etapa.
