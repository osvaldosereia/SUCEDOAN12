# Contratos mínimos — Rodada 0

Estado: contratos técnicos registrados; nenhum endpoint, schema ou segredo foi implantado. Base: branch `project/whatsapp-atendimento-github-20261025` do repositório `osvaldosereia/SUCEDOAN12`.

## 1. Isolamento e fontes de dados

- Código novo: somente em `projetos/whatsapp-atendimento-github/`.
- Catálogo público versionado: arquivos novos do projeto no GitHub, lidos por SHA de commit para manter cada cotação reproduzível.
- Cliente/endereço: consulta server-side ao Supabase canônico por telefone E.164; retornar somente os campos necessários ao checkout.
- Pedidos: modelo transacional novo no schema privado `whatsapp_atendimento`; não ler nem escrever `public.orders`, tabelas antigas de draft, RPCs ou APIs de pedido existentes.
- Meta e Bling: conectores novos e server-side; nenhum endpoint existente será importado ou usado como dependência.
- Ajuste interno da cesta, dados pessoais, pedidos, sessões e credenciais não entram em arquivos públicos nem no payload do Flow.

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
  schemaVersion: 1;
  products: Product[];
}

interface BasketsDocument {
  schemaVersion: 1;
  baskets: Basket[];
}
```

O JSON público não recebe campo para o ajuste interno de preço nem informação de estoque. O servidor calcula o total a partir do commit do catálogo e de regra privada de preço. Imagens usam caminho relativo validado, MIME permitido, checksum e tamanho limitado. `products.json` e `baskets.json` são documentos separados, ambos com `schemaVersion: 1`.

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

O backend resolve o telefone da conversa e consulta `customers`, `customer_phones` e `customer_addresses` existentes; nunca aceita identidade/total enviados pelo navegador ou Flow como fonte de confiança. A primeira versão não consulta estoque automático: itens inativos não são oferecidos e a equipe registra falta durante a separação.

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

## 9. Rodada 2 — Admin de catálogo

Implementação nova em `src/admin/` com Vite e TypeScript. O login usa GitHub OAuth pelo Supabase Auth (`signInWithOAuth`); não existe formulário ou senha própria. Sem variáveis públicas de Supabase, o app mostra os arquivos locais somente em prévia, mantendo as edições em memória.

A Edge Function `supabase/functions/whatsapp-admin-api/` mantém `verify_jwt = true`. Em cada requisição, valida o token no endpoint de usuário do Supabase, exige uma identidade de provedor GitHub e compara o UUID autenticado com `ADMIN_ALLOWED_USER_IDS`. A allowlist vazia, origem ausente/não permitida ou configuração Supabase incompleta bloqueia a operação.

O backend cria um token temporário do GitHub App, solicitando `Contents: read` para leitura e `Contents: write` apenas para gravação. O repositório, branch e diretórios são constantes do servidor. A leitura inclui os documentos e SHA atual do branch. A gravação valida o catálogo com chaves permitidas, exige `expectedCommit`, aceita as fotos WebP pendentes dos produtos editados e cria um commit que atualiza os JSONs e as fotos na mesma árvore. Se o branch divergir da revisão recebida, responde `409` sem atualizar a referência.

O app converte fotos escolhidas pelo operador para WebP 240×190 e até 27 KB; o backend revalida Base64, estrutura RIFF/WebP, dimensões e tamanho. Não há exclusão automática de arquivos de imagem antigos. A prévia comercial mostra o `basePriceCents` já cadastrado e as opções por tipo; nenhum ajuste interno é armazenado ou calculado no navegador.

Dependências externas seguem versões fixas no `package.json` e lockfile pnpm. O provedor OAuth, allowlist, GitHub App e origens permitidas permanecem sem configuração confirmada. Nenhum secret foi criado/lido, nenhuma função foi implantada, nenhuma alteração Supabase foi feita, e não houve chamada Meta/Bling, publicação de Flow ou mensagem real.
