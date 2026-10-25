# Plano de programação — Admin WhatsApp, cestas e pedidos

Projeto: WhatsApp Atendimento GitHub — SUCEDOAN12  
Branch isolada: project/whatsapp-atendimento-github-20261025  
Diretório futuro do código: projetos/whatsapp-atendimento-github/  
Data: 25/10/2026  
Responsável de execução previsto: Work Luna Max  
Estado: pesquisa e planejamento concluídos; código e carga de imagens ainda não iniciados.

## 1. Objetivo do projeto

Criar um Admin simples para operar o atendimento de pedidos de cestas pelo WhatsApp nos dois números da Dona Antônia. O Admin deve permitir:

- manter no GitHub somente os produtos e as cestas usados pelo atendimento de cestas;
- editar produtos e imagens;
- montar tamanhos, tipos de produto, quantidades, alternativas de marcas, ordem, remoção e limites;
- configurar e acompanhar o WhatsApp Flow por número;
- consultar cliente/endereço no Supabase pelo backend;
- enviar um resumo do pedido no WhatsApp e criar o pedido somente após a confirmação do cliente;
- receber pedidos no Admin, separar itens, tratar a emissão da NF-e no Bling e levar o pedido até Concluído.

A pesquisa técnica completa para Meta/Flow está em FLOW-RESEARCH.md e BASKET-ORDER-RESEARCH.md. A pesquisa complementar sobre código existente, catálogo, imagens, pedidos e Bling está em ORDER-ADMIN-AND-IMAGE-RESEARCH.md.

## 2. Decisões e limites de arquitetura

1. GitHub será a fonte versionada de nomes, marcas, apresentações, preços comerciais, imagens, composição e opções de cesta do novo atendimento.
2. A configuração ativa consultada contém cinco tamanhos e 61 produtos distintos como opções. A importação deve começar por esse recorte, recalculando os números antes da carga para detectar alterações ocorridas depois da pesquisa.
3. O repositório SUCEDOAN12 é público. Nenhum token, chave, dado pessoal ou ajuste interno deve entrar em produto.json, cesta.json, Flow JSON, arquivo do cliente ou histórico de commit.
4. O preço base público pode ficar no catálogo se essa informação já for pública para clientes. O adicional/ajuste interno e qualquer regra que a empresa queira manter privada ficam em configuração acessível somente no servidor. Essa configuração não é um cadastro de produtos.
5. Supabase não será usado como catálogo de produtos/cestas do novo Admin. Ele pode ser acessado no servidor para cadastro/endereço de cliente, rascunho/estado transacional de pedido e contratos operacionais aprovados.
6. Estoque não é dado estático de GitHub. A disponibilidade precisa vir do serviço operacional que for aprovado na rodada de compatibilidade, idealmente usando os identificadores de Bling/SKU/GTIN do catálogo.
7. Não criar senha própria. Escritas no GitHub, edição de pedidos, separação e ações fiscais exigem identidade autenticada. A primeira escolha técnica será reaproveitar sessão/cargos existentes do Admin quando possível ou usar identidade GitHub/SSO. Não deixar endpoint de gravação aberto.
8. Nenhum código será colocado em main, Vitrine Admin ou site público durante o desenvolvimento. Nenhuma função atual será substituída. Alterações de integração ficam em branch e ambiente de validação; publicação, chamada a cliente e ativação Meta são gates posteriores.
9. Reaproveitar contratos e comportamento testados, sem copiar diretamente os módulos atuais. O Admin novo terá módulos pequenos, responsabilidades claras e uma interface simplificada.

## 3. Arquitetura recomendada

Manter uma aplicação única e leve, sem microserviços desnecessários, com módulos internos separados por responsabilidade:

- **Admin web:** telas Produtos, Cestas, Flows, Pedidos e uma página curta de configuração dos dois números.
- **Domínio de catálogo e preço:** funções puras para validar produto, composição, quantidade, preço inicial, variação por marca e remoção. Dinheiro em centavos; regra executada no servidor.
- **Repositório GitHub:** lê uma revisão identificável do catálogo e grava arquivos por commit usando SHA/controle de concorrência. A credencial de escrita fica no servidor.
- **Runtime Meta:** valida assinatura, descriptografa e criptografa Data Exchange, valida sessão e canal, resolve Flow ID por número e chama o cálculo do pedido. Tokens e chaves ficam em segredos do servidor.
- **Cliente:** busca por telefone normalizado no servidor; se houver cadastro/endereço único, apresenta para confirmação; se faltar ou houver ambiguidade, pede o dado/seleção dentro da jornada.
- **Rascunho e pedido:** guarda a revisão da cesta, itens, pagamento, endereço confirmado, valor e hash do resumo. A confirmação é idempotente.
- **Operação e Bling:** usa o estado operacional existente quando o contrato aceitar o pedido com snapshot GitHub. Nenhum navegador chama Bling diretamente.

Não iniciar por um editor visual genérico de Flow. Primeiro construir um configurador guiado por telas e componentes suportados, com prévia, validação, teste e publicação deliberada. O editor JSON avançado pode ficar para uma etapa posterior.

## 4. Catálogo e cestas no GitHub

Organização sugerida dentro do projeto:

- catalog/products/<id>.json — uma ficha por produto usado nas cestas;
- catalog/baskets/<id>.json — tamanhos e composição;
- catalog/images/catalog/ — imagens leves usadas no Admin;
- catalog/images/flow/ — miniaturas otimizadas para o Flow;
- catalog/manifest.json — versão do schema e referência da revisão publicada.

Campos mínimos do produto:

- identificador estável, nome, marca e apresentação;
- SKU, GTIN/EAN e ID do produto no Bling para integração operacional;
- preço unitário comercial em centavos;
- caminho da imagem no próprio repositório;
- estado ativo e dados necessários para localização na separação, se a fonte operacional não os fornecer;
- sem estoque em cache permanente, senha, token, dado de cliente ou ajuste interno.

Campos mínimos da cesta:

- ID, nome, ordem e preço inicial apresentado;
- tipos/posições de produto e opções permitidas;
- produto padrão, quantidade inicial, min/max, editável, removível e ordem;
- regra de variação do total por marca/quantidade, validada no servidor;
- referência à configuração privada do ajuste interno, sem gravar o valor sensível no repositório público.

### Migração das imagens

A carga inicial deverá:

1. identificar de novo os 61 IDs distintos referenciados pelos cinco tamanhos ativos;
2. baixar cada origem aprovada e registrar falhas, dimensões e hash;
3. converter/remover metadados e criar miniaturas WebP previamente otimizadas;
4. manter a imagem do Flow dentro do limite que o runtime do projeto adotar; usar 240×190 e até 27 KB como primeiro alvo, seguindo o helper de referência, e confirmar nitidez em aparelho real;
5. revisar uma folha de contato antes do commit;
6. importar apenas arquivos validados e gerar manifesto com ID, caminho, tamanho, dimensões e SHA-256.

A existência de URL WebP não é aceite visual. A fase só termina quando as imagens reais forem baixadas, abertas e conferidas no WhatsApp.

## 5. Jornada e resumo de pedido

1. O cliente abre o Flow pelo número/canal correto.
2. Escolhe tamanho e configura cada tipo de produto: vê foto e opções permitidas, escolhe marca, quantidade e pode retirar quando permitido.
3. O servidor recalcula o preço a cada etapa com a revisão do catálogo e da regra privada. Não aceitar preço enviado pelo celular.
4. O backend identifica o remetente pelo vínculo assinado da conversa/Flow; consulta cliente/endereço no Supabase e permite confirmar ou corrigir.
5. O cliente escolhe a forma de pagamento.
6. Ao concluir o Flow, o backend revalida composição, disponibilidade e total e cria apenas um rascunho aguardando confirmação.
7. A conversa recebe o resumo solicitado: produtos e quantidades, sem preço unitário; total final; pagamento; nome; endereço; botões Confirmar, Editar e Cancelar.
8. Só Confirmar cria o pedido operacional. Clique repetido não duplica. Se preço/disponibilidade mudar, o resumo é atualizado e uma nova confirmação é necessária.

## 6. Admin básico de pedidos

A lista deve ter poucos estados fáceis de entender:

| Aba/estado visível | Comportamento |
|---|---|
| Recebidos | Pedidos confirmados pelo cliente e ainda sem separação |
| Em separação | Responsável atribuído; cada linha marcada Separado ou Faltou |
| Aguardando NF-e | Separação concluída; mostra retorno do Bling |
| Em entrega | NF-e autorizada e saída registrada |
| Concluídos | Entrega e pagamento registrados; corresponde ao estado operacional delivered |
| Problemas | Divergência de estoque, Bling, dados ou autorização fiscal que exige ação |

Na tela do pedido, mostrar o código, cliente, telefone, endereço, pagamento, total e linhas de produto com quantidades. As ações devem ser contextuais:

- Iniciar/retomar separação, escolher responsável e marcar itens separados/faltantes.
- Concluir a separação somente depois da conferência completa; o servidor aplica as regras de estoque e registra o total final.
- Exibir o status fiscal: pendente, em processamento, autorizada, rejeitada ou bloqueada. Oferecer consulta/recuperação e emissão humana quando o serviço fiscal permitir.
- Bloquear a saída para entrega até a NF-e estar autorizada.
- Concluir entrega junto com registro da forma/valor realmente recebidos; mapear essa ação ao estado final Concluído e à sincronização de atendimento no Bling.

O novo painel não deve criar uma segunda tabela paralela de pedidos nem escrever status diretamente. Usar ações de servidor idempotentes e os marcos canônicos do Vitrine depois de provar que aceitam o novo snapshot de catálogo.

## 7. Risco principal e gate técnico

A maior dificuldade não é desenhar a tela. É o contrato de pedido:

- create_vitrine_cart_order_v1 consulta public.products para validar preço/estoque e consulta estruturas de cesta no Supabase;
- o snapshot fiscal existente descarta linhas sem product_id e consulta public.products para SKU/GTIN/nome;
- o resolvedor fiscal ainda lista origens canônicas conhecidas e não inclui explicitamente whatsapp_flow_github.

Portanto, a primeira rodada técnica deve provar o pedido de cesta criado a partir da revisão GitHub sem fazer Supabase atuar como fonte de catálogo/preço. O pedido persistido deve carregar snapshots de nome, quantidade, preço, SKU/GTIN, ID do Bling e revisão GitHub. O fluxo de separação e o Bling precisam conseguir consumir esses dados.

A solução preferida é um adaptador servidor/RPC para o novo canal que grava snapshot no pedido operacional e fornece os identificadores exigidos pela separação e pela nota fiscal. Não criar um espelho de cadastro completo em Supabase. Se o motor exigir uma referência técnica mínima de produto no Supabase, parar e apresentar exatamente quais campos e por quê antes de aceitar essa concessão.

## 8. Rodadas de programação para Work Luna Max

| Rodada | Entrega | Critério de saída |
|---|---|---|
| 0 — Isolamento e contrato | Ler HANDOFF e esta pesquisa; verificar branch/pasta; provar identidade do pedido, estoque, autenticação e Bling com fixtures/canário técnico | Nenhuma dependência oculta do catálogo Supabase ou credencial no navegador |
| 1 — Manifesto e imagens | Extrair opções ativas, deduplicar 61 produtos, auditar IDs/imagens, criar thumbnails compactas no diretório do projeto | Cada produto tem identidade estável e imagem válida, leve e visualmente aprovada |
| 2 — Banco GitHub e Admin de produtos | Schema versionado, lista, busca, cadastro/edição, imagem e histórico de commits | Gravar produto gera revisão auditável sem token no cliente; conflito de edição é tratado |
| 3 — Criador de cestas | Tamanhos, grupos, opções, quantidades, remoção, preço inicial e prévia | Cálculo do servidor reproduz exemplos do negócio e não expõe regra privada |
| 4 — Configurador de Flow | Configurar Draft por canal, gerar JSON, validar, pré-visualizar, enviar canário, publicar manualmente | 0975 e 1018 têm vínculos explícitos; publicação não é automática |
| 5 — Runtime do checkout | Data Exchange, sessão/canal assinado, imagem, escolha, recálculo e consulta cliente/endereço | Cesta e total são revalidados no servidor; fallback de cadastro/endereço funciona |
| 6 — Resumo e pedido | Rascunho com revisão/hash, mensagem resumo no chat e confirmação/edição/cancelamento | Apenas a confirmação cria um pedido e eventos repetidos não duplicam |
| 7 — Gerenciador operacional | Fila, detalhe, separação, faltas, fiscal, expedição e conclusão | Ações respeitam os gates do Bling e atualizam o mesmo pedido operacional |
| 8 — Homologação | Testes de domínio, integração, imagens, Flow e pedido em canal controlado | Ciclo inteiro comprovado sem atingir clientes reais; evidência registrada antes de liberar |

Cada rodada deve terminar com diff pequeno, resumo de arquivos, comandos executados, evidência, pendências e próximo passo. Testes automatizados e manuais pertencem às rodadas de implementação; nenhum teste foi executado nesta pesquisa porque o código não foi alterado.

## 9. Critérios de aceite do projeto

- O catálogo GitHub inclui somente a união dos produtos realmente referenciados nas cestas autorizadas.
- As imagens têm caminhos próprios no GitHub, dimensões/bytes registrados e boa leitura em WhatsApp.
- O adicional interno e segredos não aparecem no branch público, Flow JSON, navegador, logs ou resumo.
- Fluxo de marca/quantidade/remover e preço total funciona com cálculo server-side.
- Nome/endereço e pagamento estão no resumo da conversa sem preço unitário.
- A confirmação produz exatamente um pedido com snapshot rastreável à revisão do GitHub.
- O pedido pode ser separado, ter faltas recalculadas, sincronizar/emitar NF-e pelo Bling, sair para entrega somente autorizado e terminar em Concluído.
- Os dois números são configurados e testados separadamente.
- Site público e Vitrine Admin em operação não foram modificados durante as rodadas isoladas.

## 10. Instrução inicial para Work Luna Max

Use este plano e os documentos indicados antes de tocar no código. A primeira execução é somente a Rodada 0: confirmar a branch isolada, localizar o diretório do projeto, mapear o contrato de identidade/estoque/pedido/fiscal e apresentar um pequeno desenho da solução. Não começar pelas telas de Flow. Não alterar main, site público, Vitrine Admin, funções implantadas ou dados de produção; não publicar Flow nem enviar mensagens a clientes. Depois do gate de compatibilidade, avançar uma rodada por vez dentro de projetos/whatsapp-atendimento-github/ e atualizar HANDOFF.md e o manifesto de andamento.

