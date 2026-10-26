# Rodada 4 — Runtime de atendimento

**Objetivo:** preparar o endpoint dinâmico isolado que recebe mensagens criptografadas de Flow, carrega uma revisão fixa do catálogo, valida escolhas, calcula o total no servidor e consulta o cadastro mínimo do cliente por telefone.

**Estado:** implementada localmente. O endpoint e a migration ficam no Git; não serão implantados/aplicados nem ligados a um Flow Meta nesta rodada.

**Contrato comercial:** a primeira alternativa de cada grupo é a composição de referência. O adicional interno é calculado no servidor como `preçoBaseDaCesta - soma(preçoUnitárioDeReferência × quantidadeInicial)`. A cotação soma esse adicional à seleção validada. O adicional nunca sai do servidor; só o total em centavos é devolvido. A composição padrão precisa reproduzir o preço-base da cesta.

## Arquivos

- Criar `src/domain/flow-runtime.ts`: seleção validada, regras de quantidade, ajuste interno derivado e total em centavos.
- Manter `src/domain/flows.ts` e os JSONs da Rodada 3 em `local-only`; a ligação ao endpoint fica pendente até fechar o número de telas, os componentes de seleção e o `routing_model` com o Flow Builder.
- Criar `supabase/functions/whatsapp-flow-runtime/index.ts`: verificação HMAC do corpo bruto, decifragem RSA-OAEP/AES-GCM, controle de sessão, respostas criptografadas e roteamento de telas.
- Criar `supabase/migrations/*_whatsapp_flow_sessions.sql`: sessões curtas com token opaco armazenado somente como SHA-256, canal, cesta, commit, telefone E.164 e expiração; RLS e acesso restrito ao runtime.
- Alterar `supabase/config.toml` e `tsconfig.json` para reconhecer somente a nova função e seus tipos locais.
- Atualizar `CONTRACTS.md`, `README.md`, `HANDOFF.md` e o plano vigente com os limites da implementação local.

## Etapas de execução

1. Implementar a cotação e validação puras: grupo/produto ativo, produto pertencente ao grupo, quantidade inteira dentro do mínimo/máximo, retirada somente quando permitida, e composição padrão igual ao preço-base.
2. Criar armazenamento mínimo e isolado de sessão; nunca incluir telefone em `flow_token`, arquivos do GitHub, logs ou dados da tela do Flow.
3. Implementar lookup em `customers`, `customer_phones` e `customer_addresses`: telefone primário exato ou telefone secundário verificado, cadastro ativo, resultados ausentes/ambíguos explícitos e endereços ativos reduzidos aos campos de entrega.
4. Responder às telas lógicas de cada grupo com opções, imagens e total atualizado; exibir dados/status do cliente na etapa de revisão. Edição de nome/endereço e conclusão do Flow ficam para o contrato de tela das Rodadas 5/7. Não criar pedido nesta etapa.
5. Implementar assinatura HMAC (`X-Hub-Signature-256`), RSA-OAEP SHA-256, AES-128-GCM e IV invertido para a resposta. Sem segredo/chave/sessão válidos, falhar fechado.
6. Verificar `pnpm build`, `git diff --check`, tipo da função quando Deno estiver disponível e revisão de que não há chamadas de envio, publicação ou deploy.

## Proteções

- `verify_jwt = false` é necessário para a Meta chamar o endpoint; a função autentica o corpo assinado e exige que o payload criptografado abra com uma das chaves privadas dos dois canais e uma sessão válida do servidor.
- Não usar JWT claims editáveis do usuário para autorização; não aceitar total, canal, cesta, produto ou telefone como autoridade do cliente Flow.
- O token é aleatório, expirável e nunca carrega PII. A linha de sessão associa o hash do token ao telefone confirmado pelo webhook de entrada (etapa posterior).
- `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_SECRET_KEYS`, chaves privadas Meta e app secret são lidos apenas pelo runtime; nenhum valor real será criado, consultado ou commitado nesta rodada.
- Nenhuma leitura de linhas reais de clientes será feita durante a construção. Nenhuma mensagem, criação de pedido, publicação de Flow ou implantação será executada.

## Pendências após esta rodada

As chaves Meta, app secret, IDs oficiais dos canais, segredo de conexão Supabase e política de dados de cliente ainda precisam ser configurados e homologados. A validação Meta do JSON e a experiência das imagens em aparelho permanecem para a Rodada 7. Webhook, resumo, confirmação idempotente e persistência de pedido pertencem à Rodada 5.

### Resultado

- A cotação pura e a Edge Function foram implementadas; `pnpm build` passou.
- A migration foi criada com `pnpm dlx supabase migration new`, mas não foi aplicada. O CLI foi usado somente para gerar o arquivo.
- Nenhuma linha de cliente, segredo, API Meta, mensagem, pedido ou deploy foi acessado/executado.
- `deno check` não foi possível porque Deno não está instalado; o endpoint está incluído no `tsc --noEmit` do build.
- Os drafts da Rodada 3 ainda não estão ligados ao endpoint. O roteamento de uma tela por grupo não é adequado a cestas de 13–25 grupos sem validação do limite Meta; fechar agrupamento/JSON na Rodada 7.
- Ajuste do plano: não alterar `flows.ts` nesta rodada. As cestas têm 13–25 grupos e o Flow exige telas/rotas declaradas; criar 13–25 destinos sem validar o limite da Meta poderia gerar JSON inutilizável. O endpoint fornece o contrato lógico necessário, e o layout agrupado será implementado junto da validação da Rodada 7.

## Referências consultadas

- [Supabase Edge Functions — conectar ao Postgres](https://supabase.com/docs/guides/functions/connect-to-postgres)
- [Supabase Edge Functions — visão geral](https://supabase.com/docs/guides/functions)
- [Exemplos oficiais de endpoint WhatsApp Flows](https://github.com/WhatsApp/WhatsApp-Flows-Tools/tree/main/examples/endpoint/nodejs)

Os documentos da Meta retornaram HTTP 429 nesta consulta; a implementação criptográfica foi conferida no exemplo oficial da Meta, que avisa que seus exemplos servem para prototipagem e não estão prontos para produção. Este endpoint local ainda precisa de validação no Flow Builder e revisão antes de qualquer deploy.
