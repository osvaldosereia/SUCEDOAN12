# Novo controle de estoque, clientes e canais Meta

## Intenção

Concluir no admin novo o controle do estoque do catálogo GitHub, o cadastro de clientes/endereço existente no Supabase e a implantação do atendimento pelos canais WhatsApp 0975 e 1018.

## Decisões do usuário

- GitHub é a fonte operacional do catálogo e do estoque. A disponibilidade no Flow usa esse saldo.
- Quando o cliente confirma o pedido, o saldo é baixado uma vez no GitHub; se ficar negativo, o pedido segue sem bloqueio por estoque.
- O cadastro de clientes continua nas tabelas existentes do Supabase; o novo admin precisa pesquisar, criar e editar clientes e endereços.
- O atendimento pode ser configurado para os dois números WhatsApp 0975 e 1018.
- O código e os esquemas permanecem greenfield; o Vitrine Admin serve apenas como referência.

## Arquitetura escolhida

Manter produtos, saldo, cestas, imagens e rascunhos versionados em arquivos públicos do GitHub. A API privada do Supabase faz commits controlados e idempotentes para operações de catálogo e estoque. O Flow consulta o saldo da revisão GitHub fixada na sessão; pedido confirmado registra uma baixa idempotente, permitindo saldo negativo.

Clientes e endereços continuam nas tabelas `public.customers`, `public.customer_phones` e `public.customer_addresses`. A UI não acessa essas tabelas diretamente. A Edge Function exige sessão Supabase Auth com identidade GitHub e UUID allowlisted, e usa conexão privada server-side; mantém RLS e não adiciona policies públicas.

Os dois números pertencem a WABAs diferentes. A gestão Meta deve descobrir e exibir Flows por WABA, aceitar seleção de um Flow aprovado ou criar/validar um rascunho por WABA e separar o número emissor do Flow ID. Chaves e tokens ficam em segredos do servidor. Publicação é uma ação explícita, com confirmação e validação sem erros; desenvolvimento não executa publicação.

## Alternativas consideradas

1. **GitHub para catálogo/estoque e Supabase privado para clientes — escolhida:** segue as instruções do usuário e reutiliza o controle de versão atual. Exige escrita concorrente idempotente no GitHub para baixa de estoque.
2. **Supabase como catálogo e estoque:** facilita transações, mas contradiz a decisão do usuário e o catálogo greenfield no GitHub.
3. **Supabase direto no navegador para clientes:** encurta implementação, mas expõe a superfície de autorização e não combina com RLS atual sem policies.

## Metas

- Catálogo passa a conter saldo inteiro assinado e a UI administrativa permite alterá-lo.
- O Flow oferece quantidades de 1 a 6 quando o saldo é positivo e bloqueia disponibilidade zero/negativa.
- A venda/NF-e não usa saldo negativo como bloqueador.
- Admin pesquisa, cria e edita cadastro do cliente e endereços, sem apagar dados referenciados; inativação é soft-delete.
- Admin gerencia e publica o Flow certo para cada WABA/telefone sem expor credenciais.

## Fora de escopo nesta implementação local

- Não aplicar migrations, configurar credenciais reais, implantar funções ou publicar Flow.
- Não enviar mensagens a clientes.
- Não usar o Vitrine como base de dados do catálogo, estoque ou clientes do projeto novo.

## Pontos a confirmar na implementação

- A descoberta de Flows Meta é read-only até que o operador escolha um alvo e confirme uma publicação.
