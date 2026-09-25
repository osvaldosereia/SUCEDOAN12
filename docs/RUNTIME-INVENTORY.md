# Dona Antônia — Inventário de Runtime

## GitHub

- `main` contém o site público, Vitrine Admin e fontes de algumas Edge Functions.
- Não existem workflows em `.github/workflows`.
- `/index.html` e `/vitrine/index.html` são duplicados e devem convergir para uma única fonte.
- `vitrine/admin/index.html` é monolítico e será modularizado.
- `admin-service-intelligence-v1` é monolítico e será reduzido/absorvido.

## Supabase canônico — `ssbesxgaijknwsjbsbcz`

Estado observado nesta rodada:

- 100 Edge Functions implantadas.
- Apenas `storefront-v2` é o núcleo público definitivo.
- `admin-products-live-v1`, `admin-service-intelligence-v1` e `admin-pin-auth-v1` são temporariamente necessários ao admin durante a consolidação.
- `product-image-openai-v1` permanece temporário enquanto houver dependência fiscal comprovada.
- Grupos PapoAI, WhatsApp, shopping-chat/room, marketing, creative, Ame Mais, TikTok, agents, versões antigas de inventário e versões antigas do admin são candidatos a remoção após prova de dependência.

### Automação

- `bling-hub-v2-cycle`: registrado a cada 2 minutos. A função só dispara HTTP se `bling_hub_runtime_v2.hub_enabled=true`. Nesta rodada o runtime foi colocado em `false`, evitando novos disparos externos do Hub.
- `fiscal-ai-autonomous-worker-v1`: registrado a cada 1 minuto. O controle `fiscal_ai_worker_control.enabled` já está `false`, portanto o job retorna sem disparar o worker OpenAI.
- A conexão atual não possui permissão operacional para desregistrar os jobs do `pg_cron`; a remoção física continua obrigatória quando houver acesso permitido.

## Supabase legado — `qxstkwshuvplmmftrctj`

- 6 Edge Functions implantadas.
- 20 tabelas públicas.
- `simple-storefront-v1` já está aposentada.
- `vitrine-admin-v1` ainda atende ações que precisam ser portadas.
- Existe `dona-antonia-expiry-offers` diariamente às 04:05; desaparecerá com o projeto legado após a migração do admin.

## Classificação

### KEEP final

- `storefront-v2`
- gateway único do Vitrine Admin (nome final a consolidar)
- `admin-pin-auth-v1`

### KEEP somente se necessário

- integração Bling/fiscal sob demanda
- classificador fiscal OpenAI sob demanda

### MIGRATE / ABSORB

- ações úteis de `vitrine-admin-v1`
- ações úteis de `admin-service-intelligence-v1`
- funções úteis de produtos/pedidos/gôndolas que hoje existem em versões paralelas

### DELETE após gate

- PapoAI / WhatsApp / Flow / agentes
- shopping-chat / shopping-room
- marketing / creative / video / storyboard
- Ame Mais / TikTok
- imports one-shot antigos
- funções de homologação/teste
- versões paralelas substituídas de inventário, imagens, admin e checkout

Nenhuma função deve ser apagada apenas pelo nome: a exclusão depende de ausência de referência no GitHub, ausência de chamada nos logs, ausência de dependência SQL e smoke test verde.
