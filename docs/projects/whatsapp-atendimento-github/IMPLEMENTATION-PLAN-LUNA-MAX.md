# Plano de programação greenfield — Admin WhatsApp, cestas e pedidos

Projeto: WhatsApp Atendimento GitHub — SUCEDOAN12  
Branch isolada: project/whatsapp-atendimento-github-20261025  
Diretório do novo código: projetos/whatsapp-atendimento-github/  
Execução prevista: Work Luna Max  
Estado em 26/10/2026: Rodadas 0–7 implementadas localmente no branch de trabalho. O catálogo usa `schemaVersion: 4` com estoque assinado em GitHub; a confirmação reduz o saldo uma vez por pedido. O Admin de clientes, a Central ANA/humano para 0975/1018 e a integração server-side Bling (venda após separação, reconciliação, confirmação de NF-e e leitura de situação/DANFE) também estão no código. Migrations, secrets e funções não foram aplicados/configurados; Flow em aparelho, homologação real Bling e transição de envio continuam pendentes. Nenhum Flow novo foi publicado nem NF-e emitida.

## Decisão principal

O projeto será construído do zero. O Vitrine Admin e os serviços atuais são **referência de negócio e de dados**, não base de código para o novo sistema.

Não copiar nem adaptar a UI, funções, tabelas, RPCs, máquina de estados, componentes ou estrutura antiga de pedidos. O novo projeto terá módulos, modelo de dados, endpoints e fluxo de operação próprios, organizados desde o início para cumprir apenas o escopo necessário.

Podemos consultar no Vitrine e nos serviços atuais, somente para pesquisa, quais produtos estão nas cestas, as regras comerciais, os identificadores de integração e a configuração das contas Meta/Bling. O cadastro de clientes existente no Supabase pode ser consultado pelo servidor conforme orientação do usuário. A implementação de cada integração será nova e seguirá as APIs oficiais.

### Decisão posterior sobre conexões existentes

O usuário autorizou usar a conexão Bling e os secrets já ativos no Supabase/GitHub, e reaproveitar ANA para os dois números. O Admin, os contratos de pedido, o comparador/idempotência, a interface e a integração comercial continuam novos. Para conectar sem pedir uma nova autorização Bling nem ler/imprimir segredos, a Edge Function usa uma lista fixa de RPCs server-side da integração existente para credencial, lock de rotação do refresh token e rate limit; para a Central ANA, um adaptador autenticado conversa com os serviços existentes, que continuam responsáveis por autorização de operador, janela e gates de envio. Essa ponte não copia implementação, UI ou schema e não permite chamadas arbitrárias.

## Escopo

O novo Admin terá cinco áreas diretas:

1. **Produtos:** cadastro simples dos produtos usados nas cestas, com foto, marca, apresentação, preço e identificadores necessários para a emissão no Bling.
2. **Cestas:** tamanhos, tipos de produto, opções, ordem, quantidade inicial, edição, remoção e regra de preço.
3. **Flows:** configuração e validação do atendimento para cada um dos dois números da Meta, com teste e publicação deliberada.
4. **Pedidos:** fila, detalhe, separação dos itens, correção de faltas, etapa fiscal e conclusão.
5. **Acompanhamento:** estado do pedido e erros que exigem ação, sem painel técnico excessivo.

A configuração consultada no Vitrine aponta para cinco tamanhos ativos e 61 produtos distintos como opções. A migração deverá confirmar novamente o recorte antes de trazer arquivos para o GitHub.

## Limites de dados e segurança

- GitHub será a fonte versionada de produtos, estoque, opções, cestas e imagens do novo atendimento. Não salvar catálogo de produtos em tabelas Supabase.
- O Supabase existente será consultado server-side para localizar cliente/endereço. O saldo inicial foi importado uma vez do saldo vendável consultado no Supabase; execução e edição correntes do estoque ocorrem no catálogo GitHub. O novo sistema tem tabelas próprias para rascunhos, pedidos, itens, separação, vínculo Meta por canal e integração fiscal; não cria nem altera tabelas de produto/estoque do Vitrine.
- O pedido guarda snapshots do nome, marca, SKU, GTIN, ID do Bling, quantidade, preço aceito e revisão do catálogo; alterações posteriores no catálogo não alteram pedidos antigos.
- `stockQuantity` assinado fica junto ao cadastro do produto no GitHub. A quantidade oferecida é `1..min(6, max(0, stockQuantity))`; o saldo pode ficar negativo após confirmação e isso não bloqueia a futura venda/NF-e no Bling. Produtos sem saldo positivo não são oferecidos; durante a separação ainda podem ser registradas faltas.
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
3. O backend calcula o valor com a revisão GitHub selecionada e com o ajuste interno obtido somente no servidor.
4. O backend usa o telefone recebido na conversa para buscar o cliente/endereço no Supabase. O cliente confirma ou corrige os dados.
5. O cliente escolhe a forma de pagamento.
6. O backend revalida composição, disponibilidade e total e grava um rascunho.
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

A pesquisa encontrou 61 URLs WebP preenchidas, mas o conteúdo ainda não foi validado. A carga futura deverá:

1. extrair somente os arquivos referenciados pelos 61 produtos elegíveis;
2. baixar e validar o arquivo, MIME, assinatura, resolução e tamanho;
3. comprimir e salvar no diretório de imagens do novo projeto;
4. gerar uma folha de contato para revisão;
5. testar leitura no Flow em WhatsApp real antes de fixar a resolução/qualidade.

Como ponto de partida, testar uma miniatura WebP de 240×190 com limite de 27 KB para o Flow. Se perder nitidez, ajustar a saída após inspeção em aparelho. O JSON guarda apenas caminho relativo; nunca Base64.

## Rodadas de programação

| Rodada | Entrega | Critério de saída |
|---|---|---|
| 0 — Contratos mínimos | Confirmar branch/diretório, autenticação, APIs Meta/Bling disponíveis, modelo novo de pedido e credenciais server-side | Arquitetura mínima aprovada; nenhum módulo antigo usado como dependência |
| 1 — Catálogo e imagens | Manifesto dos produtos/opções, importação dos 61 elegíveis, conversão/validação de fotos | IDs reconciliados; fotos leves e visualmente aprovadas |
| 2 — Admin de produtos e cestas | CRUD GitHub, edição simples, opções, quantidades, preço e prévia | Um operador autorizado consegue editar e ver o histórico do commit |
| 3 — Configurador Meta Flow | Editor guiado, Flow JSON gerado, validação local, configuração por número e exportação | Cada número tem rascunho próprio; publicação permanece fora da etapa |
| 4 — Runtime de atendimento | **Implementada localmente:** sessão/canal, seleção validada, imagens por commit, cotação, protocolo cifrado e busca mínima de cliente. Migration criada, não aplicada. | Endpoint local compila e falha fechado sem segredos/sessão; total calculado no servidor. A ligação do JSON Meta e revisão de telas dependem da Rodada 7. |
| 5 — Confirmação e pedidos | Resumo no chat, botões, rascunho, confirmação idempotente e novo esquema operacional | Só o aceite explícito cria pedido e preserva snapshot |
| 6 — Separação e Bling | **Implementada localmente:** fila, atribuição, separação/falta, aceite do total recalculado, preflight, vínculo manual revisado do contato, uso server-side da conexão Bling compartilhada, criação da venda após separação, reconciliação idempotente, confirmação digitada para NF-e, leitura de situação/número/DANFE, despacho com releitura fiscal e conclusão idempotente da entrega/pagamento no modelo novo. Não houve chamada externa nesta rodada. | Escrita protegida por sessão, revisão, preflight e confirmação; incerteza nunca causa repetição cega; homologação externa da venda/NF-e/saída continua pendente |
| 7 — Flow local e homologação externa | **Implementada localmente:** Flow JSON 7.3/Data Exchange 4.0 ligado ao endpoint e webhook, assinatura opcional de `flow_token` verificada quando fornecida, saldo GitHub, baixa idempotente na confirmação, CRUD de clientes, worker da outbox desligado por padrão, configuração/vínculo Flow por canal e recibos de status Meta (`sent`, `delivered`, `read`, `failed`) com timestamp. Pendentes externos: aplicar migrations, configurar secrets/allowlist, validar imagens/JSON em aparelho nos dois números, habilitar envio somente em homologação autorizada e fechar venda/NF-e/saída com Bling. | Contrato local consistente; operação externa segue bloqueada até configuração deliberada, dados e homologação |

## Fechamento operacional pendente

1. Revisar e integrar o diff local no branch alvo; nenhum código ou dado de cliente do Vitrine foi copiado.
2. Em janela de homologação autorizada, confirmar configuração do Supabase Auth/GitHub OAuth, allowlist, origens, GitHub App e secrets, apenas por presença e sem expor valores.
3. Aplicar as migrations novas e implantar as Edge Functions novas; conferir RLS, funções e endpoints sem alterar tabelas/funções de produção do Vitrine.
4. Entrar no Admin com operador autorizado e confirmar fila/histórico, ANA/humano, janela e controle de envio nos canais 0975 e 1018.
5. Usar pedido de teste controlado para validar a baixa GitHub, a venda Bling, reconciliação, NF-e e estado autorizado/DANFE; conferir uma única criação após timeout simulado operacionalmente sem fazer retry cego.
6. Validar JSON, endpoint, fotos e sequência de telas no Flow Builder e aparelhos dos dois canais; publicar e vincular apenas com autorização operacional específica.
7. Confirmar recepção de mensagens e comportamento da outbox; manter o worker desligado até definir a janela e os destinatários de homologação.
8. Depois de implantar migrations/funções em homologação autorizada, conferir a releitura da NF-e para liberar saída e testar a conclusão da entrega/pagamento com pedido controlado. Os marcos locais estão implementados; ainda não foram executados em produção/homologação. Sincronização da situação comercial ou de contas financeiras Bling permanece fora do escopo implementado.

Cada rodada deve produzir um diff pequeno e revisável, resumo das mudanças, como conferir o resultado e riscos remanescentes. Não implantar, publicar Flow ou enviar mensagem real durante desenvolvimento local.

### Decisões locais da Rodada 7

- Uma tela lógica `GROUP` é atualizada por Data Exchange para cada tipo de produto, e `CUSTOMER_REVIEW` é a tela terminal. Assim, uma cesta com 13–25 grupos não precisa declarar uma tela/rota diferente por grupo. A Meta tem um exemplo oficial de resposta Data Exchange que atualiza a mesma tela: [book-appointment `flow.js`](https://github.com/WhatsApp/WhatsApp-Flows-Tools/blob/main/examples/endpoint/nodejs/book-appointment/src/flow.js). Essa compatibilidade ainda precisa ser conferida no Flow Builder do canal.
- Cada tipo tem uma única seleção de produto, seguida por uma quantidade. A lista mostra nome, marca/apresentação e preço unitário; a imagem atualiza com a opção. A última escolha sempre é `Não quero esse produto`; selecionar retirada oculta a quantidade.
- O catálogo público de produtos usa `schemaVersion: 4` e guarda `stockQuantity` assinado. O saldo inicial foi importado uma vez do Supabase; GitHub é a fonte operacional de produtos, estoque, cestas e imagens. O runtime usa a revisão fixada pela sessão e oferece `1..min(6, max(0, stockQuantity))`.
- O total é recalculado no servidor ao selecionar produto/quantidade. A conclusão envia o contrato checkout v1 com `selections` serializado; o webhook volta a conferir preço, composição e saldo daquela revisão. A experiência só aceita confirmar uma cesta com ao menos um item.
- Ao confirmar pedido, o webhook reduz o estoque no GitHub com marcador opaco idempotente, mesmo que o saldo fique negativo; Flow e confirmação não oferecem compra com saldo zero/negativo na revisão apresentada. Saldo negativo nunca bloqueia o caminho Bling. O Admin vincula por número apenas Flow publicado do WABA correto, com endpoint e criptografia conferidos. O worker da outbox só será ligado em homologação autorizada; falhas incertas não são repetidas automaticamente e exigem conferência manual. A única mensagem de teste real foi o canário histórico via Vitrine Admin, aceito pela Meta em 26/10/2026.
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

`verify_jwt = false` fica restrito ao roteador assinado pela Meta; as rotas de destino validam assinatura novamente. O código está local, sem deploy e sem alteração do callback. Preflight de `SUPABASE_DB_URL`, alias do segredo Meta, configuração OAuth/allowlist/GitHub App e chave Flow 0975 ainda impede a ativação operacional. A documentação oficial Supabase consultada para webhooks externos: [autenticação](https://supabase.com/docs/guides/functions/auth) e [cabeçalhos](https://supabase.com/docs/guides/functions/auth-headers).

### Decisão — paridade dos canais 0975 e 1018

Os canais terão as mesmas telas e recursos do Admin, usando um único gerador de Flow, o mesmo catálogo GitHub e as mesmas regras de pedido. O JSON de cada Flow será semanticamente idêntico; identidade Meta, WABA, Flow ID, chave de criptografia, status e vínculo permanecem separados por número. A interface deixa essa diferença operacional explícita. A configuração do canal 0975 ainda depende da chave privada correspondente no runtime, sem reutilizar uma chave do 1018 por suposição.
