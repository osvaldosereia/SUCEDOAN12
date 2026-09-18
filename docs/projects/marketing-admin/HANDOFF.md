# HANDOFF — Marketing Admin Dona Antônia

**Leia este arquivo primeiro em qualquer nova janela.**

## Comando de retomada

> Acesse o GitHub `osvaldosereia/SUCEDOAN12` e o Supabase `ssbesxgaijknwsjbsbcz`. Trabalhe somente no projeto **Marketing Admin / Organic Social**. Leia `docs/projects/marketing-admin/README.md`, `CURRENT-STATE.md`, `PROJECT-MASTER.md`, `ROADMAP.md`, `DECISIONS-AND-GUARDRAILS.md` e `TECHNICAL-INVENTORY.md`. Busque o HEAD atual antes de editar. Continue da Rodada 8 — Connection Manager / descoberta de credenciais no Make. Não abrir publicação externa sem canary explícito e não misturar este projeto com Customer & Marketing OS.

## Estado salvo em 18/09/2026

- visual V1 homologado;
- 5 formatos piloto gerados;
- Reel real 10s homologado;
- JPEGs provider-ready homologados;
- MP4 provider-ready H.264 + AAC 48 kHz homologado;
- produção/aprovação/versionamento implementados;
- adapters oficiais Instagram/Facebook/Pinterest implantados;
- WhatsApp Status e Facebook Story mantidos em fluxo manual;
- Gerenciador de Conexões OAuth implementado;
- OAuth endurecido com cleanup de segredos temporários;
- `admin-marketing-workflow-v1` ativo v15, JWT=true;
- `admin-marketing-media-v1` ativo v10, JWT=true;
- `admin-marketing-insights-v1` ativo v15, JWT=true;
- publishing OFF;
- execution_mode=off;
- kill_switch=true;
- max_daily_publications=0;
- todos os gates por canal=false;
- publication jobs reais=0;
- published jobs=0;
- external side effects=0.

## Descobertas Make — ponto exato

Make:
- organização: `6493671`;
- team: `975208`.

Facebook/Instagram:
- conexão Make `7490477`: saudável;
- conexão Make `7650626`: saudável;
- Facebook Page Dona Antônia: **Super Cestas**, ID `1928140920768577`;
- Instagram profissional Dona Antônia: **Super Cestas (@dona_antonia_cuiaba)**, ID `17841451162237654`.

Pinterest:
- conexão Make existente: `7490792`, nome “My pinterest connection”;
- a conexão existe, mas falhou ao listar boards e provavelmente precisa reautorização;
- ainda não há board ID confirmado.

Importante: conexões do Make provam IDs/contas e podem ser usadas como referência ou proxy, mas não expõem o token OAuth bruto para copiar para o nosso Vault.

## Próxima ação segura

1. confirmar callback público `https://donaantonia.com.br/admin/marketing-oauth-callback.html`;
2. salvar no runtime os IDs Meta já confirmados pelo Make;
3. decidir estratégia de credencial Meta:
   - preferida: OAuth próprio do Admin + Vault;
   - alternativa temporária: Make como proxy oficial, sem copiar token;
4. localizar App ID Meta já existente; se não existir, cadastrar no Gerenciador;
5. validar Graph API version oficialmente;
6. para Pinterest, procurar cenários/segredos antigos no Make e tentar recuperar board ID; conexão 7490792 precisa reautorização se for usada;
7. manter todos os gates externos OFF;
8. só depois preparar um único asset aprovado;
9. abrir CANARY de um canal, limite diário 1;
10. publicar uma única peça, validar external_ref/métrica e fechar o gate novamente.

## Não fazer

- não ligar publishing geral;
- não ligar todos os canais de uma vez;
- não inventar Graph API version;
- não copiar token em frontend, commit ou chat;
- não usar endpoint não documentado de WhatsApp Status;
- não misturar Marketing Admin com Customer & Marketing OS;
- não criar vídeo generativo caro nesta fase;
- não regenerar imagem por IA sem necessidade;
- não habilitar cron de publicação enquanto canary não estiver concluído.

## Regra

Ao terminar a próxima rodada, atualizar este HANDOFF e CURRENT-STATE.
