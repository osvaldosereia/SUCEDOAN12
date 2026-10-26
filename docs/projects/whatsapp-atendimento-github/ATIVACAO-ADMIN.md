# Ativar o Admin WhatsApp

Atualizado em 26/10/2026. Este roteiro lista somente os bloqueios que impedem o primeiro acesso autenticado e a operação do novo Admin.

## Estado verificado

- O preview local abre em `http://127.0.0.1:5173/` e carrega o catálogo versionado no GitHub.
- O Admin está publicado pelo GitHub em `https://donaantonia.com.br/whatsapp-admin/` (HTTP 200; Actions run `40331576769`, concluída com sucesso).
- O botão de login retorna `Unsupported provider: provider is not enabled`.
- O Dashboard do projeto `ssbesxgaijknwsjbsbcz` redireciona para `https://supabase.com/dashboard/sign-in`; esta sessão não tem login no Dashboard.
- As quatro migrations próprias do projeto estão aplicadas. As cinco funções novas ainda não estão implantadas.
- A chave Flow do canal 1018 foi observada no runtime. A chave privada do 0975 e as credenciais da GitHub App do novo projeto não foram confirmadas.

## Onde o Admin fica

A interface do novo Admin está publicada pelo GitHub a partir deste repositório. O Supabase não hospeda a interface: ele fornece login, dados de clientes e Edge Functions. O endereço `https://ssbesxgaijknwsjbsbcz.supabase.co/auth/v1/callback` é somente o retorno técnico do OAuth depois do login; não é o endereço do Admin.

O workflow concluiu com sucesso e a URL respondeu HTTP 200 com a tela do Admin. O novo Admin usa o caminho isolado `https://donaantonia.com.br/whatsapp-admin/`, sem substituir o site raiz ou os painéis existentes. Essa publicação entrega a interface estática; ainda não libera login nem atendimento ao cliente.

## Desbloqueio de autenticação

1. Entre no Dashboard Supabase do projeto `Dona Antônia` (`ssbesxgaijknwsjbsbcz`). Não compartilhe senha, códigos ou tokens no chat.
2. Em **Authentication → Sign In / Providers → GitHub**, habilite GitHub e configure um OAuth App. O callback Supabase deste projeto é:

   `https://ssbesxgaijknwsjbsbcz.supabase.co/auth/v1/callback`

3. No GitHub, o OAuth App usa esse callback como **Authorization callback URL**. O **Homepage URL** do novo Admin é `https://donaantonia.com.br/whatsapp-admin/`. Para acesso local, o app atual usa `http://127.0.0.1:5173/`.
4. No Supabase, em **Authentication → URL Configuration**, permita a origem local `http://127.0.0.1:5173/**` e a URL exata `https://donaantonia.com.br/whatsapp-admin/`. Não use wildcard amplo em produção.
5. Armazene o Client ID e Client Secret no provider do Supabase Auth. Eles não pertencem ao `.env.local`, às Edge Functions nem ao repositório.

A documentação oficial descreve o cadastro do OAuth App e o callback de Supabase em [Sign in with GitHub](https://supabase.com/docs/guides/auth/social-sign-in/auth-github), e a allowlist de redirects em [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## Desbloqueio de gravação no GitHub

O login sozinho não libera alterações. Para catálogo, clientes e baixa de estoque, o backend precisa de uma GitHub App instalada **somente** em `osvaldosereia/SUCEDOAN12`, com `Contents: Read and write` e `Metadata: Read-only`. A chave privada deve ser guardada como secret server-side; não salvar o arquivo da chave no checkout.

Os secrets server-side esperados são `GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID`, `GITHUB_PRIVATE_KEY`, `ADMIN_ALLOWED_USER_IDS` e `ADMIN_ALLOWED_ORIGINS`. Depois do primeiro login, `ADMIN_ALLOWED_USER_IDS` deve conter o UUID do operador em `auth.users`; `ADMIN_ALLOWED_ORIGINS` deve listar `https://donaantonia.com.br` e `http://127.0.0.1:5173` somente durante desenvolvimento. CORS recebe a origem, sem o caminho `/whatsapp-admin/`.

O GitHub connector desta sessão não oferece criação de GitHub App nem gravação de secrets. O Dashboard não está autenticado. Por isso, não é possível concluir esses cadastros em nome do operador nesta sessão.

## Liberação técnica após os cadastros

Antes de implantar qualquer função, confirmar apenas a **presença** dos secrets obrigatórios, conferir o destino `ssbesxgaijknwsjbsbcz`, os nomes e as versões das funções, e fazer build. Nunca imprimir valores de secret.

Ainda são necessários: `DA_FLOW_0975_RSA_PKCS8`, confirmação da chave de 1018 e Meta IDs/canal para ambos; secrets da GitHub App; confirmação de `SUPABASE_DB_URL` e dos aliases Meta já observados. O roteador novo precisa ser implantado e selecionado no callback Meta para que `nfm_reply` do novo Flow chegue ao checkout. Essa alteração isolada precisa manter o webhook ANA como relay dos demais eventos.

Não publicar Flow, não enviar mensagens reais e não criar venda/NF-e de teste durante a ativação técnica. A validação operacional com Meta/Bling exige autorização específica da operação e destinatário controlado.
