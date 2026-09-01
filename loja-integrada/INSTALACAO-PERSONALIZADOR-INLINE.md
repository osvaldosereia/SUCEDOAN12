# CanecaFácil · Personalizador Inline na Loja Integrada

## Homologação

A instalação inicial usa **uma única entrada de código** no tema da Loja Integrada.

Configuração:

- **Descrição:** `CanecaFácil - Personalizador Inline (Homologação)`
- **Local publicação:** `Rodapé`
- **Página publicação:** `Página do produto`
- **Tipo:** `JavaScript`

Cole o conteúdo de `loader-personalizador-inline-homologacao.js` no campo de código.

### Segurança da homologação

O loader não faz nada para visitantes normais. Ele somente carrega o personalizador quando a URL da página do produto contém:

`?cf_personalizador=teste`

Se a URL já possuir parâmetros, use `&cf_personalizador=teste`.

Enquanto a homologação estiver ativa:

- o personalizador aparece dentro da própria página do produto;
- o botão antigo de personalização é escondido somente no modo de teste;
- modelos com personalização obrigatória escondem o Comprar normal somente no modo de teste;
- a geração usa `personalize_mug_model` no Make;
- o formulário mostra somente os campos liberados no Admin Canecas;
- não existe instrução livre para o cliente;
- não existe gravação de aprovação ou criação comercial pelo navegador;
- `APROVAR E COMPRAR` permanece bloqueado;
- nenhuma compra/pedido é alterado nesta fase.

## Configuração por modelo no Admin Canecas

Campos disponíveis, individualmente por caneca:

- Nome
- Foto
- Logo
- Endereço
- Telefone
- Site

Cada campo pode ser ligado/desligado, receber um rótulo próprio e ser obrigatório ou opcional. O modelo também possui:

- personalização obrigatória ou opcional;
- prompt-base reutilizável;
- instrução específica do modelo;
- versão da configuração.

## Arquitetura

`Loja Integrada (loader curto)` → `personalizador-inline-v2.js` → `personalizador-inline-v1.js` → `Make/OpenAI`

A camada V2 adapta Foto/Logo para o mesmo contrato de transporte já usado pela homologação V4, mantendo separadas:

- arte-base oficial do modelo;
- foto/logo enviada pelo cliente.

## Produção

Não remover a trava `cf_personalizador=teste` até concluir os testes de:

1. identificação correta do SKU/modelo;
2. posição do formulário no desktop e mobile;
3. todos os seis tipos de campo;
4. geração apenas do elemento autorizado;
5. foto/logo sem alterar indevidamente a arte-base;
6. aprovação segura no backend;
7. vínculo da criação ao item/pedido da Loja Integrada;
8. recuperação automática em caso de falha.

Somente após essa homologação será criada a versão de produção do loader.
