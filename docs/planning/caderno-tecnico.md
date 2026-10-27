# Caderno técnico complementar — fluxos, clientes, catálogo e pedidos

**Documento associado:** [Pesquisa e plano profissional — Admin WhatsApp da Sucedoan](pesquisa-e-plano.md)
**Implementação:** [Plano de execução por tarefas](plano-execucao.md)
**Data de referência:** 26/10/2026
**Escopo:** pesquisa, especificação e decisões para implementação greenfield. Nenhum código antigo foi reaproveitado; a base de interface já começou na branch documentada.

Este caderno detalha os contratos que devem orientar a implementação. Cada intenção de compra cria seu próprio pedido canônico: uma cesta iniciada pelo Flow e cada carrinho enviado pelo Catálogo Meta nunca se misturam, mesmo na mesma conversa ou sem intervalo entre eles. Cada pedido tem resumo, aceite, registro no Admin e documento fiscal próprios.

## 1. O que o histórico do GitHub acrescenta

Foi consultada a documentação histórica do repositório [osvaldosereia/SUCEDOAN12](https://github.com/osvaldosereia/SUCEDOAN12), em especial a branch [admin-v3-chat-center-20260912](https://github.com/osvaldosereia/SUCEDOAN12/tree/admin-v3-chat-center-20260912). O conteúdo abaixo foi usado para recuperar decisões e requisitos, não para reutilizar código, esquema de banco, migrações ou funções antigas.

| Documento histórico | Informação útil | Tratamento recomendado |
|---|---|---|
| [Decisão Admin Inteligência Simples MVP V1](https://github.com/osvaldosereia/SUCEDOAN12/blob/admin-v3-chat-center-20260912/docs/DECISAO-ADMIN-INTELIGENCIA-SIMPLES-MVP-V1.md) | ANA em linguagem cotidiana, três áreas; salvar rascunho e publicar explicitamente; preço, catálogo e estoque vêm do banco | Preservar simplicidade/publicação explícita; esconder JSON, prompts técnicos e parâmetros |
| [WhatsApp Cestas Implementação](https://github.com/osvaldosereia/SUCEDOAN12/blob/admin-v3-chat-center-20260912/docs/WHATSAPP-CESTAS-IMPLEMENTACAO-20260908.md) | Existiam nove modelos de cesta e opção de trocar/adicionar produtos | Tratar nove como inventário histórico a conferir; não presumir modelos, produtos ou preços atuais |
| [Decisão WhatsApp Flow V2 Produção](https://github.com/osvaldosereia/SUCEDOAN12/blob/admin-v3-chat-center-20260912/docs/DECISAO-WHATSAPP-FLOW-V2-PRODUCAO-2026-09-09.md) | Flow V2 ID 1539877778181619 registrado como PUBLISHED em 09/09/2026; Flow V1 ID 1538860004926321 coexistiu; até 27 escolhas (16 alimentos, 11 higiene/limpeza) | IDs/publicação/JSON são candidatos para inspecionar na Meta, não garantias de ativos atuais nem material para copiar |
| [Análise de WhatsApp Flows para comércio conversacional](https://github.com/osvaldosereia/SUCEDOAN12/blob/admin-v3-chat-center-20260912/docs/ANALISE-WHATSAPP-FLOWS-COMERCIO-CONVERSACIONAL-V1.md) | Flow para escolhas estruturadas; ANA para intenção; preço determinístico no servidor; valores submetidos são não confiáveis | Preservar separação entre conversa e cálculo; avaliar telas por categoria para reduzir abandono |
| [Estratégia de cadastro e vitrine](https://github.com/osvaldosereia/SUCEDOAN12/blob/admin-v3-chat-center-20260912/docs/WHATSAPP-ATENDENTE-ESTRATEGIA-CADASTRO-VITRINE-20260909.md) | Modelo antigo associava pelo telefone; nome de perfil não é necessariamente nome da pessoa; resumo e total antes da confirmação | Preservar separação de nome de perfil e nome confirmado e o resumo antes do aceite; o telefone como chave obrigatória foi superado pelo lançamento gradual de usernames/BSUID e pela privacidade oficial atual |
| [MVP confirma antes do Bling](https://github.com/osvaldosereia/SUCEDOAN12/blob/admin-v3-chat-center-20260912/docs/DECISAO-MVP-WHATSAPP-CONFIRMA-ANTES-BLING-V1.md) | Confirmação explícita antes de criar pedido definitivo; Bling assíncrono e falha não apaga pedido | Preservar; sincronização ERP é estado separado |
| [Decisão fiscal de entrega, pagamento e NF-e](https://github.com/osvaldosereia/SUCEDOAN12/blob/admin-v3-chat-center-20260912/docs/DECISAO-FISCAL-ENTREGA-PAGAMENTO-NFE-V1.md) | Decisão antiga exigia entrega e pagamento antes da NF-e | Conflita com a instrução atual de iniciar Bling na EXPEDIÇÃO. Sincronizar a venda nessa etapa; validar a política de emissão/envio com contador antes de ativar |
| [WhatsApp Bridge V3](https://github.com/osvaldosereia/SUCEDOAN12/blob/admin-v3-chat-center-20260912/docs/WHATSAPP-BRIDGE-V3.md) | Arquitetura antiga usava transporte intermediário | Não copiar cenários/dependências; recomendação atual é Meta Cloud API direta, pois ambos os números já usam a API oficial |
| [Arquitetura Dona Antonia V2](https://github.com/osvaldosereia/SUCEDOAN12/blob/admin-v3-chat-center-20260912/docs/ARQUITETURA-DONA-ANTONIA-V2.md) | Supabase operacional, Bling ERP; regra fiscal antiga para composição da cesta | Usar só como hipótese para confirmar com contador e mapeamento atual |

### O que não carregar como regra atual

Valores e controles históricos são datados: cidades atendidas, taxa/gratuidade de entrega, horário de corte, pagamentos, disponibilidade de produtos, ativação da ANA, status/IDs de Flow, cenários e integração Bling. Consultar conta e operação atuais. Se segredo foi exposto em commit, não recuperar para produção; rotacionar no provedor.

### Inventário de migração, sem importar código

Na Fase 0, preparar relatório de leitura: nove cestas históricas para confirmação; componentes, quantidades e alternativas; identificadores Meta dos produtos; SKUs/IDs Bling; dois números e phone_number_id; WABA, templates, Flow publicado, permissões e conexões atuais. Classificar cada dado como **confirmado**, **validar** ou **obsoleto**. Só dados confirmados entram no novo cadastro.

## 2. Conversa, rascunho e sessão Flow são objetos diferentes

Separá-los resolve quando a mesma pessoa fala com dois números, compra mais de uma vez ou abandona uma personalização.

| Objeto | Duração/identidade | Responsabilidade |
|---|---|---|
| Cliente | Duradouro; cadastro interno com nome potencialmente desconhecido | Cadastro compartilhado quando a identidade for comprovadamente vinculada; não usar nome ou telefone como única chave automática |
| Identidade WhatsApp | Identificador do remetente que a Meta fornece, escopado por portfolio/WABA e canal | Endereçar respostas e correlacionar eventos; telefone E.164 é um contato opcional quando fornecido/verificado |
| Conversa | Longa; identidade remetente + número comercial | Histórico, fila, atendente, modo ANA/humano e janela Meta do canal |
| Rascunho de pedido | Um por intenção de compra; cliente e conversa | Guarda produtos de uma origem, pagamento, endereço e total ainda sem aceite |
| Sessão Flow | Curta/descartável; token aleatório vinculado ao rascunho | Transporta escolhas; não é pedido oficial nem fonte de preço |
| Lote de catálogo | Imutável; deduplicado pelo ID da mensagem Meta | Registra o carrinho enviado e sua origem |
| Pedido confirmado | Duradouro; ID interno | Pedido operacional, auditoria e sincronização ERP |

Regras:

1. A conversa é indexada pelo identificador de remetente recebido da Meta e pelo phone_number_id; E.164 é opcional e nunca substitui esse identificador.
2. O WhatsApp está liberando usernames de forma gradual e informa que a pessoa pode manter o telefone privado ao iniciar contato com empresa. Portanto, customers.full_name não deve ser requisito para criar um lead; a tela mostra “Contato WhatsApp” até o nome ser confirmado.
3. Guardar nome de perfil fornecido pela plataforma separado de nome confirmado pelo cliente. Não substituir automaticamente nome confirmado.
4. Vincular dois identificadores ou conversas à mesma ficha apenas quando a Meta entregar vínculo verificável ou o cliente/atendente confirmar. Não unir por nome, foto, telefone ausente ou semelhança.
5. Antes de pedido/entrega/contato no Bling que exija telefone, solicitar o compartilhamento do contato; guardar origem e verificação. Não bloquear o início da conversa por ausência de telefone.
6. Cada compra tem rascunho próprio. Uma conversa pode ter mais de um rascunho aberto se a pessoa iniciar um Flow e também enviar um carrinho do Catálogo.
7. Não existe janela temporal para decidir se Flow e Catálogo pertencem ao mesmo pedido: são sempre pedidos separados. Rascunhos de compra não expiram automaticamente; podem ser cancelados pela pessoa/equipe, e preço/estoque são atualizados antes de confirmar.
8. O rascunho comercial não expira por inatividade. Se a sessão técnica do Flow não puder ser retomada pelo cliente/WhatsApp, reenviar um Flow com token novo ligado ao mesmo rascunho; isso nunca junta pedidos nem altera venda aceita. A janela Meta para mensagens é independente.
9. Token Flow opaco, imprevisível e sem dados pessoais/preço. O servidor guarda associação e estado. Invalidar o token ao concluir, cancelar ou emitir uma retomada substituta; não aplicar TTL comercial automático ao rascunho. Token reutilizado ou de outro número não altera pedido.
10. Completar Flow, enviar carrinho, visualizar mensagem ou ficar em silêncio não confirma compra. Só a ação explícita Confirmar pedido cria a venda; aceite válido congela um pedido completo e o envia diretamente para PRODUÇÃO — Separação. Se uma validação falhar, manter o rascunho e pedir correção/novo aceite; não criar um pedido incompleto em NOVO.

## 3. Jornada do cliente: do “oi” ao pedido

1. **Entrada:** webhook identifica phone_number_id, identificador real do remetente (wa_id/BSUID ou o tipo vigente), ID Meta, horário e tipo. Persistir o evento antes de responder.
2. **Cliente:** procurar primeiro pelo vínculo de identidade WhatsApp e criar lead sem nome/telefone quando necessário. Telefone E.164, se recebido, é contato auxiliar e sua origem/validação deve ser registrada. Endereço precisa ser selecionado/confirmado para cada pedido.
3. **Conversa:** recuperar conversa por identidade de remetente + número comercial; cliente é vínculo opcional até ser identificado. Inbox deixa claro por qual número a pessoa escreveu. Deduplicar webhook por ID Meta.
4. **Intenção:** ANA/humano identifica cesta, avulso, consulta ou pedido por pessoa. Preço/estoque vêm das ferramentas do Admin.
5. **Rascunho:** abrir um rascunho independente para cada compra: cesta via Flow ou carrinho via Catálogo.
6. **Cesta no Flow:** enviar CTA com token ligado ao próprio rascunho. O Flow recolhe componentes, pagamento e dados de entrega; o servidor valida escolha, estoque e preço.
7. **Cliente/endereço:** depois da escolha de pagamento, procurar cliente pelo identificador WhatsApp. Se encontrado, pedir confirmação/seleção de endereço salvo; se não, recolher nome/endereço e cadastrar.
8. **Resumo/aceite:** enviar produtos e quantidades, endereço, pagamento e total geral, sem preço individual de cada produto. Cada intenção de compra recebe seu próprio resumo e aceite.
9. **Pedido do Catálogo:** cada carrinho Meta cria uma compra separada da cesta, mesmo que chegue logo depois ou enquanto o Flow estiver aberto. Nunca anexar carrinho a cesta nem editar venda aceita.
10. **Confirmação/separação:** antes do aceite, coletar dados obrigatórios e validar preço/estoque. O aceite válido cria um pedido Admin independente e o encaminha diretamente para PRODUÇÃO — Separação. Dado ausente ou cotação alterada mantém o rascunho e exige correção/novo aceite. NOVO é usado para pedido manual ou retido por ação operacional da equipe, sem representar um pedido WhatsApp confirmado incompleto.
11. **Pós-venda:** respeitar a janela de atendimento Meta; fora dela usar template aprovado e consentimento aplicável. Falha de envio não reabre nem duplica pedido.

## 4. Telas e contrato do WhatsApp Flow

**Decisão revisada pela solicitação mais recente:** cada etapa visível do Flow trata de um componente/slot da cesta, como ARROZ, FEIJÃO ou ÓLEO. A tela mostra as alternativas de produto daquele componente, depois a quantidade de 0 a 6 e, por fim, o botão Próximo. A experiência não agrupa vários componentes na mesma tela.

1. Início direto no primeiro componente da cesta; a mensagem que acompanha o Flow explica a tarefa, portanto não se gasta uma tela com introdução.
2. Uma tela por componente: alternativas permitidas, valor comercial para a cesta, quantidade e total atualizado.
3. Próximo salva e valida a escolha no servidor e abre o componente seguinte; voltar recupera a escolha já salva.
4. Após o último componente, uma tela de forma de pagamento carrega as opções habilitadas pelo Admin.
5. Em seguida, o servidor procura o cliente pela identidade WhatsApp; a tela correspondente confirma um endereço salvo ou cadastra nome/endereço se não encontrar cliente/endereço.
6. A última tela do Flow revisa produtos/opções/quantidades, pagamento, endereço e total. Concluir escolhas devolve a submissão, mas não confirma a compra.
7. Um carrinho do Catálogo Meta é sempre um pedido separado da cesta do Flow, mesmo se chegar imediatamente ou enquanto o Flow estiver aberto. Cada um tem seu próprio rascunho, total e aceite.
8. Para cada pedido, a conversa recebe um resumo independente com produtos/quantidades, endereço, forma de pagamento e total geral, sem preços individuais. Só o aceite explícito cria aquela venda no Admin e a encaminha à Separação.

O Flow é dinâmico porque produto, preço, estoque, versão da cesta e total devem ser lidos/calculados pelo servidor a cada Próximo. Para manter uma tela simples por componente sem gerar dezenas de telas JSON duplicadas, a implementação principal poderá reutilizar uma tela técnica ITEM com conteúdo e título dinâmicos, avançando para si até o último componente. A publicação precisa validar esse padrão no Flow Validator e num número interno. Se a Meta rejeitar o retorno à mesma tela como avanço, o publicador do Admin deve gerar automaticamente uma tela JSON por componente, ainda com a mesma experiência que o cliente pediu. Essa é uma contingência técnica predeterminada; não muda o desenho comercial.

O Flow continua focado em um componente por tela até terminar os itens. Pagamento vem depois dos componentes; em seguida, o servidor procura a identidade exata no cadastro. Se encontrar cliente, o Flow pede confirmação/seleção de um endereço salvo; se não encontrar cliente ou endereço, recolhe nome e endereço e grava o cadastro. O endereço usado é sempre explicitamente confirmado e copiado como snapshot; não inferir endereço pela linha WhatsApp.

### Validação técnica

A conclusão chega no webhook comum como `interactive.nfm_reply`; `response_json` é JSON serializado. Se o spike confirmar que `flow_token` é devolvido em todas as linhas, usá-lo como correlator após validar remetente, número, WABA, token, versão e estado do rascunho. Aplicar schema estrito e rejeitar campos inválidos. Buscar dados atuais e recalcular no servidor. O uso do token no evento final permanece gate de prova, não uma suposição baseada no commit legado.

**Decisão de imagem, com limite de evidência explícito:** todas as alternativas precisam mostrar a foto do produto; é requisito do proprietário e desenho pretendido. A URL oficial [Meta Flow JSON Components](https://developers.facebook.com/docs/whatsapp/flows/reference/components) é a fonte de contrato por componente/versão, mas respondeu HTTP 429 nesta revisão. Anotações anteriores registram suporte a imagem Base64, `alt-text` e `data-source` dinâmico, com detalhes dependentes da versão; não transformar a versão mínima nem números de tamanho anotados em constante até reconfirmar a página oficial e obter sucesso no Flow Validator das duas WABAs. A miniatura interna de até 25 KB é uma meta de desempenho do projeto. Imagem por alternativa é o caminho de implementação sujeito à validação; se a Meta não aceitar, bloquear a publicação comercial até resolver, sem retirar a foto.

**Contrato de entrada para cada origem:** Flow concluído chega como `interactive.type = nfm_reply`; o servidor analisa `response_json` e, depois do spike confirmar o eco do token, localiza o rascunho por hash do `flow_token` aleatório emitido por ele, conferindo remetente + `phone_number_id` + WABA + versão da cesta. Se o evento não devolver o token, a programação do checkout para até especificar e provar outra correlação. O webhook de carrinho chega como `messages[].type = order`; cria rascunho separado e resolve os itens pelo catálogo e `product_retailer_id`. Ambos ligam a intenção à mesma ficha de cliente/conversa quando a identidade estiver comprovada, mas nenhum evento transfere nem mistura os itens da outra origem. Cada webhook tem deduplicação própria por ID Meta e ambos convergem para o mesmo serviço interno de revisão e confirmação.

O Data Exchange dinâmico é obrigatório para a cesta porque cada Próximo precisa ler alternativas/preços/estoque vigentes, salvar a seleção e calcular o total atualizado no servidor. Não oferecer como opção de desenho um Flow estático que possa exibir valor desatualizado.

- Separar endpoint Data Exchange do webhook normal e suportar ping, init, data_exchange e back conforme protocolo da versão usada.
- Publicar chave pública conforme Meta; manter privada somente nos segredos do servidor. Confirmar a configuração para cada phone_number_id.
- Não registrar payload pessoal descriptografado em logs.
- Verificar status, json_version, data_api_version, erros de validação e saúde do Flow antes de enviar. Versionar mudanças do Flow publicado.

Se o Flow dinâmico não estiver saudável, suspender o envio e usar a jornada alternativa guiada no chat com a mesma regra de preço; nunca degradar silenciosamente para um Flow estático com preço antigo.

## 5. Pedidos independentes: Flow da cesta e Catálogo Meta

**Decisão atual que substitui a proposta anterior de unir cesta e carrinho:** cesta feita pelo Flow e carrinho enviado pelo Catálogo são sempre pedidos separados. A separação não depende de minutos/horas, do estado da conversa nem de `context.id`. Mesmo se a pessoa enviar um carrinho logo depois de concluir o Flow, o Admin cria outro rascunho, pede outra confirmação e registra outra venda. Isso simplifica a operação e permite uma nota fiscal por pedido.

Cada compra tem `order_draft_id`, revisão de cotação, forma de pagamento, endereço, aceite, número de pedido e estado Bling próprios. Os dois pedidos aparecem na mesma ficha/conversa do cliente, quando a identidade estiver comprovada, como cartões distintos. Nunca editar/adicionar itens a uma venda já confirmada.

### Pedido de cesta pelo Flow

1. Criar rascunho exclusivo para a cesta e vincular a sessão Flow apenas a esse rascunho.
2. Flow percorre componentes um por vez; no fim coleta pagamento, procura cliente/endereço e solicita dados ausentes.
3. Depois da submissão, revalidar preços/estoque e enviar resumo próprio: lista de produtos/opções e quantidades, endereço de entrega, forma de pagamento e total geral. Não mostrar preços individuais dos produtos.
4. O botão Confirmar pedido aceita somente essa revisão. Em transação idempotente, salvar aceite, congelar snapshot e criar a venda Admin.
5. O aceite válido cria pedido diretamente em PRODUÇÃO — Separação. Se algum dado/preço/estoque não passar, não confirmar nem criar pedido; corrigir o rascunho e emitir novo resumo. O Bling ainda é chamado quando sair de PRODUÇÃO para EXPEDIÇÃO.

### Pedido pelo Catálogo nativo

1. Cada mensagem recebida como carrinho `messages[].type = order` cria uma intenção de pedido própria; deduplicar retries pelo ID original Meta. Um evento Meta distinto é outro pedido, não atualização do anterior.
2. Resolver cadastro pela identidade de remetente/escopo; nunca agrupar cesta e carrinho. Se houver um cliente e endereço confirmado, mostrar para confirmar. Se não houver cliente/endereço, recolher nome e endereço no chat/Flow de checkout e cadastrar.
3. Interpretar o payload documentado pela Meta: `order.catalog_id` e cada `order.product_items[]` trazem `product_retailer_id`, `quantity`, `item_price` e `currency`; guardar `messages[].id`, remetente, `phone_number_id`, `entry[].id` (WABA) e `context` quando presentes. A amostra oficial serializa quantidade e preço como texto; o normalizador deve aceitar somente os tipos/formatos definidos e validados para a Graph API ativa, converter quantidade a inteiro válido e dinheiro a centavos sem ponto flutuante. Resolver o par catálogo + retailer ID para um produto/SKU interno. `item_price` é o preço observado no carrinho recebido, não preço final autorizado: comparar moeda, preço, disponibilidade e vínculo com o cadastro vigente no Admin; recalcular no servidor e exigir novo resumo/aceite se houver divergência.
4. Recolher forma de pagamento e endereço para esse pedido. É permitido pré-preencher a última opção confirmada para conveniência, mas o resumo precisa mostrar o método/endereço e pedir aceite outra vez.
5. Enviar resumo independente com produto e quantidade, endereço, pagamento e total geral, sem preço individual por linha. Só a confirmação desse resumo cria o segundo pedido.
6. Quando ocorrer a transição PRODUÇÃO → EXPEDIÇÃO, enviar cada pedido separadamente ao Bling com referência externa própria; cada um tem processo fiscal e NF-e independentes.

### Sem limite de tempo para a separação

- Nunca há janela temporal de associação: carrinho Meta e cesta Flow permanecem separados tanto se chegarem juntos como com dias de diferença.
- Rascunhos não são eliminados automaticamente por inatividade; ficam como pendentes até confirmação ou cancelamento explícito. A lista do Admin oferece retomar, cancelar e revisar.
- Antes de confirmar, o servidor busca preço, estoque, frete e endereço atuais. Se algo mudou, cria nova revisão e pede novo aceite; não depende de uma validade temporal escondida.
- O rascunho comercial não vence com o relógio. Se o cliente precisar retomar e a sessão técnica original não estiver utilizável, reemitir o Flow com token novo para o mesmo rascunho e recalcular preço/estoque; nunca juntar com outro pedido.
- A janela de 24 horas da Meta continua valendo para mensagens livres. Se fechada, usar template aprovado ou aguardar novo contato; isso não cancela o rascunho.

### Dados técnicos e idempotência

- Guardar `phone_number_id`, WABA, identidade do remetente, ID da mensagem de carrinho, `context.id` se presente, `catalog_id`, IDs retailer/quantidades/preços observados e `order_draft_id` para rastrear a origem e impedir duplicação. A chave de deduplicação da entrada é o ID Meta da mensagem com escopo do número; `context.id` serve para auditoria e contexto, nunca para associar carrinho à cesta Flow.
- `context.id` identifica a mensagem a que o cliente respondeu; serve como evidência de contexto e auditoria, nunca como instrução para unir dois pedidos.
- Um retry com o mesmo ID Meta é processado uma vez. Uma nova mensagem de carrinho, com ID Meta diferente, inicia outro rascunho, mesmo com itens iguais.
- Cada pedido tem quote revision, payment_method, address_snapshot, total, confirmação e chave de idempotência próprias. Constraints impedem promover duas vezes o mesmo rascunho.
- Se o cliente envia carrinho enquanto o Flow está aberto, manter as duas compras separadas no Admin. Nenhuma resposta tardia de Flow pode alterar o rascunho do carrinho, e vice-versa.

### Mensagem de confirmação de cada pedido

**Confira seu pedido**

• Arroz Tio Alvino × 1
• Feijão × 2
• Óleo de soja × 2

**Entrega:** endereço confirmado, com referência resumida
**Pagamento:** forma escolhida
**Taxa de entrega:** mostrar apenas se houver cobrança; informar antes do total
**Total do pedido: R$ …**

“Confirme para encaminharmos este pedido para separação. Um carrinho do Catálogo enviado depois será tratado como outro pedido.”

Botão principal: **Confirmar pedido**. Para editar, a pessoa responde “ALTERAR” ou pede atendimento; uma edição gera nova revisão e invalida o botão anterior. Cada pedido tem sua própria mensagem, aceite e número.
## 6. Cadastro do cliente no Admin

### Campos e comportamento

| Campo | Regra |
|---|---|
| Identidade WhatsApp | ID de remetente recebido da Meta, tipo, portfolio/WABA, phone_number_id, origem e primeiro/último evento; único dentro do escopo confirmado |
| Telefone WhatsApp | Opcional; E.164 apenas se compartilhado/recebido e verificado; origem e data de verificação guardadas |
| Nome de perfil Meta | Informativo e não verificado; não substitui nome confirmado |
| Nome do cliente | Pode ser nulo no primeiro contato; editar/confirmar durante atendimento; UI usa “Contato WhatsApp” enquanto desconhecido |
| Endereços | Vários por cliente; apelido, logradouro, número, complemento, bairro, cidade, referência |
| Conversas | Uma por identidade de remetente e número comercial; cadastro global só quando houver vínculo comprovado |
| Consentimentos | Origem, finalidade, versão do texto, data e opt-out |
| Bling | ID externo opcional, última sincronização e erro legível |
| Histórico | Pedidos e conversas com permissões; notas internas não visíveis ao cliente |

### Criação, busca e duplicidade

- Buscar primeiro pelo identificador do remetente e pelo escopo do canal. Telefone é chave auxiliar de correspondência somente quando presente e verificado.
- Se novo, criar identidade/conversa mínima sem exigir nome nem telefone; pedir telefone e nome apenas quando a operação do pedido/entrega exigir.
- Mesmo telefone vindo por dois canais só permite ficha comum depois de vínculo verificado. Mostrar o número comercial de origem e atendente em cada conversa.
- Permitir correção/mesclagem de duplicata com trilha de auditoria; não fundir por nome automaticamente.
- Endereço recebido no Flow passa pela mesma validação de chat. Nunca sobrescrever endereço confirmado sem mostrar qual será usado.
- Como a Meta já requer suporte a BSUID para integrações diretas, manter `user_id`/BSUID como identidade de plataforma mesmo sem telefone e responder por esse identificador quando a Graph API ativa permitir. Pedir telefone compartilhado somente quando a logística, cliente ou etapa Bling realmente precisar dele; homologar campos e envio por cada WABA.
- Ação “Novo pedido” cria rascunho, nunca uma venda confirmada.

Detalhe do cliente com abas **Resumo**, **Conversas**, **Pedidos** e **Endereços**. No atendimento, contexto lateral mostra contato, endereço escolhido, últimos pedidos e rascunho. Notas internas precisam ser visualmente distintas das mensagens enviadas.

## 7. Estados e transições do pedido

### Estados de negócio

RASCUNHO → PRODUÇÃO (Separação) → EXPEDIÇÃO → ENTREGUE
PEDIDO MANUAL/RETIDO → NOVO → PRODUÇÃO (Separação)

CANCELADO é estado terminal com motivo, autor e horário. Rascunhos ficam na conversa/pendências, fora do quadro principal.

| Transição | Efeito no Admin | Efeito externo |
|---|---|---|
| Criar/editar rascunho | Validar itens, origem, recalcular total | Nenhum Bling |
| Confirmar pedido WhatsApp → PRODUÇÃO / Separação | Só aceitar revisão completa e atual; transação congela snapshot, grava aceite e reserva estoque | Sem envio ao Bling nessa etapa |
| Preço/estoque/dado obrigatório mudou antes de aceitar | Não cria pedido; mantém rascunho, invalida botão e envia correção/novo resumo para aceite | Nenhum envio ao Bling |
| Pedido criado manualmente/retido → NOVO | Guardar origem, responsável e motivo; ainda não liberado para separação | Sem envio ao Bling |
| NOVO → PRODUÇÃO / Separação | A equipe resolve pendência operacional e libera a separação; registrar ator/motivo | Sem emissão automática |
| PRODUÇÃO → EXPEDIÇÃO | Gravar transição e outbox única | Criar/localizar contato e pedido de venda Bling; NF segue política fiscal aprovada |
| EXPEDIÇÃO → ENTREGUE | Guardar confirmação e ator | Atualizar Bling se o mapeamento da conta estiver validado |
| Cancelar | Exigir motivo e auditar | Tratar cancelamento externo conforme fase e política contábil |

“Separação” é a primeira atividade dentro do estado PRODUÇÃO, visível como subtítulo/fila. A confirmação válida do cliente cria o pedido e inicia essa etapa. NOVO fica para pedido manual ou retenção operacional explícita antes da separação; não deve mascarar dado de checkout ausente nem aceite inválido. Não permitir pular estados sem permissão e justificativa. Usar transação/controle de concorrência para duas pessoas não sobrescreverem a mesma mudança.

Manter status auxiliares separados: bling_order_status, invoice_status, payment_status, message_status, integration_status. Exemplos de linguagem do painel: “Aguardando envio”, “Enviado ao Bling”, “Precisa revisar”, “NF-e autorizada”, “Rejeitada”. Estar em EXPEDIÇÃO não prova autorização fiscal.

## 8. Contratos internos e idempotência

Entidades conceituais (nomes finais devem respeitar o schema atual confirmado do Supabase):

- customers(full_name opcional, dados confirmados e consentimentos); customer_contacts(phone/email opcionais com origem/verificação)
- customer_whatsapp_identities(customer_id, provider, business_scope, sender_id, sender_id_type, first_seen_at, last_seen_at)
- whatsapp_lines(phone_number_id único, waba_id, display_number, active)
- conversations(identity_id, line_id, customer_id opcional, status, assigned_to, automation_mode), única por identidade de remetente + linha
- messages(provider_message_id UNIQUE, conversation_id, direction, type, payload_redacted, sent_at, status)
- order_drafts(conversation_id, customer_id opcional, source=flow_basket|meta_catalog, source_message_id, status, basket_version, payment_method_snapshot, delivery_address_snapshot); vários rascunhos podem coexistir e não há expiração automática comercial
- flow_sessions(flow_token_hash UNIQUE, draft_id, flow_version, line_id, issued_at, consumed_at, revoked_at); sem `expires_at` comercial; ao retomar, emitir token novo e revogar o anterior
- catalog_batches(provider_message_id UNIQUE, draft_id, catalog_id, context_wamid, received_at, payload_snapshot)
- catalog_batch_items(batch_id, product_id, quantity, observed_price, canonical_price)
- orders(order_number UNIQUE, source, customer_id, conversation_id, line_id, operational_status, payment_method_snapshot, delivery_address_snapshot, confirmed_at, total_snapshot, payment_status, fiscal_status, ...)
- order_items(order_id, product_id obrigatório, description_snapshot, sku_snapshot, quantity, unit_price_snapshot, line_total); cada produto físico escolhido na cesta vira linha do pedido. Não criar uma linha virtual da cesta que duplique estoque/total. Se o Bling exigir preço por linha, refletir regra de alocação do ajuste interno conforme aprovação contábil.
- order_status_history(order_id, from_status, to_status, actor_id, reason, created_at)
- integração outbox = `app_private.outbox_jobs` existente, adaptada com chave única, referência de conta, claim lease, backoff, estado de reconciliação e erro seguro; não duplicar tabela
- integração inbox = `app_private.webhook_inbox` existente, adaptada com escopo de conta, tipo/timestamp e `dedupe_key` canônica; não assumir que WAMID sozinho identifica status distintos

### Operação atômica

Função transacional do servidor para aplicar lote de catálogo: verificar evento não processado; conferir que rascunho pertence à conversa e está aberto; validar mapeamento/produto; inserir lote; recompor linhas e total; auditar; devolver resumo. Confirmação também congela itens/preços e grava evento na outbox na mesma transação. Chamadas de rede ficam fora da transação.

Webhooks podem ser entregues mais de uma vez. Validar assinatura, normalizar cada mensagem/status, persistir o evento e sua `dedupe_key`, responder rápido e processar com retry seguro. Uma mesma mensagem Meta pode produzir status distintos (sent, delivered, read); diferenciar cada avanço por estado/timestamp. Não usar trigger SQL para chamar Meta/Bling.

## 9. Precificação do combo e do extra interno

**Regra de preço definida para cesta configurável:** cada alternativa permitida tem um valor comercial por unidade dentro da versão da cesta. A cesta não pré-seleciona produto nem quantidade; cada tela apresenta o slot e a cliente escolhe alternativa e quantidade. Quantidade 0 retira aquele slot; quantidades positivas usam o preço da alternativa na versão. O preço avulso do produto não altera uma cesta publicada. O total é calculado novamente no servidor a cada etapa e usa o adicional interno uma única vez.

Fórmula operacional em centavos:

**subtotal da cesta = extra interno da cesta + soma de (quantidade escolhida × valor comercial da alternativa escolhida no slot)**

**total do pedido de cesta = subtotal da cesta + entrega informada − desconto autorizado**

**total do pedido do Catálogo = soma de (preço atual de cada avulso × quantidade) + entrega informada − desconto autorizado**

- O extra interno é parâmetro de formação do preço e aparece uma única vez dentro do total da cesta; não é apresentado como linha misteriosa ou cobrança separada. O cliente sempre vê o total final antes do aceite.
- Valor comercial do componente na cesta não é o custo de compra nem precisa coincidir com o preço avulso do catálogo. O Admin mantém campos separados para preço de venda, custo interno e valor comercial da cesta.
- Cada alternativa mostra o nome e o valor aplicável; o Flow recalcula o total a cada avanço. Exemplo visual: “Arroz Tio Alvino — R$ 22,90 por unidade na cesta”. Quando o total muda, o Flow mostra o novo total em atualização dinâmica.
- Quantidade aceita em todo slot: inteiros 0, 1, 2, 3, 4, 5 e 6. 0 significa Retirar. Quantidade acima de 0 exige uma alternativa. A validação de conclusão exige pelo menos um slot positivo; o cliente não consegue confirmar uma cesta vazia.
- O servidor recalcula tudo em centavos usando preço/regra ativa e snapshot de versão; não aceita total, preço ou delta enviados como autoridade pelo Flow.
- Cada carrinho Meta tem pedido próprio com preços de venda vigentes do Admin, comparados aos preços observados no evento. Divergência exige novo resumo e aceite; avulsos nunca são somados ao pedido de cesta.
- Qualquer taxa de entrega/desconto externo deve ser informada antes do aceite; custo, margem, fornecedor, extra interno e fórmula não aparecem para ANA/cliente.
- Alteração depois do orçamento gera nova revisão e invalida confirmação anterior. Pedido confirmado guarda preço, componente, quantidade, alternativa e regra usados.

## 10. Bling: sincronização e faturamento

API v3 aceita pedido de venda com várias linhas. Criar uma venda Bling por pedido Admin confirmado: uma venda para a cesta e uma venda distinta para cada carrinho do Catálogo. Nunca misturar cesta e carrinho na mesma venda externa. A emissão fiscal é independente por pedido, seguindo a política aprovada pelo contador.

Base atual: https://api.bling.com.br/Api/v3. OAuth Authorization Code é concluído no servidor, com state contra CSRF; Client Secret e refresh token ficam fora do frontend. A autenticação por token opaco foi descontinuada: solicitar JWT com o cabeçalho enable-jwt: 1 no POST de autorização/renovação e mantê-lo em todas as chamadas autenticadas. Guardar expires_in retornado para renovar access token. O authorization code tem janela de um minuto e o refresh token documentado dura 30 dias. Confirmar a versão e os escopos do aplicativo conectado antes de programar.

O limite publicado é compartilhado pela conta: até 3 requisições/segundo e 120 mil/dia, com outras validações de IP. A implementação deve centralizar chamadas Bling num limitador por conta, serializar refresh OAuth e iniciar com teto conservador de 2 requisições/segundo; respeitar `Retry-After` em 429 e manter métricas de uso. A documentação também exige app de visibilidade pública e processo de homologação, com etapa de testes de 30 dias. Iniciar a confirmação desse processo em paralelo à construção local; isso não bloqueia telas nem mocks, mas pode determinar quando a integração autenticada poderá ser homologada.

### Mapeamentos necessários

- Produto interno ↔ SKU estável ↔ product_retailer_id Meta ↔ ID produto Bling.
- Cliente Admin ↔ contato Bling; persistir ID após localizar/criar, sem duplicar por pequenas variações de nome.
- Pedido Admin ↔ referência externa/numeroLoja e ID de venda Bling. Não assumir que numeroLoja sozinho ofereça idempotência até provar.
- Componentes da cesta ↔ linhas fiscais ou kit conforme contador. Se valor comercial difere da soma dos itens fiscais, aprovar distribuição de preço, desconto ou outras despesas e impactos tributários.
- Endereço, frete, pagamento e natureza de operação só entram com valores validados.

### Sequência de integração

1. PRODUÇÃO → EXPEDIÇÃO cria evento dispatch_requested único para o pedido.
2. Worker consulta/reconcilia operação anterior antes de repetir chamada sem resposta.
3. Localiza/cria contato e envia uma venda com todos os itens do snapshot confirmado.
4. Persiste ID externo e resultado seguro; retry respeita limite de API e usa espera crescente.
5. Criar NF-e, enviar à SEFAZ e confirmar situação são operações separadas. Marcar autorizada só após retorno inequívoco.
6. Validar assinatura X-Bling-Signature-256, deduplicar eventId; tratar ordem variável e processar assincronamente. Persistir o evento e responder 2xx em até 5 segundos. O Bling tenta novamente por até três dias e pode desabilitar o webhook após falhas; monitorar a ativação do webhook e avisar o operador se cair.
7. Antes de atualizar pedido sincronizado, buscar objeto completo, pois PUT substitui o pedido; preservar campos. Após iniciar NF-e há restrições.
8. Erro Bling deixa pedido em seu estado operacional e pendência recuperável; retry não cria segunda venda.

**Limite operacional:** aplicar orçamento compartilhado por conta (teto inicial recomendado de 2 req/s, abaixo do limite oficial de 3 req/s) para todas as funções, retries, reconciliações e rotinas de suporte. O limite diário documentado é 120 mil requisições; é capacidade, não meta de consumo. Monitorar 429 e validar eventuais bloqueios por IP sem aumentar concorrência automaticamente.

### Divergência fiscal registrada

Instrução atual: ao sair de PRODUÇÃO, vai para EXPEDIÇÃO e inicia envio ao Bling para emitir nota. Decisão histórica dizia aguardar entrega e pagamento. Para não gravar silenciosamente uma política tributária possivelmente incorreta:

- Na EXPEDIÇÃO, sincronizar o pedido de venda e preparar a fila fiscal.
- A geração/envio da NF-e usa invoice_policy explícita. Até validação do contador e teste da conta, manter emissão real desativada; registrar se a política final permite emitir na expedição ou exige condições adicionais.
- Admin distingue “Pedido enviado ao Bling” de “NF-e autorizada”.
- Isso é uma decisão de homologação controlada, e não escolha improvisada por cada operador.

## 11. Telas do Admin com simplicidade

### Atendimento

- Duas filas identificáveis e filtro por número; número de destino/origem visível no chat.
- Lista com busca por nome, identidade/telefone quando disponível, última mensagem, responsável e status.
- Ação primária **Assumir atendimento** pausa ANA naquela conversa; outra ação clara devolve para ANA.
- Contexto lateral: cliente, endereço escolhido, últimos pedidos e rascunho ativo.
- Notas internas distintas; botão de envio deixa claro quando mensagem vai ao cliente.

### Clientes

Busca por nome, identidade WhatsApp e telefone quando disponível; ficha com endereços, conversas e pedidos vinculados com segurança. Criar manualmente para exceções; prevenir duplicatas pelo ID de remetente escopado e tratar telefone como correspondência auxiliar verificada.

### Cestas

Nome, resumo e estado; versão draft/publicada/retirada; slots com nome/ordem, alternativas de produto e preço comercial por unidade na cesta; adicional interno editável apenas por ação autorizada. Prévia espelha uma tela por slot com foto, preço, quantidade 0–6 e Próximo. Salvar rascunho e publicar versão validada. Criar versão nova duplicando a publicada; nunca editar pedido ou sessão antigos.

### Produtos

Nome, SKU, preço, foto, disponibilidade, mapeamentos Meta/Bling e estado de sincronização em linguagem simples. Produto não deve ser oferecido quando preço/ID estiver inconsistente.

### Pedidos

Quadro com quatro estados operacionais. Detalhe de cada pedido mostra cliente, origem única (Flow/cesta ou Catálogo), itens, pagamento, entrega, total, aceite e histórico. Ao ir para EXPEDIÇÃO, informar envio da venda correspondente ao Bling e situação fiscal. Mostrar “Ver motivo” e retry autorizado.

### ANA

Três blocos simples: **O que a IA deve saber**, **Como deve atender**, **Regras importantes**. Publicação explícita, suspensão por conversa e por número, simulador que não altera pedido real.

## 12. Homologação obrigatória antes do lançamento

| Cenário | Resultado esperado |
|---|---|
| A mesma identidade comprovada escreve nos dois números | Conversas independentes por canal; cliente compartilhado somente pelo vínculo confirmado |
| Webhook Meta repetido | Uma mensagem e um único efeito comercial |
| Flow válido | Escolhas associadas ao rascunho correto e total recalculado |
| Token Flow expirado ou de outro número | Pedido não muda; cliente reinicia ou chama atendente |
| Quantidade adulterada acima do limite | Rejeitada com orientação; cálculo não usa valor adulterado |
| Flow terminou, cliente não aceitou resumo | Continua rascunho; não entra como NOVO |
| Carrinho após Flow, antes ou depois de confirmar | Abre rascunho separado; jamais entra na cesta |
| Carrinho chega enquanto o Flow está aberto | Dois rascunhos independentes; a resposta de um não altera o outro |
| Novo carrinho depois de pedido confirmado | Segundo pedido, resumo, aceite e documento fiscal independentes |
| Produto referido, sem carrinho order | Interesse registrado; item não vira compra |
| Carrinho sem context.id | Criar rascunho próprio pela identidade/linha do evento; não procurar cesta |
| Retry do mesmo carrinho com mesmo ID de mensagem | Uma mensagem processada uma vez |
| Novo carrinho com ID de mensagem diferente | Novo rascunho e venda separada, mesmo com itens iguais |
| Botão de confirmação clicado duas vezes/reenvio de webhook | Um único pedido; segunda ação retorna o pedido já criado |
| Cliente altera itens após receber a revisão | Revisão antiga invalidada; novo total e novo aceite exigidos |
| Produto, preço, estoque, endereço ou taxa mudou enquanto o rascunho estava salvo | Recalcular e enviar nova revisão antes do aceite; não há expiração automática por tempo |
| Preço mudou desde o catálogo | Novo total e novo aceite |
| Carrinho após pedido confirmado | Não altera pedido silenciosamente |
| Dois operadores editam ao mesmo tempo | Uma transição vence; outra recebe estado atualizado |
| EXPEDIÇÃO acionada duas vezes | Uma tarefa outbox e uma venda Bling |
| Timeout ao criar venda | Reconcilia no Bling antes de repetir |
| Bling rejeita venda/NF-e | Pedido continua visível, com erro acionável |
| NF criada, ainda sem autorização | Não aparece como autorizada |
| Humano assumiu conversa | ANA não responde em paralelo |
| Cliente pede para parar | Opt-out gravado; interromper proatividade aplicável |

## 13. Decisões profissionais para acelerar a implementação

| Decisão | Padrão recomendado |
|---|---|
| Cadastro nos dois números | Identidade do remetente + número do canal; cadastro de cliente unificado somente por vínculo comprovado |
| Compra em construção | Um rascunho por intenção de compra; sem expiração automática |
| Flow + catálogo | Sempre pedidos separados; não unir mesmo com evento/contexto correlacionável |
| Carrinho repetido | Cada ID de mensagem distinto abre um novo rascunho; retry com mesmo ID é deduplicado |
| Confirmação | Um aceite explícito por resumo/pedido |
| Preço | Combo com preço-base próprio; avulsos por preço vigente; snapshot imutável |
| Margem/extra interno | Incorporar uma vez; não revelar custo nem cobrar taxa surpresa |
| Disponibilidade | Conferir ao preparar e antes de aceitar |
| Pedido Bling | Uma venda por pedido Admin; cesta e carrinho Meta nunca se misturam |
| Gatilho Bling | Expedição inicia sincronização da venda; NF separada com política aprovada |
| Falhas | Recuperáveis, sem duplicar pedido |
| Histórico | Requisitos e metadados não secretos; descartar código antigo |

## 14. Supabase de destino: projeto, estrutura e estado confirmado

O projeto selecionado pela imagem e confirmado por leitura da conta Supabase é **Dona Antônia - NOVO**.

| Propriedade | Estado observado em 26/10/2026 |
|---|---|
| Project ref | wvpzudjujtmyspluwhvx |
| URL da API | https://wvpzudjujtmyspluwhvx.supabase.co |
| Região / plano | São Paulo (sa-east-1) / Pro |
| Estado / banco | ACTIVE_HEALTHY / PostgreSQL 17.11 |
| Migrações | Duas: `initial_dona_antonia_clean_schema`, `stage_legacy_product_images_for_safe_copy` |
| Edge Functions | Nenhuma |
| Tabelas | 14 `public` + 5 `app_private` = 19; todas com RLS habilitado |
| Dados de negócio | 1.928 produtos, 574 clientes, 578 contatos e 336 endereços; nenhum registro pessoal foi aberto |
| Produtos/fotos | Todos os produtos estão inativos/`needs_review`; 0 `product_images`, 0 buckets e 1.798 imports de foto pendentes |
| Atendimento/pedidos/equipe | 0 pedidos, cestas e perfis staff; Auth tem 0 usuários |
| Policies/grants | Duas policies de SELECT apenas para catálogo aprovado; API roles sem GRANT nas tabelas. RLS dos demais objetos é fail-closed |
| Integrações | 2 Meta + 1 Bling; todas desligadas, escrita externa desligada e `secret_reference` nula |

**Complemento de prontidão verificado em 26/10/2026:** o schema interno `app_private` contém `integration_accounts`, `webhook_inbox`, `outbox_jobs`, `migration_xref` e `image_import_queue`. As três entradas de `integration_accounts` são metadados seguros: duas Meta e uma Bling; nenhuma tem `secret_reference`, todas estão `enabled=false` e `external_writes_enabled=false`. Os dois metadados Meta apontam para WABAs diferentes e não têm `catalog_id` nem `flow_id` registrados. Não foram lidos valores de token/chave. A integração Bling também não tem referência de segredo. `webhook_inbox`, `outbox_jobs` e `migration_xref` estão vazias; `migration_xref` identifica o projeto antigo `ssbesxgaijknwsjbsbcz` como origem de migração, não como destino. A fila separada de mídia contém 1.798 entradas `pending`.

IDs Meta guardados em `safe_config` (identificadores, não credenciais; ainda precisam ser comparados com o WhatsApp Manager): `phone_number_id=1218939807961094` está na WABA `840102181903253`; `phone_number_id=945659128620084` está na WABA `1497253794754816`. Esse desenho em duas WABAs é a base operacional a validar; não consolidar os ativos por conveniência técnica.

Os nomes de segredos registrados no `safe_config` são **referências, não valores**. Para Meta, os nomes obrigatórios por configuração listados são `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_APP_SECRET` e `META_WHATSAPP_VERIFY_TOKEN`; presença consta como `unverified_without_secrets_management_access`, e o estado é `credentials_pending`. Há nomes candidatos ao Vault (`dona_antonia_meta_app_secret_v1`, `dona_antonia_marketing_meta_app_secret_v1`, `dona_antonia_whatsapp_flow_health_verify_token_v1`, `dona_antonia_whatsapp_flow_private_key_v1`) e nomes opcionais/legados (`META_APP_ID`, `WHATSAPP_APP_ID`, `META_OUTBOX_ENCRYPTION_KEY`, `META_OUTBOX_DISPATCH_SECRET`). Não assumir que esses candidatos existem ou que um token atende as duas WABAs.

Para Bling, os nomes requeridos/candidatos são `bling_api_client_id_v1`, `bling_api_client_secret_v1` e `bling_api_refresh_token_v1`; o estado anotado é `credentials_pending`, sem referência de segredo, e a coordenação de renovação OAuth está marcada como necessária para evitar concorrência. O conector disponível não permite consultar o cofre nem ler os valores; validar somente nome/presença e fazer health check autenticado no ambiente autorizado.

Uma consulta somente leitura aos **nomes** em `vault.secrets` não encontrou nenhuma entrada (nem de Meta nem de Bling); nenhum valor descriptografado foi consultado. Isso confirma que a migração ainda não preencheu o Vault do projeto novo. A presença de Edge Function Secrets continua sem verificação pelo conector; o `safe_config` das duas linhas Meta marca-a explicitamente como não verificada.

Extensões disponíveis no projeto incluem `pg_cron` e `pg_net`, ainda não instaladas; o Vault (`supabase_vault`) já está instalado. Decisão de execução: Cron/pg_net chama o worker uma vez por minuto; somente `app_private.outbox_jobs` é fila durável, e a chamada HTTP é um sinal recuperável sem payload de cliente. O endpoint valida um segredo dedicado de despacho guardado no Vault e nos Edge Function Secrets; não enviar `service_role` pelo Cron nem colocá-lo no histórico SQL. As páginas oficiais classificam Cron como Beta e pg_net como Beta; documentar saúde, manter a outbox durável e permitir recuperação manual se o scheduler parar.

O advisor de segurança apontou RLS habilitado sem policies em 12 tabelas `public` e nas 5 tabelas `app_private` (17 findings `INFO`); isso mantém a negação por padrão, mas impede o painel autenticado de operar até uma migração criar policies e GRANTs mínimos. `products` e `product_images` têm policies de leitura para o catálogo aprovado. O advisor de performance reportou 14 índices sem uso: o projeto ainda não tem workload do Admin, portanto não remover índices sem medir a carga real. Também registrou uma configuração informativa de conexões Auth (limite absoluto de 10).

Checagem somente leitura de privilégios confirma que `anon` e `authenticated` atualmente não têm SELECT/INSERT/UPDATE nas tabelas `public` consultadas; só `service_role` tem esses privilégios. Em `app_private`, apenas `service_role` tem USAGE e os acessos consultados. Portanto, policy de leitura existente em catálogo não equivale a endpoint acessível. A primeira migração do Admin deve conceder somente os privilégios necessários às tabelas expostas e acompanhar cada GRANT com policy correta; schemas internos continuam fora do Data API.

O GitHub confirmou que a `main` do repositório público `osvaldosereia/SUCEDOAN12` está vazia no commit `e324e3c095f90be6cbda8dcdd3a89b3cecab7463` (“Remove todos os arquivos”), e sem proteção de branch. A implementação greenfield começou na branch `codex/whatsapp-admin-greenfield-20261026`; não incorpora código histórico. PR draft #1422 existe em outra branch e foi deixada intocada.

Não é o projeto “Dona Antônia” antigo, nem “Dona Antônia V2”, nem “AME MAIS”. A URL e o ref acima são identificadores do projeto, não chaves secretas. O estado saudável é o observado pela conexão Supabase, não uma inferência do texto “Verificando...” que aparecia na captura.

### Aderência por tabela existente

| Tabela existente | Uso previsto | Mudança aditiva necessária |
|---|---|---|
| products | Cadastro interno de SKU, venda, custo, estoque, vínculo Bling e publicação | Reutilizar; custos permanecem exclusivamente internos. Tratar cada produto/variação vendável com preço e disponibilidade próprios. |
| product_images | Fotos originais e verificadas | Reutilizar `storage_path`; acrescentar `flow_thumbnail_path` pré-gerado e exigir `alt_text` + miniatura quando verificada para Flow. |
| product_identifiers | GTIN, SKU, código fornecedor/embalagem | Reutilizar para resolução de IDs externos, sem pressupor que SKU, retailer ID e ID Bling sejam iguais. |
| basket_templates | Nome/código do modelo antigo | Reutilizar como identidade do modelo; `price_cents` fixo é legado e não forma o total das novas cestas. |
| basket_items | Composição fixa antiga | Preservar no preflight, sem usar como slot novo. Criar `basket_template_versions`, `basket_components` e `basket_component_options` com preço comercial por alternativa e versão imutável. Converter dados antigos somente após inspecionar e confirmar as linhas atuais. |
| customers | Cadastro que pode começar incompleto | Reutilizar; permitir nome nulo no lead inicial, removendo NOT NULL com migração revisada. A restrição de nome não vazio deve continuar para valores preenchidos. |
| customer_contacts | E-mail e telefone verificado/compartilhado | Reutilizar para contato, nunca armazenar BSUID/wa_id como telefone. |
| customer_addresses | Endereços reutilizáveis e escolhidos por pedido | Reutilizar; o endereço escolhido deve ser copiado para snapshot do pedido para não mudar vendas antigas. |
| staff_profiles | Estrutura de papéis owner, admin, catalog_manager e fulfillment, ainda sem usuários | Reutilizar os quatro papéis no MVP; owner/admin cobrem atendimento, catalog_manager gerencia catálogo/cestas e fulfillment opera pedidos/expedição. Atender com `admin`; deixar novo papel support para decisão posterior baseada na operação real. |
| orders | Pedido canônico e valores | Reutilizar; atualizar estados e fórmula financeira após preflight de linhas/constraints. |
| order_items | Snapshot de linhas e valores; hoje product_id é obrigatório | Manter `product_id` obrigatório: cada produto físico escolhido no Flow/Catálogo é uma linha com descrição/SKU/quantidade/preço snapshot. Não criar uma linha virtual de cesta que duplique total/estoque; guardar versão da cesta e componentes no snapshot do pedido. |
| inventory_reservations | Reserva de produto/quantidade | Reutilizar para quantidades reais dos componentes; não reservar enquanto o rascunho está aberto sem limite de tempo; reservar atomicamente no aceite válido que entra em PRODUÇÃO e liberar ao cancelar antes da separação física. |
| external_entity_links | Mapeamento local ↔ Meta/Bling | Reutilizar; acrescentar account_scope se a chave externa puder colidir entre contas/linhas. |
| audit_events | Trilha administrativa | Reutilizar; nunca guardar token, endereço completo em log de erro ou payload pessoal sem necessidade. |

### Constraints e migrações que precisam ser planejadas

- customers exige full_name hoje; alterar para opcional e mostrar “Contato WhatsApp” até confirmar o nome.
- customer_contacts.kind aceita apenas phone/email. A migration local criou `customer_whatsapp_identities` com portfólio empresarial, sender ID e tipo, WABA/phone_number_id de origem, vínculo opcional/provado com customer, timestamps e método de vínculo; não mistura ID de plataforma com telefone.
- orders está vazia e limita status a draft, placed, confirmed, preparing, delivered e cancelled. Revalidar contagem antes da migração; rascunho comercial fica em `order_drafts`, e `orders.status` passa a `new`, `production`, `shipping`, `delivered` ou `cancelled`. A UI traduz para NOVO, PRODUÇÃO, EXPEDIÇÃO, ENTREGUE e ação CANCELAR com motivo. Pagamento e estado fiscal ficam em colunas independentes.
- A checagem atual exige total_cents = subtotal_cents + delivery_cents. Formalizar total = subtotal - desconto + entrega + outras cobranças explicitamente informadas; adicionar campos/constraints de desconto somente se o fluxo comercial usar desconto. A margem/extra interno é incorporado uma vez no preço da cesta, sem campo público separado.
- order_items.product_id é obrigatório; preservar isso e criar uma linha por produto físico selecionado, com valor comercial alocado da cesta e snapshot. O ajuste interno da cesta não vira linha/fee visível; eventual alocação entre itens para o Bling depende de aprovação contábil antes da emissão real.
- Todas as tabelas têm RLS, mas existem somente duas políticas SELECT públicas do catálogo aprovado. Criar policies por papel e grants explícitos para painel e funções; authenticated por si só não libera operação administrativa. Não adicionar política genérica de escrita.
- O projeto não tem funções públicas nem Edge Functions. Criá-las só depois de definir contratos, autenticação, idempotência, logs sem segredos e privilégios; chamadas externas não devem rodar em trigger SQL.
- O changelog Supabase consultado em 26/10/2026 registra mudanças recentes em Postgres 17.11 e exposição de tabelas. Antes de implementar, revisar changelog e documentação atuais de RLS, Data API e grants; não confiar em exposição automática de tabela nova.

### Ordem de migração para a programação

1. Capturar novamente o schema e dados atuais, obter baseline local seguro sem sobrescrever as 1.928 linhas de produtos/574 clientes, revisar grants/policies e configurar Auth de funcionários e matriz de papéis.
2. [x] Adaptar customers para leads sem nome e adicionar identidade WhatsApp com proveniência e escopo de portfólio/canal (migration local `20261027013421_customers_and_whatsapp_identities`).
3. [x] Criar no local a base de catálogo/cestas versionadas com alternativas, preço comercial por opção, adicional privado, fotos e policies por papel. **Pendente:** telas de edição/upload, cotação server-side e homologação Flow por WABA; não publicar comercialmente enquanto esses itens não passarem.
4. Criar conversas, mensagens e inbox de eventos Meta com deduplicação antes de ativar webhook.
5. Criar order_drafts, sessão Flow sem TTL comercial, catalog_batches e vínculo explícito de mensagens outbound ↔ respostas.
6. Completar orders/order_items, snapshots da cesta/endereço/preço, estados operacionais, estados de pagamento/fiscal, histórico e reservas; adaptar `app_private.outbox_jobs`, sem criar uma segunda outbox.
7. Criar segredos de servidor, integrações e observabilidade; não editar schema de produção manualmente fora de migrações revisadas.

Pré-condição de cada migração: confirmar project ref, ambiente, backup, estado/contagem das tabelas e rollback; aplicar uma migração por vez e validar constraint/RLS antes de seguir.

### 14.1 Implicações da inspeção detalhada das colunas

A leitura verbose do schema em 26/10/2026 confirmou que a tabela de produtos e cadastros de clientes já têm dados; os pedidos, cestas e perfis de staff estão vazios. Também encontrou restrições que não correspondem ao produto pedido. As próximas migrações devem adaptar o DDL existente sem apagar as migrações iniciais nem criar cadastros duplicados.

| Estrutura existente | Divergência com o produto | Decisão de migração |
|---|---|---|
| `customers.full_name` era obrigatório no destino | Um contato WhatsApp pode chegar sem nome/telefone confirmado | A migration local permite nome nulo; exibir “Contato WhatsApp”; só exigir nome quando o pedido/logística precisar dele. Nenhum valor remoto foi alterado. |
| `staff_profiles.role` aceita `owner`, `admin`, `catalog_manager`, `fulfillment`; ainda não há perfis | O rascunho anterior previa papéis `operator`/atendimento separados e exigiria alterar constraint | **MVP preserva os quatro papéis existentes.** `owner`/`admin` cobrem atendimento; `catalog_manager` cuida do catálogo/cestas; `fulfillment` cuida da separação/expedição. Só adicionar um papel `support` se a operação real provar necessidade; sem cadastro público, funcionário desabilitado perde acesso imediatamente. |
| `products.cost_cents` está na mesma tabela de dados operacionais | RLS não oculta uma coluna de uma linha que o papel pode ler; GRANT amplo revelaria custo | Migration local já copiou custo para `app_private.product_financials` antes de remover a coluna pública. O ajuste interno da cesta também fica privado; RPCs locais verificam papel ativo e falham fechado. Quote/Flow/ANA recebem total e alternativas comerciais, nunca custo ou margem. |
| `product_images` tem `storage_path`, `alt_text` opcional, `position` e `verified`, mas não variante otimizada para Flow | O produto precisa de foto legível dentro de cada alternativa do Flow e precisa de texto alternativo | Migration local adiciona `flow_thumbnail_path` e `NOT VALID` exige miniatura + `alt_text` quando a imagem for verificada. A tela de upload ainda deve gerar a miniatura automaticamente; sem miniatura aprovada o produto não publica na cesta. |
| `product_identifiers.kind` não contempla identificador de Catálogo Meta; `external_entity_links` não tem escopo de conta/catálogo | O mesmo produto pode ter retailer ID diferente em cada catálogo/WABA | Criar `meta_catalog_listings` com `waba_id`, `catalog_id`, `product_retailer_id`, produto interno, status de sincronização e restrição única por catálogo. Não reutilizar SKU/GTIN como retailer ID por suposição. |
| `basket_templates` e `basket_items` representam só uma composição fixa | Não representam slots, alternativas por slot, quantidade removível, versões publicadas e preço variável | Modelo local já cria versão imutável, slots e alternativas com preço comercial por unidade na versão. `basket_items` antigo fica preservado até preflight, sem ser usado pelo novo Flow. Sessões futuras referenciam exatamente uma versão. |
| `orders.status` aceita `draft`, `placed`, `confirmed`, `preparing`, `delivered`, `cancelled` | Não corresponde aos quatro estados operacionais exigidos e mistura conceitos antigos | Na migração, separar status operacional (`new`, `production`, `shipping`, `delivered`, `cancelled`), pagamento e fiscal em campos independentes. Converter valores legados por mapeamento explícito se a checagem pré-migração encontrar registros; não remover linhas para acomodar o desenho. |
| `orders` não possui origem, snapshot de endereço nem revisão/aceite | Não prova qual intenção, endereço e revisão o cliente confirmou | Adicionar origem (`basket_flow`, `catalog_cart`, `manual`), vínculo ao rascunho/revisão, snapshot de endereço/pagamento/total, instante/identidade/mensagem de aceite e chaves idempotentes. Cada compra fica isolada. |
| `app_private.webhook_inbox.external_event_id` não tem unicidade nem escopo de conta; status/retry são básicos | Eventos de status podem reutilizar o WAMID da mensagem; chave simples por ID perderia atualizações legítimas | Adicionar `account_ref`, tipo, timestamp e `dedupe_key` canônica. Para inbound, ID da mensagem; para status Meta, ID + estado + timestamp; para Bling, identidade do evento documentada. Uma entrada por evento normalizado, mesmo se o webhook contiver lote. |
| `app_private.outbox_jobs.idempotency_key` não tem constraint única e faltam lease/resultado | Dois workers podem enviar o mesmo efeito; não há estado de resultado ambíguo | Adicionar unicidade da chave, lease de claim, tentativas/erro mascarado, conclusão e `reconciliation_required`. A outbox no Postgres é a fila durável; Cron/pg_net só acorda o worker. |
| `inventory_reservations` tem `held`, `committed`, `released`, sem vínculo de versão de estoque | Rascunho sem limite de tempo não deve bloquear estoque indefinidamente | Não reservar durante Flow/carrinho em rascunho. No aceite, recalcular e reservar atomicamente; agregar quantidade por produto no pedido. Cancelamento/reversão libera conforme estado físico. |

**Segurança de dados financeiros:** `products.cost_cents` não pode ser tratado como protegido apenas porque a interface o esconde. A migração tira o custo da tabela consultável pelo painel padrão. A RPC financeira de leitura revoga `EXECUTE` de `PUBLIC` e `anon`, concede somente `authenticated` e valida dentro do corpo `auth.uid()`, perfil ativo e papel permitido; responde apenas com os campos autorizados. RPCs de confirmação de pedido e claim da outbox são outra classe: revogadas de `PUBLIC`, `anon` e `authenticated`, concedidas exclusivamente a `service_role`. Todas são estreitas, com `search_path` fixo e objetos qualificados. Valor interno não entra em ferramenta da ANA, prompt, Flow, resumo WhatsApp, log ou telemetria.

**Política da outbox:** cada efeito Meta/Bling tem uma chave idempotente única e referência a snapshot imutável; a chamada externa ocorre fora da transação que grava negócio. O worker tenta imediatamente e o Cron recupera jobs vencidos a cada minuto. Estados: `pending` → `processing` → `completed`; falha permanente vai para `failed`, operação desativada vai para `blocked`, timeout após possível aceite externo vai para `reconciliation_required`. Erro HTTP 429 obedece `Retry-After`; 5xx/transiente comprovado tenta até 6 vezes no total com espera crescente de 1 min, 5 min, 15 min, 1 h e 6 h (com jitter). Bling 401 pode renovar OAuth uma vez sob lock e repetir uma vez. Erro 4xx de validação/permissão não repete automaticamente. Timeout após POST externo não ganha retry cego: consultar estado pela referência externa quando suportado, caso contrário pedir revisão humana e registrar redrive auditado. Status ambíguo nunca é mostrado como sucesso.

### 14.2 Fotos dos produtos dentro do Flow — inspeção e regra nova

**Inspeção somente leitura mais recente em 26/10/2026:** `public.products` tem 1.928 linhas, todas `active=false`/`needs_review`; `public.product_images` tem 0 linhas; nenhum bucket existe; 1.798 imagens esperam em `app_private.image_import_queue` no estado `pending`. A contagem anterior zero foi somente um retrato intermediário anterior à carga. O proprietário confirmou que fotos serão incluídas. Atualmente nenhuma alternativa está elegível para o Flow; após a carga, revisar cada opção e bloquear apenas os produtos sem foto verificada/miniatura aprovada. `product_images` tem campos de caminho, ordem, texto alternativo e verificação, mas a miniatura de Flow ainda será adicionada por migração.

O Flow histórico consultado no GitHub mostrava uma foto compacta da cesta no topo e explicitava que não mostrava fotos individuais de cada um dos seus até 27 componentes. Esse desenho histórico não atende à regra atual do proprietário e não será copiado como requisito.

**Regra de produto agora definida:** toda alternativa que o cliente puder escolher dentro de qualquer tela do Flow precisa exibir a foto daquele produto junto do nome/variante e do valor comercial da cesta. Não basta a imagem geral da cesta. Nenhum slot pode ser publicado com uma alternativa sem foto aprovada; o cadastro do produto pode ficar como rascunho, mas não pode ser elegível para um Flow até a foto estar pronta.

**Implementação decidida para não depender de busca de imagem em tempo real:** o upload administrativo aceita a foto original, pré-processa no navegador com `createImageBitmap`/Canvas e gera automaticamente uma miniatura Flow quadrada JPEG/PNG, 320 × 320 px, alvo máximo de 25 KB. Guardar o caminho da miniatura em `product_images.flow_thumbnail_path`; a imagem original continua no `storage_path`. Reordenar imagens no Admin escolhe a principal: a primeira imagem verificada, com menor `position`. Preencher `alt_text` automaticamente com nome, marca e variante do produto, editável pelo operador. Criar um bucket separado `product-media`: leitura pública apenas porque essas fotos são itens de catálogo; escrita restrita a funcionários autenticados e autorizados. Não guardar mídia de conversa nesse bucket.

Na opção de seleção do Flow, entregar `image` e `alt-text` associados à opção do produto por meio do `data-source` dinâmico, codificados a partir da miniatura aprovada. Não usar URL externa como imagem de componente. Antes de implementar/publicar todas as telas, fazer prova técnica com duas alternativas fotografadas, um controle de quantidade e o botão Próximo; validar Flow JSON/API, tamanho do payload, leitura visual e texto alternativo em cada WABA e em aparelhos Android/iOS. O Flow não publica se a prova não passar; a versão/limites válidos são os que a Meta aceita na conta atual.

**Migração segura:** antes de aplicar qualquer DDL, repetir leitura de contagem e constraints; tirar snapshot/backup; executar migrações em local e branch isolada; validar constraints e policies; fazer deploy por migração revisada; comparar schema pós-deploy e manter rollback compatível. A produção não será usada para teste de escrita ou de integração durante a preparação.

## 15. Pesquisa de usabilidade: Loja Integrada e referência histórica Vitrine Admin

Foram consultadas páginas atuais da Ajuda Loja Integrada e o documento histórico interno REFERENCIA_ADMIN_UX.md, que comparava Nuvemshop Nimbus, Shopify e Loja Integrada. A Loja Integrada confirma práticas concretas: a lista de pedidos destaca número, situação, data, cliente, pagamento, envio e total; busca por número/nome; filtros avançados combináveis; detalhe reúne cliente, itens, observação e histórico; cadastro de cliente leva ao histórico de pedidos; produtos filtram por estado, variação, destaque, categoria e marca; relatórios ficam agrupados em clientes, financeiro, pedidos e produtos.

### Decisões de tela para esta operação

- Uma navegação lateral compactável e permanente no desktop; no celular vira drawer. Mostrar somente as oito áreas: Visão geral, Atendimento, Pedidos, Cestas, Produtos, Clientes, ANA e Configurações.
- Cabeçalho da página contém seção, título, uma frase curta de propósito e uma ação principal. Não encher a tela de botões de igual destaque.
- Toda listagem oferece busca visível, filtros rápidos e filtros avançados recolhidos, contagem de resultados, ordenação e paginação no servidor. Preservar filtros ao abrir um registro e voltar; isso melhora o comportamento documentado da Loja Integrada, que reseta filtros ao sair.
- Pedidos mostram número, cliente/identidade, etapa, total, data, número de origem e situação de Bling/NF-e como indicadores; busca por número, nome, telefone quando disponível, item/SKU e data.
- Detalhe do pedido tem resumo financeiro da origem única, componentes da cesta ou itens do Catálogo, pagamento, entrega/endereço, cliente, timeline de estado, venda Bling/NF próprios e notas internas; se uma nota for enviada ao cliente, a ação deve dizer isso explicitamente.
- Produtos e cestas usam formulários por grupos curtos, com estado ativo/publicado, SKU/ID externo, preço e compatibilidade de catálogo/Flow destacados. Mudança de preço pede confirmação e registra auditoria.
- Ficha do cliente deixa claro o que foi informado, inferido pela plataforma e verificado; mostra Resumo, Conversas, Pedidos e Endereços.
- Inbox usa três áreas previsíveis: lista/fila, conversa e contexto do cliente/rascunho. Mostrar linha comercial e atendente no topo; nota interna tem aparência e botão de salvar diferentes de mensagem enviada.
- Estado nunca depende apenas de cor; combinar rótulo, cor e ícone simples. Formulários devem ter validação junto ao campo e ajuda curta em português cotidiano.
- Global search Ctrl/Cmd+K e deep links apareceram no legado e podem ser úteis, mas ficam depois do fluxo central e só entram se não complicarem a navegação inicial.
- “Em breve” só aparece quando explicar uma decisão real; nenhuma tela falsa, botão sem ação ou módulo promocional precisa existir no MVP.

Usar a didática de listas, filtros e detalhes da Loja Integrada, não clonar seu layout, nomenclatura proprietária, logo ou cores. O sistema pode ter paleta e componentes próprios com a mesma clareza e previsibilidade.

## 16. Pesquisa de WhatsApp Flows: Meta, Blip, Infobip e Twilio

Flow é recurso da Meta que abre uma experiência estruturada dentro do WhatsApp. Blip, Infobip e Twilio oferecem camadas para desenhar, publicar ou enviar esse recurso; não substituem o protocolo/contratos da Meta. Foram comparados para aprender padrões de construção e operação, não para adicionar um BSP ao projeto.

| Plataforma/documentação | Achado pesquisado | Decisão para este Admin |
|---|---|---|
| Meta Cloud API / Flows API | APIs oficiais criam, listam, publicam, deprecate e enviam Flow; mensagens não chegam a versões não compatíveis do WhatsApp; configuração de chave de endpoint usa phone_number_id | Integração principal direta; executar preview e testes internos nos dois números/versões antes de publicar |
| Blip | Editor JSON com validação de schema, preview, teste dentro do WhatsApp, endpoint dinâmico, ciclo Draft/Published/Deprecated; depois da publicação a documentação orienta criar outra versão; a extensão depende do bot/número WhatsApp | Copiar validação, preview, teste e lifecycle para a experiência simples do Admin. Não mostrar editor JSON comum ao operador nem exigir Builder da Blip |
| Infobip | API de gestão do Flow, preview, deprecation e upload/verificação da chave pública por sender; documentação recomenda registrar a mesma chave pública para cada sender da WABA | Confirmar chave por número na Meta. Como há orientação de fornecedor divergente sobre compartilhamento de chave, configurar/testar cada phone_number_id explicitamente; não supor que uma chave funcione nos dois |
| Twilio | Demonstra envio de Flows e tokens por mensagem, com regras do serviço/provedor e janela de sessão/template | Usar como referência para o contrato de token e estados, sem colocar Twilio entre Cloud API e sistema |

### Decisões finais do projeto

1. Continuar com Meta Cloud API direta porque os dois números já estão oficialmente conectados; não adicionar custo, chave ou indisponibilidade de intermediário no caminho crítico.
2. O operador escolhe “Editar cesta” em um construtor simples por telas/categorias. O servidor gera/valida a versão Flow e apresenta preview. JSON cru fica restrito a configuração técnica.
3. Cada versão tem rascunho, validada, publicada ou descontinuada; não editar conteúdo que a Meta já trate como publicado/imutável. Publicação exige teste com telefone interno e registro da versão.
4. O endpoint dinâmico busca opções atuais e valida a etapa, mas valores finais são recalculados no backend após submissão. Nunca aceitar preço enviado pelo Flow.
5. A chave privada de troca dinâmica fica em segredo de servidor. Registrar status da chave e health check separado para cada phone_number_id; confirmar com endpoint Meta e teste de ida/volta por número.
6. Começar sem middleware Blip/Twilio/Infobip e sem editor no-code amplo. Se futuramente houver necessidade de múltiplos canais, volume ou suporte operacional adicional, reavaliar um BSP com análise de custo/lock-in.
7. Fornecer fallback guiado com listas/botões ou mensagem humana quando Flow não for compatível, estiver indisponível ou falhar; não deixar a conversa bloqueada.

## 17. Identidade do cliente e novas IDs do WhatsApp

O Help Center/FAQ oficial do WhatsApp consultado informa que usernames estão sendo disponibilizados gradualmente e que, se a pessoa iniciar conversa com empresa usando username, o telefone pode permanecer privado até ela optar por compartilhá-lo. A documentação técnica oficial da Meta para BSUIDs atualiza a decisão: o BSUID é atribuído a `user_id`, aparece nos webhooks de mensagem independentemente do uso do username e pode ser usado para enviar mensagem sem conhecer o telefone. Ele é único para a combinação pessoa + portfólio empresarial; deve ser persistido separadamente de `wa_id`/`from`, telefone e nome de perfil.

Modelo recomendável:

- customers é o cadastro comercial humano; nome pode começar nulo e ser confirmado posteriormente.
- customer_whatsapp_identities guarda identificador e tipo (`user_id`/BSUID, `wa_id` ou telefone compartilhado), portfólio de escopo quando aplicável, WABA e phone_number_id como contexto de origem, data de primeira/última atividade e vínculo opcional/confirmado a customer. Unicidade BSUID usa tipo + valor + business portfolio; WABA/phone_number_id não deve entrar como escopo do BSUID.
- conversations usa identidade do remetente + phone_number_id como chave de operação; linhas comerciais diferentes continuam conversas separadas.
- customer_contacts guarda telefone/email que o cliente compartilhou, com formato normalizado, origem, verificação e finalidade; username/BSUID nunca entra em telefone.
- Mensagens e catalog batches conservam o sender ID original e wamid para resposta/correlação, mesmo que o contato comercial seja editado depois.
- A documentação Meta define a identidade BSUID no nível do portfólio empresarial. Verificar se os dois WABAs estão no mesmo portfólio antes de unificar fichas; se forem portfólios diferentes, manter identidades separadas salvo BSUID principal compartilhado documentado pela Meta, telefone compartilhado/verificado ou vinculação explícita pelo cliente/atendente. Não unir por nome, foto ou telefone presumido.
- O pedido pode ter customer_id opcional até cadastro confiável; para entrega ou contato Bling, pedir informação faltante no momento em que se torna necessária.

A implementação da identidade foi comparada à apresentação técnica oficial da [Meta sobre usernames e BSUID](https://developers.meta.com/resources/videos/whatsapp-usernames/), publicada em 16/06/2026: telefone não é identidade obrigatória, BSUID é escopado ao portfólio e a exposição do telefone depende das regras de visibilidade. O esquema mantém `sender_id` opaco e exige `business_portfolio_id` na chave de unicidade; o payload e a capacidade de enviar por BSUID ainda precisam ser homologados por WABA.

**Definido pela documentação oficial Meta:** a partir de abril de 2026 há o campo `user_id` para BSUID; é necessário aceitar identificadores que não são telefone; a identidade padrão é única por usuário e portfólio empresarial; e o BSUID pode ser usado para enviar mensagens sem telefone. **Homologação que ainda falta:** confirmar em cada WABA os campos reais do webhook e do envio, testar destinatário por BSUID e por telefone compartilhado, verificar se os dois WABAs estão sob o mesmo portfólio/conta de BSUID principal e testar a solicitação de telefone/contato. Até isso passar, gravar os valores sem coerção e impedir fusão automática entre fichas.

## 18. Busca histórica de conexões e tratamento de credenciais

Foi feita busca no histórico/código do repositório SUCEDOAN12 na revisão consultada em 26/10/2026, commit 12e2a09f733b89c8cf61450f065856d50bfa9cde. A inspeção de arquivos históricos de webhook Meta, operações Admin, Flow, worker ANA, preview e .env.example foi somente leitura. Foram registrados **nomes e referências de configuração**, nunca valores. Nos arquivos de integração amostrados não foi detectado padrão literal conhecido de token; isso não equivale a uma varredura forense de todos os objetos/commits.

| Serviço | Referências históricas encontradas | Leitura profissional |
|---|---|---|
| Meta | Supabase functions antigas fazem referência a SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEYS, META_WHATSAPP_APP_SECRET, META_WHATSAPP_VERIFY_TOKEN, META_APP_ID/WHATSAPP_APP_ID, META_WHATSAPP_ACCESS_TOKEN e META_WHATSAPP_GRAPH_VERSION | Servem para localizar configuração atual e conferir o histórico; não assumir que token, app, WABA ou número ainda é o correto para as duas linhas deste projeto |
| Flow | Histórico registra uma derivação HMAC de sessão a partir do segredo Meta e função de endpoint específica para o número 1018 | Para o Admin novo, **não adotar** essa derivação como requisito: a referência oficial demonstra `flow_token` aleatório para correlação e RSA/AES-GCM no endpoint. Guardar hash do token por sessão; usar App Secret apenas no papel oficial de validar assinatura de webhook. A chave RSA privada permanece segredo do servidor e o cadastro de chave pública é confirmado para cada phone_number_id |
| Bling | Encontrados modelos/testes, migrações, documentação de homologação e `.env.example` orientando credenciais exclusivamente no backend; busca nos arquivos consultados não encontrou valores OAuth | Os valores não estão no GitHub; o Vault do Supabase legado possui referências nomeadas de Client ID, Client Secret e refresh token. OAuth teve verificação bem-sucedida no runtime legado em 26/10/2026, mas não no destino. Histórico de 17/10 também mostra necessidade de tratar OAuth expirado como reconexão, sem apagar dados ou insistir em retries |
| ANA/OpenAI | Workers e preview antigos referenciam OPENAI_API_KEY e ANA_OPENAI_MODEL | Usar OpenAI Responses API como provedor inicial; os nomes são pistas para validar no cofre, não prova de chave ativa, modelo atual ou permissão para o projeto novo |

**Limite desta pesquisa:** isso verifica arquivos e referências acessíveis no GitHub, não lê o cofre de Secrets do Supabase/GitHub Actions e não é auditoria exaustiva de cada blob de todos os commits. A conexão GitHub usada aqui também não oferece leitura de valores do Secret Store. Esses cofres não devem ser contornados nem exportados para Markdown. Os arquivos históricos ajudam a descobrir nomes de variáveis, IDs candidatos e funções que existiram; credenciais ativas são validadas no painel do provedor.

### Procedimento de conexão a seguir na Fase 0

1. Na Meta, confirmar App ID, WABA, dois phone_number_id, callback, permissões e status; criar/validar token de usuário de sistema no servidor. Nunca reutilizar sem teste token encontrado em commit.
2. No Supabase, usar somente a URL/ref do projeto confirmado e chave publicável no browser. Chave service/secret só em Edge Function/servidor. Procurar secrets existentes por nome e data; executar health check que retorna sucesso/falha, sem imprimir o valor.
3. No Bling, confirmar aplicativo instalado, Client ID/Secret no portal, OAuth autorizado, escopos mínimos, JWT enable-jwt e refresh vigente. Se Client Secret esteve em Git acessível, redefinir no Bling antes de cadastrar.
4. Se valor secreto literal aparecer em commit público/compartilhado, tratar como comprometido: revogar/reemitir no serviço, remover do runtime antigo quando autorizado e testar substituto. Limpar arquivo atual não apaga o valor do histórico Git.
5. Documentar somente nome da variável, provedor, ambiente, conta/escopo, último teste e responsável; nenhum valor de token, chave privada, código OAuth, telefone do cliente ou payload pessoal entra em documento, issue, commit, print ou log.

### Decisão técnica da ANA

Usar OpenAI Responses API no servidor, pois o histórico Vitrine Admin já registra essas duas variáveis de configuração. A empresa controla nome/voz, instruções, base aprovada e ferramentas; isso é uma ANA própria, sem treinar modelo-base no MVP. Ferramentas permitidas: buscar produtos, consultar opções, calcular orçamento e atualizar rascunho. Ferramentas proibidas para a IA: aceitar venda, alterar status físico, mexer em preço/custo/estoque, criar NF-e ou responder fora das permissões do usuário. O aceite do cliente aciona serviço determinístico separado.

Manter contexto de conversa e instruções versionadas no Supabase; enviar ao modelo apenas o trecho necessário, sem telefone/endereço/CPF por padrão. Usar function calling com schema estrito para operações internas e store=false para não depender de estado persistente do provedor. A política oficial informa que dados da API não treinam modelos por padrão, mas logs de monitoramento contra abuso podem reter conteúdo por até 30 dias; revisar o controle e os termos vigentes do projeto antes de levar dados reais. O model ID em variável é configurável e só será validado/selecionado ao iniciar a implementação, pois disponibilidade, preço e latência mudam.

## 19. Ordem de operação e estados que não podem se confundir

- **Rascunho de compra**: escolhas, pagamento e endereço de uma única intenção de compra, modificáveis e sem expiração automática.
- **Revisão do pedido**: snapshot recalculado antes do aceite. Não há prazo de validade por relógio; se preço, produto, estoque, endereço ou taxa mudarem, gerar nova revisão.
- **Aceite do cliente**: ação inequívoca vinculada à revisão específica. Só então criar um pedido completo no Admin e encaminhá-lo diretamente para PRODUÇÃO — Separação.
- **Pedido NOVO**: pedido manual ou retido por decisão operacional da equipe antes de liberar a separação; não é um rascunho de checkout incompleto nem substitui novo aceite após mudança de cotação.
- **Produção/Expedição/Entregue**: estados físicos da operação; alterações ficam em histórico e cancelamento exige motivo.
- **Pedido no Bling**: registro comercial/ERP; tem ID externo e resultado de integração separado do status físico.
- **NF-e**: documento fiscal com situação própria (pendente, emitida, enviada, autorizada, rejeitada/cancelada). Só “autorizada” após confirmação inequívoca da SEFAZ/Bling.

## 20. Casos críticos de homologação antes de produção

1. Cliente sem telefone e sem nome inicia conversa; Admin cria lead/conversa, permite atendimento e só pede contato quando precisa de endereço/entrega/ERP.
2. Mesma identidade fala nos dois phone_number_id; cada conversa mantém fila/origem e cada compra mantém rascunho próprio.
3. Flow e carrinho chegam em qualquer ordem e em qualquer intervalo; cada compra permanece separada. Retry Meta não duplica; um segundo ID de mensagem cria outro pedido e não altera o primeiro.
4. Cliente retira item, muda quantidade, preço muda, item perde estoque, ou endereço/taxa muda depois do resumo; versão antiga deixa de aceitar e novo total precisa ser confirmado.
5. Cliente clica duas vezes em confirmar, responde texto ambíguo ou tenta confirmar uma revisão com preço/estoque alterado; no máximo um pedido é criado e o sistema pede novo aceite quando necessário.
6. Flow publicado indisponível em aparelho antigo, chave errada em um número, token expirado, JSON inválido, callback repetido ou endpoint dinâmico lento; fallback de chat funciona e nenhum preço é confiado ao cliente.
7. Bling 401/refresh expirado, 429, timeout após criar venda, webhook duplicado/invertido/assinatura inválida e webhook que excede 5 segundos; fila reconcilia antes de qualquer retry de efeito ambíguo e alarme identifica webhook desativado.
8. Rejeição fiscal, falta de NCM/tributação/telefone/cadastro e pedido em expedição; estado físico não desaparece e o Admin mostra próximo passo humano.
9. Usuário catalog_manager tenta ver custo ou assumir fila, usuário fulfillment tenta alterar a ANA, função pública recebe payload fabricado e cliente tenta alterar preço; RLS/Edge Functions negam ações fora do papel.

## 21. Especificação funcional completa do Admin web

Esta seção passa a ser o contrato de produto para a programação. A navegação deve ser curta, com nomes cotidianos, uma ação principal por tela e detalhes progressivos. A equipe não deve ter de entender IDs, webhooks, JSON, tokens, WABA, OAuth ou payload para operar pedidos.

### 21.1 Estrutura global e navegação

**Menu lateral principal**

1. **Visão geral** — resumo operacional do dia e atalhos.
2. **Atendimento** — inbox unificada das duas linhas oficiais.
3. **Pedidos** — quadro NOVO, PRODUÇÃO, EXPEDIÇÃO e ENTREGUE.
4. **Cestas** — modelos de cesta, composição e Flow.
5. **Produtos** — catálogo interno e publicação de avulsos.
6. **Clientes** — cadastro, endereços, conversas e compras.
7. **ANA** — configurações simples do atendimento virtual.
8. **Configurações** — equipe, números, integrações e políticas operacionais.

No rodapé: perfil do usuário e sair. Não criar menu de relatórios separado no MVP; cartões e filtros operacionais de Visão geral e Pedidos bastam. Busca global é pós-MVP e só entra se a equipe realmente precisar.

**Cabeçalho de qualquer página**

- Nome da seção e uma frase curta explicando a tarefa.
- Ação principal à direita, quando aplicável: Nova cesta, Novo produto, Convidar funcionário etc.
- Busca e filtros antes da lista, nunca escondidos em menus técnicos.
- Breadcrumb apenas em páginas de detalhe.
- Guardar filtros, ordenação e página da lista ao abrir um registro e voltar.
- Idioma do produto pt-BR, moeda BRL, datas no fuso operacional configurado e valores financeiros sem ponto flutuante.
- Tabelas responsivas: no telefone podem rolar dentro da tabela; ações principais permanecem acessíveis.

**Componentes e estados comuns**

- Status usa rótulo textual e cor; cor nunca é o único indicador.
- Formulário dividido em blocos curtos, campos obrigatórios marcados, ajuda sob o campo, validação em linguagem simples.
- Salvar rascunho e publicar/ativar são ações distintas quando a mudança altera atendimento, Flow, preço ou integração.
- Confirmação apenas para ação com consequência operacional: publicar, excluir, cancelar, desativar, enviar ao Bling, devolver ANA.
- Estados completos de carregando, vazio, erro recuperável, sem permissão e integração pendente; sempre oferecer próximo passo útil.
- Toast confirma salvamento; erro de validação fica junto do campo e preserva o que foi digitado.
- Mostrar horário e autor em alterações. Nunca mostrar segredos; credencial é mascarada e só pode ser renovada na tela de conexão.

### 21.2 Visão geral

**Objetivo:** mostrar o que exige ação agora, não transformar a página em BI.

**Faixa superior**

- Saudação e data/fuso.
- Seletor de período simples: Hoje, Últimos 7 dias, Personalizado.
- Seletor de linha: Todas, número 1, número 2.

**Cartões**

- Conversas aguardando atendimento.
- Pedidos em NOVO.
- Pedidos em PRODUÇÃO.
- Pedidos em EXPEDIÇÃO.
- Integrações que precisam de atenção, incluindo falhas Bling/Meta.

Cada cartão abre a seção já filtrada. Contadores respeitam permissões e filtros; não somar clientes/conversas de forma que duplique pedidos.

**Lista “Precisa da sua atenção”**

- Conversas sem responsável há mais do que o limite configurado.
- Mensagens recebidas com erro de processamento.
- Pedido parado além do tempo configurado na coluna.
- Pedido em expedição sem criação/sincronização confirmada no Bling.
- Erro de NF-e ou pedido Bling rejeitado.

Cada linha apresenta o problema em texto simples, horário, entidade e botão Abrir. Não deve aparecer cartão de integração saudável sem necessidade de ação.

**Atalhos:** Abrir atendimento, Ver pedidos, Nova cesta, Novo produto. Não criar relatórios/exportações no MVP sem requisito operacional.

### 21.3 Atendimento

**Tela principal em três áreas:** lista de conversas, conversa selecionada, contexto lateral do cliente/pedido. A altura do chat é independente da lista e mantém o campo de resposta visível.

**Barra de fila e filtros**

- Fila: Todas, Não atribuídas, Minhas, Em atendimento, Aguardando cliente, Encerradas.
- Linha WhatsApp: número 1, número 2 ou todas. Cada conversa e cada envio mostram claramente em qual número opera.
- Responsável; estado ANA ligada/pausada; não lidas; período; busca por nome confirmado, identificador de remetente, telefone quando disponível e número do pedido.
- Ordenação padrão: atividade não lida/mais recente, sem fazer conversa antiga desaparecer.

**Colunas da lista**

- Indicador de não lida.
- Nome confirmado ou “Contato WhatsApp”.
- Prévia da última mensagem e horário.
- Etiqueta da linha/número.
- Responsável ou “Sem responsável”.
- Indicador curto: ANA, Humano, Aguardando, Falha.

**Cabeçalho da conversa**

- Nome do cliente e estado da conversa.
- Número comercial que recebeu a mensagem.
- Responsável atual e botão Atribuir/Transferir.
- Estado de automação com ação explícita Pausar ANA ou Devolver para ANA.
- Botões Criar/abrir rascunho de pedido e Ver cadastro.
- Mais ações: marcar não lida, encerrar, reabrir com motivo opcional.

Assumir uma conversa atribui ao atendente e pausa a ANA somente naquela conversa. Devolver à ANA registra ator e horário, avisa o operador que a automação retoma e respeita bloqueios globais por número.

**Linha do tempo**

- Mensagens de entrada/saída com tipo, conteúdo, horário, número utilizado e estado de entrega/leitura quando Meta fornecer.
- Tipos diferenciados sem misturar com fala do cliente: texto, imagem, vídeo, áudio, documento, botão, lista, resposta de Flow, pedido do Catálogo, template, falha de envio e evento de status.
- Mensagem de sistema em faixa discreta: atribuição, pausa/retorno da ANA, criação/alteração de pedido, erro de integração.
- Nota interna com fundo/ícone próprios, autor e horário; jamais enviada ao cliente.
- Mídia pode abrir em visualização; links/documentos não são executados automaticamente.

**Compositor de mensagem**

- Campo de texto e botão Enviar.
- Ações adicionais num menu curto: Imagem/arquivo, Respostas rápidas/botões ou lista, Catálogo, Flow da cesta, Template aprovado.
- Botões/listas usam apenas formatos e limites disponíveis na Cloud API vigente; se o formato não suportar o conteúdo, desabilitar com explicação curta.
- Catálogo envia coleção/produto pelo endpoint Meta e registra o wamid e o rascunho que aguarda o carrinho.
- Flow só pode ser enviado após selecionar a cesta/versão e criar ou escolher um rascunho aberto.
- Templates listam idioma, finalidade/categoria e status Meta; só os aprovados ficam enviáveis.
- Antes do envio, indicar claramente destinatário, número de saída e se está dentro da janela de atendimento. Fora da janela, exigir template elegível.
- Envio otimista mostra “enviando”; confirmação só depois do wamid. Falhas preservam rascunho de texto e oferecem Tentar novamente; retry conserva chave idempotente.
- Carrossel fica recurso secundário, liberado somente para formatos/template aprovados e suportados na conta; não é necessário para fechar cesta.

**Contexto lateral: cliente**

- Nome e status de identidade; identificador WhatsApp técnico só para operador autorizado, mascarado quando possível.
- Telefone, origem e verificação quando a pessoa o compartilhou; nunca presumir que sender ID é telefone.
- Endereço selecionado e botão Editar endereços.
- Pedidos recentes (número, status, total, data).
- Rascunhos de pedido abertos (origem individual Flow ou Catálogo, itens, pagamento, endereço, etapa e total recalculado).
- Consentimentos e preferência de contato, quando aplicável.
- Botão Abrir ficha completa.

**Ações de atendimento e comportamento de erro**

- Assumir, atribuir, transferir, pausar/retomar ANA, nota interna, fechar/reabrir, criar/abrir rascunho, enviar Flow, abrir catálogo e abrir pedido.
- Se evento chegar sem identidade ou contexto correlacionável, manter em “Precisa revisar”; não associar automaticamente a pedido apenas por nome/horário.
- Falha Meta/Bling não impede salvar mensagem recebida nem perder o texto digitado; mostrar causa operacional segura e identificador de rastreio sem token.

### 21.4 Pedidos

**Visualizações:** quadro por estado como padrão e tabela pesquisável como alternativa. Colunas fixas: NOVO, PRODUÇÃO, EXPEDIÇÃO, ENTREGUE. CANCELAR é ação, não quinta coluna; cancelados ficam disponíveis no filtro.

**Cartão do quadro**

- Número do pedido.
- Nome do cliente.
- Resumo dos itens e quantidade de linhas.
- Valor total.
- Hora/data de aceite.
- Linha de WhatsApp.
- Indicador de atraso ou problema de integração, se existir.

Arrastar cartão não muda status silenciosamente. Para evitar movimento acidental, a transição abre ação explícita; atalho rápido é permitido apenas se pedir confirmação.

**Filtros da tabela**

- Busca por número, cliente e SKU.
- Status operacional, período, atendente/responsável, número de WhatsApp, origem, integração Bling e status fiscal.
- Colunas: pedido, cliente, data de aceite, resumo, total, estado operacional, Bling, NF-e, canal.
- Paginação e exportação simples somente para papel autorizado.

**Detalhe do pedido**

1. Cabeçalho: número, estado operacional, data, origem única (Flow/cesta ou Catálogo), ações permitidas e responsável.
2. Cliente: cadastro vinculado, endereço congelado no pedido, telefone/identidade disponível.
3. Itens: mostrar a origem daquele pedido. Uma venda contém a cesta do Flow ou os itens do carrinho Meta, nunca os dois; em cesta, agrupar por componente/slot e mostrar o produto escolhido e quantidade. Cada produto físico é uma linha real de estoque/ERP; não criar uma linha virtual adicional que duplique a composição ou o total.
4. Valores: subtotal da cesta ou subtotal dos itens do Catálogo, entrega, desconto explícito e total; jamais mostrar margem/custo interno na área do pedido do operador comum.
5. Pagamento: forma escolhida no Flow/checkout, situação pendente/pago/estornado e referência quando houver; escolher forma não significa que o pagamento foi recebido.
6. Aceite: texto/revisão enviados, horário, mensagem identificadora e origem do aceite.
7. Produção e expedição: fila de separação, responsável, notas de operação e horário das mudanças.
8. Integração: pedido Bling próprio, situação de envio, número da NF-e, status de autorização, último erro seguro e botão Reprocessar quando idempotência permitir.
9. Histórico: timeline imutável de status, edição, aceite, cancelamento e integrações.
10. Notas internas e observação operacional.

**Transições**

- Aceite válido de um rascunho completo → PRODUÇÃO / Separação: transição automática; registrar confirmação do cliente e entrada na fila. Se houver mudança de preço/estoque/dado antes do aceite, manter rascunho, enviar revisão e aguardar novo aceite. NOVO → PRODUÇÃO é usado depois de liberar um pedido manual/retido.
- PRODUÇÃO → EXPEDIÇÃO: conferir campos necessários e confirmar; gravar transição/outbox idempotente; enviar pedido ao Bling conforme regra fiscal validada.
- EXPEDIÇÃO → ENTREGUE: registrar confirmação, ator e horário; atualização Bling só se API/escopo forem homologados.
- Cancelar: pedir motivo e mostrar efeito externo conforme status; gravar ator, data e estado Bling/nota relacionado.
- Impedir salto sem permissão e justificar exceção. Falha Bling não desfaz status operacional nem cria segundo pedido em retry.
- Pagamento e status fiscal são indicadores auxiliares; não substituir os quatro estados operacionais solicitados.

### 21.5 Cestas

**Lista**

- Botão Nova cesta.
- Busca por nome/SKU de kit.
- Filtros: ativa/inativa, rascunho/publicada, Flow válido/com erro.
- Colunas: nome, tipo/tamanho, componentes, preço-base, versão, status, última atualização.
- Ações: Abrir/Editar rascunho, Duplicar, Pré-visualizar, Testar, Publicar nova versão, Desativar.

**Editor por blocos**

**A. Informações**

- Nome interno obrigatório.
- Nome apresentado ao cliente.
- Descrição curta.
- Categoria/tamanho/identificador da cesta.
- Foto principal e galeria opcional.
- SKU comercial da cesta e mapeamento Bling, se aplicável.
- Estado: rascunho/ativa/inativa.

**B. Preço e operação**

- Moeda BRL.
- Extra interno da cesta em centavos, visível somente a owner/admin financeiro; somado uma vez à composição e nunca exposto à ANA.
- Preço-base calculado da composição padrão e valor publicado para conferência. Não aceitar divergência silenciosa: se operador editar preço-base manual, a interface explica se ele representa preço calculado, override autorizado ou desconto.
- Valor mínimo da cesta e política de desconto; permissões separadas.
- Política de estoque: não oferecer sem disponibilidade confirmada, permitir encomenda ou controlar manualmente; decisão global deve ser explícita.
- Frete/entrega não é campo escondido da cesta.

**C. Componentes da cesta (slots)**

Um slot corresponde a uma aba/tela do Flow. Exemplos: ARROZ, FEIJÃO, ÓLEO, AÇÚCAR. Cada slot tem:

- Nome da etapa, singular e amigável ao cliente.
- Instrução curta opcional.
- Categoria e posição/ordem.
- Obrigatório ou removível.
- Quantidade padrão da composição-base.
- Faixa permitida; no MVP o limite máximo é 6, mínimo 0 quando removível e 1 quando obrigatório.
- Alternativas elegíveis por vínculo a produtos ativos.
- Produto padrão de referência da composição.
- Regra de preço do slot e arredondamento em centavos.
- Quantidade real para reserva de estoque; regra de não duplicar estoque se cesta for uma linha de kit no Bling.
- Texto de preço apresentado: valor na cesta, não custo.
- Botões Adicionar opção, Remover slot, Mover para cima/baixo, Duplicar componente.
- Se não houver alternativa ativa, a cesta não publica.

**D. Alternativa de produto**

- Produto relacionado (seletor pesquisável por nome/SKU).
- Nome exibido/snapshot e tamanho/variante.
- Foto principal verificada e miniatura Flow obrigatórias para toda alternativa publicada; cada opção da tela deve levar sua própria foto e texto alternativo.
- Valor comercial por unidade dentro desta cesta.
- Identificador Meta/Bling vem do produto; não redigitar valores divergentes sem papel autorizado.
- Ativa/inativa nesta cesta.
- Disponibilidade e mensagem de substituição.
- Opção padrão? Deve haver no máximo uma por slot; não selecionar como resposta sem deixar claro ao cliente.

**E. Prévia do Flow**

- Prévia de cada componente na ordem definida, incluindo a foto de cada alternativa, nome/variante, controle 0–6, Próximo, total e avanço.
- Simulador de combinação permite selecionar cada alternativa e quantidade, mostra fórmula pública do subtotal e compara com o preço-base.
- Não mostrar custo, extra interno detalhado ou margem no preview de cliente.
- Prévia para tamanhos comuns de telefone e tamanhos longos de rótulo.

**F. Revisão/publicação**

- Validações: nomes e opções completas; valores não negativos; um padrão por slot quando configurado; quantidade-base na faixa; total-base coerente; produto ativo e mapeado; estoque/política; schema Flow válido; API Meta aceitou JSON; endpoint/chaves saudáveis para cada número que usa o Flow.
- Botão Salvar rascunho não muda clientes/pedidos atuais.
- Publicar cria versão imutável; edição posterior gera nova versão. Mostrar quem publicou, quando e status da Meta.
- Desativar impede novos envios, mas não altera sessões/pedidos abertos que guardam a versão anterior.

### 21.6 Produtos

**Lista**

- Busca por nome, SKU ou identificador.
- Filtros: ativo, disponível, sem foto, pendente Meta, pendente Bling, sem preço, sem estoque.
- Colunas: nome/foto, SKU, preço venda, disponibilidade, catálogo Meta, Bling, atualizado em.
- Ações: Novo produto, Editar, Ativar/Desativar, Publicar/atualizar Meta, Abrir falha de integração.

**Cadastro/edição**

**Identificação e apresentação**

- Nome comercial (cliente).
- Nome interno opcional.
- SKU único da loja.
- GTIN/EAN opcional e validado.
- Marca, descrição, unidade/variante, peso/volume.
- Foto principal e imagens adicionais; foto pode ficar pendente enquanto o cadastro é rascunho, mas é obrigatória antes de ativar como alternativa de cesta/Flow. Alt text é obrigatório na foto aprovada.
- Upload simples de uma foto gera original e miniatura Flow automaticamente; indicar estados “foto pendente”, “pronta para o Flow” e “não aprovada”.
- Categoria interna e categoria Meta.

**Venda e estoque**

- Preço de venda em centavos, obrigatório para produto oferecido.
- Custo interno e fornecedor restritos a papel autorizado.
- Quantidade disponível/estoque gerenciado e política de indisponibilidade.
- Ativo, avulso disponível no catálogo e elegível como alternativa em cesta.
- Estoque reservado; não confundir reservado com estoque físico.
- Preço promocional e validade apenas se houver regra comercial operada no MVP; não adicionar campo sem uso confirmado.

**Publicação Meta**

- product_retailer_id/código estável do catálogo.
- Catálogo associado e estado: não publicado, pendente, ativo, erro.
- Última sincronização e erro seguro.
- Ações Enviar/Atualizar e Ver no catálogo, se link disponível.
- Só publicar produto avulso no Catálogo quando os campos e a imagem exigidos pela API atual estiverem prontos. Só ativar alternativa de cesta/Flow se houver foto verificada, miniatura otimizada, alt text e todos os campos comerciais válidos.

**Bling**

- ID de produto Bling, código/SKU e estado de vínculo.
- Atalho “Localizar/vincular” e validação de unidade, situação, código e estoque quando aplicável.
- Não assumir que retailer ID, SKU e ID numérico do Bling são a mesma chave.
- Remapeamento gera audit event; histórico de pedidos conserva snapshot antigo.

### 21.7 Clientes

**Lista**

- Busca por nome confirmado, identidade WhatsApp, telefone verificado, e-mail e número do pedido.
- Filtros: ativos/arquivados, com endereço, pedidos recentes, identidade sem nome confirmado.
- Colunas: nome ou “Contato WhatsApp”, último contato, quantidade de pedidos, cidade quando houver endereço, última compra.
- Ação Novo cliente para cadastro excepcional.

**Ficha do cliente**

1. Identidade: nome confirmado, apelido, observação interna e estado ativo.
2. Contatos: WhatsApp(s), telefone compartilhado, e-mail, origem e data de verificação.
3. Identidades Meta: sender ID e tipo técnico separados de telefone; portfolio/WABA e primeira/última atividade; compartilhamento entre os dois números só quando comprovado.
4. Endereços: apelido, CEP, logradouro, número, complemento, bairro, cidade, UF, referência, instruções, padrão/não padrão, validade/confirmado.
5. Pedidos: número, data, status e total com link.
6. Conversas: número que atendeu, último contato, responsável e status.
7. Preferências/consentimento: fonte e data; anotações privadas separadas de consentimento.
8. Histórico de alterações com autor.

**Editar/cadastrar**

- Nome pode estar vazio no contato que acaba de chegar; apresentar “Contato WhatsApp”.
- Endereço não é inferido pelo número nem copiado de outra identidade sem confirmação.
- Normalizar telefone para E.164 somente quando conhecido; preservar origem.
- Mesclar duplicatas exige papel autorizado, revisão dos vínculos e log do antes/depois. Nunca mesclar pelo nome parecido automaticamente.
- Não permitir apagar informação necessária a pedido/fiscal; seguir política de retenção depois definida.

### 21.8 ANA

Configuração em português cotidiano, dividida em quatro blocos. Não expor token, nome de modelo bruto, prompt de sistema extenso ou parâmetro de API ao operador comum.

**Escopo configurável da primeira versão:** ligar/desligar ANA individualmente em cada número; editar saudação e tom; publicar respostas/conteúdo aprovado; escolher ações comerciais permitidas; definir horário/mensagem de ausência e situações que chamam humano; simular, salvar rascunho, publicar e reverter versão. Esse é o conjunto mínimo para a empresa ajustar a ANA sem virar um editor técnico de IA. Provider/modelo e chaves ficam na configuração de servidor, fora da tela de operação.

**A. Perfil**

- Nome exibido: ANA.
- Saudação e apresentação.
- Tom: acolhedor, direto, simples.
- Horário de atendimento humano e mensagem de ausência, se usados.
- Linhas em que pode responder: ativar individualmente para os dois números.

**B. Conhecimento aprovado**

- Informações da empresa.
- Produtos/categorias; sempre ler nome, disponibilidade e preço do banco atual.
- Cestas ativas e perguntas frequentes.
- Entrega, cobertura, pagamento, troca e cancelamento conforme política aprovada.
- Fontes/data de atualização; publicar somente conteúdo revisado.
- Não guardar segredos nem usar conversa de cliente como verdade geral.

**C. O que ANA pode fazer**

- Responder perguntas de produto com preço/disponibilidade atual.
- Identificar intenção, localizar cliente sem criar duplicata e abrir rascunho.
- Enviar Flow da cesta, abrir Catálogo, recolher endereço e apresentar resumo.
- Pedir aceite, sem marcar pedido NOVO antes da confirmação validada pelo backend.
- Consultar andamento de pedido autorizado.
- Não inventar preço, estoque, prazo, política, promessa ou estado fiscal.
- Não alterar pedido confirmado, cancelar, prometer desconto ou emitir nota sem função/permissão explícita.
- Encaminhar pessoa para humano em reclamação, ambiguidade, divergência, falha, baixa confiança ou pedido não suportado.

**D. Limites e operação**

- Status: rascunho, ativa, pausada. A mudança ativa exige revisão e teste.
- Pausar por conversa, por número ou global; o humano controla a conversa sem alterar configuração global.
- Regras de transferência: termos de reclamação, solicitação de pessoa, baixa confiança, erro de ferramenta, pagamento/endereço inconsistente.
- Limite de mensagens/turnos sem progresso e mensagem de fallback.
- Simulador com exemplos; ambiente de teste não envia ao cliente nem cria pedido real.
- Histórico de versão, autor, data, resumo das mudanças e ação Reverter para configuração anterior.
- Campo de IA não controla preço/total; funções seguras validam estado no servidor.

### 21.9 Configurações

As integrações ficam em telas de estado operacional simples, separadas por serviço. O administrador vê nome da conta/identificador e status, nunca segredo em claro.

**Empresa e operação**

- Nome comercial, fuso horário, moeda e formato de contato.
- Canais, política de janela do WhatsApp e horário humano.
- Política de entrega: regiões/municípios, taxa, frete grátis/condições, prazo informado e responsável pela atualização.
- Política comercial: desconto autorizado, valor mínimo do pedido e arredondamento.
- Nenhuma regra padrão deve criar taxa que não aparece no resumo do cliente.
- Formas de pagamento habilitadas: código interno, nome exibido, instrução curta, tipo (imediato/na entrega), ativo/ordem e exigência de confirmação manual de recebimento. Nunca coletar número de cartão nem tratar método escolhido como pagamento efetivado.

**Equipe e permissões**

- Usuário, e-mail/login, nome, ativo/inativo, papel, último acesso.
- Convite, redefinição de acesso e revogação de sessão conforme Auth Supabase.
- Papéis iniciais disponíveis na constraint atual: `owner`, `admin`, `catalog_manager` e `fulfillment`. Owner/admin cobrem atendimento, clientes, configurações e conexões; catalog_manager edita catálogo/cestas sem custo/margem; fulfillment opera pedidos e separação/expedição com dados logísticos mínimos. Um papel `support`/`operator` fica fora do MVP até necessidade confirmada.
- Financeiro não exige papel separado no MVP; somente owner/admin veem a parte financeira interna por ações server-side explícitas. Leitura e exportação sensível são concedidas separadamente.
- Toda operação administrativa escreve trilha de auditoria.

**WhatsApp / Meta**

- Duas linhas numeradas e identificáveis por nome amigável; WABA ID, phone_number_id, telefone de exibição e estado conectado.
- Estado dos webhooks, assinaturas, última entrega e última falha.
- Teste de conexão/recebimento/envio sem expor token.
- Estado do catálogo e catálogo associado.
- Status de templates, idioma e aprovação.
- Status por número para chave pública do endpoint Flow e teste criptográfico.
- Estado de cada Flow: versão, ID Meta, versão do JSON, rascunho/publicado/descontinuado, erros de validação, health status e preview disponível.
- Não unir automaticamente as duas linhas na mesma conversa. A ficha de cliente compartilhada exige identidade comprovada.

**Bling**

- Estado conectado/desconectado, empresa/conta identificadora, data da conexão, último sucesso e falha segura.
- Escopos necessários e teste de leitura; autorização OAuth no servidor e tokens somente no cofre de secrets.
- Mapeamento produto interno ↔ ID Bling e cliente ↔ contato Bling.
- Natureza de operação, depósito, forma de pagamento/frete e modelo de emissão são ativados somente depois de validação com a conta e contador.
- Status da fila: aguardando, enviando, sincronizado, erro corrigível, falha final.
- Botão Reconectar; Reprocessar só para evento idempotente.
- Bling continua sistema fiscal/ERP; Admin mantém estado operacional do atendimento.

**Supabase e serviço de IA**

- Indicador de disponibilidade e versão do último deploy/migração; não mostrar chaves de projeto, service role ou URL de funções para operador comum.
- Status das funções de webhook, Flow e integração; latência/último sucesso e correlação por ID.
- Provedor/modelo de IA definido por configuração protegida em ambiente de servidor; nunca colocar API key no navegador ou em instruções de ANA.
- A tela para usuário comum mostra apenas “IA disponível/pausada” e horário de checagem.

**Mensagens e políticas**

- Lista de templates Meta com nome, categoria, idioma, aprovação, variáveis e exemplo.
- Biblioteca de respostas rápidas internas com título, corpo, categoria e ativo.
- Política de retenção, uso de áudio/transcrição e acesso a mídia fica documentada para implantação; configurações só entram quando houver implementação.

**Auditoria e atividade**

- Filtros por período, pessoa, módulo, ação e resultado.
- Campos: autor/sistema, ação, entidade, data, resultado e referência técnica sem dados pessoais desnecessários.
- Botão Abrir entidade; exportação restrita.
- Nunca registrar segredo, texto integral de mensagem ou endereço completo em log técnico de falha.

### 21.10 Papéis e limites de ação

| Ação | Owner/admin | Catálogo | Atendimento | Expedição |
|---|---:|---:|---:|---:|
| Ver fila, atribuir e responder | Sim | Opcional leitura | Sim | Leitura limitada |
| Pausar/retomar ANA em conversa | Sim | Não | Sim | Não |
| Editar produto/cesta rascunho | Sim | Sim | Não | Não |
| Publicar produto/cesta/Flow | Sim | Com permissão atribuída | Não | Não |
| Ver custo e extra interno | Sim, restrito | Se necessário e autorizado | Não | Não |
| Ver/editar clientes e endereços | Sim | Não | Sim | Leitura necessária ao despacho |
| Confirmar orçamento como pedido | Pelo cliente em uma revisão válida | Não | Não manualmente sem fluxo auditado | Não |
| Mover NOVO → PRODUÇÃO | Sim | Não | Não | Sim |
| Mover PRODUÇÃO → EXPEDIÇÃO | Sim | Não | Não | Sim |
| Cancelar/ajustar pedido | Sim | Não | Solicitar/revisão | Solicitar/revisão |
| Conectar Meta/Bling/alterar usuários | Sim | Não | Não | Não |
| Reprocessar falha de integração | Sim | Não | Não | Com permissão atribuída |

A matriz de banco/RLS e a autorização de tela precisam concordar. Esconder botão no frontend não substitui autorização no servidor.

## 22. Especificação completa do Flow da cesta

### 22.1 Entrada e pré-condições

1. A pessoa manifesta interesse numa cesta ou a ANA propõe opções existentes.
2. O Admin cria um rascunho exclusivo para esta compra da cesta; a mesma conversa pode ter outros rascunhos de Catálogo separados.
3. A mensagem de abertura diz o que o botão fará e para qual cesta, por exemplo: “Monte sua cesta Família: escolha uma opção e a quantidade de cada item. No final você informa o pagamento e confirma seu endereço.”
4. O botão abre diretamente o primeiro componente, sem tela introdutória.
5. A sessão recebe um flow_token aleatório/opaco ligado ao rascunho, cliente/identidade, linha e versão da cesta; o banco guarda apenas o hash. O token não contém telefone/endereço e não é credencial de autorização.
6. A lista de componentes é congelada na versão publicada da cesta. Se mudar preço/estoque durante a sessão, a tela seguinte recebe dados atuais e a submissão inteira é recalculada; se houver alteração material, o Admin comunica antes do aceite.

### 22.2 Tela repetida de um componente

Uma visita corresponde a um único slot e contém, nesta ordem:

1. **Título:** nome curto do slot em destaque: ARROZ.
2. **Contexto:** etapa X de N e, quando possível, nome da cesta.
3. **Pergunta de produto:** “Escolha o arroz”.
4. **Opções:** uma opção visual por alternativa ativa, com a foto daquele produto, texto alternativo, nome/variante e valor comercial unitário da cesta. Exemplo: foto do Arroz Tio Alvino + “Arroz Tio Alvino — R$ 22,90/un.”. Valores e imagens vêm do servidor; não colocar custo. É obrigatório ter foto em todas as alternativas visíveis.
5. **Pergunta de quantidade:** seletor de inteiro com as opções: 0 — Retirar; 1; 2; 3; 4; 5; 6.
6. **Total atual:** mostra o total calculado até a cesta atual, atualizado depois de cada avanço. Texto curto indica que a cesta final será recalculada na revisão.
7. **Botão:** Próximo.

**Regras da tela**

- A pessoa escolhe uma alternativa e então uma quantidade; só depois pressiona Próximo.
- Se não escolher alternativa e quantidade maior que zero, permanecer na tela e dizer o que falta.
- 0 significa Retirar; nesse caso alternativa fica vazia ou sem efeito. Se o slot for obrigatório, 0 é rejeitado com explicação.
- O valor é recalculado pelo servidor a cada Próximo. Nunca confiar em product ID, quantidade, preço ou total sem validar contra a versão publicada.
- A lista de alternativas contém apenas produtos ativos e elegíveis para aquele slot. Produtos sem estoque seguem a política explícita da cesta (ocultar, informar indisponível ou encomenda).
- Se houver muitas alternativas para o espaço visual, usar componente de seleção compacta aprovado pelo Flow Builder; não reduzir fonte nem esconder valor.
- Não pré-selecionar alternativa ou quantidade de um modo que pareça uma escolha feita pelo cliente. Caso haja composição padrão, apresentar como sugestão identificada e ainda permitir substituição/retirada; a submissão continua mostrando cada escolha na revisão.
- Ao voltar, retornar à escolha gravada daquele slot e recalcular todos os valores subsequentes.
- Mostrar orientação “Você pode voltar para ajustar” na primeira etapa, sem parágrafo longo em todas as telas.

**Exemplo visível**

**ARROZ — etapa 1 de N**
Escolha o arroz:

- Arroz Tio Alvino — R$ 22,90 por unidade na cesta
- Arroz Koblenz — R$ 25,40 por unidade na cesta

Quantidade:

- 0 — Retirar
- 1
- 2
- 3
- 4
- 5
- 6

**Total atualizado da cesta: R$ …**
Botão: **Próximo**

É um padrão repetido para FEIJÃO, ÓLEO, AÇÚCAR e os demais componentes, na ordem definida pelo operador.

### 22.3 Última etapa e encerramento

- O Próximo do último componente abre a etapa **Forma de pagamento**, com opções carregadas da configuração do Admin.
- A escolha grava o método no rascunho, mas não marca pagamento como recebido nem coleta dados de cartão.
- Depois do pagamento, o servidor procura primeiro a identidade Meta exata por tipo + escopo aplicável (para BSUID, business portfolio), mantendo `phone_number_id` separado como origem da conversa. Se não achar, pode procurar por telefone E.164 somente quando ele foi compartilhado/verificado e retorna exatamente um cadastro; correspondência múltipla vai para atendente, sem mescla automática.
- Se localizar cliente, mostrar os endereços cadastrados com apelido e resumo suficiente para identificação. A pessoa precisa confirmar um endereço ou escolher outro; pode adicionar novo.
- Se não localizar cliente, ou se o cliente não tiver endereço, coletar nome e endereço de entrega (CEP, rua, número, complemento, bairro, cidade, UF e referência opcional), validar e criar o cadastro/identidade de forma idempotente. Pedir telefone apenas se a política de entrega ou o Bling realmente exigir; nesse caso, pedir compartilhamento/confirmar origem em vez de assumir o sender ID como telefone.
- Mostrar uma tela final no Flow com produtos/opções/quantidades, endereço confirmado, pagamento e total da cesta. Não exibir valor unitário de cada item nessa revisão; o total geral deve estar claro.
- Botão **Concluir escolhas** conclui a coleta. A resposta Flow não cria pedido e não substitui o botão de confirmação enviado depois na conversa.
- Botão de voltar permite corrigir componente, pagamento ou endereço; qualquer alteração recalcula o total.
- Após receber a submissão final, o servidor envia na conversa uma lista de produtos e quantidades, endereço, pagamento e total geral, sem preços individuais, com botão **Confirmar pedido**.
- Se Flow for cancelado/fechado sem completar, o rascunho permanece salvo sem expiração automática e não entra em Pedidos. A pessoa pode retomar; o sistema atualiza preço/estoque antes da confirmação.

### 22.4 Contrato do endpoint e dados mantidos

- INIT: validar token/linha/versão; devolver primeiro slot e valores de exibição.
- Próximo/data_exchange: validar token, screen/ação, slot atual, alternativa ativa, quantidade permitida e estado aberto; salvar escolha idempotentemente; recalcular total; devolver o próximo slot ou revisão. Cada alternativa contém sua miniatura Flow codificada e `alt-text`; nunca devolver alternativa elegível sem foto aprovada.
- Voltar/BACK: recarregar estado confiável do servidor e devolver valores para preenchimento da tela.
- Complete/nfm_reply: receber submissão final, deduplicar mensagem, conferir a mesma sessão/remetente/linha e confirmar que cada slot tem escolha válida; guardar snapshot e estado “cesta coletada”, não “pedido confirmado”.
- Se a sessão foi consumida/revogada, a cesta foi desativada ou token/linha/remetente não coincidem: não alterar pedido; oferecer retomada com versão ativa ou humano.
- Persistir: flow session ID, token hash, Meta Flow ID e versão, rascunho exclusivo da cesta, customer/conversation/line IDs, estado, início/fim e motivo de revogação, componente atual, seleções por slot, forma de pagamento, endereço escolhido/novo, snapshots de nome/preço/quantidade, revisões e mensagem Meta correlata. Não aplicar expiração automática de sessão na primeira versão; retomada explícita emite outro token e revoga o anterior. Isso não cria uma janela para agrupar pedidos.
- Respostas do protocolo incluem a versão Data API configurada; INIT, ping, data_exchange e retorno de tela têm contratos separados e testados. Requisições e respostas do Data Endpoint seguem a criptografia da Meta; chave privada é segredo de servidor vinculado ao estado de cada número.
- Webhook Flow e Data Endpoint respondem dentro dos prazos de Meta. A implementação usa resposta mínima, sem consultar Bling/IA durante o avanço.
- Entrada e resposta sem payload pessoal completo em logs; eventos têm dedupe e correlação.

**Segurança e contrato do Flow token:** gerar um token aleatório imprevisível por sessão; persistir somente seu hash, associado ao rascunho, `phone_number_id`, WABA, identidade remetente, versão da cesta e status. O token serve para correlação, não é prova suficiente de identidade nem substitui a verificação da assinatura do webhook, a decifragem autenticada do Data Exchange ou as checagens de remetente/linha/estado. A sessão termina por conclusão, revogação ou substituição explícita; rascunhos abandonados não são pedidos e a regra de pedidos separados não usa janela de tempo. Ao retomar, emitir token novo e revogar o anterior. O exemplo oficial da Meta gera `flow_token` aleatório e o envia na mensagem; o exemplo oficial de endpoint usa a chave privada RSA para abrir a chave AES e AES-GCM para abrir a requisição, e devolve resposta criptografada usando a chave/IV do protocolo. Não derivar uma chave HMAC de sessão do `META_WHATSAPP_APP_SECRET`: isso é uma solução interna do código legado, não requisito do protocolo documentado. O segredo do App continua separado para validar a assinatura HMAC do webhook, conforme a configuração oficial aplicável.

**Condição a validar no spike:** provar que o `flow_token` enviado aparece no `interactive.nfm_reply.response_json` da conclusão, com o formato real recebido, em cada WABA. O exemplo educativo oficial da Meta demonstra o caminho `nfm_reply.response_json`, mas não usa o token para localizar registro. Se a forma de conclusão não devolver o token de modo confiável, não inferir pelo chat nem por tempo: definir e provar uma correlação segura alternativa antes de completar o checkout.

### 22.5 Publicação e recuperação

- Admin monta os slots; sistema gera JSON de forma determinística, valida contra schema Meta, testa rotas/dados/componentes, sobe como DRAFT, lê validation_errors/health status e gera preview.
- Operador testa no telefone interno por cada linha e revisa opções/valores/retorno.
- Publicar marca a versão como imutável no Admin; próxima alteração publica nova versão e preserva versões em andamento.
- Flow só pode ser enviado numa linha com endpoint/chave checados.
- A validação de publicação bloqueia slot sem foto aprovada em qualquer alternativa; validar duas imagens na mesma lista, payload com várias alternativas e acessibilidade antes do Flow comercial.
- Não fixar no produto um máximo de telas inferido de blogs ou ferramentas terceiras: a coleção oficial expõe validação e estado do Flow, e a publicação precisa consultar o validador efetivo da conta. Fazer protótipo de carga com a cesta que tenha mais componentes. Se a Meta rejeitar o retorno dinâmico à mesma tela, gerar uma tela JSON individual para cada componente; se a definição inteira exceder algum limite oficial retornado, dividir automaticamente em etapas de Flow sequenciais ligadas ao mesmo rascunho, mantendo uma escolha de produto por tela e retomada explícita no chat.
- Se cliente/versão WhatsApp não suportar Flow, endpoint falhar ou fluxo estar indisponível: alternativa manual no chat com as mesmas perguntas por componente, salvando no mesmo rascunho e aplicando as mesmas validações/preços.
- Operador consegue ver “rascunho”, “em teste”, “publicado”, “descontinuado”, “precisa corrigir” e uma instrução clara, sem código de erro cru.

### 22.6 Checkout final e pedidos do Catálogo sempre separados

A conclusão do Flow inicia a confirmação de um pedido de cesta. O cliente não adiciona produtos do Catálogo a essa cesta. Se enviar carrinho Meta na mesma conversa — antes, durante ou depois do Flow, inclusive imediatamente depois — cada carrinho abre outro rascunho, outro resumo e outro pedido. Nenhum limite de minutos/horas é usado para agrupar ou decidir se é pedido novo.

**Checkout da cesta:** Flow devolve escolhas, pagamento, identidade/endereço confirmado e total. O backend atualiza preços/estoque; antes de enviar o resumo, coleta os dados obrigatórios. A mensagem lista produtos/opções, quantidades, endereço, forma de pagamento e total geral, sem preço unitário por item. Botão **Confirmar pedido** aceita somente essa revisão. Se o servidor confirmar que cotação, estoque e dados ainda estão válidos, cria a venda e encaminha diretamente para PRODUÇÃO — Separação. Se faltar dado ou algo mudou, não cria pedido; corrige o rascunho e emite novo resumo.

**Checkout do Catálogo:** mensagem de carrinho gera rascunho próprio após deduplicação. Resolver produtos pelo retailer ID e cadastro do cliente pela identidade Meta. Mostrar endereço e forma de pagamento existentes para confirmação explícita; se não houver, coletar os dados faltantes. Enviar outro resumo e outro botão de confirmação. O aceite válido cria outro pedido no Admin, também independente e direcionado diretamente à Separação. Se validação falhar, não criar pedido até emitir revisão atual e obter novo aceite.

**Validação do botão:** o ID enviado no botão é opaco e aponta para order_draft_id + revisão; não contém telefone, endereço nem preço. O webhook valida identidade, linha WhatsApp, ID de mensagem, revisão atual, disponibilidade e estado do rascunho. A confirmação é uma transação única que congela itens/preços/endereço/pagamento, grava aceite e histórico, cria o pedido, reserva estoque e coloca pedidos válidos na fila PRODUÇÃO — Separação. O Admin atualiza o quadro e mostra “Confirmado pelo cliente” com horário e origem. Clique duplicado retorna o pedido já criado; revisão alterada exige novo botão/aceite. Nenhum retry cria outra venda ou NF.

**Mensagem-modelo para cada pedido**

**Confira seu pedido**

• Arroz Tio Alvino × 1
• Feijão × 2
• Óleo de soja × 2

**Endereço:** Rua…, número…, bairro…, cidade…
**Pagamento:** forma selecionada
**Entrega:** informar o valor apenas se houver cobrança, antes do total
**Total do pedido: R$ …**

“Confirme para registrarmos este pedido e enviá-lo para separação. Outro carrinho enviado será um pedido separado.”

Botão: **Confirmar pedido**. A mensagem contém apenas os produtos/quantidades, a forma de pagamento, o endereço e o total geral; não apresenta preço individual por produto. Editar gera nova revisão e invalida o botão anterior.

**Bling e fiscal:** quando cada pedido sai de PRODUÇÃO para EXPEDIÇÃO, criar uma venda externa Bling com referência própria. Uma cesta e um carrinho do Catálogo têm IDs, retries, acompanhamento fiscal e emissão de NF-e separados. A nota de um pedido nunca inclui itens do outro.
## 23. Critérios de aceite do desenho funcional

1. Uma atendente identifica número WhatsApp, responsável, ANA e cliente sem abrir várias telas.
2. O operador entende claramente o que será enviado ao cliente e para qual número antes de enviar.
3. Cada slot de cesta tem uma etapa própria e o cliente vê a foto de cada produto elegível, a escolha, quantidade 0–6 e Próximo.
4. O cliente consegue trocar alternativa, remover slot opcional e perceber o efeito no total.
5. O Admin mostra custo/extra interno apenas para pessoas autorizadas e não os revela na mensagem/Flow/ANA.
6. Flow terminado sozinho não aparece no quadro nem gera venda.
7. Flow e carrinho do Catálogo geram rascunhos/pedidos separados, cada qual com endereço, pagamento, resumo e aceite próprios.
8. Aceite válido cria exatamente um pedido completo no Admin e encaminha para PRODUÇÃO — Separação. Pendência anterior ao aceite mantém a compra como rascunho e exige correção/novo aceite; NOVO é para pedido manual ou retido por ação operacional da equipe.
9. Atendimento, clientes, produtos, cestas, pedidos, ANA e Configurações têm listas/detalhes/ações consistentes e português simples.
10. Falha externa informa o próximo passo e não apaga mensagem, escolha, pedido ou trilha; reprocessamento nunca duplica efeito.
11. As duas linhas, as quatro fases do pedido e o status fiscal ficam visíveis sem misturar conceitos.
12. Nenhuma tela exibe segredo de Meta, Supabase, Bling ou IA.

## 24. Fontes técnicas consultadas

### Fontes consultadas nesta expansão

- [Meta — documentação oficial de WhatsApp Flows](https://developers.facebook.com/documentation/business-messaging/whatsapp/flows)
- [Meta — referência oficial de componentes Flow JSON](https://developers.facebook.com/docs/whatsapp/flows/reference/components) — validar suporte e limites atuais de imagens em opções de seleção antes do Flow comercial.
- [Meta — workspace oficial Postman do WhatsApp Business Platform](https://www.postman.com/meta/whatsapp-business-platform/overview)
- [Meta — coleção Flows no Postman oficial: criação, leitura, preview, publicação e envio](https://www.postman.com/meta/whatsapp-business-platform/request/a1g0zfr/list-flows)
- [Meta — consulta oficial do estado, versão, erros de validação e health status de um Flow](https://www.postman.com/meta/whatsapp-business-platform/request/ze1wmk6/get-flow)
- [Meta — documentação oficial de início de Flow; clientes WhatsApp incompatíveis podem não receber a mensagem](https://www.postman.com/meta/whatsapp-business-platform/collection/y5swede/moved-whatsapp-flows-api)
- [Loja Integrada — lista e gerenciamento de pedidos](https://ajuda.lojaintegrada.com.br/pt-BR/articles/931793-gerenciando-pedidos-da-loja)
- [Loja Integrada — filtros avançados de pedidos e estado dos filtros](https://ajuda.lojaintegrada.com.br/pt-BR/articles/3329687-como-filtrar-pedidos-para-encontrar-vendas-especificas)
- [Loja Integrada — filtros de produtos](https://ajuda.lojaintegrada.com.br/pt-BR/articles/8539003-filtrar-os-produtos-no-painel)
- [Loja Integrada — cadastro e histórico de clientes](https://ajuda.lojaintegrada.com.br/pt-BR/articles/931784-como-gerenciar-o-cadastro-dos-clientes)
- [Loja Integrada — relatórios centralizados](https://ajuda.lojaintegrada.com.br/pt-BR/articles/931794-como-acessar-relatorios-na-nova-visao-de-negocios)
- [Blip — edição, validação, preview, teste e publicação de Flows](https://help.blip.ai/hc/pt-br/articles/18613541808151--Extens%C3%A3o-Como-usar-a-extens%C3%A3o-WhatsApp-Flows-no-Blip)
- [Blip — visão geral e ciclo de vida de Flows](https://help.blip.ai/hc/pt-br/articles/19143153044375-O-que-%C3%A9-o-WhatsApp-Flows)
- [AWS — configuração de endpoint para Flow dinâmico e troca de dados](https://docs.aws.amazon.com/end-user-messaging/latest/userguide/nx-features-whatsapp-flows.html)
- [Infobip — gestão e criptografia de WhatsApp Flows](https://www.infobip.com/docs/whatsapp/whatsapp-flows/build-whatsapp-flows)
- [Twilio — envio de WhatsApp Flows](https://www.twilio.com/docs/content/whatsapp-flows)
- [Meta — coleção oficial de Cloud API e Flows](https://www.postman.com/meta/whatsapp-business-platform/overview)
- [Meta — payload oficial de webhook de carrinho do catálogo](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api?entity=request-13382743-ba924e99-3d98-4954-b4e3-73a519939c33)
- [Meta — configuração da chave de criptografia por número](https://www.postman.com/meta/whatsapp-business-platform/request/94vddj5/set-encryption-public-key)
- [WhatsApp — privacidade de telefone ao falar com empresas](https://faq.whatsapp.com/2420735651780574)
- [WhatsApp — FAQ oficial de usernames](https://www.whatsapp.com/usernames-faq/)
- [Supabase — changelog](https://supabase.com/changelog)
- [Supabase — RLS e grants](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — mudança de exposição automática da Data API](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
- [Bling — migração para autenticação JWT e header enable-jwt](https://developer.bling.com.br/migracao-jwt)
- [Bling — OAuth, validade e segredo do aplicativo](https://developer.bling.com.br/aplicativos)
- [Bling — perguntas frequentes, limite de 3 req/s, cota diária e processo de homologação](https://developer.bling.com.br/perguntas-frequentes)
- [Bling — webhooks: assinatura, idempotência, ordem e retries](https://developer.bling.com.br/webhooks)
- [Bling — limites da API](https://developer.bling.com.br/limites)
- [OpenAI — Responses API e ferramentas](https://developers.openai.com/api/docs/guides/tools)
- [OpenAI — function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [OpenAI — controles e retenção de dados da API](https://developers.openai.com/api/docs/guides/your-data)
- [Referência histórica interna de UX do Vitrine Admin](https://github.com/osvaldosereia/SUCEDOAN12/blob/12e2a09f733b89c8cf61450f065856d50bfa9cde/projetos/dona-antonia-v2/docs/REFERENCIA_ADMIN_UX.md)
- [Histórico Vitrine Admin — desenho do Flow Center](https://github.com/osvaldosereia/SUCEDOAN12/blob/12e2a09f733b89c8cf61450f065856d50bfa9cde/docs/superpowers/specs/2026-10-24-whatsapp-flow-admin-design.md)
- [Histórico Vitrine Admin — plano de segredo de sessão Flow](https://github.com/osvaldosereia/SUCEDOAN12/blob/12e2a09f733b89c8cf61450f065856d50bfa9cde/docs/superpowers/plans/2026-10-24-flow-session-secret-reuse.md)

### GitHub histórico

- [Branch admin-v3-chat-center-20260912](https://github.com/osvaldosereia/SUCEDOAN12/tree/admin-v3-chat-center-20260912)
- [Registro histórico Flow V2](https://github.com/osvaldosereia/SUCEDOAN12/blob/admin-v3-chat-center-20260912/docs/DECISAO-WHATSAPP-FLOW-V2-PRODUCAO-2026-09-09.md)
- [Estratégia de vitrine e identificação de cliente](https://github.com/osvaldosereia/SUCEDOAN12/blob/admin-v3-chat-center-20260912/docs/WHATSAPP-ATENDENTE-ESTRATEGIA-CADASTRO-VITRINE-20260909.md)
- [Arquitetura Dona Antonia V2](https://github.com/osvaldosereia/SUCEDOAN12/blob/admin-v3-chat-center-20260912/docs/ARQUITETURA-DONA-ANTONIA-V2.md)

### Meta / WhatsApp

- [Cloud API, Webhooks e Flows — Postman oficial](https://www.postman.com/meta/whatsapp-business-platform/overview)
- [Registrar chave pública de criptografia Flow](https://www.postman.com/meta/whatsapp-business-platform/request/p9in1an/set-encryption-public-key)
- [Meta — consultar status, validação e saúde do Flow](https://www.postman.com/meta/whatsapp-business-platform/request/9cwjfve/get-flow) — inclui campos `validation_errors`, `health_status`, `json_version`, `data_api_version` e vínculos de conta.
- [Meta — exemplo oficial de endpoint Flow em Go](https://github.com/WhatsApp/WhatsApp-Flows-Tools/blob/main/examples/endpoint/go/flows-endpoint/main.go) — mostra o contrato criptografado de entrada/saída; exemplo educativo a revisar antes de produção.
- [Exemplo oficial de endpoint Flow; indicado como protótipo](https://github.com/WhatsApp/WhatsApp-Flows-Tools/blob/main/examples/endpoint/nodejs/basic/README.md)
- [Enviar produto único](https://www.postman.com/meta/whatsapp-business-platform/request/syvmul4/send-single-product-message)
- [Exemplo de webhook de carrinho do Catálogo](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api?entity=request-13382743-ba924e99-3d98-4954-b4e3-73a519939c33)
- [Meta — Context Object do webhook, incluindo o ID da mensagem respondida](https://www.postman.com/meta/whatsapp-business-platform/folder/hysdhqs/context-object)
- [Meta — enviar mensagem com reply buttons](https://www.postman.com/meta/whatsapp-business-platform/request/x0kd1at/send-reply-button)
- [Meta — amostra Flow que cria flow_token e processa nfm_reply](https://github.com/WhatsApp/WhatsApp-Flows-Tools/blob/main/articles/creating-surveys/main.py) — amostra educativa; não usar o servidor simplificado como implementação de produção.
- [Meta — workspace oficial Postman da WhatsApp Business Platform](https://www.postman.com/meta/whatsapp-business-platform/overview) — coleções atuais de Cloud API, Flows e Business Management; a antiga coleção separada de Flows está marcada como movida.
- [Meta — webhook oficial de carrinho enviado pelo Catálogo](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api?entity=request-13382743-ba924e99-3d98-4954-b4e3-73a519939c33) — payload `type=order`, catálogo, `product_retailer_id`, quantidade, preço observado e moeda.
- [Meta — referência oficial dos componentes Flow](https://developers.facebook.com/docs/whatsapp/flows/reference/components) — autoridade para `data-source`, imagem/`alt-text` e versões. A página respondeu HTTP 429 nesta auditoria; confirmar suporte e limites no próximo acesso e no validador das WABAs antes de codificar.
- [Meta — usernames e IDs de usuário no escopo da empresa (BSUID)](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids/) — campo `user_id`, uso do BSUID quando telefone não é conhecido e escopo do portfólio empresarial.
- [Blip — documentação atual de WhatsApp Flows](https://help.blip.ai/hc/en-us/articles/19143153044375-What-is-WhatsApp-Flows) — lifecycle Draft/Published, validação JSON, preview e configuração do endpoint.
- [Infobip — construir e enviar WhatsApp Flows](https://www.infobip.com/docs/whatsapp/whatsapp-flows/build-whatsapp-flows) — envio, token de sessão e chave do Flow dinâmico.
- [Twilio — WhatsApp Flows](https://www.twilio.com/docs/content/whatsapp-flows) — estrutura, submissão do Flow e diferença entre Flow da Meta e builder do provedor.
- [Blip — impacto da evolução de IDs/username em variáveis de WhatsApp](https://help.blip.ai/hc/en-us/articles/40877028913559-How-to-analyze-possible-impacts-of-the-evolution-of-WhatsApp-IDs-on-Builder-Studio-flows) — não presumir que a identidade recebida sempre seja um telefone.
- [Política WhatsApp Business](https://whatsappbusiness.com/policy/)

### Supabase e Bling

- [Supabase — RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — funções de banco](https://supabase.com/docs/guides/database/functions)
- [Supabase — conexão PostgreSQL segura desde Edge Functions](https://supabase.com/docs/guides/functions/connect-to-postgres)
- [Supabase — agendar Edge Functions com Cron e Vault](https://supabase.com/docs/guides/functions/schedule-functions)
- [Supabase — extensão pg_net](https://supabase.com/docs/guides/database/extensions/pg_net)
- [Supabase — estágio Beta do Cron](https://supabase.com/features/supabase-cron)
- [Supabase — Vault](https://supabase.com/docs/guides/database/vault)
- [Bling — API v3](https://developer.bling.com.br/referencia)
- [Bling — mudança da URL base para `api.bling.com.br`](https://developer.bling.com.br/migracao-url) — a URL antiga foi descontinuada em 30/04/2026; fixar a base atual no adaptador.
- [Bling — OAuth e gestão de aplicativo](https://developer.bling.com.br/aplicativos)
- [Bling — webhooks](https://developer.bling.com.br/webhooks)
- [Bling — limites](https://developer.bling.com.br/limites)
- [Bling — gerar NF-e a partir do pedido de venda](https://ajuda.bling.com.br/hc/pt-br/articles/360036450634-Como-gerar-nota-NF-e-a-partir-do-pedido)

## 25. Auditoria de prontidão para programação — 26/10/2026

### Parecer

**Status atualizado em 26/10/2026: a especificação está em execução greenfield.** O shell administrativo, login inicial, base Supabase local, identidade WhatsApp e modelo de catálogo/cestas já foram implementados na branch nova. Meta/Flow em produção, pedidos reais, Bling, ANA e cadastro operacional ainda estão pendentes; os gates externos continuam bloqueando qualquer escrita em produção.

### Gates externos antes de ligar operação real

1. **Fechar mapa seguro das credenciais:** usar o Vault do projeto legado apenas como fonte de nomes/referências; mapear cada credencial aos dois registros Meta e ao registro Bling no projeto novo. Confirmar no painel Supabase se o access token Meta está em Edge Function Secrets (o Vault legado não expõe um nome explícito para ele), obter health check autenticado separado por WABA e confirmar OAuth Bling em leitura. Criar as referências/segredos no destino por mecanismo seguro, nunca em Git/planilha/chat. Manter `enabled=false` e `external_writes_enabled=false`; garantir um único proprietário de renovação do refresh token Bling durante qualquer transição.
2. **Atualização Supabase:** quando a carga de produtos e fotos terminar, repetir leitura somente leitura do projeto `wvpzudjujtmyspluwhvx`: schema/contagens, vínculo `products` ↔ `product_images`, estado de verificação, caminhos/miniaturas e buckets. Atualizar o retrato desta seção; só então fechar a migração de mídia e os identificadores SKU/Meta/Bling. Não escrever em produção durante a conferência.
3. **Pré-homologação Meta, duas linhas:** confirmar Graph API version, portfólio empresarial dos dois WABAs, `phone_number_id`, permissões, webhook e destino de resposta; mapear campos `wa_id`/`user_id` nos eventos reais. No telefone interno, provar uma opção de Flow com foto + alt text por `data-source`, quantidade, Próximo/Voltar e conclusão `nfm_reply`; testar também um carrinho `type=order`. Registrar payload sem dados pessoais, distinção de pedido, dedupe e renderização em Android/iOS. Não publicar para clientes durante a prova.
4. **Pré-homologação Bling:** confirmar app OAuth, homologação/escopos, cadastro de produto e compatibilidade do fluxo venda → gerar NF-e → enviar para SEFAZ → reconciliar status. Testar apenas no ambiente autorizado, com escrita de produção e emissão real desligadas; contador valida a política e os dados fiscais antes do gate de emissão.
5. **Auditoria/freeze da especificação:** varrer contradições entre os três documentos; checar que cada jornada tem telas/campos, origem de evento, regra de estado/erro, fonte e critério de aceite. Registrar itens comerciais que são dados a importar (preços, cestas, endereço/entrega, pagamento) sem reabrir decisões de arquitetura.
6. **Continuidade local:** avançar na branch greenfield e seguir o plano detalhado; o histórico GitHub continua sendo fonte de requisitos e pistas de conexão, não de código para reaproveitar.

Credenciais e ativos reais de Meta/Bling não devem ser inferidos de documentação pública nem reutilizados a partir de código antigo. A auditoria somente leitura encontrou referências seguras no Vault do Supabase legado; os valores não foram lidos nem copiados para estas anotações. O projeto novo ainda não está conectado. A emissão real de NF-e continua com gate contábil separado.

### O que já está suficientemente decidido

- Produto e estrutura das oito áreas do Admin, papéis internos, campos, estados vazios/erro e ações estão especificados nas seções 21–23.
- Meta Cloud API direta, Supabase como fonte oficial, Bling v3 e ANA server-side com ferramentas restritas são o desenho recomendado.
- Cada etapa do Flow trata um componente da cesta, com escolha de produto e quantidade de 0 a 6; pagamento, cadastro/endereço, recálculo no servidor e aceite explícito foram definidos.
- Toda alternativa elegível no Flow precisa da foto individual aprovada, miniatura otimizada e alt text; o teste com a conta Meta é um gate anterior ao Flow comercial.
- Fotos individuais são obrigatórias em todas as alternativas do Flow. A leitura mais recente encontrou 1.928 produtos (todos inativos/`needs_review`), nenhum registro em `product_images`, nenhum bucket e 1.798 imagens ainda pendentes na fila de importação. Hoje nenhuma alternativa pode ser publicada; depois da carga, revalidar o catálogo e bloquear apenas os produtos sem foto aprovada/miniatura. A prova Meta por WABA continua sendo gate técnico antes da publicação comercial.
- Flow e Catálogo Meta sempre criam intenções e pedidos independentes, sem janela de tempo para agrupamento; cada pedido tem confirmação, venda e processo fiscal próprios.
- Estados do pedido, gatilho de saída para Bling, idempotência, tratamento de falha e distinção entre expedição e autorização fiscal estão definidos.
- O destino Supabase e as 19 tabelas originais foram confirmados em leitura somente. Produtos e clientes já têm linhas; as fotos ainda estavam na fila no último baseline. O código greenfield não reaproveita código antigo; o histórico GitHub serve como fonte de requisitos e pistas de conexão.

### Fatos atuais que mudam o plano de conexão

1. `main` do GitHub está vazia e sem proteção de branch; o repositório é público. A branch greenfield `codex/whatsapp-admin-greenfield-20261026` já foi publicada. Nunca gravar segredos, dados reais de cliente ou cópias de `.env` no repositório.
2. O Supabase escolhido está `ACTIVE_HEALTHY`, PostgreSQL 17.11, com duas migrações registradas. A leitura mais recente contou 1.928 produtos (todos inativos/em revisão), 574 clientes, 578 contatos e 336 endereços; 14 tabelas `public` + 5 `app_private`. A fila de fotos ainda está pendente. Reconsultar após a carga e antes de migrações. Não tratar o banco todo como vazio nem sobrescrever essas estruturas.
3. `app_private.integration_accounts` tem duas entradas Meta e uma Bling; todas estão `enabled=false`, `external_writes_enabled=false` e `secret_reference` nula. Os IDs Meta no `safe_config` coincidem com os registros da tabela `public.whatsapp_accounts` do projeto legado: `dona-antonia-0975` → WABA `1497253794754816`, telefone Meta `945659128620084`; `dona-antonia-1018` → WABA `840102181903253`, telefone Meta `1218939807961094`. São WABAs diferentes. Nenhum valor secreto foi lido.
4. O projeto legado `ssbesxgaijknwsjbsbcz` (“Dona Antônia”) permanece `ACTIVE_HEALTHY`, com dados operacionais e Edge Functions ativas; o projeto de destino `wvpzudjujtmyspluwhvx` (“Dona Antônia - NOVO”) foi criado em 26/10/2026 e ainda não tem funções implantadas. No Vault legado existem referências com nomes para as credenciais OAuth do Bling, segredo da aplicação Meta, verificação de saúde do Flow e chave privada do Flow. O refresh token do Bling foi atualizado em 26/10/2026 e `last_oauth_ok_at` no runtime legado registra sucesso às 14:37:11 UTC no mesmo dia. Isso é evidência recente de OAuth funcionando no projeto antigo, não prova de autenticação no destino nem de permissões futuras.
5. O Vault do projeto novo não tem segredos cadastrados. No projeto legado, `public.system_secrets` armazena nomes e hashes de chaves internas, não os valores OAuth da Meta/Bling. O inventário do Vault não mostrou um nome explícito de access token Meta; o código publicado consultado referencia `META_ACCESS_TOKEN`, mas a presença no ambiente de Edge Functions não pode ser lida pelo conector. Os metadados novos confirmam nomes requeridos (`META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_APP_SECRET`, `META_WHATSAPP_VERIFY_TOKEN`) e presença ainda não verificada.
6. As duas árvores históricas inspecionadas do GitHub (`admin-v3-chat-center-20260912` e `admin-v13-nfe-real-20260726`) não têm arquivos `.env`. Nos arquivos selecionados de configuração/integração foram encontrados apenas referências a secrets do GitHub Actions e configuração publicável do Supabase; não foram detectados padrões de tokens Meta, Bling, OpenAI ou service-role literal. O repositório é público e esta foi uma verificação direcionada, não uma varredura forense de todos os blobs de todo o histórico. Nunca assumir ausência global de vazamento com base nesse recorte; qualquer segredo literal encontrado em commit público deve ser revogado/rotacionado.
7. O projeto novo não fornece ainda evidência de conexão autenticada. O connector de Supabase não permite consultar valores de secrets; health checks autenticados devem confirmar Meta por número e Bling sem imprimir ou devolver credenciais.
8. O advisor de segurança mostra 17 tabelas com RLS sem policies (`INFO`, default deny); `anon`/`authenticated` ainda não têm GRANT nas tabelas da API. A policy pública do catálogo não fica utilizável até GRANT explícito. O painel precisa receber GRANTs mínimos e policies explícitas por papel/endpoints, sem SERVICE_ROLE no browser. O advisor de performance aponta 14 índices sem uso, em sua maioria por falta de tráfego/tabelas sem dados, e configuração informativa do Auth; não remover índice sem medir e não é razão para refazer o schema agora.

### Gate 0 — concluído para checkout e migração local

1. **Checkout:** concluído em `osvaldosereia/SUCEDOAN12`, branch `codex/whatsapp-admin-greenfield-20261026`. Nunca commitar `.env`, credencial ou dado real.
2. **Baseline local antes de alterar schema:** leitura da ref `wvpzudjujtmyspluwhvx` concluída; snapshot local resetável e migrations de identidade/catálogo aplicadas apenas na stack local; nenhuma alteração manual de produção.
3. **Base visual:** usar o mapa e wireframes funcionais da seção 27 como limite do MVP. A interface pode ser refinada por tela durante a tarefa 3, com revisão visual antes de ligar dados reais; não é preciso criar um protótipo separado para iniciar o shell.
4. **Ferramentas:** Node 24.22.1, pnpm 11.25.0, Supabase CLI 2.122.0 e Docker local estão configurados. Manter lockfile e separar Local/Preview/Production; Preview não acessa credenciais nem dados de produção.

Catálogo/SKU/preço atual, alternativas das cestas, cobertura/taxa de entrega, pagamentos e cadastro fiscal são dados para preencher antes de ativar compras reais, não para decidir novamente a arquitetura. O plano de execução por tarefa e as interfaces foram acrescentados ao documento separado.

### Gates técnicos para habilitar canais e operação real

- **Meta/Flow:** antes de construir ou publicar o Flow final, validar individualmente as duas WABAs/linhas, webhook e assinatura, token no cofre, catálogo por WABA, templates, criptografia do endpoint e compatibilidade do Flow. Fazer uma prova técnica com a cesta de maior número de componentes, botão de voltar, quantidade 0–6 e retorno dinâmico ao mesmo screen. Se a Meta rejeitar essa navegação ou limite, usar as alternativas sequenciais já definidas na seção 22. Não enviar Flow de produção durante esse teste.
- **Bling:** iniciar em paralelo o cadastro do app de visibilidade pública e confirmar com o suporte/conta o processo de homologação e a etapa de testes de 30 dias descrita no FAQ. Antes de criar vendas reais, validar app OAuth, renovação do token, escopos mínimos, contato/produtos, venda teste e reconciliação de timeout; manter escrita desativada até passar. Antes de NF-e real, contador deve confirmar cadastro fiscal, composição/rateio do combo, CFOP/NCM/regime, frete, pagamento e gatilho de emissão.
- **Dados e cliente:** antes de tráfego real, testar correspondência por identidade Meta com os dois números, evitando mescla por nome; testar cliente sem telefone compartilhado, cliente com dois endereços e coleta/correção do endereço.
- **Segredos:** validar somente presença e funcionamento por health check que retorna sucesso/falha. Procurar os nomes das variáveis nos históricos e cofres autorizados, sem copiar valores de commit. Valor literal em histórico público deve ser considerado comprometido e rotacionado no provedor.

### Decisão de prontidão

**Status: arquitetura e comportamento estão definidos; a implementação greenfield já começou na branch `codex/whatsapp-admin-greenfield-20261026`.** Por decisão mais recente do proprietário, a interface e a base local avançam enquanto gates externos são concluídos. Migrações no Supabase de destino, tráfego Meta, Flow comercial e escrita Bling continuam bloqueados até a validação específica de cada serviço. Não usar o projeto antigo para desenvolvimento nem ativar escrita externa.

## 26. Decisões técnicas de implantação para evitar mudanças no meio

Estas são as decisões recomendadas para a primeira versão; não dependem de uma escolha técnica do usuário. Foram comparadas com a documentação oficial vigente consultada em 26/10/2026.

| Área | Decisão | Motivo/limite |
|---|---|---|
| Aplicação | Next.js App Router + React + TypeScript, versão estável do CLI oficial, pnpm e lockfile; Biome para lint/format | Já é a arquitetura escolhida; rotas, layouts e telas ficam organizados em uma única aplicação. Código greenfield. ESLint do scaffold entrou em conflito de compatibilidade de peers; Biome é opção atual do CLI Next. |
| Componentes | Tailwind CSS e um conjunto pequeno de componentes shadcn/ui acessíveis; personalizar identidade e linguagem para a operação | Evita construir do zero botões, campos, diálogos e menu, sem usar um template administrativo inchado nem copiar telas da Loja Integrada. |
| Hosting web | Vercel para o painel; PRs/branches usam Preview e `main` publica Production | Integração oficial de primeira classe com Next.js e ambientes separados. O domínio final é configuração posterior, não uma decisão de arquitetura. |
| Backend de integração | Supabase Edge Functions em Deno/TypeScript para webhooks Meta/Bling, Flow, envio de mensagens, outbox e ANA | Segredos e operações privilegiadas ficam no servidor Supabase; nenhum token vai ao navegador ou às variáveis `NEXT_PUBLIC_*`. |
| Dados e autenticação | Supabase Postgres/Auth/Storage/Realtime; painel autenticado com `@supabase/ssr` e sessão por cookie; Postgres RLS é autorização final | Autenticação não substitui autorização: policies e GRANTs são por papel/ação, e funções privilegiadas validam o usuário antes de executar. |
| Ambientes | Desenvolvimento local com Node 24.22.1, pnpm 11.25.0 e Docker; Preview não escreve no banco/Meta/Bling de produção; Production usa o projeto `wvpzudjujtmyspluwhvx` | Node e pnpm foram fornecidos pelo runtime do Codex; npm/npx não estão no PATH. Instalar/versionar Supabase CLI quando a tarefa de banco local começar e manter lockfile pnpm. |
| Segredos | Meta, Bling e OpenAI somente em cofre/Edge Function Secrets do projeto novo; navegador recebe somente URL e chave publicável do Supabase | A auditoria consegue listar nomes e metadados do Vault legado, mas não valores nem presença de secrets de runtime das Edge Functions. Migrar por referência aprovada, nunca por arquivo/Git; health check deve devolver presença/validade sem imprimir segredo. |
| Validação automatizada | Vitest para regras TypeScript puras, Deno test para Edge Functions e Playwright para poucos percursos críticos no navegador; SQL/RLS validado em banco local | Mantém cálculo, segurança, eventos repetidos e jornadas principais verificáveis. Nenhum desses testes foi criado ou executado nesta etapa de planejamento. |

O Next.js oficial documenta App Router, TypeScript, Tailwind e os padrões atuais de instalação; a Vercel documenta deploy Next.js e prévias isoladas por branch/PR. Supabase orienta manter segredos no runtime de Edge Functions e usar autenticação/ RLS para autorizar o acesso. As URLs primárias estão na seção 24 e no plano de execução separado.

## 27. Mapa visual de navegação e jornadas

### Navegação global

```mermaid
flowchart LR
    Shell["Admin: menu lateral compacto + cabeçalho da página"]
    Shell --> Overview["Visão geral"]
    Shell --> Inbox["Atendimento"]
    Shell --> Orders["Pedidos"]
    Shell --> Baskets["Cestas"]
    Shell --> Products["Produtos"]
    Shell --> Customers["Clientes"]
    Shell --> Ana["ANA"]
    Shell --> Settings["Configurações"]
    Inbox --> Context["Conversa + cliente + pedido no mesmo contexto"]
    Orders --> Stages["NOVO → PRODUÇÃO → EXPEDIÇÃO → ENTREGUE"]
    Baskets --> Slots["Componente → alternativas → quantidade 0–6"]
```

### Rascunho visual das telas

| Área | Arranjo simples de tela | Ação primária |
|---|---|---|
| Visão geral | “Precisa de atenção” primeiro; conversas sem resposta, pedidos NOVO e falhas de integração em lista curta; poucos atalhos | Abrir próximo item de trabalho |
| Atendimento | Lista de conversas à esquerda; conversa e caixa de resposta no centro; cliente, endereços, pedidos e ANA no contexto à direita; número/WABA visível no topo | Responder ou assumir conversa |
| Pedidos | Quadro por quatro estados físicos; filtros de período, origem e canal; detalhe lateral com itens, endereço, aceite, pagamento, trilha e estado fiscal separado | Avançar uma etapa ou abrir pendência |
| Cestas | Lista de modelos; editor em blocos com slots ordenáveis, opção padrão, alternativas, preço, quantidade permitida e preview do total; extra interno restrito | Salvar rascunho ou publicar nova versão |
| Produtos | Busca/filtros e tabela curta com nome, SKU, venda, disponibilidade e sincronização Meta/Bling; edição em formulário simples | Salvar e sincronizar produto aprovado |
| Clientes | Busca por nome/telefone/identidade Meta; cadastro, endereços e histórico em um detalhe contínuo; identidades de canal sem mescla automática | Corrigir dados ou abrir conversa/pedido |
| ANA | Três blocos: identidade/voz, como atende, limites/transferência; simulador ao lado ou abaixo; estado de publicação visível | Simular e publicar configuração |
| Configurações | Equipe/permissões, duas linhas WhatsApp em cartões separados, integrações, pagamento/entrega, operação e privacidade; segredo sempre mascarado | Corrigir configuração ou executar health check |

Em desktop, a caixa de resposta e as ações principais permanecem visíveis; em telas estreitas, as colunas viram uma lista de painéis sem esconder o botão principal. Cor nunca é o único indicador de status. Tabelas priorizam busca e filtros curtos; formulários seguem blocos com rótulo e ajuda breve.

### Jornada da cesta no Flow

```mermaid
flowchart TD
    A["Abrir Flow da cesta publicada"] --> B["Um componente por tela"]
    B --> C["Escolher alternativa e quantidade 0–6"]
    C --> D["Próximo salva e recalcula no servidor"]
    D -->|"Outro componente"| B
    D -->|"Último"| E["Escolher forma de pagamento"]
    E --> F{"Identidade Meta localizada?"}
    F -->|"Sim"| G["Confirmar ou escolher endereço"]
    F -->|"Não"| H["Cadastrar nome e endereço"]
    G --> I["Concluir escolhas no Flow"]
    H --> I
    I --> J["Enviar resumo no WhatsApp: itens, quantidades e total, sem preço individual"]
    J --> K{"Cliente confirma este resumo?"}
    K -->|"Sim, revisão válida"| L["Criar 1 pedido em PRODUÇÃO / Separação"]
    K -->|"Cotação/dado mudou"| M["Manter rascunho, corrigir e pedir novo aceite"]
    K -->|"Não"| N["Manter rascunho; não criar pedido"]
```

### Jornada do carrinho de Catálogo

```mermaid
flowchart LR
    Cart["Cliente envia carrinho da Meta"] --> Draft["Criar rascunho independente"]
    Draft --> Resolve["Resolver itens e identidade do cliente"]
    Resolve --> Summary["Enviar resumo próprio e total"]
    Summary --> Accept{"Aceite explícito"}
    Accept -->|"Revisão válida"| Order["Pedido independente no Admin → PRODUÇÃO"]
    Accept -->|"Dado/preço mudou"| New["Manter rascunho e pedir correção/novo aceite"]
    Flow["Flow da cesta na mesma conversa"] -. "sempre outro pedido" .-> Draft
```

O mapa é um wireframe funcional, não uma imagem de produção: ele fixa hierarquia, sequência e ação primária para orientar o protótipo visual e evitar que componentes de UI sejam escolhidos no meio da implementação.

## 28. Inventário seguro de conexões — GitHub e Supabase

**Leitura realizada em 26/10/2026.** Foram consultados metadados dos projetos Supabase, nomes/metadados do Vault (sem campos de valor secreto), registros de integração e conta WhatsApp. No GitHub foram lidas duas árvores históricas e um conjunto direcionado de arquivos de configuração, workflow e integração. Nenhum segredo foi copiado para a saída ou para este caderno; nenhum registro foi alterado.

### Projetos e linhas WhatsApp

| Papel | Projeto | Estado observado | Uso definido |
|---|---|---|---|
| Destino | `wvpzudjujtmyspluwhvx` — “Dona Antônia - NOVO” | `ACTIVE_HEALTHY`, São Paulo, PostgreSQL 17.11; 3 contas de integração desligadas, sem `secret_reference`; sem funções Edge implantadas; Vault sem entradas | Único banco do sistema novo. Usar `app_private.integration_accounts` já existente; não sobrescrever. |
| Origem histórica | `ssbesxgaijknwsjbsbcz` — “Dona Antônia” | `ACTIVE_HEALTHY`, São Paulo, PostgreSQL 17.6; dados operacionais e muitas Edge Functions implantadas; Vault com referências nomeadas | Consultar apenas como fonte de requisitos e mapa de referências; não programar nele, não alterar, não chamar operações com escrita e não copiar seu código. |

As duas entradas Meta do destino coincidem com a tabela histórica `public.whatsapp_accounts`:

| `account_ref` | Identificação operacional histórica | WABA | `phone_number_id` | Situação no destino |
|---|---|---:|---:|---|
| `dona-antonia-0975` | Dona Antônia Atendimento 0975 | `1497253794754816` | `945659128620084` | `credentials_pending`; disabled; sem secret reference |
| `dona-antonia-1018` | Dona Antônia Cestas e Supermercado | `840102181903253` | `1218939807961094` | `credentials_pending`; disabled; sem secret reference |

Os números permanecem em WABAs diferentes. Todas as três conexões do destino (`meta/0975`, `meta/1018`, `bling/primary`) têm `enabled=false` e `external_writes_enabled=false`. Os IDs conferem com o projeto de origem, mas isso não autentica as conexões.

Uma primeira leitura histórica registrou zero produtos enquanto a carga estava em andamento; essa contagem foi superada pela consulta de baseline read-only posterior, descrita abaixo, que encontrou 1.928 produtos. Usar sempre o baseline posterior datado e repetir contagens imediatamente antes de qualquer migração remota.

### Nomes encontrados no Vault legado

| Integração | Nome da referência | O que indica | O que ainda precisa ser provado |
|---|---|---|---|
| Bling | `bling_api_client_id_v1` | Referência de client ID OAuth | App/conta e escopos corretos; resposta de leitura autenticada no novo runtime |
| Bling | `bling_api_client_secret_v1` | Referência de client secret OAuth | Vínculo com o client ID e validade; não expor nem copiar para Git |
| Bling | `bling_api_refresh_token_v1` | Referência do refresh token | Atualizado em 26/10/2026; OAuth passou no runtime legado na mesma hora aproximada. Validar separadamente no novo runtime e manter apenas um renovador ativo durante o cutover |
| Meta | `dona_antonia_meta_app_secret_v1` | Candidato a segredo do app WhatsApp | Confirmar App ID associado aos dois WABAs e usar apenas para assinatura/webhook conforme contrato |
| Meta | `dona_antonia_whatsapp_flow_health_verify_token_v1` | Referência de verificação de saúde do Flow | Confirmar callback/Flow ao qual pertence; não confundir com o token de verificação do webhook |
| Meta | `dona_antonia_whatsapp_flow_private_key_v1` | Referência de chave privada para Flow criptografado | Confirmar Flow e chave pública cadastrada em cada configuração |

Também existe `dona_antonia_marketing_meta_app_secret_v1`, aparentemente associada a Meta Marketing. Não a atribuir ao WhatsApp sem verificar o App ID. O inventário não mostrou nome explícito de access token Meta no Vault. O webhook Meta legado cita `META_ACCESS_TOKEN`/`META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_APP_SECRET` e `META_WHATSAPP_VERIFY_TOKEN`; a presença dos tokens de runtime não pode ser lida pelo conector. A função atualmente implantada `whatsapp-1018-basket-flow-v1` (ACTIVE, v7) cita `DA_FLOW_1018_RSA_PKCS8` e `META_WHATSAPP_APP_SECRET`, deriva a chave de sessão e não usa `DA_FLOW_1018_SESSION_SECRET`. Isso confirma o contrato de código do Flow antigo 1018, não a presença/validade dos segredos nem cobertura do 0975. O destino registra nomes globais candidatos (`META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_APP_SECRET`, `META_WHATSAPP_VERIFY_TOKEN`), mas a solução deve armazenar a configuração por `account_ref`: token de acesso escolhido para a linha certa; segredo de app e verify token compartilhados somente após provar que o App/callback é comum; chave RSA Flow ligada ao Flow/número que a usa. Não presumir que um token ou uma chave serve aos dois WABAs.

As Edge Functions antigas consultadas citam nomes divergentes para token Meta (`META_ACCESS_TOKEN` e `META_WHATSAPP_ACCESS_TOKEN`) e para segredo/verificação (`META_WHATSAPP_APP_SECRET`, `META_WHATSAPP_VERIFY_TOKEN`). Isso indica aliases e possíveis gerações diferentes de runtime, não presença comprovada desses valores. A migração deve normalizar nomes e escopos no destino sem copiar valores do ambiente antigo.

O projeto legado também contém `dona_antonia_bling_hub_key_v2` e outras chaves internas/de automação. Elas não são credenciais OAuth e ficam fora do conjunto da nova aplicação, a menos que uma dependência funcional documentada prove o contrário. A tabela `public.system_secrets` do legado tem somente `key_name`, `key_hash` e estado de ativação; ela é um registro de hashes de chaves internas, não uma fonte de valores OAuth Meta/Bling. O Vault do projeto novo estava vazio no momento da consulta.

No runtime `public.bling_hub_runtime_v2` do projeto legado, `mode=live` e hub/produtos/estoque/clientes/pedidos/webhooks estão habilitados; `fiscal_enabled=false`, `write_canary_limit=1`, e a última checagem OAuth passou às 14:37:11 UTC de 26/10/2026. A última checagem read-only de API registrada é de 03/10/2026. Não executar a canary nem alterar flags: usar isto somente como evidência de que a conexão antiga foi verificada recentemente; a integração nova continua pendente.

### Busca direcionada no GitHub público

- [Ref `admin-v3-chat-center-20260912`](https://github.com/osvaldosereia/SUCEDOAN12/tree/admin-v3-chat-center-20260912): árvore completa consultada (9.041 caminhos); nenhum arquivo `.env`/`.env.*` no snapshot. [Ref `admin-v13-nfe-real-20260726`](https://github.com/osvaldosereia/SUCEDOAN12/tree/admin-v13-nfe-real-20260726): árvore completa (5.961 caminhos); nenhum arquivo `.env`/`.env.*` no snapshot.
- Nos arquivos direcionados `admin/config.js`, `admin-v3/config.js`, workflows de autorização/escrita Bling e fontes selecionadas de Flow/pedidos/produtos, apareceram referências a variáveis do GitHub Actions (incluindo client/refresh Bling e service role), não os valores. As configurações de frontend têm somente URL/chave publicável Supabase, que é configuração client-side pública e aponta ao projeto legado. O marcador de build de uma configuração antiga identifica uma variante “no-auth”; ela não deve servir de padrão de autenticação ou ser reutilizada. Não foi encontrado padrão literal de token Meta, Bling, OpenAI, JWT privado ou service-role nos arquivos selecionados.
- Essa verificação é direcionada a duas refs e alguns arquivos, não varredura forense de cada commit/blob. Como o repositório é público, qualquer segredo literal achado em qualquer ponto do histórico é considerado comprometido e deve ser revogado/rotacionado no provedor. Não reutilizar o frontend antigo, a chave client-side antiga, workflows nem código de integração.

### Comparação do histórico com o protocolo oficial da Meta — 26/10/2026

| Tema | Evidência oficial atual consultada | O que o histórico `sucedoan12` fazia/mostrou | Decisão para o produto novo |
|---|---|---|---|
| Correlação da sessão | O exemplo mantido pela Meta cria um `flow_token` aleatório ao enviar o Flow; o webhook educativo lê `interactive.nfm_reply.response_json`. | Commit de 24/10 derivou chave HMAC de sessão de `META_WHATSAPP_APP_SECRET` e removeu `DA_FLOW_1018_SESSION_SECRET`. | **Não adotar a derivação.** Gerar token aleatório por sessão e guardar hash + vínculo de rascunho/linha/identidade. Tratar o token apenas como correlator, nunca como autenticação. Verificar no spike o eco no `nfm_reply` em ambas WABAs antes de depender dele no checkout. |
| Criptografia Data Exchange | O exemplo oficial de endpoint da Meta recebe `encrypted_aes_key`, `encrypted_flow_data` e `initial_vector`; usa RSA-OAEP/SHA-256 e AES-GCM, e cifra a resposta para o Flow. | O runtime legado 1018 usava função própria de endpoint e convenção de segredos específica; o fato de uma versão estar ativa não prova conformidade completa nem compatibilidade com a segunda WABA. | Implementar o contrato de criptografia da Meta com biblioteca revisada/testes vetoriais. Manter RSA privada em segredo do servidor e registrar/publicar a chave pública conforme processo Meta de cada conta/Flow. Não copiar helpers legados nem o exemplo didático sem revisão. |
| Esquema de ações | Cada ação Flow precisa respeitar o schema/roteamento publicado e o contrato efetivamente aceito pelo Flow Validator. A API oficial oferece `validation_errors`, `health_status`, `json_version` e `data_api_version` no recurso Flow. | Commit de 25/10 corrigiu payload `navegar_tipo`: `indice` era enviado como string sem declaração no schema. Outro commit corrigiu rota/IDs de tela de uma implementação particular. | Gerar schema e ações a partir de uma única definição tipada; validar tipos, screen IDs, routing e payload. Consultar validação e saúde do Flow no recurso da Meta por WABA/versão antes de enviar. Não fixar como regra global os limites observados num JSON histórico. |
| Fotos das alternativas | A referência oficial de [componentes Flow](https://developers.facebook.com/docs/whatsapp/flows/reference/components) é a fonte de suporte por componente/versão. A página oficial respondeu HTTP 429 nesta consulta; portanto, o suporte e os limites exatos devem ser reconfirmados no documento acessível e no validador da conta. | O banco legado tinha imagens nas 118/118 linhas de produto associadas às cestas ativas; a função 1018 tem helpers de imagem/Base64, mas isso não demonstra que cada alternativa foi renderizada com foto em cada tela/aparelho. | Manter como requisito do proprietário: **todas as alternativas exibem foto do produto**. Provar payload `data-source`, campo da imagem, `alt-text`, limite total e renderização real no Android/iOS em ambas WABAs. Se o validador não aceitar, bloquear a publicação comercial; não retirar fotos nem trocar silenciosamente por miniatura genérica. |
| Estado/tempo de resposta | O contrato de Data Exchange precisa responder dentro dos prazos Meta aplicáveis; Flow API permite consultar saúde e erros de validação. | Commit de 25/10 consolidou leituras e limitou espera de imagens depois de resposta lenta. | Miniaturas pré-geradas/cacheadas; sem busca de mídia externa no caminho síncrono. Medir p95 e testar indisponibilidade/timeouts com fallback no chat. Confirmar prazo numérico na documentação Meta vigente antes de transformar em constante. |
| Publicação | A coleção oficial Postman expõe criação/upload/publicação e consulta de validação/saúde; alterações publicadas exigem versionamento/novo Flow conforme o estado da API. | O histórico teve mudanças de rota/IDs e um fundamento dinâmico indicado como não implantado em pelo menos uma alteração. | Pipeline gera artefato reprodutível, envia primeiro como rascunho, consulta erros/saúde e testa em aparelhos internos. Publicação requer aprovação explícita do responsável e rollout por WABA. |

**Força das fontes:** documentação e workspace Postman da Meta, mais exemplos publicados no repositório `WhatsApp/WhatsApp-Flows-Tools` mantido pela Meta, são a referência de contrato; exemplos são didáticos, não código de produção pronto. O código e commits do `SUCEDOAN12` são evidência histórica de requisitos, bugs e tentativas, não autoridade sobre o protocolo. A validação da API/health check da Meta em cada WABA e o teste real do cliente decidem comportamento que dependa de versão, conta ou aparelho. Nesta rodada a página de componentes Meta limitou acesso (HTTP 429), então limites de imagens/tamanho/versões ficam **pendentes de reconfirmação** e não devem ser usados como constantes de implementação até o Gate do Flow.

### Decisões úteis em commits recentes — aplicar como requisitos, não copiar código

- [Simplificação dos segredos Flow (24/10)](https://github.com/osvaldosereia/SUCEDOAN12/commit/1bb6bc4f6e54d1f787304146b333f8ace470e667): o histórico derivou uma chave HMAC de sessão do `META_WHATSAPP_APP_SECRET` e removeu `DA_FLOW_1018_SESSION_SECRET`; a função implantada 1018 confirma nomes de configuração, não conformidade oficial nem validade de credenciais. **Decisão revisada após confronto com a amostra oficial Meta:** não reproduzir essa chave derivada. Usar o `flow_token` aleatório de correlação e a criptografia RSA/AES-GCM do protocolo; validar o App Secret no fluxo de assinatura do webhook, sem o reaproveitar para assinar estado interno.
- [Contrato de payload do Flow V2 (25/10)](https://github.com/osvaldosereia/SUCEDOAN12/commit/74180257cfcee7b985611ccfa1e4aa9791fab665): um item dinâmico falhava porque a ação `navegar_tipo` enviava `indice` como string sem declarar esse campo no schema do payload. Regra para o novo Flow: gerar e validar o schema e os dados de cada ação juntos; não assumir que um identificador enviado pelo JSON será aceito pelo Flow.
- [Tempo de resposta do Flow (25/10)](https://github.com/osvaldosereia/SUCEDOAN12/commit/b232dbc1f6d178fc7059b1fae51a0fd33c323309): o histórico precisou consolidar leituras de configuração/cotação e limitar espera por imagens. Para o produto novo, cachear miniaturas aprovadas, definir limite de espera menor que o prazo oficial Meta vigente e devolver erro recuperável/fallback no chat; não aguardar download de mídia sem prazo dentro do Data Exchange.
- [Roteamento do Flow 1018 (24/10)](https://github.com/osvaldosereia/SUCEDOAN12/commit/8588e313c1387e2263c5131074eebb900802d877): o histórico corrigiu rotas e IDs de telas de um Flow específico após validação. Não codificar limites desse JSON como regra global; o validador efetivo de cada WABA continua sendo a fonte final, conforme §22.5.
- [Reconexão OAuth Bling (17/10)](https://github.com/osvaldosereia/SUCEDOAN12/commit/96c1314738b6704c7128d7377884bccbe6b08f5e): uma expiração de OAuth deve aparecer como “Reconectar Bling”, preservar o último estado confirmado e interromper automações dependentes até a reconexão; não interpretar expiração como lista vazia ou falha de cadastro.

### Procedimento de cutover decidido

1. Manter o projeto legado e as credenciais que nele existem intactos enquanto a nova integração está desligada. Não copiar valores para GitHub, código, issue, log, planilha ou este caderno.
2. Confirmar a presença do access token Meta no runtime antigo por uma prova de saúde sem imprimir valor; validar separadamente envio/retorno e webhook para cada `phone_number_id`. Se a origem não permitir confirmar o token, emitir um token novo no fluxo oficial da Meta e armazená-lo no destino; não tentar extrair de código histórico.
3. No destino, criar secret references separadas por integração/conta e preencher os secrets por ferramenta segura de gerenciamento. A UI de saúde retorna só `connected/disconnected`, escopos mínimos, horário e próximo passo — jamais token ou headers.
4. Bling: preservar o único escritor de OAuth enquanto o refresh token atual está ativo. Fazer cutover coordenado para um renovador do destino, testar uma chamada somente leitura e reconciliar sucesso; não executar dois renovadores em paralelo.
5. Habilitar `enabled` primeiro após health check; manter `external_writes_enabled=false` até aprovação de pedidos teste, venda/nota em homologação e gate contábil.

Esse procedimento preserva conexões válidas sem transformar o histórico de código em cofre e reduz risco de token inválido, mistura de WABA ou refresh-token revogado.

## Baseline read-only do Supabase destino — 26/10/2026

Consultado o projeto **Dona Antônia - NOVO**, referência `wvpzudjujtmyspluwhvx`, região `sa-east-1`, estado `ACTIVE_HEALTHY`, Postgres 17.11.0.003. Foram listados schema/colunas/contagens, migrations, policies/grants, buckets, contagem de usuários Auth, agregados não identificáveis e apenas flags de integração. Nenhuma linha de cliente, endereço, produto, token ou `secret_reference` foi aberta; nenhuma escrita ocorreu.

- Existem 19 tabelas entre `public` e `app_private`, todas com RLS ligada; migrations registradas: `initial_dona_antonia_clean_schema` e `stage_legacy_product_images_for_safe_copy`.
- `public.products`: 1.928 linhas; todas `active=false` e `review_status=needs_review`. Nenhum produto está pronto para publicação ou venda. Não exibir custo (`cost_cents`) em nenhuma tela/canal.
- Fotos ainda não chegaram ao storage do projeto: `public.product_images` tem 0 linhas, nenhum bucket foi encontrado e `app_private.image_import_queue` tem 1.798 linhas, todas `pending`. O requisito de foto em cada alternativa Flow permanece bloqueado por dados reais.
- Cadastros atuais: 574 clientes, 578 contatos e 336 endereços; somente contagens foram lidas. Os dados precisam ser protegidos por sessão e RLS; não copiar/seedar essas linhas em fixtures.
- Ainda não há equipe habilitada no destino: `auth.users` e `public.staff_profiles` têm 0 linhas. A tela de Admin não pode abrir como se estivesse autenticada até convite/criação explícita de funcionário e associação de papel.
- Há 2 linhas de configuração Meta e 1 Bling; as três estão `enabled=false` e `external_writes_enabled=false`. Isso confirma flags de segurança, não validade de tokens ou health check. Os valores e referências de segredo não foram consultados.
- RLS está ligada nas 19 tabelas. Existem somente duas policies: leitura pública de produtos aprovados e imagens de produtos públicos. Os outros 17 achados do Advisor são `INFO` “RLS Enabled No Policy”: o bloqueio é fail-closed, mas impede o painel autenticado de operar até que migrações locais definam políticas de staff/roles revisadas. O grants visível às APIs é somente `service_role`; não colocar essa chave no navegador.
- Não abrir migração de produção agora. Antes de montar o baseline local, exportar/inspecionar definições atuais de funções, constraints, triggers, grants e conteúdo das migrations por método seguro; repetir as contagens após a fila de fotos ser processada. A UI pode avançar, mas leitura/admin real depende de Auth e policies funcionais.

## Decisão de sessão e autorização inicial — 26/10/2026

### Fluxo implementado no app greenfield

1. `/login` oferece somente email/senha para funcionário; não existe cadastro público nem recuperação/convite automático. A tela fica desabilitada enquanto faltam `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
2. Browser e servidor criam clientes separados por `@supabase/ssr`; o navegador recebe apenas URL e chave publicável. A chave `service_role`, tokens Meta/Bling, OpenAI e chave privada Flow nunca entram em bundle ou cookie.
3. Em cada requisição, `src/proxy.ts` usa `auth.getClaims()` pelo cliente SSR para validar/atualizar sessão e devolver cookies novos. O layout `(admin)` chama `requireStaff()` no servidor, obtém `sub` dos claims verificados e consulta `staff_profiles` por `user_id` usando a sessão do funcionário.
4. O Admin só renderiza se consulta não falhou, perfil existe, `enabled=true` e `role` está na allowlist `owner | admin | catalog_manager | fulfillment`. Ausência de env, sessão, grants, policy ou perfil termina em redirect; a proteção fecha por padrão.
5. O botão “Sair” chama `auth.signOut()`, redireciona para `/login` e atualiza a árvore. Nenhum convite, criação de usuário ou escrita foi feito no Auth do destino.

Na migration local `20261027012902_staff_profile_self_read`, `authenticated` recebe somente `SELECT` em `staff_profiles`, protegido por `user_id = (select auth.uid())`. Não pode listar outros funcionários, alterar papel ou consultar clientes; provisionamento continua manual.

O login não usa o parâmetro `searchParams` para mensagens diferenciadas. O primeiro smoke em desenvolvimento mostrou que essa leitura fora de Suspense gera erro de runtime com Cache Components; a interface foi simplificada para texto genérico e a tela passou a ser pré-renderizável. Isso também evita revelar se um email tem conta/perfil.

### Matriz de acesso escolhida para migração local

| Área/dado | owner | admin | catalog_manager | fulfillment |
|---|---|---|---|---|
| Visão geral | tudo operacional | tudo operacional | resumo de produtos/cestas | fila operacional de produção/expedição |
| Atendimento, mensagens, notas e clientes | ler/escrever | ler/escrever | sem inbox nem lista de clientes | somente contato/endereço necessário ao pedido permitido |
| Pedidos | ler/alterar todos | ler/alterar todos | sem acesso | ler todos os campos de separação/expedição necessários e avançar somente estados operacionais autorizados |
| Produtos, fotos e cestas | administrar | administrar | administrar catálogo/cestas e fotos; sem custo/margem fora da função financeira autorizada | sem acesso de edição |
| ANA | configurar e operar | configurar e operar | sem configuração | sem configuração |
| Configurações e conexões | administrar integração/equipe; único papel que pode habilitar escrita externa | operar integrações sem revelar secrets; sem provisionar owner/elevar próprio papel | sem acesso | sem acesso |
| Segredos, tokens, referência privada e margem | nenhuma leitura de valor de segredo; margem somente pela RPC autorizada | idem | somente margem se a RPC financeira atualizada permitir | sem acesso |

Regras de enforcement:

- Sidebar condicional melhora a navegação, mas **não autoriza**. Cada ação de servidor/RPC valida papel e ownership; Postgres GRANT+RLS é a barreira final para dados acessados com sessão de funcionário.
- O papel `fulfillment` não ganha acesso à lista `customers`; dados de entrega podem ser projetados dentro do pedido sob policy/consulta estrita. Não exigir atribuição de pedido no MVP sem necessidade operacional.
- `owner` é o único que provisiona/promove equipe e liga/desliga `external_writes_enabled`. `admin` faz operação e gerencia configuração sem ver segredo bruto ou promover usuário para owner.
- `catalog_manager` altera nome, preço comercial, status, SKU/identificadores e fotos; custo e ajuste interno continuam privados e nunca chegam a Flow, ANA ou cliente.
- Mudanças de status de pedido recebem policy específica de transição; não conceder UPDATE geral que permita fulfillment mudar aceite, pagamento, venda Bling ou estado fiscal.
- `anon` só recebe leitura explicitamente limitada ao catálogo aprovado, se o contrato de exibição pública realmente usar o banco; canais WhatsApp/Flow acessam dados comerciais via funções de servidor privilegiadas com DTO de saída mínimo.
- Toda tabela nova começa sem grants a `anon`/`authenticated`; a migração deve adicionar privilégios específicos, índices de `auth.uid()` e testes pgTAP de acesso permitido/negado. `app_private` nunca é schema de API.

O destino atual tem 0 usuários e 0 perfis; nenhuma escrita foi feita nele. No ambiente local, o snapshot começou sem linhas comerciais; migrations locais de identidade e catálogo evoluíram o schema. O reset final confirmou 19 tabelas públicas + 7 privadas (26 com RLS), 132 constraints, 73 índices, 35 policies públicas e seis triggers de negócio. Custos não ficam em `public.products`, `authenticated` não lê tabela financeira diretamente, RPC financeira não executa como `anon`, e `service_role` conserva acesso de servidor. Isso ainda não valida login com funcionário real, Flow/Meta nem a jornada completa de dados.

Fontes de implementação: [Next.js Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy), [Next.js Cache Components e Suspense](https://nextjs.org/docs/app/getting-started/partial-prerendering), [Supabase SSR no Next.js](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs), [Supabase: escolher pacote de Auth](https://supabase.com/docs/guides/auth/choosing-a-server-package). A documentação oficial direciona o uso do proxy e das claims verificadas; não substitui policies/grants Postgres.

### Desenvolvimento Supabase local — 26/10/2026

- Supabase CLI `2.122.0`, Docker Engine `29.9.2`; Postgres local `17.11.0.006`, enquanto o destino reportou `17.11.0.003`. O CLI local ainda não possui token do Management API; leituras remotas permanecem no conector MCP read-only.
- `supabase/config.toml` mantém `api.auto_expose_new_tables=false`, expõe somente `public`, desliga signup geral e por email e seeds, e usa major PostgreSQL 17. O endpoint local de Auth confirmou `disable_signup=true`. Não criar fixtures com registros reais; verificações futuras usam dados sintéticos isolados em transação.
- No Windows desta máquina, Vector tentava acessar a API do daemon Docker em TCP `2375`, que não está habilitada. O comando `pnpm supabase:start` exclui `logflare` e `vector`; Postgres, Auth, REST, Storage, Realtime, Studio e Edge Runtime permaneceram saudáveis. Não abrir acesso TCP ao Docker só para habilitar logs locais.
- O changelog Supabase de outubro de 2026 registra desativação de parte dos ciphers TLS 1.2 em 10/11/2026 e observações no Postgres 17.11 para índices `ltree`/`btree_gist` e dados cifrados com ciphers legados. O destino não tem `ltree` nem `btree_gist`; possui `pgcrypto 1.3`. Inspecionar dependências e colunas que usem pgcrypto antes de concluir o impacto; não reindexar/recifrar por presunção.
- O histórico da PR #1422 contém um antigo `db/001_schema.sql` marcado para não aplicar em produção, criando um schema experimental `da_next`; o patch consultado mostra o arquivo sendo removido. Ele não descreve o destino atual e não entra no baseline novo.
- Snapshot local resetável começa com o catálogo read-only do destino (19 tabelas) e aplica migrations locais de staff, identidade e catálogo. Estado corrente: 19 tabelas `public`/169 colunas e 7 `app_private`/44 colunas; 26 tabelas com RLS; 132 constraints, 73 índices, 35 policies e seis triggers de negócio. Não há cópia de linha comercial ou valor de integração. Esse schema é somente para desenvolvimento local e não foi reconciliado/aplicado no destino.
- Descoberta de segurança: no destino, defaults de objetos `public` concedem amplos privilégios a `anon`/`authenticated`, embora as tabelas atuais não deem esses privilégios. O snapshot local revoga esses defaults para objetos futuros criados por `postgres`; novos acessos devem conceder apenas permissões específicas com RLS.
- As migrations remotas listadas são `20261026230047_initial_dona_antonia_clean_schema` e `20261027003330_stage_legacy_product_images_for_safe_copy`. O snapshot foi criado somente para desenvolvimento local após reset bem-sucedido; não substitui nem reconcilia essas versões e não deve ser enviado ao banco de produção. O CLI segue sem token do Management API; nenhuma migration, configuração, policy ou dado foi escrito remotamente.

### Modelo local implementado de catálogo e cestas — 26/10/2026

Esta seção registra o contrato de banco que a interface, o Flow e o cálculo de preço devem seguir; não autoriza aplicar as migrations no Supabase de destino.

#### Produtos e imagens

- `products.price_cents` é o preço avulso usado para o Catálogo nativo da Meta e para pedidos de itens avulsos. O custo de aquisição foi copiado para `app_private.product_financials.cost_cents` e removido de `public.products`; não pode voltar a ser consultado por `authenticated` nem aparecer em resposta ao cliente.
- `product_images.storage_path` conserva o original. `flow_thumbnail_path` aponta para a variante pré-gerada que o servidor converte no formato aceito pelo Flow. Toda imagem marcada `verified=true` precisa de miniatura e `alt_text`; a constraint entra `NOT VALID` para não bloquear mídia preexistente, mas se aplica a novas gravações. A prova do Flow e a revisão das imagens continuam gates antes de publicar.
- `meta_catalog_listings` mapeia produto local a `waba_id + catalog_id + product_retailer_id`, com status/erro de sincronização. A unicidade é por catálogo e WABA; SKU, GTIN e ID do Bling não são tratados como `product_retailer_id`.

#### Cesta editável e publicação

- `basket_templates` identifica a cesta. Seu `price_cents` permanece apenas para compatibilidade; telas, Flow e novos pedidos não usam esse valor fixo.
- `basket_template_versions` registra número, estado `draft | published | retired`, mínimo de slots preenchidos e auditoria da publicação. Só pode existir uma versão publicada por modelo. Publicar valida opções, produto ativo/aprovado e imagem; publicar direto por INSERT é bloqueado. Para mudar composição ou preço depois da publicação, duplicar para nova draft.
- `basket_components` é um slot e corresponde a uma tela do Flow: `component_key`, rótulo, ordem e quantidades inteiras 0–6. Todos os slots oferecem 0; a cesta como um todo exige ao menos um slot positivo. A quantidade começa sem seleção.
- `basket_component_options` lista alternativas ordenadas para o slot e guarda `price_cents` comercial por unidade na versão. Se a quantidade for 1–6, o cliente também escolhe uma alternativa. A cesta usa esse preço versionado, não o preço avulso de `products`; por isso uma troca de preço de avulso não altera uma sessão ou versão de cesta já publicada.
- `app_private.basket_version_financials.internal_extra_cents` é o ajuste interno somado uma vez ao total da cesta. Custo e ajuste ficam fora do schema acessível ao cliente. A equipe autorizada consulta/edita esses números por RPCs de Admin, validando papel ativo; não recebe grants diretos às tabelas privadas.
- A fórmula do Flow é `extra interno da versão + Σ(quantidade × preço comercial da alternativa)`. Cada avanço recalcula no servidor. A submissão não aceita preço/total do telefone como autoridade. O resumo final enviado no WhatsApp contém nomes, quantidades, pagamento, endereço aplicável e total, sem preço individual; só o Flow apresenta o preço de cada alternativa, conforme a escolha indicada pelo proprietário.
- Guardas impedem editar versões publicadas/retiradas e suas alternativas, alterar o ajuste interno, retirar a última foto Flow apta ou despublicar/rejeitar um produto usado por uma cesta publicada. Primeiro deve-se retirar a versão; depois criar uma versão nova. Mudança de produto ou foto nunca reescreve uma venda já aceita.

#### Acesso e estado da execução

- `app_private.current_staff_role()` retorna somente o papel do próprio usuário autenticado com perfil habilitado. CRUD das tabelas de catálogo recebe policies separadas para `owner`, `admin` e `catalog_manager`; `fulfillment`, usuário sem perfil e `anon` não ganham edição de catálogo.
- `public.admin_get_product_cost`, `admin_set_product_cost`, `admin_get_basket_internal_extra` e `admin_set_basket_internal_extra` são RPCs de equipe com validação fail-closed. Chamada sem perfil ativo ou fora dos papéis permitidos é recusada. As tabelas privadas continuam acessíveis diretamente apenas a `service_role`.
- Migration `20261027014008_catalog_basket_foundation.sql` aplica depois das migrations locais de snapshot e identidade. O reset local confirmou 19 tabelas públicas, 7 privadas, RLS nas 26, 35 policies públicas, seis triggers de negócio, sem coluna pública de custo, sem leitura direta de custo por `authenticated` e sem execução anônima da RPC financeira. O destino permanece sem escrita.
- Ainda não há linhas locais de produtos/imagens ou cesta. A migration não valida que cada fotografia real esteja presente nem prova que a Meta renderiza o campo de imagem; só cria o contrato e bloqueia publicação incompleta. O teste Flow com foto segue pendente por WABA.
