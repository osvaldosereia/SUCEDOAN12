# Guarda de prontidão das alternativas do Flow

## Intenção

Evitar que o editor de cestas salve uma etapa alterada que o emissor do Flow recusaria. Uma alternativa ativa e habilitada para WhatsApp precisa ter nome, preço comercial e foto HTTPS válidos. O Flow também aceita no máximo oito alternativas elegíveis por etapa.

## Evidência

- `whatsapp-flow-session-open-v1` ignora produtos inativos ou desabilitados para WhatsApp, mas encerra a abertura da sessão quando encontra uma alternativa ativa para WhatsApp sem imagem, nome ou preço válidos. A sessão também recusa uma etapa acima de oito alternativas elegíveis.
- `saveAdminBasketMoldOptions()` valida todas as opções de uma etapa alterada, mas atualmente rejeita uma alternativa inválida somente quando ela é nova. Um produto antigo que permaneça ativo/WhatsApp e tenha perdido foto ou preço pode continuar no molde depois de salvar outro produto naquela etapa.
- O editor cliente permite adicionar até quarenta registros antes de o servidor rejeitar mais de oito opções elegíveis; a rejeição tardia custa uma ida e volta e não orienta o ajuste antes do salvamento.
- Leitura agregada somente de catálogo/configuração no Supabase canônico em 27/10/2026: 5 cestas ativas no WhatsApp, 118 posições, 97 com pelo menos uma alternativa pronta e 21 sem alternativa elegível (3 sem produto ativo e 18 com produto ativo, porém desabilitado para WhatsApp), 203 alternativas prontas, nenhuma etapa acima de oito e zero alternativa ativa/WhatsApp reprovada nas verificações estáticas de nome, HTTPS, preço e centavos. A contagem anterior de 93/25/195 foi uma estimativa preliminar e foi substituída por esta consulta alinhada aos critérios efetivos do emissor. A verificação não comprova disponibilidade HTTP ou renderização pela Meta e não leu clientes, mensagens, pedidos ou valores de secrets nem alterou dados.

## Abordagens consideradas

1. Manter o comportamento atual: rejeita apenas produtos novos, então uma opção antiga inválida pode deixar o Flow inteiro indisponível. Rejeitada.
2. Revalidar e bloquear todo o molde em qualquer salvamento: impede alterações úteis em cestas com etapas antigas pendentes. Rejeitada.
3. Na etapa alterada, revalidar todas as opções que permanecerão; exigir prontidão de cada opção que esteja ativa e habilitada para WhatsApp, limitar a oito elegíveis e permitir remover/corrigir a opção ruim. No cliente, antecipar o limite com as flags já carregadas. Escolhida por alinhar o editor com o emissor e permitir correção progressiva sem bloquear outras etapas.

## Decisões

- O servidor continua como autoridade e consulta os detalhes atuais de cada produto da etapa alterada antes de chamar o gateway de gravação.
- Produto ativo e habilitado para WhatsApp que não passe em `productIsReady()` retorna `product_not_ready`, mesmo que já estivesse salvo antes. O operador pode corrigir o produto ou removê-lo da etapa antes de salvar.
- Produtos inativos ou desabilitados para WhatsApp permanecem fora da contagem do Flow; não são tratados como alternativas elegíveis pelo emissor.
- A interface impede adicionar uma nova alternativa quando a etapa já contém oito opções ativas e habilitadas para WhatsApp. Se a projeção antiga ainda não informa a flag WhatsApp, conta a opção ativa como possivelmente habilitada até a RPC ser atualizada. O limite definitivo continua sendo conferido no servidor com o preço e a imagem atuais.
- Nenhum dado remoto é corrigido automaticamente; o editor não publica Flow, não envia mensagem e não chama Bling.

## Critérios de aceite

- Salvar uma etapa alterada com uma opção ativa/WhatsApp sem nome, foto ou preço atual válido falha com mensagem simples e não grava o molde.
- Remover essa opção e manter pelo menos uma alternativa pronta permite salvar a etapa.
- Produtos inativos ou sem habilitação WhatsApp não entram na contagem máxima de oito.
- A tentativa de adicionar a nona opção ativa/WhatsApp é interrompida antes da validação remota de produto, com orientação para remover uma opção.
- Typecheck, Biome focalizado e `git diff --check` passam; nenhum teste automatizado é executado.
- O estado read-only do Supabase permanece inalterado.
