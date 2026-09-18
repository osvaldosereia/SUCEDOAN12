# Play Store Checklist — App Dona Antônia

**Estado:** DRAFT / HOMOLOGAÇÃO / NÃO PUBLICAR
**Plataforma:** Android
**Produção:** OFF

Este checklist prepara a Rodada 24 sem abrir Internal Testing, Closed Testing, Open Testing ou produção.

## Pré-condições técnicas

- [ ] projeto Android real gerado pelo Capacitor;
- [ ] target API 36+ confirmado no projeto gerado;
- [ ] APK debug real aprovado;
- [ ] AAB real gerado e inspecionado;
- [ ] smoke test em emulador/aparelho real;
- [ ] Keystore/armazenamento criptografado homologado;
- [ ] Android App Links homologados apenas no host aprovado;
- [ ] Photo Picker usado quando aplicável;
- [ ] câmera/microfone testados somente após ação explícita;
- [ ] push FCM testado somente em aparelho interno;
- [ ] nenhum segredo no APK/AAB;
- [ ] nenhum endpoint de produção habilitado;
- [ ] pedidos reais OFF;
- [ ] marketing push OFF.

## Data Safety e política

- [ ] Data Safety preenchido somente após congelar o build;
- [ ] práticas dos SDKs incluídas;
- [ ] Política de Privacidade final;
- [ ] exclusão/correção/acesso testados;
- [ ] dados de conta e histórico protegidos por sessão validada;
- [ ] nenhum ID de publicidade;
- [ ] nenhum tracking cross-app;
- [ ] nenhum acesso amplo à galeria sem necessidade.

## Listing

- [ ] nome final;
- [ ] descrição curta;
- [ ] descrição completa;
- [ ] categoria;
- [ ] contato/suporte;
- [ ] ícone;
- [ ] feature graphic;
- [ ] screenshots somente com dados TEST;
- [ ] conteúdo/classificação revisados;
- [ ] perfil de reviewer/tester exclusivamente sintético.

## Gate

Sem APK/AAB realmente gerado e testado, o estado obrigatório é **NÃO PRONTO PARA PLAY TESTING/SUBMISSÃO**.
