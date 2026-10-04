# Design — Gravador OGG/Opus local para a Central de Atendimento

**Data:** 2026-10-04  
**Projeto:** Dona Antônia — Central de Atendimento WhatsApp própria  
**Escopo:** Task 9B — áudio outbound pelo Admin  
**Estado:** desenho conversacional aprovado; especificação escrita aguardando revisão humana antes do plano de implementação

## 1. Contexto e evidência

O gravador atual usa `MediaRecorder` nativo. No Edge/Chrome do operador, `MediaRecorder.isTypeSupported()` não oferece OGG/Opus nem AAC para gravação; a seleção cai no fallback MP4/AAC e gera `.m4a`/fMP4.

Dois canários reais 0975 → 1018 chegaram à Meta, receberam `provider_media_id` e WAMID, mas o webhook final marcou as mensagens como `failed`. O caso mais recente terminou com `message_type=audio`, `provider=meta`, `status_current=failed`, `mime_type=audio/mp4`. Portanto, aceitação inicial/WAMID não conta como homologação.

O WhatsApp Cloud API aceita áudio OGG apenas com codec Opus. O backend atual da Central já aceita `audio/ogg`, preserva o mesmo outbox, idempotência, canário e observação de status.

## 2. Objetivo

Permitir que o operador grave voz dentro do Atendimento e produza um arquivo **OGG/Opus determinístico**, inteiramente no navegador, antes de reutilizar o pipeline `send_media` existente.

Critérios de sucesso:

- gravação funciona no Edge/Chrome atual mesmo quando `MediaRecorder` nativo não oferece `audio/ogg`;
- arquivo final é `audio/ogg`, container Ogg válido e codec Opus;
- nenhuma conversão ocorre em serviço externo;
- nenhum token Meta, WABA, `phone_number_id` ou destino é exposto ao browser além do que já existe;
- envio continua passando por `admin-whatsapp-ops-v1`, outbox, canário, idempotência, WAMID e status canônico;
- falha no encoder local nunca faz fallback silencioso para M4A/fMP4;
- mídia live continua OFF até readiness server-side ficar verde.

## 3. Não objetivos

Este lote não deve:

- liberar mídia para clientes fora do canário 0975↔1018;
- ativar `meta_media_live_enabled`;
- ligar ANA, campanhas ou automações;
- alterar checkout, pedidos, estoque ou Bling;
- criar um serviço de transcodificação no Supabase;
- enviar áudio a CDN, API de terceiros ou serviço externo de mídia;
- substituir o pipeline Meta existente;
- homologar áudio apenas porque recebeu WAMID; o webhook final precisa atingir estado canônico válido.

## 4. Decisão arquitetural

### 4.1 Caminho nativo

Se o navegador suportar `audio/ogg;codecs=opus` nativamente, continuar usando `MediaRecorder` nativo. Esse é o caminho de menor custo e menor bundle.

### 4.2 Caminho worker/WASM

Quando OGG/Opus nativo não existir, usar um **encoder Opus em Web Worker/WASM, hospedado no próprio domínio**, para produzir OGG/Opus diretamente a partir do stream do microfone.

A implementação recomendada é um adapter isolado sobre `opus-media-recorder` 0.8.0, usando somente os artefatos necessários para Ogg/Opus (`OpusMediaRecorder`, worker e encoder Ogg/Opus/WASM), todos versionados e servidos pelo próprio `donaantonia.com.br`.

Motivos:

- produz `audio/ogg`/Opus diretamente, sem fMP4 intermediário;
- usa Web Worker/WASM e não bloqueia a thread principal durante a codificação;
- mantém a API semelhante a `MediaRecorder`, reduzindo alterações no gravador atual;
- licença MIT no wrapper, com dependências codec/container explicitamente licenciadas no pacote;
- não exige backend adicional.

### 4.3 O que muda em relação ao desenho inicial WebM → OGG

O desenho inicial aprovado previa gravar WebM/Opus e depois remuxar/transcodificar para OGG/Opus. A especificação substitui esse estágio por **codificação OGG/Opus direta no worker**, porque é mais simples e robusta:

- elimina demux de WebM;
- elimina uma segunda passagem sobre o áudio;
- reduz estados intermediários;
- reduz risco de erro de container;
- mantém a mesma propriedade essencial aprovada: processamento 100% local antes do envio.

## 5. Dependência e distribuição

Não usar CDN em produção.

Os artefatos necessários serão mantidos em diretório próprio, por exemplo:

`vitrine/admin/atendimento/vendor/opus-media-recorder/`

Regras:

- versão fixada; nunca `latest`;
- arquivos JS/worker/WASM servidos same-origin;
- LICENSE/NOTICE do pacote e dependências incluídos no repositório;
- hash/tamanho dos artefatos cobertos por teste ou manifesto para detectar alteração acidental;
- carregamento **lazy** apenas quando o usuário toca em “Gravar áudio” e OGG nativo não está disponível;
- nenhum download de código de terceiros durante o atendimento.

## 6. Fluxo detalhado

1. Operador seleciona uma conversa.
2. Clica em **Gravar áudio**.
3. O módulo resolve o encoder:
   - `native-ogg-opus`, se disponível;
   - `worker-ogg-opus`, caso contrário.
4. Somente então solicita `getUserMedia({audio:true})`.
5. O áudio é gravado a aproximadamente 64 kbps, mono quando suportado pelo encoder.
6. Ao clicar **Parar**, a UI entra em `encoding/finalizing` enquanto o worker fecha Ogg pages/headers.
7. O resultado precisa ser um `File` `.ogg` com `type='audio/ogg'`.
8. Antes de expor “Enviar áudio”, o cliente faz uma validação barata do container:
   - tamanho > 0;
   - início `OggS`;
   - presença de `OpusHead` na região inicial esperada.
9. O player de preview recebe o mesmo `File` final.
10. “Enviar áudio” dispara o evento já existente `attendance:send-recorded-audio`.
11. `attendance-media-send.js` usa o `File` sem rota nova.
12. Backend aplica novamente validação, janela de 24h, canário, destino server-side, outbox e idempotência.
13. UI acompanha Aceito → Enviado → Entregue/Lido/Falhou pelo WAMID canônico.

## 7. Estados de UX

O painel do gravador deve representar explicitamente:

- `idle` — pronto para gravar;
- `requesting_permission` — solicitando microfone;
- `recording` — cronômetro ativo;
- `finalizing` — “Preparando áudio OGG/Opus…”;
- `ready` — “Áudio pronto (OGG/Opus)” + preview + Enviar áudio;
- `sending` — botão bloqueado e feedback do envio;
- `error_permission` — orientação para liberar microfone;
- `error_encoder` — não enviar M4A automaticamente; oferecer tentar novamente ou Anexar;
- `cancelled` — liberar stream, worker e object URL.

Acessibilidade:

- `aria-live` nos estados de gravação/finalização/erro;
- controles navegáveis por teclado;
- botão de envio desabilitado até arquivo OGG validado;
- cronômetro existente preservado.

## 8. Segurança e privacidade

- áudio permanece local até o clique em “Enviar áudio”;
- worker e WASM same-origin;
- sem CDN/runtime externo;
- sem `service_role`, token Meta ou segredo no browser;
- destino continua derivado de `conversation_id` no servidor;
- canário de mídia continua estrito 0975↔1018;
- `meta_media_live_enabled=false` durante desenvolvimento/homologação;
- encoder não pode abrir sockets/fetch para terceiros;
- streams, workers e `ObjectURL`s devem ser encerrados/revogados em cancelar, trocar conversa, erro e unload;
- arquivos acima do limite atual do pipeline continuam bloqueados pelas validações existentes.

## 9. Compatibilidade e fallback

Ordem:

1. `MediaRecorder` nativo OGG/Opus;
2. encoder OGG/Opus local via Worker/WASM;
3. erro explícito + opção **Anexar**.

**Não haverá fallback automático para MP4/M4A no gravador.** O M4A manual existente pode permanecer aceito pelo seletor de arquivo para não criar regressão fora do gravador, mas não contará como homologação até existir evidência Meta válida.

## 10. Performance

- WASM/worker só carregam no primeiro uso do gravador em navegador sem OGG nativo;
- nenhum custo adicional no carregamento inicial da Central;
- codificação ocorre fora da main thread;
- meta inicial: 64 kbps para voz;
- não usar SharedArrayBuffer/threads múltiplas: um worker simples evita exigir novos headers COOP/COEP;
- ao terminar/cancelar, worker deve ser encerrado quando a biblioteca permitir ou reutilizado de forma controlada apenas enquanto a página estiver aberta.

## 11. Observabilidade

No browser, o evento `attendance:recorded-audio-ready` deve carregar também informações diagnósticas não sensíveis:

- `recording_container: 'ogg'`;
- `recording_codec: 'opus'`;
- `recording_encoder: 'native' | 'worker'`;
- tamanho final.

Esses campos podem ser usados na UI/log local. Não é obrigatório criar schema novo no banco para este lote.

No Supabase, a evidência final continua sendo a já existente:

- `provider='meta'`;
- `message_type='audio'`;
- `provider_message_id`/WAMID;
- status canônico não falho;
- metadata do arquivo `audio/ogg`;
- zero duplicação do WAMID;
- fila limpa.

## 12. TDD e validação

### 12.1 Contratos automatizados

Adicionar/estender testes para exigir:

- caminho nativo OGG/Opus primeiro;
- fallback Worker/WASM quando OGG nativo for indisponível;
- assets versionados e same-origin;
- ausência de CDN no runtime;
- gravador não produz `.m4a` como fallback de envio;
- resultado do worker vira `File(.ogg, audio/ogg)`;
- validação `OggS` + `OpusHead` antes de habilitar envio;
- falha do worker mantém o envio desabilitado;
- troca de conversa cancela gravação e descarrega estado;
- nenhum `graph.facebook.com` no browser;
- pipeline `attendance:recorded-audio-ready` / `attendance:send-recorded-audio` preservado;
- sintaxe JS dos novos módulos;
- guard de segredos existente continua verde.

### 12.2 Teste do encoder

Incluir fixture curta/sintética sem dado real para provar que a saída do adapter tem:

- assinatura `OggS`;
- `OpusHead`;
- MIME `audio/ogg`;
- tamanho > 0.

Quando o CI não puder instanciar áudio real de navegador, o contrato deve testar o adapter/worker de forma determinística e deixar a captura real para o canário autenticado.

### 12.3 Gate humano final

Depois do CI e merge:

1. Ctrl+F5 no Admin;
2. gravar 2–5 s no 0975 → 1018;
3. UI deve exibir **OGG/Opus** antes do envio;
4. enviar uma única vez;
5. verificar Supabase/WAMID/status/dedupe/fila;
6. repetir 1018 → 0975 para fechar readiness bilateral;
7. somente após ambos passarem considerar Task 9B homologada.

## 13. Rollback

Rollback deve ser simples e sem migration:

- reverter módulo do gravador/adapter e referências aos assets vendor;
- manter pipeline de mídia/backend intactos;
- manter `meta_media_live_enabled=false`;
- não apagar evidências históricas dos canários;
- se o worker apresentar regressão, desabilitar gravação e manter Anexar/Biblioteca funcionando.

## 14. Alternativas consideradas

### A. WebM/Opus → OGG remux no browser

Viável, mas exige demux WebM + mux Ogg e aumenta superfície de erro. Ferramentas como libav.js são robustas e mantidas, porém adicionam mais artefatos/licenciamento e são excessivas para um gravador de voz simples.

### B. Transcodificação no Supabase/servidor

Rejeitada nesta fase: aumenta custo, tempo, dependência de runtime multimídia e superfície de privacidade; também transforma uma falha de compatibilidade do navegador em infraestrutura permanente.

### C. Continuar ajustando MIME do M4A

Rejeitada: dois canários reais demonstraram que mudar o MIME não resolve o container fMP4 gerado pelo navegador; a Meta cria WAMID e depois retorna falha de mídia.

## 15. Arquivos previstos

Provavelmente:

- `vitrine/admin/atendimento/attendance-audio-recorder.js` — seleção do encoder/estados;
- `vitrine/admin/atendimento/attendance-audio-ogg-worker-adapter.js` — adapter isolado;
- `vitrine/admin/atendimento/vendor/opus-media-recorder/*` — artefatos pinados + licença;
- `scripts/test-attendance-audio-recorder-v2.mjs` — contratos;
- `.github/workflows/whatsapp-meta-central-ci.yml` — inclusão do novo teste;
- `docs/RETOMADA-WHATSAPP-CENTRAL-PROPRIA.md` — checkpoint após implementação.

Nenhuma migration é esperada para este design.

## 16. Critério de conclusão

Este design só está concluído operacionalmente quando:

- o Admin produz OGG/Opus no Edge/Chrome usado pelo operador;
- canário 0975 → 1018 alcança status canônico de entrega sem erro de mídia;
- canário 1018 → 0975 também alcança status canônico válido;
- WAMID não duplica;
- fila fica limpa;
- readiness server-side reconhece áudio nos dois canais;
- `meta_media_live_enabled` continua OFF até decisão posterior de graduação.
