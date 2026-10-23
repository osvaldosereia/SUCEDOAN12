# Ponte Loja Integrada → Dona Antônia (fase 1)

## Identidade da loja confirmada (23/10/2026)

Subdomínio provisório exibido no painel da Loja Integrada da **Super Cestas Dona Antônia**: **https://dona-antonia-1.lojaintegrada.com.br**. Plano Crescimento indicado na captura de tela. O domínio próprio **donaantonia.com.br não foi configurado** nessa nova plataforma. Preservar a operação atual enquanto a nova loja passa por testes.

Autenticação API confirmada na documentação oficial: `Authorization: Basic <personal token>`. **Isso valida o formato implementado, mas não comprova ainda a autenticação da credencial configurada no Supabase.** Não publicar token ou service-role em logs, GitHub ou mensagens.

Estado atual: função `loja-integrada-readonly-v1` ativa no Supabase com `verify_jwt=true`; ainda não há invocação autenticada comprovada nem conexão direta do ChatGPT com a loja. Não declarar integração operacional antes do teste real.


Integração **somente leitura** e isolada. Não altera o site público, pedidos ou produtos.

## Credencial

No Supabase do projeto `ssbesxgaijknwsjbsbcz`, cadastrar o segredo **`LI_PERSONAL_TOKEN`** com o *personal token* da Loja Integrada. Nunca publicar o valor no GitHub ou no frontend.

O token é usado exclusivamente pelo servidor no header `Authorization: Basic <token>`, conforme a documentação oficial (setembro de 2026).

## Segurança

A Edge Function exige `verify_jwt=true` no Supabase Gateway **e** credencial `SUPABASE_SERVICE_ROLE_KEY` no header Authorization. É uma rota **server-to-server**, não uma API para navegador ou usuários finais. Não compartilhe a service-role key.

## Operações

`GET /functions/v1/loja-integrada-readonly-v1?action=status`: testa a API e retorna situação, sem expor a credencial.

`GET /functions/v1/loja-integrada-readonly-v1?action=products&limit=10&offset=0`: lê produtos.

`GET /functions/v1/loja-integrada-readonly-v1?action=categories&limit=10&offset=0`: lê categorias.

Nenhuma operação de escrita existe nesta fase. Não encaminhar consultas arbitrárias.

## Próximas etapas

1. Invocar `status` de um **backend autenticado**, confirmar `ok:true` e validar a identidade da loja; a mera implantação não confirma a credencial.
2. Verificar SKU/EAN, categorias e paginação com limite conservador.
3. Definir o conector que ChatGPT poderá chamar (Plugin/MCP autorizado); Edge Function isolada **não** cria automaticamente integração direta com este chat.
4. Só então planejar escrituras autorizadas e sem duplicar a integração nativa Bling ↔ Loja Integrada.

Docs: https://api-docs.lojaintegrada.com.br/ ; https://ajuda.lojaintegrada.com.br/pt-BR/articles/931152-como-gerar-chaves-de-api-e-o-personal-token-chave-de-aplicacao-da-minha-loja


## Fase 1.1 — gateway versão 2 (23/10/2026)

Leituras disponíveis por `GET` (sempre servidor→servidor):
- `?action=status` — valida conexão de produtos e retorna contagem.
- `?action=products&limit=10&offset=0` — pagina produtos; `sku=` opcional.
- `?action=categories&limit=10&offset=0` — categorias.
- `?action=product&id=123` — detalhes do produto.
- `?action=stock&id=123` — quantidade e situação de estoque do produto.
- `?action=price&id=123` — preço do produto.

O checkout, a sincronização Bling, o domínio e a versão pública da loja atual não foram alterados. A function exige o header Authorization com JWT de service role e `verify_jwt=true`. Ela não aceita credenciais do usuário comum nem comandos arbitrários.

### Verificações concluídas

- Implantação da Edge Function `loja-integrada-readonly-v1` versão 2: ACTIVE.
- CI isolado `Loja Integrada - Gateway Read Only`: 9/9 testes offline aprovados, execução https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/40021776713.
- Os testes simulam API externa, não usam credenciais reais e não confirmam se o personal token está correto.

### Bloqueio restante

O conector Supabase atualmente disponível no ChatGPT oferece gerenciamento de projeto/Edge Functions, mas **não oferece invocação HTTP autenticada do endpoint**; o valor do secret do Supabase não é legível pelo conector, corretamente. Para concluir a conexão com a conta efetiva, executar `action=status` com credencial de serviço em um backend autorizado ou na área de testes protegida do Supabase e registrar apenas `ok`, `upstream_status`, e contagem de produtos, nunca tokens.

Depois dessa confirmação será necessário habilitar um conector/servidor MCP autorizado no ChatGPT, com autenticação apropriada, para permitir administração direta. **Implantar uma Edge Function não torna automaticamente o serviço chamável pelo ChatGPT.**

### Próxima regra funcional

Deixar Loja Integrada e Bling sincronizarem pelos recursos nativos. Não criar replicação paralela de dados nem alterar itens de pedidos finalizados pela API sem validação com o fluxo de separação. Preço e estoque são recursos próprios (/v1/produto_preco e /v1/produto_estoque); não tratar um PUT de produto como atualização destes campos.
