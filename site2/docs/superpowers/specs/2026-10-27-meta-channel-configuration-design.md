# Visibilidade da configuração dos canais Meta

## Intenção

Em **Configurações**, mostrar os dois números oficiais do WhatsApp e as flags atuais de entrada, saída, ANA e homologação que já estão registradas no backend. Isso ajuda a equipe a encontrar uma configuração ausente sem transformar um valor cadastrado em promessa de conexão ativa.

## Abordagens consideradas

1. Manter o cartão genérico “Validar 2 números”. É simples, mas não informa qual canal precisa de atenção.
2. Cruzar as contas WhatsApp existentes com a projeção de canais do carregador da ANA pelo UUID exato da conta. **Escolhida:** usa os dois contratos já existentes, mostra estados de configuração, não acessa secrets e mantém a distinção entre configuração e saúde real.
3. Consultar a Graph API ao vivo diretamente nesta tela. Fica para uma fatia própria: exige versão Graph suportada configurada, permissões/token por WABA e endpoint server-side de leitura; não pode ser representada como concluída até ser validada em staging.

## Metas e limites

- Exibir cada conta retornada por `getAttendanceAccounts()` com nome e apenas os últimos quatro dígitos.
- Destacar divergência quando a quantidade cadastrada não for os dois números operacionais esperados.
- Associar flags de `loadAnaAdmin().view.channels` somente por igualdade do ID da conta (`whatsapp_account_id`). Não unir por nome, telefone ou ordem da lista.
- Mostrar entrada, saída e ANA como “Ativa”/“Pausada”; mostrar timestamp de homologação somente como “Registro de homologação existente”.
- Se uma fonte falhar, indicar qual configuração não pôde ser consultada. Conta sem linha correspondente permanece “Configuração não encontrada”.
- Informar que a tela mostra configuração persistida e não comprova OAuth/Graph, recebimento recente de webhook, entrega de mensagem ou Flow publicado/renderizado.
- Não enviar mensagem, consultar Graph, ativar/desativar canal, publicar Flow, alterar segredo ou escrever no Supabase.

## Chamadas de implementação

- Usar Server Component existente, os adapters `getAttendanceAccounts()` e `loadAnaAdmin()`, e projetar somente os campos de exibição; nunca passar `rawConfiguration` ao cliente.
- Manter o cartão simples e reaproveitar o estilo visual de `integration-card`.
- Corrigir no painel da ANA o rótulo “homologado” para “homologação registrada”, pois o timestamp não prova saúde atual.
- Registrar a checagem Graph ao vivo como pendência distinta do estado de configuração.

## Verificação

Sem testes automatizados nesta fatia. Conferir tipos, Biome focado e whitespace. A confirmação de saúde Meta por número requer depois um leitor server-side com versão Graph explícita e validação isolada por WABA.

## Referência oficial para a próxima etapa

- [Meta Postman — listar números da WABA](https://www.postman.com/meta/whatsapp-business-platform/request/hrio0ah/get-phone-number-id)
- [Meta Postman — consultar número por ID](https://www.postman.com/meta/whatsapp-business-platform/request/li0unxe/get-phone-number-by-id)
