# Plano de execução atualizado — Admin WhatsApp Dona Antônia

**Atualizado:** 27/10/2026, após auditoria do ingresso de pedidos Meta.
**Repositório:** `osvaldosereia/SUCEDOAN12`, branch `codex/whatsapp-admin-greenfield-20261026`.
**Especificação funcional:** [pesquisa-e-plano.md](pesquisa-e-plano.md) e [caderno-tecnico.md](caderno-tecnico.md).
**Plano anterior:** [arquivado](archive/plano-execucao-projeto-novo-superado.md); ele se baseava no projeto Supabase “NOVO” e não deve orientar trabalho atual.

## Estado atual do rollout — 27/10/2026

O proprietário recusou staging com cobrança recorrente e autorizou prosseguir no Supabase original. Conferência somente leitura em 27/10/2026 confirmou as sete migrations greenfield deste repositório e as 14 Edge Functions correspondentes no projeto `ssbesxgaijknwsjbsbcz`; as funções estão ativas com os modos JWT esperados. Os endpoints legados continuam intactos. Isso não libera pedidos reais: as duas chaves de Flow ainda não estão verificadas, não há Flow vinculado aos números e o novo webhook/Flow ainda não foi conectado nas contas Meta. Também faltam fechar as opções de cesta, publicar o Admin e homologar Meta e Bling. O detalhe verificável está no [ledger de implementação](implementation-ledger.md).

## Decisões fixas

1. **Backend:** usar somente o Supabase original `ssbesxgaijknwsjbsbcz` ("Dona Antônia"). `wvpzudjujtmyspluwhvx` ("Dona Antônia - NOVO") foi excluído pelo Dashboard em 27/10/2026 após confirmação do proprietário; V2 e AME MAIS ficam intactos. A anotação antiga de “nenhum SQL/deploy” foi supersedida pelo rollout aditivo registrado no ledger; não houve envio de mensagem, alteração do callback Meta, escrita no Bling ou emissão fiscal.
2. **Código:** aplicação e telas greenfield. Integrações operacionais já existentes são chamadas pelos gateways atuais após revisar autenticação, papéis, payloads, idempotência e efeitos. Nenhum arquivo de código antigo é copiado.
3. **Segurança:** o browser usa somente URL e chave publishable. Todo dado comercial vem de Edge Function protegida por sessão e associação ativa em `admin_users`. Nunca consultar `public.products`, `admin_users`, Storage ou RPC privilegiada diretamente pelo browser quando o projeto não concede grants.
4. **Migrations:** não criar um segundo conjunto de `products`, `customers`, `orders`, `product_images`, nem bucket. DDL só entra no plano se a auditoria provar lacuna real e a alteração for aditiva, não destrutiva e revisada.
5. **Canais:** manter as duas contas Meta em WABAs distintas. `phone_number_id`, token, Flow, catálogo, templates e estado de conexão são associados a cada conta; não presumir credencial ou catálogo compartilhado.
6. **Pedidos:** Flow e cada carrinho do Catálogo Meta sempre criam pedidos separados, sem janela de tempo para união. O Flow escolhe produto/quantidade por componente, inclui foto em cada opção, fecha pagamento/endereço e envia resumo sem preço individual. Concluir o Flow não confirma a compra; o aceite explícito cria o pedido em PRODUÇÃO. Separação e sincronização de pedidos/estoque com o Bling serão entregues antes da emissão fiscal.
7. **Emissão fiscal por último:** emissão manual e automática de NF-e ficam fora de todas as fases anteriores. `order_separation_complete` pode iniciar integrações fiscais em segundo plano; por isso, enquanto a fase fiscal estiver desativada, o Admin só poderá concluir a separação quando o estado fiscal consultado comprovar `issue_enabled=false`. Se a consulta falhar ou o estado for desconhecido, bloquear a conclusão. Na última fase, validar o caminho fiscal no ambiente isolado e liberar emissão e expedição somente depois dos gates anteriores.

## Contratos já conferidos

| Área                     | Gateway existente                                                                                                                                                                | Uso planejado                                                                                                                                          | Limite conhecido                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Produtos                 | `admin-products-live-v1?action=products`                                                                                                                                         | GET paginado para catálogo do Admin                                                                                                                    | Internamente valida Bearer com `auth.getUser()` e `admin_users.is_active`; o payload mapeia `cost_cents`, portanto o app filtra campos no servidor antes de renderizar.                                                                                                                                                                                                                                                                         |
| Clientes do atendimento  | Funções RPC autenticadas `ops2_admin_attendance_customer_*_browser_v1`                                                                                                           | Buscar, reconciliar, vincular, criar e editar via sessão Supabase do funcionário; não há Edge Function ativa chamada `admin-attendance-customer-v1`    | Os wrappers conferem `auth.uid()`, associação ativa e papel; `viewer` pode pesquisar/consultar, mas não gravar. Não consultar tabelas diretamente nem usar service role.                                                                                                                                                                                                                                                                        |
| Inbox e pedidos WhatsApp | `admin-whatsapp-ops-v1`                                                                                                                                                          | Conversas, ações de atendimento e identidade do canal, após inspecionar contrato                                                                       | O código antigo tem aliases de versão; confirmar ação em execução antes de ligar UI.                                                                                                                                                                                                                                                                                                                                                            |
| Flow e configuração Meta | `admin-basket-configuration-v1?action=flow_list`; runtimes `whatsapp-flow-runtime`, `whatsapp-1018-basket-flow-v1`, `whatsapp-flow-data-exchange-v1`, `whatsapp-meta-webhook-v1` | Ler a configuração pelo gateway e conferir etapa, alternativa, foto e quantidade                                                                       | `admin-whatsapp-flow-v1` está ativo no painel, mas sua implementação é stub aposentado (`retired_outside_site_vitrine_admin`); não chamar. `whatsapp-flow-runtime` v5 mostra imagem dinâmica após escolher o produto, mas os itens de seleção não levam `image`. `whatsapp-1018-basket-flow-v1` v7 embute imagem na opção, mas o código declara o endpoint como canário restrito. Não foi provado qual runtime atende cada um dos dois números. |
| Cestas                   | `admin-basket-configuration-v1?action=list                                                                                                                                       | flow_list`; `admin-basket-guided-v1?action=model_editor`                                                                                               | Consultar modelos, tipos, opções, fotos e quantidades pela sessão                                                                                                                                                                                                                                                                                                                                                                               | `flow_list` entrega alternativas com `image_url`, preço comercial e ativo; isso prova URL cadastrada, não validação/renderização Meta. `admin-basket-guided-v1` também pode devolver custos no cartão de produto/receitas; nunca repassar resposta bruta ao navegador. Não duplicar tabelas nem endpoints. |
| Pedidos e Bling          | `admin-products-live-v1?action=orders`, `action=order`; transições em `action=order_update` e operações canônicas separadas                                                      | Consultar quadro/ficha e usar somente as operações canônicas depois de revisar efeitos                                                                 | O GET de lista limita `limit` a 5. Busca por texto não combina com `tab`: ela pesquisa entre status. `order_update` reserva estoque ao confirmar; despacho/entrega têm bloqueios e ações próprias. O antigo `fiscal_enabled=false` não prova que o caminho humano esteja desligado: a configuração e a implementação atuais têm controles fiscais separados. Nunca usar transição genérica como atalho.                                         |
| Imagens                  | `admin-product-images-v1` e `admin-product-image-editor-v1` estão aposentados (HTTP 410); `admin-product-image-v1` é implementação local nesta branch, ainda não implantada      | Upload pela ficha do produto, com token assinado criado no Edge Function autenticado; salva somente `products.image_url` e registra `admin_audit_logs` | Reutiliza `product-images` (leitura pública, JPEG/PNG/WebP até 500.000 bytes), sem política ampla de escrita nem nova tabela. O `image_url` alimenta a configuração do Flow, mas não comprova foto em cada opção ou publicação aprovada pela Meta.                                                                                                                                                                                              |

Os nomes acima vêm do inventário fornecido e histórico consultado. Cada operação de escrita exige leitura do handler atual e documentação oficial antes de entrar na tela. `health` de uma Edge Function não prova que seus outros caminhos estejam autorizados nem funcionais.

## Tarefas em sequência

### 0. Fechar inventário seguro do backend

- Registrar projeto, schemas, tabelas/views envolvidas, estado de Auth/RLS/grants, bucket e funções por fluxo.
- Para cada gateway: anotar método, `action`, parâmetros, forma de resposta, papéis, erros, idempotência e efeitos externos.
- Conferir no histórico GitHub os nomes de variáveis e consumidores; nunca mostrar nem copiar valores de tokens, senha, `service_role` ou Vault.
- Marcar todo dado como **confirmado**, **a conferir em execução**, **histórico** ou **proibido para o MVP**.

**Saída:** contratos curtos em `caderno-tecnico.md`; chamadas de produção somente leitura.

### 1. Sessão e estrutura visual

- Manter Next.js App Router, React, TypeScript, `@supabase/ssr` e o estilo simples de Loja Integrada: navegação curta, tabelas legíveis, formulários em blocos, rótulos cotidianos e ação primária clara.
- `/login` valida a sessão Supabase. O layout não consulta `staff_profiles` do projeto experimental.
- Cada leitura/mutação passa pelo gateway que valida o usuário e seu papel real. Se a sessão não for autorizada, mostrar estado de acesso sem revelar detalhes internos.
- Não exibir papel estimado no cabeçalho. Exibir somente estado de sessão até haver contrato seguro de “quem sou eu”.
- A página `/` lê em paralelo os adapters autenticados existentes: contagens exatas de Pedidos (`new`, `separate`, `ready`), alternativas ativas com foto nas Cestas, contas Meta cadastradas e estado de configuração do gateway Bling. Cards de pedido abrem a etapa correspondente. Não calcular total de conversa a partir da fila limitada a 50; não tratar URL de imagem como renderização Flow, conta cadastrada como health Meta, nem timestamp de Bling como OAuth atual. Falha de leitura aparece como `—`/consulta indisponível, nunca como zero.

**Aceite:** nenhuma página autenticada consulta tabela operacional pelo browser; acesso negado não retorna produto, cliente, pedido ou dados de custo.

### 2. Produtos — primeira fatia de leitura implementada

- Criar listagem server-side de `admin-products-live-v1?action=products` com busca por nome/SKU, filtro ativo/inativo e 50 linhas por página.
- O servidor encaminha o JWT da sessão e a chave publishable; usa `cache: no-store`.
- Validar o JSON recebido e retornar uma projeção pequena: ID, nome, SKU, categoria, ativo, preço de venda, estoque, unidade e URL HTTPS da imagem.
- Descartar explicitamente custo, detalhes de lote, chaves, metadados operacionais e todos os campos desnecessários antes de serializar para a página.
- Imagens e escrita ficam fora desta primeira fatia.

**Aceite:** lista real lê pelo gateway; busca/filtros/paginação usam os parâmetros existentes; erros 401/403/rede aparecem com texto simples; custo nunca chega ao cliente.

### 3. Edição de produtos, fotos e Catálogo Meta

- Inspecionar ações `product_detail`, `product_save`, `product_quick_save`, `product_stock_set` e contratos de edição de imagem.
- A listagem e a nova ficha de produto são somente leitura. A ficha usa `product_detail` do gateway `admin-products-live-v1` e projeta campos explícitos; `cost_cents`, cadastro fiscal, identificadores auxiliares e metadados internos são descartados no servidor.
- As duas funções antigas de imagem estão aposentadas (HTTP 410); não fazer upload com elas nem tratar atualização de URL como processamento, miniatura ou aprovação Meta. Para Flow, a tela mostra imagem cadastrada, mas não indica “apta” enquanto não existir prova verificável do processamento/aprovação.
- Implementar apenas os campos que a função permite e separar preço avulso, custo interno, preço por opção de cesta e dados fiscais.
- Usar as funções de imagem e o bucket existente após confirmar RLS e contrato; nunca apagar Storage antes de a função confirmar remoção de vínculo.
- Confirmar como listar/sincronizar vínculos `product_retailer_id`, por número/WABA e catálogo; exigir prévia antes de publicar.
- Tornar imagem/miniatura Flow requisito de publicação de alternativa; não marcar foto pronta somente porque existe URL.

**Aceite:** edição de produto, imagem ou catálogo usa endpoint autenticado, registra resultado e não mostra campos financeiros a papel sem permissão.

### 4. Clientes e endereços

- Usar `ops2_admin_attendance_customer_search_browser_v1` para busca (mínimo de dois caracteres, até 20 resultados, documento mascarado) e `..._editor_browser_v1` para carregar cadastro somente quando há uma conversa vinculada.
- Mostrar o telefone da conversa como somente leitura. `..._reconcile_browser_v1` só é chamado após ação explícita “Verificar cadastro existente”; ele vincula automaticamente apenas quando a resolução canônica por telefone é inequívoca. Se houver mais de um candidato, exigir busca e vínculo manual explícito com `..._link_browser_v1`.
- Para ficha não encontrada, criar nome, documento/email opcionais e endereço por `..._create_browser_v1`; a função deriva o telefone da conversa e cria o vínculo.
- Se a conversa não tiver telefone E.164 (por exemplo, identidade somente BSUID/username), não oferecer criação de ficha por esta função; pedir o compartilhamento do número ou permitir o vínculo manual de cadastro já existente.
- **Editor seguro — candidato local:** `20261027211734_customer_editor_safe_update_v1.sql` define projeção com CPF/CNPJ mascarado e até 20 endereços ativos, além de writer transacional ancorado à conversa. O writer recebe o `address_id` escolhido, verifica propriedade/atividade sob lock, compara revisões `updated_at`, atualiza somente nome e endereço permitido e registra auditoria sem valores pessoais. Telefone, CPF/CNPJ, email, status, consentimento e flags de endereço permanecem protegidos. A validação de UF rejeita valores que não sejam exatamente duas letras; a migração não foi aplicada.
- **Compatibilidade enquanto a migração não existe:** a leitura tenta o novo RPC seguro; se ainda não estiver instalado, usa o RPC antigo somente no servidor, mascara o documento antes de serializar e deixa `canEdit=false`. O formulário de alteração só aparece quando a projeção segura está disponível. Isso evita que a ausência da migração quebre a consulta ou exponha o writer antigo.
- Toda chamada RPC é feita no servidor com `createClient()` e cookies/JWT do funcionário; cada ação autentica novamente e o wrapper ainda valida vínculo e papel. Nunca enviar dados de formulário ao banco sem whitelist e validação local.
- Manter nome de perfil, nome confirmado, telefone E.164 e BSUID como dados distintos. Não unir cadastros por semelhança.
- A conversa pode existir sem ficha identificada; o endereço usado no pedido é confirmado e copiado como snapshot.

**Aceite desta fatia:** busca geral mostra dados mínimos e documento mascarado; ficha/endereço vinculados à conversa aparecem em leitura; busca, reconciliação, vínculo escolhido e criação usam os wrappers existentes; não se consulta tabela operacional diretamente pelo browser. **Estado local:** UI, Server Action, repositório e migration candidata foram implementados e a checagem estática local passou. **Gate de gravação:** a migration ainda não foi validada semanticamente nem aplicada em base isolada. O banco local existente pertence ao schema experimental legado e não é baseline adequado; preparar uma cópia/branch canônica isolada, validar dependências, PL/pgSQL, grants e efeitos dos triggers, e então habilitar a migration antes de permitir edição real.

### 5. Inbox para dois números

- A leitura de `admin-whatsapp-ops-v1` e a tela `/atendimento` já estão implementadas para lista, contexto, mensagens e envio de texto autenticado.
- A conversa mostra imagem, áudio, vídeo, documento e figurinha recebidos por ação explícita “Carregar mídia”. O servidor chama a ação `media` existente do gateway autenticado e valida origem, bucket privado, MIME e expiração da URL assinada. O carregamento não ocorre em lote; o gateway baixa/cacheia a mídia ao primeiro pedido e assina novamente em atualizações.
- O histórico transforma tipos conhecidos (botão, interativa, localização, contato, reação e Catálogo) em rótulos claros sem tentar interpretar payload oculto. Não há transcrição de áudio/vídeo porque o gateway não fornece legendas.
- Exibir canal `0975` ou `1018` com número, WABA e conversa separados; atribuição, leitura, filtros, transferência ANA/humano e janela da Meta ficam visíveis sem tela técnica.
- Confirmar no fluxo de execução que a ingestão de webhook persiste de forma idempotente antes de qualquer resposta, valida assinatura e roteia por `phone_number_id`/WABA. Eventos duplicados não podem repetir resposta nem pedido.
- Áudio, imagem e pedido de catálogo aparecem como eventos da conversa com estado de processamento compreensível.

**Aceite:** falta validação real, autorizada e controlada de tráfego por número; sem isso, não declarar roteamento/isolamento operacional comprovado.

### 6. Cestas e configuração de Flow

- Auditar funções atuais de cestas antes de editar; inventariar modelos, slots e alternativas sem assumir que IDs/valores históricos ainda valem.
- A leitura Flow confirmada é `GET /functions/v1/admin-basket-configuration-v1?action=flow_list`. O gateway encaminha o JWT do usuário à RPC `admin_basket_flow_configuration_v1()`, que requer usuário autenticado associado a `admin_users` ativo e papel diferente de `viewer`. A resposta contém `basket_types`, `product_types` com `options` e `quantities`.
- Consulta agregada ao projeto canônico: 61 alternativas ativas dentro de etapas ativas; 61 têm URL HTTPS; 59 apontam para o Storage público `product-images` e 2 para o caminho do catálogo no GitHub, ambos admitidos pela allowlist do runtime geral. Nenhuma alternativa habilitada está sem URL de imagem.
- A tela `/cestas` está implementada como conferência visual somente leitura: cada tipo de produto aparece como etapa ordenada; cada alternativa mostra foto cadastrada ou pendente, nome/embalagem, preço comercial e situação ativa. Mostrar valores de quantidade que vierem configurados para cada modelo/etapa. Exibir contagem de fotos ausentes; nunca afirmar que URL equivale a aprovação ou renderização pelo Flow.
- `admin-whatsapp-flow-v1` (implantação ativa v24) retorna `retired_outside_site_vitrine_admin`; não usar. Separar configuração comercial do Flow que está publicado no runtime Meta; auditar `whatsapp-flow-runtime`, `whatsapp-flow-data-exchange-v1`, webhook e os dois números antes de gerar, testar ou publicar Flow.
- Auditoria dos handlers: `whatsapp-flow-runtime` v5 devolve a foto do produto escolhido, mas seus objetos de opção só carregam título, descrição e disponibilidade; `whatsapp-1018-basket-flow-v1` v7 coloca imagem codificada em cada linha, mas está explicitamente restrito a canário. Para cumprir “foto em cada opção em ambos os números”, uniformizar o runtime oficial de cada canal e verificar a publicação/entrega nos dois números.
- A rota `admin-basket-guided-v1?action=model_editor` retorna molde e categorias; a resposta adicional de kits/receitas contém custo e preço. Usar uma projeção explícita no servidor antes de qualquer exibição, inclusive para usuários operadores.
- Para cada cesta, definir ordem dos componentes, alternativas de produto, preço da opção, quantidade permitida e extra interno oculto no total.
- Um Flow step trata de um componente: opções com foto e preço, quantidade de 0 a 6 (zero significa retirar quando o slot permite) e botão **Próximo**. Não mostrar componentes em lote.
- Preço/estoque vêm do servidor, que valida e calcula cada avanço. Seleção de cliente/endereço, forma de pagamento e resumo final vêm depois dos produtos.
- O candidato local usa Flow JSON `7.3`, Data API `3.0` e Message Version `3`. Validar um rascunho independente em cada WABA: criar com `POST /{WABA-ID}/flows`, enviar `supabase/flows/basket-order-v1.json` via multipart em `POST /{FLOW-ID}/assets` (`name=flow.json`, `asset_type=FLOW_JSON`), corrigir até `validation_errors` ficar vazio e conferir `status`, versões, saúde e preview pela leitura de `GET /{FLOW-ID}`. Registrar o `flow_id` de cada WABA sem guardar token.
- Validação de JSON e preview não provam que fotos aparecem em cada opção nem que o Data Exchange percorre a jornada. Homologar esses comportamentos separadamente em cada WABA. Publicar exige gate próprio: `POST /{FLOW-ID}/publish` é irreversível e torna Flow/asset imutáveis; não faz parte da validação de rascunho.

**Aceite:** uma cesta de teste percorre todas as etapas, com fotos por opção, retorno/retomada segura e preço calculado no servidor.

**Aceite intermediário do observatório:** implementação local permite conferir modelos/tipos/alternativas/quantidades e distinguir foto cadastrada de foto ausente; falta validar sessão real autorizada e renderização nos dois números. Nenhum custo, metadado cru, publicação ou estado de aprovação não comprovado chega à tela.

**Pendente para fotos no Flow real:** URL HTTPS presente não prova que uma opção de escolha carrega imagem nem que a tela publicada de cada número a renderiza. O runtime geral atual não inclui imagem em cada opção; o endpoint que inclui é canário. Não liberar o requisito como concluído até validar os dois roteamentos Meta.

### 7. Catálogo Meta e criação de pedido

- **Estado auditado em 27/10:** o runtime `whatsapp-meta-webhook-v1` converte `order` em `unknown`; `whatsapp-meta-order-router` não roteia `type=order`; `whatsapp-checkout-webhook` só conclui cesta pelo Flow e grava em `whatsapp_atendimento.orders`; `admin-whatsapp-ops-v1` não expõe pedidos; `admin-products-live-v1` e `/pedidos` operam somente `public.orders`. Portanto carrinhos Meta ainda não viram pedidos e pedidos confirmados no checkout do Flow não aparecem no quadro atual.
- Tratar `public.orders` como o sistema operacional único do Admin/Bling. Flow e Catálogo entram como origens distintas nesse pipeline; não mostrar uma segunda lista operacional nem escrever o mesmo pedido nos dois schemas.
- Persistir rascunhos em uma entrada própria por evento/origem, identificada por conta Meta + ID da mensagem. Só após o botão de confirmação explícita deve existir um pedido operacional. Usar uma escrita transacional e idempotente que preserve as invariantes de cadastro, preço, estoque, status e fila Bling do gateway canônico.
- O índice parcial único `public.orders_idempotency_key_uq` existe, mas o RPC atual `create_canonical_cart_order_v2` não recebe ID de evento. Criar uma camada idempotente que associe evento e pedido na mesma transação; não contar apenas com o dedupe do webhook nem com tentativa posterior de `UPDATE` do status.
- Não usar `create_vitrine_cart_order_v3` como criação de rascunho: ele chama reserva de estoque imediatamente. Para o aceite do cliente, definir e validar transição canônica equivalente à confirmação operacional (`created → confirmed`) e à reserva única de estoque. O contrato atual `order_update` é um gateway de operador, não um endpoint público para webhook.
- Para Catálogo, aceitar somente `product_retailer_id`, `quantity`, `currency`, `catalog_id` e mensagem/event ID como dados de referência. Resolver o produto pelo catálogo específico do número/WABA, recalcular o valor com preço e estoque correntes do Supabase e jamais confiar em `item_price` recebido como preço final. Produto sem vínculo, diferença de preço, moeda divergente ou estoque insuficiente ficam para novo resumo/aceite ou atendimento humano.
- Flow usa `interactive.nfm_reply.response_json`; preservar seu próprio resumo, evento, aceite e pedido. Catálogo usa outro evento Meta e sempre produz pedido separado. Nenhuma janela temporal ou proximidade de mensagens une as duas intenções.
- Antes de criar cada rascunho, vincular à conversa/cadastro somente por identidade confiável. Pagamento/endereço só são reutilizados quando pertencem ao cadastro ligado; qualquer alteração material exige novo aceite.
- Exibir origem humanizada na fila: `WhatsApp · Flow`, `WhatsApp · catálogo`, `WhatsApp · atendimento`, `Loja`, `Recompra` ou `Origem não identificada`. A UI já mapeia esses rótulos; eventos ainda não chegam com Flow/Catálogo até a mudança do backend.
- Não criar tabela em schema exposto sem RLS e grants explícitos. O changelog Supabase informa que a exposição automática de novas tabelas será desligada para todos os projetos em 30/10/2026. Preferir o ledger técnico em `private`, acessível somente ao runtime; o Admin continua usando o gateway autenticado atual.

**Aceite:** evento duplicado não duplica rascunho/pedido; dois carrinhos, Flow+carrinho e novo Flow originam pedidos canônicos independentes visíveis em `/pedidos`, com origem correta e sem reserva dupla; nenhuma mutação atinge Bling até a etapa definida pelo fluxo operacional.

### 8. Quadro de pedidos e Bling

- Listagem por `admin-products-live-v1?action=orders`; ficha por `action=order&id=<uuid>`. O adapter projeta no servidor apenas campos de operação e exclui CPF, `metadata` bruto e campos fiscais/internos.
- Filtros suportados pelo gateway: `new` = `created`/`storefront_received`; `separate` = `confirmed`/`processing`; `ready` = `ready`/`out_for_delivery`; `delivered` = `delivered`. Resultados de busca de texto são globais entre os status porque o handler não aplica `tab` quando `q` existe. `limit` é limitado a 5 e a contagem por etapa vem na primeira página.
- A separação usa ações canônicas distintas: `order_separation_get`, `order_separation_assign`, `order_separation_item_set` e `order_separation_complete`. O backend valida JWT, papel, pedido, responsável, estado, revisão otimista (`order_updated_at`) e pré-condições; a UI não chama tabela de negócio diretamente.
- Na etapa `confirmed`, marcar um item pode acionar sincronização/aprovação de estoque no Bling e mover o pedido a `processing`. A tela pede confirmação antes dessa tentativa e mostra a pendência retornada pelo gateway. O operador marca cada item como separado ou indisponível; concluir exige responsável, pelo menos um item e todos os itens separados, sem pendências/indisponibilidades, mais confirmação explícita.
- `order_separation_complete` pode baixar estoque, mover o pedido para `ready`, avisar o cliente e iniciar integrações fiscais em segundo plano. Antes da fase fiscal final, a ação do Admin exige leitura fiscal válida com `issue_enabled=false`; leitura ausente, falha ou emissão automática habilitada bloqueiam a conclusão. Em staging, manter esse gate desligado durante todos os marcos anteriores. Falha no aviso ou integração deve permanecer visível e recuperável; a ação de conclusão não equivale a emissão de NF.
- `order_update` continua fora da UI: `created → confirmed` reserva estoque; as demais transições genéricas não substituem operações de despacho/entrega. Não regravar enums/status nem editar tabelas operacionais pelo app.
- Antes do despacho, `order_fiscal_status` fornece uma projeção de leitura. `order_dispatch_start_v4` só é oferecida quando o pedido está `ready`, o gateway confirma NF-e autorizada e `can_dispatch=true`; a UI usa idempotency key `dispatch-v4:<orderId>`. O gateway pode movimentar estoque físico no Bling quando ele for a autoridade. A confirmação explica esse efeito. O Admin não emite NF-e.
- A entrega só pode ser concluída em `out_for_delivery`. Para pedido sem liquidação anterior, `order_delivery_complete_v3` exige método allowlisted e valor exato em centavos igual ao total; chave idempotente `delivery-v3:<orderId>`. O Admin só oferece captura quando o gateway reporta `payment_status=pending` e nenhuma `payment_source` anterior. Estado ausente, origem existente ou pagamento de outra origem bloqueiam captura.
- Se já houver liquidação com origem `delivery` e estado `captured`, `synced` ou `needs_review`, usar `order_delivery_finalize_v4` sem lançar pagamento novo; o gateway confere origem/valor e tenta marcar o pedido como Atendido no Bling. Liquidação de outra origem exige revisão manual; não duplicar nem finalizar às cegas. Falha de sincronização fica para recuperação do gateway.
- O gateway também contém `POST action=order_fiscal_recover_bling_v1` para recuperação manual depois de a separação física estar concluída. Ele exige pedido `ready`, conclusão de separação com `stock_applied=true`, itens sem pendência e integração habilitada; reconcilia `approved_separation`/`verified` e chama `fiscal_dispatch_reconcile`. Não chama diretamente a operação humana de emissão; o possível efeito indireto desse subcomando ainda precisa de homologação. A ação de interface fica atrás de `ADMIN_BLING_ORDER_RECOVERY_ENABLED=false` por padrão, exige confirmação e bloqueia quando não há leitura fiscal comprovando `issue_enabled=false`.
- A interface projeta somente número/status fiscal e situação segura de pagamento; não renderiza resposta bruta do gateway. Server Actions revalidam sessão, pedido, estado, total e confirmação explícita; o backend permanece autoridade e repete as pré-condições.
- Quadro visível: NOVO, PRODUÇÃO — Separação, EXPEDIÇÃO e ENTREGUE. Aceite válido entra em PRODUÇÃO; mudanças posteriores são auditadas.
- A transição para EXPEDIÇÃO usa o gateway canônico e sua fila idempotente; erro fica como pendência recuperável sem apagar pedido.
- Usar OAuth e filas já existentes; nenhuma credencial é chamada pelo browser. Um único processo renova refresh token.
- Nota fiscal é o último marco do projeto. O snapshot antigo registrava `fiscal_enabled=false`, mas a leitura atual do gateway mostrou `dispatch_fiscal_human_issue_enabled=true` e gate `enforce`; o `admin-products-live-v1` também tenta a emissão automática após a separação quando o preflight e `issue_enabled` permitem. Até a fase final, a emissão manual do Admin permanece desativada e a separação exige `issue_enabled=false`; na fase fiscal, validar emissão manual/automática, reconciliação e recuperação no ambiente isolado. A saída continua bloqueada até autorização inequívoca da NF-e.

**Aceite desta fase:** pedido de homologação é sincronizado no Bling sem duplicar venda; emissão manual e automática permanecem desligadas e nenhuma NF é emitida. O aceite fiscal é um gate separado e será executado por último.

### 9. ANA configurável e transferência humana

- Contrato remoto conferido em modo leitura: `admin-whatsapp-ana-preview-v1` v30 está ativo com `verify_jwt=true` e recebe `POST`. O gateway valida JWT, vínculo ativo em `admin_users` e papel; `viewer` consulta, `editor`/`admin` salvam rascunho e testam, e `owner` também publica, reverte versão e altera canal.
- `admin_load` usa `ops2_ana_admin_load_v1()` e devolve configuração em rascunho, versão ativa, até 20 versões e até 20 resultados de teste. O Admin projeta esses dados no servidor; a configuração bruta não é enviada como propriedade de tela nem fica em campo oculto.
- `/ana` já oferece edição de tom, concisão, emojis, uso do primeiro nome e conteúdo aprovado (título, texto, palavras-chave e situação). Novos itens começam em `draft`. Regras de gatilho e cenários continuam preservados no JSON original ao salvar e aparecem nesta fatia apenas como contagem.
- Salvar usa `admin_save_draft` com revisão esperada; a RPC incrementa a revisão sob lock e rejeita conflito. A ação do servidor recarrega a configuração, aplica somente os campos permitidos e mantém gatilhos, cenários e chaves desconhecidas.
- `admin_test` roda somente cenários cadastrados para a revisão corrente, registra o resultado em `whatsapp_ana_admin_test_runs_v1` e marca a saída como `dry_run_not_sendable`. A simulação pode chamar o provedor de IA; não envia mensagem Meta. O desenvolvimento não executou essa ação.
- Publicação é exibida apenas para `owner`, exige confirmação e nota, e só é liberada quando um teste da revisão atual cobriu todos os `test_cases` na ordem exata, sem falhas. A RPC repete a validação antes de trocar a versão ativa.
- Rollback é restrito ao `owner`, escolhe uma versão existente diferente da ativa, exige motivo e confirmação, e a RPC registra `rolled_back`. Nenhuma publicação ou reversão foi executada durante a implementação.
- A tela mostra estado de entrada/saída/ANA e apenas os últimos quatro dígitos de cada canal. Não oferece ativação de canal até validar o roteamento real dos dois números e seus gates.
- ANA consulta funções autorizadas para preço, estoque, cliente e pedido; não calcula dinheiro nem confirma pedido fora da ação explícita do cliente.
- Se operador assumir conversa, interromper respostas automáticas até devolver a conversa à ANA.

**Aceite de configuração:** operador edita tom e base de conhecimento; rascunho usa revisão otimista; responsável executa cenários completos, publica com confirmação e reativa versão anterior com trilha de auditoria. Esta parte está implementada localmente; falta validar com conta real autorizada e verificar renderização/fluxo nos dois números.

**Aceite de atendimento ainda pendente:** cenários de cesta, avulso, dúvida, cliente sem cadastro e transferência humana usam preço atual e não prometem ações não executadas.

### 10. Homologação focada e liberação

- Revisar por checklist de gateway, sessão/perfil, exposição de dados, idempotência, retry, valor do pedido e log sem PII/secrets.
- Verificar documentação oficial Meta na versão real dos dois WABAs e validar Flow em cada um antes de liberar cliente.
- Bling começa com leitura e criação controlada em homologação; provar idempotência. NF-e segue bloqueada até gate contábil.
- `/configuracoes` mostra o gateway Bling e, para cada conta WhatsApp existente, as flags persistidas de entrada/envio manual/ANA e a presença de timestamp de homologação. Faz o vínculo pelo UUID de `whatsapp_accounts`, mascara o número e sinaliza quando não são exatamente dois canais. Esse cartão não prova OAuth/Graph, webhook recente ou Flow publicado. Ainda falta um leitor Meta server-side com versão Graph explícita e confirmação do phone-number ID na WABA correspondente.
- Rodar somente lint, typecheck e checks direcionados da fatia em implementação; não criar suíte extensa sem uma jornada pronta.
- Ativar canal/ação por etapas; saúde operacional mostra conexão, fila, último evento e próxima ação sem exibir credenciais.

## Registro de andamento

- **Concluído antes do mapa:** shell visual greenfield e autenticação Supabase SSR; migrations locais e primeira tela de produtos foram iniciadas com base no projeto “NOVO”. Não foram enviadas ao Supabase remoto.
- **Revisão exigida pelo mapa:** remover o acesso direto do browser ao schema experimental e os arquivos/migrations locais específicos desse projeto. Manter apenas o shell e construir leitura de produtos pelo gateway original.
- **Implementado localmente:** catálogo e ficha de produtos; inbox e ANA configurável; clientes e pedidos; atendimento dos dois números; intake separado e idempotente de Flow e Catálogo; confirmação individual do cliente; conversão confirmada para pedido canônico independente; separação, expedição e entrega pelas operações existentes; configuração dos canais Meta sem alegação de saúde ao vivo; toggle explícito da disponibilidade WhatsApp do produto.
- **Composer interativo local:** mensagens oficiais de reply buttons e list com tipos allowlisted, prévia, fila/auditoria e resposta recebida resumida. Catálogo/multi-produto e Flow seguem ações próprias. A busca oficial renovada em 27/10 não encontrou request de carrossel WhatsApp na coleção de mensagens; as páginas Meta relacionadas retornaram 429. Não reutilizar o carrossel genérico do Instagram nem payload de provedor; eventual template de carrossel continua condicionado a schema oficial, aprovação e renderização na WABA.
- **Templates Meta aprovados — implementação local concluída:** a inbox consulta o cache da conta selecionada e mostra apenas modelos `UTILITY` `APPROVED`, `attendance.enabled=true` e componentes aceitos pelo sender; modelos `MARKETING` ficam no workflow dedicado de consentimento. A Server Action revalida a conta/modelo e chama a Edge Function existente `admin-whatsapp-templates-v1` (`action=send`), que usa as RPCs de enqueue/claim/accept e transporte oficial Meta. Campos são derivados das variáveis do corpo; não há editor JSON. O compositor fica acessível fora da janela de 24 horas, enquanto texto, interatividade e mídia seguem bloqueados. Não criar tabela/função/outbox paralelo. Gate: homologar lista/envio, parâmetros, status Meta, canário e falha incerta por WABA; nenhum envio real foi feito.
- **Próximas fatias:** não criar staging nem reaplicar as migrations greenfield. O estado remoto já confirma 7 migrations e 14 funções ativas. Primeiro resolver cadastro de alternativas elegíveis das cestas; depois concluir preparação, publicação, vínculo e validação do Flow com fotos nos dois WABAs. Em seguida publicar e inspecionar o Admin autenticado, homologar pedido e sincronização Bling sem NF-e, e deixar emissão fiscal para a última fase. A conexão Railway está sem autenticação e precisa ser reconectada antes de usar esse provedor.
- **Estado de integração verificado em 27/10/2026:** `dona-antonia-0975` está em `pending_key_provisioning`; `dona-antonia-1018`, em `pending_meta_verification`. Nenhuma das duas tem chave privada registrada/verificada nem Flow binding. Não foram lidos tokens ou valores de secrets. O último snapshot agregado das cestas registra 22 posições sem alternativa elegível; conferir o número novamente antes de qualquer alteração comercial.
- **Validação Meta e Bling:** as URLs de foto cadastradas não provam que a Meta as aceita/renderiza. A publicação do Flow nos dois WABAs, a troca do callback, o envio controlado e a sincronização de pedido com Bling continuam pendentes; nenhuma emissão fiscal foi liberada.

## Atualização — ingresso Flow/Catálogo (27/10/2026)

- A próxima fatia começa pelo parser puro `supabase/functions/_shared/meta-order-events.ts`. Ele identifica `messages[].type="order"`, respostas `interactive.nfm_reply` e respostas de botão; texto, mídia, status e demais eventos continuam com o roteador existente. Esta camada não grava, responde nem cria pedido.
- Cada evento mantém separados `metaPhoneNumberId`, ID da mensagem, `senderPhoneE164` opcional e `senderProviderId` opaco. O parser não transforma um identificador opaco em telefone nem usa nome/perfil para identidade.
- Catálogo preserva `catalog_id`, `product_retailer_id`, quantidade, moeda e preço informado apenas como evidência. Issues retornam códigos sem ecoar payload. A precificação final usa cadastro e estoque atuais no servidor.
- Decisões fixas estão em [plano de intake Flow/Catálogo](../superpowers/plans/2026-10-27-whatsapp-order-intake.md): uma intent privada por evento, vínculo por conta + catálogo + retailer ID, confirmação individual, sem união temporal e sem expiração comercial.
- O outbox atual requer E.164. Até confirmar e implementar o contrato Meta de envio por identidade opaca, pedidos sem telefone ficam em revisão e nunca usam BSUID em `to_phone_e164`.
- A tabela de eventos já deduplica por conta + evento Meta. O evento deve estar persistido antes de responder HTTP; o vínculo evento–intent–pedido e a reserva precisam ser transacionais.
- O writer mantém inicialmente `source='manual_whatsapp'` para respeitar os gatilhos existentes e grava `flow`/`catalog` num campo versionado de `checkout_snapshot` para a origem visual. Não ampliar `orders.source` sem auditoria completa.
- O diretório local de migrations está vazio depois da limpeza, mas o projeto canônico tem histórico extenso aplicado. Recuperar um baseline local somente leitura antes de adicionar migration; não aplicar SQL nem reparar histórico remoto nesta etapa.
- A página Meta para BSUID retorna HTTP 429 à consulta automatizada; o modelo fica agnóstico e envio sem telefone continua bloqueado até fonte oficial acessível.

## Atualização — revisão de carrinho nativo no Atendimento (27/10/2026)

- O painel da conversa passou a apresentar nomes e quantidades do carrinho Meta por intenção. A estimativa usa apenas preço atual do produto mapeado no Admin e some quando qualquer vínculo, produto ou preço não puder ser validado; preço enviado no webhook nunca é usado como total do pedido.
- Flow e Catálogo continuam como intenções separadas, sem limite temporal para agrupamento e sem merge. O cartão do Catálogo deixa claro que não é pedido operacional enquanto cliente, endereço, pagamento e confirmação não estiverem resolvidos.
- A amostra oficial da Meta confirma que o evento `order` inclui o ID do catálogo, os `product_retailer_id`, quantidades e preços reportados; ver a coleção [WhatsApp Cloud API da Meta](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api?entity=request-13382743-ba924e99-3d98-4954-b4e3-73a519939c33). O gateway de contas existente não consulta saúde Graph por número; verificação Meta individual segue pendente.
- **Estado atualizado:** as fatias seguintes deste registro implementaram a coleta privada de cliente/endereço/pagamento, resumo individual, botão de confirmação e conversão idempotente para `public.orders`, com reserva única e fila de separação. O código e a migration continuam apenas no worktree; falta o baseline isolado e a homologação ponta a ponta.

## Atualização — envio manual de Flow de cesta (27/10/2026)

- `/atendimento` tem ação local de envio manual. A equipe escolhe a cesta; o backend valida equipe, canal, contato, janela, molde e alternativas antes de abrir snapshot e sessão. O binding precisa estar publicado e verificado no número correspondente.
- WAMID confirmado marca `sent`; rejeição final marca `failed`; timeout/5xx/sem recibo marca `needs_review`, sem repetição automática. A ação abre o Flow e não cria pedido nem une Catálogo.
- A migration e a Edge Function estão apenas no worktree. A consulta read-only encontrou 21 posições sem produto elegível; concluir o cadastro no Supabase canônico antes de liberar as cestas afetadas.
- As fontes oficiais acessíveis demonstram tanto abertura `navigate` quanto `data_exchange`; a implementação local candidata usa `data_exchange`. Flow Validator no JSON/versões exatos e inspeção visual nos dois números são gates, junto da validação de fotos por alternativa.
- Verificação local concluída: `pnpm typecheck`, Biome focado, `deno check --frozen` da Edge Function e parser PostgreSQL das 22 instruções externas passaram. O parser não compila PL/pgSQL nem valida o schema. Próximos gates: baseline canônico isolado; resolver posições vazias; confirmar publicação/endpoint/binding por WABA; Flow Validator e ensaio de staging; preparar depois uma mudança controlada. Nada foi aplicado, implantado ou enviado nesta fatia.

## Atualização — contrato local do Flow de cesta (27/10/2026)

- A página oficial de Flow JSON foi relida diretamente: o exemplo atual usa JSON 7.3/Data API 3.0 e descreve `3.0` como versão corrente. O changelog associa Data API 4.0 à assinatura opcional `flow_token_signature`; o candidato mantém 3.0 e essa melhoria fica isolada até o Validator confirmar o contrato de cada WABA.
- O endpoint e o arquivo candidato estão alinhados para uma etapa dinâmica por posição: `RadioButtonsGroup` com Base64/`alt-text` em cada opção, preço na descrição, dropdown `0–6`, guarda do carrinho zerado e footer **Próximo**. O JSON local está em `supabase/flows/basket-order-v1.json`.
- A sequência de cadastro declara screens separados para confirmar endereço salvo, registrar endereço novo, encaminhar inconsistência para revisão humana e revisar o pedido. O payload terminal envia itens/quantidades, cliente/endereço, pagamento, total em centavos e texto do endereço; não envia preço unitário nem ajuste oculto.
- Checagem estática desta alteração: JSON parseado; Biome passou no endpoint/Flow; `git diff --check` sem erros. Não foi executado teste automatizado; Deno e Meta Flow Validator não foram usados nesta etapa.
- Gates ainda necessários: Meta Validator para JSON/API 7.3/3.0, atualização do mesmo screen `BASKET_PRODUCT`, fotos visíveis, campos/rotas `complete` e recepção `nfm_reply`; inspeção em 0975 e 1018. Nenhum Flow foi publicado/enviado e nenhum DDL/deploy ou escrita Bling ocorreu.

## Andamento de programação — editor das cestas (27/10/2026)

- Concluída localmente a tela `/cestas` baseada nos moldes consultados pelo novo Flow, com edição de alternativas por posição e foto. A busca e o salvamento usam os gateways autenticados existentes. A página antiga baseada em `admin-basket-configuration-v1?action=flow_list` deixou de ser fonte de verdade para o Flow greenfield.
- A tela preserva ordem, quantidades, categoria, ajuste extra/condicional e metadados no servidor. Confere ativo, WhatsApp ativo, HTTPS e preço ao adicionar, e recarrega a elegibilidade para as posições alteradas antes da gravação. Nenhuma migration nova foi criada.
- A pesquisa read-only atual indica 21 posições sem alternativa elegível; isso impede liberar as cestas afetadas até cadastrar alternativa válida. Foto cadastrada continua diferente de foto aprovada/renderizada pela Meta.
- Checagens estáticas locais: typecheck, Biome focado e diff whitespace passaram. Sem testes automatizados e sem deploy, DDL, envio de mensagem, publicação Meta ou escrita Bling.
- Trabalho ainda necessário para concluir o produto: resolver o baseline/staging com migrations candidatas, ligar e homologar webhook/intake/Flow/Catálogo, corrigir posições sem opção, validar os dois números WhatsApp, confirmar operações Bling de separação/expedição, instalar a versão aprovada do schema/Edge e publicar o Admin. Emissão de nota fiscal continua como última fase, conforme instrução do proprietário.

### Pré-condição staging: histórico Supabase versus checkout limpo (27/10/2026)

Consulta somente leitura listou 1.266 migrations registradas no projeto canônico até `20261026120049`; o worktree contém apenas três migrations greenfield de 27/10, nenhuma já registrada remotamente. A história Git local tem somente quatro arquivos SQL únicos, insuficiente para replay integral. Isso confirma divergência, mas não atribui a causa exata do `MIGRATIONS_FAILED`. A branch temporária anterior foi removida e não deve ser recriada sem esclarecer o mecanismo de replay. Não falsificar `supabase_migrations.schema_migrations`, não reintroduzir o aplicativo antigo, não aplicar DDL na produção. Continuar desenvolvimento local e buscar baseline de schema isolado/sintético.

## Status consolidado após retomada (27/10/2026)

- **Admin local:** catálogo de produtos, fotos, cestas/molde, clientes, atendimento, ANA e quadro/ficha de pedidos estão implementados no worktree. `pnpm build` passou em Windows após reconstruir `node_modules` pelo lockfile; `pnpm lint` saiu com código 0 e 25 avisos CSS, sem erro. O build cobre 16 rotas; ainda não prova sessão autenticada com credenciais reais.
- **Flow greenfield:** o Data Endpoint local foi isolado como `whatsapp-flow-data-exchange-greenfield-v1` para não substituir `whatsapp-flow-data-exchange-v1` remoto v76 (proxy canário). TOML e carregamento local confirmados; nenhuma função foi implantada.
- **Supabase:** produção permanece read-only. O histórico canônico tem 1.266 migrations, enquanto o banco local conserva quatro registros órfãos experimentais e três migrations candidatas pendentes. A branch anterior falhou com `MIGRATIONS_FAILED`; não repetir branch/replay nem usar a base local como baseline. As migrations candidatas foram parseadas e os três corpos SQL críticos compilaram em PostgreSQL 17.6 com dependências sintéticas, ainda sem execução ponta a ponta sobre o schema canônico.
- **Dados e homologação:** 21 posições de cesta ainda não têm alternativa elegível com foto/preço; isso impede liberar cestas afetadas. O Flow precisa passar no Validator vigente e renderizar todas as fotos em cada WABA, e webhook/intake/Catálogo devem ser confirmados em staging. Bling precisa de homologação de criação/separação/expedição sem emissão fiscal.
- **Release:** nenhum deploy, mudança de callback, envio Meta, escrita Bling, aplicação remota de migration ou NF-e aconteceu. Emissão fiscal segue como última fase; não liberar o Admin para pedidos reais antes dos gates do roteiro de staging.


### Atualização de execução — composer da inbox (27/10/2026)

- Implementados localmente respostas rápidas, lista de mídias reutilizáveis e anexos pelo upload assinado Supabase. Imagens geram a miniatura JPEG exigida pela RPC remota; o envio só acontece após clique explícito.
- Decisões e contratos estão em `docs/superpowers/specs/2026-10-27-attendance-compose-design.md` e `docs/planning/pesquisa-e-plano.md`.
- Gate seguinte: testar com sessão autorizada em staging o upload de imagem/documento, finalização, envio homologado e webhook/status em cada número. A documentação oficial detalhada de tipo/tamanho retornou HTTP 429 e deve ser conferida antes da liberação.
- Não houve envio real, upload Storage, migration, deploy, alteração Meta/Bling ou NF-e nesta fatia. Emissão fiscal continua por último.


### Atualização — gerenciamento de respostas rápidas

- Página de Configurações implementada para criar/editar texto, favorito e ordem, pausar e reativar item. Todos os comandos passam pelas ações allowlisted do gateway remoto com sessão autenticada.
- Build gera 14 rotas; sem deploy/migration, envio de mensagem ou gravação remota nesta etapa. A validação de uso real de permissões permanece no gate de staging.


### Atualização — resumo seguro de interações recebidas

- O Atendimento agora pode apresentar o título de uma seleção por lista ou uma confirmação genérica de resposta Flow; payload estruturado não é renderizado.
- A evidência veio de uma consulta estrutural ao Supabase, sem conteúdo de conversa: somente nomes de chaves JSON e tipos de evento agregados do período recente.
- Nenhuma mensagem interativa genérica foi habilitada para envio. O gateway v39 não oferece essa ação; envio exige contrato backend/Meta próprio. Flow e Catálogo seguem como pedidos distintos.
- Verificação desta fatia: pnpm typecheck, Biome focado e git diff --check; sem teste automatizado, DDL ou deploy.


- Revisão read-only identificou que o RPC de fila retorna texto cru e que a lista o mostrava antes de olhar o tipo; corrigido no adapter/UI para interactive, button e order. A bolha também deixa de imprimir text_body desses eventos estruturados.
- O título da resposta por lista remove controles bidi/formatação. pnpm typecheck e Biome focado passaram depois da revisão. Nenhum teste automatizado ou alteração remota foi executado.
