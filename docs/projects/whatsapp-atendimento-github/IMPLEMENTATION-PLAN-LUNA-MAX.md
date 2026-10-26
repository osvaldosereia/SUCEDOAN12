# Plano de programação greenfield — Admin WhatsApp, cestas e pedidos

Projeto: WhatsApp Atendimento GitHub — SUCEDOAN12  
Branch isolada: project/whatsapp-atendimento-github-20261025  
Diretório do novo código: projetos/whatsapp-atendimento-github/  
Execução prevista: Work Luna Max  
Estado em 26/10/2026: Rodadas 0–7 implementadas no branch; o Admin estático publicado em `https://donaantonia.com.br/whatsapp-admin/`. Decisão mais recente do usuário: produtos, estoque e imagens têm fonte única no Supabase; o runtime consulta apenas os produtos que aparecem nas cestas configuradas. GitHub mantém composição de cestas e rascunhos Flow. O estoque usa a view operacional do Supabase mais reservas confirmadas do modelo novo. O editor não altera o saldo físico. As mudanças locais desta rodada retiram o catálogo de produtos/imagens do build e encaminham edições/fotos aos mesmos registros/bucket Supabase. A Central, o fluxo de pedidos e a integração Bling seguem greenfield. Duas funções estão implantadas; outras funções/Flow/checkout ainda aguardam ativação e preflight operacional. Nenhum Flow novo foi publicado nem NF-e emitida.

> **Fonte de dados vigente — decisão do usuário em 26/10/2026.** Esta seção substitui qualquer referência histórica abaixo a `products.json`, imagens no GitHub, estoque GitHub ou baixa de estoque no GitHub. Leia `public.products` no Supabase somente para os IDs presentes em `catalog/baskets.json`; estoque válido é a view `public.ops2_loose_sellable_stock_v1.effective_sellable_stock`; imagens usam `products.image_url` / bucket `product-images`. Pedidos confirmados criam reserva idempotente no schema privado Supabase. O GitHub continua apenas com cestas e configurações/rascunhos Flow. Não criar novo cadastro de produto neste Admin: ele edita os produtos existentes ligados às cestas.

## Decisão principal

O projeto será construído do zero. O Vitrine Admin e os serviços atuais são **referência de negócio e de dados**, não base de código para o novo sistema.

Não copiar nem adaptar a UI, funções, tabelas, RPCs, máquina de estados, componentes ou estrutura antiga de pedidos. O novo projeto terá módulos, modelo de dados, endpoints e fluxo de operação próprios, organizados desde o início para cumprir apenas o escopo necessário.

Podemos consultar no Vitrine e nos serviços atuais, somente para pesquisa, quais produtos estão nas cestas, as regras comerciais, os identificadores de integração e a configuração das contas Meta/Bling. O cadastro de clientes existente no Supabase pode ser consultado pelo servidor conforme orientação do usuário. A implementação de cada integração será nova e seguirá as APIs oficiais.

### Hospedagem da interface

A interface do novo Admin é publicada pelo GitHub, a partir do repositório e da pasta `projetos/whatsapp-atendimento-github/`. O Supabase não hospeda essa interface: fornece autenticação, dados de clientes e Edge Functions. O endereço `https://ssbesxgaijknwsjbsbcz.supabase.co/auth/v1/callback` é somente o callback técnico de OAuth. Seguindo o mecanismo existente de publicar caminhos isolados, o Admin está em `https://donaantonia.com.br/whatsapp-admin/` (GitHub Actions `40331576769`, concluída com sucesso). A allowlist OAuth ainda precisa receber o endereço exato. Esta publicação cobre a interface estática; não ativa login, Edge Functions nem atendimento. Não pedir ao usuário que escolha hospedagem no Supabase.

### Decisão posterior sobre conexões existentes

O usuário autorizou usar a conexão Bling e os secrets já ativos no Supabase/GitHub, e reaproveitar ANA para os dois números. O Admin, os contratos de pedido, o comparador/idempotência, a interface e a integração comercial continuam novos. Para conectar sem pedir uma nova autorização Bling nem ler/imprimir segredos, a Edge Function usa uma lista fixa de RPCs server-side da integração existente para credencial, lock de rotação do refresh token e rate limit; para a Central ANA, um adaptador autenticado conversa com os serviços existentes, que continuam responsáveis por autorização de operador, janela e gates de envio. Essa ponte não copia implementação, UI ou schema e não permite chamadas arbitrárias.

## Escopo

O novo Admin terá cinco áreas diretas:

1. **Produtos:** cadastro simples dos produtos usados nas cestas, com foto, marca, apresentação, preço e identificadores necessários para a emissão no Bling.
2. **Cestas:** tamanhos, tipos de produto, opções, ordem, quantidade inicial, edição, remoção e regra de preço.
3. **Flows:** uma configuração compartilhada da cesta para 0975 e 1018; a conexão/publicação da Meta permanece separada por número.
4. **Pedidos:** fila, detalhe, separação dos itens, correção de faltas, etapa fiscal e conclusão.
5. **Acompanhamento:** estado do pedido e erros que exigem ação, sem painel técnico excessivo.

A configuração consultada no Vitrine aponta para cinco tamanhos ativos e 61 produtos distintos como opções. A migração deverá confirmar novamente o recorte antes de trazer arquivos para o GitHub.

## Limites de dados e segurança

- GitHub guarda somente opções/composição das cestas e rascunhos Flow. Não versionar produto, imagem nem saldo no repositório.
- Supabase é a fonte canônica de produtos, imagens e saldo. O backend filtra `public.products` pelos IDs encontrados nas cestas e lê `public.ops2_loose_sellable_stock_v1.effective_sellable_stock`. Fotos vêm do campo existente `products.image_url` e bucket `product-images`. O schema privado deste projeto reserva unidades de pedidos confirmados que ainda aguardam processamento fiscal; não altera `products.stock`, tabelas de estoque, funções ou atendimento do Vitrine.
- O pedido guarda snapshots do nome, marca, SKU, GTIN, ID do Bling, quantidade, preço aceito e revisão do catálogo; alterações posteriores no catálogo não alteram pedidos antigos.
- A disponibilidade é recalculada no Supabase em cada leitura/seleção e no checkout. A quantidade oferecida é `1..min(6, max(0, saldo disponível))`; o saldo físico não é editável pelo Admin novo. Se o estoque confirmado cair abaixo de zero no ciclo de venda, isso não bloqueia a criação de venda/NF-e no Bling.
- O SUCEDOAN12 é público. Produtos e fotos commitados ficam publicamente legíveis. Ajuste interno da cesta, tokens, chaves e dados pessoais ficam fora do GitHub e do JSON entregue ao cliente.
- Não haverá senha própria. A gravação do catálogo e as ações operacionais exigem uma identidade autorizada, de preferência GitHub OAuth/SSO com lista de usuários permitidos. Não deixar escrita anônima nem credencial no navegador.
- Usar poucos serviços: uma aplicação Admin leve e um backend modular com funções próprias para Admin, protocolo Meta e integração Bling. Sem microserviços, Firebase, Make ou serviços auxiliares que não atendam a uma necessidade demonstrada.

## Arquitetura nova

### Admin

Uma aplicação isolada, dentro do diretório do projeto, com módulos claros:

- telas e componentes de produtos, cestas, Flows e pedidos;
- tipos e validações do catálogo;
- cálculo puro de cesta separado de qualquer tela;
- cliente de API sem segredos;
- estado visual simples, com formulários curtos, prévia e erros acionáveis.

A stack deve ser confirmada no início da programação. A preferência é uma aplicação leve em TypeScript com ferramenta de build pequena, sem adicionar framework grande se o projeto não precisar dele.

### Backend

Código novo, com poucos pontos de entrada:

- **Admin API:** autentica o operador, valida mudanças e grava arquivos no GitHub por commit. Também gerencia os pedidos.
- **Meta Flow endpoint/webhook:** verifica a assinatura, processa o protocolo criptografado do Flow, associa conversa ao canal e devolve dados calculados pelo servidor.
- **Bling client:** OAuth/token server-side, criação/atualização de venda, solicitação de NF-e, consulta de situação e recuperação sem duplicar ações.

Esses módulos podem compartilhar o mesmo backend/deploy, mantendo cada integração testável e separada. Nenhum código atual do Vitrine será importado.

### Dados de pedido

Criar um modelo transacional novo, separado das tabelas antigas de pedidos. Começar com o menor conjunto que cubra operação e idempotência, por exemplo:

- cabeçalho do pedido: canal, cliente, endereço, pagamento, revisão do catálogo, total, situação, referência Bling e timestamps;
- itens: ID GitHub do produto, snapshot de SKU/GTIN/ID Bling, quantidade, preço aceito e estado de separação;
- eventos/integração: confirmação do cliente, transições, tentativas e resultado da emissão da NF-e.

O modelo final será definido em uma migration própria após o fluxo ser aprovado. Não usar tabelas ou funções antigas como atalho.

## Fluxo do cliente

1. O cliente abre o Flow enviado pelo número correto.
2. Seleciona o tamanho e, em cada tipo de produto, vê as opções com foto, escolhe marca e quantidade e remove o item se a cesta permitir.
3. O backend calcula o valor usando a composição da cesta na revisão GitHub selecionada e os produtos/preços consultados no Supabase.
4. O backend usa o telefone recebido na conversa para buscar o cliente/endereço no Supabase. O cliente confirma ou corrige os dados.
5. O cliente escolhe a forma de pagamento.
6. O backend revalida composição, disponibilidade e total contra o Supabase e grava um rascunho.
7. O WhatsApp recebe resumo com produtos e quantidades, sem preços unitários, total, pagamento, nome e endereço, com Confirmar, Editar e Cancelar.
8. Somente Confirmar transforma o rascunho em pedido recebido. Repetição de evento não duplica pedido.
9. Se uma falta durante a separação mudar o total, o cliente recebe o valor ajustado e precisa confirmar antes do pedido seguir para emissão fiscal.

## Gestor de pedidos novo

Estados visíveis, sem excesso de abas:

| Estado no Admin | Significado |
|---|---|
| Recebido | Cliente confirmou e o pedido aguarda operação |
| Em separação | Operador conferindo itens |
| Aguardando NF-e | Separação concluída e solicitação em andamento |
| NF-e autorizada | Documento autorizado; pode seguir para entrega |
| Em entrega | Saída registrada |
| Concluído | Entrega e pagamento registrados |
| Atenção | Falta, rejeição, divergência ou integração pendente |

A separação precisa permitir atribuir responsável, marcar cada linha como separada ou faltante, ajustar quantidades e recalcular o total. O operador vê claramente quando a falta exige novo aceite do cliente. Depois da conferência, o backend envia a venda e solicita a NF-e ao Bling; o Admin apresenta o retorno e oferece uma tentativa segura quando a API permitir. Não enviar a mesma venda ou nota duas vezes em caso de timeout. A saída só pode ocorrer após autorização fiscal. Concluído só ocorre com entrega/pagamento registrados.

## Imagens dos produtos

O Admin consulta `products.image_url` para cada produto referenciado em `catalog/baskets.json`. A imagem é entregue pela fonte existente no Supabase Storage (`product-images`) ou pela URL já cadastrada no próprio produto. Para WhatsApp Flow, o runtime pede uma transformação 240×190 WebP ao Storage, valida assinatura e aplica limite de 27 KB. Imagens alteradas no Admin são convertidas no navegador e enviadas ao mesmo bucket; não criar cópia sob `images/products/` nem guardar caminho relativo no cadastro novo.

## Rodadas de programação

| Rodada | Entrega | Critério de saída |
|---|---|---|
| 0 — Contratos mínimos | Confirmar branch/diretório, autenticação, APIs Meta/Bling disponíveis, modelo novo de pedido e credenciais server-side | Arquitetura mínima aprovada; nenhum módulo antigo usado como dependência |
| 1 — Catálogo e imagens | Consultar os produtos apenas pelos IDs referenciados nas cestas; usar `image_url`/bucket existentes e validar transformação do Flow | Recorte Supabase correto e imagem leve resolvida do mesmo bucket |
| 2 — Admin de produtos e cestas | Edição de produtos existentes no Supabase; configuração/ordem/quantidades de cestas versionadas no GitHub; estoque somente leitura | Um operador autorizado altera cadastro/foto e cestas, com as fontes indicadas na interface |
| 3 — Configurador Meta Flow | Editor guiado, Flow JSON gerado, validação local, configuração por número e exportação | Cada número tem rascunho próprio; publicação permanece fora da etapa |
| 4 — Runtime de atendimento | **Implementada localmente:** sessão/canal, seleção validada, produto/estoque/imagem Supabase, cotação e protocolo cifrado. | Endpoint lê o recorte do Supabase em cada tela, aplica limite 1–6 e falha fechado se produto/estoque/imagem não validar |
| 5 — Confirmação e pedidos | Resumo no chat, botões, rascunho, confirmação idempotente e novo esquema operacional | Só o aceite explícito cria pedido e preserva snapshot |
| 6 — Separação e Bling | **Implementada localmente:** fila, atribuição, separação/falta, aceite do total recalculado, preflight, vínculo manual revisado do contato, uso server-side da conexão Bling compartilhada, criação da venda após separação, reconciliação idempotente, confirmação digitada para NF-e, leitura de situação/número/DANFE, despacho com releitura fiscal e conclusão idempotente da entrega/pagamento no modelo novo. Não houve chamada externa nesta rodada. | Escrita protegida por sessão, revisão, preflight e confirmação; incerteza nunca causa repetição cega; homologação externa da venda/NF-e/saída continua pendente |
| 7 — Flow local e homologação externa | **Implementada localmente:** Flow JSON 7.3/Data Exchange 4.0, produtos/estoque/imagens Supabase ao vivo, reserva idempotente ao confirmar, CRUD de clientes, worker desligado por padrão e vínculo/recibo por canal. Pendentes externos: implantar funções que faltam, chave Flow 0975, validar Flow em aparelho, homologar venda/NF-e/saída com Bling e autorizar mensagens de operação. | Contrato local consistente; operação externa segue bloqueada até preflight e homologação |

## Fechamento operacional pendente

1. Revisar e integrar o diff local no branch alvo; nenhum código ou dado de cliente do Vitrine foi copiado.
2. Confirmar login por link de e-mail Supabase e presence-only das chaves de runtime. GitHub OAuth não é requisito. GitHub App é necessário apenas para gravação de cestas/rascunhos Flow, não para produto/estoque/imagens.
3. Implantar as Edge Functions ainda faltantes após preflight; conferir RLS e endpoints sem alterar tabelas/funções de produção do Vitrine.
4. Entrar no Admin com operador autorizado e confirmar fila/histórico, ANA/humano, janela e controle de envio nos canais 0975 e 1018.
5. Usar pedido de teste controlado para validar a reserva idempotente no Supabase, a venda Bling, reconciliação, NF-e e estado autorizado/DANFE; conferir uma única criação após timeout simulado operacionalmente sem fazer retry cego.
6. Validar JSON, endpoint, fotos e sequência de telas no Flow Builder e aparelhos dos dois canais; publicar e vincular apenas com autorização operacional específica.
7. Confirmar recepção de mensagens e comportamento da outbox; manter o worker desligado até definir a janela e os destinatários de homologação.
8. Depois de implantar migrations/funções em homologação autorizada, conferir a releitura da NF-e para liberar saída e testar a conclusão da entrega/pagamento com pedido controlado. Os marcos locais estão implementados; ainda não foram executados em produção/homologação. Sincronização da situação comercial ou de contas financeiras Bling permanece fora do escopo implementado.

Cada rodada deve produzir um diff pequeno e revisável, resumo das mudanças, como conferir o resultado e riscos remanescentes. Não implantar, publicar Flow ou enviar mensagem real durante desenvolvimento local.

### Decisões locais da Rodada 7

- Uma tela lógica `GROUP` é atualizada por Data Exchange para cada tipo de produto, e `CUSTOMER_REVIEW` é a tela terminal. Assim, uma cesta com 13–25 grupos não precisa declarar uma tela/rota diferente por grupo. A Meta tem um exemplo oficial de resposta Data Exchange que atualiza a mesma tela: [book-appointment `flow.js`](https://github.com/WhatsApp/WhatsApp-Flows-Tools/blob/main/examples/endpoint/nodejs/book-appointment/src/flow.js). Essa compatibilidade ainda precisa ser conferida no Flow Builder do canal.
- Cada tipo tem uma única seleção de produto, seguida por uma quantidade. A lista mostra nome, marca/apresentação e preço unitário; a imagem atualiza com a opção. A última escolha sempre é `Não quero esse produto`; selecionar retirada oculta a quantidade.
- Registro histórico superado em 26/10/2026: a decisão do usuário passou a usar o Supabase como fonte única de produtos, imagens e estoque. GitHub guarda somente a composição das cestas e rascunhos Flow. A disponibilidade é lida ao vivo, descontando reservas ativas do novo schema.
- O total é recalculado no servidor ao selecionar produto/quantidade. A conclusão envia o contrato checkout v1 com `selections` serializado; o webhook volta a conferir preço, composição e saldo daquela revisão. A experiência só aceita confirmar uma cesta com ao menos um item.
- Ao confirmar, a transação cria pedido/itens e reserva disponibilidade no Supabase uma vez por evento; não escreve em GitHub nem na tabela de estoque existente do Vitrine. Saldo negativo na fonte Supabase nunca bloqueia venda/NF-e no Bling. O Admin vincula por número apenas Flow publicado do WABA correto, com endpoint e criptografia conferidos. O worker da outbox só será ligado em homologação autorizada; falhas incertas não são repetidas automaticamente e exigem conferência manual.
- O worker guarda o ID retornado pela Graph somente no schema privado; o webhook usa o timestamp do provedor para projetar status, pois notificações podem chegar fora de ordem. A tela mostra estado e horário sem expor `wamid`, conteúdo, destinatário ou ciphertext. Callback apenas de status não dispara o worker.

## Pronto para iniciar

A pesquisa anterior está em ORDER-ADMIN-AND-IMAGE-RESEARCH.md; a pesquisa Meta e de plataformas segue em FLOW-RESEARCH.md e BASKET-ORDER-RESEARCH.md. O handoff e o roadmap antigos têm numeração anterior: esta tabela é a sequência vigente (Admin de catálogo na Rodada 2, configurador Flow na Rodada 3). O estado corrente e os próximos passos estão no HANDOFF.md.

### Texto para iniciar no Work Luna Max

Atue como programador sênior especialista em e-commerce e integrações WhatsApp. Leia HANDOFF.md, ORDER-ADMIN-AND-IMAGE-RESEARCH.md e este plano. O projeto é greenfield: não copie código, tabelas, RPCs ou arquitetura do Vitrine Admin; use o Vitrine apenas como referência de regras e dados. Comece pela Rodada 0, trabalhando somente na branch project/whatsapp-atendimento-github-20261025 e no diretório projetos/whatsapp-atendimento-github/. Produtos/cestas ficam no GitHub; clientes são consultados no Supabase; pedidos usam o novo modelo transacional; Meta e Bling recebem conectores novos. Não altere main, site público, Vitrine Admin ou funções existentes. Não publique Flow nem envie mensagens a clientes. Entregue o contrato técnico mínimo da Rodada 0 e então progrida rodada por rodada, mantendo o sistema pequeno, simples e verificável.

## Fechamento operacional autorizado — 26/10/2026

O usuário autorizou avançar nas mudanças de GitHub/Supabase para pôr o projeto em operação. Essa instrução atual substitui as frases históricas acima que limitavam migrations/deploy ao desenvolvimento local. A autorização não torna OAuth, segredos ou rotas Meta automaticamente disponíveis; não expor credenciais.

### Estado conferido

- As quatro migrations do projeto estão aplicadas no Supabase ativo `ssbesxgaijknwsjbsbcz`; RLS/grants foram verificados e as tabelas transacionais não são acessíveis por `anon`/`authenticated`.
- O GitHub OAuth está desabilitado no Supabase Auth e o login respondeu `provider is not enabled`.
- O projeto novo requer GitHub App ID/installation/private key e allowlist/origem em secrets do runtime. O conector de banco/repositório não configura esses itens; a sessão do Dashboard Supabase estava encerrada.
- O runtime atual tem aliases server-side Meta para token/app secret/Graph API e chave Flow 1018. A chave Flow 0975 não foi localizada.
- O callback atual da Meta segue em `whatsapp-meta-webhook-v1`; a nova ponte está somente no código local, sem deploy ou troca do callback.
- Nenhuma das cinco Edge Functions novas está implantada, nenhum Flow foi publicado e o worker de mensagens está desligado.

### Sequência de fechamento

1. Obter configuração do GitHub OAuth e habilitar o provider no Supabase Auth; autorizar redirect local e domínio de produção.
2. Provisionar GitHub App com permissões mínimas ao repositório e secrets server-side; cadastrar operador autorizado na allowlist.
3. Confirmar as chaves privadas Flow de ambos os números (criar 0975 se ausente) e verificar os nomes Meta necessários por presença, sem ler valores.
4. Confirmar presença das dependências server-side e implantar, após preflight, as quatro funções de operação e o roteador; manter envio desativado.
5. Configurar o callback Meta para o roteador após validar o relay de verificação; manter eventos ANA e desviar somente interações identificadas como sessões do checkout novo.
6. Executar pedido controlado para provar confirmação, baixa GitHub idempotente mesmo com saldo negativo, venda Bling após separação, NF-e e reconciliação.
7. Validar os JSON/imagens no Flow Builder e nos canais 0975 e 1018, publicar/vincular os dois Flows e só então abrir pedidos aos clientes.

Não declarar entrada em operação antes de os passos 1–6 passarem e a confirmação do pedido chegar ao Admin. Se o acesso do Dashboard e a configuração das credenciais seguirem indisponíveis pelos conectores, registrar o item exato que o operador precisa aplicar em vez de repetir a autorização.

### Atualização de fechamento — ponte de callback isolada (26/10/2026)

A função ativa `whatsapp-meta-webhook-v1` normaliza mensagens interativas para o histórico ANA, mas não interpreta a sessão do checkout novo. Foi criada localmente `whatsapp-meta-order-router` para preservar esse webhook como destino de eventos ANA, identificar checkout por frases claras e IDs próprios de interação, e desviar `nfm_reply` apenas se `flow_token` corresponder a uma sessão do projeto por hash, canal e telefone. O roteador encaminha o desafio GET para o webhook atual, valida HMAC dos POSTs e encaminha status do outbox novo ao checkout. A mudança não toca na função ativa nem no cadastro de canais.

`verify_jwt = false` é necessário no roteador assinado pela Meta e no Admin API para aceitar o retorno OAuth externo do Bling. O callback do Bling exige estado de uso único; as demais rotas do Admin API chamam `authorize()` e validam a sessão GitHub e a allowlist. O código está local, sem deploy e sem alteração do callback Meta. Preflight de `SUPABASE_DB_URL`, alias do segredo Meta, configuração OAuth/allowlist/GitHub App e chave Flow 0975 ainda impede a ativação operacional. A documentação oficial Supabase consultada para webhooks externos: [autenticação](https://supabase.com/docs/guides/functions/auth) e [cabeçalhos](https://supabase.com/docs/guides/functions/auth-headers).

### Decisão — paridade dos canais 0975 e 1018

Os canais terão os mesmos recursos do Admin, usando um único editor/gerador de Flow, o mesmo catálogo GitHub e as mesmas regras de pedido. A tela oferece uma configuração compartilhada para ambas as linhas e recolhe os detalhes técnicos da Meta até que sejam necessários. O conteúdo JSON dos dois canais permanece semanticamente idêntico; identidade Meta, WABA, Flow ID, chave de criptografia, status e vínculo continuam separados por número. A chave privada do canal 0975 nunca é presumida a partir da chave do 1018.

O contrato TypeScript dos dois canais fica centralizado em `src/domain/channels.ts`; Flow, atendimento, pedidos, outbox, resolução de contas e rotas server-side derivam desse registro. A associação ao WABA e os segredos criptográficos continuam separados por canal.

Os documentos de rascunho mantêm um arquivo por canal para preservar a identidade de cada integração. Toda gravação pelo Admin sincroniza os dois arquivos no mesmo commit GitHub e grava a mesma lista de rascunhos, validada contra a revisão atual do catálogo em cada canal. Assim, uma alteração de cesta/Flow não deixa o outro número com conteúdo defasado; segredos, Flow IDs e vínculos Meta permanecem isolados.

### Revisão pré-ativação — correções no roteamento (26/10/2026)

A revisão local da branch não encontrou problemas críticos e apontou falhas importantes em três pontos: o callback OAuth do Bling chegava ao gateway com `verify_jwt = true`; `nfm_reply` de sessão expirada podia resultar em 502 e retentativas; e o classificador interceptava palavras genéricas sem exigir Flow publicado no canal. A configuração do Admin API agora permite o callback externo, validado por estado de uso único, enquanto todas as demais rotas passam por `authorize()`. O roteador encaminha sessões vencidas/revogadas à ANA, restringe a captura de texto a comandos claros de cesta com vínculo ativo e devolve à ANA se a consulta privada falhar. Status Meta antecipados são temporariamente enviados ao checkout e à ANA durante uma tentativa de envio ainda sem WAMID persistido; o worker aplica o status depois de salvar o WAMID. Durante a janela de correlação, outros WAMIDs do canal podem gerar registros pendentes, que expiram sem alterar pedidos sem correspondência.

Essas mudanças estão somente na branch local até o commit/push. `pnpm build` passou (`tsc --noEmit` e Vite; o bundle JavaScript mantém o aviso de 618 KB) e `git diff --check` passou, com avisos de LF/CRLF no Windows. Não foram criados ou executados testes automatizados, nem houve deploy, troca de callback, publicação de Flow, envio de mensagem ou escrita Bling/Meta nesta revisão. Para ativação ainda falta uma sessão de operador no Dashboard Supabase, OAuth GitHub habilitado, configuração verificada de GitHub App/secrets/allowlist, chave Flow própria do 0975 e preflight de todas as funções.
