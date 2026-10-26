# Contratos mínimos — Rodada 0

Estado: contratos técnicos registrados; nenhum endpoint, schema ou segredo foi implantado. Base: branch `project/whatsapp-atendimento-github-20261025` do repositório `osvaldosereia/SUCEDOAN12`.

## 1. Isolamento e fontes de dados

- Código novo: somente em `projetos/whatsapp-atendimento-github/`.
- Catálogo público versionado: arquivos novos do projeto no GitHub, lidos por SHA de commit para manter cada cotação reproduzível.
- Cliente/endereço: consulta server-side ao Supabase canônico por telefone E.164; retornar somente os campos necessários ao checkout.
- Pedidos: modelo transacional novo no schema privado `whatsapp_atendimento`; não ler nem escrever `public.orders`, tabelas antigas de draft, RPCs ou APIs de pedido existentes.
- Meta e Bling: conectores novos e server-side; nenhum endpoint existente será importado ou usado como dependência.
- Ajuste interno da cesta, dados pessoais, pedidos, sessões e credenciais não entram em arquivos públicos, Flow JSON ou `flow_token`. Nome e endereços mínimos podem transitar somente na resposta Data Exchange criptografada após lookup server-side, para revisão do cliente; telefone, token e credenciais não são enviados à tela.

Não copiar código, componentes, migrations, tabelas, RPCs ou estados do Vitrine Admin. O projeto `projetos/dona-antonia-v2/` e outras iniciativas do repositório também permanecem independentes.

## 2. Identidade e permissão

- Login do operador: GitHub OAuth via Supabase Auth, sem senha própria. O provedor OAuth GitHub precisa estar configurado no projeto Supabase antes do primeiro uso; essa configuração não pôde ser confirmada pela leitura de metadados.
- Autorização: allowlist server-side de UUIDs `auth.users.id` permitidos, exigindo também uma identidade GitHub validada. Não usar `user_metadata` editável para conceder acesso.
- Admin API: exige JWT válido e verifica a allowlist em cada ação. Sem sessão autorizada, nenhuma leitura operacional ou gravação é feita.
- GitHub: um GitHub App instalado somente em `osvaldosereia/SUCEDOAN12`, com permissão `Contents: read/write`, fornece credencial ao backend. O backend fixa a branch indicada e recusa qualquer outra referência ou caminho fora desta pasta.
- Navegador: recebe apenas a sessão normal do Supabase Auth. Tokens do GitHub, chave `service_role`, segredos Meta e credenciais Bling ficam exclusivamente no servidor. O token OAuth do provedor não é usado para chamadas administrativas.

O conector consultado não expõe os nomes/presença das variáveis secretas. Nenhum valor foi lido. A configuração necessária deverá ser confirmada por presença, sem revelar valores, antes de homologação.

## 3. Catálogo público

Valores monetários são inteiros não negativos em centavos de BRL. IDs são estáveis e nunca dependem do nome exibido.

```ts
type ProductId = string;
type BasketId = string;
type ProductGroupId = string;
type MoneyCents = number; // inteiro >= 0

interface Product {
  id: ProductId;
  name: string;
  brand: string;
  presentation: string;
  /** Effective individual price: offer price when present, otherwise regular price. */
  unitPriceCents: MoneyCents;
  imagePath: string; // relativo a este projeto; sem Base64
  sku: string | null;
  gtin: string | null;
  blingProductId: string | null;
  stockQuantity: number; // inteiro assinado: GitHub é a fonte operacional do saldo
  active: boolean;
}

interface BasketProductGroup {
  id: ProductGroupId;
  label: string;
  category: string;
  productIds: ProductId[];
  minimumQuantity: number;
  maximumQuantity: number;
  initialQuantity: number;
  removalAllowed: boolean;
}

interface Basket {
  id: BasketId;
  name: string;
  active: boolean;
  sortOrder: number;
  /** Commercial starting price, in BRL cents. Never contains the private adjustment as a separate value. */
  basePriceCents: MoneyCents;
  groups: BasketProductGroup[];
}

interface ProductsDocument {
  schemaVersion: 4;
  products: Product[];
}

interface BasketsDocument {
  schemaVersion: 1;
  baskets: Basket[];
}
```

O JSON público não recebe campo para o ajuste interno de preço. O servidor calcula o total a partir do commit do catálogo e de regra privada de preço. O saldo inteiro assinado é público em `products.json` porque o usuário escolheu o GitHub como cadastro e controle operacional do estoque; o Flow só oferece quantidade quando o saldo é positivo. Imagens usam caminho relativo validado, MIME permitido, checksum e tamanho limitado. `products.json` usa `schemaVersion: 4`; `baskets.json` usa `schemaVersion: 1`.

## 3.1 Resultado da Rodada 1 — catálogo inicial

- A seleção foi refeita na configuração ativa de cesta: cinco tamanhos e 61 produtos distintos, ligados por 110 grupos (13 Econômica, 22 Mini, 25 Pequena, 25 Média e 25 Grande). A configuração ativa é a fonte usada para o catálogo inicial; isso difere das dez posições-base descritas na pesquisa histórica de templates.
- Só campos de catálogo/composição foram lidos. Estoque, ajustes internos, cadastro de clientes, pedidos e mensagens não fizeram parte da extração.
- IDs de produto mantêm os identificadores estáveis da origem para reconciliação. IDs de cesta/grupo são nomes estáveis próprios deste projeto. Os campos e documentos resultantes seguem os contratos novos acima.
- Preço individual publicado usa `offer_price` quando existe e, nos demais casos, `price`, convertido para centavos. Essa regra é explícita no novo catálogo; revisar ofertas antes de ligar o runtime.
- Dois produtos não têm `blingProductId` e dois não têm `sku`; eles permanecem no catálogo com o campo ausente em `null`, mas a integração fiscal deverá bloquear esses itens até completar o mapeamento.
- O tratamento de imagens deve registrar SHA-256, dimensões, bytes e origem permitida. Nenhuma URL de origem entra no catálogo de runtime; os caminhos são locais ao projeto.
- A extração não altera a fonte Supabase. Nenhuma migration, deploy, chamada Meta/Bling, publicação ou mensagem foi feita.

## 4. Checkout, cliente e pedido

Contrato lógico inicial; não é migration. Todo pedido conserva a revisão imutável do catálogo e snapshots suficientes para que mudanças futuras no catálogo não alterem pedidos aceitos.

```ts
interface ProductSnapshot {
  productId: ProductId;
  name: string;
  brand: string;
  presentation: string;
  sku: string;
  gtin: string | null;
  blingProductId: string;
  quantity: number;
  unitPriceCents: MoneyCents;
  lineTotalCents: MoneyCents;
}

interface CustomerSummary {
  customerId: string;
  name: string;
  phoneE164: string;
  address: {
    addressId: string;
    street: string;
    number: string;
    complement: string | null;
    neighborhood: string;
    city: string;
    state: string;
    postalCode: string;
    reference: string | null;
  };
}

interface OrderSnapshot {
  catalogCommit: string;
  basketId: BasketId;
  basketName: string;
  channelId: string; // vínculo configurado do número Meta
  customer: CustomerSummary;
  paymentMethod: string;
  items: ProductSnapshot[];
  totalCents: MoneyCents;
}

interface OrderDraft {
  id: string;
  revision: number;
  status: "awaiting_customer_confirmation" | "confirmed" | "cancelled" | "expired";
  snapshot: OrderSnapshot;
  summaryHash: string;
  sourceEventId: string;
  expiresAt: string;
}

type OrderStatus =
  | "received"
  | "packing"
  | "awaiting_invoice"
  | "invoice_authorized"
  | "out_for_delivery"
  | "completed"
  | "attention"
  | "cancelled";
```

O backend resolve o telefone da conversa e consulta `customers`, `customer_phones` e `customer_addresses` existentes; nunca aceita identidade/total enviados pelo navegador ou Flow como fonte de confiança. O Flow lê `stockQuantity` da revisão GitHub fixada; oferece de 1 a `min(6, max(0, stockQuantity))`, com retirada sempre disponível. Ao confirmar, o backend grava uma baixa GitHub idempotente por pedido; saldo negativo permitido não bloqueia a venda/NF-e no Bling.

### Persistência privada nova

Depois que o fluxo for fechado, criar migrations próprias no schema não exposto `whatsapp_atendimento`, com as entidades mínimas:

- `order_drafts`: revisão, hash do resumo, expiração e evento de origem único;
- `orders`: cliente, canal, pagamento, total, snapshots, estado e referência Bling;
- `order_items`: produto e valores congelados, quantidade e estado da separação;
- `order_events`: transições com chave idempotente;
- `integration_jobs`: chave única por pedido/operação, tentativas e resultado da chamada Bling.

Nenhuma tabela é criada nesta rodada. A API de dados pública não expõe esse schema; operações passam pelos handlers do servidor, com autorização explícita e RLS como defesa adicional quando aplicável.

## 5. Limites HTTP dos novos conectores

| Operação | Contrato mínimo | Proteção |
|---|---|---|
| Ler catálogo | `GET /api/v1/catalog` → documento e SHA do commit | Público só para dados do catálogo; sem configuração privada |
| Gravar catálogo | `PUT /api/v1/catalog` com `expectedCommit` e documento → `commitSha` | JWT + allowlist; backend grava somente na branch e pasta permitidas |
| Flow Meta | Endpoint de troca de dados criptografados → resposta criptografada conforme protocolo Flow | Valida/decripta com chaves privadas do canal; separa os dois `phone_number_id`; falha fechada |
| Webhook Meta | Evento recebido com `phone_number_id` e `messages[].id` → aceito uma vez | Verifica assinatura oficial e deduplica por número + ID da mensagem |
| Confirmar pedido | `POST /api/v1/order-drafts/{id}/confirm` com revisão e ação explícita → `orderId` | JWT só para Admin; cliente confirma por evento Meta; chave idempotente impede duplicação |
| Separação | Atualização com versão esperada e resultado por item → novo total e sinal de aceite necessário | JWT + allowlist; conflito de revisão não sobrescreve alteração concorrente |
| Bling | Criar venda, solicitar NF-e e consultar situação usando snapshot do pedido | Credenciais server-side; `integration_jobs` evita repetição após timeout |
| Conectar Bling | `POST /integrations/bling/oauth/start` → URL de autorização; callback troca código e salva tokens | JWT + allowlist no início; `state` aleatório de uso único; flag desligada por padrão; tokens cifrados no banco privado |

O resumo enviado ao cliente será tratado em etapa posterior: lista e quantidade sem preço unitário, total, pagamento, nome, endereço e ações Confirmar/Editar/Cancelar. Só o evento de confirmação explícita cria pedido recebido. Falta que mude o total exige novo aceite antes da etapa fiscal.

## 6. Credenciais server-side necessárias

Os nomes abaixo são referências para configuração; não contêm nem confirmam valores. A rodada não lê, cria, altera ou revela segredos.

- Supabase Edge Functions: variáveis nativas do projeto, `SUPABASE_URL` e chave de serviço apenas no runtime do servidor.
- GitHub OAuth: client ID e client secret do provedor GitHub no Supabase Auth.
- GitHub App: app ID, installation ID e private key para acesso de conteúdo somente ao repositório.
- Meta: app secret, access token, IDs verificados de WABA/número e chave privada por canal para o endpoint de Flow.
- Bling: client ID, client secret e tokens OAuth renováveis guardados no servidor.
- Autorização: lista de UUIDs de operadores permitidos, sem senha local.

## 7. Confirmações da Rodada 0

- O branch remoto existe e o clone local está nele, limpo, no commit `372ba62c2afb69515db6af888b0c63456ff90f2b` antes deste contrato.
- `projetos/whatsapp-atendimento-github/` não existia no branch; esta pasta foi criada sem modificar a raiz, o site público, o Vitrine Admin ou `projetos/dona-antonia-v2/`.
- `osvaldosereia/SUCEDOAN12` é público e a identidade GitHub autenticada tem permissão `admin` no repositório.
- O projeto Supabase `Dona Antônia` (`ssbesxgaijknwsjbsbcz`) está `ACTIVE_HEALTHY`, Postgres 17.6.1. Há endpoints Meta/Bling ativos no projeto atual, mas os relevantes reportam `verify_jwt=false`; sua existência não é prova de autorização adequada nem autorização para reutilizá-los.
- Não foi consultada nenhuma linha pessoal de cliente, pedido ou mensagem, nem valor de segredo. A listagem de metadados não permite confirmar que as credenciais exigidas estão configuradas.
- Nenhuma chamada de API Meta/Bling, migration, deploy, publicação de Flow ou envio de mensagem foi feita.

## 8. Rodada 5 — webhook, checkout e confirmação

- `supabase/functions/whatsapp-checkout-webhook/index.ts` verifica o challenge GET e valida `X-Hub-Signature-256` sobre o corpo bruto do POST. `phone_number_id` só é aceito quando corresponde a `META_PHONE_NUMBER_ID_0975` ou `META_PHONE_NUMBER_ID_1018` configurado no servidor.
- O evento recebido, a criação de sessão e a saída em outbox usam transações/índices idempotentes. A sessão é inserida em `public.whatsapp_flow_sessions` na mesma transação; só o hash SHA-256 do token entra nessa tabela.
- A nova migration local `supabase/migrations/20261026004500_whatsapp_checkout.sql` cria o schema `whatsapp_atendimento` com `webhook_events`, `order_drafts`, `orders`, `order_items`, `order_events` e `message_outbox`. O schema não é exposto pela API pública, tem RLS sem policies e grants restritos a `service_role`. A migration não foi aplicada.
- O token de Flow e o conteúdo de cada mensagem ficam cifrados em AES-GCM na outbox. A confirmação cria pedido e itens em transação somente para o botão `confirm:{draftId}:{revision}`, com deduplicação por mensagem e pedido por rascunho.
- O formato de resposta de Flow aceito pelo handler é versionado como `contract_version: 1`, com `flow_token`, `selections`, `address_id` e `payment_method`. `customer_id` é opcional como confirmação adicional; sem ele, o servidor resolve o cadastro pela sessão/telefone, exige correspondência única verificada e confere endereço ativo. O runtime devolve o `flow_token` à tela final; o ID interno do cliente não é enviado ao Flow. A ligação do JSON gerado pela Rodada 3 e esse payload fica para a Rodada 7; payload inválido falha fechado.
- SKU e ID Bling ausentes bloqueiam criação de rascunho, pois o snapshot operacional precisa preservar o vínculo fiscal futuro. A busca de cliente/endereço usa somente o backend e exige telefone único verificado e endereço ativo selecionado.
- A fila ainda não tem consumidor. Nenhuma chamada Graph API é feita pelo handler; nada foi enviado. IDs oficiais de número/Flow e segredos continuam sem configuração confirmada.
- Variáveis server-side esperadas: `SUPABASE_DB_URL`, `SUPABASE_URL`, credencial Supabase privilegiada para leitura de cliente, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_PHONE_NUMBER_ID_0975`, `META_PHONE_NUMBER_ID_1018` e `META_OUTBOX_ENCRYPTION_KEY` (32 bytes em Base64). O Flow publicado é vinculado por canal na tabela privada `whatsapp_atendimento.channel_flow_bindings`; `META_FLOW_ID_*` não é configuração ativa. Nenhum valor foi configurado ou lido.
- Verificação local: `pnpm build` e `git diff --check`; Deno CLI indisponível para `deno check`. Nenhum teste foi criado/executado e nenhuma migration foi aplicada.

## 8. Dependências antes de homologação

1. Confirmar configuração do provedor GitHub no Supabase Auth e registrar o UUID do operador autorizado em mecanismo server-side.
2. Confirmar presença dos segredos necessários por nome/status, sem revelar valores, no ambiente de desenvolvimento controlado.
3. Confirmar os IDs oficiais de cada WABA/número antes de qualquer teste Meta.
4. Confirmar a conta/token OAuth Bling e os campos mínimos que a NF-e precisa, sem expor tokens.
5. Fechar o contrato de migration própria quando a jornada de checkout estiver pronta.

Até esses itens serem verificados, não há login administrativo pronto para uso, integração live validada nem autorização para operar clientes.

## 10. Rodada 3 — rascunhos de Flow

- `src/domain/flows.ts` define `ChannelFlowDocument` e `BasketFlowDraft`; os documentos `flows/channel-0975.json` e `flows/channel-1018.json` são separados e começam sem IDs Meta.
- Cada rascunho registra nome técnico, cesta, fingerprints SHA dos documentos de catálogo e `validationStatus: "local-only"`. O JSON é gerado do catálogo para uma única tela com quantidades e conclusão.
- A Admin API expõe `GET` e `PUT /flow-drafts/{0975|1018}`. O servidor deriva o caminho de uma enumeração fixa, exige a mesma sessão/allowlist/GitHub App, compara `expectedCommit` e valida o documento contra a revisão atual antes de criar um commit.
- O configurador permite conferir limites por tipo no navegador e baixar o JSON. Ao salvar, outros rascunhos ativos do mesmo canal são regenerados para a revisão nova; cestas inativas são removidas desse conjunto.
- `local-only` descreve somente a validação estrutural do gerador. Não significa validação Flow Builder/Meta, teste real, endpoint dinâmico configurado ou estado publicado. Imagens, cotação confiável, troca de dados e cálculo final do servidor permanecem para as próximas rodadas.
- A etapa não chama a API Meta, não publica Flow e não envia mensagens. Sem OAuth/allowlist/GitHub App configurados, a interface permanece em prévia local e nenhuma escrita é aceita.

## 11. Rodada 4 — runtime local de Flow

- `src/domain/flow-runtime.ts` valida uma opção ativa por grupo, quantidade inteira dentro dos limites e remoção permitida. O cálculo deriva, no servidor, `basePriceCents - referência` e soma as escolhas. O total da composição inicial reproduz o preço-base por construção; o ajuste não é retornado como campo.
- `supabase/functions/whatsapp-flow-runtime/index.ts` aceita apenas POST, limita o corpo, exige `X-Hub-Signature-256`, tenta a chave privada do canal correto via RSA-OAEP/SHA-256, abre AES-128-GCM e responde cifrado com IV invertido. A resposta Data Exchange inclui versão `3.0`. Erro de sessão inválida retorna o protocolo 427 cifrado; assinatura inválida retorna 432; chave/payload incompatível falha fechado.
- A função lê produtos e cestas via GitHub Contents API no commit fixado pela sessão e confere os SHA dos dois blobs. Fotos retornam como URLs raw no mesmo commit, nunca no branch móvel.
- O `flow_token` precisa ser aleatório e opaco (32–128 caracteres URL-safe). O endpoint calcula SHA-256 e consulta somente esse hash. A migration cria `public.whatsapp_flow_sessions` com RLS, sem policies e sem grants para `anon`/`authenticated`; apenas `service_role` recebe SELECT/INSERT/UPDATE. Ela não foi aplicada. O webhook que emitirá tokens e inserirá sessões segue na Rodada 5.
- A consulta, quando o cliente chega à última etapa, usa `customers.primary_whatsapp_e164` exato ou `customer_phones.phone_e164` com `verified_at`; exige cadastro ativo e retorna só nome e endereços ativos para revisão. Resultados `not_found`, `ambiguous` e `missing_address` não selecionam cliente/endereço automaticamente. Nenhuma linha foi lida nesta implementação.
- Segredos esperados no runtime: `META_APP_SECRET`, `META_FLOW_PRIVATE_KEY_0975`, `META_FLOW_PRIVATE_KEY_1018`, `SUPABASE_URL` e credencial privilegiada Supabase. Chave RSA PEM sem passphrase em PKCS#8 ou PKCS#1. Nenhum segredo foi configurado ou lido.
- Os rascunhos de Flow da Rodada 3 continuam `local-only` e não chamam esta função. Como as cestas têm 13–25 grupos, uma tela por grupo pode exceder os limites de rota do Flow. O agrupamento final de telas e a ligação do endpoint ficam para validação estrutural na Rodada 7. Não há publicação, deploy, mensagem, pedido ou leitura de PII nesta rodada.
- Verificação local: `pnpm build` passou; Deno CLI não está instalado para `deno check`; `git diff --check` não reportou erros de whitespace. Nenhum teste automatizado foi criado ou executado.

## 9. Rodada 2 — Admin de catálogo

Implementação nova em `src/admin/` com Vite e TypeScript. O login usa GitHub OAuth pelo Supabase Auth (`signInWithOAuth`); não existe formulário ou senha própria. Sem variáveis públicas de Supabase, o app mostra os arquivos locais somente em prévia, mantendo as edições em memória.

A Edge Function `supabase/functions/whatsapp-admin-api/` mantém `verify_jwt = true`. Em cada requisição, valida o token no endpoint de usuário do Supabase, exige uma identidade de provedor GitHub e compara o UUID autenticado com `ADMIN_ALLOWED_USER_IDS`. A allowlist vazia, origem ausente/não permitida ou configuração Supabase incompleta bloqueia a operação.

O backend cria um token temporário do GitHub App, solicitando `Contents: read` para leitura e `Contents: write` apenas para gravação. O repositório, branch e diretórios são constantes do servidor. A leitura inclui os documentos e SHA atual do branch. A gravação valida o catálogo com chaves permitidas, exige `expectedCommit`, aceita as fotos WebP pendentes dos produtos editados e cria um commit que atualiza os JSONs e as fotos na mesma árvore. Se o branch divergir da revisão recebida, responde `409` sem atualizar a referência.

O app converte fotos escolhidas pelo operador para WebP 240×190 e até 27 KB; o backend revalida Base64, estrutura RIFF/WebP, dimensões e tamanho. Não há exclusão automática de arquivos de imagem antigos. A prévia comercial mostra o `basePriceCents` já cadastrado e as opções por tipo; nenhum ajuste interno é armazenado ou calculado no navegador.

## 12. Rodada 6 — fila, separação e preflight Bling

- A fila `/orders` consulta e retorna somente `id`, `status`, `totalCents`, `basketName`, `customerName`, `city`, `channel`, `itemCount`, `revision` e `createdAt`. A consulta não carrega o snapshot JSON inteiro do pedido.
- O detalhe `/orders/{id}` não retorna `snapshot`, telefone nem ID interno do cliente. Retorna somente `paymentMethod`, `deliveryAddress` com rua, número, complemento, bairro, cidade, UF, CEP e referência, além dos itens e estados operacionais. Dados do endereço só são incluídos após abrir um pedido específico por sessão administrativa autorizada.
- O snapshot do pedido preserva `selections` e `groupId` por item, além do commit de catálogo. A separação lê exatamente esse commit para validar um substituto dentro do mesmo tipo de cesta e recalcular o total no servidor.
- A Admin API adiciona `GET /orders`, `GET /orders/{id}`, `POST /orders/{id}/assign`, `PATCH /orders/{id}/picking` e `POST /orders/{id}/separation/complete`. Exige a autenticação GitHub/allowlist existente e usa conexão Postgres somente server-side. Alterações recebem `revision` esperada e geram `order_events` idempotentes.
- Quantidade faltante ou produto substituto cria `pending_customer_snapshot`, põe o pedido em `attention` e grava proposta cifrada em `message_outbox`. O webhook inbound aceita `accept-adjustment:{orderId}:{revision}` ou `cancel-adjustment:{orderId}:{revision}` somente quando telefone, canal, estado e revisão coincidem. No aceite, atualiza total/snapshot e reinicia a conferência das linhas.
- Concluir separação muda o pedido para `awaiting_invoice` e registra `integration_jobs.create_sale` em `blocked` com códigos de preflight para OAuth, vínculo revisado do contato e conector desabilitado em desenvolvimento. A tela permite cadastrar o ID de contato no schema privado após confirmação manual, sob autenticação e revisão otimista, com evento de auditoria. A referência do Vitrine inclui forma de pagamento em `observacoes`; forma financeira/vencimento ficam fora da criação do pedido de venda. A prévia calcula `delta = total aceito - soma das linhas`; delta positivo é `outrasDespesas`, negativo é `desconto`, igualando o total sem criar linha fictícia. O código não chama a API Bling.
- O pedido recebe uma referência `numeroLoja` determinística `WA-{UUID sem hífens}` com índice único; o servidor monta a requisição candidata da venda somente em memória e persiste apenas SHA-256 e resumo operacional redigido (referência, data, contagem de itens, observação de pagamento e totais). O payload completo, nome/endereço e IDs de catálogo não entram em `result_summary` nem no objeto `integrationJob` retornado. O snapshot operacional permanece somente no banco; a API retorna projeções explícitas por tela. A proposta continua `blocked` e nenhuma chamada Bling é feita.
- Antes de qualquer futura criação, o worker deverá consultar o Bling por `numeroLoja` e comparar os campos controlados com a impressão digital local. Uma resposta inconclusiva, mais de um resultado, divergência ou timeout após POST leva o job a `unknown` e revisão manual; não haverá repetição cega. Um resultado único compatível pode ser reconciliado. Retry após ausência confirmada só poderá ser implementado em uma rodada autorizada, com paginação/filtro exaustivos e reconciliação testada em homologação. Referência: [API oficial do Bling](https://developer.bling.com.br/referencia), recurso Pedidos - Vendas.
- A rota autenticada `POST /orders/{id}/bling-sale/reconcile` chama o cliente read-only, sob `BLING_SALE_RECONCILIATION_ENABLED=true` e `BLING_OAUTH_ENABLED=true`. A consulta usa o filtro oficial `numerosLojas[]`, pagina com `pagina`/`limite` e consulta o detalhe pelo ID retornado. Só classifica ausência depois de uma página incompleta encerrar a busca; 25 páginas cheias, resposta inválida, erro ou divergência de projeção são `unknown`; IDs duplicados são `ambiguous`. Chave idempotente e lease de cinco minutos protegem a execução; resultado redigido é persistido em `order_events` e `integration_jobs.result_summary.reconciliation`. Ambas as flags permanecem `false`; nenhuma requisição ao host da API Bling foi feita.
- A OpenAPI oficial atual para `POST /pedidos/vendas` (consulta em 25/10/2026) marca `contato`, `data`, `dataPrevista`, `dataSaida`, `itens` e `parcelas` como obrigatórios. `VendasItemDTO` marca `valorLista` como obrigatório, mas não define essa propriedade; os campos de data têm descrições condicionais. Cada parcela exige vencimento, valor e `formaPagamento.id`, sem mapeamento definido para as formas de pagamento do WhatsApp. O candidato ainda envia somente `data`, `parcelas: []` e `valorLista` igual a `valor`. `BLING_SALE_CONTRACT_REVIEW_REQUIRED` mantém o job bloqueado até validar payload, forma de pagamento e vencimento em homologação. Fonte: [referência oficial da API Bling](https://developer.bling.com.br/referencia).
- A migration `20261026005000_order_operations_bling.sql` cria colunas e tabelas privadas com RLS e grants apenas a `service_role`; foi criada via Supabase CLI e não aplicada. `SUPABASE_DB_URL` é segredo da Edge Function. A conexão desabilita prepared statements para pooler transacional.
- OAuth Bling tem implementação local: início autenticado e limitado pela allowlist, `state` aleatório armazenado somente como SHA-256 e consumido uma vez, troca server-side pelo endpoint atual `api.bling.com.br`, e tokens cifrados com AES-GCM antes de persistir na tabela privada. `BLING_OAUTH_ENABLED` precisa ser exatamente `true`; `.env.example` mantém `false`, sem valores reais. O código não abre a URL nem executa o fluxo sozinho.
- O callback responde apenas texto simples com cabeçalhos anti-cache/frame/referrer; erros do token endpoint não registram código, corpo ou credenciais. Um helper server-side renova access/refresh tokens sob lock advisory transacional e persiste os tokens rotacionados cifrados. O cliente API expõe somente GET e é chamado apenas pela rota autenticada de reconciliação quando as duas flags estão ligadas; flags desligadas e migration não aplicada impediram qualquer chamada ou refresh nesta rodada. Criação de venda, NF-e, saída e conclusão de entrega/pagamento continuam pendentes.
- O consumidor local da outbox está em `supabase/functions/whatsapp-outbox-worker/`. O gateway não exige JWT Supabase (`verify_jwt=false`), mas a função exige `META_OUTBOX_DISPATCH_SECRET` de pelo menos 32 caracteres, compara o bearer em tempo constante e só executa com `META_OUTBOX_SENDER_ENABLED=true`. O `.env.example` mantém a flag `false`; tokens Meta ficam somente como segredos server-side.
- O webhook e a separação podem acordar o worker com `EdgeRuntime.waitUntil`; o mesmo gate impede esse disparo por padrão. Cada lote tem até cinco registros e reivindica uma linha imediatamente antes de processá-la. Um disparo pode encadear no máximo vinte invocações (cem mensagens); além disso, as pendências aguardam o próximo evento. O worker decifra payloads apenas em memória, valida canal/tipo/destinatário e confere Flow ID, ação e primeira tela contra o vínculo privado do canal e da conta WhatsApp. O destinatário E.164 é convertido ao formato de dígitos esperado no campo `to` da Cloud API.
- Para impedir duplicidade, cada linha é marcada `failed/delivery_unknown` em uma transação antes da chamada externa; só uma resposta 2xx com `messages[0].id` a muda para `sent`. `sent` significa aceita pela Graph API, não necessariamente entregue ou lida; o webhook de status de entrega ainda não está implementado. Falha inequívoca fica `failed` com código curto; timeout, crash ou resposta ambígua nunca é repetido automaticamente e exige reconciliação manual. Isso fornece semântica de tentativa no máximo uma vez, com possível perda em crash antes do envio.
- A área administrativa de mensagens usa `GET /outbox`, autenticada pela sessão GitHub/allowlist. Retorna contagens e até 50 metadados recentes (canal, tipo, estado, horários e código de erro); não seleciona payload cifrado, destinatário ou chave de evento. É somente leitura: não reenvia nem cancela mensagens.
- Nenhum segredo do projeto novo foi configurado, a flag permaneceu desligada e o worker nunca foi invocado. O único canário real foi enviado pelo Vitrine Admin e aceito pela Meta em 26/10/2026, conforme o HANDOFF; não houve chamada Bling.
- Verificação: `pnpm build` compila TypeScript e Vite. `git diff --check` é executado no fechamento. Não foram adicionados nem executados testes; não houve deploy ou migrations. A única chamada externa foi o canário Meta separado descrito no HANDOFF.

## 13. Rodada 7 — Flow dinâmico local

- Decisão vigente do usuário: `products.json` usa `schemaVersion: 4` e mantém o estoque assinado junto ao cadastro de produtos no GitHub. A carga inicial usou um snapshot do saldo vendável Supabase; o runtime consulta apenas o commit GitHub fixado na sessão e não lê estoque Supabase.
- O Flow JSON `6.0` usa Data Exchange `3.0`, uma única tela lógica `GROUP` reutilizada para cada tipo e uma tela terminal `CUSTOMER_REVIEW`; o routing model contém apenas `GROUP -> CUSTOMER_REVIEW`. Em `GROUP`, `Dropdown` oferece uma única escolha de produto por vez com preço/descrição e imagem da opção atual. A última opção é sempre `Não quero esse produto`. A quantidade é `1..min(6, max(0, stockQuantity))` da revisão GitHub fixada e some quando o cliente escolhe retirada.
- Produto e quantidade recalculam o total no endpoint ao mudar o seletor. A resposta final guarda `contract_version: 1`, `flow_token`, `selections` como JSON serializado, `address_id` e `payment_method`; o webhook valida os campos e rejeita mudanças nos dados comerciais desde a sessão, mas permite movimento de estoque isolado e a baixa pode resultar em saldo negativo por decisão do usuário. É obrigatório manter pelo menos um item na cesta.
- A saída da tela final apenas cria um rascunho/entrada na outbox. Confirmar, Editar e Cancelar continuam no resumo posterior da conversa; somente `Confirmar pedido` cria o pedido. O consumidor local está implementado e desligado por padrão; a conclusão do Flow não confirma nem envia sozinha uma mensagem durante o desenvolvimento.
- A consulta a cliente aceita somente cadastro ativo e único com endereço ativo. A tela orienta procurar atendimento se não houver correspondência/endereço. Criar cadastro/endereço e editar dados manualmente no Flow exigem contrato de escrita separado e não são realizados por esta versão.
- A quantidade oferecida é de 1 a `min(6, max(0, stockQuantity))`. Ao confirmar o pedido, o webhook grava uma baixa idempotente no GitHub; commits concorrentes são refeitos sobre a revisão mais recente e o saldo pode ficar negativo. Saldo negativo não impede a venda/NF-e no Bling.
- A validação no Meta Flow Builder e a renderização em aparelho continuam pendentes. Um canário separado, pelo painel do Vitrine Admin, foi aceito pela Graph API em 26/10/2026; nenhum Flow foi publicado e o worker desta aplicação não foi usado. Nenhuma migration ou função desta aplicação foi implantada/aplicada. Nenhum teste automatizado foi criado ou executado.

Dependências externas seguem versões fixas no `package.json` e lockfile pnpm. O provedor OAuth, allowlist, GitHub App e origens permitidas permanecem sem configuração confirmada. Nenhum secret foi criado/lido, nenhuma função foi implantada e nenhuma migration desta aplicação foi aplicada. A única chamada Meta foi o canário descrito no HANDOFF; não houve publicação Flow nem chamada Bling.

## 14. Atualização de estoque e vínculo por canal — 26/10/2026

- Estoque é controlado em GitHub. O saldo inicial foi importado uma vez do saldo vendável Supabase; o runtime não consulta estoque Supabase. `stockQuantity` pode ser negativo, mas o Flow só oferece quantidades positivas até seis e limitadas ao saldo da revisão GitHub.
- Confirmar o pedido cria um commit GitHub atômico de `products.json` e marcador opaco, deduplicado por UUID do rascunho. A baixa ocorre antes da transação final Supabase; se houver falha intermediária, a repetição encontra o marcador e conclui o pedido sem descontar novamente. Saldo negativo não bloqueia o pedido ou o caminho Bling.
- A tabela pública `ops2_meta_whatsapp_flow_bindings_v1` pertence a `registration_flow` e não é usada. A migration nova `20261026040544_whatsapp_atendimento_channel_flow_bindings.sql` cria o vínculo privado e exclusivo por canal/conta no projeto greenfield. O Admin exige Flow publicado do WABA correto, sem erro, endpoint correspondente e chave de criptografia verificada antes de vincular.
- Webhook e outbox usam esse vínculo por canal, sem `META_FLOW_ID_*`. `META_OUTBOX_SENDER_ENABLED=false` permanece o gate global. Nenhuma migration foi aplicada, função implantada, Flow publicado ou mensagem enviada pelo novo projeto.
- Seguem pendentes os segredos e a autorização do Admin, aplicação controlada das migrations, validação do Flow em aparelho, revisão da outbox e contratos de escrita de venda/NF-e/entrega no Bling.
