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
